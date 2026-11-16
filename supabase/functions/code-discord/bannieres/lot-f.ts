/**
 * Bannières, lot F, « Les trésors de la pochette » : voir `commun.ts`. Dessins originaux de Claude Fable 5.2 pour le clan
 * [GAL], 16 novembre 2026, sans emprunt à une œuvre existante.
 *
 * « Les grandes heures » : le thème d'OpenFront porté au spectaculaire, sans ses images. Une capitale au matin de la
 * victoire, une armada sans fin vue de la passerelle, le dernier bastion sous son bouclier, une salle de guerre
 * souterraine et son globe de lumière, une frappe vue depuis l'orbite. Partout : le coin en haut à gauche reste calme, le
 * sujet est à droite et à gauche sous le coin (jamais au centre seul), trois plans au moins, un sol à la rangée 72, et
 * rien d'aléatoire.
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
const borne01 = (v: number): number => Math.min(1, Math.max(0, v));

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const seuil = (x: number, y: number): number => ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;

/** Un dégradé vertical en paliers, tramé à la jointure de deux paliers ; `courbe` resserre les paliers vers le haut. */
function trame(t: Toile, y0: number, y1: number, couleurs: readonly string[], courbe = 1): void {
  const n = couleurs.length;
  for (let y = y0; y < y1; y++) {
    const v = ((y - y0 + 0.5) / (y1 - y0)) ** courbe * n - 0.5;
    const i = Math.floor(v);
    const p = borne01((v - i - 0.25) / 0.5);
    for (let x = 0; x < W; x++) {
      const k = Math.min(n - 1, Math.max(0, p > seuil(x, y) ? i + 1 : i));
      t.poser(x, y, couleurs[k] ?? "#000000");
    }
  }
}

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

const crete = (x: number, base: number, ondes: readonly (readonly [number, number, number])[]): number =>
  Math.round(base + ondes.reduce((s, [a, f, p]) => s + a * Math.sin(x * f + p), 0));

function relief(t: Toile, sommet: (x: number) => number, bas: number, couleur: (x: number, y: number, p: number) => string): void {
  for (let x = 0; x < W; x++) {
    const s = sommet(x);
    for (let y = Math.max(0, s); y < bas; y++) t.poser(x, y, couleur(x, y, y - s));
  }
}

/** Une courbe à trois points : `f(x, y, u)` avec `u` de 0 (départ) à 1 (arrivée). */
function courbe(p0: Pt, p1: Pt, p2: Pt, pas: number, f: (x: number, y: number, u: number) => void): void {
  let px = NaN;
  let py = NaN;
  for (let i = 0; i <= pas; i++) {
    const u = i / pas;
    const x = Math.round((1 - u) ** 2 * p0[0] + 2 * u * (1 - u) * p1[0] + u * u * p2[0]);
    const y = Math.round((1 - u) ** 2 * p0[1] + 2 * u * (1 - u) * p1[1] + u * u * p2[1]);
    if (x === px && y === py) continue;
    px = x;
    py = y;
    f(x, y, u);
  }
}

const dansLeCoinCalme = (x: number, y: number): boolean => x < 48 && y < 26;

/** Un faisceau de lumière : part de (x0, y0), s'ouvre et s'éteint avec la distance. */
function faisceau(t: Toile, x0: number, y0: number, angle: number, ouverture: number, long: number, couleur: string, force: number): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - x0;
      const dy = y - y0;
      const l = dx * ux + dy * uy;
      if (l < 1 || l > long || dansLeCoinCalme(x, y)) continue;
      const p = Math.abs(dy * ux - dx * uy);
      const larg = 0.7 + l * ouverture;
      if (p > larg) continue;
      teinter(t, x, y, couleur, force * (1 - l / long) * (1 - 0.6 * (p / larg)));
    }
  }
}

/** Sur l'arête d'un pavage d'hexagones de pas `taille` ? */
function surHexagone(px: number, py: number, taille: number): boolean {
  const h = taille * 0.866;
  const j0 = Math.round(py / h);
  let d1 = 1e9;
  let d2 = 1e9;
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    const dec = j & 1 ? taille / 2 : 0;
    const i0 = Math.round((px - dec) / taille);
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const d = Math.hypot(px - (i * taille + dec), py - j * h);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) d2 = d;
    }
  }
  return d2 - d1 < 0.75;
}

/**
 * Un gonfanon de fantaisie qui claque vers la droite : rouge sombre, liseré d'or, bout fendu en deux pointes, un torque
 * d'or au milieu. Aucun drapeau réel. `use` : des trous et un bout effiloché.
 */
function gonfanon(t: Toile, x0: number, y0: number, long: number, haut: number, use = false): void {
  const rouge = ["#a8242c", "#d8483c", "#6c1420"] as const;
  const or = ["#f2b83a", "#ffe480", "#b0741e"] as const;
  const sx = long * 0.38;
  const sy = (haut - 1) / 2;
  const rs = haut / 5;
  for (let dx = 0; dx < long; dx++) {
    const dec = Math.round(Math.sin(dx * 0.4 + 0.5) * 2.2 * (dx / long + 0.25));
    const lum = Math.cos(dx * 0.4 + 0.5);
    const ton = lum > 0.35 ? 1 : lum < -0.45 ? 2 : 0;
    for (let r = 0; r < haut; r++) {
      const queue = dx - (long - haut * 0.55);
      const fente = queue > 0 && Math.abs(r - sy) < queue * 0.8;
      if (fente) continue;
      if (use && (alea(dx * 3, r * 5) % 11 === 0 || (dx > long * 0.6 && alea(dx, r) % 4 === 0))) continue;
      const d = Math.hypot(dx - sx, r - sy);
      // L'emblème : un torque d'or, anneau ouvert vers le bas (un simple point sur un petit gonfanon).
      const torque = haut >= 9 && Math.abs(d - rs * 1.55) < 0.75 && !(r > sy + 1 && Math.abs(dx - sx) < 1.2);
      const lisere = r === 0 || r === haut - 1 || dx === 0 || (queue > 0 && Math.abs(r - sy) < queue * 0.8 + 1);
      const dore = lisere || (haut >= 9 ? torque : d <= rs);
      t.poser(x0 + dx, y0 + dec + r, (dore ? or : rouge)[ton] ?? rouge[0]);
    }
  }
}

/* ───────────────────────────── 1. Le matin de la victoire (épique) ───────────────────────────── */

