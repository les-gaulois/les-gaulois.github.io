/**
 * Règles de la carte officielle, relevées dans le code de sa page le 5 novembre 2026
 * (`clanmap.openfront.io`). Le jeu peut les changer : les résultats restent des
 * repères indicatifs, et ne tiennent pas compte de la forme du territoire ni des
 * pixels verrouillés. Ces calculs ne modifient aucune donnée collectée.
 */
export const TROOPS_PER_CAP = 100;
export const NEUTRAL_PIXEL_TROOPS = 1_000;
/**
 * Un pixel ennemi coûte `2 000 + ⌈troupes du clan ÷ pixels du clan⌉` (docs/API_AUDIT.md, « Qui peut quoi sur la carte »).
 * Les troupes des autres clans ne sont pas collectées : le site n'en donne que ce minimum.
 */
export const ENEMY_PIXEL_BASE_TROOPS = 2_000;
export const RULES_CHECKED_ON = "2026-11-05";

export interface Standing {
  tag: string | null;
  color: number | null;
  pixels: number;
}

export const capsToTroops = (caps: number) => Math.max(0, caps) * TROOPS_PER_CAP;
export const neutralPixelsFor = (troops: number) => Math.floor(Math.max(0, troops) / NEUTRAL_PIXEL_TROOPS);

export interface Objective {
  rank: number;
  me: Standing;
  above: Standing | null;
  below: Standing | null;
  /** Pixels à gagner pour dépasser le clan juste devant. */
  gap: number | null;
  /** Avance sur le clan juste derrière. */
  lead: number | null;
}

/** La situation du clan dans l'ordre de la carte officielle. `null` s'il n'y a aucun pixel. */
export function objectiveFor(standings: readonly Standing[], tag: string): Objective | null {
  const at = standings.findIndex((s) => s.tag === tag);
  const me = standings[at];
  if (!me) return null;
  const above = standings[at - 1] ?? null;
  const below = standings[at + 1] ?? null;
  return {
    rank: at + 1,
    me,
    above,
    below,
    gap: above ? above.pixels - me.pixels + 1 : null,
    lead: below ? me.pixels - below.pixels : null,
  };
}
