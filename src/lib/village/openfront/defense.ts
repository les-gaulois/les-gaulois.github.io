/**
 * Lot « défense » du monde d'OpenFront autour du village : l'usine d'armement, le silo à missiles et son missile, la
 * batterie antimissile et son tir, le poste de défense, la ville lointaine, l'explosion et l'interception (14 novembre 2026).
 *
 * Dessinés case par case pour ce site, à l'échelle des Gaulois (48 × 64 cases), sans ouvrir ni recopier aucune image
 * d'OpenFront ni d'aucune autre œuvre : ce sont les idées du jeu (une usine, un silo, une défense), pas ses dessins. Le
 * pilote a voulu du combat (tir, explosion) : il reste de dessin animé, sans sang, sans victime, sans champignon atomique,
 * et sans aucun éclair (ni blanc, ni saut brusque de clarté : le feu gonfle en orange et jaune, puis devient fumée).
 * La lumière vient d'en haut à gauche, les couleurs du dehors suivent l'heure ; ce qui éclaire (verrières, lampes,
 * voyants, feu) garde sa couleur et ne clignote jamais.
 *
 * Les mouvements, tous lents : la fumée des cheminées et les caisses du tapis roulant de l'usine, la trappe du silo qui
 * s'ouvre (image 0 : fermée), la flamme douce du missile, l'antenne du radar qui tourne, le drapeau du poste ; et, à la
 * demande, le tir de la batterie (images 4 à 7), l'explosion (8 images), l'interception (5 images).
 * Design : Claude Fable 5.2.
 */
import { type Decor, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import type { DessinDeBatiment } from "../batiments/type";
import type { PieceOpenFrontId } from "./index";

/** Les couleurs du clan (blason de `public/brand/`) : bleu, blanc, rouge, sur bleu nuit. Les mêmes qu'à la grande tour. */
const BLEU = "#2456b8";
const BLANC = "#e8e6e0";
const ROUGE = "#c8283a";
const BLEU_NUIT = "#1c2a5e";
/** Ce vers quoi tire une couleur du dehors la nuit. */
const OMBRE_DE_NUIT = "#141c34";
const LUEUR = "#f5a83a";
const AMPOULE = "#fff1a8";
/** Les voyants : allumés à toute heure, sans jamais changer. */
const VOYANT = { vert: "#58c470", ambre: "#f0b030", rouge: "#e2452a" } as const;

interface Tons {
  clair: string;
  fond: string;
  sombre: string;
  creux: string;
}

/** Les matières à une lumière donnée : celles du village, plus le béton, la brique, l'acier et la tôle peinte. */
function matieres(l: Lumiere) {
  const p = paletteDuDehors(l);
  const t = (couleur: string): string => couleurDuDehors(couleur, melanger(couleur, OMBRE_DE_NUIT, 0.5), l);
  const tons = (clair: string, fond: string, sombre: string, creux: string): Tons => ({ clair: t(clair), fond: t(fond), sombre: t(sombre), creux: t(creux) });
  return {
    p,
    t,
    /** La force des lumières : nulle en plein jour, entière à la nuit (comme la porte des huttes). */
    lueur: Math.min(1, Math.max(0, (0.8 - l.jour) / 0.5)),
    beton: { ...tons("#c9cbcc", "#aeb1b4", "#8a8d92", "#676a70"), tache: t("#9c9e9c") },
    brique: tons("#c98260", "#ad6044", "#8e4a34", "#693829"),
    acier: tons("#c6ccd6", "#929aaa", "#5f6777", "#343946"),
    /** La tôle peinte en bleu-gris des hangars. */
    tole: tons("#8ba5bc", "#69829a", "#4f647c", "#36475d"),
    /** La peinture bleu marine des véhicules. */
    marine: tons("#6480b0", "#44609a", "#2f4577", "#1d2c52"),
    ocre: tons("#f0c050", "#d9a030", "#a87820", "#7a5616"),
    jute: tons("#d6c088", "#b89c64", "#8c7446", "#62502e"),
    laiton: tons("#f3d578", "#d9b04e", "#a8823a", "#735826"),
    caoutchouc: tons("#5a5e68", "#3c404a", "#2a2d35", "#1c1e24"),
    bleu: t(BLEU),
    blanc: t(BLANC),
    rouge: t(ROUGE),
    bleuNuit: t(BLEU_NUIT),
    jaune: t("#e8b830"),
    noir: t("#2a2c32"),
    fumee: tons("#eceef0", "#d2d6dc", "#b4b9c2", "#9aa0aa"),
  };
}
type Matieres = ReturnType<typeof matieres>;

/** Mêle une couleur aux cases déjà posées d'un rectangle : une ombre portée, une patine. Les cases vides le restent. */
function voiler(P: Planche, x: number, y: number, l: number, h: number, couleur: string, part: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + l; i++) {
      const fond = P.lire(i, j);
      if (fond) P.poser(i, j, melanger(fond, couleur, part));
    }
  }
}

/** La lueur fixe d'une lampe sur ce qui l'entoure : elle ne touche que les cases déjà posées. */
function halo(P: Planche, cx: number, cy: number, r: number, force: number, couleur: string = LUEUR): void {
  if (force <= 0) return;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      const fond = P.lire(cx + dx, cy + dy);
      if (d < 1 && fond) P.poser(cx + dx, cy + dy, melanger(fond, couleur, force * 0.45 * (1 - d)));
    }
  }
}

/** Un trait d'une case d'épaisseur entre deux points. */
function trait(P: Planche, x0: number, y0: number, x1: number, y1: number, couleur: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) P.poser(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), couleur);
}

/** Du béton banché : une arête claire, des joints de coffrage, des trous de banche, du grain et des coulures. */
function beton(P: Planche, m: Matieres, x: number, y: number, l: number, h: number, graine = 0): void {
  const b = m.beton;
  P.rect(x, y, l, h, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dy === 0) return b.clair;
    if (dy === h - 1 && h > 3) return b.sombre;
    if (dx % 26 === 25 || dy % 14 === 13) return b.sombre;
    if (dx % 26 === 12 && dy % 14 === 6) return b.creux;
    const coulure = alea(i, graine + 7);
    if (coulure < 0.09 && dy < 3 + coulure * 110) return b.tache;
    const a = alea(i, j + graine * 31);
    return a < 0.07 ? b.clair : a > 0.9 ? b.tache : b.fond;
  });
}

/** Un mur de briques : des lits de 3 cases, des briques de 6, décalées d'un lit à l'autre. */
function briques(P: Planche, m: Matieres, x: number, y: number, l: number, h: number, dans?: (x: number, y: number) => boolean): void {
  const b = m.brique;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + l; i++) {
      if (dans && !dans(i, j)) continue;
      const lit = Math.floor(j / 3);
      const decale = i + (lit % 2) * 3;
      if (j % 3 === 2 || decale % 6 === 5) {
        P.poser(i, j, b.creux);
        continue;
      }
      const a = alea(Math.floor(decale / 6), lit + 17);
      let couleur = a < 0.18 ? b.clair : a < 0.62 ? b.fond : a < 0.9 ? b.sombre : m.t("#b87458");
      if (j % 3 === 0 && a < 0.62) couleur = melanger(couleur, b.clair, 0.35);
      P.poser(i, j, couleur);
    }
  }
}

/** Une plaque de métal peint : bord clair en haut et à gauche, sombre en bas et à droite. */
function plaque(P: Planche, c: Tons, x: number, y: number, l: number, h: number): void {
  P.rect(x, y, l, h, (i, j) => {
    if (j === y || i === x) return c.clair;
    if (j === y + h - 1 || i === x + l - 1) return c.creux;
    return alea(i, j + 90) < 0.04 ? c.sombre : c.fond;
  });
}

/** Une rangée de rivets : un point clair, son ombre à droite. */
function rivets(P: Planche, c: Tons, x: number, y: number, l: number, pas = 4): void {
  for (let i = x; i < x + l; i += pas) {
    P.poser(i, y, c.clair);
    P.poser(i + 1, y, c.creux);
  }
}

/** Une colonne de rivets. */
function rivetsDebout(P: Planche, c: Tons, x: number, y: number, h: number, pas = 4): void {
  for (let j = y; j < y + h; j += pas) {
    P.poser(x, j, c.clair);
    P.poser(x, j + 1, c.creux);
  }
}

/** Un tuyau couché, rond : clair dessus, sombre dessous, une bride de temps en temps. */
function tuyau(P: Planche, c: Tons, x: number, y: number, l: number, brides = 18): void {
  P.rect(x, y, l, 4, (i, j) => {
    const bride = (i - x) % brides === brides - 1;
    const r = j - y;
    if (bride) return r === 0 ? c.fond : c.creux;
    return r === 0 ? c.clair : r === 1 ? c.fond : r === 2 ? c.sombre : c.creux;
  });
}

/** Un tuyau debout. */
function tuyauDebout(P: Planche, c: Tons, x: number, y: number, h: number, brides = 18): void {
  P.rect(x, y, 4, h, (i, j) => {
    const bride = (j - y) % brides === brides - 1;
    const r = i - x;
    if (bride) return r === 0 ? c.fond : c.creux;
    return r === 0 ? c.clair : r === 1 ? c.fond : r === 2 ? c.sombre : c.creux;
  });
}

/** Des bandes de sécurité, jaunes et noires, en biais. */
function bandes(P: Planche, m: Matieres, x: number, y: number, l: number, h: number, pas = 4): void {
  P.rect(x, y, l, h, (i, j) => (Math.floor((i - x + (j - y)) / pas) % 2 === 0 ? m.jaune : m.noir));
}

/** Un voyant : un point de couleur fixe dans son œillet, et sa petite lueur la nuit. */
function voyant(P: Planche, m: Matieres, x: number, y: number, couleur: string): void {
  halo(P, x, y, 5, m.lueur * 0.8, couleur);
  P.rect(x - 1, y - 1, 3, 3, m.acier.creux);
  P.poser(x, y, couleur);
  P.poser(x - 1, y, melanger(couleur, "#000000", 0.25));
  P.poser(x, y - 1, melanger(couleur, "#ffffff", 0.45));
}

/** Une lampe d'atelier sur sa potence : l'abat-jour, l'ampoule, et sa lueur quand le jour baisse. */
function lampe(P: Planche, m: Matieres, x: number, y: number): void {
  halo(P, x + 3, y + 5, 16, m.lueur);
  P.rect(x + 3, y - 3, 1, 3, m.acier.creux);
  P.rect(x + 1, y, 5, 1, m.acier.sombre);
  P.rect(x, y + 1, 7, 2, (i) => (i === x ? m.acier.clair : i === x + 6 ? m.acier.creux : m.acier.sombre));
  P.rect(x + 2, y + 3, 3, 2, melanger(m.t("#d8d4c0"), AMPOULE, m.lueur));
}

/** Les lettres en pochoir, 3 cases sur 5. */
const POCHOIR: Readonly<Record<string, readonly string[]>> = {
  G: ["###", "#..", "#.#", "#.#", "###"],
  A: ["###", "#.#", "###", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "!": [".#.", ".#.", ".#.", "...", ".#."],
};

/** Écrit un mot en pochoir, de gauche à droite ; `grand` : chaque case en vaut quatre. */
function ecrire(P: Planche, x: number, y: number, mot: string, couleur: string, grand = false): void {
  const k = grand ? 2 : 1;
  [...mot].forEach((lettre, rang) => {
    (POCHOIR[lettre] ?? []).forEach((ligne, dy) => {
      for (let dx = 0; dx < ligne.length; dx++) if (ligne[dx] === "#") P.rect(x + rang * 4 * k + dx * k, y + dy * k, k, k, couleur);
    });
  });
}

/** Le même mot écrit de haut en bas, une lettre sous l'autre. */
function ecrireDebout(P: Planche, x: number, y: number, mot: string, couleur: string): void {
  [...mot].forEach((lettre, rang) => ecrire(P, x, y + rang * 7, lettre, couleur));
}

/** Un panneau d'attention : un triangle jaune bordé de noir, sur son poteau. `y` : le haut du triangle. */
function panneau(P: Planche, m: Matieres, cx: number, y: number, pied: number): void {
  P.rect(cx, y + 11, 1, pied - y - 10, m.acier.sombre);
  for (let r = 0; r < 11; r++) {
    const demi = Math.floor(r / 2) + 1;
    for (let dx = -demi; dx <= demi; dx++) P.poser(cx + dx, y + r, Math.abs(dx) === demi || r === 10 ? m.noir : m.jaune);
  }
  P.rect(cx, y + 4, 1, 3, m.noir);
  P.poser(cx, y + 8, m.noir);
}

/**
 * Un rectangle tourné autour d'un point : `angle` en degrés, `sens` 1 s'il part vers la droite, -1 vers la gauche. La
 * couleur se donne dans le repère du rectangle : `u` le long, `v` dans l'épaisseur (0 dessous).
 */
function tourne(P: Planche, ox: number, oy: number, angle: number, sens: 1 | -1, long: number, epais: number, couleur: (u: number, v: number) => string | null): void {
  const a = (angle * Math.PI) / 180;
  const ux = sens * Math.cos(a);
  const uy = -Math.sin(a);
  const nx = -sens * Math.sin(a);
  const ny = -Math.cos(a);
  const portee = Math.ceil(Math.hypot(long, epais)) + 1;
  for (let py = Math.floor(oy - portee); py <= oy + portee; py++) {
    for (let px = Math.floor(ox - portee); px <= ox + portee; px++) {
      const dx = px + 0.5 - ox;
      const dy = py + 0.5 - oy;
      const u = dx * ux + dy * uy;
      const v = dx * nx + dy * ny;
      if (u < 0 || u >= long || v < 0 || v >= epais) continue;
      const c = couleur(Math.floor(u), Math.floor(v));
      if (c !== null) P.poser(px, py, c);
    }
  }
}

/** Une roue de camion : le pneu, la jante, le moyeu. */
function roue(P: Planche, m: Matieres, cx: number, cy: number, r: number): void {
  P.disque(cx, cy, r, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > (r - 1) * (r - 1)) return (dx + dy * 3) % 3 === 0 ? m.caoutchouc.creux : m.caoutchouc.sombre;
    if (d > (r - 4) * (r - 4)) return dx + dy < 0 ? m.caoutchouc.clair : m.caoutchouc.fond;
    if (d > (r - 5) * (r - 5)) return m.acier.sombre;
    if (d <= 3) return m.acier.creux;
    if ((Math.abs(dx) === 3 && dy === 0) || (Math.abs(dy) === 3 && dx === 0)) return m.acier.creux;
    return dx + dy < 0 ? m.acier.clair : m.acier.fond;
  });
}

