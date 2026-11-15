/**
 * Les bannières du Gaulois (15 novembre 2026, demande du pilote : « un lot de bannières, dans le thème OpenFront, des
 * thèmes spéciaux, de tous les goûts », « avec un lot de rareté », « ça coûte 3 fois plus cher que les cosmétiques »,
 * « il pourra choisir la bannière qui s'affichera en faisant /gaulois ») : un fond de l'image de /gaulois, choisi par le
 * membre, à la place du décor de son lieu. Dessins originaux de Claude Fable 5.2 pour le clan [GAL], sans emprunt à une
 * œuvre existante ni aux images d'OpenFront (ni son logo, ni ses dessins : le thème, seulement).
 *
 * Une bannière se dessine sur la toile des décors (`../decors/commun.ts`) : 124 cases sur 80, une case vaut 4 pixels dans
 * l'image de 496 × 320. Elle est la même à chaque image : ni l'heure, ni le lieu, ni le hasard n'y changent rien.
 *
 * Le cadre de la rareté (`cadres.ts`), sur le bord des bannières épiques, mystiques et légendaires, fait partie du fond
 * (`dessinDeLaBanniere`). Ce qui se pose ensuite par-dessus, dans cet ordre (voir `ZONES`) :
 * - les insignes du membre (flamme de série, emblème de niveau), en haut à gauche, à droite du logo ;
 * - l'ombre du Gaulois (couleur `ombre` de la bannière), le Gaulois au milieu, les semelles sur la rangée `PIEDS`, et son
 *   familier à côté de lui quand il en montre un ;
 * - le logo du clan, dans le coin en haut à gauche (il couvre la troisième case du cadre dans ce coin).
 *
 * Un lot n'importe que ce fichier : il ne lit ni le réseau ni l'heure.
 */
import type { Decor } from "../decors/commun.ts";

export { GAULOIS, HAUTEUR, HORIZON, LARGEUR, LOGO, PIEDS, Toile, grain, melanger, type Decor } from "../decors/commun.ts";

/** Les cinq raretés, de la plus courante à la plus rare : celles des objets du Gaulois (`RARETES` de `../gaulois.ts`). */
export const RARETES_DES_BANNIERES = ["commun", "peu-commun", "epique", "mystique", "legendaire"] as const;
export type RareteDeBanniere = (typeof RARETES_DES_BANNIERES)[number];

/** Les familles de bannières, dans l'ordre de la boutique, et leur nom à l'écran. */
export const FAMILLES_DES_BANNIERES = {
  front: "Le front",
  mers: "Les mers",
  cartes: "Les cartes du monde",
  saisons: "Ciel, saisons et fêtes",
  legendes: "Légendes et styles",
} as const;
export type FamilleDeBanniere = keyof typeof FAMILLES_DES_BANNIERES;

/**
 * Une bannière d'un lot.
 * - `id` : en minuscules sans accent et tirets, sans chiffre (« frappe-atomique ») ; c'est lui que garde le serveur : il ne
 *   change jamais.
 * - `nom` : son nom à l'écran, court (32 signes au plus), sans nom d'une œuvre, d'une marque ou d'une personne.
 * - `description` : une phrase de 140 signes au plus, qui dit ce qu'on voit, pour qui ne voit pas l'image (texte de
 *   l'image sur Discord et sur le site). Elle commence par une majuscule et finit par un point.
 * - `dessiner` : la toile peinte, avec la couleur de l'ombre du Gaulois sur son sol. Appelée une seule fois par bannière.
 */
export interface BanniereDuLot {
  id: string;
  nom: string;
  rarete: RareteDeBanniere;
  famille: FamilleDeBanniere;
  description: string;
  dessiner: () => Decor;
}

/**
 * Les zones de la toile, en cases, pour qui dessine :
 * - `calme` : le coin en haut à gauche, où se posent le logo (18 × 18) puis les insignes, à sa droite, avec le nombre de
 *   victoires sous la flamme. Rien de vif ni de détaillé ici : un fond assez uni, pour que le logo et les insignes se lisent.
 * - `gaulois` : la grille du Gaulois (48 × 64, colonnes 38 à 85, rangées 10 à 73). Son corps n'en couvre que le milieu,
 *   une trentaine de colonnes : le reste de la grille laisse voir la bannière. Avec un familier, le groupe glisse vers la
 *   gauche, jusqu'à la colonne 11 au pire, et s'étend à droite : le sujet de la bannière ne doit pas dépendre du centre.
 * - `sol` : la bande où il se tient (rangées 60 à 79) ; il pose ses semelles sur la rangée `PIEDS` (72). Il lui faut un sol,
 *   même dans le ciel ou l'espace : une dalle, un nuage, une banquise, un pont, une coque…
 * - `bord` : les 3 cases du bord, que recouvre le cadre des bannières épiques, mystiques et légendaires.
 */
export const ZONES = {
  calme: { x: 0, y: 0, largeur: 46, hauteur: 24 },
  gaulois: { x: 38, y: 10, largeur: 48, hauteur: 64 },
  sol: { x: 0, y: 60, largeur: 124, hauteur: 20 },
  bord: 3,
} as const;

