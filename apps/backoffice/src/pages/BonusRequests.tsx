import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, money, dt, StateBadge, Err } from "../ui";

export default function BonusRequests() {
  const [state, setState] = useState("PENDING"); const [rows, setRows] = useState<any[]>([]); const [act, setAct] = useState<any>(null);
  const load = () => api(`/admin/bonus-requests${state ? `?state=${state}` : ""}`).then(setRows);
  useEffect(() => { load(); }, [state]);
  return (
    <>
      <Panel title="Bonus Talepleri" right={<select className="inp w-44" value={state} onChange={(e) => setState(e.target.value)}><option value="PENDING">Bekleyen</option><option value="APPROVED">Onaylanan</option><option value="REJECTED">Reddedilen</option><option value="">Tümü</option></select>}>
        <p className="mb-2 text-bo-muted">Oyuncuların siteden talep ettiği bonuslar ("Talep ile alınabilir" işaretli bonuslar). Onaylarken tutarı siz belirlersiniz.</p>
        <DataTable rows={rows} csvName="bonus_talepleri" cols={[
          { key: "id", label: "ID" }, { key: "createdAt", label: "Talep", render: (r) => dt(r.createdAt) },
          { key: "player", label: "Oyuncu", value: (r) => r.player?.username, render: (r) => <Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.player?.username}</Link> },
          { key: "bonus", label: "Bonus", value: (r) => r.bonus?.name }, { key: "type", label: "Tip", value: (r) => r.bonus?.type },
          { key: "state", label: "Durum", render: (r) => <StateBadge s={r.state} /> }, { key: "amount", label: "Tutar", money: true }, { key: "note", label: "Not" },
          { key: "processedAt", label: "İşlem", render: (r) => dt(r.processedAt) },
          { key: "x", label: "", sortable: false, render: (r) => r.state === "PENDING" && <div className="flex gap-1">
            <button className="rounded bg-bo-green px-2 py-0.5 text-white" onClick={() => setAct({ r, a: "approve" })}>Onayla</button>
            <button className="rounded bg-bo-red px-2 py-0.5 text-white" onClick={() => setAct({ r, a: "reject" })}>Reddet</button></div> },
        ]} />
      </Panel>
      {act && <Act act={act} onClose={() => setAct(null)} onDone={() => { setAct(null); load(); }} />}
    </>
  );
}

function Act({ act, onClose, onDone }: any) {
  const { r, a } = act; const [amount, setAmount] = useState(r.bonus?.minAmount ?? ""); const [note, setNote] = useState(""); const [e, setE] = useState("");
  async function go() { try { await api(`/admin/bonus-requests/${r.id}/${a}`, { method: "POST", json: { amount: a === "approve" ? Number(amount) : undefined, note: note || undefined } }); onDone(); } catch (x: any) { setE(x.message); } }
  return (
    <Modal title={a === "approve" ? "Bonus Talebini Onayla" : "Bonus Talebini Reddet"} onClose={onClose}>
      <p className="mb-3">{r.player?.username} · {r.bonus?.name} {r.bonus?.minAmount && <span className="text-bo-muted">(min {money(r.bonus.minAmount)} / maks {money(r.bonus.maxAmount)})</span>}</p>
      {a === "approve" && <Field label="Bonus tutarı (₺)"><input type="number" className="inp" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
      <Field label="Not" className="mt-2"><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Err e={e} />
      <div className="mt-4 flex justify-end"><button className={a === "approve" ? "btn-green" : "btn bg-bo-red"} onClick={go}>{a === "approve" ? "Onayla ve Ver" : "Reddet"}</button></div>
    </Modal>
  );
}
