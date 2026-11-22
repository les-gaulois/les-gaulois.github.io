/**
 * Les dessins du duel « Coup pour coup » (22 novembre 2026), repris de la maquette validée par le pilote (« j'aime
 * beaucoup », dessins de Claude Fable 5.2) sur les outils du kit en pixels (`src/lib/jeu/planche.ts`) : la face claire d'une
 * carte à la couleur de sa rareté, sa face de poche pour les petites cartes du téléphone, son dos, la puce d'une carte
 * adverse, la tuile de chaque rôle, l'icône de chaque mot-clé, le cœur de vie, l'éclair d'énergie, le sablier du repos, la
 * goutte de la fatigue, la flamme de série. Sans navigateur : chaque dessin est une `Planche`, que la scène pose dans une
 * toile. Les couleurs sont celles de la maquette ; ne pas les changer sans la demande du pilote.
 */
import { iconeDeRarete } from "../../../lib/jeu/icones-de-rarete";
import { ecrire, enCapitales, largeurDuTexte, lignesDuTexte } from "../../../lib/jeu/ecriture";
import { PAL } from "../../../lib/jeu/palette";
import { Planche, R, cerne, grille, rr } from "../../../lib/jeu/planche";
import type { RangDeCarte, Role } from "../../../lib/village/ecran-duel";

/** La trame ordonnée de Bayer, 4 sur 4 : les fondus en cases. */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/* ---------- Les rôles : un par emplacement, une couleur et une icône chacun ---------- */

export interface DessinDeRole {
  nom: string;
  coul: string;
  fonce: string;
  clair: string;
  ic: readonly string[];
}
export const ROLES: Readonly<Record<Role, DessinDeRole>> = {
  frappe: { nom: "FRAPPE", coul: "#e0263a", fonce: "#8f0f1e", clair: "#ff9aa3", ic: [".........ww", "........www", ".......www.", "......www..", ".....www...", ".y..www....", ".yywww.....", "..yyy......", "..wyyy.....", ".ww..yy....", "ww........."] },
  tete: { nom: "COUP DE TÊTE", coul: "#f5760f", fonce: "#9c4204", clair: "#ffc08a", ic: ["w.........w", "ww.......ww", "ww..www..ww", ".wwwwwwwww.", "..wwwwwww..", "..wwwwwww..", "..wwwwwww..", "..ww.w.ww..", "..ww.w.ww..", ".....w.....", "..........."] },
  garde: { nom: "GARDE", coul: "#2f6bff", fonce: "#0b3398", clair: "#a9c6ff", ic: [".wwwwwwwww.", ".wwwwwwwww.", ".ww.....ww.", ".ww..w..ww.", ".ww.www.ww.", ".ww..w..ww.", ".ww.....ww.", "..ww...ww..", "...ww.ww...", "....www....", ".....w....."] },
  elan: { nom: "ÉLAN", coul: "#8b5cf6", fonce: "#4a22b0", clair: "#d8c9ff", ic: ["...........", ".ww...ww...", "..ww...ww..", "...ww...ww.", "....ww...ww", "....ww...ww", "...ww...ww.", "..ww...ww..", ".ww...ww...", "...........", "..........."] },
  souffle: { nom: "SOUFFLE", coul: "#1f9a4b", fonce: "#0b5a28", clair: "#a8efc0", ic: ["...........", "..ww...ww..", ".wwww.wwww.", ".wwwwwwwww.", ".wwwwwwwww.", ".wwwwwwwww.", "..wwwwwww..", "...wwwww...", "....www....", ".....w.....", "..........."] },
};

/** L'icône d'un rôle, dans une couleur (le jaune de la frappe suit le blanc). */
export const iconeDeRole = (role: Role, coul: string): Planche => grille(ROLES[role].ic, { w: coul, y: coul === "#ffffff" ? "#ffd84a" : coul });

