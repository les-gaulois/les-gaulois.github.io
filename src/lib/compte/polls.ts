/**
 * Les sondages du clan, côté site : leurs totaux tels que le serveur les donne, et la vérification d'un sondage avant l'envoi.
 * Le serveur ne donne jamais qui a voté quoi, seulement un total par choix (`get_qg`, `list_polls`), et il revérifie tout.
 */
import { fmtInt } from "../format";

/** Bornes du serveur (`save_poll`). */
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 80;

export interface PollTotals {
  options: string[];
  counts: number[];
}

export interface PollRow {
  label: string;
  count: number;
  /** Part des voix, en pour cent arrondi à l'unité. `null` tant que personne n'a voté. */
  share: number | null;
}

/**
 * Des totaux lisibles : un texte par choix et, pour chacun, un nombre entier de voix. Sinon, la page ne montre
 * pas de résultat : un total absent n'est pas zéro, et des parts calculées sans lui seraient fausses.
 */
export function validPollTotals(poll: { options?: unknown; counts?: unknown }): poll is PollTotals {
  const { options, counts } = poll;
  return (
    Array.isArray(options) &&
    options.every((o) => typeof o === "string") &&
    Array.isArray(counts) &&
    counts.length === options.length &&
    counts.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)
  );
}

/** Une ligne par choix, dans l'ordre du sondage. À n'appeler que sur des totaux lisibles (`validPollTotals`). */
export function pollRows({ options, counts }: PollTotals): { rows: PollRow[]; total: number } {
  const total = counts.reduce((sum, n) => sum + n, 0);
  return { total, rows: options.map((label, i) => ({ label, count: counts[i] ?? 0, share: total > 0 ? Math.round(((counts[i] ?? 0) / total) * 100) : null })) };
}

/** « 1 voix », « 12 voix » : le mot ne change pas au pluriel. */
export const fmtVotes = (n: number) => `${fmtInt(n)} voix`;

/** Les choix tels qu'ils partiront : sans espace autour, sans case vide. */
export const cleanOptions = (options: readonly string[]): string[] => options.map((o) => o.trim()).filter((o) => o !== "");

/** Ce qui empêche d'envoyer un sondage, dit en français. `null` : rien. Le serveur refait ces contrôles. */
export function pollProblem(question: string, options: readonly string[]): string | null {
  const q = question.trim();
  if (q === "" || q.length > POLL_QUESTION_MAX) return `Posez une question, en ${POLL_QUESTION_MAX} caractères au plus.`;
  const clean = cleanOptions(options);
  if (clean.length < POLL_MIN_OPTIONS || clean.length > POLL_MAX_OPTIONS) return `Donnez de ${POLL_MIN_OPTIONS} à ${POLL_MAX_OPTIONS} choix.`;
  if (clean.some((o) => o.length > POLL_OPTION_MAX)) return `Un choix dépasse ${POLL_OPTION_MAX} caractères.`;
  if (new Set(clean.map((o) => o.toLocaleLowerCase("fr"))).size !== clean.length) return "Deux choix sont identiques.";
  return null;
}
