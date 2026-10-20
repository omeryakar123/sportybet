import { useEffect, useState } from "react";
import { api } from "../api";
import { DateRange, Kpi, Panel, presetRange, money, num, pct, Err } from "../ui";

export default function Dashboard() {
  const [range, setRange] = useState(presetRange("today"));
  const [d, setD] = useState<any>(null); const [e, setE] = useState("");
  useEffect(() => { setE(""); api(`/admin/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`).then(setD).catch((x) => setE(x.message)); }, [range]);
  const k = d?.kpi ?? {};
  const sb = d?.sportsbook;
  const row = (label: string, key: string, f: (v: any) => string, colorize = false) => (
    <tr key={key}>
      <td className="border-l-2 border-bo-blue">{label}</td>
      {["prematch", "live", "total"].map((c) => {
        const v = sb?.[c]?.[key];
        const cls = colorize ? (Number(v) < 0 ? "bg-rose-50" : Number(v) > 0 ? "bg-emerald-50" : "") : "";
        return <td key={c} className={`text-right ${cls} ${c === "total" && !colorize ? "text-bo-blue" : ""}`}>{f(v)}</td>;
      })}
    </tr>
  );
  return (
    <>
      <div className="mb-3 flex justify-end"><DateRange value={range} onChange={setRange} /></div>
      <Err e={e} />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Toplam Yatırım" value={money(k.deposits)} icon="⬇" color="teal" />
        <Kpi label="Toplam Çekim" value={money(k.withdrawals)} icon="⬆" color="bo-red" />
        <Kpi label="Giriş Yapan Oyuncu" value={num(k.playersLoggedIn)} icon="👤" color="bo-orange" />
        <Kpi label="Toplam Giriş" value={num(k.loginCount)} icon="➜" color="lime" />
        <Kpi label="Yeni Kayıt" value={num(k.playersRegistered)} icon="＋" color="bo-green" />
        <Kpi label="Oyuncu Bakiyesi" value={money(k.playersBalance)} icon="💵" color="bo-purple" />
        <Kpi label="Kâr (Yatırım − Çekim)" value={money(k.profit)} icon="📈" color="bo-green" />
        <Kpi label="Yatırım Yapan Oyuncu" value={num(k.playersMakingDeposit)} icon="⬇" color="bo-blue" />
        <Kpi label="Çekim Yapan Oyuncu" value={num(k.playersMakingWithdrawal)} icon="⬆" color="bo-orange" />
        <Kpi label="Bonus Bakiyesi" value={money(k.bonusBalance)} icon="🎁" color="bo-purple" />
        <Kpi label="Düzeltme (+)" value={money(k.correctionUp)} icon="✚" color="bo-red" />
        <Kpi label="Düzeltme (−)" value={money(k.correctionDown)} icon="✖" color="teal" />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Sportsbook Özeti">
          <table className="tbl">
            <thead><tr><th></th><th className="text-right">Maç Öncesi</th><th className="text-right">Canlı</th><th className="text-right">Toplam</th></tr></thead>
            <tbody>
              {row("Ciro (Turnover)", "turnover", money)}
              {row("Ödenen Kazanç", "winning", money)}
              {row("Açık Bahisler", "openBets", money)}
              {row("GGR", "ggr", money, true)}
              {row("Kârlılık", "profitability", pct, true)}
              {row("Bahis Sayısı", "bets", (v) => num(v))}
              {row("Ortalama Bahis", "avgBet", money)}
              {row("Oyuncu Başına Bahis", "betPerPlayer", (v) => num(v, 1))}
              {row("Oyuncu Sayısı", "players", (v) => num(v))}
            </tbody>
          </table>
          <div className="mt-2 flex justify-between bg-bo-head px-3 py-2 text-xs">
            <span>TEKLİ: {sb?.types?.SINGLE ?? 0}</span><span>KOMBİNE: {sb?.types?.MULTIPLE ?? 0}</span><span>SİSTEM: {sb?.types?.SYSTEM ?? "—"}</span>
          </div>
        </Panel>

        <Panel title="Bonus Özeti">
          <table className="tbl">
            <thead><tr><th>Tip</th><th>Ürün</th><th className="text-right">Verilen</th><th className="text-right">Oyuncu</th><th className="text-right">Dönüşen (Ana Paraya)</th></tr></thead>
            <tbody>
              {(d?.bonus ?? []).length === 0 && <tr><td colSpan={5} className="py-6 text-center text-bo-muted">Görüntülenecek veri yok</td></tr>}
              {(d?.bonus ?? []).map((b: any) => <tr key={b.type + b.product}><td className="border-l-2 border-bo-blue">{b.type}</td><td>{b.product}</td><td className="text-right">{money(b.awarded)}</td><td className="text-right">{b.players}</td><td className="text-right">{money(b.converted)}</td></tr>)}
            </tbody>
            {(d?.bonus ?? []).length > 0 && <tfoot><tr className="bg-bo-head font-medium"><td className="px-3 py-2">TOPLAM</td><td /><td className="px-3 text-right">{money(d.bonus.reduce((a: number, b: any) => a + b.awarded, 0))}</td><td className="px-3 text-right">{d.bonus.reduce((a: number, b: any) => a + b.players, 0)}</td><td className="px-3 text-right">{money(d.bonus.reduce((a: number, b: any) => a + b.converted, 0))}</td></tr></tfoot>}
          </table>
        </Panel>
      </div>

      <Panel title="En Çok Oynanan 5 Spor">
        {(d?.topSports ?? []).length === 0 ? <div className="py-6 text-center text-bo-muted">Görüntülenecek veri yok</div> : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {d.topSports.map((s: any) => {
              const margin = s.bet ? (s.profit / s.bet) * 100 : 0;
              const color = margin >= 0 ? "#2a8bd8" : "#e5534b";
              const deg = Math.min(100, Math.abs(margin)) * 3.6;
              return (
                <div key={s.sport} className="text-center">
                  <div className="mb-2 font-medium">{s.sport}</div>
                  <div className="mx-auto grid size-24 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${deg}deg, #e3e8ef 0)` }}>
                    <div className="grid size-20 place-items-center rounded-full bg-white text-lg" style={{ color }}>{margin.toFixed(0)}%</div>
                  </div>
                  <div className="mt-2 text-xs">Bahis<br /><b>{money(s.bet)}</b></div>
                  <div className="mt-1 text-xs">Kazanç<br /><b>{money(s.win)}</b></div>
                  <div className="mt-1 text-xs">Kâr<br /><b className={s.profit < 0 ? "text-bo-red" : "text-bo-green"}>{money(s.profit)}</b></div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
