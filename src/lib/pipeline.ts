import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { z } from "zod";
import { digestGame } from "./games";
import {
  ApiClanExists,
  ApiDeletedPlayers,
  ApiGame,
  ApiLeaderboard,
  ApiMembersPage,
  ApiPlayerGames,
  ApiPlayerSessions,
  ApiRankedPage,
  ApiSessionsPage,
  Meta,
  StoredGame,
  StoredGameFile,
  StoredMemberGames,
  StoredMemberResults,
  StoredMemberWeeks,
  StoredMemberRecent,
  StoredMembers,
  StoredSessionFile,
  emptyMeta,
  type DatasetState,
  type HistorySnapshot,
  type RivalsSnapshot,
  type ApiPlayerSession,
  type StoredLeaderboard,
  type StoredMemberGame,
  type StoredSession,
} from "./schemas";
import { gamesOf, MEMBER_RECENT_GAMES, memberGamesUnderTag, toStoredMember } from "./members";
import { ActiveState, forgetActiveMembers } from "./actifs";
import { forgetMilestoneMembers, MilestoneState } from "./paliers-franchis";
import { forgetInMemberResults, teamRowsOf } from "./podiums";
import { RANKED_MODES, rankedCounts } from "./ranked";
import { mergeSessions } from "./sessions";
import { findClan, withOfficialRanks } from "./stats";
import { addDays, isFirstOfMonday, parisParts, parisStartOf } from "./time";
import { EMPTY_MEMBER_WEEKS, forgetInMemberWeeks, nextMemberWeeks } from "./week-players";

export const API_ORIGIN = "https://api.openfront.io";
export const API_BASE = `${API_ORIGIN}/public`;
const PAGE_SIZE = 50;
/** Délai après la fin d'un jour UTC avant de le considérer comme définitif. */
const SETTLE_MS = 6 * 3_600_000;
/** Les membres ne sont relus qu'une fois par jour : le fichier est lourd pour Git. */
const MEMBERS_MIN_INTERVAL_MS = 20 * 3_600_000;
/** Parties lues par passage : environ 4 minutes. L'archive se lit donc en un jour ou deux, sans charger l'API. */
const GAMES_PER_RUN = 400;
/** Au-delà dans un passage, le problème vient de l'API : inutile d'insister. Assez haut pour que quelques parties cassées, toujours en tête de file, ne bloquent pas les plus anciennes. */
const MAX_FAILURES_PER_RUN = 25;
/** À partir de ce nombre d'échecs sans aucune partie lue, c'est une panne à signaler, même quand il n'y a que quelques nouvelles parties à lire. */
const OUTAGE_FAILURES = 5;
/** Appels par passage pour les fiches des membres, environ : un joueur commencé est lu jusqu'au bout. Moins de 3 minutes. */
const MEMBER_CALLS_PER_RUN = 150;
/** Pages lues au plus pour un joueur, de 10 parties chacune. Plus loin, ce qu'il a joué sous le tag est ancien : la fiche le dit. */
const MEMBER_PAGES_MAX = 3;
/** Appels par passage pour les podiums des joueurs, de 100 parties chacun. Tout l'historique des membres, 1 079 pages mesurées le 10 novembre 2026, se lit en huit passages. */
const RESULTS_CALLS_PER_RUN = 150;
/** Pages lues au plus pour rattraper les nouvelles parties d'un joueur. Au-delà, sa liste repart de ces pages et se relit en remontant le temps : jamais de trou. */
const RESULTS_NEW_PAGES_MAX = 10;
/**
 * Les nouvelles parties se relisent jusqu'à six heures avant la lecture précédente. Une partie n'apparaît qu'une fois finie, et un
 * joueur éliminé en rejoint souvent une autre avant la fin de la première : commencée avant cette lecture, elle arrive ensuite, à sa place.
 */
const RESULTS_OVERLAP_MS = 6 * 3_600_000;

export interface Deps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  dataDir: string;
  tag: string;
  archiveStart: string;
  delayMs: number;
  gamesPerRun?: number;
  memberCallsPerRun?: number;
  memberResultsCallsPerRun?: number;
  /** Les parties de chaque membre : hors de `data/`, donc hors de Git. */
  memberGamesFile: string;
  /** Les parties sous le tag de chaque membre, pour ses podiums : hors de Git aussi. */
  memberResultsFile: string;
  /** Le plus ancien relevé de la liste des membres fait entre deux instants, gardé dans l'historique Git. Absent hors de GitHub. */
  memberHistory?: (from: string, to: string) => Promise<StoredMembers | null>;
  log: (msg: string) => void;
}

