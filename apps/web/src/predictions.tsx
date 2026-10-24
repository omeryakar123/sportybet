import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { Avatar, Btn, RankBadge, Empty, ErrBox, I, Spinner, inp, money, money0, pct, timeLeft, useStore, scrollMain } from "./lib";
import { BannerSlot } from "./CmsSlot";
import { Pager, Tabs, PageTitle } from "./g";

const PLACE = (q: string) => {
  const hues = [[28, 60], [210, 55], [150, 45], [330, 45], [260, 50]];
  const [h, s] = hues[(q.charCodeAt(0) + q.length) % hues.length];
  return { background: `linear-gradient(135deg, hsl(${h} ${s}% 22%), hsl(${h + 30} ${s}% 12%))` };
};
export function MarketImg({ m, className }: { m: any; className: string }) {
  return m.image
    ? <img src={m.image} alt="" loading="lazy" className={`${className} shrink-0 rounded-md object-cover`} />
    : <div className={`${className} grid shrink-0 place-items-center rounded-md text-primary/80`} style={PLACE(m.question)}><I n="hash" className="size-[45%]" /></div>;
}

/** Evet/Hayır (2 sonuç) veya çok sonuçlu kart gövdesi */
export function OutcomeButtons({ m, compact }: { m: any; compact?: boolean }) {
  const nav = useNavigate();
  const outs = m.outcomes ?? [];
  const yesNo = outs.length === 2 && outs.some((o: any) => /evet|yes/i.test(o.name));
  const go = (o: any) => nav(`/tahminler/${m.slug}?secim=${o.id}`);
  if (outs.length === 2) {
    const [a, b] = yesNo ? [outs.find((o: any) => /evet|yes/i.test(o.name)), outs.find((o: any) => !/evet|yes/i.test(o.name))] : outs;
    return (
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => go(a)} disabled={!a.buyEnabled} className="grid h-10 shrink-0 cursor-pointer place-items-center rounded-sm bg-[#294c4c] text-center text-sm font-bold text-win transition-colors hover:bg-[#00ae61] hover:text-white disabled:cursor-default disabled:opacity-50">
          {a.name} · {pct(a.probability)}
        </button>
        <button onClick={() => go(b)} disabled={!b.buyEnabled} className="grid h-10 shrink-0 cursor-pointer place-items-center rounded-sm bg-[#1d3a4a] text-center text-sm font-bold text-loss transition-colors hover:bg-loss hover:text-white disabled:cursor-default disabled:opacity-50">
          {b.name} · {pct(b.probability)}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {outs.slice(0, compact ? 3 : outs.length).map((o: any) => (
        <button key={o.id} onClick={() => go(o)} className="flex w-full cursor-pointer items-center justify-between rounded-sm bg-elevated/60 px-2.5 py-1.5 text-left transition-colors hover:bg-elevated">
          <span className="truncate text-[13px] font-semibold text-muted">{o.name}</span>
          <span className="ml-2 shrink-0 text-[13px] font-extrabold text-primary">{Math.round(o.probability)}%</span>
        </button>
      ))}
      {compact && outs.length > 3 && <div className="px-1 text-[11px] font-semibold text-dim">+{outs.length - 3} seçenek daha</div>}
    </div>
  );
}

export function SaveBtn({ m }: { m: any }) {
  const { me, setAuthOpen } = useStore();
  const [saved, setSaved] = useState(Boolean(m.isSaved));
  return (
    <button aria-label="Kaydet" onClick={async () => { if (!me) return setAuthOpen(true); const r = await api(`/api/predictions/${m.id}/save`, { method: "POST", json: {} }); setSaved(r.data.isSaved); }}
      className={`grid size-7 cursor-pointer place-items-center rounded-md transition-colors ${saved ? "text-primary" : "text-dim hover:text-fg"}`}>
      <svg viewBox="0 0 24 24" className="size-4" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M6 3h12v18l-6-4.5L6 21Z" /></svg>
    </button>
  );
}

