/**
 * Çoklu site (multi-tenant) yardımcıları.
 * - Oyuncu tarafı istek hangi siteye ait? X-Site başlığı (kod) → yoksa Origin/Referer domaini → yoksa varsayılan site (id 1).
 * - Backoffice, seçili siteyi X-Site başlığıyla gönderir.
 * - Tahmin piyasaları ve prediction_* ayarları GLOBALDİR (siteId = 1 altında saklanır).
 */
import type { FastifyRequest } from "fastify";
import { Prisma, PrismaClient, Site } from "@prisma/client";

export const GLOBAL_SITE = 1;

let cache: { at: number; list: Site[] } = { at: 0, list: [] };
export async function allSites(db: PrismaClient, force = false) {
  if (force || Date.now() - cache.at > 30_000) {
    cache = { at: Date.now(), list: await db.site.findMany({ orderBy: { id: "asc" } }) };
  }
  return cache.list;
}
export const bustSiteCache = () => { cache.at = 0; };

const hostOf = (v?: string) => { try { return v ? new URL(v).host.toLowerCase() : ""; } catch { return ""; } };

export async function resolveSite(db: PrismaClient, req: FastifyRequest): Promise<Site> {
  const sites = await allSites(db);
  const code = (req.headers["x-site"] as string | undefined)?.trim().toLowerCase();
  if (code) {
    const s = sites.find((x) => x.code.toLowerCase() === code);
    if (s) return s;
  }
  const host = hostOf(req.headers.origin as string) || hostOf(req.headers.referer as string);
  if (host) {
    const s = sites.find((x) => x.domain?.toLowerCase() === host || (x.domain && host === "www." + x.domain.toLowerCase()));
    if (s) return s;
  }
  return sites.find((x) => x.id === GLOBAL_SITE) ?? sites[0];
}

/** Cüzdan/webhook imzası için denenecek tüm anahtarlar (env + site bazlı) */
export async function walletSecrets(db: PrismaClient): Promise<string[]> {
  const sites = await allSites(db);
  const out = new Set<string>();
  if (process.env.SPORTSBOOK_WALLET_SECRET) out.add(process.env.SPORTSBOOK_WALLET_SECRET);
  for (const s of sites) if (s.sbWalletSecret) out.add(s.sbWalletSecret);
  return [...out];
}

// ---------- CmsSetting (bileşik anahtar) yardımcıları ----------
export async function getSetting<T = any>(db: PrismaClient | Prisma.TransactionClient, key: string, siteId = GLOBAL_SITE): Promise<T | null> {
  const r = await (db as PrismaClient).cmsSetting.findUnique({ where: { siteId_key: { siteId, key } } });
  return (r?.value as T) ?? null;
}
export async function setSetting(db: PrismaClient | Prisma.TransactionClient, key: string, value: unknown, siteId = GLOBAL_SITE) {
  return (db as PrismaClient).cmsSetting.upsert({ where: { siteId_key: { siteId, key } }, update: { value: value as any }, create: { siteId, key, value: value as any } });
}

/** Yeni site için varsayılan içerikler */
export async function seedSiteDefaults(db: PrismaClient, site: Site) {
  if ((await db.paymentSystem.count({ where: { siteId: site.id } })) === 0) {
    await db.paymentSystem.createMany({ data: [
      { siteId: site.id, name: "BankTransfer", displayName: "Havale / EFT", kind: "BOTH", minAmount: 100, fields: [{ key: "fullName", label: "Ad Soyad" }, { key: "iban", label: "IBAN" }] },
      { siteId: site.id, name: "CryptoUSDT", displayName: "USDT (TRC20)", kind: "BOTH", minAmount: 100, fields: [{ key: "address", label: "TRC20 Cüzdan Adresiniz" }], config: { network: "TRC20", depositAddress: "", requireTxid: true } },
    ] });
  }
  if (!(await getSetting(db, "site_general", site.id))) await setSetting(db, "site_general", { siteName: site.name }, site.id);
}
