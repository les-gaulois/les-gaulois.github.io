/**
 * L'onglet Sondages de la Direction : ce que la liste montre de chaque sondage, sans rien inventer. Les totaux viennent du
 * serveur (`list_polls`), qui ne donne jamais qui a voté quoi ; les parts sont celles de `polls.ts`, partagées avec le QG.
 */
import { fmtCount, fmtDateTime, fmtInt } from "../format";
import { toLocalInput } from "./news";
import { pollRows, validPollTotals, type PollRow } from "./polls";

/** Le serveur ne renvoie que les derniers sondages (`list_polls` : `limit 20`). */
export const POLLS_LIMIT = 20;
/** Le serveur refuse un quatrième sondage ouvert (`save_poll` : `too_many_polls`). */
export const POLLS_OPEN_MAX = 3;
/** Le serveur refuse une fin de vote passée ou à plus de 90 jours (`save_poll` : `invalid_close`). */
export const POLL_CLOSE_MAX_DAYS = 90;

/** Une ligne de `list_polls`. */
export interface DirectionPoll {
  id: number;
  question: string;
  options: string[];
  counts: number[];
  created_at: string;
  closes_at: string | null;
  closed_at: string | null;
  is_open: boolean;
  author: string | null;
  /** L'auteur, ou un admin (`list_polls`). Le serveur revérifie à chaque fermeture ou suppression. */
  editable: boolean | null;
}

export type PollFilter = "all" | "open" | "closed";
export const POLL_FILTERS: readonly { id: PollFilter; label: string; ton?: "ok" | "muted" }[] = [
  { id: "all", label: "Tous" },
  { id: "open", label: "Ouverts", ton: "ok" },
  { id: "closed", label: "Fermés", ton: "muted" },
];

export const inPollFilter = (poll: Pick<DirectionPoll, "is_open">, filter: PollFilter): boolean => filter === "all" || (filter === "open") === poll.is_open;

export function pollFilterCounts(polls: readonly Pick<DirectionPoll, "is_open">[]): Record<PollFilter, number> {
  const open = polls.filter((p) => p.is_open).length;
  return { all: polls.length, open, closed: polls.length - open };
}

/** Ce que le lecteur d'écran entend après un filtre : combien de sondages restent. Rien sur « Tous », la liste entière. */
export const pollFilterAnnouncement = (shown: number, filter: PollFilter): string => (filter === "all" ? "" : `${fmtCount(shown, "sondage")} pour ce choix.`);

/**
 * Le nombre de sondages ouverts, pour « 2 ouverts sur 3 ». `null` quand la liste a pu être coupée par le serveur : un
 * sondage ouvert plus ancien que les vingt derniers n'y serait pas, et le nombre serait faux.
 */
export function openPollCount(polls: readonly Pick<DirectionPoll, "is_open">[]): number | null {
  return polls.length >= POLLS_LIMIT ? null : polls.filter((p) => p.is_open).length;
}

/** La pastille du formulaire : « 2 ouverts sur 3 », en vert tant qu'on peut en lancer un, en jaune à la limite. */
export function openPollsBadge(open: number): { text: string; ton: "ok" | "warn"; full: boolean } {
  const full = open >= POLLS_OPEN_MAX;
  return { text: `${fmtInt(open)} ouvert${open > 1 ? "s" : ""} sur ${POLLS_OPEN_MAX}`, ton: full ? "warn" : "ok", full };
}

/** La date qui suit la pastille : la fin prévue d'un sondage ouvert, la fermeture d'un sondage fermé. `null` : aucune. */
export function pollEnd(poll: Pick<DirectionPoll, "is_open" | "closes_at" | "closed_at">): string | null {
  return poll.is_open ? poll.closes_at : (poll.closed_at ?? poll.closes_at);
}

/**
 * Ce qui suit la pastille, à l'heure de Paris : « jusqu'au … » pour un sondage ouvert (« sans date de fin » s'il n'en a pas),
 * « le … » pour un sondage fermé. `null` : un sondage fermé sans aucune date, rien à écrire.
 */
