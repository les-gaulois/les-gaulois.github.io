/**
 * Le village qui se bâtit (demande du pilote, 14 novembre 2026, idée de Claude Fable 5.2) : chaque point rapporté au clan
 * pose une pierre. Les bâtiments se construisent l'un après l'autre, dans cet ordre, et chacun coûte des points rapportés
 * au clan : le score positif des sessions publiques du clan (`data/sessions/`), comme les statères, jamais « des victoires ».
 * Une partie qui fait perdre des points ne retire rien. Le chantier a commencé le 1er novembre 2026 à minuit, heure de
 * Paris, le mois où le village est né.
 *
 * Réglage tiré de la mesure du 14 novembre 2026 (sessions du 10 avril au 14 novembre) : 1 064 points rapportés du 1er au
 * 14 novembre, 2 039 en octobre. Le village entier (14 400 points) demande ainsi environ sept mois au rythme d'octobre.
 * Ce sont des règles écrites, comme les prix de la boutique : les changer change le village de tout le monde.
 *
 * Le grand feu de la place suit les points rapportés au clan sur les 7 derniers jours. Ses seuils viennent des semaines
 * passées du clan, mesurées le même jour sur 218 journées : un quart des semaines sous 104 points, la moitié sous 174,
 * les trois quarts sous 322, neuf sur dix sous 475.
 */

/** Le début du chantier : le 1er novembre 2026 à minuit, heure de Paris (heure d'hiver, UTC + 1). */
export const DEBUT_DU_CHANTIER = "2026-10-31T23:00:00.000Z";

export type BatimentId =
  | "palissade"
  | "puits"
  | "four"
  | "potager"
  | "tour"
  | "pont"
  | "grenier"
  | "moulin"
  | "lavoir"
  | "colombier"
  | "etable"
  | "halle"
  | "chene"
  | "rempart"
  | "grande-tour";

export interface BatimentDuChantier {
  id: BatimentId;
  /** Le nom dans une phrase, avec son article : « encore 42 points pour finir la forge ». */
  nom: string;
  /** Le nom en titre. */
  titre: string;
  /** Les points rapportés au clan qu'il demande, une fois le précédent fini. */
  cout: number;
}

/** Les bâtiments, dans l'ordre où ils se bâtissent. */
export const BATIMENTS: readonly BatimentDuChantier[] = [
  { id: "palissade", nom: "la palissade", titre: "La palissade", cout: 100 },
  { id: "puits", nom: "le puits", titre: "Le puits", cout: 150 },
  { id: "four", nom: "le four à pain", titre: "Le four à pain", cout: 200 },
  { id: "potager", nom: "le potager", titre: "Le potager", cout: 250 },
  { id: "tour", nom: "la tour de guet", titre: "La tour de guet", cout: 350 },
  { id: "pont", nom: "le pont", titre: "Le pont", cout: 450 },
  { id: "grenier", nom: "le grenier sur pilotis", titre: "Le grenier sur pilotis", cout: 550 },
  { id: "moulin", nom: "le moulin", titre: "Le moulin", cout: 700 },
  { id: "lavoir", nom: "le lavoir", titre: "Le lavoir", cout: 850 },
  { id: "colombier", nom: "le colombier", titre: "Le colombier", cout: 1000 },
  { id: "etable", nom: "l'étable", titre: "L'étable", cout: 1200 },
  { id: "halle", nom: "la halle du marché", titre: "La halle du marché", cout: 1500 },
  { id: "chene", nom: "le grand chêne", titre: "Le grand chêne", cout: 1800 },
  { id: "rempart", nom: "le rempart de pierre", titre: "Le rempart de pierre", cout: 2300 },
  { id: "grande-tour", nom: "la grande tour du clan", titre: "La grande tour du clan", cout: 3000 },
];

export const BATIMENT_IDS: readonly BatimentId[] = BATIMENTS.map((b) => b.id);

/** Le grand feu : de 0 (des braises) à 4 (un feu de joie). */
export type NiveauDuFeu = 0 | 1 | 2 | 3 | 4;

/** Les jours comptés pour le feu, jusqu'au dernier relevé des sessions. */
export const FEU_JOURS = 7;

/** Les points rapportés au clan sur 7 jours à partir desquels le feu monte d'un niveau : 1, 2, 3, puis 4. */
export const SEUILS_DU_FEU: readonly [number, number, number, number] = [100, 175, 325, 475];

/** Le nom de chaque niveau du feu, dans une phrase. */
export const NOMS_DU_FEU: Readonly<Record<NiveauDuFeu, string>> = {
  0: "des braises",
  1: "un petit feu",
  2: "un beau feu",
  3: "un grand feu",
  4: "un feu de joie",
};
