import { useEffect, useMemo, useState } from "react";
import { I } from "./lib";
import { api } from "./api";

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
  const box = "num grid min-w-12 place-items-center rounded-md bg-white px-2 py-1 text-[22px] font-bold text-[#080d13]";
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
            <div className="num mt-1 text-5xl font-bold">{ev.score?.h ?? 0} : {ev.score?.a ?? 0}</div>
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
  if (e.type === "Goal") return <svg viewBox="0 0 24 24" className={size}><circle cx="12" cy="12" r="10" fill="#fff" /><path d="M12 7.5 16 10.5l-1.5 4.5h-5L8 10.5Z" fill="#080d13" /></svg>;
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
          <span className="w-10 shrink-0 truncate text-[12px] font-semibold text-soft">{(side === "home" ? ev.home : ev.away).slice(0, 3)}</span>
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

/* =====================================================================
 * Sportmonks canlı takip — saha olayları, kadro sahası + reytingler, zengin istatistik, anlatım
 * ===================================================================== */
type SmPlayer = { id: number; name: string; number: number | null; photo: string | null; field: string | null; rating: number | null; captain: boolean; goals: number; yellow: number; red: number; subOut: number | null; subIn: number | null };
export type SmTracker = {
  available: boolean; reason?: string; live?: boolean; minute?: number | null; state?: string;
  teams?: { home: { name: string; logo: string | null }; away: { name: string; logo: string | null } };
  timeline?: { min: number; extra: number | null; side: "home" | "away"; type: string; code: string; player: string | null; info: string | null; addition: string | null }[];
  comments?: { min: number | null; extra: number | null; text: string; goal: boolean; important: boolean }[];
  lineups?: { side: "home" | "away"; formation: string | null; xi: SmPlayer[]; bench: SmPlayer[] }[];
  stats?: { key: string; home: number | null; away: number | null }[];
  ball?: { x: number; y: number; t: number }[] | null;
  xg?: { home: number | null; away: number | null } | null;
};
const ACT_TR: Record<string, string> = {
  CORNER: "Korner", SHOT_ON_TARGET: "İsabetli şut", SHOT_OFF_TARGET: "İsabetsiz şut", SHOT_BLOCKED: "Engellenen şut", OFFSIDE: "Ofsayt", FREE_KICK: "Serbest vuruş", THROWIN: "Taç",
  GOAL: "GOL!", OWNGOAL: "Kendi kalesine gol", PENALTY: "Penaltı golü", MISSED_PENALTY: "Kaçan penaltı", YELLOWCARD: "Sarı kart", REDCARD: "Kırmızı kart", YELLOWREDCARD: "İkinci sarıdan kırmızı",
  SUBSTITUTION: "Oyuncu değişikliği", VAR: "VAR incelemesi", VAR_CARD: "VAR: kart", PENALTY_SHOOTOUT_GOAL: "Penaltı (seri) gol", PENALTY_SHOOTOUT_MISS: "Penaltı (seri) kaçtı", HIT_WOODWORK: "Direkten döndü",
};
const SM_STAT_TR: Record<string, string> = {
  BALL_POSSESSION: "Topla Oynama", EXPECTED_GOALS: "Gol Beklentisi (xG)", BIG_CHANCES_CREATED: "Büyük Şans", SHOTS_TOTAL: "Toplam Şut", SHOTS_ON_TARGET: "İsabetli Şut", SHOTS_OFF_TARGET: "İsabetsiz Şut", SHOTS_BLOCKED: "Engellenen Şut",
  SAVES: "Kaleci Kurtarışı", CORNERS: "Korner", FOULS: "Faul", PASSES: "Pas", SUCCESSFUL_PASSES: "İsabetli Pas", SUCCESSFUL_PASSES_PERCENTAGE: "Pas İsabeti %", TACKLES: "Top Çalma", INTERCEPTIONS: "Top Kesme",
  ATTACKS: "Atak", DANGEROUS_ATTACKS: "Tehlikeli Atak", FREE_KICKS: "Serbest Vuruş", OFFSIDES: "Ofsayt", THROWINS: "Taç", GOAL_KICKS: "Kale Vuruşu", YELLOWCARDS: "Sarı Kart", REDCARDS: "Kırmızı Kart",
};
const ratingColor = (r: number) => (r >= 8 ? "#1aa7d9" : r >= 7 ? "#1fae4b" : r >= 6.5 ? "#d9a400" : r >= 6 ? "#e87a1d" : "#d43b30");