export class ApiClient {
  constructor(private deps: Pick<Deps, "fetch" | "sleep" | "delayMs">) {}

  /** Espace les appels et réessaie sur 429 ou 5xx, avec un délai croissant. */
  private async request(url: string, path: string): Promise<Response> {
    const { fetch: f, sleep, delayMs } = this.deps;
    let lastError = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      await sleep(attempt === 0 ? delayMs : delayMs * 2 ** (attempt + 2));
      let res: Response;
      try {
        res = await f(url, { headers: { "User-Agent": "GAL-clan-site/1.0" } });
      } catch (e) {
        lastError = `réseau : ${e instanceof Error ? e.message : String(e)}`;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
      return res;
    }
    throw new Error(`${lastError} sur ${path} après 4 essais`);
  }

  async getJson(path: string, base: string = API_BASE): Promise<unknown> {
    const res = await this.request(`${base}${path}`, path);
    return res.json();
  }

  async get<S extends z.ZodType>(path: string, schema: S, base: string = API_BASE): Promise<z.output<S>> {
    const parsed = schema.safeParse(await this.getJson(path, base));
    if (!parsed.success) throw new Error(`réponse invalide sur ${path} : ${parsed.error.message.slice(0, 300)}`);
    return parsed.data;
  }

  async getBytes(path: string, base: string = API_BASE): Promise<Uint8Array> {
    const res = await this.request(`${base}${path}`, path);
    return new Uint8Array(await res.arrayBuffer());
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value)}\n`, "utf8");
  await rename(tmp, path);
}

export async function readJson<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S> | null> {
  try {
    return schema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

export function markOk(state: DatasetState, at: string): void {
  state.lastSuccessAt = at;
  state.lastError = null;
}
export function markError(state: DatasetState, at: string, e: unknown): string {
  state.lastErrorAt = at;
  state.lastError = e instanceof Error ? e.message : String(e);
  return state.lastError;
}

async function fetchLeaderboard(api: ApiClient, deps: Deps, at: string): Promise<StoredLeaderboard> {
  const data = await api.get("/clans/leaderboard", ApiLeaderboard);
  const stored: StoredLeaderboard = { ...data, fetchedAt: at };
  await writeJson(join(deps.dataDir, "leaderboard.json"), stored);
  return stored;
}

async function fetchMembers(api: ApiClient, deps: Deps, at: string): Promise<number> {
  const all = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const res = await api.get(`/clan/${deps.tag}/members?page=${page}&limit=${PAGE_SIZE}`, ApiMembersPage);
    total = res.total;
    all.push(...res.results);
    if (res.results.length === 0 || all.length >= total) break;
  }
  const unique = new Map(all.map((m) => [m.publicId, m]));
  // Une liste incomplète ne remplace jamais la dernière liste valide.
  if (total === 0 || unique.size < total) {
    throw new Error(`liste des membres incomplète : ${unique.size} reçus pour ${total} annoncés`);
  }
  await writeJson(join(deps.dataDir, "members.json"), {
    fetchedAt: at,
    total,
    members: [...unique.values()].map(toStoredMember),
  });
  return total;
}

/** Les deux pages du classement classé, croisées avec le roster : les deux doivent répondre, sinon rien n'est remplacé. */
async function fetchRanked(api: ApiClient, deps: Deps, at: string, members: StoredMembers): Promise<number> {
  const pages = [await api.get("/leaderboard/ranked?page=1", ApiRankedPage), await api.get("/leaderboard/ranked?page=2", ApiRankedPage)];
  const ranked = rankedCounts(pages, members.members, at);
  // Un mode vide n'est pas « aucun membre » : il ne remplace jamais le dernier relevé valide.
  const empty = RANKED_MODES.filter(({ key }) => ranked.modes[key].listed === 0).map(({ label }) => label);
  if (empty.length > 0) throw new Error(`classement classé vide : ${empty.join(", ")}`);
  await writeJson(join(deps.dataDir, "ranked.json"), ranked);
  return RANKED_MODES.reduce((n, { key }) => n + ranked.modes[key].members, 0);
}

export async function fetchDaySessions(api: ApiClient, tag: string, day: string): Promise<StoredSession[]> {
  return fetchSessionsBetween(api, tag, `${day}T00:00:00.000Z`, `${day}T23:59:59.999Z`, `du ${day}`);
}

/**
 * Les sessions du clan commencées entre deux instants, 24 heures d'écart au plus (limite de l'API). `label` nomme la période
 * dans l'erreur, comme « du 2026-11-11 ». Aussi lue par l'envoi des victoires, sur les dernières heures.
 */
export async function fetchSessionsBetween(api: ApiClient, tag: string, start: string, end: string, label: string): Promise<StoredSession[]> {
  const q = `start=${start}&end=${end}&limit=${PAGE_SIZE}`;
  const byId = new Map<string, StoredSession>();
  let total = 0;
  for (let page = 1; ; page++) {
    const res = await api.get(`/clan/${tag}/sessions?${q}&page=${page}`, ApiSessionsPage);
    total = res.total;
    for (const r of res.results) {
      byId.set(r.gameId, {
        gameId: r.gameId,
        clanPlayerCount: r.clanPlayerCount,
        hasWon: r.hasWon,
        numTeams: r.numTeams,
        playerTeams: r.playerTeams,
        totalPlayerCount: r.totalPlayerCount,
        gameStart: r.gameStart,
        score: r.score,
      });
    }
    if (res.results.length === 0 || byId.size >= total) break;
  }
  if (byId.size < total) throw new Error(`sessions ${label} incomplètes : ${byId.size} sur ${total}`);
  return [...byId.values()];
}

async function fetchSessions(api: ApiClient, deps: Deps, meta: Meta): Promise<void> {
  const state = meta.sessions;
  const started = deps.now();
  const today = started.toISOString().slice(0, 10);
  const dir = join(deps.dataDir, "sessions");
  await mkdir(dir, { recursive: true });
  const first = state.completeThrough ? addDays(state.completeThrough, 1) : deps.archiveStart;
  let settling = true;
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const rows = await fetchDaySessions(api, deps.tag, day);
    if (rows.length > 0) {
      const month = day.slice(0, 7);
      const path = join(dir, `${month}.json`);
      const current = await readJson(path, StoredSessionFile);
      await writeJson(path, { month, sessions: mergeSessions(current?.sessions ?? [], rows) });
    }
    const dayEnd = Date.parse(`${day}T23:59:59.999Z`);
    if (settling && dayEnd + SETTLE_MS < started.getTime()) state.completeThrough = day;
    else settling = false;
    // Chaque jour lu est sans trou : un échec plus tard n'efface pas ce progrès.
    state.coveredUntil = new Date(Math.min(dayEnd, started.getTime())).toISOString();
  }
}

async function jsonNames(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.endsWith(".json"));
}

/**
 * Le détail des parties pas encore lues, des plus récentes aux plus anciennes : une partie finie ne change plus, elle n'est lue qu'une fois.
 * Une partie qui ne répond pas, même en 404, reste simplement à lire : rien de définitif n'est écrit, donc une panne ne peut rien fausser.
 * Ce qui est déjà lu reste acquis si la lecture s'arrête en route.
 */
export async function fetchGames(api: ApiClient, deps: Deps): Promise<{ read: number; left: number; unreadable: number }> {
  const dir = join(deps.dataDir, "games");
  await mkdir(dir, { recursive: true });
  const files = new Map<string, StoredGameFile>();
  for (const name of await jsonNames(dir)) {
    const file = await readJson(join(dir, name), StoredGameFile);
    if (file) files.set(file.month, file);
  }
  const known = new Set([...files.values()].flatMap((f) => f.games.map((g) => g.id)));

  const sessionsDir = join(deps.dataDir, "sessions");
  const sessions: StoredSession[] = [];
  for (const name of await jsonNames(sessionsDir)) {
    sessions.push(...((await readJson(join(sessionsDir, name), StoredSessionFile))?.sessions ?? []));
  }
  const todo = sessions.filter((s) => !known.has(s.gameId)).sort((a, b) => b.gameStart.localeCompare(a.gameStart));

  const touched = new Set<string>();
  let read = 0;
  let unreadable = 0;
  let lastFailure = "";
  try {
    for (const session of todo.slice(0, deps.gamesPerRun ?? GAMES_PER_RUN)) {
      if (unreadable >= MAX_FAILURES_PER_RUN) break;
      try {
        const game = ApiGame.parse(await api.getJson(`/game/${encodeURIComponent(session.gameId)}?turns=false`));
        // Une seule ligne invalide ferait rejeter tout le fichier du mois à la lecture.
        const stored = StoredGame.parse(digestGame(game, session, deps.tag));
        const month = session.gameStart.slice(0, 7);
        const file = files.get(month) ?? { month, games: [] };
        file.games.push(stored);
        files.set(month, file);
        touched.add(month);
        read++;
      } catch (e) {
        unreadable++;
        lastFailure = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        deps.log(`partie sans réponse lisible, ${session.gameId} : ${lastFailure}`);
      }
    }
  } finally {
    for (const month of touched) await writeJson(join(dir, `${month}.json`), files.get(month));
  }
  if (unreadable >= MAX_FAILURES_PER_RUN || (read === 0 && unreadable >= OUTAGE_FAILURES)) {
    throw new Error(`${unreadable} parties sans réponse lisible, ${read} lues, dernière erreur : ${lastFailure}`);
  }
  return { read, left: todo.length - read, unreadable };
}

/** Retire les comptes supprimés de la liste des membres, comme le demande OpenFront, sans attendre sa relecture quotidienne. */
async function dropDeletedMembers(api: ApiClient, deps: Deps, members: StoredMembers): Promise<StoredMembers> {
  const deleted = new Set((await api.get("/players/recently-deleted", ApiDeletedPlayers)).map((d) => d.publicId));
  const kept = members.members.filter((m) => !m.publicId || !deleted.has(m.publicId));
  const removed = members.members.length - kept.length;
  if (removed === 0) return members;
  const cleaned = { ...members, total: members.total - removed, members: kept };
  await writeJson(join(deps.dataDir, "members.json"), cleaned);
  deps.log(`comptes supprimés retirés de la liste : ${removed}`);
  return cleaned;
}

const memberWeeksFile = (deps: Deps) => join(deps.dataDir, "member-weeks.json");
const readMemberWeeks = async (deps: Deps) => (await readJson(memberWeeksFile(deps), StoredMemberWeeks)) ?? EMPTY_MEMBER_WEEKS;

async function writeMemberWeeks(deps: Deps, weeks: StoredMemberWeeks): Promise<void> {
  await writeJson(memberWeeksFile(deps), weeks);
}

async function writeMemberGames(deps: Deps, players: ReadonlyMap<string, StoredMemberRecent>): Promise<void> {
  await mkdir(dirname(deps.memberGamesFile), { recursive: true });
  await writeJson(deps.memberGamesFile, Object.fromEntries(players));
}

const readMemberResults = async (deps: Deps): Promise<StoredMemberResults> => (await readJson(deps.memberResultsFile, StoredMemberResults)) ?? {};

async function writeMemberResults(deps: Deps, results: StoredMemberResults): Promise<void> {
  await mkdir(dirname(deps.memberResultsFile), { recursive: true });
  // Une seule ligne invalide ferait rejeter tout le fichier à la lecture : il est vérifié avant d'être écrit.
  await writeJson(deps.memberResultsFile, StoredMemberResults.parse(results));
}

/**
 * Oublie un membre parti, ou qui a retiré son pseudo : il n'a plus de fiche, et son identifiant ne doit rester nulle part.
 * Aucun appel à l'API : cela reste vrai quand une route est en panne. Les fichiers des paliers franchis et des plus actifs sont
 * nettoyés ici aussi, car leur envoi sur Discord ne tourne pas sans lien, comme celui des podiums.
 */
async function forgetFormerMembers(deps: Deps, members: StoredMembers): Promise<Map<string, StoredMemberRecent>> {
  const stored = (await readJson(deps.memberGamesFile, StoredMemberGames)) ?? {};
  const current = new Set(members.members.flatMap((m) => (m.username && m.publicId ? [m.publicId] : [])));
  const players = new Map(Object.entries(stored).filter(([id]) => current.has(id)));
  if (players.size !== Object.keys(stored).length) await writeMemberGames(deps, players);
  const results = await readJson(deps.memberResultsFile, StoredMemberResults);
  if (results) {
    const keptResults = forgetInMemberResults(results, current);
    if (keptResults !== results) await writeMemberResults(deps, keptResults);
  }
  const weeks = await readMemberWeeks(deps);
  const kept = forgetInMemberWeeks(weeks, current);
  if (kept !== weeks) await writeMemberWeeks(deps, kept);
  const milestonesFile = join(deps.dataDir, "paliers-envoi.json");
  const milestones = await readJson(milestonesFile, MilestoneState);
  if (milestones) {
    const keptMilestones = forgetMilestoneMembers(milestones, current);
    if (keptMilestones !== milestones) await writeJson(milestonesFile, keptMilestones);
  }
  const activeFile = join(deps.dataDir, "actifs-envoi.json");
  const active = await readJson(activeFile, ActiveState);
  if (active) {
    const keptActive = forgetActiveMembers(active, current);
    if (keptActive !== active) await writeJson(activeFile, keptActive);
  }
  return players;
}

/**
 * Sans relevé du lundi d'avant, ou si ce relevé n'a pas les parties jouées, le plus ancien relevé de la semaine écoulée, gardé dans l'historique Git.
 * Une panne de GitHub ne bloque rien, et l'avertissement se lit dans l'Action. Sans repère du lundi d'avant, le passage suivant
 * du même lundi réessaie. Avec un repère sans les parties, la semaine est arrêtée tout de suite, pour que son podium parte :
 * elle n'aura simplement pas « les plus actifs », et rien ne la refait.
 */
async function weekStartFromHistory(deps: Deps, weeks: StoredMemberWeeks, members: StoredMembers): Promise<{ reading: StoredMembers | null; warning: string | null }> {
  const { date, weekday } = parisParts(members.fetchedAt);
  const week = addDays(date, -7);
  // Le repère du lundi d'avant suffit, sauf s'il date d'avant le relevé des parties : l'historique les donne alors, une fois.
  const complete = weeks.reading?.on === week && weeks.reading.games !== undefined;
  if (!deps.memberHistory || weekday !== 0 || weeks.tops[week] || complete) return { reading: null, warning: null };
  try {
    return { reading: await deps.memberHistory(parisStartOf(week), parisStartOf(date)), warning: null };
  } catch (e) {
    const why = e instanceof Error ? e.message : "erreur inconnue";
    // Seules les parties manquaient au repère : la semaine s'arrête sans elles.
    if (weeks.reading?.on === week) return { reading: null, warning: `les plus actifs de la semaine : historique illisible (${why}), cette semaine est arrêtée sans eux` };
    return { reading: null, warning: `joueurs de la semaine : historique illisible (${why}), nouvel essai au passage suivant` };
  }
}

/** Le relevé du lundi, pour les joueurs de la semaine. Aucun appel à l'API d'OpenFront : il part de la liste déjà relue. */
async function noteMemberWeek(deps: Deps, members: StoredMembers): Promise<string | null> {
  const weeks = await readMemberWeeks(deps);
  const start = await weekStartFromHistory(deps, weeks, members);
  const next = nextMemberWeeks(weeks, members, start.reading);
  if (next !== weeks) await writeMemberWeeks(deps, next);
  return start.warning;
}

/** Les dernières parties sous le tag des membres avec pseudo. Tant que ses parties selon `stats.team` ne bougent pas, un joueur n'est pas relu. Rien n'est écrit pour un anonyme. */
export async function fetchMemberGames(api: ApiClient, deps: Deps, members: StoredMembers): Promise<{ read: number; left: number; unreadable: number }> {
  const players = await forgetFormerMembers(deps, members);
  const named = members.members.flatMap((m) => (m.username && m.publicId ? [{ id: m.publicId, games: gamesOf(m) ?? 0 }] : []));

  // Ceux jamais lus d'abord : tant qu'ils n'ont rien, leur fiche ne montre aucune partie.
  const todo = named.filter((m) => m.games > 0 && players.get(m.id)?.seen !== m.games).sort((a, b) => Number(players.has(a.id)) - Number(players.has(b.id)));
  const today = parisParts(deps.now()).date;
  const budget = deps.memberCallsPerRun ?? MEMBER_CALLS_PER_RUN;
  let calls = 0;
  let read = 0;
  let unreadable = 0;
  let lastFailure = "";
  let changed = false;
  try {
    for (const { id, games } of todo) {
      if (calls >= budget || unreadable >= MAX_FAILURES_PER_RUN) break;
      try {
        const wanted = Math.min(games, MEMBER_RECENT_GAMES);
        const rows = [];
        let found: StoredMemberGame[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
          const query: string = `filter=team&type=public${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
          calls++;
          pages++;
          const page = await api.get(`/player/${encodeURIComponent(id)}/games?${query}`, ApiPlayerGames);
          rows.push(...page.results);
          found = memberGamesUnderTag(rows, deps.tag);
          cursor = page.nextCursor;
        } while (cursor && pages < MEMBER_PAGES_MAX && found.length < wanted);
        // Tout son historique est lu sans y trouver ce que dit `stats.team` : c'est la réponse qui se trompe. Ce qui est déjà gardé reste.
        if (cursor === null && found.length < wanted) throw new Error(`réponse incomplète : ${found.length} parties pour ${wanted} attendues`);
        players.set(id, StoredMemberRecent.parse({ seen: games, readOn: today, recent: found }));
        changed = true;
        read++;
      } catch (e) {
        unreadable++;
        // Ce message finit dans `meta.json` et dans le journal de l'Action, tous deux publics : sans l'identifiant du joueur, ni le curseur de l'API.
        lastFailure = (e instanceof Error ? e.message : String(e)).replaceAll(id, "…").replace(/\?\S*/g, "").slice(0, 300);
        deps.log(`fiche sans réponse lisible : ${lastFailure}`);
      }
    }
  } finally {
    if (changed) await writeMemberGames(deps, players);
  }
  if (unreadable >= MAX_FAILURES_PER_RUN || (read === 0 && unreadable >= OUTAGE_FAILURES)) {
    throw new Error(`${unreadable} fiches sans réponse lisible, ${read} lues, dernière erreur : ${lastFailure}`);
  }
  return { read, left: todo.length - read, unreadable };
}

