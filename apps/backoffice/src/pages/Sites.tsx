import { useEffect, useState } from "react";
import { api, setSite } from "../api";
import { Panel, Field, Modal, DataTable, dt, Err } from "../ui";

/**
 * Çoklu site yönetimi (SUPERADMIN):
 * - Yeni site oluştur → ödeme sistemleri + temel CMS ayarları otomatik hazırlanır
 * - Her sitenin kendi domaini ve kendi Betco (spor API) kimliği olabilir; boş bırakılırsa varsayılan (env) kullanılır
 * - Üst bardaki "Site" seçicisiyle backoffice'te siteler arasında geçiş yapılır
 */
export default function Sites() {
  const [rows, setRows] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [e, setE] = useState("");
  const [copied, setCopied] = useState("");
  const load = () => api("/admin/sites").then(setRows).catch((x) => setE(x.message));
  useEffect(() => { load(); }, []);

  const copy = async (text: string, tag: string) => { try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(""), 1500); } catch {} };

  async function save() {
    setE("");
    try {
      const { id, code, name, domain, isActive, note, sbApiUrl, sbApiKey, sbApiSecret, sbWalletSecret } = edit;
      const json: any = { name, domain: domain || null, isActive, note: note || null, sbApiUrl: sbApiUrl || null, sbApiKey, sbApiSecret, sbWalletSecret };
      if (id) await api(`/admin/sites/${id}`, { method: "PATCH", json });
      else await api("/admin/sites", { method: "POST", json: { ...json, code } });
      setEdit(null); load();
    } catch (x: any) { setE(x.message === "ALREADY_EXISTS" ? "Bu kod veya domain zaten kayıtlı" : x.message); }
  }

  return (
    <>
      <Panel title="Siteler" right={<button className="btn-green" onClick={() => setEdit({ code: "", name: "", domain: "", isActive: true, note: "", sbApiUrl: "", sbApiKey: "", sbApiSecret: "", sbWalletSecret: "" })}>+ Yeni Site Oluştur</button>}>
        <Err e={e} />
        <DataTable rows={rows} search={false} csvName="sites" cols={[
          { key: "id", label: "ID" },
          { key: "code", label: "Kod", className: "font-mono" },
          { key: "name", label: "Site Adı" },
          { key: "domain", label: "Domain", render: (r) => r.domain ? <a className="text-bo-blue hover:underline" href={`https://${r.domain}`} target="_blank" rel="noreferrer">{r.domain}</a> : <span className="text-bo-muted">—</span> },
          { key: "playerCount", label: "Oyuncu" },
          { key: "sb", label: "Spor API", sortable: false, value: (r) => (r.sbApiKey ? "Kendi anahtarı" : "Varsayılan (env)") },
          { key: "isActive", label: "Durum", render: (r) => <span className={r.isActive ? "text-bo-green" : "text-bo-red"}>{r.isActive ? "Aktif" : "Pasif"}</span> },
          { key: "createdAt", label: "Oluşturma", render: (r) => dt(r.createdAt) },
          { key: "x", label: "", sortable: false, render: (r) => <button className="text-bo-blue" onClick={() => setEdit({ ...r, sbApiKey: "", sbApiSecret: "", sbWalletSecret: "" })}>Düzenle</button> },
        ]} />
        <div className="mt-3 space-y-1 text-bo-muted">
          <div><b>Nasıl çalışır?</b> Yeni site oluşturduğunuzda ödeme sistemleri ve temel CMS ayarları otomatik kurulur; oyuncular, bonuslar, promo kodlar, CMS içerikleri ve raporlar tamamen siteye özeldir.</div>
          <div>Site frontend'i hangi domainden açılırsa o siteye bağlanır (Site kaydındaki <b>Domain</b> alanı) — Coolify'da web uygulamasına yeni domaini ekleyip bu kayda yazmanız yeterli.</div>
          <div>Üst bardaki <b>Site</b> seçicisiyle backoffice'i istediğiniz siteye geçirirsiniz; tüm ekranlar seçili siteyi gösterir.</div>
        </div>
      </Panel>

      {edit && <Modal title={edit.id ? `Siteyi Düzenle — ${edit.name}` : "Yeni Site Oluştur"} onClose={() => setEdit(null)} wide>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Site kodu (küçük harf/rakam/tire, değiştirilemez)"><input className="inp font-mono" value={edit.code} disabled={!!edit.id} placeholder="ör. megabet" onChange={(e) => setEdit({ ...edit, code: e.target.value.toLowerCase() })} /></Field>
          <Field label="Site adı"><input className="inp" value={edit.name} placeholder="ör. MegaBet" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Domain (siteyi bu adrese bağlar)"><input className="inp font-mono" value={edit.domain ?? ""} placeholder="ör. megabet.com" onChange={(e) => setEdit({ ...edit, domain: e.target.value })} /></Field>
          <Field label="Not"><input className="inp" value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Aktif</label>
        </div>

        <div className="mt-4 rounded border border-bo-line bg-bo-head/40 p-3">
          <div className="mb-2 font-semibold">Spor API (Betco) — boş bırakılırsa varsayılan anahtarlar kullanılır</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="API adresi"><input className="inp font-mono" value={edit.sbApiUrl ?? ""} placeholder="https://sportbook.probetlab.com" onChange={(e) => setEdit({ ...edit, sbApiUrl: e.target.value })} /></Field>
            <Field label={edit.id ? "API Key (boş = değişmez)" : "API Key"}><input className="inp font-mono" value={edit.sbApiKey ?? ""} onChange={(e) => setEdit({ ...edit, sbApiKey: e.target.value })} /></Field>
            <Field label={edit.id ? "API Secret (boş = değişmez)" : "API Secret"}><input className="inp font-mono" type="password" value={edit.sbApiSecret ?? ""} onChange={(e) => setEdit({ ...edit, sbApiSecret: e.target.value })} /></Field>
            <Field label={edit.id ? "Cüzdan imza anahtarı (boş = değişmez)" : "Cüzdan imza anahtarı (wallet secret)"}><input className="inp font-mono" type="password" value={edit.sbWalletSecret ?? ""} onChange={(e) => setEdit({ ...edit, sbWalletSecret: e.target.value })} /></Field>
          </div>
          {(edit.walletUrl || edit.webhookUrl) && (
            <div className="mt-3 space-y-1 text-xs">
              <div className="font-semibold text-bo-text">Sağlayıcıya verilecek adresler:</div>
              {edit.walletUrl && <div className="flex items-center gap-2"><span className="text-bo-muted">Cüzdan (wallet) URL:</span><code className="rounded bg-white px-1.5 py-0.5">{edit.walletUrl}</code><button className="text-bo-blue" onClick={() => copy(edit.walletUrl, "w")}>{copied === "w" ? "Kopyalandı ✓" : "Kopyala"}</button></div>}
              {edit.webhookUrl && <div className="flex items-center gap-2"><span className="text-bo-muted">Webhook URL:</span><code className="rounded bg-white px-1.5 py-0.5">{edit.webhookUrl}</code><button className="text-bo-blue" onClick={() => copy(edit.webhookUrl, "h")}>{copied === "h" ? "Kopyalandı ✓" : "Kopyala"}</button></div>}
              <div className="text-bo-muted">İzinli domain olarak sitenin domainini bildirin. Aynı cüzdan adresi tüm siteler için geçerlidir; istek hangi sitenin oyuncusuna aitse o sitenin cüzdanı kullanılır.</div>
            </div>
          )}
        </div>

        <Err e={e} />
        <div className="mt-4 flex items-center justify-between">
          {edit.id ? <button className="text-bo-blue text-xs" onClick={() => { setSite(edit.code); location.href = "/"; }}>Backoffice'i bu siteye geçir →</button> : <span />}
          <button className="btn-green" disabled={!edit.name || (!edit.id && !/^[a-z0-9-]{2,30}$/.test(edit.code))} onClick={save}>{edit.id ? "Kaydet" : "Siteyi Oluştur"}</button>
        </div>
      </Modal>}
    </>
  );
}
