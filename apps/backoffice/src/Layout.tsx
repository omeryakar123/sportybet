import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, setToken, getSite, setSite } from "./api";

type Role = "SUPERADMIN" | "ADMIN" | "FINANCE" | "RISK" | "SUPPORT" | "CMS";
type Item = { to: string; label: string; roles?: Role[] };
type Group = { label: string; icon: string; to?: string; roles?: Role[]; items?: Item[] };

const ALL: Role[] = ["ADMIN", "FINANCE", "RISK", "SUPPORT", "CMS"];
export const NAV: Group[] = [
  { label: "Dashboard", icon: "▦", to: "/", roles: ["ADMIN", "FINANCE", "RISK", "SUPPORT"] },
  { label: "Oyuncular", icon: "👥", to: "/players", roles: ["ADMIN", "FINANCE", "RISK", "SUPPORT"] },
  { label: "Raporlar", icon: "📊", roles: ["ADMIN", "FINANCE", "RISK"], items: [
    { to: "/reports/sportsbook", label: "Sportsbook Raporu" },
    { to: "/reports/financial", label: "Finans Raporu" },
    { to: "/reports/bonus", label: "Bonus Raporu" },
    { to: "/reports/players", label: "Oyuncu Raporu" },
  ] },
  { label: "Finans", icon: "💳", roles: ["ADMIN", "FINANCE", "RISK"], items: [
    { to: "/finance/deposits", label: "Yatırım Talepleri" },
    { to: "/finance/withdrawals", label: "Çekim Talepleri" },
    { to: "/finance/transactions", label: "Tüm İşlemler" },
    { to: "/finance/payment-systems", label: "Ödeme Sistemleri", roles: ["ADMIN", "FINANCE"] },
  ] },
  { label: "Promosyon Araçları", icon: "🎁", roles: ["ADMIN", "RISK", "SUPPORT", "CMS", "FINANCE"], items: [
    { to: "/bonuses", label: "Bonuslar", roles: ["ADMIN", "RISK", "SUPPORT", "FINANCE"] },
    { to: "/bonus-requests", label: "Bonus Talepleri", roles: ["ADMIN", "RISK", "SUPPORT"] },
    { to: "/promo-codes", label: "Promo Kodlar", roles: ["ADMIN", "CMS"] },
  ] },
  { label: "Sportsbook", icon: "⚽", roles: ["ADMIN", "RISK", "SUPPORT", "FINANCE"], items: [
    { to: "/bets", label: "Spor Bahisleri" },
    { to: "/sportsbook", label: "Trading (Sportsbook)", roles: ["ADMIN", "RISK", "FINANCE"] },
  ] },
  { label: "Tahminler", icon: "🔮", roles: ["ADMIN", "RISK", "CMS", "SUPPORT", "FINANCE"], items: [
    { to: "/predictions", label: "Tahmin Piyasaları", roles: ["ADMIN", "RISK", "CMS", "SUPPORT"] },
    { to: "/prediction-positions", label: "Pozisyonlar", roles: ["ADMIN", "RISK", "SUPPORT", "FINANCE"] },
    { to: "/prediction-categories", label: "Kategoriler", roles: ["ADMIN", "RISK", "CMS"] },
    { to: "/prediction-settings", label: "Ayarlar / Feed / İçe Aktar", roles: ["ADMIN", "RISK"] },
  ] },
  { label: "Kullanıcı Yönetimi", icon: "👤", roles: ["ADMIN"], items: [
    { to: "/users", label: "Admin Kullanıcıları", roles: [] },
    { to: "/sites", label: "Siteler (Çoklu Site)", roles: ["ADMIN"] },
    { to: "/audit-logs", label: "İşlem Geçmişi (Audit)" },
    { to: "/system", label: "Sistem / Demo Veri", roles: [] },
  ] },
  { label: "CMS", icon: "🧩", roles: ["ADMIN", "CMS"], items: [
    { to: "/cms/banners", label: "Bannerlar" },
    { to: "/cms/promotions", label: "Promosyonlar" },
    { to: "/cms/pages", label: "Sayfalar" },
    { to: "/cms/settings", label: "Site Ayarları (Logo, SEO, Menü)" },
    { to: "/cms/css", label: "Web / Mobil CSS" },
  ] },
];

const EXTRA_TITLES: [RegExp, string][] = [[/^\/players\/\d+/, "Oyuncular › Oyuncu Detayı"], [/^\/predictions\/.+/, "Tahminler › Piyasa Detayı"], [/^\/profile/, "Profil"], [/^\/system/, "Sistem"], [/^\/sites/, "Kullanıcı Yönetimi › Siteler"]];
function pageTitle(path: string) {
  for (const [re, t] of EXTRA_TITLES) if (re.test(path)) return t;
  for (const g of NAV) {
    if (g.to && (g.to === path || (g.to !== "/" && path.startsWith(g.to)))) return g.label;
    const i = g.items?.find((i) => path === i.to || path.startsWith(i.to + "/"));
    if (i) return `${g.label} › ${i.label}`;
  }
  return "Dashboard";
}

