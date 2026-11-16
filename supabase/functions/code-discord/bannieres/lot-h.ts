/**
 * Bannières, lot H, « Les trésors de la pochette » : voir `commun.ts`. Dessins originaux de Claude Fable 5.2 pour le clan
 * [GAL], 16 novembre 2026, sans emprunt à une œuvre existante.
 *
 * « Royaumes de légende », cinq thèmes : des îles suspendues et leurs cascades, un serpent de mer sous la lune, une cité
 * d'or engloutie, un arbre-monde dans la nuit, et un phénix de braise, la pièce maîtresse. Partout : le coin en haut à
 * gauche reste calme, le sujet est à droite, dans le ciel et à gauche sous le coin, jamais au centre ; trois plans au
 * moins, une lumière qui vient de quelque part ; le sol est à la rangée 72. Rien d'aléatoire : le même dessin à chaque appel.
 */
import { HAUTEUR, LARGEUR, Toile, melanger, type BanniereDuLot, type Decor } from "./commun.ts";

const W = LARGEUR;
const H = HAUTEUR;
type Pt = readonly [number, number];

/* ───────────────────────────── Outils ───────────────────────────── */

/** Un tirage fixe par case, bien brassé : le même à chaque image. */
const alea = (x: number, y: number): number => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
/** La couleur d'une rampe pour `v` de 0 à 1, par paliers. */
const rampe = (couleurs: readonly string[], v: number): string => couleurs[Math.min(couleurs.length - 1, Math.max(0, Math.floor(v * couleurs.length)))] ?? "#000000";

const TRAME = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const seuil = (x: number, y: number): number => ((TRAME[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;

/** Un dégradé vertical en paliers, tramé à la jonction de deux paliers, de la rangée `y0` à `y1` (non comprise). */
function degradeTrame(t: Toile, y0: number, y1: number, couleurs: readonly string[]): void {
  const n = couleurs.length;
  for (let y = y0; y < y1; y++) {
    const v = ((y - y0) / (y1 - y0)) * n;
    const i = Math.min(n - 1, Math.floor(v));
    const f = v - i;
    const a = couleurs[i] ?? "#000000";
    const b = couleurs[Math.min(n - 1, i + 1)] ?? a;
    for (let x = 0; x < W; x++) t.poser(x, y, (f - 0.45) / 0.55 > seuil(x, y) ? b : a);
  }
}

/** Mélange la case avec une couleur. */
function teinter(t: Toile, x: number, y: number, couleur: string, part: number): void {
  const dessous = t.lire(x, y);
  if (dessous && part > 0) t.poser(x, y, melanger(dessous, couleur, part));
}

/** Une lueur ronde, en paliers, qui teinte ce qui est dessous. */
function halo(t: Toile, cx: number, cy: number, r: number, couleur: string, force: number, paliers = 5): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const p = Math.round((1 - d) ** 2 * paliers) / paliers;
      teinter(t, x, y, couleur, force * p);
    }
  }
}

function ellipse(t: Toile, cx: number, cy: number, rx: number, ry: number, couleur: string | ((x: number, y: number, e: number) => string | null)): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e > 1) continue;
      const c = typeof couleur === "string" ? couleur : couleur(x, y, e);
      if (c) t.poser(x, y, c);
    }
  }
}

function ligne(t: Toile, x0: number, y0: number, x1: number, y1: number, couleur: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) t.poser(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), couleur);
}

/** Un bruit doux et fixe, de 0 à 1. */
function bruit(x: number, y: number, pas: number, graine: number): number {
  const gx = x / pas;
  const gy = y / pas;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (i: number, j: number) => (alea(i * 7 + graine * 131, j * 13 + graine * 17) % 1024) / 1023;
  const haut = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
  const bas = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  return haut + (bas - haut) * sy;
}
const nuee = (x: number, y: number, pas: number, graine: number): number =>
  (bruit(x, y, pas, graine) * 4 + bruit(x, y, pas / 2, graine + 1) * 2 + bruit(x, y, pas / 4, graine + 2)) / 7;

/** Une ligne de crête : une base et une somme d'ondes [hauteur, fréquence, phase]. */
const crete = (x: number, base: number, ondes: readonly (readonly [number, number, number])[]): number =>
  Math.round(base + ondes.reduce((s, [a, f, p]) => s + a * Math.sin(x * f + p), 0));

/** Remplit sous une crête : `couleur(x, y, profondeur)` avec la profondeur 0 sur la crête. */
function relief(t: Toile, sommet: (x: number) => number, bas: number, couleur: (x: number, y: number, p: number) => string): void {
  for (let x = 0; x < W; x++) {
    const s = sommet(x);
    for (let y = Math.max(0, s); y < bas; y++) t.poser(x, y, couleur(x, y, y - s));
  }
}

/** Une couche de nuages bombés : crête faite de bosses, dessus clair, corps, ombre plus bas. */
function nuages(t: Toile, base: number, bosse: number, f: number, phase: number, c: { haut: string; corps: string; ombre: string }, bas = H): void {
  relief(
    t,
    (x) => Math.round(base - bosse * (0.62 * Math.abs(Math.sin(x * f + phase)) + 0.38 * Math.abs(Math.sin(x * f * 2.7 + phase * 1.9)))),
    bas,
    (_x, _y, p) => (p < 1 ? c.haut : p < 2 + bosse * 0.9 ? c.corps : c.ombre),
  );
}

const dansLeCoinCalme = (x: number, y: number): boolean => x < 48 && y < 26;

/** Un tronçon d'un corps souple : son centre, sa direction, son rayon, son avancement de 0 à 1. */
interface Troncon {
  x: number;
  y: number;
  tx: number;
  ty: number;
  r: number;
  a: number;
}

/** Une courbe lisse qui passe par les points, découpée en tronçons, avec un rayon donné à chaque point. */
function courbe(points: readonly Pt[], rayons: readonly number[], pas = 14): Troncon[] {
  const n = points.length;
  const P = (i: number): Pt => points[Math.min(n - 1, Math.max(0, i))] ?? [0, 0];
  const R = (i: number): number => rayons[Math.min(rayons.length - 1, Math.max(0, i))] ?? 1;
  const sortie: Troncon[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < pas; k++) {
      const u = k / pas;
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      const val = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
      const der = (a: number, b: number, c: number, d: number) => 0.5 * (-a + c + 2 * (2 * a - 5 * b + 4 * c - d) * u + 3 * (-a + 3 * b - 3 * c + d) * u * u);
      const dx = der(p0[0], p1[0], p2[0], p3[0]);
      const dy = der(p0[1], p1[1], p2[1], p3[1]);
      const l = Math.hypot(dx, dy) || 1;
      sortie.push({ x: val(p0[0], p1[0], p2[0], p3[0]), y: val(p0[1], p1[1], p2[1], p3[1]), tx: dx / l, ty: dy / l, r: R(i) + (R(i + 1) - R(i)) * u, a: (i + u) / (n - 1) });
    }
  }
  return sortie;
}

interface Peau {
  arete: string;
  clair: string;
  moyen: string;
  ombre: string;
  sombre: string;
  nuit: string;
}

/**
 * Peint un corps souple : chaque case prend l'ombrage du tronçon le plus proche. `coupe` : rien à partir de cette rangée
 * (le corps plonge). `penche` : de quel côté vient la lumière (négatif : de la droite). Rend « cette case est du corps ? ».
 */
function tube(
  t: Toile,
  corps: readonly Troncon[],
  peau: Peau,
  option: { coupe?: number; penche?: number; motif?: (x: number, y: number, couleur: string, ton: number) => string } = {},
): (x: number, y: number) => boolean {
  const coupe = option.coupe ?? H;
  const penche = option.penche ?? 0.22;
  const proche = new Float32Array(W * H).fill(9);
  const ton = new Float32Array(W * H);
  for (const s of corps) {
    for (let y = Math.floor(s.y - s.r); y <= s.y + s.r; y++) {
      for (let x = Math.floor(s.x - s.r); x <= s.x + s.r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= coupe || y >= H) continue;
        const d = Math.hypot(x - s.x, y - s.y) / s.r;
        const i = y * W + x;
        if (d <= 1 && d < (proche[i] ?? 9)) {
          proche[i] = d;
          ton[i] = ((y - s.y) / s.r) * 0.95 + ((x - s.x) / s.r) * penche;
        }
      }
    }
  }
  const est = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && (proche[y * W + x] ?? 9) <= 1;
  for (let y = 0; y < Math.min(H, coupe); y++) {
    for (let x = 0; x < W; x++) {
      if (!est(x, y)) continue;
      const v = ton[y * W + x] ?? 0;
      let c = v < -0.5 ? peau.clair : v < -0.05 ? peau.moyen : v < 0.5 ? peau.ombre : peau.sombre;
      if (option.motif) c = option.motif(x, y, c, v);
      if (!est(x, y - 1)) c = peau.arete;
      else if (!est(x, y + 1) && y + 1 < coupe) c = peau.nuit;
      t.poser(x, y, c);
    }
  }
  return est;
}

