import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, money } from "../ui";
import { BetsTable } from "./PlayerDetail";

export default function SportsBets() {
  const [state, setState] = useState(""); const [live, setLive] = useState(""); const [coupon, setCoupon] = useState(""); const [playerId, setPlayerId] = useState(""); const [bonusOnly, setBonusOnly] = useState(false);
  const [bets, setBets] = useState<any[]>([]);
  const load = () => api(`/admin/bets?${new URLSearchParams(Object.fromEntries(Object.entries({ state, isLive: live, coupon, playerId, bonusOnly: bonusOnly ? "true" : "" }).filter(([, v]) => v)))}`).then(setBets).catch(() => {});
  const total = (k: string) => bets.reduce((a, b) => a + Number(b[k] ?? 0), 0);
  useEffect(() => { load(); }, []);
  return (
    <>
      <Panel title="Filtre"><div className="flex gap-3">
        <select className="inp max-w-48" value={state} onChange={(e) => setState(e.target.value)}><option value="">Tüm Durumlar</option>{["PENDING", "ACTIVE", "WON", "LOST", "RETURNED", "CASHED_OUT", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="inp max-w-48" value={live} onChange={(e) => setLive(e.target.value)}><option value="">Canlı + Maç Öncesi</option><option value="true">Canlı</option><option value="false">Maç Öncesi</option></select>
        <input className="inp max-w-48" placeholder="Kupon No" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
        <input className="inp max-w-36" placeholder="Oyuncu ID" value={playerId} onChange={(e) => setPlayerId(e.target.value)} />
        <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={bonusOnly} onChange={(e) => setBonusOnly(e.target.checked)} />Bonuslu</label>
        <button className="btn-blue" onClick={load}>Uygula</button>
      </div></Panel>
      <Panel title="Tüm Spor Bahisleri" right={<span className="text-bo-text">Kupon: {bets.length} · Yatırılan: {money(total("stake"))} · Ödenen: {money(total("winAmount"))} · GGR: {money(total("stake") - total("winAmount"))}</span>}><BetsTable bets={bets} showPlayer /></Panel>
    </>
  );
}
