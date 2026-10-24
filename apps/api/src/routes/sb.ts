import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { WalletType } from "@prisma/client";
import { db } from "../index.js";
import { getConfig, setConfig, listEvents, listLive, listLeagues, serializeEvent, placeBet, syncFixtures, syncOdds, syncResults, settleEvent, SbError, MARKET_LIST, SPORT_LIST, syncLive, liveStatus, liveMinInterval } from "../services/sb.js";
import { feed, feedConfigured, feedUsage } from "../services/feed.js";

// ---------- Oyuncu / site tarafı ----------
export async function sbSiteRoutes(app: FastifyInstance) {
  app.get("/sb/leagues", async () => listLeagues(db));
  app.get("/sb/live", async () => listLive(db));
  app.get("/sb/events", async (req) => {
    const q = z.object({ league: z.coerce.number().optional(), limit: z.coerce.number().max(300).optional(), q: z.string().max(60).optional() }).parse(req.query);
    return listEvents(db, { leagueId: q.league, limit: q.limit, q: q.q?.trim() || undefined });
  });
  app.get("/sb/event/:id", async (req, reply) => {
    const ev = await db.sbEvent.findUnique({ where: { id: Number((req.params as any).id) }, include: { markets: { where: { isOpen: true }, include: { selections: true }, orderBy: { sortOrder: "asc" } } } });
    if (!ev) return reply.code(404).send({ error: "NOT_FOUND" });
    return serializeEvent(ev);
  });
  app.get("/sb/limits", async () => { const c = await getConfig(db); return { minStake: c.minStake, maxStake: c.maxStake, maxWin: c.maxWin, maxSelections: c.maxSelections, liveEnabled: c.liveEnabled, liveDelaySec: c.liveDelaySec, liveMaxStake: c.liveMaxStake, liveIntervalSec: c.liveIntervalSec }; });

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: "UNAUTHORIZED" }); return null; }
    const u = req.user as { playerId: number; kind: string };
    if (u.kind !== "player") { reply.code(401).send({ error: "UNAUTHORIZED" }); return null; }
    return u.playerId;
  };

  app.post("/sb/bet", async (req, reply) => {
    const pid = await auth(req, reply); if (!pid) return;
    const b = z.object({
      selectionIds: z.array(z.number()).min(1), stake: z.number().positive(), mode: z.enum(["combo", "single"]).optional(), wallet: z.nativeEnum(WalletType).optional(),
      odds: z.record(z.number()).optional(), acceptOdds: z.enum(["none", "higher", "any"]).optional(),
    }).parse(req.body);
    try { return await placeBet(db, pid, b); }
    catch (e: any) { if (e instanceof SbError) return reply.code(400).send({ error: e.message, detail: e.detail }); throw e; }
  });

  app.get("/sb/my-bets", async (req, reply) => {
    const pid = await auth(req, reply); if (!pid) return;
    return db.bet.findMany({ where: { playerId: pid }, include: { selections: true }, orderBy: { id: "desc" }, take: 100 });
  });
}

