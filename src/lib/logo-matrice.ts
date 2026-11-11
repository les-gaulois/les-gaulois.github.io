/**
 * Le logo du guerrier « en mode Matrix », pour la Direction (style Terminal) : l'image est réduite à une grille, et chaque
 * case blanche, bleue ou rouge du logo devient un caractère (0, 1 ou une lettre du tag) de sa couleur. Le fond marine et
 * les contours sombres restent vides : c'est leur absence qui dessine les traits. Décoratif : aucune donnée.
 * L'image est lue au moment de la construction (`logo-matrice-image.ts`) ; tout ici est un calcul pur, testé.
 */

import { clan } from "../../config/clan";

export type Teinte = "w" | "b" | "r";

/** Une suite de cases voisines de même teinte, sur une rangée de la grille : un seul texte dans le dessin. */
export interface Suite {
  x: number;
  y: number;
  teinte: Teinte;
  texte: string;
}

export interface LogoMatriceData {
  colonnes: number;
  lignes: number;
  suites: Suite[];
  /** Le retard de chaque colonne quand les caractères tombent, en millisecondes (0 à LOGO_PLUIE_MAX). */
  delais: number[];
}

/** Plus de 0 et de 1 que de lettres du tag du clan (`config/clan.ts`). */
export const LOGO_GLYPHES = `0101100110${clan.tag}`;
export const LOGO_PLUIE_MAX = 900;

/**
 * La teinte d'un pixel : blanc, bleu ou rouge, ou `null` pour le fond marine, les contours sombres et les mélanges de
 * bord. Les seuils viennent du logo envoyé par le pilote le 11 novembre 2026 (fond #091337, bleu vif, rouge vif, blanc).
 */
export function teinte(r: number, g: number, b: number): Teinte | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 110) return null;
  if (min > 140 && max - min < 80) return "w";
  if (b >= r && b >= g && b - r > 60) return "b";
  if (r >= g && r >= b && r - g > 70) return "r";
  return min > 140 ? "w" : null;
}

/** Un tirage pseudo-aléatoire à graine : la même image donne le même logo à chaque construction du site. */
export function aleatoire(graine: number): () => number {
  let etat = graine >>> 0 || 1;
  return () => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
    return etat / 2 ** 32;
  };
}

/** Un caractère, pour un tirage `r` entre 0 et 1. */
export const glyphe = (r: number): string => LOGO_GLYPHES[Math.min(LOGO_GLYPHES.length - 1, Math.max(0, Math.floor(r * LOGO_GLYPHES.length)))] ?? "0";

/**
 * La grille du logo, à partir des pixels bruts d'une image déjà réduite à `largeur` × `hauteur` (une case par pixel ;
 * `canaux` : 3 ou 4 octets par pixel). Les suites se lisent rangée par rangée, de gauche à droite.
 */
export function logoMatrice(pixels: ArrayLike<number>, largeur: number, hauteur: number, canaux: number, graine = 7): LogoMatriceData {
  const hasard = aleatoire(graine);
  const suites: Suite[] = [];
  for (let y = 0; y < hauteur; y++) {
    let courante: Suite | null = null;
    for (let x = 0; x < largeur; x++) {
      const i = (y * largeur + x) * canaux;
      const t = teinte(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
      if (!t) {
        courante = null;
        continue;
      }
      if (courante && courante.teinte === t) {
        courante.texte += glyphe(hasard());
        continue;
      }
      courante = { x, y, teinte: t, texte: glyphe(hasard()) };
      suites.push(courante);
    }
  }
  const delais = Array.from({ length: largeur }, () => Math.round(hasard() * LOGO_PLUIE_MAX));
  return { colonnes: largeur, lignes: hauteur, suites, delais };
}
