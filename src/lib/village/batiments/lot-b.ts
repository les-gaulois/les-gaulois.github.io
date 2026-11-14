/**
 * Lot B des bâtiments du village : le pont, le grenier sur pilotis, le moulin à eau, le lavoir, le colombier.
 * Dessinés case par case pour ce site, sans emprunt à une œuvre existante, à l'échelle des Gaulois (48 × 64 cases), avec
 * les matières du village (`paletteDuDehors` de `decor.ts` : bois, chaume, torchis) et une pierre grise un peu chaude.
 * Rien n'est tiré au hasard à l'écran : la même lumière et la même image donnent toujours le même dessin.
 *
 * Ce qui bouge, très lentement : la roue du moulin (4 images, un douzième de tour à elles quatre, puis elle se retrouve
 * pareille), l'eau qui tombe sur elle, et trois pigeons du colombier (3 images). Ce qui éclaire (les lanternes du pont, les
 * fenêtres du moulin) garde sa couleur et ne s'allume que quand le jour baisse. Design : Claude Fable 5.2.
 */
import type { BatimentId } from "../chantier-liste";
import { type Decor, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import type { DessinDeBatiment } from "./type";

/* ---------- Les matières ---------- */

function matieres(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  return {
    ...paletteDuDehors(l),
    pierre: { clair: c("#a69f90", "#565e72"), fond: c("#8c8577", "#474e62"), sombre: c("#736d61", "#393f52"), joint: c("#5a554c", "#2b3042"), trou: c("#3b362f", "#171a24") },
    eau: { fond: c("#4f8fb5", "#1e3d63"), clair: c("#86bcd6", "#335f88"), sombre: c("#3b7499", "#17304f") },
    toile: { fond: c("#cbbb8c", "#7c7660"), clair: c("#ddcfa2", "#8e8870"), sombre: c("#a8996e", "#625d4b") },
    linge: {
      blanc: c("#e6dcc0", "#8f8f8e"),
      blancOmbre: c("#c9bea0", "#73747a"),
      rouge: c("#b8644a", "#5f3d44"),
      rougeOmbre: c("#96503c", "#4a3038"),
      bleu: c("#6f8fae", "#3a4f74"),
      bleuOmbre: c("#587592", "#2e3f5e"),
    },
    grain: { fond: c("#e0b84e", "#9a7c38"), clair: c("#f2d272", "#b3934a") },
    pigeon: { blanc: c("#ebe8dc", "#9a9cab"), gris: c("#aab0bf", "#666c80"), ombre: c("#868c9c", "#4e5466"), bec: c("#d08a4a", "#7a5a40") },
    /** La lumière du dedans : nulle en plein jour, entière à la nuit (comme les huttes de la place). */
    veille: Math.min(1, Math.max(0, (0.8 - l.jour) / 0.5)),
  };
}
type Matieres = ReturnType<typeof matieres>;

const borner = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Un mur de pierres : des lits de 5 rangées, des blocs de 10 cases décalés d'un lit à l'autre. `ombre` : −1 éclaire, 1 ou 2 assombrit. */
function pierres(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number, ombre: (i: number, j: number) => number = () => 0, graine = 0): void {
  const tons = [m.pierre.clair, m.pierre.fond, m.pierre.sombre, m.pierre.joint] as const;
  pl.rect(x, y, l, h, (i, j) => {
    const lit = Math.floor((j - y) / 5);
    const decale = i - x + (lit % 2) * 5 + Math.floor(alea(lit + 3, graine + 11) * 4);
    const o = ombre(i, j);
    if ((j - y) % 5 === 4 || decale % 10 === 0) return o >= 2 ? m.pierre.trou : m.pierre.joint;
    const a = alea(Math.floor(decale / 10) + graine * 31, lit + 17);
    const ton = (a < 0.28 ? 0 : a < 0.8 ? 1 : 2) + o;
    return tons[borner(ton, 0, 3)]!;
  });
}

/** Un mur de planches debout. */
function planches(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number, pas = 5): void {
  pl.rect(x, y, l, h, (i, j) => {
    const k = (i - x) % pas;
    if (k === pas - 1) return m.bois.sombre;
    if (alea(i, j + 40) < 0.04) return m.bois.sombre;
    return Math.floor((i - x) / pas) % 2 === 0 ? m.bois.fond : m.bois.autre;
  });
}

/** Un poteau debout : clair à gauche, sombre à droite. `loin` : un poteau de derrière, dans l'ombre. */
function poteau(pl: Planche, m: Matieres, x: number, y: number, h: number, l = 5, loin = false): void {
  pl.rect(x, y, l, h, (i, j) => {
    if (loin) return i === x + l - 1 ? m.bois.creux : m.bois.sombre;
    if (i === x) return m.bois.clair;
    if (i === x + l - 1) return m.bois.sombre;
    return alea(i, j + 9) < 0.06 ? m.bois.sombre : m.bois.fond;
  });
}

/** Une poutre couchée : claire dessus, sombre dessous. */
function poutre(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number): void {
  pl.rect(x, y, l, h, (i, j) => {
    if (j === y) return m.bois.clair;
    if (j === y + h - 1) return m.bois.sombre;
    return (i - x) % 14 === 13 ? m.bois.sombre : m.bois.fond;
  });
}

/**
 * Un toit de chaume vu de face : de `x0` à `x1` en bas, rentré de `retraitG` et `retraitD` cases en haut. `courbe` plus grand
 * que 1 : le toit s'évase vers le bas et se termine en pointe (le colombier).
 */
function chaume(pl: Planche, m: Matieres, x0: number, x1: number, yHaut: number, yBas: number, retraitG: number, retraitD: number, courbe = 1): void {
  const haut = yBas - yHaut + 1;
  for (let r = 0; r < haut; r++) {
    const f = Math.pow((haut - 1 - r) / (haut - 1), courbe);
    const a = x0 + Math.round(retraitG * f);
    const b = x1 - Math.round(retraitD * f);
    const y = yHaut + r;
    for (let x = a; x <= b; x++) {
      const t = b > a ? (x - a) / (b - a) : 0.5;
      // Clair à gauche, sombre à droite : les trois tons se fondent en damier là où ils se touchent.
      const meles = (x + y) % 2 === 0;
      let couleur: string = t < 0.26 || (t < 0.34 && meles) ? m.chaume.clair : t > 0.76 || (t > 0.68 && meles) ? m.chaume.sombre : m.chaume.fond;
      if (r % 6 === 5) couleur = m.chaume.rang;
      else if (alea(x, y + 200) < 0.16) couleur = m.chaume.brin;
      if (x === a || x === b || r === haut - 1) couleur = m.chaume.bord;
      pl.poser(x, y, couleur);
      // Le bas du toit : des brins inégaux.
      if (r === haut - 1 && alea(x, 7) < 0.45) pl.poser(x, y + 1, m.chaume.bord);
    }
  }
}

/** Le faîte d'un toit long : des bouquets de paille liée, de `a` à `b`, au-dessus de la rangée `y`. */
function faite(pl: Planche, m: Matieres, a: number, b: number, y: number): void {
  for (let x = a; x <= b; x++) {
    pl.poser(x, y - 1, (x - a) % 6 < 2 ? m.chaume.bord : m.chaume.rang);
    if ((x - a) % 6 === 0 || (x - a) % 6 === 1) pl.poser(x, y - 2, m.chaume.rang);
  }
}

/** Un mur de torchis, comme celui des huttes : une trame toutes les trois rangées. */
function torchis(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number): void {
  pl.rect(x, y, l, h, (i, j) => {
    if (j < y + 4) return m.mur.ombre;
    if ((j - y) % 3 === 2) return m.mur.trame;
    const a = alea(i, j + 70);
    return a < 0.05 ? m.mur.clair : a > 0.96 ? m.mur.sombre : m.mur.fond;
  });
}

/** Un sac de grain debout, lié en haut, posé sur la rangée `bas`. */
function sac(pl: Planche, m: Matieres, x: number, bas: number, l = 12, h = 15): void {
  const haut = bas - h + 1;
  for (let r = 0; r < h; r++) {
    const y = haut + r;
    // Le col, le lien, puis le ventre arrondi.
    const retrait = r < 2 ? Math.floor(l / 2) - 2 : r === 2 ? Math.floor(l / 2) - 3 : r === 3 || r === h - 1 ? 1 : 0;
    for (let i = x + retrait; i < x + l - retrait; i++) {
      const t = (i - x) / (l - 1);
      let couleur: string = t < 0.3 ? m.toile.clair : t > 0.7 ? m.toile.sombre : m.toile.fond;
      if (r === 2) couleur = m.bois.cordeSombre;
      else if (r === h - 1) couleur = m.toile.sombre;
      else if (r > 4 && alea(i, y + 5) < 0.08) couleur = m.toile.sombre;
      pl.poser(i, y, couleur);
    }
  }
}

/** Un sac couché : un boudin de toile. */
function sacCouche(pl: Planche, m: Matieres, x: number, bas: number, l = 16, h = 8): void {
  for (let r = 0; r < h; r++) {
    const retrait = r === 0 || r === h - 1 ? 2 : r === 1 ? 1 : 0;
    for (let i = x + retrait; i < x + l - retrait; i++) {
      let couleur: string = r < 2 ? m.toile.clair : r > h - 3 ? m.toile.sombre : m.toile.fond;
      if (i === x + l - 4) couleur = m.bois.cordeSombre;
      pl.poser(i, bas - h + 1 + r, couleur);
    }
  }
}

/** Une petite fenêtre dans son cadre de bois : sombre le jour, éclairée du dedans quand le jour baisse. */
function fenetre(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number): void {
  pl.rect(x, y, l, h, (i, j) => {
    if (i === x || i === x + l - 1 || j === y || j === y + h - 1) return m.bois.sombre;
    if (i === x + Math.floor(l / 2) || j === y + Math.floor(h / 2)) return m.bois.sombre;
    return melanger(m.bois.creux, j < y + h / 2 ? "#ffd75a" : "#f5a83a", m.veille);
  });
  pl.rect(x - 1, y + h, l + 2, 1, m.bois.clair);
}

/* ---------- Le pont ---------- */

const PONT_L = 149;
const PONT_H = 46;

function dessinerPont(l: Lumiere): Decor {
  const m = matieres(l);
  const pl = new Planche(PONT_L, PONT_H);
  const sol = PONT_H - 1;
  /** La rangée du dessus du plancher : à hauteur de marche aux deux bouts, bombé au milieu. */
  const dessus = (x: number): number => {
    const t = (2 * x) / (PONT_L - 1) - 1;
    return sol - 5 - Math.round(15 * (1 - t * t));
  };
  const POTEAUX = [10, 28, 46, 64, 82, 100, 118, 136];
  const CULEE = 28;

  // Le garde-corps du fond, dans l'ombre.
  for (let x = 8; x <= PONT_L - 9; x++) pl.poser(x, dessus(x) - 21, m.bois.sombre);
  for (const x of POTEAUX.slice(0, -1)) pl.rect(x + 7, dessus(x + 7) - 20, 2, 20, (i) => (i === x + 7 ? m.bois.sombre : m.bois.creux));

  // Les deux culées de pierre, sous les bouts du plancher : entre elles, rien, pour laisser voir l'eau.
  for (let x = 0; x < PONT_L; x++) {
    if (x >= CULEE && x <= PONT_L - 1 - CULEE) continue;
    const haut = dessus(x) + 6;
    if (haut > sol) continue;
    // Les lits de pierre partent du sol, pas du plancher.
    for (let j = haut; j <= sol; j++) {
      const lit = Math.floor((sol - j) / 5);
      const decale = x + (lit % 2) * 5;
      const joint = (sol - j) % 5 === 4 || decale % 10 === 0;
      const a = alea(Math.floor(decale / 10), lit + 61);
      pl.poser(x, j, joint ? m.pierre.joint : a < 0.3 ? m.pierre.clair : a < 0.8 ? m.pierre.fond : m.pierre.sombre);
    }
    pl.poser(x, haut, m.pierre.clair);
  }
  // Deux jambes de force, des culées vers le milieu.
  for (const cote of [0, 1] as const) {
    for (let k = 0; k <= 16; k++) {
      const x = cote === 0 ? CULEE + k : PONT_L - 1 - CULEE - k;
      const bas = sol - 3;
      const but = dessus(cote === 0 ? CULEE + 16 : PONT_L - 1 - CULEE - 16) + 6;
      const y = Math.round(bas + ((but - bas) * k) / 16);
      pl.poser(x, y - 1, m.bois.fond);
      pl.poser(x, y, m.bois.fond);
      pl.poser(x, y + 1, m.bois.sombre);
    }
  }
  // Le plancher : trois rangées de planches vues de dessus, puis la poutre de rive.
  for (let x = 0; x < PONT_L; x++) {
    const y = dessus(x);
    const joint = x % 5 === 4;
    pl.poser(x, y, joint ? m.bois.fond : m.bois.clair);
    pl.poser(x, y + 1, joint ? m.bois.fond : Math.floor(x / 5) % 2 === 0 ? m.bois.clair : m.bois.autre);
    pl.poser(x, y + 2, joint ? m.bois.sombre : m.bois.autre);
    pl.poser(x, y + 3, m.bois.fond);
    pl.poser(x, y + 4, x % 9 === 4 ? m.bois.sombre : m.bois.fond);
    pl.poser(x, y + 5, m.bois.sombre);
  }
  // Le garde-corps de devant : une lisse, une corde qui pend un peu entre deux poteaux, les poteaux.
  for (let x = POTEAUX[0]!; x <= POTEAUX[POTEAUX.length - 1]! + 2; x++) {
    const y = dessus(x);
    pl.poser(x, y - 17, m.bois.clair);
    pl.poser(x, y - 16, m.bois.fond);
    const entre = ((x - 10) % 18) / 18;
    pl.poser(x, y - 9 + Math.round(1.6 * Math.sin(Math.PI * entre)), m.bois.corde);
  }
  POTEAUX.forEach((x, k) => {
    const bout = k === 0 || k === POTEAUX.length - 1;
    const y = dessus(x + 1);
    const haut = bout ? 25 : 19;
    poteau(pl, m, x, y - haut, haut + 5, 3);
    if (!bout) return;
    // Aux deux bouts, un poteau plus haut porte une lanterne : éteinte le jour, allumée quand le jour baisse.
    const h = y - haut;
    pl.rect(x - 1, h, 5, 1, m.bois.sombre);
    pl.rect(x - 1, h - 6, 5, 1, m.bois.sombre);
    pl.rect(x, h - 7, 3, 1, m.bois.sombre);
    pl.rect(x - 1, h - 5, 5, 5, (i, j) => {
      if (i === x - 1 || i === x + 3) return m.bois.sombre;
      return melanger(m.bois.creux, i === x + 1 && j > h - 5 ? "#ffd75a" : "#f5a83a", m.veille);
    });
  });
  return pl.decor();
}

/* ---------- Le grenier sur pilotis ---------- */

const GRENIER_L = 124;
const GRENIER_H = 140;

function dessinerGrenier(l: Lumiere): Decor {
  const m = matieres(l);
  const pl = new Planche(GRENIER_L, GRENIER_H);
  const sol = GRENIER_H - 1;
  const PILOTIS = [16, 44, 72, 100];

  // Les pilotis du fond, dans l'ombre, puis ceux de devant, coiffés d'une pierre plate qui arrête les rongeurs.
  for (const x of PILOTIS) poteau(pl, m, x + 10, 104, 31, 3, true);
  // Les sacs rangés dessous, au sec.
  sac(pl, m, 77, sol - 1, 12, 16);
  sac(pl, m, 86, sol, 12, 15);
  sacCouche(pl, m, 52, sol, 17, 8);
  for (const x of PILOTIS) {
    poteau(pl, m, x, 106, sol - 105);
    pl.rect(x - 1, 102, 7, 1, m.pierre.clair);
    pl.rect(x - 2, 103, 9, 2, (i) => (i > x + 4 ? m.pierre.sombre : m.pierre.fond));
    pl.rect(x - 1, 105, 7, 1, m.pierre.joint);
  }
  // Le plancher : une forte poutre, le bout des solives.
  poutre(pl, m, 8, 96, 108, 6);
  for (let x = 12; x < 112; x += 9) pl.rect(x, 98, 3, 3, (i, j) => (i === x && j === 98 ? m.bois.fond : m.bois.sombre));

  // Le coffre de planches, ses poteaux d'angle, ses fentes d'aération.
  planches(pl, m, 13, 52, 98, 44);
  pl.rect(13, 52, 98, 9, (i, j) => (j < 58 || (i + j) % 2 === 0 ? m.bois.sombre : null));
  poteau(pl, m, 13, 56, 40, 4);
  poteau(pl, m, 107, 56, 40, 4);
  pl.rect(17, 76, 90, 2, (_i, j) => (j === 76 ? m.bois.clair : m.bois.sombre));
  for (const x of [62, 70, 78, 86, 94]) pl.rect(x, 64, 2, 7, m.bois.creux);

  // La porte ouverte : le dedans sombre, le tas de grain doré, le battant rabattu contre le mur.
  pl.rect(27, 62, 22, 34, (i, j) => (i < 29 || i > 46 || j < 64 ? m.bois.sombre : m.bois.creux));
  for (let j = 80; j <= 95; j++) {
    const demi = Math.min(8, j - 79);
    for (let i = 38 - demi; i <= 37 + demi; i++) {
      if (i < 29 || i > 46) continue;
      pl.poser(i, j, alea(i, j) < 0.25 || j === 80 + Math.max(0, Math.abs(i - 37.5) - 0.5) ? m.grain.clair : m.grain.fond);
    }
  }
  pl.rect(49, 64, 9, 32, (i, j) => (i === 57 ? m.bois.sombre : j === 70 || j === 88 ? m.bois.sombre : i === 53 ? m.bois.fond : m.bois.clair));
  // Deux sacs sur le plancher, près de la porte.
  sac(pl, m, 64, 95, 11, 14);
  sac(pl, m, 92, 95, 11, 13);

  // Le toit de chaume, bas sur le coffre, et son faîte.
  chaume(pl, m, 3, 120, 8, 57, 34, 34);
  faite(pl, m, 37, 86, 8);

  // La petite échelle, appuyée au seuil.
  for (let y = 92; y <= sol; y++) {
    const x = 29 - Math.round(((y - 92) * 7) / (sol - 92));
    pl.poser(x, y, m.bois.clair);
    pl.poser(x + 1, y, m.bois.fond);
    pl.poser(x + 10, y, m.bois.clair);
    pl.poser(x + 11, y, m.bois.sombre);
    if ((y - 96) % 7 === 0 && y >= 96 && y < sol - 2) {
      pl.rect(x + 2, y, 8, 1, m.bois.clair);
      pl.rect(x + 2, y + 1, 8, 1, m.bois.sombre);
    }
  }
  return pl.decor();
}

/* ---------- Le moulin à eau ---------- */

const MOULIN_L = 212;
const MOULIN_H = 156;
/** Le nombre de bras et de pales de la roue : elle se retrouve pareille tous les douzièmes de tour. */
const BRAS = 12;
const MOULIN_IMAGES = 4;

function dessinerMoulin(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const pl = new Planche(MOULIN_L, MOULIN_H);
  const sol = MOULIN_H - 1;
  const roue = { x: 54, y: 111, r: 34 };

  // Le mur de pierre où tourne la roue, dans l'ombre, sous sa rangée de pierres plates.
  pierres(pl, m, 20, 66, 74, sol - 65, () => 1, 5);
  pl.rect(18, 63, 76, 3, (_i, j) => (j === 63 ? m.pierre.clair : j === 64 ? m.pierre.fond : m.pierre.joint));

  // La maison : un soubassement de pierre, du torchis entre des bois, une porte à la taille d'un Gaulois.
  torchis(pl, m, 92, 68, 114, 50);
  pierres(pl, m, 92, 118, 114, sol - 117, () => 0, 8);
  poutre(pl, m, 92, 115, 114, 3);
  for (const x of [92, 144, 180, 202]) poteau(pl, m, x, 72, 43, 4);
  fenetre(pl, m, 114, 86, 15, 15);
  fenetre(pl, m, 186, 88, 13, 13);
  // La porte : 72 cases de haut, des planches et deux pentures.
  pl.rect(150, 82, 28, 74, (i, j) => {
    if (i < 152 || i > 175 || j < 84) return m.bois.sombre;
    if (j === 98 || j === 99 || j === 138 || j === 139) return m.bois.creux;
    if ((i - 152) % 6 === 5) return m.bois.sombre;
    return Math.floor((i - 152) / 6) % 2 === 0 ? m.bois.autre : m.bois.fond;
  });
  pl.rect(171, 118, 2, 4, m.bois.creux);
  pl.rect(148, 152, 32, 4, (_i, j) => (j === 152 ? m.pierre.clair : m.pierre.fond));

  // Le toit de chaume et son faîte.
  chaume(pl, m, 84, 211, 14, 74, 36, 36);
  faite(pl, m, 120, 175, 14);

  // Le bassin : le rebord du fond, l'eau, où trempe le bas de la roue.
  pierres(pl, m, 8, 132, 86, 4, () => 1, 3);
  pl.rect(10, 136, 83, 6, (i, j) => {
    if (j === 136) return m.eau.sombre;
    return alea(Math.floor((i + image) / 3), j) < 0.14 ? m.eau.clair : m.eau.fond;
  });

  // La roue : un moyeu, douze bras fins, un cercle de bois, douze pales. Elle avance d'un quarante-huitième de tour par image.
  const pas = (2 * Math.PI) / BRAS;
  const tourne = (image * pas) / MOULIN_IMAGES;
  for (let dy = -roue.r - 5; dy <= roue.r + 5; dy++) {
    for (let dx = -roue.r - 5; dx <= roue.r + 5; dx++) {
      const y = roue.y + dy;
      if (y >= 142) continue;
      const r = Math.hypot(dx, dy);
      if (r > roue.r + 4.5) continue;
      let d = (((Math.atan2(dy, dx) - tourne) % pas) + pas) % pas;
      if (d > pas / 2) d -= pas;
      const ecart = Math.abs(Math.sin(d)) * r;
      let couleur: string | null = null;
      if (r <= 2.2) couleur = m.bois.creux;
      else if (r <= 6) couleur = dx + dy < 0 ? m.bois.fond : m.bois.sombre;
      else if (r >= roue.r - 8 && ecart <= 1.5) couleur = dx + dy < 0 ? m.bois.clair : m.bois.autre;
      else if (r > roue.r + 0.5) couleur = null;
      else if (r >= roue.r - 1.2 || (r >= roue.r - 8.5 && r <= roue.r - 7)) couleur = dx + dy < 0 ? m.bois.fond : m.bois.sombre;
      else if (r >= roue.r - 7) couleur = m.tronc.sombre;
      else if (r >= 15.5 && r <= 17) couleur = m.bois.sombre;
      else if (ecart <= 0.72) couleur = m.bois.autre;
      if (couleur) pl.poser(roue.x + dx, y, couleur);
    }
  }

  // L'amenée d'eau : une auge de bois sur un chevalet, d'où l'eau tombe sur la roue.
  poteau(pl, m, 2, 75, sol - 74, 4);
  for (let k = 0; k < 16; k++) {
    pl.poser(6 + k, 95 - k, m.bois.fond);
    pl.poser(6 + k, 96 - k, m.bois.sombre);
  }
  pl.rect(0, 66, 51, 2, (_i, j) => (j === 66 ? m.eau.clair : m.eau.fond));
  pl.rect(0, 68, 51, 7, (i, j) => {
    if (j === 68) return m.bois.clair;
    if (j === 74) return m.bois.sombre;
    return i % 12 === 11 ? m.bois.sombre : m.bois.fond;
  });
  pl.rect(51, 66, 5, 11, (i, j) => (i === 55 && j < 68 ? null : (j * 2 + i + 800 - image * 2) % 8 < 2 ? m.eau.clair : m.eau.fond));

  // Le rebord de devant du bassin, qui cache le bas de la roue.
  pierres(pl, m, 8, 142, 88, sol - 141, () => 0, 9);
  pl.rect(8, 142, 88, 1, m.pierre.clair);

  // Devant la maison : une meule usée appuyée au mur, deux sacs de farine.
  pl.disque(192, 143, 11, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d <= 3) return m.pierre.trou;
    if (d > 100) return dx + dy < 0 ? m.pierre.fond : m.pierre.joint;
    if (d < 40 && d > 26) return m.pierre.sombre;
    return dx + dy < -6 ? m.pierre.clair : alea(dx + 50, dy + 50) < 0.1 ? m.pierre.sombre : m.pierre.fond;
  });
  sac(pl, m, 122, sol, 12, 16);
  sac(pl, m, 132, sol, 11, 14);
  return pl.decor();
}

