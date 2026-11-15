/**
 * Les intérieurs du lot 2 : le colombier, l'étable et la grande tour du clan, vus de côté comme une maison de poupée
 * (`type.ts`). Chacun reprend les matières et les couleurs de son dehors (`batiments/lot-b.ts`, `batiments/lot-c.ts`) :
 * - le colombier : la tour ronde de pierre vue du dedans, ses rangs de nids dans le mur, l'échelle qui tourne autour de
 *   son mât, la charpente du toit de chaume et sa lucarne ;
 * - l'étable : le torchis sur ses planches, les stalles, les deux vaches et le veau, le fenil, les outils ;
 * - la grande tour : la salle de garde ronde, sous le hourd de bois qu'on aperçoit au-dessus ; la bannière bleu nuit du
 *   clan, l'escalier qui suit le mur, le râtelier, le banc.
 *
 * Tout est dessiné aux couleurs du plein jour, puis éclairé d'un seul geste (`eclairer`) : le jour, la lumière entre par
 * les ouvertures ; quand il baisse, la lanterne s'allume et le reste s'assombrit. Ce qui éclaire et le ciel vu par une
 * ouverture gardent leur couleur. Rien n'est tiré au hasard : `alea(x, y)` donne un grain fixe ; même lumière et même
 * image, même dessin. Aucun dessin ne rappelle une œuvre existante. Design : Claude Fable 5.2.
 */
import { type Decor, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, cielDuVillage, couleurDuDedans, couleurDuDehors, melanger } from "../lumiere";
import { TRICOLORE } from "../monde/pieces";
import type { DessinDInterieur, InterieurId } from "./type";

/* ---------- La toile et la lumière ---------- */

/** Une planche dont certaines cases gardent leur couleur quand on éclaire la pièce : le dehors, ce qui éclaire. */
class Toile extends Planche {
  readonly fixes: Uint8Array;
  constructor(largeur: number, hauteur: number) {
    super(largeur, hauteur, "#1a1410");
    this.fixes = new Uint8Array(largeur * hauteur);
  }
  override poser(x: number, y: number, couleur: string | null): void {
    if (x >= 0 && x < this.largeur && y >= 0 && y < this.hauteur && couleur !== null) {
      this.cases[y * this.largeur + x] = couleur;
      this.fixes[y * this.largeur + x] = 0;
    }
  }
  /** Pose une case qui ne sera pas éclairée : elle a déjà sa couleur de l'heure. */
  fixer(x: number, y: number, couleur: string): void {
    if (x >= 0 && x < this.largeur && y >= 0 && y < this.hauteur) {
      this.cases[y * this.largeur + x] = couleur;
      this.fixes[y * this.largeur + x] = 1;
    }
  }
  /** Mêle une couleur à la case déjà posée : une ombre, une patine. */
  voiler(x: number, y: number, couleur: string, part: number): void {
    const fond = this.lire(x, y);
    if (fond && part > 0 && this.fixes[y * this.largeur + x] === 0) this.poser(x, y, melanger(fond, couleur, part));
  }
  /** Un dessin écrit en lettres, retourné si `sens` vaut −1 (`x` reste sa colonne de gauche). */
  motif(x: number, y: number, lignes: readonly string[], couleurs: Readonly<Record<string, string>>, sens: 1 | -1 = 1): void {
    lignes.forEach((ligne, dy) => {
      for (let dx = 0; dx < ligne.length; dx++) {
        const couleur = couleurs[ligne[sens === 1 ? dx : ligne.length - 1 - dx]!];
        if (couleur) this.poser(x + dx, y + dy, couleur);
      }
    });
  }
  /** Un trait d'un point à un autre, épais de `epais` cases vers le bas. */
  trait(x0: number, y0: number, x1: number, y1: number, couleur: string | ((k: number, e: number) => string), epais = 1): void {
    const pas = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const couche = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    for (let k = 0; k <= pas; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / pas);
      const y = Math.round(y0 + ((y1 - y0) * k) / pas);
      for (let e = 0; e < epais; e++) this.poser(couche ? x : x + e, couche ? y + e : y, typeof couleur === "string" ? couleur : couleur(k, e));
    }
  }
}

/** Un rayon qui entre par une ouverture et descend vers la droite : la lumière vient d'en haut à gauche. */
interface Rayon {
  x: number;
  y: number;
  large: number;
  /** De combien de cases il glisse vers la droite à chaque rangée, et de combien il s'élargit sur sa longueur. */
  pente: number;
  evase: number;
  long: number;
  force: number;
}
/** Une lanterne : elle ne s'allume que quand le jour baisse, et ne bouge pas. */
interface Lampe {
  x: number;
  y: number;
  rayon: number;
}

const NUIT_DU_DEDANS = [12, 16, 40] as const;
const LUEUR = [245, 168, 58] as const;
const FLAMME = "#ffd75a";
const COEUR = "#fff1a8";
const OMBRE = "#1a1410";
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
const borner = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));
const octet = (v: number): string => HEX[Math.round(borner(v, 0, 255))]!;

/** La force des lanternes : nulle en plein jour, entière à la nuit (comme dehors, `batiments/lot-c.ts`). */
const veilleDe = (l: Lumiere): number => borner((0.8 - l.jour) / 0.5);

/**
 * Éclaire la pièce : chaque case prend sa couleur du dedans (`couleurDuDedans`), puis la lumière des rayons (le soleil,
 * rougi au lever et au coucher, ou la lune), puis, quand le jour baisse, l'ombre de la nuit loin des lanternes et leur
 * lueur près d'elles. Les cases fixées ne changent pas.
 */
function eclairer(T: Toile, l: Lumiere, lampes: readonly Lampe[], rayons: readonly Rayon[]): void {
  const nuit = 1 - l.jour;
  const veille = veilleDe(l);
  const soleil = [255, 242 - 70 * l.rougeur, 196 - 110 * l.rougeur] as const;
  const lune = [169, 188, 236] as const;
  const dedans = new Map<string, readonly [number, number, number]>();
  for (let y = 0; y < T.hauteur; y++) {
    for (let x = 0; x < T.largeur; x++) {
      const i = y * T.largeur + x;
      if (T.fixes[i] === 1) continue;
      const brute = T.cases[i]!;
      let rvb = dedans.get(brute);
      if (!rvb) {
        const c = couleurDuDedans(brute, l);
        rvb = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        dedans.set(brute, rvb);
      }
      let [r, v, b] = rvb;
      // Les rayons.
      let rai = 0;
      for (const q of rayons) {
        const dy = y - q.y;
        if (dy < 0 || dy > q.long) continue;
        const k = dy / q.long;
        const gauche = q.x + dy * q.pente;
        const bord = Math.min(x - gauche, gauche + q.large + q.evase * k - x);
        if (bord < 0) continue;
        let f = q.force * Math.min(1, (bord + 1) / 3) * (1 - 0.6 * k);
        if (alea(x, y + 501) < 0.014) f *= 1.7;
        if (f > rai) rai = f;
      }
      if (rai > 0) {
        const pJour = Math.min(0.6, rai * l.jour * 0.3);
        const pLune = rai * nuit * 0.13;
        r += (soleil[0] - r) * pJour + (lune[0] - r) * pLune;
        v += (soleil[1] - v) * pJour + (lune[1] - v) * pLune;
        b += (soleil[2] - b) * pJour + (lune[2] - b) * pLune;
      }
      // La nuit, et la lueur des lanternes.
      if (nuit > 0.004) {
        let g = 0;
        for (const q of lampes) {
          const d = Math.hypot(x - q.x, (y - q.y) * 1.12) / q.rayon;
          if (d < 1) g = Math.max(g, (1 - d) ** 1.25);
        }
        g *= veille;
        const sombre = nuit * 0.62 * (1 - 0.92 * g);
        r += (NUIT_DU_DEDANS[0] - r) * sombre;
        v += (NUIT_DU_DEDANS[1] - v) * sombre;
        b += (NUIT_DU_DEDANS[2] - b) * sombre;
        const chaud = 0.4 * g;
        r += (LUEUR[0] - r) * chaud;
        v += (LUEUR[1] - v) * chaud;
        b += (LUEUR[2] - b) * chaud;
      }
      T.cases[i] = `#${octet(r)}${octet(v)}${octet(b)}`;
    }
  }
}

/** Une lanterne pendue au bout de sa chaîne : `x` son milieu, `y` le haut de la chaîne. Sa vitre s'allume quand le jour baisse. */
function lanterne(T: Toile, l: Lumiere, x: number, y: number, chaine: number): Lampe {
  const veille = veilleDe(l);
  for (let j = 0; j < chaine; j++) T.poser(x, y + j, j % 2 === 0 ? "#5c6474" : "#3a4050");
  const h = y + chaine;
  T.rect(x - 2, h, 5, 1, "#3a4050");
  T.rect(x - 4, h + 1, 9, 2, (i, j) => (j === h + 1 ? "#6a7284" : i === x - 4 || i === x + 4 ? "#3a4050" : "#4a5264"));
  const vitre = melanger(couleurDuDedans("#b9a070", l), FLAMME, veille);
  const coeur = melanger(couleurDuDedans("#c9b080", l), COEUR, veille);
  for (let j = h + 3; j <= h + 11; j++) {
    for (let i = x - 3; i <= x + 3; i++) {
      if (i === x - 3 || i === x + 3 || i === x) T.poser(i, j, "#3a4050");
      else T.fixer(i, j, Math.abs(i - x) === 1 && j > h + 4 && j < h + 10 ? coeur : vitre);
    }
  }
  T.rect(x - 4, h + 12, 9, 2, (i, j) => (j === h + 13 || i === x - 4 || i === x + 4 ? "#3a4050" : "#5c6474"));
  return { x, y: h + 7, rayon: 0 };
}

/** Le ciel de l'heure, pour une ouverture : `part` de 0 (le haut du ciel) à 1 (l'horizon). */
function cielDe(l: Lumiere): (part: number) => string {
  const ciel = cielDuVillage(l);
  return (part) => ciel[Math.min(4, Math.max(0, Math.floor(part * 5)))]!;
}

/* ---------- Les matières du dedans, aux couleurs du plein jour ---------- */

/** La pierre du colombier (`lot-b.ts`) et celle de la grande tour (`lot-c.ts`). */
const PIERRE_B = { clair: "#a69f90", fond: "#8c8577", sombre: "#736d61", joint: "#5a554c", trou: "#3b362f" } as const;
const PIERRE_C = { clair: "#aaa392", fond: "#958e7f", autre: "#8b8576", sombre: "#787164", joint: "#5e584e", mousse: "#74894e" } as const;
const BOIS = { fond: "#8a5a30", autre: "#966437", clair: "#b07a44", sombre: "#6a4424", creux: "#3d2616", corde: "#c9b278", cordeSombre: "#a08c5c" } as const;
const TRONC = { clair: "#7a5230", fond: "#63411f", sombre: "#4f3218" } as const;
const CHAUME = { fond: "#d9b04e", clair: "#f0cc68", sombre: "#b48c3a", brin: "#9c7a30", rang: "#a8823a", bord: "#80622a" } as const;
const MUR = { fond: "#d8b47a", clair: "#ecca90", sombre: "#b89260", trame: "#c4a06a", ombre: "#987650" } as const;
const TERRE = { fond: "#8a6a45", claire: "#a07d52", sombre: "#735638" } as const;
const FER = "#5c6474";
const FER_CLAIR = "#8d95a6";
const BLEU_NUIT = "#1c2a5e";

/** Une poutre couchée : claire dessus, sombre dessous, des veines. */
function poutre(T: Toile, x: number, y: number, l: number, h: number): void {
  T.rect(x, y, l, h, (i, j) => {
    if (j === y) return BOIS.clair;
    if (j === y + h - 1) return BOIS.creux;
    if (alea(i >> 2, j + 40) < 0.16) return BOIS.sombre;
    return j < y + h / 2 ? BOIS.autre : BOIS.fond;
  });
}
/** Un poteau debout : clair à gauche, sombre à droite, des veines. */
function poteau(T: Toile, x: number, y: number, l: number, h: number): void {
  T.rect(x, y, l, h, (i, j) => {
    if (i === x) return BOIS.clair;
    if (i === x + l - 1) return BOIS.creux;
    if (alea(i, j >> 2) < 0.16) return BOIS.sombre;
    return i < x + l / 2 ? BOIS.autre : BOIS.fond;
  });
}

/* ---------- Les pigeons ---------- */

