import { useEffect, useMemo, useState } from "react";
import { I } from "./lib";

/**
 * Maç detay sayfası: skor kartı · saha/izleyici (geri sayım, canlı skor) · zaman çizelgesi ·
 * istatistik / kadro / olaylar · gruplu tüm marketler (Toplam Gol'de çizgi seçici).
 */
export type DSel = { id: number; code: string; name: string; odds: number; suspended?: boolean };
export type DMarket = { id: number; key: string; name: string; selections: DSel[] };
export type DEv = {
  id: number; league: string; leagueId: number; country?: string; leagueLogo?: string; home: string; away: string; homeLogo?: string; awayLogo?: string;
  startsAt: string; status: string; minute?: number | null; score?: { h: number; a: number; hh?: number | null; ha?: number | null } | null;
  live?: boolean; liveOpen?: boolean; liveStopped?: boolean; markets: DMarket[];
};
export type DInfo = {
  venue?: string | null; referee?: string | null; round?: string | null; unavailable?: boolean;
  events: { min: number; extra: number | null; side: "home" | "away"; type: string; detail: string; player: string | null; assist: string | null }[];
  stats: { type: string; home: any; away: any }[];
  lineups: { side: "home" | "away"; formation: string | null; coach: string | null; xi: { name: string; number: number | null; pos: string | null }[]; subs: { name: string; number: number | null }[] }[];
};
type Props = {
  ev: DEv; info: DInfo | null; onBack: () => void;
  isPicked: (id: number) => boolean; onPick: (ev: DEv, m: DMarket, s: DSel) => void; changed: Record<number, "up" | "down">;
};

const STATUS_TR: Record<string, string> = { "1H": "1. Yarı", HT: "Devre Arası", "2H": "2. Yarı", ET: "Uzatma", BT: "Uzatma Arası", P: "Penaltılar", FT: "Maç Sonu", AET: "Uzatmalar Sonu", PEN: "Penaltılar Sonu", SUSP: "Durduruldu", INT: "Ara Verildi", LIVE: "Canlı", NS: "Başlamadı" };
const STAT_TR: Record<string, string> = {
  "Ball Possession": "Topla Oynama", "Total Shots": "Toplam Şut", "Shots on Goal": "İsabetli Şut", "Shots off Goal": "İsabetsiz Şut", "Blocked Shots": "Engellenen Şut",
  "Corner Kicks": "Korner", Fouls: "Faul", Offsides: "Ofsayt", "Yellow Cards": "Sarı Kart", "Red Cards": "Kırmızı Kart", "Goalkeeper Saves": "Kurtarış",
  "Total passes": "Toplam Pas", "Passes accurate": "İsabetli Pas", "Passes %": "Pas İsabeti", "Shots insidebox": "Ceza Sahası İçi Şut", "Shots outsidebox": "Ceza Sahası Dışı Şut", expected_goals: "Gol Beklentisi (xG)",
};
const GROUPS: { key: string; label: string; markets: string[] }[] = [
  { key: "main", label: "Ana", markets: ["1x2", "dc", "ou", "btts", "dnb"] },
  { key: "goals", label: "Goller", markets: ["ou", "btts", "oe"] },
  { key: "half", label: "İlk Yarı", markets: ["ht1x2", "htft"] },
  { key: "all", label: "Tümü", markets: ["1x2", "dc", "ou", "btts", "dnb", "oe", "ht1x2", "htft"] },
];
const OU_KEYS = ["ou15", "ou25", "ou35"];

