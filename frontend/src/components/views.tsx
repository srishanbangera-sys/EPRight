"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldX, Download, FileUp, Bug, Undo2, ExternalLink } from "lucide-react";
import { api, download, fileHref } from "@/lib/api";
import { markDemo } from "@/lib/demo";
import { useData } from "@/lib/hooks";
import { fmtDate, fmtDateTime, human, inr, tonnes } from "@/lib/format";
import { useAuth, useToast } from "./Providers";
import { Button, Card, CardHeader, Empty, ErrorBox, Field, Input, OrderStatus, OrgStatus, PageHeader, Pill, SafetyBadge, Select, Spinner, Table, Tabs, Td } from "./ui";

// ---------------- Orders table ----------------
export function OrdersTable({ orders, party }: { orders: any[]; party: "producer" | "recycler" | "both" }) {
  if (!orders.length) return <Empty title="No orders yet" body="Orders will show up here." />;
  return (
    <Table head={["#", party === "recycler" ? "Producer" : party === "producer" ? "Recycler" : "Parties", "Category", "Tonnes", "Total", "Safety", "Status", "Expected", ""]}>
      {orders.map((o) => (
        <tr key={o.id} className="hover:bg-slate-50">
          <Td className="font-bold">#{o.id}</Td>
          <Td>{party === "recycler" ? o.producer_name : party === "producer" ? o.recycler_name : `${o.producer_name} → ${o.recycler_name}`}</Td>
          <Td>Cat {o.category}</Td>
          <Td className="num">{tonnes(o.tonnes)}</Td>
          <Td className="num">{inr(o.total)}</Td>
          <Td><SafetyBadge status={o.safety_status} size="sm" /></Td>
          <Td><OrderStatus status={o.status} /></Td>
          <Td>{fmtDate(o.expected_completion)}</Td>
          <Td><Link href={`/orders/${o.id}`} className="font-bold text-brand-700 hover:underline">Open</Link></Td>
        </tr>
      ))}
    </Table>
  );
}

