/**
 * Le décor de /gaulois « maisons » : le dedans de la hutte ronde où dort le Gaulois — le lit de paille et sa couverture de
 * laine sous la petite fenêtre à volets, le foyer et ses pierres, des herbes à sécher, une peau tendue au mur, des pots de
 * terre —, aux quatre moments de la journée. Dessin original de Claude Fable 5.2 pour le clan [GAL], 14 novembre 2026 ;
 * rien n'y est emprunté à une œuvre existante.
 *
 * Tout est d'abord peint dans ses couleurs de plein jour, puis éclairé case par case : la pénombre du moment, le jour (ou
 * la lune) qui entre par la fenêtre, la lueur du foyer. Le ciel de la fenêtre et les flammes sont posés à la fin : ils
 * éclairent, on ne les éclaire pas.
 */
import type { Moment, Phase } from "../scene.ts";
import { HAUTEUR, HORIZON, LARGEUR, Toile, grain, melanger, type DessinDuLieu } from "./commun.ts";

/** Ce qui change d'un moment à l'autre. */
interface Ambiance {
  /** La pénombre de la pièce : chaque couleur est assombrie de `noir`, puis tirée vers `voile` de `part`. */
  noir: number;
  voile: string;
  part: number;
  /** Le ciel de la fenêtre, du haut vers l'horizon, et le dehors (colline, pieux de la palissade). */
  ciel: readonly [string, string, string, string];
  colline: string;
  pieux: string;
  /** Le jour qui entre : sa couleur, sa force dans la pièce, celle de la tache qu'il pose sur le lit et la terre. */
  jour: string;
  clarte: number;
  rayon: number;
  /** Le foyer : sa flamme, la couleur et la force de sa lueur, jusqu'où elle porte. */
  flamme: "braises" | "petite" | "calme" | "vive";
  lueur: string;
  chaleur: number;
  portee: number;
  /** Le lit est-il fait (le soir, la nuit) ou ouvert (il vient de se lever) ? */
  litFait: boolean;
  /** L'ombre du Gaulois sur la terre battue. */
  ombre: string;
}

const AMBIANCES: Readonly<Record<Phase, Ambiance>> = {
  aube: {
    noir: 0.16,
    voile: "#4a4470",
    part: 0.4,
    ciel: ["#6a6aa6", "#a67ea6", "#e3a08c", "#f6c898"],
    colline: "#7a6a8e",
    pieux: "#54425e",
    jour: "#f4b4a4",
    clarte: 0.42,
    rayon: 0.34,
    flamme: "braises",
    lueur: "#e8663a",
    chaleur: 0.5,
    portee: 15,
    litFait: false,
    ombre: "#2a2238",
  },
  jour: {
    noir: 0.1,
    voile: "#5a4630",
    part: 0.12,
    ciel: ["#4f9bdd", "#68ade6", "#84c0ee", "#a6d4f4"],
    colline: "#6f9d56",
    pieux: "#8a6238",
    jour: "#fff0c4",
    clarte: 0.5,
    rayon: 0.36,
    flamme: "petite",
    lueur: "#f5a83a",
    chaleur: 0.35,
    portee: 15,
    litFait: false,
    ombre: "#3a2a1a",
  },
  crepuscule: {
    noir: 0.2,
    voile: "#5a2c40",
    part: 0.36,
    ciel: ["#3f3270", "#84507e", "#d47852", "#f2a654"],
    colline: "#4a3458",
    pieux: "#2c1e36",
    jour: "#f29a58",
    clarte: 0.3,
    rayon: 0.3,
    flamme: "vive",
    lueur: "#f5a83a",
    chaleur: 0.8,
    portee: 44,
    litFait: true,
    ombre: "#26141c",
  },
  nuit: {
    noir: 0.3,
    voile: "#0d1a4a",
    part: 0.68,
    ciel: ["#0c1638", "#0f1b42", "#12214c", "#162857"],
    colline: "#0c1434",
    pieux: "#070d24",
    jour: "#8fa8ee",
    clarte: 0.5,
    rayon: 0.2,
    flamme: "calme",
    lueur: "#f5a83a",
    chaleur: 0.92,
    portee: 50,
    litFait: true,
    ombre: "#060b1f",
  },
};

/* ---------- Les repères de la hutte ---------- */

