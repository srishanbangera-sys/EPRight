import { Router } from 'express';
import { all, get, run, parseJson } from '../db.js';
import { requireRole, upload, fileUrl, bad, str, num, date, fyParam, HttpError } from '../http.js';
import { settings, producerProgress, addAlert } from '../services/domain.js';
import { writeEvent } from '../services/audit.js';
import { validateCredit } from '../lib/validation.js';

const r = Router();
r.use(requireRole('PRODUCER'));

// Credit Passport: add a credit bought outside EPRight (Spec 9.10). Validated with rules 1, 2, 4.
r.post('/external', upload.single('document'), (req, res) => {
  const producerId = req.user.organization_id;
  const b = req.body;
  const fy = fyParam(b.year, settings.currentFy());
  const credit = {
    certificate_id: str(b.certificate_id, 'Certificate ID', { max: 80 }),
    source_name: str(b.source_name, 'Source name', { max: 120 }),
    recycler_name: str(b.recycler_name, 'Recycler name', { max: 200 }),
    category: str(b.category, 'Category'),
    tonnes: num(b.tonnes, 'Tonnes', { min: 0.001, max: 100000 }),
    issue_date: date(b.issue_date, 'Issue date'),
    price_per_tonne: num(b.price_per_tonne, 'Price per tonne', { min: 0, required: false }),
    source: 'EXTERNAL',
  };
  if (!settings.categoryCodes().includes(credit.category)) throw bad('Unknown category');
  const prog = producerProgress(producerId, fy);
  const obligationCategories = Object.values(prog.obligations).filter((x) => x.required_tonnes > 0).map((x) => x.category);
  const existing = get('SELECT c.id, c.producer_id FROM credits c WHERE c.certificate_id = ?', credit.certificate_id);
  const result = validateCredit({ credit, duplicate: !!existing, obligationCategories, financialYear: fy });

  if (existing) {
    writeEvent(req.user, 'CREDIT_REJECTED_DUPLICATE', 'credit', credit.certificate_id, { ...credit, financial_year: fy, existing_credit_id: existing.id, reasons: result.reasons });
    addAlert({ audience_role: 'ADMIN', type: 'POSSIBLE_FRAUD', severity: 'danger', message: `Possible fraud: certificate ID ${credit.certificate_id} was submitted again (external credit by producer #${producerId}). Rejected.`, link: '/admin/flagged' });
    addAlert({ org_id: producerId, type: 'VALIDATION_FLAGGED', severity: 'danger', message: `Certificate ${credit.certificate_id} was rejected: this ID has already been used.`, link: '/producer/credits' });
    throw new HttpError(409, 'Rejected: this certificate ID has already been used. Duplicate use is flagged as possible fraud.', { validation: result });
  }

  const status = result.valid ? 'VALIDATED' : 'FLAGGED';
  const ins = run(`INSERT INTO credits (producer_id, certificate_id, recycler_name, category, tonnes, issue_date, financial_year, source, source_name, price_per_tonne, document_url, status, validation_reasons)
    VALUES (?,?,?,?,?,?,?, 'EXTERNAL', ?,?,?,?,?)`,
  producerId, credit.certificate_id, credit.recycler_name, credit.category, credit.tonnes, credit.issue_date, fy, credit.source_name, credit.price_per_tonne, req.file ? fileUrl(req.file) : null, status, JSON.stringify(result.reasons));
  const id = Number(ins.lastInsertRowid);
  writeEvent(req.user, status === 'VALIDATED' ? 'EXTERNAL_CREDIT_VALIDATED' : 'EXTERNAL_CREDIT_FLAGGED', 'credit', id, { ...credit, financial_year: fy, rules: result.reasons.map((x) => `${x.rule}:${x.ok ? 'pass' : 'fail'}`) });
  if (status === 'FLAGGED') {
    addAlert({ org_id: producerId, type: 'VALIDATION_FLAGGED', severity: 'danger', message: `External credit ${credit.certificate_id} was flagged: ${result.reasons.filter((x) => !x.ok).map((x) => x.text).join(' ')}`, link: '/producer/credits' });
    addAlert({ audience_role: 'ADMIN', type: 'VALIDATION_FLAGGED', severity: 'warning', message: `External credit ${credit.certificate_id} failed validation.`, link: '/admin/flagged' });
  }
  res.status(201).json({ credit: get('SELECT * FROM credits WHERE id = ?', id), validation: result, progress: producerProgress(producerId, fy) });
});

r.get('/', (req, res) => {
  const fy = req.query.year ? fyParam(req.query.year) : null;
  const params = [req.user.organization_id];
  let sql = 'SELECT * FROM credits WHERE producer_id = ?';
  if (fy) { sql += ' AND financial_year = ?'; params.push(fy); }
  if (req.query.source) { sql += ' AND source = ?'; params.push(String(req.query.source)); }
  sql += ' ORDER BY issue_date DESC, id DESC';
  const credits = all(sql, ...params).map((c) => ({ ...c, validation_reasons: parseJson(c.validation_reasons, []) }));
  const bySource = {};
  for (const c of credits) {
    const key = c.source === 'PLATFORM' ? 'EPRight marketplace' : c.source_name || 'External';
    bySource[key] ??= { source: key, type: c.source, tonnes: 0, validated_tonnes: 0, count: 0 };
    bySource[key].tonnes += c.tonnes;
    bySource[key].count += 1;
    if (c.status === 'VALIDATED') bySource[key].validated_tonnes += c.tonnes;
  }
  res.json({ credits, by_source: Object.values(bySource) });
});

export default r;