type Robe = Readonly<Record<string, string>>;
/** a tête, o œil, b bec, c cou, g corps, w aile, k barre de l'aile, q queue, p patte. */
const ROBES: readonly Robe[] = [
  { a: "#ebe8dc", o: "#2a1a10", b: "#d08a4a", c: "#dcd8ca", g: "#ebe8dc", w: "#d2cfc2", k: "#b4b1a6", q: "#c4c1b6", p: "#c8746a" },
  { a: "#8f96a8", o: "#e0902a", b: "#d08a4a", c: "#6f9a84", g: "#aab0bf", w: "#959bab", k: "#5e6474", q: "#747a8a", p: "#c8746a" },
  { a: "#6a7082", o: "#e0902a", b: "#c9a06a", c: "#7a6a94", g: "#7f8596", w: "#6e7486", k: "#4a4f5e", q: "#565b6a", p: "#c8746a" },
  { a: "#c9a078", o: "#2a1a10", b: "#d08a4a", c: "#b48a62", g: "#ebe8dc", w: "#c9a078", k: "#a47c56", q: "#b08a64", p: "#c8746a" },
];
const PIGEON_DEBOUT = [".........aa..", "........aoab.", "........aaa..", ".......ccc...", "...gggggcc...", "..gwwwwggg...", ".qgwkwkwgg...", "qq.gwwwgg....", "q...gggg.....", ".....p.p....."] as const;
const PIGEON_PICORE = [".............", ".............", ".............", "......ccc....", "...ggggccaa..", "..gwwwwggaoa.", ".qgwkwkwggab.", "qq.gwwwgg....", "q...gggg.....", ".....p.p....."] as const;
const PIGEON_AU_NID = ["....aa..", "...aoab.", ".ggcaa..", "qgwwgg..", "qwkwwgg.", ".ggggg.."] as const;
/** Un pigeon debout, les pattes sur la rangée `y`, son milieu en `x`. */
function pigeon(T: Toile, x: number, y: number, sens: 1 | -1, robe: number, picore = false): void {
  T.motif(x - 6, y - 9, picore ? PIGEON_PICORE : PIGEON_DEBOUT, ROBES[robe % ROBES.length]!, sens);
}
/** Un pigeon couché dans son nid, posé sur la rangée `y`. */
function pigeonAuNid(T: Toile, x: number, y: number, sens: 1 | -1, robe: number): void {
  T.motif(x - 4, y - 5, PIGEON_AU_NID, ROBES[robe % ROBES.length]!, sens);
}

/* ---------- Le colombier ---------- */

const COL = { l: 320, h: 270, cx: 160, r: 142, oeil: 150, courbe: 0.27, haut: 58, sol: 246, sommet: -78, mur: 18 } as const;
const COL_IMAGES = 4;
const RANG = 17;
const PREMIER_RANG = 76;
const RANGS = 9;
const PAS = 0.185;

/** Le mur rond vu du dedans : une rangée à la hauteur `v` au bord du mur se rapproche de l'œil vers le fond (`s` vaut 1 au milieu). */
const rangeeDuRond = (v: number, s: number, oeil: number, courbe: number): number => oeil + (v - oeil) * (1 - courbe * s);
const hauteurDuRond = (y: number, s: number, oeil: number, courbe: number): number => oeil + (y - oeil) / (1 - courbe * s);

