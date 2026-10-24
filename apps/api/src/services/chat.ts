/**
 * Sohbet: mesajlar, otomatik moderasyon, yağmur (rain) ve bahşiş (tip).
 *
 * Moderasyon (sunucu tarafında, her mesajda):
 *  - küfür / hakaret  → PROFANITY
 *  - para/bakiye dilenme ("para at", "tip at", "iban", "borç ver"...) → BEGGING
 *  - link / başka site reklamı / telefon numarası → LINK
 *  - aynı mesajı tekrar / çok hızlı yazma → SPAM / FLOOD
 * İhlal mesajı yayınlanmaz, ChatViolation'a yazılır ve kademeli ceza verilir:
 *   1. uyarı + 10 dk susturma · 2. 1 saat · 3. 24 saat · 5+. sohbetten kalıcı men (admin kaldırabilir)
 */
import { Prisma, PrismaClient, TxType, WalletType } from "@prisma/client";
import { move } from "./wallet.js";

export class ChatError extends Error { detail?: any; constructor(m: string, detail?: any) { super(m); this.detail = detail; } }
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// ---------- ayarlar ----------
export type ChatConfig = {
  enabled: boolean;
  maxLen: number;
  slowModeSec: number;          // iki mesaj arası en az süre
  minAccountHours: number;      // yazabilmek için hesap yaşı
  requireDeposit: boolean;      // yazabilmek için en az 1 ödenmiş yatırım
  extraBannedWords: string[];   // admin listesi
  rain: { enabled: boolean; minAmount: number; maxAmount: number; durationSec: number; minShare: number; joinRequireDeposit: boolean; joinMinAccountHours: number };
  tip: { enabled: boolean; minAmount: number; maxAmount: number; dailyMax: number; requireDeposit: boolean };
};
export const CHAT_DEFAULTS: ChatConfig = {
  enabled: true, maxLen: 200, slowModeSec: 3, minAccountHours: 0, requireDeposit: false, extraBannedWords: [],
  rain: { enabled: true, minAmount: 50, maxAmount: 50000, durationSec: 60, minShare: 1, joinRequireDeposit: true, joinMinAccountHours: 24 },
  tip: { enabled: true, minAmount: 10, maxAmount: 20000, dailyMax: 50000, requireDeposit: true },
};
export async function getChatConfig(db: PrismaClient | Prisma.TransactionClient, siteId: number): Promise<ChatConfig> {
  const row = await (db as PrismaClient).cmsSetting.findUnique({ where: { siteId_key: { siteId, key: "chat_config" } } });
  const v: any = row?.value ?? {};
  return { ...CHAT_DEFAULTS, ...v, rain: { ...CHAT_DEFAULTS.rain, ...(v.rain ?? {}) }, tip: { ...CHAT_DEFAULTS.tip, ...(v.tip ?? {}) } };
}
export async function setChatConfig(db: PrismaClient, siteId: number, patch: any) {
  const cur = await getChatConfig(db, siteId);
  const next = { ...cur, ...patch, rain: { ...cur.rain, ...(patch.rain ?? {}) }, tip: { ...cur.tip, ...(patch.tip ?? {}) } };
  if (next.rain.minAmount > next.rain.maxAmount) throw new ChatError("RAIN_MIN_GT_MAX");
  if (next.tip.minAmount > next.tip.maxAmount) throw new ChatError("TIP_MIN_GT_MAX");
  await db.cmsSetting.upsert({ where: { siteId_key: { siteId, key: "chat_config" } }, update: { value: next as any }, create: { siteId, key: "chat_config", value: next as any } });
  return next;
}

// ---------- moderasyon ----------
// Türkçe harfleri sadeleştir (rakamlara dokunmaz) — dilenme / link / telefon tespiti için
const fold = (t: string) => t.toLocaleLowerCase("tr").replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
// Leet/karakter oyunlarını da sadeleştir: "s1k", "s.i.k" → küfür tespiti için
export function normalize(t: string) {
  return fold(t).replace(/[@4]/g, "a").replace(/[1!|]/g, "i").replace(/0/g, "o").replace(/3/g, "e").replace(/\$|5/g, "s").replace(/7/g, "t").replace(/(.)\1{2,}/g, "$1$1");
}
const squash = (t: string) => normalize(t).replace(/[^a-z]/g, ""); // harfler arası boşluk/nokta hilesine karşı

