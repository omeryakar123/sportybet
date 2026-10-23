/**
 * Kendi sportsbook motorumuz. Feed (feed.ts) veriyi getirir, burada:
 *  - oranlara site marjı uygulanır
 *  - maçlar/oranlar DB'ye senkronlanır (kota-dostu)
 *  - kupon kabulü (cüzdan debit) + otomatik settlement (skor → kazandı/kaybetti)
 * Mevcut Bet / BetSelection / wallet.move altyapısını kullanır.
 */
import { Prisma, PrismaClient, BetState, BetType, TxType, WalletType } from "@prisma/client";
import { feed, feedConfigured, FINAL_STATUS, VOID_STATUS } from "./feed.js";
import { move } from "./wallet.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export class SbError extends Error {}

const CFG_KEY = "sportsbook_config";
export type SbConfig = {
  enabled: boolean;
  marginPct: number;        // her orana uygulanan site marjı (%)
  leagues: { id: number; name: string }[];
  maxStake: number;         // kupon başına azami yatırım
  maxWin: number;           // kupon başına azami kazanç (cap)
  maxSelections: number;    // kombinede azami maç
  syncDays: number;         // kaç günü ileri senkronla
};
const DEFAULTS: SbConfig = {
  enabled: true, marginPct: 6, maxStake: 50000, maxWin: 500000, maxSelections: 12, syncDays: 2,
  leagues: [
    { id: 203, name: "Süper Lig" }, { id: 39, name: "Premier League" }, { id: 140, name: "La Liga" },
    { id: 135, name: "Serie A" }, { id: 78, name: "Bundesliga" }, { id: 61, name: "Ligue 1" },
    { id: 2, name: "Şampiyonlar Ligi" }, { id: 3, name: "Avrupa Ligi" },
  ],
};

export async function getConfig(db: PrismaClient): Promise<SbConfig> {
  const row = await db.cmsSetting.findUnique({ where: { siteId_key: { siteId: 1, key: CFG_KEY } } });
  return { ...DEFAULTS, ...((row?.value as any) ?? {}) };
}
export async function setConfig(db: PrismaClient, patch: Partial<SbConfig>) {
  const cur = await getConfig(db);
  const next = { ...cur, ...patch };
  await db.cmsSetting.upsert({ where: { siteId_key: { siteId: 1, key: CFG_KEY } }, update: { value: next as any }, create: { siteId: 1, key: CFG_KEY, value: next as any } });
  return next;
}

/** Marj: site oranı = baz oran × (1 - marj). Aşağı yuvarlanır, taban 1.01. */
export function withMargin(base: number, marginPct: number) {
  const v = Math.floor(base * (1 - marginPct / 100) * 100) / 100;
  return Math.max(1.01, v);
}

// Market tanımları: feed anahtarı → görünür ad + seçimler
const MARKETS: Record<string, { name: string; sels: (ev: { home: string; away: string }) => { code: string; name: string }[] }> = {
  "1x2": { name: "Maç Sonucu", sels: (ev) => [{ code: "HOME", name: ev.home }, { code: "DRAW", name: "Beraberlik" }, { code: "AWAY", name: ev.away }] },
  ou25: { name: "Alt / Üst 2.5", sels: () => [{ code: "OVER", name: "2.5 Üst" }, { code: "UNDER", name: "2.5 Alt" }] },
  btts: { name: "Karşılıklı Gol", sels: () => [{ code: "YES", name: "Var" }, { code: "NO", name: "Yok" }] },
};

// ---------- SENKRON ----------

/** Maç programı + skor (ucuz: gün başına 1 çağrı). */
export async function syncFixtures(db: PrismaClient) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !feedConfigured()) return { skipped: true };
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
      };
      await db.sbEvent.upsert({ where: { fixtureId: f.fixture.id }, update: data, create: { fixtureId: f.fixture.id, ...data } });
      upserted++;
    }
  }
  return { upserted, usage: (await import("./feed.js")).feedUsage() };
}