function dessinerColombier(l: Lumiere, image: number): Decor {
  const T = new Toile(COL.l, COL.h);
  const p = paletteDuDehors(l);
  const ciel = cielDe(l);
  const { cx, r: R } = COL;
  const s = (x: number): number => Math.sqrt(Math.max(0, 1 - ((x - cx) / R) ** 2));
  const y = (v: number, x: number): number => rangeeDuRond(v, s(x), COL.oeil, COL.courbe);
  /** Le bord du toit, dans la coupe : la colonne de gauche du dedans à cette rangée. */
  const rive = (j: number): number => 10 + ((COL.haut - j) * 150) / (COL.haut - COL.sommet);

  // Le ciel de l'heure dans les deux coins, quelques étoiles la nuit, puis le chaume du toit vu par sa tranche.
  for (let j = 0; j < COL.haut + 10; j++) {
    const g = rive(j);
    for (let i = 0; i < COL.l; i++) {
      const dehors = Math.max(g - i, i - (COL.l - 1 - g));
      if (dehors <= 0) continue;
      if (dehors > 15) {
        let couleur = ciel(0.25 + j / 150 + ((i + j) % 2) * 0.04);
        if (l.jour < 0.4 && alea(i, j + 900) < 0.012) couleur = melanger(couleur, "#c0c9e2", 1 - l.jour * 2.5);
        T.fixer(i, j, couleur);
        continue;
      }
      const gauche = i < cx;
      let couleur: string = gauche ? p.chaume.fond : p.chaume.sombre;
      if (dehors >= 14) couleur = p.chaume.bord;
      else if (dehors >= 11) couleur = gauche ? p.chaume.clair : p.chaume.fond;
      else if ((j + Math.round(dehors * 1.4)) % 6 === 0) couleur = p.chaume.rang;
      else if (alea(i, j) < 0.18) couleur = p.chaume.brin;
      if (dehors <= 3) couleur = dehors <= 1 ? p.bois.creux : gauche ? p.bois.fond : p.bois.sombre;
      T.fixer(i, j, couleur);
    }
  }

  // Le dedans du toit : les chevrons qui montent vers la pointe, les lattes en rond, le chaume vu par-dessous.
  const chevrons: number[] = [];
  for (let k = -5; k <= 5; k++) {
    const t = k * 0.262;
    const px = cx + R * Math.sin(t);
    chevrons.push(Math.atan2(px - cx, y(COL.haut, px) - COL.sommet));
  }
  for (let j = 0; j < 90; j++) {
    for (let i = Math.max(0, Math.ceil(rive(j))); i <= Math.min(COL.l - 1, Math.floor(COL.l - 1 - rive(j))); i++) {
      if (i >= COL.mur && i < COL.l - COL.mur && j >= y(COL.haut, i)) continue;
      if ((i < COL.mur || i >= COL.l - COL.mur) && j >= COL.haut) continue;
      // Où ce rayon parti de la pointe touche la sablière : deux pas suffisent.
      let part = (j - COL.sommet) / (y(COL.haut, i) - COL.sommet);
      for (let n = 0; n < 2; n++) part = (j - COL.sommet) / (y(COL.haut, borner(cx + (i - cx) / part, COL.mur, COL.l - COL.mur - 1)) - COL.sommet);
      const angle = Math.atan2(i - cx, j - COL.sommet);
      const loin = Math.hypot(i - cx, j - COL.sommet);
      let couleur: string = alea(i, j) < 0.2 ? "#75592a" : alea(i >> 1, j) < 0.3 ? "#94763a" : "#86692f";
      if ((part * 15) % 1 < 0.2) couleur = "#5d4320";
      let sur = false;
      for (const a of chevrons) {
        const ecart = (angle - a) * loin;
        if (ecart > -2.2 && ecart <= 2.2) {
          couleur = ecart < -1.2 ? BOIS.clair : ecart > 1.2 ? BOIS.creux : alea(i, j >> 2) < 0.2 ? BOIS.sombre : BOIS.fond;
          sur = true;
        }
      }
      T.poser(i, j, melanger(couleur, OMBRE, (sur ? 0.1 : 0.2) + 0.5 * borner(1 - part * 1.05) + 0.1 * Math.abs(i - cx) / R));
    }
  }

  // Le mur rond de pierre : des lits qui se courbent, des blocs qui se serrent vers les bords, l'ombre sur les côtés.
  const nids: { x: number; y: number; large: number; rang: number; col: number; ciel: boolean }[] = [];
  const estCiel = (rang: number, col: number): boolean => (rang === 1 && (col === -3 || col === -1 || col === 0 || col === 2)) || (rang === 4 && (col === -4 || col === -2 || col === 1 || col === 3));
  for (let i = COL.mur; i < COL.l - COL.mur; i++) {
    const u = (i - cx) / R;
    const si = s(i);
    const t = Math.asin(u);
    const arc = t * R;
    const haut = Math.ceil(y(COL.haut, i));
    const bas = Math.floor(y(COL.sol, i));
    for (let j = haut; j <= bas; j++) {
      const v = hauteurDuRond(j, si, COL.oeil, COL.courbe);
      const lit = Math.floor((v - COL.haut) / 8);
      const decale = arc + 400 + (lit % 2) * 9 + Math.floor(alea(lit + 3, 23) * 6);
      const joint = (v - COL.haut) % 8 >= 6.9 || decale % 18 < Math.min(2.6, 1 / Math.max(0.3, si));
      const a = alea(Math.floor(decale / 18) + 300, lit + 17);
      let couleur: string = joint ? PIERRE_B.joint : a < 0.28 ? PIERRE_B.clair : a < 0.8 ? PIERRE_B.fond : PIERRE_B.sombre;
      if (!joint && alea(i, j) < 0.05) couleur = melanger(couleur, PIERRE_B.joint, 0.35);
      // Les nids : une niche cintrée par case de la grille, sur son bandeau de pierre.
      const rang = Math.floor((v - PREMIER_RANG) / RANG);
      const b = v - PREMIER_RANG - rang * RANG;
      if (rang >= 0 && rang < RANGS) {
        const ti = t / PAS - (rang % 2) * 0.5;
        const col = Math.round(ti);
        const centre = (col + (rang % 2) * 0.5) * PAS;
        const da = (ti - col) * PAS * R;
        if (Math.abs(centre) < 1.3) {
          const dans = (marge: number): boolean => Math.abs(da) <= 6.5 + marge && b >= -marge && b <= 12 && (b >= 5 || da * da + (b - 5) * (b - 5) * 1.7 <= (6.5 + marge) * (6.5 + marge));
          if (dans(0)) {
            if (estCiel(rang, col)) {
              T.fixer(i, j, da < -4.6 || b < 1.2 ? couleurDuDehors(PIERRE_B.sombre, "#393f52", l) : ciel(0.3 + b / 30));
              continue;
            }
            const fond = b < 2.5 ? "#231a13" : da > 3.5 ? "#2e2219" : b > 9.5 ? "#5a4526" : "#3a2c20";
            couleur = b > 8.5 && alea(i, j + 70) < 0.55 ? (alea(i, j) < 0.5 ? CHAUME.sombre : CHAUME.brin) : fond;
          } else if (dans(1.6)) couleur = b < 5 ? PIERRE_B.clair : da < 0 ? PIERRE_B.clair : PIERRE_B.fond;
        }
        if (b >= 12 && b < 14.2) couleur = b < 13 ? "#b9b2a2" : PIERRE_B.joint;
        else if (b >= 14.2 && b < 16.5 && alea(Math.floor(decale / 3), rang) < 0.3) couleur = melanger(couleur, "#d8d4c6", 0.4);
      }
      const ombre = 0.5 * Math.abs(u) ** 3 + (u < 0 ? 0.07 : 0) + 0.25 * borner((haut + 9 - j) / 9) + 0.3 * borner((j - bas + 5) / 5);
      T.poser(i, j, melanger(couleur, OMBRE, Math.min(0.75, ombre)));
    }
  }
  for (let rang = 0; rang < RANGS; rang++) {
    for (let col = -8; col <= 8; col++) {
      const centre = (col + (rang % 2) * 0.5) * PAS;
      if (Math.abs(centre) >= 1.3) continue;
      const nx = Math.round(cx + R * Math.sin(centre));
      nids.push({ x: nx, y: Math.round(y(PREMIER_RANG + rang * RANG + 11, nx)), large: 13 * Math.cos(centre), rang, col, ciel: estCiel(rang, col) });
    }
  }
  // Qui habite les nids : un pigeon couché, des œufs, ou personne.
  for (const n of nids) {
    const h = alea(n.col * 7 + 90, n.rang * 13 + 5);
    const sens = alea(n.col, n.rang + 50) < 0.5 ? 1 : -1;
    if (n.ciel) continue;
    if (n.large < 8.5) continue;
    if (h < 0.3) pigeonAuNid(T, n.x, n.y, sens, Math.floor(alea(n.col + 9, n.rang) * 4));
    else if (h < 0.42) {
      T.rect(n.x - 3, n.y - 2, 3, 3, (i, j) => (i === n.x - 3 && j === n.y - 2 ? "#3a2c20" : j === n.y ? "#cfc8b4" : "#f2eee0"));
      T.rect(n.x + 1, n.y - 1, 3, 2, (_i, j) => (j === n.y ? "#cfc8b4" : "#f2eee0"));
    }
  }

  // La tranche des deux murs : de gros blocs taillés, plus clairs ; la sablière posée dessus.
  for (const x0 of [0, COL.l - COL.mur]) {
    T.rect(x0, COL.haut, COL.mur, COL.sol - COL.haut + 1, (i, j) => {
      const lit = Math.floor((j - COL.haut) / 11);
      const decale = i - x0 + (lit % 2) * 9;
      if ((j - COL.haut) % 11 === 10 || decale % 18 === 0) return "#6e685c";
      const a = alea(lit + (x0 > 0 ? 40 : 0), Math.floor(decale / 18) + 3);
      const couleur = a < 0.35 ? "#bcb5a4" : a < 0.75 ? "#b0a998" : "#a39c8c";
      return alea(i, j) < 0.06 ? "#a39c8c" : couleur;
    });
    T.rect(x0 === 0 ? COL.mur - 1 : x0, COL.haut, 1, COL.sol - COL.haut + 1, "#4a453d");
  }

  // Le sol : des dalles, de la paille, quelques plumes ; il s'arrondit au pied du mur.
  for (let i = COL.mur; i < COL.l - COL.mur; i++) {
    const haut = Math.floor(y(COL.sol, i)) + 1;
    for (let j = haut; j <= COL.sol; j++) {
      const part = (j - (COL.sol - 26)) / 26;
      const rangee = Math.floor(part * part * 5 + part * 2);
      const decale = i + rangee * 23 + Math.floor(alea(rangee, 77) * 9);
      const large = 15 + rangee * 3;
      const suivante = Math.floor(((j + 1 - (COL.sol - 26)) / 26) ** 2 * 5 + ((j + 1 - (COL.sol - 26)) / 26) * 2) !== rangee;
      const a = alea(Math.floor(decale / large), rangee + 200);
      let couleur: string = suivante || decale % large === 0 ? "#5c564a" : a < 0.3 ? "#9a917c" : a < 0.75 ? "#8f8672" : "#7f7765";
      const paille = alea(i >> 3, (j >> 2) + 31) * 0.5 + alea(i >> 1, j) * 0.5;
      if (paille > 0.66) couleur = alea(i, j) < 0.5 ? CHAUME.fond : CHAUME.sombre;
      else if (paille > 0.61) couleur = CHAUME.brin;
      else if (alea(i, j + 300) < 0.012) couleur = "#e6e2d4";
      T.poser(i, j, melanger(couleur, OMBRE, 0.34 * borner((haut + 4 - j) / 4)));
    }
  }

  // Sous le sol, dans la coupe : le bord des dalles, l'assise de moellons, la terre.
  for (let j = COL.sol + 1; j < COL.h; j++) {
    for (let i = 0; i < COL.l; i++) {
      const d = j - COL.sol - 1;
      const sousMur = i < COL.mur + 8 || i >= COL.l - COL.mur - 8;
      let couleur: string;
      if (d < 2 && !sousMur) couleur = d === 0 ? "#b9b2a2" : "#6e685c";
      else if (d < 12 || sousMur) {
        const lit = Math.floor(d / 6);
        const decale = i + lit * 11 + Math.floor(alea(lit, 5) * 7);
        const a = alea(Math.floor(decale / 16), lit + 60);
        couleur = d % 6 === 5 || decale % 16 === 0 ? "#4f4a42" : a < 0.3 ? "#8c8577" : a < 0.7 ? "#7d766a" : "#6d675c";
      } else {
        const a = alea(i >> 1, j);
        couleur = a < 0.1 ? TERRE.claire : a < 0.3 ? TERRE.sombre : TERRE.fond;
        if (alea(i >> 2, (j >> 1) + 9) < 0.05) couleur = "#8c8577";
        if (d === 12) couleur = TERRE.sombre;
      }
      T.poser(i, j, melanger(couleur, OMBRE, 0.12 + 0.02 * d));
    }
  }

  // L'entrait, d'un mur à l'autre, et ses deux aisseliers cintrés.
  for (const sens of [-1, 1]) {
    for (let a = 0; a <= 30; a++) {
      const chute = Math.round(30 - Math.sqrt(30 * 30 - (30 - a) * (30 - a)));
      const bx = sens === -1 ? COL.mur + a : COL.l - COL.mur - 1 - a;
      T.rect(bx, COL.haut + 7 + chute, 1, 5, (_i, j) => (j === COL.haut + 7 + chute ? BOIS.clair : j === COL.haut + 11 + chute ? BOIS.creux : BOIS.sombre));
    }
  }
  poutre(T, COL.mur - 4, COL.haut + 1, COL.l - 2 * COL.mur + 8, 8);
  for (let i = COL.mur + 30; i < COL.l - COL.mur - 30; i += 37) T.rect(i, COL.haut + 3, 2, 2, BOIS.creux);

  // La lucarne, dans le toit : son cadre de bois, le ciel, la planche d'envol.
  const lu = { x: 91, y: 22, l: 27, h: 22 };
  T.rect(lu.x - 3, lu.y - 3, lu.l + 6, lu.h + 6, (i, j) => (i < lu.x - 1 || j < lu.y - 1 ? BOIS.clair : i > lu.x + lu.l || j > lu.y + lu.h ? BOIS.creux : BOIS.fond));
  for (let j = lu.y; j < lu.y + lu.h; j++) {
    for (let i = lu.x; i < lu.x + lu.l; i++) {
      // L'épaisseur du chaume, à gauche et en haut de l'ouverture.
      const tranche = i - lu.x < 4 || j - lu.y < 3;
      T.fixer(i, j, tranche ? ((i + j) % 3 === 0 ? p.chaume.rang : j - lu.y < 3 ? p.chaume.sombre : p.chaume.fond) : ciel(0.2 + (j - lu.y) / 40));
    }
  }
  poutre(T, lu.x - 6, lu.y + lu.h + 3, lu.l + 16, 3);
  T.trait(lu.x + lu.l + 8, lu.y + lu.h + 6, lu.x + lu.l + 2, lu.y + lu.h + 14, BOIS.sombre, 2);

  // Le mât qui tourne sur sa crapaudine, ses deux potences, leurs jambes de force, et l'échelle au bout.
  const haute = { y0: 94, x1: 252, y1: 100 };
  const basse = { y0: 210, x1: 252, y1: 203 };
  for (const arm of [haute, basse]) {
    T.trait(cx, arm.y0, arm.x1 + 14, arm.y1 + (arm === haute ? 1 : -1), (_k, e) => (e === 0 ? BOIS.clair : e === 3 ? BOIS.creux : e === 1 ? BOIS.autre : BOIS.fond), 4);
  }
  T.trait(cx + 3, 128, 204, 99, (_k, e) => (e === 0 ? BOIS.autre : BOIS.sombre), 3);
  T.trait(cx + 3, 180, 204, 207, (_k, e) => (e === 0 ? BOIS.autre : BOIS.sombre), 3);
  const montant = (x0: number, y0: number, x1: number, y1: number): void => T.trait(x0, y0, x1, y1, (_k, e) => (e === 0 ? BOIS.clair : e === 2 ? BOIS.sombre : BOIS.autre), 3);
  for (let j = 92; j <= 224; j += 9) {
    const part = (j - 84) / 146;
    T.trait(Math.round(246 + 6 * part) + 2, j, Math.round(261 + 6 * part), j + 1, (_k, e) => (e === 0 ? BOIS.clair : BOIS.sombre), 2);
  }
  montant(246, 84, 252, 230);
  montant(261, 86, 267, 231);
  // Les ligatures de corde, là où l'échelle tient aux potences.
  for (const [lx, ly] of [[248, 98], [263, 100], [250, 201], [265, 203]] as const) T.rect(lx - 1, ly, 5, 4, (i, j) => ((i + j) % 2 === 0 ? BOIS.corde : BOIS.cordeSombre));
  poteau(T, cx - 4, COL.haut + 9, 8, COL.sol - COL.haut - 16);
  for (const fy of [96, 128, 180, 212]) T.rect(cx - 5, fy - 2, 10, 3, (i, j) => (j === fy - 2 ? FER_CLAIR : i === cx + 4 ? "#3a4050" : FER));
  T.rect(cx - 12, COL.sol - 8, 24, 9, (i, j) => (j === COL.sol - 8 ? "#c4bdac" : j === COL.sol || i === cx - 12 || i === cx + 11 ? "#5a554c" : i < cx - 4 ? "#a69f90" : i > cx + 5 ? "#736d61" : "#8c8577"));
  T.rect(cx - 7, COL.sol - 11, 14, 3, (i, j) => (j === COL.sol - 11 ? FER_CLAIR : i > cx + 3 ? "#3a4050" : FER));

  // Ce qu'il faut aux pigeons : l'auge à grains, les sacs, la vasque d'eau, le panier d'œufs, le balai.
  const auge = { x: 182, y: 236, l: 46 };
  T.rect(auge.x, auge.y, auge.l, 9, (i, j) => (j === auge.y + 8 ? BOIS.creux : i === auge.x || i === auge.x + auge.l - 1 ? BOIS.sombre : j === auge.y ? BOIS.clair : (i - auge.x) % 9 === 8 ? BOIS.sombre : BOIS.autre));
  T.rect(auge.x + 2, auge.y - 1, auge.l - 4, 3, (i, j) => (alea(i, j) < 0.3 ? "#f2d272" : alea(i, j) < 0.5 ? "#b8922f" : "#e0b84e"));
  for (const gx of [auge.x + 3, auge.x + auge.l - 6]) T.rect(gx, auge.y + 9, 3, 2, BOIS.creux);
  for (let k = 0; k < 26; k++) T.poser(auge.x - 8 + Math.floor(alea(k, 3) * 62), auge.y + 6 + Math.floor(alea(k, 4) * 5), alea(k, 5) < 0.5 ? "#f2d272" : "#e0b84e");
  const sac = (x: number, bas: number, large: number, haut: number): void => {
    for (let j = 0; j < haut; j++) {
      const ventre = j < 3 ? large * 0.3 + j : large / 2 - (j > haut - 3 ? haut - j < 2 ? 2 : 1 : 0) + Math.sin(j / 3) * 0.6;
      for (let i = -Math.round(ventre); i <= Math.round(ventre); i++) {
        const rel = i / (ventre + 0.5);
        let couleur = rel < -0.4 ? "#ddcfa2" : rel > 0.5 ? "#a8996e" : "#cbbb8c";
        if (alea(x + i, bas - haut + j) < 0.1) couleur = "#b8a878";
        if (Math.abs(i) === Math.round(ventre) || j === haut - 1) couleur = "#7c704e";
        if (j === 3) couleur = BOIS.cordeSombre;
        T.poser(x + i, bas - haut + 1 + j, couleur);
      }
    }
  };
  sac(283, 243, 17, 23);
  sac(268, 244, 15, 19);
  sac(292, 245, 13, 15);
  T.rect(279, 220, 9, 3, (i, j) => (alea(i, j) < 0.4 ? "#f2d272" : "#e0b84e"));
  // La vasque de pierre, pleine d'eau.
  for (let j = 0; j < 11; j++) {
    const demi = j < 2 ? 15 : 15 - Math.round((j - 2) * 0.9);
    T.rect(46 - demi, 234 + j, demi * 2 + 1, 1, (i) => (j === 0 ? "#c4bdac" : i === 46 - demi || i === 46 + demi || j === 10 ? "#5a554c" : i < 40 ? "#a69f90" : i > 52 ? "#736d61" : "#8c8577"));
  }
  T.rect(34, 234, 25, 2, (i, j) => (j === 234 && alea(i >> 1, 8) < 0.35 ? "#b5d8ea" : i > 50 ? "#3b7499" : "#5c9bc4"));
  // Le panier d'œufs.
  for (let j = 0; j < 9; j++) {
    const demi = 8 - Math.round(j * 0.35);
    T.rect(72 - demi, 236 + j, demi * 2 + 1, 1, (i) => (j === 0 ? BOIS.corde : (i + j) % 3 === 0 ? "#8a6e3c" : j % 3 === 2 ? "#a08c5c" : BOIS.corde));
  }
  for (const [ex, ey] of [[66, 233], [70, 232], [74, 233], [77, 234]] as const) T.rect(ex, ey, 3, 3, (i, j) => (i === ex + 2 && j === ey + 2 ? "#cfc8b4" : "#f4f0e2"));
  T.trait(66, 228, 79, 228, "#8a6e3c");
  T.poser(65, 229, "#8a6e3c");
  T.poser(80, 229, "#8a6e3c");
  // Le balai de genêt, contre le mur de gauche.
  T.trait(22, 170, 29, 232, (_k, e) => (e === 0 ? BOIS.clair : BOIS.sombre), 2);
  for (let j = 0; j < 14; j++) T.rect(27 - Math.round(j * 0.3), 231 + j, 6 + Math.round(j * 0.7), 1, (i) => (alea(i, j + 12) < 0.4 ? "#7a6a34" : alea(i, j) < 0.5 ? "#a08c44" : "#8e7a3c"));
  T.rect(26, 230, 8, 2, BOIS.cordeSombre);

  // Les pigeons : sur l'entrait, sur les potences, à la lucarne, au sol près de l'auge.
  pigeon(T, 62, COL.haut + 1, 1, 1);
  pigeon(T, 78, COL.haut + 1, -1, 0);
  pigeon(T, 222, COL.haut + 1, -1, 2);
  pigeon(T, 276, COL.haut + 1, -1, 3);
  pigeon(T, 198, 96, 1, 0);
  pigeon(T, 222, 98, image === 2 ? 1 : -1, 1);
  pigeon(T, 214, 206, -1, 3);
  pigeon(T, image === 3 ? lu.x + 20 : lu.x + 12, lu.y + lu.h + 3, image === 3 ? -1 : 1, 0);
  pigeon(T, 176, 244, 1, 1, image === 1);
  pigeon(T, 240, 245, -1, 0, image === 2);
  pigeon(T, 206, 233, 1, 2, image === 3 || image === 1);
  pigeon(T, 136, 240, -1, 3, image === 2);
  for (const n of nids) {
    if (n.ciel && n.rang === 1 && n.col === -1) pigeon(T, n.x + 1, n.y + 1, 1, 2);
    if (n.ciel && n.rang === 4 && n.col === 1) pigeon(T, n.x, n.y + 1, -1, 0);
  }

  // La lanterne, pendue à l'entrait ; puis la lumière : la lucarne, les trous d'envol.
  const lampe = lanterne(T, l, 128, COL.haut + 9, 22);
  const rayons: Rayon[] = [{ x: lu.x + 4, y: lu.y + lu.h, large: lu.l - 6, pente: 0.72, evase: 34, long: 200, force: 1 }];
  for (const n of nids) if (n.ciel) rayons.push({ x: n.x - n.large / 2 + 2, y: n.y - 8, large: n.large - 3, pente: 0.72, evase: 8, long: 46, force: 0.55 });
  eclairer(T, l, [{ ...lampe, rayon: 175 }], rayons);
  return T.decor();
}

