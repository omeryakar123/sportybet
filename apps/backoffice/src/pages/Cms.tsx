import { useEffect, useState } from "react";
import { api, asset } from "../api";
import { Panel, Field, Modal, dt, Err } from "../ui";

/** Sitedeki her görselin CMS'te bir karşılığı var: banner grupları = site üzerindeki slot adları */
export const BANNER_GROUPS: [string, string][] = [
  ["home-hero", "Anasayfa · Büyük banner (kayan)"],
  ["home-category", "Anasayfa · Kategori kartları"],
  ["sport-top", "Spor · Üst banner"],
  ["predictions-top", "Tahminler · Üst banner"],
  ["promotions-top", "Promosyonlar · Üst banner"],
  ["deposit-top", "Para yatır · Üst banner"],
  ["login-modal", "Giriş penceresi görseli"],
  ["register-modal", "Kayıt penceresi görseli"],
];
const GROUP_HINT: Record<string, string> = {
  "home-hero": "Önerilen görsel 1032×864 (oran 344:288). Başlık beyaz, vurgu satırı sarı yazılır. Bitiş tarihi girilirse üstte geri sayım çıkar.",
  "home-category": "Önerilen görsel 700×240, nesne sağda, sol taraf boş/şeffaf. Üst satır küçük yazı: {maclar} {canli} {ligler} {tahminler} sayılarla değişir.",
};

/** Görsel alanı: URL yaz ya da dosya yükle (CMS deposuna kaydedilir) */
export function ImageField({ label, value, onChange, small }: { label: string; value?: string; onChange: (v: string) => void; small?: boolean }) {
  const [busy, setBusy] = useState(false); const [e, setE] = useState("");
  async function pick(f?: File | null) {
    if (!f) return; setE("");
    if (f.size > 8 * 1024 * 1024) { setE("Dosya 8 MB'den büyük olamaz"); return; }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
      const r = await api("/admin/cms/upload", { method: "POST", json: { name: f.name, dataUrl } });
      onChange(r.url);
    } catch (x: any) { setE(x.message === "INVALID_IMAGE" ? "Yalnızca PNG, JPG, WEBP, GIF, SVG, AVIF" : x.message); }
    finally { setBusy(false); }
  }
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input className="inp flex-1" value={value ?? ""} onChange={(ev) => onChange(ev.target.value)} placeholder="https://… veya yükle" />
        <label className={`btn-ghost cursor-pointer whitespace-nowrap ${busy ? "opacity-50" : ""}`}>{busy ? "Yükleniyor…" : "Dosya yükle"}<input type="file" accept="image/*" className="hidden" onChange={(ev) => pick(ev.target.files?.[0])} /></label>
      </div>
      {e && <div className="mt-1 text-xs text-bo-red">{e}</div>}
      {value && <img src={asset(value)} className={`mt-2 rounded bg-neutral-900 object-contain ${small ? "h-10 w-10" : "max-h-40 w-full"}`} />}
    </Field>
  );
}

const toLocal = (d?: string | null) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");

