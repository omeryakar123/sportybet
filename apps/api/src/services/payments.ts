/**
 * Yatırım / çekim talepleri.
 *
 * Çekim:  oyuncu talep eder → tutar ANA cüzdandan hemen BLOKE edilir (WITHDRAWAL hareketi)
 *         NEW → (admin onay) PENDING → (ödendi) PAID
 *         NEW/PENDING → REJECTED (admin) veya CANCELLED (oyuncu, sadece NEW) → tutar iade (WITHDRAWAL_REFUND)
 *         Aktif bonusu olan ve bonusu çekime izin vermeyen oyuncu çekim yapamaz.
 * Yatırım: oyuncu talep eder (NEW) → admin/PSP onaylar → PAID → tutar ANA cüzdana yatar (DEPOSIT)
 *         Talepte yatırım bonusu seçildiyse PAID anında bonus verilir.
 */
import { Prisma, PrismaClient, PaymentState, PaymentType, PlayerBonusState, TxType, WalletType, BonusType } from "@prisma/client";
import { move } from "./wallet.js";
import { grantBonus } from "./bonus.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export class BizError extends Error { detail?: any; }

async function checkSystem(db: PrismaClient, siteId: number, name: string, type: PaymentType, amount: Prisma.Decimal) {
  const ps = await db.paymentSystem.findFirst({ where: { siteId, name } });
  if (!ps || !ps.isActive) throw new BizError("PAYMENT_SYSTEM_NOT_AVAILABLE");
  if (ps.kind !== "BOTH" && ps.kind !== type) throw new BizError("PAYMENT_SYSTEM_NOT_AVAILABLE");
  if (amount.lt(ps.minAmount)) throw new BizError("BELOW_MIN_AMOUNT");
  if (ps.maxAmount && amount.gt(ps.maxAmount)) throw new BizError("ABOVE_MAX_AMOUNT");
  return ps;
}

/** Tutar: pozitif, en fazla 2 ondalık (kuruş) */
function cleanAmount(v: number) {
  if (!Number.isFinite(v)) throw new BizError("INVALID_AMOUNT");
  const amount = D(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  if (amount.lte(0)) throw new BizError("INVALID_AMOUNT");
  return amount;
}
const MAX_OPEN_DEPOSITS = 3;

export async function createWithdrawal(db: PrismaClient, playerId: number, b: { paymentSystem: string; amount: number; info?: Record<string, unknown> }) {
  const amount = cleanAmount(b.amount);
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.status !== "OPEN") throw new BizError("ACCOUNT_BLOCKED");
  const ps = await checkSystem(db, player.siteId, b.paymentSystem, PaymentType.WITHDRAWAL, amount);
  // yöntemin istediği alanlar (IBAN, cüzdan adresi…) sunucuda da zorunlu
  const info: Record<string, string> = {};
  for (const f of (Array.isArray(ps.fields) ? ps.fields : []) as any[]) {
    const v = String((b.info ?? {})[f.key] ?? "").trim();
    if (!v) { const e = new BizError("MISSING_FIELD"); e.detail = { field: f.label ?? f.key }; throw e; }
    info[f.key] = v.slice(0, 200);
  }
  const blocking = await db.playerBonus.findFirst({ where: { playerId, state: PlayerBonusState.ACTIVE, bonus: { allowWithdrawal: false } }, include: { bonus: true } });
  if (blocking) throw new BizError("ACTIVE_BONUS_BLOCKS_WITHDRAWAL");

  return db.$transaction(async (tx) => {
    // aynı anda iki talep yarışını engelle: oyuncu satırını kilitle, sonra açık talep kontrolü
    await tx.$queryRaw`SELECT id FROM "Player" WHERE id = ${playerId} FOR UPDATE`;
    const open = await tx.paymentRequest.count({ where: { playerId, type: PaymentType.WITHDRAWAL, state: { in: [PaymentState.NEW, PaymentState.PENDING] } } });
    if (open > 0) throw new BizError("OPEN_WITHDRAWAL_EXISTS");
    const req = await tx.paymentRequest.create({
      data: { playerId, type: PaymentType.WITHDRAWAL, amount, paymentSystem: b.paymentSystem, info: info as any, currency: player.currency },
    });
    try {
      await move(tx, { playerId, wallet: WalletType.MAIN, type: TxType.WITHDRAWAL, amount: amount.neg(), paymentSystem: b.paymentSystem, reference: `pay:${req.id}`, note: "Çekim talebi (bloke)" });
    } catch (e: any) {
      if (e.message === "INSUFFICIENT_FUNDS") throw new BizError("INSUFFICIENT_BALANCE");
      throw e;
    }
    return req;
  });
}

