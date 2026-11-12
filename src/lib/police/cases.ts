/**
 * Des cases aux contours d'une police : scripts/generate-police.ts s'en sert pour fabriquer l'onciale de cases
 * (src/lib/police/onciale.ts), en cases pour les grands titres, taillée pour les petits textes. Calcul pur, testé dans
 * tests/unit/police.test.ts.
 */
import type { Dessin } from "./onciale";

/** Une case : [x, y], x vers la droite depuis le bord gauche du dessin, y vers le haut depuis la ligne de base. */
export type Case = readonly [number, number];
export type Point = readonly [number, number];

/** Les cases pleines d'un dessin. */
export function casesPleines(d: Dessin): Case[] {
  const out: Case[] = [];
  d.rangees.forEach((rangee, i) => {
    const y = d.haut - i;
    for (let x = 0; x < rangee.length; x++) if (rangee[x] === "#") out.push([x, y]);
  });
  return out;
}

const cle = (p: Point) => `${p[0]},${p[1]}`;

/**
 * Le contour des régions pleines, en boucles fermées de points (sommets des cases), sans points alignés. La région
 * pleine reste à gauche du trait : sens inverse des aiguilles d'une montre autour d'elle, sens des aiguilles autour d'un
 * trou, ce que veut une police (remplissage non nul). Deux cases qui ne se touchent que par un coin restent deux régions.
 */
export function contours(cases: readonly Case[]): Point[][] {
  const pleines = new Set(cases.map(cle));
  const est = (x: number, y: number) => pleines.has(`${x},${y}`);
  const aretes = new Map<string, Point[]>();
  const ajouter = (a: Point, b: Point) => {
    const k = cle(a);
    const liste = aretes.get(k);
    if (liste) liste.push(b);
    else aretes.set(k, [b]);
  };
  for (const [x, y] of cases) {
    if (!est(x, y - 1)) ajouter([x, y], [x + 1, y]);
    if (!est(x + 1, y)) ajouter([x + 1, y], [x + 1, y + 1]);
    if (!est(x, y + 1)) ajouter([x + 1, y + 1], [x, y + 1]);
    if (!est(x - 1, y)) ajouter([x, y + 1], [x, y]);
  }
  const boucles: Point[][] = [];
  for (;;) {
    const depart = [...aretes.entries()].find(([, l]) => l.length > 0);
    if (!depart) break;
    const [k0, sorties0] = depart;
    const origine = k0.split(",").map(Number) as unknown as Point;
    const points: Point[] = [origine];
    let cur = sorties0.shift() as Point;
    let dir: Point = [cur[0] - origine[0], cur[1] - origine[1]];
    while (cle(cur) !== k0) {
      points.push(cur);
      const sorties = aretes.get(cle(cur)) ?? [];
      // Au coin commun de deux cases en diagonale : tourner à gauche d'abord, pour garder les deux régions séparées.
      const ordre: Point[] = [[-dir[1], dir[0]], dir, [dir[1], -dir[0]]];
      let i = -1;
      for (const d of ordre) {
        i = sorties.findIndex((s) => s[0] - cur[0] === d[0] && s[1] - cur[1] === d[1]);
        if (i >= 0) break;
      }
      if (i < 0) throw new Error(`Contour ouvert en ${cle(cur)}`);
      const [suivant] = sorties.splice(i, 1) as [Point];
      dir = [suivant[0] - cur[0], suivant[1] - cur[1]];
      cur = suivant;
    }
    boucles.push(sansPointsAlignes(points));
  }
  return boucles;
}

function sansPointsAlignes(points: readonly Point[]): Point[] {
  return points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length] as Point;
    const b = points[(i + 1) % points.length] as Point;
    return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
  });
}