/** Des épines ou des voiles le long du dos d'un corps souple, à poser avant lui. */
function epines(t: Toile, corps: readonly Troncon[], ecart: number, hauteur: number, c: { pointe: string; clair: string; ombre: string }, coupe = H): void {
  let depuis = 0;
  for (const s of corps) {
    depuis += 1;
    if (depuis < ecart) continue;
    depuis = 0;
    let nx = s.ty;
    let ny = -s.tx;
    if (ny > 0 || (Math.abs(ny) < 0.3 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    const h = Math.round(s.r * hauteur + 1.5);
    for (let j = 0; j <= h; j++) {
      const demi = Math.round((1 - j / h) * 1.7);
      for (let k = -demi; k <= demi; k++) {
        const x = Math.round(s.x + nx * (s.r * 0.8 + j) + s.tx * k);
        const y = Math.round(s.y + ny * (s.r * 0.8 + j) + s.ty * k);
        if (y < coupe) t.poser(x, y, j === h ? c.pointe : k < 0 ? c.clair : c.ombre);
      }
    }
  }
}

/* ───────────────────────────── 1. Les îles suspendues (épique) ───────────────────────────── */

interface Ile {
  cx: number;
  haut: number;
  demi: number;
  prof: number;
  graine: number;
  /** Part de ciel dans ses couleurs : la brume de l'air, 0 pour l'île la plus proche. */
  brume: number;
}

/** Une île qui flotte : un dessus d'herbe, un dessous de roche en pointe, éclairé par la droite. Rend son dessus. */
function ile(t: Toile, i: Ile): (x: number) => number {
  const dessus = (x: number): number => i.haut + (Math.abs(x - i.cx) > i.demi - 2 ? 1 : 0) + (alea(x, i.graine) % 7 === 0 ? -1 : 0);
  for (let x = i.cx - i.demi; x <= i.cx + i.demi; x++) {
    const u = (x - i.cx) / i.demi;
    const bord = 1 - Math.abs(u) ** 1.7;
    const s = dessus(x);
    const fond = Math.max(2, Math.round(i.prof * bord ** 0.8 * (0.5 + 0.6 * bruit(x, i.graine, 2.6, i.graine)) + (alea(x, i.graine + 5) % 4 === 0 ? 2 : 0)));
    for (let p = 0; p <= fond; p++) {
      const y = s + p;
      const rel = p / fond;
      let c: string;
      if (p === 0) c = alea(x, 9) % 3 === 0 ? "#d4f07a" : "#9cd858";
      else if (p === 1 || (p === 2 && alea(x, i.graine + 2) % 2 === 0)) c = "#5fae4a";
      else if (p === fond) c = "#3a3050";
      else {
        const pli = bruit(x * 1.3, y * 0.5, 2.2, i.graine + 9);
        c = u > 0.1 && rel < 0.55 && pli > 0.35 ? "#d8b890" : rel > 0.66 || u < -0.45 || pli < 0.3 ? "#5c4a68" : "#987a80";
        if (y % 4 === 0 && c !== "#5c4a68") c = melanger(c, "#5c4a68", 0.35);
      }
      const dessous = t.lire(x, y);
      t.poser(x, y, i.brume > 0 && dessous ? melanger(c, dessous, i.brume) : c);
    }
    // Des racines pendent sous la roche.
    if (i.brume < 0.5 && alea(x, i.graine + 13) % 5 === 0) {
      const l = 1 + (alea(x, i.graine + 14) % 4);
      for (let k = 1; k <= l; k++) teinter(t, x, s + fond + k, "#3c6a4a", 0.8 - i.brume);
    }
  }
  return dessus;
}

/** Un arbre rond : tronc et houppier à trois tons, la lumière à droite. */
function arbreRond(t: Toile, x: number, pied: number, r: number, c: { clair: string; moyen: string; ombre: string }, brume = 0): void {
  const pose = (px: number, py: number, couleur: string) => {
    const d = t.lire(px, py);
    t.poser(px, py, brume > 0 && d ? melanger(couleur, d, brume) : couleur);
  };
  for (let y = pied - Math.ceil(r); y < pied; y++) pose(x, y, "#5a3c34");
  const cy = pied - r * 1.6;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let px = Math.floor(x - r * 1.15); px <= x + r * 1.15; px++) {
      const e = ((px - x) / (r * 1.15)) ** 2 + ((y - cy) / r) ** 2;
      if (e > 1) continue;
      const v = (px - x) / r - (y - cy) / r;
      pose(px, y, v > 0.5 ? c.clair : v > -0.6 || alea(px, y) % 3 === 0 ? c.moyen : c.ombre);
    }
  }
}

/** Une cascade : un ruban d'eau qui tombe et se défait en brume. */
function cascade(t: Toile, x: number, y0: number, y1: number, largeur: number): void {
  for (let y = y0; y < y1; y++) {
    const a = (y - y0) / (y1 - y0);
    for (let k = 0; k < largeur; k++) {
      if (a > 0.7 && alea(x + k, y) % 3 === 0) continue;
      teinter(t, x + k, y, (alea(x + k, Math.floor(y / 2) + k) % 3 === 0 ? "#bfeaf6" : "#f4fdff"), 0.95 - a * 0.45);
    }
    if (a > 0.5 && alea(x, y * 3) % 2 === 0) teinter(t, x + (alea(y, 4) % 2 ? -1 : largeur), y, "#ffffff", 0.35);
  }
}

