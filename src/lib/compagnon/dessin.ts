/**
 * Les images du Gaulois compagnon, en cases : debout, un pied levé, l'autre, les yeux fermés, puis couché dans son lit
 * (deux images : sa couverture se soulève). Rien n'est dessiné ici : les poses sont celles du village
 * (`src/lib/village/poses.ts`), à partir des cases de `casesDuGaulois`.
 *
 * Ce fichier porte tout le dessin du Gaulois (`gaulois.ts`) : `src/scripts/compagnon.ts` ne le charge qu'à la demande,
 * une fois par onglet, puis garde les images peintes. Ne pas l'importer depuis un script chargé sur chaque page.
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, lireTenue, type Tenue } from "../gaulois";
import { LIT_HAUTEUR, LIT_LARGEUR, fermerLesYeux, poseCouche, poseDeMarche, sansArme } from "../village/poses";

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

export function dessinDuCompagnon(brute: unknown): DessinDuCompagnon {
  const { tenue, deDepart } = tenueDuCompagnon(brute);
  const debout = casesDuGaulois(tenue);
  const couche = casesDuGaulois(sansArme(tenue));
  return {
    gaulois: { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, images: [debout, poseDeMarche(debout, "gauche"), poseDeMarche(debout, "droite"), fermerLesYeux(debout)] },
    lit: { largeur: LIT_LARGEUR, hauteur: LIT_HAUTEUR, images: [poseCouche(couche, 0, 0).cases, poseCouche(couche, 1, 0).cases] },
    deDepart,
  };
}