/** Un sac de sable de 12 cases sur 6 : la toile de jute, sa couture, son ombre. */
function sac(P: Planche, m: Matieres, x: number, y: number): void {
  const j = m.jute;
  P.rect(x, y, 12, 6, (i, r) => {
    const dx = i - x;
    const dy = r - y;
    if ((dy === 0 || dy === 5) && (dx === 0 || dx === 11)) return null;
    if (dx === 11) return j.creux;
    if (dy === 5) return j.creux;
    if (dy === 0) return j.clair;
    if (dx === 0) return j.clair;
    if (dy === 4) return j.sombre;
    if (dx === 9 && (dy === 2 || dy === 3)) return j.sombre;
    const a = alea(i, r + 61);
    return a < 0.12 ? j.sombre : a > 0.9 ? j.clair : dy === 1 ? melanger(j.fond, j.clair, 0.5) : j.fond;
  });
}

/** Un mur de sacs de sable : `rangs` lits posés en quinconce, chacun en retrait du précédent. `bas` : la rangée du pied. */
function sacs(P: Planche, m: Matieres, x: number, bas: number, large: number, rangs: number, retrait = 4, creneaux = false): void {
  for (let r = 0; r < rangs; r++) {
    const de = x + r * retrait + (r % 2) * 6;
    const a = x + large - r * retrait;
    let rang = 0;
    for (let i = de; i + 12 <= a; i += 12, rang++) {
      if (creneaux && r === rangs - 1 && rang % 3 === 2) continue;
      sac(P, m, i, bas - 5 - r * 6);
    }
  }
}

/** Une caisse de bois de 14 cases sur 10, cerclée, marquée au pochoir ; `ouverte` : trois pointes d'obus de laiton dépassent. */
function caisse(P: Planche, m: Matieres, x: number, y: number, ouverte: boolean): void {
  const { bois } = m.p;
  if (ouverte) {
    for (const dx of [2, 6, 10]) {
      P.poser(x + dx, y - 5, m.laiton.clair);
      P.rect(x + dx - 1, y - 4, 3, 1, (i) => (i < x + dx ? m.laiton.clair : i > x + dx ? m.laiton.sombre : m.laiton.fond));
      P.rect(x + dx - 1, y - 3, 3, 3, (i, j) => (j === y - 2 ? m.rouge : i < x + dx ? m.laiton.clair : i > x + dx ? m.laiton.sombre : m.laiton.fond));
    }
  }
  P.rect(x, y, 14, 10, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dy === 0) return bois.clair;
    if (dy === 9) return bois.creux;
    if (dx === 0 || dx === 13) return bois.sombre;
    if (dx === 1 || dx === 12) return bois.fond;
    if (dy === 3 || dy === 6) return bois.sombre;
    if (dx >= 5 && dx <= 8 && (dy === 4 || dy === 5)) return m.bleuNuit;
    return alea(i, j + 5) < 0.1 ? bois.fond : bois.autre;
  });
}

/** Un fût de métal peint, cerclé. */
function fut(P: Planche, c: Tons, x: number, y: number): void {
  P.rect(x, y, 10, 15, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dy === 0) return c.clair;
    if (dy === 4 || dy === 10) return c.creux;
    if (dy === 14) return c.creux;
    return dx < 2 ? c.clair : dx > 7 ? c.sombre : dx > 5 ? melanger(c.fond, c.sombre, 0.5) : c.fond;
  });
}

/** Une échelle de fer : deux montants, un barreau toutes les trois cases. */
function echelle(P: Planche, m: Matieres, x: number, y: number, h: number): void {
  for (let j = y; j < y + h; j++) {
    P.poser(x, j, m.acier.clair);
    P.poser(x + 5, j, m.acier.sombre);
    if ((j - y) % 3 === 1) P.rect(x + 1, j, 4, 1, m.acier.fond);
  }
}

/* ------------------------------------------------------------------ L'usine ------------------------------------------------------------------ */

const USINE_L = 336;
const USINE_H = 240;
const USINE_IMAGES = 4;
/** Le bas de l'usine : son quai de béton. */
const USINE_QUAI = 236;
/** Le haut du mur de briques, sous les dents de scie. */
const USINE_MUR = 148;
/** Les colonnes de la halle. */
const HALLE_DE = 48;
const HALLE_A = 253;
/** La bouche de chaque cheminée : la colonne de son milieu et la rangée de son bord. */
const CHEMINEES = [
  { x: 86, y: 62 },
  { x: 150, y: 44 },
  { x: 224, y: 80 },
] as const;

/** La fumée : des bouffées rondes qui montent de 3 cases par image, grossissent, penchent sous le vent et se défont. */
function fumee(P: Planche, m: Matieres, x: number, haut: number, image: number, images: number, portee = 48): void {
  const pas = 12;
  for (let k = portee / pas - 1; k >= 0; k--) {
    const dist = k * pas + ((image % images) * pas) / images;
    const part = dist / portee;
    const r = 3 + Math.round(dist / 9);
    const cx = Math.round(x + dist * 0.3 + 2.2 * Math.sin(dist / 8));
    const cy = haut - 4 - Math.round(dist);
    P.disque(cx, cy, r, (dx, dy) => {
      const px = cx + dx;
      const py = cy + dy;
      if (part > 0.7 && (px + py) % 2 !== 0) return null;
      if (part > 0.4 && (px + 2 * py) % 5 === 0) return null;
      return dx + dy < -r * 0.5 ? m.fumee.clair : dx + dy > r * 0.7 ? m.fumee.sombre : m.fumee.fond;
    });
  }
}

/** Une haute cheminée de briques, un peu plus étroite en haut : sa couronne, ses cercles de fer, son feu de balisage. */
function chemineeDeBriques(P: Planche, m: Matieres, cx: number, haut: number, bas: number, demiBas: number): void {
  for (let y = haut; y <= bas; y++) {
    const demi = demiBas - 2 + Math.round((2 * (y - haut)) / (bas - haut));
    briques(P, m, cx - demi, y, demi * 2 + 1, 1);
    P.poser(cx - demi, y, m.brique.clair);
    P.poser(cx - demi + 1, y, melanger(P.lire(cx - demi + 1, y) ?? m.brique.fond, m.brique.clair, 0.5));
    for (let i = 0; i < 4; i++) {
      const x = cx + demi - i;
      P.poser(x, y, melanger(P.lire(x, y) ?? m.brique.sombre, m.brique.creux, 0.6 - i * 0.12));
    }
    if ((y - haut) % 22 === 12) P.rect(cx - demi, y, demi * 2 + 1, 1, m.acier.sombre);
    if ((y - haut) % 22 === 11) P.rect(cx - demi, y, demi * 2 + 1, 1, m.acier.fond);
  }
  // La couronne : deux assises de pierre qui débordent, la bouche noire de suie.
  const demi = demiBas - 2;
  P.rect(cx - demi - 2, haut, demi * 2 + 5, 2, (_x, y) => (y === haut ? m.caoutchouc.fond : m.beton.clair));
  P.rect(cx - demi - 1, haut + 2, demi * 2 + 3, 2, (x, y) => (y === haut + 3 ? m.beton.sombre : x > cx + demi - 3 ? m.beton.sombre : m.beton.fond));
  P.rect(cx - demi, haut + 4, demi * 2 + 1, 3, (x) => melanger(P.lire(x, haut + 8) ?? m.brique.sombre, m.caoutchouc.sombre, 0.45));
  voyant(P, m, cx - demi - 2, haut + 7, VOYANT.rouge);
}

/** Une cheminée de tôle : des viroles rivetées, des bagues rouges et blanches en haut, deux haubans. */
function chemineeDeMetal(P: Planche, m: Matieres, cx: number, haut: number, bas: number): void {
  trait(P, cx - 3, haut + 26, cx - 22, bas - 8, m.acier.sombre);
  trait(P, cx + 4, haut + 26, cx + 22, bas - 4, m.acier.sombre);
  for (let y = haut; y <= bas; y++) {
    const bague = y - haut < 20 ? Math.floor((y - haut) / 5) % 2 : -1;
    for (let dx = -4; dx <= 4; dx++) {
      const c: Tons = bague === 0 ? { clair: melanger(m.rouge, "#ffffff", 0.25), fond: m.rouge, sombre: melanger(m.rouge, m.noir, 0.35), creux: melanger(m.rouge, m.noir, 0.55) } : bague === 1 ? { clair: m.blanc, fond: m.blanc, sombre: m.beton.fond, creux: m.beton.sombre } : m.acier;
      let couleur = dx <= -3 ? c.clair : dx <= 0 ? c.fond : dx <= 2 ? c.sombre : c.creux;
      if (bague < 0 && (y - haut) % 16 === 3) couleur = dx <= 0 ? m.acier.sombre : m.acier.creux;
      P.poser(cx + dx, y, couleur);
    }
  }
  P.rect(cx - 5, haut, 11, 1, m.caoutchouc.fond);
  P.rect(cx - 5, haut + 1, 11, 1, m.acier.fond);
  P.rect(cx - 5, haut + 26, 11, 2, (x, y) => (y === haut + 26 ? m.acier.clair : x > cx ? m.acier.creux : m.acier.sombre));
}

/** Une vitre d'atelier : le reflet du ciel le jour, la lumière des lampes la nuit. Couleurs fixes. */
function vitre(m: Matieres, x: number, y: number, graine: number): string {
  const a = alea(graine, 3);
  const deJour = (x - y + 400) % 9 < 2 ? "#c4e0ee" : a < 0.3 ? "#86b0cc" : "#9cc4dc";
  const deNuit = a < 0.2 ? "#f5b84a" : a < 0.55 ? "#ffd98a" : "#ffe6a6";
  return melanger(m.t(deJour), deNuit, m.lueur);
}

/** Une grande fenêtre d'atelier à petits carreaux, son linteau et son appui de béton. */
function fenetreDAtelier(P: Planche, m: Matieres, x: number, y: number, l: number, h: number): void {
  P.rect(x - 2, y - 4, l + 4, 3, (_i, j) => (j === y - 4 ? m.beton.clair : j === y - 2 ? m.beton.sombre : m.beton.fond));
  P.rect(x - 1, y - 1, l + 2, h + 2, m.acier.creux);
  P.rect(x, y, l, h, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dx % 6 === 5 || dy % 6 === 5) return m.acier.sombre;
    return vitre(m, i, j, Math.floor(dx / 6) + Math.floor(dy / 6) * 7 + x);
  });
  P.rect(x - 3, y + h + 1, l + 6, 2, (_i, j) => (j === y + h + 1 ? m.beton.clair : m.beton.sombre));
  voiler(P, x - 2, y + h + 3, l + 4, 1, m.brique.creux, 0.5);
}

