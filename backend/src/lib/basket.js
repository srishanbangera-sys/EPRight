// Smart Basket "Close my gap" (Spec 9.6). Pure: the safety check is passed in as a function.

export const PREFERENCE_WEIGHTS = { CHEAPEST: 0.0, BALANCED: 0.3, SAFEST: 0.7 };

const r3 = (n) => Math.round(n * 1000) / 1000;

export function reliabilityOf(recycler, minOrders = 3) {
  return recycler.completedOrders >= minOrders && recycler.onTimeRate != null ? recycler.onTimeRate : 85;
}

export function effectiveCost(price, weight, reliability) {
  return price * (1 + (weight * (100 - reliability)) / 100);
}

function fillGreedy(sorted, remainingByCategory, check) {
  const lines = [];
  const left = { ...remainingByCategory };
  for (const c of sorted) {
    const need = left[c.listing.category] || 0;
    if (need <= 1e-9) continue;
    const take = r3(Math.min(need, c.listing.tonnes_available));
    if (take <= 0) continue;
    left[c.listing.category] = r3(need - take);
    const sc = check(c.listing, take);
    lines.push({
      listing_id: c.listing.id,
      category: c.listing.category,
      recycler_id: c.recycler.id,
      recycler_name: c.recycler.name,
      tonnes: take,
      price_per_tonne: c.listing.price_per_tonne,
      cost: Math.round(take * c.listing.price_per_tonne),
      expected_completion: c.listing.expected_completion,
      effective_cost: c.effective != null ? Math.round(c.effective) : undefined,
      reliability: c.reliability,
      safety: { status: sc.status, score: sc.score, flags: sc.reasons.filter((r) => r.severity === 'FAIL' || r.severity === 'WARN') },
    });
  }
  return { lines, left };
}

function summarize(lines) {
  return {
    total_cost: lines.reduce((s, l) => s + l.cost, 0),
    total_tonnes: r3(lines.reduce((s, l) => s + l.tonnes, 0)),
  };
}

/**
 * @param {object} p
 * @param {Record<string,number>} p.remainingByCategory
 * @param {string} p.deadline YYYY-MM-DD
 * @param {'CHEAPEST'|'BALANCED'|'SAFEST'} p.preference
 * @param {Array<{listing, recycler}>} p.listings visible marketplace listings in marketplace order
 * @param {(listing, tonnes) => {status, score, reasons}} p.check safety check
 * @param {number[]} p.rates compensation rates (INR/t)
 */
export function buildBasket({ remainingByCategory, deadline, preference = 'BALANCED', listings, check, rates = [5000], minOrders = 3 }) {
  const weight = PREFERENCE_WEIGHTS[preference] ?? 0.3;
  const need = Object.fromEntries(Object.entries(remainingByCategory).filter(([, v]) => v > 1e-9));

  const excluded = [];
  const eligible = [];
  for (const c of listings) {
    if (!need[c.listing.category]) continue;
    const probe = check(c.listing, Math.min(1, c.listing.tonnes_available));
    if (probe.status === 'RED') { excluded.push({ listing_id: c.listing.id, recycler_name: c.recycler.name, category: c.listing.category, reason: probe.reasons.find((r) => r.severity === 'FAIL')?.text }); continue; }
    if (deadline && c.listing.expected_completion > deadline) { excluded.push({ listing_id: c.listing.id, recycler_name: c.recycler.name, category: c.listing.category, reason: `Completes ${c.listing.expected_completion}, after the deadline ${deadline}.` }); continue; }
    const reliability = reliabilityOf(c.recycler, minOrders);
    eligible.push({ ...c, reliability, effective: effectiveCost(c.listing.price_per_tonne, weight, reliability) });
  }
  eligible.sort((a, b) => a.effective - b.effective || a.listing.price_per_tonne - b.listing.price_per_tonne);

  const { lines, left } = fillGreedy(eligible, need, check);
  const shortfall = Object.entries(left).filter(([, v]) => v > 1e-9).map(([category, tonnes]) => ({
    category, tonnes, exposure: Math.round(tonnes * (rates[0] || 0)),
  }));

  // Baselines: no risk checks, just greedy fill.
  const inNeed = listings.filter((c) => need[c.listing.category]);
  const firstSeen = fillGreedy(inNeed, need, check);
  const cheapest = fillGreedy([...inNeed].sort((a, b) => a.listing.price_per_tonne - b.listing.price_per_tonne), need, check);
  const basket = summarize(lines);

  const baseline = (name, label, res) => {
    const s = summarize(res.lines);
    const flags = res.lines.flatMap((l) => l.safety.flags.map((f) => ({ ...f, recycler_name: l.recycler_name, listing_id: l.listing_id, category: l.category })));
    const wastedTonnes = r3(res.lines.filter((l) => l.safety.status === 'RED').reduce((t, l) => t + l.tonnes, 0));
    return { name, label, ...s, cost_difference: s.total_cost - basket.total_cost, flags_ignored: flags, red_lines: res.lines.filter((l) => l.safety.status === 'RED').length, at_risk_tonnes: wastedTonnes, lines: res.lines };
  };

  return {
    preference, weight, deadline,
    lines, ...basket, shortfall,
    total_exposure: shortfall.reduce((s, x) => s + x.exposure, 0),
    excluded,
    baselines: [
      baseline('FIRST_SEEN', 'First listing seen', firstSeen),
      baseline('CHEAPEST_NO_CHECKS', 'Cheapest first, no risk checks', cheapest),
    ],
    note: 'Comparison figures are based on current marketplace data.',
  };
}