/** Oranları çek (pahalı: maç başına 1 çağrı) → marj uygula → DB. Çağrı sayısı `max` ile sınırlı. */
export async function syncOdds(db: PrismaClient, max = 15) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !feedConfigured()) return { skipped: true };
  const soon = new Date(Date.now() + 3 * 86400_000);
  const stale = new Date(Date.now() - 6 * 3600_000);
  const events = await db.sbEvent.findMany({
    where: {
      status: { in: ["NS", "TBD"] }, startsAt: { gt: new Date(), lt: soon },
      OR: [{ oddsUpdatedAt: null }, { oddsUpdatedAt: { lt: stale } }],
    },
    orderBy: { startsAt: "asc" }, take: max,
  });
  let done = 0;
  for (const ev of events) {
    try {
      const odds = await feed.odds(ev.fixtureId);
      for (const key of Object.keys(MARKETS)) {
        const set = (odds as any)[key];
        if (!set) continue;
        const def = MARKETS[key];
        const market = await db.sbMarket.upsert({
          where: { eventId_key: { eventId: ev.id, key } },
          update: { name: def.name }, create: { eventId: ev.id, key, name: def.name },
        });
        for (const s of def.sels(ev)) {
          const base = set[s.code];
          if (!base) continue;
          await db.sbSelection.upsert({
            where: { marketId_code: { marketId: market.id, code: s.code } },
            update: { name: s.name, baseOdds: base, odds: withMargin(base, cfg.marginPct) },
            create: { marketId: market.id, code: s.code, name: s.name, baseOdds: base, odds: withMargin(base, cfg.marginPct) },
          });
        }
      }
      await db.sbEvent.update({ where: { id: ev.id }, data: { oddsUpdatedAt: new Date() } });
      done++;
    } catch { /* tek maç hatası tüm senkronu durdurmasın */ }
  }
  return { done };
}

/** Başlamış/biten maçları güncelle ve sonuçlandır (tek çağrıda 20 maç). */
export async function syncResults(db: PrismaClient) {
  const cfg = await getConfig(db);
  if (!cfg.enabled || !feedConfigured()) return { skipped: true };
  const pending = await db.sbEvent.findMany({
    where: { settledAt: null, startsAt: { lt: new Date() } },
    orderBy: { startsAt: "asc" }, take: 20,
  });
  if (!pending.length) return { checked: 0 };
  const fresh = await feed.fixturesByIds(pending.map((e) => e.fixtureId));
  let settled = 0;
  for (const f of fresh) {
    const ev = pending.find((e) => e.fixtureId === f.fixture.id);
    if (!ev) continue;
    const st = f.fixture.status.short;
    await db.sbEvent.update({ where: { id: ev.id }, data: { status: st, minute: f.fixture.status.elapsed, homeGoals: f.goals.home, awayGoals: f.goals.away } });
    if (FINAL_STATUS.includes(st)) { await settleEvent(db, ev.id, f.goals.home ?? 0, f.goals.away ?? 0, false); settled++; }
    else if (VOID_STATUS.includes(st)) { await settleEvent(db, ev.id, 0, 0, true); settled++; }
  }
  return { checked: pending.length, settled };
}

// Bir seçimin sonucu (skordan)
function selResult(key: string, code: string, h: number, a: number): "WON" | "LOST" {
  if (key === "1x2") { const r = h > a ? "HOME" : h < a ? "AWAY" : "DRAW"; return code === r ? "WON" : "LOST"; }
  if (key === "ou25") { const over = h + a > 2.5; return (code === "OVER") === over ? "WON" : "LOST"; }
  if (key === "btts") { const yes = h > 0 && a > 0; return (code === "YES") === yes ? "WON" : "LOST"; }
  return "LOST";
}

/** Maçı sonuçlandır: seçim sonuçlarını yaz, etkilenen kuponları öde. void=iade. */
export async function settleEvent(db: PrismaClient, eventId: number, h: number, a: number, isVoid: boolean) {
  const markets = await db.sbMarket.findMany({ where: { eventId }, include: { selections: true } });
  const selIds: number[] = [];
  await db.$transaction(async (tx) => {
    for (const m of markets) for (const s of m.selections) {
      const res = isVoid ? "VOID" : selResult(m.key, s.code, h, a);
      await tx.sbSelection.update({ where: { id: s.id }, data: { result: res } });
      selIds.push(s.id);
    }
    await tx.sbEvent.update({ where: { id: eventId }, data: { settledAt: new Date(), isOpen: false } });
  });
  await settleBetsForSelections(db, selIds);
}

