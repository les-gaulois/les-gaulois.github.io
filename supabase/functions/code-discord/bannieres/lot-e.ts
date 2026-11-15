/**
 * Bannières, lot E, « Légendes et styles » : voir `commun.ts`. Dessins originaux de Claude Fable 5.2 pour le clan [GAL],
 * 15 novembre 2026, sans emprunt à une œuvre existante.
 *
 * Huit thèmes hors de la guerre : un crépuscule néon, une mer de nuages, une salle d'arcade, une grotte aux cristaux, les
 * abysses, une forge sous un volcan, une nébuleuse vue d'un astéroïde, un dragon de pierre endormi. Partout : le coin en
 * haut à gauche reste calme, le sujet est à droite, dans le ciel et à gauche sous le coin, le sol est à la rangée 72.
 */
import { HAUTEUR, LARGEUR, Toile, melanger, type BanniereDuLot, type Decor } from "./commun.ts";

const W = LARGEUR;
const H = HAUTEUR;
type Pt = readonly [number, number];

/* ───────────────────────────── Outils ───────────────────────────── */

/** Un tirage fixe par case, bien brassé (sans les alignements d'un tirage simple) : le même à chaque image. */
const alea = (x: number, y: number): number => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const borne01 = (v: number): number => Math.min(1, Math.max(0, v));
/** La couleur d'une rampe pour `v` de 0 à 1, par paliers. */
const rampe = (couleurs: readonly string[], v: number): string => couleurs[Math.min(couleurs.length - 1, Math.max(0, Math.floor(v * couleurs.length)))] ?? "#000000";

/** Un dégradé vertical en bandes nettes, de la rangée `y0` à `y1` (non comprise). */
function degrade(t: Toile, y0: number, y1: number, couleurs: readonly string[]): void {
  for (let y = y0; y < y1; y++) t.bloc(0, y, W, 1, rampe(couleurs, (y - y0) / (y1 - y0)));
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

/** Un bruit doux et fixe, de 0 à 1 : des valeurs tirées sur un quadrillage de pas `pas`, lissées entre elles. */
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

/** Une étoile en croix. */
function etoileEnCroix(t: Toile, x: number, y: number, coeur: string, branche: string): void {
  t.poser(x, y, coeur);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) teinter(t, x + dx, y + dy, branche, 0.7);
}

const dansLeCoinCalme = (x: number, y: number): boolean => x < 48 && y < 26;

/* ───────────────────────────── 1. Crépuscule néon (commun) ───────────────────────────── */

function crepusculeNeon(): Decor {
  const t = new Toile("#160c38");
  degrade(t, 0, 58, ["#160c38", "#1b0e42", "#22114e", "#2e145e", "#40186e", "#581d7e", "#75238c", "#972b94", "#bb3894", "#da4d8e", "#f06a88", "#fb8a84", "#ffa884"]);
  // Quelques étoiles, hautes et discrètes.
  for (let y = 3; y < 22; y++) for (let x = 3; x < W - 3; x++) if (alea(x, y) % 83 === 0) t.poser(x, y, alea(y, x) % 3 === 0 ? "#c9a8f0" : "#7a5cb8");

  // Le soleil à bandes : plein en haut, coupé de fentes de plus en plus larges vers le bas.
  const sx = 97;
  const sy = 39;
  const sr = 20;
  const fentes: readonly Pt[] = [[1, 1], [5, 1], [9, 2], [13, 2], [17, 3]];
  const soleil = ["#fff6a8", "#ffe98a", "#ffd870", "#ffc163", "#ffa55e", "#ff8a66", "#ff7074", "#ff5a86", "#f8499a", "#e63ea6"];
  for (let y = sy - sr; y <= sy + sr; y++) {
    const rel = y - sy;
    if (fentes.some(([d, h]) => rel >= d && rel < d + h)) continue;
    for (let x = sx - sr; x <= sx + sr; x++) {
      if ((x - sx + 0.5) ** 2 + (rel + 0.5) ** 2 <= sr * sr) t.poser(x, y, rampe(soleil, (y - (sy - sr)) / (2 * sr + 1)));
    }
  }

  // Trois plans de montagnes violettes, du plus pâle au plus sombre, l'arête tournée vers le soleil ourlée de rose.
  const loin = (x: number) => crete(x, 50, [[4, 0.11, 0.6], [2.2, 0.27, 2.1], [1, 0.61, 0.3]]);
  relief(t, loin, 60, (_x, _y, p) => (p === 0 ? "#b04a9c" : "#8a389a"));
  const milieu = (x: number) => crete(x, 55, [[5, 0.07, 3.2], [2.5, 0.19, 1.1], [1.2, 0.47, 4.0]]) + (x > 70 && x < 112 ? 3 : 0);
  relief(t, milieu, 60, (x, _y, p) => (p === 0 ? "#8a3a9e" : p < 3 && milieu(x + 1) > milieu(x) ? "#6a2a8c" : "#551f7c"));

  // Le lac : bandes sombres, reflet du soleil en traits, de plus en plus courts.
  degrade(t, 60, 70, ["#3a1766", "#32145c", "#2a1152", "#230e48", "#1d0b40"]);
  t.bloc(0, 60, W, 1, "#c0509c");
  for (let y = 61; y < 70; y++) {
    const demi = 17 - (y - 61) * 1.4;
    for (let x = Math.round(sx - demi); x <= sx + demi; x++) {
      if ((alea(Math.floor(x / 3), y) % 5 < 3 && (y % 2 === 1 || demi > 12)) || Math.abs(x - sx) < 2) t.poser(x, y, rampe(["#ffb070", "#ff8a78", "#f8619a", "#d0489c"], (y - 61) / 9));
    }
    for (let x = 3; x < W - 3; x++) if (Math.abs(x - sx) > demi + 3 && alea(Math.floor(x / 4), y * 3) % 13 === 0) t.poser(x, y, "#5a2484");
  }

  // La rive : roche sombre, liseré rose sur l'arête, cailloux.
  const rive = (x: number) => crete(x, 70, [[0.8, 0.09, 1.0], [0.5, 0.31, 2.0]]);
  relief(t, rive, H, (x, y, p) => {
    if (p === 0) return "#e85a9c";
    if (p === 1) return "#6a2a8a";
    return alea(Math.floor(x / 2), y) % 9 === 0 ? "#2a1250" : y > 76 ? "#120828" : "#1a0c38";
  });
  for (const [x, l] of [[8, 5], [29, 3], [88, 4], [108, 6]] as const) {
    t.bloc(x, 74, l, 1, "#3a1a66");
    t.bloc(x + 1, 73, l - 2, 1, "#8a3a9e");
  }
  return t.decor("#0c0520");
}

/* ───────────────────────────── 2. Mer de nuages (commun) ───────────────────────────── */

function merDeNuages(): Decor {
  const t = new Toile("#3f6fb8");
  degrade(t, 0, 60, ["#3c6ab4", "#4777be", "#5585c6", "#6695ce", "#7ba6d6", "#93b6dc", "#adc5e0", "#c8d2e0", "#e2d9d8", "#f6dcc6", "#ffd3ac", "#ffc594"]);

  // Le soleil levant, bas sur la droite.
  halo(t, 108, 32, 22, "#fff0c8", 0.55, 4);
  ellipse(t, 108, 32, 5.5, 5.5, "#fff8e0");

  // Des pics percent les nuages : face au soleil rosée, l'autre bleutée, neige au sommet.
  const pic = (cx: number, sommet: number, pente: number, clair: string, sombre: string, neige: string) => {
    for (let y = sommet; y < 66; y++) {
      const demi = (y - sommet) * pente + 0.5;
      const pli = Math.round(Math.sin(y * 0.7 + cx) * 1.6);
      for (let x = Math.round(cx - demi); x <= cx + demi; x++) {
        const cote = x - cx - pli > 0;
        const haut = y - sommet < 5 + (alea(x, 3) % 3);
        t.poser(x, y, haut ? (cote ? neige : melanger(neige, sombre, 0.45)) : cote ? clair : sombre);
      }
    }
  };
  pic(20, 37, 0.85, "#c9b4cc", "#8f9cc8", "#f4e8ea");
  pic(118, 30, 0.8, "#e0a8a8", "#7f86ba", "#fff0e6");
  pic(96, 21, 0.72, "#eab0a4", "#6c76b2", "#fff4e8");
  // Trois oiseaux, loin.
  for (const [x, y] of [[70, 20], [76, 17], [83, 22]] as const) {
    t.poser(x, y, "#3a4c84");
    t.poser(x - 1, y - 1, "#3a4c84");
    t.poser(x + 1, y - 1, "#3a4c84");
  }

  // La mer de nuages : trois couches, la plus proche porte le Gaulois.
  nuages(t, 58, 5, 0.105, 0.4, { haut: "#fff4e4", corps: "#f4dcd4", ombre: "#e4c4cc" });
  nuages(t, 65, 6, 0.083, 2.2, { haut: "#fffaf0", corps: "#f8e4dc", ombre: "#dcbcd0" });
  nuages(t, 72, 4, 0.066, 4.4, { haut: "#ffffff", corps: "#fff4ea", ombre: "#e6cad6" });
  // Sous les pieds : creux d'ombre en longues bandes.
  for (let y = 75; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.sin(x * 0.12 + y * 0.9) + Math.sin(x * 0.05 + 1.3);
      if (v > 1.1) t.poser(x, y, "#d2b0cc");
      else if (y > 77 && v > 0.2) t.poser(x, y, "#dcc0d2");
    }
  }
  return t.decor("#d4b4cc");
}

