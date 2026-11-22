/**
 * Les règles de la roue du charron, reprises au chiffre près de la maquette validée (`c2/jeux/roue/regles.js`) : 36 cases,
 * sans zéro, 18 rouges (losange) et 18 bleues (rond). Le numéro paie 36 fois la mise ; couleur, pair, impair, 1 à 18 et
 * 19 à 36 paient 2 fois ; les tiers et les colonnes 3 fois (mise comprise). Chaque pari rend en moyenne exactement sa mise.
 * Le serveur tire le numéro (`jouer_roue`) ; ces règles disent seulement ce qu'il rend.
 */
import type { MisesDeLaRoue, PariDeLaRoue } from "../contrat-casino";
import { PARIS_DE_LA_ROUE } from "../contrat-casino";

/** Les 18 numéros rouges ; les 18 autres sont bleus. Autant de chaque dans chaque tiers, colonne, moitié, et chez les pairs comme les impairs. */
export const ROUGES: ReadonlySet<number> = new Set([3, 4, 5, 9, 10, 12, 13, 14, 18, 20, 22, 24, 25, 26, 29, 31, 33, 35]);

/** L'ordre des cases autour de la roue : rouge, bleu, rouge, bleu… */
export const ORDRE_DE_LA_ROUE: readonly number[] = [24, 16, 25, 15, 4, 19, 13, 8, 18, 34, 26, 11, 29, 17, 22, 36, 3, 6, 35, 28, 14, 23, 12, 1, 20, 7, 10, 21, 31, 27, 33, 2, 5, 30, 9, 32];

export interface PariDeLaTable {
  id: PariDeLaRoue;
  nom: string;
  /** Ce qu'il rend, mise comprise, en fois la mise. */
  fois: number;
  /** Les numéros qui le font gagner. */
  nums: readonly number[];
}

const TOUS = Array.from({ length: 36 }, (_, i) => i + 1);
const pari = (id: PariDeLaRoue, nom: string, fois: number, garde: (x: number) => boolean): PariDeLaTable => ({ id, nom, fois, nums: TOUS.filter(garde) });

/** Les 48 paris de la table, par identifiant. */
export const PARIS_ROUE: Readonly<Record<string, PariDeLaTable>> = Object.fromEntries(
  [
    ...TOUS.map((n) => pari(`n${n}`, `Le ${n}`, 36, (x) => x === n)),
    pari("rouge", "Rouge", 2, (x) => ROUGES.has(x)),
    pari("bleu", "Bleu", 2, (x) => !ROUGES.has(x)),
    pari("pair", "Pair", 2, (x) => x % 2 === 0),
    pari("impair", "Impair", 2, (x) => x % 2 === 1),
    pari("bas", "De 1 à 18", 2, (x) => x <= 18),
    pari("haut", "De 19 à 36", 2, (x) => x >= 19),
    pari("t1", "De 1 à 12", 3, (x) => x <= 12),
    pari("t2", "De 13 à 24", 3, (x) => x >= 13 && x <= 24),
    pari("t3", "De 25 à 36", 3, (x) => x >= 25),
    pari("c1", "Colonne du 1", 3, (x) => x % 3 === 1),
    pari("c2", "Colonne du 2", 3, (x) => x % 3 === 2),
    pari("c3", "Colonne du 3", 3, (x) => x % 3 === 0),
  ].map((p) => [p.id, p]),
);

/** Les identifiants des paris, dans l'ordre du contrat. */
export const IDS_DE_LA_ROUE: readonly string[] = PARIS_DE_LA_ROUE;

/** Ce que rend chaque pari pour le numéro sorti, mise comprise, et le total. Un pari inconnu ne rend rien. */
export function payerLaRoue(mises: MisesDeLaRoue | Readonly<Record<string, number>>, numero: number): { total: number; parPari: Record<string, number> } {
  const parPari: Record<string, number> = {};
  let total = 0;
  for (const [id, mise] of Object.entries(mises)) {
    const p = PARIS_ROUE[id];
    const g = p && typeof mise === "number" && p.nums.includes(numero) ? mise * p.fois : 0;
    parPari[id] = g;
    total += g;
  }
  return { total, parPari };
}
