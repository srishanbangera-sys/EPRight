import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, run, tx, parseJson } from '../db.js';
import { requireRole, upload, fileUrl, bad, str, num, date, fyParam, notFound, forbidden, HttpError } from '../http.js';
import { settings, runSafetyCheck, listingRow, getOrg, addAlert, producerProgress, wasVerifiedOn } from '../services/domain.js';
import { writeEvent, SYSTEM } from '../services/audit.js';
import { canTransition } from '../lib/stateMachine.js';
import { validateCredit } from '../lib/validation.js';
import { fyOf } from '../lib/fy.js';

const r = Router();
const nowIso = () => new Date().toISOString();

export function orderRow(id) {
  return get(`SELECT o.*, p.name AS producer_name, rc.name AS recycler_name, l.facility
    FROM orders o JOIN organizations p ON p.id = o.producer_id JOIN organizations rc ON rc.id = o.recycler_id
    LEFT JOIN listings l ON l.id = o.listing_id WHERE o.id = ?`, id);
}

function assertParty(order, user) {
  if (user.role === 'ADMIN') return;
  if (user.role === 'PRODUCER' && order.producer_id === user.organization_id) return;
  if (user.role === 'RECYCLER' && order.recycler_id === user.organization_id) return;
  throw notFound('Order');
}

/** Move an order to a new status if the state machine allows it for this role. Writes an audit event. */
export function transition(order, to, actor, payload = {}, extraSql = null) {
  const role = actor.role;
  if (!canTransition(order.status, to, role)) {
    throw new HttpError(409, `An order in status ${order.status} cannot move to ${to} by a ${role.toLowerCase()}.`);
  }
  run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', to, nowIso(), order.id);
  if (extraSql) extraSql();
  writeEvent(actor, `ORDER_${to}`, 'order', order.id, { from: order.status, to, ...payload }, [order.producer_id, order.recycler_id]);
  return { ...order, status: to };
}

function restoreListingTonnes(order) {
  run("UPDATE listings SET tonnes_available = tonnes_available + ?, status = CASE WHEN status = 'SOLD_OUT' THEN 'ACTIVE' ELSE status END WHERE id = ?", order.tonnes, order.listing_id);
}

export function releaseEscrow(order, actor) {
  return transition(order, 'COMPLETED', actor, { escrow: 'RELEASED', amount: order.total, simulated: true }, () => {
    run("UPDATE orders SET escrow_status = 'RELEASED' WHERE id = ?", order.id);
  });
}

export function refundEscrow(order, actor, reason) {
  const neverDelivered = !order.delivered_at;
  const res = transition(order, 'REFUNDED', actor, { escrow: order.escrow_status === 'HELD' ? 'REFUNDED' : order.escrow_status, amount: order.total, reason, simulated: true }, () => {
    run("UPDATE orders SET escrow_status = CASE WHEN escrow_status = 'HELD' THEN 'REFUNDED' ELSE escrow_status END WHERE id = ?", order.id);
    if (neverDelivered) restoreListingTonnes(order);
  });
  addAlert({ org_id: order.producer_id, type: 'ESCROW_REFUNDED', severity: 'info', message: `Order #${order.id} was refunded (simulated escrow). ${reason || ''}`.trim(), link: `/orders/${order.id}` });
  addAlert({ org_id: order.recycler_id, type: 'ESCROW_REFUNDED', severity: 'warning', message: `Order #${order.id} was refunded to the producer. ${reason || ''}`.trim(), link: `/orders/${order.id}` });
  return res;
}

