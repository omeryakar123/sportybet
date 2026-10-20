import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Btn, ErrBox, I, money, useStore } from "./lib";

/**
 * Betco sportsbook iframe'i. Bakiye seamless wallet üzerinden bizim API'den gelir;
 * oyuncu hangi cüzdanla oynayacağını üstteki bardan seçer (seçince oturum yeniden açılır).
 */
export default function Sport() {
  const { me, setAuthOpen, balance, setWallet, refreshMe } = useStore();
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const active = me?.activeWallet === "BONUS" ? "BONUS" : "MAIN";

  async function launch() {
    if (!me) return;
    const my = ++seq.current;
    setLoading(true); setErr(""); setUrl("");
    try {
      const L = await api("/api/sportsbook/launch");
      const r = await fetch(L.base_url + "/api/v1/launch/consume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ launch_token: L.launch_token }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error_code || "LAUNCH_FAILED");
      if (seq.current === my) setUrl(j.data.iframe_url);
    } catch (x: any) { if (seq.current === my) setErr(x.message); }
    if (seq.current === my) setLoading(false);
  }
  useEffect(() => { launch(); }, [me?.id]);
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (!url) return;
      try { if (ev.origin !== new URL(url).origin) return; } catch { return; }
      const { type } = (ev.data ?? {}) as any;
      if (type === "deposit") location.href = "/para-yatir";
      if (type === "open_bet_history") location.href = "/hesap/kuponlarim";
      if (type === "login" || type === "register") setAuthOpen(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [url]);

  if (!me) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-4">
        <div className="animate-slip-reveal w-full max-w-sm rounded-2xl border border-line bg-panel p-8 text-center">
          <I n="ball" className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 text-xl font-extrabold">Spor Bahisleri</h1>
          <p className="mt-2 text-sm font-medium text-muted">Canlı ve maç öncesi binlerce karşılaşma. Oynamak için giriş yap.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Btn kind="soft" onClick={() => setAuthOpen(true)}>Giriş Yap</Btn>
            <Btn onClick={() => setAuthOpen("register")}>Kayıt Ol</Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] flex-col pb-[var(--bottom-nav-h)] lg:pb-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/60 bg-panel-deep px-3 py-2">
        <span className="text-xs font-bold tracking-wide text-subtle uppercase">Oynadığın cüzdan</span>
        <div className="flex rounded-md bg-field p-0.5">
          {(["MAIN", "BONUS"] as const).map((w) => (
            <button key={w} onClick={async () => { if (active === w) return; await setWallet(w); await launch(); }}
              className={`cursor-pointer rounded px-3 py-1.5 text-xs font-extrabold transition-colors ${active === w ? "bg-elevated text-primary" : "text-subtle hover:text-fg"}`}>
              {w === "MAIN" ? "Ana Para" : "Bonus"} · {money(balance(w))}
            </button>
          ))}
        </div>
        <button onClick={() => { refreshMe(); launch(); }} className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold text-subtle hover:text-fg"><I n="refresh" className="size-3.5" />Yenile</button>
      </div>
      <div className="relative min-h-0 flex-1 bg-page">
        {loading && <div className="absolute inset-0 grid place-items-center"><div className="size-9 animate-spin rounded-full border-2 border-elevated border-t-primary" /></div>}
        {err && <div className="mx-auto mt-10 max-w-md px-4"><ErrBox e={err === "SPORTSBOOK_NOT_CONFIGURED" ? "Spor bahisleri şu an bakımda." : err} /><Btn kind="soft" className="mt-3" onClick={launch}>Tekrar dene</Btn></div>}
        {url && <iframe src={url} title="Sportsbook" className="size-full border-0" allow="fullscreen" />}
      </div>
    </div>
  );
}
