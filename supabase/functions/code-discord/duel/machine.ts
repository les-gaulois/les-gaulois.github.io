/**
 * La machine de « Coup pour coup » : le Gaulois que joue l'ordinateur (la main de défense d'un membre, le boss du jour, un
 * défi d'entraînement). Portée de `regles.js`, la maquette version 5 validée par le pilote le 22 novembre 2026.
 *
 * Elle ne sait que ce que les deux joueurs voient : les deux camps, jamais la carte choisie en face. Pour chaque carte
 * qu'elle peut jouer, elle regarde `loin` manches devant, contre un adversaire qui choisirait au hasard, puis tire sa carte
 * avec une part de fantaisie : plus la fantaisie est grande, plus elle se trompe, pour rester battable et imprévisible.
 *
 * Trois niveaux réglables (`NIVEAUX`) : l'apprenti, le guerrier (le réglage de la maquette, qu'un joueur moyen devait battre
 * un duel sur deux) et le druide. Le serveur en aura une copie en SQL (`internal.duel_choisir`, migration du duel à venir),
 * qui fera foi pour les duels qui comptent, comparée à ce fichier par un test. Deux changements, pour que le SQL et ce
 * fichier rendent exactement les mêmes choix :
 * - le hasard vient d'une graine (`hasardDeLaGraine`, le générateur « minimal standard » de Park et Miller), que le serveur
 *   garde pour lui ;
 * - l'exponentielle est calculée par `expDuDuel`, avec les quatre opérations seulement, que JavaScript et Postgres font à
 *   l'identique ; elle ne s'écarte de `Math.exp` que d'un millionième de millionième.
 */
import { libres, manche, verdict } from "./regles.ts";
import type { Camp } from "./regles.ts";

/** Ce que vaut une carte pour `a`, s'il joue ensuite au mieux contre un adversaire qui choisit au hasard, `loin` manches devant. */
export function valeurDuCoup(a: Camp, b: Camp, ia: number, m: number, loin: number): number {
  let s = 0, poids = 0;
  for (const ib of libres(b)) {
    const cb = b.main[ib];
    const w = cb && b.energie >= cb.c ? 1 : 0.3, r = manche(a, b, ia, ib, m);
    let v: number;
    if (r.fini) v = verdict(r.a, r.b) * 40 + (r.a.vie - r.b.vie) * 0.2;
    else if (loin <= 1) v = r.a.vie - r.b.vie + (r.a.elan - r.b.elan) * 0.5 + (r.a.energie - r.b.energie) * 0.15;
    else {
      v = -Infinity;
      for (const i of libres(r.a)) v = Math.max(v, valeurDuCoup(r.a, r.b, i, m + 1, loin - 1));
      if (v === -Infinity) v = r.a.vie - r.b.vie;
    }
    s += w * v;
    poids += w;
  }
  return poids ? s / poids : a.vie - b.vie;
}

/** En dessous, une carte n'a plus aucune chance d'être tirée. */
export const EXP_PLANCHER = -40;

/**
 * L'exponentielle d'un nombre négatif ou nul, faite des quatre opérations seulement : moitiés jusqu'à un 128e, série de
 * Taylor à neuf termes, puis autant de carrés. Le SQL (`internal.duel_exp`, à venir) fera les mêmes opérations dans le même
 * ordre.
 */
export function expDuDuel(x: number): number {
  if (!(x > EXP_PLANCHER)) return 0;
  let y = x, k = 0;
  while (y < -0.0078125) {
    y = y / 2;
    k++;
  }
  let s = 1;
  for (let n = 9; n >= 1; n--) s = 1 + (y / n) * s;
  for (; k > 0; k--) s = s * s;
  return s;
}

