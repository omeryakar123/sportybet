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
export class BizError extends Error {}

async function checkSystem(db: PrismaClient, name: string, type: PaymentType, amount: Prisma.Decimal) {
  const ps = await db.paymentSystem.findUnique({ where: { name } });
  if (!ps || !ps.isActive) throw new BizError("PAYMENT_SYSTEM_NOT_AVAILABLE");
  if (ps.kind !== "BOTH" && ps.kind !== type) throw new BizError("PAYMENT_SYSTEM_NOT_AVAILABLE");
  if (amount.lt(ps.minAmount)) throw new BizError("BELOW_MIN_AMOUNT");
  if (ps.maxAmount && amount.gt(ps.maxAmount)) throw new BizError("ABOVE_MAX_AMOUNT");
  return ps;
}

export async function createWithdrawal(db: PrismaClient, playerId: number, b: { paymentSystem: string; amount: number; info?: Record<string, unknown> }) {
  const amount = D(b.amount);
  if (amount.lte(0)) throw new BizError("INVALID_AMOUNT");
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.status !== "OPEN") throw new BizError("ACCOUNT_BLOCKED");
  await checkSystem(db, b.paymentSystem, PaymentType.WITHDRAWAL, amount);
  const blocking = await db.playerBonus.findFirst({ where: { playerId, state: PlayerBonusState.ACTIVE, bonus: { allowWithdrawal: false } }, include: { bonus: true } });
  if (blocking) throw new BizError("ACTIVE_BONUS_BLOCKS_WITHDRAWAL");
  const open = await db.paymentRequest.count({ where: { playerId, type: PaymentType.WITHDRAWAL, state: { in: [PaymentState.NEW, PaymentState.PENDING] } } });
  if (open > 0) throw new BizError("OPEN_WITHDRAWAL_EXISTS");

  return db.$transaction(async (tx) => {
    const req = await tx.paymentRequest.create({
      data: { playerId, type: PaymentType.WITHDRAWAL, amount, paymentSystem: b.paymentSystem, info: (b.info ?? {}) as any, currency: player.currency },
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
  const amount = D(b.amount);
  if (amount.lte(0)) throw new BizError("INVALID_AMOUNT");
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.status !== "OPEN") throw new BizError("ACCOUNT_BLOCKED");
  await checkSystem(db, b.paymentSystem, PaymentType.DEPOSIT, amount);
  if (b.bonusId) {
    const bonus = await db.bonus.findUnique({ where: { id: b.bonusId } });
    if (!bonus || !bonus.isActive || bonus.type !== BonusType.DEPOSIT) throw new BizError("BONUS_NOT_AVAILABLE");
  }
  return db.paymentRequest.create({
    data: { playerId, type: PaymentType.DEPOSIT, amount, paymentSystem: b.paymentSystem, bonusId: b.bonusId, info: (b.info ?? {}) as any, currency: player.currency },
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