/* ───────────────────────────── 3. Salle d'arcade (peu commun) ───────────────────────────── */

function salleDArcade(): Decor {
  const t = new Toile("#1c1436");
  degrade(t, 0, 60, ["#161030", "#191234", "#1d153a", "#211840", "#261b48", "#2a1e4e"]);
  // Le mur : lambris à larges lames.
  for (let x = 0; x < W; x += 12) for (let y = 0; y < 60; y++) teinter(t, x, y, "#0c0820", 0.35);
  t.bloc(0, 58, W, 2, "#120c28");

  // Trois enseignes au néon, formes simples : un zigzag, un anneau, un triangle.
  const neon = (points: readonly Pt[], couleur: string, clair: string) => {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a && b) ligne(t, a[0], a[1], b[0], b[1], couleur);
    }
    for (const [x, y] of points) t.poser(x, y, clair);
  };
  halo(t, 60, 12, 12, "#ff4fb0", 0.3, 3);
  halo(t, 99, 13, 13, "#35e0f0", 0.32, 3);
  halo(t, 115, 14, 10, "#ffd84a", 0.28, 3);
  neon([[52, 15], [56, 8], [60, 15], [64, 8], [68, 15]], "#ff4fb0", "#ffc0e4");
  for (let a = 0; a < 40; a++) t.poser(Math.round(99 + 6.5 * Math.cos((a * Math.PI) / 20)), Math.round(13 + 6.5 * Math.sin((a * Math.PI) / 20)), a % 10 === 0 ? "#d8fbff" : "#35e0f0");
  neon([[115, 8], [121, 19], [109, 19], [115, 8]], "#ffd84a", "#fff6c0");
  // Un long tube au ras du plafond, hors du coin calme.
  for (let x = 48; x < W; x++) {
    t.poser(x, 4, "#8a5cff");
    teinter(t, x, 5, "#8a5cff", 0.3);
  }

  // Le sol : moquette sombre semée de petits motifs.
  degrade(t, 60, H, ["#18123a", "#151034", "#120e2e", "#100c28"]);
  const motifs = ["#ff4fb0", "#35e0f0", "#ffd84a", "#8a5cff"];
  for (let y = 62; y < H - 1; y += 3) {
    for (let x = 2 + ((y / 3) % 2) * 4; x < W - 2; x += 8) {
      const g = alea(x, y);
      const c = melanger(motifs[g % 4] ?? "#ff4fb0", "#120e2e", 0.25);
      const dx = (g >> 3) % 3;
      t.poser(x + dx, y, c);
      if (g % 3 === 0) t.poser(x + dx + 1, y + 1, c);
      else if (g % 3 === 1) t.poser(x + dx + 1, y, c);
      else t.poser(x + dx - 1, y + 1, c);
    }
  }

  // Les bornes : fronton lumineux, écran, pupitre, caisse rayée.
  const ecran = (motif: number, i: number, j: number): string => {
    switch (motif) {
      case 0: {
        const d = Math.abs(i - 3.5) + Math.abs(j - 3.5);
        return d < 1.5 ? "#fff6c0" : d < 3 ? "#ffb03a" : d < 4.5 ? "#e8483a" : "#3a0e3a";
      }
      case 1:
        return ["#35e0f0", "#2a9ae0", "#6a5cf0", "#c050e0"][Math.floor((i + j) / 2) % 4] ?? "#35e0f0";
      case 2:
        return j === 7 && i > 1 && i < 6 ? "#f4f4ff" : (i === 5 && j === 3) || (i === 2 && j === 1) ? "#ffe04a" : j < 2 && (i + j) % 2 === 0 ? "#ff5a8a" : "#10203a";
      case 3:
        return Math.abs(i - 3.5) + j * 0.9 > 4 && (Math.floor(Math.abs(i - 3.5) + j) % 3 === 0) ? "#5cf0a0" : "#0c2a2a";
      case 4:
        return (Math.floor(i / 2) + Math.floor(j / 2)) % 2 === 0 ? "#ffd84a" : "#e86a2a";
      default:
        return alea(i + motif * 9, j) % 6 === 0 ? "#ffffff" : j > 5 ? "#3a2a8a" : "#141040";
    }
  };
  const borne = (x: number, caisse: string, accent: string, motif: number) => {
    const sombre = melanger(caisse, "#08061a", 0.5);
    const clair = melanger(caisse, "#ffffff", 0.25);
    // Lumière de l'écran sur le sol.
    for (let y = 67; y < 76; y++) for (let dx = -3; dx < 17; dx++) teinter(t, x + dx, y, accent, 0.34 * (1 - (y - 67) / 9) * (1 - Math.abs(dx - 6.5) / 10));
    t.bloc(x + 1, 26, 12, 1, sombre);
    t.bloc(x, 27, 14, 6, caisse);
    t.bloc(x + 1, 28, 12, 4, accent);
    for (let dx = 2; dx < 12; dx += 3) t.bloc(x + dx, 29, 2, 2, melanger(accent, "#ffffff", 0.6));
    t.bloc(x, 33, 14, 1, sombre);
    t.bloc(x + 1, 34, 12, 10, "#0b091c");
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) t.poser(x + 3 + i, 35 + j, ecran(motif, i, j));
    t.bloc(x + 3, 35, 8, 1, melanger(ecran(motif, 3, 0), "#ffffff", 0.2));
    // Pupitre.
    t.bloc(x, 44, 14, 2, clair);
    t.bloc(x, 46, 14, 1, caisse);
    t.poser(x + 3, 43, "#ff3a4a");
    t.poser(x + 3, 44, "#d8d8e8");
    t.poser(x + 7, 44, "#ffd84a");
    t.poser(x + 9, 44, "#35e0f0");
    t.poser(x + 11, 44, "#ff4fb0");
    // Caisse et sa rayure.
    t.bloc(x + 1, 47, 12, 19, caisse);
    for (let y = 47; y < 66; y++) {
      t.poser(x + 1, y, clair);
      t.poser(x + 12, y, sombre);
      const d = (y - 47) >> 1;
      if (d < 9) {
        t.poser(x + 2 + d, y, accent);
        t.poser(x + 3 + d, y, melanger(accent, caisse, 0.5));
      }
    }
    t.bloc(x + 8, 57, 3, 5, sombre);
    t.poser(x + 9, 58, "#ffb03a");
    t.bloc(x, 66, 14, 1, "#07051a");
  };
  borne(4, "#3a2a7a", "#35e0f0", 1);
  borne(20, "#7a2450", "#ffd84a", 0);
  borne(36, "#1f4a5a", "#5cf0a0", 3);
  borne(74, "#5a2a80", "#ff4fb0", 5);
  borne(90, "#22407a", "#ffb03a", 4);
  borne(106, "#6a2238", "#ff5a8a", 2);
  return t.decor("#08061a");
}

/* ───────────────────────────── 4. Grotte aux cristaux (peu commun) ───────────────────────────── */

