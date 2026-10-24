import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, TxType, WalletType, PaymentType, PaymentState, AdminRole } from "@prisma/client";
import { db } from "../index.js";
import { grantBonus, cancelBonus } from "../services/bonus.js";
import { move, ensureWallets } from "../services/wallet.js";
import { sbAdminRoutes } from "./sb.js";
import { chatAdminRoutes } from "./chat.js";
import { allSites, bustSiteCache, seedSiteDefaults } from "../services/sites.js";
import { processPayment, reversePayment, correctPayment, reopenPayment, BizError } from "../services/payments.js";
import { dashboard, playerKpis, range, sportsbookDaily, financialReport } from "../services/reports.js";
import { predictionAdminRoutes } from "./predictions.js";
import { seedDemo, purgeDemo } from "../services/demo.js";

type AdminJwt = { adminId: number; role: AdminRole; kind: "admin" };

/**
 * Rol yetkileri — URL önekine göre. SUPERADMIN her şey.
 * Okuma (GET) ve yazma ayrı tutulur: SUPPORT oyuncuları görebilir ama değiştiremez.
 */
const PERMS: Record<string, { read: AdminRole[]; write: AdminRole[] }> = {
  "/admin/users": { read: ["SUPERADMIN"], write: ["SUPERADMIN"] },
  "/admin/chat": { read: ["ADMIN", "SUPPORT", "RISK", "CMS"], write: ["ADMIN", "SUPPORT", "RISK"] },
  "/admin/sites": { read: ["SUPERADMIN", "ADMIN"], write: ["SUPERADMIN"] },
  "/admin/audit-logs": { read: ["SUPERADMIN", "ADMIN"], write: [] },
  "/admin/payment-requests": { read: ["ADMIN", "FINANCE", "RISK"], write: ["ADMIN", "FINANCE"] },
  "/admin/payment-systems": { read: ["ADMIN", "FINANCE"], write: ["ADMIN", "FINANCE"] },
  "/admin/transactions": { read: ["ADMIN", "FINANCE", "RISK"], write: [] },
  "/admin/reports": { read: ["ADMIN", "FINANCE", "RISK"], write: [] },
  "/admin/dashboard": { read: ["ADMIN", "FINANCE", "RISK", "SUPPORT"], write: [] },
  "/admin/players": { read: ["ADMIN", "FINANCE", "RISK", "SUPPORT"], write: ["ADMIN", "RISK"] },
  "/admin/bets": { read: ["ADMIN", "RISK", "SUPPORT", "FINANCE"], write: [] },
  "/admin/sportsbook": { read: ["ADMIN", "RISK", "FINANCE"], write: [] },
  "/admin/sb": { read: ["ADMIN", "RISK", "FINANCE"], write: ["ADMIN", "RISK"] },
  "/admin/wallet-requests": { read: ["ADMIN", "RISK", "FINANCE"], write: [] },
  "/admin/webhook-events": { read: ["ADMIN", "RISK"], write: [] },
  "/admin/bonuses": { read: ["ADMIN", "RISK", "SUPPORT", "FINANCE"], write: ["ADMIN"] },
  "/admin/bonus-requests": { read: ["ADMIN", "RISK", "SUPPORT"], write: ["ADMIN", "RISK"] },
  "/admin/player-bonuses": { read: ["ADMIN", "RISK", "SUPPORT", "FINANCE"], write: ["ADMIN", "RISK"] },
  "/admin/promo-codes": { read: ["ADMIN", "CMS"], write: ["ADMIN"] },
  "/admin/cms": { read: ["ADMIN", "CMS"], write: ["ADMIN", "CMS"] },
  "/admin/predictions": { read: ["ADMIN", "RISK", "CMS", "SUPPORT"], write: ["ADMIN", "RISK"] },
  "/admin/prediction-categories": { read: ["ADMIN", "RISK", "CMS"], write: ["ADMIN", "CMS"] },
  "/admin/prediction-positions": { read: ["ADMIN", "RISK", "SUPPORT", "FINANCE"], write: [] },
  "/admin/prediction-stats": { read: ["ADMIN", "RISK", "FINANCE"], write: [] },
  "/admin/prediction-settings": { read: ["ADMIN", "RISK"], write: ["ADMIN"] },
  "/admin/prediction-feed": { read: ["ADMIN"], write: ["ADMIN"] },
  "/admin/demo": { read: [], write: [] },
};
// Oyuncu alt kaynakları: finans işlemleri ve bonus verme daha sıkı
const PLAYER_WRITE_EXTRA: [RegExp, AdminRole[]][] = [
  [/^\/admin\/players\/\d+\/adjust/, ["ADMIN", "FINANCE"]],
  [/^\/admin\/players\/\d+\/bonuses/, ["ADMIN", "RISK"]],
  [/^\/admin\/players\/\d+\/notes/, ["ADMIN", "RISK", "SUPPORT", "FINANCE"]],
];

function allowed(role: AdminRole, method: string, url: string) {
  if (role === "SUPERADMIN") return true;
  const path = url.split("?")[0];
  if (path === "/admin/me" || path === "/admin/me/password") return true;
  const write = method !== "GET";
  if (write) for (const [re, roles] of PLAYER_WRITE_EXTRA) if (re.test(path)) return roles.includes(role);
  const key = Object.keys(PERMS).find((k) => path === k || path.startsWith(k + "/"));
  if (!key) return role === "ADMIN";
  return (write ? PERMS[key].write : PERMS[key].read).includes(role);
}

const toNum = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : Number(v));
const dateQ = z.object({ from: z.string().optional(), to: z.string().optional() });

