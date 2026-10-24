import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, setToken, getSite, setSite } from "./api";
import { BoIcon } from "./ui";

type Role = "SUPERADMIN" | "ADMIN" | "FINANCE" | "RISK" | "SUPPORT" | "CMS";
type Item = { to: string; label: string; roles?: Role[] };
type Group = { label: string; icon: string; to?: string; roles?: Role[]; items?: Item[] };

const ALL: Role[] = ["ADMIN", "FINANCE", "RISK", "SUPPORT", "CMS"];
export const NAV: Group[] = [
  { label: "Dashboard", icon: "dashboard", to: "/", roles: ["ADMIN", "FINANCE", "RISK", "SUPPORT"] },
  { label: "Oyuncular", icon: "players", to: "/players", roles: ["ADMIN", "FINANCE", "RISK", "SUPPORT"] },
  { label: "Raporlar", icon: "reports", roles: ["ADMIN", "FINANCE", "RISK"], items: [
    { to: "/reports/sportsbook", label: "Sportsbook Raporu" },
    { to: "/reports/financial", label: "Finans Raporu" },
    { to: "/reports/bonus", label: "Bonus Raporu" },
    { to: "/reports/players", label: "Oyuncu Raporu" },
  ] },
  { label: "Finans", icon: "finance", roles: ["ADMIN", "FINANCE", "RISK"], items: [
    { to: "/finance/deposits", label: "Yatırım Talepleri" },
    { to: "/finance/withdrawals", label: "Çekim Talepleri" },
    { to: "/finance/transactions", label: "Tüm İşlemler" },
    { to: "/finance/payment-systems", label: "Ödeme Sistemleri", roles: ["ADMIN", "FINANCE"] },
  ] },
  { label: "Promosyon Araçları", icon: "gift", roles: ["ADMIN", "RISK", "SUPPORT", "CMS", "FINANCE"], items: [
    { to: "/bonuses", label: "Bonuslar", roles: ["ADMIN", "RISK", "SUPPORT", "FINANCE"] },
    { to: "/bonus-requests", label: "Bonus Talepleri", roles: ["ADMIN", "RISK", "SUPPORT"] },
    { to: "/promo-codes", label: "Promo Kodlar", roles: ["ADMIN", "CMS"] },
  ] },
  { label: "Sportsbook", icon: "sport", roles: ["ADMIN", "RISK", "SUPPORT", "FINANCE"], items: [
    { to: "/bets", label: "Spor Bahisleri" },
    { to: "/sportsbook", label: "Trading (Sportsbook)", roles: ["ADMIN", "RISK", "FINANCE"] },
  ] },
  { label: "Tahminler", icon: "prediction", roles: ["ADMIN", "RISK", "CMS", "SUPPORT", "FINANCE"], items: [
    { to: "/predictions", label: "Tahmin Piyasaları", roles: ["ADMIN", "RISK", "CMS", "SUPPORT"] },
    { to: "/prediction-positions", label: "Pozisyonlar", roles: ["ADMIN", "RISK", "SUPPORT", "FINANCE"] },
    { to: "/prediction-categories", label: "Kategoriler", roles: ["ADMIN", "RISK", "CMS"] },
    { to: "/prediction-settings", label: "Ayarlar / Feed / İçe Aktar", roles: ["ADMIN", "RISK"] },
  ] },
  { label: "Sohbet", icon: "chat", to: "/chat", roles: ["ADMIN", "SUPPORT", "RISK", "CMS"] },
  { label: "Kullanıcı Yönetimi", icon: "users", roles: ["ADMIN"], items: [
    { to: "/users", label: "Admin Kullanıcıları", roles: [] },
    { to: "/sites", label: "Siteler (Çoklu Site)", roles: ["ADMIN"] },
    { to: "/audit-logs", label: "İşlem Geçmişi (Audit)" },
    { to: "/system", label: "Sistem / Demo Veri", roles: [] },
  ] },
  { label: "CMS", icon: "cms", roles: ["ADMIN", "CMS"], items: [
    { to: "/cms/home", label: "Anasayfa Düzeni" },
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
  const [collapsed, setCollapsedS] = useState(() => { try { return localStorage.getItem("bo_wide") !== "1"; } catch { return true; } });
  const setCollapsed = (v: boolean) => { setCollapsedS(v); try { localStorage.setItem("bo_wide", v ? "0" : "1"); } catch {} };
  const [fly, setFly] = useState<{ g: string; top: number } | null>(null);
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
  const groupActive = (g: Group) => g.to ? (g.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(g.to)) : !!g.items?.some((i) => loc.pathname === i.to || loc.pathname.startsWith(i.to + "/"));
  const groups = NAV.filter((g) => can(role, g.roles ?? ALL));
  const flyGroup = fly ? groups.find((g) => g.label === fly.g) : null;
  return (
    <div className="flex min-h-screen">
      {/* Sol ikon rayı (BC) — üzerine gelince alt menü paneli açılır; ☰ ile geniş mod */}
      <aside onMouseLeave={() => setFly(null)} className={`${collapsed ? "w-[50px]" : "w-[230px]"} sticky top-0 z-40 h-screen shrink-0 border-r border-bo-line bg-white transition-[width] duration-200`}>
        <div className="flex h-[45px] items-center px-[13px]">
          <button onClick={() => setCollapsed(!collapsed)} className="text-[#2e8ae6]" title="Menü"><BoIcon n="menu" className="size-6" /></button>
          {!collapsed && <span className="ml-3 truncate text-[15px] font-medium text-[#2e8ae6]">{sites.find((x) => x.code === curSite)?.name ?? "Backoffice"}</span>}
        </div>
        <nav className="flex h-[calc(100vh-45px)] flex-col gap-1 overflow-y-auto overflow-x-hidden px-[6px] pb-4 pt-1.5">
          {groups.map((g) => {
            const act = groupActive(g);
            const cls = `flex h-[36px] w-full items-center gap-3 rounded-[3px] px-[9px] text-[13px] transition-colors ${act ? "bg-[#2e8ae6] text-white" : "text-[#5b7db1] hover:bg-[#eaf3fc] hover:text-[#2e8ae6]"}`;
            const inner = <><BoIcon n={g.icon} className="size-[18px] shrink-0" />{!collapsed && <span className={`flex-1 truncate text-left ${act ? "text-white" : "text-bo-text"}`}>{g.label}</span>}{!collapsed && g.items && <span className={`text-[10px] ${act ? "text-white" : "text-bo-muted"}`}>{open[g.label] ? "▾" : "▸"}</span>}</>;
            const hover = (e: React.MouseEvent) => collapsed && setFly({ g: g.label, top: (e.currentTarget as HTMLElement).getBoundingClientRect().top });
            return (
              <div key={g.label} onMouseEnter={hover}>
                {g.to ? <NavLink to={g.to} end className={cls} title={collapsed ? "" : g.label}>{inner}</NavLink>
                  : <button onClick={() => collapsed ? nav(g.items!.find((i) => can(role, i.roles ?? g.roles))?.to ?? "/") : setOpen((o) => ({ ...o, [g.label]: !o[g.label] }))} className={cls}>{inner}</button>}
                {!collapsed && g.items && open[g.label] && (
                  <div className="mb-1 ml-[18px] flex flex-col border-l border-[#dbe7f3] pl-3">
                    {g.items.filter((i) => can(role, i.roles ?? g.roles)).map((i) => (
                      <NavLink key={i.to} to={i.to} className={({ isActive }) => `py-[7px] text-[13px] ${isActive ? "font-medium text-[#2e8ae6]" : "text-bo-text hover:text-[#2e8ae6]"}`}>{i.label}</NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        {collapsed && flyGroup && (
          <div className="fixed left-[50px] z-50 min-w-[220px] rounded-r-[3px] border border-l-0 border-bo-line bg-white py-1.5 shadow-[4px_6px_18px_rgba(16,24,40,.12)]" style={{ top: Math.max(4, fly!.top - 2) }}>
            <div className="border-b border-[#dbe7f3] px-4 pb-1.5 pt-1 text-[13px] font-medium text-[#2e8ae6]">{flyGroup.label}</div>
            {flyGroup.to ? <NavLink to={flyGroup.to} end onClick={() => setFly(null)} className="block px-4 py-2 text-[13px] text-bo-text hover:bg-[#eaf3fc] hover:text-[#2e8ae6]">{flyGroup.label}</NavLink>
              : flyGroup.items!.filter((i) => can(role, i.roles ?? flyGroup.roles)).map((i) => (
                <NavLink key={i.to} to={i.to} onClick={() => setFly(null)} className={({ isActive }) => `block px-4 py-2 text-[13px] ${isActive ? "bg-[#eaf3fc] text-[#2e8ae6]" : "text-bo-text hover:bg-[#eaf3fc] hover:text-[#2e8ae6]"}`}>{i.label}</NavLink>
              ))}
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[45px] items-center justify-end gap-5 bg-white px-5 text-[12px] text-[#2e8ae6] shadow-[0_1px_0_#e3e8ef]">
          {sites.length > 0 && (
            <label className="flex items-center gap-1.5">
              <BoIcon n="globe" className="size-4" />
              <select value={curSite} onChange={(e) => switchSite(e.target.value)} className="h-[26px] rounded-[2px] border border-[#d9dee6] bg-white px-2 text-[12px] text-[#2e8ae6] outline-none">
                {sites.map((s) => <option key={s.code} value={s.code}>{s.name}{s.isActive ? "" : " (pasif)"}</option>)}
              </select>
            </label>
          )}
          <span className="h-5 w-px bg-bo-line" />
          <span className="flex items-center gap-1.5 tabular-nums"><BoIcon n="clock" className="size-[18px]" />{now.toLocaleTimeString("tr-TR")}</span>
          <span className="h-5 w-px bg-bo-line" />
          <NavLink to="/profile" className="flex items-center gap-1.5 uppercase hover:underline"><BoIcon n="user" className="size-4" />{me?.username} <span className="normal-case text-bo-muted">({me?.role})</span></NavLink>
          <button onClick={() => { setToken(null); nav("/login"); }} className="flex items-center gap-1 text-bo-muted hover:text-bo-red" title="Çıkış"><BoIcon n="logout" className="size-[18px]" /></button>
        </header>
        <div className="flex h-[45px] items-center bg-[#f7f9fc] px-5 text-[14px] text-bo-text">{pageTitle(loc.pathname)}</div>
        <main className="min-w-0 flex-1 px-3 pb-4 pt-2"><Outlet key={loc.pathname + loc.search} context={{ me }} /></main>
      </div>
    </div>
  );
}
