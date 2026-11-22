/**
 * Le solveur des défis d'entraînement du duel « Coup pour coup », pour les tests. Il ne joue que par le moteur
 * (`regles.ts`) et par la partie d'un défi (`contenu/partie.ts`) : aucune règle n'est refaite ici.
 */
import type { Defi } from "../../supabase/functions/code-discord/duel/contenu/defis";
import { coupAnnonce, departDuDefi, issueDuDefi } from "../../supabase/functions/code-discord/duel/contenu/partie";
import { hasardDeLaGraine } from "../../supabase/functions/code-discord/duel/machine";
import { libres, manche, type Camp } from "../../supabase/functions/code-discord/duel/regles";

/** Les réponses possibles de l'adversaire : toutes ses cartes jouables, ou la seule annoncée. */
const reponses = (d: Defi, b: Camp, k: number): number[] => (d.adversaire === "libre" ? libres(b) : [coupAnnonce(d, b, k)]);

/** La suite de cartes qui réussit le défi depuis cet état (`k` manches déjà jouées), ou `null`. */
function reussit(d: Defi, a: Camp, b: Camp, m: number, k: number): string[] | null {
  for (const ia of libres(a)) {
    const suite = apres(d, a, b, m, k, ia);
    if (suite) return [d.toi.main[ia]!, ...suite];
  }
  return null;
}

/** Ce coup réussit-il contre chaque réponse permise, en jouant au mieux ensuite ? La suite gagnante, ou `null`. */
function apres(d: Defi, a: Camp, b: Camp, m: number, k: number, ia: number): string[] | null {
  let premiere: string[] | null = null;
  for (const ib of reponses(d, b, k)) {
    const r = manche(a, b, ia, ib, m);
    const issue = issueDuDefi(d, r.a, r.b, r.fini, k + 1);
    const s = issue === "reussi" ? [] : issue === "rate" ? null : reussit(d, r.a, r.b, m + 1, k + 1);
    if (!s) return null;
    premiere ??= s;
  }
  return premiere;
}

export interface BilanDuDefi {
  /** Une suite de cartes qui réussit (contre l'annonce, ou contre la première réponse), ou `null`. */
  solution: string[] | null;
  /** Chaque premier coup permis, et s'il peut encore réussir. */
  premiers: { carte: string; bon: boolean }[];
  /** La part, en pour cent, de 400 parties jouées au hasard qui réussissent. */
  hasard: number;
}

/** Le bilan d'un défi : sa solution, ses premiers coups, et ce que donne le hasard. */
export function resoudre(d: Defi): BilanDuDefi {
  const { a, b, m } = departDuDefi(d);
  const solution = reussit(d, a, b, m, 0);
  const premiers = libres(a).map((ia) => ({ carte: d.toi.main[ia]!, bon: apres(d, a, b, m, 0, ia) !== null }));
  const alea = hasardDeLaGraine(20261122);
  const pris = (l: number[]): number => l[Math.floor(alea() * l.length)]!;
  let reussies = 0;
  for (let t = 0; t < 400; t++) {
    let { a: x, b: y } = departDuDefi(d);
    for (let k = 0; ; k++) {
      const r = manche(x, y, pris(libres(x)), d.adversaire === "libre" ? pris(libres(y)) : coupAnnonce(d, y, k), m + k);
      x = r.a;
      y = r.b;
      const issue = issueDuDefi(d, x, y, r.fini, k + 1);
      if (issue === "en-cours") continue;
      if (issue === "reussi") reussies++;
      break;
    }
  }
  return { solution, premiers, hasard: Math.round(reussies / 4) };
}
