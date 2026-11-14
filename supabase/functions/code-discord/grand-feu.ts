/**
 * Le grand feu de la place du village (idée « le grand feu », 14 novembre 2026) : sa hauteur suit les points rapportés au
 * clan sur les 7 derniers jours, de 0 (des braises) à 4 (un feu de joie), `SEUILS_DU_FEU` de `src/lib/village/chantier-liste.ts`.
 * Ici parce que la fonction `code-discord` ne lit que son dossier : /feu le dessine aussi. Le site l'importe d'ici.
 *
 * Cinq dessins qui se reconnaissent d'un coup d'œil : des braises dans la cendre et un filet de fumée ; un petit feu sur
 * deux bûches croisées ; un beau feu sur un tas de bûches ; un grand feu sur des bûches dressées en faisceau ; un feu de
 * joie sur un bûcher de rondins empilés, plus haut qu'un Gaulois et demi.
 *
 * Les flammes sont des langues qui ondulent lentement, d'une image à la suivante, en une boucle sans raccord : ni
 * étincelle, ni éclair, ni saut de taille (le pilote trouve agressifs les effets rapides). Tout est calculé, rien n'est
 * tiré au hasard. Le feu éclaire : ses couleurs ne changent pas avec l'heure. Dessiné case par case pour ce site, sans
 * emprunt à une œuvre existante. Design : Claude Fable 5.2.
 */

export interface DessinDuFeu {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** La toile commune à tous les niveaux, en cases, à l'échelle des Gaulois (48 × 64) : les pierres du foyer reposent sur la dernière rangée. */
export const GRAND_FEU_LARGEUR = 96;
export const GRAND_FEU_HAUTEUR = 120;
/** Les images du mouvement de la flamme ; l'image 0 est celle qui reste quand tout est figé. */
export const IMAGES_DU_FEU = 6;

const L = GRAND_FEU_LARGEUR;
const H = GRAND_FEU_HAUTEUR;
/** La colonne du milieu du foyer. */
const MILIEU = L / 2;
/** La rangée du lit de braises, d'où partent les flammes. */
const LIT = H - 7;

const ROUGE = "#e2452a";
const ORANGE = "#f58a1f";
const JAUNE = "#ffd75a";
const COEUR = "#fff1a8";
const ROUGE_SOMBRE = "#b8301f";

const BOIS = { clair: "#9a6b3f", fond: "#835a33", sombre: "#5d3d22", creux: "#3d2616", coupe: "#b98a52", coupeSombre: "#8a6238" };
/** Le bois vu devant la flamme : à contre-jour. */
const BOIS_DEVANT = { clair: "#835a33", fond: "#5d3d22", sombre: "#472d19", creux: "#2a1a10", coupe: "#a07a48", coupeSombre: "#70492c" };
const BRULE = { fond: "#3d2616", sombre: "#2a1a10" };
const PIERRE = { claire: "#8d95a6", fond: "#5c6474", sombre: "#454c5a", chaude: "#a8826a" };
const CENDRE = { fond: "#4a4442", claire: "#77706a", sombre: "#332e2c" };
const FUMEE = { claire: "#9aa1ae", fond: "#737a88" };

type Bois = typeof BOIS;

/** Un nombre de 0 à 1 qui ne dépend que de la case : le même à chaque dessin. */
function alea(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Toile = (string | null)[];

function poser(toile: Toile, x: number, y: number, couleur: string): void {
  if (x >= 0 && x < L && y >= 0 && y < H) toile[y * L + x] = couleur;
}

/**
 * Une langue de flamme : `x` l'écart de son pied au milieu du foyer, `pied` sa rangée de départ, `demi` sa demi-largeur,
 * `haut` sa hauteur, `decalage` ce qui la fait onduler à son propre moment, `force` sa chaleur (1 : cœur clair).
 */
interface Langue {
  x: number;
  pied: number;
  demi: number;
  haut: number;
  decalage: number;
  force: number;
}

/** La chaleur d'une case sous une langue, de 0 (dehors) à 1 (cœur) : la langue penche un peu plus à mesure qu'elle monte. */
function chaleur(langue: Langue, x: number, y: number, tour: number): number {
  const haut = langue.haut * (1 + 0.03 * Math.sin(tour + langue.decalage + 1));
  const t = (langue.pied - y) / haut;
  if (t < 0 || t >= 1) return 0;
  const demi = langue.demi * (1 + 0.04 * Math.sin(tour + langue.decalage * 1.7));
  const forme = Math.pow(1 - t, 0.58) * (0.3 + 0.7 * Math.min(1, t / 0.14));
  const penche = (0.21 * langue.demi + 0.9) * Math.pow(t, 1.2) * Math.sin(tour + langue.decalage - 4.4 * t);
  const d = Math.abs(x + 0.5 - (MILIEU + langue.x + penche)) / (demi * forme + 0.01);
  if (d >= 1) return 0;
  return (1 - Math.pow(d, 1.7)) * (1 - 0.8 * t) * langue.force;
}

function poserFlammes(toile: Toile, langues: readonly Langue[], tour: number): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      let c = 0;
      for (const langue of langues) c = Math.max(c, chaleur(langue, x, y, tour));
      if (c <= 0) continue;
      poser(toile, x, y, c > 0.68 ? COEUR : c > 0.45 ? JAUNE : c > 0.2 ? ORANGE : c > 0.07 ? ROUGE : ROUGE_SOMBRE);
    }
  }
}

