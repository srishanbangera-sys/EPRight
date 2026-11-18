"use client";

import { useState } from "react";
import { Download, ShieldCheck, ShieldX } from "lucide-react";
import { api, download } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import { fmtDate, inr, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, Empty, ErrorBox, OrderStatus, PageHeader, Pill, Spinner, Table, Td } from "@/components/ui";

export default function ReportsPage() {
  const { year } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useData(() => api("/reports/summary", { query: { year } }), [year]);
  const [busy, setBusy] = useState(false);
  const pdf = async () => {
    setBusy(true);
    try {
      await download("/reports/filing", `EPRight-filing-summary-${year}.pdf`, { year });
    } catch (e: any) {
      toast({ kind: "error", title: "Download failed", body: e.message });
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const p = data.progress;

  return (
    <div>
      <PageHeader eyebrow={`FY ${year}`} title="Filing preparation summary" subtitle="Confirm all figures on the CPCB portal."
        actions={<Button size="lg" icon={<Download className="size-5" />} loading={busy} onClick={pdf}>Download PDF</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-5"><p className="text-sm font-bold text-slate-500">Required</p><p className="num text-2xl font-black">{tonnes(p.overall.required)}</p></Card>
        <Card className="p-5"><p className="text-sm font-bold text-slate-500">Covered</p><p className="num text-2xl font-black text-green-700">{tonnes(p.overall.covered)}</p></Card>
        <Card className="p-5"><p className="text-sm font-bold text-slate-500">Remaining</p><p className="num text-2xl font-black text-red-700">{tonnes(p.overall.remaining)}</p></Card>
        <Card className="flex items-center gap-3 p-5">
          {data.chain.intact ? <ShieldCheck className="size-8 text-green-600" /> : <ShieldX className="size-8 text-red-600" />}
          <div><p className="text-sm font-bold text-slate-500">Audit chain</p><p className="font-black">{data.chain.intact ? "Intact" : "Broken"}</p></div>
        </Card>
      </div>
      <Card className="mb-6">
        <CardHeader title={data.producer.name} subtitle={`GST ${data.producer.gst_no} · CPCB ${data.producer.cpcb_reg_id}`} />
        <Table head={["Category", "Required", "Covered", "Committed", "Remaining"]}>
          {Object.values(p.byCategory).filter((c: any) => c.required > 0 || c.covered > 0).map((c: any) => (
            <tr key={c.category}><Td className="font-bold">Cat {c.category}</Td><Td className="num">{tonnes(c.required)}</Td><Td className="num">{tonnes(c.covered)}</Td><Td className="num">{tonnes(c.committed)}</Td><Td className="num font-bold">{tonnes(c.remaining)}</Td></tr>
          ))}
        </Table>
      </Card>
      <Card className="mb-6">
        <CardHeader title="Credits" />
        {data.credits.length === 0 ? <Empty title="No credits" /> : (
          <Table head={["Certificate ID", "Recycler", "Source", "Category", "Tonnes", "Date", "Status"]}>
            {data.credits.map((c: any) => (
              <tr key={c.id}><Td className="font-mono text-xs">{c.certificate_id}</Td><Td>{c.recycler_name}</Td><Td>{c.source === "PLATFORM" ? "EPRight" : c.source_name}</Td><Td>{c.category}</Td><Td className="num">{tonnes(c.tonnes)}</Td><Td>{fmtDate(c.issue_date)}</Td><Td><Pill tone={c.status === "VALIDATED" ? "green" : "red"}>{c.status}</Pill></Td></tr>
            ))}
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Orders" />
        {data.orders.length === 0 ? <Empty title="No orders" /> : (
          <Table head={["#", "Recycler", "Category", "Tonnes", "Total", "Status"]}>
            {data.orders.map((o: any) => (
              <tr key={o.id}><Td>#{o.id}</Td><Td>{o.recycler_name}</Td><Td>{o.category}</Td><Td className="num">{tonnes(o.tonnes)}</Td><Td className="num">{inr(o.total)}</Td><Td><OrderStatus status={o.status} /></Td></tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
