/**
 * BET BUILDER — aynı maçtan birden fazla seçimi tek kupon ayağında birleştirir.
 *
 * Neden basit çarpım değil: aynı maçtaki seçimler birbirine bağlıdır (ör. "Maç Sonucu 1" + "2.5 Üst" birlikte daha olası,
 * "1" + "KG Yok" farklı). Bu yüzden oranı maçın skor olasılık dağılımından hesaplarız:
 *  1) Maçın 1X2 ve Alt/Üst 2.5 oranlarından (marj ayıklanmış) ev ve deplasman gol beklentisi (λh, λa) bulunur — Poisson modeli.
 *  2) Gol beklentisi ilk yarı %45 / ikinci yarı %55 bölünür (yarılar bağımsız Poisson) → İY, MS, İY/MS hepsi tutarlı.
 *  3) Seçimlerin hepsinin tuttuğu skorların olasılığı toplanır = birleşik olasılık P.
 *  4) Bağımlılık oranı = (tek tek olasılıkların çarpımı) / P. Sitenin kendi oranlarının çarpımı bu oranla düzeltilir,
 *     ek bet builder marjı uygulanır ve sonuç asla düz çarpımdan yüksek olmaz (risk koruması).
 *  5) P ≈ 0 ise seçimler çelişkilidir ("1" + "X2", "1.5 Alt" + "2.5 Üst") → kupon reddedilir.
 * Aynı marketten iki seçim (çaprazı) yasaktır.
 */
import { MARKETS } from "./sb.js";

/** Bet builder'da kullanılabilen marketler (Beraberlikte İade iade ihtimali yüzünden hariç) */
export const BB_MARKETS = ["1x2", "dc", "ou15", "ou25", "ou35", "btts", "oe", "ht1x2", "htft"];
const HT_SHARE = 0.45;
const MAXG = 9; // yarı başına takım gol üst sınırı (olasılığın ~tamamı)

type Leg = { marketKey: string; code: string; odds: number };
type MarketOdds = Record<string, Record<string, number>>; // key → code → oran

const pois = (l: number) => { const p: number[] = []; let f = Math.exp(-l); for (let k = 0; k <= MAXG; k++) { p.push(f); f = (f * l) / (k + 1); } return p; };

/** Marjı ayıklanmış olasılıklar */
function fair(m?: Record<string, number>) {
  if (!m) return null;
  const inv = Object.fromEntries(Object.entries(m).filter(([, o]) => o > 1).map(([k, o]) => [k, 1 / o]));
  const s = Object.values(inv).reduce((a, b) => a + b, 0);
  return s > 0 ? Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v / s])) : null;
}

/** 1X2 + Alt/Üst 2.5'ten λh, λa (ızgara arama + ince ayar) */
export function fitLambdas(mk: MarketOdds): { lh: number; la: number } {
  const p1 = fair(mk["1x2"]); const pou = fair(mk["ou25"]);
  const target = { H: p1?.HOME ?? 0.45, D: p1?.DRAW ?? 0.27, A: p1?.AWAY ?? 0.28, O: pou?.OVER ?? 0.52 };
  const score = (lh: number, la: number) => {
    const ph = pois(lh), pa = pois(la); let H = 0, D = 0, A = 0, U = 0;
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) { const p = ph[i] * pa[j]; if (i > j) H += p; else if (i === j) D += p; else A += p; if (i + j <= 2) U += p; }
    return (H - target.H) ** 2 + (D - target.D) ** 2 + (A - target.A) ** 2 + (pou ? ((1 - U) - target.O) ** 2 : 0);
  };
  let best = { lh: 1.4, la: 1.1, e: Infinity };
  for (let lh = 0.1; lh <= 4.01; lh += 0.1) for (let la = 0.1; la <= 4.01; la += 0.1) { const e = score(lh, la); if (e < best.e) best = { lh, la, e }; }
  for (let step = 0.05; step >= 0.005; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dh, da] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const lh = best.lh + dh, la = best.la + da; if (lh <= 0.02 || la <= 0.02) continue;
        const e = score(lh, la); if (e < best.e) { best = { lh, la, e }; moved = true; }
      }
    }
  }
  return { lh: best.lh, la: best.la };
}

