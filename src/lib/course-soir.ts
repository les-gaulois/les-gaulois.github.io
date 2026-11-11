/**
 * La course du soir : chaque soir à partir de 21 h, sur le salon de la gazette (« Le Gaulois »), la place de GAL au classement des
 * clans, son score et l'écart avec les clans juste devant et juste derrière, comparés au message de la veille, puis les points que
 * les parties du clan ont ajoutés à son score depuis la veille à 20 h. C'est ce que le pilote a gardé, le 11 novembre 2026, de
 * l'ancien rapport du clan (« GAL.TERM ») : ses autres nouvelles ont leurs propres messages, à d'autres heures, sans doublon.
 *
 * Les points, sans rien recalculer :
 * - le `score` d'une session du clan, quand il est positif, est ce que la partie a ajouté aux victoires pondérées (`weightedWins`),
 *   le score qui fait le classement, au moment où elle s'est jouée. Sur une journée, leur somme redonne les victoires pondérées de
 *   cette journée selon `/public/clan/GAL` : docs/API_AUDIT.md, « Cohérence des données » ;
 * - le score, lui, perd chaque jour une part de sa valeur (demi-vie de 30 jours) et oublie les parties de plus de 90 jours : il monte
 *   bien moins que ces points, et peut baisser. Le 10 novembre 2026, 60,13 points gagnés pour un score monté de 2,25. Le message
 *   donne donc aussi la vraie variation du score officiel depuis la veille, et le dit en toutes lettres ;
 * - un score négatif va aux défaites pondérées, qui ne comptent pas pour la place : le message ne les montre pas ;
 * - à plusieurs ou seul sous le tag, d'après `clanPlayerCount`. Jamais par joueur : l'API ne donne pas les points d'un joueur,
 *   et le site ne publie d'un membre que `stats.team`.
 *
 * La période va de 20 h la veille à 20 h le jour du message, heure de Paris : deux soirs de suite ne sautent ni ne comptent deux
 * fois aucune partie, changement d'heure compris (la période fait alors 23 ou 25 heures, et elle est écrite avec ses heures).
 * Une partie n'est relevée qu'une fois finie, et 99 % des parties du clan durent moins d'une heure (mesuré sur les 13 633 de l'archive,
 * le 11 novembre 2026) : le message attend des sessions relevées au moins une heure après la fin de la période.
 *
 * L'envoi : un message par jour à Paris, de 21 h à 23 h, avec un classement relevé depuis moins de deux heures. Sinon, rien ce
 * jour-là, et le lendemain ne rattrape pas la veille. Le premier message part sans comparaison avec la veille.
 */
import { z } from "zod";
import { rankReading, type PlaceGap, type PlaceReading } from "./alerts";
import { fmtEpochHour, fmtRank, fmtScore } from "./format";
import { parseNoted, SEND_FROM_HOUR, sendWindow } from "./salon-discord";
import type { StoredLeaderboard, StoredSession } from "./schemas";
import { addDays, parisParts, parisStartOf } from "./time";

const HOUR_MS = 3_600_000;
/** La période des points finit à cette heure, à Paris, le jour du message : avant son heure d'envoi (`SEND_FROM_HOUR.course`). */
export const PERIOD_END_HOUR = 20;
/** Une partie n'apparaît qu'une fois finie : les sessions doivent être relevées au moins une heure après la fin de la période. */
export const GAMES_END_MARGIN_MS = HOUR_MS;
/** Le classement est relu à chaque passage du robot : au-delà, le relevé est trop vieux pour le message du soir. */
export const MAX_LEADERBOARD_AGE_MS = 2 * HOUR_MS;

export const CourseState = z.object({
  /** Le jour, à Paris, du dernier message accepté par Discord. */
  sentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Le score officiel de GAL dans ce message. `null` : sa ligne manquait, le score du lendemain ne sera pas comparé. */
  score: z.number().nullable(),
  /** L'écart avec chaque voisin cité dans ce message : le score de GAL moins le sien. Positif : GAL était devant. */
  gaps: z.record(z.string().min(1), z.number()),
});
export type CourseState = z.infer<typeof CourseState>;

/** Un état illisible ne bloque pas le message : il part sans comparaison avec la veille, et l'avertissement le signale. */
export const parseCourseState = (raw: string | null) => parseNoted(CourseState, raw, "le message part sans comparaison avec la veille");

/* ---------- La période et les points ---------- */

/** L'heure `hour` du jour `day` à Paris. Le changement d'heure a lieu la nuit : jamais entre cette heure-là, le soir, et minuit. */
const parisEvening = (day: string, hour: number) => new Date(Date.parse(parisStartOf(addDays(day, 1))) - (24 - hour) * HOUR_MS).toISOString();

/** De 20 h la veille à 20 h le jour de `now`, heure de Paris. */
export function periodOf(now: Date): { since: string; until: string } {
  const { date } = parisParts(now);
  return { since: parisEvening(addDays(date, -1), PERIOD_END_HOUR), until: parisEvening(date, PERIOD_END_HOUR) };
}

