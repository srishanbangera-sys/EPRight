"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, fileHref } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useToast } from "@/components/Providers";
import { fmtDate, human, tonnes } from "@/lib/format";
import { Button, Card, ErrorBox, Field, Modal, OrgStatus, PageHeader, Pill, SampleTag, Spinner, Tabs, Textarea } from "@/components/ui";

export default function VerificationsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api<any[]>("/admin/verifications"));
  const [tab, setTab] = useState("pending");
  const [reject, setReject] = useState<any>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const review = async (docId: number, action: "approve" | "reject", n?: string) => {
    setBusy(true);
    try {
      const r = await api(`/admin/verifications/${docId}/${action}`, { method: "POST", body: { note: n } });
      toast({ kind: "success", title: `Document ${action === "approve" ? "approved" : "rejected"}`, body: `Organisation status: ${r.org_status}` });
      setReject(null);
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
  const pending = data!.filter((o) => o.documents.some((d: any) => d.status === "PENDING"));
  const rows = tab === "pending" ? pending : data!;

  return (
    <div>
      <PageHeader eyebrow="Review" title="Verification queue" subtitle="Approve or reject uploaded documents. An organisation is VERIFIED only when all required documents are approved and in date. This is a manual review, not a government lookup." />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "pending", label: "Pending review", count: pending.length }, { value: "all", label: "All organisations", count: data!.length }]} /></div>
      {rows.length === 0 && <Card className="p-8 text-center text-slate-500">Nothing waiting for review.</Card>}
      <div className="space-y-4">
        {rows.map((o) => (
          <Card key={o.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black">{o.name} {o.is_sample ? <SampleTag /> : null}</p>
                <p className="text-sm text-slate-500">{o.type.toLowerCase()} · GST {o.gst_no} · CPCB {o.cpcb_reg_id}{o.type === "RECYCLER" && ` · Cat ${o.categories.join(", ")} · ${tonnes(o.monthly_capacity_t)}/month`}</p>
              </div>
              <OrgStatus status={o.status} />
            </div>
            <div className="mt-4 space-y-2">
              {o.documents.map((d: any) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <span className="font-bold">{human(d.type)}</span>
                  <span className="text-slate-500">{d.number}</span>
                  <span className="text-slate-500">{fmtDate(d.valid_from)} → {fmtDate(d.valid_to)}</span>
                  <Pill tone={d.status === "APPROVED" ? "green" : d.status === "PENDING" ? "blue" : "red"}>{d.status}</Pill>
                  {d.file_url && <a href={fileHref(d.file_url)!} target="_blank" className="flex items-center gap-1 font-bold text-brand-700"><ExternalLink className="size-3.5" />Preview</a>}
                  {d.status === "PENDING" && (
                    <span className="ml-auto flex gap-2">
                      <Button size="sm" loading={busy} onClick={() => review(d.id, "approve")}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setReject(d)}>Reject</Button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject document" footer={<Button variant="danger" loading={busy} onClick={() => review(reject.id, "reject", note)}>Reject</Button>}>
        <Field label="Reason (sent to the organisation)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
