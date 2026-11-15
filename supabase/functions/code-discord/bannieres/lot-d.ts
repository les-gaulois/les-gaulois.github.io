/**
 * Bannières, lot D : voir `commun.ts`. Dessins originaux de Claude Fable 5.2 pour le clan [GAL], 15 novembre 2026.
 *
 * La famille « Ciel, saisons et fêtes » : huit fonds pour l'image de /gaulois, du plus simple au plus fouillé — une forêt
 * d'automne et une plage au couchant (communes), des cerisiers en fleurs et une nuit de neige (peu communes), la nuit des
 * citrouilles et les feux du nouvel an (épiques), une aurore sur un lac gelé (mystique), une éclipse totale (légendaire).
 * Chaque dessin garde le coin du logo calme, pose son sujet à droite et dans le ciel, et donne un sol au Gaulois.
 * Rien n'y est emprunté à une œuvre existante ; rien n'y dépend de l'heure ni du hasard.
 */
import { HAUTEUR, LARGEUR, Toile, grain, melanger, type BanniereDuLot, type Decor } from "./commun.ts";

// ───────────────────────────────────────────── Les outils du lot ─────────────────────────────────────────────

type Rampe = readonly string[];
type Terme = readonly [ampleur: number, periode: number, phase: number];

const borne = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const ton = (rampe: Rampe, i: number): string => rampe[Math.max(0, Math.min(rampe.length - 1, Math.floor(i)))] ?? "#000000";
/** Une somme de vagues : le profil d'une colline, d'un rivage, d'un voile. */
const onde = (x: number, ...termes: readonly Terme[]): number => termes.reduce((s, [a, p, d]) => s + a * Math.sin(x / p + d), 0);
/** Une dent de scie adoucie, de 0 à 1 : le profil d'une crête de montagne. */
const dent = (v: number): number => Math.abs((((v % 1) + 1) % 1) - 0.5) * 2;
const cretes = (x: number, s: number): number => 0.6 * dent(x / 41 + s) + 0.28 * dent(x / 17 + s * 3.1) + 0.12 * dent(x / 7 + s * 7.3);

/** Un tirage fixe de 0 à 1 par case et par série `s` : le même à chaque image. */
function alea(x: number, y: number, s = 0): number {
  let n = grain(Math.round(x) + s * 131, Math.round(y) + s * 71);
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/** Le coin du logo et des insignes, avec une marge : on y dessine moins, et moins fort. */
const auCalme = (x: number, y: number): boolean => x < 50 && y < 27;
/** La même chose en douceur : 0 dans le coin, 1 loin de lui, sans bord net. */
const horsDuCalme = (x: number, y: number): number => borne(Math.max((x - 40) / 18, (y - 19) / 12));

/** Un dégradé en bandes de la rangée y0 à y1, une rangée tramée entre deux bandes. */
function bandes(t: Toile, rampe: Rampe, y0: number, y1: number, courbe = 1): void {
  const n = rampe.length;
  const rang = (y: number): number => Math.min(n - 1, Math.floor(borne((y - y0) / (y1 - y0 + 1)) ** courbe * n));
  for (let y = y0; y <= y1; y++) {
    const i = rang(y);
    const j = y < y1 ? rang(y + 1) : i;
    for (let x = 0; x < LARGEUR; x++) t.poser(x, y, j !== i && (x + y) % 2 === 0 ? ton(rampe, j) : ton(rampe, i));
  }
}

function ovale(t: Toile, cx: number, cy: number, rx: number, ry: number, couleur: string): void {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) t.poser(x, y, couleur);
    }
  }
}
const disque = (t: Toile, cx: number, cy: number, r: number, couleur: string): void => ovale(t, cx, cy, r, r, couleur);

function trait(t: Toile, x0: number, y0: number, x1: number, y1: number, couleur: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) t.poser(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), couleur);
}

/** Une branche : un trait dont l'épaisseur passe de e0 à e1 ; `clair` éclaire son bord gauche. */
function branche(t: Toile, x0: number, y0: number, x1: number, y1: number, e0: number, e1: number, couleur: string, clair?: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const e = Math.max(1, Math.round(e0 + (e1 - e0) * f));
    const x = Math.round(x0 + (x1 - x0) * f - e / 2);
    const y = Math.round(y0 + (y1 - y0) * f);
    for (let k = 0; k < e; k++) t.poser(x + k, y, clair && k === 0 && e >= 3 ? clair : couleur);
  }
}

/** Voile une case : la mêle à une couleur. */
function voile(t: Toile, x: number, y: number, couleur: string, part: number): void {
  const c = t.lire(x, y);
  if (c && part > 0) t.poser(x, y, melanger(c, couleur, part));
}

/** Une lueur en paliers autour d'un point : plus forte au centre. */
function lueur(t: Toile, cx: number, cy: number, rx: number, ry: number, couleur: string, force: number, paliers = 4): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      if (d < 1) voile(t, x, y, couleur, (force * Math.ceil((1 - d) * paliers)) / paliers);
    }
  }
}

/** Un relief plein : de la ligne `haut(x)` jusqu'en bas de la toile. `prof` : la profondeur sous la ligne. */
function relief(t: Toile, haut: (x: number) => number, couleur: string | ((x: number, y: number, prof: number) => string), bas = HAUTEUR - 1): void {
  for (let x = 0; x < LARGEUR; x++) {
    const y0 = Math.round(haut(x));
    for (let y = Math.max(0, y0); y <= bas; y++) t.poser(x, y, typeof couleur === "string" ? couleur : couleur(x, y, y - y0));
  }
}

/** Des étoiles, de la rangée 0 à `bas` : rares et pâles dans le coin du logo. */
function etoiles(t: Toile, bas: number, densite: number, tons: Rampe, s: number): void {
  for (let y = 0; y <= bas; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const calme = auCalme(x, y);
      if (alea(x, y, s) < densite * (calme ? 0.3 : 1)) t.poser(x, y, ton(tons, calme ? 0 : alea(x, y, s + 1) * tons.length));
    }
  }
}

/** Une étoile en croix. */
function eclat(t: Toile, x: number, y: number, coeur: string, bras: string, longueur = 1): void {
  for (let k = 1; k <= longueur; k++) {
    t.poser(x - k, y, bras);
    t.poser(x + k, y, bras);
    t.poser(x, y - k, bras);
    t.poser(x, y + k, bras);
  }
  t.poser(x, y, coeur);
}

interface TonsDeSapin {
  sombre: string;
  fond: string;
  clair: string;
  tronc: string;
  neige?: string;
  neigeOmbre?: string;
}
/** Un sapin en étages, éclairé de la gauche ; renvoie la demi-largeur de chaque rangée, depuis la cime. */
function sapin(t: Toile, x: number, pied: number, h: number, l: number, tons: TonsDeSapin, etages = Math.max(2, Math.round(h / 8))): number[] {
  const tronc = Math.max(1, Math.round(h / 10));
  const largeurTronc = Math.max(1, Math.round(l / 9));
  t.bloc(x - Math.floor(largeurTronc / 2), pied - tronc + 1, largeurTronc, tronc, tons.tronc);
  const hh = h - tronc;
  const pas = hh / etages;
  const demis: number[] = [];
  for (let dy = 0; dy < hh; dy++) {
    const f = (dy + 1) / hh;
    const dans = (dy % pas) / pas;
    const demi = Math.round((l / 2) * (0.5 * f + 0.5 * dans * (0.3 + 0.7 * f)));
    demis.push(demi);
    const y = pied - h + 1 + dy;
    const dessous = ((dy + 1) % pas) / pas < dans;
    for (let dx = -demi; dx <= demi; dx++) {
      let c = dx <= -demi * 0.3 ? tons.clair : dx > demi * 0.35 ? tons.sombre : tons.fond;
      if (dessous && demi > 1) c = tons.sombre;
      if (tons.neige && dans < 0.42 && demi > 0 && !dessous) c = dx > demi * 0.3 ? (tons.neigeOmbre ?? tons.neige) : tons.neige;
      t.poser(x + dx, y, c);
    }
  }
  return demis;
}

type Lobe = readonly [x: number, y: number, rx: number, ry: number];
interface TonsDeFeuillage {
  sombre: string;
  fond: string;
  clair: string;
  eclat?: string;
}
/** Un feuillage en lobes, éclairé d'en haut à gauche : l'ombre d'abord, puis la masse, puis la lumière et quelques touches. */
function feuillage(t: Toile, lobes: readonly Lobe[], tons: TonsDeFeuillage, s: number): void {
  for (const [x, y, rx, ry] of lobes) ovale(t, x + 1, y + 1, rx, ry, tons.sombre);
  for (const [x, y, rx, ry] of lobes) ovale(t, x, y - 0.5, rx - 0.6, ry - 0.8, tons.fond);
  for (const [x, y, rx, ry] of lobes) ovale(t, x - rx * 0.28, y - ry * 0.38, rx * 0.5, ry * 0.42, tons.clair);
  lobes.forEach(([x, y, rx, ry], k) => {
    const n = Math.round(rx * ry * 0.16);
    for (let i = 0; i < n; i++) {
      const px = Math.round(x + (alea(i, k, s) * 2 - 1) * rx * 0.85);
      const py = Math.round(y + (alea(i, k, s + 1) * 2 - 1) * ry * 0.85);
      const ici = t.lire(px, py);
      if (ici === tons.fond && t.lire(px + 1, py) === tons.fond) {
        const haut = py < y;
        t.poser(px, py, haut ? tons.clair : tons.sombre);
        t.poser(px + 1, py, haut ? tons.clair : tons.sombre);
      } else if (ici === tons.clair && tons.eclat && alea(i, k, s + 2) < 0.5) t.poser(px, py, tons.eclat);
    }
  });
}

