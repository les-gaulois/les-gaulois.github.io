/**
 * Les règles des dés, reprises au chiffre près de la maquette validée (`c2/jeux/des/regles.js`) : deux dés de 1 à 6.
 * Moins de 7 et plus de 7 paient 2,4 fois la mise, un double 6 fois, chaque somme de 2 à 12 : 36, 18, 12, 9, 7,2, 6, 7,2, 9,
 * 12, 18 et 36 fois (mise comprise). Chaque pari rend en moyenne exactement sa mise. Les multiples sont écrits en dixièmes :
 * sur une mise multiple de 10, le gain est toujours entier. Le serveur tire les deux faces (`jouer_des`).
 */
import type { MisesDesDes, PariDesDes } from "../contrat-casino";
import { PARIS_DES_DES } from "../contrat-casino";
import { parDixiemes } from "./commun";

/** Ce que paie chaque somme, en dixièmes de la mise. */
export const DIXIEMES_DE_LA_SOMME: Readonly<Record<number, number>> = { 2: 360, 3: 180, 4: 120, 5: 90, 6: 72, 7: 60, 8: 72, 9: 90, 10: 120, 11: 180, 12: 360 };

export interface PariDesFaces {
  id: PariDesDes;
  nom: string;
  /** Ce qu'il rend, mise comprise, en dixièmes de la mise (24 pour 2,4 fois). */
  dixiemes: number;
  somme?: number;
  gagne: (a: number, b: number) => boolean;
}

/** Les quatorze paris, dans l'ordre du contrat. */
export const PARIS_DES: readonly PariDesFaces[] = [
  { id: "moins", nom: "moins de 7", dixiemes: 24, gagne: (a, b) => a + b < 7 },
  { id: "double", nom: "un double", dixiemes: 60, gagne: (a, b) => a === b },
  { id: "plus", nom: "plus de 7", dixiemes: 24, gagne: (a, b) => a + b > 7 },
  ...Object.entries(DIXIEMES_DE_LA_SOMME).map(([s, dixiemes]): PariDesFaces => {
    const somme = Number(s);
    return { id: `s${somme}` as PariDesDes, somme, nom: somme === 7 ? "7 tout juste" : `la somme ${somme}`, dixiemes, gagne: (a, b) => a + b === somme };
  }),
];

export const PARIS_DES_PAR_ID: Readonly<Record<string, PariDesFaces>> = Object.fromEntries(PARIS_DES.map((p) => [p.id, p]));

/** Les identifiants des paris, dans l'ordre du contrat. */
export const IDS_DES_DES: readonly string[] = PARIS_DES_DES;

/** Ce que rend chaque pari pour les deux faces sorties, mise comprise, le total, et le meilleur multiple gagnant (en dixièmes, 0 sinon). */
export function payerLesDes(mises: MisesDesDes | Readonly<Record<string, number>>, [a, b]: readonly [number, number]): { total: number; parPari: Record<string, number>; meilleur: number } {
  const parPari: Record<string, number> = {};
  let total = 0;
  let meilleur = 0;
  for (const [id, mise] of Object.entries(mises)) {
    const p = PARIS_DES_PAR_ID[id];
    const g = p && typeof mise === "number" && p.gagne(a, b) ? parDixiemes(mise, p.dixiemes) : 0;
    parPari[id] = g;
    total += g;
    if (g > 0 && p) meilleur = Math.max(meilleur, p.dixiemes);
  }
  return { total, parPari, meilleur };
}
