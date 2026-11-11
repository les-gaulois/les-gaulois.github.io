/**
 * Les outils du QG (migration 20261111000400_outils_du_qg.sql), demandés par le pilote le 11 novembre 2026 : « Moi »,
 * « Ce soir je joue », l'objectif et le pronostic de la semaine, le salon vocal, les GG et les parrains.
 * Le serveur donne ce que les membres déclarent (`get_qg_tools`), à un membre validé seulement. Les chiffres viennent des
 * données publiques du site (`/semaine-du-clan.json`, `/data/members.json`). Ici, de quoi lire les deux sans rien inventer,
 * et les calculs de l'affichage. Le serveur refait chaque contrôle.
 */
import { fmtDay, fmtGap, fmtInt } from "../format";
import type { StoredMember } from "../schemas";
import type { ClanScores, ClanWeek } from "../semaine-du-clan";
import { addDays, parisParts, WEEKDAYS_FR } from "../time";
import { faceOf, type Face } from "./qg";

/** Les heures proposées : l'heure en cours et les onze suivantes, comme le serveur les accepte (`set_play_plan`). */
export const PLAN_HOURS = 12;
/** Bornes du serveur (`save_prediction`, `save_weekly_goal`). */
export const PREDICTION_MAX = 10_000;
export const GOAL_WINS_MAX = 10_000;
/** Le podium des GG : trois places, et cinq lignes au plus en cas d'égalité, comme les joueurs de la semaine. */
export const GG_PODIUM = 3;
export const GG_PODIUM_MAX = 5;

const HOUR_MS = 3_600_000;

/** Une heure annoncée : combien de membres, et les visages de ceux qui se montrent (12 au plus). */
export interface PlanHour {
  at: string;
  count: number;
  faces: Face[];
}

/** Un membre du mur, avec son numéro de Gaulois (public), ses GG de la semaine et le merci du membre connecté. */
export interface WallMember extends Face {
  number: number;
  gg: number;
  given: boolean;
}

/** Un parrain : son pseudo Discord, s'il est connu, pour lui écrire. */
export interface Mentor extends Face {
  discord: string | null;
  mine: boolean;
}

export type WeeklyGoal = { week: string; kind: "wins"; wins: number } | { week: string; kind: "clan"; clan: string };

export interface Guess {
  name: string;
  wins: number;
  mine: boolean;
}

/** Une semaine dont les pronostics sont clos : chacun y est visible, sous le nom de son auteur. */
export interface ClosedWeek {
  week: string;
  closesAt: string;
  guesses: Guess[];
}

/** La semaine ouverte aux pronostics : seulement celui du membre et leur nombre, jamais ceux des autres. */
export interface Predictions {
  week: string;
  closesAt: string;
  mine: number | null;
  count: number;
  closed: ClosedWeek[];
}

