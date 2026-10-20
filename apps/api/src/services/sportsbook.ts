/**
 * Betco Sportsbook (probetlab) partner API istemcisi.
 * İmza: canonical = METHOD\nPATH\nTIMESTAMP\nSHA256(body), signature = HMAC_SHA256(api_secret, canonical)
 * Doküman: docs/integrations/betco-sportsbook.md
 */
import crypto from "node:crypto";

export const SB_BASE = process.env.SPORTSBOOK_API_URL || "https://sportbook.probetlab.com";
const KEY = process.env.SPORTSBOOK_API_KEY || "";
const SECRET = process.env.SPORTSBOOK_API_SECRET || "";

export type SbCreds = { base: string; key: string; secret: string };
/** Sitenin kendi Betco kimliği varsa onu, yoksa env'deki varsayılanı kullan */
export function sbCreds(site?: { sbApiUrl?: string | null; sbApiKey?: string | null; sbApiSecret?: string | null } | null): SbCreds {
  if (site?.sbApiKey && site?.sbApiSecret) return { base: site.sbApiUrl || SB_BASE, key: site.sbApiKey, secret: site.sbApiSecret };
  return { base: SB_BASE, key: KEY, secret: SECRET };
}
export const sbConfigured = (c: SbCreds) => Boolean(c.key && c.secret);
export const sportsbookConfigured = () => sbConfigured(sbCreds());

async function signedWith<T = any>(c: SbCreds, method: "GET" | "POST", path: string, bodyObj?: unknown): Promise<T> {
  if (!sbConfigured(c)) throw new Error("SPORTSBOOK_NOT_CONFIGURED");
  const body = bodyObj ? JSON.stringify(bodyObj) : "{}";
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const signature = crypto.createHmac("sha256", c.secret).update([method, path, ts, bodyHash].join("\n")).digest("hex");
  const res = await fetch(c.base + path, {
    method,
    headers: {
      "X-Api-Key": c.key,
      "X-Timestamp": ts,
      "X-Signature": signature,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err: any = new Error(json.error_code || `SPORTSBOOK_HTTP_${res.status}`);
    err.detail = json;
    throw err;
  }
  return json;
}

const qs = (q: Record<string, unknown>) => {
  const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return p.length ? "?" + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&") : "";
};

export function sbClient(c: SbCreds = sbCreds()) {
  return {
    base: c.base,
    configured: sbConfigured(c),
    me: () => signedWith(c, "GET", "/api/v1/me"),
    prepareLaunch: (p: { external_user_id: string; username?: string; currency?: string; language?: string }) =>
      signedWith(c, "POST", "/api/v1/launch/prepare", p),
    bets: (q: Record<string, unknown>) => signedWith(c, "GET", "/api/v1/bets" + qs(q)),
    bet: (id: string) => signedWith(c, "GET", `/api/v1/bets/${encodeURIComponent(id)}`),
    transactions: (q: Record<string, unknown>) => signedWith(c, "GET", "/api/v1/transactions" + qs(q)),
    billing: (q: Record<string, unknown> = {}) => signedWith(c, "GET", "/api/v1/billing" + qs(q)),
    liveGamesWidget: (p: Record<string, unknown>) => signedWith(c, "POST", "/api/v1/widget/live-games/launch", p),
    ledger: (q: Record<string, unknown> = {}) => signedWith(c, "GET", "/api/v1/billing/ledger" + qs(q)),
  };
}
export const sportsbook = sbClient(); // env varsayılanı (site 1)

/** Platformdan gelen wallet/webhook isteklerinin imzası: HMAC_SHA256(wallet_secret, ts + "." + rawBody).
 * Çoklu site: verilen anahtarlardan HERHANGİ biri doğrularsa geçerli sayılır. */
export function verifyPlatformSignature(rawBody: string, ts: string | undefined, sig: string | undefined, secrets?: string[]) {
  const list = secrets?.length ? secrets : [process.env.SPORTSBOOK_WALLET_SECRET || ""];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  let b: Buffer; try { b = Buffer.from(sig, "hex"); } catch { return false; }
  for (const secret of list) {
    if (!secret) continue;
    const expected = crypto.createHmac("sha256", secret).update(ts + "." + rawBody).digest("hex");
    const a = Buffer.from(expected, "hex");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}
