// Obligation engine and progress-bar math (Spec 6, 6.1, 9.3). Pure functions.

export const COMMITTED_STATUSES = ['ACCEPTED', 'PAID_ESCROW', 'IN_PROGRESS', 'DELIVERED', 'RECEIVED'];

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Compute obligations per category.
 * @param {Array<{category:string, quantity_tonnes:number}>} items confirmed invoice items for the year
 * @param {Record<string, number>} targets category -> target percentage
 */
export function computeObligations(items, targets, categories) {
  const out = {};
  for (const c of categories) out[c] = { category: c, placed_tonnes: 0, target_pct: targets[c] ?? 0, required_tonnes: 0 };
  for (const it of items) {
    if (!out[it.category]) out[it.category] = { category: it.category, placed_tonnes: 0, target_pct: targets[it.category] ?? 0, required_tonnes: 0 };
    out[it.category].placed_tonnes += Number(it.quantity_tonnes) || 0;
  }
  for (const o of Object.values(out)) {
    o.placed_tonnes = r3(o.placed_tonnes);
    o.required_tonnes = r3((o.placed_tonnes * o.target_pct) / 100);
  }
  return out;
}

/**
 * Progress for one category or overall.
 * required  = sum of obligation tonnes
 * covered   = VALIDATED credits (same category, year)
 * committed = orders in ACCEPTED..RECEIVED not yet validated
 */
export function progressFor(required, covered, committed) {
  required = r3(required); covered = r3(covered); committed = r3(committed);
  const remaining = r3(Math.max(0, required - covered - committed));
  const surplus = r3(Math.max(0, covered + committed - required));
  const base = Math.max(required, covered + committed, 0.000001);
  return {
    required, covered, committed, remaining, surplus,
    pct: {
      covered: required > 0 ? Math.round((covered / required) * 1000) / 10 : 0,
      committed: required > 0 ? Math.round((committed / required) * 1000) / 10 : 0,
      remaining: required > 0 ? Math.round((remaining / required) * 1000) / 10 : 0,
    },
    // widths for the segmented bar (always sum to <= 100)
    width: {
      covered: (covered / base) * 100,
      committed: (committed / base) * 100,
      remaining: (remaining / base) * 100,
    },
  };
}

/**
 * Full progress view.
 * @param obligations output of computeObligations
 * @param credits [{category, tonnes, status}] credits for the year
 * @param orders  [{category, tonnes, status}] orders for the year
 */
export function computeProgress(obligations, credits, orders) {
  const cats = Object.keys(obligations);
  const byCategory = {};
  let tReq = 0, tCov = 0, tCom = 0;
  for (const c of cats) {
    const req = obligations[c].required_tonnes;
    const cov = credits.filter((x) => x.category === c && x.status === 'VALIDATED').reduce((s, x) => s + Number(x.tonnes), 0);
    const com = orders.filter((o) => o.category === c && COMMITTED_STATUSES.includes(o.status)).reduce((s, o) => s + Number(o.tonnes), 0);
    byCategory[c] = { ...obligations[c], ...progressFor(req, cov, com) };
    tReq += req; tCov += cov; tCom += com;
  }
  // Overall remaining is the sum of per-category remaining (surplus in one category cannot offset another).
  const overall = progressFor(tReq, tCov, tCom);
  overall.remaining = r3(Object.values(byCategory).reduce((s, x) => s + x.remaining, 0));
  overall.surplus = r3(Object.values(byCategory).reduce((s, x) => s + x.surplus, 0));
  const base = Math.max(tReq, tCov + tCom, 0.000001);
  overall.width.remaining = (overall.remaining / base) * 100;
  overall.pct.remaining = tReq > 0 ? Math.round((overall.remaining / tReq) * 1000) / 10 : 0;
  return { overall, byCategory };
}

export function exposure(remainingTonnes, rates) {
  const tiers = rates || [5000, 10000, 20000];
  return {
    current: Math.round(remainingTonnes * tiers[0]),
    tiers: tiers.map((rate) => ({ rate, amount: Math.round(remainingTonnes * rate) })),
  };
}
