"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useToast } from "@/components/Providers";
import { human, inr, tonnes } from "@/lib/format";
import { Button, Card, Empty, ErrorBox, OrderStatus, PageHeader, Pill, SimulatedBanner, Spinner, Table, Td } from "@/components/ui";

export default function EscrowPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api<any[]>("/admin/escrow"));
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (id: number, action: "release" | "refund") => {
    if (action === "refund" && !confirm(`Refund order #${id}?`)) return;
    setBusy(id);
    try {
      await api(`/admin/orders/${id}/${action}`, { method: "POST", body: { note: action === "refund" ? "Refunded by admin from escrow console" : undefined } });
      toast({ kind: "success", title: `Order #${id} ${action === "release" ? "released" : "refunded"}` });
      reload();
    } catch (e: any) {
      toast({ kind: "error", title: "Failed", body: e.message });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader eyebrow="Review" title="Escrow actions" subtitle="Release held amounts once a credit is VALIDATED, or refund." />
      <div className="mb-4"><SimulatedBanner>Escrow is simulated; in production a licensed payment partner would hold funds</SimulatedBanner></div>
      <Card>
        {data!.length === 0 ? <Empty title="No escrow activity yet" /> : (
          <Table head={["#", "Producer → Recycler", "Tonnes", "Amount", "Order", "Escrow", ""]}>
            {data!.map((o) => (
              <tr key={o.id}>
                <Td><Link href={`/orders/${o.id}`} className="font-bold text-brand-700">#{o.id}</Link></Td>
                <Td>{o.producer_name} → {o.recycler_name}</Td>
                <Td className="num">{tonnes(o.tonnes)} Cat {o.category}</Td>
                <Td className="num font-bold">{inr(o.total)}</Td>
                <Td><OrderStatus status={o.status} /></Td>
                <Td><Pill tone={o.escrow_status === "HELD" ? "amber" : o.escrow_status === "RELEASED" ? "green" : "slate"}>{human(o.escrow_status)}</Pill></Td>
                <Td className="whitespace-nowrap">
                  {o.status === "VALIDATED" && <Button size="sm" loading={busy === o.id} onClick={() => act(o.id, "release")}>Release</Button>}
                  {["FLAGGED", "OVERDUE", "EXPIRED"].includes(o.status) && <Button size="sm" variant="danger" loading={busy === o.id} onClick={() => act(o.id, "refund")}>Refund</Button>}
                  {o.status === "DISPUTED" && <Link href="/admin/disputes" className="text-sm font-bold text-brand-700">Decide dispute</Link>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
