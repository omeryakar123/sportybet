import { Prisma, PrismaClient, PlayerBonusState, TxType, WalletType } from "@prisma/client";
import { move } from "./wallet.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Bonus ver: tutar BONUS cüzdanına yatar, çevrim şartı = tutar x wageringMultiplier.
 * FREEBET tipinde de bakiye bonus cüzdanına gider; kazanç kuralı settlement'ta uygulanır.
 */
export async function grantBonus(
  db: PrismaClient,
  { playerId, bonusId, amount, adminId, skipLimits }: { playerId: number; bonusId: number; amount: number; adminId?: number; skipLimits?: boolean },
) {
  return db.$transaction(async (tx) => {
    const bonus = await tx.bonus.findUniqueOrThrow({ where: { id: bonusId } });
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.excludedFromBonuses) throw new Error("PLAYER_EXCLUDED_FROM_BONUSES");
    if (!bonus.isActive) throw new Error("BONUS_NOT_ACTIVE");
    // Aynı anda tek aktif bonus (bonus cüzdanı tek havuz olduğu için)
    const active = await tx.playerBonus.findFirst({ where: { playerId, state: PlayerBonusState.ACTIVE } });
    if (active) throw new Error("ACTIVE_BONUS_EXISTS");
    if (!skipLimits && bonus.minAmount && D(amount).lt(bonus.minAmount)) throw new Error("BELOW_MIN_AMOUNT");
    if (!skipLimits && bonus.maxAmount && D(amount).gt(bonus.maxAmount)) throw new Error("ABOVE_MAX_AMOUNT");

    const expiresAt = new Date(Date.now() + bonus.expirationDays * 86400_000);
    const pb = await tx.playerBonus.create({
      data: {
        playerId,
        bonusId,
        amount: D(amount),
        wagerRequired: D(amount).mul(bonus.wageringMultiplier),
        grantedByAdminId: adminId,
        expiresAt,
      },
    });
    await move(tx, {
      playerId,
      wallet: WalletType.BONUS,
      type: TxType.BONUS_GRANT,
      amount,
      reference: `bonus:${pb.id}`,
      adminId,
    });
    return pb;
  });
}

/**
 * Bonus bakiyesiyle oynanan, bonus kurallarına uyan bir bahis sonuçlandığında çevrime eklenir.
 * Çevrim tamamlanınca BONUS cüzdanındaki bakiye (maxPayout sınırıyla) MAIN cüzdana aktarılır.
 */
export async function addWagering(tx: Prisma.TransactionClient, playerBonusId: number, stake: Prisma.Decimal.Value) {
  const pb = await tx.playerBonus.findUniqueOrThrow({ where: { id: playerBonusId }, include: { bonus: true } });
  if (pb.state !== PlayerBonusState.ACTIVE) return pb;
  const wagerDone = D(pb.wagerDone).add(stake);
  const updated = await tx.playerBonus.update({ where: { id: pb.id }, data: { wagerDone } });
  if (wagerDone.gte(pb.wagerRequired)) return completeBonus(tx, pb.id);
  return updated;
}

export async function completeBonus(tx: Prisma.TransactionClient, playerBonusId: number) {
  const pb = await tx.playerBonus.findUniqueOrThrow({ where: { id: playerBonusId }, include: { bonus: true } });
  const bonusWallet = await tx.wallet.findFirstOrThrow({ where: { playerId: pb.playerId, type: WalletType.BONUS } });
  let convert = D(bonusWallet.balance);
  if (pb.bonus.maxPayout && convert.gt(pb.bonus.maxPayout)) convert = D(pb.bonus.maxPayout);
  if (convert.gt(0)) {
    await move(tx, { playerId: pb.playerId, wallet: WalletType.BONUS, type: TxType.BONUS_CONVERT, amount: D(bonusWallet.balance).neg(), reference: `bonus:${pb.id}` });
    await move(tx, { playerId: pb.playerId, wallet: WalletType.MAIN, type: TxType.BONUS_CONVERT, amount: convert, reference: `bonus:${pb.id}` });
  }
  return tx.playerBonus.update({
    where: { id: pb.id },
    data: { state: PlayerBonusState.COMPLETED, convertedAmount: convert, resultAt: new Date() },
  });
}

