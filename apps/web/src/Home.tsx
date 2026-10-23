import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { I, pct, useStore } from "./lib";
import { MarketCard } from "./predictions";

/* Dekoratif orijinal çizimler */
const BallArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" aria-hidden className={className}>
    <defs><radialGradient id="sb-ball" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#c9d2e3" /></radialGradient></defs>
    <circle cx="100" cy="100" r="96" fill="url(#sb-ball)" />
    <polygon points="100,62 136,88 122,130 78,130 64,88" fill="#17171a" />
    <g stroke="#17171a" strokeWidth="5" fill="none"><path d="M100 62V20M136 88l40-12M122 130l26 34M78 130l-26 34M64 88 24 76" /></g>
  </svg>
);
const SlipArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" aria-hidden className={className}>
    <rect x="20" y="36" width="160" height="150" rx="12" fill="#2b2b31" />
    <rect x="20" y="36" width="160" height="36" rx="12" fill="#3c3c44" />
    <rect x="56" y="50" width="88" height="8" rx="4" fill="#9b9ba4" />
    <rect x="36" y="92" width="74" height="26" rx="6" fill="#2fd476" /><rect x="110" y="92" width="54" height="26" rx="6" fill="#232328" />
    <rect x="36" y="130" width="46" height="26" rx="6" fill="#232328" /><rect x="90" y="130" width="74" height="26" rx="6" fill="#f6383a" />
  </svg>
);
const BasketArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" aria-hidden className={className}>
    <defs><radialGradient id="sb-bask" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stopColor="#ffb057" /><stop offset="1" stopColor="#c2410c" /></radialGradient></defs>
    <circle cx="100" cy="100" r="96" fill="url(#sb-bask)" />
    <g fill="none" stroke="#1c1917" strokeWidth="5"><path d="M4 100h192M100 4v192" /><path d="M30 30c30 30 30 110 0 140M170 30c-30 30-30 110 0 140" /></g>
  </svg>
);
const BoxArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" aria-hidden className={className}>
    <rect x="30" y="80" width="140" height="96" rx="10" fill="#e8d3a6" />
    <rect x="30" y="80" width="140" height="26" rx="10" fill="#f5e6c4" />
    <rect x="86" y="88" width="28" height="10" rx="4" fill="#3f2d14" />
    <rect x="76" y="28" width="48" height="40" rx="5" fill="#fff" transform="rotate(-8 100 48)" />
  </svg>
);