/** Place an order (Stage 5). Blocks RED, requires confirmation for AMBER. */
export function placeOrder({ user, listingId, tonnes, fy, confirmAmber, via = 'MARKETPLACE' }) {
  const producer = getOrg(user.organization_id);
  if (!['VERIFIED', 'AT_RISK'].includes(producer.status)) throw bad(`Your organisation must be verified before ordering (status: ${producer.status}).`);
  const listing = listingRow(listingId);
  if (!listing) throw notFound('Listing');
  const rec = getOrg(listing.recycler_id);
  if (listing.status !== 'ACTIVE' || !['VERIFIED', 'AT_RISK'].includes(rec.status)) throw bad('This listing is not available.');
  const safety = runSafetyCheck({ producerId: producer.id, listing, tonnes, fy, actor: user });
  if (safety.status === 'RED') throw new HttpError(422, 'Order blocked by the Safety Check (RED). See the reasons.', { safety });
  if (safety.status === 'AMBER' && !confirmAmber) throw new HttpError(409, 'The Safety Check found warnings. Confirm to continue.', { safety, needs_confirmation: true });

  const order = tx(() => {
    const total = Math.round(tonnes * listing.price_per_tonne * 100) / 100;
    const ins = run(`INSERT INTO orders (listing_id, producer_id, recycler_id, category, financial_year, tonnes, price_per_tonne, total, status, escrow_status, expected_completion, safety_status, safety_score)
      VALUES (?,?,?,?,?,?,?,?, 'PLACED', 'NONE', ?, ?, ?)`,
    listing.id, producer.id, listing.recycler_id, listing.category, fy, tonnes, listing.price_per_tonne, total, listing.expected_completion, safety.status, safety.score);
    const id = Number(ins.lastInsertRowid);
    const left = Math.round((listing.tonnes_available - tonnes) * 1000) / 1000;
    run('UPDATE listings SET tonnes_available = ?, status = ? WHERE id = ?', left, left <= 0 ? 'SOLD_OUT' : listing.status, listing.id);
    writeEvent(user, 'ORDER_PLACED', 'order', id, { listing_id: listing.id, tonnes, price_per_tonne: listing.price_per_tonne, total, category: listing.category, financial_year: fy, safety: { status: safety.status, score: safety.score }, amber_confirmed: safety.status === 'AMBER', via }, [listing.recycler_id]);
    return orderRow(id);
  });
  addAlert({ org_id: listing.recycler_id, type: 'NEW_ORDER', severity: 'info', message: `New order #${order.id} from ${producer.name}: ${tonnes} t of Category ${listing.category}. Accept or reject it.`, link: `/orders/${order.id}` });
  // Surplus warning
  const p = producerProgress(producer.id, fy);
  if (p.byCategory[listing.category]?.surplus > 0) {
    addAlert({ org_id: producer.id, type: 'SURPLUS', severity: 'warning', message: `You have ${p.byCategory[listing.category].surplus} t surplus in Category ${listing.category}. Extra credits do not reduce other categories.`, link: '/producer', dedupe_key: `surplus-${producer.id}-${fy}-${listing.category}-${p.byCategory[listing.category].surplus}` });
  }
  return order;
}

function allowedActions(o, user, ratedByMe) {
  const a = [];
  const disputable = ['PAID_ESCROW', 'IN_PROGRESS', 'DELIVERED', 'RECEIVED', 'OVERDUE', 'FLAGGED', 'VALIDATED'];
  if (user.role === 'PRODUCER') {
    if (o.status === 'PLACED') a.push('cancel');
    if (o.status === 'ACCEPTED') a.push('pay', 'cancel');
    if (o.status === 'DELIVERED') a.push('receive');
    if (disputable.includes(o.status)) a.push('dispute');
    if (o.status === 'COMPLETED' && !ratedByMe) a.push('rate');
  } else if (user.role === 'RECYCLER') {
    if (o.status === 'PLACED') a.push('accept', 'reject');
    if (o.status === 'PAID_ESCROW') a.push('start', 'proof', 'deliver');
    if (['IN_PROGRESS', 'OVERDUE'].includes(o.status)) a.push('proof', 'deliver');
    if (disputable.includes(o.status)) a.push('dispute');
    if (o.status === 'COMPLETED' && !ratedByMe) a.push('rate');
  } else if (user.role === 'ADMIN') {
    if (o.status === 'VALIDATED') a.push('release');
    if (o.status === 'FLAGGED') a.push('validate', 'refund');
    if (['OVERDUE', 'EXPIRED'].includes(o.status)) a.push('refund');
  }
  return a;
}