function dessinerUsine(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const P = new Planche(USINE_L, USINE_H);
  const im = ((image % USINE_IMAGES) + USINE_IMAGES) % USINE_IMAGES;

  // Les cheminées, derrière le toit, et leur fumée.
  chemineeDeBriques(P, m, CHEMINEES[0].x, CHEMINEES[0].y, USINE_MUR, 9);
  chemineeDeBriques(P, m, CHEMINEES[1].x, CHEMINEES[1].y, USINE_MUR, 10);
  chemineeDeMetal(P, m, CHEMINEES[2].x, CHEMINEES[2].y, USINE_MUR);
  fumee(P, m, CHEMINEES[0].x, CHEMINEES[0].y, im, USINE_IMAGES);
  fumee(P, m, CHEMINEES[1].x, CHEMINEES[1].y, im + 2, USINE_IMAGES);
  fumee(P, m, CHEMINEES[2].x, CHEMINEES[2].y, im + 1, USINE_IMAGES, 36);

  // L'auvent du tapis roulant, à droite de la halle : un toit de tôle sur deux poteaux.
  for (let x = HALLE_A; x < 334; x++) {
    const y = 170 + Math.round((x - HALLE_A) / 10);
    const onde = (x - HALLE_A) % 4;
    P.poser(x, y, m.tole.clair);
    P.poser(x, y + 1, onde === 3 ? m.tole.sombre : m.tole.fond);
    P.poser(x, y + 2, m.tole.creux);
    P.poser(x, y + 3, melanger(m.tole.creux, m.noir, 0.4));
  }
  for (const x of [302, 329]) {
    P.rect(x, 178, 3, USINE_QUAI - 178, (i) => (i === x ? m.acier.clair : i === x + 2 ? m.acier.creux : m.acier.sombre));
    trait(P, x - 6, 181, x, 187, m.acier.sombre);
    rivetsDebout(P, m.acier, x + 1, 184, 48, 8);
  }
  // Le tapis : la bande de caoutchouc, ses rouleaux, sa poutre jaune, ses pieds en croix.
  for (const x of [262, 284]) {
    P.rect(x, 210, 2, USINE_QUAI - 210, (i) => (i === x ? m.acier.fond : m.acier.creux));
    trait(P, x + 2, 212, x + 15, 232, m.acier.sombre);
    trait(P, x + 15, 212, x + 2, 232, m.acier.sombre);
  }
  P.rect(299, 210, 2, USINE_QUAI - 210, m.acier.creux);
  P.rect(HALLE_A, 202, 49, 2, (_x, y) => (y === 202 ? m.caoutchouc.clair : m.caoutchouc.sombre));
  P.rect(HALLE_A, 204, 49, 3, (x, y) => {
    const dans = (x - HALLE_A) % 6;
    if (y === 205 && dans === 2) return m.acier.clair;
    return dans >= 1 && dans <= 3 ? m.acier.fond : m.caoutchouc.creux;
  });
  P.rect(HALLE_A, 207, 51, 3, (x, y) => (y === 207 ? m.ocre.clair : y === 209 ? m.ocre.creux : (x - HALLE_A) % 12 === 11 ? m.ocre.sombre : m.ocre.fond));
  P.disque(302, 205, 3, (dx, dy) => (dx * dx + dy * dy <= 1 ? m.acier.creux : dx + dy < 0 ? m.acier.clair : m.acier.sombre));
  // Les caisses d'obus avancent de 6 cases par image : deux caisses, une tous les 24 cases.
  for (let k = 0; k < 2; k++) caisse(P, m, HALLE_A - 14 + ((k * 24 + im * 6) % 48), 192, true);
  // La hotte d'où sort le tapis, avec ses lanières.
  plaque(P, m.tole, HALLE_A, 180, 12, 13);
  P.rect(HALLE_A + 1, 193, 10, 6, (x, y) => ((x - HALLE_A) % 2 === 0 ? m.caoutchouc.fond : y > 196 ? null : m.caoutchouc.sombre));
  rivets(P, m.tole, HALLE_A + 2, 182, 9, 3);
  // Au bout, la pile de caisses sur sa palette, et le diable.
  P.rect(304, 233, 24, 3, (x, y) => (y === 233 ? m.p.bois.clair : (x - 304) % 8 < 2 ? m.p.bois.sombre : y === 234 ? null : m.p.bois.fond));
  caisse(P, m, 305, 223, false);
  caisse(P, m, 314, 213, true);
  // La lampe pendue sous l'auvent.
  P.rect(282, 174, 1, 6, m.acier.creux);
  P.rect(280, 180, 5, 2, m.acier.sombre);
  P.rect(281, 182, 3, 2, melanger(m.t("#d8d4c0"), AMPOULE, m.lueur));

  // Le mur de briques de la halle.
  briques(P, m, HALLE_DE, USINE_MUR, HALLE_A - HALLE_DE, USINE_QUAI - USINE_MUR);
  // Le soubassement de béton.
  beton(P, m, HALLE_DE, 226, HALLE_A - HALLE_DE, 10, 3);
  // Les pilastres : aux deux bouts, et de part et d'autre du portail.
  for (const x of [HALLE_DE, 116, 183, HALLE_A - 6]) {
    P.rect(x, USINE_MUR, 6, USINE_QUAI - USINE_MUR, (i, j) => {
      const c = P.lire(i, j) ?? m.brique.fond;
      if (j >= 226) return c;
      return i === x ? melanger(c, m.brique.clair, 0.7) : i === x + 5 ? melanger(c, m.brique.creux, 0.7) : melanger(c, m.brique.clair, 0.3);
    });
    P.rect(x + 6, USINE_MUR + 4, 1, 78, (i, j) => melanger(P.lire(i, j) ?? m.brique.fond, m.brique.creux, 0.45));
  }

  // Le toit en dents de scie : cinq dents, un pan de tôle qui descend vers la droite, le pignon tout en verrière.
  const DENT = 41;
  for (let k = 0; k < 5; k++) {
    const x0 = HALLE_DE + k * DENT;
    for (let x = x0; x < x0 + DENT; x++) {
      const dx = x - x0;
      const haut = dx < 3 ? 120 : 120 + Math.round(((dx - 2) * 27) / 38);
      for (let y = haut; y < USINE_MUR; y++) {
        const dy = y - haut;
        let couleur: string;
        if (dx < 3) couleur = dx === 0 ? m.acier.clair : dx === 1 ? m.acier.fond : m.acier.sombre;
        else if (dy === 0) couleur = m.tole.clair;
        else if (dy === 1) couleur = dx % 4 === 3 ? m.tole.sombre : m.tole.fond;
        else if (dy === 2) couleur = m.tole.creux;
        else if (dx % 7 === 2 || (y - 120) % 7 === 6) couleur = m.acier.sombre;
        else couleur = vitre(m, x, y, Math.floor(dx / 7) + Math.floor((y - 120) / 7) * 5 + k * 31);
        P.poser(x, y, couleur);
      }
    }
    // Le chéneau au creux de la dent, et le chapeau du faîte.
    P.rect(x0 - 1, 146, 3, 2, m.acier.creux);
    P.rect(x0 - 1, 118, 5, 2, (_x, y) => (y === 118 ? m.acier.clair : m.acier.sombre));
  }
  P.rect(HALLE_A - 1, 146, 2, 2, m.acier.creux);
  // Deux aérateurs sur les faîtes.
  for (const x of [HALLE_DE + DENT + 1, HALLE_DE + 3 * DENT + 1]) {
    P.rect(x, 110, 2, 8, (i) => (i === x ? m.acier.fond : m.acier.creux));
    P.rect(x - 2, 108, 6, 2, (_i, j) => (j === 108 ? m.acier.clair : m.acier.sombre));
  }
  // La corniche de béton entre le toit et le mur, et son ombre.
  P.rect(HALLE_DE - 2, USINE_MUR, HALLE_A - HALLE_DE + 4, 4, (x, y) => (y === USINE_MUR ? m.beton.clair : y === USINE_MUR + 3 ? m.beton.creux : (x - HALLE_DE) % 13 === 12 ? m.beton.sombre : m.beton.fond));
  voiler(P, HALLE_DE, USINE_MUR + 4, HALLE_A - HALLE_DE, 2, m.brique.creux, 0.55);

  // Le grand portail : un cadre d'acier riveté, deux vantaux de tôle qui coulissent, entrouverts sur l'atelier.
  const PORTAIL = { x: 122, y: 162, l: 61, bas: USINE_QUAI - 1 };
  P.rect(PORTAIL.x, PORTAIL.y - 6, PORTAIL.l, 6, (_x, y) => (y === PORTAIL.y - 6 ? m.acier.clair : y === PORTAIL.y - 1 ? m.acier.creux : m.acier.fond));
  rivets(P, m.acier, PORTAIL.x + 2, PORTAIL.y - 4, PORTAIL.l - 3, 5);
  P.rect(PORTAIL.x, PORTAIL.y, PORTAIL.l, PORTAIL.bas - PORTAIL.y + 1, (x, y) => {
    const dx = x - PORTAIL.x;
    const dy = y - PORTAIL.y;
    if (dx < 3 || dx >= PORTAIL.l - 3) return dx === 0 || dx === PORTAIL.l - 3 ? m.acier.clair : dx === 2 || dx === PORTAIL.l - 1 ? m.acier.creux : m.acier.fond;
    // L'entrebâillement : le noir de l'atelier le jour, sa lumière la nuit.
    if (dx >= 27 && dx <= 33) {
      const dedans = dy > 60 ? "#3a3530" : dx === 30 && dy > 20 && dy < 44 ? "#4c4a52" : "#221f22";
      return melanger(m.t(dedans), dy > 60 ? "#c9863a" : "#f0a848", m.lueur * (dx === 27 || dx === 33 ? 0.55 : 0.85));
    }
    if (dy < 2) return m.acier.creux;
    if (dy >= 64) return Math.floor((dx + dy) / 4) % 2 === 0 ? m.jaune : m.noir;
    if (dx === 3 || dx === 34) return m.tole.clair;
    if (dx === 26 || dx === PORTAIL.l - 4) return m.tole.creux;
    // Une rangée de hublots carrés dans chaque vantail.
    if (dy >= 12 && dy <= 21 && dx % 8 >= 1 && dx % 8 <= 5 && dx !== 25) return dy === 12 || dy === 21 || dx % 8 === 1 || dx % 8 === 5 ? m.acier.creux : vitre(m, x, y, dx >> 3);
    if (dy % 6 === 5) return m.tole.creux;
    if (dy % 6 === 0) return m.tole.clair;
    return alea(x, y + 12) < 0.03 ? m.tole.sombre : m.tole.fond;
  });
  // Les poignées, le rail du haut et ses galets.
  P.rect(PORTAIL.x + 23, PORTAIL.y + 34, 2, 8, m.acier.clair);
  P.rect(PORTAIL.x + 36, PORTAIL.y + 34, 2, 8, m.acier.clair);
  for (const dx of [8, 20, 40, 52]) P.rect(PORTAIL.x + dx, PORTAIL.y - 1, 3, 3, (x, y) => (y === PORTAIL.y ? m.acier.clair : m.acier.creux));
  // Les trois voyants du portail, sur le linteau.
  for (const [dx, couleur] of [
    [-6, VOYANT.vert],
    [0, VOYANT.ambre],
    [6, VOYANT.rouge],
  ] as const) voyant(P, m, PORTAIL.x + 30 + dx, PORTAIL.y - 9, couleur);
  // L'enseigne du clan au-dessus, à cheval sur la corniche : une plaque bleu nuit, trois lettres, un filet tricolore.
  const ENSEIGNE = { x: 135, y: 132 };
  P.rect(ENSEIGNE.x - 1, ENSEIGNE.y - 1, 37, 19, m.acier.creux);
  P.rect(ENSEIGNE.x, ENSEIGNE.y, 35, 17, (x, y) => (y === ENSEIGNE.y || x === ENSEIGNE.x ? m.acier.clair : m.bleuNuit));
  ecrire(P, ENSEIGNE.x + 7, ENSEIGNE.y + 3, "GAL", melanger(m.blanc, "#ffffff", m.lueur * 0.5), true);
  P.rect(ENSEIGNE.x + 4, ENSEIGNE.y + 14, 28, 1, (x) => (x < ENSEIGNE.x + 13 ? m.bleu : x < ENSEIGNE.x + 23 ? m.blanc : m.rouge));
  for (const dx of [2, 32]) P.poser(ENSEIGNE.x + dx, ENSEIGNE.y + 2, m.acier.clair);
  // Les deux lampes du portail, sur les pilastres.
  lampe(P, m, 108, 166);
  lampe(P, m, 189, 166);

  // À gauche du portail : la porte du personnel, une fenêtre, un tuyau ocre, deux fûts.
  const PORTE = { x: 58, y: 164 };
  P.rect(PORTE.x - 2, PORTE.y - 4, 28, 3, (_x, y) => (y === PORTE.y - 4 ? m.beton.clair : y === PORTE.y - 2 ? m.beton.sombre : m.beton.fond));
  P.rect(PORTE.x - 1, PORTE.y - 1, 26, USINE_QUAI - PORTE.y + 1, m.acier.creux);
  plaque(P, m.tole, PORTE.x, PORTE.y, 24, USINE_QUAI - PORTE.y);
  P.disque(PORTE.x + 12, PORTE.y + 14, 5, (dx, dy) => (dx * dx + dy * dy > 18 ? m.acier.sombre : vitre(m, PORTE.x + dx, PORTE.y + dy, 77)));
  rivets(P, m.tole, PORTE.x + 3, PORTE.y + 3, 19, 4);
  rivets(P, m.tole, PORTE.x + 3, PORTE.y + 68, 19, 4);
  P.rect(PORTE.x + 2, PORTE.y + 30, 20, 1, m.tole.creux);
  P.rect(PORTE.x + 2, PORTE.y + 31, 20, 1, m.tole.clair);
  P.rect(PORTE.x + 19, PORTE.y + 38, 2, 6, m.acier.clair);
  bandes(P, m, PORTE.x + 1, PORTE.y + 62, 22, 4, 3);
  for (const y of [PORTE.y + 8, PORTE.y + 54]) P.rect(PORTE.x, y, 3, 5, m.acier.sombre);
  lampe(P, m, PORTE.x + 8, PORTE.y - 14);
  fenetreDAtelier(P, m, 90, 164, 23, 29);
  tuyau(P, m.ocre, 86, 200, 30);
  tuyauDebout(P, m.ocre, 84, 153, 51, 17);
  P.disque(100, 201, 3, (dx, dy) => (dx * dx + dy * dy <= 1 ? m.acier.creux : Math.abs(dx) === Math.abs(dy) ? m.rouge : melanger(m.rouge, "#ffffff", 0.2)));
  fut(P, m.marine, 92, 221);
  fut(P, m.marine, 103, 221);
  fut(P, { clair: melanger(m.rouge, "#ffffff", 0.3), fond: m.rouge, sombre: melanger(m.rouge, m.noir, 0.3), creux: melanger(m.rouge, m.noir, 0.55) }, 97, 206);

  // À droite du portail : deux fenêtres, leurs grilles d'aération, un tuyau qui file vers l'auvent, l'armoire électrique.
  fenetreDAtelier(P, m, 193, 164, 23, 29);
  fenetreDAtelier(P, m, 221, 164, 23, 29);
  for (const x of [198, 226]) {
    P.rect(x, 208, 13, 9, (i, j) => (i === x || j === 208 ? m.acier.clair : i === x + 12 || j === 216 ? m.acier.creux : (j - 208) % 2 === 0 ? m.acier.sombre : m.acier.fond));
  }
  tuyau(P, m.ocre, 190, 200, 57);
  tuyauDebout(P, m.ocre, 243, 204, 22, 30);
  // L'armoire électrique : sa porte, ses deux voyants, le câble qui monte à la corniche.
  plaque(P, m.acier, 214, 205, 9, 14);
  voyant(P, m, 217, 209, VOYANT.vert);
  voyant(P, m, 220, 209, VOYANT.ambre);
  P.rect(216, 213, 5, 1, m.acier.creux);
  P.rect(218, 152, 1, 53, (_x, y) => (y % 9 === 0 ? m.acier.fond : m.noir));

  // La cuve, à gauche de la halle : un cylindre riveté sur quatre pieds, son niveau, son échelle, son tuyau.
  const CUVE = { x: 8, y: 152, l: 33, bas: 216 };
  for (const x of [CUVE.x + 2, CUVE.x + 27]) P.rect(x, CUVE.bas, 4, USINE_QUAI - CUVE.bas, (i) => (i === x ? m.acier.clair : i === x + 3 ? m.acier.creux : m.acier.sombre));
  trait(P, CUVE.x + 6, CUVE.bas + 2, CUVE.x + 26, USINE_QUAI - 2, m.acier.sombre);
  trait(P, CUVE.x + 26, CUVE.bas + 2, CUVE.x + 6, USINE_QUAI - 2, m.acier.sombre);
  for (let y = CUVE.y - 7; y <= CUVE.bas; y++) {
    // Le dôme du haut, puis le fût, puis le fond bombé.
    const retrait = y < CUVE.y ? Math.round(16 * (1 - Math.sqrt(1 - Math.pow((CUVE.y - y) / 8, 2)))) : y > CUVE.bas - 4 ? (y - CUVE.bas + 4) * 2 : 0;
    for (let x = CUVE.x + retrait; x < CUVE.x + CUVE.l - retrait; x++) {
      const rel = (x - CUVE.x) / (CUVE.l - 1);
      let couleur = rel < 0.12 ? m.acier.fond : rel < 0.3 ? m.acier.clair : rel < 0.62 ? m.acier.fond : rel < 0.85 ? m.acier.sombre : m.acier.creux;
      const dy = y - CUVE.y;
      if (dy >= 0 && dy % 16 === 15) couleur = rel < 0.62 ? m.acier.sombre : m.acier.creux;
      else if (dy >= 0 && dy % 16 === 0 && (x - CUVE.x) % 3 === 1) couleur = m.acier.clair;
      if (dy >= 20 && dy <= 25) couleur = melanger(dy < 22 ? m.bleu : dy < 24 ? m.blanc : m.rouge, couleur, 0.3);
      P.poser(x, y, couleur);
    }
  }
  // Le tube de niveau, à moitié plein.
  P.rect(CUVE.x + 6, CUVE.y + 30, 3, 26, (x, y) => (x === CUVE.x + 7 ? (y > CUVE.y + 41 ? VOYANT.vert : m.t("#dfeef4")) : m.acier.creux));
  echelle(P, m, CUVE.x + 21, CUVE.y - 4, USINE_QUAI - CUVE.y + 4);
  P.rect(CUVE.x + 15, CUVE.y - 10, 4, 3, (x) => (x === CUVE.x + 15 ? m.acier.clair : m.acier.sombre));
  tuyau(P, m.ocre, CUVE.x + 16, CUVE.bas + 6, HALLE_DE - CUVE.x - 16, 13);
  panneau(P, m, 3, 213, USINE_QUAI);

  // Le quai de béton : son arête, ses joints, le filet jaune devant le portail, les rails qui en sortent.
  beton(P, m, 0, USINE_QUAI, USINE_L, 4, 9);
  P.rect(PORTAIL.x - 6, USINE_QUAI, PORTAIL.l + 12, 1, (x) => (Math.floor(x / 4) % 2 === 0 ? m.jaune : m.noir));
  P.rect(PORTAIL.x + 8, USINE_QUAI + 1, 3, 3, m.acier.sombre);
  P.rect(PORTAIL.x + 50, USINE_QUAI + 1, 3, 3, m.acier.sombre);
  return P.decor();
}