/** Canlı saha: son olay hücum eden takımın yarı sahasını boyar; top konumu verisi varsa top + iz çizgisi */
function LivePitch({ ev, tr }: { ev: DEv; tr: SmTracker }) {
  const last = tr.timeline?.length ? tr.timeline[tr.timeline.length - 1] : null;
  const fresh = last && tr.live && (tr.minute == null || (tr.minute - last.min) <= 3);
  const ball = tr.ball?.length ? tr.ball : null;
  const b = ball?.[ball.length - 1]; const pb = ball && ball.length > 1 ? ball[ball.length - 2] : null;
  const atk = last?.side; const name = atk === "away" ? ev.away : ev.home;
  const goal = last && /GOAL|PENALTY$/.test(last.code) && !/MISS/.test(last.code);
  // ev sahibi sağa hücum eder
  const shade = atk === "home" ? "linear-gradient(90deg, transparent 50%, rgba(255,255,255,.10) 50%, rgba(255,255,255,.18))" : "linear-gradient(270deg, transparent 50%, rgba(255,255,255,.10) 50%, rgba(255,255,255,.18))";
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#3a7d2c] sm:aspect-[2/1]">
      <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,.07) 0 6.25%, transparent 6.25% 12.5%)" }} />
      <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,.35)]" />
      {fresh && <div key={`${last!.min}-${last!.code}-${atk}`} className="animate-sports-fade absolute inset-0" style={{ background: shade }} />}
      <svg viewBox="0 0 210 105" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth=".5">
        <rect x="4" y="4" width="202" height="97" /><line x1="105" y1="4" x2="105" y2="101" /><circle cx="105" cy="52.5" r="12" /><circle cx="105" cy="52.5" r=".9" fill="#fff" />
        <rect x="4" y="25" width="28" height="55" /><rect x="4" y="38" width="10" height="29" /><rect x="178" y="25" width="28" height="55" /><rect x="196" y="38" width="10" height="29" />
        <circle cx="23" cy="52.5" r=".9" fill="#fff" /><circle cx="187" cy="52.5" r=".9" fill="#fff" />
        <path d="M32 44a11 11 0 0 1 0 17M178 44a11 11 0 0 0 0 17" />
        <rect x="1.5" y="45" width="2.5" height="15" fill="rgba(255,255,255,.35)" /><rect x="206" y="45" width="2.5" height="15" fill="rgba(255,255,255,.35)" />
        {b && pb && <line x1={4 + pb.x * 202} y1={4 + pb.y * 97} x2={4 + b.x * 202} y2={4 + b.y * 97} stroke="rgba(255,255,255,.85)" strokeWidth=".6" />}
      </svg>
      {b && <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,.35)] transition-all duration-700" style={{ left: `${(4 + b.x * 202) / 2.1}%`, top: `${(4 + b.y * 97) / 1.05}%` }} />}
      <div className={`absolute inset-y-0 flex w-1/2 flex-col justify-center px-[6%] text-white ${atk === "away" ? "left-0 items-start text-left" : "right-0 items-end text-right"} ${!fresh ? "!inset-x-0 !w-full items-center text-center" : ""}`}>
        {fresh ? (
          <>
            <span className="text-[18px] font-bold leading-tight drop-shadow sm:text-[22px]">{name}</span>
            <span className={`mt-0.5 font-medium drop-shadow ${goal ? "text-[22px] font-extrabold text-caution sm:text-[28px]" : "text-[14px] sm:text-[16px]"}`}>{ACT_TR[last!.code] ?? last!.type}</span>
            {last!.player && <span className="mt-0.5 text-[12px] text-white/80">{last!.player}</span>}
          </>
        ) : (
          <span className="rounded-lg bg-black/35 px-3 py-1.5 text-[14px] font-bold backdrop-blur-sm">{tr.live ? `${tr.minute ?? ""}' · Oyun devam ediyor` : STATUS_TR[ev.status] ?? "Maç başlamadı"}</span>
        )}
      </div>
      {tr.live && <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-0.5 text-[11px] font-bold text-white"><span className="live-dot size-1.5 rounded-full bg-live" />CANLI {tr.minute ?? ""}'</span>}
    </div>
  );
}

