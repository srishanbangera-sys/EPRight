import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireRole, bad, num, str, date, fyParam, notFound, forbidden } from '../http.js';
import { settings, makeChecker, runSafetyCheck, recyclerProfile, listingRow, getOrg, medianPrice } from '../services/domain.js';
import { writeEvent } from '../services/audit.js';
import { effectiveCost, reliabilityOf, buildBasket } from '../lib/basket.js';
import { today } from '../lib/fy.js';
import { placeOrder } from './orders.js';

const r = Router();

const VISIBLE = `l.status = 'ACTIVE' AND l.tonnes_available > 0 AND o.status IN ('VERIFIED','AT_RISK')`;

export function visibleListings() {
  return all(`SELECT l.* FROM listings l JOIN organizations o ON o.id = l.recycler_id WHERE ${VISIBLE} ORDER BY l.id`);
}

function capacityLeft(recyclerId, excludeListingId = null) {
  const org = getOrg(recyclerId);
  const listed = get(`SELECT COALESCE(SUM(tonnes_available),0) AS t FROM listings WHERE recycler_id = ? AND status = 'ACTIVE' ${excludeListingId ? 'AND id != ?' : ''}`, ...(excludeListingId ? [recyclerId, excludeListingId] : [recyclerId])).t;
  const open = get("SELECT COALESCE(SUM(tonnes),0) AS t FROM orders WHERE recycler_id = ? AND status IN ('PLACED','ACCEPTED','PAID_ESCROW','IN_PROGRESS','OVERDUE')", recyclerId).t;
  return { capacity: org.monthly_capacity_t || 0, listed, open, left: Math.max(0, (org.monthly_capacity_t || 0) - listed - open) };
}

// ---------- Marketplace ----------
r.get('/listings', (req, res) => {
  const q = req.query;
  if (req.user.role === 'RECYCLER' || q.mine) {
    if (req.user.role !== 'RECYCLER') throw forbidden();
    const rows = all('SELECT * FROM listings WHERE recycler_id = ? ORDER BY id DESC', req.user.organization_id);
    const sold = all("SELECT listing_id, COALESCE(SUM(tonnes),0) AS t, COUNT(*) AS n FROM orders WHERE recycler_id = ? AND status NOT IN ('REJECTED','CANCELLED','REFUNDED','EXPIRED') GROUP BY listing_id", req.user.organization_id);
    return res.json({ listings: rows.map((l) => ({ ...l, ordered_tonnes: sold.find((s) => s.listing_id === l.id)?.t || 0, orders: sold.find((s) => s.listing_id === l.id)?.n || 0 })), capacity: capacityLeft(req.user.organization_id) });
  }

  const fy = fyParam(q.year, settings.currentFy());
  const producerId = req.user.role === 'PRODUCER' ? req.user.organization_id : null;
  const needOnly = q.need_only !== 'false' && !!producerId;
  const verifiedOnly = q.verified_only === 'true';
  const checker = producerId ? makeChecker(producerId, fy) : null;

  let rows = visibleListings();
  if (q.category) rows = rows.filter((l) => l.category === q.category);
  if (q.min_price) rows = rows.filter((l) => l.price_per_tonne >= Number(q.min_price));
  if (q.max_price) rows = rows.filter((l) => l.price_per_tonne <= Number(q.max_price));
  if (q.completion_before) rows = rows.filter((l) => l.expected_completion <= q.completion_before);
  if (needOnly) rows = rows.filter((l) => (checker.remaining[l.category] || 0) > 0);

  const cards = rows.map((l) => {
    const rec = checker ? checker.profile(l.recycler_id) : recyclerProfile(l.recycler_id);
    const remaining = checker ? checker.remaining[l.category] || 0 : 0;
    const qty = remaining > 0 ? Math.min(remaining, l.tonnes_available) : Math.min(1, l.tonnes_available);
    const safety = checker ? checker.check(l, qty) : null;
    return {
      ...l,
      recycler: { id: rec.id, name: rec.name, status: rec.status, location: rec.location, avgRating: rec.avgRating, ratingCount: rec.ratingCount, onTimeRate: rec.onTimeRate, completedOrders: rec.completedOrders, docs_valid_until: rec.docs_valid_until, is_sample: rec.is_sample },
      suggested_tonnes: Math.round(qty * 1000) / 1000,
      safety: safety && { status: safety.status, score: safety.score, headline: safety.reasons.find((x) => x.severity === 'FAIL' || x.severity === 'WARN')?.text || 'All checks passed.', counts: { fail: safety.reasons.filter((x) => x.severity === 'FAIL').length, warn: safety.reasons.filter((x) => x.severity === 'WARN').length } },
      risk_adjusted: effectiveCost(l.price_per_tonne, 0.3, reliabilityOf(rec)),
    };
  }).filter((c) => (!q.min_rating || (c.recycler.avgRating ?? 0) >= Number(q.min_rating)) && (!verifiedOnly || c.recycler.status === 'VERIFIED'));

  const rank = { GREEN: 0, AMBER: 1, RED: 2 };
  const sort = q.sort || 'recommended';
  cards.sort((a, b) => {
    if (sort === 'price') return a.price_per_tonne - b.price_per_tonne;
    if (sort === 'date') return a.expected_completion.localeCompare(b.expected_completion);
    if (sort === 'rating') return (b.recycler.avgRating ?? 0) - (a.recycler.avgRating ?? 0);
    return (rank[a.safety?.status] ?? 0) - (rank[b.safety?.status] ?? 0) || a.risk_adjusted - b.risk_adjusted;
  });

  // What is hidden and why (expired / unverified recyclers never appear).
  const hidden = all(`SELECT o.name, o.status, COUNT(l.id) AS n FROM listings l JOIN organizations o ON o.id = l.recycler_id
    WHERE l.tonnes_available > 0 AND (l.status = 'HIDDEN' OR o.status NOT IN ('VERIFIED','AT_RISK')) GROUP BY o.id`);

  if (producerId && cards.length) {
    writeEvent(req.user, 'SAFETY_CHECK_BATCH', 'marketplace', fy, {
      financial_year: fy, remaining: checker.remaining,
      results: cards.map((c) => ({ listing_id: c.id, tonnes: c.suggested_tonnes, status: c.safety.status, score: c.safety.score })),
    });
  }
  res.json({ listings: cards, remaining: checker?.remaining || null, financial_year: fy, need_only: needOnly, hidden, categories: settings.categories() });
});