function matinDeLaVictoire(): Decor {
  const t = new Toile("#1c2853");
  trame(t, 0, 60, ["#1c2853", "#212e5c", "#283666", "#324070", "#414c7c", "#565a88", "#706890", "#8e7896", "#ad8898", "#cc9a96", "#e6ad8e", "#f8c288", "#ffd690", "#ffe8a6"]);
  const sx = 113;
  const sy = 47;

  // Les rayons du levant, en éventail derrière la ville.
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < W; x++) {
      if (dansLeCoinCalme(x, y)) continue;
      const d = Math.hypot(x - sx, y - sy);
      if (d < 7 || d > 95) continue;
      const a = Math.atan2(y - sy, x - sx);
      if (Math.sin(a * 11 + 0.6) + 0.5 * Math.sin(a * 27 + 1.1) > 0.62) teinter(t, x, y, "#ffe9a8", 0.2 * (1 - d / 95));
    }
  }
  halo(t, sx, sy, 34, "#fff0b8", 0.62, 7);

  // De longs nuages, dorés par-dessous.
  const nuage = (x: number, y: number): boolean => nuee(x * 0.42, y * 2.5, 13, 7) > (dansLeCoinCalme(x, y) ? 0.9 : y < 8 || (x > 78 && y < 21) ? 0.72 : 0.585);
  for (let y = 5; y < 44; y++) {
    for (let x = 0; x < W; x++) {
      if (!nuage(x, y)) continue;
      const proche = borne01(1 - Math.hypot(x - sx, y - sy) / 95);
      let c = melanger("#4f5788", "#e58c8a", borne01((y / 44) * 0.55 + proche * 0.55));
      if (!nuage(x, y + 1)) c = melanger("#ffb488", "#fff2b4", proche);
      else if (!nuage(x, y + 2)) c = melanger(c, "#ffc898", 0.5);
      else if (!nuage(x, y - 1)) c = melanger(c, "#3a4274", 0.45);
      t.poser(x, y, c);
    }
  }
  ellipse(t, sx, sy, 6.5, 6.5, (_x, _y, e) => (e < 0.55 ? "#fffbe4" : "#fff0b0"));

  // Le passage de la victoire : cinq avions en pointe et leurs traînées.
  for (const [x, y] of [[82, 11], [89, 8], [90, 14], [96, 5], [104, 12]] as const) {
    for (let i = 0; i < 20; i++) teinter(t, x + 3 + i, y + Math.round(i * 0.18), "#fff4dc", 0.6 * (1 - i / 20));
    t.bloc(x, y, 3, 1, "#1a2046");
    t.poser(x + 1, y - 1, "#1a2046");
    t.poser(x + 1, y + 1, "#1a2046");
    t.poser(x + 2, y - 2, "#1a2046");
    t.poser(x + 2, y + 2, "#1a2046");
  }

  // La ville au loin, dans la brume dorée.
  const loin = (x: number) => 54 - (alea(Math.floor(x / 4), 91) % 8) - (alea(Math.floor(x / 11), 92) % 4);
  relief(t, loin, 62, (x, _y, p) => melanger(melanger("#b98c9e", "#f4c494", borne01(1 - Math.abs(x - sx) / 70)), "#ffdca4", borne01(p / 14)));
  for (const x of [14, 37, 62, 76]) {
    t.bloc(x, loin(x) - 6, 1, 6, "#b98c9e");
    t.poser(x, loin(x) - 7, "#d8a8a4");
  }

  // Les fumées qui retombent : fines, roses du côté du soleil.
  const fumee = (x0: number, y0: number, haut: number, derive: number, graine: number) => {
    for (let i = 0; i < haut; i++) {
      const y = y0 - i;
      const cx = x0 + derive * (i / haut) ** 1.6 * haut;
      const demi = 1 + i * 0.16;
      for (let x = Math.floor(cx - demi); x <= cx + demi; x++) {
        if (dansLeCoinCalme(x, y) || nuee(x * 2, y * 2, 7, graine) < 0.36) continue;
        teinter(t, x, y, x > cx ? "#f4c0a4" : "#5c5684", 0.8 - (i / haut) * 0.55);
      }
    }
  };
  fumee(33, 52, 24, -0.32, 33);
  fumee(72, 50, 20, 0.3, 37);

  // La ville, plan moyen : toits sombres, arêtes dorées du côté du soleil, quelques fenêtres.
  const moyen = (x: number) => 58 - (alea(Math.floor((x + 2) / 5), 93) % 7) - (alea(Math.floor(x / 13), 94) % 5 === 0 ? 6 : 0);
  relief(t, moyen, 64, (x, y, p) => {
    if (moyen(x + 1) > moyen(x) && p < moyen(x + 1) - moyen(x)) return "#ffcf8a";
    if (p === 0) return "#a87290";
    if (alea(x, y) % 19 === 0 && p > 1) return "#ffd98a";
    return melanger("#5a4878", "#46386a", borne01(p / 8));
  });
  // Des oriflammes pendent aux tours.
  for (const [x, h] of [[27, 7], [53, 6], [120, 6]] as const) {
    const y = moyen(x) + 1;
    t.bloc(x, y, 2, h, "#a8242c");
    t.bloc(x, y, 2, 1, "#f2b83a");
    t.poser(x, y + 3, "#ffe480");
    t.poser(x, y + h, "#a8242c");
  }

  // La citadelle, imaginaire, à contre-jour : une enceinte, des tours inégales coiffées de bulbes d'or.
  const pal = { nuit: "#33284e", ombre: "#463866", corps: "#57477a", clair: "#7a6392", or: "#ffd690" };
  t.bloc(79, 53, 31, 11, pal.ombre);
  t.bloc(79, 52, 31, 1, pal.clair);
  for (let x = 79; x < 110; x += 2) t.poser(x, 51, pal.corps);
  t.bloc(109, 52, 1, 12, pal.or);
  for (let y = 55; y < 63; y += 3) for (let x = 80 + (y % 2) * 3; x < 109; x += 6) t.bloc(x, y, 3, 1, pal.nuit);
  const tour = (x: number, l: number, haut: number) => {
    t.bloc(x, haut, l, 64 - haut, pal.corps);
    t.bloc(x, haut, 1, 64 - haut, pal.ombre);
    t.bloc(x + l - 1, haut, 1, 64 - haut, pal.or);
    t.bloc(x - 1, haut - 1, l + 2, 1, pal.clair);
    for (let i = x - 1; i <= x + l; i += 2) t.poser(i, haut - 2, pal.corps);
    for (let y = haut + 3; y < 60; y += 6) t.poser(x + Math.floor(l / 2), y, "#ffd98a");
  };
  const bulbe = (cx: number, base: number, rx: number, haut: number) => {
    for (let j = 0; j < haut; j++) {
      const w = rx * Math.sin(Math.PI * (0.2 + 0.8 * (j / haut)));
      const d = Math.round(cx + w);
      for (let x = Math.round(cx - w); x <= d; x++) t.poser(x, base - j, x === d ? "#fff2b8" : x < cx - w * 0.25 ? "#a86c3c" : "#eeb256");
    }
    t.bloc(cx, base - haut - 2, 1, 3, "#eeb256");
  };
  const toit = (cx: number, base: number, haut: number) => {
    for (let j = 0; j < haut; j++) {
      const w = Math.round(((haut - j) / haut) * 2);
      t.bloc(cx - w, base - j, w * 2 + 1, 1, pal.nuit);
      t.poser(cx + w, base - j, pal.or);
    }
  };
  tour(89, 3, 46);
  toit(90, 43, 5);
  tour(99, 3, 43);
  toit(100, 40, 6);
  tour(83, 5, 41);
  bulbe(85, 38, 3.2, 7);
  tour(103, 5, 37);
  bulbe(105, 34, 3.4, 8);
  tour(92, 7, 31);
  bulbe(95, 28, 4.4, 9);
  // Un gonfanon au sommet, une longue bannière sur la grande tour, la porte en ogive.
  t.bloc(95, 14, 1, 4, pal.nuit);
  gonfanon(t, 96, 14, 8, 5);
  t.bloc(94, 36, 3, 9, "#a8242c");
  t.bloc(94, 36, 3, 1, "#f2b83a");
  t.poser(95, 39, "#ffe480");
  t.poser(95, 45, "#a8242c");
  t.bloc(94, 58, 3, 6, pal.nuit);
  t.poser(95, 57, pal.nuit);

  // Le rempart : parapet crénelé, l'arête dorée par le levant, puis le chemin de ronde.
  const pierre = { or: "#ffd28c", clair: "#8c6c84", corps: "#3e2f52", joint: "#2c2040", nuit: "#1e1630" };
  for (let y = 64; y < 71; y++) {
    for (let x = 0; x < W; x++) {
      const rang = y - 64;
      const joint = rang % 3 === 2 || (x + (Math.floor(rang / 3) % 2) * 4) % 8 === 0;
      t.poser(x, y, rang === 0 ? pierre.or : rang === 1 ? pierre.clair : joint ? pierre.joint : pierre.corps);
    }
  }
  for (let m = 2; m < W; m += 11) {
    t.bloc(m, 60, 6, 4, pierre.corps);
    t.bloc(m, 59, 6, 1, pierre.or);
    t.bloc(m + 5, 60, 1, 4, "#c8988c");
    t.bloc(m, 60, 1, 4, pierre.joint);
    t.bloc(m + 1, 62, 4, 1, pierre.joint);
  }
  for (let y = 71; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rang = y - 71;
      const dalle = rang % 3 === 0 || (x + Math.floor(rang / 3) * 5) % 11 === 0;
      let c = melanger("#5c4868", "#2e2240", rang / 9);
      if (rang === 0) c = "#231a36";
      else if (dalle) c = melanger(c, "#1e1630", 0.5);
      else if (alea(x, y) % 13 === 0) c = melanger(c, "#ffd28c", 0.22);
      t.poser(x, y, c);
    }
  }
  // La lumière passe entre les créneaux : de longues coulées d'or sur les dalles.
  for (let y = 72; y < H - 2; y++) {
    for (let x = 0; x < W; x++) {
      const u = (((x + (y - 72) * 1.3 - 8) % 11) + 11) % 11;
      if (u < 4.5) teinter(t, x, y, "#ffcf8a", 0.26 - (y - 72) * 0.025);
    }
  }

  // Le grand étendard, au premier plan à gauche, sous le coin calme.
  t.bloc(10, 28, 1, 43, pierre.nuit);
  t.bloc(11, 28, 1, 43, "#d8a878");
  t.bloc(10, 26, 2, 2, "#ffe480");
  t.bloc(9, 70, 4, 1, pierre.nuit);
  gonfanon(t, 12, 30, 27, 15);

  // Une pluie de paillettes d'or.
  for (let y = 27; y < 70; y++) {
    for (let x = 3; x < W - 3; x++) {
      const g = alea(x * 3 + 1, y * 5 + 2);
      if (g % 131 !== 0) continue;
      t.poser(x, y, g % 3 === 0 ? "#fff6c8" : "#ffd24a");
      if (g % 2 === 0) teinter(t, x + 1, y + 1, "#ffd24a", 0.55);
    }
  }
  return t.decor("#1a1230");
}

