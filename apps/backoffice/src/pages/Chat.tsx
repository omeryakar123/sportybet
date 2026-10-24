import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, DataTable, Tabs, money, dt, Err, Warn } from "../ui";

const ACTION_TR: Record<string, string> = { WARN: "Uyarı", MUTE_10M: "10 dk susturma", MUTE_1H: "1 saat susturma", MUTE_24H: "24 saat susturma", BAN: "Kalıcı men" };
const REASON_TR: Record<string, string> = { PROFANITY: "Küfür / hakaret", BEGGING: "Dilenme", LINK: "Link / reklam", SPAM: "Tekrar (spam)", FLOOD: "Flood" };

function PlayerChatState({ p, onChange }: { p: any; onChange: () => void }) {
  if (!p) return null;
  const muted = p.chatMutedUntil && new Date(p.chatMutedUntil) > new Date();
  const act = async (body: any) => { await api(`/admin/chat/players/${p.id}`, { method: "POST", json: body }); onChange(); };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {p.chatBanned ? <span className="rounded bg-rose-100 px-1.5 text-[11px] text-rose-700">Men</span> : muted ? <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-700" title={dt(p.chatMutedUntil)}>Susturuldu</span> : <span className="rounded bg-emerald-50 px-1.5 text-[11px] text-emerald-700">Aktif</span>}
      <span className="text-[11px] text-bo-muted">ihlal: {p.chatStrikes}</span>
      <button className="rounded bg-bo-orange px-1.5 text-[11px] text-white" onClick={() => act({ muteMinutes: 60 })}>1 sa sustur</button>
      <button className="rounded bg-bo-orange px-1.5 text-[11px] text-white" onClick={() => act({ muteMinutes: 1440 })}>24 sa</button>
      {p.chatBanned ? <button className="rounded bg-bo-green px-1.5 text-[11px] text-white" onClick={() => act({ ban: false, muteMinutes: 0 })}>Meni kaldır</button>
        : <button className="rounded bg-bo-red px-1.5 text-[11px] text-white" onClick={() => act({ ban: true })}>Men et</button>}
      {(muted || p.chatStrikes > 0) && <button className="rounded border border-bo-line px-1.5 text-[11px]" onClick={() => act({ muteMinutes: 0, resetStrikes: true })}>Sıfırla</button>}
    </div>
  );
}

function Messages() {
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState(""); const [pid, setPid] = useState(""); const [e, setE] = useState("");
  const [sys, setSys] = useState("");
  const load = () => api(`/admin/chat/messages?${new URLSearchParams(Object.fromEntries(Object.entries({ q, playerId: pid }).filter(([, v]) => v)))}`).then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, []);
  return (
    <>
      <Panel title="Filtre">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Mesajda ara"><input className="inp" value={q} onChange={(x) => setQ(x.target.value)} /></Field>
          <Field label="Oyuncu ID"><input className="inp" value={pid} onChange={(x) => setPid(x.target.value)} /></Field>
          <div className="flex items-end"><button className="btn-blue w-28" onClick={load}>Uygula</button></div>
        </div>
      </Panel>
      <Panel title="Sistem duyurusu gönder">
        <div className="flex gap-2"><input className="inp" placeholder="ör. Bu akşam 21:00'de ₺5.000 kasa yağmuru!" value={sys} onChange={(x) => setSys(x.target.value)} />
          <button className="btn-green" disabled={!sys.trim()} onClick={async () => { await api("/admin/chat/system", { method: "POST", json: { text: sys } }); setSys(""); load(); }}>Gönder</button></div>
      </Panel>
      <Panel title={`Mesajlar (${rows.length}) · 10 sn'de bir yenilenir`}>
        <Err e={e} />
        <DataTable rows={rows} pageSize={50} csvName="sohbet" cols={[
          { key: "id", label: "ID" }, { key: "createdAt", label: "Zaman", render: (r) => dt(r.createdAt) },
          { key: "player", label: "Oyuncu", value: (r) => r.player?.username ?? "Sistem", render: (r) => r.player ? <Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.player.username}</Link> : <span className="text-bo-muted">Sistem</span> },
          { key: "kind", label: "Tür" },
          { key: "text", label: "Mesaj", className: "max-w-[420px] whitespace-normal", render: (r) => <span className={r.deleted ? "text-bo-muted line-through" : ""}>{r.text}</span> },
          { key: "state", label: "Sohbet durumu", sortable: false, render: (r) => <PlayerChatState p={r.player} onChange={load} /> },
          { key: "act", label: "", sortable: false, render: (r) => !r.deleted && <button className="text-bo-red" onClick={async () => { await api(`/admin/chat/messages/${r.id}/delete`, { method: "POST" }); load(); }}>Sil</button> },
        ]} />
      </Panel>
    </>
  );
}