/** Seçimlerin hepsinin tutma olasılığı + her birinin tek başına olasılığı */
function probabilities(legs: Leg[], lh: number, la: number) {
  const h1 = pois(lh * HT_SHARE), a1 = pois(la * HT_SHARE), h2 = pois(lh * (1 - HT_SHARE)), a2 = pois(la * (1 - HT_SHARE));
  const defs = legs.map((l) => MARKETS[l.marketKey]);
  const single = legs.map(() => 0); let joint = 0;
  for (let i1 = 0; i1 <= MAXG; i1++) for (let j1 = 0; j1 <= MAXG; j1++) {
    const pHT = h1[i1] * a1[j1]; if (pHT < 1e-12) continue;
    for (let i2 = 0; i2 <= MAXG; i2++) for (let j2 = 0; j2 <= MAXG; j2++) {
      const p = pHT * h2[i2] * a2[j2]; if (p < 1e-13) continue;
      const ctx = { h: i1 + i2, a: j1 + j2, hh: i1, ha: j1 };
      let all = true;
      for (let k = 0; k < legs.length; k++) { const won = defs[k].settle(legs[k].code, ctx) === "WON"; if (won) single[k] += p; else all = false; }
      if (all) joint += p;
    }
  }
  return { joint, single };
}

export type BbQuote = { ok: true; odds: number; product: number; joint: number; correlation: number } | { ok: false; error: string; detail?: any };

/** Aynı maçtaki seçimler için bet builder oranı */
export function quoteBuilder(legs: Leg[], eventMarkets: MarketOdds, opt: { marginPct: number; maxLegs: number }): BbQuote {
  if (legs.length < 2) return { ok: false, error: "BB_MIN_LEGS" };
  if (legs.length > opt.maxLegs) return { ok: false, error: "BB_MAX_LEGS", detail: { max: opt.maxLegs } };
  const bad = legs.find((l) => !BB_MARKETS.includes(l.marketKey));
  if (bad) return { ok: false, error: "BB_MARKET_NOT_ALLOWED", detail: { market: bad.marketKey } };
  const keys = legs.map((l) => l.marketKey);
  if (new Set(keys).size !== keys.length) return { ok: false, error: "BB_SAME_MARKET" }; // çaprazı yok
  if (!eventMarkets["1x2"]) return { ok: false, error: "BB_NO_PRICE" };
  const { lh, la } = fitLambdas(eventMarkets);
  const { joint, single } = probabilities(legs, lh, la);
  if (joint < 0.002) return { ok: false, error: "BB_CONTRADICTION" };
  const product = legs.reduce((a, l) => a * l.odds, 1);
  // bir seçim diğerini zaten kapsıyorsa (ör. "1" + "1-X") ayrı ayak sayılmaz → engelle (oyuncuya yanlış değer göstermeyelim)
  for (let k = 0; k < legs.length; k++) {
    const others = legs.filter((_, i) => i !== k);
    if (others.length && Math.abs(probabilities(others, lh, la).joint - joint) < 1e-6) return { ok: false, error: "BB_REDUNDANT", detail: { marketKey: legs[k].marketKey, code: legs[k].code } };
  }
  const indep = single.reduce((a, p) => a * p, 1);
  const correlation = indep / joint; // <1: birlikte daha olası (oran düşer), >1: daha az olası
  const raw = product * correlation * (1 - opt.marginPct / 100);
  const odds = Math.max(1.01, Math.floor(Math.min(raw, product) * 100) / 100);
  return { ok: true, odds, product: Math.round(product * 100) / 100, joint, correlation };
}