interface TonsDeHutte {
  mur: string;
  murOmbre: string;
  toit: string;
  toitClair: string;
  toitOmbre: string;
  porte: string;
  fenetre?: string;
  neige?: string;
  neigeOmbre?: string;
}
/** Une hutte ronde au toit de chaume : `x` son bord gauche, `pied` sa rangée du bas, `l` sa largeur. */
function hutte(t: Toile, x: number, pied: number, l: number, tons: TonsDeHutte): void {
  const hm = Math.max(2, Math.round(l * 0.3));
  const ht = Math.max(3, Math.round(l * 0.62));
  const cx = x + (l - 1) / 2;
  t.bloc(x, pied - hm + 1, l, hm, tons.mur);
  t.bloc(x + Math.round(l * 0.62), pied - hm + 1, l - Math.round(l * 0.62), hm, tons.murOmbre);
  const lp = Math.max(1, Math.round(l * 0.18));
  t.bloc(Math.round(cx - lp / 2 - l * 0.12), pied - Math.min(hm, Math.max(2, hm - 1)) + 1, lp, Math.min(hm, Math.max(2, hm - 1)), tons.porte);
  if (tons.fenetre && l >= 9) t.bloc(Math.round(cx + l * 0.14), pied - hm + 2, 2, Math.max(1, hm - 3), tons.fenetre);
  for (let dy = 0; dy < ht; dy++) {
    const y = pied - hm - ht + 1 + dy;
    const demi = Math.round(((dy + 1) / ht) * (l / 2 + 1.5));
    for (let dx = -demi; dx <= demi; dx++) {
      let c = dx < -demi * 0.25 ? tons.toitClair : dx > demi * 0.4 ? tons.toitOmbre : tons.toit;
      if (dy % 3 === 2 && (dx + dy) % 2 === 0) c = tons.toitOmbre;
      if (dy === ht - 1) c = tons.toitOmbre;
      if (tons.neige && (dy < ht * 0.5 || (dy < ht * 0.75 && Math.abs(dx) < demi * 0.55))) c = dx > demi * 0.35 ? (tons.neigeOmbre ?? tons.neige) : tons.neige;
      t.poser(Math.round(cx + dx), y, c);
    }
  }
}

/** Un arbre nu, qui se divise `prof` fois : pour les nuits d'automne. */
function arbreNu(t: Toile, x: number, y: number, angle: number, long: number, epais: number, prof: number, couleur: string, s: number, clair?: string): void {
  const x1 = x + Math.cos(angle) * long;
  const y1 = y - Math.sin(angle) * long;
  branche(t, x, y, x1, y1, epais, Math.max(1, epais * 0.62), couleur, clair);
  if (prof <= 0) return;
  const e = 0.42 + 0.34 * alea(prof, s, 9);
  arbreNu(t, x1, y1, angle + e, long * 0.74, Math.max(1, epais * 0.62), prof - 1, couleur, s * 2 + 1, clair);
  arbreNu(t, x1, y1, angle - e * 0.85, long * 0.68, Math.max(1, epais * 0.62), prof - 1, couleur, s * 2 + 2, clair);
}

// ───────────────────────────────────────────── 1. Forêt dorée (commun) ─────────────────────────────────────────────

function foretDoree(): Decor {
  const t = new Toile("#f8e3a4");
  bandes(t, ["#a3c3cd", "#b3cdd0", "#c8d8ce", "#dee1c6", "#efe5b9", "#f8e3a4"], 0, 47);
  // Le lointain dans la brume, puis deux rideaux d'arbres.
  relief(t, (x) => 43 + onde(x, [3, 19, 0.4], [1.5, 7, 2]), "#ead9a0");
  relief(t, (x) => 46 - Math.abs(Math.sin(x / 3.1 + 2)) * 3 - onde(x, [2, 29, 2.4]), "#e6cc86");
  for (let x = 1; x < LARGEUR; x += 5 + Math.floor(alea(x, 0, 9) * 4)) t.bloc(x, 47, 1, 6, "#d2b272");
  relief(t, (x) => 49 - Math.abs(Math.sin(x / 4.3 + 1)) * 4 - onde(x, [2, 23, 1]), (_x, _y, p) => (p < 1 ? "#e8c672" : "#dcb866"));
  // Des rais de soleil pâles entre les arbres, à droite du Gaulois.
  for (const [x0, l] of [[84, 3], [91, 2], [40, 2]] as const) {
    for (let y = 30; y < 62; y++) for (let k = 0; k < l; k++) voile(t, x0 + k - Math.round((y - 30) * 0.3), y, "#fff4c8", 0.22);
  }
  relief(t, (x) => 55 - Math.abs(Math.sin(x / 6.1 + 0.3)) * 5 - onde(x, [2, 31, 2]), (x, _y, p) => (p < 2 && Math.cos(x / 6.1 + 0.3) > 0 ? "#dba244" : "#c98c36"));
  for (let x = 3; x < LARGEUR; x += 7 + Math.floor(alea(x, 0, 1) * 5)) {
    if (x > 44 && x < 80) continue;
    for (let y = 57; y < 64; y++) t.poser(x, y, "#9a6a34");
  }
  // Le sol : un tapis de feuilles, et le chemin de terre où se tient le Gaulois.
  relief(t, (x) => 62 + onde(x, [1, 17, 0]), (_x, y) => (y < 66 ? "#c98a3c" : y < 68 ? "#b98040" : y < 77 ? "#b8946a" : "#a87c4e"));
  for (let y = 66; y < 68; y++) for (let x = 0; x < LARGEUR; x++) if ((x + y) % 2 === 0) t.poser(x, y, y === 66 ? "#c98a3c" : "#b8946a");
  for (let y = 63; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 2);
      const dense = y < 67 || y > 76 ? 0.045 : 0.014;
      if (a < dense) {
        const c = ton(["#e39a2c", "#cc5e26", "#f3c24c", "#a85a24"], alea(x, y, 3) * 4);
        t.poser(x, y, c);
        t.poser(x + 1, y, c);
      }
    }
  }
  const or: TonsDeFeuillage = { sombre: "#b96a20", fond: "#e2982c", clair: "#f6c64c", eclat: "#fde08a" };
  const roux: TonsDeFeuillage = { sombre: "#983c1c", fond: "#c85a24", clair: "#e8883a" };
  const tronc = "#5c3c24";
  const troncClair = "#7c5632";
  // À droite : un arbre roux au second plan, puis le grand chêne doré.
  branche(t, 120, 66, 119, 50, 3, 2, "#6a4428");
  feuillage(t, [[119, 46, 8, 7], [124, 52, 6, 5], [113, 51, 5, 4]], roux, 11);
  branche(t, 105, 71, 104, 30, 7, 4, tronc, troncClair);
  t.bloc(100, 70, 11, 2, tronc);
  branche(t, 104, 40, 92, 28, 3, 1, tronc);
  branche(t, 105, 38, 116, 24, 3, 1, tronc);
  feuillage(
    t,
    [[90, 26, 10, 8], [104, 16, 14, 11], [118, 22, 10, 9], [98, 31, 8, 6], [112, 33, 9, 6], [84, 34, 5, 4], [122, 36, 6, 5]],
    or,
    12,
  );
  // À gauche, sous le coin du logo : un chêne doré plus petit et un jeune arbre roux.
  branche(t, 13, 70, 13, 44, 5, 3, tronc, troncClair);
  t.bloc(9, 69, 9, 2, tronc);
  feuillage(t, [[5, 43, 8, 7], [15, 38, 11, 9], [26, 44, 8, 7], [12, 48, 9, 5]], or, 13);
  branche(t, 32, 67, 32, 56, 2, 1, "#6a4428");
  feuillage(t, [[32, 53, 6, 6], [28, 56, 4, 3], [36, 56, 4, 3]], roux, 14);
  // Quelques feuilles qui tombent.
  const feuilles: readonly (readonly [number, number])[] = [[41, 31], [88, 46], [93, 58], [37, 60], [80, 20], [24, 60], [97, 50], [84, 62], [43, 46], [116, 60], [6, 58], [68, 5], [56, 8]];
  feuilles.forEach(([x, y], k) => {
    t.poser(x, y, k % 3 === 0 ? "#cc5e26" : "#f3c24c");
    t.poser(x + 1, y + 1, k % 3 === 0 ? "#983c1c" : "#e2982c");
  });
  return t.decor("#8e6c48");
}

// ───────────────────────────────────────────── 2. Plage au couchant (commun) ─────────────────────────────────────────────

