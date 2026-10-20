/**
 * Tahmin piyasası motoru.
 *
 * Pay (share) = sonuç gerçekleşirse 1 TL ödeyen kontrat. Fiyat 0–1 arası, olasılık = fiyat × 100.
 *  - NO_IMPACT  : fiyat admin tarafından belirlenir (marjlı, toplamı 1'i geçebilir). Pay = tutar / fiyat.
 *  - AFFECTS_ODDS: FPMM (sabit çarpımlı piyasa yapıcı). fiyat_i ∝ 1 / rezerv_i. Alım fiyatı yükseltir, satış düşürür.
 * Oyuncu aktif cüzdanından (ANA / BONUS) oynar; kazanç aynı cüzdana döner.
 */
import { Prisma, PrismaClient, TxType, WalletType, PlayerBonusState } from "@prisma/client";
import { move } from "./wallet.js";
import { addWagering } from "./bonus.js";
import { BizError } from "./payments.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
type Tx = Prisma.TransactionClient;

// ---------------- FPMM matematiği ----------------
export function fpmmPrices(r: number[]) {
  const inv = r.map((x) => 1 / x);
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / s);
}
export function fpmmInit(prices: number[], liquidity: number) {
  const n = prices.length;
  const tot = prices.reduce((a, b) => a + b, 0);
  return prices.map((p) => liquidity / (n * Math.max(0.01, p / tot)));
}
/** i sonucuna net `a` TL yatırılınca alınan pay ve yeni rezervler */
export function fpmmBuy(r: number[], i: number, a: number) {
  const lnProd = r.reduce((s, x) => s + Math.log(x), 0);
  const added = r.map((x) => x + a);
  const others = added.reduce((s, x, j) => (j === i ? s : s + Math.log(x)), 0);
  const ri = Math.exp(lnProd - others);
  const shares = added[i] - ri;
  const next = added.map((x, j) => (j === i ? ri : x));
  return { shares, next };
}
/** i sonucundan `s` pay satılınca ödenen tutar ve yeni rezervler (ikiye bölme ile) */
export function fpmmSell(r: number[], i: number, s: number) {
  const lnProd = r.reduce((acc, x) => acc + Math.log(x), 0);
  const f = (x: number) => r.reduce((acc, rj, j) => acc + Math.log(j === i ? rj + s - x : rj - x), 0) - lnProd;
  let lo = 0, hi = Math.min(...r.map((rj, j) => (j === i ? rj + s : rj))) - 1e-9;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const x = lo;
  return { amount: x, next: r.map((rj, j) => (j === i ? rj + s - x : rj - x)) };
}

// ---------------- Yardımcılar ----------------
export async function predictionSettings(db: PrismaClient | Tx) {
  const s = await db.cmsSetting.findUnique({ where: { key: "prediction_settings" } });
  return { tradingMode: "NORMAL", notice: null as string | null, sellFeePct: 0, ...((s?.value as any) ?? {}) } as { tradingMode: "NORMAL" | "PAUSED"; notice: string | null; sellFeePct: number };
}

export function effective(m: { status: string; buyEnabled: boolean; sellEnabled: boolean; deadline: Date | null }, tradingMode: string) {
  const open = m.status === "active" && (!m.deadline || m.deadline > new Date()) && tradingMode === "NORMAL";
  return { buy: open && m.buyEnabled, sell: open && m.sellEnabled };
}

/** API çıktısı (örnek feed formatıyla uyumlu) */
export function serializeMarket(m: any, tradingMode: string, extra: { isSaved?: boolean; subMarkets?: any[] } = {}) {
  const eff = effective(m, tradingMode);
  return {
    id: m.id, slug: m.slug, question: m.question, structure: m.structure, type: m.type, oddsImpactMode: m.oddsImpactMode,
    externalMatchId: m.externalMatchId, metadata: m.metadata, isHomepage: m.isHomepage, sortOrder: m.sortOrder,
    buyEnabled: m.buyEnabled, sellEnabled: m.sellEnabled, effectiveBuyEnabled: eff.buy, effectiveSellEnabled: eff.sell,
    redemption: { active: false }, status: m.status, image: m.image, rules: m.rules, deadline: m.deadline,
    minStake: Number(m.minStake), maxStake: Number(m.maxStake), totalVolume: Number(m.totalVolume),
    resolvedOutcomeId: m.resolvedOutcomeId ?? null, parentMarketId: m.parentMarketId ?? null,
    outcomes: (m.outcomes ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((o: any) => ({
      id: o.id, name: o.name, color: o.color, image: o.image, price: Number(o.price), probability: Math.round(Number(o.price) * 10000) / 100,
      buyEnabled: o.buyEnabled && eff.buy, sellEnabled: o.sellEnabled && eff.sell, isWinner: m.resolvedOutcomeId ? m.resolvedOutcomeId === o.id : null,
    })),
    categories: (m.categories ?? []).map((c: any) => c.category ?? c).map((c: any) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, icon: c.icon, parentId: c.parentId })),
    isSaved: Boolean(extra.isSaved), ...(extra.subMarkets ? { subMarkets: extra.subMarkets } : {}),
    activatedAt: m.activatedAt, createdAt: m.createdAt, updatedAt: m.updatedAt,
  };
}

