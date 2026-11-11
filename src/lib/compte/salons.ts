/**
 * Les appels aux salons, au QG : un membre validé qui attend dans un salon d'OpenFront colle le lien que le jeu lui donne
 * pour inviter ses amis, et les membres validés connectés sont prévenus, sur les pages du site. Le site ne lit rien chez OpenFront :
 * il refait seulement l'adresse du salon à partir de son identifiant. Le serveur (`save_lobby_call`, `get_lobby_calls`)
 * refait chaque contrôle ; ici, de quoi lire sa réponse sans rien inventer.
 */
import { fmtInt } from "../format";
import { safeAvatar } from "./qg";

/**
 * Les formats qu'un appel peut porter. Depuis le 10 novembre 2026, le QG ne les demande plus (migration
 * `20261110000100_appels_sans_format.sql`) : seuls les appels lancés avant, ou depuis une page restée ouverte, en ont un.
 * Pas de chacun pour soi : le jeu y cache les tags, et ses conditions y interdisent toute entente arrangée hors de la partie.
 */
export const LOBBY_FORMATS = {
  duos: "Duos",
  trios: "Trios",
  quads: "Quads",
  "2": "2 équipes",
  "3": "3 équipes",
  "4": "4 équipes",
  "5": "5 équipes",
  "6": "6 équipes",
  "7": "7 équipes",
  private: "Salon privé",
} as const;

export type LobbyFormat = keyof typeof LOBBY_FORMATS;

/** L'ordre des formats, celui des listes du serveur que les tests comparent : JavaScript range les clés « 2 » à « 7 » avant les autres, l'ordre de `LOBBY_FORMATS` ne compte donc pas. */
export const FORMAT_ORDER: readonly LobbyFormat[] = ["duos", "trios", "quads", "2", "3", "4", "5", "6", "7", "private"];

const isFormat = (value: unknown): value is LobbyFormat => typeof value === "string" && Object.hasOwn(LOBBY_FORMATS, value);

/**
 * L'identifiant d'une partie d'OpenFront, avec la règle du jeu lui-même (`GAME_ID_REGEX`) : une lettre et neuf caractères
 * aujourd'hui. La migration `20261109000300_appels_aux_salons.sql` écrit la même, et un test les compare.
 */
export const GAME_ID_PATTERN = "^[A-Za-z0-9]{8,10}$";
const GAME_ID = new RegExp(GAME_ID_PATTERN);

/**
 * L'identifiant de la partie dans ce que le membre a collé : le lien du bouton de copie de l'écran du salon, l'adresse de
 * la barre du navigateur, ou l'identifiant seul. openfront.io ne lit que cet identifiant dans `…/game/<id>` : le numéro de
 * serveur (`/w3`) et la fin `?lobby&s=…` du lien d'un salon privé ne servent pas à rejoindre (voir `docs/API_AUDIT.md`,
 * « Salons en attente »). `null` : rien de reconnaissable, ou une autre adresse qu'openfront.io.
 */
