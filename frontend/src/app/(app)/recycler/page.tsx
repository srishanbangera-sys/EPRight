"use client";

import Link from "next/link";
import { Gauge, IndianRupee, Star, Clock, Package } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { inr, tonnes } from "@/lib/format";
import { Card, CardHeader, ErrorBox, LinkButton, OrgStatus, PageHeader, Spinner, Stat } from "@/components/ui";
import { OrdersTable } from "@/components/views";

export default function RecyclerDashboard() {
  const { data, error, loading, reload } = useData(() => api("/dashboard/recycler"));
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const p = data.profile;
  const c = data.capacity;
  const used = c.monthly ? Math.min(100, ((c.listed + c.committed) / c.monthly) * 100) : 0;

  return (
    <div>
      <PageHeader howto={[<>New orders appear under <b>Open orders</b>. Open one to accept it.</>, <>After the producer pays, record the <b>delivered credit</b> (certificate ID, tonnes, date).</>, <>Create supply in <b>My listings</b>, limited by your remaining declared capacity.</>]} eyebrow="Recycler (PWP)" title={p.name} subtitle={`Registered for categories ${p.categories.join(", ")} · ${p.location || ""}`}
        actions={<><OrgStatus status={p.status} until={p.docs_valid_until} /><LinkButton href="/recycler/listings" icon={<Package className="size-4" />}>Create listing</LinkButton></>} />
      {p.status !== "VERIFIED" && (
        <Card className="mb-6 border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Your status is {p.status}. {p.status === "EXPIRED" ? "Your listings are hidden from the marketplace until you renew your documents." : p.status === "PENDING" ? "Listings can be created after an admin approves your documents." : "A document expires soon. Renew it to avoid your listings being hidden."}{" "}
          <Link href="/recycler/profile" className="underline">Manage documents</Link>
        </Card>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Capacity left this month" value={tonnes(c.left)} hint={`${tonnes(c.listed)} listed · ${tonnes(c.committed)} in open orders · ${tonnes(c.monthly)} declared`} icon={<Gauge className="size-5" />} tone="teal" />
        <Stat label="Held in escrow (simulated)" value={inr(data.held)} hint={`Released to you: ${inr(data.earned)}`} icon={<IndianRupee className="size-5" />} tone="amber" />
        <Stat label="Rating" value={p.avgRating != null ? `${p.avgRating} ★` : "-"} hint={`${p.ratingCount} rating(s)`} icon={<Star className="size-5" />} tone="orange" />
        <Stat label="On-time delivery" value={p.onTimeRate != null ? `${Math.round(p.onTimeRate)}%` : "n/a"} hint={`${p.completedOrders} completed order(s)`} icon={<Clock className="size-5" />} tone="green" />
      </div>
      <Card className="mb-6 p-5">
        <p className="mb-2 text-sm font-bold text-slate-500">Declared capacity used</p>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-brand" style={{ width: `${used}%` }} /></div>
      </Card>
      <Card>
        <CardHeader title="Open orders" action={<Link href="/recycler/orders" className="text-sm font-bold text-brand-700">All orders</Link>} />
        <OrdersTable orders={data.open} party="recycler" />
      </Card>
    </div>
  );
}
