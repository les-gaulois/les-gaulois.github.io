/**
 * La vitesse du film de la carte : un curseur gradué de × 0,1 à × 1, par pas de 0,1.
 * À × 1, le film entier dure `FILM_MS` ; à × 0,1, dix fois plus. Les vitesses × 2 et × 4
 * ont été retirées le 9 novembre 2026 : le film ne va jamais plus vite que × 1.
 */
import { fmtDec1 } from "../format";

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 1;
export const SPEED_STEP = 0.1;

/** Une valeur du curseur ramenée sur sa graduation et ses bornes : jamais 0,30000000000000004, jamais 0. */
export function filmSpeed(value: number): number {
  if (!Number.isFinite(value)) return SPEED_MAX;
  const tenths = Math.round(value / SPEED_STEP);
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, tenths / 10));
}

/** Ce qui s'écrit à côté du curseur : « × 0,5 ». */
export const speedLabel = (speed: number) => `× ${fmtDec1(speed)}`;

/** Ce qu'un lecteur d'écran dit du curseur. */
export const speedText = (speed: number) => (speed >= SPEED_MAX ? "vitesse normale" : `${fmtDec1(speed)} fois la vitesse normale`);
