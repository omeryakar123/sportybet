import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, Kpi, Tabs, money, dt, pct, num, StateBadge, Err, TX_TR, useForm } from "../ui";

const MAIN_TABS = ["Genel", "Finansal", "Raporlar", "Ayarlar"] as const;

export default function PlayerDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState<(typeof MAIN_TABS)[number]>("Genel");
  const [p, setP] = useState<any>(null); const [e, setE] = useState("");
  const load = () => api(`/admin/players/${id}`).then(setP).catch((x) => setE(x.message));
  useEffect(() => { load(); }, [id]);
  if (!p) return <Err e={e} />;
  const w = (t: string) => p.wallets.find((x: any) => x.type === t)?.balance ?? 0;
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div><Link to="/players" className="text-bo-blue">Oyuncular</Link> › <b>{p.username}</b> <span className="text-bo-muted">#{p.id}</span> {p.isTest && <span className="ml-2 rounded bg-amber-100 px-2 text-xs text-amber-700">TEST</span>}</div>
        <div className="flex gap-4"><span>Ana Para: <b>{money(w("MAIN"))}</b></span><span>Bonus: <b className="text-bo-purple">{money(w("BONUS"))}</b></span><StateBadge s={p.status} /></div>
      </div>
      <Tabs tabs={MAIN_TABS} value={tab} onChange={setTab} />
      {tab === "Genel" && <General p={p} reload={load} />}
      {tab === "Finansal" && <Financial p={p} reload={load} />}
      {tab === "Raporlar" && <Reports p={p} reload={load} />}
      {tab === "Ayarlar" && <Settings p={p} reload={load} />}
    </>
  );
}

function KV({ k, v }: { k: string; v: any }) { return <div><div className="text-bo-muted">{k}</div><div className="mt-1 min-h-5">{v === null || v === undefined || v === "" ? "—" : v}</div></div>; }
const yes = (b: boolean) => (b ? "✓" : "—");