export function MarketCard({ m }: { m: any }) {
  const locked = m.status === "locked" || !m.effectiveBuyEnabled;
  return (
    <article className="relative flex h-full min-h-[175px] flex-col justify-between gap-2.5 rounded-md border border-line bg-card px-3 py-2.5 transition-all hover:-translate-y-px hover:bg-surface-hover">
      <div className="flex items-start gap-3">
        <MarketImg m={m} className="size-10" />
        <Link to={`/tahminler/${m.slug}`} className="line-clamp-2 flex-1 text-sm leading-snug font-bold text-white hover:underline">{m.question}</Link>
      </div>
      <div className="mt-auto">
        {m.structure === "GROUP_PARENT" ? (
          <Link to={`/tahminler/${m.slug}`} className="grid h-10 place-items-center rounded-sm bg-elevated text-sm font-bold text-muted transition-colors hover:bg-elevated-hover hover:text-fg">
            {(m.subMarkets?.length ?? 0) || ""} alt piyasa · Görüntüle
          </Link>
        ) : <OutcomeButtons m={m} compact />}
      </div>
      <div className="flex items-center justify-between text-sm font-medium text-subtle">
        <span className="flex items-center gap-1 text-[13px] font-bold text-primary"><I n="spark" className="size-3.5" />{m.totalVolume > 0 ? money(m.totalVolume) : "YENİ"}</span>
        <span className="flex items-center gap-2">
          {locked && <span className="rounded-sm bg-caution/15 px-1.5 py-0.5 text-[10px] font-extrabold text-caution">{m.status === "locked" ? "Kilitli" : "Kapalı"}</span>}
          <span className="flex items-center gap-1 text-[12px]"><I n="clock" className="size-3.5" />{timeLeft(m.deadline)}</span>
          <SaveBtn m={m} />
        </span>
      </div>
    </article>
  );
}

