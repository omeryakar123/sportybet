import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "./api";
import { AVATAR_PRESETS, Avatar, Btn, Empty, ErrBox, Field, I, Spinner, TX_TR, dt, inp, money, useStore } from "./lib";
import { MyPositions } from "./predictions";

const NAV = [
  ["/hesap", "user", "Hesap", true],
  ["/hesap/tahminlerim", "vote", "Tahminlerim", false],
  ["/hesap/islemler", "list", "İşlemler", false],
  ["/hesap/kuponlarim", "ticket", "Kuponlarım", false],
  ["/hesap/bonuslarim", "gift", "Bonuslarım", false],
  ["/hesap/guvenlik", "shield", "Güvenlik", false],
] as const;

export function AccountLayout() {
  const { me, logout, setAuthOpen } = useStore();
  const nav = useNavigate();
  if (!me) return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center"><p className="mb-4 font-semibold text-muted">Hesabını görmek için giriş yap.</p><Btn onClick={() => setAuthOpen(true)}>Giriş yap</Btn></div>
    </div>
  );
  return (
    <div className="animate-sports-fade grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
      <aside className="h-fit min-w-0 lg:sticky lg:top-4">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-l-0 px-4 lg:mx-0 lg:flex-col lg:border-l lg:border-line lg:px-0">
          {NAV.map(([to, icon, label, end]) => (
            <NavLink key={to} to={to} end={end as boolean} className={({ isActive }) =>
              `flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition-colors lg:-ml-px lg:rounded-none lg:border-l-2 ${isActive ? "bg-card text-fg lg:border-primary lg:bg-transparent" : "text-subtle hover:text-fg lg:border-transparent"}`}>
              <I n={icon} className="size-[18px]" />{label}
            </NavLink>
          ))}
          <button onClick={() => { logout(); nav("/"); }} className="flex shrink-0 items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-bold text-loss hover:bg-card lg:mt-3 lg:-ml-px lg:rounded-none lg:border-l-2 lg:border-transparent">
            <I n="x" className="size-[18px]" />Çıkış Yap
          </button>
        </nav>
      </aside>
      <div className="min-w-0 rounded-xl border border-line bg-panel-deep/60 p-3 sm:p-4 lg:p-6"><Outlet /></div>
    </div>
  );
}

