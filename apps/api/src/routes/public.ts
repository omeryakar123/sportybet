import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../index.js";
import { ensureWallets } from "../services/wallet.js";

type PlayerJwt = { playerId: number; kind: "player" };

export async function publicRoutes(app: FastifyInstance) {
  // ---------- Oyuncu kayıt / giriş ----------
  app.post("/auth/register", async (req, reply) => {
    const b = z.object({ username: z.string().min(3), password: z.string().min(6), email: z.string().email().optional(), phone: z.string().optional() }).parse(req.body);
    if (await db.player.findUnique({ where: { username: b.username } })) return reply.code(409).send({ error: "USERNAME_TAKEN" });
    const p = await db.player.create({ data: { username: b.username, email: b.email, phone: b.phone, passwordHash: await bcrypt.hash(b.password, 10) } });
    await ensureWallets(db, p.id);
    return { token: app.jwt.sign({ playerId: p.id, kind: "player" } satisfies PlayerJwt, { expiresIn: "7d" }) };
  });

  app.post("/auth/login", async (req, reply) => {
    const b = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const p = await db.player.findUnique({ where: { username: b.username } });
    if (!p || !(await bcrypt.compare(b.password, p.passwordHash))) return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    if (p.status !== "OPEN") return reply.code(403).send({ error: "ACCOUNT_" + p.status });
    await db.player.update({ where: { id: p.id }, data: { lastLoginAt: new Date(), lastLoginIp: req.ip } });
    await db.loginLog.create({ data: { playerId: p.id, ip: req.ip, userAgent: req.headers["user-agent"] } });
    return { token: app.jwt.sign({ playerId: p.id, kind: "player" } satisfies PlayerJwt, { expiresIn: "7d" }) };
  });

  app.get("/me", async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: "UNAUTHORIZED" }); }
    const { playerId } = req.user as PlayerJwt;
    const p = await db.player.findUniqueOrThrow({ where: { id: playerId }, include: { wallets: true } });
    const { passwordHash, ...safe } = p;
    return safe;
  });

  // ---------- CMS (sitede gösterilen içerik) ----------
  app.get("/cms/banners", async (req) => {
    const { group, platform = "web", lang = "tr" } = req.query as Record<string, string>;
    const now = new Date();
    return db.cmsBanner.findMany({
      where: {
        isPublished: true, language: lang, platform, ...(group ? { group } : {}),
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { sortOrder: "asc" },
    });
  });
  app.get("/cms/promotions", async () => db.cmsPromotion.findMany({ where: { isPublished: true }, orderBy: { sortOrder: "asc" } }));
  app.get("/cms/promotions/:slug", async (req) => db.cmsPromotion.findUnique({ where: { slug: (req.params as any).slug } }));
  app.get("/cms/pages/:slug", async (req) => db.cmsPage.findUnique({ where: { slug: (req.params as any).slug } }));
  app.get("/cms/settings/:key", async (req) => (await db.cmsSetting.findUnique({ where: { key: (req.params as any).key } }))?.value ?? null);
}
