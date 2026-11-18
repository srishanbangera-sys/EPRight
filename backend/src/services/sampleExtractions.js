// Pre-baked extractions for the three SAMPLE invoices (Spec 9.2), used when the AI is disabled or fails.
// Totals: Category I 125 t, Category II 125 t = 250 t placed. At 40% placeholder targets, required = 100 t.

export const SAMPLE_EXTRACTIONS = {
  1: {
    invoice_number: 'SAMPLE-INV-001',
    invoice_date: '2026-05-14',
    seller_name: 'Sample PolyPack Industries (SAMPLE)',
    buyer_name: 'Sample Snacks Pvt Ltd',
    items: [
      { description: 'PET jars 500 ml with HDPE caps', packaging_type: 'Rigid PET jar', quantity_value: 62, unit: 'tonne', quantity_tonnes: 62, category_suggestion: 'I', confidence: 0.96 },
      { description: 'HDPE tubs 1 kg', packaging_type: 'Rigid HDPE tub', quantity_value: 28000, unit: 'kg', quantity_tonnes: 28, category_suggestion: 'I', confidence: 0.91 },
    ],
    notes: 'SAMPLE invoice. Rigid packaging only.',
  },
  2: {
    invoice_number: 'SAMPLE-INV-002',
    invoice_date: '2026-07-02',
    seller_name: 'Sample FlexiFilms Ltd (SAMPLE)',
    buyer_name: 'Sample Snacks Pvt Ltd',
    items: [
      { description: 'LDPE carry pouches printed', packaging_type: 'Flexible LDPE pouch', quantity_value: 70, unit: 'tonne', quantity_tonnes: 70, category_suggestion: 'II', confidence: 0.94 },
      { description: 'Shrink wrap film rolls', packaging_type: 'Flexible shrink film', quantity_value: 30000, unit: 'kg', quantity_tonnes: 30, category_suggestion: 'II', confidence: 0.88 },
    ],
    notes: 'SAMPLE invoice. Flexible packaging only.',
  },
  3: {
    invoice_number: 'SAMPLE-INV-003',
    invoice_date: '2026-09-21',
    seller_name: 'Sample Allied Packaging Co (SAMPLE)',
    buyer_name: 'Sample Snacks Pvt Ltd',
    items: [
      { description: 'PP trays for namkeen boxes', packaging_type: 'Rigid PP tray', quantity_value: 35000, unit: 'kg', quantity_tonnes: 35, category_suggestion: 'I', confidence: 0.83 },
      { description: 'Snack sachet film (single layer, mixed resin)', packaging_type: 'Flexible film, possibly multi-layer', quantity_value: 25, unit: 'tonne', quantity_tonnes: 25, category_suggestion: 'II', confidence: 0.62 },
    ],
    notes: 'SAMPLE invoice. Line 2 description is ambiguous between Category II and III; please confirm.',
  },
};

export function matchSample(fileName = '') {
  const m = String(fileName).match(/inv[-_ ]?0*([123])\b/i) || String(fileName).match(/invoice[-_ ]?([123])\b/i);
  return m ? Number(m[1]) : null;
}

export function sampleExtraction(n) {
  return structuredClone(SAMPLE_EXTRACTIONS[n]);
}
