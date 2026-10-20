import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { setToken } from "./api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/players", label: "Oyuncular", icon: "👥" },
  { to: "/bets", label: "Spor Bahisleri", icon: "⚽" },
  { to: "/sportsbook", label: "Sportsbook (Betco)", icon: "🔌" },
  { to: "/bonuses", label: "Bonuslar", icon: "🎁" },
  { to: "/promo-codes", label: "Promo Kodlar", icon: "🏷" },
  { to: "/cms/banners", label: "CMS · Bannerlar", icon: "🖼" },
  { to: "/cms/promotions", label: "CMS · Promosyonlar", icon: "📣" },
  { to: "/cms/css", label: "CMS · CSS", icon: "</>" },
];

export default function Layout() {
  const nav = useNavigate();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="flex min-h-screen">
      <aside className="w-[200px] shrink-0 border-r border-bo-line bg-white">
        <div className="flex h-11 items-center px-4 font-bold text-bo-blue">SportyBet BO</div>
        <nav className="flex flex-col">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 ${isActive ? "bg-bo-blue text-white" : "text-bo-text hover:bg-bo-head"}`}>
              <span className="w-5 text-center">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 items-center justify-end gap-6 border-b border-bo-line bg-white px-5 text-xs text-bo-blue">
          <span>sportybet</span>
          <span>🕑 {now.toLocaleTimeString("tr-TR")}</span>
          <button onClick={() => { setToken(null); nav("/login"); }} className="text-bo-muted hover:text-bo-red">ADMIN · Çıkış</button>
        </header>
        <main className="min-w-0 flex-1 p-4"><Outlet /></main>
      </div>
    </div>
  );
}
