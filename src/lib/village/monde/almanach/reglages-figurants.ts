/**
 * Les réglages de quelques figurants de l'almanach (`figurants.ts`), là où leur dessin demande plus que leur milieu
 * (conventions du dessinateur, Claude Fable 5.2, 15 novembre 2026). Le contrat `Figurant` (`type.ts`) est commun : ces
 * réglages vivent ici, à côté. La validation des moments (`moment.ts`) les contrôle, le moteur (`jeu.ts`) les tient, et la
 * consigne de l'API (`ecriture.ts`) les dit en clair.
 *
 * Ce qui vaut pour tous, sans réglage :
 * - sur l'eau, la dernière rangée d'un figurant est le bas de son sillage : la ligne d'eau est 2 à 4 rangées plus haut. Son
 *   pied se pose dans l'eau (une zone d'eau du lieu), jamais sur la rive ;
 * - papillons, lucioles, libellules et martin-pêcheur ont le bas de leur dessin vide : posés au sol ou sur l'eau, ils
 *   volettent au-dessus ;
 * - un figurant a ses heures (`quand`) : il n'entre que dans un moment dont toutes les phases sont les siennes.
 */
import type { Figurant } from "./type";

export interface ReglageDuFigurant {
  /**
   * Les colonnes de son dessin (tourné vers la droite) dont le pied doit tenir dans son milieu, quand ce n'est pas toute sa
   * largeur : le pêcheur assis, de son panier à ses souliers.
   */
  corps?: readonly [number, number];
  /** Des colonnes de son dessin dont le pied doit tenir sur l'eau, à la même rangée : le fil du pêcheur et son bouchon. */
  surLEau?: readonly [number, number];
  /** Il ne va que dans le sens de son dessin, vers la droite : retourné, il serait faux. */
  versLaDroite?: boolean;
  /** Ce que la consigne de l'API en dit, en une phrase. */
  note: string;
}

export const REGLAGES: Readonly<Record<string, ReglageDuFigurant>> = {
  "pecheur-sur-la-rive": {
    corps: [0, 41],
    surLEau: [67, 69],
    note: "Toujours posé au bord de l'eau, l'eau à sa droite (il ne se retourne pas) : les colonnes 0 à 41 de son pied (la souche, le panier) sur une zone de sol, les colonnes 67 à 69 (son fil et son bouchon) sur une zone d'eau, à la même rangée.",
  },
  "etoile-filante": {
    versLaDroite: true,
    note: "Sa traîne est à gauche : elle ne va que vers la droite (x croissant d'une étape à l'autre), jamais vers la gauche.",
  },
  "fumee-qui-traine": {
    versLaDroite: true,
    note: "Couchée par le vent, elle s'effiloche à droite : elle ne dérive que vers la droite (x croissant), jamais vers la gauche.",
  },
  "feuilles-au-vent": { note: "Le dessin ne fait qu'une volte sur place : ce sont ses étapes qui le portent, en biais, d'un point à l'autre." },
  aigrettes: { note: "Le dessin ne fait qu'une volte sur place : ce sont ses étapes qui le font dériver." },
  "pluie-fine": { note: "Sa pluie tombe et boucle d'elle-même : elle peut passer lentement ou rester sur place." },
  papillons: { note: "Le bas du dessin est vide : posé sur le sol, il volette au-dessus." },
  lucioles: { note: "Le bas du dessin est vide : posé sur le sol, il volette au-dessus." },
  libellules: { note: "Le bas du dessin est vide : posé sur l'eau, il volette au-dessus." },
  "martin-pecheur": { note: "Le bas du dessin est vide : posé sur l'eau, il file au ras de l'eau." },
};

/** Le réglage d'un figurant, s'il en a un. */
export const reglageDe = (figurant: Pick<Figurant, "id">): ReglageDuFigurant | null => REGLAGES[figurant.id] ?? null;

/**
 * Les colonnes du pied d'un figurant qui doivent tenir dans son milieu, comptées depuis le bord gauche de son dessin tel
 * qu'il est posé : toute sa largeur, ou son corps ; retourné, le dessin se lit en miroir.
 */
export function colonnesDuCorps(figurant: Pick<Figurant, "id" | "largeur">, retourne: boolean): readonly [number, number] {
  const corps = reglageDe(figurant)?.corps ?? [0, figurant.largeur - 1];
  return retourne ? [figurant.largeur - 1 - corps[1], figurant.largeur - 1 - corps[0]] : corps;
}

/** Les colonnes qui doivent tenir sur l'eau, depuis le bord gauche du dessin posé, ou `null`. */
export function colonnesSurLEau(figurant: Pick<Figurant, "id" | "largeur">, retourne: boolean): readonly [number, number] | null {
  const eau = reglageDe(figurant)?.surLEau;
  if (!eau) return null;
  return retourne ? [figurant.largeur - 1 - eau[1], figurant.largeur - 1 - eau[0]] : eau;
}