function Violations() {
  const [rows, setRows] = useState<any[]>([]); const [e, setE] = useState("");
  const load = () => api("/admin/chat/violations").then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, []);
  return (
    <Panel title="Otomatik moderasyonun engellediği mesajlar">
      <Err e={e} />
      <p className="mb-2 text-bo-muted">Bu mesajlar sohbette yayınlanmadı. Ceza kademesi: 1. ihlal 10 dk · 2. ihlal 1 saat · 3–4. ihlal 24 saat · 5. ihlal kalıcı men. Yanlış alarmsa "Sıfırla" ile cezayı kaldırabilirsin.</p>
      <DataTable rows={rows} pageSize={50} csvName="sohbet_ihlalleri" cols={[
        { key: "createdAt", label: "Zaman", render: (r) => dt(r.createdAt) },
        { key: "player", label: "Oyuncu", value: (r) => r.player?.username, render: (r) => <Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.player?.username ?? r.playerId}</Link> },
        { key: "reason", label: "Sebep", value: (r) => REASON_TR[r.reason] ?? r.reason },
        { key: "action", label: "Ceza", value: (r) => ACTION_TR[r.action] ?? r.action },
        { key: "text", label: "Engellenen mesaj", className: "max-w-[420px] whitespace-normal" },
        { key: "state", label: "Şu anki durum", sortable: false, render: (r) => <PlayerChatState p={r.player} onChange={load} /> },
      ]} />
    </Panel>
  );
}

function Rains() {
  const [rows, setRows] = useState<any[]>([]); const [amt, setAmt] = useState("1000"); const [dur, setDur] = useState("60"); const [e, setE] = useState(""); const [msg, setMsg] = useState("");
  const load = () => api("/admin/chat/rains").then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, []);
  return (
    <>
      <Panel title="Kasa yağmuru başlat (etkinlik)">
        <Err e={e} /><span className="text-bo-green">{msg}</span>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Toplam tutar (₺)"><input type="number" className="inp" value={amt} onChange={(x) => setAmt(x.target.value)} /></Field>
          <Field label="Süre (sn, 20–300)"><input type="number" className="inp" value={dur} onChange={(x) => setDur(x.target.value)} /><Warn show={Number(dur) < 20 || Number(dur) > 300}>20–300 sn arası</Warn></Field>
          <div className="flex items-end"><button className="btn-green" disabled={!(Number(amt) > 0) || Number(dur) < 20 || Number(dur) > 300} onClick={async () => { setE(""); setMsg(""); try { await api("/admin/chat/rain", { method: "POST", json: { amount: Number(amt), durationSec: Number(dur) } }); setMsg("Yağmur başladı ✓"); load(); } catch (x: any) { setE(x.message); } }}>Yağmuru Başlat</button></div>
        </div>
        <p className="mt-2 text-bo-muted">Tutar kasadan karşılanır ve süre sonunda "Katıl" diyen uygun oyunculara eşit dağıtılır (ayarlardaki katılım şartları geçerli). İşlemler oyuncuların işlem geçmişine "Yağmur Payı" olarak yazılır.</p>
      </Panel>
      <Panel title="Yağmur geçmişi">
        <DataTable rows={rows} pageSize={30} csvName="yagmurlar" expand={(r) => <div className="flex flex-wrap gap-2">{r.entries.map((x: any) => <span key={x.playerId} className="rounded bg-bo-head px-2 py-0.5"><Link className="text-bo-blue" to={`/players/${x.playerId}`}>{x.username}</Link> {x.amount != null ? money(x.amount) : ""}</span>)}</div>} cols={[
          { key: "id", label: "ID" }, { key: "createdAt", label: "Başlangıç", render: (r) => dt(r.createdAt) },
          { key: "host", label: "Başlatan", value: (r) => r.host },
          { key: "amount", label: "Tutar", money: true, sum: true },
          { key: "joinCount", label: "Katılım" }, { key: "share", label: "Kişi başı", money: true },
          { key: "state", label: "Durum" },
        ]} />
      </Panel>
    </>
  );
}

