/**
 * Le QG des membres : la face privée du site. Tout son contenu vient du serveur (`get_qg`), qui ne répond qu'à un
 * membre validé : rien n'en est écrit dans les pages du site. Ici, seulement de quoi lire sa réponse sans rien
 * inventer, et vérifier une idée avant l'envoi. Le serveur refait chaque contrôle.
 */
import { fmtInt } from "../format";
import { safeUrl, type EventSeries } from "./news";
import { validPollTotals, type PollTotals } from "./polls";
import { ROLE_LABELS, type Role } from "./types";

/** Bornes du serveur (`save_idea`, `decide_idea`). */
export const IDEA_MIN = 10;
export const IDEA_MAX = 500;
export const IDEA_OPEN_MAX = 3;
export const IDEA_NOTE_MAX = 300;

export type IdeaStatus = "open" | "kept" | "declined" | "done";

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = { open: "À l'étude", kept: "Retenue", declined: "Écartée", done: "Faite" };

/** Ce qu'un membre montre de lui aux autres membres, s'il l'a choisi. */
export interface Face {
  name: string;
  role: Role;
  /** L'adresse de sa photo de profil Discord. `null` : pas de photo lisible, la page montre son initiale. */
  avatar: string | null;
}

export interface QgPoll extends PollTotals {
  id: number;
  question: string;
  created_at: string;
  closes_at: string | null;
  /** La fin d'un sondage fermé. `null` tant qu'il est ouvert. */
  ended_at: string | null;
  is_open: boolean;
  /** Le choix du membre connecté. `null` : il n'a pas voté. */
  mine: number | null;
}

export interface QgEvent {
  id: number;
  title: string;
  description: string | null;
  url: string | null;
  starts_at: string;
  /** Tous les membres validés qui viennent, qu'ils se montrent ou non. */
  going: number;
  mine: boolean;
  series: EventSeries | null;
  /** Ceux qui viennent parmi les membres qui ont choisi de se montrer. */
  faces: Face[];
}

export interface QgIdea {
  id: number;
  body: string;
  status: IdeaStatus;
  /** Le mot de l'encadrement avec sa décision. */
  staff_note: string | null;
  created_at: string;
  decided_at: string | null;
  author: string;
  mine: boolean;
  supports: number;
  supported: boolean;
}

