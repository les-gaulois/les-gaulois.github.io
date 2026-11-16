/**
 * Bannières, lot I, « Les trésors de la pochette » : voir `commun.ts`. Dessins originaux de Claude Fable 5.2 pour le clan
 * [GAL], 16 novembre 2026, sans emprunt à une œuvre existante.
 *
 * Cinq « éléments déchaînés » : une tornade sur une plaine de blé, un mur de sable qui avale des ruines, une cathédrale
 * de glace, des chutes de lave dans la nuit, et la pièce maîtresse, un arbre de foudre qui tombe d'un orage géant sur un
 * arbre mort. Partout : le coin en haut à gauche reste calme, le sujet est à droite et sous le coin, jamais derrière le
 * Gaulois seulement, trois plans au moins, une lumière qui vient de quelque part, et un sol à la rangée 72.
 */
import { HAUTEUR, LARGEUR, Toile, melanger, type BanniereDuLot, type Decor } from "./commun.ts";

const W = LARGEUR;
const H = HAUTEUR;

/* ───────────────────────────── Outils ───────────────────────────── */

/** Un tirage fixe par case, bien brassé : le même à chaque image. */
const alea = (x: number, y: number): number => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const borne01 = (v: number): number => Math.min(1, Math.max(0, v));

/** La trame (4 × 4) qui fond deux paliers voisins l'un dans l'autre. */
const TRAME = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const trame = (x: number, y: number): number => ((TRAME[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
/** La couleur d'une rampe pour `v` de 0 à 1, deux paliers voisins tramés entre eux. */
function rampe(couleurs: readonly string[], v: number, x: number, y: number): string {
  const f = borne01(v) * (couleurs.length - 1);
  const i = Math.floor(f);
  return couleurs[Math.min(couleurs.length - 1, i + (f - i > trame(x, y) ? 1 : 0))] ?? "#000000";
}

/** Mélange la case avec une couleur. */
function teinter(t: Toile, x: number, y: number, couleur: string, part: number): void {
  const dessous = t.lire(x, y);
  if (dessous && part > 0) t.poser(x, y, melanger(dessous, couleur, part));
}

/** Une lueur ronde, en paliers, qui teinte ce qui est dessous. */
function halo(t: Toile, cx: number, cy: number, r: number, couleur: string, force: number, paliers = 6): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      teinter(t, x, y, couleur, force * (Math.round((1 - d) ** 2 * paliers) / paliers));
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

/** Des volutes rondes : la distance (0 au cœur, 1 au bord) à la plus proche, et sa lumière (venue d'en haut à gauche). */
function volute(x: number, y: number, pas: number, graine: number): { d: number; l: number } {
  const gx = Math.floor(x / pas);
  const gy = Math.floor(y / pas);
  let d = 9;
  let l = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const a = alea((gx + i) * 5 + graine * 97, (gy + j) * 3 + graine * 41);
      const cx = (gx + i + (a & 255) / 255) * pas;
      const cy = (gy + j + ((a >> 8) & 255) / 255) * pas;
      const r = pas * (0.7 + (((a >> 16) & 63) / 63) * 0.5);
      const e = Math.hypot(x - cx, y - cy) / r;
      if (e < d) {
        d = e;
        l = (-(x - cx) * 0.6 - (y - cy) * 0.8) / r;
      }
    }
  }
  return { d, l };
}

/** Une ligne de crête : une base et une somme d'ondes [hauteur, fréquence, phase]. */
const crete = (x: number, base: number, ondes: readonly (readonly [number, number, number])[]): number =>
  Math.round(base + ondes.reduce((s, [a, f, p]) => s + a * Math.sin(x * f + p), 0));

/** Remplit sous une crête : `couleur(x, y, profondeur)` avec la profondeur 0 sur la crête. */
function relief(t: Toile, sommet: (x: number) => number, bas: number, couleur: (x: number, y: number, p: number) => string | null, x0 = 0, x1 = W): void {
  for (let x = x0; x < x1; x++) {
    const s = sommet(x);
    for (let y = Math.max(0, s); y < bas; y++) {
      const c = couleur(x, y, y - s);
      if (c) t.poser(x, y, c);
    }
  }
}

/** Une étincelle en croix. */
function etincelle(t: Toile, x: number, y: number, coeur: string, branche: string): void {
  t.poser(x, y, coeur);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) teinter(t, x + dx, y + dy, branche, 0.65);
}

/** Le coin du logo et des insignes, avec une marge : 1 dedans, 0 dehors, fondu sur quelques cases. */
const calme = (x: number, y: number): number => borne01(Math.min((52 - x) / 8, (29 - y) / 6));

/* ───────────────────────────── 1. La tornade sur la plaine (épique) ───────────────────────────── */