function grotteAuxCristaux(): Decor {
  const t = new Toile("#0c1626");
  const roche = ["#0a1220", "#0d1828", "#111f32", "#15263c", "#192d46"];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t.poser(x, y, rampe(roche, nuee(x, y * 1.5, 26, 4) * 0.9 + 0.05));

  // Les lueurs des deux massifs, avant les cristaux.
  halo(t, 104, 48, 42, "#2fc6e6", 0.5, 6);
  halo(t, 17, 56, 30, "#c45cf0", 0.46, 5);

  // Stalactites au plafond, hors du coin calme.
  for (let x = 48; x < W; x += 1) {
    const g = alea(Math.floor(x / 5), 1);
    const centre = Math.floor(x / 5) * 5 + 2;
    const long = 3 + (g % 9);
    const l = Math.max(0, long - Math.abs(x - centre) * (long / 2.6));
    for (let y = 0; y < l; y++) t.poser(x, y, x < centre ? "#16283e" : "#080e1a");
  }
  // De petits cristaux pendent aussi.
  for (const [x, l, c] of [[66, 6, "#58e0f4"], [84, 8, "#8af0ff"], [111, 7, "#58e0f4"], [56, 4, "#d88cf8"]] as const) {
    for (let y = 0; y < l + 3; y++) {
      const demi = y < 3 ? 1 : y > l ? 0 : 1;
      for (let dx = -demi; dx <= demi; dx++) t.poser(x + dx, y + 3, dx < 0 ? c : melanger(c, "#0c2a4a", 0.45));
    }
  }

  // Le sol de roche, éclairé par les cristaux.
  const sol = (x: number) => crete(x, 70, [[1, 0.13, 0.4], [0.6, 0.41, 1.7]]);
  relief(t, sol, H, (x, y, p) => {
    const lueur = x > 78 ? "#3aa0c0" : x < 40 ? "#8a58b8" : "#31506e";
    if (p === 0) return lueur;
    if (p < 3) return melanger("#1d3550", lueur, 0.25);
    return alea(Math.floor(x / 3), y) % 7 === 0 ? "#0e1a2c" : y > 76 ? "#111f32" : "#16283e";
  });
  // Une flaque où le bleu se reflète.
  ellipse(t, 61, 77, 22, 2.4, (x, y) => (alea(Math.floor(x / 3), y) % 4 === 0 ? "#3aa0c0" : y === 75 ? "#0a1424" : "#0c1a30"));

  /** Un cristal : une lame à facettes, pointe en haut, penchée de `penche` cases par rangée. */
  const cristal = (bx: number, by: number, haut: number, large: number, penche: number, c: readonly [string, string, string, string]) => {
    for (let i = 0; i < haut; i++) {
      const y = by - i;
      const cx = bx + penche * i;
      const demi = (large / 2) * Math.min(1, (haut - i) / (haut * 0.28));
      for (let x = Math.round(cx - demi); x <= Math.round(cx + demi); x++) {
        const rel = demi < 0.5 ? 0 : (x - cx) / demi;
        let couleur = rel < -0.35 ? c[1] : rel < 0.3 ? c[2] : c[3];
        if (i > haut * 0.72 && rel < 0.3) couleur = rel < -0.35 ? c[0] : c[1];
        if (Math.round(cx - demi) === x && i > 2 && i < haut * 0.7 && i % 7 < 4) couleur = c[0];
        t.poser(x, y, couleur);
      }
    }
  };
  const bleu = ["#e4fcff", "#7ee8f8", "#2fb4dc", "#1a6ea8"] as const;
  const bleuLoin = ["#9ad8e8", "#4aa8c8", "#2a7ea8", "#1a5684"] as const;
  const rose = ["#fbe4ff", "#e09cf8", "#b45ce0", "#7434ac"] as const;
  const roseLoin = ["#c8a0e0", "#9a64c8", "#7444a4", "#522c80"] as const;
  cristal(91, 69, 22, 6, -0.32, bleuLoin);
  cristal(116, 69, 30, 7, 0.16, bleuLoin);
  cristal(104, 71, 46, 10, 0.06, bleu);
  cristal(96, 71, 30, 7, -0.2, bleu);
  cristal(112, 71, 24, 6, 0.3, bleu);
  cristal(87, 72, 13, 5, -0.5, bleu);
  cristal(120, 72, 14, 5, 0.3, bleu);
  cristal(101, 72, 9, 4, 0.2, ["#ffffff", "#c4f6ff", "#7ee8f8", "#2fb4dc"]);
  cristal(26, 69, 20, 6, 0.3, roseLoin);
  cristal(15, 71, 32, 8, -0.1, rose);
  cristal(22, 71, 19, 6, 0.36, rose);
  cristal(8, 71, 18, 5, -0.36, rose);
  cristal(31, 72, 9, 4, 0.5, rose);
  cristal(12, 72, 8, 4, 0.1, ["#ffffff", "#f4d0ff", "#e09cf8", "#b45ce0"]);
  cristal(73, 71, 5, 3, 0.2, bleuLoin);
  cristal(43, 71, 6, 3, -0.2, roseLoin);

  // Poussières de lumière autour des massifs.
  for (let y = 14; y < 68; y++) {
    for (let x = 3; x < W - 3; x++) {
      if (dansLeCoinCalme(x, y) || alea(x, y) % 67 !== 0) continue;
      if (x > 80) t.poser(x, y, alea(y, x) % 2 ? "#c4f6ff" : "#58d0ec");
      else if (x < 38 && y > 30) t.poser(x, y, alea(y, x) % 2 ? "#f4d0ff" : "#c880ec");
    }
  }
  return t.decor("#081220");
}

/* ───────────────────────────── 5. Les abysses (épique) ───────────────────────────── */

