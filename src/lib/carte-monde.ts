/**
 * Le territoire de la page /carte-monde/. Cette carte « World » n'est pas celle sur laquelle les clans peignent :
 * elle reçoit donc la même part des terres, pas les mêmes cases. Sa forme reste une illustration : le vrai tracé est sur la page Carte.
 */

/** Cases de terre à l'échelle dessinée par la page (`map4x.num_land_tiles` du manifeste copié dans public/carte-monde/). */
export const WORLD_LAND_TILES = 158_068;

export interface WorldTerritory {
  /** Pixels du clan sur la carte officielle. */
  pixels: number;
  /** Part des terres de la carte officielle tenue par le clan, en %. */
  share: number;
  /** La même part des terres, en cases de la carte « World ». */
  tiles: number;
  /** Date du relevé. */
  at: string;
}

/** `null` : pas de film, ou aucun pixel. Pas de données n'est pas un territoire nul. */
export function worldTerritory(film: { land: number; fetchedAt: string; galSummary?: { pixels: number } | null | undefined } | null): WorldTerritory | null {
  const pixels = film?.galSummary?.pixels ?? 0;
  if (!film || film.land <= 0 || pixels <= 0) return null;
  const part = pixels / film.land;
  return { pixels, share: part * 100, tiles: Math.round(part * WORLD_LAND_TILES), at: film.fetchedAt };
}
