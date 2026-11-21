/**
 * La palette du kit en pixels de « Mon Gaulois » : une lettre, une couleur, celles de la maquette validée par le pilote
 * (planche de Claude Fable 5.2, 19-21 novembre 2026). Les dessins du kit (`icones.ts`, `pieces.ts`, `paliers-de-victoires.ts`)
 * s'écrivent avec ces lettres. Voir « Le kit du jeu » dans docs/DESIGN.md.
 */
export const PAL = {
  k: "#070b1f",
  n: "#3a2606",
  o: "#9c6a0c",
  O: "#d9a21b",
  y: "#ffd84a",
  Y: "#fffbe6",
  r: "#a8101f",
  R: "#e0263a",
  p: "#ff8a8f",
  b: "#0b3fc4",
  B: "#2f6bff",
  c: "#9cc2ff",
  w: "#f6f1e3",
  W: "#cfc9b8",
  g: "#1f8a47",
  G: "#3fce6a",
  h: "#c4f9cb",
  v: "#5a2fc2",
  V: "#8b5cf6",
  l: "#d8c9ff",
  s: "#4a5578",
  S: "#8a96b8",
  t: "#c8d0e6",
  m: "#6b3f1c",
  M: "#a8682f",
  N: "#d9a35c",
  e: "#f5760f",
  E: "#d92d0f",
  j: "#ffc61a",
  f: "#4a1206",
  q: "#fff1a8",
} as const;

/** L'encre des contours : la couleur que le volume des icônes reconnaît comme un bord. */
export const ENCRE = PAL.k;

/**
 * Les couleurs des pièces qui changent avec le thème du site : « Neige Marine » (clair) et « Nuit Marine » (sombre). Le trait,
 * la face, la lumière, l'ombre et le creux des panneaux. Le reste du kit (boutons, rubans, barres, icônes) est le même dans les
 * deux thèmes : il se lit sur les deux fonds.
 */
export interface JetonsDesPieces {
  trait: string;
  face: string;
  lumiere: string;
  ombrePiece: string;
  creux: string;
  ombre: string;
  /** Le fond de page du site, au centre d'un écran du jeu (« Neige Marine » blanc, « Nuit Marine » marine). */
  page: string;
}

export const JETONS_DES_PIECES: Readonly<Record<"clair" | "sombre", JetonsDesPieces>> = {
  clair: { trait: "#0a1230", face: "#eef2fb", lumiere: "#ffffff", ombrePiece: "#b3c1e4", creux: "#c7d3ee", ombre: "rgba(10,18,48,.28)", page: "#ffffff" },
  sombre: { trait: "#040716", face: "#18265e", lumiere: "#3550b0", ombrePiece: "#0c1540", creux: "#0d1744", ombre: "rgba(2,4,14,.5)", page: "#0a1230" },
};

/** Les teintes d'une étiquette (pastille de menu, « Nouveau », « +90 ») : clair, corps, bas, écriture. */
export const TONS_DES_ETIQUETTES = {
  rouge: ["#ff8a8f", "#e0263a", "#a8101f", "#f6f1e3"],
  bleu: ["#9cc2ff", "#2f6bff", "#0b3fc4", "#f6f1e3"],
  or: ["#fffbe6", "#ffd84a", "#d9981b", "#231503"],
} as const satisfies Record<string, readonly [string, string, string, string]>;

export type TonDEtiquette = keyof typeof TONS_DES_ETIQUETTES;
