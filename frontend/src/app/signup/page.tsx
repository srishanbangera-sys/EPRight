"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth, homeFor } from "@/components/Providers";
import { Logo, Disclaimer } from "@/components/Brand";
import { Button, Card, ErrorBox, Field, Input, Tabs } from "@/components/ui";

const CATS = ["I", "II", "III", "IV"];

export default function SignupPage() {
  const { acceptSession } = useAuth();
  const router = useRouter();
  const [type, setType] = useState<"PRODUCER" | "RECYCLER">("PRODUCER");
  const [f, setF] = useState<Record<string, string>>({});
  const [cats, setCats] = useState<string[]>([]);
  const [reg, setReg] = useState<File | null>(null);
  const [consent, setConsent] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("type", type);
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      if (type === "RECYCLER") fd.append("categories", cats.join(","));
      if (reg) fd.append("registration_file", reg);
      if (consent) fd.append("consent_file", consent);
      const s = await api("/auth/signup", { form: fd });
      acceptSession(s);
      router.push(homeFor(s.user.role) + "/profile");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <Link href="/"><Logo /></Link>
        <Card className="mt-6 p-6">
          <h1 className="text-xl font-semibold tracking-tight">Create an account</h1>
          <p className="mt-1 text-sm text-slate-500">Your account stays PENDING until an admin approves your documents.</p>
          <div className="mt-4"><Tabs value={type} onChange={setType} items={[{ value: "PRODUCER", label: "Producer (PIBO)" }, { value: "RECYCLER", label: "Recycler (PWP)" }]} /></div>
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><Input required onChange={set("company_name")} /></Field>
            <Field label="Your name"><Input onChange={set("name")} /></Field>
            <Field label="Email"><Input type="email" required onChange={set("email")} /></Field>
            <Field label="Password" hint="At least 6 characters"><Input type="password" required onChange={set("password")} /></Field>
            <Field label="GST number" hint="15 letters/digits"><Input required maxLength={15} onChange={set("gst_no")} /></Field>
            <Field label="CPCB registration ID"><Input required onChange={set("cpcb_reg_id")} /></Field>
            <Field label="Contact"><Input onChange={set("contact")} /></Field>
            <Field label={type === "RECYCLER" ? "Facility location" : "Location"}><Input required={type === "RECYCLER"} onChange={set("location")} /></Field>
            {type === "RECYCLER" && (
              <>
                <Field label="Categories handled">
                  <div className="flex gap-3 pt-2">
                    {CATS.map((c) => (
                      <label key={c} className="flex items-center gap-1 text-sm font-bold">
                        <input type="checkbox" checked={cats.includes(c)} onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))} /> {c}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Declared monthly capacity (t)"><Input type="number" required onChange={set("monthly_capacity_t")} /></Field>
              </>
            )}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 sm:col-span-2">
              <p className="mb-3 text-sm font-semibold">Registration certificate</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Valid from"><Input type="date" required onChange={set("registration_valid_from")} /></Field>
                <Field label="Valid to"><Input type="date" required onChange={set("registration_valid_to")} /></Field>
                <Field label="File"><Input type="file" required className="pt-1.5" onChange={(e) => setReg(e.target.files?.[0] || null)} /></Field>
              </div>
            </div>
            {type === "RECYCLER" && (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 sm:col-span-2">
                <p className="mb-3 text-sm font-semibold">Consent to operate</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Valid from"><Input type="date" required onChange={set("consent_valid_from")} /></Field>
                  <Field label="Valid to"><Input type="date" required onChange={set("consent_valid_to")} /></Field>
                  <Field label="File"><Input type="file" required className="pt-1.5" onChange={(e) => setConsent(e.target.files?.[0] || null)} /></Field>
                </div>
              </div>
            )}
            {error && <div className="sm:col-span-2"><ErrorBox error={error} /></div>}
            <div className="sm:col-span-2"><Button type="submit" size="lg" loading={busy} className="w-full">Create account</Button></div>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">Already registered? <Link href="/login" className="font-bold text-brand-700">Sign in</Link></p>
        </Card>
      </div>
      <Disclaimer />
    </div>
  );
}