/* ---------- Le lavoir ---------- */

const LAVOIR_L = 190;
const LAVOIR_H = 104;

/** Un linge qui pend à la corde : `forme` donne sa demi-découpe, rangée par rangée (une tunique a des manches). */
function linge(pl: Planche, x: number, y: number, l: number, h: number, clair: string, ombre: string, manches = 0): void {
  for (let r = 0; r < h; r++) {
    const retrait = manches > 0 && r >= manches ? 3 : 0;
    for (let i = x + retrait; i < x + l - retrait; i++) {
      const bord = i === x + l - retrait - 1 || r === h - 1;
      const pli = (i - x) % 5 === 3 && r > 2;
      pl.poser(i, y + r, bord || pli ? ombre : clair);
    }
  }
}

function dessinerLavoir(l: Lumiere): Decor {
  const m = matieres(l);
  const pl = new Planche(LAVOIR_L, LAVOIR_H);
  const sol = LAVOIR_H - 1;
  const POTEAUX = [8, 48, 88, 128];

  // Les poteaux du fond, le rebord du fond, l'eau du bassin sous l'ombre du toit.
  for (const x of POTEAUX) poteau(pl, m, x + 9, 44, 37, 3, true);
  pierres(pl, m, 6, 80, 137, 4, () => 1, 4);
  pl.rect(8, 84, 133, 6, (i, j) => {
    if (j === 84) return m.eau.sombre;
    return alea(Math.floor(i / 3), j + 30) < 0.13 ? m.eau.clair : m.eau.fond;
  });
  // Les pierres plates où l'on frotte le linge, penchées vers l'eau, puis le rebord de devant.
  pl.rect(6, 90, 137, 4, (i, j) => {
    const dans = (i - 6) % 17;
    if (dans === 16) return m.pierre.joint;
    if (j === 90) return dans < 15 ? m.pierre.clair : m.pierre.fond;
    if (j === 91) return m.pierre.clair;
    return j === 92 ? m.pierre.fond : m.pierre.sombre;
  });
  pierres(pl, m, 6, 94, 137, sol - 93, () => 0, 6);

  // Un baquet de bois, un battoir, un drap qui trempe encore.
  pl.rect(22, 82, 13, 9, (i, j) => {
    if (j === 82) return m.bois.clair;
    if (j === 85 || j === 89) return m.bois.creux;
    return i === 22 ? m.bois.clair : i === 34 ? m.bois.sombre : (i - 22) % 3 === 2 ? m.bois.sombre : m.bois.fond;
  });
  pl.rect(23, 81, 11, 1, m.linge.blanc);
  pl.rect(102, 89, 9, 2, m.bois.clair);
  pl.rect(111, 90, 5, 1, m.bois.fond);
  pl.rect(64, 88, 13, 12, (i, j) => {
    if (j > 96 && (i + j) % 3 === 0) return null;
    return i === 76 || (i - 64) % 4 === 3 ? m.linge.blancOmbre : m.linge.blanc;
  });

  // Les poteaux de devant, leurs aisseliers, la sablière, le toit de chaume.
  for (const x of POTEAUX) {
    poteau(pl, m, x, 44, 46);
    for (let k = 1; k <= 7; k++) {
      pl.poser(x - k, 44 + 8 - k, m.bois.sombre);
      pl.poser(x - k, 44 + 9 - k, m.bois.fond);
      pl.poser(x + 4 + k, 44 + 8 - k, m.bois.sombre);
      pl.poser(x + 4 + k, 44 + 9 - k, m.bois.fond);
    }
  }
  poutre(pl, m, 2, 40, 137, 5);
  chaume(pl, m, 0, 140, 7, 40, 26, 26);
  faite(pl, m, 26, 114, 7);

  // La corde à linge, du dernier poteau à une perche : un drap, un linge rouge, une tunique bleue.
  poteau(pl, m, 183, 44, sol - 43, 3);
  const corde = (x: number): number => 49 + Math.round(3 * Math.sin((Math.PI * (x - 133)) / 50));
  for (let x = 133; x <= 183; x++) pl.poser(x, corde(x), m.bois.corde);
  linge(pl, 138, corde(144) - 1, 14, 30, m.linge.blanc, m.linge.blancOmbre);
  linge(pl, 155, corde(158) - 1, 8, 17, m.linge.rouge, m.linge.rougeOmbre);
  linge(pl, 166, corde(172) - 1, 14, 22, m.linge.bleu, m.linge.bleuOmbre, 7);
  // Le panier d'osier, plein de linge à étendre.
  pl.rect(149, 92, 16, 2, m.linge.blanc);
  pl.rect(151, 90, 11, 2, (i) => (i % 4 === 0 ? m.linge.blancOmbre : m.linge.blanc));
  pl.rect(148, 94, 18, 10, (i, j) => {
    if (j === 94) return m.bois.corde;
    if ((i === 148 || i === 165) && j > 100) return null;
    return (i + (j % 2) * 2) % 4 < 2 ? m.bois.corde : m.bois.cordeSombre;
  });
  return pl.decor();
}