export async function createDeposit(db: PrismaClient, playerId: number, b: { paymentSystem: string; amount: number; bonusId?: number; info?: Record<string, unknown> }) {
  const amount = cleanAmount(b.amount);
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.status !== "OPEN") throw new BizError("ACCOUNT_BLOCKED");
  const ps = await checkSystem(db, player.siteId, b.paymentSystem, PaymentType.DEPOSIT, amount);
  const cfg = (ps.config ?? {}) as any;
  const txid = String((b.info ?? {}).txid ?? "").trim();
  if (cfg.requireTxid && !String(cfg.depositAddress ?? "").trim()) throw new BizError("DEPOSIT_ADDRESS_MISSING");
  if (cfg.requireTxid && txid.length < 8) throw new BizError("TXID_REQUIRED");
  if (txid) {
    const used = await db.paymentRequest.findFirst({ where: { type: PaymentType.DEPOSIT, state: { not: PaymentState.REJECTED }, info: { path: ["txid"], equals: txid } } });
    if (used) throw new BizError("TXID_USED");
  }
  if (b.bonusId) {
    const bonus = await db.bonus.findUnique({ where: { id: b.bonusId } });
    if (!bonus || !bonus.isActive || bonus.type !== BonusType.DEPOSIT || bonus.siteId !== player.siteId) throw new BizError("BONUS_NOT_AVAILABLE");
    if (player.excludedFromBonuses) throw new BizError("PLAYER_EXCLUDED_FROM_BONUSES");
    if (await db.playerBonus.findFirst({ where: { playerId, state: PlayerBonusState.ACTIVE } })) throw new BizError("ACTIVE_BONUS_EXISTS");
    if (bonus.minAmount && amount.lt(bonus.minAmount)) { const e = new BizError("BONUS_MIN_DEPOSIT"); e.detail = { min: Number(bonus.minAmount) }; throw e; }
  }
  const open = await db.paymentRequest.count({ where: { playerId, type: PaymentType.DEPOSIT, state: { in: [PaymentState.NEW, PaymentState.PENDING] } } });
  if (open >= MAX_OPEN_DEPOSITS) throw new BizError("OPEN_DEPOSIT_LIMIT");
  return db.paymentRequest.create({
    data: { playerId, type: PaymentType.DEPOSIT, amount, paymentSystem: b.paymentSystem, bonusId: b.bonusId, info: (txid ? { txid, network: cfg.network ?? null } : {}) as any, currency: player.currency },
  });
}

/** Admin aksiyonları: allow (NEW→PENDING), pay (→PAID), reject (→REJECTED), cancel (oyuncu: NEW→CANCELLED) */
export async function processPayment(db: PrismaClient, id: bigint, action: "allow" | "pay" | "reject" | "cancel", opts: { adminId?: number; reason?: string; byPlayerId?: number }) {
  const out = await db.$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM "PaymentRequest" WHERE id = ${id} FOR UPDATE`;
    if (!r) throw new BizError("NOT_FOUND");
    const req = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
    if (opts.byPlayerId && req.playerId !== opts.byPlayerId) throw new BizError("NOT_FOUND");
    const isOpen = req.state === PaymentState.NEW || req.state === PaymentState.PENDING;
    if (!isOpen) throw new BizError("ALREADY_PROCESSED");

    if (action === "allow") {
      return { req: await tx.paymentRequest.update({ where: { id }, data: { state: PaymentState.PENDING, allowAdminId: opts.adminId } }), grant: null };
    }
    if (action === "pay") {
      if (req.type === PaymentType.DEPOSIT) {
        await move(tx, { playerId: req.playerId, wallet: WalletType.MAIN, type: TxType.DEPOSIT, amount: req.amount, paymentSystem: req.paymentSystem, reference: `pay:${req.id}`, adminId: opts.adminId, note: req.notes ?? undefined });
      }
      const upd = await tx.paymentRequest.update({ where: { id }, data: { state: PaymentState.PAID, paidAdminId: opts.adminId, allowAdminId: req.allowAdminId ?? opts.adminId, processedAt: new Date() } });
      return { req: upd, grant: req.type === PaymentType.DEPOSIT && req.bonusId ? { bonusId: req.bonusId, deposit: req.amount } : null };
    }
    // reject / cancel
    if (action === "cancel" && (req.state !== PaymentState.NEW || req.type !== PaymentType.WITHDRAWAL)) throw new BizError("CANNOT_CANCEL");
    if (req.type === PaymentType.WITHDRAWAL) {
      await move(tx, { playerId: req.playerId, wallet: WalletType.MAIN, type: TxType.WITHDRAWAL_REFUND, amount: req.amount, paymentSystem: req.paymentSystem, reference: `pay:${req.id}`, adminId: opts.adminId, note: action === "cancel" ? "Oyuncu iptal etti" : `Reddedildi: ${opts.reason ?? ""}` });
    }
    const upd = await tx.paymentRequest.update({
      where: { id },
      data: { state: action === "cancel" ? PaymentState.CANCELLED : PaymentState.REJECTED, rejectAdminId: opts.adminId, rejectReason: opts.reason, processedAt: new Date() },
    });
    return { req: upd, grant: null };
  });

  // Yatırım bonusu (transaction dışında; bonus hatası yatırımı geri almaz)
  if (out.grant) {
    try {
      const bonus = await db.bonus.findUniqueOrThrow({ where: { id: out.grant.bonusId } });
      let amt = D(out.grant.deposit).mul(D(bonus.percent ?? 0)).div(100);
      if (bonus.maxAmount && amt.gt(bonus.maxAmount)) amt = D(bonus.maxAmount);
      if (amt.gt(0) && (!bonus.minAmount || D(out.grant.deposit).gte(bonus.minAmount))) {
        await grantBonus(db, { playerId: out.req.playerId, bonusId: bonus.id, amount: Number(amt.toFixed(2)), adminId: opts.adminId, skipLimits: true });
      }
    } catch (e) {
      console.error("deposit bonus error", e);
    }
  }
  return out.req;
}

// ================== HATALI İŞLEM ÇÖZÜMÜ ==================
// Tüm düzeltmeler: zorunlu sebep, satır kilidi, işlem geçmişinde `pay:<id>:<tür>` referansı, audit (route tarafında).

async function lockPayment(tx: Prisma.TransactionClient, id: bigint) {
  const [r] = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM "PaymentRequest" WHERE id = ${id} FOR UPDATE`;
  if (!r) throw new BizError("NOT_FOUND");
  return tx.paymentRequest.findUniqueOrThrow({ where: { id } });
}
async function mainBalance(tx: Prisma.TransactionClient, playerId: number) {
  const w = await tx.wallet.findFirst({ where: { playerId, type: WalletType.MAIN } });
  return D(w?.balance ?? 0);
}

