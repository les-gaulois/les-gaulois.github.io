/**
 * Le plan du monde du village (demandes du pilote, 14 novembre 2026 : « un vrai univers où les persos se déplacent sans
 * avoir à changer de page », puis « un monde vivant qui pourra accueillir jusqu'à 1000 membres gaulois » et « des éléments
 * OpenFront, bateaux, usine, train, missile »). Ici, seulement des mesures en cases : où est chaque étage, chaque quartier,
 * chaque bâtiment. Le dessin est dans `pieces.ts` et `composition.ts`, les places des Gaulois dans `postes.ts`.
 *
 * Le monde est une colline vue de face, en étages. Du haut vers le bas :
 * - le ciel et les lointains ;
 * - les **terrasses** : des rues de maisons étagées sur la colline. Chaque maison a 4 lits ; il y en a une par tranche de
 *   4 Gaulois (trois au moins). Les trois premières sont sur la grand-rue, les suivantes garnissent les terrasses, du
 *   milieu vers les côtés, une terrasse de plus quand la précédente est pleine ;
 * - la **grand-rue** (l'étage 0) : d'ouest en est, la lisière, le ruisseau (le moulin, le pont, le lavoir), le rempart,
 *   les maisons (le potager, trois maisons, l'étable), la place (le grand chêne, le puits, le grand feu, le four, la
 *   grande tour), la taverne et sa terrasse de tables (le grenier), la forge (le colombier), la salle de réunion et ses
 *   bancs, le marché (l'étal, sous la halle), la tour de guet, la palissade et sa porte, le poste de défense, le champ de
 *   bataille, le camp d'en face ;
 * - le **bas** : la voie ferrée (un viaduc sur le ravin du ruisseau), la gare, l'usine, le silo, la batterie, puis le port
 *   et la mer, à l'est, où mouillent nos navires et où paraît le navire d'en face.
 *
 * Tout dépend du seul nombre de Gaulois du village (de 0 à 1 000) : le même nombre donne le même monde. La terrasse de la
 * taverne, les bancs de la salle de réunion et le champ de bataille grandissent avec lui (un quart, un cinquième et un
 * cinquième des Gaulois y tiennent à l'aise), pas avec ceux qui s'y trouvent : le monde ne bouge pas d'une relecture à
 * l'autre. Les dessins faits par d'autres changent de taille : le plan lit leur largeur et leur hauteur (`Tailles`).
 *
 * Chaque étage se dessine dans son propre repère, celui de la grand-rue (la ligne du fond à la rangée 300), puis se pose
 * dans le monde à sa hauteur (`dy`). Design : Claude Fable 5.2.
 */
import type { BatimentId } from "../chantier-liste";
import type { PieceOpenFrontId } from "../openfront";
import type { Lieu } from "../vie";

/** Dans le repère d'un étage : la ligne du fond, la rangée où reposent les bâtiments. */
export const LIGNE = 300;
/** La rangée où repose le pied d'un bâtiment : deux rangées dans l'herbe, pour qu'il ne flotte pas. */
export const PIED = LIGNE + 1;
/** Le plancher d'un intérieur ouvert : la rangée sous les pieds de ceux qui s'y trouvent. */
export const PLANCHER = PIED - 4;
/** La bande où marchent les Gaulois de la grand-rue : les rangées de leurs pieds, de la plus lointaine à la plus proche. */
export const BANDE_HAUT = 326;
export const BANDE_BAS = 372;
/** La hauteur de la grand-rue dans son repère : dessous commence la pente qui descend vers le bas. */
export const RUE_HAUTEUR = 400;
/** Sur une terrasse : la bande où l'on marche, puis le mur de soutènement. */
export const TERRASSE_BANDE_HAUT = 318;
export const TERRASSE_BANDE_BAS = 350;
export const TERRASSE_MUR = 360;
export const TERRASSE_FIN = 372;
/** L'écart entre deux terrasses, et entre la plus haute ligne et le haut du monde (le ciel). */
export const PAS_DE_TERRASSE = 250;
export const CIEL = 330;
/** De combien le bas est plus bas que la grand-rue ; dans son repère, la rangée du dessus des rails et celle de la mer. */
export const DESCENTE = 360;
export const RAIL = LIGNE + 4;
export const MER = LIGNE + 30;
/** La rangée où la mer touche le pied de la falaise, au fond. */
export const MER_FOND = LIGNE - 38;
/** Le pré du bas, devant la voie : les rangées où l'on y marche. */
export const BAS_BANDE_HAUT = 340;
export const BAS_BANDE_BAS = 388;
/** Le côté d'une tuile du décor, en cases : le monde est peint par morceaux, et seulement ceux qu'on voit. */
export const TUILE = 512;
/** Le village accueille jusqu'à ce nombre de Gaulois. */
export const HABITANTS_MAX = 1000;
/** Les lits d'une maison. */
export const LITS_PAR_MAISON = 4;

