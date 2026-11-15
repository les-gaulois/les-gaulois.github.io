/**
 * Bannières, lot A, « Le front » : voir `commun.ts`. La guerre comme le jeu la raconte, par ses machines et ses
 * lumières : un poste sur une crête, une frontière qui avance, une ville sous l'alerte, un silo qui s'ouvre, un
 * champignon au crépuscule, un barrage anti-aérien, une salve qui se sépare, une bombe H. Ni sang ni corps. Dessins
 * originaux de Claude Fable 5.2 pour le clan [GAL], 15 novembre 2026 ; rien n'y est emprunté aux images d'OpenFront ni
 * à une œuvre existante.
 */
import { HAUTEUR, LARGEUR, Toile, grain, melanger, type BanniereDuLot, type Decor } from "./commun.ts";

const W = LARGEUR;
const H = HAUTEUR;

/* ───────────────────────────── Outils de dessin ───────────────────────────── */

const pris = <T>(liste: readonly T[], i: number): T => liste[((i % liste.length) + liste.length) % liste.length] as T;

/** Fond la couleur dans la case : `part` de 0 (rien) à 1 (tout). */
function fondre(t: Toile, x: number, y: number, couleur: string, part: number): void {
  const dessous = t.lire(x, y);
  if (dessous && part > 0) t.poser(x, y, melanger(dessous, couleur, part));
}

/** Un dégradé en bandes égales entre deux rangées, une rangée tramée à chaque passage. */
function degrade(t: Toile, y0: number, y1: number, couleurs: readonly string[], x0 = 0, x1 = W): void {
  const pas = (y1 - y0) / couleurs.length;
  for (let y = y0; y < y1; y++) {
    const i = Math.min(couleurs.length - 1, Math.floor((y - y0) / pas));
    const passage = i < couleurs.length - 1 && Math.floor((y + 1 - y0) / pas) > i;
    for (let x = x0; x < x1; x++) t.poser(x, y, passage && (x + y) % 2 === 0 ? pris(couleurs, i + 1) : pris(couleurs, i));
  }
}

function ellipse(t: Toile, cx: number, cy: number, rx: number, ry: number, couleur: string): void {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) t.poser(x, y, couleur);
    }
  }
}
const disque = (t: Toile, cx: number, cy: number, r: number, couleur: string): void => ellipse(t, cx, cy, r, r, couleur);

/** Une lueur en paliers : la couleur se fond dans ce qui est dessous, plus fort au centre. */
function lueur(t: Toile, cx: number, cy: number, rx: number, ry: number, couleur: string, force: number, paliers = 4): void {
  for (let y = Math.max(0, Math.ceil(cy - ry)); y <= Math.min(H - 1, cy + ry); y++) {
    for (let x = Math.max(0, Math.ceil(cx - rx)); x <= Math.min(W - 1, cx + rx); x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      if (d < 1) fondre(t, x, y, couleur, (force * Math.ceil((1 - d) * paliers)) / paliers);
    }
  }
}

function ligne(t: Toile, x0: number, y0: number, x1: number, y1: number, couleur: string): void {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) t.poser(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), couleur);
}

/** Une courbe à un point de contrôle : `f` reçoit chaque case une fois, avec sa part du chemin (0 à 1). */
function courbe(a: readonly [number, number], c: readonly [number, number], b: readonly [number, number], f: (x: number, y: number, s: number) => void): void {
  let avant = "";
  for (let i = 0; i <= 400; i++) {
    const s = i / 400;
    const x = Math.round((1 - s) ** 2 * a[0] + 2 * s * (1 - s) * c[0] + s ** 2 * b[0]);
    const y = Math.round((1 - s) ** 2 * a[1] + 2 * s * (1 - s) * c[1] + s ** 2 * b[1]);
    const cle = `${x},${y}`;
    if (cle !== avant) f(x, y, s);
    avant = cle;
  }
}

/** Un relief : chaque colonne se remplit de sa crête jusqu'en bas. */
function relief(t: Toile, crete: (x: number) => number, couleur: string, bas = H, x0 = 0, x1 = W): void {
  for (let x = x0; x < x1; x++) for (let y = Math.round(crete(x)); y < bas; y++) t.poser(x, y, couleur);
}

/** Un liseré sur la crête d'un relief. */
function lisere(t: Toile, crete: (x: number) => number, couleur: string, x0 = 0, x1 = W, part = 1): void {
  for (let x = x0; x < x1; x++) fondre(t, x, Math.round(crete(x)), couleur, part);
}

/** Une nuée de boules : chaque ton se pose un peu plus loin vers la lumière, en boules plus petites. */
function nuee(t: Toile, boules: readonly (readonly [number, number, number])[], tons: readonly string[], dx: number, dy: number, retrait = 1.6, ecrase = 1): void {
  tons.forEach((ton, i) => {
    for (const [x, y, r] of boules) ellipse(t, x + dx * i, y + dy * i, r - retrait * i, (r - retrait * i) * ecrase, ton);
  });
}

/** Des étoiles au tirage fixe, plus rares dans le coin du logo. */
function etoiles(t: Toile, y1: number, pourMille: number, couleurs: readonly string[]): void {
  for (let y = 0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const g = grain(x * 3 + 1, y * 5 + 2);
      const calme = x < 48 && y < 26;
      if (g % 1000 < (calme ? pourMille / 3 : pourMille)) t.poser(x, y, pris(couleurs, calme ? 0 : g >>> 12));
    }
  }
}

/** Un faisceau qui s'élargit de sa source à sa pointe, fondu dans le ciel. */
function faisceau(t: Toile, x0: number, y0: number, x1: number, y1: number, l0: number, l1: number, couleur: string, force: number): void {
  const long = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / long;
  const uy = (y1 - y0) / long;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = (x - x0) * ux + (y - y0) * uy;
      if (s < 0 || s > long) continue;
      const d = Math.abs((x - x0) * uy - (y - y0) * ux);
      const l = l0 + ((l1 - l0) * s) / long;
      if (d > l) continue;
      const palier = 1 - Math.floor((s / long) * 4) / 5;
      fondre(t, x, y, couleur, force * palier * (d > l - 1 ? 0.5 : 1));
    }
  }
}

/** Des brins d'herbe sur une crête. */
function herbes(t: Toile, crete: (x: number) => number, couleurs: readonly string[], pourCent: number, penche = 0): void {
  for (let x = 0; x < W; x++) {
    const g = grain(x * 7, 91);
    if (g % 100 >= pourCent) continue;
    const y = Math.round(crete(x));
    const haut = 1 + ((g >>> 8) % 3);
    for (let i = 1; i <= haut; i++) t.poser(x + Math.round((penche * i) / 2), y - i, pris(couleurs, g >>> 14));
  }
}

/** Un mur de sacs de sable : des rangées décalées de sacs de 5 cases. */
function sacs(t: Toile, x: number, y: number, parRang: readonly number[], tons: { clair: string; fond: string; sombre: string }): void {
  parRang.forEach((n, rang) => {
    const y0 = y - rang * 3;
    const x0 = x + rang * 2 + (rang % 2);
    for (let i = 0; i < n; i++) {
      t.bloc(x0 + i * 5 + 1, y0 - 2, 3, 1, tons.clair);
      t.bloc(x0 + i * 5, y0 - 1, 5, 1, tons.fond);
      t.bloc(x0 + i * 5, y0, 5, 1, tons.sombre);
      t.poser(x0 + i * 5 + 4, y0 - 1, tons.sombre);
    }
  });
}

/** Un immeuble et ses fenêtres allumées au tirage. */
function immeuble(t: Toile, x: number, haut: number, largeur: number, base: number, mur: string, fenetres: readonly string[], pourCent: number): void {
  t.bloc(x, haut, largeur, base - haut, mur);
  for (let fy = haut + 2; fy < base - 1; fy += 3) {
    for (let fx = x + 1; fx < x + largeur - 1; fx += 2) {
      const g = grain(fx * 5 + 3, fy * 3 + 1);
      if (g % 100 < pourCent) t.poser(fx, fy, pris(fenetres, g >>> 9));
    }
  }
}

/* ───────────────────────────── 1. Le poste sur la crête (commun) ───────────────────────────── */

