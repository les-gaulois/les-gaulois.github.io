/**
 * Le plan du monde du village (demande du pilote, 14 novembre 2026 : « un vrai univers où les persos se déplacent sans
 * avoir à changer de page ») : un seul panorama, de l'ouest à l'est, où tous les lieux sont côte à côte le long du chemin.
 * Ici, seulement des mesures en cases : où est chaque quartier, chaque bâtiment, chaque lieu de vie. Le dessin est dans
 * `pieces.ts` et `composition.ts`, les places des Gaulois dans `postes.ts`.
 *
 * L'ordre, d'ouest en est : la lisière, le ruisseau (le moulin, le pont, le lavoir), le rempart, les maisons (le potager,
 * trois maisons ouvertes, l'étable), la place (le grand chêne, le puits, le grand feu, le four à pain, la grande tour du
 * clan), la taverne (et le grenier), la forge (et le colombier), la salle de réunion, le marché (l'étal, sous la halle), la
 * tour de guet et la palissade avec la porte, puis le champ de bataille hors du village et le camp d'en face.
 *
 * Les dessins des bâtiments du chantier et de la forge sont faits par d'autres, et leurs tailles changeront : le plan lit
 * la largeur et la hauteur de chaque dessin (`Tailles`), il ne les suppose jamais. Design : Claude Fable 5.2.
 */
import type { BatimentId } from "../chantier-liste";
import type { Lieu } from "../vie";

/** La hauteur du monde, en cases : le ciel est derrière, sur sa propre toile. */
export const MONDE_HAUTEUR = 400;
/** La ligne du sol du fond : la rangée où reposent les bâtiments. Dessous, l'herbe et le chemin où marchent les Gaulois. */
export const LIGNE = 300;
/** La rangée où repose le pied d'un bâtiment : deux rangées dans l'herbe, pour qu'il ne flotte pas. */
export const PIED = LIGNE + 1;
/** Le plancher d'un intérieur ouvert : la rangée sous les pieds de ceux qui s'y trouvent. */
export const PLANCHER = PIED - 4;
/** La bande où marchent les Gaulois : les rangées de leurs pieds, de la plus lointaine à la plus proche. */
export const BANDE_HAUT = 326;
export const BANDE_BAS = 372;
/** La largeur d'une tuile du décor, en cases : le monde est peint par morceaux, pour tout navigateur. */
export const TUILE = 512;

/** La taille d'un dessin fait par un autre (bâtiment du chantier, forge), en cases. */
export interface Taille {
  largeur: number;
  hauteur: number;
}
export type Tailles = Readonly<Record<BatimentId | "forge", Taille>>;

export type QuartierId = "ruisseau" | "maisons" | "place" | "taverne" | "forge" | "reunion" | "marche" | "bataille";

/** Un quartier : une portion du panorama qui a un nom, pour la petite carte et les boutons qui y mènent. */
export interface Quartier {
  id: QuartierId;
  nom: string;
  /** Le lieu de vie (`vie.ts`) qui s'y trouve, s'il y en a un. */
  lieu: Lieu | null;
  x: number;
  largeur: number;
  /** La colonne que la caméra met au milieu de l'écran quand on y va. */
  vue: number;
}

/** Ce que le décor dessine à un emplacement. */
export type Piece =
  | { sorte: "batiment"; id: BatimentId }
  | { sorte: "forge" }
  | { sorte: "maison"; rang: 0 | 1 | 2 }
  | { sorte: "taverne" }
  | { sorte: "reunion" }
  | { sorte: "etal" }
  | { sorte: "camp" };

/** Un emplacement du panorama : la boîte d'un dessin, son coin haut gauche en `x`, sa dernière rangée en `pied`. */
export interface Emplacement {
  piece: Piece;
  quartier: QuartierId;
  x: number;
  largeur: number;
  hauteur: number;
  pied: number;
}

