/**
 * Le décor de /gaulois « taverne » : l'intérieur de la taverne du village, où le Gaulois fête les points qu'il vient de
 * rapporter au clan — murs de planches et poutres, cheminée de pierre à gauche, lanternes aux poteaux, fenêtre à volets,
 * comptoir, tonnelet et tonneau à droite, chopes pendues sous le plafond —, aux quatre moments de la journée. Le moment
 * se lit à la fenêtre (ciel, astre) et à la lumière de la pièce : le jour entre le matin, les feux dominent le soir et
 * la nuit. Dessin original de Claude Fable 5.2 pour le clan [GAL], 14 novembre 2026 ; rien n'y est emprunté à une œuvre
 * existante.
 */
import type { Moment, Phase } from "../scene.ts";
import { HAUTEUR, HORIZON, LARGEUR, Toile, grain, melanger, type DessinDuLieu } from "./commun.ts";

/** La lumière de la pièce à chaque moment. */
interface Reglage {
  /** La couleur qui gagne la pièce, et sa part (0 : plein jour). */
  ambiante: string;
  part: number;
  /** La force du feu de la cheminée et des lanternes (0 : éteintes). */
  feu: number;
  lanternes: number;
  /** La flamme de la cheminée. */
  flamme: "braises" | "petite" | "grande";
  /** Le jour (ou la lune) qui entre par la fenêtre et tombe sur le plancher : sa couleur et sa part. */
  rayon: string;
  rayonPart: number;
  /** Le même jour, vu dans l'air de la pièce entre la fenêtre et le plancher (0 : rien). */
  faisceau: number;
  /** Le ciel de la fenêtre, du haut vers l'horizon, et les collines au loin. */
  ciel: readonly [string, string, string, string, string];
  collines: readonly [string, string];
}

const REGLAGES: Readonly<Record<Phase, Reglage>> = {
  aube: {
    ambiante: "#4a4878",
    part: 0.4,
    feu: 0.3,
    lanternes: 0.3,
    flamme: "braises",
    rayon: "#ffc2a6",
    rayonPart: 0.42,
    faisceau: 0.2,
    ciel: ["#6a5a9a", "#a8689a", "#e48a7a", "#f6b47a", "#fbdca6"],
    collines: ["#8a6a8e", "#5c4a70"],
  },
  jour: {
    ambiante: "#fff0d0",
    part: 0.06,
    feu: 0.22,
    lanternes: 0,
    flamme: "petite",
    rayon: "#fff4c8",
    rayonPart: 0.4,
    faisceau: 0.15,
    ciel: ["#3b8ad4", "#4f9bdd", "#68ade6", "#84c0ee", "#a6d4f4"],
    collines: ["#7fae8a", "#4f8a5c"],
  },
  crepuscule: {
    ambiante: "#3c2038",
    part: 0.46,
    feu: 0.95,
    lanternes: 0.8,
    flamme: "grande",
    rayon: "#f08040",
    rayonPart: 0.3,
    faisceau: 0.06,
    ciel: ["#28285c", "#4b3b7a", "#9a4a78", "#e0683e", "#f6a24a"],
    collines: ["#4a2e52", "#2c1c3a"],
  },
  nuit: {
    ambiante: "#0b1844",
    part: 0.72,
    feu: 1,
    lanternes: 1,
    flamme: "grande",
    rayon: "#9db4ee",
    rayonPart: 0.22,
    faisceau: 0,
    ciel: ["#0a1230", "#0c1638", "#0f1b42", "#12214c", "#162857"],
    collines: ["#0d1a3d", "#060b1f"],
  },
};

/* ---------- Les repères de la pièce, en cases ---------- */

/** Le plafond finit rangée 4 ; le mur va de la rangée 5 au plancher (`HORIZON`). */
const PLAFOND = 5;
/** La cheminée : son axe, son ouverture, le linteau de bois. */
const FOYER = { gauche: 6, droite: 25, haut: 39, bas: 59, linteau: 36 } as const;
/** Les deux poteaux, de part et d'autre du Gaulois, et la rangée de leurs lanternes. */
const POTEAUX = [32, 87] as const;
const LANTERNE = 17;
/** La fenêtre : l'ouverture, entre ses volets ouverts. */
const FENETRE = { x: 100, y: 11, largeur: 17, hauteur: 19 } as const;
/** La chandelle du comptoir : le haut de sa cire. */
const CHANDELLE = { x: 96, y: 43 } as const;
/** Le comptoir, contre le mur de droite. */
const COMPTOIR = { x: 92, dessus: 47, bas: 61 } as const;