function posteSurLaCrete(): Decor {
  const t = new Toile("#6ea6d6");
  degrade(t, 0, 56, ["#5f9bd0", "#78aedb", "#94c1e2", "#b4d4e6", "#dbe4d6", "#f4e6c2"]);
  // Le soleil du matin, bas, à gauche sous le coin du logo.
  lueur(t, 22, 47, 16, 10, "#fff6d8", 0.5, 3);
  disque(t, 22, 47, 4, "#fffbe8");
  // Trois nuages plats.
  for (const [x, y, l] of [[60, 6, 16], [92, 13, 22], [50, 30, 12], [4, 34, 14]] as const) {
    t.bloc(x + 3, y - 1, l - 8, 1, "#ffffff");
    t.bloc(x, y, l, 2, "#f6fafc");
    t.bloc(x + 2, y + 2, l - 5, 1, "#d2e2ee");
  }
  relief(t, (x) => 47 + 4 * Math.sin(x / 9) + 2.5 * Math.sin(x / 3.7 + 1), "#a9c3d6");
  relief(t, (x) => 53 + 3.5 * Math.sin(x / 13 + 2) + 2 * Math.sin(x / 5), "#86a9b8");
  relief(t, (x) => 59 + 2.5 * Math.sin(x / 8 + 4) + 1.2 * Math.sin(x / 2.6), "#5f8f7c");
  // Au loin : un second poste sur sa colline, une rangée de sapins, la brume du matin au pied des monts.
  for (let x = 0; x < W; x++) if ((x + 1) % 3 !== 0) fondre(t, x, 57 + (x % 2), "#f4e6c2", 0.35);
  t.bloc(84, 47, 3, 6, "#86a9b8");
  t.bloc(83, 46, 5, 1, "#a9c3d6");
  ligne(t, 85, 45, 85, 42, "#6c8c9c");
  t.bloc(86, 42, 2, 1, "#4f7fd0");
  for (let x = 1; x < W; x += 5 + (grain(x, 23) % 4)) {
    const y = Math.round(59 + 2.5 * Math.sin(x / 8 + 4) + 1.2 * Math.sin(x / 2.6));
    const haut = 3 + (grain(x, 29) % 3);
    for (let i = 0; i < haut; i++) t.bloc(x - Math.floor(i / 2), y - haut + i, 1 + 2 * Math.floor(i / 2), 1, i === 0 ? "#5f8f7c" : "#467a66");
    t.poser(x - 1, y - 1, "#3a6a58");
  }
  // La crête : elle monte vers le poste, à droite.
  const crete = (x: number): number => 70 - Math.max(0, x - 74) * 0.24 + 0.8 * Math.sin(x / 6);
  relief(t, crete, "#5c9a50");
  relief(t, (x) => crete(x) + 5 + 1.5 * Math.sin(x / 4), "#4c8846");
  relief(t, (x) => crete(x) + 9 + Math.sin(x / 5 + 1), "#3e7640");
  lisere(t, crete, "#86c268");
  herbes(t, crete, ["#86c268", "#4c8846"], 22);
  // Le sentier de terre qui mène au poste.
  for (let x = 30; x < 96; x++) {
    const y = Math.round(crete(x) + 3 + 1.2 * Math.sin(x / 10));
    t.bloc(x, y, 1, 2, "#b79a68");
    if (grain(x, 3) % 4 === 0) t.poser(x, y, "#cdb07a");
  }
  // Le poste : une tour de béton, une dalle, une meurtrière, un mât et son fanion uni.
  const beton = { clair: "#d9d4c4", fond: "#bdb8a8", sombre: "#96917f", creux: "#2d3440" };
  t.bloc(90, 54, 30, 12, beton.fond);
  t.bloc(90, 54, 30, 1, beton.clair);
  t.bloc(112, 55, 8, 11, beton.sombre);
  for (let x = 90; x < 120; x += 6) t.bloc(x, 51, 3, 3, x >= 112 ? beton.sombre : beton.fond);
  t.bloc(98, 34, 14, 20, beton.fond);
  t.bloc(108, 34, 4, 20, beton.sombre);
  t.bloc(98, 34, 1, 20, beton.clair);
  t.bloc(95, 31, 20, 3, beton.clair);
  t.bloc(95, 33, 20, 1, beton.sombre);
  t.bloc(100, 39, 9, 2, beton.creux);
  t.bloc(100, 46, 2, 3, beton.creux);
  t.bloc(102, 58, 5, 8, beton.creux);
  t.bloc(92, 58, 6, 1, beton.creux);
  ligne(t, 111, 30, 111, 16, "#4a4e58");
  t.poser(111, 15, "#e0483a");
  ligne(t, 98, 30, 98, 12, "#5a4634");
  t.grille(99, 12, ["bbbbbbbb", "bBBBBBb.", "bbbbbb..", "bbbb...."], { b: "#2f5fb0", B: "#4f7fd0" });
  const sable = { clair: "#e2cf9c", fond: "#c8b27c", sombre: "#a08a5c" };
  sacs(t, 84, 67, [7, 6], sable);
  // À gauche : des sacs, des piquets et leurs fils.
  sacs(t, 3, 70, [5, 4, 2], sable);
  for (let x = 26; x <= 42; x += 8) {
    t.bloc(x, 62, 1, 8, "#6a5238");
    t.poser(x, 62, "#8a6c48");
  }
  for (let x = 23; x < 44; x++) {
    t.poser(x, 64 + (x % 8 === 2 ? 0 : x % 4 === 2 ? 1 : 0), "#5a5a62");
    if (x % 2 === 0) t.poser(x, 67, "#5a5a62");
  }
  // L'ombre de la tour sur l'herbe, une fenêtre éclairée par le matin, des fleurs, des oiseaux.
  for (let i = 0; i < 5; i++) t.bloc(118 - i, 66 + i, 6 - i, 1, "#4c8846");
  t.bloc(99, 35, 1, 4, "#f4efdc");
  t.bloc(91, 55, 1, 10, "#d9d4c4");
  for (let x = 2; x < W; x++) {
    const g = grain(x * 9 + 1, 57);
    if (g % 100 < 9 && (x < 44 || x > 80)) t.poser(x, Math.round(crete(x)) + 2 + (g % 6), pris(["#fff6d8", "#f4d44c", "#ffffff"], g >>> 8));
  }
  for (const [x, y] of [[62, 17], [68, 14], [75, 18], [116, 24], [110, 27]] as const) t.grille(x, y, ["a.a", ".a."], { a: "#3c5e88" });
  return t.decor("#356a3a");
}

/* ───────────────────────────── 2. La ligne de front (commun) ───────────────────────────── */

function ligneDeFront(): Decor {
  const t = new Toile("#27405e");
  degrade(t, 0, 28, ["#34587f", "#4d789e", "#7a9fb8", "#adc4cc", "#e2dcc2"]);
  relief(t, (x) => 25.5 + 1.5 * Math.sin(x / 7) + Math.sin(x / 2.9), "#7d98ac", 28);
  // La plaine, vue de haut : notre territoire en bleu, celui d'en face en rouge, la frontière en biais.
  const frontiere = (y: number): number => 36 + (y - 27) * 1.55 + 3 * Math.sin(y / 2.6) + 1.5 * Math.sin(y * 1.7);
  const bleus = ["#3d6cb0", "#4878bc", "#35609e"] as const;
  const rouges = ["#b0483e", "#bc564a", "#9a3c36"] as const;
  for (let y = 28; y < 70; y++) {
    const f = frontiere(y);
    for (let x = 0; x < W; x++) {
      const g = grain(Math.floor((x + (y >> 2) * 3) / 7), Math.floor(y / 4));
      const ton = pris(x < f ? bleus : rouges, g % 5 === 0 ? 1 : g % 5 === 1 ? 2 : 0);
      t.poser(x, y, melanger(ton, "#e2dcc2", y < 30 ? 0.45 : y < 32 ? 0.3 : y < 35 ? 0.15 : 0));
    }
    t.poser(Math.round(f) - 1, y, "#213a66");
    t.poser(Math.round(f), y, "#f6eed0");
    t.poser(Math.round(f) + 1, y, "#6e2622");
  }
  const loin = (x: number, y: number): boolean => Math.abs(x - frontiere(y)) > 3;
  const cote = (x: number, y: number): 0 | 1 => (x < frontiere(y) ? 0 : 1);
  // Deux fleuves, clairs, qui descendent vers nous.
  for (let y = 29; y < 70; y++) {
    for (const [x, large] of [[Math.round(17 + 5 * Math.sin(y / 5) + (y - 28) * 0.2), y > 50 ? 2 : 1], [Math.round(111 + 4 * Math.sin(y / 4 + 2)), y > 54 ? 2 : 1]] as const) {
      if (!loin(x, y)) continue;
      t.bloc(x, y, large, 1, cote(x, y) ? "#e8a898" : "#9cc8f0");
      t.poser(x + large, y, cote(x, y) ? "#8a3430" : "#2c5290");
    }
  }
  // Des collines, éclairées de la gauche, et des bois en points sombres.
  for (const [x, y] of [[6, 34], [30, 37], [9, 50], [36, 62], [50, 55], [26, 46], [70, 32], [96, 34], [118, 44], [84, 46], [98, 58], [120, 66], [60, 36], [104, 49]] as const) {
    if (!loin(x, y) || !loin(x + 7, y + 3)) continue;
    const r = cote(x, y);
    t.grille(x, y, ["..cc...", ".cCmo..", "cCmmmo.", "Cmmmooo"], r ? { c: "#e08070", C: "#cc6658", m: "#a84238", o: "#7c2c28" } : { c: "#7ca8e8", C: "#5c8cd0", m: "#35609e", o: "#284a80" });
  }
  for (const [x, y] of [[20, 42], [42, 50], [4, 57], [16, 66], [58, 62], [80, 38], [92, 52], [106, 58], [114, 36], [72, 40]] as const) {
    for (let i = 0; i < 9; i++) {
      const g = grain(x + i * 3, y + i);
      const px = x + (g % 7);
      const py = y + ((g >>> 4) % 4);
      if (loin(px, py)) t.poser(px, py, cote(px, py) ? "#7c2c28" : "#284a80");
    }
  }
  // La lumière de la frontière : un halo chaud de chaque côté.
  for (let y = 28; y < 70; y++) {
    const f = Math.round(frontiere(y));
    for (let d = 2; d <= 5; d++) {
      fondre(t, f - d, y, "#fff0b0", 0.6 / d + (d === 2 ? 0.15 : 0));
      fondre(t, f + d, y, "#ffe0a0", 0.6 / d + (d === 2 ? 0.15 : 0));
    }
  }
  // Les colonnes : des points qui marchent vers la frontière, plus gros près de nous.
  for (const [y, taille] of [[37, 1], [44, 1], [51, 2], [59, 2], [66, 2]] as const) {
    const f = Math.round(frontiere(y));
    for (let i = 0; i < 9; i++) {
      const pas = taille + 2;
      t.bloc(f - 4 - i * pas, y, taille, taille, i === 0 ? "#ffffff" : "#bcd8ff");
      if (i < 7) t.bloc(f + 4 + i * pas, y - 3, taille, taille, i === 0 ? "#fff0e4" : "#ffc4b0");
    }
    // Le choc, là où deux colonnes se touchent.
    lueur(t, f, y - 1, 5, 4, "#fff6c8", 0.5, 2);
    for (const [dx, dy] of [[0, -1], [-1, -2], [1, -2], [0, -3], [-2, -1], [2, -3], [0, 1], [-3, -4], [3, 0], [0, -5]] as const) t.poser(f + dx, y + dy, Math.abs(dx) + Math.abs(dy + 1) < 2 ? "#ffffff" : "#ffe890");
  }
  // Des villes : de petits carrés clairs.
  for (const [x, y] of [[10, 40], [24, 56], [8, 63], [104, 40], [116, 54], [88, 33], [110, 64]] as const) {
    t.bloc(x, y, 3, 2, "#f4e6b4");
    t.bloc(x, y + 2, 3, 1, x < frontiere(y) ? "#28487e" : "#742a26");
    t.poser(x + 4, y + 1, "#f4e6b4");
    t.poser(x - 2, y, "#f4e6b4");
  }
  // Devant : la butte d'où l'on regarde, et le fanion du clan, uni.
  const butte = (x: number): number => 69.5 + 1.4 * Math.sin(x / 9 + 1) - (x < 30 ? (30 - x) * 0.12 : 0);
  relief(t, butte, "#2c3b30");
  relief(t, (x) => butte(x) + 5, "#222e28");
  lisere(t, butte, "#526a4c");
  herbes(t, butte, ["#526a4c", "#2c3b30"], 25);
  ligne(t, 14, 67, 14, 46, "#3a2c22");
  t.grille(15, 46, ["bbbbbbbbb", "bBBBBBBb.", "bBBBBBb..", "bbbbbb...", "bbbb....."], { b: "#2f5fb0", B: "#5c8cdc" });
  for (const [x, y, l] of [[100, 69, 6], [108, 70, 4], [30, 70, 5]] as const) {
    t.bloc(x, y - 1, l - 2, 1, "#6c7468");
    t.bloc(x - 1, y, l, 2, "#4a5248");
  }
  return t.decor("#18221c");
}

