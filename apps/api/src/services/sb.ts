/**
 * Kendi sportsbook motorumuz. Feed (feed.ts) veriyi getirir, burada:
 *  - oranlara site marjı uygulanır
 *  - maçlar/oranlar DB'ye senkronlanır (kota-dostu)
 *  - kupon kabulü (cüzdan debit) + otomatik settlement (skor → kazandı/kaybetti/iade)
 *  - bonus cüzdanıyla oynanan kuponlar ilgili PlayerBonus'a bağlanır; kurallara uyuyorsa çevrime sayılır
 */
import { Prisma, PrismaClient, BetState, BetType, TxType, WalletType, PlayerBonusState } from "@prisma/client";
import { feed, feedConfigured, feedBudget, feedUsage, liveOdds, FINAL_STATUS, VOID_STATUS } from "./feed.js";
import { move } from "./wallet.js";
import { addWagering } from "./bonus.js";
import { quoteBuilder } from "./betbuilder.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export class SbError extends Error { detail?: any; constructor(m: string, detail?: any) { super(m); this.detail = detail; } }

const CFG_KEY = "sportsbook_config";
export type SbConfig = {
  enabled: boolean;
  marginPct: number;        // her orana uygulanan site marjı (%)
  leagues: { id: number; name: string }[];
  maxStake: number;         // kupon başına azami yatırım
  minStake: number;         // kupon başına asgari yatırım
  maxWin: number;           // kupon başına azami kazanç (cap)
  maxSelections: number;    // kombinede azami maç
  syncDays: number;         // kaç günü ileri senkronla
  oddsPerRun: number;       // oran senkronunda tek seferde en fazla kaç maç (kota)
  // ---- CANLI BAHİS ----
  liveEnabled: boolean;     // canlı bahis açık mı
  liveMarginPct: number;    // canlı oranlara uygulanan marj (%)
  liveIntervalSec: number;  // canlı oran çekme aralığı (sn) — kota izin verdiği ölçüde
  liveStaleSec: number;     // bu süreden eski canlı oran = kilitli
  liveDelaySec: number;     // canlı kupon onay gecikmesi (sn)
  liveMaxStake: number;     // canlı kupon başına azami yatırım
  // ---- BET BUILDER ----
  bbEnabled: boolean;       // aynı maçtan birden fazla seçim (birleşik oran)
  bbMarginPct: number;      // bet builder oranına ek marj (%)
  bbMaxLegs: number;        // bir maçta en fazla seçim
};
const DEFAULTS: SbConfig = {
  enabled: true, marginPct: 6, minStake: 10, maxStake: 50000, maxWin: 500000, maxSelections: 12, syncDays: 2, oddsPerRun: 8,
  liveEnabled: false, liveMarginPct: 8, liveIntervalSec: 15, liveStaleSec: 45, liveDelaySec: 6, liveMaxStake: 10000,
  bbEnabled: true, bbMarginPct: 5, bbMaxLegs: 6,
  leagues: [
    { id: 203, name: "Süper Lig" }, { id: 39, name: "Premier League" }, { id: 140, name: "La Liga" },
    { id: 135, name: "Serie A" }, { id: 78, name: "Bundesliga" }, { id: 61, name: "Ligue 1" },
    { id: 2, name: "Şampiyonlar Ligi" }, { id: 3, name: "Avrupa Ligi" },
  ],
};

export async function getConfig(db: PrismaClient | Prisma.TransactionClient): Promise<SbConfig> {
  const row = await (db as PrismaClient).cmsSetting.findUnique({ where: { siteId_key: { siteId: 1, key: CFG_KEY } } });
  return { ...DEFAULTS, ...((row?.value as any) ?? {}) };
}
export async function setConfig(db: PrismaClient, patch: Partial<SbConfig>) {
  const cur = await getConfig(db);
  const next = { ...cur, ...patch };
  if (next.minStake > next.maxStake) throw new SbError("MIN_STAKE_GT_MAX_STAKE");
  if (next.maxWin < next.maxStake) throw new SbError("MAX_WIN_LT_MAX_STAKE");
  if (next.liveMaxStake > next.maxStake) throw new SbError("LIVE_MAX_GT_MAX_STAKE");
  if (next.liveStaleSec < next.liveIntervalSec * 2) throw new SbError("LIVE_STALE_LT_2X_INTERVAL");
  await db.cmsSetting.upsert({ where: { siteId_key: { siteId: 1, key: CFG_KEY } }, update: { value: next as any }, create: { siteId: 1, key: CFG_KEY, value: next as any } });
  return next;
}

/** Marj: site oranı = baz oran × (1 - marj). Aşağı yuvarlanır, taban 1.01. */
export function withMargin(base: number, marginPct: number) {
  const v = Math.floor(base * (1 - marginPct / 100) * 100) / 100;
  return Math.max(1.01, v);
}

// ---------- MARKETLER ----------
type R = "WON" | "LOST" | "VOID";
type Ctx = { h: number; a: number; hh: number | null; ha: number | null };
const res3 = (x: number, y: number) => (x > y ? "H" : x < y ? "A" : "D");
const ou = (line: number) => (code: string, c: Ctx): R => ((code === "OVER") === (c.h + c.a > line) ? "WON" : "LOST");