/** Süresi dolmuş aktif bonusları kapatır, bonus cüzdanını sıfırlar. (cron ile çağrılır) */
export async function expireBonuses(db: PrismaClient) {
  const list = await db.playerBonus.findMany({ where: { state: PlayerBonusState.ACTIVE, expiresAt: { lt: new Date() } } });
  for (const pb of list) {
    await db.$transaction(async (tx) => {
      const w = await tx.wallet.findFirst({ where: { playerId: pb.playerId, type: WalletType.BONUS } });
      if (w && D(w.balance).gt(0)) {
        await move(tx, { playerId: pb.playerId, wallet: WalletType.BONUS, type: TxType.BONUS_EXPIRE, amount: D(w.balance).neg(), reference: `bonus:${pb.id}` });
      }
      await tx.playerBonus.update({ where: { id: pb.id }, data: { state: PlayerBonusState.EXPIRED, resultAt: new Date() } });
    });
  }
  return list.length;
}

/** Admin bonusu iptal eder: bonus cüzdanı sıfırlanır, bonus CANCELED */
export async function cancelBonus(db: PrismaClient, playerBonusId: number, adminId?: number) {
  return db.$transaction(async (tx) => {
    const pb = await tx.playerBonus.findUniqueOrThrow({ where: { id: playerBonusId } });
    if (pb.state !== PlayerBonusState.ACTIVE) throw new Error("BONUS_NOT_ACTIVE");
    const w = await tx.wallet.findFirst({ where: { playerId: pb.playerId, type: WalletType.BONUS } });
    if (w && D(w.balance).gt(0)) {
      await move(tx, { playerId: pb.playerId, wallet: WalletType.BONUS, type: TxType.BONUS_CANCEL, amount: D(w.balance).neg(), reference: `bonus:${pb.id}`, adminId });
    }
    return tx.playerBonus.update({ where: { id: pb.id }, data: { state: PlayerBonusState.CANCELED, resultAt: new Date() } });
  });
}

/** Oyuncu promo kod kullanır — koşullar PromoCode.conditions içinde */
export async function redeemPromo(db: PrismaClient, playerId: number, code: string) {
  const player0 = await db.player.findUniqueOrThrow({ where: { id: playerId }, select: { siteId: true } });
  const promo = await db.promoCode.findFirst({ where: { siteId: player0.siteId, code } });
  const now = new Date();
  if (!promo || !promo.isActive) throw new Error("PROMO_NOT_FOUND");
  if ((promo.startsAt && promo.startsAt > now) || (promo.endsAt && promo.endsAt < now)) throw new Error("PROMO_NOT_ACTIVE");
  if (promo.usedCount >= promo.maxCount) throw new Error("PROMO_LIMIT_REACHED");
  if (await db.promoRedemption.findUnique({ where: { promoCodeId_playerId: { promoCodeId: promo.id, playerId } } })) throw new Error("PROMO_ALREADY_USED");
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  const c: any = promo.conditions ?? {};
  if (c.emailVerified && !player.email) throw new Error("EMAIL_NOT_VERIFIED");
  if (c.verifiedOnly && !player.isVerified) throw new Error("PLAYER_NOT_VERIFIED");
  if (c.minDepositCount) {
    const n = await db.paymentRequest.count({ where: { playerId, type: "DEPOSIT", state: "PAID" } });
    if (n < Number(c.minDepositCount)) throw new Error("NOT_ENOUGH_DEPOSITS");
  }
  const pb = await grantBonus(db, { playerId, bonusId: promo.bonusId, amount: Number(promo.amount), skipLimits: true });
  await db.$transaction([
    db.promoRedemption.create({ data: { promoCodeId: promo.id, playerId, playerBonusId: pb.id } }),
    db.promoCode.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } }),
  ]);
  return pb;
}
