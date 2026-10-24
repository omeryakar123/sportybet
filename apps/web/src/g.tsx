/* =====================================================================
 * Gamdom bileşen dili — gamdom.com getComputedStyle ölçümlerinden.
 * Sayfa başlığı 22/500 · sekme 14/500 (aktif yeşil) · tablo satırı #131a22 r10 h52
 * Liste grubu: 52px satırlar, #131a22, grubun dış köşeleri 16px, satır arası 2px
 * Akordeon: r20, 1px beyaz/5 kenar, 18/700 başlık, 24px #252f3a yuvarlak düğme
 * İstatistik kartı: #131a22 r15 h84 — değer 18/500, etiket 14/500 gri, sağda 64px ikon
 * ===================================================================== */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { I } from "./lib";

export const PageTitle = ({ children, right, as: As = "h1" }: { children: React.ReactNode; right?: React.ReactNode; as?: any }) => (
  <div className="mb-4 flex min-h-9 items-center gap-3">
    <As className="h-sec min-w-0 flex-1 truncate">{children}</As>
    {right}
  </div>
);

/** Metin sekmeleri (Lobby / Favorites … — Deposits / Withdrawals …) */
export function Tabs<T extends string>({ tabs, value, onChange, className = "" }: { tabs: [T, string][]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={`no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0 ${className}`}>
      {tabs.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`h-[43px] shrink-0 whitespace-nowrap rounded-[10px] px-[13px] text-[14px] font-medium transition-colors ${value === v ? "bg-[rgba(14,224,123,.05)] text-primary" : "text-subtle hover:text-fg"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Arama kutusu: #19212a r10 h44 */
export const SearchBox = ({ value, onChange, placeholder, className = "" }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) => (
  <label className={`flex h-11 items-center gap-1.5 rounded-[10px] border border-transparent bg-card-2 px-3 focus-within:border-primary/50 ${className}`}>
    <I n="search" className="size-5 shrink-0 text-subtle" />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-[14px] font-medium outline-none placeholder:text-subtle" />
  </label>
);

/** Tablo: başlık 12/700 büyük harf gri, satırlar ayrık #131a22 kutular */
export function GTable({ head, rows, empty = "Kayıt yok", align }: { head: React.ReactNode[]; rows: React.ReactNode[][]; empty?: string; align?: ("l" | "r" | "c")[] }) {
  const a = (i: number) => (align?.[i] === "r" ? "text-right" : align?.[i] === "c" ? "text-center" : "text-left");
  return (
    <div className="no-scrollbar -mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[560px] border-separate border-spacing-y-2">
        <thead><tr>{head.map((h, i) => <th key={i} className={`h-10 px-4 text-[12px] font-bold uppercase text-subtle ${a(i)}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="rounded-[10px] bg-card px-4 py-10 text-center text-[14px] font-medium text-subtle">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-card-2" : "bg-card"}>
              {r.map((c, j) => <td key={j} className={`h-[52px] px-4 text-[14px] font-medium first:rounded-l-[10px] last:rounded-r-[10px] ${a(j)}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Durum yazısı: TAMAMLANDI yeşil, BEKLİYOR sarı, REDDEDİLDİ kırmızı — 14/700 büyük harf */
export const Status = ({ tone, children }: { tone: "ok" | "wait" | "bad" | "muted"; children: React.ReactNode }) => (
  <span className={`text-[13px] font-bold uppercase ${tone === "ok" ? "text-primary" : tone === "wait" ? "text-caution" : tone === "bad" ? "text-loss" : "text-subtle"}`}>{children}</span>
);

/** Liste grubu satırı: 52px, ikon 24 + 16/700 + sağ ok */
export function ListGroup({ items }: { items: { icon?: React.ReactNode; label: string; to?: string; onClick?: () => void; right?: React.ReactNode; danger?: boolean }[] }) {
  return (
    <div className="flex flex-col gap-0.5 overflow-hidden rounded-2xl">
      {items.map((it) => {
        const inner = (
          <>
            {it.icon && <span className="grid size-6 shrink-0 place-items-center">{it.icon}</span>}
            <span className={`min-w-0 flex-1 truncate text-left text-[16px] font-bold ${it.danger ? "text-loss" : "text-white"}`}>{it.label}</span>
            {it.right ?? <I n="right" className="size-5 shrink-0 text-subtle" />}
          </>
        );
        const cls = "flex h-[52px] w-full items-center gap-[14px] bg-panel px-4 transition-colors hover:bg-card";
        return it.to ? <Link key={it.label} to={it.to} onClick={it.onClick} className={cls}>{inner}</Link> : <button key={it.label} onClick={it.onClick} className={cls}>{inner}</button>;
      })}
    </div>
  );
}

/** Akordeon (How to Participate / T&C) */
export function Accordion({ title, children, open: o = false }: { title: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(o);
  return (
    <div className="rounded-[20px] border border-white/[.05]">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-[17px] py-[18px] text-left">
        <span className="flex-1 text-[18px] font-bold text-fg">{title}</span>
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-elevated"><I n="down" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      </button>
      {open && <div className="px-[17px] pb-5 text-[14px] font-medium text-subtle">{children}</div>}
    </div>
  );
}

/** İstatistik kartı */
export const StatCard = ({ value, label, icon }: { value: React.ReactNode; label: string; icon?: React.ReactNode }) => (
  <div className="flex h-[84px] items-center gap-3 rounded-[15px] bg-card px-5">
    <div className="min-w-0 flex-1">
      <div className="truncate text-[18px] font-medium text-white">{value}</div>
      <div className="truncate text-[14px] font-medium text-subtle">{label}</div>
    </div>
    {icon && <span className="grid size-16 shrink-0 place-items-center">{icon}</span>}
  </div>
);

/** Sayfalama: 36×36 #131a22 r8, aktif yeşil yazı */
export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2);
  return (
    <div className="mt-6 flex items-center justify-center gap-0.5">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Önceki sayfa" className="grid size-9 place-items-center rounded-lg bg-card text-white disabled:text-subtle"><I n="left" className="size-4" /></button>
      {nums.map((n, i) => (
        <span key={n} className="contents">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-subtle">…</span>}
          <button onClick={() => onChange(n)} aria-current={n === page} className={`grid size-9 place-items-center rounded-lg bg-card text-[14px] font-bold ${n === page ? "text-primary" : "text-fg hover:bg-card-2"}`}>{n}</button>
        </span>
      ))}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Sonraki sayfa" className="grid size-9 place-items-center rounded-lg bg-card text-white disabled:text-subtle"><I n="right" className="size-4" /></button>
    </div>
  );
}

/** Gamdom alt-sayfa / modal kabuğu: mobilde alttan tam ekran, masaüstünde ortada; zemin rgba(6,9,14,.9) */
export function Sheet({ open, onClose, title, head, children, wide }: { open: boolean; onClose: () => void; title?: React.ReactNode; head?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(6,9,14,.9)] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" className={`animate-sheet flex h-[calc(100dvh-16px)] w-full flex-col overflow-hidden rounded-t-2xl bg-page sm:h-auto sm:max-h-[86vh] sm:rounded-2xl ${wide ? "sm:max-w-[720px]" : "sm:max-w-[440px]"}`}>
        <div className="flex shrink-0 items-center gap-3 px-[15px] pt-[14px] pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">{title && <p className="truncate text-[16px] font-bold text-white">{title}</p>}{head}</div>
          <button onClick={onClose} aria-label="Kapat" className="grid size-8 place-items-center rounded-lg text-subtle hover:text-fg"><I n="x" className="size-6" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[15px] pb-[15px]">{children}</div>
      </section>
    </div>
  );
}

/** Renkli etiket (Wager Promotion / Casino / Sports): 24px r10, 12/700 koyu yazı */
export const Pill = ({ children, color = "#00ff86" }: { children: React.ReactNode; color?: string }) => (
  <span className="inline-flex h-6 items-center rounded-[10px] px-2.5 text-[12px] font-bold uppercase text-primary-fg" style={{ background: color }}>{children}</span>
);

/** İlerleme çubuğu: 6px beyaz/15 zemin, beyaz dolgu */
export const Progress = ({ value, h = 6 }: { value: number; h?: number }) => (
  <div className="w-full overflow-hidden rounded-[2px] bg-white/15" style={{ height: h }}>
    <div className="h-full rounded-lg bg-white transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);
