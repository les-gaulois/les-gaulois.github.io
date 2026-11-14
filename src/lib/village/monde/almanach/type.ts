/**
 * L'almanach des petits moments du village (demande du pilote, 15 novembre 2026, idée de Claude Fable 5.2, « 650 »).
 * De temps en temps, un moment rare passe dans le monde : une charrette de foin, un vol d'oies, la brume du matin sur le
 * ruisseau. C'est un décor animé, comme les événements d'OpenFront (`../evenements.ts`) : rien ne vient d'une vraie
 * partie ni d'un membre, rien ne change une valeur, aucun texte ne s'affiche, et rien ne se passe en pause ni avec
 * « réduire les animations ».
 *
 * Deux parts :
 * - les figurants (`figurants.ts`) : les dessins, case par case, de ce qui peut passer (bêtes, oiseaux, brume, gens qui ne
 *   sont pas des membres), dessinés par Claude Fable 5.2 ;
 * - les moments (`moments.json`) : 650 petites scènes qui disent quel figurant passe où, quand et par quel chemin,
 *   écrites une fois par Claude Fable 5.2 par l'API Claude, puis contrôlées par le code (`moment.ts`) avant d'être gardées.
 *
 * Ici, ce qu'est un figurant : le contrat entre son dessinateur, l'API qui écrit les moments et le moteur qui les joue.
 */
import type { Decor } from "../../decor";
import type { Lumiere, Phase } from "../../lumiere";

/**
 * Où un figurant peut se trouver : sur le sol (il y pose ses pieds), sur l'eau (ruisseau, lavoir, port, mer), dans le
 * ciel (au-dessus des toits), posé sur un toit ou un mur, ou en nappe (brume, pluie fine, feuilles qui tombent).
 */
export type Milieu = "sol" | "eau" | "ciel" | "toit" | "nappe";

/** Son allure : immobile (posé, il ne fait que ses images), lente, au pas, ou en vol. Le moteur en tire sa vitesse la plus haute. */
export type Allure = "posee" | "lente" | "pas" | "vol";

export interface Figurant {
  /** Son identifiant, en minuscules et tirets : « vol-d-oies ». */
  id: string;
  /** Ce qu'il est, en quelques mots : « un vol d'oies en V ». */
  nom: string;
  /**
   * Ce qu'il fait et où il a du sens, en une ou deux phrases, pour la consigne de l'API qui écrit les moments : « Sept
   * oies en V, ailes qui battent lentement ; traverse le ciel d'un bord à l'autre, plutôt à l'aube ou au crépuscule. »
   */
  description: string;
  milieu: Milieu;
  allure: Allure;
  /** Les moments de la journée où il a du sens (la chouette : nuit) ; absent : tous. */
  quand?: readonly Phase[];
  /** Taille du dessin en cases, à l'échelle des Gaulois (48 × 64), et le nombre d'images de son mouvement (1 à 4). */
  largeur: number;
  hauteur: number;
  images: number;
  /**
   * Le dessin à cette lumière, tourné vers la droite (le moteur le retourne pour aller à gauche). La case vide (`null`)
   * laisse voir le monde. Le pied du dessin est sa dernière rangée.
   */
  dessiner(lumiere: Lumiere, image: number): Decor;
}
