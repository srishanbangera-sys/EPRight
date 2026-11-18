"use client";

import { useState } from "react";
import Link from "next/link";
import { api, fileHref } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useToast } from "@/components/Providers";
import { fmtDateTime, human, inr, tonnes } from "@/lib/format";
import { Button, Card, Empty, ErrorBox, Field, Modal, OrderStatus, PageHeader, Pill, Select, Spinner, Textarea } from "@/components/ui";

export default function DisputesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api<any[]>("/admin/disputes"));
  const [d, setD] = useState<any>(null);
  const [decision, setDecision] = useState("REFUND");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    setBusy(true);
    try {
      await api(`/admin/disputes/${d.id}/decide`, { body: { decision, note } });
      toast({ kind: "success", title: "Decision logged" });
      setD(null);
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
      <PageHeader eyebrow="Review" title="Disputes" subtitle="Review the reason and evidence, then refund, release, or ask for more proof. Every decision is logged." />
      <Card>
        {data!.length === 0 ? <Empty title="No disputes" /> : (
          <div className="divide-y divide-slate-100">
            {data!.map((x) => (
              <div key={x.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="font-black"><Link href={`/orders/${x.order_id}`} className="hover:underline">Order #{x.order_id}</Link> · {x.producer_name} ← {x.recycler_name}</p>
                  <p className="text-sm text-slate-500">{tonnes(x.tonnes)} Cat {x.category} · {inr(x.total)} · raised by {x.raised_by_name} ({x.raised_by_role?.toLowerCase()}) · {fmtDateTime(x.created_at)}</p>
                  <p className="mt-2 text-sm">{x.reason}</p>
                  {x.evidence_url && <a href={fileHref(x.evidence_url)!} target="_blank" className="text-sm font-bold text-brand-700">View evidence</a>}
                  {x.decision && <p className="mt-2 text-sm text-slate-600">Decision: <b>{human(x.decision)}</b> · {x.decision_note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={x.status === "RESOLVED" ? "green" : "red"}>{human(x.status)}</Pill>
                  <OrderStatus status={x.order_status} />
                  {x.order_status === "DISPUTED" && <Button size="sm" onClick={() => { setD(x); setDecision("REFUND"); }}>Decide</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal open={!!d} onClose={() => setD(null)} title={`Decide dispute on order #${d?.order_id}`} footer={<Button loading={busy} onClick={decide}>Log decision</Button>}>
        <div className="grid gap-3">
          <Field label="Decision"><Select value={decision} onChange={(e) => setDecision(e.target.value)}><option value="REFUND">Refund producer (simulated)</option><option value="RELEASE">Release to recycler (simulated)</option><option value="MORE_PROOF">Request more proof</option></Select></Field>
          <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