/* ------------------------------------------------------------------ Le silo ------------------------------------------------------------------ */

const SILO_L = 240;
const SILO_H = 122;
const SILO_IMAGES = 4;
/** La dalle : sa première rangée. Le bas du dessin est son pied. */
const SILO_DALLE = 106;
/** La margelle du puits : la colonne de son milieu, sa première rangée (la bouche d'où sort le missile). */
const SILO_MILIEU = 120;
const SILO_BOUCHE = 78;

function dessinerSilo(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const P = new Planche(SILO_L, SILO_H);
  const im = ((image % SILO_IMAGES) + SILO_IMAGES) % SILO_IMAGES;
  const BAS = SILO_H - 1;

  // Le garde-corps du fond : des poteaux jaunes et deux lisses, tout le long de la dalle.
  for (let x = 16; x <= 222; x++) {
    const poteau = (x - 16) % 23 < 2;
    if (poteau) P.rect(x, 88, 1, SILO_DALLE - 88, (x - 16) % 23 === 0 ? m.ocre.clair : m.ocre.sombre);
    else {
      P.poser(x, 89, m.ocre.fond);
      P.poser(x, 97, m.ocre.sombre);
    }
  }

  // Le mât du projecteur, à gauche : un treillis, la lampe tournée vers la trappe.
  const MAT = 22;
  for (let y = 26; y < SILO_DALLE; y++) {
    P.poser(MAT, y, m.acier.clair);
    P.poser(MAT + 4, y, m.acier.sombre);
    const dans = (y - 26) % 8;
    P.poser(MAT + 1 + (dans < 4 ? dans : 7 - dans) * 0.75, y, m.acier.fond);
  }
  P.rect(MAT - 1, 24, 7, 2, m.acier.creux);
  P.rect(MAT + 3, 16, 9, 8, (x, y) => (y === 16 || x === MAT + 3 ? m.acier.clair : x === MAT + 11 ? null : m.acier.sombre));
  P.rect(MAT + 11, 17, 2, 7, melanger(m.t("#dcdccc"), AMPOULE, m.lueur));
  P.rect(MAT - 3, 100, 11, 6, (x, y) => (y === 100 ? m.beton.clair : x > MAT + 5 ? m.beton.sombre : m.beton.fond));
  voyant(P, m, MAT + 2, 13, VOYANT.rouge);

  // La dalle de béton : un bord en biais à gauche, trois marches à droite.
  beton(P, m, 10, SILO_DALLE, 212, SILO_H - SILO_DALLE, 5);
  for (let r = 0; r < SILO_H - SILO_DALLE; r++) {
    for (let i = 0; i < 10; i++) if (i >= 10 - r) P.poser(i, SILO_DALLE + r, i === 10 - r ? m.beton.clair : alea(i, r) < 0.2 ? m.beton.tache : m.beton.fond);
  }
  for (let k = 0; k < 3; k++) {
    const y = SILO_DALLE + 4 + k * 4;
    P.rect(222 + k * 6, y, 18 - k * 6, BAS - y + 1, (x, j) => (j === y ? m.beton.clair : x === 222 + k * 6 ? m.beton.sombre : m.beton.fond));
  }
  // La bande de sécurité au bord de la dalle, de part et d'autre du puits.
  bandes(P, m, 60, SILO_DALLE + 1, 120, 3, 4);

  // L'armoire de commande : sa porte, son écran, ses voyants, son antenne ; le câble court jusqu'au puits.
  const ARMOIRE = { x: 40, y: 80 };
  plaque(P, m.tole, ARMOIRE.x, ARMOIRE.y, 28, SILO_DALLE - ARMOIRE.y);
  P.rect(ARMOIRE.x - 1, ARMOIRE.y - 2, 30, 2, (_x, y) => (y === ARMOIRE.y - 2 ? m.acier.clair : m.acier.sombre));
  P.rect(ARMOIRE.x + 3, ARMOIRE.y + 3, 12, 8, (x, y) => (x === ARMOIRE.x + 3 || y === ARMOIRE.y + 3 ? m.acier.creux : melanger(m.t("#27413a"), (x + y) % 3 === 0 ? "#8fe0a8" : "#3f8f66", 0.35 + 0.65 * m.lueur)));
  voyant(P, m, ARMOIRE.x + 19, ARMOIRE.y + 5, VOYANT.vert);
  voyant(P, m, ARMOIRE.x + 23, ARMOIRE.y + 5, VOYANT.ambre);
  voyant(P, m, ARMOIRE.x + 19, ARMOIRE.y + 10, VOYANT.vert);
  P.rect(ARMOIRE.x + 3, ARMOIRE.y + 14, 22, 9, (x, y) => (y === ARMOIRE.y + 14 ? m.tole.creux : (y - ARMOIRE.y) % 2 === 0 ? m.tole.sombre : m.tole.fond));
  P.rect(ARMOIRE.x + 14, ARMOIRE.y + 15, 1, 8, m.tole.creux);
  rivets(P, m.tole, ARMOIRE.x + 2, ARMOIRE.y + 1, 25, 5);
  P.rect(ARMOIRE.x + 24, ARMOIRE.y - 18, 1, 16, m.acier.sombre);
  P.rect(ARMOIRE.x + 23, ARMOIRE.y - 19, 3, 1, m.acier.clair);
  for (let x = ARMOIRE.x + 28; x < 84; x++) P.poser(x, SILO_DALLE - 1 - Math.round(2.5 * Math.sin(((x - ARMOIRE.x - 28) / 16) * Math.PI) * (x < 80 ? 1 : 0.4)), m.noir);

  // La margelle du puits : un anneau de béton cerclé d'acier, marqué au pochoir.
  const DE = SILO_MILIEU - 36;
  const LARGE = 73;
  for (let y = SILO_BOUCHE; y < SILO_DALLE; y++) {
    for (let x = DE; x < DE + LARGE; x++) {
      const rel = (x - DE) / (LARGE - 1);
      const dy = y - SILO_BOUCHE;
      const b = m.beton;
      let couleur = rel < 0.06 ? b.fond : rel < 0.24 ? b.clair : rel < 0.66 ? b.fond : rel < 0.88 ? b.sombre : b.creux;
      const a = alea(x, y + 44);
      if (a < 0.05) couleur = b.tache;
      const coulure = alea(x, 23);
      if (coulure < 0.08 && dy > 4 && dy < 8 + coulure * 140) couleur = melanger(couleur, b.creux, 0.35);
      if (dy < 4) {
        const c = m.acier;
        couleur = dy === 0 ? c.clair : dy === 3 ? c.creux : rel < 0.24 ? c.clair : rel < 0.66 ? c.fond : c.sombre;
        if (dy === 2 && (x - DE) % 5 === 2) couleur = c.creux;
      }
      if (dy >= 21 && dy <= 24) couleur = melanger(Math.floor((x - DE + dy) / 4) % 2 === 0 ? m.jaune : m.noir, couleur, rel > 0.66 ? 0.35 : 0.1);
      P.poser(x, y, couleur);
    }
  }
  ecrire(P, SILO_MILIEU - 12, SILO_BOUCHE + 8, "GAL", m.bleuNuit, true);
  ecrire(P, SILO_MILIEU + 16, SILO_BOUCHE + 13, "01", m.bleuNuit);
  P.rect(SILO_MILIEU - 12, SILO_BOUCHE + 19, 24, 1, (x) => (x < SILO_MILIEU - 4 ? m.bleu : x < SILO_MILIEU + 4 ? m.blanc : m.rouge));
  // L'échelle, à gauche de la margelle, et sa crosse au-dessus du bord.
  echelle(P, m, DE + 5, SILO_BOUCHE - 5, SILO_DALLE - SILO_BOUCHE + 5);
  P.rect(DE + 5, SILO_BOUCHE - 6, 6, 1, m.acier.clair);
  // Deux évents en col de cygne, à droite.
  for (const x of [164, 174]) {
    P.rect(x, 92, 3, SILO_DALLE - 92, (i) => (i === x ? m.acier.clair : i === x + 2 ? m.acier.creux : m.acier.fond));
    P.rect(x, 89, 7, 3, (i, j) => (j === 89 ? m.acier.clair : i === x + 6 ? m.acier.creux : m.acier.fond));
    P.rect(x + 4, 92, 3, 3, (i, j) => (j === 94 ? m.noir : m.acier.sombre));
  }
  // Le panneau d'attention, et la barrière : un fût rayé, une lisse rouge et blanche baissée, sa fourche.
  panneau(P, m, 72, 62, SILO_DALLE);
  const BARRIERE = 214;
  P.rect(BARRIERE, 84, 5, SILO_DALLE - 84, (x, y) => (Math.floor((y - 84) / 4) % 2 === 0 ? (x === BARRIERE ? melanger(m.rouge, "#ffffff", 0.3) : m.rouge) : x === BARRIERE + 4 ? m.beton.fond : m.blanc));
  P.rect(BARRIERE - 1, 82, 7, 2, m.acier.creux);
  P.rect(BARRIERE + 5, 86, 7, 5, (x, y) => (y === 86 ? m.acier.clair : x === BARRIERE + 11 ? m.acier.creux : m.acier.sombre));
  P.rect(186, 87, 28, 2, (x, y) => (Math.floor((x - 186) / 5) % 2 === 0 ? (y === 87 ? melanger(m.rouge, "#ffffff", 0.25) : m.rouge) : y === 87 ? m.blanc : m.beton.fond));
  P.rect(186, 89, 1, SILO_DALLE - 89, m.acier.sombre);
  P.rect(185, 86, 3, 1, m.acier.clair);
  voyant(P, m, BARRIERE + 2, 80, VOYANT.rouge);

  // La trappe : deux vantaux d'acier épais, à charnière sur le bord, qui se lèvent lentement de 0 à 90 degrés.
  const angle = [0, 30, 60, 90][im] ?? 0;
  for (const sens of [1, -1] as const) {
    const charniere = SILO_MILIEU + (sens === 1 ? -23 : 24);
    // Le vérin : il pousse le vantail par-dessous.
    if (angle > 0) {
      const a = (angle * Math.PI) / 180;
      trait(P, charniere + sens * 9, SILO_BOUCHE - 1, Math.round(charniere + sens * 12 * Math.cos(a)), Math.round(SILO_BOUCHE - 12 * Math.sin(a)), m.acier.clair);
    }
    tourne(P, charniere, SILO_BOUCHE, angle, sens, 23, 6, (u, v) => {
      if (v === 5) return Math.floor(u / 3) % 2 === 0 ? m.jaune : m.noir;
      if (v === 0) return m.acier.creux;
      if (u === 22) return m.acier.creux;
      if (u === 0) return m.acier.sombre;
      if (v === 4) return m.acier.clair;
      if (u % 6 === 3 && v === 2) return m.acier.creux;
      return v === 1 ? m.acier.sombre : m.acier.fond;
    });
    // La charnière : un gros axe riveté.
    P.rect(charniere - 2, SILO_BOUCHE - 3, 4, 4, (x, y) => (x === charniere - 2 || y === SILO_BOUCHE - 3 ? m.acier.clair : m.acier.creux));
  }
  // La lumière du projecteur sur la margelle, la nuit.
  halo(P, SILO_MILIEU - 22, SILO_BOUCHE + 6, 34, m.lueur * 0.7, AMPOULE);
  return P.decor();
}