export interface QgData {
  me: { visible: boolean; avatar: string | null };
  /** Les comptes validés sur le site. */
  members: number;
  welcome: { body: string; updated_at: string | null } | null;
  polls: QgPoll[];
  events: QgEvent[];
  ideas: QgIdea[];
  wall: Face[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Une photo ne s'affiche que si c'est une photo choisie par le membre, à l'adresse exacte du serveur d'images de
 * Discord : le serveur du site filtre déjà, on revérifie, car cette adresse finit dans un `src`. L'image par défaut
 * d'un compte sans photo est le logo de Discord : elle est écartée, et la page montre l'initiale.
 */
export function safeAvatar(url: unknown): string | null {
  return typeof url === "string" && /^https:\/\/cdn\.discordapp\.com\/avatars\/[0-9]{5,25}\/[A-Za-z0-9_]{1,80}\.(?:png|gif|webp|jpg)$/.test(url) ? url : null;
}

function faceOf(raw: unknown): Face | null {
  if (!isRecord(raw)) return null;
  const { name, role } = raw;
  if (typeof name !== "string" || name === "" || typeof role !== "string" || !Object.hasOwn(ROLE_LABELS, role)) return null;
  return { name, role: role as Role, avatar: safeAvatar(raw["avatar"]) };
}

const facesOf = (raw: unknown): Face[] => listOf(raw).flatMap((face) => faceOf(face) ?? []);

/** Un sondage dont les totaux seraient illisibles n'est pas montré : un total absent n'est pas zéro. */
function pollOf(raw: unknown): QgPoll | null {
  if (!isRecord(raw) || typeof raw["id"] !== "number" || typeof raw["question"] !== "string" || typeof raw["is_open"] !== "boolean" || typeof raw["created_at"] !== "string") return null;
  if (!validPollTotals(raw)) return null;
  const mine = raw["mine"];
  return {
    id: raw["id"],
    question: raw["question"],
    options: raw.options,
    counts: raw.counts,
    created_at: raw["created_at"],
    closes_at: textOrNull(raw["closes_at"]),
    ended_at: textOrNull(raw["ended_at"]),
    is_open: raw["is_open"],
    mine: isCount(mine) && mine < raw.options.length ? mine : null,
  };
}

function eventOf(raw: unknown): QgEvent | null {
  if (!isRecord(raw) || typeof raw["id"] !== "number" || typeof raw["title"] !== "string" || typeof raw["starts_at"] !== "string" || !isCount(raw["going"])) return null;
  const series = raw["series"];
  return {
    id: raw["id"],
    title: raw["title"],
    description: textOrNull(raw["description"]),
    url: safeUrl(textOrNull(raw["url"])),
    starts_at: raw["starts_at"],
    going: raw["going"],
    mine: raw["mine"] === true,
    series: isRecord(series) && isCount(series["left"]) && typeof series["until"] === "string" ? { left: series["left"], until: series["until"] } : null,
    faces: facesOf(raw["faces"]),
  };
}

function ideaOf(raw: unknown): QgIdea | null {
  if (!isRecord(raw) || typeof raw["id"] !== "number" || typeof raw["body"] !== "string" || typeof raw["created_at"] !== "string" || typeof raw["author"] !== "string") return null;
  const status = raw["status"];
  if (typeof status !== "string" || !Object.hasOwn(IDEA_STATUS_LABELS, status) || !isCount(raw["supports"])) return null;
  return {
    id: raw["id"],
    body: raw["body"],
    status: status as IdeaStatus,
    staff_note: textOrNull(raw["staff_note"]),
    created_at: raw["created_at"],
    decided_at: textOrNull(raw["decided_at"]),
    author: raw["author"],
    mine: raw["mine"] === true,
    supports: raw["supports"],
    supported: raw["supported"] === true,
  };
}

/**
 * La réponse de `get_qg`, relue : ce qui est illisible n'est pas montré, plutôt que deviné.
 * `null` : la réponse n'a pas la forme attendue, la page le dit au lieu d'afficher un QG vide.
 */
export function parseQg(raw: unknown): QgData | null {
  if (!isRecord(raw) || !isRecord(raw["me"]) || !isCount(raw["members"])) return null;
  if (!Array.isArray(raw["polls"]) || !Array.isArray(raw["events"]) || !Array.isArray(raw["ideas"]) || !Array.isArray(raw["wall"])) return null;
  const welcome = raw["welcome"];
  const body = isRecord(welcome) ? textOrNull(welcome["body"]) : null;
  return {
    me: { visible: raw["me"]["visible"] === true, avatar: safeAvatar(raw["me"]["avatar"]) },
    members: raw["members"],
    welcome: body !== null && isRecord(welcome) ? { body, updated_at: textOrNull(welcome["updated_at"]) } : null,
    polls: raw["polls"].flatMap((poll) => pollOf(poll) ?? []),
    events: raw["events"].flatMap((event) => eventOf(event) ?? []),
    ideas: raw["ideas"].flatMap((idea) => ideaOf(idea) ?? []),
    wall: facesOf(raw["wall"]),
  };
}

/** Ce qui empêche d'envoyer une idée, dit en français. `null` : rien. `openMine` : ses idées encore à l'étude. */
export function ideaProblem(body: string, openMine: number): string | null {
  const text = body.trim();
  if (openMine >= IDEA_OPEN_MAX) return `Vous avez déjà ${IDEA_OPEN_MAX} idées à l'étude : attendez une décision, ou retirez-en une.`;
  if (text.length < IDEA_MIN || text.length > IDEA_MAX) return `Écrivez votre idée en ${IDEA_MIN} à ${IDEA_MAX} caractères.`;
  return null;
}

const time = (iso: string | null) => (iso === null ? 0 : Date.parse(iso) || 0);

/** Les idées à l'étude : les plus soutenues d'abord, puis les plus récentes. */
export function openIdeas(ideas: readonly QgIdea[]): QgIdea[] {
  return ideas.filter((idea) => idea.status === "open").sort((a, b) => b.supports - a.supports || time(b.created_at) - time(a.created_at));
}

/**
 * Garde les idées à la place où le membre les a vues : après un soutien, la liste ne se réordonne pas sous son doigt,
 * et le bouton qu'il vient d'activer garde le focus. `shown` : l'ordre affiché jusque-là. Une idée nouvelle vient en tête.
 * À la visite suivante, l'ordre repart des soutiens.
 */
export function keepOrder(shown: readonly number[], ideas: readonly QgIdea[]): QgIdea[] {
  const place = new Map(shown.map((id, i) => [id, i]));
  const known = ideas.filter((idea) => place.has(idea.id)).sort((a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0));
  return [...ideas.filter((idea) => !place.has(idea.id)), ...known];
}

/** Les idées tranchées : la décision la plus récente d'abord. */
export function decidedIdeas(ideas: readonly QgIdea[]): QgIdea[] {
  return ideas.filter((idea) => idea.status !== "open").sort((a, b) => time(b.decided_at) - time(a.decided_at));
}

/** « 1 soutien », « 12 soutiens ». Zéro s'écrit aussi : c'est un vrai zéro, compté par le serveur. */
export const supportLabel = (n: number) => `${fmtInt(n)} soutien${n > 1 ? "s" : ""}`;

/**
 * Ceux qui viennent sans se montrer, à écrire après les visages : « et 3 autres membres ». Sans visage, la phrase
 * complète : « 3 membres viennent ». `null` : personne d'autre, ou personne du tout.
 */
export function othersLabel(going: number, shown: number): string | null {
  const others = going - shown;
  if (others < 1) return null;
  if (shown < 1) return others === 1 ? "1 membre vient" : `${fmtInt(others)} membres viennent`;
  return others === 1 ? "et 1 autre membre" : `et ${fmtInt(others)} autres membres`;
}

/** L'initiale affichée à la place d'une photo absente ou illisible. */
export const initialOf = (name: string) => [...name.trim()][0]?.toLocaleUpperCase("fr") ?? "?";

/**
 * Les visages du site (`get_member_faces`), par pseudo : de quoi mettre la photo d'un membre qui se montre à côté de son
 * pseudo, ailleurs sur le site (`src/scripts/visages.ts`). Le serveur donne le pseudo d'aujourd'hui dans la liste officielle,
 * retrouvé par l'empreinte de l'identifiant OpenFront, et écarte déjà les photos absentes et les pseudos portés par deux
 * membres : on revérifie, casse comprise, plutôt que de mettre la photo de quelqu'un d'autre. `null` : réponse illisible.
 */
export function memberFacesOf(raw: unknown): Map<string, string> | null {
  if (!isRecord(raw) || !Array.isArray(raw["faces"])) return null;
  const rows = raw["faces"].flatMap((face) => (isRecord(face) && typeof face["pseudo"] === "string" && face["pseudo"] !== "" ? [{ pseudo: face["pseudo"], avatar: safeAvatar(face["avatar"]) }] : []));
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.pseudo.toLocaleLowerCase("fr"), (seen.get(row.pseudo.toLocaleLowerCase("fr")) ?? 0) + 1);
  return new Map(rows.flatMap((row) => (row.avatar !== null && seen.get(row.pseudo.toLocaleLowerCase("fr")) === 1 ? [[row.pseudo, row.avatar] as const] : [])));
}

const counted = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${fmtInt(n)} ${many}`);

/**
 * Ce qui attend les membres au QG, en une phrase pour la porte de l'accueil : « 2 sondages ouverts, 1 idée à l'étude et
 * 1 événement à venir. » `null` : rien de tout cela, la porte garde son texte.
 */
export function qgWaiting(data: Pick<QgData, "polls" | "ideas" | "events">, now: number): string | null {
  const parts = [
    [data.polls.filter((poll) => poll.is_open).length, "sondage ouvert", "sondages ouverts"],
    [data.ideas.filter((idea) => idea.status === "open").length, "idée à l'étude", "idées à l'étude"],
    [data.events.filter((event) => time(event.starts_at) > now).length, "événement à venir", "événements à venir"],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, one, many]) => counted(n, one, many));
  if (said.length === 0) return null;
  const last = said.pop()!;
  return `${said.length > 0 ? `${said.join(", ")} et ${last}` : last}.`;
}