// Kök listesi (Türkçe + yaygın İngilizce). ≤3 harfli kökler yalnızca tam kelime olarak eşleşir.
const PROFANITY_ROOTS = [
  "amk", "aq", "amq", "amina", "aminakoyim", "aminakoydum", "amcik", "amcuk", "orospu", "orosbu", "orspu", "pic", "piclik", "sik", "sikerim", "siktir", "sikik", "sikis", "sikim", "yarak", "yarrak", "yarram",
  "gotveren", "gotune", "ibne", "ipne", "kahpe", "kaltak", "pezevenk", "pezeveng", "serefsiz", "gavat", "kavat", "yavsak", "anani", "ananin", "bacini", "surtuk", "dalyarak", "gerizekali",
  "fuck", "fucking", "shit", "bitch", "cunt", "pussy", "motherfucker", "nigger", "faggot",
].map((w) => normalize(w));
// sıkıştırılmış metinde de güvenle aranabilecek uzun kökler (kısa kökler masum kelimelerde yanlış alarm verir)
const PROFANITY_SQUASH = ["aminakoy", "orospu", "siktir", "sikerim", "yarrak", "pezevenk", "serefsiz", "gotveren", "dalyarak", "motherfucker", "fucking"];
const BEGGING = [
  /\b(para|bakiye|bonus|tip|bahsis|kredi|cip|chip)\s*(at|atin|atsin|atar misin|atabilir|gonder|gonderin|yolla|ver|verin|versin|lazim)\b/,
  /\b(yagmur|rain)\s*(yap|yapin|yapsin|yapar misin|at|atin|lazim)\b/,
  /\b(bana|bize|biri|birisi|kimse)\b.{0,30}\b(para|bakiye|tip|bahsis|yagmur|rain|\d+\s*(tl|lira))\b/,
  /\b(iban|papara|ininal)\b/, /\btr\s?\d{2}\s?\d{4}/,
  /\bborc\s*(ver|isti|lazim)/,
  /\b\d{2,6}\s*(tl|lira|₺)\s*(at|ver|gonder|yolla|lazim)\b/,
  /\b(send|give|tip)\s*(me|pls|please)\b/, /\b(any tip|spare (some|me))\b/,
];
const LINK = [/https?:\/\//, /\bwww\./, /\b[a-z0-9-]{2,}\.(com|net|org|io|bet|xyz|link|top|tr|me|gg|vip|club|site|online)\b/, /\bt\.me\b|discord\.gg|wa\.me|bit\.ly/, /(\+?90\s?)?\b5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/];

export function moderate(text: string, extra: string[] = []): { ok: true } | { ok: false; reason: "PROFANITY" | "BEGGING" | "LINK" } {
  const low = fold(text);
  const words = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  const roots = [...PROFANITY_ROOTS, ...extra.map((w) => normalize(w))];
  if (words.some((w) => roots.some((r) => (r.length <= 3 ? w === r : w === r || w.startsWith(r))))) return { ok: false, reason: "PROFANITY" };
  const sq = squash(text);
  if ([...PROFANITY_SQUASH, ...extra.map((w) => squash(w)).filter((w) => w.length >= 5)].some((r) => sq.includes(r))) return { ok: false, reason: "PROFANITY" };
  if (LINK.some((r) => r.test(low))) return { ok: false, reason: "LINK" };
  if (BEGGING.some((r) => r.test(low))) return { ok: false, reason: "BEGGING" };
  return { ok: true };
}

const PENALTY = (strikes: number): { action: string; minutes: number | null } =>
  strikes <= 1 ? { action: "MUTE_10M", minutes: 10 } : strikes === 2 ? { action: "MUTE_1H", minutes: 60 } : strikes <= 4 ? { action: "MUTE_24H", minutes: 1440 } : { action: "BAN", minutes: null };
const REASON_TR: Record<string, string> = { PROFANITY: "küfür / hakaret", BEGGING: "dilenme (para/bahşiş isteme)", LINK: "link / reklam / iletişim bilgisi", SPAM: "tekrarlanan mesaj", FLOOD: "çok hızlı mesaj" };

// ---------- çevrimiçi sayacı (bellek) ----------
const seen = new Map<string, number>(); // `${siteId}:${key}` → ts
export function touchOnline(siteId: number, key: string) { seen.set(`${siteId}:${key}`, Date.now()); }
export function onlineCount(siteId: number) {
  const lim = Date.now() - 90_000; let n = 0;
  for (const [k, t] of seen) { if (t < lim) seen.delete(k); else if (k.startsWith(`${siteId}:`)) n++; }
  return n;
}

// ---------- yardımcılar ----------
const lastPost = new Map<number, { at: number; text: string }>();
export const publicName = (u: string) => (/@|^\+?\d{9,}$/.test(u) ? u.slice(0, 2) + "***" + u.slice(-2) : u); // e-posta / telefon gibi kullanıcı adlarını maskele

async function eligible(db: PrismaClient | Prisma.TransactionClient, player: { id: number; createdAt: Date }, hours: number, needDeposit: boolean) {
  if (hours > 0 && Date.now() - new Date(player.createdAt).getTime() < hours * 3600_000) return "ACCOUNT_TOO_NEW";
  if (needDeposit && !(await db.paymentRequest.findFirst({ where: { playerId: player.id, type: "DEPOSIT", state: "PAID" }, select: { id: true } }))) return "DEPOSIT_REQUIRED";
  return null;
}
export function muteState(p: { chatBanned: boolean; chatMutedUntil: Date | null }) {
  if (p.chatBanned) return { banned: true, mutedUntil: null };
  if (p.chatMutedUntil && new Date(p.chatMutedUntil).getTime() > Date.now()) return { banned: false, mutedUntil: p.chatMutedUntil };
  return null;
}

// ---------- mesaj ----------
export async function postMessage(db: PrismaClient, playerId: number, raw: string, room = "tr") {
  const p = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  const cfg = await getChatConfig(db, p.siteId);
  if (!cfg.enabled) throw new ChatError("CHAT_DISABLED");
  if (p.status !== "OPEN") throw new ChatError("ACCOUNT_BLOCKED");
  const ms = muteState(p); if (ms) throw new ChatError(ms.banned ? "CHAT_BANNED" : "CHAT_MUTED", ms);
  const why = await eligible(db, p, cfg.minAccountHours, cfg.requireDeposit); if (why) throw new ChatError(`CHAT_${why}`);
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) throw new ChatError("EMPTY_MESSAGE");
  if (text.length > cfg.maxLen) throw new ChatError("MESSAGE_TOO_LONG", { max: cfg.maxLen });
  const last = lastPost.get(playerId);
  if (last && Date.now() - last.at < cfg.slowModeSec * 1000) throw new ChatError("SLOW_MODE", { waitSec: Math.ceil((cfg.slowModeSec * 1000 - (Date.now() - last.at)) / 1000) });

  let reason: string | null = null;
  const mod = moderate(text, cfg.extraBannedWords);
  if (!mod.ok) reason = mod.reason;
  else if (last && normalize(last.text) === normalize(text) && Date.now() - last.at < 60_000) reason = "SPAM";
  if (reason) {
    const strikes = p.chatStrikes + 1;
    const pen = reason === "SPAM" ? { action: "WARN", minutes: null as number | null } : PENALTY(strikes);
    await db.$transaction([
      db.chatViolation.create({ data: { siteId: p.siteId, playerId, text, reason, action: pen.action } }),
      db.player.update({ where: { id: playerId }, data: reason === "SPAM" ? {} : { chatStrikes: strikes, ...(pen.action === "BAN" ? { chatBanned: true } : { chatMutedUntil: new Date(Date.now() + (pen.minutes ?? 0) * 60_000) }) } }),
    ]);
    throw new ChatError("MESSAGE_BLOCKED", { reason, reasonText: REASON_TR[reason], action: pen.action, minutes: pen.minutes, strikes });
  }
  lastPost.set(playerId, { at: Date.now(), text });
  return db.chatMessage.create({ data: { siteId: p.siteId, room, playerId, text } });
}

