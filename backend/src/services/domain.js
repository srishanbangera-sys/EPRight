// Domain helpers that read the DB and feed the pure rule functions.
import { all, get, run, getSetting, parseJson } from '../db.js';
import { today, daysBetween, fyRange } from '../lib/fy.js';
import { computeObligations, computeProgress, exposure } from '../lib/obligation.js';
import { safetyCheck, DEFAULT_THRESHOLDS } from '../lib/safetyCheck.js';
import { writeEvent, SYSTEM } from './audit.js';

export const REQUIRED_DOCS = {
  PRODUCER: ['REGISTRATION_CERTIFICATE'],
  RECYCLER: ['REGISTRATION_CERTIFICATE', 'CONSENT_TO_OPERATE'],
};

export const settings = {
  categories: () => getSetting('categories', []),
  categoryCodes: () => getSetting('categories', []).map((c) => c.code),
  currentFy: () => getSetting('current_fy', '2026-27'),
  thresholds: () => ({ ...DEFAULT_THRESHOLDS, at_risk_days: 30, low_confidence: 0.7, deadline_alert_days: 365, ...getSetting('thresholds', {}) }),
  rates: () => getSetting('compensation_rates', [5000, 10000, 20000]),
  deadline: (fy) => (getSetting('filing_deadline_by_year', {})[fy]) || `${parseInt(fy.slice(0, 4), 10) + 1}-06-30`,
  autoRelease: () => getSetting('auto_release', true),
  aiEnabled: () => getSetting('ai_enabled', true),
};

export function targetsFor(fy) {
  const rows = all('SELECT category, target_pct FROM settings_targets WHERE financial_year = ?', fy);
  return Object.fromEntries(rows.map((r) => [r.category, r.target_pct]));
}

export function orgPublic(o) {
  if (!o) return null;
  return { ...o, categories: parseJson(o.categories, []) };
}

export function getOrg(id) {
  return orgPublic(get('SELECT * FROM organizations WHERE id = ?', id));
}

// ---------- Verification status ----------

/** Decide an organization's status from its documents (Spec 7 stage 1, 9.1). */
export function deriveOrgStatus(org, docs, onDate = today()) {
  const required = REQUIRED_DOCS[org.type] || [];
  const atRiskDays = settings.thresholds().at_risk_days;
  const perType = required.map((type) => {
    const ofType = docs.filter((d) => d.type === type);
    const approved = ofType.filter((d) => d.status === 'APPROVED' || d.status === 'EXPIRED').sort((a, b) => (b.valid_to || '').localeCompare(a.valid_to || ''));
    if (approved.length) {
      const best = approved[0];
      if (best.valid_to < onDate) return 'EXPIRED';
      if (daysBetween(onDate, best.valid_to) <= atRiskDays) return 'AT_RISK';
      return 'VERIFIED';
    }
    if (ofType.some((d) => d.status === 'PENDING')) return 'PENDING';
    if (ofType.some((d) => d.status === 'REJECTED')) return 'REJECTED';
    return 'PENDING';
  });
  for (const s of ['EXPIRED', 'REJECTED', 'PENDING', 'AT_RISK']) if (perType.includes(s)) return s;
  return 'VERIFIED';
}

export function docsOf(orgId) {
  return all('SELECT * FROM documents WHERE organization_id = ? ORDER BY id DESC', orgId);
}

/** Documents that the Safety Check considers: the best approved doc of each required type. */
export function effectiveDocs(org) {
  const docs = docsOf(org.id);
  return (REQUIRED_DOCS[org.type] || []).map((type) => {
    const ofType = docs.filter((d) => d.type === type);
    const approved = ofType.filter((d) => d.status === 'APPROVED' || d.status === 'EXPIRED').sort((a, b) => (b.valid_to || '').localeCompare(a.valid_to || ''));
    return approved[0] || ofType[0] || { type, status: 'MISSING', valid_to: null };
  });
}

