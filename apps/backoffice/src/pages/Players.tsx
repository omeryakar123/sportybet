import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, money, dt, StateBadge, Err, useForm } from "../ui";

const bal = (p: any, t: string) => Number(p.wallets?.find((w: any) => w.type === t)?.balance ?? 0);

export default function Players({ title = "Oyuncular", reportMode = false }: { title?: string; reportMode?: boolean }) {
  const { f, bind, setF } = useForm({ search: "", id: "", status: "", category: "", verified: "", isTest: "false", btag: "", from: "", to: "", minBalance: "" });
  const [page, setPage] = useState(1); const [size, setSize] = useState(reportMode ? 500 : 20);
  const [data, setData] = useState<any>({ items: [], total: 0 }); const [e, setE] = useState(""); const [create, setCreate] = useState(false);
  const load = (p = page) => {
    setE("");
    const q = new URLSearchParams(Object.fromEntries(Object.entries({ ...f, page: String(p), size: String(size), from: f.from ? new Date(f.from).toISOString() : "", to: f.to ? new Date(f.to).toISOString() : "" }).filter(([, v]) => v !== "")));
    api(`/admin/players?${q}`).then(setData).catch((x) => setE(x.message));
  };
  useEffect(() => { load(1); setPage(1); }, [size]);
  const pages = Math.max(1, Math.ceil(data.total / size));
  return (
    <>
      <Panel title="Filtre">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Field label="Arama (kullanıcı, ad, e-posta, tel)"><input className="inp" {...bind("search")} onKeyDown={(e) => e.key === "Enter" && load(1)} /></Field>
          <Field label="Oyuncu ID"><input className="inp" {...bind("id")} /></Field>
          <Field label="Durum"><select className="inp" {...bind("status")}><option value="">Tümü</option><option value="OPEN">Açık</option><option value="BLOCKED">Bloke</option><option value="CLOSED">Kapalı</option><option value="SELF_EXCLUDED">Kendini dışladı</option></select></Field>
          <Field label="Kategori"><select className="inp" {...bind("category")}><option value="">Tümü</option>{["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK", "VIP", "FRAUD", "BONUS_HUNTER"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Doğrulandı"><select className="inp" {...bind("verified")}><option value="">Tümü</option><option value="true">Evet</option><option value="false">Hayır</option></select></Field>
          <Field label="Test Oyuncu"><select className="inp" {...bind("isTest")}><option value="">Hepsi</option><option value="false">Hayır</option><option value="true">Evet</option></select></Field>
          <Field label="BTag"><input className="inp" {...bind("btag")} /></Field>
          <Field label="Kayıt (başlangıç)"><input type="datetime-local" className="inp" {...bind("from")} /></Field>
          <Field label="Kayıt (bitiş)"><input type="datetime-local" className="inp" {...bind("to")} /></Field>
          <Field label="Min. Bakiye"><input type="number" className="inp" {...bind("minBalance")} /></Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-blue w-28" onClick={() => { setPage(1); load(1); }}>Uygula</button>
          <button className="btn-ghost w-28" onClick={() => setF({ search: "", id: "", status: "", category: "", verified: "", isTest: "false", btag: "", from: "", to: "", minBalance: "" })}>Sıfırla</button>
        </div>
      </Panel>
      <Panel title={`${title} (${data.total})`} right={!reportMode && <button className="btn-green" onClick={() => setCreate(true)}>Oyuncu Ekle</button>}>
        <Err e={e} />
        <DataTable rows={data.items} pageSize={size} csvName="oyuncular" search={false} cols={[
          { key: "username", label: "Kullanıcı", render: (p) => <Link className="text-bo-blue" to={`/players/${p.id}`}>{p.username}</Link> },
          { key: "id", label: "ID", render: (p) => <Link className="text-bo-blue" to={`/players/${p.id}`}>{p.id}</Link> },
          { key: "firstName", label: "Ad" }, { key: "lastName", label: "Soyad" }, { key: "email", label: "E-posta" }, { key: "phone", label: "Telefon" },
          { key: "btag", label: "BTag" },
          { key: "status", label: "Durum", render: (p) => <StateBadge s={p.status} /> },
          { key: "category", label: "Kategori" },
          { key: "main", label: "Ana Para", money: true, value: (p) => bal(p, "MAIN"), sum: true },
          { key: "bonus", label: "Bonus", money: true, value: (p) => bal(p, "BONUS"), sum: true },
          { key: "activeWallet", label: "Oynadığı", value: (p) => (p.activeWallet === "BONUS" ? "Bonus" : "Ana") },
          { key: "isVerified", label: "Doğrulandı", value: (p) => (p.isVerified ? "Evet" : "Hayır") },
          { key: "createdAt", label: "Kayıt", render: (p) => dt(p.createdAt) },
          { key: "lastLoginAt", label: "Son Giriş", render: (p) => dt(p.lastLoginAt) },
          { key: "regSource", label: "Kaynak" },
        ]} />
        {pages > 1 && (
          <div className="mt-2 flex items-center justify-end gap-1">
            <select className="inp w-20" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[20, 50, 100, 500].map((n) => <option key={n}>{n}</option>)}</select>
            <button className="btn-ghost px-2" disabled={page === 1} onClick={() => { setPage(page - 1); load(page - 1); }}>‹</button>
            <span className="px-2">{page} / {pages}</span>
            <button className="btn-ghost px-2" disabled={page === pages} onClick={() => { setPage(page + 1); load(page + 1); }}>›</button>
          </div>
        )}
      </Panel>
      {create && <CreatePlayer onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(1); }} />}
    </>
  );
}

function CreatePlayer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { f, bind, check } = useForm({ username: "", password: "", email: "", phone: "", firstName: "", lastName: "", isTest: false });
  const [e, setE] = useState("");
  async function save() {
    try { await api("/admin/players", { method: "POST", json: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "")) }); onDone(); } catch (x: any) { setE(x.message); }
  }
  return (
    <Modal title="Yeni Oyuncu" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kullanıcı adı *"><input className="inp" {...bind("username")} /></Field>
        <Field label="Şifre *"><input className="inp" {...bind("password")} /></Field>
        <Field label="Ad"><input className="inp" {...bind("firstName")} /></Field>
        <Field label="Soyad"><input className="inp" {...bind("lastName")} /></Field>
        <Field label="E-posta"><input className="inp" {...bind("email")} /></Field>
        <Field label="Telefon"><input className="inp" {...bind("phone")} /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" {...check("isTest")} />Test oyuncusu (raporlara girmez)</label>
      </div>
      <Err e={e} />
      <div className="mt-4 flex justify-end"><button className="btn-green" onClick={save}>Oluştur</button></div>
    </Modal>
  );
}
