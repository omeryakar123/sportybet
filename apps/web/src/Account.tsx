import { useEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { api } from "./api";
import { AVATAR_PRESETS, Avatar, Btn, Empty, ErrBox, Field, I, Spinner, TX_TR, dt, inp, money, useStore } from "./lib";
import { MyPositions } from "./predictions";
import { GTable, PageTitle, StatCard, Status, Tabs } from "./g";

const NAV = [
  ["/hesap", "user", "Hesap", true],
  ["/hesap/tahminlerim", "vote", "Tahminlerim", false],
  ["/hesap/islemler", "list", "İşlemler", false],
  ["/hesap/kuponlarim", "ticket", "Kuponlarım", false],
  ["/hesap/bonuslarim", "gift", "Bonuslarım", false],
  ["/hesap/guvenlik", "shield", "Güvenlik", false],
] as const;

export function AccountLayout() {
  const { me, setAuthOpen } = useStore();
  if (!me) return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center"><p className="mb-4 text-[14px] font-medium text-subtle">Hesabını görmek için giriş yap.</p><Btn onClick={() => setAuthOpen(true)}>Giriş yap</Btn></div>
    </div>
  );
  // gamdom: hesap sayfalarında yan menü yok — gezinme sağ üstteki kullanıcı menüsünden
  return <div className="animate-sports-fade mx-auto max-w-[1000px] min-w-0"><Outlet /></div>;
}

