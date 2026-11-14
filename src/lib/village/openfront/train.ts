/**
 * Lot « train » du monde d'OpenFront autour du village : la gare, le rail, le viaduc, la locomotive et ses trois wagons.
 * Dessinés case par case pour ce site, à l'échelle des Gaulois (48 × 64 cases), avec les matières du village (pierre,
 * bois, torchis, chaume) et « un peu de technologie » : du fer riveté, du laiton, du verre, de la vapeur. Ce sont des
 * dessins originaux de l'idée du train : rien n'est repris des images d'OpenFront ni d'aucune autre œuvre.
 *
 * - `gare` : la salle d'attente (pierre, colombages, chaume, lucarne à horloge), le quai couvert d'une marquise de fer et
 *   de verre, le banc, les lanternes, les bagages. Une image.
 * - `rail` : 48 cases de voie qui se répètent bout à bout. Sa première rangée est le dessus du rail.
 * - `viaduc` : une arche de pierre de 168 cases qui se répète bout à bout, la voie dessus. Sa première rangée est le
 *   dessus du rail.
 * - `locomotive` : une locomotive à vapeur aux couleurs du clan, avant à droite, 4 images (un quart de tour de roue à
 *   chaque image, les bielles suivent, la fumée monte et file vers l'arrière).
 * - `wagon-marchandises` (bleu), `wagon-citerne` (blanc), `wagon-voyageurs` (rouge) : 2 images pour les roues.
 *
 * Les pièces roulantes : leur dernière rangée est le bas des roues, à poser juste au-dessus de la première rangée du rail
 * ou du viaduc. Elles s'attellent bout à bout sans espace : les tampons se touchent (`REPERES_DU_TRAIN`).
 * Ce qui éclaire (fenêtres, lanternes, fanal, foyer) garde sa couleur et ne s'allume que quand le jour baisse.
 * Rien n'est tiré au hasard à l'écran. Design : Claude Fable 5.2.
 */
import { type Decor, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import type { DessinDeBatiment } from "../batiments/type";
import type { PieceOpenFrontId } from "./index";

/* ---------- Les repères, pour poser les pièces dans le monde ---------- */

const LOCO_L = 195;
const LOCO_H = 146;
const WAGON_L = 132;
const RAIL_L = 48;
const RAIL_H = 14;
const VIADUC_L = 168;
const VIADUC_H = 190;
const GARE_L = 344;
const GARE_H = 178;
/** La hauteur du milieu des tampons au-dessus de la dernière rangée d'une pièce roulante. */
const ATTELAGE = 23;

export const REPERES_DU_TRAIN = {
  /** Le milieu des tampons, en cases au-dessus de la dernière rangée (le bas des roues) : le même pour les quatre pièces. */
  attelage: ATTELAGE,
  /** Le haut de la cheminée de la locomotive, en cases au-dessus de sa dernière rangée : plus haut, il n'y a que la fumée. */
  hautDeLaLocomotive: 101,
  /** La largeur d'un morceau de voie et d'une arche de viaduc : ils se posent tous les tant de cases. */
  pasDuRail: RAIL_L,
  pasDuViaduc: VIADUC_L,
  /** Sous cette rangée du viaduc (comptée du haut), il ne reste que les piles : on peut les enterrer ou les couper. */
  naissanceDesPiles: VIADUC_H - 96,
  /** Le quai de la gare : sa hauteur en cases au-dessus de la dernière rangée ; un Gaulois qui attend a les pieds dessus. */
  quaiDeLaGare: 10,
  /** Le milieu du seuil de la porte de la gare, et le milieu du banc, en colonnes. */
  porteDeLaGare: 78,
  bancDeLaGare: 235,
  /** Le cadran de l'horloge de la gare : colonne et rangée de son centre, rayon du cadran blanc. */
  horlogeDeLaGare: { x: 78, y: GARE_H - 1 - 118, rayon: 9 },
} as const;

/* ---------- La toile : on y dessine en hauteurs comptées depuis le bas ---------- */

type Ton = string | ((x: number, h: number) => string | null);

class Toile {
  readonly pl: Planche;
  readonly bas: number;
  constructor(
    readonly largeur: number,
    readonly hauteur: number,
  ) {
    this.pl = new Planche(largeur, hauteur);
    this.bas = hauteur - 1;
  }
  /** Une case : `h` cases au-dessus de la dernière rangée. */
  p(x: number, h: number, c: string): void {
    this.pl.poser(Math.round(x), this.bas - Math.round(h), c);
  }
  /** Un rectangle, bords compris. */
  r(x0: number, h0: number, x1: number, h1: number, c: Ton): void {
    for (let h = h0; h <= h1; h++) {
      for (let x = x0; x <= x1; x++) {
        const k = typeof c === "string" ? c : c(x, h);
        if (k) this.p(x, h, k);
      }
    }
  }
  /** Un disque : `dh` compté vers le haut, `d` la distance au centre. */
  disque(cx: number, ch: number, r: number, c: string | ((dx: number, dh: number, d: number) => string | null)): void {
    const n = Math.ceil(r);
    for (let dh = -n; dh <= n; dh++) {
      for (let dx = -n; dx <= n; dx++) {
        const d = Math.hypot(dx, dh);
        if (d > r + 0.3) continue;
        const k = typeof c === "string" ? c : c(dx, dh, d);
        if (k) this.p(cx + dx, ch + dh, k);
      }
    }
  }
  /** Un trait d'une case d'épaisseur. */
  trait(x0: number, h0: number, x1: number, h1: number, c: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(h1 - h0), 1);
    for (let k = 0; k <= n; k++) this.p(x0 + ((x1 - x0) * k) / n, h0 + ((h1 - h0) * k) / n, c);
  }
  /** La lueur d'une lampe : elle réchauffe les cases déjà dessinées autour d'elle, de moins en moins avec la distance. */
  eclairer(cx: number, ch: number, rayon: number, force: number): void {
    for (let dh = -rayon; dh <= rayon; dh++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        const d = Math.hypot(dx, dh);
        if (d > rayon || d < 7) continue;
        const c = this.pl.lire(cx + dx, this.bas - ch - dh);
        if (c) this.p(cx + dx, ch + dh, melanger(c, "#f5a83a", force * (1 - d / rayon)));
      }
    }
  }
  decor(): Decor {
    return this.pl.decor();
  }
}

/* ---------- Les matières ---------- */

interface Teinte {
  clair: string;
  fond: string;
  sombre: string;
  noir: string;
}

function matieres(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  /** Une couleur du dehors : sa teinte de jour, assombrie et bleuie la nuit. */
  const d = (couleur: string) => couleurDuDehors(couleur, melanger(couleur, "#0b1230", 0.52), l);
  const teinte = (base: string, eclat = 0.28): Teinte => ({
    clair: d(melanger(base, "#ffffff", eclat)),
    fond: d(base),
    sombre: d(melanger(base, "#070b1c", 0.3)),
    noir: d(melanger(base, "#070b1c", 0.58)),
  });
  return {
    ...paletteDuDehors(l),
    d,
    /** Les couleurs du clan : le bleu nuit, le bleu, le blanc et le rouge de son blason. */
    marine: teinte("#1f2c66", 0.22),
    bleu: teinte("#2f66d0"),
    blanc: teinte("#e4e0d2", 0.5),
    rouge: teinte("#d23a3c"),
    fer: { clair: d("#b9c1ce"), fond: d("#7d8798"), sombre: d("#4f5868"), noir: d("#2b303b") },
    suie: { clair: d("#4a4f5c"), fond: d("#2e313a"), sombre: d("#1c1e25"), noir: d("#121319") },
    laiton: { clair: d("#f6d878"), fond: d("#d2a642"), sombre: d("#966f28"), noir: d("#6a4c1a") },
    cuivre: { clair: d("#e59a68"), fond: d("#c0703f"), sombre: d("#8a4a28"), noir: d("#5a2f18") },
    creme: { clair: d("#f6edd2"), fond: d("#e6d8b0"), sombre: d("#c2b188"), noir: d("#9a8a66") },
    cuir: { clair: d("#a8683a"), fond: d("#844c28"), sombre: d("#5a3018"), noir: d("#3d2010") },
    pierre: { clair: c("#a69f90", "#565e72"), fond: c("#8c8577", "#474e62"), sombre: c("#736d61", "#393f52"), joint: c("#5a554c", "#2b3042"), trou: c("#3b362f", "#171a24") },
    ballast: { clair: c("#aaa59c", "#5a6074"), fond: c("#8a857e", "#474c60"), sombre: c("#6c6862", "#383c4e"), noir: c("#4c4944", "#262937") },
    verre: { fond: c("#8fb8cc", "#263a5c"), clair: c("#cfe6ee", "#3a5480"), sombre: c("#6a94aa", "#1c2c48") },
    fumee: { clair: c("#f4f3ee", "#8e94aa"), fond: c("#d9dadb", "#6c7288"), sombre: c("#b6bac0", "#555a70") },
    ombre: d("#15171f"),
    /** La lumière du dedans : nulle en plein jour, entière à la nuit (comme les huttes de la place). */
    veille: Math.min(1, Math.max(0, (0.8 - l.jour) / 0.5)),
  };
}
type Matieres = ReturnType<typeof matieres>;

const borner = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Le ton d'un cylindre couché, de son dessus (`t` = 0) à son dessous (`t` = 1) : un reflet en haut, l'ombre en bas. */
function tonDeCylindre(k: Teinte, t: number, mele: boolean): string {
  if (t < 0.07) return k.fond;
  if (t < 0.2 || (t < 0.25 && mele)) return k.clair;
  if (t < 0.56 || (t < 0.62 && mele)) return k.fond;
  if (t < 0.86 || (t < 0.9 && mele)) return k.sombre;
  return k.noir;
}

/** Les lettres des enseignes, 7 cases de haut. */
const LETTRES: Readonly<Record<string, readonly string[]>> = {
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  " ": ["..", "..", "..", "..", "..", "..", ".."],
};

function largeurDuTexte(texte: string): number {
  let l = -1;
  for (const lettre of texte) l += (LETTRES[lettre]?.[0]?.length ?? 0) + 1;
  return l;
}

/** Écrit un mot : `x` sa première colonne, `h` la hauteur de son pied. */
function ecrire(t: Toile, x: number, h: number, texte: string, couleur: string): void {
  let cx = x;
  for (const lettre of texte) {
    const dessin = LETTRES[lettre];
    if (!dessin) continue;
    dessin.forEach((ligne, j) => {
      for (let i = 0; i < ligne.length; i++) if (ligne[i] === "#") t.p(cx + i, h + 6 - j, couleur);
    });
    cx += dessin[0]!.length + 1;
  }
}

/** Les trois barres du blason du clan : bleu, blanc, rouge. */
function tricolore(t: Toile, m: Matieres, x: number, h: number, l: number, haut: number): void {
  t.r(x, h, x + l - 1, h + haut - 1, m.bleu.fond);
  t.r(x + l + 1, h, x + 2 * l, h + haut - 1, m.blanc.clair);
  t.r(x + 2 * l + 2, h, x + 3 * l + 1, h + haut - 1, m.rouge.fond);
}

/** Une vitre : le ciel s'y reflète le jour, la lampe du dedans l'éclaire quand le jour baisse (couleurs fixes). */
function vitre(m: Matieres, x: number, h: number, x0: number, h0: number, h1: number): string {
  const haut = (h - h0) / Math.max(1, h1 - h0);
  const reflet = (x - x0 + (h - h0)) % 9;
  const jour = reflet === 0 || reflet === 1 ? m.verre.clair : haut > 0.7 ? m.verre.sombre : m.verre.fond;
  const lampe = haut > 0.55 ? "#ffd75a" : "#f5a83a";
  return melanger(jour, lampe, m.veille * 0.92);
}

