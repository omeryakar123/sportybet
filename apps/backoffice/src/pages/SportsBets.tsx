import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Panel, Field, DataTable, DateRange, money, Err, useForm, useUrlInit } from "../ui";
import { betCols, Selections } from "./PlayerDetail";

export default function SportsBets() {
  const U = useUrlInit();
  const [range, setRange] = useState(U.range("today"));
  const { f, bind, check } = useForm({ state: U.get("state"), isLive: U.get("isLive"), coupon: U.get("coupon"), playerId: U.get("playerId"), playerBonusId: U.get("playerBonusId"), type: U.get("type"), minStake: "", bonusOnly: (U.get("bonusOnly") === "true") as any });
  const [bets, setBets] = useState<any[]>([]); const [e, setE] = useState("");
  const [auto, setAuto] = useState(true);
  const [last, setLast] = useState<Date | null>(null);
  const loadRef = useRef<() => void>(() => {});
  const load = () => api(`/admin/bets?${new URLSearchParams(Object.fromEntries(Object.entries({ ...f, bonusOnly: f.bonusOnly ? "true" : "", from: range.from, to: range.to, take: "1000" }).filter(([, v]) => v)))}`).then((r) => { setBets(r); setLast(new Date()); }).catch((x) => setE(x.message));
  loadRef.current = load;
  useEffect(() => { load(); }, [range]);
  useEffect(() => { if (!auto) return; const t = setInterval(() => loadRef.current(), 15_000); return () => clearInterval(t); }, [auto]);
  const tot = (k: string) => bets.filter((b) => b.state !== "CANCELLED").reduce((a, b) => a + Number(b[k] ?? 0), 0);
  const settled = bets.filter((b) => ["WON", "LOST", "RETURNED", "CASHED_OUT"].includes(b.state));
  const ggr = settled.reduce((a, b) => a + Number(b.stake) - Number(b.winAmount), 0);
  return (
    <>
      <Panel title="Filtre">
        <div className="mb-3"><DateRange value={range} onChange={setRange} /></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Field label="Durum"><select className="inp" {...bind("state")}><option value="">Tümü</option><option value="ACTIVE">Açık</option><option value="WON">Kazandı</option><option value="LOST">Kaybetti</option><option value="RETURNED">İade</option><option value="CASHED_OUT">Cashout</option><option value="CANCELLED">İptal</option></select></Field>
          <Field label="Canlı"><select className="inp" {...bind("isLive")}><option value="">Hepsi</option><option value="true">Canlı</option><option value="false">Maç Öncesi</option></select></Field>
          <Field label="Tip"><select className="inp" {...bind("type")}><option value="">Hepsi</option><option value="SINGLE">Tekli</option><option value="MULTIPLE">Kombine</option></select></Field>
          <Field label="Kupon No"><input className="inp" {...bind("coupon")} /></Field>
          <Field label="Oyuncu ID"><input className="inp" {...bind("playerId")} /></Field>
          <Field label="Bonus Kayıt ID"><input className="inp" placeholder="ör. 12" {...bind("playerBonusId")} /></Field>
          <Field label="Min. Yatırılan"><input type="number" className="inp" {...bind("minStake")} /></Field>
          <label className="flex items-end gap-2 pb-2"><input type="checkbox" {...check("bonusOnly")} />Sadece bonuslu</label>
        </div>
        <div className="mt-3 flex justify-end"><button className="btn-blue w-28" onClick={load}>Uygula</button></div>
      </Panel>
      <Panel title="Spor Bahisleri" right={<span className="flex items-center gap-3 text-bo-text">
        <label className="flex items-center gap-1 text-xs text-bo-muted"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Otomatik yenile (15 sn){last ? ` · ${last.toLocaleTimeString("tr-TR")}` : ""}</label>
        <span>Kupon: {bets.length} · Yatırılan: {money(tot("stake"))} · Ödenen: {money(tot("winAmount"))} · GGR (sonuçlanan): <b className={ggr < 0 ? "text-bo-red" : "text-bo-green"}>{money(ggr)}</b></span>
      </span>}>
        <Err e={e} />
        <DataTable rows={bets} cols={betCols(true)} csvName="spor_bahisleri" expand={(b) => <Selections b={b} />} />
      </Panel>
    </>
  );
}
