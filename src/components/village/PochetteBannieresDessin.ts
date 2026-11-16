/**
 * La pochette des bannières, en pixels : un sac de velours violet noué d'un cordon doré, brodé d'or (un gonfanon serti
 * d'une pierre, un galon en bas de la panse), d'où dépasse un petit étendard rouge sur sa hampe dorée. Dessin original,
 * fait pour le site le 16 novembre 2026 (Claude Fable 5.2), calculé case par case à partir de sa silhouette, comme la
 * pochette surprise (`PochetteDessin.ts`) et la pochette des familiers (`PochetteFamiliersDessin.ts`) : il ne reprend
 * aucune œuvre.
 */

/** Le côté du dessin, en cases. */
export const POCHETTE_BANNIERES_COTE = 32;

const CONTOUR = "#1c0e36";
const VELOURS = ["#c9a2ff", "#9460e6", "#6c38c2", "#4a2196", "#30126a"] as const;
const CORDON = ["#fff1a8", "#f2b632", "#a86d0c"] as const;
const ETOFFE = ["#ff8a8f", "#e2283c", "#a01428"] as const;
const PIERRE = ["#ffffff", "#9fe6ff", "#3a8ec0"] as const;
const ECLAT = "#fff6d6";

/** La demi-largeur du sac, rangée par rangée : le col ouvert, le nœud, puis la panse. 0 : rien sur cette rangée. */
const SILHOUETTE: readonly number[] = [0, 0, 0, 0, 0, 6, 6, 5, 4, 4, 4, 5, 7, 9, 11, 12, 13, 13, 14, 14, 14, 14, 14, 14, 14, 13, 13, 12, 10, 7, 0, 0];
const NOEUD = [9, 10] as const;
/** L'étendard qui dépasse du col : la colonne de sa hampe, et, rangée par rangée depuis la rangée 1, la dernière colonne de l'étoffe (queue fendue). */
const HAMPE = 13;
const ETENDARD: readonly number[] = [23, 22, 21, 22, 23];
/** Le gonfanon brodé sur la panse : sa traverse, puis l'étoffe d'or, fendue en bas. */
const GONFANON = { gauche: 11, droite: 20, traverse: 16, haut: 17, bas: 25 } as const;
/** Les petits éclats autour du sac : une croix de trois cases. */
const ECLATS: readonly (readonly [number, number])[] = [
  [3, 9],
  [28, 11],
  [27, 2],
];

/** La pochette des bannières case par case, rangée par rangée : 32 × 32 couleurs « #rrggbb », `null` pour une case vide. */
export function casesDeLaPochetteBannieres(): (string | null)[] {
  const cote = POCHETTE_BANNIERES_COTE;
  const cases: (string | null)[] = new Array<string | null>(cote * cote).fill(null);
  const dedans = (x: number, y: number): boolean => {
    const demi = SILHOUETTE[y] ?? 0;
    return demi > 0 && x >= 16 - demi && x <= 15 + demi;
  };
  const pose = (x: number, y: number, couleur: string): void => {
    if (x >= 0 && y >= 0 && x < cote && y < cote) cases[y * cote + x] = couleur;
  };
  // L'étendard d'abord : le col du sac passe devant le pied de sa hampe.
  const etoffe = (x: number, y: number): boolean => y >= 1 && y <= ETENDARD.length && x > HAMPE && x <= (ETENDARD[y - 1] ?? 0);
  for (let y = 1; y <= ETENDARD.length; y++) {
    for (let x = HAMPE + 1; x <= (ETENDARD[y - 1] ?? 0); x++) {
      const bord = !etoffe(x + 1, y) || !etoffe(x, y - 1) || !etoffe(x, y + 1);
      // Un galon d'or au milieu, le rouge éclairé en haut.
      pose(x, y, bord ? CONTOUR : y === 3 ? CORDON[1] : y < 3 ? (x < 18 ? ETOFFE[0] : ETOFFE[1]) : ETOFFE[1]);
    }
  }
  for (let y = 0; y <= 7; y++) {
    pose(HAMPE - 1, y, CONTOUR);
    pose(HAMPE, y, y === 0 ? CORDON[0] : y < 5 ? CORDON[1] : CORDON[2]);
  }
  pose(HAMPE, 0, CORDON[0]);
  pose(HAMPE + 1, 0, CONTOUR);
  for (let y = 0; y < cote; y++) {
    const demi = SILHOUETTE[y] ?? 0;
    for (let x = 0; x < cote; x++) {
      if (!dedans(x, y)) continue;
      const bord = !dedans(x - 1, y) || !dedans(x + 1, y) || !dedans(x, y - 1) || !dedans(x, y + 1);
      if (bord) {
        // La hampe sort du col : elle traverse son bord du haut.
        if (!(x === HAMPE && y === 5)) pose(x, y, CONTOUR);
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
      // Le col ouvert : l'intérieur du sac, sombre, puis ses plis ; la hampe y plonge.
      if (y < NOEUD[0]) {
        if (x === HAMPE && y <= 7) continue;
        ton = y === 6 ? 4 : (x + 1) % 3 === 0 ? Math.min(4, ton + 2) : ton;
      }
      // Le galon brodé en bas de la panse : un point d'or sur deux.
      if (y === 27 && x % 2 === 0) {
        pose(x, y, t < 0.5 ? CORDON[1] : CORDON[2]);
        continue;
      }
      pose(x, y, VELOURS[ton] ?? VELOURS[2]);
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
  // Le gonfanon brodé d'or : une traverse à pommeaux, l'étoffe fendue en bas, éclairée en haut à gauche.
  const g = GONFANON;
  for (let x = g.gauche - 1; x <= g.droite + 1; x++) pose(x, g.traverse, x < g.gauche || x > g.droite ? CORDON[0] : x < 16 ? CORDON[1] : CORDON[2]);
  for (let y = g.haut; y <= g.bas; y++) {
    for (let x = g.gauche; x <= g.droite; x++) {
      // La fente : un V renversé qui remonte au milieu du bas.
      const fente = y - (g.bas - 3) - Math.min(x - g.gauche, g.droite - x);
      if (fente > 0 && Math.min(x - g.gauche, g.droite - x) >= 1) continue;
      const lisiere = x === g.gauche || x === g.droite || fente === 0;
      if (lisiere) pose(x, y, x + y < 36 ? CORDON[1] : CORDON[2]);
      else pose(x, y, x + y < 34 ? CORDON[0] : CORDON[1]);
    }
  }
  // La pierre sertie au cœur du gonfanon : un losange bleuté.
  for (const [x, y, couleur] of [
    [15, 19, PIERRE[1]],
    [16, 19, PIERRE[1]],
    [14, 20, PIERRE[1]],
    [15, 20, PIERRE[0]],
    [16, 20, PIERRE[1]],
    [17, 20, PIERRE[2]],
    [15, 21, PIERRE[1]],
    [16, 21, PIERRE[2]],
  ] as const)
    pose(x, y, couleur);
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