/* ---------- Le colombier ---------- */

const COLOMBIER_L = 84;
const COLOMBIER_H = 164;
const COLOMBIER_IMAGES = 3;

/** Un pigeon, les pattes sur la rangée `y` : `sens` 1 regarde à droite, −1 à gauche ; `picore` baisse la tête. */
function pigeon(pl: Planche, m: Matieres, x: number, y: number, sens: 1 | -1, blanc: boolean, picore = false): void {
  const corps = blanc ? m.pigeon.blanc : m.pigeon.gris;
  const queue = blanc ? m.pigeon.gris : m.pigeon.ombre;
  const p = (dx: number, dy: number, couleur: string) => pl.poser(x + dx * sens, y + dy, couleur);
  // Le corps et la queue.
  for (const [dx, dy] of [[2, -3], [3, -3], [1, -2], [2, -2], [3, -2], [4, -2], [2, -1], [3, -1], [4, -1]] as const) p(dx, dy, corps);
  for (const [dx, dy] of [[0, -2], [0, -1], [1, -1]] as const) p(dx, dy, queue);
  if (picore) {
    p(4, -3, corps);
    p(5, -2, corps);
    p(5, -1, corps);
    p(6, -1, corps);
    p(7, -1, m.pigeon.bec);
  } else {
    for (const [dx, dy] of [[4, -3], [4, -4], [5, -4], [5, -3]] as const) p(dx, dy, corps);
    p(6, -3, m.pigeon.bec);
  }
}