function orderDetail(id, user) {
  const o = orderRow(id);
  if (!o) throw notFound('Order');
  assertParty(o, user);
  const timeline = all("SELECT id, timestamp, actor_role, action, payload FROM events WHERE entity_type = 'order' AND entity_id = ? ORDER BY id", String(id))
    .map((e) => ({ ...e, payload: parseJson(e.payload, {}) }));
  const rated = user.organization_id ? get('SELECT id FROM ratings WHERE order_id = ? AND from_org = ?', id, user.organization_id) : null;
  return {
    ...o,
    validation_reasons: parseJson(o.validation_reasons, null),
    proofs: all('SELECT * FROM order_proofs WHERE order_id = ? ORDER BY id', id),
    credit: get('SELECT * FROM credits WHERE order_id = ?', id),
    disputes: all('SELECT * FROM disputes WHERE order_id = ? ORDER BY id DESC', id),
    ratings: all('SELECT r.*, og.name AS from_name FROM ratings r JOIN organizations og ON og.id = r.from_org WHERE order_id = ?', id),
    timeline,
    actions: allowedActions(o, user, !!rated),
  };
}

// ---------- Routes ----------

r.post('/', requireRole('PRODUCER'), (req, res) => {
  const fy = fyParam(req.body.year, settings.currentFy());
  const order = placeOrder({ user: req.user, listingId: num(req.body.listing_id, 'Listing'), tonnes: num(req.body.tonnes, 'Tonnes', { min: 0.001, max: 100000 }), fy, confirmAmber: !!req.body.confirm_amber });
  res.status(201).json(order);
});

r.get('/', (req, res) => {
  const u = req.user;
  const where = u.role === 'PRODUCER' ? 'o.producer_id = ?' : u.role === 'RECYCLER' ? 'o.recycler_id = ?' : '1 = 1';
  const params = u.role === 'ADMIN' ? [] : [u.organization_id];
  let sql = `SELECT o.*, p.name AS producer_name, rc.name AS recycler_name FROM orders o
    JOIN organizations p ON p.id = o.producer_id JOIN organizations rc ON rc.id = o.recycler_id WHERE ${where}`;
  if (req.query.status) { sql += ' AND o.status = ?'; params.push(String(req.query.status)); }
  if (req.query.year) { sql += ' AND o.financial_year = ?'; params.push(fyParam(req.query.year)); }
  if (u.role !== 'ADMIN' && !req.query.include_sample) sql += ' AND o.is_sample = 0';
  sql += ' ORDER BY o.id DESC';
  res.json(all(sql, ...params));
});

r.get('/:id', (req, res) => res.json(orderDetail(Number(req.params.id), req.user)));

const load = (req) => {
  const o = orderRow(Number(req.params.id));
  if (!o) throw notFound('Order');
  assertParty(o, req.user);
  if (req.user.role === 'ADMIN') throw forbidden('Admins act on orders from the admin console');
  return o;
};

r.post('/:id/accept', requireRole('RECYCLER'), (req, res) => {
  const o = load(req);
  transition(o, 'ACCEPTED', req.user, {});
  addAlert({ org_id: o.producer_id, type: 'ORDER_ACCEPTED', severity: 'success', message: `${o.recycler_name} accepted order #${o.id}. Pay into simulated escrow to commit the tonnes.`, link: `/orders/${o.id}` });
  res.json(orderDetail(o.id, req.user));
});