export function lobbyIdOf(input: string): string | null {
  const text = input.trim();
  if (GAME_ID.test(text)) return text;
  const match = /^(?:https?:\/\/)?(?:www\.)?openfront\.io\/(?:v\/[A-Za-z0-9._-]{1,64}\/)?(?:w\d{1,3}\/)?game\/([A-Za-z0-9]{8,10})(?:[/?#]\S*)?$/.exec(text);
  return match?.[1] ?? null;
}

/** L'adresse du salon, refaite par le site sur openfront.io : celle de la barre d'adresse du jeu, sans numéro de serveur. */
export const lobbyUrl = (game: string): string => `https://openfront.io/game/${game}`;

/**
 * La taille des équipes, quand le format la fixe. Le jeu met tous les joueurs d'un même tag dans une seule équipe et passe
 * en spectateurs ceux qui n'y tiennent pas (voir `docs/API_AUDIT.md`, « Salons en attente »). Les autres formats ont des
 * équipes dont la taille dépend du nombre de joueurs.
 */
export const TEAM_SIZE: Partial<Record<LobbyFormat, number>> = { duos: 2, trios: 3, quads: 4 };

/** Ce que le format dit à ceux qui veulent rejoindre. Le site ne sait pas qui a déjà rejoint : il dit la règle, pas les places libres. */
export function seatsNote(format: LobbyFormat | null): string | null {
  if (format === null) return null;
  const size = TEAM_SIZE[format];
  if (size !== undefined) return `Équipes de ${size} joueurs : le jeu met tous les Gaulois dans la même et passe en spectateurs ceux qui n'y tiennent pas.`;
  if (format === "private") return "Un salon privé ne compte pas au classement des clans.";
  return null;
}

export interface LobbyCall {
  id: number;
  game: string;
  /** `null` : le membre n'a pas dit le format, le cas de tous les appels depuis le 10 novembre 2026. */
  format: LobbyFormat | null;
  createdAt: string;
  expiresAt: string;
  /** L'appel du membre connecté. */
  mine: boolean;
  /** Son message est parti vers le salon Discord des appels. Le serveur ne dit pas ici ce que Discord a répondu. */
  discord: boolean;
  /** Le pseudo d'aujourd'hui de celui qui appelle, ou le nom de son compte. */
  name: string;
  /** Sa photo Discord, s'il a choisi de se montrer. `null` : la page montre son initiale. */
  avatar: string | null;
}

export interface LobbyCalls {
  /** L'heure du serveur au moment de la réponse, en millisecondes. */
  now: number;
  /** Les appels partent aussi dans un salon Discord du clan, avec le pseudo de qui appelle (migration `20261111000100_appels_sur_discord.sql`). */
  discord: boolean;
  calls: LobbyCall[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const timeOf = (value: unknown): number | null => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);

function callOf(raw: unknown): LobbyCall | null {
  if (!isRecord(raw)) return null;
  const { id, game, format, created_at: createdAt, expires_at: expiresAt, name } = raw;
  if (typeof id !== "number" || !Number.isInteger(id) || typeof game !== "string" || !GAME_ID.test(game)) return null;
  // Pas de format : l'appel se montre sans. Un format inconnu, lui, rend l'appel illisible plutôt que deviné.
  if (format !== null && format !== undefined && !isFormat(format)) return null;
  if (typeof createdAt !== "string" || timeOf(createdAt) === null || typeof expiresAt !== "string" || timeOf(expiresAt) === null) return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  return { id, game, format: isFormat(format) ? format : null, createdAt, expiresAt, mine: raw["mine"] === true, discord: raw["discord"] === true, name, avatar: safeAvatar(raw["avatar"]) };
}

/** La réponse de `get_lobby_calls`, relue : un appel illisible n'est pas montré. `null` : la réponse n'a pas la forme attendue. */
export function parseLobbyCalls(raw: unknown): LobbyCalls | null {
  if (!isRecord(raw) || !Array.isArray(raw["calls"])) return null;
  const now = timeOf(raw["now"]);
  if (now === null) return null;
  // Avant la migration des appels sur Discord, le serveur ne donne pas `discord` : rien ne part sur Discord.
  return { now, discord: raw["discord"] === true, calls: raw["calls"].flatMap((call) => callOf(call) ?? []) };
}

/** Les refus du serveur qui ne passeront pas en réessayant : plus de session, compte pas encore validé, compte suspendu. La relecture s'arrête là. */
export const isFinalRefusal = (code: string): boolean => code === "not_signed_in" || code === "not_validated" || code === "suspended";

/** La clé d'un appel : un nouveau salon du même membre fait de nouveau sonner, le même salon jamais deux fois. */
export const callKey = (call: Pick<LobbyCall, "id" | "game">): string => `${call.id}:${call.game}`;

/**
 * Les appels qui ouvrent un pop-up : ceux que cette page n'a pas encore montrés ni vu fermer. Celui du membre connecté
 * compris, depuis le 10 novembre 2026 : celui qui lance l'appel reçoit lui aussi une fenêtre, comme celle des autres.
 */
export function freshCalls(calls: readonly LobbyCall[], seen: ReadonlySet<string>): LobbyCall[] {
  return calls.filter((call) => !seen.has(callKey(call)));
}

/** Les Gaulois qui attendent dans un salon, sans compter le membre connecté : le nombre de l'onglet « Salons » du QG. */
export function waitingOthers(calls: readonly Pick<LobbyCall, "mine">[]): number {
  return calls.filter((call) => !call.mine).length;
}

/** Le texte d'un appel pour celui qui l'a lancé : « Vous attendez dans un salon Trios. » */
export const ownCallSentence = (call: Pick<LobbyCall, "format">): string => `Vous attendez dans ${salonOf(call.format)}.`;

/** Un appel fini (retiré, ou au bout de 15 minutes), au passé : le site ne sait pas si la partie a commencé. */
export const endedCallSentence = (call: Pick<LobbyCall, "format" | "mine" | "name">): string =>
  call.mine ? `Vous attendiez dans ${salonOf(call.format)}.` : `${call.name} attendait dans ${salonOf(call.format)}.`;

/** « à l'instant », « il y a 1 min », « il y a 12 min », d'après l'heure du serveur. */
export function sinceLabel(createdAt: string, now: number): string {
  const minutes = Math.floor((now - (Date.parse(createdAt) || now)) / 60_000);
  return minutes < 1 ? "à l'instant" : `il y a ${fmtInt(minutes)} min`;
}

/** « un salon Trios », « un salon à 4 équipes », « un salon privé ». */
export function salonOf(format: LobbyFormat | null): string {
  if (format === null) return "un salon";
  if (format === "private") return "un salon privé";
  return /^\d$/.test(format) ? `un salon à ${LOBBY_FORMATS[format]}` : `un salon ${LOBBY_FORMATS[format]}`;
}

/** Le texte d'un appel, pour le pop-up et pour les lecteurs d'écran : « Pseudo attend dans un salon Trios. » */
export const callSentence = (call: Pick<LobbyCall, "name" | "format">): string => `${call.name} attend dans ${salonOf(call.format)}.`;
