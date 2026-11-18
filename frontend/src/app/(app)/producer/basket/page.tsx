"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBasket, TrendingDown, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, useToast } from "@/components/Providers";
import { fmtDate, inr, num, tonnes } from "@/lib/format";
import { Button, Card, CardHeader, Empty, ErrorBox, Field, Input, PageHeader, Pill, SafetyBadge, Spinner, Table, Tabs, Td } from "@/components/ui";

type Pref = "CHEAPEST" | "BALANCED" | "SAFEST";

export default function BasketPage() {
  const { year, bump } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [pref, setPref] = useState<Pref>("BALANCED");
  const [deadline, setDeadline] = useState("");
  const [b, setB] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  const compute = async (p = pref, d = deadline) => {
    setLoading(true);
    setError("");
    try {
      const r = await api("/basket", { body: { preference: p, deadline: d || undefined, year } });
      setB(r);
      if (!d) setDeadline(r.deadline);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { compute(pref, ""); }, [year]);

  const placeAll = async (lines: any[]) => {
    setPlacing(true);
    try {
      const r = await api("/basket/place", { body: { year, lines: lines.map((l) => ({ listing_id: l.listing_id, tonnes: l.tonnes })) } });
      const failed = r.results.filter((x: any) => !x.ok);
      toast({ kind: failed.length ? "warning" : "success", title: `${r.placed} order(s) placed`, body: failed.length ? failed.map((f: any) => f.error).join(" ") : "Recyclers have been notified." });
      bump();
      router.push("/producer/orders");
    } catch (e: any) {
      toast({ kind: "error", title: "Could not place orders", body: e.message });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Buy credits" title="Smart Basket · Close my gap" subtitle="Recommends the combination of listings that closes your remaining gap at the lowest risk-adjusted cost by the deadline. Effective cost = price × (1 + weight × (100 − reliability) / 100)." />
      <Card className="mb-6 flex flex-wrap items-end gap-4 p-5">
        <Field label="Preference">
          <Tabs value={pref} onChange={(v) => { setPref(v); compute(v); }} items={[{ value: "CHEAPEST", label: "Cheapest" }, { value: "BALANCED", label: "Balanced" }, { value: "SAFEST", label: "Safest" }]} />
        </Field>
        <Field label="Deliver by"><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Button variant="outline" onClick={() => compute()}>Recalculate</Button>
      </Card>

      {loading ? <Spinner label="Building basket" /> : error ? <ErrorBox error={error} onRetry={() => compute()} /> : b && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-sm font-bold text-slate-500">Basket total</p><p className="num text-3xl font-black">{inr(b.total_cost)}</p><p className="text-sm text-slate-500">{tonnes(b.total_tonnes)} across {b.lines.length} line(s)</p></Card>
            {b.baselines.map((x: any) => (
              <Card key={x.name} className="p-5">
                <p className="text-sm font-bold text-slate-500">vs “{x.label}”</p>
                <p className={`num text-2xl font-black ${x.cost_difference >= 0 ? "text-green-700" : "text-amber-700"}`}>
                  <TrendingDown className="mr-1 inline size-5" />{x.cost_difference >= 0 ? `Save ${inr(x.cost_difference)}` : `${inr(-x.cost_difference)} more`}
                </p>
                <p className="text-sm text-slate-500">Baseline {inr(x.total_cost)} · ignores {x.flags_ignored.length} risk flag(s){x.red_lines ? `, ${x.red_lines} RED line(s) (${num(x.at_risk_tonnes)} t at risk)` : ""}</p>
              </Card>
            ))}
          </div>

          <Card className="mb-6">
            <CardHeader title="Recommended basket" icon={<ShoppingBasket className="size-5" />} subtitle={b.note}
              action={b.lines.length > 0 && <Button variant="accent" loading={placing} onClick={() => placeAll(b.lines)}>Place all orders</Button>} />
            {b.lines.length === 0 ? <Empty title="Nothing to buy" body="You have no remaining obligation, or no eligible listings." /> : (
              <Table head={["Recycler", "Category", "Tonnes", "Price/t", "Cost", "Reliability", "Completes", "Safety", ""]}>
                {b.lines.map((l: any) => (
                  <tr key={l.listing_id}>
                    <Td className="font-bold">{l.recycler_name}</Td>
                    <Td>Cat {l.category}</Td>
                    <Td className="num">{tonnes(l.tonnes)}</Td>
                    <Td className="num">{inr(l.price_per_tonne)}</Td>
                    <Td className="num font-bold">{inr(l.cost)}</Td>
                    <Td className="num">{Math.round(l.reliability)}</Td>
                    <Td>{fmtDate(l.expected_completion)}</Td>
                    <Td><SafetyBadge status={l.safety.status} score={l.safety.score} size="sm" /></Td>
                    <Td><Button size="sm" variant="outline" disabled={placing} onClick={() => placeAll([l])}>Order this</Button></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          {b.shortfall.length > 0 && (
            <Card className="mb-6 border-red-200 bg-red-50 p-5">
              <p className="flex items-center gap-2 font-black text-red-800"><AlertTriangle className="size-5" /> Not enough eligible supply</p>
              {b.shortfall.map((s: any) => <p key={s.category} className="text-sm font-semibold text-red-700">Category {s.category}: {num(s.tonnes)} t short · estimated exposure {inr(s.exposure)} (placeholder rate)</p>)}
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {b.baselines.map((x: any) => (
              <Card key={x.name}>
                <CardHeader title={`Baseline: ${x.label}`} subtitle="Risk flags this approach would have ignored" />
                <div className="space-y-2 p-5">
                  {x.flags_ignored.length === 0 ? <p className="text-sm text-slate-500">None.</p> : x.flags_ignored.map((f: any, i: number) => (
                    <p key={i} className="text-sm"><Pill tone={f.severity === "FAIL" ? "red" : "amber"}>{f.severity === "FAIL" ? "Blocks" : "Warn"}</Pill> <b>{f.recycler_name}</b>: {f.text}</p>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {b.excluded.length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Listings left out" />
              <div className="divide-y divide-slate-100">
                {b.excluded.map((x: any) => <p key={x.listing_id} className="px-5 py-2.5 text-sm"><b>{x.recycler_name}</b> (Cat {x.category}): {x.reason}</p>)}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