export const MARKETS: Record<string, {
  name: string; order: number;
  sels: (ev: { home: string; away: string }) => { code: string; name: string }[];
  settle: (code: string, c: Ctx) => R;
}> = {
  "1x2": {
    name: "Maç Sonucu", order: 1,
    sels: (ev) => [{ code: "HOME", name: ev.home }, { code: "DRAW", name: "Beraberlik" }, { code: "AWAY", name: ev.away }],
    settle: (code, c) => ({ HOME: "H", DRAW: "D", AWAY: "A" } as any)[code] === res3(c.h, c.a) ? "WON" : "LOST",
  },
  dc: {
    name: "Çifte Şans", order: 2,
    sels: () => [{ code: "1X", name: "1-X" }, { code: "12", name: "1-2" }, { code: "X2", name: "X-2" }],
    settle: (code, c) => { const r = res3(c.h, c.a); const ok = code === "1X" ? r !== "A" : code === "12" ? r !== "D" : r !== "H"; return ok ? "WON" : "LOST"; },
  },
  ou25: { name: "Alt / Üst 2.5", order: 3, sels: () => [{ code: "OVER", name: "2.5 Üst" }, { code: "UNDER", name: "2.5 Alt" }], settle: ou(2.5) },
  btts: {
    name: "Karşılıklı Gol", order: 4,
    sels: () => [{ code: "YES", name: "KG Var" }, { code: "NO", name: "KG Yok" }],
    settle: (code, c) => ((code === "YES") === (c.h > 0 && c.a > 0) ? "WON" : "LOST"),
  },
  ou15: { name: "Alt / Üst 1.5", order: 5, sels: () => [{ code: "OVER", name: "1.5 Üst" }, { code: "UNDER", name: "1.5 Alt" }], settle: ou(1.5) },
  ou35: { name: "Alt / Üst 3.5", order: 6, sels: () => [{ code: "OVER", name: "3.5 Üst" }, { code: "UNDER", name: "3.5 Alt" }], settle: ou(3.5) },
  ht1x2: {
    name: "İlk Yarı Sonucu", order: 7,
    sels: (ev) => [{ code: "HOME", name: `İY ${ev.home}` }, { code: "DRAW", name: "İY Beraberlik" }, { code: "AWAY", name: `İY ${ev.away}` }],
    settle: (code, c) => (c.hh == null || c.ha == null ? "VOID" : ({ HOME: "H", DRAW: "D", AWAY: "A" } as any)[code] === res3(c.hh, c.ha) ? "WON" : "LOST"),
  },
  dnb: {
    name: "Beraberlikte İade", order: 8,
    sels: (ev) => [{ code: "HOME", name: ev.home }, { code: "AWAY", name: ev.away }],
    settle: (code, c) => (c.h === c.a ? "VOID" : (code === "HOME") === (c.h > c.a) ? "WON" : "LOST"),
  },
  oe: {
    name: "Tek / Çift", order: 9,
    sels: () => [{ code: "ODD", name: "Tek" }, { code: "EVEN", name: "Çift" }],
    settle: (code, c) => ((code === "ODD") === ((c.h + c.a) % 2 === 1) ? "WON" : "LOST"),
  },
  htft: {
    name: "İY / MS", order: 10,
    sels: () => ["HH", "HD", "HA", "DH", "DD", "DA", "AH", "AD", "AA"].map((k) => ({ code: k, name: k.replace(/H/g, "1").replace(/D/g, "X").replace(/A/g, "2").split("").join("/") })),
    settle: (code, c) => (c.hh == null || c.ha == null ? "VOID" : code === res3(c.hh, c.ha) + res3(c.h, c.a) ? "WON" : "LOST"),
  },
};
export const MARKET_LIST = Object.entries(MARKETS).sort((a, b) => a[1].order - b[1].order).map(([key, m]) => ({ key, name: m.name }));
export const SPORT_LIST = [
  { key: "football", name: "Futbol", active: true }, { key: "basketball", name: "Basketbol" }, { key: "tennis", name: "Tenis" },
  { key: "volleyball", name: "Voleybol" }, { key: "icehockey", name: "Buz Hokeyi" }, { key: "handball", name: "Hentbol" },
  { key: "esports", name: "E-Spor" }, { key: "americanfootball", name: "Amerikan Futbolu" }, { key: "baseball", name: "Beyzbol" }, { key: "mma", name: "MMA" },
];

// ---------- SENKRON ----------

