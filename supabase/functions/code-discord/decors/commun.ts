/**
 * Ce que partagent les décors de /gaulois : la toile de 124 cases sur 80 (une case vaut 4 pixels dans l'image de 496 × 320),
 * ses repères, et quelques outils de dessin. Un décor par lieu, un fichier par dessinateur (`place.ts`, `taverne.ts`,
 * `reunion.ts`, `bataille.ts`, `maisons.ts`) ; chacun dessine les quatre moments de la journée. Dessins originaux de
 * Claude Fable 5.2 pour le clan [GAL], 14 novembre 2026, sans emprunt à une œuvre existante.
 *
 * Un décor n'importe que ce fichier et des types de `../scene.ts` : il ne lit ni le réseau ni l'heure.
 */
import type { Moment } from "../scene.ts";

/** La toile, en cases. */
export const LARGEUR = 124;
export const HAUTEUR = 80;
/** La rangée où le sol commence dehors (ou le plancher dedans), et celle où le Gaulois pose ses semelles. */
export const HORIZON = 60;
export const PIEDS = 72;
/**
 * La place du Gaulois : 48 cases de large au milieu (colonnes 38 à 85), de la rangée 10 à la rangée 73. Ce qui est dessiné
 * là est caché par lui en grande partie : rien d'important derrière.
 */
export const GAULOIS = { x: 38, y: 10, largeur: 48, hauteur: 64 } as const;
/** Le logo du clan, posé par-dessus le décor en haut à gauche : 18 cases sur 18 depuis le coin. Rien d'important dessous. */
export const LOGO = { x: 0, y: 0, largeur: 18, hauteur: 18 } as const;

/** Un décor dessiné : ses cases, rangée par rangée (124 × 80 couleurs « #rrggbb », aucune vide), et la couleur de l'ombre
 * du Gaulois sur son sol. */
export interface Decor {
  cases: readonly string[];
  ombre: string;
}

/** Le dessin d'un lieu : un décor pour chaque moment. Même moment, même décor : rien d'aléatoire. */
export type DessinDuLieu = (moment: Moment) => Decor;

/** Un tirage fixe par case, pour du grain, de l'herbe, des étoiles : le même à chaque image. */
export const grain = (x: number, y: number): number => (Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663)) >>> 0;

const hex = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const rgb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** Le mélange de deux couleurs : `part` de 0 (tout `a`) à 1 (tout `b`). */
export function melanger(a: string, b: string, part: number): string {
  const [ra, ga, ba] = rgb(a);
  const [rb, gb, bb] = rgb(b);
  const t = Math.min(1, Math.max(0, part));
  return `#${hex(ra + (rb - ra) * t)}${hex(ga + (gb - ga) * t)}${hex(ba + (bb - ba) * t)}`;
}

/** Une toile de 124 × 80 cases, toutes de la couleur de fond, et de quoi y dessiner. Hors de la toile, rien ne se pose. */
export class Toile {
  readonly cases: string[];
  constructor(fond: string) {
    this.cases = new Array<string>(LARGEUR * HAUTEUR).fill(fond);
  }
  poser(x: number, y: number, couleur: string): void {
    if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < LARGEUR && y < HAUTEUR) this.cases[y * LARGEUR + x] = couleur;
  }
  lire(x: number, y: number): string | undefined {
    return x >= 0 && y >= 0 && x < LARGEUR && y < HAUTEUR ? this.cases[y * LARGEUR + x] : undefined;
  }
  bloc(x: number, y: number, largeur: number, hauteur: number, couleur: string): void {
    for (let dy = 0; dy < hauteur; dy++) for (let dx = 0; dx < largeur; dx++) this.poser(x + dx, y + dy, couleur);
  }
  /** Une grille de lettres posée à (x, y) : « . » laisse la case, chaque autre lettre prend sa couleur dans `couleurs`. */
  grille(x: number, y: number, lignes: readonly string[], couleurs: Readonly<Record<string, string>>): void {
    lignes.forEach((ligne, dy) => {
      for (let dx = 0; dx < ligne.length; dx++) {
        const couleur = couleurs[ligne[dx] ?? "."];
        if (couleur) this.poser(x + dx, y + dy, couleur);
      }
    });
  }
  /** Le décor fini. */
  decor(ombre: string): Decor {
    return { cases: this.cases, ombre };
  }
}
