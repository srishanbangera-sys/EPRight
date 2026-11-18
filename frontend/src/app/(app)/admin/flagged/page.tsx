"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useToast } from "@/components/Providers";
import { fmtDateTime, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, Empty, ErrorBox, Field, Modal, PageHeader, Pill, ReasonList, Spinner, Textarea } from "@/components/ui";

export default function FlaggedPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api("/admin/flagged"));
  const [m, setM] = useState<{ path: string; title: string; danger?: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await api(m!.path, { method: "POST", body: { note } });
      toast({ kind: "success", title: "Done" });
      setM(null);
      setNote("");
      reload();
    } catch (e: any) {
      toast({ kind: "error", title: "Failed", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader howto={[<>Orders and credits that <b>failed validation</b> land here, with the exact failed rules.</>, <><b>Validate after review</b> to override, or <b>Refund</b> / <b>Remove</b>. Every decision is logged.</>, <>Duplicate certificate IDs are listed at the bottom as <b>possible fraud</b>.</>]} eyebrow="Review" title="Flagged" subtitle="Orders and credits that failed validation. Decide whether to validate after review or refund / remove." />
      <Card className="mb-6">
        <CardHeader title="Flagged orders" />
        {data.orders.length === 0 ? <Empty title="No flagged orders" /> : data.orders.map((o: any) => (
          <div key={o.id} className="border-b border-slate-100 p-5 last:border-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Link href={`/orders/${o.id}`} className="font-black hover:underline">Order #{o.id} · {o.producer_name} ← {o.recycler_name} · {tonnes(o.tonnes)} Cat {o.category}</Link>
              <div className="flex gap-2">
                {o.credit && <Button size="sm" variant="outline" onClick={() => setM({ path: `/admin/orders/${o.id}/validate`, title: `Validate order #${o.id}` })}>Validate after review</Button>}
                <Button size="sm" variant="danger" onClick={() => setM({ path: `/admin/orders/${o.id}/refund`, title: `Refund order #${o.id}`, danger: true })}>Refund</Button>
              </div>
            </div>
            <ReasonList reasons={o.validation_reasons || []} showPass={false} />
          </div>
        ))}
      </Card>
      <Card className="mb-6">
        <CardHeader title="Flagged external credits" />
        {data.credits.length === 0 ? <Empty title="No flagged external credits" /> : data.credits.map((c: any) => (
          <div key={c.id} className="border-b border-slate-100 p-5 last:border-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-black">{c.certificate_id} · {c.producer_name} · {tonnes(c.tonnes)} Cat {c.category} · source {c.source_name}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setM({ path: `/admin/credits/${c.id}/approve`, title: `Approve ${c.certificate_id}` })}>Approve</Button>
                <Button size="sm" variant="danger" onClick={() => setM({ path: `/admin/credits/${c.id}/reject`, title: `Remove ${c.certificate_id}`, danger: true })}>Remove</Button>
              </div>
            </div>
            <ReasonList reasons={c.validation_reasons} showPass={false} />
          </div>
        ))}
      </Card>
      <Card>
        <CardHeader title="Rejected duplicate certificate IDs (possible fraud)" />
        {data.rejections.length === 0 ? <Empty title="None" /> : (
          <div className="divide-y divide-slate-100">
            {data.rejections.map((r: any) => (
              <p key={r.id} className="px-5 py-3 text-sm"><Pill tone="red">Duplicate</Pill> <b className="font-mono">{r.payload.certificate_id}</b> submitted again by user #{r.actor_id} · {fmtDateTime(r.timestamp)}</p>
            ))}
          </div>
        )}
      </Card>
      <Modal open={!!m} onClose={() => setM(null)} title={m?.title} footer={<Button variant={m?.danger ? "danger" : "primary"} loading={busy} onClick={run}>Confirm</Button>}>
        <Field label="Note (logged in the audit trail)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
