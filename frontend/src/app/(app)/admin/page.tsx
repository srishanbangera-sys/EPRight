"use client";

import { useState } from "react";
import Link from "next/link";
import { UserCheck, Flag, Gavel, Landmark, ShieldCheck, ShieldX, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useToast } from "@/components/Providers";
import { fmtDateTime, inr } from "@/lib/format";
import { Button, Card, CardHeader, ErrorBox, PageHeader, Pill, Spinner, Stat, Table, Td } from "@/components/ui";

export default function AdminOverview() {
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api("/admin/overview"));
  const [busy, setBusy] = useState(false);
  const runJob = async () => {
    setBusy(true);
    try {
      const r = await api("/admin/jobs/check-expiry", { method: "POST" });
      toast({ kind: "success", title: "Expiry check complete", body: r.changes.length ? r.changes.map((c: any) => c.order_id ? `Order #${c.order_id} → ${c.to}` : c.listings_hidden ? `${c.name}: ${c.listings_hidden} listing(s) hidden` : `${c.name}: ${c.from} → ${c.to}`).join("; ") : "No status changes." });
      reload();
    } catch (e: any) {
      toast({ kind: "error", title: "Job failed", body: e.message });
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader howto={[<>The tiles link to each queue: <b>documents, flagged items, disputes, escrow</b>.</>, <>Press <b>Run document expiry check</b> to re-check every recycler's document dates now.</>, <>Use <b>Settings & rules</b> to change targets, rates and thresholds.</>]} eyebrow="Platform admin" title="Overview" actions={<Button variant="outline" icon={<CalendarClock className="size-4" />} loading={busy} onClick={runJob}>Run document expiry check</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/verifications"><Stat label="Documents to review" value={data.pending_docs} icon={<UserCheck className="size-5" />} tone="teal" /></Link>
        <Link href="/admin/flagged"><Stat label="Flagged" value={data.flagged_orders + data.flagged_credits} hint={`${data.flagged_orders} orders · ${data.flagged_credits} external credits`} icon={<Flag className="size-5" />} tone="red" /></Link>
        <Link href="/admin/disputes"><Stat label="Open disputes" value={data.open_disputes} icon={<Gavel className="size-5" />} tone="amber" /></Link>
        <Link href="/admin/escrow"><Stat label="Escrow held (simulated)" value={inr(data.escrow_held.t)} hint={`${data.escrow_held.n} orders · ${data.to_release} ready to release`} icon={<Landmark className="size-5" />} tone="green" /></Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            {data.chain.intact ? <ShieldCheck className="size-10 text-green-600" /> : <ShieldX className="size-10 text-red-600" />}
            <div><p className="text-xl font-black">{data.chain.intact ? "Chain intact" : "Chain broken"}</p><p className="text-sm text-slate-500">{data.events} audit events</p></div>
          </div>
          <div className="mt-4 space-y-1 text-sm">
            {data.orgs.map((o: any, i: number) => <p key={i} className="flex justify-between"><span>{o.type.toLowerCase()} · {o.status}</span><b>{o.n}</b></p>)}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Recent events" action={<Link href="/admin/audit" className="text-sm font-bold text-brand-700">Audit log</Link>} />
          <Table head={["#", "Time", "Role", "Action", "Entity"]}>
            {data.recent.map((e: any) => (
              <tr key={e.id}><Td>{e.id}</Td><Td>{fmtDateTime(e.timestamp)}</Td><Td><Pill>{e.actor_role}</Pill></Td><Td className="font-bold">{e.action}</Td><Td>{e.entity_type} {e.entity_id}</Td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