export async function listMessages(db: PrismaClient, siteId: number, room: string, after?: number) {
  const where = { siteId, room, deleted: false, ...(after ? { id: { gt: after } } : {}) };
  const rows = after
    ? await db.chatMessage.findMany({ where, orderBy: { id: "asc" }, take: 100 })
    : (await db.chatMessage.findMany({ where, orderBy: { id: "desc" }, take: 60 })).reverse();
  const ids = [...new Set(rows.map((r) => r.playerId).filter((x): x is number => x != null))];
  const ps = ids.length ? await db.player.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatar: true } }) : [];
  const pm = new Map(ps.map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = r.playerId ? pm.get(r.playerId) : null;
    return { id: r.id, kind: r.kind, text: r.text, meta: r.meta, at: r.createdAt, user: p ? { id: p.id, name: publicName(p.username), avatar: p.avatar } : null };
  });
}
/** Silinen mesaj id'leri (istemci listeden düşsün) */
export async function deletedSince(db: PrismaClient, siteId: number, room: string, sinceId: number) {
  return (await db.chatMessage.findMany({ where: { siteId, room, deleted: true, id: { gte: sinceId } }, select: { id: true }, take: 200 })).map((r) => r.id);
}

// ---------- yağmur ----------
export async function startRain(db: PrismaClient, opts: { siteId: number; room?: string; playerId?: number; adminId?: number; amount: number; durationSec?: number }) {
  const cfg = await getChatConfig(db, opts.siteId);
  if (!cfg.rain.enabled) throw new ChatError("RAIN_DISABLED");
  const amount = Math.round(opts.amount * 100) / 100;
  if (opts.playerId) {
    if (amount < cfg.rain.minAmount) throw new ChatError("RAIN_MIN", { min: cfg.rain.minAmount });
    if (amount > cfg.rain.maxAmount) throw new ChatError("RAIN_MAX", { max: cfg.rain.maxAmount });
  } else if (!(amount > 0)) throw new ChatError("INVALID_AMOUNT");
  const room = opts.room ?? "tr";
  const open = await db.chatRain.findFirst({ where: { siteId: opts.siteId, room, state: "OPEN" } });
  if (open) throw new ChatError("RAIN_ALREADY_ACTIVE");
  const dur = Math.min(300, Math.max(20, opts.durationSec ?? cfg.rain.durationSec));
  return db.$transaction(async (tx) => {
    let hostName = "Kasa";
    if (opts.playerId) {
      const p = await tx.player.findUniqueOrThrow({ where: { id: opts.playerId } });
      const ms = muteState(p); if (ms) throw new ChatError(ms.banned ? "CHAT_BANNED" : "CHAT_MUTED", ms);
      if (p.status !== "OPEN") throw new ChatError("ACCOUNT_BLOCKED");
      hostName = publicName(p.username);
    }
    const rain = await tx.chatRain.create({ data: { siteId: opts.siteId, room, hostPlayerId: opts.playerId ?? null, hostAdminId: opts.adminId ?? null, amount, endsAt: new Date(Date.now() + dur * 1000) } });
    if (opts.playerId) {
      try { await move(tx, { playerId: opts.playerId, wallet: WalletType.MAIN, type: TxType.RAIN_SEND, amount: -amount, reference: `rain:${rain.id}`, note: "Sohbet yağmuru" }); }
      catch (e: any) { if (e.message === "INSUFFICIENT_FUNDS") throw new ChatError("INSUFFICIENT_BALANCE"); throw e; }
    }
    const msg = await tx.chatMessage.create({ data: { siteId: opts.siteId, room, playerId: opts.playerId ?? null, kind: "RAIN", text: `${hostName} ₺${amount.toLocaleString("tr-TR")} yağmur başlattı!`, meta: { rainId: rain.id, amount, endsAt: rain.endsAt.toISOString(), host: hostName } } });
    await tx.chatRain.update({ where: { id: rain.id }, data: { messageId: msg.id } });
    return rain;
  });
}

