/**
 * L'onglet « Objectif » de la Direction (14 novembre 2026) : l'état de l'objectif de la semaine, en une couleur et un mot.
 * Rien n'est recalculé ici : les victoires viennent de `winsProgress`, l'écart de score de `clanGap` (`./outils`), sur
 * les données publiques du site (`/semaine-du-clan.json`). « Pas de données » n'est pas zéro : sans relevé, l'état le dit.
 *
 * Volontairement, pas d'état « en retard » pour un nombre de victoires : il faudrait deviner un rythme que personne n'a
 * fixé. Seul l'objectif « un clan » a un retard, celui du classement, que le QG écrit déjà (« de retard »). Une semaine
 * entièrement relevée (`complete`) dont le compte reste sous l'objectif n'est plus « en cours » : elle est « pas atteint ».
 */
import { fmtInt } from "../format";
import type { ClanScores, ClanWeek, ClanWeekFile } from "../semaine-du-clan";
import { clanGap, clanWeekOf, isOfficialClan, winsProgress, type WeeklyGoal, type WinsProgress } from "./outils";

/** Ce que l'onglet lit du fichier public : les semaines et leur heure, le classement. Pas les victoires des membres. */
export type GoalFile = Pick<ClanWeekFile, "until" | "weeks" | "clans">;

export type GoalState =
  | { key: "none"; tone: "muted"; word: string }
  | { key: "no-data"; tone: "muted"; word: string }
  | { key: "running"; tone: "ally"; word: string; progress: WinsProgress }
  | { key: "reached"; tone: "ok"; word: string; progress: WinsProgress }
  | { key: "missed"; tone: "warn"; word: string; progress: WinsProgress }
  | { key: "ahead"; tone: "ok"; word: string; gap: number }
  | { key: "level"; tone: "ally"; word: string; gap: number }
  | { key: "behind"; tone: "warn"; word: string; gap: number };

const NO_DATA: GoalState = { key: "no-data", tone: "muted", word: "Pas de données" };

/**
 * L'état d'un objectif. `goal` nul : pas d'objectif cette semaine. `file` nul : les données publiques n'ont pas pu être
 * lues. Un clan qui n'est pas au classement officiel relevé n'a pas d'état (et son tag ne s'affiche pas).
 */
export function goalState(goal: WeeklyGoal | null, file: GoalFile | null, ours: string): GoalState {
  if (goal === null) return { key: "none", tone: "muted", word: "Pas fixé" };
  if (goal.kind === "wins") {
    const week = file?.until ? clanWeekOf(file.weeks, goal.week) : null;
    const progress = winsProgress(goal.wins, week);
    // Un compte illisible n'est pas un compte : jamais « NaN sur 30 ».
    if (week === null || progress === null || !Number.isInteger(progress.done) || progress.done < 0) return NO_DATA;
    if (progress.reached) return { key: "reached", tone: "ok", word: "Atteint", progress };
    return week.complete ? { key: "missed", tone: "warn", word: "Pas atteint", progress } : { key: "running", tone: "ally", word: "En cours", progress };
  }
  const gap = isOfficialClan(file?.clans, goal.clan) ? clanGap(file?.clans ?? null, ours, goal.clan) : null;
  // Un score illisible donnerait un écart « NaN », ni positif ni négatif : il passerait pour une égalité.
  if (gap === null || !Number.isFinite(gap)) return NO_DATA;
  if (gap > 0) return { key: "ahead", tone: "ok", word: "Devant", gap };
  if (gap < 0) return { key: "behind", tone: "warn", word: "Derrière", gap };
  // `Math.round` peut rendre « -0 » : l'égalité s'écrit 0.
  return { key: "level", tone: "ally", word: "À égalité", gap: 0 };
}

/** Les victoires qui manquent encore pour atteindre l'objectif : jamais négatif. */
export const winsLeft = (progress: WinsProgress): number => Math.max(0, progress.target - progress.done);

/** Ce qui manque, sous la jauge : « Il en manque 94. », ou « Il en a manqué 4. » une fois la semaine relevée. `null` : atteint, ou rien à compter. */
export function winsLeftText(state: GoalState): string | null {
  if (state.key === "running") return `Il en manque ${fmtInt(winsLeft(state.progress))}.`;
  if (state.key === "missed") return `Il en a manqué ${fmtInt(winsLeft(state.progress))}.`;
  return null;
}

/**
 * Le titre et le bouton du formulaire. `undefined` : l'objectif en cours n'est pas lu (lecture, ou panne du serveur) ; on ne
 * dit « Fixer » ou « Changer » que si l'on sait s'il y en a déjà un. Le serveur remplace l'objectif de la semaine, s'il existe.
 */
export function formTitle(goal: WeeklyGoal | null | undefined): string {
  if (goal === undefined) return "Enregistrer l'objectif";
  return goal === null ? "Fixer l'objectif" : "Changer l'objectif";
}

/* ---------- Le fichier public, relu ---------- */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isInstant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

function weekOf(raw: unknown): ClanWeek | null {
  if (!isRecord(raw) || !isDay(raw["from"]) || !isCount(raw["games"]) || !isCount(raw["wins"])) return null;
  return { from: raw["from"], games: raw["games"], wins: raw["wins"], complete: raw["complete"] === true };
}

function scoreOf(raw: unknown): { tag: string; score: number } | null {
  if (!isRecord(raw) || typeof raw["tag"] !== "string" || raw["tag"] === "" || typeof raw["score"] !== "number" || !Number.isFinite(raw["score"])) return null;
  return { tag: raw["tag"], score: raw["score"] };
}

function clansOf(raw: unknown): ClanScores | null {
  if (!isRecord(raw) || !isInstant(raw["end"]) || !Array.isArray(raw["scores"])) return null;
  return { end: raw["end"], scores: raw["scores"].flatMap((row: unknown) => scoreOf(row) ?? []) };
}

/**
 * `/semaine-du-clan.json`, relu comme le QG relit le serveur : ce qui est illisible n'est pas montré, plutôt que deviné.
 * `null` : ce n'est pas le fichier attendu. Une semaine ou un clan illisible est écarté ; une heure illisible devient `null`
 * (et la semaine n'a alors pas de compte, comme sans collecte).
 */
export function readGoalFile(raw: unknown): GoalFile | null {
  if (!isRecord(raw) || !Array.isArray(raw["weeks"])) return null;
  return {
    until: isInstant(raw["until"]) ? raw["until"] : null,
    weeks: raw["weeks"].flatMap((week: unknown) => weekOf(week) ?? []),
    clans: clansOf(raw["clans"]),
  };
}
