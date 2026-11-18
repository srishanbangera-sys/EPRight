"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, Repeat, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { demoFlags } from "@/lib/demo";
import { cx } from "@/lib/format";
import { useAuth, useToast } from "./Providers";
import { Card } from "./ui";

const BEYOND = (statuses: string[]) => (o: any) => statuses.includes(o.status);
const ACCEPTED_PLUS = ["ACCEPTED", "PAID_ESCROW", "IN_PROGRESS", "DELIVERED", "RECEIVED", "VALIDATED", "COMPLETED", "FLAGGED", "DISPUTED"];
const PAID_PLUS = ["PAID_ESCROW", "IN_PROGRESS", "DELIVERED", "RECEIVED", "VALIDATED", "COMPLETED", "FLAGGED", "DISPUTED"];
const DELIVERED_PLUS = ["DELIVERED", "RECEIVED", "VALIDATED", "COMPLETED", "FLAGGED"];
const DONE = ["VALIDATED", "COMPLETED"];

type Step = { title: string; how: string; who: "Producer" | "Recycler"; done: boolean; href?: string; switchTo?: boolean };

/** The spec's 2-minute demo path as a live checklist. Ticks itself off from real data. */
export function DemoPath({ invoices, covered }: { invoices: number; covered: number }) {
  const { year, version, demoLogin } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [external, setExternal] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<any[]>("/orders", { query: { year } }).then(setOrders).catch(() => {});
    api("/credits", { query: { year, source: "EXTERNAL" } }).then((r) => setExternal(r.credits.some((c: any) => c.status === "VALIDATED"))).catch(() => {});
    const sync = () => setFlags(demoFlags());
    sync();
    window.addEventListener("epright:demo", sync);
    return () => window.removeEventListener("epright:demo", sync);
  }, [year, version]);

  const live = orders.filter((o) => !["REJECTED", "CANCELLED", "REFUNDED", "EXPIRED"].includes(o.status));
  const latest = live[0];
  const steps: Step[] = [
    { title: "Confirm the sample invoices", how: "Invoices → load SAMPLE-INV-001…003 → Confirm each. About 100 t Remaining.", who: "Producer", done: invoices > 0, href: "/producer/invoices" },
    { title: "Close my gap and order", how: "Smart Basket → Order this on one line. The order starts as Placed.", who: "Producer", done: live.length > 0, href: "/producer/basket" },
    { title: "Recycler accepts", how: "Switch to the recycler and press Accept order.", who: "Recycler", done: live.some(BEYOND(ACCEPTED_PLUS)), switchTo: true },
    { title: "Pay into escrow", how: "Open the order → Pay into escrow (simulated). The tonnes turn amber: Committed.", who: "Producer", done: live.some(BEYOND(PAID_PLUS)), href: latest ? `/orders/${latest.id}` : "/producer/orders" },
    { title: "Recycler delivers the credit", how: "Switch to the recycler → Record delivered credit (any ID, e.g. CPCB-DEMO-001).", who: "Recycler", done: live.some(BEYOND(DELIVERED_PLUS)), switchTo: true },
    { title: "Mark received: tonnes go Covered", how: "Open the order → Mark received. Validation passes and the bar turns green.", who: "Producer", done: live.some(BEYOND(DONE)) || covered > 0, href: latest ? `/orders/${latest.id}` : "/producer/orders" },
    { title: "Try reusing that certificate ID", how: "Credit Passport → Add external credit with the same ID. It is rejected and flagged.", who: "Producer", done: !!flags.dup, href: "/producer/credits" },
    { title: "Add an external credit", how: "Credit Passport → a new ID, issue date in this FY. The bar updates.", who: "Producer", done: external, href: "/producer/credits" },
    { title: "Audit mode and filing report", how: "Audit mode → Verify chain (Chain intact). Then Filing report → Download PDF.", who: "Producer", done: !!flags.audit && !!flags.report, href: flags.audit ? "/producer/reports" : "/producer/audit" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);

  const switchToRecycler = async () => {
    if (!latest) return toast({ kind: "info", title: "Place an order first" });
    setBusy(true);
    try {
      const accounts = await api<any[]>("/auth/demo-accounts");
      const acct = accounts.find((a) => a.org_name === latest.recycler_name);
      if (!acct) throw new Error("No demo account for this recycler");
      await demoLogin(acct.email);
      toast({ kind: "info", title: `Now acting as ${acct.org_name}`, body: "Recycler view" });
      router.push(`/orders/${latest.id}`);
    } catch (e: any) {
      toast({ kind: "error", title: "Could not switch", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-[18px] text-committed" />
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Guided demo path</h3>
            <p className="text-[13px] text-slate-500">The 2-minute walkthrough. Steps tick off automatically as you go.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900 transition-[width] duration-700" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
          <span className="num text-[13px] font-medium text-slate-600">{doneCount}/{steps.length}</span>
        </div>
      </div>
      <ol className="grid sm:grid-cols-3">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li key={s.title} className={cx("relative border-b border-slate-100 p-4 transition-colors sm:border-r sm:[&:nth-child(3n)]:border-r-0", isCurrent && "bg-amber-50/50")}>
              <div className="flex items-start gap-3">
                <span className={cx("num mt-px grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium transition-colors",
                  s.done ? "bg-covered text-white" : isCurrent ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-400")}>
                  {s.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={cx("text-[13.5px] font-medium", s.done ? "text-slate-400 line-through decoration-slate-300" : "text-slate-900")}>{s.title}</p>
                    <span className={cx("rounded px-1 text-[10px] font-medium uppercase tracking-wider", s.who === "Recycler" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>{s.who}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{s.how}</p>
                  {isCurrent && (
                    <div className="mt-2.5">
                      {s.switchTo ? (
                        <button disabled={busy} onClick={switchToRecycler} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">
                          <Repeat className="size-3.5" /> Switch to recycler & open order
                        </button>
                      ) : s.href ? (
                        <Link href={s.href} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-800">
                          Do this step <ArrowRight className="size-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
