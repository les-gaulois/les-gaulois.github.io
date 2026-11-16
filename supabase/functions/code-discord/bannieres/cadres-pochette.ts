/**
 * Les cadres des bannières de la pochette (« Les trésors de la pochette », voir `commun.ts`) : posés sur le bord de la
 * toile (les `ZONES.bord` cases), après la bannière, à la place du cadre de la rareté (`cadres.ts`). Ils disent d'un coup
 * d'œil qu'une bannière ne s'achète pas : elle est sortie de la pochette. Dessin original de Claude Fable 5.2 pour le
 * clan [GAL], 16 novembre 2026, sans emprunt à une œuvre existante.
 *
 * Ce qui les sépare des cadres de la boutique, pour les trois raretés : une monture d'orfèvre pleine sur les trois cases
 * (la boutique laisse voir la bannière dans la troisième), des écoinçons d'or longs de sept cases sertis d'une pierre, une
 * pierre sertie de griffes d'or toutes les dix cases, un joyau au milieu de chaque côté et un liseré d'or du côté de
 * l'image. L'or dit « trésor », la couleur du rail dit la rareté.
 *
 * - épique : un rail d'améthyste violet, des améthystes claires serties d'or, un liseré d'or.
 * - mystique : un rail de braises (du rouge sombre au cœur jaune, tous les dix cases), des rubis aux écoinçons, un liseré
 *   d'or que les cœurs de braise éclairent.
 * - légendaire : tout en or : un bord perlé, une torsade, un liseré d'ivoire, des diamants bleutés, des écoinçons plus
 *   longs (onze cases) et, au milieu de chaque côté, un diamant entre une améthyste et un rubis : les trois raretés de la
 *   pochette.
 * - commun, peu commun : la pochette n'en donne pas ; le cadre de la rareté (`cadres.ts`), c'est-à-dire aucun.
 *
 * La lumière vient d'en haut à gauche : les côtés du haut et de gauche sont plus clairs. Tout est symétrique autour du
 * milieu de chaque côté, rien n'est tiré au hasard. Dans le coin en haut à gauche, le logo du clan couvre la troisième case.
 */
import { poserLeCadre } from "./cadres.ts";
import { HAUTEUR, LARGEUR, type RareteDeBanniere } from "./commun.ts";

/** La place d'une case dans le bord. */
interface CaseDuBord {
  /** 0, 1 ou 2 : la distance au bord le plus proche. */
  d: number;
  /** La distance, en cases, au milieu de son côté (0 pour les deux cases du milieu). */
  k: number;
  /** La distance au coin le plus proche, le long du côté. */
  coin: number;
  /** Vrai sur les côtés du haut et de gauche, éclairés. */
  clair: boolean;
  /** Dans un des quatre carrés de 3 × 3 des coins : sa place (0 à 2, 0 à 2) depuis le coin. */
  carre: { a: number; b: number } | null;
}

function caseDuBord(x: number, y: number): CaseDuBord | null {
  const dx = Math.min(x, LARGEUR - 1 - x);
  const dy = Math.min(y, HAUTEUR - 1 - y);
  const d = Math.min(dx, dy);
  if (d > 2) return null;
  const horizontal = dy <= dx;
  const k = horizontal ? (x < LARGEUR / 2 ? LARGEUR / 2 - 1 - x : x - LARGEUR / 2) : y < HAUTEUR / 2 ? HAUTEUR / 2 - 1 - y : y - HAUTEUR / 2;
  // Dans un carré de coin, la lumière se décide par la diagonale : clair en haut à gauche, sombre en bas à droite.
  const clair = dx < 3 && dy < 3 ? x + y < (LARGEUR + HAUTEUR) / 2 : horizontal ? y < HAUTEUR / 2 : x < LARGEUR / 2;
  return { d, k, coin: Math.max(dx, dy), clair, carre: dx < 3 && dy < 3 ? { a: dx, b: dy } : null };
}

