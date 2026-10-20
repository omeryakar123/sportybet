import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Panel, Field, Modal, DataTable, money, dt, num, Err, Tabs, Kpi } from "../ui";

export const P_STATUS: Record<string, [string, string]> = {
  draft: ["Taslak", "text-bo-muted"], active: ["Aktif", "text-bo-green"], locked: ["Kilitli", "text-bo-orange"], closed: ["Kapandı · Sonuç bekliyor", "text-bo-purple"],
  resolved: ["Sonuçlandı", "text-bo-blue"], cancelled: ["İptal (iade)", "text-bo-red"],
};
const PStatus = ({ s }: { s: string }) => <span className={P_STATUS[s]?.[1]}>{P_STATUS[s]?.[0] ?? s}</span>;
const POS_STATUS: Record<string, string> = { OPEN: "Açık", WON: "Kazandı", LOST: "Kaybetti", SOLD: "Bozduruldu", REFUNDED: "İade" };
const prob = (p: any) => `${(Number(p) * 100).toFixed(1)}%`;

async function act(id: string, action: string, extra: any = {}) { return api(`/admin/predictions/${id}/action`, { method: "POST", json: { action, ...extra } }); }

// ===================== Liste =====================
export function PredictionList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]); const [cats, setCats] = useState<any[]>([]); const [e, setE] = useState("");
  const [status, setStatus] = useState("active,locked,closed,draft"); const [category, setCategory] = useState(""); const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<any>(null); const [stats, setStats] = useState<any>(null);
  const load = () => {
    api(`/admin/predictions?${new URLSearchParams(Object.fromEntries(Object.entries({ status, category, search }).filter(([, v]) => v)))}`).then(setRows).catch((x) => setE(x.message));
    api("/admin/prediction-stats").then(setStats).catch(() => {});
  };
  useEffect(() => { load(); api("/admin/prediction-categories").then(setCats).catch(() => {}); }, [status, category]);
  const quick = async (id: string, a: string) => { setE(""); try { await act(id, a); load(); } catch (x: any) { setE(x.message); } };
  const st = (k: string) => stats?.byStatus?.find((x: any) => x.status === k);
  const mc = (k: string) => stats?.markets?.find((x: any) => x.status === k)?._count ?? 0;
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Aktif Piyasa" value={num(mc("active"))} icon="📈" color="bo-green" />
        <Kpi label="Sonuç Bekleyen" value={num(mc("closed"))} icon="⏳" color="bo-purple" />
        <Kpi label="Açık Pozisyon Tutarı" value={money(st("OPEN")?._sum?.stake)} icon="🎫" color="bo-blue" />
        <Kpi label="Toplam Yatırılan (kapanan)" value={money(["WON", "LOST", "SOLD"].reduce((a, k) => a + Number(st(k)?._sum?.stake ?? 0), 0))} icon="💵" color="teal" />
        <Kpi label="Toplam Ödenen" value={money(["WON", "SOLD"].reduce((a, k) => a + Number(st(k)?._sum?.payout ?? 0), 0))} icon="🏆" color="bo-red" />
        <Kpi label="İşlem Modu" value={stats?.settings?.tradingMode === "PAUSED" ? "⏸ DURDURULDU" : "▶ NORMAL"} icon="⚙" color={stats?.settings?.tradingMode === "PAUSED" ? "bo-red" : "lime"} />
      </div>
      <Panel title="Filtre">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Durum"><select className="inp w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active,locked,closed,draft">Açık olanlar (aktif, kilitli, bekleyen, taslak)</option><option value="active">Aktif</option><option value="locked">Kilitli</option>
            <option value="closed">Sonuç bekleyen</option><option value="draft">Taslak</option><option value="resolved">Sonuçlanan</option><option value="cancelled">İptal</option><option value="">Tümü</option></select></Field>
          <Field label="Kategori"><select className="inp w-44" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Tümü</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Soru"><input className="inp w-64" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} /></Field>
          <button className="btn-blue w-28" onClick={load}>Uygula</button>
        </div>
      </Panel>
      <Panel title={`Tahmin Piyasaları (${rows.length})`} right={<button className="btn-green" onClick={() => setEdit(newMarket())}>+ Yeni Tahmin</button>}>
        <Err e={e} />
        <DataTable rows={rows} pageSize={25} csvName="tahminler" cols={[
          { key: "image", label: "", sortable: false, render: (m) => m.image ? <img src={m.image} className="size-9 rounded object-cover" /> : <div className="size-9 rounded bg-bo-head" /> },
          { key: "question", label: "Soru", className: "max-w-md whitespace-normal", render: (m) => <div><Link className="text-bo-blue" to={`/predictions/${m.id}`}>{m.question}</Link>
            <div className="text-xs text-bo-muted">{m.categories.map((c: any) => c.category.name).join(", ")}{m.structure === "GROUP_PARENT" && ` · ${m.childCount} alt piyasa`}{m.source === "feed" && " · feed"}</div></div> },
          { key: "outcomes", label: "Sonuçlar / Oran", sortable: false, className: "whitespace-normal", render: (m) => <div className="flex flex-wrap gap-1">{m.outcomes.map((o: any) => <span key={o.id} className="rounded bg-bo-head px-1.5 text-xs">{o.name} <b>{prob(o.price)}</b></span>)}</div> },
          { key: "status", label: "Durum", render: (m) => <PStatus s={m.status} /> },
          { key: "oddsImpactMode", label: "Fiyat", value: (m) => (m.oddsImpactMode === "AFFECTS_ODDS" ? "Dinamik" : "Sabit") },
          { key: "deadline", label: "Son Tarih", render: (m) => <span className={m.deadline && new Date(m.deadline) < new Date() && ["active", "locked"].includes(m.status) ? "text-bo-red" : ""}>{dt(m.deadline)}</span> },
          { key: "totalVolume", label: "Hacim", money: true, value: (m) => Number(m.totalVolume), sum: true },
          { key: "openStake", label: "Açık Tutar", money: true, sum: true },
          { key: "positionCount", label: "Poz.", align: "right" },
          { key: "flags", label: "Al / Sat / Ana s.", sortable: false, render: (m) => <div className="flex gap-1 text-xs">
            <button onClick={() => quick(m.id, "toggleBuy")} className={`rounded px-1.5 ${m.buyEnabled ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>Al</button>
            <button onClick={() => quick(m.id, "toggleSell")} className={`rounded px-1.5 ${m.sellEnabled ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>Sat</button>
            <button onClick={() => quick(m.id, "toggleHomepage")} className={`rounded px-1.5 ${m.isHomepage ? "bg-sky-100 text-sky-700" : "bg-bo-head text-bo-muted"}`}>★</button></div> },
          { key: "actions", label: "İşlem", sortable: false, render: (m) => <div className="flex gap-1">
            {(m.status === "draft" || m.status === "locked" || m.status === "closed") && <button className="rounded bg-bo-green px-2 py-0.5 text-white" onClick={() => quick(m.id, "activate")}>{m.status === "locked" ? "Kilidi aç" : "Aç"}</button>}
            {m.status === "active" && <button className="rounded bg-bo-orange px-2 py-0.5 text-white" onClick={() => quick(m.id, "lock")}>Kilitle</button>}
            {!["resolved", "cancelled"].includes(m.status) && <button className="rounded bg-bo-blue px-2 py-0.5 text-white" onClick={() => nav(`/predictions/${m.id}`)}>Sonuçlandır</button>}
          </div> },
        ]} />
      </Panel>
      {edit && <MarketEditor init={edit} cats={cats} onClose={() => setEdit(null)} onDone={(id) => { setEdit(null); nav(`/predictions/${id}`); }} />}
    </>
  );
}

