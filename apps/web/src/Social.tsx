import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import { Avatar, ErrBox, FlagTR, I, IconTile, money, useStore } from "./lib";
import { Sheet, StatCard } from "./g";

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
    <div className="mx-3 mb-2 overflow-hidden rounded-xl border border-primary/40 bg-[linear-gradient(120deg,rgba(0,255,134,.18),rgba(0,232,255,.08))] p-3">
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
      <div className="flex h-[70px] shrink-0 items-center gap-3 px-[13px]">
        <span className="flex h-11 items-center gap-2.5 rounded-[10px] bg-panel px-[17px] text-[14px] font-medium"><FlagTR className="h-[14px] w-5 rounded-sm" />Türkçe</span>
        <span className="ml-auto flex items-center gap-1.5 text-[14px] font-medium text-subtle"><I n="user" className="size-[18px]" />{(st?.online ?? 0).toLocaleString("tr-TR")}</span>
        <button onClick={onClose} className="grid size-8 place-items-center text-subtle hover:text-fg" aria-label="Sohbeti kapat"><I n="x" className="size-6" /></button>
      </div>
      {st?.rain && <div className="pt-2"><RainCard rain={st.rain} onJoin={join} busy={busy} /></div>}
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} className="sb-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-2" role="log" aria-label="Sohbet mesajları" aria-live="polite">
        {msgs.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-subtle">Henüz mesaj yok. İlk yazan sen ol!</div>}
        {msgs.map((m) => m.kind === "SYSTEM" ? (
          <div key={m.id} className="mx-2 rounded-lg bg-card/60 px-3 py-2 text-center text-[12px] font-semibold text-soft">{m.text}</div>
        ) : m.kind === "RAIN" || m.kind === "TIP" ? (
          <div key={m.id} className="mx-2 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary"><I n={m.kind === "RAIN" ? "rain" : "tip"} className="size-4 shrink-0" /><span className="min-w-0 flex-1">{m.text}</span><span className="text-[10px] text-subtle">{hhmm(m.at)}</span></div>
        ) : (
          /* gamdom mesaj satırı: solda 46px avatar+saat sütunu, sağda isim + mesaj; ikisi de #080d13 */
          <div key={m.id} className={`group flex gap-px rounded-[10px] border border-transparent ${m.meta?.pending ? "opacity-60" : ""}`}>
            <div className="flex w-[46px] shrink-0 flex-col items-center gap-[5px] rounded-l-[10px] bg-page pt-2.5 pb-2">
              <button onClick={() => m.user && openProfile(m.user.id)} aria-label={`${m.user?.name ?? ""} profili`}><Avatar src={m.user?.avatar} name={m.user?.name ?? "?"} className="size-6 !rounded-md" /></button>
              <span className="text-[10px] font-medium text-[#45515c]">{hhmm(m.at)}</span>
            </div>
            <div className="min-w-0 flex-1 rounded-r-[10px] bg-page px-2.5 pt-2.5 pb-2.5">
              <div className="flex h-6 items-center gap-[5px]">
                <button onClick={() => m.user && openProfile(m.user.id)} className={`truncate text-[14px] font-medium hover:underline ${m.user?.id === me?.id ? "text-primary" : "text-[#cce0e1]"}`}>{m.user?.name ?? "—"}</button>
                {me && m.user && m.user.id !== me.id && <button onClick={() => { setTipTo(m.user!.name); setWalletOpen("tip"); }} className="ml-auto grid size-6 place-items-center rounded bg-[#0c1117] text-subtle opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 focus:opacity-100" title="Bahşiş gönder" aria-label="Bahşiş gönder"><I n="tip" className="size-4" /></button>}
              </div>
              <p className="mt-1.5 break-words text-[13px] font-medium leading-4 text-white">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 px-3 pt-2 pb-3">
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
          /* gamdom yazı kutusu: tek parça grup — metin (r10 sol) + yağmur + gönder (r10 sağ, yeşil ikon) */
          <div className="flex h-11 gap-px overflow-hidden rounded-[10px]">
            <input aria-label="Sohbet mesajı" value={text} maxLength={st?.limits?.maxLen ?? 200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMsg()} onFocus={() => !me && setAuthOpen(true)}
              placeholder={me ? "Yazmaya başla…" : "Yazmak için giriş yap"} className="min-w-0 flex-1 bg-card px-4 text-[14px] font-medium text-white outline-none placeholder:text-subtle" />
            {st?.limits?.rainEnabled && <button onClick={() => (me ? setRainOpen(true) : setAuthOpen(true))} title="Yağmur başlat" aria-label="Yağmur başlat" className="grid w-11 shrink-0 place-items-center bg-card text-subtle hover:text-accent"><I n="rain" className="size-5" /></button>}
            <button disabled={busy || !text.trim()} onClick={sendMsg} className="grid w-11 shrink-0 place-items-center bg-card text-primary disabled:text-subtle" aria-label="Gönder"><I n="send" className="size-5" /></button>
          </div>
        )}

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
  useEffect(() => { if (!profileId) return; setP(null); setErr(""); api(`/api/profile/${profileId}`).then(setP).catch((e) => setErr(e.message)); }, [profileId]);
  if (!profileId) return null;
  const net = p?.stats?.net ?? 0;
  return (
    <Sheet open onClose={() => openProfile(null)} title="Profil">
      {!p ? <div className="py-10 text-center text-sm text-subtle">{err ? "Profil bulunamadı" : "Yükleniyor…"}</div> : (
        <>
          <div className="flex items-center gap-3 rounded-[10px] bg-card p-4">
            <Avatar src={p.avatar} name={p.name} className="size-16 !rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 truncate text-[16px] font-bold">{p.name}{p.verified && <span title="Doğrulanmış" className="grid size-4 place-items-center rounded-full bg-primary text-primary-fg"><I n="check" className="size-2.5" /></span>}</div>
              <div className="mt-0.5 text-[12px] font-medium text-subtle">Üyelik: {new Date(p.joinedAt).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</div>
            </div>
            {me && me.id !== p.id && <button onClick={() => { setTipTo(p.name); openProfile(null); setWalletOpen("tip"); }} className="btn btn-primary btn-sm rounded-lg">Bahşiş</button>}
          </div>
          <p className="h-sec mt-6 mb-3">İstatistikler</p>
          {p.hidden ? <div className="flex items-center justify-center gap-2 rounded-[15px] bg-card px-4 py-7 text-[14px] font-medium text-subtle"><I n="lock" className="size-4" />Bu oyuncu istatistiklerini gizli tutuyor.</div> : (
            <div className="grid gap-2">
              <StatCard value={p.stats.bets.toLocaleString("tr-TR")} label="Oynanan Bahis" icon={<img src="/img/ic-ball.svg" alt="" className="size-14" />} />
              <StatCard value={money(p.stats.wagered)} label="Toplam Oynanan" icon={<img src="/img/ic-chart.svg" alt="" className="size-14" />} />
              <StatCard value={<span className={net >= 0 ? "text-primary" : "text-loss"}>{net < 0 ? "-" : ""}{money(Math.abs(net))}</span>} label="Net Kâr" icon={<img src="/img/ic-trophy.svg" alt="" className="size-14" />} />
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ============================================================
 * CÜZDAN MENÜSÜ — Para Yatır · Para Çek · Promo Kodu · Bahşiş Gönder
 * ============================================================ */
export function WalletModal() {
  const { walletOpen, setWalletOpen, me, balance, refreshMe, tipTo, setTipTo, setWallet } = useStore();
  const nav = useNavigate();
  const [code, setCode] = useState(""); const [amt, setAmt] = useState(""); const [user, setUser] = useState("");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false); const [pick, setPick] = useState(false);
  useEffect(() => { setErr(""); setOk(""); setPick(false); if (walletOpen === "tip") setUser(tipTo); }, [walletOpen]);
  if (!walletOpen || !me) return null;
  const close = () => { setWalletOpen(false); setTipTo(""); };
  const go = (to: string) => { close(); nav(to); };
  const back = <button onClick={() => setWalletOpen("menu")} aria-label="Geri" className="-ml-1 grid size-7 place-items-center rounded-lg text-subtle hover:text-fg"><I n="left" className="size-5" /></button>;
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
  const active = me.activeWallet === "BONUS" ? "BONUS" : "MAIN";
  /** gamdom cüzdan satırı: 51px, #0f151b, 24px renkli ikon + 16/700 + ok */
  const ROWS: [string, string, string, () => void][] = [
    ["deposit", "#00ff86", "Para Yatır", () => go("/para-yatir")],
    ["withdraw", "#279aff", "Para Çek", () => go("/para-cek")],
    ["promo", "#ffd900", "Kod Kullan", () => setWalletOpen("promo")],
    ["tip", "#ff7ab6", "Bahşiş Gönder", () => setWalletOpen("tip")],
    ["history", "#818e9d", "İşlem Geçmişi", () => go("/hesap/islemler")],
  ];
  const title = walletOpen === "menu" ? "Cüzdan" : walletOpen === "promo" ? "Kod Kullan" : "Bahşiş Gönder";
  return (
    <Sheet open onClose={close} title={<span className="flex items-center gap-2">{walletOpen !== "menu" && back}{title}</span>}
      head={walletOpen === "menu" ? (
        <div className="relative">
          <button onClick={() => setPick(!pick)} className="flex h-[31px] items-center gap-1.5 rounded-[10px] bg-card-2 px-2 text-[13px] font-bold">
            <span className={`grid size-5 place-items-center rounded-full text-[11px] ${active === "BONUS" ? "bg-caution text-[#2a1d00]" : "bg-[#4fd35a] text-white"}`}>₺</span>
            <span className="num">{money(balance(active as any))}</span><I n="down" className="size-4 text-subtle" />
          </button>
          {pick && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-10 w-[230px] rounded-xl bg-card-2 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]">
              {(["MAIN", "BONUS"] as const).map((w) => (
                <button key={w} onClick={async () => { await setWallet(w); setPick(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14px] font-bold hover:bg-elevated ${active === w ? "text-primary" : "text-fg"}`}>
                  {w === "MAIN" ? "Ana Para" : "Bonus"}<span className="num">{money(balance(w))}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}>
      {walletOpen === "menu" && (
        <div className="flex flex-col gap-0.5 overflow-hidden rounded-2xl">
          {ROWS.map(([ic, c, t, fn]) => (
            <button key={t} onClick={fn} className="flex h-[51px] w-full items-center gap-[14px] bg-panel px-4 text-left transition-colors hover:bg-card">
              <span className="grid size-6 place-items-center rounded-md" style={{ color: c }}><I n={ic} className="size-[22px]" /></span>
              <span className="flex-1 text-[16px] font-bold text-white">{t}</span>
              <I n="right" className="size-5 text-subtle" />
            </button>
          ))}
        </div>
      )}
      {walletOpen === "promo" && (
        <div className="space-y-3 pt-1">
          <label className="block"><span className="mb-2 block text-[12px] font-medium text-subtle">Promosyon veya hediye kodu</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Kodu gir" className="input font-bold" /></label>
          <ErrBox e={err} />{ok && <div className="rounded-[10px] bg-primary/10 px-3 py-2.5 text-sm font-bold text-primary">{ok}</div>}
          <button disabled={busy || code.trim().length < 3} onClick={redeem} className="btn btn-primary w-full">Kodu kullan</button>
        </div>
      )}
      {walletOpen === "tip" && (
        <div className="space-y-3 pt-1">
          <label className="block"><span className="mb-2 block text-[12px] font-medium text-subtle">Tutar</span>
            <span className="flex h-11 items-center gap-2 rounded-[10px] border border-transparent bg-field px-3 focus-within:border-primary/60"><span className="grid size-5 place-items-center rounded-full bg-[#4fd35a] text-[11px] font-bold text-white">₺</span><input aria-label="Bahşiş tutarı" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" placeholder="0,00" className="w-full bg-transparent text-[14px] font-bold outline-none" /></span></label>
          <label className="block"><span className="mb-2 block text-[12px] font-medium text-subtle">Kullanıcı adı</span>
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Kullanıcı adını gir" className="input" /></label>
          <p className="flex items-center gap-2 text-[14px] font-bold text-subtle"><I n="shield" className="size-6 shrink-0" />Bahşişler iade edilmez, Ana Para'dan düşülür.</p>
          <ErrBox e={err} />{ok && <div className="rounded-[10px] bg-primary/10 px-3 py-2.5 text-sm font-bold text-primary">{ok}</div>}
          <button disabled={busy || !user.trim() || !(Number(amt.replace(",", ".")) > 0)} onClick={tip} className="btn btn-primary w-full">Bahşiş gönder</button>
        </div>
      )}
    </Sheet>
  );
}
