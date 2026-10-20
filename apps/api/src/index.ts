import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { adminRoutes } from "./routes/admin.js";
import { publicRoutes } from "./routes/public.js";
import { platformRoutes, launchRoutes } from "./routes/sportsbook.js";
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
setInterval(() => expireBonuses(db).catch((e) => app.log.error(e)), 5 * 60_000);

await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