// ---------- Backoffice: Trading ----------
export async function sbAdminRoutes(app: FastifyInstance) {
  app.get("/sb/status", async () => {
    const cfg = await getConfig(db);
    let feedStatus: any = null;
    if (feedConfigured()) feedStatus = await feed.status().catch((e: any) => ({ error: e.message, detail: e.detail }));
    return { configured: feedConfigured(), usage: feedUsage(), config: cfg, feed: feedStatus, live: { ...liveStatus(), minIntervalSec: ((x) => (x === null ? null : Number.isFinite(x) ? x : -1))(liveMinInterval()) } };
  });
  // Bonus kural editörü için seçenekler (spor / lig / market)
  app.get("/sb/catalog", async () => {
    const cfg = await getConfig(db);
    const rows = await db.sbEvent.groupBy({ by: ["leagueId", "league", "country"], _count: true });
    const map = new Map<number, { id: number; name: string; country: string | null; count: number }>();
    for (const l of cfg.leagues) map.set(l.id, { id: l.id, name: l.name, country: null, count: 0 });
    for (const r of rows) map.set(r.leagueId, { id: r.leagueId, name: r.league, country: r.country, count: r._count });
    return { sports: SPORT_LIST, markets: MARKET_LIST, leagues: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr")) };
  });
  app.get("/sb/config", async () => getConfig(db));
  app.put("/sb/config", async (req) => {
    const b = z.object({
      enabled: z.boolean().optional(), marginPct: z.number().min(0).max(30).optional(),
      minStake: z.number().min(0).optional(), maxStake: z.number().positive().optional(), maxWin: z.number().positive().optional(),
      maxSelections: z.number().int().min(1).max(30).optional(), syncDays: z.number().int().min(1).max(7).optional(),
      oddsPerRun: z.number().int().min(1).max(50).optional(),
      liveEnabled: z.boolean().optional(), liveMarginPct: z.number().min(0).max(30).optional(),
      liveIntervalSec: z.number().int().min(3).max(600).optional(), liveStaleSec: z.number().int().min(6).max(1800).optional(),
      liveDelaySec: z.number().int().min(0).max(30).optional(), liveMaxStake: z.number().positive().optional(),
      leagues: z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1) })).optional(),
    }).parse(req.body);
    return setConfig(db, b);
  });

  app.get("/sb/events", async (req) => {
    const q = z.object({ status: z.string().optional(), league: z.coerce.number().optional(), settled: z.string().optional(), take: z.coerce.number().max(500).default(200) }).parse(req.query);
    return db.sbEvent.findMany({
      where: {
        ...(q.league ? { leagueId: q.league } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.settled === "true" ? { settledAt: { not: null } } : q.settled === "false" ? { settledAt: null } : {}),
      },
      include: { markets: { include: { selections: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { startsAt: "asc" }, take: q.take,
    });
  });
  app.post("/sb/events/:id/toggle", async (req) => {
    const b = z.object({ isOpen: z.boolean() }).parse(req.body);
    return db.sbEvent.update({ where: { id: Number((req.params as any).id) }, data: { isOpen: b.isOpen } });
  });
  app.post("/sb/events/:id/featured", async (req) => {
    const b = z.object({ featured: z.boolean() }).parse(req.body);
    return db.sbEvent.update({ where: { id: Number((req.params as any).id) }, data: { featured: b.featured } });
  });
  app.post("/sb/markets/:id/toggle", async (req) => {
    const b = z.object({ isOpen: z.boolean() }).parse(req.body);
    return db.sbMarket.update({ where: { id: Number((req.params as any).id) }, data: { isOpen: b.isOpen } });
  });
  // manuel sonuçlandırma (feed gecikirse)
  app.post("/sb/events/:id/settle", async (req) => {
    const b = z.object({ home: z.number().int().min(0).max(99), away: z.number().int().min(0).max(99), htHome: z.number().int().min(0).max(99).nullable().optional(), htAway: z.number().int().min(0).max(99).nullable().optional(), void: z.boolean().optional() })
      .refine((x) => x.htHome == null || x.htAway == null || (x.htHome <= x.home && x.htAway <= x.away), { message: "İlk yarı skoru maç sonu skorundan büyük olamaz" })
      .parse(req.body);
    const ev = await db.sbEvent.findUniqueOrThrow({ where: { id: Number((req.params as any).id) } });
    if (ev.settledAt) throw new SbError("ALREADY_SETTLED");
    await settleEvent(db, ev.id, b.home, b.away, !!b.void, b.htHome ?? null, b.htAway ?? null);
    return { ok: true };
  });
  // manuel senkron tetikleyicileri
  app.post("/sb/sync", async () => ({ fixtures: await syncFixtures(db), odds: await syncOdds(db) }));
  app.post("/sb/sync-results", async () => syncResults(db));
  app.post("/sb/sync-live", async () => syncLive(db));
}
