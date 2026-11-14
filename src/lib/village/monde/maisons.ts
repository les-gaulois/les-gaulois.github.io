/**
 * Les maisons du monde du village, dessinées case par case à la taille des Gaulois (48 × 64). Quatre modèles où l'on
 * dort, quatre lits chacun, et deux petites dépendances fermées :
 * - la grande hutte ronde, sous sa meule de chaume, la soupente ouverte dans le toit ;
 * - la longère basse, deux travées ouvertes de part et d'autre de sa porte, la cheminée de pierre sur le faîte ;
 * - la maison à colombages, le rez-de-chaussée de pierre sous une arche, l'étage en encorbellement, le toit de bardeaux ;
 * - la chaumière, son toit qui se soulève au-dessus de la soupente, et son appentis fermé où sèche le bois ;
 * - le grenier sur pilotis et la petite hutte, fermés, pour les places où personne ne dort.
 *
 * L'intérieur n'est ouvert que là où il sert, pour voir les dormeurs, et l'ouverture suit la charpente : une arche, des
 * aisseliers, la pente du toit. Chaque maison se dessine dans son propre cadre puis se pose, à l'endroit ou retournée ;
 * la lumière vient toujours de la gauche. Les teintes du chaume et du torchis changent d'une maison à l'autre.
 * Rien n'est tiré au hasard : `alea(x, y)` donne un grain qui ne bouge pas. Aucun dessin ne rappelle une œuvre existante.
 * Design : Claude Fable 5.2.
 */
import { type Palette, Planche, alea } from "../decor";
import { type Lumiere, cielDuVillage, couleurDuDedans, couleurDuDehors, melanger } from "../lumiere";
import { poserCheminee, poserLitVide } from "./pieces";
import { LIT_HAUTEUR, LIT_LARGEUR } from "./poses-monde";

type Teinte = (couleur: string) => string;

/** Les modèles où l'on dort. */
export type ModeleId = "ronde" | "longere" | "colombages" | "chaumiere";
/** Les dépendances fermées. */
export type DependanceId = "grenier" | "hutte";

export interface ModeleDeMaison {
  id: ModeleId;
  largeur: number;
  hauteur: number;
  /** Le coin en haut à gauche de chaque lit : `x` depuis le bord gauche de la maison, `y` au-dessus de son pied. */
  lits: readonly { x: number; y: number }[];
  /** D'où sort la fumée, dans le même repère. */
  fumee: { x: number; y: number };
}

/** Le plancher des lits du rez-de-chaussée : quatre rangées au-dessus du pied, comme dans les salles. */
const SEUIL = 4;
const AU_SOL = SEUIL + LIT_HAUTEUR;

export const MODELES: Readonly<Record<ModeleId, ModeleDeMaison>> = {
  ronde: { id: "ronde", largeur: 280, hauteur: 206, lits: [{ x: 60, y: AU_SOL }, { x: 148, y: AU_SOL }, { x: 62, y: 110 }, { x: 146, y: 110 }], fumee: { x: 140, y: 204 } },
  longere: { id: "longere", largeur: 388, hauteur: 132, lits: [{ x: 15, y: AU_SOL }, { x: 93, y: AU_SOL }, { x: 223, y: AU_SOL }, { x: 301, y: AU_SOL }], fumee: { x: 283, y: 132 } },
  colombages: { id: "colombages", largeur: 244, hauteur: 210, lits: [{ x: 37, y: AU_SOL }, { x: 121, y: AU_SOL }, { x: 38, y: 110 }, { x: 116, y: 110 }], fumee: { x: 224, y: 196 } },
  chaumiere: { id: "chaumiere", largeur: 262, hauteur: 190, lits: [{ x: 18, y: AU_SOL }, { x: 96, y: AU_SOL }, { x: 18, y: 106 }, { x: 96, y: 106 }], fumee: { x: 127, y: 190 } },
};

/** L'ordre des modèles le long d'une rue : jamais deux voisines pareilles, et la suite ne se répète qu'au bout de huit. */
const SUITE: readonly ModeleId[] = ["chaumiere", "ronde", "colombages", "longere", "ronde", "chaumiere", "longere", "colombages"];
export const modeleDeLaPlace = (place: number): ModeleDeMaison => MODELES[SUITE[((place % SUITE.length) + SUITE.length) % SUITE.length]!];

/** Une maison sur deux est retournée, sur un rythme qui ne suit pas celui des modèles. */
export const maisonRetournee = (variante: number): boolean => alea(variante, 911) < 0.5;

/** Les lits d'une maison posée, retournée ou non, dans le repère de son bord gauche et de son pied. */
export function litsDeLaMaison(modele: ModeleDeMaison, variante: number): { x: number; y: number }[] {
  const envers = maisonRetournee(variante);
  return modele.lits.map((lit) => ({ x: envers ? modele.largeur - lit.x - LIT_LARGEUR : lit.x, y: lit.y }));
}

/** D'où sort la fumée d'une maison posée. */
export function fumeeDeLaMaison(modele: ModeleDeMaison, variante: number): { x: number; y: number } {
  return { x: maisonRetournee(variante) ? modele.largeur - 1 - modele.fumee.x : modele.fumee.x, y: modele.fumee.y };
}

/* ---------- Le chantier : ce qu'il faut pour dessiner une maison dans son cadre ---------- */

interface Chantier {
  pl: Planche;
  p: Palette;
  l: Lumiere;
  /** La couleur d'un intérieur, éclairé par sa lanterne. */
  t: Teinte;
  /** La maison sera retournée : on éclaire donc sa droite. */
  envers: boolean;
  variante: number;
  /** La rangée du pied. */
  g: number;
}

/** Les teintes du chaume (blond, vieux gris, roux) et du torchis (ocre, chaulé, rosé), d'une maison à l'autre. */
const CHAUMES: readonly (readonly [string, number])[] = [
  ["#d9b04e", 0],
  ["#8d8a72", 0.34],
  ["#b06a34", 0.24],
  ["#c9c08a", 0.26],
];
const TORCHIS: readonly (readonly [string, number])[] = [
  ["#d8b47a", 0],
  ["#efe6d2", 0.42],
  ["#c98f6a", 0.3],
  ["#b9a37c", 0.3],
];

