/**
 * La pochette des familiers, en pixels : un sac de toile verte noué d'un cordon doré, frappé d'une empreinte de patte, d'où
 * dépassent deux oreilles. Dessin original, fait pour le site le 15 novembre 2026 (Claude Fable 5.2), calculé case par
 * case à partir de sa silhouette, comme la pochette surprise (`PochetteDessin.ts`) : il ne reprend aucune œuvre.
 */

/** Le côté du dessin, en cases. */
export const POCHETTE_FAMILIERS_COTE = 32;

const CONTOUR = "#10261c";
const TOILE = ["#8fe0b0", "#4dbb86", "#2f9468", "#1f6f4d", "#134a34"] as const;
const CORDON = ["#fff1a8", "#f2b632", "#a86d0c"] as const;
const PATTE = ["#fff4dc", "#ecd3a2"] as const;
const POIL = ["#d99a55", "#b9783a", "#8f5727"] as const;
const ECLAT = "#fff6d6";

/** La demi-largeur du sac, rangée par rangée : le col ouvert, le nœud, puis la panse. 0 : rien sur cette rangée. */
const SILHOUETTE: readonly number[] = [0, 0, 0, 0, 0, 6, 6, 5, 4, 4, 4, 5, 7, 9, 11, 12, 13, 13, 14, 14, 14, 14, 14, 14, 14, 13, 13, 12, 10, 7, 0, 0];
const NOEUD = [9, 10] as const;
/** Les deux oreilles qui dépassent du col : la pointe de chacune, en haut. */
const OREILLES: readonly (readonly [number, number])[] = [
  [12, 1],
  [19, 1],
];
/** L'empreinte : le coussinet, puis quatre doigts, chacun un rond (centre et rayon). */
const COUSSINET = { x: 15.5, y: 23, rx: 3.6, ry: 2.6 } as const;
const DOIGTS: readonly (readonly [number, number, number])[] = [
  [10.5, 19.5, 1.5],
  [13.5, 17.5, 1.5],
  [17.5, 17.5, 1.5],
  [20.5, 19.5, 1.5],
];
/** Les petits éclats autour du sac : une croix de trois cases. */
const ECLATS: readonly (readonly [number, number])[] = [
  [3, 9],
  [28, 11],
  [26, 3],
];

/** La pochette des familiers case par case, rangée par rangée : 32 × 32 couleurs « #rrggbb », `null` pour une case vide. */
export function casesDeLaPochetteFamiliers(): (string | null)[] {
  const cote = POCHETTE_FAMILIERS_COTE;
  const cases: (string | null)[] = new Array<string | null>(cote * cote).fill(null);
  const dedans = (x: number, y: number): boolean => {
    const demi = SILHOUETTE[y] ?? 0;
    return demi > 0 && x >= 16 - demi && x <= 15 + demi;
  };
  const pose = (x: number, y: number, couleur: string): void => {
    if (x >= 0 && y >= 0 && x < cote && y < cote) cases[y * cote + x] = couleur;
  };
  // Les oreilles d'abord : le col du sac passe devant leur base.
  for (const [pointe, haut] of OREILLES) {
    for (let dy = 0; dy < 5; dy++) {
      const demi = Math.min(2, Math.floor((dy + 1) / 2));
      for (let dx = -demi; dx <= demi; dx++) {
        const bord = Math.abs(dx) === demi || dy === 0;
        pose(pointe + dx, haut + dy, bord ? CONTOUR : dx < 0 ? POIL[0] : POIL[1]);
      }
    }
  }
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
      // Le col ouvert : l'intérieur du sac, sombre, puis ses plis.
      if (y < NOEUD[0]) ton = y === 6 ? 4 : (x + 1) % 3 === 0 ? Math.min(4, ton + 2) : ton;
      pose(x, y, TOILE[ton] ?? TOILE[2]);
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
  // L'empreinte de patte, claire, éclairée en haut à gauche.
  const rond = (cx: number, cy: number, rx: number, ry: number): void => {
    for (let y = 0; y < cote; y++) {
      for (let x = 0; x < cote; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) pose(x, y, x - cx + (y - cy) > rx * 0.35 ? PATTE[1] : PATTE[0]);
      }
    }
  };
  rond(COUSSINET.x, COUSSINET.y, COUSSINET.rx, COUSSINET.ry);
  for (const [x, y, rayon] of DOIGTS) rond(x, y, rayon, rayon);
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