/* ---------- L'étable ---------- */

const ETA = { l: 440, h: 210, toit: 42, lisse: 98, pied: 150, sol: 196, mur: 10 } as const;
const ETA_IMAGES = 4;
/** Les poteaux du mur du fond : quatre travées. */
const ETA_POTEAUX = [115, 220, 325] as const;

/** La tête de la bête, de profil, tournée vers la gauche (les couleurs de `TETE_DE_BETE`, `batiments/lot-c.ts`). */
const TETE_DE_PROFIL = [
  "..................hh......",
  ".................hhh......",
  "................hhh..eee..",
  "..........ffffffhhfeeeee..",
  "........FFFFFFffffffeee...",
  "......FFFFFFFFFfffffff....",
  ".....FFFFFFFFFFFfffffff...",
  "....FFFFFFooFFFFffffffff..",
  "...wwFFFFFooFFFfffffffff..",
  "..wwwwFFFFFFFFfffffffffd..",
  ".mmwwwwFFFFFFffffffffffd..",
  "mmmmwwwFFFFFfffffffffdd...",
  "mnmmmwwFFFffffffffffdd....",
  "mmmmmmFFffffffffdddd......",
  "mmmmmmfffffffdddd.........",
  ".mmmmmffffddd.............",
  "..kkkkkdd.................",
] as const;
const TETE_DU_VEAU = ["........ee...", "....ffffeee..", "..FFFFFfff...", ".FFFooFffff..", "mwwFFFfffff..", "mnmFFffffd...", "mmmfffddd....", ".mkkfd......."] as const;
const CHAT = ["...e..e.........", "..eeeeee........", "..ckcckc..cccc..", ".cccnccccccccccc", ".ccccccccdcccdcq", "..cccccdcccdccqq", "...cccccccccqqq."] as const;

interface Robe2 {
  f: string;
  F: string;
  d: string;
  /** Une robe pie : de grandes taches sur un fond clair. */
  pie: boolean;
}
const ROBE_FAUVE: Robe2 = { f: "#b47a48", F: "#c68d58", d: "#99653d", pie: false };
const ROBE_PIE: Robe2 = { f: "#8f5c3a", F: "#a36c44", d: "#75492d", pie: true };
const BLANC_DE_BETE = { f: "#eadcc2", F: "#f4ead4", d: "#cdbd9f" } as const;

/**
 * Une vache de profil, les sabots sur la rangée `sol`, son milieu en `ox` ; `sens` 1 regarde à gauche, −1 à droite.
 * `basse` : de combien de rangées elle baisse la tête vers l'auge.
 */
function vache(T: Toile, ox: number, sol: number, sens: 1 | -1, robe: Robe2, basse: number): void {
  const px = (dx: number, dy: number, couleur: string): void => T.poser(ox + sens * dx, sol + dy, couleur);
  const contour = "#5a3a22";
  const sabot = "#3a2a1e";
  const dos = (dx: number): number => -50 - 2 * Math.exp(-(((dx + 22) / 6) ** 2)) - 1.5 * Math.exp(-(((dx - 24) / 5) ** 2)) + (dx > 29 ? (dx - 29) ** 2 * 0.3 : 0) + (dx < -27 ? (-27 - dx) ** 2 * 0.45 : 0);
  const ventre = (dx: number): number => -22 + 3.5 * Math.exp(-(((dx - 6) / 13) ** 2)) - (dx < -25 ? (-25 - dx) * 1.4 : 0) - (dx > 28 ? (dx - 28) * 1.5 : 0);
  const tache = (dx: number, dy: number): boolean => {
    if (!robe.pie) return true;
    const dans = (cx: number, cy: number, rx: number, ry: number): boolean => ((dx - cx) / rx) ** 2 + ((dy - cy) / ry) ** 2 <= 1 + (alea(dx + 60, dy + 80) - 0.5) * 0.25;
    return dans(-16, -42, 11, 9) || dans(12, -33, 12, 10) || dans(31, -46, 7, 8) || dans(-30, -30, 5, 6);
  };
  const ton = (dx: number, dy: number, rel: number): string => {
    const r = tache(dx, dy) ? robe : BLANC_DE_BETE;
    return rel < 0.14 ? r.F : rel > 0.72 ? r.d : alea(ox + dx, dy) < 0.06 ? r.d : r.f;
  };
  const patte = (x0: number, large: number, haut: number, bas: number, loin: boolean, jarret: number): void => {
    for (let dy = haut; dy <= bas; dy++) {
      const part = (dy - haut) / (bas - haut);
      const pli = part > 0.35 && part < 0.6 ? jarret : 0;
      const l = part < 0.3 ? large : part > 0.85 ? large - 1 : large - 2;
      for (let i = 0; i < l; i++) {
        const dx = x0 + i + pli + (part >= 0.3 && part <= 0.85 ? 1 : 0);
        let couleur = loin ? robe.d : i === 0 ? robe.F : robe.f;
        if (loin) couleur = melanger(couleur, contour, 0.35);
        if (i === l - 1 && !loin) couleur = robe.d;
        if (dy >= bas - 2) couleur = sabot;
        px(dx, dy, couleur);
      }
    }
  };
  // Les pattes du fond, puis la queue.
  patte(-18, 5, -24, -2, true, 0);
  patte(16, 6, -27, -2, true, 1);
  for (let dy = -47; dy <= -18; dy++) px(dy < -30 ? 35 : 36, dy, dy % 5 === 0 ? robe.d : robe.f);
  for (let dy = -18; dy <= -11; dy++) for (let dx = 35; dx <= 37 + (dy > -16 && dy < -12 ? 1 : 0); dx++) px(dx, dy, alea(dx, dy) < 0.4 ? "#3a261a" : "#5a3a22");
  // Le corps.
  for (let dx = -31; dx <= 35; dx++) {
    const haut = Math.round(dos(dx));
    const bas = Math.round(ventre(dx));
    for (let dy = haut; dy <= bas; dy++) {
      const rel = (dy - haut) / Math.max(1, bas - haut);
      px(dx, dy, dy === bas || dx === 35 ? contour : dy === haut && rel === 0 ? melanger(ton(dx, dy, 0), "#fff0d0", 0.2) : ton(dx, dy, rel));
    }
  }
  // La hanche et l'épaule, à peine marquées ; le pis.
  for (let dy = -44; dy <= -32; dy++) px(20 - Math.round(((dy + 38) / 6) ** 2 * 2), dy, robe.pie && !tache(20, dy) ? BLANC_DE_BETE.d : robe.d);
  for (let dy = -40; dy <= -28; dy++) px(-17 + Math.round(((dy + 34) / 6) ** 2 * 2), dy, robe.pie && !tache(-17, dy) ? BLANC_DE_BETE.d : robe.d);
  for (let dx = 13; dx <= 23; dx++) for (let dy = -20; dy <= -15 + (dx > 15 && dx < 22 ? 1 : 0); dy++) px(dx, dy, dx === 23 || dy >= -15 ? "#b98a7c" : "#e0b4a4");
  for (const dx of [15, 19]) px(dx, -13, "#c99a8c");
  // Les pattes de devant.
  patte(-26, 6, -26, 0, false, 0);
  patte(24, 7, -30, 0, false, 1);
  // L'encolure et la tête.
  const hx = -58;
  const hy = -68 + basse;
  for (let k = 0; k <= 24; k++) {
    const part = k / 24;
    const dx = Math.round(-27 + (hx + 23 + 27) * part);
    const haut = Math.round(-51 + (hy + 5 + 51) * part);
    const bas = Math.round(-28 + (hy + 15 + 28) * part);
    for (let dy = haut; dy <= bas; dy++) {
      const rel = (dy - haut) / Math.max(1, bas - haut);
      px(dx, dy, dy === bas ? contour : ton(dx, dy, rel * 0.9));
    }
  }
  const tete = { f: robe.f, F: robe.F, d: robe.d, w: "#eadcc2", m: "#d7b5a2", n: "#8a5a4a", k: "#8a5a4a", o: "#3a261a", h: "#e2d8be", e: robe.d };
  T.motif(sens === 1 ? ox + hx : ox - hx - 25, sol + hy, TETE_DE_PROFIL, tete, sens);
  // La corde au cou, et sa clochette.
  for (let dy = 0; dy < 12; dy++) px(hx + 25, hy + 4 + dy, dy % 2 === 0 ? BOIS.corde : BOIS.cordeSombre);
  for (const [dx, dy, couleur] of [[25, 16, "#e2b23c"], [24, 17, "#e2b23c"], [25, 17, "#e2b23c"], [26, 17, "#b8882a"], [24, 18, "#e2b23c"], [25, 18, "#b8882a"], [26, 18, "#b8882a"]] as const) px(hx + dx, hy + dy, couleur);
}

/** Le veau couché dans la paille, la tête levée : son milieu en `ox`, posé sur la rangée `sol`. */
function veau(T: Toile, ox: number, sol: number, sens: 1 | -1, tourne: boolean): void {
  const px = (dx: number, dy: number, couleur: string): void => T.poser(ox + sens * dx, sol + dy, couleur);
  const r = { f: "#c68d58", F: "#d8a26c", d: "#a8754a" };
  for (let dx = -16; dx <= 17; dx++) {
    const demi = 8 * Math.sqrt(Math.max(0, 1 - (dx / 17.5) ** 2));
    for (let dy = Math.round(-8 - demi); dy <= 0; dy++) {
      const rel = (dy + 8 + demi) / (8 + demi);
      px(dx, dy, dy === 0 ? "#5a3a22" : rel < 0.2 ? r.F : rel > 0.7 ? r.d : r.f);
    }
  }
  // Les pattes repliées, la queue.
  for (let dx = -14; dx <= -5; dx++) px(dx, -1, dx < -11 ? "#3a2a1e" : r.F);
  for (let dx = -13; dx <= -6; dx++) px(dx, -2, r.F);
  for (let dx = 6; dx <= 15; dx++) px(dx, -2, dx > 12 ? "#3a2a1e" : r.F);
  for (let dx = 4; dx <= 12; dx++) px(dx, -4 - Math.round((dx - 4) * 0.3), r.d);
  px(18, -5, r.d);
  px(19, -4, r.d);
  px(19, -3, "#5a3a22");
  // L'encolure et la tête.
  const hx = tourne ? -24 : -26;
  const hy = tourne ? -23 : -25;
  for (let dy = hy + 6; dy <= -9; dy++) for (let dx = -16; dx <= -9; dx++) px(dx - Math.round((-9 - dy) * 0.25), dy, dx === -16 ? r.F : dx === -9 ? r.d : r.f);
  T.motif(sens === 1 ? ox + hx : ox - hx - 12, sol + hy, TETE_DU_VEAU, { f: r.f, F: r.F, d: r.d, w: "#eadcc2", m: "#d7b5a2", n: "#8a5a4a", k: "#8a5a4a", o: "#3a261a", e: r.d }, sens);
}

/** Un tas de foin : de `x0` à `x1`, posé sur la rangée `bas`, haut de `h(x)` cases. */
function foin(T: Toile, x0: number, x1: number, bas: number, h: (x: number) => number, graine: number): void {
  for (let i = x0; i <= x1; i++) {
    const haut = bas - Math.round(h(i));
    for (let j = haut; j <= bas; j++) {
      const rel = (i - x0) / Math.max(1, x1 - x0);
      const a = alea(i + graine, j);
      let couleur: string = rel < 0.35 && j < haut + 7 ? CHAUME.clair : rel > 0.7 || j > bas - 4 ? CHAUME.sombre : CHAUME.fond;
      if (alea((i >> 2) + graine, j) < 0.2) couleur = CHAUME.rang;
      else if (a < 0.1) couleur = CHAUME.brin;
      else if (a < 0.15) couleur = CHAUME.clair;
      if (j === haut) couleur = alea(i, graine) < 0.6 ? CHAUME.bord : CHAUME.clair;
      T.poser(i, j, couleur);
    }
    if (alea(i, graine + 7) < 0.3) T.poser(i, haut - 1, CHAUME.brin);
    if (alea(i, graine + 8) < 0.1) T.poser(i, haut - 2, CHAUME.brin);
  }
}

/** Un seau de bois cerclé de fer, avec son anse de corde. */
function seau(T: Toile, x: number, bas: number, plein: string | null): void {
  for (let j = 0; j < 11; j++) {
    const retrait = j > 7 ? 1 : 0;
    T.rect(x + retrait, bas - 10 + j, 11 - 2 * retrait, 1, (i) => (j === 2 || j === 8 ? (i < x + 4 ? FER_CLAIR : FER) : i === x + retrait || i === x + 10 - retrait || j === 10 ? BOIS.creux : (i - x) % 3 === 2 ? BOIS.sombre : i < x + 4 ? BOIS.clair : BOIS.autre));
  }
  T.rect(x + 1, bas - 10, 9, 1, plein ?? BOIS.creux);
  for (let i = 0; i <= 10; i++) T.poser(x + i, bas - 11 - Math.round(4 * Math.sin((Math.PI * i) / 10)), i % 2 === 0 ? BOIS.corde : BOIS.cordeSombre);
}