function nuancer<T extends Record<string, string>>(tons: T, vers: string, part: number, l: Lumiere): T {
  if (part === 0) return tons;
  const cible = couleurDuDehors(vers, melanger(vers, "#141a34", 0.55), l);
  return Object.fromEntries(Object.entries(tons).map(([nom, couleur]) => [nom, melanger(couleur, cible, part)])) as T;
}

function paletteDeLaMaison(p: Palette, l: Lumiere, variante: number): Palette {
  const chaume = CHAUMES[Math.floor(alea(variante, 31) * CHAUMES.length)]!;
  const mur = TORCHIS[Math.floor(alea(variante, 57) * TORCHIS.length)]!;
  return { ...p, chaume: nuancer(p.chaume, chaume[0], chaume[1], l), mur: nuancer(p.mur, mur[0], mur[1], l) };
}

/** Le côté d'une case, de 0 (vers la lumière) à 1 (dans l'ombre). */
const cote = (c: Chantier, u: number): number => (c.envers ? 1 - u : u);

/* ---------- Les matières ---------- */

interface Toit {
  haut: number;
  bas: number;
  /** Les deux bords du toit à chaque rangée. */
  bords: (y: number) => readonly [number, number];
  /** La première rangée du toit à cette colonne (un faîte qui fléchit), et la dernière (un avant-toit qui ondule). */
  hautDe?: (x: number) => number;
  basDe?: (x: number) => number;
  /** Des bardeaux de bois au lieu du chaume. */
  bardeaux?: boolean;
  /** De la mousse vers le bas du toit. */
  mousse?: boolean;
}

/** Un toit de chaume (ou de bardeaux) : des rangs en écailles, la lumière d'un côté, un bord sombre, une frange inégale. */
function toit(c: Chantier, o: Toit): void {
  const { pl, p } = c;
  const tons = o.bardeaux ? { fond: p.bois.fond, clair: p.bois.clair, sombre: p.bois.sombre, brin: p.bois.autre, rang: p.bois.creux, bord: p.bois.creux } : p.chaume;
  const pas = o.bardeaux ? 6 : 7;
  let fin = o.bas;
  if (o.basDe) {
    const [x0, x1] = o.bords(o.bas);
    for (let x = x0; x <= x1; x++) fin = Math.max(fin, o.basDe(x));
  }
  const mousse = melanger(p.chaume.sombre, p.feuilles.sombre, 0.6);
  for (let y = o.haut; y <= fin; y++) {
    const [x0, x1] = o.bords(Math.min(y, o.bas));
    for (let x = x0; x <= x1; x++) {
      const debut = o.hautDe ? o.hautDe(x) : o.haut;
      const bout = o.basDe ? o.basDe(x) : o.bas;
      if (y < debut || y > bout) continue;
      const u = cote(c, (x - x0) / Math.max(1, x1 - x0));
      let couleur: string = u < 0.34 ? tons.clair : u > 0.68 ? tons.sombre : tons.fond;
      const rang = y - debut + (o.bardeaux ? 0 : ((x + 2) >> 2) & 1);
      if (rang % pas === pas - 1) couleur = tons.rang;
      else if (o.bardeaux ? (x + Math.floor((y - debut) / pas) * 4) % 8 === 0 : alea(x, y) < 0.14) couleur = o.bardeaux ? tons.sombre : tons.brin;
      else if (o.mousse && alea(x >> 2, y >> 1) < ((y - o.haut) / Math.max(1, o.bas - o.haut)) * 0.34 - 0.17) couleur = mousse;
      if (x - x0 < 2 || x1 - x < 2 || y >= bout - 1 || y === debut) couleur = tons.bord;
      pl.poser(x, y, couleur);
    }
  }
  // La frange : des brins qui dépassent sous l'avant-toit, jamais deux pareils.
  const [x0, x1] = o.bords(o.bas);
  for (let x = x0 + 1; x < x1; x++) {
    const bout = o.basDe ? o.basDe(x) : o.bas;
    const brin = alea(x, bout + 3);
    const long = o.bardeaux ? (x % 8 < 6 ? 1 : 0) : brin < 0.3 ? 2 : brin < 0.72 ? 1 : 0;
    for (let k = 1; k <= long; k++) pl.poser(x, bout + k, k === 2 ? tons.rang : tons.bord);
  }
}

/** Un mur de torchis, avec ses défauts : la trame qui affleure, l'ombre de l'avant-toit, l'humidité qui monte du sol. */
function torchis(c: Chantier, x: number, y: number, largeur: number, hauteur: number, rond = false): void {
  const { pl, p } = c;
  pl.rect(x, y, largeur, hauteur, (i, j) => {
    const g = alea(i >> 1, j >> 1);
    let couleur: string = g < 0.08 ? p.mur.trame : g > 0.95 ? p.mur.clair : p.mur.fond;
    if (rond) {
      const u = cote(c, (i - x) / Math.max(1, largeur - 1));
      if (u < 0.1) couleur = p.mur.clair;
      else if (u > 0.9) couleur = p.mur.ombre;
      else if (u > 0.78) couleur = p.mur.sombre;
    }
    if (j < y + 3) couleur = p.mur.ombre;
    else if (j < y + 6 && (i + j) % 2 === 0) couleur = p.mur.sombre;
    const pied = y + hauteur - 1 - j;
    if (pied < 9 && alea(i >> 2, j) < (9 - pied) / 12) couleur = p.mur.sombre;
    return couleur;
  });
}

