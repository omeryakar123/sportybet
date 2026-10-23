import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { WalletType } from "@prisma/client";
import { db } from "../index.js";
import { getConfig, setConfig, listEvents, listLeagues, serializeEvent, placeBet, syncFixtures, syncOdds, syncResults, settleEvent, SbError } from "../services/sb.js";
import { feed, feedConfigured, feedUsage } from "../services/feed.js";

// ---------- Oyuncu / site tarafı ----------
export async function sbSiteRoutes(app: FastifyInstance) {
  app.get("/sb/leagues", async () => listLeagues(db));
  app.get("/sb/events", async (req) => {
    const q = z.object({ league: z.coerce.number().optional(), limit: z.coerce.number().max(200).optional() }).parse(req.query);
    return listEvents(db, { leagueId: q.league, limit: q.limit });
  });
  app.get("/sb/event/:id", async (req, reply) => {
    const ev = await db.sbEvent.findUnique({ where: { id: Number((req.params as any).id) }, include: { markets: { where: { isOpen: true }, include: { selections: true } } } });
    if (!ev) return reply.code(404).send({ error: "NOT_FOUND" });
    return serializeEvent(ev);
  });

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: "UNAUTHORIZED" }); return null; }
    const u = req.user as { playerId: number; kind: string };
    if (u.kind !== "player") { reply.code(401).send({ error: "UNAUTHORIZED" }); return null; }
    return u.playerId;
  };

  app.post("/sb/bet", async (req, reply) => {
    const pid = await auth(req, reply); if (!pid) return;
    const b = z.object({ selectionIds: z.array(z.number()).min(1), stake: z.number().positive(), mode: z.enum(["combo", "single"]).optional(), wallet: z.nativeEnum(WalletType).optional() }).parse(req.body);
    try { return await placeBet(db, pid, b); }
    catch (e: any) { if (e instanceof SbError) return reply.code(400).send({ error: e.message }); throw e; }
  });

  app.get("/sb/my-bets", async (req, reply) => {
    const pid = await auth(req, reply); if (!pid) return;
    return db.bet.findMany({ where: { playerId: pid, selections: { some: { sbSelectionId: { not: null } } } }, include: { selections: true }, orderBy: { id: "desc" }, take: 100 });
  });
}

// ---------- Backoffice: Trading ----------
export async function sbAdminRoutes(app: FastifyInstance) {
  app.get("/sb/status", async () => {
    const cfg = await getConfig(db);
    let feedStatus: any = null;
    if (feedConfigured()) feedStatus = await feed.status().then((r: any) => r).catch((e: any) => ({ error: e.message, detail: e.detail }));
    return { configured: feedConfigured(), usage: feedUsage(), config: cfg, feed: feedStatus };
  });
  app.get("/sb/config", async () => getConfig(db));
  app.put("/sb/config", async (req) => {
    const b = z.object({
      enabled: z.boolean().optional(), marginPct: z.number().min(0).max(50).optional(),
      maxStake: z.number().positive().optional(), maxWin: z.number().positive().optional(),
      maxSelections: z.number().int().min(1).max(30).optional(), syncDays: z.number().int().min(1).max(7).optional(),
      leagues: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
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
      include: { markets: { include: { selections: true } }, _count: { select: { markets: true } } },
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
    const b = z.object({ home: z.number().int().min(0), away: z.number().int().min(0), void: z.boolean().optional() }).parse(req.body);
    await settleEvent(db, Number((req.params as any).id), b.home, b.away, !!b.void);
    return { ok: true };
  });
  // manuel senkron tetikleyicileri
  app.post("/sb/sync", async () => ({ fixtures: await syncFixtures(db), odds: await syncOdds(db) }));
  app.post("/sb/sync-results", async () => syncResults(db));
}
