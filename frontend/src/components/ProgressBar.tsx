"use client";

import { useEffect, useState } from "react";
import { cx, num } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

export type Progress = {
  required: number;
  covered: number;
  committed: number;
  remaining: number;
  surplus: number;
  pct: { covered: number; committed: number; remaining: number };
  width: { covered: number; committed: number; remaining: number };
};

/** Animates from 0 on mount and smoothly to new values after any order or credit event. */
function useAnimatedWidths(p: Progress) {
  const [w, setW] = useState({ covered: 0, committed: 0, remaining: 0 });
  useEffect(() => {
    const id = requestAnimationFrame(() => setW({ covered: p.width.covered, committed: p.width.committed, remaining: p.width.remaining }));
    return () => cancelAnimationFrame(id);
  }, [p.width.covered, p.width.committed, p.width.remaining]);
  return w;
}

export function ProgressBar({ p, size = "md" }: { p: Progress; size?: "sm" | "md" | "lg"; showLabels?: boolean }) {
  const h = size === "lg" ? "h-3.5" : size === "sm" ? "h-1.5" : "h-2.5";
  const w = useAnimatedWidths(p);
  const empty = p.required <= 0 && p.covered <= 0 && p.committed <= 0;
  const segs = [
    { k: "covered", w: w.covered, cls: "bg-covered", label: `Covered ${num(p.covered)} t` },
    { k: "committed", w: w.committed, cls: "bg-committed stripes", label: `Committed ${num(p.committed)} t` },
    { k: "remaining", w: w.remaining, cls: "bg-remaining", label: `Remaining ${num(p.remaining)} t` },
  ].filter((s) => s.w > 0.01);
  return (
    <div className={cx("flex w-full gap-[3px] overflow-hidden rounded-full bg-slate-100", h)} role="img"
      aria-label={`Covered ${p.covered} t, committed ${p.committed} t, remaining ${p.remaining} t of ${p.required} t required`}>
      {!empty && segs.map((s) => (
        <div key={s.k} title={s.label} className={cx("h-full rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]", s.cls)} style={{ width: `${s.w}%` }} />
      ))}
    </div>
  );
}

/** Smoothly counts a number to its new value (ease-out), for live-feeling figures. */
export function useCountUp(target: number, duration = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const from = v;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setV(from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return v;
}

export function CountUp({ value, digits = 2 }: { value: number; digits?: number }) {
  return <>{num(useCountUp(value), digits)}</>;
}

export function ProgressLegend({ p, compact }: { p: Progress; compact?: boolean }) {
  const items = [
    { label: "Covered", sub: "validated credits", v: p.covered, pct: p.pct.covered, dot: "bg-covered" },
    { label: "Committed", sub: "paid or in progress", v: p.committed, pct: p.pct.committed, dot: "bg-committed" },
    { label: "Remaining", sub: "still to buy", v: p.remaining, pct: p.pct.remaining, dot: "bg-remaining" },
  ];
  return (
    <div className={cx("grid grid-cols-3", compact ? "gap-3" : "gap-4 sm:gap-8")}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cx("size-2 shrink-0 rounded-full", it.dot)} />
            <span className="truncate text-[13px] font-medium text-slate-500">{it.label}</span>
          </div>
          <p className={cx("num mt-1 font-semibold tracking-tight text-slate-900", compact ? "text-base" : "text-2xl")}>
            <CountUp value={it.v} /><span className="ml-0.5 text-[0.6em] font-medium text-slate-400"> t</span>
            {compact && <span className="ml-1.5 text-xs font-medium text-slate-400">{num(it.pct, 0)}%</span>}
          </p>
          {!compact && <p className="num mt-0.5 text-xs text-slate-400">{num(it.pct, 1)}% · {it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function SurplusWarning({ p }: { p: Progress }) {
  if (!(p.surplus > 0)) return null;
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      Surplus of {num(p.surplus)} t: you have bought or committed more than required. Surplus in one category does not offset another.
    </div>
  );
}