function plageAuCouchant(): Decor {
  const t = new Toile("#4a4a7c");
  bandes(t, ["#4c4a7e", "#5f5388", "#7a5c92", "#9a6694", "#bf728c", "#de8478", "#ee9664", "#f6ac5a"], 0, 49);
  lueur(t, 100, 47, 34, 20, "#ffd27a", 0.55, 4);
  // De longs nuages, éclairés par dessous.
  const nuages: readonly (readonly [number, number, number])[] = [[70, 9, 30], [96, 15, 26], [58, 20, 16], [104, 27, 18], [84, 33, 12]];
  for (const [x, y, l] of nuages) {
    for (let dx = 0; dx < l; dx++) {
      const bout = Math.min(dx, l - 1 - dx);
      if (bout >= 2) t.poser(x + dx, y - 1, "#8a5c8c");
      t.poser(x + dx, y, "#a8688c");
      if (bout >= 3) t.poser(x + dx + 2, y + 1, y > 20 ? "#fcc078" : "#e89a80");
    }
  }
  disque(t, 100, 46, 11, "#ffd472");
  disque(t, 100, 46, 9.6, "#fff0b0");
  disque(t, 99, 45, 6.5, "#fffbe2");
  // La mer et le chemin de lumière.
  bandes(t, ["#8a5c8a", "#6c5488", "#544e82", "#444878", "#3c4270"], 50, 61);
  for (let y = 50; y <= 61; y++) {
    const demi = 3 + (y - 50) * 0.9;
    for (let x = Math.round(100 - demi); x <= 100 + demi; x++) {
      const a = alea(x >> 1, y, 1);
      if (a < 0.66) t.poser(x, y, Math.abs(x - 100) < demi * 0.4 ? "#fff0b8" : a < 0.3 ? "#fcc870" : "#f09a62");
    }
    for (let x = 0; x < LARGEUR; x++) if (alea(x, y, 2) < 0.035 && Math.abs(x - 100) > demi + 2) t.bloc(x, y, 3, 1, y < 54 ? "#b0728e" : "#6c5c94");
  }
  // Une barque à voile, au loin.
  t.grille(78, 44, ["...v..", "..vv..", ".vvv..", ".vvvv.", "...m..", "cccccc", ".cccc."], { v: "#3c305a", m: "#3c305a", c: "#30264c" });
  // À gauche : un cap rocheux et ses deux pins.
  const cap = "#33294a";
  for (let x = 0; x <= 38; x++) {
    const haut = Math.round(40 + 16 * (x / 38) ** 1.7 + onde(x, [1.2, 3.1, 0]));
    for (let y = haut; y <= 62; y++) t.poser(x, y, y - haut < 1 ? "#6a4468" : y > 56 && alea(x, y, 4) < 0.3 ? "#2a2240" : cap);
  }
  const pin = (x: number, pied: number, h: number, l: number): void => {
    branche(t, x, pied, x + 2, pied - h, 2, 1, "#2a2240");
    ovale(t, x + 2, pied - h - 1, l, 3, "#2a2240");
    ovale(t, x + 3, pied - h - 2, l - 2, 1.6, "#4a3458");
    ovale(t, x - l * 0.5, pied - h + 2, l * 0.5, 1.6, "#2a2240");
  };
  pin(9, 41, 13, 9);
  pin(23, 46, 9, 6);
  // Le sable : la laisse de mer mouillée, l'écume, puis le sable sec et ses rides.
  const ecume = (x: number): number => 61.6 + onde(x, [1.1, 9, 0.5], [0.6, 4, 1]);
  for (let x = 0; x < LARGEUR; x++) {
    const e = Math.round(ecume(x));
    for (let y = e; y < HAUTEUR; y++) {
      const p = y - e;
      let c = p === 0 ? "#fdeede" : p < 3 ? "#b0808c" : p < 4 ? "#c29080" : p < 9 ? "#dba878" : p < 14 ? "#d09a6c" : "#c48c62";
      if (p === 1 && alea(x, y, 5) < 0.4) c = "#e8c8c0";
      if (p > 0 && p < 3 && Math.abs(x - 100) < 9 && alea(x, y, 6) < 0.6) c = "#f6bc84";
      if (p === 3 && (x + y) % 2 === 0) c = "#b0808c";
      t.poser(x, y, c);
    }
  }
  for (let y = 67; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 7);
      if (a < 0.03) t.bloc(x, y, 3 + Math.floor(alea(x, y, 8) * 3), 1, "#b88058");
      else if (a < 0.05) t.bloc(x, y, 2, 1, "#ecc090");
    }
  }
  // Un bois flotté et deux coquillages, à droite.
  t.grille(94, 73, ["....bb.......b..", ".bBBBBBBbbBBBBb.", "bbbbbbbbbbbbbb.."], { b: "#7a5448", B: "#a87c64" });
  t.grille(112, 76, [".c.", "cCc"], { c: "#f6dcc8", C: "#e0a890" });
  t.grille(18, 75, ["cC", "Cc"], { c: "#f6dcc8", C: "#e0a890" });
  return t.decor("#a87a60");
}

// ───────────────────────────────────────────── 3. Cerisiers en fleurs (peu commun) ─────────────────────────────────────────────

function cerisiersEnFleurs(): Decor {
  const t = new Toile("#8cc4e8");
  bandes(t, ["#86c0e6", "#98cbea", "#acd6ee", "#c2e0f0", "#d8eaf0", "#eaf2ea"], 0, 47);
  // Deux nuages ronds, hors du coin du logo.
  const nuage = (x: number, y: number, e: number): void => {
    ovale(t, x, y + 1, 9 * e, 2.4 * e, "#d4e6f2");
    ovale(t, x - 3 * e, y - 1, 4 * e, 3 * e, "#ffffff");
    ovale(t, x + 2 * e, y - 2, 5 * e, 3.6 * e, "#ffffff");
    ovale(t, x + 1 * e, y, 8 * e, 2 * e, "#f4f9fc");
  };
  nuage(66, 24, 1);
  nuage(30, 33, 0.7);
  // La montagne au loin, sa neige, puis les collines.
  const mont = (x: number): number => Math.min(31 + Math.abs(x - 52) * 0.62, 36 + Math.abs(x - 84) * 0.55, 40 + Math.abs(x - 20) * 0.5);
  relief(t, mont, (x, _y, p) => (p < 4 - (alea(x, 0, 1) < 0.5 ? 1 : 0) && mont(x) < 40 ? "#f4f8fc" : x + p * 0.7 > 56 && x < 84 ? "#9cb8d8" : "#b2cce4"), 56);
  relief(t, (x) => 50 + onde(x, [3, 23, 1], [1, 9, 0]), "#a8d09a");
  relief(t, (x) => 55 + onde(x, [2.5, 31, 3], [1, 11, 2]), "#8cc07a");
  // Un bosquet de cerisiers au loin, sur la colline.
  for (const [x, y, r] of [[40, 53, 3], [45, 52, 4], [80, 54, 3], [86, 53, 4], [92, 55, 3]] as const) {
    ovale(t, x, y, r, r * 0.8, "#eaa0b8");
    ovale(t, x - 1, y - 1, r * 0.6, r * 0.45, "#f8c8d8");
  }
  // Le pré, en bandes, et son herbe.
  relief(t, (x) => 59 + onde(x, [1.2, 21, 0.6]), (_x, y) => (y < 64 ? "#7ab868" : y < 70 ? "#6cac5c" : y < 76 ? "#60a054" : "#56944c"));
  for (let y = 61; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 2);
      if (a < 0.05) {
        t.poser(x, y, "#4e8a48");
        t.poser(x, y - 1, "#8cc878");
      } else if (a < 0.056) t.poser(x, y, alea(x, y, 3) < 0.5 ? "#fff8d8" : "#f6dc6a");
    }
  }
  const rose: TonsDeFeuillage = { sombre: "#cc6c90", fond: "#ec98b4", clair: "#f9c4d6", eclat: "#fff0f4" };
  const tronc = "#4c2c30";
  const troncClair = "#7a4c48";
  // À gauche : une hutte sur le pré et un jeune cerisier.
  hutte(t, 22, 64, 14, { mur: "#e4c894", murOmbre: "#c4a474", toit: "#c8a252", toitClair: "#e2c06c", toitOmbre: "#a07c3a", porte: "#5c3c24" });
  branche(t, 9, 71, 10, 50, 4, 2, tronc, troncClair);
  branche(t, 10, 54, 3, 44, 2, 1, tronc);
  branche(t, 10, 52, 18, 44, 2, 1, tronc);
  feuillage(t, [[4, 42, 7, 6], [13, 37, 9, 7], [21, 43, 7, 6], [10, 46, 7, 4]], rose, 21);
  // À droite : le grand cerisier, dont une branche traverse le haut du ciel.
  branche(t, 110, 72, 104, 46, 8, 5, tronc, troncClair);
  t.bloc(104, 71, 13, 2, tronc);
  branche(t, 104, 46, 100, 28, 5, 3, tronc, troncClair);
  branche(t, 102, 36, 88, 20, 3, 1, tronc);
  branche(t, 100, 30, 116, 14, 3, 1, tronc);
  branche(t, 100, 28, 96, 10, 3, 2, tronc);
  branche(t, 96, 12, 74, 6, 2, 1, tronc);
  branche(t, 76, 6, 56, 5, 1, 1, tronc);
  branche(t, 106, 50, 118, 40, 2, 1, tronc);
  feuillage(
    t,
    [[86, 17, 10, 7], [100, 8, 12, 8], [116, 12, 11, 9], [108, 24, 8, 6], [92, 27, 6, 4], [120, 30, 7, 6], [119, 42, 6, 4], [72, 5, 9, 4.5], [58, 4, 6, 3.2]],
    rose,
    22,
  );
  // Les pétales : au vent, de la droite vers la gauche, et en tapis sous les arbres.
  for (let y = 4; y < 70; y++) {
    for (let x = 30; x < LARGEUR; x++) {
      if (auCalme(x, y)) continue;
      const pres = borne((x - 30) / 80);
      if (alea(x, y, 4) < 0.006 + 0.012 * pres) {
        const c = t.lire(x, y);
        if (c === rose.fond || c === rose.clair || c === rose.sombre) continue;
        t.poser(x, y, alea(x, y, 5) < 0.5 ? "#fde4ec" : "#f6b4cc");
        if (alea(x, y, 6) < 0.4) t.poser(x - 1, y + 1, "#f6b4cc");
      }
    }
  }
  for (let y = 62; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const pres = Math.max(borne(1 - Math.abs(x - 108) / 30), borne(1 - Math.abs(x - 10) / 18) * 0.8);
      if (alea(x, y, 7) < 0.015 + 0.14 * pres * pres) t.poser(x, y, alea(x, y, 8) < 0.6 ? "#f6b4cc" : "#fde4ec");
    }
  }
  return t.decor("#4c8648");
}

