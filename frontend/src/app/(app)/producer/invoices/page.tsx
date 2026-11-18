"use client";

import { useState } from "react";
import { FileUp, Sparkles, PencilLine, Trash2, Plus, AlertTriangle, ExternalLink } from "lucide-react";
import { api, fileHref } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import { cx, fmtDate, num, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, Empty, ErrorBox, Field, Input, PageHeader, Pill, Select, Spinner, Table, Td } from "@/components/ui";

type Item = { description: string; packaging_type: string; quantity_value: number | string; unit: "kg" | "tonne"; category_suggestion: string; confidence: number | null };
type Draft = { invoice_id: number; file_name: string | null; file_url: string | null; source: string; message: string; extraction: { invoice_number: string; invoice_date: string; seller_name: string; buyer_name: string; items: Item[]; notes: string } };

export default function InvoicesPage() {
  const { year, config, bump } = useAuth();
  const toast = useToast();
  const list = useData(() => api("/invoices", { query: { year } }), [year]);
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [threshold, setThreshold] = useState(0.7);
  const [busy, setBusy] = useState("");

  const extract = async (mode: "files" | "sample" | "manual", sampleNo?: number) => {
    setBusy(mode + (sampleNo || ""));
    try {
      const fd = new FormData();
      if (mode === "files") {
        if (!files.length) throw new Error("Choose at least one invoice file");
        files.forEach((f) => fd.append("files", f));
      }
      if (mode === "sample") fd.append("sample_no", String(sampleNo));
      const r = await api("/invoices/extract", { form: fd });
      setThreshold(r.low_confidence_threshold ?? 0.7);
      setDrafts((d) => [...r.drafts, ...d]);
      setFiles([]);
      toast({ kind: "info", title: `${r.drafts.length} invoice(s) ready to review`, body: r.drafts[0]?.message });
    } catch (e: any) {
      toast({ kind: "error", title: "Could not read invoice", body: e.message });
    } finally {
      setBusy("");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this confirmed invoice? The obligation will be recomputed.")) return;
    await api(`/invoices/${id}`, { method: "DELETE" }).catch((e) => toast({ kind: "error", title: e.message }));
    list.reload();
    bump();
  };

  return (
    <div>
      <PageHeader eyebrow="Obligation" title="Invoices" subtitle="Upload plastic-packaging invoices. AI reads them as an assistant; you must check and confirm every value before anything is saved." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-1 flex items-center gap-2 font-extrabold"><FileUp className="size-5 text-teal-brand" /> Upload invoices (PDF or image)</p>
          <p className="mb-3 text-sm text-slate-500">AI extraction {config?.ai_enabled && config?.ai_configured ? "is on" : "is not configured, so the sample invoices load pre-baked extractions and others open a manual form"}.</p>
          <Input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" className="pt-1.5" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          <Button className="mt-3" loading={busy === "files"} onClick={() => extract("files")} icon={<Sparkles className="size-4" />}>Read with AI</Button>
        </Card>
        <Card className="p-5">
          <p className="mb-1 font-extrabold">No file handy?</p>
          <p className="mb-3 text-sm text-slate-500">Load one of the three SAMPLE invoices (files are also in the <code>sample-invoices</code> folder), or type values in by hand.</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((n) => <Button key={n} variant="secondary" loading={busy === `sample${n}`} onClick={() => extract("sample", n)}>SAMPLE-INV-00{n}</Button>)}
            <Button variant="outline" icon={<PencilLine className="size-4" />} loading={busy === "manual"} onClick={() => extract("manual")}>Manual entry</Button>
          </div>
        </Card>
      </div>

      {drafts.map((d) => (
        <DraftForm key={d.invoice_id} draft={d} threshold={threshold} categories={config?.categories || []}
          onDone={() => { setDrafts((x) => x.filter((y) => y.invoice_id !== d.invoice_id)); list.reload(); bump(); }}
          onDiscard={async () => { await api(`/invoices/${d.invoice_id}`, { method: "DELETE" }).catch(() => {}); setDrafts((x) => x.filter((y) => y.invoice_id !== d.invoice_id)); }} />
      ))}

      <Card>
        <CardHeader title={`Confirmed invoices · FY ${year}`} />
        {list.loading ? <Spinner /> : list.error ? <div className="p-5"><ErrorBox error={list.error} /></div> : list.data.length === 0 ? <Empty title="No confirmed invoices for this year" /> : (
          <Table head={["Invoice", "Date", "Seller", "Lines", "Tonnes", "Source", ""]}>
            {list.data.map((i: any) => (
              <tr key={i.id}>
                <Td className="font-bold">{i.invoice_number} {i.file_url && <a href={fileHref(i.file_url)!} target="_blank" className="ml-1 inline-block text-brand-700"><ExternalLink className="size-3.5" /></a>}</Td>
                <Td>{fmtDate(i.invoice_date)}</Td>
                <Td>{i.seller_name}</Td>
                <Td>{i.items.map((it: any) => <div key={it.id} className="text-xs">Cat {it.category}: {it.description}</div>)}</Td>
                <Td className="num">{tonnes(i.items.reduce((s: number, it: any) => s + it.quantity_tonnes, 0), 3)}</Td>
                <Td><Pill tone={i.extraction_source === "AI" ? "teal" : i.extraction_source === "SAMPLE" ? "orange" : "slate"}>{i.extraction_source}</Pill></Td>
                <Td><button onClick={() => remove(i.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" /></button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function DraftForm({ draft, threshold, categories, onDone, onDiscard }: { draft: Draft; threshold: number; categories: { code: string; name: string }[]; onDone: () => void; onDiscard: () => void }) {
  const toast = useToast();
  const [h, setH] = useState({ ...draft.extraction });
  const [items, setItems] = useState<Item[]>(draft.extraction.items.length ? draft.extraction.items : [{ description: "", packaging_type: "", quantity_value: "", unit: "kg", category_suggestion: "I", confidence: null }]);
  const [busy, setBusy] = useState(false);
  const upd = (i: number, k: keyof Item, v: any) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const toT = (it: Item) => (Number(it.quantity_value) || 0) / (it.unit === "kg" ? 1000 : 1);

  const confirmIt = async () => {
    setBusy(true);
    try {
      const r = await api("/invoices/confirm", { body: { invoice_id: draft.invoice_id, ...h, items: items.map((it) => ({ ...it, category: it.category_suggestion })) } });
      toast({ kind: "success", title: `Invoice ${h.invoice_number} confirmed`, body: `Required now ${num(r.progress.overall.required)} t in FY ${r.financial_year}. Remaining ${num(r.progress.overall.remaining)} t.` });
      onDone();
    } catch (e: any) {
      toast({ kind: "error", title: "Cannot confirm", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6 border-teal-200 ring-2 ring-teal-100">
      <CardHeader title={`Review: ${draft.file_name || (draft.source === "SAMPLE" ? "Sample invoice" : "Manual entry")}`} subtitle={draft.message}
        action={<Pill tone={draft.source === "AI" ? "teal" : draft.source === "SAMPLE" ? "orange" : "slate"}>{draft.source}</Pill>} />
      <div className="grid gap-4 p-5 sm:grid-cols-4">
        <Field label="Invoice number"><Input value={h.invoice_number} onChange={(e) => setH({ ...h, invoice_number: e.target.value })} /></Field>
        <Field label="Invoice date" hint="Sets the financial year"><Input type="date" value={h.invoice_date} onChange={(e) => setH({ ...h, invoice_date: e.target.value })} /></Field>
        <Field label="Seller"><Input value={h.seller_name} onChange={(e) => setH({ ...h, seller_name: e.target.value })} /></Field>
        <Field label="Buyer"><Input value={h.buyer_name} onChange={(e) => setH({ ...h, buyer_name: e.target.value })} /></Field>
      </div>
      <div className="space-y-3 px-5">
        {items.map((it, i) => {
          const low = it.confidence != null && it.confidence < threshold;
          return (
            <div key={i} className={cx("grid gap-3 rounded-xl border p-3 sm:grid-cols-12", low ? "border-amber-300 bg-amber-50" : "border-slate-200")}>
              <Field label="Description" className="sm:col-span-3"><Input value={it.description} onChange={(e) => upd(i, "description", e.target.value)} /></Field>
              <Field label="Packaging type" className="sm:col-span-2"><Input value={it.packaging_type} onChange={(e) => upd(i, "packaging_type", e.target.value)} /></Field>
              <Field label="Quantity" className="sm:col-span-2"><Input type="number" value={it.quantity_value} onChange={(e) => upd(i, "quantity_value", e.target.value)} /></Field>
              <Field label="Unit" className="sm:col-span-1"><Select value={it.unit} onChange={(e) => upd(i, "unit", e.target.value)}><option value="kg">kg</option><option value="tonne">t</option></Select></Field>
              <Field label="Category" className="sm:col-span-2" hint={`= ${num(toT(it), 3)} t`}>
                <Select value={it.category_suggestion} onChange={(e) => upd(i, "category_suggestion", e.target.value)}>
                  {categories.map((c) => <option key={c.code} value={c.code}>{c.code}: {c.name}</option>)}
                </Select>
              </Field>
              <div className="flex items-end justify-between gap-2 sm:col-span-2">
                {it.confidence != null && <span className={cx("text-xs font-bold", low ? "text-amber-700" : "text-slate-500")}>{low && <AlertTriangle className="mr-1 inline size-3.5" />}AI confidence {Math.round(it.confidence * 100)}%</span>}
                <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="ml-auto pb-2 text-slate-400 hover:text-red-600"><Trash2 className="size-4" /></button>
              </div>
            </div>
          );
        })}
        <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setItems([...items, { description: "", packaging_type: "", quantity_value: "", unit: "kg", category_suggestion: "I", confidence: null }])}>Add line</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-5">
        <p className="num text-sm font-bold text-slate-600">Total: {tonnes(items.reduce((s, it) => s + toT(it), 0), 3)} of packaging placed on the market</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDiscard}>Discard</Button>
          <Button loading={busy} onClick={confirmIt}>I have checked these values · Confirm</Button>
        </div>
      </div>
    </Card>
  );
}