// ---------------- Audit mode ----------------
export function AuditView({ admin }: { admin?: boolean }) {
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const { data, error, loading, reload } = useData(() => api("/audit", { query: { limit: 300, action: filter } }), [filter]);
  const [chain, setChain] = useState<any>(null);
  const [busy, setBusy] = useState("");

  const verify = async () => {
    setBusy("verify");
    try {
      const r = await api("/audit/verify");
      if (r.intact) markDemo("audit");
      setChain(r);
      toast(r.intact ? { kind: "success", title: "Chain intact", body: `${r.checked} events re-hashed.` } : { kind: "error", title: "Chain broken", body: `First broken event #${r.brokenAt?.id}` });
      reload();
    } catch (e: any) {
      toast({ kind: "error", title: "Verify failed", body: e.message });
    } finally {
      setBusy("");
    }
  };
  const tamper = async () => {
    setBusy("tamper");
    try {
      const r = await api("/admin/audit/tamper", { method: "POST" });
      setChain(r.chain);
      toast({ kind: "warning", title: `Event #${r.event_id} edited in the database`, body: "Now press Verify chain." });
    } catch (e: any) {
      toast({ kind: "error", title: "Tamper failed", body: e.message });
    } finally {
      setBusy("");
    }
  };
  const restore = async () => {
    setBusy("restore");
    try {
      const r = await api("/admin/audit/restore", { method: "POST" });
      setChain(r.chain);
      toast({ kind: "success", title: `Restored ${r.restored} event(s)` });
    } catch (e: any) {
      toast({ kind: "error", title: "Restore failed", body: e.message });
    } finally {
      setBusy("");
    }
  };
  const exp = (format: "csv" | "pdf") => download("/audit/export", `EPRight-audit-log.${format}`, { format }).catch((e) => toast({ kind: "error", title: "Export failed", body: e.message }));

  return (
    <div>
      <PageHeader
        eyebrow="Evidence"
        title={admin ? "Audit log" : "Audit mode"}
        howto={[<>Press <b>Verify chain</b>. Every event is re-hashed and you should see <b>Chain intact</b>.</>, <>Expand <b>payload</b> on any row to see exactly what was recorded.</>, ...(admin ? [<>Press <b>Tamper with an event</b>, then verify again: the break is detected. <b>Restore</b> fixes it.</>] : []), <>Export the log as <b>CSV or PDF</b> for auditors.</>]}
        subtitle="Every significant action is written to a tamper-evident log. Each event's hash = SHA-256(previous hash + timestamp + actor + action + payload). Changing any past event breaks every hash after it."
        actions={
          <>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => exp("csv")}>CSV</Button>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => exp("pdf")}>PDF</Button>
            <Button icon={<ShieldCheck className="size-4" />} loading={busy === "verify"} onClick={verify}>Verify chain</Button>
          </>
        }
      />
      {chain && (
        <Card className={`mb-6 flex flex-wrap items-center gap-4 p-5 ${chain.intact ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          {chain.intact ? <ShieldCheck className="size-10 text-green-600" /> : <ShieldX className="size-10 text-red-600" />}
          <div className="min-w-0 flex-1">
            <p className={`text-2xl font-black ${chain.intact ? "text-green-800" : "text-red-800"}`}>{chain.intact ? "Chain intact" : "Chain broken"}</p>
            <p className="text-sm font-semibold text-slate-600">
              {chain.intact ? `All ${chain.checked} events re-computed and match.` : `First broken event: #${chain.brokenAt?.id} (${chain.brokenAt?.action}). ${chain.reason || "Its stored hash does not match the recomputed hash."}`}
            </p>
          </div>
        </Card>
      )}
      {admin && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
          <Bug className="size-5 text-accent-600" />
          <p className="flex-1 text-sm font-semibold text-slate-600">Demo: edit a past event directly in the database, then verify to show the break is detected.</p>
          <Button variant="outline" size="sm" loading={busy === "tamper"} onClick={tamper}>Tamper with an event</Button>
          <Button variant="outline" size="sm" icon={<Undo2 className="size-4" />} loading={busy === "restore"} onClick={restore}>Restore</Button>
        </Card>
      )}
      <Card>
        <CardHeader title="Events" subtitle={admin && data?.total != null ? `${data.total} events in total` : "Events involving your organisation"} action={<Input placeholder="Filter by action (e.g. ORDER)" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-56" />} />
        {loading ? <Spinner /> : error ? <div className="p-5"><ErrorBox error={error} onRetry={reload} /></div> : (
          <Table head={["#", "Time", "Actor", "Action", "Entity", "Hash"]}>
            {data.events.map((e: any) => (
              <tr key={e.id} className="align-top hover:bg-slate-50">
                <Td className="font-bold">{e.id}</Td>
                <Td className="whitespace-nowrap">{fmtDateTime(e.timestamp)}</Td>
                <Td><Pill>{e.actor_role}</Pill></Td>
                <Td>
                  <p className="font-bold text-slate-800">{e.action}</p>
                  <details className="text-xs text-slate-500"><summary className="cursor-pointer">payload</summary><pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2">{JSON.stringify(e.payload, null, 1)}</pre></details>
                </Td>
                <Td>{e.entity_type} {e.entity_id}</Td>
                <Td className="font-mono text-xs text-slate-500">{String(e.hash).slice(0, 12)}…</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">This is a tamper-evident hash-chained log, not a blockchain.</p>
    </div>
  );
}

// ---------------- Company profile & documents ----------------
export function ProfileView() {
  const { refresh } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api("/orgs/me"));
  const [form, setForm] = useState({ type: "REGISTRATION_CERTIFICATE", number: "", valid_from: "", valid_to: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const org = data;
  const isRec = org.type === "RECYCLER";

  const upload = async () => {
    if (!file) return toast({ kind: "error", title: "Attach the document file" });
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("file", file);
      await api("/documents", { form: fd });
      toast({ kind: "success", title: "Document uploaded", body: "An admin will review it." });
      setFile(null);
      reload();
      refresh();
    } catch (e: any) {
      toast({ kind: "error", title: "Upload failed", body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const saveProfile = async () => {
    try {
      await api("/orgs/me", { method: "PUT", body: edit });
      toast({ kind: "success", title: "Profile saved" });
      setEdit(null);
      reload();
    } catch (e: any) {
      toast({ kind: "error", title: "Save failed", body: e.message });
    }
  };

  return (
    <div>
      <PageHeader howto={[<>Keep your <b>registration</b>{isRec ? " and consent-to-operate" : ""} documents in date. Expiry within 30 days marks you <b>At risk</b>.</>, <>Upload a renewed document below; an admin reviews it.</>, <>Edit location, contact{isRec ? " and monthly capacity" : ""} with <b>Edit</b>.</>]} eyebrow="Account" title={org.name} subtitle="Verification is document upload, expiry tracking and admin review. It is not an automatic government lookup." actions={<OrgStatus status={org.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Company details" action={!edit && <Button size="sm" variant="outline" onClick={() => setEdit({ location: org.location || "", contact: org.contact || "", monthly_capacity_t: org.monthly_capacity_t })}>Edit</Button>} />
          <div className="space-y-3 p-5 text-sm">
            <Row k="GST number" v={org.gst_no} />
            <Row k="CPCB registration ID" v={org.cpcb_reg_id} />
            {edit ? (
              <>
                <Field label="Location"><Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
                <Field label="Contact"><Input value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></Field>
                {isRec && <Field label="Monthly capacity (t)"><Input type="number" value={edit.monthly_capacity_t ?? ""} onChange={(e) => setEdit({ ...edit, monthly_capacity_t: e.target.value })} /></Field>}
                <div className="flex gap-2"><Button size="sm" onClick={saveProfile}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
              </>
            ) : (
              <>
                <Row k="Location" v={org.location || "-"} />
                <Row k="Contact" v={org.contact || "-"} />
                {isRec && <Row k="Categories" v={org.categories.map((c: string) => `Cat ${c}`).join(", ")} />}
                {isRec && <Row k="Monthly capacity" v={tonnes(org.monthly_capacity_t)} />}
                {isRec && <Row k="On-time rate" v={org.onTimeRate != null ? `${Math.round(org.onTimeRate)}% (${org.completedOrders} completed)` : "No completed orders yet"} />}
                {isRec && <Row k="Rating" v={org.avgRating != null ? `${org.avgRating} / 5 (${org.ratingCount})` : "-"} />}
              </>
            )}
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Documents" subtitle="Your organisation is VERIFIED only when every required document is approved and in date." />
            {org.documents.length === 0 ? <Empty title="No documents" /> : (
              <Table head={["Type", "Number", "Valid", "Status", "Note", "File"]}>
                {org.documents.map((d: any) => (
                  <tr key={d.id}>
                    <Td className="font-bold">{human(d.type)}</Td>
                    <Td>{d.number || "-"}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(d.valid_from)} → {fmtDate(d.valid_to)}</Td>
                    <Td><Pill tone={d.status === "APPROVED" ? "green" : d.status === "PENDING" ? "blue" : "red"}>{human(d.status)}</Pill></Td>
                    <Td className="text-xs text-slate-500">{d.review_note || ""}</Td>
                    <Td>{d.file_url ? <a href={fileHref(d.file_url)!} target="_blank" className="text-brand-700"><ExternalLink className="size-4" /></a> : "-"}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Upload or renew a document" icon={<FileUp className="size-5" />} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="REGISTRATION_CERTIFICATE">Registration certificate</option>
                  {isRec && <option value="CONSENT_TO_OPERATE">Consent to operate</option>}
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="Document number"><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
              <Field label="Valid from"><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
              <Field label="Valid to"><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></Field>
              <Field label="File (PDF or image)" className="sm:col-span-2"><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="pt-1.5" /></Field>
              <div className="sm:col-span-2"><Button loading={busy} onClick={upload}>Submit for review</Button></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-bold text-slate-800">{v}</span>
    </div>
  );
}

// ---------------- Orders page (producer & recycler) ----------------
const GROUPS: Record<string, string[] | null> = {
  all: null,
  action: ["ACCEPTED", "DELIVERED"],
  open: ["PLACED", "ACCEPTED", "PAID_ESCROW", "IN_PROGRESS", "DELIVERED", "RECEIVED", "OVERDUE"],
  done: ["VALIDATED", "COMPLETED"],
  issues: ["FLAGGED", "DISPUTED", "REJECTED", "CANCELLED", "REFUNDED", "EXPIRED"],
};

export function OrdersPage({ party, title }: { party: "producer" | "recycler"; title: string }) {
  const { year } = useAuth();
  const [tab, setTab] = useState("all");
  const { data, error, loading, reload } = useData(() => api<any[]>("/orders", { query: party === "producer" ? { year } : {} }), [year]);
  const rows = (data || []).filter((o) => !GROUPS[tab] || GROUPS[tab]!.includes(o.status));
  const actionFor = party === "producer" ? GROUPS.action! : ["PLACED", "PAID_ESCROW", "IN_PROGRESS", "OVERDUE"];
  const count = (k: string) => (data || []).filter((o) => (k === "action" ? actionFor : GROUPS[k] || []).includes(o.status)).length;
  return (
    <div>
      <PageHeader howto={party === "producer" ? [<><b>Needs my action</b>: pay accepted orders, mark delivered ones received.</>, <>Open an order for its timeline and validation result.</>, <>The recycler acts next. Use <b>Demo: switch role</b> to play their side.</>] : [<><b>Needs my action</b>: accept new orders, deliver paid ones.</>, <>Open an order and use the buttons for the next step.</>, <>Record the delivered credit with any certificate ID, e.g. <b>CPCB-DEMO-001</b>.</>]} eyebrow="Orders" title={title} subtitle="Every status change is checked against the order state machine and written to the audit log." />
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} items={[
          { value: "all", label: "All", count: data?.length },
          { value: "action", label: "Needs my action", count: count("action") },
          { value: "open", label: "Open", count: count("open") },
          { value: "done", label: "Validated / completed", count: count("done") },
          { value: "issues", label: "Issues & closed", count: count("issues") },
        ]} />
      </div>
      <Card>{loading ? <Spinner /> : error ? <div className="p-5"><ErrorBox error={error} onRetry={reload} /></div> : <OrdersTable orders={tab === "action" ? (data || []).filter((o) => actionFor.includes(o.status)) : rows} party={party} />}</Card>
    </div>
  );
}

