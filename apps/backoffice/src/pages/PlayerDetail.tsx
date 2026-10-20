import { Fragment, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, Modal, money, dt, StateBadge } from "../ui";

const TABS = ["Genel", "Finansal", "Spor Bahisleri", "Bonuslar", "Notlar"] as const;

export default function PlayerDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Genel");
  const [p, setP] = useState<any>(null);
  const load = () => api(`/admin/players/${id}`).then(setP);
  useEffect(() => { load(); }, [id]);
  if (!p) return null;
  return (
    <>
      <div className="mb-2 text-sm">Oyuncular › <b>{p.username}</b></div>
      <div className="mb-3 flex gap-1 border-b border-bo-line">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 ${tab === t ? "border-b-2 border-bo-blue text-bo-blue" : ""}`}>{t}</button>)}
      </div>
      {tab === "Genel" && <General p={p} reload={load} />}
      {tab === "Finansal" && <Financial p={p} reload={load} />}
      {tab === "Spor Bahisleri" && <Bets id={p.id} />}
      {tab === "Bonuslar" && <PlayerBonuses id={p.id} reload={load} />}
      {tab === "Notlar" && <Notes p={p} reload={load} />}
    </>
  );
}

function KV({ k, v }: { k: string; v: any }) { return <div><div className="text-bo-muted">{k}</div><div className="mt-1 min-h-5">{v ?? ""}</div></div>; }

function General({ p, reload }: any) {
  const toggle = async (field: string) => { await api(`/admin/players/${p.id}`, { method: "PATCH", json: { [field]: !p[field] } }); reload(); };
  const Chk = ({ f }: { f: string }) => <input type="checkbox" checked={!!p[f]} onChange={() => toggle(f)} />;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel title="Kişisel Bilgiler"><div className="grid grid-cols-3 gap-4">
        <KV k="Ad" v={p.firstName} /><KV k="Soyad" v={p.lastName} /><KV k="Doğum Tarihi" v={dt(p.birthDate)} />
      </div></Panel>
      <Panel title="İletişim"><div className="grid grid-cols-2 gap-4"><KV k="E-posta" v={p.email} /><KV k="Telefon" v={p.phone} /></div></Panel>
      <Panel title="Promosyon Bilgisi"><div className="grid grid-cols-2 gap-4">
        <KV k="Sadakat Seviyesi" v={p.loyaltyLevel} /><KV k="Sadakat Puanı" v={p.loyaltyPoints} /><KV k="Bonuslardan Hariç" v={<Chk f="excludedFromBonuses" />} />
      </div></Panel>
      <div className="lg:col-span-3"><Panel title="Hesap Bilgileri"><div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KV k="Oyuncu ID" v={p.id} /><KV k="Kullanıcı Adı" v={p.username} /><KV k="Hesap Durumu" v={p.status} /><KV k="Doğrulandı" v={<Chk f="isVerified" />} /><KV k="Kayıt Tarihi" v={dt(p.createdAt)} />
        <KV k="Kayıt Kaynağı" v={p.regSource} /><KV k="Spor Engelli" v={<Chk f="isSportBlocked" />} /><KV k="Casino Engelli" v={<Chk f="isCasinoBlocked" />} /><KV k="Kategori" v={p.category} /><KV k="Dil" v={p.language} />
        <KV k="BTag" v={p.btag} /><KV k="Promo Kod" v={p.promoCode} /><KV k="Son Giriş" v={dt(p.lastLoginAt)} /><KV k="Son IP" v={p.lastLoginIp} />
      </div></Panel></div>
    </div>
  );
}

function Financial({ p, reload }: any) {
  const [tx, setTx] = useState<any[]>([]); const [show, setShow] = useState(false);
  const [f, setF] = useState({ wallet: "MAIN", type: "DEPOSIT", amount: "", paymentSystem: "Manual", note: "" });
  const load = () => api(`/admin/players/${p.id}/transactions`).then(setTx);
  useEffect(() => { load(); }, []);
  async function save() { await api(`/admin/players/${p.id}/adjust`, { method: "POST", json: { ...f, amount: Number(f.amount) } }); setShow(false); load(); reload(); }
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
      <Panel title="İşlemler">
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>ID</th><th>Tutar</th><th>Zaman</th><th>Tip</th><th>Cüzdan</th><th>Ödeme Sistemi</th><th>Sonraki Bakiye</th><th>Not</th></tr></thead>
          <tbody>{tx.map((t) => (
            <tr key={t.id}><td>{t.id}</td><td className={Number(t.amount) >= 0 ? "text-bo-green" : "text-bo-red"}>{money(t.amount)}</td><td>{dt(t.createdAt)}</td>
              <td>{t.type}</td><td>{t.wallet?.type}</td><td>{t.paymentSystem}</td><td>{money(t.balanceAfter)}</td><td>{t.note}</td></tr>
          ))}</tbody></table></div>
      </Panel>
      {show && <Modal title="Manuel Bakiye İşlemi" onClose={() => setShow(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cüzdan"><select className="inp" value={f.wallet} onChange={(e) => setF({ ...f, wallet: e.target.value })}><option value="MAIN">Ana Para</option><option value="BONUS">Bonus</option></select></Field>
          <Field label="İşlem"><select className="inp" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>DEPOSIT</option><option>WITHDRAWAL</option><option>ADJUSTMENT</option></select></Field>
          <Field label="Tutar"><input className="inp" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Ödeme Sistemi"><input className="inp" value={f.paymentSystem} onChange={(e) => setF({ ...f, paymentSystem: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Not"><input className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
        </div>
        <div className="mt-4 flex justify-end"><button className="btn-green" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}

export function BetsTable({ bets, showPlayer }: { bets: any[]; showPlayer?: boolean }) {
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>Bahis ID</th><th>Kupon No</th>{showPlayer && <th>Oyuncu</th>}<th>Oluşturma</th><th>Yatırılan</th><th>Ana / Bonus</th><th>Oran</th><th>Durum</th><th>Kazanç</th><th>Tip</th><th>Canlı</th><th>Kaynak</th><th>IP</th></tr></thead>
      <tbody>{bets.map((b) => (<Fragment key={b.id}>
        <tr key={b.id} className="font-medium"><td>{b.id}</td>{showPlayer && <td>{b.player?.username}</td>}<td>{dt(b.createdAt)}</td><td>{money(b.stake)}</td>
          <td>{money(b.stakeFromMain)} / {money(b.stakeFromBonus)}</td><td>{Number(b.totalOdds).toFixed(2)}</td><td><StateBadge s={b.state} /></td>
          <td>{money(b.winAmount)}</td><td>{b.type}</td><td>{b.isLive ? "Evet" : "Hayır"}</td><td>{b.source}</td><td>{b.ip}</td></tr>
        <tr key={b.id + "s"}><td colSpan={13} className="bg-bo-head/50 p-2">
          <table className="tbl"><thead><tr><th>Maç Başlangıç</th><th>Spor</th><th>Bölge</th><th>Lig</th><th>Maç</th><th>Market</th><th>Seçim</th><th>Oran</th><th>Durum</th><th>Canlı</th><th>Bilgi</th></tr></thead>
            <tbody>{b.selections.map((s: any) => (
              <tr key={s.id}><td>{dt(s.matchStart)}</td><td>{s.sport}</td><td>{s.region}</td><td>{s.competition}</td><td>{s.matchName}</td><td>{s.market}</td><td>{s.selection}</td><td>{Number(s.odds).toFixed(2)}</td><td><StateBadge s={s.state} /></td><td>{s.isLive ? "Evet" : "Hayır"}</td><td>{s.info}</td></tr>
            ))}</tbody></table>
        </td></tr>
      </Fragment>))}</tbody>
    </table></div>
  );
}

function Bets({ id }: { id: number }) {
  const [bets, setBets] = useState<any[]>([]);
  useEffect(() => { api(`/admin/players/${id}/bets`).then(setBets); }, [id]);
  return <Panel title="Spor Bahisleri"><BetsTable bets={bets} /></Panel>;
}

function PlayerBonuses({ id, reload }: any) {
  const [list, setList] = useState<any[]>([]); const [defs, setDefs] = useState<any[]>([]); const [show, setShow] = useState(false);
  const [f, setF] = useState({ bonusId: "", amount: "" }); const [err, setErr] = useState("");
  const load = () => api(`/admin/players/${id}/bonuses`).then(setList);
  useEffect(() => { load(); api("/admin/bonuses").then(setDefs); }, [id]);
  async function grant() {
    setErr("");
    try { await api(`/admin/players/${id}/bonuses`, { method: "POST", json: { bonusId: Number(f.bonusId), amount: Number(f.amount) } }); setShow(false); load(); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <Panel title="Oyuncu Bonusları" right={<button className="btn-green" onClick={() => setShow(true)}>Bonus Ver</button>}>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>ID</th><th>Bonus Adı</th><th>Oluşturma</th><th>Tip</th><th>Durum</th><th>Tutar</th><th>Çevrim</th><th>Aktarılan</th><th>Bitiş</th><th>Sonuç Tarihi</th></tr></thead>
          <tbody>{list.map((b) => (
            <tr key={b.id}><td>{b.id}</td><td>{b.bonus.name}</td><td>{dt(b.createdAt)}</td><td>{b.bonus.type}</td><td><StateBadge s={b.state} /></td><td>{money(b.amount)}</td>
              <td>{money(b.wagerDone)} / {money(b.wagerRequired)}</td><td>{money(b.convertedAmount)}</td><td>{dt(b.expiresAt)}</td><td>{dt(b.resultAt)}</td></tr>
          ))}</tbody></table></div>
      </Panel>
      {show && <Modal title="Oyuncuya Bonus Ver" onClose={() => setShow(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bonus"><select className="inp" value={f.bonusId} onChange={(e) => setF({ ...f, bonusId: e.target.value })}><option value="">Seçiniz</option>{defs.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}</select></Field>
          <Field label="Tutar (₺)"><input className="inp" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        </div>
        <p className="mt-3 text-bo-muted">Tutar oyuncunun <b>Bonus Cüzdanı</b>na yatar. Çevrim şartı tamamlanınca bakiye Ana Para cüzdanına aktarılır.</p>
        {err && <div className="mt-2 text-bo-red">{err}</div>}
        <div className="mt-4 flex justify-end"><button className="btn-green" onClick={grant}>Ver</button></div>
      </Modal>}
    </>
  );
}

function Notes({ p, reload }: any) {
  const [text, setText] = useState("");
  async function add() { await api(`/admin/players/${p.id}/notes`, { method: "POST", json: { text } }); setText(""); reload(); }
  return (
    <Panel title="Notlar">
      <div className="mb-3 flex gap-2"><input className="inp" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn-blue" onClick={add}>Ekle</button></div>
      {p.notes.map((n: any) => <div key={n.id} className="border-t border-bo-line py-2"><span className="text-bo-muted">{dt(n.createdAt)}</span> — {n.text}</div>)}
    </Panel>
  );
}
