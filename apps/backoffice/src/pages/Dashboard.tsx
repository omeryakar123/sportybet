import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../ui";

export default function Dashboard() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api("/admin/dashboard").then(setD).catch(() => {}); }, []);
  const cards = d ? [
    ["Toplam Oyuncu", d.players], ["Yeni Oyuncu (24s)", d.newPlayers],
    ["Bahis Sayısı (24s)", d.bets._count], ["Bahis Hacmi (24s)", money(d.bets._sum.stake)],
    ["Ödenen Kazanç (24s)", money(d.bets._sum.winAmount)], ["Yatırım (24s)", money(d.deposits._sum.amount)],
  ] : [];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(([k, v]) => (
        <div key={k as string} className="panel p-4"><div className="text-bo-muted">{k}</div><div className="mt-1 text-xl font-medium">{v}</div></div>
      ))}
    </div>
  );
}
