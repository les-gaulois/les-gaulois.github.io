/**
 * Ce que l'onglet Simulateur du QG dit en couleur et en mots, à partir d'une projection déjà calculée (`simulateur-vue.ts`).
 * Rien n'est recalculé ici : ni score, ni rang. Ces fonctions ne font que lire la projection pour choisir un mot et sa
 * couleur (les tons des pastilles : `ok` vert, `warn` jaune, `danger` rouge, `ally` bleu, `muted` gris).
 */
import { fmtInt } from "../format";
import { GROUP_SIZES, type Scenario } from "../simulateur";
import type { Objective, ProjectedClan, Simulation } from "../simulateur-vue";

export type SimTon = "ok" | "warn" | "danger" | "ally" | "muted";

export interface SimVerdict {
  ton: SimTon;
  label: string;
}

const places = (n: number) => (n > 1 ? "places" : "place");

/** Les places gagnées (positif) ou perdues (négatif) entre le rang d'aujourd'hui et le rang projeté, en mots. */
export function placeVerdict(rankNow: number, rankThen: number): SimVerdict & { gained: number } {
  const gained = rankNow - rankThen;
  if (gained > 0) return { ton: "ok", label: `${gained} ${places(gained)} ${gained > 1 ? "gagnées" : "gagnée"}`, gained };
  if (gained < 0) return { ton: "danger", label: `${-gained} ${places(-gained)} ${gained < -1 ? "perdues" : "perdue"}`, gained };
  return { ton: "muted", label: "Même place", gained: 0 };
}

/**
 * Deux scores à égalité, tels qu'ils s'affichent : les écarts sont arrondis au point, et un écart de moins d'un demi-point
 * s'écrirait « 0 ». Le rang, lui, reste celui de la projection (à égalité exacte, l'ordre d'aujourd'hui est gardé).
 */
export const isTie = (gap: number): boolean => Math.round(Math.abs(gap)) === 0;

/** L'écart de score de GAL avec un clan, en mots et arrondi au point : positif, GAL est devant. Sous un demi-point, « À égalité ». */
export function gapWords(gap: number): string {
  if (isTie(gap)) return "À égalité";
  return gap > 0 ? `${fmtInt(Math.round(gap))} d'avance` : `${fmtInt(Math.round(-gap))} de retard`;
}

export interface SimNeighbour {
  tag: string;
  /** L'écart de score au bout de l'horizon, toujours positif ou nul. */
  gap: number;
}

/**
 * Au bout de l'horizon, le clan classé juste devant GAL et celui classé juste derrière. `null` : personne de ce côté.
 * `simulate` donne à chaque clan un rang distinct, même à score égal (l'ordre d'aujourd'hui est gardé) : il y a un seul clan
 * à chaque rang. À égalité, l'écart est nul, et `gapWords` le dit « À égalité ».
 */
export function neighbours(sim: Simulation): { ahead: SimNeighbour | null; behind: SimNeighbour | null } {
  const us = sim.us;
  if (!us) return { ahead: null, behind: null };
  const at = (rank: number): SimNeighbour | null => {
    const clan = sim.clans.find((c) => !c.isUs && c.rankThen === rank);
    return clan ? { tag: clan.tag, gap: Math.abs(clan.then - us.then) } : null;
  };
  return { ahead: at(us.rankThen - 1), behind: at(us.rankThen + 1) };
}

/**
 * L'état d'une ligne du classement projeté, face à GAL : un clan aujourd'hui devant et projeté derrière est « Dépassé » ;
 * un clan aujourd'hui derrière et projeté devant « Passe devant ». `null` : rien ne change entre ce clan et GAL, ou les deux
 * finissent à égalité (moins d'un demi-point d'écart : la ligne dit « À égalité », jamais « Dépassé » avec « 0 d'avance »).
 */
export function rowVerdict(clan: ProjectedClan, us: ProjectedClan): SimVerdict | null {
  if (clan.isUs || isTie(us.then - clan.then)) return null;
  const aheadNow = clan.rankNow < us.rankNow;
  const aheadThen = clan.rankThen < us.rankThen;
  if (aheadNow && !aheadThen) return { ton: "ok", label: "Dépassé" };
  if (!aheadNow && aheadThen) return { ton: "danger", label: "Passe devant" };
  return null;
}

/**
 * Le scénario peut-il rapporter un seul point ? Non quand aucune taille de groupe n'a de points par victoire : aucune
 * victoire des 30 derniers jours n'en a rapporté, et ce chiffre-là ne se règle pas dans le scénario.
 */
export const canScore = (scenario: Scenario): boolean => GROUP_SIZES.some((size) => scenario[size].pointsPerWin > 0);

/**
 * L'objectif en un mot : « Devant » si le scénario suffit ; « Hors de portée » s'il faudrait, chaque jour, plus que la
 * meilleure journée connue de GAL (`bestDayPoints`, `null` si elle n'est pas connue), ou si aucun scénario ne peut rapporter
 * de point (`scores` faux, voir `canScore`) ; sinon « À rattraper ».
 */
export function goalVerdict(goal: Pick<Objective, "aheadThen" | "required">, bestDayPoints: number | null, scores: boolean): SimVerdict {
  if (goal.aheadThen) return { ton: "ok", label: "Devant" };
  if (bestDayPoints !== null && goal.required > bestDayPoints) return { ton: "danger", label: "Hors de portée" };
  if (!scores) return { ton: "danger", label: "Hors de portée" };
  return { ton: "warn", label: "À rattraper" };
}
