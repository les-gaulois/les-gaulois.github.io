/**
 * Bannières, lot G, « Ciel et cosmos », des trésors de la pochette : voir `commun.ts`. Dessins originaux de Claude Fable 5.2
 * pour le clan [GAL], 16 novembre 2026, sans emprunt à une œuvre existante.
 *
 * Cinq ciels qui ne sont ni la nébuleuse ni l'éclipse de la boutique : une grande comète au-dessus d'un lac de montagne,
 * une pluie d'étoiles filantes sur un désert de roche, une géante de jade et ses anneaux d'or vue d'une lune de glace, une
 * lune de cristal à facettes au-dessus de la mer, et un trou noir avec son disque de feu. Partout : le coin en haut à
 * gauche reste sombre et calme, le sujet est à droite et dans le ciel, jamais seulement au centre, le sol est à la
 * rangée 72, et les 3 cases du bord ne portent rien d'important.
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
/** La couleur d'une rampe pour `v` de 0 à 1, par paliers. */
const rampe = (couleurs: readonly string[], v: number): string => couleurs[Math.min(couleurs.length - 1, Math.max(0, Math.floor(v * couleurs.length)))] ?? "#000000";

/** La trame ordonnée 4 × 4 : un seuil de 0 à 1 par case, pour passer d'un palier à l'autre sans bande. */
const TRAME = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const seuil = (x: number, y: number): number => ((TRAME[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
/** La couleur d'une rampe pour `v` de 0 à 1, tramée entre deux paliers voisins. */
function rampeTramee(couleurs: readonly string[], v: number, x: number, y: number): string {
  const i = borne01(v) * (couleurs.length - 1);
  const bas = Math.floor(i);
  return couleurs[Math.min(couleurs.length - 1, bas + (i - bas > seuil(x, y) ? 1 : 0))] ?? "#000000";
}
/** Une force de 0 à 1 ramenée à `paliers` niveaux, tramée. */
const palier = (v: number, paliers: number, x: number, y: number): number => Math.min(paliers, Math.floor(borne01(v) * paliers + seuil(x, y))) / paliers;

/** Mélange la case avec une couleur. */
function teinter(t: Toile, x: number, y: number, couleur: string, part: number): void {
  const dessous = t.lire(x, y);
  if (dessous && part > 0) t.poser(x, y, melanger(dessous, couleur, part));
}

/** Une lueur ronde, en paliers tramés, qui teinte ce qui est dessous. */
function halo(t: Toile, cx: number, cy: number, r: number, couleur: string, force: number, paliers = 6): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      teinter(t, x, y, couleur, force * palier((1 - d) ** 2, paliers, x, y));
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

/** Une ligne de crête douce : une base et une somme d'ondes [hauteur, fréquence, phase]. */
const crete = (x: number, base: number, ondes: readonly (readonly [number, number, number])[]): number =>
  Math.round(base + ondes.reduce((s, [a, f, p]) => s + a * Math.sin(x * f + p), 0));
/** Une ligne de pics pointus : chaque onde est une dent de scie à deux pentes droites. */
const pics = (x: number, base: number, ondes: readonly (readonly [number, number, number])[]): number =>
  Math.round(base - ondes.reduce((s, [a, f, p]) => s + a * (1 - 2 * Math.abs(((x * f + p) / Math.PI) % 1 - 0.5)), 0));

/** Remplit sous une crête : `couleur(x, y, profondeur)` avec la profondeur 0 sur la crête. */
function relief(t: Toile, sommet: (x: number) => number, bas: number, couleur: (x: number, y: number, p: number) => string): void {
  for (let x = 0; x < W; x++) {
    const s = sommet(x);
    for (let y = Math.max(0, s); y < bas; y++) t.poser(x, y, couleur(x, y, y - s));
  }
}

/** Une étoile en croix. */
function etoileEnCroix(t: Toile, x: number, y: number, coeur: string, branche: string, longue = false): void {
  t.poser(x, y, coeur);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    teinter(t, x + dx, y + dy, branche, 0.75);
    if (longue) teinter(t, x + dx * 2, y + dy * 2, branche, 0.35);
  }
}

/** Le coin calme, avec un peu de marge : le logo et les insignes s'y posent. */
const dansLeCoinCalme = (x: number, y: number): boolean => x < 48 && y < 26;
/** De 0 dans le coin calme à 1 un peu plus loin : pour y éteindre les lueurs en douceur. */
const horsDuCoin = (x: number, y: number): number => borne01(Math.max((x - 46) / 12, (y - 24) / 8));

/** Un semis d'étoiles : une case sur `rarete`, plus rares dans le coin calme, jusqu'à la rangée `bas`. */
function semis(t: Toile, bas: number, rarete: number, couleurs: readonly string[], graine: number): void {
  for (let y = 2; y < bas; y++) {
    for (let x = 2; x < W - 2; x++) {
      const g = alea(x + graine * 57, y + graine * 31);
      if (g % rarete !== 0) continue;
      if (dansLeCoinCalme(x, y) && (g >> 5) % 4 !== 0) continue;
      const c = couleurs[(g >> 9) % couleurs.length] ?? "#ffffff";
      const dessous = t.lire(x, y) ?? "#000000";
      t.poser(x, y, dansLeCoinCalme(x, y) ? melanger(dessous, c, 0.3) : (g >> 13) % 4 === 0 ? c : melanger(dessous, c, 0.4));
    }
  }
}

/** Le reflet dans l'eau : les rangées `y0` à `y1` reprennent, à l'envers et tassé, ce qui est au-dessus de `y0`. */
function refleter(t: Toile, y0: number, y1: number, tasse: number, eau: string, part: number): void {
  for (let y = y0; y < y1; y++) {
    const source = y0 - 1 - Math.floor((y - y0) * tasse);
    const glisse = y % 2 === 0 ? 0 : (alea(3, y) % 3) - 1;
    const fond = part + ((y - y0) / (y1 - y0)) * 0.22;
    for (let x = 0; x < W; x++) t.poser(x, y, melanger(t.lire(Math.min(W - 1, Math.max(0, x + glisse)), source) ?? eau, eau, fond));
  }
}

/** Une forme pleine donnée par un masque, avec un liseré de lumière sur les cases dont le voisin (dx, dy) est vide. */
function silhouette(
  t: Toile,
  zone: readonly [number, number, number, number],
  masque: (x: number, y: number) => boolean,
  corps: (x: number, y: number) => string,
  liseres: readonly (readonly [number, number, string])[],
): void {
  const [x0, y0, x1, y1] = zone;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!masque(x, y)) continue;
      const bord = liseres.find(([dx, dy]) => !masque(x + dx, y + dy));
      t.poser(x, y, bord ? bord[2] : corps(x, y));
    }
  }
}

/* ───────────────────────────── 1. La grande comète (épique) ───────────────────────────── */