// ───────────────────────────────────────────── 4. Nuit de neige (peu commun) ─────────────────────────────────────────────

function nuitDeNeige(): Decor {
  const t = new Toile("#101a40");
  bandes(t, ["#111b44", "#15234f", "#1a2c5c", "#213769", "#2a4376", "#365284"], 0, 50);
  etoiles(t, 40, 0.014, ["#6a80b4", "#a8bce0", "#e8f0ff"], 1);
  // Les collines de neige sous la nuit, et la lisière des sapins.
  relief(t, (x) => 45 + onde(x, [3, 27, 0.5], [1.2, 9, 1]), "#52709e");
  for (let x = -2; x < LARGEUR + 3; x += 4 + Math.floor(alea(x, 1, 2) * 3)) {
    const h = 6 + Math.floor(alea(x, 2, 2) * 6);
    const pied = Math.round(53 + onde(x, [2, 31, 2]));
    for (let dy = 0; dy < h; dy++) {
      const demi = Math.floor((dy % 3) * 0.6 + dy * 0.3);
      for (let dx = -demi; dx <= demi; dx++) t.poser(x + dx, pied - h + dy, dy % 3 === 0 && dy > 0 && dx < 0 ? "#5a7aa8" : "#1a2a52");
    }
  }
  relief(t, (x) => 52 + onde(x, [2, 31, 2], [1, 13, 0]), "#7e9cc6");
  relief(t, (x) => 59 + onde(x, [1.6, 23, 1]), (_x, y, p) => (p < 1 ? "#e4f0ff" : y < 66 ? "#bcd0ea" : y < 76 ? "#cddcf2" : "#b4c8e4"));
  for (let y = 62; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 3);
      if (a < 0.02) t.bloc(x, y, 3 + Math.floor(alea(x, y, 4) * 4), 1, "#a4bcdc");
      else if (a < 0.03) t.poser(x, y, "#f6faff");
    }
  }
  // À gauche : la hutte sous la neige, sa fenêtre allumée, sa fumée.
  lueur(t, 22, 62, 16, 7, "#ffc060", 0.4, 3);
  hutte(t, 8, 63, 22, {
    mur: "#8a6c58",
    murOmbre: "#6a5048",
    toit: "#7a6448",
    toitClair: "#94794f",
    toitOmbre: "#54443c",
    porte: "#3a2620",
    fenetre: "#ffd070",
    neige: "#dce8fa",
    neigeOmbre: "#a8bedc",
  });
  t.bloc(22, 58, 3, 3, "#ffd070");
  t.poser(23, 59, "#fff4c0");
  t.bloc(21, 61, 5, 1, "#54443c");
  for (let k = 0; k < 9; k++) {
    const x = Math.round(19 + Math.sin(k * 0.8) * 2 + k * 0.4);
    t.bloc(x, 42 - k * 2, 2 + (k > 3 ? 1 : 0), 2, k < 4 ? "#6a7ea8" : "#4a5e8c");
  }
  // Une guirlande de lampions, de la hutte au sapin, derrière le Gaulois.
  const lampes = ["#ff5a50", "#ffd24a", "#5ad0ff", "#7ae07a"] as const;
  for (let x = 28; x <= 92; x++) {
    const f = (x - 28) / 64;
    const y = Math.round(40 - 14 * f + 22 * 4 * f * (1 - f) * 0.5);
    t.poser(x, y, "#0c1430");
    if ((x - 28) % 8 === 3) {
      const c = lampes[((x - 28) / 8) & 3] ?? "#ffd24a";
      lueur(t, x, y + 1, 3, 3, c, 0.35, 2);
      t.poser(x, y + 1, c);
      t.poser(x, y + 2, c);
    }
  }
  // À droite : le grand sapin illuminé.
  const vert: TonsDeSapin = { sombre: "#12382e", fond: "#1c5440", clair: "#2c7450", tronc: "#3a2a24", neige: "#e4f0ff", neigeOmbre: "#a8c0e0" };
  sapin(t, 118, 64, 30, 18, { ...vert, neige: "#c8d8f0", neigeOmbre: "#8ea8cc" });
  lueur(t, 103, 40, 26, 34, "#ffd870", 0.2, 3);
  const demis = sapin(t, 103, 69, 58, 36, vert, 7);
  const haut = 69 - 58 + 1;
  demis.forEach((demi, dy) => {
    if (demi < 2) return;
    for (let dx = -demi + 1; dx <= demi - 1; dx++) {
      const pente = dy - Math.round((dx + demi) * 0.45);
      if (((pente % 8) + 8) % 8 !== 0 || ((dx + 100) % 3) !== 0) continue;
      const c = lampes[(((dx + 100) / 3 + Math.floor(dy / 8)) | 0) & 3] ?? "#ffd24a";
      voile(t, 103 + dx - 1, haut + dy, c, 0.45);
      voile(t, 103 + dx + 1, haut + dy, c, 0.45);
      voile(t, 103 + dx, haut + dy - 1, c, 0.45);
      t.poser(103 + dx, haut + dy, c);
    }
  });
  lueur(t, 103, haut - 2, 7, 7, "#fff0a0", 0.5, 3);
  eclat(t, 103, haut - 2, "#ffffff", "#ffe680", 3);
  t.poser(102, haut - 3, "#ffe680");
  t.poser(104, haut - 3, "#ffe680");
  t.poser(102, haut - 1, "#ffe680");
  t.poser(104, haut - 1, "#ffe680");
  // Au premier plan : des traces de pas dans la neige, une lanterne posée, deux touffes givrées.
  for (let k = 0; k < 9; k++) {
    const x = 4 + k * 5;
    const y = 78 - Math.round(k * 0.45) - (k & 1);
    t.bloc(x, y, 2, 1, "#8ea6cc");
    t.poser(x + 2, y, "#a4bcdc");
  }
  lueur(t, 88, 76, 8, 4, "#ffc060", 0.42, 3);
  t.grille(86, 72, [".aaa.", ".ana.", "njjjn", "njJjn", "njjjn", "nnnnn"], { a: "#2a3458", n: "#1c2444", j: "#ffd070", J: "#fff4c0" });
  for (const x of [58, 108, 30]) t.grille(x, 76, ["g.g.g", ".ggg."], { g: "#7e9cc6" });
  // Des cadeaux au pied du sapin, et la neige qui tombe.
  t.grille(88, 66, ["..y....", "rryrr..", "rryrr..", "rryrr.."], { r: "#d8443c", y: "#ffd24a" });
  t.grille(112, 68, ["bbybb", "bbybb", "bbybb"], { b: "#3a8ad8", y: "#f6faff" });
  for (let y = 0; y < 74; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 5);
      if (a < (auCalme(x, y) ? 0.004 : 0.016)) {
        t.poser(x, y, a < 0.006 ? "#ffffff" : "#c4d4f0");
        if (a < 0.003 && !auCalme(x, y)) t.poser(x + 1, y, "#ffffff");
      }
    }
  }
  return t.decor("#8ea6cc");
}

// ───────────────────────────────────────────── 5. Nuit des citrouilles (épique) ─────────────────────────────────────────────

function citrouille(t: Toile, cx: number, cy: number, rx: number, ry: number, visage: boolean): void {
  lueur(t, cx, cy + ry, rx * 2.3, 3.2, "#ff9430", visage ? 0.5 : 0.2, 3);
  const cotes = [Math.round(rx * 0.36), Math.round(rx * 0.74)];
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      const d = u * u + v * v;
      if (d > 1) continue;
      let c = v < -0.5 ? "#ffa23a" : v > 0.45 ? "#c45c14" : "#ec7c1c";
      if (cotes.includes(Math.abs(x - cx)) && rx >= 4) c = v < -0.5 ? "#e07818" : "#b04e12";
      if (d > 0.78 && v > 0.2) c = "#8a3a14";
      if (u > 0.55 && v < 0.3 && d < 0.8) c = "#ffb850";
      t.poser(x, y, c);
    }
  }
  t.bloc(cx, Math.floor(cy - ry) - 2, 2, 3, "#58783a");
  t.poser(cx + 2, Math.floor(cy - ry) - 2, "#58783a");
  if (!visage) return;
  const feu = "#ffe264";
  const coeur = "#fff6b8";
  const oy = Math.round(cy - ry * 0.3);
  for (const s of [-1, 1]) {
    const ox = Math.round(cx + s * rx * 0.42);
    t.poser(ox, oy - 1, feu);
    t.bloc(ox - 1, oy, 3, 1, feu);
    t.poser(ox, oy, coeur);
  }
  t.poser(cx, oy + 2, feu);
  const by = Math.round(cy + ry * 0.38);
  const demi = Math.round(rx * 0.6);
  for (let dx = -demi; dx <= demi; dx++) {
    t.poser(cx + dx, by, Math.abs(dx) < demi - 1 ? coeur : feu);
    if (((dx + 40) % 2 === 0 && Math.abs(dx) < demi) || Math.abs(dx) === demi) t.poser(cx + dx, by + (Math.abs(dx) === demi ? -1 : 1), feu);
  }
}

