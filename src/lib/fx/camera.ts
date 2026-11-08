/**
 * La caméra du film de la carte : des mouvements lents, qui démarrent et s'arrêtent en douceur.
 *
 * Chaque valeur suit sa cible comme un ressort amorti critique : elle part sans à-coup, ralentit
 * avant d'arriver et ne dépasse jamais la cible. Le zoom avance sur son logarithme : passer
 * de × 1 à × 2 prend le même temps que passer de × 2 à × 4.
 */
import type { MomentKind } from "../clanmap/moments";

export interface CameraView {
  x: number;
  y: number;
  s: number;
}

/** La caméra et sa vitesse sur chaque axe, le zoom compté en logarithme. */
export interface Camera extends CameraView {
  vx: number;
  vy: number;
  vz: number;
}

/** Durée du film à la vitesse × 1, quel que soit le nombre d'images. */
export const FILM_MS = 60_000;
/** Mouvements automatiques : la caméra arrive en deux secondes environ. */
export const CAMERA_SMOOTH_MS = 900;
/** Après un clic sur une zone ou un front : plus vif, toujours sans à-coup. */
export const CAMERA_CLICK_MS = 550;
/** Un plan rapproché : la caméra va vers GAL, y reste, puis revient pendant que le film continue. */
export const SHOT_MS = 5_000;
/** Écart minimal entre le début de deux plans rapprochés. */
export const SHOT_SPACING_MS = 14_000;
/** Un plan rapproché ne s'approche pas plus que trois fois la vue d'ensemble. */
export const SHOT_MAX_ZOOM = 3;

/** Les moments qui méritent un plan rapproché, du plus important au moins important. Le dernier relevé n'en a pas. */
const SHOT_PRIORITY: MomentKind[] = ["first", "rank", "push", "comeback", "fall", "loss", "threshold"];

/**
 * Rapproche une valeur de sa cible pendant `dt` millisecondes, comme un ressort amorti critique.
 * Renvoie la nouvelle valeur et sa vitesse. Méthode de Game Programming Gems 4, chapitre 1.10.
 */
export function damp(current: number, target: number, velocity: number, smoothMs: number, dt: number): [number, number] {
  if (dt <= 0) return [current, velocity];
  const omega = 2 / smoothMs;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  const next = target + (change + temp) * decay;
  // Jamais au-delà de la cible : la caméra ne revient pas en arrière.
  if (target - current > 0 === next > target) return [target, 0];
  return [next, (velocity - omega * temp) * decay];
}

/** Pose la caméra sur sa cible, sans mouvement. */
export function placeCamera(camera: Camera, target: CameraView): void {
  camera.x = target.x;
  camera.y = target.y;
  camera.s = target.s;
  camera.vx = 0;
  camera.vy = 0;
  camera.vz = 0;
}

/**
 * Avance la caméra vers sa cible. Renvoie `false` quand elle est arrivée : elle se pose alors
 * exactement sur la cible, à moins d'un demi-pixel d'écran de là où elle était.
 */
export function moveCamera(camera: Camera, target: CameraView, dt: number, smoothMs: number): boolean {
  const close =
    Math.abs(target.x - camera.x) * camera.s < 0.5 &&
    Math.abs(target.y - camera.y) * camera.s < 0.5 &&
    Math.abs(Math.log(target.s / camera.s)) < 0.002 &&
    Math.hypot(camera.vx * camera.s, camera.vy * camera.s) < 0.01 &&
    Math.abs(camera.vz) < 0.0005;
  if (close) {
    const moved = camera.x !== target.x || camera.y !== target.y || camera.s !== target.s;
    placeCamera(camera, target);
    return moved;
  }
  [camera.x, camera.vx] = damp(camera.x, target.x, camera.vx, smoothMs, dt);
  [camera.y, camera.vy] = damp(camera.y, target.y, camera.vy, smoothMs, dt);
  let zoom: number;
  [zoom, camera.vz] = damp(Math.log(camera.s), Math.log(target.s), camera.vz, smoothMs, dt);
  camera.s = Math.exp(zoom);
  return true;
}

/**
 * Les grands moments filmés de près pendant une lecture à la vitesse × 1 : les plus importants
 * d'abord, et jamais deux plans à moins de `spacingMs` l'un de l'autre.
 */
export function pickShots(moments: readonly { frame: number; kind: MomentKind }[], frameMs: number, spacingMs = SHOT_SPACING_MS): Set<number> {
  const kept: number[] = [];
  for (const kind of SHOT_PRIORITY) {
    for (const moment of moments) {
      if (moment.kind !== kind) continue;
      if (kept.every((frame) => Math.abs(frame - moment.frame) * frameMs >= spacingMs)) kept.push(moment.frame);
    }
  }
  return new Set(kept);
}