type Peintre = (c: CaseDuBord) => string;

/** L'or de la monture : du contour sombre à l'éclat. */
const OR = { contour: "#5a3a08", sombre: "#a8720c", moyen: "#d6a01c", clair: "#f4c842", vif: "#ffe684", eclat: "#fff6cc" };

/** Une pierre : son ombre, sa couleur, son reflet, son éclat. */
interface Pierre {
  ombre: string;
  corps: string;
  reflet: string;
  eclat: string;
}
const AMETHYSTE: Pierre = { ombre: "#4a1a96", corps: "#9a52ee", reflet: "#d2acff", eclat: "#f6eaff" };
const RUBIS: Pierre = { ombre: "#7a0c1c", corps: "#e02c40", reflet: "#ff8a70", eclat: "#fff0d8" };
const DIAMANT: Pierre = { ombre: "#3a8ec0", corps: "#8fe0f8", reflet: "#d4f6ff", eclat: "#ffffff" };

/** La place d'une case par rapport à la pierre sertie la plus proche (une tous les dix cases, loin des écoinçons). */
function versLaPierre(c: CaseDuBord, ecoincon: number): number {
  const p = c.k % 10;
  const q = Math.min(p, 10 - p);
  const centre = c.k + (p <= 5 ? -p : 10 - p);
  // Pas de pierre au milieu (le joyau y est), ni collée à l'écoinçon.
  if (centre === 0 || c.coin + (c.k - centre) < ecoincon + 2) return 9;
  return q;
}

/** L'écoinçon d'or et sa pierre : le carré du coin, puis une plaque le long des deux côtés. `null` hors de l'écoinçon. */
function ecoincon(c: CaseDuBord, longueur: number, pierre: Pierre): string | null {
  if (c.carre) {
    const { a, b } = c.carre;
    if (a === 0 && b === 0) return OR.contour;
    if (a === 0 || b === 0) return a + b === 1 ? (c.clair ? OR.vif : OR.moyen) : OR.contour;
    if (a === 1 && b === 1) return pierre.eclat;
    if (a === 2 && b === 2) return pierre.ombre;
    return c.clair ? pierre.reflet : pierre.corps;
  }
  if (c.coin >= longueur) return null;
  const bout = longueur - 1 - c.coin;
  if (bout === 0) return c.d === 1 ? pierre.reflet : OR.contour;
  if (c.d === 0) return bout === 1 ? OR.contour : c.clair ? OR.moyen : OR.sombre;
  if (c.d === 1) {
    if (c.coin === 3) return pierre.corps;
    return (c.coin + (c.clair ? 0 : 1)) % 2 === 0 ? OR.vif : c.clair ? OR.clair : OR.moyen;
  }
  return bout === 1 ? OR.contour : c.clair ? OR.clair : OR.sombre;
}

/** Le joyau du milieu d'un côté : huit cases, une pierre au centre dans sa monture d'or. `null` hors du joyau. */
function joyau(c: CaseDuBord, pierre: Pierre, voisine: Pierre | null): string | null {
  if (c.k > 3) return null;
  if (c.k === 3) return c.d === 1 ? (voisine ? voisine.corps : OR.vif) : OR.contour;
  if (c.d === 0) return c.k === 2 ? OR.contour : c.k === 0 ? OR.vif : OR.clair;
  if (c.d === 2) return c.k === 2 ? OR.contour : c.k === 0 ? OR.eclat : c.clair ? OR.clair : OR.moyen;
  if (c.k === 0) return pierre.eclat;
  return c.k === 1 ? (c.clair ? pierre.reflet : pierre.corps) : pierre.ombre;
}