export async function joinRain(db: PrismaClient, playerId: number, rainId: number) {
  const p = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  const rain = await db.chatRain.findUnique({ where: { id: rainId } });
  if (!rain || rain.siteId !== p.siteId) throw new ChatError("RAIN_NOT_FOUND");
  if (rain.state !== "OPEN" || rain.endsAt.getTime() <= Date.now()) throw new ChatError("RAIN_ENDED");
  if (rain.hostPlayerId === playerId) throw new ChatError("RAIN_OWN");
  if (p.status !== "OPEN" || p.chatBanned) throw new ChatError("RAIN_NOT_ALLOWED");
  const cfg = await getChatConfig(db, p.siteId);
  const why = await eligible(db, p, cfg.rain.joinMinAccountHours, cfg.rain.joinRequireDeposit); if (why) throw new ChatError(`RAIN_${why}`);
  const maxUsers = Math.floor(Number(rain.amount) / cfg.rain.minShare);
  if (rain.joinCount >= maxUsers) throw new ChatError("RAIN_FULL");
  try {
    await db.$transaction([db.chatRainEntry.create({ data: { rainId, playerId } }), db.chatRain.update({ where: { id: rainId }, data: { joinCount: { increment: 1 } } })]);
  } catch (e: any) { if (e.code === "P2002") throw new ChatError("RAIN_ALREADY_JOINED"); throw e; }
  return { ok: true };
}