/* ---------- Les pièces communes des véhicules ---------- */

/** Un tampon au bout d'un véhicule. `sens` : −1 au bout gauche (le plateau est en `x`), 1 au bout droit (le plateau finit en `x + 4`). */
function tampon(t: Toile, m: Matieres, x: number, sens: -1 | 1): void {
  const tige = sens === -1 ? x + 2 : x;
  const plateau = sens === -1 ? x : x + 3;
  t.r(tige, ATTELAGE - 1, tige + 2, ATTELAGE + 1, (_, h) => (h === ATTELAGE + 1 ? m.fer.clair : h === ATTELAGE ? m.fer.fond : m.fer.sombre));
  t.r(plateau, ATTELAGE - 4, plateau + 1, ATTELAGE + 4, (i, h) => {
    if (h === ATTELAGE + 4) return m.fer.clair;
    if (h === ATTELAGE - 4) return m.fer.noir;
    return (sens === -1 ? i === plateau : i === plateau + 1) ? m.fer.fond : m.fer.sombre;
  });
  // La chaîne d'attelage : deux moitiés qui se rejoignent quand deux véhicules se touchent.
  for (let k = 0; k < 4; k++) {
    const cx = sens === -1 ? x + k : x + 4 - k;
    t.p(cx, 15 + k, k % 2 === 0 ? m.fer.fond : m.fer.sombre);
    if (k === 3) t.p(cx, 19, m.fer.sombre);
  }
  // Le boyau du frein.
  const bx = sens === -1 ? x + 4 : x;
  t.r(bx, 11, bx, 17, m.suie.fond);
  t.p(bx, 10, m.laiton.fond);
}

/** Une roue de wagon : un bandage d'acier, quatre rayons qui tournent d'un huitième de tour d'une image à l'autre. */
function roueDeWagon(t: Toile, m: Matieres, cx: number, r: number, image: number): void {
  const angle = (image % 2) * (Math.PI / 4) + 0.3;
  t.disque(cx, r, r, (dx, dh, d) => {
    if (d > r - 1.7) return dx - dh < -r * 0.5 ? m.fer.clair : dx - dh > r * 0.7 ? m.fer.sombre : m.fer.fond;
    if (d > r - 3.2) return m.suie.fond;
    if (d <= 2.3) return d <= 1 ? m.fer.clair : m.fer.fond;
    const a = Math.atan2(-dh, dx) - angle;
    const travers = Math.min(Math.abs(d * Math.sin(a)), Math.abs(d * Math.cos(a)));
    return travers < 1.1 ? m.suie.clair : m.ombre;
  });
}

/** Le dessous d'un wagon : tampons, longeron riveté, deux bogies de deux roues, leurs ressorts. */
function chassisDeWagon(t: Toile, m: Matieres, image: number): void {
  // Le longeron.
  t.r(7, 21, WAGON_L - 8, 27, (x, h) => {
    if (h === 27) return m.fer.fond;
    if (h === 21) return m.suie.noir;
    if (h === 24 && x % 6 === 3) return m.fer.sombre;
    return h >= 25 ? m.suie.clair : m.suie.fond;
  });
  // Les traverses de tête, rouges, et les tampons.
  for (const x of [5, WAGON_L - 8]) {
    t.r(x, 18, x + 2, 29, (i, h) => (h === 29 ? m.rouge.clair : i === x + 2 ? m.rouge.sombre : (h === 21 || h === 26) && i === x + 1 ? m.rouge.noir : m.rouge.fond));
  }
  tampon(t, m, 0, -1);
  tampon(t, m, WAGON_L - 5, 1);
  // Les bogies.
  for (const bx of [31, WAGON_L - 32]) {
    // Le pivot et la traverse danseuse, derrière les roues.
    t.r(bx - 4, 14, bx + 4, 20, (_, h) => (h === 20 ? m.suie.clair : m.suie.sombre));
    for (const cx of [bx - 12, bx + 12]) roueDeWagon(t, m, cx, 10, image);
    // Le flasque du bogie, les boîtes d'essieu, le ressort à lames.
    t.r(bx - 17, 9, bx + 17, 11, (x, h) => (h === 11 ? m.fer.fond : h === 9 ? m.suie.noir : m.fer.sombre));
    for (const cx of [bx - 12, bx + 12]) {
      t.r(cx - 3, 7, cx + 3, 13, (x, h) => {
        if (h === 13) return m.fer.clair;
        if (x === cx - 3 || x === cx + 3 || h === 7) return m.fer.sombre;
        return x === cx && h === 10 ? m.laiton.clair : m.fer.fond;
      });
    }
    for (let k = -8; k <= 8; k++) {
      const creux = Math.round(2.2 * (1 - (k * k) / 64));
      t.p(bx + k, 15 - creux, m.fer.sombre);
      t.p(bx + k, 16 - creux, m.fer.fond);
      if (Math.abs(k) < 6) t.p(bx + k, 17 - creux, m.fer.clair);
    }
    t.r(bx - 1, 12, bx + 1, 16, m.fer.noir);
  }
}

/** Entre les deux bogies : le tirant du châssis et le réservoir du frein. */
function tirantEtReservoir(t: Toile, m: Matieres): void {
  t.trait(50, 20, 57, 14, m.fer.sombre);
  t.trait(57, 14, 75, 14, m.fer.sombre);
  t.trait(75, 14, 82, 20, m.fer.sombre);
  t.r(57, 15, 57, 20, m.fer.noir);
  t.r(75, 15, 75, 20, m.fer.noir);
  t.r(60, 15, 72, 20, (x, h) => {
    if ((x === 60 || x === 72) && (h === 15 || h === 20)) return null;
    if (x === 63 || x === 69) return m.fer.noir;
    return h >= 19 ? m.fer.clair : h >= 17 ? m.fer.fond : m.fer.sombre;
  });
  t.r(73, 17, 76, 17, m.cuivre.fond);
}

/** Un toit de wagon bombé : `x0` à `x1`, de `h0` à `h1`, plus bas aux deux bouts. */
function toitDeWagon(t: Toile, k: Teinte, x0: number, x1: number, h0: number, h1: number): void {
  const haut = h1 - h0;
  for (let x = x0; x <= x1; x++) {
    const bord = Math.min(x - x0, x1 - x);
    const baisse = bord < 2 ? 3 : bord < 4 ? 2 : bord < 8 ? 1 : 0;
    for (let h = h0; h <= h1 - baisse; h++) {
      const rang = h - h0;
      let c = rang === 0 ? k.noir : rang >= haut - baisse - 1 ? k.clair : rang >= haut - baisse - 3 ? k.fond : k.sombre;
      if ((x - x0) % 20 === 10 && rang > 0) c = k.sombre;
      t.p(x, h, c);
    }
  }
}

/* ---------- La locomotive ---------- */

const ROUES_MOTRICES = [66, 102, 138] as const;
const RAYON_MOTEUR = 17;
const MANIVELLE = 9;
const BIELLE = 44;

/** Les bouffées de la cheminée : elles montent et filent vers l'arrière, chacune prend la place de la suivante en un tour d'images. */
function fumee(t: Toile, m: Matieres, x0: number, h0: number, image: number, images: number): void {
  const N = 6;
  for (let i = N - 1; i >= 0; i--) {
    const a = (i + image / images) / N;
    const cx = Math.round(x0 - 78 * Math.pow(a, 1.35));
    const ch = Math.round(h0 + 3 + 30 * (1 - (1 - a) * (1 - a)));
    const r = 3.4 + 7.6 * a;
    const boules = [
      { x: 0, h: 0, r },
      { x: -0.75 * r, h: -0.2 * r, r: 0.66 * r },
      { x: 0.7 * r, h: 0.25 * r, r: 0.6 * r },
      { x: -0.1 * r, h: 0.6 * r, r: 0.55 * r },
    ];
    for (const b of boules) {
      t.disque(Math.round(cx + b.x), Math.round(ch + b.h), b.r, (dx, dh) => {
        const x = Math.round(cx + b.x) + dx;
        const h = Math.round(ch + b.h) + dh;
        // Plus la bouffée est vieille, plus elle est clairsemée : en damier, puis une case sur quatre.
        if (a > 0.82 && (x % 2 !== 0 || h % 2 !== 0)) return null;
        if (a > 0.52 && a <= 0.82 && (x + h) % 2 !== 0) return null;
        const pente = (dh - dx * 0.4) / b.r;
        return pente > 0.35 ? m.fumee.clair : pente < -0.45 ? m.fumee.sombre : m.fumee.fond;
      });
    }
  }
}

/** Une roue motrice : bandage d'acier, jante rouge, huit rayons, un contrepoids à l'opposé du bouton de manivelle. */
function roueMotrice(t: Toile, m: Matieres, cx: number, angle: number): void {
  const r = RAYON_MOTEUR;
  t.disque(cx, r, r, (dx, dh, d) => {
    if (d > r - 1.7) return dx - dh < -r * 0.5 ? m.fer.clair : dx - dh > r * 0.7 ? m.fer.sombre : m.fer.fond;
    if (d > r - 4.2) return dx - dh < -3 ? m.rouge.fond : m.rouge.sombre;
    if (d <= 3.4) return d <= 1.2 ? m.laiton.clair : m.rouge.clair;
    const a = Math.atan2(-dh, dx) - angle;
    // Le contrepoids : un croissant plein, à l'opposé du bouton.
    if (Math.cos(a) < -0.72 && d > 6.5) return m.rouge.sombre;
    const rayon = Math.abs(d * Math.sin(4 * a)) / 4;
    return rayon < 0.95 ? m.rouge.fond : m.ombre;
  });
}

/** Une bielle : une barre d'acier de trois cases d'épaisseur entre deux boutons. */
function bielle(t: Toile, m: Matieres, x0: number, h0: number, x1: number, h1: number): void {
  const n = Math.max(1, Math.round(Math.abs(x1 - x0)));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / n);
    const h = Math.round(h0 + ((h1 - h0) * k) / n);
    t.p(x, h + 1, m.fer.clair);
    t.p(x, h, m.fer.fond);
    t.p(x, h - 1, m.fer.sombre);
  }
  for (const [x, h] of [
    [x0, h0],
    [x1, h1],
  ] as const) {
    t.disque(Math.round(x), Math.round(h), 2.6, (dx, dh, d) => (d <= 1 ? m.laiton.clair : dh > 0 ? m.fer.clair : m.fer.fond));
  }
}