function tornade(): Decor {
  const t = new Toile("#18242a");
  const nuage = ["#0c1418", "#111b20", "#16242a", "#1d2e34", "#25393e", "#2f4648", "#3c5450", "#4c6258", "#617260"];
  const trouee = ["#566c58", "#748060", "#989668", "#bcac70", "#dcc47c", "#f0d890", "#f8e8b0", "#fff4cc"];
  const HORIZON = 58;
  const bord = (x: number) => 35 + 3 * Math.sin(x * 0.11 + 1) + 2.5 * Math.abs(Math.sin(x * 0.37 + 0.6)) + (x > 70 ? -4 * borne01(1 - Math.abs(x - 100) / 30) : 0);

  // Le ciel : un plafond d'orage verdâtre, bosselé, et une trouée de lumière jaune au ras de l'horizon, à gauche.
  for (let y = 0; y < HORIZON; y++) {
    for (let x = 0; x < W; x++) {
      const b = bord(x);
      const k = calme(x, y);
      if (y < b) {
        const n = nuee(x, y * 1.9, 20, 5) - 0.5;
        const ventre = volute(x, y * 1.5, 9, 3);
        const pres = borne01(1 - (b - y) / 7);
        let v = 0.2 + (y / b) * 0.3 + n * 0.5 * (1 - k * 0.8) - ventre.l * 0.2 * (1 - k) + (1 - ventre.d) * 0.07 * (1 - k) + pres * pres * 0.42;
        v -= borne01(1 - Math.hypot((x - 100) / 34, (y - 8) / 12)) * 0.4;
        t.poser(x, y, rampe(nuage, v, x, y));
      } else {
        const v = 0.1 + ((y - b) / (HORIZON - b)) * 0.75 + (1 - x / W) * 0.3 - 0.12;
        t.poser(x, y, rampe(trouee, v, x, y));
      }
    }
  }
  // Le soleil bas, voilé, sous le plafond.
  halo(t, 11, 52, 20, "#fff8d8", 0.7, 7);
  for (let y = 48; y <= 56; y++) for (let x = 7; x <= 15; x++) if (Math.hypot(x - 11, y - 52) < 3.3) t.poser(x, y, "#fffbe4");
  // Des rideaux de pluie, penchés, loin.
  for (const [x0, l] of [[52, 9], [66, 7], [118, 6]] as const) {
    for (let y = Math.round(bord(x0)); y < HORIZON; y++) {
      for (let i = 0; i < l; i++) {
        const x = x0 + i - Math.round((y - 36) * 0.35);
        if (alea(x0 + i, 5) % 3 !== 0) teinter(t, x, y, "#33464a", 0.22 + (alea(x0 + i, 9) % 3) * 0.08);
      }
    }
  }

  // Le lointain : une ligne de haies, une ferme et son éolienne à gauche, en contre-jour.
  for (let x = 0; x < W; x++) {
    const h = alea(Math.floor(x / 3), 77) % 5 === 0 ? 2 : alea(x, 78) % 3 === 0 ? 1 : 0;
    for (let i = 0; i <= h; i++) t.poser(x, HORIZON - 1 - i, x < 40 ? "#4a4a30" : "#2c3430");
  }
  t.grille(15, 47, [
    "....................ttt.....",
    "...................t.t.t....",
    "...................tttttpp..",
    "...........ss......t.t.t....",
    "....rr.....ss.......ttt.....",
    "..rrrrrr...ss........p......",
    "rrrrrrrrrr.ss........p......",
    "lmmmmmmmmm.ls.......p.p.....",
    "lmmmdmmmmm.ls.......ppp.....",
    "lmmmdmmmmm.ls......p...p....",
    "lmmmdmmmmm.ls......p...p....",
  ], { r: "#3c2c24", m: "#33302a", l: "#e8cc80", d: "#191c1c", s: "#3a3a34", p: "#2c2c28", t: "#2c2c28" });

  // La tornade : un entonnoir qui tombe du nuage-mur, éclairé par la gauche, strié par sa rotation.
  const corps = ["#f0e2ac", "#c4bc90", "#969c80", "#6e7a6c", "#4e5c58", "#364448", "#252f36", "#171e26", "#0e1319"];
  const axe = (y: number) => 97 + 7 * Math.sin((y - 12) * 0.062 + 0.3);
  const demi = (y: number) => 2.2 + 15 * Math.pow(borne01((HORIZON - y) / 48), 2.3);
  for (let y = 8; y < HORIZON; y++) {
    const cx = axe(y);
    const d = demi(y);
    for (let x = Math.floor(cx - d); x <= cx + d; x++) {
      const u = (x + 0.5 - cx) / d;
      if (Math.abs(u) > 1) continue;
      const strie = ((alea(Math.floor((x - cx) * 0.7 + y * 0.9), Math.floor(y / 2)) % 5) - 2) * 0.035;
      const spire = Math.sin(y * 0.9 + u * 2.4) * 0.05;
      let v = 0.5 + u * 0.42 + strie + spire;
      if (u < -0.72) v -= 0.3;
      const c = rampe(corps, v, x, y);
      t.poser(x, y, y < 22 ? melanger(t.lire(x, y) ?? c, c, borne01((y - 8) / 14) * borne01((1 - Math.abs(u)) * 4 + (y - 8) / 8)) : c);
    }
  }
  // Le nuage de terre arraché au pied, et les débris qui tournent.
  for (let y = 46; y < HORIZON + 1; y++) {
    for (let x = 78; x < 122; x++) {
      const e = Math.hypot((x - axe(57)) / 15, (y - 57) / 7.5);
      const n = nuee(x * 1.4, y * 1.4, 7, 21);
      if (e + (n - 0.5) * 0.9 > 0.86) continue;
      const vl = volute(x, y, 5, 8);
      t.poser(x, y, rampe(["#e0c080", "#b89858", "#8e7444", "#6a5636", "#4a3c2a", "#30281e"], 0.45 + (x - axe(57)) / 34 - vl.l * 0.25 + e * 0.15, x, y));
    }
  }
  for (let y = 22; y < HORIZON; y++) {
    for (let x = 62; x < 121; x++) {
      const e = Math.abs(x - axe(y)) - demi(y);
      if (e < 1 || e > 16 - (HORIZON - y) * 0.2) continue;
      const g = alea(x * 3, y * 7);
      if (g % 41 !== 0) continue;
      const c = (g >> 6) % 3 === 0 ? "#e8d8a0" : "#1c2226";
      t.poser(x, y, c);
      if ((g >> 9) % 3 === 0) t.poser(x + 1, y - ((g >> 12) % 2), c);
      if ((g >> 14) % 5 === 0) t.poser(x + 2, y - 1, c);
    }
  }

  // La plaine de blé : des sillons qui fuient vers l'horizon, le soleil à gauche, l'ombre de l'orage à droite.
  const ble = ["#2c2210", "#443414", "#5e4816", "#7c601c", "#9c7c24", "#ba962e", "#d4ae3c", "#e8c654", "#f6dc7c", "#fff0a8"];
  for (let y = HORIZON; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y - HORIZON) / (H - HORIZON);
      const sillon = Math.floor(((x - 60) / (y - 55.5)) * 2.4 + 100) & 1;
      const vague = Math.sin(x * 0.16 + y * 0.8 + Math.sin(y * 0.5) * 2) * 0.07;
      let v = 0.78 - (x / W) * 0.5 + p * 0.1 + (sillon ? 0.09 : -0.06) + Math.exp(-(((y - 62) / 3) * ((y - 62) / 3))) * 0.16 * (1 - x / W) + vague + (nuee(x, y * 3, 16, 40) - 0.5) * 0.25;
      v -= borne01(1 - Math.hypot((x - 100) / 30, (y - 58) / 10)) * 0.3;
      if (y === HORIZON) v += 0.1;
      t.poser(x, y, rampe(ble, v, x, y));
    }
  }
  // Le chemin de terre où se tient le Gaulois, ses ornières.
  for (let y = 69; y < 76; y++) {
    for (let x = 0; x < W; x++) {
      const b = y === 69 || y === 75;
      if (b && alea(x, y) % 3 === 0) continue;
      const v = 0.52 - (x / W) * 0.28 + (alea(Math.floor(x / 3), y) % 4) * 0.04 + (y === 71 || y === 73 ? -0.12 : 0);
      t.poser(x, y, rampe(["#33261a", "#4a3822", "#62492a", "#7c5e34", "#967640", "#b08e50", "#c8a866"], v, x, y));
    }
  }
  // Le premier plan : de grands épis couchés par le vent, vers la tornade.
  for (let x = -4; x < W; x += 2) {
    const g = alea(x, 301);
    if (g % 4 === 0) continue;
    const haut = 3 + ((g >> 4) % 4);
    const clair = (g >> 8) % 3 === 0;
    const lum = 1 - borne01(x / W) * 0.6;
    for (let i = 0; i < haut + 2; i++) {
      const px = x + Math.round(i * i * 0.12);
      const py = H - 1 - i;
      t.poser(px, py, clair ? melanger("#7c601c", "#f6dc7c", lum * (i / (haut + 2))) : melanger("#2c2210", "#7c601c", (i / (haut + 2)) * lum));
    }
    if (clair) {
      const px = x + Math.round((haut + 2) * (haut + 2) * 0.12);
      t.poser(px, H - 2 - haut, melanger("#c8a040", "#fff0a8", lum));
      t.poser(px + 1, H - 2 - haut, melanger("#a07c28", "#f6dc7c", lum));
    }
  }
  return t.decor("#2c2010");
}

/* ───────────────────────────── 2. Le mur de sable (épique) ───────────────────────────── */

