/**
 * L'onglet Sondages de la Direction : ce que la liste montre de chaque sondage, sans rien inventer. Les totaux viennent du
 * serveur (`list_polls`), qui ne donne jamais qui a voté quoi ; les parts sont celles de `polls.ts`, partagées avec le QG.
 */
import { pollRows, validPollTotals, type PollRow } from "./polls";

/** Le serveur ne renvoie que les derniers sondages (`list_polls` : `limit 20`). */
export const POLLS_LIMIT = 20;
/** Le serveur refuse un quatrième sondage ouvert (`save_poll` : `too_many_polls`). */
export const POLLS_OPEN_MAX = 3;

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
  editable: boolean;
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

/**
 * Le nombre de sondages ouverts, pour « 2 ouverts sur 3 ». `null` quand la liste a pu être coupée par le serveur : un
 * sondage ouvert plus ancien que les vingt derniers n'y serait pas, et le nombre serait faux.
 */
export function openPollCount(polls: readonly Pick<DirectionPoll, "is_open">[]): number | null {
  return polls.length >= POLLS_LIMIT ? null : polls.filter((p) => p.is_open).length;
}

/** La date qui suit la pastille : la fin prévue d'un sondage ouvert, la fermeture d'un sondage fermé. `null` : aucune. */
export function pollEnd(poll: Pick<DirectionPoll, "is_open" | "closes_at" | "closed_at">): string | null {
  return poll.is_open ? poll.closes_at : (poll.closed_at ?? poll.closes_at);
}

export interface PollResultRow extends PollRow {
  /** Ce choix a le plus de voix, seul ou à égalité. Jamais vrai sans aucune voix. */
  lead: boolean;
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
  return { total, tie: leaders > 1, rows: rows.map((r) => ({ ...r, lead: max > 0 && r.count === max })) };
}
