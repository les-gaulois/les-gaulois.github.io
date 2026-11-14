/**
 * L'onglet « La semaine » du QG, calculs purs : l'état en couleur de l'objectif et du pronostic, le bilan d'une semaine
 * close (le résultat, qui était le plus près, l'écart de chacun), et la clôture du pronostic. Rien n'est deviné : ni
 * projection, ni tendance. Un écart ne se calcule que sur une semaine entièrement relevée (`complete`) ; avant, le total
 * peut encore monter. Les calculs de base restent ceux des outils du QG (`winsProgress`, `closestGuesses`, `clanWeekOf`).
 *
 * Les couleurs sont celles des pièces communes (`direction-kit.tsx`) : vert `ok` fait, jaune `warn` à faire ou à regarder,
 * rouge `danger` échec, bleu `ally` information, gris `muted` rien à faire. Chaque couleur vient avec son mot.
 */
import { fmtCount, fmtDayAndTime, fmtInt } from "../format";
import type { ClanScores, ClanWeek, ClanWeekFile } from "../semaine-du-clan";
import { clanWeekOf, closestGuesses, winsProgress, type ClosedWeek, type Guess, type WeeklyGoal, type WinsProgress } from "./outils";

export type Ton = "ok" | "warn" | "danger" | "ally" | "muted";

export interface Etat {
  ton: Ton;
  mot: string;
}

/* ---------- L'objectif ---------- */

export interface WinsGoalState extends Etat, WinsProgress {
  /** Les victoires qui manquent encore ; 0 une fois l'objectif atteint. */
  missing: number;
  /** La semaine est entièrement relevée : le total ne bougera plus. */
  final: boolean;
}

/**
 * Où en est un objectif de victoires (`winsProgress`), et son état : « Atteint », « En cours » tant que la semaine n'est
 * pas entièrement relevée, « Manqué » ensuite seulement. `null` : la semaine n'est pas dans les données, ce qui n'est pas
 * zéro victoire. Le serveur ne donne que l'objectif de la semaine en cours (`get_qg_tools`) : « Manqué » ne peut venir que
 * d'une page restée ouverte au-delà du dimanche, et seulement si le relevé couvre déjà ce dimanche.
 */
export function winsGoalState(target: number, week: ClanWeek | null): WinsGoalState | null {
  if (!Number.isFinite(target)) return null;
  const progress = winsProgress(target, week);
  if (progress === null || week === null) return null;
  const etat: Etat = progress.reached ? { ton: "ok", mot: "Atteint" } : week.complete ? { ton: "danger", mot: "Manqué" } : { ton: "ally", mot: "En cours" };
  return { ...etat, ...progress, missing: Math.max(0, target - progress.done), final: week.complete };
}

/** L'objectif « un clan à dépasser », d'après l'écart de score (`clanGap`) : positif, le clan est devant. */
export function clanGoalState(gap: number): Etat {
  if (gap > 0) return { ton: "ok", mot: "Devant" };
  if (gap < 0) return { ton: "warn", mot: "Derrière" };
  return { ton: "ally", mot: "À égalité" };
}

export interface ClanBars {
  ours: number;
  theirs: number;
  /** De 0 à 1 : le plus haut des deux scores remplit sa barre. */
  oursShare: number;
  theirsShare: number;
}

/** Les deux scores du classement relevé, et la longueur de leur barre. `null` : l'un des deux n'est pas au classement. */
export function clanBars(clans: ClanScores | null | undefined, ours: string, theirs: string): ClanBars | null {
  const us = clans?.scores.find((clan) => clan.tag === ours);
  const them = clans?.scores.find((clan) => clan.tag === theirs);
  if (!us || !them) return null;
  const top = Math.max(us.score, them.score);
  const share = (score: number) => (top > 0 ? Math.max(0, Math.min(1, score / top)) : 0);
  return { ours: us.score, theirs: them.score, oursShare: share(us.score), theirsShare: share(them.score) };
}

/* ---------- Le pronostic ---------- */

/** L'état du pronostic du membre : « Clos » dès que l'heure de clôture est passée, qu'il ait pronostiqué ou non. */
export function predictionState(mine: number | null, expired: boolean): Etat {
  if (expired) return { ton: "muted", mot: "Clos" };
  return mine === null ? { ton: "warn", mot: "À faire" } : { ton: "ok", mot: "Fait" };
}

/** Le message d'un envoi tenté après la clôture : le bouton est inactif, la touche Entrée du champ aussi. */
export const PREDICTION_CLOSED = "Les pronostics de cette semaine sont clos.";

/**
 * Les pronostics sont clos, à la milliseconde de `closesAt` (le mercredi à minuit, heure de Paris, en temps universel) :
 * pas à la minute suivante. Une heure illisible ferme le pronostic plutôt que de laisser envoyer à l'aveugle.
 */
export function predictionClosed(closesAt: string, nowMs: number): boolean {
  const closes = Date.parse(closesAt);
  return !Number.isFinite(closes) || nowMs >= closes;
}

/** La plus longue attente d'une minuterie du navigateur : au-delà, elle partirait tout de suite. */
export const TIMER_MAX_MS = 2_147_483_647;

/** L'attente de la minuterie de clôture, en millisecondes. `null` : déjà clos, rien à attendre. */
export function untilClose(closesAt: string, nowMs: number): number | null {
  if (predictionClosed(closesAt, nowMs)) return null;
  return Math.min(Date.parse(closesAt) - nowMs, TIMER_MAX_MS);
}

/** Les relectures des outils pour une même clôture : l'heure du serveur peut retarder un peu sur celle du navigateur. */
export const REREADS_PER_CLOSE = 5;
/** L'écart entre deux relectures, un peu moins d'une minute : la page se réveille chaque minute. */
export const REREAD_GAP_MS = 50_000;

