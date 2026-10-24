import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import MatchDetail, { type DInfo } from "./MatchDetail";
import { api } from "./api";
import { ErrBox, I, Spinner, money, useStore } from "./lib";

/**
 * Sportsbook — lacivert + neon yeşil, yoğun lig/maç ızgarası.
 * Spor şeridi · Öne çıkanlar kaydırıcı · Canlı maçlar · Yaklaşan maçlar (lig bazlı katlanır)
 * Yapışkan kupon (Tekli / Kombine, hızlı bahis). Veri: /api/sb/* (kendi motorumuz).
 */
type Sel = { id: number; code: string; name: string; odds: number; suspended?: boolean };
type Market = { id: number; key: string; name: string; selections: Sel[] };
type Ev = {
  id: number; league: string; leagueId: number; country?: string; leagueLogo?: string; home: string; away: string; homeLogo?: string; awayLogo?: string;
  startsAt: string; status: string; minute?: number | null; score?: { h: number; a: number; hh?: number | null; ha?: number | null } | null; featured?: boolean; live?: boolean; liveOpen?: boolean; liveStopped?: boolean; markets: Market[];
};
type League = { id: number; name: string; country?: string; logo?: string; count: number };
type Pick = { selId: number; evId: number; match: string; market: string; pick: string; odds: number; live?: boolean; suspended?: boolean; changed?: "up" | "down" };

// ---------- spor ikonları (özgün, stroke tabanlı) ----------
const SPORT_SVG: Record<string, React.ReactNode> = {
  football: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5 16 10.5l-1.5 4.5h-5L8 10.5Z" /><path d="M12 3v4.5M16 10.5l4.3-1.4M14.5 15l2.6 3.7M9.5 15l-2.6 3.7M8 10.5 3.7 9.1" /></>,
  basketball: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18" /><path d="M5.6 5.6c3 2.6 3 10.2 0 12.8M18.4 5.6c-3 2.6-3 10.2 0 12.8" /></>,
  tennis: <><circle cx="12" cy="12" r="9" /><path d="M5.2 5.8c3.6 3.3 3.6 9.1 0 12.4M18.8 5.8c-3.6 3.3-3.6 9.1 0 12.4" /></>,
  volleyball: <><circle cx="12" cy="12" r="9" /><path d="M12 3c0 5 2.5 8 8.5 9.5M12 12c-4.3 2.6-6 6.2-5.4 8M12 12c4.4 2.4 8.2 2.2 9-.5M12 12 4 7" /></>,
  icehockey: <><path d="M4 4l7 12h7" /><path d="M20 4l-6 10" /><ellipse cx="7" cy="19" rx="3" ry="1.4" /></>,
  handball: <><circle cx="15" cy="6" r="3" /><path d="M5 21l3-6 4 1 2-4M8 15l-3-3 3-3 4 2" /></>,
  esports: <><rect x="2.5" y="7" width="19" height="10" rx="4" /><path d="M7 10.5v3M5.5 12h3" /><circle cx="15.5" cy="11" r=".9" fill="currentColor" /><circle cx="17.5" cy="13" r=".9" fill="currentColor" /></>,
  americanfootball: <><ellipse cx="12" cy="12" rx="9.5" ry="5.5" transform="rotate(-35 12 12)" /><path d="M9.5 14.5l5-5M10.5 11.5l2 2M12 10l2 2" /></>,
  baseball: <><circle cx="12" cy="12" r="9" /><path d="M7 4.6c2 2.2 2 12.6 0 14.8M17 4.6c-2 2.2-2 12.6 0 14.8" /></>,
  mma: <><path d="M7 11V7a2 2 0 0 1 4 0v3M11 10V6a2 2 0 0 1 4 0v4M15 10V7.5a2 2 0 0 1 4 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2h3" /></>,
};
const SPORTS: { key: string; name: string; active?: boolean }[] = [
  { key: "football", name: "Futbol", active: true }, { key: "basketball", name: "Basketbol" }, { key: "tennis", name: "Tenis" }, { key: "volleyball", name: "Voleybol" },
  { key: "icehockey", name: "Buz Hokeyi" }, { key: "handball", name: "Hentbol" }, { key: "esports", name: "E-Spor" }, { key: "americanfootball", name: "Amerikan F." },
  { key: "baseball", name: "Beyzbol" }, { key: "mma", name: "MMA" },
];
const SportIcon = ({ k, className = "size-6" }: { k: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{SPORT_SVG[k]}</svg>
);

// ---------- yardımcılar ----------
const sel = (m: Market | undefined, code: string) => m?.selections.find((s) => s.code === code);
const mk = (ev: Ev, key: string) => ev.markets.find((m) => m.key === key);
const dayLabel = (s: string) => {
  const d = new Date(s); const t = new Date(); const tm = new Date(t.getTime() + 86400_000);
  if (d.toDateString() === t.toDateString()) return "Bugün";
  if (d.toDateString() === tm.toDateString()) return "Yarın";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
};
const hm = (s: string) => new Date(s).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const startsIn = (s: string) => {
  const ms = new Date(s).getTime() - Date.now(); if (ms <= 0) return "Başladı";
  const m = Math.round(ms / 60000); if (m < 60) return `${m} dk sonra`;
  const h = Math.round(m / 60); if (h < 24) return `${h} saat sonra`;
  return `${Math.round(h / 24)} gün sonra`;
};
const ERR: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Yetersiz bakiye", ODDS_CHANGED: "Oranlar değişti — yeni oranları kontrol edip tekrar onayla", LIVE_SUSPENDED: "Canlı bahis bu maç için şu an kapalı (oranlar güncelleniyor)",
  SELECTION_SUSPENDED: "Seçim askıya alındı", LIVE_MAX_STAKE_EXCEEDED: "Canlı bahiste azami tutar aşıldı", EVENT_STARTED: "Maç başladı, oran kapandı", SELECTION_CLOSED: "Seçim kapandı", SELECTION_UNAVAILABLE: "Seçim artık mevcut değil",
  MAX_STAKE_EXCEEDED: "Azami bahis tutarı aşıldı", MIN_STAKE: "Tutar asgari bahsin altında", SPORT_BLOCKED: "Spor bahsi hesabında kapalı", SAME_EVENT_IN_COMBO: "Kombinede aynı maçtan tek seçim olabilir",
  TOO_MANY_SELECTIONS: "Çok fazla seçim", SPORTSBOOK_DISABLED: "Spor bahisleri geçici olarak kapalı", INVALID_STAKE: "Geçerli bir tutar girin", UNAUTHORIZED: "Devam etmek için giriş yapın",
};