r.post('/:id/reject', requireRole('RECYCLER'), (req, res) => {
  const o = load(req);
  const reason = str(req.body.reason, 'Reason', { required: false }) || 'No reason given';
  transition(o, 'REJECTED', req.user, { reason }, () => restoreListingTonnes(o));
  addAlert({ org_id: o.producer_id, type: 'ORDER_REJECTED', severity: 'warning', message: `${o.recycler_name} rejected order #${o.id}: ${reason}`, link: `/orders/${o.id}` });
  res.json(orderDetail(o.id, req.user));
});

r.post('/:id/cancel', requireRole('PRODUCER'), (req, res) => {
  const o = load(req);
  transition(o, 'CANCELLED', req.user, {}, () => restoreListingTonnes(o));
  addAlert({ org_id: o.recycler_id, type: 'ORDER_CANCELLED', severity: 'info', message: `Order #${o.id} was cancelled by the producer.`, link: `/orders/${o.id}` });
  res.json(orderDetail(o.id, req.user));
});

// SIMULATED payment into escrow.
r.post('/:id/pay', requireRole('PRODUCER'), (req, res) => {
  const o = load(req);
  const ref = 'SIM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  transition(o, 'PAID_ESCROW', req.user, { amount: o.total, escrow: 'HELD', payment_ref: ref, method: str(req.body.method, 'Method', { required: false }) || 'UPI', simulated: true }, () => {
    run("UPDATE orders SET escrow_status = 'HELD', payment_ref = ? WHERE id = ?", ref, o.id);
  });
  addAlert({ org_id: o.recycler_id, type: 'ORDER_PAID', severity: 'success', message: `Order #${o.id} is paid into simulated escrow. Process the plastic and deliver the credit.`, link: `/orders/${o.id}` });
  res.json(orderDetail(o.id, req.user));
});

r.post('/:id/start', requireRole('RECYCLER'), (req, res) => {
  const o = load(req);
  transition(o, 'IN_PROGRESS', req.user, {});
  res.json(orderDetail(o.id, req.user));
});

r.post('/:id/proofs', requireRole('RECYCLER'), upload.array('files', 10), (req, res) => {
  let o = load(req);
  if (!['PAID_ESCROW', 'IN_PROGRESS', 'OVERDUE', 'DISPUTED'].includes(o.status)) throw bad(`Proof cannot be uploaded while the order is ${o.status}`);
  const type = ['WEIGHMENT_SLIP', 'PROCESSING_RECORD', 'GST_EINVOICE', 'OTHER'].includes(req.body.type) ? req.body.type : 'OTHER';
  if (!req.files?.length) throw bad('Choose at least one file');
  for (const f of req.files) run('INSERT INTO order_proofs (order_id, file_url, file_name, type) VALUES (?,?,?,?)', o.id, fileUrl(f), f.originalname, type);
  writeEvent(req.user, 'ORDER_PROOF_UPLOADED', 'order', o.id, { type, files: req.files.map((f) => f.originalname) }, [o.producer_id]);
  if (o.status === 'PAID_ESCROW') o = transition(o, 'IN_PROGRESS', req.user, { auto: 'proof uploaded' });
  res.json(orderDetail(o.id, req.user));
});

// Recycler records the credit generated on the CPCB portal (outside EPRight).
r.post('/:id/deliver', requireRole('RECYCLER'), upload.array('files', 10), (req, res) => {
  let o = load(req);
  const certificate_id = str(req.body.certificate_id, 'Certificate ID', { max: 80 });
  const tonnes = num(req.body.tonnes, 'Tonnes', { min: 0.001 });
  const category = str(req.body.category, 'Category');
  if (!settings.categoryCodes().includes(category)) throw bad('Unknown category');
  const issue_date = date(req.body.issue_date, 'Issue date');
  if (o.status === 'PAID_ESCROW') o = transition(o, 'IN_PROGRESS', req.user, { auto: 'delivery recorded' });
  for (const f of req.files || []) run('INSERT INTO order_proofs (order_id, file_url, file_name, type) VALUES (?,?,?,?)', o.id, fileUrl(f), f.originalname, req.body.proof_type || 'PROCESSING_RECORD');
  const at = nowIso();
  transition(o, 'DELIVERED', req.user, { certificate_id, tonnes, category, issue_date, proofs: (req.files || []).length }, () => {
    run('UPDATE orders SET delivered_certificate_id = ?, delivered_tonnes = ?, delivered_category = ?, delivered_issue_date = ?, delivered_at = ? WHERE id = ?', certificate_id, tonnes, category, issue_date, at, o.id);
  });
  addAlert({ org_id: o.producer_id, type: 'ORDER_DELIVERED', severity: 'success', message: `${o.recycler_name} delivered certificate ${certificate_id} for order #${o.id}. Check your CPCB portal account, then mark it received.`, link: `/orders/${o.id}` });
  res.json(orderDetail(o.id, req.user));
});

