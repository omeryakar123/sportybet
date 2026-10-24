import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { Btn, Empty, ErrBox, Field, I, Spinner, dt, inp, money, money0, useStore } from "./lib";

const PAY_TR: Record<string, [string, string]> = {
  NEW: ["İnceleniyor", "bg-odds/15 text-odds"], PENDING: ["Onaylandı · Ödeme bekliyor", "bg-caution/15 text-caution"],
  PAID: ["Tamamlandı", "bg-win/15 text-win"], REJECTED: ["Reddedildi", "bg-loss/15 text-loss"], CANCELLED: ["İptal edildi", "bg-elevated text-muted"],
};

function SystemPicker({ systems, value, onChange }: { systems: any[]; value: any; onChange: (s: any) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {systems.map((s) => (
        <button key={s.name} onClick={() => onChange(s)}
          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 text-left transition-colors ${value?.name === s.name ? "border-primary bg-primary/10" : "border-line bg-card hover:bg-surface-hover"}`}>
          {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-8 w-12 rounded object-contain" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-elevated text-primary"><I n="wallet" className="size-5" /></span>}
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold">{s.displayName}</span>
            <span className="block text-xs font-semibold text-subtle">{money0(s.minAmount)}{s.maxAmount ? ` – ${money0(s.maxAmount)}` : "+"}</span>
          </span>
          {value?.name === s.name && <I n="check" className="ml-auto size-4 shrink-0 text-primary" />}
        </button>
      ))}
    </div>
  );
}

function MyRequests({ type, refresh, onCancelled }: { type: "DEPOSIT" | "WITHDRAWAL"; refresh: number; onCancelled: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/me/payments").then((r) => setRows(r.filter((x: any) => x.type === type).slice(0, 8))).catch(() => setRows([])); }, [refresh]);
  async function cancel(id: string) { setErr(""); try { await api(`/api/payments/${id}/cancel`, { method: "POST", json: {} }); onCancelled(); } catch (x: any) { setErr(x.message); } }
  if (!rows || rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-extrabold">Son Taleplerin</h2>
      <ErrBox e={err} />
      <div className="overflow-hidden rounded-lg border border-line">
        {rows.map((r) => {
          const [lbl, cls] = PAY_TR[r.state] ?? [r.state, "bg-elevated text-muted"];
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-row px-4 py-3 text-sm last:border-0">
              <span className="font-extrabold">{money(r.amount)}</span>
              <span className="font-semibold text-subtle">{r.paymentSystem}</span>
              <span className="text-xs font-semibold text-dim">{dt(r.createdAt)}</span>
              <span className={`ml-auto rounded-sm px-2 py-0.5 text-[12px] font-extrabold ${cls}`}>{lbl}</span>
              {r.state === "REJECTED" && r.rejectReason && <span className="w-full text-xs font-semibold text-loss">Sebep: {r.rejectReason}</span>}
              {type === "WITHDRAWAL" && r.state === "NEW" && <button onClick={() => cancel(r.id)} className="text-xs font-bold text-loss hover:underline">İptal et</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Deposit() {
  const { me, setAuthOpen, refreshMe } = useStore();
  const [sp] = useSearchParams();
  const [systems, setSystems] = useState<any[] | null>(null);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [sys, setSys] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [bonusId, setBonusId] = useState<number | 0>(sp.get("bonus") ? Number(sp.get("bonus")) : 0);
  const [txid, setTxid] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    api("/api/payment-systems?type=DEPOSIT").then((r) => { setSystems(r); setSys(r[0] ?? null); }).catch(() => setSystems([]));
    api("/api/bonuses/available").then((r) => setBonuses(r.filter((b: any) => b.depositBonus))).catch(() => {});
  }, []);
  if (!me) return <AuthGate title="Para Yatır" onAuth={() => setAuthOpen(true)} />;
  if (!systems) return <Spinner />;
  const selBonus = bonuses.find((b) => b.id === bonusId);
  const crypto = sys?.config?.depositAddress ? sys.config : null; // kripto yöntemi: adres + ağ + TXID
  const needTxid = !!crypto?.requireTxid;
  const canSubmit = !!sys && Number(amount) > 0 && (!needTxid || txid.trim().length >= 8);
  async function copyAddr() { try { await navigator.clipboard.writeText(crypto.depositAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }
  async function submit() {
    setBusy(true); setErr(""); setDone(false);
    try {
      const info = needTxid || txid ? { txid: txid.trim(), network: crypto?.network } : undefined;
      await api("/api/payments/deposit", { method: "POST", json: { paymentSystem: sys.name, amount: Number(amount), bonusId: bonusId || undefined, info } });
      setDone(true); setAmount(""); setTxid(""); setRefresh((x) => x + 1); refreshMe();
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  }
  return (
    <div className="animate-sports-fade mx-auto max-w-2xl">
      <h1 className="flex items-center gap-2.5 text-2xl font-extrabold"><I n="arrowdown" className="size-6 text-win" />Para Yatır</h1>
      <p className="mt-1 text-sm font-medium text-subtle">Yöntemi seç, tutarı gir; talebin dakikalar içinde onaylanır.</p>
      <div className="mt-5 space-y-5">
        <SystemPicker systems={systems} value={sys} onChange={(s) => { setSys(s); setTxid(""); }} />
        {sys?.instructions && <div className="rounded-md border border-odds/30 bg-odds/10 px-3 py-2.5 text-sm font-semibold text-muted">{sys.instructions}</div>}
        {crypto && (
          <div className="rounded-lg border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-soft">Yatırım adresi {crypto.network && <span className="ml-1 rounded-sm bg-elevated px-1.5 py-0.5 text-[11px] font-extrabold text-primary">{crypto.network}</span>}</span>
              <button onClick={copyAddr} className="cursor-pointer text-xs font-bold text-primary hover:underline">{copied ? "Kopyalandı ✓" : "Adresi kopyala"}</button>
            </div>
            <code className="mt-2 block break-all rounded-md bg-elevated px-3 py-2.5 font-mono text-[13px] font-bold text-fg">{crypto.depositAddress}</code>
            <p className="mt-2 text-[11px] font-medium text-dim">Yalnızca <b className="text-soft">{crypto.network || "belirtilen"}</b> ağından gönderim yapın; farklı ağdan gelen transferler kaybolabilir. Gönderdikten sonra tutarı{needTxid ? " ve işlem numaranı (TXID)" : ""} girip talebi oluştur.</p>
            {needTxid && (
              <div className="mt-3">
                <Field label="İşlem No (TXID)"><input className={inp + " font-mono"} placeholder="Gönderim sonrası cüzdanındaki işlem kimliği" value={txid} onChange={(e) => setTxid(e.target.value)} /></Field>
              </div>
            )}
          </div>
        )}
        <Field label={`Tutar (${money0(sys?.minAmount)}${sys?.maxAmount ? ` – ${money0(sys.maxAmount)}` : " ve üzeri"})`}>
          <input className={inp} inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))} />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          {[250, 500, 1000, 5000].map((v) => (
            <button key={v} onClick={() => setAmount(String(v))} className={`h-10 cursor-pointer rounded-md text-sm font-bold transition-colors ${Number(amount) === v ? "bg-primary text-primary-fg" : "bg-elevated text-muted hover:bg-elevated-hover hover:text-fg"}`}>{v.toLocaleString("tr-TR")}</button>
          ))}
        </div>
        {bonuses.length > 0 && (
          <div>
            <div className="mb-2 text-[13px] font-semibold text-soft">Yatırım bonusu seç (isteğe bağlı)</div>
            <div className="space-y-2">
              <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${!bonusId ? "border-primary bg-primary/10" : "border-line bg-card"}`}>
                <input type="radio" checked={!bonusId} onChange={() => setBonusId(0)} className="accent-[#1fe88a]" /><span className="text-sm font-bold">Bonus istemiyorum</span>
              </label>
              {bonuses.map((b) => (
                <label key={b.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${bonusId === b.id ? "border-primary bg-primary/10" : "border-line bg-card"}`}>
                  <input type="radio" checked={bonusId === b.id} onChange={() => setBonusId(b.id)} className="mt-1 accent-[#1fe88a]" />
                  <span>
                    <span className="block text-sm font-extrabold">{b.name} <span className="text-primary">%{Number(b.percent)}</span></span>
                    <span className="block text-xs font-medium text-subtle">{b.description ?? `Çevrim x${Number(b.wageringMultiplier)} · ${b.expirationDays} gün geçerli`}</span>
                  </span>
                </label>
              ))}
            </div>
            {selBonus && Number(amount) > 0 && <p className="mt-2 text-xs font-bold text-win">Bu yatırımla ≈ {money(Math.min(Number(amount) * Number(selBonus.percent) / 100, Number(selBonus.maxAmount ?? Infinity)))} bonus kazanırsın.</p>}
          </div>
        )}
        <ErrBox e={err} />
        {done && <div className="rounded-md border border-win/30 bg-win/10 px-3 py-2.5 text-sm font-bold text-win">Talebin alındı! Onaylanınca bakiyen anında yüklenecek.</div>}
        <Btn className="w-full" disabled={busy || !canSubmit} onClick={submit}>Yatırım Talebi Oluştur</Btn>
      </div>
      <MyRequests type="DEPOSIT" refresh={refresh} onCancelled={() => setRefresh((x) => x + 1)} />
    </div>
  );
}

export function Withdraw() {
  const { me, setAuthOpen, balance, refreshMe } = useStore();
  const [systems, setSystems] = useState<any[] | null>(null);
  const [sys, setSys] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [info, setInfo] = useState<Record<string, string>>({});
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [refresh, setRefresh] = useState(0);
  const [activeBonus, setActiveBonus] = useState<any>(null);
  useEffect(() => {
    api("/api/payment-systems?type=WITHDRAWAL").then((r) => { setSystems(r); setSys(r[0] ?? null); }).catch(() => setSystems([]));
    api("/api/me/bonuses").then((r) => setActiveBonus(r.find((b: any) => b.state === "ACTIVE" && !b.bonus.allowWithdrawal) ?? null)).catch(() => {});
  }, []);
  if (!me) return <AuthGate title="Para Çek" onAuth={() => setAuthOpen(true)} />;
  if (!systems) return <Spinner />;
  const fields: any[] = sys?.fields ?? [];
  const ok = Number(amount) > 0 && fields.every((f) => (info[f.key] ?? "").trim().length > 0);
  async function submit() {
    setBusy(true); setErr(""); setDone(false);
    try {
      await api("/api/payments/withdraw", { method: "POST", json: { paymentSystem: sys.name, amount: Number(amount), info } });
      setDone(true); setAmount(""); setRefresh((x) => x + 1); refreshMe();
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  }
  return (
    <div className="animate-sports-fade mx-auto max-w-2xl">
      <h1 className="flex items-center gap-2.5 text-2xl font-extrabold"><I n="arrowup" className="size-6 text-loss" />Para Çek</h1>
      <p className="mt-1 text-sm font-medium text-subtle">Çekilebilir bakiyen: <b className="text-fg">{money(balance("MAIN"))}</b> (Ana Para cüzdanı)</p>
      {activeBonus && (
        <div className="mt-4 rounded-md border border-caution/40 bg-caution/10 px-3 py-2.5 text-sm font-semibold text-caution">
          Aktif bonusun var: <b>{activeBonus.bonus.name}</b>. Çevrim tamamlanmadan (%{Math.round(activeBonus.progress)}) çekim yapılamaz. <Link to="/hesap/bonuslarim" className="underline">Bonuslarım →</Link>
        </div>
      )}
      <div className="mt-5 space-y-5">
        <SystemPicker systems={systems} value={sys} onChange={(s) => { setSys(s); setInfo({}); }} />
        <Field label={`Tutar (${money0(sys?.minAmount)}${sys?.maxAmount ? ` – ${money0(sys.maxAmount)}` : " ve üzeri"})`}>
          <input className={inp} inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))} />
        </Field>
        {fields.map((f) => (
          <Field key={f.key} label={f.label}><input className={inp} value={info[f.key] ?? ""} onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })} /></Field>
        ))}
        <ErrBox e={err} />
        {done && <div className="rounded-md border border-win/30 bg-win/10 px-3 py-2.5 text-sm font-bold text-win">Çekim talebin alındı. Tutar bakiyenden ayrıldı; onaylanınca hesabına gönderilecek.</div>}
        <Btn className="w-full" disabled={busy || !sys || !ok || !!activeBonus} onClick={submit}>Çekim Talebi Oluştur</Btn>
        <p className="text-center text-[11px] font-medium text-dim">Talep anında tutar bakiyenden bloke edilir; reddedilirse anında iade edilir.</p>
      </div>
      <MyRequests type="WITHDRAWAL" refresh={refresh} onCancelled={() => { setRefresh((x) => x + 1); refreshMe(); }} />
    </div>
  );
}

function AuthGate({ title, onAuth }: { title: string; onAuth: () => void }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="mt-2 mb-4 text-sm font-semibold text-muted">Devam etmek için giriş yap.</p>
        <Btn onClick={onAuth}>Giriş Yap</Btn>
      </div>
    </div>
  );
}
