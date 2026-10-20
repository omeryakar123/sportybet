import { Prisma, PrismaClient, PlayerBonusState, TxType, WalletType } from "@prisma/client";
import { move } from "./wallet.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Bonus ver: tutar BONUS cüzdanına yatar, çevrim şartı = tutar x wageringMultiplier.
 * FREEBET tipinde de bakiye bonus cüzdanına gider; kazanç kuralı settlement'ta uygulanır.
 */
export async function grantBonus(
  db: PrismaClient,
  { playerId, bonusId, amount, adminId }: { playerId: number; bonusId: number; amount: number; adminId?: number },
) {
  return db.$transaction(async (tx) => {
    const bonus = await tx.bonus.findUniqueOrThrow({ where: { id: bonusId } });
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.excludedFromBonuses) throw new Error("PLAYER_EXCLUDED_FROM_BONUSES");
    if (bonus.minAmount && D(amount).lt(bonus.minAmount)) throw new Error("BELOW_MIN_AMOUNT");
    if (bonus.maxAmount && D(amount).gt(bonus.maxAmount)) throw new Error("ABOVE_MAX_AMOUNT");

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
