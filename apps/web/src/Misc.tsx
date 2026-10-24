import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, asset } from "./api";
import { Accordion, Pager, PageTitle, Pill, Progress, SearchBox, Tabs } from "./g";
import { Btn, Empty, ErrBox, I, Spinner, inp, money, scrollMain, useStore } from "./lib";
import { BannerSlot } from "./CmsSlot";

// ---------- Promosyonlar (gamdom /promotions) ----------
const PROMO_CATS: [string, string][] = [["", "Tümü"], ["SPOR", "Spor"], ["TAHMIN", "Tahminler"], ["OZEL", "Özel Teklifler"]];
const CAT_COLOR: Record<string, string> = { SPOR: "#279aff", TAHMIN: "#00ff86", OZEL: "#ffd900" };
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const promoTag = (p: any) => p.tag || (PROMO_CATS.find(([k]) => k === p.category && k)?.[1] ?? "");

/** Promosyon kartı: #0f1d28 r16 — üstte etiket + 18/700 başlık + bitiş, altta 180px görsel */
export function PromoCard({ p }: { p: any }) {
  const tag = promoTag(p);
  return (
    <Link to={`/promosyonlar/${p.slug}`} className="lift flex flex-col overflow-hidden rounded-2xl bg-card-blue">
      <div className="flex flex-1 flex-col justify-end gap-2 px-4 pt-4 pb-4">
        {tag && <span><Pill color={CAT_COLOR[p.category] ?? "#00ff86"}>{tag}</Pill></span>}
        <h2 className="line-clamp-2 text-[18px] font-bold leading-[20px] text-fg">{p.title}</h2>
        {p.endsAt && <div className="text-[13px] font-medium text-subtle">Bitiş: {fmtDate(p.endsAt)}</div>}
      </div>
      <div className="h-[180px] shrink-0 bg-card">{p.imageUrl && <img src={asset(p.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}</div>
    </Link>
  );
}

export function Promotions() {
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => { api("/api/cms/promotions").then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([])); }, []);
  useEffect(() => setPage(1), [q, cat]);
  const all = (list ?? []).filter((p) => !p.endsAt || new Date(p.endsAt) > new Date());
  const featured = all.find((p) => p.featured);
  const shown = all.filter((p) => p !== featured && (!cat || p.category === cat) && (!q || p.title.toLowerCase().includes(q.toLowerCase())));
  const PER = 12, pages = Math.max(1, Math.ceil(shown.length / PER));
  return (
    <div className="animate-sports-fade">
      <PageTitle>Promosyonlar</PageTitle>
      <BannerSlot group="promotions-top" className="mb-4" />
      {featured && (
        <Link to={`/promosyonlar/${featured.slug}`} className="mb-4 grid overflow-hidden rounded-2xl bg-white/[.03] md:grid-cols-[1.1fr_1fr]">
          <div className="h-[180px] md:order-2 md:h-full md:min-h-[300px]">{featured.imageUrl && <img src={asset(featured.imageUrl)} alt="" className="size-full rounded-2xl object-cover" />}</div>
          <div className="flex flex-col justify-center px-4 py-5 md:px-8">
            <span className="text-[13px] font-medium text-subtle">{new Date(featured.startsAt ?? featured.updatedAt).toLocaleDateString("tr-TR")}</span>
            <h2 className="mt-4 text-[24px] font-bold leading-[30px] text-fg">{featured.title}</h2>
            {featured.excerpt && <p className="mt-3 line-clamp-2 text-[13px] font-medium text-subtle">{featured.excerpt}</p>}
            <span className="btn btn-primary mt-3 h-9 rounded-lg md:w-fit md:px-6">Devamını oku</span>
          </div>
        </Link>
      )}
      <Tabs tabs={PROMO_CATS} value={cat} onChange={setCat} />
      <SearchBox className="mt-3" value={q} onChange={setQ} placeholder={`${all.length} promosyonda ara`} />
      {!list ? <Spinner /> : shown.length === 0 ? <div className="mt-4"><Empty text="Bu filtrede promosyon yok." /></div> : (
        <div className="mt-4 grid gap-[10px] sm:grid-cols-2 xl:grid-cols-3">
          {shown.slice((page - 1) * PER, page * PER).map((p) => <PromoCard key={p.id} p={p} />)}
        </div>
      )}
      <Pager page={page} pages={pages} onChange={(n) => { setPage(n); scrollMain(0); }} />
    </div>
  );
}