/* ───────────────────────────── 3. La ville sous l'alerte (peu commun) ───────────────────────────── */

function villeSousAlerte(): Decor {
  const t = new Toile("#0b1026");
  degrade(t, 0, 62, ["#0a0f26", "#0e1532", "#131c40", "#1a2550", "#24305e", "#30396a"]);
  etoiles(t, 40, 14, ["#5a6aa0", "#cdd8ff", "#8a98c8"]);
  // Des nuages bas, que les projecteurs accrochent.
  for (const [x, y, l] of [[50, 9, 30], [84, 4, 26], [96, 19, 24], [2, 28, 20]] as const) {
    t.bloc(x + 2, y, l - 6, 1, "#1c2550");
    t.bloc(x, y + 1, l, 2, "#222c5a");
    t.bloc(x + 4, y + 3, l - 9, 1, "#2c3768");
  }
  // Les projecteurs : des faisceaux qui se croisent dans le ciel, hors du coin du logo.
  faisceau(t, 36, 46, 60, -4, 0, 5, "#c4d4ff", 0.55);
  faisceau(t, 95, 30, 70, -4, 0, 5, "#c4d4ff", 0.55);
  faisceau(t, 110, 22, 121, -6, 0, 4, "#c4d4ff", 0.45);
  faisceau(t, 88, 50, 124, 6, 0, 5, "#c4d4ff", 0.4);
  // La ville lointaine.
  for (let x = 0; x < W; ) {
    const g = grain(x, 17);
    const l = 4 + (g % 4);
    immeuble(t, x, 44 + ((g >>> 4) % 10), l, 66, "#1c2450", ["#c8a85a", "#8a94c0"], 14);
    x += l + (g % 3 === 0 ? 1 : 0);
  }
  // Les immeubles proches, à gauche sous le logo et à droite.
  const proches: readonly (readonly [number, number, number])[] = [
    [2, 38, 9], [12, 30, 8], [21, 42, 7], [29, 34, 9],
    [86, 36, 8], [95, 22, 10], [106, 14, 9], [116, 30, 8],
  ];
  for (const [x, haut, l] of proches) {
    immeuble(t, x, haut, l, 68, "#0e1330", ["#ffd678", "#ffd678", "#ffe9b0", "#8fb4e8"], 38);
    t.bloc(x, haut, l, 1, "#2a3260");
    t.bloc(x + l - 1, haut + 1, 1, 68 - haut, "#0a0e26");
  }
  // Les sources des projecteurs, et les feux rouges des toits.
  for (const [x, y] of [[36, 46], [95, 30], [110, 22], [88, 50]] as const) {
    t.poser(x, y, "#ffffff");
    t.poser(x, y + 1, "#8c9cd8");
  }
  for (const [x, y] of [[16, 29], [110, 8], [99, 21]] as const) {
    ligne(t, x, y, x, y - 4, "#2a3260");
    lueur(t, x, y - 5, 3, 3, "#ff4a3a", 0.5, 2);
    t.poser(x, y - 5, "#ff6a50");
  }
  // Le toit-terrasse où il se tient : un parapet, des dalles, des caissons.
  t.bloc(0, 65, W, 3, "#262c4c");
  t.bloc(0, 65, W, 1, "#454e7c");
  t.bloc(0, 68, W, 12, "#1c2140");
  for (let x = 0; x < W; x += 12) t.bloc(x, 65, 1, 3, "#1a1f3c");
  t.bloc(0, 68, W, 1, "#13172e");
  for (let y = 70; y < H; y += 3) {
    const pas = 10 + (y - 70) * 2;
    for (let x = ((y * 5) % pas) - pas; x < W; x += pas) t.bloc(x, y, 1, 3, "#161a34");
    t.bloc(0, y + 2, W, 1, "#161a34");
  }
  t.bloc(0, 69, W, 1, "#2c3358");
  t.grille(96, 58, [
    "..cccccccccccccccc..",
    ".cCCCCCCCCCCCCCCCCc.",
    "cmmmmmmmmmmmmmmmmmmc",
    "cmggggmmmmmmggggmmsc",
    "cmggggmmmmmmggggmmsc",
    "cmggggmmrmmmggggmmsc",
    "cmmmmmmmmmmmmmmmmmsc",
    "cssssssssssssssssssc",
    ".c................c.",
  ], { c: "#12162e", C: "#525c8c", m: "#343c66", g: "#1c2244", s: "#262c50", r: "#ff5a44" });
  lueur(t, 104, 63, 4, 3, "#ff4a3a", 0.35, 2);
  t.grille(8, 56, [
    "...aa....",
    "...aa....",
    "..aaaa...",
    ".a.aa.a..",
    "...aa....",
    "...aa....",
    "...aa....",
    "...aa....",
    "..cccc...",
  ], { a: "#39426e", c: "#262c50" });
  return t.decor("#0d1024");
}

/* ───────────────────────────── 4. Le silo s'ouvre (peu commun) ───────────────────────────── */

