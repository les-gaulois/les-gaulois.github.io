/**
 * La pochette surprise du village des Gaulois, en pixels : un petit sac de cuir noué d'un cordon rouge, frappé d'un losange
 * doré, le signe des raretés. Dessin original, fait pour le site le 13 novembre 2026 (Claude Fable 5.2), calculé case par
 * case à partir de sa silhouette : il ne reprend aucune œuvre.
 */

/** Le côté du dessin, en cases. */
export const POCHETTE_COTE = 32;

const CONTOUR = "#3a2412";
const CUIR = ["#f0c27c", "#d99a55", "#b9783a", "#8f5727", "#6b3d1a"] as const;
const CORDON = ["#ff6b78", "#d81e33", "#8f1220"] as const;
const OR = ["#fff1a8", "#f2b632", "#a86d0c"] as const;
const ECLAT = "#fff6d6";

/** La demi-largeur du sac, rangée par rangée : le col froncé, le nœud, puis la panse. 0 : rien sur cette rangée. */
const SILHOUETTE: readonly number[] = [0, 0, 0, 4, 6, 6, 5, 4, 3, 4, 4, 5, 7, 9, 10, 11, 12, 12, 13, 13, 13, 13, 13, 13, 13, 12, 12, 11, 9, 6, 0, 0];
const NOEUD = [9, 10] as const;
/** Le centre du losange frappé sur la panse, et sa demi-diagonale. */
const LOSANGE = { x: 15.5, y: 20.5, rayon: 4.5 } as const;
/** Les petits éclats autour du sac : une croix de trois cases. */
const ECLATS: readonly (readonly [number, number])[] = [
  [4, 7],
  [28, 12],
  [26, 3],
];

/** La pochette case par case, rangée par rangée : 32 × 32 couleurs « #rrggbb », `null` pour une case vide. */
export function casesDeLaPochette(): (string | null)[] {
  const cote = POCHETTE_COTE;
  const cases: (string | null)[] = new Array<string | null>(cote * cote).fill(null);
  const dedans = (x: number, y: number): boolean => {
    const demi = SILHOUETTE[y] ?? 0;
    return demi > 0 && x >= 16 - demi && x <= 15 + demi;
  };
  const pose = (x: number, y: number, couleur: string): void => {
    if (x >= 0 && y >= 0 && x < cote && y < cote) cases[y * cote + x] = couleur;
  };
  for (let y = 0; y < cote; y++) {
    const demi = SILHOUETTE[y] ?? 0;
    for (let x = 0; x < cote; x++) {
      if (!dedans(x, y)) continue;
      const bord = !dedans(x - 1, y) || !dedans(x + 1, y) || !dedans(x, y - 1) || !dedans(x, y + 1);
      if (bord) {
        pose(x, y, CONTOUR);
        continue;
      }
      // La lumière vient d'en haut à gauche : de 0 (bord gauche) à 1 (bord droit), le bas un peu plus sombre.
      const t = (x - (16 - demi)) / (2 * demi - 1);
      if ((NOEUD as readonly number[]).includes(y)) {
        pose(x, y, t < 0.35 ? CORDON[0] : t < 0.75 ? CORDON[1] : CORDON[2]);
        continue;
      }
      let ton = t < 0.14 ? 2 : t < 0.3 ? 0 : t < 0.46 ? 1 : t < 0.74 ? 2 : t < 0.9 ? 3 : 4;
      if (y >= 27) ton = Math.min(4, ton + 1);
      // Les plis du col froncé : une case sombre toutes les trois.
      if (y < NOEUD[0] && (x + 1) % 3 === 0) ton = Math.min(4, ton + 2);
      pose(x, y, CUIR[ton] ?? CUIR[2]);
    }
  }
  // Les deux brins du cordon, qui pendent à droite du nœud.
  for (const [x, y, couleur] of [
    [20, 10, CONTOUR],
    [21, 11, CORDON[1]],
    [22, 12, CORDON[1]],
    [22, 13, CORDON[2]],
    [23, 14, CORDON[0]],
    [20, 11, CORDON[0]],
    [20, 12, CORDON[1]],
    [20, 13, CORDON[2]],
  ] as const)
    pose(x, y, couleur);
  // Le losange doré, cerné de sombre, éclairé en haut à gauche.
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const d = Math.abs(x - LOSANGE.x) + Math.abs(y - LOSANGE.y);
      if (d > LOSANGE.rayon + 1) continue;
      if (d > LOSANGE.rayon) pose(x, y, CUIR[4]);
      else if (d > LOSANGE.rayon - 1) pose(x, y, x + y < LOSANGE.x + LOSANGE.y ? OR[1] : OR[2]);
      else pose(x, y, x + y < LOSANGE.x + LOSANGE.y - 1 ? OR[0] : OR[1]);
    }
  }
  for (const [x, y] of ECLATS) {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      pose(x + dx, y + dy, ECLAT);
  }
  return cases;
}
