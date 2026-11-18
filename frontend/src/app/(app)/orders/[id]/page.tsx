"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Repeat, ArrowRight, Hourglass, PartyPopper } from "lucide-react";
import { api, fileHref } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import { fmtDate, fmtDateTime, human, inr, todayISO, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, ErrorBox, Field, Input, Modal, OrderStatus, PageHeader, Pill, ReasonList, SafetyBadge, Select, SimulatedBanner, Spinner, Textarea } from "@/components/ui";

const FLOW = ["PLACED", "ACCEPTED", "PAID_ESCROW", "IN_PROGRESS", "DELIVERED", "RECEIVED", "VALIDATED", "COMPLETED"];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, bump, config } = useAuth();
  const toast = useToast();
  const { data: o, error, loading, reload } = useData(() => api(`/orders/${id}`), [id]);
  const [modal, setModal] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const isAdmin = user?.role === "ADMIN";
  const back = isAdmin ? "/admin/escrow" : user?.role === "RECYCLER" ? "/recycler/orders" : "/producer/orders";

  const open = (m: string) => {
    setFiles([]);
    if (m === "deliver") setForm({ certificate_id: "", tonnes: o.tonnes, category: o.category, issue_date: todayISO(), proof_type: "PROCESSING_RECORD" });
    else if (m === "receive") setForm({ certificate_id: o.delivered_certificate_id || "", tonnes: o.delivered_tonnes ?? o.tonnes });
    else if (m === "pay") setForm({ method: "UPI" });
    else if (m === "proof") setForm({ type: "WEIGHMENT_SLIP" });
    else if (m === "rate") setForm({ score: 5, comment: "" });
    else setForm({});
    setModal(m);
  };

  const act = async (action: string, opts: { body?: any; withFiles?: string } = {}) => {
    setBusy(true);
    try {
      const path = isAdmin ? `/admin/orders/${o.id}/${action}` : `/orders/${o.id}/${action}`;
      let r;
      if (opts.withFiles !== undefined) {
        const fd = new FormData();
        Object.entries(opts.body || {}).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, String(v)));
        files.forEach((f) => fd.append(opts.withFiles!, f));
        r = await api(path, { form: fd });
      } else {
        r = await api(path, { method: "POST", body: opts.body || {} });
      }
      setModal(null);
      if (r?.validation) {
        toast(r.validation.valid
          ? { kind: "success", title: "Credit VALIDATED", body: "All rules passed. Tonnes moved from Committed to Covered." }
          : { kind: "error", title: "Order FLAGGED", body: r.validation.reasons.filter((x: any) => !x.ok).map((x: any) => x.text).join(" ") });
      } else toast({ kind: "success", title: `Done: ${human(action)}` });
      bump();
      reload();
    } catch (e: any) {
      toast({ kind: "error", title: "Action failed", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  const btn: Record<string, { label: string; variant?: any; run: () => void }> = {
    accept: { label: "Accept order", run: () => act("accept") },
    reject: { label: "Reject", variant: "outline", run: () => open("reject") },
    cancel: { label: "Cancel order", variant: "outline", run: () => confirm("Cancel this order?") && act("cancel") },
    pay: { label: "Pay into escrow (simulated)", variant: "accent", run: () => open("pay") },
    start: { label: "Start processing", variant: "outline", run: () => act("start") },
    proof: { label: "Upload proof", variant: "outline", run: () => open("proof") },
    deliver: { label: "Record delivered credit", run: () => open("deliver") },
    receive: { label: "Mark received", run: () => open("receive") },
    dispute: { label: "Raise dispute", variant: "ghost", run: () => open("dispute") },
    rate: { label: "Rate", variant: "outline", run: () => open("rate") },
    release: { label: "Release escrow", run: () => act("release") },
    validate: { label: "Override: validate", variant: "outline", run: () => open("validate") },
    refund: { label: "Refund escrow", variant: "danger", run: () => open("refund") },
  };

  const stepIdx = FLOW.indexOf(o.status);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Back</Link>
      <PageHeader howto={[<>The <b>progress rail</b> shows where the order is: Placed → Accepted → Paid → Delivered → Received → Validated.</>, <>The buttons show only the <b>next allowed actions</b> for your role.</>, <><b>Recycler:</b> Accept, then Record delivered credit with any certificate ID, e.g. CPCB-DEMO-001.</>, <><b>Producer:</b> Pay (simulated), then Mark received. Validation runs and tonnes move to Covered.</>]} eyebrow={`Order #${o.id} · FY ${o.financial_year}`} title={`${tonnes(o.tonnes)} of Category ${o.category}`}
        subtitle={`${o.producer_name} buying from ${o.recycler_name} at ${inr(o.price_per_tonne)}/t`}
        actions={<><OrderStatus status={o.status} /><Pill tone={o.escrow_status === "HELD" ? "amber" : o.escrow_status === "RELEASED" ? "green" : "slate"}>Escrow: {human(o.escrow_status)}</Pill></>} />

      <NextStep o={o} />

      <Card className="mb-6 p-5">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto">
          {FLOW.map((s, i) => (
            <div key={s} className="min-w-24 flex-1">
              <div className={`h-2 rounded-full ${stepIdx >= i ? "bg-covered" : "bg-slate-200"}`} />
              <p className={`mt-1.5 text-xs font-bold ${stepIdx >= i ? "text-green-700" : "text-slate-400"}`}>{s === "PAID_ESCROW" ? "Paid" : human(s)}</p>
            </div>
          ))}
        </div>
        {stepIdx < 0 && <p className="mt-3 text-sm font-bold text-red-700">Side state: {human(o.status)}</p>}
        {o.actions.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {o.actions.map((a: string) => btn[a] && <Button key={a} variant={btn[a].variant} loading={busy} onClick={btn[a].run}>{btn[a].label}</Button>)}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {o.validation_reasons && (
            <Card>
              <CardHeader title="Credit validation" subtitle="Rules run automatically when the producer marks the credit received." />
              <div className="p-5"><ReasonList reasons={o.validation_reasons} /></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Timeline" subtitle="From the tamper-evident audit log" />
            <ol className="space-y-3 p-5">
              {o.timeline.map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" />
                  <div className="min-w-0 text-sm">
                    <p className="font-bold">{human(e.action.replace("ORDER_", ""))} <span className="font-semibold text-slate-400">· {e.actor_role} · {fmtDateTime(e.timestamp)}</span></p>
                    {(e.payload.reason || e.payload.certificate_id || e.payload.payment_ref || e.payload.note) && (
                      <p className="text-slate-500">{[e.payload.reason, e.payload.certificate_id && `Certificate ${e.payload.certificate_id}`, e.payload.payment_ref && `Ref ${e.payload.payment_ref}`, e.payload.note].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          {o.disputes.length > 0 && (
            <Card>
              <CardHeader title="Disputes" />
              {o.disputes.map((d: any) => (
                <div key={d.id} className="border-b border-slate-100 p-5 text-sm last:border-0">
                  <p><Pill tone={d.status === "RESOLVED" ? "green" : "red"}>{human(d.status)}</Pill> raised by {d.raised_by_role?.toLowerCase()}: {d.reason}</p>
                  {d.decision && <p className="mt-1 text-slate-600">Decision: <b>{human(d.decision)}</b> · {d.decision_note}</p>}
                </div>
              ))}
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card className="p-5 text-sm">
            <Row k="Total" v={inr(o.total)} />
            <Row k="Expected completion" v={fmtDate(o.expected_completion)} />
            <Row k="Safety at order" v={<SafetyBadge status={o.safety_status} score={o.safety_score} size="sm" />} />
            {o.payment_ref && <Row k="Payment ref (simulated)" v={o.payment_ref} />}
            {o.delivered_certificate_id && <Row k="Certificate (recycler)" v={o.delivered_certificate_id} />}
            {o.delivered_tonnes != null && <Row k="Delivered tonnes" v={tonnes(o.delivered_tonnes)} />}
            {o.delivered_issue_date && <Row k="Issue date" v={fmtDate(o.delivered_issue_date)} />}
            {o.credit && <Row k="Credit" v={<Pill tone={o.credit.status === "VALIDATED" ? "green" : "red"}>{o.credit.certificate_id} · {o.credit.status}</Pill>} />}
          </Card>
          <Card>
            <CardHeader title="Proof files" />
            <div className="space-y-1 p-5 text-sm">
              {o.proofs.length === 0 ? <p className="text-slate-500">None yet.</p> : o.proofs.map((p: any) => (
                <a key={p.id} href={fileHref(p.file_url)!} target="_blank" className="flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"><ExternalLink className="size-3.5" />{p.file_name} <span className="text-slate-400">({human(p.type)})</span></a>
              ))}
              {o.receipt_screenshot_url && <a href={fileHref(o.receipt_screenshot_url)!} target="_blank" className="flex items-center gap-1.5 font-semibold text-brand-700"><ExternalLink className="size-3.5" />Producer portal screenshot</a>}
            </div>
          </Card>
          {o.ratings.length > 0 && (
            <Card className="p-5 text-sm">
              {o.ratings.map((r: any) => <p key={r.id}><b>{r.score}★</b> from {r.from_name}{r.comment ? `: ${r.comment}` : ""}</p>)}
            </Card>
          )}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      <Modal open={modal === "pay"} onClose={() => setModal(null)} title="Pay into escrow"
        footer={<Button variant="accent" loading={busy} onClick={() => act("pay", { body: form })}>Pay {inr(o.total)} (simulated)</Button>}>
        <SimulatedBanner>No real money moves</SimulatedBanner>
        <p className="my-4 text-sm text-slate-600">In production a licensed payment partner would hold this amount in escrow until the credit is validated.</p>
        <Field label="Method"><Select value={form.method} onChange={set("method")}><option>UPI</option><option>NEFT</option><option>Card</option></Select></Field>
      </Modal>

      <Modal open={modal === "deliver"} onClose={() => setModal(null)} title="Record delivered credit"
        footer={<Button loading={busy} onClick={() => act("deliver", { body: form, withFiles: "files" })}>Mark delivered</Button>}>
        <p className="mb-4 text-sm text-slate-600">Generate and transfer the certificate on the official CPCB portal first (outside EPRight), then record it here.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Certificate ID" className="sm:col-span-2"><Input value={form.certificate_id} onChange={set("certificate_id")} placeholder="e.g. CPCB-PWP-2026-000123" /></Field>
          <Field label="Tonnes"><Input type="number" value={form.tonnes} onChange={set("tonnes")} /></Field>
          <Field label="Category"><Select value={form.category} onChange={set("category")}>{config?.categories.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</Select></Field>
          <Field label="Issue date"><Input type="date" value={form.issue_date} onChange={set("issue_date")} /></Field>
          <Field label="Proof files (optional)"><Input type="file" multiple className="pt-1.5" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></Field>
        </div>
      </Modal>

      <Modal open={modal === "receive"} onClose={() => setModal(null)} title="Mark credit received"
        footer={<Button loading={busy} onClick={() => act("receive", { body: form, withFiles: "screenshot" })}>Confirm receipt & validate</Button>}>
        <p className="mb-4 text-sm text-slate-600">Check your own CPCB portal account first. A mismatch with the recycler's entry flags the order.</p>
        <div className="grid gap-3">
          <Field label="Certificate ID" hint="Pre-filled from the recycler's entry. Edit if your portal shows something different."><Input value={form.certificate_id} onChange={set("certificate_id")} /></Field>
          <Field label="Tonnes"><Input type="number" value={form.tonnes} onChange={set("tonnes")} /></Field>
          <Field label="Portal screenshot (optional)"><Input type="file" accept="image/*,.pdf" className="pt-1.5" onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 1))} /></Field>
        </div>
      </Modal>

      <Modal open={modal === "proof"} onClose={() => setModal(null)} title="Upload proof"
        footer={<Button loading={busy} onClick={() => act("proofs", { body: form, withFiles: "files" })}>Upload</Button>}>
        <div className="grid gap-3">
          <Field label="Type"><Select value={form.type} onChange={set("type")}><option value="WEIGHMENT_SLIP">Weighment slip</option><option value="PROCESSING_RECORD">Processing record</option><option value="GST_EINVOICE">GST e-invoice</option><option value="OTHER">Other</option></Select></Field>
          <Field label="Files"><Input type="file" multiple className="pt-1.5" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></Field>
        </div>
      </Modal>

      <Modal open={modal === "reject"} onClose={() => setModal(null)} title="Reject order" footer={<Button variant="danger" loading={busy} onClick={() => act("reject", { body: form })}>Reject</Button>}>
        <Field label="Reason"><Textarea value={form.reason || ""} onChange={set("reason")} /></Field>
      </Modal>

      <Modal open={modal === "dispute"} onClose={() => setModal(null)} title="Raise a dispute" footer={<Button variant="danger" loading={busy} onClick={() => act("dispute", { body: form, withFiles: "evidence" })}>Submit dispute</Button>}>
        <div className="grid gap-3">
          <Field label="Reason"><Textarea value={form.reason || ""} onChange={set("reason")} /></Field>
          <Field label="Evidence (optional)"><Input type="file" className="pt-1.5" onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 1))} /></Field>
        </div>
      </Modal>

      <Modal open={modal === "rate"} onClose={() => setModal(null)} title="Rate this order" footer={<Button loading={busy} onClick={() => act("rate", { body: form })}>Submit rating</Button>}>
        <div className="grid gap-3">
          <Field label="Score"><Select value={form.score} onChange={set("score")}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</Select></Field>
          <Field label="Comment"><Textarea value={form.comment} onChange={set("comment")} /></Field>
        </div>
      </Modal>

      <Modal open={modal === "validate" || modal === "refund"} onClose={() => setModal(null)} title={modal === "validate" ? "Validate after review" : "Refund simulated escrow"}
        footer={<Button variant={modal === "refund" ? "danger" : "primary"} loading={busy} onClick={() => act(modal!, { body: form })}>{modal === "validate" ? "Validate" : "Refund"}</Button>}>
        <Field label="Note (logged)"><Textarea value={form.note || ""} onChange={set("note")} /></Field>
      </Modal>
    </div>
  );
}

/** Tells the presenter whose turn it is, with a one-click role switch that lands on this same order. */
function NextStep({ o }: { o: any }) {
  const { user, demoLogin } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!user || user.role === "ADMIN") return null;
  const me = user.role;
  const waitingOn: Record<string, { who: "PRODUCER" | "RECYCLER"; text: string }> = {
    PLACED: { who: "RECYCLER", text: "The recycler needs to accept or reject this order." },
    ACCEPTED: { who: "PRODUCER", text: "The producer pays into simulated escrow. The tonnes then count as Committed." },
    PAID_ESCROW: { who: "RECYCLER", text: "The recycler generates the credit on the CPCB portal, then records the certificate here." },
    IN_PROGRESS: { who: "RECYCLER", text: "The recycler records the delivered certificate." },
    OVERDUE: { who: "RECYCLER", text: "Past the expected date. The recycler should deliver now." },
    DELIVERED: { who: "PRODUCER", text: "The producer checks their CPCB account and marks it received. Validation runs automatically." },
  };
  const done = ["VALIDATED", "COMPLETED"].includes(o.status);
  const w = waitingOn[o.status];
  if (!done && !w) return null;

  const switchTo = async (role: "PRODUCER" | "RECYCLER") => {
    setBusy(true);
    try {
      const accounts = await api<any[]>("/auth/demo-accounts");
      const name = role === "PRODUCER" ? o.producer_name : o.recycler_name;
      const acct = accounts.find((a) => a.org_name === name);
      if (!acct) throw new Error("No demo account for this organisation");
      await demoLogin(acct.email);
      toast({ kind: "info", title: `Now acting as ${acct.org_name}`, body: `${role.toLowerCase()} view` });
      router.push(`/orders/${o.id}`);
    } catch (e: any) {
      toast({ kind: "error", title: "Could not switch", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-green-200/80 bg-green-50/60 px-4 py-3">
        <PartyPopper className="size-[18px] text-covered" />
        <p className="flex-1 text-sm text-green-900"><span className="font-medium">Credit validated.</span> {o.tonnes} t moved to Covered{o.status === "COMPLETED" ? " and the simulated escrow was released" : ""}.</p>
        {me === "PRODUCER"
          ? <Link href="/producer" className="inline-flex items-center gap-1 text-sm font-medium text-green-900 hover:underline">See the bar <ArrowRight className="size-4" /></Link>
          : user.is_demo && <button disabled={busy} onClick={() => switchTo("PRODUCER")} className="inline-flex items-center gap-1.5 text-sm font-medium text-green-900 hover:underline"><Repeat className="size-4" /> Switch to producer</button>}
      </div>
    );
  }
  const mine = w.who === me;
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${mine ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white shadow-soft"}`}>
      {mine ? <ArrowRight className="size-[18px] text-committed" /> : <Hourglass className="size-[18px] text-slate-400" />}
      <p className={`flex-1 text-sm ${mine ? "text-white/90" : "text-slate-600"}`}>
        <span className={`font-medium ${mine ? "text-white" : "text-slate-900"}`}>{mine ? "Your turn. " : `Waiting on the ${w.who.toLowerCase()}. `}</span>{w.text}
      </p>
      {!mine && user.is_demo && (
        <Button size="sm" variant="primary" loading={busy} icon={<Repeat className="size-3.5" />} onClick={() => switchTo(w.who)}>Switch to {w.who.toLowerCase()}</Button>
      )}
      {mine && <span className="text-xs text-white/50">Use the buttons below</span>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-bold">{v}</span>
    </div>
  );
}
