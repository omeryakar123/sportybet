const guess = () => { try { const h = location.host; return location.protocol + "//" + (h.includes("localhost") ? "localhost:4000" : "api-" + h.replace(/^(www\.|bo-)/, "")); } catch { return "http://localhost:4000"; } };
export const API_URL = (import.meta as any).env?.VITE_API_URL || guess();
const TOKEN_KEY = "sb_web_token";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };
export async function api<T = any>(path: string, opts: RequestInit & { json?: any } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`;
  if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(opts.json); }
  const res = await fetch(API_URL + path, { ...opts, headers });
  if (res.status === 401 && t) { setToken(null); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data as T;
}