export function CmsBanners() {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [tab, setTab] = useState<"pub" | "unpub">("pub"); const [g, setG] = useState(""); const [err, setErr] = useState("");
  const load = () => api("/admin/cms/banners").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  async function save() {
    setErr("");
    if (!edit.title?.trim()) return setErr("Başlık zorunlu");
    if (!edit.imageUrl?.trim() && !edit.bgColor?.trim()) return setErr("Görsel ya da zemin rengi girin");
    try {
      const { id, updatedAt, siteId, ...d } = edit;
      await api(id ? `/admin/cms/banners/${id}` : "/admin/cms/banners", { method: id ? "PATCH" : "POST", json: { ...d, imageUrl: d.imageUrl ?? "", sortOrder: Number(d.sortOrder) || 0, startsAt: d.startsAt || null, endsAt: d.endsAt || null } });
      setEdit(null); load();
    } catch (x: any) { setErr(x.message); }
  }
  const toggle = async (b: any) => { await api(`/admin/cms/banners/${b.id}`, { method: "PATCH", json: { isPublished: !b.isPublished } }); load(); };
  const del = async (b: any) => { if (confirm(`"${b.title}" silinsin mi?`)) { await api(`/admin/cms/banners/${b.id}`, { method: "DELETE" }); load(); } };
  const move = async (b: any, d: number) => { await api(`/admin/cms/banners/${b.id}`, { method: "PATCH", json: { sortOrder: (b.sortOrder || 0) + d } }); load(); };
  const shown = list.filter((b) => (tab === "pub" ? b.isPublished : !b.isPublished) && (!g || b.group === g)).sort((a, b) => a.group.localeCompare(b.group) || a.sortOrder - b.sortOrder);
  const gname = (k: string) => BANNER_GROUPS.find(([x]) => x === k)?.[1] ?? k;
  return (
    <>
      <Panel title="Bannerlar ve Görsel Alanlar" right={<button className="btn-blue" onClick={() => setEdit({ group: g || BANNER_GROUPS[0][0], title: "", subtitle: "", highlight: "", ctaText: "", badge: "", bgColor: "", imageUrl: "", linkUrl: "", platform: "all", language: "tr", isPublished: true, sortOrder: list.filter((b) => b.group === (g || BANNER_GROUPS[0][0])).length })}>+ Banner Ekle</button>}>
        <div className="mb-3 flex flex-wrap items-center gap-4 border-b border-bo-line">
          <button onClick={() => setTab("pub")} className={tab === "pub" ? "border-b-2 border-bo-blue pb-2 text-bo-blue" : "pb-2"}>Yayında ({list.filter((b) => b.isPublished).length})</button>
          <button onClick={() => setTab("unpub")} className={tab === "unpub" ? "border-b-2 border-bo-blue pb-2 text-bo-blue" : "pb-2"}>Yayında değil ({list.filter((b) => !b.isPublished).length})</button>
          <select className="inp mb-2 ml-auto w-64" value={g} onChange={(e) => setG(e.target.value)}><option value="">Tüm alanlar</option>{BANNER_GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <table className="tbl"><thead><tr><th>Görsel</th><th>Başlık</th><th>Alan</th><th>Platform</th><th>Sıra</th><th>Bitiş</th><th></th></tr></thead>
          <tbody>{shown.map((b) => <tr key={b.id}>
            <td><div className="h-14 w-40 overflow-hidden rounded" style={{ background: b.bgColor || "#131a22" }}>{b.imageUrl && <img src={asset(b.imageUrl)} className="h-full w-full object-cover" />}</div></td>
            <td><div className="font-semibold">{b.title}</div><div className="text-xs text-bo-muted">{[b.subtitle, b.highlight].filter(Boolean).join(" · ")}</div></td>
            <td>{gname(b.group)}</td><td>{b.platform === "all" ? "Web + Mobil" : b.platform}</td>
            <td className="whitespace-nowrap"><button className="px-1 text-bo-muted" onClick={() => move(b, -1)} aria-label="Yukarı">▲</button>{b.sortOrder}<button className="px-1 text-bo-muted" onClick={() => move(b, 1)} aria-label="Aşağı">▼</button></td>
            <td>{b.endsAt ? dt(b.endsAt) : "—"}</td>
            <td className="space-x-3 whitespace-nowrap"><button className="text-bo-blue" onClick={() => setEdit({ ...b, startsAt: toLocal(b.startsAt), endsAt: toLocal(b.endsAt) })}>Düzenle</button><button className="text-bo-muted" onClick={() => toggle(b)}>{b.isPublished ? "Gizle" : "Yayınla"}</button><button className="text-bo-red" onClick={() => del(b)}>Sil</button></td></tr>)}
            {!shown.length && <tr><td colSpan={7} className="py-6 text-center text-bo-muted">Bu filtrede banner yok</td></tr>}</tbody></table>
      </Panel>
      {edit && <Modal title={edit.id ? "Banner düzenle" : "Yeni banner"} onClose={() => setEdit(null)} wide>
        <div className="grid grid-cols-[1fr_360px] gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alan (sitedeki yer)"><select className="inp" value={edit.group} onChange={(e) => set("group", e.target.value)}>{BANNER_GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Platform"><select className="inp" value={edit.platform} onChange={(e) => set("platform", e.target.value)}><option value="all">Web + Mobil</option><option value="web">Yalnız web</option><option value="mobile">Yalnız mobil</option></select></Field>
            {GROUP_HINT[edit.group] && <p className="col-span-2 rounded bg-[#eef4ff] p-2 text-xs text-bo-blue">{GROUP_HINT[edit.group]}</p>}
            <Field label="Başlık *"><input className="inp" value={edit.title} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Vurgu satırı (sarı)"><input className="inp" value={edit.highlight ?? ""} onChange={(e) => set("highlight", e.target.value)} /></Field>
            <Field label="Üst küçük satır"><input className="inp" value={edit.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} /></Field>
            <Field label="Köşe etiketi"><input className="inp" value={edit.badge ?? ""} onChange={(e) => set("badge", e.target.value)} placeholder="ör. YENİ" /></Field>
            <Field label="Buton yazısı (boşsa buton yok)"><input className="inp" value={edit.ctaText ?? ""} onChange={(e) => set("ctaText", e.target.value)} /></Field>
            <Field label="Link (/spor, /promosyonlar/slug, https://…)"><input className="inp" value={edit.linkUrl ?? ""} onChange={(e) => set("linkUrl", e.target.value)} /></Field>
            <div className="col-span-2"><ImageField label="Görsel" value={edit.imageUrl} onChange={(v) => set("imageUrl", v)} /></div>
            <Field label="Zemin (renk veya CSS gradyan)"><input className="inp" value={edit.bgColor ?? ""} onChange={(e) => set("bgColor", e.target.value)} placeholder="#131a22 veya linear-gradient(…)" /></Field>
            <Field label="Sıra"><input className="inp" type="number" value={edit.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
            <Field label="Başlangıç"><input className="inp" type="datetime-local" value={edit.startsAt ?? ""} onChange={(e) => set("startsAt", e.target.value)} /></Field>
            <Field label="Bitiş (geri sayım)"><input className="inp" type="datetime-local" value={edit.endsAt ?? ""} onChange={(e) => set("endsAt", e.target.value)} /></Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.isPublished} onChange={(e) => set("isPublished", e.target.checked)} />Yayında</label>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-bo-muted">Sitedeki önizleme</div>
            <BannerPreview b={edit} />
          </div>
        </div>
        <Err e={err} />
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(null)}>Vazgeç</button><button className="btn-blue" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}

/** Sitedeki kartın birebir küçük önizlemesi (gamdom ölçüleri) */
function BannerPreview({ b }: { b: any }) {
  const font = { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" };
  if (b.group === "home-category") return (
    <div className="relative h-[105px] overflow-hidden rounded-2xl text-white" style={{ background: b.bgColor || "#131a22", ...font }}>
      {b.imageUrl && <img src={asset(b.imageUrl)} className="absolute inset-y-0 right-0 h-full w-[78%] object-cover object-right" />}
      <div className="relative flex h-full flex-col justify-center gap-[18px] px-5">{b.subtitle && <span className="text-[12px] font-bold text-white/75">{b.subtitle}</span>}<span className="text-[28px] font-bold leading-none">{b.title || "Başlık"}</span></div>
    </div>
  );
  return (
    <div className="relative aspect-[344/288] overflow-hidden rounded-2xl text-white" style={{ background: b.bgColor || "#131a22", ...font }}>
      {b.imageUrl && <img src={asset(b.imageUrl)} className="absolute inset-0 h-full w-full object-cover" />}
      {b.endsAt && <div className="absolute inset-x-0 top-5 flex justify-center"><span className="rounded-[10px] border border-[#ffd900]/25 bg-[#131a22]/80 px-3 py-1 text-[12px] font-bold text-[#ffd900]">Bitişe 2 g 10 s 5 d</span></div>}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-6 text-center">
        {b.subtitle && <div className="text-[12px] font-bold text-white/75">{b.subtitle}</div>}
        <div className="text-[24px] font-bold leading-tight">{b.title || "Başlık"}</div>
        {b.highlight && <div className="text-[24px] font-bold leading-tight text-[#ffd900]">{b.highlight}</div>}
        {b.ctaText && <span className="mt-2 inline-block rounded-[10px] bg-[#00ff86] px-3 py-2 text-[13px] font-bold text-[#06090e]">{b.ctaText}</span>}
      </div>
    </div>
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
          <tbody>{list.map((p) => <tr key={p.id}><td>{p.imageUrl && <img src={asset(p.imageUrl)} className="h-14 w-24 rounded object-cover" />}</td><td>{p.title}</td><td>{p.category}</td><td>{p.showFor}</td><td>{p.isPublished ? "Yayında" : "Taslak"}</td>
            <td><button className="text-bo-blue" onClick={() => setEdit(p)}>Düzenle</button></td></tr>)}</tbody></table>
      </Panel>
      {edit && <Modal title="Promosyon" onClose={() => setEdit(null)}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Başlık"><input className="inp" value={edit.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Slug"><input className="inp" value={edit.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
          <Field label="Kategori"><input className="inp" value={edit.category} onChange={(e) => set("category", e.target.value)} /></Field>
          <Field label="Kimlere göster"><select className="inp" value={edit.showFor} onChange={(e) => set("showFor", e.target.value)}><option value="ALL">Misafir + Giriş yapmış</option><option value="GUEST">Misafir</option><option value="LOGGED_IN">Giriş yapmış</option></select></Field>
          <div className="col-span-2"><ImageField label="Görsel" value={edit.imageUrl} onChange={(v) => set("imageUrl", v)} /></div>
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
  { key: "site_general", title: "Genel / Logo", fields: [["siteName", "Site adı"], ["logoUrl", "Logo URL (masaüstü header)"], ["logoMobileUrl", "Logo URL (mobil)"], ["faviconUrl", "Favicon URL"], ["primaryColor", "Ana renk", "color"], ["footerText", "Footer tanıtım metni", "textarea"], ["licenseText", "Lisans metni (footer)", "textarea"], ["supportEmail", "Destek e-postası"], ["liveChatScript", "Canlı destek script'i (head'e eklenir)", "textarea"]] },
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
                if (/Url$/.test(k)) return <ImageField key={k} label={l} value={v} onChange={on} small={k === "faviconUrl"} />;
                return <Field key={k} label={l}>{t === "textarea" ? <textarea className="inp h-20 py-1" value={v} onChange={(e) => on(e.target.value)} /> : t === "color" ? <input type="color" className="h-8 w-20" value={v || "#00ae61"} onChange={(e) => on(e.target.value)} /> : <input className="inp" value={v} onChange={(e) => on(e.target.value)} />}</Field>;
              })}
              {g.key === "site_general" && vals.site_general?.logoUrl && <img src={vals.site_general.logoUrl} className="h-10 w-fit rounded bg-neutral-900 p-1" />}
            </div>
          </Panel>
        ))}
        <Panel title="Menüler (header, sidebar, footer)" right={<button className="btn-blue" onClick={saveMenus}>Kaydet</button>}>
          <p className="mb-2 text-bo-muted">Sitedeki menü linkleri. <code>label</code> görünen ad, <code>url</code> hedef, <code>icon</code> isteğe bağlı, <code>badge</code> rozet (ör. "Yeni"). <code>tiles</code> = yan menü üst kutular, <code>sidebar</code> = Ayrıcalıklar grubu, <code>footer</code> = alt bilgi sütunları.</p>
          <textarea className="h-96 w-full rounded border border-bo-line bg-[#f7f8fb] p-2 font-mono text-xs" value={menus} onChange={(e) => setMenus(e.target.value)} spellCheck={false} />
        </Panel>
      </div>
    </>
  );
}

