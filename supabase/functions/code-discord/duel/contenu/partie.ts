/**
 * Une partie d'un défi d'entraînement : son état de départ, le coup de l'adversaire et l'issue. L'écran, les tests et, s'il
 * le faut, le serveur jouent un défi par ces trois fonctions et par le moteur (`../regles.ts`), sans autre règle.
 *
 * - Les deux camps partent de leur main, puis le défi pose leur vie, leur énergie, et au besoin leur élan, leurs repos,
 *   leurs saignements et leurs souffles ; le lieu du défi vaut pour les deux.
 * - Un adversaire qui annonce joue à chaque manche la carte annoncée ; si elle se repose (un gel, par exemple), il joue sa
 *   première carte prête, dans l'ordre de sa main. Un adversaire « libre » joue ce qu'il veut : l'écran le fait jouer par
 *   la machine, et la solution du défi gagne contre toutes ses cartes.
 * - Le défi est réussi quand l'autre tombe avant la fin (`gagner` comme `survivre`), ou quand on est encore debout à la
 *   fin d'un défi `survivre` ; il est raté sinon.
 */
import { P, camp, carte, libres, verdict, type Camp, type OptionsDuCamp } from "../regles.ts";
import type { CampDuDefi, Defi } from "./defis.ts";

function campDuDefi(c: CampDuDefi, opts: OptionsDuCamp): Camp {
  const x = camp(c.main.map(carte), opts);
  x.vie = c.vie;
  x.vieMax = Math.max(c.vieMax ?? c.vie, c.vie);
  x.energie = c.energie;
  if (c.elan !== undefined) x.elan = c.elan;
  if (c.repos) x.repos = c.repos.slice();
  if (c.saignes) x.saignes = c.saignes.map((t) => ({ n: P.SAIGNE_PAR_MANCHE, t, neuf: false }));
  if (c.souffles !== undefined) x.souffles = c.souffles;
  return x;
}

/** L'état de départ d'un défi : ton camp `a`, le sien `b`, et le numéro de la première manche `m`. */
export function departDuDefi(d: Defi): { a: Camp; b: Camp; m: number } {
  const opts: OptionsDuCamp = d.lieu ? { lieu: d.lieu } : {};
  return { a: campDuDefi(d.toi, opts), b: campDuDefi(d.lui, opts), m: d.manche };
}

/** La carte (son rang dans la main) que joue un adversaire qui annonce, à sa manche n° `k` (0 pour la première). */
export function coupAnnonce(d: Defi, b: Pick<Camp, "repos">, k: number): number {
  if (d.adversaire === "libre") throw new Error(`${d.id} : l'adversaire n'annonce rien`);
  const id = d.adversaire.annonce[k];
  const i = id === undefined ? -1 : d.lui.main.indexOf(id);
  if (i < 0) throw new Error(`${d.id} : rien d'annoncé à la manche ${k + 1}`);
  if (b.repos[i] === 0) return i;
  return libres(b)[0] ?? i;
}

/** Où en est le défi. */
export type IssueDuDefi = "en-cours" | "reussi" | "rate";

/**
 * L'issue du défi après `jouees` manches, les deux camps étant `a` et `b` : `fini` dit si la dernière manche a mis l'un des
 * deux à terre (`Manche.fini` du moteur).
 */
export function issueDuDefi(d: Defi, a: Pick<Camp, "vie">, b: Pick<Camp, "vie">, fini: boolean, jouees: number): IssueDuDefi {
  if (fini) return verdict(a, b) > 0 ? "reussi" : "rate";
  if (jouees < d.but.manches) return "en-cours";
  return d.but.type === "survivre" ? "reussi" : "rate";
}