const H = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-extrabold">{children}</h1>{right}</div>
);
const Seg = ({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) => (
  <div className="flex rounded-full bg-field p-1">
    {tabs.map(([v, l]) => <button key={v} onClick={() => onChange(v)} className={`chip border-transparent ${value === v ? "chip-on" : "bg-transparent"}`}>{l}</button>)}
  </div>
);

// ---------- Hesap (profil) ----------
export function Profile() {
  const { me, refreshMe, balance } = useStore();
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (me) setF({ firstName: me.firstName ?? "", lastName: me.lastName ?? "", email: me.email ?? "", phone: me.phone ?? "", birthDate: me.birthDate?.slice(0, 10) ?? "", city: me.city ?? "" }); }, [me?.id]);
  if (!f) return <Spinner />;
  async function save() {
    setErr(""); setMsg("");
    try { await api("/api/me", { method: "PATCH", json: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "")) }); setMsg("Bilgilerin kaydedildi ✓"); refreshMe(); } catch (x: any) { setErr(x.message); }
  }
  return (
    <>
      <H>Hesap</H>
      <AvatarPicker />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[["Ana Para", balance("MAIN"), "wallet"], ["Bonus", balance("BONUS"), "gift"], ["Oynadığın Cüzdan", me.activeWallet === "BONUS" ? "Bonus" : "Ana Para", "check"]].map(([l, v, ic]: any) => (
          <div key={l} className="flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3.5">
            <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary"><I n={ic} className="size-5" /></span>
            <span><span className="block text-xs font-bold text-subtle">{l}</span><span className="text-[15px] font-extrabold">{typeof v === "number" ? money(v) : v}</span></span>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kullanıcı adı"><input className={inp} value={me.username} disabled /></Field>
        <Field label="Üyelik tarihi"><input className={inp} value={new Date(me.createdAt).toLocaleDateString("tr-TR")} disabled /></Field>
        <Field label="Ad"><input className={inp} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Soyad"><input className={inp} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
        <Field label="E-posta"><input className={inp} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Telefon"><input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Doğum tarihi"><input className={inp} type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /></Field>
        <Field label="Şehir"><input className={inp} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
      </div>
      <div className="mt-4 space-y-2">{msg && <div className="rounded-md border border-win/30 bg-win/10 px-3 py-2.5 text-sm font-bold text-win">{msg}</div>}<ErrBox e={err} /></div>
      <Btn className="mt-4" onClick={save}>Kaydet</Btn>
    </>
  );
}

// ---------- Profil fotoğrafı ----------
function AvatarPicker() {
  const { me, refreshMe } = useStore();
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function save(v: string | null) {
    setErr(""); setBusy(true);
    try { await api("/api/me", { method: "PATCH", json: { avatar: v } }); await refreshMe(); setOpen(false); } catch (x: any) { setErr(x.message === "VALIDATION_ERROR" ? "Resim kabul edilmedi (png/jpg/webp, en fazla ~150 KB)" : x.message); }
    setBusy(false);
  }
  // Seçilen resmi tarayıcıda 256×256 kare kırpıp webp/jpeg olarak küçült
  function onFile(f?: File) {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) { setErr("Sadece resim dosyası seçebilirsin"); return; }
    if (f.size > 8 * 1024 * 1024) { setErr("Dosya 8 MB'tan büyük olamaz"); return; }
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const S = 256, c = document.createElement("canvas"); c.width = S; c.height = S;
      const x = c.getContext("2d")!; const m = Math.min(img.width, img.height);
      x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      let d = c.toDataURL("image/webp", 0.85); if (!d.startsWith("data:image/webp")) d = c.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url); save(d);
    };
    img.onerror = () => { setErr("Resim okunamadı"); URL.revokeObjectURL(url); };
    img.src = url;
  }
  return (
    <div className="mb-6 rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <Avatar src={me.avatar} name={me.username} className="size-20 ring-4 ring-primary/30" />
          <button onClick={() => fileRef.current?.click()} className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full bg-primary text-primary-fg shadow-lg hover:bg-primary-hover" aria-label="Fotoğraf yükle"><I n="camera" className="size-4" /></button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold">{me.username}</div>
          <div className="text-sm text-subtle">Profil fotoğrafın sitede ve kuponlarında görünür.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn kind="soft" onClick={() => setOpen(!open)}>Avatar seç</Btn>
          <Btn onClick={() => fileRef.current?.click()} disabled={busy}>Fotoğraf yükle</Btn>
          {me.avatar && <Btn kind="ghost" onClick={() => save(null)} disabled={busy}>Kaldır</Btn>}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {open && (
        <div className="mt-4 grid grid-cols-6 gap-3 sm:grid-cols-12">
          {AVATAR_PRESETS.map((_, i) => {
            const k = `av:${i + 1}`;
            return <button key={k} disabled={busy} onClick={() => save(k)} className={`rounded-full transition-transform hover:scale-110 ${me.avatar === k ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}><Avatar src={k} className="size-12" /></button>;
          })}
        </div>
      )}
      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-t border-line pt-3">
        <span><span className="block text-sm font-bold">İstatistiklerimi gizle</span><span className="block text-[12px] text-subtle">Diğer oyuncular profilinde bahis sayını, yatırdığın tutarı ve net kârını göremez.</span></span>
        <input type="checkbox" className="size-5 accent-[#00ff86]" checked={!!me.hideStats} disabled={busy} onChange={async (e) => { setBusy(true); try { await api("/api/me", { method: "PATCH", json: { hideStats: e.target.checked } }); await refreshMe(); } catch (x: any) { setErr(x.message); } setBusy(false); }} />
      </label>
      {err && <div className="mt-3"><ErrBox e={err} /></div>}
    </div>
  );
}

// ---------- Tahminlerim ----------
export function MyPredictions() {
  const { refreshMe } = useStore();
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api(`/api/me/predictions${tab === "open" ? "?status=OPEN" : "?status=WON,LOST,SOLD,REFUNDED"}`).then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { setRows(null); load(); }, [tab]);
  return (
    <>
      <H right={<Seg tabs={[["open", "Açık"], ["closed", "Sonuçlanan"]]} value={tab} onChange={setTab} />}>Tahminlerim</H>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty text={tab === "open" ? "Açık tahminin yok. Hadi bir gündem seç!" : "Sonuçlanan tahminin yok."} /> : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="rounded-lg border border-line bg-card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/tahminler/${p.market.slug}`} className="line-clamp-2 text-sm font-bold hover:underline">{p.market.question}</Link>
                <span className={`shrink-0 rounded-sm px-2 py-0.5 text-[12px] font-extrabold ${p.status === "OPEN" ? "bg-odds/15 text-odds" : p.status === "WON" ? "bg-win/15 text-win" : p.status === "LOST" ? "bg-loss/15 text-loss" : "bg-elevated text-muted"}`}>
                  {{ OPEN: "Açık", WON: "Kazandı", LOST: "Kaybetti", SOLD: "Bozduruldu", REFUNDED: "İade" }[p.status as string]}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold text-subtle">
                <span>Seçim: <b className="text-muted">{p.outcome.name}</b></span>
                <span>Tutar: <b className="text-muted">{money(p.stake)}</b></span>
                {p.status === "OPEN"
                  ? <><span>Güncel değer: <b className="text-primary">{money(p.currentValue)}</b></span><span>Kazanırsa: <b className="text-win">{money(p.shares)}</b></span></>
                  : <span>Ödeme: <b className="text-muted">{money(p.payout)}</b></span>}
                {p.wallet === "BONUS" && <span className="rounded-sm bg-primary/15 px-1.5 text-[12px] font-extrabold text-primary">Bonus</span>}
                <span className="ml-auto">{dt(p.createdAt)}</span>
              </div>
              {p.status === "OPEN" && <div className="-mt-7"><MyPositions positions={[p]} onChange={() => { load(); refreshMe(); }} /></div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- İşlemler ----------
export function Transactions() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [type, setType] = useState("");
  useEffect(() => { setRows(null); api(`/api/me/transactions?take=100${type ? `&type=${type}` : ""}`).then(setRows).catch(() => setRows([])); }, [type]);
  const GROUPS: [string, string][] = [["", "Tümü"], ["DEPOSIT", "Yatırımlar"], ["WITHDRAWAL,WITHDRAWAL_REFUND", "Çekimler"], ["BET_STAKE,BET_WIN,BET_REFUND", "Spor"], ["PREDICTION_BUY,PREDICTION_SELL,PREDICTION_WIN,PREDICTION_REFUND", "Tahmin"], ["BONUS_GRANT,BONUS_CONVERT,BONUS_EXPIRE,BONUS_CANCEL", "Bonus"]];
  return (
    <>
      <H>İşlemler</H>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
        {GROUPS.map(([v, l]) => <button key={v} onClick={() => setType(v)} className={`chip ${type === v ? "chip-on" : "bg-card text-subtle hover:text-fg"}`}>{l}</button>)}
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty text="İşlem bulunamadı." /> : (
        <div className="overflow-hidden rounded-lg border border-line">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-line bg-row px-4 py-3 last:border-0">
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${Number(t.amount) >= 0 ? "bg-win/10 text-win" : "bg-loss/10 text-loss"}`}><I n={Number(t.amount) >= 0 ? "arrowdown" : "arrowup"} className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{TX_TR[t.type] ?? t.type}{t.wallet?.type === "BONUS" && <span className="ml-2 rounded-sm bg-primary/15 px-1.5 text-[10px] font-extrabold text-primary">Bonus</span>}</div>
                <div className="truncate text-xs font-medium text-subtle">{dt(t.createdAt)}{t.note ? ` · ${t.note}` : t.paymentSystem ? ` · ${t.paymentSystem}` : ""}</div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-extrabold ${Number(t.amount) >= 0 ? "text-win" : "text-fg"}`}>{Number(t.amount) >= 0 ? "+" : ""}{money(t.amount)}</div>
                <div className="text-[11px] font-semibold text-dim">Bakiye {money(t.balanceAfter)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Kuponlarım ----------
const BET_TR: Record<string, [string, string]> = { PENDING: ["Bekliyor", "bg-elevated text-muted"], ACTIVE: ["Açık", "bg-odds/15 text-odds"], WON: ["Kazandı", "bg-win/15 text-win"], LOST: ["Kaybetti", "bg-loss/15 text-loss"], RETURNED: ["İade", "bg-elevated text-muted"], CASHED_OUT: ["Cashout", "bg-elevated text-muted"] };
export function MyCoupons() {
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { setRows(null); api(`/api/me/bets?state=${tab === "open" ? "PENDING,ACTIVE" : "WON,LOST,RETURNED,CASHED_OUT"}&take=50`).then(setRows).catch(() => setRows([])); }, [tab]);
  return (
    <>
      <H right={<Seg tabs={[["open", "Açık"], ["closed", "Sonuçlanan"]]} value={tab} onChange={setTab} />}>Kuponlarım</H>
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <div>
          <Empty text={tab === "open" ? "Açık kuponun yok." : "Sonuçlanan kuponun yok."} />
          <div className="mt-4 text-center"><Link to="/spor" className="text-sm font-bold text-primary hover:underline">Spor bahislerine git →</Link></div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((b) => {
            const [lbl, cls] = BET_TR[b.state] ?? [b.state, "bg-elevated text-muted"];
            return (
              <div key={b.id} className="overflow-hidden rounded-lg border border-line bg-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-sm">
                  <span className={`rounded-sm px-2 py-0.5 text-[12px] font-extrabold ${cls}`}>{lbl}</span>
                  <span className="font-bold">{b.type === "MULTIPLE" ? "Kombine" : "Tekli"}</span>
                  {b.couponId && <span className="flex items-center gap-1 text-xs font-semibold text-dim">ID: {b.couponId}<button onClick={() => navigator.clipboard?.writeText(b.couponId)} className="text-dim hover:text-fg"><I n="copy" className="size-3" /></button></span>}
                  {Number(b.stakeFromBonus) > 0 && <span className="rounded-sm bg-primary/15 px-1.5 text-[10px] font-extrabold text-primary">Bonus</span>}
                  <span className="ml-auto text-xs font-semibold text-subtle">{dt(b.createdAt)}</span>
                </div>
                <div className="px-4 py-2">
                  {(b.selections ?? []).map((s: any) => (
                    <div key={s.id} className="flex items-center gap-3 border-b border-line/50 py-2 text-sm last:border-0">
                      <span className={`size-2 shrink-0 rounded-full ${s.state === "WON" ? "bg-win" : s.state === "LOST" ? "bg-loss" : "bg-odds"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{s.selection} <span className="font-semibold text-subtle">· {s.market}</span></div>
                        <div className="truncate text-xs font-medium text-subtle">{s.matchName} · {dt(s.matchStart)}{s.info ? ` · ${s.info}` : ""}</div>
                      </div>
                      <span className="shrink-0 font-extrabold text-odds">{Number(s.odds).toFixed(2)}</span>
                    </div>
                  ))}
                  {(b.selections ?? []).length === 0 && <div className="py-2 text-xs font-medium text-subtle">Kupon detayı yükleniyor…</div>}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 bg-panel-deep/60 px-4 py-2.5 text-[13px] font-semibold text-subtle">
                  <span>Tutar <b className="text-fg">{money(b.stake)}</b></span>
                  <span>Oran <b className="text-fg">{Number(b.totalOdds).toFixed(2)}</b></span>
                  <span className="ml-auto">{b.state === "ACTIVE" || b.state === "PENDING" ? <>Olası kazanç <b className="text-win">{money(b.potentialWin)}</b></> : <>Sonuç <b className={Number(b.winAmount) > 0 ? "text-win" : "text-loss"}>{money(b.winAmount)}</b></>}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------- Bonuslarım ----------
export function MyBonuses() {
  const { refreshMe } = useStore();
  const [mine, setMine] = useState<any[] | null>(null);
  const [avail, setAvail] = useState<any[]>([]);
  const [code, setCode] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const load = () => { api("/api/me/bonuses").then(setMine).catch(() => setMine([])); api("/api/bonuses/available").then(setAvail).catch(() => {}); };
  useEffect(load, []);
  async function redeem() {
    setErr(""); setMsg("");
    try { const r = await api("/api/promo/redeem", { method: "POST", json: { code } }); setMsg(`Kod kullanıldı! ${money(r.amount)} bonus hesabına yüklendi.`); setCode(""); load(); refreshMe(); } catch (x: any) { setErr(x.message); }
  }
  async function request(id: number) {
    setErr(""); setMsg("");
    try { await api(`/api/bonuses/${id}/request`, { method: "POST", json: {} }); setMsg("Talebin alındı. Onaylanınca bonus hesabına yüklenecek."); load(); } catch (x: any) { setErr(x.message); }
  }
  const BS: Record<string, [string, string]> = { ACTIVE: ["Aktif", "bg-win/15 text-win"], COMPLETED: ["Tamamlandı", "bg-odds/15 text-odds"], EXPIRED: ["Süresi doldu", "bg-elevated text-muted"], CANCELED: ["İptal", "bg-elevated text-muted"], LOST: ["Bitti", "bg-elevated text-muted"] };
  return (
    <>
      <H>Bonuslarım</H>
      <div className="mb-5 rounded-lg border border-line bg-card p-4">
        <div className="mb-2 text-sm font-extrabold">Promosyon kodun mu var?</div>
        <div className="flex gap-2">
          <input aria-label="Promosyon kodu" className={inp + " uppercase"} placeholder="Kodu gir" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Btn className="!h-[46px]" disabled={code.length < 3} onClick={redeem}>Kodu kullan</Btn>
        </div>
      </div>
      <div className="mb-4 space-y-2">{msg && <div className="rounded-md border border-win/30 bg-win/10 px-3 py-2.5 text-sm font-bold text-win">{msg}</div>}<ErrBox e={err} /></div>
      {!mine ? <Spinner /> : mine.length > 0 && (
        <div className="mb-7 space-y-2">
          {mine.map((b) => {
            const [lbl, cls] = BS[b.state] ?? [b.state, "bg-elevated text-muted"];
            return (
              <div key={b.id} className="rounded-lg border border-line bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-extrabold">{b.bonus.name}</span>
                  <span className={`rounded-sm px-2 py-0.5 text-[12px] font-extrabold ${cls}`}>{lbl}</span>
                </div>
                {b.bonus.description && <p className="mt-1 text-[13px] font-medium text-subtle">{b.bonus.description}</p>}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold text-subtle">
                  <span>Tutar <b className="text-fg">{money(b.amount)}</b></span>
                  {b.state === "ACTIVE" && <span>Son gün <b className="text-fg">{dt(b.expiresAt)}</b></span>}
                  {b.state === "COMPLETED" && <span>Ana paraya geçen <b className="text-win">{money(b.convertedAmount)}</b></span>}
                </div>
                {b.state === "ACTIVE" && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs font-bold"><span className="text-subtle">Çevrim: {money(b.wagerDone)} / {money(b.wagerRequired)}</span><span className="text-primary">%{Math.round(b.progress)}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-field"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${b.progress}%` }} /></div>
                    <p className="mt-1.5 text-[11px] font-medium text-dim">Çevrim tamamlanınca bonus bakiyen ana para cüzdanına aktarılır.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {avail.length > 0 && (
        <>
          <h2 className="mb-3 text-base font-extrabold">Alabileceğin Bonuslar</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {avail.map((b) => (
              <div key={b.id} className="flex flex-col rounded-lg border border-line bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><I n="gift" className="size-5" /></span>
                  <div>
                    <div className="text-sm font-extrabold">{b.name}</div>
                    <p className="mt-0.5 line-clamp-3 text-[13px] font-medium text-subtle">{b.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-dim">{b.depositBonus ? `Yatırımda %${Number(b.percent)}` : `Çevrim x${Number(b.wageringMultiplier)}`} · {b.expirationDays} gün</span>
                  {b.depositBonus
                    ? <Link to={`/para-yatir?bonus=${b.id}`} className="btn btn-primary btn-sm">Yatırım yap</Link>
                    : b.requested
                      ? <span className="text-xs font-bold text-caution">Talep beklemede</span>
                      : <Btn kind="soft" className="!h-9 !px-4 !text-xs" onClick={() => request(b.id)}>Bonusu talep et</Btn>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------- Güvenlik ----------
export function Security() {
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  async function save() {
    setErr(""); setMsg("");
    if (next !== again) return setErr("Yeni şifreler eşleşmiyor");
    try { await api("/api/me/password", { method: "POST", json: { current: cur, next } }); setMsg("Şifren güncellendi ✓"); setCur(""); setNext(""); setAgain(""); } catch (x: any) { setErr(x.message); }
  }
  return (
    <>
      <H>Güvenlik</H>
      <div className="max-w-sm space-y-3">
        <Field label="Mevcut şifre"><input className={inp} type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="Yeni şifre (en az 6 karakter)"><input className={inp} type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Yeni şifre (tekrar)"><input className={inp} type="password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
        {msg && <div className="rounded-md border border-win/30 bg-win/10 px-3 py-2.5 text-sm font-bold text-win">{msg}</div>}
        <ErrBox e={err} />
        <Btn disabled={!cur || next.length < 6} onClick={save}>Şifreyi Değiştir</Btn>
      </div>
    </>
  );
}
