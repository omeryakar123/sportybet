import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../index.js";
import { resolveSite } from "../services/sites.js";
import {
  ChatError, postMessage, listMessages, deletedSince, startRain, joinRain, sendTip, publicProfile, onlineCount, touchOnline,
  getChatConfig, setChatConfig, muteState, publicName,
} from "../services/chat.js";

type PlayerJwt = { playerId: number; kind: "player" };
const optPlayer = async (req: FastifyRequest) => {
  try { await req.jwtVerify(); const u = req.user as PlayerJwt; return u.kind === "player" ? u.playerId : null; } catch { return null; }
};
const needPlayer = async (req: FastifyRequest, reply: FastifyReply) => {
  const id = await optPlayer(req); if (!id) { reply.code(401).send({ error: "UNAUTHORIZED" }); return null; } return id;
};
const send = (reply: FastifyReply, e: any) => {
  if (e instanceof ChatError) return reply.code(400).send({ error: e.message, detail: e.detail });
  throw e;
};

// ---------- site ----------
export async function chatSiteRoutes(app: FastifyInstance) {
  app.get("/chat", async (req) => {
    const q = z.object({ room: z.string().max(10).default("tr"), after: z.coerce.number().optional() }).parse(req.query);
    const site = await resolveSite(db, req);
    const pid = await optPlayer(req);
    touchOnline(site.id, pid ? `p${pid}` : `ip${req.ip}`);
    const [messages, rain, me] = await Promise.all([
      listMessages(db, site.id, q.room, q.after),
      db.chatRain.findFirst({ where: { siteId: site.id, room: q.room, state: "OPEN" }, include: pid ? { entries: { where: { playerId: pid }, select: { id: true } } } : undefined }),
      pid ? db.player.findUnique({ where: { id: pid }, select: { chatBanned: true, chatMutedUntil: true } }) : null,
    ]);
    const deleted = q.after ? await deletedSince(db, site.id, q.room, Math.max(0, q.after - 200)) : [];
    const cfg = await getChatConfig(db, site.id);
    return {
      messages, deleted, online: onlineCount(site.id), enabled: cfg.enabled,
      rain: rain ? { id: rain.id, amount: Number(rain.amount), endsAt: rain.endsAt, joined: (rain as any).entries?.length > 0, count: rain.joinCount, host: rain.hostPlayerId ? null : "Kasa" } : null,
      me: me ? muteState(me) : null,
      limits: { maxLen: cfg.maxLen, rainMin: cfg.rain.minAmount, rainMax: cfg.rain.maxAmount, tipMin: cfg.tip.minAmount, tipMax: cfg.tip.maxAmount, rainEnabled: cfg.rain.enabled, tipEnabled: cfg.tip.enabled },
    };
  });
  app.post("/chat", async (req, reply) => {
    const pid = await needPlayer(req, reply); if (!pid) return;
    const b = z.object({ text: z.string().min(1).max(500), room: z.string().max(10).default("tr") }).parse(req.body);
    try { const m = await postMessage(db, pid, b.text, b.room); return { id: m.id }; } catch (e) { return send(reply, e); }
  });
  app.post("/chat/rain", async (req, reply) => {
    const pid = await needPlayer(req, reply); if (!pid) return;
    const b = z.object({ amount: z.number().positive(), room: z.string().max(10).default("tr") }).parse(req.body);
    const p = await db.player.findUniqueOrThrow({ where: { id: pid }, select: { siteId: true } });
    try { const r = await startRain(db, { siteId: p.siteId, room: b.room, playerId: pid, amount: b.amount }); return { id: r.id, endsAt: r.endsAt }; } catch (e) { return send(reply, e); }
  });
  app.post("/chat/rain/:id/join", async (req, reply) => {
    const pid = await needPlayer(req, reply); if (!pid) return;
    try { return await joinRain(db, pid, Number((req.params as any).id)); } catch (e) { return send(reply, e); }
  });
  app.post("/tip", async (req, reply) => {
    const pid = await needPlayer(req, reply); if (!pid) return;
    const b = z.object({ username: z.string().min(2).max(60), amount: z.number().positive(), announce: z.boolean().default(true) }).parse(req.body);
    try { return await sendTip(db, pid, b.username, b.amount, b.announce); } catch (e) { return send(reply, e); }
  });
  app.get("/profile/:id", async (req, reply) => {
    const site = await resolveSite(db, req);
    const p = await publicProfile(db, site.id, Number((req.params as any).id));
    if (!p) return reply.code(404).send({ error: "NOT_FOUND" });
    return p;
  });
}