/** Une fissure qui descend dans le torchis, et, plus bas, une plaque tombée où paraît le clayonnage. */
function defauts(c: Chantier, x: number, y: number, hauteur: number): void {
  const { pl, p } = c;
  let i = x;
  for (let j = y; j < y + Math.min(hauteur, 22); j++) {
    if (alea(i, j) < 0.4) i += alea(j, i) < 0.5 ? 1 : -1;
    pl.poser(i, j, p.mur.ombre);
  }
  const bas = y + hauteur - 12;
  if (hauteur < 34) return;
  for (let j = 0; j < 7; j++) {
    const large = [3, 6, 7, 8, 7, 5, 3][j]!;
    for (let k = 0; k < large; k++) pl.poser(x + 4 - (large >> 1) + k, bas + j, k === 0 || k === large - 1 || j === 0 ? p.mur.ombre : j % 2 === 0 ? p.bois.sombre : p.bois.fond);
  }
}

/** Un soubassement de pierres sèches : des lits inégaux, des pierres de trois gris, et un dessus en dents si l'on veut. */
function pierres(c: Chantier, x: number, y: number, largeur: number, hauteur: number, dents = false): void {
  const { pl, l } = c;
  const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const joint = k("#5c564c", "#2c2a30");
  const dessus = k("#b3aa9a", "#5e5c66");
  for (let lit = 0; lit * 5 < hauteur; lit++) {
    let i = x - Math.floor(alea(lit, y + x) * 8);
    while (i < x + largeur) {
      const large = 7 + Math.floor(alea(i, lit + y) * 7);
      const ton = alea(i + 3, lit + y);
      const fond = ton < 0.3 ? k("#8a8274", "#474550") : ton < 0.62 ? k("#9a917f", "#504e58") : k("#7a7468", "#403e48");
      const absente = dents && lit === 0 && alea(i, y) < 0.34;
      for (let dx = 0; dx < large && !absente; dx++) {
        for (let dy = 0; dy < 5; dy++) {
          const px = i + dx;
          const py = y + lit * 5 + dy;
          if (px < x || px >= x + largeur || py >= y + hauteur) continue;
          const u = cote(c, (px - x) / Math.max(1, largeur - 1));
          let couleur = dx === large - 1 || dy === 4 ? joint : dy === 0 ? dessus : fond;
          if (u > 0.86 && couleur === fond) couleur = melanger(fond, joint, 0.5);
          pl.poser(px, py, couleur);
        }
      }
      i += large;
    }
  }
}

/** Une poutre debout, une poutre couchée, une pièce de bois en biais. */
function poteau(c: Chantier, x: number, y: number, epaisseur: number, hauteur: number): void {
  const { pl, p } = c;
  pl.rect(x, y, epaisseur, hauteur, (i, j) => {
    const u = cote(c, (i - x) / Math.max(1, epaisseur - 1));
    if (u === 0) return p.bois.clair;
    if (u === 1) return p.bois.creux;
    return (j - y) % 23 === 11 || alea(i, j >> 2) < 0.08 ? p.bois.sombre : p.bois.fond;
  });
}
function poutre(c: Chantier, x: number, y: number, largeur: number, epaisseur: number): void {
  const { pl, p } = c;
  pl.rect(x, y, largeur, epaisseur, (i, j) => (j === y ? p.bois.clair : j === y + epaisseur - 1 ? p.bois.creux : (i - x) % 29 === 13 ? p.bois.sombre : p.bois.fond));
}
function biais(c: Chantier, x0: number, y0: number, x1: number, y1: number, epaisseur: number): void {
  const { pl, p } = c;
  const pas = Math.abs(x1 - x0);
  for (let k = 0; k <= pas; k++) {
    const x = x0 + Math.sign(x1 - x0) * k;
    const y = Math.round(y0 + ((y1 - y0) * k) / Math.max(1, pas));
    pl.rect(x, y, 1, epaisseur, (_i, j) => (j === y ? p.bois.clair : j === y + epaisseur - 1 ? p.bois.creux : p.bois.sombre));
  }
}

/** Une porte de planches, ses deux pentures de fer et son anneau. */
function porte(c: Chantier, x: number, y: number, largeur: number, hauteur: number): void {
  const { pl, p, l } = c;
  const fer = couleurDuDehors("#5c6474", "#30343f", l);
  pl.rect(x - 2, y - 2, largeur + 4, hauteur + 2, p.bois.creux);
  pl.rect(x, y, largeur, hauteur, (i, j) => ((i - x) % 6 === 5 ? p.bois.creux : alea(i, j >> 3) < 0.1 ? p.bois.autre : cote(c, (i - x) / largeur) < 0.5 ? p.bois.fond : p.bois.sombre));
  pl.rect(x, y + 7, largeur - 6, 2, fer);
  pl.rect(x, y + hauteur - 11, largeur - 6, 2, fer);
  pl.rect(x + largeur - 6, y + (hauteur >> 1), 2, 3, fer);
}

/** Une petite fenêtre : le ciel de l'heure le jour, la lueur du dedans la nuit, un volet ouvert. */
function fenetre(c: Chantier, x: number, y: number, largeur = 14, hauteur = 14): void {
  const { pl, p, l } = c;
  const ciel = cielDuVillage(l);
  const vitre = melanger(melanger(ciel[3]!, "#20283c", 0.5), "#f5b04a", 0.75 * (1 - l.jour));
  pl.rect(x - 2, y - 2, largeur + 4, hauteur + 4, p.bois.creux);
  pl.rect(x, y, largeur, hauteur, (_i, j) => (j < y + 3 ? melanger(vitre, "#1a1410", 0.3) : vitre));
  pl.rect(x + (largeur >> 1) - 1, y, 2, hauteur, p.bois.sombre);
  pl.rect(x, y + (hauteur >> 1) - 1, largeur, 1, p.bois.sombre);
  pl.rect(x - 3, y + hauteur + 2, largeur + 6, 2, p.bois.clair);
  const volet = c.envers ? x - 9 : x + largeur + 3;
  pl.rect(volet, y - 1, 6, hauteur + 2, (i, j) => ((j - y) % 5 === 3 ? p.bois.creux : i === volet ? p.bois.clair : p.bois.fond));
}

