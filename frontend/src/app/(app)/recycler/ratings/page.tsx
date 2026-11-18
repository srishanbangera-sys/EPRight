"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { Card, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";

export default function RatingsPage() {
  const { data, error, loading, reload } = useData(() => api("/dashboard/recycler"));
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const p = data.profile;
  return (
    <div>
      <PageHeader eyebrow="Supply" title="Ratings" subtitle="Producers rate you after each completed order. Ratings and on-time rate feed the marketplace ranking and the Safety Check." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-sm font-bold text-slate-500">Average</p><p className="text-3xl font-black">{p.avgRating ?? "-"} <Star className="inline size-6 text-amber-500" /></p></Card>
        <Card className="p-5"><p className="text-sm font-bold text-slate-500">Ratings</p><p className="text-3xl font-black">{p.ratingCount}</p></Card>
        <Card className="p-5"><p className="text-sm font-bold text-slate-500">On-time rate</p><p className="text-3xl font-black">{p.onTimeRate != null ? `${Math.round(p.onTimeRate)}%` : "n/a"}</p><p className="text-xs text-slate-500">Needs 3+ completed orders to count in the Safety Check</p></Card>
      </div>
      <Card>
        {data.ratings.length === 0 ? <Empty title="No ratings yet" /> : (
          <div className="divide-y divide-slate-100">
            {data.ratings.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-bold">{"★".repeat(r.score)}<span className="text-slate-300">{"★".repeat(5 - r.score)}</span> <span className="text-slate-600">{r.from_name}</span></p>
                  {r.comment && <p className="text-sm text-slate-600">{r.comment}</p>}
                </div>
                <div className="text-right text-xs text-slate-400">{fmtDate(r.created_at)}<br /><Link href={`/orders/${r.order_id}`} className="font-bold text-brand-700">Order #{r.order_id}</Link></div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
