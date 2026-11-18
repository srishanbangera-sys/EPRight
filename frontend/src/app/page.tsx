import Link from "next/link";
import {
  ArrowRight, FileScan, ShieldCheck, ShoppingBasket, Wallet, Gauge, Clock, Layers, FileWarning, Users,
  Upload, Store, Truck, BadgeCheck, FileBarChart, Check,
} from "lucide-react";
import { Logo, Disclaimer } from "@/components/Brand";
import { HeroDemo } from "@/components/HeroDemo";

const pains = [
  { icon: Clock, title: "Hours lost to invoices", body: "Staff read invoices and reconcile quantities in spreadsheets by hand." },
  { icon: Layers, title: "Wrong-category purchases", body: "Credits only count against the same packaging category. A wrong buy is wasted money." },
  { icon: FileWarning, title: "Risky recyclers", body: "Suspended recyclers or lapsed consents can make credits worthless, with no pre-payment check." },
  { icon: Users, title: "Scattered records", body: "Emails, PDFs, Excel and portal screens, usually held by one person. Audits hurt." },
];

const pillars = [
  { icon: FileScan, title: "AI invoice reading", body: "Upload invoices; AI extracts packaging lines and suggests categories. You confirm every value." },
  { icon: Gauge, title: "One live progress bar", body: "Covered, Committed and Remaining tonnes per category, updated after every order or credit." },
  { icon: ShieldCheck, title: "Pre-purchase Safety Check", body: "Every purchase rated green, amber or red with plain-language reasons before money moves." },
  { icon: ShoppingBasket, title: "Smart Basket", body: "The mix of listings that closes your gap at the lowest risk-adjusted cost by the deadline." },
  { icon: Wallet, title: "Credit Passport", body: "One neutral view of credits bought anywhere, validated by the same rules, ready to file." },
];

const steps = [
  { icon: Upload, title: "Upload invoices", body: "AI reads them, you confirm. Obligation per category is computed." },
  { icon: Store, title: "Check before you buy", body: "Every listing carries a Safety Check verdict. Red is blocked." },
  { icon: ShoppingBasket, title: "Close your gap", body: "Smart Basket recommends what to buy and compares it with naive choices." },
  { icon: Truck, title: "Recycler delivers", body: "The credit is generated on the CPCB portal; the recycler records it here." },
  { icon: BadgeCheck, title: "Validate and cover", body: "You confirm receipt, validation rules run, the bar moves to Covered." },
  { icon: FileBarChart, title: "File with confidence", body: "Download the filing summary with a tamper-evident audit trail." },
];

