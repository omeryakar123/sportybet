import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, asset, setToken } from "./api";
import { Avatar, Btn, ErrBox, Field, FlagTR, I, inp, money, pct, useStore, scrollMain } from "./lib";
import { LevelGem } from "./Misc";
import { Progress } from "./g";
import { ChatPanel, ProfileModal, WalletModal } from "./Social";
import { BannerImage } from "./CmsSlot";

function Logo({ className = "h-9", mobile }: { className?: string; mobile?: boolean }) {
  const { settings } = useStore();
  const src = asset((mobile && settings.logoMobileUrl) || settings.logoUrl);
  // Şimdilik logo kullanılmıyor — yalnızca CMS'ten bir logo yüklenirse gösterilir.
  if (!src) return <LogoMark className={className} text={!mobile} />;
  if (src) return <img src={src} alt={settings.siteName ?? ""} className={`${className} w-auto max-w-[220px] object-contain object-left`} draggable={false} />;
  return null;
}

/** Varsayılan logo (CMS'ten logo yüklenmediyse): kendi işaretimiz + site adı. Ana sayfaya dönüş noktası. */
function LogoMark({ className = "h-9", text = true }: { className?: string; text?: boolean }) {
  const { settings } = useStore();
  const name = settings.siteName ?? "SportyBet";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label={name}>
      <svg viewBox="0 0 40 40" className="h-full w-auto shrink-0" aria-hidden>
        <rect x="2" y="2" width="36" height="36" rx="11" fill="#00ff86" />
        <path d="M2 13a11 11 0 0 1 11-11h14a11 11 0 0 1 11 11v2H2Z" fill="#fff" opacity=".22" />
        <path d="M26.5 12.5c-1.6-1.4-3.9-2.2-6.4-2.2-4.2 0-7 2.2-7 5.4 0 3.1 2.4 4.3 6.2 5.1 2.6.6 3.5 1 3.5 2 0 1-1.1 1.7-2.9 1.7-2 0-3.9-.8-5.4-2.2l-2.6 3.3c2 1.9 4.9 3 8 3 4.6 0 7.4-2.3 7.4-5.6 0-3.1-2.2-4.4-6.3-5.3-2.6-.5-3.4-.9-3.4-1.8 0-.9.9-1.5 2.5-1.5 1.7 0 3.3.6 4.6 1.6Z" fill="#06090e" />
      </svg>
      {text && <span className="text-[19px] font-extrabold tracking-tight text-white">{name}</span>}
    </span>
  );
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
      <button onClick={() => setOpen(!open)} className="flex h-10 w-full items-center gap-2 px-3 text-[11px] font-extrabold uppercase tracking-wide text-soft">
        <span className="flex-1 text-left">{title}</span>
        <span className={`grid size-5 place-items-center rounded-full ${open ? "bg-primary/15 text-primary" : "bg-card text-subtle"}`}><I n={open ? "minus" : "plus"} className="size-3" /></span>
      </button>
      {open && <div className="px-1.5 pb-1.5">{children}</div>}
    </div>
  );
}
/** gamdom menü grubu satırı: 52px, #131a22, grubun dış köşeleri 16px, 2px aralık; açılır alt liste */
function MenuRow({ icon, label, to, children, badge }: { icon: string; label: string; to?: string; children?: React.ReactNode; badge?: string }) {
  const { setSidebarOpen } = useStore();
  const [open, setOpen] = useState(false);
  const inner = (
    <>
      <img src={icon} alt="" className="size-6 shrink-0 object-contain" />
      <p className="flex-1 truncate text-left text-[16px] font-bold text-white">{label}</p>
      {badge && <span className="rounded-lg bg-card-2 px-2 py-1 text-[12px] font-bold text-white">{badge}</span>}
      {children ? <I n="down" className={`size-5 text-subtle transition-transform ${open ? "rotate-180" : ""}`} /> : <I n="right" className="size-5 text-subtle" />}
    </>
  );
  const cls = "flex h-[52px] w-full items-center gap-[14px] bg-card px-4 transition-colors hover:bg-card-2";
  return (
    <div>
      {children ? <button onClick={() => setOpen(!open)} aria-expanded={open} className={cls}>{inner}</button> : <Link to={to!} onClick={() => setSidebarOpen(false)} className={cls}>{inner}</Link>}
      {children && open && <div className="bg-panel px-2 py-1.5">{children}</div>}
    </div>
  );
}

