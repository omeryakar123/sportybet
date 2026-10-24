import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, DateRange, presetRange, money, dt, StateBadge, Err, Warn, TX_TR, useForm, useUrlInit } from "../ui";

function beep() {
  try { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.25); } catch {}
}

export function PaymentRequests({ type }: { type: "DEPOSIT" | "WITHDRAWAL" }) {
  const isW = type === "WITHDRAWAL";
  const U = useUrlInit();
  const [range, setRange] = useState(U.range("week"));
  const { f, bind } = useForm({ state: U.get("state"), id: "", playerId: U.get("playerId"), username: "", paymentSystem: "", minAmount: "", maxAmount: "" });
  const [data, setData] = useState<any>({ items: [], total: 0, sum: 0 }); const [e, setE] = useState("");
  const [systems, setSystems] = useState<any[]>([]); const [act, setAct] = useState<{ r: any; a: string } | null>(null);
  const [sound, setSound] = useState(true); const lastNew = useRef<number | null>(null);
  const load = () => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries({ ...f, type, from: range.from, to: range.to, size: "500" }).filter(([, v]) => v !== "")));
    api(`/admin/payment-requests?${q}`).then((d) => {
      setData(d);
      const n = d.items.filter((i: any) => i.state === "NEW").length;
      if (sound && lastNew.current !== null && n > lastNew.current) beep();
      lastNew.current = n;
    }).catch((x) => setE(x.message));
  };
  useEffect(() => { load(); api("/admin/payment-systems").then(setSystems).catch(() => {}); }, [range]);
  useEffect(() => { const t = setInterval(load, 30_000); return () => clearInterval(t); }, [range, f, sound]); // 30 sn'de bir yenile
  const btn = (cls: string, label: string, a: string, r: any, title?: string) => <button className={`rounded px-2 py-0.5 text-white ${cls}`} title={title ?? label} onClick={() => setAct({ r, a })}>{label}</button>;
  return (
    <>
      <Panel title="Filtre">
        <div className="mb-3"><DateRange value={range} onChange={setRange} /></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Field label="Durum"><select className="inp" {...bind("state")}><option value="">Tümü</option><option value="NEW">Yeni</option><option value="PENDING">Onaylandı (ödeme bekliyor)</option><option value="NEW,PENDING">Açık talepler</option><option value="PAID">Ödendi</option><option value="REJECTED">Reddedildi</option><option value="CANCELLED">İptal</option><option value="REVERSED">Geri alındı</option></select></Field>
          <Field label="Talep ID"><input className="inp" {...bind("id")} /></Field>
          <Field label="Oyuncu ID"><input className="inp" {...bind("playerId")} /></Field>
          <Field label="Kullanıcı adı"><input className="inp" {...bind("username")} /></Field>
          <Field label="Ödeme Sistemi"><select className="inp" {...bind("paymentSystem")}><option value="">Tümü</option>{systems.map((s) => <option key={s.id} value={s.name}>{s.displayName}</option>)}<option value="Manual">Manual</option></select></Field>
          <Field label="Min. Tutar"><input type="number" className="inp" {...bind("minAmount")} /></Field>
          <Field label="Maks. Tutar"><input type="number" className="inp" {...bind("maxAmount")} /></Field>
        </div>
        <div className="mt-3 flex justify-end"><button className="btn-blue w-28" onClick={load}>Uygula</button></div>
      </Panel>
      <Panel title={`${isW ? "Çekim" : "Yatırım"} Talepleri (${data.total}) · Toplam ${money(data.sum)}`} right={<label className="flex items-center gap-2 text-bo-text"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />🔔 Yeni talepte ses</label>}>
        <Err e={e} />
        <DataTable rows={data.items} pageSize={20} csvName={isW ? "cekimler" : "yatirimlar"} cols={[
          { key: "id", label: "ID" },
          { key: "playerId", label: "Oyuncu ID", render: (r) => <Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.playerId}</Link> },
          { key: "name", label: "Ad Soyad", value: (r) => [r.player?.firstName, r.player?.lastName].filter(Boolean).join(" ") },
          { key: "username", label: "Kullanıcı", value: (r) => r.player?.username },
          { key: "amount", label: "Tutar", money: true, sum: true, render: (r) => <span>{money(r.amount)}{r.correctedAmount != null && <span className="block text-[11px] text-bo-orange" title="Düzeltme öncesi tutar">önce {money(r.correctedAmount)}</span>}</span> },
          { key: "state", label: "Durum", render: (r) => <span title={r.reverseReason ?? r.rejectReason ?? ""}><StateBadge s={r.state} />{r.state === "REVERSED" && r.reverseReason && <span className="block max-w-48 truncate text-[11px] text-bo-muted">{r.reverseReason}</span>}</span> },
          ...(isW ? [{ key: "lastBonus", label: "Bonus", sortable: false, value: (r: any) => r.lastBonus ? `#${r.lastBonus.id} ${r.lastBonus.name}` : "", render: (r: any) => r.lastBonus ? <BonusTag b={r.lastBonus} /> : <span className="text-bo-muted">—</span> }] : []),
          { key: "createdAt", label: "Talep Zamanı", render: (r) => dt(r.createdAt) },
          { key: "paymentSystem", label: "Ödeme Sistemi" },
          { key: "rejectUser", label: "Reddeden" }, { key: "allowUser", label: "Onaylayan" }, { key: "paidUser", label: "Ödeyen" },
          { key: "notes", label: "Not", className: "max-w-56 truncate" },
          { key: "info", label: "Bilgi", value: (r) => Object.entries(r.info ?? {}).map(([k, v]) => `${k}:${v}`).join(", ") },
          { key: "verified", label: "KYC", value: (r) => (r.player?.isVerified ? "✓" : "—") },
          { key: "actions", label: "İşlem", sortable: false, render: (r) => (
            <div className="flex flex-wrap gap-1">
              {r.state === "NEW" && btn("bg-bo-orange", "Onayla", "allow", r, "Onayla (ödeme bekliyor)")}
              {(r.state === "NEW" || r.state === "PENDING") && btn("bg-bo-green", "Öde", "pay", r, "Ödendi")}
              {(r.state === "NEW" || r.state === "PENDING") && btn("bg-bo-red", "Reddet", "reject", r)}
              {r.state === "PAID" && btn("bg-slate-500", "Tutar Düzelt", "correct", r, "Yanlış tutarla onaylandıysa")}
              {r.state === "PAID" && btn("bg-bo-purple", isW ? "İade Et" : "Geri Al", "reverse", r, isW ? "Para oyuncuya ulaşmadı → bakiyeye iade" : "Sahte / mükerrer / ulaşmayan yatırım")}
              {(r.state === "REJECTED" || r.state === "CANCELLED") && btn("bg-bo-blue", "Yeniden Aç", "reopen", r, "Yanlışlıkla reddedildiyse")}
            </div>
          ) },
        ]} />
      </Panel>
      {act && <ActionModal type={type} act={act} onClose={() => setAct(null)} onDone={() => { setAct(null); load(); }} />}
    </>
  );
}