const newMarket = (parent?: any) => ({
  question: "", slug: "", structure: parent ? "GROUP_CHILD" : "STANDALONE", parentMarketId: parent?.id ?? null, oddsImpactMode: "NO_IMPACT", isHomepage: false, sortOrder: 0,
  buyEnabled: true, sellEnabled: true, image: parent?.image ?? "", rules: "", deadline: parent?.deadline ?? "", minStake: 10, maxStake: 5000, feePct: 2, liquidity: 10000,
  categoryIds: parent ? parent.categories?.map((c: any) => c.categoryId) ?? [] : [], outcomes: [{ name: "Evet", price: 0.5, buyEnabled: true, sellEnabled: true }, { name: "Hayır", price: 0.5, buyEnabled: true, sellEnabled: true }],
});

// ===================== Oluştur / Düzenle =====================
function MarketEditor({ init, cats, onClose, onDone }: { init: any; cats: any[]; onClose: () => void; onDone: (id: string) => void }) {
  const toLocal = (v: any) => (v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [m, setM] = useState<any>({ ...init, deadline: toLocal(init.deadline), minStake: Number(init.minStake), maxStake: Number(init.maxStake), feePct: Number(init.feePct ?? 0), liquidity: Number(init.liquidity ?? 10000),
    categoryIds: init.categoryIds ?? init.categories?.map((c: any) => c.categoryId) ?? [], outcomes: init.outcomes.map((o: any) => ({ ...o, price: Number(o.price) })) });
  const [e, setE] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setM({ ...m, [k]: v });
  const setO = (i: number, k: string, v: any) => setM({ ...m, outcomes: m.outcomes.map((o: any, j: number) => (j === i ? { ...o, [k]: v } : o)) });
  const sum = m.outcomes.reduce((a: number, o: any) => a + Number(o.price || 0), 0);
  async function save() {
    setBusy(true); setE("");
    try {
      const body = { ...m, deadline: m.deadline ? new Date(m.deadline).toISOString() : null, image: m.image || null, rules: m.rules || null, slug: m.slug || undefined,
        outcomes: m.outcomes.map((o: any) => ({ id: o.id, name: o.name, price: Number(o.price), color: o.color || null, image: o.image || null, buyEnabled: o.buyEnabled !== false, sellEnabled: o.sellEnabled !== false })) };
      for (const k of ["id", "createdAt", "updatedAt", "categories", "children", "risk", "totalVolume", "status", "resolvedOutcomeId", "resolvedAt", "resolvedByAdminId", "activatedAt", "externalId", "source", "metadata", "_count", "positionCount", "openStake", "childCount", "type"]) delete body[k];
      const r = init.id ? await api(`/admin/predictions/${init.id}`, { method: "PUT", json: body }) : await api("/admin/predictions", { method: "POST", json: body });
      onDone(r.id);
    } catch (x: any) { setE(x.message === "OUTCOMES_LOCKED_HAS_POSITIONS" ? "Pozisyon alınmış piyasada sonuç eklenemez/silinemez (sadece isim, fiyat, aç/kapa değişir)." : x.message); setBusy(false); }
  }
  return (
    <Modal title={init.id ? "Tahmini Düzenle" : m.structure === "GROUP_CHILD" ? "Alt Piyasa Ekle" : "Yeni Tahmin"} onClose={onClose} wide>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Soru *" className="col-span-4"><input className="inp" value={m.question} onChange={(e) => set("question", e.target.value)} placeholder="Ör. Galatasaray - Fenerbahçe derbisini kim kazanır?" /></Field>
        <Field label="Yapı"><select className="inp" value={m.structure} onChange={(e) => set("structure", e.target.value)} disabled={!!init.parentMarketId}><option value="STANDALONE">Tekil</option><option value="GROUP_PARENT">Grup (maç sayfası, alt piyasalar)</option><option value="GROUP_CHILD">Alt piyasa</option></select></Field>
        <Field label="Fiyatlama"><select className="inp" value={m.oddsImpactMode} onChange={(e) => set("oddsImpactMode", e.target.value)}><option value="NO_IMPACT">Sabit oran (admin belirler)</option><option value="AFFECTS_ODDS">Dinamik (bahis oranı etkiler, FPMM)</option></select></Field>
        <Field label="Son tarih (bahis kapanış)"><input type="datetime-local" className="inp" value={m.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
        <Field label="Slug (boş = otomatik)"><input className="inp" value={m.slug ?? ""} onChange={(e) => set("slug", e.target.value)} /></Field>
        <Field label="Min. bahis ₺"><input type="number" className="inp" value={m.minStake} onChange={(e) => set("minStake", e.target.value)} /></Field>
        <Field label="Maks. bahis ₺"><input type="number" className="inp" value={m.maxStake} onChange={(e) => set("maxStake", e.target.value)} /></Field>
        {m.oddsImpactMode === "AFFECTS_ODDS" && <>
          <Field label="Alım komisyonu %"><input type="number" step="0.1" className="inp" value={m.feePct} onChange={(e) => set("feePct", e.target.value)} /></Field>
          <Field label="Başlangıç likiditesi ₺"><input type="number" className="inp" value={m.liquidity} onChange={(e) => set("liquidity", e.target.value)} disabled={!!init.id} /></Field>
        </>}
        <Field label="Görsel URL" className="col-span-2"><input className="inp" value={m.image ?? ""} onChange={(e) => set("image", e.target.value)} /></Field>
        <Field label="Sıra (büyük önde)"><input type="number" className="inp" value={m.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex items-center gap-1"><input type="checkbox" checked={m.isHomepage} onChange={(e) => set("isHomepage", e.target.checked)} />Ana sayfa</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={m.buyEnabled} onChange={(e) => set("buyEnabled", e.target.checked)} />Alım</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={m.sellEnabled} onChange={(e) => set("sellEnabled", e.target.checked)} />Bozdurma</label>
        </div>
        <Field label="Kategoriler" className="col-span-4">
          <div className="flex flex-wrap gap-2">{cats.map((c) => { const on = m.categoryIds.includes(c.id); return (
            <button key={c.id} type="button" onClick={() => set("categoryIds", on ? m.categoryIds.filter((x: string) => x !== c.id) : [...m.categoryIds, c.id])} className={`rounded-full border px-3 py-0.5 ${on ? "border-bo-blue bg-bo-blue text-white" : "border-bo-line"}`}>{c.name}</button>); })}
            {cats.length === 0 && <span className="text-bo-muted">Önce "Tahmin Kategorileri"nden kategori ekleyin.</span>}</div>
        </Field>
      </div>

      <div className="mt-4 rounded border border-bo-line">
        <div className="flex items-center justify-between bg-bo-head px-3 py-2">
          <b>Sonuçlar</b>
          <span className={`text-xs ${m.oddsImpactMode === "NO_IMPACT" && sum < 1 ? "text-bo-red" : "text-bo-muted"}`}>
            Fiyat toplamı: {sum.toFixed(3)} {m.oddsImpactMode === "NO_IMPACT" ? (sum < 1 ? "· 1'in altında: kasa zararda! " : `· marj %${((sum - 1) * 100).toFixed(1)}`) : "· dinamikte başlangıç olasılığı olarak kullanılır"}
          </span>
        </div>
        <table className="tbl"><thead><tr><th>Ad</th><th>Fiyat (0.01–0.99)</th><th>Olasılık</th><th>Oran (1/fiyat)</th><th>Renk</th><th>Alım</th><th>Bozdurma</th><th></th></tr></thead>
          <tbody>{m.outcomes.map((o: any, i: number) => (
            <tr key={i}>
              <td><input className="inp" value={o.name} onChange={(e) => setO(i, "name", e.target.value)} /></td>
              <td><input type="number" step="0.01" min="0.01" max="0.99" className="inp w-28" value={o.price} onChange={(e) => setO(i, "price", e.target.value)} /></td>
              <td>{prob(o.price)}</td><td>{Number(o.price) ? (1 / Number(o.price)).toFixed(2) : "—"}</td>
              <td><input type="color" value={o.color || "#00ae61"} onChange={(e) => setO(i, "color", e.target.value)} /></td>
              <td><input type="checkbox" checked={o.buyEnabled !== false} onChange={(e) => setO(i, "buyEnabled", e.target.checked)} /></td>
              <td><input type="checkbox" checked={o.sellEnabled !== false} onChange={(e) => setO(i, "sellEnabled", e.target.checked)} /></td>
              <td>{m.outcomes.length > 2 && <button className="text-bo-red" onClick={() => setM({ ...m, outcomes: m.outcomes.filter((_: any, j: number) => j !== i) })}>✕</button>}</td>
            </tr>))}</tbody></table>
        <div className="p-2"><button className="btn-ghost" onClick={() => setM({ ...m, outcomes: [...m.outcomes, { name: "", price: 0.1, buyEnabled: true, sellEnabled: true }] })}>+ Sonuç ekle</button></div>
      </div>
      <Field label="Kurallar (HTML) — nasıl sonuçlanır, kaynak, iptal halleri" className="mt-3"><textarea className="inp h-32 py-1 font-mono text-xs" value={m.rules ?? ""} onChange={(e) => set("rules", e.target.value)} /></Field>
      <Err e={e} />
      <div className="mt-4 flex justify-end gap-2"><span className="self-center text-bo-muted">{init.id ? "" : "Taslak olarak kaydedilir; detay sayfasından 'Aç' ile yayına alınır."}</span><button className="btn-green" disabled={busy || !m.question} onClick={save}>Kaydet</button></div>
    </Modal>
  );
}

// ===================== Detay =====================
export function PredictionDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const [m, setM] = useState<any>(null); const [pos, setPos] = useState<any[]>([]); const [cats, setCats] = useState<any[]>([]); const [e, setE] = useState("");
  const [edit, setEdit] = useState<any>(null); const [resolve, setResolve] = useState(false); const [lock, setLock] = useState(false); const [prices, setPrices] = useState<Record<string, number> | null>(null);
  const [tab, setTab] = useState<"Risk" | "Pozisyonlar" | "Alt Piyasalar" | "Kurallar">("Risk");
  const load = () => { api(`/admin/predictions/${id}`).then(setM).catch((x) => setE(x.message)); api(`/admin/predictions/${id}/positions`).then(setPos).catch(() => {}); };
  useEffect(() => { load(); api("/admin/prediction-categories").then(setCats).catch(() => {}); }, [id]);
  const run = async (a: string, extra: any = {}) => { setE(""); try { const r = await act(m.id, a, extra); load(); return r; } catch (x: any) { setE(x.message); } };
  if (!m) return <Err e={e} />;
  const settled = ["resolved", "cancelled"].includes(m.status);
  const winner = m.outcomes.find((o: any) => o.id === m.resolvedOutcomeId);
  return (
    <>
      <div className="mb-2"><Link to="/predictions" className="text-bo-blue">Tahminler</Link>{m.parentMarketId && <> › <Link className="text-bo-blue" to={`/predictions/${m.parentMarketId}`}>Ana piyasa</Link></>} › <b>{m.question}</b></div>
      <Err e={e} />
      <Panel title={<span className="flex items-center gap-3">{m.image && <img src={m.image} className="size-8 rounded object-cover" />}{m.question}</span>} right={
        <div className="flex flex-wrap gap-1">
          {!settled && <button className="btn-ghost" onClick={() => setEdit({ ...m })}>✎ Düzenle</button>}
          {["draft", "locked", "closed"].includes(m.status) && <button className="btn-green" onClick={() => run("activate")}>{m.status === "locked" ? "Kilidi Aç" : "Aç (yayınla)"}</button>}
          {m.status === "active" && <button className="btn bg-bo-orange" onClick={() => setLock(true)}>Kilitle</button>}
          {["active", "locked"].includes(m.status) && <button className="btn bg-bo-purple" onClick={() => run("close")}>Bahsi Kapat</button>}
          {!settled && <button className="btn-blue" onClick={() => setResolve(true)}>Sonuçlandır</button>}
          {!settled && <button className="btn bg-bo-red" onClick={() => { if (confirm("Piyasa iptal edilsin mi? Tüm açık pozisyonlar tam iade edilir.")) run("cancel"); }}>İptal + İade</button>}
          {m.structure === "GROUP_PARENT" && !settled && <button className="btn-ghost" onClick={() => setEdit(newMarket(m))}>+ Alt Piyasa</button>}
        </div>}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          <div><div className="text-bo-muted">Durum</div><PStatus s={m.status} />{m.metadata?.lockReason && <div className="text-xs text-bo-orange">{m.metadata.lockReason}</div>}</div>
          <div><div className="text-bo-muted">Fiyatlama</div>{m.oddsImpactMode === "AFFECTS_ODDS" ? `Dinamik (komisyon %${Number(m.feePct)})` : "Sabit oran"}</div>
          <div><div className="text-bo-muted">Son tarih</div>{dt(m.deadline)}</div>
          <div><div className="text-bo-muted">Hacim</div>{money(m.totalVolume)}</div>
          <div><div className="text-bo-muted">Bahis limiti</div>{money(m.minStake)} – {money(m.maxStake)}</div>
          <div><div className="text-bo-muted">Kategoriler</div>{m.categories.map((c: any) => c.category.name).join(", ") || "—"}</div>
          <div><div className="text-bo-muted">Alım / Bozdurma</div><button onClick={() => run("toggleBuy")} className={m.buyEnabled ? "text-bo-green" : "text-bo-red"}>{m.buyEnabled ? "Alım açık" : "Alım kapalı"}</button> / <button onClick={() => run("toggleSell")} className={m.sellEnabled ? "text-bo-green" : "text-bo-red"}>{m.sellEnabled ? "Bozdurma açık" : "kapalı"}</button></div>
          <div><div className="text-bo-muted">Ana sayfa</div><button onClick={() => run("toggleHomepage")} className="text-bo-blue">{m.isHomepage ? "★ Evet" : "☆ Hayır"}</button></div>
          <div><div className="text-bo-muted">Yapı</div>{({ STANDALONE: "Tekil", GROUP_PARENT: "Grup", GROUP_CHILD: "Alt piyasa" } as any)[m.structure]}</div>
          <div><div className="text-bo-muted">Kaynak</div>{m.source === "feed" ? `Feed (${m.externalId?.slice(0, 8)}…)` : "Yerel"}</div>
          <div><div className="text-bo-muted">Slug</div><span className="font-mono text-xs">{m.slug}</span></div>
          {winner && <div><div className="text-bo-muted">Kazanan</div><b className="text-bo-green">{winner.name}</b> · {dt(m.resolvedAt)}</div>}
        </div>
      </Panel>

      <Tabs tabs={["Risk", "Pozisyonlar", ...(m.structure === "GROUP_PARENT" ? ["Alt Piyasalar" as const] : []), "Kurallar"] as any} value={tab} onChange={setTab as any} />
      {tab === "Risk" && <Panel title="Sonuçlar ve Risk" right={m.oddsImpactMode === "NO_IMPACT" && !settled && (prices
        ? <div className="flex gap-2"><button className="btn-green" onClick={async () => { await run("prices", { prices }); setPrices(null); }}>Fiyatları Kaydet</button><button className="btn-ghost" onClick={() => setPrices(null)}>Vazgeç</button></div>
        : <button className="btn-ghost" onClick={() => setPrices(Object.fromEntries(m.outcomes.map((o: any) => [o.id, Number(o.price)])))}>Fiyatları Güncelle</button>)}>
        <table className="tbl"><thead><tr><th>Sonuç</th><th className="text-right">Fiyat</th><th className="text-right">Olasılık</th><th className="text-right">Oran</th><th className="text-right">Açık Poz.</th><th className="text-right">Yatırılan</th><th className="text-right">Kazanırsa Ödeme</th><th className="text-right">Kazanırsa Kasa K/Z</th><th>Alım / Bozdurma</th></tr></thead>
          <tbody>{m.risk.outcomes.map((r: any) => { const o = m.outcomes.find((x: any) => x.id === r.id); return (
            <tr key={r.id} className={m.resolvedOutcomeId === r.id ? "bg-emerald-50" : ""}>
              <td><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: o.color || "#2a8bd8" }} />{r.name}{m.resolvedOutcomeId === r.id && " 🏆"}</td>
              <td className="text-right">{prices ? <input type="number" step="0.01" className="inp w-24 text-right" value={prices[r.id]} onChange={(e) => setPrices({ ...prices, [r.id]: Number(e.target.value) })} /> : Number(r.price).toFixed(4)}</td>
              <td className="text-right">{prob(prices ? prices[r.id] : r.price)}</td><td className="text-right">{(1 / Number(prices ? prices[r.id] : r.price)).toFixed(2)}</td>
              <td className="text-right">{r.openPositions}</td><td className="text-right">{money(r.openStake)}</td><td className="text-right">{money(r.payoutIfWin)}</td>
              <td className={`text-right font-medium ${r.houseResultIfWins < 0 ? "text-bo-red" : "text-bo-green"}`}>{money(r.houseResultIfWins)}</td>
              <td className="text-xs"><button onClick={() => api(`/admin/predictions/outcomes/${r.id}/toggle`, { method: "POST", json: { field: "buyEnabled" } }).then(load)} className={o.buyEnabled ? "text-bo-green" : "text-bo-red"}>{o.buyEnabled ? "Alım ✓" : "Alım ✕"}</button> · <button onClick={() => api(`/admin/predictions/outcomes/${r.id}/toggle`, { method: "POST", json: { field: "sellEnabled" } }).then(load)} className={o.sellEnabled ? "text-bo-green" : "text-bo-red"}>{o.sellEnabled ? "Boz. ✓" : "Boz. ✕"}</button></td>
            </tr>); })}</tbody>
          <tfoot><tr className="bg-bo-head font-medium"><td className="px-3 py-2">Toplam açık</td><td /><td className="px-3 text-right">{prob(m.outcomes.reduce((a: number, o: any) => a + Number(o.price), 0))}</td><td /><td /><td className="px-3 text-right">{money(m.risk.openStakeTotal)}</td><td /><td /><td /></tr></tfoot>
        </table>
        <p className="mt-2 text-bo-muted">Kapanan pozisyonlar: yatırılan {money(m.risk.closed.stake)} · ödenen {money(m.risk.closed.payout)} · kasa {money(m.risk.closed.stake - m.risk.closed.payout)}</p>
      </Panel>}
      {tab === "Pozisyonlar" && <Panel title={`Pozisyonlar (${pos.length})`}><PositionTable rows={pos} showMarket={false} /></Panel>}
      {tab === "Alt Piyasalar" && <Panel title="Alt Piyasalar" right={!settled && <button className="btn-green" onClick={() => setEdit(newMarket(m))}>+ Alt Piyasa</button>}>
        <DataTable rows={m.children} search={false} cols={[
          { key: "question", label: "Soru", render: (c) => <Link className="text-bo-blue" to={`/predictions/${c.id}`}>{c.question}</Link> },
          { key: "outcomes", label: "Oranlar", sortable: false, render: (c) => c.outcomes.map((o: any) => `${o.name} ${prob(o.price)}`).join(" · ") },
          { key: "status", label: "Durum", render: (c) => <PStatus s={c.status} /> }, { key: "totalVolume", label: "Hacim", money: true }, { key: "deadline", label: "Son tarih", render: (c) => dt(c.deadline) },
        ]} />
      </Panel>}
      {tab === "Kurallar" && <Panel title="Kurallar"><div className="prose max-w-none rounded bg-neutral-900 p-4 text-sm text-white [&_a]:text-lime-400" dangerouslySetInnerHTML={{ __html: m.rules || "<i>Kural metni yok</i>" }} /></Panel>}

      {edit && <MarketEditor init={edit} cats={cats} onClose={() => setEdit(null)} onDone={(nid) => { setEdit(null); if (nid !== m.id) nav(`/predictions/${nid}`); else load(); }} />}
      {resolve && <ResolveModal m={m} onClose={() => setResolve(false)} onDone={() => { setResolve(false); load(); }} />}
      {lock && <LockModal onClose={() => setLock(false)} onDone={async (reason) => { setLock(false); await run("lock", { reason }); }} />}
    </>
  );
}

