/**
 * Les victoires du clan, une par message, dans un salon Discord à part : demandées par le pilote le 11 novembre 2026, « pareil
 * que ce bot » (OpenFront BotAPP, qui annonce chaque victoire de [GAL]), « dans la même ADN que nos webhooks, avec l'image de
 * la carte », puis le même soir : chaque Gaulois nommé comme il s'appelle dans la partie, tous les membres, et « au maximum
 * 10 min après la victoire ». Le message et son image : `victoires-discord.ts` et `victoires-image.ts`.
 *
 * - Une victoire est une session du clan gagnée (`hasWon`), lue sur l'API dans les dernières heures, et dans `data/sessions/`.
 *   Une partie jouée seul contre des robots (`totalPlayerCount` < 2) n'en est pas une, comme dans les records du clan.
 * - L'envoi a son workflow (`.github/workflows/victoires.yml`), lancé toutes les 5 minutes par cron-job.org, et à chaque passage
 *   du workflow du site, en secours : chaque victoire part au passage qui suit la fin de la partie, jour et nuit, dans l'ordre
 *   des débuts. Au plus `MAX_PER_PASS` messages par passage, les autres au suivant. Une victoire commencée depuis plus de
 *   `WINDOW_MS` n'est plus annoncée : un envoi arrêté quelques heures ne déverse pas son retard dans le salon.
 * - Au premier passage, les victoires du moment servent de départ : rien n'est envoyé.
 * - Les Gaulois cités sont les membres du clan qui ont des stats dans la partie (comme `clanPlayerCount`), sous le nom qu'ils y
 *   portaient, anonymes compris. Un membre avec pseudo est reconnu dans la liste du clan par son identifiant public, et relié à
 *   sa fiche. Les autres porteurs du tag sont vérifiés un par un dans leur fiche publique d'OpenFront (`clans`) : le jeu retire
 *   le tag d'un vrai clan à qui n'en est pas membre, sauf quand sa liste des tags ne se charge pas. Un joueur non vérifié est
 *   seulement compté. Ni nom ni identifiant ne sont écrits dans `data/`.
 */
import { z } from "zod";
import { API_BASE, type ApiClient, fetchSessionsBetween } from "./pipeline";
import { ApiPlayerClans, ApiVictoryGame, type StoredMembers, type StoredSession } from "./schemas";
import { mergeSessions } from "./sessions";

/** Au-delà, une victoire n'est plus annoncée. Une partie dure rarement plus de deux heures. */
export const WINDOW_MS = 6 * 3_600_000;
/** Une victoire reste notée un jour : bien après qu'elle ne peut plus être annoncée. */
export const FORGET_MS = 24 * 3_600_000;
/** Au plus tant de messages par passage. Jusqu'à onze victoires commencent dans une même heure : le reste part au passage suivant. */
export const MAX_PER_PASS = 10;
/** Entre deux messages, loin de la limite de Discord, cinq envois en deux secondes par webhook. */
export const PAUSE_MS = 2_000;
/** Un nom de partie plus long est coupé : le jeu en limite la taille, et un message reste lisible. */
const NAME_MAX = 40;

export const VictoryState = z.object({
  /** Les victoires passées, annoncées ou déjà là au premier passage : [partie, début]. Oubliées au bout de `FORGET_MS`. */
  done: z.array(z.tuple([z.string().min(1), z.iso.datetime()])),
});
export type VictoryState = z.infer<typeof VictoryState>;

export interface CrewMember {
  /** Le nom porté dans la partie. */
  name: string;
  /** L'identifiant public d'un membre avec pseudo, pour le lien vers sa fiche, déjà publique. `null` : pas de fiche. */
  id: string | null;
}

export interface Victory {
  id: string;
  /** Le début de la partie. */
  start: string;
  /** La carte, comme le jeu la nomme. */
  map: string;
  seconds: number;
  /** `playerTeams` de la session : « 4 », « Trios »… */
  format: string | null;
  /** Joueurs du clan et joueurs de la partie, avec des stats, selon la session. */
  gaulois: number;
  players: number;
  /** Ce que la partie a ajouté au score du clan. `null` : la session n'en donne pas de positifs. */
  points: number | null;
  /** Les membres du clan dans la partie, par ordre alphabétique de leur nom en partie. */
  crew: CrewMember[];
  /** Les membres dont le nom ne se lit pas : seulement comptés. */
  unnamed: number;
  /**
   * Les porteurs du tag hors du clan : leur fiche d'OpenFront ne donne pas le clan, ou ils jouent sans compte. Seulement comptés,
   * jamais nommés. Un membre dont la fiche ne se lit pas n'est jamais rangé ici : sa victoire attend le passage suivant.
   */
  outsiders: number;
}