/** Le choix de la machine : la carte qui vaut le plus, avec une part de fantaisie pour rester battable et imprévisible. */
export function choisir(moi: Camp, lui: Camp, m: number, hasard: () => number = Math.random, fantaisie = 1.5, loin = 3): number {
  const notes = libres(moi).map((i): [number, number] => [i, valeurDuCoup(moi, lui, i, m, loin)]);
  if (!notes.length) throw new Error("aucune carte à jouer");
  const max = Math.max(...notes.map((n) => n[1]));
  const poids = notes.map(([, v]) => expDuDuel((v - max) / fantaisie));
  let x = hasard() * poids.reduce((s, p) => s + p, 0);
  for (let k = 0; k < notes.length; k++) {
    x -= poids[k] ?? 0;
    if (x <= 0) return notes[k]![0];
  }
  return notes[notes.length - 1]![0];
}

/** Les trois niveaux de la machine : sa fantaisie et combien de manches elle regarde devant. */
export const NIVEAUX_DE_LA_MACHINE = ["apprenti", "guerrier", "druide"] as const;
export type NiveauDeLaMachine = (typeof NIVEAUX_DE_LA_MACHINE)[number];
export interface ReglageDuNiveau {
  fantaisie: number;
  loin: number;
}
/**
 * Réglages provisoires : les niveaux appartiennent à la session « boss, défis et niveaux », dont `contenu/niveaux.ts` fera
 * foi une fois sur main ; ce fichier en reprendra alors les chiffres.
 *
 * Le guerrier est le réglage de la maquette (fantaisie 2,5, deux manches devant ; elle visait un joueur moyen qui gagne un
 * duel sur deux). L'apprenti ne regarde que la manche qui vient et se trompe souvent ; le druide regarde aussi deux manches
 * devant, avec bien moins de fantaisie. Essai du 22 novembre 2026 (`scripts/essai-duel.ts`, 150 duels par paire, la même
 * main des deux côtés) : contre le hasard, l'apprenti gagne 74 fois sur 100, le guerrier 80, le druide 89 ; le guerrier bat
 * l'apprenti 66 fois sur 100, le druide bat le guerrier 57 fois sur 100. Trois manches devant rendaient le druide à peine
 * plus fort pour sept fois plus de calcul, que le serveur fera à chaque manche.
 */
export const NIVEAUX: Readonly<Record<NiveauDeLaMachine, ReglageDuNiveau>> = {
  apprenti: { fantaisie: 6, loin: 1 },
  guerrier: { fantaisie: 2.5, loin: 2 },
  druide: { fantaisie: 1, loin: 2 },
};
export const estUnNiveau = (x: unknown): x is NiveauDeLaMachine => typeof x === "string" && (NIVEAUX_DE_LA_MACHINE as readonly string[]).includes(x);

/** Le choix de la machine à un niveau donné. */
export const choisirAuNiveau = (moi: Camp, lui: Camp, m: number, niveau: NiveauDeLaMachine, hasard: () => number = Math.random): number =>
  choisir(moi, lui, m, hasard, NIVEAUX[niveau].fantaisie, NIVEAUX[niveau].loin);

/** Le modulo du générateur : 2 puissance 31, moins 1. */
export const MODULE_DE_LA_GRAINE = 2147483647;
const MULTIPLICATEUR = 48271;

/** Une graine valable : un entier de 1 à 2 147 483 646. */
export const estUneGraine = (g: unknown): g is number => typeof g === "number" && Number.isInteger(g) && g >= 1 && g < MODULE_DE_LA_GRAINE;

/** La graine suivante. Les produits restent sous 2 puissance 53 : exacts en JavaScript comme en `bigint`. */
export const graineSuivante = (g: number): number => (g * MULTIPLICATEUR) % MODULE_DE_LA_GRAINE;

/** Le tirage d'une graine, entre 0 et 1, sans 0 ni 1. */
export const tirageDeLaGraine = (g: number): number => g / MODULE_DE_LA_GRAINE;

/**
 * Un hasard qui suit une graine : chaque appel avance d'un pas et rend le tirage de la graine nouvelle. `etat()` rend la
 * graine où il en est.
 */
export function hasardDeLaGraine(graine: number): { (): number; etat: () => number } {
  if (!estUneGraine(graine)) throw new Error("graine invalide");
  let g = graine;
  const h = (): number => {
    g = graineSuivante(g);
    return tirageDeLaGraine(g);
  };
  return Object.assign(h, { etat: () => g });
}
