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
import { clanWeekOf, closestGuesses, winsProgress, type ClosedWeek, type Guess, type Settlement, type WeeklyGoal, type WinsProgress } from "./outils";

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

/**
 * L'état du pronostic du membre : « Clos » dès que l'heure de clôture est passée, qu'il ait pronostiqué ou non ; « Posé »
 * une fois posé, pour de bon ; « À poser » pour un pronostic d'avant les mises, qui se pose une fois encore ; sinon « À faire ».
 */
export function predictionState(placed: boolean, mine: number | null, expired: boolean): Etat {
  if (expired) return { ton: "muted", mot: "Clos" };
  if (placed) return { ton: "ok", mot: "Posé" };
  return mine === null ? { ton: "warn", mot: "À faire" } : { ton: "warn", mot: "À poser" };
}

/** Le pronostic reste à faire, ou à poser : rien de posé, et la clôture pas encore passée. */
export const predictionToDo = (placed: boolean, expired: boolean): boolean => !placed && !expired;

/** « 200 statères misés », « pour l'honneur » : la mise d'un pronostic, en mots. */
export function stakeWords(stake: number): string {
  return stake > 0 ? `${fmtCount(stake, "statère")} misé${stake > 1 ? "s" : ""}` : "pour l'honneur";
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
  /**
   * `final` : résultat définitif (semaine réglée par le serveur, ou entièrement relevée) ; `provisoire` : relevée en partie ;
   * `sans-donnees` : absente des données.
   */
  status: "final" | "provisoire" | "sans-donnees";
  /** Le règlement par le serveur. `null` : pas encore réglée. */
  settled: Settlement | null;
  /** La cagnotte : la somme des mises. */
  pot: number;
  /** Ceux qui ont reçu la cagnotte, une fois réglée d'après le résultat. */
  winners: RankedGuess[];
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
 * en partie est dite « Provisoire », sans gagnant. Une semaine réglée par le serveur prend son résultat à lui, celui qui a
 * partagé la cagnotte, plutôt que celui du fichier public (le même, sauf collecte refaite depuis).
 */
export function closedSummary(week: ClosedWeek, data: ClanWeek | null): ClosedSummary {
  const settled = week.result;
  // Des mises rendues : le résultat relevé depuis peut se montrer, mais la cagnotte n'a ni gagnant ni « Réglé ».
  const rendu = settled?.outcome === "rendu";
  const wins = settled?.outcome === "regle" ? settled.wins : data?.complete ? data.wins : null;
  if (wins === null) {
    const guesses = week.guesses.map((guess) => ({ ...guess, gap: null, closest: false }));
    return {
      status: data === null ? "sans-donnees" : "provisoire",
      etat: settled ? { ton: "muted", mot: "Mises rendues" } : data === null ? { ton: "muted", mot: "Pas de données" } : { ton: "warn", mot: "Provisoire" },
      settled,
      pot: week.pot,
      winners: [],
      wins: data === null ? null : data.wins,
      guesses,
      closest: [],
      mine: guesses.find((guess) => guess.mine) ?? null,
    };
  }
  const best = new Set(closestGuesses(week.guesses, wins));
  // Du plus près au plus loin ; à écart égal, l'ordre reçu du serveur (le tri est stable).
  const guesses = week.guesses
    .map((guess): RankedGuess & { gap: number } => ({ ...guess, gap: Math.abs(guess.wins - wins), closest: best.has(guess) }))
    .sort((a, b) => a.gap - b.gap);
  return {
    status: "final",
    etat: rendu ? { ton: "muted", mot: "Mises rendues" } : settled ? { ton: "ok", mot: "Réglé" } : week.pot > 0 ? { ton: "ally", mot: "Cagnotte à verser" } : { ton: "ok", mot: "Final" },
    settled,
    pot: week.pot,
    winners: settled && !rendu ? guesses.filter((guess) => guess.stake > 0 && (guess.gain ?? 0) > 0) : [],
    wins,
    guesses,
    closest: guesses.filter((guess) => guess.closest),
    mine: guesses.find((guess) => guess.mine) ?? null,
  };
}

/**
 * Ce qu'une mise est devenue, en mots : « 100 misés, 333 reçus », « 700 misés, perdus », « 50 rendus », « 200 misés » tant
 * que la semaine n'est pas réglée, « pour l'honneur » sans mise.
 */
export function moneyWords(guess: Pick<Guess, "stake" | "gain">, settled: Settlement | null): string {
  if (guess.stake < 1) return "pour l'honneur";
  const staked = `${fmtInt(guess.stake)} misé${guess.stake > 1 ? "s" : ""}`;
  if (settled === null || guess.gain === null) return staked;
  if (settled.outcome === "rendu") return `${fmtInt(guess.stake)} rendu${guess.stake > 1 ? "s" : ""}`;
  return guess.gain > 0 ? `${staked}, ${fmtInt(guess.gain)} reçu${guess.gain > 1 ? "s" : ""}` : `${staked}, perdu${guess.stake > 1 ? "s" : ""}`;
}

/** La cagnotte d'une semaine close, en une ligne : « 1 000 statères, à Epona (333) et vous (667) ». `null` : pas de mise. */
export function potWords(summary: Pick<ClosedSummary, "pot" | "settled" | "winners">): string | null {
  if (summary.pot < 1) return null;
  const pot = fmtCount(summary.pot, "statère");
  if (summary.settled?.outcome === "rendu") return `${pot}, rendus à chacun : pas de résultat relevé à temps.`;
  if (summary.winners.length === 0) return `${pot}, à partager.`;
  return `${pot}, à ${listWords(summary.winners.map((guess) => `${guess.mine ? "vous" : guess.name} (${fmtInt(guess.gain ?? 0)})`))}.`;
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