function grandeComete(): Decor {
  const t = new Toile("#050a1e");
  const ciel = ["#050a1e", "#060d26", "#08122e", "#0a1938", "#0d2244", "#112e52", "#163c60", "#1c4c6e", "#255e7c", "#32728a", "#458898"];
  for (let y = 0; y < 58; y++) for (let x = 0; x < W; x++) t.poser(x, y, rampeTramee(ciel, (y / 58) ** 1.25, x, y));
  semis(t, 46, 43, ["#ffffff", "#bcd8ff", "#7a9cd0", "#7a9cd0", "#56789c", "#56789c", "#e8f8ff"], 1);
  for (const [x, y] of [[60, 30], [117, 12], [84, 44], [52, 40]] as const) etoileEnCroix(t, x, y, "#ffffff", "#9ccaf0");

  // La comète : la tête à droite, une queue de gaz bleue et droite, une queue de poussière claire qui s'incurve.
  const hx = 103;
  const hy = 30;
  const ax = -0.875;
  const ay = -0.485;
  for (let y = 0; y < 58; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - hx;
      const dy = y - hy;
      const s = dx * ax + dy * ay;
      if (s <= -2) continue;
      const p = dx * ay - dy * ax;
      const calme = horsDuCoin(x, y);
      const sp = Math.max(0, s);
      const largeurGaz = 0.8 + sp * 0.04;
      const gaz = Math.exp(-(((p + 0.13 * sp) / largeurGaz) ** 2)) * borne01(1 - sp / 80) ** 0.7;
      const largeurPoussiere = 2 + sp * 0.17;
      const ecart = (p - 0.0036 * sp * sp) / largeurPoussiere;
      const stries = 0.72 + 0.28 * Math.sin(ecart * 5.2 + nuee(sp, p * 3, 9, 4) * 5);
      const poussiere = Math.exp(-(ecart ** 2)) * borne01(1 - sp / 76) ** 0.6 * stries * 1.15 * (s < 0 ? 0.4 : 1);
      teinter(t, x, y, "#4aa8ff", 0.9 * calme * palier(gaz, 7, x, y));
      teinter(t, x, y, "#f2f8ff", 0.94 * calme * palier(poussiere, 8, x, y));
    }
  }
  halo(t, hx, hy, 15, "#9fe8ff", 0.9, 8);
  ellipse(t, hx, hy, 4.2, 4.2, (_x, _y, e) => (e < 0.3 ? "#ffffff" : e < 0.65 ? "#eafcff" : "#b8f0ff"));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let i = 5; i < 12; i++) teinter(t, hx + dx * i, hy + dy * i, "#ffffff", 0.9 - (i - 5) * 0.13);
  // Des poussières se détachent de la queue.
  for (let i = 0; i < 26; i++) {
    const g = alea(i * 13 + 5, 77);
    const s = 8 + (g % 46);
    const p = 0.0036 * s * s + ((g >> 8) % 15) - 5;
    const x = Math.round(hx + s * ax + p * ay);
    const y = Math.round(hy + s * ay - p * ax);
    if (y < 48 && y > 2 && x > 2 && !dansLeCoinCalme(x, y)) t.poser(x, y, (g >> 16) % 3 === 0 ? "#ffffff" : "#bfe8ff");
  }

  // Trois plans de montagnes : un lointain dans la brume, un moyen enneigé éclairé par la comète, des sapins noirs.
  const brume = "#3f7f92";
  const loin = (x: number) => pics(x, 55, [[10, 0.043, 0.5], [4, 0.117, 1.9], [1.6, 0.33, 0.2]]);
  relief(t, loin, 58, (x, y, p) => {
    const eclaire = loin(x + 1) >= loin(x);
    const c = p === 0 ? "#b4e4ee" : p < 3 + (alea(x, 3) % 3) ? (eclaire ? "#8cc4d6" : "#5c93ac") : eclaire ? "#356b88" : "#2a5874";
    return melanger(c, brume, borne01((y - 44) / 16) * 0.75);
  });
  const moyen = (x: number) => pics(x, 59, [[19, 0.0255, 1.02], [6, 0.083, 0.3], [2.4, 0.29, 1.3], [1, 0.71, 0.5]]);
  relief(t, moyen, 58, (x, y, p) => {
    const eclaire = moyen(x + 1) >= moyen(x);
    const neige = p < 4 + (alea(x, 9) % 4) || (p < 11 && alea(x >> 1, y) % 5 === 0);
    if (p === 0) return eclaire ? "#f4feff" : "#9cc8e0";
    if (neige) return eclaire ? "#d2f2fb" : "#5f8fb4";
    const roche = eclaire ? rampeTramee(["#2f6688", "#22506f", "#193f5c"], p / 18, x, y) : rampeTramee(["#173855", "#112b44", "#0d2238"], p / 18, x, y);
    return melanger(roche, brume, borne01((y - 50) / 10) * 0.35);
  });
  // La lisière : des pointes de sapins serrées.
  relief(t, (x) => 56 - (alea(x >> 1, 21) % 3) - (x % 2 === 0 ? 1 : 0) + (x > 40 && x < 96 ? 1 : 0), 58, (_x, _y, p) => (p === 0 ? "#12354a" : "#081c2c"));

  // Le lac : le ciel et la comète à l'envers, puis des rides claires sous la tête.
  refleter(t, 58, 70, 2.6, "#061426", 0.42);
  for (let y = 58; y < 70; y++) {
    const demi = 2 + (y - 58) * 0.9;
    for (let x = 3; x < W - 3; x++) {
      const g = alea(x >> 1, y * 3);
      const d = Math.abs(x - (hx - (y - 58) * 0.5));
      if (d < demi && g % 3 !== 0 && y % 2 === 0) t.poser(x, y, d < demi * 0.4 ? "#eafcff" : "#8fd4ee");
      else if (g % 23 === 0 && y % 2 === 1) teinter(t, x, y, "#7fc0e0", 0.5);
    }
  }
  t.bloc(0, 58, W, 1, "#0a2438");

  // La rive enneigée du premier plan, ourlée de lumière, et deux rochers.
  const rive = (x: number) => crete(x, 70, [[1.2, 0.06, 1.4], [0.7, 0.19, 0.3]]) - (x < 22 ? Math.round((22 - x) * 0.18) : 0) - (x > 100 ? Math.round((x - 100) * 0.2) : 0);
  const neige = ["#e6fbff", "#bfe4f6", "#98c6e6", "#77a6d2", "#5a86ba", "#44699e"];
  relief(t, rive, H, (x, y, p) => (p === 0 ? "#f6ffff" : rampeTramee(neige, (p - 1) / 9 + (nuee(x * 1.4, y * 3, 12, 31) - 0.5) * 0.3, x, y)));
  for (let y = 66; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if (y > rive(x) + 1 && alea(x * 5, y * 7) % 61 === 0) t.poser(x, y, "#ffffff");
  for (const [cx, cy, rx, ry] of [[30, 71, 4, 2.2], [95, 72, 3, 1.8], [56, 77, 5, 1.6]] as const) {
    ellipse(t, cx, cy, rx, ry, (x, y, e) => (y - cy < -ry * 0.3 ? (x > cx ? "#dff6ff" : "#a8cce4") : e > 0.6 ? "#0e2236" : "#1b3650"));
  }

  // Deux grands sapins noirs encadrent la scène, la neige de leurs branches accroche la lueur.
  const sapin = (cx: number, base: number, haut: number, demi: number) => {
    for (let j = 0; j <= haut; j++) {
      const y = base - haut + j;
      const etage = (j % 6) / 5;
      const w = Math.round(demi * (0.12 + 0.88 * (j / haut)) * (0.55 + 0.45 * etage));
      for (let x = cx - w; x <= cx + w; x++) {
        const bord = x === cx + w && w > 0;
        const tuf = etage > 0.75 && x > cx - w && (x + j) % 3 !== 0;
        t.poser(x, y, bord ? "#8fd0e8" : tuf && x >= cx ? "#cdeefa" : tuf ? "#4e7ea4" : (x + y) % 5 === 0 ? "#0c2434" : "#07182a");
      }
    }
    t.bloc(cx - 1, base, 2, 3, "#050f1c");
  };
  sapin(10, 70, 40, 9);
  sapin(20, 71, 22, 6);
  sapin(113, 69, 34, 8);
  sapin(104, 70, 16, 5);
  return t.decor("#3d5f8e");
}