// Producer confirms receipt on their own portal account; validation runs automatically (Stage 7).
r.post('/:id/receive', requireRole('PRODUCER'), upload.single('screenshot'), (req, res) => {
  let o = load(req);
  const certificate_id = str(req.body.certificate_id || o.delivered_certificate_id, 'Certificate ID', { max: 80 });
  const tonnes = num(req.body.tonnes ?? o.delivered_tonnes, 'Tonnes', { min: 0 });
  const category = o.delivered_category || o.category;
  const issue_date = o.delivered_issue_date;
  const screenshot = req.file ? fileUrl(req.file) : null;
  o = transition(o, 'RECEIVED', req.user, { certificate_id, tonnes, screenshot: !!screenshot }, () => {
    run('UPDATE orders SET received_at = ?, receipt_screenshot_url = ? WHERE id = ?', nowIso(), screenshot, o.id);
  });

  const fy = o.financial_year;
  const prog = producerProgress(o.producer_id, fy);
  const obligationCategories = Object.values(prog.obligations).filter((x) => x.required_tonnes > 0).map((x) => x.category);
  const duplicate = !!get('SELECT id FROM credits WHERE certificate_id = ?', certificate_id);
  const result = validateCredit({
    credit: { certificate_id, category, tonnes, issue_date, source: 'PLATFORM' },
    duplicate, obligationCategories, financialYear: fy,
    order: { tonnes: o.tonnes, delivered_tonnes: o.delivered_tonnes, delivered_certificate_id: o.delivered_certificate_id, category: o.category },
    recyclerVerifiedOnIssueDate: wasVerifiedOn(o.recycler_id, issue_date),
  });
  const reasonsJson = JSON.stringify(result.reasons);
  run('UPDATE orders SET validation_reasons = ? WHERE id = ?', reasonsJson, o.id);

  if (result.valid) {
    tx(() => {
      run(`INSERT INTO credits (producer_id, order_id, certificate_id, recycler_name, recycler_id, category, tonnes, issue_date, financial_year, source, source_name, price_per_tonne, document_url, status, validation_reasons)
        VALUES (?,?,?,?,?,?,?,?,?, 'PLATFORM', 'EPRight marketplace', ?, ?, 'VALIDATED', ?)`,
      o.producer_id, o.id, certificate_id, o.recycler_name, o.recycler_id, category, tonnes, issue_date, fy, o.price_per_tonne, screenshot, reasonsJson);
      o = transition(o, 'VALIDATED', SYSTEM, { certificate_id, rules: result.reasons.map((x) => `${x.rule}:${x.ok ? 'pass' : 'fail'}`) });
    });
    if (settings.autoRelease()) {
      o = releaseEscrow(orderRow(o.id), SYSTEM);
      addAlert({ org_id: o.recycler_id, type: 'ESCROW_RELEASED', severity: 'success', message: `Credit for order #${o.id} validated. Simulated escrow of ₹${Math.round(o.total).toLocaleString('en-IN')} released to you.`, link: `/orders/${o.id}` });
    } else {
      addAlert({ audience_role: 'ADMIN', type: 'ESCROW_RELEASE_PENDING', severity: 'info', message: `Order #${o.id} validated. Release the simulated escrow.`, link: '/admin/escrow' });
    }
  } else {
    if (!duplicate) {
      run(`INSERT INTO credits (producer_id, order_id, certificate_id, recycler_name, recycler_id, category, tonnes, issue_date, financial_year, source, source_name, price_per_tonne, document_url, status, validation_reasons)
        VALUES (?,?,?,?,?,?,?,?,?, 'PLATFORM', 'EPRight marketplace', ?, ?, 'FLAGGED', ?)`,
      o.producer_id, o.id, certificate_id, o.recycler_name, o.recycler_id, category, tonnes, issue_date || o.delivered_at?.slice(0, 10), fy, o.price_per_tonne, screenshot, reasonsJson);
    }
    o = transition(o, 'FLAGGED', SYSTEM, { certificate_id, possible_fraud: result.fraud, failed: result.reasons.filter((x) => !x.ok).map((x) => x.text) });
    addAlert({ org_id: o.producer_id, type: 'VALIDATION_FLAGGED', severity: 'danger', message: `Order #${o.id} was flagged: ${result.reasons.filter((x) => !x.ok).map((x) => x.text).join(' ')}`, link: `/orders/${o.id}` });
    addAlert({ audience_role: 'ADMIN', type: result.fraud ? 'POSSIBLE_FRAUD' : 'VALIDATION_FLAGGED', severity: 'danger', message: `${result.fraud ? 'Possible fraud: duplicate certificate ID ' + certificate_id + ' on' : 'Validation failed on'} order #${o.id}.`, link: '/admin/flagged' });
    addAlert({ org_id: o.recycler_id, type: 'VALIDATION_FLAGGED', severity: 'danger', message: `Order #${o.id} was flagged during validation and sent to admin review.`, link: `/orders/${o.id}` });
  }
  res.json({ ...orderDetail(o.id, req.user), validation: result });
});

