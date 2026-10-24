import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, asset } from "./api";
import { I } from "./lib";
import { MarketCard } from "./predictions";
import { useBanners, BLink } from "./CmsSlot";

/* =====================================================================
 * Anasayfa — gamdom.com düzeni. Her parça backoffice CMS'ten yönetilir:
 *  - Banner grupları: home-hero (büyük kartlar), home-category (kategori kartları)
 *  - Ayar "home_layout": bölüm sırası / açık-kapalı / başlık / ikon, arama metni, SEO metni, SSS
 * ===================================================================== */

export type HomeSection = { key: string; on: boolean; title?: string; icon?: string; limit?: number };
export const HOME_DEFAULTS = {
  sections: [
    { key: "hero", on: true },
    { key: "categories", on: true },
    { key: "search", on: true, title: "{n} maç içinde takım veya lig ara" },
    { key: "live", on: true, title: "Canlı Maçlar", icon: "/img/ic-live.svg", limit: 12 },
    { key: "featured", on: true, title: "Öne Çıkan Maçlar", icon: "/img/ic-flame.svg", limit: 12 },
    { key: "leagues", on: true, title: "Popüler Ligler", icon: "/img/ic-trophy.svg", limit: 16 },
    { key: "predictions", on: true, title: "Popüler Tahminler", icon: "/img/ic-chart.svg", limit: 12 },
    { key: "seo", on: true },
    { key: "faq", on: true, title: "Sık Sorulan Sorular" },
  ] as HomeSection[],
  seoTitle: "SportyBet: Spor Bahisleri & Tahminler",
  seoHtml: "<p>Futbolda maç öncesi oranlar, canlı skorlar ve gündem tahminleri tek hesapta. Kuponun maç bittiği an otomatik sonuçlanır, kazancın beklemeden cüzdanına geçer.</p><h3>Canlı Bahis</h3><p>Maç oynanırken oranlar anlık güncellenir; skor, dakika ve istatistikleri maç sayfasından takip edebilirsin.</p><h3>Tahminler</h3><p>Ekonomi, gündem ve spor üzerine açılan piyasalarda Evet/Hayır paylarını al, fiyat değiştikçe sat ya da sonucu bekle.</p>",
  faq: [
    { q: "Nasıl üye olurum?", a: "Sağ üstteki Kayıt ol butonuna bas, kullanıcı adı ve şifreni belirle. Hesabın anında açılır." },
    { q: "Para yatırma ve çekme ne kadar sürer?", a: "Talepler finans ekibimiz tarafından sırayla işlenir; onaylanan yatırım bakiyene anında, çekim ise ödeme yöntemine göre kısa sürede hesabına geçer." },
    { q: "Kuponum ne zaman sonuçlanır?", a: "Maç bittiğinde sonuç bültenden otomatik okunur ve kazancın cüzdanına yatar." },
    { q: "Bonus cüzdanı nedir?", a: "Bonuslar ayrı bir cüzdanda tutulur. Çevrim şartı tamamlanınca bonus bakiyen Ana Para'ya aktarılır." },
    { q: "Sorumlu oyun", a: "Bahis yalnızca 18 yaş üstü içindir. Kendine limit koy, kaybını kovalama; ihtiyaç duyarsan destek ekibimizle iletişime geç." },
  ] as { q: string; a: string }[],
};

function useHomeLayout() {
  const [cfg, setCfg] = useState(HOME_DEFAULTS);
  useEffect(() => {
    api("/api/cms/settings/home_layout").then((v) => {
      if (!v || typeof v !== "object") return;
      // kayıtlı sırayı koru, yeni eklenen varsayılan bölümleri sona ekle
      const saved: HomeSection[] = Array.isArray(v.sections) ? v.sections : [];
      const keys = new Set(saved.map((s) => s.key));
      const sections = [...saved.map((s) => ({ ...HOME_DEFAULTS.sections.find((d) => d.key === s.key), ...s })), ...HOME_DEFAULTS.sections.filter((d) => !keys.has(d.key))];
      setCfg({ ...HOME_DEFAULTS, ...v, sections, faq: Array.isArray(v.faq) ? v.faq : HOME_DEFAULTS.faq });
    }).catch(() => {});
  }, []);
  return cfg;
}

function useNow() { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(t); }, []); return n; }
function Countdown({ to }: { to: string }) {
  const now = useNow(); const ms = Math.max(0, new Date(to).getTime() - now);
  if (!ms) return null;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  return (
    <span className="rounded-[10px] border border-caution/25 bg-[rgba(19,26,34,.82)] px-3 py-1.5 text-[13px] font-bold text-caution backdrop-blur-sm tabular-nums sm:text-[14px]">
      Bitişe {d > 0 ? `${d} g ` : ""}{h} s {m} d {s} sn
    </span>
  );
}