/* ───────────────────────────── 2. La pluie d'étoiles filantes (épique) ───────────────────────────── */

function pluieDEtoiles(): Decor {
  const t = new Toile("#0a0824");
  const ciel = ["#090720", "#0c0928", "#110c32", "#170f3c", "#1f1348", "#2a1754", "#381c5e", "#4a2268", "#602a6e", "#7c3470", "#9c426c", "#bc5666", "#da7260", "#f0935e", "#ffb768", "#ffd88c"];
  for (let y = 0; y < 60; y++) for (let x = 0; x < W; x++) t.poser(x, y, rampeTramee(ciel, (y / 60) ** 1.7, x, y));
  // La voie lactée, en biais, loin du coin calme.
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < W; x++) {
      const d = (y - (58 - x * 0.52)) / 9;
      const v = Math.exp(-d * d) * (0.35 + nuee(x * 1.2, y * 1.6, 12, 8)) * horsDuCoin(x, y);
      teinter(t, x, y, "#8f86d8", 0.3 * palier(v, 5, x, y));
      if (v > 0.6 && alea(x * 3, y * 3) % 15 === 0) t.poser(x, y, alea(x, y) % 2 === 0 ? "#f0e8ff" : "#b0a4e0");
    }
  }
  semis(t, 48, 41, ["#ffffff", "#e0d4ff", "#9a8cd0", "#9a8cd0", "#6c60a8", "#6c60a8", "#ffe4c0"], 2);

  // Les étoiles filantes : toutes partent d'un même point du ciel, à droite, et s'en écartent.
  const rx = 100;
  const ry = 8;
  const trait = (angle: number, depart: number, longueur: number, coeur: string, queue: string, gros: boolean) => {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const n = Math.round(longueur);
    for (let k = 0; k <= n; k++) {
      const x = Math.round(rx + ux * (depart + k));
      const y = Math.round(ry + uy * (depart + k));
      if (y >= 57 || y < 1 || dansLeCoinCalme(x, y)) continue;
      const f = k / n;
      teinter(t, x, y, f > 0.6 ? coeur : queue, 0.2 + 0.8 * f ** 1.3);
      if (gros && f > 0.35) {
        teinter(t, x - Math.round(uy), y + Math.round(ux), queue, 0.5 * f);
        teinter(t, x + Math.round(uy), y - Math.round(ux), queue, 0.3 * f);
      }
    }
    const tx = Math.round(rx + ux * (depart + n));
    const ty = Math.round(ry + uy * (depart + n));
    if (ty < 57 && ty > 1 && !dansLeCoinCalme(tx, ty)) t.poser(tx, ty, "#ffffff");
    return [tx, ty] as const;
  };
  for (let i = 0; i < 40; i++) {
    const g = alea(i * 17 + 3, 911);
    const angle = ((24 + ((i * 67 + (g % 9)) % 146)) * Math.PI) / 180;
    const depart = 6 + ((g >> 4) % 46);
    const longueur = 6 + ((g >> 12) % 8) + depart * 0.3;
    trait(angle, depart, longueur, "#fff8e0", (g >> 20) % 3 === 0 ? "#ffd89a" : "#cfc4ff", false);
  }
  trait((166 * Math.PI) / 180, 48, 18, "#fff8e0", "#cfc4ff", false);
  trait((149 * Math.PI) / 180, 60, 15, "#fff8e0", "#ffd89a", false);
  trait((137 * Math.PI) / 180, 38, 17, "#fff8e0", "#cfc4ff", false);
  // Trois bolides : une traîne large, une tête verte ou dorée, des éclats derrière.
  for (const [degres, depart, longueur, tete] of [[158, 14, 30, "#b8ffd0"], [112, 20, 24, "#ffe9a8"], [48, 12, 15, "#b8ffd0"]] as const) {
    const angle = (degres * Math.PI) / 180;
    const [tx, ty] = trait(angle, depart, longueur, "#ffffff", tete === "#b8ffd0" ? "#7ce8b0" : "#ffc470", true);
    halo(t, tx, ty, 5, tete, 0.8, 5);
    etoileEnCroix(t, tx, ty, "#ffffff", tete, true);
    for (let k = 3; k < longueur; k += 4) {
      const g = alea(k * 7 + degres, 5);
      const x = Math.round(rx + Math.cos(angle) * (depart + k)) + (g % 5) - 2;
      const y = Math.round(ry + Math.sin(angle) * (depart + k)) + ((g >> 4) % 3) + 1;
      if (y < 56 && !dansLeCoinCalme(x, y)) t.poser(x, y, tete);
    }
  }

  // Le lointain : des tables de roche dans la lueur de l'horizon, de plus en plus sombres en approchant.
  const table = (x0: number, x1: number, haut: number, base: number, talus: number, clair: string, corps: string, strate: string, voile: number) => {
    for (let x = x0 - Math.ceil((base - haut) / talus); x <= x1 + Math.ceil((base - haut) / talus); x++) {
      const s = Math.round(haut + Math.max(0, (x0 - x) * talus, (x - x1) * talus) + (x >= x0 && x <= x1 ? (alea(x >> 1, haut) % 2) * 0.6 : 0));
      for (let y = s; y < base; y++) {
        const c = y === s ? clair : (y - haut) % 3 === 2 ? strate : corps;
        t.poser(x, y, melanger(c, "#f0935e", voile * borne01((y - haut) / (base - haut))));
      }
    }
  };
  table(6, 20, 50, 60, 1.6, "#c0667a", "#8a4674", "#7a3c6c", 0.5);
  table(30, 36, 53, 60, 1.4, "#c0667a", "#8a4674", "#7a3c6c", 0.5);
  table(62, 80, 52, 60, 1.8, "#c0667a", "#8a4674", "#7a3c6c", 0.5);
  table(108, 121, 49, 60, 1.5, "#c0667a", "#8a4674", "#7a3c6c", 0.5);
  table(-4, 9, 45, 61, 1.3, "#b0587a", "#5c2c62", "#4c2456", 0.25);
  table(40, 52, 49, 61, 1.5, "#b0587a", "#5c2c62", "#4c2456", 0.25);
  table(86, 92, 47, 61, 2.2, "#b0587a", "#5c2c62", "#4c2456", 0.25);

  // Le lac de sel : le ciel et les traînées s'y reflètent.
  refleter(t, 60, 69, 3.2, "#1a0c30", 0.36);
  for (let y = 61; y < 69; y++) for (let x = 3; x < W - 3; x++) if (alea(x >> 2, y) % 7 === 0 && y % 2 === 0) teinter(t, x, y, "#ffd0a0", 0.28);
  t.bloc(0, 60, W, 1, "#ffe0a0");
  for (let x = 0; x < W; x++) if (alea(x >> 2, 60) % 3 === 0) t.poser(x, 60, "#e08a66");

  // L'arche de roche, à droite : on voit l'horizon à travers.
  const arche = (x: number, y: number): boolean => {
    if (y > 71 || x < 94 || x > 123) return false;
    const haut = 37 + Math.round(1.6 * Math.sin(x * 0.7) + 1.2 * Math.sin(x * 0.23 + 1)) + (x < 99 ? (99 - x) * 3 : 0) + (x > 118 ? (x - 118) * 2 : 0);
    const gauche = 95 + Math.round(1.2 * Math.sin(y * 0.45)) - (y > 62 ? Math.round((y - 62) * 0.5) : 0);
    if (y < haut || x < gauche) return false;
    return ((x - 107.5) / 7.2) ** 2 + ((y - 71) / 24) ** 2 > 1;
  };
  silhouette(
    t,
    [90, 30, 123, 71],
    arche,
    (x, y) => ((y + Math.round(Math.sin(x * 0.4) * 1.5)) % 5 === 0 ? "#2a1438" : (x * 3 + y) % 11 === 0 ? "#231032" : "#1a0b28"),
    [[-1, 0, "#f09a62"], [0, -1, "#8a4c84"], [1, 0, "#4c2a5c"]],
  );
  // Un arbre mort, à gauche, sous le coin calme.
  for (const [x0, y0, x1, y1] of [[13, 70, 13, 52], [14, 70, 14, 56], [13, 57, 8, 49], [8, 49, 6, 44], [8, 50, 4, 49], [14, 54, 19, 46], [19, 46, 22, 45], [18, 48, 19, 41], [13, 52, 12, 44], [12, 44, 14, 39], [10, 53, 10, 47]] as const) {
    ligne(t, x0, y0, x1, y1, "#170a24");
  }
  for (let y = 40; y < 70; y++) if (t.lire(13, y) === "#170a24" && t.lire(12, y) !== "#170a24") t.poser(13, y, "#6a3a5c");

  // Le premier plan : une dalle de grès sombre, l'arête chauffée par l'horizon, des cailloux et des touffes sèches.
  const sol = (x: number) => crete(x, 70, [[0.9, 0.08, 0.4], [0.6, 0.25, 2.2]]);
  const gres = ["#3a1c40", "#30173a", "#281332", "#200f2a", "#190b22"];
  relief(t, sol, H, (x, y, p) => (p === 0 ? "#e88a5c" : p === 1 ? "#8a4458" : rampeTramee(gres, (p - 2) / 8 + (nuee(x * 2, y * 4, 10, 44) - 0.5) * 0.4, x, y)));
  for (let x = 4; x < W - 4; x++) {
    const g = alea(x, 404);
    if (g % 9 === 0) for (let j = 1; j <= 1 + ((g >> 4) % 3); j++) t.poser(x + (j === 3 ? 1 : 0), sol(x) - j, j === 1 ? "#4a2444" : "#7a3c58");
    if (g % 13 === 0) t.bloc(x, sol(x) + 3 + ((g >> 8) % 4), 2 + ((g >> 6) % 2), 1, "#4c2648");
  }
  return t.decor("#120818");
}

