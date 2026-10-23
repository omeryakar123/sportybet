import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, dt, Err } from "../ui";

/**
 * Trading — kendi sportsbook motorumuz (API-Football beslemeli).
 * Feed durumu, marj/lig ayarları, maç listesi (bahise aç/kapa), manuel sonuçlandırma, senkron tetikleyiciler.
 */
export default function Trading() {
  const [tab, setTab] = useState<"events" | "config">("events");
  return (
    <>
      <div className="mb-3 flex gap-2">
        <button className={tab === "events" ? "btn-blue" : "btn-ghost"} onClick={() => setTab("events")}>Maçlar</button>
        <button className={tab === "config" ? "btn-blue" : "btn-ghost"} onClick={() => setTab("config")}>Ayarlar & Feed</button>
      </div>
      {tab === "events" ? <Events /> : <Config />}
    </>
  );
}

function Events() {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ settled: "false" });
  const [e, setE] = useState("");
  const [settle, setSettle] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/admin/sb/events?settled=${f.settled}&take=300`).then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, [f.settled]);

  const toggle = async (id: number, isOpen: boolean) => { await api(`/admin/sb/events/${id}/toggle`, { method: "POST", json: { isOpen } }); load(); };
  async function doSettle() {
    setBusy(true); setE("");
    try { await api(`/admin/sb/events/${settle.id}/settle`, { method: "POST", json: { home: Number(settle.home), away: Number(settle.away), void: !!settle.void } }); setSettle(null); load(); }
    catch (x: any) { setE(x.message); }
    setBusy(false);
  }
  async function sync(path: string) { setBusy(true); try { await api(`/admin/sb/${path}`, { method: "POST" }); load(); } catch (x: any) { setE(x.message); } setBusy(false); }

  return (
    <Panel title="Maçlar (Trading)" right={<div className="flex gap-2">
      <select className="inp" value={f.settled} onChange={(ev) => setF({ settled: ev.target.value })}><option value="false">Açık / Bekleyen</option><option value="true">Sonuçlanan</option><option value="">Hepsi</option></select>
      <button className="btn-ghost" disabled={busy} onClick={() => sync("sync")}>↻ Program+Oran Çek</button>
      <button className="btn-ghost" disabled={busy} onClick={() => sync("sync-results")}>✓ Sonuçları Çek</button>
    </div>}>
      <Err e={e} />
      <DataTable rows={rows} csvName="sb_events" cols={[
        { key: "startsAt", label: "Başlangıç", render: (r) => dt(r.startsAt) },
        { key: "league", label: "Lig" },
        { key: "match", label: "Maç", value: (r) => `${r.home} - ${r.away}` },
        { key: "status", label: "Durum", render: (r) => <span className="font-mono text-xs">{r.status}{r.minute ? ` ${r.minute}'` : ""}</span> },
        { key: "score", label: "Skor", value: (r) => (r.homeGoals == null ? "" : `${r.homeGoals}-${r.awayGoals}`) },
        { key: "mk", label: "Market", value: (r) => (r.markets?.length ?? 0) + " market", render: (r) => <span>{(r.markets ?? []).map((m: any) => m.key).join(", ") || "—"}</span> },
        { key: "isOpen", label: "Bahis", render: (r) => <span className={r.settledAt ? "text-bo-muted" : r.isOpen ? "text-bo-green" : "text-bo-red"}>{r.settledAt ? "Sonuçlandı" : r.isOpen ? "Açık" : "Kapalı"}</span> },
        { key: "x", label: "", sortable: false, render: (r) => r.settledAt ? null : (
          <div className="flex gap-2">
            <button className="text-bo-blue" onClick={() => toggle(r.id, !r.isOpen)}>{r.isOpen ? "Kapat" : "Aç"}</button>
            <button className="text-bo-blue" onClick={() => setSettle({ id: r.id, label: `${r.home} - ${r.away}`, home: r.homeGoals ?? 0, away: r.awayGoals ?? 0 })}>Sonuçlandır</button>
          </div>
        ) },
      ]} />
      <p className="mt-2 text-bo-muted">Oranlar API-Football'dan otomatik senkronlanır; sonuçlar maç bitince otomatik işlenir. Feed gecikirse buradan manuel skor girip sonuçlandırabilirsin.</p>

      {settle && <Modal title={`Manuel Sonuçlandır — ${settle.label}`} onClose={() => setSettle(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ev sahibi gol"><input type="number" className="inp" value={settle.home} onChange={(e) => setSettle({ ...settle, home: e.target.value })} /></Field>
          <Field label="Deplasman gol"><input type="number" className="inp" value={settle.away} onChange={(e) => setSettle({ ...settle, away: e.target.value })} /></Field>
          <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={!!settle.void} onChange={(e) => setSettle({ ...settle, void: e.target.checked })} />Maç iptal → tüm kuponlar iade edilsin</label>
        </div>
        <Err e={e} />
        <div className="mt-4 flex justify-end"><button className="btn-green" disabled={busy} onClick={doSettle}>Sonuçlandır & Kuponları Öde</button></div>
      </Modal>}
    </Panel>
  );
}

