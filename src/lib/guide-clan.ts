/**
 * Les calculs des essais du guide du clan (/debuter). Chaque chiffre qu'un essai affiche vient d'ici, et chaque règle est
 * celle qu'écrit le guide du clan (content/guide-clan/) : des règles du jeu OpenFront, que le clan a vérifiées le
 * 6 novembre 2026 sur son code public (AGPL-3.0), v0.35.12. Elles sont réécrites ici d'après le texte du guide. Les
 * constantes sont figées à cette version : si le jeu change, corriger le chapitre et le calcul ensemble, et noter la
 * version.
 * tests/unit/guide-clan.test.ts relit les tableaux des chapitres et les compare à ces calculs : un essai ne peut pas
 * contredire le texte. La croissance des troupes (chapitre 2) a son fichier, src/lib/growth.ts.
 */

/* ---------- Chapitre 1 : combien partent avec une attaque ---------- */

/**
 * « Attaque = troupes ÷ 5 » : le curseur d'attaque d'un joueur est réglé à 20 % par défaut, une troupe sur cinq part.
 * Un bot divise par 20 : le chapitre le dit dans ses détails, et aucun essai ne le montre.
 */
export const DIVISEUR_ATTAQUE = 5;

/** Les troupes d'un joueur qui partent avec une attaque, et celles qui restent en défense. Une valeur impossible ne donne rien. */
export function partageAttaque(troupes: number): { attaque: number; defense: number } {
  if (!Number.isFinite(troupes) || troupes < 0) return { attaque: 0, defense: 0 };
  const attaque = Math.floor(troupes / DIVISEUR_ATTAQUE);
  return { attaque, defense: troupes - attaque };
}

/* ---------- Chapitre 3 : le terrain ---------- */

/**
 * « Mag » pèse sur les pertes de l'attaquant, le coût de tuile sur le temps que prend chaque tuile. Colline : « highland »
 * dans le jeu. Leurs noms et ce qu'il faut en lire sont dans le chapitre, dans le même ordre.
 */
export const TERRAINS = [
  { id: "plaine", mag: 80, coutTuile: 16.5 },
  { id: "colline", mag: 100, coutTuile: 20 },
  { id: "montagne", mag: 120, coutTuile: 25 },
] as const;

/* ---------- Chapitre 4 : le poste de défense ---------- */

/** Sa portée en tuiles, puis ce qu'il multiplie : les pertes de l'attaquant et le coût de vitesse. */
export const POSTE = { portee: 30, pertes: 5, vitesse: 3 } as const;

/* ---------- Chapitre 6 : l'or et les bâtiments ---------- */

export const COUT_BATIMENT_DEPART = 125_000;
export const COUT_BATIMENT_PLAFOND = 1_000_000;

/** Le coût d'un bâtiment quand `dejaComptes` structures comptent déjà : coût(n) = min(1 000 000 ; 125 000 × 2^n). */
export function coutBatiment(dejaComptes: number): number {
  const n = Number.isFinite(dejaComptes) ? Math.max(0, Math.floor(dejaComptes)) : 0;
  return Math.min(COUT_BATIMENT_PLAFOND, COUT_BATIMENT_DEPART * 2 ** n);
}

/**
 * Les trois bâtiments principaux, et le compteur qui fait monter leur prix : la Ville a le sien, le Port et l'Usine
 * partagent le même. Leurs noms et leur rôle sont dans le chapitre, dans le même ordre.
 */
export const BATIMENTS = [
  { id: "ville", compteur: "ville" },
  { id: "port", compteur: "commerce" },
  { id: "usine", compteur: "commerce" },
] as const;
export type BatimentId = (typeof BATIMENTS)[number]["id"];

export interface Chantier {
  /** Le prix du prochain bâtiment de chaque sorte. */
  prochain: Record<BatimentId, number>;
  /** Combien de chaque sorte sont construits. */
  nombre: Record<BatimentId, number>;
  /** L'or dépensé en tout. */
  depense: number;
}

/** Où en est un chantier après une suite de constructions, dans l'ordre où elles ont été faites. */
export function chantier(construits: readonly BatimentId[]): Chantier {
  const compteurs = { ville: 0, commerce: 0 };
  const nombre: Record<BatimentId, number> = { ville: 0, port: 0, usine: 0 };
  let depense = 0;
  for (const id of construits) {
    const batiment = BATIMENTS.find((b) => b.id === id);
    if (!batiment) continue;
    depense += coutBatiment(compteurs[batiment.compteur]);
    compteurs[batiment.compteur] += 1;
    nombre[id] += 1;
  }
  const commerce = coutBatiment(compteurs.commerce);
  return { prochain: { ville: coutBatiment(compteurs.ville), port: commerce, usine: commerce }, nombre, depense };
}

/* ---------- Chapitre 7 : les bateaux de trade ---------- */

/** La plus grande distance des repères du chapitre. */
export const DISTANCE_BATEAU_MAX = 1_000;

/**
 * L'or payé à l'arrivée d'un bateau de trade, avant le multiplicateur d'or :
 * 75 000 ÷ (1 + e^(−0,03 × (distance − 300))) + 50 × distance. Le seuil de courte portée vaut 300.
 */
export function orBateau(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  return 75_000 / (1 + Math.exp(-0.03 * (distance - 300))) + 50 * distance;
}

/* ---------- Chapitre 8 : les trains ---------- */

/** L'or de base d'un arrêt commercial, selon le propriétaire de la station. */
export const RELATIONS_TRAIN = [
  { id: "soi", nom: "Vous-même", or: 10_000 },
  { id: "equipe", nom: "Équipe", or: 25_000 },
  { id: "autre", nom: "Autre joueur", or: 25_000 },
  { id: "allie", nom: "Allié", or: 35_000 },
] as const;
export type RelationTrain = (typeof RELATIONS_TRAIN)[number]["id"];

/** Les 10 premiers arrêts au tarif plein, puis 5 000 or de moins par arrêt, jamais sous 5 000. */
export const TRAIN = { arretsPleins: 10, baisse: 5_000, plancher: 5_000 } as const;

/** L'or payé à un arrêt commercial, avant le multiplicateur d'or. `arret` : son rang, à partir de 1. */
export function orTrain(base: number, arret: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  const rang = Number.isFinite(arret) ? Math.max(1, Math.floor(arret)) : 1;
  return Math.max(TRAIN.plancher, base - TRAIN.baisse * Math.max(0, rang - TRAIN.arretsPleins));
}
