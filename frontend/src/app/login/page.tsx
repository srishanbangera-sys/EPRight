"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Factory, Recycle, ShieldHalf } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, homeFor, type Role } from "@/components/Providers";
import { Logo, Disclaimer } from "@/components/Brand";
import { HeroDemo } from "@/components/HeroDemo";
import { Button, ErrorBox, Field, Input, OrgStatus } from "@/components/ui";

type DemoAccount = { email: string; name: string; role: Role; org_name: string; org_status: string };

export default function LoginPage() {
  const { login, demoLogin, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("producer@epright.demo");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    if (!loading && user) router.replace(homeFor(user.role));
  }, [user, loading, router]);
  useEffect(() => {
    api<DemoAccount[]>("/auth/demo-accounts").then(setAccounts).catch((e) => setError(e.message));
  }, []);

  const go = async (fn: () => Promise<{ role: Role }>) => {
    setBusy(true);
    setError("");
    try {
      const u = await fn();
      router.push(homeFor(u.role));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const icon = (r: Role) => (r === "PRODUCER" ? <Factory className="size-4" /> : r === "RECYCLER" ? <Recycle className="size-4" /> : <ShieldHalf className="size-4" />);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left: brand panel with the live product walkthrough */}
      <div className="bg-hero relative hidden overflow-hidden text-white lg:flex lg:w-[52%] lg:flex-col">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
          <Link href="/"><Logo light /></Link>
          <div className="my-auto max-w-xl py-10">
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">Get your EPR right.</h1>
            <p className="mt-3 text-lg text-white/55">Every tonne tracked. Every credit verified.</p>
            <div className="mt-10"><HeroDemo /></div>
          </div>
          <p className="text-xs text-white/35">Final figures must be confirmed on the official CPCB EPR portal. Demo data is sample data.</p>
        </div>
      </div>

      {/* Right: sign in */}
      <div className="flex flex-1 flex-col bg-[#f7f7f5]">
        <div className="px-6 pt-6 lg:hidden"><Link href="/"><Logo /></Link></div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-6 py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1.5 text-sm text-slate-500">Sign in to your EPRight workspace.</p>
          <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); go(() => login(email, password)); }}>
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-10" /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-10" /></Field>
            {error && <ErrorBox error={error} />}
            <Button type="submit" loading={busy} className="w-full" size="lg">Sign in</Button>
          </form>
          <p className="mt-3 text-center text-xs text-slate-400">Demo password for every seeded account: <span className="font-mono text-slate-600">demo123</span></p>

          <div className="my-8 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or continue as a sample account<span className="h-px flex-1 bg-slate-200" /></div>

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-soft">
            {accounts.length === 0 && <div className="skeleton h-40" />}
            {accounts.map((a) => (
              <button key={a.email} disabled={busy} onClick={() => go(() => demoLogin(a.email))}
                className="group flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-slate-50 disabled:opacity-50">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-900 group-hover:text-white">{icon(a.role)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-900">{a.org_name}</span>
                  <span className="block text-xs capitalize text-slate-400">{a.role.toLowerCase()}</span>
                </span>
                {a.role !== "ADMIN" && <OrgStatus status={a.org_status} />}
              </button>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-slate-500">New producer or recycler? <Link href="/signup" className="font-medium text-slate-900 underline-offset-4 hover:underline">Create an account</Link></p>
        </div>
        <div className="lg:hidden"><Disclaimer /></div>
      </div>
    </div>
  );
}