function Logo({ src, name, size = "size-6" }: { src?: string; name: string; size?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className={`${size} grid shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-extrabold text-soft`}>{name.slice(0, 1)}</span>;
  return <img src={src} alt="" onError={() => setBad(true)} className={`${size} shrink-0 object-contain`} />;
}

function useCountdown(to: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  return { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60, done: ms === 0 };
}

// ---------- saha ----------
function Pitch({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-b-xl bg-[#2f7d32] sm:aspect-[21/9]">
      <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 8%, transparent 8% 16%)" }} />
      <svg viewBox="0 0 210 90" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth=".6">
        <rect x="3" y="3" width="204" height="84" /><line x1="105" y1="3" x2="105" y2="87" /><circle cx="105" cy="45" r="11" /><circle cx="105" cy="45" r=".8" fill="rgba(255,255,255,.7)" />
        <rect x="3" y="22" width="26" height="46" /><rect x="3" y="34" width="9" height="22" /><rect x="181" y="22" width="26" height="46" /><rect x="198" y="34" width="9" height="22" />
        <path d="M29 37a10 10 0 0 1 0 16M181 37a10 10 0 0 0 0 16" />
      </svg>
      <div className="absolute inset-0 grid place-items-center p-3">{children}</div>
    </div>
  );
}

function Tracker({ ev, info }: { ev: DEv; info: DInfo | null }) {
  const cd = useCountdown(ev.startsAt);
  const final = ["FT", "AET", "PEN"].includes(ev.status);
  const notStarted = !ev.live && !final && (ev.status === "NS" || ev.status === "TBD");
  const lastEv = info?.events?.length ? info.events[info.events.length - 1] : null;
  const box = "grid min-w-11 place-items-center rounded-md bg-white px-2 py-1 text-lg font-extrabold text-[#0f1923] tabular-nums";
  return (
    <Pitch>
      <div className="w-full max-w-[340px] rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-center text-white backdrop-blur-sm">
        {notStarted ? (
          <>
            <div className="text-[12px] font-bold text-white/80">Başlama saati</div>
            <div className="mt-2 flex justify-center gap-2">
              {[[cd.d, "Gün"], [cd.h, "Saat"], [cd.m, "Dk"], [cd.s, "Sn"]].map(([v, l]) => (
                <div key={l as string} className="flex flex-col items-center gap-1"><span className={box}>{String(v).padStart(2, "0")}</span><span className="text-[10px] font-semibold text-white/70">{l}</span></div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-[12px] font-bold text-white/80">{STATUS_TR[ev.status] ?? ev.status}{ev.live && ev.minute ? ` · ${ev.minute}'` : ""}</div>
            <div className="mt-1 text-4xl font-extrabold tabular-nums">{ev.score?.h ?? 0} : {ev.score?.a ?? 0}</div>
            {ev.score?.hh != null && <div className="text-[11px] font-semibold text-white/70">İY {ev.score.hh}-{ev.score.ha}</div>}
            {lastEv && <div className="mt-1.5 truncate text-[12px] font-semibold text-white/90">{lastEv.min}' {evLabel(lastEv)}{lastEv.player ? ` · ${lastEv.player}` : ""}</div>}
            {ev.liveStopped && !final && <div className="mt-1.5 inline-block rounded bg-caution px-2 py-0.5 text-[11px] font-extrabold text-[#2a1d00]">Oyun durdu · bahisler askıda</div>}
          </>
        )}
        {(info?.referee || info?.venue) && <div className="mt-2.5 border-t border-white/15 pt-2 text-[11px] text-white/75">{info.referee && <>Hakem: <b className="text-white">{info.referee}</b></>}{info.referee && info.venue ? " · " : ""}{info.venue}</div>}
      </div>
    </Pitch>
  );
}

const evLabel = (e: DInfo["events"][number]) =>
  e.type === "Goal" ? (e.detail === "Own Goal" ? "Kendi kalesine gol" : e.detail === "Penalty" ? "Penaltı golü" : e.detail === "Missed Penalty" ? "Kaçan penaltı" : "Gol")
    : e.type === "Card" ? (e.detail?.includes("Red") ? "Kırmızı kart" : "Sarı kart") : e.type === "subst" ? "Oyuncu değişikliği" : e.type === "Var" ? `VAR: ${e.detail}` : e.detail;

function EvIcon({ e, size = "size-3" }: { e: DInfo["events"][number]; size?: string }) {
  if (e.type === "Goal") return <svg viewBox="0 0 24 24" className={size}><circle cx="12" cy="12" r="10" fill="#fff" /><path d="M12 7.5 16 10.5l-1.5 4.5h-5L8 10.5Z" fill="#0f1923" /></svg>;
  if (e.type === "Card") return <span className={`inline-block h-3 w-2 rounded-[1px] ${e.detail?.includes("Red") ? "bg-loss" : "bg-caution"}`} />;
  if (e.type === "subst") return <span className="text-[10px] font-extrabold leading-none text-win">⇅</span>;
  return <span className="text-[9px] font-extrabold leading-none text-soft">VAR</span>;
}

function Timeline({ ev, info }: { ev: DEv; info: DInfo | null }) {
  const evs = (info?.events ?? []).filter((e) => e.type !== "subst");
  const maxMin = Math.max(90, ...evs.map((e) => e.min + (e.extra ?? 0)), ev.minute ?? 0);
  const pos = (m: number) => `${Math.min(100, (m / maxMin) * 100)}%`;
  const cur = ev.live ? ev.minute ?? 0 : ["FT", "AET", "PEN"].includes(ev.status) ? maxMin : 0;
  return (
    <div className="px-3 pt-2 pb-3">
      <div className="relative ml-10 mr-2 h-4 text-[10px] font-semibold text-dim">
        {[0, 15, 30, 45, 60, 75, 90].map((m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: pos(m) }}>{m}</span>)}
      </div>
      {(["home", "away"] as const).map((side) => (
        <div key={side} className="flex h-6 items-center">
          <span className="w-10 shrink-0 truncate text-[11px] font-extrabold text-soft uppercase">{(side === "home" ? ev.home : ev.away).slice(0, 3)}</span>
          <div className="relative mr-2 h-full flex-1">
            <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
            {[15, 30, 45, 60, 75, 90].map((m) => <div key={m} className="absolute top-1 bottom-1 w-px bg-line" style={{ left: pos(m) }} />)}
            {evs.filter((e) => e.side === side).map((e, i) => (
              <span key={i} title={`${e.min}${e.extra ? "+" + e.extra : ""}' ${evLabel(e)}${e.player ? " · " + e.player : ""}`} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pos(e.min + (e.extra ?? 0)) }}><EvIcon e={e} /></span>
            ))}
          </div>
        </div>
      ))}
      <div className="relative ml-10 mr-2 mt-1 h-1 rounded-full bg-card">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/70" style={{ width: pos(cur) }} />
        {ev.live && <span className="live-dot absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" style={{ left: pos(cur) }} />}
      </div>
    </div>
  );
}

function Stats({ info }: { info: DInfo | null }) {
  const rows = (info?.stats ?? []).filter((r) => r.home != null || r.away != null);
  if (!rows.length) return <Empty t="İstatistikler maç başladığında görünür." />;
  const n = (v: any) => (typeof v === "string" ? parseFloat(v) : Number(v ?? 0)) || 0;
  return (
    <div className="space-y-3 p-4">
      {rows.map((r) => {
        const h = n(r.home), a = n(r.away), t = h + a || 1;
        return (
          <div key={r.type}>
            <div className="mb-1 flex justify-between text-[12px] font-bold"><span className="tabular-nums">{r.home ?? 0}</span><span className="text-soft">{STAT_TR[r.type] ?? r.type}</span><span className="tabular-nums">{r.away ?? 0}</span></div>
            <div className="flex h-1.5 gap-1"><div className="flex flex-1 justify-end rounded-full bg-card"><div className="rounded-full bg-primary" style={{ width: `${(h / t) * 100}%` }} /></div><div className="flex-1 rounded-full bg-card"><div className="h-full rounded-full bg-accent" style={{ width: `${(a / t) * 100}%` }} /></div></div>
          </div>
        );
      })}
    </div>
  );
}

function Lineups({ ev, info }: { ev: DEv; info: DInfo | null }) {
  const ls = info?.lineups ?? [];
  if (!ls.length) return <Empty t="Kadrolar genellikle maçtan ~1 saat önce açıklanır." />;
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2">
      {(["home", "away"] as const).map((side) => {
        const l = ls.find((x) => x.side === side); if (!l) return null;
        return (
          <div key={side} className="rounded-lg bg-card p-3">
            <div className="mb-2 flex items-center gap-2"><Logo src={side === "home" ? ev.homeLogo : ev.awayLogo} name={side === "home" ? ev.home : ev.away} size="size-5" /><b className="truncate text-sm">{side === "home" ? ev.home : ev.away}</b><span className="ml-auto rounded bg-primary/15 px-1.5 text-[12px] font-extrabold text-primary">{l.formation}</span></div>
            {l.xi.map((p, i) => <div key={i} className="flex items-center gap-2 py-0.5 text-[13px]"><span className="w-6 text-right font-bold text-subtle tabular-nums">{p.number}</span><span className="truncate">{p.name}</span><span className="ml-auto text-[11px] font-bold text-dim">{p.pos}</span></div>)}
            {l.coach && <div className="mt-2 border-t border-line pt-2 text-[12px] text-subtle">Teknik direktör: <b className="text-fg">{l.coach}</b></div>}
          </div>
        );
      })}
    </div>
  );
}

function Events({ info }: { info: DInfo | null }) {
  const evs = [...(info?.events ?? [])].reverse();
  if (!evs.length) return <Empty t="Henüz maç olayı yok." />;
  return (
    <div className="divide-y divide-line p-2">
      {evs.map((e, i) => (
        <div key={i} className={`flex items-center gap-3 px-2 py-2 text-[13px] ${e.side === "away" ? "flex-row-reverse text-right" : ""}`}>
          <span className="w-10 shrink-0 font-extrabold text-primary tabular-nums">{e.min}{e.extra ? `+${e.extra}` : ""}'</span>
          <EvIcon e={e} size="size-4" />
          <span className="min-w-0"><b className="block truncate">{e.player ?? "—"}</b><span className="block truncate text-[12px] text-subtle">{evLabel(e)}{e.assist && e.type === "Goal" ? ` · asist ${e.assist}` : e.assist && e.type === "subst" ? ` · çıkan ${e.assist}` : ""}</span></span>
        </div>
      ))}
    </div>
  );
}
const Empty = ({ t }: { t: string }) => <div className="px-4 py-8 text-center text-[13px] text-subtle">{t}</div>;

// ---------- market kartları ----------
function OddBtn({ ev, m, s, label, row, props }: { ev: DEv; m: DMarket; s: DSel; label: string; row?: boolean; props: Props }) {
  const on = props.isPicked(s.id); const c = props.changed[s.id];
  if (s.suspended) return <div className="flex h-12 w-full items-center justify-between rounded-lg bg-card/60 px-3 text-[14px] text-dim"><span className="truncate">{label}</span><I n="lock" className="size-4" /></div>;
  return (
    <button onClick={() => props.onPick(ev, m, s)}
      className={`flex h-12 w-full items-center justify-between gap-2 rounded-lg px-3 text-[14px] font-semibold transition-all ${on ? "bg-primary text-primary-fg glow-green" : "bg-card text-muted hover:bg-surface-hover hover:text-fg"}`}>
      <span className="truncate text-left">{label}</span>
      <span className={`flex items-center gap-1 font-extrabold tabular-nums ${on ? "" : c === "up" ? "text-win" : c === "down" ? "text-loss" : "text-fg"}`}>{!on && c === "up" ? "▲" : !on && c === "down" ? "▼" : ""}{s.odds.toFixed(2)}</span>
    </button>
  );
}

function MarketCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl bg-panel p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[15px] font-bold">{title}</span>
        <div className="ml-auto flex items-center gap-3">{right}
          <button onClick={() => setOpen(!open)} className={`grid size-7 place-items-center rounded-full ${open ? "bg-primary/15 text-primary" : "bg-card text-subtle"}`}><I n={open ? "minus" : "plus"} className="size-3.5" /></button>
        </div>
      </div>
      {open && children}
    </div>
  );
}

