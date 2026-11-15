/**
 * Les cadres de rareté des bannières : posés sur le bord de la toile (les `ZONES.bord` cases), après la bannière, pour les
 * bannières épiques, mystiques et légendaires. Dessin original de Claude Fable 5.2 pour le clan [GAL], 15 novembre 2026.
 *
 * - commun, peu commun : pas de cadre, la bannière va jusqu'au bord.
 * - épique : un filet violet d'une case entre un liseré sombre et une ombre légère, un clou clair à chaque coin.
 * - mystique : un filet rouge où passent des braises, et de petites flammes tournées vers l'image.
 * - légendaire : une torsade dorée, des denticules, des coins pleins et un cabochon au milieu de chaque côté.
 *
 * La lumière vient d'en haut à gauche : les côtés du haut et de gauche sont plus clairs. La troisième case laisse toujours
 * voir la bannière (assombrie ou une case sur deux) : le cadre reste léger. Tout est symétrique autour du milieu de chaque côté.
 */
import { HAUTEUR, LARGEUR, melanger, type RareteDeBanniere } from "./commun.ts";

/** La place d'une case dans le bord : sa profondeur (0 au bord), sa distance au milieu du côté, son côté, son coin. */
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
  const clair = horizontal ? y < HAUTEUR / 2 : x < LARGEUR / 2;
  return { d, k, coin: Math.max(dx, dy), clair, carre: dx < 3 && dy < 3 ? { a: dx, b: dy } : null };
}

type Peintre = (c: CaseDuBord, dessous: string) => string;

/** Épique : fin et sobre. */
const epique: Peintre = (c, dessous) => {
  if (c.carre) {
    const { a, b } = c.carre;
    if (a === 0 || b === 0) return "#2a1060";
    if (a === 1 && b === 1) return "#e6d0ff";
    if (a === 2 && b === 2) return "#5a23a8";
    return "#a866f2";
  }
  if (c.d === 0) return "#2a1060";
  if (c.d === 1) {
    // Un point de lumière tous les 16 cases, le reste en filet uni.
    if (c.k % 16 === 8) return c.clair ? "#d2acff" : "#a060ec";
    return c.clair ? "#9f58ee" : "#7430c6";
  }
  return melanger(dessous, "#1e0a48", 0.38);
};

/** Mystique : un filet où passent des braises, des flammèches vers l'image. */
const mystique: Peintre = (c, dessous) => {
  if (c.carre) {
    const { a, b } = c.carre;
    if (a === 0 || b === 0) return "#48050f";
    if (a === 1 && b === 1) return "#ffd9a8";
    if (a === 2 && b === 2) return "#ff5a48";
    return "#f03a44";
  }
  const p = c.k % 10;
  if (c.d === 0) return p === 4 ? "#7a0c1c" : "#48050f";
  if (c.d === 1) {
    if (p === 4) return "#ffb07a";
    if (p === 3 || p === 5) return c.clair ? "#ff6a58" : "#ee4448";
    return c.clair ? "#e02c40" : "#b8162e";
  }
  if (c.coin < 6) return "#b8162e";
  if (p === 4) return c.clair ? "#f03a44" : "#d9203a";
  if (p === 3 || p === 5) return melanger(dessous, "#d9203a", 0.5);
  return melanger(dessous, "#3a0410", 0.32);
};

/** Légendaire : torsade dorée, denticules, coins pleins, cabochons. */
const legendaire: Peintre = (c, dessous) => {
  if (c.carre) {
    const { a, b } = c.carre;
    if (a === 0 || b === 0) return "#553606";
    if (a === 1 && b === 1) return "#fff6cc";
    if (a === 2 && b === 2) return "#fff0a0";
    return "#f4c842";
  }
  if (c.d === 0) return "#553606";
  const cabochon = c.k < 3;
  const pleinCoin = c.coin < 11;
  if (c.d === 1) {
    if (cabochon) return c.k === 0 ? "#fff6cc" : "#f8d458";
    const t = (c.k + (c.clair ? 0 : 2)) % 4;
    if (pleinCoin) return c.coin % 2 === 1 ? "#ffe684" : c.clair ? "#f0bc30" : "#d09a1a";
    if (t === 0) return "#ffe684";
    if (t === 2) return c.clair ? "#c88e14" : "#a8720c";
    return c.clair ? "#eeb828" : "#d49c18";
  }
  if (cabochon) return c.k === 2 ? "#8a5c0a" : c.clair ? "#e8b020" : "#c08a12";
  if (pleinCoin) {
    if (c.coin === 10) return "#8a5c0a";
    if (c.coin === 9) return "#fff0a0";
    return c.clair ? "#dca41c" : "#b47e10";
  }
  // Denticules : deux cases d'or, deux cases où la bannière se voit.
  if (c.k % 4 < 2) return c.clair ? "#dca41c" : "#b47e10";
  return melanger(dessous, "#3a2404", 0.42);
};

const PEINTRES: Partial<Record<RareteDeBanniere, Peintre>> = { epique, mystique, legendaire };

/** Pose le cadre de la rareté sur les cases d'une bannière (124 × 80, rangée par rangée). Sans cadre : rien ne change. */
export function poserLeCadre(cases: string[], rarete: RareteDeBanniere): void {
  const peintre = PEINTRES[rarete];
  if (!peintre || cases.length !== LARGEUR * HAUTEUR) return;
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (x > 2 && x < LARGEUR - 3 && y > 2 && y < HAUTEUR - 3) continue;
      const c = caseDuBord(x, y);
      if (!c) continue;
      const i = y * LARGEUR + x;
      cases[i] = peintre(c, cases[i] ?? "#000000");
    }
  }
}
