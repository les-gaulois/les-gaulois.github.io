/**
 * Les images du Gaulois compagnon, en cases : debout, un pied levé, l'autre, les yeux fermés, puis couché dans son lit
 * (deux images : sa couverture se soulève). Rien n'est dessiné ici : les poses sont celles du village
 * (`src/lib/village/poses.ts`), à partir des cases de `casesDuGaulois`.
 *
 * Ce fichier porte tout le dessin du Gaulois (`gaulois.ts`) : `src/scripts/compagnon.ts` ne le charge que pour un membre
 * connecté qui a son propre Gaulois, une fois par onglet, puis garde les images peintes. Le Gaulois de départ, lui, est
 * peint à la construction du site (`src/pages/compagnon/[planche].png.ts`) : un visiteur ne télécharge pas ce dessin.
 * Ne pas l'importer depuis un script chargé sur chaque page.
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, lireTenue, type Tenue } from "../gaulois";
import { LIT_HAUTEUR, LIT_LARGEUR, casesDesPieds, poseCouche, poseDeMarche } from "../village/poses";

type Cases = readonly (string | null)[];

export interface Planche {
  largeur: number;
  hauteur: number;
  images: Cases[];
}

export interface DessinDuCompagnon {
  /** Debout, pied gauche levé, pied droit levé, yeux fermés : l'ordre de `IMAGES` (`mouvement.ts`). */
  gaulois: Planche;
  /** Couché, couverture basse puis soulevée. */
  lit: Planche;
  /** Le Gaulois de départ : personne ne l'a habillé. */
  deDepart: boolean;
}

/** La tenue à dessiner : celle qu'on lui donne si elle est complète et connue du catalogue, sinon celle de départ. */
export function tenueDuCompagnon(brute: unknown): { tenue: Tenue; deDepart: boolean } {
  const lue = lireTenue(brute);
  return lue ? { tenue: lue, deDepart: false } : { tenue: TENUE_DE_DEPART, deDepart: true };
}

/**
 * Une planche en pixels RGBA : ses images côte à côte, de gauche à droite, une case par pixel, transparent là où la case
 * est vide. La disposition que peint `src/scripts/compagnon.ts` et que montre le CSS (`background-position`).
 */
export function rgbaDeLaPlanche(planche: Planche): Uint8Array {
  const largeur = planche.largeur * planche.images.length;
  const rgba = new Uint8Array(largeur * planche.hauteur * 4);
  planche.images.forEach((cases, rang) => {
    cases.forEach((couleur, i) => {
      if (!couleur) return;
      const o = (Math.floor(i / planche.largeur) * largeur + rang * planche.largeur + (i % planche.largeur)) * 4;
      rgba[o] = parseInt(couleur.slice(1, 3), 16);
      rgba[o + 1] = parseInt(couleur.slice(3, 5), 16);
      rgba[o + 2] = parseInt(couleur.slice(5, 7), 16);
      rgba[o + 3] = 255;
    });
  });
  return rgba;
}

export function dessinDuCompagnon(brute: unknown): DessinDuCompagnon {
  const { tenue, deDepart } = tenueDuCompagnon(brute);
  const debout = casesDuGaulois(tenue);
  // Les chaussures entières se lèvent avec la jambe (raquettes, patins), comme au village.
  const pieds = casesDesPieds(tenue);
  return {
    gaulois: { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, images: [debout, poseDeMarche(debout, "gauche", pieds), poseDeMarche(debout, "droite", pieds), casesDuGaulois(tenue, { yeuxFermes: true })] },
    lit: { largeur: LIT_LARGEUR, hauteur: LIT_HAUTEUR, images: [poseCouche(tenue, 0, 0).cases, poseCouche(tenue, 1, 0).cases] },
    deDepart,
  };
}
