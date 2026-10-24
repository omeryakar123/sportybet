import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

// ---------- biçimleme ----------
export const money = (v: any) => "₺" + Number(v ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (v: any) => "₺" + Number(v ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
export const pct = (p: any) => `${Math.round(Number(p ?? 0))} %`;
export const dt = (v: any) => (v ? new Date(v).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export const dateTR = (v: any) => (v ? new Date(v).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }) : "");
export function timeLeft(v: any) {
  if (!v) return "";
  const ms = new Date(v).getTime() - Date.now();
  if (ms <= 0) return "kapandı";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d} gün ${h % 24} sa`;
  if (h > 0) return `${h} sa ${m % 60} dk`;
  return `${m} dk`;
}
export const TX_TR: Record<string, string> = {
  DEPOSIT: "Para Yatırma", WITHDRAWAL: "Para Çekme", WITHDRAWAL_REFUND: "Çekim İadesi", BET_STAKE: "Spor Bahsi", BET_WIN: "Bahis Kazancı",
  BET_REFUND: "Bahis İadesi", BONUS_GRANT: "Bonus", BONUS_CONVERT: "Bonus Dönüşümü", BONUS_EXPIRE: "Bonus Süresi Doldu", BONUS_CANCEL: "Bonus İptali",
  ADJUSTMENT: "Düzeltme", CORRECTION_UP: "Düzeltme", CORRECTION_DOWN: "Düzeltme",
  TIP_SEND: "Bahşiş (gönderilen)", TIP_RECEIVE: "Bahşiş (gelen)", RAIN_SEND: "Sohbet Yağmuru", RAIN_RECEIVE: "Yağmur Payı", RAIN_REFUND: "Yağmur İadesi",
  DEPOSIT_REVERSAL: "Yatırım Geri Alındı", WITHDRAWAL_REVERSAL: "Çekim İadesi",
  PREDICTION_BUY: "Tahmin", PREDICTION_SELL: "Tahmin Bozdurma", PREDICTION_WIN: "Tahmin Kazancı", PREDICTION_REFUND: "Tahmin İadesi",
};

// ---------- ikonlar (stroke tabanlı, currentColor) ----------
const PATHS: Record<string, React.ReactNode> = {
  menu: <><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  gift: <><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8" /><path d="M12 8v13" /><path d="M12 8s-4.5.2-5.5-2C5.8 4.4 7.5 3 9 3.5 11 4.2 12 8 12 8Zm0 0s4.5.2 5.5-2c.7-1.6-1-3-2.5-2.5C13 4.2 12 8 12 8Z" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="15" r="1" fill="currentColor" stroke="none" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5 16 10.5l-1.5 4.5h-5L8 10.5Z" /><path d="M12 3v4.5M16 10.5l4.3-1.4M14.5 15l2.6 3.7M9.5 15l-2.6 3.7M8 10.5 3.7 9.1" /></>,
  vote: <><path d="m9 11.5 2 2 4-4.5" /><path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11H5V7Z" /><path d="M22 18H2" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" /><path d="M12 13v3" /><path d="M8 20h8l-1-4h-6Z" /></>,
  ticket: <><path d="M4 7h16v3.5a1.5 1.5 0 0 0 0 3V17H4v-3.5a1.5 1.5 0 0 0 0-3Z" /><path d="M13.5 7v2M13.5 15v2M13.5 11v2" /></>,
  live: <><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /><path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2" /><path d="M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  right: <path d="m9 18 6-6-6-6" />,
  left: <path d="m15 18-6-6 6-6" />,
  down: <path d="m6 9 6 6 6-6" />,
  up: <path d="m6 15 6-6 6 6" />,
  x: <path d="M5 5l14 14M19 5 5 19" />,
  check: <path d="m4 12.5 5.5 5.5L20 6.5" />,
  bookmark: <path d="M6 3h12v18l-6-4.5L6 21Z" />,
  spark: <path d="M12 2.5 13.8 9a1.5 1.5 0 0 0 1.2 1.2l6.5 1.8-6.5 1.8a1.5 1.5 0 0 0-1.2 1.2L12 21.5 10.2 15a1.5 1.5 0 0 0-1.2-1.2L2.5 12l6.5-1.8A1.5 1.5 0 0 0 10.2 9Z" />,
  chat: <><path d="M4 5h16v11H9l-5 4Z" /></>,
  send: <><path d="m21 3-9.5 9.5" /><path d="M21 3 14 21l-2.5-8.5L3 10Z" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z" /><path d="m9 11.5 2 2 4-4" /></>,
  crown: <><path d="m4 8 4 4 4-7 4 7 4-4-1.5 10h-13Z" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" /></>,
  hash: <><path d="M9 3 7 21M17 3l-2 18M4 8.5h17M3 15.5h17" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  arrowdown: <><path d="M12 4v13" /><path d="m6 12 6 6 6-6" /></>,
  arrowup: <><path d="M12 20V7" /><path d="m6 12 6-6 6 6" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 3v4h-4" /></>,
  headset: <><path d="M4 13a8 8 0 0 1 16 0" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /><path d="M19 19a3 3 0 0 1-3 2h-3" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.4-4.6.2 1.6 1 2.6 2.1 3C11 8.6 11.3 5.6 12 3Z" />,
  play: <path d="M8 5v14l11-7Z" fill="currentColor" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4Z" /><circle cx="12" cy="13" r="3.5" /></>,
  rewards: <><circle cx="12" cy="9" r="5" /><path d="m8.5 13-1.5 8 5-3 5 3-1.5-8" /></>,
  deposit: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M3 11h18" /><path d="M12 2.5v6.5M9.5 6.5 12 9l2.5-2.5" /></>,
  withdraw: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M3 11h18" /><path d="M12 9V2.5M9.5 5 12 2.5 14.5 5" /></>,
  promo: <><path d="M4 7h16v3.5a1.5 1.5 0 0 0 0 3V17H4v-3.5a1.5 1.5 0 0 0 0-3Z" /><path d="m9.5 14.5 5-5" /><circle cx="9.8" cy="9.8" r=".9" fill="currentColor" stroke="none" /><circle cx="14.2" cy="14.2" r=".9" fill="currentColor" stroke="none" /></>,
  tip: <><circle cx="15.5" cy="7" r="3.5" /><path d="M15.5 5.6v2.8" /><path d="M2.5 14.5h3l3 .5h3a1.5 1.5 0 0 1 0 3H9" /><path d="M5.5 14.5v6M5.5 20.5h8.2l6.3-4.2a1.6 1.6 0 0 0-1.8-2.6L14 16" /></>,
  history: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  rain: <><path d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 .5 7.5Z" /><path d="m8 18-1 3M12.5 18l-1 3M17 18l-1 3" /></>,
  coin: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.66 3.13 3 7 3s7-1.34 7-3V7" /><path d="M5 12v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18" /></>,
  medal: <><path d="M8 3h8l-2.2 6H10.2Z" /><circle cx="12" cy="15" r="6" /><path d="m12 12.2.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3Z" fill="currentColor" stroke="none" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
};
export function I({ n, className = "size-4" }: { n: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[n] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

// ---------- küresel durum: oyuncu + site ayarları ----------
type Store = {
  me: any; refreshMe: () => Promise<void>; logout: () => void;
  settings: any; menus: any; predCats: any[];
  authOpen: boolean; setAuthOpen: (v: boolean | "register") => void;
  sidebarOpen: boolean; setSidebarOpen: (v: boolean) => void;
  chatOpen: boolean; setChatOpen: (v: boolean) => void;
  profileId: number | null; openProfile: (id: number | null) => void;
  walletOpen: false | "menu" | "promo" | "tip"; setWalletOpen: (v: false | "menu" | "promo" | "tip") => void;
  tipTo: string; setTipTo: (u: string) => void;
  balance: (t: "MAIN" | "BONUS") => number;
  setWallet: (w: "MAIN" | "BONUS") => Promise<void>;
};
const Ctx = createContext<Store>(null as any);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [menus, setMenus] = useState<any>({});
  const [predCats, setPredCats] = useState<any[]>([]);
  const [authOpen, setAuthOpen] = useState<any>(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpenS] = useState(() => { try { return window.innerWidth >= 1280 && localStorage.getItem("chat_open") !== "0"; } catch { return false; } });
  const setChatOpen = (v: boolean) => { setChatOpenS(v); try { localStorage.setItem("chat_open", v ? "1" : "0"); } catch {} };
  const [profileId, openProfile] = useState<number | null>(null);
  const [walletOpen, setWalletOpen] = useState<false | "menu" | "promo" | "tip">(false);
  const [tipTo, setTipTo] = useState("");
  // Ağ/deploy hatasında oturumu düşürme — yalnızca gerçek yetki hatasında çıkış
  const refreshMe = async () => { if (!getToken()) return setMe(null); try { setMe(await api("/api/me")); } catch (e: any) { if (e?.message === "UNAUTHORIZED" || !getToken()) setMe(null); else setTimeout(() => { if (getToken()) api("/api/me").then(setMe).catch(() => {}); }, 4000); } };
  useEffect(() => {
    refreshMe();
    api("/api/cms/settings/site_general").then((v) => setSettings(v ?? {})).catch(() => {});
    api("/api/cms/settings/menus").then((v) => setMenus(v ?? {})).catch(() => {});
    api("/api/prediction-categories").then((r) => setPredCats(r.data ?? [])).catch(() => {});
    // CMS özel CSS
    const key = window.innerWidth < 768 ? "mobile_css" : "web_css";
    api(`/api/cms/settings/${key}`).then((v) => { if (v?.css) { const el = document.createElement("style"); el.textContent = v.css; document.head.appendChild(el); } }).catch(() => {});
    // SEO
    api("/api/cms/settings/seo").then((v) => { if (v?.title) document.title = v.title; }).catch(() => {});
  }, []);
  useEffect(() => { const t = setInterval(() => { if (getToken()) refreshMe(); }, 30_000); return () => clearInterval(t); }, []);
  const balance = (t: "MAIN" | "BONUS") => Number(me?.wallets?.find((w: any) => w.type === t)?.balance ?? 0);
  const setWallet = async (w: "MAIN" | "BONUS") => { await api("/api/me/wallet", { method: "PUT", json: { wallet: w } }); await refreshMe(); };
  const logout = () => { setToken(null); setMe(null); };
  return <Ctx.Provider value={{ me, refreshMe, logout, settings, menus, predCats, authOpen, setAuthOpen, sidebarOpen, setSidebarOpen, chatOpen, setChatOpen, profileId, openProfile, walletOpen, setWalletOpen, tipTo, setTipTo, balance, setWallet }}>{children}</Ctx.Provider>;
}

// ---------- ortak küçük bileşenler ----------
export function Spinner() {
  return <div className="grid min-h-40 place-items-center"><div className="size-8 animate-spin rounded-full border-2 border-elevated border-t-primary" /></div>;
}
export function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-line bg-card px-4 py-10 text-center text-[15px] text-subtle">{text}</div>;
}
export function Btn({ kind = "primary", size = "md", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "soft" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const k = { primary: "btn-primary", soft: "btn-secondary", ghost: "btn-ghost", danger: "btn-danger" }[kind];
  const z = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  return <button {...p} className={`btn ${k} ${z} ${className}`} />;
}
export const inp = "input";
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">{label}</span>{children}</label>;
}
export function ErrBox({ e }: { e?: string }) {
  if (!e) return null;
  const TR: Record<string, string> = {
    INSUFFICIENT_BALANCE: "Bakiyen yetmiyor. Tutarı düşür ya da para yatır.", INVALID_CREDENTIALS: "Kullanıcı adı ya da şifre eşleşmedi. Bilgileri kontrol edip tekrar dene.", USERNAME_TAKEN: "Bu kullanıcı adı kullanılıyor. Başka bir ad seç.",
    ACTIVE_BONUS_BLOCKS_WITHDRAWAL: "Aktif bonusun varken çekim yapamazsın. Çevrimi tamamla ya da bonusu iptal et.", OPEN_WITHDRAWAL_EXISTS: "Bekleyen bir çekim talebin var. O sonuçlanınca yenisini oluşturabilirsin.",
    BELOW_MIN_AMOUNT: "Tutar bu yöntemin alt sınırının altında. Tutarı yükselt.", ABOVE_MAX_AMOUNT: "Tutar bu yöntemin üst sınırını aşıyor. Tutarı düşür.", BELOW_MIN_STAKE: "Tutar minimum bahsin altında",
    ABOVE_MAX_STAKE: "Tutar maksimum bahsin üstünde", MARKET_NOT_OPEN: "Bu piyasa şu an bahse kapalı", TRADING_PAUSED: "Tahmin işlemleri geçici olarak durduruldu",
    PROMO_NOT_FOUND: "Bu kod geçerli değil. Kodu kontrol edip tekrar yaz.", PROMO_ALREADY_USED: "Bu kodu daha önce kullandın.", PROMO_LIMIT_REACHED: "Bu kodun kullanım hakkı doldu.",
    ACTIVE_BONUS_EXISTS: "Zaten aktif bir bonusun var. Yenisi için mevcut bonusun bitmesini bekle.", ALREADY_REQUESTED: "Bu bonus için bekleyen talebiniz var", TOO_MANY_ATTEMPTS: "Çok fazla hatalı deneme yapıldı. Destek ekibiyle iletişime geç.",
    WRONG_PASSWORD: "Mevcut şifre eşleşmedi. Tekrar dene.", UNAUTHORIZED: "Devam etmek için giriş yap.", SELL_DISABLED: "Bozdurma şu an kapalı", POSITION_NOT_OPEN: "Bu pozisyon zaten kapandı",
    CHAT_MUTED: "Sohbette geçici olarak susturuldun. Süre bitince tekrar yazabilirsin.", CHAT_BANNED: "Sohbet kullanımın kapatıldı", SLOW_MODE: "Biraz yavaş — birkaç saniye bekle", MESSAGE_TOO_LONG: "Mesaj çok uzun",
    CHAT_DEPOSIT_REQUIRED: "Sohbete yazmak için en az bir yatırım gerekli", CHAT_ACCOUNT_TOO_NEW: "Hesabın yazmak için çok yeni", CHAT_DISABLED: "Sohbet şu an kapalı", EMPTY_MESSAGE: "Mesaj boş",
    RAIN_MIN: "Yağmur tutarı minimumun altında", RAIN_MAX: "Yağmur tutarı maksimumun üstünde", RAIN_ALREADY_ACTIVE: "Şu an devam eden bir yağmur var", RAIN_ENDED: "Bu yağmur sona erdi",
    RAIN_ALREADY_JOINED: "Bu yağmura zaten katıldın", RAIN_OWN: "Kendi yağmuruna katılamazsın", RAIN_FULL: "Yağmur doldu", RAIN_DEPOSIT_REQUIRED: "Yağmura katılmak için en az bir yatırım gerekli",
    RAIN_ACCOUNT_TOO_NEW: "Yağmura katılmak için hesabın en az 24 saatlik olmalı", RAIN_DISABLED: "Yağmur şu an kapalı", RAIN_NOT_ALLOWED: "Yağmura katılamazsın",
    TIP_MIN: "Bahşiş minimumun altında", TIP_MAX: "Bahşiş maksimumun üstünde", TIP_SELF: "Kendine bahşiş gönderemezsin", USER_NOT_FOUND: "Bu kullanıcı adıyla bir oyuncu yok. Adı kontrol et.", RECIPIENT_UNAVAILABLE: "Bu kullanıcıya gönderilemez",
    TIP_DEPOSIT_REQUIRED: "Bahşiş göndermek için en az bir yatırım gerekli", TIP_DAILY_LIMIT: "Günlük bahşiş limitine ulaştın", TIP_DISABLED: "Bahşiş şu an kapalı", INVALID_AMOUNT: "Geçersiz tutar",
    PLAYER_EXCLUDED_FROM_BONUSES: "Hesabın bonus kampanyalarına kapalı.", ACCOUNT_BLOCKED: "Hesabın işlemlere kapalı. Destek ekibiyle iletişime geç.", NOT_ENOUGH_DEPOSITS: "Bu kod için gereken yatırım şartını henüz karşılamadın.",
  };
  const msg = TR[e] ?? (/^[A-Z_]+$/.test(e) ? "İşlem tamamlanamadı. Biraz sonra tekrar dene; sorun sürerse destek ekibine yaz." : /fetch|network|HTTP 5/i.test(e) ? "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene." : e);
  return <div role="alert" className="flex items-start gap-2 rounded-[10px] border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm font-semibold text-loss"><I n="x" className="mt-0.5 size-4 shrink-0" /><span>{msg}</span></div>;
}

// ---------- profil fotoğrafı ----------
// Hazır avatarlar: özgün geometrik tasarımlar ("av:1".."av:12"). Kullanıcı kendi resmini de yükleyebilir (data URL).
export const AVATAR_PRESETS: { bg: [string, string]; shape: React.ReactNode }[] = [
  { bg: ["#00ff86", "#0b8f5a"], shape: <path d="M20 44 32 18l12 26Z" fill="#06090e" opacity=".85" /> },
  { bg: ["#00e8ff", "#1361a8"], shape: <circle cx="32" cy="32" r="12" fill="none" stroke="#04202b" strokeWidth="5" /> },
  { bg: ["#ffd731", "#f0742c"], shape: <path d="M32 16l4.5 10 11 1-8.3 7.3 2.6 10.7L32 39.3 22.2 45l2.6-10.7L16.5 27l11-1Z" fill="#3a1c00" opacity=".85" /> },
  { bg: ["#ff5f8f", "#9c2bd1"], shape: <path d="M32 46s-13-8-13-17a7 7 0 0 1 13-3.6A7 7 0 0 1 45 29c0 9-13 17-13 17Z" fill="#2b0420" opacity=".8" /> },
  { bg: ["#7c8cff", "#2c2f9e"], shape: <path d="M36 14 22 35h10l-4 15 14-21H32Z" fill="#0e0f3a" opacity=".85" /> },
  { bg: ["#43e0ff", "#00ff86"], shape: <><rect x="20" y="20" width="10" height="10" rx="2" fill="#042a25" /><rect x="34" y="20" width="10" height="10" rx="2" fill="#042a25" opacity=".6" /><rect x="20" y="34" width="10" height="10" rx="2" fill="#042a25" opacity=".6" /><rect x="34" y="34" width="10" height="10" rx="2" fill="#042a25" /></> },
  { bg: ["#ff8a3d", "#d1272b"], shape: <path d="M32 14c2 7 10 10 10 19a10 10 0 0 1-20 0c0-4.2 2.3-7 4.6-9 .4 3 2 5 4 5.8C29.6 24.6 30.4 19 32 14Z" fill="#3a0808" opacity=".8" /> },
  { bg: ["#b6ff5c", "#22a35a"], shape: <><circle cx="32" cy="32" r="13" fill="none" stroke="#0d2b07" strokeWidth="4" /><path d="M32 19v26M19 32h26" stroke="#0d2b07" strokeWidth="3" /></> },
  { bg: ["#e0e7ff", "#7d8ca1"], shape: <path d="M22 40V24l10-6 10 6v16l-10 6Z" fill="none" stroke="#19212a" strokeWidth="4" strokeLinejoin="round" /> },
  { bg: ["#ffd84d", "#00ff86"], shape: <><circle cx="25" cy="29" r="3.2" fill="#123" /><circle cx="39" cy="29" r="3.2" fill="#123" /><path d="M24 38c4.5 5 11.5 5 16 0" stroke="#123" strokeWidth="3.4" fill="none" strokeLinecap="round" /></> },
  { bg: ["#2b3d53", "#080d13"], shape: <path d="M32 15 44 22v14c0 6.5-5 11-12 13-7-2-12-6.5-12-13V22Z" fill="#00ff86" /> },
  { bg: ["#ff4d5e", "#ffd731"], shape: <path d="M18 38c6-14 22-14 28 0M24 30l-3-8M40 30l3-8M32 27v-9" stroke="#3a0d00" strokeWidth="3.5" fill="none" strokeLinecap="round" /> },
];
export function Avatar({ src, name = "?", className = "size-[30px]" }: { src?: string | null; name?: string; className?: string }) {
  const n = src?.startsWith("av:") ? Number(src.slice(3)) : 0;
  const pre = n >= 1 ? AVATAR_PRESETS[(n - 1) % AVATAR_PRESETS.length] : null;
  if (src && src.startsWith("data:image/")) return <img src={src} alt="" className={`${className} shrink-0 rounded-full object-cover`} />;
  if (pre) {
    const id = `avg${n}`;
    return (
      <svg viewBox="0 0 64 64" className={`${className} shrink-0 rounded-full`} aria-hidden>
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={pre.bg[0]} /><stop offset="1" stopColor={pre.bg[1]} /></linearGradient></defs>
        <rect width="64" height="64" fill={`url(#${id})`} />{pre.shape}
      </svg>
    );
  }
  return <span className={`${className} grid shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-fg`}>{name[0] ?? "?"}</span>;
}