export async function adminRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "VALIDATION_ERROR", detail: err.flatten() });
    if (err instanceof BizError) return reply.code(400).send({ error: err.message, detail: err.detail });
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return reply.code(404).send({ error: "NOT_FOUND" });
      if (err.code === "P2002") return reply.code(409).send({ error: "ALREADY_EXISTS" });
    }
    const known = /^[A-Z_]+$/.test(err.message);
    if (known) return reply.code(400).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  app.post("/login", async (req, reply) => {
    const { username, password } = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const admin = await db.admin.findUnique({ where: { username } });
    if (!admin || !admin.isActive || !(await bcrypt.compare(password, admin.passwordHash)))
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    await db.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const token = app.jwt.sign({ adminId: admin.id, role: admin.role, kind: "admin" } satisfies AdminJwt, { expiresIn: "12h" });
    return { token, admin: { id: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role } };
  });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url.split("?")[0].endsWith("/login")) return;
    try {
      await req.jwtVerify();
      const u = req.user as AdminJwt;
      if (u.kind !== "admin") throw new Error();
      const a = await db.admin.findUnique({ where: { id: u.adminId } });
      if (!a || !a.isActive) throw new Error();
      (req as any).admin = a;
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
    const a = (req as any).admin;
    if (!allowed(a.role, req.method, req.url)) return reply.code(403).send({ error: "FORBIDDEN" });
  });

  const adminId = (req: FastifyRequest) => ((req as any).admin as { id: number }).id;
  const audit = (req: FastifyRequest, action: string, target: string, payload?: unknown) =>
    db.auditLog.create({ data: { adminId: adminId(req), action, target, payload: (payload ?? {}) as any } });
  const idParam = (req: FastifyRequest) => Number((req.params as any).id);
  /** Kuponlara bağlı bonus bilgisini ekle (Bet → PlayerBonus ilişkisi şemada yok; elle birleştir) */
  const attachBonus = async <T extends { playerBonusId: number | null }>(bets: T[]) => {
    const ids = [...new Set(bets.map((b) => b.playerBonusId).filter((x): x is number => x != null))];
    if (!ids.length) return bets.map((b) => ({ ...b, bonus: null }));
    const pbs = await db.playerBonus.findMany({ where: { id: { in: ids } }, include: { bonus: { select: { id: true, name: true, type: true } } } });
    const m = new Map(pbs.map((p) => [p.id, { playerBonusId: p.id, bonusId: p.bonusId, name: p.bonus.name, type: p.bonus.type, state: p.state, wagerDone: Number(p.wagerDone), wagerRequired: Number(p.wagerRequired) }]));
    return bets.map((b) => ({ ...b, bonus: b.playerBonusId ? m.get(b.playerBonusId) ?? null : null }));
  };
  /** Backoffice'in seçtiği site (X-Site: kod). Bulunamazsa varsayılan site 1. */
  const sid = async (req: FastifyRequest) => {
    const code = ((req.headers["x-site"] as string) || "").trim().toLowerCase();
    if (!code) return 1;
    const s = (await allSites(db)).find((x) => x.code.toLowerCase() === code);
    return s?.id ?? 1;
  };

  // ---------- Kendi hesabım ----------
  app.get("/me", async (req) => {
    const a = (req as any).admin;
    return { id: a.id, username: a.username, fullName: a.fullName, role: a.role };
  });
  app.post("/me/password", async (req, reply) => {
    const b = z.object({ current: z.string(), next: z.string().min(8) }).parse(req.body);
    const a = (req as any).admin;
    if (!(await bcrypt.compare(b.current, a.passwordHash))) return reply.code(400).send({ error: "WRONG_PASSWORD" });
    await db.admin.update({ where: { id: a.id }, data: { passwordHash: await bcrypt.hash(b.next, 10) } });
    return { ok: true };
  });

  // ---------- Kullanıcı yönetimi ----------
  app.get("/users", async () => db.admin.findMany({ select: { id: true, username: true, fullName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true }, orderBy: { id: "asc" } }));
  app.post("/users", async (req) => {
    const b = z.object({ username: z.string().min(3), fullName: z.string().optional(), password: z.string().min(8), role: z.nativeEnum(AdminRole) }).parse(req.body);
    const u = await db.admin.create({ data: { username: b.username, fullName: b.fullName, role: b.role, passwordHash: await bcrypt.hash(b.password, 10) } });
    await audit(req, "ADMIN_CREATE", `admin:${u.id}`, { username: b.username, role: b.role });
    return { id: u.id };
  });
  app.patch("/users/:id", async (req) => {
    const b = z.object({ fullName: z.string().optional(), role: z.nativeEnum(AdminRole).optional(), isActive: z.boolean().optional(), password: z.string().min(8).optional() }).parse(req.body);
    const { password, ...rest } = b;
    const u = await db.admin.update({ where: { id: idParam(req) }, data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) } });
    await audit(req, "ADMIN_UPDATE", `admin:${u.id}`, { ...rest, passwordChanged: Boolean(password) });
    return { id: u.id };
  });
  app.get("/audit-logs", async (req) => {
    const q = z.object({ action: z.string().optional(), adminId: z.coerce.number().optional(), target: z.string().optional(), take: z.coerce.number().default(300) }).parse(req.query);
    return db.auditLog.findMany({
      where: { ...(q.action ? { action: q.action } : {}), ...(q.adminId ? { adminId: q.adminId } : {}), ...(q.target ? { target: { contains: q.target } } : {}) },
      include: { admin: { select: { username: true } } }, orderBy: { id: "desc" }, take: q.take,
    });
  });

  // ---------- Siteler (çoklu site yönetimi) ----------
  const siteBody = z.object({
    code: z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
    name: z.string().min(2), domain: z.string().nullable().optional(),
    isActive: z.boolean().default(true), note: z.string().nullable().optional(),
    sbApiUrl: z.string().nullable().optional(), sbApiKey: z.string().nullable().optional(),
    sbApiSecret: z.string().nullable().optional(), sbWalletSecret: z.string().nullable().optional(),
  });
  const cleanDomain = (d?: string | null) => (d ? d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null);
  const siteUrls = (s: { domain: string | null }) => {
    const apiHost = process.env.PUBLIC_API_URL || "";
    return {
      walletUrl: apiHost ? `${apiHost}/wallet` : null,
      webhookUrl: apiHost ? `${apiHost}/webhooks/sportsbook` : null,
      siteUrl: s.domain ? `https://${s.domain}` : null,
    };
  };
  const safeSite = (s: any) => ({ ...s, sbApiSecret: s.sbApiSecret ? "•••" + s.sbApiSecret.slice(-4) : null, sbWalletSecret: s.sbWalletSecret ? "•••" + s.sbWalletSecret.slice(-4) : null, ...siteUrls(s) });
  app.get("/sites", async () => {
    const sites = await db.site.findMany({ orderBy: { id: "asc" } });
    const counts = await db.player.groupBy({ by: ["siteId"], _count: true });
    return sites.map((s) => ({ ...safeSite(s), playerCount: counts.find((c) => c.siteId === s.id)?._count ?? 0 }));
  });
  app.post("/sites", async (req) => {
    const b = siteBody.parse(req.body);
    const s = await db.site.create({ data: { ...b, domain: cleanDomain(b.domain) } });
    await seedSiteDefaults(db, s); // ödeme sistemleri + temel CMS ayarları hazır gelsin
    bustSiteCache();
    await audit(req, "SITE_CREATE", `site:${s.id}`, { code: b.code, name: b.name, domain: b.domain });
    return safeSite(s);
  });
  app.patch("/sites/:id", async (req) => {
    const b = siteBody.partial().parse(req.body);
    // Boş string gelen gizli alanlar "değiştirme" demektir
    for (const k of ["sbApiKey", "sbApiSecret", "sbWalletSecret"] as const) if (b[k] === "") delete (b as any)[k];
    const s = await db.site.update({ where: { id: idParam(req) }, data: { ...b, ...(b.domain !== undefined ? { domain: cleanDomain(b.domain) } : {}) } });
    bustSiteCache();
    await audit(req, "SITE_UPDATE", `site:${s.id}`, { code: b.code, name: b.name, domain: b.domain, isActive: b.isActive });
    return safeSite(s);
  });

  // ---------- Dashboard ----------
  app.get("/dashboard", async (req) => {
    const { from, to } = range(dateQ.parse(req.query));
    return dashboard(db, from, to, await sid(req));
  });

  // ---------- Oyuncular ----------
  app.get("/players", async (req) => {
    const q = z.object({
      search: z.string().optional(), id: z.coerce.number().optional(), status: z.string().optional(), category: z.string().optional(),
      verified: z.string().optional(), isTest: z.string().optional(), btag: z.string().optional(), from: z.string().optional(), to: z.string().optional(),
      minBalance: z.coerce.number().optional(), loginFrom: z.string().optional(), loginTo: z.string().optional(),
      page: z.coerce.number().default(1), size: z.coerce.number().max(500).default(20),
      sort: z.string().default("id"), dir: z.enum(["asc", "desc"]).default("desc"),
    }).parse(req.query);
    const where: Prisma.PlayerWhereInput = {
      siteId: await sid(req),
      ...(q.id ? { id: q.id } : {}),
      ...(q.search ? { OR: [
        { username: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } },
        { firstName: { contains: q.search, mode: "insensitive" } }, { lastName: { contains: q.search, mode: "insensitive" } },
        { phone: { contains: q.search } }, ...(Number(q.search) ? [{ id: Number(q.search) }] : []),
      ] } : {}),
      ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}),
      ...(q.verified ? { isVerified: q.verified === "true" } : {}), ...(q.isTest ? { isTest: q.isTest === "true" } : {}),
      ...(q.btag ? { btag: q.btag } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      ...(q.minBalance !== undefined ? { wallets: { some: { type: WalletType.MAIN, balance: { gte: q.minBalance } } } } : {}),
      ...(q.loginFrom || q.loginTo ? { logins: { some: { createdAt: { ...(q.loginFrom ? { gte: new Date(q.loginFrom) } : {}), ...(q.loginTo ? { lt: new Date(q.loginTo) } : {}) } } } } : {}),
    };
    const sortable = ["id", "username", "createdAt", "lastLoginAt", "firstName", "lastName"];
    const [items, total] = await Promise.all([
      db.player.findMany({ where, include: { wallets: true }, orderBy: { [sortable.includes(q.sort) ? q.sort : "id"]: q.dir }, skip: (q.page - 1) * q.size, take: q.size }),
      db.player.count({ where }),
    ]);
    return { items: items.map(({ passwordHash, ...p }) => p), total };
  });

  app.post("/players", async (req) => {
    const b = z.object({ username: z.string().min(3), password: z.string().min(6), email: z.string().email().optional(), phone: z.string().optional(), firstName: z.string().optional(), lastName: z.string().optional(), isTest: z.boolean().default(false) }).parse(req.body);
    const { password, ...rest } = b;
    const p = await db.player.create({ data: { ...rest, siteId: await sid(req), passwordHash: await bcrypt.hash(password, 10), regSource: "Backoffice" } });
    await ensureWallets(db, p.id);
    await audit(req, "PLAYER_CREATE", `player:${p.id}`, rest);
    return { id: p.id };
  });

  app.get("/players/:id", async (req) => {
    const p = await db.player.findUniqueOrThrow({ where: { id: idParam(req) }, include: { wallets: true, notes: { orderBy: { id: "desc" } } } });
    const { passwordHash, ...safe } = p;
    return safe;
  });

  app.get("/players/:id/kpis", async (req) => playerKpis(db, idParam(req)));

  app.patch("/players/:id", async (req) => {
    const id = idParam(req);
    const data = z.object({
      status: z.enum(["OPEN", "BLOCKED", "CLOSED", "SELF_EXCLUDED"]).optional(), category: z.string().optional(), isVerified: z.boolean().optional(),
      isSportBlocked: z.boolean().optional(), isCasinoBlocked: z.boolean().optional(), excludedFromBonuses: z.boolean().optional(), isTest: z.boolean().optional(),
      email: z.string().nullable().optional(), phone: z.string().nullable().optional(), firstName: z.string().nullable().optional(), lastName: z.string().nullable().optional(),
      city: z.string().nullable().optional(), address: z.string().nullable().optional(), gender: z.string().nullable().optional(),
      birthDate: z.string().nullable().optional(), btag: z.string().nullable().optional(), loyaltyLevel: z.string().nullable().optional(), language: z.string().optional(),
      activeWallet: z.nativeEnum(WalletType).optional(),
    }).parse(req.body);
    const p = await db.player.update({ where: { id }, data: { ...data, ...(data.birthDate !== undefined ? { birthDate: data.birthDate ? new Date(data.birthDate) : null } : {}) } });
    await audit(req, "PLAYER_UPDATE", `player:${id}`, data);
    return { id: p.id };
  });

  app.post("/players/:id/password", async (req) => {
    const { password } = z.object({ password: z.string().min(6) }).parse(req.body);
    await db.player.update({ where: { id: idParam(req) }, data: { passwordHash: await bcrypt.hash(password, 10), wrongLoginAttempts: 0 } });
    await audit(req, "PLAYER_PASSWORD_RESET", `player:${idParam(req)}`);
    return { ok: true };
  });

  app.get("/players/:id/transactions", async (req) => {
    const q = z.object({ type: z.string().optional(), wallet: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    return db.transaction.findMany({
      where: {
        playerId: idParam(req), ...(q.type ? { type: { in: q.type.split(",") as TxType[] } } : {}), ...(q.wallet ? { wallet: { type: q.wallet as WalletType } } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      },
      include: { wallet: true }, orderBy: { id: "desc" }, take: 500,
    });
  });
  app.get("/players/:id/bets", async (req) => attachBonus(await db.bet.findMany({ where: { playerId: idParam(req) }, include: { selections: true }, orderBy: { id: "desc" }, take: 300 })));
  app.get("/players/:id/bonuses", async (req) => db.playerBonus.findMany({ where: { playerId: idParam(req) }, include: { bonus: true }, orderBy: { id: "desc" } }));
  app.get("/players/:id/payments", async (req) => db.paymentRequest.findMany({ where: { playerId: idParam(req) }, orderBy: { id: "desc" }, take: 300 }));
  app.get("/players/:id/logins", async (req) => db.loginLog.findMany({ where: { playerId: idParam(req) }, orderBy: { id: "desc" }, take: 200 }));

  app.post("/players/:id/bonuses", async (req) => {
    const playerId = idParam(req);
    const body = z.object({ bonusId: z.number(), amount: z.number().positive() }).parse(req.body);
    const pb = await grantBonus(db, { playerId, ...body, adminId: adminId(req) });
    await audit(req, "BONUS_GRANT", `player:${playerId}`, body);
    return pb;
  });

  // Manuel bakiye işlemi: yatırım / çekim / düzeltme (artı-eksi)
  app.post("/players/:id/adjust", async (req) => {
    const playerId = idParam(req);
    const b = z.object({
      wallet: z.nativeEnum(WalletType).default(WalletType.MAIN),
      type: z.enum(["DEPOSIT", "WITHDRAWAL", "CORRECTION_UP", "CORRECTION_DOWN"]),
      amount: z.number().positive(),
      paymentSystem: z.string().optional(),
      note: z.string().optional(),
    }).parse(req.body);
    const out = await db.$transaction(async (t) => {
      const neg = b.type === "WITHDRAWAL" || b.type === "CORRECTION_DOWN";
      // Manuel yatırım/çekim raporlara girsin diye PAID ödeme kaydı da açılır
      let ref: string | undefined;
      if (b.type === "DEPOSIT" || b.type === "WITHDRAWAL") {
        const pr = await t.paymentRequest.create({ data: { playerId, type: b.type as PaymentType, amount: b.amount, state: PaymentState.PAID, paymentSystem: b.paymentSystem || "Manual", notes: b.note, allowAdminId: adminId(req), paidAdminId: adminId(req), processedAt: new Date() } });
        ref = `pay:${pr.id}`;
      }
      return move(t, { playerId, wallet: b.wallet, type: b.type as TxType, amount: neg ? -b.amount : b.amount, paymentSystem: b.paymentSystem, note: b.note, adminId: adminId(req), reference: ref });
    });
    await audit(req, "BALANCE_ADJUST", `player:${playerId}`, b);
    return { id: out.id.toString(), balanceAfter: out.balanceAfter };
  });

  app.post("/players/:id/notes", async (req) => {
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    return db.playerNote.create({ data: { playerId: idParam(req), text, adminId: adminId(req) } });
  });

  // ---------- Finans: yatırım / çekim talepleri ----------
  app.get("/payment-requests", async (req) => {
    const q = z.object({
      type: z.nativeEnum(PaymentType), state: z.string().optional(), playerId: z.coerce.number().optional(), id: z.string().optional(),
      username: z.string().optional(), paymentSystem: z.string().optional(), minAmount: z.coerce.number().optional(), maxAmount: z.coerce.number().optional(),
      from: z.string().optional(), to: z.string().optional(), page: z.coerce.number().default(1), size: z.coerce.number().max(500).default(50),
    }).parse(req.query);
    const where: Prisma.PaymentRequestWhereInput = {
      player: { siteId: await sid(req), ...(q.username ? { username: { contains: q.username, mode: "insensitive" } } : {}) },
      type: q.type,
      ...(q.state ? { state: { in: q.state.split(",") as PaymentState[] } } : {}),
      ...(q.playerId ? { playerId: q.playerId } : {}), ...(q.id && /^\d+$/.test(q.id) ? { id: BigInt(q.id) } : {}),
      ...(q.paymentSystem ? { paymentSystem: q.paymentSystem } : {}),
      ...(q.minAmount !== undefined || q.maxAmount !== undefined ? { amount: { ...(q.minAmount !== undefined ? { gte: q.minAmount } : {}), ...(q.maxAmount !== undefined ? { lte: q.maxAmount } : {}) } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    const [items, total, sum] = await Promise.all([
      db.paymentRequest.findMany({ where, include: { player: { select: { id: true, username: true, firstName: true, lastName: true, isVerified: true, category: true } } }, orderBy: { id: "desc" }, skip: (q.page - 1) * q.size, take: q.size }),
      db.paymentRequest.count({ where }),
      db.paymentRequest.aggregate({ where, _sum: { amount: true } }),
    ]);
    const admins = await db.admin.findMany({ select: { id: true, username: true } });
    const name = (id: number | null) => (id ? admins.find((a) => a.id === id)?.username ?? String(id) : null);
    // Çekimde ödeme kararı için: oyuncunun son bonus kaydı
    let lastB = new Map<number, any>();
    if (q.type === "WITHDRAWAL" && items.length) {
      const pbs = await db.playerBonus.findMany({ where: { playerId: { in: [...new Set(items.map((i) => i.playerId))] } }, include: { bonus: { select: { name: true } } }, orderBy: { id: "desc" } });
      for (const pb of pbs) if (!lastB.has(pb.playerId)) lastB.set(pb.playerId, { id: pb.id, name: pb.bonus.name, state: pb.state, wagerDone: Number(pb.wagerDone), wagerRequired: Number(pb.wagerRequired) });
    }
    return { items: items.map((i) => ({ ...i, lastBonus: lastB.get(i.playerId) ?? null, allowUser: name(i.allowAdminId), rejectUser: name(i.rejectAdminId), paidUser: name(i.paidAdminId) })), total, sum: Number(sum._sum.amount ?? 0) };
  });
  app.post("/payment-requests/:id/:action", async (req) => {
    const { id, action } = req.params as { id: string; action: string };
    const a = z.enum(["allow", "pay", "reject", "reverse", "correct", "reopen"]).parse(action);
    const b = z.object({ reason: z.string().optional(), notes: z.string().optional(), newAmount: z.number().positive().optional(), force: z.boolean().optional() }).parse(req.body ?? {});
    if (a === "reject" && (!b.reason || b.reason.trim().length < 3)) throw new BizError("REASON_REQUIRED");
    if (b.notes !== undefined) await db.paymentRequest.update({ where: { id: BigInt(id) }, data: { notes: b.notes } });
    const opts = { adminId: adminId(req), reason: b.reason ?? "" };
    const r = a === "reverse" ? await reversePayment(db, BigInt(id), { ...opts, force: b.force })
      : a === "correct" ? await correctPayment(db, BigInt(id), { ...opts, newAmount: b.newAmount ?? 0 })
      : a === "reopen" ? await reopenPayment(db, BigInt(id), opts)
      : await processPayment(db, BigInt(id), a, opts);
    await audit(req, `PAYMENT_${a.toUpperCase()}`, `payment:${id}`, { reason: b.reason, newAmount: b.newAmount, force: b.force });
    return r;
  });
  app.patch("/payment-requests/:id", async (req) => {
    const { notes } = z.object({ notes: z.string() }).parse(req.body);
    return db.paymentRequest.update({ where: { id: BigInt((req.params as any).id) }, data: { notes } });
  });

  // ---------- Ödeme sistemleri ----------
  app.get("/payment-systems", async (req) => db.paymentSystem.findMany({ where: { siteId: await sid(req) }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }));
  const psBody = z.object({
    name: z.string().min(2), displayName: z.string(), kind: z.enum(["DEPOSIT", "WITHDRAWAL", "BOTH"]), logoUrl: z.string().nullable().optional(),
    minAmount: z.coerce.number().default(0), maxAmount: z.preprocess(toNum, z.number().optional()), fields: z.any().optional(), instructions: z.string().nullable().optional(),
    isActive: z.boolean().default(true), sortOrder: z.coerce.number().default(0), config: z.any().optional(),
  });
  const checkPs = (d: any) => {
    if (d.minAmount != null && d.minAmount < 0) throw new BizError("MIN_AMOUNT_NEGATIVE");
    if (d.maxAmount != null && d.minAmount != null && Number(d.maxAmount) < Number(d.minAmount)) throw new BizError("MAX_LT_MIN");
    if (d.config?.requireTxid && !d.config?.depositAddress && (d.kind ?? "BOTH") !== "WITHDRAWAL") throw new BizError("CRYPTO_ADDRESS_REQUIRED");
  };
  app.post("/payment-systems", async (req) => { const d = psBody.parse(req.body); checkPs(d); return db.paymentSystem.create({ data: { ...d, siteId: await sid(req) } }); });
  app.patch("/payment-systems/:id", async (req) => {
    const d = psBody.partial().parse(req.body);
    const cur = await db.paymentSystem.findUniqueOrThrow({ where: { id: idParam(req) } });
    checkPs({ ...cur, minAmount: Number(cur.minAmount), maxAmount: cur.maxAmount == null ? null : Number(cur.maxAmount), ...d });
    return db.paymentSystem.update({ where: { id: idParam(req) }, data: d });
  });

  // ---------- Tüm işlemler ----------
  app.get("/transactions", async (req) => {
    const q = z.object({ type: z.string().optional(), playerId: z.coerce.number().optional(), wallet: z.string().optional(), from: z.string().optional(), to: z.string().optional(), take: z.coerce.number().max(1000).default(300) }).parse(req.query);
    return db.transaction.findMany({
      where: {
        player: { siteId: await sid(req) },
        ...(q.type ? { type: { in: q.type.split(",") as TxType[] } } : {}), ...(q.playerId ? { playerId: q.playerId } : {}), ...(q.wallet ? { wallet: { type: q.wallet as WalletType } } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      },
      include: { wallet: { select: { type: true } }, player: { select: { username: true } } }, orderBy: { id: "desc" }, take: q.take,
    });
  });

  // ---------- Raporlar ----------
  app.get("/reports/sportsbook", async (req) => { const { from, to } = range(dateQ.parse(req.query)); return sportsbookDaily(db, from, to, await sid(req)); });
  app.get("/reports/financial", async (req) => { const { from, to } = range(dateQ.parse(req.query)); return financialReport(db, from, to, await sid(req)); });
  app.get("/player-bonuses", async (req) => {
    const q = z.object({ state: z.string().optional(), bonusId: z.coerce.number().optional(), type: z.string().optional(), playerId: z.coerce.number().optional(), from: z.string().optional(), to: z.string().optional(), take: z.coerce.number().max(1000).default(300) }).parse(req.query);
    return db.playerBonus.findMany({
      where: {
        player: { siteId: await sid(req) },
        ...(q.state ? { state: q.state as any } : {}), ...(q.bonusId ? { bonusId: q.bonusId } : {}), ...(q.type ? { bonus: { type: q.type as any } } : {}),
        ...(q.playerId ? { playerId: q.playerId } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      },
      include: { bonus: { select: { name: true, type: true } }, player: { select: { username: true } } }, orderBy: { id: "desc" }, take: q.take,
    });
  });
  app.post("/player-bonuses/:id/cancel", async (req) => {
    const r = await cancelBonus(db, idParam(req), adminId(req));
    await audit(req, "BONUS_CANCEL", `playerBonus:${idParam(req)}`);
    return r;
  });

  // ---------- Bonus talepleri ----------
  app.get("/bonus-requests", async (req) => {
    const q = z.object({ state: z.string().optional() }).parse(req.query);
    return db.bonusRequest.findMany({ where: { ...(q.state ? { state: q.state } : {}), player: { siteId: await sid(req) } }, include: { bonus: { select: { name: true, type: true, minAmount: true, maxAmount: true } }, player: { select: { username: true } } }, orderBy: { id: "desc" }, take: 300 });
  });
  app.post("/bonus-requests/:id/:action", async (req) => {
    const { action } = req.params as { action: string };
    const b = z.object({ amount: z.number().positive().optional(), note: z.string().optional() }).parse(req.body ?? {});
    const r = await db.bonusRequest.findUniqueOrThrow({ where: { id: idParam(req) } });
    if (r.state !== "PENDING") throw new BizError("ALREADY_PROCESSED");
    if (action === "approve") {
      if (!b.amount) throw new BizError("AMOUNT_REQUIRED");
      const pb = await grantBonus(db, { playerId: r.playerId, bonusId: r.bonusId, amount: b.amount, adminId: adminId(req) });
      await db.bonusRequest.update({ where: { id: r.id }, data: { state: "APPROVED", amount: b.amount, note: b.note, playerBonusId: pb.id, processedByAdminId: adminId(req), processedAt: new Date() } });
    } else if (action === "reject") {
      await db.bonusRequest.update({ where: { id: r.id }, data: { state: "REJECTED", note: b.note, processedByAdminId: adminId(req), processedAt: new Date() } });
    } else throw new BizError("INVALID_ACTION");
    await audit(req, `BONUS_REQUEST_${action.toUpperCase()}`, `bonusRequest:${r.id}`, b);
    return { ok: true };
  });

  // ---------- Spor bahisleri ----------
  app.get("/bets", async (req) => {
    const q = z.object({
      state: z.string().optional(), isLive: z.string().optional(), coupon: z.string().optional(), playerId: z.coerce.number().optional(), bonusOnly: z.string().optional(),
      type: z.string().optional(), minStake: z.coerce.number().optional(), from: z.string().optional(), to: z.string().optional(), take: z.coerce.number().max(1000).default(200),
      playerBonusId: z.coerce.number().optional(),
    }).parse(req.query);
    const bets = await db.bet.findMany({
      where: {
        player: { siteId: await sid(req) },
        ...(q.state ? { state: { in: q.state.split(",") as any } } : {}), ...(q.isLive ? { isLive: q.isLive === "true" } : {}),
        ...(q.coupon ? { couponId: q.coupon } : {}), ...(q.playerId ? { playerId: q.playerId } : {}),
        ...(q.bonusOnly === "true" ? { OR: [{ stakeFromBonus: { gt: 0 } }, { playerBonusId: { not: null } }] } : {}), ...(q.type ? { type: q.type as any } : {}),
        ...(q.playerBonusId ? { playerBonusId: q.playerBonusId } : {}),
        ...(q.minStake !== undefined ? { stake: { gte: q.minStake } } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      },
      include: { selections: true, player: { select: { id: true, username: true } } },
      orderBy: { id: "desc" }, take: q.take,
    });
    return attachBonus(bets);
  });

  // ---------- Sportsbook (kendi motorumuz — trading) ----------
  await app.register(sbAdminRoutes);
  await app.register(chatAdminRoutes, { sid, adminId, audit });
  app.get("/wallet-requests", async (req) => {
    const q = z.object({ kind: z.string().optional(), status: z.string().optional(), playerId: z.coerce.number().optional(), take: z.coerce.number().default(200) }).parse(req.query);
    // WalletRequest'in player ilişkisi yok (Betco seamless kalıntısı, artık boş) → site filtresi uygulanmaz
    return db.walletRequest.findMany({
      where: { ...(q.kind ? { kind: q.kind } : {}), ...(q.status ? { status: q.status } : {}), ...(q.playerId ? { playerId: q.playerId } : {}) },
      orderBy: { id: "desc" }, take: q.take,
    });
  });
  app.get("/webhook-events", async () => db.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));

  // ---------- Bonus tanımları ----------
  const bonusBody = z.object({
    name: z.string().min(1), type: z.enum(["DEPOSIT", "MANUAL", "FREEBET", "FREESPIN", "CASINO_FREEBET", "WAGERING"]), product: z.string().default("SPORT"),
    description: z.string().nullable().optional(), note: z.string().nullable().optional(), isActive: z.boolean().default(true),
    startsAt: z.preprocess((v) => (v ? new Date(v as string) : null), z.date().nullable()).optional(),
    endsAt: z.preprocess((v) => (v ? new Date(v as string) : null), z.date().nullable()).optional(),
    expirationType: z.string().default("FROM_PAYOUT_DATE"), expirationDays: z.coerce.number().int().min(1).default(7),
    allowWithdrawal: z.boolean().default(false), availableOnRequest: z.boolean().default(false),
    wageringMultiplier: z.coerce.number().min(0).default(1),
    minAmount: z.preprocess(toNum, z.number().optional()).nullable(), maxAmount: z.preprocess(toNum, z.number().optional()).nullable(),
    maxPayout: z.preprocess(toNum, z.number().optional()).nullable(), maxPayoutPct: z.preprocess(toNum, z.number().optional()).nullable(),
    percent: z.preprocess(toNum, z.number().optional()).nullable(), rules: z.any().optional(),
  });
  const nullify = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined && ["minAmount", "maxAmount", "maxPayout", "maxPayoutPct", "percent"].includes(k) ? null : v]));
  app.get("/bonuses", async (req) => {
    const list = await db.bonus.findMany({ where: { siteId: await sid(req) }, orderBy: { id: "desc" } });
    const stats = await db.playerBonus.groupBy({ by: ["bonusId"], _count: true, _sum: { amount: true, convertedAmount: true } });
    return list.map((b) => { const s = stats.find((x) => x.bonusId === b.id); return { ...b, awardedCount: s?._count ?? 0, awardedSum: Number(s?._sum.amount ?? 0), convertedSum: Number(s?._sum.convertedAmount ?? 0) }; });
  });
  /** Bonus mantıksal kontrolleri (oluşturma ve güncellemede birleşik veri üzerinde) */
  const checkBonus = (d: any) => {
    const n = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
    const min = n(d.minAmount), max = n(d.maxAmount), mp = n(d.maxPayout), pct = n(d.percent), mpp = n(d.maxPayoutPct);
    if (min != null && min < 0) throw new BizError("BONUS_MIN_NEGATIVE");
    if (max != null && max <= 0) throw new BizError("BONUS_MAX_INVALID");
    if (min != null && max != null && max < min) throw new BizError("BONUS_MAX_LT_MIN");
    if (mp != null && mp <= 0) throw new BizError("BONUS_MAX_PAYOUT_INVALID");
    if (mpp != null && (mpp <= 0 || mpp > 100000)) throw new BizError("BONUS_MAX_PAYOUT_PCT_RANGE");
    if (d.type === "DEPOSIT" && (pct == null || pct <= 0)) throw new BizError("DEPOSIT_BONUS_NEEDS_PERCENT");
    if (pct != null && (pct <= 0 || pct > 1000)) throw new BizError("BONUS_PERCENT_RANGE");
    if (n(d.wageringMultiplier) != null && (Number(d.wageringMultiplier) < 0 || Number(d.wageringMultiplier) > 100)) throw new BizError("BONUS_WAGERING_RANGE");
    if (n(d.expirationDays) != null && (Number(d.expirationDays) < 1 || Number(d.expirationDays) > 365)) throw new BizError("BONUS_EXPIRATION_RANGE");
    if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) throw new BizError("BONUS_DATES_INVALID");
    const r = d.rules ?? {};
    if (r.minSelections != null && r.minSelections !== "" && Number(r.minSelections) < 1) throw new BizError("RULE_MIN_SELECTIONS");
    if (r.minSelectionOdds != null && r.minSelectionOdds !== "" && Number(r.minSelectionOdds) < 1) throw new BizError("RULE_MIN_SEL_ODDS");
    if (r.minTotalOdds != null && r.minTotalOdds !== "" && r.minSelectionOdds != null && r.minSelectionOdds !== "" && Number(r.minTotalOdds) < Number(r.minSelectionOdds)) throw new BizError("RULE_TOTAL_LT_SEL_ODDS");
    if (r.betType === "SINGLE" && Number(r.minSelections ?? 1) > 1) throw new BizError("RULE_SINGLE_MULTI_CONFLICT");
  };
  app.post("/bonuses", async (req) => { const d = nullify(bonusBody.parse(req.body)); checkBonus(d); const b = await db.bonus.create({ data: { ...d, siteId: await sid(req) } as any }); await audit(req, "BONUS_CREATE", `bonus:${b.id}`); return b; });
  app.patch("/bonuses/:id", async (req) => {
    const d = bonusBody.partial().parse(req.body);
    const cur = await db.bonus.findUniqueOrThrow({ where: { id: idParam(req) } });
    checkBonus({ ...cur, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) });
    const b = await db.bonus.update({ where: { id: idParam(req) }, data: nullify(d) as any }); await audit(req, "BONUS_UPDATE", `bonus:${b.id}`); return b;
  });

  // ---------- Promo kodlar ----------
  const promoBody = z.object({
    code: z.string().min(2), bonusId: z.coerce.number(), amount: z.coerce.number().positive(), currency: z.string().default("TRY"),
    maxCount: z.coerce.number().int().min(1), isActive: z.boolean().default(true), description: z.string().nullable().optional(),
    startsAt: z.preprocess((v) => (v ? new Date(v as string) : null), z.date().nullable()).optional(),
    endsAt: z.preprocess((v) => (v ? new Date(v as string) : null), z.date().nullable()).optional(),
    conditions: z.any().optional(),
  });
  app.get("/promo-codes", async (req) => db.promoCode.findMany({ where: { siteId: await sid(req) }, include: { bonus: { select: { name: true, type: true } } }, orderBy: { id: "desc" } }));
  const checkPromo = async (d: any, siteId: number) => {
    if (d.code != null && !/^[A-Z0-9_-]{3,30}$/.test(String(d.code))) throw new BizError("PROMO_CODE_FORMAT");
    if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) throw new BizError("PROMO_DATES_INVALID");
    const bonus = await db.bonus.findUnique({ where: { id: Number(d.bonusId) } });
    if (!bonus || bonus.siteId !== siteId) throw new BizError("PROMO_BONUS_NOT_FOUND");
    if (!bonus.isActive) throw new BizError("PROMO_BONUS_INACTIVE");
    if (bonus.minAmount && Number(d.amount) < Number(bonus.minAmount)) throw new BizError("PROMO_AMOUNT_BELOW_BONUS_MIN");
    if (bonus.maxAmount && Number(d.amount) > Number(bonus.maxAmount)) throw new BizError("PROMO_AMOUNT_ABOVE_BONUS_MAX");
  };
  app.post("/promo-codes", async (req) => {
    const d = promoBody.parse(req.body); d.code = d.code.trim().toUpperCase();
    const siteId = await sid(req); await checkPromo(d, siteId);
    return db.promoCode.create({ data: { ...d, siteId } });
  });
  app.patch("/promo-codes/:id", async (req) => {
    const d = promoBody.partial().parse(req.body); if (d.code) d.code = d.code.trim().toUpperCase();
    const cur = await db.promoCode.findUniqueOrThrow({ where: { id: idParam(req) } });
    const merged = { ...cur, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
    await checkPromo(merged, cur.siteId);
    if (d.maxCount != null && d.maxCount < cur.usedCount) throw new BizError("PROMO_MAX_LT_USED");
    return db.promoCode.update({ where: { id: idParam(req) }, data: d });
  });
  app.get("/promo-codes/:id/redemptions", async (req) => db.promoRedemption.findMany({ where: { promoCodeId: idParam(req) }, include: { player: { select: { username: true } } }, orderBy: { id: "desc" } }));

  // ---------- Tahminler ----------
  await app.register(predictionAdminRoutes);
  app.get("/players/:id/predictions", async (req) => db.predictionPosition.findMany({ where: { playerId: idParam(req) }, include: { market: { select: { question: true, slug: true, status: true } }, outcome: { select: { name: true } } }, orderBy: { id: "desc" }, take: 300 }));

  // ---------- Demo veri (sadece SUPERADMIN) ----------
  app.post("/demo/seed", async (req) => { const r = await seedDemo(db); await audit(req, "DEMO_SEED", "demo", r); return r; });
  app.post("/demo/purge", async (req) => { const r = await purgeDemo(db); await audit(req, "DEMO_PURGE", "demo", r); return r; });

  // ---------- CMS ----------
  for (const [path, model] of [["banners", db.cmsBanner], ["promotions", db.cmsPromotion], ["pages", db.cmsPage]] as const) {
    const m = model as any;
    const clean = (b: any) => { const { id, updatedAt, ...rest } = b ?? {}; for (const k of ["startsAt", "endsAt"]) if (k in rest) rest[k] = rest[k] ? new Date(rest[k]) : null; if ("sortOrder" in rest) rest.sortOrder = Number(rest.sortOrder) || 0; return rest; };
    app.get(`/cms/${path}`, async (req) => m.findMany({ where: { siteId: await sid(req) }, orderBy: [{ id: "desc" }] }));
    app.post(`/cms/${path}`, async (req) => { const { siteId: _s, ...data } = clean(req.body); const r = await m.create({ data: { ...data, siteId: await sid(req) } }); await audit(req, `CMS_${path.toUpperCase()}_CREATE`, `${path}:${r.id}`); return r; });
    app.patch(`/cms/${path}/:id`, async (req) => { const { siteId: _s, ...data } = clean(req.body); const r = await m.update({ where: { id: idParam(req) }, data }); await audit(req, `CMS_${path.toUpperCase()}_UPDATE`, `${path}:${r.id}`); return r; });
    app.delete(`/cms/${path}/:id`, async (req) => { await m.delete({ where: { id: idParam(req) } }); await audit(req, `CMS_${path.toUpperCase()}_DELETE`, `${path}:${idParam(req)}`); return { ok: true }; });
  }
  app.get("/cms/settings/:key", async (req) => db.cmsSetting.findUnique({ where: { siteId_key: { siteId: await sid(req), key: (req.params as any).key } } }));
  app.put("/cms/settings/:key", async (req) => {
    const key = (req.params as any).key;
    if (!/^[a-z0-9_]+$/.test(key) || key.startsWith("sportsbook_") || key.startsWith("prediction_")) throw new BizError("INVALID_KEY");
    const siteId = await sid(req);
    const r = await db.cmsSetting.upsert({ where: { siteId_key: { siteId, key } }, update: { value: req.body as any }, create: { siteId, key, value: req.body as any } });
    await audit(req, "CMS_SETTING_UPDATE", `setting:${siteId}/${key}`);
    return r;
  });
}