function abysses(): Decor {
  const t = new Toile("#061633");
  degrade(t, 0, 72, ["#0d3364", "#0c2f5d", "#0b2a56", "#0a264f", "#092248", "#081e41", "#071a3b", "#061735", "#05142f", "#05112a"]);
  // Les rais de lumière tombent d'en haut à droite.
  for (let y = 0; y < 66; y++) {
    for (let x = 0; x < W; x++) {
      if (dansLeCoinCalme(x, y)) continue;
      const u = x + y * 0.55 - 62;
      const dans = (u > 0 && u < 7) || (u > 15 && u < 19) || (u > 30 && u < 40) || (u > 50 && u < 54);
      if (dans) teinter(t, x, y, "#4a9ad0", 0.2 * (1 - y / 66));
    }
  }
  // Neige marine.
  for (let y = 3; y < 70; y++) for (let x = 3; x < W - 3; x++) if (!dansLeCoinCalme(x, y) && alea(x, y) % 89 === 0) teinter(t, x, y, "#9ad0f0", 0.4);

  // Au loin : des rochers en silhouette.
  relief(t, (x) => crete(x, 62, [[5, 0.06, 1.0], [3, 0.17, 0.4], [1.2, 0.5, 2.0]]), 72, (_x, _y, p) => (p === 0 ? "#0c2a52" : "#081f42"));

  // L'épave, couchée sur la droite : coque bordée, sabords, membrures, mât brisé.
  const pont = (x: number) => Math.round(53 - (x - 82) * 0.17);
  for (let x = 80; x < W; x++) {
    const haut = x < 88 ? pont(x) + Math.round(((88 - x) / 8) ** 2 * 9) : pont(x);
    const bas = x < 90 ? 71 - Math.round(((90 - x) / 10) ** 1.6 * 3) : 72;
    for (let y = haut; y < bas; y++) {
      const p = y - haut;
      let c = p === 0 ? "#3f7a8a" : p === 1 ? "#1d4458" : (y + Math.round((x - 82) * 0.17)) % 4 === 0 ? "#0b2236" : "#12324a";
      if (alea(Math.floor(x / 5), Math.floor(y / 4)) % 11 === 0 && p > 1) c = "#17405a";
      t.poser(x, y, c);
    }
  }
  // Brèche et membrures.
  ellipse(t, 104, 63, 7, 4.5, (x) => (x % 3 === 0 ? "#1d4458" : "#030a18"));
  for (const x of [91, 97, 113, 118]) {
    t.bloc(x, pont(x) + 5, 2, 2, "#030a18");
    t.poser(x, pont(x) + 5, "#ffd27a");
  }
  // Château arrière.
  for (let x = 110; x < W; x++) for (let y = pont(x) - 7; y < pont(x); y++) t.poser(x, y, y === pont(x) - 7 ? "#3f7a8a" : (x + y) % 5 === 0 ? "#0b2236" : "#12324a");
  // Mâts : un brisé qui penche, un moignon, la vergue et un reste de voile.
  ligne(t, 99, pont(99), 106, 16, "#1d4458");
  ligne(t, 100, pont(99), 107, 16, "#0b2236");
  ligne(t, 97, 30, 113, 26, "#1d4458");
  for (let i = 0; i < 9; i++) for (let j = 0; j < 7 - Math.abs(i - 4) + (alea(i, 5) % 3); j++) teinter(t, 99 + i, 29 + j - Math.round(i * 0.25), "#3f7a8a", 0.55);
  ligne(t, 88, pont(88), 89, 41, "#1d4458");
  ligne(t, 82, 61, 74, 55, "#1d4458");
  // Algues sur la coque.
  for (let x = 82; x < W - 3; x++) if (alea(x, 9) % 4 === 0) for (let j = 0; j < 1 + (alea(x, 2) % 3); j++) t.poser(x, pont(x) + (x < 88 ? 99 : 0) + j, "#4f9a7a");

  // Le fond : sable sombre, crêtes éclairées, cailloux.
  const fond = (x: number) => crete(x, 71, [[1.2, 0.08, 0.2], [0.6, 0.33, 1.2]]);
  relief(t, fond, H, (x, y, p) => {
    if (p === 0) return "#2d5378";
    if (p === 1) return "#1c3a5c";
    return (x + y * 3) % 11 < 2 ? "#0e2140" : y > 76 ? "#0a1832" : "#122848";
  });
  for (const [x, l] of [[6, 5], [34, 4], [60, 3], [92, 6]] as const) {
    t.bloc(x, 75, l, 2, "#0a1832");
    t.bloc(x, 74, l - 1, 1, "#2d5378");
  }
  // Algues hautes, à gauche sous le coin calme, et coraux.
  for (const [x, l, ph] of [[4, 30, 0], [7, 22, 2], [11, 14, 4], [36, 9, 1], [119, 12, 3]] as const) {
    for (let i = 0; i < l; i++) {
      const xx = Math.round(x + Math.sin(i * 0.35 + ph) * 1.6);
      t.poser(xx, 71 - i, i % 5 < 3 ? "#1f6a5c" : "#2d8a6a");
      if (i % 4 === 2) t.poser(xx + (i % 8 < 4 ? 1 : -1), 71 - i, "#3faa7a");
    }
  }
  for (const [x, c] of [[26, "#d0507a"], [31, "#e8804a"], [84, "#d0507a"]] as const) {
    for (const [dx, h] of [[-2, 3], [-1, 5], [0, 4], [1, 6], [2, 3]] as const) for (let j = 0; j < h; j++) t.poser(x + dx, 71 - j, j === h - 1 ? melanger(c, "#ffffff", 0.35) : melanger(c, "#081e41", 0.3));
  }

  // Les méduses, qui éclairent l'eau.
  const meduse = (cx: number, cy: number, rx: number, ry: number, c: { halo: string; bord: string; corps: string; coeur: string }, phase: number) => {
    halo(t, cx, cy + ry * 0.4, rx * 2.6, c.halo, 0.42, 5);
    const brins = Math.max(3, Math.round(rx * 0.8));
    for (let k = 0; k < brins; k++) {
      const x0 = cx - rx * 0.7 + (k * rx * 1.4) / (brins - 1);
      const long = ry * (k % 2 === 0 ? 3.2 : 2.2);
      for (let i = 0; i < long; i++) teinter(t, Math.round(x0 + Math.sin(i * 0.55 + phase + k * 1.3) * 1.3), Math.round(cy + 1 + i), k % 2 === 0 ? c.bord : c.corps, 0.85 * (1 - i / long));
    }
    for (let y = Math.floor(cy - ry); y <= cy; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (e > 1) continue;
        const dessous = t.lire(x, y) ?? "#061633";
        if (e > 0.7) t.poser(x, y, c.bord);
        else if (x - cx < -rx * 0.2 && y - cy < -ry * 0.45) t.poser(x, y, c.coeur);
        else t.poser(x, y, melanger(dessous, c.corps, (x + y) % 3 === 0 && e < 0.4 ? 0.9 : 0.68));
      }
    }
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if ((x & 1) === 0) t.poser(x, Math.round(cy) + 1, c.bord);
  };
  const roseM = { halo: "#e050b0", bord: "#ffb0e4", corps: "#e868c0", coeur: "#ffe8f8" };
  const cyanM = { halo: "#2ab8d8", bord: "#b0f4ff", corps: "#48c8e8", coeur: "#f0ffff" };
  const orM = { halo: "#d8a040", bord: "#ffe8a0", corps: "#f0b850", coeur: "#fffbe0" };
  meduse(20, 40, 11, 9, roseM, 0.4);
  meduse(64, 9, 6, 5, cyanM, 1.7);
  meduse(90, 13, 4, 3.5, orM, 2.6);
  meduse(116, 36, 5, 4, cyanM, 0.9);
  meduse(34, 60, 3, 2.5, cyanM, 3.1);
  meduse(80, 30, 2.5, 2, roseM, 4.4);
  // Un banc de petits poissons en silhouette.
  for (const [x, y] of [[86, 44], [91, 42], [93, 46], [98, 44], [103, 47], [84, 48]] as const) {
    t.bloc(x, y, 2, 1, "#04102a");
    t.poser(x + 2, y, "#0c2a52");
  }
  // Des bulles montent de l'épave.
  for (const [x, y] of [[108, 52], [109, 46], [107, 39], [110, 33], [95, 38], [94, 31]] as const) t.poser(x, y, "#9ad0f0");
  return t.decor("#081428");
}

/* ───────────────────────────── 6. La forge du volcan (épique) ───────────────────────────── */