/** Une victoire à annoncer : gagnée, et pas seul contre des robots. */
export const isVictory = (s: StoredSession) => s.hasWon && s.totalPlayerCount >= 2;

const ageOf = (s: StoredSession, now: Date) => now.getTime() - Date.parse(s.gameStart);
const byStart = (a: StoredSession, b: StoredSession) => a.gameStart.localeCompare(b.gameStart) || a.gameId.localeCompare(b.gameId);

/** Le nom d'un joueur dans la partie, sans un tag écrit devant, sur une ligne, coupé s'il est trop long. Vide : illisible. */
export function crewName(raw: string | null): string {
  const name = (raw ?? "").replace(/\s+/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/^(\s*\[[^\]]*\]\s*)+/u, "").trim();
  const chars = [...name];
  return chars.length > NAME_MAX ? `${chars.slice(0, NAME_MAX - 1).join("").trim()}…` : name;
}

/** Les membres avec pseudo de la liste du clan : identifiant public et pseudo. */
function namedMembers(members: StoredMembers | null): Map<string, string> {
  const known = new Map<string, string>();
  for (const m of members?.members ?? []) if (m.publicId && m.username) known.set(m.publicId, m.username);
  return known;
}

/** Les porteurs du tag avec des stats que la liste du clan ne reconnaît pas : leur appartenance est à vérifier une par une. */
export function toVerify(game: ApiVictoryGame, members: StoredMembers | null, tag: string): string[] {
  const known = namedMembers(members);
  const ids = new Set<string>();
  for (const p of game.info.players) if (p.clanTag === tag && p.hasStats && p.publicID && !known.has(p.publicID)) ids.add(p.publicID);
  return [...ids];
}

/**
 * Le message d'une victoire : la session, et le détail de la partie pour la carte, la durée et les membres qui y ont joué.
 * `confirmed` : les identifiants hors de la liste du clan dont l'appartenance au clan vient d'être vérifiée.
 */
export function victoryOf(session: StoredSession, game: ApiVictoryGame, members: StoredMembers | null, tag: string, confirmed: ReadonlySet<string> = new Set()): Victory {
  const known = namedMembers(members);
  const crew: CrewMember[] = [];
  const linked = new Set<string>();
  let unnamed = 0;
  let outsiders = 0;
  for (const p of game.info.players) {
    if (p.clanTag !== tag || !p.hasStats) continue;
    const pseudo = p.publicID ? known.get(p.publicID) : undefined;
    if (pseudo === undefined && !(p.publicID && confirmed.has(p.publicID))) {
      outsiders++;
      continue;
    }
    // Une fiche par membre : un même compte deux fois dans la partie n'est relié qu'une fois.
    const id = p.publicID && pseudo !== undefined && !linked.has(p.publicID) ? p.publicID : null;
    if (id) linked.add(id);
    const name = crewName(p.username) || (pseudo ? crewName(pseudo) : "");
    if (name) crew.push({ name, id });
    else unnamed++;
  }
  return {
    id: session.gameId,
    start: session.gameStart,
    map: game.info.config.gameMap,
    seconds: Math.round(game.info.duration),
    format: session.playerTeams,
    gaulois: session.clanPlayerCount,
    players: session.totalPlayerCount,
    points: session.score > 0 ? session.score : null,
    crew: crew.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) || a.name.localeCompare(b.name) || (a.id ?? "").localeCompare(b.id ?? "")),
    unnamed,
    outsiders,
  };
}

