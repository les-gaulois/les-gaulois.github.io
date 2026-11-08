/**
 * Reprendre le film là où un visiteur l'avait laissé : la première image postérieure à la dernière qu'il a vue.
 * Le navigateur garde seulement la date de cette dernière image, avec le reste de « Depuis votre dernière visite ».
 * Rien ne quitte l'appareil, et aucun chiffre n'est inventé : la différence vient des images du film.
 */
import { fmtDate, fmtInt } from "../format";

export interface FilmResume {
  /** Images déjà vues : le film repart de là. `0` : tout est nouveau. Égal au nombre d'images : rien de nouveau. */
  start: number;
  /** Pixels de GAL gagnés ou perdus depuis. */
  change: number;
  /** Le sous-titre affiché au départ. */
  caption: string;
}

/**
 * Le nombre d'images déjà vues par un visiteur dont la dernière image vue datait de `seenAt` (secondes Unix).
 * `null` quand le film n'est pas daté : il repart alors du début.
 */
export function framesSeen(frames: readonly { at?: number }[], seenAt: number): number | null {
  if (frames.length === 0 || frames.some((frame) => frame.at === undefined)) return null;
  let seen = 0;
  while (seen < frames.length && (frames[seen]!.at as number) <= seenAt) seen++;
  return seen;
}

/**
 * D'où reprendre, et quoi dire. `null` : pas de dernière visite connue, ou film sans dates.
 * `seenPixels` : le territoire de GAL que le visiteur a vu, gardé avec la date. La dernière image d'un film est
 * partielle et se complète au passage suivant, où sa date dépasse celle gardée : compter depuis les images
 * ajouterait ses pixels. Le compte part donc des pixels vus, comme l'accueil ; les images ne servent qu'à défaut.
 */
export function filmResume(frames: readonly { at?: number; gal: number }[], seenAt: number | null | undefined, since: string, seenPixels: number | null = null): FilmResume | null {
  if (seenAt === null || seenAt === undefined) return null;
  const start = framesSeen(frames, seenAt);
  if (start === null) return null;
  const when = `le ${fmtDate(since)}`;
  if (start >= frames.length) return { start, change: 0, caption: `Rien de nouveau sur la carte depuis votre dernière visite, ${when}.` };
  const before = seenPixels ?? (start === 0 ? 0 : frames[start - 1]!.gal);
  const change = frames[frames.length - 1]!.gal - before;
  const pixels = change === 0 ? "même nombre de pixels" : `${change > 0 ? "+" : "−"}${fmtInt(Math.abs(change))} ${Math.abs(change) > 1 ? "pixels" : "pixel"}`;
  return { start, change, caption: `Depuis votre dernière visite, ${when} : ${pixels}.` };
}
