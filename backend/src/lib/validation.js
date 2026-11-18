// Credit validation rules (Spec 9.8, 9.9). Pure function.

import { fyRange, inFy } from './fy.js';

/**
 * @param {object} input
 * @param {object} input.credit {certificate_id, category, tonnes, issue_date, source:'PLATFORM'|'EXTERNAL'}
 * @param {boolean} input.duplicate        certificate ID already exists in the credits table
 * @param {string[]} input.obligationCategories categories where the producer has an obligation this FY
 * @param {string} input.financialYear     producer FY being filed, e.g. "2026-27"
 * @param {object} [input.order]           in-platform order {tonnes, delivered_certificate_id, delivered_tonnes, category}
 * @param {boolean} [input.recyclerVerifiedOnIssueDate]
 * @returns {{valid:boolean, reasons:Array<{rule:number, ok:boolean, text:string}>, fraud:boolean}}
 */
export function validateCredit(input) {
  const { credit, duplicate, obligationCategories, financialYear, order } = input;
  const external = credit.source === 'EXTERNAL';
  const reasons = [];
  const add = (rule, ok, text) => reasons.push({ rule, ok, text });

  // Rule 1: globally unique certificate ID
  add(1, !duplicate, duplicate
    ? `Certificate ID ${credit.certificate_id} has already been used. Duplicate use is rejected and flagged as possible fraud.`
    : `Certificate ID ${credit.certificate_id} is unique.`);

  // Rule 2: category matches an obligation category
  const catOk = obligationCategories.includes(credit.category);
  add(2, catOk, catOk
    ? `Category ${credit.category} matches one of your obligation categories.`
    : `Category ${credit.category} is not one of your obligation categories for ${financialYear}. It cannot offset a different category.`);

  // Rule 3: tonnes > 0 and match the order (platform only)
  if (!external) {
    const tonnes = Number(credit.tonnes);
    let ok = tonnes > 0;
    let text = ok ? `Tonnes (${tonnes}) are greater than zero` : 'Tonnes must be greater than zero';
    if (order) {
      const matchesOrder = Math.abs(tonnes - Number(order.tonnes)) < 1e-6;
      const matchesRecycler = order.delivered_tonnes == null || Math.abs(tonnes - Number(order.delivered_tonnes)) < 1e-6;
      ok = ok && matchesOrder && matchesRecycler;
      if (!matchesOrder) text = `Tonnes on the credit (${tonnes} t) do not match the order (${order.tonnes} t)`;
      else if (!matchesRecycler) text = `Tonnes you entered (${tonnes} t) do not match the recycler's entry (${order.delivered_tonnes} t)`;
      else text += ' and match the order';
    }
    add(3, ok, text + '.');

    if (order && order.delivered_certificate_id) {
      const same = order.delivered_certificate_id.trim() === String(credit.certificate_id).trim();
      add(3, same, same
        ? 'Certificate ID matches the one recorded by the recycler.'
        : `Certificate ID you entered (${credit.certificate_id}) does not match the recycler's entry (${order.delivered_certificate_id}).`);
    }
    if (order && order.category && order.category !== credit.category) {
      add(3, false, `Credit category ${credit.category} does not match the ordered category ${order.category}.`);
    }
  } else if (!(Number(credit.tonnes) > 0)) {
    add(3, false, 'Tonnes must be greater than zero.');
  }

  // Rule 4: issue date within the producer's FY
  const { start, end } = fyRange(financialYear);
  const dateOk = inFy(credit.issue_date, financialYear);
  add(4, dateOk, dateOk
    ? `Issue date ${credit.issue_date} falls within FY ${financialYear}.`
    : `Issue date ${credit.issue_date || '(missing)'} is outside FY ${financialYear} (${start} to ${end}).`);

  // Rule 5: recycler verified on the issue date (platform only)
  if (!external) {
    const ok = !!input.recyclerVerifiedOnIssueDate;
    add(5, ok, ok
      ? 'Recycler was verified with valid documents on the issue date.'
      : 'Recycler did not hold valid, approved documents on the issue date.');
  }

  return { valid: reasons.every((r) => r.ok), reasons, fraud: !!duplicate };
}
