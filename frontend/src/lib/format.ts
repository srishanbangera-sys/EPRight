export const inr = (n: number | null | undefined) =>
  "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

export const tonnes = (n: number | null | undefined, digits = 2) =>
  (Math.round((Number(n) || 0) * 10 ** digits) / 10 ** digits).toLocaleString("en-IN", { maximumFractionDigits: digits }) + " t";

export const num = (n: number | null | undefined, digits = 2) =>
  (Math.round((Number(n) || 0) * 10 ** digits) / 10 ** digits).toLocaleString("en-IN", { maximumFractionDigits: digits });

export const fmtDate = (d?: string | null) => {
  if (!d) return "-";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const fmtDateTime = (d?: string | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const timeAgo = (d: string) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const human = (s?: string | null) => (s ? s.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "");

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