/** Maç programı + skor (ucuz: gün başına 1 çağrı). */
export async function syncFixtures(db: PrismaClient) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !feedConfigured()) return { skipped: true };
  if (!feedBudget(20)) return { skipped: "QUOTA_LOW", usage: feedUsage() };
  const leagueIds = new Set(cfg.leagues.map((l) => l.id));
  let upserted = 0;
  for (let d = 0; d < Math.max(1, cfg.syncDays); d++) {
    const date = new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
    const list = await feed.fixturesByDate(date);
    for (const f of list) {
      if (!leagueIds.has(f.league.id)) continue;
      const data = {
        sport: "football", leagueId: f.league.id, league: f.league.name, country: f.league.country, leagueLogo: f.league.logo,
        home: f.teams.home.name, away: f.teams.away.name, homeLogo: f.teams.home.logo, awayLogo: f.teams.away.logo,
        startsAt: new Date(f.fixture.date), status: f.fixture.status.short, minute: f.fixture.status.elapsed,
        homeGoals: f.goals.home, awayGoals: f.goals.away,
        htHomeGoals: f.score?.halftime?.home ?? null, htAwayGoals: f.score?.halftime?.away ?? null,
      };
      await db.sbEvent.upsert({ where: { fixtureId: f.fixture.id }, update: data, create: { fixtureId: f.fixture.id, ...data } });
      upserted++;
    }
  }
  return { upserted, usage: feedUsage() };
}

/** Oranları çek (maç başına 1 çağrı, tüm marketler tek çağrıda) → marj uygula → DB. */
export async function syncOdds(db: PrismaClient, max?: number) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !feedConfigured()) return { skipped: true };
  const take = max ?? cfg.oddsPerRun;
  const soon = new Date(Date.now() + 3 * 86400_000);
  const stale = new Date(Date.now() - 6 * 3600_000);
  const events = await db.sbEvent.findMany({
    where: { status: { in: ["NS", "TBD"] }, startsAt: { gt: new Date(), lt: soon }, OR: [{ oddsUpdatedAt: null }, { oddsUpdatedAt: { lt: stale } }] },
    // önce hiç oranı olmayanlar, sonra en yakın başlayanlar
    orderBy: [{ oddsUpdatedAt: { sort: "asc", nulls: "first" } }, { startsAt: "asc" }], take,
  });
  let done = 0;
  for (const ev of events) {
    if (!feedBudget(15)) break; // sonuçlandırma için kota bırak
    try {
      const odds = await feed.odds(ev.fixtureId);
      for (const [key, def] of Object.entries(MARKETS)) {
        const set = odds[key];
        if (!set) continue;
        const market = await db.sbMarket.upsert({
          where: { eventId_key: { eventId: ev.id, key } },
          update: { name: def.name, sortOrder: def.order }, create: { eventId: ev.id, key, name: def.name, sortOrder: def.order },
        });
        for (const s of def.sels(ev)) {
          const base = set[s.code];
          if (!base) continue;
          const odd = withMargin(base, cfg.marginPct);
          await db.sbSelection.upsert({
            where: { marketId_code: { marketId: market.id, code: s.code } },
            update: { name: s.name, baseOdds: base, odds: odd },
            create: { marketId: market.id, code: s.code, name: s.name, baseOdds: base, odds: odd },
          });
        }
      }
      await db.sbEvent.update({ where: { id: ev.id }, data: { oddsUpdatedAt: new Date() } });
      done++;
    } catch { /* tek maç hatası tüm senkronu durdurmasın */ }
  }
  return { done, usage: feedUsage() };
}

/** Başlamış/biten maçları güncelle ve sonuçlandır (tek çağrıda 20 maç). */
export async function syncResults(db: PrismaClient) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !feedConfigured()) return { skipped: true };
  const pending = await db.sbEvent.findMany({ where: { settledAt: null, startsAt: { lt: new Date() } }, orderBy: { startsAt: "asc" }, take: 20 });
  if (!pending.length) return { checked: 0 };
  if (!feedBudget(0)) return { skipped: "QUOTA_EMPTY" };
  const fresh = await feed.fixturesByIds(pending.map((e) => e.fixtureId));
  let settled = 0;
  for (const f of fresh) {
    const ev = pending.find((e) => e.fixtureId === f.fixture.id);
    if (!ev) continue;
    const st = f.fixture.status.short;
    const hh = f.score?.halftime?.home ?? null, ha = f.score?.halftime?.away ?? null;
    await db.sbEvent.update({ where: { id: ev.id }, data: { status: st, minute: f.fixture.status.elapsed, homeGoals: f.goals.home, awayGoals: f.goals.away, htHomeGoals: hh, htAwayGoals: ha } });
    if (FINAL_STATUS.includes(st)) { await settleEvent(db, ev.id, f.goals.home ?? 0, f.goals.away ?? 0, false, hh, ha); settled++; }
    else if (VOID_STATUS.includes(st)) { await settleEvent(db, ev.id, 0, 0, true); settled++; }
  }
  return { checked: pending.length, settled };
}

// ---------- CANLI SENKRON ----------
const IN_PLAY_WINDOW = 3.5 * 3600_000; // başlangıçtan bu kadar süre sonrasına kadar canlı say
let liveStat = { lastRunAt: null as Date | null, lastOkAt: null as Date | null, fixtures: 0, matched: 0, error: null as string | null, skipped: null as string | null };
export const liveStatus = () => liveStat;