/** Un tas de bûches rangées, vues par le bout. */
function tasDeBois(c: Chantier, x: number, bas: number, largeur: number, rangs: number): void {
  const { pl, p } = c;
  for (let r = 0; r < rangs; r++) {
    const retrait = r * 3;
    for (let k = 0; k * 7 + retrait * 2 + 7 <= largeur; k++) {
      const bx = x + retrait + k * 7 + (r % 2) * 3;
      const by = bas - 6 - r * 6;
      pl.disque(bx + 3, by + 3, 3, (dx, dy) => (dx * dx + dy * dy > 8 ? p.bois.creux : dx === 0 && dy === 0 ? p.bois.sombre : alea(bx, r) < 0.4 ? p.bois.corde : p.bois.clair));
    }
  }
}

/** Une jarre de terre cuite posée au pied d'un mur. */
function jarre(c: Chantier, x: number, bas: number): void {
  const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, c.l);
  c.pl.lettres(x, bas - 12, ["..aaaa..", "...bb...", "..bccb..", ".bcccbb.", "abccbbba", "abccbbba", "abcbbbba", "abbbbbba", ".abbbba.", ".abbbba.", "..abba..", "..aaaa.."], { a: k("#5a2f18", "#2e1a12"), b: k("#b0683c", "#5e3a26"), c: k("#d08a5a", "#74503a") });
}

/** Un bouclier rond pendu au mur, aux couleurs du clan. */
function bouclier(c: Chantier, cx: number, cy: number, dedans: boolean): void {
  const { pl, l } = c;
  const k = (couleur: string) => (dedans ? c.t(couleur) : couleurDuDehors(couleur, melanger(couleur, "#141a34", 0.55), l));
  const tons = ["#2456b8", "#e8e6e0", "#c8283a"] as const;
  pl.disque(cx, cy, 6, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > 30) return k("#3d2616");
    if (d <= 2) return k("#8d95a6");
    return k(dx * dy >= 0 ? tons[c.variante % 3]! : tons[1]);
  });
}

/* ---------- Les intérieurs ---------- */

/**
 * Le dedans d'une pièce ouverte, de la colonne `x0` à `x1` et de la rangée `haut` à `bas`, là où `dans` le veut : le mur
 * du fond en clayonnage, l'ombre du plafond, les deux côtés qui fuient, et neuf rangées de sol sur le devant.
 */
function dedans(c: Chantier, x0: number, x1: number, haut: number, bas: number, dans: (x: number, y: number) => boolean, sol: "terre" | "lames"): void {
  const { pl, t } = c;
  const fond = bas - 9;
  for (let y = haut; y <= bas; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!dans(x, y)) continue;
      const bord = Math.min(x - x0, x1 - x);
      const fuite = y <= fond ? 8 : Math.round(8 * (1 - (y - fond) / 9));
      let couleur: string;
      if (bord < fuite) couleur = melanger((y - haut) % 3 === 2 ? "#7c6040" : "#94744c", "#1a1410", x - x0 < fuite ? 0.24 : 0.36);
      else if (y > fond) {
        const part = (y - fond) / 9;
        const g = alea(x, y + 200);
        if (sol === "terre") couleur = g < 0.03 ? "#b89c5f" : g < 0.08 ? "#5f4a32" : part > 0.6 ? "#775f41" : "#6b5439";
        else couleur = (x + Math.floor(part * 3) * 11) % 23 === 0 ? "#6a4f32" : part > 0.55 ? "#a07e50" : "#94744a";
      } else {
        couleur = (y - haut) % 3 === 2 ? "#7c6040" : alea(x, y) < 0.06 ? "#8a6c47" : "#94744c";
        if (!dans(x, y - 6)) couleur = melanger(couleur, "#1a1410", dans(x, y - 3) ? 0.16 : 0.3);
        if (y === fond) couleur = "#2a1a10";
      }
      pl.poser(x, y, t(couleur));
    }
  }
}

/** Une lanterne pendue dans une pièce : sa lueur s'élargit la nuit. */
function lanterne(c: Chantier, x: number, y: number): void {
  const { pl, t, l } = c;
  const force = 0.2 + 0.28 * (1 - l.jour);
  pl.disque(x, y + 8, 20, (dx, dy) => {
    const fond = pl.lire(x + dx, y + 8 + dy);
    const d = (dx * dx) / 2.4 + dy * dy;
    if (!fond || d > 150 || (d > 60 && (dx + dy) % 2 !== 0)) return null;
    return melanger(fond, "#f5a83a", force * (d > 60 ? 0.5 : 1));
  });
  pl.rect(x, y, 1, 5, t("#3d2616"));
  pl.rect(x - 2, y + 5, 5, 1, t("#3d2616"));
  pl.rect(x - 1, y + 6, 3, 4, "#ffd75a");
  pl.poser(x, y + 7, "#fff1a8");
  pl.rect(x - 2, y + 10, 5, 1, t("#3d2616"));
}

/** Des bouquets d'herbes pendus à sécher sous une poutre. */
function herbes(c: Chantier, x: number, y: number, nombre: number): void {
  const { pl, t } = c;
  for (let n = 0; n < nombre; n++) {
    const hx = x + n * 8;
    const verte = (n + c.variante) % 2 === 0;
    pl.rect(hx, y, 1, 4, t("#8a7a55"));
    pl.rect(hx - 1, y + 4, 3, 7, (i, j) => t((i + j) % 2 === 0 ? (verte ? "#6f9d56" : "#c9a23a") : verte ? "#4f7d3a" : "#9c7a1f"));
  }
}

/** Le plancher d'une soupente vu par la tranche. */
function tranche(c: Chantier, x: number, y: number, largeur: number): void {
  c.pl.rect(x, y, largeur, 4, (i, j) => c.t(j === y ? "#b07a44" : j === y + 3 ? "#3d2616" : (i - x) % 19 === 7 ? "#523419" : "#7a5230"));
}

