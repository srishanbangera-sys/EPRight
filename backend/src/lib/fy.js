// Financial year helpers (India: 1 April to 31 March). FY strings look like "2026-27".

export function fyOf(dateStr) {
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00Z' : ''));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function fyRange(fy) {
  const start = parseInt(fy.slice(0, 4), 10);
  return { start: `${start}-04-01`, end: `${start + 1}-03-31` };
}

export function inFy(dateStr, fy) {
  if (!dateStr) return false;
  const { start, end } = fyRange(fy);
  const d = dateStr.slice(0, 10);
  return d >= start && d <= end;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