// ---------------- Liste sayfası ----------------
export function PredictionsPage() {
  const { predCats } = useStore();
  const [sp, setSp] = useSearchParams();
  const cat = sp.get("kategori") ?? "";
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("default");
  const [saved, setSaved] = useState(false);
  const total = predCats.reduce((a, c) => a + (c.activeCount ?? 0), 0);
  useEffect(() => { setPage(1); }, [cat, search, sort, saved]);
  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: "24", sort, ...(cat ? { category: cat } : {}), ...(search ? { search } : {}), ...(saved ? { saved: "true" } : {}) });
    api(`/api/predictions?${q}`).then(setData).catch(() => setData({ data: [], pagination: { totalPages: 1 } }));
  }, [cat, page, search, sort, saved]);
  const nav = useNavigate();
  const [sortOpen, setSortOpen] = useState(false);
  const SORTS: [string, string][] = [["default", "Öne çıkanlar"], ["volume", "Hacme göre"], ["deadline", "Yaklaşan"], ["new", "Yeni"]];
  const tab = saved ? "__saved" : cat;
  const tabs: [string, string][] = [["", "Lobi"], ["__saved", "Kaydettiklerim"], ...predCats.filter((c) => c.activeCount > 0).map((c) => [c.slug, c.name] as [string, string])];
  const pickRandom = () => { const l = data?.data ?? []; if (l.length) nav(`/tahminler/${l[Math.floor(Math.random() * l.length)].slug}`); };
  return (
    <div className="animate-sports-fade">
      {/* gamdom casino lobisi düzeni: üst banner şeridi → sekmeler → arama → sıralama + rastgele */}
      <BannerSlot group="predictions-top" className="mb-4" />
      <Tabs tabs={tabs} value={tab} onChange={(v) => { if (v === "__saved") { setSaved(true); setSp({}); } else { setSaved(false); setSp(v ? { kategori: v } : {}); } }} />
      <label className="mt-4 flex h-11 items-center gap-1.5 rounded-[10px] border border-transparent bg-card px-3 focus-within:border-primary/50">
        <I n="search" className="size-5 shrink-0 text-subtle" />
        <input className="w-full bg-transparent text-[14px] font-medium outline-none placeholder:text-subtle" placeholder={`${total} tahmin içinde ara`} value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1 sm:flex-none">
          <button onClick={() => setSortOpen(!sortOpen)} className="flex h-11 w-full items-center gap-1.5 rounded-[10px] bg-card-2 px-[17px] text-[14px] font-bold sm:w-auto">
            <span className="text-subtle">Sıralama :</span><span className="text-fg">{SORTS.find(([k]) => k === sort)?.[1]}</span><I n="down" className="ml-auto size-4 text-subtle sm:ml-3" />
          </button>
          {sortOpen && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-full min-w-[200px] rounded-xl bg-card-2 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]">
              {SORTS.map(([k, l]) => <button key={k} onClick={() => { setSort(k); setSortOpen(false); }} className={`block w-full rounded-lg px-3 py-2.5 text-left text-[14px] font-bold hover:bg-elevated ${sort === k ? "text-primary" : "text-fg"}`}>{l}</button>)}
            </div>
          )}
        </div>
        <div className="flex">
          <button onClick={pickRandom} className="h-11 rounded-l-lg bg-card px-4 text-[14px] font-bold text-white hover:bg-card-2">Rastgele Seç</button>
          <button onClick={pickRandom} aria-label="Rastgele tahmin" className="ml-0.5 grid h-11 w-14 place-items-center rounded-r-lg bg-card text-white hover:bg-card-2"><I n="grid" className="size-5" /></button>
        </div>
      </div>

      {data?.site?.notice && <div className="mt-4 rounded-[10px] bg-caution/10 px-3 py-2.5 text-[14px] font-bold text-caution">{data.site.notice}</div>}
      {!data ? <Spinner /> : data.data.length === 0 ? <div className="mt-6"><Empty text={saved ? "Henüz tahmin kaydetmedin." : "Bu kategoride açık tahmin yok."} /></div> : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.data.map((m: any) => <MarketCard key={m.id} m={m} />)}
          </div>
          <Pager page={page} pages={data.pagination.totalPages ?? 1} onChange={(n) => { setPage(n); scrollMain(0); }} />
        </>
      )}
    </div>
  );
}
const CatChip = ({ active, onClick, icon, label, count }: any) => (
  <button onClick={onClick} className={`inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-sm font-bold whitespace-nowrap transition-colors ${active ? "border-primary/50 bg-primary/15 text-primary" : "border-line bg-card text-muted hover:text-fg"}`}>
    <I n={icon} className="size-3.5" />{label}<span className={`text-xs font-bold ${active ? "text-primary/70" : "text-dim"}`}>{count}</span>
  </button>
);
function PromoTile({ grad, tag, title, art, to }: any) {
  return (
    <Link to={to} className="relative flex h-[132px] w-[min(390px,calc(100vw-1.5rem))] shrink-0 items-center justify-between overflow-hidden rounded-lg px-5 transition-transform hover:-translate-y-px" style={{ background: grad }}>
      <div>
        <span className="rounded-sm border border-line-strong bg-black/30 px-2 py-0.5 text-[10px] font-extrabold text-muted">{tag}</span>
        <div className="mt-2 text-xl leading-tight font-extrabold">{title}</div>
      </div>
      {art}
    </Link>
  );
}