/** Une bûche ronde, d'un bout à l'autre : éclairée dessus, sombre dessous, les bouts coupés clairs. `brule` : la part noircie, du premier bout. */
function poserBuche(toile: Toile, x0: number, y0: number, x1: number, y1: number, rayon: number, bois: Bois, brule = 0): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const longueur = Math.hypot(dx, dy);
  const marge = rayon + 1;
  for (let y = Math.floor(Math.min(y0, y1) - marge); y <= Math.ceil(Math.max(y0, y1) + marge); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - marge); x <= Math.ceil(Math.max(x0, x1) + marge); x++) {
      const s = ((x - x0) * dx + (y - y0) * dy) / (longueur * longueur);
      if (s < 0 || s > 1) continue;
      // L'écart à l'axe : négatif du côté du haut (éclairé), positif dessous.
      let ecart = ((x - x0) * dy - (y - y0) * dx) / longueur;
      if (dx < 0) ecart = -ecart;
      if (Math.abs(ecart) > rayon) continue;
      const bout = s * longueur < 1.2 || (1 - s) * longueur < 1.2;
      let couleur: string;
      if (s < brule) couleur = ecart > rayon * 0.3 || alea(x, y) < 0.25 ? BRULE.sombre : BRULE.fond;
      else if (bout) couleur = ecart > 0 ? bois.coupeSombre : bois.coupe;
      else if (ecart < -rayon * 0.45) couleur = bois.clair;
      else if (ecart > rayon * 0.4) couleur = bois.sombre;
      else couleur = alea(x >> 1, y) < 0.12 ? bois.sombre : bois.fond;
      if (!bout && s >= brule && Math.abs(ecart) > rayon - 0.6 && ecart > 0) couleur = bois.creux;
      poser(toile, x, y, couleur);
    }
  }
}

/** Un rondin vu par le bout : un disque de bois coupé, ses cernes, son écorce. */
function poserBout(toile: Toile, cx: number, cy: number, rayon: number, bois: Bois): void {
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > rayon + 0.3) continue;
      let couleur: string = bois.coupe;
      if (d > rayon - 0.8) couleur = dx + dy > 0 ? bois.creux : bois.sombre;
      else if (Math.round(d) === Math.round(rayon / 2)) couleur = bois.coupeSombre;
      else if (d < 0.8) couleur = bois.sombre;
      poser(toile, cx + dx, cy + dy, couleur);
    }
  }
}

