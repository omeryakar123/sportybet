/**
 * Feed-agnostik spor verisi katmanı. İlk (ve meşru) kaynak: API-Football (api-sports.io).
 * Yarın başka sağlayıcıya geçilirse yalnızca bu dosya değişir; motor (sb.ts) aynı kalır.
 *
 * Ücretsiz plan: 100 istek/gün. Bu yüzden çağrılar kota-dostu: sync fonksiyonları
 * sb.ts içinde sıklık/limit ile yönetilir.
 */
const BASE = process.env.APISPORTS_URL || "https://v3.football.api-sports.io";
const KEY = () => process.env.APISPORTS_KEY || "";
export const feedConfigured = () => Boolean(KEY());

// Basit günlük istek sayacı (log amaçlı; gerçek limit sağlayıcıda)
let dayKey = "";
let dayCount = 0;
export const feedUsage = () => ({ day: dayKey, count: dayCount });

async function call<T = any>(path: string): Promise<T[]> {
  if (!feedConfigured()) throw new Error("FEED_NOT_CONFIGURED");
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  dayCount++;
  const res = await fetch(BASE + path, { headers: { "x-apisports-key": KEY() }, signal: AbortSignal.timeout(15_000) });
  const j: any = await res.json().catch(() => ({}));
  const errs = j?.errors;
  const hasErr = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
  if (!res.ok || hasErr) {
    const e: any = new Error("FEED_ERROR");
    e.detail = errs ?? `HTTP_${res.status}`;
    throw e;
  }
  return (j.response ?? []) as T[];
}

// ---- Ham tipler (API-Football) ----
export type RawFixture = {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { id: number; name: string; country: string; logo: string | null };
  teams: { home: { name: string; logo: string | null }; away: { name: string; logo: string | null } };
  goals: { home: number | null; away: number | null };
};

// Normalize edilmiş oran seti (motorun anladığı dil)
export type NormOdds = {
  "1x2"?: { HOME: number; DRAW: number; AWAY: number };
  ou25?: { OVER: number; UNDER: number };
  btts?: { YES: number; NO: number };
};

const n = (v: any) => (v == null ? null : Number(v));

export const feed = {
  status: () => call("/status").then((r) => r[0]),

  /** Bir günün maçları (verilen timezone ile) */
  fixturesByDate: (date: string, tz = "Europe/Istanbul") =>
    call<RawFixture>(`/fixtures?date=${date}&timezone=${encodeURIComponent(tz)}`),

  /** Belirli fixture id'leri (en fazla 20) — settlement/skor güncellemesi için tek çağrıda çok maç */
  fixturesByIds: (ids: number[], tz = "Europe/Istanbul") =>
    call<RawFixture>(`/fixtures?ids=${ids.slice(0, 20).join("-")}&timezone=${encodeURIComponent(tz)}`),

  /** Bir maçın oranları → normalize edilmiş set (ilk uygun bookmaker) */
  async odds(fixtureId: number): Promise<NormOdds> {
    const resp = await call(`/odds?fixture=${fixtureId}`);
    const bms = resp?.[0]?.bookmakers ?? [];
    const out: NormOdds = {};
    for (const bm of bms) {
      const bet = (name: string) => bm.bets?.find((b: any) => b.name === name)?.values ?? [];
      if (!out["1x2"]) {
        const mw = bet("Match Winner");
        const h = n(mw.find((v: any) => v.value === "Home")?.odd);
        const d = n(mw.find((v: any) => v.value === "Draw")?.odd);
        const a = n(mw.find((v: any) => v.value === "Away")?.odd);
        if (h && d && a) out["1x2"] = { HOME: h, DRAW: d, AWAY: a };
      }
      if (!out.ou25) {
        const ou = bet("Goals Over/Under");
        const o = n(ou.find((v: any) => v.value === "Over 2.5")?.odd);
        const u = n(ou.find((v: any) => v.value === "Under 2.5")?.odd);
        if (o && u) out.ou25 = { OVER: o, UNDER: u };
      }
      if (!out.btts) {
        const bt = bet("Both Teams Score");
        const y = n(bt.find((v: any) => v.value === "Yes")?.odd);
        const no = n(bt.find((v: any) => v.value === "No")?.odd);
        if (y && no) out.btts = { YES: y, NO: no };
      }
      if (out["1x2"] && out.ou25 && out.btts) break;
    }
    return out;
  },
};

// Maç durum grupları
export const FINAL_STATUS = ["FT", "AET", "PEN"];
export const VOID_STATUS = ["PST", "CANC", "ABD", "AWD", "WO", "TBD"];
export const LIVE_STATUS = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"];
