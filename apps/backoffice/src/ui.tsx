import { ReactNode, useMemo, useState } from "react";

export const money = (v: any, cur = "₺") => {
  const n = Number(v ?? 0);
  const s = Math.abs(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `${cur}(${s})` : `${cur}${s}`;
};
export const num = (v: any, d = 0) => Number(v ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v: any) => `${Number(v ?? 0).toFixed(2)}%`;
export const dt = (v: any) => (v ? new Date(v).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
export const dOnly = (v: any) => (v ? new Date(v).toLocaleDateString("tr-TR") : "");

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
export const Err = ({ e }: { e?: string }) => (e ? <div className="mb-2 rounded bg-bo-red/10 p-2 text-bo-red">{e}</div> : null);

const STATE_COLORS: Record<string, string> = {
  WON: "text-bo-green", PAID: "text-bo-green", COMPLETED: "text-bo-green", APPROVED: "text-bo-green", SUCCESS: "text-bo-green", OPEN: "text-bo-green",
  LOST: "text-bo-red", REJECTED: "text-bo-red", BLOCKED: "text-bo-red", CLOSED: "text-bo-red",
  EXPIRED: "text-bo-muted", CANCELLED: "text-bo-muted", CANCELED: "text-bo-muted", RETURNED: "text-bo-muted",
  PENDING: "text-bo-orange", NEW: "text-bo-blue", ACTIVE: "text-bo-blue", CASHED_OUT: "text-bo-purple",
};
const STATE_TR: Record<string, string> = {
  WON: "Kazandı", LOST: "Kaybetti", ACTIVE: "Açık", PENDING: "Bekliyor", RETURNED: "İade", CASHED_OUT: "Cashout", CANCELLED: "İptal",
  NEW: "Yeni", PAID: "Ödendi", REJECTED: "Reddedildi", COMPLETED: "Tamamlandı", EXPIRED: "Süresi doldu", CANCELED: "İptal", APPROVED: "Onaylandı",
  OPEN: "Açık", BLOCKED: "Bloke", CLOSED: "Kapalı", SELF_EXCLUDED: "Kendini dışladı",
};
export const StateBadge = ({ s }: { s: string }) => <span className={STATE_COLORS[s] ?? ""}>{STATE_TR[s] ?? s}</span>;

/** KPI kartı (BC dashboard / player KPIs) */
export function Kpi({ label, value, icon, color = "bo-blue" }: { label: string; value: ReactNode; icon: string; color?: string }) {
  const bg: Record<string, string> = { "bo-blue": "bg-sky-100 text-sky-600", "bo-red": "bg-rose-100 text-rose-600", "bo-orange": "bg-amber-100 text-amber-600", "bo-green": "bg-emerald-100 text-emerald-600", "bo-purple": "bg-violet-100 text-violet-600", lime: "bg-lime-100 text-lime-700", teal: "bg-teal-100 text-teal-600" };
  return (
    <div className="panel flex h-[74px] items-stretch overflow-hidden">
      <div className={`grid w-[74px] shrink-0 place-items-center ${bg[color] ?? bg["bo-blue"]}`}><div className="grid size-10 place-items-center rounded-full bg-white/80 text-xl shadow-sm">{icon}</div></div>
      <div className="flex min-w-0 flex-col justify-center px-3"><div className="truncate text-[11px] uppercase tracking-wide text-[#3b4351]">{label}</div><div className="mt-1 truncate text-[19px] text-[#8a93a1]">{value}</div></div>
    </div>
  );
}

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
    default: return { from: iso(sod), to: iso(new Date(sod.getTime() + day)) };
  }
}
const PRESETS: [string, string][] = [["today", "Bugün"], ["yesterday", "Dün"], ["week", "Bu Hafta"], ["lastweek", "Geçen Hafta"], ["month", "Bu Ay"], ["lastmonth", "Geçen Ay"]];
const toLocalInput = (s: string) => { const d = new Date(s); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [active, setActive] = useState<string>("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(([k, l]) => <button key={k} onClick={() => { setActive(k); onChange(presetRange(k)); }} className={`h-8 rounded-sm border px-3 text-[13px] ${active === k ? "border-bo-blue bg-bo-blue text-white" : "border-bo-blue/30 bg-bo-blue/5 text-bo-blue"}`}>{l}</button>)}
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
  DEPOSIT: "Yatırım", WITHDRAWAL: "Çekim", BET_STAKE: "Bahis", BET_WIN: "Kazanç",
  PREDICTION_BUY: "Tahmin Alımı", PREDICTION_SELL: "Tahmin Bozdurma", PREDICTION_WIN: "Tahmin Kazancı", PREDICTION_REFUND: "Tahmin İadesi", BET_REFUND: "Bahis İadesi", BONUS_GRANT: "Bonus Verildi",
  BONUS_CONVERT: "Bonus Dönüşümü", BONUS_EXPIRE: "Bonus Süresi Doldu", BONUS_CANCEL: "Bonus İptal", ADJUSTMENT: "Düzeltme",
  WITHDRAWAL_REFUND: "Çekim İadesi", CORRECTION_UP: "Düzeltme (+)", CORRECTION_DOWN: "Düzeltme (−)",
};
