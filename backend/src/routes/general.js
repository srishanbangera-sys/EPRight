// Documents, organisations, obligations, dashboards, alerts, reports and audit.
import { Router } from 'express';
import { all, get, run, parseJson } from '../db.js';
import { requireRole, upload, fileUrl, bad, str, num, date, fyParam, notFound } from '../http.js';
import { settings, getOrg, producerProgress, recomputeOrgStatus, recyclerProfile, addAlert, docsOf, REQUIRED_DOCS } from '../services/domain.js';
import { writeEvent, verifyAll } from '../services/audit.js';
import { filingReportPdf, auditPdf } from '../services/pdf.js';
import { aiConfigured } from '../services/ai.js';

const r = Router();

// ---------- Config for the UI ----------
r.get('/config', (_req, res) => {
  const fys = all('SELECT DISTINCT financial_year FROM settings_targets ORDER BY financial_year').map((x) => x.financial_year);
  res.json({
    categories: settings.categories(), current_fy: settings.currentFy(), financial_years: fys,
    thresholds: settings.thresholds(), compensation_rates: settings.rates(), auto_release: settings.autoRelease(),
    ai_enabled: settings.aiEnabled(), ai_configured: aiConfigured(), required_docs: REQUIRED_DOCS,
  });
});

// ---------- Organisation and documents ----------
r.get('/orgs/me', (req, res) => {
  if (!req.user.organization_id) return res.json(null);
  const org = getOrg(req.user.organization_id);
  const docs = docsOf(org.id);
  res.json({ ...org, documents: docs, ...(org.type === 'RECYCLER' ? recyclerProfile(org.id) : {}), documents_all: docs });
});

r.put('/orgs/me', requireRole('PRODUCER', 'RECYCLER'), (req, res) => {
  const org = getOrg(req.user.organization_id);
  const b = req.body;
  const location = b.location != null ? str(b.location, 'Location', { required: false, max: 200 }) : org.location;
  const contact = b.contact != null ? str(b.contact, 'Contact', { required: false, max: 200 }) : org.contact;
  const capacity = org.type === 'RECYCLER' && b.monthly_capacity_t != null ? num(b.monthly_capacity_t, 'Monthly capacity', { min: 1 }) : org.monthly_capacity_t;
  run('UPDATE organizations SET location = ?, contact = ?, monthly_capacity_t = ? WHERE id = ?', location, contact, capacity, org.id);
  writeEvent(req.user, 'ORG_PROFILE_UPDATED', 'organization', org.id, { location, contact, monthly_capacity_t: capacity });
  res.json(getOrg(org.id));
});

r.get('/documents', (req, res) => res.json(docsOf(req.user.organization_id)));

r.post('/documents', requireRole('PRODUCER', 'RECYCLER'), upload.single('file'), (req, res) => {
  const org = getOrg(req.user.organization_id);
  const type = str(req.body.type, 'Document type');
  if (!['REGISTRATION_CERTIFICATE', 'CONSENT_TO_OPERATE', 'OTHER'].includes(type)) throw bad('Unknown document type');
  const from = date(req.body.valid_from, 'Valid from');
  const to = date(req.body.valid_to, 'Valid to');
  if (to <= from) throw bad('Valid-to must be after valid-from');
  if (!req.file) throw bad('Attach the document file');
  const ins = run('INSERT INTO documents (organization_id, type, number, valid_from, valid_to, file_url, status) VALUES (?,?,?,?,?,?,?)',
    org.id, type, str(req.body.number, 'Document number', { required: false, max: 80 }), from, to, fileUrl(req.file), 'PENDING');
  writeEvent(req.user, 'DOCUMENT_UPLOADED', 'document', Number(ins.lastInsertRowid), { type, valid_from: from, valid_to: to });
  recomputeOrgStatus(org.id);
  addAlert({ audience_role: 'ADMIN', type: 'VERIFICATION_PENDING', severity: 'info', message: `${org.name} uploaded a ${type.replaceAll('_', ' ').toLowerCase()} for review.`, link: '/admin/verifications' });
  res.status(201).json(docsOf(org.id));
});