const TUILES = new Map<Role, Planche>();
/** La tuile d'un rôle : 15 cases, la couleur du rôle, son icône claire. */
export function tuileDeRole(role: Role): Planche {
  const deja = TUILES.get(role);
  if (deja) return deja;
  const r = ROLES[role];
  const c = new Planche(15, 15);
  rr(c, 0, 0, 15, 15, 2, PAL.k);
  rr(c, 1, 1, 13, 13, 1, r.coul);
  R(c, 2, 1, 11, 1, r.clair);
  R(c, 2, 13, 11, 1, r.fonce);
  c.drawImage(iconeDeRole(role, r.fonce), 2, 3);
  c.drawImage(iconeDeRole(role, "#ffffff"), 2, 2);
  TUILES.set(role, c);
  return c;
}

/* ---------- Les raretés : les couleurs des cases du site ---------- */

/** Les tons d'une carte : le haut, le bas du fondu, le bord, l'encre de l'effet. Le légendaire de saison prend ceux du légendaire. */
export const TONS: Readonly<Record<RangDeCarte, readonly [string, string, string, string]>> = {
  base: ["#f7f8fb", "#e2e6f0", "#8a96b8", "#4a5578"],
  commun: ["#eef6ff", "#cfe6ff", "#4aa3ff", "#1d6fd0"],
  "peu-commun": ["#eceeff", "#c9cffb", "#3a4fe8", "#2a37b8"],
  epique: ["#f4eaff", "#dcc6ff", "#9b4dff", "#6a22cf"],
  mystique: ["#ffecef", "#ffc4cc", "#ff2e4a", "#b8122a"],
  legendaire: ["#fff8dc", "#ffe59a", "#f2b632", "#8a5a00"],
  saison: ["#fff8dc", "#ffe59a", "#f2b632", "#8a5a00"],
  divin: ["#e4fbf8", "#aef0ea", "#19d3c5", "#0b7f77"],
};
/** La couleur de l'aura d'une carte, en trois nombres pour `rgba(var(--rc), …)`. */
export const AURAS: Readonly<Record<RangDeCarte, string>> = {
  base: "138,150,184",
  commun: "74,163,255",
  "peu-commun": "58,79,232",
  epique: "155,77,255",
  mystique: "255,46,74",
  legendaire: "242,182,50",
  saison: "242,182,50",
  divin: "25,211,197",
};

/* ---------- Les petits dessins : le cœur de vie, l'éclair d'énergie, le sablier, la goutte, la flamme ---------- */

export const COEUR = [".kk.kk.", "kpRkRRk", "kRRRRRk", "kRRRRrk", ".kRRrk.", "..krk..", "...k..."] as const;
export const COEUR_VIDE = [".kk.kk.", "kddkddk", "kdddddk", "kdddddk", ".kdddk.", "..kdk..", "...k..."] as const;
export const ECLAIR = ["...kk.", "..kYk.", ".kYyk.", "kYyykk", "kkyyOk", ".kyOk.", ".kOk..", ".kk..."] as const;
export const SABLIER = ["wwwwwww", "w.....w", ".wwwww.", "..www..", "...w...", "..w.w..", ".w.w.w.", "wwwwwww", "wwwwwww"] as const;
export const GOUTTE = ["...k...", "..kck..", "..kck..", ".kcBck.", "kcBBBck", "kBBBBbk", "kBBBbbk", ".kbbbk.", "..kkk.."] as const;
/** La flamme de série, telle que le site la dessine (`src/lib/flamme-serie.ts`). */
export const FLAMME = ["....o......", "...oro.....", "...orro....", "...orero...", "..oreero.o.", "..oreeeroro", ".oreejeerro", ".orejjeeero", "oreejjjeero", "orejjcjjero", "orejccjjero", "orejcccjero", ".orejcjero.", "..orrrrro..", "...ooooo..."] as const;

/** Les couleurs qui suivent le thème : l'écriture douce et le vide des jauges. */
export interface TonsDuTheme {
  doux: string;
  vide: string;
}
export const TONS_DU_THEME: Readonly<Record<"clair" | "sombre", TonsDuTheme>> = {
  clair: { doux: "#3d4a80", vide: "#c7d3ee" },
  sombre: { doux: "#aab6e8", vide: "#0d1744" },
};