/* ------------------------------------------------------------------ Le missile ------------------------------------------------------------------ */

const MISSILE_L = 24;
/** Le corps du missile, de la pointe à la tuyère ; dessous, les rangées de sa flamme. */
const MISSILE_CORPS = 86;
const MISSILE_FLAMME = 28;
const MISSILE_H = MISSILE_CORPS + MISSILE_FLAMME;

function dessinerMissile(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const P = new Planche(MISSILE_L, MISSILE_H);
  const blancVif = m.t("#ffffff");
  const gris = m.t("#c2c5cc");
  const grisSombre = m.t("#989ca8");
  /** La teinte d'une colonne du fût, de 6 à 17 : le reflet à gauche, l'ombre à droite. */
  const fut = (x: number, clair: string, fond: string, sombre: string, creux: string): string => (x <= 6 ? fond : x <= 8 ? clair : x <= 13 ? fond : x <= 15 ? sombre : creux);
  const peint = (x: number, couleur: string): string => fut(x, melanger(couleur, "#ffffff", 0.35), couleur, melanger(couleur, m.noir, 0.3), melanger(couleur, m.noir, 0.5));

  // L'ogive : bleue, la pointe d'acier.
  for (let y = 0; y < 20; y++) {
    const demi = Math.max(1, Math.round(6 * Math.sqrt(1 - Math.pow((19 - y) / 20, 2))));
    for (let x = 12 - demi; x < 12 + demi; x++) {
      const rel = (x - (12 - demi)) / Math.max(1, demi * 2 - 1);
      const base = y < 3 ? m.acier.fond : m.bleu;
      P.poser(x, y, rel < 0.15 ? base : rel < 0.38 ? melanger(base, "#ffffff", 0.4) : rel < 0.7 ? base : melanger(base, m.noir, rel < 0.88 ? 0.3 : 0.5));
    }
  }
  // Le fût.
  for (let y = 20; y < 78; y++) {
    for (let x = 6; x <= 17; x++) {
      let couleur: string;
      if (y < 22) couleur = peint(x, m.bleuNuit);
      else if (y >= 24 && y < 30) couleur = peint(x, y < 26 ? m.bleu : y < 28 ? blancVif : m.rouge);
      else if (y >= 60 && y < 63) couleur = peint(x, m.rouge);
      else if (y >= 66) couleur = peint(x, m.bleuNuit);
      else couleur = fut(x, blancVif, m.blanc, gris, grisSombre);
      // Les joints des viroles et leurs rivets.
      if (y === 32 || y === 57 || y === 65) couleur = melanger(couleur, m.noir, 0.3);
      if ((y === 34 || y === 55) && x % 2 === 1) couleur = melanger(couleur, m.noir, 0.22);
      P.poser(x, y, couleur);
    }
  }
  ecrireDebout(P, 10, 36, "GAL", m.bleuNuit);
  // Une trappe de visite, et un filet blanc sur la jupe.
  P.rect(13, 45, 3, 5, (x, y) => (x === 13 || y === 45 ? grisSombre : gris));
  P.rect(6, 69, 12, 1, (x) => peint(x, blancVif));
  // Les deux ailerons : bleus, le bout rouge.
  for (let y = 58; y < 82; y++) {
    const large = Math.min(6, Math.round((y - 58) / 2.6));
    for (let i = 1; i <= large; i++) {
      const bout = i === large || y >= 79;
      P.poser(6 - i, y, bout ? melanger(m.rouge, "#ffffff", 0.15) : i === 1 ? melanger(m.bleu, "#ffffff", 0.3) : m.bleu);
      P.poser(17 + i, y, bout ? melanger(m.rouge, m.noir, 0.25) : melanger(m.bleu, m.noir, i === 1 ? 0.15 : 0.35));
    }
  }
  // La tuyère : une cloche d'acier sombre.
  for (let y = 78; y < MISSILE_CORPS; y++) {
    const demi = 4 + Math.floor((y - 78) / 3);
    for (let x = 12 - demi; x < 12 + demi; x++) {
      const rel = (x - (12 - demi)) / (demi * 2 - 1);
      P.poser(x, y, y === 78 ? m.acier.creux : rel < 0.25 ? m.acier.fond : rel < 0.45 ? m.acier.clair : rel < 0.75 ? m.acier.sombre : m.acier.creux);
    }
  }

  // La flamme de départ : une goutte douce, deux images qui diffèrent à peine. Elle éclaire : ses couleurs sont fixes.
  const autre = image % 2 !== 0;
  const long = autre ? MISSILE_FLAMME - 3 : MISSILE_FLAMME;
  for (let r = 0; r < long; r++) {
    const part = r / (long - 1);
    const demi = (autre ? 5.2 : 5.6) * Math.min(1, 0.7 + r / 6) * Math.pow(1 - part, 0.75);
    const milieu = 12 + (autre ? 0.5 : -0.3) * part * 2;
    for (let x = 4; x < 20; x++) {
      const d = Math.abs(x + 0.5 - milieu) / (demi + 0.01);
      if (d >= 1) continue;
      const chaud = (1 - d * d) * (1 - 0.75 * part);
      if (part > 0.6 && (x + r + (autre ? 1 : 0)) % 2 === 0 && chaud < 0.3) continue;
      P.poser(x, MISSILE_CORPS + r, chaud > 0.62 ? "#fff1a8" : chaud > 0.4 ? "#ffd75a" : chaud > 0.2 ? "#f58a1f" : "#e2452a");
    }
  }
  return P.decor();
}

/* ------------------------------------------------------------------ La batterie ------------------------------------------------------------------ */

const BATTERIE_L = 250;
const BATTERIE_H = 132;
/** Les images du repos : l'antenne du radar fait un demi-tour. Les images 4 à 7 sont celles du tir, à demander exprès. */
const BATTERIE_IMAGES = 4;
const BATTERIE_TIR = 4;
/** L'axe de l'antenne du radar : la colonne du mât, la rangée du milieu de l'antenne. */
const RADAR = { x: 206, y: 28 };
/** La rampe : son pivot, son angle en degrés, et le milieu de la bouche du tube du haut, d'où part la fusée. */
const BATTERIE_PIVOT = { x: 142, y: 97 };
const BATTERIE_ANGLE = 26;
const BATTERIE_BOUCHE = { x: 74, y: 40 };
/** Un damier de seuils, pour défaire une fumée sans rien tirer au hasard. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Une bouffée de fumée ronde, qui se défait en damier quand `dissipe` monte de 0 à 1. */
function bouffee(P: Planche, c: Tons, cx: number, cy: number, r: number, dissipe = 0): void {
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  P.disque(x0, y0, r, (dx, dy) => {
    const seuil = ((BAYER[((y0 + dy) & 3) * 4 + ((x0 + dx) & 3)] ?? 0) + 0.5) / 16;
    if (seuil < dissipe) return null;
    return dx + dy < -r * 0.5 ? c.clair : dx + dy > r * 0.7 ? c.sombre : c.fond;
  });
}

/**
 * Le tir de la batterie, en quatre images : le bouchon du tube du haut saute et la fusée pointe, elle sort sur sa flamme,
 * elle file vers le haut à gauche, puis il ne reste que la fumée qui se défait. Rien de blanc ni de brusque.
 */
function poserTir(P: Planche, m: Matieres, tir: number): void {
  const a = (BATTERIE_ANGLE * Math.PI) / 180;
  const ux = -Math.cos(a);
  const uy = -Math.sin(a);
  const { x: bx, y: by } = BATTERIE_BOUCHE;
  // Le tube ouvert : son fond noir.
  tourne(P, BATTERIE_PIVOT.x, BATTERIE_PIVOT.y, BATTERIE_ANGLE, -1, 86, 28, (u, v) => (u >= 82 && v >= 16 && v <= 25 ? m.noir : null));
  // La fumée de l'arrière, puis celle de la bouche.
  const arriere = { x: BATTERIE_PIVOT.x + 12, y: BATTERIE_PIVOT.y - 30 };
  if (tir === 1) {
    bouffee(P, m.fumee, arriere.x, arriere.y, 6);
    bouffee(P, m.fumee, bx + 3, by - 5, 5);
  } else if (tir === 2) {
    bouffee(P, m.fumee, arriere.x + 5, arriere.y - 4, 9);
    bouffee(P, m.fumee, arriere.x - 3, arriere.y + 4, 6);
    bouffee(P, m.fumee, bx + 2, by - 7, 7);
    bouffee(P, m.fumee, bx + ux * 12, by + uy * 12 - 3, 6);
    bouffee(P, m.fumee, bx + ux * 24, by + uy * 24 - 1, 4);
  } else if (tir === 3) {
    bouffee(P, m.fumee, arriere.x + 9, arriere.y - 10, 10, 0.5);
    bouffee(P, m.fumee, bx + 4, by - 13, 9, 0.45);
    bouffee(P, m.fumee, bx + ux * 14, by + uy * 14 - 8, 8, 0.55);
    bouffee(P, m.fumee, bx + ux * 30, by + uy * 30 - 5, 6, 0.65);
    bouffee(P, m.fumee, bx + ux * 46, by + uy * 46 - 3, 4, 0.75);
  }
  // La fusée : blanche, la pointe rouge, l'empennage bleu nuit. `sortie` : où est sa queue, le long de l'axe du tube.
  const sortie = [-9, 6, 36][tir];
  if (sortie === undefined) return;
  const qx = bx + ux * sortie;
  const qy = by + uy * sortie;
  if (tir > 0) {
    for (let i = 3; i >= 1; i--) P.disque(Math.round(qx - ux * i * 4), Math.round(qy - uy * i * 4), 4 - i, i === 1 ? "#ffd75a" : i === 2 ? "#f58a1f" : "#e2452a");
    P.disque(Math.round(qx - ux * 3), Math.round(qy - uy * 3), 1, "#ffe27a");
  }
  tourne(P, qx - Math.sin(a) * 2.5, qy + Math.cos(a) * 2.5, BATTERIE_ANGLE, -1, 19, 5, (u, v) => {
    if (u < -sortie) return null;
    if (u >= 17 && (v === 0 || v === 4)) return null;
    if (u >= 15) return v >= 3 ? melanger(m.rouge, "#ffffff", 0.3) : m.rouge;
    if (u < 3) return m.bleuNuit;
    if (u === 9) return m.bleu;
    return v === 4 ? m.t("#ffffff") : v === 0 ? m.t("#b4b8c2") : m.blanc;
  });
}

