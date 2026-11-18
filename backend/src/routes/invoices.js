import { Router } from 'express';
import path from 'node:path';
import { all, get, run, tx, parseJson, UPLOAD_DIR } from '../db.js';
import { requireRole, upload, fileUrl, bad, str, num, date, fyParam, notFound } from '../http.js';
import { settings, producerProgress, targetsFor } from '../services/domain.js';
import { writeEvent } from '../services/audit.js';
import { extractWithAI, normalizeExtraction, aiConfigured } from '../services/ai.js';
import { matchSample, sampleExtraction } from '../services/sampleExtractions.js';
import { fyOf } from '../lib/fy.js';

const r = Router();
r.use(requireRole('PRODUCER'));

const emptyExtraction = () => ({ invoice_number: '', invoice_date: '', seller_name: '', buyer_name: '', items: [], notes: '' });

async function extractOne(file, { forceSample }) {
  const sampleNo = matchSample(file.originalname);
  const cats = settings.categoryCodes();
  if (!forceSample && settings.aiEnabled() && aiConfigured()) {
    try {
      const extraction = await extractWithAI(path.join(UPLOAD_DIR, file.filename), file.originalname);
      return { extraction, source: 'AI', message: 'Read by AI. Check every value before confirming.' };
    } catch (e) {
      if (sampleNo) return { extraction: normalizeExtraction(sampleExtraction(sampleNo), cats), source: 'SAMPLE', message: `AI extraction failed (${e.message}). Loaded the pre-baked sample extraction instead.` };
      return { extraction: emptyExtraction(), source: 'MANUAL', message: `AI extraction failed (${e.message}). Please enter the values manually.` };
    }
  }
  if (sampleNo) {
    const why = forceSample ? 'Sample extraction loaded.' : !settings.aiEnabled() ? 'AI is turned off in settings, so the pre-baked sample extraction was loaded.' : 'No AI key is configured, so the pre-baked sample extraction was loaded.';
    return { extraction: normalizeExtraction(sampleExtraction(sampleNo), cats), source: 'SAMPLE', message: why };
  }
  return { extraction: emptyExtraction(), source: 'MANUAL', message: settings.aiEnabled() && !aiConfigured() ? 'AI is not configured on this server. Please enter the values manually.' : 'AI is turned off. Please enter the values manually.' };
}

// Upload one or more invoices and get draft extractions (nothing counts until confirmed).
r.post('/extract', upload.array('files', 10), async (req, res) => {
  const producerId = req.user.organization_id;
  const forceSample = req.body.use_sample === 'true' || req.body.use_sample === true;
  const drafts = [];
  const files = req.files || [];
  if (!files.length) {
    // Manual entry draft (no file), or a sample by number for the demo.
    const n = Number(req.body.sample_no);
    const ext = n >= 1 && n <= 3 ? normalizeExtraction(sampleExtraction(n), settings.categoryCodes()) : emptyExtraction();
    const source = n >= 1 && n <= 3 ? 'SAMPLE' : 'MANUAL';
    const ins = run('INSERT INTO invoices (producer_id, file_name, extracted_json, extraction_source, confirmed) VALUES (?,?,?,?,0)', producerId, source === 'SAMPLE' ? `SAMPLE-INV-00${n}.pdf` : null, JSON.stringify(ext), source);
    drafts.push({ invoice_id: Number(ins.lastInsertRowid), file_name: null, file_url: null, source, message: source === 'SAMPLE' ? 'Sample extraction loaded.' : 'Manual entry.', extraction: ext });
  }
  for (const f of files) {
    const out = await extractOne(f, { forceSample });
    const ins = run('INSERT INTO invoices (producer_id, file_url, file_name, extracted_json, extraction_source, confirmed) VALUES (?,?,?,?,?,0)',
      producerId, fileUrl(f), f.originalname, JSON.stringify(out.extraction), out.source);
    const id = Number(ins.lastInsertRowid);
    writeEvent(req.user, 'INVOICE_EXTRACTED', 'invoice', id, { file_name: f.originalname, source: out.source, items: out.extraction.items.length });
    drafts.push({ invoice_id: id, file_name: f.originalname, file_url: fileUrl(f), source: out.source, message: out.message, extraction: out.extraction });
  }
  res.json({ drafts, low_confidence_threshold: settings.thresholds().low_confidence, ai_available: settings.aiEnabled() && aiConfigured() });
});