/** Kotaya göre çalıştırılabilecek en kısa aralık (sn). Bilinmiyorsa null. */
export function liveMinInterval() {
  const u = feedUsage();
  if (!u.limit || u.remaining == null) return null;
  const now = new Date(); const end = new Date(now); end.setUTCHours(24, 0, 0, 0);
  const secLeft = Math.max(60, (end.getTime() - now.getTime()) / 1000);
  const usable = Math.max(0, u.remaining - 30); // 30 istek program/sonuç için ayrılır
  return usable <= 0 ? Infinity : Math.ceil(secLeft / usable);
}

/** /odds/live → bizim canlı maçlarımıza oran + skor + dakika yazar. Gelmeyen/askıdaki seçimler kilitlenir. */
export async function syncLive(db: PrismaClient) {
  const cfg = await getConfig(db);
  liveStat.lastRunAt = new Date(); liveStat.skipped = null;
  if (!cfg.enabled || !cfg.liveEnabled || !feedConfigured()) { liveStat.skipped = "DISABLED"; return liveStat; }
  const ours = await db.sbEvent.findMany({ where: { settledAt: null, startsAt: { lt: new Date(), gt: new Date(Date.now() - IN_PLAY_WINDOW) } }, select: { id: true, fixtureId: true, home: true, away: true } });
  if (!ours.length) { liveStat.skipped = "NO_LIVE_EVENTS"; return liveStat; }
  if (!feedBudget(30)) { liveStat.skipped = "QUOTA_LOW"; return liveStat; }
  let list: Awaited<ReturnType<typeof liveOdds>>;
  try { list = await liveOdds(); liveStat.error = null; } catch (e: any) { liveStat.error = `${e.message} ${JSON.stringify(e.detail ?? "")}`; return liveStat; }
  const byFx = new Map(list.map((f) => [f.fixtureId, f]));
  let matched = 0;
  for (const ev of ours) {
    const f = byFx.get(ev.fixtureId);
    if (!f) continue;
    matched++;
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.sbEvent.update({ where: { id: ev.id }, data: { status: f.finished ? "FT" : f.status, minute: f.minute, homeGoals: f.h, awayGoals: f.a, liveStopped: f.stopped || f.finished, liveUpdatedAt: now } });
      // önce bu maçın tüm seçimlerini kilitle; feed'de gelen ve askıda olmayanları aç
      await tx.sbSelection.updateMany({ where: { market: { eventId: ev.id } }, data: { suspended: true } });
      for (const [key, set] of Object.entries(f.markets)) {
        const def = MARKETS[key]; if (!def) continue;
        const market = await tx.sbMarket.upsert({ where: { eventId_key: { eventId: ev.id, key } }, update: {}, create: { eventId: ev.id, key, name: def.name, sortOrder: def.order } });
        for (const sDef of def.sels(ev)) {
          const v = set[sDef.code]; if (!v) continue;
          const odd = v.odd > 1 ? withMargin(v.odd, cfg.liveMarginPct) : 1.01;
          await tx.sbSelection.upsert({
            where: { marketId_code: { marketId: market.id, code: sDef.code } },
            update: { baseOdds: v.odd > 1 ? v.odd : 1, odds: odd, suspended: v.suspended },
            create: { marketId: market.id, code: sDef.code, name: sDef.name, baseOdds: v.odd > 1 ? v.odd : 1, odds: odd, suspended: v.suspended },
          });
        }
      }
    });
  }
  liveStat = { ...liveStat, lastOkAt: new Date(), fixtures: list.length, matched };
  return liveStat;
}

/** Canlı bahsin şu an bu maç için açık olup olmadığı */
export function liveOpen(cfg: SbConfig, ev: { liveUpdatedAt: Date | null; liveStopped: boolean; status: string }) {
  if (!cfg.liveEnabled || ev.liveStopped || !ev.liveUpdatedAt) return false;
  if (FINAL_STATUS.includes(ev.status) || VOID_STATUS.includes(ev.status)) return false;
  return Date.now() - new Date(ev.liveUpdatedAt).getTime() <= cfg.liveStaleSec * 1000;
}

/** Maçı sonuçlandır: seçim sonuçlarını yaz, etkilenen kuponları öde. void=iade. */
export async function settleEvent(db: PrismaClient, eventId: number, h: number, a: number, isVoid: boolean, hh: number | null = null, ha: number | null = null) {
  const markets = await db.sbMarket.findMany({ where: { eventId }, include: { selections: true } });
  const selIds: number[] = [];
  const ctx: Ctx = { h, a, hh, ha };
  await db.$transaction(async (tx) => {
    for (const m of markets) for (const s of m.selections) {
      const def = MARKETS[m.key];
      const res: R = isVoid || !def ? "VOID" : def.settle(s.code, ctx);
      await tx.sbSelection.update({ where: { id: s.id }, data: { result: res } });
      selIds.push(s.id);
    }
    await tx.sbEvent.update({
      where: { id: eventId },
      data: { settledAt: new Date(), isOpen: false, ...(isVoid ? {} : { homeGoals: h, awayGoals: a, ...(hh != null ? { htHomeGoals: hh, htAwayGoals: ha } : {}) }) },
    });
  });
  await settleBetsForSelections(db, selIds);
}