/** La taille d'un dessin fait par un autre (bâtiment du chantier, forge, pièce d'OpenFront), en cases. */
export interface Taille {
  largeur: number;
  hauteur: number;
}
export type Tailles = Readonly<Record<BatimentId | "forge" | PieceOpenFrontId, Taille>>;

export type QuartierId = "ruisseau" | "maisons" | "place" | "taverne" | "forge" | "reunion" | "marche" | "bataille" | "gare" | "usine" | "port";

/** Un quartier : une portion du monde qui a un nom, pour la petite carte et les boutons qui y mènent. */
export interface Quartier {
  id: QuartierId;
  nom: string;
  /** Le lieu de vie (`vie.ts`) qui s'y trouve, s'il y en a un. */
  lieu: Lieu | null;
  x: number;
  largeur: number;
  /** La colonne et la rangée du monde que la caméra met au milieu de l'écran quand on y va. */
  vue: number;
  vueY: number;
}

/** Ce que le décor dessine à un emplacement. */
export type Piece =
  | { sorte: "batiment"; id: BatimentId }
  | { sorte: "forge" }
  | { sorte: "maison"; rang: number }
  | { sorte: "taverne" }
  | { sorte: "reunion" }
  | { sorte: "etal" }
  | { sorte: "camp" }
  | { sorte: "openfront"; id: PieceOpenFrontId };

/**
 * Un emplacement : la boîte d'un dessin dans le repère de son étage (son coin haut gauche en `x`, sa dernière rangée en
 * `pied`), et la hauteur de cet étage dans le monde (`dy`).
 */
export interface Emplacement {
  piece: Piece;
  quartier: QuartierId;
  x: number;
  largeur: number;
  hauteur: number;
  pied: number;
  dy: number;
}

/** La première rangée d'un emplacement, dans le monde. */
export const hautDansLeMonde = (e: Pick<Emplacement, "dy" | "pied" | "hauteur">): number => e.dy + e.pied - e.hauteur + 1;

/** Les tailles des pièces dessinées ici (`pieces.ts`). */
export const MAISON: Taille = { largeur: 178, hauteur: 180 };
export const TAVERNE: Taille = { largeur: 372, hauteur: 186 };
export const REUNION: Taille = { largeur: 372, hauteur: 190 };
export const ETAL: Taille = { largeur: 124, hauteur: 96 };
export const CAMP: Taille = { largeur: 300, hauteur: 110 };
/** La lisière de la forêt, aux deux bouts de la grand-rue. */
export const LISIERE = 150;
/** La clairière du grand feu, et le plus petit pré du champ de bataille. */
const CLAIRIERE = 290;
const PRE = 430;
/** L'écart entre deux maisons d'une terrasse, et entre deux sièges du dehors (terrasse de la taverne, bancs de la réunion). */
const PAS_DE_MAISON = MAISON.largeur + 12;
export const SIEGE_DEHORS = 34;
/** Les sièges du dedans d'une salle : au-delà, on s'assoit dehors. */
export const SIEGES_DEDANS = 15;
/** La mer, à l'est du port : sa largeur. */
const LARGE = 1500;

