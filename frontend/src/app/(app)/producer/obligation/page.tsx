"use client";

import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth } from "@/components/Providers";
import { fmtDate, inr, num, tonnes } from "@/lib/format";
import { ProgressBar, ProgressLegend } from "@/components/ProgressBar";
import { Card, CardHeader, Empty, ErrorBox, PageHeader, Pill, Spinner, Table, Td } from "@/components/ui";

export default function ObligationPage() {
  const { year } = useAuth();
  const { data, error, loading, reload } = useData(() => api("/obligations", { query: { year } }), [year]);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const name = (c: string) => data.categories.find((x: any) => x.code === c)?.name || c;

  return (
    <div>
      <PageHeader howto={[<>Each category's required tonnes = <b>placed tonnes × target %</b>.</>, <>Change the <b>FY</b> selector in the header to view another financial year.</>, <>The bottom table lists the exact <b>invoice lines</b> behind every number.</>]} eyebrow={`FY ${data.financial_year} · change the year in the header`} title="Obligation breakdown"
        subtitle="Obligation (t) = packaging placed on the market (t) × target %. Targets are DEMO PLACEHOLDERS: verify on the CPCB portal." />
      <Card className="mb-6 p-5">
        <ProgressBar p={data.overall} size="lg" />
        <div className="mt-4"><ProgressLegend p={data.overall} /></div>
      </Card>
      <Card className="mb-6">
        <CardHeader title="By category" />
        <Table head={["Category", "Placed", "Target", "Required", "Covered", "Committed", "Remaining", "Exposure"]}>
          {Object.values(data.byCategory).map((c: any) => (
            <tr key={c.category}>
              <Td><b>{c.category}</b> <span className="text-slate-500">{name(c.category)}</span></Td>
              <Td className="num">{tonnes(c.placed_tonnes, 3)}</Td>
              <Td>{c.target_pct}% <Pill tone="orange">placeholder</Pill></Td>
              <Td className="num font-bold">{tonnes(c.required, 3)}</Td>
              <Td className="num text-green-700">{tonnes(c.covered)}</Td>
              <Td className="num text-amber-700">{tonnes(c.committed)}</Td>
              <Td className="num font-bold text-red-700">{tonnes(c.remaining)}</Td>
              <Td className="num">{inr(c.remaining * (data.exposure.tiers[0]?.rate || 0))}</Td>
            </tr>
          ))}
        </Table>
        <p className="px-5 py-3 text-xs text-slate-500">Filing deadline {fmtDate(data.filing_deadline)}. Exposure uses the first placeholder compensation rate ({inr(data.exposure.tiers[0]?.rate)}/t); higher tiers: {data.exposure.tiers.slice(1).map((t: any) => inr(t.amount)).join(", ")}.</p>
      </Card>
      <Card>
        <CardHeader title="Source invoice lines" />
        {data.source_lines.length === 0 ? <Empty title="No confirmed invoices in this year" /> : (
          <Table head={["Invoice", "Date", "Seller", "Description", "Category", "Tonnes", "Source"]}>
            {data.source_lines.map((l: any, i: number) => (
              <tr key={i}>
                <Td className="font-bold">{l.invoice_number}</Td>
                <Td>{fmtDate(l.invoice_date)}</Td>
                <Td>{l.seller_name}</Td>
                <Td>{l.description}</Td>
                <Td>Cat {l.category}</Td>
                <Td className="num">{num(l.quantity_tonnes, 3)}</Td>
                <Td><Pill>{l.extraction_source}</Pill></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