/** Verilen seçimlere dokunan, tüm seçimleri sonuçlanmış kuponları öde. */
async function settleBetsForSelections(db: PrismaClient, sbSelectionIds: number[]) {
  if (!sbSelectionIds.length) return;
  const rows = await db.betSelection.findMany({ where: { sbSelectionId: { in: sbSelectionIds } }, select: { betId: true } });
  const betIds = [...new Set(rows.map((r) => r.betId))];
  const cfg = await getConfig(db);
  for (const betId of betIds) {
    await db.$transaction(async (tx) => {
      const bet = await tx.bet.findUnique({ where: { id: betId }, include: { selections: true } });
      if (!bet || (bet.state !== BetState.ACTIVE && bet.state !== BetState.PENDING)) return;
      const ids = bet.selections.map((s) => s.sbSelectionId).filter((x): x is number => x != null);
      const sels = await tx.sbSelection.findMany({ where: { id: { in: ids } } });
      const byId = new Map(sels.map((s) => [s.id, s]));
      let anyPending = false, anyLost = false, effOdds = 1;
      const groups = new Map<string, { odds: number; res: string[] }>();
      for (const bs of bet.selections) {
        const res = bs.sbSelectionId ? byId.get(bs.sbSelectionId)?.result : null;
        if (!res) { anyPending = true; break; }
        if (res === "LOST") anyLost = true;
        if (bs.bbGroup) { const g = groups.get(bs.bbGroup) ?? { odds: Number(bs.bbOdds ?? 1), res: [] }; g.res.push(res); groups.set(bs.bbGroup, g); continue; }
        if (res === "WON") effOdds *= Number(bs.odds); // VOID → 1.0
      }
      // Bet Builder grubu: hepsi kazandıysa birleşik oran; iade olan seçim varsa grup iade (1.0)
      for (const g of groups.values()) if (g.res.every((r) => r === "WON")) effOdds *= g.odds;
      if (anyPending) return;

      // Ödeme cüzdanı: bonusla oynandıysa → bonus hâlâ aktifse BONUS, tamamlandıysa MAIN
      const fromBonus = Number(bet.stakeFromBonus) > 0;
      let wallet: WalletType = WalletType.MAIN;
      const pb = bet.playerBonusId ? await tx.playerBonus.findUnique({ where: { id: bet.playerBonusId } }) : null;
      if (fromBonus) wallet = pb && pb.state === PlayerBonusState.COMPLETED ? WalletType.MAIN : WalletType.BONUS;

      let finalState: BetState;
      if (anyLost) {
        finalState = BetState.LOST;
        await tx.bet.update({ where: { id: betId }, data: { state: BetState.LOST, winAmount: 0, settledAt: new Date() } });
      } else {
        const allVoid = effOdds === 1;
        const payout = Math.min(Number(bet.stake) * effOdds, cfg.maxWin);
        finalState = allVoid ? BetState.RETURNED : BetState.WON;
        await move(tx, { playerId: bet.playerId, wallet, type: allVoid ? TxType.BET_REFUND : TxType.BET_WIN, amount: payout, reference: `bet:${betId}`, note: allVoid ? "Kupon iade" : "Kupon kazancı" });
        await tx.bet.update({ where: { id: betId }, data: { state: finalState, winAmount: payout, settledAt: new Date() } });
      }
      for (const bs of bet.selections) {
        const r = bs.sbSelectionId ? byId.get(bs.sbSelectionId)?.result : null;
        const map: any = { WON: BetState.WON, LOST: BetState.LOST, VOID: BetState.RETURNED };
        if (r) await tx.betSelection.update({ where: { id: bs.id }, data: { state: map[r] } });
      }
      // Çevrim: bonus kurallarına uyan, sonuçlanmış (iade hariç) bonus kuponu
      if (bet.playerBonusId && bet.bonusEligible && finalState !== BetState.RETURNED && pb?.state === PlayerBonusState.ACTIVE) {
        await addWagering(tx, bet.playerBonusId, bet.stake);
      }
    });
  }
}

// ---------- BONUS KURAL EŞLEŞMESİ ----------
const asList = (v: any): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
/** Bonus kurallarını kupona uygula. Boş liste = hepsi geçerli. */
export function matchBonusRules(rules: any, betType: BetType, sels: { marketKey: string; leagueId: number; league: string; sport: string; odds: number }[]) {
  const r = rules ?? {};
  const why: string[] = [];
  const sports = asList(r.sports), leagues = asList(r.leagues ?? r.competitions), markets = asList(r.markets), exLeagues = asList(r.excludeLeagues);
  if (r.betType === "SINGLE" && betType !== BetType.SINGLE) why.push("Sadece tekli kupon geçerli");
  if (r.betType === "MULTIPLE" && betType !== BetType.MULTIPLE) why.push("Sadece kombine kupon geçerli");
  if (r.minSelections && sels.length < Number(r.minSelections)) why.push(`En az ${r.minSelections} seçim`);
  const total = sels.reduce((a, s) => a * s.odds, 1);
  if (r.minTotalOdds && total < Number(r.minTotalOdds)) why.push(`Toplam oran en az ${r.minTotalOdds}`);
  for (const s of sels) {
    if (r.minSelectionOdds && s.odds < Number(r.minSelectionOdds)) { why.push(`Her seçim oranı en az ${r.minSelectionOdds}`); break; }
  }
  for (const s of sels) {
    const lg = [String(s.leagueId), s.league];
    if (sports.length && !sports.includes(s.sport)) { why.push("Spor kural dışı"); break; }
    if (leagues.length && !lg.some((x) => leagues.includes(x))) { why.push("Lig kural dışı"); break; }
    if (exLeagues.length && lg.some((x) => exLeagues.includes(x))) { why.push("Hariç tutulan lig"); break; }
    if (markets.length && !markets.includes(s.marketKey)) { why.push("Market kural dışı"); break; }
  }
  return { ok: why.length === 0, why };
}