// ---------------- Detay + al / boz ----------------
export function PredictionDetail() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const { me, setAuthOpen, balance, setWallet, refreshMe } = useStore();
  const [d, setD] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [sel, setSel] = useState<string>("");   // seçili market (grup çocuğu olabilir)
  const [selOut, setSelOut] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState<any>(null);
  const load = () => api(`/api/predictions/${slug}`).then((r) => {
    setD(r);
    const m = r.data;
    const want = sp.get("secim");
    const allOuts = [m, ...(m.subMarkets ?? [])];
    for (const mk of allOuts) { const o = mk.outcomes.find((x: any) => x.id === want); if (o) { setSel(mk.id); setSelOut(o.id); return; } }
    if (m.structure !== "GROUP_PARENT") { setSel(m.id); setSelOut(m.outcomes[0]?.id ?? ""); }
    else if (m.subMarkets?.length) { setSel(m.subMarkets[0].id); setSelOut(m.subMarkets[0].outcomes[0]?.id ?? ""); }
  }).catch(() => setNotFound(true));
  useEffect(() => { setD(null); setDone(null); setErr(""); load(); }, [slug]);
  if (notFound) return <Empty text="Tahmin bulunamadı." />;
  if (!d) return <Spinner />;
  const m = d.data;
  const markets = [m, ...(m.subMarkets ?? [])];
  const cur = markets.find((x: any) => x.id === sel) ?? m;
  const out = cur.outcomes?.find((o: any) => o.id === selOut);
  const price = Number(out?.price ?? 0);
  const payout = price > 0 && Number(amount) > 0 ? Number(amount) / price : 0;
  const activeWallet = me?.activeWallet === "BONUS" ? "BONUS" : "MAIN";
  const resolved = ["resolved", "cancelled"].includes(m.status);
  async function buy() {
    if (!me) return setAuthOpen(true);
    setErr(""); setBusy(true); setDone(null);
    try {
      const r = await api(`/api/predictions/${cur.id}/buy`, { method: "POST", json: { outcomeId: selOut, amount: Number(amount) } });
      setDone(r.data); setAmount(""); await refreshMe(); load();
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  }
  return (
    <div className="animate-sports-fade">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-subtle">
        <Link to="/tahminler" className="hover:text-fg">Tahminler</Link><I n="right" className="size-3.5" />
        {m.categories[0] ? <><Link to={`/tahminler?kategori=${m.categories[0].slug}`} className="hover:text-fg">{m.categories[0].name}</Link><I n="right" className="size-3.5" /></> : null}
        <span className="truncate text-muted">{m.question}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <MarketImg m={m} className="size-14 lg:size-[68px]" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl leading-snug font-extrabold lg:text-2xl">{m.question}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold text-subtle">
                <span className="flex items-center gap-1.5"><I n="spark" className="size-3.5 text-primary" />Hacim {money(m.totalVolume)}</span>
                <span className="flex items-center gap-1.5"><I n="clock" className="size-3.5" />Kapanış: {timeLeft(m.deadline)}</span>
                <SaveBtn m={m} />
              </div>
            </div>
          </div>
          {m.status === "locked" && <div className="mt-4 rounded-md border border-caution/40 bg-caution/10 px-3 py-2.5 text-sm font-semibold text-caution">Bahisler geçici olarak durduruldu{m.metadata?.lockReason ? ` — ${m.metadata.lockReason}` : ""}.</div>}
          {resolved && (
            <div className={`mt-4 rounded-md px-3 py-2.5 text-sm font-bold ${m.status === "cancelled" ? "bg-elevated text-muted" : "border border-win/30 bg-win/10 text-win"}`}>
              {m.status === "cancelled" ? "Bu piyasa iptal edildi, tüm bahisler iade edildi." : `Sonuçlandı — kazanan: ${m.outcomes.find((o: any) => o.isWinner)?.name}`}
            </div>
          )}

          {/* sonuç / alt piyasa listesi */}
          <div className="mt-5 space-y-2">
            {markets.filter((mk: any) => mk.structure !== "GROUP_PARENT" || markets.length === 1).map((mk: any) => (
              <div key={mk.id} className={`rounded-md border bg-card px-3 py-3 transition-colors ${sel === mk.id ? "border-primary/40" : "border-line"}`}>
                {mk.id !== m.id && <div className="mb-2 text-sm font-bold text-muted">{mk.question}</div>}
                <div className={`grid gap-2 ${mk.outcomes.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {mk.outcomes.map((o: any) => {
                    const on = sel === mk.id && selOut === o.id;
                    return (
                      <button key={o.id} onClick={() => { setSel(mk.id); setSelOut(o.id); setDone(null); }} disabled={!o.buyEnabled}
                        className={`flex h-12 cursor-pointer items-center justify-between rounded-md border px-3 transition-colors disabled:cursor-default disabled:opacity-40 ${on ? "border-primary bg-primary/15" : "border-line-strong bg-elevated/50 hover:bg-elevated"}`}>
                        <span className="flex items-center gap-2 truncate text-sm font-bold">
                          {o.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
                          {o.name}{o.isWinner && <I n="trophy" className="ml-1 inline size-4 text-caution" />}
                        </span>
                        <span className={`shrink-0 text-sm font-extrabold ${on ? "text-primary" : "text-odds"}`}>{Math.round(o.probability)}% <span className="text-xs font-bold text-dim">({(1 / Number(o.price)).toFixed(2)}x)</span></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* pozisyonlarım */}
          {me && (d.data.myPositions ?? []).length > 0 && <MyPositions positions={d.data.myPositions} markets={markets} onChange={() => { load(); refreshMe(); }} />}

          {m.rules && (
            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><I n="list" className="size-5 text-primary" />Kurallar</h2>
              <div className="cms-content rounded-lg border border-line bg-card px-4 py-1" dangerouslySetInnerHTML={{ __html: m.rules }} />
            </section>
          )}
        </div>

        {/* satın alma kuponu */}
        <aside className="h-fit lg:sticky lg:top-4">
          <div className="animate-slip-reveal rounded-xl border border-line bg-panel p-4 shadow-[0_18px_50px_rgba(0,0,0,.35)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-extrabold">Tahmin Kuponu</span>
              {me && (
                <div className="flex rounded-md bg-field p-0.5">
                  {(["MAIN", "BONUS"] as const).map((w) => (
                    <button key={w} onClick={() => setWallet(w)} className={`rounded px-2.5 py-1 text-[11px] font-extrabold transition-colors ${activeWallet === w ? "bg-elevated text-primary" : "text-subtle hover:text-fg"}`}>
                      {w === "MAIN" ? "ANA" : "BONUS"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {out ? (
              <>
                <div className="mb-3 rounded-md bg-card px-3 py-2.5">
                  {cur.id !== m.id && <div className="text-xs font-semibold text-subtle">{cur.question}</div>}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{out.name}</span>
                    <span className="shrink-0 text-sm font-extrabold text-primary">{Math.round(out.probability)}%</span>
                  </div>
                </div>
                <input aria-label="Tahmin tutarı" className={inp} inputMode="decimal" placeholder={`Tutar (${money0(cur.minStake)} – ${money0(cur.maxStake)})`} value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))} />
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[50, 100, 500, 1000].map((v) => (
                    <button key={v} onClick={() => setAmount(String(v))} className={`h-9 cursor-pointer rounded-md text-sm font-bold transition-colors ${Number(amount) === v ? "bg-primary text-primary-fg" : "bg-elevated text-muted hover:bg-elevated-hover hover:text-fg"}`}>{v.toLocaleString("tr-TR")}</button>
                  ))}
                </div>
                <div className="mt-3 space-y-1.5 text-sm font-semibold">
                  <div className="flex justify-between text-subtle"><span>Bakiye ({activeWallet === "BONUS" ? "Bonus" : "Ana Para"})</span><span className="text-muted">{me ? money(balance(activeWallet)) : "—"}</span></div>
                  <div className="flex justify-between text-subtle"><span>Doğru bilirsen kazanç</span><span className="text-base font-extrabold text-win">{money(payout)}</span></div>
                </div>
                <div className="mt-3 space-y-2">
                  <ErrBox e={err} />
                  {done && <div className="rounded-md border border-win/30 bg-win/10 px-3 py-2.5 text-sm font-bold text-win">Bahsin alındı ✓ Doğru bilirsen {money(done.potentialPayout)} kazanırsın.</div>}
                </div>
                {me
                  ? <Btn className="mt-3 w-full" disabled={busy || !Number(amount) || !cur.effectiveBuyEnabled || !out.buyEnabled} onClick={buy}>{cur.effectiveBuyEnabled ? "Tahmini al" : "Bahse Kapalı"}</Btn>
                  : <Btn className="mt-3 w-full" onClick={() => setAuthOpen(true)}>Giriş Yap ve Oyna</Btn>}
                <p className="mt-2 text-center text-[11px] leading-relaxed text-dim">Bahsin aldığın andaki oranla geçerlidir. Piyasa kapanmadan güncel orandan bozdurabilirsin.</p>
              </>
            ) : <div className="py-8 text-center text-sm font-semibold text-subtle">Bahis yapmak için bir sonuç seç.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

const POS_TR: Record<string, [string, string]> = { OPEN: ["Açık", "text-odds"], WON: ["Kazandı", "text-win"], LOST: ["Kaybetti", "text-loss"], SOLD: ["Bozduruldu", "text-muted"], REFUNDED: ["İade", "text-muted"] };

export function MyPositions({ positions, markets, onChange }: { positions: any[]; markets?: any[]; onChange: () => void }) {
  const [quote, setQuote] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function openQuote(p: any) { setErr(""); try { const r = await api(`/api/predictions/positions/${p.id}/quote`); setQuote({ p, ...r.data }); } catch (x: any) { setErr(x.message); } }
  async function sell() { setBusy(true); setErr(""); try { await api(`/api/predictions/positions/${quote.p.id}/sell`, { method: "POST", json: {} }); setQuote(null); onChange(); } catch (x: any) { setErr(x.message); setBusy(false); } }
  const outName = (p: any) => { for (const mk of markets ?? []) { const o = mk.outcomes?.find((x: any) => x.id === p.outcomeId); if (o) return o.name; } return p.outcome?.name ?? ""; };
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><I n="ticket" className="size-5 text-primary" />Bu Piyasadaki Bahislerim</h2>
      <div className="space-y-2">
        {positions.map((p: any) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-card px-3 py-2.5 text-sm">
            <span className="font-bold">{outName(p)}</span>
            <span className="text-subtle">Tutar <b className="text-muted">{money(p.stake)}</b></span>
            <span className="text-subtle">Kazanırsa <b className="text-muted">{money(p.shares)}</b></span>
            {p.wallet === "BONUS" && <span className="rounded-sm bg-primary/15 px-1.5 text-[10px] font-extrabold text-primary">Bonus</span>}
            <span className={`ml-auto font-extrabold ${POS_TR[p.status]?.[1]}`}>{POS_TR[p.status]?.[0] ?? p.status}{p.status !== "OPEN" && Number(p.payout) > 0 ? ` · ${money(p.payout)}` : ""}</span>
            {p.status === "OPEN" && <Btn kind="soft" className="!h-8 !px-3 !text-xs" onClick={() => openQuote(p)}>Bozdur</Btn>}
          </div>
        ))}
      </div>
      <ErrBox e={err} />
      {quote && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && setQuote(null)}>
          <div className="animate-slip-reveal w-full max-w-sm rounded-2xl border border-line bg-panel p-5">
            <h3 className="text-lg font-extrabold">Bahsi Bozdur</h3>
            <p className="mt-2 text-sm text-muted">Yatırdığın <b>{money(quote.stake)}</b> karşılığında şu an <b className="text-primary">{money(quote.amount)}</b> alırsın. Bu işlem geri alınamaz.</p>
            <ErrBox e={err} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn kind="soft" onClick={() => setQuote(null)}>Vazgeç</Btn>
              <Btn disabled={busy} onClick={sell}>{money(quote.amount)} Al</Btn>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------- Liderlik ----------------
export function Leaderboard() {
  const { openProfile, me } = useStore();
  const [days, setDays] = useState("7");
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { setRows(null); api(`/api/predictions/leaderboard?days=${days}`).then((r) => setRows(r.data)).catch(() => setRows([])); }, [days]);
  const top = rows?.slice(0, 3) ?? []; const rest = rows?.slice(3) ?? [];
  const mine = rows?.find((r) => me && r.playerId === me.id);
  const coin = <span className="grid size-5 shrink-0 place-items-center rounded-lg bg-[#0ee07b] text-[13px] font-medium text-white">₺</span>;
  const Podium = ({ r, big }: { r: any; big?: boolean }) => (
    <button onClick={() => r.playerId && openProfile(r.playerId)} className={`relative flex min-w-0 flex-1 flex-col items-center rounded-2xl bg-card px-2 pb-4 text-center ${big ? "pt-6 sm:-mt-6" : "pt-5"}`}>
      <span className="absolute -top-3"><RankBadge n={r.rank} /></span>
      <Avatar src={r.avatar} name={r.username} className={`${big ? "size-16" : "size-12"} !rounded-lg`} />
      <p className="mt-2 w-full truncate text-[14px] font-bold">{r.username}</p>
      <p className="mt-3 text-[12px] font-bold uppercase text-subtle">Net kazanç</p>
      <p className={`text-[14px] font-bold ${r.profit >= 0 ? "text-primary" : "text-loss"}`}>{money(r.profit)}</p>
      <p className="mt-2 text-[12px] font-bold uppercase text-subtle">İsabet</p>
      <p className="flex items-center gap-1.5 text-[14px] font-bold">%{r.positions ? Math.round((r.wins / r.positions) * 100) : 0}</p>
    </button>
  );
  const Row = ({ r, you }: { r: any; you?: boolean }) => (
    <div className={`flex h-[52px] items-center gap-3 rounded-[10px] px-3.5 ${you ? "bg-card-2 ring-1 ring-primary/40" : "bg-card"}`}>
      <span className="grid h-[27px] min-w-[29px] place-items-center rounded-lg border-2 border-[#45515c] px-1.5 text-[14px] font-bold">{r.rank ?? "-"}</span>
      <button onClick={() => r.playerId && openProfile(r.playerId)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Avatar src={r.avatar} name={r.username} className="size-6 !rounded-md" />
        <span className={`truncate text-[14px] font-medium ${you ? "text-primary" : "text-white"}`}>{r.username}</span>
        {you && <span className="rounded-md bg-primary/15 px-1.5 text-[10px] font-bold text-primary">SEN</span>}
      </button>
      <span className="hidden text-[13px] font-medium text-subtle sm:block">{r.positions} tahmin</span>
      <span className="flex w-[120px] items-center justify-end gap-1.5">{coin}<span className={`text-[14px] font-medium tabular-nums ${r.profit >= 0 ? "text-white" : "text-loss"}`}>{money(r.profit)}</span></span>
    </div>
  );
  return (
    <div className="animate-sports-fade mx-auto max-w-[900px]">
      <PageTitle>Liderlik Tablosu</PageTitle>
      <Tabs tabs={[["7", "Bu Hafta"], ["30", "Bu Ay"], ["365", "Tüm Zamanlar"]]} value={days} onChange={setDays} />
      <p className="mt-3 text-[14px] font-medium text-subtle">Sonuçlanan tahminlerdeki net kazanca göre sıralanır.</p>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="mt-6"><Empty text="Bu dönemde sonuçlanan tahmin yok." /></div> : (
        <>
          <div className="mt-8 flex items-end gap-2 sm:gap-3">
            {top[1] && <Podium r={top[1]} />}{top[0] && <Podium r={top[0]} big />}{top[2] && <Podium r={top[2]} />}
          </div>
          {rest.length > 0 && (
            <>
              <div className="mt-6 flex px-3.5 text-[12px] font-bold uppercase text-subtle"><span className="w-[41px]">Sıra</span><span className="flex-1">Oyuncu</span><span className="w-[120px] text-right">Net kazanç</span></div>
              <div className="mt-2 space-y-2">{rest.map((r) => <Row key={r.rank} r={r} you={!!me && r.playerId === me.id} />)}</div>
            </>
          )}
          {me && !mine && (
            <div className="sticky bottom-2 mt-4">
              <Row r={{ rank: null, username: me.username, avatar: me.avatar, profit: 0, positions: 0 }} you />
              <p className="mt-2 text-center text-[13px] font-medium text-subtle">Şu an tabloda değilsin — tahminlerin sonuçlandıkça burada görünürsün.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
