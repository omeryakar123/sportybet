import type { FastifyInstance, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { TxType, WalletType } from "@prisma/client";
import { db } from "../index.js";
import { grantBonus } from "../services/bonus.js";
import { move } from "../services/wallet.js";
import { sportsbook, sportsbookConfigured } from "../services/sportsbook.js";

type AdminJwt = { adminId: number; role: string; kind: "admin" };

export async function adminRoutes(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const { username, password } = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const admin = await db.admin.findUnique({ where: { username } });
    if (!admin || !admin.isActive || !(await bcrypt.compare(password, admin.passwordHash)))
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    const token = app.jwt.sign({ adminId: admin.id, role: admin.role, kind: "admin" } satisfies AdminJwt, { expiresIn: "12h" });
    return { token, admin: { id: admin.id, username: admin.username, role: admin.role } };
  });

  // Bundan sonraki tüm rotalar admin token ister
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.endsWith("/login")) return;
    try {
      await req.jwtVerify();
      if ((req.user as AdminJwt).kind !== "admin") throw new Error();
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
  });
  const adminId = (req: FastifyRequest) => (req.user as AdminJwt).adminId;

  // ---------- Dashboard ----------
  app.get("/dashboard", async () => {
    const since = new Date(Date.now() - 86400_000);
    const [players, newPlayers, bets, deposits] = await Promise.all([
      db.player.count(),
      db.player.count({ where: { createdAt: { gte: since } } }),
      db.bet.aggregate({ where: { createdAt: { gte: since } }, _sum: { stake: true, winAmount: true }, _count: true }),
      db.transaction.aggregate({ where: { type: TxType.DEPOSIT, createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
    ]);
    return { players, newPlayers, bets, deposits };
  });

  // ---------- Oyuncular ----------
  app.get("/players", async (req) => {
    const q = z.object({ search: z.string().optional(), page: z.coerce.number().default(1), size: z.coerce.number().default(25) }).parse(req.query);
    const where = q.search
      ? { OR: [{ username: { contains: q.search, mode: "insensitive" as const } }, { email: { contains: q.search, mode: "insensitive" as const } }, ...(Number(q.search) ? [{ id: Number(q.search) }] : [])] }
      : {};
    const [items, total] = await Promise.all([
      db.player.findMany({ where, include: { wallets: true }, orderBy: { id: "desc" }, skip: (q.page - 1) * q.size, take: q.size }),
      db.player.count({ where }),
    ]);
    return { items, total };
  });

  app.get("/players/:id", async (req) => {
    const id = Number((req.params as any).id);
    return db.player.findUniqueOrThrow({ where: { id }, include: { wallets: true, notes: { orderBy: { id: "desc" } } } });
  });

  app.patch("/players/:id", async (req) => {
    const id = Number((req.params as any).id);
    const data = z.object({
      status: z.string().optional(), category: z.string().optional(), isVerified: z.boolean().optional(),
      isSportBlocked: z.boolean().optional(), isCasinoBlocked: z.boolean().optional(), excludedFromBonuses: z.boolean().optional(),
      email: z.string().optional(), phone: z.string().optional(), firstName: z.string().optional(), lastName: z.string().optional(),
    }).parse(req.body);
    const p = await db.player.update({ where: { id }, data });
    await db.auditLog.create({ data: { adminId: adminId(req), action: "PLAYER_UPDATE", target: `player:${id}`, payload: data } });
    return p;
  });

  app.get("/players/:id/transactions", async (req) => {
    const id = Number((req.params as any).id);
    return db.transaction.findMany({ where: { playerId: id }, include: { wallet: true }, orderBy: { id: "desc" }, take: 200 });
  });

  app.get("/players/:id/bets", async (req) => {
    const id = Number((req.params as any).id);
    return db.bet.findMany({ where: { playerId: id }, include: { selections: true }, orderBy: { id: "desc" }, take: 200 });
  });

  app.get("/players/:id/bonuses", async (req) => {
    const id = Number((req.params as any).id);
    return db.playerBonus.findMany({ where: { playerId: id }, include: { bonus: true }, orderBy: { id: "desc" } });
  });

  // Oyuncuya bonus ver (Player > Bonuses > Add)
  app.post("/players/:id/bonuses", async (req) => {
    const playerId = Number((req.params as any).id);
    const body = z.object({ bonusId: z.number(), amount: z.number().positive() }).parse(req.body);
    const pb = await grantBonus(db, { playerId, ...body, adminId: adminId(req) });
    await db.auditLog.create({ data: { adminId: adminId(req), action: "BONUS_GRANT", target: `player:${playerId}`, payload: body } });
    return pb;
  });

  // Manuel bakiye düzeltme / manuel yatırım
  app.post("/players/:id/adjust", async (req) => {
    const playerId = Number((req.params as any).id);
    const b = z.object({
      wallet: z.nativeEnum(WalletType).default(WalletType.MAIN),
      type: z.enum(["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"]),
      amount: z.number(),
      paymentSystem: z.string().optional(),
      note: z.string().optional(),
    }).parse(req.body);
    const amount = b.type === "WITHDRAWAL" ? -Math.abs(b.amount) : b.amount;
    const tx = await db.$transaction((t) => move(t, { playerId, wallet: b.wallet, type: b.type as TxType, amount, paymentSystem: b.paymentSystem, note: b.note, adminId: adminId(req) }));
    await db.auditLog.create({ data: { adminId: adminId(req), action: "BALANCE_ADJUST", target: `player:${playerId}`, payload: b } });
    return { ...tx, id: tx.id.toString() };
  });

  app.post("/players/:id/notes", async (req) => {
    const playerId = Number((req.params as any).id);
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    return db.playerNote.create({ data: { playerId, text, adminId: adminId(req) } });
  });

  // ---------- Spor bahisleri (tüm oyuncular) ----------
  app.get("/bets", async (req) => {
    const q = z.object({ state: z.string().optional(), isLive: z.string().optional(), coupon: z.string().optional(), playerId: z.coerce.number().optional(), bonusOnly: z.string().optional(), take: z.coerce.number().default(100) }).parse(req.query);
    return db.bet.findMany({
      where: {
        ...(q.state ? { state: q.state as any } : {}), ...(q.isLive ? { isLive: q.isLive === "true" } : {}),
        ...(q.coupon ? { couponId: q.coupon } : {}), ...(q.playerId ? { playerId: q.playerId } : {}),
        ...(q.bonusOnly === "true" ? { stakeFromBonus: { gt: 0 } } : {}),
      },
      include: { selections: true, player: { select: { id: true, username: true } } },
      orderBy: { id: "desc" },
      take: q.take,
    });
  });

  // ---------- Sportsbook (Betco) ----------
  const sb = (fn: () => Promise<any>) => async (_req: FastifyRequest, reply: any) => {
    try { return await fn(); } catch (e: any) { return reply.code(502).send({ error: e.message, detail: e.detail }); }
  };
  app.get("/sportsbook/status", async () => {
    const out: any = { configured: sportsbookConfigured(), walletSecretSet: Boolean(process.env.SPORTSBOOK_WALLET_SECRET) };
    if (out.configured) {
      out.me = await sportsbook.me().then((r: any) => r.data).catch((e: any) => ({ error: e.message }));
      out.billing = await sportsbook.billing().then((r: any) => r.data).catch((e: any) => ({ error: e.message }));
    }
    out.lastBalanceStatus = (await db.cmsSetting.findUnique({ where: { key: "sportsbook_partner_balance" } }))?.value ?? null;
    return out;
  });
  app.get("/sportsbook/ledger", (req, reply) => sb(() => sportsbook.ledger(req.query as any))(req, reply));
  app.get("/sportsbook/transactions", (req, reply) => sb(() => sportsbook.transactions(req.query as any))(req, reply));
  app.get("/sportsbook/bets", (req, reply) => sb(() => sportsbook.bets(req.query as any))(req, reply));
  app.get("/sportsbook/bets/:id", (req, reply) => sb(() => sportsbook.bet((req.params as any).id))(req, reply));
  // Bizim taraftaki cüzdan çağrı logu + webhook logu
  app.get("/wallet-requests", async (req) => {
    const q = z.object({ kind: z.string().optional(), status: z.string().optional(), playerId: z.coerce.number().optional(), take: z.coerce.number().default(200) }).parse(req.query);
    return db.walletRequest.findMany({
      where: { ...(q.kind ? { kind: q.kind } : {}), ...(q.status ? { status: q.status } : {}), ...(q.playerId ? { playerId: q.playerId } : {}) },
      orderBy: { id: "desc" }, take: q.take,
    });
  });
  app.get("/webhook-events", async () => db.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));

  // ---------- Bonus tanımları ----------
  app.get("/bonuses", async () => db.bonus.findMany({ orderBy: { id: "desc" } }));
  app.post("/bonuses", async (req) => db.bonus.create({ data: req.body as any }));
  app.patch("/bonuses/:id", async (req) => db.bonus.update({ where: { id: Number((req.params as any).id) }, data: req.body as any }));

  // ---------- Promo kodlar ----------
  app.get("/promo-codes", async () => db.promoCode.findMany({ include: { bonus: true }, orderBy: { id: "desc" } }));
  app.post("/promo-codes", async (req) => db.promoCode.create({ data: req.body as any }));
  app.patch("/promo-codes/:id", async (req) => db.promoCode.update({ where: { id: Number((req.params as any).id) }, data: req.body as any }));

  // ---------- CMS ----------
  for (const [path, model] of [["banners", db.cmsBanner], ["promotions", db.cmsPromotion], ["pages", db.cmsPage]] as const) {
    const m = model as any;
    app.get(`/cms/${path}`, async () => m.findMany({ orderBy: [{ id: "desc" }] }));
    app.post(`/cms/${path}`, async (req) => m.create({ data: req.body }));
    app.patch(`/cms/${path}/:id`, async (req) => m.update({ where: { id: Number((req.params as any).id) }, data: req.body }));
    app.delete(`/cms/${path}/:id`, async (req) => m.delete({ where: { id: Number((req.params as any).id) } }));
  }
  app.get("/cms/settings/:key", async (req) => db.cmsSetting.findUnique({ where: { key: (req.params as any).key } }));
  app.put("/cms/settings/:key", async (req) => {
    const key = (req.params as any).key;
    return db.cmsSetting.upsert({ where: { key }, update: { value: req.body as any }, create: { key, value: req.body as any } });
  });
}
