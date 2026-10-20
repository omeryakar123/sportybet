/**
 * Sportsbook sağlayıcı adaptörü.
 * Sağlayıcının API dokümanı + anahtarı geldiğinde gerçek uç noktalar buraya bağlanacak.
 * Şimdilik SPORTSBOOK_API_URL yoksa örnek veri döner, böylece site ve backoffice geliştirilebilir.
 */
const BASE = process.env.SPORTSBOOK_API_URL;
const KEY = process.env.SPORTSBOOK_API_KEY;

async function call(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, "x-api-key": KEY ?? "" } });
  if (!res.ok) throw new Error(`SPORTSBOOK_${res.status}`);
  return res.json();
}

const mock = {
  sports: [
    { id: "football", name: "Futbol", count: 1282 },
    { id: "basketball", name: "Basketbol", count: 159 },
    { id: "tennis", name: "Tenis", count: 276 },
    { id: "volleyball", name: "Voleybol", count: 56 },
    { id: "icehockey", name: "Buz hokeyi", count: 232 },
    { id: "handball", name: "Hentbol", count: 55 },
  ],
  events: [
    {
      id: "demo-1", sport: "football", region: "Avrupa", competition: "UEFA Avrupa Ligi",
      home: "Fenerbahçe SK", away: "Slavia Prague", start: new Date(Date.now() + 3600_000).toISOString(), live: false,
      markets: [{ name: "Maç Sonucu", outcomes: [{ name: "1", odds: 1.85 }, { name: "X", odds: 3.6 }, { name: "2", odds: 4.2 }] }],
    },
  ],
};

export const sportsbook = {
  sports: () => (BASE ? call("/sports") : Promise.resolve(mock.sports)),
  events: (q: Record<string, string>) => (BASE ? call("/events", q) : Promise.resolve(mock.events)),
};
