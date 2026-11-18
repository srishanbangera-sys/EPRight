import PDFDocument from 'pdfkit';

const GREEN = '#0f5132';
const TEAL = '#0d9488';
const GREY = '#64748b';
const DISCLAIMER = 'Final figures must be confirmed on the official CPCB EPR portal. Demo data is sample data.';

const inr = (n) => 'INR ' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const t3 = (n) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('en-IN');

function newDoc(res, filename) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: filename, Author: 'EPRight' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

function header(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 78).fill(GREEN);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('EPRight', 48, 22);
  doc.font('Helvetica').fontSize(9).fillColor('#ccfbf1').text('Get your EPR right.  Every tonne tracked. Every credit verified.', 48, 48);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(15).text(title, 48, 100);
  if (subtitle) doc.font('Helvetica').fontSize(9.5).fillColor(GREY).text(subtitle, { width: doc.page.width - 96 });
  doc.moveDown(0.8);
}

function section(doc, title) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(TEAL).text(title, 48);
  doc.moveTo(48, doc.y + 2).lineTo(doc.page.width - 48, doc.y + 2).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.moveDown(0.5);
}

function table(doc, cols, rows) {
  const x0 = 48;
  const width = doc.page.width - 96;
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const widths = cols.map((c) => (c.w / totalW) * width);
  const drawRow = (cells, bold, fill) => {
    const h = Math.max(...cells.map((c, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).heightOfString(String(c ?? ''), { width: widths[i] - 8 }))) + 8;
    if (doc.y + h > doc.page.height - 70) doc.addPage();
    const y = doc.y;
    if (fill) doc.rect(x0, y, width, h).fill(fill);
    let x = x0;
    cells.forEach((c, i) => {
      doc.fillColor('#111827').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
        .text(String(c ?? ''), x + 4, y + 4, { width: widths[i] - 8, align: cols[i].align || 'left' });
      x += widths[i];
    });
    doc.y = y + h;
    doc.x = x0;
  };
  drawRow(cols.map((c) => c.label), true, '#f1f5f9');
  rows.forEach((r, i) => drawRow(r, false, i % 2 ? '#fafafa' : null));
  if (!rows.length) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GREY).text('None', x0 + 4);
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 40;
    doc.font('Helvetica').fontSize(7.5).fillColor(GREY)
      .text(`${DISCLAIMER}   Page ${i + 1} of ${range.count}`, 48, y, { width: doc.page.width - 96, align: 'center', lineBreak: false });
  }
}

