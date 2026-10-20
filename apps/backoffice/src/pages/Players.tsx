import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Panel, money, dt } from "../ui";

export default function Players() {
  const [search, setSearch] = useState(""); const [data, setData] = useState<any>({ items: [], total: 0 });
  const load = () => api(`/admin/players?search=${encodeURIComponent(search)}`).then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  const bal = (p: any, t: string) => p.wallets.find((w: any) => w.type === t)?.balance;
  return (
    <>
      <Panel title="Filtre">
        <div className="flex gap-3"><input className="inp max-w-sm" placeholder="ID, kullanıcı adı, e-posta" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn-blue" onClick={load}>Uygula</button></div>
      </Panel>
      <Panel title={`Oyuncular (${data.total})`}>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>ID</th><th>Kullanıcı</th><th>E-posta</th><th>Ana Para</th><th>Bonus</th><th>Durum</th><th>Kategori</th><th>Kayıt</th></tr></thead>
          <tbody>{data.items.map((p: any) => (
            <tr key={p.id}><td><Link className="text-bo-blue" to={`/players/${p.id}`}>{p.id}</Link></td><td>{p.username}</td><td>{p.email}</td>
              <td>{money(bal(p, "MAIN"))}</td><td>{money(bal(p, "BONUS"))}</td><td>{p.status}</td><td>{p.category}</td><td>{dt(p.createdAt)}</td></tr>
          ))}</tbody>
        </table></div>
      </Panel>
    </>
  );
}
