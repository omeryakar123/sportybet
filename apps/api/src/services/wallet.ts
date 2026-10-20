import { Prisma, PrismaClient, TxType, WalletType } from "@prisma/client";

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Oyuncunun MAIN ve BONUS cüzdanlarını getirir, yoksa oluşturur. */
export async function ensureWallets(tx: Tx | PrismaClient, playerId: number, currency = "TRY") {
  const out: Record<WalletType, Awaited<ReturnType<typeof tx.wallet.upsert>>> = {} as any;
  for (const type of [WalletType.MAIN, WalletType.BONUS]) {
    out[type] = await tx.wallet.upsert({
      where: { playerId_type_currency: { playerId, type, currency } },
      update: {},
      create: { playerId, type, currency },
    });
  }
  return out;
}

/**
 * Cüzdana hareket yazar. amount pozitifse giriş, negatifse çıkış.
 * Bakiye eksiye düşemez. Satır kilidi için SELECT ... FOR UPDATE kullanılır.
 */
export async function move(
  tx: Tx,
  opts: {
    playerId: number;
    wallet: WalletType;
    type: TxType;
    amount: Prisma.Decimal.Value;
    reference?: string;
    note?: string;
    paymentSystem?: string;
    adminId?: number;
    currency?: string;
  },
) {
  const currency = opts.currency ?? "TRY";
  await ensureWallets(tx, opts.playerId, currency);
  const [w] = await tx.$queryRaw<{ id: number; balance: Prisma.Decimal }[]>`
    SELECT id, balance FROM "Wallet"
    WHERE "playerId" = ${opts.playerId} AND type = ${opts.wallet}::"WalletType" AND currency = ${currency}
    FOR UPDATE`;
  const amount = D(opts.amount);
  const newBal = D(w.balance).add(amount);
  if (newBal.isNegative()) throw new Error("INSUFFICIENT_FUNDS");
  await tx.wallet.update({ where: { id: w.id }, data: { balance: newBal } });
  return tx.transaction.create({
    data: {
      playerId: opts.playerId,
      walletId: w.id,
      type: opts.type,
      amount,
      balanceAfter: newBal,
      reference: opts.reference,
      note: opts.note,
      paymentSystem: opts.paymentSystem,
      adminId: opts.adminId,
    },
  });
}