// ---------- Obligations and dashboards ----------
r.get('/obligations', requireRole('PRODUCER'), (req, res) => {
  const fy = fyParam(req.query.year, settings.currentFy());
  const progress = producerProgress(req.user.organization_id, fy);
  const invoices = all(`SELECT i.id, i.invoice_number, i.invoice_date, i.seller_name, i.extraction_source, ii.category, ii.quantity_tonnes, ii.description
    FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id WHERE i.producer_id = ? AND i.confirmed = 1 AND i.financial_year = ? ORDER BY i.invoice_date`, req.user.organization_id, fy);
  res.json({ ...progress, source_lines: invoices, categories: settings.categories() });
});

r.get('/dashboard/producer', requireRole('PRODUCER'), (req, res) => {
  const fy = fyParam(req.query.year, settings.currentFy());
  const pid = req.user.organization_id;
  const progress = producerProgress(pid, fy);
  const orders = all(`SELECT o.*, rc.name AS recycler_name FROM orders o JOIN organizations rc ON rc.id = o.recycler_id
    WHERE o.producer_id = ? AND o.financial_year = ? ORDER BY o.id DESC LIMIT 6`, pid, fy);
  const counts = get(`SELECT
      SUM(CASE WHEN status IN ('PLACED','ACCEPTED','PAID_ESCROW','IN_PROGRESS','DELIVERED','RECEIVED','OVERDUE') THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) AS to_receive,
      SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS to_pay,
      SUM(CASE WHEN status IN ('FLAGGED','DISPUTED') THEN 1 ELSE 0 END) AS attention
    FROM orders WHERE producer_id = ? AND financial_year = ?`, pid, fy);
  const invoices = get('SELECT COUNT(*) AS n FROM invoices WHERE producer_id = ? AND confirmed = 1 AND financial_year = ?', pid, fy).n;
  const spend = get("SELECT COALESCE(SUM(total),0) AS t FROM orders WHERE producer_id = ? AND financial_year = ? AND escrow_status IN ('HELD','RELEASED')", pid, fy).t;
  res.json({ progress, orders, counts, invoices, spend, categories: settings.categories(), org: getOrg(pid) });
});

r.get('/dashboard/recycler', requireRole('RECYCLER'), (req, res) => {
  const rid = req.user.organization_id;
  const profile = recyclerProfile(rid);
  const open = all(`SELECT o.*, p.name AS producer_name FROM orders o JOIN organizations p ON p.id = o.producer_id
    WHERE o.recycler_id = ? AND o.status IN ('PLACED','ACCEPTED','PAID_ESCROW','IN_PROGRESS','OVERDUE','DELIVERED','RECEIVED','FLAGGED','DISPUTED','VALIDATED') ORDER BY o.id DESC`, rid);
  const listings = all("SELECT * FROM listings WHERE recycler_id = ? ORDER BY id DESC", rid);
  const earned = get("SELECT COALESCE(SUM(total),0) AS t FROM orders WHERE recycler_id = ? AND escrow_status = 'RELEASED' AND is_sample = 0", rid).t;
  const held = get("SELECT COALESCE(SUM(total),0) AS t FROM orders WHERE recycler_id = ? AND escrow_status = 'HELD'", rid).t;
  const listed = listings.filter((l) => l.status === 'ACTIVE').reduce((s, l) => s + l.tonnes_available, 0);
  const committed = open.filter((o) => ['PLACED', 'ACCEPTED', 'PAID_ESCROW', 'IN_PROGRESS', 'OVERDUE'].includes(o.status)).reduce((s, o) => s + o.tonnes, 0);
  const ratings = all('SELECT r.*, o.name AS from_name FROM ratings r JOIN organizations o ON o.id = r.from_org WHERE r.to_org = ? ORDER BY r.id DESC', rid);
  res.json({ profile, open, listings, earned, held, capacity: { monthly: profile.monthly_capacity_t, listed, committed, left: Math.max(0, (profile.monthly_capacity_t || 0) - listed - committed) }, ratings });
});

// ---------- Alerts ----------
r.get('/alerts', (req, res) => {
  const u = req.user;
  const rows = u.role === 'ADMIN'
    ? all("SELECT * FROM alerts WHERE audience_role = 'ADMIN' ORDER BY id DESC LIMIT 100")
    : all('SELECT * FROM alerts WHERE org_id = ? OR user_id = ? ORDER BY id DESC LIMIT 100', u.organization_id, u.id);
  res.json({ alerts: rows, unread: rows.filter((a) => !a.read).length });
});