function siloOuvert(): Decor {
  const t = new Toile("#141a3a");
  degrade(t, 0, 60, ["#121836", "#1a1f46", "#272650", "#3c2d58", "#5c365c", "#864658", "#b05e54"]);
  etoiles(t, 30, 16, ["#56609a", "#e0e4ff", "#9aa0d0"]);
  relief(t, (x) => 55 + 2 * Math.sin(x / 15) + (x > 40 && x < 62 ? -3 : 0) + (x > 4 && x < 20 ? -2 : 0), "#3a2848", 62);
  relief(t, (x) => 58.5 + 1.2 * Math.sin(x / 6 + 2), "#2a1e3a", 62);
  // La dalle de béton.
  t.bloc(0, 61, W, 19, "#444456");
  t.bloc(0, 61, W, 1, "#77778a");
  t.bloc(0, 62, W, 1, "#5a5a6e");
  t.bloc(0, 70, W, 10, "#3a3a4c");
  for (let x = 6; x < W; x += 19) ligne(t, x, 62, x - 5, 79, "#32323f");
  t.bloc(0, 69, W, 1, "#32323f");
  for (let x = 0; x < W; x++) {
    const jaune = Math.floor((x + 400) / 4) % 2 === 0;
    t.bloc(x, 75, 1, 3, jaune ? "#d8a62c" : "#1c1c26");
    if (jaune) t.poser(x, 75, "#f0c448");
  }
  // La fosse, sa lumière rouge, les deux trappes levées.
  const cx = 102;
  lueur(t, cx, 56, 36, 32, "#ff3a2a", 0.34, 5);
  ellipse(t, cx, 66, 14, 4, "#14080e");
  ellipse(t, cx, 66, 12.5, 3.2, "#7a1618");
  ellipse(t, cx, 66.5, 10, 2.2, "#e8402c");
  ellipse(t, cx, 67, 8, 1.3, "#ffb070");
  // Le missile qui sort : ogive, bague rouge, écusson uni, corps clair rougi par la fosse.
  for (let y = 15; y < 67; y++) {
    const demi = y < 18 ? 1 : y < 21 ? 2 : y < 25 ? 3 : y < 30 ? 4 : 5;
    for (let dx = -demi; dx <= demi; dx++) {
      let ton = dx === demi ? "#5a6280" : dx >= 2 ? "#8890a8" : dx < -2 ? "#f0f2f8" : "#c8ccda";
      if (y >= 33 && y <= 36) ton = dx >= 2 ? "#8a1c20" : dx < -2 ? "#f0604c" : "#d0342c";
      if (y === 48 || y === 49) ton = dx >= 2 ? "#4a5270" : "#7c84a0";
      if (y >= 40 && y <= 43 && dx >= -3 && dx <= -1) ton = "#2f5fb0";
      if (y > 50) ton = melanger(ton, "#ff4a34", Math.min(0.75, (y - 50) * 0.06));
      t.poser(cx + dx, y, ton);
    }
  }
  t.poser(cx, 14, "#f0f2f8");
  // La vapeur qui roule de chaque côté, rougie par la fosse.
  const vapeur = ["#5a3a52", "#8c5560", "#c08278", "#ecc0a6"] as const;
  nuee(t, [[cx - 19, 65, 5], [cx - 9, 66, 4], [cx - 24, 62, 4], [cx - 20, 57, 3], [cx - 23, 52, 2]], vapeur, -0.4, -0.8);
  nuee(t, [[cx + 9, 66, 4], [cx + 18, 66, 4], [cx + 8, 62, 3]], vapeur, 0.4, -0.8);
  // Les deux trappes levées : béton dehors, bandes de danger dedans, rougies par la fosse.
  for (let i = 0; i < 23; i++) {
    const recul = Math.round(i * 0.22);
    const bande = (i >> 1) % 2 === 0 ? "#f0c448" : "#2a2028";
    const gauche = [bande, "#6a6a7e", "#8c8ca0", "#b4b4c6"] as const;
    const droite = [melanger(bande, "#ff4a34", 0.3), "#4c4c5e", "#3c3c4c", "#2c2c3a"] as const;
    for (let e = 0; e < 4; e++) {
      t.poser(cx - 13 - recul - e, 65 - i, pris(gauche, e));
      t.poser(cx + 13 + recul + e, 65 - i, pris(droite, e));
    }
  }
  t.bloc(cx - 21, 42, 4, 1, "#d0d0e0");
  t.bloc(cx + 18, 42, 4, 1, "#6a6a7e");
  ligne(t, cx - 9, 66, cx - 15, 56, "#22222e");
  ligne(t, cx + 9, 66, cx + 15, 56, "#22222e");
  // Les gyrophares.
  for (const x of [66, 76]) {
    t.bloc(x, 56, 1, 6, "#2a2a36");
    lueur(t, x, 55, 4, 3, "#ffb030", 0.55, 2);
    t.bloc(x - 1, 55, 3, 1, "#ffd870");
  }
  // À gauche : le poste de tir, à demi enterré, et son pylône.
  t.grille(4, 49, [
    "......bbbbbbbbbbbbbbbbbb......",
    "....bbBBBBBBBBBBBBBBBBBBbb....",
    "..bbBBmmmmmmmmmmmmmmmmmmmsbb..",
    ".bBBmmmmmmmmmmmmmmmmmmmmmmssb.",
    "bBmmmmjjjjjmmmjjjjjmmmmmmmmssb",
    "bBmmmmjjjjjmmmjjjjjmmmmmmmmssb",
    "bmmmmmmmmmmmmmmmmmmmmmnnnmmssb",
    "bmmmmmmmmmmmmmmmmmmmmmnrnmmssb",
    "bmmmmmmmmmmmmmmmmmmmmmnnnmmssb",
    "bmmmmmmmmmmmmmmmmmmmmmnnnmmssb",
    "bmmmmmmmmmmmmmmmmmmmmmnnnmmssb",
    "bmmmmmmmmmmmmmmmmmmmmmnnnmmssb",
  ], { b: "#22222e", B: "#8c8c9e", m: "#5a5a6e", s: "#3e3e50", j: "#f0b040", n: "#1c1c26", r: "#ff4a3a" });
  lueur(t, 27, 56, 5, 4, "#ff4a3a", 0.4, 2);
  for (let y = 26; y < 61; y++) {
    const demi = y < 34 ? 1 : y < 48 ? 2 : 3;
    t.poser(38 - demi, y, "#2c2c3c");
    t.poser(38 + demi, y, "#2c2c3c");
    if (y % 4 === 0) t.bloc(38 - demi, y, demi * 2 + 1, 1, "#2c2c3c");
    else if (y % 4 === 2) t.poser(38, y, "#2c2c3c");
  }
  lueur(t, 38, 25, 4, 4, "#ff4a3a", 0.5, 2);
  t.poser(38, 25, "#ff7a60");
  return t.decor("#2a2a38");
}

/* ───────────────────────────── 5. Champignon au crépuscule (épique) ───────────────────────────── */