function dessinerLocomotive(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const t = new Toile(LOCO_L, LOCO_H);
  const pas = ((image % 4) + 4) % 4;
  const angle = -0.7 + (pas * Math.PI) / 2;

  fumee(t, m, 170, 102, pas, 4);

  // Le châssis : une tôle rivetée derrière les roues, le cendrier du foyer et sa lueur.
  t.r(8, 20, 185, 37, (x, h) => {
    if (h === 37) return m.suie.clair;
    if ((h === 34 || h === 23) && x % 8 === 4) return m.fer.sombre;
    return h < 23 ? m.suie.noir : m.suie.fond;
  });
  t.r(46, 19, 60, 30, (x, h) => {
    if (h >= 24 && h <= 27 && x >= 49 && x <= 57) return (x + h) % 3 === 0 ? "#ffd75a" : h >= 26 ? "#f58a1f" : "#e2452a";
    return m.suie.noir;
  });
  // Les traverses de tête, rouges et rivetées.
  for (const x of [5, 186]) {
    t.r(x, 18, x + 3, 29, (i, h) => {
      if (h === 29) return m.rouge.clair;
      if (i === x + 3) return m.rouge.sombre;
      return (h === 21 || h === 26) && i === x + 1 ? m.rouge.noir : m.rouge.fond;
    });
  }
  tampon(t, m, 0, -1);
  tampon(t, m, 190, 1);
  // Le chasse-pierres, sous la traverse avant.
  for (let k = 0; k < 8; k++) {
    t.p(187, 17 - k, m.fer.sombre);
    t.p(188 + Math.floor(k / 3), 17 - k, m.fer.fond);
  }

  // Les roues : la porteuse sous l'abri, puis les trois motrices.
  roueDeWagon(t, m, 38, 9, pas);
  t.r(35, 6, 41, 12, (x, h) => (h === 12 ? m.fer.clair : x === 35 || x === 41 || h === 6 ? m.fer.sombre : x === 38 && h === 9 ? m.laiton.clair : m.fer.fond));
  for (const cx of ROUES_MOTRICES) roueMotrice(t, m, cx, angle);

  // Les sabots de frein, entre les roues.
  for (const x of [84, 120]) {
    t.r(x - 1, 12, x + 1, 22, (i) => (i === x - 1 ? m.fer.fond : m.fer.sombre));
    t.r(x - 2, 20, x + 2, 22, m.fer.noir);
  }

  // Les glissières et la tige du piston.
  const boutonX = (cx: number) => cx + MANIVELLE * Math.cos(angle);
  const boutonH = RAYON_MOTEUR - MANIVELLE * Math.sin(angle);
  const crosse = Math.round(boutonX(102) + Math.sqrt(BIELLE * BIELLE - (boutonH - RAYON_MOTEUR) * (boutonH - RAYON_MOTEUR)));
  t.r(130, 22, 158, 23, (_, h) => (h === 23 ? m.fer.clair : m.fer.sombre));
  t.r(130, 11, 158, 12, (_, h) => (h === 12 ? m.fer.fond : m.fer.noir));
  t.r(130, 11, 131, 23, m.fer.sombre);
  t.r(crosse, 17, 158, 17, m.fer.clair);
  t.r(crosse, 16, 158, 16, m.fer.sombre);
  // La bielle d'accouplement relie les trois roues ; la bielle motrice va de la roue du milieu à la crosse du piston.
  bielle(t, m, boutonX(66), boutonH, boutonX(138), boutonH);
  t.disque(Math.round(boutonX(102)), Math.round(boutonH), 2.6, (dx, dh, d) => (d <= 1 ? m.laiton.clair : dh > 0 ? m.fer.clair : m.fer.fond));
  bielle(t, m, boutonX(102), boutonH, crosse, RAYON_MOTEUR);
  t.r(crosse - 3, 13, crosse + 3, 21, (x, h) => {
    if (h === 21) return m.fer.clair;
    if (h === 13 || x === crosse + 3) return m.fer.sombre;
    return x === crosse && h === 17 ? m.laiton.clair : m.fer.fond;
  });

  // Le cylindre, ses fonds de laiton, son tiroir, ses purgeurs.
  t.r(158, 7, 180, 29, (x, h) => {
    if ((x === 158 || x === 180) && (h === 7 || h === 29)) return null;
    if (x <= 159 || x >= 179) return h > 22 ? m.laiton.clair : h > 12 ? m.laiton.fond : m.laiton.sombre;
    if (x === 169) return m.marine.noir;
    return tonDeCylindre(m.marine, (29 - h) / 22, (x + h) % 2 === 0);
  });
  t.r(162, 30, 177, 35, (x, h) => (h === 35 ? m.suie.clair : x === 162 || x === 177 ? m.suie.noir : (x === 166 || x === 173) && h === 32 ? m.fer.fond : m.suie.fond));
  for (const x of [163, 175]) {
    t.r(x, 4, x, 6, m.laiton.sombre);
    t.p(x + 1, 4, m.laiton.fond);
  }

  // Le tablier et son bandeau rouge ; un marchepied à l'avant.
  t.r(52, 36, 189, 37, (x, h) => (h === 37 ? m.rouge.fond : x % 12 === 6 ? m.rouge.noir : m.rouge.sombre));
  t.r(52, 38, 189, 39, (_, h) => (h === 39 ? m.fer.clair : m.fer.fond));
  t.r(181, 30, 185, 31, m.fer.fond);
  t.r(183, 32, 183, 35, m.fer.sombre);

  // La chaudière : un long cylindre bleu nuit, cerclé de laiton.
  t.r(54, 40, 160, 41, m.suie.noir);
  t.r(54, 42, 160, 80, (x, h) => {
    const ton = tonDeCylindre(m.marine, (80 - h) / 38, (x + h) % 2 === 0);
    if (x === 84 || x === 85 || x === 110 || x === 111 || x === 136 || x === 137) return h > 72 ? m.laiton.clair : h > 54 ? m.laiton.fond : m.laiton.sombre;
    if (x === 86 || x === 112 || x === 138) return m.marine.noir;
    // Une rangée de rivets le long du corps.
    if (h === 61 && x % 6 === 2) return m.marine.clair;
    return ton;
  });
  // Le foyer, plus haut et carré, à l'arrière.
  t.r(54, 40, 76, 84, (x, h) => {
    if (h === 84) return m.marine.clair;
    if (x === 76) return m.marine.noir;
    if ((x === 58 || x === 72) && h % 5 === 2) return m.fer.fond;
    if (h > 80) return m.marine.fond;
    return tonDeCylindre(m.marine, (84 - h) / 44, (x + h) % 2 === 0);
  });
  // La main courante et ses supports ; le tuyau de cuivre qui descend au cylindre.
  t.r(60, 68, 158, 68, m.fer.clair);
  for (let x = 62; x <= 158; x += 24) t.r(x, 66, x, 67, m.fer.sombre);
  t.r(78, 50, 150, 50, m.cuivre.fond);
  t.r(78, 51, 150, 51, m.cuivre.clair);
  t.r(150, 40, 151, 51, (x) => (x === 150 ? m.cuivre.clair : m.cuivre.sombre));
  t.r(96, 46, 97, 49, m.cuivre.sombre);
  t.r(94, 44, 99, 46, m.laiton.fond);

  // La boîte à fumée, noire, rivetée, sa selle et sa porte bombée.
  t.r(160, 36, 177, 41, (x, h) => (h === 41 ? m.suie.clair : m.suie.sombre));
  t.r(160, 40, 180, 82, (x, h) => {
    if (x === 160) return m.suie.noir;
    if ((x === 163 || x === 178) && h % 4 === 1) return m.fer.sombre;
    return tonDeCylindre(m.suie, (82 - h) / 42, (x + h) % 2 === 0);
  });
  t.r(181, 45, 182, 77, (x, h) => (h > 68 ? m.suie.clair : h > 54 ? m.suie.fond : m.suie.sombre));
  t.r(183, 50, 183, 72, m.suie.sombre);
  t.r(183, 60, 184, 62, m.fer.clair);
  t.r(181, 66, 183, 66, m.fer.fond);
  t.r(181, 55, 183, 55, m.fer.fond);

  // La cheminée : une embase, un fût, un chapiteau de laiton.
  t.r(162, 82, 178, 84, (x, h) => (h === 84 ? m.suie.clair : x > 174 ? m.suie.noir : m.suie.fond));
  t.r(165, 85, 175, 96, (x) => (x <= 166 ? m.suie.clair : x >= 173 ? m.suie.noir : x >= 171 ? m.suie.sombre : m.suie.fond));
  t.r(163, 97, 177, 99, (x, h) => (x <= 165 ? m.laiton.clair : x >= 174 ? m.laiton.sombre : h === 99 ? m.laiton.clair : m.laiton.fond));
  t.r(164, 100, 176, 101, (x, h) => (h === 101 ? (x <= 168 ? m.laiton.clair : m.laiton.fond) : m.laiton.sombre));
  t.r(166, 101, 174, 101, m.suie.noir);

  // Le dôme de vapeur en laiton, le dôme de la sablière, les soupapes, le sifflet.
  for (let x = 110; x <= 126; x++) {
    const dx = x - 118;
    const haut = 81 + Math.round(13 * Math.sqrt(Math.max(0, 1 - (dx * dx) / 81)));
    for (let h = 79; h <= (Math.abs(dx) > 8 ? 81 : haut); h++) {
      t.p(x, h, h <= 80 ? m.laiton.sombre : dx < -4 ? m.laiton.clair : dx > 4 ? m.laiton.sombre : dx > 1 ? m.laiton.fond : h > 90 ? m.laiton.clair : m.laiton.fond);
    }
  }
  t.r(117, 95, 119, 96, m.laiton.sombre);
  t.p(118, 97, m.laiton.clair);
  for (let x = 88; x <= 100; x++) {
    const dx = x - 94;
    const haut = 80 + Math.round(8 * Math.sqrt(Math.max(0, 1 - (dx * dx) / 42)));
    for (let h = 79; h <= haut; h++) t.p(x, h, dx < -3 ? m.marine.clair : dx > 3 ? m.marine.noir : h === haut ? m.marine.clair : m.marine.fond);
  }
  t.r(93, 89, 95, 89, m.laiton.fond);
  for (const x of [62, 67]) {
    t.r(x, 85, x + 2, 90, (i, h) => (h === 90 ? m.laiton.clair : i === x + 2 ? m.laiton.sombre : m.laiton.fond));
    t.p(x + 1, 91, m.laiton.sombre);
  }
  t.r(142, 80, 143, 88, (x) => (x === 142 ? m.laiton.clair : m.laiton.sombre));
  t.r(141, 89, 144, 91, (x, h) => (h === 91 ? m.laiton.clair : m.laiton.fond));
  t.p(145, 90, m.laiton.sombre);

  // Le fanal, devant la cheminée : il s'allume quand le jour baisse.
  t.r(179, 83, 181, 84, m.suie.fond);
  t.r(177, 85, 184, 93, (x, h) => {
    if (h === 93) return m.suie.clair;
    if (x === 177 || h === 85) return m.suie.noir;
    return m.suie.fond;
  });
  t.r(179, 94, 182, 94, m.laiton.fond);
  t.r(185, 86, 186, 92, (x, h) => melanger(h > 89 ? m.verre.clair : m.verre.fond, x === 185 ? "#fff1a8" : "#ffd75a", m.veille));
  t.r(187, 87, 187, 91, melanger(m.laiton.sombre, "#ffd75a", m.veille * 0.6));

  // La soute à charbon, derrière l'abri.
  t.r(8, 38, 15, 76, (x, h) => {
    if (h === 76) return m.marine.clair;
    if (x === 8) return m.marine.clair;
    if (h % 9 === 3 && x % 3 === 1) return m.fer.sombre;
    return h > 70 ? m.marine.fond : m.marine.sombre;
  });
  t.r(8, 77, 15, 80, (x, h) => {
    const a = alea(x, h + 7);
    if (h === 80 && a < 0.5) return null;
    if (h === 79 && a < 0.2) return null;
    return a < 0.3 ? m.suie.clair : a < 0.7 ? m.suie.sombre : m.suie.noir;
  });

  // L'abri du mécanicien : une porte ouverte sur le foyer, une fenêtre, le nom du clan et ses trois couleurs.
  t.r(16, 38, 56, 92, (x, h) => {
    if (x === 16) return m.marine.clair;
    if (x === 56) return m.marine.noir;
    if (h >= 90) return m.marine.sombre;
    return (x + h * 3) % 23 === 0 ? m.marine.sombre : m.marine.fond;
  });
  // Le filet de laiton autour du panneau.
  t.r(28, 41, 54, 60, (x, h) => (x === 28 || x === 54 || h === 41 || h === 60 ? m.laiton.fond : null));
  ecrire(t, 33, 50, "GAL", m.blanc.clair);
  tricolore(t, m, 33, 44, 5, 3);
  // La porte : le dedans sombre, rougi par le foyer.
  t.r(18, 40, 26, 86, (x, h) => {
    const lueur = borner(1 - (h - 40) / 40, 0, 1) * (0.35 + 0.45 * m.veille);
    return melanger(m.ombre, "#e2702a", lueur * (x > 21 ? 1 : 0.7));
  });
  t.r(18, 62, 26, 63, m.marine.noir);
  t.r(17, 44, 17, 84, m.laiton.fond);
  t.r(27, 44, 27, 84, m.laiton.clair);
  // La fenêtre et son cadre de laiton.
  t.r(31, 64, 52, 87, (x, h) => {
    if (x === 31 || x === 52 || h === 64 || h === 87) return m.laiton.fond;
    if (x === 41) return m.laiton.sombre;
    return vitre(m, x, h, 31, 64, 87);
  });
  // Le toit, bombé, qui déborde, et son aérateur.
  toitDeWagon(t, m.fer, 6, 62, 93, 98);
  t.r(30, 98, 40, 99, (_, h) => (h === 99 ? m.fer.clair : m.fer.sombre));
  // Le marchepied de l'abri.
  t.r(17, 6, 17, 21, m.fer.sombre);
  t.r(27, 6, 27, 21, m.fer.sombre);
  t.r(16, 6, 28, 7, (_, h) => (h === 7 ? m.fer.clair : m.fer.fond));
  t.r(16, 14, 28, 15, (_, h) => (h === 15 ? m.fer.clair : m.fer.fond));
  return t.decor();
}