function forgeDuVolcan(): Decor {
  const t = new Toile("#140a0c");
  const basalte = ["#120809", "#170b0c", "#1d0e0f", "#241113", "#2c1517"];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t.poser(x, y, rampe(basalte, nuee(x * 1.4, y, 24, 9) * 0.9 + 0.05));
  const lave = ["#fff4b0", "#ffd45a", "#ffa62e", "#f4701c", "#d0401a", "#8a1c14"];

  // Les grandes lueurs : la forge à droite, la coulée à gauche, le sol.
  halo(t, 106, 44, 46, "#e8501c", 0.5, 6);
  halo(t, 11, 62, 30, "#e8501c", 0.42, 5);
  for (let y = 60; y < 70; y++) for (let x = 0; x < W; x++) teinter(t, x, y, "#c03a16", (y - 60) * 0.022);

  // Des piliers de roche, au fond.
  for (const [cx, l] of [[42, 5], [84, 4], [66, 3]] as const) {
    for (let y = 0; y < 70; y++) {
      const demi = l + Math.round(((y - 34) / 34) ** 2 * 5);
      for (let x = cx - demi; x <= cx + demi; x++) t.poser(x, y, x === cx + demi && cx > 60 ? "#5a1e14" : x === cx - demi && cx < 60 ? "#3a1512" : "#150a0b");
    }
  }
  // Chaînes et crochets au plafond.
  for (const [x, l] of [[58, 12], [72, 8], [88, 15]] as const) {
    for (let y = 0; y < l; y++) t.poser(x + (y % 2), y, y % 2 ? "#4a3a38" : "#2a2022");
    t.poser(x, l, "#6a5650");
    t.poser(x + 1, l + 1, "#6a5650");
    t.poser(x, l + 2, "#6a5650");
  }

  // La coulée de lave, à gauche sous le coin calme, tombe dans un bassin.
  for (let y = 26; y < 74; y++) {
    const dx = Math.round(Math.sin(y * 0.21) * 1.2);
    t.poser(8 + dx, y, lave[3] ?? "");
    t.poser(9 + dx, y, lave[(y + alea(1, y)) % 3 === 0 ? 0 : 1] ?? "");
    t.poser(10 + dx, y, lave[alea(2, y) % 4 === 0 ? 1 : 2] ?? "");
    t.poser(11 + dx, y, lave[3] ?? "");
    t.poser(12 + dx, y, lave[4] ?? "");
  }
  t.bloc(5, 24, 11, 3, "#0c0506");
  t.bloc(7, 26, 7, 1, lave[4] ?? "");

  // La forge : une arche de blocs, la gueule ardente, la hotte.
  const ax = 108;
  for (let y = 22; y < 70; y++) {
    for (let x = 92; x < W; x++) {
      const arche = ((x - ax) / 15) ** 2 + ((y - 62) / 34) ** 2;
      if (arche > 1 && y < 62) continue;
      if (Math.abs(x - ax) > 15) continue;
      const joint = y % 6 === 0 || (x + (Math.floor(y / 6) % 2) * 4) % 8 === 0;
      t.poser(x, y, joint ? "#1a0c0c" : x < ax - 6 ? "#5a2a20" : "#3a1a18");
    }
  }
  for (let y = 36; y < 70; y++) {
    for (let x = 96; x < 121; x++) {
      const e = ((x - ax) / 10.5) ** 2 + ((y - 66) / 27) ** 2;
      if (e > 1) continue;
      const feu = Math.hypot((x - ax) / 10, (y - 66) / 24);
      t.poser(x, y, rampe(lave, feu * 0.95 + (alea(x, Math.floor(y / 2)) % 3) * 0.04));
    }
  }
  // Flammes dans la gueule.
  for (let x = 99; x < 118; x++) {
    const h = 6 + Math.round(Math.abs(Math.sin(x * 0.9)) * 7 + Math.abs(Math.sin(x * 0.37 + 1)) * 5);
    for (let j = 0; j < h; j++) t.poser(x, 69 - j, rampe(["#fff4b0", "#ffe07a", "#ffc24a", "#ff9a30"], j / h));
  }
  // Clef de voûte et hotte.
  t.bloc(ax - 2, 26, 5, 5, "#7a3a26");
  t.bloc(ax - 1, 27, 3, 3, "#ffa62e");
  t.poser(ax, 28, "#fff4b0");
  for (let y = 3; y < 24; y++) {
    const demi = 3 + Math.round((y / 24) * 5);
    for (let x = ax - demi; x <= ax + demi; x++) t.poser(x, y, x === ax - demi ? "#5a2a20" : (y + 1) % 5 === 0 ? "#150a0b" : "#2a1414");
  }

  // Le sol de basalte : dalle fendue, la lave court dans les fentes.
  const sol = (x: number) => crete(x, 70, [[0.7, 0.1, 0.5], [0.4, 0.37, 1.1]]);
  relief(t, sol, H, (x, y, p) => {
    if (p === 0) return x > 84 ? "#c8582a" : x < 30 ? "#a84422" : "#6a2e22";
    if (p === 1) return "#3a1a18";
    return alea(Math.floor(x / 4), Math.floor(y / 2)) % 5 === 0 ? "#170b0c" : "#211012";
  });
  const fente = (points: readonly Pt[]) => {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;
      ligne(t, a[0], a[1] + 1, b[0], b[1] + 1, "#8a1c14");
      ligne(t, a[0], a[1], b[0], b[1], i % 2 ? "#ffa62e" : "#ffd45a");
    }
  };
  fente([[34, 79], [40, 76], [47, 77], [55, 74], [60, 75]]);
  fente([[66, 79], [70, 76], [78, 76], [84, 73], [92, 74], [97, 72]]);
  fente([[47, 77], [50, 79]]);
  // Bassins de lave dans les coins du bas.
  ellipse(t, 10, 79, 22, 6, (x, y, e) => (e > 0.8 ? "#8a1c14" : e > 0.55 ? "#f4701c" : alea(Math.floor(x / 3), y) % 4 === 0 ? "#fff4b0" : "#ffb83a"));
  ellipse(t, 118, 80, 14, 4.5, (x, y, e) => (e > 0.75 ? "#8a1c14" : e > 0.5 ? "#f4701c" : alea(Math.floor(x / 3), y) % 4 === 0 ? "#fff4b0" : "#ffb83a"));

  // L'enclume sur son billot, une lame rougie posée dessus, le marteau contre le billot.
  t.grille(81, 55, [
    "..rrrrrrrrrrry......",
    "llllllllllllllllll..",
    ".aaaaaaaaaaaaaaaaaaa",
    "..aaaaaaaaaaaaaaaa..",
    "....aaaaaaaaaaa.....",
    ".....nnnnnnnnn......",
    ".....annnnnnna......",
    "....aannnnnnnaa.....",
    "...laaaaaaaaaaan....",
    "...bbbbbbbbbbbbb....",
    "...bcbbcbbbcbbcb....",
    "...bbcbbbcbbbbcb....",
    "...bbbbcbbbbcbbb....",
    "...bcbbbbcbbbbcb....",
    "...bbbcbbbbcbbbb....",
  ], { r: "#ff7a2a", y: "#fff4b0", l: "#f09a5a", a: "#40343a", n: "#241c22", b: "#4a2a1c", c: "#2e1810" });
  t.grille(98, 60, ["hhhh.", "hhhh.", ".m...", ".m...", ".m...", ".m...", ".m...", ".m...", ".m...", ".m..."], { h: "#6a5a5e", m: "#7a4a2a" });
  t.bloc(98, 60, 4, 1, "#f09a5a");

  // Étincelles et braises qui montent.
  for (let y = 6; y < 68; y++) {
    for (let x = 50; x < W - 3; x++) {
      const g = alea(x, y);
      if (g % 53 !== 0) continue;
      const pres = Math.hypot(x - 96, (y - 50) * 0.8);
      if (pres > 44) continue;
      t.poser(x, y, pres < 16 ? "#fff4b0" : pres < 30 ? "#ffc24a" : "#f4701c");
    }
  }
  for (const [x, y] of [[84, 50], [88, 47], [92, 51], [86, 43], [95, 46], [80, 46]] as const) etoileEnCroix(t, x, y, "#fff4b0", "#ffa62e");
  for (let y = 30; y < 66; y++) for (let x = 3; x < 30; x++) if (alea(x, y) % 71 === 0) t.poser(x, y, y > 50 ? "#ffc24a" : "#f4701c");
  return t.decor("#0e0607");
}

/* ───────────────────────────── 7. Sous la nébuleuse (mystique) ───────────────────────────── */