function champignonAuCrepuscule(): Decor {
  const t = new Toile("#2a2350");
  degrade(t, 0, 57, ["#272148", "#3a2a5c", "#57376c", "#7f4674", "#b3586a", "#de7a58", "#f4a65c"]);
  const cx = 101;
  lueur(t, cx, 54, 58, 44, "#ffb060", 0.3, 5);
  etoiles(t, 16, 8, ["#6a5a8c", "#d8c8f0"]);
  // De longs nuages, sombres dessus, embrasés dessous, du côté de l'éclair.
  for (const [x, y, l] of [[52, 12, 34], [96, 6, 30], [6, 31, 30], [70, 30, 18], [0, 44, 22], [108, 36, 20]] as const) {
    t.bloc(x + 3, y, l - 8, 1, "#4a3462");
    t.bloc(x, y + 1, l, 2, "#5e3c68");
    for (let i = 0; i < l - 3; i++) t.poser(x + 2 + i, y + 3, melanger("#c8605c", "#ffb468", Math.max(0, 1 - Math.abs(x + 2 + i - cx) / 50)));
  }
  // Les collines lointaines et la plaine d'eau qui renvoie la lueur.
  relief(t, (x) => 53 + 2.5 * Math.sin(x / 11 + 1) + 1.2 * Math.sin(x / 4), "#6c3c5c", 58);
  t.bloc(0, 57, W, 12, "#55305a");
  for (let y = 57; y < 68; y++) {
    const demi = 5 + (y - 57) * 0.5 + (y % 2) * 2;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - cx);
      if (d < demi && (y % 2 === 0 || d < demi - 3)) t.poser(x, y, d < demi / 2.5 ? "#ffd890" : "#f08a54");
      else if (d < demi + 14 && (x + y * 5) % 9 < 3 && y % 2 === 0) t.poser(x, y, "#a8505c");
      else if ((x * 3 + y * 7) % 11 === 0) t.poser(x, y, "#7a4062");
    }
  }
  // Le champignon : le pied, la jupe, la boule, la poussière du sol.
  for (let y = 26; y < 57; y++) {
    const demi = 3.5 + (y < 32 ? (32 - y) * 0.9 : 0) + (y > 49 ? (y - 49) * 0.9 : 0) + 0.6 * Math.sin(y / 1.7);
    for (let dx = -Math.round(demi); dx <= Math.round(demi); dx++) {
      const bord = Math.abs(dx) / (demi + 0.01);
      const chaud = y > 50 ? "#ffe6a0" : y > 42 ? "#ffc070" : y > 34 ? "#f09454" : "#d87050";
      t.poser(cx + dx, y, bord > 0.75 ? (dx < 0 ? "#7c4058" : "#a85050") : bord > 0.4 ? melanger(chaud, "#a85050", 0.45) : chaud);
    }
  }
  const boule = ["#553252", "#874458", "#c4644e", "#f0964e", "#ffc874"] as const;
  nuee(t, [[cx, 19, 12], [cx - 11, 22, 8], [cx + 11, 22, 8], [cx - 6, 14, 8], [cx + 6, 14, 8], [cx - 17, 24, 5], [cx + 17, 24, 5], [cx, 12, 8]], boule, 0, 1.3, 2);
  ellipse(t, cx, 27, 9, 1.6, "#ffe6a0");
  // Les bourrelets du haut, pris par le dernier soleil.
  for (const [x, y, r] of [[cx - 6, 9, 3], [cx + 5, 8, 3], [cx - 13, 17, 2], [cx + 13, 16, 2], [cx, 6, 2]] as const) {
    for (let a = 200; a <= 340; a += 12) fondre(t, Math.round(x + r * Math.cos((a * Math.PI) / 180)), Math.round(y + r * Math.sin((a * Math.PI) / 180)), "#d48a8a", 0.6);
  }
  ellipse(t, cx, 40, 9, 1.8, "#8a4658");
  ellipse(t, cx, 39.4, 8, 1.2, "#d87858");
  nuee(t, [[cx - 12, 56, 4], [cx - 6, 55, 5], [cx + 6, 55, 5], [cx + 12, 56, 4], [cx, 54, 5], [cx - 18, 57, 3], [cx + 18, 57, 3]], ["#7c4058", "#b4584e", "#e88a54", "#ffc070"], 0, -0.3, 1.4, 0.55);
  // Des oiseaux qui fuient.
  for (const [x, y] of [[58, 24], [64, 21], [70, 26], [40, 36], [34, 39]] as const) t.grille(x, y, ["a.a", ".a."], { a: "#2a1c38" });
  // Devant : la colline sombre, son liseré de feu, un mirador et sa clôture.
  const colline = (x: number): number => 69 + 1.6 * Math.sin(x / 10) + (x < 34 ? -(34 - x) * 0.1 : 0);
  relief(t, colline, "#241a30");
  relief(t, (x) => colline(x) + 6, "#1a1226");
  for (let x = 0; x < W; x++) fondre(t, x, Math.round(colline(x)), "#f08a54", x > 40 ? 0.75 : 0.4);
  herbes(t, colline, ["#3a2440", "#b0604c", "#241a30"], 30, -1);
  t.grille(9, 33, [
    "...rrrrrrrrrrrr...",
    "..rRRRRRRRRRRRRo..",
    ".rrrrrrrrrrrrrrro.",
    "..mmmmmmmmmmmmo...",
    "..mmjjmmmmjjmmo...",
    "..mmjjmmmmjjmmo...",
    "..mmmmmmmmmmmmo...",
    ".pppppppppppppppo.",
    "...p....xx....p...",
    "...p...x..x...p...",
    "...p..x....x..p...",
    "...p.x......x.p...",
    "...px........xp...",
    "...pppppppppppp...",
    "...px........xp...",
    "...p.x......x.p...",
    "...p..x....x..p...",
    "...p...x..x...p...",
    "...p....xx....p...",
    "...p...x..x...p...",
    "...p..x....x..p...",
    "...p.x......x.p...",
    "...px........xp...",
    "...pppppppppppp...",
    "...px........xp...",
    "...p.x......x.p...",
    "...p..x....x..p...",
    "...p...x..x...p...",
    "...p....xx....p...",
    "...p...x..x...p...",
    "...p..x....x..p...",
    "...p.x......x.p...",
    "...px........xp...",
    "...p..........p...",
    "...p..........p...",
    "...p..........p...",
  ], { r: "#1e1528", R: "#3c2840", m: "#241a30", j: "#ffc874", p: "#1e1528", x: "#2c1e36", o: "#f08a54" });
  for (let x = 30; x < 46; x += 5) {
    t.bloc(x, 63, 1, 7, "#1e1528");
    t.poser(x + 1, 63, "#f08a54");
  }
  ligne(t, 27, 65, 46, 65, "#1e1528");
  return t.decor("#120c1c");
}

/* ───────────────────────────── 6. Le barrage anti-aérien (épique) ───────────────────────────── */

/** Un éclat d'interception : une lueur, un cœur blanc, des branches et des étincelles. */
function eclat(t: Toile, cx: number, cy: number, r: number, cle: number): void {
  lueur(t, cx, cy, r * 2.8, r * 2.3, "#ff8a40", 0.42, 4);
  nuee(t, [[cx - r * 0.7, cy - r * 0.3, r * 0.7], [cx + r * 0.8, cy + r * 0.2, r * 0.6], [cx, cy - r * 0.8, r * 0.6], [cx + r * 0.2, cy + r * 0.8, r * 0.55]], ["#5a3c5c", "#8c5458"], 0, 0, 1);
  disque(t, cx, cy, r * 0.75, "#ff8a30");
  disque(t, cx, cy, r * 0.5, "#ffd060");
  disque(t, cx, cy, r * 0.28, "#fffbe0");
  for (let i = 0; i < 10; i++) {
    const g = grain(i * 13 + cle, cle * 7);
    const a = (i / 10) * Math.PI * 2 + (g % 10) / 16;
    const long = r * (1.1 + ((g >>> 5) % 10) / 9);
    for (let s = r * 0.5; s < long; s++) t.poser(Math.round(cx + Math.cos(a) * s), Math.round(cy + Math.sin(a) * s * 0.85), s > long * 0.7 ? "#ff9a40" : "#ffe08a");
    t.poser(Math.round(cx + Math.cos(a + 0.3) * (long + 2)), Math.round(cy + Math.sin(a + 0.3) * (long + 2) * 0.85), i % 2 ? "#ffd060" : "#ff7a30");
  }
}