function murDeSable(): Decor {
  const t = new Toile("#1e5a8a");
  const azur = ["#184c80", "#1e5a8c", "#266a98", "#337ca4", "#4890b0", "#64a4b8", "#88b8bc", "#b0cab8", "#d8d8ac", "#f4dc9c", "#ffd88c"];
  for (let y = 0; y < 60; y++) for (let x = 0; x < W; x++) t.poser(x, y, rampe(azur, (y / 59) ** 1.15, x, y));
  // Le soleil bas à gauche, encore dans le ciel clair.
  halo(t, 15, 45, 17, "#fff4c8", 0.65, 7);
  for (let y = 40; y <= 50; y++) for (let x = 10; x <= 20; x++) if (Math.hypot(x - 15, y - 45) < 4.6) t.poser(x, y, "#fffbe8");

  // Le mur de sable : il arrive de la droite, haut comme le ciel, en volutes éclairées par la gauche.
  const sable = ["#2c140e", "#44200f", "#5e2e14", "#7c3f1a", "#9a5422", "#b66c2a", "#cf8636", "#e2a248", "#f0bc62", "#fad488", "#ffeab4"];
  const front = (x: number) =>
    57 - 55 * Math.pow(borne01((x - 14) / 108), 0.62) - 5 * Math.abs(Math.sin(x * 0.13 + 0.8)) - 2.5 * Math.abs(Math.sin(x * 0.34 + 2)) + 5;
  for (let x = 0; x < W; x++) {
    const f = Math.round(front(x));
    for (let y = Math.max(0, f); y < 62; y++) {
      const h = y - f;
      const grande = volute(x, y, 13, 4);
      const petite = volute(x, y, 6, 7);
      const fond = borne01(h / 46);
      let v = 0.74 - fond * 0.5 + grande.l * 0.25 + petite.l * 0.1 - (grande.d > 0.8 ? 0.14 : 0) - (x / W) * 0.2;
      if (h < 2) v += 0.22 - h * 0.08;
      // Près du sol, le sable se fond dans la brume.
      v = v + (0.62 - v) * borne01((y - 50) / 12) * 0.7;
      t.poser(x, y, rampe(sable, v, x, y));
    }
    // La poussière qui précède le mur.
    for (let y = Math.max(0, f - 5); y < f; y++) if (calme(x, y) < 0.5) teinter(t, x, y, "#f0bc62", 0.12 + 0.09 * (y - (f - 5)));
  }

  // Les ruines du fond, à droite, déjà dans la tourmente : une arche et des colonnes brisées.
  const voile = (c: string, part: number) => melanger(c, "#c47a30", part);
  const colonne = (x: number, haut: number, bas: number, l: number, part: number, chapiteau: boolean) => {
    for (let y = haut; y < bas; y++) {
      for (let i = 0; i < l; i++) {
        const c = i === 0 ? "#f4cc88" : i === l - 1 ? "#3a1c12" : (i + (y % 7 === 3 ? 1 : 0)) % 2 ? "#6a3a1e" : "#54290f";
        t.poser(x + i, y, voile(y % 9 === 4 ? "#3a1c12" : c, part));
      }
    }
    if (chapiteau) {
      t.bloc(x - 1, haut, l + 2, 1, voile("#f4cc88", part));
      t.bloc(x - 1, haut + 1, l + 2, 1, voile("#54290f", part));
    }
    t.bloc(x - 1, bas - 1, l + 2, 1, voile("#3a1c12", part));
  };
  for (let y = 27; y < 61; y++) {
    for (let x = 90; x < 117; x++) {
      const arc = Math.hypot(x - 103, y - 41);
      if (x >= 97 && x <= 109 && (y > 41 || arc < 6.6)) continue;
      if (y < 30 + (x - 106) * 0.9 + (alea(x, 5) % 2) && x > 106) continue;
      const bloc = Math.floor(y / 4);
      let c = y % 4 === 0 || (x + bloc * 3) % 6 === 0 ? "#4a2412" : (alea(Math.floor((x + bloc * 3) / 6), bloc) % 3 === 0 ? "#7a4422" : "#6a3a1e");
      if (y <= 41 && arc < 8.4) c = Math.floor(Math.atan2(y - 41, x - 103) * 3.2) % 2 ? "#96602e" : "#7a4a24";
      if (x === 90 || x === 110 || (y === 27 && x < 107)) c = "#f4cc88";
      if (x === 96 || x === 116) c = "#3a1c12";
      t.poser(x, y, voile(c, 0.34 + (x - 90) * 0.008));
    }
  }
  t.bloc(89, 60, 9, 1, voile("#3a1c12", 0.34));
  t.bloc(109, 60, 9, 1, voile("#3a1c12", 0.5));
  colonne(81, 47, 60, 4, 0.3, false);
  colonne(122, 44, 60, 3, 0.55, false);

  // Les dunes : une crête lointaine dorée, puis le sable ridé, puis la vieille voie dallée.
  const or = ["#4a2412", "#683414", "#86481a", "#a66024", "#c27c30", "#d89842", "#e8b25a", "#f4c878", "#fcdc9c", "#fff0c4"];
  const duneLoin = (x: number) => crete(x, 58, [[2.2, 0.06, 0.5], [1, 0.17, 2]]);
  relief(t, duneLoin, 66, (x, y, p) => rampe(or, 0.82 - p * 0.06 - (x / W) * 0.3 + (p === 0 ? 0.12 : 0), x, y));
  const dune = (x: number) => crete(x, 63, [[2.5, 0.045, 2.6], [1.2, 0.13, 0.4]]);
  relief(t, dune, H, (x, y, p) => {
    const ride = Math.sin(x * 0.5 + y * 1.6 + Math.sin(x * 0.07) * 4) * 0.06;
    return rampe(or, 0.72 - (x / W) * 0.34 - p * 0.012 + ride + (p === 0 ? 0.14 : 0), x, y);
  });
  for (let y = 70; y < 76; y++) {
    for (let x = 0; x < W; x++) {
      const rang = y - 70;
      const pose = x + (rang >= 3 ? 5 : 0);
      const dalle = Math.floor(pose / 11) + (rang >= 3 ? 40 : 0);
      if (nuee(x * 1.3, y * 2.4, 9, 60) > 0.66 - (rang === 0 || rang === 5 ? 0.14 : 0)) continue;
      const v = 0.62 - (x / W) * 0.3 + (alea(dalle, 3) % 4) * 0.05 + (rang === 0 || rang === 3 ? 0.16 : 0);
      t.poser(x, y, pose % 11 === 0 || rang === 2 || rang === 5 ? rampe(["#3a2218", "#553420", "#70482a"], v, x, y) : rampe(["#5e4030", "#7a563a", "#987048", "#b48c5c", "#cca874", "#e0c490", "#f0d8a8"], v, x, y));
    }
  }

  // Les deux colonnes de gauche, proches et nettes, le soleil entre elles ; leur linteau cassé.
  const grande = (x: number, haut: number) => {
    for (let y = haut; y < 66; y++) {
      for (let i = 0; i < 7; i++) {
        const jour = i >= 5;
        let c = i === 0 ? "#2a1410" : i === 6 ? "#ffe6a8" : jour ? "#c88444" : i % 2 ? "#4a2618" : "#3a1c14";
        if ((y - haut) % 8 === 7) c = jour ? "#8a5428" : "#22100c";
        t.poser(x + i, y, c);
      }
    }
    t.bloc(x - 1, haut - 2, 9, 2, "#4a2618");
    t.bloc(x - 2, haut - 3, 11, 1, "#3a1c14");
    t.bloc(x + 5, haut - 3, 4, 1, "#ffe6a8");
    t.poser(x + 8, haut - 2, "#ffe6a8");
    t.poser(x + 7, haut - 1, "#ffe6a8");
    t.bloc(x - 2, 65, 11, 2, "#2a1410");
    t.bloc(x + 6, 65, 3, 1, "#e0a860");
  };
  grande(3, 33);
  grande(25, 33);
  for (let x = 1; x < 30; x++) {
    for (let y = 27; y < 30; y++) {
      if (x > 22 && y < 27 + (x - 22) * 0.6) continue;
      t.poser(x, y, y === 27 ? "#6a3a20" : (x + y) % 6 === 0 ? "#22100c" : "#3a1c14");
    }
  }
  halo(t, 15, 45, 9, "#fff4c8", 0.35, 4);

  // Le premier plan : un tambour de colonne tombé à gauche, un bloc à droite, dans l'ombre.
  t.grille(4, 70, [
    "..hhhhhhhhhhhhhhhh....",
    ".hsmsmsmsmsmsmsmsmoo..",
    "hsmsmsmsmsmsmsmsmsolo.",
    "hmsmsmsmsmsmsmsmsmollo",
    "hsmsmsmsmsmsmsmsmsollo",
    "osmsmsmsmsmsmsmsmsollo",
    "onsnsnsnsnsnsnsnsnolo.",
    ".onnnnnnnnnnnnnnnnoo..",
    "..oooooooooooooooo....",
  ], { h: "#f0c080", m: "#8a5430", s: "#6a3c22", n: "#4a2818", o: "#2a1410", l: "#5e3420" });
  t.grille(102, 72, [
    "...hhhhhhhhhhhh..",
    "..hmmmmmmmmmmmso.",
    ".hmmmmsmmmmmmmsso",
    "hmmmmmmmmmsmmmsso",
    "ommmsmmmmmmmmmsso",
    "onnnnnnnnnnnnnnso",
    ".oooooooooooooooo",
  ], { h: "#f0c080", m: "#8a5430", s: "#5e3420", n: "#4a2818", o: "#2a1410" });

  // Le vent : des traînées de sable au ras du sol, des grains qui volent, plus serrés près du mur.
  for (let y = 40; y < 78; y++) {
    for (let x = 3; x < W - 3; x++) {
      const g = alea(x * 3, y * 5);
      const dru = 30 + Math.round((1 - x / W) * 70);
      if (g % dru === 0 && y > 54) {
        const l = 3 + ((g >> 5) % 6);
        for (let i = 0; i < l; i++) teinter(t, x - i, y, "#fff0c4", 0.5 - i * 0.07);
      } else if (g % (dru * 2) === 1 && calme(x, y) === 0) {
        t.poser(x, y, (g >> 7) % 2 ? "#ffeab4" : "#f0bc62");
      }
    }
  }
  return t.decor("#5e3418");
}