function ResolveModal({ m, onClose, onDone }: any) {
  const [oid, setOid] = useState(""); const [e, setE] = useState(""); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null);
  const r = m.risk.outcomes.find((x: any) => x.id === oid);
  async function go() { setBusy(true); setE(""); try { setRes(await act(m.id, "resolve", { outcomeId: oid })); } catch (x: any) { setE(x.message); setBusy(false); } }
  return (
    <Modal title="Piyasayı Sonuçlandır" onClose={res ? onDone : onClose}>
      {res ? <div><p className="text-bo-green">✓ Sonuçlandırıldı. {res.positions} pozisyon kapandı, {money(res.paid)} ödendi.</p><div className="mt-4 flex justify-end"><button className="btn-blue" onClick={onDone}>Tamam</button></div></div> : <>
        <p className="mb-3">{m.question}</p>
        <div className="grid gap-2">{m.outcomes.map((o: any) => (
          <label key={o.id} className={`flex cursor-pointer items-center justify-between rounded border p-3 ${oid === o.id ? "border-bo-green bg-emerald-50" : "border-bo-line"}`}>
            <span><input type="radio" name="w" className="mr-2" checked={oid === o.id} onChange={() => setOid(o.id)} />{o.name}</span><span className="text-bo-muted">{prob(o.price)}</span>
          </label>))}</div>
        {r && <p className="mt-3 rounded bg-bo-head p-2">Kazanan <b>{r.name}</b> olursa: {r.openPositions} pozisyona <b>{money(r.payoutIfWin)}</b> ödenir · kasa sonucu <b className={r.houseResultIfWins < 0 ? "text-bo-red" : "text-bo-green"}>{money(r.houseResultIfWins)}</b>. Bu işlem geri alınamaz.</p>}
        <Err e={e} />
        <div className="mt-4 flex justify-end"><button className="btn-blue" disabled={!oid || busy} onClick={go}>Sonuçlandır ve Öde</button></div>
      </>}
    </Modal>
  );
}