export interface QgTools {
  me: { number: number | null; pseudo: string | null; mentor: boolean; gg: number };
  voice: string | null;
  plans: { mine: string | null; hours: PlanHour[] };
  goal: WeeklyGoal | null;
  wall: WallMember[];
  mentors: Mentor[];
  predictions: Predictions | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isInstant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const CLAN_TAG = /^[A-Z0-9]{2,5}$/;

/**
 * Le lien d'un salon du serveur Discord du clan, remis en forme comme le serveur le garde (`internal.voice_link_of`).
 * `null` pour tout autre lien : il finit dans un `href`, on ne prend que ce qu'on attend.
 */
export function voiceLinkOf(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const found = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/([0-9]{17,20})\/([0-9]{17,20})\/?$/.exec(text.trim());
  return found ? `https://discord.com/channels/${found[1]}/${found[2]}` : null;
}

function planHourOf(raw: unknown): PlanHour | null {
  if (!isRecord(raw) || !isInstant(raw["at"]) || !isCount(raw["count"]) || raw["count"] < 1) return null;
  return { at: raw["at"], count: raw["count"], faces: listOf(raw["faces"]).flatMap((face) => faceOf(face) ?? []) };
}

function wallMemberOf(raw: unknown): WallMember | null {
  const face = faceOf(raw);
  if (!face || !isRecord(raw) || !isCount(raw["number"]) || !isCount(raw["gg"])) return null;
  return { ...face, number: raw["number"], gg: raw["gg"], given: raw["given"] === true };
}

function mentorOf(raw: unknown): Mentor | null {
  const face = faceOf(raw);
  if (!face || !isRecord(raw)) return null;
  const discord = raw["discord"];
  return { ...face, discord: typeof discord === "string" && discord.trim() !== "" ? discord.trim().slice(0, 64) : null, mine: raw["mine"] === true };
}

function goalOf(raw: unknown): WeeklyGoal | null {
  if (!isRecord(raw) || !isDay(raw["week"])) return null;
  const { week, kind, wins, clan } = raw;
  if (kind === "wins" && isCount(wins) && wins >= 1 && wins <= GOAL_WINS_MAX) return { week, kind, wins };
  if (kind === "clan" && typeof clan === "string" && CLAN_TAG.test(clan)) return { week, kind, clan };
  return null;
}

function guessOf(raw: unknown): Guess | null {
  if (!isRecord(raw) || typeof raw["name"] !== "string" || raw["name"] === "" || !isCount(raw["wins"])) return null;
  return { name: raw["name"], wins: raw["wins"], mine: raw["mine"] === true };
}

function closedOf(raw: unknown): ClosedWeek | null {
  if (!isRecord(raw) || !isDay(raw["week"]) || !isInstant(raw["closes_at"])) return null;
  return { week: raw["week"], closesAt: raw["closes_at"], guesses: listOf(raw["guesses"]).flatMap((guess) => guessOf(guess) ?? []) };
}

function predictionsOf(raw: unknown): Predictions | null {
  if (!isRecord(raw) || !isDay(raw["week"]) || !isInstant(raw["closes_at"]) || !isCount(raw["count"])) return null;
  const mine = raw["mine"];
  return {
    week: raw["week"],
    closesAt: raw["closes_at"],
    mine: isCount(mine) ? mine : null,
    count: raw["count"],
    closed: listOf(raw["closed"]).flatMap((week) => closedOf(week) ?? []),
  };
}

/**
 * La réponse de `get_qg_tools`, relue : ce qui est illisible n'est pas montré, plutôt que deviné.
 * `null` : la réponse n'a pas la forme attendue, ou le serveur n'a pas encore cette fonction. Le QG garde alors ses
 * autres onglets.
 */
export function parseQgTools(raw: unknown): QgTools | null {
  if (!isRecord(raw) || !isRecord(raw["me"]) || !isRecord(raw["plans"]) || !Array.isArray(raw["wall"]) || !Array.isArray(raw["mentors"])) return null;
  const me = raw["me"];
  const plans = raw["plans"];
  const pseudo = me["pseudo"];
  return {
    me: {
      number: isCount(me["number"]) ? me["number"] : null,
      pseudo: typeof pseudo === "string" && pseudo !== "" ? pseudo : null,
      mentor: me["mentor"] === true,
      gg: isCount(me["gg"]) ? me["gg"] : 0,
    },
    voice: voiceLinkOf(raw["voice"]),
    plans: {
      mine: isInstant(plans["mine"]) ? plans["mine"] : null,
      hours: listOf(plans["hours"])
        .flatMap((hour) => planHourOf(hour) ?? [])
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    },
    goal: goalOf(raw["goal"]),
    wall: raw["wall"].flatMap((member) => wallMemberOf(member) ?? []),
    mentors: raw["mentors"].flatMap((mentor) => mentorOf(mentor) ?? []),
    predictions: predictionsOf(raw["predictions"]),
  };
}

/* ---------- Ce soir je joue ---------- */

/** Le début de l'heure d'un instant. Paris est décalé d'heures entières : l'heure pile y est la même. */
const hourStart = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

/** Deux instants de la même heure pile (le serveur écrit « +00:00 », le navigateur « Z »). */
export const sameHour = (a: string | null, b: string | null) => a !== null && b !== null && hourStart(Date.parse(a)) === hourStart(Date.parse(b));

/** Les heures proposées : l'heure en cours, puis les onze suivantes, en temps universel, à l'heure pile. */
export function planChoices(now: Date): string[] {
  const first = hourStart(now.getTime());
  return Array.from({ length: PLAN_HOURS }, (_, i) => new Date(first + i * HOUR_MS).toISOString());
}

/** « Maintenant » pour l'heure en cours, sinon l'heure de Paris : « 21 h ». */
export function planLabel(iso: string, now: Date): string {
  const at = Date.parse(iso);
  return hourStart(at) === hourStart(now.getTime()) ? "Maintenant" : `${parisParts(new Date(at)).hour} h`;
}

/** Les heures pas encore finies : une page restée ouverte ne garde pas une heure passée. */
export function liveHours(hours: readonly PlanHour[], now: Date): PlanHour[] {
  return hours.filter((hour) => Date.parse(hour.at) + HOUR_MS > now.getTime());
}

/** L'heure du membre, tant qu'elle n'est pas finie. */
export const liveMine = (mine: string | null, now: Date): string | null => (mine !== null && Date.parse(mine) + HOUR_MS > now.getTime() ? mine : null);

/** L'heure où il y aura le plus de membres, la plus proche en cas d'égalité. `null` : jamais deux membres à la même heure. */
export function peakHour(hours: readonly PlanHour[]): PlanHour | null {
  let best: PlanHour | null = null;
  for (const hour of hours) {
    if (best === null || hour.count > best.count || (hour.count === best.count && Date.parse(hour.at) < Date.parse(best.at))) best = hour;
  }
  return best !== null && best.count >= 2 ? best : null;
}

/** Les autres membres qui ont annoncé une heure pas encore finie : le nombre de l'onglet « Ce soir ». */
export function othersPlanned(plans: QgTools["plans"], now: Date): number {
  const hours = liveHours(plans.hours, now);
  const mine = liveMine(plans.mine, now);
  const total = hours.reduce((sum, hour) => sum + hour.count, 0);
  const mineCounted = mine !== null && hours.some((hour) => sameHour(hour.at, mine));
  return Math.max(0, total - (mineCounted ? 1 : 0));
}

/** Ceux qui ne se montrent pas, après les visages : « et 2 autres membres ». `null` : personne d'autre, ou aucun visage (le nombre de Gaulois suffit). */
export function planOthersLabel(count: number, shown: number): string | null {
  const others = count - shown;
  if (others < 1 || shown < 1) return null;
  return others === 1 ? "et 1 autre membre" : `et ${fmtInt(others)} autres membres`;
}

/* ---------- Les GG ---------- */

/** Les plus remerciés de la semaine : trois places, et toutes les égalités tant que cela tient en cinq lignes. */
export function ggPodium(wall: readonly WallMember[]): WallMember[] {
  const sorted = wall.filter((member) => member.gg > 0).sort((a, b) => b.gg - a.gg || a.name.localeCompare(b.name, "fr"));
  const last = sorted[GG_PODIUM - 1]?.gg;
  if (last === undefined) return sorted;
  const kept = sorted.filter((member) => member.gg >= last);
  return kept.length <= GG_PODIUM_MAX ? kept : sorted.filter((member) => member.gg > last);
}

/* ---------- L'objectif de la semaine ---------- */

/** « du 16 nov. au 22 nov. » */
export const weekSpan = (monday: string) => `du ${fmtDay(monday)} au ${fmtDay(addDays(monday, 6))}`;

/** La semaine des données publiques qui commence ce lundi-là. `null` : pas encore relevée, ou trop ancienne. */
export const clanWeekOf = (weeks: readonly ClanWeek[], monday: string): ClanWeek | null => weeks.find((week) => week.from === monday) ?? null;

export interface WinsProgress {
  done: number;
  target: number;
  reached: boolean;
  /** De 0 à 1, pour la barre. */
  share: number;
}

/** Où en est un objectif de victoires, d'après les parties relevées de sa semaine. `null` : semaine pas relevée. */
export function winsProgress(target: number, week: ClanWeek | null): WinsProgress | null {
  if (week === null || target < 1) return null;
  return { done: week.wins, target, reached: week.wins >= target, share: Math.min(1, week.wins / target) };
}

/** Un tag du classement officiel relevé : seul un tel tag s'affiche, jamais un tag lu ailleurs (CLAUDE.md, Données). */
export const isOfficialClan = (clans: ClanScores | null | undefined, tag: string): boolean => clans?.scores.some((clan) => clan.tag === tag) ?? false;

/**
 * L'écart de score entre le clan et un autre, au classement relevé : positif, le clan est devant. Arrondi au centième,
 * comme le classement l'affiche. `null` : l'un des deux n'est pas au classement.
 */
export function clanGap(clans: ClanScores | null, ours: string, theirs: string): number | null {
  const us = clans?.scores.find((clan) => clan.tag === ours);
  const them = clans?.scores.find((clan) => clan.tag === theirs);
  if (!us || !them) return null;
  return Math.round((us.score - them.score) * 100) / 100;
}

/** L'objectif « un clan » en une phrase, avec les mots du classement : garder son avance, ou rattraper son retard. */
export function clanGoalSentence(theirs: string, gap: number): string {
  if (gap > 0) return `${fmtGap(gap)} sur ${theirs} au score : à garder jusqu'à dimanche.`;
  if (gap < 0) return `${fmtGap(gap)} sur ${theirs} au score : à rattraper.`;
  return `À égalité de score avec ${theirs}.`;
}

/* ---------- Le pronostic ---------- */

/** La fin des pronostics, dite comme un membre la lit : « jusqu'au mardi 17 nov. à minuit ». */
export function closesLabel(closesAt: string): string {
  const day = parisParts(new Date(Date.parse(closesAt) - 1)).date;
  const weekday = WEEKDAYS_FR[parisParts(`${day}T12:00:00.000Z`).weekday] ?? "";
  return `jusqu'au ${weekday.toLocaleLowerCase("fr")} ${fmtDay(day)} à minuit`;
}

/** Les pronostics les plus proches du résultat, tous en cas d'égalité. Vide : aucun pronostic. */
export function closestGuesses(guesses: readonly Guess[], actual: number): Guess[] {
  if (guesses.length === 0) return [];
  const best = Math.min(...guesses.map((guess) => Math.abs(guess.wins - actual)));
  return guesses.filter((guess) => Math.abs(guess.wins - actual) === best);
}

/** Ce qui empêche d'envoyer un pronostic, dit en français. `null` : rien. */
export function predictionProblem(text: string): string | null {
  const value = text.trim();
  if (!/^\d{1,5}$/.test(value) || Number(value) > PREDICTION_MAX) return `Indiquez un nombre de victoires, de 0 à ${fmtInt(PREDICTION_MAX)}.`;
  return null;
}

/* ---------- Moi ---------- */

/** Le membre de la liste publique qui porte ce pseudo, s'il est le seul, casse comprise. `null` : absent, ou porté par plusieurs. */
export function memberOfPseudo(members: readonly StoredMember[], pseudo: string | null): StoredMember | null {
  if (pseudo === null) return null;
  const wanted = pseudo.toLocaleLowerCase("fr");
  const found = members.filter((member) => member.username !== null && member.username.toLocaleLowerCase("fr") === wanted);
  return found.length === 1 ? (found[0] ?? null) : null;
}