// ---------- KUPON ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function placeBet(db: PrismaClient, playerId: number, body: { selectionIds: number[]; stake: number; mode?: "combo" | "single"; wallet?: WalletType; odds?: Record<string, number>; bbOdds?: Record<string, number>; acceptOdds?: "none" | "higher" | "any" }) {
  const cfg = await getConfig(db);
  if (!cfg.enabled) throw new SbError("SPORTSBOOK_DISABLED");
  const stake = Math.round(Number(body.stake) * 100) / 100;
  if (!(stake > 0)) throw new SbError("INVALID_STAKE");
  if (stake < (cfg.minStake ?? 0)) throw new SbError("MIN_STAKE");
  if (stake > cfg.maxStake) throw new SbError("MAX_STAKE_EXCEEDED");
  const ids = [...new Set(body.selectionIds ?? [])];
  if (!ids.length) throw new SbError("NO_SELECTION");
  if (ids.length > cfg.maxSelections) throw new SbError("TOO_MANY_SELECTIONS");

  const loadSels = () => db.sbSelection.findMany({ where: { id: { in: ids } }, include: { market: { include: { event: true } } } });
  let sels = await loadSels();
  if (sels.length !== ids.length) throw new SbError("SELECTION_UNAVAILABLE");
  const isLiveSel = (s: (typeof sels)[number]) => new Date(s.market.event.startsAt).getTime() <= Date.now() || (s.market.event.status !== "NS" && s.market.event.status !== "TBD");
  const check = (list: typeof sels) => {
    for (const s of list) {
      const ev = s.market.event;
      if (!s.market.isOpen || !ev.isOpen || ev.settledAt) throw new SbError("SELECTION_CLOSED");
      if (isLiveSel(s)) {
        if (!cfg.liveEnabled) throw new SbError("EVENT_STARTED");
        if (!liveOpen(cfg, ev)) throw new SbError("LIVE_SUSPENDED");
        if (s.suspended) throw new SbError("SELECTION_SUSPENDED", { selectionId: s.id });
      }
    }
  };
  check(sels);
  const hasLive = sels.some(isLiveSel);
  if (hasLive && stake > cfg.liveMaxStake) throw new SbError("LIVE_MAX_STAKE_EXCEEDED", { max: cfg.liveMaxStake });
  const mode = body.mode ?? "combo";
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.status !== "OPEN" || player.isSportBlocked) throw new SbError("SPORT_BLOCKED");

  // Oran kontrolü: oyuncunun gördüğü oran ≠ güncel oran → politika
  const accept = body.acceptOdds ?? "higher";
  const verifyOdds = (list: typeof sels) => {
    if (!body.odds) return;
    const changed = list.filter((s) => {
      const seen = Number(body.odds![String(s.id)]); const cur = Number(s.odds);
      if (!seen || Math.abs(seen - cur) < 0.005) return false;
      return accept === "any" ? false : accept === "higher" ? cur < seen : true;
    });
    if (changed.length) throw new SbError("ODDS_CHANGED", { odds: Object.fromEntries(list.map((s) => [s.id, Number(s.odds)])), changed: changed.map((s) => s.id) });
  };
  verifyOdds(sels);
  // Canlı: gecikme sonrası tekrar doğrula (gol/kırmızı kart anında kupon kaçırmayı engeller)
  if (hasLive && cfg.liveDelaySec > 0) {
    const snap = new Map(sels.map((s) => [s.id, Number(s.odds)]));
    await sleep(cfg.liveDelaySec * 1000);
    sels = await loadSels();
    check(sels);
    const dropped = sels.filter((s) => Number(s.odds) < (snap.get(s.id) ?? 0) - 0.005 && accept !== "any");
    if (dropped.length) throw new SbError("ODDS_CHANGED", { odds: Object.fromEntries(sels.map((s) => [s.id, Number(s.odds)])), changed: dropped.map((s) => s.id) });
    verifyOdds(sels);
  }
  const wallet = body.wallet ?? (player.activeWallet === "BONUS" ? WalletType.BONUS : WalletType.MAIN);
  // Bonus cüzdanıyla oynanıyorsa aktif bonusu bağla
  const pb = wallet === WalletType.BONUS
    ? await db.playerBonus.findFirst({ where: { playerId, state: PlayerBonusState.ACTIVE }, include: { bonus: true } })
    : null;

  // ---- Bet Builder: aynı maçtaki birden fazla seçim → tek ayak (birleşik oran) ----
  const bbOf = new Map<number, { key: string; odds: number }>(); // selectionId → grup
  const byEvent = new Map<number, typeof sels>();
  for (const s of sels) { const k = s.market.eventId; if (!byEvent.has(k)) byEvent.set(k, []); byEvent.get(k)!.push(s); }
  for (const [eventId, g] of byEvent) {
    if (g.length < 2) continue;
    if (!cfg.bbEnabled) throw new SbError("SAME_EVENT_IN_COMBO");
    if (g.some(isLiveSel)) throw new SbError("BB_LIVE_NOT_SUPPORTED");
    const q = await builderQuote(db, cfg, eventId, g.map((s) => ({ marketKey: s.market.key, code: s.code, odds: Number(s.odds) })));
    if (!q.ok) throw new SbError(q.error, q.detail);
    const key = `bb-${eventId}`;
    for (const s of g) bbOf.set(s.id, { key, odds: q.odds });
  }
  // oyuncunun gördüğü bet builder oranı düştüyse onay iste
  if (body.bbOdds) for (const [eventId, seen] of Object.entries(body.bbOdds)) {
    const g = [...bbOf.values()].find((x) => x.key === `bb-${eventId}`);
    if (g && Number(seen) - g.odds > 0.005 && accept !== "any") throw new SbError("ODDS_CHANGED", { odds: Object.fromEntries(sels.map((s) => [s.id, Number(s.odds)])), bbOdds: { [eventId]: g.odds }, changed: [] });
  }
  /** kupon toplam oranı: bet builder grupları tek ayak sayılır */
  const groupOdds = (group: typeof sels) => {
    const seen = new Set<string>(); let t = 1;
    for (const s of group) { const b = bbOf.get(s.id); if (b) { if (!seen.has(b.key)) { seen.add(b.key); t *= b.odds; } } else t *= Number(s.odds); }
    return t;
  };

  const plan = (group: typeof sels, type: BetType) => {
    const totalOdds = groupOdds(group);
    const check = pb ? matchBonusRules(pb.bonus.rules, type, group.map((s) => ({ marketKey: s.market.key, leagueId: s.market.event.leagueId, league: s.market.event.league, sport: s.market.event.sport, odds: Number(s.odds) }))) : null;
    return { group, type, totalOdds, potential: Math.min(stake * totalOdds, cfg.maxWin), eligible: check ? check.ok : null, why: check?.why ?? [] };
  };

  if (mode === "combo") {
    const p = plan(sels, sels.length > 1 ? BetType.MULTIPLE : BetType.SINGLE);
    const bet = await createBet(db, player.id, wallet, p.group, stake, p.totalOdds, p.potential, p.type, pb?.id ?? null, p.eligible, bbOf);
    return { ...bet, bonus: pb ? { playerBonusId: pb.id, name: pb.bonus.name, eligible: p.eligible, why: p.why } : null };
  }
  // tekli: her maç ayrı kupon (bet builder grubu tek kupon olur)
  const out = [];
  for (const [, g] of byEvent) {
    const groups = g.length > 1 ? [g] : g.map((s) => [s]);
    for (const grp of groups) {
      const p = plan(grp, grp.length > 1 ? BetType.MULTIPLE : BetType.SINGLE);
      out.push(await createBet(db, player.id, wallet, p.group, stake, p.totalOdds, p.potential, p.type, pb?.id ?? null, p.eligible, bbOf));
    }
  }
  return { bets: out };
}

