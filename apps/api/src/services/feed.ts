/**
 * Feed-agnostik spor verisi katmanı. İlk (ve meşru) kaynak: API-Football (api-sports.io).
 * Yarın başka sağlayıcıya geçilirse yalnızca bu dosya değişir; motor (sb.ts) aynı kalır.
 *
 * Kota: ücretsiz plan 100 istek/gün. Sağlayıcının döndürdüğü `x-ratelimit-requests-remaining`
 * başlığı takip edilir; sync fonksiyonları `feedBudget()` ile kalan krediye göre kendini kısar.
 */
const BASE = process.env.APISPORTS_URL || "https://v3.football.api-sports.io";
const KEY = () => process.env.APISPORTS_KEY || "";
export const feedConfigured = () => Boolean(KEY());

let dayKey = "";
let dayCount = 0;
let remaining: number | null = null; // sağlayıcının bildirdiği günlük kalan istek
let limit: number | null = null;
export const feedUsage = () => ({ day: dayKey, count: dayCount, remaining, limit });
/** Kalan kredi `reserve`'den fazlaysa true. Bilinmiyorsa (ilk çağrı) true. */
export const feedBudget = (reserve: number) => remaining === null || remaining > reserve;

async function call<T = any>(path: string): Promise<T[]> {
  if (!feedConfigured()) throw new Error("FEED_NOT_CONFIGURED");
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  dayCount++;
  const res = await fetch(BASE + path, { headers: { "x-apisports-key": KEY() }, signal: AbortSignal.timeout(15_000) });
  const rem = Number(res.headers.get("x-ratelimit-requests-remaining"));
  const lim = Number(res.headers.get("x-ratelimit-requests-limit"));
  if (Number.isFinite(rem) && res.headers.has("x-ratelimit-requests-remaining")) remaining = rem;
  if (Number.isFinite(lim) && res.headers.has("x-ratelimit-requests-limit")) limit = lim;
  const j: any = await res.json().catch(() => ({}));
  const errs = j?.errors;
  const hasErr = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
  if (!res.ok || hasErr) {
    const e: any = new Error("FEED_ERROR");
    e.detail = errs ?? `HTTP_${res.status}`;
    if (JSON.stringify(errs ?? "").toLowerCase().includes("limit")) remaining = 0;
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
  score?: { halftime?: { home: number | null; away: number | null } };
};

/**
 * Market tanımları: feed'deki bahis adı + değer → bizim market anahtarı / seçim kodu.
 * Bir market yalnızca tüm seçimleri aynı bookmaker'da varsa alınır (eksik set açılmaz).
 */
export const FEED_MARKETS: { key: string; bet: string; map: Record<string, string> }[] = [
  { key: "1x2", bet: "Match Winner", map: { Home: "HOME", Draw: "DRAW", Away: "AWAY" } },
  { key: "dc", bet: "Double Chance", map: { "Home/Draw": "1X", "Home/Away": "12", "Draw/Away": "X2" } },
  { key: "ou15", bet: "Goals Over/Under", map: { "Over 1.5": "OVER", "Under 1.5": "UNDER" } },
  { key: "ou25", bet: "Goals Over/Under", map: { "Over 2.5": "OVER", "Under 2.5": "UNDER" } },
  { key: "ou35", bet: "Goals Over/Under", map: { "Over 3.5": "OVER", "Under 3.5": "UNDER" } },
  { key: "btts", bet: "Both Teams Score", map: { Yes: "YES", No: "NO" } },
  { key: "ht1x2", bet: "First Half Winner", map: { Home: "HOME", Draw: "DRAW", Away: "AWAY" } },
  { key: "dnb", bet: "Home/Away", map: { Home: "HOME", Away: "AWAY" } },
  { key: "oe", bet: "Odd/Even", map: { Odd: "ODD", Even: "EVEN" } },
  {
    key: "htft", bet: "HT/FT Double",
    map: { "Home/Home": "HH", "Home/Draw": "HD", "Home/Away": "HA", "Draw/Home": "DH", "Draw/Draw": "DD", "Draw/Away": "DA", "Away/Home": "AH", "Away/Draw": "AD", "Away/Away": "AA" },
  },
];

/** market anahtarı → { seçim kodu → oran } */
export type NormOdds = Record<string, Record<string, number>>;

export const feed = {
  status: () => call("/status").then((r: any) => (Array.isArray(r) ? r[0] : r)),

  /** Bir günün maçları (verilen timezone ile) */
  fixturesByDate: (date: string, tz = "Europe/Istanbul") =>
    call<RawFixture>(`/fixtures?date=${date}&timezone=${encodeURIComponent(tz)}`),

  /** Belirli fixture id'leri (en fazla 20) — settlement/skor güncellemesi için tek çağrıda çok maç */
  fixturesByIds: (ids: number[], tz = "Europe/Istanbul") =>
    call<RawFixture>(`/fixtures?ids=${ids.slice(0, 20).join("-")}&timezone=${encodeURIComponent(tz)}`),

  /** Bir maçın tüm oranları → normalize (tek çağrıda bütün marketler gelir, ekstra kota yok) */
  async odds(fixtureId: number): Promise<NormOdds> {
    const resp: any[] = await call(`/odds?fixture=${fixtureId}`);
    const bms: any[] = resp?.[0]?.bookmakers ?? [];
    const out: NormOdds = {};
    for (const def of FEED_MARKETS) {
      for (const bm of bms) {
        const vals: any[] = bm.bets?.find((b: any) => b.name === def.bet)?.values ?? [];
        const set: Record<string, number> = {};
        for (const [feedVal, code] of Object.entries(def.map)) {
          const o = Number(vals.find((v: any) => String(v.value) === feedVal)?.odd);
          if (o > 1) set[code] = o;
        }
        if (Object.keys(set).length === Object.keys(def.map).length) { out[def.key] = set; break; }
      }
    }
    return out;
  },
};

// Maç durum grupları
export const FINAL_STATUS = ["FT", "AET", "PEN"];
export const VOID_STATUS = ["PST", "CANC", "ABD", "AWD", "WO"];
export const LIVE_STATUS = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"];