function Settings() {
  const [c, setC] = useState<any>(null); const [e, setE] = useState(""); const [msg, setMsg] = useState(""); const [words, setWords] = useState("");
  useEffect(() => { api("/admin/chat/config").then((r) => { setC(r); setWords((r.extraBannedWords ?? []).join(", ")); }).catch((x) => setE(x.message)); }, []);
  if (!c) return <Panel title="Ayarlar"><Err e={e} />Yükleniyor…</Panel>;
  const set = (k: string, v: any) => setC({ ...c, [k]: v });
  const setR = (k: string, v: any) => setC({ ...c, rain: { ...c.rain, [k]: v } });
  const setT = (k: string, v: any) => setC({ ...c, tip: { ...c.tip, [k]: v } });
  const n = (v: any) => Number(v);
  const bad = n(c.rain.minAmount) > n(c.rain.maxAmount) || n(c.tip.minAmount) > n(c.tip.maxAmount);
  async function save() {
    setE(""); setMsg("");
    try {
      const body = { ...c, maxLen: n(c.maxLen), slowModeSec: n(c.slowModeSec), minAccountHours: n(c.minAccountHours), extraBannedWords: words.split(",").map((w) => w.trim()).filter(Boolean),
        rain: { ...c.rain, minAmount: n(c.rain.minAmount), maxAmount: n(c.rain.maxAmount), durationSec: n(c.rain.durationSec), minShare: n(c.rain.minShare), joinMinAccountHours: n(c.rain.joinMinAccountHours) },
        tip: { ...c.tip, minAmount: n(c.tip.minAmount), maxAmount: n(c.tip.maxAmount), dailyMax: n(c.tip.dailyMax) } };
      const r = await api("/admin/chat/config", { method: "PUT", json: body }); setC(r); setMsg("Kaydedildi ✓");
    } catch (x: any) { setE(x.message); }
  }
  const chk = (label: string, v: boolean, on: (b: boolean) => void) => <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={!!v} onChange={(x) => on(x.target.checked)} />{label}</label>;
  return (
    <Panel title="Sohbet ayarları" right={<button className="btn-green" disabled={bad} onClick={save}>Kaydet</button>}>
      <Err e={e} /><span className="text-bo-green">{msg}</span>
      <div className="mb-2 font-medium">Genel</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {chk("Sohbet açık", c.enabled, (b) => set("enabled", b))}
        <Field label="Azami mesaj uzunluğu"><input type="number" className="inp" value={c.maxLen} onChange={(x) => set("maxLen", x.target.value)} /></Field>
        <Field label="Yavaş mod (sn)"><input type="number" className="inp" value={c.slowModeSec} onChange={(x) => set("slowModeSec", x.target.value)} /></Field>
        <Field label="Yazmak için hesap yaşı (saat)"><input type="number" className="inp" value={c.minAccountHours} onChange={(x) => set("minAccountHours", x.target.value)} /></Field>
        {chk("Yazmak için yatırım şartı", c.requireDeposit, (b) => set("requireDeposit", b))}
      </div>
      <Field label="Ek yasaklı kelimeler (virgülle) — yerleşik küfür/dilenme/link filtresine ek olarak" className="mt-3"><textarea className="inp h-16 py-1" value={words} onChange={(x) => setWords(x.target.value)} placeholder="ör. rakipsite, kelime2" /></Field>
      <div className="mb-2 mt-4 font-medium">Yağmur</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {chk("Oyuncu yağmuru açık", c.rain.enabled, (b) => setR("enabled", b))}
        <Field label="Min tutar (₺)"><input type="number" className="inp" value={c.rain.minAmount} onChange={(x) => setR("minAmount", x.target.value)} /></Field>
        <Field label="Maks tutar (₺)"><input type="number" className="inp" value={c.rain.maxAmount} onChange={(x) => setR("maxAmount", x.target.value)} /><Warn show={n(c.rain.minAmount) > n(c.rain.maxAmount)}>Maks, min'den küçük olamaz</Warn></Field>
        <Field label="Süre (sn)"><input type="number" className="inp" value={c.rain.durationSec} onChange={(x) => setR("durationSec", x.target.value)} /></Field>
        <Field label="Kişi başı min pay (₺)"><input type="number" className="inp" value={c.rain.minShare} onChange={(x) => setR("minShare", x.target.value)} /></Field>
        <Field label="Katılım: hesap yaşı (saat)"><input type="number" className="inp" value={c.rain.joinMinAccountHours} onChange={(x) => setR("joinMinAccountHours", x.target.value)} /></Field>
        {chk("Katılım için yatırım şartı (çoklu hesap önlemi)", c.rain.joinRequireDeposit, (b) => setR("joinRequireDeposit", b))}
      </div>
      <div className="mb-2 mt-4 font-medium">Bahşiş</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {chk("Bahşiş açık", c.tip.enabled, (b) => setT("enabled", b))}
        <Field label="Min (₺)"><input type="number" className="inp" value={c.tip.minAmount} onChange={(x) => setT("minAmount", x.target.value)} /></Field>
        <Field label="Maks (₺)"><input type="number" className="inp" value={c.tip.maxAmount} onChange={(x) => setT("maxAmount", x.target.value)} /><Warn show={n(c.tip.minAmount) > n(c.tip.maxAmount)}>Maks, min'den küçük olamaz</Warn></Field>
        <Field label="Günlük azami (₺)"><input type="number" className="inp" value={c.tip.dailyMax} onChange={(x) => setT("dailyMax", x.target.value)} /></Field>
        {chk("Göndermek için yatırım şartı", c.tip.requireDeposit, (b) => setT("requireDeposit", b))}
      </div>
    </Panel>
  );
}

export default function Chat() {
  const TABS = ["Mesajlar", "Engellenenler", "Yağmurlar", "Ayarlar"] as const;
  const [t, setT] = useState<(typeof TABS)[number]>("Mesajlar");
  return (
    <>
      <div className="mb-3"><Tabs tabs={TABS} value={t} onChange={setT} /></div>
      {t === "Mesajlar" ? <Messages /> : t === "Engellenenler" ? <Violations /> : t === "Yağmurlar" ? <Rains /> : <Settings />}
    </>
  );
}