/** Les relectures déjà demandées pour une clôture. */
export interface Rereads {
  closesAt: string;
  count: number;
  /** La dernière, en millisecondes. */
  at: number;
}

/**
 * Faut-il relire les outils, la clôture passée ? Une fois tout de suite, puis au plus une fois par minute tant que le
 * serveur rend la même semaine, et `REREADS_PER_CLOSE` fois en tout : jamais en continu. Rend le nouveau compte, ou `null`
 * s'il ne faut pas relire.
 */
export function nextReread(done: Rereads | null, closesAt: string, nowMs: number): Rereads | null {
  if (done === null || done.closesAt !== closesAt) return { closesAt, count: 1, at: nowMs };
  if (done.count >= REREADS_PER_CLOSE || nowMs - done.at < REREAD_GAP_MS) return null;
  return { closesAt, count: done.count + 1, at: nowMs };
}

/**
 * Ce que la semaine pronostiquée compte déjà, si elle a commencé : un fait relevé, avec son heure, pas une tendance.
 * `null` : semaine pas commencée ou absente des données, fichier illisible ou en lecture, semaine déjà finie, ou objectif de
 * victoires de la même semaine, qui montre déjà ce chiffre.
 */
export function alreadyCounted(predictionWeek: string, goal: WeeklyGoal | null, file: ClanWeekFile | null | undefined): string | null {
  if (!file || file.until === null) return null;
  if (goal?.kind === "wins" && goal.week === predictionWeek) return null;
  const week = clanWeekOf(file.weeks, predictionWeek);
  if (week === null || week.complete) return null;
  return `${fmtCount(week.wins, "victoire")} déjà au ${fmtDayAndTime(file.until)}.`;
}

/* ---------- Une semaine close ---------- */

export interface RankedGuess extends Guess {
  /** L'écart au résultat, en victoires. `null` tant que la semaine n'est pas entièrement relevée. */
  gap: number | null;
  /** Parmi les plus près du résultat, à égalité comprise. */
  closest: boolean;
}

export interface ClosedSummary {
  /** `final` : semaine entièrement relevée ; `provisoire` : relevée en partie ; `sans-donnees` : absente des données. */
  status: "final" | "provisoire" | "sans-donnees";
  etat: Etat;
  /** Les victoires relevées. `null` : pas de données, ce qui n'est pas zéro. */
  wins: number | null;
  /** Les pronostics : du plus près au plus loin si la semaine est finale, sinon dans l'ordre reçu. */
  guesses: RankedGuess[];
  /** Les plus près du résultat (`closestGuesses`), tous en cas d'égalité. Vide tant que la semaine n'est pas finale. */
  closest: RankedGuess[];
  /** Le pronostic du membre. `null` : il n'en avait pas fait. */
  mine: RankedGuess | null;
}

/**
 * Le bilan d'une semaine close. Le plus près et les écarts ne sont donnés que sur un résultat final : une semaine relevée
 * en partie est dite « Provisoire », sans gagnant.
 */
export function closedSummary(week: ClosedWeek, data: ClanWeek | null): ClosedSummary {
  if (data === null || !data.complete) {
    const guesses = week.guesses.map((guess) => ({ ...guess, gap: null, closest: false }));
    return {
      status: data === null ? "sans-donnees" : "provisoire",
      etat: data === null ? { ton: "muted", mot: "Pas de données" } : { ton: "warn", mot: "Provisoire" },
      wins: data === null ? null : data.wins,
      guesses,
      closest: [],
      mine: guesses.find((guess) => guess.mine) ?? null,
    };
  }
  const best = new Set(closestGuesses(week.guesses, data.wins));
  // Du plus près au plus loin ; à écart égal, l'ordre reçu du serveur (le tri est stable).
  const guesses = week.guesses
    .map((guess): RankedGuess & { gap: number } => ({ ...guess, gap: Math.abs(guess.wins - data.wins), closest: best.has(guess) }))
    .sort((a, b) => a.gap - b.gap);
  return {
    status: "final",
    etat: { ton: "ok", mot: "Final" },
    wins: data.wins,
    guesses,
    closest: guesses.filter((guess) => guess.closest),
    mine: guesses.find((guess) => guess.mine) ?? null,
  };
}

/** « écart de 3 », « exact » : l'écart d'un pronostic au résultat, en victoires, dit en mots. */
export function gapWords(gap: number): string {
  return gap === 0 ? "exact" : `écart de ${fmtInt(gap)}`;
}

/** « Epona, Tarvos et vous » : une liste dite en français. */
function listWords(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

/**
 * Qui était le plus près, en une ligne : « vous (280), écart de 13 ». À égalité, l'écart est le même pour tous : il n'est
 * dit qu'une fois, « Epona (290) et vous (296), écart de 3 chacun ». `null` : pas de résultat final, ou aucun pronostic.
 */
export function closestWords(closest: readonly RankedGuess[]): { label: string; text: string } | null {
  const gap = closest[0]?.gap;
  if (gap === undefined || gap === null) return null;
  const names = listWords(closest.map((guess) => `${guess.mine ? "vous" : guess.name} (${fmtInt(guess.wins)})`));
  const several = closest.length > 1;
  return { label: several ? "Les plus près" : "Le plus près", text: `${names}, ${gapWords(gap)}${several && gap > 0 ? " chacun" : ""}` };
}

/** Le pronostic du membre, et son écart sur une semaine finale : « 299, écart de 6 ». */
export function mineWords(mine: RankedGuess): string {
  return mine.gap === null ? fmtInt(mine.wins) : `${fmtInt(mine.wins)}, ${gapWords(mine.gap)}`;
}
