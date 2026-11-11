/**
 * Le simulateur de classement du QG : le score d'OpenFront (`weightedWins`) recalculé, puis projeté.
 *
 * La règle, vérifiée le 11 novembre 2026 sur 130 classements relevés du 5 au 11 novembre (écart moyen 0,03 %, au plus
 * 0,26 %, voir docs/API_AUDIT.md) : chaque partie ajoute ses points (`max(score, 0)` de la session du clan), qui perdent la
 * moitié de leur valeur tous les 30 jours et sortent du classement 90 jours après le début de la partie.
 *
 * Pour GAL, le site connaît chaque partie : le vieillissement et les sorties de son score sont exacts. Pour les autres clans,
 * il ne connaît que leur score, relevé chaque jour : leurs sorties sont estimées comme si leur rythme avait été régulier sur
 * leurs 90 derniers jours. Une projection suppose un rythme constant : ce n'est pas une prévision.
 */

export const HALF_LIFE_DAYS = 30;
export const WINDOW_DAYS = 90;
export const DAY_MS = 86_400_000;

/** Les tailles de groupe du simulateur : seul, à 2, à 3, à 4 et plus. */
export const GROUP_SIZES = ["1", "2", "3", "4"] as const;
export type GroupSize = (typeof GROUP_SIZES)[number];
export const GROUP_LABELS: Record<GroupSize, string> = { "1": "Seul", "2": "À 2", "3": "À 3", "4": "À 4 et plus" };
export const groupOf = (clanPlayers: number): GroupSize => (clanPlayers >= 4 ? "4" : clanPlayers === 3 ? "3" : clanPlayers === 2 ? "2" : "1");

/** Ce que vaut un point d'âge `ageDays` (en jours) : la moitié tous les 30 jours, et rien à partir de 90 jours. */
export const weightAt = (ageDays: number): number => (ageDays < 0 || ageDays >= WINDOW_DAYS ? 0 : 2 ** (-ageDays / HALF_LIFE_DAYS));

/**
 * Ce que vaut, au bout de `days` jours, un point brut gagné chaque jour pendant ces jours-là : ∫ 2^(−u/30) du sur les jours
 * encore dans la fenêtre (90 au plus).
 */
export function steadyGain(days: number): number {
  const d = Math.min(Math.max(days, 0), WINDOW_DAYS);
  return (HALF_LIFE_DAYS / Math.LN2) * (1 - 2 ** (-d / HALF_LIFE_DAYS));
}

/** Le score d'un clan qui gagne un point brut par jour depuis plus de 90 jours (environ 37,87). */
export const STEADY_SCORE = steadyGain(WINDOW_DAYS);

/** Le score exact, à l'instant `at` (millisecondes), de points datés : [instant en secondes, points bruts]. */
export function scoreAt(points: readonly (readonly [number, number])[], at: number): number {
  let total = 0;
  for (const [t, p] of points) total += p * weightAt((at - t * 1000) / DAY_MS);
  return total;
}

/**
 * Ce qu'il reste, au bout de `days` jours, du score d'un clan dont on ne connaît que le total : la demi-vie, et les sorties
 * de la fenêtre estimées à son rythme moyen sur 90 jours. Rien au bout de 90 jours.
 */
export function keptScore(score: number, days: number): number {
  const d = Math.min(Math.max(days, 0), WINDOW_DAYS);
  return Math.max(0, score * 2 ** (-d / HALF_LIFE_DAYS) - ((score / STEADY_SCORE) * steadyGain(d)) / 8);
}

/** Le score d'un clan, dans `days` jours, s'il gagne `rate` points bruts par jour. */
export const projectScore = (score: number, rate: number, days: number): number => keptScore(score, days) + rate * steadyGain(days);

/**
 * Le rythme d'un clan, en points bruts par jour, d'après deux relevés de son score à `days` jours d'écart. Inverse de
 * `projectScore`. Jamais négatif. `null` sans écart de temps.
 */
export function rateBetween(before: number, after: number, days: number): number | null {
  if (!(days > 0)) return null;
  return Math.max(0, (after - keptScore(before, days)) / steadyGain(days));
}

/* ---------- Le scénario de GAL ---------- */

/** Ce que fait le clan, pour une taille de groupe : parties par jour, part de victoires (0 à 1), points par victoire. */
export interface SizePace {
  games: number;
  winRate: number;
  pointsPerWin: number;
}
export type Scenario = Record<GroupSize, SizePace>;

/** Les points bruts par jour d'un scénario. */
export const dailyPoints = (scenario: Scenario): number => GROUP_SIZES.reduce((sum, size) => sum + scenario[size].games * scenario[size].winRate * scenario[size].pointsPerWin, 0);

/** Les points bruts qu'apporte en moyenne une partie de cette taille de groupe. */
export const pointsPerGame = (pace: SizePace): number => pace.winRate * pace.pointsPerWin;

/**
 * Le score de GAL dans `days` jours : le score officiel d'aujourd'hui, plus le changement exact de ses parties déjà jouées
 * (demi-vie et sorties de la fenêtre), plus ce que rapporte le scénario. Le changement se calcule sur les parties : le score
 * affiché reste celui d'OpenFront. `knownDays` : les jours déjà couverts par des parties relevées après le classement ; le
 * scénario ne commence qu'après eux, pour qu'un classement relevé en retard ne compte pas deux fois ces jours-là.
 */
export function projectGal(official: number, points: readonly (readonly [number, number])[], asOf: number, rate: number, days: number, knownDays = 0): number {
  const change = scoreAt(points, asOf + days * DAY_MS) - scoreAt(points, asOf);
  return Math.max(0, official + change) + rate * steadyGain(Math.max(0, days - knownDays));
}

/* ---------- Ce qu'on en tire ---------- */

export interface Crossing {
  /** Le jour, compté depuis aujourd'hui. */
  day: number;
  /** `true` : GAL passe devant ; `false` : le clan repasse devant GAL. */
  ahead: boolean;
}

/** Les jours où GAL et un clan échangent leur place, d'après leurs deux courbes jour par jour (le jour 0 est aujourd'hui). */
export function crossings(gal: readonly number[], other: readonly number[]): Crossing[] {
  const found: Crossing[] = [];
  for (let day = 1; day < Math.min(gal.length, other.length); day++) {
    const before = (gal[day - 1] ?? 0) > (other[day - 1] ?? 0);
    const now = (gal[day] ?? 0) > (other[day] ?? 0);
    if (now !== before) found.push({ day, ahead: now });
  }
  return found;
}

/**
 * Les points bruts par jour qu'il faudrait à GAL, dès aujourd'hui et jusqu'au jour `days`, pour finir au-dessus de `target`.
 * `galWithoutGames` : son score ce jour-là sans aucune partie. 0 si c'est déjà acquis sans jouer.
 */
export function requiredRate(target: number, galWithoutGames: number, days: number): number {
  const gain = steadyGain(days);
  if (gain <= 0) return target < galWithoutGames ? 0 : Number.POSITIVE_INFINITY;
  return Math.max(0, (target - galWithoutGames) / gain);
}

export interface Placed {
  tag: string;
  score: number;
}

/** Le rang de chaque clan, du plus haut score au plus bas ; à égalité, l'ordre d'arrivée est gardé. */
export const ranked = <T extends Placed>(clans: readonly T[]): T[] => [...clans].sort((a, b) => b.score - a.score);
