import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, Field, Modal, money, dt } from "../ui";

const TYPES = ["DEPOSIT", "MANUAL", "FREEBET", "FREESPIN", "CASINO_FREEBET", "WAGERING"];
const empty = {
  name: "", type: "FREEBET", product: "SPORT", description: "Bonus kural ve şartlarını inceleyin", note: "", isActive: true,
  expirationType: "FROM_PAYOUT_DATE", expirationDays: 7, allowWithdrawal: false, availableOnRequest: false,
  wageringMultiplier: 1, minAmount: "", maxAmount: "", maxPayout: "", maxPayoutPct: "", percent: "",
  rules: { sports: "", competitions: "", matches: "", markets: "", regions: "", betType: "MULTIPLE", eventType: "PREMATCH", minSelections: 1, minSelectionOdds: 1.5, minTotalOdds: "" },
};

export default function Bonuses() {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [step, setStep] = useState<"setup" | "sport">("setup");
  const load = () => api("/admin/bonuses").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const setR = (k: string, v: any) => setEdit({ ...edit, rules: { ...edit.rules, [k]: v } });
  const num = (v: any) => (v === "" || v === null ? null : Number(v));
  async function save() {
    const { id, createdAt, playerBonuses, promoCodes, ...data } = edit;
    const body = { ...data, expirationDays: Number(data.expirationDays), wageringMultiplier: Number(data.wageringMultiplier),
      minAmount: num(data.minAmount), maxAmount: num(data.maxAmount), maxPayout: num(data.maxPayout), maxPayoutPct: num(data.maxPayoutPct), percent: num(data.percent) };
    await api(id ? `/admin/bonuses/${id}` : "/admin/bonuses", { method: id ? "PATCH" : "POST", json: body });
    setEdit(null); load();
  }
  return (
    <>
      <Panel title="Bonuslar" right={<button className="btn-green" onClick={() => { setEdit(structuredClone(empty)); setStep("setup"); }}>Yeni Bonus Ekle</button>}>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>ID</th><th>Ad</th><th>Tip</th><th>Ürün</th><th>Çevrim</th><th>Min/Max</th><th>Geçerlilik</th><th>Aktif</th><th>Oluşturma</th><th></th></tr></thead>
          <tbody>{list.map((b) => (
            <tr key={b.id}><td>{b.id}</td><td>{b.name}</td><td>{b.type}</td><td>{b.product}</td><td>x{Number(b.wageringMultiplier)}</td>
              <td>{money(b.minAmount)} / {money(b.maxAmount)}</td><td>{b.expirationDays} gün</td><td>{b.isActive ? "Evet" : "Hayır"}</td><td>{dt(b.createdAt)}</td>
              <td><button className="text-bo-blue" onClick={() => { setEdit({ ...structuredClone(empty), ...b, rules: { ...empty.rules, ...(b.rules ?? {}) } }); setStep("setup"); }}>Düzenle</button></td></tr>
          ))}</tbody></table></div>
      </Panel>
      {edit && <Modal title={edit.id ? "Bonusu Düzenle" : "Bonus Ekle"} onClose={() => setEdit(null)}>
        <div className="mb-4 flex justify-center gap-2">
          {(["setup", "sport"] as const).map((s) => <button key={s} onClick={() => setStep(s)} className={`w-52 rounded-t py-2 ${step === s ? "bg-bo-head font-medium" : "bg-bo-head/40"}`}>{s === "setup" ? "Kurulum" : "Spor Kuralları"}</button>)}
        </div>
        {step === "setup" ? (
          <div className="grid grid-cols-4 gap-3">
            <Field label="Ad *"><input className="inp" value={edit.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Tip"><select className="inp" value={edit.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Ürün"><select className="inp" value={edit.product} onChange={(e) => set("product", e.target.value)}><option>SPORT</option><option>CASINO</option></select></Field>
            <Field label="Geçerlilik (gün) *"><input className="inp" type="number" value={edit.expirationDays} onChange={(e) => set("expirationDays", e.target.value)} /></Field>
            <Field label="Çevrim Katı (x)"><input className="inp" type="number" value={edit.wageringMultiplier} onChange={(e) => set("wageringMultiplier", e.target.value)} /></Field>
            <Field label="Yatırım Bonusu %"><input className="inp" type="number" value={edit.percent ?? ""} onChange={(e) => set("percent", e.target.value)} /></Field>
            <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.availableOnRequest} onChange={(e) => set("availableOnRequest", e.target.checked)} />Talep ile alınabilir</label>
            <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.allowWithdrawal} onChange={(e) => set("allowWithdrawal", e.target.checked)} />Bonus aktifken çekime izin ver</label>
            <div className="col-span-4"><Field label="Açıklama *"><textarea className="inp h-16 py-1" value={edit.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
            <div className="col-span-4 mt-1 text-bo-blue">Para birimi ayarları — TRY</div>
            <Field label="Minimum Tutar"><input className="inp" type="number" value={edit.minAmount ?? ""} onChange={(e) => set("minAmount", e.target.value)} /></Field>
            <Field label="Maksimum Tutar"><input className="inp" type="number" value={edit.maxAmount ?? ""} onChange={(e) => set("maxAmount", e.target.value)} /></Field>
            <Field label="Maksimum Ödeme"><input className="inp" type="number" value={edit.maxPayout ?? ""} onChange={(e) => set("maxPayout", e.target.value)} /></Field>
            <Field label="Maks. Ödeme Yüzdesi (%)"><input className="inp" type="number" value={edit.maxPayoutPct ?? ""} onChange={(e) => set("maxPayoutPct", e.target.value)} /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[["sports", "Sporlar (virgülle)"], ["markets", "Market Tipleri"], ["regions", "Bölgeler"], ["competitions", "Ligler"], ["matches", "Maçlar"]].map(([k, l]) => (
              <Field key={k} label={l}><input className="inp" placeholder="Boş = hepsi" value={edit.rules[k]} onChange={(e) => setR(k, e.target.value)} /></Field>
            ))}
            <Field label="Bahis Tipi *"><select className="inp" value={edit.rules.betType} onChange={(e) => setR("betType", e.target.value)}><option>SINGLE</option><option>MULTIPLE</option><option>ANY</option></select></Field>
            <Field label="Etkinlik Tipi"><select className="inp" value={edit.rules.eventType} onChange={(e) => setR("eventType", e.target.value)}><option value="PREMATCH">Maç Öncesi</option><option value="LIVE">Canlı</option><option value="ANY">Hepsi</option></select></Field>
            <Field label="Min. Seçim Sayısı"><input className="inp" type="number" value={edit.rules.minSelections} onChange={(e) => setR("minSelections", Number(e.target.value))} /></Field>
            <Field label="Min. Seçim Oranı"><input className="inp" type="number" step="0.01" value={edit.rules.minSelectionOdds} onChange={(e) => setR("minSelectionOdds", Number(e.target.value))} /></Field>
            <Field label="Min. Toplam Oran"><input className="inp" type="number" step="0.01" value={edit.rules.minTotalOdds} onChange={(e) => setR("minTotalOdds", e.target.value)} /></Field>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2 border-t border-bo-line pt-4">
          {step === "setup" ? <button className="btn-green" onClick={() => setStep("sport")}>İleri</button>
            : <><button className="btn-ghost" onClick={() => setStep("setup")}>Geri</button><button className="btn-green" onClick={save}>Kaydet</button></>}
        </div>
      </Modal>}
    </>
  );
}