/* ---------- Le wagon de marchandises ---------- */

const MARCHANDISES_H = 92;

function dessinerWagonDeMarchandises(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const t = new Toile(WAGON_L, MARCHANDISES_H);
  chassisDeWagon(t, m, image);
  tirantEtReservoir(t, m);

  // La caisse : des planches debout peintes en bleu, cerclées de fers.
  t.r(8, 28, 123, 80, (x, h) => {
    const k = (x - 8) % 6;
    if (h >= 78) return m.bleu.noir;
    if (k === 5) return m.bleu.noir;
    if (alea(x, h + 31) < 0.035) return m.bleu.sombre;
    const planche = Math.floor((x - 8) / 6);
    return planche % 3 === 1 ? m.bleu.sombre : k === 0 ? m.bleu.clair : m.bleu.fond;
  });
  // Les montants et les écharpes de fer.
  for (const x of [8, 44, 88, 121]) {
    t.r(x, 28, x + 2, 79, (i, h) => (h % 10 === 4 && i === x + 1 ? m.fer.clair : i === x ? m.fer.fond : i === x + 2 ? m.fer.noir : m.fer.sombre));
  }
  for (let k = 0; k <= 32; k++) {
    const h = 30 + Math.round((k * 46) / 32);
    for (const x of [11 + k, 120 - k]) {
      t.p(x, h, m.fer.sombre);
      t.p(x, h + 1, m.fer.fond);
    }
  }
  t.r(8, 28, 123, 29, (x, h) => (h === 29 ? m.fer.fond : m.fer.noir));

  // La porte coulissante, entrouverte : on voit les caisses et les sacs.
  t.r(47, 30, 60, 77, (_, h) => {
    // Le dedans : dans l'ombre.
    if (h <= 31) return m.bois.sombre;
    return melanger(m.ombre, m.bois.creux, 0.5);
  });
  // Une caisse marquée, un sac par-dessus.
  t.r(48, 32, 60, 46, (x, h) => (x === 48 || h === 46 || h === 32 || (x - 48 === 46 - h) ? m.bois.sombre : (h - 32) % 5 === 4 ? m.bois.fond : m.bois.autre));
  t.r(49, 47, 59, 55, (x, h) => {
    if ((x === 49 || x === 59) && (h === 47 || h === 55)) return null;
    if (x === 56) return m.bois.cordeSombre;
    return h > 52 ? m.creme.fond : h > 49 ? m.creme.sombre : m.creme.noir;
  });
  t.r(61, 30, 87, 77, (x, h) => {
    const k = (x - 61) % 6;
    if (x === 61) return m.blanc.clair;
    if (x === 87 || h === 30) return m.blanc.noir;
    if (h === 77) return m.blanc.clair;
    if (k === 0) return m.blanc.noir;
    if (alea(x, h + 77) < 0.04) return m.blanc.sombre;
    return m.blanc.fond;
  });
  // Les deux bandes du clan en travers de la porte, sa poignée, son loquet.
  for (let x = 63; x <= 85; x++) {
    for (let e = 0; e < 4; e++) {
      t.p(x, 36 + (x - 63) + e, m.bleu.fond);
      t.p(x, 46 + (x - 63) + e, m.rouge.fond);
    }
  }
  t.r(62, 66, 86, 76, (x, h) => (h > 77 ? null : x === 62 || x === 86 ? null : (x - 61) % 6 === 0 ? m.blanc.noir : m.blanc.fond));
  t.r(63, 50, 64, 58, (x) => (x === 63 ? m.fer.clair : m.fer.sombre));
  t.r(84, 44, 86, 46, m.fer.noir);
  // Le rail de la porte, en haut et en bas, et ses galets.
  t.r(45, 78, 122, 79, (_, h) => (h === 79 ? m.fer.clair : m.fer.sombre));
  t.r(45, 29, 122, 29, m.fer.clair);
  for (const x of [65, 82]) t.r(x, 76, x + 2, 78, m.fer.noir);

  // Le nom du clan au pochoir, et les marques de charge.
  ecrire(t, 18, 62, "GAL", m.blanc.clair);
  t.r(16, 54, 36, 60, (x, h) => (x === 16 || x === 36 || h === 54 || h === 60 ? m.blanc.clair : m.marine.sombre));
  tricolore(t, m, 18, 56, 5, 3);
  for (const [x, h, n] of [
    [94, 66, 14],
    [94, 62, 10],
    [94, 58, 16],
    [100, 40, 12],
    [100, 36, 8],
  ] as const) {
    t.r(x, h, x + n, h + 1, (i) => ((i - x) % 5 === 4 ? null : m.blanc.sombre));
  }
  // L'échelle du bout et le volant du frein.
  t.r(112, 30, 112, 82, m.fer.fond);
  t.r(118, 30, 118, 82, m.fer.sombre);
  for (let h = 34; h <= 80; h += 7) t.r(113, h, 117, h, m.fer.clair);

  // Le toit bombé, gris clair, et sa passerelle.
  toitDeWagon(t, m.fer, 6, 125, 80, 87);
  t.r(14, 88, 117, 89, (x, h) => (h === 89 ? m.bois.clair : x % 12 === 0 ? m.bois.creux : m.bois.fond));
  for (let x = 20; x <= 112; x += 23) t.r(x, 87, x + 1, 87, m.bois.sombre);
  t.disque(121, 88, 3, (dx, dh, d) => (d > 2 ? m.fer.noir : d < 1 ? m.fer.clair : null));
  return t.decor();
}

/* ---------- Le wagon-citerne ---------- */

const CITERNE_H = 92;

function dessinerWagonCiterne(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const t = new Toile(WAGON_L, CITERNE_H);
  chassisDeWagon(t, m, image);
  // La vanne de vidange et son tuyau, entre les bogies.
  t.r(64, 14, 68, 31, (x) => (x === 64 ? m.fer.clair : x === 68 ? m.fer.noir : m.fer.fond));
  t.r(61, 13, 71, 15, (_, h) => (h === 15 ? m.laiton.clair : m.laiton.fond));
  t.r(72, 17, 78, 18, m.rouge.fond);
  t.r(78, 15, 79, 20, m.rouge.sombre);
  t.trait(50, 20, 60, 16, m.fer.sombre);
  t.trait(72, 16, 82, 20, m.fer.sombre);

  // Le plancher de tôle et les berceaux qui portent la cuve.
  t.r(7, 28, 124, 29, (x, h) => (h === 29 ? m.fer.fond : m.fer.noir));
  for (const x of [20, 58, 96]) {
    t.r(x, 30, x + 15, 38, (i, h) => {
      const creux = Math.abs(i - x - 7.5) < 8 - (h - 30) * 0.5;
      if (!creux) return null;
      return h === 30 ? m.marine.noir : i === x || i === x + 15 ? m.marine.clair : (i + h) % 5 === 0 ? m.fer.sombre : m.marine.fond;
    });
  }

  // La cuve : un cylindre blanc aux bouts bombés, trois viroles rivetées, les couleurs du clan au milieu.
  const H0 = 33;
  const H1 = 76;
  const milieu = (H0 + H1) / 2;
  const demi = (H1 - H0) / 2;
  for (let h = H0; h <= H1; h++) {
    const e = (h - milieu) / demi;
    const retrait = Math.round(9 * (1 - Math.sqrt(Math.max(0, 1 - e * e))));
    const x0 = 9 + retrait;
    const x1 = 122 - retrait;
    for (let x = x0; x <= x1; x++) {
      const bout = Math.min(x - x0, x1 - x);
      let k: Teinte = m.blanc;
      if (x >= 53 && x <= 60) k = m.bleu;
      else if (x >= 71 && x <= 78) k = m.rouge;
      let c = tonDeCylindre(k, (H1 - h) / (H1 - H0), (x + h) % 2 === 0);
      // Les bouts bombés tournent vers l'ombre à droite, vers la lumière à gauche.
      if (x1 - x < 4 && c !== k.noir) c = k.sombre;
      if (x - x0 < 2 && c === k.fond) c = k.clair;
      // Les viroles : un cordon de soudure et ses rivets.
      if (x === 31 || x === 100 || x === 51 || x === 80) c = (h - H0) % 4 === 1 ? m.fer.fond : k.sombre === c || k.noir === c ? m.blanc.noir : m.blanc.sombre;
      if (bout === 0) c = x === x0 ? m.blanc.sombre : m.blanc.noir;
      t.p(x, h, c);
    }
  }
  // Les sangles de fer, par-dessus la cuve, jusqu'aux berceaux.
  for (const x of [26, 105]) {
    t.r(x, H0 + 1, x + 1, H1, (i, h) => (h > 68 ? m.fer.clair : h > 52 ? m.fer.fond : m.fer.sombre));
  }
  // Le nom du clan sur la cuve.
  ecrire(t, 33, 53, "GAL", m.marine.fond);
  tricolore(t, m, 83, 55, 4, 3);

  // Le dôme et son trou d'homme, la soupape, la passerelle et son garde-corps.
  t.r(58, 77, 74, 83, (x, h) => {
    if ((x === 58 || x === 74) && h === 83) return null;
    if (h === 83) return m.blanc.clair;
    return x < 62 ? m.blanc.clair : x > 70 ? m.blanc.noir : x > 67 ? m.blanc.sombre : m.blanc.fond;
  });
  t.r(57, 76, 75, 77, m.fer.sombre);
  t.r(61, 84, 71, 85, (x, h) => (h === 85 ? m.fer.clair : m.fer.fond));
  t.r(65, 86, 67, 86, m.fer.sombre);
  t.r(62, 87, 70, 87, m.rouge.fond);
  t.r(66, 86, 66, 88, m.rouge.sombre);
  t.r(80, 77, 81, 81, m.laiton.fond);
  t.r(79, 82, 82, 82, m.laiton.clair);
  t.r(34, 77, 98, 77, m.fer.sombre);
  t.r(34, 78, 56, 78, (x) => (x % 2 === 0 ? m.fer.fond : m.fer.clair));
  t.r(76, 78, 98, 78, (x) => (x % 2 === 0 ? m.fer.fond : m.fer.clair));
  t.r(34, 87, 56, 87, m.fer.fond);
  t.r(76, 87, 98, 87, m.fer.fond);
  for (const x of [34, 45, 56, 76, 87, 98]) t.r(x, 79, x, 87, m.fer.sombre);

  // L'échelle, du châssis à la passerelle, et la plaque de danger sans texte remplacée par les trois couleurs.
  t.r(88, 28, 88, 78, m.fer.fond);
  t.r(94, 28, 94, 78, m.fer.sombre);
  for (let h = 31; h <= 76; h += 6) t.r(89, h, 93, h, m.fer.clair);
  // Les mains courantes des bouts.
  for (const x of [9, 121]) {
    t.r(x, 30, x + 1, 44, (i) => (i === x ? m.fer.fond : m.fer.sombre));
    t.r(x - 1, 44, x + 2, 44, m.fer.clair);
  }
  return t.decor();
}