/* ───────────────────────────── 3. La cathédrale de glace (mystique) ───────────────────────────── */

function cathedraleDeGlace(): Decor {
  const t = new Toile("#0b173c");
  const glace = ["#f4ffff", "#d8f8ff", "#b0ecfc", "#88dcf8", "#66c4f0", "#4ca8e4", "#3a8cd4", "#2e72c0", "#255aa8", "#1d4690", "#173676", "#12285e", "#0d1c48", "#091334", "#060c24"];
  const VX = 94;
  const VY = 50;
  const A = 28;
  const B = 46;
  const C = 7;
  const P = 1.5;
  const FENETRE = 0.37;
  // Une nef en perspective : des arcs brisés de glace, de plus en plus grands, qui fuient vers une verrière au fond.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const du = x + 0.5 - VX;
      const u = Math.abs(du) / A;
      const dv = y + 0.5 - VY;
      const mur = dv >= 0 ? u : Math.pow(Math.pow(u, P) + Math.pow(-dv / B, P), 1 / P);
      const sol = dv / C;
      const s = Math.max(mur, sol);
      if (s < FENETRE) continue;
      const loin = borne01(Math.log(s / FENETRE) / Math.log(4.3 / FENETRE));
      const z = 2.7 / s;
      const f = z - Math.floor(z);
      const nervure = f < 0.2 && z >= 1;
      const k = calme(x, y);
      let v = 0.1 + 0.86 * Math.pow(loin, 0.75);
      if (sol > mur) {
        // Le sol : une glace polie, qui reprend la lumière du fond et l'ombre des nervures.
        v -= 0.1 + borne01(1 - Math.abs(du) / (s * 9 + 4)) * 0.22;
        if (nervure) v += 0.07;
        if ((alea(Math.floor(x / 2), y) % 9 === 0 && y % 2 === 0) || (nuee(x * 2, y * 5, 8, 12) > 0.7 && y % 3 === 0)) v -= 0.08;
      } else {
        const tour = Math.atan2(dv, du);
        const cannelure = ((alea(Math.floor(tour * 22), Math.floor(z * 2)) % 5) - 2) * 0.022;
        v += cannelure * (1 - k);
        if (nervure) v += 0.17 * (1 - k * 0.6);
        else if (f < 0.27 && z >= 1) v -= 0.25 * (1 - k * 0.7);
        else v -= (1 - f) * 0.06;
        // La clef de voûte, un filet clair le long du faîte.
        if (dv < 0 && Math.abs(du) < 0.8 + s * 0.6) v -= 0.12 * (1 - k);
        // Les baies des bas-côtés : une lancette de lumière dans chaque travée.
        const q = dv / s;
        if (z >= 2 && f > 0.42 && f < 0.8 && q > -17 && q < 1.5 && -dv / B / s < 0.42) {
          const pointe = q < -12 ? Math.abs(f - 0.61) < (q + 17) * 0.038 : true;
          if (pointe) v = Math.abs(f - 0.61) < 0.02 || Math.abs(q + 6) < 0.6 ? v - 0.2 : 0.02 + loin * 0.34 + (alea(Math.floor(f * 30), Math.floor(q / 2)) % 3) * 0.03;
        }
      }
      t.poser(x, y, rampe(glace, v, x, y));
    }
  }

  // La verrière du fond : une haute lancette et sa rose, en éclats de glace irisés.
  const eclats = ["#ffffff", "#e8fcff", "#fff0d0", "#ffdcf0", "#c8f4ff", "#e0e0ff"];
  for (let y = 30; y < 54; y++) {
    for (let x = 80; x < 108; x++) {
      const du = x + 0.5 - VX;
      const u = Math.abs(du) / A;
      const dv = y + 0.5 - VY;
      const s = Math.max(dv >= 0 ? u : Math.pow(Math.pow(u, P) + Math.pow(-dv / B, P), 1 / P), dv / C);
      if (s >= FENETRE) continue;
      const rose = Math.hypot(du, dv + 8.5);
      let c = eclats[alea(Math.floor((x + y) / 2), Math.floor((x - y) / 2) + 40) % eclats.length] ?? "#ffffff";
      if (s > FENETRE - 0.045) c = "#58b8ec";
      else if (rose < 4.6 && rose > 3.7) c = "#66c4f0";
      else if (rose <= 3.7) c = Math.abs(du) < 0.6 || Math.abs(dv + 8.5) < 0.6 || Math.abs(Math.abs(du) - Math.abs(dv + 8.5)) < 0.5 ? "#88dcf8" : ["#ffe8a8", "#ffc8e8", "#b8f0ff", "#ffffff"][(alea(Math.floor(Math.atan2(dv + 8.5, du) * 1.3 + 9), 4) % 4)] ?? "#ffffff";
      else if (dv > -3.5 && (Math.abs(du) < 0.6 || Math.abs(Math.abs(du) - 4.6) < 0.55)) c = "#66c4f0";
      else if (Math.abs(dv + 3.5) < 0.55) c = "#66c4f0";
      t.poser(x, y, c);
    }
  }
  halo(t, VX, 42, 24, "#e8fcff", 0.36, 8);

  // Les rais de lumière qui sortent de la verrière, et son reflet dans la glace du sol.
  for (let y = 4; y < H - 3; y++) {
    for (let x = 3; x < W - 3; x++) {
      const dx = x - VX;
      const dy = y - 41;
      const d = Math.hypot(dx, dy);
      if (d < 12 || d > 96) continue;
      const a = Math.atan2(dy, dx);
      const rai = Math.sin(a * 11 + 0.7) + Math.sin(a * 5 - 1.2) * 0.6;
      if (rai > 0.75) teinter(t, x, y, "#d8f8ff", (0.24 - d * 0.0021) * (1 - calme(x, y) * 0.75) * (rai > 1.2 ? 1.3 : 0.8));
    }
  }
  for (let y = 53; y < 74; y++) {
    const p = (y - 53) / 21;
    const demi = 9 - p * 4;
    for (let x = Math.round(VX - demi - 2); x <= VX + demi + 2; x++) {
      const dedans = Math.abs(x - VX + Math.sin(y * 1.7) * 1.2) < demi;
      if (!dedans || (y % 3 === 0 && alea(x >> 1, y) % 2 === 0)) continue;
      teinter(t, x, y, y % 2 ? "#f4ffff" : "#b0ecfc", 0.62 * (1 - p) + 0.08);
    }
  }

  // À gauche, au plan moyen : une gerbe de flèches de glace, l'arête tournée vers la verrière prise dans la lumière.
  for (const [cx, pied, haut, demi] of [[30, 71, 27, 3.2], [22, 72, 36, 4], [14, 72, 22, 3], [36, 70, 15, 2.4], [26, 73, 12, 2.6]] as const) {
    for (let y = pied - haut; y <= pied; y++) {
      const l = demi * Math.pow((y - (pied - haut)) / haut, 0.8) + 0.3;
      for (let x = Math.ceil(cx - l); x <= cx + l; x++) {
        const u = (x - cx) / (l + 0.01);
        const c = u > 0.55 ? "#d8f8ff" : u > 0.1 ? ((y + x) % 6 === 0 ? "#88dcf8" : "#4ca8e4") : u > -0.5 ? "#255aa8" : "#173676";
        t.poser(x, y, c);
      }
    }
    t.poser(cx, pied - haut - 1, "#f4ffff");
  }

  // Les glaçons de la voûte, en contre-jour, un liseré de lumière du côté de la verrière.
  for (let x = 47; x < W - 2; x++) {
    const g = alea(x, 911);
    if (g % 3 !== 0) continue;
    const long = 3 + ((g >> 3) % 11) + (x > 108 ? 6 : 0);
    const large = long > 9 ? 3 : long > 5 ? 2 : 1;
    for (let i = 0; i < long; i++) {
      const l = Math.max(1, Math.round(large * (1 - i / long)));
      for (let j = 0; j < l; j++) {
        const vers = x < VX ? j === l - 1 : j === 0;
        t.poser(x + j, 3 + i, vers ? (i > long - 3 ? "#b0ecfc" : "#3a8cd4") : "#0a1740");
      }
    }
    t.poser(x, 3 + long, "#d8f8ff");
    x += large;
  }

  // Les piliers du premier plan, sombres, qui encadrent la nef ; leurs arêtes prennent la lumière.
  for (let y = 26; y < H; y++) {
    const l = 7 + Math.round(Math.sin(y * 0.35) * 0.8) + (y > 68 ? Math.round((y - 68) * 0.5) : 0);
    for (let x = 0; x < l; x++) t.poser(x, y, x === l - 1 ? "#66c4f0" : x === l - 2 ? "#255aa8" : (x + (y >> 2)) % 5 === 0 ? "#0d1c48" : "#081030");
  }
  for (let y = 0; y < H; y++) {
    const l = 6 + Math.round(Math.sin(y * 0.3 + 2) * 0.9) + (y > 66 ? Math.round((y - 66) * 0.5) : 0);
    for (let i = 0; i < l; i++) {
      const x = W - 1 - i;
      t.poser(x, y, i === l - 1 ? "#88dcf8" : i === l - 2 ? "#2e72c0" : (x + (y >> 2)) % 5 === 0 ? "#0d1c48" : "#081030");
    }
  }

  // Le premier plan : des congères de neige bleutée et des blocs de glace taillés.
  const congere = (x: number) => 78 - 3.2 * Math.pow(Math.abs(Math.sin(x * 0.052 + 0.4)), 1.6) - (x < 22 ? (22 - x) * 0.18 : 0) - (x > 100 ? (x - 100) * 0.16 : 0);
  relief(t, (x) => Math.round(congere(x)), H, (x, y, p) => (p === 0 ? "#f4ffff" : p === 1 ? "#b0ecfc" : rampe(["#88dcf8", "#66c4f0", "#4ca8e4", "#3a8cd4"], p / 5 + (alea(x, y) % 3) * 0.08, x, y)));
  for (const [x, y, l, h] of [[12, 66, 6, 9], [20, 70, 4, 6], [108, 68, 5, 8]] as const) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < l; i++) {
        if (j < 2 && (i < 2 - j || i > l - 2 + j)) continue;
        t.poser(x + i, y + j, i === l - 1 - (x > 60 ? l - 1 : 0) ? "#d8f8ff" : j === 0 ? "#b0ecfc" : (i + j) % 4 === 0 ? "#66c4f0" : i < l / 2 ? "#2e72c0" : "#4ca8e4");
      }
    }
  }

  // La poussière de givre qui flotte dans la lumière.
  for (let y = 6; y < 74; y++) {
    for (let x = 8; x < W - 8; x++) {
      const g = alea(x * 7, y * 3);
      if (calme(x, y) > 0) continue;
      if (g % 331 === 0) etincelle(t, x, y, "#ffffff", "#b0ecfc");
      else if (g % 67 === 1) teinter(t, x, y, "#f4ffff", 0.6);
    }
  }
  return t.decor("#12306c");
}

