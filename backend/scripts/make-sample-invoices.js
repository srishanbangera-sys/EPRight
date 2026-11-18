// Generates the three SAMPLE invoice PDFs used in the demo (../sample-invoices).
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_EXTRACTIONS } from '../src/services/sampleExtractions.js';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sample-invoices');
fs.mkdirSync(outDir, { recursive: true });

const RATES = { 'Rigid PET jar': 118000, 'Rigid HDPE tub': 112, 'Flexible LDPE pouch': 96000, 'Flexible shrink film': 88, 'Rigid PP tray': 104, 'Flexible film, possibly multi-layer': 101000 };

for (const [n, inv] of Object.entries(SAMPLE_EXTRACTIONS)) {
  const file = path.join(outDir, `SAMPLE-INV-00${n}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(fs.createWriteStream(file));
  doc.save().rotate(-30, { origin: [300, 420] }).fontSize(90).fillColor('#eeeeee').text('SAMPLE', 90, 380).restore();
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(18).text(inv.seller_name);
  doc.font('Helvetica').fontSize(9).fillColor('#555').text('Plot 14, Sample Industrial Estate, India  |  GSTIN 29SAMPLE0000X1Z9  |  SAMPLE DOCUMENT FOR DEMO');
  doc.moveDown();
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(14).text('TAX INVOICE');
  doc.font('Helvetica').fontSize(10)
    .text(`Invoice No: ${inv.invoice_number}`)
    .text(`Invoice Date: ${inv.invoice_date.split('-').reverse().join('/')}`)
    .text(`Bill To: ${inv.buyer_name}, Bengaluru, Karnataka (GSTIN 29AABCS1234F1Z5)`);
  doc.moveDown();
  const y0 = doc.y;
  const cols = [50, 70, 270, 400, 460];
  doc.font('Helvetica-Bold').fontSize(9);
  ['#', 'Description of goods', 'Packaging', 'Qty', 'Unit'].forEach((h, i) => doc.text(h, cols[i], y0));
  doc.moveTo(50, y0 + 14).lineTo(545, y0 + 14).stroke();
  let y = y0 + 20;
  doc.font('Helvetica').fontSize(9);
  inv.items.forEach((it, i) => {
    doc.text(String(i + 1), cols[0], y);
    doc.text(it.description, cols[1], y, { width: 190 });
    doc.text(it.packaging_type, cols[2], y, { width: 125 });
    doc.text(it.quantity_value.toLocaleString('en-IN'), cols[3], y);
    doc.text(it.unit === 'kg' ? 'KG' : 'MT', cols[4], y);
    y += 30;
  });
  doc.moveTo(50, y).lineTo(545, y).stroke();
  const total = inv.items.reduce((s, it) => s + it.quantity_value * (RATES[it.packaging_type] || 100), 0);
  doc.font('Helvetica-Bold').text(`Taxable value: INR ${total.toLocaleString('en-IN')}   GST 18%: INR ${Math.round(total * 0.18).toLocaleString('en-IN')}`, 50, y + 10);
  doc.font('Helvetica').fontSize(8).fillColor('#555').text('HSN 3923 (articles for the conveyance or packing of goods, of plastics). MT = metric tonne. This is a SAMPLE invoice generated for the EPRight demo. Not a real tax document.', 50, y + 40, { width: 495 });
  doc.end();
  console.log('Wrote', file);
}
