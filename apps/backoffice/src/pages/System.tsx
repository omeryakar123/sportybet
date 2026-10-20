import { useState } from "react";
import { api } from "../api";
import { Panel, Err } from "../ui";

export default function System() {
  const [msg, setMsg] = useState(""); const [e, setE] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (path: string, confirmText: string) => {
    if (!confirm(confirmText)) return;
    setBusy(true); setE(""); setMsg("");
    try { const r = await api(path, { method: "POST", json: {} }); setMsg(JSON.stringify(r)); } catch (x: any) { setE(x.message); }
    setBusy(false);
  };
  return (
    <Panel title="Demo Veri">
      <p className="mb-3 text-bo-muted">Ekranları dolu görmek için demo oyuncular (btag <b>DEMO</b>), yatırım/çekimler, bonuslar, spor kuponları ve tahmin piyasaları oluşturur. Demo oyuncular gerçek oyuncu gibi raporlara girer. <b>Canlıya geçmeden önce silin.</b></p>
      <div className="flex gap-2">
        <button className="btn-green" disabled={busy} onClick={() => run("/admin/demo/seed", "Demo veri oluşturulsun mu?")}>Demo Veri Oluştur</button>
        <button className="btn bg-bo-red" disabled={busy} onClick={() => run("/admin/demo/purge", "Tüm DEMO oyuncular ve demo piyasalar SİLİNECEK. Emin misiniz?")}>Demo Veriyi Sil</button>
      </div>
      {busy && <p className="mt-3 text-bo-muted">Çalışıyor… (30–60 sn sürebilir)</p>}
      {msg && <pre className="mt-3 rounded bg-bo-head p-2 text-xs">{msg}</pre>}
      <Err e={e} />
    </Panel>
  );
}