/** Le seuil : une rangée de pierres plates ou de planches sous l'ouverture. */
function seuil(c: Chantier, x: number, largeur: number, pierre: boolean): void {
  const { pl, g, l, t } = c;
  if (pierre) {
    const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
    pl.rect(x, g - SEUIL + 1, largeur, SEUIL, (i, j) => (j === g - SEUIL + 1 ? k("#b3aa9a", "#5e5c66") : (i - x) % 17 === 16 || j === g ? k("#5c564c", "#2c2a30") : k("#8a8274", "#474550")));
  } else pl.rect(x, g - SEUIL + 1, largeur, SEUIL, (i, j) => t(j === g - SEUIL + 1 ? "#b98a52" : j === g ? "#3d2616" : (i - x) % 17 === 0 ? "#6a4424" : "#8a6238"));
}

/* ---------- La grande hutte ronde ---------- */

function hutteRonde(c: Chantier): void {
  const { pl, p, g } = c;
  const cx = 140;
  const faite = 12;
  const avantToit = g - 64;
  const demi = (y: number): number => (y >= avantToit ? 134 : Math.round(6 + 128 * Math.pow((y - faite) / (avantToit - faite), 0.72)));
  const bas = (x: number): number => avantToit + Math.round(9 * (1 - ((x - cx) / 134) ** 2));
  // Le dedans du rez-de-chaussée : une large baie dont le haut s'arrondit vers les côtés.
  const baie = (x: number, y: number): boolean => {
    const dx = Math.abs(x - cx);
    if (dx > 90 || y > g - SEUIL || y < avantToit) return false;
    return dx <= 60 || y >= avantToit + 2 + Math.round(16 * ((dx - 60) / 30) ** 2);
  };
  // Le mur rond, son soubassement, puis la baie qu'on y ouvre.
  torchis(c, 22, avantToit - 2, 236, g - avantToit + 3, true);
  pierres(c, 20, g - 11, 240, 12, true);
  defauts(c, 34, avantToit + 12, 44);
  defauts(c, 240, avantToit + 16, 30);
  dedans(c, cx - 90, cx + 90, avantToit, g - SEUIL, baie, "terre");
  seuil(c, cx - 92, 185, true);
  // Les deux poteaux de la baie, courbés par l'arrondi : un linteau cintré les relie.
  poteau(c, cx - 96, avantToit + 14, 6, g - avantToit - 13);
  poteau(c, cx + 91, avantToit + 14, 6, g - avantToit - 13);
  for (let x = cx - 92; x <= cx + 92; x++) {
    const dx = Math.abs(x - cx);
    const y = dx <= 60 ? avantToit + 9 : avantToit + 11 + Math.round(16 * ((dx - 60) / 30) ** 2);
    if (dx > 60) pl.rect(x, y - 4, 1, 4, (_i, j) => (j === y - 4 ? p.bois.clair : p.bois.sombre));
  }
  bouclier(c, 46, avantToit + 30, false);
  jarre(c, 238, g - 11);
  // Le toit : une meule de chaume, pleine en haut, qui s'évase et descend bas ; son avant-toit plonge au milieu.
  toit(c, { haut: faite, bas: avantToit, bords: (y) => [cx - demi(y), cx + demi(y)], basDe: bas, mousse: c.variante % 3 === 1 });
  // La soupente, ouverte dans le chaume : la découpe suit la pente du toit, entre deux chevrons.
  const haut = g - 122;
  const plancher = g - 70;
  const coupe = (y: number): number => Math.min(demi(y) - 13, 98);
  const soupente = (x: number, y: number): boolean => y >= haut && y <= plancher - 1 && Math.abs(x - cx) <= coupe(y);
  dedans(c, cx - 98, cx + 98, haut, plancher - 1, soupente, "lames");
  herbes(c, cx - 14, haut + 4, 4);
  for (let y = haut - 2; y <= plancher; y++) {
    const d = coupe(Math.max(y, haut));
    pl.rect(cx - d - 3, y, 3, 1, (i) => (i === cx - d - 3 ? p.bois.clair : p.bois.sombre));
    pl.rect(cx + d + 1, y, 3, 1, (i) => (i === cx + d + 3 ? p.bois.creux : p.bois.sombre));
  }
  poutre(c, cx - coupe(haut) - 3, haut - 3, coupe(haut) * 2 + 7, 3);
  tranche(c, cx - coupe(plancher) - 4, plancher, coupe(plancher) * 2 + 9);
  lanterne(c, cx, haut + 16);
  lanterne(c, cx, bas(cx) + 2);
  // Le faîte : une coiffe de paille liée, et les perches croisées qui la tiennent.
  pl.rect(cx - 8, faite - 2, 17, 9, (i, j) => (j === faite + 5 || j === faite + 6 ? p.bois.corde : (i + j) % 3 === 0 ? p.chaume.bord : p.chaume.rang));
  biais(c, cx - 9, faite + 4, cx + 7, faite - 12, 2);
  biais(c, cx + 9, faite + 4, cx - 7, faite - 12, 2);
}

/* ---------- La longère ---------- */

