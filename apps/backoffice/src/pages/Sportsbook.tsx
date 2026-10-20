import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { Panel, money, dt } from "../ui";

const TABS = ["Durum & Bakiye", "Bakiye Hareketleri", "Platform İşlemleri", "Cüzdan Çağrıları", "Webhooklar"] as const;

export default function Sportsbook() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Durum & Bakiye");
  return (
    <>
      <div className="mb-3 flex gap-1 border-b border-bo-line">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 ${tab === t ? "border-b-2 border-bo-blue text-bo-blue" : ""}`}>{t}</button>)}
      </div>
      {tab === "Durum & Bakiye" && <Status />}
      {tab === "Bakiye Hareketleri" && <Ledger />}
      {tab === "Platform İşlemleri" && <ProviderTx />}
      {tab === "Cüzdan Çağrıları" && <WalletRequests />}
      {tab === "Webhooklar" && <Webhooks />}
    </>
  );
}

function Err({ e }: { e: string }) { return e ? <div className="mb-2 rounded bg-bo-red/10 p-2 text-bo-red">{e}</div> : null; }

function Status() {
  const [s, setS] = useState<any>(null); const [e, setE] = useState("");
  useEffect(() => { api("/admin/sportsbook/status").then(setS).catch((x) => setE(x.message)); }, []);
  if (!s) return <Err e={e} />;
  const b = s.billing; const statusColor = { ok: "text-bo-green", low: "text-bo-orange", exhausted: "text-bo-red" } as any;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Entegrasyon">
        <table className="tbl"><tbody>
          <tr><td>API anahtarı / secret</td><td>{s.configured ? <span className="text-bo-green">Tanımlı</span> : <span className="text-bo-red">Eksik (SPORTSBOOK_API_KEY / SECRET)</span>}</td></tr>
          <tr><td>Cüzdan imza anahtarı</td><td>{s.walletSecretSet ? <span className="text-bo-green">Tanımlı</span> : <span className="text-bo-red">Eksik (SPORTSBOOK_WALLET_SECRET)</span>}</td></tr>
          {s.me && !s.me.error && <>
            <tr><td>Partner</td><td>{s.me.name} ({s.me.slug})</td></tr>
            <tr><td>Swarm site ID</td><td>{s.me.swarm_site_id}</td></tr>
            <tr><td>İzinli domainler</td><td>{(s.me.allowed_domains ?? []).join(", ")}</td></tr>
            <tr><td>Webhook URL</td><td>{s.me.webhook_url}</td></tr>
          </>}
          {s.me?.error && <tr><td>Platform bağlantısı</td><td className="text-bo-red">{s.me.error}</td></tr>}
        </tbody></table>
      </Panel>
      <Panel title="Platform Bakiyesi (GGR)">
        {b && !b.error ? (
          <>
            <div className="mb-3 grid grid-cols-3 gap-3">
              <div className="panel p-3"><div className="text-bo-muted">Bakiye</div><div className="text-lg">{money(b.balance)}</div></div>
              <div className="panel p-3"><div className="text-bo-muted">Ayrılan</div><div className="text-lg">{money(b.reserved)}</div></div>
              <div className="panel p-3"><div className="text-bo-muted">Kullanılabilir</div><div className="text-lg">{money(b.available)}</div></div>
            </div>
            <table className="tbl"><tbody>
              <tr><td>Durum</td><td className={statusColor[b.status]}>{b.status}</td></tr>
              <tr><td>GGR oranı</td><td>%{b.ggr_rate}</td></tr>
              <tr><td>Kredi limiti</td><td>{b.credit_limit === null ? "Sınırsız" : money(b.credit_limit)}</td></tr>
              <tr><td>Düşük bakiye eşiği</td><td>{money(b.low_balance_threshold)}</td></tr>
              <tr><td>Bu ay kupon</td><td>{b.period?.bets}</td></tr>
              <tr><td>Bu ay komisyon</td><td>{money(b.period?.commission)}</td></tr>
              <tr><td>Bu ay yükleme</td><td>{money(b.period?.topups)}</td></tr>
            </tbody></table>
            {b.period?.by_currency?.length > 0 && <table className="tbl mt-3"><thead><tr><th>Para</th><th>Kupon</th><th>Yatırılan</th><th>Ödenen</th><th>GGR</th><th>Komisyon</th></tr></thead>
              <tbody>{b.period.by_currency.map((c: any) => <tr key={c.currency}><td>{c.currency}</td><td>{c.bets}</td><td>{money(c.stake)}</td><td>{money(c.payout)}</td><td>{money(c.ggr)}</td><td>{money(c.commission)}</td></tr>)}</tbody></table>}
          </>
        ) : <div className="text-bo-muted">{b?.error ?? "Platform bilgisi alınamadı."}</div>}
      </Panel>
    </div>
  );
}

function useCursorList(path: string, params: Record<string, string>) {
  const [rows, setRows] = useState<any[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [e, setE] = useState("");
  const load = async (more = false) => {
    setE("");
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), limit: "100", ...(more && cursor ? { cursor } : {}) });
    try { const r = await api(`${path}?${q}`); setRows(more ? [...rows, ...r.data] : r.data); setCursor(r.next_cursor); } catch (x: any) { setE(x.message); }
  };
  return { rows, cursor, e, load };
}

function Ledger() {
  const [type, setType] = useState(""); const l = useCursorList("/admin/sportsbook/ledger", { type });
  useEffect(() => { l.load(); }, []);
  return (
    <Panel title="Platform Bakiye Hareketleri" right={<div className="flex gap-2"><select className="inp w-40" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tümü</option><option value="topup">Yükleme</option><option value="adjustment">Düzeltme</option><option value="ggr">GGR komisyonu</option></select><button className="btn-blue" onClick={() => l.load()}>Uygula</button></div>}>
      <Err e={l.e} />
      <table className="tbl"><thead><tr><th>Zaman</th><th>Tip</th><th>Tutar</th><th>Sonraki Bakiye</th><th>Kupon</th><th>Yatırılan</th><th>Ödenen</th><th>GGR</th><th>Not</th></tr></thead>
        <tbody>{l.rows.map((r) => <tr key={r.id}><td>{dt(r.occurred_at)}</td><td>{r.type}</td><td className={r.amount < 0 ? "text-bo-red" : "text-bo-green"}>{money(r.amount)}</td><td>{money(r.balance_after)}</td><td>{r.coupon_id}</td><td>{r.stake != null && money(r.stake)}</td><td>{r.payout != null && money(r.payout)}</td><td>{r.ggr != null && money(r.ggr)}</td><td>{r.note}</td></tr>)}</tbody></table>
      {l.cursor && <button className="btn-ghost mt-3" onClick={() => l.load(true)}>Daha fazla</button>}
    </Panel>
  );
}

function ProviderTx() {
  const [f, setF] = useState({ type: "", status: "", external_user_id: "", bet_id: "" }); const l = useCursorList("/admin/sportsbook/transactions", f);
  useEffect(() => { l.load(); }, []);
  return (
    <Panel title="Platformun Cüzdana Gönderdiği İşlemler (mutabakat)">
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="inp w-36" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Tüm tipler</option><option>debit</option><option>credit</option><option>rollback</option></select>
        <select className="inp w-36" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Tüm durumlar</option><option>pending</option><option>success</option><option>failed</option></select>
        <input className="inp w-40" placeholder="Oyuncu ID" value={f.external_user_id} onChange={(e) => setF({ ...f, external_user_id: e.target.value })} />
        <input className="inp w-48" placeholder="Bet / kupon ID" value={f.bet_id} onChange={(e) => setF({ ...f, bet_id: e.target.value })} />
        <button className="btn-blue" onClick={() => l.load()}>Uygula</button>
      </div>
      <Err e={l.e} />
      <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Zaman</th><th>Transaction ID</th><th>Tip</th><th>Durum</th><th>Tutar</th><th>Oyuncu</th><th>Kupon</th><th>Hata</th></tr></thead>
        <tbody>{l.rows.map((r) => <tr key={r.id}><td>{dt(r.created_at)}</td><td className="font-mono text-xs">{r.transaction_id}</td><td>{r.type}</td><td className={r.status === "success" ? "text-bo-green" : r.status === "failed" ? "text-bo-red" : "text-bo-orange"}>{r.status}</td><td>{money(r.amount)}</td><td>{r.external_user_id}</td><td>{r.coupon_id}</td><td className="text-bo-red">{r.error}</td></tr>)}</tbody></table></div>
      {l.cursor && <button className="btn-ghost mt-3" onClick={() => l.load(true)}>Daha fazla</button>}
    </Panel>
  );
}

function WalletRequests() {
  const [f, setF] = useState({ kind: "", status: "", playerId: "" }); const [rows, setRows] = useState<any[]>([]);
  const load = () => api(`/admin/wallet-requests?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <Panel title="Bizim Cüzdanımıza Gelen Çağrılar (/debit /credit /rollback)">
      <div className="mb-3 flex gap-2">
        <select className="inp w-36" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Tümü</option><option>debit</option><option>credit</option><option>rollback</option></select>
        <select className="inp w-36" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Tüm durumlar</option><option>SUCCESS</option><option>REJECTED</option></select>
        <input className="inp w-36" placeholder="Oyuncu ID" value={f.playerId} onChange={(e) => setF({ ...f, playerId: e.target.value })} />
        <button className="btn-blue" onClick={load}>Uygula</button>
      </div>
      <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Zaman</th><th>Transaction ID</th><th>Tip</th><th>Durum</th><th>Oyuncu</th><th>Tutar</th><th>Ana</th><th>Bonus</th><th>Kupon</th><th>Sebep</th><th>İade</th><th>Cevap</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{dt(r.createdAt)}</td><td className="font-mono text-xs">{r.transactionId}</td><td>{r.kind}</td><td className={r.status === "SUCCESS" ? "text-bo-green" : "text-bo-red"}>{r.status}</td><td>{r.playerId}</td><td>{money(r.amount)}</td><td>{money(r.fromMain)}</td><td>{money(r.fromBonus)}</td><td>{r.couponId}</td><td>{r.reason}</td><td>{r.refunded ? "Evet" : ""}</td><td className="font-mono text-xs">{r.response?.error_code ?? (r.response?.balance_after !== undefined ? `bal ${r.response.balance_after}` : "")}</td></tr>)}</tbody></table></div>
    </Panel>
  );
}

function Webhooks() {
  const [rows, setRows] = useState<any[]>([]); const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api("/admin/webhook-events").then(setRows).catch(() => {}); }, []);
  return (
    <Panel title="Gelen Webhooklar">
      <table className="tbl"><thead><tr><th>Zaman</th><th>Olay</th><th>Webhook ID</th><th>Kupon</th><th>Hata</th><th></th></tr></thead>
        <tbody>{rows.map((r) => <Fragment key={r.webhookId}>
          <tr><td>{dt(r.createdAt)}</td><td>{r.event}</td><td className="font-mono text-xs">{r.webhookId}</td><td>{r.payload?.data?.coupon_id}</td><td className="text-bo-red">{r.error}</td><td><button className="text-bo-blue" onClick={() => setOpen(open === r.webhookId ? null : r.webhookId)}>JSON</button></td></tr>
          {open === r.webhookId && <tr key={r.webhookId + "j"}><td colSpan={6}><pre className="max-h-80 overflow-auto bg-bo-head p-2 text-xs">{JSON.stringify(r.payload, null, 2)}</pre></td></tr>}
        </Fragment>)}</tbody></table>
    </Panel>
  );
}
