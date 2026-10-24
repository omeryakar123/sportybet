import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api";
import { I, useStore } from "./lib";
import { MarketCard } from "./predictions";

/* ---------- özgün dekoratif çizimler ---------- */
const BallArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" aria-hidden className={className}>
    <defs>
      <radialGradient id="h-ball" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#d9e2ef" /><stop offset="1" stopColor="#9fb0c6" /></radialGradient>
      <radialGradient id="h-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#1fe88a" stopOpacity=".55" /><stop offset="1" stopColor="#1fe88a" stopOpacity="0" /></radialGradient>
    </defs>
    <circle cx="100" cy="100" r="100" fill="url(#h-glow)" />
    <circle cx="100" cy="100" r="70" fill="url(#h-ball)" />
    <polygon points="100,72 126,91 116,121 84,121 74,91" fill="#0f1923" />
    <g stroke="#0f1923" strokeWidth="4" fill="none" strokeLinecap="round"><path d="M100 72V34M126 91l34-10M116 121l20 30M84 121l-20 30M74 91 40 81" /></g>
  </svg>
);
const LiveArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" aria-hidden className={className}>
    <defs><radialGradient id="h-live" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ff3b4f" stopOpacity=".55" /><stop offset="1" stopColor="#ff3b4f" stopOpacity="0" /></radialGradient></defs>
    <circle cx="100" cy="100" r="100" fill="url(#h-live)" />
    <rect x="38" y="58" width="124" height="84" rx="14" fill="#1a2734" stroke="#ff3b4f" strokeWidth="5" />
    <path d="M88 82v36l30-18Z" fill="#ff3b4f" />
    <circle cx="150" cy="62" r="12" fill="#ff3b4f" /><circle cx="150" cy="62" r="5" fill="#fff" />
  </svg>
);
const VoteArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" aria-hidden className={className}>
    <defs><radialGradient id="h-vote" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#19e3d1" stopOpacity=".5" /><stop offset="1" stopColor="#19e3d1" stopOpacity="0" /></radialGradient></defs>
    <circle cx="100" cy="100" r="100" fill="url(#h-vote)" />
    <rect x="44" y="96" width="112" height="70" rx="10" fill="#bff5da" /><rect x="44" y="96" width="112" height="20" rx="10" fill="#dffbec" />
    <rect x="86" y="102" width="28" height="8" rx="4" fill="#174a35" />
    <rect x="70" y="40" width="60" height="58" rx="6" fill="#fff" transform="rotate(-8 100 70)" />
    <path d="m84 70 10 10 20-22" stroke="#1fb57a" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="rotate(-8 100 70)" />
  </svg>
);

function useNow() { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(t); }, []); return n; }
function Countdown({ to }: { to: string }) {
  const now = useNow(); const ms = Math.max(0, new Date(to).getTime() - now);
  if (!ms) return null;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  return <span className="rounded-lg border border-caution/40 bg-black/45 px-3 py-1.5 text-[13px] font-extrabold text-caution backdrop-blur tabular-nums">Bitişe {d > 0 ? `${d}g ` : ""}{h}s {m}d {s}sn</span>;
}