function longere(c: Chantier): void {
  const { pl, p, g } = c;
  const avantToit = g - 56;
  const faite = 16;
  const flechi = (x: number): number => faite + Math.round(3 * Math.sin((Math.PI * Math.min(287, Math.max(0, x - 50))) / 287));
  const ondule = (x: number): number => avantToit + Math.round(1.6 * Math.sin(x / 19));
  const bords = (y: number): readonly [number, number] => {
    const part = Math.min(1, (y - faite) / (avantToit - faite));
    return [Math.round(50 * (1 - part)), Math.round(337 + 50 * part)];
  };
  // Une travée ouverte : le haut se referme sur deux aisseliers.
  const travee = (de: number) => (x: number, y: number): boolean => {
    if (x < de || x > de + 155 || y < avantToit + 2 || y > g - SEUIL) return false;
    const coin = Math.min(x - de, de + 155 - x);
    return coin + (y - avantToit - 2) >= 16;
  };
  // Les murs : torchis sur un soubassement de pierre, plein aux deux bouts et au milieu.
  torchis(c, 4, avantToit - 2, 380, g - avantToit + 3);
  pierres(c, 2, g - 13, 384, 14, true);
  defauts(c, 190, avantToit + 6, 20);
  for (const de of [12, 220]) {
    dedans(c, de, de + 155, avantToit + 2, g - SEUIL, travee(de), "terre");
    seuil(c, de - 1, 158, false);
    herbes(c, de + 104, avantToit + 5, 3);
    lanterne(c, de + 78, avantToit + 4);
    biais(c, de, avantToit + 17, de + 16, avantToit + 1, 4);
    biais(c, de + 155, avantToit + 17, de + 139, avantToit + 1, 4);
  }
  for (const x of [6, 168, 214, 376]) poteau(c, x, avantToit, 6, g - avantToit + 1);
  poutre(c, 2, avantToit - 2, 384, 4);
  // Le milieu fermé : une porte basse sur sa marche de pierre, une jarre.
  porte(c, 181, g - 49, 26, 46);
  jarre(c, 205, g);
  // Le toit, long et bas, aux deux bouts en croupe : le faîte fléchit, l'avant-toit ondule.
  toit(c, { haut: faite, bas: avantToit, bords, hautDe: flechi, basDe: ondule, mousse: c.variante % 2 === 0 });
  for (let x = 46; x <= 341; x++) {
    const y = flechi(x);
    pl.poser(x, y - 1, (x & 3) === 0 ? p.chaume.bord : p.chaume.rang);
    if ((x & 7) < 3) pl.poser(x, y - 2, p.chaume.bord);
    // Des perches en chevalet tiennent le faîte, de loin en loin.
    if (x % 96 === 50) {
      biais(c, x - 7, y + 7, x + 3, y - 5, 2);
      biais(c, x + 7, y + 7, x - 3, y - 5, 2);
    }
  }
  poserCheminee(pl, c.l, 276, 0, flechi(283) + 16);
}

/* ---------- La maison à colombages ---------- */

function colombages(c: Chantier): void {
  const { pl, p, g, l } = c;
  const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const cx = 115;
  const encorbellement = g - 70;
  const avantToit = g - 130;
  const faite = 10;
  // Le rez-de-chaussée de pierre et son arche.
  const arche = (x: number): number => g - 60 + Math.round(18 * ((x - cx) / 84) ** 2);
  const baie = (x: number, y: number): boolean => Math.abs(x - cx) <= 84 && y <= g - SEUIL && y >= arche(x);
  pierres(c, 16, encorbellement + 6, 198, g - encorbellement - 5);
  dedans(c, cx - 84, cx + 84, g - 60, g - SEUIL, baie, "terre");
  for (let x = cx - 88; x <= cx + 88; x++) {
    const y = arche(Math.max(cx - 84, Math.min(cx + 84, x)));
    const cle = Math.abs(x - cx) < 5;
    pl.rect(x, y - 6 - (cle ? 2 : 0), 1, 6 + (cle ? 2 : 0), (_i, j) => ((x - cx + 400) % 9 === 4 ? k("#5c564c", "#2c2a30") : j === y - 6 - (cle ? 2 : 0) ? k("#c4bbaa", "#666470") : j === y - 1 ? k("#6f685c", "#3a3840") : k("#a39a8a", "#56545e")));
  }
  seuil(c, cx - 86, 173, true);
  lanterne(c, cx, g - 58);
  // La souche de la cheminée, bâtie contre le pignon : plus large au pied, elle dépasse le toit.
  pierres(c, 212, g - 44, 26, 45);
  pierres(c, 216, 24, 18, g - 44 - 24);
  pl.rect(214, 20, 22, 4, (_i, j) => (j === 20 ? k("#b3aa9a", "#5e5c66") : k("#6f685c", "#3a3840")));
  // L'étage en encorbellement : des pans de bois, du torchis entre eux, et la chambre ouverte entre deux poteaux.
  torchis(c, 8, avantToit, 210, encorbellement - avantToit);
  const chambre = (x: number, y: number): boolean => {
    if (x < 35 || x > 191 || y < avantToit + 4 || y > encorbellement - 1) return false;
    return Math.min(x - 35, 191 - x) + (y - avantToit - 4) >= 15;
  };
  dedans(c, 35, 191, avantToit + 4, encorbellement - 1, chambre, "lames");
  herbes(c, 100, avantToit + 7, 4);
  bouclier(c, 150, avantToit + 12, true);
  lanterne(c, cx - 2, avantToit + 5);
  biais(c, 35, avantToit + 18, 50, avantToit + 3, 4);
  biais(c, 191, avantToit + 18, 176, avantToit + 3, 4);
  for (const [de, a] of [
    [8, 34],
    [192, 217],
  ] as const) {
    // Une croix de Saint-André dans chaque pan plein, et une lisse à mi-hauteur.
    biais(c, de + 5, avantToit + 6, a - 5, encorbellement - 30, 3);
    biais(c, a - 5, avantToit + 6, de + 5, encorbellement - 30, 3);
    poutre(c, de, encorbellement - 26, a - de + 1, 3);
    poteau(c, de + Math.floor((a - de) / 2) - 1, encorbellement - 23, 3, 22);
  }
  defauts(c, 20, encorbellement - 21, 14);
  for (const x of [8, 29, 192, 213]) poteau(c, x, avantToit, 6, encorbellement - avantToit);
  poutre(c, 6, avantToit - 1, 214, 5);
  // La sablière de l'encorbellement et le bout de ses solives.
  poutre(c, 6, encorbellement, 214, 6);
  for (let x = 12; x < 214; x += 15) pl.rect(x, encorbellement + 6, 5, 4, (i, j) => (j === encorbellement + 9 || i === x + 4 ? p.bois.creux : p.bois.fond));
  // Le toit de bardeaux, raide, en demi-croupe ; une lucarne y prend le jour.
  const bords = (y: number): readonly [number, number] => {
    const part = Math.min(1, (y - faite) / (avantToit - 2 - faite));
    return [Math.round(62 * (1 - part)), Math.round(166 + 62 * part)];
  };
  toit(c, { haut: faite, bas: avantToit - 2, bords, bardeaux: true });
  pl.rect(58, faite - 2, 113, 2, (x) => ((x & 1) === 0 ? p.bois.clair : p.bois.fond));
  const lx = c.envers ? 128 : 84;
  for (let j = 0; j < 12; j++) pl.rect(lx - 2 - j, 38 + j, 18 + j * 2, 1, (i) => (i === lx - 2 - j || i === lx + 15 + j ? p.bois.creux : j % 6 === 5 ? p.bois.creux : p.bois.fond));
  torchis(c, lx - 6, 50, 26, 16);
  fenetre(c, lx, 52, 14, 10);
  // La cheminée repasse devant l'avant-toit.
  pierres(c, 216, 24, 18, avantToit - 20);
}