/** Son saha olayları akışı (pitch altı) */
function ActionFeed({ ev, tr }: { ev: DEv; tr: SmTracker }) {
  const items = [...(tr.timeline ?? [])].reverse().slice(0, 6);
  if (!items.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {items.map((t, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${i === 0 ? "bg-card-2" : "bg-card"}`}>
          <span className="w-9 shrink-0 font-bold tabular-nums text-subtle">{t.min}{t.extra ? `+${t.extra}` : ""}'</span>
          <span className={`size-2 shrink-0 rounded-full ${t.side === "home" ? "bg-primary" : "bg-[#6c7cff]"}`} />
          <span className="min-w-0 flex-1 truncate"><b>{ACT_TR[t.code] ?? t.type}</b> <span className="text-subtle">· {t.side === "home" ? ev.home : ev.away}{t.player ? ` · ${t.player}` : ""}</span></span>
        </div>
      ))}
    </div>
  );
}

/** Kadro sahası: formation_field "satır:sütun" — ev sahibi üstte (kaleci en üstte), deplasman altta */
function LineupPitch({ ev, tr }: { ev: DEv; tr: SmTracker }) {
  const ls = tr.lineups ?? [];
  const [bench, setBench] = useState(false);
  if (!ls.length) return <Empty t="Kadrolar genellikle maçtan ~1 saat önce açıklanır." />;
  const rowsOf = (xi: SmPlayer[]) => {
    const m = new Map<number, SmPlayer[]>();
    xi.forEach((p) => { const r = Number(p.field?.split(":")[0] ?? 0) || 0; if (!m.has(r)) m.set(r, []); m.get(r)!.push(p); });
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, ps]) => ps.sort((a, b) => Number(a.field?.split(":")[1] ?? 0) - Number(b.field?.split(":")[1] ?? 0)));
  };
  const Player = ({ p }: { p: SmPlayer }) => (
    <div className="flex w-[22%] max-w-[92px] flex-col items-center text-center">
      <div className="relative">
        <span className="block size-9 overflow-hidden rounded-full bg-white sm:size-10">{p.photo ? <img src={p.photo} alt="" loading="lazy" className="size-full object-cover" /> : null}</span>
        {p.rating != null && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-[3px] px-1 text-[10px] font-bold leading-[14px] text-white" style={{ background: ratingColor(p.rating) }}>{p.rating.toFixed(1)}</span>}
        {p.yellow > 0 && <span className="absolute -left-1.5 -top-0.5 h-3 w-2 rounded-[1px] bg-caution" />}
        {p.red > 0 && <span className="absolute -left-1.5 -top-0.5 h-3 w-2 rounded-[1px] bg-loss" />}
        {p.subOut != null && <span className="absolute -right-2 -top-0.5 rounded bg-black/50 px-0.5 text-[9px] font-bold text-loss">↓{p.subOut}'</span>}
        {p.goals > 0 && <span className="absolute -right-2 bottom-1 grid size-3.5 place-items-center rounded-full bg-white text-[8px]">⚽</span>}
      </div>
      <span className="mt-2.5 w-full truncate text-[11px] font-semibold text-white/90">{p.number} {p.captain ? "(c) " : ""}{p.name.split(" ").slice(-1)[0]}</span>
    </div>
  );
  const home = ls.find((l) => l.side === "home"), away = ls.find((l) => l.side === "away");
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between text-[13px] font-bold">
        <span className="flex items-center gap-2"><Logo src={ev.homeLogo} name={ev.home} size="size-5" />{ev.home}<span className="rounded bg-card px-1.5 text-[12px] text-subtle">{home?.formation}</span></span>
        <button onClick={() => setBench(!bench)} className="text-[12px] text-primary">{bench ? "Sahayı göster" : "Yedekler"}</button>
      </div>
      {bench ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[home, away].map((l, i) => l && (
            <div key={i} className="rounded-xl bg-card p-3">
              <div className="mb-2 text-[13px] font-bold">{i === 0 ? ev.home : ev.away} · Yedekler</div>
              {l.bench.map((p) => <div key={p.id} className="flex items-center gap-2 py-1 text-[13px]"><span className="w-6 text-right font-bold text-subtle">{p.number}</span><span className="min-w-0 flex-1 truncate">{p.name}</span>{p.subIn != null && <span className="text-[11px] font-bold text-primary">↑{p.subIn}'</span>}{p.rating != null && <span className="rounded-[3px] px-1 text-[10px] font-bold text-white" style={{ background: ratingColor(p.rating) }}>{p.rating.toFixed(1)}</span>}</div>)}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-[#1b1f24] py-3">
          <svg viewBox="0 0 100 160" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".4">
            <rect x="3" y="2" width="94" height="156" /><line x1="3" y1="80" x2="97" y2="80" /><circle cx="50" cy="80" r="11" />
            <rect x="27" y="2" width="46" height="18" /><rect x="38" y="2" width="24" height="7" /><rect x="27" y="140" width="46" height="18" /><rect x="38" y="151" width="24" height="7" />
          </svg>
          <div className="relative flex min-h-[560px] flex-col justify-between gap-4 sm:min-h-[640px]">
            <div className="flex flex-col gap-4">{home && rowsOf(home.xi).map((r, i) => <div key={i} className="flex justify-around">{r.map((p) => <Player key={p.id} p={p} />)}</div>)}</div>
            <div className="flex flex-col gap-4">{away && rowsOf(away.xi).reverse().map((r, i) => <div key={i} className="flex justify-around">{r.map((p) => <Player key={p.id} p={p} />)}</div>)}</div>
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[13px] font-bold">
        <span className="flex items-center gap-2"><Logo src={ev.awayLogo} name={ev.away} size="size-5" />{ev.away}<span className="rounded bg-card px-1.5 text-[12px] text-subtle">{away?.formation}</span></span>
      </div>
    </div>
  );
}

/** Zengin istatistik (ekran görüntüsündeki gibi: ev sahibi yeşil, deplasman mor) */
function SmStats({ tr }: { tr: SmTracker }) {
  const rows = (tr.stats ?? []).filter((r) => r.key !== "BALL_POSSESSION");
  const pos = tr.stats?.find((r) => r.key === "BALL_POSSESSION");
  const xg = tr.xg && (tr.xg.home != null || tr.xg.away != null) ? tr.xg : null;
  if (!rows.length && !pos) return <Empty t="İstatistikler maç başladığında görünür." />;
  const Bar = ({ l, h, a, dec }: { l: string; h: number; a: number; dec?: boolean }) => {
    const t = h + a || 1;
    return (
      <div className="py-2">
        <div className="mb-1.5 flex justify-between text-[13px]"><span className="font-bold tabular-nums">{dec ? h.toFixed(2) : h}</span><span className="font-medium text-muted">{l}</span><span className="font-bold tabular-nums">{dec ? a.toFixed(2) : a}</span></div>
        <div className="flex gap-2"><div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-card-2"><div className={`rounded-full ${h >= a ? "bg-[#22c55e]" : "bg-[#22c55e]/45"}`} style={{ width: `${(h / t) * 100}%` }} /></div><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2"><div className={`h-full rounded-full ${a >= h ? "bg-[#6c7cff]" : "bg-[#6c7cff]/45"}`} style={{ width: `${(a / t) * 100}%` }} /></div></div>
      </div>
    );
  };
  return (
    <div className="p-4">
      <p className="mb-3 text-center text-[15px] font-bold">Maça Genel Bakış</p>
      {pos && (
        <div className="mb-2">
          <div className="mb-1.5 flex items-center justify-between text-[13px]"><span className="rounded-full bg-[#22c55e] px-2 py-0.5 text-[12px] font-bold text-[#06090e]">%{pos.home ?? 0}</span><span className="font-medium text-muted">Topla Oynama</span><span className="rounded-full bg-[#6c7cff] px-2 py-0.5 text-[12px] font-bold text-white">%{pos.away ?? 0}</span></div>
          <div className="flex h-2.5 overflow-hidden rounded-full"><div className="bg-[#22c55e]" style={{ width: `${pos.home ?? 50}%` }} /><div className="flex-1 bg-[#6c7cff]" /></div>
        </div>
      )}
      {xg && <Bar l="Gol Beklentisi (xG)" h={Number(xg.home ?? 0)} a={Number(xg.away ?? 0)} dec />}
      {rows.map((r) => <Bar key={r.key} l={SM_STAT_TR[r.key] ?? r.key} h={Number(r.home ?? 0)} a={Number(r.away ?? 0)} dec={r.key === "EXPECTED_GOALS"} />)}
    </div>
  );
}

/** Canlı anlatım */
function Commentary({ tr }: { tr: SmTracker }) {
  const cs = tr.comments ?? [];
  if (!cs.length) return <Empty t="Anlatım maç başladığında akmaya başlar." />;
  return (
    <div className="max-h-[520px] space-y-1.5 overflow-y-auto p-3">
      {cs.map((c, i) => (
        <div key={i} className={`flex gap-3 rounded-lg px-3 py-2.5 text-[13px] ${c.goal ? "bg-primary/10" : c.important ? "bg-card-2" : "bg-card"}`}>
          <span className={`w-9 shrink-0 font-bold tabular-nums ${c.goal ? "text-primary" : "text-subtle"}`}>{c.min != null ? `${c.min}${c.extra ? `+${c.extra}` : ""}'` : "—"}</span>
          <span className={c.goal ? "font-bold" : "text-muted"}>{c.text}</span>
        </div>
      ))}
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
    <button onClick={() => props.onPick(ev, m, s)} aria-label={`${m.name}: ${label}, oran ${s.odds.toFixed(2)}${on ? ", kuponda" : ""}`}
      aria-pressed={on} className={`odd h-12 w-full text-[14px] font-semibold ${on ? "odd-on" : "text-muted hover:text-fg"}`}>
      <span className="truncate text-left">{label}</span>
      <span className={`num flex items-center gap-1 text-[17px] font-bold ${on ? "" : c === "up" ? "text-win" : c === "down" ? "text-loss" : "text-fg"}`}>{!on && c === "up" ? "▲" : !on && c === "down" ? "▼" : ""}{s.odds.toFixed(2)}</span>
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
  const [trk, setTrk] = useState<"pitch" | "stats" | "lineups" | "events" | "comments">("pitch");
  const [sm, setSm] = useState<SmTracker | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api(`/api/sb/event/${ev.id}/tracker`).then((r) => alive && setSm(r)).catch(() => {});
    load(); const t = setInterval(load, ev.live ? 15_000 : 120_000);
    return () => { alive = false; clearInterval(t); };
  }, [ev.id, ev.live]);
  const smOn = !!sm?.available;
  const final = ["FT", "AET", "PEN"].includes(ev.status);
  const groups = GROUPS.filter((g) => g.markets.some((k) => (k === "ou" ? ev.markets.some((m) => OU_KEYS.includes(m.key)) : ev.markets.some((m) => m.key === k))));
  const cur = groups.find((g) => g.key === tab) ?? groups[0];
  const d = new Date(ev.startsAt);
  const tabsIc: { k: typeof trk; ic: string; t: string }[] = [{ k: "pitch", ic: "ball", t: "Ayrıntılar" }, { k: "lineups", ic: "user", t: "Kadrolar" }, { k: "stats", ic: "list", t: "İstatistikler" }, { k: "events", ic: "clock", t: "Olaylar" }, ...(smOn && sm?.comments?.length ? [{ k: "comments" as const, ic: "chat", t: "Anlatım" }] : [])];
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
            {(ev.live || final) && <span className="num grid h-8 min-w-8 place-items-center rounded-md bg-card px-2 text-[19px] font-bold">{(g as number) ?? 0}</span>}
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
        {(ev.live || final) && <div className="num text-center text-[28px] font-bold">{ev.score?.h ?? 0} : {ev.score?.a ?? 0}</div>}
        <Timeline ev={ev} info={info} />
        <div className="no-scrollbar flex overflow-x-auto border-y border-line">
          {tabsIc.map((t) => (
            <button key={t.k} onClick={() => setTrk(t.k)} className={`h-11 shrink-0 whitespace-nowrap px-4 text-[14px] font-medium transition-colors ${trk === t.k ? "border-b-2 border-primary text-primary" : "border-b-2 border-transparent text-subtle hover:text-fg"}`}>{t.t}</button>
          ))}
        </div>
        {trk === "pitch" ? (smOn ? <div className="p-3"><LivePitch ev={ev} tr={sm!} /><ActionFeed ev={ev} tr={sm!} /></div> : <Tracker ev={ev} info={info} />)
          : trk === "stats" ? (smOn && sm!.stats?.length ? <SmStats tr={sm!} /> : <Stats info={info} />)
          : trk === "lineups" ? (smOn && sm!.lineups?.length ? <LineupPitch ev={ev} tr={sm!} /> : <Lineups ev={ev} info={info} />)
          : trk === "comments" && smOn ? <Commentary tr={sm!} /> : <Events info={info} />}
        {goals.length > 0 && trk === "pitch" && (
          <div className="grid grid-cols-2 gap-2 px-3 py-2 text-[12px] text-soft">
            {(["home", "away"] as const).map((s) => <div key={s} className={s === "away" ? "text-right" : ""}>{goals.filter((g) => g.side === s).map((g, i) => <div key={i} className="flex items-center gap-1.5" style={{ justifyContent: s === "away" ? "flex-end" : undefined }}><svg viewBox="0 0 24 24" className="size-3.5"><circle cx="12" cy="12" r="10" fill="#fff" /><path d="M12 7.5 16 10.5l-1.5 4.5h-5L8 10.5Z" fill="#080d13" /></svg>{g.player} {g.min}'{g.detail === "Penalty" ? " (P)" : g.detail === "Own Goal" ? " (KK)" : ""}</div>)}</div>)}
          </div>
        )}
      </div>

      {/* marketler */}
      {ev.markets.length === 0 ? (
        <div className="rounded-xl bg-panel p-10 text-center text-sm text-subtle">{final ? "Maç sona erdi, marketler kapandı." : "Bu maç için şu an açık market yok."}</div>
      ) : (
        <>
          {ev.live && !ev.liveOpen && <div className="mb-3 flex items-center gap-2 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-[13px] font-semibold text-caution"><I n="lock" className="size-4" />Canlı oranlar şu an askıda — güncellendiğinde otomatik açılır.</div>}
          {!ev.live && !final && <div className="mb-3 flex items-center gap-2 rounded-xl bg-card-blue px-4 py-3 text-[13px] font-medium text-muted"><span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-extrabold text-primary-fg">BET BUILDER</span>Bu maçtan farklı marketlerden birden fazla seçim ekle, tek oranla oyna.</div>}
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