export function PromotionDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState<any>(null); const [missing, setMissing] = useState(false); const [more, setMore] = useState<any[]>([]); const [copied, setCopied] = useState(false);
  useEffect(() => {
    setP(null); setMissing(false); scrollMain(0);
    api(`/api/cms/promotions/${slug}`).then((r) => (r ? setP(r) : setMissing(true))).catch(() => setMissing(true));
    api("/api/cms/promotions").then((r) => setMore((Array.isArray(r) ? r : []).filter((x: any) => x.slug !== slug && (!x.endsAt || new Date(x.endsAt) > new Date())).slice(0, 6))).catch(() => {});
  }, [slug]);
  if (missing) return <Empty text="Promosyon bulunamadı." />;
  if (!p) return <Spinner />;
  const url = typeof location !== "undefined" ? location.href : "";
  return (
    <article className="animate-sports-fade mx-auto max-w-[900px]">
      <button onClick={() => (history.length > 1 ? nav(-1) : nav("/promosyonlar"))} aria-label="Geri" className="mb-3 grid size-11 place-items-center rounded-full bg-card text-white hover:bg-card-2"><I n="left" className="size-6" /></button>
      {p.imageUrl && <div className="overflow-hidden rounded-2xl"><img src={asset(p.imageUrl)} alt="" className="max-h-[360px] w-full object-cover" /></div>}
      <div className="mt-[14px] flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <p className="text-[16px] font-bold text-fg">{p.endsAt ? "Bitiş" : "Başlangıç"}</p>
          <div className="mt-1.5 text-[13px] font-medium text-subtle">{p.endsAt ? fmtDate(p.endsAt) : fmtDate(p.startsAt ?? p.updatedAt)}</div>
        </div>
        <div className="flex gap-2">
          <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(p.title)}`} target="_blank" rel="noreferrer" aria-label="Telegram'da paylaş" className="grid size-9 place-items-center rounded-[10px] bg-card text-white hover:bg-card-2"><I n="send" className="size-4" /></a>
          <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Bağlantıyı kopyala" className="grid size-9 place-items-center rounded-[10px] bg-card text-white hover:bg-card-2"><I n={copied ? "check" : "copy"} className="size-4" /></button>
        </div>
      </div>
      <h1 className="mt-9 text-[18px] font-bold text-fg">{p.title}</h1>
      <div className="cms-content promo-text mt-4" dangerouslySetInnerHTML={{ __html: p.contentHtml }} />
      <div className="mt-4 space-y-4">
        {p.howToHtml && <Accordion title="Nasıl Katılırım"><div className="cms-content promo-text" dangerouslySetInnerHTML={{ __html: p.howToHtml }} /></Accordion>}
        {p.termsHtml && <Accordion title="Şartlar ve Koşullar"><div className="cms-content promo-text" dangerouslySetInnerHTML={{ __html: p.termsHtml }} /></Accordion>}
      </div>
      {more.length > 0 && (
        <>
          <h2 className="h-sec mt-8 mb-4">Diğer Promosyonlar</h2>
          <div className="grid gap-[10px] sm:grid-cols-2 xl:grid-cols-3">{more.map((x) => <PromoCard key={x.id} p={x} />)}</div>
        </>
      )}
    </article>
  );
}

// ---------- CMS sayfası ----------
export function StaticPage() {
  const { slug } = useParams();
  const [p, setP] = useState<any>(null); const [missing, setMissing] = useState(false);
  useEffect(() => { setP(null); setMissing(false); api(`/api/cms/pages/${slug}`).then((r) => (r?.isPublished ? setP(r) : setMissing(true))).catch(() => setMissing(true)); }, [slug]);
  if (missing) return <Empty text="Sayfa bulunamadı." />;
  if (!p) return <Spinner />;
  return (
    <article className="animate-sports-fade mx-auto max-w-[900px]">
      <PageTitle>{p.title}</PageTitle>
      <div className="cms-content promo-text rounded-2xl bg-panel p-5 sm:p-6" dangerouslySetInnerHTML={{ __html: p.contentHtml }} />
    </article>
  );
}

// ---------- Ödüller (gamdom /rewards): alınabilir bonuslar + seviye ilerlemesi + seviye kartları ----------
const TIER: Record<string, [string, string]> = {
  Bronz: ["#f0a46a", "#9a5426"], Gümüş: ["#eef2f7", "#8d99aa"], Altın: ["#ffe27a", "#d08a12"], Zümrüt: ["#6dffb7", "#0c9e5c"],
  Safir: ["#7fb6ff", "#1f55d8"], Yakut: ["#ff8a9c", "#c4153a"], Elmas: ["#d6fbff", "#4cc9e6"], Opal: ["#f3c8ff", "#8a4fd8"],
};
const tierOf = (name: string) => TIER[name.split(" ")[0]] ?? ["#cfd6df", "#6b7785"];
/** Seviye rozeti: renkli taş (kendi çizimimiz) */
export function LevelGem({ name, size = 125, dim }: { name: string; size?: number; dim?: boolean }) {
  const [a, b] = tierOf(name); const id = "g" + name.replace(/\W/g, "");
  const n = Number(name.split(" ")[1]) || 1;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={dim ? "opacity-40 grayscale-[.6]" : ""} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        <radialGradient id={id + "h"} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={a} stopOpacity=".55" /><stop offset="1" stopColor={a} stopOpacity="0" /></radialGradient></defs>
      <circle cx="50" cy="52" r="46" fill={`url(#${id}h)`} />
      <polygon points="50,10 84,32 84,68 50,90 16,68 16,32" fill={`url(#${id})`} />
      <polygon points="50,10 84,32 50,44 16,32" fill="#fff" opacity=".35" />
      <polygon points="50,44 84,32 84,68 50,90" fill="#000" opacity=".14" />
      {Array.from({ length: n }).map((_, i) => <circle key={i} cx={50 + (i - (n - 1) / 2) * 11} cy="62" r="4" fill="#fff" opacity=".9" />)}
    </svg>
  );
}