function ilesSuspendues(): Decor {
  const t = new Toile("#4a90d6");
  degradeTrame(t, 0, 66, ["#2a66bc", "#3273c6", "#3c82d0", "#4a92d8", "#5ca2de", "#72b2e4", "#8ac2e8", "#a4d0ea", "#bedcea", "#d6e6e4", "#ecead6", "#fbe6c0", "#ffdca6"]);
  // La lumière vient d'en haut à droite.
  halo(t, 124, 2, 52, "#fff6d0", 0.42, 7);
  // Des voiles de nuages hauts.
  for (const [x, y, l] of [[54, 6, 15], [72, 10, 10], [92, 4, 13], [8, 30, 12], [84, 24, 9], [104, 12, 8]] as const) {
    for (let i = 0; i < l; i++) teinter(t, x + i, y, "#ffffff", 0.38);
    for (let i = 2; i < l - 3; i++) teinter(t, x + i, y - 1, "#ffffff", 0.22);
  }

  // Le lointain : des îles pâles, presque de la couleur du ciel.
  const vertLoin = { clair: "#b8e078", moyen: "#6cb858", ombre: "#3e8450" };
  ile(t, { cx: 68, haut: 14, demi: 8, prof: 8, graine: 3, brume: 0.66 });
  ile(t, { cx: 115, haut: 16, demi: 7, prof: 7, graine: 4, brume: 0.6 });
  ile(t, { cx: 40, haut: 33, demi: 6, prof: 6, graine: 5, brume: 0.62 });
  ile(t, { cx: 5, haut: 36, demi: 5, prof: 6, graine: 6, brume: 0.6 });
  arbreRond(t, 66, 14, 2, vertLoin, 0.6);
  arbreRond(t, 71, 14, 1.5, vertLoin, 0.6);
  arbreRond(t, 116, 16, 2, vertLoin, 0.55);
  cascade(t, 63, 16, 40, 1);
  // Le plan moyen : des îlots.
  ile(t, { cx: 84, haut: 26, demi: 6, prof: 8, graine: 7, brume: 0.36 });
  arbreRond(t, 85, 26, 2.4, vertLoin, 0.32);
  ile(t, { cx: 62, haut: 44, demi: 9, prof: 9, graine: 8, brume: 0.3 });
  ile(t, { cx: 44, haut: 50, demi: 4, prof: 5, graine: 9, brume: 0.2 });
  for (const [cx, haut] of [[78, 47], [36, 57], [121, 44], [74, 33]] as const) ile(t, { cx, haut, demi: 2, prof: 3, graine: cx, brume: 0.2 });

  // La grande île de droite : un temple en ruine, un arbre d'or, un bassin qui déborde en cascade.
  cascade(t, 89, 39, 66, 2);
  cascade(t, 117, 40, 66, 1);
  const grande = ile(t, { cx: 104, haut: 38, demi: 18, prof: 25, graine: 11, brume: 0 });
  t.bloc(89, 38, 6, 1, "#8fe0f4");
  t.bloc(90, 38, 3, 1, "#e8fbff");
  // Le temple : quatre colonnes, un linteau, une colonne brisée.
  for (const [x, h] of [[97, 9], [100, 9], [103, 9], [106, 5]] as const) {
    const pied = grande(x);
    for (let y = pied - h; y < pied; y++) {
      t.poser(x, y, y % 3 === 0 ? "#cfc8d8" : "#fbf4e2");
      t.poser(x - 1, y, "#a8a4c4");
    }
    t.bloc(x - 1, pied - 1, 3, 1, "#e4dccc");
  }
  t.bloc(95, 28, 10, 1, "#fffaea");
  t.bloc(95, 29, 10, 1, "#b4aecc");
  t.bloc(96, 27, 6, 1, "#e4dccc");
  t.poser(107, 32, "#fbf4e2");
  // L'arbre d'or, et ses feuilles qui s'envolent.
  const or = { clair: "#fff0a0", moyen: "#f6b840", ombre: "#c8742c" };
  arbreRond(t, 113, grande(113), 4.2, or);
  arbreRond(t, 118, grande(118), 2.4, or);
  for (const [x, y] of [[106, 24], [102, 21], [96, 23], [92, 19], [88, 31], [84, 18]] as const) t.poser(x, y, alea(x, y) % 2 ? "#ffd45e" : "#fff0a0");
  for (let x = 95; x < 112; x++) if (alea(x, 70) % 4 === 0) t.poser(x, grande(x) - 1, "#d4f07a");

  // L'île de gauche, sous le coin : des pins, une cascade.
  cascade(t, 30, 47, 66, 1);
  const gauche = ile(t, { cx: 19, haut: 45, demi: 15, prof: 18, graine: 13, brume: 0.06 });
  for (const [x, h] of [[10, 9], [15, 12], [21, 8], [26, 10]] as const) {
    const pied = gauche(x);
    for (let j = 0; j < h; j++) {
      const demi = Math.floor(((j + 1) / h) * 3.2 * (j % 3 === 2 ? 0.6 : 1));
      for (let k = -demi; k <= demi; k++) t.poser(x + k, pied - h + j - 1, k > 0 ? "#4f9a58" : k === 0 && j < 2 ? "#a8dc7a" : "#2c6a4c");
    }
    t.poser(x, pied - 1, "#5a3c34");
  }

  // Des oiseaux, de chaque côté.
  for (const [x, y] of [[34, 29], [39, 27], [44, 30], [88, 10], [93, 8], [99, 11]] as const) {
    t.poser(x, y, "#28457c");
    t.poser(x - 1, y - 1, "#28457c");
    t.poser(x + 1, y - 1, "#28457c");
  }

  // La mer de nuages, dorée vers la droite, et la brume au pied des cascades.
  nuages(t, 61, 5, 0.105, 0.4, { haut: "#ffffff", corps: "#f6f0e6", ombre: "#dcdcea" });
  nuages(t, 66, 4, 0.14, 2.1, { haut: "#fffaf0", corps: "#f4e6d8", ombre: "#d0cce0" });
  for (let y = 54; y < 72; y++) for (let x = 0; x < W; x++) if (x > 70) teinter(t, x, y, "#ffd9a0", ((x - 70) / 54) * 0.3);
  for (const [x, r] of [[90, 6], [117, 4], [30, 5]] as const) halo(t, x, 60, r, "#ffffff", 0.75, 4);

  // Le premier plan : le bord d'une île, herbe haute, fleurs, pierres moussues, buissons sombres dans les coins.
  const pre = (x: number) => crete(x, 70, [[0.9, 0.08, 0.7], [0.5, 0.29, 2.4]]);
  relief(t, pre, H, (x, y, p) => {
    if (p === 0) return alea(x, 8) % 3 === 0 ? "#d4f07a" : "#9cd858";
    if (p < 3) return alea(x, y) % 4 === 0 ? "#4f9a48" : "#68b44e";
    if (p < 5) return alea(Math.floor(x / 2), y) % 3 === 0 ? "#2f6a40" : "#3f8446";
    return alea(Math.floor(x / 3), y) % 5 === 0 ? "#6a5068" : y > 77 ? "#3a3050" : "#4c3c5c";
  });
  for (let x = 3; x < W - 3; x++) {
    const g = alea(x, 77);
    if (g % 3 === 0) t.poser(x, pre(x) - 1, g % 2 ? "#d4f07a" : "#68b44e");
    if (g % 9 === 0) {
      t.poser(x, pre(x) - 2, ["#ffffff", "#ffe07a", "#ff9ec0"][(g >> 5) % 3] ?? "#ffffff");
      t.poser(x, pre(x) - 1, "#3f8446");
    }
  }
  for (const [x, l] of [[24, 5], [92, 6]] as const) {
    t.bloc(x, 73, l, 2, "#6a6078");
    t.bloc(x, 72, l - 1, 1, "#d8c8b0");
    t.poser(x + 1, 72, "#9cd858");
  }
  for (const [cx, cy, rx, ry] of [[6, 70, 8, 6], [118, 69, 8, 7], [14, 74, 5, 3]] as const) {
    ellipse(t, cx, cy, rx, ry, (x, y, e) => (e > 0.72 && y < cy ? "#3f8446" : alea(x, y) % 5 === 0 ? "#2f6a40" : "#1c4a38"));
  }
  for (const [x, y] of [[5, 66], [9, 68], [116, 65], [120, 67], [113, 68]] as const) t.poser(x, y, "#ff9ec0");
  return t.decor("#24503a");
}

/* ───────────────────────────── 2. Le serpent de mer (épique) ───────────────────────────── */

