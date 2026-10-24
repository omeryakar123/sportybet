import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { adminRoutes } from "./routes/admin.js";
import { publicRoutes } from "./routes/public.js";
import { sbSiteRoutes } from "./routes/sb.js";
import { siteRoutes } from "./routes/site.js";
import { predictionSiteRoutes } from "./routes/predictions.js";
import { autoClose, syncFeed } from "./services/predictions.js";
import { syncFixtures, syncOdds, syncResults, syncLive, getConfig as sbConfig, liveMinInterval } from "./services/sb.js";
import { seedDemo } from "./services/demo.js";
import { expireBonuses } from "./services/bonus.js";
import { seedSiteDefaults, bustSiteCache } from "./services/sites.js";

// BigInt alanları JSON'a string olarak çıksın
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

export const db = new PrismaClient();
const app = Fastify({ logger: true });

// Çoklu site: her sitenin kendi domaini olabileceği için origin'i yansıtıyoruz.
// (Kimlik doğrulama Bearer token ile yapılır, çerez kullanılmaz; bu yüzden güvenli.)
await app.register(cors, { origin: true, credentials: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret" });

app.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));

await app.register(publicRoutes, { prefix: "/api" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(siteRoutes, { prefix: "/api" }); // oyuncu hesabı, ödemeler, bonuslar
await app.register(sbSiteRoutes, { prefix: "/api" }); // kendi sportsbook motorumuz (maç listesi, kupon)
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
// Varsayılan site (id 1) — tüm eski kayıtlar @default(1) ile buna bağlanır
{
  let s = await db.site.findUnique({ where: { id: 1 } });
  if (!s) {
    s = await db.site.create({ data: { code: process.env.DEFAULT_SITE_CODE ?? "sportybet", name: process.env.DEFAULT_SITE_NAME ?? "SportyBet", domain: process.env.DEFAULT_SITE_DOMAIN ?? null } });
    // id'nin 1 olduğundan emin ol (boş tabloda ilk kayıt 1'dir)
    app.log.info({ site: s.id }, "Varsayılan site oluşturuldu");
    bustSiteCache();
  }
  await seedSiteDefaults(db, s);
  // Mevcut kripto yönteminde config yoksa varsayılanı yaz (eski kurulumlar için)
  const cu = await db.paymentSystem.findFirst({ where: { siteId: 1, name: "CryptoUSDT" } });
  if (cu && !cu.config) await db.paymentSystem.update({ where: { id: cu.id }, data: { config: { network: "TRC20", depositAddress: "", requireTxid: true } } });
}
setInterval(() => expireBonuses(db).catch((e) => app.log.error(e)), 5 * 60_000);
setInterval(() => autoClose(db).catch((e) => app.log.error(e)), 60_000); // süresi dolan tahmin piyasalarını kapat
setInterval(() => syncFeed(db).catch((e) => app.log.error(e)), 5 * 60_000); // tahmin feed senkronu (ayarlıysa)

// ---- Sportsbook feed (API-Football) crons ----
// Kota (ücretsiz plan 100/gün) feed.ts'deki kalan-kredi takibiyle korunur; aşağıdaki aralıklar güvenli tabandır.
const SB_ON = () => Boolean(process.env.APISPORTS_KEY);
// Program/skor: 3 saatte bir (gün sayısı kadar çağrı)
setInterval(() => { if (SB_ON()) syncFixtures(db).catch((e) => app.log.error(e, "sb fixtures")); }, 3 * 3600_000);
// Oranlar: 90 dk'da bir, config.oddsPerRun kadar maç (önce oranı hiç olmayanlar)
setInterval(() => { if (SB_ON()) syncOdds(db).catch((e) => app.log.error(e, "sb odds")); }, 90 * 60_000);
// Sonuçlandırma: 10 dk'da bir — sadece başlamış/bitmemiş maç varsa API'ye gider (tek çağrı/20 maç)
setInterval(() => { if (SB_ON()) syncResults(db).catch((e) => app.log.error(e, "sb results")); }, 10 * 60_000);
// Canlı oranlar: ayarlanan aralıkta, ama kotanın izin verdiğinden sık değil (kota yetmezse oranlar bayatlar → canlı otomatik kilitlenir)
async function liveLoop() {
  let next = 60;
  try {
    const c = await sbConfig(db);
    if (SB_ON() && c.enabled && c.liveEnabled) {
      await syncLive(db);
      const min = liveMinInterval();
      next = Math.max(c.liveIntervalSec, min === null ? 0 : Math.min(min, 3600));
    }
  } catch (e) { app.log.error(e, "sb live"); }
  setTimeout(liveLoop, next * 1000);
}
setTimeout(liveLoop, 8000);
// Açılışta bir kez program + oran
if (SB_ON()) setTimeout(() => syncFixtures(db).then(() => syncOdds(db)).catch((e) => app.log.error(e, "sb boot sync")), 4000);

// DEMO_SEED=1 ise açılışta demo veri yüklenir (zaten varsa atlar). Yükledikten sonra env'den kaldırın.
if (process.env.DEMO_SEED === "1") seedDemo(db).then((r) => app.log.info({ demo: r }, "demo seed")).catch((e) => app.log.error(e, "demo seed failed"));

await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