function nuitDesCitrouilles(): Decor {
  const t = new Toile("#1a1030");
  bandes(t, ["#1a1032", "#22143e", "#2c184a", "#3a1e58", "#4c2666", "#602e72", "#763a7c"], 0, 52);
  etoiles(t, 34, 0.008, ["#5a4880", "#a890c8", "#e8dcf8"], 1);
  // La grande lune et son halo, à droite.
  const lx = 96;
  const ly = 22;
  lueur(t, lx, ly, 34, 30, "#c890c0", 0.3, 5);
  disque(t, lx, ly, 15, "#f2e2a0");
  disque(t, lx - 1, ly - 1, 13.4, "#fbf0bc");
  for (const [dx, dy, r] of [[-5, -4, 3], [4, 3, 4], [-3, 6, 2], [6, -6, 2], [-9, 2, 1.5]] as const) {
    ovale(t, lx + dx, ly + dy, r, r * 0.8, "#e6d08c");
    ovale(t, lx + dx + 0.5, ly + dy + 0.5, r * 0.6, r * 0.45, "#f2e2a0");
  }
  // Des nuages en lambeaux, qui passent devant elle.
  const lambeaux: readonly (readonly [number, number, number])[] = [[74, 28, 34], [90, 13, 30], [56, 8, 22], [100, 36, 24]];
  for (const [x, y, l] of lambeaux) {
    for (let dx = 0; dx < l; dx++) {
      const bout = Math.min(dx, l - 1 - dx);
      const surLune = (x + dx - lx) ** 2 + (y - ly) ** 2 < 16 * 16;
      if (bout >= 3) t.poser(x + dx, y - 1, surLune ? "#b48cb0" : "#4a2a66");
      t.poser(x + dx, y, surLune ? "#5a3470" : "#30184c");
      if (bout >= 5) t.poser(x + dx - 3, y + 1, "#30184c");
    }
  }
  // Les chauves-souris.
  const souris = ["b.....b", "bb.b.bb", ".bbbbb.", "..b.b.."];
  const petite = ["b...b", ".bbb.", "..b.."];
  t.grille(74, 14, souris, { b: "#140c26" });
  t.grille(112, 6, souris, { b: "#140c26" });
  t.grille(88, 20, petite, { b: "#2a1640" });
  t.grille(60, 22, petite, { b: "#140c26" });
  t.grille(84, 5, petite, { b: "#140c26" });
  // Les collines, la brume violette en nappes.
  relief(t, (x) => 48 + onde(x, [3, 21, 0], [1.4, 8, 2]), (x, _y, p) => (p < 1 && x > 40 ? "#8a5a98" : "#3a2058"));
  for (const [x, l] of [[46, 6], [54, 5], [72, 7], [81, 5]] as const) {
    const pied = Math.round(48 + onde(x, [3, 21, 0], [1.4, 8, 2])) + 1;
    for (let k = 0; k < l / 2 + 1; k++) t.bloc(x + k, pied - 3 - k, l - 2 * k, 1, "#241238");
    t.bloc(x + 1, pied - 2, l - 2, 3, "#2c163f");
    t.poser(x + 2, pied - 1, "#ffb040");
  }
  relief(t, (x) => 54 + onde(x, [2.2, 33, 2]), (x, _y, p) => (p < 1 && x > 60 ? "#5a3470" : "#281644"));
  // Un épouvantail sur la colline, les bras en croix.
  t.grille(80, 44, ["..ccc..", ".ccccc.", "..ooo..", "..ooo..", "sssssss", "s.sss.s", "..sss..", "..sss..", "...p...", "...p...", "...p..."], { c: "#180c28", o: "#ffb040", s: "#180c28", p: "#180c28" });
  t.poser(82, 46, "#180c28");
  t.poser(84, 47, "#180c28");
  for (const [y0, c, part] of [[49, "#9a64a8", 0.5], [54, "#8858a0", 0.55], [58, "#70488c", 0.5]] as const) {
    for (let x = 0; x < LARGEUR; x++) {
      const e = 1.6 + onde(x, [1.2, 11, y0], [0.6, 5, y0 * 2]);
      const y = Math.round(y0 + onde(x, [1, 17, y0 * 0.7]));
      for (let dy = 0; dy < e; dy++) voile(t, x, y + dy, c, part);
    }
  }
  // À gauche, sous le coin du logo : une vieille hutte penchée, fenêtres allumées, et sa barrière.
  lueur(t, 18, 54, 14, 10, "#ff8a30", 0.28, 3);
  hutte(t, 6, 62, 22, { mur: "#33203f", murOmbre: "#261636", toit: "#241430", toitClair: "#3c2450", toitOmbre: "#180c24", porte: "#ffb040", fenetre: "#ffd050" });
  t.bloc(13, 58, 2, 5, "#ffb648");
  t.poser(13, 58, "#fff0a0");
  for (let x = 31; x <= 42; x += 3) {
    t.bloc(x, 58 + ((x / 3) & 1), 1, 6, "#1c1030");
  }
  trait(t, 30, 60, 43, 61, "#1c1030");
  // Un chat noir sur la barrière, les yeux jaunes.
  t.grille(34, 53, ["c.c.....", "ccc....c", "ccc...c.", ".ccccc..", ".ccccc..", ".c...c.."], { c: "#120a20" });
  t.poser(34, 54, "#ffe060");
  t.poser(36, 54, "#ffe060");
  // Le sol : la terre sombre, le chemin plus clair où se tient le Gaulois.
  relief(t, (x) => 62 + onde(x, [1, 15, 1]), (_x, y, p) => (p < 1 ? "#5a3a6c" : y < 67 ? "#34203f" : y < 77 ? "#46304f" : "#2c1a36"));
  for (let y = 64; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 2);
      if (a < 0.03) t.bloc(x, y, 2 + Math.floor(alea(x, y, 3) * 3), 1, y >= 67 && y < 77 ? "#58406a" : "#22142c");
      else if (a < 0.04 && (y < 67 || y > 76)) {
        t.poser(x, y, "#1c1228");
        t.poser(x, y - 1, "#1c1228");
      }
    }
  }
  // À droite : l'arbre nu, devant la lune.
  arbreNu(t, 115, 70, 1.72, 19, 6, 5, "#160c26", 1, "#4a3060");
  t.bloc(111, 69, 10, 2, "#160c26");
  // Les citrouilles : les grandes devant, les petites plus loin.
  citrouille(t, 36, 64, 3, 2.4, false);
  citrouille(t, 90, 64, 3.4, 2.6, true);
  citrouille(t, 14, 69, 9, 6.4, true);
  citrouille(t, 29, 73, 5.6, 4, true);
  citrouille(t, 100, 71, 8, 5.6, true);
  citrouille(t, 86, 75, 4.4, 3.2, false);
  citrouille(t, 116, 75, 5, 3.6, true);
  // Des feuilles mortes au vent, et des bougies le long du chemin.
  for (const [x, y] of [[48, 34], [86, 40], [42, 56], [92, 52], [62, 4], [108, 48], [10, 34], [70, 60]] as const) {
    t.poser(x, y, "#e07a20");
    t.poser(x + 1, y + 1, "#a04a14");
  }
  for (const x of [44, 82, 58, 70]) {
    lueur(t, x, 77, 4, 2.5, "#ffa030", 0.4, 2);
    t.bloc(x, 77, 1, 2, "#e8d8c0");
    t.poser(x, 76, "#ffe060");
  }
  // Des lucioles orange dans la brume.
  for (const [x, y] of [[44, 50], [84, 48], [40, 38], [88, 58], [6, 44], [50, 60], [78, 62], [120, 52]] as const) {
    voile(t, x - 1, y, "#ffb040", 0.4);
    voile(t, x + 1, y, "#ffb040", 0.4);
    voile(t, x, y - 1, "#ffb040", 0.4);
    voile(t, x, y + 1, "#ffb040", 0.4);
    t.poser(x, y, "#ffe080");
  }
  return t.decor("#2a1a34");
}

// ───────────────────────────────────────────── 6. Feux du nouvel an (épique) ─────────────────────────────────────────────