export function Rewards() {
  const { me, setAuthOpen, setWalletOpen } = useStore();
  const [st, setSt] = useState<any>(null); const [avail, setAvail] = useState<any[] | null>(null); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const load = () => { if (!me) return; api("/api/me/stats").then(setSt).catch(() => {}); api("/api/bonuses/available").then((r) => setAvail(Array.isArray(r) ? r : [])).catch(() => setAvail([])); };
  useEffect(load, [me?.id]);
  async function request(id: number) {
    setErr(""); setMsg("");
    try { await api(`/api/bonuses/${id}/request`, { method: "POST", json: {} }); setMsg("Talebin alındı, onaylanınca bonus hesabına yüklenecek."); load(); } catch (x: any) { setErr(x.message); }
  }
  const levels: any[] = st?.levels ?? [];
  const cur = st?.level ?? -1; const nextL = st?.nextLevel != null ? levels[st.nextLevel] : null;
  return (
    <div className="animate-sports-fade relative isolate">
      {/* gamdom ödül sayfası arka ışığı */}
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[420px] w-full max-w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,255,134,.22),transparent)] blur-2xl" />
      <PageTitle>Ödüller</PageTitle>
      {!me ? (
        <div className="rounded-2xl bg-[rgba(8,13,19,.6)] p-8 text-center backdrop-blur">
          <p className="text-[20px] font-bold">Ödüllerini görmek için giriş yap</p>
          <p className="mt-2 text-[14px] font-medium text-subtle">Oynadıkça seviyen yükselir, sana özel bonuslar burada açılır.</p>
          <button onClick={() => setAuthOpen(true)} className="btn btn-primary mt-5 px-8">Giriş yap</button>
        </div>
      ) : (
        <>
          <div className="no-scrollbar -mx-3 flex snap-x gap-0.5 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            {(avail ?? []).length === 0 && avail && (
              <article className="w-full rounded-2xl bg-[rgba(8,13,19,.6)] p-5 backdrop-blur">
                <h3 className="text-[20px] font-bold">Şu an alınabilir ödül yok</h3>
                <p className="mt-2 text-[14px] font-medium text-subtle">Yeni bonuslar açıldığında burada görünecek. Promosyon kodun varsa Cüzdan › Kod Kullan'dan girebilirsin.</p>
                <button onClick={() => setWalletOpen("promo")} className="btn btn-secondary mt-4 w-full">Kod kullan</button>
              </article>
            )}
            {(avail ?? []).map((b, i, arr) => (
              <article key={b.id} className={`flex w-[344px] shrink-0 snap-start flex-col bg-[rgba(8,13,19,.6)] p-5 backdrop-blur ${i === 0 ? "rounded-l-2xl" : ""} ${i === arr.length - 1 ? "rounded-r-2xl" : ""}`}>
                <div className="flex items-start gap-3">
                  <h3 className="line-clamp-2 min-h-12 flex-1 text-[20px] font-bold leading-6">{b.name}</h3>
                  {b.expirationDays && <p className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-white/[.05] px-2 text-[14px] font-bold"><I n="clock" className="size-5" />{b.expirationDays} g</p>}
                </div>
                <div className="my-4 grid h-[150px] place-items-center"><svg viewBox="0 0 120 120" className="h-full" aria-hidden><defs><linearGradient id={"bx" + b.id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4dffa8" /><stop offset="1" stopColor="#00a85a" /></linearGradient></defs><ellipse cx="60" cy="104" rx="40" ry="8" fill="#000" opacity=".35" /><rect x="22" y="48" width="76" height="54" rx="8" fill={`url(#bx${b.id})`} /><rect x="16" y="36" width="88" height="20" rx="6" fill="#7dffc0" /><rect x="54" y="36" width="12" height="66" fill="#ffd900" /><path d="M60 36c-8-18-30-16-24-4 4 8 24 4 24 4zm0 0c8-18 30-16 24-4-4 8-24 4-24 4z" fill="#ffd900" /></svg></div>
                <p className="mb-3 line-clamp-2 text-[13px] font-medium text-subtle">{b.description || (b.depositBonus ? `Yatırımına %${Number(b.percent)} bonus` : `Çevrim x${Number(b.wageringMultiplier)}`)}</p>
                {b.depositBonus ? <Link to={`/para-yatir?bonus=${b.id}`} className="btn btn-primary w-full">Yatırım yap</Link>
                  : b.requested ? <button disabled className="btn w-full bg-card text-[#45515c]">Talep beklemede</button>
                  : <button onClick={() => request(b.id)} className="btn btn-primary w-full">Talep et</button>}
              </article>
            ))}
          </div>
          <div className="mt-3 space-y-2">{msg && <div className="rounded-[10px] bg-primary/10 px-3 py-2.5 text-sm font-bold text-primary">{msg}</div>}<ErrBox e={err} /></div>

          {st && (
            <section className="mt-6">
              <div className="flex items-center gap-2 text-[14px] font-bold">
                <p className="flex-1">İlerlemen <span className="text-subtle">•</span> {nextL ? `%${st.progress.toFixed(2)}` : "Maksimum seviye"}</p>
                {nextL && <><LevelGem name={nextL.name} size={24} /><p>{nextL.name}</p></>}
              </div>
              <div className="mt-3"><Progress value={st.progress} /></div>
              <div className="mt-2.5 flex justify-between text-[14px] font-medium">
                <p>Toplam oynanan: {money(st.wagered)}</p>
                {nextL && <p>{money(nextL.xp)}</p>}
              </div>
            </section>
          )}

          {levels.length > 0 && (
            <LevelRail levels={levels} cur={cur} progress={st?.progress ?? 0} />
          )}
        </>
      )}
    </div>
  );
}