/* ───────────────────────────── 2. L'armada sans fin (épique) ───────────────────────────── */

function armadaSansFin(): Decor {
  const t = new Toile("#44628a");
  const HZ = 25;
  trame(t, 0, HZ, ["#44628a", "#4c6a8e", "#587494", "#68809a", "#7c8ea0", "#9aa0a2", "#bcb4a0", "#dcc89e", "#f6dca2", "#ffeab0"]);
  const sx = 96;
  halo(t, sx, HZ - 3, 22, "#fff2c4", 0.6, 6);
  ellipse(t, sx, HZ - 3, 3.6, 3.6, "#fffbe4");
  // Des bancs de nuages plats, loin, à droite du coin calme.
  for (const [x, y, l] of [[56, 15, 14], [74, 18, 20], [104, 13, 15], [60, 20, 9], [108, 19, 13]] as const) {
    t.bloc(x, y, l, 1, "#ffe9b8");
    t.bloc(x + 2, y + 1, l - 3, 1, "#c8b0a0");
  }

  // La mer : de la brume d'or de l'horizon au bleu profond sous la passerelle.
  trame(t, HZ, H, ["#fbe2a8", "#ecd6a6", "#d2c8a6", "#b0b9a8", "#8caaa8", "#6a9aa6", "#4e8aa0", "#3a7a98", "#2c6a8e", "#225a84", "#1a4c78", "#143f6c", "#103460"], 0.62);
  for (let y = HZ + 2; y < 67; y++) {
    const pas = 2 + Math.floor((y - HZ) / 9);
    for (let x = 0; x < W; x++) {
      const g = alea(Math.floor((x + y * 3) / pas), y) % 13;
      if (g === 0) teinter(t, x, y, "#ffffff", 0.09);
      else if (g === 1) teinter(t, x, y, "#082040", 0.16);
    }
  }
  // Le sillage du soleil : des éclats de plus en plus larges.
  for (let y = HZ; y < 67; y++) {
    const demi = 2.5 + (y - HZ) * 0.24;
    const pas = 1 + Math.floor((y - HZ) / 14);
    for (let x = Math.floor(sx - demi); x <= sx + demi; x++) {
      const p = 1 - Math.abs(x - sx) / demi;
      if (alea(Math.floor(x / pas), y * 7) % 100 < p * 48 + (y - HZ < 3 ? 40 : 0)) t.poser(x, y, melanger("#fffbe0", "#ffd486", borne01((y - HZ) / 44)));
    }
  }

  // L'armada : des rangs de navires qui font route vers la droite, de plus en plus petits et pâles vers l'horizon.
  const navire = (x: number, y: number, long: number, brume: number) => {
    const voile = (c: string) => melanger(c, "#d6c8a6", brume);
    const coque = long >= 14 ? 3 : long >= 9 ? 2 : 1;
    // Le sillage, derrière et sous la coque ; la moustache d'écume à l'étrave.
    for (let i = 1; i < long * 1.7; i++) {
      const f = 1 - i / (long * 1.7);
      teinter(t, x - i, y + coque, "#ffffff", 0.75 * f * (1 - brume * 0.5));
      if (long >= 9 && i % 2 === 0) teinter(t, x - i - 1, y + coque + 1, "#c4ecec", 0.5 * f);
    }
    for (let i = 0; i < long; i++) if (alea(i, y) % 3 !== 0) teinter(t, x + i, y + coque, "#ffffff", 0.5 * (1 - brume * 0.5));
    teinter(t, x + long, y + coque, "#ffffff", 0.9);
    teinter(t, x + long + 1, y + coque - 1, "#ffffff", 0.6);
    // La coque : pont doré par le soleil, flanc sombre, étrave élancée.
    t.bloc(x, y - 1, long, 1, voile(long >= 9 ? "#98a2ae" : "#e0c898"));
    for (let i = 0; i < long; i += 2) if (long >= 9) t.poser(x + i, y - 1, voile("#f2d8a4"));
    t.bloc(x, y, long + 1, 1, voile("#2c3644"));
    if (coque >= 2) {
      t.bloc(x + 1, y + 1, long - 1, 1, voile(coque === 3 ? "#222b38" : "#161d28"));
      t.poser(x + long + 1, y - 1, voile("#2c3644"));
      t.poser(x + long, y - 1, voile("#f2d8a4"));
    }
    if (coque === 3) {
      t.bloc(x + 2, y + 2, long - 4, 1, voile("#121822"));
      t.poser(x + long + 2, y - 1, voile("#2c3644"));
      t.bloc(x + 2, y + 1, long - 5, 1, voile("#7a2c2c"));
    }
    if (long < 5) {
      t.poser(x + Math.floor(long / 2), y - 2, voile("#3a4452"));
      return;
    }
    // Le château, la cheminée, le mât ; les tourelles et leurs canons, à l'avant et à l'arrière.
    const h = Math.max(1, Math.round(long / 5));
    const cx = x + Math.round(long * 0.42);
    const lc = Math.max(2, Math.round(long / 4));
    t.bloc(cx, y - 1 - h, lc, h, voile("#4a5564"));
    t.bloc(cx, y - 2 - h, lc, 1, voile("#fff0c8"));
    t.bloc(cx + lc - 1, y - 1 - h, 1, h, voile("#c8ccd0"));
    t.bloc(cx + Math.floor(lc / 2), y - 2 - h * 2, 1, h, voile("#27303d"));
    if (long >= 9) {
      t.bloc(cx - 2, y - 1 - h, 1, h, voile("#27303d"));
      t.poser(cx - 2, y - 2 - h, voile("#8a94a0"));
      for (const tx of [x + 1, x + long - Math.round(long / 4) - 1]) {
        t.bloc(tx, y - 2, 2, 1, voile("#6a7686"));
        t.bloc(tx + 2, y - 2, long >= 14 ? 3 : 2, 1, voile("#1c2430"));
      }
    }
    if (long >= 14) {
      t.bloc(cx + 1, y - 3 - h, lc - 2, 1, voile("#4a5564"));
      t.bloc(cx + 1, y - 4 - h, lc - 2, 1, voile("#fff0c8"));
      for (let i = 0; i < 4; i++) teinter(t, cx - 3 - i * 2, y - 3 - h - i, "#3a4452", 0.5 - i * 0.1);
      for (let i = x + 3; i < x + long - 2; i += 3) t.poser(i, y, voile("#4a5564"));
    }
  };
  const rangs: readonly (readonly [number, number, number])[] = [[28, 3, 5], [30, 4, 1], [32, 5, 8], [35, 7, 2], [38, 9, 13], [42, 12, 4], [47, 16, 20], [54, 21, 9]];
  rangs.forEach(([y, long, dec], r) => {
    const pas = Math.round(long * 1.75 + 3);
    for (let x = dec - pas; x < W; x += pas) navire(x + (alea(x, y) % 2), y, long, borne01(0.72 - r * 0.115));
  });
  // Tout au fond, la flotte n'est plus qu'un semis de points.
  for (let x = 3; x < W - 3; x++) if (alea(x * 3, 26) % 3 === 0) teinter(t, x, HZ + 1 + (alea(x, 5) % 2), "#5a6676", 0.5);
  // La brume d'or mange l'horizon.
  for (let y = HZ; y < HZ + 6; y++) for (let x = 0; x < W; x++) teinter(t, x, y, "#ffe6ac", 0.5 - (y - HZ) * 0.085);

  // Deux patrouilles passent au-dessus, leur ombre sur l'eau.
  const avion = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [0, 3], [-1, 1], [1, 1], [-2, 1], [2, 1], [-1, 3], [1, 3]] as const) teinter(t, x + dx + 4, y + dy + 5, "#061830", 0.32);
    t.bloc(x, y, 1, 4, "#f0f2f4");
    t.bloc(x - 2, y + 1, 5, 1, "#d4dae2");
    t.bloc(x - 1, y + 3, 3, 1, "#aab4c0");
    t.poser(x + 2, y + 1, "#fff0cc");
  };
  for (const [x, y] of [[24, 36], [18, 40], [30, 40], [109, 44], [104, 48], [115, 48]] as const) avion(x, y);

  // La passerelle du navire amiral : le bastingage, puis le pont d'acier.
  for (let y = 67; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rang = y - 67;
      let c = melanger("#5c6876", "#333c4a", rang / 12);
      if (rang === 0) c = "#f4dcaa";
      else if (rang === 1) c = "#929caa";
      else if (rang % 5 === 2 || (x + Math.floor((rang - 2) / 5) * 7) % 15 === 0) c = melanger(c, "#1c2430", 0.45);
      else if ((x + Math.floor((rang - 2) / 5) * 7) % 15 === 1 && rang % 5 === 4) c = "#8894a2";
      t.poser(x, y, c);
    }
  }
  for (let x = 4; x < W - 3; x += 6) if (Math.floor(x / 6) % 2 === 0) t.bloc(x, 78, 4, 1, "#d8a838");
  t.bloc(0, 61, W, 1, "#1c2430");
  for (let x = 0; x < W; x++) if (x % 2 === 0) t.poser(x, 60, "#e8d4a4");
  for (let x = 0; x < W; x++) teinter(t, x, 64, "#1c2430", 0.7);
  for (let x = 5; x < W; x += 9) {
    t.bloc(x, 60, 1, 7, "#1c2430");
    t.poser(x + 1, 60, "#f4dcaa");
  }

  // Le mât de signaux, à gauche sous le coin calme : vergue, drisse et pavillons.
  t.bloc(8, 28, 1, 39, "#1c2430");
  t.bloc(9, 28, 1, 39, "#d8c498");
  t.bloc(3, 33, 16, 1, "#1c2430");
  t.bloc(3, 32, 16, 1, "#b8a888");
  t.bloc(7, 27, 4, 1, "#1c2430");
  t.poser(8, 26, "#ff5a4a");
  ligne(t, 17, 34, 31, 60, "#1c2430");
  const pavillons: readonly (readonly [string, string, number])[] = [["#e8483a", "#f4f4f0", 0], ["#ffd24a", "#ffd24a", 1], ["#2a62c8", "#f4f4f0", 2], ["#e8483a", "#ffd24a", 3], ["#f4f4f0", "#2a62c8", 0]];
  pavillons.forEach(([a, b, motif], i) => {
    const x = Math.round(18 + i * 2.6);
    const y = 36 + i * 5;
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        const second = motif === 0 ? dx >= 2 : motif === 1 ? false : motif === 2 ? dx > 0 && dx < 4 && dy > 0 && dy < 3 : dy >= 2;
        t.poser(x + dx + 1, y + dy, second ? b : a);
      }
    }
  });

  // L'antenne du radar, à droite : un treillis ourlé de lumière, et son nid.
  t.bloc(113, 37, 1, 30, "#1c2430");
  t.bloc(114, 37, 1, 30, "#d8c498");
  for (let y = 30; y < 38; y++) {
    for (let x = 103; x < 122; x++) {
      const bord = y === 30 || y === 37 || x === 103 || x === 121;
      if (bord) t.poser(x, y, y === 30 ? "#f4dcaa" : "#1c2430");
      else if ((x + y) % 3 === 0 || (x - y + 60) % 3 === 0) t.poser(x, y, "#2c3644");
    }
  }
  t.bloc(109, 47, 10, 3, "#333c4a");
  t.bloc(109, 46, 10, 1, "#f4dcaa");
  t.bloc(118, 47, 1, 3, "#c8b488");
  t.poser(113, 36, "#ff5a4a");
  return t.decor("#1a202c");
}