/* ───────────────────────────── 3. La géante aux anneaux (mystique) ───────────────────────────── */

function geanteAuxAnneaux(): Decor {
  const t = new Toile("#04030f");
  const ciel = ["#04030f", "#050414", "#07061a", "#090822", "#0c0b2a", "#100f34"];
  for (let y = 0; y < 68; y++) for (let x = 0; x < W; x++) t.poser(x, y, rampeTramee(ciel, (y / 68) ** 1.4 + (nuee(x, y * 1.4, 26, 3) - 0.5) * 0.25 * horsDuCoin(x, y), x, y));
  semis(t, 66, 37, ["#ffffff", "#cfe8ff", "#8a9cc8", "#8a9cc8", "#5c6898", "#5c6898", "#fff0c8"], 3);
  for (const [x, y] of [[57, 8], [30, 33], [12, 52], [118, 6]] as const) etoileEnCroix(t, x, y, "#ffffff", "#a8d8ff");

  // La planète : une géante de jade qui emplit la droite du ciel. Les anneaux sont penchés et passent devant elle.
  const px = 96;
  const py = 57;
  const R = 42;
  const cosA = Math.cos(0.2);
  const sinA = Math.sin(0.2);
  const APLATI = 0.215;
  /** L'épaisseur de matière des anneaux, de 0 à 1, à `e` rayons de la planète. */
  const matiere = (e: number): number => {
    if (e < 1.3 || e > 2.3) return 0;
    if (e < 1.47) return 0.34 + 0.1 * Math.sin(e * 120);
    if (e < 1.5) return 0.1;
    if (e < 1.93) return 0.86 + 0.14 * Math.sin(e * 95);
    if (e < 2.01) return 0;
    if (e < 2.2) return 0.62 + 0.12 * Math.sin(e * 150);
    if (e < 2.235) return 0;
    return 0.38;
  };
  const rayonAnneau = (u: number, v: number): number => Math.hypot(u, v / APLATI) / R;
  const or = ["#6a4a2a", "#9a7034", "#c89a48", "#e8c070", "#f8dc98", "#fff2c8"];
  const jade = ["#0b3a44", "#0f4c52", "#136260", "#1a7c72", "#279884", "#42b294", "#6ccaa4", "#a0e0b8", "#d2f4d0"];
  const bandes = [3, 4, 6, 7, 5, 3, 2, 4, 5, 7, 8, 6, 4, 3, 5, 6, 4, 2, 3, 5, 7, 6, 4, 3] as const;

  halo(t, px, py, R + 9, "#3ad0a8", 0.3, 6);
  for (let y = 3; y < 70; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - px;
      const dy = y - py;
      const u = dx * cosA + dy * sinA;
      const v = -dx * sinA + dy * cosA;
      const r = Math.hypot(dx, dy);
      const e = rayonAnneau(u, v);
      const m = matiere(e);
      const devant = v < 0;
      let c: string | null = null;
      if (r <= R) {
        // La boule : des bandes courbes, remuées, éclairées d'en haut à gauche.
        const nz = Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
        const lum = borne01((-0.52 * dx - 0.5 * dy) / R + 0.69 * nz);
        const latitude = (v + APLATI * 1.6 * Math.sqrt(Math.max(0, R * R - u * u))) / R;
        const remous = (nuee(u * 0.55 + latitude * 30, v * 2.4, 9, 12) - 0.5) * 0.11 + Math.sin(u * 0.21 + latitude * 9) * 0.012;
        const bande = bandes[Math.floor((latitude + remous + 1.4) * 9.5) % bandes.length] ?? 4;
        // Une grande tempête ovale, plus pâle.
        const tempete = ((u - 14) / 8) ** 2 + ((v - 4 - 0.17 * 4) / 2.6) ** 2;
        const teinte = tempete < 1 ? (tempete < 0.45 ? 8 : 7) : tempete < 1.5 ? 2 : bande;
        // L'ombre des anneaux sur la boule, juste sous eux.
        const ombreAnneau = matiere(rayonAnneau(u + 1.2, v - 6)) * (v - 6 < 0 ? 1 : 0);
        const clair = lum * (1 - 0.62 * ombreAnneau);
        const pas = palier(clair ** 0.8, 6, x, y);
        c = melanger("#04101a", jade[Math.max(0, Math.min(jade.length - 1, teinte))] ?? "#279884", 0.1 + 0.9 * pas);
        if (r > R - 1.6 && lum > 0.25) c = melanger(c, "#c8fff0", 0.55);
        else if (r > R - 3.2 && lum > 0.4) c = melanger(c, "#8ff0d8", 0.25);
      }
      if (m > 0 && (devant || r > R)) {
        // Derrière la planète, sa grande ombre coupe les anneaux.
        const lelong = dx * 0.72 + dy * 0.69;
        const travers = Math.abs(dx * 0.69 - dy * 0.72);
        const dansLOmbre = !devant && lelong > 0 && travers < R;
        const grainOr = or[Math.max(0, Math.min(or.length - 1, Math.floor(m * 4.2 + Math.sin(e * 210) * 0.8 + (devant ? 0.4 : -0.5))))] ?? "#c89a48";
        const dessous = c ?? t.lire(x, y) ?? "#04030f";
        const plein = m > 0.5 ? 1 : m > 0.2 ? ((x + y) % 2 === 0 ? 0.85 : 0.3) : 0.3;
        const part = dansLOmbre ? 0.12 : plein * (devant ? 1 : 0.85) * (0.35 + 0.65 * horsDuCoin(x, y + 5));
        c = melanger(dessous, dansLOmbre ? "#3a2a1c" : grainOr, part);
      }
      if (c) t.poser(x, y, c);
    }
  }
  // Une petite lune passe devant la planète et y pose son ombre.
  ellipse(t, 113, 30, 3.2, 2.2, (x, y) => melanger(t.lire(x, y) ?? "#000000", "#04101a", 0.6));
  ellipse(t, 108, 25, 2.4, 2.4, (x, y, e) => (x - 108 + (y - 25) < -1 ? "#f4f0e0" : e > 0.6 ? "#5a5870" : "#a8a4b4"));

  // La lune de glace où l'on se tient : une plaine pâle au loin, des crêtes, puis la glace sombre du premier plan.
  const plaine = (x: number) => crete(x, 65, [[1.1, 0.05, 0.3], [0.6, 0.17, 1.2]]);
  relief(t, plaine, H, (x, y, p) => (p === 0 ? "#b6ecdf" : rampeTramee(["#6eb4b4", "#4f9298", "#3a747e", "#2a5a66"], (p - 1) / 6 + (nuee(x * 2, y * 5, 12, 61) - 0.5) * 0.5, x, y)));
  for (const [cx, cy, rx] of [[24, 67, 5], [70, 67, 4], [101, 68, 6]] as const) {
    ellipse(t, cx, cy, rx, 1.2, "#28545e");
    for (let x = cx - rx + 1; x < cx + rx; x++) t.poser(x, cy - 1, "#d2f8ec");
  }
  const sol = (x: number) => crete(x, 70, [[1.3, 0.07, 2.4], [0.8, 0.23, 0.2], [0.4, 0.61, 1.1]]);
  const glace = ["#1e4852", "#193c48", "#14313e", "#102834", "#0c202c", "#091a24"];
  relief(t, sol, H, (x, y, p) => {
    if (p === 0) return x > 60 ? "#9ff0d8" : "#f4dca0";
    if (p === 1) return x > 60 ? "#3f8c88" : "#8a7a58";
    const veine = Math.abs(Math.sin(x * 0.31 + y * 0.9) + Math.sin(x * 0.13 - y * 0.5)) < 0.09;
    return veine ? "#2f7a7c" : rampeTramee(glace, (p - 2) / 8 + (nuee(x * 1.6, y * 3, 10, 71) - 0.5) * 0.35, x, y);
  });
  // Des aiguilles de glace sur les côtés : une face sombre, une face qui prend la lueur de jade, une arête d'or.
  const aiguille = (bx: number, by: number, haut: number, demi: number, penche: number, versLaDroite: boolean) => {
    for (let j = 0; j <= haut; j++) {
      const y = by - j;
      const cx = bx + penche * j;
      const w = demi * (1 - (j / haut) ** 1.5);
      const x0 = Math.round(cx - w);
      const x1 = Math.round(cx + w);
      for (let x = x0; x <= x1; x++) {
        const rel = (x - cx) * (versLaDroite ? 1 : -1);
        const c = rel > w * 0.25 ? ((x + y * 2) % 7 === 0 ? "#5ccab0" : "#2f8c88") : rel > -w * 0.3 ? "#174650" : (x + y) % 6 === 0 ? "#102c38" : "#0b202c";
        t.poser(x, y, c);
      }
      t.poser(versLaDroite ? x1 : x0, y, j % 7 === 3 ? "#fff2c8" : "#a8f4dc");
    }
  };
  aiguille(8, 72, 30, 5, -0.03, true);
  aiguille(16, 73, 17, 3.5, 0.12, true);
  aiguille(3, 73, 14, 3, 0.05, true);
  aiguille(115, 72, 26, 5, 0.04, false);
  aiguille(107, 73, 13, 3, -0.14, false);
  aiguille(121, 73, 16, 3, -0.03, false);
  // Des éclats de givre brillent sur la glace.
  for (let y = 62; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if (alea(x * 7, y * 3) % 71 === 0 && y > plaine(x)) t.poser(x, y, x > 60 ? "#d2fff0" : "#fff2c8");
  return t.decor("#06141c");
}

