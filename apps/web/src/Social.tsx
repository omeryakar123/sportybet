import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import { Avatar, ErrBox, FlagTR, I, IconTile, money, useStore } from "./lib";

/* ============================================================
 * SOHBET — 3 sn'de bir yeni mesajlar (after=id), yağmur kartı, susturma bildirimi.
 * ============================================================ */
type Msg = { id: number; kind: "MSG" | "RAIN" | "TIP" | "SYSTEM"; text: string; meta?: any; at: string; user: { id: number; name: string; avatar?: string | null } | null };
type ChatState = { online: number; enabled: boolean; rain: { id: number; amount: number; endsAt: string; joined: boolean; count: number } | null; me: { banned: boolean; mutedUntil: string | null } | null; limits: any };

const hhmm = (s: string) => new Date(s).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const BLOCK_TR: Record<string, string> = { MUTE_10M: "10 dakika", MUTE_1H: "1 saat", MUTE_24H: "24 saat", BAN: "kalıcı" };

function useNow(ms = 1000) { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; }

function RainCard({ rain, onJoin, busy }: { rain: NonNullable<ChatState["rain"]>; onJoin: () => void; busy: boolean }) {
  const now = useNow();
  const left = Math.max(0, Math.ceil((new Date(rain.endsAt).getTime() - now) / 1000));
  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-xl border border-primary/40 bg-[linear-gradient(120deg,rgba(0,255,129,.18),rgba(0,232,255,.08))] p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/20 text-primary"><I n="rain" className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-[13px] font-extrabold">Yağmur başladı <span className="num text-[17px] text-primary">{money(rain.amount)}</span></div>
          <div className="text-[12px] font-semibold text-subtle">{rain.count} katılımcı · {left} sn kaldı</div>
        </div>
        <button disabled={rain.joined || busy || left === 0} onClick={onJoin} className="btn btn-primary btn-sm shrink-0 px-4">{rain.joined ? "Katıldın" : "Katıl"}</button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/25"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (left / 60) * 100)}%` }} /></div>
    </div>
  );
}

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const { me, setAuthOpen, openProfile, refreshMe, setWalletOpen, setTipTo } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [st, setSt] = useState<ChatState | null>(null);
  const [text, setText] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [rainOpen, setRainOpen] = useState(false); const [rainAmt, setRainAmt] = useState("100");
  const lastId = useRef(0); const box = useRef<HTMLDivElement>(null); const stick = useRef(true);

  const poll = async () => {
    try {
      const r: any = await api(`/api/chat?room=tr${lastId.current ? `&after=${lastId.current}` : ""}`);
      setSt({ online: r.online, enabled: r.enabled, rain: r.rain, me: r.me, limits: r.limits });
      if (r.messages.length || r.deleted?.length) {
        setMsgs((m) => {
          const base = lastId.current ? m : [];
          const del = new Set<number>(r.deleted ?? []);
          return [...base.filter((x) => !del.has(x.id)), ...r.messages].slice(-150);
        });
        if (r.messages.length) lastId.current = r.messages[r.messages.length - 1].id;
      }
    } catch {}
  };
  useEffect(() => { poll(); const t = setInterval(poll, 3000); return () => clearInterval(t); }, []);
  useEffect(() => { if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);

  const errText = (e: any) => {
    if (e.message === "MESSAGE_BLOCKED") { const d = e.detail ?? {}; return `Mesajın yayınlanmadı: ${d.reasonText ?? "kural ihlali"}.${d.action && d.action !== "WARN" ? ` Ceza: ${BLOCK_TR[d.action] ?? d.action} susturma.` : " Tekrarlarsan susturulursun."}`; }
    if (e.message === "SLOW_MODE") return `Biraz yavaş — ${e.detail?.waitSec ?? 2} sn bekle`;
    if (e.message === "RAIN_MIN") return `Yağmur en az ${money(e.detail?.min)}`;
    return e.message;
  };
  async function sendMsg() {
    if (!me) { setAuthOpen(true); return; }
    const t = text.trim(); if (!t) return;
    // iyimser: mesajı hemen göster; sunucu reddederse geri çek ve metni kutuya geri koy
    const tmpId = -Date.now();
    setMsgs((m) => [...m, { id: tmpId, kind: "MSG", text: t, at: new Date().toISOString(), user: { id: me.id, name: me.username, avatar: me.avatar }, meta: { pending: true } }]);
    setText(""); setErr(""); stick.current = true;
    try { await api("/api/chat", { method: "POST", json: { text: t } }); setMsgs((m) => m.filter((x) => x.id !== tmpId)); await poll(); }
    catch (e: any) { setMsgs((m) => m.filter((x) => x.id !== tmpId)); setText(t); setErr(errText(e)); if (e.message === "MESSAGE_BLOCKED") await poll(); }
  }
  async function join() {
    if (!me) { setAuthOpen(true); return; }
    if (!st?.rain) return; setBusy(true); setErr("");
    try { await api(`/api/chat/rain/${st.rain.id}/join`, { method: "POST" }); await poll(); } catch (e: any) { setErr(errText(e)); }
    setBusy(false);
  }
  async function makeRain() {
    if (!me) { setAuthOpen(true); return; }
    setBusy(true); setErr("");
    try { await api("/api/chat/rain", { method: "POST", json: { amount: Number(rainAmt.replace(",", ".")) } }); setRainOpen(false); refreshMe(); await poll(); } catch (e: any) { setErr(errText(e)); }
    setBusy(false);
  }
  const muted = st?.me;

  return (
    <div className="flex h-full flex-col bg-panel-deep">
      <div className="flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-line/60 px-3">
        <span className="flex h-9 items-center gap-2 rounded-lg bg-card px-3 text-sm font-bold"><FlagTR />Türkçe</span>
        <span className="ml-auto flex items-center gap-1.5 text-[13px] font-bold text-soft"><span className="live-dot size-2 rounded-full bg-primary" />{st?.online ?? 0}</span>
        <button onClick={onClose} className="grid size-8 place-items-center rounded-full bg-card text-subtle hover:text-fg" aria-label="Sohbeti kapat"><I n="x" className="size-4" /></button>
      </div>
      {st?.rain && <div className="pt-2"><RainCard rain={st.rain} onJoin={join} busy={busy} /></div>}
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} className="sb-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2" role="log" aria-label="Sohbet mesajları" aria-live="polite">
        {msgs.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-subtle">Henüz mesaj yok. İlk yazan sen ol!</div>}
        {msgs.map((m) => m.kind === "SYSTEM" ? (
          <div key={m.id} className="mx-2 rounded-lg bg-card/60 px-3 py-2 text-center text-[12px] font-semibold text-soft">{m.text}</div>
        ) : m.kind === "RAIN" || m.kind === "TIP" ? (
          <div key={m.id} className="mx-2 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary"><I n={m.kind === "RAIN" ? "rain" : "tip"} className="size-4 shrink-0" /><span className="min-w-0 flex-1">{m.text}</span><span className="text-[10px] text-subtle">{hhmm(m.at)}</span></div>
        ) : (
          <div key={m.id} className={`group flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-card/50 ${m.user?.id === me?.id ? "bg-card/40" : ""}`}>
            <button onClick={() => m.user && openProfile(m.user.id)} className="shrink-0 pt-0.5"><Avatar src={m.user?.avatar} name={m.user?.name ?? "?"} className="size-8" /></button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <button onClick={() => m.user && openProfile(m.user.id)} className="truncate text-[13px] font-extrabold text-primary hover:underline">{m.user?.name ?? "—"}</button>
                <span className="text-[10px] font-semibold text-dim">{hhmm(m.at)}</span>
                {me && m.user && m.user.id !== me.id && <button onClick={() => { setTipTo(m.user!.name); setWalletOpen("tip"); }} className="ml-auto hidden text-subtle hover:text-primary group-hover:block" title="Bahşiş gönder" aria-label="Bahşiş gönder"><I n="tip" className="size-4" /></button>}
              </div>
              <div className={`break-words text-[13px] font-medium leading-snug text-muted ${m.meta?.pending ? "opacity-60" : ""}`}>{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-line/60 p-3">
        {err && <div className="mb-2 rounded-md bg-loss/10 px-3 py-2 text-[12px] font-semibold text-loss">{err}</div>}
        {muted ? (
          <div className="rounded-lg bg-caution/10 px-3 py-3 text-center text-[13px] font-semibold text-caution">{muted.banned ? "Sohbet kullanımın kapatıldı." : `Susturuldun — ${new Date(muted.mutedUntil!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}'e kadar yazamazsın.`}</div>
        ) : rainOpen ? (
          <div className="space-y-2">
            <div className="text-[12px] font-semibold text-subtle">Yağmur: tutar {st?.limits?.rainMin ? `(min ${money(st.limits.rainMin)})` : ""} 60 sn içinde katılanlara eşit dağıtılır.</div>
            <div className="flex gap-2">
              <label className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-field px-2"><span className="grid size-6 place-items-center rounded bg-primary text-[13px] font-extrabold text-primary-fg">₺</span><input aria-label="Yağmur tutarı" value={rainAmt} onChange={(e) => setRainAmt(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" className="w-full bg-transparent font-bold outline-none" /></label>
              <button disabled={busy} onClick={makeRain} className="btn btn-primary px-4">Başlat</button>
              <button onClick={() => setRainOpen(false)} className="h-11 rounded-lg bg-card px-3 text-subtle hover:text-fg"><I n="x" className="size-4" /></button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <input aria-label="Sohbet mesajı" value={text} maxLength={st?.limits?.maxLen ?? 200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMsg()} onFocus={() => !me && setAuthOpen(true)}
              placeholder={me ? "Bir şeyler yaz…" : "Yazmak için giriş yap"} className="input min-w-0 flex-1 text-sm" />
            {st?.limits?.rainEnabled && <button onClick={() => (me ? setRainOpen(true) : setAuthOpen(true))} title="Yağmur başlat" aria-label="Yağmur başlat" className="grid size-11 shrink-0 place-items-center rounded-lg bg-card text-accent hover:bg-surface-hover"><I n="rain" className="size-5" /></button>}
            <button disabled={busy || !text.trim()} onClick={sendMsg} className="grid size-11 shrink-0 place-items-center rounded-lg bg-card text-primary hover:bg-surface-hover disabled:opacity-40" aria-label="Gönder"><I n="send" className="size-5" /></button>
          </div>
        )}
        <div className="mt-2 text-center text-[10px] font-semibold text-dim">Küfür, dilenme, link/reklam otomatik engellenir ve susturma ile sonuçlanır.</div>
      </div>
    </div>
  );
}

/* ============================================================
 * HERKESE AÇIK PROFİL KARTI
 * ============================================================ */
export function ProfileModal() {
  const { profileId, openProfile, me, setWalletOpen, setTipTo } = useStore();
  const [p, setP] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { if (!profileId) return; const k = (e: KeyboardEvent) => e.key === "Escape" && openProfile(null); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [profileId]);
  useEffect(() => { if (!profileId) return; setP(null); setErr(""); api(`/api/profile/${profileId}`).then(setP).catch((e) => setErr(e.message)); }, [profileId]);
  if (!profileId) return null;
  const net = p?.stats?.net ?? 0;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && openProfile(null)}>
      <div role="dialog" aria-modal="true" aria-label="Oyuncu profili" className="animate-slip-reveal w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_rgba(0,0,0,.6)]">
        <div className="relative bg-[radial-gradient(120%_140%_at_50%_-20%,rgba(0,255,129,.35),transparent_60%)] px-5 pt-4 pb-5">
          <div className="mb-3 text-center text-[15px] font-extrabold">Profil</div>
          <button onClick={() => openProfile(null)} aria-label="Kapat" className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-black/30 text-muted hover:text-fg"><I n="x" className="size-4" /></button>
          {!p ? <div className="py-8 text-center text-sm text-subtle">{err ? "Profil bulunamadı" : "Yükleniyor…"}</div> : (
            <div className="flex items-center gap-4 rounded-xl bg-black/25 p-4">
              <Avatar src={p.avatar} name={p.name} className="size-16 ring-2 ring-primary/50" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate text-lg font-extrabold">{p.name}{p.verified && <span title="Doğrulanmış" className="grid size-5 place-items-center rounded-full bg-primary text-primary-fg"><I n="check" className="size-3" /></span>}</div>
                <div className="text-[13px] font-semibold text-subtle">Üyelik: {new Date(p.joinedAt).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</div>
              </div>
              {me && me.id !== p.id && <button onClick={() => { setTipTo(p.name); openProfile(null); setWalletOpen("tip"); }} className="btn btn-primary btn-sm"><I n="tip" className="size-4" />Bahşiş gönder</button>}
            </div>
          )}
        </div>
        {p && (
          <div className="px-5 pb-5">
            <div className="mb-2 text-[15px] font-extrabold">İstatistikler</div>
            {p.hidden ? <div className="flex items-center justify-center gap-2 rounded-xl bg-card px-4 py-6 text-sm text-subtle"><I n="lock" className="size-4" />Bu oyuncu istatistiklerini gizli tutuyor.</div> : (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-card p-4"><div className="text-xl font-extrabold tabular-nums">{p.stats.bets.toLocaleString("tr-TR")}</div><div className="text-[12px] font-semibold text-subtle">Oynanan Bahis</div></div>
                <div className="rounded-xl bg-card p-4"><div className="text-xl font-extrabold tabular-nums">{money(p.stats.wagered)}</div><div className="text-[12px] font-semibold text-subtle">Toplam Yatırılan</div></div>
                <div className="col-span-2 rounded-xl bg-card p-4"><div className={`text-xl font-extrabold tabular-nums ${net >= 0 ? "text-win" : "text-loss"}`}>{net < 0 ? "-" : ""}{money(Math.abs(net))}</div><div className="text-[12px] font-semibold text-subtle">Net Kâr</div></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * CÜZDAN MENÜSÜ — Para Yatır · Para Çek · Promo Kodu · Bahşiş Gönder
 * ============================================================ */
export function WalletModal() {
  const { walletOpen, setWalletOpen, me, balance, refreshMe, tipTo, setTipTo } = useStore();
  const nav = useNavigate();
  const [code, setCode] = useState(""); const [amt, setAmt] = useState(""); const [user, setUser] = useState("");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setErr(""); setOk(""); if (walletOpen === "tip") setUser(tipTo); }, [walletOpen]);
  useEffect(() => { if (!walletOpen) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setWalletOpen(false); setTipTo(""); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [walletOpen]);
  if (!walletOpen || !me) return null;
  const close = () => { setWalletOpen(false); setTipTo(""); };
  const go = (to: string) => { close(); nav(to); };
  const back = <button onClick={() => setWalletOpen("menu")} aria-label="Geri" className="grid size-8 place-items-center rounded-full text-subtle hover:text-fg"><I n="left" className="size-4" /></button>;
  async function redeem() {
    setBusy(true); setErr(""); setOk("");
    try { const r: any = await api("/api/promo/redeem", { method: "POST", json: { code: code.trim() } }); setOk(`Kod kullanıldı! ${money(r.amount)} bonus hesabına yüklendi.`); setCode(""); refreshMe(); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function tip() {
    setBusy(true); setErr(""); setOk("");
    try { const r: any = await api("/api/tip", { method: "POST", json: { username: user.trim(), amount: Number(amt.replace(",", ".")) } }); setOk(`${r.to} kullanıcısına ${money(r.amount)} gönderildi.`); setAmt(""); refreshMe(); }
    catch (e: any) { setErr(e.message === "TIP_MIN" ? `Bahşiş en az ${money(e.detail?.min)}` : e.message === "TIP_DAILY_LIMIT" ? `Günlük bahşiş limiti ${money(e.detail?.max)}` : e.message); }
    setBusy(false);
  }
  const Row = ({ ic, tone, t, s, onClick }: { ic: string; tone?: "green" | "amber" | "cyan" | "red" | "slate"; t: string; s: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b border-line/60 px-4 py-3.5 text-left last:border-0 hover:bg-card">
      <IconTile n={ic} tone={tone} />
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-extrabold">{t}</span><span className="block text-[12px] font-semibold text-subtle">{s}</span></span>
      <I n="right" className="size-4 text-subtle" />
    </button>
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Cüzdan" className="animate-slip-reveal flex max-h-[92dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl border border-line bg-panel-deep shadow-[0_30px_80px_rgba(0,0,0,.6)] sm:rounded-2xl">
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          {walletOpen !== "menu" ? back : <span className="size-8" />}
          <span className="flex-1 text-center text-[16px] font-extrabold">{walletOpen === "menu" ? "Cüzdan" : walletOpen === "promo" ? "Promo Kodu" : "Bahşiş Gönder"}</span>
          <button onClick={close} aria-label="Kapat" className="grid size-8 place-items-center rounded-full bg-card text-subtle hover:text-fg"><I n="x" className="size-4" /></button>
        </div>
        <div className="sb-scroll overflow-y-auto px-3 pb-4">
          {walletOpen === "menu" && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-card p-3"><div className="text-[12px] font-semibold text-subtle">Ana para</div><div className="num text-[22px] font-bold">{money(balance("MAIN"))}</div></div>
                <div className="rounded-xl bg-card p-3"><div className="text-[12px] font-semibold text-subtle">Bonus</div><div className="num text-[22px] font-bold text-caution">{money(balance("BONUS"))}</div></div>
              </div>
              <div className="overflow-hidden rounded-xl bg-panel">
                <Row ic="deposit" tone="green" t="Para Yatır" s="Kripto ve diğer yöntemler" onClick={() => go("/para-yatir")} />
                <Row ic="withdraw" tone="cyan" t="Para Çek" s="Kazancını hesabına aktar" onClick={() => go("/para-cek")} />
                <Row ic="promo" tone="amber" t="Promo Kodu" s="Kodu gir, bonusu al" onClick={() => setWalletOpen("promo")} />
                <Row ic="tip" tone="green" t="Bahşiş Gönder" s="Başka bir oyuncuya bakiye gönder" onClick={() => setWalletOpen("tip")} />
                <Row ic="history" tone="slate" t="İşlem Geçmişi" s="Tüm hareketlerin" onClick={() => go("/hesap/islemler")} />
              </div>
            </>
          )}
          {walletOpen === "promo" && (
            <div className="space-y-3 pt-1">
              <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Promo veya hediye kodu</span>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Kodu gir" className="input input-lg font-bold" /></label>
              <ErrBox e={err} />{ok && <div className="rounded-md bg-win/10 px-3 py-2.5 text-sm font-bold text-win">{ok}</div>}
              <button disabled={busy || code.trim().length < 3} onClick={redeem} className="btn btn-primary btn-lg w-full">Kodu kullan</button>
            </div>
          )}
          {walletOpen === "tip" && (
            <div className="space-y-3 pt-1">
              <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Tutar</span>
                <span className="flex h-12 items-center gap-2 rounded-lg border border-line-strong bg-field px-3 focus-within:border-primary"><span className="grid size-6 place-items-center rounded bg-primary text-[13px] font-extrabold text-primary-fg">₺</span><input aria-label="Bahşiş tutarı" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" placeholder="0,00" className="w-full bg-transparent font-bold outline-none" /></span></label>
              <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-primary">Kullanıcı adı</span>
                <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Kullanıcı adını gir" className="input input-lg" /></label>
              <div className="flex items-center gap-2 rounded-lg bg-caution/10 px-3 py-2.5 text-[13px] font-semibold text-caution"><I n="shield" className="size-4 shrink-0" />Bahşişler iade edilmez. Ana Para bakiyenden düşülür.</div>
              <ErrBox e={err} />{ok && <div className="rounded-md bg-win/10 px-3 py-2.5 text-sm font-bold text-win">{ok}</div>}
              <button disabled={busy || !user.trim() || !(Number(amt.replace(",", ".")) > 0)} onClick={tip} className="btn btn-primary btn-lg w-full">Bahşiş gönder</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