function serpentDeMer(): Decor {
  const t = new Toile("#0c1c30");
  degradeTrame(t, 0, 58, ["#070a1c", "#080d22", "#0a1129", "#0c1631", "#0f1d3a", "#122543", "#162e4c", "#1a3855", "#20445e"]);
  // La lune, grande et pâle, à droite : toute la lumière vient d'elle.
  const lx = 95;
  const ly = 23;
  halo(t, lx, ly, 36, "#a8e4d0", 0.34, 7);
  ellipse(t, lx, ly, 13.5, 13.5, (x, y, e) => {
    const tache = nuee(x, y, 6, 21) > 0.58;
    return e > 0.86 ? "#c4e8d4" : tache ? "#c8dcc4" : x - lx + (y - ly) > 8 ? "#dcecd4" : "#f2fbe6";
  });
  // Des étoiles, et des nuages d'orage que la lune ourle.
  for (let y = 3; y < 50; y++) {
    for (let x = 3; x < W - 3; x++) {
      if (Math.hypot(x - lx, y - ly) < 15) continue;
      if (!dansLeCoinCalme(x, y) && alea(x, y) % 131 === 0) t.poser(x, y, "#9cc8d0");
      const n = nuee(x, y * 2.4, 16, 5) - (dansLeCoinCalme(x - 4, y - 3) ? 0.2 : 0);
      if (n > 0.62 && y > 4) {
        const dessus = nuee(x, (y - 1) * 2.4, 16, 5) <= 0.62;
        const pres = Math.max(0, 1 - Math.hypot(x - lx, y - ly) / 60);
        t.poser(x, y, dessus ? melanger("#16284a", "#bfe8d8", pres * 0.8) : melanger("#060916", "#122543", pres * (n > 0.67 ? 0.3 : 0.8)));
      }
    }
  }

  // La mer : sombre, des crêtes pâles, le chemin de lune.
  degradeTrame(t, 58, 72, ["#173c58", "#12324c", "#0e2940", "#0b2034", "#08182a"]);
  t.bloc(0, 58, W, 1, "#3a7088");
  for (let y = 59; y < 72; y++) {
    const demi = 4 + (y - 59) * 1.6;
    for (let x = 0; x < W; x++) {
      const g = alea(Math.floor((x + y * 2) / 3), y);
      if (Math.abs(x - lx) < demi && g % 5 < 3) t.poser(x, y, rampe(["#eafbe8", "#c4ecd8", "#8fd0c0", "#5caea8"], (y - 59) / 13 + Math.abs(x - lx) / demi / 3));
      else if (g % 11 === 0) t.poser(x, y, y < 63 ? "#3c7c88" : "#2a6272");
      else if (g % 13 === 1) t.poser(x, y, "#0a1e2c");
    }
  }

  // Le serpent : trois boucles, de la plus lointaine à la plus proche, le cou dressé devant la lune.
  const peau: Peau = { arete: "#d8ffe0", clair: "#7fe0a8", moyen: "#3fae84", ombre: "#1f7870", sombre: "#144c58", nuit: "#061824" };
  const loin: Peau = { arete: "#8fd0c0", clair: "#4a9c8c", moyen: "#2c7674", ombre: "#1c5464", sombre: "#143c52", nuit: "#0c2238" };
  const ecailles = (sombre: string) => (x: number, y: number, c: string, v: number): string => {
    const rang = Math.floor(y / 3);
    const col = (x + (rang % 2) * 2) % 4;
    if (v > 0.55) return alea(x, y) % 2 ? "#d8ecb8" : "#a8cc98"; // le ventre, plus pâle
    if ((y % 3 === 2 && col !== 0) || (y % 3 !== 2 && col === 0)) return melanger(c, sombre, 0.16);
    return c;
  };
  const voile = { pointe: "#e8fff0", clair: "#5fd8c0", ombre: "#1f8a8c" };
  const ecume = (est: (x: number, y: number) => boolean, rangee: number) => {
    for (let x = 1; x < W - 1; x++) {
      if (est(x, rangee - 1) || est(x - 1, rangee - 1) || est(x + 1, rangee - 1) || est(x - 2, rangee - 1) || est(x + 2, rangee - 1)) {
        t.poser(x, rangee, alea(x, rangee) % 4 === 0 ? "#8fd0c0" : "#f0fff6");
        if (alea(x, rangee + 1) % 2 === 0) t.poser(x, rangee + 1, "#bfeadc");
        if (alea(x, rangee + 2) % 3 === 0) t.poser(x + (alea(x, 3) % 3) - 1, rangee - 1 - (alea(x, 5) % 3), "#e8fff4");
      }
    }
  };
  // La boucle du fond, derrière le Gaulois.
  const boucleLoin = courbe([[42, 68], [50, 50], [62, 45], [74, 50], [80, 68]], [4, 4.2, 4.2, 4, 3.6]);
  epines(t, boucleLoin, 5, 0.6, { pointe: "#a8e0d0", clair: "#3ca8a0", ombre: "#1c6c78" }, 60);
  ecume(tube(t, boucleLoin, loin, { coupe: 60, penche: -0.25, motif: ecailles("#0c2636") }), 60);
  // Le bout de la queue, qui fouette l'air.
  const queue = courbe([[84, 66], [85, 55], [82, 48], [77, 45]], [2.4, 2, 1.4, 0.8]);
  ecume(tube(t, queue, peau, { coupe: 61, penche: -0.25 }), 61);
  for (const [x, y, c] of [[76, 44, "#e8fff0"], [75, 43, "#5fd8c0"], [74, 45, "#5fd8c0"], [75, 46, "#1f8a8c"], [73, 43, "#5fd8c0"], [73, 46, "#1f8a8c"]] as const) t.poser(x, y, c);
  // Le cou, en S, et la tête tournée vers le Gaulois.
  const cou = courbe([[112, 70], [117, 56], [115, 43], [107, 34], [99, 30]], [7, 6.6, 6, 5.2, 4.6]);
  epines(t, cou, 6, 0.7, voile, 62);
  const estCou = tube(t, cou, peau, { coupe: 62, penche: -0.3, motif: ecailles("#081c28") });
  ecume(estCou, 62);
  t.grille(81, 22, [
    "..............h...h...",
    ".............hc..hc.h.",
    ".....oooooooocccccchc.",
    "...oollllllllllccccco.",
    ".oollyylllllmmmmmmmmo.",
    "olllloyllllmmmmmmmmmo.",
    "olwlwlwlwlmmmmmmmmmmo.",
    ".oo.o.o.ooksmmmmmmmso.",
    "..........okssmmmmsso.",
    "..owowowo..oksssssso..",
    ".obbbbbbbooksssssso...",
    "..oobbbbbbbbssssoo....",
    "....ooooooooooo.......",
  ], { o: peau.nuit, l: peau.moyen, m: peau.ombre, s: peau.sombre, k: "#0c3040", b: "#9cc8a0", w: "#f8fff0", y: "#fff27a", c: "#1f8a8c", h: "#5fd8c0" });
  for (let x = 86; x < 96; x++) t.poser(x, 25, peau.clair);
  halo(t, 87, 26, 4, "#fff27a", 0.4, 3);
  t.poser(86, 26, "#fffbd0");
  t.poser(87, 26, "#fffbd0");
  // Des points de lumière le long du flanc.
  for (const s of [...cou, ...boucleLoin].filter((_, i) => i % 9 === 4)) {
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    if (y < 58 && (estCou(x, y) || s.r < 4.5)) {
      t.poser(x, y, "#b8fff0");
      teinter(t, x - 1, y, "#5ee0d0", 0.5);
      teinter(t, x + 1, y, "#5ee0d0", 0.5);
    }
  }
  // La boucle proche, à gauche sous le coin, plus grosse.
  const boucle = courbe([[5, 74], [8, 52], [17, 39], [27, 41], [33, 54], [34, 74]], [5.5, 6, 6, 5.6, 5, 4.6]);
  epines(t, boucle, 6, 0.7, voile, 64);
  const estBoucle = tube(t, boucle, peau, { coupe: 64, penche: -0.3, motif: ecailles("#081c28") });
  ecume(estBoucle, 64);
  for (const s of boucle.filter((_, i) => i % 9 === 4)) {
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    if (y < 60) {
      t.poser(x, y, "#b8fff0");
      teinter(t, x - 1, y, "#5ee0d0", 0.5);
      teinter(t, x + 1, y, "#5ee0d0", 0.5);
    }
  }

  // La pluie, fine, en biais.
  for (let y = 4; y < 64; y++) for (let x = 3; x < W - 3; x++) if (!dansLeCoinCalme(x, y) && alea(x + y, y * 7) % 127 === 0) for (let k = 0; k < 3; k++) teinter(t, x - k, y + k, "#bfe8e0", 0.22);

  // Le premier plan : le pont d'un navire, son pavois, un fanal, des haubans.
  const pavois = 65;
  t.bloc(0, pavois, W, 1, "#b08a5c");
  t.bloc(0, pavois + 1, W, 1, "#5e4030");
  t.bloc(0, pavois + 2, W, 5, "#33221c");
  for (let x = 0; x < W; x++) {
    if (alea(x, 40) % 3 === 0) t.poser(x, pavois, "#d8c898");
    if (x % 14 === 6) {
      t.bloc(x, pavois - 2, 2, 9, "#4a3024");
      t.bloc(x, pavois - 3, 2, 1, "#b08a5c");
    } else if (x % 7 === 3) t.bloc(x, pavois + 2, 1, 5, "#241612");
    if (alea(x, 41) % 5 === 0) t.poser(x, pavois + 3 + (alea(x, 42) % 3), "#4a3024");
  }
  for (let y = 72; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rang = Math.floor((y - 72) / 3);
      const joint = (y - 72) % 3 === 2 || (x + rang * 9) % 19 === 0;
      const mouille = alea(Math.floor(x / 3), y) % 9 === 0;
      t.poser(x, y, joint ? "#2a1a16" : mouille ? "#6e7c74" : rang % 2 ? "#5a4032" : "#644838");
    }
  }
  t.bloc(0, 72, W, 1, "#7c6048");
  // Les haubans, à gauche, devant la boucle.
  for (const [x0, x1] of [[3, 20], [3, 13], [9, 27]] as const) ligne(t, x0, 28, x1, pavois, "#0a1018");
  for (let y = 33; y < pavois; y += 6) ligne(t, 3, y, Math.round(9 + ((y - 28) / (pavois - 28)) * 18), y + 1, "#0a1018");
  // Le fanal, chaud dans la nuit froide, et un rouleau de cordage.
  t.bloc(105, 51, 1, 14, "#241612");
  t.bloc(104, 50, 3, 1, "#4a3024");
  t.bloc(103, 53, 5, 1, "#241612");
  t.bloc(103, 54, 5, 5, "#ffb84a");
  t.bloc(104, 55, 3, 3, "#fff2b0");
  t.bloc(103, 59, 5, 1, "#241612");
  t.poser(103, 56, "#241612");
  t.poser(107, 56, "#241612");
  halo(t, 105, 56, 13, "#ffb84a", 0.42, 5);
  for (let x = 96; x < 116; x++) teinter(t, x, 72, "#ffb84a", 0.35 - Math.abs(x - 105) * 0.03);
  ellipse(t, 24, 71, 4, 1.6, (x) => (x % 2 ? "#c8a878" : "#8a6a4c"));
  t.bloc(22, 71, 4, 1, "#33221c");
  return t.decor("#1c120e");
}

/* ───────────────────────────── 3. La cité d'or engloutie (mystique) ───────────────────────────── */

