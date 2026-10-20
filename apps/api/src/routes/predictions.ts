import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../index.js";
import { BizError } from "../services/payments.js";
import {
  buy, sell, sellQuote, resolveMarket, cancelMarket, marketRisk, serializeMarket, predictionSettings, importFeed, syncFeed, fpmmInit, fpmmPrices,
} from "../services/predictions.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const include = { outcomes: { orderBy: { sortOrder: "asc" as const } }, categories: { include: { category: true } } };

// =====================================================================
// SİTE — /api/predictions...
// =====================================================================
export async function predictionSiteRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ success: false, error: "VALIDATION_ERROR", detail: err.flatten() });
    if (err instanceof BizError || /^[A-Z_]+$/.test(err.message)) return reply.code(400).send({ success: false, error: err.message });
    if (err?.code === "P2025") return reply.code(404).send({ success: false, error: "NOT_FOUND" });
    app.log.error(err);
    return reply.code(500).send({ success: false, error: "INTERNAL_ERROR" });
  });
  const optionalPlayer = async (req: FastifyRequest) => { try { await req.jwtVerify(); const u: any = req.user; return u.kind === "player" ? (u.playerId as number) : null; } catch { return null; } };
  const requirePlayer = async (req: FastifyRequest) => { const id = await optionalPlayer(req); if (!id) throw new BizError("UNAUTHORIZED"); return id; };

  app.get("/prediction-categories", async () => {
    const cats = await db.predictionCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const counts = await db.predictionMarketCategory.groupBy({ by: ["categoryId"], where: { market: { status: { in: ["active", "locked"] }, structure: { not: "GROUP_CHILD" } } }, _count: true });
    return { success: true, data: cats.map((c) => ({ ...c, activeCount: counts.find((x) => x.categoryId === c.id)?._count ?? 0 })) };
  });

  // Liste — örnek feed formatı: { success, data, pagination, site }
  app.get("/predictions", async (req) => {
    const q = z.object({
      category: z.string().optional(), status: z.string().default("active,locked"), homepage: z.string().optional(), search: z.string().optional(),
      sort: z.enum(["default", "volume", "deadline", "new"]).default("default"), saved: z.string().optional(),
      page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const pid = await optionalPlayer(req);
    const where: Prisma.PredictionMarketWhereInput = {
      structure: { not: "GROUP_CHILD" }, status: { in: q.status.split(",") },
      ...(q.category ? { categories: { some: { category: { slug: q.category } } } } : {}),
      ...(q.homepage === "true" ? { isHomepage: true } : {}),
      ...(q.search ? { question: { contains: q.search, mode: "insensitive" } } : {}),
      ...(q.saved === "true" && pid ? { saves: { some: { playerId: pid } } } : {}),
    };
    const orderBy: Prisma.PredictionMarketOrderByWithRelationInput[] =
      q.sort === "volume" ? [{ totalVolume: "desc" }] : q.sort === "deadline" ? [{ deadline: "asc" }] : q.sort === "new" ? [{ createdAt: "desc" }] : [{ sortOrder: "desc" }, { createdAt: "desc" }];
    const [items, total, settings] = await Promise.all([
      db.predictionMarket.findMany({ where, include, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }),
      db.predictionMarket.count({ where }), predictionSettings(db),
    ]);
    const ids = items.map((m) => m.id);
    const [subs, saves] = await Promise.all([
      db.predictionMarket.findMany({ where: { parentMarketId: { in: ids }, status: { not: "draft" } }, include, orderBy: { sortOrder: "asc" } }),
      pid ? db.predictionSave.findMany({ where: { playerId: pid, marketId: { in: ids } } }) : Promise.resolve([]),
    ]);
    return {
      success: true,
      data: items.map((m) => serializeMarket(m, settings.tradingMode, {
        isSaved: saves.some((s) => s.marketId === m.id),
        subMarkets: m.structure === "GROUP_PARENT" ? subs.filter((s) => s.parentMarketId === m.id).map((s) => serializeMarket(s, settings.tradingMode)) : undefined,
      })),
      pagination: { total, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
      site: { tradingMode: settings.tradingMode, notice: settings.notice },
    };
  });

  app.get("/predictions/leaderboard", async (req) => {
    const { days } = z.object({ days: z.coerce.number().min(1).max(365).default(7) }).parse(req.query);
    const rows = await db.$queryRaw<any[]>`
      SELECT p.username, pp."playerId", SUM(pp.payout) - SUM(pp.stake) AS profit, SUM(pp.stake) AS volume, COUNT(*) AS positions,
             COUNT(*) FILTER (WHERE pp.status = 'WON') AS wins
      FROM "PredictionPosition" pp JOIN "Player" p ON p.id = pp."playerId"
      WHERE pp.status IN ('WON','LOST','SOLD') AND pp."closedAt" >= NOW() - (${days}::int * INTERVAL '1 day') AND p."isTest" = false
      GROUP BY 1,2 ORDER BY profit DESC LIMIT 50`;
    const mask = (u: string) => (u.length <= 3 ? u[0] + "**" : u.slice(0, 2) + "*".repeat(Math.max(1, u.length - 4)) + u.slice(-2));
    return { success: true, data: rows.map((r, i) => ({ rank: i + 1, username: mask(r.username), profit: Number(r.profit), volume: Number(r.volume), positions: Number(r.positions), wins: Number(r.wins) })) };
  });

  app.get("/predictions/:slug", async (req) => {
    const slug = (req.params as any).slug as string;
    const m = await db.predictionMarket.findFirst({ where: { OR: [{ slug }, { id: slug }], status: { not: "draft" } }, include });
    if (!m) throw new BizError("NOT_FOUND");
    const settings = await predictionSettings(db);
    const pid = await optionalPlayer(req);
    const subs = m.structure === "GROUP_PARENT" ? await db.predictionMarket.findMany({ where: { parentMarketId: m.id, status: { not: "draft" } }, include, orderBy: { sortOrder: "asc" } }) : [];
    const saved = pid ? await db.predictionSave.findUnique({ where: { playerId_marketId: { playerId: pid, marketId: m.id } } }) : null;
    const myPositions = pid ? await db.predictionPosition.findMany({ where: { playerId: pid, marketId: { in: [m.id, ...subs.map((s) => s.id)] } }, orderBy: { id: "desc" } }) : [];
    return {
      success: true,
      data: { ...serializeMarket(m, settings.tradingMode, { isSaved: Boolean(saved), subMarkets: subs.length ? subs.map((s) => serializeMarket(s, settings.tradingMode)) : undefined }), myPositions },
      site: { tradingMode: settings.tradingMode, notice: settings.notice },
    };
  });

  app.post("/predictions/:id/buy", async (req) => {
    const pid = await requirePlayer(req);
    const b = z.object({ outcomeId: z.string(), amount: z.number().positive() }).parse(req.body);
    const r = await buy(db, pid, (req.params as any).id, b.outcomeId, b.amount);
    return { success: true, data: { positionId: r.position.id.toString(), shares: Number(r.position.shares), price: Number(r.position.price), potentialPayout: r.potentialPayout } };
  });
  app.get("/predictions/positions/:id/quote", async (req) => {
    const pid = await requirePlayer(req);
    const q = await sellQuote(db, BigInt((req.params as any).id));
    if (q.pos.playerId !== pid) throw new BizError("NOT_FOUND");
    return { success: true, data: { amount: q.amount, stake: Number(q.pos.stake), shares: Number(q.pos.shares) } };
  });
  app.post("/predictions/positions/:id/sell", async (req) => {
    const pid = await requirePlayer(req);
    const r = await sell(db, pid, BigInt((req.params as any).id));
    return { success: true, data: { payout: Number(r.payout), status: r.status } };
  });
  app.post("/predictions/:id/save", async (req) => {
    const pid = await requirePlayer(req);
    const marketId = (req.params as any).id;
    const ex = await db.predictionSave.findUnique({ where: { playerId_marketId: { playerId: pid, marketId } } });
    if (ex) await db.predictionSave.delete({ where: { playerId_marketId: { playerId: pid, marketId } } });
    else await db.predictionSave.create({ data: { playerId: pid, marketId } });
    return { success: true, data: { isSaved: !ex } };
  });
  app.get("/me/predictions", async (req) => {
    const pid = await requirePlayer(req);
    const { status } = z.object({ status: z.string().optional() }).parse(req.query);
    const rows = await db.predictionPosition.findMany({
      where: { playerId: pid, ...(status ? { status: { in: status.split(",") } } : {}) },
      include: { market: { select: { id: true, slug: true, question: true, status: true, deadline: true, image: true, resolvedOutcomeId: true } }, outcome: { select: { name: true, price: true } } },
      orderBy: { id: "desc" }, take: 200,
    });
    return { success: true, data: rows.map((r) => ({ ...r, currentPrice: Number(r.outcome.price), currentValue: r.status === "OPEN" ? Number(r.shares) * Number(r.outcome.price) : null })) };
  });
}

// =====================================================================
// ADMIN — /admin/predictions... (adminRoutes içinde register edilir → yetki kancaları geçerli)
// =====================================================================
const outcomeIn = z.object({ id: z.string().optional(), name: z.string().min(1), price: z.coerce.number().min(0.01).max(0.99), color: z.string().nullable().optional(), image: z.string().nullable().optional(), buyEnabled: z.boolean().default(true), sellEnabled: z.boolean().default(true) });
const marketIn = z.object({
  question: z.string().min(3), slug: z.string().optional(), structure: z.enum(["STANDALONE", "GROUP_PARENT", "GROUP_CHILD"]).default("STANDALONE"),
  parentMarketId: z.string().nullable().optional(), oddsImpactMode: z.enum(["NO_IMPACT", "AFFECTS_ODDS"]).default("NO_IMPACT"),
  isHomepage: z.boolean().default(false), sortOrder: z.coerce.number().default(0), buyEnabled: z.boolean().default(true), sellEnabled: z.boolean().default(true),
  image: z.string().nullable().optional(), rules: z.string().nullable().optional(),
  deadline: z.preprocess((v) => (v ? new Date(v as string) : null), z.date().nullable()).optional(),
  minStake: z.coerce.number().min(1).default(10), maxStake: z.coerce.number().min(1).default(5000), feePct: z.coerce.number().min(0).max(20).default(0),
  liquidity: z.coerce.number().min(100).default(10000), externalMatchId: z.string().nullable().optional(),
  categoryIds: z.array(z.string()).default([]), outcomes: z.array(outcomeIn).min(2),
});
const slugify = (s: string) => s.toLowerCase().replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export async function predictionAdminRoutes(app: FastifyInstance) {
  const adminId = (req: FastifyRequest) => ((req as any).admin as { id: number }).id;
  const audit = (req: FastifyRequest, action: string, target: string, payload?: unknown) => db.auditLog.create({ data: { adminId: adminId(req), action, target, payload: (payload ?? {}) as any } });

  app.get("/predictions", async (req) => {
    const q = z.object({ status: z.string().optional(), category: z.string().optional(), search: z.string().optional(), structure: z.string().optional(), source: z.string().optional() }).parse(req.query);
    const where: Prisma.PredictionMarketWhereInput = {
      ...(q.status ? { status: { in: q.status.split(",") } } : {}), ...(q.structure ? { structure: q.structure } : { structure: { not: "GROUP_CHILD" } }),
      ...(q.category ? { categories: { some: { categoryId: q.category } } } : {}), ...(q.source ? { source: q.source } : {}),
      ...(q.search ? { question: { contains: q.search, mode: "insensitive" } } : {}),
    };
    const list = await db.predictionMarket.findMany({ where, include: { ...include, _count: { select: { positions: true } } }, orderBy: [{ createdAt: "desc" }], take: 1000 });
    const open = await db.predictionPosition.groupBy({ by: ["marketId"], where: { status: "OPEN", marketId: { in: list.map((m) => m.id) } }, _sum: { stake: true } });
    const childCounts = await db.predictionMarket.groupBy({ by: ["parentMarketId"], where: { parentMarketId: { in: list.map((m) => m.id) } }, _count: true });
    return list.map((m) => ({ ...m, positionCount: m._count.positions, openStake: Number(open.find((o) => o.marketId === m.id)?._sum.stake ?? 0), childCount: childCounts.find((c) => c.parentMarketId === m.id)?._count ?? 0 }));
  });

  app.get("/predictions/:id", async (req) => {
    const id = (req.params as any).id;
    const m = await db.predictionMarket.findUniqueOrThrow({ where: { id }, include });
    const children = await db.predictionMarket.findMany({ where: { parentMarketId: id }, include, orderBy: { sortOrder: "asc" } });
    return { ...m, children, risk: await marketRisk(db, id) };
  });
  app.get("/predictions/:id/positions", async (req) => db.predictionPosition.findMany({
    where: { marketId: (req.params as any).id }, include: { player: { select: { username: true } }, outcome: { select: { name: true } } }, orderBy: { id: "desc" }, take: 1000,
  }));

  async function saveMarket(id: string | null, body: unknown) {
    const b = marketIn.parse(body);
    const { outcomes, categoryIds, liquidity, ...rest } = b;
    const slugBase = b.slug ? slugify(b.slug) : slugify(b.question);
    return db.$transaction(async (tx) => {
      let slug = slugBase || "market"; let n = 1;
      while (true) { const ex = await tx.predictionMarket.findUnique({ where: { slug } }); if (!ex || ex.id === id) break; slug = `${slugBase}-${++n}`; }
      const data = { ...rest, slug, liquidity: D(liquidity), minStake: D(b.minStake), maxStake: D(b.maxStake), feePct: D(b.feePct) };
      const m = id ? await tx.predictionMarket.update({ where: { id }, data }) : await tx.predictionMarket.create({ data });
      const hasPositions = id ? (await tx.predictionPosition.count({ where: { marketId: m.id } })) > 0 : false;
      const existing = await tx.predictionOutcome.findMany({ where: { marketId: m.id } });
      // pozisyon varken sonuç silinemez/eklenemez; sadece fiyat/isim/aç-kapa güncellenir
      if (hasPositions && (outcomes.some((o) => !o.id) || existing.some((e) => !outcomes.find((o) => o.id === e.id)))) throw new BizError("OUTCOMES_LOCKED_HAS_POSITIONS");
      for (const e of existing) if (!outcomes.find((o) => o.id === e.id)) await tx.predictionOutcome.delete({ where: { id: e.id } });
      const reserves = b.oddsImpactMode === "AFFECTS_ODDS" && !hasPositions ? fpmmInit(outcomes.map((o) => o.price), liquidity) : null;
      const prices = reserves ? fpmmPrices(reserves) : null;
      for (let k = 0; k < outcomes.length; k++) {
        const o = outcomes[k];
        const base = { name: o.name, color: o.color ?? null, image: o.image ?? null, buyEnabled: o.buyEnabled, sellEnabled: o.sellEnabled, sortOrder: k };
        const price: Prisma.Decimal | undefined = b.oddsImpactMode === "NO_IMPACT" ? D(o.price.toFixed(4)) : reserves ? D(prices![k].toFixed(4)) : undefined;
        const reserve: Prisma.Decimal | undefined = reserves ? D(reserves[k].toFixed(10)) : undefined;
        if (o.id && existing.find((e) => e.id === o.id)) await tx.predictionOutcome.update({ where: { id: o.id }, data: { ...base, ...(price ? { price } : {}), ...(reserve ? { reserve } : {}) } });
        else await tx.predictionOutcome.create({ data: { ...base, marketId: m.id, price: price ?? D(o.price.toFixed(4)), ...(reserve ? { reserve } : {}) } });
      }
      await tx.predictionMarketCategory.deleteMany({ where: { marketId: m.id } });
      if (categoryIds.length) await tx.predictionMarketCategory.createMany({ data: categoryIds.map((categoryId) => ({ marketId: m.id, categoryId })) });
      return m;
    });
  }
  app.post("/predictions", async (req) => { const m = await saveMarket(null, req.body); await audit(req, "PREDICTION_CREATE", `prediction:${m.id}`, { question: m.question }); return m; });
  app.put("/predictions/:id", async (req) => { const m = await saveMarket((req.params as any).id, req.body); await audit(req, "PREDICTION_UPDATE", `prediction:${m.id}`); return m; });

  // Hızlı aksiyonlar: aç, kilitle, kapat, alım/satım aç-kapa, ana sayfa, fiyat güncelle
  app.post("/predictions/:id/action", async (req) => {
    const id = (req.params as any).id;
    const b = z.object({
      action: z.enum(["activate", "lock", "unlock", "close", "draft", "toggleBuy", "toggleSell", "toggleHomepage", "resolve", "cancel", "prices"]),
      reason: z.string().optional(), outcomeId: z.string().optional(), prices: z.record(z.coerce.number().min(0.01).max(0.99)).optional(),
    }).parse(req.body);
    const m = await db.predictionMarket.findUniqueOrThrow({ where: { id } });
    const settled = ["resolved", "cancelled"].includes(m.status);
    let result: any = { ok: true };
    switch (b.action) {
      case "activate": case "unlock":
        if (settled) throw new BizError("ALREADY_SETTLED");
        await db.predictionMarket.update({ where: { id }, data: { status: "active", activatedAt: m.activatedAt ?? new Date(), metadata: { ...((m.metadata as any) ?? {}), lockReason: null } } }); break;
      case "lock":
        if (settled) throw new BizError("ALREADY_SETTLED");
        await db.predictionMarket.update({ where: { id }, data: { status: "locked", metadata: { ...((m.metadata as any) ?? {}), lockedAt: new Date().toISOString(), lockedBy: `admin#${adminId(req)}`, lockReason: b.reason ?? null } } }); break;
      case "close": if (settled) throw new BizError("ALREADY_SETTLED"); await db.predictionMarket.update({ where: { id }, data: { status: "closed" } }); break;
      case "draft": if (settled) throw new BizError("ALREADY_SETTLED"); await db.predictionMarket.update({ where: { id }, data: { status: "draft" } }); break;
      case "toggleBuy": await db.predictionMarket.update({ where: { id }, data: { buyEnabled: !m.buyEnabled } }); break;
      case "toggleSell": await db.predictionMarket.update({ where: { id }, data: { sellEnabled: !m.sellEnabled } }); break;
      case "toggleHomepage": await db.predictionMarket.update({ where: { id }, data: { isHomepage: !m.isHomepage } }); break;
      case "resolve": if (!b.outcomeId) throw new BizError("OUTCOME_REQUIRED"); result = await resolveMarket(db, id, b.outcomeId, adminId(req)); break;
      case "cancel": result = await cancelMarket(db, id, adminId(req)); break;
      case "prices":
        if (m.oddsImpactMode !== "NO_IMPACT") throw new BizError("PRICES_ONLY_FOR_NO_IMPACT");
        for (const [oid, p] of Object.entries(b.prices ?? {})) await db.predictionOutcome.update({ where: { id: oid }, data: { price: D(p.toFixed(4)) } });
        break;
    }
    await audit(req, `PREDICTION_${b.action.toUpperCase()}`, `prediction:${id}`, b);
    return result;
  });
  app.post("/predictions/outcomes/:id/toggle", async (req) => {
    const { field } = z.object({ field: z.enum(["buyEnabled", "sellEnabled"]) }).parse(req.body);
    const o = await db.predictionOutcome.findUniqueOrThrow({ where: { id: (req.params as any).id } });
    return db.predictionOutcome.update({ where: { id: o.id }, data: { [field]: !o[field] } });
  });

  // Kategoriler
  app.get("/prediction-categories", async () => db.predictionCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { markets: true } } } }));
  const catIn = z.object({ name: z.string().min(1), slug: z.string().optional(), description: z.string().nullable().optional(), icon: z.string().nullable().optional(), parentId: z.string().nullable().optional(), sortOrder: z.coerce.number().default(0), isActive: z.boolean().default(true) });
  app.post("/prediction-categories", async (req) => { const b = catIn.parse(req.body); return db.predictionCategory.create({ data: { ...b, slug: slugify(b.slug || b.name) } }); });
  app.patch("/prediction-categories/:id", async (req) => { const b = catIn.partial().parse(req.body); return db.predictionCategory.update({ where: { id: (req.params as any).id }, data: { ...b, ...(b.slug ? { slug: slugify(b.slug) } : {}) } }); });

  // Tüm pozisyonlar + özet
  app.get("/prediction-positions", async (req) => {
    const q = z.object({ status: z.string().optional(), playerId: z.coerce.number().optional(), from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    return db.predictionPosition.findMany({
      where: { ...(q.status ? { status: { in: q.status.split(",") } } : {}), ...(q.playerId ? { playerId: q.playerId } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}) },
      include: { player: { select: { username: true } }, market: { select: { question: true, slug: true } }, outcome: { select: { name: true } } }, orderBy: { id: "desc" }, take: 1000,
    });
  });
  app.get("/prediction-stats", async () => {
    const [byStatus, markets, settings] = await Promise.all([
      db.predictionPosition.groupBy({ by: ["status"], _sum: { stake: true, payout: true }, _count: true }),
      db.predictionMarket.groupBy({ by: ["status"], where: { structure: { not: "GROUP_CHILD" } }, _count: true }),
      predictionSettings(db),
    ]);
    return { byStatus, markets, settings };
  });

  // Ayarlar + feed
  app.get("/prediction-settings", async () => ({
    settings: await predictionSettings(db),
    feed: (await db.cmsSetting.findUnique({ where: { key: "prediction_feed" } }))?.value ?? { enabled: false, url: "", autoActivate: false, limit: 50, maxPages: 10 },
  }));
  app.put("/prediction-settings", async (req) => {
    const b = z.object({ tradingMode: z.enum(["NORMAL", "PAUSED"]), notice: z.string().nullable().optional(), sellFeePct: z.coerce.number().min(0).max(20).default(0) }).parse(req.body);
    await db.cmsSetting.upsert({ where: { key: "prediction_settings" }, update: { value: b }, create: { key: "prediction_settings", value: b } });
    await audit(req, "PREDICTION_SETTINGS", "prediction_settings", b);
    return b;
  });
  app.put("/prediction-feed", async (req) => {
    const b = z.object({ enabled: z.boolean(), url: z.string().url().or(z.literal("")), apiKey: z.string().optional(), autoActivate: z.boolean().default(false), limit: z.coerce.number().default(50), maxPages: z.coerce.number().default(10) }).parse(req.body);
    const prev: any = (await db.cmsSetting.findUnique({ where: { key: "prediction_feed" } }))?.value ?? {};
    const v = { ...prev, ...b, apiKey: b.apiKey || prev.apiKey };
    await db.cmsSetting.upsert({ where: { key: "prediction_feed" }, update: { value: v }, create: { key: "prediction_feed", value: v } });
    return { ...v, apiKey: v.apiKey ? "••••" : "" };
  });
  app.post("/prediction-feed/sync", async () => syncFeed(db));
  // JSON yapıştırarak içe aktar (feed formatı: {data:[...]} veya [...])
  app.post("/predictions/import", { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const b = z.object({ payload: z.any(), activate: z.boolean().default(false) }).parse(req.body);
    const r = await importFeed(db, typeof b.payload === "string" ? JSON.parse(b.payload) : b.payload, b.activate);
    await audit(req, "PREDICTION_IMPORT", "predictions", { imported: r.imported });
    return r;
  });
}