// ---------- backoffice: moderasyon ----------
export async function chatAdminRoutes(app: FastifyInstance, opts: { sid: (req: FastifyRequest) => Promise<number>; adminId: (req: FastifyRequest) => number; audit: (req: FastifyRequest, a: string, t: string, p?: unknown) => Promise<unknown> }) {
  const { sid, adminId, audit } = opts;
  app.get("/chat/messages", async (req) => {
    const q = z.object({ q: z.string().optional(), playerId: z.coerce.number().optional(), deleted: z.string().optional(), take: z.coerce.number().max(500).default(200) }).parse(req.query);
    const rows = await db.chatMessage.findMany({
      where: { siteId: await sid(req), ...(q.playerId ? { playerId: q.playerId } : {}), ...(q.q ? { text: { contains: q.q, mode: "insensitive" } } : {}), ...(q.deleted === "true" ? { deleted: true } : q.deleted === "false" ? { deleted: false } : {}) },
      orderBy: { id: "desc" }, take: q.take,
    });
    const ids = [...new Set(rows.map((r) => r.playerId).filter((x): x is number => x != null))];
    const ps = await db.player.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, chatBanned: true, chatMutedUntil: true, chatStrikes: true } });
    const pm = new Map(ps.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, player: r.playerId ? pm.get(r.playerId) ?? null : null }));
  });
  app.get("/chat/violations", async (req) => {
    const q = z.object({ playerId: z.coerce.number().optional(), take: z.coerce.number().max(500).default(200) }).parse(req.query);
    const rows = await db.chatViolation.findMany({ where: { siteId: await sid(req), ...(q.playerId ? { playerId: q.playerId } : {}) }, orderBy: { id: "desc" }, take: q.take });
    const ps = await db.player.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.playerId))] } }, select: { id: true, username: true, chatBanned: true, chatMutedUntil: true, chatStrikes: true } });
    const pm = new Map(ps.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, player: pm.get(r.playerId) ?? null }));
  });
  app.post("/chat/messages/:id/delete", async (req) => {
    const id = Number((req.params as any).id);
    const m = await db.chatMessage.update({ where: { id }, data: { deleted: true, deletedBy: adminId(req) } });
    await audit(req, "CHAT_DELETE", `chat:${id}`, { text: m.text });
    return { ok: true };
  });
  // susturma / men / ceza sıfırlama
  app.post("/chat/players/:id", async (req) => {
    const id = Number((req.params as any).id);
    const b = z.object({ muteMinutes: z.number().int().min(0).max(525600).optional(), ban: z.boolean().optional(), resetStrikes: z.boolean().optional(), reason: z.string().max(200).optional() }).parse(req.body);
    const data: any = {};
    if (b.muteMinutes !== undefined) data.chatMutedUntil = b.muteMinutes ? new Date(Date.now() + b.muteMinutes * 60_000) : null;
    if (b.ban !== undefined) data.chatBanned = b.ban;
    if (b.resetStrikes) data.chatStrikes = 0;
    const p = await db.player.update({ where: { id }, data, select: { id: true, chatBanned: true, chatMutedUntil: true, chatStrikes: true } });
    await audit(req, "CHAT_MODERATE", `player:${id}`, b);
    return p;
  });
  app.post("/chat/rain", async (req, reply) => {
    const b = z.object({ amount: z.number().positive().max(1_000_000), durationSec: z.number().int().min(20).max(300).optional(), room: z.string().default("tr") }).parse(req.body);
    try { const r = await startRain(db, { siteId: await sid(req), room: b.room, adminId: adminId(req), amount: b.amount, durationSec: b.durationSec }); await audit(req, "CHAT_RAIN", `rain:${r.id}`, b); return r; }
    catch (e) { return send(reply, e); }
  });
  app.get("/chat/rains", async (req) => {
    const rows = await db.chatRain.findMany({ where: { siteId: await sid(req) }, orderBy: { id: "desc" }, take: 100, include: { entries: { select: { playerId: true, amount: true } } } });
    const ids = [...new Set(rows.flatMap((r) => [r.hostPlayerId, ...r.entries.map((e) => e.playerId)]).filter((x): x is number => x != null))];
    const ps = await db.player.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
    const pm = new Map(ps.map((p) => [p.id, p.username]));
    return rows.map((r) => ({ ...r, host: r.hostPlayerId ? pm.get(r.hostPlayerId) : "Kasa", entries: r.entries.map((e) => ({ ...e, username: pm.get(e.playerId) })) }));
  });
  app.post("/chat/system", async (req) => {
    const b = z.object({ text: z.string().min(1).max(300), room: z.string().default("tr") }).parse(req.body);
    const m = await db.chatMessage.create({ data: { siteId: await sid(req), room: b.room, kind: "SYSTEM", text: b.text } });
    await audit(req, "CHAT_SYSTEM", `chat:${m.id}`, b);
    return m;
  });
  app.get("/chat/config", async (req) => getChatConfig(db, await sid(req)));
  app.put("/chat/config", async (req, reply) => {
    try { const r = await setChatConfig(db, await sid(req), req.body ?? {}); await audit(req, "CHAT_CONFIG", "chat_config", req.body); return r; } catch (e) { return send(reply, e); }
  });
  app.get("/chat/public-name/:id", async (req) => { const p = await db.player.findUnique({ where: { id: Number((req.params as any).id) }, select: { username: true } }); return { name: p ? publicName(p.username) : null }; });
}
