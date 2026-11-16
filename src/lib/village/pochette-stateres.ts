/**
 * La pochette de statères (16 novembre 2026) : ce que ses écrans (`src/components/village/PochetteStateres.tsx`) lisent et
 * déduisent. Des calculs purs : la lecture des réponses du serveur, ce que la pochette rend en moyenne, la chance d'y
 * gagner, la raison d'une pochette fermée, les rangées du tambour et le dessin de chaque lot. Rien ne décide d'un droit,
 * d'un prix ni d'un tirage : le serveur le fait (`contrat.ts`, « La pochette de statères »).
 *
 * Le jeu est juste quand ce que la pochette rend en moyenne vaut son prix : `retourMoyen` le calcule sur les lots que le
 * serveur donne, et l'écran l'écrit tel quel, sans l'arrondir en sa faveur.
 */
import { casesDuStatere } from "../../../supabase/functions/code-discord/statere";
import { ORDRE_RARETES_DES_OBJETS, type RareteDObjet } from "../gaulois";
import { errorMessage } from "../compte/errors";
import type { LotDeStateres, MaPochetteStateres, PochetteStateresReponse } from "./contrat";
import { manque, messageDuRefus, stateres } from "./ecran-boutique";
import { bandeDuTambour, type Bande } from "./tambour";

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;

/** L'ancre de la pochette de statères dans « La boutique ». */
export const ANCRE_POCHETTE_STATERES = "pochette-stateres";

/** Le plus de lots qu'une pochette peut avoir : un par couleur de rareté, du commun au divin. */
export const LOTS_AU_PLUS = ORDRE_RARETES_DES_OBJETS.length;

/**
 * Les lots tels que le serveur les donne, rangés par rang : de 1 à six lots, des rangs 1, 2, 3… sans trou, des chances
 * positives qui font 100 pour cent (à un millième près), des gains entiers positifs. Sinon `null` : l'écran ne montre pas
 * une pochette dont il ne saurait pas dire les chances.
 */
export function lireLots(valeur: unknown): LotDeStateres[] | null {
  if (!Array.isArray(valeur) || valeur.length < 1 || valeur.length > LOTS_AU_PLUS) return null;
  const lots: LotDeStateres[] = [];
  for (const ligne of valeur) {
    if (!estObjetJson(ligne)) return null;
    const { rang, chance, gain } = ligne;
    if (!entier(rang, 1) || !entier(gain, 1) || typeof chance !== "number" || !Number.isFinite(chance) || chance <= 0) return null;
    lots.push({ rang, chance, gain });
  }
  lots.sort((a, b) => a.rang - b.rang);
  if (lots.some((lot, i) => lot.rang !== i + 1)) return null;
  const total = lots.reduce((somme, lot) => somme + lot.chance, 0);
  return Math.abs(total - 100) < 0.001 ? lots : null;
}

/** `get_pochette_stateres()` lue ; `null` si la réponse n'a pas la forme du contrat. */
export function lireMaPochetteStateres(reponse: unknown): MaPochetteStateres | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const { solde, peut_ouvrir, prix, plafond, ouvertes } = reponse;
  const lots = lireLots(reponse["lots"]);
  if (!entier(solde, 0) || typeof peut_ouvrir !== "boolean" || !entier(prix, 1) || !entier(plafond, 1) || !entier(ouvertes, 0) || !lots) return null;
  return { ok: true, solde, peut_ouvrir, prix, plafond, ouvertes, lots };
}

/** `ouvrir_pochette_stateres()` lue ; `null` si la réponse n'a pas la forme du contrat. */
export function lireOuvertureDeStateres(reponse: unknown): PochetteStateresReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const { solde, lot, ouvertes } = reponse;
  if (!entier(solde, 0) || !entier(ouvertes, 0) || !estObjetJson(lot)) return null;
  const { rang, gain } = lot;
  if (!entier(rang, 1) || rang > LOTS_AU_PLUS || !entier(gain, 1)) return null;
  return { ok: true, solde, lot: { rang, gain }, ouvertes };
}

/** Ce que la pochette rend en moyenne, en statères : la somme des gains, chacun compté pour sa chance. */
export function retourMoyen(lots: readonly LotDeStateres[]): number {
  // Les chances en millièmes de pour cent, pour une somme sans erreur d'arrondi.
  return lots.reduce((somme, lot) => somme + Math.round(lot.chance * 1000) * lot.gain, 0) / 100000;
}

/** La chance, en pour cent, de recevoir plus que le prix payé. */
export function chanceDeGagner(lots: readonly LotDeStateres[], prix: number): number {
  return lots.reduce((somme, lot) => somme + (lot.gain > prix ? Math.round(lot.chance * 1000) : 0), 0) / 1000;
}

/** La couleur d'un lot : celle de la rareté de même rang, du commun (1) au divin (6). */
export function rareteDuLot(rang: number): RareteDObjet {
  return ORDRE_RARETES_DES_OBJETS[Math.min(Math.max(rang, 1), LOTS_AU_PLUS) - 1] ?? "commun";
}