function LockModal({ onClose, onDone }: { onClose: () => void; onDone: (r: string) => void }) {
  const [r, setR] = useState("");
  return (
    <Modal title="Piyasayı Kilitle (geçici durdur)" onClose={onClose}>
      <p className="mb-2 text-bo-muted">Kilitli piyasada alım ve bozdurma durur. Sebep sitede gösterilir.</p>
      <Field label="Sebep"><input className="inp" value={r} onChange={(e) => setR(e.target.value)} placeholder="Ör. Veri doğrulanıyor, birkaç dakika bahis durdu" /></Field>
      <div className="mt-4 flex justify-end"><button className="btn bg-bo-orange" onClick={() => onDone(r)}>Kilitle</button></div>
    </Modal>
  );
}

export function PositionTable({ rows, showMarket = true }: { rows: any[]; showMarket?: boolean }) {
  return <DataTable rows={rows} csvName="tahmin_pozisyonlari" cols={[
    { key: "id", label: "ID" }, { key: "createdAt", label: "Zaman", render: (r) => dt(r.createdAt) },
    { key: "player", label: "Oyuncu", value: (r) => r.player?.username, render: (r) => <Link className="text-bo-blue" to={`/players/${r.playerId}`}>{r.player?.username}</Link> },
    ...(showMarket ? [{ key: "market", label: "Piyasa", value: (r: any) => r.market?.question, className: "max-w-xs truncate", render: (r: any) => <Link className="text-bo-blue" to={`/predictions/${r.marketId}`}>{r.market?.question}</Link> }] : []),
    { key: "outcome", label: "Seçim", value: (r) => r.outcome?.name },
    { key: "wallet", label: "Cüzdan", value: (r) => (r.wallet === "BONUS" ? "Bonus" : "Ana") },
    { key: "stake", label: "Yatırılan", money: true, sum: true }, { key: "price", label: "Fiyat", value: (r) => Number(r.price).toFixed(4), align: "right" },
    { key: "shares", label: "Pay (= kazanırsa ₺)", value: (r) => Number(r.shares).toFixed(2), align: "right" },
    { key: "status", label: "Durum", value: (r) => POS_STATUS[r.status] ?? r.status },
    { key: "payout", label: "Ödenen", money: true, sum: true }, { key: "closedAt", label: "Kapanış", render: (r) => dt(r.closedAt) },
  ]} />;
}