/* ───────────────────────────── 3. Le dernier bastion (mystique) ───────────────────────────── */

function dernierBastion(): Decor {
  const t = new Toile("#070a1c");
  trame(t, 0, 60, ["#070a1c", "#090d22", "#0c1028", "#10142f", "#151836", "#1c1c3e", "#262044", "#342448", "#46284a", "#5c2c48", "#763244", "#923a3e", "#ae463a"]);
  // Étoiles rares, et un plafond de fumée rougi par-dessous.
  for (let y = 3; y < 30; y++) for (let x = 3; x < W - 3; x++) if (alea(x, y) % 97 === 0) t.poser(x, y, alea(y, x) % 3 === 0 ? "#a8b0d8" : "#4a5080");
  const fum = (x: number, y: number): boolean => nuee(x * 0.5 + 30, y * 2.2, 14, 51) > (dansLeCoinCalme(x, y) ? 0.9 : 0.6);
  for (let y = 22; y < 56; y++) {
    for (let x = 0; x < W; x++) {
      if (!fum(x, y)) continue;
      let c = melanger("#151430", "#4a2038", borne01((y - 22) / 34));
      if (!fum(x, y + 1)) c = melanger("#c8503a", "#ff8a4a", borne01((y - 30) / 26));
      else if (!fum(x, y + 2)) c = melanger(c, "#a84038", 0.5);
      t.poser(x, y, c);
    }
  }

  // L'horizon : des collines noires, et tout le long les feux des assiégeants.
  const collines = (x: number) => crete(x, 57, [[2, 0.09, 1], [1, 0.23, 2]]);
  for (const x of [5, 14, 24, 33, 45, 58, 66, 74]) halo(t, x, collines(x), 7, "#ff7a2a", 0.6, 4);
  relief(t, collines, 64, (_x, _y, p) => (p === 0 ? "#3a1c30" : "#150f24"));
  for (const x of [5, 14, 24, 33, 45, 58, 66, 74]) {
    t.poser(x, collines(x), "#ffd870");
    t.poser(x + 1, collines(x), "#ff8a3a");
    t.poser(x, collines(x) - 1, "#ff8a3a");
  }
  // La plaine : terre brûlée, cratères, épaves qui fument.
  for (let y = 61; y < 70; y++) for (let x = 0; x < W; x++) t.poser(x, y, alea(Math.floor(x / 3), y) % 7 === 0 ? "#1c1630" : melanger("#17122a", "#0e0c1c", (y - 61) / 9));
  for (const [x, y, r] of [[20, 64, 5], [48, 66, 6], [66, 63, 4]] as const) {
    ellipse(t, x, y, r, 1.6, "#0a0816");
    t.bloc(x - r + 1, y - 2, r * 2 - 2, 1, "#3a2c44");
  }
  for (const [x, y] of [[34, 64], [60, 66]] as const) {
    halo(t, x + 2, y - 1, 6, "#ff7a2a", 0.45, 3);
    t.bloc(x, y, 5, 2, "#07060f");
    t.bloc(x + 1, y - 1, 2, 1, "#07060f");
    t.poser(x + 2, y - 2, "#ffb04a");
    t.poser(x + 3, y - 1, "#ff6a2a");
  }

  // L'éperon de roche, à droite, et le bastion dessus.
  const roc = (x: number) => (x < 64 ? 200 : x < 83 ? Math.round(68 - (x - 64) * 0.95 - Math.sin(x * 0.9) * 1.2) : Math.round(50 + Math.sin(x * 0.5) * 0.7));
  relief(t, roc, 72, (x, y, p) => {
    if (p === 0) return "#58a0b0";
    if (p === 1) return "#2c3c58";
    const strate = (y + Math.floor(x / 5)) % 4 === 0;
    return alea(Math.floor(x / 2), y) % 6 === 0 ? "#252844" : strate ? "#121428" : "#1a1c36";
  });
  const mur = { nuit: "#10122a", ombre: "#1c2040", corps: "#2c3458", clair: "#4a6a8a", arete: "#8fdce6", feu: "#ffc24a" };
  // Courtine crénelée.
  t.bloc(84, 43, 37, 8, mur.ombre);
  for (let x = 84; x < 121; x++) t.poser(x, 42, x % 4 < 2 ? mur.arete : mur.ombre);
  for (let x = 84; x < 121; x++) if (x % 4 < 2) t.poser(x, 43, mur.corps);
  for (let y = 45; y < 51; y += 2) for (let x = 85 + (y % 4); x < 120; x += 6) t.bloc(x, y, 3, 1, mur.nuit);
  // Tours d'angle.
  for (const [x, haut] of [[84, 34], [115, 31]] as const) {
    t.bloc(x, haut, 6, 51 - haut, mur.corps);
    t.bloc(x, haut, 1, 51 - haut, mur.clair);
    t.bloc(x + 5, haut, 1, 51 - haut, mur.nuit);
    t.bloc(x - 1, haut - 1, 8, 1, mur.arete);
    t.bloc(x - 1, haut, 8, 1, mur.ombre);
    t.bloc(x + 2, haut + 4, 2, 1, mur.feu);
    t.bloc(x + 2, haut + 9, 2, 1, mur.feu);
  }
  // Le donjon, à pans inclinés.
  for (let y = 28; y < 43; y++) {
    const retrait = Math.floor((42 - y) / 4);
    const x0 = 92 + retrait;
    const x1 = 113 - retrait;
    for (let x = x0; x < x1; x++) t.poser(x, y, x < x0 + 2 ? mur.clair : x >= x1 - 2 ? mur.nuit : y === 28 ? mur.arete : (y - 28) % 5 === 4 ? mur.ombre : mur.corps);
  }
  for (const [x, y, l] of [[98, 32, 2], [102, 32, 2], [106, 32, 2], [97, 37, 3], [104, 37, 3], [100, 41, 5]] as const) t.bloc(x, y, l, 1, mur.feu);
  // La tour de veille, son antenne et son feu rouge.
  t.bloc(100, 18, 6, 10, mur.corps);
  t.bloc(100, 18, 1, 10, mur.clair);
  t.bloc(105, 18, 1, 10, mur.nuit);
  t.bloc(99, 17, 8, 1, mur.arete);
  t.bloc(99, 18, 8, 1, mur.ombre);
  t.bloc(101, 21, 4, 1, mur.feu);
  t.bloc(102, 9, 1, 8, mur.ombre);
  halo(t, 102, 8, 4, "#ff3a3a", 0.6, 3);
  t.poser(102, 8, "#ff6a5a");
  // Une parabole sur le donjon.
  for (const [dx, dy] of [[0, 0], [1, -1], [2, -2], [3, -2], [4, -1], [5, 0]] as const) t.poser(107 + dx, 26 + dy, mur.arete);
  t.poser(109, 26, mur.ombre);
  t.poser(109, 27, mur.ombre);

  // Les projecteurs fouillent le ciel.
  faisceau(t, 87, 33, -2.05, 0.11, 46, "#cfe8ff", 0.34);
  faisceau(t, 118, 30, -1.75, 0.1, 40, "#cfe8ff", 0.3);
  // Les canons répondent : deux chapelets de traçantes.
  for (const [x0, y0, ax, ay] of [[87, 33, -0.82, -0.57], [103, 17, -0.5, -0.87]] as const) {
    for (let i = 3; i < 46; i += 4) {
      const x = Math.round(x0 + ax * i);
      const y = Math.round(y0 + ay * i);
      if (dansLeCoinCalme(x, y)) break;
      t.poser(x, y, "#fff2a8");
      teinter(t, Math.round(x - ax * 1.4), Math.round(y - ay * 1.4), "#ffb04a", 0.75);
    }
  }

  // Le bouclier : un dôme d'hexagones de lumière, presque invisible au centre, vif sur son bord.
  const bx = 100;
  const by = 63;
  const br = 47;
  const impacts: readonly (readonly [number, number, number])[] = [[66, 31, 1], [93, 17, 0.7], [115, 19, 0.6]];
  for (let y = by - br - 1; y <= by; y++) {
    for (let x = bx - br - 1; x < W; x++) {
      const d = Math.hypot(x - bx, y - by) / br;
      if (d > 1.012) continue;
      if (d > 0.975) {
        t.poser(x, y, melanger(t.lire(x, y) ?? "#000000", "#a8f6ff", d > 0.995 ? 0.55 : 0.9));
        continue;
      }
      const u = (x - bx) / br;
      const v = (y - by) / br;
      const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const fresnel = d ** 4;
      let pres = 0;
      for (const [ix, iy, f] of impacts) pres = Math.max(pres, borne01(1 - Math.hypot(x - ix, y - iy) / (17 * f)));
      teinter(t, x, y, "#3cc8e8", 0.04 + fresnel * 0.2);
      if (surHexagone((u / (1 + z)) * 62, (v / (1 + z)) * 62, 5.2)) teinter(t, x, y, "#8ff0ff", 0.07 + fresnel * 0.42 + pres * 0.6);
    }
  }
  // Les missiles qui arrivent, et ceux qui s'écrasent sur le dôme : éclair, ondes le long du bouclier.
  const missile = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = Math.round(x0 + (x1 - x0) * u);
      const y = Math.round(y0 + (y1 - y0) * u);
      if (dansLeCoinCalme(x, y)) continue;
      teinter(t, x, y, melanger("#6a3048", "#ffd08a", u * u), 0.25 + 0.75 * u);
      if (u > 0.4) teinter(t, x, y + 1, "#ff8a4a", 0.25 * u);
    }
  };
  missile(4, 27, 66, 31);
  missile(72, 3, 93, 17);
  missile(121, 6, 115, 19);
  missile(30, 34, 52, 42);
  halo(t, 52, 42, 4, "#ffb04a", 0.7, 3);
  t.poser(52, 42, "#fffbe0");
  for (const [ix, iy, f] of impacts) {
    for (let y = Math.floor(iy - 13 * f); y <= iy + 13 * f; y++) {
      for (let x = Math.floor(ix - 13 * f); x <= ix + 13 * f; x++) {
        const dd = Math.hypot(x - bx, y - by) / br;
        if (dd > 1.012) continue;
        const r = Math.hypot(x - ix, y - iy) / f;
        if (Math.abs(r - 6.5) < 0.6 || Math.abs(r - 10.5) < 0.5) teinter(t, x, y, "#d8fbff", r < 8 ? 0.75 : 0.4);
      }
    }
    halo(t, ix, iy, 9 * f, "#ffe9b0", 0.85, 5);
    ellipse(t, ix, iy, 2.2 * f, 2.2 * f, "#ffffff");
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + ix;
      const l = (4 + (alea(k, ix) % 5)) * f;
      const x = Math.round(ix + Math.cos(a) * l);
      const y = Math.round(iy + Math.sin(a) * l);
      if (Math.hypot(x - bx, y - by) > br) t.poser(x, y, k % 2 ? "#ffd870" : "#ff8a3a");
    }
  }

  // Le premier plan : le talus de la tranchée, bleui par le bouclier, les sacs de terre, les barbelés.
  const sol = (x: number) => crete(x, 70, [[0.8, 0.1, 0.4], [0.5, 0.33, 1.7]]);
  relief(t, sol, H, (x, y, p) => {
    if (p === 0) return x > 52 ? "#7fdce8" : "#4c6088";
    if (p === 1) return "#263050";
    return alea(Math.floor(x / 2), y) % 7 === 0 ? "#1c1a32" : y > 76 ? "#0a0916" : "#110f20";
  });
  for (let r = 0; r < 4; r++) {
    for (let x = 2 + (r % 2) * 3 - 3; x < 40 - r * 3; x += 6) {
      const y = 69 - (3 - r) * 2 + 0;
      t.bloc(x, y, 5, 2, "#1e1c36");
      t.bloc(x, y, 5, 1, r === 0 ? "#566a90" : "#34365a");
      t.poser(x + 5, y + 1, "#0a0916");
    }
  }
  for (const x of [94, 106, 118]) {
    t.bloc(x, 62, 1, 9, "#07060f");
    t.poser(x - 1, 63, "#07060f");
    t.poser(x + 1, 65, "#07060f");
    t.poser(x, 61, "#7fdce8");
  }
  for (let x = 90; x < W; x++) {
    const y = 64 + Math.round(Math.sin(x * 0.52) * 1.2);
    t.poser(x, y, x % 3 === 0 ? "#566a90" : "#07060f");
    t.poser(x, y + 3, x % 3 === 1 ? "#34365a" : "#07060f");
  }
  // L'étendard tient toujours, troué, planté dans les sacs.
  t.bloc(22, 29, 1, 34, "#07060f");
  t.bloc(23, 29, 1, 34, "#6a8ab0");
  t.poser(22, 28, "#8fdce6");
  gonfanon(t, 24, 31, 17, 10, true);

  // Des braises montent.
  for (let y = 27; y < 72; y++) {
    for (let x = 3; x < W - 3; x++) {
      const g = alea(x * 3 + 5, y * 7 + 1);
      if (g % 173 !== 0) continue;
      t.poser(x, y, g % 2 ? "#ffb04a" : "#ff6a2a");
      teinter(t, x, y + 1, "#ff6a2a", 0.4);
    }
  }
  return t.decor("#05040c");
}

