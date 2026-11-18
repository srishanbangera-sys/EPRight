"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken, getToken } from "@/lib/api";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export type Role = "PRODUCER" | "RECYCLER" | "ADMIN";
export type User = { id: number; email: string; name: string; role: Role; organization_id: number | null; is_demo: boolean };
export type Org = { id: number; type: string; name: string; status: string; gst_no: string; cpcb_reg_id: string; location: string; contact?: string; categories: string[]; monthly_capacity_t?: number; is_sample?: number };
export type Category = { code: string; name: string };
export type Config = {
  categories: Category[];
  current_fy: string;
  financial_years: string[];
  thresholds: Record<string, number>;
  compensation_rates: number[];
  auto_release: boolean;
  ai_enabled: boolean;
  ai_configured: boolean;
};

type AuthCtx = {
  user: User | null;
  org: Org | null;
  config: Config | null;
  loading: boolean;
  year: string;
  setYear: (y: string) => void;
  version: number;
  bump: () => void;
  login: (email: string, password: string) => Promise<User>;
  demoLogin: (email: string) => Promise<User>;
  acceptSession: (s: { token: string; user: User; organization: Org | null }) => void;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

type Toast = { id: number; kind: "success" | "error" | "warning" | "info"; title: string; body?: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
export const useToast = () => useContext(ToastCtx);

export function homeFor(role?: Role) {
  return role === "RECYCLER" ? "/recycler" : role === "ADMIN" ? "/admin" : "/producer";
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYearState] = useState("");
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const loadConfig = useCallback(async () => {
    try {
      const c = await api<Config>("/config");
      setConfig(c);
      setYearState((y) => y || c.current_fy);
    } catch {
      /* not signed in yet */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setOrg(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<{ user: User; organization: Org | null }>("/auth/me");
      setUser(me.user);
      setOrg(me.organization);
      await loadConfig();
    } catch {
      setUser(null);
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [loadConfig]);

  useEffect(() => {
    refresh();
    const onLogout = () => {
      setUser(null);
      setOrg(null);
    };
    window.addEventListener("epright:logout", onLogout);
    return () => window.removeEventListener("epright:logout", onLogout);
  }, [refresh]);

  const acceptSession = useCallback(
    (s: { token: string; user: User; organization: Org | null }) => {
      setToken(s.token);
      setUser(s.user);
      setOrg(s.organization);
      loadConfig();
      bump();
    },
    [loadConfig, bump],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const s = await api("/auth/login", { body: { email, password } });
      acceptSession(s);
      return s.user as User;
    },
    [acceptSession],
  );

  const demoLogin = useCallback(
    async (email: string) => {
      const s = await api("/auth/demo-login", { body: { email } });
      acceptSession(s);
      return s.user as User;
    },
    [acceptSession],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setOrg(null);
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.kind === "error" ? 7000 : 4500);
  }, []);

  const value = useMemo(
    () => ({ user, org, config, loading, year, setYear: setYearState, version, bump, login, demoLogin, acceptSession, logout, refresh }),
    [user, org, config, loading, year, version, bump, login, demoLogin, acceptSession, logout, refresh],
  );

  return (
    <Ctx.Provider value={value}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
          {toasts.map((t) => {
            const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? XCircle : t.kind === "warning" ? AlertTriangle : Info;
            const color = t.kind === "success" ? "text-covered" : t.kind === "error" ? "text-remaining" : t.kind === "warning" ? "text-committed" : "text-slate-500";
            return (
              <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lift">
                <Icon className={`mt-px size-[18px] shrink-0 ${color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                  {t.body && <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{t.body}</p>}
                </div>
                <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </ToastCtx.Provider>
    </Ctx.Provider>
  );
}