/* ───────────────────────────── 4. La lune de cristal (mystique) ───────────────────────────── */

function luneDeCristal(): Decor {
  const t = new Toile("#0c0624");
  const ciel = ["#0b0520", "#0e0728", "#120932", "#180c3e", "#200f4a", "#2a1458", "#371a66", "#482274", "#5c2e84", "#743e92", "#9054a0", "#ae6eae", "#cc8cbc", "#e6b0cc"];
  for (let y = 0; y < 55; y++) for (let x = 0; x < W; x++) t.poser(x, y, rampeTramee(ciel, (y / 55) ** 1.45, x, y));
  semis(t, 44, 43, ["#ffffff", "#e8d8ff", "#a890e0", "#a890e0", "#7460b0", "#7460b0", "#c8f0ff"], 4);
  for (const [x, y] of [[56, 9], [120, 50], [62, 36], [24, 34]] as const) etoileEnCroix(t, x, y, "#ffffff", "#d0b8ff");

  // La lune : une boule taillée en facettes, éclairée d'en haut à gauche, qui luit de l'intérieur.
  const lx = 94;
  const ly = 27;
  const R = 21;
  halo(t, lx, ly, R + 17, "#b890ff", 0.5, 8);
  halo(t, lx, ly, R + 6, "#e0d0ff", 0.4, 4);
  // Des rayons descendent de la lune vers la mer.
  for (let y = ly; y < 55; y++) {
    for (let x = 40; x < W; x++) {
      const a = Math.atan2(y - ly, x - lx);
      const d = Math.hypot(x - lx, y - ly);
      if (d < R || a < 0.25 || a > 2.9) continue;
      const rayon = Math.sin(a * 17 + 0.6) + 0.6 * Math.sin(a * 31 + 2);
      if (rayon > 0.75) teinter(t, x, y, "#e8d8ff", 0.2 * borne01(1.25 - d / 44) * palier(rayon - 0.6, 3, x, y));
    }
  }
  // Des nuages fins, roses par-dessous, sur l'horizon.
  for (const [cx, cy, l] of [[18, 46, 22], [44, 50, 16], [72, 48, 12], [116, 44, 14], [10, 52, 12], [98, 52, 10]] as const) {
    for (let x = cx - l; x <= cx + l; x++) {
      const e = 1 - Math.abs(x - cx) / l;
      if (e * 2.2 + (alea(x >> 1, cy) % 3) * 0.3 < 0.5) continue;
      t.poser(x, cy, "#f8c8dc");
      if (e > 0.35) t.poser(x, cy - 1, "#b880b8");
      if (e > 0.6) t.poser(x, cy + 1, "#ffe4ec");
    }
  }

  const graines: (readonly [number, number, number])[] = [];
  const N = 74;
  for (let i = 0; i < N; i++) {
    const z = 1 - (2 * (i + 0.5)) / N;
    const rr = Math.sqrt(1 - z * z);
    const a = i * 2.399963;
    // Tournée pour que les facettes ne soient pas rangées face à nous.
    const x = rr * Math.cos(a);
    const y0 = rr * Math.sin(a);
    graines.push([x, y0 * 0.82 - z * 0.57, y0 * 0.57 + z * 0.82]);
  }
  const eclat = ["#1c1050", "#2c1870", "#42249a", "#5e36c0", "#8052dc", "#a47af0", "#c4a4fa", "#b8dcff", "#dcf6ff", "#ffffff"];
  /** Les éclats qui tournent autour de la lune, sur un anneau penché : ceux de derrière d'abord, ceux de devant après. */
  const eclats = (devant: boolean) => {
    for (let i = 0; i < 46; i++) {
      const g = alea(i * 29 + 7, 313);
      const a = (i / 46) * Math.PI * 2 + (g % 10) * 0.012;
      const rayon = 31 + (g % 7);
      const u = Math.cos(a) * rayon;
      const v = Math.sin(a) * rayon * 0.2;
      if (v > 0 !== devant) continue;
      const x = Math.round(lx + u * 0.97 + v * 0.24);
      const y = Math.round(ly - u * 0.24 + v * 0.97);
      if (dansLeCoinCalme(x, y) || x > W - 3) continue;
      const taille = devant ? 1 + ((g >> 6) % 3) : (g >> 6) % 3;
      const clair = devant ? "#ffffff" : "#c4a4fa";
      const corps = devant ? "#b8dcff" : "#8052dc";
      t.poser(x, y, clair);
      if (taille >= 1) {
        t.poser(x, y - 1, corps);
        t.poser(x, y + 1, devant ? "#8052dc" : "#42249a");
      }
      if (taille >= 3) {
        t.poser(x - 1, y, corps);
        t.poser(x + 1, y, devant ? "#8052dc" : "#42249a");
        t.poser(x, y - 2, clair);
      }
    }
  };
  eclats(false);
  ellipse(t, lx, ly, R, R, (x, y) => {
    const nx = (x - lx) / R;
    const ny = (y - ly) / R;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let premier = -2;
    let second = -2;
    let qui = 0;
    for (let i = 0; i < N; i++) {
      const g = graines[i];
      if (!g) continue;
      const d = nx * g[0] + ny * g[1] + nz * g[2];
      if (d > premier) {
        second = premier;
        premier = d;
        qui = i;
      } else if (d > second) second = d;
    }
    const g = graines[qui] ?? [0, 0, 1];
    const lum = borne01((-0.5 * g[0] - 0.6 * g[1] + 0.62 * g[2]) * 0.6 + 0.2 + ((alea(qui, 5) % 100) / 100 - 0.5) * 0.36);
    // Le cœur luit : les facettes du milieu sont un peu plus claires.
    const coeur = borne01(1 - Math.hypot(nx + 0.1, ny + 0.1) * 1.5) * 0.1;
    const arete = premier - second < 0.014;
    const bord = nx * nx + ny * ny > 0.86;
    let c = rampe(eclat, Math.min(0.99, lum + coeur));
    if (arete) c = lum > 0.45 ? melanger(c, "#ffffff", 0.6) : melanger(c, "#0c0630", 0.4);
    if (bord && -nx - ny > 0.2) c = melanger(c, "#ffffff", 0.5);
    else if (bord) c = melanger(c, "#12083a", 0.35);
    return c;
  });
  for (const [x, y] of [[84, 17], [90, 29], [99, 19]] as const) etoileEnCroix(t, x, y, "#ffffff", "#ffffff", true);
  eclats(true);

  // Des îles de cristal sur l'horizon, puis la mer et son chemin de lumière sous la lune.
  const iles = (x: number, y: number): boolean => {
    if (y > 54) return false;
    const a = 54 - Math.max(0, 12 - Math.abs(x - 14) * 1.5, 7 - Math.abs(x - 23) * 1.3, 5 - Math.abs(x - 6) * 1.6, 9 - Math.abs(x - 33) * 2.1, 3.4 - Math.abs(x - 22) * 0.16);
    const b = 54 - Math.max(0, 8 - Math.abs(x - 60) * 1.8, 5 - Math.abs(x - 66) * 1.5, 2.6 - Math.abs(x - 63) * 0.24, 6 - Math.abs(x - 119) * 1.4, 2.2 - Math.abs(x - 116) * 0.2);
    return y >= Math.min(a, b);
  };
  silhouette(t, [0, 38, W - 1, 54], iles, (x, y) => ((x + y * 2) % 5 === 0 ? "#3a1c6c" : "#2a1256"), [[1, 0, "#d8a8f0"], [0, -1, "#9a68cc"]]);
  refleter(t, 55, 70, 1.5, "#0e0628", 0.5);
  for (let y = 55; y < 70; y++) {
    const demi = 3 + (y - 55) * 1.1;
    for (let x = 3; x < W - 3; x++) {
      const g = alea(x >> 1, y * 5);
      const d = Math.abs(x - lx - Math.sin(y * 1.3) * 1.5);
      if (d < demi && (g % 4 !== 0 || d < 2) && (y % 2 === 0 || d < demi * 0.35)) t.poser(x, y, d < demi * 0.3 ? "#ffffff" : d < demi * 0.65 ? "#dcc8ff" : "#a47af0");
      else if (g % 19 === 0 && y % 2 === 1) teinter(t, x, y, "#c090e8", 0.45);
    }
  }
  t.bloc(0, 55, W, 1, "#f4d4e8");
  for (let x = 0; x < W; x++) if (!iles(x, 54) && alea(x >> 1, 55) % 4 === 0) t.poser(x, 55, "#c898d0");

  // Le rivage : une roche vitreuse, sombre, dont l'arête prend la lumière de la lune.
  const sol = (x: number) => crete(x, 70, [[1, 0.09, 0.8], [0.6, 0.27, 2.6]]);
  const verre = ["#2c1560", "#241150", "#1c0d42", "#160a36", "#11082c"];
  relief(t, sol, H, (x, y, p) => {
    if (p === 0) return x > 40 ? "#e8d0ff" : "#b088e0";
    if (p === 1) return "#6a42b0";
    const veine = Math.abs(Math.sin(x * 0.27 + y * 1.1) - Math.sin(x * 0.11 - y * 0.7)) < 0.07;
    return veine ? "#7a52d0" : rampeTramee(verre, (p - 2) / 8 + (nuee(x * 1.8, y * 3.5, 10, 83) - 0.5) * 0.4, x, y);
  });
  // De grands cristaux au premier plan, des deux côtés : la face tournée vers la lune est claire.
  const cristal = (bx: number, by: number, haut: number, demi: number, penche: number, lumiereADroite: boolean) => {
    const pointe = haut * 0.68;
    for (let j = 0; j <= haut; j++) {
      const y = by - j;
      const cx = bx + penche * j;
      const w = j < pointe ? demi : demi * (1 - (j - pointe) / (haut - pointe));
      const x0 = Math.round(cx - w);
      const x1 = Math.round(cx + w);
      for (let x = x0; x <= x1; x++) {
        const rel = ((x - cx) / Math.max(0.5, w)) * (lumiereADroite ? 1 : -1);
        const c = rel > 0.3 ? rampeTramee(["#9a70e8", "#c4a4fa", "#e0d0ff"], j / haut, x, y) : rel > -0.35 ? rampeTramee(["#42249a", "#5e36c0", "#7a50d8"], j / haut, x, y) : (x + y) % 5 === 0 ? "#2a1470" : "#1c0d50";
        t.poser(x, y, c);
      }
      t.poser(lumiereADroite ? x1 : x0, y, j % 6 === 2 ? "#ffffff" : "#dcf6ff");
      if (j === Math.round(pointe) && w >= 1.5) for (let x = x0 + 1; x < x1; x++) teinter(t, x, y, "#ffffff", 0.35);
    }
  };
  cristal(7, 73, 31, 4.5, 0.1, true);
  cristal(15, 74, 19, 3.2, 0.3, true);
  cristal(4, 74, 15, 2.6, -0.06, true);
  cristal(22, 74, 9, 2, 0.45, true);
  cristal(116, 73, 22, 4, -0.16, false);
  cristal(108, 74, 12, 2.6, -0.4, false);
  cristal(121, 74, 15, 2.6, 0.02, false);
  // Des poussières de lumière montent du rivage.
  for (let y = 40; y < 70; y++) {
    for (let x = 3; x < W - 3; x++) {
      if (alea(x * 3, y * 5) % 113 !== 0 || dansLeCoinCalme(x, y)) continue;
      t.poser(x, y, "#f4e8ff");
      teinter(t, x, y + 1, "#c4a4fa", 0.5);
    }
  }
  return t.decor("#0a0420");
}