export function wasVerifiedOn(recyclerId, date) {
  const org = getOrg(recyclerId);
  if (!org) return false;
  const docs = docsOf(recyclerId);
  return (REQUIRED_DOCS[org.type] || []).every((type) => docs.some((d) => d.type === type && (d.status === 'APPROVED' || d.status === 'EXPIRED') && d.valid_from <= date && d.valid_to >= date));
}

// ---------- Alerts ----------

export function addAlert({ org_id = null, user_id = null, audience_role = null, type, severity = 'info', message, link = null, dedupe_key = null }) {
  try {
    run('INSERT INTO alerts (org_id, user_id, audience_role, type, severity, message, link, dedupe_key) VALUES (?,?,?,?,?,?,?,?)',
      org_id, user_id, audience_role, type, severity, message, link, dedupe_key);
  } catch (e) {
    if (!String(e.message).includes('UNIQUE')) throw e;
  }
}

/** Recompute status for every org, hide/unhide listings, mark overdue orders, raise alerts (Spec 7 continuous check). */
export function runExpiryCheck(actor = SYSTEM) {
  const d = today();
  const changes = [];
  const orgs = all("SELECT * FROM organizations WHERE type IN ('PRODUCER','RECYCLER')");
  for (const o of orgs) {
    const docs = docsOf(o.id);
    for (const doc of docs) {
      if (doc.status === 'APPROVED' && doc.valid_to < d) {
        run("UPDATE documents SET status = 'EXPIRED' WHERE id = ?", doc.id);
      }
    }
    const next = deriveOrgStatus(o, docsOf(o.id), d);
    if (next !== o.status && !(o.status === 'REJECTED' && next === 'PENDING')) {
      run('UPDATE organizations SET status = ? WHERE id = ?', next, o.id);
      changes.push({ org_id: o.id, name: o.name, from: o.status, to: next });
    }
    if (o.type === 'RECYCLER') {
      const status = next;
      const openOrders = all("SELECT * FROM orders WHERE recycler_id = ? AND status IN ('PLACED','ACCEPTED','PAID_ESCROW','IN_PROGRESS','OVERDUE')", o.id);
      if (status === 'EXPIRED' || status === 'REJECTED' || status === 'PENDING') {
        const hid = run("UPDATE listings SET status = 'HIDDEN' WHERE recycler_id = ? AND status = 'ACTIVE'", o.id);
        if (hid.changes) changes.push({ org_id: o.id, name: o.name, listings_hidden: hid.changes });
        for (const ord of openOrders) {
          addAlert({ org_id: ord.producer_id, type: 'RECYCLER_DOC_EXPIRED', severity: 'danger', message: `${o.name}'s documents have expired. Your open order #${ord.id} is at risk: credits from them may not count. Consider raising a dispute for a refund.`, link: `/orders/${ord.id}`, dedupe_key: `exp-${o.id}-${ord.id}` });
        }
      } else {
        if (status === 'VERIFIED' || status === 'AT_RISK') {
          run("UPDATE listings SET status = 'ACTIVE' WHERE recycler_id = ? AND status = 'HIDDEN' AND tonnes_available > 0", o.id);
        }
        if (status === 'AT_RISK') {
          const exp = effectiveDocs(getOrg(o.id)).map((x) => x.valid_to).filter(Boolean).sort()[0];
          addAlert({ org_id: o.id, type: 'DOC_EXPIRING', severity: 'warning', message: `Your document expires on ${exp}. Upload a renewed document to stay listed.`, link: '/recycler/profile', dedupe_key: `self-exp-${o.id}-${exp}` });
          for (const ord of openOrders) {
            addAlert({ org_id: ord.producer_id, type: 'RECYCLER_DOC_EXPIRING', severity: 'warning', message: `${o.name}'s documents expire on ${exp}. Your open order #${ord.id} should be delivered before then.`, link: `/orders/${ord.id}`, dedupe_key: `risk-${o.id}-${ord.id}-${exp}` });
          }
        }
      }
    }
  }
  // Overdue orders
  const overdue = all("SELECT * FROM orders WHERE status IN ('PAID_ESCROW','IN_PROGRESS') AND expected_completion < ?", d);
  for (const ord of overdue) {
    run("UPDATE orders SET status = 'OVERDUE', updated_at = ? WHERE id = ?", new Date().toISOString(), ord.id);
    writeEvent(actor.role === 'SYSTEM' ? SYSTEM : actor, 'ORDER_OVERDUE', 'order', ord.id, { from: ord.status, to: 'OVERDUE', expected_completion: ord.expected_completion }, [ord.producer_id, ord.recycler_id]);
    addAlert({ org_id: ord.producer_id, type: 'ORDER_OVERDUE', severity: 'warning', message: `Order #${ord.id} is past its expected completion date (${ord.expected_completion}).`, link: `/orders/${ord.id}`, dedupe_key: `overdue-p-${ord.id}` });
    addAlert({ org_id: ord.recycler_id, type: 'ORDER_OVERDUE', severity: 'warning', message: `Order #${ord.id} is overdue. Deliver the credit as soon as possible.`, link: `/orders/${ord.id}`, dedupe_key: `overdue-r-${ord.id}` });
    changes.push({ order_id: ord.id, to: 'OVERDUE' });
  }
  // Filing deadline alerts
  const fy = settings.currentFy();
  const deadline = settings.deadline(fy);
  const left = daysBetween(d, deadline);
  if (left >= 0 && left <= settings.thresholds().deadline_alert_days) {
    for (const p of all("SELECT id FROM organizations WHERE type = 'PRODUCER'")) {
      addAlert({ org_id: p.id, type: 'FILING_DEADLINE', severity: left <= 30 ? 'danger' : 'info', message: `Filing deadline for FY ${fy} is ${deadline} (${left} days away).`, link: '/producer/reports', dedupe_key: `deadline-${p.id}-${fy}-${Math.floor(left / 30)}` });
    }
  }
  writeEvent(actor, 'EXPIRY_CHECK_RUN', 'job', 'check-expiry', { date: d, changes });
  return { date: d, changes };
}