type ResultRows = StoredMemberResults[string]["games"];

/** Les parties de plusieurs lectures, sans doublon, des plus récentes aux plus anciennes. */
function mergeResultRows(...lists: ResultRows[]): ResultRows {
  const byId = new Map<string, ResultRows[number]>();
  for (const list of lists) for (const row of list) if (!byId.has(row[0])) byId.set(row[0], row);
  return [...byId.values()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0] < b[0] ? 1 : -1));
}

/**
 * Pour les podiums des joueurs : les parties sous le tag de chaque membre avec pseudo, lues dans sa liste officielle, 100 par page
 * (`/public/player/:id/sessions`). Un joueur est relu quand ses parties selon `stats.team` ont bougé, de la plus récente jusqu'à
 * six heures avant la lecture précédente. Sa liste se lit ensuite en remontant le temps, page après page, jusqu'au début de
 * l'archive. Ceux jamais lus passent d'abord. Rien n'est écrit pour un anonyme, ni rien de ce qu'il joue hors du tag, pas même le
 * nombre de ces parties. Une page qui ne répond pas est simplement relue plus tard : ce qui est gardé reste.
 */
export async function fetchMemberResults(api: ApiClient, deps: Deps, members: StoredMembers): Promise<{ read: number; left: number; unreadable: number }> {
  const results = await readMemberResults(deps);
  const named = members.members.flatMap((m) => (m.username && m.publicId ? [{ id: m.publicId, games: gamesOf(m) ?? 0 }] : []));
  const budget = deps.memberResultsCallsPerRun ?? RESULTS_CALLS_PER_RUN;
  let calls = 0;
  let read = 0;
  let unreadable = 0;
  let lastFailure = "";
  let changed = false;
  const page = async (id: string, cursor: string | null) => {
    calls++;
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await api.get(`/player/${encodeURIComponent(id)}/sessions${query}`, ApiPlayerSessions);
    read++;
    return { rows: res.results, next: res.nextCursor ?? null };
  };
  // Avant le début de l'archive, aucune session du clan ne permettrait de reconnaître une victoire : la lecture s'arrête là.
  const finished = (rows: readonly ApiPlayerSession[], next: string | null) => next === null || rows.length === 0 || (rows.at(-1)?.gameStart ?? "") < deps.archiveStart;
  const fail = (e: unknown, id: string) => {
    unreadable++;
    // Ce message finit dans `meta.json` et dans le journal de l'Action, tous deux publics : sans l'identifiant du joueur, ni le curseur de l'API.
    lastFailure = (e instanceof Error ? e.message : String(e)).replaceAll(id, "…").replace(/\?\S*/g, "").slice(0, 300);
    deps.log(`podiums : liste sans réponse lisible : ${lastFailure}`);
  };

  const fresh = named.filter((m) => m.games > 0 && results[m.id]?.seen !== m.games).sort((a, b) => Number(a.id in results) - Number(b.id in results));
  try {
    for (const { id, games } of fresh) {
      if (calls >= budget || unreadable >= MAX_FAILURES_PER_RUN) break;
      const known = results[id];
      try {
        const stop = known ? new Date(Date.parse(known.readAt) - RESULTS_OVERLAP_MS).toISOString() : null;
        const readAt = deps.now().toISOString();
        const found: ApiPlayerSession[] = [];
        let cursor: string | null = null;
        let pages = 0;
        let reached = false;
        do {
          const res = await page(id, cursor);
          pages++;
          for (const row of res.rows) {
            if (stop !== null && row.gameStart < stop) {
              reached = true;
              break;
            }
            found.push(row);
          }
          cursor = res.next;
          // Premier relevé : une page, la suite se lit en remontant le temps.
        } while (known && !reached && cursor !== null && pages < RESULTS_NEW_PAGES_MAX && calls < budget);
        // Budget du passage épuisé avant de rejoindre les parties déjà gardées : ce joueur reprendra au passage suivant.
        if (known && !reached && cursor !== null && pages < RESULTS_NEW_PAGES_MAX) continue;
        const rows = teamRowsOf(found, deps.tag, deps.archiveStart);
        if (known && (reached || cursor === null)) {
          results[id] = { seen: games, readAt, older: known.older, games: mergeResultRows(rows, known.games) };
        } else {
          // Premier relevé, ou trop de nouvelles parties pour rejoindre les anciennes : la liste repart de là, sans trou.
          results[id] = { seen: games, readAt, older: finished(found, cursor) ? null : cursor, games: mergeResultRows(rows) };
        }
        changed = true;
      } catch (e) {
        fail(e, id);
      }
    }
    for (const { id } of named) {
      let entry = results[id];
      while (entry?.older && calls < budget && unreadable < MAX_FAILURES_PER_RUN) {
        try {
          const res = await page(id, entry.older);
          entry = { ...entry, older: finished(res.rows, res.next) ? null : res.next, games: mergeResultRows(entry.games, teamRowsOf(res.rows, deps.tag, deps.archiveStart)) };
          results[id] = entry;
          changed = true;
        } catch (e) {
          fail(e, id);
          break;
        }
      }
    }
  } finally {
    if (changed) await writeMemberResults(deps, results);
  }
  if (unreadable >= MAX_FAILURES_PER_RUN || (read === 0 && unreadable >= OUTAGE_FAILURES)) {
    throw new Error(`${unreadable} listes de parties sans réponse lisible, ${read} pages lues, dernière erreur : ${lastFailure}`);
  }
  const left = named.filter((m) => m.games > 0 && (results[m.id]?.seen !== m.games || results[m.id]?.older)).length;
  return { read, left, unreadable };
}

