/**
 * Les cartes de statères (22 novembre 2026, demande du pilote : « j'aimerais que tu me crées des cartes spéciales
 * statères »), pour la fin d'un booster qui rend des statères et pour les lots du booster de statères. Depuis le 28 novembre
 * 2026, elles sont faites dans le modèle unique des cartes des cosmétiques (`CarteDeStateres.tsx`, idée « La pièce » choisie
 * par le pilote) ; ici, ce qui ne dépend pas du dessin : les noms des lots et ce que la carte dit. Les montants viennent
 * toujours du serveur.
 */
import { nombre } from "../village/ecran-boutique";

/** Le rang d'une carte de statères : 0 pour des statères rendus, 1 à 6 pour les lots du booster de statères. */
export type RangDeStateres = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Ce que chaque rang montre : son nom (les noms proposés au pilote, qui a laissé Claude choisir). */
export interface LotDessine {
  nom: string;
}
export const LOTS_DESSINES: Readonly<Record<RangDeStateres, LotDessine>> = {
  0: { nom: "Statères rendus" },
  1: { nom: "Quelques pièces" },
  2: { nom: "La petite pile" },
  3: { nom: "La bourse" },
  4: { nom: "Le coffret" },
  5: { nom: "Le grand coffre" },
  6: { nom: "Le trésor" },
};
/** Un rang lu ramené entre 1 et 6 (un lot), ou 0 (un rendu). */
export const rangDeStateres = (rang: number): RangDeStateres => Math.min(6, Math.max(0, Math.round(rang))) as RangDeStateres;

/**
 * Ce que la carte dit aux lecteurs d'écran, d'un seul nom : « 640 statères rendus, 40 % du prix », ou « La bourse : 400
 * statères, lot 3 sur 6 ». La somme, la part et le nombre de lots sont ceux du serveur.
 */
export function motsDeLaCarteDeStateres(rang: RangDeStateres, gain: number, pourcent: number | null, total: number): string {
  if (rang === 0) return `${nombre(gain)} ${gain > 1 ? "statères rendus" : "statère rendu"}${pourcent !== null ? `, ${pourcent} % du prix` : ""}`;
  return `${LOTS_DESSINES[rang].nom} : ${nombre(gain)} ${gain > 1 ? "statères" : "statère"}, lot ${rang} sur ${total}`;
}

/** Un nombre groupé par milliers, avec une espace ordinaire (« 13 100 »). */
export const nombreEnCases = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