function citeEngloutie(): Decor {
  const t = new Toile("#1a778a");
  const eau = ["#35aeb0", "#2ea2a8", "#2795a0", "#218896", "#1b7a8c", "#166c80", "#125e74", "#0f5168", "#0c445c", "#0a3850"];
  degradeTrame(t, 0, 66, eau);
  const eauA = (y: number): string => rampe(eau, y / 66);
  // Les rais du jour, qui descendent de la droite.
  for (let y = 0; y < 66; y++) {
    for (let x = 0; x < W; x++) {
      const k = x + y * 0.62;
      const dans = [[62, 7], [80, 4], [91, 10], [112, 6], [126, 9], [146, 5]].some(([d, l]) => k >= (d ?? 0) && k < (d ?? 0) + (l ?? 0));
      if (dans) teinter(t, x, y, "#d8fff0", 0.2 * (1 - y / 80));
    }
  }
  halo(t, 110, -6, 44, "#d8fff0", 0.3, 6);

  const or = ["#fff6c0", "#ffe07a", "#f2b840", "#c88a30", "#8a5e34", "#4e4448"];
  /** Une couleur de la cité, noyée dans l'eau selon l'éloignement. */
  const noye = (c: string, y: number, part: number): string => melanger(c, eauA(Math.min(65, y)), part);

  // Le lointain : la ligne des toits, à peine plus sombre que l'eau.
  const toits: readonly (readonly [number, number, number, number])[] = [
    [3, 7, 44, 0], [11, 5, 38, 1], [17, 8, 46, 0], [26, 4, 34, 2], [31, 9, 42, 1], [41, 5, 30, 2], [47, 10, 40, 0], [58, 6, 28, 1],
    [65, 9, 36, 0], [75, 4, 24, 2], [80, 8, 38, 1], [89, 6, 30, 0], [96, 10, 22, 1], [107, 5, 32, 2], [113, 9, 36, 0],
  ];
  for (const [x, l, haut, toit] of toits) {
    for (let y = haut; y < 62; y++) for (let k = 0; k < l; k++) t.poser(x + k, y, melanger(eauA(y), "#0a3850", 0.22 + (k > l * 0.6 ? 0 : 0.08)));
    const m = x + Math.floor(l / 2);
    if (toit === 1) ellipse(t, m, haut, l / 2, l / 2.4, (px, py) => (py <= haut ? melanger(eauA(py), "#0a3850", 0.26) : null));
    if (toit === 2) for (let j = 1; j <= l; j++) t.bloc(m - Math.floor((l - j) / 2), haut - j, Math.max(1, l - j - (l - j) % 2), 1, melanger(eauA(haut - j), "#0a3850", 0.26));
    for (let y = haut + 3; y < 58; y += 4) if (alea(x, y) % 3 === 0) t.poser(x + 1 + (alea(y, x) % Math.max(1, l - 2)), y, "#ffe9a0");
  }

  // Le plan moyen, à gauche : une pyramide à degrés, un feu d'or à son sommet.
  for (let i = 0; i < 5; i++) {
    const l = 32 - i * 6;
    const x0 = 3 + i * 3;
    const y0 = 57 - i * 5;
    for (let y = y0; y < y0 + 5; y++) {
      for (let x = x0; x < x0 + l; x++) {
        const face = y === y0 ? 1 : (x - x0) % 4 === 1 && y > y0 + 1 ? 4 : x > x0 + l * 0.55 ? 2 : 3;
        t.poser(x, y, noye(or[face] ?? "#000000", y, 0.3));
      }
    }
    if (i < 4) for (let x = x0; x < x0 + l; x++) if (alea(x, i) % 4 === 0) t.poser(x, y0 + 1, noye("#2f8a6c", y0, 0.2));
  }
  t.bloc(16, 29, 6, 3, noye(or[3] ?? "", 30, 0.25));
  t.bloc(15, 28, 8, 1, noye(or[1] ?? "", 28, 0.25));
  halo(t, 19, 26, 9, "#ffe07a", 0.55, 5);
  t.bloc(18, 25, 2, 3, "#fffbd8");
  t.poser(17, 26, "#ffe07a");
  t.poser(20, 26, "#ffe07a");
  // Des marches descendent de la pyramide vers la place.
  for (let j = 0; j < 20; j++) t.bloc(15, 42 + j, 6 + Math.floor(j / 4), 1, noye(j % 2 ? or[2] ?? "" : or[4] ?? "", 42 + j, 0.28));

  // Le plan moyen, à droite : le grand temple, sa coupole, sa colonnade éclairée du dedans.
  const tx = 104;
  ellipse(t, tx, 41, 14, 15, (x, y, e) => {
    if (y > 41) return null;
    const u = (x - tx) / 14;
    const cote = Math.abs(((x - tx) / Math.sqrt(Math.max(0.05, 1 - ((y - 41) / 15) ** 2))) % 5) < 0.6;
    let c = u > 0.25 && u < 0.7 ? or[0] : u > -0.1 ? or[1] : u > -0.55 ? or[2] : or[3];
    if (e > 0.88) c = u > 0 ? or[1] : or[4];
    else if (cote) c = or[3];
    return noye(c ?? "#000000", y, 0.14);
  });
  t.bloc(tx - 1, 20, 2, 6, noye(or[1] ?? "", 22, 0.1));
  halo(t, tx, 18, 8, "#fff6c0", 0.6, 5);
  ellipse(t, tx - 0.5, 18.5, 2, 2, "#fffbe0");
  t.bloc(tx - 16, 41, 33, 1, noye(or[0] ?? "", 41, 0.1));
  t.bloc(tx - 16, 42, 33, 2, noye(or[2] ?? "", 42, 0.14));
  for (let x = tx - 16; x <= tx + 16; x++) if ((x - tx + 16) % 3 === 1) t.poser(x, 43, noye(or[4] ?? "", 43, 0.14));
  for (let y = 44; y < 58; y++) {
    for (let x = tx - 15; x <= tx + 15; x++) {
      const k = (x - tx + 15) % 5;
      const lueur = rampe(["#7a4a30", "#c87a30", "#ffb84a", "#ffe07a"], (y - 44) / 14);
      t.poser(x, y, k === 0 ? noye(or[0] ?? "", y, 0.1) : k === 1 ? noye(or[2] ?? "", y, 0.14) : lueur);
    }
  }
  halo(t, tx, 56, 20, "#ffc45e", 0.3, 5);
  for (let j = 0; j < 4; j++) {
    t.bloc(tx - 17 - j, 58 + j, 35 + j * 2, 1, noye(j % 2 ? or[3] ?? "" : or[1] ?? "", 58 + j, 0.14));
  }
  // Des colonnes brisées, de part et d'autre de l'allée.
  for (const [x, haut] of [[41, 47], [82, 40], [36, 54]] as const) {
    for (let y = haut; y < 62; y++) {
      t.poser(x, y, noye(or[3] ?? "", y, 0.2));
      t.poser(x + 1, y, noye(or[1] ?? "", y, 0.2));
      t.poser(x + 2, y, noye(or[0] ?? "", y, 0.2));
    }
    t.bloc(x - 1, haut, 4, 1, noye(or[2] ?? "", haut, 0.2));
    t.poser(x + 2, haut - 1, noye(or[1] ?? "", haut, 0.2));
  }

  // Le sol : un dallage d'or en perspective, du sable dans les joints, les reflets de la surface.
  for (let y = 62; y < H; y++) {
    const a = (y - 62) / 18;
    for (let x = 0; x < W; x++) {
      const ecart = (x - 62) / (0.35 + a * 1.1);
      const rangee = [62, 64, 67, 71, 76].filter((r) => y >= r).length;
      const jointH = [62, 64, 67, 71, 76].includes(y);
      const jointV = Math.abs(((ecart + rangee * 7 + 1400) % 14) - 7) > 6.4 - a * 0.4;
      const dalle = alea(Math.floor((ecart + rangee * 7 + 1400) / 14), rangee);
      let c = jointH || jointV ? or[4] ?? "" : dalle % 5 === 0 ? or[1] ?? "" : dalle % 3 === 0 ? or[3] ?? "" : or[2] ?? "";
      if (!jointH && !jointV && alea(x, y) % 17 === 0) c = "#e8d8a0";
      const onde = Math.sin(x * 0.42 + Math.sin(y * 0.8) * 2.2) + Math.sin(y * 0.9 - x * 0.17);
      if (onde > 1.45) c = melanger(c, "#fffbd8", 0.55);
      t.poser(x, y, melanger(c, "#0f5168", 0.34 - a * 0.2));
    }
  }
  // Du sable et des algues au pied des murs.
  for (let x = 0; x < W; x++) if (alea(x, 61) % 3 === 0) t.poser(x, 62, "#2f8a6c");

  // Des bancs de poissons d'or, des bulles.
  for (const [bx, by, n, sens] of [[62, 9, 9, 1], [8, 34, 5, -1], [86, 30, 4, 1]] as const) {
    for (let i = 0; i < n; i++) {
      const x = bx + (alea(i, bx) % 20);
      const y = by + (alea(bx, i) % 9);
      if (dansLeCoinCalme(x - 2, y)) continue;
      t.poser(x, y, "#ffe07a");
      t.poser(x + sens, y, "#fff6c0");
      t.poser(x - sens, y, "#c88a30");
    }
  }
  for (let y = 4; y < 62; y++) for (let x = 3; x < W - 3; x++) if (!dansLeCoinCalme(x, y) && alea(x * 3, y * 5) % 173 === 0) {
    t.poser(x, y, "#d8fff0");
    if (alea(x, y) % 3 === 0) t.poser(x, y - 2, "#8fe0d8");
  }

  // Le premier plan : de grandes algues sombres dans les coins, ourlées de lumière.
  for (const [pied, haut, phase] of [[5, 40, 0], [9, 50, 1.4], [13, 58, 2.6], [118, 36, 0.7], [114, 48, 2], [110, 60, 3.3], [121, 54, 4]] as const) {
    for (let y = haut; y < H; y++) {
      const x = Math.round(pied + Math.sin(y * 0.3 + phase) * 1.8);
      const large = y > haut + 3 ? 2 : 1;
      t.bloc(x, y, large, 1, "#062430");
      if (y % 5 === 0) t.poser(x + (y % 2 ? -1 : large), y, "#062430");
      teinter(t, x + large - 1, y, "#2fa890", 0.5);
    }
  }
  for (const [cx, rx] of [[20, 5], [100, 6]] as const) {
    ellipse(t, cx, 79, rx, 4, (x, y, e) => (e > 0.7 && y < 78 ? "#c8508a" : alea(x, y) % 3 === 0 ? "#6a2458" : "#8a3470"));
  }
  return t.decor("#4a3a2c");
}