export function PredictionPositions() {
  const [rows, setRows] = useState<any[]>([]); const [status, setStatus] = useState(""); const [playerId, setPlayerId] = useState("");
  const load = () => api(`/admin/prediction-positions?${new URLSearchParams(Object.fromEntries(Object.entries({ status, playerId }).filter(([, v]) => v)))}`).then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <Panel title="Tüm Tahmin Pozisyonları" right={<div className="flex gap-2">
      <select className="inp w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tümü</option>{Object.entries(POS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input className="inp w-32" placeholder="Oyuncu ID" value={playerId} onChange={(e) => setPlayerId(e.target.value)} /><button className="btn-blue" onClick={load}>Uygula</button></div>}>
      <PositionTable rows={rows} />
    </Panel>
  );
}

export function PredictionCategories() {
  const [rows, setRows] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [e, setE] = useState("");
  const load = () => api("/admin/prediction-categories").then(setRows);
  useEffect(() => { load(); }, []);
  async function save() {
    setE("");
    try { const { id, _count, ...d } = edit; await api(id ? `/admin/prediction-categories/${id}` : "/admin/prediction-categories", { method: id ? "PATCH" : "POST", json: { ...d, sortOrder: Number(d.sortOrder || 0), parentId: d.parentId || null } }); setEdit(null); load(); }
    catch (x: any) { setE(x.message === "ALREADY_EXISTS" ? "Bu slug zaten var" : x.message); }
  }
  return (
    <>
      <Panel title="Tahmin Kategorileri" right={<button className="btn-green" onClick={() => setEdit({ name: "", slug: "", description: "", icon: "", parentId: "", sortOrder: 0, isActive: true })}>+ Kategori</button>}>
        <p className="mb-2 text-bo-muted">Sitedeki tahmin menüsü (Siyaset, Futbol, Kripto, Ekonomi…). Sayı = bağlı piyasa.</p>
        <DataTable rows={rows} search={false} cols={[
          { key: "sortOrder", label: "Sıra" }, { key: "name", label: "Ad" }, { key: "slug", label: "Slug", className: "font-mono" }, { key: "icon", label: "İkon" },
          { key: "parentId", label: "Üst", value: (r) => rows.find((x) => x.id === r.parentId)?.name ?? "" }, { key: "count", label: "Piyasa", value: (r) => r._count?.markets ?? 0, align: "right" },
          { key: "isActive", label: "Aktif", value: (r) => (r.isActive ? "Evet" : "Hayır") },
          { key: "x", label: "", sortable: false, render: (r) => <button className="text-bo-blue" onClick={() => setEdit({ ...r, parentId: r.parentId ?? "" })}>Düzenle</button> },
        ]} />
      </Panel>
      {edit && <Modal title="Kategori" onClose={() => setEdit(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ad"><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Slug (boş = otomatik)"><input className="inp" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
          <Field label="İkon (emoji veya ikon adı)"><input className="inp" value={edit.icon ?? ""} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} /></Field>
          <Field label="Üst kategori"><select className="inp" value={edit.parentId} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}><option value="">—</option>{rows.filter((r) => r.id !== edit.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Sıra"><input type="number" className="inp" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} /></Field>
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Aktif</label>
          <Field label="Açıklama" className="col-span-2"><input className="inp" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        </div>
        <Err e={e} />
        <div className="mt-4 flex justify-end"><button className="btn-green" onClick={save}>Kaydet</button></div>
      </Modal>}
    </>
  );
}

export function PredictionSettings() {
  const [s, setS] = useState<any>(null); const [feed, setFeed] = useState<any>(null); const [msg, setMsg] = useState(""); const [e, setE] = useState("");
  const [json, setJson] = useState(""); const [activate, setActivate] = useState(false); const [busy, setBusy] = useState(false);
  const load = () => api("/admin/prediction-settings").then((r) => { setS(r.settings); setFeed({ ...r.feed, apiKey: "" }); });
  useEffect(() => { load(); }, []);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const wrap = async (f: () => Promise<any>) => { setE(""); setBusy(true); try { await f(); } catch (x: any) { setE(x.message); } setBusy(false); };
  if (!s) return null;
  return (
    <>
      <div className="mb-2 text-right text-bo-green">{msg}</div><Err e={e} />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Genel İşlem Ayarları" right={<button className="btn-blue" onClick={() => wrap(async () => { await api("/admin/prediction-settings", { method: "PUT", json: { ...s, sellFeePct: Number(s.sellFeePct || 0) } }); flash("Kaydedildi ✓"); })}>Kaydet</button>}>
          <div className="grid gap-3">
            <Field label="İşlem modu"><select className="inp" value={s.tradingMode} onChange={(e) => setS({ ...s, tradingMode: e.target.value })}><option value="NORMAL">NORMAL — alım/bozdurma açık</option><option value="PAUSED">DURDURULDU — tüm tahminlerde işlem kapalı</option></select></Field>
            <Field label="Sitede gösterilecek duyuru (boş = yok)"><input className="inp" value={s.notice ?? ""} onChange={(e) => setS({ ...s, notice: e.target.value || null })} /></Field>
            <Field label="Bozdurma kesintisi %"><input type="number" step="0.1" className="inp w-32" value={s.sellFeePct ?? 0} onChange={(e) => setS({ ...s, sellFeePct: e.target.value })} /></Field>
          </div>
        </Panel>
        <Panel title="Dış Tahmin Feed'i (otomatik senkron)" right={<div className="flex gap-2">
          <button className="btn-ghost" disabled={busy} onClick={() => wrap(async () => { const r = await api("/admin/prediction-feed/sync", { method: "POST", json: {} }); flash(r.skipped ? "Feed kapalı veya URL yok" : `${r.imported} piyasa senkronlandı ✓`); load(); })}>Şimdi Senkronla</button>
          <button className="btn-blue" onClick={() => wrap(async () => { await api("/admin/prediction-feed", { method: "PUT", json: { ...feed, limit: Number(feed.limit || 50), maxPages: Number(feed.maxPages || 10) } }); flash("Feed ayarı kaydedildi ✓"); })}>Kaydet</button></div>}>
          <div className="grid gap-3">
            <p className="text-bo-muted">Sağlayıcının liste ucu (ör. <code>https://…/api/markets</code>). Cevap formatı: <code>{"{success, data:[…], pagination}"}</code>. 5 dakikada bir çekilir; fiyatlar feed'den gelir, sonuçlandırma burada yapılır.</p>
            <Field label="Feed URL"><input className="inp" value={feed.url ?? ""} onChange={(e) => setFeed({ ...feed, url: e.target.value })} /></Field>
            <Field label="API anahtarı (boş = değişmez)"><input className="inp" type="password" value={feed.apiKey} onChange={(e) => setFeed({ ...feed, apiKey: e.target.value })} /></Field>
            <div className="flex gap-6">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!feed.enabled} onChange={(e) => setFeed({ ...feed, enabled: e.target.checked })} />Senkron açık</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!feed.autoActivate} onChange={(e) => setFeed({ ...feed, autoActivate: e.target.checked })} />Gelenleri otomatik yayınla</label>
            </div>
            {feed.lastSyncAt && <p className="text-bo-muted">Son senkron: {dt(feed.lastSyncAt)} · {feed.lastSyncCount} piyasa</p>}
          </div>
        </Panel>
      </div>
      <Panel title="JSON ile İçe Aktar" right={<button className="btn-green" disabled={busy || !json} onClick={() => wrap(async () => { const r = await api("/admin/predictions/import", { method: "POST", json: { payload: json, activate } }); flash(`${r.imported} piyasa içe aktarıldı${r.errors.length ? `, ${r.errors.length} hata` : ""} ✓`); setJson(""); })}>İçe Aktar</button>}>
        <p className="mb-2 text-bo-muted">Sağlayıcı cevabını (feed formatındaki JSON) buraya yapıştırın. Aynı piyasa tekrar gelirse güncellenir (dış ID ile eşleşir).</p>
        <textarea className="h-48 w-full rounded border border-bo-line bg-[#f7f8fb] p-2 font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"success":true,"data":[{"id":"…","question":"…","outcomes":[…]}]}' />
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />Feed'deki durumla yayınla (aksi halde taslak gelir)</label>
      </Panel>
    </>
  );
}
