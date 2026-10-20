import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel } from "../ui";
import { BetsTable } from "./PlayerDetail";

export default function SportsBets() {
  const [state, setState] = useState(""); const [live, setLive] = useState(""); const [bets, setBets] = useState<any[]>([]);
  const load = () => api(`/admin/bets?state=${state}&isLive=${live}`).then(setBets).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <>
      <Panel title="Filtre"><div className="flex gap-3">
        <select className="inp max-w-48" value={state} onChange={(e) => setState(e.target.value)}><option value="">Tüm Durumlar</option>{["PENDING", "WON", "LOST", "RETURNED", "CASHED_OUT"].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="inp max-w-48" value={live} onChange={(e) => setLive(e.target.value)}><option value="">Canlı + Maç Öncesi</option><option value="true">Canlı</option><option value="false">Maç Öncesi</option></select>
        <button className="btn-blue" onClick={load}>Uygula</button>
      </div></Panel>
      <Panel title="Tüm Spor Bahisleri"><BetsTable bets={bets} showPlayer /></Panel>
    </>
  );
}