export function BonusTag({ b }: { b: any }) {
  const pct = b.wagerRequired ? Math.min(100, (b.wagerDone / b.wagerRequired) * 100) : 100;
  const cls = b.state === "ACTIVE" ? "border-bo-orange/50 bg-amber-50 text-amber-700" : b.state === "COMPLETED" ? "border-bo-green/40 bg-emerald-50 text-emerald-700" : "border-bo-line bg-bo-head text-bo-muted";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] leading-tight ${cls}`} title={`Bonus kaydı #${b.id} · ${b.name} · ${b.state} · çevrim %${pct.toFixed(0)}`}>
      <b>BONUS #{b.id}</b> · {b.name}<br />{b.state === "ACTIVE" ? `Aktif · çevrim %${pct.toFixed(0)}` : b.state === "COMPLETED" ? "Tamamlandı" : b.state}
    </span>
  );
}

function PlayerBonusInfo({ playerId }: { playerId: number }) {
  const [pbs, setPbs] = useState<any[] | null>(null); const [bets, setBets] = useState<any[]>([]);
  useEffect(() => {
    api(`/admin/players/${playerId}/bonuses`).then(setPbs).catch(() => setPbs([]));
    api(`/admin/bets?playerId=${playerId}&bonusOnly=true&take=50&from=2000-01-01T00:00:00.000Z`).then(setBets).catch(() => {});
  }, [playerId]);
  if (!pbs) return null;
  const recent = pbs.slice(0, 4);
  return (
    <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3">
      <div className="mb-1 font-medium text-amber-800">Oyuncunun bonus geçmişi (ödeme kararı için)</div>
      {recent.length === 0 ? <div className="text-bo-muted">Bonus kaydı yok.</div> : (
        <table className="tbl"><thead><tr><th>Kayıt</th><th>Bonus</th><th>Tutar</th><th>Durum</th><th>Çevrim</th><th>Bonus kuponu</th></tr></thead><tbody>
          {recent.map((b) => { const n = bets.filter((x) => x.playerBonusId === b.id); return (
            <tr key={b.id}><td>#{b.id}</td><td>{b.bonus?.name}</td><td>{money(b.amount)}</td><td><StateBadge s={b.state} /></td>
              <td>{money(b.wagerDone)} / {money(b.wagerRequired)}</td>
              <td><Link className="text-bo-blue" to={`/bets?playerBonusId=${b.id}&from=2000-01-01T00:00:00.000Z`}>{n.length} kupon{n.some((x) => x.bonusEligible === false) ? " · ⚠ kural dışı var" : ""}</Link></td></tr>
          ); })}
        </tbody></table>
      )}
    </div>
  );
}