function Config() {
  const [cfg, setCfg] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [e, setE] = useState(""); const [msg, setMsg] = useState("");
  const [nl, setNl] = useState({ id: "", name: "" });
  useEffect(() => { api("/admin/sb/config").then(setCfg).catch((x) => setE(x.message)); api("/admin/sb/status").then(setStatus).catch(() => {}); }, []);
  if (!cfg) return <Panel title="Ayarlar"><Err e={e} />Yükleniyor…</Panel>;
  async function save() { setE(""); setMsg(""); try { const r = await api("/admin/sb/config", { method: "PUT", json: { enabled: cfg.enabled, marginPct: Number(cfg.marginPct), maxStake: Number(cfg.maxStake), maxWin: Number(cfg.maxWin), maxSelections: Number(cfg.maxSelections), syncDays: Number(cfg.syncDays), leagues: cfg.leagues } }); setCfg(r); setMsg("Kaydedildi ✓"); } catch (x: any) { setE(x.message); } }
  const addLeague = () => { if (!nl.id || !nl.name) return; setCfg({ ...cfg, leagues: [...cfg.leagues, { id: Number(nl.id), name: nl.name }] }); setNl({ id: "", name: "" }); };

  return (
    <>
      <Panel title="Feed Durumu (API-Football)">
        {status ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div><div className="text-bo-muted text-xs">Bağlantı</div><div className={status.configured ? "text-bo-green font-bold" : "text-bo-red font-bold"}>{status.configured ? "Bağlı" : "APISPORTS_KEY yok"}</div></div>
            <div><div className="text-bo-muted text-xs">Plan</div><div className="font-bold">{status.feed?.subscription?.plan ?? "—"}</div></div>
            <div><div className="text-bo-muted text-xs">Bugünkü istek</div><div className="font-bold">{status.feed?.requests?.current ?? status.usage?.count ?? "—"} / {status.feed?.requests?.limit_day ?? "—"}</div></div>
            <div><div className="text-bo-muted text-xs">Hesap</div><div className="font-bold">{status.feed?.account?.email ?? "—"}</div></div>
          </div>
        ) : <span className="text-bo-muted">Durum yükleniyor…</span>}
      </Panel>

      <Panel title="Sportsbook Ayarları" right={<button className="btn-green" onClick={save}>Kaydet</button>}>
        <Err e={e} /><span className="text-bo-green">{msg}</span>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />Sportsbook aktif</label>
          <Field label="Marj %  (oranlardan düşülür)"><input type="number" className="inp" value={cfg.marginPct} onChange={(e) => setCfg({ ...cfg, marginPct: e.target.value })} /></Field>
          <Field label="İleri senkron (gün)"><input type="number" className="inp" value={cfg.syncDays} onChange={(e) => setCfg({ ...cfg, syncDays: e.target.value })} /></Field>
          <Field label="Azami bahis (₺)"><input type="number" className="inp" value={cfg.maxStake} onChange={(e) => setCfg({ ...cfg, maxStake: e.target.value })} /></Field>
          <Field label="Azami kazanç (₺)"><input type="number" className="inp" value={cfg.maxWin} onChange={(e) => setCfg({ ...cfg, maxWin: e.target.value })} /></Field>
          <Field label="Kombinede azami maç"><input type="number" className="inp" value={cfg.maxSelections} onChange={(e) => setCfg({ ...cfg, maxSelections: e.target.value })} /></Field>
        </div>
        <div className="mt-4">
          <div className="mb-2 font-semibold">Ligler (API-Football lig id'leri)</div>
          <div className="flex flex-wrap gap-2">
            {cfg.leagues.map((l: any, i: number) => (
              <span key={l.id} className="flex items-center gap-2 rounded border border-bo-line bg-bo-head px-2 py-1 text-sm"><b>{l.name}</b> <span className="text-bo-muted">#{l.id}</span><button className="text-bo-red" onClick={() => setCfg({ ...cfg, leagues: cfg.leagues.filter((_: any, j: number) => j !== i) })}>✕</button></span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="inp w-24" placeholder="Lig id" value={nl.id} onChange={(e) => setNl({ ...nl, id: e.target.value })} />
            <input className="inp w-56" placeholder="Lig adı" value={nl.name} onChange={(e) => setNl({ ...nl, name: e.target.value })} />
            <button className="btn-blue" onClick={addLeague}>Lig Ekle</button>
          </div>
          <p className="mt-2 text-bo-muted">Yaygın id'ler: 203 Süper Lig · 39 Premier League · 140 La Liga · 135 Serie A · 78 Bundesliga · 61 Ligue 1 · 2 Şampiyonlar Ligi · 3 Avrupa Ligi. Tümünü dashboard.api-football.com'da bulursun.</p>
        </div>
      </Panel>
    </>
  );
}