export const coeurPlein = (): Planche => grille(COEUR, PAL);
export const coeurVide = (t: TonsDuTheme): Planche => grille(COEUR_VIDE, { k: t.doux, d: t.vide });
export const eclair = (): Planche => grille(ECLAIR, PAL);
export const flamme = (allumee: boolean, t: TonsDuTheme): Planche =>
  grille(FLAMME, allumee ? { o: "#4a1206", r: "#d92d0f", e: "#f5760f", j: "#ffc61a", c: "#fff1a8" } : { o: t.doux, r: t.vide, e: t.vide, j: t.vide, c: t.vide });
export const sablier = (coul = "#f6f1e3"): Planche => grille(SABLIER, { w: coul });
export const goutte = (fatigue: boolean): Planche => grille(GOUTTE, fatigue ? { k: "#4a1206", c: "#ff8a8f", B: "#e0263a", b: "#a8101f" } : PAL);

/* ---------- Les mots-clés : une icône chacun, 11 cases cernées d'encre ---------- */

export const MOTS_IC: Readonly<Record<string, readonly [string, readonly string[]]>> = {
  assomme: ["#e09a12", ["....w....", "....w....", "...www...", "..wwwww..", "wwwwwwwww", "..wwwww..", "...www...", "....w....", "....w...."]],
  saigne: ["#e0263a", ["....w....", "....w....", "...www...", "...www...", "..wwwww..", ".wwwwwww.", ".wwwwwww.", "..wwwww..", "...www..."]],
  perce: ["#2f6bff", ["....wwwww", ".....wwww", "......www", ".....w.ww", "....w...w", "...w.....", "..w......", ".w.......", "w........"]],
  brule: ["#f5760f", ["....w....", "...ww....", "...www...", "..wwww.w.", "..wwwwww.", ".wwwwwww.", ".wwwwwww.", "..wwwww..", "...www..."]],
  epines: ["#1f9a4b", ["w...w...w", "w...w...w", "ww.www.ww", "ww.www.ww", "wwwwwwwww", "wwwwwwwww", ".wwwwwww.", "..wwwww..", "........."]],
  rempart: ["#5a6590", ["ww.ww.ww.", "ww.ww.ww.", "wwwwwwww.", "wwwwwwww.", "wwwwwwww.", "wwwwwwww.", "wwwwwwww.", "wwwwwwww.", "........."]],
  vif: ["#00a37a", ["......www", "....wwww.", "..wwwww..", ".wwwww...", "wwwww....", ".wwww....", "..www....", "...ww....", "....w...."]],
  lourd: ["#3d4770", ["...www...", "..w...w..", "..w...w..", ".wwwwwww.", ".wwwwwww.", "wwwwwwwww", "wwwwwwwww", "wwwwwwwww", "........."]],
  regal: ["#ff5f86", ["....ww...", "...ww....", ".www.www.", "wwwwwwwww", "wwwwwwwww", "wwwwwwwww", ".wwwwwww.", "..ww.ww..", "........."]],
  ardeur: ["#19b8d3", ["....www..", "...www...", "..www....", ".wwwwww..", "...www...", "..www....", ".www.....", "ww.......", "w........"]],
  rage: ["#c2182b", ["w.......w", "ww.....ww", ".ww...ww.", "..ww.ww..", "...www...", ".........", ".w.w.w.w.", ".wwwwwww.", "........."]],
  gel: ["#4aa3ff", ["....w....", "..w.w.w..", "...www...", "w..www..w", ".wwwwwww.", "w..www..w", "...www...", "..w.w.w..", "....w...."]],
  elan: ["#8b5cf6", [".........", "ww..ww...", ".ww..ww..", "..ww..ww.", "...ww..ww", "..ww..ww.", ".ww..ww..", "ww..ww...", "........."]],
  unique: ["#f2b632", ["....w....", "....w....", "...www...", "wwwwwwwww", ".wwwwwww.", "..wwwww..", "..wwwww..", ".www.www.", ".w.....w."]],
};

/** La couleur d'un mot-clé (celle de son icône) ; l'or des effets uniques pour les autres. */
export const couleurDuMot = (mot: string, unique: boolean): string => (!unique && MOTS_IC[mot] ? MOTS_IC[mot][0] : MOTS_IC["unique"]![0]);

