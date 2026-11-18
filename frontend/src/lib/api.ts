export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const TOKEN_KEY = "epright_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; query?: Record<string, string | number | boolean | undefined | null> };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(API_URL + path);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(0, `Cannot reach the EPRight API at ${API_URL}. Is the backend running?`, {});
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      setToken(null);
      window.dispatchEvent(new Event("epright:logout"));
    }
    throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`, data || {});
  }
  return data as T;
}

/** Download a binary file (PDF/CSV) with auth. */
export async function download(path: string, filename: string, query?: Record<string, string>) {
  const url = new URL(API_URL + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    throw new ApiError(res.status, msg, {});
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const fileHref = (u?: string | null) => (u ? (u.startsWith("http") ? u : API_URL + u) : null);
