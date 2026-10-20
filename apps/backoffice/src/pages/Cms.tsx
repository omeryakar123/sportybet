import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, Field, Modal, dt } from "../ui";

/** Sitedeki her görselin CMS'te bir karşılığı var: banner grupları = site üzerindeki slot adları */
export const BANNER_GROUPS = ["homepage-hero", "homepage-main-left", "homepage-main-right", "sport-top", "live-top", "promotions-top"];

export function CmsBanners() {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [tab, setTab] = useState<"pub" | "unpub">("pub");
  const load = () => api("/admin/cms/banners").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  async function save() { const { id, updatedAt, ...d } = edit; await api(id ? `/admin/cms/banners/${id}` : "/admin/cms/banners", { method: id ? "PATCH" : "POST", json: { ...d, sortOrder: Number(d.sortOrder) } }); setEdit(null); load(); }
  const toggle = async (b: any) => { await api(`/admin/cms/banners/${b.id}`, { method: "PATCH", json: { isPublished: !b.isPublished } }); load(); };
  const shown = list.filter((b) => (tab === "pub" ? b.isPublished : !b.isPublished));
  return (
    <>
      <Panel title="Bannerlar" right={<button className="btn-blue" onClick={() => setEdit({ group: BANNER_GROUPS[0], title: "", imageUrl: "", linkUrl: "", platform: "web", language: "tr", isPublished: true, sortOrder: 0 })}>+ Banner Ekle</button>}>
        <div className="mb-3 flex gap-4 border-b border-bo-line">
          <button onClick={() => setTab("pub")} className={tab === "pub" ? "border-b-2 border-bo-blue pb-2 text-bo-blue" : "pb-2"}>Yayında ({list.filter((b) => b.isPublished).length})</button>
          <button onClick={() => setTab("unpub")} className={tab === "unpub" ? "border-b-2 border-bo-blue pb-2 text-bo-blue" : "pb-2"}>Yayında değil ({list.filter((b) => !b.isPublished).length})</button>
        </div>
        <table className="tbl"><thead><tr><th>Görsel</th><th>Başlık</th><th>Grup</th><th>Platform</th><th>Sıra</th><th>Güncelleme</th><th></th></tr></thead>
          <tbody>{shown.map((b) => <tr key={b.id}><td><img src={b.imageUrl} className="h-14 w-48 rounded object-cover" /></td><td>{b.title}</td><td>{b.group}</td><td>{b.platform}</td><td>{b.sortOrder}</td><td>{dt(b.updatedAt)}</td>
            <td className="space-x-3"><button className="text-bo-blue" onClick={() => setEdit(b)}>Düzenle</button><button className="text-bo-muted" onClick={() => toggle(b)}>{b.isPublished ? "Gizle" : "Yayınla"}</button></td></tr>)}</tbody></table>
      </Panel>
      {edit && <Modal title="Banner" onClose={() => setEdit(null)}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Başlık"><input className="inp" value={edit.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Grup (site slotu)"><select className="inp" value={edit.group} onChange={(e) => set("group", e.target.value)}>{BANNER_GROUPS.map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Platform"><select className="inp" value={edit.platform} onChange={(e) => set("platform", e.target.value)}><option>web</option><option>mobile</option></select></Field>
          <div className="col-span-2"><Field label="Görsel URL"><input className="inp" value={edit.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} /></Field></div>
          <Field label="Sıra"><input className="inp" type="number" value={edit.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
          <div className="col-span-3"><Field label="Link"><input className="inp" value={edit.linkUrl ?? ""} onChange={(e) => set("linkUrl", e.target.value)} /></Field></div>
          {edit.imageUrl && <img src={edit.imageUrl} className="col-span-3 max-h-48 rounded object-contain" />}
        </div>
        <div className="mt-5 flex justify-end"><button className="btn-blue" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}

export function CmsPromotions() {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null);
  const load = () => api("/admin/cms/promotions").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  async function save() { const { id, updatedAt, ...d } = edit; await api(id ? `/admin/cms/promotions/${id}` : "/admin/cms/promotions", { method: id ? "PATCH" : "POST", json: { ...d, sortOrder: Number(d.sortOrder) } }); setEdit(null); load(); }
  return (
    <>
      <Panel title="Promosyonlar" right={<button className="btn-blue" onClick={() => setEdit({ title: "", slug: "", category: "TUMU", imageUrl: "", contentHtml: "", platform: "web,mobile", showFor: "ALL", language: "tr", isPublished: true, sortOrder: 0 })}>+ Promosyon Ekle</button>}>
        <table className="tbl"><thead><tr><th>Görsel</th><th>Başlık</th><th>Kategori</th><th>Gösterim</th><th>Durum</th><th></th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.id}><td>{p.imageUrl && <img src={p.imageUrl} className="h-14 w-24 rounded object-cover" />}</td><td>{p.title}</td><td>{p.category}</td><td>{p.showFor}</td><td>{p.isPublished ? "Yayında" : "Taslak"}</td>
            <td><button className="text-bo-blue" onClick={() => setEdit(p)}>Düzenle</button></td></tr>)}</tbody></table>
      </Panel>
      {edit && <Modal title="Promosyon" onClose={() => setEdit(null)}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Başlık"><input className="inp" value={edit.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Slug"><input className="inp" value={edit.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
          <Field label="Kategori"><input className="inp" value={edit.category} onChange={(e) => set("category", e.target.value)} /></Field>
          <Field label="Kimlere göster"><select className="inp" value={edit.showFor} onChange={(e) => set("showFor", e.target.value)}><option value="ALL">Misafir + Giriş yapmış</option><option value="GUEST">Misafir</option><option value="LOGGED_IN">Giriş yapmış</option></select></Field>
          <div className="col-span-2"><Field label="Görsel URL"><input className="inp" value={edit.imageUrl ?? ""} onChange={(e) => set("imageUrl", e.target.value)} /></Field></div>
          <div className="col-span-2"><Field label="İçerik (HTML)"><textarea className="inp h-72 py-1 font-mono text-xs" value={edit.contentHtml} onChange={(e) => set("contentHtml", e.target.value)} /></Field></div>
          <div className="h-72 overflow-auto rounded border border-bo-line bg-neutral-900 p-2 text-white" dangerouslySetInnerHTML={{ __html: edit.contentHtml }} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={edit.isPublished} onChange={(e) => set("isPublished", e.target.checked)} />Yayında</label>
        </div>
        <div className="mt-5 flex justify-end"><button className="btn-blue" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}

export function CmsCss() {
  const [which, setWhich] = useState<"web_css" | "mobile_css">("web_css"); const [css, setCss] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => { api(`/admin/cms/settings/${which}`).then((r) => setCss(r?.value?.css ?? "")).catch(() => setCss("")); }, [which]);
  async function save() { await api(`/admin/cms/settings/${which}`, { method: "PUT", json: { css } }); setMsg("Yayınlandı ✓"); setTimeout(() => setMsg(""), 2000); }
  return (
    <Panel title="Özel CSS" right={<div className="flex items-center gap-3"><span className="text-bo-green">{msg}</span><button className="btn-blue" onClick={save}>Yayınla</button></div>}>
      <div className="mb-3 flex gap-2">{(["web_css", "mobile_css"] as const).map((w) => <button key={w} onClick={() => setWhich(w)} className={which === w ? "btn-blue" : "btn-ghost"}>{w === "web_css" ? "Web CSS" : "Mobil CSS"}</button>)}</div>
      <textarea className="h-[60vh] w-full rounded border border-bo-line bg-[#f7f8fb] p-3 font-mono text-xs" value={css} onChange={(e) => setCss(e.target.value)} spellCheck={false} />
    </Panel>
  );
}