/* ───────────────────────────── 4. La salle de guerre (mystique) ───────────────────────────── */

function salleDeGuerre(): Decor {
  const t = new Toile("#0a1220");
  // Le mur de béton : grandes dalles, coulures, à peine plus clair vers le bas.
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < W; x++) {
      let c = melanger("#09101c", "#101c2c", y / 60);
      c = melanger(c, "#162436", (nuee(x, y * 1.4, 22, 61) - 0.5) * 0.5);
      if (x % 31 === 30 || y % 20 === 19) c = melanger(c, "#04080e", 0.45);
      else if (x % 31 === 0 || y % 20 === 0) c = melanger(c, "#1c2c40", 0.3);
      t.poser(x, y, c);
    }
  }
  // Au plafond, à droite du coin calme : gaines et tuyaux, et un filet de lumière.
  t.bloc(48, 3, W - 48, 3, "#141e2c");
  t.bloc(48, 6, W - 48, 1, "#05090f");
  for (let x = 48; x < W; x++) if (x % 9 === 0) t.bloc(x, 3, 1, 3, "#243242");
  t.bloc(48, 8, W - 48, 1, "#1e2a3a");
  t.bloc(48, 9, W - 48, 1, "#05090f");
  for (let x = 50; x < W; x += 17) t.bloc(x, 8, 2, 2, "#34465a");

  // Le grand écran du fond : une carte du monde imaginaire, quadrillée, fronts en ambre, cibles en rouge.
  const ex = 48;
  const ey = 14;
  const el = 38;
  const eh = 32;
  halo(t, ex + el / 2, ey + eh / 2, 30, "#1c6a8c", 0.3, 5);
  t.bloc(ex - 1, ey - 1, el + 2, eh + 2, "#05090f");
  for (let y = 0; y < eh; y++) {
    for (let x = 0; x < el; x++) {
      const terre = nuee(x * 1.6 + 12, y * 2 + 5, 15, 71) > 0.52;
      const cote = terre && nuee(x * 1.6 + 12, (y - 1) * 2 + 5, 15, 71) <= 0.52;
      let c = terre ? (cote ? "#3fb8b0" : "#1f6a78") : "#0a2238";
      if (!terre && (x % 6 === 0 || y % 6 === 0)) c = "#103450";
      if (y % 2 === 1) c = melanger(c, "#04080e", 0.22);
      t.poser(ex + x, ey + y, c);
    }
  }
  courbe([ex + 4, ey + 20], [ex + 16, ey - 4], [ex + 31, ey + 12], 40, (x, y, u) => {
    if (y >= ey && Math.floor(u * 20) % 2 === 0) t.poser(x, y, "#ffb840");
  });
  for (const [x, y] of [[ex + 4, ey + 20], [ex + 31, ey + 12], [ex + 22, ey + 25]] as const) {
    t.poser(x, y, "#ff5a4a");
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) t.poser(x + dx, y + dy, "#c03a3a");
  }
  t.bloc(ex - 1, ey + eh + 1, el + 2, 1, "#243242");

  // Le mur d'écrans, à gauche sous le coin calme : radar, courbes, barres, carte, relevés, alerte.
  const ecran = (x0: number, y0: number, sorte: number) => {
    t.bloc(x0 - 1, y0 - 1, 12, 10, "#05090f");
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 10; i++) {
        let c = "#071a22";
        if (sorte === 0) {
          const d = Math.hypot(i - 4.5, j - 3.5);
          const a = Math.atan2(j - 3.5, i - 4.5);
          c = d < 4.2 ? (Math.abs(d - 2) < 0.5 || Math.abs(d - 3.8) < 0.45 ? "#2fae6a" : a > -1.2 && a < -0.2 ? "#1c7a4a" : "#0a3424") : "#061a14";
          if ((i === 6 && j === 2) || (i === 3 && j === 5)) c = "#b8ffc8";
        } else if (sorte === 1) {
          const h = Math.round(3.5 + Math.sin(i * 0.9) * 2 + Math.sin(i * 2.3) * 1);
          c = j === h ? "#ffc24a" : j > h ? "#3a2a10" : "#1a1408";
        } else if (sorte === 2) {
          const h = [5, 2, 6, 3, 7, 4, 1, 5, 3, 6][i] ?? 3;
          c = i % 2 === 0 && 8 - j <= h ? (8 - j === h ? "#a8f6ff" : "#2aa8c8") : "#071a26";
        } else if (sorte === 3) {
          c = nuee(i * 3 + 40, j * 3, 9, 77) > 0.5 ? "#2a8a7a" : "#0a2238";
          if ((i === 3 && j === 3) || (i === 7 && j === 5)) c = "#ff5a4a";
        } else if (sorte === 4) {
          c = j % 2 === 1 && i > 0 && i < 2 + (alea(j, x0) % 7) ? (j === 3 ? "#ffc24a" : "#3c7a8c") : "#071a22";
        } else {
          const tri = j >= 1 && j <= 6 && Math.abs(i - 4.5) <= (j - 1) * 0.75 + 0.5;
          c = tri ? (j > 1 && j < 6 && Math.abs(i - 4.5) < 1 && j !== 5 ? "#3a0c10" : "#ff4a3a") : "#2a0a10";
        }
        t.poser(x0 + i, y0 + j, c);
      }
    }
  };
  for (const [cx, cy, c] of [[15, 37, "#2fae6a"], [27, 37, "#2aa8c8"], [9, 43, "#ffb840"], [33, 43, "#ff4a3a"]] as const) halo(t, cx, cy, 15, c, 0.2, 4);
  [0, 1, 2, 3, 4, 5].forEach((s) => ecran(5 + (s % 3) * 12, 29 + Math.floor(s / 3) * 11, s));
  // Le pupitre dessous : touches et voyants.
  t.bloc(3, 52, 38, 1, "#3c5068");
  t.bloc(3, 53, 38, 3, "#1a2636");
  t.bloc(3, 56, 38, 4, "#0e1622");
  for (let x = 5; x < 40; x += 2) t.poser(x, 54, ["#2aa8c8", "#ffc24a", "#2fae6a", "#ff4a3a", "#34465a", "#34465a"][alea(x, 54) % 6] ?? "#34465a");

  // Le sol : dalles luisantes, lignes de fuite, bandes de lumière au pied des murs.
  for (let y = 60; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rang = y - 60;
      let c = melanger("#101c2a", "#060a12", rang / 20);
      const u = (x - 62) / (rang + 3);
      const fuite = Math.abs(u * 1.7 - Math.round(u * 1.7)) * (rang + 3) < 0.9;
      if (fuite || [1, 3, 6, 10, 15].includes(rang)) c = melanger(c, "#2a6a84", 0.4);
      if (rang === 0) c = "#3c5068";
      t.poser(x, y, c);
    }
  }

  // Le globe de lumière, à droite : un monde en hologramme, méridiens, orbites, tirs en cloche.
  const gx = 100;
  const gy = 33;
  const gr = 17;
  // Le socle du projecteur et son cône de lumière.
  for (let y = gy + 6; y < 60; y++) {
    const demi = 4 + ((59 - y) / (53 - gy)) * (gr - 5);
    for (let x = Math.round(gx - demi); x <= gx + demi; x++) teinter(t, x, y, "#3ce0f0", (alea(x, 3) % 3 === 0 ? 0.2 : 0.12) * (0.4 + (y - gy) / 30));
  }
  ellipse(t, gx, 62, 12, 3.2, "#0a1420");
  ellipse(t, gx, 61, 12, 3.2, (_x, y, e) => (e > 0.78 ? "#3c5068" : y < 61 ? "#16283a" : "#1e3246"));
  ellipse(t, gx, 60, 6, 1.6, (_x, _y, e) => (e < 0.4 ? "#e8ffff" : "#5ef0f0"));
  halo(t, gx, 60, 9, "#3ce0f0", 0.5, 4);
  halo(t, gx, gy, 30, "#2ac8e0", 0.3, 6);
  // L'orbite, moitié arrière (derrière le globe).
  const orbite = (rx: number, ry: number, pente: number, devant: boolean, couleur: string) => {
    for (let k = 0; k < 220; k++) {
      const a = (k / 220) * Math.PI * 2;
      if (Math.sin(a) > 0 !== devant) continue;
      const x = Math.round(gx + Math.cos(a) * rx);
      const y = Math.round(gy + Math.sin(a) * ry + Math.cos(a) * rx * pente);
      if (devant || Math.hypot(x - gx, y - gy) > gr) teinter(t, x, y, couleur, devant ? 0.95 : 0.5);
    }
  };
  orbite(24, 5, -0.22, false, "#5ef0f0");
  orbite(21, 7, 0.34, false, "#ffb840");
  for (let y = gy - gr; y <= gy + gr; y++) {
    for (let x = gx - gr; x <= gx + gr; x++) {
      const u = (x - gx) / gr;
      const v = (y - gy) / gr;
      const d2 = u * u + v * v;
      if (d2 > 1) continue;
      const z = Math.sqrt(1 - d2);
      const lat = Math.asin(borne01((1 - v) / 2) * 2 - 1);
      const lon = Math.atan2(u, z) + 0.6;
      const terre = nuee(lon * 14 + 60, lat * 16 + 60, 7, 83) > 0.5;
      const mer = Math.abs(((lat * 6) / Math.PI + 10.5) % 1 - 0.5) > 0.4 || Math.abs(((lon * 6) / Math.PI + 10.5) % 1 - 0.5) > 0.41;
      const bord = d2 > 0.86;
      const dessous = t.lire(x, y) ?? "#000000";
      let c = melanger(dessous, "#0c3848", 0.55);
      if (terre) c = melanger("#38d8d0", "#b8fff4", borne01(z * 0.9 - (y % 2) * 0.25));
      else if (mer) c = "#1f8a9c";
      if (bord) c = melanger(c, "#c8fffa", terre ? 0.5 : 0.75);
      else if (y % 2 === 1 && !terre) c = melanger(c, "#04121a", 0.3);
      t.poser(x, y, c);
    }
  }
  orbite(24, 5, -0.22, true, "#a8fbff");
  orbite(21, 7, 0.34, true, "#ffd070");
  // Satellites sur les orbites, cibles et tirs en cloche au-dessus du globe.
  for (const [x, y, c] of [[78, 42, "#ffffff"], [118, 26, "#ffe9b0"]] as const) {
    t.bloc(x, y, 2, 2, c);
    halo(t, x + 0.5, y + 0.5, 3.5, c, 0.6, 3);
  }
  const cibles: readonly Pt[] = [[92, 28], [107, 39], [103, 24]];
  courbe(cibles[0] ?? [0, 0], [99, 12], cibles[1] ?? [0, 0], 50, (x, y, u) => {
    if (Math.floor(u * 16) % 2 === 0) t.poser(x, y, "#ffb840");
  });
  courbe(cibles[0] ?? [0, 0], [96, 14], cibles[2] ?? [0, 0], 30, (x, y, u) => {
    if (Math.floor(u * 10) % 2 === 0) t.poser(x, y, "#ff7a5a");
  });
  for (const [x, y] of cibles) {
    halo(t, x, y, 4, "#ff4a3a", 0.7, 3);
    t.poser(x, y, "#fff0e0");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) t.poser(x + dx, y + dy, "#ff4a3a");
  }
  // Des grains de lumière montent dans le cône.
  for (let y = 14; y < 60; y++) for (let x = 78; x < 122; x++) if (alea(x * 5, y * 3) % 61 === 0 && Math.hypot(x - gx, y - gy) > gr + 1) teinter(t, x, y, "#a8fbff", 0.7);

  // Un gyrophare rouge, haut sur le mur de droite.
  halo(t, 117, 13, 8, "#ff3a3a", 0.5, 4);
  t.bloc(116, 12, 3, 3, "#ff4a3a");
  t.poser(117, 12, "#ffc0b0");
  t.bloc(115, 15, 5, 1, "#243242");

  // Les reflets sur le sol : le globe en longues touches, les écrans à gauche.
  for (let y = 64; y < H - 2; y++) {
    for (let x = gx - 15; x <= gx + 15; x++) {
      const p = 1 - Math.abs(x - gx) / 15;
      if (alea(Math.floor(x / 3), y) % 10 < p * 8 && (y + Math.floor(x / 3)) % 2 === 0) teinter(t, x, y, "#3ce0f0", 0.5 * p * (1 - (y - 64) / 20));
    }
    for (let x = 4; x < 40; x++) if ((y + Math.floor(x / 4)) % 3 === 0) teinter(t, x, y, ["#2fae6a", "#ffb840", "#2aa8c8"][Math.floor((x - 4) / 12) % 3] ?? "#2aa8c8", 0.2 * (1 - (y - 64) / 16));
  }
  // Au premier plan : deux pupitres en ombre, leurs voyants.
  for (const [x0, l] of [[3, 30], [94, 27]] as const) {
    for (let y = 73; y < H; y++) {
      const dec = Math.max(0, 76 - y);
      t.bloc(x0 + dec, y, l - dec * 2, 1, y === 73 ? "#34506a" : "#04070c");
    }
    for (let x = x0 + 5; x < x0 + l - 5; x += 3) t.poser(x, 75, ["#5ef0f0", "#ffb840", "#ff4a3a", "#2fae6a"][alea(x, 9) % 4] ?? "#5ef0f0");
  }
  return t.decor("#03060a");
}