const ICONES_DES_MOTS = new Map<string, Planche>();
/** L'icône d'un mot-clé, 11 cases, cernée d'encre. Les effets uniques et les mots sans dessin portent l'étoile. */
export function iconeDeMot(mot: string, unique: boolean): Planche {
  const cle = !unique && MOTS_IC[mot] ? mot : "unique";
  const deja = ICONES_DES_MOTS.get(cle);
  if (deja) return deja;
  const [coul, dessin] = MOTS_IC[cle]!;
  const c = new Planche(11, 11);
  c.drawImage(grille(dessin, { w: coul }), 1, 1);
  cerne(c, "#070b1f");
  ICONES_DES_MOTS.set(cle, c);
  return c;
}

/* ---------- Les cartes ---------- */

/** Ce qu'une carte montre : ce que les règles lui donnent, le nom et le dessin de l'objet. */
export interface CarteDessinee {
  role: Role;
  /** Le prix en énergie (et en points de bourse). */
  c: number;
  /** La force imprimée. */
  f: number;
  /** Les mots-clés, dans l'ordre de la carte, et s'ils sont l'effet unique. */
  mots: readonly { mot: string; n: number; unique: boolean }[];
  /** Le nom de l'effet unique, s'il y en a un. */
  unique: string | null;
  r: RangDeCarte;
  nom: string;
  /** Le dessin de l'objet, rogné à son contour ; `null` : rien à montrer. */
  dessin: Planche | null;
  /** Le mot-clé principal et son nom, en très peu de mots (« SAIGNE 1 »). */
  effetCourt: string;
}

/** L'état d'une carte à cette manche : la force qu'elle aurait, l'élan qu'elle porte, l'énergie qui manque, le repos. */
export interface EtatDeCarte {
  force?: number;
  essouffle?: boolean;
  elan?: number;
  repos?: number;
}

export const CASE_L = 68;
export const CASE_H = 88;

/** Une planche à demi effacée (les mots-clés d'une carte essoufflée). */
function attenue(p: Planche, part: number): Planche {
  const c = p.copie();
  for (let i = 3; i < c.data.length; i += 4) c.data[i] = Math.round(c.data[i]! * part);
  return c;
}
const agrandi = (g: Planche, src: Planche, x: number, y: number, k: number): void => g.drawImage(src, x, y, src.width * k, src.height * k);
const iconeDeRareteDe = (r: RangDeCarte): Planche | null => (r === "base" ? null : iconeDeRarete(r));

/**
 * La face d'une carte de duel, 68 sur 88 cases : claire, à la couleur de sa rareté. En haut à gauche, le rôle et la force ;
 * sous lui, le prix en éclairs ; en haut à droite, l'icône de rareté du jeu, puis les mots-clés ; au milieu, l'objet ; en bas,
 * son nom et son effet en très peu de mots. Au repos : voilée, avec le sablier. Essoufflée : le bandeau rouge.
 */
