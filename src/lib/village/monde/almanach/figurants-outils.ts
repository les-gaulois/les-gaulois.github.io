/**
 * La boîte à dessin des figurants de l'almanach (`figurants.ts`) : des formes rondes, ombrées d'en haut à gauche, un
 * cerne sombre comme celui des bêtes du village (`../betes.ts`), des teintes qui suivent l'heure, et un tramage fixe pour
 * les nappes (brume, fumée), puisqu'une case est pleine ou vide. Rien n'est tiré au hasard : tout dépend de la lumière et
 * de l'image. Design : Claude Fable 5.2.
 */
import { type Decor, Planche } from "../../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../../lumiere";
import type { Figurant } from "./type";

export type Peintre = string | ((x: number, y: number) => string | null);
/** Trois tons d'une matière : éclairé, de fond, à l'ombre. */
export type Tons = readonly [clair: string, fond: string, sombre: string];

const peindre = (p: Peintre, x: number, y: number): string | null => (typeof p === "string" ? p : p(x, y));
export const borner = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));

/** La teinte de nuit d'une couleur de jour : assombrie et bleuie, comme les matières de `paletteDuDehors`. */
export function deNuit(couleur: string): string {
  return melanger(couleur, "#0e1838", 0.54);
}

/** Les teintes d'un dessin à cette lumière. `c` : une couleur du dehors ; `veille` : de 0 (plein jour) à 1 (nuit), pour ce qui éclaire. */
export function teintes(l: Lumiere) {
  const c = (deJour: string, nuit: string = deNuit(deJour)): string => couleurDuDehors(deJour, nuit, l);
  const tons = (clair: string, fond: string, sombre: string): Tons => [c(clair), c(fond), c(sombre)];
  return {
    c,
    tons,
    trait: c("#1a1410", "#080a14"),
    veille: borner((0.8 - l.jour) / 0.5),
    /** L'eau du ruisseau, pour les sillages et les ronds. */
    eau: { clair: c("#86bcd6", "#335f88"), fond: c("#4f8fb5", "#1e3d63"), sombre: c("#3b7499", "#17304f") },
  };
}
export type Teintes = ReturnType<typeof teintes>;

/** Un ovale plein, au demi-rayon près. */
export function ovale(pl: Planche, cx: number, cy: number, rx: number, ry: number, couleur: Peintre): void {
  for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
    for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
      const u = (i - cx) / rx;
      const v = (j - cy) / ry;
      if (u * u + v * v > 1) continue;
      const c = peindre(couleur, i, j);
      if (c !== null) pl.poser(i, j, c);
    }
  }
}

/** Un ovale ombré : clair en haut à gauche, sombre en bas à droite. */
export function boule(pl: Planche, cx: number, cy: number, rx: number, ry: number, tons: Tons): void {
  ovale(pl, cx, cy, rx, ry, (i, j) => {
    const n = -((i - cx) / rx) * 0.4 - ((j - cy) / ry) * 0.9;
    return n > 0.42 ? tons[0] : n < -0.36 ? tons[2] : tons[1];
  });
}

/** Un trait d'une case à l'autre, épais de `epais` cases. */
export function ligne(pl: Planche, x0: number, y0: number, x1: number, y1: number, couleur: Peintre, epais = 1): void {
  const pas = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= pas; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / pas);
    const y = Math.round(y0 + ((y1 - y0) * k) / pas);
    for (let dy = 0; dy < epais; dy++) {
      for (let dx = 0; dx < epais; dx++) {
        const c = peindre(couleur, x + dx, y + dy);
        if (c !== null) pl.poser(x + dx, y + dy, c);
      }
    }
  }
}

/** Une ligne brisée. */
export function chemin(pl: Planche, points: readonly (readonly [number, number])[], couleur: Peintre, epais = 1): void {
  for (let k = 0; k + 1 < points.length; k++) ligne(pl, points[k]![0], points[k]![1], points[k + 1]![0], points[k + 1]![1], couleur, epais);
}