/** L'écart au milieu de la pièce, de −1 (bord gauche) à 1 (bord droit). */
const ecart = (x: number): number => (x - (LARGEUR - 1) / 2) / ((LARGEUR - 1) / 2);
/** La hutte est ronde : la sablière (la poutre qui porte le toit) remonte vers les bords, le pied du mur y descend. */
const hautDuMur = (x: number): number => 17 - Math.round(5 * ecart(x) ** 2);
const piedDuMur = (x: number): number => HORIZON + Math.round(5 * ecart(x) ** 2);

/** La fenêtre : son cadre, son ouverture, ses volets ouverts. */
const FENETRE = { x: 9, y: 23, largeur: 20, hauteur: 16 } as const;
const VUE = { x: FENETRE.x + 2, y: FENETRE.y + 2, largeur: 16, hauteur: 12 } as const;
/** Le foyer : le milieu de ses bûches. */
const FOYER = { x: 97, y: 71 } as const;

const BOIS = { clair: "#684627", fond: "#472d19", sombre: "#2a1a10" } as const;

/* ---------- Les petits dessins ---------- */

const FLAMMES: Readonly<Record<Ambiance["flamme"], readonly string[]>> = {
  braises: [],
  petite: [".......r.......", "......ror......", ".....rooyor....", ".....royyor...."],
  calme: [
    ".......r.......",
    "......rr.......",
    "......roor.....",
    "....r.rooor.r..",
    "....rrooyoorr..",
    "...rrooyyyoor..",
    "...rooyywyyor..",
    "...rrooyyyorr..",
  ],
  vive: [
    "......r........",
    "......rr.......",
    ".....rrr.......",
    ".....roor...r..",
    "..r.rrooor.rr..",
    "..rrrooyoorrr..",
    "..rroooyyoorr..",
    ".rrrooyyyooorr.",
    ".rrooyywyyoorr.",
    ".rrooyywwyyorr.",
    "..rooyywwyyor..",
    "..rrooyyyyorr..",
  ],
};
const BUCHES = [".eBBBBBBBBBBBe.", "sebbbbbbbbbbbes", "sS.sS.sSs.Ss.Ss", "ss.ss.sss.ss.ss"] as const;
/** Les braises : ce qui rougeoie encore dans les bûches (posé à la fin, par-dessus). */
const BRAISES = ["...r.o..r.o.r..", "..r.o.rr.o.r..."] as const;
const COULEURS_DU_FEU: Readonly<Record<string, string>> = {
  r: "#e2452a",
  o: "#f58a1f",
  y: "#ffd75a",
  w: "#fff1a8",
  B: "#835a33",
  b: "#5d3d22",
  e: "#b98a52",
  s: "#5c6474",
  S: "#8d95a6",
};

/** La peau tendue au mur, pendue à deux chevilles. */
const PEAU = [
  "..c.........c..",
  ".lff.......ffd.",
  ".lfff.lff.fffd.",
  "..lffffffffffd.",
  "...lfffsfffd...",
  "...lfffsfffd...",
  "...lffssfffd...",
  "...lffssfffd...",
  "..lfffssffffd..",
  "..lfffssffffd..",
  "...lffssfffd...",
  "...lfffsfffd...",
  "..lffffsffffd..",
  ".lfff.fffd.ffd.",
  ".lfd..lffd..fd.",
  "......lfd......",
  ".......d.......",
] as const;
const COULEURS_DE_LA_PEAU: Readonly<Record<string, string>> = { c: "#2a1a10", l: "#c9b692", f: "#a48e6c", s: "#857056", d: "#544330" };

const JARRE = ["..ooooo..", "...ddd...", "..lmmmd..", ".lmmmmmd.", "lmmmmmmdd", "lmmmmmmdd", "bbbbbbbbb", "lmmmmmmdd", "lmmmmmmdd", ".lmmmmdd.", "..mmmdd..", "..ddddd.."] as const;
const POT = [".ooooo.", "lmmmmdd", "lmmmmdd", "bbbbbbb", ".mmmdd.", "..ddd.."] as const;
const COULEURS_DE_TERRE: Readonly<Record<string, string>> = { o: "#c08e62", l: "#b98258", m: "#a06a44", d: "#7a4c30", b: "#6a3f28" };

/* ---------- Le décor ---------- */