/** Aire signée d'une boucle (positive dans le sens inverse des aiguilles d'une montre), en cases. */
export function aire(boucle: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < boucle.length; i++) {
    const a = boucle[i] as Point;
    const b = boucle[(i + 1) % boucle.length] as Point;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Ce qui adoucit un contour en marches d'escalier, en cases. */
export interface Taille {
  /** Le biseau d'un vrai coin, entre deux longs côtés. */
  readonly coin: number;
  /** La coupe la plus longue sur un long côté qui touche une marche : la pente par laquelle il rejoint l'escalier. */
  readonly rampe: number;
}

/**
 * Le contour taillé des petits textes (« GAL Onciale ») : un biseau de 0,3 case aux vrais coins, une pente d'une case au
 * plus vers une marche. scripts/generate-police.ts fabrique la police avec ce réglage, et les tests le contrôlent.
 */
export const TAILLE_TEXTES: Taille = { coin: 0.3, rampe: 1 };

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Le point à la distance `d` de `de`, en allant vers `vers`. */
const avance = (de: Point, vers: Point, d: number): Point => {
  const l = distance(de, vers);
  return [de[0] + ((vers[0] - de[0]) / l) * d, de[1] + ((vers[1] - de[1]) / l) * d];
};

/** Retire d'une boucle fermée les points confondus, puis les points alignés avec leurs voisins. */
function sansPointsInutiles(points: readonly Point[]): Point[] {
  const eps = 1e-6;
  let p = points.filter((q, i) => distance(q, points[(i + 1) % points.length] as Point) > eps);
  // Retirer un point aligné peut en aligner un autre : quelques passes suffisent pour un signe.
  for (let passe = 0; passe < 3; passe++) {
    p = p.filter((q, i) => {
      const a = p[(i - 1 + p.length) % p.length] as Point;
      const b = p[(i + 1) % p.length] as Point;
      return Math.abs((q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0])) > eps;
    });
  }
  return p;
}

/**
 * Le contour « taillé » d'une boucle de `contours` : les petits textes ne s'écrivent pas en cases, illisibles à 15 px.
 * Chaque marche d'escalier est remplacée par une droite qui passe par son milieu : un escalier régulier devient un pan
 * coupé bien droit. Une marche est un côté d'une case entre un coin saillant et un coin rentrant, ou de deux cases s'il
 * touche une marche d'une case (un escalier de pente 2 pour 1) : deux côtés de deux cases qui se suivent sont le bout d'un
 * trait (les barres du « # », la jambe d'un P), pas un escalier, et restent droits. Un long côté qui touche une marche
 * la rejoint par une pente (`rampe`), et un vrai coin, entre deux longs côtés, ne garde qu'un petit biseau (`coin`). Le
 * sens de la boucle ne change pas, et sa surface à peine.
 */
export function tailler(boucle: readonly Point[], { coin, rampe }: Taille): Point[] {
  const n = boucle.length;
  const pt = (i: number) => boucle[((i % n) + n) % n] as Point;
  // Le sens du virage à chaque sommet : +1 saillant, -1 rentrant (la région pleine est à gauche du trait).
  const virages = boucle.map((p, i) => {
    const a = pt(i - 1);
    const b = pt(i + 1);
    return Math.sign((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]));
  });
  const virage = (i: number) => virages[((i % n) + n) % n] as number;
  // Le côté i va du sommet i au sommet i + 1.
  const longueur = (i: number) => distance(pt(i), pt(i + 1));
  // Entre un coin saillant et un coin rentrant, sur une case au plus : la marche d'un escalier.
  const petiteMarche = (i: number) => virage(i) !== virage(i + 1) && longueur(i) <= 1;
  const marche = (i: number) =>
    petiteMarche(i) || (virage(i) !== virage(i + 1) && longueur(i) <= 2 && (petiteMarche(i - 1) || petiteMarche(i + 1)));
  // La coupe d'un côté à l'un de ses bouts, selon le côté voisin à ce bout.
  const coupe = (i: number, voisin: number) => {
    const l = longueur(i);
    if (marche(i)) return l / 2;
    if (marche(voisin)) return Math.min(l / 3, rampe);
    return Math.min(coin, l / 2);
  };
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    // Sur le côté qui arrive au sommet, puis sur celui qui en part.
    out.push(avance(pt(i), pt(i - 1), coupe(i - 1, i)));
    out.push(avance(pt(i), pt(i + 1), coupe(i, i - 1)));
  }
  return sansPointsInutiles(out);
}