r.post('/:id/dispute', upload.single('evidence'), (req, res) => {
  const o = load(req);
  const reason = str(req.body.reason, 'Reason', { max: 2000 });
  transition(o, 'DISPUTED', req.user, { reason }, () => {
    run('UPDATE orders SET pre_dispute_status = ? WHERE id = ?', o.status, o.id);
    run('INSERT INTO disputes (order_id, raised_by, raised_by_role, reason, evidence_url) VALUES (?,?,?,?,?)', o.id, req.user.organization_id, req.user.role, reason, req.file ? fileUrl(req.file) : null);
  });
  const other = req.user.role === 'PRODUCER' ? o.recycler_id : o.producer_id;
  addAlert({ org_id: other, type: 'DISPUTE_RAISED', severity: 'warning', message: `A dispute was raised on order #${o.id}: ${reason}`, link: `/orders/${o.id}` });
  addAlert({ audience_role: 'ADMIN', type: 'DISPUTE_RAISED', severity: 'warning', message: `New dispute on order #${o.id}.`, link: '/admin/disputes' });
  res.json(orderDetail(o.id, req.user));
});

r.post('/:id/rate', (req, res) => {
  const o = load(req);
  if (o.status !== 'COMPLETED') throw bad('You can rate after the order is completed');
  const score = num(req.body.score, 'Score', { min: 1, max: 5 });
  const to = req.user.role === 'PRODUCER' ? o.recycler_id : o.producer_id;
  try {
    run('INSERT INTO ratings (order_id, from_org, to_org, score, comment) VALUES (?,?,?,?,?)', o.id, req.user.organization_id, to, Math.round(score), str(req.body.comment, 'Comment', { required: false, max: 1000 }));
  } catch {
    throw bad('You have already rated this order');
  }
  writeEvent(req.user, 'ORDER_RATED', 'order', o.id, { score: Math.round(score), to_org: to }, [to]);
  res.json(orderDetail(o.id, req.user));
});

export default r;
