import { useEffect, useState } from "react";
import { api } from "../api";
import { Panel, Field, Modal, dt, Err } from "../ui";

/** Sitedeki her görselin CMS'te bir karşılığı var: banner grupları = site üzerindeki slot adları */
export const BANNER_GROUPS = ["homepage-hero", "homepage-main-left", "homepage-main-right", "sport-top", "live-top", "promotions-top", "login-modal", "register-modal", "deposit-top", "mobile-home"];

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

export function CmsPages() {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [e, setE] = useState("");
  const load = () => api("/admin/cms/pages").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  async function save() {
    setE("");
    try { const { id, updatedAt, ...d } = edit; await api(id ? `/admin/cms/pages/${id}` : "/admin/cms/pages", { method: id ? "PATCH" : "POST", json: d }); setEdit(null); load(); }
    catch (x: any) { setE(x.message === "ALREADY_EXISTS" ? "Bu slug zaten var" : x.message); }
  }
  async function del(id: number) { if (confirm("Sayfa silinsin mi?")) { await api(`/admin/cms/pages/${id}`, { method: "DELETE" }); load(); } }
  return (
    <>
      <Panel title="Sayfalar" right={<button className="btn-blue" onClick={() => setEdit({ title: "", slug: "", contentHtml: "", isPublished: true })}>+ Sayfa Ekle</button>}>
        <p className="mb-2 text-bo-muted">Kurallar, Gizlilik, Sorumlu Oyun, Hakkımızda gibi statik sayfalar. Sitede <code>/page/&lt;slug&gt;</code> adresinde görünür; footer menüsünden bağlanır.</p>
        <table className="tbl"><thead><tr><th>Başlık</th><th>Slug</th><th>Durum</th><th>Güncelleme</th><th></th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.id}><td>{p.title}</td><td className="font-mono">/page/{p.slug}</td><td>{p.isPublished ? "Yayında" : "Taslak"}</td><td>{dt(p.updatedAt)}</td>
            <td className="space-x-3"><button className="text-bo-blue" onClick={() => setEdit(p)}>Düzenle</button><button className="text-bo-red" onClick={() => del(p.id)}>Sil</button></td></tr>)}</tbody></table>
      </Panel>
      {edit && <Modal title="Sayfa" onClose={() => setEdit(null)} wide>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlık"><input className="inp" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Slug (ör. kurallar)"><input className="inp" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></Field>
          <Field label="İçerik (HTML)"><textarea className="inp h-96 py-1 font-mono text-xs" value={edit.contentHtml} onChange={(e) => setEdit({ ...edit, contentHtml: e.target.value })} /></Field>
          <Field label="Önizleme"><div className="h-96 overflow-auto rounded border border-bo-line bg-neutral-900 p-3 text-white" dangerouslySetInnerHTML={{ __html: edit.contentHtml }} /></Field>
          <label className="flex items-center gap-2"><input type="checkbox" checked={edit.isPublished} onChange={(e) => setEdit({ ...edit, isPublished: e.target.checked })} />Yayında</label>
        </div>
        <Err e={e} />
        <div className="mt-4 flex justify-end"><button className="btn-blue" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}

/** Site genel ayarları — her alan sitede bir yere karşılık gelir (logo → header, seo → <head>, menüler → header/footer) */
const SETTING_GROUPS: { key: string; title: string; fields: [string, string, ("text" | "textarea" | "color")?][] }[] = [
  { key: "site_general", title: "Genel / Logo", fields: [["siteName", "Site adı"], ["logoUrl", "Logo URL (masaüstü header)"], ["logoMobileUrl", "Logo URL (mobil)"], ["faviconUrl", "Favicon URL"], ["primaryColor", "Ana renk", "color"], ["licenseText", "Lisans metni (footer)", "textarea"], ["supportEmail", "Destek e-postası"], ["liveChatScript", "Canlı destek script'i (head'e eklenir)", "textarea"]] },
  { key: "seo", title: "SEO", fields: [["title", "Sayfa başlığı (title)"], ["description", "Meta açıklama", "textarea"], ["keywords", "Anahtar kelimeler"], ["ogImage", "Paylaşım görseli (og:image) URL"], ["headHtml", "Ek <head> HTML (analytics vb.)", "textarea"]] },
  { key: "social", title: "Sosyal Medya", fields: [["telegram", "Telegram"], ["instagram", "Instagram"], ["x", "X (Twitter)"], ["facebook", "Facebook"], ["youtube", "YouTube"]] },
];