r.get('/listings/:id', (req, res) => {
  const l = listingRow(Number(req.params.id));
  if (!l) throw notFound('Listing');
  const recycler = recyclerProfile(l.recycler_id);
  const visible = l.status === 'ACTIVE' && ['VERIFIED', 'AT_RISK'].includes(recycler.status);
  if (!visible && !(req.user.role === 'RECYCLER' && req.user.organization_id === l.recycler_id) && req.user.role !== 'ADMIN') {
    throw notFound('Listing (it may be hidden because the recycler is not verified)');
  }
  let safety = null;
  if (req.user.role === 'PRODUCER') {
    const fy = fyParam(req.query.year, settings.currentFy());
    const { remaining } = makeChecker(req.user.organization_id, fy);
    const rem = remaining[l.category] || 0;
    const tonnes = req.query.tonnes ? num(req.query.tonnes, 'Tonnes', { min: 0.001 }) : (rem > 0 ? Math.min(rem, l.tonnes_available) : Math.min(1, l.tonnes_available));
    safety = runSafetyCheck({ producerId: req.user.organization_id, listing: l, tonnes, fy, actor: req.user });
  }
  const ratings = all('SELECT r.score, r.comment, r.created_at, o.name AS from_name FROM ratings r JOIN organizations o ON o.id = r.from_org WHERE r.to_org = ? ORDER BY r.id DESC LIMIT 5', l.recycler_id);
  res.json({ listing: l, recycler, safety, ratings, median_price: medianPrice(l.category) });
});

r.post('/listings', requireRole('RECYCLER'), (req, res) => {
  const org = getOrg(req.user.organization_id);
  const b = req.body;
  if (!['VERIFIED', 'AT_RISK'].includes(org.status)) throw bad(`Your organisation must be VERIFIED with valid documents to list credits (current status: ${org.status}).`);
  const category = str(b.category, 'Category');
  if (!settings.categoryCodes().includes(category)) throw bad('Unknown category');
  if (!org.categories.includes(category)) throw bad(`You are not registered for Category ${category}. Registered: ${org.categories.join(', ')}`);
  const tonnes = num(b.tonnes, 'Tonnes', { min: 1, max: 100000 });
  const price = num(b.price_per_tonne, 'Price per tonne', { min: 1, max: 1000000 });
  const completion = date(b.expected_completion, 'Expected completion date');
  if (completion < today()) throw bad('Expected completion must be today or later');
  const cap = capacityLeft(org.id);
  if (tonnes > cap.left) throw bad(`Tonnes exceed your remaining declared capacity (${cap.left} t left of ${cap.capacity} t/month).`);
  const ins = run('INSERT INTO listings (recycler_id, category, tonnes_total, tonnes_available, price_per_tonne, expected_completion, facility, status) VALUES (?,?,?,?,?,?,?,?)',
    org.id, category, tonnes, tonnes, price, completion, str(b.facility, 'Facility', { required: false }) || org.location, 'ACTIVE');
  const id = Number(ins.lastInsertRowid);
  writeEvent(req.user, 'LISTING_CREATED', 'listing', id, { category, tonnes, price_per_tonne: price, expected_completion: completion });
  res.status(201).json(listingRow(id));
});