/** Verilen seçimlere dokunan, tüm seçimleri sonuçlanmış kuponları öde. */
async function settleBetsForSelections(db: PrismaClient, sbSelectionIds: number[]) {
  if (!sbSelectionIds.length) return;
  const rows = await db.betSelection.findMany({ where: { sbSelectionId: { in: sbSelectionIds } }, select: { betId: true } });
  const betIds = [...new Set(rows.map((r) => r.betId))];
  for (const betId of betIds) {
    await db.$transaction(async (tx) => {
      const bet = await tx.bet.findUnique({ where: { id: betId }, include: { selections: true } });
      if (!bet || (bet.state !== BetState.ACTIVE && bet.state !== BetState.PENDING)) return;
      // tüm seçimlerin sonucunu topla
      const ids = bet.selections.map((s) => s.sbSelectionId).filter((x): x is number => x != null);
      const sels = await tx.sbSelection.findMany({ where: { id: { in: ids } } });
      const byId = new Map(sels.map((s) => [s.id, s]));
      let anyPending = false, anyLost = false;
      let effOdds = 1;
      for (const bs of bet.selections) {
        const s = bs.sbSelectionId ? byId.get(bs.sbSelectionId) : null;
        const res = s?.result;
        if (!res) { anyPending = true; break; }
        if (res === "LOST") anyLost = true;
        else if (res === "WON") effOdds *= Number(bs.odds);
        // VOID → oran 1.0 (etkisiz)
      }
      if (anyPending) return; // başka maç bitmemiş
      const fromBonus = Number(bet.stakeFromBonus) > 0;
      const wallet = fromBonus ? WalletType.BONUS : WalletType.MAIN;
      if (anyLost) {
        await tx.bet.update({ where: { id: betId }, data: { state: BetState.LOST, winAmount: 0, settledAt: new Date() } });
      } else {
        const allVoid = effOdds === 1;
        const payout = Math.min(Number(bet.stake) * effOdds, Number((await getConfigTx(tx)).maxWin));
        await move(tx, { playerId: bet.playerId, wallet, type: TxType.BET_WIN, amount: payout, reference: `bet:${betId}`, note: allVoid ? "Kupon iade" : "Kupon kazancı" });
        await tx.bet.update({ where: { id: betId }, data: { state: allVoid ? BetState.RETURNED : BetState.WON, winAmount: payout, settledAt: new Date() } });
      }
      // seçim durumlarını da işaretle
      for (const bs of bet.selections) {
        const s = bs.sbSelectionId ? byId.get(bs.sbSelectionId) : null;
        const map: any = { WON: BetState.WON, LOST: BetState.LOST, VOID: BetState.RETURNED };
        if (s?.result) await tx.betSelection.update({ where: { id: bs.id }, data: { state: map[s.result] } });
      }
    });
  }
}
async function getConfigTx(tx: Prisma.TransactionClient): Promise<SbConfig> {
  const row = await tx.cmsSetting.findUnique({ where: { siteId_key: { siteId: 1, key: CFG_KEY } } });
  return { ...DEFAULTS, ...((row?.value as any) ?? {}) };
}

// ---------- KUPON ----------
export async function placeBet(db: PrismaClient, playerId: number, body: { selectionIds: number[]; stake: number; mode?: "combo" | "single"; wallet?: WalletType }) {
  const cfg = await getConfig(db);
  if (!cfg.enabled) throw new SbError("SPORTSBOOK_DISABLED");
  const stake = Number(body.stake);
  if (!(stake > 0)) throw new SbError("INVALID_STAKE");
  if (stake > cfg.maxStake) throw new SbError("MAX_STAKE_EXCEEDED");
  const ids = [...new Set(body.selectionIds ?? [])];
  if (!ids.length) throw new SbError("NO_SELECTION");
  if (ids.length > cfg.maxSelections) throw new SbError("TOO_MANY_SELECTIONS");

  const sels = await db.sbSelection.findMany({ where: { id: { in: ids } }, include: { market: { include: { event: true } } } });
  if (sels.length !== ids.length) throw new SbError("SELECTION_UNAVAILABLE");
  for (const s of sels) {
    const ev = s.market.event;
    if (!s.market.isOpen || !ev.isOpen || ev.settledAt) throw new SbError("SELECTION_CLOSED");
    if (ev.status !== "NS" && ev.status !== "TBD") throw new SbError("EVENT_STARTED");
    if (new Date(ev.startsAt).getTime() <= Date.now()) throw new SbError("EVENT_STARTED");
  }
  const mode = body.mode ?? "combo";
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.status !== "OPEN" || player.isSportBlocked) throw new SbError("SPORT_BLOCKED");
  const wallet = body.wallet ?? (player.activeWallet === "BONUS" ? WalletType.BONUS : WalletType.MAIN);

  if (mode === "combo") {
    const evSet = new Set(sels.map((s) => s.market.eventId));
    if (evSet.size !== sels.length) throw new SbError("SAME_EVENT_IN_COMBO");
    const totalOdds = sels.reduce((a, s) => a * Number(s.odds), 1);
    const potential = Math.min(stake * totalOdds, cfg.maxWin);
    return createBet(db, player.id, wallet, sels, stake, totalOdds, potential, sels.length > 1 ? BetType.MULTIPLE : BetType.SINGLE);
  }
  // single: her seçim ayrı kupon, her birine `stake`
  const out = [];
  for (const s of sels) {
    const odds = Number(s.odds);
    out.push(await createBet(db, player.id, wallet, [s], stake, odds, Math.min(stake * odds, cfg.maxWin), BetType.SINGLE));
  }
  return { bets: out };
}