/** Un coin de sièges dehors : sa colonne de gauche, le nombre de sièges de chacun de ses deux rangs, et leur total. */
export interface Dehors {
  x: number;
  parRang: number;
  sieges: number;
}

/** Un escalier : la colonne de son milieu, et l'étage d'où il descend (0 : de la grand-rue vers le bas). */
export interface Escalier {
  x: number;
  de: number;
}

export interface Plan {
  largeur: number;
  hauteur: number;
  /** Le nombre de Gaulois pour lequel le monde est bâti, et le nombre de ses maisons. */
  habitants: number;
  maisons: number;
  /** Le nombre de terrasses au-dessus de la grand-rue, et la hauteur de la grand-rue et du bas dans le monde. */
  terrasses: number;
  dy0: number;
  dyBas: number;
  quartiers: Quartier[];
  emplacements: Emplacement[];
  escaliers: Escalier[];
  /** Le grand feu : la colonne de son milieu, et la rangée (dans la grand-rue) où reposent ses pierres. */
  feu: { x: number; pied: number };
  /** Le ruisseau : la colonne de son milieu et sa largeur à la hauteur du pont, en cases. */
  ruisseau: { x: number; largeur: number };
  /** Le chemin de la grand-rue : de la colonne où il sort de la forêt à celle où il se perd dans le pré. */
  chemin: { de: number; a: number };
  /** Le dedans du village : de la rive du ruisseau à la porte. Les terrasses le surplombent. */
  village: { de: number; a: number };
  /** Le pré du champ de bataille, et la colonne du front : les Gaulois à sa gauche, ceux d'en face à sa droite. */
  pre: { x: number; largeur: number; front: number; parRang: number; pas: number };
  /** La terrasse de tables de la taverne, et les bancs dehors de la salle de réunion. */
  terrasse: Dehors;
  bancs: Dehors;
  /** La fin de la grand-rue : au-delà, à l'est, la forêt jusqu'au bord du monde. */
  finDeLaRue: number;
  /** Le bas : où finit la voie, où commence la mer, et la ligne de flottaison de chaque navire (dans le repère du bas). */
  voie: { de: number; a: number };
  mer: { de: number; a: number };
  navires: { id: "navire-transport" | "navire-guerre" | "navire-commerce" | "navire-ennemi"; x: number; flottaison: number }[];
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
  gare: { nom: "La gare", lieu: null },
  usine: { nom: "L'usine et le silo", lieu: null },
  port: { nom: "Le port", lieu: null },
};

/** Le pied du pont : dans la bande de l'avant, là où le ruisseau est assez large pour qu'on l'enjambe. */
export const PIED_DU_PONT = LIGNE + 34;

/** Le nombre de maisons du village pour ce nombre de Gaulois : une par tranche de 4, trois au moins. */
export function maisonsPour(habitants: number): number {
  return Math.max(3, Math.ceil(Math.min(HABITANTS_MAX, Math.max(0, habitants)) / LITS_PAR_MAISON));
}

/** La hauteur d'une terrasse dans le monde : la première est juste au-dessus de la grand-rue. */
export const dyDeLaTerrasse = (plan: Pick<Plan, "dy0">, terrasse: number): number => plan.dy0 - terrasse * PAS_DE_TERRASSE;

/** La colonne de l'escalier qui descend de la terrasse `t` : d'un côté puis de l'autre du grand feu, d'un étage à l'autre. */
const escalierDe = (feuX: number, t: number): number => feuX + (t % 2 === 1 ? 112 : -112);

/**
 * Le plan, pour ces tailles de dessins et ce nombre de Gaulois. Sur la grand-rue, tout se suit de gauche à droite :
 * changer la taille d'un dessin pousse ce qui est à sa droite, rien ne se chevauche.
 */