function barrageAntiAerien(): Decor {
  const t = new Toile("#070b1e");
  degrade(t, 0, 60, ["#070b20", "#0a112e", "#0e183c", "#14214c", "#1c2c5a", "#283a66", "#35486e"]);
  etoiles(t, 44, 18, ["#4a5a90", "#dfe6ff", "#8c9cd0"]);
  for (const [x, y, l] of [[78, 10, 28], [48, 22, 22], [100, 28, 24], [4, 30, 26], [60, 40, 30]] as const) {
    t.bloc(x + 3, y, l - 7, 1, "#16204a");
    t.bloc(x, y + 1, l, 2, "#1c2854");
    t.bloc(x + 5, y + 3, l - 11, 1, "#26346a");
  }
  // Les lueurs d'incendie, loin derrière l'horizon.
  lueur(t, 24, 60, 22, 9, "#ff7a3a", 0.4, 4);
  lueur(t, 112, 60, 16, 7, "#ff7a3a", 0.3, 3);
  relief(t, (x) => 56 + 2.5 * Math.sin(x / 12 + 2) + 1.2 * Math.sin(x / 4.2), "#111a3c", 66);
  relief(t, (x) => 60 + 1.6 * Math.sin(x / 7), "#0c1430", 68);
  // Les missiles qui arrivent du haut à droite : une traînée, une tête chaude.
  const arrivee = (x0: number, y0: number, x1: number, y1: number, tete: boolean): void => {
    const n = Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      fondre(t, x, y, "#c8d0f0", 0.15 + (0.6 * i) / n);
      if (i > n * 0.5) fondre(t, x, y - 1, "#c8d0f0", 0.2);
    }
    if (tete) {
      lueur(t, x1, y1, 4, 4, "#ff8a40", 0.6, 2);
      t.bloc(x1 - 1, y1, 2, 1, "#fff4c0");
      t.poser(x1 + 1, y1 - 1, "#ffb050");
    }
  };
  arrivee(123, 0, 99, 14, false);
  arrivee(123, 16, 108, 29, true);
  arrivee(96, 0, 64, 6, false);
  arrivee(123, 34, 117, 39, false);
  // Les traînées des intercepteurs, du lanceur aux éclats : épaisses en bas, fines en haut.
  const trainee = (ax: number, ay: number, cxx: number, cyy: number, bx: number, by: number): void => {
    courbe([ax, ay], [cxx, cyy], [bx, by], (x, y, s) => {
      fondre(t, x, y, "#aab4d8", 0.75 - s * 0.3);
      if (s < 0.55) fondre(t, x + 1, y, "#7c88b4", 0.6 - s * 0.6);
      if (s < 0.25) fondre(t, x - 1, y + 1, "#7c88b4", 0.4);
    });
  };
  trainee(90, 46, 100, 28, 99, 15);
  trainee(89, 45, 84, 16, 65, 7);
  trainee(91, 46, 108, 44, 117, 39);
  trainee(88, 46, 80, 38, 82, 28);
  trainee(33, 57, 28, 46, 34, 35);
  // Des balles traçantes, tirées de la gauche.
  for (let i = 0; i < 12; i++) {
    const x = 38 + Math.round(i * 1.7);
    const y = 54 - i * 4;
    if (y < 26 && x < 47) continue;
    t.poser(x, y, "#fff0a0");
    t.poser(x, y + 1, "#ffb040");
  }
  eclat(t, 34, 34, 3, 4);
  eclat(t, 99, 14, 6, 1);
  eclat(t, 64, 6, 4.5, 2);
  eclat(t, 117, 39, 3.2, 3);
  // Un intercepteur encore en vol : sa flamme, sa pointe.
  lueur(t, 82, 28, 4, 4, "#ffd060", 0.55, 2);
  t.poser(82, 28, "#fffbe0");
  t.poser(82, 27, "#e8ecf8");
  t.poser(82, 26, "#e8ecf8");
  t.poser(82, 29, "#ffb040");
  // Le sol : une crête, son liseré froid.
  const crete = (x: number): number => 68.5 + 1.2 * Math.sin(x / 8 + 1) - Math.max(0, x - 84) * 0.1;
  relief(t, crete, "#172232");
  relief(t, (x) => crete(x) + 5 + Math.sin(x / 3), "#111a28");
  lisere(t, crete, "#3c5068");
  herbes(t, crete, ["#2a3c50", "#172232"], 24);
  // Le lanceur : un châssis, trois tubes levés, la flamme du départ.
  for (const [bx, i] of [[117, 2], [111, 1], [105, 0]] as const) {
    for (let k = 0; k < 14; k++) {
      const tons = i === 0 ? ["#9cb8c4", "#587480", "#3c525c", "#1c2a34"] : ["#587480", "#3c525c", "#2c3e48", "#141e28"];
      for (let e = 0; e < 4; e++) t.poser(bx - k + e, 61 - k, pris(tons, e));
    }
    t.bloc(bx - 14, 47, 3, 1, "#0c121c");
  }
  t.grille(90, 58, [
    "..............bbbbbbbbbbbbbbbb.",
    ".............bbBBBBBBBBBBBBBb..",
    "............bbbbbbbbbbbbbbbb...",
    "..cccccccccccccccccccccccccccc.",
    ".cCCCCCCCCCCCCCCCCCCCCCCCCCCCCc",
    ".cmmmjjmmmmmmmmmmmmmmmmmmmmmmmc",
    ".cmmmjjmmmmmmmsssssmmmmmmmmmmmc",
    "ccssssssssssssssssssssssssssscc",
    "..rrrr....rrrr.........rrrr....",
    "..rRRr....rRRr.........rRRr....",
    "..rrrr....rrrr.........rrrr....",
  ], { b: "#22303c", B: "#587480", c: "#0c121c", C: "#6c8894", m: "#30444e", s: "#1e2c36", j: "#ffd678", r: "#0a0e16", R: "#3a4a58" });
  lueur(t, 90, 46, 9, 8, "#ffb040", 0.6, 3);
  t.grille(87, 43, ["..y..", ".yWy.", "yWWWy", ".yWyo", "..yoo"], { y: "#ffd060", W: "#fffbe0", o: "#ff8a30" });
  // À gauche : le radar qui tourne, et un second lanceur, plus loin.
  t.grille(10, 40, [
    "..........dd....",
    "........ddDd....",
    "......ddDDd.....",
    "....ddDDDd..a...",
    "...dDDDDd..a....",
    "..dDDDDDd.a.....",
    "..dDDDDDda......",
    "..dDDDDDd.......",
    "...dDDDDDd......",
    "....ddDDDDd.....",
    "......ddDDDd....",
    "........pp.dd...",
    "........pp......",
    "........pp......",
    "........pp......",
    "........pp......",
    ".......pppp.....",
    "......pp..pp....",
    ".....pp....pp...",
    "....pp......pp..",
    "...pp...pp...pp.",
    "..pp....pp....pp",
    ".pp.....pp.....p",
    "ccccccccccccccc.",
    "cssssssssssssss.",
    "cssssssssssssss.",
    "cssssssssssssss.",
    "cssssssssssssss.",
  ], { d: "#1a2836", D: "#4c6478", a: "#8ca8bc", p: "#1a2836", c: "#3c5068", s: "#162030" });
  t.poser(21, 43, "#ff5a44");
  lueur(t, 21, 43, 3, 3, "#ff4a3a", 0.5, 2);
  t.grille(30, 58, [
    "..tT..tT....",
    ".tT..tT.....",
    "tT..tT......",
    ".bbbbbbbb...",
    "cccccccccccc",
    "cmmmmmmmmmmc",
    ".r..r...r...",
  ], { t: "#1c2a3a", T: "#3c5068", b: "#141e2c", c: "#0e1622", m: "#1c2a3a", r: "#0a0e16" });
  return t.decor("#0a101a");
}

/* ───────────────────────────── 7. La salve se sépare (mystique) ───────────────────────────── */

function salveSeSepare(): Decor {
  const t = new Toile("#080a24");
  degrade(t, 0, 52, ["#07081e", "#0b0d2e", "#11123e", "#1a1850", "#262060", "#34286e", "#46347c"]);
  etoiles(t, 50, 26, ["#4a4c8c", "#ffffff", "#9aa0e8", "#7ce0ff"]);
  // Des voiles de lumière, comme une aurore née de la séparation.
  for (let x = 48; x < W; x++) {
    const onde = Math.sin(x / 6.5) + 0.6 * Math.sin(x / 2.3 + 1);
    const haut = Math.round(20 + 5 * onde);
    const long = 12 + Math.round(4 * Math.sin(x / 3.1));
    if ((x + Math.round(onde * 2)) % 3 === 0) continue;
    for (let i = 0; i < long; i++) fondre(t, x, haut + i, x % 5 < 2 ? "#44e0c8" : "#8a6cff", 0.26 * (1 - i / long));
  }
  // La lueur de l'horizon, et la mer de nuages, loin en dessous.
  lueur(t, 62, 54, 80, 10, "#6ad8ff", 0.35, 4);
  const S = [95, 8] as const;
  const cibles = [28, 41, 54, 66, 78, 89, 100, 110, 119] as const;
  const mer = ["#191746", "#24215c", "#322e76", "#454094"] as const;
  for (let rang = 0; rang < 3; rang++) {
    const boules: [number, number, number][] = [];
    for (let x = -6 + rang * 5; x < W + 8; x += 14) {
      const g = grain(x, rang * 9 + 5);
      boules.push([x + (g % 5), 54 + rang * 5 + ((g >>> 4) % 2), 10 + ((g >>> 7) % 4)]);
    }
    nuee(t, boules, mer, 0.5, -0.6, 2.2, 0.45);
  }
  // Là où les têtes vont tomber, les nuages s'allument déjà.
  cibles.forEach((x, i) => lueur(t, x, 53 + (i % 3) * 2, 7, 3, i % 2 ? "#ff7ae0" : "#7ce8ff", 0.45, 3));
  // La traînée du missile porteur, montée de l'horizon.
  courbe([116, 50], [118, 22], S, (x, y, s) => {
    t.poser(x, y, melanger("#6a5cc8", "#ffe8a0", s));
    fondre(t, x + 1, y, "#ffb060", 0.2 + s * 0.3);
  });
  // Les neuf têtes : des arcs qui s'ouvrent en éventail, de la lumière au bout.
  cibles.forEach((cible, i) => {
    const fin = [cible, 50 + (i % 3) * 2] as const;
    const controle = [S[0] + (cible - S[0]) * 0.78, S[1] + 3 + Math.abs(cible - S[0]) * 0.03] as const;
    const arret = 0.8 + ((i * 7) % 5) * 0.035;
    const teinte = i % 2 ? "#ff6ad5" : "#5ce0ff";
    let tx: number = S[0];
    let ty: number = S[1];
    courbe(S, controle, fin, (x, y, s) => {
      if (s > arret) return;
      const part = s / arret;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) fondre(t, x + dx, y + dy, teinte, 0.1 + 0.22 * part);
      tx = x;
      ty = y;
    });
    courbe(S, controle, fin, (x, y, s) => {
      if (s > arret) return;
      const part = s / arret;
      t.poser(x, y, part > 0.85 ? "#ffffff" : melanger("#b9a8ff", teinte, part));
    });
    lueur(t, tx, ty, 5, 5, teinte, 0.6, 3);
    t.bloc(tx - (cible < S[0] ? 0 : 1), ty, 2, 2, "#ffffff");
    t.poser(tx, ty + 2, "#ffffff");
  });
  // L'éclair de la séparation : un cœur blanc, une croix, des éclats de coiffe.
  lueur(t, S[0], S[1], 15, 12, "#b9d8ff", 0.6, 5);
  for (let i = 1; i <= 8; i++) {
    const ton = i < 4 ? "#ffffff" : i < 6 ? "#c8e8ff" : "#7ca8ff";
    t.poser(S[0] + i, S[1], ton);
    t.poser(S[0] - i, S[1], ton);
    if (i <= 6) {
      t.poser(S[0], S[1] - i, ton);
      t.poser(S[0], S[1] + i, ton);
    }
    if (i <= 3) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) t.poser(S[0] + dx * i, S[1] + dy * i, "#c8e8ff");
  }
  disque(t, S[0], S[1], 2.3, "#ffffff");
  for (const [dx, dy] of [[-9, -4], [7, -5], [11, 4], [-6, 5], [13, -2]] as const) t.poser(S[0] + dx, S[1] + dy, "#ffe8a0");
  // Des poussières de lumière.
  for (let y = 12; y < 50; y++) {
    for (let x = 48; x < W; x++) {
      const g = grain(x * 5 + 2, y * 3 + 9);
      if (g % 140 === 0) t.poser(x, y, pris(["#7ce8ff", "#ff9ae8", "#ffffff"], g >>> 9));
    }
  }
  // Le promontoire de roche où il se tient, ourlé de lumière ; à gauche, une aiguille et sa balise.
  const roc = (x: number): number => 69 + 1.3 * Math.sin(x / 7 + 2) + (x > 104 ? (x - 104) * 0.5 : 0) + (x < 8 ? (8 - x) * 0.3 : 0);
  relief(t, roc, "#1a1438");
  relief(t, (x) => roc(x) + 4 + 1.5 * Math.sin(x / 2.7), "#120e2a");
  lisere(t, roc, "#7ce0ff", 0, W, 0.75);
  for (let x = 0; x < W; x++) {
    const g = grain(x, 77);
    if (g % 5 === 0) fondre(t, x, Math.round(roc(x)) + 1, "#8a6cff", 0.5);
    if (g % 9 === 0) t.bloc(x, Math.round(roc(x)) + 3 + (g % 3), 2, 1, "#2a2254");
  }
  // À gauche : des orgues de roche, leurs faces tournées vers la salve prises par sa lumière, et une balise.
  for (const [x0, large, haut] of [[4, 5, 58], [9, 5, 50], [27, 5, 55], [32, 4, 61], [21, 6, 45], [14, 7, 37]] as const) {
    for (let x = x0; x < x0 + large; x++) {
      const debut = haut + (x === x0 ? 1 : 0);
      for (let y = debut; y < roc(x) + 1; y++) {
        const fissure = grain(x0, y) % 11 === 0 && x > x0;
        const face = x >= x0 + large - 2;
        t.poser(x, y, fissure ? "#0c0920" : face ? (y < haut + 14 ? "#4a4496" : y < haut + 24 ? "#383278" : "#2a2560") : x === x0 ? "#0e0a24" : "#1c1844");
      }
      t.poser(x, debut, x >= x0 + large - 2 ? "#aef0ff" : "#5c58b0");
    }
    for (let y = haut + 1; y < haut + 12; y++) if (y % 3 !== 0) fondre(t, x0 + large - 1, y, "#7ce0ff", 0.7);
  }
  ligne(t, 17, 36, 17, 30, "#3c3478");
  lueur(t, 17, 29, 5, 5, "#7ce8ff", 0.6, 3);
  t.bloc(17, 28, 1, 2, "#ffffff");
  return t.decor("#0a0820");
}