/* ───────────────────────────── 4. Les chutes de lave (mystique) ───────────────────────────── */

function chutesDeLave(): Decor {
  const t = new Toile("#0a0508");
  const nuit = ["#07040a", "#0b050c", "#10060e", "#170810", "#1f0a12", "#290c14", "#350f15", "#431316", "#541917", "#682018", "#80291a"];
  const feu = ["#fffbd0", "#fff09a", "#ffd95c", "#ffb830", "#ff9418", "#f96f0e", "#e44d0a", "#c23208", "#941f0a", "#66120c", "#3c0a0c"];
  const chutes = [
    { x: 74, l: 1.6 },
    { x: 93, l: 4.2 },
    { x: 112, l: 2.4 },
  ] as const;
  const lueur = (x: number, y: number): number => chutes.reduce((s, c) => s + Math.exp(-Math.abs(x - c.x) / (2.5 + c.l * 1.6)) * (0.5 + c.l * 0.12), 0) * (0.75 + borne01((y - 20) / 40) * 0.5);

  // Le ciel : une nuit de fumées, rougies par en dessous.
  for (let y = 0; y < 58; y++) {
    for (let x = 0; x < W; x++) {
      const k = calme(x, y);
      const n = nuee(x, y * 1.7, 18, 2) - 0.5;
      const v = 0.08 + Math.pow(y / 57, 1.6) * 0.62 + n * 0.5 * (1 - k * 0.85) * (0.4 + y / 80) + borne01((x - 50) / 74) * 0.14;
      t.poser(x, y, rampe(nuit, v, x, y));
    }
  }

  // Le volcan lointain, à gauche : son cône dans la brume, sa gerbe, deux coulées sur le flanc.
  const cone = (x: number) => Math.round(35 + Math.pow(Math.abs(x - 27), 1.15) * 0.62 + Math.sin(x * 0.9) * 0.5 + (Math.abs(x - 27) < 3 ? 1 : 0));
  relief(t, cone, 57, (x, y, p) => (p === 0 ? "#5a2222" : rampe(["#3a151a", "#2e1016", "#240c12", "#1b0910"], (y - 35) / 22 + (alea(x >> 1, y) % 3) * 0.06, x, y)), 0, 64);
  for (let y = 10; y < 34; y++) {
    for (let x = 12; x < 52; x++) {
      const e = Math.hypot((x - 30 - (34 - y) * 0.25) / (5 + (34 - y) * 0.55), (y - 22) / 13);
      if (e < 1 && nuee(x * 1.3, y * 1.3, 8, 77) > 0.42 + e * 0.2) teinter(t, x, y, "#682018", (0.5 - calme(x, y) * 0.4) * ((y - 8) / 26));
    }
  }
  halo(t, 27, 33, 9, "#ff7a20", 0.45, 5);
  t.grille(23, 29, [
    "...y.y...",
    "..y.w.y..",
    ".o.yw.yo.",
    "o..ywy..o",
    "...www...",
    "...www...",
  ], { y: "#ffd95c", w: "#fffbd0", o: "#f96f0e" });
  for (let i = 0; i < 17; i++) {
    t.poser(26 - Math.round(i * 0.55 + Math.sin(i * 0.8)), 37 + i, feu[Math.min(8, 2 + (i >> 1))] ?? "#ff9418");
    if (i < 12) t.poser(29 + Math.round(i * 0.7 + Math.sin(i * 1.1)), 37 + i, feu[Math.min(8, 3 + (i >> 1))] ?? "#ff9418");
  }

  // La grande falaise de basalte, à droite : des orgues noires, rougies près des chutes.
  const sommet = (x: number) => Math.round(21 + 13 * Math.pow(borne01((72 - x) / 18), 1.6) + ((alea(Math.floor(x / 3), 50) % 3) - 1) + (x > 100 ? (x - 100) * 0.12 : 0));
  const LAC = 55;
  for (let x = 52; x < W; x++) {
    const s = sommet(x);
    const col = Math.floor(x / 3);
    const ton = (alea(col, 51) % 4) * 0.05;
    for (let y = s; y < LAC; y++) {
      const joint = x % 3 === 0;
      const casse = (y + (alea(col, 52) % 9)) % (7 + (alea(col, 53) % 5)) === 0;
      const g = lueur(x, y);
      let v = 0.14 + ton + g * 0.5 + (y - s < 1 ? 0.22 : 0) + ((y - 20) / 35) * 0.12 - (joint ? 0.14 : 0) - (casse ? 0.1 : 0);
      if (x < 56 + (alea(0, y >> 1) % 3)) v += 0.12;
      t.poser(x, y, rampe(["#07040a", "#0e060c", "#170910", "#220c12", "#321015", "#481617", "#641e18", "#86291a", "#ac381c", "#d04c20"], v, x, y));
    }
  }
  // La rivière de lave sur le plateau, qui luit derrière l'arête.
  for (let x = 66; x < W - 3; x++) {
    const s = sommet(x);
    const g = lueur(x, 30);
    if (g > 0.25) {
      teinter(t, x, s - 1, "#ff9418", borne01(g * 0.9));
      teinter(t, x, s - 2, "#ff7a20", borne01(g * 0.5));
      teinter(t, x, s - 3, "#f96f0e", borne01(g * 0.25));
    }
  }

  // Les trois chutes : un cœur presque blanc, des bords rouges, des paquets sombres qui tombent ; le brouillard de feu en bas.
  for (const c of chutes) {
    const s = sommet(c.x);
    for (let y = s - 1; y < LAC + 1; y++) {
      const elargi = c.l + ((y - s) / 34) * 1.2 + Math.sin(y * 0.6 + c.x) * 0.25;
      for (let x = Math.floor(c.x - elargi - 1); x <= c.x + elargi + 1; x++) {
        const e = Math.abs(x + 0.5 - c.x - 0.5) / (elargi + 0.5);
        if (e > 1) continue;
        const coule = (alea(x, Math.floor((y + (alea(x, 60) % 5)) / 4)) % 4) * 0.05;
        let v = e * e * 0.62 + coule + ((y - s) / 34) * 0.1;
        if (alea(x, Math.floor(y / 2) + 70) % 19 === 0 && e > 0.25) v = 0.82;
        t.poser(x, y, rampe(feu, v, x, y));
      }
    }
    t.bloc(Math.round(c.x - c.l - 1), s - 1, Math.round(c.l * 2 + 3), 1, "#fff09a");
  }

  // Le lac de lave : une croûte noire fendue de lumière, en fusion sous les chutes.
  for (let y = LAC; y < 68; y++) {
    for (let x = 0; x < W; x++) {
      if (x < 52 && y < 57) continue;
      const p = (y - LAC) / 13;
      const n = nuee(x * (1.25 - p * 0.55), y * (4.2 - p * 1.6), 10, 33);
      const g = borne01(lueur(x, 60) * 1.15 + (x < 52 ? 0.05 : 0));
      const seuil = 0.27 + g * 0.45;
      let v: number;
      if (n < seuil) v = 0.05 + (1 - g) * 0.42 + (n / seuil) * 0.22;
      else if (n < seuil + 0.035) v = 0.3 + (1 - g) * 0.2;
      else v = 0.84 + (n - seuil) * 0.5 - g * 0.1;
      t.poser(x, y, rampe(feu, v, x, y));
    }
  }
  t.bloc(0, 56, 52, 1, "#1b0910");
  for (let x = 0; x < 52; x++) if (alea(x, 56) % 3) t.poser(x, 57, "#f96f0e");
  for (const c of chutes) {
    halo(t, c.x, LAC, 6 + c.l * 2.4, "#ffd95c", 0.75, 7);
    for (let i = 0; i < 26 * c.l; i++) {
      const g = alea(i * 13 + c.x, 81);
      const dx = ((g % 200) / 100 - 1) * (4 + c.l * 2.6);
      const dy = ((g >> 8) % 100) / 100;
      const x = Math.round(c.x + dx);
      const y = Math.round(LAC + 1 - dy * dy * (6 + c.l * 2) * (1 - Math.abs(dx) / (5 + c.l * 2.6)));
      t.poser(x, y, dy > 0.7 ? "#ff9418" : dy > 0.4 ? "#ffd95c" : "#fffbd0");
    }
  }

  // Le premier plan : une corniche d'orgues de basalte, vue de dessus puis de face, l'arête rougie par le lac.
  const marche = (x: number) => 68 + (alea(Math.floor((x + 2) / 7), 90) % 3 === 0 ? 1 : 0) + (x < 20 || x > 106 ? -1 : 0);
  for (let x = 0; x < W; x++) {
    const m = marche(x);
    const col = Math.floor((x + 2) / 7);
    const bordCol = (x + 2) % 7 === 0;
    for (let y = m; y < H; y++) {
      const p = y - m;
      let c: string;
      if (p === 0) c = alea(x, 91) % 5 === 0 ? "#ffb830" : "#f96f0e";
      else if (p === 1) c = "#94301a";
      else if (y < 76) {
        const pave = ((x + 2) % 7) + (y % 4 < 2 ? 0 : 3);
        c = bordCol || (y % 4 === 0 && pave % 7 < 4) ? "#150a10" : rampe(["#3c1c20", "#32161c", "#291218", "#211016"], (y - m) / 9 + (alea(col, y >> 2) % 3) * 0.12, x, y);
      } else c = bordCol ? "#050305" : y === 76 ? "#4a1c1c" : alea(col, 93) % 2 ? "#120a10" : "#0c070b";
      t.poser(x, y, c);
    }
  }
  // Une fissure qui rougeoie entre deux orgues, à droite.
  for (const [x, y, c] of [[96, 70, 4], [97, 71, 3], [97, 72, 2], [98, 73, 3], [98, 74, 2], [99, 75, 4], [99, 76, 3], [99, 77, 5], [100, 78, 6]] as const) t.poser(x, y, feu[c] ?? "#ff9418");
  halo(t, 98, 73, 5, "#ff7a20", 0.3, 3);

  // Les grands prismes noirs qui encadrent la scène, un liseré de feu du côté du lac.
  const prisme = (x: number, haut: number, l: number, versDroite: boolean) => {
    for (let y = haut; y < 69; y++) {
      for (let i = 0; i < l; i++) {
        const cote = versDroite ? i === l - 1 : i === 0;
        const pres = versDroite ? i === l - 2 : i === 1;
        t.poser(x + i, y, y === haut ? (cote ? "#ffb830" : "#7a2a1a") : cote ? (y % 11 === 5 ? "#c23208" : "#f96f0e") : pres ? "#5a1c16" : (y + x) % 13 === 0 ? "#050305" : "#0d070b");
      }
    }
  };
  prisme(0, 46, 6, true);
  prisme(6, 51, 5, true);
  prisme(11, 57, 5, true);
  prisme(16, 63, 4, true);
  prisme(119, 52, 5, false);
  prisme(114, 59, 5, false);
  prisme(109, 64, 5, false);

  // Les braises qui montent dans l'air chaud.
  for (let y = 6; y < 68; y++) {
    for (let x = 4; x < W - 4; x++) {
      if (calme(x, y) > 0) continue;
      const g = alea(x * 5, y * 9);
      const dru = 150 - Math.round(borne01(lueur(x, 50)) * 90) - (y > 40 ? 20 : 0);
      if (g % dru !== 0) continue;
      t.poser(x, y, (g >> 8) % 3 === 0 ? "#fff09a" : (g >> 8) % 3 === 1 ? "#ffb830" : "#f96f0e");
      if ((g >> 11) % 3 === 0) teinter(t, x, y + 1, "#f96f0e", 0.6);
    }
  }
  return t.decor("#060305");
}

