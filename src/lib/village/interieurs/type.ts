/**
 * Les intérieurs des bâtiments du chantier (demande du pilote, 15 novembre 2026, idée « Entrer dans les bâtiments » de
 * Claude Fable 5.2). Un clic sur un bâtiment fini ouvre une fenêtre du monde avec son dedans, dessiné case par case et
 * vu de côté comme une maison de poupée. Le Gaulois du visiteur s'y tient, s'il en a un.
 *
 * Rien n'y dit un chiffre, rien n'y bouge vite, et rien ne clignote. Un bâtiment pas encore fini ne s'ouvre pas : son
 * intérieur se découvre le jour où les points rapportés au clan le terminent. Design : Claude Fable 5.2.
 */
import type { BatimentId } from "../chantier-liste";
import type { Decor } from "../decor";
import type { Lumiere } from "../lumiere";

/**
 * Les bâtiments qui ont un vrai dedans, dans l'ordre du chantier. La palissade, le puits, le potager, le pont, le lavoir,
 * la halle (ouverte entre ses poteaux), le grand chêne et le rempart n'en ont pas.
 */
export const BATIMENTS_A_INTERIEUR = ["four", "tour", "grenier", "moulin", "colombier", "etable", "grande-tour"] as const satisfies readonly BatimentId[];
export type InterieurId = (typeof BATIMENTS_A_INTERIEUR)[number];

/** Les bornes d'un dessin d'intérieur, en cases à l'échelle des Gaulois (48 × 64). */
export const INTERIEUR_LARGEUR = { min: 320, max: 480 } as const;
export const INTERIEUR_HAUTEUR = { min: 180, max: 270 } as const;
/** Le plus d'images d'un mouvement lent ; l'écran passe d'une image à la suivante une fois par seconde au plus. */
export const INTERIEUR_IMAGES_MAX = 4;

export interface DessinDInterieur {
  id: InterieurId;
  /** Le titre de la fenêtre, en français : « Dans le moulin ». */
  titre: string;
  /** Largeur et hauteur du dessin, en cases, dans les bornes ci-dessus. */
  largeur: number;
  hauteur: number;
  /** Le nombre d'images du mouvement lent (meule, braises, pigeons) : 1 si rien ne bouge. L'image 0 reste quand tout est figé. */
  images: number;
  /**
   * Où se tient le Gaulois du visiteur : la colonne de son milieu et la rangée de ses pieds (la dernière rangée de ses
   * 64 cases), dans le dessin. Il est peint par-dessus, tourné vers la droite, et rien du dessin ne passe devant lui.
   */
  place: { x: number; pied: number };
  /**
   * Le dedans à cette lumière. Ce qui éclaire (braises, lanterne, fenêtre au soleil) garde sa couleur ; le reste suit
   * `couleurDuDedans` ou `couleurDuDehors` de `lumiere.ts`. Toutes les cases sont pleines : pas de vide, la fenêtre
   * n'a rien derrière.
   */
  dessiner(lumiere: Lumiere, image: number): Decor;
}
