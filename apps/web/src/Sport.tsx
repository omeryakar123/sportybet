import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Btn, ErrBox, Spinner, money, useStore } from "./lib";

/**
 * SportyBet Sportsbook — BetWin (koyu mor/magenta, kalın italik condensed, enerjik)
 * ve SportsBet (temiz yerleşim, renkli lig kartları, net maç satırları) harmanı.
 * Gerçek veri: kendi motorumuz /api/sb/* (API-Football beslemeli).
 */
type Sel = { id: number; code: string; name: string; odds: number };
type Market = { key: string; name: string; selections: Sel[] };
type Ev = { id: number; league: string; leagueId: number; country?: string; leagueLogo?: string; home: string; away: string; homeLogo?: string; awayLogo?: string; startsAt: string; status: string; markets: Market[] };
type League = { id: number; name: string; country?: string; logo?: string; count: number };
type Pick = { selId: number; evId: number; match: string; market: string; pick: string; odds: number };

const GRADS = ["from-[#7c3aed] to-[#d946ef]", "from-[#2563eb] to-[#06b6d4]", "from-[#db2777] to-[#f59e0b]", "from-[#16a34a] to-[#4ade80]", "from-[#e11d48] to-[#f97316]", "from-[#6366f1] to-[#d946ef]"];
const SPORTS = [["⚽", "Futbol", true], ["🏀", "Basketbol"], ["🎾", "Tenis"], ["🏐", "Voleybol"], ["🏒", "Buz Hokeyi"], ["🎮", "E-Spor"], ["🏈", "Amerikan F."], ["⚾", "Beyzbol"]] as const;

const fmtTime = (s: string) => { const d = new Date(s); const now = new Date(); const sameDay = d.toDateString() === now.toDateString(); return (sameDay ? "Bugün " : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }) + " ") + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); };
const sel = (m: Market | undefined, code: string) => m?.selections.find((s) => s.code === code);

