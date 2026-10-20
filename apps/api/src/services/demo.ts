/**
 * Demo veri — backoffice ekranlarını dolu görmek için. Tüm demo oyuncuların btag'i "DEMO".
 * purgeDemo() hepsini (ve demo piyasalarını) siler. Canlıya geçmeden önce çalıştırılmalı.
 */
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, TxType, WalletType, PaymentState, PaymentType, BetState, PlayerBonusState } from "@prisma/client";
import { ensureWallets, move } from "./wallet.js";
import { grantBonus } from "./bonus.js";
import { importFeed, buy, resolveMarket, fpmmInit, fpmmPrices } from "./predictions.js";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86400_000 - h * 3600_000);

const NAMES: [string, string][] = [["Ahmet", "Yılmaz"], ["Mehmet", "Kaya"], ["Ayşe", "Demir"], ["Fatma", "Çelik"], ["Mustafa", "Şahin"], ["Emre", "Yıldız"],
  ["Zeynep", "Aydın"], ["Burak", "Öztürk"], ["Elif", "Arslan"], ["Can", "Doğan"], ["Selin", "Koç"], ["Murat", "Kurt"]];
const MATCHES = [
  ["Futbol", "Türkiye", "Süper Lig", "Galatasaray - Fenerbahçe"], ["Futbol", "Türkiye", "Süper Lig", "Beşiktaş - Trabzonspor"],
  ["Futbol", "Avrupa", "UEFA Şampiyonlar Ligi", "Real Madrid - Bayern Münih"], ["Futbol", "İngiltere", "Premier Lig", "Arsenal - Chelsea"],
  ["Futbol", "İspanya", "La Liga", "Barcelona - Atletico Madrid"], ["Basketbol", "Avrupa", "Euroleague", "Anadolu Efes - Fenerbahçe Beko"],
  ["Basketbol", "ABD", "NBA", "Lakers - Celtics"], ["Tenis", "Dünya", "ATP Paris", "Alcaraz - Sinner"], ["Voleybol", "Türkiye", "Sultanlar Ligi", "VakıfBank - Eczacıbaşı"],
];
const MARKETS = [["Maç Sonucu", ["1", "X", "2"]], ["Toplam Gol", ["Üst (2.5)", "Alt (2.5)"]], ["Karşılıklı Gol", ["Var", "Yok"]], ["Çifte Şans", ["1X", "X2"]]] as const;

async function backdate(db: PrismaClient, txId: bigint, at: Date) {
  await db.transaction.update({ where: { id: txId }, data: { createdAt: at } });
}