/* ───────────────────────────── 5. La frappe vue de l'orbite (légendaire) ───────────────────────────── */

function frappeVueDeLOrbite(): Decor {
  const t = new Toile("#03040c");
  // L'espace : une traînée laiteuse en travers, des étoiles de trois grandeurs.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bande = borne01(1 - Math.abs(y - 4 - (x - 40) * 0.28) / 20) * borne01(Math.max((x - 47) / 16, (y - 25) / 12));
      const v = nuee(x * 1.2 + y * 0.5, y * 1.4 - x * 0.3, 20, 9);
      if (bande > 0) t.poser(x, y, melanger(melanger("#03040c", "#1c1a4c", bande * v * 1.3), "#3a2458", borne01((v - 0.55) * 2.4) * bande));
    }
  }
  for (let y = 3; y < 70; y++) {
    for (let x = 3; x < W - 3; x++) {
      const g = alea(x, y);
      const calme = dansLeCoinCalme(x, y);
      if (g % (calme ? 173 : 43) === 0) t.poser(x, y, calme ? "#3a4068" : ["#5a6090", "#8a90c0", "#c8d0f0", "#f0e0c8"][(g >> 8) % 4] ?? "#8a90c0");
    }
  }
  for (const [x, y] of [[52, 10], [77, 6], [70, 20], [118, 12], [8, 34], [40, 30]] as const) {
    t.poser(x, y, "#ffffff");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) teinter(t, x + dx, y + dy, "#a8c0ff", 0.65);
  }

  // La planète, de nuit : continents, nuages, villes, et le liseré de l'atmosphère où le jour se lève.
  const px = 95;
  const py = 160;
  const pr = 130;
  const limbe = (x: number) => py - Math.sqrt(pr * pr - (x - px) ** 2);
  const jx = 113;
  const jy = limbe(jx);
  const terre = (x: number, y: number) => nuee(x * 1.1 + 40, y * 2 + 10, 21, 5) > 0.5;
  for (let y = 24; y < 72; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - px, y - py);
      const aube = borne01(1 - Math.hypot(x - jx, y - jy) / 62);
      if (d >= pr) {
        const dehors = d - pr;
        if (dehors < 1.3) teinter(t, x, y, melanger("#2f7fe8", "#ffd896", aube), 0.6);
        else if (dehors < 2.8) teinter(t, x, y, melanger("#2460c8", "#ffb060", aube), 0.3);
        else if (dehors < 5) teinter(t, x, y, melanger("#1c4cb0", "#ff9a50", aube), 0.12 + aube * 0.1);
        continue;
      }
      const prof = pr - d;
      const sol = terre(x, y);
      let c = sol ? "#0d1826" : "#07102a";
      if (sol && !terre(x, y - 1)) c = "#16283a";
      const nu = nuee(x * 0.7 + 90, y * 2.4, 16, 8);
      if (nu > 0.56) c = melanger(c, "#31456e", borne01((nu - 0.56) * 4));
      else if (sol && prof > 3 && nuee(x * 1.4, y * 2.6, 8, 12) > 0.57 && alea(x, y) % 5 < 2) c = alea(y, x) % 4 === 0 ? "#fff0b8" : alea(y, x) % 2 === 0 ? "#ffb84a" : "#a8682a";
      c = melanger(c, "#2a5cc0", aube * 0.28);
      if (prof < 1) c = melanger("#86c8ff", "#fff6d8", aube);
      else if (prof < 2.2) c = melanger("#2f7fe8", "#ffc878", aube);
      else if (prof < 5) c = melanger(c, melanger("#1c5fd0", "#ff9450", aube), 0.55);
      else if (prof < 10) c = melanger(c, "#143c98", 0.28);
      t.poser(x, y, c);
    }
  }
  // Le premier éclat du jour sur le limbe.
  halo(t, jx, jy, 17, "#fff0c8", 0.75, 7);
  for (let i = -11; i <= 11; i++) teinter(t, jx + i, Math.round(limbe(jx + i)), "#ffffff", 0.9 - Math.abs(i) * 0.07);
  for (let i = 1; i < 12; i++) {
    teinter(t, jx - i, Math.round(jy), "#fff6d8", 0.7 - i * 0.055);
    teinter(t, jx + i, Math.round(jy), "#fff6d8", 0.7 - i * 0.055);
    if (i < 8) teinter(t, jx, Math.round(jy) - i, "#fff6d8", 0.75 - i * 0.09);
    if (i < 5) teinter(t, jx, Math.round(jy) + i, "#fff6d8", 0.6 - i * 0.12);
  }
  t.bloc(jx - 1, Math.round(jy) - 1, 3, 3, "#ffffff");

  // Les frappes : boule de feu écrasée par la perspective, onde de choc en anneaux, nuages soufflés.
  const frappe = (cx: number, cy: number, s: number, aplat: number) => {
    halo(t, cx, cy, 23 * s, "#ff7a2a", 0.55, 7);
    for (let y = Math.floor(cy - 18 * s * aplat); y <= cy + 18 * s * aplat; y++) {
      for (let x = Math.floor(cx - 18 * s); x <= cx + 18 * s; x++) {
        const dx = (x - cx) / s;
        const dy = (y - cy) / s / aplat;
        const a = Math.atan2(dy, dx);
        const brut = Math.hypot(dx, dy);
        // La boule de feu n'est pas ronde : des langues, des creux.
        const r = brut / (1 + 0.2 * Math.sin(a * 5 + 1) + 0.12 * Math.sin(a * 9 + cx) + 0.08 * Math.sin(a * 17));
        const dessous = t.lire(x, y) ?? "#000000";
        const g = alea(Math.round(a * 9) + 50, cx);
        if (r < 2.4) t.poser(x, y, "#ffffff");
        else if (r < 3.8) t.poser(x, y, "#fff4b0");
        else if (r < 5.2) t.poser(x, y, "#ffd058");
        else if (r < 6.6) t.poser(x, y, "#ff9a30");
        else if (r < 7.8) t.poser(x, y, "#e8562a");
        else if (r < 9) t.poser(x, y, melanger(dessous, "#7a1c24", 0.75));
        else if (r < 10.4) t.poser(x, y, melanger(dessous, "#1a0a18", 0.5));
        else if (brut > 12 && brut < 16.4 && g % 5 !== 0) {
          // L'onde de choc : un bourrelet de nuages soufflés, clair devant, rompu par endroits.
          const bord = brut > 15.2;
          t.poser(x, y, melanger(dessous, bord ? "#fff0c8" : "#ffb878", bord ? 0.85 : 0.3 + ((brut - 12) / 3.2) * 0.3));
        } else if (brut >= 16.4 && brut < 17.6) t.poser(x, y, melanger(dessous, "#ff9a50", 0.3));
        // Des traits de feu rayonnent entre la boule et l'onde.
        if (r >= 9 && brut < 15 && alea(Math.round(a * 14) + 90, cy) % 4 === 0) teinter(t, x, y, "#ffc070", 0.5);
      }
    }
  };
  frappe(101, 54, 1, 0.56);
  frappe(35, 57, 0.5, 0.42);
  // D'autres éclairs, plus loin, le long du front.
  for (const [x, y] of [[119, 44], [86, 43], [45, 49], [17, 66], [122, 58]] as const) {
    halo(t, x, y, 4.5, "#ff9a4a", 0.6, 3);
    t.poser(x, y, "#fffbe0");
    t.poser(x - 1, y, "#ffc050");
    t.poser(x + 1, y, "#ffc050");
  }

  // Les missiles : de longues cloches de feu au-dessus de l'atmosphère, la tête blanche.
  const tir = (p0: Pt, p1: Pt, p2: Pt) => {
    courbe(p0, p1, p2, 160, (x, y, u) => {
      if (dansLeCoinCalme(x, y)) return;
      teinter(t, x, y, melanger("#ff6a3a", "#fff6d0", u), 0.6 + 0.4 * u);
      if (u > 0.55) teinter(t, x, y + 1, "#ff7a3a", 0.3 * u);
    });
    halo(t, p2[0], p2[1], 4.5, "#ffd070", 0.75, 4);
    t.poser(p2[0], p2[1], "#ffffff");
    t.poser(p2[0] - 1, p2[1], "#fff0b0");
    t.poser(p2[0], p2[1] - 1, "#fff0b0");
  };
  tir([24, 64], [40, 12], [84, 36]);
  tir([46, 56], [68, 8], [106, 25]);
  tir([121, 50], [114, 8], [88, 18]);
  tir([6, 60], [14, 30], [30, 38]);
  // Les têtes qui rentrent : trois traits de feu vers la cible suivante.
  for (const [x, y] of [[112, 38], [117, 41], [108, 36]] as const) {
    for (let i = 0; i < 6; i++) teinter(t, x - i, y - i * 2, "#ffd890", 0.9 - i * 0.14);
    t.poser(x, y, "#ffffff");
  }

  // La station : le panneau solaire à gauche sous le coin calme, la rambarde, le pont.
  t.bloc(15, 54, 2, 15, "#141a28");
  t.bloc(17, 54, 1, 15, "#7a88a0");
  for (let y = 28; y < 55; y++) {
    for (let x = 5; x < 29; x++) {
      const i = (x - 5) % 6;
      const j = (y - 28) % 5;
      const bord = x === 5 || x === 28 || y === 28 || y === 54;
      const reflet = borne01(1 - Math.abs(x - 5 + (y - 28) - 24) / 9);
      let c = melanger("#0c2058", "#3f74dc", reflet);
      if (i === 5 || j === 4) c = "#10142c";
      else if (i === 0 || j === 0) c = melanger(c, "#8ab4ff", 0.3);
      if (bord) c = x === 28 ? "#ffd8a0" : y === 28 ? "#c8b890" : "#6a5a40";
      t.poser(x, y, c);
    }
  }
  t.bloc(5, 41, 24, 1, "#8a7a54");
  // Une antenne et son feu, à droite.
  t.bloc(118, 52, 1, 17, "#141a28");
  t.poser(118, 51, "#ff4a3a");
  halo(t, 118, 51, 3.5, "#ff3a3a", 0.6, 3);
  t.bloc(116, 56, 5, 1, "#3a4458");
  // La rambarde.
  t.bloc(0, 62, W, 1, "#56647c");
  t.bloc(0, 63, W, 1, "#10141f");
  for (let x = 0; x < W; x++) teinter(t, x, 66, "#10141f", 0.65);
  for (let x = 6; x < W; x += 12) {
    t.bloc(x, 62, 1, 7, "#10141f");
    t.bloc(x + 1, 62, 1, 7, "#56647c");
  }
  for (let x = 82; x < 121; x++) teinter(t, x, 62, "#ffb060", 0.5 * (1 - Math.abs(x - 101) / 20));
  // Le pont.
  for (let y = 69; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rang = y - 69;
      let c = melanger("#30384c", "#161b28", rang / 10);
      if (rang === 0) c = "#d4dcea";
      else if (rang === 1) c = "#69748a";
      else if (rang === 6 || (x + (rang > 6 ? 7 : 0)) % 14 === 0) c = melanger(c, "#080a12", 0.55);
      else if ((x + (rang > 6 ? 7 : 0)) % 14 === 1 && (rang === 2 || rang === 7)) c = "#56647c";
      t.poser(x, y, c);
    }
  }
  for (let x = 10; x < W - 3; x += 14) {
    t.poser(x, 78, "#5ee0ff");
    teinter(t, x - 1, 78, "#5ee0ff", 0.4);
    teinter(t, x + 1, 78, "#5ee0ff", 0.4);
  }
  // Le feu de la frappe se reflète sur le pont, le jour sur son arête.
  for (let y = 69; y < 73; y++) for (let x = 84; x < 120; x++) teinter(t, x, y, "#ff8a3a", (y === 69 ? 0.55 : 0.2) * (1 - Math.abs(x - 101) / 19));
  return t.decor("#080a12");
}