function dessinerColombier(l: Lumiere, image: number): Decor {
  const m = matieres(l);
  const pl = new Planche(COLOMBIER_L, COLOMBIER_H);
  const sol = COLOMBIER_H - 1;
  const cx = 42;
  const rayon = 26;
  /** La tour est ronde : claire à gauche, sombre à droite, les deux mêlés en damier là où ils se touchent. */
  const rond = (i: number, j: number): number => {
    const d = i - cx;
    void j;
    return d < -15 ? -1 : d > 21 ? 2 : d > 11 ? 1 : 0;
  };

  // La tour de pierre et son pied un peu plus large.
  pierres(pl, m, cx - rayon, 60, rayon * 2 + 1, sol - 59, rond, 12);
  pierres(pl, m, cx - rayon - 2, 154, rayon * 2 + 5, 10, rond, 14);
  pl.rect(cx - rayon - 2, 154, rayon * 2 + 5, 1, (i, j) => (rond(i, j) > 0 ? m.pierre.fond : m.pierre.clair));

  // Deux rangs de trous d'envol, chacun sur son bandeau de pierre où se posent les pigeons.
  const trou = (x: number, y: number, large: number) => {
    pl.rect(x, y + 1, large, 8, m.pierre.trou);
    pl.rect(x + 1, y, large - 2, 1, m.pierre.trou);
    pl.rect(x, y + 8, large, 1, m.pierre.joint);
  };
  for (const d of [-16, -5, 6, 17]) trou(cx + d - 2, 72, d === 17 ? 4 : 5);
  pl.rect(cx - rayon - 2, 81, rayon * 2 + 5, 3, (i, j) => (j === 83 ? m.pierre.joint : rond(i, j) > 0 ? m.pierre.sombre : j === 81 ? m.pierre.clair : m.pierre.fond));
  for (const d of [-21, -11, 0, 11, 21]) trou(cx + d - (Math.abs(d) === 21 ? 1 : 2), 93, Math.abs(d) === 21 ? 3 : 5);
  pl.rect(cx - rayon - 3, 102, rayon * 2 + 7, 3, (i, j) => (j === 104 ? m.pierre.joint : rond(i, j) > 0 ? m.pierre.sombre : j === 102 ? m.pierre.clair : m.pierre.fond));

  // La porte basse, cintrée, sous son arc de pierres claires.
  for (let j = 116; j <= sol; j++) {
    const retrait = j === 116 ? 4 : j === 117 ? 2 : j === 118 ? 1 : 0;
    for (let i = cx - 10 + retrait; i <= cx + 10 - retrait; i++) {
      const bord = i < cx - 8 + retrait || i > cx + 8 - retrait || j < 118 + (retrait > 0 ? 1 : 0);
      if (bord) pl.poser(i, j, j % 6 === 0 && j > 118 ? m.pierre.joint : m.pierre.clair);
      else if (j === 130 || j === 131 || j === 152) pl.poser(i, j, m.bois.creux);
      else pl.poser(i, j, (i - cx + 8) % 5 === 4 ? m.bois.sombre : Math.floor((i - cx + 8) / 5) % 2 === 0 ? m.bois.fond : m.bois.autre);
    }
  }
  pl.rect(cx + 4, 140, 2, 3, m.bois.creux);

  // Le toit pointu, de chaume, qui s'évase sur la tour ; à sa pointe, un épi de bois.
  chaume(pl, m, 6, 78, 9, 64, 36, 36, 1.35);
  pl.rect(cx, 3, 1, 7, m.bois.sombre);
  pl.rect(cx - 1, 4, 3, 2, (i) => (i === cx - 1 ? m.bois.clair : m.bois.fond));

  // Une lucarne dans le toit : un petit auvent de chaume, un trou, une planche d'envol.
  for (let r = 0; r < 7; r++) {
    for (let i = cx - 1 - r; i <= cx + 1 + r; i++) pl.poser(i, 33 + r, Math.abs(i - cx) >= r ? m.chaume.bord : i < cx ? m.chaume.clair : m.chaume.fond);
  }
  pl.rect(cx - 6, 40, 13, 11, (i, j) => (i === cx - 6 || i === cx + 6 ? m.bois.sombre : j === 40 ? m.bois.sombre : m.pierre.trou));
  pl.rect(cx - 8, 51, 17, 2, (_i, j) => (j === 51 ? m.bois.clair : m.bois.sombre));

  // Les pigeons : l'un picore, l'autre se retourne, sans hâte.
  pigeon(pl, m, cx - 18, 102, 1, true, image === 1);
  pigeon(pl, m, cx + 19, 102, -1, false, image === 2);
  pigeon(pl, m, image === 0 ? cx - 4 : cx + 4, 51, image === 0 ? 1 : -1, true);
  pigeon(pl, m, cx - 2, 81, 1, false);
  return pl.decor();
}

/* ---------- Le lot ---------- */

const image = (n: number, images: number): number => ((Math.floor(n) % images) + images) % images;

export const LOT_B: Partial<Record<BatimentId, DessinDeBatiment>> = {
  pont: { largeur: PONT_L, hauteur: PONT_H, images: 1, dessiner: (l) => dessinerPont(l) },
  grenier: { largeur: GRENIER_L, hauteur: GRENIER_H, images: 1, dessiner: (l) => dessinerGrenier(l) },
  moulin: { largeur: MOULIN_L, hauteur: MOULIN_H, images: MOULIN_IMAGES, dessiner: (l, n) => dessinerMoulin(l, image(n, MOULIN_IMAGES)) },
  lavoir: { largeur: LAVOIR_L, hauteur: LAVOIR_H, images: 1, dessiner: (l) => dessinerLavoir(l) },
  colombier: { largeur: COLOMBIER_L, hauteur: COLOMBIER_H, images: COLOMBIER_IMAGES, dessiner: (l, n) => dessinerColombier(l, image(n, COLOMBIER_IMAGES)) },
};