function sousLaNebuleuse(): Decor {
  const t = new Toile("#070616");
  const chaud = ["#150c34", "#2a1458", "#4c1c7c", "#7c2a98", "#b83c9c", "#ec6ca0", "#ffa8b4", "#ffe0d4"];
  const froid = ["#0c2a4c", "#12486c", "#1a7088", "#2aa0a8", "#6ad8c8"];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Le coin calme reste presque nu.
      const calme = borne01(Math.max((x - 40) / 26, (y - 20) / 18));
      const d1 = (y - (80 - x * 0.62)) / 19;
      const poussiere = nuee(x * 1.3, y * 2.2, 14, 55) > 0.62 ? 0.24 : 0;
      const v1 = nuee(x, y * 1.2, 30, 21) * Math.exp(-d1 * d1) * 1.55 * calme - poussiere;
      const d2 = (y - (30 - x * 0.16)) / 16;
      const v2 = nuee(x * 1.1, y, 26, 37) * Math.exp(-d2 * d2) * 1.75 * calme;
      let c = "#070616";
      if (v2 > 0.3) c = rampe(froid, (v2 - 0.3) / 0.6);
      if (v1 > 0.26) {
        const chaude = rampe(chaud, (v1 - 0.26) / 0.72);
        c = v2 > 0.3 ? melanger(chaude, c, v1 > 0.55 ? 0.15 : 0.45) : chaude;
      }
      t.poser(x, y, c);
    }
  }
  // Les étoiles : semis fin, puis quelques-unes en croix.
  for (let y = 2; y < 70; y++) {
    for (let x = 2; x < W - 2; x++) {
      const g = alea(x, y);
      if (g % 47 === 0 && !(dansLeCoinCalme(x, y) && g % 3 !== 0)) t.poser(x, y, ["#ffffff", "#bcd0ff", "#8a8ac8", "#8a8ac8", "#6a6aa8", "#6a6aa8", "#ffd8c0"][(g >> 7) % 7] ?? "#ffffff");
    }
  }
  for (const [x, y, c] of [[58, 6, "#bcd0ff"], [83, 36, "#ffffff"], [118, 44, "#ffe8c0"], [38, 52, "#ffffff"], [9, 58, "#bcd0ff"], [74, 14, "#ffd8c0"], [112, 60, "#bcd0ff"]] as const) etoileEnCroix(t, x, y, "#ffffff", c);

  // Une galaxie spirale, à gauche sous le coin calme.
  const gx = 21;
  const gy = 38;
  for (let y = gy - 10; y <= gy + 10; y++) {
    for (let x = gx - 16; x <= gx + 16; x++) {
      const u = (x - gx) * 0.9 + (y - gy) * 0.45;
      const v = ((y - gy) * 0.9 - (x - gx) * 0.45) / 0.5;
      const r = Math.hypot(u, v);
      if (r > 15) continue;
      const bras = Math.sin(2 * Math.atan2(v, u) + 3.4 * Math.log(r + 1));
      if (r < 2.2) t.poser(x, y, r < 1.2 ? "#ffffff" : "#ffe8c8");
      else if (bras > 0.35) teinter(t, x, y, r < 7 ? "#e8d8ff" : "#8aa8f0", (bras > 0.75 ? 0.85 : 0.5) * (1 - r / 17));
      else if (r < 5) teinter(t, x, y, "#c8a8e8", 0.3);
    }
  }

  // Une planète à anneaux, en haut à droite : l'anneau passe derrière puis devant.
  const px = 103;
  const py = 21;
  const anneau = (devant: boolean) => {
    for (let y = py - 12; y <= py + 12; y++) {
      for (let x = px - 22; x <= px + 22; x++) {
        const u = (x - px) * 0.94 + (y - py) * 0.34;
        const v = (y - py) * 0.94 - (x - px) * 0.34;
        const e = Math.hypot(u / 20, v / 4.6);
        if (e < 0.66 || e > 1 || v > 0 !== devant) continue;
        if (e > 0.8 && e < 0.85) continue;
        t.poser(x, y, e > 0.92 ? "#a878b8" : e > 0.85 ? "#ffe4c8" : e > 0.74 ? "#e8b8c0" : "#b888c0");
      }
    }
  };
  halo(t, px, py, 20, "#ff9ab8", 0.25, 4);
  anneau(false);
  ellipse(t, px, py, 10.5, 10.5, (x, y, e) => {
    const ombre = (x - px) * 0.6 + (y - py) * 0.8;
    const bande = Math.floor((y - py + Math.sin(x * 0.5) * 0.8 + 11) / 2.4) % 2 === 0;
    if (ombre > 5) return e > 0.8 ? "#1c1238" : "#2e1a4e";
    if (ombre > 1.5) return bande ? "#8a4878" : "#6c3470";
    if (e > 0.82 && ombre < -3) return "#fff0d8";
    return bande ? "#f4c8a0" : "#e09a84";
  });
  anneau(true);
  // Une comète.
  for (let i = 0; i < 16; i++) teinter(t, 66 + i, 5 + Math.round(i * 0.3), "#d8f0ff", 0.9 - i * 0.05);
  etoileEnCroix(t, 66, 5, "#ffffff", "#d8f0ff");

  // L'astéroïde : sol bosselé, arête éclairée par la nuée (rose à gauche, turquoise à droite), cratères.
  const sol = (x: number) => crete(x, 70, [[1.6, 0.07, 2.0], [1, 0.21, 0.6], [0.5, 0.57, 1.0]]);
  const pierre = ["#4c4070", "#3e3460", "#322a50", "#272042", "#1e1936"];
  relief(t, sol, H, (x, y, p) => {
    if (p === 0) return x < 62 ? "#f090c8" : "#7ae0d8";
    if (p === 1) return x < 62 ? "#9a5c98" : "#4a8c98";
    return rampe(pierre, (p - 2) / 8 + nuee(x * 1.5, y * 2, 10, 70) * 0.35 - 0.1);
  });
  for (const [cx, cy, rx] of [[14, 76, 6], [52, 77, 4], [84, 75, 7], [110, 77, 4], [33, 74, 3]] as const) {
    ellipse(t, cx, cy, rx, rx * 0.36, "#191430");
    for (let x = cx - rx + 1; x < cx + rx; x++) t.poser(x, Math.round(cy + rx * 0.36), cx < 62 ? "#9a5c98" : "#4a8c98");
  }
  for (const [cx, haut, l] of [[5, 15, 4], [10, 8, 3], [118, 17, 4], [113, 9, 3]] as const) {
    for (let j = 0; j < haut; j++) {
      const demi = Math.round((l * (haut - j)) / haut);
      for (let x = cx - demi; x <= cx + demi; x++) t.poser(x, 70 - j, x === cx - demi ? (cx < 62 ? "#f090c8" : "#4a8c98") : x === cx + demi ? (cx < 62 ? "#9a5c98" : "#7ae0d8") : (x + j) % 5 === 0 ? "#272042" : "#322a50");
    }
  }
  // Des rochers flottent sur la droite, ourlés de lumière.
  for (const [cx, cy, rx, ry] of [[97, 52, 6, 3.4], [112, 47, 3.5, 2.2], [89, 60, 2.5, 1.6], [118, 57, 2, 1.4], [28, 62, 3, 2]] as const) {
    ellipse(t, cx, cy, rx, ry, (x, y, e) => (y - cy < -ry * 0.35 && e > 0.45 ? (cx < 62 ? "#f090c8" : "#7ae0d8") : (x + y) % 4 === 0 ? "#272042" : "#3e3460"));
  }
  // Des éclats lumineux montent du sol.
  for (let y = 40; y < 70; y++) {
    for (let x = 3; x < W - 3; x++) {
      if (alea(x * 3, y * 5) % 97 !== 0) continue;
      const c = x < 62 ? "#ffc0e0" : "#b0fff0";
      t.poser(x, y, c);
      teinter(t, x, y + 1, c, 0.4);
    }
  }
  for (const [x, h, c] of [[6, 4, "#7ae0d8"], [9, 2, "#b0fff0"], [116, 5, "#f090c8"], [119, 3, "#ffc0e0"], [41, 2, "#7ae0d8"]] as const) {
    for (let j = 0; j < h; j++) t.poser(x, sol(x) - 1 - j, c);
    t.poser(x + 1, sol(x) - 1, melanger(c, "#272042", 0.4));
  }
  return t.decor("#141028");
}

/* ───────────────────────────── 8. Le dragon de pierre (légendaire) ───────────────────────────── */

/** Une courbe lisse par des points de passage, avec un rayon à chaque point : des échantillons serrés. */
function courbe(points: readonly Pt[], rayons: readonly number[], pas = 20): { x: number; y: number; tx: number; ty: number; r: number }[] {
  const p = (i: number): Pt => points[Math.min(points.length - 1, Math.max(0, i))] ?? [0, 0];
  const sortie: { x: number; y: number; tx: number; ty: number; r: number }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    for (let k = 0; k < pas; k++) {
      const u = k / pas;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
      const g = (a: number, b: number, c: number, d: number) => 0.5 * (-a + c + 2 * (2 * a - 5 * b + 4 * c - d) * u + 3 * (-a + 3 * b - 3 * c + d) * u * u);
      const tx = g(p0[0], p1[0], p2[0], p3[0]);
      const ty = g(p0[1], p1[1], p2[1], p3[1]);
      const n = Math.hypot(tx, ty) || 1;
      const r0 = rayons[i] ?? 1;
      const r1 = rayons[i + 1] ?? r0;
      sortie.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]), tx: tx / n, ty: ty / n, r: r0 + (r1 - r0) * u });
    }
  }
  return sortie;
}