export const DECOR_MAISONS: DessinDuLieu = (moment: Moment) => {
  const a = AMBIANCES[moment.phase];
  const toile = new Toile("#6b5439");

  // Le sol : la terre battue, des brins de paille, le bas plus sombre.
  for (let y = HORIZON; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x, y) % 100;
      let couleur = g < 2 ? "#b89c5f" : g < 7 ? "#5f4a32" : g > 95 ? "#775f41" : "#6b5439";
      if (y >= 77 || (y === 76 && (x + y) % 2 === 0)) couleur = melanger(couleur, "#2a1a10", 0.22);
      toile.poser(x, y, couleur);
    }
  }
  // Le toit vu du dedans, la sablière, le mur de clayonnage : tout suit la rondeur de la hutte.
  for (let x = 0; x < LARGEUR; x++) {
    const haut = hautDuMur(x);
    const pied = piedDuMur(x);
    const bombe = Math.round(5 * ecart(x) ** 2);
    for (let y = 0; y < haut; y++) {
      // Le chaume en couches, et les chevrons qui montent vers le faîte.
      const pente = ((x - (LARGEUR - 1) / 2) / (y + 34)) * 7;
      const pres = Math.abs(pente - Math.round(pente)) * ((y + 34) / 7);
      let couleur = (y + bombe) % 5 === 1 ? "#453521" : grain(x, y) % 9 === 0 ? "#5e4a30" : "#54422c";
      if (pres < 0.55) couleur = "#73522f";
      else if (pres < 1.5 && pente > Math.round(pente)) couleur = "#32230f";
      toile.poser(x, y, couleur);
    }
    for (let y = haut; y < haut + 3; y++) toile.poser(x, y, y === haut ? "#523419" : y === haut + 1 ? "#3d2616" : BOIS.sombre);
    for (let y = haut + 3; y < pied; y++) {
      // Les brins du clayonnage, couchés, courbes comme le mur.
      const rang = Math.round(((y - haut - 3) / (pied - haut - 3)) * 40);
      let couleur = rang % 3 === 2 ? "#7c6040" : grain(x, y) % 16 === 0 ? "#8a6c47" : "#94744c";
      if (y === haut + 3) couleur = "#6b5236";
      toile.poser(x, y, melanger(couleur, "#3d2616", 0.2 * ecart(x) ** 2));
    }
    toile.poser(x, pied, "#3d2616");
  }
  // Les poteaux.
  for (const x of [0, 35, 86, 121]) {
    for (let i = 0; i < 3; i++) {
      for (let y = hautDuMur(x + i) + 3; y <= piedDuMur(x + i); y++) toile.poser(x + i, y, i === 0 ? BOIS.clair : i === 2 ? BOIS.sombre : BOIS.fond);
    }
  }

  // La fenêtre : ses volets ouverts, son cadre, son appui. Le ciel vient à la fin.
  for (const [x, bord] of [[FENETRE.x - 5, 0], [FENETRE.x + FENETRE.largeur, 4]] as const) {
    for (let j = 0; j < FENETRE.hauteur; j++) {
      for (let i = 0; i < 5; i++) toile.poser(x + i, FENETRE.y + j, j % 5 === 4 ? "#523419" : i === bord ? (bord === 0 ? "#8a5a30" : "#523419") : "#70492c");
    }
  }
  toile.bloc(FENETRE.x, FENETRE.y, FENETRE.largeur, FENETRE.hauteur, "#3d2616");
  toile.bloc(FENETRE.x - 1, FENETRE.y + FENETRE.hauteur, FENETRE.largeur + 2, 2, "#8a5a30");
  toile.bloc(FENETRE.x - 1, FENETRE.y + FENETRE.hauteur + 1, FENETRE.largeur + 2, 1, "#684627");

  // Les herbes à sécher, pendues à la sablière au-dessus du foyer.
  [91, 96, 101].forEach((x, k) => {
    const haut = hautDuMur(x) + 3;
    toile.bloc(x, haut, 1, 3, "#8a7a55");
    for (let j = 0; j < 6; j++) {
      for (let i = -1; i <= 1; i++) {
        if ((j === 0 || j === 5) && i !== 0) continue;
        toile.poser(x + i, haut + 3 + j, (i + j) % 2 === 0 ? (k === 1 ? "#c9a23a" : "#6f9d56") : k === 1 ? "#9c7a1f" : "#4f7d3a");
      }
    }
  });
  // La peau au mur, les pots au pied du mur.
  toile.grille(105, 27, PEAU, COULEURS_DE_LA_PEAU);
  toile.grille(106, 56, JARRE, COULEURS_DE_TERRE);
  toile.grille(115, 64, POT, COULEURS_DE_TERRE);
  toile.bloc(107, 68, 8, 1, "#54422e");
  toile.bloc(116, 70, 5, 1, "#54422e");

  // Le lit : le cadre de bois, la paille, l'oreiller, la couverture de laine.
  toile.bloc(3, 73, 31, 1, "#4a3824");
  toile.bloc(2, 50, 2, 24, BOIS.fond);
  toile.bloc(2, 50, 1, 23, BOIS.clair);
  toile.bloc(2, 50, 2, 1, "#8a5a30");
  toile.bloc(33, 54, 2, 20, BOIS.fond);
  toile.bloc(34, 54, 1, 19, BOIS.sombre);
  toile.bloc(33, 54, 2, 1, "#8a5a30");
  for (let y = 56; y <= 70; y++) {
    for (let x = 4; x <= 32; x++) {
      const g = grain(x + 40, y) % 100;
      const paille = g < 12 ? "#b3964f" : g > 89 ? "#dcc480" : "#cdb26a";
      toile.poser(x, y, y >= 69 ? melanger(paille, "#7a5c2e", 0.45) : paille);
    }
  }
  toile.bloc(4, 71, 29, 1, "#7a5232");
  toile.bloc(4, 72, 29, 1, "#5d3d22");
  for (let y = 57; y <= 65; y++) {
    for (let x = 5; x <= 12; x++) {
      if ((x === 5 || x === 12) && (y === 57 || y === 65)) continue;
      toile.poser(x, y, x === 12 || y === 65 ? "#cfc5aa" : "#e9e2cf");
    }
  }
  const debut = a.litFait ? 14 : 20;
  const revers = a.litFait ? 3 : 4;
  for (let y = 56; y <= 70; y++) {
    for (let x = debut; x <= 32; x++) {
      let couleur = "#a8483a";
      if (x < debut + revers) couleur = y >= 69 ? "#cfc5aa" : "#efe6d0";
      else if (x === debut + revers || (x - 14) % 5 === 4 || y === 70 || y === 56) couleur = "#7e3028";
      else if (y >= 69) couleur = "#8e3a30";
      else if (y === 58 || y === 59) couleur = "#c96a58";
      toile.poser(x, y, couleur);
    }
  }
  // Le lit ouvert : la couverture repoussée fait un bourrelet.
  if (!a.litFait) for (let y = 57; y <= 68; y++) toile.poser(debut + revers + 1, y, "#c96a58");

  // Le foyer : la cendre, les pierres, les bûches.
  for (let y = FOYER.y - 2; y <= FOYER.y + 2; y++) {
    for (let x = FOYER.x - 11; x <= FOYER.x + 11; x++) {
      const d = ((x - FOYER.x) / 11) ** 2 + ((y - FOYER.y) / 2.6) ** 2;
      if (d <= 1) toile.poser(x, y, grain(x, y) % 5 === 0 ? "#6e6456" : d > 0.6 ? "#4f3f2c" : "#463828");
    }
  }
  toile.grille(FOYER.x - 7, FOYER.y - 3, BUCHES, COULEURS_DU_FEU);

  /* ----- La lumière ----- */

  // Un dégradé en paliers nets, cousus par une mince couture en damier : `v` de 0 à 1, rendu sur cinq marches.
  const marches = (v: number, x: number, y: number): number => Math.min(1, Math.max(0, Math.floor(v * 5 + ((x + y) % 2 === 0 ? 0.14 : -0.14)) / 5));
  // Le rayon qui entre par la fenêtre va vers le milieu de la pièce, plus ou moins loin selon la place de l'astre.
  const penche = moment.astre ? 0.82 - 0.25 * Math.min(1, Math.max(0, moment.astre.course)) : 0.7;
  const force = moment.phase === "nuit" && !moment.astre ? 0.45 : 1;
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const base = toile.lire(x, y)!;
      let couleur = melanger(melanger(base, "#000000", a.noir), a.voile, a.part);
      // Le jour (ou la lune) : une clarté douce sous la fenêtre, jusqu'au lit.
      const loin = Math.hypot((x - (VUE.x + 8)) / 1.25, y - (VUE.y + 15));
      couleur = melanger(couleur, melanger(base, a.jour, 0.22), marches(1 - loin / 46, x, y) * a.clarte * force);
      // Le rayon : un voile dans l'air, puis les deux carreaux de la fenêtre posés sur la terre battue, à droite du lit.
      const source = x - (y - (VUE.y + VUE.hauteur)) * penche;
      if (y >= FENETRE.y + FENETRE.hauteur + 2 && source >= VUE.x && source < VUE.x + VUE.largeur) {
        if (y < 66) couleur = melanger(couleur, a.jour, a.rayon * 0.2 * force);
        else if (y <= 77 && x >= 36 && !(source >= VUE.x + 7 && source < VUE.x + 9)) couleur = melanger(couleur, melanger(base, a.jour, 0.4), a.rayon * force * 1.7);
      }
      // La lueur du foyer.
      const duFeu = Math.hypot((x - FOYER.x) / 1.4, y - (FOYER.y - 5));
      couleur = melanger(couleur, melanger(base, a.lueur, 0.42), marches(1 - duFeu / a.portee, x, y) * a.chaleur);
      toile.poser(x, y, couleur);
    }
  }

  /* ----- Ce qui éclaire ----- */

  // Le ciel de la fenêtre, le dehors, l'astre, puis le montant.
  for (let j = 0; j < VUE.hauteur; j++) {
    const bande = j < 4 ? 0 : j < 7 ? 1 : j < 9 ? 2 : 3;
    for (let i = 0; i < VUE.largeur; i++) toile.poser(VUE.x + i, VUE.y + j, a.ciel[bande]!);
  }
  if (moment.phase === "nuit" || moment.phase === "aube") {
    const etoile = moment.phase === "nuit" ? "#c0c9e2" : melanger(a.ciel[0], "#ffffff", 0.35);
    for (const [i, j] of moment.phase === "nuit" ? [[2, 1], [12, 2], [5, 5], [14, 6], [10, 0]] : [[12, 1], [3, 2]]) toile.poser(VUE.x + i!, VUE.y + j!, etoile);
  }
  if (moment.astre) {
    const cx = VUE.x + 2 + Math.round(Math.min(1, Math.max(0, moment.astre.course)) * (VUE.largeur - 5));
    const cy = VUE.y + VUE.hauteur - 3 - Math.round(Math.max(0, moment.astre.hauteur) * (VUE.hauteur - 6));
    const dedans = (x: number, y: number) => x >= VUE.x && x < VUE.x + VUE.largeur && y >= VUE.y && y < VUE.y + VUE.hauteur;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3 || !dedans(cx + dx, cy + dy)) continue;
        if (moment.astre.sorte === "soleil") {
          const coeur = Math.abs(dx) + Math.abs(dy) <= 1;
          const teinte = moment.phase === "jour" ? (coeur ? "#fff8d8" : "#ffe78a") : moment.phase === "aube" ? (coeur ? "#fff0d0" : "#ffd0a0") : coeur ? "#ffe0a0" : "#ffb45a";
          toile.poser(cx + dx, cy + dy, teinte);
        } else if (Math.hypot(dx + 1.2, dy + 0.8) > 2.1) {
          toile.poser(cx + dx, cy + dy, dx + dy >= 2 ? "#b9c3de" : "#e8ecf8");
        }
      }
    }
  }
  // Le dehors : une colline, et les pieux de la palissade.
  for (let i = 0; i < VUE.largeur; i++) {
    const colline = VUE.y + VUE.hauteur - 3 - Math.round(1.2 * Math.sin(i / 3.2 + 0.8));
    for (let y = colline; y < VUE.y + VUE.hauteur; y++) toile.poser(VUE.x + i, y, a.colline);
    if (i % 3 === 2) continue;
    for (let y = VUE.y + VUE.hauteur - (Math.floor(i / 3) % 2 === 0 ? 3 : 2); y < VUE.y + VUE.hauteur; y++) toile.poser(VUE.x + i, y, a.pieux);
  }
  const montant = melanger(melanger("#3d2616", "#000000", a.noir), a.voile, a.part);
  toile.bloc(VUE.x + 7, VUE.y, 2, VUE.hauteur, montant);

  // Le feu : la flamme du moment, ou les braises qui rougeoient.
  const flamme = FLAMMES[a.flamme];
  toile.grille(FOYER.x - 7, FOYER.y - 3 - flamme.length, flamme, COULEURS_DU_FEU);
  if (a.flamme === "braises") {
    toile.grille(FOYER.x - 7, FOYER.y - 3, BRAISES, COULEURS_DU_FEU);
    // Un filet de fumée, à peine.
    const fumee = melanger(montant, "#b8b4c4", 0.5);
    for (const [dx, dy] of [[0, -5], [1, -7], [0, -9], [-1, -11], [0, -13]] as const) {
      const fond = toile.lire(FOYER.x + dx, FOYER.y + dy);
      if (fond) toile.poser(FOYER.x + dx, FOYER.y + dy, melanger(fond, fumee, 0.45));
    }
  } else {
    toile.grille(FOYER.x - 7, FOYER.y - 3, ["", "...r...o..r....", ""], COULEURS_DU_FEU);
  }

  return toile.decor(a.ombre);
};
