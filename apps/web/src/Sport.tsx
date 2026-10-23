import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Btn, ErrBox, I, Spinner, money, useStore } from "./lib";

type Sel = { id: number; code: string; name: string; odds: number };
type Market = { key: string; name: string; selections: Sel[] };
type Ev = { id: number; league: string; leagueId: number; country?: string; leagueLogo?: string; home: string; away: string; homeLogo?: string; awayLogo?: string; startsAt: string; status: string; markets: Market[] };
type League = { id: number; name: string; country?: string; logo?: string; count: number };
type Pick = { selId: number; evId: number; match: string; market: string; pick: string; odds: number };

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

  const load = () => { setErr(""); api(`/api/sb/events${lg ? `?league=${lg}` : ""}`).then(setEvents).catch((e) => { setEvents([]); setErr(e.message); }); };
  useEffect(() => { api("/api/sb/leagues").then(setLeagues).catch(() => {}); }, []);
  useEffect(() => { load(); }, [lg]);

  const grouped = useMemo(() => {
    const g: Record<string, Ev[]> = {};
    (events ?? []).forEach((e) => { (g[e.league] ??= []).push(e); });
    return Object.entries(g);
  }, [events]);

  function toggle(ev: Ev, m: Market, s: Sel) {
    setPicks((p) => {
      const ex = p.findIndex((x) => x.selId === s.id);
      if (ex > -1) return p.filter((_, i) => i !== ex);
      const noEv = p.filter((x) => x.evId !== ev.id); // aynı maçtan tek seçim
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
      setToast("Kupon oynandı! 🎉"); setPicks([]); setSlipOpen(false); refreshMe();
      setTimeout(() => setToast(""), 2500);
    } catch (e: any) {
      const map: Record<string, string> = { INSUFFICIENT_BALANCE: "Yetersiz bakiye", EVENT_STARTED: "Maç başladı, oran kapandı", SELECTION_CLOSED: "Seçim kapandı", MAX_STAKE_EXCEEDED: "Azami bahis aşıldı", SPORT_BLOCKED: "Spor bahsi hesabında kapalı", SAME_EVENT_IN_COMBO: "Aynı maçtan kombinede tek seçim" };
      setErr(map[e.message] || e.message);
    }
    setBusy(false);
  }

  const oddsBtn = (ev: Ev, m: Market | undefined, code: string, label: string) => {
    const s = sel(m, code);
    if (!s || !m) return <div className="rounded-lg bg-field/40 py-2.5 text-center text-xs font-bold text-dim">-</div>;
    const on = has(s.id);
    return (
      <button onClick={() => toggle(ev, m, s)} className={`group rounded-lg py-2 text-center transition-colors ${on ? "bg-primary text-primary-fg" : "bg-field hover:bg-elevated"}`}>
        <span className={`block text-[10px] font-extrabold ${on ? "text-primary-fg/70" : "text-dim"}`}>{label}</span>
        <span className="block text-sm font-extrabold">{s.odds.toFixed(2)}</span>
      </button>
    );
  };

  const Slip = (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-fg">{picks.length}</span>
        <span className="font-extrabold">Kupon</span>
        <div className="ml-auto flex rounded-md bg-field p-0.5 text-xs font-bold">
          <button onClick={() => setMode("combo")} className={`rounded px-3 py-1 ${mode === "combo" ? "bg-elevated text-fg" : "text-subtle"}`}>Kombine</button>
          <button onClick={() => setMode("single")} className={`rounded px-3 py-1 ${mode === "single" ? "bg-elevated text-fg" : "text-subtle"}`}>Tekli</button>
        </div>
      </div>
      {picks.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm font-semibold text-dim"><I n="ball" className="mx-auto mb-2 size-8 opacity-40" />Kupon boş.<br />Oynamak için bir orana dokun.</div>
      ) : (
        <>
          <div className="max-h-[38vh] overflow-auto lg:max-h-none">
            {picks.map((p) => (
              <div key={p.selId} className="relative border-b border-line px-4 py-3">
                <button onClick={() => setPicks((x) => x.filter((y) => y.selId !== p.selId))} className="absolute right-3 top-2.5 text-dim hover:text-loss">✕</button>
                <div className="text-[11px] font-bold text-dim">{p.market}</div>
                <div className="text-sm font-extrabold">{p.pick}</div>
                <div className="text-xs font-semibold text-muted">{p.match}</div>
                <div className="absolute bottom-3 right-4 font-extrabold text-primary">{p.odds.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-field py-1 pl-3 pr-1">
              <input value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" className="w-full bg-transparent font-extrabold outline-none" />
              <span className="pr-2 text-sm font-bold text-muted">₺</span>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {[50, 100, 250, 500].map((v) => <button key={v} onClick={() => setStake(String(v))} className="rounded-md bg-field py-1.5 text-xs font-bold text-subtle hover:bg-elevated hover:text-fg">{v}</button>)}
            </div>
            {mode === "combo" && <div className="flex justify-between py-1 text-sm text-muted">Toplam Oran<b className="text-fg">{totalOdds.toFixed(2)}</b></div>}
            <div className="flex justify-between border-t border-line pt-2 text-sm text-muted">Olası Kazanç<b className="text-win text-lg">{money(potWin)}</b></div>
            <ErrBox e={err} />
            <Btn className="mt-3 w-full" disabled={busy || !st || picks.length === 0} onClick={place}>{me ? `Kuponu Oyna · ${money(cost)}` : "Giriş yap & oyna"}</Btn>
            <p className="mt-2 text-center text-[11px] text-dim">Oranlar API-Football beslemesinden; maç bitince kupon otomatik sonuçlanır.</p>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="pb-[var(--bottom-nav-h)] lg:pb-0">
      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-win px-5 py-3 font-extrabold text-[#06331a] shadow-xl lg:bottom-8">{toast}</div>}
      <div className="mx-auto max-w-[1280px] px-3 py-4">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-extrabold"><I n="ball" className="mr-2 inline size-6 text-primary" />Spor</h1>
          {me && <span className="ml-auto text-sm font-semibold text-muted">Bakiye: <b className="text-fg">{money(balance("MAIN"))}</b></span>}
        </div>

        {/* lig filtresi */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setLg(0)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${lg === 0 ? "bg-primary text-primary-fg" : "bg-field text-subtle hover:text-fg"}`}>Tümü</button>
          {leagues.map((l) => (
            <button key={l.id} onClick={() => setLg(l.id)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${lg === l.id ? "bg-primary text-primary-fg" : "bg-field text-subtle hover:text-fg"}`}>{l.name} <span className="opacity-60">{l.count}</span></button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <main className="min-w-0">
            {!events ? <Spinner /> : events.length === 0 ? (
              <div className="rounded-xl border border-line bg-panel p-10 text-center">
                <I n="ball" className="mx-auto mb-3 size-10 text-dim" />
                <p className="font-bold">Şu an açık maç yok.</p>
                <p className="mt-1 text-sm text-muted">{err ? err : "Program kısa süre içinde beslemeden yüklenecek."}</p>
              </div>
            ) : grouped.map(([league, evs]) => (
              <section key={league} className="mb-5">
                <div className="mb-2 flex items-center gap-2 px-1 text-sm font-extrabold text-muted"><span className="size-1.5 rounded-full bg-primary" />{league}</div>
                <div className="hidden grid-cols-[1fr_168px_112px] gap-2 px-4 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-dim sm:grid">
                  <span></span><span className="text-center">Maç Sonucu (1·X·2)</span><span className="text-center">KG</span>
                </div>
                {evs.map((ev) => {
                  const m1 = ev.markets.find((m) => m.key === "1x2");
                  const kg = ev.markets.find((m) => m.key === "btts");
                  return (
                    <div key={ev.id} className="mb-2 rounded-xl border border-line bg-panel p-3">
                      <div className="grid items-center gap-2 sm:grid-cols-[1fr_168px_112px]">
                        <div className="min-w-0">
                          <div className="mb-1 text-[11px] font-bold text-primary">🕑 {fmtTime(ev.startsAt)}</div>
                          <div className="truncate text-sm font-bold">{ev.home}</div>
                          <div className="truncate text-sm font-bold">{ev.away}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {oddsBtn(ev, m1, "HOME", "1")}{oddsBtn(ev, m1, "DRAW", "X")}{oddsBtn(ev, m1, "AWAY", "2")}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {oddsBtn(ev, kg, "YES", "Var")}{oddsBtn(ev, kg, "NO", "Yok")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </main>

          {/* bet slip — masaüstü sağ, mobil alttan */}
          <aside className="hidden lg:block"><div className="sticky top-[calc(var(--header-h)+16px)] overflow-hidden rounded-xl border border-line bg-panel">{Slip}</div></aside>
        </div>
      </div>

      {/* mobil kupon çubuğu */}
      {picks.length > 0 && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-40 lg:hidden">
          {slipOpen && <div className="mx-2 mb-2 max-h-[70vh] overflow-auto rounded-xl border border-line bg-panel shadow-2xl">{Slip}</div>}
          <button onClick={() => setSlipOpen((o) => !o)} className="flex w-full items-center justify-between bg-primary px-5 py-3 font-extrabold text-primary-fg">
            <span>{picks.length} seçim · {mode === "combo" ? totalOdds.toFixed(2) : "Tekli"}</span>
            <span>{slipOpen ? "Kapat ▾" : "Kuponu Aç ▴"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