const H = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => <PageTitle right={right}>{children}</PageTitle>;
const Seg = ({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) => <Tabs tabs={tabs} value={value} onChange={onChange} />;
const Note = ({ ok, children }: { ok?: boolean; children: React.ReactNode }) => <div className={`rounded-[10px] px-3 py-2.5 text-[14px] font-bold ${ok ? "bg-primary/10 text-primary" : "bg-loss/10 text-loss"}`}>{children}</div>;

// ---------- Profil (gamdom /profile) ----------
export function Profile() {
  const { me, refreshMe } = useStore();
  const [f, setF] = useState<any>(null); const [st, setSt] = useState<any>(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (me) setF({ firstName: me.firstName ?? "", lastName: me.lastName ?? "", email: me.email ?? "", phone: me.phone ?? "", birthDate: me.birthDate?.slice(0, 10) ?? "", city: me.city ?? "" }); }, [me?.id]);
  useEffect(() => { api("/api/me/stats").then(setSt).catch(() => {}); }, []);
  if (!f) return <Spinner />;
  async function save(keys: string[]) {
    setErr(""); setMsg("");
    try { await api("/api/me", { method: "PATCH", json: Object.fromEntries(keys.map((k) => [k, f[k]]).filter(([, v]) => v !== "")) }); setMsg("Kaydedildi ✓"); refreshMe(); } catch (x: any) { setErr(x.message); }
  }
  const row = (k: string, label: string, ph: string, type = "text") => (
    <div key={k}>
      <label className="mb-2 block text-[12px] font-medium text-subtle">{label}</label>
      <div className="flex gap-5">
        <input className="input flex-1" type={type} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        <button onClick={() => save([k])} disabled={f[k] === ((me as any)[k] ?? "")} className="btn w-[68px] bg-card text-white disabled:text-[#45515c]">Kaydet</button>
      </div>
    </div>
  );
  return (
    <>
      <H>Profil</H>
      <AvatarPicker />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-[12px] font-medium text-subtle">Kullanıcı adın</label>
          <input className="input bg-card" value={me.username} disabled />
        </div>
        {row("email", "E-posta adresi", "E-posta gir", "email")}
        {row("firstName", "Ad", "Adını gir")}
        {row("lastName", "Soyad", "Soyadını gir")}
        {row("phone", "Telefon", "Telefon gir")}
        {row("birthDate", "Doğum tarihi", "", "date")}
        {row("city", "Şehir", "Şehir gir")}
      </div>
      <div className="mt-3 space-y-2">{msg && <Note ok>{msg}</Note>}<ErrBox e={err} /></div>

      <h2 className="h-sec mt-10 mb-4">Doğrulama</h2>
      <div className="grid gap-2 md:grid-cols-3">
        {[["Seviye 1", "E-posta ve telefon", !!(me.email && me.phone)], ["Seviye 2", "Kimlik doğrulama", !!me.isVerified], ["Seviye 3", "Adres doğrulama", false]].map(([t, d, ok]: any, i) => (
          <div key={t} className="flex h-[82px] items-center rounded-[15px] bg-card px-5">
            <div className="flex-1"><p className="text-[18px] font-medium">{t}</p><p className="text-[14px] font-medium text-subtle">{ok ? "Tamamlandı" : i === 0 || (i === 1 && me.email) ? d : "Kilitli"}</p></div>
            <span className={`grid size-8 place-items-center rounded-full ${ok ? "bg-primary text-primary-fg" : "bg-elevated text-subtle"}`}><I n={ok ? "check" : "lock"} className="size-4" /></span>
          </div>
        ))}
      </div>

      <h2 className="h-sec mt-10 mb-4">İstatistikler</h2>
      <div className="grid gap-2 md:grid-cols-2">
        <StatCard value={(st?.bets ?? 0).toLocaleString("tr-TR")} label="Oynanan Bahis" icon={<img src="/img/ic-ball.svg" alt="" className="size-14" />} />
        <StatCard value={money(st?.wagered ?? 0)} label="Toplam Oynanan" icon={<img src="/img/ic-chart.svg" alt="" className="size-14" />} />
        <StatCard value={(st?.wins ?? 0).toLocaleString("tr-TR")} label="Kazanan Kupon" icon={<img src="/img/ic-trophy.svg" alt="" className="size-14" />} />
        <StatCard value={money(st?.biggestWin ?? 0)} label="En Büyük Kazanç" icon={<img src="/img/ic-flame.svg" alt="" className="size-14" />} />
      </div>
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
    <>
      <p className="mb-2 text-[12px] font-medium text-subtle">Avatar</p>
      <div className="rounded-[10px] bg-card p-4">
        <div className="flex items-start gap-2.5">
          <Avatar src={me.avatar} name={me.username} className="size-16 !rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn btn-primary h-9 rounded-lg px-4">Yükle</button>
              <button onClick={() => setOpen(!open)} className="btn h-9 rounded-lg bg-card-2 px-4 text-white">Hazır avatar</button>
              {me.avatar && <button onClick={() => save(null)} disabled={busy} className="btn h-9 rounded-lg bg-transparent px-3 text-subtle hover:text-fg">Kaldır</button>}
            </div>
            <p className="mt-2.5 text-[10px] font-medium leading-4 text-subtle">Desteklenen dosyalar: PNG, JPG, WEBP, GIF. Resim 256×256 kare olarak kırpılır.</p>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {open && (
          <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12">
            {AVATAR_PRESETS.map((_, i) => {
              const k = `av:${i + 1}`;
              return <button key={k} disabled={busy} onClick={() => save(k)} className={`overflow-hidden rounded-lg transition-transform hover:scale-105 ${me.avatar === k ? "ring-2 ring-primary" : ""}`}><Avatar src={k} className="size-12 !rounded-lg" /></button>;
            })}
          </div>
        )}
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-t border-white/[.05] pt-3">
          <span><span className="block text-[14px] font-bold">İstatistiklerimi gizle</span><span className="block text-[12px] font-medium text-subtle">Diğer oyuncular profilinde bahis sayını ve net kârını göremez.</span></span>
          <input type="checkbox" className="size-5 accent-[#00ff86]" checked={!!me.hideStats} disabled={busy} onChange={async (e) => { setBusy(true); try { await api("/api/me", { method: "PATCH", json: { hideStats: e.target.checked } }); await refreshMe(); } catch (x: any) { setErr(x.message); } setBusy(false); }} />
        </label>
        {err && <div className="mt-3"><ErrBox e={err} /></div>}
      </div>
    </>
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
            <div key={p.id} className="rounded-2xl bg-card p-3.5">
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

// ---------- İşlemler (gamdom /transactions) ----------
export function Transactions() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [type, setType] = useState("DEPOSIT");
  useEffect(() => { setRows(null); api(`/api/me/transactions?take=100${type ? `&type=${type}` : ""}`).then(setRows).catch(() => setRows([])); }, [type]);
  const GROUPS: [string, string][] = [["DEPOSIT", "Yatırımlar"], ["WITHDRAWAL,WITHDRAWAL_REFUND", "Çekimler"], ["TIP_SEND,TIP_RECEIVE,RAIN_SEND,RAIN_RECEIVE,RAIN_REFUND", "Bahşiş & Yağmur"], ["BET_STAKE,BET_WIN,BET_REFUND", "Spor"], ["PREDICTION_BUY,PREDICTION_SELL,PREDICTION_WIN,PREDICTION_REFUND", "Tahmin"], ["BONUS_GRANT,BONUS_CONVERT,BONUS_EXPIRE,BONUS_CANCEL", "Bonus"], ["", "Tümü"]];
  const exportCsv = () => {
    if (!rows?.length) return;
    const csv = ["Tür;Tutar;Bakiye;Tarih;Not", ...rows.map((t) => [TX_TR[t.type] ?? t.type, t.amount, t.balanceAfter, new Date(t.createdAt).toLocaleString("tr-TR"), (t.note ?? t.paymentSystem ?? "").replace(/;/g, ",")].join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "islemler.csv"; a.click();
  };
  return (
    <>
      <H>İşlemler</H>
      <Seg tabs={GROUPS} value={type} onChange={setType} />
      <button onClick={exportCsv} className="btn mt-4 bg-card text-white">Dışa aktar</button>
      <div className="mt-3">
        {!rows ? <Spinner /> : (
          <GTable head={["İşlem", "Tutar", "Bakiye", "Tarih", "Durum"]} align={["l", "l", "l", "l", "r"]} empty="İşlem bulunamadı."
            rows={rows.map((t) => [
              <span className="flex items-center gap-2"><span className="truncate">{TX_TR[t.type] ?? t.type}</span>{t.wallet?.type === "BONUS" && <span className="rounded-md bg-caution/15 px-1.5 text-[10px] font-bold text-caution">Bonus</span>}</span>,
              <span className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-[#4fd35a] text-[10px] font-bold text-white">₺</span><span className={Number(t.amount) >= 0 ? "text-primary" : "text-white"}>{Number(t.amount) >= 0 ? "+" : ""}{money(t.amount)}</span></span>,
              money(t.balanceAfter),
              <span className="whitespace-nowrap">{new Date(t.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>,
              <Status tone="ok">Tamamlandı</Status>,
            ])} />
        )}
      </div>
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
              <div key={b.id} className="overflow-hidden rounded-2xl bg-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[.05] px-4 py-2.5 text-sm">
                  <span className={`rounded-sm px-2 py-0.5 text-[12px] font-extrabold ${cls}`}>{lbl}</span>
                  <span className="font-bold">{(b.selections ?? []).length > 1 && new Set((b.selections ?? []).map((s: any) => s.bbGroup ?? s.id)).size === 1 ? "Bet Builder" : b.type === "MULTIPLE" ? "Kombine" : "Tekli"}</span>
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
                      {s.bbGroup ? <span className="shrink-0 rounded bg-primary/15 px-1.5 text-[10px] font-extrabold text-primary">BB {Number(s.bbOdds).toFixed(2)}</span> : <span className="shrink-0 font-extrabold text-odds">{Number(s.odds).toFixed(2)}</span>}
                    </div>
                  ))}
                  {(b.selections ?? []).length === 0 && <div className="py-2 text-xs font-medium text-subtle">Kupon detayı yükleniyor…</div>}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 bg-card-2 px-4 py-2.5 text-[13px] font-semibold text-subtle">
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
      <div className="mb-5 rounded-2xl bg-card p-4">
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
              <div key={b.id} className="rounded-2xl bg-card p-4">
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
              <div key={b.id} className="flex flex-col rounded-2xl bg-card p-4">
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