export async function seedDemo(db: PrismaClient) {
  seed = 42;
  if (await db.player.count({ where: { btag: "DEMO" } })) return { skipped: "Demo veri zaten var. Önce silin." };
  const out = { players: 0, deposits: 0, withdrawals: 0, bets: 0, bonuses: 0, markets: 0, positions: 0 };
  const hash = await bcrypt.hash("demo123456", 10);

  // --- Bonus tanımları ---
  const upsertBonus = async (name: string, data: any) => (await db.bonus.findFirst({ where: { name } })) ?? db.bonus.create({ data: { name, ...data } });
  const welcome = await upsertBonus("Hoş Geldin %100 Spor Bonusu", { type: "DEPOSIT", product: "SPORT", percent: 100, minAmount: 100, maxAmount: 2500, wageringMultiplier: 8, expirationDays: 14, description: "İlk yatırımına %100, en fazla 2.500 ₺. 8x çevrim, min 1.50 oran, kombine.", rules: { betType: "MULTIPLE", eventType: "ANY", minSelections: 3, minSelectionOdds: 1.5 } });
  const loss = await upsertBonus("Kayıp Bonusu Spor %20", { type: "MANUAL", product: "SPORT", minAmount: 50, maxAmount: 5000, wageringMultiplier: 1, expirationDays: 7, availableOnRequest: true, description: "Haftalık kayıplarının %20'si. 1x çevrim." });
  const freebet = await upsertBonus("Freebet 100 ₺", { type: "FREEBET", product: "SPORT", minAmount: 100, maxAmount: 100, wageringMultiplier: 1, expirationDays: 3, maxPayout: 1000, description: "100 ₺ freebet, maks 1.000 ₺ kazanç." });
  if (!(await db.promoCode.findUnique({ where: { code: "SPORTY100" } })))
    await db.promoCode.create({ data: { code: "SPORTY100", bonusId: freebet.id, amount: 100, maxCount: 500, description: "Lansman promo kodu" } });

  // --- Oyuncular ---
  const players = [];
  for (let i = 0; i < NAMES.length; i++) {
    const [fn, ln] = NAMES[i];
    const reg = daysAgo(Math.floor(rnd() * 28) + 1, Math.floor(rnd() * 20));
    const username = `demo_${fn.toLowerCase().replace(/ş/g, "s").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ı/g, "i").replace(/ü/g, "u").replace(/ğ/g, "g")}${i + 1}`;
    const p = await db.player.create({ data: {
      username, passwordHash: hash, firstName: fn, lastName: ln, email: `${username}@demo.sportybet`, phone: `90555${String(1000000 + i * 7919).slice(0, 7)}`,
      btag: "DEMO", createdAt: reg, lastLoginAt: daysAgo(Math.floor(rnd() * 3)), lastLoginIp: `85.105.${i}.${10 + i}`,
      category: i === 3 ? "VIP" : i === 7 ? "HIGH_RISK" : "LOW_RISK", isVerified: rnd() > 0.4, loyaltyLevel: pick(["Bronz", "Gümüş", "Altın"]),
    } });
    await ensureWallets(db, p.id);
    for (let k = 0; k < 3 + Math.floor(rnd() * 6); k++) await db.loginLog.create({ data: { playerId: p.id, ip: p.lastLoginIp, userAgent: "Mozilla/5.0 (demo)", createdAt: daysAgo(Math.floor(rnd() * 7), Math.floor(rnd() * 23)) } });
    players.push(p); out.players++;
  }

  // --- Yatırımlar ---
  const systems = ["BankTransfer", "CryptoUSDT"];
  for (const p of players) {
    const n = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const amount = pick([250, 500, 1000, 1500, 2500, 5000, 10000]);
      const at = daysAgo(Math.floor(rnd() * 14), Math.floor(rnd() * 23));
      const pr = await db.paymentRequest.create({ data: { playerId: p.id, type: PaymentType.DEPOSIT, amount, state: PaymentState.PAID, paymentSystem: pick(systems), createdAt: at, processedAt: at, info: { demo: true } } });
      const t = await db.$transaction((tx) => move(tx, { playerId: p.id, wallet: WalletType.MAIN, type: TxType.DEPOSIT, amount, paymentSystem: pr.paymentSystem, reference: `pay:${pr.id}` }));
      await backdate(db, t.id, at); out.deposits++;
    }
  }
  // bekleyen yatırım talepleri
  for (const p of players.slice(0, 3)) { await db.paymentRequest.create({ data: { playerId: p.id, type: PaymentType.DEPOSIT, amount: pick([500, 1000, 2000]), paymentSystem: "BankTransfer", bonusId: welcome.id, info: { demo: true } } }); out.deposits++; }

  // --- Bonuslar ---
  for (const p of players.slice(0, 4)) {
    try { const pb = await grantBonus(db, { playerId: p.id, bonusId: welcome.id, amount: pick([500, 1000, 1500]), skipLimits: true }); await db.playerBonus.update({ where: { id: pb.id }, data: { wagerDone: D(pb.wagerRequired).mul(rnd() * 0.7).toDecimalPlaces(2) } }); out.bonuses++; } catch {}
  }
  for (const p of players.slice(4, 6)) { try { await grantBonus(db, { playerId: p.id, bonusId: freebet.id, amount: 100, skipLimits: true }); out.bonuses++; } catch {} }
  // tamamlanmış bir bonus geçmişi (aktif bonusu olmayan oyuncuda)
  { const p = players[6]; const pb = await grantBonus(db, { playerId: p.id, bonusId: loss.id, amount: 300, skipLimits: true });
    const w = await db.wallet.findFirstOrThrow({ where: { playerId: p.id, type: WalletType.BONUS } });
    await db.$transaction(async (tx) => {
      await move(tx, { playerId: p.id, wallet: WalletType.BONUS, type: TxType.BONUS_CONVERT, amount: D(w.balance).neg(), reference: `bonus:${pb.id}` });
      await move(tx, { playerId: p.id, wallet: WalletType.MAIN, type: TxType.BONUS_CONVERT, amount: w.balance, reference: `bonus:${pb.id}` });
      await tx.playerBonus.update({ where: { id: pb.id }, data: { state: PlayerBonusState.COMPLETED, wagerDone: pb.wagerRequired, convertedAmount: w.balance, resultAt: new Date() } });
    }); out.bonuses++; }
  for (const p of players.slice(7, 9)) await db.bonusRequest.create({ data: { playerId: p.id, bonusId: loss.id } });

  // --- Spor kuponları (Betco formatında, doğrudan DB) ---
  for (const p of players) {
    const nBets = 3 + Math.floor(rnd() * 8);
    for (let k = 0; k < nBets; k++) {
      const main = await db.wallet.findFirstOrThrow({ where: { playerId: p.id, type: WalletType.MAIN } });
      const bonusW = await db.wallet.findFirstOrThrow({ where: { playerId: p.id, type: WalletType.BONUS } });
      const useBonus = Number(bonusW.balance) >= 100 && rnd() > 0.6;
      const bal = Number(useBonus ? bonusW.balance : main.balance);
      if (bal < 50) break;
      const stake = Math.min(bal, pick([50, 100, 200, 250, 500, 1000]));
      const nSel = rnd() > 0.55 ? 1 : 2 + Math.floor(rnd() * 3);
      const isLive = rnd() > 0.65;
      const at = daysAgo(Math.floor(rnd() * 10), Math.floor(rnd() * 23));
      const sels = Array.from({ length: nSel }, () => { const m = pick(MATCHES); const mk = pick([...MARKETS]); return { m, market: mk[0], sel: pick([...mk[1]]), odds: Number((1.3 + rnd() * 1.9).toFixed(2)) }; });
      const totalOdds = Number(sels.reduce((a, s) => a * s.odds, 1).toFixed(3));
      const r = rnd(); const state = at > daysAgo(0, 3) || r < 0.15 ? BetState.ACTIVE : r < 0.55 ? BetState.LOST : r < 0.93 ? BetState.WON : BetState.RETURNED;
      const win = state === BetState.WON ? Number((stake * totalOdds).toFixed(2)) : state === BetState.RETURNED ? stake : 0;
      const pb = useBonus ? await db.playerBonus.findFirst({ where: { playerId: p.id, state: PlayerBonusState.ACTIVE } }) : null;
      const wallet = useBonus ? WalletType.BONUS : WalletType.MAIN;
      const bet = await db.bet.create({ data: {
        providerBetId: `demo-${p.id}-${k}-${Math.floor(rnd() * 1e9)}`, couponId: String(800000000000000 + Math.floor(rnd() * 99999999999999)), playerId: p.id,
        type: nSel > 1 ? "MULTIPLE" : "SINGLE", stake, stakeFromMain: useBonus ? 0 : stake, stakeFromBonus: useBonus ? stake : 0, totalOdds, potentialWin: Number((stake * totalOdds).toFixed(2)),
        winAmount: win, state, isLive, playerBonusId: pb?.id, source: pick(["Web", "Mobile"]), ip: p.lastLoginIp, createdAt: at, settledAt: state === BetState.ACTIVE ? null : new Date(at.getTime() + 2 * 3600_000),
        selections: { create: sels.map((s, j) => ({
          providerEventId: String(30000000 + Math.floor(rnd() * 999999)), sport: s.m[0], region: s.m[1], competition: s.m[2], matchName: s.m[3], matchStart: new Date(at.getTime() + 3600_000),
          market: s.market, selection: s.sel, odds: s.odds, isLive,
          state: state === BetState.ACTIVE ? BetState.ACTIVE : state === BetState.WON ? BetState.WON : state === BetState.RETURNED ? BetState.RETURNED : j === 0 ? BetState.LOST : pick([BetState.WON, BetState.LOST]),
          info: state === BetState.ACTIVE ? null : `${Math.floor(rnd() * 4)} : ${Math.floor(rnd() * 3)}`,
        })) },
      } });
      const t1 = await db.$transaction((tx) => move(tx, { playerId: p.id, wallet, type: TxType.BET_STAKE, amount: -stake, reference: `sb:${bet.providerBetId}`, note: `Kupon ${bet.couponId}` }));
      await backdate(db, t1.id, at);
      if (win > 0) { const t2 = await db.$transaction((tx) => move(tx, { playerId: p.id, wallet, type: state === BetState.RETURNED ? TxType.BET_REFUND : TxType.BET_WIN, amount: win, reference: `sb:${bet.providerBetId}`, note: `Kupon ${bet.couponId}` })); await backdate(db, t2.id, new Date(at.getTime() + 2 * 3600_000)); }
      if (pb && state !== BetState.ACTIVE && state !== BetState.RETURNED) await db.playerBonus.update({ where: { id: pb.id }, data: { wagerDone: { increment: stake } } });
      out.bets++;
    }
  }

  // --- Çekimler (bakiyesi yetenlerden) ---
  let wn = 0;
  for (const p of players) {
    if (await db.playerBonus.findFirst({ where: { playerId: p.id, state: PlayerBonusState.ACTIVE } })) continue;
    const main = await db.wallet.findFirstOrThrow({ where: { playerId: p.id, type: WalletType.MAIN } });
    if (Number(main.balance) < 300) continue;
    const amount = Math.floor(Number(main.balance) * (0.3 + rnd() * 0.4));
    const state = [PaymentState.PAID, PaymentState.NEW, PaymentState.PENDING, PaymentState.REJECTED, PaymentState.PAID][wn++ % 5];
    const at = daysAgo(Math.floor(rnd() * 5), Math.floor(rnd() * 20));
    const pr = await db.paymentRequest.create({ data: { playerId: p.id, type: PaymentType.WITHDRAWAL, amount, state, paymentSystem: pick(systems), createdAt: at,
      processedAt: state === PaymentState.PAID || state === PaymentState.REJECTED ? new Date(at.getTime() + 1800_000) : null,
      rejectReason: state === PaymentState.REJECTED ? "Çevrim şartı tamamlanmadı" : null, info: { fullName: `${p.firstName} ${p.lastName}`, iban: "TR33 0006 1005 1978 6457 8413 26" } } });
    const t = await db.$transaction((tx) => move(tx, { playerId: p.id, wallet: WalletType.MAIN, type: TxType.WITHDRAWAL, amount: -amount, paymentSystem: pr.paymentSystem, reference: `pay:${pr.id}`, note: "Çekim talebi (bloke)" }));
    await backdate(db, t.id, at);
    if (state === PaymentState.REJECTED) await db.$transaction((tx) => move(tx, { playerId: p.id, wallet: WalletType.MAIN, type: TxType.WITHDRAWAL_REFUND, amount, reference: `pay:${pr.id}`, note: "Reddedildi" }));
    out.withdrawals++;
  }

  // --- Tahmin piyasaları: örnek feed + yerel demo piyasalar ---
  try {
    const sample = JSON.parse(readFileSync(new URL("../../seed/predictions-sample.json", import.meta.url), "utf8"));
    const r = await importFeed(db, sample, true); out.markets += r.imported;
  } catch (e) { console.error("demo predictions import", e); }
  const cat = await db.predictionCategory.upsert({ where: { slug: "futbol" }, update: {}, create: { name: "Futbol", slug: "futbol" } });
  const mk = async (question: string, mode: "NO_IMPACT" | "AFFECTS_ODDS", outs: [string, number][], hours: number) => {
    const reserves = mode === "AFFECTS_ODDS" ? fpmmInit(outs.map((o) => o[1]), 20000) : null;
    const prices = reserves ? fpmmPrices(reserves) : outs.map((o) => o[1]);
    const m = await db.predictionMarket.create({ data: {
      question, slug: `demo-${Math.floor(rnd() * 1e9)}`, oddsImpactMode: mode, status: "active", activatedAt: new Date(), deadline: new Date(Date.now() + hours * 3600_000),
      isHomepage: true, sortOrder: 3000, metadata: { demo: true }, liquidity: 20000, feePct: mode === "AFFECTS_ODDS" ? 2 : 0,
      rules: "<p>Demo piyasa. Sonuç resmi maç raporuna göre belirlenir.</p>",
      outcomes: { create: outs.map((o, k) => ({ name: o[0], price: D(prices[k].toFixed(4)), reserve: reserves ? D(reserves[k].toFixed(10)) : D(0), sortOrder: k })) },
      categories: { create: [{ categoryId: cat.id }] },
    }, include: { outcomes: true } });
    out.markets++; return m;
  };
  const m1 = await mk("Galatasaray - Fenerbahçe derbisini kim kazanır?", "AFFECTS_ODDS", [["Galatasaray", 0.45], ["Beraberlik", 0.27], ["Fenerbahçe", 0.28]], 72);
  const m2 = await mk("Derbide kırmızı kart çıkar mı?", "NO_IMPACT", [["Evet", 0.42], ["Hayır", 0.63]], 72);
  const m3 = await mk("Arda Güler bu hafta gol atar mı?", "NO_IMPACT", [["Evet", 0.35], ["Hayır", 0.7]], 48);
  for (const p of players) {
    for (const m of [m1, m2, m3]) {
      if (rnd() > 0.6) continue;
      const fresh = await db.player.findUniqueOrThrow({ where: { id: p.id }, include: { wallets: true } });
      const bal = Number(fresh.wallets.find((w) => w.type === fresh.activeWallet)?.balance ?? 0);
      if (bal < 50) continue;
      try { await buy(db, p.id, m.id, pick(m.outcomes).id, Math.min(bal, pick([50, 100, 250, 500]))); out.positions++; } catch {}
    }
  }
  // biri sonuçlanmış olsun
  await resolveMarket(db, m3.id, m3.outcomes.find((o) => o.name === "Hayır")!.id);
  return out;
}