function SidebarBody() {
  const { predCats, settings, setSidebarOpen, menus } = useStore();
  const [lgs, setLgs] = useState<any[]>([]);
  useEffect(() => { api("/api/sb/leagues").then((r) => setLgs(r.slice(0, 10))).catch(() => {}); }, []);
  const total = predCats.reduce((a, c) => a + (c.activeCount ?? 0), 0);
  // CMS › Site Ayarları › Menüler › "sidebar" bu gruba eklenir
  const extra: any[] = Array.isArray(menus.sidebar) && menus.sidebar.length ? menus.sidebar : [];
  const close = () => setSidebarOpen(false);
  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-4">
      <div className="flex flex-col gap-0.5 overflow-hidden rounded-2xl">
        <MenuRow icon="/img/ic-ball.svg" label="Spor">
          <SideLink to="/spor" icon="calendar" label="Maç Öncesi" exact />
          <SideLink to="/spor?page=live" icon="live" label="Canlı Bahis" />
          {lgs.map((l) => (
            <Link key={l.id} to={`/spor?lig=${l.id}`} onClick={close} className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] font-semibold text-muted hover:bg-card hover:text-fg">
              {l.logo ? <img src={l.logo} alt="" className="size-4 object-contain" /> : <I n="ball" className="size-4" />}
              <span className="flex-1 truncate">{l.name}</span><span className="text-[11px] font-bold text-dim">{l.count}</span>
            </Link>
          ))}
        </MenuRow>
        <MenuRow icon="/img/ic-chart.svg" label="Tahminler">
          <SideLink to="/tahminler" icon="grid" label="Tüm Tahminler" count={total} exact />
          {predCats.filter((c) => c.activeCount > 0).map((c) => <SideLink key={c.id} to={`/tahminler?kategori=${c.slug}`} icon="hash" label={c.name} count={c.activeCount} />)}
        </MenuRow>
        <MenuRow icon="/img/ic-flame.svg" label="Ödüller">
          <SideLink to="/oduller" icon="rewards" label="Ödüller ve Seviyeler" />
          <SideLink to="/promosyonlar" icon="gift" label="Promosyonlar" />
          <SideLink to="/hesap/bonuslarim" icon="gift" label="Bonuslarım" />
        </MenuRow>
        {extra.map((l) => <MenuRow key={l.url} icon={l.iconUrl ? asset(l.iconUrl) : "/img/ic-live.svg"} label={l.label} to={l.url} badge={l.badge} />)}
        <MenuRow icon="/img/ic-live.svg" label="Kuponlarım" to="/hesap/kuponlarim" />
      </div>
      <Link to="/liderlik" onClick={close} className="mt-4 flex h-[62px] items-center gap-2 rounded-2xl bg-card px-2 transition-colors hover:bg-card-2">
        <img src="/img/ic-trophy.svg" alt="" className="h-10 w-[50px] object-contain" />
        <p className="flex-1 text-[16px] font-bold text-white">Liderlik Tablosu</p>
        <span className="grid h-[43px] place-items-center rounded-lg bg-card-2 px-3 text-[14px] font-bold text-caution">TOP 100</span>
      </Link>
      <div className="mt-auto flex gap-2 pt-4">
        <span className="flex h-11 flex-1 items-center gap-2.5 rounded-[10px] bg-card-2 px-4 text-[14px] font-medium"><FlagTR className="h-[14px] w-5 rounded-sm" />Türkçe</span>
        <a href={settings.supportUrl || (settings.supportEmail ? `mailto:${settings.supportEmail}` : "#")} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-2 rounded-[10px] bg-card px-4 text-[14px] font-bold text-white hover:bg-card-2"><I n="chat" className="size-5" />Canlı Destek</a>
      </div>
    </nav>
  );
}