export const can = (role: Role | undefined, roles?: Role[]) => role === "SUPERADMIN" || !roles || (!!role && roles.includes(role));

export default function Layout() {
  const nav = useNavigate(); const loc = useLocation();
  const [me, setMe] = useState<any>(null);
  const [now, setNow] = useState(new Date());
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sites, setSites] = useState<any[]>([]);
  useEffect(() => { api("/admin/me").then(setMe).catch(() => { setToken(null); nav("/login"); }); }, []);
  useEffect(() => { api("/admin/sites").then(setSites).catch(() => setSites([])); }, []);
  const curSite = getSite() || sites[0]?.code || "";
  const switchSite = (code: string) => { setSite(code === sites[0]?.code ? "" : code); location.reload(); };
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { // aktif grubu aç
    const g = NAV.find((g) => g.items?.some((i) => loc.pathname.startsWith(i.to)));
    if (g) setOpen((o) => ({ ...o, [g.label]: true }));
  }, [loc.pathname]);
  const role: Role | undefined = me?.role;
  const link = (active: boolean) => `flex items-center gap-3 rounded px-3 py-2 ${active ? "bg-bo-blue text-white" : "text-bo-text hover:bg-bo-head"}`;
  return (
    <div className="flex min-h-screen">
      <aside className={`${collapsed ? "w-14" : "w-[230px]"} sticky top-0 h-screen shrink-0 overflow-y-auto border-r border-bo-line bg-white transition-all`}>
        <div className="flex h-11 items-center gap-2 px-3">
          <button onClick={() => setCollapsed(!collapsed)} className="text-xl text-bo-blue">☰</button>
          {!collapsed && <span className="font-bold text-bo-blue">SportyBet BO</span>}
        </div>
        <nav className="flex flex-col gap-0.5 p-1.5">
          {NAV.filter((g) => can(role, g.roles ?? ALL)).map((g) => g.to ? (
            <NavLink key={g.label} to={g.to} end className={({ isActive }) => link(isActive)} title={g.label}><span className="w-5 text-center">{g.icon}</span>{!collapsed && g.label}</NavLink>
          ) : (
            <div key={g.label}>
              <button onClick={() => setOpen((o) => ({ ...o, [g.label]: !o[g.label] }))} className={`${link(false)} w-full`} title={g.label}>
                <span className="w-5 text-center">{g.icon}</span>{!collapsed && <><span className="flex-1 text-left">{g.label}</span><span className="text-xs text-bo-muted">{open[g.label] ? "▾" : "›"}</span></>}
              </button>
              {open[g.label] && !collapsed && (
                <div className="ml-6 flex flex-col border-l border-bo-line pl-2">
                  {g.items!.filter((i) => can(role, i.roles ?? g.roles)).map((i) => (
                    <NavLink key={i.to} to={i.to} className={({ isActive }) => `rounded px-2 py-1.5 text-[13px] ${isActive ? "text-bo-blue font-medium" : "text-bo-text hover:text-bo-blue"}`}>{i.label}</NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-11 items-center justify-end gap-6 border-b border-bo-line bg-white px-5 text-xs text-bo-blue">
          {sites.length > 0 && (
            <label className="flex items-center gap-1.5">
              <span className="text-bo-muted">Site:</span>
              <select value={curSite} onChange={(e) => switchSite(e.target.value)} className="rounded border border-bo-line bg-white px-2 py-1 text-xs font-semibold text-bo-blue outline-none">
                {sites.map((s) => <option key={s.code} value={s.code}>{s.name}{s.isActive ? "" : " (pasif)"}</option>)}
              </select>
            </label>
          )}
          <span>🕑 {now.toLocaleTimeString("tr-TR")}</span>
          <NavLink to="/profile" className="hover:underline">👤 {me?.username} <span className="text-bo-muted">({me?.role})</span></NavLink>
          <button onClick={() => { setToken(null); nav("/login"); }} className="text-bo-muted hover:text-bo-red">Çıkış</button>
        </header>
        <div className="flex h-11 items-center border-b border-bo-line bg-white px-5 text-[14px] text-bo-text">{pageTitle(loc.pathname)}</div>
        <main className="min-w-0 flex-1 p-4"><Outlet key={loc.pathname + loc.search} context={{ me }} /></main>
      </div>
    </div>
  );
}