/* ───────────────────────────── 4. L'arbre-monde (mystique) ───────────────────────────── */

function arbreMonde(): Decor {
  const t = new Toile("#181444");
  degradeTrame(t, 0, 64, ["#0c0a26", "#100d30", "#15113c", "#1b1648", "#221c54", "#2b2460", "#352d6a", "#413872", "#4e457a", "#5c5482", "#6c648a"]);
  // Les étoiles.
  for (let y = 3; y < 56; y++) for (let x = 3; x < W - 3; x++) {
    if (dansLeCoinCalme(x, y)) continue;
    const g = alea(x, y);
    if (g % 97 === 0) t.poser(x, y, g % 5 === 0 ? "#fff6d8" : "#9a94d0");
  }
  // La lune, basse à gauche, sous le coin.
  const lx = 22;
  const ly = 44;
  halo(t, lx, ly, 30, "#c8c0f0", 0.34, 7);
  ellipse(t, lx, ly, 11, 11, (x, y, e) => (e > 0.84 ? "#e8d8c0" : nuee(x, y, 5, 8) > 0.6 ? "#eadcb8" : "#fff6d8"));

  // Le lointain : des monts pâles, un lac qui luit, une forêt minuscule qui donne l'échelle.
  const monts = (x: number) => crete(x, 54, [[3, 0.1, 0.4], [1.6, 0.26, 2], [0.8, 0.6, 1]]);
  relief(t, monts, 62, (x, _y, p) => (p === 0 ? "#8c84b0" : monts(x + 1) > monts(x) ? "#6a6298" : "#5a5290"));
  t.bloc(0, 61, W, 3, "#7c78a8");
  for (let x = 0; x < W; x++) {
    if (Math.abs(x - lx) < 9 && alea(x, 3) % 3) t.poser(x, 62, "#fff6d8");
    if (alea(x, 4) % 4 === 0) t.poser(x, 63, "#a8a4cc");
    const h = 2 + (alea(x, 5) % 3);
    for (let k = 0; k < h; k++) t.poser(x, 61 - k, k === h - 1 && x % 2 ? "#3a3470" : "#2a2658");
  }

  // Le tronc, colossal, à droite : écorce en sillons, ourlée par la lune, des veines de sève qui luisent.
  const cx = 105;
  const demi = (y: number): number => 9 + 0.0046 * Math.max(0, y - 14) ** 2;
  const ecorce = ["#a89cd0", "#6a5890", "#4a3a6c", "#362850", "#261a3c", "#180f2a"];
  for (let y = 4; y < 72; y++) {
    const d = demi(y);
    for (let x = Math.round(cx - d); x <= cx + d; x++) {
      const u = (x - cx) / d;
      const sillon = bruit(x + Math.sin(y * 0.11) * 2.5, y * 0.16, 2.1, 12);
      let i = u < -0.92 ? 0 : u < -0.6 ? 1 : u < -0.1 ? 2 : u < 0.55 ? 3 : 4;
      if (sillon < 0.32 && i > 0) i += 1;
      else if (sillon > 0.72 && i > 1) i -= 1;
      t.poser(x, y, ecorce[Math.min(5, i)] ?? "#000000");
    }
  }
  // Les veines : trois rivières de sève, de la porte jusqu'aux branches.
  for (const [dep, amp, phase] of [[-0.45, 0.18, 0], [0.05, 0.14, 2.1], [0.5, 0.16, 4]] as const) {
    for (let y = 8; y < 68; y++) {
      const x = Math.round(cx + demi(y) * (dep + amp * Math.sin(y * 0.19 + phase)));
      const noeud = (y + Math.round(phase * 3)) % 9 === 0;
      t.poser(x, y, noeud ? "#eafff4" : "#5fe8c8");
      if (noeud) {
        halo(t, x, y, 3.5, "#5fe8c8", 0.5, 3);
        t.poser(x, y, "#eafff4");
      } else teinter(t, x - 1, y, "#5fe8c8", 0.28);
    }
  }

  // La grande branche, qui part vers la gauche par-dessus le Gaulois, et celle de droite.
  const bois: Peau = { arete: "#a89cd0", clair: "#6a5890", moyen: "#4a3a6c", ombre: "#362850", sombre: "#261a3c", nuit: "#180f2a" };
  tube(t, courbe([[98, 22], [84, 25], [66, 27], [46, 28], [26, 31], [10, 30], [3, 33]], [5, 4.2, 3.4, 2.6, 2, 1.4, 1]), bois, { penche: 0.1 });
  tube(t, courbe([[110, 20], [118, 26], [124, 30]], [4, 3, 2.4]), bois, { penche: 0.1 });

  // Le feuillage : une voûte sur tout le haut à droite, des touffes sur la branche, et des fruits de lumière.
  const feuille = (x: number, y: number, bas: boolean): string => {
    const n = nuee(x, y * 1.3, 6, 3);
    return bas ? "#0c2630" : n > 0.62 ? "#3c9c78" : n > 0.5 ? "#226a5c" : n > 0.38 ? "#174a4a" : "#103638";
  };
  const voute = (x: number): number => {
    const bosses = 14 + 5 * Math.abs(Math.sin(x * 0.2 + 1)) + 3 * Math.abs(Math.sin(x * 0.53));
    return Math.round(x < 64 ? bosses - (64 - x) * 0.85 : bosses);
  };
  for (let x = 50; x < W; x++) for (let y = 0; y <= voute(x); y++) t.poser(x, y, feuille(x, y, y === voute(x)));
  const touffes: readonly (readonly [number, number, number, number])[] = [[9, 30, 7, 3.6], [22, 29, 6, 3.2], [36, 28, 6, 2.8], [50, 26, 6, 3], [121, 29, 5, 4], [15, 33, 4, 2.4]];
  for (const [tx, ty, rx, ry] of touffes) ellipse(t, tx, ty, rx, ry, (x, y, e) => (y < 26 && x < 48 ? null : feuille(x, y, e > 0.7 && y > ty)));
  // Le liseré de lune sur le dessus des touffes.
  for (const [tx, ty, rx, ry] of touffes) for (let x = tx - rx; x <= tx + rx; x++) {
    const y = Math.ceil(ty - ry * Math.sqrt(Math.max(0, 1 - ((x - tx) / rx) ** 2)));
    if (y >= 26 || x >= 48) t.poser(x, y, "#7fd8a8");
  }
  // Des lianes pendent, un fruit de lumière au bout.
  const lianes: readonly (readonly [number, number, number])[] = [[7, 33, 9], [13, 35, 14], [19, 32, 6], [27, 32, 11], [33, 31, 5], [41, 31, 8], [88, 0, 0], [92, 0, 7], [117, 33, 9], [121, 33, 5], [60, 0, 5], [70, 0, 8], [80, 0, 4]];
  for (const [x, y0, l] of lianes) {
    const depart = y0 || voute(x);
    for (let k = 0; k <= l; k++) t.poser(x + (k % 5 === 4 ? 1 : 0), depart + k, k % 3 === 2 ? "#226a5c" : "#103638");
    if (l > 0) {
      halo(t, x, depart + l + 1, 3.5, "#ffe9a0", 0.55, 3);
      t.poser(x, depart + l + 1, "#fffbe0");
      t.poser(x, depart + l + 2, "#ffc85a");
    }
  }
  for (let x = 52; x < W - 3; x++) for (let y = 3; y < voute(x) - 1; y++) if (alea(x * 3, y * 7) % 41 === 0) {
    teinter(t, x - 1, y, "#ffe9a0", 0.4);
    teinter(t, x + 1, y, "#ffe9a0", 0.4);
    teinter(t, x, y - 1, "#ffe9a0", 0.4);
    t.poser(x, y, "#fff2b8");
  }

  // Le sol : la mousse, les racines qui courent vers la gauche, la porte dans le tronc.
  const sol = (x: number) => crete(x, 70, [[0.9, 0.07, 0.3], [0.5, 0.31, 1.4]]);
  relief(t, sol, H, (x, y, p) => {
    if (p === 0) return alea(x, 6) % 3 === 0 ? "#8fd8b0" : "#4c9c84";
    if (p < 3) return alea(x, y) % 4 === 0 ? "#1f5a54" : "#2a7264";
    if (p < 5) return alea(Math.floor(x / 2), y) % 3 === 0 ? "#163c44" : "#1c4a4c";
    return alea(Math.floor(x / 3), y) % 5 === 0 ? "#2a2450" : y > 77 ? "#120e28" : "#1a1638";
  });
  tube(t, courbe([[92, 66], [78, 70], [60, 69], [42, 72], [28, 71]], [3.6, 3, 2.4, 1.8, 1]), bois, { penche: 0.1 });
  tube(t, courbe([[116, 67], [121, 71], [124, 72]], [3.4, 2.6, 2]), bois, { penche: 0.1 });
  tube(t, courbe([[96, 70], [86, 75], [72, 76], [58, 79]], [3, 2.4, 1.8, 1.2]), bois, { penche: 0.1 });
  // La porte : une arche de lumière chaude, trois marches.
  halo(t, 103, 64, 12, "#ffc85a", 0.4, 5);
  ellipse(t, 103, 63, 3.6, 5, (_x, y, e) => (y > 62 ? null : e > 0.62 ? "#7a4a30" : "#ffe9a0"));
  t.bloc(100, 63, 7, 6, "#ffe9a0");
  t.bloc(101, 64, 5, 5, "#fff6d0");
  t.bloc(100, 63, 1, 6, "#7a4a30");
  t.bloc(106, 63, 1, 6, "#7a4a30");
  t.bloc(103, 62, 1, 7, "#ffc85a");
  for (let j = 0; j < 3; j++) t.bloc(99 - j, 69 + j, 9 + j * 2, 1, j % 2 ? "#6a5890" : "#a89cd0");
  // Des champignons qui luisent, des lucioles.
  for (const [x, h] of [[8, 2], [16, 1], [34, 2], [47, 1], [88, 2], [112, 1], [118, 2]] as const) {
    const y = sol(x);
    halo(t, x, y - h, 4, "#5fe8c8", 0.45, 3);
    t.bloc(x, y - h, 1, h, "#c8f0e0");
    t.bloc(x - 1, y - h - 1, 3, 1, "#8ffff0");
    t.poser(x, y - h - 2, "#5fe8c8");
  }
  for (let y = 30; y < 76; y++) for (let x = 3; x < W - 3; x++) if (alea(x * 7, y * 3) % 149 === 0) {
    t.poser(x, y, "#fff6a8");
    teinter(t, x - 1, y, "#ffd870", 0.4);
    teinter(t, x + 1, y, "#ffd870", 0.4);
  }
  // Des fougères sombres au premier plan, dans les coins.
  for (const [px, sens] of [[4, 1], [10, 1], [120, -1], [115, -1]] as const) {
    for (let k = 0; k < 9; k++) {
      const x = px + sens * Math.round(k * 0.6);
      const y = 79 - k;
      t.poser(x, y, "#0a1a24");
      if (k > 1) {
        t.poser(x - 1, y + 1, "#0a1a24");
        t.poser(x + 1, y + 1, "#0a1a24");
        if (k % 2) t.poser(x + 2 * sens, y + 2, "#12303a");
      }
    }
  }
  return t.decor("#0c0a20");
}

