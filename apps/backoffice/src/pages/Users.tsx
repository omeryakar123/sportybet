import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, dt, Err } from "../ui";

const ROLES: [string, string][] = [
  ["SUPERADMIN", "Süper Admin — her şey"], ["ADMIN", "Admin — kullanıcı yönetimi hariç her şey"], ["FINANCE", "Finans — ödemeler, raporlar, manuel bakiye"],
  ["RISK", "Risk — oyuncu kısıtlama, bonus, bahis takibi"], ["SUPPORT", "Destek — oyuncuları görüntüleme, not"], ["CMS", "CMS — içerik ve promo kod"],
];

export function Users() {
  const [rows, setRows] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [e, setE] = useState("");
  const load = () => api("/admin/users").then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, []);
  async function save() {
    setE("");
    try {
      const { id, username, fullName, role, isActive, password } = edit;
      if (id) await api(`/admin/users/${id}`, { method: "PATCH", json: { fullName, role, isActive, ...(password ? { password } : {}) } });
      else await api("/admin/users", { method: "POST", json: { username, fullName, role, password } });
      setEdit(null); load();
    } catch (x: any) { setE(x.message); }
  }
  return (
    <>
      <Panel title="Admin Kullanıcıları" right={<button className="btn-green" onClick={() => setEdit({ username: "", fullName: "", role: "SUPPORT", isActive: true, password: "" })}>Kullanıcı Ekle</button>}>
        <Err e={e} />
        <DataTable rows={rows} search={false} cols={[
          { key: "id", label: "ID" }, { key: "username", label: "Kullanıcı" }, { key: "fullName", label: "Ad Soyad" }, { key: "role", label: "Rol" },
          { key: "isActive", label: "Aktif", value: (r) => (r.isActive ? "Evet" : "Hayır") }, { key: "lastLoginAt", label: "Son Giriş", render: (r) => dt(r.lastLoginAt) }, { key: "createdAt", label: "Oluşturma", render: (r) => dt(r.createdAt) },
          { key: "x", label: "", sortable: false, render: (r) => <button className="text-bo-blue" onClick={() => setEdit({ ...r, password: "" })}>Düzenle</button> },
        ]} />
        <div className="mt-3 text-bo-muted">{ROLES.map(([k, v]) => <div key={k}><b>{k}</b>: {v.split("— ")[1]}</div>)}</div>
      </Panel>
      {edit && <Modal title={edit.id ? "Kullanıcıyı Düzenle" : "Yeni Admin Kullanıcısı"} onClose={() => setEdit(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kullanıcı adı"><input className="inp" value={edit.username} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
          <Field label="Ad Soyad"><input className="inp" value={edit.fullName ?? ""} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></Field>
          <Field label="Rol"><select className="inp" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label={edit.id ? "Yeni şifre (boş = değişmez)" : "Şifre (min 8)"}><input className="inp" type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
          {edit.id && <label className="flex items-center gap-2"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Aktif</label>}
        </div>
        <Err e={e} />
        <div className="mt-4 flex justify-end"><button className="btn-green" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}

export function AuditLogs() {
  const [rows, setRows] = useState<any[]>([]); const [target, setTarget] = useState(""); const [e, setE] = useState("");
  const load = () => api(`/admin/audit-logs${target ? `?target=${encodeURIComponent(target)}` : ""}`).then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, []);
  return (
    <Panel title="İşlem Geçmişi (Audit Log)" right={<div className="flex gap-2"><input className="inp w-56" placeholder="Hedef (ör. player:12)" value={target} onChange={(e) => setTarget(e.target.value)} /><button className="btn-blue" onClick={load}>Ara</button></div>}>
      <Err e={e} />
      <DataTable rows={rows} csvName="audit_log" cols={[
        { key: "createdAt", label: "Zaman", render: (r) => dt(r.createdAt) }, { key: "admin", label: "Admin", value: (r) => r.admin?.username },
        { key: "action", label: "Aksiyon" }, { key: "target", label: "Hedef" }, { key: "payload", label: "Detay", value: (r) => JSON.stringify(r.payload), className: "max-w-md truncate font-mono text-xs" },
      ]} />
    </Panel>
  );
}

export function Profile() {
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [msg, setMsg] = useState(""); const [e, setE] = useState("");
  async function go() { setE(""); try { await api("/admin/me/password", { method: "POST", json: { current: cur, next } }); setMsg("Şifre değiştirildi ✓"); setCur(""); setNext(""); } catch (x: any) { setE(x.message === "WRONG_PASSWORD" ? "Mevcut şifre yanlış" : x.message); } }
  return (
    <Panel title="Şifremi Değiştir">
      <div className="grid max-w-md gap-3">
        <Field label="Mevcut şifre"><input type="password" className="inp" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="Yeni şifre (min 8)"><input type="password" className="inp" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Err e={e} /><span className="text-bo-green">{msg}</span>
        <button className="btn-blue w-32" disabled={next.length < 8} onClick={go}>Değiştir</button>
      </div>
    </Panel>
  );
}