const DEFAULT_MENUS = {
  tiles: [
    { label: "Lobi", url: "/", icon: "home" }, { label: "Spor", url: "/spor", icon: "ball" }, { label: "Tahminler", url: "/tahminler", icon: "vote" }, { label: "Kuponlarım", url: "/hesap/kuponlarim", icon: "ticket" },
  ],
  sidebar: [
    { label: "Promosyonlar", url: "/promosyonlar", icon: "gift", badge: "Yeni" }, { label: "VIP Kulübü", url: "/vip", icon: "crown", badge: "Yakında" }, { label: "Bonuslarım", url: "/hesap/bonuslarim", icon: "rewards" },
  ],
  footer: [
    { title: "Kurumsal", links: [{ label: "Hakkımızda", url: "/page/hakkimizda" }, { label: "İletişim", url: "/page/iletisim" }] },
    { title: "Yardım", links: [{ label: "Kurallar", url: "/page/kurallar" }, { label: "Sorumlu Oyun", url: "/page/sorumlu-oyun" }, { label: "Gizlilik", url: "/page/gizlilik" }] },
  ],
};

/* =====================================================================
 * Anasayfa düzeni (ayar: home_layout) — sitenin Home.tsx'i bunu okur
 * ===================================================================== */
const SECTION_INFO: Record<string, [string, string]> = {
  hero: ["Büyük bannerlar", "Bannerlar › Anasayfa · Büyük banner alanından gelir"],
  categories: ["Kategori kartları", "Bannerlar › Anasayfa · Kategori kartları alanından gelir"],
  search: ["Arama kutusu", "Başlık = yer tutucu metin; {n} maç sayısıyla değişir"],
  live: ["Canlı maçlar şeridi", "Canlı maç yoksa gizlenir"],
  featured: ["Öne çıkan maçlar şeridi", "Önce Trading'de öne çıkarılanlar, sonra en yakın maçlar"],
  leagues: ["Popüler ligler şeridi", "Lig logoları; tıklayınca o lig açılır"],
  predictions: ["Popüler tahminler şeridi", "Anasayfada göster işaretli tahmin piyasaları"],
  seo: ["SEO metni", "Aşağıdaki SEO başlığı ve HTML metni"],
  faq: ["Sık sorulan sorular", "Aşağıdaki soru-cevap listesi"],
};
const HOME_DEFAULT = {
  sections: [
    { key: "hero", on: true }, { key: "categories", on: true },
    { key: "search", on: true, title: "{n} maç içinde takım veya lig ara" },
    { key: "live", on: true, title: "Canlı Maçlar", icon: "/img/ic-live.svg", limit: 12 },
    { key: "featured", on: true, title: "Öne Çıkan Maçlar", icon: "/img/ic-flame.svg", limit: 12 },
    { key: "leagues", on: true, title: "Popüler Ligler", icon: "/img/ic-trophy.svg", limit: 16 },
    { key: "predictions", on: true, title: "Popüler Tahminler", icon: "/img/ic-chart.svg", limit: 12 },
    { key: "seo", on: true }, { key: "faq", on: true, title: "Sık Sorulan Sorular" },
  ] as any[],
  seoTitle: "SportyBet: Spor Bahisleri & Tahminler",
  seoHtml: "<p>Futbolda maç öncesi oranlar, canlı skorlar ve gündem tahminleri tek hesapta.</p>",
  faq: [] as { q: string; a: string }[],
};

