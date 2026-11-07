import type { StoredMember } from "./schemas";

/**
 * Paliers de victoires d'équipe sous le tag, lues dans `stats.team`. Les seuils sont un choix du site : ils ne viennent pas du jeu.
 * Un palier compte des victoires, donc d'abord des parties jouées : il ne dit pas qui joue le mieux. Mesures : README.md.
 */
export const WIN_TIERS = [10, 50, 100, 250, 500, 1000, 2500, 5000] as const;

/** Le plus haut palier atteint. `null` : aucun pour l'instant. */
export function tierOf(wins: number): number | null {
  return WIN_TIERS.findLast((tier) => wins >= tier) ?? null;
}

export interface NextTier {
  wins: number;
  missing: number;
  /** Le palier d'où part le joueur, 0 s'il n'en a pas encore : la jauge va de là au palier suivant. */
  from: number;
}

/** Le palier suivant et les victoires qui manquent. `null` : le dernier palier est atteint. */
export function nextTier(wins: number): NextTier | null {
  const next = WIN_TIERS.find((tier) => wins < tier);
  return next === undefined ? null : { wins: next, missing: next - wins, from: tierOf(wins) ?? 0 };
}

export interface TierRow {
  wins: number;
  /** Membres dont c'est le plus haut palier. */
  count: number;
  /** Ceux qui ont un pseudo, par ordre alphabétique : à l'intérieur d'un palier, personne n'est devant personne. */
  named: StoredMember[];
  anonymous: number;
}

/**
 * Les membres rangés à leur plus haut palier, du plus haut au plus bas, sans les paliers vides.
 * Sans stats reçues, un membre n'est rangé nulle part : pas de données n'est pas zéro victoire.
 */
export function tierRows(members: readonly StoredMember[]): TierRow[] {
  const byTier = new Map<number, StoredMember[]>();
  for (const member of members) {
    if (!member.team) continue;
    const tier = tierOf(member.team.wins);
    if (tier === null) continue;
    byTier.set(tier, [...(byTier.get(tier) ?? []), member]);
  }
  return [...WIN_TIERS].reverse().flatMap((wins) => {
    const list = byTier.get(wins);
    if (!list) return [];
    const named = list.filter((m) => m.username).sort((a, b) => (a.username ?? "").localeCompare(b.username ?? "", "fr"));
    return [{ wins, count: list.length, named, anonymous: list.length - named.length }];
  });
}
