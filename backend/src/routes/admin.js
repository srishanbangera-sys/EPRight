import { Router } from 'express';
import { all, get, run, tx, parseJson, setSetting, getSetting } from '../db.js';
import { requireRole, bad, str, num, date, notFound } from '../http.js';
import { settings, getOrg, recomputeOrgStatus, addAlert, runExpiryCheck, docsOf } from '../services/domain.js';
import { writeEvent, verifyAll } from '../services/audit.js';
import { orderRow, transition, releaseEscrow, refundEscrow } from './orders.js';

const r = Router();
r.use(requireRole('ADMIN'));

r.get('/overview', (_req, res) => {
  const c = (sql, ...p) => get(sql, ...p).n;
  res.json({
    pending_docs: c("SELECT COUNT(*) AS n FROM documents WHERE status = 'PENDING'"),
    flagged_orders: c("SELECT COUNT(*) AS n FROM orders WHERE status = 'FLAGGED'"),
    flagged_credits: c("SELECT COUNT(*) AS n FROM credits WHERE status = 'FLAGGED'"),
    open_disputes: c("SELECT COUNT(*) AS n FROM disputes WHERE status IN ('OPEN','MORE_PROOF')"),
    escrow_held: get("SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS n FROM orders WHERE escrow_status = 'HELD'"),
    to_release: c("SELECT COUNT(*) AS n FROM orders WHERE status = 'VALIDATED'"),
    orgs: all('SELECT type, status, COUNT(*) AS n FROM organizations GROUP BY type, status'),
    events: c('SELECT COUNT(*) AS n FROM events'),
    chain: verifyAll(),
    recent: all('SELECT id, timestamp, actor_role, action, entity_type, entity_id FROM events ORDER BY id DESC LIMIT 8'),
  });
});

// ---------- Verification queue ----------
r.get('/verifications', (_req, res) => {
  const orgs = all("SELECT * FROM organizations WHERE type IN ('PRODUCER','RECYCLER') ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'AT_RISK' THEN 1 WHEN 'EXPIRED' THEN 2 ELSE 3 END, name");
  res.json(orgs.map((o) => ({ ...o, categories: parseJson(o.categories, []), documents: docsOf(o.id) })));
});