export interface PointsLine {
  games: number;
  /** La somme des scores positifs de ces parties. */
  points: number;
}

export interface ClanPoints {
  since: string;
  until: string;
  total: PointsLine;
  /** Au moins deux joueurs du clan dans la partie. */
  group: PointsLine;
  /** Un seul joueur du clan dans la partie. */
  solo: PointsLine;
}

/**
 * Les points gagnés par le clan de `since` (compris) à `until` (exclu), d'après l'heure de début des parties.
 * Les scores ont deux décimales : la somme se fait en centièmes, sans erreur d'arrondi.
 */
export function clanPoints(sessions: readonly StoredSession[], since: string, until: string): ClanPoints {
  const start = Date.parse(since);
  const end = Date.parse(until);
  const cents = { group: { games: 0, points: 0 }, solo: { games: 0, points: 0 } };
  for (const s of sessions) {
    const at = Date.parse(s.gameStart);
    if (at < start || at >= end || s.clanPlayerCount < 1) continue;
    const side = s.clanPlayerCount >= 2 ? cents.group : cents.solo;
    side.games++;
    side.points += Math.max(0, Math.round(s.score * 100));
  }
  const line = (l: PointsLine): PointsLine => ({ games: l.games, points: l.points / 100 });
  return {
    since,
    until,
    total: line({ games: cents.group.games + cents.solo.games, points: cents.group.points + cents.solo.points }),
    group: line(cents.group),
    solo: line(cents.solo),
  };
}

/* ---------- La course ---------- */

/** Le score officiel de GAL dans le relevé : sa ligne est toujours dans les clans montrés. */
export const galScore = (reading: PlaceReading) => reading.rows.find((row) => row.gal)?.value ?? null;

/** L'écart avec chaque voisin : le score de GAL moins le sien. Positif : GAL est devant. */
export function raceGaps(reading: PlaceReading): Record<string, number> {
  const gaps: Record<string, number> = {};
  if (reading.above?.tag) gaps[reading.above.tag] = -reading.above.gap;
  if (reading.below?.tag) gaps[reading.below.tag] = reading.below.gap;
  return gaps;
}

export interface RaceChanges {
  /** Le score de GAL : de combien il a bougé depuis le message de la veille. */
  score: number | null;
  /** Le retard sur le clan devant : de combien il a grandi depuis la veille, négatif s'il a fondu. */
  above: number | null;
  /** L'avance sur le clan derrière : de combien elle a grandi depuis la veille, négative si elle a fondu. */
  below: number | null;
}

/**
 * Comment le score et les écarts ont bougé depuis le message de la veille, avec le même voisin et du même côté.
 * `null` : pas de message la veille, voisin absent la veille, ou passé de l'autre côté entre-temps.
 */
export function raceChanges(stored: CourseState | null, reading: PlaceReading, now: Date): RaceChanges {
  if (!stored || stored.sentOn !== addDays(parisParts(now).date, -1)) return { score: null, above: null, below: null };
  const before = (side: PlaceGap | null) => (side?.tag ? stored.gaps[side.tag] : undefined);
  const above = before(reading.above);
  const below = before(reading.below);
  const score = galScore(reading);
  return {
    score: score === null || stored.score === null ? null : score - stored.score,
    // Un retard la veille aussi : l'écart noté était négatif ou nul.
    above: reading.above && above !== undefined && above <= 0 ? reading.above.gap + above : null,
    below: reading.below && below !== undefined && below >= 0 ? reading.below.gap - below : null,
  };
}

export interface EveningRace {
  reading: PlaceReading;
  points: ClanPoints;
  changes: RaceChanges;
}

/* ---------- Quand envoyer ---------- */

export interface CourseInputs {
  stored: CourseState | null;
  leaderboard: StoredLeaderboard | null;
  sessions: readonly StoredSession[];
  /** La fin du dernier relevé des sessions (`meta.sessions.coveredUntil`). `null` : jamais relevées. */
  coveredUntil: string | null;
  /** Les fichiers de sessions illisibles : des points calculés sans eux seraient faux. */
  unreadable: readonly string[];
  now: Date;
  tag: string;
}

export type CoursePlan = { race: null; reason: string } | { race: EveningRace; reason: "" };