/** Un polygone plein (ses sommets dans l'ordre). */
export function poly(pl: Planche, points: readonly (readonly [number, number])[], couleur: Peintre): void {
  const ys = points.map((p) => p[1]);
  for (let j = Math.floor(Math.min(...ys)); j <= Math.ceil(Math.max(...ys)); j++) {
    const coupes: number[] = [];
    for (let k = 0; k < points.length; k++) {
      const [ax, ay] = points[k]!;
      const [bx, by] = points[(k + 1) % points.length]!;
      if (ay === by) continue;
      const y = j + 0.001;
      if ((y >= ay && y < by) || (y >= by && y < ay)) coupes.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    coupes.sort((a, b) => a - b);
    for (let k = 0; k + 1 < coupes.length; k += 2) {
      for (let i = Math.round(coupes[k]!); i <= Math.round(coupes[k + 1]!); i++) {
        const c = peindre(couleur, i, j);
        if (c !== null) pl.poser(i, j, c);
      }
    }
  }
}

/** Le cerne : toute case vide qui touche une case pleine prend la couleur du trait. `sauf` : les couleurs qui n'en veulent pas. */
export function cerner(pl: Planche, trait: string, sauf: readonly string[] = []): void {
  const bord: number[] = [];
  const compte = (x: number, y: number): boolean => {
    const c = pl.lire(x, y);
    return c !== null && !sauf.includes(c);
  };
  for (let y = 0; y < pl.hauteur; y++) {
    for (let x = 0; x < pl.largeur; x++) {
      if (pl.lire(x, y) !== null) continue;
      if (compte(x - 1, y) || compte(x + 1, y) || compte(x, y - 1) || compte(x, y + 1)) bord.push(y * pl.largeur + x);
    }
  }
  for (const i of bord) pl.cases[i] = trait;
}

/** Pose un dessin sur la planche ; ses cases vides laissent ce qu'il y a dessous. */
export function tampon(pl: Planche, d: Decor, x: number, y: number): void {
  for (let j = 0; j < d.hauteur; j++) {
    for (let i = 0; i < d.largeur; i++) {
      const c = d.cases[j * d.largeur + i];
      if (c) pl.poser(x + i, y + j, c);
    }
  }
}

/** Le seuil d'un tramage ordonné 4 × 4, de 0 à 1 : `densite > trame(x, y)` remplit une part des cases égale à la densité. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
export function trame(x: number, y: number): number {
  return (BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]! + 0.5) / 16;
}

/** Une patte qui marche : droite, levée d'une case une image sur deux, avec son bout (sabot, pied). */
export function patte(pl: Planche, x: number, haut: number, bas: number, epais: number, leve: boolean, couleur: string, bout: string): void {
  const fin = bas - (leve ? 1 : 0);
  pl.rect(x, haut, epais, fin - haut, couleur);
  pl.rect(x, fin, epais, 1, bout);
}

/** Un sillage sur l'eau : de courts traits clairs à la rangée `y`, qui changent de place d'une image à l'autre. */
export function sillage(pl: Planche, t: Teintes, x0: number, x1: number, y: number, image: number): void {
  for (let x = x0; x <= x1; x++) {
    const k = (((x + image * 3) % 7) + 7) % 7;
    if (k < 3) pl.poser(x, y, t.eau.clair);
    else if (k === 4) pl.poser(x, y, t.eau.sombre);
  }
}

type Fiche = Omit<Figurant, "dessiner">;

/** Fabrique un figurant : sa fiche et la façon de le peindre sur une planche vide à sa taille. */
export function figurant(fiche: Fiche, peindreLe: (pl: Planche, t: Teintes, image: number, l: Lumiere) => void): Figurant {
  return {
    ...fiche,
    dessiner(l: Lumiere, image: number): Decor {
      const pl = new Planche(fiche.largeur, fiche.hauteur);
      const i = ((Math.floor(image) % fiche.images) + fiche.images) % fiche.images;
      peindreLe(pl, teintes(l), i, l);
      return pl.decor();
    },
  };
}