async function createBet(db: PrismaClient, playerId: number, wallet: WalletType, sels: any[], stake: number, totalOdds: number, potential: number, type: BetType, playerBonusId: number | null, bonusEligible: boolean | null, bbOf?: Map<number, { key: string; odds: number }>) {
  return db.$transaction(async (tx) => {
    const bet = await tx.bet.create({
      data: {
        playerId, type, stake, totalOdds: D(totalOdds.toFixed(3)), potentialWin: D(potential.toFixed(2)),
        stakeFromMain: wallet === WalletType.MAIN ? stake : 0, stakeFromBonus: wallet === WalletType.BONUS ? stake : 0,
        state: BetState.ACTIVE, source: "Web", playerBonusId, bonusEligible,
        isLive: sels.some((s: any) => new Date(s.market.event.startsAt).getTime() <= Date.now()),
        selections: {
          create: sels.map((s) => ({
            providerEventId: String(s.market.event.fixtureId), sport: s.market.event.sport, region: s.market.event.country, competition: s.market.event.league,
            matchName: `${s.market.event.home} - ${s.market.event.away}`, matchStart: s.market.event.startsAt,
            market: s.market.name, selection: s.name, odds: s.odds, state: BetState.ACTIVE, sbSelectionId: s.id,
            ...(bbOf?.get(s.id) ? { bbGroup: bbOf.get(s.id)!.key, bbOdds: D(bbOf.get(s.id)!.odds.toFixed(3)) } : {}),
            isLive: new Date(s.market.event.startsAt).getTime() <= Date.now(),
            info: new Date(s.market.event.startsAt).getTime() <= Date.now() ? `Canlı ${s.market.event.minute ?? ""}' ${s.market.event.homeGoals ?? 0}-${s.market.event.awayGoals ?? 0}` : null,
          })),
        },
      },
    });
    const couponId = `SB${String(bet.id).padStart(7, "0")}`;
    await tx.bet.update({ where: { id: bet.id }, data: { couponId } });
    try {
      await move(tx, { playerId, wallet, type: TxType.BET_STAKE, amount: -stake, reference: `bet:${bet.id}`, note: `Kupon ${couponId}` });
    } catch (e: any) {
      if (e.message === "INSUFFICIENT_FUNDS") throw new SbError("INSUFFICIENT_BALANCE");
      throw e;
    }
    return { id: bet.id.toString(), couponId, totalOdds, potentialWin: potential, state: bet.state, type };
  });
}

