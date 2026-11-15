/**
 * Bannières, lot B, « Les mers » : la guerre et le commerce sur l'eau. Huit fonds de l'image de /gaulois : une flotte
 * en ligne sur une mer grise, un archipel turquoise, un port marchand au couchant, un convoi pris dans les glaces, un
 * débarquement à l'aube, une bataille navale de nuit, une mer de lueurs, et un cuirassé géant sous l'orage. Voir
 * `commun.ts`. Dessins originaux de Claude Fable 5.2 pour le clan [GAL], 15 novembre 2026 : rien n'y est emprunté à une
 * œuvre existante ni aux images d'OpenFront.
 */
import { HAUTEUR, LARGEUR, Toile, grain, melanger, type BanniereDuLot, type Decor } from "./commun.ts";

type Point = readonly [number, number];
type Pinceau = (x: number, y: number) => void;
type Couleurs = Readonly<Record<string, string>>;

/* ------------------------------------------------------------------ les outils du lot */

/** Mêle une couleur à celle de la case : `part` de 0 (rien) à 1 (tout). */
function teinter(t: Toile, x: number, y: number, couleur: string, part: number): void {
  const fond = t.lire(x, y);
  if (fond && part > 0) t.poser(x, y, melanger(fond, couleur, part));
}

/** Des bandes horizontales sur toute la largeur : [rangée de début, couleur], jusqu'à `fin`. Une rangée en damier adoucit
 * chaque passage. */
function bandes(t: Toile, limites: readonly (readonly [number, string])[], fin: number, trame = true): void {
  limites.forEach(([y0, couleur], i) => {
    const suivante = limites[i + 1];
    const y1 = suivante ? suivante[0] : fin;
    t.bloc(0, y0, LARGEUR, y1 - y0, couleur);
    if (trame && suivante) for (let x = 0; x < LARGEUR; x++) if ((x + y1) % 2 === 0) t.poser(x, y1 - 1, suivante[1]);
  });
}

/** Passe le pinceau sur chaque case d'un polygone. */
function polygone(points: readonly Point[], pinceau: Pinceau): void {
  const ys = points.map((p) => p[1]);
  const haut = Math.max(0, Math.ceil(Math.min(...ys)));
  const bas = Math.min(HAUTEUR - 1, Math.floor(Math.max(...ys)));
  for (let y = haut; y <= bas; y++) {
    const xs: number[] = [];
    points.forEach(([x1, y1], i) => {
      const [x2, y2] = points[(i + 1) % points.length] ?? [x1, y1];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    });
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.round(xs[k] ?? 0); x <= Math.round(xs[k + 1] ?? 0); x++) pinceau(x, y);
    }
  }
}

/** Passe le pinceau sur chaque case d'une ellipse ; `d` va de 0 au centre à 1 au bord. */
function ellipse(cx: number, cy: number, rx: number, ry: number, pinceau: (x: number, y: number, d: number) => void): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      if (d <= 1) pinceau(x, y, d);
    }
  }
}

/** Une lueur ronde, en paliers nets (pas de fondu case par case). */
function halo(t: Toile, cx: number, cy: number, rx: number, ry: number, couleur: string, force: number, paliers = 4): void {
  ellipse(cx, cy, rx, ry, (x, y, d) => teinter(t, x, y, couleur, (force * Math.ceil((1 - d) * paliers)) / paliers));
}

/** Passe le pinceau le long d'un trait. */
function trait(x0: number, y0: number, x1: number, y1: number, pinceau: Pinceau): void {
  const pas = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= pas; i++) pinceau(Math.round(x0 + ((x1 - x0) * i) / pas), Math.round(y0 + ((y1 - y0) * i) / pas));
}

/** Un tirage fixe par case, sans les alignements de `grain` : pour les semis qui se voient (vagues, reflets, pluie). */
function hasard(x: number, y: number): number {
  const g = grain(x, y);
  return grain(g & 1023, (g >>> 10) & 1023);
}

/** Les crêtes d'une mer : des tirets clairs et sombres, plus longs vers le bas (plus près). */
function vagues(t: Toile, y0: number, y1: number, claire: string, sombre: string, rare = 9, part = 1): void {
  for (let y = y0; y < y1; y++) {
    const long = 1 + Math.floor(((y - y0) * 5) / Math.max(1, y1 - y0));
    for (let x = -6; x < LARGEUR; x++) {
      const g = hasard(x, y);
      if (g % (rare + long * 3) === 0) for (let k = 0; k <= long + ((g >> 9) % 2); k++) teinter(t, x + k, y, claire, part);
      else if (g % (rare + long * 3) === 1) for (let k = 0; k <= long; k++) teinter(t, x + k, y, sombre, part);
    }
  }
}

/** Le reflet d'une lumière sur l'eau : une colonne de tirets qui s'élargit vers le bas. */
function reflet(t: Toile, cx: number, y0: number, y1: number, l0: number, l1: number, couleur: string, part: number): void {
  for (let y = y0; y < y1; y++) {
    const demi = l0 + ((l1 - l0) * (y - y0)) / Math.max(1, y1 - y0 - 1);
    for (let x = Math.round(cx - demi); x <= Math.round(cx + demi); x++) {
      if (hasard(x >> 1, y) % 3 === 0) continue;
      teinter(t, x, y, couleur, part * (1 - (Math.abs(x - cx) / (demi + 1)) * 0.7));
    }
  }
}

/** Des étoiles semées dans un rectangle, hors du coin calme si on le demande. */
function etoiles(t: Toile, y0: number, y1: number, couleurs: readonly string[], rare: number, sauf?: (x: number, y: number) => boolean): void {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x * 3, y * 7 + 5);
      if (g % rare === 0 && !(sauf && sauf(x, y))) t.poser(x, y, couleurs[(g >> 8) % couleurs.length] ?? "#ffffff");
    }
  }
}

/** Un nuage plat : pour chaque rangée, son retrait et sa longueur ; dessus clair, dessous dans l'ombre. */
function nuage(t: Toile, x: number, y: number, rangs: readonly Point[], haut: string, bas: string, part = 1): void {
  rangs.forEach(([retrait, longueur], i) => {
    for (let k = 0; k < longueur; k++) teinter(t, x + retrait + k, y + i, i >= rangs.length - 1 && rangs.length > 1 ? bas : haut, part);
  });
}

/** Le miroir d'une grille de lettres (un navire qui va dans l'autre sens). */
const miroir = (lignes: readonly string[]): string[] => lignes.map((l) => [...l].reverse().join(""));

/** Le coin calme, avec une marge : là, ni étoile vive ni détail. */
const dansLeCoin = (x: number, y: number): boolean => x < 50 && y < 27;

/* ------------------------------------------------------------------ les navires, en grilles */

/** Un navire de guerre de profil, la proue à gauche. k coque sombre, h coque, l liston clair, s château, w hublot,
 * m mât, c cheminée, t tourelle, b canon. */
const NAVIRE_DE_GUERRE = [
  "..................m...............",
  "..................m...............",
  ".................mmm....c.........",
  "................ssss...ccc........",
  "...............sswsss..ccc........",
  "....bbtt......sssssssssssss.ttbb..",
  "......tt...sswswswsssssssss.tt....",
  "llllllllllllllllllllllllllllllllll",
  ".hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh.",
  "..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..",
] as const;

/** Le même, plus loin. */
const NAVIRE_AU_LOIN = [
  ".........m........",
  "........mm..c.....",
  ".......ssss.c.....",
  "..bt..ssssssss.tb.",
  "llllllllllllllllll",
  ".hhhhhhhhhhhhhhhh.",
] as const;

/** Et tout au fond, sur l'horizon. */
const NAVIRE_A_L_HORIZON = ["....m....", "..bsss.b.", "hhhhhhhhh"] as const;

/** Un bateau de commerce de profil, la proue à droite. o or, p caisses, r ligne de flottaison. */
const BATEAU_DE_COMMERCE = [
  "......m.......................",
  "......m.......................",
  ".....mmm......................",
  "...ssssss................m....",
  "...swswss..o...oo..o.....m....",
  "...ssssss.ooo.oooo.oo.pp.m....",
  "l..ssssss.ooooooooooo.pp.m..ll",
  "llllllllllllllllllllllllllllll",
  ".hhhhhhhhhhhhhhhhhhhhhhhhhhhh.",
  "..rrrrrrrrrrrrrrrrrrrrrrrrrr..",
] as const;

const COMMERCE_AU_LOIN = ["...m..........", "..sss.o.oo.o..", "llllllllllllll", ".hhhhhhhhhhhh."] as const;

/** Un palmier. f palme, g palme claire, t tronc, u tronc dans l'ombre. */
const PALMIER = [
  "....ff....ff....",
  "..ffgfff.fgfff..",
  ".ff..fgffffggff.",
  "f...fffgfff..fff",
  "...ff.ftuf.ff..f",
  "..ff..ftu...ff..",
  "..f...tu.....f..",
  "......tu........",
  ".....tu.........",
  ".....tu.........",
  "....tu..........",
  "....tu..........",
  "....tu..........",
  "...ttu..........",
] as const;

/* ------------------------------------------------------------------ 1. commun : la flotte en ligne */