function dessinerEtable(l: Lumiere, image: number): Decor {
  const T = new Toile(ETA.l, ETA.h);
  const ciel = cielDe(l);
  const p = paletteDuDehors(l);

  // Le dessous du toit : le chaume vu par-dessous, ses lattes, ses chevrons, une panne.
  T.rect(0, 0, ETA.l, ETA.toit, (i, j) => {
    let couleur: string = alea(i, j) < 0.2 ? "#75592a" : alea(i >> 1, j) < 0.3 ? "#94763a" : "#86692f";
    if (j % 6 === 5) couleur = "#5d4320";
    const c = (i + 13) % 22;
    if (c < 4) couleur = c === 0 ? BOIS.clair : c === 3 ? BOIS.creux : alea(i, j >> 2) < 0.2 ? BOIS.sombre : BOIS.fond;
    return melanger(couleur, OMBRE, 0.18 + 0.42 * (1 - j / ETA.toit));
  });
  poutre(T, 0, 17, ETA.l, 5);
  T.rect(0, 22, ETA.l, 2, (i, j) => melanger(T.lire(i, j)!, OMBRE, 0.3));

  // Le mur du fond : le torchis en haut, les planches en bas, comme dehors.
  T.rect(ETA.mur, ETA.toit, ETA.l - 2 * ETA.mur, ETA.lisse - ETA.toit, (i, j) => {
    const a = alea(i >> 1, j >> 1);
    let couleur: string = a < 0.07 ? MUR.trame : a > 0.93 ? MUR.clair : alea(i, j) < 0.05 ? MUR.sombre : MUR.fond;
    if ((j - ETA.toit) % 13 === 12 && alea(i >> 3, j) < 0.6) couleur = MUR.trame;
    // Une lézarde, des brins de paille pris dans la terre.
    if (alea(i >> 1, (j >> 3) + 77) < 0.012) couleur = MUR.ombre;
    return melanger(couleur, OMBRE, 0.16 + 0.3 * borner((ETA.toit + 12 - j) / 12));
  });
  T.rect(ETA.mur, ETA.lisse, ETA.l - 2 * ETA.mur, ETA.pied - ETA.lisse + 1, (i, j) => {
    const k = (i - ETA.mur) % 7;
    const planche = Math.floor((i - ETA.mur) / 7);
    let couleur: string = k === 6 ? BOIS.creux : k === 0 ? BOIS.clair : planche % 2 === 0 ? BOIS.fond : BOIS.autre;
    if (k !== 6 && alea(planche, j >> 3) < 0.07) couleur = BOIS.sombre;
    if (k !== 6 && (j + planche * 11) % 37 === 0) couleur = BOIS.sombre;
    return melanger(couleur, OMBRE, 0.2 + 0.25 * borner((ETA.lisse + 9 - j) / 9) + 0.2 * borner((j - ETA.pied + 6) / 6));
  });

  // Les deux fenêtres : le ciel de l'heure, les volets ouverts.
  const fenetres = [{ x: 153, y: 57 }, { x: 371, y: 57 }] as const;
  for (const f of fenetres) {
    T.rect(f.x - 3, f.y - 3, 32, 30, (i, j) => (i < f.x - 1 || j < f.y - 1 ? BOIS.clair : i > f.x + 26 || j > f.y + 24 ? BOIS.creux : BOIS.fond));
    for (let j = f.y; j < f.y + 24; j++) for (let i = f.x; i < f.x + 26; i++) T.fixer(i, j, i - f.x < 3 || j - f.y < 2 ? couleurDuDehors(MUR.ombre, "#3a3248", l) : ciel(0.3 + (j - f.y) / 34));
    for (let j = f.y; j < f.y + 24; j++) T.fixer(f.x + 14, j, p.bois.sombre);
    for (let i = f.x + 3; i < f.x + 26; i++) T.fixer(i, f.y + 12, p.bois.sombre);
    for (const vx of [f.x - 12, f.x + 30]) {
      T.rect(vx, f.y - 2, 9, 28, (i, j) => (i === vx || j === f.y - 2 ? BOIS.clair : i === vx + 8 || j === f.y + 25 ? BOIS.creux : (j - f.y) % 9 === 3 ? BOIS.sombre : (i - vx) % 3 === 0 ? BOIS.fond : BOIS.autre));
    }
    T.rect(f.x - 5, f.y + 27, 36, 3, (_i, j) => (j === f.y + 27 ? BOIS.clair : j === f.y + 29 ? BOIS.creux : BOIS.autre));
  }

  // La charpente du mur : la sablière, la lisse, les poteaux, leurs aisseliers cintrés, le bout des entraits.
  poutre(T, ETA.mur, ETA.toit - 2, ETA.l - 2 * ETA.mur, 6);
  poutre(T, ETA.mur, ETA.lisse - 2, ETA.l - 2 * ETA.mur, 5);
  for (const x of ETA_POTEAUX) {
    for (const sens of [-1, 1]) {
      for (let a = 0; a <= 20; a++) {
        const chute = Math.round(20 - Math.sqrt(400 - (20 - a) * (20 - a)));
        T.rect(x + 3 + sens * (4 + a), ETA.toit + 4 + chute, 1, 4, (_i, j) => (j === ETA.toit + 4 + chute ? BOIS.clair : j === ETA.toit + 7 + chute ? BOIS.creux : BOIS.sombre));
      }
    }
    poteau(T, x, ETA.toit + 4, 7, ETA.pied - ETA.toit - 3);
    T.rect(x - 2, ETA.toit - 6, 11, 11, (i, j) => {
      const d = Math.max(Math.abs(i - x - 3), Math.abs(j - ETA.toit + 1));
      return d === 5 ? (i === x - 2 || j === ETA.toit - 6 ? BOIS.clair : BOIS.creux) : d % 2 === 0 ? BOIS.autre : BOIS.sombre;
    });
  }

  // Le sol : de la terre battue, de la paille, plus épaisse dans les stalles.
  T.rect(ETA.mur, ETA.pied + 1, ETA.l - 2 * ETA.mur, ETA.sol - ETA.pied, (i, j) => {
    const a = alea(i >> 1, j);
    let couleur: string = a < 0.12 ? TERRE.claire : a < 0.3 ? TERRE.sombre : TERRE.fond;
    if (alea(i >> 3, j >> 1) < 0.06) couleur = "#7d6a50";
    const litiere = i > 214 ? 0.24 : i < 60 ? 0.4 : 0.62;
    const paille = alea(i >> 3, (j >> 2) + 31) * 0.6 + alea(i >> 2, (j >> 1) + 9) * 0.4;
    const brin = alea(i >> 1, j + 5);
    if (paille > litiere + 0.07) couleur = brin < 0.07 ? CHAUME.clair : brin < 0.3 ? CHAUME.fond : brin < 0.72 ? CHAUME.sombre : CHAUME.brin;
    else if (paille > litiere) couleur = brin < 0.5 ? CHAUME.brin : CHAUME.bord;
    return melanger(couleur, OMBRE, 0.3 * borner((ETA.pied + 6 - j) / 5));
  });

  // Les deux pignons, dans la coupe : un poteau, du torchis ; puis, sous le sol, la sablière basse sur son solin de pierres.
  for (const x0 of [0, ETA.l - ETA.mur]) {
    T.rect(x0, 0, ETA.mur, ETA.sol + 1, (i, j) => {
      const bord = x0 === 0 ? i === ETA.mur - 1 : i === x0;
      if (bord) return "#3d2616";
      if (j % 34 < 5) return j % 34 === 0 ? BOIS.clair : j % 34 === 4 ? BOIS.creux : BOIS.autre;
      return alea(i >> 1, j >> 1) < 0.2 ? "#c9a56c" : alea(i, j) < 0.1 ? "#b08c58" : "#be9a62";
    });
  }
  T.rect(0, ETA.sol + 1, ETA.l, ETA.h - ETA.sol - 1, (i, j) => {
    const d = j - ETA.sol - 1;
    if (d < 5) return d === 0 ? BOIS.clair : d === 4 ? BOIS.creux : (i + 30) % 110 === 0 ? BOIS.creux : alea(i >> 2, j) < 0.2 ? BOIS.sombre : BOIS.fond;
    const lit = Math.floor((d - 5) / 5);
    const decale = i + lit * 9 + Math.floor(alea(lit, 15) * 7);
    const a = alea(Math.floor(decale / 15), lit + 90);
    const couleur = (d - 5) % 5 === 4 || decale % 15 === 0 ? "#4f4a42" : a < 0.3 ? "#958e7f" : a < 0.7 ? "#84796c" : "#746d61";
    return melanger(couleur, OMBRE, 0.1 + 0.03 * d);
  });

  // Le fenil, à gauche : un plancher sur ses solives, le foin entassé, le chat qui dort, l'échelle.
  const fenil = { x0: ETA.mur, x1: 121, y: 90 };
  foin(T, fenil.x0, fenil.x1 - 6, fenil.y, (i) => 30 + 9 * Math.sin((i - 4) / 21) + 4 * Math.sin(i / 6.5) - Math.max(0, i - 96) * 1.6, 11);
  poutre(T, fenil.x0, fenil.y + 1, fenil.x1 - fenil.x0 + 4, 5);
  for (let i = fenil.x0 + 6; i < fenil.x1; i += 19) T.rect(i, fenil.y + 6, 5, 5, (a, b) => (a === i || b === fenil.y + 6 ? BOIS.autre : a === i + 4 || b === fenil.y + 10 ? BOIS.creux : BOIS.sombre));
  for (let i = fenil.x0; i <= fenil.x1; i++) {
    const brins = Math.floor(alea(i, 61) * 7) - 2;
    for (let j = 0; j < brins; j++) T.poser(i, fenil.y + 1 + j, alea(i, j) < 0.5 ? CHAUME.fond : CHAUME.brin);
  }
  T.motif(50, fenil.y - 41, CHAT, { c: "#8f8a80", d: "#6a655c", k: "#3a342c", n: "#d09a8a", e: "#6a655c", q: "#6a655c" });
  // La fourche plantée dans le foin.
  T.trait(92, 34, 86, 66, (_k, e) => (e === 0 ? BOIS.clair : BOIS.sombre), 2);
  for (const dx of [-3, 0, 3]) T.trait(92 + dx, 26, 92 + dx, 33, FER);
  T.rect(89, 33, 7, 1, FER);
  // L'échelle du fenil.
  for (let j = 98; j <= 182; j += 10) T.rect(104 + Math.round((j - 88) * 0.14), j, 15, 2, (_i, b) => (b === j ? BOIS.clair : BOIS.sombre));
  T.trait(103, 84, 117, 192, (_k, e) => (e === 0 ? BOIS.clair : e === 2 ? BOIS.sombre : BOIS.autre), 3);
  T.trait(116, 84, 130, 192, (_k, e) => (e === 0 ? BOIS.clair : e === 2 ? BOIS.sombre : BOIS.autre), 3);

  // Sous le fenil : les outils pendus à leurs chevilles, l'abreuvoir creusé dans un tronc, le foin, les seaux.
  T.rect(18, 106, 80, 2, (_i, j) => (j === 106 ? BOIS.clair : BOIS.creux));
  // La fourche, le râteau, la pelle de bois, la corde lovée.
  T.rect(27, 108, 2, 40, (i) => (i === 27 ? BOIS.clair : BOIS.sombre));
  for (const dx of [-3, 0, 3]) T.rect(27 + dx + (dx === 0 ? 0 : 0), 110 - 2, 1, 9, FER);
  T.rect(24, 117, 8, 1, FER);
  T.rect(41, 108, 2, 40, (i) => (i === 41 ? BOIS.clair : BOIS.sombre));
  T.rect(35, 110, 14, 2, (_i, j) => (j === 110 ? BOIS.clair : BOIS.sombre));
  for (let i = 35; i < 49; i += 2) T.rect(i, 112, 1, 4, BOIS.sombre);
  T.rect(55, 118, 2, 30, (i) => (i === 55 ? BOIS.clair : BOIS.sombre));
  for (let j = 0; j < 11; j++) T.rect(52 - (j > 2 && j < 9 ? 1 : 0), 108 + j, 8 + (j > 2 && j < 9 ? 2 : 0), 1, (i) => (i < 55 ? BOIS.clair : j === 10 ? BOIS.sombre : BOIS.autre));
  T.disque(74, 117, 7, (dx, dy) => {
    const d = dx * dx + dy * dy;
    return d < 9 ? null : (Math.round(Math.sqrt(d)) + dx) % 2 === 0 ? BOIS.corde : BOIS.cordeSombre;
  });
  T.rect(73, 106, 3, 5, BOIS.creux);
  // Le joug, pendu plus loin.
  for (let i = 0; i < 26; i++) {
    const creux = Math.round(3 * Math.abs(Math.sin((Math.PI * i) / 13)));
    T.rect(128 + i, 112 + creux, 1, 4, (_a, b) => (b === 112 + creux ? BOIS.clair : b === 115 + creux ? BOIS.creux : BOIS.autre));
  }
  T.rect(140, 106, 2, 7, BOIS.creux);
  // Le foin en tas dans le coin, l'abreuvoir, les seaux, le tabouret à traire.
  foin(T, ETA.mur, 50, 172, (i) => 34 * Math.sqrt(Math.max(0, 1 - ((i - 10) / 41) ** 2)) + 2 * Math.sin(i / 3), 23);
  const auge = { x: 52, y: 141, l: 48 };
  T.rect(auge.x, auge.y, auge.l, 13, (i, j) => (j === auge.y ? BOIS.clair : j === auge.y + 12 ? BOIS.creux : i < auge.x + 3 ? BOIS.clair : i > auge.x + auge.l - 4 ? BOIS.sombre : j === auge.y + 6 || alea(i >> 2, j) < 0.15 ? BOIS.fond : BOIS.autre));
  T.rect(auge.x + 3, auge.y, auge.l - 6, 2, (i, j) => (j === auge.y && alea(i >> 1, 9) < 0.3 ? "#8cc0de" : "#5c9bc4"));
  for (const gx of [auge.x + 4, auge.x + auge.l - 9]) T.rect(gx, auge.y + 13, 5, 6, (i) => (i === gx ? BOIS.fond : BOIS.sombre));
  seau(T, 60, 184, "#f4f0e2");
  seau(T, 76, 187, null);
  // Le tabouret à trois pieds.
  T.rect(132, 172, 15, 3, (_i, j) => (j === 172 ? BOIS.clair : j === 174 ? BOIS.creux : BOIS.autre));
  T.trait(134, 175, 131, 186, BOIS.sombre, 2);
  T.trait(144, 175, 147, 186, BOIS.sombre, 2);
  T.rect(139, 175, 2, 10, BOIS.creux);

  // L'auge et le râtelier des bêtes, au milieu des stalles.
  const ra = { x: 328, haut: 100, bas: 132 };
  foin(T, ra.x - 23, ra.x + 23, ra.haut + 6, (i) => 12 * Math.sqrt(Math.max(0, 1 - ((i - ra.x) / 25) ** 2)) + 6, 47);
  for (let j = ra.haut; j <= ra.bas; j++) {
    const demi = Math.round(25 - ((j - ra.haut) * 13) / (ra.bas - ra.haut));
    for (let i = ra.x - demi; i <= ra.x + demi; i++) {
      const rel = (i - ra.x) / demi;
      const barreau = Math.abs(Math.round(rel * 5) - rel * 5) * demi < 3.4;
      if (j === ra.haut || j === ra.haut + 1 || j >= ra.bas - 1) T.poser(i, j, j === ra.haut || j === ra.bas - 1 ? BOIS.clair : BOIS.creux);
      else if (barreau) T.poser(i, j, rel < 0 ? BOIS.autre : BOIS.sombre);
      else T.poser(i, j, alea(i, j) < 0.25 ? CHAUME.brin : alea(i, j) < 0.5 ? CHAUME.sombre : CHAUME.fond);
    }
  }
  const mang = { x: 298, y: 140, l: 62 };
  T.rect(mang.x, mang.y, mang.l, 14, (i, j) => (j === mang.y ? BOIS.clair : j === mang.y + 13 ? BOIS.creux : i === mang.x || i === mang.x + mang.l - 1 ? BOIS.sombre : (i - mang.x) % 8 === 7 ? BOIS.sombre : j < mang.y + 6 ? BOIS.autre : BOIS.fond));
  foin(T, mang.x + 2, mang.x + mang.l - 3, mang.y, (i) => 3 + 2 * Math.sin(i / 4), 5);
  for (const gx of [mang.x + 3, mang.x + mang.l - 8]) T.rect(gx, mang.y + 14, 5, 8, (i) => (i === gx ? BOIS.fond : BOIS.sombre));
  for (let k = 0; k < 9; k++) T.poser(mang.x + 4 + Math.floor(alea(k, 31) * 54), mang.y + 14 + Math.floor(alea(k, 32) * 3), CHAUME.fond);

  // Les bêtes : deux vaches à l'auge, l'une baisse la tête ; le veau couché devant.
  vache(T, 262, 186, -1, ROBE_FAUVE, image === 1 || image === 2 ? 15 : 3);
  vache(T, 390, 185, 1, ROBE_PIE, image === 3 ? 15 : 4);
  veau(T, 366, 193, 1, image === 2 || image === 3);

  // La cloison de la stalle, qui vient vers nous : trois planches entre deux poteaux.
  for (let k = 0; k <= 16; k++) {
    const x = 221 - k;
    const haut = 118 + Math.round(k * 0.6);
    const bas = 150 + Math.round((k * 44) / 16);
    for (let j = haut; j <= bas; j++) {
      const rel = (j - haut) / (bas - haut);
      const bande = Math.floor(rel * 4);
      const dansBande = rel * 4 - bande;
      if (bande === 3 || dansBande > 0.72) continue;
      T.poser(x, j, dansBande < 0.1 ? BOIS.clair : dansBande > 0.62 ? BOIS.creux : alea(x >> 1, j) < 0.2 ? BOIS.sombre : melanger(BOIS.fond, OMBRE, 0.15));
    }
  }
  poteau(T, 201, 124, 6, 71);
  T.rect(200, 122, 8, 3, (_i, j) => (j === 122 ? BOIS.clair : BOIS.sombre));

  // Ce qui pend aux poutres : des bottes d'herbes, une tresse d'oignons ; le nid d'hirondelle.
  for (const [hx, long, vert] of [[130, 13, true], [137, 10, true], [143, 16, false], [288, 12, true], [352, 11, true]] as const) {
    T.rect(hx, ETA.toit + 4, 1, 4, BOIS.cordeSombre);
    for (let j = 0; j < long; j++) {
      const demi = vert ? Math.min(3, 1 + Math.floor(j / 3)) : j % 4 < 3 ? 2 : 1;
      for (let i = -demi; i <= demi; i++) {
        const a = alea(hx + i, j + 70);
        T.poser(hx + i, ETA.toit + 8 + j, vert ? (a < 0.3 ? "#5c7a3c" : a < 0.6 ? "#7a8c48" : "#8a7a3c") : j % 4 === 3 ? "#8a6a3c" : i < 0 ? "#e2b06a" : "#c98a48");
      }
    }
  }
  T.disque(238, ETA.toit + 6, 5, (dx, dy) => (dy < -1 ? null : alea(dx + 9, dy + 9) < 0.3 ? "#5a4a3a" : "#7a6650"));
  T.rect(236, ETA.toit + 3, 5, 2, "#2a2018");
  T.poser(237, ETA.toit + 3, "#e2a03c");
  T.poser(239, ETA.toit + 3, "#e2a03c");

  // La lanterne, pendue à la sablière ; puis la lumière des deux fenêtres.
  const lampe = lanterne(T, l, 205, ETA.toit + 4, 14);
  eclairer(
    T,
    l,
    [{ ...lampe, rayon: 210 }],
    fenetres.map((f) => ({ x: f.x + 3, y: f.y + 24, large: 23, pente: 0.78, evase: 30, long: 112, force: 1 })),
  );
  return T.decor();
}

