/**
 * Le petit Gaulois des images du robot (demande du pilote, 14 novembre 2026) : le Gaulois qu'un membre a créé au village,
 * posé sur sa pastille, sur sa ligne, sur sa marche du podium ou sur sa fiche.
 *
 * Deux temps, comme le reste des images : la mise en page décide où poser chaque Gaulois (`placeSprite`, un
 * `SpritePlacement` par Gaulois, rangé dans `gaulois` sur la carte) et se teste sans rien dessiner ; `spriteLayer` en fait
 * un calque, que `renderGazetteCard` pose sur l'image. Le dessin vient de `casesDuGaulois` (48 × 64 cases), jamais modifié
 * ici. C'est du pixel art : chaque case devient un carré d'un nombre entier de pixels, sans lissage.
 *
 * Deux poses : le Gaulois entier, debout (la fiche), et le buste, coupé net à une rangée de sa grille, comme s'il se tenait
 * derrière ce qui porte son nom (pastille, marche, bord d'une ligne). Une tenue illisible ne dessine rien et ne fait rien
 * planter : `tenueOf` passe toujours par `lireTenue`.
 */
import type { OverlayOptions } from "sharp";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, lireTenue, type Tenue } from "./gaulois";
import type { GauloisParJoueur } from "./gaulois-joueurs";

/** La colonne de la grille où passe l'axe du corps : le Gaulois se centre sur elle, pas sur son arme. */
export const SPRITE_AXIS = GAULOIS_LARGEUR / 2;
/** La rangée où se coupe un buste : sous les épaules, le haut de la tunique encore visible. */
export const BUST_CUT = 38;
/** La rangée où se coupe une tête seule : sous le menton, pour une ligne basse. */
export const HEAD_CUT = 35;

/** La part de la grille qui est dessinée, en cases. */
export interface SpriteCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Un Gaulois à dessiner : sa tenue, le coin haut gauche de ce qui est dessiné, en pixels de l'image, et la taille d'une case. */
export interface SpritePlacement {
  tenue: Tenue;
  x: number;
  y: number;
  /** Le côté d'une case, en pixels : toujours un entier. */
  scale: number;
  crop: SpriteCrop;
}

/** La tenue d'un membre, relue par `lireTenue`. `null` : pas de Gaulois, tenue illisible, ou rien à dessiner. */
export function tenueOf(gaulois: GauloisParJoueur, id: string | null | undefined): Tenue | null {
  if (!id || gaulois.size === 0) return null;
  try {
    const tenue = lireTenue(gaulois.get(id));
    return tenue && cellsOf(tenue).some((cell) => cell !== null) ? tenue : null;
  } catch {
    return null;
  }
}

/** Les cases d'une tenue, gardées le temps du passage : une même tenue sert à la mise en page puis au dessin. */
const drawn = new Map<string, (string | null)[]>();
const DRAWN_MAX = 500;
function cellsOf(tenue: Tenue): (string | null)[] {
  const key = Object.keys(tenue)
    .sort()
    .map((k) => `${k}=${tenue[k]}`)
    .join("|");
  let cells = drawn.get(key);
  if (!cells) {
    cells = casesDuGaulois(tenue);
    if (drawn.size >= DRAWN_MAX) drawn.clear();
    drawn.set(key, cells);
  }
  return cells;
}

const filled = (cells: readonly (string | null)[], column: number, row: number) => (cells[row * GAULOIS_LARGEUR + column] ?? null) !== null;

/** Le contour de ce qui est dessiné entre deux rangées (`to` exclue). `null` : rien. */
function boxOf(cells: readonly (string | null)[], from: number, to: number): { left: number; right: number; top: number; bottom: number } | null {
  let left = GAULOIS_LARGEUR;
  let right = -1;
  let top = GAULOIS_HAUTEUR;
  let bottom = -1;
  for (let row = Math.max(0, from); row < Math.min(GAULOIS_HAUTEUR, to); row++) {
    for (let column = 0; column < GAULOIS_LARGEUR; column++) {
      if (!filled(cells, column, row)) continue;
      left = Math.min(left, column);
      right = Math.max(right, column);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
    }
  }
  return right < 0 ? null : { left, right, top, bottom };
}

