import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, Field, Modal, money, dt, Err, Warn, MultiSelect } from "../ui";

const TYPES = ["DEPOSIT", "MANUAL", "FREEBET", "FREESPIN", "CASINO_FREEBET", "WAGERING"];
const empty = {
  name: "", type: "FREEBET", product: "SPORT", description: "Bonus kural ve şartlarını inceleyin", note: "", isActive: true,
  expirationType: "FROM_PAYOUT_DATE", expirationDays: 7, allowWithdrawal: false, availableOnRequest: false,
  wageringMultiplier: 1, minAmount: "", maxAmount: "", maxPayout: "", maxPayoutPct: "", percent: "",
  rules: { sports: [] as string[], leagues: [] as string[], excludeLeagues: [] as string[], markets: [] as string[], betType: "MULTIPLE", eventType: "PREMATCH", minSelections: 2, minSelectionOdds: 1.5, minTotalOdds: "" },
};
const asList = (v: any): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
const normRules = (r: any) => ({ ...empty.rules, ...(r ?? {}), sports: asList(r?.sports), leagues: asList(r?.leagues ?? r?.competitions), excludeLeagues: asList(r?.excludeLeagues), markets: asList(r?.markets) });

/** Mantıksal kontroller — kaydetmeden önce uyarı verir (sunucu da aynı kontrolleri yapar) */
function validate(b: any) {
  const e: Record<string, string> = {};
  const n = (v: any) => (v === "" || v === null || v === undefined ? null : Number(v));
  const min = n(b.minAmount), max = n(b.maxAmount), mp = n(b.maxPayout), pct = n(b.percent), mpp = n(b.maxPayoutPct);
  if (!String(b.name ?? "").trim()) e.name = "Bonus adı zorunlu";
  if (min != null && min < 0) e.minAmount = "Minimum tutar negatif olamaz";
  if (max != null && max <= 0) e.maxAmount = "Maksimum tutar 0'dan büyük olmalı";
  if (min != null && max != null && max < min) e.maxAmount = `Maksimum tutar (${max}) minimumdan (${min}) küçük olamaz`;
  if (mp != null && mp <= 0) e.maxPayout = "Maksimum ödeme 0'dan büyük olmalı";
  if (mp != null && max != null && mp < max && b.type !== "DEPOSIT") e.maxPayout = "Maksimum ödeme, maksimum bonus tutarından küçük — oyuncu bonusunu bile çekemez";
  if (mpp != null && (mpp <= 0 || mpp > 100000)) e.maxPayoutPct = "Yüzde 1 – 100000 arasında olmalı";
  if (b.type === "DEPOSIT" && (pct == null || pct <= 0)) e.percent = "Yatırım bonusu için yüzde zorunlu";
  if (pct != null && (pct <= 0 || pct > 1000)) e.percent = "Yüzde 1 – 1000 arasında olmalı";
  if (Number(b.wageringMultiplier) < 0 || Number(b.wageringMultiplier) > 100) e.wageringMultiplier = "Çevrim katı 0 – 100 arasında olmalı";
  if (!(Number(b.expirationDays) >= 1 && Number(b.expirationDays) <= 365)) e.expirationDays = "Geçerlilik 1 – 365 gün olmalı";
  const r = b.rules ?? {};
  if (r.minSelections !== "" && Number(r.minSelections) < 1) e.minSelections = "En az 1 seçim olmalı";
  if (r.betType === "SINGLE" && Number(r.minSelections) > 1) e.minSelections = "Bahis tipi TEKLİ iken min. seçim 1 olmalı";
  if (r.betType === "MULTIPLE" && Number(r.minSelections) < 2) e.minSelections = "Kombine kupon için min. seçim en az 2 olmalı";
  if (r.minSelectionOdds !== "" && Number(r.minSelectionOdds) < 1) e.minSelectionOdds = "Oran 1.00'dan küçük olamaz";
  if (r.minTotalOdds !== "" && r.minTotalOdds != null && Number(r.minTotalOdds) < Number(r.minSelectionOdds || 1)) e.minTotalOdds = "Toplam oran, seçim oranından küçük olamaz";
  const both = (r.leagues ?? []).filter((x: string) => (r.excludeLeagues ?? []).includes(x));
  if (both.length) e.excludeLeagues = "Aynı lig hem dahil hem hariç seçilmiş";
  return e;
}