function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useStore();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col bg-page lg:flex">
        <div className="flex h-[var(--header-h)] shrink-0 items-center gap-3 pl-5">
          <Link to="/" aria-label="Ana sayfa"><Logo /></Link>
        </div>
        <SidebarBody />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-x-0 top-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-50 lg:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-[rgba(8,13,19,.76)]" />
          <aside className="animate-menu-in absolute inset-0 flex flex-col bg-page" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-[52px] shrink-0 items-center px-6">
              <p className="flex-1 text-[14px] font-bold text-white">Menü</p>
              <button onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat" className="grid size-8 place-items-center text-subtle hover:text-fg"><I n="x" className="size-6" /></button>
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
      <div className="flex h-[46px] items-center rounded-[10px] border border-transparent bg-white/[.05] p-[3px] pl-2.5">
        <button onClick={() => { setOpen(!open); refreshMe(); }} className="flex h-full min-w-[96px] cursor-pointer items-center gap-2 pr-2 text-sm font-bold sm:min-w-[120px]">
          <span className={`grid size-6 place-items-center rounded-[6px] text-[15px] font-bold ${active === "BONUS" ? "bg-caution text-[#2a1d00]" : "bg-[#4fd35a] text-white"}`}>₺</span>
          <span className="num flex-1 text-left text-[14px] font-bold text-fg">{money(balance(active as any)).replace("₺", "")}</span>
          {active === "BONUS" && <span className="hidden rounded-sm bg-caution/20 px-1 text-[10px] font-extrabold text-caution sm:inline">Bonus</span>}
          <svg viewBox="0 0 10 10" className="size-2.5 text-subtle" fill="currentColor"><path d="M1 3h8L5 8z" /></svg>
        </button>
        <button onClick={() => setWalletOpen("menu")} className="btn btn-primary h-full rounded-[10px] px-3 text-[15px] sm:px-4">Cüzdan</button>
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
            <button onClick={() => { setOpen(false); setWalletOpen("deposit"); }} className="btn btn-primary">Para yatır</button>
            <button onClick={() => { setOpen(false); setWalletOpen("withdraw"); }} className="btn btn-secondary">Para çek</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** gamdom kullanıcı menüsü: avatar + seviye + ilerleme, ikonlu satırlar, en altta çıkış */
