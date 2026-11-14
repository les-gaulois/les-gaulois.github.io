/**
 * Les petites images en pixels de la rangée d'icônes et de la petite carte du monde du village, dans le style de celles
 * des lieux (`../lieux-icones.ts`) : 11 cases sur 11, dessins originaux. Décoratives : le nom est écrit à côté.
 * Design : Claude Fable 5.2.
 */
import type { Decor } from "../decor";
import { ICONES_DES_LIEUX } from "../lieux-icones";
import type { QuartierId } from "./plan";
import type { FenetreDuMonde } from "./textes";

const COULEURS: Readonly<Record<string, string>> = {
  a: "#1a1410",
  s: "#8d95a6",
  S: "#c0c9e2",
  p: "#f2c9a0",
  y: "#e2a83c",
  o: "#c9722a",
  f: "#efe6d0",
  h: "#8a5a30",
  B: "#b07a44",
  n: "#e8e6e0",
  r: "#c8283a",
  b: "#2456b8",
  e: "#3f86c4",
  w: "#8cc4ee",
  g: "#4f7d3a",
  j: "#ffd75a",
};

const DESSINS = {
  gaulois: ["...sSSSs...", "..sSSSSSs..", ".sSSSSSSSs.", ".sssssssss.", ".ppppppppp.", ".ppapppapp.", ".ppppppppp.", ".yyyypyyyy.", ".yy.ppp.yy.", ".y..ppp..y.", "..........."],
  marche: ["oofffooffoo", "oofffooffoo", "oofffooffoo", ".o.f.o..f.o", "h.........h", "h..jj.....h", "h.jjjj.SS.h", "hhhhhhhhhhh", "hBBBBBBBBBh", "hBBBBBBBBBh", "h.........h"],
  qui: [".jj..nnnnnn", ".jj..nnnnnn", "...........", ".rr..nnnn..", ".rr..nnnn..", "...........", ".bb..nnnnn.", ".bb..nnnnn.", "...........", ".gg..nnn...", ".gg..nnn..."],
  chantier: ["..sssssss..", ".sSSSSSSSs.", ".sSSSSSSSs.", "..sssssss..", "....hB.....", "....hB.....", "....hB.....", "....hB.....", "....hB.....", "....hB.....", "....hB....."],
  forge: ["...........", "SSSSSSSSSs.", ".sssssssss.", "...sssss...", "....sss....", "....sss....", "...sssss...", "..sssssss..", ".aaaaaaaaa.", "..hhhhhhh..", "..hhhhhhh.."],
  ruisseau: ["...........", ".ee...ee...", "e..e.e..e.e", "....e....e.", "...........", ".ww...ww...", "w..w.w..w.w", "....w....w.", "...........", ".ee...ee...", "e..e.e..e.e"],
} as const;

function lire(lignes: readonly string[]): Decor {
  const largeur = lignes[0]!.length;
  const cases: (string | null)[] = [];
  for (const ligne of lignes) for (let x = 0; x < largeur; x++) cases.push(COULEURS[ligne[x] ?? "."] ?? null);
  return { largeur, hauteur: lignes.length, cases };
}

const FORGE = lire(DESSINS.forge);
const MARCHE = lire(DESSINS.marche);

/** L'icône de chaque fenêtre du monde. Le grand feu reprend le feu de la place. */
export const ICONES_DES_FENETRES: Readonly<Record<FenetreDuMonde, Decor>> = {
  gaulois: lire(DESSINS.gaulois),
  marche: MARCHE,
  qui: lire(DESSINS.qui),
  chantier: lire(DESSINS.chantier),
  feu: ICONES_DES_LIEUX.place,
  forge: FORGE,
};

/** L'icône de chaque quartier, pour la petite carte. */
export const ICONES_DES_QUARTIERS: Readonly<Record<QuartierId, Decor>> = {
  ruisseau: lire(DESSINS.ruisseau),
  maisons: ICONES_DES_LIEUX.maisons,
  place: ICONES_DES_LIEUX.place,
  taverne: ICONES_DES_LIEUX.taverne,
  forge: FORGE,
  reunion: ICONES_DES_LIEUX.reunion,
  marche: MARCHE,
  bataille: ICONES_DES_LIEUX.bataille,
};