/* ---------- Le wagon de voyageurs ---------- */

const VOYAGEURS_H = 96;

function dessinerWagonDeVoyageurs(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const t = new Toile(WAGON_L, VOYAGEURS_H);
  chassisDeWagon(t, m, image);
  tirantEtReservoir(t, m);
  // La batterie, sous la caisse.
  t.r(86, 14, 94, 20, (x, h) => (h === 20 ? m.fer.fond : x === 86 || x === 94 ? m.fer.noir : h === 17 ? m.fer.noir : m.fer.sombre));

  // La caisse : le bas rouge, la ceinture bleue, la bande des fenêtres crème, le bandeau bleu nuit.
  t.r(8, 28, 123, 84, (x, h) => {
    if (x === 8) return h < 52 ? m.rouge.clair : h < 76 ? m.creme.clair : m.marine.clair;
    if (x === 123) return h < 52 ? m.rouge.noir : h < 76 ? m.creme.noir : m.marine.noir;
    if (h === 28) return m.rouge.noir;
    if (h < 50) {
      // Les panneaux moulurés du bas.
      const k = (x - 12) % 18;
      if (h === 31 || h === 47) return x > 11 && x < 120 && k !== 17 ? m.laiton.fond : m.rouge.fond;
      if (h > 31 && h < 47 && (k === 0 || k === 16)) return m.laiton.fond;
      if (alea(x, h) < 0.03) return m.rouge.sombre;
      return h > 44 ? m.rouge.clair : h < 33 ? m.rouge.sombre : m.rouge.fond;
    }
    if (h < 52) return h === 51 ? m.bleu.clair : m.bleu.fond;
    if (h < 76) return h === 75 ? m.creme.sombre : h === 52 ? m.creme.sombre : m.creme.fond;
    if (h === 76) return m.laiton.fond;
    return h >= 83 ? m.marine.noir : m.marine.fond;
  });
  ecrire(t, 56, 77, "GAL", m.laiton.clair);
  tricolore(t, m, 30, 79, 6, 2);
  tricolore(t, m, 82, 79, 6, 2);

  // Les six fenêtres : éclairées du dedans quand le jour baisse ; on devine les dossiers et le filet à bagages.
  for (let k = 0; k < 6; k++) {
    const x0 = 26 + k * 14;
    t.r(x0, 54, x0 + 10, 73, (x, h) => {
      if ((x === x0 || x === x0 + 10) && h === 73) return m.creme.sombre;
      if (x === x0 || x === x0 + 10 || h === 54 || h === 73) return m.marine.fond;
      // Le dossier d'un siège, en ombre ; le filet à bagages, un trait.
      if (h <= 59 && x >= x0 + 2 && x <= x0 + 5 && !(h === 59 && (x === x0 + 2 || x === x0 + 5))) return melanger(m.marine.noir, "#7a3a20", m.veille * 0.6);
      if (h === 70 && x > x0 + 1) return melanger(m.verre.sombre, "#c9722a", m.veille);
      // Un rideau replié, côté droit.
      if (x >= x0 + 8 && h > 60) return melanger(m.rouge.sombre, "#d86a3c", m.veille * 0.7);
      return vitre(m, x, h, x0, 54, 73);
    });
    t.r(x0 - 1, 53, x0 + 11, 53, m.creme.clair);
  }
  // Les deux portes des bouts : une vitre, une poignée de laiton, un marchepied.
  for (const x0 of [11, 111]) {
    t.r(x0, 29, x0 + 10, 80, (x, h) => {
      if (x === x0 || x === x0 + 10 || h === 80) return m.marine.noir;
      if (h >= 56 && h <= 73 && x >= x0 + 2 && x <= x0 + 8) return x === x0 + 2 || x === x0 + 8 || h === 56 || h === 73 ? m.marine.fond : vitre(m, x, h, x0, 56, 73);
      if (h < 50) return h > 33 && h < 46 && x > x0 + 2 && x < x0 + 8 ? m.rouge.sombre : m.rouge.fond;
      if (h < 52) return m.bleu.fond;
      return h > 75 ? m.marine.fond : m.creme.fond;
    });
    t.r(x0 + 8, 46, x0 + 8, 50, m.laiton.clair);
    t.r(x0 - 1, 22, x0 + 11, 23, (_, h) => (h === 23 ? m.fer.clair : m.fer.sombre));
    t.r(x0 + 1, 16, x0 + 9, 17, (_, h) => (h === 17 ? m.fer.clair : m.fer.sombre));
    t.r(x0 + 1, 18, x0 + 1, 21, m.fer.sombre);
    t.r(x0 + 9, 18, x0 + 9, 21, m.fer.sombre);
    // La main montoire.
    t.r(x0 - 2, 34, x0 - 2, 62, m.laiton.fond);
  }
  // Les soufflets des bouts.
  for (const x of [6, 124]) t.r(x, 30, x + 1, 80, (i, h) => (h % 4 < 2 ? m.suie.fond : m.suie.noir));

  // Le toit : bombé, bleu nuit, ses aérateurs et sa lanterne de queue.
  toitDeWagon(t, m.marine, 5, 126, 85, 91);
  for (let x = 22; x <= 106; x += 21) {
    t.r(x, 92, x + 5, 93, (i, h) => (h === 93 ? m.fer.clair : m.fer.sombre));
    t.r(x + 1, 94, x + 4, 94, m.fer.fond);
  }
  return t.decor();
}

/* ---------- Le rail ---------- */

/** Le dessus d'une voie : rail, selles et tire-fonds, bouts des traverses tous les 12 cases, ballast. `haut` : la hauteur du dessus du rail. */
function poserVoie(t: Toile, m: Matieres, x0: number, x1: number, haut: number, eclisse: number | null): void {
  for (let x = x0; x <= x1; x++) {
    const k = ((x % 12) + 12) % 12;
    const traverse = k >= 2 && k <= 9;
    // Le rail : le champignon brillant d'usure, l'âme dans l'ombre, le patin.
    t.p(x, haut, m.fer.clair);
    t.p(x, haut - 1, m.fer.fond);
    t.p(x, haut - 2, alea(x, 5) < 0.12 ? m.cuir.sombre : m.fer.sombre);
    t.p(x, haut - 3, traverse ? (k === 3 || k === 8 ? m.fer.clair : m.fer.noir) : m.fer.sombre);
    // Le bout des traverses de chêne ; entre elles, le ballast du fond.
    for (let j = 4; j <= 6; j++) {
      if (traverse) {
        const bord = k === 2 || k === 9;
        t.p(x, haut - j, j === 4 ? (bord ? m.bois.fond : m.bois.clair) : bord ? m.bois.creux : j === 6 ? m.bois.sombre : (k + j) % 3 === 0 ? m.bois.sombre : m.bois.fond);
      } else {
        t.p(x, haut - j, j === 4 ? m.ballast.noir : alea(x, j) < 0.4 ? m.ballast.sombre : m.ballast.noir);
      }
    }
  }
  if (eclisse !== null) {
    t.r(eclisse, haut - 2, eclisse + 8, haut - 1, (x, h) => ((x === eclisse + 2 || x === eclisse + 6) && h === haut - 1 ? m.fer.clair : m.fer.noir));
  }
}

/** Une case de ballast : des cailloux de quatre gris. */
function caillou(m: Matieres, x: number, h: number): string {
  const a = alea(x, h * 3 + 71);
  return a < 0.16 ? m.ballast.clair : a < 0.62 ? m.ballast.fond : a < 0.9 ? m.ballast.sombre : m.ballast.noir;
}

function dessinerRail(l: Lumiere): Decor {
  const m = matieres(l);
  const t = new Toile(RAIL_L, RAIL_H);
  // Le ballast : un lit de cailloux, plus clair en haut, quelques brins d'herbe au pied.
  t.r(0, 0, RAIL_L - 1, 6, (x, h) => {
    if (h === 6) return alea(x, 99) < 0.5 ? m.ballast.clair : m.ballast.fond;
    if (h <= 1 && alea(x, h + 40) < (h === 0 ? 0.45 : 0.18)) return alea(x, 3) < 0.5 ? m.herbe.claire : m.herbe.sombre;
    if (h === 0) return m.ballast.noir;
    return caillou(m, x, h);
  });
  poserVoie(t, m, 0, RAIL_L - 1, RAIL_H - 1, 20);
  return t.decor();
}

/* ---------- Le viaduc ---------- */

/** Une pierre de taille : des lits de 6 cases, des blocs de 12, décalés d'un lit à l'autre ; le dessin se répète tous les `periode` cases. */
function pierreDeTaille(m: Matieres, x: number, h: number, periode: number, ombre = 0, graine = 0): string {
  const lit = Math.floor(h / 6);
  const decale = (((x + (lit % 2) * 6) % periode) + periode) % periode;
  if (h % 6 === 0 || decale % 12 === 0) return ombre >= 2 ? m.pierre.trou : m.pierre.joint;
  const a = alea(Math.floor(decale / 12) + graine * 17, lit + 91);
  let ton = (a < 0.26 ? 0 : a < 0.8 ? 1 : 2) + ombre;
  // Le dessus de chaque pierre accroche la lumière, quelques éclats.
  if (h % 6 === 5 && ton > 0 && ombre <= 0) ton -= alea(x, h) < 0.5 ? 1 : 0;
  else if (alea(x, h + 13) < 0.03) ton += 1;
  return [m.pierre.clair, m.pierre.fond, m.pierre.sombre, m.pierre.joint][borner(ton, 0, 3)]!;
}

