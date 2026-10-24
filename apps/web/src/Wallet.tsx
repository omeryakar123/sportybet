import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, asset } from "./api";
import { Btn, ErrBox, I, Spinner, dt, money, money0, parseAmount, useStore } from "./lib";
import { BannerSlot } from "./CmsSlot";
import { PageTitle } from "./g";

/* =====================================================================
 * Yatırım / Çekim — gamdom cüzdan akışı: yöntem listesi → form → sonuç.
 * Aynı paneller hem cüzdan penceresinde hem /para-yatir, /para-cek sayfalarında kullanılır.
 * Kurallar (sunucuda da aynısı zorunlu):
 *  Yatırım: yöntem limitleri · kripto ise TXID (en az 8 karakter, tekrar kullanılamaz) · en fazla 3 bekleyen talep ·
 *           bonus seçildiyse: aktif bonus olmamalı, bonusun alt yatırım tutarı karşılanmalı
 *  Çekim:   yöntem limitleri · tutar ≤ Ana Para · çekime kapalı aktif bonus yok · aynı anda tek bekleyen çekim ·
 *           yöntemin istediği tüm alanlar dolu. Tutar talep anında bloke edilir, red/iptalde anında iade.
 * ===================================================================== */

const PAY_TR: Record<string, [string, string]> = {
  NEW: ["İnceleniyor", "text-caution"], PENDING: ["Onaylandı · ödeme sırada", "text-caution"],
  PAID: ["Tamamlandı", "text-primary"], REJECTED: ["Reddedildi", "text-loss"], CANCELLED: ["İptal edildi", "text-subtle"],
};
const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** gamdom satırı: 51px, #0f151b — yöntem logosu + ad + limit + ok */
function MethodList({ systems, onPick }: { systems: any[]; onPick: (s: any) => void }) {
  if (!systems.length) return <div className="rounded-2xl bg-panel px-4 py-8 text-center text-[14px] font-medium text-subtle">Şu an kullanılabilir ödeme yöntemi yok. Destek ekibine yaz.</div>;
  return (
    <div className="flex flex-col gap-0.5 overflow-hidden rounded-2xl">
      {systems.map((s) => (
        <button key={s.name} onClick={() => onPick(s)} className="flex min-h-[56px] w-full items-center gap-3 bg-panel px-4 py-2 text-left transition-colors hover:bg-card">
          {s.logoUrl ? <img src={asset(s.logoUrl)} alt="" className="h-7 w-10 shrink-0 rounded object-contain" /> : <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-primary"><I n="wallet" className="size-[18px]" /></span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold text-white">{s.displayName}</span>
            <span className="block text-[12px] font-medium text-subtle">{money0(s.minAmount)}{s.maxAmount ? ` – ${money0(s.maxAmount)}` : " ve üzeri"}</span>
          </span>
          <I n="right" className="size-5 shrink-0 text-subtle" />
        </button>
      ))}
    </div>
  );
}

const Label = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-subtle"><span>{children}</span>{right}</div>;

function AmountInput({ value, onChange, chips, max }: { value: string; onChange: (v: string) => void; chips: number[]; max?: number }) {
  return (
    <>
      <div className="flex h-11 items-center gap-2 rounded-[10px] border border-transparent bg-field px-3 focus-within:border-primary/60">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#4fd35a] text-[11px] font-bold text-white">₺</span>
        <input aria-label="Tutar" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))} className="w-full bg-transparent text-[14px] font-bold outline-none placeholder:text-subtle" />
        {max != null && <button type="button" onClick={() => onChange(String(Math.floor(max * 100) / 100).replace(".", ","))} className="h-8 shrink-0 rounded-lg bg-card px-3 text-[12px] font-bold text-white hover:bg-card-2">Tümü</button>}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {chips.map((v) => <button key={v} type="button" onClick={() => onChange(String(v))} className={`h-9 rounded-lg text-[13px] font-bold transition-colors ${parseAmount(value) === v ? "bg-primary text-primary-fg" : "bg-card text-white hover:bg-card-2"}`}>{v.toLocaleString("tr-TR")}</button>)}
      </div>
    </>
  );
}