/** Épique : rail d'améthyste, pierres claires serties d'or, liseré d'or. */
const epique: Peintre = (c) => {
  const fait = ecoincon(c, 7, AMETHYSTE) ?? joyau(c, AMETHYSTE, null);
  if (fait) return fait;
  const q = versLaPierre(c, 7);
  if (c.d === 0) return q === 0 ? OR.clair : q === 1 ? "#6c2cc0" : c.clair ? "#4a1a96" : "#3a1280";
  if (c.d === 1) {
    if (q === 0) return AMETHYSTE.eclat;
    if (q === 1) return AMETHYSTE.reflet;
    if (c.k % 10 === 5) return c.clair ? "#d2acff" : "#a868f2";
    return c.clair ? "#b478f6" : "#8a48e0";
  }
  if (q === 0) return OR.eclat;
  return c.clair ? OR.clair : OR.sombre;
};

/** Mystique : rail de braises, rubis, liseré d'or éclairé par les cœurs de braise. */
const BRAISES_CLAIRES = ["#fff0c0", "#ffb060", "#ff6a48", "#e02c40", "#b8162e", "#8a0c20"];
const BRAISES_SOMBRES = ["#ffe6a8", "#ff9a50", "#ee4a40", "#c81c36", "#a01028", "#74081a"];
const mystique: Peintre = (c) => {
  const fait = ecoincon(c, 7, RUBIS) ?? joyau(c, RUBIS, null);
  if (fait) return fait;
  const p = c.k % 10;
  const q = Math.min(p, 10 - p);
  if (c.d === 0) return q === 0 ? "#d04a1c" : q === 1 ? "#7a0c1c" : "#3a0410";
  if (c.d === 1) return (c.clair ? BRAISES_CLAIRES : BRAISES_SOMBRES)[q] ?? "#8a0c20";
  if (q === 0) return OR.eclat;
  if (q === 1) return OR.vif;
  return c.clair ? OR.clair : OR.sombre;
};

/** Légendaire : bord perlé, torsade d'or, liseré d'ivoire, diamants, joyau aux trois pierres. */
const legendaire: Peintre = (c) => {
  if (!c.carre && c.k === 3 && c.d === 1) return c.clair ? AMETHYSTE.corps : RUBIS.corps;
  const fait = ecoincon(c, 11, DIAMANT) ?? joyau(c, DIAMANT, null);
  if (fait) return fait;
  // De part et d'autre du joyau : une améthyste et un rubis, sur le rail.
  if (c.k === 4) return c.d === 1 ? (c.clair ? RUBIS.corps : AMETHYSTE.corps) : OR.contour;
  const q = versLaPierre(c, 11);
  if (c.d === 0) {
    if (q === 0) return OR.eclat;
    return c.k % 2 === 0 ? (c.clair ? OR.vif : OR.clair) : "#7a5208";
  }
  if (c.d === 1) {
    if (q === 0) return DIAMANT.eclat;
    if (q === 1) return DIAMANT.corps;
    const t = (c.k + (c.clair ? 0 : 2)) % 4;
    if (t === 0) return OR.eclat;
    if (t === 2) return c.clair ? "#c88e14" : OR.sombre;
    return c.clair ? OR.clair : OR.moyen;
  }
  if (q === 0) return DIAMANT.reflet;
  return c.clair ? "#fff0a0" : "#e8c458";
};

const PEINTRES: Partial<Record<RareteDeBanniere, Peintre>> = { epique, mystique, legendaire };

/** Pose le cadre de la pochette sur les cases d'une bannière (124 × 80, rangée par rangée). */
export function poserLeCadreDeLaPochette(cases: string[], rarete: RareteDeBanniere): void {
  const peintre = PEINTRES[rarete];
  if (!peintre || cases.length !== LARGEUR * HAUTEUR) {
    // La pochette ne donne que des épiques, des mystiques et des légendaires : sinon, le cadre de la rareté.
    poserLeCadre(cases, rarete);
    return;
  }
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (x > 2 && x < LARGEUR - 3 && y > 2 && y < HAUTEUR - 3) continue;
      const c = caseDuBord(x, y);
      if (c) cases[y * LARGEUR + x] = peintre(c);
    }
  }
}