/* ───────────────────────────── Le lot ───────────────────────────── */

export const LOT_F: readonly BanniereDuLot[] = [
  {
    id: "matin-de-la-victoire",
    nom: "Le matin de la victoire",
    rarete: "epique",
    famille: "tresors",
    description: "Du haut d'un rempart, un étendard rouge et or flotte devant une citadelle aux dômes d'or, au lever du soleil, sous un passage d'avions.",
    dessiner: matinDeLaVictoire,
  },
  {
    id: "armada-sans-fin",
    nom: "L'armada sans fin",
    rarete: "epique",
    famille: "tresors",
    description: "Depuis la passerelle d'un navire, des rangs de vaisseaux et leurs sillages couvrent la mer jusqu'à l'horizon doré.",
    dessiner: armadaSansFin,
  },
  {
    id: "dernier-bastion",
    nom: "Le dernier bastion",
    rarete: "mystique",
    famille: "tresors",
    description: "La nuit, un bastion sur son rocher tient sous un dôme d'hexagones bleus où s'écrasent des missiles, face aux feux de la plaine.",
    dessiner: dernierBastion,
  },
  {
    id: "salle-de-guerre",
    nom: "La salle de guerre",
    rarete: "mystique",
    famille: "tresors",
    description: "Dans un abri de béton, un grand globe de lumière turquoise tourne au-dessus de son socle, près d'un mur d'écrans.",
    dessiner: salleDeGuerre,
  },
  {
    id: "frappe-vue-de-l-orbite",
    nom: "La frappe vue de l'orbite",
    rarete: "legendaire",
    famille: "tresors",
    description: "Depuis une station en orbite, des missiles tracent des arcs de feu au-dessus de la planète de nuit, où éclate une frappe.",
    dessiner: frappeVueDeLOrbite,
  },
];
