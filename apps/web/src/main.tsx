import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, NavLink, Route, Routes, useParams } from "react-router-dom";
import "./index.css";
import { api, getToken, setToken } from "./api";

const fmt = (v: any) => "₺" + Number(v ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 });

/** CMS'ten gelen özel CSS'i sayfaya enjekte eder (Backoffice > CMS > CSS) */
function useCmsCss() {
  useEffect(() => {
    const key = window.innerWidth < 768 ? "mobile_css" : "web_css";
    api(`/api/cms/settings/${key}`).then((v) => {
      if (!v?.css) return;
      const el = document.createElement("style"); el.id = "cms-css"; el.textContent = v.css; document.head.appendChild(el);
    }).catch(() => {});
  }, []);
}

/** CMS banner slotu — backoffice'teki "group" ile eşleşir */
function BannerSlot({ group }: { group: string }) {
  const [items, setItems] = useState<any[]>([]); const [i, setI] = useState(0);
  const platform = window.innerWidth < 768 ? "mobile" : "web";
  useEffect(() => { api(`/api/cms/banners?group=${group}&platform=${platform}`).then(setItems).catch(() => {}); }, [group]);
  useEffect(() => { if (items.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % items.length), 5000); return () => clearInterval(t); }, [items]);
  if (!items.length) return null;
  const b = items[i];
  return <a href={b.linkUrl || "#"} className="block overflow-hidden rounded-2xl"><img src={b.imageUrl} alt={b.title} className="w-full object-cover" /></a>;
}

function Sidebar() {
  const [sports, setSports] = useState<any[]>([]);
  useEffect(() => { api("/api/sports").then(setSports).catch(() => {}); }, []);
  const item = "flex items-center justify-between rounded-lg px-3 py-2 text-sm text-soft hover:bg-card";
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar-w flex-col border-r border-line/60 bg-rail lg:flex">
      <Link to="/" className="flex h-header-h items-center border-b border-line/60 px-5 text-xl font-black text-primary">SportyBet</Link>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <NavLink to="/" className={item}>Ana Sayfa</NavLink>
        <NavLink to="/live" className={item}>Canlı Bahis</NavLink>
        <NavLink to="/prematch" className={item}>Maç Öncesi</NavLink>
        <div className="px-3 pt-4 pb-1 text-xs uppercase text-dim">Sporlar</div>
        {sports.map((s) => <NavLink key={s.id} to={`/sport/${s.id}`} className={item}><span>{s.name}</span><span className="text-xs text-dim">{s.count}</span></NavLink>)}
        <div className="px-3 pt-4 pb-1 text-xs uppercase text-dim">Diğer</div>
        <NavLink to="/promotions" className={item}>Promosyonlar</NavLink>
      </nav>
    </aside>
  );
}

function Header({ me, onAuth }: { me: any; onAuth: () => void }) {
  const main = me?.wallets?.find((w: any) => w.type === "MAIN")?.balance;
  const bonus = me?.wallets?.find((w: any) => w.type === "BONUS")?.balance;
  return (
    <header className="sticky top-0 z-30 flex h-header-h items-center justify-end gap-3 border-b border-line/60 bg-header px-4">
      {me ? (
        <>
          <div className="rounded-lg bg-card px-3 py-1.5 text-right text-sm"><div className="text-xs text-dim">Bakiye</div><div className="font-semibold">{fmt(main)}</div></div>
          <div className="rounded-lg bg-card px-3 py-1.5 text-right text-sm"><div className="text-xs text-dim">Bonus</div><div className="font-semibold text-primary">{fmt(bonus)}</div></div>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black">Para Yatır</button>
          <button onClick={() => { setToken(null); location.reload(); }} className="text-sm text-muted">{me.username} · Çıkış</button>
        </>
      ) : (
        <>
          <button onClick={onAuth} className="rounded-lg bg-card-2 px-4 py-2 text-sm font-semibold">Giriş Yap</button>
          <button onClick={onAuth} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black">Kayıt Ol</button>
        </>
      )}
    </header>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ username: "", password: "", email: "" }); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try {
      const body = mode === "login" ? { username: f.username, password: f.password } : { ...f, email: f.email || undefined };
      const r = await api(`/api/auth/${mode}`, { method: "POST", json: body }); setToken(r.token); location.reload();
    } catch (e: any) { setErr(e.message); }
  }
  const inp = "h-11 w-full rounded-lg border border-line bg-field px-3 text-sm outline-none focus:border-primary";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl bg-panel p-6">
        <div className="flex gap-2">{(["login", "register"] as const).map((m) => <button type="button" key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg py-2 text-sm ${mode === m ? "bg-primary text-black" : "bg-card"}`}>{m === "login" ? "Giriş Yap" : "Kayıt Ol"}</button>)}</div>
        <input className={inp} placeholder="Kullanıcı adı" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        {mode === "register" && <input className={inp} placeholder="E-posta" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
        <input className={inp} type="password" placeholder="Şifre" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <div className="text-sm text-loss">{err}</div>}
        <button className="h-11 w-full rounded-lg bg-primary font-semibold text-black">{mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}</button>
      </form>
    </div>
  );
}

function EventList() {
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => { api("/api/events").then(setEvents).catch(() => {}); }, []);
  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div key={e.id} className="rounded-xl bg-card p-4">
          <div className="mb-2 text-xs text-dim">{e.competition} · {new Date(e.start).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium"><div>{e.home}</div><div>{e.away}</div></div>
            <div className="flex gap-2">{e.markets?.[0]?.outcomes.map((o: any) => (
              <button key={o.name} className="flex h-12 w-16 flex-col items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:border-primary/50">
                <span className="text-[10px] font-bold uppercase text-white/45">{o.name}</span><span className="text-sm font-extrabold text-primary">{o.odds.toFixed(2)}</span>
              </button>
            ))}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Home() {
  return (
    <div className="space-y-6">
      <BannerSlot group="homepage-hero" />
      <div className="grid gap-4 md:grid-cols-2"><BannerSlot group="homepage-main-left" /><BannerSlot group="homepage-main-right" /></div>
      <section><h2 className="mb-3 text-lg font-bold">Popüler Maçlar</h2><EventList /></section>
    </div>
  );
}

function Promotions() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api("/api/cms/promotions").then(setList).catch(() => {}); }, []);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((p) => <Link key={p.id} to={`/promotions/${p.slug}`} className="overflow-hidden rounded-2xl bg-card">{p.imageUrl && <img src={p.imageUrl} className="w-full" />}<div className="p-4 font-semibold">{p.title}</div></Link>)}
    </div>
  );
}

function PromotionDetail() {
  const { slug } = useParams(); const [p, setP] = useState<any>(null);
  useEffect(() => { api(`/api/cms/promotions/${slug}`).then(setP).catch(() => {}); }, [slug]);
  if (!p) return null;
  return <article><h1 className="mb-4 text-2xl font-bold">{p.title}</h1><div dangerouslySetInnerHTML={{ __html: p.contentHtml }} /></article>;
}

function App() {
  useCmsCss();
  const [me, setMe] = useState<any>(null); const [auth, setAuth] = useState(false);
  useEffect(() => { if (getToken()) api("/api/me").then(setMe).catch(() => {}); }, []);
  return (
    <>
      <Sidebar />
      <div className="lg:pl-sidebar-w">
        <Header me={me} onAuth={() => setAuth(true)} />
        <main className="mx-auto max-w-6xl p-4">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route path="/promotions/:slug" element={<PromotionDetail />} />
            <Route path="*" element={<EventList />} />
          </Routes>
        </main>
      </div>
      {auth && <AuthModal onClose={() => setAuth(false)} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
