/**
 * Les zones à prendre, dessinées pixel par pixel sur la carte complète (4 108 × 1 948).
 *
 * Pendant le dessin, la zone est un calque : un octet par pixel de la carte, 1 dans la zone. Le serveur la garde sous une
 * forme plus courte : le cadre qui la contient et un bit par pixel de ce cadre, ligne après ligne, le premier dans le bit
 * de poids faible, en base 64 (`save_alliance_zone`). Le cadre ne dépasse pas un million de pixels.
 *
 * Seule la terre se dessine : la mer ne se prend pas sur la carte des clans. Le dessin ne change aucune donnée collectée.
 */

/** La plus grande surface de cadre que le serveur accepte, en pixels. */
export const CADRE_MAX = 1_048_576;

export interface Masque {
  x: number;
  y: number;
  w: number;
  h: number;
  bits: Uint8Array;
}

/** Les anciennes valeurs des pixels changés par un geste, pour l'annuler. */
export type Retouche = Map<number, number>;

/** Le cadre des pixels du calque, ou `null` s'il est vide. */
export function cadreDuCalque(calque: Uint8Array, width: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  const height = calque.length / width;
  for (let y = 0; y < height; y++) {
    const ligne = y * width;
    let premier = -1;
    let dernier = -1;
    for (let x = 0; x < width; x++) {
      if (calque[ligne + x]) {
        if (premier < 0) premier = x;
        dernier = x;
      }
    }
    if (premier < 0) continue;
    if (y < y0) y0 = y;
    y1 = y;
    if (premier < x0) x0 = premier;
    if (dernier > x1) x1 = dernier;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Le calque sous la forme gardée par le serveur. `null` : rien n'est dessiné. */
export function masqueDuCalque(calque: Uint8Array, width: number): Masque | null {
  const cadre = cadreDuCalque(calque, width);
  if (!cadre) return null;
  const bits = new Uint8Array(Math.ceil((cadre.w * cadre.h) / 8));
  let i = 0;
  for (let y = cadre.y; y < cadre.y + cadre.h; y++) {
    for (let x = cadre.x; x < cadre.x + cadre.w; x++, i++) {
      if (calque[y * width + x]) bits[i >> 3]! |= 1 << (i & 7);
    }
  }
  return { ...cadre, bits };
}

/** Pose un masque sur un calque de la carte entière. */
export function poserMasque(calque: Uint8Array, width: number, masque: Masque): void {
  forEachPixel(masque, (x, y) => {
    calque[y * width + x] = 1;
  });
}

/** Chaque pixel d'un masque, en coordonnées de la carte. */
export function forEachPixel(masque: Masque, visit: (x: number, y: number) => void): void {
  const total = masque.w * masque.h;
  for (let i = 0; i < total; i++) {
    if ((masque.bits[i >> 3]! >> (i & 7)) & 1) visit(masque.x + (i % masque.w), masque.y + Math.floor(i / masque.w));
  }
}

export function pixelsDuMasque(masque: Masque): number {
  let n = 0;
  for (const octet of masque.bits) {
    let v = octet;
    while (v) {
      v &= v - 1;
      n++;
    }
  }
  return n;
}

/** Le pixel (x, y) de la carte est-il dans le masque ? */
export function dansLeMasque(masque: Masque, x: number, y: number): boolean {
  if (x < masque.x || y < masque.y || x >= masque.x + masque.w || y >= masque.y + masque.h) return false;
  const i = (y - masque.y) * masque.w + (x - masque.x);
  return ((masque.bits[i >> 3]! >> (i & 7)) & 1) === 1;
}

export function encoderBits(bits: Uint8Array): string {
  let texte = "";
  for (let i = 0; i < bits.length; i += 0x8000) texte += String.fromCharCode(...bits.subarray(i, i + 0x8000));
  return btoa(texte);
}

export function decoderBits(base64: string): Uint8Array {
  const texte = atob(base64);
  const bits = new Uint8Array(texte.length);
  for (let i = 0; i < texte.length; i++) bits[i] = texte.charCodeAt(i);
  return bits;
}

/** Une zone du serveur, prête à dessiner. `null` : un masque abîmé, qui ne correspond pas à son cadre. */
export function masqueDeLaZone(zone: { x: number; y: number; w: number; h: number; mask: string }): Masque | null {
  try {
    const bits = decoderBits(zone.mask);
    if (bits.length !== Math.ceil((zone.w * zone.h) / 8)) return null;
    return { x: zone.x, y: zone.y, w: zone.w, h: zone.h, bits };
  } catch {
    return null;
  }
}

/** Change un pixel du calque, en gardant son ancienne valeur pour l'annulation. `true` : il a changé. */
function changer(calque: Uint8Array, p: number, valeur: 0 | 1, retouche: Retouche): boolean {
  if (calque[p] === valeur) return false;
  if (!retouche.has(p)) retouche.set(p, calque[p]!);
  calque[p] = valeur;
  return true;
}

export interface Pinceau {
  width: number;
  height: number;
  /** Le côté du carré peint, en pixels. */
  taille: number;
  /** 1 pour peindre, 0 pour gommer. */
  valeur: 0 | 1;
  /** Ce pixel peut-il entrer dans la zone ? La mer ne peut pas. La gomme efface partout. */
  permis: (p: number) => boolean;
}

/** Un carré du pinceau, centré sur (cx, cy). Rend le nombre de pixels changés. */
export function tamponner(calque: Uint8Array, pinceau: Pinceau, cx: number, cy: number, retouche: Retouche): number {
  const demi = Math.floor((pinceau.taille - 1) / 2);
  let changes = 0;
  for (let y = cy - demi; y < cy - demi + pinceau.taille; y++) {
    if (y < 0 || y >= pinceau.height) continue;
    for (let x = cx - demi; x < cx - demi + pinceau.taille; x++) {
      if (x < 0 || x >= pinceau.width) continue;
      const p = y * pinceau.width + x;
      if (pinceau.valeur === 1 && !pinceau.permis(p)) continue;
      if (changer(calque, p, pinceau.valeur, retouche)) changes++;
    }
  }
  return changes;
}

/** Un trait du pinceau d'un point à l'autre, sans trou même quand la souris va vite. */
export function trait(calque: Uint8Array, pinceau: Pinceau, x0: number, y0: number, x1: number, y1: number, retouche: Retouche): number {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let erreur = dx - dy;
  let x = x0;
  let y = y0;
  let changes = 0;
  for (;;) {
    changes += tamponner(calque, pinceau, x, y, retouche);
    if (x === x1 && y === y1) return changes;
    const e2 = 2 * erreur;
    if (e2 > -dy) {
      erreur -= dy;
      x += sx;
    }
    if (e2 < dx) {
      erreur += dx;
      y += sy;
    }
  }
}

/** Le rectangle entre deux coins, compris. */
export function rectangle(calque: Uint8Array, pinceau: Pinceau, x0: number, y0: number, x1: number, y1: number, retouche: Retouche): number {
  let changes = 0;
  const [gauche, droite] = [Math.max(0, Math.min(x0, x1)), Math.min(pinceau.width - 1, Math.max(x0, x1))];
  const [haut, bas] = [Math.max(0, Math.min(y0, y1)), Math.min(pinceau.height - 1, Math.max(y0, y1))];
  for (let y = haut; y <= bas; y++) {
    for (let x = gauche; x <= droite; x++) {
      const p = y * pinceau.width + x;
      if (pinceau.valeur === 1 && !pinceau.permis(p)) continue;
      if (changer(calque, p, pinceau.valeur, retouche)) changes++;
    }
  }
  return changes;
}

/** Défait un geste. Rend la variation du nombre de pixels de la zone. */
export function annuler(calque: Uint8Array, retouche: Retouche): number {
  let variation = 0;
  for (const [p, avant] of retouche) {
    variation += avant - calque[p]!;
    calque[p] = avant;
  }
  return variation;
}
