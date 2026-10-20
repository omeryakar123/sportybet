import { Prisma, PrismaClient, TxType, WalletType, PaymentType, PaymentState, BetState } from "@prisma/client";

const N = (v: unknown) => Number(v ?? 0);
const SETTLED: BetState[] = [BetState.WON, BetState.LOST, BetState.RETURNED, BetState.CASHED_OUT];
const COUNTED: BetState[] = [BetState.ACTIVE, ...SETTLED]; // iptal/pending hariç

export function range(q: { from?: string; to?: string }) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 86400_000);
  return { from, to };
}

/** Backoffice ana sayfa (BC Dashboard) */
export async function dashboard(db: PrismaClient, from: Date, to: Date) {
  const between = { gte: from, lt: to };
  const sum = async (type: TxType) => db.transaction.aggregate({ where: { type, createdAt: between }, _sum: { amount: true } });
  const [dep, wd, wdRefund, logins, loginPlayers, registered, mainBal, bonusBal, corrUp, corrDown, depPlayers, wdPlayers] = await Promise.all([
    db.paymentRequest.aggregate({ where: { type: PaymentType.DEPOSIT, state: PaymentState.PAID, processedAt: between }, _sum: { amount: true }, _count: true }),
    db.paymentRequest.aggregate({ where: { type: PaymentType.WITHDRAWAL, state: PaymentState.PAID, processedAt: between }, _sum: { amount: true }, _count: true }),
    sum(TxType.WITHDRAWAL_REFUND),
    db.loginLog.count({ where: { createdAt: between } }),
    db.loginLog.groupBy({ by: ["playerId"], where: { createdAt: between } }).then((r) => r.length),
    db.player.count({ where: { createdAt: between, isTest: false } }),
    db.wallet.aggregate({ where: { type: WalletType.MAIN, player: { isTest: false } }, _sum: { balance: true } }),
    db.wallet.aggregate({ where: { type: WalletType.BONUS, player: { isTest: false } }, _sum: { balance: true } }),
    db.transaction.aggregate({ where: { type: { in: [TxType.CORRECTION_UP] }, createdAt: between }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { type: { in: [TxType.CORRECTION_DOWN] }, createdAt: between }, _sum: { amount: true } }),
    db.paymentRequest.groupBy({ by: ["playerId"], where: { type: PaymentType.DEPOSIT, state: PaymentState.PAID, processedAt: between } }).then((r) => r.length),
    db.paymentRequest.groupBy({ by: ["playerId"], where: { type: PaymentType.WITHDRAWAL, state: PaymentState.PAID, processedAt: between } }).then((r) => r.length),
  ]);
  void wdRefund;
  const deposits = N(dep._sum.amount), withdrawals = N(wd._sum.amount);
  return {
    kpi: {
      deposits, withdrawals, profit: deposits - withdrawals,
      depositCount: dep._count, withdrawalCount: wd._count,
      playersLoggedIn: loginPlayers, loginCount: logins, playersRegistered: registered,
      playersBalance: N(mainBal._sum.balance), bonusBalance: N(bonusBal._sum.balance),
      playersMakingDeposit: depPlayers, playersMakingWithdrawal: wdPlayers,
      correctionUp: N(corrUp._sum.amount), correctionDown: Math.abs(N(corrDown._sum.amount)),
    },
    sportsbook: await sportsbookOverview(db, from, to),
    bonus: await bonusOverview(db, from, to),
    topSports: await topSports(db, from, to),
  };
}

export async function sportsbookOverview(db: PrismaClient, from: Date, to: Date) {
  const between = { gte: from, lt: to };
  const col = async (isLive?: boolean) => {
    const where: Prisma.BetWhereInput = { createdAt: between, state: { in: COUNTED }, ...(isLive === undefined ? {} : { isLive }), player: { isTest: false } };
    const [agg, open, settled, players] = await Promise.all([
      db.bet.aggregate({ where, _sum: { stake: true }, _count: true, _avg: { stake: true } }),
      db.bet.aggregate({ where: { ...where, state: BetState.ACTIVE }, _sum: { stake: true } }),
      db.bet.aggregate({ where: { ...where, state: { in: SETTLED } }, _sum: { stake: true, winAmount: true } }),
      db.bet.groupBy({ by: ["playerId"], where }).then((r) => r.length),
    ]);
    const turnover = N(agg._sum.stake), winning = N(settled._sum.winAmount);
    const ggr = N(settled._sum.stake) - winning;
    return {
      turnover, winning, openBets: N(open._sum.stake), ggr,
      profitability: N(settled._sum.stake) ? (ggr / N(settled._sum.stake)) * 100 : 0,
      bets: agg._count, avgBet: N(agg._avg.stake), players, betPerPlayer: players ? agg._count / players : 0,
    };
  };
  const [prematch, live, total, types] = await Promise.all([
    col(false), col(true), col(),
    db.bet.groupBy({ by: ["type"], where: { createdAt: between, state: { in: COUNTED } }, _count: true }),
  ]);
  return { prematch, live, total, types: Object.fromEntries(types.map((t) => [t.type, t._count])) };
}