/** Les tailles des pièces dessinées ici (`pieces.ts`). */
export const MAISON: Taille = { largeur: 178, hauteur: 180 };
export const TAVERNE: Taille = { largeur: 372, hauteur: 186 };
export const REUNION: Taille = { largeur: 372, hauteur: 190 };
export const ETAL: Taille = { largeur: 124, hauteur: 96 };
export const CAMP: Taille = { largeur: 300, hauteur: 110 };
/** La lisière de la forêt, aux deux bouts du monde. */
export const LISIERE = 150;
/** La clairière du grand feu, et le pré du champ de bataille. */
const CLAIRIERE = 290;
const PRE = 430;

export interface Plan {
  largeur: number;
  quartiers: Quartier[];
  emplacements: Emplacement[];
  /** Le grand feu : la colonne de son milieu, et la rangée où reposent ses pierres (un peu en avant des bâtiments). */
  feu: { x: number; pied: number };
  /** Le ruisseau : la colonne de son milieu et sa largeur à la hauteur du pont, en cases. */
  ruisseau: { x: number; largeur: number };
  /** Le chemin : de la colonne où il sort de la forêt à celle où il se perd dans le pré. */
  chemin: { de: number; a: number };
  /** Le dedans du village, où se promènent ceux de la place : de la rive du ruisseau à la porte. */
  village: { de: number; a: number };
  /** Le pré du champ de bataille. */
  pre: { x: number; largeur: number };
}

const NOMS: Readonly<Record<QuartierId, { nom: string; lieu: Lieu | null }>> = {
  ruisseau: { nom: "Le ruisseau", lieu: null },
  maisons: { nom: "Les maisons", lieu: "maisons" },
  place: { nom: "La place", lieu: "place" },
  taverne: { nom: "La taverne", lieu: "taverne" },
  forge: { nom: "La forge", lieu: null },
  reunion: { nom: "La salle de réunion", lieu: "reunion" },
  marche: { nom: "Le marché", lieu: null },
  bataille: { nom: "Le champ de bataille", lieu: "bataille" },
};

/** Le pied du pont : dans la bande de l'avant, là où le ruisseau est assez large pour qu'on l'enjambe. */
export const PIED_DU_PONT = LIGNE + 34;

/**
 * Le plan, pour ces tailles de dessins. Tout se suit de gauche à droite : changer la taille d'un dessin pousse ce qui est
 * à sa droite, rien ne se chevauche.
 */