function ActionModal({ type, act, onClose, onDone }: any) {
  const { r, a } = act;
  const isW = type === "WITHDRAWAL";
  const [reason, setReason] = useState(""); const [notes, setNotes] = useState(r.notes ?? ""); const [newAmount, setNewAmount] = useState(String(Number(r.amount)));
  const [e, setE] = useState(""); const [detail, setDetail] = useState<any>(null); const [force, setForce] = useState(false); const [busy, setBusy] = useState(false);
  const title = ({ allow: "Talebi Onayla", pay: "Ödendi Olarak İşaretle", reject: "Talebi Reddet", correct: "Tutarı Düzelt", reverse: isW ? "Çekimi İade Et" : "Yatırımı Geri Al", reopen: "Talebi Yeniden Aç" } as any)[a];
  const explain = ({
    allow: "Talep 'ödeme bekliyor' durumuna geçer. Para hareketi olmaz.",
    pay: !isW ? "Tutar oyuncunun Ana Para cüzdanına yatırılır. Yatırım bonusu seçildiyse bonus otomatik verilir." : "Çekim tamamlanır. Tutar talep anında zaten bloke edilmişti.",
    reject: isW ? "Bloke edilen tutar oyuncunun Ana Para cüzdanına iade edilir." : "Yatırım talebi reddedilir, bakiye değişmez.",
    correct: !isW ? "Yanlış tutarla onaylanan yatırım: fark kadar oyuncunun bakiyesine eklenir/düşülür. Raporlara yeni tutar girer, eski tutar kayıtta saklanır." : "Yanlış tutarla ödenen çekim: fazla ödendiyse fark oyuncudan düşülür, eksik ödendiyse fark iade edilir.",
    reverse: !isW ? "Sahte / mükerrer / hesaba ulaşmayan yatırım: tutar Ana Paradan düşülür, talep 'Geri alındı' olur ve raporlardan çıkar. Bu yatırımla verilen aktif bonus iptal edilir." : "Ödendi olarak işaretlenen ama oyuncuya ulaşmayan çekim: tutar Ana Para cüzdanına iade edilir, talep 'Geri alındı' olur.",
    reopen: isW ? "Talep tekrar 'Yeni' olur ve tutar oyuncunun bakiyesinden yeniden bloke edilir." : "Talep tekrar 'Yeni' olur (para hareketi yok).",
  } as any)[a];
  const needReason = ["reject", "correct", "reverse", "reopen"].includes(a);
  const reasonOk = !needReason || reason.trim().length >= (a === "reject" ? 3 : 5);
  const amtOk = a !== "correct" || (Number(newAmount) > 0 && Number(newAmount) !== Number(r.amount));
  async function go() {
    setBusy(true); setE(""); setDetail(null);
    try {
      await api(`/admin/payment-requests/${r.id}/${a}`, { method: "POST", json: { reason: reason || undefined, notes, ...(a === "correct" ? { newAmount: Number(newAmount) } : {}), ...(a === "reverse" ? { force } : {}) } });
      onDone();
    } catch (x: any) { setE(x.message); setDetail((x as any).detail ?? null); setBusy(false); }
  }
  const danger = ["reject", "reverse"].includes(a);
  return (
    <Modal title={`${title} — #${r.id}`} onClose={onClose}>
      <div className="mb-3 grid grid-cols-3 gap-3 rounded bg-bo-head p-3">
        <div><div className="text-bo-muted">Oyuncu</div><Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.player?.username} (#{r.playerId})</Link></div>
        <div><div className="text-bo-muted">Tutar</div><b>{money(r.amount)}</b></div>
        <div><div className="text-bo-muted">Ödeme Sistemi</div>{r.paymentSystem}</div>
        <div className="col-span-3"><div className="text-bo-muted">Bilgi</div>{Object.entries(r.info ?? {}).map(([k, v]) => <div key={k}>{k}: <b>{String(v)}</b></div>)}</div>
      </div>
      {isW && (a === "pay" || a === "allow") && <PlayerBonusInfo playerId={r.playerId} />}
      <p className={`mb-3 rounded px-3 py-2 ${danger ? "bg-rose-50 text-rose-700" : "text-bo-muted"}`}>{explain}</p>
      {a === "correct" && <Field label="Doğru tutar (₺)" className="mb-2"><input type="number" min="0" step="0.01" className="inp" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
        <Warn show={!amtOk}>Yeni tutar 0'dan büyük ve mevcut tutardan farklı olmalı</Warn>
        {amtOk && <div className="mt-1 text-[12px] text-bo-muted">Fark: <b>{money(Number(newAmount) - Number(r.amount))}</b> {isW ? (Number(newAmount) > Number(r.amount) ? "→ oyuncudan düşülecek" : "→ oyuncuya iade edilecek") : (Number(newAmount) > Number(r.amount) ? "→ oyuncuya eklenecek" : "→ oyuncudan düşülecek")}</div>}
      </Field>}
      {needReason && <Field label={a === "reject" ? "Red sebebi (oyuncu görür) *" : "Sebep (kayda geçer) *"} className="mb-2"><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={a === "reverse" ? "ör. Banka dekontu sahte / mükerrer yatırım" : ""} />
        <Warn show={reason.length > 0 && !reasonOk}>En az {a === "reject" ? 3 : 5} karakter</Warn></Field>}
      <Field label="Not"><input className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Err e={e} />
      {e === "INSUFFICIENT_BALANCE_FOR_REVERSAL" && detail && (
        <div className="mb-2 rounded border border-bo-red/30 bg-rose-50 p-3 text-rose-700">
          Oyuncu bakiyesi <b>{money(detail.balance)}</b>, geri alınacak tutar <b>{money(detail.amount)}</b> — eksik <b>{money(detail.shortfall)}</b>.
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={force} onChange={(x) => setForce(x.target.checked)} />Mevcut bakiyeyi al, eksik tutarı kayda geçir ve <b>hesabı bloke et</b></label>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className={danger ? "btn bg-bo-red" : "btn-green"} disabled={busy || !reasonOk || !amtOk || (e === "INSUFFICIENT_BALANCE_FOR_REVERSAL" && !force)} onClick={go}>{title}</button></div>
    </Modal>
  );
}

export function Transactions() {
  const U = useUrlInit();
  const [range, setRange] = useState(U.range("today"));
  const { f, bind } = useForm({ type: U.get("type"), playerId: U.get("playerId"), wallet: "" });
  const [rows, setRows] = useState<any[]>([]); const [e, setE] = useState("");
  const load = () => api(`/admin/transactions?${new URLSearchParams(Object.fromEntries(Object.entries({ ...f, from: range.from, to: range.to, take: "1000" }).filter(([, v]) => v)))}`).then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, [range]);
  return (
    <>
      <Panel title="Filtre">
        <div className="mb-3"><DateRange value={range} onChange={setRange} /></div>
        <div className="flex flex-wrap gap-3">
          <Field label="Tip"><select className="inp w-48" {...bind("type")}><option value="">Tümü</option>{Object.entries(TX_TR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Cüzdan"><select className="inp w-40" {...bind("wallet")}><option value="">Tümü</option><option value="MAIN">Ana Para</option><option value="BONUS">Bonus</option></select></Field>
          <Field label="Oyuncu ID"><input className="inp w-40" {...bind("playerId")} /></Field>
          <div className="flex items-end"><button className="btn-blue w-28" onClick={load}>Uygula</button></div>
        </div>
      </Panel>
      <Panel title="Tüm İşlemler (son 1000)">
        <Err e={e} />
        <DataTable rows={rows} csvName="islemler" cols={[
          { key: "id", label: "ID" }, { key: "createdAt", label: "Zaman", render: (t) => dt(t.createdAt) },
          { key: "player", label: "Oyuncu", value: (t) => t.player?.username, render: (t) => <Link className="text-bo-blue" to={`/players/${t.playerId}`}>{t.player?.username}</Link> },
          { key: "type", label: "Tip", value: (t) => TX_TR[t.type] ?? t.type }, { key: "wallet", label: "Cüzdan", value: (t) => (t.wallet?.type === "BONUS" ? "Bonus" : "Ana") },
          { key: "amount", label: "Tutar", money: true, sum: true }, { key: "balanceAfter", label: "Sonraki Bakiye", money: true },
          { key: "paymentSystem", label: "Ödeme Sistemi" }, { key: "reference", label: "Referans" }, { key: "note", label: "Not" }, { key: "adminId", label: "Admin" },
        ]} />
      </Panel>
    </>
  );
}

export function PaymentSystems() {
  const [rows, setRows] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [e, setE] = useState("");
  const load = () => api("/admin/payment-systems").then(setRows);
  useEffect(() => { load(); }, []);
  async function save() {
    setE("");
    try {
      const { id, createdAt, siteId, cfgAddress, cfgNetwork, cfgRequireTxid, ...d } = edit;
      const config = { ...(d.config ?? {}), depositAddress: cfgAddress || "", network: cfgNetwork || "", requireTxid: !!cfgRequireTxid };
      const hasCfg = config.depositAddress || config.network || config.requireTxid;
      const body = { ...d, config: hasCfg ? config : d.config ?? undefined, fields: typeof d.fields === "string" ? JSON.parse(d.fields || "[]") : d.fields, minAmount: Number(d.minAmount || 0), maxAmount: d.maxAmount === "" || d.maxAmount === null ? undefined : Number(d.maxAmount), sortOrder: Number(d.sortOrder || 0) };
      await api(id ? `/admin/payment-systems/${id}` : "/admin/payment-systems", { method: id ? "PATCH" : "POST", json: body }); setEdit(null); load();
    } catch (x: any) { setE(x.message); }
  }
  return (
    <>
      <Panel title="Ödeme Sistemleri" right={<button className="btn-green" onClick={() => setEdit({ name: "", displayName: "", kind: "BOTH", minAmount: 100, maxAmount: "", fields: "[]", instructions: "", logoUrl: "", isActive: true, sortOrder: 0, cfgAddress: "", cfgNetwork: "", cfgRequireTxid: false })}>Yeni Ödeme Sistemi</button>}>
        <p className="mb-2 text-bo-muted">Sitede yatırım/çekim ekranında listelenen yöntemler. Çekimde istenecek alanlar (IBAN, cüzdan adresi…) "Alanlar" ile tanımlanır.</p>
        <DataTable rows={rows} search={false} cols={[
          { key: "sortOrder", label: "Sıra" }, { key: "logoUrl", label: "Logo", sortable: false, render: (r) => r.logoUrl ? <img src={r.logoUrl} className="h-6" /> : null },
          { key: "name", label: "Kod" }, { key: "displayName", label: "Görünen Ad" }, { key: "kind", label: "Tip", value: (r) => ({ DEPOSIT: "Yatırım", WITHDRAWAL: "Çekim", BOTH: "Yatırım + Çekim" } as any)[r.kind] },
          { key: "minAmount", label: "Min", money: true }, { key: "maxAmount", label: "Maks", money: true },
          { key: "fields", label: "Alanlar", value: (r) => (r.fields ?? []).map((x: any) => x.label).join(", ") },
          { key: "isActive", label: "Aktif", value: (r) => (r.isActive ? "Evet" : "Hayır") },
          { key: "x", label: "", sortable: false, render: (r) => <button className="text-bo-blue" onClick={() => setEdit({ ...r, fields: JSON.stringify(r.fields ?? [], null, 0), maxAmount: r.maxAmount ?? "", cfgAddress: r.config?.depositAddress ?? "", cfgNetwork: r.config?.network ?? "", cfgRequireTxid: !!r.config?.requireTxid })}>Düzenle</button> },
        ]} />
      </Panel>
      {edit && <Modal title="Ödeme Sistemi" onClose={() => setEdit(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kod (benzersiz, ör. BankTransfer)"><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} disabled={!!edit.id} /></Field>
          <Field label="Görünen Ad"><input className="inp" value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} /></Field>
          <Field label="Tip"><select className="inp" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="BOTH">Yatırım + Çekim</option><option value="DEPOSIT">Sadece Yatırım</option><option value="WITHDRAWAL">Sadece Çekim</option></select></Field>
          <Field label="Sıra"><input type="number" className="inp" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} /></Field>
          <Field label="Min. Tutar"><input type="number" className="inp" value={edit.minAmount} onChange={(e) => setEdit({ ...edit, minAmount: e.target.value })} /></Field>
          <Field label="Maks. Tutar (boş = sınırsız)"><input type="number" className="inp" value={edit.maxAmount} onChange={(e) => setEdit({ ...edit, maxAmount: e.target.value })} /></Field>
          <Field label="Logo URL" className="col-span-2"><input className="inp" value={edit.logoUrl ?? ""} onChange={(e) => setEdit({ ...edit, logoUrl: e.target.value })} /></Field>
          <Field label='Alanlar (JSON) — ör. [{"key":"iban","label":"IBAN"}]' className="col-span-2"><textarea className="inp h-16 py-1 font-mono text-xs" value={edit.fields} onChange={(e) => setEdit({ ...edit, fields: e.target.value })} /></Field>
          <Field label="Oyuncuya talimat (yatırım ekranında görünür)" className="col-span-2"><textarea className="inp h-16 py-1" value={edit.instructions ?? ""} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></Field>
          <div className="col-span-2 rounded border border-bo-line bg-bo-head/40 p-3">
            <div className="mb-2 font-semibold">Kripto ayarları (kripto yöntemiyse doldurun)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Yatırım cüzdan adresi (oyuncuya gösterilir)"><input className="inp font-mono text-xs" value={edit.cfgAddress ?? ""} placeholder="ör. TXy3...k9Q (TRC20)" onChange={(e) => setEdit({ ...edit, cfgAddress: e.target.value })} /></Field>
              <Field label="Ağ (network)"><input className="inp" value={edit.cfgNetwork ?? ""} placeholder="ör. TRC20 / ERC20 / BEP20" onChange={(e) => setEdit({ ...edit, cfgNetwork: e.target.value })} /></Field>
            </div>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={!!edit.cfgRequireTxid} onChange={(e) => setEdit({ ...edit, cfgRequireTxid: e.target.checked })} />Yatırımda işlem no (TXID) zorunlu olsun</label>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Aktif</label>
        </div>
        <Err e={e} />
        <div className="mt-4 flex justify-end"><button className="btn-green" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}