export function CmsSettings() {
  const [vals, setVals] = useState<Record<string, any>>({}); const [menus, setMenus] = useState(""); const [msg, setMsg] = useState(""); const [e, setE] = useState("");
  useEffect(() => {
    for (const g of SETTING_GROUPS) api(`/admin/cms/settings/${g.key}`).then((r) => setVals((v) => ({ ...v, [g.key]: r?.value ?? {} }))).catch(() => {});
    api("/admin/cms/settings/menus").then((r) => setMenus(JSON.stringify(r?.value ?? DEFAULT_MENUS, null, 2))).catch(() => setMenus(JSON.stringify(DEFAULT_MENUS, null, 2)));
  }, []);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2000); };
  async function saveGroup(key: string) { setE(""); try { await api(`/admin/cms/settings/${key}`, { method: "PUT", json: vals[key] ?? {} }); flash("Kaydedildi ✓"); } catch (x: any) { setE(x.message); } }
  async function saveMenus() { setE(""); try { await api("/admin/cms/settings/menus", { method: "PUT", json: JSON.parse(menus) }); flash("Menüler kaydedildi ✓"); } catch (x: any) { setE(x instanceof SyntaxError ? "JSON hatalı: " + x.message : x.message); } }
  return (
    <>
      <div className="mb-2 flex justify-end text-bo-green">{msg}</div>
      <Err e={e} />
      <div className="grid gap-3 xl:grid-cols-2">
        {SETTING_GROUPS.map((g) => (
          <Panel key={g.key} title={g.title} right={<button className="btn-blue" onClick={() => saveGroup(g.key)}>Kaydet</button>}>
            <div className="grid gap-3">
              {g.fields.map(([k, l, t]) => {
                const v = vals[g.key]?.[k] ?? ""; const on = (x: string) => setVals({ ...vals, [g.key]: { ...vals[g.key], [k]: x } });
                return <Field key={k} label={l}>{t === "textarea" ? <textarea className="inp h-20 py-1" value={v} onChange={(e) => on(e.target.value)} /> : t === "color" ? <input type="color" className="h-8 w-20" value={v || "#00ae61"} onChange={(e) => on(e.target.value)} /> : <input className="inp" value={v} onChange={(e) => on(e.target.value)} />}</Field>;
              })}
              {g.key === "site_general" && vals.site_general?.logoUrl && <img src={vals.site_general.logoUrl} className="h-10 w-fit rounded bg-neutral-900 p-1" />}
            </div>
          </Panel>
        ))}
        <Panel title="Menüler (header, sidebar, footer)" right={<button className="btn-blue" onClick={saveMenus}>Kaydet</button>}>
          <p className="mb-2 text-bo-muted">Sitedeki menü linkleri. <code>label</code> görünen ad, <code>url</code> hedef, <code>icon</code> isteğe bağlı, <code>badge</code> rozet (ör. "Yeni").</p>
          <textarea className="h-96 w-full rounded border border-bo-line bg-[#f7f8fb] p-2 font-mono text-xs" value={menus} onChange={(e) => setMenus(e.target.value)} spellCheck={false} />
        </Panel>
      </div>
    </>
  );
}

const DEFAULT_MENUS = {
  sidebar: [
    { label: "Ana Sayfa", url: "/", icon: "home" }, { label: "Spor", url: "/sport", icon: "ball" }, { label: "Canlı Bahis", url: "/sport?live=1", icon: "live" },
    { label: "Promosyonlar", url: "/promotions", icon: "gift", badge: "Yeni" },
  ],
  footer: [
    { title: "Kurumsal", links: [{ label: "Hakkımızda", url: "/page/hakkimizda" }, { label: "İletişim", url: "/page/iletisim" }] },
    { title: "Yardım", links: [{ label: "Kurallar", url: "/page/kurallar" }, { label: "Sorumlu Oyun", url: "/page/sorumlu-oyun" }, { label: "Gizlilik", url: "/page/gizlilik" }] },
  ],
};
