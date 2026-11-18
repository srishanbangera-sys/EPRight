"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleAlert, CircleX, FileText, ShieldCheck, Lock, BadgeCheck, Wallet } from "lucide-react";
import { cx } from "@/lib/format";
import { useCountUp } from "./ProgressBar";

type Step = {
  key: string;
  label: string;
  icon: React.ElementType;
  covered: number;
  committed: number;
  log: { action: string; detail: string };
};

// The real EPRight demo path, told in five beats.
const STEPS: Step[] = [
  { key: "read", label: "Invoices read", icon: FileText, covered: 0, committed: 0, log: { action: "INVOICE_CONFIRMED", detail: "3 invoices · 250 t placed · 100 t required" } },
  { key: "check", label: "Safety Check", icon: ShieldCheck, covered: 0, committed: 0, log: { action: "SAFETY_CHECK", detail: "11 listings screened · 1 blocked · 4 warnings" } },
  { key: "escrow", label: "Paid to escrow", icon: Lock, covered: 0, committed: 40, log: { action: "ORDER_PAID_ESCROW", detail: "40 t Category I · simulated escrow held" } },
  { key: "valid", label: "Credit validated", icon: BadgeCheck, covered: 40, committed: 0, log: { action: "ORDER_VALIDATED", detail: "Certificate CPCB-PWP-0417 · 5 of 5 rules passed" } },
  { key: "ext", label: "External credit", icon: Wallet, covered: 45, committed: 0, log: { action: "EXTERNAL_CREDIT_VALIDATED", detail: "5 t from another platform · confirm on portal" } },
];

const HASHES = ["9f2c41e0", "4b7a90d3", "e15c0a77", "70d3be19", "c84f2e6a"];
const REQUIRED = 100;

function Num({ v }: { v: number }) {
  const n = useCountUp(v, 800);
  return <>{n.toFixed(n % 1 === 0 || v % 1 === 0 ? 0 : 1)}</>;
}

export function HeroDemo() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((x) => (x + 1) % STEPS.length), i === STEPS.length - 1 ? 4200 : 2800);
    return () => clearTimeout(t);
  }, [i, paused]);

  const s = STEPS[i];
  const remaining = REQUIRED - s.covered - s.committed;
  const log = STEPS.slice(0, i + 1).map((x, k) => ({ ...x.log, hash: HASHES[k] })).reverse();

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white text-slate-900 shadow-[0_40px_80px_-24px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.04)]">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-slate-200" /><span className="size-2.5 rounded-full bg-slate-200" /><span className="size-2.5 rounded-full bg-slate-200" />
        <span className="ml-3 truncate text-xs text-slate-400">epright.app/producer · Sample Snacks Pvt Ltd</span>
        <span className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">SAMPLE</span>
      </div>

      <div className="p-5 sm:p-6">
        {/* step rail */}
        <div className="mb-5 grid grid-cols-5 gap-1.5">
          {STEPS.map((x, k) => (
            <button key={x.key} onClick={() => setI(k)} className="group text-left" aria-label={x.label}>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                {k < i && <div className="h-full w-full rounded-full bg-slate-900" />}
                {k === i && (
                  <div key={`run-${i}`} className="h-full w-full origin-left rounded-full bg-slate-900"
                    style={{ animation: `grow ${i === STEPS.length - 1 ? 4200 : 2800}ms linear both`, animationPlayState: paused ? "paused" : "running" }} />
                )}
              </div>
              <p className={cx("mt-1.5 hidden truncate text-[11px] font-medium transition-colors sm:block", k === i ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600")}>{x.label}</p>
            </button>
          ))}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">FY 2026-27 · Overall obligation</p>
            <p className="num mt-1 text-[34px] font-semibold leading-none tracking-tight">100<span className="ml-1 text-base font-medium text-slate-400">t</span></p>
          </div>
          <div key={s.key} className="flex animate-fade-up items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-soft">
            <s.icon className="size-3.5 text-brand-600" /> {s.label}
          </div>
        </div>

        {/* the hero bar */}
        <div className="mt-5 flex h-3.5 gap-[3px] overflow-hidden rounded-full bg-slate-100">
          {[{ w: s.covered, c: "bg-covered" }, { w: s.committed, c: "bg-committed stripes" }, { w: remaining, c: "bg-remaining" }].map((seg, k) => (
            <div key={k} className={cx("h-full rounded-full transition-[width] duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)]", seg.c)} style={{ width: `${seg.w}%` }} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[["Covered", "bg-covered", s.covered], ["Committed", "bg-committed", s.committed], ["Remaining", "bg-remaining", remaining]].map(([l, c, v]) => (
            <div key={l as string}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span className={cx("size-2 rounded-full", c as string)} />{l}</p>
              <p className="num mt-1 text-xl font-semibold tracking-tight"><Num v={v as number} /><span className="ml-0.5 text-xs font-medium text-slate-400"> t</span></p>
            </div>
          ))}
        </div>

        {/* contextual panel */}
        <div className="mt-5 min-h-[124px]">
          {s.key === "check" ? (
            <ul key="check" className="animate-fade-up divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 text-[13px]">
              <li className="flex items-center gap-2.5 bg-red-50/50 px-3.5 py-2.5"><CircleX className="size-4 shrink-0 text-remaining" /><span className="flex-1 text-slate-700">Recycler F is not registered for Category II</span><span className="font-medium text-red-700">Blocked</span></li>
              <li className="flex items-center gap-2.5 bg-amber-50/40 px-3.5 py-2.5"><CircleAlert className="size-4 shrink-0 text-committed" /><span className="flex-1 text-slate-700">Price 85% above the category median</span><span className="font-medium text-amber-700">Warning</span></li>
              <li className="flex items-center gap-2.5 px-3.5 py-2.5"><CircleCheck className="size-4 shrink-0 text-covered" /><span className="flex-1 text-slate-700">Recycler A · verified, 100% on time</span><span className="font-medium text-slate-400">Passed</span></li>
            </ul>
          ) : (
            <div key="log" className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/60">
              <p className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Tamper-evident log <span className="flex items-center gap-1 normal-case tracking-normal text-covered"><ShieldCheck className="size-3" />chain intact</span>
              </p>
              <ul className="divide-y divide-slate-100">
                {log.slice(0, 3).map((e, k) => (
                  <li key={e.hash} className={cx("flex items-center gap-3 px-3.5 py-2 text-[12px]", k === 0 && "animate-fade-up bg-white")}>
                    <span className="font-mono text-slate-400">{e.hash}</span>
                    <span className="font-medium text-slate-800">{e.action}</span>
                    <span className="hidden flex-1 truncate text-right text-slate-500 sm:block">{e.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