function reviewDoc(req, status) {
  const doc = get('SELECT * FROM documents WHERE id = ?', Number(req.params.id));
  if (!doc) throw notFound('Document');
  const note = str(req.body?.note, 'Note', { required: status === 'REJECTED', max: 500 });
  run('UPDATE documents SET status = ?, review_note = ? WHERE id = ?', status, note, doc.id);
  const orgStatus = recomputeOrgStatus(doc.organization_id);
  const org = getOrg(doc.organization_id);
  writeEvent(req.user, status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED', 'document', doc.id, { organization_id: org.id, type: doc.type, valid_to: doc.valid_to, note, org_status: orgStatus }, [org.id]);
  addAlert({ org_id: org.id, type: status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED', severity: status === 'APPROVED' ? 'success' : 'danger',
    message: status === 'APPROVED' ? `Your ${doc.type.replaceAll('_', ' ').toLowerCase()} was approved. Account status: ${orgStatus}.` : `Your ${doc.type.replaceAll('_', ' ').toLowerCase()} was rejected: ${note}`,
    link: org.type === 'RECYCLER' ? '/recycler/profile' : '/producer/profile' });
  return { document: get('SELECT * FROM documents WHERE id = ?', doc.id), org_status: orgStatus };
}

r.post('/verifications/:id/approve', (req, res) => res.json(reviewDoc(req, 'APPROVED')));
r.post('/verifications/:id/reject', (req, res) => res.json(reviewDoc(req, 'REJECTED')));

// ---------- Flagged orders and credits ----------
r.get('/flagged', (_req, res) => {
  const orders = all(`SELECT o.*, p.name AS producer_name, rc.name AS recycler_name FROM orders o
    JOIN organizations p ON p.id = o.producer_id JOIN organizations rc ON rc.id = o.recycler_id WHERE o.status = 'FLAGGED' ORDER BY o.id DESC`)
    .map((o) => ({ ...o, validation_reasons: parseJson(o.validation_reasons, []), credit: get('SELECT id, status FROM credits WHERE order_id = ?', o.id) }));
  const credits = all(`SELECT c.*, p.name AS producer_name FROM credits c JOIN organizations p ON p.id = c.producer_id WHERE c.status = 'FLAGGED' AND c.order_id IS NULL ORDER BY c.id DESC`)
    .map((c) => ({ ...c, validation_reasons: parseJson(c.validation_reasons, []) }));
  const rejections = all("SELECT id, timestamp, actor_id, payload FROM events WHERE action = 'CREDIT_REJECTED_DUPLICATE' ORDER BY id DESC LIMIT 20")
    .map((e) => ({ ...e, payload: parseJson(e.payload, {}) }));
  res.json({ orders, credits, rejections });
});

r.post('/credits/:id/approve', (req, res) => {
  const c = get('SELECT * FROM credits WHERE id = ?', Number(req.params.id));
  if (!c || c.status !== 'FLAGGED') throw bad('Only flagged credits can be approved');
  const note = str(req.body?.note, 'Note', { max: 500 });
  run("UPDATE credits SET status = 'VALIDATED' WHERE id = ?", c.id);
  writeEvent(req.user, 'CREDIT_OVERRIDE_VALIDATED', 'credit', c.id, { certificate_id: c.certificate_id, note }, [c.producer_id]);
  addAlert({ org_id: c.producer_id, type: 'CREDIT_APPROVED', severity: 'success', message: `Admin approved credit ${c.certificate_id} after review: ${note}`, link: '/producer/credits' });
  res.json({ ok: true });
});

r.post('/credits/:id/reject', (req, res) => {
  const c = get('SELECT * FROM credits WHERE id = ?', Number(req.params.id));
  if (!c || c.order_id) throw bad('Only flagged external credits can be removed here');
  const note = str(req.body?.note, 'Note', { max: 500 });
  run('DELETE FROM credits WHERE id = ?', c.id);
  writeEvent(req.user, 'CREDIT_REMOVED', 'credit', c.id, { certificate_id: c.certificate_id, note }, [c.producer_id]);
  addAlert({ org_id: c.producer_id, type: 'CREDIT_REMOVED', severity: 'danger', message: `Admin removed flagged credit ${c.certificate_id}: ${note}`, link: '/producer/credits' });
  res.json({ ok: true });
});

// ---------- Escrow and order actions ----------
r.get('/escrow', (_req, res) => {
  res.json(all(`SELECT o.*, p.name AS producer_name, rc.name AS recycler_name FROM orders o
    JOIN organizations p ON p.id = o.producer_id JOIN organizations rc ON rc.id = o.recycler_id
    WHERE o.escrow_status != 'NONE' AND o.is_sample = 0 ORDER BY CASE o.status WHEN 'VALIDATED' THEN 0 WHEN 'FLAGGED' THEN 1 WHEN 'DISPUTED' THEN 2 ELSE 3 END, o.id DESC`));
});

r.post('/orders/:id/release', (req, res) => {
  const o = orderRow(Number(req.params.id));
  if (!o) throw notFound('Order');
  releaseEscrow(o, req.user);
  addAlert({ org_id: o.recycler_id, type: 'ESCROW_RELEASED', severity: 'success', message: `Simulated escrow for order #${o.id} released to you.`, link: `/orders/${o.id}` });
  res.json(orderRow(o.id));
});

r.post('/orders/:id/refund', (req, res) => {
  const o = orderRow(Number(req.params.id));
  if (!o) throw notFound('Order');
  refundEscrow(o, req.user, str(req.body?.note, 'Note', { required: false, max: 500 }));
  res.json(orderRow(o.id));
});

r.post('/orders/:id/validate', (req, res) => {
  const o = orderRow(Number(req.params.id));
  if (!o) throw notFound('Order');
  const credit = get('SELECT * FROM credits WHERE order_id = ?', o.id);
  if (!credit) throw bad('This order has no credit record (for example a duplicate certificate ID). It can only be refunded.');
  const note = str(req.body?.note, 'Note', { max: 500 });
  tx(() => {
    run("UPDATE credits SET status = 'VALIDATED' WHERE id = ?", credit.id);
    transition(o, 'VALIDATED', req.user, { override: true, note, certificate_id: credit.certificate_id });
  });
  if (settings.autoRelease()) releaseEscrow(orderRow(o.id), req.user);
  addAlert({ org_id: o.producer_id, type: 'CREDIT_APPROVED', severity: 'success', message: `Admin validated order #${o.id} after review.`, link: `/orders/${o.id}` });
  res.json(orderRow(o.id));
});

// ---------- Disputes ----------
r.get('/disputes', (_req, res) => {
  res.json(all(`SELECT d.*, o.status AS order_status, o.tonnes, o.total, o.category, p.name AS producer_name, rc.name AS recycler_name, og.name AS raised_by_name
    FROM disputes d JOIN orders o ON o.id = d.order_id JOIN organizations p ON p.id = o.producer_id JOIN organizations rc ON rc.id = o.recycler_id
    LEFT JOIN organizations og ON og.id = d.raised_by ORDER BY CASE d.status WHEN 'OPEN' THEN 0 WHEN 'MORE_PROOF' THEN 1 ELSE 2 END, d.id DESC`));
});

r.post('/disputes/:id/decide', (req, res) => {
  const d = get('SELECT * FROM disputes WHERE id = ?', Number(req.params.id));
  if (!d) throw notFound('Dispute');
  if (d.status === 'RESOLVED') throw bad('Dispute already resolved');
  const decision = String(req.body.decision || '').toUpperCase();
  if (!['REFUND', 'RELEASE', 'MORE_PROOF'].includes(decision)) throw bad('Decision must be refund, release or more proof');
  const note = str(req.body.note, 'Decision note', { max: 1000 });
  const o = orderRow(d.order_id);
  if (o.status !== 'DISPUTED') throw bad(`Order is ${o.status}, not DISPUTED`);
  if (decision === 'REFUND') refundEscrow(o, req.user, `Dispute decision: ${note}`);
  if (decision === 'RELEASE') releaseEscrow(o, req.user);
  if (decision === 'MORE_PROOF') transition(o, o.pre_dispute_status || 'IN_PROGRESS', req.user, { dispute_id: d.id, decision, note });
  run("UPDATE disputes SET status = ?, decision = ?, decision_note = ?, decided_by = ?, decided_at = ? WHERE id = ?",
    decision === 'MORE_PROOF' ? 'MORE_PROOF' : 'RESOLVED', decision, note, req.user.id, new Date().toISOString(), d.id);
  writeEvent(req.user, 'DISPUTE_DECIDED', 'dispute', d.id, { order_id: o.id, decision, note }, [o.producer_id, o.recycler_id]);
  for (const org of [o.producer_id, o.recycler_id]) addAlert({ org_id: org, type: 'DISPUTE_DECIDED', severity: 'info', message: `Dispute on order #${o.id} decided: ${decision.replace('_', ' ').toLowerCase()}. ${note}`, link: `/orders/${o.id}` });
  res.json({ ok: true });
});

// ---------- Users ----------
r.get('/users', (_req, res) => {
  res.json(all(`SELECT u.id, u.email, u.name, u.role, u.is_demo, o.name AS org_name, o.type AS org_type, o.status AS org_status, o.is_sample
    FROM users u LEFT JOIN organizations o ON o.id = u.organization_id ORDER BY u.role, u.id`));
});

// ---------- Settings ----------
r.get('/settings', (_req, res) => {
  res.json({
    categories: settings.categories(),
    targets: all('SELECT financial_year, category, target_pct FROM settings_targets ORDER BY financial_year, category'),
    compensation_rates: settings.rates(),
    thresholds: settings.thresholds(),
    filing_deadline_by_year: getSetting('filing_deadline_by_year', {}),
    current_fy: settings.currentFy(),
    auto_release: settings.autoRelease(),
    ai_enabled: settings.aiEnabled(),
  });
});

r.put('/settings', (req, res) => {
  const b = req.body;
  const changes = {};
  tx(() => {
    if (Array.isArray(b.categories)) {
      const cats = b.categories.map((c) => ({ code: str(c.code, 'Category code', { max: 10 }), name: str(c.name, 'Category name', { max: 120 }) }));
      if (new Set(cats.map((c) => c.code)).size !== cats.length) throw bad('Category codes must be unique');
      setSetting('categories', cats); changes.categories = cats;
    }
    if (Array.isArray(b.targets)) {
      for (const t of b.targets) {
        if (!/^\d{4}-\d{2}$/.test(t.financial_year)) throw bad('Financial year must look like 2026-27');
        const pct = num(t.target_pct, 'Target %', { min: 0, max: 100 });
        run('INSERT INTO settings_targets (financial_year, category, target_pct) VALUES (?,?,?) ON CONFLICT(financial_year, category) DO UPDATE SET target_pct = excluded.target_pct', t.financial_year, str(t.category, 'Category'), pct);
      }
      changes.targets = b.targets;
    }
    if (Array.isArray(b.compensation_rates)) {
      const rates = b.compensation_rates.map((x, i) => num(x, `Rate ${i + 1}`, { min: 0 }));
      setSetting('compensation_rates', rates); changes.compensation_rates = rates;
    }
    if (b.thresholds && typeof b.thresholds === 'object') {
      const t = {};
      for (const [k, v] of Object.entries(b.thresholds)) t[k] = num(v, k, { min: 0 });
      setSetting('thresholds', { ...getSetting('thresholds', {}), ...t }); changes.thresholds = t;
    }
    if (b.filing_deadline_by_year && typeof b.filing_deadline_by_year === 'object') {
      const m = {};
      for (const [fy, d] of Object.entries(b.filing_deadline_by_year)) m[fy] = date(d, `Deadline ${fy}`);
      setSetting('filing_deadline_by_year', { ...getSetting('filing_deadline_by_year', {}), ...m }); changes.filing_deadline_by_year = m;
    }
    if (b.current_fy) { if (!/^\d{4}-\d{2}$/.test(b.current_fy)) throw bad('Bad financial year'); setSetting('current_fy', b.current_fy); changes.current_fy = b.current_fy; }
    if (typeof b.auto_release === 'boolean') { setSetting('auto_release', b.auto_release); changes.auto_release = b.auto_release; }
    if (typeof b.ai_enabled === 'boolean') { setSetting('ai_enabled', b.ai_enabled); changes.ai_enabled = b.ai_enabled; }
  });
  writeEvent(req.user, 'SETTINGS_UPDATED', 'settings', 'global', changes);
  res.json({ ok: true, changes });
});

// ---------- Jobs and audit demo ----------
r.post('/jobs/check-expiry', (req, res) => res.json(runExpiryCheck(req.user)));

// Demo only: edit a past event's payload directly in the database to show Audit mode detecting it.
r.post('/audit/tamper', (req, res) => {
  const target = req.body?.event_id ? get('SELECT * FROM events WHERE id = ?', Number(req.body.event_id))
    : get("SELECT * FROM events WHERE action IN ('ORDER_PLACED','INVOICE_CONFIRMED','ORDER_VALIDATED','EXTERNAL_CREDIT_VALIDATED') ORDER BY id DESC LIMIT 1")
      || get('SELECT * FROM events ORDER BY id ASC LIMIT 1 OFFSET 5');
  if (!target) throw bad('No event to tamper with');
  if (get('SELECT event_id FROM demo_tamper WHERE event_id = ?', target.id)) throw bad('That event is already tampered');
  run('INSERT INTO demo_tamper (event_id, original_payload) VALUES (?, ?)', target.id, target.payload);
  const p = parseJson(target.payload, {});
  const tampered = { ...p, tonnes: p.tonnes != null ? Number(p.tonnes) * 10 : 999, tampered_note: 'edited directly in the database' };
  run('UPDATE events SET payload = ? WHERE id = ?', JSON.stringify(tampered), target.id);
  res.json({ ok: true, event_id: target.id, action: target.action, chain: verifyAll() });
});

r.post('/audit/restore', (_req, res) => {
  const rows = all('SELECT * FROM demo_tamper');
  for (const t of rows) run('UPDATE events SET payload = ? WHERE id = ?', t.original_payload, t.event_id);
  run('DELETE FROM demo_tamper');
  res.json({ ok: true, restored: rows.length, chain: verifyAll() });
});

export default r;