export function pollWhen(poll: Pick<DirectionPoll, "is_open" | "closes_at" | "closed_at">): string | null {
  const end = pollEnd(poll);
  if (poll.is_open) return end ? `jusqu'au ${fmtDateTime(end)}` : "sans date de fin";
  return end ? `le ${fmtDateTime(end)}` : null;
}

/** La couleur d'un sondage dans la liste : jaune si ses totaux ne se lisent pas, vert s'il est ouvert, gris s'il est fermé. */
export function pollTon(poll: Pick<DirectionPoll, "is_open"> & { options?: unknown; counts?: unknown }): "warn" | "ok" | "muted" {
  if (!validPollTotals(poll)) return "warn";
  return poll.is_open ? "ok" : "muted";
}

/**
 * La part d'un choix, écrite. L'arrondi est celui de `polls.ts`, le même qu'au QG, sauf aux deux bouts, où il tromperait :
 * un choix qui a des voix n'affiche jamais « 0 % » (« moins de 1 % »), ni « 100 % » s'il n'a pas toutes les voix (« plus de
 * 99 % »). Rien tant que personne n'a voté. Les parts arrondies ne font pas toujours 100 à elles toutes : chacune reste au
 * plus près de sa vraie valeur, aucune n'est retouchée pour tomber juste.
 */
export function fmtPollShare(row: Pick<PollRow, "count" | "share">, total: number): string {
  if (row.share === null || total <= 0) return "";
  if (row.count > 0 && row.share === 0) return "moins de 1\u00a0%";
  if (row.count < total && row.share === 100) return "plus de 99\u00a0%";
  return `${fmtInt(row.share)}\u00a0%`;
}

export interface PollResultRow extends PollRow {
  /** Ce choix a le plus de voix, seul ou à égalité. Jamais vrai sans aucune voix. */
  lead: boolean;
  /** La part écrite (`fmtPollShare`). */
  shareText: string;
  /** La longueur de la barre, en pour cent, sans arrondi : une barre ne grossit pas une poignée de voix. */
  bar: number;
}

export interface PollResult {
  rows: PollResultRow[];
  total: number;
  /** Plusieurs choix ont le plus de voix : aucun n'est « en tête ». */
  tie: boolean;
}

/**
 * Le résultat d'un sondage, ou `null` si ses totaux ne sont pas lisibles (un total absent n'est pas zéro). Le choix en tête
 * est celui qui a le plus de voix ; à égalité, tous ceux du haut sont marqués et `tie` le dit : la page n'en désigne aucun.
 */
export function pollResult(poll: { options?: unknown; counts?: unknown }): PollResult | null {
  if (!validPollTotals(poll)) return null;
  const { rows, total } = pollRows(poll);
  const max = Math.max(0, ...rows.map((r) => r.count));
  const leaders = max > 0 ? rows.filter((r) => r.count === max).length : 0;
  return {
    total,
    tie: leaders > 1,
    rows: rows.map((r) => ({ ...r, lead: max > 0 && r.count === max, shareText: fmtPollShare(r, total), bar: total > 0 ? (r.count / total) * 100 : 0 })),
  };
}

/** Le repère d'un choix du haut : « En tête » en vert s'il est seul, « Égalité » en jaune s'ils sont plusieurs. */
export const leadMark = (tie: boolean): { label: string; ton: "ok" | "warn" } => (tie ? { label: "Égalité", ton: "warn" } : { label: "En tête", ton: "ok" });

/**
 * Les bornes du champ « Fin du vote », à l'heure du navigateur comme le champ lui-même : pas avant la minute qui suit, pas
 * après 90 jours. Elles évitent un refus `invalid_close` prévisible ; le serveur reste juge (la page peut être restée ouverte).
 */
export function pollEndBounds(now: number): { min: string; max: string } {
  const minute = 60_000;
  const min = (Math.floor(now / minute) + 1) * minute;
  const max = Math.floor((now + POLL_CLOSE_MAX_DAYS * 86_400_000) / minute) * minute;
  return { min: toLocalInput(new Date(min).toISOString()), max: toLocalInput(new Date(max).toISOString()) };
}