/** Une pierre du foyer, posée sur la rangée `bas` : claire dessus, sombre dessous. `chaude` : le feu la rougit un peu du côté du foyer. */
function poserPierre(toile: Toile, gauche: number, bas: number, largeur: number, hauteur: number, chaude: -1 | 0 | 1): void {
  for (let j = 0; j < hauteur; j++) {
    for (let i = 0; i < largeur; i++) {
      const coin = (i === 0 || i === largeur - 1) && (j === 0 || j === hauteur - 1);
      if (coin) continue;
      let couleur: string = j === 0 ? PIERRE.claire : j === hauteur - 1 ? PIERRE.sombre : PIERRE.fond;
      if (j === 1 && i > 0 && i < largeur - 2 && alea(gauche + i, bas) < 0.5) couleur = PIERRE.claire;
      if (j > 0 && i === largeur - 1) couleur = PIERRE.sombre;
      if (chaude !== 0 && j > 0 && j < hauteur - 1 && i === (chaude > 0 ? largeur - 1 : 0)) couleur = PIERRE.chaude;
      poser(toile, gauche + i, bas - hauteur + 1 + j, couleur);
    }
  }
}

/** Le rang de pierres du fond du foyer, à demi caché, puis la cendre. */
function poserFondDuFoyer(toile: Toile, demi: number): void {
  for (let x = MILIEU - demi + 4, k = 0; x < MILIEU + demi - 7; x += 6, k++) poserPierre(toile, x, H - 6, 5, k % 2 === 0 ? 4 : 3, 0);
  for (let y = H - 8; y <= H - 2; y++) {
    for (let x = MILIEU - demi + 3; x < MILIEU + demi - 3; x++) {
      const dx = (x + 0.5 - MILIEU) / (demi - 3);
      const dy = (y - (H - 5)) / 3.6;
      if (dx * dx + dy * dy > 1) continue;
      const a = alea(x, y + 77);
      poser(toile, x, y, a < 0.14 ? CENDRE.claire : a < 0.34 ? CENDRE.sombre : CENDRE.fond);
    }
  }
}

/** Le rang de pierres du devant du foyer, sur la dernière rangée : il cache le pied des bûches. */
function poserDevantDuFoyer(toile: Toile, demi: number): void {
  let x = MILIEU - demi;
  for (let k = 0; x < MILIEU + demi - 4; k++) {
    const largeur = Math.min(k % 3 === 1 ? 6 : 7, MILIEU + demi - x);
    const hauteur = k % 3 === 1 ? 4 : k % 3 === 2 ? 6 : 5;
    poserPierre(toile, x, H - 1, largeur, hauteur, 0);
    x += largeur;
  }
}

/** Les braises : un tapis rougeoyant dont la lueur passe lentement d'un bord à l'autre, sans jamais s'éteindre. */
function poserBraises(toile: Toile, demi: number, haut: number, tour: number): void {
  for (let y = LIT - haut; y <= LIT + 2; y++) {
    for (let x = MILIEU - demi; x < MILIEU + demi; x++) {
      const dx = (x + 0.5 - MILIEU) / demi;
      const dy = (y - (LIT + 1)) / (haut + 1);
      if (dx * dx + dy * dy > 1) continue;
      const a = alea(x, y + 211);
      // La lueur glisse par larges plaques : une case ne change que d'un ton à la fois.
      const souffle = 0.5 + 0.5 * Math.sin(tour + x / 4.5 + y / 3);
      let couleur: string;
      if (a < 0.16) couleur = BRULE.sombre;
      else if (a < 0.3) couleur = ROUGE_SOMBRE;
      else if (a > 0.9) couleur = souffle > 0.55 ? JAUNE : ORANGE;
      else if (a > 0.62) couleur = souffle > 0.5 ? ORANGE : "#ee6a24";
      else couleur = souffle > 0.6 ? "#ee6a24" : ROUGE;
      poser(toile, x, y, couleur);
    }
  }
}