async function lockMarket(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "PredictionMarket" WHERE id = ${id} FOR UPDATE`;
  return tx.predictionMarket.findUniqueOrThrow({ where: { id }, include: { outcomes: { orderBy: { sortOrder: "asc" } } } });
}

async function writeFpmm(tx: Tx, outcomes: { id: string }[], next: number[]) {
  const prices = fpmmPrices(next);
  for (let j = 0; j < outcomes.length; j++) {
    await tx.predictionOutcome.update({ where: { id: outcomes[j].id }, data: { reserve: D(next[j].toFixed(10)), price: D(prices[j].toFixed(4)) } });
  }
}

/** Kazanç / iade hangi cüzdana: bonus tamamlandıysa ana paraya */
async function payoutWallet(tx: Tx, pos: { wallet: WalletType; playerBonusId: number | null }) {
  if (pos.wallet !== WalletType.BONUS) return WalletType.MAIN;
  if (!pos.playerBonusId) return WalletType.BONUS;
  const pb = await tx.playerBonus.findUnique({ where: { id: pos.playerBonusId } });
  return pb?.state === PlayerBonusState.COMPLETED ? WalletType.MAIN : WalletType.BONUS;
}

// ---------------- Oyuncu: al / sat ----------------
export async function buy(db: PrismaClient, playerId: number, marketId: string, outcomeId: string, amountIn: number) {
  const settings = await predictionSettings(db);
  return db.$transaction(async (tx) => {
    const m = await lockMarket(tx, marketId);
    const eff = effective(m, settings.tradingMode);
    if (!eff.buy) throw new BizError(settings.tradingMode !== "NORMAL" ? "TRADING_PAUSED" : "MARKET_NOT_OPEN");
    const idx = m.outcomes.findIndex((o) => o.id === outcomeId);
    if (idx < 0) throw new BizError("OUTCOME_NOT_FOUND");
    if (!m.outcomes[idx].buyEnabled) throw new BizError("OUTCOME_BUY_DISABLED");
    const amount = D(amountIn).toDecimalPlaces(2);
    if (amount.lt(m.minStake)) throw new BizError("BELOW_MIN_STAKE");
    if (amount.gt(m.maxStake)) throw new BizError("ABOVE_MAX_STAKE");
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.status !== "OPEN") throw new BizError("ACCOUNT_BLOCKED");
    const wallet = player.activeWallet;

    try {
      await move(tx, { playerId, wallet, type: TxType.PREDICTION_BUY, amount: amount.neg(), reference: `pred:${m.id}`, note: `${m.question.slice(0, 80)} → ${m.outcomes[idx].name}` });
    } catch (e: any) {
      if (e.message === "INSUFFICIENT_FUNDS") throw new BizError("INSUFFICIENT_BALANCE");
      throw e;
    }

    let shares: number; let price: number;
    if (m.oddsImpactMode === "AFFECTS_ODDS") {
      const net = Number(amount) * (1 - Number(m.feePct) / 100);
      const r = m.outcomes.map((o) => Number(o.reserve));
      const res = fpmmBuy(r, idx, net);
      shares = res.shares; price = Number(amount) / shares;
      await writeFpmm(tx, m.outcomes, res.next);
    } else {
      price = Number(m.outcomes[idx].price);
      if (price <= 0 || price >= 1) throw new BizError("INVALID_PRICE");
      shares = Number(amount) / price;
    }
    const pb = wallet === WalletType.BONUS ? await tx.playerBonus.findFirst({ where: { playerId, state: PlayerBonusState.ACTIVE } }) : null;
    const pos = await tx.predictionPosition.create({
      data: { playerId, marketId: m.id, outcomeId, wallet, stake: amount, shares: D(shares.toFixed(6)), price: D(price.toFixed(4)), playerBonusId: pb?.id },
    });
    await tx.predictionMarket.update({ where: { id: m.id }, data: { totalVolume: { increment: amount } } });
    return { position: pos, potentialPayout: Number(shares.toFixed(2)) };
  });
}

/** Satış fiyatı teklifi (satmadan önce oyuncuya göstermek için) */
export async function sellQuote(db: PrismaClient | Tx, positionId: bigint) {
  const pos = await db.predictionPosition.findUniqueOrThrow({ where: { id: positionId }, include: { market: { include: { outcomes: { orderBy: { sortOrder: "asc" } } } } } });
  const m = pos.market; const idx = m.outcomes.findIndex((o) => o.id === pos.outcomeId);
  const settings = await predictionSettings(db as any);
  let amount: number; let next: number[] | null = null;
  if (m.oddsImpactMode === "AFFECTS_ODDS") {
    const res = fpmmSell(m.outcomes.map((o) => Number(o.reserve)), idx, Number(pos.shares));
    amount = res.amount; next = res.next;
  } else amount = Number(pos.shares) * Number(m.outcomes[idx].price);
  amount = amount * (1 - Number(settings.sellFeePct || 0) / 100);
  return { pos, market: m, idx, amount: Math.floor(amount * 100) / 100, next, settings };
}

export async function sell(db: PrismaClient, playerId: number, positionId: bigint) {
  return db.$transaction(async (tx) => {
    const p0 = await tx.predictionPosition.findUniqueOrThrow({ where: { id: positionId } });
    if (p0.playerId !== playerId) throw new BizError("NOT_FOUND");
    await lockMarket(tx, p0.marketId);
    const [locked] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "PredictionPosition" WHERE id = ${positionId} FOR UPDATE`;
    if (locked.status !== "OPEN") throw new BizError("POSITION_NOT_OPEN");
    const q = await sellQuote(tx, positionId);
    const eff = effective(q.market, q.settings.tradingMode);
    if (!eff.sell || !q.market.outcomes[q.idx].sellEnabled) throw new BizError("SELL_DISABLED");
    if (q.next) await writeFpmm(tx, q.market.outcomes, q.next);
    const w = await payoutWallet(tx, q.pos);
    if (q.amount > 0) await move(tx, { playerId, wallet: w, type: TxType.PREDICTION_SELL, amount: q.amount, reference: `pred:${q.market.id}`, note: `Bozdurma · ${q.market.question.slice(0, 80)}` });
    return tx.predictionPosition.update({ where: { id: positionId }, data: { status: "SOLD", payout: D(q.amount), closedAt: new Date() } });
  });
}