async function createBet(db: PrismaClient, playerId: number, wallet: WalletType, sels: any[], stake: number, totalOdds: number, potential: number, type: BetType) {
  return db.$transaction(async (tx) => {
    try {
      await move(tx, { playerId, wallet, type: TxType.BET_STAKE, amount: -stake, reference: "bet", note: "Kupon" });
    } catch (e: any) {
      if (e.message === "INSUFFICIENT_FUNDS") throw new SbError("INSUFFICIENT_BALANCE");
      throw e;
    }
    const bet = await tx.bet.create({
      data: {
        playerId, type, stake, totalOdds: D(totalOdds.toFixed(3)), potentialWin: D(potential.toFixed(2)),
        stakeFromMain: wallet === WalletType.MAIN ? stake : 0, stakeFromBonus: wallet === WalletType.BONUS ? stake : 0,
        state: BetState.ACTIVE, source: "Web",
        selections: {
          create: sels.map((s) => ({
            providerEventId: String(s.market.event.fixtureId), sport: s.market.event.sport, competition: s.market.event.league,
            matchName: `${s.market.event.home} - ${s.market.event.away}`, matchStart: s.market.event.startsAt,
            market: s.market.name, selection: s.name, odds: s.odds, state: BetState.ACTIVE, sbSelectionId: s.id,
          })),
        },
      },
      include: { selections: true },
    });
    // stake referansını kupon id'siyle güncelle (rapor eşleşmesi)
    return { id: bet.id.toString(), totalOdds, potentialWin: potential, state: bet.state, type };
  });
}

// ---------- SİTE İÇİN SERİLEŞTİRME ----------
export async function listEvents(db: PrismaClient, opts: { leagueId?: number; limit?: number } = {}) {
  const events = await db.sbEvent.findMany({
    where: { isOpen: true, settledAt: null, startsAt: { gt: new Date() }, ...(opts.leagueId ? { leagueId: opts.leagueId } : {}) },
    orderBy: { startsAt: "asc" }, take: opts.limit ?? 80,
    include: { markets: { where: { isOpen: true }, include: { selections: true } } },
  });
  return events.map(serializeEvent);
}
export async function listLeagues(db: PrismaClient) {
  const rows = await db.sbEvent.groupBy({ by: ["leagueId", "league", "country", "leagueLogo"], where: { isOpen: true, settledAt: null, startsAt: { gt: new Date() } }, _count: true });
  return rows.map((r) => ({ id: r.leagueId, name: r.league, country: r.country, logo: r.leagueLogo, count: r._count })).sort((a, b) => b.count - a.count);
}
export function serializeEvent(ev: any) {
  return {
    id: ev.id, fixtureId: ev.fixtureId, league: ev.league, leagueId: ev.leagueId, country: ev.country, leagueLogo: ev.leagueLogo,
    home: ev.home, away: ev.away, homeLogo: ev.homeLogo, awayLogo: ev.awayLogo, startsAt: ev.startsAt, status: ev.status,
    markets: (ev.markets ?? []).map((m: any) => ({
      key: m.key, name: m.name,
      selections: m.selections.sort((a: any, b: any) => a.id - b.id).map((s: any) => ({ id: s.id, code: s.code, name: s.name, odds: Number(s.odds) })),
    })),
  };
}