/** Décide s'il faut envoyer maintenant, et quoi. Ne change rien : l'état ne s'écrit qu'après un envoi accepté (`markCourseSent`). */
export function planCourse({ stored, leaderboard, sessions, coveredUntil, unreadable, now, tag }: CourseInputs): CoursePlan {
  // De 21 h à la nuit (23 h), une fois par jour : la même règle que les autres messages du jour.
  const window = sendWindow(now, SEND_FROM_HOUR.course, stored?.sentOn ?? null);
  if (!window.open) return { race: null, reason: window.reason };
  if (unreadable.length > 0) return { race: null, reason: `${unreadable.join(", ")} illisible : les points seraient faux` };
  const period = periodOf(now);
  if (!coveredUntil || Date.parse(coveredUntil) < Date.parse(period.until) + GAMES_END_MARGIN_MS) {
    return { race: null, reason: `sessions pas encore relevées après ${PERIOD_END_HOUR + 1} h : les dernières parties de la période ne sont peut-être pas finies` };
  }
  if (!leaderboard || now.getTime() - Date.parse(leaderboard.fetchedAt) > MAX_LEADERBOARD_AGE_MS) return { race: null, reason: "classement pas relevé depuis plus de deux heures" };
  const reading = rankReading(leaderboard, tag);
  if (!reading) return { race: null, reason: `[${tag}] n'est pas dans la liste officielle` };
  const points = clanPoints(sessions, period.since, period.until);
  // Ce clan joue des dizaines de parties par jour : une journée sans partie trahit un relevé manquant bien avant un vrai repos.
  if (points.total.games === 0) return { race: null, reason: "aucune partie sur la période : un relevé manque sans doute" };
  return { race: { reading, points, changes: raceChanges(stored, reading, now) }, reason: "" };
}

/** Après un envoi accepté : le jour est noté, avec le score et les écarts du message, pour la comparaison du lendemain. */
export const markCourseSent = (race: EveningRace, now: Date): CourseState => ({
  sentOn: parisParts(now).date,
  // Jamais un zéro de remplacement : le lendemain, il ferait écrire une hausse égale à tout le score.
  score: galScore(race.reading),
  gaps: raceGaps(race.reading),
});

/* ---------- Les mots, pour le message et pour l'image ---------- */

export const COURSE_TITLE = "La course du soir";

/** « [GAL] 2e du classement des clans ». */
export const placeLine = (reading: PlaceReading, tag: string) => `[${tag}] ${fmtRank(reading.rank)} du classement des clans`;

/** « +2,25 », « −8,67 » : le signe dit le sens. */
export const signedScore = (n: number) => `${n < 0 ? "−" : "+"}${fmtScore(Math.abs(n))}`;

/** Un changement nul au centième près s'écrit « comme hier ». */
const unchanged = (change: number) => Math.round(change * 100) === 0;

/** « (retard en hausse de 21,06 depuis hier) » : des mots plutôt qu'un signe, qui se lirait à l'envers pour un retard. */
export function changeWords(kind: "retard" | "avance", change: number | null): string {
  if (change === null) return "";
  if (unchanged(change)) return " (comme hier)";
  return ` (${kind} en ${change > 0 ? "hausse" : "baisse"} de ${fmtScore(Math.abs(change))} depuis hier)`;
}

/** « Score : 2 308,51 (+2,25 depuis hier) ». */
export function scoreLine(reading: PlaceReading, change: number | null): string {
  const score = galScore(reading);
  const base = `Score : ${fmtScore(score)}`;
  if (change === null) return base;
  return `${base} (${unchanged(change) ? "comme hier" : `${signedScore(change)} depuis hier`})`;
}

/**
 * L'écart avec le clan devant puis celui derrière, dans l'ordre du classement, avec le changement depuis la veille.
 * `name` écrit un tag : échappé pour Discord, tel quel ailleurs.
 */
export function raceParts({ reading, changes }: Pick<EveningRace, "reading" | "changes">, name: (tag: string | null) => string): string[] {
  const line = (side: PlaceGap, words: string, kind: "retard" | "avance", change: number | null) =>
    `${side.gap === 0 ? `à égalité avec ${name(side.tag)}` : `${fmtScore(side.gap)} ${words} ${name(side.tag)}`}, ${fmtRank(side.rank)}${changeWords(kind, change)}`;
  return [reading.above && line(reading.above, "de retard sur", "retard", changes.above), reading.below && line(reading.below, "d'avance sur", "avance", changes.below)].filter(
    (part): part is string => part !== null,
  );
}

/** « 10 nov., 20 h » : la période commence et finit à l'heure pleine. */
const hourWords = (iso: string) => fmtEpochHour(Date.parse(iso) / 1000);

/** « du 10 nov., 20 h au 11 nov., 20 h ». */
export const periodWords = ({ since, until }: Pick<ClanPoints, "since" | "until">) => `du ${hourWords(since)} au ${hourWords(until)}`;

/** « +69,41 en 48 parties ». */
export const pointsWords = ({ games, points }: PointsLine) => `+${fmtScore(points)} en ${games} ${games > 1 ? "parties" : "partie"}`;

/** Sous les points, ce que le score a vraiment fait : il perd chaque jour une part de sa valeur, et monte donc bien moins. */
export function wearWords(change: number | null): string {
  if (change === null) return "Le score perd chaque jour une part de sa valeur : il monte moins que ces points.";
  const moved = unchanged(change) ? "n'a pas bougé" : `a ${change > 0 ? "pris" : "perdu"} ${fmtScore(Math.abs(change))}`;
  return `Le score, qui perd chaque jour une part de sa valeur, ${moved} depuis hier.`;
}

export const POINTS_NOTE = "Points gagnés : ce que les parties ont ajouté au score. Le score perd aussi chaque jour une part de sa valeur : il monte moins que ces points, et peut baisser.";