function flotteEnLigne(): Decor {
  const t = new Toile("#8a98a8");
  bandes(t, [[0, "#8a98a8"], [15, "#99a6b4"], [27, "#adb8c2"], [36, "#c2cad0"], [42, "#d6dada"]], 46);
  // Le soleil derrière le voile de nuages.
  halo(t, 101, 13, 17, 11, "#f1efe4", 0.45, 3);
  ellipse(101, 13, 4, 4, (x, y) => t.poser(x, y, "#f3f1e8"));
  nuage(t, 78, 21, [[6, 30], [0, 44]], "#bcc5cc", "#a4afba");
  nuage(t, 2, 31, [[4, 22], [0, 34]], "#b9c2ca", "#a7b2bc");
  nuage(t, 60, 5, [[3, 24], [0, 30]], "#9ca9b6", "#93a0ae");
  // La mer grise.
  bandes(t, [[46, "#7b8e9e"], [49, "#6a7f92"], [54, "#5a6f85"], [60, "#4d6179"]], 66);
  vagues(t, 47, 66, "#93a4b0", "#44566c", 10);
  reflet(t, 101, 46, 62, 3, 8, "#d9dcd8", 0.4);
  // La ligne de bataille : du plus loin, à gauche, au plus près, à droite.
  const loin: Couleurs = { m: "#5c6b7c", b: "#5c6b7c", s: "#5c6b7c", h: "#566576" };
  const milieu: Couleurs = { m: "#4a586a", c: "#445264", s: "#536174", w: "#7c8a9a", b: "#445264", t: "#4a586a", l: "#6a798a", h: "#445264", k: "#3c495a" };
  const pres: Couleurs = { m: "#2c3746", c: "#2a3442", s: "#3a4657", w: "#c9cfcf", b: "#252f3c", t: "#323d4d", l: "#566376", h: "#2f3a49", k: "#252f3c" };
  t.grille(40, 44, NAVIRE_A_L_HORIZON, loin);
  t.grille(76, 44, NAVIRE_A_L_HORIZON, loin);
  t.grille(3, 41, NAVIRE_DE_GUERRE, milieu);
  t.grille(87, 44, NAVIRE_DE_GUERRE, pres);
  // Les fumées, couchées par le vent.
  for (const [x, y, l] of [[112, 44, 5], [114, 42, 6], [117, 40, 5], [28, 41, 5], [30, 39, 6], [33, 37, 5]] as const) {
    for (let k = 0; k < l; k++) teinter(t, x + k, y, "#6f7c8a", 0.6);
  }
  // Le sillage et l'écume au pied des coques.
  for (let x = 85; x < 123; x++) if (grain(x, 54) % 3 !== 0) t.poser(x, 54, "#b4c0c6");
  for (let x = 1; x < 39; x++) if (grain(x, 51) % 3 !== 0) t.poser(x, 51, "#a2b0ba");
  // Le quai de pierre.
  t.bloc(0, 65, LARGEUR, 1, "#3e4c5e");
  t.bloc(0, 66, LARGEUR, 2, "#a9afb1");
  t.bloc(0, 68, LARGEUR, 12, "#8b9195");
  for (let rang = 0; rang < 3; rang++) {
    const y = 68 + rang * 4;
    t.bloc(0, y + 3, LARGEUR, 1, "#767d84");
    for (let x = (rang * 7) % 16; x < LARGEUR; x += 16) t.bloc(x, y, 1, 3, "#767d84");
    for (let x = 0; x < LARGEUR; x++) if (grain(x, y) % 23 === 0) t.bloc(x, y + 1, 2, 1, "#999fa2");
  }
  // Deux bittes d'amarrage et un bout de chaîne.
  for (const x of [18, 102]) {
    t.bloc(x, 61, 5, 6, "#39424e");
    t.bloc(x - 1, 60, 7, 2, "#2c3540");
    t.bloc(x, 60, 3, 1, "#5b6777");
    t.bloc(x - 1, 67, 8, 1, "#6c737a");
  }
  return t.decor("#646b73");
}

/* ------------------------------------------------------------------ 2. commun : l'archipel turquoise */

function archipelTurquoise(): Decor {
  const t = new Toile("#3f93d6");
  bandes(t, [[0, "#3f93d6"], [16, "#56a5de"], [28, "#73b9e6"], [37, "#98cfee"], [43, "#c3e4f3"]], 47);
  const blanc = "#f6fbfc";
  const gris = "#cfe3ee";
  nuage(t, 82, 5, [[10, 8], [6, 16], [2, 25], [0, 31], [1, 29], [6, 20]], blanc, gris);
  nuage(t, 56, 14, [[4, 6], [1, 13], [0, 17], [3, 11]], blanc, gris);
  nuage(t, 6, 33, [[4, 9], [0, 19], [3, 12]], "#e8f4f9", "#c6dfec");
  nuage(t, 96, 30, [[2, 8], [0, 14]], "#e8f4f9", "#c6dfec");
  // La mer : du bleu du large au vert du lagon.
  bandes(t, [[47, "#1d7db6"], [50, "#2196c0"], [54, "#35b4c6"], [58, "#5ccfcb"], [61, "#93e3d4"]], 64);
  vagues(t, 48, 61, "#8fe0dc", "#1a6fa6", 12, 0.8);
  // Les îles : colline verte, anneau de sable, reflet clair.
  const ile = (cx: number, rx: number, ry: number): void => {
    ellipse(cx, 47, rx + 4, 2.4, (x, y) => t.poser(x, y, y >= 47 ? "#7fdcd6" : "#f2e2a8"));
    ellipse(cx, 47, rx, ry, (x, y, d) => {
      if (y < 47) t.poser(x, y, x - cx < -rx * 0.25 + (47 - y) * 0.3 && d > 0.45 ? "#2f8a4c" : d > 0.8 ? "#3f9d55" : "#55b463");
    });
    for (let x = cx - rx - 3; x <= cx + rx + 3; x++) if (grain(x, 46) % 2 === 0) t.poser(x, 46, "#f2e2a8");
  };
  ile(104, 14, 9);
  ile(15, 8, 4);
  const palme: Couleurs = { f: "#2c7f45", g: "#62c06a", t: "#a8793f", u: "#7c5630" };
  t.grille(92, 28, PALMIER, palme);
  t.grille(104, 25, miroir(PALMIER), palme);
  t.grille(8, 33, PALMIER.slice(0, 5).concat(PALMIER.slice(8)), palme);
  // Une voile de commerce entre les îles.
  t.grille(32, 40, ["...v.", "..vv.", ".vvv.", ".vvv.", "..m..", "bbbbb"], { v: "#fbfdfd", m: "#7c5630", b: "#8a4b32" });
  t.bloc(31, 46, 7, 1, "#bfeee8");
  // L'écume et la plage.
  for (let x = 0; x < LARGEUR; x++) {
    const bord = 63 + (Math.sin(x / 9) > 0.3 ? 1 : 0);
    t.bloc(x, bord, 1, 2, "#fbfefd");
    t.bloc(x, bord + 2, 1, 2, "#dcc486");
    t.bloc(x, bord + 4, 1, 80 - bord - 4, "#f1dda0");
  }
  for (let y = 69; y < 80; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x, y);
      if (g % 37 === 0) t.bloc(x, y, 2, 1, "#f9ebbd");
      else if (g % 41 === 0) t.bloc(x, y, 2, 1, "#e2c98a");
    }
  }
  t.bloc(0, 77, LARGEUR, 3, "#ead390");
  // Une étoile de mer, un coquillage, et un rocher à droite.
  t.grille(16, 73, ["..e..", "eeeee", ".eee.", "e...e"], { e: "#e8765a" });
  t.grille(27, 76, ["cc.", "cdc"], { c: "#fbf3e0", d: "#d9b9a0" });
  t.grille(100, 66, ["...rrrr.....", ".rrsrrrrr...", "rrssrrrqqrr.", "rsrrrrqqqqrr", "qqqqqqqqqqqq"], { r: "#8c8f96", s: "#b4b8bd", q: "#676b76" });
  return t.decor("#cdb277");
}

/* ------------------------------------------------------------------ 3. peu commun : le port au couchant */

