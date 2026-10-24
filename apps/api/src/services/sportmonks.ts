/**
 * Sportmonks Football v3 — maç sayfası canlı takip verisi (saha olayları, anlatım, kadro + reytingler, istatistik, top konumu).
 * Anahtar: SPORTMONKS_TOKEN ortam değişkeni ya da backoffice › Trading › Sportmonks (global ayar "sportmonks_token").
 * Planda olmayan include'lar ("You do not have access to the 'x' include") otomatik düşürülür ve hatırlanır.
 * Maç eşleştirme: bizim maçın tarihi + takım adları → Sportmonks fixture id (önbellekli).
 */
import type { PrismaClient } from "@prisma/client";
import { getSetting } from "./sites.js";

const BASE = "https://api.sportmonks.com/v3/football";
let tokenCache: { v: string | null; at: number } = { v: null, at: 0 };
export async function smToken(db: PrismaClient): Promise<string | null> {
  if (process.env.SPORTMONKS_TOKEN) return process.env.SPORTMONKS_TOKEN;
  if (Date.now() - tokenCache.at < 60_000) return tokenCache.v;
  const s = await getSetting<{ token?: string }>(db, "sportmonks_token").catch(() => null);
  tokenCache = { v: s?.token?.trim() || null, at: Date.now() };
  return tokenCache.v;
}
export const smResetToken = () => { tokenCache = { v: null, at: 0 }; };

/** Planda olmayan include'lar (oturum boyunca) */
const denied = new Set<string>();
export const smStatus = { lastOkAt: null as Date | null, lastError: null as string | null, denied: () => [...denied], calls: 0 };

