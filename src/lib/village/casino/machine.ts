/**
 * Les règles de la machine du forgeron, reprises au chiffre près de la maquette validée (`c2/jeux/machine/tirage.js`) :
 * le résultat se tire d'abord, sur 1 000 : trois statères d'or 100 fois la mise 2 fois sur 1 000, trois torques d'or 20 fois
 * 1 fois sur 100, trois enseignes au sanglier 5 fois 4 fois sur 100, trois amphores 2 fois 1 fois sur 10, le gui au premier
 * rouleau rend la mise 1 fois sur 5, rien 648 fois sur 1 000. Le jeu rend en moyenne exactement la mise. Puis les neuf cases
 * se prennent au hasard parmi toutes celles qui donnent ce résultat, sans rien arranger : jamais de « presque gagné »
 * fabriqué. Le serveur tire les deux (`jouer_machine`) ; ces règles disent ce qu'il rend et vérifient l'image.
 */
import type { ResultatDeLaMachine } from "../contrat-casino";

/** Les symboles 0 à 4 : statère d'or, torque d'or, enseigne au sanglier, amphore, gui. */
export const SYMBOLES_DE_LA_MACHINE = 5;
/** Ce que rend chaque résultat payant, en fois la mise. */
export const FOIS_DE_LA_MACHINE: readonly number[] = [100, 20, 5, 2, 1];
/** Leurs chances sur 1 000 ; le reste, 648, ne donne rien. */
export const SUR_MILLE_DE_LA_MACHINE: readonly number[] = [2, 10, 40, 100, 200];

/** Le résultat pour un nombre tiré de 0 à 999 : les résultats payants à la suite, du plus rare au plus courant, puis rien. */
export function resultatDuTirage(r: number): ResultatDeLaMachine {
  let reste = r;
  for (let i = 0; i < SUR_MILLE_DE_LA_MACHINE.length; i++) {
    const sur = SUR_MILLE_DE_LA_MACHINE[i]!;
    if (reste < sur) return i as ResultatDeLaMachine;
    reste -= sur;
  }
  return -1;
}

/** Ce que rend un tirage, mise comprise. */
export const renduDeLaMachine = (mise: number, resultat: ResultatDeLaMachine): number => (resultat < 0 ? 0 : mise * FOIS_DE_LA_MACHINE[resultat]!);

/**
 * Les neuf cases, par rouleau puis de haut en bas, prises au hasard parmi celles qui donnent ce résultat. `entier(n)` : un
 * entier sans biais de 0 à n - 1.
 */
export function casesDuResultat(resultat: ResultatDeLaMachine, entier: (n: number) => number): [number, number, number][] {
  const un = () => entier(SYMBOLES_DE_LA_MACHINE);
  let m: number[];
  if (resultat >= 0 && resultat < 4) m = [resultat, resultat, resultat];
  else if (resultat === 4) {
    do m = [4, un(), un()];
    while (m[1] === 4 && m[2] === 4);
  } else {
    do m = [entier(4), un(), un()];
    while (m[0] === m[1] && m[1] === m[2]);
  }
  return m.map((milieu): [number, number, number] => [un(), milieu, un()]);
}

/** Ce que dit la ligne du milieu : sert à vérifier que l'image montre bien le résultat tiré. */
export function lireLaLigne(cases: readonly (readonly number[])[]): ResultatDeLaMachine {
  const a = cases[0]?.[1];
  const b = cases[1]?.[1];
  const d = cases[2]?.[1];
  if (a === undefined || b === undefined || d === undefined) return -1;
  if (a === b && b === d && a < 4) return a as ResultatDeLaMachine;
  if (a === 4 && !(b === 4 && d === 4)) return 4;
  return -1;
}