export default function Bonuses() {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [step, setStep] = useState<"setup" | "sport">("setup");
  const [cat, setCat] = useState<any>({ sports: [], markets: [], leagues: [] }); const [err, setErr] = useState(""); const [tried, setTried] = useState(false);
  const load = () => api("/admin/bonuses").then(setList).catch(() => {});
  useEffect(() => { load(); api("/admin/sb/catalog").then(setCat).catch(() => {}); }, []);
  const V = edit ? validate(edit) : {};
  const setupKeys = ["name", "minAmount", "maxAmount", "maxPayout", "maxPayoutPct", "percent", "wageringMultiplier", "expirationDays"];
  const setupBad = setupKeys.some((k) => V[k]); const anyBad = Object.keys(V).length > 0;
  const W = ({ k }: { k: string }) => <Warn show={!!V[k] && (tried || (edit?.[k] ?? edit?.rules?.[k]) !== "")}>{V[k]}</Warn>;
  const sportOpts = cat.sports.map((x: any) => ({ value: x.key, label: x.name, hint: x.active ? "aktif" : "yakında" }));
  const marketOpts = cat.markets.map((x: any) => ({ value: x.key, label: x.name }));
  const leagueOpts = cat.leagues.map((x: any) => ({ value: String(x.id), label: x.name, hint: [x.country, x.count ? `${x.count} maç` : ""].filter(Boolean).join(" · ") }));
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const setR = (k: string, v: any) => setEdit({ ...edit, rules: { ...edit.rules, [k]: v } });
  const num = (v: any) => (v === "" || v === null ? null : Number(v));
  async function save() {
    setTried(true); setErr("");
    if (anyBad) { setStep(setupBad ? "setup" : "sport"); return; }
    const { id, createdAt, playerBonuses, promoCodes, awardedCount, awardedSum, convertedSum, ...data } = edit;
    const body = { ...data, expirationDays: Number(data.expirationDays), wageringMultiplier: Number(data.wageringMultiplier),
      minAmount: num(data.minAmount), maxAmount: num(data.maxAmount), maxPayout: num(data.maxPayout), maxPayoutPct: num(data.maxPayoutPct), percent: num(data.percent) };
    try { await api(id ? `/admin/bonuses/${id}` : "/admin/bonuses", { method: id ? "PATCH" : "POST", json: body }); setEdit(null); load(); }
    catch (x: any) { setErr(x.message); }
  }
  return (
    <>
      <Panel title="Bonuslar" right={<button className="btn-green" onClick={() => { setEdit(structuredClone(empty)); setStep("setup"); setTried(false); setErr(""); }}>Yeni Bonus Ekle</button>}>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>ID</th><th>Ad</th><th>Tip</th><th>Ürün</th><th>Çevrim</th><th>Min/Max</th><th>Geçerlilik</th><th>Talep</th><th>Verilen</th><th>Dönüşen</th><th>Aktif</th><th>Oluşturma</th><th></th></tr></thead>
          <tbody>{list.map((b) => (
            <tr key={b.id}><td>{b.id}</td><td>{b.name}</td><td>{b.type}</td><td>{b.product}</td><td>x{Number(b.wageringMultiplier)}</td>
              <td>{money(b.minAmount)} / {money(b.maxAmount)}</td><td>{b.expirationDays} gün</td><td>{b.availableOnRequest ? "Evet" : ""}</td><td>{b.awardedCount} · {money(b.awardedSum)}</td><td>{money(b.convertedSum)}</td><td>{b.isActive ? "Evet" : "Hayır"}</td><td>{dt(b.createdAt)}</td>
              <td><button className="text-bo-blue" onClick={() => { setEdit({ ...structuredClone(empty), ...b, rules: normRules(b.rules) }); setStep("setup"); setTried(false); setErr(""); }}>Düzenle</button></td></tr>
          ))}</tbody></table></div>
      </Panel>
      {edit && <Modal title={edit.id ? "Bonusu Düzenle" : "Bonus Ekle"} onClose={() => setEdit(null)}>
        <div className="mb-4 flex justify-center gap-2">
          {(["setup", "sport"] as const).map((s) => <button key={s} onClick={() => setStep(s)} className={`w-52 rounded-t py-2 ${step === s ? "bg-bo-head font-medium" : "bg-bo-head/40"}`}>{s === "setup" ? "Kurulum" : "Spor Kuralları"}</button>)}
        </div>
        {step === "setup" ? (
          <div className="grid grid-cols-4 gap-3">
            <Field label="Ad *"><input className="inp" value={edit.name} onChange={(e) => set("name", e.target.value)} /><W k="name" /></Field>
            <Field label="Tip"><select className="inp" value={edit.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Ürün"><select className="inp" value={edit.product} onChange={(e) => set("product", e.target.value)}><option>SPORT</option><option>CASINO</option></select></Field>
            <Field label="Geçerlilik (gün) *"><input className="inp" type="number" value={edit.expirationDays} onChange={(e) => set("expirationDays", e.target.value)} /><W k="expirationDays" /></Field>
            <Field label="Çevrim Katı (x)"><input className="inp" type="number" value={edit.wageringMultiplier} onChange={(e) => set("wageringMultiplier", e.target.value)} /><W k="wageringMultiplier" /></Field>
            <Field label="Yatırım Bonusu %"><input className="inp" type="number" value={edit.percent ?? ""} onChange={(e) => set("percent", e.target.value)} /><W k="percent" /></Field>
            <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.availableOnRequest} onChange={(e) => set("availableOnRequest", e.target.checked)} />Talep ile alınabilir</label>
            <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.isActive} onChange={(e) => set("isActive", e.target.checked)} />Aktif</label>
            <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.allowWithdrawal} onChange={(e) => set("allowWithdrawal", e.target.checked)} />Bonus aktifken çekime izin ver</label>
            <div className="col-span-4"><Field label="Açıklama *"><textarea className="inp h-16 py-1" value={edit.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
            <div className="col-span-4 mt-1 text-bo-blue">Para birimi ayarları — TRY</div>
            <Field label="Minimum Tutar"><input className="inp" type="number" value={edit.minAmount ?? ""} onChange={(e) => set("minAmount", e.target.value)} /><W k="minAmount" /></Field>
            <Field label="Maksimum Tutar"><input className="inp" type="number" value={edit.maxAmount ?? ""} onChange={(e) => set("maxAmount", e.target.value)} /><W k="maxAmount" /></Field>
            <Field label="Maksimum Ödeme"><input className="inp" type="number" value={edit.maxPayout ?? ""} onChange={(e) => set("maxPayout", e.target.value)} /><W k="maxPayout" /></Field>
            <Field label="Maks. Ödeme Yüzdesi (%)"><input className="inp" type="number" value={edit.maxPayoutPct ?? ""} onChange={(e) => set("maxPayoutPct", e.target.value)} /><W k="maxPayoutPct" /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sporlar"><MultiSelect options={sportOpts} value={edit.rules.sports} onChange={(v) => setR("sports", v)} placeholder="Tüm sporlar" /></Field>
            <Field label="Market Tipleri"><MultiSelect options={marketOpts} value={edit.rules.markets} onChange={(v) => setR("markets", v)} placeholder="Tüm marketler" /></Field>
            <Field label="Etkinlik Tipi"><select className="inp" value={edit.rules.eventType} onChange={(e) => setR("eventType", e.target.value)}><option value="PREMATCH">Maç Öncesi</option><option value="LIVE">Canlı</option><option value="ANY">Hepsi</option></select></Field>
            <div className="col-span-3 grid grid-cols-2 gap-3">
              <Field label={`Geçerli Ligler (${cat.leagues.length} lig)`}><MultiSelect options={leagueOpts} value={edit.rules.leagues} onChange={(v) => setR("leagues", v)} placeholder="Tüm ligler — aramak için yazın" /></Field>
              <Field label="Hariç Tutulan Ligler"><MultiSelect options={leagueOpts} value={edit.rules.excludeLeagues} onChange={(v) => setR("excludeLeagues", v)} placeholder="Yok" /><W k="excludeLeagues" /></Field>
            </div>
            <Field label="Bahis Tipi *"><select className="inp" value={edit.rules.betType} onChange={(e) => { const bt = e.target.value; setEdit({ ...edit, rules: { ...edit.rules, betType: bt, minSelections: bt === "SINGLE" ? 1 : bt === "MULTIPLE" ? Math.max(2, Number(edit.rules.minSelections) || 2) : edit.rules.minSelections } }); }}><option value="SINGLE">Tekli</option><option value="MULTIPLE">Kombine</option><option value="ANY">Hepsi</option></select></Field>
            <Field label="Min. Seçim Sayısı"><input className="inp" type="number" min={1} value={edit.rules.minSelections} onChange={(e) => setR("minSelections", e.target.value === "" ? "" : Number(e.target.value))} /><W k="minSelections" /></Field>
            <Field label="Min. Seçim Oranı"><input className="inp" type="number" step="0.01" min={1} value={edit.rules.minSelectionOdds} onChange={(e) => setR("minSelectionOdds", e.target.value === "" ? "" : Number(e.target.value))} /><W k="minSelectionOdds" /></Field>
            <Field label="Min. Toplam Oran"><input className="inp" type="number" step="0.01" value={edit.rules.minTotalOdds} onChange={(e) => setR("minTotalOdds", e.target.value)} /><W k="minTotalOdds" /></Field>
            <div className="col-span-3 rounded bg-bo-head px-3 py-2 text-[12px] text-bo-muted">
              Boş bırakılan alan = kısıt yok. Bonus cüzdanından oynanan kupon bu kurallara uymazsa kupon yine alınır ama <b>çevrime sayılmaz</b> ve Spor Bahisleri ekranında <b className="text-bo-red">⚠ kural dışı</b> olarak işaretlenir.
            </div>
          </div>
        )}
        <Err e={err} />
        {tried && anyBad && <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-rose-700">Kaydetmeden önce düzeltin: {Object.values(V).join(" · ")}</div>}
        <div className="mt-5 flex justify-end gap-2 border-t border-bo-line pt-4">
          {step === "setup" ? <button className="btn-green" onClick={() => { if (setupBad) { setTried(true); return; } setStep("sport"); }}>İleri</button>
            : <><button className="btn-ghost" onClick={() => setStep("setup")}>Geri</button><button className="btn-green" onClick={save}>Kaydet</button></>}
        </div>
      </Modal>}
    </>
  );
}