r.put('/listings/:id', requireRole('RECYCLER'), (req, res) => {
  const l = listingRow(Number(req.params.id));
  if (!l || l.recycler_id !== req.user.organization_id) throw notFound('Listing');
  const b = req.body;
  const price = b.price_per_tonne != null ? num(b.price_per_tonne, 'Price', { min: 1 }) : l.price_per_tonne;
  const completion = b.expected_completion ? date(b.expected_completion, 'Expected completion') : l.expected_completion;
  let available = l.tonnes_available;
  let total = l.tonnes_total;
  if (b.tonnes_available != null) {
    available = num(b.tonnes_available, 'Tonnes available', { min: 0 });
    const cap = capacityLeft(l.recycler_id, l.id);
    if (available > cap.left) throw bad(`Tonnes exceed your remaining declared capacity (${cap.left} t left).`);
    total = l.tonnes_total + (available - l.tonnes_available);
  }
  let status = b.status && ['ACTIVE', 'HIDDEN'].includes(b.status) ? b.status : l.status;
  const org = getOrg(l.recycler_id);
  if (status === 'ACTIVE' && !['VERIFIED', 'AT_RISK'].includes(org.status)) throw bad('Listing cannot be activated until your documents are verified.');
  if (available <= 0) status = 'SOLD_OUT';
  else if (l.status === 'SOLD_OUT' && status === 'SOLD_OUT') status = 'ACTIVE';
  run('UPDATE listings SET price_per_tonne = ?, expected_completion = ?, tonnes_available = ?, tonnes_total = ?, status = ? WHERE id = ?', price, completion, available, total, status, l.id);
  writeEvent(req.user, 'LISTING_UPDATED', 'listing', l.id, { price_per_tonne: price, expected_completion: completion, tonnes_available: available, status });
  res.json(listingRow(l.id));
});

// ---------- Safety Check ----------
r.post('/safety-check', requireRole('PRODUCER'), (req, res) => {
  const l = listingRow(num(req.body.listing_id, 'Listing'));
  if (!l) throw notFound('Listing');
  const tonnes = num(req.body.tonnes, 'Tonnes', { min: 0.001 });
  const fy = fyParam(req.body.year, settings.currentFy());
  res.json(runSafetyCheck({ producerId: req.user.organization_id, listing: l, tonnes, fy, actor: req.user }));
});

// ---------- Smart Basket ----------
function computeBasket(req) {
  const fy = fyParam(req.body.year, settings.currentFy());
  const preference = ['CHEAPEST', 'BALANCED', 'SAFEST'].includes(req.body.preference) ? req.body.preference : 'BALANCED';
  const deadline = req.body.deadline ? date(req.body.deadline, 'Deadline') : settings.deadline(fy);
  const checker = makeChecker(req.user.organization_id, fy);
  const listings = visibleListings().map((l) => ({ listing: l, recycler: checker.profile(l.recycler_id) }));
  const basket = buildBasket({ remainingByCategory: checker.remaining, deadline, preference, listings, check: checker.check, rates: settings.rates(), minOrders: settings.thresholds().on_time_min_orders });
  return { ...basket, financial_year: fy, remaining: checker.remaining };
}

r.post('/basket', requireRole('PRODUCER'), (req, res) => {
  const basket = computeBasket(req);
  writeEvent(req.user, 'SMART_BASKET_COMPUTED', 'basket', basket.financial_year, {
    preference: basket.preference, deadline: basket.deadline, remaining: basket.remaining,
    lines: basket.lines.map((l) => ({ listing_id: l.listing_id, tonnes: l.tonnes, safety: l.safety.status })),
    total_cost: basket.total_cost, shortfall: basket.shortfall,
  });
  res.json(basket);
});

r.post('/basket/place', requireRole('PRODUCER'), (req, res) => {
  const fy = fyParam(req.body.year, settings.currentFy());
  const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
  if (!lines.length) throw bad('The basket is empty');
  const results = [];
  for (const line of lines) {
    try {
      const order = placeOrder({ user: req.user, listingId: num(line.listing_id, 'Listing'), tonnes: num(line.tonnes, 'Tonnes', { min: 0.001 }), fy, confirmAmber: true, via: 'SMART_BASKET' });
      results.push({ listing_id: line.listing_id, ok: true, order_id: order.id, status: order.status });
    } catch (e) {
      results.push({ listing_id: line.listing_id, ok: false, error: e.message, safety: e.details?.safety });
    }
  }
  res.json({ results, placed: results.filter((x) => x.ok).length });
});

export default r;
