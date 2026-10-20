import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { adminRoutes } from "./routes/admin.js";
import { publicRoutes } from "./routes/public.js";
import { platformRoutes, launchRoutes } from "./routes/sportsbook.js";
import { siteRoutes } from "./routes/site.js";
import { predictionSiteRoutes } from "./routes/predictions.js";
import { autoClose, syncFeed } from "./services/predictions.js";
import { seedDemo } from "./services/demo.js";
import { expireBonuses } from "./services/bonus.js";

// BigInt alanları JSON'a string olarak çıksın
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

export const db = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
  credentials: true,
});
await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret" });

app.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));

await app.register(publicRoutes, { prefix: "/api" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(platformRoutes); // /wallet/* ve /webhooks/sportsbook (Betco)
await app.register(launchRoutes, { prefix: "/api" });
await app.register(siteRoutes, { prefix: "/api" }); // oyuncu hesabı, ödemeler, bonuslar
await app.register(predictionSiteRoutes, { prefix: "/api" }); // tahminler

// İlk açılışta süper admin oluştur
async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const exists = await db.admin.findUnique({ where: { username } });
  if (!exists) {
    await db.admin.create({
      data: { username, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD ?? "admin123", 10), role: "SUPERADMIN" },
    });
    app.log.info(`Süper admin oluşturuldu: ${username}`);
  }
}

await seedAdmin();
// Hiç ödeme sistemi yoksa örnekleri oluştur (backoffice'ten düzenlenir)
if ((await db.paymentSystem.count()) === 0) {
  await db.paymentSystem.createMany({ data: [
    { name: "BankTransfer", displayName: "Havale / EFT", kind: "BOTH", minAmount: 100, fields: [{ key: "fullName", label: "Ad Soyad" }, { key: "iban", label: "IBAN" }] },
    { name: "CryptoUSDT", displayName: "USDT (TRC20)", kind: "BOTH", minAmount: 100, fields: [{ key: "address", label: "TRC20 Cüzdan Adresi" }] },
  ] });
}
setInterval(() => expireBonuses(db).catch((e) => app.log.error(e)), 5 * 60_000);
setInterval(() => autoClose(db).catch((e) => app.log.error(e)), 60_000); // süresi dolan tahmin piyasalarını kapat
setInterval(() => syncFeed(db).catch((e) => app.log.error(e)), 5 * 60_000); // tahmin feed senkronu (ayarlıysa)

// DEMO_SEED=1 ise açılışta demo veri yüklenir (zaten varsa atlar). Yükledikten sonra env'den kaldırın.
if (process.env.DEMO_SEED === "1") seedDemo(db).then((r) => app.log.info({ demo: r }, "demo seed")).catch((e) => app.log.error(e, "demo seed failed"));

await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
