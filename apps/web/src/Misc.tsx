import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api";
import { Btn, Empty, ErrBox, I, Spinner, inp, money, useStore } from "./lib";

// ---------- Promosyonlar ----------
export function Promotions() {
  const { me, setAuthOpen, refreshMe } = useStore();
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState(""); const [code, setCode] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { api("/api/cms/promotions").then(setList).catch(() => setList([])); }, []);
  async function redeem() {
    if (!me) return setAuthOpen(true);
    setMsg(""); setErr("");
    try { const r = await api("/api/promo/redeem", { method: "POST", json: { code } }); setMsg(`Kod kullanıldı! ${money(r.amount)} bonus hesabına yüklendi.`); setCode(""); refreshMe(); } catch (x: any) { setErr(x.message); }
  }
  const shown = (list ?? []).filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="animate-sports-fade">
      <section className="relative overflow-hidden rounded-lg bg-[linear-gradient(160deg,#0f231c,#0f1923_70%)] px-6 py-10 text-center">
        <div className="absolute top-0 left-1/2 -z-0 h-40 w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(31,232,138,0.3),transparent)] blur-2xl" />
        <h1 className="relative text-3xl font-extrabold text-primary">Promosyonlar</h1>
        <p className="relative mt-1 text-sm font-bold text-muted">Fırsatları kaçırma, kazancını büyüt</p>
        <div className="relative mx-auto mt-6 grid size-24 rotate-[-8deg] animate-float place-items-center rounded-xl bg-primary text-sm font-extrabold tracking-widest text-primary-fg shadow-[0_20px_50px_rgba(31,232,138,.25)]">BONUS</div>
      </section>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="flex h-[46px] flex-1 items-center gap-2 rounded-[5px] border border-line-strong bg-field px-3 focus-within:border-primary">
          <I n="search" className="size-4 text-subtle" />
          <input className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-subtle" placeholder="Promosyon ara" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <input className={inp + " w-48 uppercase sm:w-56"} placeholder="Promosyon kodunu gir" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Btn className="!h-[46px] shrink-0" disabled={code.length < 3} onClick={redeem}>Kodu Al</Btn>
        </div>
      </div>
      <div className="mt-3 space-y-2">{msg && <div className="rounded-md border border-win/30 bg-win/10 px-3 py-2.5 text-sm font-bold text-win">{msg}</div>}<ErrBox e={err} /></div>
      <h2 className="mt-6 mb-3 text-lg font-extrabold">Promosyonlar</h2>
      {!list ? <Spinner /> : shown.length === 0 ? <Empty text="Şu an açık promosyon yok. Yakında yenileri gelecek." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <Link key={p.id} to={`/promosyonlar/${p.slug}`} className="group overflow-hidden rounded-lg border border-line bg-card transition-all hover:-translate-y-px hover:bg-surface-hover">
              {p.imageUrl && <img src={p.imageUrl} alt="" className="aspect-[2/1] w-full object-cover" />}
              <div className="flex items-center justify-between gap-2 p-4">
                <span className="text-sm font-extrabold">{p.title}</span>
                <I n="right" className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function PromotionDetail() {
  const { slug } = useParams();
  const [p, setP] = useState<any>(null); const [missing, setMissing] = useState(false);
  useEffect(() => { api(`/api/cms/promotions/${slug}`).then((r) => (r ? setP(r) : setMissing(true))).catch(() => setMissing(true)); }, [slug]);
  if (missing) return <Empty text="Promosyon bulunamadı." />;
  if (!p) return <Spinner />;
  return (
    <article className="animate-sports-fade mx-auto max-w-3xl">
      <Link to="/promosyonlar" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-subtle hover:text-fg"><I n="left" className="size-4" />Promosyonlar</Link>
      {p.imageUrl && <img src={p.imageUrl} alt="" className="mb-5 w-full rounded-lg" />}
      <h1 className="text-2xl font-extrabold">{p.title}</h1>
      <div className="cms-content mt-2" dangerouslySetInnerHTML={{ __html: p.contentHtml }} />
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
    <article className="animate-sports-fade mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold">{p.title}</h1>
      <div className="cms-content mt-2" dangerouslySetInnerHTML={{ __html: p.contentHtml }} />
    </article>
  );
}

// ---------- VIP ----------
export function Vip() {
  const LEVELS = [["BRONZ I", "5.000₺", "25₺"], ["BRONZ II", "15.000₺", "75₺"], ["BRONZ III", "40.000₺", "200₺"], ["BRONZ IV", "100.000₺", "500₺"], ["BRONZ V", "250.000₺", "1.250₺"]];
  const [lvl, setLvl] = useState(0);
  const FAQ = [
    ["VIP Kulübü nedir?", "Düzenli oyuncularımız için hazırladığımız sadakat programıdır. Ana seviyeler ve alt seviyelerden oluşur; yükseldikçe bonusların ve ayrıcalıkların artar."],
    ["Seviyem nasıl hesaplanıyor?", "Spor ve tahminlerde oynadığın her işlemin tutarı VIP hacmine anında yansır. Hacmin hedefe ulaştığında bir sonraki seviyeye otomatik geçersin."],
    ["Seviye atlama bonusu ne zaman yatar?", "Her yeni seviyede seviye atlama bonusun hesabına otomatik yatar; başvuru gerekmez."],
    ["Seviyem düşer mi?", "Hayır, ulaştığın seviye sende kalır."],
  ];
  const [open, setOpen] = useState(0);
  return (
    <div className="animate-sports-fade">
      <section className="grid items-center gap-8 overflow-hidden rounded-lg bg-[linear-gradient(115deg,#0b1a17,#10291f_60%,#0f1923)] p-8 lg:grid-cols-2 lg:p-12">
        <div>
          <span className="inline-flex items-center gap-2 rounded-sm bg-black/30 px-2.5 py-1 text-[12px] font-extrabold text-primary"><I n="crown" className="size-3.5" />VIP Kulübü <span className="rounded-sm bg-primary px-1.5 text-primary-fg">Yakında</span></span>
          <h1 className="mt-4 text-3xl leading-tight font-extrabold lg:text-4xl">Oyna, seviyeni yükselt, ayrıcalıkları topla</h1>
          <p className="mt-3 max-w-md text-[15px] font-medium text-muted">VIP Kulübü çok yakında açılıyor. Aldığın her tahmin ve kupon şimdiden hacmine sayılıyor; açılışta seviyene yerleşirsin.</p>
          <div className="mt-6 flex gap-3">
            <Link to="/tahminler" className="inline-flex h-[46px] items-center rounded-lg bg-primary px-6 text-sm font-extrabold text-primary-fg hover:bg-primary-hover">Tahmin Yap</Link>
            <a href="#seviyeler" className="inline-flex h-[46px] items-center rounded-lg bg-elevated px-6 text-sm font-extrabold hover:bg-elevated-hover">Seviyeleri Gör</a>
          </div>
        </div>
        <div className="relative hidden h-[260px] place-items-center lg:grid">
          <div className="absolute top-0 h-40 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(31,232,138,.35),transparent)] blur-2xl" />
          <svg viewBox="0 0 120 150" className="relative h-56 animate-float"><polygon points="60,8 108,56 60,142 12,56" fill="#1fe88a" /><polygon points="60,8 108,56 60,56" fill="#9cf7c9" /><polygon points="12,56 60,56 60,142" fill="#1fb57a" /><rect x="20" y="140" width="80" height="8" rx="4" fill="#1a2734" /></svg>
          <span className="absolute top-3 rounded-md bg-elevated px-3 py-1 text-xs font-extrabold">Bronz</span>
        </div>
      </section>
      <div id="seviyeler" className="mt-8 flex justify-center gap-1 border-b border-line">
        {LEVELS.map(([name], i) => (
          <button key={name} onClick={() => setLvl(i)} className={`border-b-2 px-4 py-3 text-xs font-semibold transition-colors sm:text-sm ${lvl === i ? "border-primary text-fg" : "border-transparent text-subtle hover:text-fg"}`}>{name}</button>
        ))}
      </div>
      <div className="mt-5 grid items-center gap-6 rounded-lg border border-line bg-card p-6 sm:grid-cols-[auto_1fr_1fr]">
        <div className="text-center">
          <svg viewBox="0 0 120 150" className="mx-auto h-24"><polygon points="60,8 108,56 60,142 12,56" fill="#1fe88a" opacity={0.5 + lvl * 0.12} /><polygon points="60,8 108,56 60,56" fill="#9cf7c9" opacity={0.6 + lvl * 0.1} /></svg>
          <div className="mt-2 text-sm font-extrabold">{LEVELS[lvl][0]}</div>
        </div>
        <div><div className="text-[12px] font-semibold text-dim">Gereken Hacim</div><div className="mt-1 text-2xl font-extrabold">{LEVELS[lvl][1]}</div>
          <div className="mt-3 text-[12px] font-semibold text-dim">Ayrıcalıklar</div>
          <div className="mt-1 space-y-1 text-sm font-semibold text-muted"><div className="flex items-center gap-2"><I n="check" className="size-4 text-win" />Anlık Komisyon</div><div className="flex items-center gap-2"><I n="check" className="size-4 text-win" />Özel Sohbet Odası</div></div>
        </div>
        <div><div className="text-[12px] font-semibold text-dim">Seviye Atlama Bonusu</div><div className="mt-1 text-2xl font-extrabold text-primary">{LEVELS[lvl][2]}</div>
          <div className="mt-3 text-[12px] font-semibold text-dim">Kilidi açmak için yüksel</div>
          <div className="mt-1 space-y-1 text-sm font-semibold text-subtle">{["Doğum günü bonusu", "Öncelikli çekim", "Kişisel VIP asistanı"].map((t) => <div key={t} className="flex items-center gap-2"><I n="lock" className="size-4" />{t}</div>)}</div>
        </div>
      </div>
      <h2 className="mt-10 text-center text-2xl font-extrabold">Nasıl Yükselirsin?</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[["trophy", "Oyna, hacim biriktir", "Tahminlerde ve sporda oynadığın her işlemin tutarı VIP hacmine anında yansır."], ["crown", "Seviyeni yükselt", "Hacmin hedefe ulaştığında bir sonraki seviyeye otomatik geçersin, başvuru gerekmez."], ["gift", "Ödüllerini topla", "Her yeni seviyede seviye atlama bonusun hesabına otomatik yatar, ayrıcalıkların artar."]].map(([ic, t, d], i) => (
          <div key={t} className="rounded-lg border border-line bg-card p-6">
            <span className="grid size-14 place-items-center rounded-full bg-elevated text-primary"><I n={ic} className="size-6" /></span>
            <div className="mt-4 text-[12px] font-semibold text-primary">Adım {["I", "II", "III"][i]}</div>
            <div className="mt-1 text-base font-extrabold">{t}</div>
            <p className="mt-1.5 text-sm font-medium text-subtle">{d}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-10 text-center text-xl font-extrabold">Sıkça Sorulan Sorular</h2>
      <div className="mx-auto mt-4 max-w-2xl border-l-2 border-primary/50">
        {FAQ.map(([q, a], i) => (
          <div key={q} className="border-b border-line">
            <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full cursor-pointer items-center justify-between px-4 py-3.5 text-left text-sm font-bold hover:text-primary">{q}<I n={open === i ? "up" : "down"} className="size-4 text-subtle" /></button>
            {open === i && <p className="animate-slip-item px-4 pb-4 text-sm font-medium text-muted">{a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
