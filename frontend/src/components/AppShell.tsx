"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, FileText, Scale, Store, ShoppingBasket, ClipboardList, Wallet, FileBarChart, ShieldCheck, Building2,
  Package, Star, UserCheck, Flag, Gavel, Landmark, Settings, ScrollText, Users, Bell, Menu, X, LogOut, RefreshCw, Repeat, ChevronDown, Factory, Recycle, ShieldHalf,
} from "lucide-react";
import { Logo, Disclaimer } from "./Brand";
import { useAuth, useToast, homeFor, type Role } from "./Providers";
import { api } from "@/lib/api";
import { cx, timeAgo } from "@/lib/format";
import { OrgStatus, Pill } from "./ui";

type NavItem = { href: string; label: string; icon: React.ElementType };
const NAV: Record<Role, { section?: string; items: NavItem[] }[]> = {
  PRODUCER: [
    { items: [{ href: "/producer", label: "Dashboard", icon: LayoutDashboard }] },
    { section: "Obligation", items: [
      { href: "/producer/invoices", label: "Invoices", icon: FileText },
      { href: "/producer/obligation", label: "Obligation", icon: Scale },
    ] },
    { section: "Buy credits", items: [
      { href: "/producer/marketplace", label: "Marketplace", icon: Store },
      { href: "/producer/basket", label: "Smart Basket", icon: ShoppingBasket },
      { href: "/producer/orders", label: "Orders", icon: ClipboardList },
    ] },
    { section: "Evidence", items: [
      { href: "/producer/credits", label: "Credit Passport", icon: Wallet },
      { href: "/producer/reports", label: "Filing report", icon: FileBarChart },
      { href: "/producer/audit", label: "Audit mode", icon: ShieldCheck },
      { href: "/producer/profile", label: "Company & documents", icon: Building2 },
    ] },
  ],
  RECYCLER: [
    { items: [{ href: "/recycler", label: "Dashboard", icon: LayoutDashboard }] },
    { section: "Supply", items: [
      { href: "/recycler/orders", label: "Orders to fulfil", icon: ClipboardList },
      { href: "/recycler/listings", label: "My listings", icon: Package },
      { href: "/recycler/ratings", label: "Ratings", icon: Star },
      { href: "/recycler/profile", label: "Profile & documents", icon: Building2 },
    ] },
  ],
  ADMIN: [
    { items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] },
    { section: "Review", items: [
      { href: "/admin/verifications", label: "Verification queue", icon: UserCheck },
      { href: "/admin/flagged", label: "Flagged", icon: Flag },
      { href: "/admin/disputes", label: "Disputes", icon: Gavel },
      { href: "/admin/escrow", label: "Escrow (simulated)", icon: Landmark },
    ] },
    { section: "Platform", items: [
      { href: "/admin/settings", label: "Settings & rules", icon: Settings },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText },
      { href: "/admin/users", label: "Users", icon: Users },
    ] },
  ],
};

type DemoAccount = { email: string; name: string; role: Role; org_name: string; org_status: string };
type Alert = { id: number; type: string; severity: string; message: string; link: string | null; read: number; created_at: string };

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