// ---------------- Admin: sonuçlandır / iptal ----------------
export async function resolveMarket(db: PrismaClient, marketId: string, winningOutcomeId: string, adminId?: number) {
  const out = await db.$transaction(async (tx) => {
    const m = await lockMarket(tx, marketId);
    if (["resolved", "cancelled"].includes(m.status)) throw new BizError("ALREADY_SETTLED");
    if (!m.outcomes.some((o) => o.id === winningOutcomeId)) throw new BizError("OUTCOME_NOT_FOUND");
    const open = await tx.predictionPosition.findMany({ where: { marketId, status: "OPEN" } });
    const wagering: { pb: number; stake: Prisma.Decimal }[] = [];
    let paid = D(0);
    for (const pos of open) {
      const win = pos.outcomeId === winningOutcomeId;
      const payout = win ? D(pos.shares).toDecimalPlaces(2) : D(0);
      if (win && payout.gt(0)) {
        const w = await payoutWallet(tx, pos);
        await move(tx, { playerId: pos.playerId, wallet: w, type: TxType.PREDICTION_WIN, amount: payout, reference: `pred:${marketId}`, note: `Kazanç · ${m.question.slice(0, 80)}` });
        paid = paid.add(payout);
      }
      await tx.predictionPosition.update({ where: { id: pos.id }, data: { status: win ? "WON" : "LOST", payout, closedAt: new Date() } });
      if (pos.playerBonusId) wagering.push({ pb: pos.playerBonusId, stake: pos.stake });
    }
    await tx.predictionMarket.update({ where: { id: marketId }, data: { status: "resolved", resolvedOutcomeId: winningOutcomeId, resolvedAt: new Date(), resolvedByAdminId: adminId } });
    return { positions: open.length, paid: Number(paid), wagering };
  });
  // Bonus çevrimi (her biri kendi transaction'ında)
  for (const w of out.wagering) {
    try { await db.$transaction((tx) => addWagering(tx, w.pb, w.stake)); } catch (e) { console.error("prediction wagering", e); }
  }
  return { positions: out.positions, paid: out.paid };
}