function portAuCouchant(): Decor {
  const t = new Toile("#3b2f6b");
  bandes(t, [[0, "#3a2e68"], [13, "#56387a"], [23, "#87467e"], [31, "#c05a70"], [37, "#e87f58"], [42, "#f8ad52"]], 46);
  const SOLEIL = 96;
  halo(t, SOLEIL, 46, 30, 17, "#ffd27a", 0.5, 4);
  ellipse(SOLEIL, 46, 9, 9, (x, y, d) => {
    if (y < 46) t.poser(x, y, d < 0.7 ? "#fff3bc" : "#ffe08a");
  });
  // Des nuages en bancs, le ventre éclairé.
  nuage(t, 70, 9, [[5, 18], [0, 34], [8, 30]], "#6a3f7c", "#d0627a");
  nuage(t, 96, 20, [[3, 16], [0, 26]], "#9a4c80", "#f08a60");
  nuage(t, 52, 26, [[2, 14], [0, 22]], "#a8507c", "#f09a5c");
  nuage(t, 4, 34, [[5, 16], [0, 30]], "#b85a74", "#f6a85a");
  // La mer du soir.
  bandes(t, [[46, "#b8607a"], [49, "#8a4c7a"], [53, "#683f74"], [58, "#4e3468"]], 66);
  vagues(t, 47, 66, "#e08a72", "#3c2a58", 10, 0.8);
  reflet(t, SOLEIL, 46, 65, 5, 13, "#ffd67a", 0.85);
  // La ville du port, à droite : entrepôts, grue, tour du fanal.
  const mur = "#3a2550";
  const murClair = "#a8546a";
  const toit = "#2a1a40";
  const feu = "#ffd66e";
  const batiment = (x: number, y: number, l: number, h: number, pignon: boolean): void => {
    t.bloc(x, y, l, h, mur);
    t.bloc(x, y, 1, h, murClair);
    if (pignon) for (let k = 0; k < Math.ceil(l / 2); k++) t.bloc(x + k, y - k - 1, l - 2 * k, 1, toit);
    else t.bloc(x - 1, y - 1, l + 2, 1, toit);
    for (let fy = y + 2; fy < y + h - 2; fy += 4) for (let fx = x + 2; fx < x + l - 1; fx += 3) if (grain(fx, fy) % 3 !== 0) t.poser(fx, fy, feu);
  };
  t.bloc(84, 56, 40, 3, "#2a1a40"); // la jetée
  for (let x = 85; x < 124; x += 4) t.bloc(x, 59, 1, 3, "#2a1a40");
  batiment(106, 45, 8, 11, true);
  batiment(114, 40, 10, 16, false);
  batiment(97, 51, 8, 5, true);
  // La tour du fanal, au bout de la jetée.
  t.bloc(87, 40, 4, 16, mur);
  t.bloc(87, 40, 1, 16, murClair);
  t.bloc(86, 38, 6, 2, toit);
  t.bloc(87, 35, 4, 3, "#fff0a8");
  t.bloc(87, 33, 4, 2, toit);
  t.bloc(88, 32, 2, 1, toit);
  halo(t, 89, 36, 7, 5, "#fff0a8", 0.5, 2);
  // La grue de quai.
  trait(112, 40, 112, 25, (x, y) => t.poser(x, y, toit));
  trait(111, 40, 111, 25, (x, y) => t.poser(x, y, murClair));
  trait(103, 29, 121, 23, (x, y) => t.poser(x, y, toit));
  trait(112, 25, 120, 24, (x, y) => t.poser(x, y, toit));
  trait(104, 30, 104, 36, (x, y) => t.poser(x, y, "#6a4a70"));
  t.bloc(103, 37, 3, 2, "#f4c244");
  // Les bateaux de commerce, chargés d'or.
  const cargo: Couleurs = { m: "#2e1e44", s: "#4a2e5c", w: feu, o: "#f4c244", p: "#8a4a48", l: "#7a466c", h: "#352248", r: "#8c3848" };
  t.grille(5, 41, BATEAU_DE_COMMERCE, cargo);
  for (const [x, y] of [[16, 45], [21, 45], [18, 46], [24, 46]] as const) t.poser(x, y, "#fff0a8");
  for (let x = 3; x < 38; x++) if (grain(x, 51) % 3 !== 0) t.poser(x, 51, "#f0a880");
  t.grille(68, 43, COMMERCE_AU_LOIN, { m: "#4a2e5c", s: "#4a2e5c", o: "#f4c244", l: "#5c3868", h: "#4a2e5c" });
  // Le quai de bois : planches, pieux, caisses et sacs d'or.
  t.bloc(0, 65, LARGEUR, 1, "#2a1a36");
  t.bloc(0, 66, LARGEUR, 1, "#c98858");
  t.bloc(0, 67, LARGEUR, 13, "#8a5640");
  for (let y = 70; y < 80; y += 3) t.bloc(0, y, LARGEUR, 1, "#683e34");
  for (let rang = 0; rang < 5; rang++) {
    for (let x = (rang * 11) % 19; x < LARGEUR; x += 19) t.bloc(x, 67 + rang * 3 - (rang ? 2 : 0), 1, 2, "#683e34");
  }
  for (let y = 67; y < 80; y++) for (let x = 0; x < LARGEUR; x++) if (y % 3 !== 1 && grain(x, y) % 29 === 0) t.bloc(x, y, 3, 1, "#a06a4a");
  // À gauche : caisses, tonneau et or.
  const caisse = (x: number, y: number, c: number): void => {
    t.bloc(x, y, c, c, "#7a4a3c");
    t.bloc(x, y, c, 1, "#b87a50");
    t.bloc(x, y, 1, c, "#9c6446");
    t.bloc(x + c - 1, y, 1, c, "#553030");
    trait(x + 1, y + 1, x + c - 2, y + c - 1, (px, py) => t.poser(px, py, "#553030"));
  };
  caisse(3, 58, 8);
  caisse(11, 60, 6);
  t.grille(19, 63, ["..oo..", ".oooo.", "oOoooo", "ssssss"], { o: "#f4c244", O: "#fff0a8", s: "#5c3838" });
  t.poser(21, 62, "#fff0a8");
  // À droite : une lanterne sur son poteau.
  halo(t, 118, 59, 6, 5, "#ffcf6a", 0.4, 2);
  halo(t, 118, 69, 10, 2.5, "#ffcf6a", 0.25, 2);
  t.bloc(118, 61, 1, 6, "#1c1028");
  t.bloc(116, 61, 5, 1, "#1c1028");
  t.bloc(117, 57, 3, 4, "#fff0a8");
  t.bloc(117, 56, 3, 1, "#1c1028");
  return t.decor("#5a3630");
}

/* ------------------------------------------------------------------ 4. peu commun : le convoi des glaces */

function convoiDesGlaces(): Decor {
  const t = new Toile("#5c82a8");
  bandes(t, [[0, "#587ea6"], [14, "#7096ba"], [25, "#8fb2cc"], [33, "#b4cfde"], [39, "#d8e6e8"], [43, "#f4ead2"]], 46);
  // Le soleil bas du pôle, à droite.
  halo(t, 80, 45, 26, 9, "#fff2cc", 0.5, 3);
  nuage(t, 60, 7, [[4, 26], [0, 40]], "#7ea2c2", "#6c92b6");
  nuage(t, 84, 30, [[3, 18], [0, 30]], "#cfe0e6", "#a8c4d6");
  // L'eau noire entre les glaces.
  bandes(t, [[46, "#5a86a0"], [48, "#3c6c8a"], [52, "#28587a"], [58, "#1e4a6c"]], 66, false);
  reflet(t, 80, 46, 58, 6, 10, "#f4ead2", 0.5);
  // Les plaques de glace, plus grandes vers le bas.
  for (let y = 47; y < 65; y++) {
    const l = 2 + Math.floor((y - 47) / 3);
    for (let x = -6; x < LARGEUR; x++) {
      const g = grain(x * 5, y * 11);
      if (g % (26 + l * 3) !== 0) continue;
      const h = y > 56 ? 2 : 1;
      t.bloc(x, y, l + ((g >> 7) % 4), h, "#e6f1f6");
      t.bloc(x + 1, y + h, l + ((g >> 7) % 4) - 1, 1, "#86b4cc");
    }
  }
  // Les icebergs : une face au soleil, une face dans l'ombre.
  const lumiere = "#f6fbfd";
  const mi = "#c4dfee";
  const ombre = "#86b6d4";
  const creux = "#5c90b8";
  const poly = (points: readonly Point[], c: string): void => polygone(points, (x, y) => t.poser(x, y, c));
  poly([[93, 50], [97, 30], [103, 21], [108, 26], [113, 18], [119, 32], [123, 50]], mi);
  poly([[93, 50], [97, 30], [103, 21], [105, 36], [101, 50]], lumiere);
  poly([[108, 26], [113, 18], [115, 34], [111, 50], [105, 50], [105, 36]], ombre);
  poly([[115, 34], [119, 32], [123, 50], [111, 50]], creux);
  trait(103, 21, 105, 36, (x, y) => t.poser(x, y, "#ffffff"));
  t.bloc(92, 50, 32, 1, "#e6f1f6");
  t.bloc(94, 51, 30, 2, "#4c82a6");
  for (let x = 95; x < 124; x++) if (grain(x, 53) % 2 === 0) t.poser(x, 53, "#4c82a6");
  poly([[4, 49], [8, 39], [13, 35], [17, 41], [22, 38], [26, 49]], mi);
  poly([[4, 49], [8, 39], [13, 35], [14, 49]], lumiere);
  poly([[17, 41], [22, 38], [26, 49], [18, 49]], ombre);
  t.bloc(3, 49, 24, 1, "#e6f1f6");
  t.bloc(5, 50, 22, 1, "#4c82a6");
  // Le convoi : trois bateaux de commerce à la file, pris dans la glace.
  const cargo: Couleurs = { m: "#2a3442", s: "#e8e2d2", w: "#2a3442", o: "#d8a83c", p: "#b0483c", l: "#3a4656", h: "#222b38", r: "#b0483c" };
  t.grille(6, 51, BATEAU_DE_COMMERCE, cargo);
  t.bloc(4, 61, 34, 1, "#e6f1f6");
  t.bloc(6, 62, 30, 1, "#86b4cc");
  for (const [x, y, l] of [[9, 49, 4], [6, 47, 5], [2, 45, 5]] as const) for (let k = 0; k < l; k++) teinter(t, x + k, y, "#dfe8ec", 0.7);
  const loin: Couleurs = { m: "#3c4a5c", s: "#cfd2cc", o: "#c89c44", l: "#46556a", h: "#33404f" };
  t.grille(76, 44, COMMERCE_AU_LOIN, loin);
  t.bloc(75, 48, 16, 1, "#e6f1f6");
  t.grille(40, 43, ["..m....", ".ss.oo.", "hhhhhhh"], loin);
  // La banquise où il se tient.
  t.bloc(0, 64, LARGEUR, 1, "#f6fbfd");
  t.bloc(0, 65, LARGEUR, 15, "#e4eff5");
  for (let x = 0; x < LARGEUR; x++) {
    const bord = 64 + (grain(x >> 2, 3) % 2);
    t.bloc(x, 62, 1, bord - 62, x % 9 < 6 ? (t.lire(x, 61) ?? "#1e4a6c") : "#1e4a6c");
    t.poser(x, bord, "#ffffff");
  }
  for (let y = 67; y < 80; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x, y);
      if (g % 43 === 0) t.bloc(x, y, 3, 1, "#f8fcfe");
      else if (g % 47 === 0) t.bloc(x, y, 4, 1, "#cfe1ec");
    }
  }
  // Des crevasses bleues et des blocs de glace.
  trait(8, 79, 22, 71, (x, y) => t.poser(x, y, "#8fbcd8"));
  trait(22, 71, 30, 70, (x, y) => t.poser(x, y, "#8fbcd8"));
  trait(96, 68, 108, 74, (x, y) => t.poser(x, y, "#8fbcd8"));
  trait(108, 74, 121, 76, (x, y) => t.poser(x, y, "#8fbcd8"));
  poly([[100, 67], [103, 59], [107, 57], [111, 67]], mi);
  poly([[100, 67], [103, 59], [107, 57], [106, 67]], lumiere);
  poly([[12, 68], [14, 63], [18, 62], [20, 68]], mi);
  poly([[12, 68], [14, 63], [16, 68]], lumiere);
  t.bloc(0, 77, LARGEUR, 3, "#d2e3ee");
  return t.decor("#aecbdf");
}