/* ───────────────────────────── 5. L'arbre de foudre (légendaire) ───────────────────────────── */

interface Trait {
  x: number;
  y: number;
  f: number;
}

/** Une branche d'éclair : elle descend en zigzag, dérive d'un côté, et se ramifie tant qu'il lui reste de la force. */
function ramure(traits: Trait[], x0: number, y0: number, longueur: number, derive: number, force: number, graine: number, etage: number): void {
  let x = x0;
  let avant = Math.round(x0);
  for (let i = 1; i <= longueur; i++) {
    const g = alea(graine * 31 + i, graine * 7 + 3);
    const cran = (alea(graine * 13 + Math.floor(i / 2), graine + 5) % 5) - 2;
    x += cran * 0.5 + derive;
    const y = y0 + i;
    const rx = Math.round(x);
    for (let k = Math.min(avant, rx); k <= Math.max(avant, rx); k++) traits.push({ x: k, y, f: force * (1 - (i / longueur) * 0.45) });
    avant = rx;
    if (etage > 0 && i > 2 && i < longueur - 2 && g % 7 === 0) {
      const cote = (g >> 4) % 2 ? 1 : -1;
      ramure(traits, x, y, 3 + ((g >> 6) % (4 + etage * 3)), cote * (0.8 + ((g >> 10) % 4) * 0.25), force * 0.62, graine * 3 + i, etage - 1);
    }
  }
}