/* ---------- yatay kaydırıcı + gamdom ok grubu ---------- */
function useRail() {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: true, r: false });
  const upd = () => { const el = ref.current; if (!el) return; setEdge({ l: el.scrollLeft < 4, r: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 }); };
  useEffect(() => { upd(); const el = ref.current; el?.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); return () => { el?.removeEventListener("scroll", upd); window.removeEventListener("resize", upd); }; }, []);
  const by = (d: number) => { const el = ref.current; if (el) el.scrollBy({ left: d * el.clientWidth * 0.9, behavior: "smooth" }); };
  return { ref, edge, by, upd };
}
const ArrowL = () => <svg viewBox="0 0 20 20" className="size-5" fill="currentColor"><path d="M13 4.5v11a.6.6 0 0 1-.95.5L5.4 10.5a.6.6 0 0 1 0-1L12.05 4a.6.6 0 0 1 .95.5z" /></svg>;
const ArrowR = () => <svg viewBox="0 0 20 20" className="size-5" fill="currentColor"><path d="M7 4.5v11a.6.6 0 0 0 .95.5l6.65-5.5a.6.6 0 0 0 0-1L7.95 4A.6.6 0 0 0 7 4.5z" /></svg>;
function Arrows({ rail }: { rail: ReturnType<typeof useRail> }) {
  return (
    <div className="ml-auto flex shrink-0">
      <button onClick={() => rail.by(-1)} disabled={rail.edge.l} aria-label="Önceki" className="arrow-l"><ArrowL /></button>
      <button onClick={() => rail.by(1)} disabled={rail.edge.r} aria-label="Sonraki" className="arrow-r"><ArrowR /></button>
    </div>
  );
}
function Section({ s, to, children, n }: { s: HomeSection; to?: string; children: React.ReactNode; n: number }) {
  const rail = useRail();
  useEffect(() => { rail.upd(); }, [n]);
  return (
    <section className="mt-7 sm:mt-9">
      <div className="mb-3 flex items-center gap-3 sm:mb-4">
        {s.icon && <img src={asset(s.icon)} alt="" className="size-8 shrink-0 object-contain" />}
        {to ? <Link to={to} className="h-sec min-w-0 truncate hover:text-primary">{s.title}</Link> : <h2 className="h-sec min-w-0 truncate">{s.title}</h2>}
        <Arrows rail={rail} />
      </div>
      <div ref={rail.ref} className="no-scrollbar -mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 sm:-mx-4 sm:scroll-px-4 sm:gap-4 sm:px-4">{children}</div>
    </section>
  );
}