function dessinerViaduc(l: Lumiere): Decor {
  const m = matieres(l);
  const t = new Toile(VIADUC_L, VIADUC_H);
  const L = VIADUC_L;
  const CX = 84;
  const CH = 100;
  const R = 60;
  const ANNEAU = 9;
  const mousse = (x: number, h: number): string | null => {
    const a = alea(x, h + 301);
    const part = h < 14 ? 0.3 : h < 40 ? 0.16 * (1 - (h - 14) / 26) : 0;
    return a < part ? (a < part / 2 ? m.feuilles.sombre : m.feuilles.fond) : null;
  };

  for (let h = 0; h <= 172; h++) {
    for (let x = 0; x < L; x++) {
      const dx = x - CX;
      const d = Math.hypot(dx, h - CH);
      const pile = Math.abs(dx) >= R;
      const socle = h <= 13;
      // Le vide de l'arche : entre les piles, sous le cintre. Le socle des piles avance de trois cases.
      if (h < CH ? Math.abs(dx) < R - (socle ? 3 : 0) : d < R) continue;
      let c: string;
      if (h >= CH && d < R + 3) {
        // La sous-face de la voûte, dans l'ombre : plus sombre du côté opposé à la lumière.
        c = dx < -10 ? m.pierre.trou : (x + h) % 2 === 0 || dx > 30 ? m.pierre.joint : m.pierre.trou;
      } else if (h >= CH && d < R + 3 + ANNEAU) {
        // Les claveaux : des pierres taillées en rayons autour du cintre.
        const angle = Math.atan2(h - CH, dx);
        const rang = (angle / Math.PI) * 21;
        const pres = Math.abs(rang - Math.round(rang)) * ((Math.PI * d) / 21);
        const a = alea(Math.floor(rang) + 400, 7);
        if (pres < 0.55 || d >= R + 2 + ANNEAU) c = m.pierre.joint;
        else c = d < R + 5 ? m.pierre.clair : a < 0.35 ? m.pierre.clair : a < 0.85 ? m.pierre.fond : m.pierre.sombre;
      } else {
        // Le mur : éclairé à gauche de chaque pile, dans l'ombre à droite, sous la corniche et sous l'imposte.
        let ombre = 0;
        if (pile && h < CH - 4) {
          const dansLaPile = dx > 0 ? x - (CX + R) : x + L - (CX + R);
          if (dansLaPile < 4) ombre = -1;
          else if (dansLaPile > 2 * (L / 2 - R) - 6) ombre = 1;
          if (h >= CH - 8) ombre = 1;
        }
        if (h >= 169) ombre = 1;
        if (socle && h === 13) ombre = -1;
        c = pierreDeTaille(m, x, h, L, ombre, socle ? 3 : 0);
        if (socle && h === 12) c = m.pierre.joint;
        // Les coulures sous la corniche.
        if (h > 120 && h < 169 && ((x * 7) % 41 === 0 || (x * 7) % 41 === 1) && alea(x, 3) < 0.6 && h > 168 - alea(x, 9) * 40 && c !== m.pierre.joint) c = m.pierre.sombre;
        c = (pile || socle ? mousse(x, h) : null) ?? c;
      }
      t.p(x, h, c);
    }
  }
  // L'imposte : un bandeau en saillie là où naît la voûte.
  for (const [x0, x1] of [
    [0, CX - R + 2],
    [CX + R - 2, L - 1],
  ] as const) {
    t.r(x0, CH - 4, x1, CH, (x, h) => (h === CH ? m.pierre.clair : h === CH - 4 ? m.pierre.joint : (x + 3) % 12 === 0 ? m.pierre.joint : m.pierre.fond));
  }
  // La clef de voûte, plus haute et plus claire.
  t.r(CX - 5, CH + R + 2, CX + 5, CH + R + 15, (x, h) => {
    const retrait = h < CH + R + 6 ? 1 : 0;
    if (x < CX - 5 + retrait || x > CX + 5 - retrait) return null;
    if (x === CX - 5 + retrait || x === CX + 5 - retrait || h === CH + R + 15 || h === CH + R + 2) return m.pierre.joint;
    return h > CH + R + 12 || x < CX - 2 ? m.pierre.clair : m.pierre.fond;
  });
  // Les ancres de fer des tirants, de part et d'autre de chaque pile.
  for (const cx of [11, L - 12]) {
    for (let k = -4; k <= 4; k++) {
      t.p(cx + k, 134 + k, m.fer.noir);
      t.p(cx + k, 134 - k, m.fer.noir);
    }
    t.disque(cx, 134, 1.5, m.fer.fond);
  }
  // Le lierre, au pied de la pile de droite.
  for (let h = 12; h < 74; h++) {
    const axe = CX + R + 9 + Math.round(4 * Math.sin(h / 7));
    const large = h < 30 ? 6 : h < 55 ? 4 : 2;
    for (let x = axe - large; x <= axe + large; x++) {
      const a = alea(x, h + 811);
      if (a < 0.5 - Math.abs(x - axe) * 0.06) t.p(x, h, a < 0.12 ? m.feuilles.claire : a < 0.34 ? m.feuilles.fond : m.feuilles.sombre);
    }
  }

  // La corniche : un rang de modillons, puis la tablette de pierre claire.
  t.r(0, 173, L - 1, 176, (x, h) => (x % 8 < 4 ? (h === 176 ? m.pierre.fond : x % 8 === 3 ? m.pierre.joint : h === 173 ? m.pierre.sombre : m.pierre.fond) : m.pierre.trou));
  t.r(0, 177, L - 1, 179, (x, h) => (h === 179 ? m.pierre.clair : h === 177 ? m.pierre.sombre : x % 24 === 0 ? m.pierre.joint : alea(x, h) < 0.2 ? m.pierre.fond : m.pierre.clair));
  // Le ballast et la voie.
  t.r(0, 180, L - 1, 183, (x, h) => caillou(m, x, h));
  poserVoie(t, m, 0, L - 1, VIADUC_H - 1, 80);
  return t.decor();
}

/* ---------- La gare ---------- */

/** Un toit de chaume vu de face, de `h0` (le bas) à `h1` (le faîte), rentré de `retrait` cases de chaque côté en haut. */
function chaume(t: Toile, m: Matieres, x0: number, x1: number, h0: number, h1: number, retrait: number): void {
  const haut = h1 - h0;
  for (let h = h0; h <= h1; h++) {
    const f = (h - h0) / haut;
    const a = x0 + Math.round(retrait * f);
    const b = x1 - Math.round(retrait * f);
    for (let x = a; x <= b; x++) {
      const p = (x - a) / (b - a);
      const meles = (x + h) % 2 === 0;
      let c: string = p < 0.26 || (p < 0.34 && meles) ? m.chaume.clair : p > 0.76 || (p > 0.68 && meles) ? m.chaume.sombre : m.chaume.fond;
      if ((h1 - h) % 6 === 5) c = m.chaume.rang;
      else if (alea(x, h + 200) < 0.16) c = m.chaume.brin;
      if (x === a || x === b || h === h0) c = m.chaume.bord;
      t.p(x, h, c);
      if (h === h0 && alea(x, 7) < 0.45) t.p(x, h - 1, m.chaume.bord);
    }
  }
  for (let x = x0 + retrait; x <= x1 - retrait; x++) {
    t.p(x, h1 + 1, (x - x0) % 6 < 2 ? m.chaume.bord : m.chaume.rang);
    if ((x - x0) % 6 < 2) t.p(x, h1 + 2, m.chaume.rang);
  }
}

/** Un poteau ou une poutre de bois : clair d'un côté, sombre de l'autre. */
function boisDebout(t: Toile, m: Matieres, x0: number, h0: number, x1: number, h1: number): void {
  t.r(x0, h0, x1, h1, (x, h) => (x === x0 ? m.bois.clair : x === x1 ? m.bois.sombre : alea(x, h + 9) < 0.06 ? m.bois.sombre : m.bois.fond));
}
function boisCouche(t: Toile, m: Matieres, x0: number, h0: number, x1: number, h1: number): void {
  t.r(x0, h0, x1, h1, (x, h) => (h === h1 ? m.bois.clair : h === h0 ? m.bois.sombre : (x - x0) % 14 === 13 ? m.bois.sombre : m.bois.fond));
}

/** Une lanterne : sa cage de fer, son verre, sa flamme qui s'allume quand le jour baisse. `h` : le haut de sa cage. */
function lanterne(t: Toile, m: Matieres, cx: number, h: number): void {
  t.r(cx - 1, h, cx + 1, h + 1, m.suie.fond);
  t.r(cx - 3, h - 1, cx + 3, h - 1, m.suie.clair);
  t.r(cx - 4, h - 2, cx + 4, h - 2, m.suie.fond);
  t.r(cx - 3, h - 11, cx + 3, h - 3, (x, hh) => {
    if (x === cx - 3 || x === cx + 3) return m.suie.fond;
    const flamme = Math.abs(x - cx) <= 1 && hh <= h - 5 && hh >= h - 9;
    return melanger(flamme ? m.verre.clair : m.verre.fond, flamme ? "#fff1a8" : "#ffd75a", flamme ? 0.25 + 0.75 * m.veille : m.veille);
  });
  t.r(cx - 3, h - 12, cx + 3, h - 12, m.suie.sombre);
  t.r(cx - 1, h - 13, cx + 1, h - 13, m.suie.fond);
}

/** Une fenêtre de la salle d'attente : volets bleus, croisillons, et le dedans qu'on devine (un banc, une lampe). */
function fenetreDeGare(t: Toile, m: Matieres, x0: number, h0: number, l: number, haut: number): void {
  const x1 = x0 + l - 1;
  const h1 = h0 + haut - 1;
  t.r(x0, h0, x1, h1, (x, h) => {
    if (x === x0 || x === x1 || h === h0 || h === h1) return m.bois.sombre;
    if (x === x0 + 1 || x === x1 - 1 || h === h0 + 1 || h === h1 - 1) return m.creme.fond;
    if (x === x0 + Math.floor(l / 2) || h === h0 + Math.floor(haut * 0.62)) return m.creme.sombre;
    // Le dedans : le dossier d'un banc en bas, une lampe suspendue en haut.
    const dedans = melanger(melanger(m.ombre, m.bois.creux, 0.5), h > h0 + haut * 0.45 ? "#ffd75a" : "#f5a83a", m.veille);
    if (h < h0 + 11 && h > h0 + 2) return (h - h0) % 4 === 3 ? melanger(m.bois.creux, "#8a5a30", 0.3 + 0.5 * m.veille) : melanger(m.bois.sombre, "#b07a44", 0.2 + 0.6 * m.veille);
    if (Math.abs(x - (x0 + l * 0.72)) < 2 && h > h1 - 9 && h < h1 - 3) return melanger(m.laiton.sombre, "#fff1a8", m.veille);
    const reflet = (x - x0 + (h - h0)) % 11;
    return reflet < 2 ? melanger(m.verre.sombre, "#ffe9a0", m.veille) : melanger(dedans, m.verre.sombre, 0.35 * (1 - m.veille));
  });
  // L'appui, la jardinière et ses fleurs aux trois couleurs.
  t.r(x0 - 2, h0 - 2, x1 + 2, h0 - 1, (_, h) => (h === h0 - 1 ? m.pierre.clair : m.pierre.sombre));
  t.r(x0 + 1, h0, x1 - 1, h0 + 2, (x, h) => (h === h0 + 2 ? m.bois.clair : m.bois.fond));
  for (let x = x0 + 1; x <= x1 - 1; x++) {
    const a = alea(x, h0 + 5);
    const fleur = [m.bleu.clair, m.blanc.clair, m.rouge.fond][Math.floor(((x - x0) / l) * 3)]!;
    t.p(x, h0 + 3, a < 0.55 ? m.feuilles.fond : m.feuilles.sombre);
    t.p(x, h0 + 4, a < 0.6 ? fleur : m.feuilles.claire);
    if (a < 0.35) t.p(x, h0 + 5, fleur);
  }
  // Les volets ouverts.
  for (const [a, b] of [
    [x0 - 8, x0 - 1],
    [x1 + 1, x1 + 8],
  ] as const) {
    t.r(a, h0 + 3, b, h1, (x, h) => (x === a || x === b || h === h1 || h === h0 + 3 ? m.bleu.noir : (h - h0) % 4 === 0 ? m.bleu.sombre : m.bleu.fond));
  }
}

