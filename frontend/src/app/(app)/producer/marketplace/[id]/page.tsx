"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import { fmtDate, inr, num, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, ErrorBox, Field, Input, Modal, OrgStatus, PageHeader, ReasonList, SafetyBadge, Spinner } from "@/components/ui";

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { year, bump } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { data, error, loading, reload } = useData(() => api(`/listings/${id}`, { query: { year } }), [id, year]);
  const [qty, setQty] = useState("");
  const [safety, setSafety] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [confirmAmber, setConfirmAmber] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.safety) {
      setSafety(data.safety);
      setQty(String(data.safety.inputs.tonnes));
    }
  }, [data]);

  const recheck = async () => {
    setChecking(true);
    try {
      setSafety(await api("/safety-check", { body: { listing_id: Number(id), tonnes: Number(qty), year } }));
    } catch (e: any) {
      toast({ kind: "error", title: "Safety Check failed", body: e.message });
    } finally {
      setChecking(false);
    }
  };

  const place = async (confirm: boolean) => {
    setBusy(true);
    try {
      const o = await api("/orders", { body: { listing_id: Number(id), tonnes: Number(qty), year, confirm_amber: confirm } });
      toast({ kind: "success", title: `Order #${o.id} placed`, body: "Waiting for the recycler to accept." });
      bump();
      router.push(`/orders/${o.id}`);
    } catch (e: any) {
      if (e instanceof ApiError && e.data?.needs_confirmation) {
        setSafety(e.data.safety);
        setConfirmAmber(true);
      } else {
        if (e instanceof ApiError && e.data?.safety) setSafety(e.data.safety);
        toast({ kind: "error", title: "Order not placed", body: e.message });
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { listing: l, recycler: r } = data;

  return (
    <div>
      <Link href="/producer/marketplace" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Marketplace</Link>
      <PageHeader title={`${r.name} · Category ${l.category}`} subtitle={`${inr(l.price_per_tonne)}/t · ${tonnes(l.tonnes_available)} available · completes ${fmtDate(l.expected_completion)}`} actions={<OrgStatus status={r.status} until={r.docs_valid_until} />} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Pre-purchase Safety Check" subtitle={`For ${num(Number(qty))} t. Rule-based screening, not a guarantee. Score starts at 100: −40 per hard failure, −15 per warning.`}
              action={safety && <SafetyBadge status={safety.status} score={safety.score} size="lg" />} />
            <div className="p-5">{safety ? <ReasonList reasons={safety.reasons} /> : <p className="text-sm text-slate-500">No check yet.</p>}</div>
          </Card>
          <Card>
            <CardHeader title="Recycler" />
            <div className="grid gap-4 p-5 sm:grid-cols-4 text-sm">
              <div><p className="text-slate-500">Rating</p><p className="flex items-center gap-1 font-black"><Star className="size-4 text-amber-500" />{r.avgRating ?? "-"} ({r.ratingCount})</p></div>
              <div><p className="text-slate-500">On-time delivery</p><p className="font-black">{r.onTimeRate != null ? `${Math.round(r.onTimeRate)}%` : "n/a"}</p><p className="text-xs text-slate-400">{r.completedOrders} completed</p></div>
              <div><p className="text-slate-500">Categories</p><p className="font-black">{r.categories.join(", ")}</p></div>
              <div><p className="text-slate-500">Median price (Cat {l.category})</p><p className="font-black">{data.median_price ? inr(data.median_price) : "-"}</p></div>
            </div>
            {data.ratings.length > 0 && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {data.ratings.map((x: any, i: number) => <p key={i} className="px-5 py-2 text-sm"><b>{x.score}★</b> {x.comment} <span className="text-slate-400">· {x.from_name}</span></p>)}
              </div>
            )}
          </Card>
        </div>
        <Card className="h-fit p-5">
          <p className="mb-3 text-lg font-black">Order credits</p>
          <Field label="Tonnes" hint={safety?.suggestedMax != null ? `Suggested maximum: ${num(safety.suggestedMax)} t (your remaining need)` : undefined}>
            <Input type="number" min="0.001" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <p className="num mt-3 text-sm font-bold text-slate-600">Total: {inr(Number(qty) * l.price_per_tonne)}</p>
          <div className="mt-4 grid gap-2">
            <Button variant="outline" loading={checking} onClick={recheck}>Re-run Safety Check</Button>
            <Button loading={busy} disabled={safety?.status === "RED" || !(Number(qty) > 0)} onClick={() => place(false)}>{safety?.status === "RED" ? "Blocked by Safety Check" : "Place order"}</Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">The recycler accepts first. Then you pay into SIMULATED escrow and the tonnes count as Committed.</p>
        </Card>
      </div>

      <Modal open={confirmAmber} onClose={() => setConfirmAmber(false)} title="Safety Check warnings"
        footer={<><Button variant="ghost" onClick={() => setConfirmAmber(false)}>Go back</Button><Button variant="accent" loading={busy} onClick={() => { setConfirmAmber(false); place(true); }}>I understand, place the order</Button></>}>
        <p className="mb-3 text-sm text-slate-600">This purchase is AMBER. You can still order, but review these warnings first:</p>
        <ReasonList reasons={(safety?.reasons || []).filter((x: any) => x.severity === "WARN")} />
      </Modal>
    </div>
  );
}