/** Un filet de fumée qui monte en serpentant et s'efface : une ou deux cases de large, de plus en plus clairsemé. */
function poserFumee(toile: Toile, pied: number, haut: number, tour: number): void {
  for (let k = 0; k < haut; k++) {
    const t = k / haut;
    const y = pied - k;
    const x = Math.round(MILIEU - 1 + (1 + 5 * t) * Math.sin(k / 6.5 - tour) + 3 * t);
    if (t > 0.55 && k % 3 === 0) continue;
    if (t > 0.8 && k % 3 === 1) continue;
    poser(toile, x, y, t < 0.5 ? FUMEE.claire : FUMEE.fond);
    if (t < 0.7 && k % 2 === 0) poser(toile, x + 1, y, FUMEE.fond);
    if (t > 0.25 && t < 0.6 && k % 4 === 1) poser(toile, x - 1, y, FUMEE.fond);
  }
}

const langue = (x: number, pied: number, demi: number, haut: number, decalage: number, force = 1): Langue => ({ x, pied, demi, haut, decalage, force });

/** Le feu à ce niveau (0 à 4), image `image` (0 à IMAGES_DU_FEU − 1). Le feu éclaire : ses couleurs ne changent pas avec l'heure. */
export function imageDuGrandFeu(niveau: 0 | 1 | 2 | 3 | 4, image: number): DessinDuFeu {
  const toile: Toile = new Array<string | null>(L * H).fill(null);
  const pas = ((Math.round(image) % IMAGES_DU_FEU) + IMAGES_DU_FEU) % IMAGES_DU_FEU;
  const tour = (2 * Math.PI * pas) / IMAGES_DU_FEU;
  const demi = [17, 17, 20, 25, 32][niveau] ?? 17;
  poserFondDuFoyer(toile, demi);

  if (niveau === 0) {
    // Des braises : deux tisons noircis dans la cendre, un filet de fumée.
    poserBuche(toile, MILIEU - 12, LIT + 1, MILIEU + 3, LIT - 3, 2, BOIS, 0.75);
    poserBuche(toile, MILIEU + 12, LIT + 2, MILIEU - 1, LIT - 1, 2, BOIS, 0.8);
    poserBraises(toile, 9, 3, tour);
    poserFumee(toile, LIT - 5, 44, tour);
  } else if (niveau === 1) {
    // Un petit feu : deux bûches croisées, une flamme à hauteur de genou.
    poserFlammes(toile, [langue(0, LIT, 6.5, 25, 0), langue(-5, LIT, 4, 15, 2.1, 0.8), langue(5, LIT, 4, 17, 4.2, 0.8)], tour);
    poserBuche(toile, MILIEU - 13, LIT + 2, MILIEU + 9, LIT - 5, 2, BOIS_DEVANT, 0.3);
    poserBuche(toile, MILIEU + 13, LIT + 2, MILIEU - 9, LIT - 5, 2, BOIS_DEVANT, 0.3);
    poserBraises(toile, 7, 1, tour);
    poserFlammes(toile, [langue(-1, LIT + 1, 3, 10, 3.1, 0.85)], tour);
  } else if (niveau === 2) {
    // Un beau feu : un tas de bûches croisées, une flamme à hauteur de poitrine.
    poserFlammes(
      toile,
      [langue(0, LIT, 10, 46, 0), langue(-8, LIT, 6, 29, 2.1, 0.85), langue(8, LIT, 6.5, 33, 4.2, 0.85), langue(-13, LIT, 3.5, 15, 5.2, 0.7), langue(13, LIT, 3.5, 17, 1.1, 0.7)],
      tour,
    );
    poserBuche(toile, MILIEU - 17, LIT + 2, MILIEU + 16, LIT + 2, 2, BOIS_DEVANT, 0);
    poserBuche(toile, MILIEU - 16, LIT, MILIEU + 10, LIT - 12, 2, BOIS_DEVANT, 0.25);
    poserBuche(toile, MILIEU + 16, LIT, MILIEU - 10, LIT - 12, 2, BOIS_DEVANT, 0.25);
    poserBuche(toile, MILIEU - 6, LIT + 1, MILIEU + 2, LIT - 16, 2, BOIS_DEVANT, 0.35);
    poserBraises(toile, 8, 1, tour);
    poserFlammes(toile, [langue(-3, LIT, 4, 16, 3.1, 0.85), langue(6, LIT + 1, 3.5, 13, 0.6, 0.8)], tour);
  } else if (niveau === 3) {
    // Un grand feu : des bûches dressées en faisceau, la flamme plus haute qu'un Gaulois.
    poserFlammes(
      toile,
      [
        langue(0, LIT, 13, 72, 0),
        langue(-10, LIT, 8, 50, 2.1, 0.9),
        langue(10, LIT, 8.5, 55, 4.2, 0.9),
        langue(-17, LIT, 5, 30, 5.2, 0.75),
        langue(17, LIT, 5, 33, 1.1, 0.75),
      ],
      tour,
    );
    const sommet = LIT - 32;
    for (const [pied, tete] of [
      [-21, 3],
      [21, -3],
      [-13, 2],
      [14, -1],
      [-5, -2],
      [6, 1],
    ] as const) {
      poserBuche(toile, MILIEU + pied, LIT + 3, MILIEU + tete, sommet - (Math.abs(pied) > 15 ? 3 : 0), 2, BOIS_DEVANT, 0.18);
    }
    poserBraises(toile, 10, 1, tour);
    poserFlammes(toile, [langue(-9, LIT + 1, 3.5, 20, 3.1, 0.85), langue(1, LIT + 1, 3.5, 24, 0.6, 0.9), langue(10, LIT + 1, 3.5, 18, 5.6, 0.85)], tour);
  } else {
    // Un feu de joie : un bûcher de rondins empilés en carré, des perches dressées dessus, de hautes flammes.
    poserFlammes(
      toile,
      [
        langue(0, LIT, 17, 106, 0),
        langue(-14, LIT, 11, 80, 2.1, 0.92),
        langue(14, LIT, 11.5, 87, 4.2, 0.92),
        langue(-25, LIT, 7, 54, 5.2, 0.8),
        langue(25, LIT, 7, 58, 1.1, 0.8),
        langue(-33, LIT, 4.5, 30, 3.6, 0.7),
        langue(33, LIT, 4.5, 33, 0.3, 0.7),
      ],
      tour,
    );
    // Cinq lits de rondins : un lit en long, un lit vu par les bouts, de moins en moins large.
    let y = LIT + 2;
    for (let lit = 0; lit < 5; lit++) {
      const large = 27 - lit * 2;
      if (lit % 2 === 0) {
        poserBuche(toile, MILIEU - large, y - 2, MILIEU + large, y - 2, 2.5, BOIS_DEVANT, 0);
      } else {
        for (let x = -large + 5; x <= large - 5; x += 10) poserBout(toile, MILIEU + x, y - 3, 3, BOIS_DEVANT);
      }
      y -= lit % 2 === 0 ? 5 : 7;
    }
    const assise = y + 3;
    const sommet = assise - 34;
    for (const [pied, tete] of [
      [-20, 4],
      [20, -4],
      [-12, 2],
      [13, -2],
      [-4, -1],
      [5, 1],
    ] as const) {
      poserBuche(toile, MILIEU + pied, assise, MILIEU + tete, sommet - (Math.abs(pied) > 15 ? 3 : 0), 2, BOIS_DEVANT, 0.12);
    }
    poserFlammes(
      toile,
      [langue(-8, assise - 2, 4, 30, 3.1, 0.9), langue(2, assise - 2, 4.5, 38, 0.6, 0.95), langue(9, assise - 2, 4, 27, 5.6, 0.9), langue(-24, LIT + 1, 3.5, 16, 1.9, 0.8), langue(25, LIT + 1, 3.5, 14, 4.8, 0.8)],
      tour,
    );
  }

  poserDevantDuFoyer(toile, demi);
  return { largeur: L, hauteur: H, cases: toile };
}
