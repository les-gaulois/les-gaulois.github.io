/**
 * Les Gaulois du monde d'une relecture du serveur à la suivante (toutes les 5 minutes, page visible) : calculs purs, que
 * l'écran (`MondeHabitants.tsx`) applique à chaque relecture et à chaque temps. Le serveur dit qui est au village ; la
 * règle de `vie.ts` dit dans quel lieu ; `postes.ts` donne la place de chacun. Ici, ce qui se passe entre deux : celui
 * qui arrive au village paraît à sa place ; celui qui part disparaît ; celui dont le lieu change sort par la porte et
 * marche au pas jusqu'au nouveau (`marche.ts`) ; une nouvelle relecture pendant sa marche le fait repartir de là où il
 * est ; figé (bouton pause, « réduire les animations »), il est d'un coup à sa nouvelle place, sans marcher. Testé dans
 * tests/unit/village-monde-marche.test.ts, sur des places quelconques.
 */
import type { Lieu } from "../vie";
import { type Etape, type Marcheur, type Zone, arretDuPromeneur, arriverDUnCoup, avancer, changerLArrivee, enRoute, etapesVers, marcheurA, partir, promener } from "./marche";

/**
 * Une place : le coin haut gauche de la boîte, en cases du monde. `serre` : on y est à l'étroit. `saut` : elle n'est pas
 * sur la grand-rue (une terrasse, le pré du bas) : on la rejoint d'un coup, depuis l'escalier.
 */
export interface PlaceDuMonde {
  x: number;
  y: number;
  serre: boolean;
  saut?: boolean;
}

/** Pour qui n'est pas sur la grand-rue : le pied de l'escalier où il la rejoint, d'un coup ; `null` s'il y est déjà. */
export type Rejoindre = (point: { x: number; y: number }) => Etape | null;

/**
 * Un habitant dans le monde. `poste` : il est à sa place dans son lieu (attablé, couché, au combat) ; `promene` : il est
 * de la place et va et vient dans le village ; `chemin` : son lieu vient de changer, il marche jusqu'au nouveau.
 */
export interface Acteur<H> {
  habitant: H;
  lieu: Lieu;
  etat: "poste" | "promene" | "chemin";
  marche: Marcheur;
  place: PlaceDuMonde;
}

/** Ce que dit une relecture d'un habitant : sa clé (d'une relecture à l'autre), son lieu et sa place. */
export interface Entree<H> {
  cle: string;
  habitant: H;
  lieu: Lieu;
  place: PlaceDuMonde;
}

/** Le pas de la porte d'un lieu, par où l'on y entre et d'où l'on en sort (`seuilDuLieu` de `postes.ts`). */
export type Seuil = (lieu: Lieu, place: PlaceDuMonde) => { x: number; y: number };

/** La vitesse de celui qui change de lieu, en cases par temps : au pas, un peu plus vif que la promenade. */
export const VITESSE_DU_CHEMIN = 2;

/** L'état d'un habitant arrivé dans son lieu. */
const etatDuLieu = (lieu: Lieu): Acteur<unknown>["etat"] => (lieu === "place" ? "promene" : "poste");

/** On entre dans une maison en se couchant : le lit est dans la maison, sans chemin pour y monter. */
const parUnSaut = (lieu: Lieu): boolean => lieu === "maisons";

/** L'habitant est d'un coup à sa place, sans marcher. */
export function arriver<H>(acteur: Acteur<H>, hasard: () => number): void {
  arriverDUnCoup(acteur.marche, acteur.place);
  acteur.etat = etatDuLieu(acteur.lieu);
  if (acteur.etat === "promene") acteur.marche.attente = arretDuPromeneur(hasard);
}

/**
 * Applique une relecture : chacun retrouve sa place, celui dont le lieu a changé se met en chemin (ou y est d'un coup si
 * `fige`), celui qui arrive paraît à sa place, celui qui n'est plus là est oublié. Modifie `acteurs`.
 */
export function relireLesActeurs<H>(acteurs: Map<string, Acteur<H>>, entrees: readonly Entree<H>[], seuil: Seuil, fige: boolean, hasard: () => number, rejoindre?: Rejoindre): void {
  const vus = new Set<string>();
  for (const { cle, habitant, lieu, place } of entrees) {
    vus.add(cle);
    const acteur = acteurs.get(cle);
    if (!acteur) {
      acteurs.set(cle, { habitant, lieu, etat: etatDuLieu(lieu), marche: marcheurA(place.x, place.y, hasard), place });
      continue;
    }
    acteur.habitant = habitant;
    if (acteur.lieu === lieu) {
      const bougee = acteur.place.x !== place.x || acteur.place.y !== place.y;
      acteur.place = place;
      // Sa place l'attendait ailleurs dans le même lieu : il y va (en route), ou s'y trouve (à son poste).
      if (bougee && acteur.etat === "chemin") changerLArrivee(acteur.marche, { x: place.x, y: place.y, saut: parUnSaut(lieu) || place.saut === true });
      else if (bougee && acteur.etat === "poste") arriverDUnCoup(acteur.marche, place);
      continue;
    }
    // Il change de lieu : il part de là où il est. À son poste, il sort d'abord par la porte (d'un coup, s'il dormait).
    const depart = { x: acteur.marche.x, y: acteur.marche.y };
    // Celui qui se promenait sur une terrasse ou dans le bas rejoint d'abord la grand-rue, par l'escalier.
    const sortie: Etape | null = acteur.etat === "poste" ? { ...seuil(acteur.lieu, acteur.place), saut: parUnSaut(acteur.lieu) } : (rejoindre?.(depart) ?? null);
    const entree: Etape | null = lieu === "place" ? (place.saut ? seuil(lieu, place) : null) : seuil(lieu, place);
    acteur.lieu = lieu;
    acteur.place = place;
    acteur.etat = "chemin";
    partir(acteur.marche, etapesVers(depart, sortie, entree, { x: place.x, y: place.y, saut: parUnSaut(lieu) || place.saut === true }));
    if (fige || !enRoute(acteur.marche)) arriver(acteur, hasard);
  }
  for (const cle of [...acteurs.keys()]) if (!vus.has(cle)) acteurs.delete(cle);
}

/** Un temps : celui de la place se promène, celui qui change de lieu avance ; arrivé, il prend sa place. */
export function unTemps<H>(acteur: Acteur<H>, zone: Zone, eviter: number, hasard: () => number): void {
  if (acteur.etat === "promene") promener(acteur.marche, zone, eviter, hasard);
  else if (acteur.etat === "chemin" && avancer(acteur.marche, VITESSE_DU_CHEMIN)) arriver(acteur, hasard);
}

/** Figé : ceux qui étaient en route sont arrivés, d'un coup. */
export function toutArrive<H>(acteurs: Iterable<Acteur<H>>, hasard: () => number): void {
  for (const acteur of acteurs) if (acteur.etat === "chemin") arriver(acteur, hasard);
}
