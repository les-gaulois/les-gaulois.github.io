/**
 * Le duel en entiers : la forme que le serveur SQL donne aux cartes, aux atouts et aux camps (migration
 * 20261122000100_duel_des_gaulois). Sert au test qui compare le SQL au moteur, et à qui doit lire un camp gardé par le
 * serveur.
 *
 * - Une carte : 27 entiers, son rôle (0 frappe, 1 tête, 2 garde, 3 élan, 4 souffle), son prix, sa force, son repos, puis
 *   ses 23 mots-clés dans l'ordre de `MOTS_CLES`. Une main : ses cinq cartes à la suite.
 * - Des atouts : 21 entiers, dans l'ordre de `CLES_DES_ATOUTS`.
 * - Un camp : vie, vie de départ, énergie, plafond, élan, souffles pris, survie, premier coup, première fatigue, premier
 *   souffle, le repos des cinq cartes, le nombre de saignements, puis pour chacun ses manches restantes et 1 s'il est neuf.
 */
import { CLES_DES_ATOUTS, MOTS_CLES } from "./effets.ts";
import type { Atouts } from "./effets.ts";
import { P, ROLES } from "./regles.ts";
import type { Camp, Carte, Role } from "./regles.ts";

export const ROLES_EN_ENTIERS: readonly Role[] = ["frappe", "tete", "garde", "elan", "souffle"];
export const ENTIERS_PAR_CARTE = 27;

export const carteEnEntiers = (c: Carte): number[] => [ROLES_EN_ENTIERS.indexOf(c.role), c.c, c.f, c.repos, ...MOTS_CLES.map((m) => c.mots[m] ?? 0)];
export const mainEnEntiers = (main: readonly Carte[]): number[] => main.flatMap(carteEnEntiers);
export const atoutsEnEntiers = (a: Atouts): number[] => CLES_DES_ATOUTS.map((k) => a[k] ?? 0);

export const campEnEntiers = (c: Camp): number[] => [
  c.vie, c.vieMax, c.energie, c.plafond, c.elan, c.souffles,
  c.drapeaux.survie, c.drapeaux.premierCoup, c.drapeaux.premiereFatigue, c.drapeaux.premierSouffle,
  ...c.repos,
  c.saignes.length,
  ...c.saignes.flatMap((s) => [s.t, s.neuf ? 1 : 0]),
];

/** Un camp lu depuis ses entiers, avec sa main et ses atouts (que le serveur garde à part). */
export function campDesEntiers(e: readonly number[], main: readonly Carte[], at: Atouts): Camp {
  const n = (i: number): number => {
    const v = e[i];
    if (v === undefined || !Number.isInteger(v)) throw new Error("camp en entiers mal formé");
    return v;
  };
  const k = n(15), saignes = Array.from({ length: k }, (_, j) => ({ n: P.SAIGNE_PAR_MANCHE, t: n(16 + 2 * j), neuf: n(17 + 2 * j) === 1 }));
  if (main.length !== 5 || e.length !== 16 + 2 * k) throw new Error("camp en entiers mal formé");
  for (const [i, c] of main.entries()) if (ROLES[c.e] !== c.role || i !== ROLES_EN_ENTIERS.indexOf(c.role)) throw new Error("main hors de l'ordre");
  return {
    vie: n(0), vieMax: n(1), energie: n(2), plafond: n(3), elan: n(4), souffles: n(5),
    saignes, main: main.slice(), repos: [n(10), n(11), n(12), n(13), n(14)], at: { ...at },
    drapeaux: { survie: n(6), premierCoup: n(7), premiereFatigue: n(8), premierSouffle: n(9) },
  };
}