export function CmsHome() {
  const [cfg, setCfg] = useState<any>(null); const [msg, setMsg] = useState(""); const [e, setE] = useState("");
  useEffect(() => {
    api("/admin/cms/settings/home_layout").then((r) => {
      const v = r?.value ?? {};
      const saved: any[] = Array.isArray(v.sections) ? v.sections : [];
      const keys = new Set(saved.map((s) => s.key));
      setCfg({ ...HOME_DEFAULT, ...v, sections: [...saved.map((s) => ({ ...HOME_DEFAULT.sections.find((d) => d.key === s.key), ...s })), ...HOME_DEFAULT.sections.filter((d) => !keys.has(d.key))], faq: Array.isArray(v.faq) ? v.faq : HOME_DEFAULT.faq });
    }).catch(() => setCfg(HOME_DEFAULT));
  }, []);
  if (!cfg) return <Panel title="Anasayfa Düzeni">Yükleniyor…</Panel>;
  const setSec = (i: number, k: string, v: any) => setCfg({ ...cfg, sections: cfg.sections.map((s: any, j: number) => (j === i ? { ...s, [k]: v } : s)) });
  const move = (i: number, d: number) => { const a = [...cfg.sections]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setCfg({ ...cfg, sections: a }); };
  const setFaq = (i: number, k: string, v: string) => setCfg({ ...cfg, faq: cfg.faq.map((f: any, j: number) => (j === i ? { ...f, [k]: v } : f)) });
  async function save() {
    setE("");
    try { await api("/admin/cms/settings/home_layout", { method: "PUT", json: { ...cfg, sections: cfg.sections.map((s: any) => ({ ...s, limit: s.limit ? Number(s.limit) : undefined })), faq: cfg.faq.filter((f: any) => f.q?.trim()) } }); setMsg("Yayınlandı ✓"); setTimeout(() => setMsg(""), 2500); }
    catch (x: any) { setE(x.message); }
  }
  return (
    <>
      <Panel title="Anasayfa Düzeni" right={<div className="flex items-center gap-3"><span className="text-bo-green">{msg}</span><button className="btn-blue" onClick={save}>Yayınla</button></div>}>
        <p className="mb-3 text-bo-muted">Bölümler sitede bu sırayla görünür. Kapalı bölüm gösterilmez. İkon 32×32 görseldir (yükleyebilir ya da boş bırakabilirsin).</p>
        <table className="tbl"><thead><tr><th>Sıra</th><th>Açık</th><th>Bölüm</th><th>Başlık</th><th>İkon</th><th>Adet</th></tr></thead>
          <tbody>{cfg.sections.map((s: any, i: number) => {
            const [name, hint] = SECTION_INFO[s.key] ?? [s.key, ""];
            const titled = !["hero", "categories", "seo"].includes(s.key); const rail = ["live", "featured", "leagues", "predictions"].includes(s.key);
            return <tr key={s.key}>
              <td className="whitespace-nowrap"><button className="px-1 text-bo-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yukarı">▲</button><button className="px-1 text-bo-muted disabled:opacity-30" disabled={i === cfg.sections.length - 1} onClick={() => move(i, 1)} aria-label="Aşağı">▼</button></td>
              <td><input type="checkbox" checked={s.on} onChange={(e) => setSec(i, "on", e.target.checked)} /></td>
              <td><div className="font-semibold">{name}</div><div className="text-xs text-bo-muted">{hint}</div></td>
              <td>{titled && <input className="inp w-64" value={s.title ?? ""} onChange={(e) => setSec(i, "title", e.target.value)} />}</td>
              <td className="w-[340px]">{rail && <ImageField label="" value={s.icon} onChange={(v) => setSec(i, "icon", v)} small />}</td>
              <td>{rail && <input className="inp w-20" type="number" min={1} max={40} value={s.limit ?? 12} onChange={(e) => setSec(i, "limit", e.target.value)} />}</td>
            </tr>;
          })}</tbody></table>
      </Panel>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel title="SEO metni (sayfa altı)">
          <Field label="Başlık (h1)"><input className="inp" value={cfg.seoTitle ?? ""} onChange={(e) => setCfg({ ...cfg, seoTitle: e.target.value })} /></Field>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="İçerik (HTML)"><textarea className="inp h-72 py-1 font-mono text-xs" value={cfg.seoHtml ?? ""} onChange={(e) => setCfg({ ...cfg, seoHtml: e.target.value })} /></Field>
            <Field label="Önizleme"><div className="h-72 overflow-auto rounded bg-[#0f151b] p-3 text-sm text-[#818e9d] [&_h2]:mt-3 [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-3 [&_h3]:font-bold [&_h3]:text-white" dangerouslySetInnerHTML={{ __html: cfg.seoHtml ?? "" }} /></Field>
          </div>
        </Panel>
        <Panel title={`Sık sorulan sorular (${cfg.faq.length})`} right={<button className="btn-ghost" onClick={() => setCfg({ ...cfg, faq: [...cfg.faq, { q: "", a: "" }] })}>+ Soru ekle</button>}>
          {!cfg.faq.length && <p className="text-bo-muted">Henüz soru yok — boş kalırsa sitede varsayılan sorular gösterilir.</p>}
          <div className="space-y-3">{cfg.faq.map((f: any, i: number) => (
            <div key={i} className="rounded border border-bo-line p-2">
              <div className="flex gap-2"><input className="inp flex-1" placeholder="Soru" value={f.q} onChange={(e) => setFaq(i, "q", e.target.value)} /><button className="text-bo-red" onClick={() => setCfg({ ...cfg, faq: cfg.faq.filter((_: any, j: number) => j !== i) })}>Sil</button></div>
              <textarea className="inp mt-2 h-16 py-1" placeholder="Cevap" value={f.a} onChange={(e) => setFaq(i, "a", e.target.value)} />
            </div>
          ))}</div>
        </Panel>
      </div>
      <Err e={e} />
    </>
  );
}
