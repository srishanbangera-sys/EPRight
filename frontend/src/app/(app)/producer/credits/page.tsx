"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { api, ApiError, fileHref } from "@/lib/api";
import { markDemo } from "@/lib/demo";
import { useData } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import { fmtDate, inr, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pill, ReasonList, Select, Spinner, Table, Tabs, Td } from "@/components/ui";

export default function CreditsPage() {
  const { year, config, bump } = useAuth();
  const toast = useToast();
  const [source, setSource] = useState("");
  const { data, error, loading, reload } = useData(() => api("/credits", { query: { year, source } }), [year, source]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries({ ...f, year }).forEach(([k, v]) => fd.append(k, v));
      if (doc) fd.append("document", doc);
      const r = await api("/credits/external", { form: fd });
      setResult({ ok: r.validation.valid, reasons: r.validation.reasons, title: r.validation.valid ? "Credit VALIDATED" : "Credit FLAGGED" });
      toast(r.validation.valid ? { kind: "success", title: "External credit validated", body: "It now counts toward Covered." } : { kind: "warning", title: "External credit flagged", body: "Sent to admin review." });
      setOpen(false);
      setF({});
      bump();
      reload();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) markDemo("dup");
      if (e instanceof ApiError && e.data?.validation) setResult({ ok: false, reasons: (e.data.validation as any).reasons, title: "Rejected: duplicate certificate ID" });
      toast({ kind: "error", title: "Rejected", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader howto={[<>Every credit you hold, from EPRight or <b>anywhere else</b>, in one view.</>, <>Press <b>Add external credit</b>, fill it in (issue date inside this FY) and it validates and counts as Covered.</>, <>Try a <b>certificate ID already used</b>: it is rejected and flagged as possible fraud.</>]} eyebrow="Evidence" title="Credit Passport" subtitle="One neutral view of every credit you hold, bought on EPRight or anywhere else. External credits run through the same validation (rules 1, 2 and 4)."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => { setResult(null); setF({ category: "I", issue_date: "" }); setOpen(true); }}>Add external credit</Button>} />

      {result && (
        <Card className={`mb-6 p-5 ${result.ok ? "border-green-200" : "border-red-200"}`}>
          <p className={`mb-3 text-lg font-black ${result.ok ? "text-green-800" : "text-red-800"}`}>{result.title}</p>
          <ReasonList reasons={result.reasons} />
        </Card>
      )}

      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.by_source.map((s: any) => (
              <Card key={s.source} className="p-5">
                <p className="text-sm font-bold text-slate-500">{s.source}</p>
                <p className="num text-2xl font-black">{tonnes(s.validated_tonnes)}</p>
                <p className="text-xs text-slate-500">validated · {s.count} credit(s), {tonnes(s.tonnes)} total</p>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader title={`Credits · FY ${year}`} action={<Tabs value={source} onChange={setSource} items={[{ value: "", label: "All" }, { value: "PLATFORM", label: "EPRight" }, { value: "EXTERNAL", label: "External" }]} />} />
            {data.credits.length === 0 ? <Empty title="No credits yet" /> : (
              <Table head={["Certificate ID", "Recycler", "Source", "Category", "Tonnes", "Issued", "Status", ""]}>
                {data.credits.map((c: any) => (
                  <tr key={c.id} className="align-top">
                    <Td className="font-mono text-xs font-bold">{c.certificate_id}</Td>
                    <Td>{c.recycler_name}</Td>
                    <Td>
                      <Pill tone={c.source === "PLATFORM" ? "teal" : "violet"}>{c.source === "PLATFORM" ? "EPRight" : c.source_name}</Pill>
                      {c.source === "EXTERNAL" && <p className="mt-1 text-xs text-slate-500">Externally sourced, confirm on portal</p>}
                    </Td>
                    <Td>Cat {c.category}</Td>
                    <Td className="num">{tonnes(c.tonnes)}{c.price_per_tonne ? <p className="text-xs text-slate-400">{inr(c.price_per_tonne)}/t</p> : null}</Td>
                    <Td>{fmtDate(c.issue_date)}</Td>
                    <Td>
                      <Pill tone={c.status === "VALIDATED" ? "green" : c.status === "FLAGGED" ? "red" : "slate"}>{c.status}</Pill>
                      {c.status === "FLAGGED" && <p className="mt-1 max-w-xs text-xs text-red-700">{c.validation_reasons.filter((r: any) => !r.ok).map((r: any) => r.text).join(" ")}</p>}
                    </Td>
                    <Td>
                      {c.order_id && <Link href={`/orders/${c.order_id}`} className="text-xs font-bold text-brand-700">Order #{c.order_id}</Link>}
                      {c.document_url && <a href={fileHref(c.document_url)!} target="_blank" className="ml-2 inline-block text-brand-700"><ExternalLink className="size-3.5" /></a>}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a credit bought outside EPRight" wide
        footer={<Button loading={busy} onClick={submit}>Validate & add</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Certificate ID"><Input value={f.certificate_id || ""} onChange={set("certificate_id")} /></Field>
          <Field label="Source" hint="Another platform, trading venue, direct recycler..."><Input value={f.source_name || ""} onChange={set("source_name")} /></Field>
          <Field label="Recycler name"><Input value={f.recycler_name || ""} onChange={set("recycler_name")} /></Field>
          <Field label="Category"><Select value={f.category} onChange={set("category")}>{config?.categories.map((c) => <option key={c.code} value={c.code}>{c.code}: {c.name}</option>)}</Select></Field>
          <Field label="Tonnes"><Input type="number" value={f.tonnes || ""} onChange={set("tonnes")} /></Field>
          <Field label="Issue date" hint={`Must fall within FY ${year}`}><Input type="date" value={f.issue_date || ""} onChange={set("issue_date")} /></Field>
          <Field label="Price per tonne (optional)"><Input type="number" value={f.price_per_tonne || ""} onChange={set("price_per_tonne")} /></Field>
          <Field label="Document (optional)"><Input type="file" className="pt-1.5" onChange={(e) => setDoc(e.target.files?.[0] || null)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