/* ------------------------------------------------------------------ d'autres outils : boules, éclairs, engins */

/** Une boule de nuage ou de fumée : sombre, avec un bord éclairé du côté (lx, ly) de la lumière. */
function boule(t: Toile, cx: number, cy: number, rx: number, ry: number, sombre: string, claire: string, lx: number, ly: number): void {
  ellipse(cx, cy, rx, ry, (x, y, d) => t.poser(x, y, d > 0.72 && (x - cx) * lx * ry + (y - cy) * ly * rx > 0 ? claire : sombre));
}

/** Un éclair (ou tout trait de lumière) : une ligne brisée, son cœur et sa lueur en paliers de 2 cases. */
function eclair(t: Toile, points: readonly Point[], coeur: string, lueur: string, forces: readonly number[]): void {
  const cases: Point[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i] ?? [0, 0];
    const [x1, y1] = points[i + 1] ?? [0, 0];
    trait(x0, y0, x1, y1, (x, y) => cases.push([x, y]));
  }
  const portee = forces.length * 2;
  const xs = cases.map((c) => c[0]);
  const ys = cases.map((c) => c[1]);
  for (let y = Math.min(...ys) - portee; y <= Math.max(...ys) + portee; y++) {
    for (let x = Math.min(...xs) - portee; x <= Math.max(...xs) + portee; x++) {
      let proche = Infinity;
      for (const [px, py] of cases) proche = Math.min(proche, (px - x) ** 2 + (py - y) ** 2);
      const force = forces[Math.floor(Math.sqrt(proche) / 2)];
      if (force) teinter(t, x, y, lueur, force);
    }
  }
  for (const [x, y] of cases) t.poser(x, y, coeur);
}

/** Une barge de débarquement de profil, la rampe à droite. c casques, d épaules, r rampe. */
const BARGE = [
  "......m.......................",
  "......m.......................",
  "..ssssss......................",
  "..swwwss....................rr",
  "..ssssss..c.c.c.c.c.c.c....rr.",
  "..ssssss.ddddddddddddddd..rr..",
  "llllllllllllllllllllllllllrr..",
  "hhhhhhhhhhhhhhhhhhhhhhhhhhh...",
  "hhhhhhhhhhhhhhhhhhhhhhhhhh....",
  ".kkkkkkkkkkkkkkkkkkkkkkkk.....",
] as const;

const BARGE_AU_LOIN = ["..m........", ".ss.cccc..r", "lllllllllr.", ".hhhhhhhh.."] as const;

/** Une méduse de lumière. */
const MEDUSE = [
  "..ccccc..",
  ".cCCCCCc.",
  "cCCwwCCCc",
  "cCCCCCCCc",
  "ccccccccc",
  ".t.t.t.t.",
  ".t.t.t.t.",
  "..t.t.t..",
  "..t...t..",
  "....t....",
] as const;

const PETITE_MEDUSE = [".ccc.", "cCwCc", "ccccc", ".t.t.", ".t.t.", "..t.."] as const;

/* ------------------------------------------------------------------ 5. épique : le débarquement à l'aube */

function debarquementALAube(): Decor {
  const t = new Toile("#2c3668");
  bandes(t, [[0, "#2c3668"], [13, "#46427e"], [22, "#74528c"], [29, "#ae668a"], [34, "#e2867a"], [38, "#f6b272"], [41, "#ffdc9c"]], 44);
  const SOLEIL = 102;
  // Les rayons du soleil qui se lève, en éventail.
  for (let k = 0; k < 7; k++) {
    const a1 = Math.PI * (0.1 + k * 0.125);
    const a2 = a1 + Math.PI * 0.05;
    polygone(
      [[SOLEIL, 44], [SOLEIL + Math.cos(a1) * 90, 44 - Math.sin(a1) * 60], [SOLEIL + Math.cos(a2) * 90, 44 - Math.sin(a2) * 60]],
      (x, y) => {
        if (y < 44 && !dansLeCoin(x, y)) teinter(t, x, y, "#ffe2a8", 0.13);
      },
    );
  }
  halo(t, SOLEIL, 44, 26, 15, "#ffe9b0", 0.55, 4);
  ellipse(SOLEIL, 44, 7, 7, (x, y, d) => {
    if (y < 44) t.poser(x, y, d < 0.65 ? "#fffbe0" : "#fff0b4");
  });
  // Les nuages de l'aube : le dos encore dans la nuit, le ventre en or.
  nuage(t, 64, 5, [[6, 20], [2, 34], [0, 40], [10, 26]], "#4a4484", "#b86a8c");
  nuage(t, 98, 15, [[4, 12], [0, 24], [3, 22]], "#7a548c", "#f09a78");
  nuage(t, 84, 26, [[3, 16], [0, 26]], "#b46a8a", "#ffc47c");
  nuage(t, 4, 29, [[6, 14], [0, 28], [4, 20]], "#8a5a8e", "#f2a07a");
  nuage(t, 50, 33, [[2, 12], [0, 20]], "#d07c84", "#ffd08a");
  // Une fusée de signal monte de la flotte : sa traînée et son étoile.
  for (let i = 0; i < 26; i++) {
    const x = Math.round(119 - i * 0.28 - (i * i) / 110);
    if (i % 3 !== 2) teinter(t, x, 38 - i, "#ffd0c8", 0.25 + i / 50);
  }
  halo(t, 106, 11, 9, 9, "#ff9a9a", 0.55, 3);
  t.grille(104, 9, [".e.e.", "eeFee", ".FWF.", "eeFee", ".e.e."], { e: "#ff8e96", F: "#ffd6d0", W: "#ffffff" });
  // La flotte sur l'horizon, dans la brume.
  const flotte: Couleurs = { m: "#7a5c8c", c: "#7a5c8c", s: "#7a5c8c", b: "#7a5c8c", t: "#7a5c8c", l: "#8a6890", h: "#6c5286" };
  t.grille(5, 39, NAVIRE_AU_LOIN, flotte);
  t.grille(27, 42, NAVIRE_A_L_HORIZON, flotte);
  t.grille(107, 39, miroir(NAVIRE_AU_LOIN), { ...flotte, s: "#8c5a7c", h: "#7c4e78", l: "#c88a7c" });
  t.grille(86, 42, NAVIRE_A_L_HORIZON, { ...flotte, h: "#a06a84", s: "#a06a84", m: "#a06a84", b: "#a06a84" });
  // La mer de l'aube.
  bandes(t, [[44, "#dc9c8c"], [47, "#ac7c98"], [51, "#806aa0"], [56, "#605a98"], [61, "#4c4e8a"]], 65);
  vagues(t, 45, 64, "#f6c4a0", "#3c3e78", 26, 0.45);
  reflet(t, SOLEIL, 44, 64, 4, 12, "#ffe6a8", 0.8);
  // Les barges vers la plage, leur sillage derrière elles.
  const barge: Couleurs = { m: "#221f44", s: "#3a3466", w: "#ffdc9c", c: "#7a9a8c", d: "#2c4442", r: "#d8cce0", l: "#b0a4c8", h: "#2c2856", k: "#1c1a3c" };
  const loin: Couleurs = { m: "#3c3668", s: "#463e72", c: "#3a4c58", r: "#c0b0cc", l: "#a898c0", h: "#3c3668" };
  const sillage = (x0: number, x1: number, y: number, c: string): void => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (grain(x, y) % 4 !== 0) t.poser(x, y, c);
  };
  t.grille(20, 46, BARGE_AU_LOIN, loin);
  sillage(11, 30, 50, "#f0d0c4");
  t.grille(4, 52, BARGE, barge);
  sillage(0, 31, 62, "#fff2e4");
  sillage(0, 8, 61, "#e8c8cc");
  sillage(30, 37, 61, "#fff2e4");
  sillage(32, 35, 60, "#fff2e4");
  t.grille(89, 47, miroir(BARGE_AU_LOIN), loin);
  sillage(90, 108, 51, "#f6d8b8");
  t.grille(90, 52, miroir(BARGE), barge);
  sillage(92, 123, 62, "#fff2e4");
  sillage(115, 123, 61, "#e8c8cc");
  sillage(86, 93, 61, "#fff2e4");
  sillage(88, 91, 60, "#fff2e4");
  // La plage : l'écume, le sable mouillé qui renvoie le ciel, le sable.
  for (let x = 0; x < LARGEUR; x++) {
    const bord = 64 + (Math.sin(x / 11 + 1) > 0.2 ? 1 : 0);
    t.bloc(x, bord, 1, 1, "#fff2e4");
    t.bloc(x, bord + 1, 1, 2, "#d49c98");
    t.bloc(x, bord + 3, 1, 80 - bord - 3, "#a88474");
  }
  for (let x = 0; x < LARGEUR; x++) if (grain(x, 66) % 3 === 0) t.bloc(x, 66, 2, 1, "#f2bca0");
  for (let y = 69; y < 80; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x, y);
      if (g % 31 === 0) t.bloc(x, y, 3, 1, "#bc9884");
      else if (g % 37 === 0) t.bloc(x, y, 2, 1, "#8e6c64");
    }
  }
  t.bloc(0, 76, LARGEUR, 4, "#927068");
  for (let x = 0; x < LARGEUR; x++) if (grain(x, 75) % 2 === 0) t.poser(x, 75, "#927068");
  // Des pieux croisés plantés dans le sable.
  const croix = (x: number, y: number, c: number): void => {
    trait(x, y, x + c, y + c, (px, py) => t.bloc(px, py, 2, 1, "#33264a"));
    trait(x + c, y, x, y + c, (px, py) => t.bloc(px, py, 2, 1, "#4a3a60"));
    trait(x + c, y, x + c - 2, y + 2, (px, py) => t.poser(px, py, "#f2a07a"));
    t.bloc(x - 1, y + c + 1, c + 4, 1, "#806058");
  };
  croix(6, 62, 8);
  croix(24, 66, 6);
  croix(108, 63, 8);
  return t.decor("#7c5c5a");
}