export function planDuMonde(tailles: Tailles, habitantsDemandes = 0): Plan {
  const habitants = Math.min(HABITANTS_MAX, Math.max(0, Math.floor(habitantsDemandes)));
  const maisons = maisonsPour(habitants);
  const emplacements: Emplacement[] = [];
  const quartiers: Quartier[] = [];
  let x = LISIERE;
  let debut = x;
  let quartier: QuartierId = "ruisseau";
  let vue: number | null = null;

  const espace = (cases: number): void => {
    x += cases;
  };
  // Les étages se posent à la fin, quand on sait combien il y a de terrasses : `dy` est rempli alors.
  const poser = (piece: Piece, taille: Taille, pied = PIED): Emplacement => {
    const emplacement: Emplacement = { piece, quartier, x, largeur: taille.largeur, hauteur: taille.hauteur, pied, dy: 0 };
    emplacements.push(emplacement);
    x += taille.largeur;
    return emplacement;
  };
  const batiment = (id: BatimentId): Emplacement => poser({ sorte: "batiment", id }, tailles[id]);
  const milieu = (e: Emplacement): number => e.x + Math.floor(e.largeur / 2);
  const fermer = (suivant: QuartierId | null): void => {
    quartiers.push({ id: quartier, ...NOMS[quartier], x: debut, largeur: x - debut, vue: vue ?? debut + Math.floor((x - debut) / 2), vueY: 0 });
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
  emplacements.push({ piece: { sorte: "batiment", id: "pont" }, quartier, x: ruisseau.x - Math.floor(pont.largeur / 2), largeur: pont.largeur, hauteur: pont.hauteur, pied: PIED_DU_PONT, dy: 0 });
  x = rive + lit + 24;
  vue = ruisseau.x;
  espace(14);
  batiment("lavoir");
  espace(36);
  fermer("maisons");

  // Les maisons : le rempart ferme le village côté ruisseau, puis le potager, les trois premières maisons, l'étable.
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

  // La taverne, et dehors sa terrasse de tables : un quart des Gaulois tient à l'aise, dedans puis dehors, sur deux rangs.
  const dehorsPour = (aise: number): Dehors => {
    const sieges = Math.max(0, aise - SIEGES_DEDANS);
    return { x: 0, parRang: Math.ceil(sieges / 2), sieges };
  };
  vue = milieu(poser({ sorte: "taverne" }, TAVERNE));
  const terrasse = dehorsPour(Math.ceil(habitants / 4));
  if (terrasse.sieges > 0) {
    espace(24);
    terrasse.x = x;
    espace(terrasse.parRang * SIEGE_DEHORS + 40);
  }
  espace(30);
  batiment("grenier");
  espace(40);
  fermer("forge");

  vue = milieu(poser({ sorte: "forge" }, tailles.forge));
  espace(34);
  batiment("colombier");
  espace(40);
  fermer("reunion");

  // La salle de réunion, et dehors ses bancs : un cinquième des Gaulois tient à l'aise.
  vue = milieu(poser({ sorte: "reunion" }, REUNION));
  const bancs = dehorsPour(Math.ceil(habitants / 5));
  if (bancs.sieges > 0) {
    espace(24);
    bancs.x = x;
    espace(bancs.parRang * SIEGE_DEHORS + 40);
  }
  espace(44);
  fermer("marche");

  // Le marché : l'étal est là dès le départ ; la halle se bâtit autour de lui, il se retrouve sous son toit. Puis la tour
  // de guet contre la palissade, dont la porte mène au champ de bataille.
  const halleX = x + Math.max(0, Math.floor((ETAL.largeur - tailles.halle.largeur) / 2));
  emplacements.push({ piece: { sorte: "etal" }, quartier, x: halleX + Math.floor((tailles.halle.largeur - ETAL.largeur) / 2), largeur: ETAL.largeur, hauteur: ETAL.hauteur, pied: PIED, dy: 0 });
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

  // Hors du village : le poste de défense garde la porte ; puis le pré où l'on se bat, qui s'allonge avec le village (un
  // cinquième des Gaulois y tient sur trois rangs), et au loin le camp d'en face.
  espace(26);
  poser({ sorte: "openfront", id: "poste-defense" }, tailles["poste-defense"]);
  espace(30);
  const combattants = Math.max(15, Math.ceil(habitants / 5));
  const parRang = Math.ceil(combattants / 3);
  const pas = habitants > 300 ? 26 : 40;
  const demi = Math.max(240, parRang * pas + 60);
  const pre = { x, largeur: Math.max(PRE, demi * 2 - 50), front: x + demi, parRang, pas };
  vue = pre.front + 24;
  espace(pre.largeur);
  poser({ sorte: "camp" }, CAMP);
  const cheminA = pre.x + 150;
  espace(10);
  fermer(null);
  const finDeLaRue = x;

  // Le bas : la voie, la gare sous la place, puis l'usine, le silo, la batterie, et le port à l'est.
  const bas: Emplacement[] = [];
  const poserEnBas = (id: PieceOpenFrontId, gauche: number, pied: number, q: QuartierId): Emplacement => {
    const e: Emplacement = { piece: { sorte: "openfront", id }, quartier: q, x: gauche, largeur: tailles[id].largeur, hauteur: tailles[id].hauteur, pied, dy: 0 };
    bas.push(e);
    return e;
  };
  const viaduc = poserEnBas("viaduc", ruisseau.x - Math.floor(tailles.viaduc.largeur / 2), RAIL + tailles.viaduc.hauteur - 1, "gare");
  const gare = poserEnBas("gare", feu.x - 130, RAIL + 2, "gare");
  const usine = poserEnBas("usine", gare.x + gare.largeur + 260, PIED, "usine");
  const silo = poserEnBas("silo", usine.x + usine.largeur + 180, PIED, "usine");
  const batterie = poserEnBas("batterie", silo.x + silo.largeur + 150, PIED, "usine");
  const port = poserEnBas("port", Math.max(batterie.x + batterie.largeur + 260, pre.x - 100), MER, "port");
  const merDe = port.x + 214;
  const largeur = Math.max(finDeLaRue + LISIERE, merDe + LARGE);
  const navires: Plan["navires"] = [
    { id: "navire-transport", x: port.x + 236, flottaison: MER + 16 },
    { id: "navire-guerre", x: port.x + 560, flottaison: MER + 24 },
    { id: "navire-commerce", x: port.x + 850, flottaison: MER + 64 },
    { id: "navire-ennemi", x: largeur - tailles["navire-ennemi"].largeur - 90, flottaison: MER + 22 },
  ];
  for (const navire of navires) poserEnBas(navire.id, navire.x, navire.flottaison, "port");

  // Les terrasses : les maisons au-delà des trois premières, du milieu vers les côtés, en laissant passer les escaliers.
  const places: number[] = [];
  for (let gauche = villageDe + 40; gauche + MAISON.largeur <= villageA - 40; gauche += PAS_DE_MAISON) places.push(gauche);
  const libres = (t: number): number[] => {
    const montee = escalierDe(feu.x, t + 1);
    const descente = escalierDe(feu.x, t);
    const loin = (gauche: number, colonne: number): boolean => colonne < gauche - 26 || colonne > gauche + MAISON.largeur + 26;
    return places.filter((gauche) => loin(gauche, montee) && loin(gauche, descente)).sort((a, b) => Math.abs(a + MAISON.largeur / 2 - feu.x) - Math.abs(b + MAISON.largeur / 2 - feu.x));
  };
  let reste = maisons - 3;
  let terrasses = 0;
  const hautes: { e: Emplacement; t: number }[] = [];
  let rang = 3;
  while (reste > 0) {
    terrasses++;
    for (const gauche of libres(terrasses)) {
      if (reste === 0) break;
      hautes.push({ e: { piece: { sorte: "maison", rang }, quartier: "maisons", x: gauche, largeur: MAISON.largeur, hauteur: MAISON.hauteur, pied: PIED, dy: 0 }, t: terrasses });
      rang++;
      reste--;
    }
  }

  // Les hauteurs : le ciel, les terrasses de la plus haute à la première, la grand-rue, puis le bas.
  const dy0 = CIEL - LIGNE + terrasses * PAS_DE_TERRASSE;
  const dyBas = dy0 + DESCENTE;
  for (const e of emplacements) e.dy = dy0;
  for (const e of bas) e.dy = dyBas;
  for (const { e, t } of hautes) e.dy = dy0 - t * PAS_DE_TERRASSE;
  const escaliers: Escalier[] = [{ x: feu.x - 250, de: 0 }];
  for (let t = 1; t <= terrasses; t++) escaliers.push({ x: escalierDe(feu.x, t), de: t });

  for (const q of quartiers) q.vueY = dy0 + 250;
  const enBas = (id: QuartierId, de: number, a: number, vueX: number): void => {
    quartiers.push({ id, ...NOMS[id], x: de, largeur: a - de, vue: vueX, vueY: dyBas + 230 });
  };
  enBas("gare", viaduc.x, gare.x + gare.largeur + 100, milieu(gare));
  enBas("usine", usine.x - 60, batterie.x + batterie.largeur + 60, Math.floor((usine.x + silo.x + silo.largeur) / 2));
  // La vue du port prend la mer jusqu'au navire d'en face : sur un grand écran, on voit les deux navires se répondre.
  enBas("port", port.x - 60, largeur, port.x + 780);

  return {
    largeur,
    hauteur: dyBas + RUE_HAUTEUR,
    habitants,
    maisons,
    terrasses,
    dy0,
    dyBas,
    quartiers,
    emplacements: [...hautes.map((h) => h.e), ...emplacements, ...bas],
    escaliers,
    feu,
    ruisseau,
    chemin: { de: cheminDe, a: cheminA },
    village: { de: villageDe, a: villageA },
    pre,
    terrasse,
    bancs,
    finDeLaRue,
    voie: { de: 0, a: port.x + 150 },
    mer: { de: merDe, a: largeur },
    navires,
  };
}

/** L'emplacement d'un bâtiment du chantier. */
export function emplacementDuBatiment(plan: Plan, id: BatimentId): Emplacement {
  return plan.emplacements.find((e) => e.piece.sorte === "batiment" && e.piece.id === id)!;
}

/** L'emplacement d'une pièce d'OpenFront. */
export function emplacementOpenFront(plan: Plan, id: PieceOpenFrontId): Emplacement {
  return plan.emplacements.find((e) => e.piece.sorte === "openfront" && e.piece.id === id)!;
}

/** Les emplacements d'une sorte de pièce, dans l'ordre du plan (les maisons : dans l'ordre de leur rang). */
export function emplacementsDe(plan: Plan, sorte: Piece["sorte"]): Emplacement[] {
  const liste = plan.emplacements.filter((e) => e.piece.sorte === sorte);
  return sorte === "maison" ? liste.sort((a, b) => (a.piece.sorte === "maison" && b.piece.sorte === "maison" ? a.piece.rang - b.piece.rang : 0)) : liste;
}

/** Le quartier le plus proche d'un point du monde. */
export function quartierDe(plan: Plan, x: number, y = plan.dy0 + 250): Quartier {
  let choisi = plan.quartiers[0]!;
  let ecart = Infinity;
  for (const q of plan.quartiers) {
    const dedans = x >= q.x && x < q.x + q.largeur ? 0 : Math.min(Math.abs(x - q.x), Math.abs(x - q.x - q.largeur));
    const d = dedans + Math.abs(y - q.vueY) * 2;
    if (d < ecart) {
      ecart = d;
      choisi = q;
    }
  }
  return choisi;
}

/** Le quartier d'un lieu de vie. */
export function quartierDuLieu(plan: Plan, lieu: Lieu): Quartier {
  return plan.quartiers.find((q) => q.lieu === lieu)!;
}

/** La maison du Gaulois de ce rang (sa place dans la réponse du serveur) : quatre par maison, dans l'ordre. */
export function maisonDuRang(plan: Plan, rang: number): Emplacement {
  const maisons = emplacementsDe(plan, "maison");
  return maisons[Math.min(maisons.length - 1, Math.max(0, Math.floor(rang / LITS_PAR_MAISON)))]!;
}
