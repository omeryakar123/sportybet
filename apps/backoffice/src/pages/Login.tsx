import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export default function Login() {
  const nav = useNavigate();
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try { const r = await api("/admin/login", { method: "POST", json: { username: u, password: p } }); setToken(r.token); nav("/"); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="panel w-80 space-y-3 p-6">
        <h1 className="text-lg text-bo-blue">SportyBet Backoffice</h1>
        <input className="inp" placeholder="Kullanıcı adı" value={u} onChange={(e) => setU(e.target.value)} />
        <input className="inp" type="password" placeholder="Şifre" value={p} onChange={(e) => setP(e.target.value)} />
        {err && <div className="text-bo-red">{err}</div>}
        <button className="btn-blue w-full">Giriş</button>
      </form>
    </div>
  );
}