/* ───────────────────────────── 5. Le trou noir (légendaire) ───────────────────────────── */

function trouNoir(): Decor {
  const t = new Toile("#050308");
  // Le fond : une nuit presque noire, des poussières rousses et bleues à peine visibles.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const calme = horsDuCoin(x, y);
      const roux = nuee(x * 1.1, y * 1.5, 30, 14) * calme;
      const bleu = nuee(x * 1.3 + 40, y * 1.2, 26, 27) * calme;
      let c = "#050308";
      if (bleu > 0.5) c = rampeTramee(["#050308", "#06081a", "#080e22", "#0a142c"], (bleu - 0.5) / 0.3, x, y);
      if (roux > 0.52) c = melanger(c, rampeTramee(["#12060c", "#220a10", "#361014", "#4c1a16"], (roux - 0.52) / 0.3, x, y), 0.75);
      t.poser(x, y, c);
    }
  }
  semis(t, 68, 47, ["#ffffff", "#ffe8d0", "#a89088", "#a89088", "#6c5c64", "#6c5c64", "#c8dcff"], 5);

  const cx = 98;
  const cy = 30;
  const RS = 11;
  const cosA = Math.cos(-0.13);
  const sinA = Math.sin(-0.13);
  const RX = 56;
  const RY = 8.4;
  // Près du trou, la lumière des étoiles s'étire en arcs.
  for (let i = 0; i < 18; i++) {
    const g = alea(i * 19 + 2, 737);
    const r = 21 + (g % 14);
    const a0 = ((g >> 5) % 628) / 100;
    const longueur = 0.1 + ((g >> 14) % 10) / 55;
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (longueur * k) / 8;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.96);
      if (!dansLeCoinCalme(x, y) && y < 66) teinter(t, x, y, (g >> 3) % 3 === 0 ? "#ffe0c0" : "#c8d4ff", 0.55 - Math.abs(k - 4) * 0.1);
    }
  }
  // La lueur du disque sur tout le ciel de droite.
  for (let y = 0; y < 70; y++) {
    for (let x = 30; x < W; x++) {
      const d = Math.hypot((x - cx) / 52, (y - cy) / 26);
      if (d < 1) teinter(t, x, y, "#ff6a1c", 0.3 * palier((1 - d) ** 1.6, 7, x, y) * horsDuCoin(x, y));
    }
  }
  // Les deux jets, droits, bleus, perpendiculaires au disque.
  for (let y = 0; y < 70; y++) {
    for (let x = cx - 26; x < cx + 26; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cosA + dy * sinA;
      const v = -dx * sinA + dy * cosA;
      const loin = Math.abs(v);
      if (loin < RS) continue;
      const large = 1.3 + loin * 0.07;
      const f = Math.exp(-((u / large) ** 2)) * borne01(1 - (loin - RS) / (v < 0 ? 26 : 36)) ** 0.7;
      teinter(t, x, y, Math.abs(u) < 0.8 ? "#e4f4ff" : "#58a8ff", 0.92 * palier(f, 6, x, y));
    }
  }

  const feu = ["#200604", "#420c06", "#701608", "#a0280a", "#cc420e", "#ec6a1a", "#fc9430", "#ffbc52", "#ffdc86", "#fff2c0", "#ffffff"];
  for (let y = 2; y < 68; y++) {
    for (let x = 30; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cosA + dy * sinA;
      const v = -dx * sinA + dy * cosA;
      const r = Math.hypot(dx, dy);
      const e = Math.hypot(u / RX, v / RY);
      const angle = Math.atan2(v / RY, u / RX);
      // Le côté gauche du disque vient vers nous : il est plus clair.
      const elan = 1 + 0.5 * borne01(-u / RX + 0.1) - 0.12 * borne01(u / RX);
      // Le disque à plat : des sillons qui tournent.
      let disque = 0;
      if (e > 0.19 && e < 1) {
        const sillon = 0.55 + 0.75 * nuee(angle * 11 + e * 26, e * 34, 4, 91) + 0.12 * Math.sin(e * 46);
        disque = (1 - (e - 0.19) / 0.81) ** 1.25 * sillon * elan * (e < 0.24 ? (e - 0.19) / 0.05 : 1);
      }
      // L'arc que le trou courbe au-dessus et au-dessous de lui : plus épais en haut.
      let arc = 0;
      if (r >= RS && r < RS + 10) {
        const haut = -dy / r;
        const epais = haut > 0 ? 4 + 5 * haut : 2.6 + 1.4 * -haut;
        const f = borne01(1 - (r - RS) / epais);
        const sillon = 0.75 + 0.5 * nuee(Math.atan2(dy, dx) * 9, r * 2.2, 3, 47);
        arc = f ** 1.35 * (haut > 0 ? 0.95 : 0.6) * sillon * (1 + 0.35 * borne01(-dx / r) - 0.2 * borne01(dx / r));
        if (r < RS + 1.2) arc = Math.max(arc, 0.95);
      }
      const devant = v > 0;
      let force = 0;
      if (r < RS) force = devant ? disque : 0;
      else force = Math.max(arc, devant || r > RS + 3 ? disque : disque * 0.4);
      if (r < RS && force < 0.07) {
        t.poser(x, y, "#000000");
        continue;
      }
      if (force < 0.07) continue;
      const couleur = rampeTramee(feu, force ** 0.75, x, y);
      const dessous = t.lire(x, y) ?? "#050308";
      t.poser(x, y, force > 0.2 ? couleur : melanger(dessous, couleur, 0.35 + force * 3));
    }
  }
  // Le bord du disque : des braises s'en échappent.
  for (let i = 0; i < 34; i++) {
    const g = alea(i * 23 + 9, 151);
    const a = ((g % 628) / 100) * 1;
    const e = 0.9 + ((g >> 10) % 30) / 100;
    const u = Math.cos(a) * RX * e;
    const v = Math.sin(a) * RY * e * 1.35;
    const x = Math.round(cx + u * cosA - v * sinA);
    const y = Math.round(cy + u * sinA + v * cosA);
    if (dansLeCoinCalme(x, y) || x > W - 3 || x < 34 || Math.hypot(x - cx, y - cy) < RS + 10) continue;
    t.poser(x, y, (g >> 18) % 3 === 0 ? "#fff2c0" : (g >> 18) % 3 === 1 ? "#fc9430" : "#cc420e");
  }

  // Une planète brisée, à gauche : ses éclats partent en file vers le disque.
  const bx = 21;
  const by = 46;
  halo(t, bx, by, 15, "#ff7a2a", 0.22, 4);
  ellipse(t, bx, by, 9.5, 9.5, (x, y, e) => {
    const dx = x - bx;
    const dy = y - by;
    // Deux grandes failles et un quartier arraché, côté disque.
    const faille1 = Math.abs(dy - dx * 0.5 + 0.5 + Math.sin(dx * 0.8) * 0.6);
    const faille2 = dx > -1 ? Math.abs(dx + dy * 0.4 - 3 + Math.sin(dy) * 0.5) : 9;
    if (dx > 2 && dy - dx * 0.5 + 0.5 < -1 && dx + dy * 0.4 - 3 > 1) return null;
    if (faille1 < 0.55 || faille2 < 0.5) return "#ffdc86";
    if (faille1 < 1.2 || faille2 < 1.1) return "#d8500e";
    const jour = dx * 0.8 - dy * 0.5;
    if (e > 0.78 && jour > 3) return "#ffb060";
    const roche = jour > 2 ? "#8a5a48" : jour > -3 ? "#5c3c38" : "#36242c";
    return alea(x, y) % 7 === 0 ? melanger(roche, "#000000", 0.25) : roche;
  });
  const chemin = (p: number): Pt => [29 + p * 30, 41 - p * 3 - Math.sin(p * Math.PI) * 9];
  for (let i = 0; i < 22; i++) {
    const g = alea(i * 31 + 4, 271);
    const p = i / 22 + (g % 10) / 300;
    const [fx, fy] = chemin(p);
    const x = Math.round(fx + ((g >> 4) % 5) - 2);
    const y = Math.round(fy + ((g >> 8) % 5) - 2);
    const taille = p < 0.25 ? 2 : p < 0.6 ? 1 : 0;
    if (taille === 2) {
      t.bloc(x, y, 3, 2, "#48302e");
      t.poser(x + 2, y, "#ffb060");
      t.poser(x + 1, y + 1, "#ff9a30");
    } else if (taille === 1) {
      t.bloc(x, y, 2, 1, "#6a4238");
      t.poser(x + 1, y, "#ffb060");
    } else t.poser(x, y, (g >> 12) % 2 === 0 ? "#ffdc86" : "#fc9430");
    if (p > 0.3) teinter(t, x - 1, y + (p > 0.6 ? 0 : 1), "#fc9430", 0.5);
  }

  // Le sol : la croûte d'un monde qui se défait, l'arête rougie par le disque, des failles où couve la braise.
  const sol = (x: number) => crete(x, 70, [[1.4, 0.07, 0.9], [0.9, 0.21, 2.2], [0.5, 0.67, 0.4]]) + (alea(x >> 2, 70) % 2);
  const croute = ["#2c1a18", "#241514", "#1c1010", "#150c0e", "#0f080a"];
  relief(t, sol, H, (x, y, p) => {
    if (p === 0) return x > 30 ? "#ffa648" : "#c86c2c";
    if (p === 1) return "#8a3c18";
    const faille = Math.abs(Math.sin(x * 0.23 + y * 1.3 + Math.sin(x * 0.61) * 1.2)) < 0.08 && p > 2;
    if (faille) return alea(x, y) % 3 === 0 ? "#ffbc52" : "#cc420e";
    return rampeTramee(croute, (p - 2) / 8 + (nuee(x * 2, y * 4, 9, 123) - 0.5) * 0.45, x, y);
  });
  // Des pans de croûte se soulèvent sur les côtés, éclairés du côté du trou.
  const pan = (px: number, pyy: number, rx: number, ry: number) => {
    ellipse(t, px, pyy, rx, ry, (x, y, e) => {
      const dessus = y - pyy < -ry * 0.25;
      const versLeTrou = (x - px) * (cx - px > 0 ? 1 : -1) > rx * 0.3;
      if (dessus && e > 0.5) return versLeTrou ? "#ffa648" : "#c86c2c";
      if (y - pyy > ry * 0.3 && (x + y) % 3 === 0) return null;
      return versLeTrou ? "#48302e" : (x + y) % 4 === 0 ? "#150c0e" : "#241514";
    });
  };
  pan(11, 63, 7, 3.2);
  pan(24, 66, 3.5, 1.8);
  pan(5, 57, 3, 1.8);
  pan(112, 61, 7.5, 3.4);
  pan(101, 66, 3.2, 1.7);
  pan(119, 53, 3, 2);
  pan(34, 62, 2, 1.2);
  // Deux dents de roche encadrent la scène, noires, l'arête tournée vers le trou rougie.
  const dent = (bx: number, by: number, haut: number, demi: number, penche: number, versLaDroite: boolean) => {
    for (let j = 0; j <= haut; j++) {
      const y = by - j;
      const milieu = bx + penche * j + Math.sin(j * 0.7) * 0.6;
      const w = demi * (1 - (j / haut) ** 1.3) + (alea(j, bx) % 2) * 0.5;
      const x0 = Math.round(milieu - w);
      const x1 = Math.round(milieu + w);
      for (let x = x0; x <= x1; x++) {
        const rel = (x - milieu) * (versLaDroite ? 1 : -1);
        t.poser(x, y, rel > w * 0.45 ? "#5c3024" : (x * 2 + y) % 7 === 0 ? "#1c1010" : "#120a0c");
      }
      t.poser(versLaDroite ? x1 : x0, y, j % 5 === 1 ? "#ffdc86" : "#ffa648");
    }
  };
  dent(7, 73, 27, 5, 0.1, true);
  dent(15, 73, 13, 3.2, 0.25, true);
  dent(116, 73, 24, 5, -0.12, false);
  dent(108, 73, 11, 3, -0.3, false);
  // Des gravats montent vers le ciel.
  for (let y = 44; y < 70; y++) {
    for (let x = 3; x < W - 3; x++) {
      const g = alea(x * 3 + 1, y * 7);
      if (g % 173 !== 0) continue;
      t.poser(x, y, (g >> 8) % 3 === 0 ? "#ffdc86" : "#fc9430");
      teinter(t, x, y + 1, "#cc420e", 0.5);
      if ((g >> 12) % 3 === 0) teinter(t, x, y + 2, "#cc420e", 0.25);
    }
  }
  return t.decor("#080405");
}