export function recomputeOrgStatus(orgId) {
  const o = get('SELECT * FROM organizations WHERE id = ?', orgId);
  const next = deriveOrgStatus(o, docsOf(orgId));
  if (next !== o.status) run('UPDATE organizations SET status = ? WHERE id = ?', next, orgId);
  if (o.type === 'RECYCLER') {
    if (['VERIFIED', 'AT_RISK'].includes(next)) run("UPDATE listings SET status = 'ACTIVE' WHERE recycler_id = ? AND status = 'HIDDEN' AND tonnes_available > 0", orgId);
    else run("UPDATE listings SET status = 'HIDDEN' WHERE recycler_id = ? AND status = 'ACTIVE'", orgId);
  }
  return next;
}

// ---------- Recycler stats ----------

export function recyclerStats(recyclerId) {
  const completed = all("SELECT delivered_at, expected_completion FROM orders WHERE recycler_id = ? AND status = 'COMPLETED'", recyclerId);
  const onTime = completed.filter((o) => o.delivered_at && o.expected_completion && o.delivered_at.slice(0, 10) <= o.expected_completion).length;
  const rating = get('SELECT AVG(score) AS avg, COUNT(*) AS n FROM ratings WHERE to_org = ?', recyclerId);
  const openDisputes = get("SELECT COUNT(*) AS n FROM disputes d JOIN orders o ON o.id = d.order_id WHERE o.recycler_id = ? AND d.status IN ('OPEN','MORE_PROOF')", recyclerId).n;
  return {
    completedOrders: completed.length,
    onTimeRate: completed.length ? (onTime / completed.length) * 100 : null,
    avgRating: rating.n ? Math.round(rating.avg * 10) / 10 : null,
    ratingCount: rating.n,
    openDisputes,
  };
}

