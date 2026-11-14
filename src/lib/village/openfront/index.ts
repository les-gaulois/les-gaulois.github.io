/**
 * Les pièces du monde d'OpenFront autour du village (demande du pilote, 14 novembre 2026 : « des éléments OpenFront,
 * bateaux, un peu de technologie, usine à armes, train, missile, que ça ressemble davantage au style d'openfront.io »).
 * Dessinées case par case pour ce site, au format des bâtiments (`DessinDeBatiment`, à l'échelle des Gaulois de 48 × 64
 * cases) : ce sont des dessins originaux des idées du jeu (le port, les navires, le train, l'usine, le silo), jamais une
 * copie de ses images, de son logo ni de ce qui vient de son CDN (CLAUDE.md, « Licences »).
 *
 * Trois lots, un fichier par dessinateur ; une pièce pas encore dessinée prend une boîte provisoire.
 */
import type { Decor } from "../decor";
import { type Lumiere, couleurDuDehors } from "../lumiere";
import type { DessinDeBatiment } from "../batiments/type";
import { LOT_PORT } from "./port";
import { LOT_TRAIN } from "./train";
import { LOT_DEFENSE } from "./defense";

export type PieceOpenFrontId =
  // Le port et la mer (lot port)
  | "port"
  | "navire-transport"
  | "navire-guerre"
  | "navire-commerce"
  // Le chemin de fer (lot train)
  | "gare"
  | "rail"
  | "viaduc"
  | "locomotive"
  | "wagon-marchandises"
  | "wagon-citerne"
  | "wagon-voyageurs"
  // L'usine et la défense (lot défense)
  | "usine"
  | "silo"
  | "missile"
  | "batterie"
  | "poste-defense"
  | "ville-lointaine";

export const PIECES_OPENFRONT: readonly PieceOpenFrontId[] = [
  "port",
  "navire-transport",
  "navire-guerre",
  "navire-commerce",
  "gare",
  "rail",
  "viaduc",
  "locomotive",
  "wagon-marchandises",
  "wagon-citerne",
  "wagon-voyageurs",
  "usine",
  "silo",
  "missile",
  "batterie",
  "poste-defense",
  "ville-lointaine",
];

function provisoire(largeur: number, hauteur: number): DessinDeBatiment {
  return {
    largeur,
    hauteur,
    images: 1,
    dessiner(lumiere: Lumiere): Decor {
      const fond = couleurDuDehors("#7f8a96", "#3c4450", lumiere);
      const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(fond);
      return { largeur, hauteur, cases };
    },
  };
}

export const DESSINS_OPENFRONT: Readonly<Record<PieceOpenFrontId, DessinDeBatiment>> = Object.fromEntries(
  PIECES_OPENFRONT.map((id) => [id, LOT_PORT[id] ?? LOT_TRAIN[id] ?? LOT_DEFENSE[id] ?? provisoire(60, 40)]),
) as Record<PieceOpenFrontId, DessinDeBatiment>;