/** Süresi dolan yağmurları dağıt (cron, 5 sn). Eşit pay, kuruş artığı/katılımcı yoksa iade. */
export async function settleRains(db: PrismaClient) {
  const due = await db.chatRain.findMany({ where: { state: "OPEN", endsAt: { lte: new Date() } }, take: 10 });
  for (const r of due) {
    await db.$transaction(async (tx) => {
      const lock = await tx.chatRain.updateMany({ where: { id: r.id, state: "OPEN" }, data: { state: "SETTLING" } });
      if (!lock.count) return;
      const entries = await tx.chatRainEntry.findMany({ where: { rainId: r.id } });
      const total = D(r.amount);
      if (!entries.length) {
        if (r.hostPlayerId) await move(tx, { playerId: r.hostPlayerId, wallet: WalletType.MAIN, type: TxType.RAIN_REFUND, amount: total, reference: `rain:${r.id}`, note: "Yağmura katılım olmadı — iade" });
        await tx.chatRain.update({ where: { id: r.id }, data: { state: "REFUNDED" } });
        await tx.chatMessage.create({ data: { siteId: r.siteId, room: r.room, kind: "SYSTEM", text: "Yağmura kimse katılmadı, tutar iade edildi.", meta: { rainId: r.id } } });
        return;
      }
      const share = total.div(entries.length).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      for (const e of entries) {
        await move(tx, { playerId: e.playerId, wallet: WalletType.MAIN, type: TxType.RAIN_RECEIVE, amount: share, reference: `rain:${r.id}`, note: "Sohbet yağmuru payı" });
        await tx.chatRainEntry.update({ where: { id: e.id }, data: { amount: share } });
      }
      const rest = total.sub(share.mul(entries.length));
      if (rest.gt(0) && r.hostPlayerId) await move(tx, { playerId: r.hostPlayerId, wallet: WalletType.MAIN, type: TxType.RAIN_REFUND, amount: rest, reference: `rain:${r.id}`, note: "Yağmur kuruş artığı iadesi" });
      await tx.chatRain.update({ where: { id: r.id }, data: { state: "DONE", share } });
      await tx.chatMessage.create({ data: { siteId: r.siteId, room: r.room, kind: "SYSTEM", text: `Yağmur bitti: ${entries.length} kişiye ₺${Number(share).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} dağıtıldı.`, meta: { rainId: r.id, share: Number(share), count: entries.length } } });
    });
  }
  return due.length;
}