const FLAMMES = { r: "#e2452a", o: "#f58a1f", y: "#ffd75a", w: "#fff3c4" } as const;
const GRANDE_FLAMME = [
  "......r.......",
  ".....ro..r....",
  "..r..roo.r....",
  "..ro.royo.r...",
  ".rro.royo.ro..",
  ".royoroyyoro..",
  ".royyoyyyoyor.",
  "rooyyyywyyyor.",
  "royyywwwwyyoor",
  ".oyywwwwwwyyo.",
] as const;
const PETITE_FLAMME = ["...r....", "..ro.r..", ".royoro.", ".oyyyoor", "royywyyo"] as const;
const BRAISES = ["..r..", ".roo.", "royor"] as const;

const CRUCHE = [".aaa.", ".aba.", "aabaa", "abcba", "abcba", "abbba", ".aaa."] as const;
const CHOPE = ["aaaa.", "abcaa", "abba.", "aaaa."] as const;
const CHOPE_PENDUE = [".p...", "aaaa.", "abcaa", "abba.", "aaaa."] as const;

export const DECOR_TAVERNE: DessinDuLieu = (moment: Moment) => {
  const r = REGLAGES[moment.phase];
  const toile = new Toile("#70492c");

  /* ---------- 1. Les matières, en plein jour ---------- */

  // Le mur de planches : des lits de sept rangées, deux bruns qui alternent, des joints décalés.
  for (let y = PLAFOND; y < HORIZON; y++) {
    const lit = Math.floor(y / 7);
    for (let x = 0; x < LARGEUR; x++) {
      let couleur = lit % 2 === 0 ? "#7a5232" : "#70492c";
      if (y % 7 === 6 || (x + lit * 17) % 41 === 0) couleur = "#4f331d";
      else if (grain(x >> 1, lit + 60) % 83 === 0) couleur = "#5a3a20";
      else if (y % 7 === 0) couleur = lit % 2 === 0 ? "#80583a" : "#765034";
      toile.poser(x, y, couleur);
    }
  }
  // Le plafond : une poutre maîtresse, et le bout des solives.
  for (let x = 0; x < LARGEUR; x++) {
    for (let y = 0; y < PLAFOND; y++) toile.poser(x, y, y === 4 ? "#2a1a10" : y === 0 ? "#523419" : "#3d2616");
    if (x % 12 === 5) toile.bloc(x, 1, 3, 3, "#2a1a10");
  }
  // Le plancher : des lames de plus en plus larges vers nous.
  const lames = [HORIZON, 64, 69, 75, HAUTEUR];
  for (let y = HORIZON; y < HAUTEUR; y++) {
    let lame = 0;
    for (let i = 1; i < lames.length; i++) if (y >= (lames[i] ?? HAUTEUR)) lame = i;
    for (let x = 0; x < LARGEUR; x++) {
      let couleur = lame % 2 === 0 ? "#a07e50" : "#98774b";
      if (y === HORIZON) couleur = "#3d2616";
      else if (y === HORIZON + 1) couleur = "#7a5c3a";
      else if (lames.includes(y)) couleur = "#7a5c3a";
      else if ((x + lame * 29) % 47 === 0) couleur = "#75583a";
      else if (grain(x, y) % 41 === 0) couleur = "#8c6c44";
      toile.poser(x, y, couleur);
    }
  }
  // Le plancher nu, gardé pour savoir plus tard où le rayon de la fenêtre peut tomber.
  const plancherNu = toile.cases.slice();

  /** Une pierre du village : des moellons gris chauds en lits décalés. */
  const pierre = (x: number, y: number): string => {
    const lit = Math.floor(y / 4);
    const decale = x + (lit % 2) * 4;
    if (y % 4 === 3 || decale % 8 === 0) return "#4d4840";
    const ton = grain(Math.floor(decale / 8), lit) % 3;
    if (y % 4 === 0) return ton === 0 ? "#8a8376" : "#7d766a";
    return ton === 0 ? "#7d766a" : ton === 1 ? "#6a645a" : "#736c61";
  };

  // La cheminée : la hotte de pierre qui monte au plafond (le logo du clan se pose dessus), les jambages, l'âtre.
  for (let y = PLAFOND; y < FOYER.linteau; y++) {
    const demi = 10 + ((y - PLAFOND) * 4) / 30;
    const de = Math.round(15.5 - demi);
    const a = Math.round(15.5 + demi);
    for (let x = de; x <= a; x++) toile.poser(x, y, x === de || x === a ? "#3a362f" : pierre(x, y));
  }
  for (let y = FOYER.haut; y <= FOYER.bas; y++) {
    for (let x = 1; x <= 30; x++) {
      const dedans = x >= FOYER.gauche && x <= FOYER.droite;
      const coin = y === FOYER.haut && (x === FOYER.gauche || x === FOYER.droite);
      if (!dedans || coin) toile.poser(x, y, x === 1 || x === 30 ? "#3a362f" : pierre(x, y));
      else toile.poser(x, y, y % 4 === 3 || (x + Math.floor(y / 4) * 3) % 7 === 0 ? "#1c110b" : "#2a1a12");
    }
  }
  // Le linteau : une poutre posée sur les jambages.
  for (let x = 0; x <= 31; x++) {
    toile.poser(x, FOYER.linteau, "#9a6b3f");
    toile.poser(x, FOYER.linteau + 1, x % 9 === 4 ? "#523419" : "#70492c");
    toile.poser(x, FOYER.linteau + 2, "#3d2616");
  }
  // La pierre de l'âtre, qui avance sur le plancher.
  for (let x = 0; x <= 33; x++) {
    toile.poser(x, HORIZON, "#3a362f");
    toile.poser(x, HORIZON + 1, x % 11 === 6 ? "#6a645a" : "#8a8376");
    toile.poser(x, HORIZON + 2, x % 11 === 6 ? "#4d4840" : "#6a645a");
    toile.poser(x, HORIZON + 3, "#4d4840");
  }
  // Sur le linteau : une cruche et deux chopes.
  toile.grille(21, FOYER.linteau - 7, CRUCHE, { a: "#5a2f18", b: "#b0683c", c: "#d08a5a" });
  toile.grille(4, FOYER.linteau - 4, CHOPE, { a: "#3d2616", b: "#9a6b3f", c: "#c79a62" });
  toile.grille(12, FOYER.linteau - 4, CHOPE, { a: "#3d2616", b: "#9a6b3f", c: "#c79a62" });
  // Les bûches du foyer.
  toile.bloc(8, 57, 16, 2, "#4a2f1a");
  toile.bloc(8, 57, 16, 1, "#6a4424");
  toile.bloc(11, 55, 11, 2, "#5d3d22");
  for (const x of [8, 23]) toile.bloc(x, 57, 1, 2, "#b07a44");
  toile.poser(11, 55, "#b07a44");
  toile.poser(21, 56, "#b07a44");

  // Les poteaux, du plafond au plancher, et le tas de bûches au pied de celui de gauche.
  for (const x of POTEAUX) {
    for (let y = PLAFOND; y < HORIZON; y++) {
      toile.poser(x, y, "#684627");
      toile.poser(x + 1, y, y % 13 === 5 ? "#3d2616" : "#523419");
      toile.poser(x + 2, y, "#472d19");
      toile.poser(x + 3, y, "#2a1a10");
    }
    // Le crochet et la cage de la lanterne ; sa lumière vient plus tard.
    toile.grille(x - 1, LANTERNE - 2, ["..ff..", "..ff..", ".ffff.", "ffffff", "f....f", "f....f", "f....f", "f....f", "ffffff", ".ffff."], { f: "#2a2420" });
  }
  for (const [x, y] of [[31, 58], [35, 58], [33, 55]] as const) {
    toile.grille(x - 2, y - 1, [".aaa.", "abcba", "abbba", ".aaa."], { a: "#3d2616", b: "#9a6b3f", c: "#c79a62" });
  }

  // Les chopes pendues à leur tringle, sous le plafond.
  toile.bloc(40, 6, 44, 1, "#3d2616");
  for (let x = 42; x < 82; x += 7) toile.grille(x, 6, CHOPE_PENDUE, { p: "#2a1a10", a: "#5a2f18", b: "#b0683c", c: "#d08a5a" });

  // La fenêtre : le cadre, les deux volets ouverts, l'appui. Le ciel vient plus tard.
  const F = FENETRE;
  toile.bloc(F.x - 2, F.y - 2, F.largeur + 4, F.hauteur + 4, "#3d2616");
  toile.bloc(F.x - 1, F.y - 1, F.largeur + 2, F.hauteur + 2, "#523419");
  for (const [x, clair] of [[F.x - 6, 0], [F.x + F.largeur + 2, 3]] as const) {
    for (let y = F.y - 2; y < F.y + F.hauteur + 2; y++) {
      for (let dx = 0; dx < 4; dx++) {
        const traverse = (y - F.y) % 6 === 4;
        toile.poser(x + dx, y, traverse ? "#523419" : dx === clair ? (clair === 0 ? "#8a5a30" : "#523419") : "#6a4424");
      }
    }
  }
  toile.bloc(F.x - 3, F.y + F.hauteur + 2, F.largeur + 6, 1, "#9a6b3f");
  toile.bloc(F.x - 3, F.y + F.hauteur + 3, F.largeur + 6, 1, "#523419");

  // Le comptoir : le dessus, la façade de planches, la plinthe, son ombre sur le plancher.
  const K = COMPTOIR;
  for (let x = K.x; x < LARGEUR; x++) {
    toile.poser(x, K.dessus, "#d0a468");
    toile.poser(x, K.dessus + 1, (x - K.x) % 13 === 12 ? "#a07a48" : "#b98a52");
    toile.poser(x, K.dessus + 2, "#8a6238");
    toile.poser(x, K.dessus + 3, "#3d2616");
    for (let y = K.dessus + 4; y <= K.bas; y++) {
      let couleur = (x - K.x) % 6 === 5 ? "#523419" : Math.floor((x - K.x) / 6) % 2 === 0 ? "#7a5230" : "#74492c";
      if (x === K.x) couleur = "#8a5a30";
      if (y === K.bas) couleur = "#3d2616";
      if (y === K.dessus + 4) couleur = "#5d3d22";
      toile.poser(x, y, couleur);
    }
    for (let y = K.bas + 1; y <= K.bas + 2; y++) if ((x + y) % 2 === 0 || y === K.bas + 1) toile.poser(x, y, "#6a4f32");
  }
  // Sur le comptoir : une cruche, une chope, et le tonnelet couché sur son chevalet, sa cannelle en bas.
  toile.grille(100, K.dessus - 7, CRUCHE, { a: "#5a2f18", b: "#b0683c", c: "#d08a5a" });
  toile.grille(92, K.dessus - 4, CHOPE, { a: "#3d2616", b: "#9a6b3f", c: "#c79a62" });
  toile.bloc(CHANDELLE.x - 1, K.dessus - 1, 4, 1, "#5c6474");
  toile.bloc(CHANDELLE.x, CHANDELLE.y, 2, K.dessus - 1 - CHANDELLE.y, "#e9e2cf");
  toile.bloc(CHANDELLE.x + 1, CHANDELLE.y, 1, K.dessus - 1 - CHANDELLE.y, "#c9c0a8");
  const tx = 114;
  const ty = 40;
  toile.bloc(tx - 5, K.dessus - 2, 2, 2, "#5d3d22");
  toile.bloc(tx + 4, K.dessus - 2, 2, 2, "#5d3d22");
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const d = dx * dx + dy * dy;
      if (d > 36) continue;
      let couleur: string;
      if (d > 29) couleur = "#3d2616";
      else if (d > 21) couleur = dx + dy < 0 ? "#8d95a6" : "#5c6474";
      else if ((dy + 9) % 3 === 2) couleur = "#8a6238";
      else couleur = dx + dy < -3 ? "#d0a468" : dx + dy > 3 ? "#a07a48" : "#b98a52";
      toile.poser(tx + dx, ty + dy, couleur);
    }
  }
  toile.bloc(tx, ty + 2, 1, 2, "#3d2616");
  toile.poser(tx, ty + 4, "#8d95a6");

  /** Un tonneau debout, cerclé de fer : `x` sa gauche, `bas` la rangée où il pose. */
  const tonneau = (x: number, bas: number, largeur: number, hauteur: number) => {
    const haut = bas - hauteur + 1;
    for (let y = haut; y <= bas; y++) {
      const rang = y - haut;
      const retrait = rang < 2 || rang > hauteur - 3 ? 1 : 0;
      for (let i = retrait; i < largeur - retrait; i++) {
        let couleur = i % 4 === 3 ? "#6a4424" : i < 4 ? "#b07a44" : i > largeur - 5 ? "#7a5230" : "#9a6b3f";
        if (rang === 3 || rang === 4 || rang === hauteur - 5 || rang === hauteur - 4) couleur = i < 4 ? "#8d95a6" : "#5c6474";
        if (rang === 0) couleur = "#c79a62";
        if (i === retrait || i === largeur - 1 - retrait || rang === hauteur - 1) couleur = "#3d2616";
        toile.poser(x + i, y, couleur);
      }
    }
    for (let i = 1; i < largeur; i++) if (i % 2 === 0) toile.poser(x + i, bas + 1, "#6a4f32");
  };
  // Le tonneau du premier plan, devant le comptoir.
  tonneau(108, 77, 15, 20);

  // Le banc du premier plan, devant la cheminée, et la chope qu'on y a laissée.
  for (let x = 3; x <= 27; x++) {
    toile.poser(x, 69, "#d0a468");
    toile.poser(x, 70, (x - 3) % 12 === 11 ? "#a07a48" : "#b98a52");
    toile.poser(x, 71, "#8a6238");
    if ((x + 1) % 2 === 0) toile.poser(x, 77, "#75583a");
  }
  for (const x of [5, 24]) {
    toile.bloc(x, 72, 2, 5, "#6a4424");
    toile.bloc(x, 72, 1, 5, "#8a5a30");
  }
  toile.grille(9, 65, CHOPE, { a: "#3d2616", b: "#9a6b3f", c: "#c79a62" });

  /* ---------- 2. La lumière du moment ---------- */

  const sources = [
    { x: 15.5, y: 54, rayon: 58, force: r.feu },
    { x: POTEAUX[0] + 1.5, y: LANTERNE + 4, rayon: 28, force: r.lanternes },
    { x: POTEAUX[1] + 1.5, y: LANTERNE + 4, rayon: 28, force: r.lanternes },
    { x: CHANDELLE.x + 1, y: CHANDELLE.y - 1, rayon: 17, force: r.lanternes * 0.75 },
  ].filter((s) => s.force > 0);

  /** Le rayon de la fenêtre sur le plancher : un pan de lumière penché, coupé par l'ombre de la croisée. */
  const dansLeRayon = (x: number, y: number): boolean => {
    if (y < 65 || y > 78) return false;
    const de = 90 - (y - 65) * 0.77;
    const pas = (x - de) / (19 + (y - 65) * 0.3);
    if (pas < 0 || pas >= 1) return false;
    return Math.abs(pas - 0.5) > 0.04 && y !== 71;
  };

  /** Le même jour dans l'air, de la fenêtre au plancher : devant le mur et le comptoir, derrière le tonneau. */
  const dansLeFaisceau = (x: number, y: number): boolean => {
    if (y < F.y + F.hauteur + 2 || y > 64) return false;
    const t = (y - (F.y + F.hauteur)) / (65 - F.y - F.hauteur);
    return x >= Math.round(F.x - 10 * t) && x <= Math.round(F.x + F.largeur - 1 - 7.5 * t);
  };

  /** La couleur d'une matière à cet endroit, à ce moment : l'ambiance la gagne, les feux la lui rendent par anneaux. */
  const eclairer = (base: string, x: number, y: number): string => {
    const sombre = melanger(base, r.ambiante, r.part);
    let lueur = 0;
    for (const s of sources) {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < s.rayon) lueur += s.force * (1 - d / s.rayon) ** 1.15;
    }
    const anneau = Math.min(5, Math.floor(lueur * 5.5 + ((x + y) % 2 === 0 ? 0.3 : 0))) / 5;
    return anneau > 0 ? melanger(sombre, melanger(base, "#ff9c3a", 0.2), anneau) : sombre;
  };

  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const i = y * LARGEUR + x;
      const base = toile.cases[i] ?? "#70492c";
      let couleur = eclairer(base, x, y);
      if (base === plancherNu[i] && dansLeRayon(x, y)) couleur = melanger(couleur, r.rayon, r.rayonPart);
      else if (r.faisceau > 0 && dansLeFaisceau(x, y)) couleur = melanger(couleur, r.rayon, r.faisceau);
      toile.cases[i] = couleur;
    }
  }
  // Le jour qui entre éclaire aussi l'appui de la fenêtre et le dessus du comptoir.
  for (let x = F.x - 3; x < F.x + F.largeur + 3; x++) {
    toile.poser(x, F.y + F.hauteur + 2, melanger(toile.lire(x, F.y + F.hauteur + 2) ?? r.rayon, r.rayon, r.rayonPart));
    if (x >= F.x && x < F.x + F.largeur - 5) toile.poser(x - 4, K.dessus, melanger(toile.lire(x - 4, K.dessus) ?? r.rayon, r.rayon, r.rayonPart * 0.7));
  }

  /* ---------- 3. Ce qui brille : la fenêtre, les flammes, les lanternes ---------- */

  // Le ciel de la fenêtre, en cinq bandes cousues en damier.
  const bande = (y: number): number => Math.min(4, Math.floor(((y - F.y) * 5) / (F.hauteur - 2)));
  const ciel = new Map<number, string>();
  for (let y = F.y; y < F.y + F.hauteur; y++) {
    for (let x = F.x; x < F.x + F.largeur; x++) {
      const b = bande(y);
      const couture = bande(y + 1) > b && (x + y) % 2 === 0;
      ciel.set(y * LARGEUR + x, r.ciel[couture ? b + 1 : b] ?? r.ciel[4]);
    }
  }
  const auCiel = (x: number, y: number, couleur: string | ((fond: string) => string)) => {
    const i = y * LARGEUR + x;
    const fond = ciel.get(i);
    if (fond && Number.isInteger(x) && Number.isInteger(y)) ciel.set(i, typeof couleur === "string" ? couleur : couleur(fond));
  };
  // Les étoiles : la nuit, et la dernière à l'aube.
  if (moment.phase === "nuit") for (const [x, y] of [[102, 13], [109, 12], [114, 15], [105, 18], [112, 21], [101, 22]] as const) auCiel(x, y, (x + y) % 3 === 0 ? "#e3e9ff" : "#9aa8d6");
  if (moment.phase === "aube") auCiel(113, 13, "#e8dcf0");
  if (moment.phase === "crepuscule") auCiel(102, 13, "#b8a8d8");
  // L'astre : sa course traverse la fenêtre de gauche à droite, il se lève et se couche derrière les collines.
  if (moment.astre) {
    const course = Math.min(1, Math.max(0, moment.astre.course));
    const hauteur = Math.min(1, Math.max(0, moment.astre.hauteur));
    const ax = Math.round(F.x + 3 + course * (F.largeur - 7));
    const ay = Math.round(F.y + F.hauteur - 4 - hauteur * (F.hauteur - 8));
    const soleil = moment.astre.sorte === "soleil";
    const bas = hauteur < 0.3;
    const corps = soleil ? (bas ? "#ffb24a" : "#ffe27a") : "#e3e9ff";
    const coeur = soleil ? (bas ? "#ffd75a" : "#fff6c8") : "#f4f6ff";
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = dx * dx + dy * dy;
        if (d <= 3) auCiel(ax + dx, ay + dy, coeur);
        else if (d <= 9) auCiel(ax + dx, ay + dy, !soleil && dx + dy > 1 ? "#aab6dc" : corps);
        else if (d <= 17 && (soleil || (dx + dy) % 2 === 0)) auCiel(ax + dx, ay + dy, (fond) => melanger(fond, corps, soleil ? 0.38 : 0.16));
      }
    }
  }
  // Les collines au loin, puis la croisée de bois.
  for (let x = F.x; x < F.x + F.largeur; x++) {
    const crete = Math.round(F.y + F.hauteur - 3.4 - 1.3 * Math.sin(x / 3.3 + 0.8));
    for (let y = crete; y < F.y + F.hauteur; y++) auCiel(x, y, y >= F.y + F.hauteur - 2 + (x % 5 === 0 ? 1 : 0) ? r.collines[1] : r.collines[0]);
  }
  const croisee = eclairer("#3d2616", F.x + 8, F.y + 9);
  for (const [i, couleur] of ciel) {
    const x = i % LARGEUR;
    const y = Math.floor(i / LARGEUR);
    toile.poser(x, y, x === F.x + 8 || y === F.y + 9 ? croisee : couleur);
  }

  // Le feu de la cheminée : sa lueur dans l'âtre, puis la flamme.
  const lueurDuFoyer = r.flamme === "grande" ? 11 : r.flamme === "petite" ? 7 : 5;
  for (let y = FOYER.haut + 1; y <= FOYER.bas; y++) {
    for (let x = FOYER.gauche; x <= FOYER.droite; x++) {
      const d = Math.hypot(x - 15.5, (y - 54) * 1.2);
      if (d > lueurDuFoyer || (d > lueurDuFoyer - 3 && (x + y) % 2 === 0)) continue;
      const fond = toile.lire(x, y);
      if (fond) toile.poser(x, y, melanger(fond, r.flamme === "braises" ? "#b8402a" : "#f58a1f", d < lueurDuFoyer / 2 ? 0.5 : 0.28));
    }
  }
  if (r.flamme === "grande") toile.grille(9, 46, GRANDE_FLAMME, FLAMMES);
  else if (r.flamme === "petite") toile.grille(12, 51, PETITE_FLAMME, FLAMMES);
  else toile.grille(13, 53, BRAISES, FLAMMES);
  // Les braises sous les bûches.
  for (const x of [10, 13, 17, 20]) toile.poser(x, 58, r.flamme === "braises" ? "#b8402a" : "#f58a1f");
  if (r.flamme !== "grande") for (const x of [12, 15, 19]) toile.poser(x, 56, "#e2452a");

  // Les lanternes : allumées le soir et la nuit, mourantes à l'aube, éteintes le jour.
  for (const x of POTEAUX) {
    const verre = r.lanternes >= 0.8 ? ["#ffd75a", "#fff3c4"] : r.lanternes > 0 ? ["#c8742a", "#f5a83a"] : ["#5c6474", "#8d95a6"];
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const coeur = (dx === 1 || dx === 2) && (dy === 1 || dy === 2);
        toile.poser(x + dx, LANTERNE + 2 + dy, (coeur ? verre[1] : verre[0]) ?? "#5c6474");
      }
    }
    if (r.lanternes === 0) toile.poser(x, LANTERNE + 2, "#aab0bc");
  }

  // La chandelle du comptoir, allumée avec les lanternes.
  if (r.lanternes > 0) {
    toile.poser(CHANDELLE.x, CHANDELLE.y - 1, "#ffd75a");
    toile.poser(CHANDELLE.x + 1, CHANDELLE.y - 1, r.lanternes >= 0.8 ? "#fff3c4" : "#f58a1f");
    if (r.lanternes >= 0.8) toile.poser(CHANDELLE.x, CHANDELLE.y - 2, "#f58a1f");
  } else toile.poser(CHANDELLE.x, CHANDELLE.y - 1, "#3d2616");

  // L'ombre du Gaulois : le plancher de ce moment, assombri.
  const plancher = toile.lire(62, 73) ?? "#98774b";
  return toile.decor(melanger(plancher, moment.phase === "nuit" ? "#050915" : "#24160c", 0.55));
};