function TotalCard({ ev, props }: { ev: DEv; props: Props }) {
  const avail = OU_KEYS.map((k) => ev.markets.find((m) => m.key === k)).filter(Boolean) as DMarket[];
  const [i, setI] = useState(() => Math.max(0, avail.findIndex((m) => m.key === "ou25")));
  const [all, setAll] = useState(false);
  if (!avail.length) return null;
  const line = (m: DMarket) => m.key === "ou15" ? "1.5" : m.key === "ou25" ? "2.5" : "3.5";
  const pair = (m: DMarket) => (
    <div className="grid grid-cols-2 gap-2">
      {(["OVER", "UNDER"] as const).map((c) => { const s = m.selections.find((x) => x.code === c); return s ? <OddBtn key={c} ev={ev} m={m} s={s} label={`${c === "OVER" ? "Üst" : "Alt"} ${line(m)}`} props={props} /> : null; })}
    </div>
  );
  const m = avail[Math.min(i, avail.length - 1)];
  return (
    <MarketCard title="Toplam Gol" right={<span className="flex gap-2 text-[13px] font-bold"><button onClick={() => setAll(false)} className={all ? "text-subtle" : "text-primary"}>Ana</button><button onClick={() => setAll(true)} className={all ? "text-primary" : "text-subtle"}>Tümü</button></span>}>
      {all ? <div className="space-y-2">{avail.map((x) => <div key={x.key}>{pair(x)}</div>)}</div> : (
        <>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[13px] font-bold text-soft">Çizgi</span>
            <div className="flex items-center rounded-lg bg-card">
              <button disabled={i <= 0} onClick={() => setI(i - 1)} className="grid size-9 place-items-center text-subtle hover:text-fg disabled:opacity-30"><I n="left" className="size-4" /></button>
              <span className="w-12 text-center text-[15px] font-extrabold tabular-nums">{line(m)}</span>
              <button disabled={i >= avail.length - 1} onClick={() => setI(i + 1)} className="grid size-9 place-items-center text-subtle hover:text-fg disabled:opacity-30"><I n="right" className="size-4" /></button>
            </div>
          </div>
          {pair(m)}
        </>
      )}
    </MarketCard>
  );
}

