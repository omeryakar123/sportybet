import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export const money = (v: any, cur = "₺") => {
  const n = Number(v ?? 0);
  const s = Math.abs(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `${cur}(${s})` : `${cur}${s}`;
};
export const num = (v: any, d = 0) => Number(v ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v: any) => `${Number(v ?? 0).toFixed(2)}%`;
export const dt = (v: any) => (v ? new Date(v).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
export const dOnly = (v: any) => (v ? new Date(v).toLocaleDateString("tr-TR") : "");

/** BetConstruct tarzı dolgulu glifler (özgün çizim) */
const G: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></>,
  players: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c.6-4 3.4-6 7-6s6.4 2 7 6Z" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 13.2c2.8.2 4.8 2 5.3 5.3H18c-.3-2-1-3.7-1.5-5.3Z" /></>,
  reports: <><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></>,
  finance: <><rect x="2" y="5" width="20" height="14" rx="2" /><rect x="2" y="8.5" width="20" height="3" fill="#fff" opacity=".9" /><rect x="5" y="14" width="6" height="2" rx="1" fill="#fff" opacity=".9" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><rect x="4.5" y="12.5" width="15" height="8.5" rx="1" /><rect x="11" y="8" width="2" height="13" fill="#fff" opacity=".8" /><path d="M12 8C9 8 6.5 6.8 7.2 4.8 8 2.8 11 4.5 12 8Zm0 0c3 0 5.5-1.2 4.8-3.2C16 2.8 13 4.5 12 8Z" /></>,
  sport: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7.2 15.6 9.8l-1.4 4.2H9.8L8.4 9.8Z" fill="#fff" /></>,
  prediction: <><circle cx="12" cy="10" r="7.5" /><rect x="6" y="18.5" width="12" height="3" rx="1.2" /><circle cx="9.5" cy="8" r="2" fill="#fff" opacity=".7" /></>,
  users: <><circle cx="12" cy="7.5" r="4" /><path d="M4 21c.8-5 4-7.5 8-7.5s7.2 2.5 8 7.5Z" /></>,
  cms: <path d="M9 3h3.5a2 2 0 1 1 4 0H20v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H9v-4a2 2 0 1 0 0-4Z" transform="translate(-2.5 3)" />,
  deposit: <><circle cx="13" cy="13" r="8.5" /><text x="13" y="17.3" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">$</text><path d="M4 2v6M1.5 5.5 4 8l2.5-2.5" stroke="currentColor" strokeWidth="2" fill="none" /></>,
  withdraw: <><circle cx="13" cy="13" r="8.5" /><text x="13" y="17.3" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">$</text><path d="M4 8V2M1.5 4.5 4 2l2.5 2.5" stroke="currentColor" strokeWidth="2" fill="none" /></>,
  login: <><circle cx="12" cy="12" r="9.5" /><path d="M7 12h8M12 8.5 15.5 12 12 15.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  register: <><circle cx="13" cy="9" r="4" /><path d="M5.5 21c.7-4.5 3.7-6.5 7.5-6.5s6.8 2 7.5 6.5Z" /><path d="M4 2.5v6M1 5.5h6" stroke="currentColor" strokeWidth="2" /></>,
  balance: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" fill="#fff" /><text x="12" y="14" textAnchor="middle" fontSize="5" fontWeight="700">$</text></>,
  profit: <><circle cx="12" cy="12" r="9.5" /><path d="M7 16v-2M10 16v-4M13 16v-6M16 16V8" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></>,
  bonus: <><circle cx="12" cy="12" r="9.5" /><rect x="7" y="10" width="10" height="7" rx="1" fill="#fff" /><rect x="6.5" y="8" width="11" height="2.5" rx=".6" fill="#fff" /><rect x="11.3" y="8" width="1.4" height="9" /></>,
  up: <><circle cx="12" cy="12" r="9.5" /><path d="m8 14 4-4 4 4" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  down: <><circle cx="12" cy="12" r="9.5" /><path d="m8 10 4 4 4-4" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></>,
  user: <><circle cx="12" cy="7.5" r="4" /><path d="M4 21c.8-5 4-7.5 8-7.5s7.2 2.5 8 7.5Z" /></>,
  menu: <><rect x="3" y="5" width="18" height="2.4" rx="1.2" /><rect x="3" y="10.8" width="18" height="2.4" rx="1.2" /><rect x="3" y="16.6" width="18" height="2.4" rx="1.2" /></>,
  logout: <><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M9 12h11M16 8l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  chat: <><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H5a2 2 0 0 1-2-2Z" /><rect x="7" y="8" width="10" height="1.8" rx=".9" fill="#fff" /><rect x="7" y="11.4" width="6" height="1.8" rx=".9" fill="#fff" /></>,
  globe: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18" stroke="currentColor" strokeWidth="1.6" fill="none" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><rect x="5" y="10" width="14" height="9" fill="#fff" /><rect x="7" y="2.5" width="2" height="4" rx="1" /><rect x="15" y="2.5" width="2" height="4" rx="1" /></>,
};
export function BoIcon({ n, className = "size-[18px]" }: { n: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>{G[n] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}
const EMOJI_ICON: Record<string, string> = { "⬇": "deposit", "⬆": "withdraw", "👤": "user", "➜": "login", "＋": "register", "💵": "balance", "📈": "profit", "🎁": "bonus", "✚": "up", "✖": "down", "⚽": "sport", "🔮": "prediction", "💳": "finance", "📊": "reports", "👥": "players" };

export function Panel({ title, right, children, pad = true, collapsible }: { title: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean; collapsible?: boolean }) {
  const isFilter = collapsible ?? title === "Filtre";
  const [open, setOpen] = useState(true);
  return (
    <section className="panel mb-3">
      <div className="panel-title flex min-h-10 items-center justify-between gap-3">
        <span className={isFilter ? "cursor-pointer select-none" : ""} onClick={() => isFilter && setOpen(!open)}>{title}</span>
        <div className="flex items-center gap-3">{right}{isFilter && <button className="text-bo-blue" onClick={() => setOpen(!open)}>{open ? "⌃" : "⌄"}</button>}</div>
      </div>
      {open && <div className={pad ? "p-3" : ""}>{children}</div>}
    </section>
  );
}
export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="lbl">{label}</span>{children}</label>;
}
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-600/60 p-4 pt-16" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "max-w-5xl" : "max-w-2xl"} rounded bg-white p-5 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between border-b border-bo-blue/30 pb-3">
          <h2 className="text-base">{title}</h2>
          <button onClick={onClose} className="text-lg text-bo-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1 border-b border-bo-line">
      {tabs.map((t) => <button key={t} onClick={() => onChange(t)} className={`px-3 py-2 ${value === t ? "border-b-2 border-bo-blue text-bo-blue" : "hover:text-bo-blue"}`}>{t}</button>)}
    </div>
  );
}
/** API hata kodlarının Türkçe karşılıkları (bilinmeyen kod olduğu gibi gösterilir) */
export const ERR_TR: Record<string, string> = {
  LIVE_MAX_GT_MAX_STAKE: "Canlı azami bahis, genel azami bahisten büyük olamaz", LIVE_STALE_LT_2X_INTERVAL: "Bayat oran kilidi, çekme aralığının en az 2 katı olmalı", MIN_STAKE_GT_MAX_STAKE: "Asgari bahis azami bahisten büyük olamaz", MAX_WIN_LT_MAX_STAKE: "Azami kazanç azami bahisten küçük olamaz",
  VALIDATION_ERROR: "Form alanlarını kontrol edin", NOT_FOUND: "Kayıt bulunamadı", ALREADY_EXISTS: "Bu kayıt zaten var", FORBIDDEN: "Bu işlem için yetkiniz yok",
  INSUFFICIENT_FUNDS: "Yetersiz bakiye", INSUFFICIENT_BALANCE: "Oyuncunun bakiyesi yetersiz", REASON_REQUIRED: "Sebep yazmak zorunlu (en az 5 karakter)",
  ALREADY_PROCESSED: "Bu talep zaten işlenmiş", ONLY_PAID_CAN_BE_REVERSED: "Sadece ödenmiş talepler geri alınabilir", ONLY_PAID_CAN_BE_CORRECTED: "Sadece ödenmiş talepler düzeltilebilir",
  ONLY_REJECTED_CAN_BE_REOPENED: "Sadece reddedilen/iptal edilen talepler yeniden açılabilir", SAME_AMOUNT: "Yeni tutar mevcut tutarla aynı", INVALID_AMOUNT: "Geçersiz tutar",
  INSUFFICIENT_BALANCE_FOR_REVERSAL: "Oyuncu parayı kullanmış — bakiye geri alma tutarını karşılamıyor",
  BONUS_MAX_LT_MIN: "Maksimum tutar, minimum tutardan küçük olamaz", BONUS_MIN_NEGATIVE: "Minimum tutar negatif olamaz", BONUS_MAX_INVALID: "Maksimum tutar 0'dan büyük olmalı",
  BONUS_MAX_PAYOUT_INVALID: "Maksimum ödeme 0'dan büyük olmalı", BONUS_MAX_PAYOUT_PCT_RANGE: "Maks. ödeme yüzdesi 0–100000 arası olmalı",
  DEPOSIT_BONUS_NEEDS_PERCENT: "Yatırım bonusunda yüzde (%) zorunlu", BONUS_PERCENT_RANGE: "Bonus yüzdesi 0–1000 arası olmalı",
  BONUS_WAGERING_RANGE: "Çevrim katı 0–100 arası olmalı", BONUS_EXPIRATION_RANGE: "Geçerlilik 1–365 gün olmalı", BONUS_DATES_INVALID: "Bitiş tarihi başlangıçtan sonra olmalı",
  RULE_MIN_SELECTIONS: "Min. seçim sayısı en az 1", RULE_MIN_SEL_ODDS: "Min. seçim oranı en az 1.00", RULE_TOTAL_LT_SEL_ODDS: "Min. toplam oran, min. seçim oranından küçük olamaz",
  RULE_SINGLE_MULTI_CONFLICT: "Bahis tipi 'Tekli' iken min. seçim sayısı 1 olmalı",
  PROMO_CODE_FORMAT: "Kod 3–30 karakter: büyük harf, rakam, - veya _", PROMO_DATES_INVALID: "Bitiş tarihi başlangıçtan sonra olmalı", PROMO_BONUS_NOT_FOUND: "Seçilen bonus bulunamadı",
  PROMO_BONUS_INACTIVE: "Seçilen bonus pasif", PROMO_AMOUNT_BELOW_BONUS_MIN: "Tutar, bonusun minimum tutarından küçük", PROMO_AMOUNT_ABOVE_BONUS_MAX: "Tutar, bonusun maksimum tutarından büyük",
  PROMO_MAX_LT_USED: "Maks. kullanım, şimdiye kadarki kullanımdan az olamaz",
  MAX_LT_MIN: "Maksimum tutar, minimum tutardan küçük olamaz", MIN_AMOUNT_NEGATIVE: "Minimum tutar negatif olamaz", CRYPTO_ADDRESS_REQUIRED: "TXID zorunluysa yatırım adresi de girilmeli",
  MIN_STAKE_GT_MAX_STAKE: "Min. bahis, maks. bahisten büyük olamaz", MAX_WIN_LT_MAX_STAKE: "Maks. kazanç, maks. bahisten küçük olamaz", ALREADY_SETTLED: "Bu maç zaten sonuçlandırılmış",
  ACTIVE_BONUS_EXISTS: "Oyuncunun zaten aktif bir bonusu var", BELOW_MIN_AMOUNT: "Tutar bonusun minimumunun altında", ABOVE_MAX_AMOUNT: "Tutar bonusun maksimumunun üstünde",
  PLAYER_EXCLUDED_FROM_BONUSES: "Oyuncu bonuslardan hariç tutulmuş", BONUS_NOT_ACTIVE: "Bonus aktif değil", INVALID_CREDENTIALS: "Kullanıcı adı veya şifre hatalı",
};
export const trErr = (e?: string) => (e ? ERR_TR[e] ?? e : "");
export const Err = ({ e }: { e?: string }) => (e ? <div className="mb-2 rounded border border-bo-red/30 bg-bo-red/10 px-3 py-2 text-bo-red">⚠ {trErr(e)}</div> : null);
/** Form içi anlık uyarı (kaydetmeden önce) */
export const Warn = ({ show, children }: { show: any; children: ReactNode }) => (show ? <div className="mt-1 text-[12px] text-bo-red">⚠ {children}</div> : null);