export async function purgeDemo(db: PrismaClient) {
  const ids = (await db.player.findMany({ where: { btag: "DEMO" }, select: { id: true } })).map((p) => p.id);
  const demoMarkets = (await db.predictionMarket.findMany({ where: { metadata: { path: ["demo"], equals: true } }, select: { id: true } })).map((m) => m.id);
  await db.$transaction([
    db.predictionPosition.deleteMany({ where: { OR: [{ playerId: { in: ids } }, { marketId: { in: demoMarkets } }] } }),
    db.predictionSave.deleteMany({ where: { playerId: { in: ids } } }),
    db.predictionMarket.deleteMany({ where: { id: { in: demoMarkets } } }),
    db.betSelection.deleteMany({ where: { bet: { playerId: { in: ids } } } }),
    db.bet.deleteMany({ where: { playerId: { in: ids } } }),
    db.transaction.deleteMany({ where: { playerId: { in: ids } } }),
    db.wallet.deleteMany({ where: { playerId: { in: ids } } }),
    db.paymentRequest.deleteMany({ where: { playerId: { in: ids } } }),
    db.promoRedemption.deleteMany({ where: { playerId: { in: ids } } }),
    db.bonusRequest.deleteMany({ where: { playerId: { in: ids } } }),
    db.playerBonus.deleteMany({ where: { playerId: { in: ids } } }),
    db.playerNote.deleteMany({ where: { playerId: { in: ids } } }),
    db.loginLog.deleteMany({ where: { playerId: { in: ids } } }),
    db.walletRequest.deleteMany({ where: { playerId: { in: ids } } }),
    db.player.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return { players: ids.length, markets: demoMarkets.length };
}