function arbreDeFoudre(): Decor {
  const t = new Toile("#07061a");
  const BX = 101;
  const CIME = 40;

  // Les éclairs d'abord : le tronc de foudre, du nuage à la cime de l'arbre mort, et sa ramure ; un second, loin à gauche.
  const traits: Trait[] = [];
  const tronc = (y: number) => {
    const p = (y - 4) / (CIME - 4);
    return BX - 7 + p * 7 + (bruit(y, 0, 7, 71) - 0.5) * 17 * Math.sin(Math.PI * p) + (bruit(y, 0, 2.6, 72) - 0.5) * 6 * Math.sin(Math.PI * p);
  };
  let avant = Math.round(tronc(4));
  for (let y = 4; y <= CIME; y++) {
    const x = Math.round(tronc(y));
    for (let k = Math.min(avant, x); k <= Math.max(avant, x); k++) {
      traits.push({ x: k, y, f: 1 });
      if (y < 30) traits.push({ x: k + 1, y, f: 1 });
    }
    avant = x;
  }
  for (const [y, cote, long, graine] of [[8, -1, 17, 3], [10, 1, 12, 5], [14, 1, 16, 7], [17, -1, 20, 11], [22, 1, 14, 13], [25, -1, 13, 17], [30, 1, 9, 19], [33, -1, 7, 23]] as const) {
    ramure(traits, tronc(y), y, long, cote * (1 + (graine % 3) * 0.22), 0.7, graine, 2);
  }
  // Les éclairs qui rampent sous le nuage, à l'horizontale.
  for (const [x0, y0, sens, long, graine] of [[94, 6, 1, 22, 31], [92, 9, -1, 26, 37]] as const) {
    let y = y0;
    for (let i = 0; i < long; i++) {
      y += ((alea(graine + Math.floor(i / 2), 41) % 5) - 2) * 0.4 + 0.08;
      traits.push({ x: x0 + sens * i, y: Math.round(y), f: 0.5 * (1 - i / long) + 0.12 });
    }
  }
  const second: Trait[] = [];
  ramure(second, 22, 31, 26, -0.08, 0.6, 43, 1);
  const tous = [...traits, ...second];

  // La lumière que la foudre jette autour d'elle.
  const lum = new Float32Array(W * H);
  for (const p of tous) {
    const R = 4 + p.f * 6;
    for (let y = Math.floor(p.y - R); y <= p.y + R; y++) {
      for (let x = Math.floor(p.x - R); x <= p.x + R; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot(x - p.x, y - p.y) / R;
        if (d >= 1) continue;
        const l = p.f * (1 - d) * (1 - d);
        const i = y * W + x;
        if (l > (lum[i] ?? 0)) lum[i] = l;
      }
    }
  }

  // Le ciel : un orage géant, ses masses éclairées de l'intérieur ; dessous, une bande de ciel froid au ras de l'horizon.
  const orage = ["#05040f", "#080618", "#0c0922", "#110c2e", "#17103c", "#1f154c", "#291b5e", "#352372", "#442d88", "#56399e", "#6c48b4", "#8660c8", "#a27edc", "#bea0ec", "#dac6f8", "#f2e8ff", "#ffffff"];
  const froid = ["#0a0c26", "#0c1430", "#0f1e3c", "#13294a", "#193858", "#224a68", "#2e5e78", "#407488", "#588a98"];
  const HORIZON = 57;
  const socle = (x: number) => 43 + 3.5 * Math.sin(x * 0.085 + 0.6) + (nuee(x * 2, 0, 10, 58) - 0.5) * 7;
  for (let y = 0; y < HORIZON; y++) {
    for (let x = 0; x < W; x++) {
      const k = calme(x, y);
      const l = lum[y * W + x] ?? 0;
      const base = socle(x);
      const large = Math.exp(-1.6 * Math.pow(Math.hypot((x - tronc(Math.min(CIME, Math.max(4, y)))) / 34, (y - 22) / 44), 2));
      if (y < base) {
        const n = nuee(x, y * 1.6, 22, 11);
        const vers = x < BX ? 2 : -2;
        const bosse = (n - nuee(x + vers, y * 1.6 + 1.5, 22, 11)) * 7;
        const vol = volute(x, y * 1.3, 11, 14);
        let v = 0.07 + n * 0.24 + bosse * 0.16 + (1 - vol.d) * 0.05 + large * (0.3 + bosse * 0.6 + vol.l * (x < BX ? -0.07 : 0.07) + (1 - vol.d) * 0.08) + l * 0.6;
        v += borne01(1 - (base - y) / 5) * 0.07;
        v = v * (1 - k * 0.72) + 0.13 * k * 0.72;
        t.poser(x, y, rampe(orage, v, x, y));
      } else {
        const p = (y - base) / (HORIZON - base);
        const c = rampe(froid, 0.12 + p * 0.7 + large * 0.2, x, y);
        t.poser(x, y, melanger(c, "#dac6f8", borne01(l * 0.8 + large * 0.12)));
      }
    }
  }

  // La pluie, en rideaux penchés.
  for (let y = 6; y < HORIZON; y++) {
    for (let x = 3; x < W - 3; x++) {
      if (calme(x, y) > 0 || alea(x * 3, y * 5) % 29 !== 0) continue;
      for (let i = 0; i < 4; i++) teinter(t, x - i, y + i * 2, "#b8b0f0", 0.16);
      for (let i = 0; i < 4; i++) teinter(t, x - i, y + i * 2 + 1, "#b8b0f0", 0.1);
    }
  }

  // Les montagnes du fond, un liseré violet du côté de la foudre.
  const monts = (x: number) => crete(x, 53, [[2.6, 0.07, 1.2], [1.4, 0.19, 0.3], [0.7, 0.43, 2]]);
  relief(t, monts, HORIZON + 1, (x, y, p) => {
    const pres = Math.exp(-Math.abs(x - BX) / 40);
    if (p === 0) return melanger("#1c1650", "#9a7ee0", pres * (monts(x + (x < BX ? 1 : -1)) >= monts(x) ? 1 : 0.4));
    return rampe(["#17123e", "#110d30", "#0c0924"], p / 4, x, y);
  });

  // Les éclairs : un cœur blanc, une gaine lilas.
  for (const p of tous) {
    if (p.f > 0.4) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) teinter(t, p.x + dx, p.y + dy, "#d8b8ff", 0.12 + p.f * 0.33);
  }
  for (const p of tous) t.poser(p.x, p.y, p.f > 0.55 ? "#ffffff" : p.f > 0.3 ? "#f2e8ff" : "#d0b4f8");

  // Le promontoire et l'arbre mort que la foudre frappe : une silhouette noire dans l'éclat, des flammèches à la cime.
  const cap = (x: number) => Math.round(HORIZON + 1 - 6.5 * Math.exp(-(((x - BX - 2) / 15) ** 2)) - 1.5 * Math.exp(-(((x - 118) / 8) ** 2)));
  halo(t, BX, CIME, 15, "#f2e8ff", 0.85, 8);
  halo(t, BX, CIME, 6, "#ffffff", 0.9, 4);
  relief(t, cap, HORIZON + 1, (x, _y, p) => (p === 0 ? melanger("#2c2068", "#e4d0ff", Math.exp(-Math.abs(x - BX) / 9)) : "#07051a"), 74, W);
  const NOIR = "#05030f";
  const branches: readonly (readonly [number, number, number, number])[] = [
    [BX, 52, BX, 44], [BX + 1, 52, BX + 1, 45], [BX, 44, BX, CIME + 1], [BX, 47, BX - 4, 43], [BX - 4, 43, BX - 5, 40], [BX - 4, 43, BX - 7, 43], [BX - 7, 43, BX - 9, 41],
    [BX + 1, 46, BX + 5, 42], [BX + 5, 42, BX + 5, 38], [BX + 5, 42, BX + 8, 41], [BX + 8, 41, BX + 10, 38], [BX + 1, 49, BX + 6, 47], [BX + 6, 47, BX + 9, 47], [BX, 50, BX - 5, 48], [BX - 5, 48, BX - 7, 46],
    [BX, 43, BX + 2, 40], [BX + 2, 40, BX + 2, 37],
  ];
  for (const [x0, y0, x1, y1] of branches) ligne(t, x0, y0, x1, y1, NOIR);
  t.bloc(BX - 1, 51, 4, 2, NOIR);
  for (const [x, y, c] of [[BX, CIME, "#ffffff"], [BX - 5, 39, "#ffd070"], [BX + 5, 37, "#ffb040"], [BX + 2, 36, "#fff0b0"], [BX + 10, 37, "#ff9030"], [BX - 9, 40, "#ffb040"], [BX - 3, 36, "#ffd070"], [BX + 7, 34, "#ff9030"], [BX - 7, 37, "#ff9030"], [BX + 12, 40, "#ffd070"], [BX - 11, 44, "#ff9030"], [BX + 4, 33, "#ffd070"]] as const) t.poser(x, y, c);

  // Le lac : il renvoie le ciel, plus sombre, et la foudre en tirets brisés.
  for (let y = HORIZON + 1; y < 69; y++) {
    const p = y - HORIZON - 1;
    for (let x = 0; x < W; x++) {
      const tremble = Math.round(Math.sin(y * 2.1 + x * 0.05) * (0.6 + p * 0.18));
      const src = t.lire(x + tremble, HORIZON - Math.round(p * 2.6)) ?? "#07061a";
      let c = melanger(src, "#060518", 0.38 + p * 0.02);
      if (y % 2 === 0 && alea(x >> 2, y) % 3 === 0) c = melanger(c, "#04030c", 0.4);
      t.poser(x, y, c);
    }
  }
  for (let y = HORIZON + 1; y < 69; y++) {
    const p = y - HORIZON - 1;
    for (let x = BX - 12; x <= BX + 12; x++) {
      const e = Math.abs(x - BX) / (2.5 + p * 0.85);
      if (e > 1 || alea(x >> 1, y * 3) % 5 < 2 - (e < 0.3 ? 2 : 0)) continue;
      teinter(t, x, y, e < 0.35 ? "#ffffff" : "#c8a8ff", (1 - e) * (0.85 - p * 0.03));
    }
  }
  t.bloc(0, HORIZON + 1, 74, 1, "#221c58");

  // Le premier plan : une falaise d'herbe couchée par le vent, des pierres mouillées qui luisent, des bruyères.
  const pre = (x: number) => crete(x, 69, [[1, 0.07, 0.9], [0.6, 0.23, 2.2]]);
  relief(t, pre, H, (x, y, p) => {
    const pres = 0.35 + 0.65 * Math.exp(-Math.abs(x - BX) / 46);
    if (p === 0) return melanger("#2a2466", "#c8b0ff", pres * (alea(x, 120) % 3 === 0 ? 1 : 0.6));
    if (p < 3) return melanger("#151238", "#4a3c98", pres * (alea(x, y) % 3 === 0 ? 0.8 : 0.35));
    return rampe(["#17133c", "#120f30", "#0d0b26", "#09081c", "#060513"], (p - 3) / 7 + (alea(x >> 1, y) % 3) * 0.1, x, y);
  });
  for (let x = 3; x < W - 3; x++) {
    const g = alea(x, 121);
    const pres = 0.35 + 0.65 * Math.exp(-Math.abs(x - BX) / 46);
    if (g % 2 === 0) {
      const haut = 1 + ((g >> 3) % 3);
      for (let i = 1; i <= haut; i++) t.poser(x + Math.round(i * 0.7), pre(x) - i, melanger("#1c1850", "#a890f0", pres * (i / haut)));
    }
    if (g % 13 === 0) {
      t.poser(x, pre(x) + 2, "#d870d8");
      t.poser(x + 1, pre(x) + 3, "#9a48b0");
    }
  }
  for (const [x, l] of [[8, 7], [26, 4], [86, 6], [108, 8]] as const) {
    const pres = 0.4 + 0.6 * Math.exp(-Math.abs(x - BX) / 40);
    t.bloc(x, 75, l, 2, "#0d0b26");
    t.bloc(x + 1, 74, l - 2, 1, "#1c1850");
    t.bloc(x + 1, 74, Math.max(1, l - 4), 1, melanger("#3a3088", "#e4d0ff", pres));
    t.poser(x + l - 1, 75, melanger("#2a2466", "#a890f0", pres));
  }
  // Une flaque, au pied du Gaulois vers la droite, où la foudre se voit encore.
  for (let x = 90; x < 106; x++) {
    for (let y = 77; y < 79; y++) {
      if ((x < 92 || x > 103) && y === 77) continue;
      t.poser(x, y, Math.abs(x - 99) < 2 ? "#f2e8ff" : alea(x, y) % 3 === 0 ? "#6c48b4" : "#291b5e");
    }
  }
  return t.decor("#05040f");
}