export function recyclerProfile(recyclerId) {
  const org = getOrg(recyclerId);
  if (!org) return null;
  const docs = effectiveDocs(org);
  const earliest = docs.map((d) => d.valid_to).filter(Boolean).sort()[0] || null;
  return { ...org, ...recyclerStats(recyclerId), documents: docs, docs_valid_until: earliest };
}

export function medianPrice(category) {
  const prices = all(`SELECT l.price_per_tonne AS p FROM listings l JOIN organizations o ON o.id = l.recycler_id
    WHERE l.category = ? AND l.status = 'ACTIVE' AND l.tonnes_available > 0 AND o.status IN ('VERIFIED','AT_RISK') ORDER BY p`, category).map((r) => r.p);
  if (!prices.length) return null;
  const m = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[m] : (prices[m - 1] + prices[m]) / 2;
}

// ---------- Producer progress ----------

export function producerProgress(producerId, fy) {
  const cats = settings.categoryCodes();
  const items = all(`SELECT ii.category, ii.quantity_tonnes FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.producer_id = ? AND i.confirmed = 1 AND i.financial_year = ?`, producerId, fy);
  const targets = targetsFor(fy);
  const obligations = computeObligations(items, targets, cats);
  const credits = all('SELECT category, tonnes, status FROM credits WHERE producer_id = ? AND financial_year = ?', producerId, fy);
  const orders = all('SELECT category, tonnes, status FROM orders WHERE producer_id = ? AND financial_year = ?', producerId, fy);
  const progress = computeProgress(obligations, credits, orders);
  const placed = orders.filter((o) => o.status === 'PLACED').reduce((s, o) => s + o.tonnes, 0);
  const rates = settings.rates();
  return {
    financial_year: fy,
    targets,
    obligations,
    ...progress,
    awaiting_acceptance_tonnes: Math.round(placed * 1000) / 1000,
    exposure: exposure(progress.overall.remaining, rates),
    filing_deadline: settings.deadline(fy),
    days_to_deadline: daysBetween(today(), settings.deadline(fy)),
  };
}

export function remainingByCategory(producerId, fy) {
  const p = producerProgress(producerId, fy);
  return Object.fromEntries(Object.entries(p.byCategory).map(([c, v]) => [c, v.remaining]));
}

// ---------- Safety check ----------

export function listingRow(id) {
  return get('SELECT * FROM listings WHERE id = ?', id);
}

export function makeChecker(producerId, fy) {
  const remaining = remainingByCategory(producerId, fy);
  const thresholds = settings.thresholds();
  const deadline = settings.deadline(fy);
  const d = today();
  const profiles = new Map();
  const medians = new Map();
  const prof = (id) => { if (!profiles.has(id)) profiles.set(id, recyclerProfile(id)); return profiles.get(id); };
  const med = (c) => { if (!medians.has(c)) medians.set(c, medianPrice(c)); return medians.get(c); };
  const check = (listing, tonnes) => safetyCheck({
    listing, recycler: prof(listing.recycler_id), remaining: remaining[listing.category] ?? 0,
    tonnes, medianPrice: med(listing.category), filingDeadline: deadline, today: d, thresholds,
  });
  return { check, remaining, profile: prof, median: med, deadline };
}

export function runSafetyCheck({ producerId, listing, tonnes, fy, actor, log = true }) {
  const { check, remaining, median } = makeChecker(producerId, fy);
  const result = check(listing, tonnes);
  const out = { ...result, inputs: { producer_id: producerId, listing_id: listing.id, tonnes, financial_year: fy, remaining: remaining[listing.category] ?? 0, median_price: median(listing.category) } };
  if (log) writeEvent(actor, 'SAFETY_CHECK', 'listing', listing.id, { inputs: out.inputs, status: result.status, score: result.score, reasons: result.reasons.map((r) => `${r.severity}:${r.code}`) }, [producerId, listing.recycler_id]);
  return out;
}

export function fyBounds(fy) { return fyRange(fy); }