function Market({ ev, m, props }: { ev: DEv; m: DMarket; props: Props }) {
  const n = m.selections.length;
  const rows = n === 3 && (m.key === "1x2" || m.key === "ht1x2");
  return (
    <MarketCard title={m.name}>
      <div className={rows ? "space-y-2" : `grid gap-2 ${n === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {m.selections.map((s) => <OddBtn key={s.id} ev={ev} m={m} s={s} label={s.name} props={props} />)}
      </div>
    </MarketCard>
  );
}

// ---------- sayfa ----------
export default function MatchDetail(props: Props) {
  const { ev, info, onBack } = props;
  const [tab, setTab] = useState("main");
  const [trk, setTrk] = useState<"pitch" | "stats" | "lineups" | "events">("pitch");
  const final = ["FT", "AET", "PEN"].includes(ev.status);
  const groups = GROUPS.filter((g) => g.markets.some((k) => (k === "ou" ? ev.markets.some((m) => OU_KEYS.includes(m.key)) : ev.markets.some((m) => m.key === k))));
  const cur = groups.find((g) => g.key === tab) ?? groups[0];
  const d = new Date(ev.startsAt);
  const tabsIc: { k: typeof trk; ic: string; t: string }[] = [{ k: "pitch", ic: "ball", t: "Saha" }, { k: "stats", ic: "list", t: "İstatistik" }, { k: "lineups", ic: "user", t: "Kadro" }, { k: "events", ic: "clock", t: "Olaylar" }];
  const goals = useMemo(() => (info?.events ?? []).filter((e) => e.type === "Goal"), [info]);

  return (
    <div className="mx-auto max-w-[960px]">
      {/* üst çubuk */}
      <div className="mb-3 flex items-center gap-3">
        <button onClick={onBack} className="grid size-10 shrink-0 place-items-center rounded-lg bg-panel text-muted hover:text-fg" aria-label="Geri"><I n="left" className="size-5" /></button>
        <div className="min-w-0 text-[14px] font-semibold text-soft"><span className="text-subtle">{ev.country ? `${ev.country} · ` : ""}{ev.league}{info?.round ? ` · ${info.round}` : ""}</span><div className="truncate font-bold text-fg">{ev.home} - {ev.away}</div></div>
      </div>

      {/* skor kartı */}
      <div className="mb-3 rounded-xl bg-panel p-4">
        {[["home", ev.home, ev.homeLogo, ev.score?.h], ["away", ev.away, ev.awayLogo, ev.score?.a]].map(([k, n, l, g], i) => (
          <div key={k as string} className="flex items-center gap-3 py-1.5">
            <Logo src={l as string} name={n as string} size="size-7" />
            <span className="min-w-0 flex-1 truncate text-[16px] font-bold">{n as string}</span>
            {(ev.live || final) && <span className="grid h-8 min-w-8 place-items-center rounded-md bg-card px-2 text-[16px] font-extrabold tabular-nums">{(g as number) ?? 0}</span>}
            <span className="w-20 text-right text-[13px] font-bold text-subtle">
              {i === 0 ? (ev.live ? <span className="rounded bg-live px-2 py-0.5 text-[11px] font-extrabold text-white">CANLI</span> : final ? "Maç Sonu" : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }))
                : ev.live ? `${ev.minute ?? 0}'` : final ? (ev.score?.hh != null ? `İY ${ev.score.hh}-${ev.score.ha}` : "") : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>

      {/* maç izleyici */}
      <div className="mb-4 overflow-hidden rounded-xl bg-panel">
        <div className="flex items-center gap-2 px-3 pt-3 text-[13px] font-bold">
          <Logo src={ev.homeLogo} name={ev.home} size="size-5" /><span className="min-w-0 flex-1 truncate">{ev.home}</span>
          <span className="shrink-0 rounded bg-card px-2 py-0.5 text-[11px] font-bold text-soft">{ev.live ? `${STATUS_TR[ev.status] ?? ev.status} | ${ev.minute ?? 0}'` : final ? "Maç Sonu" : `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })} | ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`}</span>
          <span className="min-w-0 flex-1 truncate text-right">{ev.away}</span><Logo src={ev.awayLogo} name={ev.away} size="size-5" />
        </div>
        {(ev.live || final) && <div className="text-center text-xl font-extrabold tabular-nums">{ev.score?.h ?? 0} : {ev.score?.a ?? 0}</div>}
        <Timeline ev={ev} info={info} />
        <div className="grid grid-cols-4 border-y border-line">
          {tabsIc.map((t) => (
            <button key={t.k} onClick={() => setTrk(t.k)} title={t.t} className={`flex h-10 items-center justify-center gap-1.5 text-[12px] font-bold ${trk === t.k ? "border-b-2 border-primary text-primary" : "text-subtle hover:text-fg"}`}>
              <I n={t.ic} className="size-4" /><span className="hidden sm:inline">{t.t}</span>
            </button>
          ))}
        </div>
        {trk === "pitch" ? <Tracker ev={ev} info={info} /> : trk === "stats" ? <Stats info={info} /> : trk === "lineups" ? <Lineups ev={ev} info={info} /> : <Events info={info} />}
        {goals.length > 0 && trk === "pitch" && (
          <div className="grid grid-cols-2 gap-2 px-3 py-2 text-[12px] text-soft">
            {(["home", "away"] as const).map((s) => <div key={s} className={s === "away" ? "text-right" : ""}>{goals.filter((g) => g.side === s).map((g, i) => <div key={i}>⚽ {g.player} {g.min}'{g.detail === "Penalty" ? " (P)" : g.detail === "Own Goal" ? " (KK)" : ""}</div>)}</div>)}
          </div>
        )}
      </div>

      {/* marketler */}
      {ev.markets.length === 0 ? (
        <div className="rounded-xl bg-panel p-10 text-center text-sm text-subtle">{final ? "Maç sona erdi, marketler kapandı." : "Bu maç için şu an açık market yok."}</div>
      ) : (
        <>
          {ev.live && !ev.liveOpen && <div className="mb-3 flex items-center gap-2 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-[13px] font-semibold text-caution"><I n="lock" className="size-4" />Canlı oranlar şu an askıda — güncellendiğinde otomatik açılır.</div>}
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
            {groups.map((g) => <button key={g.key} onClick={() => setTab(g.key)} className={`h-10 shrink-0 rounded-lg border px-5 text-sm font-bold transition-colors ${cur?.key === g.key ? "border-primary text-primary" : "border-transparent bg-panel text-subtle hover:text-fg"}`}>{g.label}</button>)}
          </div>
          <div className="space-y-3">
            {cur?.markets.map((k) => k === "ou" ? <TotalCard key={`ou-${ev.id}`} ev={ev} props={props} /> : (() => { const m = ev.markets.find((x) => x.key === k); return m ? <Market key={m.id} ev={ev} m={m} props={props} /> : null; })())}
          </div>
        </>
      )}
    </div>
  );
}
