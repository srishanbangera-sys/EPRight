"use client";

import Link from "next/link";
import { FileUp, ShoppingBasket, Store, Wallet, CalendarClock, IndianRupee, ClipboardList, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth } from "@/components/Providers";
import { fmtDate, inr, num, tonnes } from "@/lib/format";
import { CountUp, ProgressBar, ProgressLegend, SurplusWarning } from "@/components/ProgressBar";
import { Card, CardHeader, ErrorBox, LinkButton, OrgStatus, PageHeader, Spinner, Stat } from "@/components/ui";
import { OrdersTable } from "@/components/views";
import { DemoPath } from "@/components/DemoPath";

export default function ProducerDashboard() {
  const { year } = useAuth();
  const { data, error, loading, reload } = useData(() => api("/dashboard/producer", { query: { year } }), [year]);
  const alerts = useData(() => api("/alerts"));
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const p = data.progress;
  const catName = (c: string) => data.categories.find((x: any) => x.code === c)?.name || `Category ${c}`;
  const cats = Object.values(p.byCategory).filter((c: any) => c.required > 0 || c.covered > 0 || c.committed > 0) as any[];

  return (
    <div>
      <PageHeader howto={[<>Go to <b>Invoices</b> and load the 3 SAMPLE invoices. Confirm them and the bar shows about <b>100 t Remaining</b>.</>, <>Press <b>Close my gap</b> to get a recommended basket, then <b>Order this</b> on one line.</>, <>Use <b>Demo: switch role</b> (top right) to become the recycler, accept and deliver. Switch back and mark it received.</>, <>Watch tonnes move <b>Remaining → Committed → Covered</b> here. Follow the checklist below.</>]} eyebrow={`Financial year ${p.financial_year}`} title={data.org.name} actions={<OrgStatus status={data.org.status} />} />

      <Card className="sticky top-[4.25rem] z-10 mb-6 p-5 shadow-lift sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-slate-500">Overall obligation · FY {p.financial_year}</p>
            <p className="num mt-1 text-[32px] font-semibold leading-none tracking-tight"><CountUp value={p.overall.required} /><span className="ml-1 text-base font-medium text-slate-400">t required</span></p>
          </div>
          <div className="text-right">
            <p className="num text-[13px] font-medium text-slate-500">{num(p.overall.pct.covered, 0)}% covered</p>
            {p.awaiting_acceptance_tonnes > 0 && <p className="text-xs text-slate-400">{tonnes(p.awaiting_acceptance_tonnes)} awaiting recycler acceptance</p>}
          </div>
        </div>
        <ProgressBar p={p.overall} size="lg" />
        <div className="mt-5"><ProgressLegend p={p.overall} /></div>
        <SurplusWarning p={p.overall} />
      </Card>

      <DemoPath invoices={data.invoices} covered={p.overall.covered} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Estimated exposure if unfilled" value={inr(p.exposure.current)} hint={`${tonnes(p.overall.remaining)} × ${inr(p.exposure.tiers[0]?.rate)}/t (placeholder rate, verify)`} icon={<IndianRupee className="size-5" />} tone="red" />
        <Stat label="Filing deadline" value={fmtDate(p.filing_deadline)} hint={`${p.days_to_deadline} days left`} icon={<CalendarClock className="size-5" />} tone="teal" />
        <Stat label="Open orders" value={data.counts.open || 0} hint={`${data.counts.to_pay || 0} to pay · ${data.counts.to_receive || 0} to receive`} icon={<ClipboardList className="size-5" />} tone="amber" />
        <Stat label="Spent (simulated escrow)" value={inr(data.spend)} hint={`${data.invoices} invoices confirmed`} icon={<Wallet className="size-5" />} tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="By packaging category" subtitle="Credits only count against the same category." />
          <div className="space-y-5 p-5">
            {cats.length === 0 && (
              <div className="text-center">
                <p className="font-bold text-slate-700">No obligation yet for {p.financial_year}.</p>
                <p className="text-sm text-slate-500">Upload invoices to compute it.</p>
                <div className="mt-3"><LinkButton href="/producer/invoices" icon={<FileUp className="size-4" />}>Upload invoices</LinkButton></div>
              </div>
            )}
            {cats.map((c) => (
              <div key={c.category}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-900">{catName(c.category)}</span>
                  <span className="num text-[13px] text-slate-500">{num(c.placed_tonnes)} t placed × {c.target_pct}% = <span className="font-medium text-slate-900">{num(c.required)} t</span></span>
                </div>
                <ProgressBar p={c} />
                <div className="mt-2"><ProgressLegend p={c} compact /></div>
                <SurplusWarning p={c} />
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <p className="mb-3 text-[15px] font-semibold">Quick actions</p>
            <div className="grid gap-2">
              <LinkButton href="/producer/basket" variant="accent" icon={<ShoppingBasket className="size-4" />}>Close my gap</LinkButton>
              <LinkButton href="/producer/invoices" variant="secondary" icon={<FileUp className="size-4" />}>Upload invoices</LinkButton>
              <LinkButton href="/producer/marketplace" variant="secondary" icon={<Store className="size-4" />}>Browse marketplace</LinkButton>
              <LinkButton href="/producer/credits" variant="secondary" icon={<Wallet className="size-4" />}>Add external credit</LinkButton>
            </div>
          </Card>
          <Card>
            <CardHeader title="Alerts" icon={<AlertTriangle className="size-5" />} />
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {(alerts.data?.alerts || []).slice(0, 8).map((a: any) => (
                <Link key={a.id} href={a.link || "#"} className="flex gap-2.5 px-5 py-3 text-[13px] leading-snug text-slate-600 transition-colors hover:bg-slate-50">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${a.severity === "danger" ? "bg-remaining" : a.severity === "warning" ? "bg-committed" : a.severity === "success" ? "bg-covered" : "bg-slate-300"}`} />
                  {a.message}
                </Link>
              ))}
              {alerts.data?.alerts?.length === 0 && <p className="p-5 text-sm text-slate-500">No alerts.</p>}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent orders" action={<Link href="/producer/orders" className="text-sm font-bold text-brand-700">All orders</Link>} />
        <OrdersTable orders={data.orders} party="producer" />
      </Card>
    </div>
  );
}