function MyRequests({ type, refresh, onCancelled, systems = [] }: { type: "DEPOSIT" | "WITHDRAWAL"; refresh: number; onCancelled: () => void; systems?: any[] }) {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api("/api/me/payments").then((r) => setRows((Array.isArray(r) ? r : []).filter((x: any) => x.type === type).slice(0, 6))).catch(() => setRows([])); }, [refresh, type]);
  async function cancel(id: string) { setErr(""); setBusy(id); try { await api(`/api/payments/${id}/cancel`, { method: "POST", json: {} }); onCancelled(); } catch (x: any) { setErr(x.message); } setBusy(null); }
  if (!rows?.length) return null;
  return (
    <section className="mt-6">
      <p className="mb-2 text-[14px] font-bold">Son talepler</p>
      <ErrBox e={err} />
      <div className="space-y-1.5">
        {rows.map((r) => {
          const [lbl, cls] = PAY_TR[r.state] ?? [r.state, "text-subtle"];
          return (
            <div key={r.id} className="rounded-[10px] bg-card px-3.5 py-3">
              <div className="flex items-center gap-3 text-[14px]">
                <span className="font-bold tabular-nums">{money(r.amount)}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-subtle">{systems.find((x) => x.name === r.paymentSystem)?.displayName ?? r.paymentSystem} · {dt(r.createdAt)}</span>
                <span className={`shrink-0 text-[12px] font-bold uppercase ${cls}`}>{lbl}</span>
              </div>
              {r.state === "REJECTED" && r.rejectReason && <p className="mt-1 text-[12px] font-medium text-loss">Sebep: {r.rejectReason}</p>}
              {type === "WITHDRAWAL" && r.state === "NEW" && <button disabled={busy === r.id} onClick={() => cancel(r.id)} className="mt-1.5 text-[12px] font-bold text-loss hover:underline disabled:opacity-50">{busy === r.id ? "İptal ediliyor…" : "Talebi iptal et (tutar iade edilir)"}</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Done({ title, text, onAgain }: { title: string; text: string; onAgain: () => void }) {
  return (
    <div className="animate-sheet rounded-2xl bg-panel px-5 py-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary"><I n="check" className="size-7" /></span>
      <p className="mt-4 text-[18px] font-bold">{title}</p>
      <p className="mt-1.5 text-[14px] font-medium text-subtle">{text}</p>
      <button onClick={onAgain} className="btn mt-5 bg-card text-white">Yeni talep</button>
    </div>
  );
}

// ---------------------------------------------------------------- YATIRIM
export function DepositPanel({ preBonus }: { preBonus?: number }) {
  const { me, refreshMe } = useStore();
  const [systems, setSystems] = useState<any[] | null>(null); const [bonuses, setBonuses] = useState<any[]>([]); const [hasActiveBonus, setHasActiveBonus] = useState(false);
  const [sys, setSys] = useState<any>(null); const [amount, setAmount] = useState(""); const [bonusId, setBonusId] = useState<number>(preBonus ?? 0); const [txid, setTxid] = useState("");
  const [copied, setCopied] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState<any>(null); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    api("/api/payment-systems?type=DEPOSIT").then((r) => { const l = Array.isArray(r) ? r : []; setSystems(l); if (l.length === 1) setSys(l[0]); }).catch(() => setSystems([]));
    api("/api/bonuses/available").then((r) => setBonuses((Array.isArray(r) ? r : []).filter((b: any) => b.depositBonus))).catch(() => {});
    api("/api/me/bonuses").then((r) => setHasActiveBonus((Array.isArray(r) ? r : []).some((b: any) => b.state === "ACTIVE"))).catch(() => {});
  }, [me?.id]);
  if (!systems) return <Spinner />;
  if (done) return <Done title="Yatırım talebin alındı" text={`${money(done.amount)} · ${done.system}. Onaylanınca bakiyene anında yüklenir; durumunu aşağıdan takip edebilirsin.`} onAgain={() => { setDone(null); setRefresh((x) => x + 1); }} />;
  if (!sys) return <><MethodList systems={systems} onPick={(s) => { setSys(s); setErr(""); setTxid(""); }} /><MyRequests type="DEPOSIT" refresh={refresh} systems={systems} onCancelled={() => setRefresh((x) => x + 1)} /></>;

  const crypto = sys.config?.depositAddress ? sys.config : null;
  const needTxid = !!sys.config?.requireTxid;
  const noAddress = needTxid && !crypto; // kripto yöntemi ama adres backoffice'te girilmemiş
  const amt = parseAmount(amount);
  const min = Number(sys.minAmount ?? 0), max = sys.maxAmount ? Number(sys.maxAmount) : null;
  const bonus = bonuses.find((b) => b.id === bonusId);
  const bonusMin = bonus?.minAmount ? Number(bonus.minAmount) : 0;
  const bonusAmt = bonus ? Math.min((amt * Number(bonus.percent ?? 0)) / 100, bonus.maxAmount ? Number(bonus.maxAmount) : Infinity) : 0;
  const problem = !amt ? "" : amt < min ? `En az ${money(min)} yatırabilirsin.` : max != null && amt > max ? `En fazla ${money(max)} yatırabilirsin.` : bonus && hasActiveBonus ? "Aktif bir bonusun varken yeni yatırım bonusu seçemezsin." : bonus && amt < bonusMin ? `Bu bonus için en az ${money(bonusMin)} yatırmalısın.` : needTxid && txid.trim().length > 0 && txid.trim().length < 8 ? "İşlem numarası (TXID) çok kısa." : "";
  const ready = amt > 0 && !problem && !noAddress && (!needTxid || txid.trim().length >= 8);
  const chips = [min > 250 ? min : 250, 500, 1000, 5000].filter((v, i, a) => a.indexOf(v) === i && (max == null || v <= max));
  async function submit() {
    setBusy(true); setErr("");
    try {
      await api("/api/payments/deposit", { method: "POST", json: { paymentSystem: sys.name, amount: amt, bonusId: bonusId || undefined, info: txid.trim() ? { txid: txid.trim() } : undefined } });
      setDone({ amount: amt, system: sys.displayName }); setAmount(""); setTxid(""); refreshMe();
    } catch (x: any) { setErr(x.message === "BONUS_MIN_DEPOSIT" && x.detail?.min ? `Bu bonus için en az ${money(x.detail.min)} yatırmalısın.` : x.message); }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <button onClick={() => setSys(null)} className="flex w-full items-center gap-3 rounded-[10px] bg-panel px-3 py-2.5 text-left hover:bg-card">
        {sys.logoUrl ? <img src={asset(sys.logoUrl)} alt="" className="h-6 w-9 rounded object-contain" /> : <I n="wallet" className="size-5 text-primary" />}
        <span className="flex-1 text-[15px] font-bold">{sys.displayName}</span><span className="text-[12px] font-medium text-subtle">Değiştir</span>
      </button>
      {sys.instructions && <p className="rounded-[10px] bg-card px-3.5 py-3 text-[13px] font-medium text-muted">{sys.instructions}</p>}
      {noAddress && <p className="rounded-[10px] bg-caution/10 px-3.5 py-3 text-[13px] font-bold text-caution">Bu yöntemin yatırım adresi şu an tanımlı değil. Başka bir yöntem seç ya da canlı destekten adres iste.</p>}
      {crypto && (
        <div className="rounded-2xl bg-card p-4">
          <Label right={<button onClick={async () => { try { await navigator.clipboard.writeText(crypto.depositAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }} className="text-[12px] font-bold text-primary">{copied ? "Kopyalandı ✓" : "Kopyala"}</button>}>
            Yatırım adresi {crypto.network && <span className="ml-1 rounded-md bg-elevated px-1.5 py-0.5 text-[11px] font-bold text-primary">{crypto.network}</span>}
          </Label>
          <code className="block break-all rounded-[10px] bg-field px-3 py-2.5 font-mono text-[13px] font-bold">{crypto.depositAddress}</code>
          <p className="mt-2 text-[12px] font-medium text-subtle">Sadece <b className="text-white">{crypto.network || "belirtilen"}</b> ağından gönder; farklı ağdan gelen transferler kaybolur. Gönderdikten sonra tutarı{needTxid ? " ve işlem numarasını" : ""} girip talebi oluştur.</p>
        </div>
      )}
      <div>
        <Label right={<span>{money0(min)}{max ? ` – ${money0(max)}` : "+"}</span>}>Tutar</Label>
        <AmountInput value={amount} onChange={setAmount} chips={chips} />
      </div>
      {needTxid && (
        <div>
          <Label>İşlem numarası (TXID)</Label>
          <input className="input font-mono text-[13px]" placeholder="Cüzdanındaki işlem kimliği" value={txid} onChange={(e) => setTxid(e.target.value.trim())} />
        </div>
      )}
      {bonuses.length > 0 && (
        <div>
          <Label>Yatırım bonusu</Label>
          <div className="flex flex-col gap-0.5 overflow-hidden rounded-2xl">
            {[{ id: 0, name: "Bonus istemiyorum" }, ...bonuses].map((b: any) => (
              <button key={b.id} type="button" onClick={() => setBonusId(b.id)} className="flex w-full items-center gap-3 bg-panel px-4 py-3 text-left hover:bg-card">
                <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${bonusId === b.id ? "border-primary" : "border-elevated"}`}>{bonusId === b.id && <span className="size-2.5 rounded-full bg-primary" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">{b.name}{b.percent ? <span className="ml-1.5 text-primary">%{Number(b.percent)}</span> : null}</span>
                  {b.id !== 0 && <span className="block text-[12px] font-medium text-subtle">{b.description ?? `Çevrim x${Number(b.wageringMultiplier)} · ${b.expirationDays} gün`}{b.minAmount ? ` · en az ${money0(b.minAmount)}` : ""}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {amt > 0 && !problem && (
        <div className="space-y-1.5 rounded-[10px] bg-card px-3.5 py-3 text-[13px] font-medium">
          <div className="flex justify-between"><span className="text-subtle">Ana Para'ya geçecek</span><b className="tabular-nums">{money(amt)}</b></div>
          {bonus && bonusAmt > 0 && <div className="flex justify-between"><span className="text-subtle">Bonus (onayda)</span><b className="tabular-nums text-caution">+{money(bonusAmt)}</b></div>}
        </div>
      )}
      {problem && <p className="text-[13px] font-bold text-caution">{problem}</p>}
      <ErrBox e={err} />
      <Btn className="w-full" disabled={busy || !ready} onClick={submit}>{busy ? "Gönderiliyor…" : amt ? `${money(amt)} yatırım talebi oluştur` : "Tutarı gir"}</Btn>
      <MyRequests type="DEPOSIT" refresh={refresh} systems={systems} onCancelled={() => setRefresh((x) => x + 1)} />
    </div>
  );
}

// ---------------------------------------------------------------- ÇEKİM
export function WithdrawPanel() {
  const { me, balance, refreshMe } = useStore();
  const [systems, setSystems] = useState<any[] | null>(null); const [activeBonus, setActiveBonus] = useState<any>(null); const [openReq, setOpenReq] = useState<any>(null);
  const [sys, setSys] = useState<any>(null); const [amount, setAmount] = useState(""); const [info, setInfo] = useState<Record<string, string>>({});
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState<any>(null); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    api("/api/payment-systems?type=WITHDRAWAL").then((r) => { const l = Array.isArray(r) ? r : []; setSystems(l); if (l.length === 1) setSys(l[0]); }).catch(() => setSystems([]));
    api("/api/me/bonuses").then((r) => setActiveBonus((Array.isArray(r) ? r : []).find((b: any) => b.state === "ACTIVE" && !b.bonus.allowWithdrawal) ?? null)).catch(() => {});
  }, [me?.id]);
  useEffect(() => { api("/api/me/payments").then((r) => setOpenReq((Array.isArray(r) ? r : []).find((x: any) => x.type === "WITHDRAWAL" && (x.state === "NEW" || x.state === "PENDING")) ?? null)).catch(() => {}); }, [refresh]);
  if (!systems) return <Spinner />;
  const bal = balance("MAIN");
  const head = (
    <div className="mb-4 flex items-center justify-between rounded-[10px] bg-card px-3.5 py-3">
      <span className="text-[13px] font-medium text-subtle">Çekilebilir bakiye (Ana Para)</span><b className="num text-[16px]">{money(bal)}</b>
    </div>
  );
  if (done) return <Done title="Çekim talebin alındı" text={`${money(done.amount)} · ${done.system}. Tutar bakiyenden ayrıldı; onaylanınca hesabına gönderilir. Reddedilirse anında iade edilir.`} onAgain={() => { setDone(null); setRefresh((x) => x + 1); }} />;
  const blocker = activeBonus
    ? <div className="rounded-[10px] bg-caution/10 px-3.5 py-3 text-[13px] font-bold text-caution">Aktif bonusun var: {activeBonus.bonus.name}. Çevrim tamamlanmadan (%{Math.round(activeBonus.progress)}) çekim yapılamaz. <Link to="/hesap/bonuslarim" className="underline">Bonuslarım</Link></div>
    : openReq ? <div className="rounded-[10px] bg-caution/10 px-3.5 py-3 text-[13px] font-bold text-caution">Bekleyen bir çekim talebin var ({money(openReq.amount)}). Sonuçlanınca yeni talep oluşturabilirsin; istersen aşağıdan iptal edebilirsin.</div>
    : null;
  if (!sys) return <>{head}{blocker && <div className="mb-3">{blocker}</div>}<MethodList systems={systems} onPick={(s) => { setSys(s); setInfo({}); setErr(""); }} /><MyRequests type="WITHDRAWAL" refresh={refresh} systems={systems} onCancelled={() => { setRefresh((x) => x + 1); refreshMe(); }} /></>;

  const fields: any[] = Array.isArray(sys.fields) ? sys.fields : [];
  const amt = parseAmount(amount);
  const min = Number(sys.minAmount ?? 0), max = sys.maxAmount ? Number(sys.maxAmount) : null;
  const problem = !amt ? "" : amt > bal ? `Bakiyen ${money(bal)}; bundan fazlasını çekemezsin.` : amt < min ? `En az ${money(min)} çekebilirsin.` : max != null && amt > max ? `Tek seferde en fazla ${money(max)} çekebilirsin.` : "";
  const missing = fields.filter((f) => !(info[f.key] ?? "").trim());
  const ready = amt > 0 && !problem && !missing.length && !blocker;
  async function submit() {
    setBusy(true); setErr("");
    try {
      await api("/api/payments/withdraw", { method: "POST", json: { paymentSystem: sys.name, amount: amt, info: Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.trim()])) } });
      setDone({ amount: amt, system: sys.displayName }); setAmount(""); setInfo({}); refreshMe();
    } catch (x: any) { setErr(x.message === "MISSING_FIELD" && x.detail?.field ? `"${x.detail.field}" alanını doldur.` : x.message); }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      {head}
      <button onClick={() => setSys(null)} className="flex w-full items-center gap-3 rounded-[10px] bg-panel px-3 py-2.5 text-left hover:bg-card">
        {sys.logoUrl ? <img src={asset(sys.logoUrl)} alt="" className="h-6 w-9 rounded object-contain" /> : <I n="wallet" className="size-5 text-primary" />}
        <span className="flex-1 text-[15px] font-bold">{sys.displayName}</span><span className="text-[12px] font-medium text-subtle">Değiştir</span>
      </button>
      {blocker}
      {sys.instructions && <p className="rounded-[10px] bg-card px-3.5 py-3 text-[13px] font-medium text-muted">{sys.instructions}</p>}
      <div>
        <Label right={<span>{money0(min)}{max ? ` – ${money0(max)}` : "+"}</span>}>Tutar</Label>
        <AmountInput value={amount} onChange={setAmount} chips={[min > 250 ? min : 250, 500, 1000, 2500].filter((v, i, a) => a.indexOf(v) === i)} max={max != null ? Math.min(bal, max) : bal} />
      </div>
      {fields.map((f) => (
        <div key={f.key}>
          <Label>{f.label}</Label>
          <input className="input" value={info[f.key] ?? ""} onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })} placeholder={f.placeholder ?? f.label} />
        </div>
      ))}
      {amt > 0 && !problem && (
        <div className="space-y-1.5 rounded-[10px] bg-card px-3.5 py-3 text-[13px] font-medium">
          <div className="flex justify-between"><span className="text-subtle">Çekilecek</span><b className="tabular-nums">{money(amt)}</b></div>
          <div className="flex justify-between"><span className="text-subtle">Talep sonrası bakiye</span><b className="tabular-nums">{money(bal - amt)}</b></div>
        </div>
      )}
      {problem && <p className="text-[13px] font-bold text-caution">{problem}</p>}
      <ErrBox e={err} />
      <Btn className="w-full" disabled={busy || !ready} onClick={submit}>{busy ? "Gönderiliyor…" : missing.length && amt ? `${missing[0].label} alanını doldur` : amt ? `${money(amt)} çekim talebi oluştur` : "Tutarı gir"}</Btn>
      <p className="text-center text-[12px] font-medium text-subtle">Tutar talep anında bakiyenden ayrılır; reddedilir ya da iptal edersen anında geri yüklenir.</p>
      <MyRequests type="WITHDRAWAL" refresh={refresh} systems={systems} onCancelled={() => { setRefresh((x) => x + 1); refreshMe(); }} />
    </div>
  );
}

// ---------------------------------------------------------------- sayfalar
function AuthGate({ title, onAuth }: { title: string; onAuth: () => void }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <h1 className="h-sec">{title}</h1>
        <p className="mt-2 mb-4 text-[14px] font-medium text-subtle">Devam etmek için giriş yap.</p>
        <Btn onClick={onAuth}>Giriş yap</Btn>
      </div>
    </div>
  );
}
export function Deposit() {
  const { me, setAuthOpen } = useStore();
  const [sp] = useSearchParams();
  if (!me) return <AuthGate title="Para Yatır" onAuth={() => setAuthOpen(true)} />;
  return (
    <div className="animate-sports-fade mx-auto max-w-[520px]">
      <PageTitle>Para Yatır</PageTitle>
      <BannerSlot group="deposit-top" className="mb-4" />
      <DepositPanel preBonus={sp.get("bonus") ? Number(sp.get("bonus")) : undefined} />
    </div>
  );
}
export function Withdraw() {
  const { me, setAuthOpen } = useStore();
  if (!me) return <AuthGate title="Para Çek" onAuth={() => setAuthOpen(true)} />;
  return (
    <div className="animate-sports-fade mx-auto max-w-[520px]">
      <PageTitle>Para Çek</PageTitle>
      <WithdrawPanel />
    </div>
  );
}