interface TonsDeBouquet {
  coeur: string;
  vif: string;
  fond: string;
  braise: string;
}
/** Un bouquet de feu d'artifice : des rayons en pointillé, plus vifs au bout, qui retombent un peu. */
function bouquet(t: Toile, cx: number, cy: number, r: number, tons: TonsDeBouquet, rayons: number, s: number, chute = 0.22): void {
  lueur(t, cx, cy, r * 1.5, r * 1.4, tons.fond, 0.24, 3);
  for (let k = 0; k < rayons; k++) {
    const a = ((k + 0.6 * alea(k, s, 1)) / rayons) * Math.PI * 2;
    const portee = r * (0.78 + 0.22 * alea(k, s, 2));
    let fx = cx;
    let fy = cy;
    for (let d = r * 0.22; d <= portee; d += 0.5) {
      const f = d / portee;
      fx = Math.round(cx + Math.cos(a) * d);
      fy = Math.round(cy + Math.sin(a) * d * 0.94 + f * f * r * chute);
      if (f < 0.6 && Math.floor(d) % 2 === 1) continue;
      t.poser(fx, fy, f > 0.86 ? tons.coeur : f > 0.6 ? tons.vif : f > 0.38 ? tons.fond : tons.braise);
    }
    if (r >= 9 && k % 2 === 0) eclat(t, fx, fy, tons.coeur, tons.vif, 1);
  }
  eclat(t, cx, cy, tons.coeur, tons.vif, 1);
}

function feuxDuNouvelAn(): Decor {
  const t = new Toile("#0a1030");
  bandes(t, ["#0a1030", "#0d153a", "#111b46", "#172352", "#1f2c5e", "#2a376a"], 0, 50);
  etoiles(t, 30, 0.006, ["#44508a", "#8090c8"], 1);
  // La ville : un rang de toits au loin, puis les immeubles et les tours aux fenêtres allumées.
  const rang = (s: number, base: number, couleur: string, fenetres: Rampe | null): void => {
    let x = -2;
    while (x < LARGEUR) {
      const l = 4 + Math.floor(alea(x, s, 3) * 6);
      const bord = Math.abs(x + l / 2 - 62) / 62;
      const h = Math.round(base + bord * bord * 15 + alea(x, s, 4) * 8);
      const haut = 60 - h;
      t.bloc(x, haut, l, h + 1, couleur);
      const toit = alea(x, s, 5);
      if (toit < 0.25) for (let k = 1; k <= l / 2; k++) t.bloc(x + k, haut - k, l - 2 * k, 1, couleur);
      else if (toit < 0.4) ovale(t, x + (l - 1) / 2, haut, l / 2, l / 2.4, couleur);
      else if (toit < 0.55) t.bloc(x + Math.floor(l / 2), haut - 4, 1, 4, couleur);
      else if (toit < 0.7) t.bloc(x + 1, haut - 2, l - 2, 2, couleur);
      if (fenetres) {
        for (let wy = haut + 2; wy < 58; wy += 2) {
          for (let wx = x + 1; wx < x + l - 1; wx += 2) {
            if (alea(wx, wy, s + 6) < 0.42) t.poser(wx, wy, ton(fenetres, alea(wx, wy, s + 7) * fenetres.length));
          }
        }
      }
      x += l + (alea(x, s, 8) < 0.3 ? 1 : 0);
    }
  };
  rang(1, 9, "#1c2656", null);
  rang(2, 3, "#0d1432", ["#ffd070", "#ffd070", "#ffb050", "#fff0b0", "#8ad0ff"]);
  // Le fleuve, qui reflète tout.
  bandes(t, ["#131c46", "#0f163a", "#0c1230"], 58, 65);
  // Les fusées qui montent, puis les bouquets.
  const or: TonsDeBouquet = { coeur: "#fffbe0", vif: "#ffd860", fond: "#f09a30", braise: "#a85a28" };
  const rose: TonsDeBouquet = { coeur: "#ffe8f4", vif: "#ff6aa8", fond: "#d83a88", braise: "#7a2a6c" };
  const cyan: TonsDeBouquet = { coeur: "#eaffff", vif: "#5ae0f0", fond: "#2a9ad0", braise: "#1c4c8c" };
  const vert: TonsDeBouquet = { coeur: "#f0ffd8", vif: "#8af070", fond: "#3ab858", braise: "#1c6c4c" };
  for (const [x0, y0, x1, y1] of [[84, 50, 86, 30], [112, 46, 100, 30], [26, 52, 23, 46]] as const) {
    const n = y0 - y1;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      if (f < 0.5 && i % 2 === 1) continue;
      t.poser(Math.round(x0 + (x1 - x0) * f + Math.sin(i * 0.7) * 0.6), y0 - i, f > 0.8 ? "#fff0c0" : f > 0.45 ? "#f0a850" : "#8a5a50");
    }
  }
  bouquet(t, 100, 17, 17, or, 22, 11, 0.42);
  bouquet(t, 64, 8, 11, rose, 16, 12);
  bouquet(t, 22, 38, 10, cyan, 14, 13);
  bouquet(t, 117, 37, 6, vert, 10, 14);
  bouquet(t, 86, 28, 4, rose, 8, 15, 0.1);
  bouquet(t, 40, 30, 4, or, 8, 16, 0.1);
  // Leurs reflets dans l'eau, et ceux des fenêtres.
  const reflets: readonly (readonly [number, number, TonsDeBouquet])[] = [[100, 15, or], [64, 9, rose], [22, 9, cyan], [117, 5, vert]];
  for (let y = 58; y <= 65; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 20);
      for (const [cx, demi, tons] of reflets) {
        if (Math.abs(x - cx) <= demi && a < 0.22 * (1 - Math.abs(x - cx) / (demi + 1))) t.bloc(x, y, 2, 1, a < 0.08 ? tons.vif : tons.fond);
      }
      if (a > 0.965) t.bloc(x, y, 2, 1, "#a8884a");
    }
  }
  // Le quai : le parapet de pierre, les dalles, deux lanternes, quelques confettis.
  t.bloc(0, 64, LARGEUR, 1, "#6a78a4");
  t.bloc(0, 65, LARGEUR, 3, "#465282");
  for (let x = 2; x < LARGEUR; x += 6) t.bloc(x, 65, 2, 3, "#38426e");
  t.bloc(0, 68, LARGEUR, 1, "#2c3560");
  for (let y = 69; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const joint = y === 73 || y === 78 || ((y < 73 ? x + 4 : y < 78 ? x : x + 7) % 14 === 0 && y !== 69);
      t.poser(x, y, joint ? "#353f6a" : y < 73 ? "#4a5684" : "#434e7a");
    }
  }
  for (const x of [7, 116]) {
    lueur(t, x, 44, 9, 9, "#ffd070", 0.4, 3);
    t.bloc(x, 47, 1, 21, "#1a2046");
    t.bloc(x - 1, 66, 3, 2, "#1a2046");
    t.bloc(x - 1, 42, 3, 5, "#ffd070");
    t.bloc(x, 43, 1, 3, "#fff6c8");
    t.bloc(x - 2, 41, 5, 1, "#1a2046");
    t.poser(x, 40, "#1a2046");
    lueur(t, x, 70, 9, 3, "#ffd070", 0.22, 2);
  }
  for (let y = 69; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (alea(x, y, 21) < 0.018) t.poser(x, y, ton(["#ffd860", "#ff6aa8", "#5ae0f0", "#8af070", "#f6faff"], alea(x, y, 22) * 5));
    }
  }
  return t.decor("#2a3258");
}

// ───────────────────────────────────────────── 7. Aurore sur le lac gelé (mystique) ─────────────────────────────────────────────