/* ---------- La chaumière et son appentis ---------- */

function chaumiere(c: Chantier): void {
  const { pl, p, g } = c;
  const avantToit = g - 100;
  const faite = 8;
  const plancher = g - 66;
  // L'avant-toit se soulève en sourcil au-dessus de la soupente.
  const sourcil = (x: number): number => avantToit - Math.round(13 * Math.max(0, 1 - Math.abs((x - 92.5) / 84) ** 3));
  const soupente = (x: number, y: number): boolean => x >= 16 && x <= 169 && y <= plancher - 1 && y >= sourcil(x) + 3;
  const basse = (x: number, y: number): boolean => {
    if (x < 16 || x > 169 || y < plancher + 4 || y > g - SEUIL) return false;
    return Math.min(x - 16, 169 - x) + (y - plancher - 4) >= 14;
  };
  torchis(c, 8, avantToit - 14, 170, g - avantToit + 15);
  dedans(c, 16, 169, avantToit - 12, plancher - 1, soupente, "lames");
  dedans(c, 16, 169, plancher + 4, g - SEUIL, basse, "terre");
  herbes(c, 44, avantToit + 4, 3);
  herbes(c, 122, avantToit + 4, 3);
  bouclier(c, 140, plancher + 13, true);
  lanterne(c, 93, plancher + 4);
  // L'échelle de la soupente, entre les deux lits.
  pl.rect(91, plancher + 4, 1, g - SEUIL - plancher - 4, c.t("#8a5a30"));
  pl.rect(95, plancher + 4, 1, g - SEUIL - plancher - 4, c.t("#523419"));
  for (let y = plancher + 8; y < g - SEUIL - 2; y += 6) pl.rect(92, y, 3, 1, c.t("#b07a44"));
  biais(c, 16, plancher + 17, 30, plancher + 3, 4);
  biais(c, 169, plancher + 17, 155, plancher + 3, 4);
  tranche(c, 14, plancher, 158);
  seuil(c, 14, 158, false);
  for (const x of [10, 170]) {
    poteau(c, x, avantToit - 4, 6, g - avantToit + 5);
    pierres(c, x - 2, g - 8, 10, 9);
  }
  // L'appentis fermé, adossé au pignon : son mur s'abaisse, une porte, une lucarne, le bois qui sèche à l'abri.
  const pente = (x: number): number => 80 + Math.round(((x - 176) * 62) / 80);
  for (let x = 176; x <= 251; x++) {
    const haut = pente(x) + 10;
    pl.rect(x, haut, 1, g - haut + 1, (_i, j) => {
      const grain = alea(x >> 1, j >> 1);
      if (j < haut + 3) return p.mur.ombre;
      return grain < 0.08 ? p.mur.trame : x > 244 ? p.mur.sombre : p.mur.fond;
    });
  }
  pierres(c, 176, g - 10, 78, 11, true);
  porte(c, 184, g - 54, 24, 51);
  fenetre(c, 218, g - 40, 10, 10);
  poteau(c, 248, pente(250) + 10, 5, g - pente(250) - 9);
  tasDeBois(c, 214, g, 34, 3);
  // Le toit : une croupe à gauche, un pignon coupé à droite, et le sourcil au-dessus de la soupente.
  const bords = (y: number): readonly [number, number] => {
    const part = Math.min(1, (y - faite) / (avantToit - faite));
    const droite = y < 44 ? 150 + Math.round(((y - faite) * 28) / (44 - faite)) : 178 + Math.round(((y - 44) * 8) / (avantToit - 44));
    return [Math.round(42 * (1 - part)), droite];
  };
  toit(c, { haut: faite, bas: avantToit, bords, basDe: (x) => (x >= 4 && x <= 181 ? sourcil(x) : avantToit), mousse: c.variante % 3 === 0 });
  for (let x = 40; x <= 152; x++) {
    pl.poser(x, faite - 1, (x & 3) === 0 ? p.chaume.bord : p.chaume.rang);
    if ((x & 7) < 2) pl.poser(x, faite - 2, p.chaume.bord);
  }
  // Le chaume de l'appentis, vu par sa rive : une bande épaisse qui descend jusqu'à hauteur d'épaule.
  for (let x = 174; x <= 259; x++) {
    const haut = pente(x);
    for (let j = 0; j < 12; j++) {
      const brin = alea(x, haut + j);
      pl.poser(x, haut + j, j === 0 || j >= 10 ? p.chaume.bord : j % 4 === 3 ? p.chaume.rang : brin < 0.16 ? p.chaume.brin : j < 4 ? p.chaume.clair : p.chaume.fond);
    }
    if (alea(x, 7) < 0.5) pl.poser(x, haut + 12, p.chaume.bord);
  }
  poserCheminee(pl, c.l, 120, 0, faite + 22);
}

/* ---------- Les dépendances fermées ---------- */

export const DEPENDANCES: Readonly<Record<DependanceId, { largeur: number; hauteur: number }>> = {
  grenier: { largeur: 104, hauteur: 136 },
  hutte: { largeur: 136, hauteur: 126 },
};