function RoleSwitcher() {
  const { user, demoLogin, bump } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  useEffect(() => {
    if (open && !accounts.length) api<DemoAccount[]>("/auth/demo-accounts").then(setAccounts).catch(() => {});
  }, [open, accounts.length]);

  const switchTo = async (a: DemoAccount) => {
    setBusy(true);
    try {
      const u = await demoLogin(a.email);
      setOpen(false);
      toast({ kind: "info", title: `Now acting as ${a.org_name}`, body: `${a.role.toLowerCase()} view` });
      router.push(homeFor(u.role));
    } catch (e: any) {
      toast({ kind: "error", title: "Could not switch", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm("Reset all demo data to the original SAMPLE state? Every change made in this demo will be lost.")) return;
    setBusy(true);
    try {
      await api("/demo/reset", { method: "POST" });
      const u = await demoLogin(user?.email || "producer@epright.demo").catch(() => demoLogin("producer@epright.demo"));
      bump();
      setOpen(false);
      toast({ kind: "success", title: "Demo data reset", body: "Fresh SAMPLE data loaded." });
      router.push(homeFor(u.role));
    } catch (e: any) {
      toast({ kind: "error", title: "Reset failed", body: e.message });
    } finally {
      setBusy(false);
    }
  };

  const icon = (r: Role) => (r === "PRODUCER" ? <Factory className="size-4" /> : r === "RECYCLER" ? <Recycle className="size-4" /> : <ShieldHalf className="size-4" />);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 shadow-soft transition hover:border-slate-300 hover:bg-slate-50">
        <span className="size-1.5 rounded-full bg-brand-500" />
        <Repeat className="size-3.5 text-slate-400" />
        <span className="hidden sm:inline">Demo: switch role</span>
        <span className="sm:hidden">Role</span>
        <ChevronDown className="size-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 animate-pop overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Presenter role switcher</p>
            <p className="text-xs text-slate-500">Jump between seeded SAMPLE accounts instantly.</p>
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto p-1.5">
            {accounts.map((a) => (
              <button key={a.email} disabled={busy} onClick={() => switchTo(a)}
                className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50 disabled:opacity-50", user?.email === a.email && "bg-slate-100")}>
                <span className={cx("grid size-8 shrink-0 place-items-center rounded-lg", a.role === "PRODUCER" ? "bg-teal-50 text-brand-700" : a.role === "RECYCLER" ? "bg-green-50 text-green-700" : "bg-violet-50 text-violet-700")}>{icon(a.role)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{a.org_name}</span>
                  <span className="block truncate text-xs text-slate-500">{a.role.toLowerCase()} · {a.email}</span>
                </span>
                {a.role !== "ADMIN" && <OrgStatus status={a.org_status} />}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            <button onClick={reset} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50">
              <RefreshCw className={cx("size-4", busy && "animate-spin")} /> Reset demo data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsBell() {
  const { version, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ alerts: Alert[]; unread: number }>({ alerts: [], unread: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  const load = useCallback(() => api("/alerts").then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load, version, user?.id]);

  const tone = (s: string) => (s === "danger" ? "bg-red-500" : s === "warning" ? "bg-amber-400" : s === "success" ? "bg-green-500" : "bg-teal-500");
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-soft transition hover:border-slate-300 hover:text-slate-800" aria-label="Alerts">
        <Bell className="size-4" />
        {data.unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-slate-900 px-1 text-[10px] font-semibold text-white ring-2 ring-white">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-14 z-40 animate-pop overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Alerts</p>
            {data.unread > 0 && <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => api("/alerts/read-all", { method: "POST" }).then(load)}>Mark all read</button>}
          </div>
          <div className="scrollbar-thin max-h-[60vh] overflow-y-auto">
            {data.alerts.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No alerts yet.</p>}
            {data.alerts.map((a) => (
              <button key={a.id} onClick={() => { api(`/alerts/${a.id}/read`, { method: "POST" }).then(load); setOpen(false); if (a.link) router.push(a.link); }}
                className={cx("flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", !a.read && "bg-slate-50")}>
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", tone(a.severity))} />
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-[13px] leading-snug text-slate-600", !a.read && "font-medium text-slate-900")}>{a.message}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(a.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function YearSelect() {
  const { config, year, setYear, bump } = useAuth();
  if (!config) return null;
  return (
    <label className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white pl-2.5 text-[13px] text-slate-500 shadow-soft transition hover:border-slate-300">
      <span className="hidden md:inline">FY</span>
      <select value={year} onChange={(e) => { setYear(e.target.value); bump(); }} className="num h-full cursor-pointer rounded-r-lg bg-transparent pr-1.5 font-medium text-slate-900 outline-none">
        {config.financial_years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, org, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  if (!user) return null;
  const nav = NAV[user.role];
  const isActive = (href: string) => (href === homeFor(user.role) ? pathname === href : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col border-r border-slate-200/80 bg-white">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href={homeFor(user.role)}><Logo /></Link>
        <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="size-5" /></button>
      </div>
      <div className="mx-3 mb-4 mt-1 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{user.role === "PRODUCER" ? "Producer · PIBO" : user.role === "RECYCLER" ? "Recycler · PWP" : "Platform admin"}</p>
        <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-900">{org?.name || "EPRight"}</p>
        {org && user.role !== "ADMIN" && <div className="mt-1.5"><OrgStatus status={org.status} /></div>}
      </div>
      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {nav.map((g, i) => (
          <div key={i}>
            {g.section && <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">{g.section}</p>}
            <div className="space-y-px">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <Link key={it.href} href={it.href}
                    className={cx("group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors duration-150",
                      active ? "bg-slate-100 font-medium text-slate-900 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.03)]" : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900")}>
                    <Icon className={cx("size-4 shrink-0 transition-colors", active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-[13px] font-semibold text-white">{(user.name || user.email)[0].toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
          <button onClick={() => { logout(); router.push("/login"); }} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Sign out" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-950/30" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 animate-fade-in shadow-2xl">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <button className="grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="lg:hidden"><Logo /></div>
          <div className="hidden items-center gap-2.5 text-[13px] text-slate-400 lg:flex">
            <Pill tone="slate">Demo · sample data</Pill>
            <span className="hidden xl:inline">The portal is where you comply. EPRight is where you prepare to comply correctly.</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {user.role === "PRODUCER" && <YearSelect />}
            <AlertsBell />
            <RoleSwitcher />
          </div>
        </header>
        <main key={pathname} className="mx-auto w-full max-w-7xl flex-1 animate-fade-up px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
        <Disclaimer />
      </div>
    </div>
  );
}