/** Les pochettes qu'il reste à ouvrir aujourd'hui. */
export const resteAujourdhui = (ma: Pick<MaPochetteStateres, "plafond" | "ouvertes">): number => Math.max(0, ma.plafond - ma.ouvertes);

/** Les mots d'un refus de la pochette de statères. `manque` : les statères qui manquent, quand l'écran le sait. */
export function messageDuRefusDesStateres(code: string, contexte: { manque?: number | null } = {}): string {
  if (code === "solde_insuffisant" || code === "not_validated" || code === "no_gaulois") return messageDuRefus(code, contexte);
  return errorMessage(code);
}

/**
 * Pourquoi ce compte ne peut pas ouvrir la pochette de statères, dans l'ordre où le serveur refuserait ; `null` s'il le
 * peut. `solde` : le dernier que le serveur a donné.
 */
export function raisonPochetteStateresFermee(ma: Pick<MaPochetteStateres, "peut_ouvrir" | "prix" | "plafond" | "ouvertes">, solde: number): string | null {
  if (!ma.peut_ouvrir) return messageDuRefus("not_validated");
  if (resteAujourdhui(ma) <= 0) return errorMessage("plafond_du_jour");
  const ilManque = manque(solde, ma.prix);
  return ilManque > 0 ? `Il vous manque ${stateres(ilManque)}.` : null;
}

/** La pochette après une ouverture : le solde et le compte du jour que le serveur a répondus. */
export function apresLOuverture(ma: MaPochetteStateres, reponse: PochetteStateresReponse): MaPochetteStateres {
  return { ...ma, solde: reponse.solde, ouvertes: reponse.ouvertes };
}

/** Le lot tiré par un nombre `u` de 0 à 1, comme le serveur tire : les lots se suivent, chacun sur une longueur égale à sa chance. */
export function lotSelon(lots: readonly LotDeStateres[], u: number): LotDeStateres | null {
  const total = lots.reduce((somme, lot) => somme + lot.chance, 0);
  if (!(total > 0)) return null;
  let reste = Math.min(Math.max(u, 0), 1) * total;
  for (const lot of lots) {
    if (reste < lot.chance) return lot;
    reste -= lot.chance;
  }
  return lots[lots.length - 1] ?? null;
}

/**
 * La bande du tambour : chaque rangée qui passe est un lot tiré à ses vraies chances, et le lot que le serveur a tiré est
 * à la place où le tambour s'arrête. `null` si ce lot n'est pas dans la liste.
 */
export function bandeDesStateres(rang: number, lots: readonly LotDeStateres[], hasard: () => number = Math.random): Bande<LotDeStateres> | null {
  const tire = lots.find((lot) => lot.rang === rang);
  if (!tire) return null;
  return bandeDuTambour({ valeur: tire, rarete: rareteDuLot(tire.rang) }, () => {
    const lot = lotSelon(lots, hasard());
    return lot && { valeur: lot, rarete: rareteDuLot(lot.rang) };
  });
}

/** Un dessin prêt à peindre : ses cases, rangée par rangée. */
export interface DessinDeLot {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

const PIECE = 12;
/** Où poser les pièces de chaque lot, du fond vers l'avant : une pièce au rang 1, un tas de six au rang 6. */
const TAS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0]],
  [
    [0, 0],
    [8, 0],
  ],
  [
    [4, 0],
    [0, 7],
    [8, 7],
  ],
  [
    [8, 0],
    [0, 7],
    [8, 7],
    [16, 7],
  ],
  [
    [4, 0],
    [12, 0],
    [0, 7],
    [8, 7],
    [16, 7],
  ],
  [
    [8, 0],
    [4, 7],
    [12, 7],
    [0, 14],
    [8, 14],
    [16, 14],
  ],
];
const DESSINS = new Map<number, DessinDeLot>();

/** Le dessin d'un lot, décoratif : autant de statères que son rang, en tas. Son gain est toujours écrit à côté. */
export function dessinDuLot(rang: number): DessinDeLot {
  const n = Math.min(Math.max(Math.round(rang), 1), TAS.length);
  let dessin = DESSINS.get(n);
  if (dessin) return dessin;
  const places = TAS[n - 1] ?? [[0, 0]];
  const largeur = Math.max(...places.map(([x]) => x)) + PIECE;
  const hauteur = Math.max(...places.map(([, y]) => y)) + PIECE;
  const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(null);
  const piece = casesDuStatere(PIECE);
  for (const [x0, y0] of places) {
    piece.forEach((couleur, i) => {
      if (couleur) cases[(y0 + Math.floor(i / PIECE)) * largeur + x0 + (i % PIECE)] = couleur;
    });
  }
  dessin = { largeur, hauteur, cases };
  DESSINS.set(n, dessin);
  return dessin;
}
