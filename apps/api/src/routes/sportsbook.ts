import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../index.js";
import { verifyPlatformSignature, sportsbook, sportsbookConfigured, SB_BASE } from "../services/sportsbook.js";
import { balance, debit, credit, rollback, handleWebhook, WalletReply } from "../services/seamless.js";

/**
 * Betco platformunun çağırdığı uçlar (imza: HMAC_SHA256(wallet_secret, ts + "." + rawBody)).
 * Wallet base URL (platforma verilecek):  https://<api-domain>/wallet
 *   → /wallet/balance, /wallet/debit, /wallet/credit, /wallet/rollback
 * Webhook URL:                            https://<api-domain>/webhooks/sportsbook
 */
export async function platformRoutes(app: FastifyInstance) {
  // Bu kapsamda JSON gövdeyi ham string olarak da sakla (imza ham gövde üzerinden)
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as any).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch {
      done(null, {});
    }
  });

  const guard = (req: FastifyRequest) =>
    verifyPlatformSignature((req as any).rawBody ?? "", req.headers["x-timestamp"] as string, req.headers["x-signature"] as string);

  const send = (reply: FastifyReply, r: WalletReply) => reply.code(r.http).send(r.body);

  const walletHandler = (fn: (db: any, b: any) => Promise<WalletReply>) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!guard(req)) return reply.code(401).send({ success: false, error_code: "INVALID_SIGNATURE", error_message: "Invalid signature" });
    try {
      return send(reply, await fn(db, req.body));
    } catch (e) {
      req.log.error(e, "wallet error");
      // Beklenmeyen hata: 5xx → platform debit için rollback, credit için tekrar dener
      return reply.code(500).send({ success: false, error_code: "INTERNAL_ERROR", error_message: "Internal error" });
    }
  };

  app.post("/wallet/balance", walletHandler(balance));
  app.post("/wallet/debit", walletHandler(debit));
  app.post("/wallet/credit", walletHandler(credit));
  app.post("/wallet/rollback", walletHandler(rollback));

  app.post("/webhooks/sportsbook", async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ success: false });
    const id = (req.headers["x-webhook-id"] as string) || `${req.headers["x-webhook-event"]}:${req.headers["x-timestamp"]}`;
    const result = await handleWebhook(db, id, req.body);
    return { success: true, result };
  });
}

/** Oyuncu tarafı: sportsbook açmak için launch token (secret backend'de kalır) */
export async function launchRoutes(app: FastifyInstance) {
  app.get("/sportsbook/launch", async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: "UNAUTHORIZED" }); }
    const { playerId, kind } = req.user as { playerId: number; kind: string };
    if (kind !== "player") return reply.code(401).send({ error: "UNAUTHORIZED" });
    const p = await db.player.findUniqueOrThrow({ where: { id: playerId } });
    if (p.status !== "OPEN" || p.isSportBlocked) return reply.code(403).send({ error: "SPORT_BLOCKED" });
    if (!sportsbookConfigured()) return reply.code(503).send({ error: "SPORTSBOOK_NOT_CONFIGURED" });
    const r: any = await sportsbook.prepareLaunch({ external_user_id: String(p.id), username: p.username, currency: p.currency, language: p.language === "en" ? "eng" : "tur" });
    return { launch_token: r.data.launch_token, expires_at: r.data.expires_at, base_url: SB_BASE };
  });
  app.get("/sportsbook/config", async () => ({ base_url: SB_BASE }));
}