/** Lit le détail d'une partie, en deux essais. Lève une erreur sans réponse lisible : la victoire attend alors le passage suivant. */
export async function readVictoryGame(gameId: string, get: typeof fetch, sleep: (ms: number) => Promise<void>): Promise<ApiVictoryGame> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(3_000);
    try {
      const response = await get(`${API_BASE}/game/${encodeURIComponent(gameId)}?turns=false`, { headers: { "User-Agent": "GAL-clan-site/1.0" }, signal: AbortSignal.timeout(20_000) });
      if (response.ok) return ApiVictoryGame.parse(await response.json());
      last = `HTTP ${response.status}`;
      // Une partie inconnue ne le sera pas moins trois secondes plus tard.
      if (response.status !== 429 && response.status < 500) break;
    } catch (e) {
      last = e instanceof z.ZodError ? "réponse au mauvais format" : e instanceof Error ? e.message : String(e);
      if (e instanceof z.ZodError) break;
    }
  }
  throw new Error(last.slice(0, 160));
}

/**
 * Le joueur est-il membre du clan, d'après sa fiche publique d'OpenFront ? Seuls les tags de ses clans sont lus. Un compte
 * inconnu (404, par exemple supprimé) n'est pas membre. Lève une erreur si la fiche ne se lit pas : la victoire attend.
 */
export async function isClanMember(api: ApiClient, publicID: string, tag: string): Promise<boolean> {
  try {
    const { clans } = await api.get(`/player/${encodeURIComponent(publicID)}`, ApiPlayerClans);
    return clans.some((c) => c.tag.toUpperCase() === tag.toUpperCase());
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("HTTP 404 ")) return false;
    // Le message de l'API contient le chemin, donc l'identifiant : il n'en sort pas.
    throw new Error("fiche du joueur illisible");
  }
}

/** Les sessions du clan commencées dans les `WINDOW_MS` dernières heures, lues sur l'API : plus fraîches que `data/sessions/`. */
export function readRecentSessions(api: ApiClient, tag: string, now: Date): Promise<StoredSession[]> {
  const start = new Date(now.getTime() - WINDOW_MS).toISOString();
  return fetchSessionsBetween(api, tag, start, now.toISOString(), "des dernières heures");
}

/**
 * Les sessions d'un passage : celles de la dernière collecte et celles des dernières heures, lues à l'instant, chaque partie une
 * fois. L'une sans l'autre suffit : la lecture de l'API couvre toute la fenêtre d'annonce. Sans aucune des deux, `null`.
 */
export function passSessions(collected: readonly StoredSession[] | null, fresh: readonly StoredSession[] | null): { sessions: StoredSession[] | null; warning: string | null } {
  if (collected === null && fresh === null) return { sessions: null, warning: "ni la collecte ni l'API ne donnent de sessions lisibles, rien n'est envoyé" };
  const warning = fresh === null ? "les sessions des dernières heures ne se lisent pas sur l'API, seules celles de la dernière collecte servent" : collected === null ? "un mois de sessions de la collecte est illisible, seules celles des dernières heures servent" : null;
  return { sessions: mergeSessions(collected ?? [], fresh ?? []), warning };
}

/** Deux états notés (dans `data/` et dans le cache du workflow), réunis : une victoire notée dans l'un ne repart pas. */
export function mergeStates(...states: readonly (VictoryState | null)[]): VictoryState | null {
  const present = states.filter((s): s is VictoryState => s !== null);
  if (present.length === 0) return null;
  const byId = new Map<string, string>();
  for (const s of present) for (const [id, start] of s.done) if (!byId.has(id)) byId.set(id, start);
  return { done: [...byId].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])) };
}

export interface VictoryPassDeps {
  /** L'état noté au passage précédent. `null` : premier passage. */
  stored: VictoryState | null;
  /** Les sessions du clan. `null` : aucune source lisible, une victoire pourrait manquer ou repartir. */
  sessions: readonly StoredSession[] | null;
  /** La liste des membres, pour les fiches. `null` : illisible, chaque porteur du tag est vérifié un par un. */
  members: StoredMembers | null;
  tag: string;
  now: Date;
  readGame: (gameId: string) => Promise<ApiVictoryGame>;
  /** Vérifie qu'un porteur du tag est membre du clan. Lève une erreur sans réponse lisible : la victoire attend le passage suivant. */
  isMember: (publicID: string) => Promise<boolean>;
  send: (victory: Victory) => Promise<boolean>;
  pause: (ms: number) => Promise<void>;
  /** Après chaque message accepté, l'état à écrire tout de suite : un passage coupé en route ne renverra pas ce qui est parti. */
  progress?: (state: VictoryState) => void;
  log: (line: string) => void;
}