export function filingReportPdf(res, { producer, progress, credits, orders, chain, categories, generatedBy }) {
  const fy = progress.financial_year;
  const doc = newDoc(res, `EPRight-filing-summary-${fy}.pdf`);
  header(doc, 'Filing preparation summary. Confirm all figures on the CPCB portal.',
    `Financial year ${fy}  |  Filing deadline ${progress.filing_deadline}  |  Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by ${generatedBy}`);

  section(doc, 'Producer details');
  doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
  [['Company', producer.name], ['GST number', producer.gst_no], ['CPCB registration ID', producer.cpcb_reg_id], ['Verification status', producer.status], ['Contact', producer.contact || '-']]
    .forEach(([k, v]) => doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v ?? '-')));

  section(doc, 'Category-wise obligation (tonnes)');
  const catName = (c) => categories.find((x) => x.code === c)?.name || `Category ${c}`;
  const rows = Object.values(progress.byCategory).filter((c) => c.required > 0 || c.covered > 0 || c.committed > 0)
    .map((c) => [catName(c.category), t3(c.placed_tonnes), `${c.target_pct}%`, t3(c.required), t3(c.covered), t3(c.committed), t3(c.remaining)]);
  const o = progress.overall;
  rows.push(['Total', '', '', t3(o.required), t3(o.covered), t3(o.committed), t3(o.remaining)]);
  table(doc, [
    { label: 'Category', w: 3 }, { label: 'Placed', w: 1.1, align: 'right' }, { label: 'Target*', w: 0.9, align: 'right' },
    { label: 'Required', w: 1.1, align: 'right' }, { label: 'Covered', w: 1.1, align: 'right' }, { label: 'Committed', w: 1.1, align: 'right' }, { label: 'Remaining', w: 1.1, align: 'right' },
  ], rows);
  doc.moveDown(0.3).font('Helvetica-Oblique').fontSize(8).fillColor(GREY)
    .text(`* Target percentages are placeholder settings; verify on the CPCB portal. Estimated exposure if unfilled: ${inr(progress.exposure.current)} (placeholder rate).`);

  section(doc, 'Credits');
  table(doc, [
    { label: 'Certificate ID', w: 2.2 }, { label: 'Recycler', w: 2.2 }, { label: 'Source', w: 1.8 }, { label: 'Cat.', w: 0.6 },
    { label: 'Tonnes', w: 0.9, align: 'right' }, { label: 'Issue date', w: 1.2 }, { label: 'Status', w: 1.1 },
  ], credits.map((c) => [c.certificate_id, c.recycler_name, c.source === 'EXTERNAL' ? `External: ${c.source_name || '-'}` : 'EPRight platform', c.category, t3(c.tonnes), c.issue_date, c.status]));

  section(doc, 'Orders');
  table(doc, [
    { label: 'Order', w: 0.8 }, { label: 'Recycler', w: 2.3 }, { label: 'Cat.', w: 0.6 }, { label: 'Tonnes', w: 0.9, align: 'right' },
    { label: 'Total', w: 1.4, align: 'right' }, { label: 'Status', w: 1.3 }, { label: 'Escrow', w: 1.1 },
  ], orders.map((x) => [`#${x.id}`, x.recycler_name, x.category, t3(x.tonnes), inr(x.total), x.status, x.escrow_status === 'NONE' ? '-' : `${x.escrow_status} (sim.)`]));

  section(doc, 'Audit chain status');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(chain.intact ? '#15803d' : '#b91c1c')
    .text(chain.intact ? `Chain intact. ${chain.checked} events verified.` : `Chain BROKEN at event #${chain.brokenAt?.id}: ${chain.reason}`);
  doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`Head hash: ${chain.head}`);
  doc.text('The audit log is a tamper-evident SHA-256 hash chain maintained by EPRight. It is not a blockchain.');
  section(doc, 'Notes');
  doc.font('Helvetica').fontSize(8.5).fillColor('#111827').list([
    'EPRight does not issue legal EPR certificates. Recyclers generate and transfer certificates on the official CPCB portal.',
    'EPRight does not integrate with the CPCB portal. Credit receipt is confirmed by the producer from their own portal account.',
    'Payments and escrow shown are SIMULATED.',
    'Externally sourced credits are marked as such: confirm them on the portal.',
  ]);
  footer(doc);
  doc.end();
}

export function auditPdf(res, events, chain) {
  const doc = newDoc(res, 'EPRight-audit-log.pdf');
  header(doc, 'Audit log export (tamper-evident hash chain)', `${events.length} events  |  ${chain.intact ? 'Chain intact' : `Chain broken at event #${chain.brokenAt?.id}`}  |  Exported ${new Date().toISOString()}`);
  table(doc, [
    { label: '#', w: 0.5 }, { label: 'Time (UTC)', w: 1.7 }, { label: 'Actor', w: 1.1 }, { label: 'Action', w: 2 }, { label: 'Entity', w: 1.2 }, { label: 'Hash', w: 2 },
  ], events.map((e) => [e.id, e.timestamp.replace('T', ' ').slice(0, 19), `${e.actor_role}${e.actor_id ? ' #' + e.actor_id : ''}`, e.action, `${e.entity_type || ''} ${e.entity_id || ''}`, e.hash.slice(0, 20) + '...']));
  footer(doc);
  doc.end();
}