function dessinerBatterie(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const P = new Planche(BATTERIE_L, BATTERIE_H);
  const im = ((image % BATTERIE_IMAGES) + BATTERIE_IMAGES) % BATTERIE_IMAGES;
  /** Le tir : -1 au repos, puis 0 à 3 pour les images 4 à 7. */
  const tir = image >= BATTERIE_IMAGES ? Math.min(BATTERIE_TIR - 1, image - BATTERIE_IMAGES) : -1;
  const BAS = BATTERIE_H - 1;
  const c = m.marine;

  // Le camion. Les vérins de calage, derrière les roues.
  for (const x of [82, 148]) {
    P.rect(x, 106, 4, 22, (i) => (i === x ? m.acier.clair : i === x + 3 ? m.acier.creux : m.acier.fond));
    P.rect(x - 4, 128, 12, 4, (_i, j) => (j === 128 ? m.acier.clair : m.acier.sombre));
  }
  // Le berceau de la rampe et son vérin de levage.
  P.rect(92, 92, 60, 8, (x, y) => (y === 92 ? c.clair : y === 99 ? c.creux : (x - 92) % 10 === 9 ? c.sombre : c.fond));
  for (let k = 0; k < 4; k++) trait(P, 102 + k, 98, 94 + k, 74, k === 0 ? m.acier.clair : k === 3 ? m.acier.creux : m.acier.fond);
  // La rampe : un caisson de deux tubes couchés, levé de 26 degrés, les bouchons fermés.
  tourne(P, BATTERIE_PIVOT.x, BATTERIE_PIVOT.y, BATTERIE_ANGLE, -1, 86, 28, (u, v) => {
    if (v === 0 || u === 0) return c.creux;
    if (v === 27) return c.clair;
    // Les bouchons des tubes, au bout : blancs, cerclés de rouge.
    if (u >= 82) {
      const dans = v < 14 ? v : v - 13;
      return dans <= 1 || dans >= 12 ? c.creux : u === 85 ? m.rouge : dans <= 3 || dans >= 10 ? m.rouge : m.blanc;
    }
    if (v === 13 || v === 14) return v === 13 ? c.clair : c.creux;
    if (u % 14 === 13) return c.creux;
    if (u % 14 === 0) return c.clair;
    // Le filet tricolore et le pochoir, près de l'arrière.
    if (u >= 6 && u < 12 && v >= 17 && v <= 24) return u < 8 ? m.bleu : u < 10 ? m.blanc : m.rouge;
    if (u % 14 === 7 && (v === 4 || v === 10 || v === 18 || v === 24)) return c.clair;
    const haut = v > 14;
    if (v === 26 || v === 12) return melanger(c.fond, c.clair, 0.5);
    if (v === 1 || v === 15) return c.sombre;
    return haut ? c.fond : melanger(c.fond, c.sombre, 0.45);
  });
  if (tir >= 0) poserTir(P, m, tir);
  // Le pivot de la rampe.
  P.rect(134, 84, 16, 16, (x, y) => {
    const dx = x - 134;
    const dy = y - 84;
    if (dx + dy < 8) return null;
    return dx + dy === 8 ? c.clair : dx === 15 || dy === 15 ? c.creux : c.sombre;
  });
  P.disque(142, 93, 3, (dx, dy) => (dx * dx + dy * dy <= 1 ? m.acier.creux : dx + dy < 0 ? m.acier.clair : m.acier.sombre));

  // Le châssis.
  P.rect(8, 100, 144, 9, (x, y) => (y === 100 ? m.acier.fond : y === 108 ? m.acier.creux : (x - 8) % 16 === 15 ? m.acier.creux : y === 101 ? m.acier.sombre : melanger(m.acier.sombre, m.acier.creux, 0.5)));
  rivets(P, m.acier, 12, 104, 136, 8);
  // Le coffre des groupes, derrière la cabine : ses ouïes, ses voyants ; le pot d'échappement.
  plaque(P, c, 50, 74, 28, 26);
  P.rect(53, 78, 13, 12, (x, y) => (y === 78 || x === 53 ? c.creux : (y - 78) % 2 === 0 ? c.sombre : c.clair));
  voyant(P, m, 70, 79, VOYANT.vert);
  voyant(P, m, 74, 79, VOYANT.ambre);
  P.rect(68, 85, 8, 10, (x, y) => (x === 68 || y === 85 ? c.creux : c.sombre));
  P.rect(74, 89, 1, 3, m.acier.clair);
  rivets(P, c, 52, 97, 24, 4);
  P.rect(46, 58, 3, 42, (x) => (x === 46 ? m.acier.clair : x === 48 ? m.acier.creux : m.acier.sombre));
  P.rect(45, 56, 5, 2, m.acier.creux);

  // La cabine : le pare-brise incliné vers l'avant, la portière, le pochoir du clan.
  for (let y = 62; y < 100; y++) {
    const avant = y < 82 ? 8 + Math.round((82 - y) * 0.45) : 8;
    for (let x = avant; x < 45; x++) {
      let couleur = y === 62 ? c.clair : x === avant ? c.clair : x === 44 ? c.creux : c.fond;
      if (y >= 96) couleur = y === 96 ? c.creux : c.sombre;
      P.poser(x, y, couleur);
    }
    // Le pare-brise, puis la vitre de la portière.
    if (y >= 66 && y < 82) {
      for (let x = avant + 2; x < avant + 9; x++) P.poser(x, y, y === 66 || x === avant + 8 ? c.creux : (x + y) % 9 < 2 ? m.t("#b8d4e6") : m.t("#7fa6c4"));
    }
  }
  P.rect(25, 66, 15, 15, (x, y) => (x === 25 || y === 66 ? c.creux : x === 39 || y === 80 ? c.clair : (x - y + 60) % 9 < 2 ? m.t("#b8d4e6") : m.t("#7fa6c4")));
  P.rect(23, 64, 1, 32, c.sombre);
  P.rect(41, 64, 1, 32, c.sombre);
  P.rect(37, 84, 3, 1, m.acier.clair);
  ecrire(P, 26, 86, "GAL", m.blanc);
  P.rect(10, 93, 34, 2, (x) => ((x - 10) % 34 < 11 ? m.bleu : (x - 10) % 34 < 23 ? m.blanc : m.rouge));
  // Le rétroviseur, le phare et sa lueur, le pare-chocs, le marchepied, le feu du toit.
  P.rect(13, 70, 2, 6, m.acier.creux);
  P.rect(15, 72, 2, 1, m.acier.sombre);
  P.rect(8, 86, 3, 5, melanger(m.t("#e8e4c8"), AMPOULE, m.lueur));
  halo(P, 8, 88, 12, m.lueur, AMPOULE);
  P.rect(8, 86, 3, 1, m.acier.creux);
  P.rect(4, 102, 10, 6, (x, y) => (y === 102 ? m.acier.clair : x === 4 ? m.acier.fond : m.acier.sombre));
  P.rect(24, 108, 14, 2, m.acier.sombre);
  P.rect(30, 59, 6, 3, (x, y) => (y === 59 ? m.acier.clair : x === 30 || x === 35 ? m.acier.sombre : VOYANT.ambre));
  // Les quatre roues et leurs garde-boue.
  for (const x of [28, 54, 106, 132]) {
    for (let dx = -13; dx <= 13; dx++) {
      const haut = 108 - Math.round(Math.sqrt(Math.max(0, 13 * 13 - dx * dx)) * 0.28);
      P.poser(x + dx, haut, c.clair);
      P.poser(x + dx, haut + 1, c.creux);
    }
    roue(P, m, x, BAS - 11, 11);
  }

  // Le câble, du camion au radar : il pend, puis court au sol.
  for (let x = 152; x <= 184; x++) {
    const part = (x - 152) / 32;
    P.poser(x, Math.min(BAS, Math.round(108 + 46 * part * (1 - part) * 2 + 8 * part)), m.noir);
  }

  // Le radar : une cabine sur vérins, sa flèche d'attelage, sa roue.
  const CAB = { x: 180, y: 90, l: 54, h: 28 };
  for (const x of [184, 226]) {
    P.rect(x, CAB.y + CAB.h, 3, BAS - CAB.y - CAB.h - 2, (i) => (i === x ? m.acier.clair : i === x + 2 ? m.acier.creux : m.acier.fond));
    P.rect(x - 4, BAS - 3, 11, 4, (_i, j) => (j === BAS - 3 ? m.acier.clair : m.acier.sombre));
  }
  roue(P, m, 206, BAS - 7, 7);
  P.rect(164, 114, 17, 3, (_x, y) => (y === 114 ? m.acier.clair : y === 116 ? m.acier.creux : m.acier.fond));
  P.rect(165, 117, 2, 12, m.acier.sombre);
  P.rect(162, 129, 8, 3, (_x, y) => (y === 129 ? m.acier.clair : m.acier.sombre));
  plaque(P, c, CAB.x, CAB.y, CAB.l, CAB.h);
  rivets(P, c, CAB.x + 2, CAB.y + 2, CAB.l - 3, 5);
  rivets(P, c, CAB.x + 2, CAB.y + CAB.h - 3, CAB.l - 3, 5);
  // Sa porte et son hublot, son pupitre de voyants, ses ouïes, le pochoir.
  P.rect(CAB.x + 4, CAB.y + 5, 14, 20, (x, y) => (x === CAB.x + 4 || y === CAB.y + 5 ? c.creux : x === CAB.x + 17 || y === CAB.y + 24 ? c.clair : c.sombre));
  P.rect(CAB.x + 7, CAB.y + 8, 8, 6, (x, y) => (x === CAB.x + 7 || y === CAB.y + 8 ? c.creux : melanger(m.t("#7fa6c4"), "#ffd98a", m.lueur)));
  P.rect(CAB.x + 15, CAB.y + 16, 1, 4, m.acier.clair);
  P.rect(CAB.x + 22, CAB.y + 6, 15, 9, (x, y) => (x === CAB.x + 22 || y === CAB.y + 6 ? c.creux : m.noir));
  voyant(P, m, CAB.x + 26, CAB.y + 10, VOYANT.vert);
  voyant(P, m, CAB.x + 30, CAB.y + 10, VOYANT.vert);
  voyant(P, m, CAB.x + 34, CAB.y + 10, VOYANT.ambre);
  P.rect(CAB.x + 40, CAB.y + 6, 10, 14, (x, y) => (x === CAB.x + 40 || y === CAB.y + 6 ? c.creux : (y - CAB.y) % 2 === 0 ? c.sombre : c.clair));
  ecrire(P, CAB.x + 23, CAB.y + 18, "GAL", m.blanc);
  ecrire(P, CAB.x + 36, CAB.y + 18, "2", m.blanc);
  // Le socle, le mât, la couronne qui tourne.
  P.rect(RADAR.x - 9, CAB.y - 7, 19, 7, (x, y) => (y === CAB.y - 7 ? m.acier.clair : x === RADAR.x + 9 ? m.acier.creux : x > RADAR.x + 3 ? m.acier.sombre : m.acier.fond));
  P.rect(RADAR.x - 2, 50, 5, CAB.y - 57, (x, y) => (x === RADAR.x - 2 ? m.acier.clair : x === RADAR.x + 2 ? m.acier.creux : (y - 50) % 9 === 8 ? m.acier.sombre : m.acier.fond));
  P.rect(RADAR.x - 5, 46, 11, 4, (x, y) => (y === 46 ? m.acier.clair : y === 49 ? m.acier.creux : x > RADAR.x + 1 ? m.acier.sombre : m.acier.fond));

  // L'antenne : un grand treillis à claire-voie qui tourne d'un huitième de tour par image. De face, de trois quarts, de
  // profil, de trois quarts : la demi-révolution suivante se voit pareille, le treillis étant le même des deux côtés.
  const demiL = [23, 16, 2, 16][im] ?? 23;
  const penche = im === 1 ? 1 : im === 3 ? -1 : 0;
  for (let dx = -demiL; dx <= demiL; dx++) {
    // De trois quarts, le bord le plus proche paraît plus haut.
    const demiH = 16 - (penche === 0 ? 0 : Math.round(((penche === 1 ? dx + demiL : demiL - dx) / (2 * demiL)) * 3));
    const u = demiL <= 2 ? 0 : Math.round((dx / demiL) * 23);
    const uAvant = demiL <= 2 ? 0 : Math.round(((dx - 1) / demiL) * 23);
    for (let dy = -demiH; dy <= demiH; dy++) {
      const bord = Math.abs(dx) === demiL || Math.abs(dy) === demiH;
      const coin = Math.abs(dx) > demiL - 3 && Math.abs(dy) > demiH - 3 && Math.abs(dx) - demiL + Math.abs(dy) - demiH > -3;
      if (coin && demiL > 2) continue;
      let couleur: string | null;
      if (demiL <= 2) couleur = dx === -demiL ? m.acier.clair : dx === demiL ? m.acier.creux : dy % 6 === 0 ? m.acier.sombre : m.acier.fond;
      else if (bord) couleur = dx < 0 || dy < 0 ? m.acier.clair : m.acier.sombre;
      else if (dy % 8 === 0 || Math.floor(u / 8) !== Math.floor(uAvant / 8) || (u === 0 && uAvant !== 0)) couleur = m.acier.fond;
      else couleur = (dx + dy) % 2 === 0 ? m.acier.sombre : null;
      if (couleur !== null) P.poser(RADAR.x + dx, RADAR.y + dy, couleur);
    }
  }
  // Le cornet, au bout de son bras, devant le treillis : il tourne avec lui.
  const cornet = [0, -11, -15, -11][im] ?? 0;
  if (cornet !== 0) for (let i = 0; i <= -cornet; i++) P.poser(RADAR.x - i, RADAR.y + 12 - Math.round((i * 12) / -cornet), m.acier.creux);
  P.rect(RADAR.x + cornet - 3, RADAR.y - 3, 6, 6, (x, y) => (x === RADAR.x + cornet - 3 || y === RADAR.y - 3 ? melanger(m.bleuNuit, "#ffffff", 0.3) : m.bleuNuit));
  P.rect(RADAR.x + cornet - 1, RADAR.y - 1, 2, 2, m.rouge);
  // Le pied de l'antenne, entre le treillis et la couronne.
  P.rect(RADAR.x - 1, RADAR.y + 16, 3, 46 - RADAR.y - 16, m.acier.sombre);
  return P.decor();
}

/* ------------------------------------------------------------------ Le poste de défense ------------------------------------------------------------------ */

const POSTE_L = 210;
const POSTE_H = 136;
const POSTE_IMAGES = 4;