/**
 * Un passage. `state` : l'état à écrire, `null` s'il n'a pas changé. Une victoire dont le détail ne se lit pas, ou que Discord
 * refuse, reste à annoncer : le passage suivant réessaie, tant qu'elle a moins de `WINDOW_MS`.
 */
export async function victoryPass({ stored, sessions, members, tag, now, readGame, isMember, send, pause, progress, log }: VictoryPassDeps): Promise<{ state: VictoryState | null; failed: boolean }> {
  if (!sessions) {
    log("::warning::Victoires : aucune session lisible, rien n'est envoyé.");
    return { state: null, failed: false };
  }
  // Une partie ne part qu'une fois, même si les sessions la répétaient.
  const wins = mergeSessions([], sessions.filter(isVictory));
  const recent = (s: StoredSession) => ageOf(s, now) <= FORGET_MS;
  if (!stored) {
    const done = wins.filter(recent).sort(byStart).map((s): [string, string] => [s.gameId, s.gameStart]);
    log(`Victoires : premier passage, les victoires du moment servent de départ (${done.length}). Les suivantes partiront.`);
    return { state: { done }, failed: false };
  }
  const done = stored.done.filter(([, start]) => now.getTime() - Date.parse(start) <= FORGET_MS);
  const seen = new Set(done.map(([id]) => id));
  const late = wins.filter((s) => !seen.has(s.gameId) && recent(s) && ageOf(s, now) > WINDOW_MS);
  if (late.length > 0) log(`::warning::Victoires : ${late.length > 1 ? `${late.length} victoires trop anciennes ne seront pas annoncées` : "1 victoire trop ancienne ne sera pas annoncée"}.`);
  for (const s of late) done.push([s.gameId, s.gameStart]);
  const todo = wins.filter((s) => !seen.has(s.gameId) && ageOf(s, now) <= WINDOW_MS).sort(byStart);
  if (todo.length > MAX_PER_PASS) log(`Victoires : ${todo.length - MAX_PER_PASS} de plus attendent le passage suivant.`);
  // Un même joueur revient souvent dans la soirée : il n'est vérifié qu'une fois par passage.
  const checked = new Map<string, boolean>();
  let sent = 0;
  let failed = false;
  for (const session of todo.slice(0, MAX_PER_PASS)) {
    let game: ApiVictoryGame;
    try {
      game = await readGame(session.gameId);
    } catch (e) {
      log(`::warning::Victoires : le détail de la partie ${session.gameId} ne se lit pas (${e instanceof Error ? e.message : String(e)}). Nouvel essai au prochain passage.`);
      continue;
    }
    // Les porteurs du tag hors de la liste relue : vérifiés un par un. Si une fiche ne se lit pas, la victoire attend le passage
    // suivant plutôt que de partir avec un Gaulois compté au lieu d'être nommé : un message posté ne se corrige pas.
    const confirmed = new Set<string>();
    let unreadable = false;
    for (const id of toVerify(game, members, tag)) {
      if (!checked.has(id)) {
        try {
          checked.set(id, await isMember(id));
        } catch {
          unreadable = true;
          break;
        }
      }
      if (checked.get(id)) confirmed.add(id);
    }
    if (unreadable) {
      // L'identifiant d'un joueur n'est jamais écrit, même ici.
      log(`::warning::Victoires : un Gaulois de la partie ${session.gameId} n'a pas pu être vérifié sur l'API. Nouvel essai au prochain passage.`);
      continue;
    }
    if (sent > 0) await pause(PAUSE_MS);
    if (!(await send(victoryOf(session, game, members, tag, confirmed)))) {
      failed = true;
      break;
    }
    sent++;
    done.push([session.gameId, session.gameStart]);
    progress?.({ done: [...done] });
  }
  log(todo.length === 0 ? "Victoires : aucune nouvelle victoire." : `Victoires : ${sent > 1 ? `${sent} victoires annoncées` : `${sent} victoire annoncée`}.`);
  return { state: sent > 0 || late.length > 0 ? { done } : null, failed };
}