/* ---------- La grande tour du clan ---------- */

const TOUR = { l: 360, h: 270, cx: 180, r: 140, oeil: 150, courbe: 0.25, hourd: 52, haut: 62, sol: 238, mur: 22, flanc: 18 } as const;
const TOUR_IMAGES = 2;
/** « GAL » en lettres de cinq cases sur sept, comme sur la bannière du dehors (`batiments/lot-c.ts`). */
const LETTRES_DU_CLAN = [".###...###..#....", "#...#.#...#.#....", "#.....#...#.#....", "#.###.#####.#....", "#...#.#...#.#....", "#...#.#...#.#....", ".###..#...#.#####"] as const;
const OR = "#e2b23c";
const OR_SOMBRE = "#b8882a";

/** Un bouclier rond du clan, écartelé de deux couleurs, avec son umbo de fer. */
function bouclier(T: Toile, cx: number, cy: number, r: number, a: string, b: string): void {
  T.disque(cx, cy, r, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > (r - 1) * (r - 1)) return dx + dy < 0 ? BOIS.clair : BOIS.creux;
    if (d <= 5) return dx + dy < 0 ? FER_CLAIR : FER;
    const couleur = dx * dy >= 0 ? a : b;
    return dx + dy > r * 0.6 ? melanger(couleur, OMBRE, 0.2) : couleur;
  });
}