export function faceDeCarte(carte: CarteDessinee, etat: EtatDeCarte = {}): Planche {
  const W = CASE_L;
  const H = CASE_H;
  const g = new Planche(W, H);
  const [haut, bas, bord, encre] = TONS[carte.r];
  rr(g, 0, 0, W, H, 3, bord);
  rr(g, 1, 1, W - 2, H - 5, 2, haut);
  for (let y = 1; y < H - 4; y++) {
    const t = (y / H) * 18 - 3;
    for (let x = 1; x < W - 1; x++) if (BAYER[(y & 3) * 4 + (x & 3)]! < t && !(y < 3 && (x < 3 || x > W - 4))) R(g, x, y, 1, 1, bas);
  }
  R(g, 2, 1, W - 4, 1, "#ffffff");
  // le badge : l'icône du rôle et la force en gros
  const r = ROLES[carte.role];
  const ess = !!etat.essouffle;
  const f = String(etat.force ?? carte.f);
  const bw = 21 + f.length * 12 - 1;
  rr(g, 2, 2, bw, 19, 3, PAL.k);
  rr(g, 3, 3, bw - 2, 17, 2, ess ? "#8a96b8" : r.coul);
  R(g, 5, 3, bw - 6, 1, ess ? "#c8d0e6" : r.clair);
  R(g, 5, 19, bw - 6, 1, ess ? "#4a5578" : r.fonce);
  rr(g, 3, 3, 15, 17, 2, ess ? "#4a5578" : r.fonce);
  R(g, 18, 4, 1, 15, ess ? "#c8d0e6" : r.clair);
  g.drawImage(iconeDeRole(carte.role, "#ffffff"), 5, 6);
  agrandi(g, ecrire(f, "#070b1f"), 22, 6, 2);
  agrandi(g, ecrire(f, etat.elan ? "#fff1a8" : "#ffffff"), 21, 5, 2);
  if (etat.elan) g.drawImage(ecrire(`+${etat.elan}`, "#6a22cf"), bw + 4, 8);
  // la rareté
  const ir = iconeDeRareteDe(carte.r);
  if (ir) g.drawImage(ir, W - 14, 3);
  // le prix en énergie, dans sa pastille
  if (carte.c > 0) {
    rr(g, 2, 23, 17, 12, 3, PAL.k);
    rr(g, 3, 24, 15, 10, 2, ess ? "#ffd9de" : "#fff7dc");
    g.drawImage(eclair(), 3, 25);
    g.drawImage(ecrire(String(carte.c), ess ? "#c2182b" : "#231503"), 11, 26);
  }
  // les mots-clés, en icônes alignées
  carte.mots.slice(0, 3).forEach(({ mot, unique }, i) => {
    const ic = iconeDeMot(mot, unique);
    g.drawImage(ess ? attenue(ic, 0.35) : ic, W - 14, 17 + i * 12);
  });
  // l'objet
  if (carte.dessin) {
    const src = carte.dessin;
    const e = src.width <= 42 && src.height <= 40 ? 1 : 0.5;
    const iw = Math.max(1, Math.round(src.width * e));
    const ih = Math.max(1, Math.round(src.height * e));
    g.drawImage(src, Math.round(37 - iw / 2), Math.round(Math.max(20, 39 - ih / 2)), iw, ih);
  }
  // le nom, puis l'effet en très peu de mots
  const ls = lignesDuTexte(enCapitales(carte.nom), W - 6, 3);
  const court = ls.length < 3 ? carte.effetCourt : "";
  ls.forEach((l, i) => g.drawImage(ecrire(l, "#0a1230"), Math.round(W / 2 - largeurDuTexte(l) / 2), (ls.length === 1 && !court ? 65 : 59) + i * 8));
  if (court && largeurDuTexte(court) <= W - 4) g.drawImage(ecrire(court, encre), Math.round(W / 2 - largeurDuTexte(court) / 2), ls.length === 1 ? 70 : 76);
  if (etat.repos) {
    g.fillStyle = "rgba(240,244,251,.76)";
    g.fillRect(1, 1, W - 2, H - 5);
    rr(g, 17, 33, 34, 22, 4, "#0a1230");
    g.drawImage(sablier(), 22, 40);
    agrandi(g, ecrire(String(etat.repos), "#ffd84a"), 34, 37, 2);
  }
  if (ess) {
    const t = "ESSOUFFLÉE";
    rr(g, 2, 46, W - 4, 11, 2, "#c2182b");
    g.drawImage(ecrire(t, "#ffffff"), Math.round(W / 2 - largeurDuTexte(t) / 2), 48);
  }
  return g;
}

/**
 * La face de poche, pour les petites cartes du téléphone : 34 cases sur 44, à gros pixels. Le badge, le prix, la rareté,
 * les mots-clés et l'objet ; le nom se lit sur la carte levée et dans sa fiche.
 */