function dessinerGare(l: Lumiere): Decor {
  const m = matieres(l);
  const t = new Toile(GARE_L, GARE_H);
  const QUAI = 10;
  const COLONNES = [200, 268, 336] as const;

  /* -- Le fond du quai couvert : une barrière de piquets blancs, le tableau des horaires. -- */
  t.r(152, QUAI, GARE_L - 3, QUAI + 26, (x, h) => {
    const k = (x - 152) % 6;
    if (h === QUAI + 8 || h === QUAI + 19) return k < 4 ? m.creme.sombre : m.creme.noir;
    if (k >= 4) return null;
    if (h === QUAI + 26 && (k === 0 || k === 3)) return null;
    if (h >= QUAI + 25 && (k === 0 || k === 3) && h === QUAI + 26) return null;
    return k === 0 ? m.creme.clair : k === 3 ? m.creme.sombre : m.creme.fond;
  });
  // Le tableau des horaires, sur deux poteaux : des lignes, sans vrai texte.
  const TB = QUAI - 12;
  boisDebout(t, m, 286, QUAI, 288, TB + 62);
  boisDebout(t, m, 316, QUAI, 318, TB + 62);
  t.r(283, TB + 30, 321, TB + 64, (x, h) => {
    if (x === 283 || x === 321 || h === TB + 30 || h === TB + 64) return m.marine.sombre;
    if (x === 284 || x === 320 || h === TB + 31 || h === TB + 63) return m.marine.fond;
    if (h >= TB + 58) return h === TB + 60 && x > 290 && x < 314 ? m.laiton.fond : m.marine.fond;
    const ligne = (h - TB - 33) % 4;
    if (ligne === 1 && x > 286 && x < 318 && h < TB + 56) {
      const mot = (x - 287) % 10;
      return mot < 6 - (((h * 7) % 3) as number) ? m.marine.sombre : x > 310 ? m.rouge.fond : m.creme.fond;
    }
    return m.creme.fond;
  });
  t.r(281, TB + 65, 323, TB + 66, (_, h) => (h === TB + 66 ? m.marine.clair : m.marine.fond));

  /* -- Le quai : un mur de pierre, une tablette claire, une rampe au bout. -- */
  for (let x = 0; x < GARE_L; x++) {
    const haut = x > GARE_L - 14 ? Math.max(0, QUAI - 1 - Math.round((x - (GARE_L - 14)) * 0.75)) : QUAI - 1;
    for (let h = 0; h <= haut; h++) {
      let c = pierreDeTaille(m, x, h, 1200, 0, 5);
      if (h === haut) c = alea(x, 17) < 0.12 ? m.pierre.fond : m.pierre.clair;
      else if (h === haut - 1) c = x % 16 === 0 ? m.pierre.joint : m.creme.fond;
      else if (h === haut - 2) c = m.pierre.joint;
      else if (h === 0 && alea(x, 23) < 0.3) c = m.herbe.sombre;
      t.p(x, h, c);
    }
  }

  /* -- La salle d'attente. -- */
  // Le soubassement de pierre.
  t.r(12, QUAI, 150, QUAI + 15, (x, h) => (h === QUAI + 15 ? m.pierre.clair : pierreDeTaille(m, x, h + 2, 1200, x > 144 ? 1 : 0, 2)));
  // Le mur de torchis, à l'ombre du toit en haut.
  t.r(14, QUAI + 16, 148, 101, (x, h) => {
    if (h > 95) return m.mur.ombre;
    if ((h - QUAI) % 3 === 2) return m.mur.trame;
    const a = alea(x, h + 70);
    return a < 0.05 ? m.mur.clair : a > 0.96 ? m.mur.sombre : m.mur.fond;
  });
  // Les colombages : sablières, poteaux, croix de Saint-André sous les fenêtres.
  boisCouche(t, m, 12, QUAI + 16, 150, QUAI + 18);
  boisCouche(t, m, 12, 99, 150, 102);
  for (const x of [12, 51, 100, 147]) boisDebout(t, m, x, QUAI + 19, x + 3, 98);
  for (const [a, b] of [
    [16, 50],
    [104, 146],
  ] as const) {
    boisCouche(t, m, a, 43, b, 45);
    const n = b - a;
    for (let k = 0; k <= n; k++) {
      const h = QUAI + 19 + Math.round((k * (42 - QUAI - 19)) / n);
      for (const x of [a + k, b - k]) {
        t.p(x, h, m.bois.fond);
        t.p(x, h + 1, m.bois.sombre);
      }
    }
    boisCouche(t, m, a, 90, b, 92);
  }
  fenetreDeGare(t, m, 25, 50, 17, 36);
  fenetreDeGare(t, m, 117, 50, 17, 36);

  // La porte : grande ouverte, on voit le dedans, son carrelage et le guichet éclairé.
  const P0 = 56;
  const P1 = 99;
  t.r(P0, QUAI, P1, 84, (x, h) => {
    const fond = melanger(m.ombre, m.bois.creux, 0.55);
    // Le carrelage en damier, qui fuit vers le fond.
    if (h < QUAI + 10) {
      const rang = QUAI + 10 - h;
      const dalle = Math.floor((x - 78) / (2 + rang * 0.5) + 40) + Math.floor(rang / 3);
      return melanger(dalle % 2 === 0 ? m.pierre.sombre : m.pierre.joint, "#c98a4a", 0.25 * m.veille);
    }
    // Le mur du fond et sa plinthe.
    if (h < QUAI + 13) return melanger(m.bois.creux, "#8a5a30", 0.4 * m.veille);
    // Le guichet : une tablette, une vitre éclairée, sa grille.
    if (x >= 66 && x <= 89 && h >= 42 && h <= 66) {
      if (x === 66 || x === 89 || h === 66) return m.bois.sombre;
      if (h <= 44) return m.bois.fond;
      if ((x - 66) % 4 === 0) return m.laiton.sombre;
      return melanger(melanger(fond, m.verre.sombre, 0.5), h > 56 ? "#ffd75a" : "#f5a83a", 0.25 + 0.75 * m.veille);
    }
    if (x >= 64 && x <= 91 && h >= 39 && h <= 41) return h === 41 ? m.bois.clair : m.bois.fond;
    if (x >= 70 && x <= 85 && h >= 69 && h <= 74) return (x + h) % 4 === 0 ? m.laiton.sombre : m.marine.sombre;
    // L'ombre du linteau, puis le mur du fond, un peu réchauffé la nuit.
    return melanger(h > 76 ? m.ombre : fond, "#b0703a", (h > 76 ? 0.1 : 0.32) * m.veille);
  });
  // Les deux vantaux, repliés contre les montants.
  for (const [a, b] of [
    [P0, P0 + 4],
    [P1 - 4, P1],
  ] as const) {
    t.r(a, QUAI, b, 82, (x, h) => (x === a || x === b ? m.bleu.noir : h % 18 === 4 ? m.bleu.noir : x === a + 2 && h % 18 > 6 ? m.bleu.fond : m.bleu.sombre));
  }
  boisDebout(t, m, 52, QUAI, 55, 88);
  boisDebout(t, m, 100, QUAI, 103, 88);
  boisCouche(t, m, 52, 85, 103, 88);
  // Le seuil de pierre.
  t.r(P0 - 2, QUAI, P1 + 2, QUAI + 1, (x, h) => (h === QUAI + 1 ? m.pierre.clair : m.pierre.fond));
  // L'enseigne.
  t.r(59, 89, 96, 99, (x, h) => (x === 59 || x === 96 || h === 89 || h === 99 ? m.laiton.fond : m.marine.fond));
  ecrire(t, 78 - Math.floor(largeurDuTexte("GARE") / 2), 91, "GARE", m.blanc.clair);
  // La lanterne de la porte, sur sa potence, et la cloche du départ.
  t.r(104, 80, 110, 80, m.suie.fond);
  t.trait(104, 74, 109, 79, m.suie.fond);
  lanterne(t, m, 108, 78);
  t.r(140, 82, 146, 82, m.suie.fond);
  t.r(141, 75, 145, 80, (x, h) => (h === 75 ? m.laiton.sombre : x === 141 ? m.laiton.clair : x === 145 ? m.laiton.sombre : m.laiton.fond));
  t.r(140, 74, 146, 74, m.laiton.fond);
  t.r(143, 81, 143, 81, m.suie.fond);
  t.p(143, 73, m.suie.noir);
  t.r(143, 66, 143, 72, m.bois.corde);

  // Le toit de chaume, sa cheminée de pierre, le mât et le fanion du clan.
  t.r(128, 128, 140, 160, (x, h) => (h >= 158 ? (h === 160 ? m.pierre.clair : m.pierre.joint) : pierreDeTaille(m, x, h, 1200, x > 137 ? 1 : x < 130 ? -1 : 0, 9)));
  t.r(126, 156, 142, 157, (_, h) => (h === 157 ? m.pierre.clair : m.pierre.sombre));
  chaume(t, m, 4, 158, 100, 148, 32);
  t.r(40, 150, 41, 176, (x) => (x === 40 ? m.bois.clair : m.bois.sombre));
  t.p(40, 177, m.laiton.clair);
  for (let k = 0; k < 21; k++) {
    const onde = Math.round(1.2 * Math.sin(k / 3.2));
    const c = k < 7 ? m.bleu : k < 14 ? m.blanc : m.rouge;
    const mince = k > 17 ? k - 17 : 0;
    for (let h = 165 + mince; h <= 174 - mince; h++) t.p(42 + k, h + onde, h === 174 - mince ? c.clair : h === 165 + mince ? c.sombre : c.fond);
  }

  // La lucarne de l'horloge : un pignon de bois sous son chaume.
  const LX = 78;
  for (let h = 100; h <= 142; h++) {
    const demi = Math.round(((142 - h) * 26) / 42);
    for (let x = LX - demi; x <= LX + demi; x++) {
      const bord = demi - Math.abs(x - LX);
      let c: string = (h - 100) % 3 === 2 ? m.mur.trame : m.mur.fond;
      if (bord < 6) c = bord < 1 ? m.chaume.bord : (bord + h) % 5 === 0 ? m.chaume.rang : bord < 3 ? m.chaume.clair : m.chaume.fond;
      else if (bord < 8) c = m.bois.sombre;
      else if (h <= 102) c = m.bois.fond;
      t.p(x, h, c);
    }
  }
  // L'horloge : un cercle de laiton, un cadran blanc, douze repères, deux aiguilles.
  t.disque(LX, 118, 12, (dx, dh, d) => {
    if (d > 10.6) return dx - dh < -4 ? m.laiton.clair : dx - dh > 6 ? m.laiton.sombre : m.laiton.fond;
    if (d > 9.4) return m.marine.sombre;
    return dx + dh > 9 ? m.blanc.fond : m.blanc.clair;
  });
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    t.p(LX + Math.round(8 * Math.sin(a)), 118 + Math.round(8 * Math.cos(a)), k % 3 === 0 ? m.marine.sombre : m.marine.clair);
  }
  t.trait(LX, 118, LX - 4, 121, m.marine.sombre);
  t.trait(LX, 118, LX + 6, 122, m.marine.sombre);
  t.p(LX, 118, m.rouge.fond);

  /* -- La marquise : des colonnes de fonte, une verrière, un lambrequin de bois découpé. -- */
  // La verrière, vue un peu de dessus : des carreaux entre des fers.
  for (let h = 97; h <= 112; h++) {
    const fuite = Math.round((h - 97) * 0.5);
    for (let x = 151; x <= GARE_L - 1 - fuite; x++) {
      // Le chaume de la salle d'attente passe devant le coin de la verrière.
      if (h >= 100 && x <= 159 - Math.round(((h - 100) * 32) / 48)) continue;
      const k = (x - 151 + fuite) % 12;
      let c: string;
      if (k === 0 || h === 104) c = m.marine.fond;
      else {
        const reflet = (x + h * 2) % 17;
        c = reflet < 3 ? m.verre.clair : (x + h) % 2 === 0 && h > 106 ? m.verre.sombre : m.verre.fond;
        // La lueur des lanternes, sous le verre, la nuit.
        c = melanger(c, "#f5a83a", 0.1 * m.veille);
      }
      t.p(x, h, c);
    }
  }
  t.r(151, 113, GARE_L - 9, 114, (x, h) => (h === 114 ? m.marine.clair : m.marine.fond));
  for (let x = 157; x <= GARE_L - 12; x += 12) {
    t.p(x, 115, m.marine.fond);
    t.p(x, 116, m.laiton.fond);
  }
  // Le nom de la gare, dressé sur le faîte de la marquise.
  const NOM = "LES GAULOIS";
  const nomL = largeurDuTexte(NOM);
  const nomX = 245 - Math.floor(nomL / 2);
  t.r(nomX - 4, 117, nomX + nomL + 3, 129, (x, h) => (x === nomX - 4 || x === nomX + nomL + 3 || h === 117 || h === 129 ? m.laiton.fond : m.marine.fond));
  ecrire(t, nomX, 120, NOM, m.blanc.clair);
  for (const x of [nomX + 4, nomX + nomL - 6]) t.r(x, 113, x + 1, 116, m.marine.sombre);

  // Les colonnes de fonte, leur socle, leur bague, leurs consoles en volute.
  for (const x of COLONNES) {
    t.r(x - 2, QUAI, x + 5, QUAI + 5, (i, h) => (h === QUAI + 5 ? m.marine.clair : i === x - 2 ? m.marine.clair : i === x + 5 ? m.marine.noir : m.marine.fond));
    t.r(x - 1, QUAI + 6, x + 4, QUAI + 7, m.marine.sombre);
    t.r(x, QUAI + 8, x + 3, 91, (i, h) => (i === x ? m.marine.clair : i === x + 3 ? m.marine.noir : h % 2 === 0 && h < 40 ? m.marine.sombre : m.marine.fond));
    t.r(x - 1, 46, x + 4, 48, (i, h) => (h === 48 ? m.laiton.clair : i === x + 4 ? m.laiton.sombre : m.laiton.fond));
    t.r(x - 1, 84, x + 4, 86, (i, h) => (h === 86 ? m.marine.clair : m.marine.fond));
    for (const sens of [-1, 1] as const) {
      const bord = sens === -1 ? x - 1 : x + 4;
      if (sens === 1 && x === COLONNES[2]) continue;
      for (let a = 0; a <= 90; a += 2) {
        const rad = (a * Math.PI) / 180;
        const px = bord + sens * Math.round(20 * (1 - Math.cos(rad)));
        const ph = 66 + Math.round(20 * Math.sin(rad));
        t.p(px, ph, m.marine.fond);
        t.p(px, ph + 1, m.marine.clair);
      }
      // La volute et l'entretoise.
      t.disque(bord + sens * 6, 82, 3.2, (dx, dh, d) => (d > 2 ? m.marine.fond : d < 1 ? m.laiton.fond : null));
      t.trait(bord + sens * 1, 76, bord + sens * 12, 87, m.marine.sombre);
    }
  }
  // La poutre de rive, rivetée, et le lambrequin.
  t.r(150, 92, GARE_L - 1, 96, (x, h) => (h === 96 ? m.marine.clair : h === 92 ? m.marine.noir : h === 94 && x % 6 === 2 ? m.laiton.fond : m.marine.fond));
  for (let x = 150; x < GARE_L; x++) {
    const k = (x - 150) % 10;
    const long = 7 - Math.abs(k - 4.5) * 1.4;
    for (let j = 0; j < long; j++) {
      const trou = j === 2 && (k === 4 || k === 5);
      if (trou) continue;
      t.p(x, 91 - j, k === 0 || k === 9 ? m.creme.sombre : j === Math.ceil(long) - 1 ? m.rouge.fond : j === 0 ? m.creme.sombre : m.creme.fond);
    }
  }
  // Les lanternes pendues à la marquise.
  for (const x of [174, 234, 302]) {
    t.r(x, 80, x, 87, (_, h) => (h % 2 === 0 ? m.suie.fond : m.suie.clair));
    lanterne(t, m, x, 78);
  }

  /* -- Sur le quai : le tonneau et la caisse, le banc, les bagages, les bidons de lait. -- */
  // Le tonneau.
  for (let h = QUAI; h <= QUAI + 24; h++) {
    const e = (h - QUAI - 12) / 12;
    const demi = 7 + Math.round(2.4 * (1 - e * e));
    for (let x = 164 - demi; x <= 164 + demi; x++) {
      const cercle = h === QUAI + 3 || h === QUAI + 4 || h === QUAI + 20 || h === QUAI + 21 || h === QUAI + 12;
      const p = (x - 164) / demi;
      t.p(x, h, cercle ? (p < -0.4 ? m.fer.clair : p > 0.5 ? m.fer.noir : m.fer.sombre) : h === QUAI + 24 ? m.bois.clair : (x - 164 + 40) % 4 === 0 ? m.bois.creux : p < -0.45 ? m.bois.clair : p > 0.45 ? m.bois.sombre : m.bois.fond);
    }
  }
  // La caisse marquée aux couleurs du clan.
  t.r(178, QUAI, 194, QUAI + 14, (x, h) => {
    if (x === 178 || x === 194 || h === QUAI || h === QUAI + 14) return m.bois.sombre;
    if (x === 179 || x === 193 || h === QUAI + 13 || h === QUAI + 1) return m.bois.clair;
    return (h - QUAI) % 4 === 0 ? m.bois.sombre : m.bois.autre;
  });
  tricolore(t, m, 181, QUAI + 6, 3, 3);

  // Le banc : des lattes de bois sur deux pieds de fonte.
  const B0 = 212;
  const B1 = 258;
  for (const h of [QUAI + 21, QUAI + 26]) boisCouche(t, m, B0 + 1, h, B1 - 1, h + 3);
  t.r(B0 - 1, QUAI + 13, B1 + 1, QUAI + 15, (x, h) => (h === QUAI + 15 ? m.bois.clair : h === QUAI + 13 ? m.bois.sombre : (x - B0) % 14 === 13 ? m.bois.sombre : m.bois.fond));
  t.r(B0 + 1, QUAI + 12, B1 - 1, QUAI + 12, m.bois.creux);
  for (const x of [B0, B1 - 2]) {
    t.r(x, QUAI + 13, x + 2, QUAI + 31, (i) => (i === x ? m.marine.clair : i === x + 2 ? m.marine.noir : m.marine.fond));
    t.r(x, QUAI, x + 2, QUAI + 11, (i) => (i === x ? m.marine.clair : i === x + 2 ? m.marine.noir : m.marine.fond));
    t.r(x - 2, QUAI, x + 4, QUAI + 1, m.marine.sombre);
    // L'accoudoir en volute.
    t.r(x - 3, QUAI + 21, x + 5, QUAI + 22, (_, h) => (h === QUAI + 22 ? m.marine.clair : m.marine.fond));
    t.r(x - 3, QUAI + 16, x - 3, QUAI + 20, m.marine.fond);
    t.r(x + 5, QUAI + 16, x + 5, QUAI + 20, m.marine.sombre);
  }

  // La malle, la valise posée dessus, le carton à chapeau.
  t.r(274, QUAI, 298, QUAI + 14, (x, h) => {
    if ((x === 274 || x === 298) && h === QUAI + 14) return null;
    if (x <= 276 || x >= 296 || h >= QUAI + 13 || h <= QUAI + 1) return (x <= 276 || x >= 296) && (h >= QUAI + 12 || h <= QUAI + 2) ? m.laiton.fond : m.cuir.sombre;
    if (x === 282 || x === 283 || x === 290 || x === 291) return m.cuir.noir;
    if (h === QUAI + 9) return m.cuir.sombre;
    if (x >= 285 && x <= 288 && h >= QUAI + 7 && h <= QUAI + 8) return m.laiton.clair;
    return h > QUAI + 9 ? m.cuir.clair : m.cuir.fond;
  });
  t.r(278, QUAI + 15, 294, QUAI + 23, (x, h) => {
    if ((x === 278 || x === 294) && (h === QUAI + 15 || h === QUAI + 23)) return null;
    if (h === QUAI + 23) return m.rouge.clair;
    if (x === 281 || x === 291) return m.cuir.noir;
    return h === QUAI + 15 ? m.rouge.noir : h > QUAI + 20 ? m.rouge.fond : m.rouge.sombre;
  });
  t.r(284, QUAI + 24, 288, QUAI + 25, (x, h) => (h === QUAI + 25 && x !== 284 && x !== 288 ? m.cuir.fond : x === 284 || x === 288 ? m.cuir.fond : null));
  t.disque(264, QUAI + 6, 6, (dx, dh, d) => (d > 5 ? m.bleu.noir : dh === 2 ? m.creme.fond : dx < -2 ? m.bleu.clair : dx > 2 ? m.bleu.sombre : m.bleu.fond));
  t.r(259, QUAI, 269, QUAI, m.bleu.noir);
  // Les deux bidons de lait.
  for (const x of [308, 322]) {
    for (let h = QUAI; h <= QUAI + 22; h++) {
      const rang = h - QUAI;
      const demi = rang > 19 ? 4 : rang > 16 ? 3 : rang > 14 ? 4 : 5;
      for (let i = x - demi; i <= x + demi; i++) {
        const p = (i - x) / demi;
        t.p(i, h, rang === 20 || rang === 14 || rang === 1 ? m.fer.sombre : rang === 22 ? m.fer.clair : p < -0.5 ? m.fer.clair : p > 0.5 ? m.fer.sombre : m.fer.fond);
      }
    }
    t.r(x - 7, QUAI + 15, x - 6, QUAI + 18, m.fer.sombre);
    t.r(x + 6, QUAI + 15, x + 7, QUAI + 18, m.fer.noir);
  }

  // La nuit, chaque lanterne réchauffe ce qui l'entoure : le quai, la barrière, le mur.
  if (m.veille > 0) for (const x of [108, 174, 234, 302]) t.eclairer(x, 71, 34, 0.42 * m.veille);
  return t.decor();
}