/**
 * Ödenmiş talebi geri al.
 *  - Yatırım: tutar ana paradan düşülür (DEPOSIT_REVERSAL). Bu yatırımla verilen aktif bonus iptal edilir.
 *    Bakiye yetmezse: force=false → hata (eksik tutar bilgisiyle); force=true → mevcut bakiye alınır,
 *    eksik kısım kayda geçer ve hesap BLOKE edilir.
 *  - Çekim: oyuncuya ulaşmadıysa tutar ana paraya iade edilir (WITHDRAWAL_REVERSAL).
 */
export async function reversePayment(db: PrismaClient, id: bigint, opts: { adminId: number; reason: string; force?: boolean }) {
  if (!opts.reason || opts.reason.trim().length < 5) throw new BizError("REASON_REQUIRED");
  return db.$transaction(async (tx) => {
    const req = await lockPayment(tx, id);
    if (req.state !== PaymentState.PAID) throw new BizError("ONLY_PAID_CAN_BE_REVERSED");
    const ref = `pay:${req.id}:reversal`;
    let shortfall = D(0);
    if (req.type === PaymentType.DEPOSIT) {
      // bu yatırımla verilen aktif yatırım bonusunu iptal et
      if (req.bonusId) {
        const pb = await tx.playerBonus.findFirst({ where: { playerId: req.playerId, bonusId: req.bonusId, state: PlayerBonusState.ACTIVE, createdAt: { gte: new Date((req.processedAt ?? req.createdAt).getTime() - 60_000) } } });
        if (pb) {
          const bw = await tx.wallet.findFirst({ where: { playerId: req.playerId, type: WalletType.BONUS } });
          if (bw && D(bw.balance).gt(0)) await move(tx, { playerId: req.playerId, wallet: WalletType.BONUS, type: TxType.BONUS_CANCEL, amount: D(bw.balance).neg(), reference: ref, adminId: opts.adminId, note: "Yatırım geri alındı → bonus iptal" });
          await tx.playerBonus.update({ where: { id: pb.id }, data: { state: PlayerBonusState.CANCELED, resultAt: new Date() } });
        }
      }
      const bal = await mainBalance(tx, req.playerId);
      const amt = D(req.amount);
      let take = amt;
      if (bal.lt(amt)) {
        if (!opts.force) { const e: any = new BizError("INSUFFICIENT_BALANCE_FOR_REVERSAL"); e.detail = { balance: Number(bal), amount: Number(amt), shortfall: Number(amt.sub(bal)) }; throw e; }
        take = bal; shortfall = amt.sub(bal);
      }
      if (take.gt(0)) await move(tx, { playerId: req.playerId, wallet: WalletType.MAIN, type: TxType.DEPOSIT_REVERSAL, amount: take.neg(), paymentSystem: req.paymentSystem, reference: ref, adminId: opts.adminId, note: `Yatırım geri alındı: ${opts.reason}` });
      if (shortfall.gt(0)) await tx.player.update({ where: { id: req.playerId }, data: { status: "BLOCKED" } });
    } else {
      await move(tx, { playerId: req.playerId, wallet: WalletType.MAIN, type: TxType.WITHDRAWAL_REVERSAL, amount: req.amount, paymentSystem: req.paymentSystem, reference: ref, adminId: opts.adminId, note: `Çekim iade edildi: ${opts.reason}` });
    }
    const note = shortfall.gt(0) ? `${opts.reason} | EKSİK: ${shortfall.toFixed(2)} (hesap bloke)` : opts.reason;
    return tx.paymentRequest.update({ where: { id }, data: { state: PaymentState.REVERSED, reversedAt: new Date(), reversedAdminId: opts.adminId, reverseReason: note } });
  });
}