export function faceDePoche(carte: CarteDessinee, etat: EtatDeCarte = {}): Planche {
  const g = new Planche(34, 44);
  const [haut, bas, bord] = TONS[carte.r];
  const r = ROLES[carte.role];
  const ess = !!etat.essouffle;
  const f = String(etat.force ?? carte.f);
  rr(g, 0, 0, 34, 44, 2, bord);
  rr(g, 1, 1, 32, 40, 1, haut);
  R(g, 1, 26, 32, 15, bas);
  for (let x = 1; x < 33; x += 2) R(g, x, 25, 1, 1, bas);
  const bw = 16 + f.length * 6;
  rr(g, 1, 1, bw, 13, 2, PAL.k);
  rr(g, 2, 2, bw - 2, 11, 1, ess ? "#8a96b8" : r.coul);
  rr(g, 2, 2, 12, 11, 1, ess ? "#4a5578" : r.fonce);
  R(g, 14, 3, 1, 9, ess ? "#c8d0e6" : r.clair);
  g.drawImage(iconeDeRole(carte.role, "#ffffff"), 2, 2);
  g.drawImage(ecrire(f, "#070b1f"), 17, 5);
  g.drawImage(ecrire(f, etat.elan ? "#fff1a8" : "#ffffff"), 16, 4);
  const ir = iconeDeRareteDe(carte.r);
  if (ir) g.drawImage(ir, 22, 1);
  if (carte.c > 0) {
    rr(g, 1, 15, 15, 10, 2, PAL.k);
    rr(g, 2, 16, 13, 8, 1, ess ? "#ffd9de" : "#fff7dc");
    g.drawImage(eclair(), 2, 16);
    g.drawImage(ecrire(String(carte.c), ess ? "#c2182b" : "#231503"), 9, 17);
  }
  carte.mots.slice(0, 2).forEach(({ mot, unique }, i) => {
    const ic = iconeDeMot(mot, unique);
    g.drawImage(ess ? attenue(ic, 0.35) : ic, 22, 13 + i * 12);
  });
  if (carte.dessin) {
    const src = carte.dessin;
    const e = src.width <= 20 && src.height <= 16 ? 1 : 0.5;
    const iw = Math.max(1, Math.round(src.width * e));
    const ih = Math.max(1, Math.round(src.height * e));
    g.drawImage(src, Math.round(11 - iw / 2), Math.round(33 - Math.min(ih, 16) / 2), iw, Math.min(ih, 16));
  }
  if (etat.repos) {
    g.fillStyle = "rgba(240,244,251,.78)";
    g.fillRect(1, 1, 32, 40);
    rr(g, 6, 15, 22, 13, 2, "#0a1230");
    g.drawImage(sablier(), 9, 17);
    g.drawImage(ecrire(String(etat.repos), "#ffd84a"), 19, 18);
  }
  return g;
}

const EPEES = ["................", ".ww..........ww.", ".www........www.", "..www......www..", "...www....www...", "....www..www....", ".....wwwwww.....", "......wwww......", "......wwww......", ".....wwwwww.....", "..w.www..www.w..", "..wwww....wwww..", "...ww......ww...", "..wwww....wwww..", ".ww..w....w..ww.", "................"];

let DOS: Planche | null = null;
/** Le dos : bleu marine, treillis, cadre d'or et deux épées. Une carte cachée ne trahit pas sa rareté. */
export function dosDeCarte(): Planche {
  if (DOS) return DOS;
  const W = CASE_L;
  const H = CASE_H;
  const g = new Planche(W, H);
  rr(g, 0, 0, W, H, 3, PAL.k);
  rr(g, 1, 1, W - 2, H - 2, 2, PAL.o);
  rr(g, 1, 1, W - 3, H - 3, 2, PAL.y);
  rr(g, 2, 2, W - 4, H - 4, 1, PAL.O);
  rr(g, 4, 4, W - 8, H - 8, 1, PAL.k);
  rr(g, 5, 5, W - 10, H - 10, 0, "#1f3aa8");
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) if ((x + y) % 6 === 0 || (x - y + 200) % 6 === 0) R(g, x, y, 1, 1, "#2f55d8");
  rr(g, 14, 24, 40, 40, 8, PAL.k);
  rr(g, 15, 25, 38, 38, 7, PAL.y);
  rr(g, 17, 27, 34, 34, 6, PAL.k);
  rr(g, 18, 28, 32, 32, 5, "#0b1238");
  agrandi(g, grille(EPEES, { w: PAL.y }), 18, 28, 2);
  DOS = g;
  return g;
}