/* ───────────────────────────── Le lot ───────────────────────────── */

export const LOT_G: readonly BanniereDuLot[] = [
  {
    id: "grande-comete",
    nom: "La grande comète",
    rarete: "epique",
    famille: "tresors",
    description: "Une comète à deux queues, bleue et blanche, traverse la nuit au-dessus de montagnes enneigées et se reflète dans un lac.",
    dessiner: grandeComete,
  },
  {
    id: "pluie-d-etoiles-filantes",
    nom: "La pluie d'étoiles filantes",
    rarete: "epique",
    famille: "tresors",
    description: "Des dizaines d'étoiles filantes rayonnent dans un ciel violet au-dessus d'un désert, d'un lac de sel et d'une arche de roche.",
    dessiner: pluieDEtoiles,
  },
  {
    id: "geante-aux-anneaux",
    nom: "La géante aux anneaux",
    rarete: "mystique",
    famille: "tresors",
    description: "Une planète géante vert jade, ceinte de larges anneaux d'or, se lève derrière les aiguilles d'une lune de glace.",
    dessiner: geanteAuxAnneaux,
  },
  {
    id: "lune-de-cristal",
    nom: "La lune de cristal",
    rarete: "mystique",
    famille: "tresors",
    description: "Une lune taillée en facettes violettes, entourée d'éclats, éclaire la mer et un rivage hérissé de grands cristaux.",
    dessiner: luneDeCristal,
  },
  {
    id: "trou-noir",
    nom: "Le trou noir",
    rarete: "legendaire",
    famille: "tresors",
    description: "Un trou noir cerclé d'un disque de feu lance deux jets bleus ; une planète brisée s'y effile, vue d'un sol qui se soulève.",
    dessiner: trouNoir,
  },
];