/* ───────────────────────────── 5. Le phénix de braise (légendaire) ───────────────────────────── */

const FEU = ["#fffbe0", "#fff2a0", "#ffdc5c", "#ffbc3a", "#ff942c", "#f66a22", "#dc401e", "#b02222", "#7c1626"];

/**
 * Une aile en éventail autour de l'épaule : l'angle `phi` court du bord d'attaque (`phi0`, vers le haut) au bord de fuite
 * (`phi1`), la longueur des plumes suit `longueur(u)`, et chaque plume a son bout arrondi et son sillon.
 */
function aile(t: Toile, sx: number, sy: number, miroir: 1 | -1, phi0: number, phi1: number, longueur: (u: number) => number, plumes: number, couleurs: readonly string[], sillon: string): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - sx) * miroir;
      const dy = y - sy;
      const d = Math.hypot(dx, dy);
      const phi = Math.atan2(dy, dx);
      if (phi < phi0 || phi > phi1 || d < 0.5) continue;
      const u = (phi - phi0) / (phi1 - phi0);
      const f = u * plumes;
      const frac = f - Math.floor(f);
      const bord = Math.sqrt(4 * frac * (1 - frac));
      const l = longueur(u) * (0.78 + 0.22 * bord);
      if (d > l) continue;
      const q = d / l;
      let c = rampe(couleurs, q ** 1.15);
      if (bord < 0.45 && q > 0.3) c = melanger(c, sillon, 0.5);
      else if (frac > 0.5 && q > 0.3) c = melanger(c, sillon, 0.12);
      t.poser(x, y, c);
    }
  }
}