/* ---------- hero: CMS promosyonları (yoksa karşılama kartı) ---------- */
function BigLogo({ src, name }: { src?: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="grid size-14 place-items-center rounded-full bg-elevated text-lg font-extrabold text-soft">{name.slice(0, 1)}</span>;
  return <img src={src} alt="" onError={() => setBad(true)} className="size-14 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,.5)]" />;
}

function Hero({ ev }: { ev?: any }) {
  const { me, setAuthOpen, settings } = useStore();
  const [promos, setPromos] = useState<any[]>([]); const [i, setI] = useState(0);
  useEffect(() => { api("/api/cms/promotions").then((r) => setPromos((Array.isArray(r) ? r : []).filter((p: any) => !p.endsAt || new Date(p.endsAt) > new Date()).slice(0, 6))).catch(() => {}); }, []);
  useEffect(() => { if (promos.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % promos.length), 7000); return () => clearInterval(t); }, [promos.length]);
  const p = promos[i];
  if (!p) {
    const m1 = (ev?.markets ?? []).find((m: any) => m.key === "1x2");
    const o = (c: string) => m1?.selections.find((x: any) => x.code === c)?.odds;
    const d = ev ? new Date(ev.startsAt) : null;
    return (
      <section className="relative isolate overflow-hidden rounded-2xl bg-[#0d1b16] shadow-lift">
        {/* saha çizgileri — konunun kendi dokusu */}
        <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 -z-10 size-full opacity-[.16]" fill="none" stroke="#1fe88a" strokeWidth="1.2" aria-hidden>
          <rect x="10" y="10" width="380" height="200" /><line x1="200" y1="10" x2="200" y2="210" /><circle cx="200" cy="110" r="34" /><rect x="10" y="60" width="52" height="100" /><rect x="338" y="60" width="52" height="100" />
        </svg>
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(31,232,138,.18),transparent_70%)]" />
        <div className="grid gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center lg:py-10">
          <div>
            <h1 className="title text-[38px] sm:text-[50px] lg:text-[58px]">{me ? `Hoş geldin, ${me.username}` : "Maçı oyna, gündemi tahmin et"}</h1>
            <p className="mt-3 max-w-[440px] text-[15px] font-medium leading-relaxed text-muted">Bültendeki her maça oyna; maç bittiği an kuponun sonuçlanır, kazancın {settings.siteName ?? "SportyBet"} cüzdanına geçer.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/spor" className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-extrabold text-primary-fg shadow-pick hover:bg-primary-hover"><I n="ball" className="size-4" />Bülteni aç</Link>
              {!me && <button onClick={() => setAuthOpen("register")} className="inline-flex h-12 items-center rounded-xl bg-white/[.07] px-6 text-sm font-extrabold hover:bg-white/[.12]">Kayıt ol</button>}
            </div>
          </div>
          {ev && d && (
            <Link to={`/spor/mac/${ev.id}`} className="block rounded-2xl bg-[#0b1520]/85 p-4 shadow-float ring-1 ring-white/[.06] backdrop-blur transition-[box-shadow] hover:ring-primary/40 sm:p-5">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-soft">
                {ev.leagueLogo ? <img src={ev.leagueLogo} alt="" className="size-4 object-contain" /> : <I n="ball" className="size-4" />}
                <span className="min-w-0 flex-1 truncate">{ev.league}</span><span>Sıradaki maç</span>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex min-w-0 flex-col items-center gap-2 text-center"><BigLogo src={ev.homeLogo} name={ev.home} /><span className="w-full truncate text-[14px] font-bold">{ev.home}</span></div>
                <div className="text-center">
                  <div className="num text-[44px] font-bold leading-none sm:text-[52px]">{d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="mt-1 text-[12px] font-semibold text-subtle">{d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</div>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-2 text-center"><BigLogo src={ev.awayLogo} name={ev.away} /><span className="w-full truncate text-[14px] font-bold">{ev.away}</span></div>
              </div>
              {m1 && <div className="mt-4 grid grid-cols-3 gap-2">{[["1", "HOME"], ["X", "DRAW"], ["2", "AWAY"]].map(([l, c]) => <span key={c} className="odd h-11"><span className="l">{l}</span><span className="o text-[17px]">{o(c)?.toFixed(2) ?? "-"}</span></span>)}</div>}
            </Link>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-card">
      <Link to={`/promosyonlar/${p.slug}`} className="block">
        <div className="relative aspect-[4/3] w-full sm:aspect-[21/8]">
          {p.imageUrl ? <img src={p.imageUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 bg-[linear-gradient(120deg,#123326,#1fb57a)]" />}
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(11,19,28,.92)_0%,rgba(11,19,28,.35)_45%,transparent_70%)]" />
          {p.endsAt && <div className="absolute inset-x-0 top-4 flex justify-center"><Countdown to={p.endsAt} /></div>}
          <div className="absolute inset-x-0 bottom-0 p-5 text-center sm:p-8">
            <h2 className="text-2xl leading-tight font-extrabold drop-shadow sm:text-4xl">{p.title}</h2>
            <span className="mt-3 inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-fg">Detaylar</span>
          </div>
        </div>
      </Link>
      {promos.length > 1 && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {promos.map((_, j) => <button key={j} onClick={() => setI(j)} aria-label={`Promosyon ${j + 1}`} className={`h-1.5 rounded-full transition-all ${j === i ? "w-6 bg-primary" : "w-1.5 bg-white/40"}`} />)}
        </div>
      )}
    </section>
  );
}

/* ---------- yatay kaydırıcı başlığı ---------- */
function Rail({ title, icon, to, children }: { title: string; icon: React.ReactNode; to: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (d: number) => ref.current?.scrollBy({ left: d * 320, behavior: "smooth" });
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-primary">{icon}</span>
        <h2 className="title min-w-0 truncate text-[22px] sm:text-[26px]">{title}</h2>
        <Link to={to} className="ml-1 shrink-0 text-[13px] font-bold text-subtle hover:text-primary">Tümü</Link>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => by(-1)} aria-label="Önceki" className="grid size-9 place-items-center rounded-lg bg-panel text-muted hover:text-fg"><I n="left" className="size-4" /></button>
          <button onClick={() => by(1)} aria-label="Sonraki" className="grid size-9 place-items-center rounded-lg bg-panel text-muted hover:text-fg"><I n="right" className="size-4" /></button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar -mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 sm:-mx-4 sm:scroll-px-4 sm:px-4">{children}</div>
    </section>
  );
}

function Logo({ src, name }: { src?: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-extrabold text-soft">{name.slice(0, 1)}</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="size-6 shrink-0 object-contain" />;
}

const FAQ: [string, string][] = [
  ["Nasıl üye olurum?", "Sağ üstteki Kayıt Ol butonuna bas, kullanıcı adı ve şifreni belirle. Hesabın anında açılır."],
  ["Para yatırma ve çekme ne kadar sürer?", "Talepler finans ekibimiz tarafından sırayla işlenir; onaylanan yatırım bakiyene anında, çekim ise ödeme yöntemine göre kısa sürede hesabına geçer."],
  ["Kuponum ne zaman sonuçlanır?", "Maç bittiğinde sonuç bültenden otomatik okunur ve kazancın cüzdanına yatar."],
  ["Bonus cüzdanı nedir?", "Bonuslar ayrı bir cüzdanda tutulur. Çevrim şartı tamamlanınca bonus bakiyen Ana Para'ya aktarılır."],
  ["Sohbet kuralları neler?", "Küfür, hakaret, dilenme (para/bahşiş isteme), link ve reklam otomatik engellenir; tekrarında susturma uygulanır."],
  ["Sorumlu oyun", "Bahis yalnızca 18 yaş üstü içindir. Kendine limit koy, kaybını kovalama; ihtiyaç duyarsan destek ekibimizle iletişime geç."],
];

export default function Home() {
  const { settings } = useStore();
  const nav = useNavigate();
  const [markets, setMarkets] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [live, setLive] = useState<any[]>([]);
  const [total, setTotal] = useState<{ ev: number; pred: number }>({ ev: 0, pred: 0 });
  const [q, setQ] = useState(""); const [open, setOpen] = useState<number | null>(0);
  useEffect(() => {
    api("/api/predictions?homepage=true&limit=12").then((r) => { const d = r.data?.length ? r.data : null; if (d) setMarkets(d); else api("/api/predictions?limit=12").then((r2) => setMarkets(r2.data ?? [])).catch(() => {}); setTotal((t) => ({ ...t, pred: r.pagination?.total ?? (r.data?.length ?? 0) })); }).catch(() => {});
    api("/api/sb/events?limit=60").then((r) => { const a = Array.isArray(r) ? r : []; setEvents(a); setTotal((t) => ({ ...t, ev: a.length })); }).catch(() => {});
    api("/api/sb/live").then((r) => setLive(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);
  const featured = [...events.filter((e) => e.featured), ...events.filter((e) => !e.featured)].slice(0, 12);
  const cards = [
    { to: "/spor", top: `${total.ev}+ Maç`, title: "Spor", Art: BallArt, bg: "from-[#122a22] to-[#0f1923]" },
    { to: "/spor", top: `${live.length} canlı maç`, title: "Canlı", Art: LiveArt, bg: "from-[#2a1620] to-[#0f1923]" },
    { to: "/tahminler", top: `${total.pred || markets.length} piyasa`, title: "Tahminler", Art: VoteArt, bg: "from-[#112a2c] to-[#0f1923]" },
  ];
  return (
    <div className="animate-sports-fade">
      <Hero ev={featured[0]} />

      {/* kategori kartları */}
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {cards.map(({ to, top, title, Art, bg }) => (
          <Link key={title} to={to} className={`group relative flex h-[104px] items-center overflow-hidden rounded-2xl bg-gradient-to-r ${bg} px-5 ring-1 ring-line/70 transition-shadow hover:ring-primary/50 sm:h-[120px]`}>
            <div className="relative z-10">
              <div className="text-[13px] font-bold text-soft">{top}</div>
              <div className="title mt-1 text-[30px]">{title}</div>
            </div>
            <Art className="absolute -right-6 top-1/2 h-[150px] -translate-y-1/2 transition-transform duration-300 group-hover:scale-105 sm:h-[170px]" />
          </Link>
        ))}
      </section>

      {/* arama */}
      <form onSubmit={(e) => { e.preventDefault(); nav(`/spor${q.trim() ? `?ara=${encodeURIComponent(q.trim())}` : ""}`); }} className="mt-4">
        <label className="flex h-[52px] items-center gap-3 rounded-xl border border-line bg-panel px-4 focus-within:border-primary/70">
          <I n="search" className="size-5 shrink-0 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${total.ev} maç içinde takım veya lig ara`} className="w-full bg-transparent text-[15px] font-medium outline-none placeholder:text-subtle" />
        </label>
      </form>

      {/* canlı */}
      {live.length > 0 && (
        <Rail title="Canlı Maçlar" icon={<span className="live-dot size-2.5 rounded-full bg-live" />} to="/spor">
          {live.slice(0, 10).map((ev) => (
            <Link key={ev.id} to={`/spor/mac/${ev.id}`} className="w-[270px] shrink-0 snap-start rounded-xl bg-panel p-3 transition-colors hover:bg-card">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-soft"><span className="rounded bg-live px-1.5 text-[10px] font-extrabold text-white">CANLI</span><span className="min-w-0 flex-1 truncate">{ev.league}</span><span className="tabular-nums">{ev.minute ? `${ev.minute}'` : ""}</span></div>
              {[[ev.home, ev.homeLogo, ev.score?.h], [ev.away, ev.awayLogo, ev.score?.a]].map(([n, l, g]: any) => (
                <div key={n} className="flex items-center gap-2 py-0.5"><Logo src={l} name={n} /><span className="min-w-0 flex-1 truncate text-[14px] font-bold">{n}</span><span className="num text-[18px] font-bold text-primary">{g ?? 0}</span></div>
              ))}
            </Link>
          ))}
        </Rail>
      )}

      {/* öne çıkan maçlar */}
      {featured.length > 0 && (
        <Rail title="Öne Çıkan Maçlar" icon={<I n="flame" className="size-4" />} to="/spor">
          {featured.map((ev) => {
            const m1 = (ev.markets ?? []).find((m: any) => m.key === "1x2");
            const o = (c: string) => m1?.selections.find((s: any) => s.code === c)?.odds;
            const d = new Date(ev.startsAt);
            return (
              <Link key={ev.id} to={`/spor/mac/${ev.id}`} className="w-[290px] shrink-0 snap-start rounded-xl bg-panel p-3 transition-colors hover:bg-card">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-soft">
                  {ev.leagueLogo ? <img src={ev.leagueLogo} alt="" className="size-4 object-contain" /> : <I n="ball" className="size-4" />}
                  <span className="min-w-0 flex-1 truncate">{ev.league}</span>
                  <span className="text-subtle">{d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })} · {d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-card px-2.5 py-2.5">
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-2"><span className="truncate text-right text-[13px] font-bold">{ev.home}</span><Logo src={ev.homeLogo} name={ev.home} /></span>
                  <span className="text-[11px] font-bold text-dim">vs</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2"><Logo src={ev.awayLogo} name={ev.away} /><span className="truncate text-[13px] font-bold">{ev.away}</span></span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[["1", "HOME"], ["X", "DRAW"], ["2", "AWAY"]].map(([l, c]) => (
                    <span key={c} className="flex h-10 items-center justify-between rounded-md bg-card px-2.5 text-[13px] font-bold"><span className="text-[12px] text-subtle">{l}</span><span className="tabular-nums">{o(c)?.toFixed(2) ?? "-"}</span></span>
                  ))}
                </div>
              </Link>
            );
          })}
        </Rail>
      )}

      {/* tahminler */}
      {markets.length > 0 && (
        <Rail title="Popüler Tahminler" icon={<I n="vote" className="size-4" />} to="/tahminler">
          {markets.map((m) => <div key={m.id} className="w-[min(303px,82vw)] shrink-0 snap-start"><MarketCard m={m} /></div>)}
        </Rail>
      )}

      {/* hakkında + SSS */}
      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-panel p-5">
          <h2 className="mb-2 text-lg font-extrabold">{settings.siteName ?? "SportyBet"}: Spor Bahisleri & Tahminler</h2>
          <p className="text-[14px] leading-relaxed text-subtle">Futbolda maç öncesi oranlar, canlı skorlar ve gündem tahminleri tek hesapta. Kuponun maç bittiği an otomatik sonuçlanır, kazancın beklemeden cüzdanına geçer. Sohbette diğer oyuncularla maçları konuş, yağmur etkinliklerine katıl.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[[`${total.ev}+`, "Bültendeki maç"], [`${live.length}`, "Şu an canlı"], [`${total.pred || markets.length}`, "Tahmin piyasası"]].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-card p-3"><div className="num text-[28px] font-bold text-primary">{v}</div><div className="text-[12px] font-semibold text-subtle">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-panel p-2">
          <h2 className="px-3 pt-3 pb-2 text-lg font-extrabold">Sık Sorulan Sorular</h2>
          {FAQ.map(([qq, a], i) => (
            <div key={qq} className="border-t border-line/60 first:border-t-0">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 px-3 py-3 text-left text-[14px] font-bold hover:text-primary">
                <span className="flex-1">{qq}</span>
                <span className={`grid size-6 place-items-center rounded-full ${open === i ? "bg-primary/15 text-primary" : "bg-card text-subtle"}`}><I n={open === i ? "minus" : "plus"} className="size-3.5" /></span>
              </button>
              {open === i && <p className="px-3 pb-3 text-[13px] leading-relaxed text-subtle">{a}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
