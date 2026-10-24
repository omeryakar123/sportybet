import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, setToken } from "./api";
import { Avatar, Btn, ErrBox, Field, I, inp, money, pct, useStore } from "./lib";
import { ChatPanel, ProfileModal, WalletModal } from "./Social";

function Logo({ className = "h-9" }: { className?: string }) {
  const { settings } = useStore();
  // Şimdilik logo kullanılmıyor — yalnızca CMS'ten bir logo yüklenirse gösterilir.
  if (settings.logoUrl) return <img src={settings.logoUrl} alt={settings.siteName ?? ""} className={`${className} w-auto max-w-[220px] object-contain object-left`} draggable={false} />;
  return null;
}

// ---------------- Sidebar ----------------
const SPORT_ITEMS = [
  { to: "/spor?page=live", icon: "live", label: "Canlı Bahis" },
  { to: "/spor", icon: "calendar", label: "Maç Öncesi" },
  { to: "/spor?sport=Soccer", icon: "ball", label: "Futbol" },
  { to: "/spor?sport=Basketball", icon: "ball", label: "Basketbol" },
  { to: "/spor?sport=Tennis", icon: "ball", label: "Tenis" },
  { to: "/hesap/kuponlarim", icon: "ticket", label: "Kuponlarım" },
];

function SideLink({ to, icon, label, count, badge, exact }: { to: string; icon: string; label: string; count?: number; badge?: string; exact?: boolean }) {
  const { setSidebarOpen } = useStore();
  return (
    <NavLink to={to} end={exact} onClick={() => setSidebarOpen(false)}
      className={({ isActive }) => `flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] font-semibold transition-colors ${isActive ? "bg-card text-primary" : "text-muted hover:bg-card hover:text-fg"}`}>
      <I n={icon} className="size-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge && <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-extrabold text-primary-fg">{badge}</span>}
      {count !== undefined && count > 0 && <span className="rounded-sm bg-elevated px-1.5 py-0.5 text-[11px] font-bold text-soft">{count}</span>}
    </NavLink>
  );
}
const SideHead = ({ t }: { t: string }) => <div className="mt-5 mb-1.5 px-3 text-[12px] font-semibold text-dim">{t}</div>;

const TILES = [
  { to: "/", icon: "home", label: "Lobi", exact: true },
  { to: "/spor", icon: "ball", label: "Spor" },
  { to: "/tahminler", icon: "vote", label: "Tahminler" },
  { to: "/hesap/kuponlarim", icon: "ticket", label: "Kuponlarım" },
];
function SideCard({ title, children, open: o = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(o);
  return (
    <div className="mt-3 rounded-xl bg-panel">
      <button onClick={() => setOpen(!open)} className="flex h-10 w-full items-center gap-2 px-3 text-[12px] font-semibold text-soft">
        <span className="flex-1 text-left">{title}</span>
        <span className={`grid size-5 place-items-center rounded-full ${open ? "bg-primary/15 text-primary" : "bg-card text-subtle"}`}><I n={open ? "minus" : "plus"} className="size-3" /></span>
      </button>
      {open && <div className="px-1.5 pb-1.5">{children}</div>}
    </div>
  );
}
function SidebarBody() {
  const { predCats, settings, setSidebarOpen } = useStore();
  const [lgs, setLgs] = useState<any[]>([]);
  useEffect(() => { api("/api/sb/leagues").then((r) => setLgs(r.slice(0, 6))).catch(() => {}); }, []);
  const total = predCats.reduce((a, c) => a + (c.activeCount ?? 0), 0);
  return (
    <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
      <div className="grid grid-cols-2 gap-1.5">
        {TILES.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.exact} onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `flex h-[58px] flex-col items-center justify-center gap-1 rounded-lg text-[12px] font-bold transition-colors ${isActive ? "bg-primary text-primary-fg" : "bg-panel text-muted hover:bg-card hover:text-fg"}`}>
            <I n={t.icon} className="size-5" />{t.label}
          </NavLink>
        ))}
      </div>
      {lgs.length > 0 && (
        <SideCard title="Popüler Ligler">
          {lgs.map((l) => (
            <Link key={l.id} to={`/spor?lig=${l.id}`} onClick={() => setSidebarOpen(false)} className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] font-semibold text-muted hover:bg-card hover:text-fg">
              {l.logo ? <img src={l.logo} alt="" className="size-4 object-contain" /> : <I n="ball" className="size-4" />}
              <span className="flex-1 truncate">{l.name}</span><span className="text-[11px] font-bold text-dim">{l.count}</span>
            </Link>
          ))}
        </SideCard>
      )}
      <SideCard title="Tahminler">
        <SideLink to="/tahminler" icon="grid" label="Tüm Tahminler" count={total} exact />
        <SideLink to="/liderlik" icon="trophy" label="Liderlik Tablosu" />
        {predCats.filter((c) => c.activeCount > 0).slice(0, 6).map((c) => (
          <SideLink key={c.id} to={`/tahminler?kategori=${c.slug}`} icon="hash" label={c.name} count={c.activeCount} />
        ))}
      </SideCard>
      <SideCard title="Ayrıcalıklar">
        <SideLink to="/promosyonlar" icon="gift" label="Promosyonlar" badge="Yeni" />
        <SideLink to="/vip" icon="crown" label="VIP Kulübü" badge="Yakında" />
        <SideLink to="/hesap/bonuslarim" icon="rewards" label="Bonuslarım" />
      </SideCard>
      <SideCard title="Destek" open={false}>
        <a href={settings.supportEmail ? `mailto:${settings.supportEmail}` : "#"} className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:bg-card hover:text-fg"><I n="headset" className="size-[18px]" /><span>Canlı Destek</span></a>
        <a href={settings.telegram || "#"} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:bg-card hover:text-fg"><I n="send" className="size-[18px]" /><span>Telegram</span></a>
      </SideCard>
    </nav>
  );
}

