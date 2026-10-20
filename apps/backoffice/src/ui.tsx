import { ReactNode } from "react";
export const money = (v: any, cur = "₺") => `${cur}${Number(v ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dt = (v: any) => (v ? new Date(v).toLocaleString("tr-TR") : "");
export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel mb-3">
      <div className="panel-title flex items-center justify-between"><span>{title}</span>{right}</div>
      <div className="p-3">{children}</div>
    </section>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="lbl">{label}</span>{children}</label>;
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-600/60 pt-24">
      <div className="w-full max-w-4xl rounded bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between border-b border-bo-blue/30 pb-3">
          <h2 className="text-base">{title}</h2>
          <button onClick={onClose} className="text-lg text-bo-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
export const StateBadge = ({ s }: { s: string }) => {
  const c = { WON: "text-bo-green", PAID: "text-bo-green", COMPLETED: "text-bo-green", LOST: "text-bo-red", EXPIRED: "text-bo-muted", PENDING: "text-bo-orange", ACTIVE: "text-bo-blue" }[s] ?? "";
  return <span className={c}>{s}</span>;
};