// Confirm reviewed values. Server recomputes tonnes from value + unit.
r.post('/confirm', (req, res) => {
  const producerId = req.user.organization_id;
  const b = req.body;
  const inv = get('SELECT * FROM invoices WHERE id = ? AND producer_id = ?', num(b.invoice_id, 'Invoice'), producerId);
  if (!inv) throw notFound('Invoice draft');
  if (inv.confirmed) throw bad('This invoice is already confirmed');
  const invoiceNumber = str(b.invoice_number, 'Invoice number', { max: 80 });
  const invoiceDate = date(b.invoice_date, 'Invoice date');
  const dup = get('SELECT id FROM invoices WHERE producer_id = ? AND confirmed = 1 AND lower(invoice_number) = lower(?)', producerId, invoiceNumber);
  if (dup) throw bad(`Invoice ${invoiceNumber} is already confirmed. Each invoice can only be counted once.`);
  const fy = fyParam(b.financial_year, fyOf(invoiceDate));
  const cats = settings.categoryCodes();
  if (!Array.isArray(b.items) || !b.items.length) throw bad('Add at least one packaging line');
  const items = b.items.map((it, i) => {
    const unit = it.unit === 'kg' ? 'kg' : 'tonne';
    const value = num(it.quantity_value, `Line ${i + 1} quantity`, { min: 0.000001, max: 1e7 });
    const category = String(it.category || it.category_suggestion || '');
    if (!cats.includes(category)) throw bad(`Line ${i + 1}: choose a packaging category`);
    return {
      description: str(it.description, `Line ${i + 1} description`, { max: 300 }),
      packaging_type: str(it.packaging_type, `Line ${i + 1} packaging type`, { required: false, max: 200 }) || '',
      quantity_tonnes: Math.round((unit === 'kg' ? value / 1000 : value) * 1000) / 1000,
      category,
      confidence: it.confidence != null ? Math.max(0, Math.min(1, Number(it.confidence))) : null,
    };
  });
  const before = producerProgress(producerId, fy).overall.required;
  tx(() => {
    run('UPDATE invoices SET invoice_number = ?, invoice_date = ?, seller_name = ?, buyer_name = ?, confirmed = 1, financial_year = ? WHERE id = ?',
      invoiceNumber, invoiceDate, str(b.seller_name, 'Seller', { required: false }) || '', str(b.buyer_name, 'Buyer', { required: false }) || '', fy, inv.id);
    for (const it of items) {
      run('INSERT INTO invoice_items (invoice_id, description, packaging_type, quantity_tonnes, category, confidence) VALUES (?,?,?,?,?,?)',
        inv.id, it.description, it.packaging_type, it.quantity_tonnes, it.category, it.confidence);
    }
  });
  const after = producerProgress(producerId, fy);
  writeEvent(req.user, 'INVOICE_CONFIRMED', 'invoice', inv.id, {
    invoice_number: invoiceNumber, financial_year: fy, extraction_source: inv.extraction_source,
    items: items.map((i) => ({ category: i.category, tonnes: i.quantity_tonnes })),
    required_before: before, required_after: after.overall.required, targets: targetsFor(fy),
  });
  res.json({ ok: true, invoice_id: inv.id, financial_year: fy, progress: after });
});

r.get('/', (req, res) => {
  const fy = req.query.year ? fyParam(req.query.year) : null;
  const rows = all(`SELECT * FROM invoices WHERE producer_id = ? AND confirmed = 1 ${fy ? 'AND financial_year = ?' : ''} ORDER BY invoice_date DESC, id DESC`, ...(fy ? [req.user.organization_id, fy] : [req.user.organization_id]));
  res.json(rows.map((i) => ({
    ...i, extracted_json: undefined, extraction: parseJson(i.extracted_json),
    items: all('SELECT * FROM invoice_items WHERE invoice_id = ?', i.id),
  })));
});

r.delete('/:id', (req, res) => {
  const inv = get('SELECT * FROM invoices WHERE id = ? AND producer_id = ?', Number(req.params.id), req.user.organization_id);
  if (!inv) throw notFound('Invoice');
  tx(() => {
    run('DELETE FROM invoice_items WHERE invoice_id = ?', inv.id);
    run('DELETE FROM invoices WHERE id = ?', inv.id);
  });
  if (inv.confirmed) writeEvent(req.user, 'INVOICE_REMOVED', 'invoice', inv.id, { invoice_number: inv.invoice_number, financial_year: inv.financial_year });
  res.json({ ok: true });
});

export default r;