/* ───────────────────────────── Le lot ───────────────────────────── */

export const LOT_I: readonly BanniereDuLot[] = [
  {
    id: "tornade-sur-la-plaine",
    nom: "La tornade sur la plaine",
    rarete: "epique",
    famille: "tresors",
    description: "Une tornade grise descend d'un ciel d'orage verdâtre sur une plaine de blé doré, loin d'une ferme et de son éolienne.",
    dessiner: tornade,
  },
  {
    id: "mur-de-sable",
    nom: "Le mur de sable",
    rarete: "epique",
    famille: "tresors",
    description: "Un immense mur de sable orange avale des ruines antiques sous un ciel bleu ; le soleil brille entre deux colonnes.",
    dessiner: murDeSable,
  },
  {
    id: "cathedrale-de-glace",
    nom: "La cathédrale de glace",
    rarete: "mystique",
    famille: "tresors",
    description: "Une nef de glace bleue aux arcs brisés mène à une verrière éclatante, dont la lumière se reflète sur le sol gelé.",
    dessiner: cathedraleDeGlace,
  },
  {
    id: "chutes-de-lave",
    nom: "Les chutes de lave",
    rarete: "mystique",
    famille: "tresors",
    description: "Dans la nuit, trois chutes de lave tombent d'une falaise noire dans un lac en fusion, près d'un volcan lointain.",
    dessiner: chutesDeLave,
  },
  {
    id: "arbre-de-foudre",
    nom: "L'arbre de foudre",
    rarete: "legendaire",
    famille: "tresors",
    description: "Sous un orage violet géant, un éclair ramifié comme un arbre frappe un arbre mort au bord d'un lac qui le reflète.",
    dessiner: arbreDeFoudre,
  },
];
