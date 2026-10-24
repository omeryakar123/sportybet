/**
 * Site (oyuncu) API'si — /api önekiyle. Frontend bu uçları kullanır.
 * Tüm uçlar oyuncu JWT'si ister (Authorization: Bearer <token>).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PaymentType, PlayerBonusState } from "@prisma/client";
import { db } from "../index.js";
import { createDeposit, createWithdrawal, processPayment, BizError } from "../services/payments.js";
import { redeemPromo } from "../services/bonus.js";

type PlayerJwt = { playerId: number; kind: "player" };

export async function siteRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "VALIDATION_ERROR", detail: err.flatten() });
    if (err instanceof BizError || /^[A-Z_]+$/.test(err.message)) return reply.code(400).send({ error: err.message, detail: (err as any).detail });
    app.log.error(err);
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  app.addHook("onRequest", async (req, reply) => {
    try {
      await req.jwtVerify();
      const u = req.user as PlayerJwt;
      if (u.kind !== "player") throw new Error();
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
  });
  const pid = (req: FastifyRequest) => (req.user as PlayerJwt).playerId;

  // ---- Profil ----
  app.patch("/me", async (req) => {
    const b = z.object({
      firstName: z.string().max(60).optional(), lastName: z.string().max(60).optional(), phone: z.string().max(30).optional(),
      email: z.string().email().optional(), birthDate: z.string().optional(), city: z.string().max(60).optional(), address: z.string().max(200).optional(),
      language: z.enum(["tr", "en"]).optional(),
      hideStats: z.boolean().optional(),
      // Profil fotoğrafı: hazır avatar ("av:1".."av:24") ya da küçük resim (data URL, ≤ ~150 KB, png/jpeg/webp)
      avatar: z.union([
        z.string().regex(/^av:\d{1,2}$/),
        z.string().max(200_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
        z.null(),
      ]).optional(),
    }).parse(req.body);
    await db.player.update({ where: { id: pid(req) }, data: { ...b, ...(b.birthDate ? { birthDate: new Date(b.birthDate) } : {}) } });
    return { ok: true };
  });
  app.post("/me/password", async (req, reply) => {
    const b = z.object({ current: z.string(), next: z.string().min(6) }).parse(req.body);
    const p = await db.player.findUniqueOrThrow({ where: { id: pid(req) } });
    if (!(await bcrypt.compare(b.current, p.passwordHash))) return reply.code(400).send({ error: "WRONG_PASSWORD" });
    await db.player.update({ where: { id: p.id }, data: { passwordHash: await bcrypt.hash(b.next, 10) } });
    return { ok: true };
  });

  // ---- Aktif cüzdan (Ana Para / Bonus) — sportsbook ve tahminler sadece seçili cüzdanı kullanır ----
  app.put("/me/wallet", async (req) => {
    const { wallet } = z.object({ wallet: z.enum(["MAIN", "BONUS"]) }).parse(req.body);
    const p = await db.player.update({ where: { id: pid(req) }, data: { activeWallet: wallet }, include: { wallets: true } });
    return { activeWallet: p.activeWallet, wallets: p.wallets.map((w) => ({ type: w.type, balance: w.balance, currency: w.currency })) };
  });

  // ---- Geçmiş ----
  app.get("/me/transactions", async (req) => {
    const q = z.object({ type: z.string().optional(), take: z.coerce.number().max(200).default(50), cursor: z.string().optional() }).parse(req.query);
    return db.transaction.findMany({
      where: { playerId: pid(req), ...(q.type ? { type: { in: q.type.split(",") as any } } : {}), ...(q.cursor ? { id: { lt: BigInt(q.cursor) } } : {}) },
      select: { id: true, type: true, amount: true, balanceAfter: true, paymentSystem: true, note: true, createdAt: true, wallet: { select: { type: true } } },
      orderBy: { id: "desc" }, take: q.take,
    });
  });
  app.get("/me/bets", async (req) => {
    const q = z.object({ state: z.string().optional(), take: z.coerce.number().max(100).default(30) }).parse(req.query);
    return db.bet.findMany({
      where: { playerId: pid(req), state: q.state ? { in: q.state.split(",") as any } : { not: "CANCELLED" } },
      include: { selections: true }, orderBy: { id: "desc" }, take: q.take,
    });
  });
  app.get("/me/bonuses", async (req) => {
    const list = await db.playerBonus.findMany({ where: { playerId: pid(req) }, include: { bonus: { select: { name: true, type: true, description: true, allowWithdrawal: true } } }, orderBy: { id: "desc" } });
    return list.map((b) => ({ ...b, progress: Number(b.wagerRequired) ? Math.min(100, (Number(b.wagerDone) / Number(b.wagerRequired)) * 100) : 100 }));
  });
  app.get("/me/payments", async (req) => db.paymentRequest.findMany({ where: { playerId: pid(req) }, select: { id: true, type: true, amount: true, state: true, paymentSystem: true, rejectReason: true, createdAt: true, processedAt: true }, orderBy: { id: "desc" }, take: 100 }));

  // ---- Ödemeler ----
  app.get("/payment-systems", async (req) => {
    const { type } = z.object({ type: z.nativeEnum(PaymentType).optional() }).parse(req.query);
    const p = await db.player.findUniqueOrThrow({ where: { id: pid(req) }, select: { siteId: true } });
    return db.paymentSystem.findMany({
      where: { siteId: p.siteId, isActive: true, ...(type ? { kind: { in: [type, "BOTH"] } } : {}) },
      select: { name: true, displayName: true, kind: true, logoUrl: true, minAmount: true, maxAmount: true, fields: true, instructions: true, config: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  });
  app.post("/payments/deposit", async (req) => {
    const b = z.object({ paymentSystem: z.string(), amount: z.number().positive(), bonusId: z.number().optional(), info: z.record(z.any()).optional() }).parse(req.body);
    const r = await createDeposit(db, pid(req), b);
    return { id: r.id.toString(), state: r.state };
  });
  app.post("/payments/withdraw", async (req) => {
    const b = z.object({ paymentSystem: z.string(), amount: z.number().positive(), info: z.record(z.any()).optional() }).parse(req.body);
    const r = await createWithdrawal(db, pid(req), b);
    return { id: r.id.toString(), state: r.state };
  });
  app.post("/payments/:id/cancel", async (req) => {
    const r = await processPayment(db, BigInt((req.params as any).id), "cancel", { byPlayerId: pid(req) });
    return { id: r.id.toString(), state: r.state };
  });

  // ---- İstatistik + VIP seviyesi (gamdom Rewards / Profile) ----
  app.get("/me/stats", async (req) => {
    const id = pid(req);
    const p = await db.player.findUniqueOrThrow({ where: { id }, select: { siteId: true, createdAt: true } });
    const [sb, sbWon, pr, best] = await Promise.all([
      db.bet.aggregate({ where: { playerId: id, state: { not: "CANCELLED" as any } }, _sum: { stake: true }, _count: true }),
      db.bet.aggregate({ where: { playerId: id, winAmount: { gt: 0 } }, _sum: { winAmount: true }, _count: true }),
      db.predictionPosition.aggregate({ where: { playerId: id }, _sum: { stake: true, payout: true }, _count: true }),
      db.bet.findFirst({ where: { playerId: id, winAmount: { gt: 0 } }, orderBy: { winAmount: "desc" }, select: { winAmount: true } }),
    ]);
    const wagered = Number(sb._sum.stake ?? 0) + Number(pr._sum.stake ?? 0);
    const cfg = (await db.cmsSetting.findUnique({ where: { siteId_key: { siteId: p.siteId, key: "vip_levels" } } }))?.value as any;
    const levels: { name: string; xp: number; reward?: string; image?: string; color?: string }[] = Array.isArray(cfg?.levels) && cfg.levels.length ? cfg.levels : VIP_DEFAULT;
    let cur = -1; levels.forEach((l, i) => { if (wagered >= Number(l.xp)) cur = i; });
    const next = levels[cur + 1];
    const base = cur >= 0 ? Number(levels[cur].xp) : 0;
    const progress = next ? Math.max(0, Math.min(100, ((wagered - base) / (Number(next.xp) - base)) * 100)) : 100;
    return {
      wagered, bets: sb._count + pr._count, wins: sbWon._count, totalWon: Number(sbWon._sum.winAmount ?? 0) + Number(pr._sum.payout ?? 0),
      biggestWin: Number(best?.winAmount ?? 0), memberSince: p.createdAt,
      levels, level: cur, nextLevel: next ? cur + 1 : null, progress: Math.round(progress * 100) / 100,
    };
  });

  // ---- Bonuslar ----
  app.get("/bonuses/available", async (req) => {
    const now = new Date();
    const p = await db.player.findUniqueOrThrow({ where: { id: pid(req) } });
    if (p.excludedFromBonuses) return [];
    const pending = await db.bonusRequest.findMany({ where: { playerId: p.id, state: "PENDING" }, select: { bonusId: true } });
    const list = await db.bonus.findMany({
      where: { siteId: p.siteId, isActive: true, OR: [{ availableOnRequest: true }, { type: "DEPOSIT" }], AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      select: { id: true, name: true, type: true, product: true, description: true, percent: true, minAmount: true, maxAmount: true, wageringMultiplier: true, expirationDays: true, availableOnRequest: true },
    });
    return list.map((b) => ({ ...b, requested: pending.some((x) => x.bonusId === b.id), claimable: b.availableOnRequest, depositBonus: b.type === "DEPOSIT" }));
  });
  app.post("/bonuses/:id/request", async (req) => {
    const bonusId = Number((req.params as any).id);
    const p = await db.player.findUniqueOrThrow({ where: { id: pid(req) } });
    const b = await db.bonus.findUnique({ where: { id: bonusId } });
    if (!b || !b.isActive || !b.availableOnRequest || b.siteId !== p.siteId) throw new BizError("BONUS_NOT_AVAILABLE");
    if (p.excludedFromBonuses) throw new BizError("PLAYER_EXCLUDED_FROM_BONUSES");
    if (await db.playerBonus.findFirst({ where: { playerId: p.id, state: PlayerBonusState.ACTIVE } })) throw new BizError("ACTIVE_BONUS_EXISTS");
    if (await db.bonusRequest.findFirst({ where: { playerId: p.id, bonusId, state: "PENDING" } })) throw new BizError("ALREADY_REQUESTED");
    const r = await db.bonusRequest.create({ data: { playerId: p.id, bonusId } });
    return { id: r.id, state: r.state };
  });
  app.post("/promo/redeem", async (req) => {
    const { code } = z.object({ code: z.string().min(2).max(50) }).parse(req.body);
    const pb = await redeemPromo(db, pid(req), code.trim());
    return { ok: true, playerBonusId: pb.id, amount: pb.amount };
  });
}

/** Varsayılan VIP seviyeleri (CMS › vip_levels ile değiştirilir). xp = toplam oynanan tutar (₺) */
const VIP_DEFAULT = [
  ["Bronz 1", 0], ["Bronz 2", 2_500], ["Bronz 3", 10_000], ["Gümüş 1", 25_000], ["Gümüş 2", 50_000], ["Gümüş 3", 100_000],
  ["Altın 1", 200_000], ["Altın 2", 350_000], ["Altın 3", 500_000], ["Zümrüt 1", 750_000], ["Zümrüt 2", 1_000_000], ["Zümrüt 3", 1_500_000],
  ["Safir 1", 2_000_000], ["Safir 2", 3_000_000], ["Safir 3", 4_000_000], ["Yakut 1", 5_000_000], ["Yakut 2", 7_500_000], ["Yakut 3", 10_000_000],
  ["Elmas 1", 15_000_000], ["Elmas 2", 20_000_000], ["Elmas 3", 30_000_000], ["Opal 1", 50_000_000], ["Opal 2", 75_000_000], ["Opal 3", 100_000_000],
].map(([name, xp]) => ({ name: name as string, xp: xp as number }));
