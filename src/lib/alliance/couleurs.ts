/**
 * Les couleurs des alliances sur la carte : huit teintes bien distinctes, lisibles sur le fond sombre de la carte, au choix
 * de l'encadrement. Le serveur garde la valeur 0xRRGGBB ; une valeur hors de cette liste reste affichée telle quelle.
 */
export const COULEURS_ALLIANCE = [
  { nom: "Bleu ciel", valeur: 0x38bdf8 },
  { nom: "Or", valeur: 0xfacc15 },
  { nom: "Vert", valeur: 0x4ade80 },
  { nom: "Orange", valeur: 0xfb923c },
  { nom: "Rose", valeur: 0xf472b6 },
  { nom: "Violet", valeur: 0xa78bfa },
  { nom: "Rouge", valeur: 0xf87171 },
  { nom: "Blanc", valeur: 0xe5e7eb },
] as const;

export const rgbDe = (valeur: number): [number, number, number] => [(valeur >> 16) & 0xff, (valeur >> 8) & 0xff, valeur & 0xff];

export const cssDe = (valeur: number): string => `#${(valeur & 0xffffff).toString(16).padStart(6, "0")}`;

export const nomDeCouleur = (valeur: number): string => COULEURS_ALLIANCE.find((c) => c.valeur === valeur)?.nom ?? cssDe(valeur);

/** La première couleur qu'aucune alliance ne porte encore, pour une nouvelle alliance. */
export function couleurLibre(prises: readonly number[]): number {
  return (COULEURS_ALLIANCE.find((c) => !prises.includes(c.valeur)) ?? COULEURS_ALLIANCE[0]).valeur;
}