/* ---------- Le lot ---------- */

const fixe = (largeur: number, hauteur: number, dessiner: (l: Lumiere) => Decor): DessinDeBatiment => ({ largeur, hauteur, images: 1, dessiner: (l) => dessiner(l) });
const anime = (largeur: number, hauteur: number, images: number, dessiner: (l: Lumiere, image: number) => Decor): DessinDeBatiment => ({
  largeur,
  hauteur,
  images,
  dessiner: (l, image) => dessiner(l, ((Math.floor(image) % images) + images) % images),
});

export const LOT_TRAIN: Partial<Record<PieceOpenFrontId, DessinDeBatiment>> = {
  gare: fixe(GARE_L, GARE_H, dessinerGare),
  rail: fixe(RAIL_L, RAIL_H, dessinerRail),
  viaduc: fixe(VIADUC_L, VIADUC_H, dessinerViaduc),
  locomotive: anime(LOCO_L, LOCO_H, 4, dessinerLocomotive),
  "wagon-marchandises": anime(WAGON_L, MARCHANDISES_H, 2, dessinerWagonDeMarchandises),
  "wagon-citerne": anime(WAGON_L, CITERNE_H, 2, dessinerWagonCiterne),
  "wagon-voyageurs": anime(WAGON_L, VOYAGEURS_H, 2, dessinerWagonDeVoyageurs),
};
