"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import { human } from "@/lib/format";
import { Button, Card, CardHeader, ErrorBox, Field, Input, PageHeader, Pill, Spinner } from "@/components/ui";

export default function SettingsPage() {
  const toast = useToast();
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useData(() => api("/admin/settings"));
  const [s, setS] = useState<any>(null);
  const [newFy, setNewFy] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS(structuredClone(data)); }, [data]);

  if (loading || !s) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const years: string[] = Array.from(new Set<string>(s.targets.map((t: any) => t.financial_year))).sort();
  const target = (fy: string, c: string) => s.targets.find((t: any) => t.financial_year === fy && t.category === c)?.target_pct ?? "";
  const setTarget = (fy: string, c: string, v: string) => {
    const t = s.targets.filter((x: any) => !(x.financial_year === fy && x.category === c));
    setS({ ...s, targets: [...t, { financial_year: fy, category: c, target_pct: v }] });
  };
  const addYear = () => {
    if (!/^\d{4}-\d{2}$/.test(newFy)) return toast({ kind: "error", title: "Year must look like 2027-28" });
    setS({ ...s, targets: [...s.targets, ...s.categories.map((c: any) => ({ financial_year: newFy, category: c.code, target_pct: 40 }))], filing_deadline_by_year: { ...s.filing_deadline_by_year, [newFy]: `${Number(newFy.slice(0, 4)) + 1}-06-30` } });
    setNewFy("");
  };

  const save = async () => {
    setBusy(true);
    try {
      await api("/admin/settings", { method: "PUT", body: {
        categories: s.categories,
        targets: s.targets.filter((t: any) => t.target_pct !== ""),
        compensation_rates: s.compensation_rates,
        thresholds: s.thresholds,
        filing_deadline_by_year: s.filing_deadline_by_year,
        current_fy: s.current_fy,
        auto_release: s.auto_release,
        ai_enabled: s.ai_enabled,
      } });
      toast({ kind: "success", title: "Settings saved", body: "Obligations recompute with the new values." });
      reload();
      refresh();
    } catch (e: any) {
      toast({ kind: "error", title: "Save failed", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Platform" title="Settings & rules" subtitle="Rules, targets and rates are amended from time to time. Seeded values are DEMO PLACEHOLDERS: verify against the CPCB portal."
        actions={<Button size="lg" loading={busy} onClick={save}>Save all settings</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Packaging categories" />
          <div className="space-y-2 p-5">
            {s.categories.map((c: any, i: number) => (
              <div key={i} className="flex gap-2">
                <Input className="w-20" value={c.code} onChange={(e) => { const cs = [...s.categories]; cs[i] = { ...c, code: e.target.value }; setS({ ...s, categories: cs }); }} />
                <Input value={c.name} onChange={(e) => { const cs = [...s.categories]; cs[i] = { ...c, name: e.target.value }; setS({ ...s, categories: cs }); }} />
                <button className="text-slate-400 hover:text-red-600" onClick={() => setS({ ...s, categories: s.categories.filter((_: any, j: number) => j !== i) })}><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setS({ ...s, categories: [...s.categories, { code: "", name: "" }] })}>Add category</Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="General" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Current financial year"><Input value={s.current_fy} onChange={(e) => setS({ ...s, current_fy: e.target.value })} /></Field>
            <div />
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={s.auto_release} onChange={(e) => setS({ ...s, auto_release: e.target.checked })} /> Auto-release escrow on validation (demo)</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={s.ai_enabled} onChange={(e) => setS({ ...s, ai_enabled: e.target.checked })} /> AI invoice extraction enabled</label>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Target % by year and category" action={<Pill tone="orange">placeholder, verify on CPCB portal</Pill>} />
          <div className="scrollbar-thin overflow-x-auto p-5">
            <table className="text-sm">
              <thead><tr><th className="pr-4 text-left">Year</th>{s.categories.map((c: any) => <th key={c.code} className="px-2 text-left">Cat {c.code}</th>)}<th className="px-2 text-left">Filing deadline</th></tr></thead>
              <tbody>
                {years.map((fy) => (
                  <tr key={fy}>
                    <td className="pr-4 font-bold">{fy}</td>
                    {s.categories.map((c: any) => <td key={c.code} className="px-2 py-1"><Input type="number" className="w-24" value={target(fy, c.code)} onChange={(e) => setTarget(fy, c.code, e.target.value)} /></td>)}
                    <td className="px-2 py-1"><Input type="date" value={s.filing_deadline_by_year[fy] || ""} onChange={(e) => setS({ ...s, filing_deadline_by_year: { ...s.filing_deadline_by_year, [fy]: e.target.value } })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex gap-2"><Input className="w-32" placeholder="2028-29" value={newFy} onChange={(e) => setNewFy(e.target.value)} /><Button size="sm" variant="outline" onClick={addYear}>Add year</Button></div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Compensation rates (₹ per tonne)" subtitle="Used for the exposure estimate. Placeholder, verify." />
          <div className="space-y-2 p-5">
            {s.compensation_rates.map((r: number, i: number) => (
              <Field key={i} label={`Tier ${i + 1}`}><Input type="number" value={r} onChange={(e) => { const rs = [...s.compensation_rates]; rs[i] = e.target.value; setS({ ...s, compensation_rates: rs }); }} /></Field>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Safety Check & alert thresholds" />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {Object.entries(s.thresholds).map(([k, v]) => (
              <Field key={k} label={human(k)}><Input type="number" step="any" value={v as any} onChange={(e) => setS({ ...s, thresholds: { ...s.thresholds, [k]: e.target.value } })} /></Field>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
