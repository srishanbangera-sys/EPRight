"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBasket, Star, Clock, EyeOff, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth } from "@/components/Providers";
import { fmtDate, inr, num, tonnes } from "@/lib/format";
import { Card, Empty, ErrorBox, Field, Input, LinkButton, OrgStatus, PageHeader, SafetyBadge, SampleTag, Select, Spinner } from "@/components/ui";

export default function MarketplacePage() {
  const { year, config } = useAuth();
  const [f, setF] = useState({ category: "", min_price: "", max_price: "", completion_before: "", min_rating: "", verified_only: false, need_only: true, sort: "recommended" });
  const { data, error, loading, reload } = useData(() => api("/listings", { query: { ...f, year, verified_only: f.verified_only, need_only: f.need_only } }), [year, JSON.stringify(f)]);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });

  return (
    <div>
      <PageHeader howto={[<><b>What I still need</b> shows only categories you still owe. Untick it to see everything.</>, <>Each card has a <b>Safety Check</b> badge: green safe, amber caution, red blocked.</>, <>Expired recyclers are <b>hidden</b> automatically (see the note at the bottom).</>, <>Open a card to see every reason and place an order, or press <b>Close my gap</b>.</>]} eyebrow="Buy credits" title="Marketplace" subtitle="Every listing is screened by the rule-based Safety Check for your remaining need. It is a screening, not a guarantee."
        actions={<LinkButton href="/producer/basket" variant="accent" icon={<ShoppingBasket className="size-4" />}>Close my gap</LinkButton>} />

      {data?.remaining && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(data.remaining).filter(([, v]) => (v as number) > 0).map(([c, v]) => (
            <span key={c} className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 ring-1 ring-red-200">Cat {c}: {num(v as number)} t still needed</span>
          ))}
        </div>
      )}

      <Card className="mb-6 grid gap-3 p-4 sm:grid-cols-4 lg:grid-cols-8">
        <Field label="Category"><Select value={f.category} onChange={(e) => set("category", e.target.value)}><option value="">All</option>{config?.categories.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</Select></Field>
        <Field label="Min ₹/t"><Input type="number" value={f.min_price} onChange={(e) => set("min_price", e.target.value)} /></Field>
        <Field label="Max ₹/t"><Input type="number" value={f.max_price} onChange={(e) => set("max_price", e.target.value)} /></Field>
        <Field label="Complete by"><Input type="date" value={f.completion_before} onChange={(e) => set("completion_before", e.target.value)} /></Field>
        <Field label="Min rating"><Select value={f.min_rating} onChange={(e) => set("min_rating", e.target.value)}><option value="">Any</option>{[3, 4, 4.5].map((r) => <option key={r} value={r}>{r}+</option>)}</Select></Field>
        <Field label="Sort"><Select value={f.sort} onChange={(e) => set("sort", e.target.value)}><option value="recommended">Recommended</option><option value="price">Price</option><option value="date">Date</option><option value="rating">Rating</option></Select></Field>
        <label className="flex items-center gap-2 pt-6 text-sm font-bold"><input type="checkbox" checked={f.need_only} onChange={(e) => set("need_only", e.target.checked)} /> What I still need</label>
        <label className="flex items-center gap-2 pt-6 text-sm font-bold"><input type="checkbox" checked={f.verified_only} onChange={(e) => set("verified_only", e.target.checked)} /> Verified only</label>
      </Card>

      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          {data.listings.length === 0 && <Card><Empty title="No listings match" body={f.need_only ? "Untick 'What I still need' to see every listing." : undefined} /></Card>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.listings.map((l: any) => (
              <Link key={l.id} href={`/producer/marketplace/${l.id}`}>
                <Card className="flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-extrabold">{l.recycler.name}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3" />{l.facility || l.recycler.location}</p>
                    </div>
                    {l.safety && <SafetyBadge status={l.safety.status} score={l.safety.score} size="sm" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5"><OrgStatus status={l.recycler.status} until={l.recycler.docs_valid_until} />{l.recycler.is_sample ? <SampleTag /> : null}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div><p className="text-xs font-bold text-slate-500">Category</p><p className="font-black">{l.category}</p></div>
                    <div><p className="text-xs font-bold text-slate-500">Price</p><p className="num font-black">{inr(l.price_per_tonne)}<span className="text-xs text-slate-400">/t</span></p></div>
                    <div><p className="text-xs font-bold text-slate-500">Available</p><p className="num font-black">{tonnes(l.tonnes_available, 1)}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1"><Star className="size-3.5 text-amber-500" />{l.recycler.avgRating ?? "-"} ({l.recycler.ratingCount})</span>
                    <span>On-time {l.recycler.onTimeRate != null ? `${Math.round(l.recycler.onTimeRate)}%` : "n/a"}</span>
                    <span className="flex items-center gap-1"><Clock className="size-3.5" />{fmtDate(l.expected_completion)}</span>
                  </div>
                  {l.safety && <p className={`mt-3 border-t border-slate-100 pt-3 text-sm font-semibold ${l.safety.status === "RED" ? "text-red-700" : l.safety.status === "AMBER" ? "text-amber-700" : "text-green-700"}`}>{l.safety.headline}</p>}
                </Card>
              </Link>
            ))}
          </div>
          {data.hidden?.length > 0 && (
            <Card className="mt-6 flex items-start gap-3 p-4 text-sm">
              <EyeOff className="mt-0.5 size-5 text-slate-400" />
              <div>
                <p className="font-bold">Hidden from the marketplace</p>
                {data.hidden.map((h: any) => <p key={h.name} className="text-slate-600">{h.name}: {h.n} listing(s) hidden, recycler status {h.status}.</p>)}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