function dessinerPoste(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const P = new Planche(POSTE_L, POSTE_H);
  const im = ((image % POSTE_IMAGES) + POSTE_IMAGES) % POSTE_IMAGES;
  const BAS = POSTE_H - 1;
  const MUR = { x: 44, y: 62, l: 117 };
  const DALLE = { x: 38, y: 50, l: 129, h: 12 };

  // L'antenne fouet et son hauban, derrière le bunker.
  P.rect(160, 12, 1, 40, m.acier.sombre);
  P.poser(160, 11, m.acier.clair);
  trait(P, 160, 24, 150, 50, m.acier.sombre);

  // Le bunker : un mur de béton épais, la dalle du toit qui déborde, son ombre.
  beton(P, m, MUR.x, MUR.y, MUR.l, BAS - MUR.y + 1, 2);
  P.rect(MUR.x + MUR.l - 5, MUR.y, 5, BAS - MUR.y + 1, (x, y) => melanger(P.lire(x, y) ?? m.beton.fond, m.beton.creux, 0.2 + 0.1 * (x - MUR.x - MUR.l + 5)));
  P.rect(MUR.x, MUR.y, 2, BAS - MUR.y + 1, (x, y) => melanger(P.lire(x, y) ?? m.beton.fond, m.beton.clair, 0.6));
  beton(P, m, DALLE.x, DALLE.y, DALLE.l, DALLE.h, 6);
  P.rect(DALLE.x + DALLE.l - 4, DALLE.y + 1, 4, DALLE.h - 1, (x, y) => melanger(P.lire(x, y) ?? m.beton.fond, m.beton.creux, 0.4));
  voiler(P, MUR.x, MUR.y, MUR.l, 4, m.beton.creux, 0.45);
  // Un peu de mousse au pied et sous la dalle.
  for (let x = MUR.x; x < MUR.x + MUR.l; x++) {
    const h = Math.floor(alea(x >> 1, 71) * 4);
    for (let y = BAS - h; y <= BAS; y++) if (alea(x, y) < 0.7) P.poser(x, y, melanger(P.lire(x, y) ?? m.beton.fond, m.t("#6f8a4a"), 0.6));
  }

  // Le créneau : une longue fente noire dans un ébrasement, sous son linteau d'acier riveté.
  const FENTE = { x: 56, y: 82, l: 58, h: 8 };
  P.rect(FENTE.x - 3, FENTE.y - 3, FENTE.l + 6, FENTE.h + 6, (x, y) => {
    const dx = Math.min(x - FENTE.x + 3, FENTE.x + FENTE.l + 2 - x);
    const dy = Math.min(y - FENTE.y + 3, FENTE.y + FENTE.h + 2 - y);
    const d = Math.min(dx, dy);
    if (d >= 3) return melanger(m.t("#1a1c22"), "#3a2c1c", m.lueur * 0.5);
    return y < FENTE.y ? m.beton.creux : y >= FENTE.y + FENTE.h ? m.beton.clair : x < FENTE.x ? m.beton.sombre : m.beton.sombre;
  });
  P.rect(FENTE.x - 5, FENTE.y - 7, FENTE.l + 10, 4, (_x, y) => (y === FENTE.y - 7 ? m.acier.clair : y === FENTE.y - 4 ? m.acier.creux : m.acier.fond));
  rivets(P, m.acier, FENTE.x - 3, FENTE.y - 5, FENTE.l + 6, 6);
  // Une longue-vue sur son pied dépasse de la fente : on guette, rien de plus.
  P.rect(FENTE.x + 20, FENTE.y + 3, 9, 2, (x) => (x === FENTE.x + 20 ? m.t("#9cc4dc") : m.acier.sombre));
  // Le pochoir du clan sous le créneau, et la bouche d'aération.
  ecrire(P, 60, 98, "GAL", m.bleuNuit, true);
  P.rect(86, 99, 9, 8, (x, y) => (y >= 106 ? null : x < 89 ? m.bleu : x < 92 ? m.blanc : m.rouge));
  ecrire(P, 100, 103, "01", m.bleuNuit);
  P.rect(100, 114, 13, 8, (x, y) => (x === 100 || y === 114 ? m.acier.creux : x === 112 || y === 121 ? m.acier.clair : (y - 114) % 2 === 0 ? m.acier.sombre : m.acier.fond));

  // La porte blindée : son cadre, ses rivets, son volant, son judas ; la lanterne à côté.
  const PORTE = { x: 127, y: 64, l: 24 };
  P.rect(PORTE.x - 2, PORTE.y - 2, PORTE.l + 4, BAS - PORTE.y + 3, (x, y) => (y === PORTE.y - 2 ? m.acier.clair : x === PORTE.x - 2 ? m.acier.fond : m.acier.creux));
  plaque(P, m.acier, PORTE.x, PORTE.y, PORTE.l, BAS - PORTE.y + 1);
  P.rect(PORTE.x + 1, PORTE.y + 1, PORTE.l - 2, BAS - PORTE.y - 1, (x, y) => (alea(x, y + 14) < 0.05 ? m.acier.fond : melanger(m.acier.fond, m.acier.sombre, 0.55)));
  rivetsDebout(P, m.acier, PORTE.x + 2, PORTE.y + 3, 66, 6);
  rivetsDebout(P, m.acier, PORTE.x + PORTE.l - 4, PORTE.y + 3, 66, 6);
  P.rect(PORTE.x + 8, PORTE.y + 8, 8, 4, (x, y) => (y === PORTE.y + 8 || x === PORTE.x + 8 ? m.acier.creux : melanger(m.t("#30343c"), "#ffd98a", m.lueur * 0.8)));
  P.disque(PORTE.x + 12, PORTE.y + 34, 5, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d <= 2) return m.acier.creux;
    if (d >= 17) return dx + dy < 0 ? m.acier.clair : m.acier.creux;
    return dx === 0 || dy === 0 ? m.acier.clair : null;
  });
  for (const y of [PORTE.y + 6, PORTE.y + 58]) P.rect(PORTE.x - 1, y, 4, 6, (x, j) => (j === y ? m.acier.clair : x === PORTE.x + 2 ? m.acier.creux : m.acier.sombre));
  bandes(P, m, PORTE.x + 1, BAS - 5, PORTE.l - 2, 4, 3);
  lampe(P, m, 153, 68);

  // Sur le toit : un mur de sacs de sable en créneaux, la coupole du guetteur, le projecteur.
  sacs(P, m, 40, DALLE.y, 72, 2, 0, true);
  const COUPOLE = { x: 126, r: 11 };
  P.disque(COUPOLE.x, DALLE.y, COUPOLE.r, (dx, dy) => {
    if (dy > -1) return null;
    const d = Math.sqrt(dx * dx + dy * dy) / COUPOLE.r;
    if (dy >= -6 && dy <= -5 && dx > -8 && dx < 8) return melanger(m.t("#1a1c22"), "#3a2c1c", m.lueur * 0.5);
    if (d > 0.88) return dx - dy * -1 < -2 ? m.acier.clair : m.acier.creux;
    return dx + dy < -8 ? m.acier.clair : dx > 4 ? m.acier.sombre : m.acier.fond;
  });
  rivets(P, m.acier, COUPOLE.x - 9, DALLE.y - 2, 19, 4);
  // Le projecteur, sur son trépied, tourné vers la droite.
  trait(P, 150, DALLE.y - 1, 153, DALLE.y - 9, m.acier.sombre);
  trait(P, 157, DALLE.y - 1, 154, DALLE.y - 9, m.acier.creux);
  P.rect(149, DALLE.y - 18, 10, 9, (x, y) => (y === DALLE.y - 18 || x === 149 ? m.acier.clair : y === DALLE.y - 10 ? m.acier.creux : m.acier.sombre));
  P.rect(159, DALLE.y - 17, 2, 7, melanger(m.t("#dcdccc"), AMPOULE, m.lueur));

  // Le mât et le drapeau du clan : bleu nuit, un guindant tricolore, un anneau blanc. Il ondule lentement.
  const MAT = 112;
  P.rect(MAT, 3, 2, DALLE.y - 3, (x) => (x === MAT ? m.acier.clair : m.acier.sombre));
  P.rect(MAT - 1, 1, 4, 2, m.laiton.fond);
  P.rect(MAT - 2, DALLE.y - 3, 6, 3, (_x, y) => (y === DALLE.y - 3 ? m.acier.clair : m.acier.creux));
  const phase = (2 * Math.PI * im) / POSTE_IMAGES;
  for (let i = 0; i < 36; i++) {
    const onde = Math.sin(i / 5.5 - phase);
    const dy = Math.round(onde * (0.4 + i / 20));
    const pente = Math.cos(i / 5.5 - phase);
    for (let j = 0; j < 22; j++) {
      const d = Math.hypot(i - 23.5, j - 10.5);
      let couleur = i < 4 ? m.bleu : i < 8 ? m.blanc : i < 12 ? m.rouge : d > 4.6 && d < 6.8 ? m.blanc : m.bleuNuit;
      if (j === 0) couleur = melanger(couleur, "#ffffff", 0.15);
      couleur = pente > 0.45 ? melanger(couleur, "#ffffff", 0.14) : pente < -0.45 ? melanger(couleur, m.noir, 0.22) : couleur;
      P.poser(MAT + 2 + i, 5 + j + dy, couleur);
    }
  }

  // Devant, à gauche : le mur de sacs de sable, cinq lits en retrait.
  sacs(P, m, 0, BAS + 1, 90, 5, 3);
  // À droite : des caisses, un bidon, le fil du téléphone de campagne.
  caisse(P, m, 170, BAS - 9, false);
  caisse(P, m, 185, BAS - 9, false);
  caisse(P, m, 177, BAS - 19, false);
  P.rect(201, BAS - 12, 8, 13, (x, y) => (y === BAS - 12 ? (x > 203 ? m.acier.clair : null) : x === 201 ? m.t("#7c9a5c") : x === 208 ? m.t("#3c5230") : y === BAS ? m.t("#3c5230") : (x + y) % 5 === 0 ? m.t("#4f6b3c") : m.t("#5f7f48")));
  for (let x = 152; x < 170; x++) P.poser(x, BAS - Math.round(3 * Math.sin(((x - 152) / 18) * Math.PI)), m.noir);
  return P.decor();
}

/* ------------------------------------------------------------------ La ville lointaine ------------------------------------------------------------------ */

const VILLE_L = 480;
const VILLE_H = 110;

interface Brume {
  fond: string;
  clair: string;
  vitre: string;
  allumee: string;
}

/** Une tour de la ville, posée sur le bas du dessin. `sorte` : son sommet (plat, à gradins, à flèche, en pente, en dôme). */
function tour(P: Planche, x: number, large: number, haut: number, sorte: number, c: Brume, part: number, graine: number): void {
  const sommet = VILLE_H - haut;
  P.rect(x, sommet, large, haut, (i) => (i === x ? c.clair : c.fond));
  if (sorte === 1 || sorte === 2) {
    const retrait = Math.min(3, Math.floor(large / 4));
    P.rect(x + retrait, sommet - 5, large - retrait * 2, 5, (i) => (i === x + retrait ? c.clair : c.fond));
    if (sorte === 2) {
      P.rect(x + Math.floor(large / 2), sommet - 16, 1, 11, c.fond);
      // Le feu de balisage, fixe.
      P.poser(x + Math.floor(large / 2), sommet - 17, melanger(c.fond, VOYANT.rouge, part * 0.8));
    }
  } else if (sorte === 3) {
    for (let r = 1; r <= Math.min(8, large - 1); r++) P.rect(x, sommet - r, Math.max(1, large - Math.round((r * large) / Math.min(8, large - 1))), 1, (i) => (i === x ? c.clair : c.fond));
  } else if (sorte === 4) {
    const r = Math.floor(large / 2);
    for (let dy = 1; dy <= r; dy++) {
      const demi = Math.round(Math.sqrt(r * r - dy * dy));
      P.rect(x + r - demi, sommet - dy, demi * 2 + (large % 2), 1, (i) => (i === x + r - demi ? c.clair : c.fond));
    }
  }
  // Les fenêtres : à peine marquées le jour, quelques-unes allumées la nuit.
  for (let wy = sommet + 3; wy < VILLE_H - 6; wy += 4) {
    for (let wx = x + 2; wx < x + large - 1; wx += 3) {
      const a = alea(wx + graine, wy);
      if (a < 0.13) P.poser(wx, wy, c.allumee);
      else if (a < 0.6) P.poser(wx, wy, c.vitre);
    }
  }
}

function dessinerVille(l: Lumiere): Decor {
  const P = new Planche(VILLE_L, VILLE_H);
  const lueur = Math.min(1, Math.max(0, (0.8 - l.jour) / 0.5));
  const c = (deJour: string, deNuit: string): string => couleurDuDehors(deJour, deNuit, l);
  const brume = (fond: [string, string], clair: [string, string], vitre: [string, string], force: number): Brume => {
    const f = c(...fond);
    return { fond: f, clair: c(...clair), vitre: c(...vitre), allumee: melanger(c(...vitre), "#f2cc80", lueur * force) };
  };
  // Trois plans, du plus loin (presque la couleur du ciel) au plus proche.
  const loin = brume(["#a9c8e6", "#1a2a5a"], ["#b6d2ec", "#1e3062"], ["#a0c0e0", "#1d2e60"], 0.45);
  const milieu = brume(["#93b6da", "#172653"], ["#a3c3e2", "#1c2d5e"], ["#88acd2", "#1b2b5a"], 0.65);
  const pres = brume(["#7ea3cc", "#111d47"], ["#90b2d6", "#172552"], ["#7499c4", "#16244f"], 0.85);
  /** La ville est plus haute en son cœur, et vers un second quartier à gauche. */
  const relief = (x: number): number => 0.42 + 0.58 * Math.exp(-Math.pow((x - 285) / 95, 2)) + 0.3 * Math.exp(-Math.pow((x - 95) / 50, 2));

  const rang = (tons: Brume, graine: number, hautMin: number, hautMax: number, largeMin: number, largeMax: number, vide: number): void => {
    let x = -3 - Math.floor(alea(graine, 1) * 6);
    for (let n = 0; x < VILLE_L; n++) {
      const large = largeMin + Math.floor(alea(n, graine + 2) * (largeMax - largeMin));
      const haut = Math.round((hautMin + alea(n, graine + 3) * (hautMax - hautMin)) * Math.min(1.15, relief(x + large / 2)));
      const tirage = alea(n, graine + 4);
      const sorte = tirage < 0.34 ? 0 : tirage < 0.56 ? 1 : tirage < 0.7 ? 2 : tirage < 0.86 ? 3 : 4;
      tour(P, x, large, Math.min(VILLE_H - 20, haut), sorte === 4 && large > 16 ? 1 : sorte, tons, lueur, graine * 97);
      x += large + (alea(n, graine + 5) < vide ? 1 + Math.floor(alea(n, graine + 6) * 7) : -1);
    }
  };
  rang(loin, 10, 34, 84, 9, 22, 0.25);
  // La grande tour des ondes, au loin : un fût mince, une nacelle, une flèche et son feu.
  P.rect(331, 14, 3, VILLE_H - 14, (x) => (x === 331 ? loin.clair : loin.fond));
  P.rect(327, 30, 11, 5, (x, y) => (y === 30 || x === 327 ? loin.clair : loin.fond));
  P.rect(329, 35, 7, 2, loin.fond);
  P.rect(332, 4, 1, 10, loin.fond);
  P.poser(332, 3, melanger(loin.fond, VOYANT.rouge, lueur * 0.8));
  rang(milieu, 20, 24, 62, 10, 24, 0.35);
  // Une grue de chantier, au second plan : sa tour, sa flèche, son contrepoids.
  P.rect(74, 30, 2, VILLE_H - 30, milieu.fond);
  P.rect(52, 30, 50, 1, milieu.fond);
  for (let x = 54; x < 100; x += 4) P.poser(x, 29, milieu.fond);
  trait(P, 75, 23, 99, 29, milieu.fond);
  trait(P, 75, 23, 56, 29, milieu.fond);
  P.rect(74, 22, 2, 8, milieu.fond);
  P.rect(52, 31, 6, 4, milieu.fond);
  P.rect(92, 31, 1, 12, milieu.fond);
  // Un château d'eau, à droite.
  P.rect(434, 58, 3, VILLE_H - 58, milieu.fond);
  P.rect(446, 58, 3, VILLE_H - 58, milieu.fond);
  P.rect(430, 46, 23, 12, (x, y) => (x === 430 || y === 46 ? milieu.clair : milieu.fond));
  P.rect(433, 44, 17, 2, milieu.fond);
  rang(pres, 30, 14, 40, 12, 28, 0.5);
  // Au premier plan : des toits bas et la cime des arbres, pour asseoir la ville sur l'horizon.
  for (let x = 0; x < VILLE_L; x++) {
    const cime = 9 + Math.round(3 * Math.sin(x / 7.3) + 2 * Math.sin(x / 3.1 + 1) + Math.abs(((x + 4) % 10) - 5) * 0.8);
    for (let y = VILLE_H - cime; y < VILLE_H; y++) P.poser(x, y, alea(x, y) < 0.08 ? pres.clair : c("#6f97bf", "#0e193f"));
  }
  return P.decor();
}