function auroreDuLacGele(): Decor {
  const t = new Toile("#060c24");
  const horizon = 54;
  bandes(t, ["#060b22", "#07102c", "#091636", "#0c1d40", "#10254a", "#152e54"], 0, horizon - 1);
  etoiles(t, 44, 0.011, ["#4a5c8c", "#8ea4d0", "#e4f0ff"], 1);
  // L'aurore : trois voiles, chacun une ligne qui ondule, d'où montent des rayons qui s'éteignent en violet.
  const voiles: readonly { base: (x: number) => number; de: number; a: number; force: number; long: number }[] = [
    { base: (x) => 13 + onde(x, [4, 15, 2], [1.5, 6, 0]) + (x < 60 ? (60 - x) * 0.1 : 0), de: 44, a: 132, force: 0.75, long: 11 },
    { base: (x) => 31 + onde(x, [7, 19, 1.2], [2.4, 7, 0.4]) - (x - 60) * 0.06, de: 30, a: 134, force: 1.15, long: 19 },
    { base: (x) => 43 + onde(x, [3, 10, 0.8], [1, 4, 2]), de: -10, a: 44, force: 0.85, long: 11 },
  ];
  const teintes = ["#f0ffe0", "#7cf89c", "#30dc9c", "#28a0c0", "#6a5ce0", "#9a4ad8"] as const;
  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      let fort = 0;
      let couleur = "";
      voiles.forEach((v, k) => {
        if (x < v.de || x > v.a) return;
        const bout = borne(Math.min(x - v.de, v.a - x) / 10);
        const rayon = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(x * 0.83 + k * 2 + 1.9 * Math.sin(x * 0.21 + k)));
        const hh = v.base(x) - y;
        const long = v.long * (0.45 + 0.75 * rayon);
        let i = hh >= 0 ? Math.exp(-hh / (long * 1.35)) : hh > -1.5 ? 0.45 : 0;
        i *= v.force * bout * (0.62 + 0.38 * rayon) * (0.22 + 0.78 * horsDuCalme(x, y));
        if (i > fort) {
          fort = i;
          const f = hh / long;
          couleur = hh < 1.5 ? teintes[0] : f < 0.28 ? teintes[1] : f < 0.55 ? teintes[2] : f < 0.85 ? teintes[3] : f < 1.25 ? teintes[4] : teintes[5];
        }
      });
      const palier = Math.round(borne(fort) * 6) / 6;
      if (palier > 0) voile(t, x, y, couleur, palier * 0.96);
    }
  }
  // Les montagnes : les lointaines prennent le vert du ciel sur leurs neiges.
  const loin = (x: number): number => 50 - 13 * cretes(x + 30, 0.2);
  relief(t, loin, (x, _y, p) => (p < 2 + cretes(x, 0.9) * 3 && loin(x) < 45 ? (cretes(x + 30.5, 0.2) > cretes(x + 29.5, 0.2) ? "#9adcc4" : "#4c8c98") : "#16284c"), horizon - 1);
  relief(t, (x) => 53 - 5 * cretes(x + 5, 0.63), (_x, _y, p) => (p < 1 ? "#2c5068" : "#0e1c3a"), horizon - 1);
  // Les sapins de la rive d'en face, et une hutte éclairée.
  for (let x = -1; x < LARGEUR + 2; x += 3 + Math.floor(alea(x, 3, 2) * 2)) {
    if (x > 40 && x < 84) continue;
    const h = 4 + Math.floor(alea(x, 4, 2) * 5);
    for (let dy = 0; dy < h; dy++) {
      const demi = Math.floor((dy % 3) * 0.5 + dy * 0.3);
      for (let dx = -demi; dx <= demi; dx++) t.poser(x + dx, horizon - h + dy, "#07112a");
    }
  }
  t.grille(24, 48, ["..t..", ".ttt.", "ttttt", ".mfm.", ".mfm."], { t: "#07112a", m: "#0c1830", f: "#ffc860" });
  lueur(t, 26, 52, 5, 4, "#ffb850", 0.3, 2);
  t.poser(26, 51, "#ffe090");
  t.poser(26, 52, "#ffc860");
  // Le lac gelé : il renvoie le ciel, en plus sourd ; des fissures, des plaques de neige, des éclats.
  for (let y = horizon; y <= 69; y++) {
    const p = y - horizon;
    const glace = p < 3 ? "#1c3c5c" : p < 8 ? "#18344f" : "#142c46";
    for (let x = 0; x < LARGEUR; x++) {
      const source = t.lire(x + ((y & 1) === 0 ? 1 : 0), horizon - 1 - Math.round(p * 2.4)) ?? glace;
      t.poser(x, y, melanger(glace, source, 0.7));
    }
  }
  t.bloc(0, horizon, LARGEUR, 1, "#2c5670");
  const fissures: readonly (readonly [number, number, number, number])[] = [[6, 58, 30, 62], [30, 62, 40, 60], [30, 62, 36, 67], [84, 57, 100, 61], [100, 61, 118, 59], [100, 61, 106, 66], [46, 56, 58, 58], [70, 64, 84, 66]];
  for (const [x0, y0, x1, y1] of fissures) trait(t, x0, y0, x1, y1, "#6ab8c4");
  for (let y = horizon + 2; y < 68; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 5);
      if (a < 0.012) t.bloc(x, y, 3 + Math.floor(alea(x, y, 6) * 5), 1, "#8ab4cc");
      else if (a < 0.016) eclat(t, x, y, "#f0fff4", "#84f6a8", 1);
    }
  }
  // La berge de neige où se tient le Gaulois : sa crête prend la lueur verte.
  relief(t, (x) => 68 + onde(x, [1.2, 19, 0.3], [0.5, 7, 1]) - borne((Math.abs(x - 62) - 44) / 14) * 5, (x, y, p) =>
    p < 1 ? "#d8fff0" : p < 2 ? "#a8e4d8" : y < 75 ? "#8cb4d0" : y < 78 ? "#7ca4c4" : "#6c94b8",
  );
  for (let y = 70; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 7);
      if (a < 0.022) t.bloc(x, y, 3 + Math.floor(alea(x, y, 8) * 4), 1, "#6c94b8");
      else if (a < 0.034) t.poser(x, y, "#d8fff0");
    }
  }
  // Deux sapins enneigés encadrent la scène, ourlés de vert.
  const nuit: TonsDeSapin = { sombre: "#081428", fond: "#0c2034", clair: "#1c5a50", tronc: "#050c1c", neige: "#a8e4d8", neigeOmbre: "#4c7c94" };
  sapin(t, 117, 73, 46, 24, nuit, 6);
  sapin(t, 106, 71, 22, 13, nuit, 4);
  sapin(t, 5, 72, 30, 17, nuit, 5);
  // Des poussières de lumière, qui montent du lac.
  for (let y = 6; y < 70; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (auCalme(x, y)) continue;
      const a = alea(x, y, 9);
      if (a < 0.0028) {
        lueur(t, x, y, 2.5, 2.5, "#84f6a8", 0.4, 2);
        t.poser(x, y, "#f0fff4");
      } else if (a < 0.0055) t.poser(x, y, y > 30 ? "#84f6a8" : "#b0a0f0");
    }
  }
  return t.decor("#5c84a8");
}

// ───────────────────────────────────────────── 8. Éclipse totale (légendaire) ─────────────────────────────────────────────