function dessinerTour(l: Lumiere, image: number): Decor {
  const T = new Toile(TOUR.l, TOUR.h);
  const p = paletteDuDehors(l);
  const ciel = cielDe(l);
  const dehors = (couleur: string): string => couleurDuDehors(couleur, melanger(couleur, "#141c34", 0.4), l);
  const { cx, r: R } = TOUR;
  const g = cx - R;
  const d = cx + R;
  const s = (x: number): number => Math.sqrt(Math.max(0, 1 - ((x - cx) / R) ** 2));
  const y = (v: number, x: number): number => rangeeDuRond(v, s(x), TOUR.oeil, TOUR.courbe);
  /** Un point de la salle : à l'angle `t` autour de l'axe, à `rayon` cases de lui, à la hauteur `v`. */
  const point = (t: number, rayon: number, v: number): readonly [number, number] => [Math.round(cx + rayon * Math.sin(t)), Math.round(rangeeDuRond(v, (rayon / R) * Math.cos(t), TOUR.oeil, TOUR.courbe))];

  // Dehors, de chaque côté du fût : le ciel de l'heure, la forêt au loin, les corbeaux qui portent le hourd.
  for (const x0 of [0, TOUR.l - TOUR.flanc]) {
    for (let j = TOUR.haut; j < TOUR.h; j++) {
      for (let i = x0; i < x0 + TOUR.flanc; i++) {
        const cime = 226 + Math.round(5 * Math.sin(i / 2.3) + 3 * Math.sin(i / 0.9));
        let couleur = ciel(0.35 + (j - TOUR.haut) / 250 + ((i + j) % 2) * 0.04);
        if (l.jour < 0.4 && alea(i, j + 900) < 0.012) couleur = melanger(couleur, "#c0c9e2", 1 - l.jour * 2.5);
        if (j >= cime + 22) couleur = alea(i, j) < 0.3 ? p.foret.presClaire : p.foret.pres;
        else if (j >= cime) couleur = p.foret.loin;
        T.fixer(i, j, couleur);
      }
    }
    for (let k = 0; k < 30; k++) {
      const i = x0 === 0 ? TOUR.flanc - 1 - Math.round(k * 0.55) : x0 + Math.round(k * 0.55);
      for (let e = 0; e < 4; e++) T.fixer(i, TOUR.haut + 30 - k + e, e === 0 ? p.bois.clair : e === 3 ? p.bois.creux : x0 === 0 ? p.bois.autre : p.bois.sombre);
    }
  }

  // Le mur rond de la salle de garde : la pierre du fût, en lits inégaux ; deux meurtrières dans leur ébrasement.
  const fentes = [-0.56, 0.56] as const;
  for (let i = g; i < d; i++) {
    const u = (i - cx) / R;
    const si = s(i);
    const t = Math.asin(u);
    const arc = t * R;
    const haut = Math.ceil(y(TOUR.haut, i));
    const bas = Math.floor(y(TOUR.sol, i));
    for (let j = haut; j <= bas; j++) {
      const v = hauteurDuRond(j, si, TOUR.oeil, TOUR.courbe);
      const lit = Math.floor((v - TOUR.haut) / 9);
      const large = 15 + Math.floor(alea(lit, 51) * 3) * 4;
      const decale = arc + 500 + Math.floor(alea(lit + 3, 23) * large);
      const joint = (v - TOUR.haut) % 9 >= 7.9 || decale % large < Math.min(2.6, 1 / Math.max(0.3, si));
      const a = alea(Math.floor(decale / large) + 300, lit + 17);
      let couleur: string = joint ? PIERRE_C.joint : a < 0.25 ? PIERRE_C.clair : a < 0.55 ? PIERRE_C.fond : a < 0.82 ? PIERRE_C.autre : PIERRE_C.sombre;
      if (!joint && alea(i, j) < 0.05) couleur = melanger(couleur, PIERRE_C.joint, 0.3);
      if (!joint && v > TOUR.sol - 16 && alea(i >> 1, (j >> 1) + 40) < (v - TOUR.sol + 16) / 40) couleur = melanger(couleur, PIERRE_C.mousse, 0.5);
      let fixe = false;
      for (const f of fentes) {
        const da = (t - f) * R;
        const b = v - 92;
        if (b < -3 || b > 62 || Math.abs(da) > 12) continue;
        const cintre = b < 8 ? Math.sqrt(Math.max(0, 1 - ((8 - b) / 11) ** 2)) : 1;
        if (Math.abs(da) <= 10 * cintre && b <= 58) {
          // L'ébrasement : sombre à gauche, éclairé à droite ; l'appui en pente ; la fente et son ciel au milieu.
          couleur = b > 52 ? "#b9b2a2" : da < -2 ? "#5a544a" : da > 2 ? "#a39c8c" : "#7d766a";
          if (Math.abs(da) <= 2 && b >= 6 && b <= 50) {
            T.fixer(i, j, ciel(0.3 + b / 90));
            fixe = true;
          }
        } else if (Math.abs(da) <= 12 * cintre + 0.5 && b <= 60) couleur = b > 58 ? PIERRE_C.joint : PIERRE_C.clair;
      }
      if (fixe) continue;
      const ombre = 0.48 * Math.abs(u) ** 3 + (u < 0 ? 0.06 : 0) + 0.28 * borner((haut + 10 - j) / 10) + 0.3 * borner((j - bas + 5) / 5);
      T.poser(i, j, melanger(couleur, OMBRE, Math.min(0.75, ombre)));
    }
  }

  // Le plafond : les solives du hourd, qui filent vers le fond ; puis le plancher de la salle, de larges lames.
  for (let i = g; i < d; i++) {
    const bas = Math.ceil(y(TOUR.haut, i)) - 1;
    for (let j = TOUR.haut; j <= bas; j++) {
      const part = (j - TOUR.haut) / (TOUR.oeil - TOUR.haut);
      const devant = cx + (i - cx) / (1 - part);
      const k = ((Math.round(devant) % 26) + 26) % 26;
      const couleur = k < 5 ? (k === 0 ? BOIS.fond : k === 4 ? BOIS.creux : BOIS.sombre) : (Math.floor(part * 60) + Math.floor(devant / 26)) % 9 === 0 ? "#553c28" : alea(Math.floor(devant / 3), j) < 0.2 ? "#6c4e34" : "#7a5a3c";
      T.poser(i, j, melanger(couleur, OMBRE, 0.3 + 0.25 * part));
    }
    const haut = Math.floor(y(TOUR.sol, i)) + 1;
    for (let j = haut; j <= TOUR.sol; j++) {
      const part = (TOUR.sol - j) / (TOUR.sol - TOUR.oeil);
      const devant = cx + (i - cx) / (1 - part);
      const lame = Math.floor(devant / 13);
      const k = ((Math.round(devant) % 13) + 13) % 13;
      let couleur: string = k === 0 ? "#6a4f32" : lame % 3 === 0 ? "#a8865a" : lame % 3 === 1 ? "#9a784c" : "#a07d52";
      if (k !== 0 && (Math.floor(part * 90) + lame * 7) % 23 === 0) couleur = "#7a5c3a";
      else if (k !== 0 && alea(Math.floor(devant / 2), j) < 0.08) couleur = "#8a6a45";
      T.poser(i, j, melanger(couleur, OMBRE, 0.36 * borner((haut + 4 - j) / 4)));
    }
  }
  // Le tapis du clan : bleu nuit, bordé des trois couleurs.
  for (let j = 221; j <= 236; j++) {
    const demi = 74 + Math.round((j - 221) * 0.9);
    for (let i = cx - 34 - demi; i <= cx - 34 + demi; i++) {
      if (j <= Math.floor(y(TOUR.sol, i)) + 1) continue;
      const bord = Math.min(i - (cx - 34 - demi), cx - 34 + demi - i, (j - 221) * 2, (236 - j) * 2 + 1);
      let couleur: string = bord < 2 ? TRICOLORE[2] : bord < 4 ? TRICOLORE[1] : bord < 6 ? TRICOLORE[0] : (i + j * 3) % 14 < 2 && j % 5 === 3 ? "#3a4a8a" : BLEU_NUIT;
      if (bord === 0 && i % 2 === 0) couleur = OR;
      T.poser(i, j, melanger(couleur, OMBRE, 0.08));
    }
  }

  // La tranche des murs du fût, de la salle jusqu'en bas ; sous le plancher, ses solives et l'étage du dessous, dans l'ombre.
  T.rect(g, TOUR.sol + 1, 2 * R, TOUR.h - TOUR.sol - 1, (i, j) => {
    const e = j - TOUR.sol - 1;
    if (e < 2) return e === 0 ? "#b8966a" : "#6a4f32";
    if (e < 11) {
      const k = (i - g) % 26;
      return k < 9 ? (e === 2 || k === 0 ? BOIS.autre : e === 10 || k === 8 ? BOIS.creux : (k + e) % 3 === 0 ? BOIS.sombre : BOIS.fond) : "#241a12";
    }
    const lit = Math.floor((e - 11) / 9);
    const decale = i + lit * 11;
    const couleur = (e - 11) % 9 === 8 || decale % 21 === 0 ? PIERRE_C.joint : alea(Math.floor(decale / 21), lit + 7) < 0.4 ? PIERRE_C.fond : PIERRE_C.sombre;
    return melanger(couleur, OMBRE, 0.34 + 0.015 * e);
  });
  for (const x0 of [g - TOUR.mur, d]) {
    T.rect(x0, TOUR.haut, TOUR.mur, TOUR.h - TOUR.haut, (i, j) => {
      const lit = Math.floor((j - TOUR.haut) / 11);
      const decale = i - x0 + (lit % 2) * 11;
      if ((j - TOUR.haut) % 11 === 10 || decale % 22 === 0) return "#726c60";
      const a = alea(lit + (x0 > cx ? 40 : 0), Math.floor(decale / 22) + 3);
      const couleur = a < 0.35 ? "#c0b9a8" : a < 0.75 ? "#b4ad9c" : "#a7a090";
      return alea(i, j) < 0.06 ? "#a7a090" : couleur;
    });
    T.rect(x0 < cx ? g - 1 : d, TOUR.haut, 1, TOUR.sol - TOUR.haut + 1, "#4a453d");
  }

  // Le hourd, au-dessus : son mur de planches, ses trois baies sur le ciel, les boucliers du clan, ses poteaux.
  T.rect(0, 0, TOUR.l, TOUR.hourd, (i, j) => {
    const k = i % 6;
    const planche = Math.floor(i / 6);
    let couleur: string = k === 5 ? BOIS.sombre : k === 0 ? BOIS.clair : planche % 2 === 0 ? BOIS.fond : BOIS.autre;
    if (k !== 5 && alea(planche, j >> 3) < 0.08) couleur = BOIS.sombre;
    return melanger(couleur, OMBRE, 0.2 + 0.3 * borner((10 - j) / 10) + 0.15 * borner((j - TOUR.hourd + 5) / 5));
  });
  const baies = [100, 180, 260] as const;
  for (const bx of baies) {
    T.rect(bx - 16, 9, 33, 29, (i, j) => (i < bx - 14 || j < 11 ? BOIS.clair : i > bx + 14 || j > 35 ? BOIS.creux : BOIS.fond));
    for (let j = 11; j <= 35; j++) for (let i = bx - 14; i <= bx + 14; i++) T.fixer(i, j, i === bx ? p.bois.sombre : i < bx - 11 || j < 13 ? dehors(BOIS.creux) : ciel(0.25 + (j - 11) / 50));
    T.rect(bx - 18, 38, 37, 3, (_i, j) => (j === 38 ? BOIS.clair : j === 40 ? BOIS.creux : BOIS.autre));
  }
  bouclier(T, 140, 23, 9, TRICOLORE[0], TRICOLORE[1]);
  bouclier(T, 220, 23, 9, TRICOLORE[2], TRICOLORE[1]);
  poutre(T, 0, 0, TOUR.l, 6);
  for (const px of [6, 56, 304, 348]) {
    poteau(T, px, 6, 6, TOUR.hourd - 6);
    for (const sens of [-1, 1]) for (let k = 0; k < 10; k++) T.rect(px + 2 + sens * (4 + k), 6 + 10 - k, 2, 2, BOIS.sombre);
  }
  for (const x0 of [0, TOUR.l - 5]) T.rect(x0, 0, 5, TOUR.hourd, (i, j) => (i === (x0 === 0 ? 4 : x0) ? BOIS.creux : j % 13 === 0 ? BOIS.creux : BOIS.clair));
  // Le plancher du hourd, par la tranche : ses lames, le bout de ses solives.
  T.rect(0, TOUR.hourd, TOUR.l, TOUR.haut - TOUR.hourd, (i, j) => {
    const e = j - TOUR.hourd;
    if (e < 2) return e === 0 ? "#b8966a" : "#6a4f32";
    const k = (i + 4) % 26;
    if (k < 9) return e === 2 || k === 0 ? BOIS.clair : e === 9 || k === 8 ? BOIS.creux : (k + e) % 3 === 0 ? BOIS.sombre : BOIS.autre;
    return e === 9 ? BOIS.creux : alea(i >> 2, j) < 0.2 ? TRONC.sombre : TRONC.fond;
  });
  // Ce qu'on range là-haut : des caisses, un tonnelet, la grande corne d'appel sur son pied, un tabouret.
  T.rect(16, 36, 18, 16, (i, j) => (i === 16 || j === 36 ? BOIS.clair : i === 33 || j === 51 ? BOIS.creux : (i + j) % 9 === 0 ? BOIS.sombre : j % 5 === 0 ? BOIS.sombre : BOIS.autre));
  T.rect(36, 42, 13, 10, (i, j) => (i === 36 || j === 42 ? BOIS.clair : i === 48 || j === 51 ? BOIS.creux : j === 46 ? BOIS.sombre : BOIS.fond));
  T.rect(21, 27, 12, 9, (i, j) => (j === 29 || j === 33 ? FER : i === 21 || i === 32 || j === 35 ? BOIS.creux : (i - 21) % 3 === 2 ? BOIS.sombre : BOIS.clair));
  // La corne : un long cornet clair, cerclé d'or, posé sur une fourche de bois.
  for (let k = 0; k <= 30; k++) {
    const hx = 64 + k;
    const hy = 34 - Math.round(12 * Math.sin((k / 30) * 1.25));
    const epais = 2 + Math.round(k / 6);
    T.rect(hx, hy - epais + 2, 1, epais, (_i, j) => (k === 9 || k === 22 ? (j === hy - epais + 2 ? OR : OR_SOMBRE) : k === 30 ? "#8a7a5c" : j === hy - epais + 2 ? "#f4ecd8" : j === hy + 1 ? "#b8a888" : "#e2d8be"));
  }
  T.rect(74, 36, 2, 16, (i) => (i === 74 ? BOIS.clair : BOIS.sombre));
  T.rect(71, 33, 2, 4, BOIS.sombre);
  T.rect(77, 33, 2, 4, BOIS.sombre);
  T.rect(70, 50, 10, 2, BOIS.creux);
  T.rect(226, 44, 14, 3, (_i, j) => (j === 44 ? BOIS.clair : j === 46 ? BOIS.creux : BOIS.autre));
  T.rect(228, 47, 2, 5, BOIS.sombre);
  T.rect(236, 47, 2, 5, BOIS.sombre);

  // La trappe, en haut de l'escalier : un jour dans le plafond, un garde-corps là-haut.
  for (let j = TOUR.haut; j <= TOUR.haut + 9; j++) for (let i = 276; i <= 316 - (j - TOUR.haut); i++) if (j < y(TOUR.haut, i)) T.poser(i, j, j === TOUR.haut ? "#241a12" : "#3a2a1c");
  T.rect(272, 30, 46, 2, (_i, j) => (j === 30 ? BOIS.clair : BOIS.creux));
  for (const bx of [272, 287, 302, 316]) T.rect(bx, 32, 2, 20, (i) => (i === bx ? BOIS.autre : BOIS.sombre));
  T.rect(272, 41, 46, 1, BOIS.sombre);

  // La bannière du clan, au milieu du mur : bleu nuit, les trois couleurs à la hampe, « GAL » en blanc, une frange d'or.
  const ban = { x: cx - 35, y: 90, l: 71, h: 76 };
  T.rect(ban.x - 7, ban.y - 4, ban.l + 14, 3, (_i, j) => (j === ban.y - 4 ? BOIS.clair : j === ban.y - 2 ? BOIS.creux : BOIS.autre));
  for (const fx of [ban.x - 10, ban.x + ban.l + 7]) T.rect(fx, ban.y - 5, 3, 5, (i, j) => (i === fx && j < ban.y - 1 ? "#f6d878" : j === ban.y - 1 ? OR_SOMBRE : OR));
  for (const fx of [ban.x - 3, ban.x + ban.l + 2]) T.rect(fx, ban.y - 12, 1, 8, FER);
  for (let i = 0; i < ban.l; i++) {
    // Deux pointes en bas ; le tissu fait de longs plis.
    const pointe = ban.h - Math.round(Math.abs(Math.abs(i - 35) - 17.5) * 0.75);
    const pli = 0.1 + 0.1 * Math.sin(i / 3.6 + image * 0.8) + (i > 60 ? 0.08 : 0);
    for (let j = 0; j < pointe; j++) {
      let couleur: string = BLEU_NUIT;
      if (j < 12) couleur = TRICOLORE[Math.floor(j / 4)]!;
      else if (i === 3 || i === ban.l - 4 || j === 15 || (j >= pointe - 5 && j < pointe - 3)) couleur = TRICOLORE[1];
      else if (j >= pointe - 2) couleur = (i + j) % 2 === 0 ? OR : OR_SOMBRE;
      else {
        const lx = Math.floor((i - 10) / 3);
        const ly = Math.floor((j - 27) / 3);
        if (i >= 10 && lx < 17 && j >= 27 && ly < 7 && LETTRES_DU_CLAN[ly]![lx] === "#") couleur = TRICOLORE[1];
      }
      T.poser(ban.x + i, ban.y - 1 + j, melanger(couleur, "#0a1230", Math.max(0, pli)));
    }
  }
  // De part et d'autre : deux boucliers, puis la guirlande de fanions sous le plafond.
  bouclier(T, ban.x - 22, 122, 10, TRICOLORE[0], TRICOLORE[1]);
  bouclier(T, ban.x + ban.l + 21, 122, 10, TRICOLORE[2], TRICOLORE[1]);
  for (let i = g + 4; i < d - 4; i++) {
    const creux = TOUR.haut + 3 + Math.round(9 * Math.sin((Math.PI * ((i - g - 4) % 68)) / 68));
    T.poser(i, creux, BOIS.cordeSombre);
    const k = (i - g - 4) % 9;
    if (k < 7) for (let j = 1; j <= 7 - Math.abs(k - 3) * 2; j++) T.poser(i, creux + j, melanger(TRICOLORE[Math.floor((i - g - 4) / 9) % 3]!, OMBRE, k > 3 ? 0.18 : 0));
  }

  // Le râtelier, à gauche : quatre lances debout entre deux lisses, deux boucliers posés au pied, la corne du guet.
  const rat = { x: 50, l: 44, bas: 231 };
  for (const [k, lx] of [[0, 57], [1, 66], [2, 76], [3, 85]] as const) {
    T.rect(lx, 112 - (k % 2) * 6, 2, rat.bas - 112 + (k % 2) * 6, (i) => (i === lx ? BOIS.clair : BOIS.sombre));
    const haut = 100 - (k % 2) * 6;
    for (let j = 0; j < 12; j++) {
      const demi = j < 8 ? Math.round(j / 3) : 10 - j > 0 ? 1 : 0;
      T.rect(lx - demi, haut + j, demi * 2 + 2, 1, (i) => (i <= lx ? FER_CLAIR : FER));
    }
    T.rect(lx - 1, haut + 12, 4, 2, OR_SOMBRE);
  }
  for (const ry of [150, 204]) T.rect(rat.x, ry, rat.l, 4, (i, j) => (j === ry ? BOIS.clair : j === ry + 3 ? BOIS.creux : (i - rat.x) % 9 === 4 ? BOIS.creux : BOIS.autre));
  for (const rx of [rat.x - 2, rat.x + rat.l - 3]) poteau(T, rx, 142, 5, rat.bas - 141);
  bouclier(T, 64, 220, 12, TRICOLORE[0], TRICOLORE[1]);
  bouclier(T, 84, 222, 11, TRICOLORE[2], TRICOLORE[1]);

  // Le banc sous la bannière : une peau jetée dessus, une cruche, une miche, la chandelle.
  const banc = { x: 160, l: 58, y: 212 };
  for (const bx of [banc.x + 3, banc.x + banc.l - 8]) T.rect(bx, banc.y + 4, 5, 18, (i, j) => (i === bx ? BOIS.clair : i === bx + 4 ? BOIS.creux : j % 7 === 0 ? BOIS.sombre : BOIS.fond));
  T.rect(banc.x + 8, banc.y + 13, banc.l - 16, 2, BOIS.sombre);
  T.rect(banc.x, banc.y, banc.l, 5, (i, j) => (j === banc.y ? BOIS.clair : j === banc.y + 4 ? BOIS.creux : alea(i >> 2, j) < 0.2 ? BOIS.sombre : BOIS.autre));
  for (let i = 0; i < 24; i++) {
    const tombe = 3 + Math.round(5 * Math.abs(Math.sin(i / 3.7))) + (i > 20 ? -2 : 0);
    for (let j = -2; j < tombe; j++) T.poser(banc.x + 30 + i, banc.y + j, j === -2 ? "#e6dcc4" : alea(i, j + 30) < 0.25 ? "#b8a888" : j > tombe - 3 ? "#a8987a" : "#d2c6aa");
  }
  T.motif(banc.x + 5, banc.y - 11, ["..aaa..", "..aba.a", ".aabaaa", "aabcba.", "aabcba.", "aabbba.", ".aaaaa.", ".aabaa.", ".aaaaa.", "..aaa..", ".aaaaa."], { a: "#a8623c", b: "#c47a4c", c: "#e09a68" });
  for (let j = 0; j < 5; j++) T.rect(banc.x + 15 + (j === 0 ? 2 : j === 1 ? 1 : 0), banc.y - 5 + j, 11 - (j === 0 ? 4 : j === 1 ? 2 : 0), 1, (i) => (j === 0 ? "#d8a868" : (i + j) % 4 === 0 ? "#8a5a30" : j === 4 ? "#a8743c" : "#c48a4c"));
  // La chandelle : sa flamme ne s'allume que quand le jour baisse.
  const veille = veilleDe(l);
  T.rect(banc.x + 55, banc.y - 2, 5, 2, FER);
  T.rect(banc.x + 56, banc.y - 9, 3, 7, (i) => (i === banc.x + 56 ? "#f4ecd8" : "#d8ceb4"));
  if (veille > 0.05) {
    T.fixer(banc.x + 57, banc.y - 10, melanger("#3a2a1c", "#f58a1f", veille));
    T.fixer(banc.x + 57, banc.y - 11, melanger("#3a2a1c", FLAMME, veille));
    T.fixer(banc.x + 57, banc.y - 12, melanger(couleurDuDedans(BLEU_NUIT, l), COEUR, veille * 0.8));
  } else T.poser(banc.x + 57, banc.y - 10, "#3a2a1c");

  // L'escalier de pierre, qui suit le mur et monte vers la trappe : ses marches se resserrent en tournant vers nous.
  // Dessous, une niche voûtée ; le long du mur, la main courante de corde dans ses anneaux.
  const MARCHES = 16;
  const piedDeLEscalier = TOUR.sol - 3;
  const montee = (piedDeLEscalier - TOUR.haut) / MARCHES;
  const nez = (k: number): number => Math.round(224 + 96 * (1 - (1 - k / MARCHES) ** 1.3));
  const dessus = (k: number): number => Math.round(piedDeLEscalier - (k + 1) * montee);
  const niche = { x: 281, y: 216, r: 21 };
  for (let k = 0; k < MARCHES; k += 4) {
    const a = { x: Math.min(d - 4, nez(k) + 5), y: dessus(k) - 30 };
    const b = { x: Math.min(d - 4, nez(k + 4) + 5), y: dessus(Math.min(MARCHES - 1, k + 4)) - 30 };
    for (let n = 0; n <= 30; n++) T.poser(Math.round(a.x + ((b.x - a.x) * n) / 30), Math.round(a.y + ((b.y - a.y) * n) / 30 + 4 * Math.sin((Math.PI * n) / 30)), n % 2 === 0 ? BOIS.corde : BOIS.cordeSombre);
    for (const q of [a, b]) T.rect(q.x - 1, q.y - 2, 3, 3, (i, j) => (i === q.x && j === q.y - 1 ? "#3a4050" : FER_CLAIR));
  }
  for (let i = nez(0); i < d; i++) {
    let k = 0;
    while (k < MARCHES - 1 && nez(k + 1) <= i) k++;
    const haut = dessus(k);
    const tourne = (i - nez(0)) / (d - nez(0));
    for (let j = haut; j <= piedDeLEscalier; j++) {
      const e = j - haut;
      const dn = Math.hypot(i - niche.x, j - niche.y);
      const dansLaNiche = Math.abs(i - niche.x) <= niche.r && (j >= niche.y || dn <= niche.r);
      const surLArc = !dansLaNiche && Math.abs(i - niche.x) <= niche.r + 5 && (j >= niche.y || dn <= niche.r + 5);
      const lit = Math.floor(j / 9);
      const decale = i + lit * 7 + Math.floor(alea(lit, 88) * 6);
      const a = alea(Math.floor(decale / 17), lit + 140);
      let couleur: string = j % 9 === 8 || decale % 17 === 0 ? PIERRE_C.joint : a < 0.3 ? PIERRE_C.clair : a < 0.6 ? PIERRE_C.fond : a < 0.85 ? PIERRE_C.autre : PIERRE_C.sombre;
      let ombre = 0.04 + 0.3 * tourne;
      if (dansLaNiche) {
        // Le fond de la niche, dans l'ombre ; son tableau de gauche prend un peu de jour.
        couleur = i - niche.x < -niche.r + 4 ? "#8b8576" : couleur;
        ombre = i - niche.x < -niche.r + 4 ? 0.25 : 0.55 + 0.15 * borner((niche.y + 4 - j) / 20);
      } else if (surLArc) {
        const tour = j >= niche.y ? (j - niche.y) / 8 : (Math.atan2(niche.y - j, i - niche.x) / Math.PI) * 11;
        couleur = tour - Math.floor(tour) < 0.16 ? PIERRE_C.joint : "#bcb5a4";
      } else if (e < 2) couleur = e === 0 ? "#d6cfbe" : "#b4ad9c";
      else if (i === nez(k) && e <= montee + 1) couleur = "#c4bdac";
      else if (e < 5) ombre += 0.12;
      T.poser(i, j, melanger(couleur, OMBRE, Math.min(0.8, ombre)));
    }
  }

  // Sous l'escalier : le coffre ferré du clan, un tonneau.
  const coffre = { x: 262, y: 213, l: 34, h: 21 };
  T.rect(coffre.x, coffre.y, coffre.l, coffre.h, (i, j) => {
    const e = j - coffre.y;
    if (i === coffre.x || i === coffre.x + coffre.l - 1 || e === coffre.h - 1) return BOIS.creux;
    if (e === 7) return BOIS.creux;
    if ((i - coffre.x) % 14 === 3 || (i - coffre.x) % 14 === 4) return (i - coffre.x) % 14 === 3 ? FER_CLAIR : FER;
    if (e < 7) return e === 0 ? BOIS.clair : e < 3 ? BOIS.autre : BOIS.fond;
    return (e - 8) % 6 === 5 ? BOIS.sombre : i < coffre.x + 8 ? BOIS.autre : BOIS.fond;
  });
  T.rect(coffre.x + 15, coffre.y + 6, 5, 6, (i, j) => (i === coffre.x + 17 && j > coffre.y + 8 ? "#3a2a1c" : j === coffre.y + 6 ? "#f6d878" : OR));

  // La lanterne, pendue au plafond ; puis la lumière : les deux meurtrières, les baies du hourd.
  const lampe = lanterne(T, l, 128, TOUR.haut + 6, 26);
  const rayons: Rayon[] = baies.map((bx) => ({ x: bx - 10, y: 36, large: 24, pente: 0.7, evase: 6, long: 16, force: 0.8 }));
  for (const f of fentes) {
    const [fx, fy] = point(f, R, 100);
    rayons.push({ x: fx - 2, y: fy, large: 5, pente: 0.62, evase: 30, long: 132, force: 1 });
  }
  eclairer(T, l, [{ ...lampe, rayon: 185 }, { x: banc.x + 57, y: banc.y - 10, rayon: 46 }], rayons);
  return T.decor();
}