/** Ödenmiş talebin tutarını düzelt (fark kadar düzeltme kaydı; rapora yeni tutar girer, eski tutar saklanır). */
export async function correctPayment(db: PrismaClient, id: bigint, opts: { adminId: number; reason: string; newAmount: number }) {
  if (!opts.reason || opts.reason.trim().length < 5) throw new BizError("REASON_REQUIRED");
  const newAmt = D(opts.newAmount);
  if (newAmt.lte(0)) throw new BizError("INVALID_AMOUNT");
  return db.$transaction(async (tx) => {
    const req = await lockPayment(tx, id);
    if (req.state !== PaymentState.PAID) throw new BizError("ONLY_PAID_CAN_BE_CORRECTED");
    const diff = newAmt.sub(req.amount); // yatırımda +: oyuncuya ekle, çekimde +: oyuncudan fazladan düş
    if (diff.isZero()) throw new BizError("SAME_AMOUNT");
    const ref = `pay:${req.id}:correction`;
    // Yatırım: fark doğrudan bakiyeye. Çekim: daha fazla ödendiyse oyuncudan düş, eksik ödendiyse iade et.
    const delta = req.type === PaymentType.DEPOSIT ? diff : diff.neg();
    if (delta.isNegative() && (await mainBalance(tx, req.playerId)).lt(delta.abs())) throw new BizError("INSUFFICIENT_BALANCE");
    await move(tx, { playerId: req.playerId, wallet: WalletType.MAIN, type: delta.isNegative() ? TxType.CORRECTION_DOWN : TxType.CORRECTION_UP, amount: delta, paymentSystem: req.paymentSystem, reference: ref, adminId: opts.adminId, note: `Tutar düzeltme ${req.amount} → ${newAmt}: ${opts.reason}` });
    return tx.paymentRequest.update({ where: { id }, data: { amount: newAmt, correctedAmount: req.correctedAmount ?? req.amount, notes: [req.notes, `Düzeltme: ${req.amount} → ${newAmt} (${opts.reason})`].filter(Boolean).join(" | ") } });
  });
}

/** Yanlışlıkla reddedilen/iptal edilen talebi yeniden aç (çekimde tutar tekrar bloke edilir). */
export async function reopenPayment(db: PrismaClient, id: bigint, opts: { adminId: number; reason: string }) {
  if (!opts.reason || opts.reason.trim().length < 5) throw new BizError("REASON_REQUIRED");
  return db.$transaction(async (tx) => {
    const req = await lockPayment(tx, id);
    if (req.state !== PaymentState.REJECTED && req.state !== PaymentState.CANCELLED) throw new BizError("ONLY_REJECTED_CAN_BE_REOPENED");
    if (req.type === PaymentType.WITHDRAWAL) {
      try {
        await move(tx, { playerId: req.playerId, wallet: WalletType.MAIN, type: TxType.WITHDRAWAL, amount: D(req.amount).neg(), paymentSystem: req.paymentSystem, reference: `pay:${req.id}:reopen`, adminId: opts.adminId, note: `Talep yeniden açıldı: ${opts.reason}` });
      } catch (e: any) { if (e.message === "INSUFFICIENT_FUNDS") throw new BizError("INSUFFICIENT_BALANCE"); throw e; }
    }
    return tx.paymentRequest.update({ where: { id }, data: { state: PaymentState.NEW, rejectReason: null, rejectAdminId: null, processedAt: null, notes: [req.notes, `Yeniden açıldı: ${opts.reason}`].filter(Boolean).join(" | ") } });
  });
}
