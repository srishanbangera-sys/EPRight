import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safetyCheck } from '../src/lib/safetyCheck.js';
import { computeObligations, computeProgress, progressFor } from '../src/lib/obligation.js';
import { computeHash, verifyChain, GENESIS_HASH } from '../src/lib/auditChain.js';
import { validateCredit } from '../src/lib/validation.js';
import { canTransition } from '../src/lib/stateMachine.js';
import { buildBasket, effectiveCost } from '../src/lib/basket.js';
import { stripFences, normalizeExtraction } from '../src/services/ai.js';
import { fyOf } from '../src/lib/fy.js';

const TODAY = '2026-11-18';
const goodRecycler = {
  id: 1, name: 'R', status: 'VERIFIED', categories: ['I', 'II'], completedOrders: 5, onTimeRate: 100, openDisputes: 0,
  documents: [{ type: 'REGISTRATION_CERTIFICATE', status: 'APPROVED', valid_to: '2028-01-01' }, { type: 'CONSENT_TO_OPERATE', status: 'APPROVED', valid_to: '2028-01-01' }],
};
const listing = { id: 1, recycler_id: 1, category: 'I', tonnes_available: 40, price_per_tonne: 4000, expected_completion: '2027-01-15', created_at: '2026-10-01T00:00:00Z' };
const base = { listing, recycler: goodRecycler, remaining: 50, tonnes: 20, medianPrice: 4000, filingDeadline: '2027-06-30', today: TODAY };

test('safety check: clean purchase is GREEN with score 100', () => {
  const r = safetyCheck(base);
  assert.equal(r.status, 'GREEN');
  assert.equal(r.score, 100);
});

test('safety check: category not registered is RED', () => {
  const r = safetyCheck({ ...base, listing: { ...listing, category: 'III' }, remaining: 10 });
  assert.equal(r.status, 'RED');
  assert.ok(r.reasons.some((x) => x.code === 'CATEGORY_NOT_REGISTERED'));
});

test('safety check: expired document, no remaining obligation, over availability are hard failures', () => {
  const expired = { ...goodRecycler, documents: [{ type: 'REGISTRATION_CERTIFICATE', status: 'EXPIRED', valid_to: '2026-11-01' }, goodRecycler.documents[1]] };
  assert.equal(safetyCheck({ ...base, recycler: { ...expired, status: 'EXPIRED' } }).status, 'RED');
  assert.equal(safetyCheck({ ...base, remaining: 0 }).status, 'RED');
  const over = safetyCheck({ ...base, tonnes: 41, remaining: 100 });
  assert.equal(over.status, 'RED');
  assert.ok(over.reasons.some((x) => x.code === 'EXCEEDS_AVAILABILITY'));
});

test('safety check: documents expiring before completion is RED', () => {
  const rec = { ...goodRecycler, documents: [{ ...goodRecycler.documents[0], valid_to: '2026-12-31' }, goodRecycler.documents[1]] };
  const r = safetyCheck({ ...base, recycler: rec });
  assert.ok(r.reasons.some((x) => x.code === 'DOCS_EXPIRE_BEFORE_COMPLETION'));
  assert.equal(r.status, 'RED');
});

test('safety check: warnings give AMBER and subtract 15 each', () => {
  const r = safetyCheck({ ...base, listing: { ...listing, price_per_tonne: 7600 }, recycler: { ...goodRecycler, onTimeRate: 70, completedOrders: 10 } });
  assert.equal(r.status, 'AMBER');
  assert.equal(r.score, 70);
  const over = safetyCheck({ ...base, tonnes: 30, remaining: 20 });
  assert.equal(over.status, 'AMBER');
  assert.equal(over.suggestedMax, 20);
});

test('safety check: on-time rate needs at least 3 completed orders', () => {
  const r = safetyCheck({ ...base, recycler: { ...goodRecycler, onTimeRate: 50, completedOrders: 2 } });
  assert.equal(r.status, 'GREEN');
});

test('progress math matches spec 6.1', () => {
  const ob = computeObligations([{ category: 'I', quantity_tonnes: 125 }, { category: 'II', quantity_tonnes: 125 }], { I: 40, II: 40 }, ['I', 'II', 'III', 'IV']);
  assert.equal(ob.I.required_tonnes, 50);
  const p = computeProgress(ob,
    [{ category: 'I', tonnes: 20, status: 'VALIDATED' }, { category: 'I', tonnes: 5, status: 'FLAGGED' }],
    [{ category: 'I', tonnes: 10, status: 'PAID_ESCROW' }, { category: 'II', tonnes: 70, status: 'ACCEPTED' }, { category: 'II', tonnes: 9, status: 'PLACED' }, { category: 'I', tonnes: 20, status: 'COMPLETED' }]);
  assert.equal(p.byCategory.I.covered, 20);
  assert.equal(p.byCategory.I.committed, 10);
  assert.equal(p.byCategory.I.remaining, 20);
  assert.equal(p.byCategory.II.remaining, 0);
  assert.equal(p.byCategory.II.surplus, 20);
  assert.equal(p.overall.remaining, 20);
  assert.deepEqual(progressFor(0, 0, 0).pct, { covered: 0, committed: 0, remaining: 0 });
});