const stats = [
  { v: "4", l: "packaging categories tracked separately" },
  { v: "11", l: "Safety Check rules before any payment" },
  { v: "5", l: "validation rules on every credit" },
  { v: "SHA-256", l: "hash chain over every action" },
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ---------- Hero ---------- */}
      <section className="bg-hero relative overflow-hidden text-white">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex h-16 items-center justify-between">
            <Logo light />
            <div className="flex items-center gap-1">
              <a href="#how" className="hidden rounded-lg px-3.5 py-2 text-sm text-white/60 transition hover:text-white md:inline-block">How it works</a>
              <Link href="/signup" className="hidden rounded-lg px-3.5 py-2 text-sm text-white/60 transition hover:text-white sm:inline-block">Create account</Link>
              <Link href="/login" className="ml-1 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-900 transition hover:bg-white/90">Sign in</Link>
            </div>
          </nav>

          <div className="grid items-center gap-14 pb-24 pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pb-32 lg:pt-20">
            <div className="animate-fade-up">
              <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1.5 pr-3 text-[13px] text-white/70">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white">EPR</span>
                Plastic packaging compliance, India
              </p>
              <h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[72px]">
                Get your EPR
                <br />
                <span className="text-white/45">right, before you pay.</span>
              </h1>
              <p className="mt-7 max-w-lg text-[17px] leading-relaxed text-white/60">
                The CPCB portal is where you comply. EPRight is where you prepare to comply correctly: read invoices with AI, check every purchase before money moves, and keep audit-ready evidence in one neutral place.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/login" className="group inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-[15px] font-medium text-slate-900 shadow-[0_8px_24px_-8px_rgb(255_255_255/0.35)] transition hover:bg-white/90">
                  Open the live demo <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#how" className="inline-flex h-11 items-center rounded-lg px-5 text-[15px] font-medium text-white/75 ring-1 ring-white/15 transition hover:bg-white/[0.04] hover:text-white">How it works</a>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/45">
                {["Every tonne tracked", "Every credit verified", "Neutral across sources"].map((x) => (
                  <li key={x} className="flex items-center gap-1.5"><Check className="size-3.5 text-brand-200" />{x}</li>
                ))}
              </ul>
            </div>
            <div className="animate-fade-up [animation-delay:120ms]">
              <HeroDemo />
              <p className="mt-3 text-center text-xs text-white/35">Live walkthrough of the demo path · hover to pause · SAMPLE data</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Stat band ---------- */}
      <section className="border-b border-slate-200/70">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-slate-200/70 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x lg:px-8">
          {stats.map((s) => (
            <div key={s.l} className="px-2 py-9 lg:px-8">
              <p className="num text-3xl font-semibold tracking-tight text-slate-900">{s.v}</p>
              <p className="mt-1.5 text-[13px] text-slate-500">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Problem ---------- */}
      <section className="mx-auto w-full max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-medium text-slate-500">The problem</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] text-slate-900 sm:text-[40px]">The portal records what happened. Nobody helps you decide what should.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-slate-500">Every Producer, Importer or Brand Owner placing plastic packaging on the market must have a share of it recycled, by category, every financial year. Shortfalls owe environmental compensation and carry forward.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/80 sm:grid-cols-2">
            {pains.map((p) => (
              <div key={p.title} className="bg-white p-6">
                <p.icon className="size-5 text-slate-400" />
                <p className="mt-4 font-medium text-slate-900">{p.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Solution ---------- */}
      <section className="border-y border-slate-200/70 bg-[#f7f7f5] py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-slate-500">The solution</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-slate-900 sm:text-[40px]">A decision layer around the official portal, not a replacement for it.</h2>
          <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-slate-500">Think GST portal versus accounting software: everyone files on the government portal, but businesses use software to prepare correctly first.</p>
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {pillars.map((p, i) => (
              <div key={p.title} className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
                <div className="flex items-center justify-between">
                  <div className="grid size-9 place-items-center rounded-lg bg-slate-900 text-white"><p.icon className="size-[18px]" /></div>
                  <span className="num text-xs text-slate-300">0{i + 1}</span>
                </div>
                <p className="mt-6 font-medium text-slate-900">{p.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="mx-auto w-full max-w-7xl scroll-mt-8 px-4 py-28 sm:px-6 lg:px-8">
        <p className="text-sm font-medium text-slate-500">How it works</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-[40px]">From invoice to filing in six steps</h2>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/80 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="group bg-white p-7 transition-colors hover:bg-slate-50/60">
              <div className="flex items-center gap-3">
                <span className="num grid size-7 place-items-center rounded-full border border-slate-200 text-xs font-medium text-slate-500 transition-colors group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white">{i + 1}</span>
                <s.icon className="size-[18px] text-slate-400" />
              </div>
              <p className="mt-5 font-medium text-slate-900">{s.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Honest about what is real ---------- */}
      <section className="bg-hero relative overflow-hidden py-28 text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-[40px]">Honest about what is real</h2>
          <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-white/55">EPRight does not issue legal EPR certificates and does not integrate with the CPCB portal in this version. The Safety Check is a rule-based screening, not a guarantee.</p>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              { t: "Built", items: ["AI invoice extraction with human confirmation and manual fallback", "Obligation engine and live three-state progress bar", "Safety Check, Smart Basket, order state machine", "Credit validation rules and duplicate-ID fraud flag", "Tamper-evident SHA-256 audit chain and filing PDF"] },
              { t: "Simulated", items: ["Payments and escrow (mock payment screen)", "Credit generation and transfer happen on the CPCB portal, outside EPRight", "Licence checks are document upload, expiry tracking and admin review", "All demo data is SAMPLE data"] },
              { t: "Roadmap", items: ["Payments through a licensed partner", "Portal integration if access becomes possible", "Consultant multi-client plans", "Other EPR streams (e-waste, battery, tyre)"] },
            ].map((col) => (
              <div key={col.t} className="hairline-top rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7">
                <p className="text-[15px] font-medium text-white">{col.t}</p>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/55">
                  {col.items.map((x) => <li key={x} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-white/30" />{x}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="hairline-top mt-16 flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <p className="text-2xl font-semibold tracking-tight">See the full demo path in two minutes.</p>
              <p className="mt-1.5 text-white/55">Seeded producer, six recyclers and an admin. Switch roles from the header.</p>
            </div>
            <Link href="/login" className="group inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 font-medium text-slate-900 transition hover:bg-white/90">Open the demo <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
          </div>
        </div>
      </section>
      <div className="bg-[#0b110e]"><Disclaimer dark /></div>
    </div>
  );
}