async function call(db: PrismaClient, path: string, includes: string[] = []): Promise<any> {
  const token = await smToken(db);
  if (!token) throw new Error("SPORTMONKS_NOT_CONFIGURED");
  let inc = includes.filter((i) => !denied.has(i.split(".")[0].toLowerCase()));
  for (let attempt = 0; attempt < 6; attempt++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${BASE}/${path}${sep}api_token=${encodeURIComponent(token)}${inc.length ? `&include=${inc.join(";")}` : ""}`;
    smStatus.calls++;
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    const j: any = await r.json().catch(() => ({}));
    const m = /access to the '([a-z0-9_]+)' include/i.exec(j?.message ?? "");
    if (m) { denied.add(m[1].toLowerCase()); inc = inc.filter((i) => i.split(".")[0].toLowerCase() !== m[1].toLowerCase()); continue; }
    if (!r.ok && !j?.data) { smStatus.lastError = `${r.status} ${String(j?.message ?? "").slice(0, 160)}`; throw new Error("SPORTMONKS_ERROR"); }
    smStatus.lastOkAt = new Date(); smStatus.lastError = null;
    return j;
  }
  throw new Error("SPORTMONKS_ERROR");
}

// ---------- maç eşleştirme ----------
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(fc|cf|sc|afc|fk|sk|ac|as|cd|ud|club|de|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const sim = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const A = new Set(x.split(" ")), B = new Set(y.split(" "));
  const inter = [...A].filter((t) => B.has(t) && t.length > 2).length;
  return inter / Math.max(A.size, B.size);
};
const dayCache = new Map<string, { at: number; list: any[] }>();
const mapCache = new Map<number, { id: number | null; at: number }>();

export async function smFindFixture(db: PrismaClient, ev: { id: number; home: string; away: string; startsAt: Date }): Promise<number | null> {
  const hit = mapCache.get(ev.id);
  if (hit && (hit.id || Date.now() - hit.at < 30 * 60_000)) return hit.id;
  const day = new Date(ev.startsAt).toISOString().slice(0, 10);
  let dc = dayCache.get(day);
  if (!dc || Date.now() - dc.at > 15 * 60_000) {
    const list: any[] = [];
    for (let page = 1; page <= 5; page++) {
      const j = await call(db, `fixtures/date/${day}?per_page=50&page=${page}`, ["participants"]);
      list.push(...(j.data ?? []));
      if (!j.pagination?.has_more) break;
    }
    dc = { at: Date.now(), list }; dayCache.set(day, dc);
  }
  let best: { id: number; s: number } | null = null;
  for (const f of dc.list) {
    const h = f.participants?.find((p: any) => p.meta?.location === "home")?.name ?? "";
    const a = f.participants?.find((p: any) => p.meta?.location === "away")?.name ?? "";
    const dt = Math.abs(new Date(f.starting_at.replace(" ", "T") + "Z").getTime() - new Date(ev.startsAt).getTime());
    if (dt > 3 * 3600_000) continue;
    const s = (sim(h, ev.home) + sim(a, ev.away)) / 2;
    if (s >= 0.6 && (!best || s > best.s)) best = { id: f.id, s };
  }
  mapCache.set(ev.id, { id: best?.id ?? null, at: Date.now() });
  return best?.id ?? null;
}

// ---------- normalleştirme ----------
export type SmTracker = {
  source: "sportmonks"; fixtureId: number; state: string; minute: number | null; live: boolean;
  teams: { home: { id: number; name: string; logo: string | null }; away: { id: number; name: string; logo: string | null } };
  score: { h: number; a: number };
  /** Saha olayları (korner, şut, ofsayt, gol, kart…) — en yeni sonda */
  timeline: { min: number; extra: number | null; side: "home" | "away"; type: string; code: string; player: string | null; info: string | null; addition: string | null }[];
  comments: { min: number | null; extra: number | null; text: string; goal: boolean; important: boolean }[];
  lineups: { side: "home" | "away"; formation: string | null; xi: SmPlayer[]; bench: SmPlayer[] }[];
  stats: { key: string; home: number | null; away: number | null }[];
  ball: { x: number; y: number; t: number }[] | null;
  pressure: { min: number; home: number; away: number }[] | null;
  xg: { home: number | null; away: number | null } | null;
  denied: string[];
};
export type SmPlayer = { id: number; name: string; number: number | null; photo: string | null; field: string | null; pos: number | null; rating: number | null; captain: boolean; goals: number; yellow: number; red: number; subOut: number | null; subIn: number | null };

const TEAM_STAT_KEYS = ["BALL_POSSESSION", "SHOTS_TOTAL", "SHOTS_ON_TARGET", "SHOTS_OFF_TARGET", "SHOTS_BLOCKED", "BIG_CHANCES_CREATED", "CORNERS", "FOULS", "OFFSIDES", "SAVES", "PASSES", "SUCCESSFUL_PASSES", "SUCCESSFUL_PASSES_PERCENTAGE", "TACKLES", "INTERCEPTIONS", "ATTACKS", "DANGEROUS_ATTACKS", "FREE_KICKS", "THROWINS", "GOAL_KICKS", "YELLOWCARDS", "REDCARDS", "EXPECTED_GOALS"];
/** Takım istatistiği planda yoksa oyuncu detaylarından toplanabilenler */
const FROM_PLAYERS: Record<string, string> = { SHOTS_TOTAL: "SHOTS_TOTAL", SHOTS_ON_TARGET: "SHOTS_ON_TARGET", SHOTS_OFF_TARGET: "SHOTS_OFF_TARGET", SHOTS_BLOCKED: "SHOTS_BLOCKED", BIG_CHANCES_CREATED: "BIG_CHANCES_CREATED", PASSES: "PASSES", SUCCESSFUL_PASSES: "ACCURATE_PASSES", TACKLES: "TACKLES", INTERCEPTIONS: "INTERCEPTIONS", SAVES: "SAVES", FOULS: "FOULS", OFFSIDES: "OFFSIDES" };

const trCache = new Map<number, { at: number; data: SmTracker }>();
const LIVE_STATES = ["INPLAY_1ST_HALF", "INPLAY_2ND_HALF", "HT", "INPLAY_ET", "INPLAY_ET_2ND_HALF", "BREAK", "EXTRA_TIME_BREAK", "INPLAY_PENALTIES", "PEN_BREAK", "LIVE"];

export async function smTracker(db: PrismaClient, fixtureId: number): Promise<SmTracker> {
  const c = trCache.get(fixtureId);
  if (c && Date.now() - c.at < (c.data.live ? 12_000 : 5 * 60_000)) return c.data;
  const j = await call(db, `fixtures/${fixtureId}`, [
    "participants", "state", "scores", "periods", "formations",
    "timeline.type", "events.type", "comments", "statistics.type",
    "lineups.player", "lineups.details.type", "ballCoordinates", "pressure", "xGFixture.type",
  ]);
  const f = j.data;
  const P = (loc: string) => f.participants?.find((p: any) => p.meta?.location === loc);
  const hp = P("home"), ap = P("away");
  const side = (pid: number): "home" | "away" => (pid === ap?.id ? "away" : "home");
  const cur = (loc: string) => f.scores?.find((s: any) => s.description === "CURRENT" && s.score?.participant === loc)?.score?.goals ?? 0;
  const per = (f.periods ?? []).find((p: any) => p.ticking) ?? (f.periods ?? []).at(-1);
  const stateDev = f.state?.developer_name ?? f.state?.state ?? "";
  const live = LIVE_STATES.includes(stateDev) || /INPLAY/.test(stateDev);
  const minute: number | null = per && typeof per.minutes === "number" ? Math.max(per.minutes, per.counts_from ?? 0) : null;

  const evs = [...(f.events ?? [])];
  const timeline = [...(f.timeline ?? []), ...evs]
    .filter((t: any) => t.type?.developer_name && !t.rescinded)
    .map((t: any) => ({ min: t.minute ?? 0, extra: t.extra_minute ?? null, side: side(t.participant_id), type: t.type.name, code: t.type.developer_name, player: t.player_name ?? null, info: t.info ?? null, addition: t.addition ?? null, so: t.sort_order ?? 0 }))
    .sort((a: any, b: any) => a.min + (a.extra ?? 0) / 100 - (b.min + (b.extra ?? 0) / 100) || a.so - b.so)
    .map(({ so, ...x }: any) => x);

  // oyuncu olayları → kadro ikonları
  const evBy = (pid: number) => evs.filter((e: any) => e.player_id === pid || e.related_player_id === pid);
  const pl = (l: any): SmPlayer => {
    const det = (code: string) => l.details?.find((d: any) => d.type?.developer_name === code)?.data?.value;
    const mine = evBy(l.player_id);
    const subOut = mine.find((e: any) => e.type?.developer_name === "SUBSTITUTION" && e.related_player_id === l.player_id);
    const subIn = mine.find((e: any) => e.type?.developer_name === "SUBSTITUTION" && e.player_id === l.player_id);
    return {
      id: l.player_id, name: l.player?.display_name ?? l.player_name, number: l.jersey_number ?? null, photo: l.player?.image_path ?? null,
      field: l.formation_field ?? null, pos: l.formation_position ?? null, rating: det("RATING") != null ? Number(det("RATING")) : null, captain: !!det("CAPTAIN"),
      goals: mine.filter((e: any) => /GOAL/.test(e.type?.developer_name) && !/OWN/.test(e.type?.developer_name) && e.player_id === l.player_id).length,
      yellow: mine.filter((e: any) => e.type?.developer_name === "YELLOWCARD" && e.player_id === l.player_id).length,
      red: mine.filter((e: any) => /REDCARD|YELLOWREDCARD/.test(e.type?.developer_name) && e.player_id === l.player_id).length,
      subOut: subOut ? subOut.minute : null, subIn: subIn ? subIn.minute : null,
    };
  };
  const lineups = (["home", "away"] as const).map((loc) => {
    const tid = (loc === "home" ? hp : ap)?.id;
    const ls = (f.lineups ?? []).filter((l: any) => l.team_id === tid);
    return {
      side: loc, formation: f.formations?.find((x: any) => x.location === loc)?.formation ?? null,
      xi: ls.filter((l: any) => l.type_id === 11).sort((a: any, b: any) => (a.formation_position ?? 99) - (b.formation_position ?? 99)).map(pl),
      bench: ls.filter((l: any) => l.type_id !== 11).map(pl),
    };
  }).filter((l) => l.xi.length);

  // takım istatistikleri (+ oyunculardan toplananlar)
  const st = (code: string, loc: string) => { const s = f.statistics?.find((x: any) => x.type?.developer_name === code && x.location === loc); return s ? Number(s.data?.value ?? 0) : null; };
  const sumPl = (code: string, loc: "home" | "away") => {
    const tid = (loc === "home" ? hp : ap)?.id; let any = false;
    const v = (f.lineups ?? []).filter((l: any) => l.team_id === tid).reduce((a: number, l: any) => { const d = l.details?.find((x: any) => x.type?.developer_name === code); if (d) { any = true; return a + Number(d.data?.value ?? 0); } return a; }, 0);
    return any ? v : null;
  };
  const stats = TEAM_STAT_KEYS.map((k) => {
    let h = st(k, "home"), a = st(k, "away");
    if (h == null && a == null && FROM_PLAYERS[k]) { h = sumPl(FROM_PLAYERS[k], "home"); a = sumPl(FROM_PLAYERS[k], "away"); }
    if (k === "YELLOWCARDS" && h == null) { h = timeline.filter((t) => t.code === "YELLOWCARD" && t.side === "home").length; a = timeline.filter((t) => t.code === "YELLOWCARD" && t.side === "away").length; }
    if (k === "CORNERS" && h == null) { h = timeline.filter((t) => t.code === "CORNER" && t.side === "home").length; a = timeline.filter((t) => t.code === "CORNER" && t.side === "away").length; }
    return { key: k, home: h, away: a };
  }).filter((r) => r.home != null || r.away != null);

  const ball = Array.isArray(f.ballcoordinates ?? f.ballCoordinates) ? (f.ballcoordinates ?? f.ballCoordinates).slice(-40).map((b: any) => ({ x: Number(b.x), y: Number(b.y), t: Number(b.timer ?? 0) })) : null;
  const pressure = Array.isArray(f.pressure) ? f.pressure.map((p: any) => ({ min: p.minute, home: p.participant_id === hp?.id ? p.pressure : 0, away: p.participant_id === ap?.id ? p.pressure : 0 })) : null;
  const xgRows = Array.isArray(f.xgfixture ?? f.xGFixture) ? (f.xgfixture ?? f.xGFixture) : null;
  const xg = xgRows ? { home: xgRows.find((x: any) => x.location === "home" && /EXPECTED_GOALS$/.test(x.type?.developer_name ?? "EXPECTED_GOALS"))?.data?.value ?? null, away: xgRows.find((x: any) => x.location === "away" && /EXPECTED_GOALS$/.test(x.type?.developer_name ?? "EXPECTED_GOALS"))?.data?.value ?? null } : null;

  const data: SmTracker = {
    source: "sportmonks", fixtureId, state: stateDev, minute, live,
    teams: { home: { id: hp?.id, name: hp?.name, logo: hp?.image_path ?? null }, away: { id: ap?.id, name: ap?.name, logo: ap?.image_path ?? null } },
    score: { h: cur("home"), a: cur("away") },
    timeline, comments: (f.comments ?? []).map((c: any) => ({ min: c.minute ?? null, extra: c.extra_minute ?? null, text: c.comment, goal: !!c.is_goal, important: !!c.is_important })).sort((a: any, b: any) => (b.min ?? 999) - (a.min ?? 999)),
    lineups, stats, ball: ball?.length ? ball : null, pressure: pressure?.length ? pressure : null, xg, denied: [...denied],
  };
  trCache.set(fixtureId, { at: Date.now(), data });
  return data;
}