// ---------- bahşiş ----------
export async function sendTip(db: PrismaClient, fromId: number, toUsername: string, amount: number, announce: boolean) {
  const from = await db.player.findUniqueOrThrow({ where: { id: fromId } });
  const cfg = await getChatConfig(db, from.siteId);
  if (!cfg.tip.enabled) throw new ChatError("TIP_DISABLED");
  const amt = Math.round(amount * 100) / 100;
  if (amt < cfg.tip.minAmount) throw new ChatError("TIP_MIN", { min: cfg.tip.minAmount });
  if (amt > cfg.tip.maxAmount) throw new ChatError("TIP_MAX", { max: cfg.tip.maxAmount });
  if (from.status !== "OPEN") throw new ChatError("ACCOUNT_BLOCKED");
  const to = await db.player.findFirst({ where: { siteId: from.siteId, username: { equals: toUsername.trim(), mode: "insensitive" } } });
  if (!to) throw new ChatError("USER_NOT_FOUND");
  if (to.id === from.id) throw new ChatError("TIP_SELF");
  if (to.status !== "OPEN") throw new ChatError("RECIPIENT_UNAVAILABLE");
  const why = await eligible(db, from, 0, cfg.tip.requireDeposit); if (why) throw new ChatError(`TIP_${why}`);
  const since = new Date(Date.now() - 86400_000);
  const sent = await db.transaction.aggregate({ where: { playerId: from.id, type: TxType.TIP_SEND, createdAt: { gte: since } }, _sum: { amount: true } });
  if (Math.abs(Number(sent._sum.amount ?? 0)) + amt > cfg.tip.dailyMax) throw new ChatError("TIP_DAILY_LIMIT", { max: cfg.tip.dailyMax });
  return db.$transaction(async (tx) => {
    const ref = `tip:${from.id}:${to.id}:${Date.now()}`;
    try { await move(tx, { playerId: from.id, wallet: WalletType.MAIN, type: TxType.TIP_SEND, amount: -amt, reference: ref, note: `Bahşiş → ${to.username}` }); }
    catch (e: any) { if (e.message === "INSUFFICIENT_FUNDS") throw new ChatError("INSUFFICIENT_BALANCE"); throw e; }
    await move(tx, { playerId: to.id, wallet: WalletType.MAIN, type: TxType.TIP_RECEIVE, amount: amt, reference: ref, note: `Bahşiş ← ${from.username}` });
    if (announce) await tx.chatMessage.create({ data: { siteId: from.siteId, room: "tr", playerId: from.id, kind: "TIP", text: `${publicName(from.username)}, ${publicName(to.username)} kullanıcısına ₺${amt.toLocaleString("tr-TR")} bahşiş gönderdi`, meta: { to: publicName(to.username), amount: amt } } });
    return { ok: true, to: publicName(to.username), amount: amt };
  });
}

// ---------- herkese açık profil ----------
export async function publicProfile(db: PrismaClient, siteId: number, id: number) {
  const p = await db.player.findFirst({ where: { id, siteId }, select: { id: true, username: true, avatar: true, createdAt: true, hideStats: true, isVerified: true } });
  if (!p) return null;
  const base = { id: p.id, name: publicName(p.username), avatar: p.avatar, joinedAt: p.createdAt, verified: p.isVerified, hidden: p.hideStats };
  if (p.hideStats) return base;
  const [bets, betAgg, pred] = await Promise.all([
    db.bet.count({ where: { playerId: id, state: { not: "CANCELLED" } } }),
    db.bet.aggregate({ where: { playerId: id, state: { in: ["WON", "LOST", "RETURNED", "CASHED_OUT"] } }, _sum: { stake: true, winAmount: true } }),
    db.predictionPosition.aggregate({ where: { playerId: id }, _count: true, _sum: { stake: true, payout: true } }).catch(() => ({ _count: 0, _sum: { stake: 0, payout: 0 } } as any)),
  ]);
  const wagered = Number(betAgg._sum.stake ?? 0) + Number(pred._sum?.stake ?? 0);
  const won = Number(betAgg._sum.winAmount ?? 0) + Number(pred._sum?.payout ?? 0);
  return { ...base, stats: { bets: bets + (pred._count ?? 0), wagered, net: won - wagered } };
}