export interface RunSummary {
  errors: string[];
}

/** Une collecte complète. Un jeu de données en échec garde ses derniers fichiers valides. */
export async function runPipeline(deps: Deps): Promise<RunSummary> {
  await mkdir(join(deps.dataDir, "history"), { recursive: true });
  await mkdir(join(deps.dataDir, "rivals"), { recursive: true });
  const metaPath = join(deps.dataDir, "meta.json");
  const meta = (await readJson(metaPath, Meta)) ?? emptyMeta();
  const api = new ApiClient(deps);
  const at = deps.now().toISOString();
  const errors: string[] = [];
  meta.lastRunAt = at;

  const failed = (label: string, state: DatasetState, e: unknown) => {
    const msg = markError(state, at, e);
    errors.push(`${label} : ${msg}`);
    deps.log(`ÉCHEC ${label} : ${msg}`);
  };

  let leaderboard: StoredLeaderboard | null = null;
  try {
    leaderboard = await fetchLeaderboard(api, deps, at);
    markOk(meta.leaderboard, at);
    deps.log(`classement : ${leaderboard.clans.length} clans`);
  } catch (e) {
    failed("classement", meta.leaderboard, e);
  }

  // Un tag inconnu renvoie 200 avec des zéros : on vérifie avant d'écrire quoi que ce soit.
  let clanExists = false;
  try {
    clanExists = (await api.get(`/clan/${deps.tag}/exists`, ApiClanExists)).exists;
    if (!clanExists) throw new Error(`le tag ${deps.tag} n'existe pas`);
  } catch (e) {
    failed("sessions", meta.sessions, e);
    failed("membres", meta.members, e);
    failed("parties", meta.games, e);
    failed("fiches des membres", meta.memberGames, e);
    failed("podiums des joueurs", meta.memberResults, e);
  }

  if (clanExists) {
    try {
      await fetchSessions(api, deps, meta);
      markOk(meta.sessions, at);
      deps.log(`sessions : couvertes jusqu'au ${meta.sessions.coveredUntil}`);
    } catch (e) {
      failed("sessions", meta.sessions, e);
    }

    try {
      const { read, left, unreadable } = await fetchGames(api, deps);
      // Rien de lu alors qu'il y avait à lire : les données n'ont pas bougé, la date de mise à jour non plus.
      if (read > 0 || unreadable === 0) markOk(meta.games, at);
      deps.log(`parties : ${read} lues, ${left} restent à lire`);
      // Peu nombreux, ces échecs ne sont pas une panne : le site ne l'annonce pas, et son décompte des parties lues reste juste. Le journal de l'Action les garde.
      if (unreadable > 0) errors.push(`parties sans réponse lisible, à relire : ${unreadable}`);
    } catch (e) {
      failed("parties", meta.games, e);
    }

    const lastMembers = meta.members.lastSuccessAt ? Date.parse(meta.members.lastSuccessAt) : 0;
    if (deps.now().getTime() - lastMembers >= MEMBERS_MIN_INTERVAL_MS || isFirstOfMonday(meta.members.lastSuccessAt, deps.now())) {
      try {
        const total = await fetchMembers(api, deps, at);
        markOk(meta.members, at);
        deps.log(`membres : ${total}`);
      } catch (e) {
        failed("membres", meta.members, e);
      }
    }
  }

  let members = await readJson(join(deps.dataDir, "members.json"), StoredMembers);

  if (members) {
    // Les comptes supprimés sont retirés avant toute lecture par joueur : sans leur liste, ni fiches ni podiums ne sont lus.
    let cleaned = false;
    let cleaning: unknown = null;
    try {
      await forgetFormerMembers(deps, members);
      if (clanExists) {
        members = await dropDeletedMembers(api, deps, members);
        cleaned = true;
        const warning = await noteMemberWeek(deps, members);
        if (warning) errors.push(warning);
        const { read, left, unreadable } = await fetchMemberGames(api, deps, members);
        if (read > 0 || unreadable === 0) markOk(meta.memberGames, at);
        deps.log(`fiches des membres : ${read} lues, ${left} restent à lire`);
        if (unreadable > 0) errors.push(`fiches sans réponse lisible, à relire : ${unreadable}`);
      }
    } catch (e) {
      failed("fiches des membres", meta.memberGames, e);
      if (!cleaned) cleaning = e;
    }
    if (clanExists && cleaned) {
      try {
        const { read, left, unreadable } = await fetchMemberResults(api, deps, members);
        if (read > 0 || unreadable === 0) markOk(meta.memberResults, at);
        deps.log(`podiums des joueurs : ${read} pages lues, ${left} joueurs restent à lire`);
        if (unreadable > 0) errors.push(`listes de parties sans réponse lisible, à relire : ${unreadable}`);
      } catch (e) {
        failed("podiums des joueurs", meta.memberResults, e);
      }
    } else if (clanExists && cleaning !== null) {
      failed("podiums des joueurs", meta.memberResults, cleaning);
    }
  }

  // Sans roster, impossible de reconnaître nos joueurs : son absence est déjà signalée.
  if (members) {
    try {
      const found = await fetchRanked(api, deps, at, members);
      markOk(meta.ranked, at);
      deps.log(`classé : ${found} places tenues par des membres`);
    } catch (e) {
      failed("classé", meta.ranked, e);
    }
  }

  if (leaderboard) {
    const me = findClan(withOfficialRanks(leaderboard.clans), deps.tag);
    const date = parisParts(at).date;
    const snapshot: HistorySnapshot = {
      date,
      capturedAt: at,
      leaderboardEnd: leaderboard.end,
      clansListed: leaderboard.clans.length,
      rank: me?.rank ?? null,
      score: me?.weightedWins ?? null,
      games: me?.games ?? null,
      wins: me?.wins ?? null,
      losses: me?.losses ?? null,
      membersTotal: members?.total ?? null,
    };
    await writeJson(join(deps.dataDir, "history", `${date}.json`), snapshot);
    // L'API ne donne pas le passé du classement : ce qui n'est pas relevé aujourd'hui est perdu.
    const rivals: RivalsSnapshot = {
      date,
      capturedAt: at,
      leaderboardEnd: leaderboard.end,
      clans: leaderboard.clans.map((c) => ({ clanTag: c.clanTag, weightedWins: c.weightedWins })),
    };
    await writeJson(join(deps.dataDir, "rivals", `${date}.json`), rivals);
  }

  await writeJson(metaPath, meta);
  return { errors };
}