function General({ p, reload }: any) {
  const [edit, setEdit] = useState(false); const [k, setK] = useState<any>(null);
  useEffect(() => { api(`/admin/players/${p.id}/kpis`).then(setK).catch(() => {}); }, [p.id]);
  return (
    <>
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Kişisel Bilgiler" right={<button className="text-bo-blue" onClick={() => setEdit(true)}>✎ Düzenle</button>}>
          <div className="grid grid-cols-3 gap-4">
            <KV k="Ad" v={p.firstName} /><KV k="Soyad" v={p.lastName} /><KV k="Doğum Tarihi" v={p.birthDate ? new Date(p.birthDate).toLocaleDateString("tr-TR") : ""} />
            <KV k="Cinsiyet" v={p.gender} /><KV k="Şehir" v={p.city} /><KV k="Adres" v={p.address} />
          </div>
        </Panel>
        <Panel title="İletişim">
          <div className="grid grid-cols-2 gap-4"><KV k="E-posta" v={p.email} /><KV k="Telefon" v={p.phone} /><KV k="Dil" v={p.language} /><KV k="Para Birimi" v={p.currency} /></div>
        </Panel>
        <Panel title="Promosyon Bilgisi">
          <div className="grid grid-cols-2 gap-4"><KV k="Sadakat Seviyesi" v={p.loyaltyLevel} /><KV k="Sadakat Puanı" v={num(p.loyaltyPoints, 2)} /><KV k="Bonuslardan Hariç" v={yes(p.excludedFromBonuses)} /><KV k="Promo Kod" v={p.promoCode} /></div>
        </Panel>
      </div>
      <Panel title="Hesap Bilgileri">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          <KV k="Oyuncu ID" v={p.id} /><KV k="Kullanıcı Adı" v={p.username} /><KV k="Hesap Durumu" v={<StateBadge s={p.status} />} /><KV k="Doğrulandı" v={yes(p.isVerified)} />
          <KV k="Kayıt Tarihi" v={dt(p.createdAt)} /><KV k="Kayıt Kaynağı" v={p.regSource} />
          <KV k="Spor Engelli" v={yes(p.isSportBlocked)} /><KV k="Casino Engelli" v={yes(p.isCasinoBlocked)} /><KV k="Kategori" v={p.category} /><KV k="BTag" v={p.btag} />
          <KV k="Affiliate ID" v={p.affiliateId} /><KV k="Test" v={yes(p.isTest)} />
          <KV k="Son Giriş" v={dt(p.lastLoginAt)} /><KV k="Son IP" v={p.lastLoginIp} /><KV k="Hatalı Giriş" v={p.wrongLoginAttempts} />
        </div>
      </Panel>
      <Panel title="Oyuncu KPI'ları">
        {!k ? <div className="text-bo-muted">Yükleniyor…</div> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <Kpi label="Spor Son Bahis" value={dt(k.sportLastBet) || "—"} icon="📅" color="bo-purple" />
            <Kpi label="Spor Toplam Bahis" value={num(k.sportTotalBets)} icon="🎫" color="bo-blue" />
            <Kpi label="Spor Toplam Yatırılan" value={money(k.sportTotalStakes)} icon="💵" color="bo-blue" />
            <Kpi label="Spor Toplam Kazanç" value={money(k.sportTotalWinnings)} icon="🏆" color="bo-red" />
            <Kpi label="Açık Kupon Tutarı" value={money(k.sportUnsettledStakes)} icon="⏳" color="bo-orange" />
            <Kpi label="Açık Kupon Sayısı" value={num(k.sportUnsettledBets)} icon="?" color="bo-orange" />
            <Kpi label="Bonuslu Yatırılan" value={money(k.sportBonusStakes)} icon="🎁" color="bo-purple" />
            <Kpi label="Bonuslu Kazanç" value={money(k.sportBonusWinnings)} icon="🎁" color="lime" />
            <Kpi label="Spor K/Z (bize göre)" value={money(k.sportPL)} icon="📈" color="bo-green" />
            <Kpi label="Spor Kârlılık" value={pct(k.sportProfitability)} icon="🚀" color="teal" />
            <Kpi label="Yatırımlar" value={money(k.deposits)} icon="⬇" color="teal" />
            <Kpi label="Son Yatırım Tutarı" value={money(k.lastDepositAmount)} icon="⬇" color="teal" />
            <Kpi label="Yatırım Sayısı" value={num(k.depositCount)} icon="⬇" color="teal" />
            <Kpi label="İlk Yatırım" value={dt(k.firstDepositDate) || "—"} icon="📅" color="bo-purple" />
            <Kpi label="Son Yatırım" value={dt(k.lastDepositDate) || "—"} icon="📅" color="bo-purple" />
            <Kpi label="Çekimler" value={money(k.withdrawals)} icon="⬆" color="bo-red" />
            <Kpi label="Son Çekim Tutarı" value={money(k.lastWithdrawalAmount)} icon="⬆" color="bo-red" />
            <Kpi label="Çekim Sayısı" value={num(k.withdrawalCount)} icon="⬆" color="bo-red" />
            <Kpi label="Son Çekim" value={dt(k.lastWithdrawalDate) || "—"} icon="📅" color="bo-red" />
            <Kpi label="Net Gelir (Yatırım − Çekim)" value={money(k.netRevenue)} icon="💰" color="lime" />
          </div>
        )}
      </Panel>
      <Notes p={p} reload={reload} />
      {edit && <EditPlayer p={p} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
    </>
  );
}

function EditPlayer({ p, onClose, onDone }: any) {
  const { bind, f } = useForm({ firstName: p.firstName ?? "", lastName: p.lastName ?? "", email: p.email ?? "", phone: p.phone ?? "", birthDate: p.birthDate?.slice(0, 10) ?? "", gender: p.gender ?? "", city: p.city ?? "", address: p.address ?? "", btag: p.btag ?? "", loyaltyLevel: p.loyaltyLevel ?? "", language: p.language ?? "tr" });
  const [e, setE] = useState("");
  async function save() { try { await api(`/admin/players/${p.id}`, { method: "PATCH", json: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v])) }); onDone(); } catch (x: any) { setE(x.message); } }
  return (
    <Modal title="Oyuncu Bilgilerini Düzenle" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {[["firstName", "Ad"], ["lastName", "Soyad"], ["email", "E-posta"], ["phone", "Telefon"], ["city", "Şehir"], ["address", "Adres"], ["btag", "BTag"], ["loyaltyLevel", "Sadakat Seviyesi"]].map(([k, l]) => <Field key={k} label={l}><input className="inp" {...bind(k as any)} /></Field>)}
        <Field label="Doğum Tarihi"><input type="date" className="inp" {...bind("birthDate")} /></Field>
        <Field label="Cinsiyet"><select className="inp" {...bind("gender")}><option value="">Seçilmedi</option><option value="M">Erkek</option><option value="F">Kadın</option></select></Field>
        <Field label="Dil"><select className="inp" {...bind("language")}><option value="tr">Türkçe</option><option value="en">English</option></select></Field>
      </div>
      <Err e={e} />
      <div className="mt-4 flex justify-end"><button className="btn-green" onClick={save}>Kaydet</button></div>
    </Modal>
  );
}