/* ---------- hero bannerları (home-hero) ---------- */
function HeroBanners() {
  const list = useBanners("home-hero");
  const rail = useRail();
  useEffect(() => { rail.upd(); }, [list?.length]);
  if (list === null) return <div className="aspect-[344/288] animate-pulse rounded-2xl bg-card md:aspect-[21/8]" />;
  if (!list.length) return null;
  const many = list.length > 1;
  return (
    <section className="relative">
      <div ref={rail.ref} className="no-scrollbar -mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 sm:-mx-4 sm:scroll-px-4 sm:gap-4 sm:px-4">
        {list.map((b) => (
          <BLink key={b.id} to={b.linkUrl} className={`relative isolate block shrink-0 snap-start overflow-hidden rounded-2xl ${many ? "w-full md:w-[calc((100%-16px)/2)] xl:w-[calc((100%-32px)/3)]" : "w-full"}`}>
            <div className="group relative aspect-[344/288] w-full" style={{ background: b.bgColor || "#131a22" }}>
              {b.imageUrl && <img src={asset(b.imageUrl)} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
              {b.badge && <span className="absolute left-3 top-3 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-bold text-primary-fg">{b.badge}</span>}
              {b.endsAt && <div className="absolute inset-x-0 top-[26px] flex justify-center"><Countdown to={b.endsAt} /></div>}
              <div className="absolute inset-x-0 bottom-0 px-5 pb-[34px] text-center">
                {b.subtitle && <div className="mb-1 text-[12px] font-bold text-white/75">{b.subtitle}</div>}
                <div className="text-[28px] font-bold leading-[1.2] text-white [text-shadow:0_2px_12px_rgba(0,0,0,.35)]">{b.title}</div>
                {b.highlight && <div className="text-[28px] font-bold leading-[1.2] text-caution [text-shadow:0_2px_12px_rgba(0,0,0,.25)]">{b.highlight}</div>}
                {b.ctaText && <span className="btn btn-primary mt-3">{b.ctaText}</span>}
              </div>
            </div>
          </BLink>
        ))}
      </div>
      {many && (
        <div className="pointer-events-none absolute inset-y-0 -left-1 -right-1 hidden items-center justify-between md:flex">
          <button onClick={() => rail.by(-1)} disabled={rail.edge.l} aria-label="Önceki" className="arrow-l pointer-events-auto rounded-lg disabled:opacity-0"><ArrowL /></button>
          <button onClick={() => rail.by(1)} disabled={rail.edge.r} aria-label="Sonraki" className="arrow-r pointer-events-auto rounded-lg disabled:opacity-0"><ArrowR /></button>
        </div>
      )}
    </section>
  );
}

/* ---------- kategori kartları (home-category) ---------- */
function CategoryCards({ counts }: { counts: Record<string, number> }) {
  const list = useBanners("home-category");
  if (!list?.length) return null;
  return (
    <section className={`mt-3 grid gap-3 sm:mt-4 sm:gap-4 ${list.length >= 3 ? "md:grid-cols-3" : list.length === 2 ? "md:grid-cols-2" : ""}`}>
      {list.map((b) => {
        const sub = (b.subtitle ?? "").replace(/\{(\w+)\}/g, (_: string, k: string) => String(counts[k] ?? ""));
        return (
          <BLink key={b.id} to={b.linkUrl} className="group relative isolate block h-[105px] overflow-hidden rounded-2xl sm:h-[128px]">
            <div className="absolute inset-0 -z-20" style={{ background: b.bgColor || "#131a22" }} />
            {b.imageUrl && <img src={asset(b.imageUrl)} alt="" className="absolute inset-y-0 right-0 -z-10 h-full w-[78%] object-cover object-right transition-transform duration-300 group-hover:scale-[1.04]" />}
            <div className="flex h-full flex-col justify-center gap-[18px] px-5 sm:px-6">
              {sub && <span className="text-[12px] font-bold text-white/75">{sub}</span>}
              <span className="text-[28px] font-bold leading-none text-white">{b.title}</span>
            </div>
            {b.badge && <span className="absolute right-3 top-3 rounded-lg bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-fg">{b.badge}</span>}
          </BLink>
        );
      })}
    </section>
  );
}

function Logo({ src, name, size = "size-7" }: { src?: string; name: string; size?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-bold text-soft`}>{name.slice(0, 1)}</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className={`${size} shrink-0 object-contain`} />;
}

/** Maç kartı — gamdom sportsbook öne çıkan kartı: lig satırı, koyu takım bloğu, 1-X-2 */
function MatchCard({ ev, live }: { ev: any; live?: boolean }) {
  const m1 = (ev.markets ?? []).find((m: any) => m.key === "1x2");
  const o = (c: string) => m1?.selections.find((s: any) => s.code === c)?.odds;
  const d = new Date(ev.startsAt);
  return (
    <Link to={`/spor/mac/${ev.id}`} className="lift w-[300px] shrink-0 snap-start rounded-2xl bg-card-blue p-3 sm:w-[322px]">
      <div className="mb-2.5 flex items-center gap-2 text-[12px] font-medium text-subtle">
        {ev.leagueLogo ? <img src={ev.leagueLogo} alt="" className="size-4 object-contain" /> : <I n="ball" className="size-4" />}
        <span className="min-w-0 flex-1 truncate">{ev.league}</span>
        {live ? <span className="flex items-center gap-1.5 font-bold text-white"><span className="live-dot size-1.5 rounded-full bg-live" />{ev.minute ? `${ev.minute}'` : "Canlı"}</span>
          : <span>{d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })} · {d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <div className="mb-2.5 space-y-2 rounded-xl2 bg-[#0b1720] px-3 py-2.5">
        {[[ev.home, ev.homeLogo, ev.score?.h], [ev.away, ev.awayLogo, ev.score?.a]].map(([n, l, g]: any) => (
          <div key={n} className="flex items-center gap-2.5">
            <Logo src={l} name={n} size="size-6" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">{n}</span>
            {live && <span className="grid h-6 min-w-6 place-items-center rounded-md bg-card-2 px-1 text-[13px] font-bold tabular-nums">{g ?? 0}</span>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[["1", "HOME"], ["X", "DRAW"], ["2", "AWAY"]].map(([l, c]) => (
          <span key={c} className="odd h-10"><span className="l">{l}</span><span className="o">{o(c)?.toFixed(2) ?? "-"}</span></span>
        ))}
      </div>
    </Link>
  );
}

export default function Home() {
  const cfg = useHomeLayout();
  const nav = useNavigate();
  const [markets, setMarkets] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [live, setLive] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [q, setQ] = useState(""); const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    api("/api/predictions?homepage=true&limit=12").then((r) => { const d = r.data?.length ? r.data : null; if (d) setMarkets(d); else api("/api/predictions?limit=12").then((r2) => setMarkets(r2.data ?? [])).catch(() => {}); }).catch(() => {});
    api("/api/sb/events?limit=60").then((r) => setEvents(Array.isArray(r) ? r : [])).catch(() => {});
    api("/api/sb/live").then((r) => setLive(Array.isArray(r) ? r : [])).catch(() => {});
    api("/api/sb/leagues").then((r) => setLeagues(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);
  const featured = [...events.filter((e) => e.featured), ...events.filter((e) => !e.featured)];
  const counts = { maclar: events.length, canli: live.length, ligler: leagues.length, tahminler: markets.length };

  const render = (s: HomeSection) => {
    if (!s.on) return null;
    const lim = s.limit ?? 12;
    switch (s.key) {
      case "hero": return <HeroBanners key="hero" />;
      case "categories": return <CategoryCards key="cat" counts={counts} />;
      case "search": return (
        <form key="search" onSubmit={(e) => { e.preventDefault(); nav(`/spor${q.trim() ? `?ara=${encodeURIComponent(q.trim())}` : ""}`); }} className="mt-7 sm:mt-8">
          <label className="flex h-11 items-center gap-1.5 rounded-[10px] bg-card px-3 focus-within:ring-1 focus-within:ring-primary/60">
            <I n="search" className="size-5 shrink-0 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={(s.title ?? "").replace("{n}", String(events.length))} className="w-full bg-transparent text-[14px] font-medium leading-[14px] outline-none placeholder:text-subtle" />
          </label>
        </form>
      );
      case "live": return live.length > 0 && <Section key="live" s={s} to="/spor?page=live" n={live.length}>{live.slice(0, lim).map((ev) => <MatchCard key={ev.id} ev={ev} live />)}</Section>;
      case "featured": return featured.length > 0 && <Section key="feat" s={s} to="/spor" n={featured.length}>{featured.slice(0, lim).map((ev) => <MatchCard key={ev.id} ev={ev} />)}</Section>;
      case "leagues": return leagues.length > 0 && (
        <Section key="lg" s={s} to="/spor" n={leagues.length}>
          {leagues.slice(0, lim).map((l) => (
            <Link key={l.id} to={`/spor?lig=${l.id}`} className="lift flex h-[100px] w-[160px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl bg-card px-3 sm:h-[120px] sm:w-[180px]">
              {l.logo ? <img src={l.logo} alt="" loading="lazy" className="size-11 object-contain" /> : <I n="ball" className="size-9 text-subtle" />}
              <span className="w-full truncate text-center text-[13px] font-medium text-subtle">{l.name}</span>
            </Link>
          ))}
        </Section>
      );
      case "predictions": return markets.length > 0 && <Section key="pred" s={s} to="/tahminler" n={markets.length}>{markets.slice(0, lim).map((m) => <div key={m.id} className="w-[min(303px,82vw)] shrink-0 snap-start"><MarketCard m={m} /></div>)}</Section>;
      case "seo": return (cfg.seoTitle || cfg.seoHtml) && (
        <section key="seo" className="mt-12 rounded-2xl bg-panel p-5 sm:p-6">
          {cfg.seoTitle && <h1 className="mb-2 text-[14px] font-bold text-white">{cfg.seoTitle}</h1>}
          <div className="cms-content seo-text" dangerouslySetInnerHTML={{ __html: cfg.seoHtml }} />
        </section>
      );
      case "faq": return cfg.faq.length > 0 && (
        <section key="faq" className="mt-4 rounded-2xl bg-panel p-2 sm:p-3">
          <h2 className="px-3 pt-3 pb-2 text-[18px] font-bold">{s.title}</h2>
          {cfg.faq.map((f, i) => (
            <div key={i} className="border-t border-line first:border-t-0">
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center gap-3 px-3 py-3.5 text-left text-[16px] font-bold hover:text-primary">
                <span className="flex-1">{f.q}</span>
                <I n="down" className={`size-4 shrink-0 text-subtle transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="px-3 pb-4 text-[14px] leading-relaxed text-subtle">{f.a}</p>}
            </div>
          ))}
        </section>
      );
      default: return null;
    }
  };
  return <div className="animate-sports-fade">{cfg.sections.map(render)}</div>;
}
