/**
 * Le format commun des bâtiments du village, à la même échelle que les Gaulois (48 × 64 cases) : une porte fait environ
 * 72 cases de haut, un Gaulois peut y entrer. Chaque dessin est à lui seul, sans le sol ni le ciel autour : la case vide
 * (`null`) laisse voir le monde derrière. Le pied du bâtiment est sa dernière rangée, posée sur la ligne du sol du fond.
 */
import type { Decor } from "../decor";
import type { Lumiere } from "../lumiere";

export interface DessinDeBatiment {
  /** Largeur et hauteur du dessin fini, en cases. Au plus 240 de large et 170 de haut. */
  largeur: number;
  hauteur: number;
  /**
   * Le nombre d'images d'un mouvement lent (ailes du moulin, fumée du four, feuilles du chêne) : 1 si rien ne bouge. L'écran
   * passe d'une image à la suivante une fois par seconde au plus ; l'image 0 est celle qui reste quand tout est figé.
   */
  images: number;
  /** Le dessin fini à cette lumière (`couleurDuDehors` de `lumiere.ts`) ; ce qui éclaire (fenêtres, feu) garde sa couleur. */
  dessiner(lumiere: Lumiere, image: number): Decor;
}