function LevelRail({ levels, cur, progress }: { levels: any[]; cur: number; progress: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current?.children[Math.max(0, cur)] as HTMLElement | undefined; if (el && ref.current) ref.current.scrollLeft = el.offsetLeft - 12; }, [cur, levels.length]);
  const by = (d: number) => ref.current?.scrollBy({ left: d * 394, behavior: "smooth" });
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="h-sec flex-1">Seviyeler</h2>
        <div className="flex"><button onClick={() => by(-1)} aria-label="Önceki" className="arrow-l"><I n="left" className="size-5" /></button><button onClick={() => by(1)} aria-label="Sonraki" className="arrow-r"><I n="right" className="size-5" /></button></div>
      </div>
      <div ref={ref} className="no-scrollbar -mx-3 flex snap-x gap-[10px] overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {levels.map((l, i) => {
          const done = i <= cur && i !== cur + 1; const isNext = i === cur + 1;
          return (
            <div key={l.name} className={`relative flex h-[280px] w-[187px] shrink-0 snap-start flex-col items-center overflow-hidden rounded-2xl bg-card ${isNext ? "border-[3px] border-primary" : ""}`}>
              <div aria-hidden className="absolute inset-x-0 top-0 h-[188px]" style={{ background: `radial-gradient(70% 60% at 50% 40%, ${tierOf(l.name)[0]}33, transparent 70%)` }} />
              <p className="relative mt-3.5 text-[14px] font-bold">{l.name}</p>
              <div className="relative mt-4"><LevelGem name={l.name} dim={!done && !isNext} /></div>
              <div className="absolute inset-x-0 bottom-0 flex h-[60px] flex-col justify-center rounded-t-xl bg-[rgba(6,9,14,.5)] px-3">
                {isNext ? (
                  <><p className="text-center text-[14px] font-bold">%{progress.toFixed(2)}</p><div className="mt-1.5"><Progress value={progress} /></div></>
                ) : (
                  <button disabled className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-card text-[14px] font-bold text-[#45515c]">
                    <I n={done ? "check" : "lock"} className="size-5" />{done ? "Ulaşıldı" : "Kilitli"}
                  </button>
                )}
              </div>
              {l.reward && <span className="absolute right-2 top-2 rounded-md bg-primary/15 px-1.5 text-[10px] font-bold text-primary">{l.reward}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