export interface SpriteSpot {
  /** L'abscisse de l'axe du corps, en pixels de l'image. */
  axis: number;
  /** L'ordonnée du bas de ce qui est dessiné : le sol pour un Gaulois entier, le bord qui le coupe pour un buste. */
  bottom: number;
  /** Le côté d'une case : arrondi à l'entier, 1 au moins. */
  scale: number;
  /** La rangée de la grille où le Gaulois est coupé. Sans elle : entier, jusqu'aux pieds. */
  cut?: number;
  /** La hauteur à ne pas dépasser, en pixels : au-delà, le haut est rogné (une coiffure très haute). */
  room?: number;
}

/** Où dessiner un Gaulois, rogné à son contour. `null` : rien à dessiner à cet endroit. */
export function placeSprite(tenue: Tenue, spot: SpriteSpot): SpritePlacement | null {
  const scale = Math.max(1, Math.round(spot.scale));
  const cells = cellsOf(tenue);
  const whole = boxOf(cells, 0, spot.cut ?? GAULOIS_HAUTEUR);
  if (!whole) return null;
  const end = whole.bottom + 1;
  const rows = spot.room === undefined ? end - whole.top : Math.min(end - whole.top, Math.floor(spot.room / scale));
  if (rows < 1) return null;
  const box = boxOf(cells, end - rows, end);
  if (!box) return null;
  const crop = { left: box.left, top: end - rows, width: box.right - box.left + 1, height: rows };
  return { tenue, x: Math.round(spot.axis) - (SPRITE_AXIS - crop.left) * scale, y: Math.round(spot.bottom) - rows * scale, scale, crop };
}

/** La place que prend un Gaulois dans l'image, en pixels. */
export const spriteRect = (p: SpritePlacement) => ({ x: p.x, y: p.y, width: p.crop.width * p.scale, height: p.crop.height * p.scale });

/** Le même Gaulois, déplacé. */
export const movedSprite = (p: SpritePlacement, dx: number, dy: number): SpritePlacement => ({ ...p, x: p.x + dx, y: p.y + dy });

/** Les pixels d'un Gaulois : rouge, vert, bleu, opacité, ligne après ligne. Chaque case est un carré plein, sans lissage. */
export function spritePixels(p: SpritePlacement): { data: Buffer; width: number; height: number } {
  const cells = cellsOf(p.tenue);
  const { scale, crop } = p;
  const width = crop.width * scale;
  const height = crop.height * scale;
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < crop.height; row++) {
    for (let column = 0; column < crop.width; column++) {
      const color = cells[(crop.top + row) * GAULOIS_LARGEUR + crop.left + column];
      if (!color || !/^#[0-9a-f]{6}$/i.test(color)) continue;
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      for (let dy = 0; dy < scale; dy++) {
        let at = ((row * scale + dy) * width + column * scale) * 4;
        for (let dx = 0; dx < scale; dx++) {
          data[at++] = r;
          data[at++] = g;
          data[at++] = b;
          data[at++] = 255;
        }
      }
    }
  }
  return { data, width, height };
}

/** Le calque d'un Gaulois, à poser sur l'image. */
export function spriteLayer(p: SpritePlacement): OverlayOptions {
  const { data, width, height } = spritePixels(p);
  return { input: data, raw: { width, height, channels: 4 }, left: p.x, top: p.y };
}

/** Les calques des Gaulois d'une image. Un Gaulois qui sortirait de l'image n'est pas dessiné : il ferait échouer le dessin. */
export function spriteLayers(placements: readonly SpritePlacement[] | undefined, width: number, height: number): OverlayOptions[] {
  return (placements ?? [])
    .filter((p) => {
      const r = spriteRect(p);
      return r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height;
    })
    .map(spriteLayer);
}