/* ------------------------------------------------------------------ 6. épique : la bataille de nuit */

function batailleDeNuit(): Decor {
  const t = new Toile("#0a1030");
  bandes(t, [[0, "#0a1030"], [16, "#0e163c"], [28, "#141e4a"], [37, "#1e2456"], [42, "#35295a"]], 46);
  etoiles(t, 0, 36, ["#8a94c8", "#c8d0f0", "#6a74a8"], 61, dansLeCoin);
  // Le projecteur du navire de gauche fouille le ciel.
  polygone([[21, 42], [123, 3], [123, 15]], (x, y) => {
    if (!dansLeCoin(x, y)) teinter(t, x, y, "#a8c0f0", x > 84 ? 0.2 : 0.12);
  });
  // À droite, un navire en feu : la fumée monte et part dans le vent, éclairée par-dessous.
  const FEU = 103;
  halo(t, FEU, 40, 30, 22, "#e0602c", 0.4, 4);
  const fumee: readonly (readonly [number, number, number, number])[] = [
    [104, 31, 5, 4], [107, 25, 7, 5], [111, 18, 8, 6], [116, 11, 9, 6], [106, 13, 6, 4], [121, 5, 8, 5], [98, 20, 4, 3],
  ];
  for (const [x, y, rx, ry] of fumee) boule(t, x, y, rx, ry, "#221a38", "#7a3a3c", -0.4, 1);
  for (const [x, y, rx, ry] of fumee) ellipse(x - 1, y - 1, rx * 0.5, ry * 0.5, (px, py) => t.poser(px, py, "#191430"));
  // La mer de nuit.
  bandes(t, [[46, "#3a2c58"], [48, "#181e46"], [53, "#11173a"], [59, "#0c1230"]], 62);
  vagues(t, 47, 62, "#34427a", "#070a20", 14, 0.8);
  reflet(t, FEU, 49, 62, 6, 13, "#f08030", 0.6);
  reflet(t, 37, 50, 62, 3, 8, "#ffe8a0", 0.45);
  // Le navire touché.
  const touche: Couleurs = { m: "#0c0a1a", c: "#0c0a1a", s: "#100c1e", w: "#ffb040", b: "#0c0a1a", t: "#100c1e", l: "#ff9a48", h: "#40222e", k: "#1c1024" };
  t.grille(87, 40, miroir(NAVIRE_DE_GUERRE), touche);
  t.grille(98, 33, [
    "....f.......",
    "...ff..f....",
    "..fFf.ff....",
    "..fFFfFf.f..",
    ".fFJFFFff...",
    ".fFJJFJFf...",
    "ffFJWJJFff..",
    ".fFJWWJFFf.f",
    "..FJWWJJFff.",
  ], { f: "#d8501c", F: "#f48a20", J: "#ffc840", W: "#fff4b0" });
  for (const [x, y] of [[96, 30], [110, 32], [101, 27], [113, 28], [94, 36], [108, 22]] as const) t.poser(x, y, "#ffb040");
  for (let x = 85; x < 122; x++) if (grain(x, 50) % 3 !== 0) t.poser(x, 50, "#e87a38");
  // Deux gerbes d'eau des obus tombés court.
  const gerbe = (x: number, y: number, h: number): void => {
    polygone([[x - 2, y], [x - 1, y - h * 0.6], [x, y - h], [x + 1, y - h * 0.6], [x + 2, y]], (px, py) => t.poser(px, py, px < x ? "#c8d4f0" : "#8a9ccc"));
    for (const [dx, dy] of [[-3, -h + 2], [3, -h + 1], [-2, -h - 1], [2, -h - 2], [0, -h - 3]] as const) t.poser(x + dx, Math.round(y + dy), "#c8d4f0");
    t.bloc(x - 4, y, 9, 1, "#aab8e0");
  };
  gerbe(89, 54, 11);
  gerbe(119, 52, 8);
  // À gauche, le navire qui tire : l'éclair de la bouche du canon.
  const tireur: Couleurs = { m: "#2c3664", c: "#2c3664", s: "#3c4878", w: "#ffe08a", b: "#e8d8a0", t: "#5c689c", l: "#c0c0cc", h: "#2a3462", k: "#161e42" };
  t.grille(3, 41, miroir(NAVIRE_DE_GUERRE), tireur);
  for (let x = 2; x < 37; x++) if (grain(x, 51) % 3 !== 0) t.poser(x, 51, "#6a78a8");
  halo(t, 39, 45, 11, 8, "#ffd070", 0.6, 3);
  t.grille(35, 42, ["...y...", ".y.Y.y.", "..YWY..", "yYWWWYy", "..YWY..", ".y.Y.y.", "...y..."], { y: "#ffb040", Y: "#ffe08a", W: "#ffffff" });
  // Les obus traçants : une courbe de points, du jaune au rouge.
  for (let x = 44; x <= 97; x += 3) {
    const y = Math.round(44 - 0.047 * (x - 40) * (99 - x));
    const c = x < 62 ? "#fff0a0" : x < 80 ? "#ffc050" : "#ff8038";
    t.poser(x, y, c);
    t.poser(x + 1, y, c);
    teinter(t, x - 1, y, c, 0.4);
  }
  for (let x = 2; x <= 34; x += 4) {
    const y = Math.round(40 - 0.02 * (x + 20) * (60 - x));
    if (!dansLeCoin(x, y)) t.poser(x, y, "#ff9a48");
  }
  // Des lueurs de tirs au loin, sur l'horizon.
  halo(t, 60, 45, 7, 3, "#ffb060", 0.5, 2);
  halo(t, 80, 45, 5, 2, "#ffb060", 0.4, 2);
  // Le pont de son navire : la rambarde, puis les tôles.
  t.bloc(0, 62, LARGEUR, 4, "#0c1230");
  for (let x = 4; x < LARGEUR; x += 15) {
    t.bloc(x, 56, 2, 10, "#1a2244");
    t.bloc(x, 56, 1, 10, "#3a4878");
    t.bloc(x - 1, 55, 4, 1, "#3a4878");
  }
  t.bloc(0, 58, LARGEUR, 1, "#252f58");
  t.bloc(0, 62, LARGEUR, 1, "#252f58");
  t.bloc(0, 66, LARGEUR, 1, "#5a6898");
  t.bloc(0, 67, LARGEUR, 13, "#2c3558");
  for (let rang = 0; rang < 3; rang++) {
    const y = 67 + rang * 4;
    t.bloc(0, y + 4, LARGEUR, 1, "#1e2646");
    for (let x = (rang * 13) % 22; x < LARGEUR; x += 22) {
      t.bloc(x, y, 1, 4, "#1e2646");
      t.poser(x + 2, y + 1, "#46527e");
      t.poser(x - 2, y + 1, "#46527e");
    }
  }
  // Le feu d'en face rougit le pont, à droite.
  for (let y = 66; y < 80; y++) for (let x = 78; x < LARGEUR; x++) teinter(t, x, y, "#e0602c", Math.min(0.22, ((x - 78) / 46) * 0.26));
  // Au premier plan, à gauche : une tourelle et ses deux canons levés.
  const acier = "#222a4c";
  polygone([[1, 76], [3, 60], [9, 56], [24, 56], [29, 61], [30, 76]], (x, y) => t.poser(x, y, acier));
  polygone([[4, 60], [9, 56], [24, 56], [28, 60]], (x, y) => t.poser(x, y, "#3a4674"));
  t.bloc(4, 60, 25, 1, "#6a78a8");
  t.bloc(1, 76, 30, 1, "#141a36");
  for (let x = 6; x < 28; x += 5) t.poser(x, 63, "#46527e");
  for (const dy of [0, 5]) {
    trait(21, 58 + dy, 43, 49 + dy, (x, y) => t.bloc(x, y, 1, 3, "#161c3a"));
    trait(21, 58 + dy, 43, 49 + dy, (x, y) => t.poser(x, y, "#6a78a8"));
    t.bloc(43, 49 + dy, 1, 3, "#05070f");
  }
  return t.decor("#161b36");
}

