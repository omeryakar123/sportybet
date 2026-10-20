import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, Field, Modal, money, dt } from "../ui";

export default function PromoCodes() {
  const [list, setList] = useState<any[]>([]); const [bonuses, setBonuses] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null);
  const load = () => api("/admin/promo-codes").then(setList).catch(() => {});
  useEffect(() => { load(); api("/admin/bonuses").then(setBonuses).catch(() => {}); }, []);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const setC = (k: string, v: any) => setEdit({ ...edit, conditions: { ...edit.conditions, [k]: v } });
  async function save() {
    const { id, bonus, usedCount, ...d } = edit;
    const body = { ...d, bonusId: Number(d.bonusId), amount: Number(d.amount), maxCount: Number(d.maxCount), startsAt: d.startsAt || null, endsAt: d.endsAt || null };
    await api(id ? `/admin/promo-codes/${id}` : "/admin/promo-codes", { method: id ? "PATCH" : "POST", json: body }); setEdit(null); load();
  }
  return (
    <>
      <Panel title="Promo Kodlar" right={<button className="btn-green" onClick={() => setEdit({ code: "", bonusId: "", amount: "", currency: "TRY", maxCount: 100, isActive: true, conditions: {} })}>Promo Kod Ekle</button>}>
        <table className="tbl"><thead><tr><th>ID</th><th>Aktif</th><th>Kod</th><th>Bonus</th><th>Tutar</th><th>Maks</th><th>Kullanılan</th><th>Başlangıç</th><th>Bitiş</th><th></th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.isActive ? "Evet" : "Hayır"}</td><td>{p.code}</td><td>{p.bonus?.name}</td><td>{money(p.amount)}</td><td>{p.maxCount}</td><td>{p.usedCount}</td><td>{dt(p.startsAt)}</td><td>{dt(p.endsAt)}</td>
            <td><button className="text-bo-blue" onClick={() => setEdit({ ...p, conditions: p.conditions ?? {}, startsAt: p.startsAt?.slice(0, 16) ?? "", endsAt: p.endsAt?.slice(0, 16) ?? "" })}>Düzenle</button></td></tr>)}</tbody></table>
      </Panel>
      {edit && <Modal title="Promo Kod Ekle / Düzenle" onClose={() => setEdit(null)}>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Kod *"><input className="inp" value={edit.code} onChange={(e) => set("code", e.target.value)} /></Field>
          <Field label="Bonus *"><select className="inp" value={edit.bonusId} onChange={(e) => set("bonusId", e.target.value)}><option value="">Seçiniz</option>{bonuses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Tutar (TRY) *"><input className="inp" type="number" value={edit.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="Maks Kullanım *"><input className="inp" type="number" value={edit.maxCount} onChange={(e) => set("maxCount", e.target.value)} /></Field>
          <Field label="Başlangıç"><input className="inp" type="datetime-local" value={edit.startsAt ?? ""} onChange={(e) => set("startsAt", e.target.value)} /></Field>
          <Field label="Bitiş"><input className="inp" type="datetime-local" value={edit.endsAt ?? ""} onChange={(e) => set("endsAt", e.target.value)} /></Field>
          <Field label="Min. Yatırım Sayısı"><input className="inp" type="number" value={edit.conditions.minDepositCount ?? ""} onChange={(e) => setC("minDepositCount", e.target.value)} /></Field>
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.isActive} onChange={(e) => set("isActive", e.target.checked)} />Aktif</label>
          {[["fromRegistration", "Kayıttan"], ["fromDeposit", "Yatırımdan"], ["fromOtherPlaces", "Diğer yerlerden"], ["emailVerified", "E-posta doğrulanmış"], ["phoneVerified", "Telefon doğrulanmış"], ["verifiedOnly", "Sadece doğrulanmış oyuncular"]].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!edit.conditions[k]} onChange={(e) => setC(k, e.target.checked)} />{l}</label>
          ))}
        </div>
        <div className="mt-5 flex justify-end"><button className="btn-blue" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}