function dragonDePierre(): Decor {
  const t = new Toile("#243468");
  degrade(t, 0, 62, ["#1f2c60", "#24346c", "#2b3f7a", "#344c88", "#405b94", "#506c9e", "#6680a6", "#8196aa", "#a2aaa8", "#c8bc9c", "#e8c888", "#fbd27c", "#ffe09a"]);
  // Dernières étoiles de la nuit, hors du coin calme.
  for (let y = 3; y < 30; y++) for (let x = 3; x < 96; x++) if (!dansLeCoinCalme(x, y) || alea(y, x) % 3 === 0) if (alea(x, y) % 59 === 0) t.poser(x, y, "#aebce8");

  // L'astre pâle, immense, derrière l'aile.
  const ax = 108;
  const ay = 17;
  halo(t, ax, ay, 34, "#ffe6a8", 0.5, 7);
  ellipse(t, ax, ay, 14.5, 14.5, (x, y, e) => {
    if (e > 0.86) return "#fff0b8";
    return nuee(x * 1.6, y * 1.6, 9, 3) > 0.6 ? "#fbeecb" : "#fffbe6";
  });
  // Rayons en éventail vers la gauche et le bas.
  for (let y = 3; y < 60; y++) {
    for (let x = 48; x < W - 3; x++) {
      const d = Math.hypot(x - ax, y - ay);
      if (d < 16 || d > 62) continue;
      const a = Math.atan2(y - ay, x - ax);
      if (Math.sin(a * 9 + 0.8) > 0.72) teinter(t, x, y, "#fff0c0", 0.36 * (1 - d / 62));
    }
  }

  // Montagnes lointaines, deux plans dans la brume.
  relief(t, (x) => crete(x, 50, [[5, 0.06, 0.3], [2.5, 0.19, 2.0], [1, 0.53, 1.0]]), 66, (_x, _y, p) => (p === 0 ? "#b4b8c0" : p < 4 ? "#8f9cbc" : "#a0a8bc"));
  relief(t, (x) => crete(x, 56, [[4, 0.085, 4.1], [2, 0.23, 0.9], [1, 0.6, 2.2]]), 66, (x, _y, p) => (p === 0 ? "#9aa0b4" : (x + p) % 9 === 0 ? "#5c6c98" : "#6a7aa4"));

  const pierre = { arete: "#ffe6a0", clair: "#b4a898", moyen: "#8a8478", ombre: "#62606a", sombre: "#44434f", nuit: "#2e2e3a" };
  const corps = courbe(
    [[25, 44], [15, 38], [6, 45], [8, 57], [22, 62], [40, 59], [60, 54], [78, 47], [92, 38], [104, 31], [114, 32], [119, 40], [117, 49]],
    [1.2, 2, 3, 4.2, 5.2, 6.5, 8, 8.6, 9, 8.6, 7.6, 7, 7],
  );

  // La montagne où il dort : elle monte vers la droite.
  const perchoir = (x: number) => {
    let bas = 0;
    for (const s of corps) if (Math.abs(s.x - x) < 1.5) bas = Math.max(bas, s.y + s.r * 0.2);
    return Math.round((bas || (x > 116 ? 52 : 66)) + Math.sin(x * 0.4) * 1.2);
  };
  relief(t, perchoir, 72, (x, y, p) => {
    const v = nuee(x + p * 0.8, y * 1.6, 12, 12);
    if (p < 2 && alea(x, 4) % 3 !== 0) return "#5c6a7c";
    return v > 0.62 ? "#48587a" : v > 0.42 ? "#3b4868" : "#2f3a58";
  });
  // Une cascade tombe du flanc, à gauche.
  for (let y = 57; y < 68; y++) {
    t.poser(33, y, y % 3 === 0 ? "#ffffff" : "#d4e8f4");
    t.poser(34, y, "#a8c8e0");
  }

  /* Le dragon : la queue enroulée à gauche, le dos sur la crête, l'échine qui monte, le cou qui redescend à droite. */
  // L'aile, à demi ouverte, devant l'astre : la membrane laisse passer la lumière.
  const epaule: Pt = [93, 36];
  const pointes: readonly Pt[] = [[52, 15], [62, 7], [76, 4], [90, 5], [102, 12]];
  for (let i = 0; i + 1 < pointes.length; i++) {
    const a = pointes[i];
    const b = pointes[i + 1];
    if (!a || !b) continue;
    const det = (a[0] - epaule[0]) * (b[1] - epaule[1]) - (b[0] - epaule[0]) * (a[1] - epaule[1]);
    for (let y = 3; y < 38; y++) {
      for (let x = 48; x < W - 2; x++) {
        const wa = ((x - epaule[0]) * (b[1] - epaule[1]) - (b[0] - epaule[0]) * (y - epaule[1])) / det;
        const wb = ((a[0] - epaule[0]) * (y - epaule[1]) - (x - epaule[0]) * (a[1] - epaule[1])) / det;
        const ws = 1 - wa - wb;
        if (wa < 0 || wb < 0 || ws < 0 || ws < 0.9 * wa * wb) continue;
        const surAstre = Math.hypot(x - ax, y - ay) < 15;
        const base = i % 2 === 0 ? "#4e4c5c" : "#5c596a";
        let c = surAstre ? melanger(base, "#f0a45a", 0.5) : melanger(base, "#c89a6a", 0.14);
        if (Math.abs(wa - wb) < 0.05 && ws < 0.6) c = melanger(c, "#2e2e3a", 0.3);
        if (ws < 0.9 * wa * wb + 0.05) c = surAstre ? "#ffd890" : "#8a8478";
        t.poser(x, y, c);
      }
    }
  }
  for (const [x, y] of pointes) {
    ligne(t, epaule[0], epaule[1], x, y, pierre.nuit);
    ligne(t, epaule[0], epaule[1] - 1, x, y - 1, pierre.ombre);
    t.poser(x, y - 1, pierre.arete);
  }

  // Les piquants du dos, avant le corps.
  let depuis = 0;
  for (let i = 30; i < corps.length - 26; i++) {
    const s = corps[i];
    if (!s) continue;
    depuis += 1;
    if (depuis < Math.max(7, 46 / s.r)) continue;
    depuis = 0;
    let nx = s.ty;
    let ny = -s.tx;
    if (ny > 0 || (Math.abs(ny) < 0.35 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    const h = Math.round(s.r * 0.55 + 1.5);
    for (let j = 0; j <= h; j++) {
      const demi = Math.round((1 - j / h) * 1.6);
      for (let k = -demi; k <= demi; k++) {
        const x = Math.round(s.x + nx * (s.r * 0.8 + j) + s.tx * k);
        const y = Math.round(s.y + ny * (s.r * 0.8 + j) + s.ty * k);
        t.poser(x, y, j === h ? pierre.arete : k < 0 ? pierre.clair : pierre.ombre);
      }
    }
  }

  // Le corps : chaque case prend l'ombrage du tronçon le plus proche.
  const proche = new Float32Array(W * H).fill(9);
  const ton = new Float32Array(W * H);
  for (const s of corps) {
    for (let y = Math.floor(s.y - s.r); y <= s.y + s.r; y++) {
      for (let x = Math.floor(s.x - s.r); x <= s.x + s.r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot(x - s.x, y - s.y) / s.r;
        const i = y * W + x;
        if (d <= 1 && d < (proche[i] ?? 9)) {
          proche[i] = d;
          ton[i] = ((y - s.y) / s.r) * 0.95 + ((x - s.x) / s.r) * 0.22;
        }
      }
    }
  }
  const estCorps = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && (proche[y * W + x] ?? 9) <= 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!estCorps(x, y)) continue;
      const v = ton[y * W + x] ?? 0;
      let c = v < -0.5 ? pierre.clair : v < -0.05 ? pierre.moyen : v < 0.5 ? pierre.ombre : pierre.sombre;
      // Écailles : de petits arcs en quinconce.
      const rang = Math.floor(y / 3);
      const col = (x + (rang % 2) * 2) % 4;
      if (y % 3 === 2 && col !== 0) c = melanger(c, pierre.nuit, 0.28);
      else if (y % 3 !== 2 && col === 0) c = melanger(c, pierre.nuit, 0.28);
      if (!estCorps(x, y - 1)) c = pierre.arete;
      else if (!estCorps(x, y - 2) || !estCorps(x - 1, y - 1)) c = v < 0 ? "#d8c8a4" : c;
      if (!estCorps(x, y + 1) && estCorps(x, y - 1)) c = pierre.nuit;
      // Mousse sur le dessus, par plaques.
      if (v < -0.35 && estCorps(x, y - 1) && nuee(x * 2, y * 2, 9, 31) > 0.6) c = v < -0.6 ? "#86b060" : "#5e8a4c";
      t.poser(x, y, c);
    }
  }
  // Des runes de lumière le long du cou et de la queue : la magie qui le tient endormi.
  for (const i of [28, 44, 60, 172, 184, 196, 208, 220]) {
    const s = corps[i];
    if (!s) continue;
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    t.poser(x, y, "#b8fff0");
    t.poser(x, y - 1, "#5ee0d0");
    t.poser(x, y + 1, "#5ee0d0");
    teinter(t, x - 1, y, "#5ee0d0", 0.6);
    teinter(t, x + 1, y, "#5ee0d0", 0.6);
  }

  // La tête, grande, posée sur la crête à droite, tournée vers le Gaulois : cornes en arrière, paupière close qui luit,
  // rune au front.
  t.grille(86, 40, [
    "......................hh......hh...",
    ".....................hhjo....hhjo..",
    "....................hhjo....hhjo...",
    "..................ohhjo...ohhjo....",
    "...........oooooooghhjooooghjo.....",
    ".........oogggggggllhjlllllljmo....",
    ".......ooggllllllllllllllllmmmmo...",
    ".....ooglllllllllrllllllllmmmmmmo..",
    "....ogllllllllllrlrlllllmmmmmmmmmo.",
    "...oglllllllmmmmmrmmooooommmmmmmmmo",
    "..ogllllmmmmmmmmmmmoeeeeeommmmmmmso",
    ".ogllmmmmmmmmmmmmmoeeeeeeeommmmssso",
    ".oglmmmmmmmmmmmmmmmooooooommmssssso",
    "ogllmmmmmmmmmmmmmmmmmmmmmmmssssssso",
    "olnnmmmmmmmmmmmmmmmmmmmmsssssssssso",
    "olnmmmmmmmmsssssssssssmmssssssssso.",
    "olmmmmsssssssssssssssssssssssssso..",
    "oooootstststststststssssssssssso...",
    ".osssootototototototossssssssso....",
    ".oksssssssssssssssssssssssskko.....",
    "..okkssssssssssssssssssskkkoo......",
    "...ookkkkkkkkkkkkkkkkkkkkoo........",
    ".....ooooooooooooooooooooo.........",
  ], { o: pierre.nuit, g: pierre.arete, l: "#dccfb8", m: "#aca292", s: "#807c76", k: pierre.sombre, h: "#f0e6cc", j: "#a89c88", e: "#8ffff0", r: "#8ffff0", n: pierre.nuit, t: "#f0e8d8" });
  halo(t, 108, 50, 9, "#5ee0d0", 0.45, 4);
  t.bloc(105, 50, 7, 1, "#e0fff8");
  t.bloc(106, 51, 5, 1, "#c8fff6");
  halo(t, 103, 48, 4, "#5ee0d0", 0.4, 3);
  for (const [x, y] of [[103, 47], [102, 48], [104, 48], [103, 49]] as const) t.poser(x, y, "#e0fff8");
  // Mousse sur le crâne, et son souffle : une buée qui s'étire.
  for (const [x, l] of [[97, 5], [110, 4]] as const) t.bloc(x, 45, l, 1, "#86b060");
  for (const [x, y, l] of [[82, 56, 3], [79, 54, 3], [77, 51, 2]] as const) for (let i = 0; i < l; i++) teinter(t, x + i, y, "#ffffff", 0.5);

  // La mer de nuages au pied de la montagne, dorée par le levant.
  nuages(t, 67, 4, 0.09, 1.2, { haut: "#fff4d8", corps: "#f4dcc0", ombre: "#d8bcb4" }, 72);

  // Le premier plan : un replat d'herbe, des fleurs, des pierres.
  const pre = (x: number) => crete(x, 70, [[0.9, 0.08, 0.7], [0.5, 0.29, 2.4]]);
  relief(t, pre, H, (x, y, p) => {
    if (p === 0) return alea(x, 8) % 3 === 0 ? "#b8d86a" : "#8cc058";
    if (p < 3) return alea(x, y) % 4 === 0 ? "#5a9448" : "#6aa850";
    if (p < 5) return alea(Math.floor(x / 2), y) % 3 === 0 ? "#3c6a3c" : "#4a8044";
    return alea(Math.floor(x / 3), y) % 5 === 0 ? "#4a3a34" : y > 77 ? "#2e2a30" : "#3a3238";
  });
  for (let x = 3; x < W - 3; x++) {
    const g = alea(x, 77);
    if (g % 3 === 0) t.poser(x, pre(x) - 1, g % 2 ? "#b8d86a" : "#6aa850");
    if (g % 11 === 0) {
      t.poser(x, pre(x) - 2, ["#ffffff", "#ffe07a", "#ffb0c8"][(g >> 5) % 3] ?? "#ffffff");
      t.poser(x, pre(x) - 1, "#4a8044");
    }
  }
  for (const [x, l] of [[12, 5], [100, 6], [116, 4]] as const) {
    t.bloc(x, 73, l, 2, "#62606a");
    t.bloc(x, 72, l - 1, 1, "#b4a898");
    t.poser(x + 1, 72, "#86b060");
  }

  // Un vol d'oiseaux passe devant l'astre ; des lueurs dorées dérivent.
  for (const [x, y] of [[30, 30], [35, 27], [40, 31], [25, 33], [44, 28]] as const) {
    t.poser(x, y, "#2b3558");
    t.poser(x - 1, y - 1, "#2b3558");
    t.poser(x + 1, y - 1, "#2b3558");
  }
  for (let y = 26; y < 70; y++) {
    for (let x = 3; x < W - 3; x++) {
      if (alea(x * 5, y * 3) % 113 !== 0 || estCorps(x, y)) continue;
      t.poser(x, y, "#fff4b8");
      teinter(t, x - 1, y, "#ffd870", 0.5);
      teinter(t, x + 1, y, "#ffd870", 0.5);
    }
  }
  return t.decor("#2c4a30");
}

