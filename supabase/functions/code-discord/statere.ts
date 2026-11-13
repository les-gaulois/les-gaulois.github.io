/**
 * Le statère, la pièce du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois »), en pixels : un seul dessin
 * pour le site (prix de la boutique, solde) et pour les images du robot.
 *
 * Une pièce d'or frappée d'un cheval au galop, un soleil au-dessus de la croupe, trois grains sous le ventre : les motifs
 * abstraits des monnaies gauloises, sans copier aucune pièce de musée. Dessin original, fait pour le clan [GAL] le
 * 13 novembre 2026. Trois tailles dessinées à la main, case par case, et non agrandies : à 12 cases, la pièce se lit dans
 * une ligne de texte, sur fond sombre ; à 16 et 24, le soleil puis les grains apparaissent.
 *
 * Ses couleurs sont celles du légendaire (`--rarete-legendaire*` de `global.css`), plus un brun pour le creux de la frappe.
 * Elle ne se confond pas avec un cadre de rareté : un cadre est carré et vide, la pièce est ronde, pleine et frappée.
 *
 * Une grille s'écrit comme celles de `gaulois.ts` : rangée par rangée, « . » pour une case vide, chaque autre lettre une
 * couleur de `COULEURS_STATERE`. La lumière vient d'en haut à gauche : le bord y est clair, et sombre en bas à droite.
 */

/** Les tailles dessinées, en cases de côté : la petite pour un prix dans une ligne, la grande pour un solde ou une image. */
export const TAILLES_STATERE = [12, 16, 24] as const;
export type TailleStatere = (typeof TAILLES_STATERE)[number];

/** Les couleurs de la pièce, de la plus claire à la plus sombre. */
export const COULEURS_STATERE: Readonly<Record<string, string>> = {
  // L'éclat et la lumière du bord.
  n: "#fff1a8",
  y: "#ffdd80",
  // L'or.
  g: "#f2b632",
  // Son ombre.
  G: "#a86d0c",
  // Le creux de la frappe : le cheval, le soleil, les grains.
  o: "#6e4406",
};

const GRILLES: Readonly<Record<TailleStatere, readonly string[]>> = {
  12: [
    "....nnny....",
    "..nnyyyygg..",
    ".nyygggoggG.",
    ".nygggooogG.",
    "nyggoooogggG",
    "nygooooogggG",
    "nygogggoggGG",
    "yyogggggogGG",
    ".ygggggggGG.",
    ".yggggggGGG.",
    "..ggggGGGG..",
    "....GGGG....",
  ],
  16: [
    ".....nnnnny.....",
    "...nnyyyyygyy...",
    "..nyyggggggogg..",
    ".nygooggggooooG.",
    ".nygoogggooogoG.",
    "nyggggggoooggggG",
    "nygggggoooogggGG",
    "nyggooooooogggGG",
    "nygoooooooogggGG",
    "nyogoogggoogggGG",
    "yggogogggogoggGG",
    ".ygoggogggggoGG.",
    ".ygggggggggggGG.",
    "..gggggggggGGG..",
    "...gggGGGGGGG...",
    ".....GGGGGG.....",
  ],
  24: [
    ".........nnnnnn.........",
    "......nnnyyyyyyyyy......",
    ".....nyyygggggggggy.....",
    "....nygggggggggggggg....",
    "...nygoooggggggoggggG...",
    "..nyggogogggggoooggggG..",
    ".nygggoooggggoooooogggG.",
    ".nygggggggggoooogoogggG.",
    ".nyggggggggoooogggggggG.",
    "nyggggggggooooogggggggGG",
    "nyggggooooooooooggggggGG",
    "nyggooooooooooooggggggGG",
    "nygoggooooooooogggggggGG",
    "nygoggoogoggooogggggggGG",
    "nyggooogggogogooggggggGG",
    ".ygggoggggogogggoggggGG.",
    ".yggooggggggoggggogggGG.",
    ".ygggggggggggggggggggGG.",
    "..ygggggoggoggogggggGG..",
    "...ggggggggggggggggGG...",
    "....ggggggggggggggGG....",
    ".....ggggggggggGGGG.....",
    "......gGGGGGGGGGGG......",
    ".........GGGGGG.........",
  ],
};

/** La pièce case par case, rangée par rangée : `taille` × `taille` couleurs « #rrggbb », `null` pour une case vide. */
export function casesDuStatere(taille: TailleStatere): (string | null)[] {
  return GRILLES[taille].flatMap((ligne) => Array.from(ligne, (lettre) => COULEURS_STATERE[lettre] ?? null));
}
