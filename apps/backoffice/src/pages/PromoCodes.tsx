import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, money, dt, Err } from "../ui";

export default function PromoCodes() {
  const [list, setList] = useState<any[]>([]); const [bonuses, setBonuses] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null);
  const [red, setRed] = useState<any>(null); const [e, setE] = useState("");
  const load = () => api("/admin/promo-codes").then(setList).catch(() => {});
  useEffect(() => { load(); api("/admin/bonuses").then(setBonuses).catch(() => {}); }, []);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const setC = (k: string, v: any) => setEdit({ ...edit, conditions: { ...edit.conditions, [k]: v } });
  async function save() {
    setE("");
    try {
      const { id, bonus, usedCount, createdAt, redemptions, ...d } = edit;
      await api(id ? `/admin/promo-codes/${id}` : "/admin/promo-codes", { method: id ? "PATCH" : "POST", json: { ...d, bonusId: Number(d.bonusId), amount: Number(d.amount), maxCount: Number(d.maxCount), startsAt: d.startsAt || null, endsAt: d.endsAt || null } });
      setEdit(null); load();
    } catch (x: any) { setE(x.message === "ALREADY_EXISTS" ? "Bu kod zaten var" : x.message); }
  }
  const local = (v: string | null) => (v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  return (
    <>
      <Panel title="Promo Kodlar" right={<button className="btn-green" onClick={() => setEdit({ code: "", bonusId: "", amount: "", currency: "TRY", maxCount: 100, isActive: true, description: "", conditions: {}, startsAt: "", endsAt: "" })}>Promo Kod Ekle</button>}>
        <DataTable rows={list} csvName="promo_kodlar" cols={[
          { key: "id", label: "ID" }, { key: "isActive", label: "Aktif", value: (p) => (p.isActive ? "Evet" : "Hayır") }, { key: "code", label: "Kod", className: "font-mono" },
          { key: "bonus", label: "Bonus", value: (p) => p.bonus?.name }, { key: "type", label: "Tip", value: (p) => p.bonus?.type }, { key: "amount", label: "Tutar", money: true },
          { key: "maxCount", label: "Maks", align: "right" }, { key: "usedCount", label: "Kullanılan", align: "right", render: (p) => <button className="text-bo-blue" onClick={() => api(`/admin/promo-codes/${p.id}/redemptions`).then((r) => setRed({ p, r }))}>{p.usedCount}</button> },
          { key: "startsAt", label: "Başlangıç", render: (p) => dt(p.startsAt) }, { key: "endsAt", label: "Bitiş", render: (p) => dt(p.endsAt) },
          { key: "x", label: "", sortable: false, render: (p) => <button className="text-bo-blue" onClick={() => setEdit({ ...p, conditions: p.conditions ?? {}, startsAt: local(p.startsAt), endsAt: local(p.endsAt) })}>Düzenle</button> },
        ]} />
      </Panel>
      {edit && <Modal title="Promo Kod Ekle / Düzenle" onClose={() => setEdit(null)} wide>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Kod *"><input className="inp font-mono" value={edit.code} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
          <Field label="Bonus *"><select className="inp" value={edit.bonusId} onChange={(e) => set("bonusId", e.target.value)}><option value="">Seçiniz</option>{bonuses.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.type})</option>)}</select></Field>
          <Field label="Tutar (TRY) *"><input className="inp" type="number" value={edit.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="Maks Kullanım *"><input className="inp" type="number" value={edit.maxCount} onChange={(e) => set("maxCount", e.target.value)} /></Field>
          <Field label="Başlangıç"><input className="inp" type="datetime-local" value={edit.startsAt ?? ""} onChange={(e) => set("startsAt", e.target.value)} /></Field>
          <Field label="Bitiş"><input className="inp" type="datetime-local" value={edit.endsAt ?? ""} onChange={(e) => set("endsAt", e.target.value)} /></Field>
          <Field label="Min. Yatırım Sayısı"><input className="inp" type="number" value={edit.conditions.minDepositCount ?? ""} onChange={(e) => setC("minDepositCount", e.target.value)} /></Field>
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.isActive} onChange={(e) => set("isActive", e.target.checked)} />Aktif</label>
          <Field label="Açıklama" className="col-span-4"><textarea className="inp h-16 py-1" value={edit.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
          {[["emailVerified", "E-posta tanımlı olmalı"], ["verifiedOnly", "Sadece doğrulanmış (KYC) oyuncular"]].map(([k, l]) => (
            <label key={k} className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={!!edit.conditions[k]} onChange={(e) => setC(k, e.target.checked)} />{l}</label>
          ))}
        </div>
        <p className="mt-3 text-bo-muted">Oyuncu kodu sitede girdiğinde bonus anında bonus cüzdanına yatar. Her oyuncu bir kodu bir kez kullanabilir.</p>
        <Err e={e} />
        <div className="mt-4 flex justify-end"><button className="btn-blue" onClick={save}>Kaydet</button></div>
      </Modal>}
      {red && <Modal title={`${red.p.code} — Kullananlar`} onClose={() => setRed(null)}>
        <DataTable rows={red.r} cols={[{ key: "player", label: "Oyuncu", value: (r) => r.player?.username, render: (r) => <Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.player?.username}</Link> }, { key: "createdAt", label: "Zaman", render: (r) => dt(r.createdAt) }, { key: "playerBonusId", label: "Oyuncu Bonus ID" }]} />
      </Modal>}
    </>
  );
}