/** Le grenier sur pilotis : quatre pieux coiffés d'une pierre plate, une caisse de planches, un chapeau de chaume. */
function grenier(c: Chantier): void {
  const { pl, p, g } = c;
  const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, c.l);
  const caisse = g - 78;
  for (const x of [16, 40, 62, 84]) {
    poteau(c, x, g - 30, 5, 31);
    pl.rect(x - 4, g - 34, 13, 4, (_i, j) => (j === g - 34 ? k("#b3aa9a", "#5e5c66") : k("#6f685c", "#3a3840")));
  }
  pl.rect(10, caisse, 84, 44, (i, j) => {
    const u = cote(c, (i - 10) / 83);
    if ((j - caisse) % 8 === 7) return p.bois.creux;
    if ((i + Math.floor((j - caisse) / 8) * 13) % 26 === 0) return p.bois.sombre;
    return u < 0.16 ? p.bois.clair : u > 0.84 ? p.bois.sombre : alea(i >> 1, j >> 3) < 0.2 ? p.bois.autre : p.bois.fond;
  });
  poutre(c, 6, g - 37, 92, 4);
  porte(c, 42, caisse + 10, 18, 30);
  // L'échelle, appuyée de biais.
  for (let n = 0; n <= 36; n++) {
    const x = 70 + Math.round(n * 0.36);
    pl.poser(x, g - n, p.bois.clair);
    pl.poser(x + 8, g - n, p.bois.sombre);
    if (n % 6 === 3) pl.rect(x + 1, g - n, 7, 1, p.bois.fond);
  }
  const faite = 6;
  toit(c, { haut: faite, bas: caisse + 2, bords: (y) => [Math.round(44 - (44 * (y - faite)) / (caisse + 2 - faite)), Math.round(59 + (44 * (y - faite)) / (caisse + 2 - faite))] });
  pl.rect(46, faite - 3, 12, 6, (i, j) => (j === faite + 1 ? p.bois.corde : (i + j) % 3 === 0 ? p.chaume.bord : p.chaume.rang));
}

/** La petite hutte ronde, fermée : un mur bas, une peau tendue devant la porte, un cône de chaume. */
function petiteHutte(c: Chantier): void {
  const { pl, p, g } = c;
  const cx = 68;
  const avantToit = g - 46;
  const faite = 10;
  torchis(c, 14, avantToit - 2, 108, g - avantToit + 3, true);
  pierres(c, 12, g - 8, 112, 9, true);
  // La porte : deux montants, un linteau, une peau qui pend.
  const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, c.l);
  pl.rect(cx - 13, avantToit + 6, 27, g - avantToit - 5, p.bois.creux);
  pl.rect(cx - 11, avantToit + 8, 23, g - avantToit - 8, (i, j) => {
    const pli = (i - cx + 40) % 6;
    if (j > g - 4 && (i + j) % 3 === 0) return null;
    return pli === 0 ? k("#7a5a3a", "#3c2c22") : pli < 3 ? k("#b48a5c", "#5c4636") : k("#9c744a", "#4e3a2c");
  });
  poteau(c, cx - 16, avantToit + 4, 4, g - avantToit - 3);
  poteau(c, cx + 13, avantToit + 4, 4, g - avantToit - 3);
  poutre(c, cx - 18, avantToit + 3, 37, 4);
  jarre(c, 100, g - 8);
  const demi = (y: number): number => Math.round(5 + 61 * Math.pow(Math.min(1, (y - faite) / (avantToit - faite)), 0.8));
  toit(c, { haut: faite, bas: avantToit, bords: (y) => [cx - demi(y), cx + demi(y)], basDe: (x) => avantToit + Math.round(6 * (1 - ((x - cx) / 66) ** 2)), mousse: c.variante % 2 === 1 });
  pl.rect(cx - 6, faite - 2, 13, 7, (i, j) => (j === faite + 3 ? p.bois.corde : (i + j) % 3 === 0 ? p.chaume.bord : p.chaume.rang));
  biais(c, cx - 7, faite + 3, cx + 5, faite - 9, 2);
  biais(c, cx + 7, faite + 3, cx - 5, faite - 9, 2);
}

/* ---------- La pose ---------- */

const DESSINS: Readonly<Record<ModeleId | DependanceId, (c: Chantier) => void>> = { ronde: hutteRonde, longere, colombages, chaumiere, grenier, hutte: petiteHutte };

/** Dessine une pièce dans son cadre, puis la pose sur la planche, à l'endroit ou retournée. */
function poserDessin(planche: Planche, p: Palette, l: Lumiere, id: ModeleId | DependanceId, largeur: number, hauteur: number, x: number, pied: number, variante: number): boolean {
  const envers = maisonRetournee(variante);
  const cadre = new Planche(largeur, hauteur);
  DESSINS[id]({ pl: cadre, p: paletteDeLaMaison(p, l, variante), l, t: (couleur) => couleurDuDedans(couleur, l), envers, variante, g: hauteur - 1 });
  const haut = pied - hauteur + 1;
  for (let j = 0; j < hauteur; j++) {
    for (let i = 0; i < largeur; i++) {
      const couleur = cadre.cases[j * largeur + (envers ? largeur - 1 - i : i)];
      if (couleur) planche.poser(x + i, haut + j, couleur);
    }
  }
  return envers;
}

/**
 * Pose une maison : `x` sa colonne de gauche, `pied` la rangée du sol. `variante` choisit son sens, ses teintes et ses
 * détails ; les lits vides sont posés à l'endroit, là où `litsDeLaMaison` les annonce.
 */
export function poserMaisonDuModele(planche: Planche, p: Palette, l: Lumiere, modele: ModeleDeMaison, x: number, pied: number, variante: number): void {
  poserDessin(planche, p, l, modele.id, modele.largeur, modele.hauteur, x, pied, variante);
  const t: Teinte = (couleur) => couleurDuDedans(couleur, l);
  litsDeLaMaison(modele, variante).forEach((lit, n) => poserLitVide(planche, x + lit.x, pied - lit.y, variante + n, t));
}

/** Pose une dépendance fermée, grenier ou petite hutte. */
export function poserDependance(planche: Planche, p: Palette, l: Lumiere, id: DependanceId, x: number, pied: number, variante: number): void {
  poserDessin(planche, p, l, id, DEPENDANCES[id].largeur, DEPENDANCES[id].hauteur, x, pied, variante);
}
