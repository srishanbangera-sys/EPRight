// Seed SAMPLE demo data (Spec 14). Safe to run repeatedly: it wipes and rebuilds the database.
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { run, get, resetDatabase, setSetting } from './db.js';
import { writeEvent, SYSTEM } from './services/audit.js';
import { recomputeOrgStatus, runExpiryCheck } from './services/domain.js';
import { today, addDays, fyOf } from './lib/fy.js';

export function seed({ quiet = false } = {}) {
  resetDatabase();
  const T = today();
  const FY = fyOf(T);
  const start = parseInt(FY.slice(0, 4), 10);
  const PREV_FY = `${start - 1}-${String(start % 100).padStart(2, '0')}`;
  const NEXT_FY = `${start + 1}-${String((start + 2) % 100).padStart(2, '0')}`;
  const pw = bcrypt.hashSync('demo123', 8);

  // ---- Settings (placeholders: verify on the CPCB portal) ----
  setSetting('categories', [
    { code: 'I', name: 'Category I: Rigid plastic packaging' },
    { code: 'II', name: 'Category II: Flexible plastic packaging' },
    { code: 'III', name: 'Category III: Multi-layered plastic packaging' },
    { code: 'IV', name: 'Category IV: Compostable plastic packaging' },
  ]);
  for (const fy of [PREV_FY, FY, NEXT_FY]) for (const c of ['I', 'II', 'III', 'IV']) run('INSERT INTO settings_targets (financial_year, category, target_pct) VALUES (?,?,?)', fy, c, 40);
  setSetting('compensation_rates', [5000, 10000, 20000]);
  setSetting('thresholds', { price_deviation_pct: 25, on_time_min_pct: 80, on_time_min_orders: 3, doc_expiry_warn_days: 60, new_listing_days: 7, at_risk_days: 30, low_confidence: 0.7, deadline_alert_days: 365 });
  setSetting('filing_deadline_by_year', { [PREV_FY]: `${start}-06-30`, [FY]: `${start + 1}-06-30`, [NEXT_FY]: `${start + 2}-06-30` });
  setSetting('current_fy', FY);
  setSetting('auto_release', true);
  setSetting('ai_enabled', true);

  writeEvent(SYSTEM, 'SYSTEM_INITIALISED', 'system', 'seed', { note: 'SAMPLE demo data loaded', financial_year: FY, date: T });

  const org = (o) => {
    const r = run('INSERT INTO organizations (type, name, gst_no, cpcb_reg_id, location, contact, categories, monthly_capacity_t, status, is_sample) VALUES (?,?,?,?,?,?,?,?,?,1)',
      o.type, o.name, o.gst, o.cpcb, o.location, o.contact || null, JSON.stringify(o.categories || []), o.capacity ?? null, 'PENDING');
    return Number(r.lastInsertRowid);
  };
  const doc = (orgId, type, number, from, to) => run('INSERT INTO documents (organization_id, type, number, valid_from, valid_to, file_url, status, review_note) VALUES (?,?,?,?,?,?,?,?)',
    orgId, type, number, from, to, null, to < T ? 'EXPIRED' : 'APPROVED', 'SAMPLE document, approved at seed time');
  const user = (email, name, role, orgId) => run('INSERT INTO users (email, name, password_hash, role, organization_id, is_demo) VALUES (?,?,?,?,?,1)', email, name, pw, role, orgId);

  // ---- Platform admin ----
  const platform = org({ type: 'PLATFORM', name: 'EPRight Platform', gst: null, cpcb: null, location: 'Bengaluru' });
  run("UPDATE organizations SET status = 'VERIFIED' WHERE id = ?", platform);
  user('admin@epright.demo', 'Asha (EPRight Admin)', 'ADMIN', platform);

  // ---- Producers ----
  const snacks = org({ type: 'PRODUCER', name: 'Sample Snacks Pvt Ltd', gst: '29AABCS1234F1Z5', cpcb: 'PIBO-SAMPLE-KA-0042', location: 'Bengaluru, Karnataka', contact: 'compliance@samplesnacks.example' });
  doc(snacks, 'REGISTRATION_CERTIFICATE', 'PIBO-SAMPLE-KA-0042', addDays(T, -400), addDays(T, 650));
  user('producer@epright.demo', 'Priya (Sample Snacks)', 'PRODUCER', snacks);

  const foods = org({ type: 'PRODUCER', name: 'Sample Foods Co (SAMPLE)', gst: '27AACCF9876K1Z2', cpcb: 'PIBO-SAMPLE-MH-0108', location: 'Pune, Maharashtra' });
  doc(foods, 'REGISTRATION_CERTIFICATE', 'PIBO-SAMPLE-MH-0108', addDays(T, -700), addDays(T, 400));
  run('INSERT INTO users (email, name, password_hash, role, organization_id, is_demo) VALUES (?,?,?,?,?,0)', 'foods@epright.demo', 'Sample Foods buyer', pw, 'PRODUCER', foods);

  // ---- Six recyclers ----
  const R = {};
  const recyclers = [
    { key: 'A', name: 'Recycler A: GreenLoop Plastics (SAMPLE)', gst: '29AAGCG1111A1Z1', cpcb: 'PWP-SAMPLE-KA-1001', location: 'Hosur Industrial Area, Tamil Nadu', categories: ['I', 'II', 'III'], capacity: 300, reg: 700, cto: 600 },
    { key: 'B', name: 'Recycler B: BlueRiver Recycling (SAMPLE)', gst: '27AABCB2222B1Z2', cpcb: 'PWP-SAMPLE-MH-1002', location: 'Taloja MIDC, Maharashtra', categories: ['I', 'II'], capacity: 200, reg: 650, cto: 500 },
    { key: 'C', name: 'Recycler C: QuickCycle Polymers (SAMPLE)', gst: '24AACCQ3333C1Z3', cpcb: 'PWP-SAMPLE-GJ-1003', location: 'Vapi, Gujarat', categories: ['I', 'II'], capacity: 250, reg: 500, cto: 450 },
    { key: 'D', name: 'Recycler D: OldMill Reprocessors (SAMPLE)', gst: '09AADCO4444D1Z4', cpcb: 'PWP-SAMPLE-UP-1004', location: 'Ghaziabad, Uttar Pradesh', categories: ['I', 'II'], capacity: 150, reg: -15, cto: 300 },
    { key: 'E', name: 'Recycler E: Sunrise Recyclers (SAMPLE)', gst: '33AAECS5555E1Z5', cpcb: 'PWP-SAMPLE-TN-1005', location: 'Ambattur, Tamil Nadu', categories: ['I', 'II'], capacity: 100, reg: 400, cto: 20 },
    { key: 'F', name: 'Recycler F: Rigid-Only Recovery (SAMPLE)', gst: '07AAFCR6666F1Z6', cpcb: 'PWP-SAMPLE-DL-1006', location: 'Narela, Delhi', categories: ['I', 'III'], capacity: 150, reg: 500, cto: 500 },
  ];
  for (const r of recyclers) {
    const id = org({ type: 'RECYCLER', name: r.name, gst: r.gst, cpcb: r.cpcb, location: r.location, categories: r.categories, capacity: r.capacity, contact: `ops.${r.key.toLowerCase()}@recycler.example` });
    doc(id, 'REGISTRATION_CERTIFICATE', r.cpcb, addDays(T, -500), addDays(T, r.reg));
    doc(id, 'CONSENT_TO_OPERATE', `CTO-SAMPLE-${r.key}-2025`, addDays(T, -500), addDays(T, r.cto));
    user(`recycler.${r.key.toLowerCase()}@epright.demo`, `${r.name.split(':')[0]} operator`, 'RECYCLER', id);
    R[r.key] = id;
  }
  for (const id of [snacks, foods, ...Object.values(R)]) recomputeOrgStatus(id);

  // ---- Past completed orders (previous FY) so on-time rates and ratings exist ----
  const histListing = {};
  for (const [k, id] of Object.entries(R)) {
    const r = run("INSERT INTO listings (recycler_id, category, tonnes_total, tonnes_available, price_per_tonne, expected_completion, facility, status, created_at) VALUES (?,?,?,?,?,?,?, 'SOLD_OUT', ?)",
      id, 'I', 200, 0, 3900, `${start}-01-31`, 'Main plant', `${start - 1}-06-01T00:00:00.000Z`);
    histListing[k] = Number(r.lastInsertRowid);
  }
  const history = { A: { n: 5, late: 0, scores: [5, 5, 4, 5, 5] }, B: { n: 4, late: 0, scores: [4, 5, 4, 4] }, C: { n: 10, late: 3, scores: [3, 4, 3, 3, 2, 4, 3, 3, 4, 3] }, E: { n: 2, late: 0, scores: [4, 4] } };
  let cert = 1000;
  for (const [k, h] of Object.entries(history)) {
    for (let i = 0; i < h.n; i++) {
      const expected = `${start - 1}-${String(5 + (i % 7)).padStart(2, '0')}-${String(10 + i).padStart(2, '0')}`;
      const late = i < h.late;
      const delivered = addDays(expected, late ? 18 : -4) + 'T10:00:00.000Z';
      const tonnes = 10 + (i % 4) * 5;
      const o = run(`INSERT INTO orders (listing_id, producer_id, recycler_id, category, financial_year, tonnes, price_per_tonne, total, status, escrow_status, expected_completion,
          delivered_certificate_id, delivered_tonnes, delivered_category, delivered_issue_date, delivered_at, received_at, is_sample, created_at)
        VALUES (?,?,?,?,?,?,?,?, 'COMPLETED', 'RELEASED', ?, ?, ?, 'I', ?, ?, ?, 1, ?)`,
      histListing[k], foods, R[k], 'I', PREV_FY, tonnes, 3900, tonnes * 3900, expected, `HIST-${k}-${++cert}`, tonnes, delivered.slice(0, 10), delivered, delivered, addDays(expected, -60) + 'T09:00:00.000Z');
      const oid = Number(o.lastInsertRowid);
      run('INSERT INTO ratings (order_id, from_org, to_org, score, comment) VALUES (?,?,?,?,?)', oid, foods, R[k], h.scores[i], late ? 'Delivered late (SAMPLE)' : 'Smooth delivery (SAMPLE)');
    }
  }

  // Pre-existing VALID certificate ID, so duplicate rejection can be demonstrated.
  run(`INSERT INTO credits (producer_id, order_id, certificate_id, recycler_name, recycler_id, category, tonnes, issue_date, financial_year, source, source_name, status, validation_reasons)
    VALUES (?, NULL, 'CPCB-PWP-SAMPLE-004417', ?, ?, 'I', 12, ?, ?, 'EXTERNAL', 'Direct recycler (SAMPLE)', 'VALIDATED', '[]')`,
  foods, recyclers[0].name, R.A, `${start - 1}-11-20`, PREV_FY);
  writeEvent(SYSTEM, 'SEED_CREDIT_CREATED', 'credit', 'CPCB-PWP-SAMPLE-004417', { note: 'Pre-existing SAMPLE certificate for duplicate-ID demo', producer: 'Sample Foods Co (SAMPLE)' }, [foods]);

  // ---- Current marketplace listings (about 12, with a price spread and one priced far above the median) ----
  const L = (k, category, tonnes, price, days, ageDays = 20, facility = null) => run(
    "INSERT INTO listings (recycler_id, category, tonnes_total, tonnes_available, price_per_tonne, expected_completion, facility, status, created_at) VALUES (?,?,?,?,?,?,?, 'ACTIVE', ?)",
    R[k], category, tonnes, tonnes, price, addDays(T, days), facility || recyclers.find((r) => r.key === k).location, addDays(T, -ageDays) + 'T08:00:00.000Z');
  L('A', 'I', 40, 4200, 60);
  L('A', 'II', 50, 3600, 75);
  L('A', 'III', 30, 5200, 90);
  L('B', 'I', 35, 4000, 50);
  L('B', 'II', 30, 3400, 80);
  L('B', 'I', 20, 7600, 30, 12);   // far above median -> AMBER
  L('C', 'I', 50, 3700, 65);       // on-time 70% -> AMBER
  L('C', 'II', 40, 3000, 70);
  L('D', 'I', 60, 2800, 40);       // documents expired -> hidden
  L('D', 'II', 40, 2600, 45);
  L('E', 'II', 25, 3300, 13);      // documents expire within 30 days -> AT_RISK
  L('F', 'II', 30, 3200, 45);      // not registered for Category II -> RED
  L('F', 'I', 25, 4100, 55, 2);    // new listing, no history -> info

  writeEvent(SYSTEM, 'SEED_COMPLETED', 'system', 'seed', { producers: 2, recyclers: 6, listings: 13, financial_year: FY });
  runExpiryCheck(SYSTEM);
  if (!quiet) {
    const s = (k) => get('SELECT status FROM organizations WHERE id = ?', R[k]).status;
    console.log(`Seeded SAMPLE data for FY ${FY}. Recycler statuses: ${Object.keys(R).map((k) => `${k}=${s(k)}`).join(', ')}`);
    console.log('Demo accounts (password demo123): producer@epright.demo, recycler.a..f@epright.demo, admin@epright.demo');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) seed();