export async function cancelMarket(db: PrismaClient, marketId: string, adminId?: number) {
  return db.$transaction(async (tx) => {
    const m = await lockMarket(tx, marketId);
    if (["resolved", "cancelled"].includes(m.status)) throw new BizError("ALREADY_SETTLED");
    const open = await tx.predictionPosition.findMany({ where: { marketId, status: "OPEN" } });
    for (const pos of open) {
      const w = await payoutWallet(tx, pos);
      await move(tx, { playerId: pos.playerId, wallet: w, type: TxType.PREDICTION_REFUND, amount: pos.stake, reference: `pred:${marketId}`, note: `İade · ${m.question.slice(0, 80)}` });
      await tx.predictionPosition.update({ where: { id: pos.id }, data: { status: "REFUNDED", payout: pos.stake, closedAt: new Date() } });
    }
    await tx.predictionMarket.update({ where: { id: marketId }, data: { status: "cancelled", resolvedAt: new Date(), resolvedByAdminId: adminId } });
    return { refunded: open.length };
  });
}

/** Risk: sonuç bazında açık pozisyon, potansiyel ödeme ve kâr/zarar */
export async function marketRisk(db: PrismaClient, marketId: string) {
  const m = await db.predictionMarket.findUniqueOrThrow({ where: { id: marketId }, include: { outcomes: { orderBy: { sortOrder: "asc" } } } });
  const rows = await db.predictionPosition.groupBy({ by: ["outcomeId", "status"], where: { marketId }, _sum: { stake: true, shares: true, payout: true }, _count: true });
  const openStakeTotal = rows.filter((r) => r.status === "OPEN").reduce((a, r) => a + Number(r._sum.stake ?? 0), 0);
  return {
    outcomes: m.outcomes.map((o) => {
      const open = rows.find((r) => r.outcomeId === o.id && r.status === "OPEN");
      const payoutIfWin = Number(open?._sum.shares ?? 0);
      return { id: o.id, name: o.name, price: Number(o.price), openPositions: open?._count ?? 0, openStake: Number(open?._sum.stake ?? 0), payoutIfWin, houseResultIfWins: openStakeTotal - payoutIfWin };
    }),
    openStakeTotal,
    closed: rows.filter((r) => r.status !== "OPEN").reduce((a, r) => ({ stake: a.stake + Number(r._sum.stake ?? 0), payout: a.payout + Number(r._sum.payout ?? 0) }), { stake: 0, payout: 0 }),
  };
}

/** Son tarihi geçen aktif piyasaları kapat (sonuç bekliyor) — cron */
export async function autoClose(db: PrismaClient) {
  const r = await db.predictionMarket.updateMany({ where: { status: { in: ["active", "locked"] }, deadline: { lt: new Date() } }, data: { status: "closed" } });
  return r.count;
}

// ---------------- İçe aktarma (feed formatı) ----------------
const slugify = (s: string) => s.toLowerCase().replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "market";

async function uniqueSlug(db: PrismaClient, base: string, externalId: string) {
  const existing = await db.predictionMarket.findUnique({ where: { externalId } });
  if (existing) return existing.slug;
  let slug = slugify(base); let n = 1;
  while (await db.predictionMarket.findUnique({ where: { slug } })) slug = `${slugify(base)}-${++n}`;
  return slug;
}