function eclipseTotale(): Decor {
  const t = new Toile("#0a0a26");
  const sx = 97;
  const sy = 22;
  const R = 10;
  // Le ciel : la nuit en plein jour, et l'horizon qui rougeoie tout autour.
  bandes(t, ["#09092a", "#0c0c30", "#101038", "#161444", "#201a50", "#30205c", "#4a2a66", "#6e3668", "#9a4a60", "#c8684e", "#ec9648", "#fcc060"], 0, 51, 1.7);
  etoiles(t, 40, 0.012, ["#3e3e78", "#8a8ac8", "#e0e0ff"], 1);
  eclat(t, 60, 6, "#ffffff", "#a8b0f0", 1);
  eclat(t, 118, 44, "#fff0d0", "#f0b080", 1);
  eclat(t, 30, 31, "#ffffff", "#a8b0f0", 1);
  // La couronne : des jets de lumière nacrée, plus longs le long d'un axe penché.
  for (let y = 0; y < 52; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const dx = x - sx;
      const dy = y - sy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 52) continue;
      const a = Math.atan2(dy, dx);
      const jets = 0.34 + 1.15 * Math.abs(Math.cos(a - 0.42)) ** 4 + 0.24 * Math.max(0, Math.sin(a * 9 + 0.6)) ** 2 + 0.16 * Math.max(0, Math.sin(a * 17 + 2.1)) ** 3;
      const de = (d - R) / jets;
      const calme = auCalme(x, y) ? 0.5 : 1;
      if (d < R + 1.4 || de < 2.4) t.poser(x, y, "#ffffff");
      else if (de < 4.2) t.poser(x, y, "#f0eeff");
      else if (de < 6.5) voile(t, x, y, "#dcdcff", 0.76);
      else if (de < 9.5) voile(t, x, y, "#c8ccff", 0.52);
      else if (de < 13.5) voile(t, x, y, "#b8bcf8", 0.34 * calme);
      else if (de < 19) voile(t, x, y, "#a8acf0", 0.2 * calme);
      else if (de < 26) voile(t, x, y, "#9ca0e8", 0.1 * calme);
    }
  }
  for (let k = 0; k < 22; k++) {
    const a = ((k + 0.7 * alea(k, 3, 8)) / 22) * Math.PI * 2;
    const long = 6 + 26 * Math.abs(Math.cos(a - 0.42)) ** 3 + 6 * alea(k, 4, 8);
    for (let d = R + 2; d < R + long; d += 0.7) {
      const x = Math.round(sx + Math.cos(a) * d);
      const y = Math.round(sy + Math.sin(a) * d);
      if (y > 50) break;
      voile(t, x, y, "#eeeeff", (Math.ceil((1 - (d - R) / long) * 4) / 4) * 0.5 * (0.3 + 0.7 * horsDuCalme(x, y)));
    }
  }
  // Le disque noir, ses protubérances, et le dernier grain de soleil.
  for (const [a, l] of [[2.5, 3], [0.9, 2], [5.3, 3], [4.1, 2]] as const) {
    for (let k = 0; k < l; k++) {
      const px = Math.round(sx + Math.cos(a) * (R + k));
      const py = Math.round(sy + Math.sin(a) * (R + k));
      t.poser(px, py, k === 0 ? "#ff8aa0" : "#ff4a78");
      if (k === 0) t.poser(px + (Math.sin(a) > 0 ? 1 : -1), py, "#ff4a78");
    }
  }
  disque(t, sx, sy, R + 0.2, "#06061c");
  disque(t, sx + 1.5, sy + 1.5, R - 3, "#030312");
  const gx = Math.round(sx - R * 0.74);
  const gy = Math.round(sy - R * 0.74);
  lueur(t, gx, gy, 6, 6, "#ffffff", 0.7, 3);
  eclat(t, gx, gy, "#ffffff", "#fff6d8", 5);
  t.bloc(gx - 1, gy - 1, 3, 3, "#ffffff");
  for (const [ex, ey] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) t.poser(gx + ex, gy + ey, "#fff6d8");
  // Des cirrus, sombres dessus, dorés dessous.
  const cirrus: readonly (readonly [number, number, number])[] = [[4, 38, 30], [26, 43, 22], [86, 40, 26], [104, 35, 18], [60, 45, 20], [0, 46, 14]];
  for (const [x, y, l] of cirrus) {
    for (let k = 0; k < l; k++) {
      const bout = Math.min(k, l - 1 - k);
      t.poser(x + k, y, "#3a2458");
      if (bout >= 2) t.poser(x + k + 1, y - 1, "#2c1c4c");
      if (bout >= 3) t.poser(x + k - 2, y + 1, y > 41 ? "#f09c58" : "#b8586a");
    }
  }
  // Un vol d'oiseaux, surpris par la nuit.
  const aile = ["b...b", ".b.b.", "..b.."];
  const plane = ["bb.bb", "..b.."];
  const vol: readonly (readonly [number, number, boolean])[] = [[84, 33, true], [90, 30, false], [96, 34, true], [103, 31, true], [109, 36, false], [114, 32, true], [89, 37, false], [100, 38, true], [118, 39, false], [78, 36, false]];
  for (const [x, y, haut] of vol) t.grille(x, y, haut ? aile : plane, { b: "#140f30" });
  // Trois plans de montagnes à contre-jour, de plus en plus sombres.
  relief(t, (x) => 50 - 9 * cretes(x + 12, 0.35), (_x, _y, p) => (p < 1 ? "#a85a70" : "#70406c"), 53);
  relief(t, (x) => 53 - 8 * cretes(x + 50, 0.8) * (0.4 + 0.6 * borne(Math.abs(x - 66) / 50)), (_x, _y, p) => (p < 1 ? "#5a3468" : "#3c2456"), 54);
  // Le lac : il renvoie l'horizon rouge et, sous l'astre, une colonne de lumière.
  const lac = ["#f4b060", "#d88052", "#a85a5c", "#7a4464", "#553462", "#3c2a58", "#2e2450", "#262048"] as const;
  for (let y = 54; y <= 66; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const p = y - 54;
      const i = Math.min(lac.length - 1, Math.floor(p * 0.78) + ((x + y) % 2 === 0 && p % 2 === 1 ? 1 : 0));
      t.poser(x, y, lac[i] ?? "#262048");
    }
    const demi = (y & 1) === 0 ? 2 + (y - 54) * 0.3 : 1;
    for (let x = Math.round(sx - demi); x <= sx + demi; x++) t.poser(x + ((y >> 1) & 1), y, Math.abs(x - sx) <= 1 ? "#f0eeff" : "#b8bcf8");
    for (let x = 0; x < LARGEUR; x++) if (alea(x, y, 3) < 0.03) t.bloc(x, y, 3, 1, y < 58 ? "#fcd088" : "#6a4a78");
  }
  // Sur la rive gauche : un village de huttes, ses feux, ses fumées.
  relief(t, (x) => 56 + (x / 44) ** 2 * 9 + onde(x, [0.8, 5, 0]), (x, _y, p) => (x < 46 && p < 1 ? "#4a3470" : x < 46 ? "#1c1638" : (t.lire(x, _y) ?? "#1c1638")), 67);
  const ombreHutte: TonsDeHutte = { mur: "#241c44", murOmbre: "#181232", toit: "#181232", toitClair: "#5a5294", toitOmbre: "#100c26", porte: "#ffb040" };
  hutte(t, 5, 58, 13, ombreHutte);
  hutte(t, 21, 60, 10, ombreHutte);
  hutte(t, 33, 63, 8, ombreHutte);
  for (const [x, y] of [[19, 58], [31, 61]] as const) {
    lueur(t, x, y, 5, 4, "#ff9a30", 0.5, 3);
    t.poser(x, y, "#ffe080");
    t.poser(x, y - 1, "#ffb040");
    for (let k = 1; k < 7; k++) t.bloc(Math.round(x + Math.sin(k * 0.9) * 1.2 + k * 0.5), y - 2 - k * 2, 1 + (k > 3 ? 1 : 0), 2, k < 4 ? "#5a4a7c" : "#4a3c70");
  }
  // Le promontoire où se tient le Gaulois : la roche, ourlée de lumière froide, et ses herbes.
  const roc = (x: number): number => 68 + onde(x, [1, 13, 0.4], [0.5, 5, 2]) - borne((x - 84) / 30) * 6 - borne((30 - x) / 30) * 2;
  relief(t, roc, (x, y, p) => (p < 1 ? "#8a8ac8" : p < 2 ? "#4a4884" : y < 75 ? "#2c2a58" : y < 78 ? "#24224c" : "#1c1a40"));
  for (let y = 70; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 4);
      if (a < 0.03) t.bloc(x, y, 2 + Math.floor(alea(x, y, 5) * 4), 1, "#1c1a40");
      else if (a < 0.045) t.bloc(x, y, 2, 1, "#3e3c74");
    }
  }
  for (let x = 0; x < LARGEUR; x++) {
    if (alea(x, 0, 6) < 0.3) {
      const y = Math.round(roc(x));
      const h = 1 + Math.floor(alea(x, 1, 6) * 3);
      for (let k = 1; k <= h; k++) t.poser(x + (k === h && alea(x, 2, 6) < 0.5 ? 1 : 0), y - k, k === h ? "#8a8ac8" : "#2c2a58");
    }
  }
  // À droite : un grand chêne à contre-jour, dont le feuillage accroche la lumière de la couronne.
  const tronc = "#0c0a22";
  branche(t, 114, 68, 111, 48, 7, 4, tronc, "#5a5a9c");
  t.bloc(108, 66, 13, 2, tronc);
  branche(t, 111, 52, 102, 44, 3, 1, tronc, "#5a5a9c");
  branche(t, 112, 50, 121, 42, 3, 1, tronc);
  feuillage(t, [[101, 46, 7, 5], [110, 43, 9, 6], [120, 45, 7, 6], [114, 51, 8, 4], [123, 53, 5, 4]], { sombre: "#0c0a22", fond: "#16143a", clair: "#4c4c94", eclat: "#a8acf0" }, 31);
  // Des fleurs pâles et des lucioles, sorties avec la nuit.
  for (let y = 44; y < 78; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const a = alea(x, y, 7);
      const bas = y > roc(x) - 9;
      if (bas && a < 0.007 && (x < 40 || x > 84 || y > 72)) {
        lueur(t, x, y, 2.5, 2.5, "#e4ff90", 0.45, 2);
        t.poser(x, y, "#f8ffd0");
      } else if (y > roc(x) + 1 && a > 0.988) {
        t.poser(x, y, "#c8ccff");
        t.poser(x, y + 1, "#4a4884");
      }
    }
  }
  return t.decor("#14122e");
}

// ───────────────────────────────────────────── Le lot ─────────────────────────────────────────────

export const LOT_D: readonly BanniereDuLot[] = [
  {
    id: "foret-doree",
    nom: "Forêt dorée",
    rarete: "commun",
    famille: "saisons",
    description: "Une forêt d'automne aux feuillages d'or et de roux, un chemin de terre couvert de feuilles sous un ciel pâle.",
    dessiner: foretDoree,
  },
  {
    id: "plage-au-couchant",
    nom: "Plage au couchant",
    rarete: "commun",
    famille: "saisons",
    description: "Une plage d'été au coucher du soleil : le soleil touche la mer, un cap et ses pins à gauche, une barque au loin.",
    dessiner: plageAuCouchant,
  },
  {
    id: "cerisiers-en-fleurs",
    nom: "Cerisiers en fleurs",
    rarete: "peu-commun",
    famille: "saisons",
    description: "Un pré au printemps sous un grand cerisier rose, des pétales au vent, une hutte et une montagne enneigée au loin.",
    dessiner: cerisiersEnFleurs,
  },
  {
    id: "nuit-de-neige",
    nom: "Nuit de neige",
    rarete: "peu-commun",
    famille: "saisons",
    description: "Une nuit d'hiver : un grand sapin illuminé à droite, une hutte sous la neige, une guirlande de lampions et des flocons.",
    dessiner: nuitDeNeige,
  },
  {
    id: "nuit-des-citrouilles",
    nom: "Nuit des citrouilles",
    rarete: "epique",
    famille: "saisons",
    description: "Une nuit violette sous une lune immense : des citrouilles sculptées qui brillent, un arbre nu, de la brume et des chauves-souris.",
    dessiner: nuitDesCitrouilles,
  },
  {
    id: "feux-du-nouvel-an",
    nom: "Feux du nouvel an",
    rarete: "epique",
    famille: "saisons",
    description: "Des feux d'artifice or, rose et bleu éclatent au-dessus d'une ville la nuit et se reflètent dans le fleuve, vus du quai.",
    dessiner: feuxDuNouvelAn,
  },
  {
    id: "aurore-du-lac-gele",
    nom: "Aurore du lac gelé",
    rarete: "mystique",
    famille: "saisons",
    description: "Une aurore boréale verte et violette ondule au-dessus d'un lac gelé qui la reflète, entre montagnes et sapins enneigés.",
    dessiner: auroreDuLacGele,
  },
  {
    id: "eclipse-totale",
    nom: "Éclipse totale",
    rarete: "legendaire",
    famille: "saisons",
    description: "Une éclipse totale : le soleil noir et sa couronne de lumière au-dessus d'un lac, d'un village et d'un horizon rougeoyant.",
    dessiner: eclipseTotale,
  },
];
