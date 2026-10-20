/**
 * Betco seamless wallet mantığı — iki cüzdan (MAIN + BONUS) üzerinde.
 *
 * Kurallar (docs/integrations/betco-sportsbook.md "Cevap kuralları"):
 *  - İş kuralı reddi (yetersiz bakiye, bloke hesap) → 4xx, ASLA 5xx.
 *  - transaction_id idempotent: tekrar gelirse ilk cevap aynen döner, para tekrar hareket etmez.
 *  - Credit ve rollback asla reddedilmez.
 *  - Bilinmeyen debit için rollback → "iptal edildi" kaydı; sonradan o debit gelirse 409 TRANSACTION_CANCELLED.
 *
 * Bakiye politikası (cüzdanlar AYRI):
 *  - Oyuncu sitede aktif cüzdanını seçer (Player.activeWallet = MAIN | BONUS).
 *  - /balance sadece aktif cüzdanın bakiyesini döner.
 *  - /debit sadece aktif cüzdandan düşer (yetmezse INSUFFICIENT_BALANCE). Hangi cüzdandan düştüğü kaydedilir.
 *  - /credit aynı oranla geri yazılır: kazancın bonus payı BONUS cüzdanına, kalanı ANA paraya.
 *    (bonus COMPLETED olduysa bonus payı da ANA paraya gider)
 *  - Çevrim: bonuslu kupon sonuçlanınca (won/lost) bonus kurallarına uyuyorsa stake çevrime eklenir.
 */
import { Prisma, PrismaClient, PlayerBonusState, TxType, WalletType, BetState } from "@prisma/client";
import { ensureWallets, move } from "./wallet.js";
import { addWagering } from "./bonus.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const n2 = (v: Prisma.Decimal.Value) => Number(D(v).toFixed(2));

export type WalletReply = { http: number; body: Record<string, unknown> };
const reject = (http: number, error_code: string, error_message: string): WalletReply => ({
  http,
  body: { success: false, error_code, error_message },
});

async function totalBalance(tx: Prisma.TransactionClient | PrismaClient, playerId: number, currency: string) {
  const ws = await tx.wallet.findMany({ where: { playerId, currency } });
  const main = ws.find((w) => w.type === WalletType.MAIN)?.balance ?? D(0);
  const bonus = ws.find((w) => w.type === WalletType.BONUS)?.balance ?? D(0);
  return { main: D(main), bonus: D(bonus), total: D(main).add(bonus) };
}