// ---------- SİTE İÇİN SERİLEŞTİRME ----------
const mInclude = { markets: { where: { isOpen: true }, include: { selections: true }, orderBy: { sortOrder: "asc" as const } } };
export async function listEvents(db: PrismaClient, opts: { leagueId?: number; limit?: number; q?: string } = {}) {
  const events = await db.sbEvent.findMany({
    where: {
      isOpen: true, settledAt: null, startsAt: { gt: new Date() }, ...(opts.leagueId ? { leagueId: opts.leagueId } : {}),
      ...(opts.q ? { OR: [{ home: { contains: opts.q, mode: "insensitive" } }, { away: { contains: opts.q, mode: "insensitive" } }, { league: { contains: opts.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ featured: "desc" }, { startsAt: "asc" }], take: opts.limit ?? 120, include: mInclude,
  });
  return events.map((e) => serializeEvent(e));
}
/** Başlamış ama bitmemiş maçlar (canlı skor gösterimi — canlı bahis faz 2) */
export async function listLive(db: PrismaClient) {
  const cfg = await getConfig(db);
  const events = await db.sbEvent.findMany({
    where: { settledAt: null, isOpen: true, startsAt: { lt: new Date(), gt: new Date(Date.now() - IN_PLAY_WINDOW) }, status: { notIn: [...FINAL_STATUS, ...VOID_STATUS] } },
    orderBy: { startsAt: "asc" }, take: 60, include: mInclude,
  });
  return events.map((ev) => serializeEvent(ev, { live: true, open: liveOpen(cfg, ev) }));
}
export async function listLeagues(db: PrismaClient) {
  const rows = await db.sbEvent.groupBy({ by: ["leagueId", "league", "country", "leagueLogo"], where: { isOpen: true, settledAt: null, startsAt: { gt: new Date() } }, _count: true });
  return rows.map((r) => ({ id: r.leagueId, name: r.league, country: r.country, logo: r.leagueLogo, count: r._count })).sort((a, b) => b.count - a.count);
}
export function serializeEvent(ev: any, live?: { live: boolean; open: boolean }) {
  return {
    live: live?.live ?? false, liveOpen: live?.open ?? false, liveStopped: ev.liveStopped ?? false, liveUpdatedAt: ev.liveUpdatedAt ?? null,
    id: ev.id, fixtureId: ev.fixtureId, league: ev.league, leagueId: ev.leagueId, country: ev.country, leagueLogo: ev.leagueLogo,
    home: ev.home, away: ev.away, homeLogo: ev.homeLogo, awayLogo: ev.awayLogo, startsAt: ev.startsAt, status: ev.status, minute: ev.minute,
    score: ev.homeGoals == null ? null : { h: ev.homeGoals, a: ev.awayGoals, hh: ev.htHomeGoals, ha: ev.htAwayGoals }, featured: ev.featured,
    markets: (ev.markets ?? []).map((m: any) => ({
      id: m.id, key: m.key, name: m.name,
      selections: [...m.selections].sort((a: any, b: any) => a.id - b.id).map((s: any) => ({ id: s.id, code: s.code, name: s.name, odds: Number(s.odds), suspended: live?.live ? (!live.open || !!s.suspended) : false })),
    })),
  };
}

// ---------- BET BUILDER FİYATI ----------
/** Maçın açık marketlerinden bet builder oranı */
export async function builderQuote(db: PrismaClient, cfg: SbConfig, eventId: number, legs: { marketKey: string; code: string; odds: number }[]) {
  const markets = await db.sbMarket.findMany({ where: { eventId, isOpen: true }, include: { selections: true } });
  const mk: Record<string, Record<string, number>> = {};
  for (const m of markets) mk[m.key] = Object.fromEntries(m.selections.map((x) => [x.code, Number(x.odds)]));
  return quoteBuilder(legs, mk, { marginPct: cfg.bbMarginPct ?? 5, maxLegs: cfg.bbMaxLegs ?? 6 });
}