/** Feed'deki tek bir piyasayı (ve alt piyasalarını) bizdekiyle eşitler. Fiyatlar feed'den gelir (NO_IMPACT olarak tutulur). */
export async function upsertFromFeed(db: PrismaClient, item: any, opts: { activate: boolean; parentId?: string }) {
  const cats: string[] = [];
  for (const c of item.categories ?? []) {
    const slug = c.slug || slugify(c.name);
    const cat = await db.predictionCategory.upsert({ where: { slug }, update: { name: c.name }, create: { name: c.name, slug, description: c.description ?? null, icon: c.icon ?? null } });
    cats.push(cat.id);
  }
  const slug = await uniqueSlug(db, item.slug || item.question, String(item.id));
  const statusMap: Record<string, string> = { active: "active", locked: "locked", closed: "closed", resolved: "closed", cancelled: "cancelled" };
  const existing = await db.predictionMarket.findUnique({ where: { externalId: String(item.id) }, include: { outcomes: true } });
  const status = existing && ["resolved", "cancelled"].includes(existing.status) ? existing.status : opts.activate ? statusMap[item.status] ?? "draft" : existing?.status ?? "draft";
  const data = {
    question: item.question, structure: item.structure ?? "STANDALONE", type: item.type ?? "PREDICTION", oddsImpactMode: "NO_IMPACT",
    parentMarketId: opts.parentId ?? null, externalMatchId: item.externalMatchId ?? null, source: "feed",
    metadata: { ...(item.metadata ?? {}), feedOddsImpactMode: item.oddsImpactMode ?? null },
    isHomepage: Boolean(item.isHomepage), sortOrder: Number(item.sortOrder ?? 0), buyEnabled: item.buyEnabled !== false, sellEnabled: item.sellEnabled !== false,
    status, image: item.image ?? null, rules: item.rules ?? null, deadline: item.deadline ? new Date(item.deadline) : null,
    activatedAt: status === "active" ? (existing?.activatedAt ?? new Date()) : existing?.activatedAt ?? null,
  };
  const m = existing
    ? await db.predictionMarket.update({ where: { id: existing.id }, data })
    : await db.predictionMarket.create({ data: { ...data, slug, externalId: String(item.id) } });
  // kategoriler
  await db.predictionMarketCategory.deleteMany({ where: { marketId: m.id } });
  if (cats.length) await db.predictionMarketCategory.createMany({ data: cats.map((categoryId) => ({ marketId: m.id, categoryId })), skipDuplicates: true });
  // sonuçlar (isimle eşleşir)
  const outs = item.outcomes ?? [];
  for (let k = 0; k < outs.length; k++) {
    const o = outs[k];
    const price = D(Math.min(0.99, Math.max(0.01, Number(o.price ?? 0.5))).toFixed(4));
    const ex = existing?.outcomes.find((x) => x.name === o.name);
    if (ex) await db.predictionOutcome.update({ where: { id: ex.id }, data: { price, color: o.color ?? null, image: o.image ?? null, buyEnabled: o.buyEnabled !== false, sellEnabled: o.sellEnabled !== false, sortOrder: k } });
    else await db.predictionOutcome.create({ data: { marketId: m.id, name: o.name, price, color: o.color ?? null, image: o.image ?? null, buyEnabled: o.buyEnabled !== false, sellEnabled: o.sellEnabled !== false, sortOrder: k } });
  }
  for (const sub of item.subMarkets ?? []) await upsertFromFeed(db, sub, { activate: opts.activate, parentId: m.id });
  return m.id;
}

export async function importFeed(db: PrismaClient, payload: any, activate: boolean) {
  const items: any[] = Array.isArray(payload) ? payload : payload?.data ?? [];
  let n = 0; const errors: string[] = [];
  for (const it of items) {
    try { await upsertFromFeed(db, it, { activate }); n++; } catch (e: any) { errors.push(`${it?.question?.slice(0, 40)}: ${e.message}`); }
  }
  return { imported: n, errors };
}

/** Ayarlarda feed URL'si varsa sayfa sayfa çekip senkronlar (cron) */
export async function syncFeed(db: PrismaClient) {
  const s = await db.cmsSetting.findUnique({ where: { key: "prediction_feed" } });
  const cfg: any = s?.value ?? {};
  if (!cfg.enabled || !cfg.url) return { skipped: true };
  let page = 1; let total = 0;
  const headers: Record<string, string> = { Accept: "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}`, "x-api-key": cfg.apiKey } : {}) };
  while (page <= Number(cfg.maxPages ?? 10)) {
    const url = new URL(cfg.url); url.searchParams.set("page", String(page)); url.searchParams.set("limit", String(cfg.limit ?? 50));
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`FEED_HTTP_${res.status}`);
    const j: any = await res.json();
    const r = await importFeed(db, j, Boolean(cfg.autoActivate));
    total += r.imported;
    if (!j.pagination || page >= j.pagination.totalPages) break;
    page++;
  }
  await db.cmsSetting.update({ where: { key: "prediction_feed" }, data: { value: { ...cfg, lastSyncAt: new Date().toISOString(), lastSyncCount: total } } });
  return { imported: total };
}