function playerIdOf(userId: unknown) {
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function replay(db: PrismaClient, transactionId: string): Promise<WalletReply | null> {
  const prev = await db.walletRequest.findUnique({ where: { transactionId } });
  return prev ? { http: prev.httpStatus, body: prev.response as Record<string, unknown> } : null;
}

// ---------------- /balance ----------------
export async function balance(db: PrismaClient, b: any): Promise<WalletReply> {
  const playerId = playerIdOf(b.user_id);
  if (!playerId) return reject(400, "USER_NOT_FOUND", "Unknown user");
  const p = await db.player.findUnique({ where: { id: playerId } });
  if (!p) return reject(400, "USER_NOT_FOUND", "Unknown user");
  const currency = b.currency || p.currency;
  await ensureWallets(db, playerId, currency);
  const bal = await totalBalance(db, playerId, currency);
  const v = p.activeWallet === WalletType.BONUS ? bal.bonus : bal.main;
  return { http: 200, body: { success: true, balance: n2(v), currency } };
}

// ---------------- /debit ----------------
export async function debit(db: PrismaClient, b: any): Promise<WalletReply> {
  const txId = String(b.transaction_id || "");
  if (!txId) return reject(400, "VALIDATION_ERROR", "transaction_id required");
  const prev = await replay(db, txId);
  if (prev) return prev;
  if (await db.cancelledTransaction.findUnique({ where: { transactionId: txId } }))
    return reject(409, "TRANSACTION_CANCELLED", "Debit was rolled back before it arrived");

  const playerId = playerIdOf(b.user_id);
  const player = playerId ? await db.player.findUnique({ where: { id: playerId } }) : null;
  const amount = D(b.amount || 0);
  const currency = String(b.currency || player?.currency || "TRY");

  const persistReject = async (r: WalletReply) => {
    if (playerId && player) {
      await db.walletRequest.create({
        data: { transactionId: txId, kind: "debit", playerId, amount, currency, providerBetId: b.bet_id, couponId: b.coupon_id, status: "REJECTED", httpStatus: r.http, response: r.body as any },
      }).catch(() => {});
    }
    return r;
  };

  if (!player) return reject(400, "USER_NOT_FOUND", "Unknown user");
  if (player.status !== "OPEN" || player.isSportBlocked) return persistReject(reject(400, "PLAYER_BLOCKED", "Player account is blocked"));
  if (amount.lte(0)) return persistReject(reject(400, "VALIDATION_ERROR", "amount must be > 0"));

  try {
    return await db.$transaction(async (tx) => {
      await ensureWallets(tx, player.id, currency);
      // satırları kilitle
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "playerId" = ${player.id} AND currency = ${currency} FOR UPDATE`;
      const bal = await totalBalance(tx, player.id, currency);
      const useBonus = player.activeWallet === WalletType.BONUS;
      const available = useBonus ? bal.bonus : bal.main;
      if (available.lt(amount)) {
        const r = reject(400, "INSUFFICIENT_BALANCE", "Insufficient balance");
        await tx.walletRequest.create({
          data: { transactionId: txId, kind: "debit", playerId: player.id, amount, currency, providerBetId: b.bet_id, couponId: b.coupon_id, status: "REJECTED", httpStatus: 400, response: r.body as any },
        });
        return r;
      }
      const fromMain = useBonus ? D(0) : amount;
      const fromBonus = useBonus ? amount : D(0);
      const ref = `sb:${b.bet_id}`;
      if (fromMain.gt(0)) await move(tx, { playerId: player.id, wallet: WalletType.MAIN, type: TxType.BET_STAKE, amount: fromMain.neg(), reference: ref, currency, note: `Kupon ${b.coupon_id}` });
      if (fromBonus.gt(0)) await move(tx, { playerId: player.id, wallet: WalletType.BONUS, type: TxType.BET_STAKE, amount: fromBonus.neg(), reference: ref, currency, note: `Kupon ${b.coupon_id}` });

      const activeBonus = fromBonus.gt(0)
        ? await tx.playerBonus.findFirst({ where: { playerId: player.id, state: PlayerBonusState.ACTIVE }, orderBy: { id: "asc" } })
        : null;
      const totalOdds = D(b.metadata?.total_odds ?? 1);
      await tx.bet.upsert({
        where: { providerBetId: String(b.bet_id) },
        update: { stake: amount, stakeFromMain: fromMain, stakeFromBonus: fromBonus, state: BetState.ACTIVE, playerBonusId: activeBonus?.id },
        create: {
          providerBetId: String(b.bet_id), couponId: b.coupon_id ? String(b.coupon_id) : null, playerId: player.id,
          type: Number(b.metadata?.selections ?? 1) > 1 ? "MULTIPLE" : "SINGLE",
          stake: amount, stakeFromMain: fromMain, stakeFromBonus: fromBonus, totalOdds, potentialWin: amount.mul(totalOdds),
          state: BetState.ACTIVE, playerBonusId: activeBonus?.id,
        },
      });

      const after = available.sub(amount);
      const body = { success: true, transaction_id: txId, balance_after: n2(after) };
      await tx.walletRequest.create({
        data: { transactionId: txId, kind: "debit", playerId: player.id, amount, currency, providerBetId: b.bet_id, couponId: b.coupon_id, fromMain, fromBonus, status: "SUCCESS", response: body },
      });
      return { http: 200, body };
    });
  } catch (e: any) {
    // Eşzamanlı aynı transaction_id → unique hata → ilk sonucu döndür
    if (e?.code === "P2002") {
      const r = await replay(db, txId);
      if (r) return r;
    }
    throw e; // gerçek beklenmeyen hata → 5xx → platform rollback gönderir (para hareket etmedi, transaction geri alındı)
  }
}

// ---------------- /credit ----------------
export async function credit(db: PrismaClient, b: any): Promise<WalletReply> {
  const txId = String(b.transaction_id || "");
  if (!txId) return reject(400, "VALIDATION_ERROR", "transaction_id required");
  const prev = await replay(db, txId);
  if (prev) return prev;

  const playerId = playerIdOf(b.user_id);
  const player = playerId ? await db.player.findUnique({ where: { id: playerId } }) : null;
  if (!player) throw new Error("CREDIT_UNKNOWN_USER"); // 5xx → platform tekrar dener; kazanç kaybolmaz
  const amount = D(b.amount || 0);
  const currency = String(b.currency || player.currency);
  const reason = String(b.reason || "win");

  try {
    return await db.$transaction(async (tx) => {
      await ensureWallets(tx, player.id, currency);
      const bet = b.bet_id ? await tx.bet.findUnique({ where: { providerBetId: String(b.bet_id) } }) : null;

      // Bonus payını hesapla (stake bölüşümüyle orantılı)
      let toBonus = D(0);
      if (bet && D(bet.stake).gt(0) && D(bet.stakeFromBonus).gt(0)) {
        toBonus = amount.mul(bet.stakeFromBonus).div(bet.stake).toDecimalPlaces(2);
        const pb = bet.playerBonusId ? await tx.playerBonus.findUnique({ where: { id: bet.playerBonusId } }) : null;
        if (pb && pb.state === PlayerBonusState.COMPLETED) toBonus = D(0); // bonus tamamlandıysa hepsi ana paraya
      }
      const toMain = amount.sub(toBonus);
      const type = reason === "rollback" ? TxType.BET_REFUND : TxType.BET_WIN;
      const ref = `sb:${b.bet_id}`;
      if (toMain.gt(0)) await move(tx, { playerId: player.id, wallet: WalletType.MAIN, type, amount: toMain, reference: ref, currency, note: `${reason} · Kupon ${b.coupon_id}` });
      if (toBonus.gt(0)) await move(tx, { playerId: player.id, wallet: WalletType.BONUS, type, amount: toBonus, reference: ref, currency, note: `${reason} · Kupon ${b.coupon_id}` });

      if (bet) {
        const isPartial = Boolean(b.metadata?.partial);
        await tx.bet.update({
          where: { id: bet.id },
          data: {
            winAmount: D(bet.winAmount).add(amount),
            ...(isPartial ? {} : { state: reason === "rollback" ? BetState.RETURNED : reason === "cashout" ? BetState.CASHED_OUT : BetState.WON, settledAt: new Date() }),
          },
        });
      }
      const b2 = await totalBalance(tx, player.id, currency);
      const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id }, select: { activeWallet: true } });
      const body = { success: true, transaction_id: txId, balance_after: n2(fresh.activeWallet === WalletType.BONUS ? b2.bonus : b2.main) };
      await tx.walletRequest.create({
        data: { transactionId: txId, kind: "credit", playerId: player.id, amount, currency, providerBetId: b.bet_id, couponId: b.coupon_id, reason, fromMain: toMain, fromBonus: toBonus, status: "SUCCESS", response: body },
      });
      return { http: 200, body };
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const r = await replay(db, txId);
      if (r) return r;
    }
    throw e;
  }
}

// ---------------- /rollback ----------------
export async function rollback(db: PrismaClient, b: any): Promise<WalletReply> {
  const txId = String(b.transaction_id || "");
  const origId = String(b.original_transaction_id || "");
  const prev = txId ? await replay(db, txId) : null;
  if (prev) return prev;

  const playerId = playerIdOf(b.user_id) ?? 0;
  try {
    return await db.$transaction(async (tx) => {
      const orig = origId ? await tx.walletRequest.findUnique({ where: { transactionId: origId } }) : null;
      let balanceAfter: number | undefined;

      if (!orig) {
        // Debit henüz ulaşmadı → iade yapma, iptal olarak işaretle
        await tx.cancelledTransaction.upsert({ where: { transactionId: origId }, update: {}, create: { transactionId: origId } });
      } else if (orig.kind === "debit" && orig.status === "SUCCESS" && !orig.refunded) {
        const ref = `sb:${orig.providerBetId}`;
        if (D(orig.fromMain).gt(0)) await move(tx, { playerId: orig.playerId, wallet: WalletType.MAIN, type: TxType.BET_REFUND, amount: orig.fromMain, reference: ref, currency: orig.currency, note: `rollback · ${b.reason ?? ""}` });
        if (D(orig.fromBonus).gt(0)) await move(tx, { playerId: orig.playerId, wallet: WalletType.BONUS, type: TxType.BET_REFUND, amount: orig.fromBonus, reference: ref, currency: orig.currency, note: `rollback · ${b.reason ?? ""}` });
        await tx.walletRequest.update({ where: { id: orig.id }, data: { refunded: true } });
        if (orig.providerBetId) await tx.bet.updateMany({ where: { providerBetId: orig.providerBetId }, data: { state: BetState.CANCELLED, settledAt: new Date() } });
        const b3 = await totalBalance(tx, orig.playerId, orig.currency);
        const pw = await tx.player.findUniqueOrThrow({ where: { id: orig.playerId }, select: { activeWallet: true } });
        balanceAfter = n2(pw.activeWallet === WalletType.BONUS ? b3.bonus : b3.main);
      }
      // orig REJECTED veya zaten iade edilmiş → para hareketi yok

      const body: Record<string, unknown> = { success: true, transaction_id: txId };
      if (balanceAfter !== undefined) body.balance_after = balanceAfter;
      if (txId) {
        await tx.walletRequest.create({
          data: { transactionId: txId, kind: "rollback", playerId: orig?.playerId ?? playerId, amount: D(b.amount || 0), currency: String(b.currency || "TRY"), providerBetId: b.bet_id, couponId: b.coupon_id, reason: b.reason, status: "SUCCESS", response: body as any },
        });
      }
      return { http: 200, body };
    });
  } catch (e: any) {
    if (e?.code === "P2002" && txId) {
      const r = await replay(db, txId);
      if (r) return r;
    }
    throw e;
  }
}

// ---------------- Webhook ----------------
const OUTCOME: Record<string, BetState> = { won: BetState.WON, lost: BetState.LOST, returned: BetState.RETURNED, cashout: BetState.CASHED_OUT };

export async function handleWebhook(db: PrismaClient, webhookId: string, payload: any) {
  // tekilleştirme
  try {
    await db.webhookEvent.create({ data: { webhookId, event: String(payload?.event), payload } });
  } catch (e: any) {
    if (e?.code === "P2002") return "duplicate";
    throw e;
  }
  const d = payload?.data ?? {};
  try {
    switch (payload?.event) {
      case "bet_placed": {
        const bet = await db.bet.findUnique({ where: { providerBetId: String(d.bet_id) } });
        if (!bet) break; // debit kaydı yoksa (olmamalı) atla
        await db.bet.update({
          where: { id: bet.id },
          data: {
            couponId: String(d.coupon_id ?? bet.couponId ?? ""),
            totalOdds: D(d.total_odds ?? bet.totalOdds),
            potentialWin: D(d.potential_win ?? bet.potentialWin),
            type: d.bet_type === 2 || (d.selections_count ?? 1) > 1 ? "MULTIPLE" : "SINGLE",
            isLive: (d.selections ?? []).some((s: any) => s.is_live),
          },
        });
        await db.betSelection.deleteMany({ where: { betId: bet.id } });
        if (Array.isArray(d.selections) && d.selections.length) {
          await db.betSelection.createMany({
            data: d.selections.map((s: any) => ({
              betId: bet.id,
              providerEventId: String(s.game_id ?? ""),
              sport: s.sport ?? "",
              region: s.region ?? null,
              competition: s.competition ?? null,
              matchName: s.match ?? s.game_name ?? String(s.game_id ?? ""),
              matchStart: s.start_ts ? new Date(s.start_ts) : new Date(),
              market: s.market_name ?? s.market ?? "",
              selection: s.pick ?? "",
              odds: D(s.price ?? 1),
              isLive: Boolean(s.is_live),
            })),
          });
        }
        break;
      }
      case "bet_settled": {
        const bet = await db.bet.findUnique({ where: { providerBetId: String(d.bet_id) }, include: { selections: true } });
        if (!bet) break;
        const state = OUTCOME[d.outcome] ?? bet.state;
        await db.bet.update({ where: { id: bet.id }, data: { state, settledAt: new Date(), winAmount: D(d.payout ?? bet.winAmount) } });
        // Çevrim: sadece kazanılan/kaybedilen bonuslu kuponlar, bonus kuralları sağlanıyorsa
        if (bet.playerBonusId && (state === BetState.WON || state === BetState.LOST)) {
          const pb = await db.playerBonus.findUnique({ where: { id: bet.playerBonusId }, include: { bonus: true } });
          if (pb && pb.state === PlayerBonusState.ACTIVE && matchesRules(pb.bonus.rules as any, bet)) {
            await db.$transaction((tx) => addWagering(tx, pb.id, bet.stake));
          }
        }
        break;
      }
      case "balance_status_changed": {
        await db.cmsSetting.upsert({ where: { key: "sportsbook_partner_balance" }, update: { value: d }, create: { key: "sportsbook_partner_balance", value: d } });
        break;
      }
      // bet_won: bet_settled ile aynı bilgiyi taşır, ayrıca işlem gerekmez
    }
    return "ok";
  } catch (e: any) {
    await db.webhookEvent.update({ where: { webhookId }, data: { error: String(e?.message ?? e) } });
    return "error";
  }
}

/** Bonus Spor Kuralları kontrolü (Backoffice > Bonus > Spor Kuralları) */
export function matchesRules(rules: any, bet: { type: string; totalOdds: Prisma.Decimal; isLive: boolean; selections: { odds: Prisma.Decimal }[] }) {
  if (!rules) return true;
  if (rules.betType && rules.betType !== "ANY" && rules.betType !== bet.type) return false;
  if (rules.eventType === "PREMATCH" && bet.isLive) return false;
  if (rules.eventType === "LIVE" && !bet.isLive) return false;
  const sels = bet.selections.length || 1;
  if (rules.minSelections && sels < Number(rules.minSelections)) return false;
  if (rules.minSelectionOdds && bet.selections.some((s) => Number(s.odds) < Number(rules.minSelectionOdds))) return false;
  if (rules.minTotalOdds && Number(bet.totalOdds) < Number(rules.minTotalOdds)) return false;
  return true;
}