/** Aranabilir çoklu seçim (BC tarzı dropdown + arama + etiketler) */
export function MultiSelect({ options, value, onChange, placeholder = "Hepsi", disabled }: {
  options: { value: string; label: string; hint?: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const lower = q.toLocaleLowerCase("tr");
  const filtered = options.filter((o) => !lower || o.label.toLocaleLowerCase("tr").includes(lower) || (o.hint ?? "").toLocaleLowerCase("tr").includes(lower));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div ref={ref} className="relative">
      <div onClick={() => !disabled && setOpen(!open)} className={`inp flex min-h-8 cursor-pointer flex-wrap items-center gap-1 py-1 ${disabled ? "opacity-60" : ""}`}>
        {value.length === 0 ? <span className="text-bo-muted">{placeholder}</span> : value.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-sm bg-bo-blue/10 px-1.5 py-0.5 text-[12px] text-bo-blue">{label(v)}<button type="button" onClick={(e) => { e.stopPropagation(); toggle(v); }} className="text-bo-blue/70 hover:text-bo-red">×</button></span>
        ))}
        <span className="ml-auto pl-2 text-bo-muted">▾</span>
      </div>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded border border-bo-line bg-white shadow-lg">
          <div className="border-b border-bo-line p-2"><input autoFocus className="inp" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex justify-between border-b border-bo-line px-3 py-1.5 text-[12px]">
            <button type="button" className="text-bo-blue" onClick={() => onChange([...new Set([...value, ...filtered.map((o) => o.value)])])}>Tümünü seç</button>
            <button type="button" className="text-bo-muted hover:text-bo-red" onClick={() => onChange([])}>Temizle</button>
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-bo-muted">Sonuç yok</div>}
            {filtered.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-bo-head">
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
                <span className="flex-1">{o.label}</span>{o.hint && <span className="text-[11px] text-bo-muted">{o.hint}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATE_COLORS: Record<string, string> = {
  WON: "text-bo-green", PAID: "text-bo-green", COMPLETED: "text-bo-green", APPROVED: "text-bo-green", SUCCESS: "text-bo-green", OPEN: "text-bo-green",
  LOST: "text-bo-red", REJECTED: "text-bo-red", BLOCKED: "text-bo-red", CLOSED: "text-bo-red",
  EXPIRED: "text-bo-muted", CANCELLED: "text-bo-muted", CANCELED: "text-bo-muted", RETURNED: "text-bo-muted",
  PENDING: "text-bo-orange", NEW: "text-bo-blue", ACTIVE: "text-bo-blue", CASHED_OUT: "text-bo-purple", REVERSED: "text-bo-purple",
};
const STATE_TR: Record<string, string> = {
  WON: "Kazandı", LOST: "Kaybetti", ACTIVE: "Açık", PENDING: "Bekliyor", RETURNED: "İade", CASHED_OUT: "Cashout", CANCELLED: "İptal",
  NEW: "Yeni", PAID: "Ödendi", REJECTED: "Reddedildi", COMPLETED: "Tamamlandı", EXPIRED: "Süresi doldu", CANCELED: "İptal", APPROVED: "Onaylandı",
  OPEN: "Açık", BLOCKED: "Bloke", CLOSED: "Kapalı", SELF_EXCLUDED: "Kendini dışladı", REVERSED: "Geri alındı",
};
const STATE_ICON: Record<string, string> = { NEW: "dot", PENDING: "tri", PAID: "ok", WON: "ok", COMPLETED: "ok", APPROVED: "ok", SUCCESS: "ok", OPEN: "ok", REJECTED: "x", LOST: "x", CANCELLED: "x", CANCELED: "x", BLOCKED: "x", EXPIRED: "x", REVERSED: "back", RETURNED: "back", ACTIVE: "dot", CASHED_OUT: "ok" };
export const StateBadge = ({ s }: { s: string }) => {
  const k = STATE_ICON[s];
  const ic = k === "ok" ? <svg viewBox="0 0 16 16" className="size-[13px]"><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="m4.8 8.2 2.2 2.2 4.2-4.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
    : k === "x" ? <svg viewBox="0 0 16 16" className="size-[13px]"><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="m5.5 5.5 5 5m0-5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
    : k === "dot" ? <span className="inline-block size-[10px] rounded-full bg-current" />
    : k === "back" ? <svg viewBox="0 0 16 16" className="size-[13px]"><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M5 7h5a2 2 0 0 1 0 4H8M5 7l2-2M5 7l2 2" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
    : null;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${STATE_COLORS[s] ?? ""}`}>{ic}{STATE_TR[s] ?? s}{k === "tri" && <span className="-mt-2 -ml-0.5 size-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-bo-orange" />}</span>;
};

/** KPI kartı (BC dashboard / player KPIs) */
export function Kpi({ label, value, icon, color = "bo-blue", to }: { label: string; value: ReactNode; icon: string; color?: string; to?: string }) {
  // BC: pastel ikon bölgesi + içinde dolu renkli daire, beyaz glif
  const pal: Record<string, [string, string]> = {
    "bo-blue": ["#e3f3fd", "#36a9f0"], "bo-red": ["#fde5e7", "#f0454f"], "bo-orange": ["#fff1dc", "#f7a52b"], "bo-green": ["#e1f6ea", "#38c172"],
    "bo-purple": ["#ebe7fc", "#7462e4"], lime: ["#f1f7d9", "#a9c62b"], teal: ["#dcf6f4", "#22c3b3"],
  };
  const [bg, fg] = pal[color] ?? pal["bo-blue"];
  const g = EMOJI_ICON[icon] ?? (G[icon] ? icon : null);
  const body = (
    <>
      <div className="grid w-[74px] shrink-0 place-items-center" style={{ background: bg }}>
        <div className="grid size-[38px] place-items-center rounded-full text-white" style={{ background: fg }}>{g ? <BoIcon n={g} className="size-[22px]" /> : <span className="text-lg">{icon}</span>}</div>
      </div>
      <div className="flex min-w-0 flex-col justify-center px-3"><div className="truncate text-[11px] uppercase tracking-wide text-[#3b4351]">{label}</div><div className="mt-1.5 truncate text-[19px] leading-none text-[#8a93a1]">{value}</div></div>
    </>
  );
  return to
    ? <Link to={to} title="Detaya git" className="panel flex h-[74px] items-stretch overflow-hidden transition-shadow hover:shadow-[0_2px_10px_rgba(46,138,230,.25)]">{body}</Link>
    : <div className="panel flex h-[74px] items-stretch overflow-hidden">{body}</div>;
}

/** URL'den başlangıç filtresi (dashboard kutularından gelen ?state=PAID&from=...&to=... gibi) */
export function useUrlInit() {
  const [sp] = useSearchParams();
  return {
    get: (k: string, def = "") => sp.get(k) ?? def,
    range: (fallback: string): Range => (sp.get("from") ? { from: sp.get("from")!, to: sp.get("to") ?? new Date().toISOString() } : presetRange(fallback)),
  };
}
/** Dashboard'dan detay sayfasına link üretici */
export const qs = (o: Record<string, any>) => "?" + new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""))).toString();

/** Tarih aralığı + hızlı butonlar (Bugün, Dün, Bu Hafta ...) */
export type Range = { from: string; to: string };
const iso = (d: Date) => d.toISOString();
export function presetRange(p: string): Range {
  const now = new Date(); const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = 86400_000; const dow = (sod.getDay() + 6) % 7;
  switch (p) {
    case "yesterday": return { from: iso(new Date(sod.getTime() - day)), to: iso(sod) };
    case "week": return { from: iso(new Date(sod.getTime() - dow * day)), to: iso(new Date(sod.getTime() + day)) };
    case "lastweek": return { from: iso(new Date(sod.getTime() - (dow + 7) * day)), to: iso(new Date(sod.getTime() - dow * day)) };
    case "month": return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(sod.getTime() + day)) };
    case "lastmonth": return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case "all": return { from: "2000-01-01T00:00:00.000Z", to: iso(new Date(sod.getTime() + day)) };
    default: return { from: iso(sod), to: iso(new Date(sod.getTime() + day)) };
  }
}
const PRESETS: [string, string][] = [["today", "Bugün"], ["yesterday", "Dün"], ["week", "Bu Hafta"], ["lastweek", "Geçen Hafta"], ["month", "Bu Ay"], ["lastmonth", "Geçen Ay"]];
const toLocalInput = (s: string) => { const d = new Date(s); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [active, setActive] = useState<string>("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(([k, l]) => <button key={k} onClick={() => { setActive(k); onChange(presetRange(k)); }} className={`h-[30px] min-w-[104px] rounded-[2px] border px-3 text-[13px] transition-colors ${active === k ? "border-[#2e8ae6] bg-[#2e8ae6] text-white" : "border-[#bcd8f5] bg-[#e3f0fd] text-[#2e8ae6] hover:bg-[#d4e8fc]"}`}>{l}</button>)}
      <input type="datetime-local" className="inp w-48" value={toLocalInput(value.from)} onChange={(e) => { setActive(""); onChange({ ...value, from: new Date(e.target.value).toISOString() }); }} />
      <span>—</span>
      <input type="datetime-local" className="inp w-48" value={toLocalInput(value.to)} onChange={(e) => { setActive(""); onChange({ ...value, to: new Date(e.target.value).toISOString() }); }} />
    </div>
  );
}

/** Genel tablo: sıralama, sayfalama, toplam satırı, CSV dışa aktarma, metin arama */
export type Col<T> = {
  key: string; label: string; render?: (r: T) => ReactNode; value?: (r: T) => any;
  sum?: boolean | ((rows: T[]) => ReactNode); align?: "right" | "left"; money?: boolean; sortable?: boolean; className?: string;
};
export function DataTable<T extends Record<string, any>>({
  rows, cols, pageSize = 20, csvName, search = true, rowKey, expand, empty = "Görüntülenecek veri yok", toolbar,
}: {
  rows: T[]; cols: Col<T>[]; pageSize?: number; csvName?: string; search?: boolean; rowKey?: (r: T, i: number) => string | number;
  expand?: (r: T) => ReactNode; empty?: string; toolbar?: ReactNode;
}) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1); const [size, setSize] = useState(pageSize); const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const getV = (c: Col<T>, r: T) => (c.value ? c.value(r) : r[c.key]);
  const filtered = useMemo(() => {
    let out = rows;
    if (q) { const s = q.toLowerCase(); out = out.filter((r) => cols.some((c) => String(getV(c, r) ?? "").toLowerCase().includes(s))); }
    if (sort) {
      const c = cols.find((x) => x.key === sort.k)!;
      out = [...out].sort((a, b) => { const x = getV(c, a), y = getV(c, b); const nx = Number(x), ny = Number(y);
        const cmp = !isNaN(nx) && !isNaN(ny) && x !== "" && y !== "" ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""), "tr"); return cmp * sort.dir; });
    }
    return out;
  }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * size, cur * size);
  const hasSum = cols.some((c) => c.sum);
  const fmt = (c: Col<T>, r: T) => (c.render ? c.render(r) : c.money ? money(getV(c, r)) : getV(c, r) ?? "");
  function csv() {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map((c) => esc(c.label)).join(";"), ...filtered.map((r) => cols.map((c) => esc(getV(c, r))).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${csvName ?? "rapor"}.csv`; a.click();
  }
  const key = (r: T, i: number) => String(rowKey ? rowKey(r, i) : r.id ?? i);
  return (
    <div>
      {(search || csvName || toolbar) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {search && <input className="inp w-56" placeholder="Ara..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />}
          <div className="flex-1">{toolbar}</div>
          {csvName && <button className="h-8 rounded-sm border border-bo-blue/40 bg-bo-blue/10 px-3 text-bo-blue" onClick={csv}>CSV</button>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            {expand && <th className="w-6" />}
            {cols.map((c) => (
              <th key={c.key} className={`${c.align === "right" || c.money ? "text-right" : ""} ${c.sortable !== false ? "cursor-pointer select-none" : ""}`}
                onClick={() => c.sortable !== false && setSort((s) => (s?.k === c.key ? { k: c.key, dir: (s.dir * -1) as 1 | -1 } : { k: c.key, dir: -1 }))}>
                {c.label}{sort?.k === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={cols.length + (expand ? 1 : 0)} className="py-8 text-center text-bo-muted">{empty}</td></tr>}
            {shown.map((r, i) => {
              const k = key(r, i);
              return [
                <tr key={k}>
                  {expand && <td><button className="text-bo-blue" onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}>{open[k] ? "⊖" : "⊕"}</button></td>}
                  {cols.map((c) => <td key={c.key} className={`${c.align === "right" || c.money ? "text-right" : ""} ${c.className ?? ""}`}>{fmt(c, r)}</td>)}
                </tr>,
                expand && open[k] ? <tr key={k + "_x"}><td colSpan={cols.length + 1} className="bg-bo-head/40 p-2">{expand(r)}</td></tr> : null,
              ];
            })}
          </tbody>
          {hasSum && filtered.length > 0 && (
            <tfoot><tr className="bg-bo-head font-medium">
              {expand && <td />}
              {cols.map((c, i) => <td key={c.key} className={`px-3 py-2 ${c.align === "right" || c.money ? "text-right" : ""}`}>
                {i === 0 && !c.sum ? "Toplam" : typeof c.sum === "function" ? c.sum(filtered) : c.sum ? (c.money ? money(filtered.reduce((a, r) => a + Number(getV(c, r) ?? 0), 0)) : num(filtered.reduce((a, r) => a + Number(getV(c, r) ?? 0), 0))) : ""}
              </td>)}
            </tr></tfoot>
          )}
        </table>
      </div>
      {filtered.length > size || pages > 1 ? (
        <div className="mt-2 flex items-center justify-between text-bo-muted">
          <span>{filtered.length} kayıttan {(cur - 1) * size + 1} - {Math.min(cur * size, filtered.length)} gösteriliyor</span>
          <div className="flex items-center gap-1">
            <select className="inp w-20" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>{[20, 50, 100, 500].map((n) => <option key={n}>{n}</option>)}</select>
            <button className="btn-ghost px-2" disabled={cur === 1} onClick={() => setPage(1)}>«</button>
            <button className="btn-ghost px-2" disabled={cur === 1} onClick={() => setPage(cur - 1)}>‹</button>
            <span className="px-2">{cur} / {pages}</span>
            <button className="btn-ghost px-2" disabled={cur === pages} onClick={() => setPage(cur + 1)}>›</button>
            <button className="btn-ghost px-2" disabled={cur === pages} onClick={() => setPage(pages)}>»</button>
          </div>
        </div>
      ) : <div className="mt-2 text-bo-muted">{filtered.length} kayıt</div>}
    </div>
  );
}

/** Basit form durumu yardımcısı */
export function useForm<T extends Record<string, any>>(init: T) {
  const [f, setF] = useState<T>(init);
  const bind = (k: keyof T) => ({ value: f[k] ?? "", onChange: (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }) });
  const check = (k: keyof T) => ({ checked: !!f[k], onChange: (e: any) => setF({ ...f, [k]: e.target.checked }) });
  return { f, setF, bind, check };
}

export const TX_TR: Record<string, string> = {
  TIP_SEND: "Bahşiş (giden)", TIP_RECEIVE: "Bahşiş (gelen)", RAIN_SEND: "Yağmur (başlatılan)", RAIN_RECEIVE: "Yağmur Payı", RAIN_REFUND: "Yağmur İadesi", DEPOSIT_REVERSAL: "Yatırım Geri Alma", WITHDRAWAL_REVERSAL: "Çekim İadesi",
  DEPOSIT: "Yatırım", WITHDRAWAL: "Çekim", BET_STAKE: "Bahis", BET_WIN: "Kazanç",
  PREDICTION_BUY: "Tahmin Alımı", PREDICTION_SELL: "Tahmin Bozdurma", PREDICTION_WIN: "Tahmin Kazancı", PREDICTION_REFUND: "Tahmin İadesi", BET_REFUND: "Bahis İadesi", BONUS_GRANT: "Bonus Verildi",
  BONUS_CONVERT: "Bonus Dönüşümü", BONUS_EXPIRE: "Bonus Süresi Doldu", BONUS_CANCEL: "Bonus İptal", ADJUSTMENT: "Düzeltme",
  WITHDRAWAL_REFUND: "Çekim İadesi", CORRECTION_UP: "Düzeltme (+)", CORRECTION_DOWN: "Düzeltme (−)",
};