/* ───────────────────────────── 8. L'aube de la bombe H (légendaire) ───────────────────────────── */

function aubeDeLaBombeH(): Decor {
  const t = new Toile("#1e1a3e");
  const cx = 88;
  const sol = 56;
  // Le ciel : des anneaux de lumière autour de l'éclair, du blanc au bleu nuit.
  const anneaux: readonly (readonly [number, string])[] = [
    [11, "#fff6d0"], [19, "#ffd874"], [28, "#f8a24c"], [38, "#dc6a40"], [49, "#a8424a"], [62, "#6c2e56"], [78, "#40265a"], [999, "#231c44"],
  ];
  for (let y = 0; y < sol; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, (y - 50) * 1.25) + ((x + y) % 2 === 0 ? 1.2 : -1.2);
      t.poser(x, y, (anneaux.find(([limite]) => d < limite) ?? pris(anneaux, 7))[1]);
    }
  }
  etoiles(t, 22, 10, ["#5a4a80", "#c8b8e8"]);
  // Des nuages d'altitude, balayés par le souffle : sombres, ourlés de feu du côté de l'éclair.
  for (const [x, y, l] of [[4, 27, 22], [24, 35, 20], [112, 30, 12], [104, 42, 20]] as const) {
    const versLaDroite = x < cx;
    t.bloc(x + 2, y, l - 5, 1, "#4a2850");
    t.bloc(x, y + 1, l, 2, "#5c3058");
    t.bloc(x + 3, y + 3, l - 6, 1, "#ff9a58");
    t.bloc(versLaDroite ? x + l : x - 2, y + 1, 2, 2, "#ffc878");
    for (let i = 0; i < 5; i++) t.poser(versLaDroite ? x - 2 - i * 2 : x + l + 1 + i * 2, y + 1 + (i % 2), "#5c3058");
  }
  // L'anneau de souffle dans le ciel : un arc pâle, tramé.
  for (let a = 150; a <= 392; a += 1) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(cx + 47 * Math.cos(rad));
    const y = Math.round(50 + 37 * Math.sin(rad));
    if (y < sol && (x + y) % 2 === 0 && !(x < 47 && y < 25)) {
      fondre(t, x, y, "#ffe8d0", 0.6);
      fondre(t, x, y + 1, "#ffe8d0", 0.25);
    }
  }
  // Le pied : une colonne de feu qui se tord, blanche au cœur.
  for (let y = 22; y < sol + 1; y++) {
    const demi = 6.5 + (y < 31 ? (31 - y) * 1.3 : 0) + (y > 47 ? (y - 47) * 1.5 : 0) + 0.9 * Math.sin(y / 1.6);
    const tors = Math.round(1.2 * Math.sin(y / 3.3));
    for (let dx = -Math.round(demi); dx <= Math.round(demi); dx++) {
      const bord = Math.abs(dx - tors * 0.5) / (demi + 0.01);
      const ton = bord > 0.86 ? "#7a3050" : bord > 0.66 ? "#c2503e" : bord > 0.42 ? "#f58c44" : bord > 0.2 ? "#ffcc6c" : "#fff4c4";
      t.poser(cx + dx + tors, y, ton);
    }
    if (y % 4 === 0) for (let dx = -Math.round(demi * 0.6); dx <= Math.round(demi * 0.6); dx += 2) fondre(t, cx + dx + tors, y, "#f58c44", 0.5);
  }
  // Le chapeau : une masse de boules, sombre en haut, brûlante par-dessous.
  const chapeau = ["#4c2548", "#863a4a", "#c8583c", "#f59648", "#ffd070", "#fff2b8"] as const;
  nuee(t, [
    [cx, 14, 15], [cx - 15, 18, 11], [cx + 15, 18, 11], [cx - 8, 9, 11], [cx + 8, 9, 11], [cx, 7, 10],
    [cx - 25, 21, 7], [cx + 25, 21, 7], [cx - 20, 12, 7], [cx + 20, 12, 7], [cx - 31, 23, 4], [cx + 31, 23, 4],
  ], chapeau, 0, 1.5, 2.1);
  // Le dessous du chapeau, où le feu roule : un tore clair.
  ellipse(t, cx, 27.5, 24, 2.6, "#f59648");
  ellipse(t, cx, 27, 19, 1.8, "#ffd070");
  ellipse(t, cx, 26.8, 12, 1.2, "#fff6d0");
  // Les bourrelets du haut : des arcs de lumière froide sur chaque boule, et des creux.
  for (const [x, y, r] of [[cx - 8, 5, 5], [cx + 8, 4, 5], [cx - 20, 10, 4], [cx + 20, 9, 4], [cx, 2, 4], [cx - 28, 19, 3], [cx + 28, 18, 3], [cx - 14, 13, 4], [cx + 13, 12, 4]] as const) {
    for (let a = 195; a <= 345; a += 8) {
      const rad = (a * Math.PI) / 180;
      fondre(t, Math.round(x + r * Math.cos(rad)), Math.round(y + r * Math.sin(rad)), "#c88aa8", a > 240 && a < 300 ? 0.75 : 0.4);
    }
  }
  // Le voile de glace au-dessus du chapeau, et deux anneaux de vapeur autour du pied.
  for (let x = cx - 22; x <= cx + 22; x++) {
    const y = Math.round(1.5 + ((x - cx) / 22) ** 2 * 5);
    if ((x + y) % 3 !== 0) fondre(t, x, y - 1 < 3 ? 3 : y, "#f0d8f0", 0.5);
  }
  for (const [y, rx] of [[37, 17], [44, 13]] as const) {
    for (let a = 0; a <= 180; a += 2) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + rx * Math.cos(rad));
      const yy = Math.round(y + 2.6 * Math.sin(rad));
      t.poser(x, yy, "#ffeede");
      fondre(t, x, yy + 1, "#e89a8a", 0.7);
    }
    t.bloc(cx - rx - 2, y, 2, 1, "#ffeede");
    t.bloc(cx + rx + 1, y, 2, 1, "#ffeede");
  }
  // L'horizon : une ville lointaine à gauche, des collines à droite, à contre-jour.
  relief(t, (x) => 53.5 + 1.5 * Math.sin(x / 9) + (x > 100 ? -(x - 100) * 0.12 : 0), "#4a2048", sol + 1, 96, W);
  relief(t, (x) => 54.5 + Math.sin(x / 6), "#4a2048", sol + 1, 0, 62);
  for (let x = 3; x < 52; ) {
    const g = grain(x, 41);
    const l = 2 + (g % 3);
    const haut = 47 + ((g >>> 3) % 6);
    t.bloc(x, haut, l, sol - haut, "#38183c");
    t.bloc(x + l - 1, haut, 1, sol - haut, "#8c3a50");
    if (g % 4 === 0) t.poser(x, haut + 2, "#ffb060");
    x += l + 1 + (g % 2);
  }
  // La nuée de base, qui court sur l'eau.
  nuee(t, [[cx - 26, 56, 4], [cx - 18, 55, 5], [cx - 9, 54, 6], [cx + 9, 54, 6], [cx + 18, 55, 5], [cx + 26, 56, 4], [cx, 53, 6], [cx - 33, 57, 3], [cx + 33, 57, 3]], ["#863a4a", "#c8583c", "#f58c44", "#ffd070"], 0, -0.3, 1.5, 0.5);
  // La mer : un miroir de feu sous l'éclair, sombre au loin, et l'anneau de souffle qui la ride.
  for (let y = sol + 1; y < 70; y++) {
    const demi = 12 + (y - sol) * 3.4;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - cx) / demi;
      const g = grain(x >> 1, y);
      let ton = y < 60 ? "#843a56" : y < 64 ? "#723252" : "#602a4e";
      if (d < 1) {
        const raie = (x + y * 2 + (g % 3)) % 6 < 3 + (1 - d) * 3;
        if (raie) ton = d < 0.25 ? "#fff6d0" : d < 0.5 ? "#ffd070" : d < 0.78 ? "#f58c44" : "#c8583c";
      } else if (g % 11 === 0) ton = y < 62 ? "#c8583c" : "#8c3a50";
      t.poser(x, y, ton);
    }
  }
  for (let a = 0; a <= 180; a += 1) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(cx + 62 * Math.cos(rad));
    const y = Math.round(58 + 8 * Math.sin(rad));
    t.poser(x, y, "#fff0d8");
    if (a > 40 && a < 140) t.poser(x, y + 1, "#ffd8a8");
    fondre(t, x, y - 1, "#fff0d8", 0.4);
  }
  // Deux navires à contre-jour, couchés par le souffle.
  t.grille(18, 58, ["....a.....", "...aaa.a..", "aaaaaaaaaa", ".aaaaaaaoo"], { a: "#2a1030", o: "#f58c44" });
  t.grille(108, 60, ["...a....", "..aaa.a.", "aaaaaaaa", "oaaaaaa."], { a: "#2a1030", o: "#f58c44" });
  // Les braises : des traits de feu emportés vers la gauche.
  for (let y = 26; y < 68; y++) {
    for (let x = 4; x < W - 3; x++) {
      const g = grain(x * 3 + 5, y * 7 + 1);
      if (g % 97 !== 0 || (x < 48 && y < 27) || Math.abs(x - cx) < 9) continue;
      const loin = Math.abs(x - cx);
      t.poser(x, y, loin < 30 ? "#fff6d0" : "#ffd070");
      const dir = x < cx ? -1 : 1;
      fondre(t, x + dir, y - (g % 2), "#f58c44", 0.8);
      if (g % 3 === 0) fondre(t, x + dir * 2, y - (g % 2), "#f58c44", 0.45);
    }
  }
  // Devant : la falaise à contre-jour, ourlée de feu ; l'herbe couchée par le souffle.
  const falaise = (x: number): number => 69.4 + 1.3 * Math.sin(x / 8 + 1) + 0.7 * Math.sin(x / 2.9) + (x < 12 ? -(12 - x) * 0.25 : 0);
  relief(t, falaise, "#1e1228");
  relief(t, (x) => falaise(x) + 4 + 1.4 * Math.sin(x / 3.3), "#160c20");
  relief(t, (x) => falaise(x) + 8 + Math.sin(x / 4.1), "#0e0818");
  for (let x = 0; x < W; x++) {
    const y = Math.round(falaise(x));
    t.poser(x, y, Math.abs(x - cx) < 40 ? "#ffb060" : "#e8744a");
    fondre(t, x, y + 1, "#c8583c", 0.55);
    const g = grain(x, 63);
    if (g % 7 === 0) t.bloc(x, y + 3 + (g % 4), 2 + (g % 2), 1, "#2c1a38");
  }
  for (let x = 2; x < W; x++) {
    const g = grain(x * 11, 5);
    if (g % 100 >= 34) continue;
    const y = Math.round(falaise(x));
    const dir = x < cx ? -1 : 1;
    const long = 2 + (g % 3);
    for (let i = 1; i <= long; i++) t.poser(x + dir * i, y - Math.ceil(i / 2), i === long ? "#ff9a58" : "#2c1a38");
  }
  // À gauche : le fanion du clan, uni, que le souffle tend et déchire, sur un rocher.
  t.grille(18, 63, [
    "......ooo.....",
    "....ooaaao....",
    "..ooaaaaaaoo..",
    ".oaaaaaaaaaao.",
    "oaaaaaaaaaaaao",
    "aaaaaaaaaaaaaa",
    "aaaaaaaaaaaaaa",
  ], { a: "#1e1228", o: "#ff9a58" });
  t.bloc(26, 34, 1, 30, "#1a0e24");
  t.bloc(27, 34, 1, 30, "#ff9a58");
  t.poser(26, 33, "#ffd070");
  t.grille(9, 35, [
    "......bbbbbbbbbbb",
    "...bbbbBBBBBBBccc",
    ".bbbBBBBBBbbbbbbc",
    "bbBBBBbbbbbbbBBBc",
    ".bbbbbbbbBBBBBBcc",
    "...bbBBBBBBbbbbbc",
    ".bbbbbbbbbbbbbbcc",
    "bbb..bbbbbbbbb...",
    "b......bbbb......",
  ], { b: "#3056a8", B: "#5c8ae0", c: "#b4ccff" });
  // À droite : les ruines d'un poste, un mur éventré, un mât tordu.
  t.grille(99, 55, [
    "............m.......",
    "...........mo.......",
    "...........m........",
    "..........mo........",
    "..........m.........",
    ".ooo......m.........",
    ".oaao.....m....ooo..",
    ".oaaaoo...m...oaaa..",
    "ooaaaaao..m.oooaaaa.",
    "oaaaaaaaoomooaaaaaa.",
    "oaaaajjjaaaaaaaaaaaa",
    "oaaaajjjaaaaaaaaaaaa",
    "oaaaaaaaaaaannnaaaaa",
    "oaaaaaaaaaaannnaaaaa",
    "oaaaaaaaaaaannnaaaaa",
  ], { a: "#1a0e24", o: "#ff9a58", m: "#2c1a38", j: "#f58c44", n: "#0e0818" });
  return t.decor("#0a0612");
}