export function planDuMonde(tailles: Tailles): Plan {
  const emplacements: Emplacement[] = [];
  const quartiers: Quartier[] = [];
  let x = LISIERE;
  let debut = x;
  let quartier: QuartierId = "ruisseau";
  let vue: number | null = null;

  const espace = (cases: number): void => {
    x += cases;
  };
  const poser = (piece: Piece, taille: Taille, pied = PIED): Emplacement => {
    const emplacement: Emplacement = { piece, quartier, x, largeur: taille.largeur, hauteur: taille.hauteur, pied };
    emplacements.push(emplacement);
    x += taille.largeur;
    return emplacement;
  };
  const batiment = (id: BatimentId): Emplacement => poser({ sorte: "batiment", id }, tailles[id]);
  const milieu = (e: Emplacement): number => e.x + Math.floor(e.largeur / 2);
  const fermer = (suivant: QuartierId | null): void => {
    quartiers.push({ id: quartier, ...NOMS[quartier], x: debut, largeur: x - debut, vue: vue ?? debut + Math.floor((x - debut) / 2) });
    debut = x;
    vue = null;
    if (suivant) quartier = suivant;
  };

  // Le ruisseau, à l'ouest, hors du village : le moulin sur une rive, le lavoir sur l'autre, le pont entre les deux.
  const cheminDe = x - 40;
  espace(30);
  batiment("moulin");
  espace(14);
  const pont = tailles.pont;
  const lit = Math.max(56, Math.round(pont.largeur * 0.62));
  const rive = x;
  const ruisseau = { x: rive + Math.floor(lit / 2) + 12, largeur: lit };
  // Le pont enjambe le ruisseau, centré sur lui, les deux culées sur les rives.
  emplacements.push({ piece: { sorte: "batiment", id: "pont" }, quartier, x: ruisseau.x - Math.floor(pont.largeur / 2), largeur: pont.largeur, hauteur: pont.hauteur, pied: PIED_DU_PONT });
  x = rive + lit + 24;
  vue = ruisseau.x;
  espace(14);
  batiment("lavoir");
  espace(36);
  fermer("maisons");

  // Les maisons : le rempart ferme le village côté ruisseau, puis le potager, trois maisons ouvertes, l'étable.
  const villageDe = x;
  batiment("rempart");
  espace(34);
  batiment("potager");
  espace(30);
  poser({ sorte: "maison", rang: 0 }, MAISON);
  espace(12);
  vue = milieu(poser({ sorte: "maison", rang: 1 }, MAISON));
  espace(12);
  poser({ sorte: "maison", rang: 2 }, MAISON);
  espace(30);
  batiment("etable");
  espace(40);
  fermer("place");

  // La place : le grand chêne et le puits d'un côté, le grand feu au milieu de sa clairière, le four et la grande tour de l'autre.
  batiment("chene");
  espace(28);
  batiment("puits");
  espace(20);
  const feu = { x: x + Math.floor(CLAIRIERE / 2), pied: LIGNE + 30 };
  vue = feu.x;
  espace(CLAIRIERE);
  espace(20);
  batiment("four");
  espace(34);
  batiment("grande-tour");
  espace(40);
  fermer("taverne");

  vue = milieu(poser({ sorte: "taverne" }, TAVERNE));
  espace(30);
  batiment("grenier");
  espace(40);
  fermer("forge");

  vue = milieu(poser({ sorte: "forge" }, tailles.forge));
  espace(34);
  batiment("colombier");
  espace(40);
  fermer("reunion");

  vue = milieu(poser({ sorte: "reunion" }, REUNION));
  espace(44);
  fermer("marche");

  // Le marché : l'étal, la halle ; puis la tour de guet contre la palissade, dont la porte mène au champ de bataille.
  // L'étal est là dès le départ ; la halle se bâtit autour de lui, il se retrouve sous son toit.
  const halleX = x + Math.max(0, Math.floor((ETAL.largeur - tailles.halle.largeur) / 2));
  emplacements.push({ piece: { sorte: "etal" }, quartier, x: halleX + Math.floor((tailles.halle.largeur - ETAL.largeur) / 2), largeur: ETAL.largeur, hauteur: ETAL.hauteur, pied: PIED });
  x = halleX;
  const halle = batiment("halle");
  x = Math.max(x, halleX + ETAL.largeur);
  vue = milieu(halle);
  espace(40);
  batiment("tour");
  espace(12);
  const palissade = batiment("palissade");
  const villageA = palissade.x + palissade.largeur;
  fermer("bataille");

  // Hors du village : le pré où l'on se bat, et au loin le camp d'en face.
  espace(30);
  const pre = { x, largeur: PRE };
  vue = x + 250;
  espace(PRE);
  poser({ sorte: "camp" }, CAMP);
  const cheminA = pre.x + 150;
  espace(10);
  fermer(null);

  return { largeur: x + LISIERE, quartiers, emplacements, feu, ruisseau, chemin: { de: cheminDe, a: cheminA }, village: { de: villageDe, a: villageA }, pre };
}

/** L'emplacement d'un bâtiment du chantier. */
export function emplacementDuBatiment(plan: Plan, id: BatimentId): Emplacement {
  return plan.emplacements.find((e) => e.piece.sorte === "batiment" && e.piece.id === id)!;
}

/** Les emplacements d'une sorte de pièce, d'ouest en est. */
export function emplacementsDe(plan: Plan, sorte: Piece["sorte"]): Emplacement[] {
  return plan.emplacements.filter((e) => e.piece.sorte === sorte);
}

/** Le quartier où tombe une colonne du monde ; aux deux bouts, le plus proche. */
export function quartierDe(plan: Plan, x: number): Quartier {
  return plan.quartiers.find((q) => x < q.x + q.largeur) ?? plan.quartiers[plan.quartiers.length - 1]!;
}

/** Le quartier d'un lieu de vie. */
export function quartierDuLieu(plan: Plan, lieu: Lieu): Quartier {
  return plan.quartiers.find((q) => q.lieu === lieu)!;
}
