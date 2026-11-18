"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, X, ShieldCheck, ShieldAlert, ShieldX, BadgeCheck, CircleAlert, CircleX, Info, CircleCheck, Inbox, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { cx, fmtDate, human } from "@/lib/format";

// ---------------- Buttons ----------------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
};
const variants = {
  primary: "bg-slate-900 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_1px_2px_rgb(0_0_0/0.2)] hover:bg-slate-800",
  accent: "bg-brand-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(10_32_24/0.3)] hover:bg-brand-800",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200/70",
  outline: "border border-slate-200 bg-white text-slate-700 shadow-soft hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-red-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-red-700",
};
const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-11 px-5 text-[15px] gap-2" };
const btnBase = "inline-flex shrink-0 select-none items-center justify-center rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || loading} className={cx(btnBase, variants[variant], sizes[size], className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", size = "md", icon, className, children }: { href: string; variant?: BtnProps["variant"]; size?: BtnProps["size"]; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cx(btnBase, variants[variant], sizes[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

// ---------------- Layout ----------------
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("rounded-2xl border border-slate-200/80 bg-white shadow-soft", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-slate-400 [&_svg]:size-[18px]">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow, howto }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string; howto?: React.ReactNode[] }) {
  return (
    <div className="mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-[13px] font-medium text-slate-500">{eyebrow}</p>}
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {howto && howto.length > 0 && <HowTo steps={howto} id={typeof title === "string" ? title : "page"} />}
    </div>
  );
}

/** Short, collapsible "how to use this page" steps for presenters. Remembers collapsed state per page. */
export function HowTo({ steps, id }: { steps: React.ReactNode[]; id: string }) {
  const key = `epright_howto_${id}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "0") setOpen(false);
    } catch {}
  }, [key]);
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(key, o ? "0" : "1"); } catch {}
      return !o;
    });
  };
  if (!open) {
    return (
      <button onClick={toggle} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-soft transition hover:border-slate-300 hover:text-slate-900">
        <Lightbulb className="size-3.5 text-committed" /> How to use this page <ChevronDown className="size-3.5" />
      </button>
    );
  }
  return (
    <div className="mt-5 animate-fade-up overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><Lightbulb className="size-3.5 text-committed" /> How to use this page</p>
        <button onClick={toggle} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">Hide <ChevronUp className="size-3.5" /></button>
      </div>
      <ol className={cx("grid divide-slate-100", steps.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4 lg:divide-x" : steps.length === 3 ? "sm:grid-cols-3 sm:divide-x" : "sm:grid-cols-2 sm:divide-x")}>
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 px-4 py-3">
            <span className="num mt-px grid size-5 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-medium text-white">{i + 1}</span>
            <p className="text-[13px] leading-relaxed text-slate-600 [&_b]:font-medium [&_b]:text-slate-900">{s}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = "slate" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "teal" | "orange" }) {
  const tones = { slate: "text-slate-400", green: "text-covered", amber: "text-committed", red: "text-remaining", teal: "text-teal-brand", orange: "text-accent-500" };
  return (
    <Card className="h-full p-5 transition-shadow duration-200 hover:shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        {icon && <span className={cx("[&_svg]:size-4", tones[tone])}>{icon}</span>}
      </div>
      <p className="num mt-3 text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-2 text-[13px] leading-snug text-slate-500">{hint}</p>}
    </Card>
  );
}

/** Page-level loading state: a shimmering skeleton instead of a spinner. */
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="animate-fade-in space-y-5 py-2" aria-busy="true" aria-label={label}>
      <div className="space-y-2.5">
        <div className="skeleton h-3.5 w-28 rounded-md" />
        <div className="skeleton h-7 w-72 max-w-full rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" /> {label}
    </span>
  );
}

export function Empty({ title, body, action, icon }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 [&_svg]:size-5">{icon || <Inbox />}</div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {body && <p className="mt-1 max-w-md text-[13px] text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-red-800">
      <div className="flex items-center gap-2 text-sm">
        <CircleX className="size-4 shrink-0" />
        <span className="font-medium">{error}</span>
      </div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

// ---------------- Badges ----------------
// Quiet neutral badges; the tone shows as a small status dot (green / amber / red carry meaning).
const PILL_DOT: Record<string, string> = {
  slate: "bg-slate-400", green: "bg-covered", amber: "bg-committed", red: "bg-remaining", teal: "bg-brand-500",
  blue: "bg-sky-500", violet: "bg-indigo-400", orange: "bg-accent-500", brand: "bg-brand-500",
};
export function Pill({ children, tone = "slate", className, dot = true }: { children: React.ReactNode; tone?: string; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200/90 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-700 shadow-[0_1px_0_rgb(0_0_0/0.02)]", tone === "red" && "border-red-200 bg-red-50/60 text-red-800", className)}>
      {dot && <span className={cx("size-1.5 shrink-0 rounded-full", PILL_DOT[tone] || PILL_DOT.slate)} />}
      {children}
    </span>
  );
}

export function SafetyBadge({ status, score, size = "md" }: { status?: string; score?: number; size?: "sm" | "md" | "lg" }) {
  if (!status) return null;
  const map: Record<string, { cls: string; dot: string; icon: React.ReactNode; label: string }> = {
    GREEN: { cls: "bg-green-50/80 text-green-800 ring-green-700/15", dot: "bg-covered", icon: <ShieldCheck />, label: "Safe" },
    AMBER: { cls: "bg-amber-50/80 text-amber-900 ring-amber-700/20", dot: "bg-committed", icon: <ShieldAlert />, label: "Caution" },
    RED: { cls: "bg-red-50/80 text-red-800 ring-red-700/15", dot: "bg-remaining", icon: <ShieldX />, label: "Blocked" },
  };
  const m = map[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset", m.cls,
      size === "sm" ? "px-2 py-0.5 text-xs [&_svg]:size-3.5" : size === "lg" ? "px-3 py-1.5 text-sm [&_svg]:size-4" : "px-2.5 py-1 text-[13px] [&_svg]:size-4")}>
      {m.icon}
      {m.label}
      {score != null && <span className="num opacity-60">{score}</span>}
    </span>
  );
}

const ORDER_TONE: Record<string, string> = {
  PLACED: "blue", ACCEPTED: "teal", PAID_ESCROW: "amber", IN_PROGRESS: "amber", DELIVERED: "violet", RECEIVED: "violet",
  VALIDATED: "green", COMPLETED: "green", REJECTED: "slate", CANCELLED: "slate", FLAGGED: "red", DISPUTED: "red",
  OVERDUE: "orange", REFUNDED: "slate", EXPIRED: "red",
};
export function OrderStatus({ status }: { status: string }) {
  return <Pill tone={ORDER_TONE[status] || "slate"}>{status === "PAID_ESCROW" ? "Paid (escrow)" : human(status)}</Pill>;
}

const ORG_TONE: Record<string, string> = { VERIFIED: "green", AT_RISK: "amber", EXPIRED: "red", PENDING: "blue", REJECTED: "red" };
export function OrgStatus({ status, until }: { status: string; until?: string | null }) {
  return (
    <Pill tone={ORG_TONE[status] || "slate"} dot={status !== "VERIFIED"}>
      {status === "VERIFIED" && <BadgeCheck className="size-3.5 text-brand-600" />}
      {status === "AT_RISK" ? "At risk" : human(status)}
      {until && status !== "EXPIRED" && <span className="opacity-70">· to {fmtDate(until)}</span>}
    </Pill>
  );
}

export function ReasonList({ reasons, showPass = true }: { reasons: { severity?: string; text: string; ok?: boolean; code?: string }[]; showPass?: boolean }) {
  const items = reasons.filter((r) => showPass || (r.severity ? r.severity !== "PASS" : !r.ok));
  const cfg: Record<string, { icon: React.ReactNode; tag: string; tagCls: string }> = {
    FAIL: { icon: <CircleX className="size-[18px] text-remaining" />, tag: "Blocks order", tagCls: "text-red-700" },
    WARN: { icon: <CircleAlert className="size-[18px] text-committed" />, tag: "Warning", tagCls: "text-amber-700" },
    INFO: { icon: <Info className="size-[18px] text-sky-500" />, tag: "Info", tagCls: "text-sky-700" },
    PASS: { icon: <CircleCheck className="size-[18px] text-covered" />, tag: "Passed", tagCls: "text-slate-400" },
  };
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80">
      {items.map((r, i) => {
        const sev = r.severity || (r.ok ? "PASS" : "FAIL");
        const c = cfg[sev] || cfg.INFO;
        return (
          <li key={i} className={cx("flex items-start gap-3 px-4 py-3", sev === "FAIL" && "bg-red-50/50", sev === "WARN" && "bg-amber-50/40")}>
            <span className="mt-px shrink-0">{c.icon}</span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-700">{r.text}</p>
            <span className={cx("shrink-0 pt-0.5 text-xs font-medium", c.tagCls)}>{c.tag}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SampleTag() {
  return <Pill tone="orange">Sample</Pill>;
}

export function SimulatedBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-amber-300/50 bg-amber-50/70 px-3.5 py-2.5 text-[13px] text-amber-900">
      <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">Simulated payment</span>
      {children && <span className="font-medium">{children}</span>}
    </div>
  );
}

// ---------------- Forms ----------------
export function Field({ label, hint, error, children, className }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

const inputCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-soft outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-[3px] focus:ring-slate-900/[0.06] disabled:bg-slate-50";
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.type === "file" && "py-1.5 text-[13px] file:h-6", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "cursor-pointer pr-8", props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "h-auto min-h-[88px] py-2", props.className)} />;
}

// ---------------- Modal ----------------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-950/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cx("flex max-h-[92vh] w-full animate-pop flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="-mr-1.5 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------- Table ----------------
export function Table({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("scrollbar-thin overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium text-slate-500">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => <td className={cx("px-5 py-3 align-middle text-slate-700", className)}>{children}</td>;

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode; count?: number }[] }) {
  return (
    <div className="scrollbar-thin inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-slate-200/80 bg-slate-100/70 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx("flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-150", value === it.value ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80" : "text-slate-500 hover:text-slate-800")}
        >
          {it.label}
          {it.count != null && <span className={cx("num rounded px-1 text-[11px]", value === it.value ? "bg-slate-100 text-slate-700" : "text-slate-400")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