/* ───────────────────────────── Le lot ───────────────────────────── */

export const LOT_A: readonly BanniereDuLot[] = [
  {
    id: "poste-sur-la-crete",
    nom: "Le poste sur la crête",
    rarete: "commun",
    famille: "front",
    description: "Un poste de défense en béton sur une crête verte, des sacs de sable et un fanion bleu, au soleil du matin.",
    dessiner: posteSurLaCrete,
  },
  {
    id: "ligne-de-front",
    nom: "La ligne de front",
    rarete: "commun",
    famille: "front",
    description: "Une plaine vue de haut, bleue d'un côté, rouge de l'autre, où des colonnes de points marchent vers la frontière.",
    dessiner: ligneDeFront,
  },
  {
    id: "ville-sous-alerte",
    nom: "La ville sous l'alerte",
    rarete: "peu-commun",
    famille: "front",
    description: "Une ville la nuit depuis un toit, fenêtres allumées, feux rouges et projecteurs qui se croisent dans le ciel.",
    dessiner: villeSousAlerte,
  },
  {
    id: "silo-ouvert",
    nom: "Le silo s'ouvre",
    rarete: "peu-commun",
    famille: "front",
    description: "Un silo aux trappes levées dans une lumière rouge : un missile en sort, entre la vapeur et les gyrophares.",
    dessiner: siloOuvert,
  },
  {
    id: "champignon-au-crepuscule",
    nom: "Champignon au crépuscule",
    rarete: "epique",
    famille: "front",
    description: "Un champignon atomique monte au loin dans un ciel de crépuscule, au-dessus de l'eau, derrière un mirador.",
    dessiner: champignonAuCrepuscule,
  },
  {
    id: "barrage-anti-aerien",
    nom: "Le barrage anti-aérien",
    rarete: "epique",
    famille: "front",
    description: "La nuit, un lanceur et son radar interceptent des missiles : des éclats de feu et des traînées plein le ciel.",
    dessiner: barrageAntiAerien,
  },
  {
    id: "salve-se-separe",
    nom: "La salve se sépare",
    rarete: "mystique",
    famille: "front",
    description: "Très haut dans la nuit, un missile se sépare en neuf têtes : des arcs roses et bleus tombent vers une mer de nuages.",
    dessiner: salveSeSepare,
  },
  {
    id: "aube-de-la-bombe-h",
    nom: "L'aube de la bombe H",
    rarete: "legendaire",
    famille: "front",
    description: "Une bombe H embrase le ciel : champignon géant, anneau de souffle sur la mer, braises, falaise à contre-jour.",
    dessiner: aubeDeLaBombeH,
  },
];
