import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../index.js";
import { ensureWallets } from "../services/wallet.js";
import { resolveSite } from "../services/sites.js";

type PlayerJwt = { playerId: number; kind: "player" };

export async function publicRoutes(app: FastifyInstance) {
  // ---------- Site bilgisi (hangi siteye bağlıyız?) ----------
  app.get("/site-config", async (req) => {
    const s = await resolveSite(db, req);
    return { id: s.id, code: s.code, name: s.name, domain: s.domain };
  });

  // ---------- Oyuncu kayıt / giriş (kullanıcı adı site içinde benzersiz) ----------
  app.post("/auth/register", async (req, reply) => {
    const site = await resolveSite(db, req);
    const b = z.object({ username: z.string().min(3), password: z.string().min(6), email: z.string().email().optional(), phone: z.string().optional() }).parse(req.body);
    if (await db.player.findFirst({ where: { siteId: site.id, username: b.username } })) return reply.code(409).send({ error: "USERNAME_TAKEN" });
    const p = await db.player.create({ data: { siteId: site.id, username: b.username, email: b.email, phone: b.phone, passwordHash: await bcrypt.hash(b.password, 10) } });
    await ensureWallets(db, p.id);
    return { token: app.jwt.sign({ playerId: p.id, kind: "player" } satisfies PlayerJwt, { expiresIn: "7d" }) };
  });

  app.post("/auth/login", async (req, reply) => {
    const site = await resolveSite(db, req);
    const b = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const p = await db.player.findFirst({ where: { siteId: site.id, username: b.username } });
    if (!p) return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    if (p.wrongLoginAttempts >= 10) return reply.code(403).send({ error: "TOO_MANY_ATTEMPTS" });
    if (!(await bcrypt.compare(b.password, p.passwordHash))) {
      await db.player.update({ where: { id: p.id }, data: { wrongLoginAttempts: { increment: 1 } } });
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }
    if (p.status !== "OPEN") return reply.code(403).send({ error: "ACCOUNT_" + p.status });
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
    await db.player.update({ where: { id: p.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip, wrongLoginAttempts: 0 } });
    await db.loginLog.create({ data: { playerId: p.id, ip, userAgent: req.headers["user-agent"] } });
    return { token: app.jwt.sign({ playerId: p.id, kind: "player" } satisfies PlayerJwt, { expiresIn: "7d" }) };
  });

  app.get("/me", async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: "UNAUTHORIZED" }); }
    const { playerId } = req.user as PlayerJwt;
    const p = await db.player.findUniqueOrThrow({ where: { id: playerId }, include: { wallets: true } });
    const { passwordHash, ...safe } = p;
    return safe;
  });

  // ---------- CMS (sitede gösterilen içerik — site bazlı) ----------
  app.get("/cms/banners", async (req) => {
    const site = await resolveSite(db, req);
    const { group, platform = "web", lang = "tr" } = req.query as Record<string, string>;
    const now = new Date();
    return db.cmsBanner.findMany({
      where: {
        siteId: site.id, isPublished: true, language: lang, platform: { in: [platform, "all"] }, ...(group ? { group } : {}),
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { sortOrder: "asc" },
    });
  });
  app.get("/cms/asset/:id", async (req, reply) => {
    const a = await db.cmsAsset.findUnique({ where: { id: Number((req.params as any).id) || 0 } });
    if (!a) return reply.code(404).send({ error: "NOT_FOUND" });
    return reply.header("Content-Type", a.mime).header("Cache-Control", "public, max-age=31536000, immutable").send(Buffer.from(a.data));
  });
  app.get("/cms/promotions", async (req) => {
    const site = await resolveSite(db, req);
    return db.cmsPromotion.findMany({ where: { siteId: site.id, isPublished: true }, orderBy: { sortOrder: "asc" } });
  });
  app.get("/cms/promotions/:slug", async (req) => {
    const site = await resolveSite(db, req);
    return db.cmsPromotion.findUnique({ where: { siteId_slug: { siteId: site.id, slug: (req.params as any).slug } } });
  });
  app.get("/cms/pages/:slug", async (req) => {
    const site = await resolveSite(db, req);
    return db.cmsPage.findUnique({ where: { siteId_slug: { siteId: site.id, slug: (req.params as any).slug } } });
  });
  app.get("/cms/settings/:key", async (req) => {
    const site = await resolveSite(db, req);
    return (await db.cmsSetting.findUnique({ where: { siteId_key: { siteId: site.id, key: (req.params as any).key } } }))?.value ?? null;
  });
}
