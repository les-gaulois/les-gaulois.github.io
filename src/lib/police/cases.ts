/**
 * Des cases aux contours d'une police : scripts/generate-police.ts s'en sert pour fabriquer l'onciale de cases
 * (src/lib/police/onciale.ts). Calcul pur, testé dans tests/unit/police.test.ts.
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