export async function bonusOverview(db: PrismaClient, from: Date, to: Date) {
  const rows = await db.$queryRaw<{ type: string; product: string; awarded: unknown; players: unknown; converted: unknown }[]>`
    SELECT b.type::text AS type, b.product, COALESCE(SUM(pb.amount),0) AS awarded, COUNT(DISTINCT pb."playerId") AS players,
           COALESCE(SUM(pb."convertedAmount"),0) AS converted
    FROM "PlayerBonus" pb JOIN "Bonus" b ON b.id = pb."bonusId"
    WHERE pb."createdAt" >= ${from} AND pb."createdAt" < ${to}
    GROUP BY b.type, b.product ORDER BY awarded DESC`;
  return rows.map((r) => ({ type: r.type, product: r.product, awarded: N(r.awarded), players: N(r.players), converted: N(r.converted) }));
}

export async function topSports(db: PrismaClient, from: Date, to: Date) {
  const rows = await db.$queryRaw<{ sport: string; bet: unknown; win: unknown }[]>`
    SELECT COALESCE(NULLIF(s.sport,''),'Diğer') AS sport,
           SUM(b.stake / GREATEST(cnt.n,1)) AS bet,
           SUM(CASE WHEN b.state IN ('WON','RETURNED','CASHED_OUT') THEN b."winAmount" / GREATEST(cnt.n,1) ELSE 0 END) AS win
    FROM "BetSelection" s
    JOIN "Bet" b ON b.id = s."betId"
    JOIN (SELECT "betId", COUNT(*) n FROM "BetSelection" GROUP BY "betId") cnt ON cnt."betId" = b.id
    WHERE b."createdAt" >= ${from} AND b."createdAt" < ${to} AND b.state <> 'CANCELLED'
    GROUP BY 1 ORDER BY bet DESC LIMIT 5`;
  return rows.map((r) => ({ sport: r.sport, bet: N(r.bet), win: N(r.win), profit: N(r.bet) - N(r.win) }));
}

