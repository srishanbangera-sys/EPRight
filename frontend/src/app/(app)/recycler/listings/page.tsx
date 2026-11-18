"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import { fmtDate, inr, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pill, Select, Spinner, Table, Td } from "@/components/ui";

export default function ListingsPage() {
  const { org } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api("/listings"));
  const [mode, setMode] = useState<null | "new" | number>(null);
  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const openNew = () => { setF({ category: org?.categories?.[0] || "I", tonnes: "", price_per_tonne: "", expected_completion: "", facility: org?.location || "" }); setMode("new"); };
  const openEdit = (l: any) => { setF({ price_per_tonne: l.price_per_tonne, tonnes_available: l.tonnes_available, expected_completion: l.expected_completion, status: l.status === "SOLD_OUT" ? "ACTIVE" : l.status }); setMode(l.id); };

  const save = async () => {
    setBusy(true);
    try {
      if (mode === "new") await api("/listings", { body: f });
      else await api(`/listings/${mode}`, { method: "PUT", body: f });
      toast({ kind: "success", title: mode === "new" ? "Listing created" : "Listing updated" });
      setMode(null);
      reload();
    } catch (e: any) {
      toast({ kind: "error", title: "Could not save", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader howto={[<>Press <b>New listing</b>: category, tonnes, price per tonne, completion date.</>, <>You can only list categories you are <b>registered</b> for, within remaining capacity.</>, <><b>Edit</b> to change price or tonnes, or hide a listing from the marketplace.</>]} eyebrow="Supply" title="My listings" subtitle="Listings need a VERIFIED status with valid documents, a category you are registered for, and tonnes within your remaining declared capacity."
        actions={<Button icon={<Plus className="size-4" />} onClick={openNew}>New listing</Button>} />
      {data?.capacity && <p className="mb-4 text-sm font-semibold text-slate-600">Capacity: {tonnes(data.capacity.left)} left of {tonnes(data.capacity.capacity)}/month ({tonnes(data.capacity.listed)} listed, {tonnes(data.capacity.open)} in open orders)</p>}
      <Card>
        <CardHeader title="Listings" />
        {loading ? <Spinner /> : error ? <div className="p-5"><ErrorBox error={error} onRetry={reload} /></div> : data.listings.length === 0 ? <Empty title="No listings yet" /> : (
          <Table head={["#", "Category", "Available / total", "Ordered", "Price/t", "Completes", "Status", ""]}>
            {data.listings.map((l: any) => (
              <tr key={l.id}>
                <Td className="font-bold">#{l.id}</Td>
                <Td>Cat {l.category}</Td>
                <Td className="num">{tonnes(l.tonnes_available)} / {tonnes(l.tonnes_total)}</Td>
                <Td className="num">{tonnes(l.ordered_tonnes)} ({l.orders})</Td>
                <Td className="num">{inr(l.price_per_tonne)}</Td>
                <Td>{fmtDate(l.expected_completion)}</Td>
                <Td><Pill tone={l.status === "ACTIVE" ? "green" : l.status === "SOLD_OUT" ? "slate" : "amber"}>{l.status}</Pill></Td>
                <Td><Button size="sm" variant="outline" onClick={() => openEdit(l)}>Edit</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === "new" ? "New listing" : `Edit listing #${mode}`}
        footer={<Button loading={busy} onClick={save}>Save</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "new" ? (
            <>
              <Field label="Category"><Select value={f.category} onChange={set("category")}>{["I", "II", "III", "IV"].map((c) => <option key={c} value={c}>{c}{org?.categories?.includes(c) ? "" : " (not registered)"}</option>)}</Select></Field>
              <Field label="Tonnes available"><Input type="number" value={f.tonnes} onChange={set("tonnes")} /></Field>
              <Field label="Facility" className="sm:col-span-2"><Input value={f.facility} onChange={set("facility")} /></Field>
            </>
          ) : (
            <>
              <Field label="Tonnes available"><Input type="number" value={f.tonnes_available} onChange={set("tonnes_available")} /></Field>
              <Field label="Status"><Select value={f.status} onChange={set("status")}><option value="ACTIVE">Active</option><option value="HIDDEN">Hidden</option></Select></Field>
            </>
          )}
          <Field label="Price per tonne (₹)"><Input type="number" value={f.price_per_tonne} onChange={set("price_per_tonne")} /></Field>
          <Field label="Expected completion"><Input type="date" value={f.expected_completion} onChange={set("expected_completion")} /></Field>
        </div>
      </Modal>
    </div>
  );
}