/* ------------------------------------------------------------------ 7. mystique : la mer des lueurs */

function merDesLueurs(): Decor {
  const t = new Toile("#080a26");
  bandes(t, [[0, "#080a26"], [14, "#0a0f30"], [26, "#0d1a40"], [36, "#10294e"], [42, "#154460"]], 46);
  // La voie lactée, de biais vers l'horizon, et ses étoiles.
  for (let y = 0; y < 46; y++) {
    for (let x = 40; x < LARGEUR; x++) {
      const d = Math.abs((x - 62) * 0.55 - y * 0.83);
      if (d >= 10 || dansLeCoin(x, y)) continue;
      teinter(t, x, y, d < 3 ? "#6a5ab8" : "#3c4a9c", d < 3 ? 0.3 : d < 6 ? 0.22 : 0.1);
      const g = grain(x * 7, y * 3);
      if (g % (d < 4 ? 9 : 17) === 0) t.poser(x, y, ["#ffffff", "#bfe9ff", "#e8c8ff", "#8ad8e8"][(g >> 6) % 4] ?? "#ffffff");
    }
  }
  etoiles(t, 0, 40, ["#c8d8ff", "#7a8ac8", "#ffffff"], 53, dansLeCoin);
  halo(t, 62, 47, 70, 9, "#2ad0c8", 0.35, 3);
  // La mer noire, et ses crêtes qui s'allument.
  bandes(t, [[46, "#12586c"], [48, "#0a3a56"], [52, "#082c48"], [58, "#06203c"]], 66);
  const lueur = "#7ffff0";
  const cyan = "#2ad0d8";
  const crete = (y0: number, phase: number, pas: number, force: number): void => {
    for (let x = 0; x < LARGEUR; x++) {
      const y = y0 + Math.round(Math.sin(x / pas + phase) * 1.3);
      if (grain(x >> 3, y0) % 3 === 0) continue;
      teinter(t, x, y, lueur, force);
      teinter(t, x, y + 1, cyan, force * 0.5);
    }
  };
  crete(49, 0.5, 9, 0.35);
  crete(54, 2.1, 8, 0.6);
  crete(60, 1.2, 10, 0.85);
  for (let y = 47; y < 64; y++) for (let x = 0; x < LARGEUR; x++) if (hasard(x, y) % 53 === 0) teinter(t, x, y, lueur, 0.35 + (y - 47) / 40);
  // Deux navires noirs, et leur sillage de lumière.
  const noir: Couleurs = { m: "#050818", c: "#050818", s: "#070b1e", w: "#ffd880", b: "#050818", t: "#070b1e", l: "#1a5a70", h: "#050818", k: "#040614" };
  t.grille(3, 40, NAVIRE_DE_GUERRE, noir);
  for (let x = 1; x < 62; x++) {
    if (x < 38) t.poser(x, 50, grain(x, 50) % 5 === 0 ? cyan : lueur);
    else if (grain(x >> 1, 50) % 3 !== 0) teinter(t, x, 50, lueur, 0.9 - (x - 38) / 34);
    if (x > 26 && x < 52 && grain(x >> 1, 51) % 2 === 0) teinter(t, x, 51, cyan, 0.7);
  }
  halo(t, 22, 51, 24, 4, cyan, 0.3, 2);
  // L'arche de roche, à droite : par son œil on voit la mer qui luit et un navire au loin ; des lianes de lumière y pendent.
  const roche = "#0c1230";
  const rocheClaire = "#1a2452";
  const dansLOeil = (x: number, y: number): boolean => ((x - 106) / 9) ** 2 + ((y - 50) / 15) ** 2 <= 1 && y < 60;
  t.grille(102, 44, NAVIRE_A_L_HORIZON, noir);
  t.bloc(100, 47, 13, 1, lueur);
  polygone([[90, 63], [92, 46], [96, 32], [101, 22], [108, 15], [117, 14], [123, 17], [123, 63]], (x, y) => {
    if (!dansLOeil(x, y)) t.poser(x, y, roche);
  });
  polygone([[92, 46], [96, 32], [101, 22], [108, 15], [110, 18], [103, 25], [99, 35], [96, 47]], (x, y) => {
    if (!dansLOeil(x, y)) t.poser(x, y, rocheClaire);
  });
  for (let y = 14; y < 63; y++) {
    for (let x = 90; x < LARGEUR; x++) {
      const c = t.lire(x, y);
      if ((c !== roche && c !== rocheClaire) || dansLOeil(x, y)) continue;
      if (dansLOeil(x + 1, y) || dansLOeil(x - 1, y) || dansLOeil(x, y + 1)) t.poser(x, y, y > 46 ? cyan : "#1c6a88");
      else if (y > 52) teinter(t, x, y, cyan, ((y - 52) / 11) * 0.4);
      else if ((x * 3 + y * 7) % 13 === 0 && c === roche) t.poser(x, y, "#141c40");
    }
  }
  for (const [x0, y0, x1, y1] of [[92, 46, 96, 32], [96, 32, 101, 22], [101, 22, 108, 15], [108, 15, 117, 14]] as const) {
    trait(x0, y0, x1, y1, (x, y) => t.poser(x, y, "#4a58a0"));
  }
  for (const [x, y, l] of [[100, 39, 5], [103, 36, 8], [106, 35, 5], [109, 36, 9], [112, 39, 6], [94, 41, 6], [119, 19, 7], [121, 26, 5]] as const) {
    for (let k = 0; k < l; k++) t.poser(x, y + k, k === l - 1 ? lueur : k % 2 === 0 ? "#1a8a98" : "#126a80");
    halo(t, x, y + l - 1, 2.5, 2.5, cyan, 0.4, 2);
  }
  // Les méduses de lumière, qui montent de l'eau.
  const meduse = (x: number, y: number, grande: boolean, c: Couleurs, aura: string): void => {
    const [l, h] = grande ? [9, 10] : [5, 6];
    halo(t, x + l / 2 - 0.5, y + h / 2 - 1, l * 1.1, h * 0.95, aura, 0.38, 3);
    t.grille(x, y, grande ? MEDUSE : PETITE_MEDUSE, c);
  };
  const bleue: Couleurs = { c: "#2ad0d8", C: "#7ffff0", w: "#ffffff", t: "#1a9ab0" };
  const mauve: Couleurs = { c: "#9a6af0", C: "#d0b0ff", w: "#ffffff", t: "#6a4ac0" };
  meduse(8, 28, true, bleue, cyan);
  meduse(26, 35, false, mauve, "#9a6af0");
  meduse(31, 27, false, bleue, cyan);
  meduse(86, 8, true, mauve, "#9a6af0");
  meduse(88, 26, false, bleue, cyan);
  meduse(114, 4, false, bleue, cyan);
  meduse(19, 42, false, bleue, cyan);
  // Des étincelles montent de la mer.
  for (let y = 24; y < 47; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (dansLeCoin(x, y) || t.lire(x, y) === roche || t.lire(x, y) === rocheClaire) continue;
      if (grain(x * 11, y * 13) % (40 + (46 - y) * 9) === 0) t.poser(x, y, y > 38 ? lueur : cyan);
    }
  }
  // La grève de sable noir : l'écume qui luit, les galets, les flaques.
  t.bloc(0, 66, LARGEUR, 14, "#0e1632");
  for (let x = 0; x < LARGEUR; x++) {
    const bord = 65 + Math.round(Math.sin(x / 8) * 0.9);
    t.bloc(x, 63, 1, bord - 63, "#0a3a56");
    t.bloc(x, bord, 1, 67 - bord, "#0e1632");
    t.poser(x, bord, lueur);
    teinter(t, x, bord + 1, cyan, 0.65);
    teinter(t, x, bord + 2, cyan, 0.4);
    teinter(t, x, bord + 3, cyan, 0.18);
    teinter(t, x, bord - 1, cyan, 0.5);
  }
  for (let x = 0; x < LARGEUR; x++) {
    const y = 70 + Math.round(Math.sin(x / 13 + 2) * 1.2);
    if (grain(x >> 2, 70) % 3 !== 0) teinter(t, x, y, cyan, 0.3);
  }
  for (let y = 71; y < 80; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x, y);
      if (g % 41 === 0) t.bloc(x, y, 3, 1, "#18244a");
      else if (g % 67 === 0) t.poser(x, y, lueur);
      else if (g % 53 === 0) t.bloc(x, y, 2, 1, "#080d22");
    }
  }
  t.bloc(0, 77, LARGEUR, 3, "#0a1028");
  return t.decor("#060a1c");
}