r.post('/alerts/read-all', (req, res) => {
  const u = req.user;
  if (u.role === 'ADMIN') run("UPDATE alerts SET read = 1 WHERE audience_role = 'ADMIN'");
  else run('UPDATE alerts SET read = 1 WHERE org_id = ? OR user_id = ?', u.organization_id, u.id);
  res.json({ ok: true });
});

r.post('/alerts/:id/read', (req, res) => {
  run('UPDATE alerts SET read = 1 WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Reports ----------
r.get('/reports/filing', requireRole('PRODUCER'), (req, res) => {
  const fy = fyParam(req.query.year, settings.currentFy());
  const pid = req.user.organization_id;
  const producer = getOrg(pid);
  const progress = producerProgress(pid, fy);
  const credits = all('SELECT * FROM credits WHERE producer_id = ? AND financial_year = ? ORDER BY issue_date', pid, fy);
  const orders = all(`SELECT o.*, rc.name AS recycler_name FROM orders o JOIN organizations rc ON rc.id = o.recycler_id
    WHERE o.producer_id = ? AND o.financial_year = ? ORDER BY o.id`, pid, fy);
  const chain = verifyAll();
  writeEvent(req.user, 'FILING_REPORT_GENERATED', 'report', fy, { financial_year: fy, required: progress.overall.required, covered: progress.overall.covered, remaining: progress.overall.remaining, chain_intact: chain.intact });
  filingReportPdf(res, { producer, progress, credits, orders, chain, categories: settings.categories(), generatedBy: req.user.email });
});

r.get('/reports/summary', requireRole('PRODUCER'), (req, res) => {
  const fy = fyParam(req.query.year, settings.currentFy());
  const pid = req.user.organization_id;
  res.json({
    producer: getOrg(pid),
    progress: producerProgress(pid, fy),
    credits: all('SELECT * FROM credits WHERE producer_id = ? AND financial_year = ? ORDER BY issue_date', pid, fy),
    orders: all(`SELECT o.*, rc.name AS recycler_name FROM orders o JOIN organizations rc ON rc.id = o.recycler_id WHERE o.producer_id = ? AND o.financial_year = ? ORDER BY o.id`, pid, fy),
    chain: verifyAll(),
    categories: settings.categories(),
  });
});

// ---------- Audit ----------
function scopedEvents(u, limit = 500) {
  if (u.role === 'ADMIN') return all('SELECT * FROM events ORDER BY id DESC LIMIT ?', limit);
  return all(`SELECT e.* FROM events e JOIN event_scope s ON s.event_id = e.id WHERE s.org_ids LIKE ? ORDER BY e.id DESC LIMIT ?`, `%,${u.organization_id},%`, limit);
}

r.get('/audit', (req, res) => {
  const limit = Math.min(2000, Number(req.query.limit) || 300);
  let rows = scopedEvents(req.user, limit);
  if (req.query.action) rows = rows.filter((e) => e.action.includes(String(req.query.action).toUpperCase()));
  const total = req.user.role === 'ADMIN' ? get('SELECT COUNT(*) AS n FROM events').n : null;
  res.json({ events: rows.map((e) => ({ ...e, payload: parseJson(e.payload, e.payload) })), total });
});

r.get('/audit/verify', (req, res) => {
  const result = verifyAll();
  writeEvent(req.user, 'AUDIT_CHAIN_VERIFIED', 'audit', 'chain', { intact: result.intact, checked: result.checked, broken_at: result.brokenAt?.id ?? null });
  res.json(result);
});

r.get('/audit/export', (req, res) => {
  const events = scopedEvents(req.user, 100000).reverse();
  const chain = verifyAll();
  writeEvent(req.user, 'AUDIT_EXPORTED', 'audit', 'export', { format: req.query.format || 'csv', events: events.length });
  if (req.query.format === 'pdf') return auditPdf(res, events, chain);
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lines = ['id,timestamp,actor_id,actor_role,action,entity_type,entity_id,payload,prev_hash,hash',
    ...events.map((e) => [e.id, e.timestamp, e.actor_id, e.actor_role, e.action, e.entity_type, e.entity_id, e.payload, e.prev_hash, e.hash].map(esc).join(','))];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="EPRight-audit-log.csv"');
  res.send(lines.join('\n'));
});

export default r;