/** La puce d'une carte adverse, 19 sur 37 cases : le rôle, la force qu'elle aurait maintenant ; au repos, le sablier. */
export function puceDeCarte(carte: Pick<CarteDessinee, "role" | "f" | "r">, etat: EtatDeCarte = {}): Planche {
  const g = new Planche(19, 37);
  const [haut, bas, bord] = TONS[carte.r];
  rr(g, 0, 0, 19, 37, 2, bord);
  rr(g, 1, 1, 17, 33, 1, haut);
  R(g, 1, 22, 17, 12, bas);
  g.drawImage(tuileDeRole(carte.role), 2, 2);
  const f = String(etat.force ?? carte.f);
  const coul = etat.essouffle ? "#c2182b" : etat.elan ? "#6a22cf" : "#0a1230";
  if (f.length > 1) g.drawImage(ecrire(f, coul), Math.round(9.5 - largeurDuTexte(f) / 2), 22);
  else agrandi(g, ecrire(f, coul), 5, 18, 2);
  if (etat.repos) {
    g.fillStyle = "rgba(240,244,251,.72)";
    g.fillRect(1, 1, 17, 33);
    rr(g, 1, 19, 17, 13, 2, "#0a1230");
    g.drawImage(sablier(), 3, 21);
    g.drawImage(ecrire(String(etat.repos), "#ffd84a"), 12, 22);
  }
  return g;
}

/**
 * Une carte que le membre n'a pas, dans le recueil (proposition de Claude Fable 5.2, 22 novembre 2026) : la même face, sans
 * couleur et pâlie (42 % de la luminance, 58 % de blanc, à peine bleutée), le bord en pointillé, une case sur deux. Elle reste
 * claire dans les deux thèmes ; son rôle, sa force et son nom se lisent encore. L'objet y est en silhouette (`silhouette`).
 */
export function enGris(p: Planche): Planche {
  const c = p.copie();
  const d = c.data;
  const W = c.width;
  const H = c.height;
  const plein = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && p.data[(y * W + x) * 4 + 3]! > 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!d[i + 3]) continue;
      const l = d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11;
      const v = l * 0.42 + 255 * 0.58 * 0.94;
      d[i] = v * 0.95;
      d[i + 1] = v * 0.97;
      d[i + 2] = Math.min(255, v * 1.04);
      if ((!plein(x - 1, y) || !plein(x + 1, y) || !plein(x, y - 1) || !plein(x, y + 1)) && ((x + y) >> 1) & 1) d[i + 3] = 0;
    }
  return c;
}

/** L'objet en silhouette, d'une seule couleur : sur la carte d'un objet qu'on n'a pas. */
export function silhouette(p: Planche): Planche {
  const c = new Planche(p.width, p.height);
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.pleine(x, y)) R(c, x, y, 1, 1, "#7f8bb0");
  return c;
}

/** Les deux épées croisées du bouton « Entrer dans l'arène », en or cerné d'encre : 20 sur 16 cases. */
export function epeesCroisees(): Planche {
  const c = new Planche(20, 16);
  const lig1 = (x0: number, y0: number, x1: number, y1: number, coul: string, ep: number): void => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      R(c, x, y, ep, ep, coul);
      if (x === x1 && y === y1) break;
      const e2 = 2 * e;
      if (e2 > -dy) {
        e -= dy;
        x += sx;
      }
      if (e2 < dx) {
        e += dx;
        y += sy;
      }
    }
  };
  for (const m of [0, 1]) {
    const X = (x: number): number => (m ? 19 - x : x);
    const l = (a: number, b: number, d: number, e: number, coul: string, ep: number): void => {
      const x0 = X(a);
      const x1 = X(d);
      lig1(m && ep > 1 ? x0 - 1 : x0, b, m && ep > 1 ? x1 - 1 : x1, e, coul, ep);
    };
    l(3, 1, 12, 10, "#fffbe6", 2);
    l(3, 1, 4, 2, "#ffffff", 1);
    l(10, 12, 14, 8, "#6b3f1c", 1);
    l(11, 13, 15, 9, "#6b3f1c", 1);
    l(13, 12, 15, 14, "#a8682f", 2);
  }
  return cerne(c, "#231503");
}