/** Sıralama rozeti (1-2-3 için altın/gümüş/bronz) */
export function RankBadge({ n }: { n: number }) {
  const c = n === 1 ? ["#ffd35c", "#c98a12"] : n === 2 ? ["#e3e9f1", "#8a97a8"] : n === 3 ? ["#f0a870", "#a35a22"] : null;
  if (!c) return <span className="num grid size-7 place-items-center rounded-full bg-card text-[13px] font-bold text-subtle">{n}</span>;
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-label={`${n}.`}>
      <defs><linearGradient id={`rk${n}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c[0]} /><stop offset="1" stopColor={c[1]} /></linearGradient></defs>
      <circle cx="14" cy="14" r="13" fill={`url(#rk${n})`} /><circle cx="14" cy="14" r="10" fill="none" stroke="rgba(255,255,255,.45)" />
      <text x="14" y="18.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1a1205" fontFamily="Barlow Semi Condensed, sans-serif">{n}</text>
    </svg>
  );
}
/** Türkiye bayrağı (sohbet odası seçici) */
export const FlagTR = ({ className = "h-4 w-6" }: { className?: string }) => (
  <svg viewBox="0 0 30 20" className={`${className} rounded-[3px]`} aria-label="Türkçe">
    <rect width="30" height="20" fill="#e30a17" /><circle cx="11" cy="10" r="5" fill="#fff" /><circle cx="12.25" cy="10" r="4" fill="#e30a17" />
    <polygon points="19.50,10.00 17.75,10.62 17.70,12.47 16.58,11.00 14.80,11.53 15.85,10.00 14.80,8.47 16.58,9.00 17.70,7.53 17.75,9.38" fill="#fff" />
  </svg>
);
/** Ikonlu kare rozet (menü satırları) */
export const IconTile = ({ n, tone = "green" }: { n: string; tone?: "green" | "amber" | "cyan" | "red" | "slate" }) => {
  const t = { green: "bg-primary/15 text-primary", amber: "bg-caution/15 text-caution", cyan: "bg-accent/15 text-accent", red: "bg-loss/15 text-loss", slate: "bg-elevated text-soft" }[tone];
  return <span className={`grid size-10 shrink-0 place-items-center rounded-[11px] ${t}`}><I n={n} className="size-5" /></span>;
};

/** İçerik alanı kaydırma (uygulama kabuğu: pencere değil #scroller kayar) */
export function scrollMain(a: any = 0, b?: number) {
  const el = document.getElementById("scroller");
  if (!el) return;
  if (typeof a === "number") el.scrollTo(a, b ?? 0); else el.scrollTo(a);
}