/* ------------------------------------------------------------------ 8. légendaire : le cuirassé de l'orage */

function cuirasseDeLOrage(): Decor {
  const t = new Toile("#141a3a");
  bandes(t, [[0, "#141a3a"], [14, "#191f44"], [25, "#202850"], [34, "#2a345e"], [41, "#39466e"]], 48);
  // Les masses de nuages : le coin du haut à gauche reste un seul nuage, sans détail.
  const sombre = "#10152f";
  const bord = "#3c4680";
  const vif = "#7a80c8";
  for (const [x, y, rx, ry, c] of [
    [60, 2, 16, 5, bord], [78, 12, 12, 4, bord], [112, 1, 14, 5, vif], [119, 14, 9, 4, bord], [92, 16, 9, 3, vif],
    [14, 32, 16, 5, bord], [38, 38, 13, 4, bord], [70, 30, 14, 4, bord], [116, 30, 10, 4, bord], [6, 43, 10, 3, bord],
  ] as const) {
    boule(t, x, y, rx, ry, sombre, c, 0.3, 1);
  }
  for (const [x, y, rx, ry] of [[67, 11, 10, 3], [89, 14, 9, 3], [76, 17, 7, 2.5], [117, 10, 8, 3]] as const) {
    boule(t, x, y, rx, ry, "#2a3268", "#8c8cdc", 0, -1);
  }
  // La pluie, couchée par le vent.
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (hasard(x, y) % 170 !== 0) continue;
      const force = dansLeCoin(x, y) ? 0.06 : 0.22;
      for (let k = 0; k < 10; k++) teinter(t, x - (k >> 1), y + k, "#a8b4e8", force);
    }
  }
  // La mer démontée.
  bandes(t, [[48, "#2c4c6a"], [51, "#203e5e"], [55, "#183050"], [60, "#122644"]], 66);
  vagues(t, 49, 66, "#6a8cb8", "#0c1a34", 16, 0.7);
  for (const [y0, phase, pas] of [[52, 1, 11], [57, 3, 13], [62, 0, 15]] as const) {
    for (let x = 0; x < LARGEUR; x++) {
      if (grain(x >> 3, y0) % 3 === 0) continue;
      const y = y0 + Math.round(Math.sin(x / pas + phase) * 1.4);
      t.poser(x, y, "#5a7eac");
      teinter(t, x, y + 1, "#0c1a34", 0.5);
    }
  }
  // Au loin, à gauche, un navire d'escorte, puis une lame énorme qui se dresse.
  const escorte: Couleurs = { m: "#0e1328", c: "#0e1328", s: "#141a34", b: "#0e1328", t: "#141a34", l: "#5a64a0", h: "#0e1328" };
  t.grille(24, 42, NAVIRE_AU_LOIN, escorte);
  t.poser(31, 44, "#ffd870");
  const lame: readonly Point[] = [[0, 50], [4, 45], [10, 41], [17, 39], [23, 41], [28, 45], [35, 49], [44, 53], [44, 60], [0, 60]];
  polygone(lame, (x, y) => t.poser(x, y, "#1a3c5c"));
  polygone([[0, 50], [4, 45], [10, 41], [17, 39], [23, 41], [22, 44], [15, 43], [8, 46], [0, 54]], (x, y) => t.poser(x, y, "#2e6484"));
  polygone([[6, 45], [10, 42], [17, 40], [21, 41], [16, 42], [10, 44]], (x, y) => t.poser(x, y, "#58a0b4"));
  for (let i = 0; i + 1 < 7; i++) {
    const [x0, y0] = lame[i] ?? [0, 0];
    const [x1, y1] = lame[i + 1] ?? [0, 0];
    trait(x0, y0 - 1, x1, y1 - 1, (x, y) => {
      t.poser(x, y, "#eef4ff");
      if (grain(x, y) % 2 === 0) t.poser(x, y - 1, "#c4d4f0");
      if (grain(x, y) % 5 === 0) t.poser(x + 1, y - 3, "#eef4ff");
    });
  }
  for (let y = 45; y < 60; y++) for (let x = 0; x < 44; x++) if (grain(x * 3, y) % 19 === 0 && t.lire(x, y) === "#1a3c5c") t.bloc(x, y, 3, 1, "#28506e");

  // Le cuirassé, de face : il fend la mer droit vers nous. La foudre l'éclaire par la gauche.
  const CX = 101;
  const flancClair = "#3a4672";
  const flancSombre = "#151b31";
  const arete = "#d0d0ff";
  const filet = "#6a74b0";
  const hublot = "#ffd870";
  // Un étage du château : sa face éclairée à gauche, son arête vive en haut.
  const etage = (demi: number, y0: number, y1: number): void => {
    const l = demi * 2 + 1;
    const clair = Math.ceil(l * 0.4);
    t.bloc(CX - demi, y0, l, y1 - y0 + 1, flancSombre);
    t.bloc(CX - demi, y0, clair, y1 - y0 + 1, flancClair);
    t.bloc(CX - demi, y0, l, 1, filet);
    t.bloc(CX - demi, y0, clair, 1, arete);
    t.bloc(CX - demi, y0, 1, y1 - y0 + 1, "#8a94d0");
  };
  // La fumée de la cheminée, derrière, que le vent emporte à droite.
  boule(t, CX + 10, 11, 5, 3, "#0c1024", "#2c3460", -1, 0.4);
  boule(t, CX + 17, 8, 6, 4, "#0c1024", "#2c3460", -1, 0.4);
  // Le mât, sa vergue et son feu rouge.
  t.bloc(CX, 4, 1, 4, filet);
  t.bloc(CX - 5, 6, 11, 1, "#2c3658");
  t.bloc(CX - 5, 6, 5, 1, filet);
  t.poser(CX, 3, "#ff5a5a");
  etage(4, 8, 11); // le poste de tir et les bras du télémètre
  t.bloc(CX - 9, 9, 5, 2, filet);
  t.bloc(CX - 9, 9, 5, 1, arete);
  t.bloc(CX + 5, 9, 5, 2, "#2c3658");
  etage(3, 12, 14);
  etage(11, 15, 19); // la passerelle et ses vitres
  for (let x = CX - 9; x <= CX + 9; x++) if (x % 4 !== 0) t.poser(x, 17, hublot);
  etage(7, 20, 24);
  for (let x = CX - 5; x <= CX + 5; x += 2) t.poser(x, 22, x < CX ? hublot : "#c89a48");
  // Les deux tourelles, l'une au-dessus de l'autre, leurs canons levés vers nous.
  const tourelle = (y0: number, demi: number, h: number, canons: readonly number[]): void => {
    polygone([[CX - demi, y0 + h], [CX - demi + 2, y0], [CX + demi - 2, y0], [CX + demi, y0 + h]], (x, y) => t.poser(x, y, x < CX - demi * 0.3 ? flancClair : flancSombre));
    t.bloc(CX - demi + 2, y0, demi * 2 - 3, 1, filet);
    t.bloc(CX - demi + 2, y0, demi - 1, 1, arete);
    trait(CX - demi, y0 + h, CX - demi + 2, y0, (x, y) => t.poser(x, y, "#8a94d0"));
    for (const dx of canons) {
      const x = CX + dx;
      t.bloc(x - 1, y0 - 4, 1, 7, "#a4aee4");
      t.bloc(x, y0 - 4, 1, 7, "#4c5890");
      t.bloc(x + 1, y0 - 4, 1, 7, "#1a2140");
      t.bloc(x - 1, y0 - 5, 3, 1, arete);
      t.poser(x, y0 - 4, "#05070f");
      t.bloc(x - 2, y0 + 3, 5, 1, "#0b0f20");
    }
  };
  tourelle(22, 9, 5, [-4, 4]);
  tourelle(28, 13, 6, [-8, 0, 8]);
  // La coque : large au pont, fine à l'étrave ; le flanc gauche pris par l'éclair.
  const pont = 35;
  const flot = 59;
  polygone([[CX, flot], [CX - 7, 51], [CX - 15, 41], [CX - 21, pont], [CX, pont - 3]], (x, y) => t.poser(x, y, flancClair));
  polygone([[CX, flot], [CX + 7, 51], [CX + 15, 41], [CX + 21, pont], [CX, pont - 3]], (x, y) => t.poser(x, y, flancSombre));
  polygone([[CX - 21, pont], [CX, pont - 3], [CX, pont], [CX - 19, pont + 3]], (x, y) => t.poser(x, y, "#5c68a4"));
  polygone([[CX + 21, pont], [CX, pont - 3], [CX, pont], [CX + 19, pont + 3]], (x, y) => t.poser(x, y, "#232b4c"));
  trait(CX - 21, pont, CX, pont - 3, (x, y) => t.poser(x, y, arete));
  trait(CX, pont - 3, CX + 21, pont, (x, y) => t.poser(x, y, filet));
  trait(CX - 21, pont, CX - 15, 41, (x, y) => t.poser(x, y, "#8a94d0"));
  trait(CX - 15, 41, CX - 7, 51, (x, y) => t.poser(x, y, filet));
  trait(CX, pont - 3, CX, flot, (x, y) => t.poser(x, y, arete)); // l'étrave
  trait(CX + 1, pont - 1, CX + 1, flot, (x, y) => t.poser(x, y, "#0b0f20"));
  // Les tôles, les hublots et les deux ancres.
  for (const y of [42, 48, 54]) {
    for (let x = CX - 20; x <= CX + 20; x++) {
      const c = t.lire(x, y);
      if (c === flancClair) t.poser(x, y, "#2e3962");
      else if (c === flancSombre) t.poser(x, y, "#0f1426");
    }
  }
  for (const dx of [5, 8, 11, 14, 17]) {
    t.poser(CX - dx, 39, hublot);
    if (dx !== 11) t.poser(CX + dx, 39, "#e0b050");
  }
  for (const dx of [5, 8, 11]) {
    if (dx !== 8) t.poser(CX - dx, 45, hublot);
    t.poser(CX + dx, 45, "#e0b050");
  }
  for (const cote of [-1, 1]) {
    const x = CX + cote * 5;
    t.bloc(x - 1, 48, 3, 2, "#05070f");
    t.bloc(x, 49, 1, 4, cote < 0 ? "#a4aee4" : "#4c5890");
    t.bloc(x - 1, 52, 3, 1, cote < 0 ? "#a4aee4" : "#4c5890");
  }
  // Le projecteur de la passerelle balaie la mer vers la gauche ; un second monte vers la droite.
  polygone([[CX - 12, 17], [0, 40], [0, 49]], (x, y) => {
    if (!dansLeCoin(x, y) && x < CX - 12) teinter(t, x, y, "#ffe890", Math.max(0.05, Math.ceil(((x - 4) / 85) * 5) / 5 * 0.3));
  });
  polygone([[CX + 12, 17], [123, 12], [123, 19]], (x, y) => {
    if (x > CX + 12) teinter(t, x, y, "#fff4c0", 0.2);
  });
  for (const x of [CX - 12, CX + 12]) {
    halo(t, x, 17, 3, 3, "#fff4c0", 0.5, 2);
    t.bloc(x, 16, 1, 3, "#fffbe0");
  }
  // Les gerbes de l'étrave : deux ailes d'écume, et les embruns au-dessus.
  for (const cote of [-1, 1]) {
    const a = (dx: number): number => CX + cote * dx;
    polygone([[a(0), flot + 2], [a(4), 55], [a(10), 51], [a(17), 50], [a(23), 53], [a(24), 58], [a(19), flot + 3]], (x, y) => t.poser(x, y, cote < 0 ? "#e6eefc" : "#93a6d0"));
    polygone([[a(4), flot + 2], [a(7), 56], [a(12), 54], [a(17), 54], [a(20), 58], [a(17), flot + 3]], (x, y) => t.poser(x, y, cote < 0 ? "#a9bbe2" : "#6a7eb0"));
    for (let i = 0; i < 22; i++) {
      const g = hasard(i * 7 + (cote > 0 ? 3 : 0), 91);
      const dx = 5 + (g % 20);
      t.poser(a(dx), 43 + ((g >> 5) % 7) + Math.round(Math.abs(dx - 16) / 3), i % 3 === 0 ? "#ffffff" : "#b4c4ea");
    }
    for (let dx = 1; dx <= 23; dx++) if (grain(a(dx), 7) % 4 !== 0) t.poser(a(dx), 49 + Math.round(Math.abs(dx - 15) / 2.4), "#ffffff");
  }
  t.bloc(CX - 24, flot + 3, 49, 2, "#8a9cc8");
  for (let x = CX - 27; x < LARGEUR; x++) if (grain(x, 63) % 2 === 0) t.poser(x, flot + 5, "#5a70a0");

  reflet(t, 83, 49, 58, 2, 5, "#c8c0ff", 0.55);
  // L'éclair : il court sous les nuages et tombe sur le mât ; deux branches descendent.
  const coeur = "#ffffff";
  const violet = "#a89cff";
  eclair(t, [[58, 0], [65, 3], [63, 6], [74, 5], [80, 9], [88, 6], [93, 10], [97, 5], [CX, 3]], coeur, violet, [0.75, 0.45, 0.28, 0.16, 0.08]);
  eclair(t, [[80, 9], [84, 14], [81, 19], [85, 24], [82, 30], [84, 35], [81, 41], [83, 47]], "#e8e4ff", violet, [0.6, 0.35, 0.18, 0.08]);
  eclair(t, [[CX, 3], [107, 2], [112, 6], [118, 4], [123, 8]], "#e8e4ff", violet, [0.6, 0.35, 0.18]);
  eclair(t, [[63, 6], [59, 10], [61, 14]], "#d0c8ff", violet, [0.5, 0.25, 0.1]);
  // Un second éclair, loin, à gauche.
  eclair(t, [[13, 29], [11, 33], [15, 36], [12, 40], [14, 44]], "#b8b4f0", violet, [0.4, 0.2, 0.08]);

  // Le rocher où il se tient, battu par les vagues.
  const roc: readonly Point[] = [[0, 69], [5, 64], [11, 62], [17, 65], [30, 64], [52, 65], [74, 64], [92, 65], [104, 64], [110, 61], [117, 62], [123, 67], [123, 79], [0, 79]];
  polygone(roc, (x, y) => t.poser(x, y, "#181c30"));
  for (let i = 0; i + 1 < 12; i++) {
    const [x0, y0] = roc[i] ?? [0, 0];
    const [x1, y1] = roc[i + 1] ?? [0, 0];
    trait(x0, y0, x1, y1, (x, y) => {
      t.poser(x, y, grain(x >> 1, 5) % 3 === 0 ? "#b0b8f0" : "#5a6498");
      t.poser(x, y + 1, "#343c60");
      if (grain(x, 9) % 2 === 0) t.poser(x, y + 2, "#343c60");
    });
  }
  for (let y = 68; y < 80; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (t.lire(x, y) !== "#181c30") continue;
      const g = grain(x, y);
      if (g % 23 === 0) t.bloc(x, y, 3, 1, "#2a3152");
      else if (g % 31 === 0) trait(x, y, x + 2, y + 2, (px, py) => t.poser(px, py, "#0e1122"));
      else if (g % 97 === 0) t.poser(x, y, "#8a94d0");
    }
  }
  t.bloc(0, 77, LARGEUR, 3, "#10131f");
  // L'écume qui claque aux deux bouts du rocher.
  for (const [cx, cy] of [[3, 66], [121, 65]] as const) {
    ellipse(cx, cy, 6, 3.5, (x, y, d) => t.poser(x, y, d < 0.55 ? "#eef4ff" : "#a9bbe2"));
    for (let i = 0; i < 12; i++) {
      const g = grain(i * 13 + cx, 17);
      t.poser(cx - 7 + (g % 15), cy - 4 - ((g >> 4) % 6), i % 2 === 0 ? "#ffffff" : "#b4c4ea");
    }
  }
  return t.decor("#0b0d1a");
}