/* ---------- Le lot ---------- */

const imageDe = (n: number, images: number): number => ((Math.floor(n) % images) + images) % images;

/**
 * Garde les derniers dessins : l'écran redemande la même image à la même lumière à chaque tour du mouvement lent. La
 * lumière est arrondie au deux-centième, un pas trop petit pour se voir : même lumière et même image, même dessin.
 */
function retenir(images: number, dessiner: (l: Lumiere, image: number) => Decor): (l: Lumiere, n: number) => Decor {
  const gardes = new Map<string, Decor>();
  return (l, n) => {
    const image = imageDe(n, images);
    const lumiere: Lumiere = { ...l, jour: Math.round(l.jour * 200) / 200, rougeur: Math.round(l.rougeur * 200) / 200 };
    const cle = `${image}:${lumiere.jour}:${lumiere.rougeur}`;
    let decor = gardes.get(cle);
    if (!decor) {
      decor = dessiner(lumiere, image);
      if (gardes.size >= 8) gardes.delete(gardes.keys().next().value!);
      gardes.set(cle, decor);
    }
    return { largeur: decor.largeur, hauteur: decor.hauteur, cases: decor.cases.slice() };
  };
}

export const INTERIEURS_LOT_2: Readonly<Partial<Record<InterieurId, DessinDInterieur>>> = {
  colombier: {
    id: "colombier",
    titre: "Dans le colombier",
    largeur: COL.l,
    hauteur: COL.h,
    images: COL_IMAGES,
    place: { x: 104, pied: 242 },
    dessiner: retenir(COL_IMAGES, dessinerColombier),
  },
  etable: {
    id: "etable",
    titre: "Dans l’étable",
    largeur: ETA.l,
    hauteur: ETA.h,
    images: ETA_IMAGES,
    place: { x: 170, pied: 190 },
    dessiner: retenir(ETA_IMAGES, dessinerEtable),
  },
  "grande-tour": {
    id: "grande-tour",
    titre: "Dans la grande tour",
    largeur: TOUR.l,
    hauteur: TOUR.h,
    images: TOUR_IMAGES,
    place: { x: 132, pied: 234 },
    dessiner: retenir(TOUR_IMAGES, dessinerTour),
  },
};