export default function Sport() {
  const { me, setAuthOpen, balance, refreshMe } = useStore();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [lg, setLg] = useState<number | 0>(0);
  const [err, setErr] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [stake, setStake] = useState("100");
  const [mode, setMode] = useState<"combo" | "single">("combo");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [slipOpen, setSlipOpen] = useState(false);

  const load = () => { setErr(""); setEvents(null); api(`/api/sb/events${lg ? `?league=${lg}` : ""}`).then(setEvents).catch((e) => { setEvents([]); setErr(e.message); }); };
  useEffect(() => { api("/api/sb/leagues").then(setLeagues).catch(() => {}); }, []);
  useEffect(() => { load(); }, [lg]);

  const grouped = useMemo(() => { const g: Record<string, Ev[]> = {}; (events ?? []).forEach((e) => { (g[e.league] ??= []).push(e); }); return Object.entries(g); }, [events]);

  function toggle(ev: Ev, m: Market, s: Sel) {
    setPicks((p) => {
      if (p.some((x) => x.selId === s.id)) return p.filter((x) => x.selId !== s.id);
      const noEv = p.filter((x) => x.evId !== ev.id);
      return [...noEv, { selId: s.id, evId: ev.id, match: `${ev.home} - ${ev.away}`, market: m.name, pick: s.name, odds: s.odds }];
    });
    setSlipOpen(true);
  }
  const has = (id: number) => picks.some((p) => p.selId === id);

  const totalOdds = mode === "combo" ? picks.reduce((a, p) => a * p.odds, 1) : 0;
  const st = parseFloat(stake.replace(",", ".")) || 0;
  const potWin = mode === "combo" ? st * totalOdds : picks.reduce((a, p) => a + st * p.odds, 0);
  const cost = mode === "combo" ? st : st * picks.length;

  async function place() {
    if (!me) { setAuthOpen(true); return; }
    setBusy(true); setErr("");
    try {
      await api("/api/sb/bet", { method: "POST", json: { selectionIds: picks.map((p) => p.selId), stake: st, mode } });
      setToast("Kupon oynandı! 🎉"); setPicks([]); setSlipOpen(false); refreshMe(); setTimeout(() => setToast(""), 2500);
    } catch (e: any) {
      const map: Record<string, string> = { INSUFFICIENT_BALANCE: "Yetersiz bakiye", EVENT_STARTED: "Maç başladı, oran kapandı", SELECTION_CLOSED: "Seçim kapandı", MAX_STAKE_EXCEEDED: "Azami bahis aşıldı", SPORT_BLOCKED: "Spor bahsi hesabında kapalı", SAME_EVENT_IN_COMBO: "Aynı maçtan kombinede tek seçim", TOO_MANY_SELECTIONS: "Çok fazla seçim" };
      setErr(map[e.message] || e.message);
    }
    setBusy(false);
  }

  const oddBtn = (ev: Ev, m: Market | undefined, code: string, label: string) => {
    const s = sel(m, code);
    if (!s || !m) return <div className="grid place-items-center rounded-lg bg-[#1a1138] py-2.5 text-xs font-bold text-[#5b5080]">-</div>;
    const on = has(s.id);
    return (
      <button onClick={() => toggle(ev, m, s)} className={`rounded-lg py-1.5 text-center transition-all ${on ? "bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] text-white shadow-[0_4px_14px_rgba(168,85,247,.4)]" : "bg-[#271a4d] hover:bg-[#31215e]"}`}>
        <span className={`block text-[10px] font-extrabold ${on ? "text-white/70" : "text-[#8678ad]"}`}>{label}</span>
        <span className="block text-sm font-extrabold text-white">{s.odds.toFixed(2)}</span>
      </button>
    );
  };

  const Slip = (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] px-4 py-3 text-white">
        <span className="grid size-6 place-items-center rounded-full bg-white/25 text-xs font-extrabold">{picks.length}</span>
        <span className="font-display text-lg">Kupon</span>
        <div className="ml-auto flex rounded-md bg-black/20 p-0.5 text-xs font-bold">
          <button onClick={() => setMode("combo")} className={`rounded px-3 py-1 ${mode === "combo" ? "bg-white/90 text-[#2a1250]" : "text-white/80"}`}>Kombine</button>
          <button onClick={() => setMode("single")} className={`rounded px-3 py-1 ${mode === "single" ? "bg-white/90 text-[#2a1250]" : "text-white/80"}`}>Tekli</button>
        </div>
      </div>
      {picks.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm font-semibold text-[#8678ad]"><div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-[#271a4d] text-2xl">🎟️</div>Kuponun boş.<br />Oynamak için bir orana dokun.</div>
      ) : (
        <>
          <div className="sb-scroll max-h-[40vh] overflow-auto lg:max-h-none">
            {picks.map((p) => (
              <div key={p.selId} className="relative border-b border-[#2c1d52] px-4 py-3">
                <button onClick={() => setPicks((x) => x.filter((y) => y.selId !== p.selId))} className="absolute right-3 top-2.5 text-[#6f6392] hover:text-[#fb5a6a]">✕</button>
                <div className="text-[11px] font-bold text-[#8678ad]">{p.market}</div>
                <div className="text-sm font-extrabold text-white">{p.pick}</div>
                <div className="text-xs font-semibold text-[#a99cc9]">{p.match}</div>
                <div className="absolute bottom-3 right-4 font-extrabold text-[#d946ef]">{p.odds.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#3a2563] bg-[#271a4d] py-1.5 pl-3 pr-1">
              <input value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" className="w-full bg-transparent font-extrabold text-white outline-none" />
              <span className="pr-2 text-sm font-bold text-[#a99cc9]">₺</span>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {[50, 100, 250, 500].map((v) => <button key={v} onClick={() => setStake(String(v))} className="rounded-md bg-[#271a4d] py-1.5 text-xs font-bold text-[#a99cc9] hover:bg-[#31215e] hover:text-white">{v}</button>)}
            </div>
            {mode === "combo" && <div className="flex justify-between py-1 text-sm text-[#a99cc9]">Toplam Oran<b className="text-white">{totalOdds.toFixed(2)}</b></div>}
            <div className="flex justify-between border-t border-[#2c1d52] pt-2 text-sm text-[#a99cc9]">Olası Kazanç<b className="text-lg text-[#34e39b]">{money(potWin)}</b></div>
            <ErrBox e={err} />
            <button onClick={place} disabled={busy || !st} className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] py-3.5 font-display text-lg text-white shadow-[0_6px_20px_rgba(168,85,247,.45)] transition-transform active:scale-[.98] disabled:opacity-40">
              {me ? `Kuponu Oyna · ${money(cost)}` : "Giriş Yap & Oyna"}
            </button>
            <p className="mt-2 text-center text-[11px] text-[#6f6392]">Maç bitince kupon otomatik sonuçlanır.</p>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#120a26] pb-[var(--bottom-nav-h)] lg:pb-0">
      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] px-6 py-3 font-display text-lg text-white shadow-2xl lg:bottom-8">{toast}</div>}

      <div className="mx-auto max-w-[1320px] px-3 py-4">
        {/* HERO */}
        <section className="relative mb-5 overflow-hidden rounded-2xl bg-[linear-gradient(110deg,#2a1150_0%,#5b1b8f_45%,#b01e9e_100%)] px-6 py-7 sm:px-9 sm:py-9">
          <div className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-[radial-gradient(closest-side,rgba(217,70,239,.5),transparent)] blur-xl" />
          <div className="ribbon absolute -left-16 top-5 h-7 w-72 -rotate-[24deg] bg-[#d946ef]/80" />
          <div className="relative">
            <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/90">● Canlı & Maç Öncesi</div>
            <h1 className="font-display text-4xl text-white sm:text-6xl">Spor Bahisleri</h1>
            <p className="mt-2 max-w-md text-sm font-semibold text-white/80">Binlerce karşılaşma, yüksek oranlar. Kuponunu yap, kazancın maç biter bitmez cüzdanında.</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 font-display text-white backdrop-blur">🎁 İlk Bahis Bonusu · %100</div>
          </div>
        </section>

        {/* SPOR ÇİPLERİ */}
        <div className="sb-scroll mb-5 flex gap-2.5 overflow-x-auto pb-1">
          {SPORTS.map(([ic, name, active]) => (
            <div key={name} className={`flex min-w-[76px] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-colors ${active ? "border-[#8b5cf6] bg-[#271a4d]" : "border-[#2c1d52] bg-[#1b1136] hover:bg-[#251843]"}`} title={active ? "" : "Yakında"}>
              <span className={`grid size-10 place-items-center rounded-full text-xl ${active ? "bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] shadow-[0_4px_14px_rgba(168,85,247,.45)]" : "bg-[#271a4d] opacity-70"}`}>{ic}</span>
              <span className={`text-[11px] font-bold ${active ? "text-white" : "text-[#8678ad]"}`}>{name}</span>
            </div>
          ))}
        </div>

        {/* POPÜLER LİGLER */}
        {leagues.length > 0 && (
          <div className="mb-5">
            <h2 className="mb-2 font-display text-xl text-white">Popüler Ligler</h2>
            <div className="sb-scroll flex gap-3 overflow-x-auto pb-1">
              <button onClick={() => setLg(0)} className={`grid h-20 min-w-[150px] shrink-0 place-items-center rounded-xl border font-display text-lg ${lg === 0 ? "border-white/40 bg-[#271a4d] text-white" : "border-[#2c1d52] bg-[#1b1136] text-[#a99cc9] hover:text-white"}`}>Tüm Maçlar</button>
              {leagues.slice(0, 8).map((l, i) => (
                <button key={l.id} onClick={() => setLg(l.id)} className={`relative h-20 min-w-[180px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br ${GRADS[i % GRADS.length]} p-3 text-left ${lg === l.id ? "ring-2 ring-white/70" : ""}`}>
                  <div className="ribbon absolute inset-0 opacity-20" />
                  <div className="relative flex h-full flex-col justify-between">
                    <span className="text-[11px] font-bold text-white/80">{l.country || "Futbol"}</span>
                    <div>
                      <div className="font-display text-xl text-white">{l.name}</div>
                      <div className="text-[11px] font-bold text-white/80">{l.count} maç</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_350px]">
          {/* MAÇ LİSTESİ */}
          <main className="min-w-0">
            {!events ? <div className="py-20"><Spinner /></div> : events.length === 0 ? (
              <div className="rounded-2xl border border-[#2c1d52] bg-[#1b1136] p-12 text-center">
                <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-[#271a4d] text-2xl">⚽</div>
                <p className="font-display text-xl text-white">Şu an açık maç yok</p>
                <p className="mt-1 text-sm text-[#a99cc9]">{err || "Program kısa süre içinde beslemeden yüklenecek."}</p>
              </div>
            ) : grouped.map(([league, evs]) => (
              <section key={league} className="mb-5">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[#8b5cf6] to-[#d946ef]" />
                  <h3 className="font-display text-lg text-white">{league}</h3>
                  <span className="rounded-full bg-[#271a4d] px-2 py-0.5 text-[11px] font-bold text-[#a99cc9]">{evs.length}</span>
                </div>
                <div className="mb-1 hidden grid-cols-[1fr_180px_120px] gap-2 px-4 text-[10px] font-extrabold uppercase tracking-wide text-[#6f6392] sm:grid">
                  <span></span><span className="text-center">Maç Sonucu (1 · X · 2)</span><span className="text-center">Kars. Gol</span>
                </div>
                {evs.map((ev) => {
                  const m1 = ev.markets.find((m) => m.key === "1x2");
                  const kg = ev.markets.find((m) => m.key === "btts");
                  return (
                    <div key={ev.id} className="mb-2 rounded-xl border border-[#2c1d52] bg-[#1b1136] p-3 transition-colors hover:border-[#3a2563]">
                      <div className="grid items-center gap-2 sm:grid-cols-[1fr_180px_120px]">
                        <div className="min-w-0">
                          <div className="mb-1 inline-flex items-center gap-1.5 rounded bg-[#271a4d] px-2 py-0.5 text-[11px] font-bold text-[#c4b5fd]">🕑 {fmtTime(ev.startsAt)}</div>
                          <div className="truncate text-sm font-bold text-white">{ev.home}</div>
                          <div className="truncate text-sm font-bold text-white">{ev.away}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">{oddBtn(ev, m1, "HOME", "1")}{oddBtn(ev, m1, "DRAW", "X")}{oddBtn(ev, m1, "AWAY", "2")}</div>
                        <div className="grid grid-cols-2 gap-1.5">{oddBtn(ev, kg, "YES", "Var")}{oddBtn(ev, kg, "NO", "Yok")}</div>
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </main>

          {/* KUPON (masaüstü) */}
          <aside className="hidden lg:block"><div className="sticky top-[calc(var(--header-h)+16px)] overflow-hidden rounded-2xl border border-[#2c1d52] bg-[#1b1136]">{Slip}</div></aside>
        </div>
      </div>

      {/* KUPON (mobil) */}
      {picks.length > 0 && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-40 lg:hidden">
          {slipOpen && <div className="mx-2 mb-2 max-h-[72vh] overflow-auto rounded-2xl border border-[#2c1d52] bg-[#1b1136] shadow-2xl">{Slip}</div>}
          <button onClick={() => setSlipOpen((o) => !o)} className="flex w-full items-center justify-between bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] px-5 py-3.5 font-display text-white">
            <span>{picks.length} seçim · {mode === "combo" ? `Oran ${totalOdds.toFixed(2)}` : "Tekli"}</span>
            <span>{slipOpen ? "Kapat ▾" : "Kuponu Aç ▴"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