function phenixDeBraise(): Decor {
  const t = new Toile("#180c34");
  degradeTrame(t, 0, 60, ["#100822", "#140a2a", "#190c32", "#200e3c", "#2a1046", "#38124e", "#4a1654", "#601a56", "#7a2054", "#962a50", "#b23a4a", "#cc5044", "#e26c40", "#f48a40"]);
  // Quelques étoiles, loin du coin et de l'oiseau.
  for (let y = 3; y < 30; y++) for (let x = 3; x < W - 3; x++) if (!dansLeCoinCalme(x, y) && alea(x, y) % 139 === 0) t.poser(x, y, "#c8a0d8");

  // L'oiseau : son épaule, à droite, loin du centre. D'abord sa lueur sur le ciel.
  const ex = 100;
  const ey = 30;
  halo(t, ex, ey + 2, 46, "#ff7a2c", 0.42, 8);
  halo(t, ex, ey + 2, 26, "#ffc85a", 0.45, 6);

  // Des nuages en bandes, que le feu éclaire par-dessous.
  for (let y = 26; y < 56; y++) {
    for (let x = 0; x < W; x++) {
      const n = nuee(x, y * 3.2, 18, 41);
      if (n < 0.58) continue;
      const dessous = nuee(x, (y + 1) * 3.2, 18, 41) < 0.58;
      const pres = Math.max(0, 1 - Math.hypot(x - ex, y - ey) / 70);
      t.poser(x, y, dessous ? melanger("#b23a4a", "#ffc85a", pres) : melanger("#2a1046", "#7a2054", pres * 0.8 + (n > 0.64 ? 0 : 0.2)));
    }
  }

  // Le lointain : deux chaînes de monts, l'arête tournée vers le feu ourlée d'orange.
  const loin = (x: number) => crete(x, 51, [[4, 0.09, 1.2], [2.2, 0.23, 0.4], [1, 0.55, 2]]);
  relief(t, loin, 60, (x, _y, p) => (p === 0 ? "#e8704a" : p < 3 && (x < ex ? loin(x + 1) >= loin(x) : loin(x - 1) >= loin(x)) ? "#8a2c56" : "#5e1e50"));
  const pres = (x: number) => crete(x, 56, [[3.4, 0.06, 4], [2, 0.17, 1.6], [1.1, 0.43, 3]]) + (x > 84 && x < 118 ? 2 : 0);
  relief(t, pres, 60, (x, _y, p) => (p === 0 ? "#ff9a4a" : p < 2 && (x < ex ? pres(x + 1) >= pres(x) : pres(x - 1) >= pres(x)) ? "#7a2448" : "#34123c"));

  // Le lac : sombre, et le reflet de l'oiseau en traits de feu.
  degradeTrame(t, 60, 71, ["#4a1648", "#3a123e", "#2c0e34", "#200a2a"]);
  t.bloc(0, 60, W, 1, "#f48a40");
  for (let y = 61; y < 71; y++) {
    const large = 20 - (y - 61) * 0.9;
    for (let x = 3; x < W - 3; x++) {
      const g = alea(Math.floor(x / 3), y);
      const e = Math.abs(x - ex) / large;
      if (e < 1 && (g % 5 < 3 || e < 0.15)) t.poser(x, y, rampe(["#fff2a0", "#ffbc3a", "#ff942c", "#dc401e", "#b02222"], e * 0.8 + (y - 61) / 30));
      else if (g % 9 === 0) t.poser(x, y, e < 2.2 ? "#b23a4a" : "#601a56");
    }
  }

  // Les grandes plumes de la queue, qui retombent et s'enroulent, un œil de feu au bout.
  const plumesDeQueue: readonly (readonly Pt[])[] = [
    [[100, 42], [97, 52], [90, 58], [85, 55], [86, 50]],
    [[101, 43], [103, 54], [110, 60], [117, 57], [118, 51]],
    [[100, 43], [100, 55], [104, 63], [111, 66]],
  ];
  for (const points of plumesDeQueue) {
    const plume = courbe(points, [2.6, 2.2, 1.8, 1.5, 1.2], 16);
    for (const s of plume) {
      ellipse(t, s.x, s.y, s.r, s.r, FEU[Math.min(7, 3 + Math.floor(s.a * 5))] ?? "#ff942c");
      // Des barbes de flamme, de chaque côté.
      if (Math.round(s.a * 200) % 7 === 0) for (const cote of [-1, 1]) for (let k = 1; k <= 3; k++) teinter(t, Math.round(s.x - s.ty * cote * (s.r + k) - s.tx * k), Math.round(s.y + s.tx * cote * (s.r + k) - s.ty * k), "#ff942c", 0.85 - k * 0.2);
    }
    for (const s of plume) t.poser(Math.round(s.x), Math.round(s.y), s.a < 0.5 ? "#fffbe0" : "#ffdc5c");
    const bout = plume[plume.length - 1];
    if (bout) {
      halo(t, bout.x, bout.y, 7, "#ffbc3a", 0.5, 4);
      ellipse(t, bout.x, bout.y, 3, 3, (_x, _y, e) => (e > 0.6 ? "#f66a22" : e > 0.22 ? "#ffdc5c" : "#fffbe0"));
      t.poser(Math.round(bout.x), Math.round(bout.y), "#5ee8e0");
    }
  }

  // Les ailes : celle de gauche se déploie jusqu'au-dessus du Gaulois, celle de droite monte vers le bord.
  aile(t, ex - 4, ey, -1, -0.68, 0.72, (u) => 47 - 27 * u ** 0.85, 9, FEU.slice(2), "#7c1626");
  aile(t, ex + 4, ey, 1, -1.36, 0.55, (u) => 31 - 15 * u, 7, FEU.slice(2), "#7c1626");
  // Les couvertures, plus courtes et plus claires, puis le duvet blanc près du corps.
  aile(t, ex - 4, ey, -1, -0.66, 0.6, (u) => 27 - 13 * u, 11, FEU.slice(0, 6), "#f66a22");
  aile(t, ex + 4, ey, 1, -1.32, 0.45, (u) => 18 - 7 * u, 9, FEU.slice(0, 6), "#f66a22");
  aile(t, ex - 4, ey, -1, -0.62, 0.5, (u) => 12 - 4 * u, 8, FEU.slice(0, 3), "#ffbc3a");
  aile(t, ex + 4, ey, 1, -1.28, 0.4, (u) => 9 - 2 * u, 6, FEU.slice(0, 3), "#ffbc3a");
  // Le bord d'attaque : un trait de lumière.
  ligne(t, ex - 4, ey, ex - 4 - 36, ey - 29, "#fffbe0");
  ligne(t, ex - 5, ey + 1, ex - 4 - 24, ey - 18, "#fff2a0");
  ligne(t, ex + 4, ey, ex + 4 + 6, ey - 27, "#fffbe0");

  // Le corps, le cou, la tête et sa huppe de flammes.
  ellipse(t, ex, ey + 6, 5.4, 8.2, (x, y, e) => {
    const v = e + (x - ex) * 0.04 + (y - ey - 6) * 0.03;
    return v < 0.3 ? "#fffbe0" : v < 0.6 ? "#fff2a0" : v < 0.82 ? "#ffdc5c" : x > ex + 1 ? "#f66a22" : "#ff942c";
  });
  for (let y = ey + 4; y < ey + 13; y += 2) for (let x = ex - 4; x <= ex + 4; x++) if ((x + y) % 4 === 0 && Math.hypot((x - ex) / 5.4, (y - ey - 6) / 8.2) < 0.85) t.poser(x, y, "#ffbc3a");
  for (const s of courbe([[ex, ey], [ex - 1, ey - 5], [ex - 5, ey - 9]], [3.8, 3.2, 3], 10)) ellipse(t, s.x, s.y, s.r, s.r, (x) => (x < s.x - 0.5 ? "#fffbe0" : "#fff2a0"));
  // La huppe.
  for (const [x1, y1] of [[ex + 2, ey - 22], [ex + 6, ey - 18], [ex - 3, ey - 23]] as const) {
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ex - 5 + ((x1 - (ex - 5)) * i) / n + Math.sin(i * 0.9) * 0.6);
      const y = Math.round(ey - 14 + ((y1 - (ey - 14)) * i) / n);
      t.poser(x, y, FEU[Math.min(7, 1 + Math.floor((i / n) * 6))] ?? "#ff942c");
      if (i < 5) t.poser(x + 1, y, FEU[Math.min(7, 2 + Math.floor((i / n) * 6))] ?? "#ff942c");
    }
  }
  // La tête : bec sombre tourné vers la gauche, œil noir cerclé de lumière.
  t.grille(ex - 15, ey - 15, [
    ".......wwwww..",
    ".....wwwwwwww.",
    "....wwwwwwwwww",
    "...nwwkkwwwwww",
    "bbnnwwkwwwwwwy",
    "bbbbnywwwwwwyy",
    ".bbb.yyywwwyy.",
    "..b...yyyyyy..",
  ], { w: "#fffbe0", y: "#fff2a0", n: "#ffbc3a", b: "#5a1a2a", k: "#2a0a1e" });

  // Les braises qui montent, plus denses près de lui.
  for (let y = 3; y < 70; y++) {
    for (let x = 3; x < W - 3; x++) {
      if (dansLeCoinCalme(x, y)) continue;
      const d = Math.hypot(x - ex, y - ey);
      const rare = d < 30 ? 47 : d < 55 ? 79 : 149;
      const g = alea(x * 5, y * 3);
      if (g % rare !== 0) continue;
      t.poser(x, y, g % 3 === 0 ? "#fffbe0" : "#ffdc5c");
      teinter(t, x, y + 1, "#ff942c", 0.6);
      if (g % 4 === 0) teinter(t, x + 1, y + 2, "#f66a22", 0.4);
    }
  }

  // À gauche, sous le coin : deux vasques de pierre où brûle le même feu.
  const vasque = (x: number, pied: number, h: number, grand: boolean) => {
    const l = grand ? 6 : 4;
    for (let y = pied - h; y < pied; y++) {
      for (let k = 0; k < l; k++) t.poser(x + k, y, k >= l - 2 ? "#e2704a" : k === l - 3 ? "#7a2c50" : y % 5 === 0 ? "#2a1034" : "#3c1840");
    }
    t.bloc(x - 1, pied - 1, l + 2, 1, "#7a2c50");
    t.bloc(x - 2, pied - h - 2, l + 4, 2, "#3c1840");
    t.bloc(x - 3, pied - h - 3, l + 6, 1, "#e2704a");
    t.poser(x + l + 2, pied - h - 3, "#ffbc3a");
    const fx = x + l / 2 - 0.5;
    const fh = grand ? 11 : 7;
    halo(t, fx, pied - h - 6, grand ? 15 : 10, "#ff942c", 0.5, 5);
    for (let j = 0; j < fh; j++) {
      const a = j / fh;
      const large = (1 - a) ** 0.8 * (l / 2 + 1) + 0.4;
      const penche = Math.sin(j * 0.8 + x) * a * 1.6;
      for (let k = Math.round(fx - large + penche); k <= fx + large + penche; k++) {
        const e = Math.abs(k - fx - penche) / large;
        t.poser(k, pied - h - 4 - j, e < 0.35 && a < 0.6 ? "#fffbe0" : e < 0.65 && a < 0.8 ? "#ffdc5c" : a > 0.75 ? "#dc401e" : "#ff942c");
      }
    }
  };
  vasque(33, 68, 12, false);
  vasque(12, 72, 24, true);

  // Le premier plan : une corniche de roche sombre, l'arête ourlée de feu, des fissures de braise.
  const roche = (x: number) => crete(x, 70, [[0.9, 0.08, 2], [0.5, 0.33, 0.4]]);
  relief(t, roche, H, (x, y, p) => {
    if (p === 0) return x > 60 ? "#ffa04c" : "#d8603c";
    if (p === 1) return "#6a2444";
    if (bruit(x, y * 2, 3, 77) > 0.74 && p > 2) return alea(x, y) % 2 ? "#f66a22" : "#b02222";
    return alea(Math.floor(x / 2), y) % 7 === 0 ? "#3c1638" : y > 76 ? "#160820" : "#22102c";
  });
  for (const [x, l] of [[26, 5], [90, 6], [112, 5]] as const) {
    t.bloc(x, 73, l, 2, "#2e1234");
    t.bloc(x + 1, 72, l - 2, 1, "#e2704a");
  }
  return t.decor("#0e0616");
}

/* ───────────────────────────── Le lot ───────────────────────────── */

export const LOT_H: readonly BanniereDuLot[] = [
  {
    id: "iles-suspendues",
    nom: "Les îles suspendues",
    rarete: "epique",
    famille: "tresors",
    description: "Des îles flottent dans un ciel bleu : un temple en ruine, un arbre d'or, des cascades qui tombent dans une mer de nuages.",
    dessiner: ilesSuspendues,
  },
  {
    id: "serpent-de-mer",
    nom: "Le serpent de mer",
    rarete: "epique",
    famille: "tresors",
    description: "De nuit, un serpent de mer vert dresse la tête devant une grande lune, ses boucles hors de l'eau, vu du pont d'un navire.",
    dessiner: serpentDeMer,
  },
  {
    id: "cite-d-or-engloutie",
    nom: "La cité d'or engloutie",
    rarete: "mystique",
    famille: "tresors",
    description: "Sous la mer, une cité d'or : un temple à coupole éclairé du dedans, une pyramide à degrés, un dallage doré sous les rais du jour.",
    dessiner: citeEngloutie,
  },
  {
    id: "arbre-monde",
    nom: "L'arbre-monde",
    rarete: "mystique",
    famille: "tresors",
    description: "La nuit, un arbre colossal aux veines de sève lumineuse étend ses branches et ses fruits de lumière devant une lune basse.",
    dessiner: arbreMonde,
  },
  {
    id: "phenix-de-braise",
    nom: "Le phénix de braise",
    rarete: "legendaire",
    famille: "tresors",
    description: "Un phénix de feu déploie ses ailes dans un ciel de nuit rougeoyant, au-dessus d'un lac et de monts sombres, parmi les braises.",
    dessiner: phenixDeBraise,
  },
];