function CmsBanners() {
  const [items, setItems] = useState<any[]>([]); const [i, setI] = useState(0);
  const platform = window.innerWidth < 768 ? "mobile" : "web";
  useEffect(() => { api(`/api/cms/banners?group=homepage-hero&platform=${platform}`).then(setItems).catch(() => {}); }, []);
  useEffect(() => { if (items.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % items.length), 6000); return () => clearInterval(t); }, [items.length]);
  if (!items.length) return null;
  return (
    <section className="relative mt-4 overflow-hidden rounded-lg">
      {items.map((b, j) => (
        <a key={b.id} href={b.linkUrl || "#"} className={`${j === i ? "block" : "hidden"} animate-sports-fade`}>
          <img src={b.imageUrl} alt={b.title} className="w-full object-cover" />
        </a>
      ))}
      {items.length > 1 && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {items.map((_, j) => <button key={j} onClick={() => setI(j)} className={`h-1.5 rounded-full transition-all ${j === i ? "w-5 bg-primary" : "w-1.5 bg-white/40"}`} />)}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const { me, setAuthOpen, settings } = useStore();
  const [markets, setMarkets] = useState<any[]>([]);
  const [sbEvents, setSbEvents] = useState<any[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api("/api/predictions?homepage=true&limit=12").then((r) => { const d = r.data?.length ? r.data : null; if (d) setMarkets(d); else api("/api/predictions?limit=12").then((r2) => setMarkets(r2.data ?? [])).catch(() => {}); }).catch(() => {});
    api("/api/sb/events?limit=6").then((r) => setSbEvents(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);
  const top = markets[0];
  const scrollBy = (dir: number) => scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  return (
    <div className="animate-sports-fade">
      {/* HERO */}
      <section className="relative isolate overflow-hidden rounded-lg bg-[linear-gradient(115deg,#140d08_0%,#1f140b_45%,#2f1c0c_100%)] max-lg:min-h-[400px] lg:h-[337px]">
        <div className="absolute top-0 left-1/2 -z-10 h-56 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,190,123,0.35),transparent)] blur-2xl" />
        <BallArt className="absolute -bottom-10 -left-8 -z-10 h-[290px] rotate-[-12deg] max-lg:top-2 max-lg:left-[-70px] max-lg:h-[190px] max-lg:opacity-70" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-10 text-center">
          <h1 className="max-w-[560px] text-3xl leading-tight font-extrabold lg:text-4xl">{me ? <>Hoş geldin, <span className="text-primary">{me.username}</span></> : <>Maçı Oyna, Gündemi Tahmin Et</>}</h1>
          <p className="mt-3 max-w-[460px] text-[15px] font-medium text-muted">Canlı bahis, maç öncesi oranlar ve tahmin pazarları tek yerde.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link to="/spor?page=live" className="inline-flex h-[46px] items-center gap-2 rounded-lg bg-primary px-6 text-sm font-extrabold text-primary-fg transition-colors hover:bg-primary-hover"><I n="live" className="size-4" />Canlı Bahis</Link>
            <Link to="/tahminler" className="inline-flex h-[46px] items-center gap-2 rounded-lg bg-elevated px-6 text-sm font-extrabold transition-colors hover:bg-elevated-hover"><I n="vote" className="size-4" />Tahminler</Link>
            {!me && <button onClick={() => setAuthOpen("register")} className="inline-flex h-[46px] items-center rounded-lg border border-primary/50 px-6 text-sm font-extrabold text-primary transition-colors hover:bg-primary/10">Hemen Kayıt Ol</button>}
          </div>
        </div>
        {/* sağda yüzen mini tahmin kartı */}
        {top && (
          <Link to={`/tahminler/${top.slug}`} className="animate-float absolute right-8 top-1/2 hidden w-[220px] -translate-y-1/2 rotate-2 rounded-xl border border-line-strong bg-panel/90 p-3 shadow-[0_24px_60px_rgba(0,0,0,.5)] backdrop-blur lg:block">
            <div className="line-clamp-2 text-xs font-bold text-muted">{top.question}</div>
            <div className="mt-2 space-y-1.5">
              <div className="rounded-md bg-win px-2.5 py-1.5 text-xs font-extrabold text-[#06130c]">{top.outcomes[0]?.name} %{Math.round(top.outcomes[0]?.probability ?? 0)}</div>
              <div className="w-[86%] rounded-md bg-loss px-2.5 py-1.5 text-xs font-extrabold text-white">{top.outcomes[1]?.name} %{Math.round(top.outcomes[1]?.probability ?? 0)}</div>
            </div>
          </Link>
        )}
        <div className="absolute bottom-6 left-10 hidden rotate-[-3deg] rounded-lg bg-panel/90 px-3 py-2 shadow-lg backdrop-blur lg:flex lg:items-center lg:gap-2">
          <span className="text-[10px] font-extrabold tracking-wide text-subtle uppercase">MS 1</span>
          <span className="text-lg font-extrabold text-fg">2.15</span>
          <span className="grid size-5 place-items-center rounded-full bg-win text-[#06130c]"><I n="check" className="size-3" /></span>
        </div>
      </section>

      {/* Spor / Tahminler kartları */}
      <section className="mt-6 grid grid-cols-2 gap-2 lg:gap-4">
        {[
          { to: "/spor", label: "Spor", grad: "linear-gradient(180deg,#1b1a2a 0%,#5a2e10 100%)", Art: BasketArt },
          { to: "/tahminler", label: "Tahminler", grad: "linear-gradient(180deg,#0f1a33 0%,#1d3c78 100%)", Art: BoxArt },
        ].map(({ to, label, grad, Art }) => (
          <Link key={to} to={to} className="group overflow-hidden rounded-[3px] bg-card-2 outline-none focus-visible:outline-2 focus-visible:outline-primary">
            <div className="relative flex h-11 items-end justify-center overflow-hidden lg:h-[118px]" style={{ background: grad }}>
              <div className="translate-y-[45%] transition-transform duration-300 group-hover:translate-y-[38%]"><Art className="size-20 lg:size-[200px]" /></div>
            </div>
            <div className="flex h-8 items-center justify-between px-2.5 lg:h-[46px] lg:px-4">
              <span className="text-xs font-semibold lg:text-[15px]">{label}</span>
              <I n="right" className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </section>

      {/* Arama */}
      <section className="mt-4 flex gap-2">
        <Link to="/tahminler" className="flex h-[52px] min-w-0 flex-1 cursor-text items-center gap-3 rounded-[5px] border border-line-strong bg-field px-4 text-left transition-colors hover:border-subtle">
          <I n="search" className="size-5 shrink-0 text-subtle" />
          <span className="flex-1 truncate text-[15px] font-medium text-subtle">{settings.siteName ?? "SportyBet"}'te Ara</span>
        </Link>
      </section>

      <CmsBanners />

      {/* Tahminlere Göz At */}
      {markets.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><I n="vote" className="size-5 text-muted" />Tahminlere Göz At</h2>
            <div className="flex gap-2">
              <button onClick={() => scrollBy(-1)} aria-label="Önceki" className="grid size-7 cursor-pointer place-items-center rounded-full border border-line-strong bg-card text-muted transition-colors hover:text-fg"><I n="left" className="size-4" /></button>
              <button onClick={() => scrollBy(1)} aria-label="Sonraki" className="grid size-7 cursor-pointer place-items-center rounded-full border border-line-strong bg-card text-muted transition-colors hover:text-fg"><I n="right" className="size-4" /></button>
            </div>
          </div>
          <div ref={scroller} className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4">
            {markets.map((m) => <div key={m.id} className="w-[min(303px,80vw)] shrink-0 snap-start"><MarketCard m={m} /></div>)}
          </div>
          <div className="mt-4 flex justify-center">
            <Link to="/tahminler" className="inline-flex h-10 items-center rounded-full border border-line-strong bg-card px-5 text-sm font-bold text-muted transition-colors hover:text-fg">Daha Fazla Gör</Link>
          </div>
        </section>
      )}

      {/* Günün Maçları (kendi sportsbook motorumuz) */}
      {sbEvents.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><I n="ball" className="size-5 text-primary" />Günün Maçları</h2>
            <Link to="/spor" className="flex items-center gap-1 text-sm font-bold text-subtle hover:text-fg">Tümü <I n="right" className="size-4" /></Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sbEvents.map((ev: any) => {
              const m1 = (ev.markets ?? []).find((m: any) => m.key === "1x2");
              const o = (code: string) => m1?.selections.find((s: any) => s.code === code)?.odds;
              return (
                <Link key={ev.id} to="/spor" className="rounded-lg border border-line bg-card p-3 transition-colors hover:border-primary/50">
                  <div className="mb-1 text-[11px] font-bold text-subtle">{ev.league} · {new Date(ev.startsAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="truncate text-sm font-bold">{ev.home}</div>
                  <div className="mb-2 truncate text-sm font-bold">{ev.away}</div>
                  {m1 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {[["1", "HOME"], ["X", "DRAW"], ["2", "AWAY"]].map(([lab, code]) => (
                        <span key={code} className="rounded-md bg-field py-1.5 text-center"><span className="block text-[9px] font-extrabold text-dim">{lab}</span><span className="block text-xs font-extrabold">{o(code)?.toFixed(2) ?? "-"}</span></span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
