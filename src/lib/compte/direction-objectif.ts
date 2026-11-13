/**
 * L'onglet « Objectif » de la Direction (14 novembre 2026) : l'état de l'objectif de la semaine, en une couleur et un mot.
 * Rien n'est recalculé ici : les victoires viennent de `winsProgress`, l'écart de score de `clanGap` (`./outils`), sur
 * les données publiques du site (`/semaine-du-clan.json`). « Pas de données » n'est pas zéro : sans relevé, l'état le dit.
 *
 * Volontairement, pas d'état « en retard » pour un nombre de victoires : il faudrait deviner un rythme que personne n'a
 * fixé. Seul l'objectif « un clan » a un retard, celui du classement, que le QG écrit déjà (« de retard »).
 */
import type { ClanWeekFile } from "../semaine-du-clan";
import { clanGap, clanWeekOf, isOfficialClan, winsProgress, type WeeklyGoal, type WinsProgress } from "./outils";

/** Les couleurs d'état des onglets de la Direction (`data-dir-ton`). */
export type GoalTone = "ok" | "warn" | "danger" | "ally" | "muted";

export type GoalState =
  | { key: "none"; tone: "muted"; word: string }
  | { key: "no-data"; tone: "muted"; word: string }
  | { key: "running"; tone: "ally"; word: string; progress: WinsProgress }
  | { key: "reached"; tone: "ok"; word: string; progress: WinsProgress }
  | { key: "ahead"; tone: "ok"; word: string; gap: number }
  | { key: "level"; tone: "ally"; word: string; gap: number }
  | { key: "behind"; tone: "warn"; word: string; gap: number };

/**
 * L'état d'un objectif. `goal` nul : pas d'objectif cette semaine. `file` nul : les données publiques n'ont pas pu être
 * lues. Un clan qui n'est pas au classement officiel relevé n'a pas d'état (et son tag ne s'affiche pas).
 */
export function goalState(goal: WeeklyGoal | null, file: ClanWeekFile | null, ours: string): GoalState {
  if (goal === null) return { key: "none", tone: "muted", word: "Pas fixé" };
  if (goal.kind === "wins") {
    const progress = file?.until ? winsProgress(goal.wins, clanWeekOf(file.weeks, goal.week)) : null;
    if (progress === null) return { key: "no-data", tone: "muted", word: "Pas de données" };
    return progress.reached ? { key: "reached", tone: "ok", word: "Atteint", progress } : { key: "running", tone: "ally", word: "En cours", progress };
  }
  const gap = isOfficialClan(file?.clans, goal.clan) ? clanGap(file?.clans ?? null, ours, goal.clan) : null;
  if (gap === null) return { key: "no-data", tone: "muted", word: "Pas de données" };
  if (gap > 0) return { key: "ahead", tone: "ok", word: "Devant", gap };
  if (gap < 0) return { key: "behind", tone: "warn", word: "Derrière", gap };
  return { key: "level", tone: "ally", word: "À égalité", gap };
}

/** Les victoires qui manquent encore pour atteindre l'objectif : jamais négatif. */
export const winsLeft = (progress: WinsProgress): number => Math.max(0, progress.target - progress.done);