/* ───────────────────────────── Le lot ───────────────────────────── */

export const LOT_E: readonly BanniereDuLot[] = [
  {
    id: "crepuscule-neon",
    nom: "Crépuscule néon",
    rarete: "commun",
    famille: "legendes",
    description: "Un grand soleil à bandes jaunes et roses se couche derrière des montagnes violettes, au-dessus d'un lac sombre.",
    dessiner: crepusculeNeon,
  },
  {
    id: "mer-de-nuages",
    nom: "Mer de nuages",
    rarete: "commun",
    famille: "legendes",
    description: "Au lever du jour, des pics enneigés percent une mer de nuages blancs et roses sous un ciel bleu.",
    dessiner: merDeNuages,
  },
  {
    id: "salle-d-arcade",
    nom: "Salle d'arcade",
    rarete: "peu-commun",
    famille: "legendes",
    description: "Une salle d'arcade sombre : six bornes aux écrans colorés, des néons au mur, une moquette à motifs.",
    dessiner: salleDArcade,
  },
  {
    id: "grotte-aux-cristaux",
    nom: "Grotte aux cristaux",
    rarete: "peu-commun",
    famille: "legendes",
    description: "Dans une grotte sombre, de grands cristaux bleus à droite et violets à gauche éclairent la roche.",
    dessiner: grotteAuxCristaux,
  },
  {
    id: "abysses-lumineuses",
    nom: "Les abysses",
    rarete: "epique",
    famille: "legendes",
    description: "Au fond de la mer, des méduses lumineuses flottent près de l'épave d'un vieux voilier, sous des rais de lumière.",
    dessiner: abysses,
  },
  {
    id: "forge-du-volcan",
    nom: "La forge du volcan",
    rarete: "epique",
    famille: "legendes",
    description: "Sous un volcan, une forge de pierre flambe près d'une enclume ; la lave coule dans les fentes du sol.",
    dessiner: forgeDuVolcan,
  },
  {
    id: "sous-la-nebuleuse",
    nom: "Sous la nébuleuse",
    rarete: "mystique",
    famille: "legendes",
    description: "Depuis un astéroïde, une nébuleuse rose et turquoise traverse le ciel étoilé, avec une planète à anneaux et une galaxie.",
    dessiner: sousLaNebuleuse,
  },
  {
    id: "dragon-de-pierre",
    nom: "Le dragon de pierre",
    rarete: "legendaire",
    famille: "legendes",
    description: "Un dragon de pierre couvert de mousse dort enroulé sur une montagne, l'aile dressée devant un astre pâle, au lever du jour.",
    dessiner: dragonDePierre,
  },
];