const USER_ITEMS: [string, string, string][] = [["/hesap", "user", "Profil"], ["/oduller", "rewards", "Ödüller"], ["/hesap/kuponlarim", "ticket", "Kuponlarım"], ["/hesap/tahminlerim", "vote", "Tahminlerim"], ["/hesap/islemler", "list", "İşlemler"], ["/hesap/bonuslarim", "gift", "Bonuslarım"], ["/hesap/guvenlik", "shield", "Güvenlik"]];
function UserPanel({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const { me } = useStore();
  const [st, setSt] = useState<any>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { api("/api/me/stats").then(setSt).catch(() => {}); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const lv = st?.levels?.[st.level]; const nx = st?.nextLevel != null ? st.levels[st.nextLevel] : null;
  const body = (
    <>
      <div className="px-[11px] pt-3">
        <div className="flex items-center gap-2.5 pr-10">
          <Avatar src={me.avatar} name={me.username} className="size-[35px] !rounded-lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><p className="truncate text-[14px] font-medium">{me.username}</p>
              <button onClick={() => { navigator.clipboard?.writeText(me.username); setCopied(true); setTimeout(() => setCopied(false), 1200); }} aria-label="Kullanıcı adını kopyala" className="grid h-4 w-6 place-items-center rounded-lg bg-white/[.05] text-subtle hover:text-fg"><I n={copied ? "check" : "copy"} className="size-3" /></button></div>
            {lv && <div className="flex items-center gap-1"><LevelGem name={lv.name} size={16} /><p className="text-[14px] font-medium">{lv.name}</p></div>}
          </div>
        </div>
        {st && <>
          <div className="mt-3 flex items-center gap-1.5 text-[12px] font-bold"><p className="flex-1">%{(st.progress ?? 0).toFixed(2)}</p>{nx && <><LevelGem name={nx.name} size={20} /><p>{nx.name}</p></>}</div>
          <div className="mt-2"><Progress value={st.progress} h={4} /></div>
        </>}
      </div>
      <nav className="mt-3 px-[11px] pb-2">
        {USER_ITEMS.map(([to, ic, l]) => (
          <Link key={to} to={to} onClick={onClose} className="flex h-[43px] items-center gap-2.5 rounded-lg px-1 text-[14px] font-medium text-white transition-colors hover:text-primary"><I n={ic} className="size-6 text-subtle" />{l}</Link>
        ))}
        <button onClick={onLogout} className="flex h-[43px] w-full items-center gap-2.5 px-1 text-[14px] font-medium text-white hover:text-loss"><I n="logout" className="size-6 text-subtle" />Çıkış yap</button>
      </nav>
    </>
  );
  // tek kopya çiz (gizli kopyadaki SVG gradyanları görünen kopyayı bozar)
  const desk = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  if (desk) return <div className="animate-slip-item absolute right-0 top-[calc(100%+10px)] z-50 w-[300px] rounded-2xl bg-panel shadow-[0_18px_50px_rgba(0,0,0,.55)]">{body}</div>;
  return (
    <>
      {/* mobil: tam ekran alt sayfa */}
      <div className="fixed inset-0 z-[60] bg-[rgba(6,9,14,.9)] lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <section className="animate-sheet absolute inset-x-1 top-4 bottom-0 overflow-y-auto rounded-t-2xl bg-panel">
          <button onClick={onClose} aria-label="Kapat" className="absolute right-3 top-3 grid size-8 place-items-center text-subtle hover:text-fg"><I n="x" className="size-6" /></button>
          {body}
        </section>
      </div>
    </>
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
        <Avatar src={me.avatar} name={me.username} className="size-9 !rounded-lg" />
        <span className="hidden max-w-[110px] flex-col items-start leading-tight 2xl:flex"><span className="truncate">{me.username}</span><span className="text-[11px] font-semibold text-primary">{me.isVerified ? "Doğrulandı" : "Profil"}</span></span>
      </button>
      {open && <UserPanel onClose={() => setOpen(false)} onLogout={() => { logout(); setOpen(false); nav("/"); }} />}
    </div>
  );
}

const NavPill = ({ to, icon, label }: { to: string; icon: string; label: string }) => (
  <NavLink to={to} title={label} className={({ isActive }) => `inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-subtle hover:text-fg"}`}>
    <I n={icon} className="size-4 lg:hidden" /><span className="hidden lg:inline">{label}</span>
  </NavLink>
);

function Header() {
  const { me, setAuthOpen, setSidebarOpen, chatOpen, setChatOpen } = useStore();
  const nav = useNavigate();
  return (
    <header className="relative z-30 h-[var(--header-h)] shrink-0 border-b border-white/[.04] bg-[rgba(8,13,19,.75)] backdrop-blur-[12px] transition-[background-color] duration-200">
      <div className="mx-auto flex h-full max-w-[1286px] items-center gap-2 px-4">
        <button onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç" className="mr-1 hidden size-9 place-items-center rounded-lg text-muted hover:text-fg"><I n="menu" className="size-6" /></button>
        <Link to="/" className="mr-2 shrink-0 lg:hidden"><Logo className="h-9" mobile /></Link>
        <nav className="hidden items-center gap-2 min-[480px]:flex">
          <NavPill to="/spor" icon="ball" label="Spor" />
          <NavPill to="/tahminler" icon="vote" label="Tahminler" />
          <NavPill to="/liderlik" icon="trophy" label="Liderlik" />
          <NavPill to="/promosyonlar" icon="gift" label="Promosyonlar" />
        </nav>
        <div className="flex flex-1 items-center gap-2 max-lg:justify-between lg:ml-auto lg:flex-none">
          <button onClick={() => nav("/spor")} aria-label="Ara" className="hidden size-[42px] place-items-center rounded-lg text-muted transition-colors hover:bg-card hover:text-fg xl:grid"><I n="search" className="size-[18px]" /></button>
          <button onClick={() => setChatOpen(!chatOpen)} aria-label="Sohbet" title="Sohbet" className={`hidden size-[42px] place-items-center rounded-lg transition-colors lg:grid ${chatOpen ? "bg-primary/15 text-primary" : "text-muted hover:bg-card hover:text-fg"}`}><I n="chat" className="size-[18px]" /></button>
          {me ? (
            <><div className="max-lg:mx-auto"><WalletChip /></div><UserMenu /></>
          ) : (
            <>
              <button onClick={() => setAuthOpen(true)} className="btn btn-ghost max-lg:ml-auto">Giriş yap</button>
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
    { title: "Destek", links: [{ label: "Promosyonlar", url: "/promosyonlar" }, { label: "Ödüller", url: "/oduller" }] },
  ];
  const [open, setOpen] = useState<string | null>(null);
  const L = (l: any) => l.url?.startsWith("/") ? <Link to={l.url} className="text-[14px] font-medium text-subtle hover:text-fg">{l.label}</Link> : <a href={l.url} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-subtle hover:text-fg">{l.label}</a>;
  const socials = [["telegram", "send"], ["instagram", "camera"], ["x", "x"], ["youtube", "play"]].filter(([k]) => settings[k]);
  return (
    <footer className="mx-auto mt-12 max-w-[1286px] px-3 pb-8 sm:px-4">
      <div className="mb-6"><Logo className="h-[31px]" /></div>
      {/* mobil: akordeon grup */}
      <div className="flex flex-col gap-0.5 overflow-hidden rounded-2xl md:hidden">
        {cols.map((c) => (
          <div key={c.title} className="bg-panel">
            <button onClick={() => setOpen(open === c.title ? null : c.title)} aria-expanded={open === c.title} className="flex h-14 w-full items-center px-3 text-left">
              <p className="flex-1 text-[14px] font-medium text-white">{c.title}</p>
              <span className="grid size-6 place-items-center rounded-full bg-elevated"><I n="down" className={`size-4 transition-transform ${open === c.title ? "rotate-180" : ""}`} /></span>
            </button>
            {open === c.title && <ul className="space-y-3 px-3 pb-4">{(c.links ?? []).map((l: any) => <li key={l.label}>{L(l)}</li>)}</ul>}
          </div>
        ))}
      </div>
      {/* masaüstü: sütunlar */}
      <div className="hidden gap-8 md:grid md:grid-cols-4 xl:grid-cols-6">
        {cols.map((c) => (
          <div key={c.title}>
            <div className="mb-4 text-[14px] font-bold text-white">{c.title}</div>
            <ul className="space-y-3">{(c.links ?? []).map((l: any) => <li key={l.label}>{L(l)}</li>)}</ul>
          </div>
        ))}
      </div>
      {socials.length > 0 && (
        <div className="mt-6 flex gap-2">
          {socials.map(([k, ic]) => <a key={k} href={settings[k]} target="_blank" rel="noreferrer" aria-label={k} className="grid size-9 place-items-center rounded-[10px] bg-card text-subtle hover:text-fg"><I n={ic} className="size-[18px]" /></a>)}
        </div>
      )}
      <div className="mt-8 flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-loss text-[11px] font-bold text-loss">18+</span>
        <p className="text-[12px] font-medium leading-relaxed text-subtle">{settings.licenseText ?? `${settings.siteName ?? "SportyBet"} lisanslı olarak faaliyet gösterir. Bahis 18 yaş altı için yasaktır; sorumlu oyna.`}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-full items-center gap-2.5 rounded-[10px] bg-card-2 px-4 text-[14px] font-medium sm:w-auto"><FlagTR className="h-[14px] w-5 rounded-sm" />Türkçe</span>
        <span className="text-[12px] font-medium text-subtle sm:ml-auto">© {new Date().getFullYear()} {settings.siteName ?? "SportyBet"}</span>
      </div>
    </footer>
  );
}

// ---------------- Mobil alt menü ----------------
/** gamdom alt menü ikonları: dolgulu, 24×22 */
const BN_ICONS: Record<string, React.ReactNode> = {
  menu: <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15a1.5 1.5 0 0 1 0 3h-15A1.5 1.5 0 0 1 3 5.5Zm0 6.5A1.5 1.5 0 0 1 4.5 10.5h15a1.5 1.5 0 0 1 0 3h-15A1.5 1.5 0 0 1 3 12Zm1.5 5h15a1.5 1.5 0 0 1 0 3h-15a1.5 1.5 0 0 1 0-3Z" />,
  search: <path fillRule="evenodd" d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.1 4.1a1.5 1.5 0 0 1-2.12 2.12l-4.1-4.1A7.5 7.5 0 1 1 10.5 3Zm0 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />,
  vote: <path fillRule="evenodd" d="M6 2h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm1.5 14a1.5 1.5 0 0 0 3 0v-3a1.5 1.5 0 0 0-3 0v3Zm4.5 0a1.5 1.5 0 0 0 3 0V8a1.5 1.5 0 0 0-3 0v8Zm4.5 0a1.5 1.5 0 0 0 3 0v-5a1.5 1.5 0 0 0-3 0v5Z" />,
  ball: <path fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 5.2-3.3 2.4 1.26 3.9h4.08l1.26-3.9L12 7.2Zm-1.2-3.05A8 8 0 0 0 5.6 7.3l1.95.25 2.75-2-.5-1.4ZM4 12.4a8 8 0 0 0 1.7 4.6l1-1.7-1.05-3.25L4 12.4Zm4 6.6a8 8 0 0 0 8 0l-.85-1.75h-6.3L8 19Zm10.3-2a8 8 0 0 0 1.7-4.6l-1.65-.35-1.05 3.25 1 1.7Zm.1-9.7a8 8 0 0 0-5.2-3.15l-.5 1.4 2.75 2 1.95-.25Z" />,
  rewards: <path d="M4 10h7v11H6a2 2 0 0 1-2-2v-9Zm9 0h7v9a2 2 0 0 1-2 2h-5V10ZM3 7a2 2 0 0 1 2-2h2.2A3 3 0 0 1 12 2.6 3 3 0 0 1 16.8 5H19a2 2 0 0 1 2 2v1.5H3V7Zm6-1.5a1 1 0 0 0 0 2h2v-1a1 1 0 0 0-1-1H9Zm6 0a1 1 0 0 0-1 1v1h1a1 1 0 0 0 0-2Z" />,
  chat: <path fillRule="evenodd" d="M12 3c5.25 0 9.5 3.7 9.5 8.25S17.25 19.5 12 19.5c-1 0-1.97-.13-2.88-.38L4.6 21a.75.75 0 0 1-1-.9l1.13-3.38A7.9 7.9 0 0 1 2.5 11.25C2.5 6.7 6.75 3 12 3Zm-4 7a1.25 1.25 0 1 0 0 2.5A1.25 1.25 0 0 0 8 10Zm4 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4 0a1.25 1.25 0 1 0 0 2.5A1.25 1.25 0 0 0 16 10Z" />,
};
const BNI = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" className="h-[22px] w-6" fill="currentColor" aria-hidden>{BN_ICONS[n]}</svg>;
function BottomNav() {
  const { sidebarOpen, setSidebarOpen, chatOpen, setChatOpen } = useStore();
  const nav = useNavigate();
  const items = [["/tahminler", "vote", "Tahminler"], ["/spor", "ball", "Spor"], ["/oduller", "rewards", "Ödüller"]];
  const cls = (a: boolean) => `flex flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors ${a ? "text-white" : "text-subtle hover:text-fg"}`;
  return (
    <nav className="relative z-40 grid h-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] shrink-0 grid-cols-6 bg-page px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <button onClick={() => { setChatOpen(false); setSidebarOpen(!sidebarOpen); }} className={cls(sidebarOpen)}><BNI n="menu" />Menü</button>
      <button onClick={() => { setChatOpen(false); nav("/spor"); setTimeout(() => (document.getElementById("sb-search") as HTMLInputElement | null)?.focus(), 350); }} className={cls(false)}><BNI n="search" />Ara</button>
      {items.map(([to, icon, label]) => (
        <NavLink key={to} to={to} onClick={() => { setChatOpen(false); setSidebarOpen(false); }} className={({ isActive }) => cls(isActive && !chatOpen && !sidebarOpen)}>
          <><BNI n={icon} />{label}</>
        </NavLink>
      ))}
      <button onClick={() => { setSidebarOpen(false); setChatOpen(!chatOpen); }} className={cls(chatOpen)}><BNI n="chat" />Sohbet</button>
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
        <BannerImage key={mode} group={mode === "login" ? "login-modal" : "register-modal"} className="-mx-6 -mt-6 mb-5 h-36 w-[calc(100%+48px)] max-w-none rounded-t-2xl object-cover" />
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
  useEffect(() => { scrollMain(0, 0); }, [loc.pathname]);
  const bare = false;
  return (
    <div className={`flex h-dvh flex-col lg:pl-[var(--sidebar-w)] ${chatOpen ? "xl:pr-[340px]" : ""}`}>
      <a href="#icerik" className="sr-only z-[80] rounded-lg bg-primary px-4 py-2 font-bold text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">İçeriğe geç</a>
      <Sidebar />
      <Header />
      <div id="scroller" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <main id="icerik" tabIndex={-1} className={bare ? "" : `mx-auto px-3 pt-4 pb-6 sm:px-4 lg:pb-10 ${loc.pathname.startsWith("/spor") ? "max-w-[1480px]" : "max-w-[1286px] pt-[18px] lg:pt-6"}`}>
          <Outlet />
        </main>
        {!loc.pathname.startsWith("/spor") && <Footer />}
      </div>
      <BottomNav />
      {chatOpen && (
        <aside className="fixed inset-x-0 top-[var(--header-h)] bottom-0 z-[45] lg:top-0 lg:left-auto lg:z-30 lg:w-[340px] xl:shadow-none lg:shadow-[-20px_0_50px_rgba(0,0,0,.45)]">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </aside>
      )}
      <WalletModal />
      <ProfileModal />
      <AuthModal />
    </div>
  );
}
