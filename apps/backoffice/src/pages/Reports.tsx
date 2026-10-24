import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, DataTable, DateRange, presetRange, money, num, dt, StateBadge, Err, useForm, useUrlInit } from "../ui";

const qs = (o: Record<string, any>) => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined)));

export function SportsbookReport() {
  const [range, setRange] = useState(useUrlInit().range("month"));
  const [rows, setRows] = useState<any[]>([]); const [e, setE] = useState("");
  useEffect(() => { api(`/admin/reports/sportsbook?${qs(range)}`).then(setRows).catch((x) => setE(x.message)); }, [range]);
  const tot = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return (
    <>
      <div className="mb-3 flex justify-end"><DateRange value={range} onChange={setRange} /></div>
      <Err e={e} />
      <Panel title={`Sportsbook Raporu · GGR ${money(tot("ggr"))} · Marj ${tot("stake") - tot("open") ? ((tot("ggr") / (tot("stake") - tot("open"))) * 100).toFixed(2) : "0.00"}%`}>
        <DataTable rows={rows} rowKey={(r) => r.day} csvName="sportsbook_raporu" search={false} pageSize={50} cols={[
          { key: "day", label: "Gün" }, { key: "bets", label: "Kupon", sum: true, align: "right" }, { key: "players", label: "Oyuncu", align: "right" },
          { key: "stake", label: "Yatırılan", money: true, sum: true }, { key: "liveStake", label: "Canlı Yatırılan", money: true, sum: true },
          { key: "bonusStake", label: "Bonuslu Yatırılan", money: true, sum: true }, { key: "open", label: "Açık Kupon", money: true, sum: true },
          { key: "win", label: "Ödenen", money: true, sum: true },
          { key: "ggr", label: "GGR", money: true, sum: true, render: (r) => <span className={r.ggr < 0 ? "text-bo-red" : "text-bo-green"}>{money(r.ggr)}</span> },
          { key: "margin", label: "Marj", value: (r) => (r.stake - r.open ? (r.ggr / (r.stake - r.open)) * 100 : 0), render: (r) => `${(r.stake - r.open ? (r.ggr / (r.stake - r.open)) * 100 : 0).toFixed(2)}%`, align: "right" },
        ]} />
      </Panel>
    </>
  );
}

export function FinancialReport() {
  const [range, setRange] = useState(useUrlInit().range("month"));
  const [d, setD] = useState<any>({ daily: [], bySystem: [] }); const [e, setE] = useState("");
  useEffect(() => { api(`/admin/reports/financial?${qs(range)}`).then(setD).catch((x) => setE(x.message)); }, [range]);
  return (
    <>
      <div className="mb-3 flex justify-end"><DateRange value={range} onChange={setRange} /></div>
      <Err e={e} />
      <Panel title="Günlük Yatırım / Çekim">
        <DataTable rows={d.daily} rowKey={(r) => r.day} csvName="finans_gunluk" search={false} pageSize={50} cols={[
          { key: "day", label: "Gün" }, { key: "deposits", label: "Yatırım", money: true, sum: true }, { key: "depositCount", label: "Yatırım Adedi", sum: true, align: "right" },
          { key: "depositors", label: "Yatırım Yapan", align: "right" }, { key: "withdrawals", label: "Çekim", money: true, sum: true }, { key: "withdrawalCount", label: "Çekim Adedi", sum: true, align: "right" },
          { key: "net", label: "Net", money: true, sum: true, render: (r) => <span className={r.net < 0 ? "text-bo-red" : "text-bo-green"}>{money(r.net)}</span> },
        ]} />
      </Panel>
      <Panel title="Ödeme Sistemi Kırılımı">
        <DataTable rows={d.bySystem} rowKey={(r) => r.paymentSystem + r.type} csvName="finans_odeme_sistemi" search={false} cols={[
          { key: "paymentSystem", label: "Ödeme Sistemi" }, { key: "type", label: "Tip", value: (r) => (r.type === "DEPOSIT" ? "Yatırım" : "Çekim") },
          { key: "count", label: "Adet", sum: true, align: "right" }, { key: "amount", label: "Tutar", money: true },
        ]} />
      </Panel>
    </>
  );
}

export function BonusReport() {
  const U = useUrlInit();
  const [range, setRange] = useState(U.range(U.get("state") ? "all" : "month"));
  const { f, bind } = useForm({ state: U.get("state"), type: U.get("type"), bonusId: U.get("bonusId"), playerId: U.get("playerId") });
  const [rows, setRows] = useState<any[]>([]); const [defs, setDefs] = useState<any[]>([]); const [e, setE] = useState("");
  const load = () => api(`/admin/player-bonuses?${qs({ ...f, ...range, take: 1000 })}`).then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, [range]);
  useEffect(() => { api("/admin/bonuses").then(setDefs).catch(() => {}); }, []);
  return (
    <>
      <Panel title="Filtre">
        <div className="mb-3"><DateRange value={range} onChange={setRange} /></div>
        <div className="flex flex-wrap gap-3">
          <Field label="Durum"><select className="inp w-40" {...bind("state")}><option value="">Tümü</option>{["ACTIVE", "COMPLETED", "EXPIRED", "CANCELED", "LOST"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Tip"><select className="inp w-40" {...bind("type")}><option value="">Tümü</option>{["DEPOSIT", "MANUAL", "FREEBET", "WAGERING"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Bonus"><select className="inp w-56" {...bind("bonusId")}><option value="">Tümü</option>{defs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Oyuncu ID"><input className="inp w-32" {...bind("playerId")} /></Field>
          <div className="flex items-end"><button className="btn-blue w-28" onClick={load}>Uygula</button></div>
        </div>
      </Panel>
      <Panel title="Verilen Bonuslar">
        <Err e={e} />
        <DataTable rows={rows} csvName="bonus_raporu" cols={[
          { key: "id", label: "ID" }, { key: "player", label: "Oyuncu", value: (r) => r.player?.username, render: (r) => <Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.player?.username}</Link> },
          { key: "bonus", label: "Bonus", value: (r) => r.bonus?.name }, { key: "type", label: "Tip", value: (r) => r.bonus?.type },
          { key: "state", label: "Durum", render: (r) => <StateBadge s={r.state} /> }, { key: "amount", label: "Tutar", money: true, sum: true },
          { key: "wagerRequired", label: "Çevrim Şartı", money: true }, { key: "wagerDone", label: "Yapılan Çevrim", money: true },
          { key: "convertedAmount", label: "Ana Paraya Aktarılan", money: true, sum: true },
          { key: "createdAt", label: "Verilme", render: (r) => dt(r.createdAt) }, { key: "expiresAt", label: "Bitiş", render: (r) => dt(r.expiresAt) }, { key: "resultAt", label: "Sonuç", render: (r) => dt(r.resultAt) },
          { key: "grantedByAdminId", label: "Veren Admin" },
        ]} />
        <div className="mt-2 text-bo-muted">Dönüşüm oranı: {(() => { const a = rows.reduce((s, r) => s + Number(r.amount), 0); const c = rows.reduce((s, r) => s + Number(r.convertedAmount), 0); return a ? `${((c / a) * 100).toFixed(1)}%` : "—"; })()} · Kayıt: {num(rows.length)}</div>
      </Panel>
    </>
  );
}