/** Oyuncu KPI'ları (BC Player Info > Player KPIs) */
export async function playerKpis(db: PrismaClient, playerId: number) {
  const base = { playerId, state: { in: COUNTED } };
  const [last, all, settled, unsettled, bonusStakes, bonusWins, dep, depFirst, depLast, wd, wdLast] = await Promise.all([
    db.bet.findFirst({ where: { playerId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.bet.aggregate({ where: base, _sum: { stake: true }, _count: true }),
    db.bet.aggregate({ where: { playerId, state: { in: SETTLED } }, _sum: { stake: true, winAmount: true } }),
    db.bet.aggregate({ where: { playerId, state: BetState.ACTIVE }, _sum: { stake: true }, _count: true }),
    db.bet.aggregate({ where: { ...base, stakeFromBonus: { gt: 0 } }, _sum: { stakeFromBonus: true } }),
    db.transaction.aggregate({ where: { playerId, type: TxType.BET_WIN, wallet: { type: WalletType.BONUS } }, _sum: { amount: true } }),
    db.paymentRequest.aggregate({ where: { playerId, type: PaymentType.DEPOSIT, state: PaymentState.PAID }, _sum: { amount: true }, _count: true }),
    db.paymentRequest.findFirst({ where: { playerId, type: PaymentType.DEPOSIT, state: PaymentState.PAID }, orderBy: { processedAt: "asc" } }),
    db.paymentRequest.findFirst({ where: { playerId, type: PaymentType.DEPOSIT, state: PaymentState.PAID }, orderBy: { processedAt: "desc" } }),
    db.paymentRequest.aggregate({ where: { playerId, type: PaymentType.WITHDRAWAL, state: PaymentState.PAID }, _sum: { amount: true }, _count: true }),
    db.paymentRequest.findFirst({ where: { playerId, type: PaymentType.WITHDRAWAL, state: PaymentState.PAID }, orderBy: { processedAt: "desc" } }),
  ]);
  const pl = N(settled._sum.stake) - N(settled._sum.winAmount);
  return {
    sportLastBet: last?.createdAt ?? null,
    sportTotalBets: all._count,
    sportTotalStakes: N(all._sum.stake),
    sportTotalWinnings: N(settled._sum.winAmount),
    sportUnsettledStakes: N(unsettled._sum.stake),
    sportUnsettledBets: unsettled._count,
    sportBonusStakes: N(bonusStakes._sum.stakeFromBonus),
    sportBonusWinnings: N(bonusWins._sum.amount),
    sportPL: pl,
    sportProfitability: N(settled._sum.stake) ? (pl / N(settled._sum.stake)) * 100 : 0,
    deposits: N(dep._sum.amount), depositCount: dep._count,
    firstDepositDate: depFirst?.processedAt ?? null, lastDepositDate: depLast?.processedAt ?? null, lastDepositAmount: depLast ? N(depLast.amount) : 0,
    withdrawals: N(wd._sum.amount), withdrawalCount: wd._count,
    lastWithdrawalDate: wdLast?.processedAt ?? null, lastWithdrawalAmount: wdLast ? N(wdLast.amount) : 0,
    netRevenue: N(dep._sum.amount) - N(wd._sum.amount),
  };
}

/** Günlük sportsbook raporu */
export async function sportsbookDaily(db: PrismaClient, from: Date, to: Date) {
  const rows = await db.$queryRaw<any[]>`
    SELECT to_char(date_trunc('day', b."createdAt"), 'YYYY-MM-DD') AS day,
      COUNT(*) AS bets, COUNT(DISTINCT b."playerId") AS players,
      SUM(b.stake) AS stake,
      SUM(CASE WHEN b."isLive" THEN b.stake ELSE 0 END) AS "liveStake",
      SUM(b."stakeFromBonus") AS "bonusStake",
      SUM(CASE WHEN b.state IN ('WON','RETURNED','CASHED_OUT','LOST') THEN b."winAmount" ELSE 0 END) AS win,
      SUM(CASE WHEN b.state = 'ACTIVE' THEN b.stake ELSE 0 END) AS open
    FROM "Bet" b JOIN "Player" p ON p.id = b."playerId"
    WHERE b."createdAt" >= ${from} AND b."createdAt" < ${to} AND b.state NOT IN ('CANCELLED','PENDING') AND p."isTest" = false
    GROUP BY 1 ORDER BY 1 DESC`;
  return rows.map((r) => ({ day: r.day, bets: N(r.bets), players: N(r.players), stake: N(r.stake), liveStake: N(r.liveStake), bonusStake: N(r.bonusStake), win: N(r.win), open: N(r.open), ggr: N(r.stake) - N(r.open) - N(r.win) }));
}

/** Günlük finans raporu + ödeme sistemi kırılımı */
export async function financialReport(db: PrismaClient, from: Date, to: Date) {
  const daily = await db.$queryRaw<any[]>`
    SELECT to_char(date_trunc('day', "processedAt"), 'YYYY-MM-DD') AS day,
      SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE 0 END) AS deposits,
      COUNT(*) FILTER (WHERE type='DEPOSIT') AS "depositCount",
      SUM(CASE WHEN type='WITHDRAWAL' THEN amount ELSE 0 END) AS withdrawals,
      COUNT(*) FILTER (WHERE type='WITHDRAWAL') AS "withdrawalCount",
      COUNT(DISTINCT "playerId") FILTER (WHERE type='DEPOSIT') AS depositors
    FROM "PaymentRequest" WHERE state='PAID' AND "processedAt" >= ${from} AND "processedAt" < ${to}
    GROUP BY 1 ORDER BY 1 DESC`;
  const bySystem = await db.$queryRaw<any[]>`
    SELECT "paymentSystem", type::text AS type, COUNT(*) AS count, SUM(amount) AS amount
    FROM "PaymentRequest" WHERE state='PAID' AND "processedAt" >= ${from} AND "processedAt" < ${to}
    GROUP BY 1,2 ORDER BY amount DESC`;
  return {
    daily: daily.map((r) => ({ day: r.day, deposits: N(r.deposits), depositCount: N(r.depositCount), withdrawals: N(r.withdrawals), withdrawalCount: N(r.withdrawalCount), depositors: N(r.depositors), net: N(r.deposits) - N(r.withdrawals) })),
    bySystem: bySystem.map((r) => ({ paymentSystem: r.paymentSystem, type: r.type, count: N(r.count), amount: N(r.amount) })),
  };
}