function TeamLogo({ src, name, size = "size-4" }: { src?: string; name: string; size?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className={`${size} grid shrink-0 place-items-center rounded-full bg-elevated text-[8px] font-extrabold text-soft`}>{name.slice(0, 1)}</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className={`${size} shrink-0 object-contain`} />;
}

// ======================================================================
export default function Sport() {
  const { me, setAuthOpen, balance, refreshMe } = useStore();
  const { id: evParam } = useParams();
  const nav = useNavigate();
  const [det, setDet] = useState<Ev | null>(null);
  const [detErr, setDetErr] = useState("");
  const [info, setInfo] = useState<DInfo | null>(null);
  const goMatch = (id: number) => nav(`/spor/mac/${id}`);
  const [sp, setSp] = useSearchParams();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [live, setLive] = useState<Ev[]>([]);
  const [lg, setLg] = useState<number>(Number(sp.get("lig")) || 0);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [picks, setPicks] = useState<Pick[]>(() => { try { return JSON.parse(localStorage.getItem("sb_picks") || "[]"); } catch { return []; } });
  const [stake, setStake] = useState("100");
  const [mode, setMode] = useState<"single" | "combo">("combo");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ t: string; kind?: "ok" | "warn" } | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [quick, setQuick] = useState(false);
  const [limits, setLimits] = useState<{ minStake: number; maxStake: number; maxWin: number; maxSelections: number; liveEnabled?: boolean; liveDelaySec?: number; liveMaxStake?: number } | null>(null);
  const [acceptHigher, setAcceptHigher] = useState(() => { try { return localStorage.getItem("sb_accept") !== "none"; } catch { return true; } });
  const [waitSec, setWaitSec] = useState(0);
  const [openEv, setOpenEv] = useState<number | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [changed, setChanged] = useState<Record<number, "up" | "down">>({});
  const prevOdds = useRef<Record<number, number>>({});

  useEffect(() => { try { localStorage.setItem("sb_picks", JSON.stringify(picks)); } catch {} }, [picks]);
  useEffect(() => { if (picks.length > 1 && mode === "single" && picks.length === 0) setMode("combo"); }, [picks.length]);

  // kupondaki oranları/askı durumunu güncel listeyle eşitle
  const syncPicks = (evs: Ev[]) => setPicks((ps) => ps.map((p) => {
    for (const e of evs) for (const m of e.markets) {
      const s = m.selections.find((x) => x.id === p.selId);
      if (s) return { ...p, odds: s.odds, suspended: !!s.suspended, changed: s.odds > p.odds + 0.004 ? "up" : s.odds < p.odds - 0.004 ? "down" : p.changed };
    }
    return p;
  }));
  const load = (silent = false) => {
    if (!silent) { setErr(""); setEvents(null); }
    api(`/api/sb/events?limit=300${lg ? `&league=${lg}` : ""}`).then((evs: Ev[]) => {
      // oran değişimi göstergesi (yukarı/aşağı ok)
      const ch: Record<number, "up" | "down"> = {};
      for (const e of evs) for (const m of e.markets) for (const s of m.selections) {
        const p = prevOdds.current[s.id];
        if (p && p !== s.odds) ch[s.id] = s.odds > p ? "up" : "down";
        prevOdds.current[s.id] = s.odds;
      }
      if (Object.keys(ch).length) { setChanged(ch); setTimeout(() => setChanged({}), 6000); }
      setEvents(evs);
      // kupondaki oranları güncelle
      syncPicks(evs);
    }).catch((e) => { if (!silent) { setEvents([]); setErr(e.message); } });
  };
  useEffect(() => {
    api("/api/sb/leagues").then(setLeagues).catch(() => {});
    api("/api/sb/limits").then(setLimits).catch(() => {});
  }, []);
  // canlı: bahis açıksa 5 sn'de bir, değilse dakikada bir (sadece skor)
  useEffect(() => {
    const lv = () => api("/api/sb/live").then((l: Ev[]) => { setLive(l); syncPicks(l); }).catch(() => {});
    lv(); const t = setInterval(lv, limits?.liveEnabled ? 5_000 : 60_000); return () => clearInterval(t);
  }, [limits?.liveEnabled]);
  useEffect(() => { if (!evParam) load(); const t = setInterval(() => { if (!evParam) load(true); }, 90_000); return () => clearInterval(t); }, [lg, evParam]);
  // maç detayı: canlıda 5 sn, maç öncesi 30 sn'de bir oran; olay/istatistik canlıda 2 dk'da bir
  useEffect(() => {
    if (!evParam) { setDet(null); setInfo(null); return; }
    let alive = true; setDet(null); setDetErr(""); setInfo(null); window.scrollTo(0, 0);
    let isLive = false;
    const f = () => api(`/api/sb/event/${evParam}`).then((e: Ev) => { if (!alive) return; isLive = !!e.live; setDet(e); syncPicks([e]); }).catch((x) => { if (!alive) return; if (x.message === "NOT_FOUND") setDetErr(x.message); else setTimeout(() => alive && f(), 3000); });
    const g = () => api(`/api/sb/event/${evParam}/detail`).then((d: DInfo) => alive && setInfo(d)).catch(() => {});
    f(); g();
    const t1 = setInterval(() => { if (isLive || Date.now() % 30000 < 5000) f(); }, 5000);
    const t2 = setInterval(() => { if (isLive) g(); }, 120_000);
    return () => { alive = false; clearInterval(t1); clearInterval(t2); };
  }, [evParam]);
  useEffect(() => { const n = Number(sp.get("lig")) || 0; if (n !== lg) setLg(n); }, [sp]);

  const pickLeague = (id: number) => { setLg(id); const n = new URLSearchParams(sp); id ? n.set("lig", String(id)) : n.delete("lig"); setSp(n, { replace: true }); };

  const filtered = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr");
    return (events ?? []).filter((e) => !t || `${e.home} ${e.away} ${e.league}`.toLocaleLowerCase("tr").includes(t));
  }, [events, q]);
  const featured = useMemo(() => {
    const f = filtered.filter((e) => e.featured);
    return (f.length >= 4 ? f : [...f, ...filtered.filter((e) => !e.featured && mk(e, "1x2"))]).slice(0, 10);
  }, [filtered]);
  const grouped = useMemo(() => {
    const g = new Map<string, { lg: { id: number; name: string; country?: string; logo?: string }; evs: Ev[] }>();
    for (const e of filtered) { const k = String(e.leagueId); if (!g.has(k)) g.set(k, { lg: { id: e.leagueId, name: e.league, country: e.country, logo: e.leagueLogo }, evs: [] }); g.get(k)!.evs.push(e); }
    return [...g.values()];
  }, [filtered]);

  // ---------- kupon ----------
  const has = (id: number) => picks.some((p) => p.selId === id);
  async function placeNow(ids: number[], m: "single" | "combo", amount: number) {
    if (!me) { setAuthOpen(true); return false; }
    setBusy(true); setErr("");
    try {
      const pk = picks.filter((p) => ids.includes(p.selId));
      const anyLive = pk.some((p) => p.live) || ids.some((id) => live.some((e) => e.markets.some((mm) => mm.selections.some((x) => x.id === id))));
      let timer: any = null;
      if (anyLive && limits?.liveDelaySec) { setWaitSec(limits.liveDelaySec); timer = setInterval(() => setWaitSec((w) => Math.max(0, w - 1)), 1000); }
      const odds = Object.fromEntries(ids.map((id) => [String(id), pk.find((p) => p.selId === id)?.odds ?? findOdds(id)]).filter(([, v]) => v));
      let r: any;
      try { r = await api("/api/sb/bet", { method: "POST", json: { selectionIds: ids, stake: amount, mode: m, odds, acceptOdds: acceptHigher ? "higher" : "none" } }); }
      finally { if (timer) clearInterval(timer); setWaitSec(0); }
      refreshMe();
      const b = r?.bonus;
      if (b && b.eligible === false) setToast({ t: `Kupon alındı (${r.couponId}) — bonus kurallarına uymadığı için çevrime sayılmayacak: ${(b.why ?? []).join(", ")}`, kind: "warn" });
      else setToast({ t: r?.couponId ? `Kupon alındı · ${r.couponId}` : `${r?.bets?.length ?? 1} tekli kupon alındı`, kind: "ok" });
      setTimeout(() => setToast(null), 4500);
      setBusy(false); return true;
    } catch (e: any) {
      // oran değiştiyse kupondaki oranları yenile — oyuncu tekrar onaylar
      if (e.message === "ODDS_CHANGED" && e.detail?.odds) setPicks((ps) => ps.map((p) => { const n = e.detail.odds[p.selId]; return n ? { ...p, changed: n > p.odds ? "up" : n < p.odds ? "down" : p.changed, odds: n } : p; }));
      if (e.message === "SELECTION_SUSPENDED" && e.detail?.selectionId) setPicks((ps) => ps.map((p) => (p.selId === e.detail.selectionId ? { ...p, suspended: true } : p)));
      setErr(ERR[e.message] || e.message); setBusy(false); return false;
    }
  }
  function findOdds(id: number) { for (const e of [...(events ?? []), ...live]) for (const m of e.markets) { const x = m.selections.find((y) => y.id === id); if (x) return x.odds; } return 0; }
  function toggle(ev: Ev, m: Market, s: Sel) {
    if (s.suspended) return;
    if (quick) { // hızlı bahis: tek tıkla tekli kupon
      const amt = parseFloat(stake.replace(",", ".")) || 0;
      if (!amt) { setSlipOpen(true); setErr("Hızlı bahis için önce kuponda tutar belirleyin"); return; }
      placeNow([s.id], "single", amt); return;
    }
    setPicks((p) => {
      if (p.some((x) => x.selId === s.id)) return p.filter((x) => x.selId !== s.id);
      const noEv = p.filter((x) => x.evId !== ev.id);
      return [...noEv, { selId: s.id, evId: ev.id, match: `${ev.home} - ${ev.away}`, market: m.name, pick: s.name, odds: s.odds, live: !!ev.live }];
    });
    setErr("");
  }
  const totalOdds = picks.reduce((a, p) => a * p.odds, 1);
  const st = parseFloat(stake.replace(",", ".")) || 0;
  const effMode = picks.length < 2 ? "single" : mode;
  const potWin = effMode === "combo" ? Math.min(st * totalOdds, limits?.maxWin ?? Infinity) : picks.reduce((a, p) => a + st * p.odds, 0);
  const cost = effMode === "combo" ? st : st * picks.length;
  const activeWallet = me?.activeWallet === "BONUS" ? "BONUS" : "MAIN";
  async function place() {
    if (limits && st < limits.minStake) { setErr(`Asgari bahis ${money(limits.minStake)}`); return; }
    if (limits && st > limits.maxStake) { setErr(`Azami bahis ${money(limits.maxStake)}`); return; }
    if (me && cost > balance(activeWallet)) { setErr("Yetersiz bakiye"); return; }
    if (picks.some((p) => p.suspended)) { setErr("Askıdaki seçimleri kupondan çıkar"); return; }
    if (picks.some((p) => p.live) && limits?.liveMaxStake && st > limits.liveMaxStake) { setErr(`Canlı bahiste azami ${money(limits.liveMaxStake)}`); return; }
    const ok = await placeNow(picks.map((p) => p.selId), effMode, st);
    if (ok) { setPicks([]); setSlipOpen(false); }
  }

  // ---------- oran butonu ----------
  const odd = ({ ev, m, code, label, key }: { ev: Ev; m?: Market; code: string; label?: string; key?: any }) => {
    const s = sel(m, code);
    if (!s || !m || s.suspended) return <div key={key ?? code} title={s?.suspended ? "Askıda" : ""} className="flex h-10 items-center justify-between rounded-md bg-card/60 px-2.5 text-dim">{label && s ? <span className="text-[12px] font-semibold">{label}</span> : <span />}<I n="lock" className="size-3.5" /></div>;
    const on = has(s.id); const c = changed[s.id];
    return (
      <button key={key ?? s.id} onClick={() => toggle(ev, m, s)} title={`${m.name}: ${s.name}`}
        className={`relative flex h-10 items-center justify-between gap-1 rounded-md px-2.5 text-[13px] font-bold transition-all ${on ? "bg-primary text-primary-fg glow-green" : "bg-card text-fg hover:bg-surface-hover"}`}>
        {label && <span className={`${on ? "text-primary-fg/70" : "text-subtle"} text-[12px] font-semibold`}>{label}</span>}
        <span className={`ml-auto tabular-nums ${!on && c === "up" ? "text-win" : !on && c === "down" ? "text-loss" : ""}`}>{s.odds.toFixed(2)}</span>
        {c && !on && <span className={`absolute right-0.5 top-0.5 size-0 border-x-[4px] border-x-transparent ${c === "up" ? "border-b-[5px] border-b-win" : "border-t-[5px] border-t-loss"}`} />}
      </button>
    );
  };

  // ---------- kupon paneli ----------
  const SlipBody = (
    <div className="flex max-h-[min(78vh,720px)] flex-col">
      {picks.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-card text-primary"><I n="ticket" className="size-6" /></div>
          <div className="text-sm font-bold">Kuponun boş</div>
          <div className="mt-1 text-[13px] text-subtle">Kupona eklemek için bir orana dokun.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 px-3 pt-3">
            {(["single", "combo"] as const).map((x) => (
              <button key={x} disabled={x === "combo" && picks.length < 2} onClick={() => setMode(x)}
                className={`h-10 rounded-lg border text-sm font-bold transition-colors disabled:opacity-40 ${effMode === x ? "border-primary text-primary" : "border-transparent bg-card text-subtle hover:text-fg"}`}>{x === "single" ? "Tekli" : "Kombine"}</button>
            ))}
          </div>
          <div className="sb-scroll mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3">
            {picks.map((p) => (
              <div key={p.selId} className="animate-slip-item flex overflow-hidden rounded-lg bg-card">
                <button onClick={() => setPicks((x) => x.filter((y) => y.selId !== p.selId))} className="grid w-9 shrink-0 place-items-center bg-card-2 text-subtle hover:text-loss" aria-label="Kaldır"><I n="x" className="size-4" /></button>
                <div className="min-w-0 flex-1 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <SportIcon k="football" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-primary">{p.pick}</span>
                    <span className={`flex items-center gap-1 text-sm font-extrabold tabular-nums ${p.changed === "up" ? "text-win" : p.changed === "down" ? "text-loss" : ""}`}>{p.changed === "up" ? "▲" : p.changed === "down" ? "▼" : ""}{p.odds.toFixed(2)}</span>
                  </div>
                  <div className="truncate pl-6 text-[13px] text-subtle">{p.match}</div>
                  <div className="flex items-center gap-2 truncate pl-6 text-[13px] font-semibold text-muted">{p.market}
                    {p.live && <span className="rounded bg-live px-1 text-[10px] font-extrabold text-white">CANLI</span>}
                    {p.suspended && <span className="flex items-center gap-1 rounded bg-caution/15 px-1 text-[10px] font-extrabold text-caution"><I n="lock" className="size-3" />ASKIDA</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line px-3 pt-3 pb-3">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-subtle">
              <input type="checkbox" className="accent-[#1fe88a]" checked={acceptHigher} onChange={(e) => { setAcceptHigher(e.target.checked); try { localStorage.setItem("sb_accept", e.target.checked ? "higher" : "none"); } catch {} }} />
              Yükselen oranları otomatik kabul et
            </label>
            {effMode === "combo" && <div className="mb-2 flex items-center justify-between text-[13px] text-subtle">Toplam oran <b className="text-base text-fg tabular-nums">{totalOdds.toFixed(2)}</b></div>}
            <div className="flex gap-2">
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-field px-2 focus-within:border-primary">
                <span className="grid size-6 shrink-0 place-items-center rounded bg-primary text-[13px] font-extrabold text-primary-fg">₺</span>
                <input value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" className="w-full bg-transparent text-[15px] font-bold outline-none" placeholder="Tutar" />
              </label>
              {[50, 200, 500].map((v) => <button key={v} onClick={() => setStake(String(v))} className="h-11 w-14 rounded-lg bg-card text-sm font-bold text-muted hover:bg-surface-hover hover:text-fg">{v}</button>)}
            </div>
            {effMode === "single" && picks.length > 1 && <div className="mt-1.5 text-[12px] text-subtle">Her seçime {money(st)} · toplam {money(cost)}</div>}
            {me && <div className="mt-2 flex items-center justify-between text-[12px] text-subtle">
              <span>{activeWallet === "BONUS" ? <b className="text-caution">Bonus cüzdanı</b> : "Ana Para"} · {money(balance(activeWallet))}</span>
              {limits && <span>Min {money(limits.minStake)} · Maks {money(limits.maxStake)}</span>}
            </div>}
            <div className="mt-2"><ErrBox e={err} /></div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setPicks([])} className="grid h-[52px] w-11 shrink-0 place-items-center rounded-lg bg-card text-subtle hover:text-loss" aria-label="Kuponu temizle"><I n="trash" className="size-5" /></button>
              <button onClick={place} disabled={busy || !st} className="flex h-[52px] flex-1 flex-col items-center justify-center rounded-lg bg-primary text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50">
                <span className="text-[15px] font-extrabold leading-tight">{busy ? (waitSec > 0 ? `Canlı bahis onaylanıyor… ${waitSec}` : "Gönderiliyor…") : me ? `Bahis Yap · ${money(cost)}` : "Giriş Yap ve Oyna"}</span>
                <span className="text-[12px] font-bold opacity-75">Olası kazanç {money(potWin)}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const SlipBar = (
    <div className="slip-grad flex h-12 items-center gap-2 px-3 text-primary-fg">
      <button onClick={() => setSlipOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left">
        <span className="relative"><I n="ticket" className="size-6" />{picks.length > 0 && <span className="absolute -right-2 -top-2 grid size-[18px] place-items-center rounded-full bg-page text-[10px] font-extrabold text-fg">{picks.length}</span>}</span>
        <span className="ml-1 text-[15px] font-extrabold">Kupon</span>
        <I n={slipOpen ? "down" : "up"} className="size-4" />
        {picks.length > 1 && effMode === "combo" && <span className="ml-1 rounded bg-black/15 px-1.5 text-[12px] font-extrabold tabular-nums">{totalOdds.toFixed(2)}</span>}
      </button>
      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-extrabold" title="Açıkken orana tek dokunuş, kupondaki tutarla tekli bahis yapar">
        Hızlı Bahis
        <span onClick={(e) => { e.preventDefault(); setQuick(!quick); }} className={`relative h-5 w-9 rounded-full border-2 border-primary-fg transition-colors ${quick ? "bg-primary-fg" : ""}`}>
          <span className={`absolute top-0.5 size-3 rounded-full transition-all ${quick ? "left-[18px] bg-primary" : "left-0.5 bg-primary-fg"}`} />
        </span>
      </label>
    </div>
  );

  // ---------- satır: maç ----------
  const row = ({ ev, isLive, key }: { ev: Ev; isLive?: boolean; key?: any }) => {
    const m1 = mk(ev, "1x2"), ou = mk(ev, "ou25"), kg = mk(ev, "btts");
    const more = Math.max(0, ev.markets.reduce((a, m) => a + m.selections.length, 0) - 7);
    const open = openEv === ev.id;
    return (
      <div key={key ?? ev.id} className="border-t border-line/70 first:border-t-0">
        <div className="grid grid-cols-1 items-center gap-2 px-3 py-2.5 md:grid-cols-[minmax(180px,1fr)_84px_minmax(210px,1.2fr)_minmax(140px,.8fr)_minmax(140px,.8fr)_44px]">
          <div className="flex min-w-0 items-center gap-2">
            <div onClick={() => goMatch(ev.id)} role="link" title="Maç detayı ve tüm oranlar" className="min-w-0 flex-1 cursor-pointer space-y-1 hover:[&_span.team]:text-primary">
              {[[ev.home, ev.homeLogo, ev.score?.h], [ev.away, ev.awayLogo, ev.score?.a]].map(([n, l, g], i) => (
                <div key={i} className="flex items-center gap-2">
                  <TeamLogo src={l as string} name={n as string} />
                  <span className="team truncate text-[13px] font-semibold transition-colors">{n as string}</span>
                  {isLive && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded bg-card px-1 text-[12px] font-extrabold text-primary tabular-nums">{(g as number) ?? 0}</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-subtle md:hidden">
              {isLive ? <span className="rounded bg-live px-1.5 text-[10px] font-extrabold text-white">CANLI {ev.minute ? `${ev.minute}'` : ""}</span> : <span className="text-right text-[11px] font-semibold leading-tight">{dayLabel(ev.startsAt)}<br />{hm(ev.startsAt)}</span>}
            </div>
          </div>
          <div className="hidden flex-col items-center text-[11px] font-semibold text-subtle md:flex">
            {isLive ? <><span className="rounded bg-live px-1.5 py-px text-[10px] font-extrabold text-white">CANLI</span><span className="mt-1 tabular-nums">{ev.minute ? `${ev.minute}'` : ev.status}</span></>
              : <><span className="flex items-center gap-1"><I n="calendar" className="size-3" />{dayLabel(ev.startsAt)}</span><span className="mt-1 flex items-center gap-1"><I n="clock" className="size-3" />{hm(ev.startsAt)}</span></>}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {odd({ ev: ev, m: m1, code: "HOME", label: "1" })}{odd({ ev: ev, m: m1, code: "DRAW", label: "X" })}{odd({ ev: ev, m: m1, code: "AWAY", label: "2" })}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {odd({ ev: ev, m: ou, code: "OVER", label: "Ü 2.5" })}{odd({ ev: ev, m: ou, code: "UNDER", label: "A 2.5" })}
          </div>
          <div className="hidden grid-cols-2 gap-1.5 md:grid">
            {odd({ ev: ev, m: kg, code: "YES", label: "Var" })}{odd({ ev: ev, m: kg, code: "NO", label: "Yok" })}
          </div>
          <button onClick={() => goMatch(ev.id)} disabled={false} title="Tüm oranlar"
            className={`h-10 rounded-md text-[12px] font-extrabold transition-colors disabled:opacity-40 ${open ? "bg-primary text-primary-fg" : "bg-card text-muted hover:bg-surface-hover hover:text-fg"}`}>
            {more > 0 ? `+${more}` : <I n="right" className="mx-auto size-4" />}
          </button>
        </div>
        {open && eventMarkets({ ev: ev })}
      </div>
    );
  };

  const eventMarkets = ({ ev }: { ev: Ev }) => (
    <div className="animate-sports-fade grid gap-2 bg-panel-deep/60 px-3 pt-1 pb-3 sm:grid-cols-2 xl:grid-cols-3">
      {ev.markets.map((m) => (
        <div key={m.id} className="rounded-lg bg-panel p-2.5">
          <div className="mb-2 text-[12px] font-bold text-soft">{m.name}</div>
          <div className={`grid gap-1.5 ${m.selections.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {m.selections.map((s) => odd({ key: s.id, ev: ev, m: m, code: s.code, label: s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name }))}
          </div>
        </div>
      ))}
    </div>
  );

  const colHead = () => (
    <div className="hidden grid-cols-[minmax(180px,1fr)_84px_minmax(210px,1.2fr)_minmax(140px,.8fr)_minmax(140px,.8fr)_44px] gap-2 px-3 pb-1.5 text-center text-[10px] font-extrabold tracking-wider text-dim uppercase md:grid">
      <span /><span /><span>Maç Sonucu</span><span>Alt / Üst</span><span>Karşılıklı Gol</span><span />
    </div>
  );

  const leagueBlock = ({ id, name, country, logo, evs, isLive, key }: { key?: any; id: string; name: string; country?: string; logo?: string; evs: Ev[]; isLive?: boolean }) => {
    const c = closed[id];
    return (
      <div key={key ?? id} className="mb-2 overflow-hidden rounded-xl bg-panel">
        <button onClick={() => setClosed((x) => ({ ...x, [id]: !c }))} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-card/40">
          {logo ? <img src={logo} alt="" className="size-4 object-contain" /> : <SportIcon k="football" className="size-4 text-subtle" />}
          <span className="truncate text-[13px] font-bold">{country ? `${country} / ` : ""}{name}</span>
          <span className="rounded bg-card px-1.5 text-[11px] font-bold text-soft">{evs.length}</span>
          <span className={`ml-auto grid size-6 place-items-center rounded-full ${c ? "bg-card text-subtle" : "bg-primary/15 text-primary"}`}><I n={c ? "plus" : "minus"} className="size-3.5" /></span>
        </button>
        {!c && <>{colHead()}{evs.map((ev) => row({ key: ev.id, ev: ev, isLive: isLive }))}</>}
      </div>
    );
  };

  const liveGroups = useMemo(() => {
    const g = new Map<number, Ev[]>(); for (const e of live) { if (!g.has(e.leagueId)) g.set(e.leagueId, []); g.get(e.leagueId)!.push(e); } return [...g.entries()];
  }, [live]);
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (d: number) => scroller.current?.scrollBy({ left: d, behavior: "smooth" });

  return (
    <div className="pb-[calc(var(--bottom-nav-h)+64px)] lg:pb-20">
      {toast && <div className={`fixed left-1/2 top-[calc(var(--header-h)+12px)] z-[70] max-w-[92vw] -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-bold shadow-2xl ${toast.kind === "warn" ? "bg-caution text-[#2a1d00]" : "bg-primary text-primary-fg"}`}>{toast.t}</div>}

      {evParam ? (
        det ? <MatchDetail ev={det as any} info={info} onBack={() => (window.history.length > 1 ? nav(-1) : nav("/spor"))} isPicked={has} onPick={(e, m, x) => toggle(e as any, m as any, x as any)} changed={changed} />
          : detErr ? <div className="rounded-xl bg-panel p-12 text-center"><p className="font-bold">Maç bulunamadı</p><button onClick={() => nav("/spor")} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-fg">Spor sayfasına dön</button></div>
          : <Spinner />
      ) : (<>
      {/* SPOR ŞERİDİ */}
      <div className="relative mb-3 rounded-xl bg-panel">
        <div className="sb-scroll flex gap-1 overflow-x-auto px-2 py-2">
          {SPORTS.map((s) => {
            const n = s.active ? (events?.length ?? 0) : 0;
            const on = s.active;
            return (
              <button key={s.key} disabled={!s.active} title={s.active ? s.name : `${s.name} — yakında`}
                className={`relative flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 pt-2 pb-1.5 transition-colors ${on ? "bg-card text-primary" : "text-subtle opacity-60"}`}>
                {n > 0 && <span className="absolute right-1.5 top-1 rounded bg-primary/15 px-1 text-[10px] font-extrabold text-primary">{n}</span>}
                <SportIcon k={s.key} className="size-7" />
                <span className={`max-w-full truncate text-[11px] font-semibold ${on ? "text-fg" : ""}`}>{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ARAMA + LİG FİLTRESİ */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-primary/70">
          <I n="search" className="size-4 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Takım veya lig ara" className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-subtle" />
          {q && <button onClick={() => setQ("")} className="text-subtle hover:text-fg"><I n="x" className="size-4" /></button>}
        </label>
        <select value={lg} onChange={(e) => pickLeague(Number(e.target.value))} className="h-11 rounded-lg border border-line bg-panel px-3 text-sm font-semibold outline-none focus:border-primary/70 sm:w-64">
          <option value={0}>Tüm ligler ({leagues.reduce((a, l) => a + l.count, 0)})</option>
          {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}{l.country ? ` · ${l.country}` : ""} ({l.count})</option>)}
        </select>
      </div>

      {/* ÖNE ÇIKANLAR */}
      {featured.length > 0 && !q && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-primary"><I n="flame" className="size-4" /></span>
            <h2 className="text-lg font-extrabold">Öne Çıkanlar</h2>
            <div className="ml-auto hidden gap-1.5 sm:flex">
              <button onClick={() => scrollBy(-620)} className="grid size-8 place-items-center rounded-lg bg-panel text-muted hover:text-fg"><I n="left" className="size-4" /></button>
              <button onClick={() => scrollBy(620)} className="grid size-8 place-items-center rounded-lg bg-panel text-muted hover:text-fg"><I n="right" className="size-4" /></button>
            </div>
          </div>
          <div ref={scroller} className="no-scrollbar flex snap-x gap-3 overflow-x-auto">
            {featured.map((ev) => {
              const m1 = mk(ev, "1x2");
              return (
                <div key={ev.id} className="w-[290px] shrink-0 snap-start rounded-xl bg-panel p-3">
                  <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-soft">
                    <SportIcon k="football" className="size-4" /><span className="min-w-0 flex-1 truncate">{ev.league}</span>
                    <span className="flex shrink-0 items-center gap-1 text-subtle"><I n="clock" className="size-3.5" />{startsIn(ev.startsAt)}</span>
                  </div>
                  <div onClick={() => goMatch(ev.id)} role="link" className="mb-2.5 cursor-pointer rounded-lg bg-card px-3 py-2.5 transition-colors hover:bg-surface-hover">
                    {[[ev.home, ev.homeLogo, dayLabel(ev.startsAt), "calendar"], [ev.away, ev.awayLogo, hm(ev.startsAt), "clock"]].map(([n, l, t, ic]) => (
                      <div key={n} className="flex items-center gap-2 py-0.5">
                        <TeamLogo src={l} name={n} size="size-5" />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{n}</span>
                        <span className="flex items-center gap-1 text-[12px] font-semibold text-subtle">{t}<I n={ic} className="size-3.5" /></span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {odd({ ev: ev, m: m1, code: "HOME", label: "1" })}{odd({ ev: ev, m: m1, code: "DRAW", label: "X" })}{odd({ ev: ev, m: m1, code: "AWAY", label: "2" })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* CANLI MAÇLAR */}
      {liveGroups.length > 0 && !q && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-live text-white"><I n="play" className="size-3.5" /></span>
            <h2 className="text-lg font-extrabold">Canlı Maçlar</h2>
            <span className="rounded bg-live/15 px-1.5 text-[12px] font-extrabold text-live">{live.length}</span>
            <span className="ml-2 hidden text-[12px] font-semibold text-subtle sm:inline">{limits?.liveEnabled ? "Oranlar canlı güncelleniyor · kilitli oranlar askıda" : "Canlı skor · canlı bahis şu an kapalı"}</span>
          </div>
          <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-bold text-soft"><SportIcon k="football" className="size-4" />Futbol</div>
          {liveGroups.map(([id, evs]) => leagueBlock({ key: `l${id}`, id: `l${id}`, name: evs[0].league, country: evs[0].country, logo: evs[0].leagueLogo, evs: evs, isLive: true }))}
        </section>
      )}

      {/* YAKLAŞAN */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-primary"><I n="calendar" className="size-4" /></span>
          <h2 className="text-lg font-extrabold">{q ? `“${q}” için sonuçlar` : "Yaklaşan Maçlar"}</h2>
          {events && <span className="rounded bg-card px-1.5 text-[12px] font-bold text-soft">{filtered.length}</span>}
          {lg > 0 && <button onClick={() => pickLeague(0)} className="ml-auto flex items-center gap-1 rounded-lg bg-card px-2.5 py-1 text-[12px] font-bold text-muted hover:text-fg">Filtreyi kaldır <I n="x" className="size-3.5" /></button>}
        </div>
        {!events ? <Spinner /> : filtered.length === 0 ? (
          <div className="rounded-xl bg-panel p-12 text-center">
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-card text-primary"><SportIcon k="football" className="size-7" /></div>
            <p className="font-bold">{q ? "Eşleşen maç bulunamadı" : "Şu an bahse açık maç yok"}</p>
            <p className="mt-1 text-sm text-subtle">{err || (q ? "Farklı bir takım veya lig adı deneyin." : "Program kısa süre içinde yüklenecek.")}</p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-bold text-soft"><SportIcon k="football" className="size-4" />Futbol</div>
            {grouped.map((g) => leagueBlock({ key: g.lg.id, id: String(g.lg.id), name: g.lg.name, country: g.lg.country, logo: g.lg.logo, evs: g.evs }))}
          </>
        )}
      </section>

      </>)}

      {/* YAPIŞKAN KUPON — masaüstü sağ alt, mobil alt menünün üstünde */}
      <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-40 lg:inset-x-auto lg:right-5 lg:bottom-5 lg:w-[370px]">
        <div className="overflow-hidden border-t border-line bg-panel shadow-[0_-12px_40px_rgba(0,0,0,.5)] lg:rounded-xl lg:border">
          {SlipBar}
          {slipOpen && SlipBody}
        </div>
      </div>
    </div>
  );
}