test('hash chain detects an edited event', () => {
  const events = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= 4; i++) {
    const e = { id: i, timestamp: `2026-11-18T00:00:0${i}.000Z`, actor_id: 1, action: 'X', payload: JSON.stringify({ i }), prev_hash: prev };
    e.hash = computeHash(e.prev_hash, e.timestamp, e.actor_id, e.action, e.payload);
    prev = e.hash;
    events.push(e);
  }
  assert.equal(verifyChain(events).intact, true);
  events[1].payload = JSON.stringify({ i: 99 });
  const r = verifyChain(events);
  assert.equal(r.intact, false);
  assert.equal(r.brokenAt.id, 2);
});

test('credit validation: duplicate certificate is always rejected', () => {
  const r = validateCredit({ credit: { certificate_id: 'X', category: 'I', tonnes: 5, issue_date: '2026-10-01', source: 'EXTERNAL' }, duplicate: true, obligationCategories: ['I'], financialYear: '2026-27' });
  assert.equal(r.valid, false);
  assert.equal(r.fraud, true);
});

test('credit validation: platform rules incl. tonnes mismatch and FY', () => {
  const ok = validateCredit({ credit: { certificate_id: 'A', category: 'I', tonnes: 10, issue_date: '2026-11-18', source: 'PLATFORM' }, duplicate: false, obligationCategories: ['I'], financialYear: '2026-27', order: { tonnes: 10, delivered_tonnes: 10, delivered_certificate_id: 'A', category: 'I' }, recyclerVerifiedOnIssueDate: true });
  assert.equal(ok.valid, true);
  const mismatch = validateCredit({ credit: { certificate_id: 'B', category: 'I', tonnes: 9, issue_date: '2026-11-18', source: 'PLATFORM' }, duplicate: false, obligationCategories: ['I'], financialYear: '2026-27', order: { tonnes: 10, delivered_tonnes: 10, delivered_certificate_id: 'A' }, recyclerVerifiedOnIssueDate: true });
  assert.equal(mismatch.valid, false);
  const ext = validateCredit({ credit: { certificate_id: 'C', category: 'II', tonnes: 5, issue_date: '2026-03-01', source: 'EXTERNAL' }, duplicate: false, obligationCategories: ['I'], financialYear: '2026-27' });
  assert.equal(ext.reasons.filter((x) => !x.ok).map((x) => x.rule).join(','), '2,4');
});

test('state machine: only valid transitions by permitted roles', () => {
  assert.equal(canTransition('PLACED', 'ACCEPTED', 'RECYCLER'), true);
  assert.equal(canTransition('PLACED', 'ACCEPTED', 'PRODUCER'), false);
  assert.equal(canTransition('PLACED', 'DELIVERED', 'RECYCLER'), false);
  assert.equal(canTransition('ACCEPTED', 'PAID_ESCROW', 'PRODUCER'), true);
  assert.equal(canTransition('PAID_ESCROW', 'CANCELLED', 'PRODUCER'), false);
  assert.equal(canTransition('VALIDATED', 'COMPLETED', 'ADMIN'), true);
  assert.equal(canTransition('DELIVERED', 'RECEIVED', 'RECYCLER'), false);
});

test('smart basket: risk weight changes the pick and RED listings are excluded', () => {
  const rec = (id, onTime) => ({ id, name: 'R' + id, completedOrders: 10, onTimeRate: onTime });
  const mk = (id, price, onTime, red = false) => ({ listing: { id, recycler_id: id, category: 'I', tonnes_available: 50, price_per_tonne: price, expected_completion: '2027-01-01' }, recycler: rec(id, onTime), red });
  const listings = [mk(1, 3700, 70), mk(2, 4000, 100), mk(3, 1000, 100, true)];
  const check = (l) => ({ status: l.id === 3 ? 'RED' : 'GREEN', score: 100, reasons: l.id === 3 ? [{ severity: 'FAIL', text: 'x' }] : [] });
  const cheap = buildBasket({ remainingByCategory: { I: 30 }, deadline: '2027-06-30', preference: 'CHEAPEST', listings, check });
  assert.equal(cheap.lines[0].listing_id, 1);
  const safe = buildBasket({ remainingByCategory: { I: 30 }, deadline: '2027-06-30', preference: 'SAFEST', listings, check });
  assert.equal(safe.lines[0].listing_id, 2);
  assert.equal(safe.total_tonnes, 30);
  assert.equal(cheap.baselines[1].red_lines, 1);
  assert.equal(Math.round(effectiveCost(3700, 0.3, 70)), 4033);
});

test('AI helpers: strip code fences and convert kg to tonnes', () => {
  assert.equal(stripFences('```json\n{"a":1}\n```'), '{"a":1}');
  const n = normalizeExtraction({ items: [{ quantity_value: 2500, unit: 'kg', category_suggestion: 'Category II', confidence: 2 }] });
  assert.equal(n.items[0].quantity_tonnes, 2.5);
  assert.equal(n.items[0].category_suggestion, 'II');
  assert.equal(n.items[0].confidence, 1);
});

test('financial year helper', () => {
  assert.equal(fyOf('2026-04-01'), '2026-27');
  assert.equal(fyOf('2027-03-31'), '2026-27');
  assert.equal(fyOf('2026-03-31'), '2025-26');
});