function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useStore();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col border-r border-line/60 bg-rail lg:flex">
        <div className="flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-line/60 bg-header pl-5">
          <Link to="/" aria-label="Ana sayfa"><Logo /></Link>
        </div>
        <SidebarBody />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="animate-sports-fade absolute inset-y-0 left-0 flex w-[min(303px,80vw)] flex-col border-r border-line/60 bg-rail" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-[var(--header-h)] shrink-0 items-center justify-between border-b border-line/60 bg-header px-4">
              <Logo />
              <button onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat" className="grid size-9 place-items-center rounded-lg text-muted hover:text-fg"><I n="x" className="size-5" /></button>
            </div>
            <SidebarBody />
          </aside>
        </div>
      )}
    </>
  );
}

// ---------------- Header ----------------
function WalletChip() {
  const { me, balance, setWallet, refreshMe, setWalletOpen } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const active = me?.activeWallet === "BONUS" ? "BONUS" : "MAIN";
  return (
    <div ref={ref} className="relative">
      <div className="flex h-[42px] items-center rounded-lg bg-panel-deep p-1">
        <button onClick={() => { setOpen(!open); refreshMe(); }} className="flex h-full cursor-pointer items-center gap-2 rounded-md pr-2 pl-1 text-sm font-extrabold transition-colors hover:bg-card">
          <span className={`grid size-[26px] place-items-center rounded-md text-[14px] font-extrabold ${active === "BONUS" ? "bg-caution text-[#2a1d00]" : "bg-primary text-primary-fg"}`}>₺</span>
          <span className="num text-[16px] font-bold">{money(balance(active as any)).replace("₺", "")}</span>
          {active === "BONUS" && <span className="hidden rounded-sm bg-caution/20 px-1 text-[10px] font-extrabold text-caution sm:inline">Bonus</span>}
          <I n="down" className="size-3 text-subtle" />
        </button>
        <button onClick={() => setWalletOpen("menu")} className="btn btn-primary btn-sm ml-1 h-full rounded-[8px] px-3 sm:px-4">Cüzdan</button>
      </div>
      {open && (
        <div className="animate-slip-item absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-xl border border-line bg-panel p-3 shadow-[0_18px_50px_rgba(0,0,0,.5)]">
          <div className="mb-2 text-[12px] font-semibold text-dim">Oynadığın cüzdan</div>
          {(["MAIN", "BONUS"] as const).map((w) => (
            <button key={w} onClick={async () => { await setWallet(w); }} className={`mb-1.5 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${active === w ? "border-primary/60 bg-primary/10" : "border-line bg-card hover:bg-surface-hover"}`}>
              <span>
                <span className="block text-sm font-bold">{w === "MAIN" ? "Ana Para" : "Bonus"}</span>
                <span className="block text-xs text-subtle">{w === "MAIN" ? "Yatırımların ve çekilebilir bakiyen" : "Çevrim tamamlanınca ana paraya geçer"}</span>
              </span>
              <span className={`text-sm font-extrabold tabular-nums ${active === w ? "text-primary" : "text-fg"}`}>{money(balance(w))}</span>
            </button>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link to="/para-yatir" onClick={() => setOpen(false)} className="btn btn-primary">Para yatır</Link>
            <Link to="/para-cek" onClick={() => setOpen(false)} className="btn btn-secondary">Para çek</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, logout } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const ITEMS = [["/hesap", "Hesap"], ["/hesap/tahminlerim", "Tahminlerim"], ["/hesap/islemler", "İşlemler"], ["/hesap/kuponlarim", "Kuponlarım"], ["/hesap/bonuslarim", "Bonuslarım"], ["/hesap/guvenlik", "Güvenlik"]];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-[42px] cursor-pointer items-center gap-2 rounded-lg pr-1 pl-1 text-sm font-bold transition-colors hover:bg-card md:pr-3">
        <Avatar src={me.avatar} name={me.username} className="size-[36px] ring-2 ring-primary/40" />
        <span className="hidden max-w-[110px] flex-col items-start leading-tight 2xl:flex"><span className="truncate">{me.username}</span><span className="text-[11px] font-semibold text-primary">{me.isVerified ? "Doğrulandı" : "Profil"}</span></span>
      </button>
      {open && (
        <div className="animate-slip-item absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-xl border border-line bg-panel py-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]">
          <Link to="/hesap" onClick={() => setOpen(false)} className="mx-1.5 mb-1 flex items-center gap-3 rounded-lg bg-card px-3 py-2.5 hover:bg-surface-hover">
            <Avatar src={me.avatar} name={me.username} className="size-10" />
            <span className="min-w-0"><span className="block truncate text-sm font-extrabold">{me.username}</span><span className="block text-[12px] font-semibold text-primary">Fotoğrafı değiştir</span></span>
          </Link>
          {ITEMS.map(([to, l]) => <Link key={to} to={to} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm font-semibold text-muted hover:bg-card hover:text-fg">{l}</Link>)}
          <div className="mx-3 my-1 h-px bg-line" />
          <button onClick={() => { logout(); setOpen(false); nav("/"); }} className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-loss hover:bg-card">Çıkış Yap</button>
        </div>
      )}
    </div>
  );
}

const NavPill = ({ to, icon, label }: { to: string; icon: string; label: string }) => {
  const { chatOpen } = useStore();
  return (
  <NavLink to={to} title={label} aria-label={label} className={({ isActive }) => `relative inline-flex h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold whitespace-nowrap transition-colors ${isActive ? "text-primary after:absolute after:inset-x-3 after:-bottom-[11px] after:h-[3px] after:rounded-full after:bg-primary" : "text-muted hover:text-fg"}`}>
    <I n={icon} className="size-4" /><span className={chatOpen ? "hidden 2xl:inline" : "hidden lg:inline"}>{label}</span>
  </NavLink>
  );
};

function Header() {
  const { me, setAuthOpen, setSidebarOpen, chatOpen, setChatOpen } = useStore();
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 h-[var(--header-h)] border-b border-line/60 bg-header">
      <div className="mx-auto flex h-full max-w-[1286px] items-center gap-2 px-4">
        <button onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç" className="mr-1 grid size-9 place-items-center rounded-lg text-muted hover:text-fg lg:hidden"><I n="menu" className="size-6" /></button>
        <Link to="/" className="mr-2 lg:hidden"><Logo className="h-7" /></Link>
        <nav className="hidden items-center gap-2 min-[480px]:flex">
          <NavPill to="/spor" icon="ball" label="Spor" />
          <NavPill to="/tahminler" icon="vote" label="Tahminler" />
          <NavPill to="/liderlik" icon="trophy" label="Liderlik" />
          <NavPill to="/promosyonlar" icon="gift" label="Promosyonlar" />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => nav("/spor")} aria-label="Ara" className="hidden size-[42px] place-items-center rounded-lg text-muted transition-colors hover:bg-card hover:text-fg xl:grid"><I n="search" className="size-[18px]" /></button>
          <button onClick={() => setChatOpen(!chatOpen)} aria-label="Sohbet" title="Sohbet" className={`hidden size-[42px] place-items-center rounded-lg transition-colors lg:grid ${chatOpen ? "bg-primary/15 text-primary" : "text-muted hover:bg-card hover:text-fg"}`}><I n="chat" className="size-[18px]" /></button>
          {me ? (
            <><WalletChip /><UserMenu /></>
          ) : (
            <>
              <button onClick={() => setAuthOpen(true)} className="btn btn-ghost">Giriş yap</button>
              <button onClick={() => setAuthOpen("register")} className="btn btn-primary">Kayıt ol</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------- Footer ----------------
function Footer() {
  const { settings, menus, predCats } = useStore();
  const cols: { title: string; links: { label: string; url: string }[] }[] = [
    { title: "Spor", links: [{ label: "Canlı bahis", url: "/spor?page=live" }, { label: "Maç öncesi", url: "/spor" }, { label: "Kuponlarım", url: "/hesap/kuponlarim" }] },
    { title: "Tahminler", links: [{ label: "Tüm tahminler", url: "/tahminler" }, ...predCats.slice(0, 4).map((c) => ({ label: c.name, url: `/tahminler?kategori=${c.slug}` })), { label: "Liderlik tablosu", url: "/liderlik" }] },
    ...(menus.footer ?? []),
    { title: "Destek", links: [{ label: "Promosyonlar", url: "/promosyonlar" }, { label: "VIP Kulübü", url: "/vip" }] },
  ];
  return (
    <footer className="mt-14 border-t border-line/60 bg-panel-deep">
      <div className="mx-auto grid max-w-[1286px] gap-10 px-4 py-12 md:grid-cols-[1.2fr_2fr]">
        <div>
          <Logo className="h-10" />
          <p className="mt-4 max-w-[300px] text-sm leading-relaxed text-subtle">Canlı bahisten tahmin pazarlarına; maçı oyna, gündemi tahmin et, doğru bildikçe kazan.</p>
          <div className="mt-5 flex gap-2">
            {settings.telegram && <a href={settings.telegram} target="_blank" rel="noreferrer" className="grid size-10 place-items-center rounded-lg bg-card text-muted hover:bg-surface-hover hover:text-fg"><I n="send" className="size-4" /></a>}
            <a href={settings.supportEmail ? `mailto:${settings.supportEmail}` : "#"} className="grid size-10 place-items-center rounded-lg bg-card text-muted hover:bg-surface-hover hover:text-fg"><I n="chat" className="size-4" /></a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {cols.map((c) => (
            <div key={c.title}>
              <div className="mb-3 text-[12px] font-extrabold text-soft">{c.title}</div>
              <ul className="space-y-2.5">
                {(c.links ?? []).map((l: any) => (
                  <li key={l.label}>{l.url?.startsWith("/") ? <Link to={l.url} className="text-sm font-medium text-subtle hover:text-fg">{l.label}</Link> : <a href={l.url} className="text-sm font-medium text-subtle hover:text-fg">{l.label}</a>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-line/60">
        <div className="mx-auto flex max-w-[1286px] flex-wrap items-center gap-4 px-4 py-5 text-xs font-medium text-dim">
          <span>{settings.licenseText ?? `${settings.siteName ?? "SportyBet"}, lisanslı olarak faaliyet gösteren bir firmadır.`}</span>
          <span className="ml-auto grid size-7 place-items-center rounded-full border border-loss text-[10px] font-extrabold text-loss">18+</span>
          <span>© {new Date().getFullYear()} {settings.siteName ?? "SportyBet"}. Tüm hakları saklıdır.</span>
        </div>
      </div>
    </footer>
  );
}

// ---------------- Mobil alt menü ----------------
function BottomNav() {
  const { setSidebarOpen, chatOpen, setChatOpen } = useStore();
  const nav = useNavigate();
  const items = [["/tahminler", "vote", "Tahminler"], ["/spor", "ball", "Spor"], ["/promosyonlar", "rewards", "Ödüller"]];
  const cls = (a: boolean) => `flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${a ? "text-primary" : "text-subtle"}`;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] grid-cols-6 border-t border-line/60 bg-header pb-[env(safe-area-inset-bottom)] lg:hidden">
      <button onClick={() => setSidebarOpen(true)} className={cls(false)}><span className="grid size-7 place-items-center rounded-full"><I n="menu" className="size-5" /></span>Menü</button>
      <button onClick={() => { setChatOpen(false); nav("/spor"); setTimeout(() => (document.getElementById("sb-search") as HTMLInputElement | null)?.focus(), 350); }} className={cls(false)}><span className="grid size-7 place-items-center rounded-full"><I n="search" className="size-5" /></span>Ara</button>
      {items.map(([to, icon, label]) => (
        <NavLink key={to} to={to} onClick={() => setChatOpen(false)} className={({ isActive }) => cls(isActive && !chatOpen)}>
          {({ isActive }) => <><span className={`grid size-7 place-items-center rounded-full ${isActive && !chatOpen ? "bg-primary/15" : ""}`}><I n={icon} className="size-5" /></span>{label}</>}
        </NavLink>
      ))}
      <button onClick={() => setChatOpen(!chatOpen)} className={cls(chatOpen)}><span className={`grid size-7 place-items-center rounded-full ${chatOpen ? "bg-primary/15" : ""}`}><I n="chat" className="size-5" /></span>Sohbet</button>
    </nav>
  );
}

// ---------------- Giriş / Kayıt ----------------
function AuthModal() {
  const { authOpen, setAuthOpen, refreshMe } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ username: "", password: "", email: "", phone: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (authOpen) { setMode(authOpen === "register" ? "register" : "login"); setErr(""); } }, [authOpen]);
  useEffect(() => { if (!authOpen) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setAuthOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [authOpen]);
  if (!authOpen) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const body = mode === "login" ? { username: f.username, password: f.password } : { username: f.username, password: f.password, email: f.email || undefined, phone: f.phone || undefined };
      const r = await api(`/api/auth/${mode}`, { method: "POST", json: body });
      setToken(r.token); await refreshMe(); setAuthOpen(false);
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setAuthOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={mode === "login" ? "Giriş yap" : "Kayıt ol"} className="animate-slip-reveal w-full max-w-[410px] rounded-2xl border border-line bg-panel p-6 shadow-[0_30px_80px_rgba(0,0,0,.6)]">
        <div className="mb-5 flex items-center justify-between">
          <Logo className="h-8" />
          <button onClick={() => setAuthOpen(false)} aria-label="Kapat" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-card hover:text-fg"><I n="x" className="size-5" /></button>
        </div>
        <div className="mb-5 grid grid-cols-2 rounded-lg bg-field p-1">
          {(["login", "register"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`h-10 rounded-md text-sm font-bold transition-colors ${mode === m ? "bg-elevated text-fg" : "text-subtle hover:text-fg"}`}>{m === "login" ? "Giriş yap" : "Kayıt ol"}</button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Kullanıcı adı"><input className={inp} autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus /></Field>
          {mode === "register" && <>
            <Field label="E-posta (isteğe bağlı)"><input className={inp} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Telefon (isteğe bağlı)"><input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          </>}
          <Field label="Şifre"><input className={inp} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <ErrBox e={err} />
          <Btn className="w-full" disabled={busy || !f.username || f.password.length < 6}>{mode === "login" ? "Giriş Yap" : "Hesap oluştur"}</Btn>
          {mode === "register" && <p className="text-center text-xs text-dim">Kayıt olarak 18 yaşından büyük olduğunu ve kullanıcı sözleşmesini kabul ettiğini onaylarsın.</p>}
        </form>
      </div>
    </div>
  );
}

// ---------------- Düzen ----------------
export default function Layout() {
  const loc = useLocation();
  const { chatOpen, setChatOpen } = useStore();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const bare = false;
  return (
    <div className={`min-h-dvh lg:pl-[var(--sidebar-w)] ${chatOpen ? "xl:pr-[340px]" : ""}`}>
      <a href="#icerik" className="sr-only z-[80] rounded-lg bg-primary px-4 py-2 font-bold text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">İçeriğe geç</a>
      <Sidebar />
      <Header />
      <main id="icerik" tabIndex={-1} className={bare ? "" : `mx-auto px-3 pt-4 pb-24 sm:px-4 lg:pb-10 ${loc.pathname.startsWith("/spor") ? "max-w-[1480px]" : "max-w-[1286px] pt-[22px]"}`}>
        <Outlet />
      </main>
      {!loc.pathname.startsWith("/spor") && <Footer />}
      <BottomNav />
      {chatOpen && (
        <aside className="fixed inset-x-0 top-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-[45] border-l border-line/60 lg:bottom-0 lg:left-auto lg:z-30 lg:w-[340px] xl:shadow-none lg:shadow-[-20px_0_50px_rgba(0,0,0,.45)]">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </aside>
      )}
      <WalletModal />
      <ProfileModal />
      <AuthModal />
    </div>
  );
}