function Financial({ p, reload }: any) {
  const [tx, setTx] = useState<any[]>([]); const [pays, setPays] = useState<any[]>([]); const [show, setShow] = useState(false);
  const [type, setType] = useState(""); const [wallet, setWallet] = useState("");
  const load = () => {
    api(`/admin/players/${p.id}/transactions?${new URLSearchParams(Object.fromEntries(Object.entries({ type, wallet }).filter(([, v]) => v)))}`).then(setTx);
    api(`/admin/players/${p.id}/payments`).then(setPays);
  };
  useEffect(() => { load(); }, []);
  return (
    <>
      <Panel title="Oyuncu Bakiyeleri (2 Cüzdan)" right={<button className="btn-green" onClick={() => setShow(true)}>Manuel İşlem</button>}>
        <table className="tbl"><thead><tr><th>Cüzdan</th><th>Açıklama</th><th>Para Birimi</th><th className="text-right">Bakiye</th></tr></thead>
          <tbody>{p.wallets.map((w: any) => (
            <tr key={w.id}><td>{w.type === "MAIN" ? "Ana Para Cüzdanı" : "Bonus Cüzdanı"}</td>
              <td className="text-bo-muted">{w.type === "MAIN" ? "Yatırımlar ve çekilebilir bakiye" : "Çevrim tamamlanınca ana paraya aktarılır"}</td>
              <td>{w.currency}</td><td className="text-right font-medium">{money(w.balance)}</td></tr>
          ))}</tbody></table>
      </Panel>
      <Panel title="Yatırım / Çekim Talepleri">
        <DataTable rows={pays} csvName={`odemeler_${p.id}`} cols={[
          { key: "id", label: "ID" }, { key: "type", label: "Tip", value: (r) => (r.type === "DEPOSIT" ? "Yatırım" : "Çekim") },
          { key: "amount", label: "Tutar", money: true }, { key: "state", label: "Durum", render: (r) => <StateBadge s={r.state} /> },
          { key: "paymentSystem", label: "Ödeme Sistemi" }, { key: "createdAt", label: "Talep", render: (r) => dt(r.createdAt) }, { key: "processedAt", label: "İşlem", render: (r) => dt(r.processedAt) },
          { key: "notes", label: "Not" }, { key: "rejectReason", label: "Red Sebebi" },
        ]} />
      </Panel>
      <Panel title="İşlemler" right={<div className="flex gap-2">
        <select className="inp w-44" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tüm tipler</option>{Object.entries(TX_TR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="inp w-36" value={wallet} onChange={(e) => setWallet(e.target.value)}><option value="">Tüm cüzdanlar</option><option value="MAIN">Ana Para</option><option value="BONUS">Bonus</option></select>
        <button className="btn-blue" onClick={load}>Uygula</button></div>}>
        <DataTable rows={tx} csvName={`islemler_${p.id}`} cols={[
          { key: "id", label: "ID" }, { key: "amount", label: "Tutar", render: (t) => <span className={Number(t.amount) >= 0 ? "text-bo-green" : "text-bo-red"}>{money(t.amount)} {Number(t.amount) >= 0 ? "▲" : "▼"}</span>, value: (t) => Number(t.amount), align: "right" },
          { key: "createdAt", label: "Zaman", render: (t) => dt(t.createdAt) }, { key: "type", label: "Tip", value: (t) => TX_TR[t.type] ?? t.type },
          { key: "wallet", label: "Cüzdan", value: (t) => (t.wallet?.type === "BONUS" ? "Bonus" : "Ana") }, { key: "paymentSystem", label: "Ödeme Sistemi" },
          { key: "balanceAfter", label: "Sonraki Bakiye", money: true }, { key: "reference", label: "Referans" }, { key: "note", label: "Not" },
        ]} />
      </Panel>
      {show && <Adjust p={p} onClose={() => setShow(false)} onDone={() => { setShow(false); load(); reload(); }} />}
    </>
  );
}

function Adjust({ p, onClose, onDone }: any) {
  const { f, bind } = useForm({ wallet: "MAIN", type: "DEPOSIT", amount: "", paymentSystem: "Manual", note: "" });
  const [e, setE] = useState("");
  async function save() { try { await api(`/admin/players/${p.id}/adjust`, { method: "POST", json: { ...f, amount: Number(f.amount) } }); onDone(); } catch (x: any) { setE(x.message === "INSUFFICIENT_FUNDS" ? "Yetersiz bakiye" : x.message); } }
  return (
    <Modal title="Manuel Bakiye İşlemi" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cüzdan"><select className="inp" {...bind("wallet")}><option value="MAIN">Ana Para</option><option value="BONUS">Bonus</option></select></Field>
        <Field label="İşlem"><select className="inp" {...bind("type")}><option value="DEPOSIT">Yatırım (rapora girer)</option><option value="WITHDRAWAL">Çekim (rapora girer)</option><option value="CORRECTION_UP">Düzeltme (+)</option><option value="CORRECTION_DOWN">Düzeltme (−)</option></select></Field>
        <Field label="Tutar"><input className="inp" type="number" min="0" step="0.01" {...bind("amount")} /></Field>
        <Field label="Ödeme Sistemi"><input className="inp" {...bind("paymentSystem")} /></Field>
        <Field label="Not" className="col-span-2"><input className="inp" {...bind("note")} /></Field>
      </div>
      <Err e={e} />
      <div className="mt-4 flex justify-end"><button className="btn-green" onClick={save} disabled={!f.amount}>Kaydet</button></div>
    </Modal>
  );
}

const REPORT_TABS = ["Spor Bahisleri", "Bonuslar", "Girişler"] as const;
function Reports({ p, reload }: any) {
  const [t, setT] = useState<(typeof REPORT_TABS)[number]>("Spor Bahisleri");
  return (
    <div className="flex gap-3">
      <div className="w-48 shrink-0 panel h-fit">
        {REPORT_TABS.map((x) => <button key={x} onClick={() => setT(x)} className={`block w-full px-4 py-3 text-left ${t === x ? "bg-bo-head text-bo-blue" : ""}`}>{x}</button>)}
      </div>
      <div className="min-w-0 flex-1">
        {t === "Spor Bahisleri" && <PlayerBets id={p.id} />}
        {t === "Bonuslar" && <PlayerBonuses id={p.id} reload={reload} />}
        {t === "Girişler" && <Logins id={p.id} />}
      </div>
    </div>
  );
}

export function Selections({ b }: { b: any }) {
  return (
    <table className="tbl"><thead><tr><th>Maç Başlangıç</th><th>Spor</th><th>Bölge</th><th>Lig</th><th>Maç</th><th>Market</th><th>Seçim</th><th>Oran</th><th>Durum</th><th>Canlı</th><th>Bilgi</th></tr></thead>
      <tbody>{(b.selections ?? []).length === 0 ? <tr><td colSpan={11} className="text-bo-muted">Seçim detayı henüz gelmedi (bet_placed webhook'u bekleniyor)</td></tr> : b.selections.map((s: any) => (
        <tr key={s.id}><td>{dt(s.matchStart)}</td><td>{s.sport}</td><td>{s.region}</td><td>{s.competition}</td><td>{s.matchName}</td><td>{s.market}</td><td>{s.selection}</td><td>{Number(s.odds).toFixed(2)}</td><td><StateBadge s={s.state} /></td><td>{s.isLive ? "Evet" : "Hayır"}</td><td>{s.info}</td></tr>
      ))}</tbody></table>
  );
}

export const betCols = (showPlayer: boolean) => [
  { key: "id", label: "Bahis ID" }, { key: "couponId", label: "Kupon No" },
  ...(showPlayer ? [{ key: "player", label: "Oyuncu", value: (b: any) => b.player?.username, render: (b: any) => <Link className="text-bo-blue" to={`/players/${b.playerId}`}>{b.player?.username}</Link> }] : []),
  { key: "createdAt", label: "Oluşturma", render: (b: any) => dt(b.createdAt) },
  { key: "stake", label: "Yatırılan", money: true, sum: true },
  { key: "stakeFromBonus", label: "Bonus Tutarı", money: true, sum: true },
  { key: "totalOdds", label: "Oran", value: (b: any) => Number(b.totalOdds).toFixed(2), align: "right" as const },
  { key: "state", label: "Durum", render: (b: any) => <StateBadge s={b.state} /> },
  { key: "winAmount", label: "Kazanç", money: true, sum: true },
  { key: "type", label: "Tip", value: (b: any) => (b.type === "SINGLE" ? "Tekli" : b.type === "MULTIPLE" ? "Kombine" : b.type) },
  { key: "isLive", label: "Canlı", value: (b: any) => (b.isLive ? "Evet" : "Hayır") },
  { key: "settledAt", label: "Sonuçlanma", render: (b: any) => dt(b.settledAt) },
];

function PlayerBets({ id }: { id: number }) {
  const [bets, setBets] = useState<any[]>([]);
  useEffect(() => { api(`/admin/players/${id}/bets`).then(setBets); }, [id]);
  return <Panel title="Spor Bahisleri"><DataTable rows={bets} cols={betCols(false)} csvName={`kuponlar_${id}`} expand={(b) => <Selections b={b} />} /></Panel>;
}

function PlayerBonuses({ id, reload }: any) {
  const [list, setList] = useState<any[]>([]); const [defs, setDefs] = useState<any[]>([]); const [show, setShow] = useState(false);
  const { f, bind } = useForm({ bonusId: "", amount: "" }); const [err, setErr] = useState("");
  const load = () => api(`/admin/players/${id}/bonuses`).then(setList);
  useEffect(() => { load(); api("/admin/bonuses").then(setDefs).catch(() => {}); }, [id]);
  async function grant() {
    setErr("");
    try { await api(`/admin/players/${id}/bonuses`, { method: "POST", json: { bonusId: Number(f.bonusId), amount: Number(f.amount) } }); setShow(false); load(); reload(); }
    catch (e: any) { setErr(e.message === "ACTIVE_BONUS_EXISTS" ? "Oyuncunun zaten aktif bir bonusu var. Önce onu iptal edin veya tamamlanmasını bekleyin." : e.message); }
  }
  async function cancel(pbId: number) { if (!confirm("Bonus iptal edilsin mi? Bonus cüzdanı sıfırlanır.")) return; await api(`/admin/player-bonuses/${pbId}/cancel`, { method: "POST", json: {} }); load(); reload(); }
  const sel = defs.find((d) => String(d.id) === f.bonusId);
  return (
    <>
      <Panel title="Oyuncu Bonusları" right={<button className="btn-green" onClick={() => setShow(true)}>Bonus Ver</button>}>
        <DataTable rows={list} csvName={`bonuslar_${id}`} cols={[
          { key: "id", label: "ID" }, { key: "bonus", label: "Bonus Adı", value: (b) => b.bonus.name }, { key: "createdAt", label: "Oluşturma", render: (b) => dt(b.createdAt) },
          { key: "type", label: "Tip", value: (b) => b.bonus.type }, { key: "state", label: "Durum", render: (b) => <StateBadge s={b.state} /> },
          { key: "amount", label: "Tutar", money: true }, { key: "wager", label: "Çevrim", value: (b) => Number(b.wagerDone), render: (b) => <span>{money(b.wagerDone)} / {money(b.wagerRequired)} <span className="text-bo-muted">({Number(b.wagerRequired) ? Math.min(100, (Number(b.wagerDone) / Number(b.wagerRequired)) * 100).toFixed(0) : 100}%)</span></span> },
          { key: "convertedAmount", label: "Aktarılan", money: true }, { key: "expiresAt", label: "Bitiş", render: (b) => dt(b.expiresAt) }, { key: "resultAt", label: "Sonuç Tarihi", render: (b) => dt(b.resultAt) },
          { key: "x", label: "", sortable: false, render: (b) => b.state === "ACTIVE" ? <button className="text-bo-red" onClick={() => cancel(b.id)}>İptal</button> : null },
        ]} />
      </Panel>
      {show && <Modal title="Oyuncuya Bonus Ver" onClose={() => setShow(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bonus"><select className="inp" {...bind("bonusId")}><option value="">Seçiniz</option>{defs.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}</select></Field>
          <Field label="Tutar (₺)"><input className="inp" type="number" {...bind("amount")} /></Field>
        </div>
        {sel && <p className="mt-2 text-bo-muted">Çevrim: x{Number(sel.wageringMultiplier)} · Geçerlilik: {sel.expirationDays} gün · Min/Max: {money(sel.minAmount)} / {money(sel.maxAmount)}</p>}
        <p className="mt-3 text-bo-muted">Tutar oyuncunun <b>Bonus Cüzdanı</b>na yatar. Çevrim tamamlanınca bakiye Ana Para cüzdanına aktarılır. Oyuncunun aynı anda tek aktif bonusu olabilir.</p>
        <Err e={err} />
        <div className="mt-4 flex justify-end"><button className="btn-green" onClick={grant} disabled={!f.bonusId || !f.amount}>Ver</button></div>
      </Modal>}
    </>
  );
}

function Logins({ id }: { id: number }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api(`/admin/players/${id}/logins`).then(setRows); }, [id]);
  return <Panel title="Girişler"><DataTable rows={rows} csvName={`girisler_${id}`} cols={[{ key: "createdAt", label: "Zaman", render: (r) => dt(r.createdAt) }, { key: "ip", label: "IP" }, { key: "userAgent", label: "Tarayıcı" }]} /></Panel>;
}

function Settings({ p, reload }: any) {
  const [msg, setMsg] = useState(""); const [pw, setPw] = useState("");
  const patch = async (data: any) => { await api(`/admin/players/${p.id}`, { method: "PATCH", json: data }); setMsg("Kaydedildi ✓"); setTimeout(() => setMsg(""), 1500); reload(); };
  const Toggle = ({ k, label }: { k: string; label: string }) => (
    <label className="flex items-center justify-between border-t border-bo-line py-2"><span>{label}</span><input type="checkbox" checked={!!p[k]} onChange={() => patch({ [k]: !p[k] })} /></label>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Hesap Durumu" right={<span className="text-bo-green">{msg}</span>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durum"><select className="inp" value={p.status} onChange={(e) => patch({ status: e.target.value })}><option value="OPEN">Açık</option><option value="BLOCKED">Bloke</option><option value="CLOSED">Kapalı</option><option value="SELF_EXCLUDED">Kendini dışladı</option></select></Field>
          <Field label="Kategori"><select className="inp" value={p.category} onChange={(e) => patch({ category: e.target.value })}>{["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK", "VIP", "FRAUD", "BONUS_HUNTER"].map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <div className="mt-3">
          <Toggle k="isVerified" label="Doğrulanmış oyuncu (KYC)" />
          <Toggle k="isSportBlocked" label="Spor bahsi engelli" />
          <Toggle k="isCasinoBlocked" label="Casino engelli" />
          <Toggle k="excludedFromBonuses" label="Bonuslardan hariç" />
          <Toggle k="isTest" label="Test oyuncusu (raporlara girmez)" />
        </div>
      </Panel>
      <Panel title="Şifre Sıfırla">
        <div className="flex gap-2"><input className="inp" placeholder="Yeni şifre (min 6)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn-blue" disabled={pw.length < 6} onClick={async () => { await api(`/admin/players/${p.id}/password`, { method: "POST", json: { password: pw } }); setPw(""); setMsg("Şifre değişti ✓"); }}>Değiştir</button></div>
        <p className="mt-2 text-bo-muted">Hatalı giriş sayacı da sıfırlanır.</p>
      </Panel>
    </div>
  );
}

function Notes({ p, reload }: any) {
  const [text, setText] = useState("");
  async function add() { await api(`/admin/players/${p.id}/notes`, { method: "POST", json: { text } }); setText(""); reload(); }
  return (
    <Panel title="Notlar">
      <div className="mb-3 flex gap-2"><input className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="Not ekle…" /><button className="btn-blue" onClick={add} disabled={!text}>Ekle</button></div>
      {p.notes.length === 0 && <div className="text-bo-muted">Not yok</div>}
      {p.notes.map((n: any) => <Fragment key={n.id}><div className="border-t border-bo-line py-2"><span className="text-bo-muted">{dt(n.createdAt)} · admin#{n.adminId}</span> — {n.text}</div></Fragment>)}
    </Panel>
  );
}