export const LOT_B: readonly BanniereDuLot[] = [
  {
    id: "flotte-en-ligne",
    nom: "La flotte en ligne",
    rarete: "commun",
    famille: "mers",
    description: "Des navires de guerre à la file sur une mer grise, sous un soleil voilé, vus d'un quai de pierre.",
    dessiner: flotteEnLigne,
  },
  {
    id: "archipel-turquoise",
    nom: "L'archipel turquoise",
    rarete: "commun",
    famille: "mers",
    description: "Une plage de sable clair devant un lagon turquoise, deux îles à palmiers et une voile blanche.",
    dessiner: archipelTurquoise,
  },
  {
    id: "port-au-couchant",
    nom: "Le port au couchant",
    rarete: "peu-commun",
    famille: "mers",
    description: "Un quai de bois au soleil couchant : bateaux de commerce chargés d'or, entrepôts, grue et fanal allumé.",
    dessiner: portAuCouchant,
  },
  {
    id: "convoi-des-glaces",
    nom: "Le convoi des glaces",
    rarete: "peu-commun",
    famille: "mers",
    description: "Trois bateaux de commerce pris dans les glaces, entre deux icebergs, vus de la banquise.",
    dessiner: convoiDesGlaces,
  },
  {
    id: "debarquement-a-l-aube",
    nom: "Le débarquement à l'aube",
    rarete: "epique",
    famille: "mers",
    description: "Des barges chargées de troupes filent vers une plage au soleil levant ; une fusée de signal monte de la flotte.",
    dessiner: debarquementALAube,
  },
  {
    id: "bataille-de-nuit",
    nom: "La bataille de nuit",
    rarete: "epique",
    famille: "mers",
    description: "Une bataille navale de nuit vue du pont : obus traçants, navire en feu, gerbes d'eau et projecteur.",
    dessiner: batailleDeNuit,
  },
  {
    id: "mer-des-lueurs",
    nom: "La mer des lueurs",
    rarete: "mystique",
    famille: "mers",
    description: "Une mer noire aux vagues qui luisent, des méduses de lumière sous la voie lactée, une arche de roche.",
    dessiner: merDesLueurs,
  },
  {
    id: "cuirasse-de-l-orage",
    nom: "Le cuirassé de l'orage",
    rarete: "legendaire",
    famille: "mers",
    description: "Un cuirassé géant fend la mer démontée droit vers nous, la foudre sur son mât, ses projecteurs allumés.",
    dessiner: cuirasseDeLOrage,
  },
];
