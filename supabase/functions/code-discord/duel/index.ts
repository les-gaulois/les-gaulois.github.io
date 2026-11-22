/**
 * « Coup pour coup », le duel de cartes de « Mon Gaulois » (chantier du 22 novembre 2026) : le moteur partagé, en
 * TypeScript pur, sans DOM, lisible par le site comme par la fonction `code-discord` (Deno).
 *
 * - `effets.ts` : mots-clés, panoplies, lieux, compagnons ;
 * - `catalogue.ts` : une fiche par objet de la garde-robe, fabriquée par `scripts/fabriquer-effets-duel.ts` ;
 * - `regles.ts` : les cartes, les camps, la manche et le verdict ;
 * - `machine.ts` : l'ordinateur, ses trois niveaux (réglages provisoires) et son hasard à graine ;
 * - `entiers.ts` : les camps et les cartes en entiers, la forme que leur donnera le serveur ;
 * - `contenu/` : les boss, les défis et les réglages des niveaux, à la session « boss, défis et niveaux » ; une fois sur
 *   main, ses niveaux remplacent ceux de `machine.ts`.
 *
 * Le serveur (SQL, migration du duel à venir) fera foi pour tout duel qui compte ; les écrans rejouent chaque manche avec
 * ce moteur pour la montrer.
 */
export * from "./effets.ts";
export * from "./regles.ts";
export * from "./machine.ts";
export * from "./entiers.ts";
export { CATALOGUE_DU_DUEL, PIECES_DES_PANOPLIES } from "./catalogue.ts";

import { MANCHES_AU_PLUS, camp, manche, verdict } from "./regles.ts";
import type { Camp, Carte, Manche, OptionsDuCamp } from "./regles.ts";

/** Qui choisit la carte d'un camp, à chaque manche : `moi` est son camp, `lui` celui d'en face. */
export type Joueur = (moi: Camp, lui: Camp, m: number) => number;

export interface DuelJoue {
  /** 1 : `a` gagne ; -1 : `b` gagne ; 0 : égalité. */
  verdict: -1 | 0 | 1;
  /** Le nombre de manches jouées. */
  manches: number;
  /** Les cartes posées à chaque manche : [carte de `a`, carte de `b`]. */
  coups: [number, number][];
  a: Camp;
  b: Camp;
  /** Ce que la dernière manche a fait. */
  derniere: Manche | null;
}

/**
 * Un duel entier entre deux joueurs (la machine, le hasard, un essai), jusqu'à ce qu'un Gaulois tombe ou à
 * `MANCHES_AU_PLUS`. `b` choisit avant `a` à chaque manche, sans voir sa carte : comme la machine contre le joueur.
 */
export function jouerUnDuel(mainA: readonly Carte[], mainB: readonly Carte[], joueurA: Joueur, joueurB: Joueur, optsA: OptionsDuCamp = {}, optsB: OptionsDuCamp = {}): DuelJoue {
  let a = camp(mainA, optsA), b = camp(mainB, optsB), derniere: Manche | null = null, m = 1;
  const coups: [number, number][] = [];
  for (; m <= MANCHES_AU_PLUS; m++) {
    const ib = joueurB(b, a, m), ia = joueurA(a, b, m);
    coups.push([ia, ib]);
    derniere = manche(a, b, ia, ib, m);
    a = derniere.a;
    b = derniere.b;
    if (derniere.fini) break;
  }
  return { verdict: verdict(a, b), manches: Math.min(m, MANCHES_AU_PLUS), coups, a, b, derniere };
}