/* ------------------------------------------------------------------ Les explosions ------------------------------------------------------------------ */

const EXPLOSION_L = 160;
const EXPLOSION_H = 160;
const EXPLOSION_IMAGES = 8;
const INTERCEPTION_L = 80;
const INTERCEPTION_H = 80;
const INTERCEPTION_IMAGES = 5;
const FEU = { bord: "#d83a26", orange: "#f58a1f", jaune: "#ffc040", coeur: "#ffe27a" } as const;

/**
 * Une nuée de dessin animé : neuf boules qui se touchent. `rayon` : sa taille ; `feu` : de 1 (tout est boule de feu) à 0
 * (tout est fumée), le feu se retire vers le bas ; `dissipe` : de 0 à 1, la fumée se défait en damier et s'effrange.
 * Le feu garde ses couleurs (orange et jaune, jamais de blanc) ; la fumée suit l'heure.
 */
function nuee(P: Planche, cx: number, cy: number, rayon: number, feu: number, dissipe: number, fumee: Tons, graine: number): void {
  const boules = [{ x: 0, y: 0, r: 0.62 }];
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4 + (alea(k, graine) - 0.5) * 0.5;
    const dist = 0.48 + alea(k, graine + 1) * 0.12;
    boules.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, r: 0.36 + alea(k, graine + 2) * 0.14 });
  }
  const portee = Math.ceil(rayon * 1.2);
  const basDuFeu = cy + rayon * (1 - feu) * 0.45;
  for (let y = Math.floor(cy - portee); y <= cy + portee; y++) {
    for (let x = Math.floor(cx - portee); x <= cx + portee; x++) {
      let q = 9;
      let pente = 0;
      let qFeu = 9;
      for (const b of boules) {
        const r = b.r * rayon;
        const dx = x - (cx + b.x * rayon);
        const dy = y - (cy + b.y * rayon);
        const d = Math.hypot(dx, dy) / r;
        if (d < q) {
          q = d;
          pente = (dx + dy) / r;
        }
        if (feu > 0) qFeu = Math.min(qFeu, Math.hypot(x - (cx + b.x * rayon * feu), y - (basDuFeu + b.y * rayon * feu)) / (r * feu));
      }
      if (qFeu < 1) {
        P.poser(x, y, qFeu > 0.84 ? FEU.bord : qFeu > 0.58 ? FEU.orange : qFeu > 0.3 ? FEU.jaune : FEU.coeur);
        continue;
      }
      if (q >= 1) continue;
      if (dissipe > 0) {
        const seuil = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
        if (seuil < dissipe || q > 1 - dissipe * 0.45) continue;
      }
      // Près du feu, la fumée rougeoie un peu.
      const base = pente < -0.45 ? fumee.clair : pente > 0.6 ? fumee.creux : pente > 0.1 ? fumee.sombre : fumee.fond;
      P.poser(x, y, qFeu < 1.25 ? melanger(base, FEU.bord, 0.45) : base);
    }
  }
}

/** Les débris : des planches et des lambeaux de toile prune, lancés en cloche, les mêmes à chaque dessin. */
function debris(P: Planche, m: Matieres, cx: number, sol: number, temps: number, nombre: number, force: number, graine: number): void {
  const teintes = [m.p.bois.fond, m.p.prune.fond, m.p.bois.sombre, m.p.prune.clair, m.noir];
  for (let k = 0; k < nombre; k++) {
    const angle = Math.PI * (0.18 + 0.64 * ((k + alea(k, graine) * 0.8) / nombre));
    const vitesse = force * (0.7 + alea(k, graine + 1) * 0.5);
    const x = Math.round(cx + Math.cos(angle) * vitesse * temps);
    const y = Math.round(sol - (Math.sin(angle) * vitesse * temps - 0.5 * force * 0.19 * temps * temps));
    if (y >= sol) continue;
    const teinte = teintes[k % teintes.length] ?? m.noir;
    const couche = (k + temps) % 2 === 0;
    P.rect(x, y, couche ? 4 : 2, couche ? 2 : 4, teinte);
    P.poser(x, y, melanger(teinte, "#ffffff", 0.25));
  }
}

/**
 * L'explosion au sol, en 8 images lentes : la boule de feu orange et jaune gonfle (0 à 2), la fumée sombre la gagne par le
 * haut (3 et 4), puis monte, pâlit et se défait (5 à 7). Son pied est au milieu du bas du dessin. Aucun blanc, aucun
 * éclair : d'une image à l'autre la clarté ne change que peu à peu.
 */
function dessinerExplosion(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const P = new Planche(EXPLOSION_L, EXPLOSION_H);
  const im = ((image % EXPLOSION_IMAGES) + EXPLOSION_IMAGES) % EXPLOSION_IMAGES;
  const sol = EXPLOSION_H - 1;
  const t = m.t;
  const sombre: Tons = { clair: t("#8c8d96"), fond: t("#666771"), sombre: t("#4b4c55"), creux: t("#36373f") };
  const pale: Tons = { clair: t("#b4b6be"), fond: t("#93959e"), sombre: t("#74767f"), creux: t("#5c5d66") };
  const ETAPES = [
    { rayon: 14, haut: 9, feu: 1, dissipe: 0, tons: sombre },
    { rayon: 30, haut: 22, feu: 1, dissipe: 0, tons: sombre },
    { rayon: 46, haut: 36, feu: 0.86, dissipe: 0, tons: sombre },
    { rayon: 54, haut: 48, feu: 0.6, dissipe: 0, tons: sombre },
    { rayon: 58, haut: 60, feu: 0.32, dissipe: 0, tons: sombre },
    { rayon: 60, haut: 72, feu: 0.1, dissipe: 0.14, tons: sombre },
    { rayon: 60, haut: 82, feu: 0, dissipe: 0.42, tons: pale },
    { rayon: 58, haut: 90, feu: 0, dissipe: 0.74, tons: pale },
  ];
  const e = ETAPES[im] ?? ETAPES[0]!;
  nuee(P, 80, sol - e.haut, e.rayon, e.feu, e.dissipe, e.tons, 3);
  // Le pied de la fumée, tant qu'elle tient au sol.
  if (im >= 3 && im <= 5) nuee(P, 80, sol - 6, 22 - (im - 3) * 5, im === 3 ? 0.7 : 0, (im - 3) * 0.3, e.tons, 8);
  // La poussière soulevée au ras du sol, de part et d'autre, aux premières images.
  if (im <= 2) for (const cote of [-1, 1]) bouffee(P, pale, 80 + cote * (e.rayon + 3), sol - 3, 4 + im, im * 0.2);
  if (im >= 1 && im <= 5) debris(P, m, 80, sol, im, 12, 15, 5);
  return P.decor();
}

/** L'interception, en l'air : une explosion plus petite en 5 images, autour du milieu du dessin, puis une fumée claire. */
function dessinerInterception(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const P = new Planche(INTERCEPTION_L, INTERCEPTION_H);
  const im = ((image % INTERCEPTION_IMAGES) + INTERCEPTION_IMAGES) % INTERCEPTION_IMAGES;
  const t = m.t;
  const tons: Tons = { clair: t("#c4c6cc"), fond: t("#a2a4ac"), sombre: t("#82848d"), creux: t("#686a73") };
  const ETAPES = [
    { rayon: 9, feu: 1, dissipe: 0 },
    { rayon: 19, feu: 0.9, dissipe: 0 },
    { rayon: 26, feu: 0.5, dissipe: 0 },
    { rayon: 30, feu: 0.12, dissipe: 0.3 },
    { rayon: 31, feu: 0, dissipe: 0.7 },
  ];
  const e = ETAPES[im] ?? ETAPES[0]!;
  nuee(P, 40, 38 - im, e.rayon, e.feu, e.dissipe, tons, 12);
  // Les morceaux du missile touché retombent : gris, bleus et rouges.
  {
    const teintes = [m.acier.fond, m.bleu, m.acier.sombre, m.rouge, m.blanc, m.acier.creux];
    for (let k = 0; k < 6; k++) {
      const angle = (k * Math.PI) / 3 + 0.4;
      const x = Math.round(40 + Math.cos(angle) * (7 + im * 5.5));
      const y = Math.round(38 + Math.sin(angle) * (5 + im * 4) + im * im * 1.6);
      if (y < INTERCEPTION_H - 1) P.rect(x, y, (k + im) % 2 === 0 ? 3 : 2, (k + im) % 2 === 0 ? 2 : 3, teintes[k] ?? m.noir);
    }
  }
  return P.decor();
}

/* ------------------------------------------------------------------ Le lot------------------------------------------------------------------ */

/**
 * Les repères utiles pour poser les pièces dans le monde, en cases, depuis le coin en haut à gauche de chaque dessin.
 * - `usine.cheminees` : la bouche de chaque cheminée (la fumée est déjà dans le dessin, au-dessus).
 * - `silo.bouche` : le missile se pose derrière le silo, son milieu sur la colonne `x` ; il ne doit se voir qu'au-dessus de
 *   la rangée `y` (le bord de la margelle), le reste est caché par le silo et le sol. `ouvert` : l'image où la trappe est
 *   grande ouverte ; entre les vantaux, 40 cases de large.
 * - `missile.corps` : les rangées du missile seul ; dessous, `flamme` rangées pour sa flamme (à ne montrer qu'en vol).
 * - `batterie.radar` : le milieu de l'antenne qui tourne. `tir` : au repos la batterie n'a que ses 4 images (l'antenne) ;
 *   `dessiner(lumiere, 4)` à `dessiner(lumiere, 7)` donnent les 4 images du tir, à passer une seule fois. `bouche` : d'où
 *   part la fusée, qui file vers le haut à gauche, `angle` degrés au-dessus de l'horizontale.
 * - `explosion.pied` : le point du sol où tombe le missile. `interception.milieu` : là où le missile est touché.
 */
export const REPERES_DEFENSE = {
  usine: { cheminees: CHEMINEES, portail: { x: 122, y: 162, largeur: 61, hauteur: 74 }, tapis: { x: HALLE_A, y: 202 } },
  silo: { bouche: { x: SILO_MILIEU, y: SILO_BOUCHE }, ouvert: SILO_IMAGES - 1 },
  missile: { corps: MISSILE_CORPS, flamme: MISSILE_FLAMME },
  batterie: { radar: RADAR, tir: { premiere: BATTERIE_IMAGES, images: BATTERIE_TIR }, bouche: BATTERIE_BOUCHE, angle: BATTERIE_ANGLE },
  explosion: { pied: { x: 80, y: EXPLOSION_H - 1 } },
  interception: { milieu: { x: 40, y: 38 } },
} as const;

export const LOT_DEFENSE: Partial<Record<PieceOpenFrontId, DessinDeBatiment>> = {
  usine: { largeur: USINE_L, hauteur: USINE_H, images: USINE_IMAGES, dessiner: dessinerUsine },
  silo: { largeur: SILO_L, hauteur: SILO_H, images: SILO_IMAGES, dessiner: dessinerSilo },
  missile: { largeur: MISSILE_L, hauteur: MISSILE_H, images: 2, dessiner: dessinerMissile },
  batterie: { largeur: BATTERIE_L, hauteur: BATTERIE_H, images: BATTERIE_IMAGES, dessiner: dessinerBatterie },
  "poste-defense": { largeur: POSTE_L, hauteur: POSTE_H, images: POSTE_IMAGES, dessiner: dessinerPoste },
  "ville-lointaine": { largeur: VILLE_L, hauteur: VILLE_H, images: 1, dessiner: dessinerVille },
  explosion: { largeur: EXPLOSION_L, hauteur: EXPLOSION_H, images: EXPLOSION_IMAGES, dessiner: dessinerExplosion },
  interception: { largeur: INTERCEPTION_L, hauteur: INTERCEPTION_H, images: INTERCEPTION_IMAGES, dessiner: dessinerInterception },
};
