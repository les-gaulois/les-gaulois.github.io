/**
 * Une petite image en pixels par lieu du village, pour les boutons qui les ouvrent : le feu de la place, la chope de la
 * taverne, la bannière de la salle de réunion, un bouclier pour le champ de bataille, une hutte pour les maisons. Dessins
 * originaux, 11 cases sur 11. Décoratives : le nom du lieu est écrit à côté. Design : Claude Fable 5.2.
 */
import type { Decor } from "./decor";
import type { Lieu } from "./vie";

const COULEURS: Readonly<Record<string, string>> = {
  a: "#1a1410",
  r: "#e2452a",
  o: "#f58a1f",
  y: "#ffd75a",
  w: "#fff1a8",
  B: "#835a33",
  s: "#8d95a6",
  S: "#c0c9e2",
  f: "#fff6dc",
  h: "#8a5a30",
  b: "#2456b8",
  n: "#e8e6e0",
  R: "#c8283a",
  c: "#c29f4c",
  d: "#86682b",
  m: "#b08f5c",
  p: "#2a1a10",
};

const DESSINS: Readonly<Record<Lieu, readonly string[]>> = {
  place: ["....r......", "....rr.....", "...roor.r..", "..rooyorr..", "..royyyor..", ".rooywyoor.", ".royywyyor.", "..royyyor..", ".hBBBBBBBh.", "sBBBBBBBBBs", "ss.ss.ss.ss"],
  taverne: ["..fffff....", ".fffffff...", ".aaaaaaa...", ".assSssaaa.", ".assSssa.a.", ".assSssa.a.", ".assSssa.a.", ".assSssaaa.", ".assSssa...", ".aaaaaaa...", "..........."],
  reunion: ["hhhhhhhhhhh", ".bbbnnnRRR.", ".bbbnnnRRR.", ".bbbnnnRRR.", ".bbbnnnRRR.", ".bbbnnnRRR.", ".bbbnnnRRR.", ".bbbnnnRRR.", ".bb.nnn.RR.", ".b...n...R.", "..........."],
  bataille: ["...aaaaa...", "..aRRRRRa..", ".aRRRnRRRa.", "aRRRRnRRRRa", "aRRRRnRRRRa", "aRnnnsnnnRa", "aRRRRnRRRRa", "aRRRRnRRRRa", ".aRRRnRRRa.", "..aRRRRRa..", "...aaaaa..."],
  maisons: [".....c.....", "....ccc....", "...ccccc...", "..ccdcccc..", ".cccccdccc.", "ccdcccccdcc", ".mmmmmmmmm.", ".mmmppmmmm.", ".mmmppmmmm.", ".mmmppmmmm.", "..........."],
};

function lire(lignes: readonly string[]): Decor {
  const largeur = lignes[0]!.length;
  const cases: (string | null)[] = [];
  for (const ligne of lignes) for (let x = 0; x < largeur; x++) cases.push(COULEURS[ligne[x] ?? "."] ?? null);
  return { largeur, hauteur: lignes.length, cases };
}

export const ICONES_DES_LIEUX: Readonly<Record<Lieu, Decor>> = {
  place: lire(DESSINS.place),
  taverne: lire(DESSINS.taverne),
  reunion: lire(DESSINS.reunion),
  bataille: lire(DESSINS.bataille),
  maisons: lire(DESSINS.maisons),
};
