/**
 * Les images du coffre (docs/DIRECTION.md, « Le coffre du druide », planches choisies par le pilote le 16 novembre 2026) :
 * la scène d'un essai, celle d'une victoire, et le podium de la semaine. Le pilote trouvait le jeu « ennuyeux » en texte
 * seul, puis les premiers dessins « moches » : les gardiens sont de vrais Gaulois du site, habillés dans la garde-robe
 * (`gaulois.ts`), posés dans les décors de /gaulois (`decors/`), face au Gaulois du membre.
 *
 * Une scène d'essai montre : le gardien de la manche derrière son coffre, son humeur dite trois fois pour qu'aucun joueur
 * ne la rate (son visage, une bulle au-dessus de lui, et son nom suivi de l'humeur en toutes lettres) ; le Gaulois du
 * membre en face ; et, dessous, le tableau des indices : le mot en cases, les indices arrachés, la manche et l'essai, la
 * garde du gardien (un à quatre boucliers) et la cagnotte.
 *
 * Rien n'est inventé ici : chaque valeur dessinée est donnée par l'appelant, qui la tient du serveur. Dessiné case par
 * case pour ce site, sans emprunt à une œuvre existante. Design : Claude Fable 5.2.
 */
import { banniereParId, dessinDeLaBanniere } from "./bannieres/index.ts";
import { ecrirePng, type Image } from "./billets.ts";
import { decorDe } from "./decors/index.ts";
import { casesDuGaulois, GAULOIS_HAUTEUR, GAULOIS_LARGEUR, lireTenue, TENUE_DE_DEPART, type Tenue } from "./gaulois.ts";
import type { Lieu, Moment } from "./scene.ts";
import { casesDuStatere } from "./statere.ts";

/* ---------- Les gardiens et leurs humeurs ---------- */

export const GARDIENS = ["druide", "forgeron", "barde", "marchande"] as const;
export type Gardien = (typeof GARDIENS)[number];
export const HUMEURS = ["confiant", "flatte", "mefiant", "agace", "panique", "vaincu"] as const;
export type Humeur = (typeof HUMEURS)[number];
export const SOIRS = ["cervoise", "veillee"] as const;
export type Soir = (typeof SOIRS)[number];

/** Le nom d'un gardien, son lieu, et sa tenue dans la garde-robe du site. */
export const FICHES_DES_GARDIENS: Readonly<Record<Gardien, { nom: string; lieu: Lieu; tenue: Readonly<Record<string, string>> }>> = {
  druide: {
    nom: "Le druide",
    lieu: "reunion",
    tenue: { peau: "claire", cheveux: "longs", teinte_cheveux: "blanc", barbe: "fleuve", cicatrice: "aucune", tete: "capuche", haut: "cape-capuche", bas: "braies-grises", pieds: "sandales", arme: "sceptre-bois-flotte" },
  },
  forgeron: {
    nom: "Le forgeron",
    lieu: "maisons",
    tenue: { peau: "mate", cheveux: "degarni", teinte_cheveux: "roux", barbe: "grande", cicatrice: "sourcil-fendu", tete: "lunettes-forgeron", haut: "tablier-forgeron", bas: "braies-cuir", pieds: "bottes-lacees", arme: "marteau-forgeron" },
  },
  barde: {
    nom: "Le barde",
    lieu: "taverne",
    tenue: { peau: "claire", cheveux: "boucles", teinte_cheveux: "blond", barbe: "bouc", cicatrice: "rousseur", tete: "chapeau-panache", haut: "tunique-brodee", bas: "braies-bicolores", pieds: "poulaines", arme: "harpe-or" },
  },
  marchande: {
    nom: "La marchande",
    lieu: "place",
    tenue: { peau: "doree", cheveux: "chignon", teinte_cheveux: "gris", barbe: "aucune", cicatrice: "grain-de-beaute", tete: "foulard-noue", haut: "gilet-brocart", bas: "jupe-laine", pieds: "souliers-boucle", arme: "lanterne" },
  },
};

/** Une humeur : le mot que lit le joueur, sa couleur, et le visage du gardien (yeux et bouche de la garde-robe). */
export const FICHES_DES_HUMEURS: Readonly<Record<Humeur, { mot: string; couleur: string; yeux: string; bouche: string }>> = {
  confiant: { mot: "sûr de lui", couleur: "#FFC857", yeux: "rieurs", bouche: "en-coin" },
  flatte: { mot: "flatté", couleur: "#FF8FB4", yeux: "rieurs", bouche: "grand-sourire" },
  mefiant: { mot: "méfiant", couleur: "#C3A6FF", yeux: "sourcil-leve", bouche: "pincees" },
  agace: { mot: "agacé", couleur: "#FF6A55", yeux: "severe", bouche: "grimace" },
  panique: { mot: "paniqué", couleur: "#8FD3FF", yeux: "ronds", bouche: "bee" },
  vaincu: { mot: "vaincu", couleur: "#AEB7CF", yeux: "endormi", bouche: "moue" },
};

/** La tenue d'un gardien dans une humeur. Toujours lisible : un test le vérifie pour chaque couple. */
export function tenueDuGardien(gardien: Gardien, humeur: Humeur): Tenue {
  const { yeux, bouche } = FICHES_DES_HUMEURS[humeur];
  return lireTenue({ ...FICHES_DES_GARDIENS[gardien].tenue, yeux, bouche }) ?? TENUE_DE_DEPART;
}

/** La bulle au-dessus du gardien : un signe de 9 cases sur 9, à la couleur de l'humeur. */
export const SIGNES_DES_HUMEURS: Readonly<Record<Humeur, readonly string[]>> = {
  // Une étoile.
  confiant: ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..#####..", ".##...##.", "##.....##"],
  // Un cœur.
  flatte: [".##...##.", "####.####", "#########", "#########", "#########", ".#######.", "..#####..", "...###...", "....#...."],
  // Un point d'interrogation.
  mefiant: ["..#####..", ".##...##.", ".##...##.", ".....##..", "....##...", "...##....", "...##....", ".........", "...##...."],
  // Un éclair.
  agace: ["....####.", "...####..", "..####...", ".#######.", "...####..", "..####...", ".####....", ".###.....", "##......."],
  // Un point d'exclamation.
  panique: ["...###...", "...###...", "...###...", "...###...", "...###...", "...###...", ".........", "...###...", "...###..."],
  // Deux larmes.
  vaincu: [".#.....#.", ".#.....#.", "###...###", "###...###", "###...###", ".#.....#.", ".........", ".........", "........."],
};

/* ---------- La toile, en vrais pixels ---------- */

const hexa = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

class Toile {
  readonly rgba: Uint8Array<ArrayBuffer>;
  constructor(
    readonly l: number,
    readonly h: number,
  ) {
    this.rgba = new Uint8Array(new ArrayBuffer(l * h * 4));
  }
  r(x: number, y: number, w: number, h: number, hex: string, opacite = 1): void {
    const c = hexa(hex);
    const x0 = Math.max(0, Math.round(x));
    const x1 = Math.min(this.l, Math.round(x + w));
    for (let j = Math.max(0, Math.round(y)); j < Math.min(this.h, Math.round(y + h)); j++) {
      for (let i = x0; i < x1; i++) {
        const k = (j * this.l + i) * 4;
        for (let n = 0; n < 3; n++) this.rgba[k + n] = Math.round((this.rgba[k + n] ?? 0) * (1 - opacite) + (c[n] ?? 0) * opacite);
        this.rgba[k + 3] = 255;
      }
    }
  }
  /** Des cases (une couleur, ou rien) posées à l'échelle `e`. */
  cases(cases: readonly (string | null)[], largeur: number, x: number, y: number, e: number, miroir = false): void {
    const hauteur = cases.length / largeur;
    for (let j = 0; j < hauteur; j++) {
      for (let i = 0; i < largeur; i++) {
        const c = cases[j * largeur + (miroir ? largeur - 1 - i : i)];
        if (c) this.r(x + i * e, y + j * e, e, e, c);
      }
    }
  }
  /** Un motif de « # » posé à l'échelle `u`. */
  motif(rangees: readonly string[], x: number, y: number, u: number, hex: string): void {
    rangees.forEach((rangee, j) => [...rangee].forEach((v, i) => v === "#" && this.r(x + i * u, y + j * u, u, u, hex)));
  }
  image(): Image {
    return { largeur: this.l, hauteur: this.h, rgba: this.rgba };
  }
}

/* ---------- Deux écritures en cases, avec les accents du français ---------- */

const tranches = (v: string): string[] => [0, 3, 6, 9, 12].map((i) => v.slice(i, i + 3));

/** La petite écriture : trois cases sur cinq, « M » et « W » sur cinq de large. */
export const PETITE: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(
    Object.entries({
      A: ".#.#.#####.##.#", B: "##.#.###.#.###.", C: ".###..#..#...##", D: "##.#.##.##.###.", E: "####..##.#..###", F: "####..##.#..#..",
      G: ".###..#.##.#.##", H: "#.##.#####.##.#", I: "###.#..#..#.###", J: "..#..#..##.#.#.", K: "#.##.###.#.##.#", L: "#..#..#..#..###",
      N: "##.#.##.##.##.#", O: ".#.#.##.##.#.#.", P: "##.#.###.#..#..", Q: ".#.#.##.####.##", R: "##.#.###.#.##.#", S: ".###...#...###.",
      T: "###.#..#..#..#.", U: "#.##.##.##.####", V: "#.##.##.##.#.#.", X: "#.##.#.#.#.##.#", Y: "#.##.#.#..#..#.", Z: "###..#.#.#..###",
      "0": "####.##.##.####", "1": ".#.##..#..#.###", "2": "##...#.#.#..###", "3": "##...#.#...###.", "4": "#.##.####..#..#", "5": "####..##...###.",
      "6": ".###..####.####", "7": "###..#.#..#..#.", "8": "####.#####.####", "9": "####.####..###.",
      ".": "............#..", ",": "...........#.#.", ":": "....#.....#....", "-": "......###......", "'": ".#..#..........", "!": ".#..#..#.....#.", "?": "##...#.#.....#.",
      "+": "....#.###.#....", "/": "..#..#.#.#..#..",
    }).map(([signe, v]) => [signe, tranches(v)]),
  ),
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
  "·": ["...", "...", ".#.", "...", "..."],
  " ": ["..", "..", "..", "..", ".."],
};

/** La grande écriture : cinq cases sur sept, pour le mot et les titres. */
export const GRANDE: Readonly<Record<string, readonly string[]>> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"], D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"], F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".####"], H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"], J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"], L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"], N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"], R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."], T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"], X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."], Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  " ": ["...", "...", "...", "...", "...", "...", "..."],
};

/** Les accents, posés sur deux rangées au-dessus de la lettre ; la cédille, une rangée dessous. */
const ACCENTS: Readonly<Record<string, readonly string[]>> = {
  "́": ["..#", ".#."],
  "̀": ["#..", ".#."],
  "̂": [".#.", "#.#"],
  "̈": ["...", "#.#"],
};
const CEDILLE = "̧";

/** Un texte tel qu'il s'écrit ici : en capitales, chaque lettre suivie de ses accents ; « œ » en deux lettres. */
function signesDe(texte: string): { base: string; marques: string[] }[] {
  const signes: { base: string; marques: string[] }[] = [];
  const propre = texte.toUpperCase().replace(/Œ/g, "OE").replace(/Æ/g, "AE").replace(/[’‘]/g, "'").replace(/[«»"]/g, "").replace(/\s+/g, " ").normalize("NFD");
  for (const signe of propre) {
    const dernier = signes[signes.length - 1];
    if (/\p{M}/u.test(signe)) dernier?.marques.push(signe);
    else signes.push({ base: signe, marques: [] });
  }
  return signes;
}

/** La largeur d'un texte, en pixels, à l'échelle `u`. Un signe inconnu ne s'écrit pas et ne prend pas de place. */
export function largeurDuTexte(police: Readonly<Record<string, readonly string[]>>, texte: string, u: number): number {
  let total = 0;
  for (const { base } of signesDe(texte)) {
    const g = police[base];
    if (g) total += ((g[0]?.length ?? 0) + 1) * u;
  }
  return Math.max(0, total - u);
}

function ecrire(t: Toile, police: Readonly<Record<string, readonly string[]>>, x: number, y: number, texte: string, hex: string, u: number, ombre: string | null = null): number {
  for (const { base, marques } of signesDe(texte)) {
    const g = police[base];
    if (!g) continue;
    const hauteur = g.length;
    const milieu = Math.floor(((g[0]?.length ?? 3) - 3) / 2);
    if (ombre) t.motif(g, x + u, y + u, u, ombre);
    t.motif(g, x, y, u, hex);
    for (const marque of marques) {
      const accent = ACCENTS[marque];
      if (accent) t.motif(accent, x + milieu * u, y - 3 * u, u, hex);
      if (marque === CEDILLE) t.r(x + (milieu + 1) * u, y + hauteur * u, u, u, hex);
    }
    x += ((g[0]?.length ?? 3) + 1) * u;
  }
  return x;
}

const centrer = (t: Toile, police: Readonly<Record<string, readonly string[]>>, cx: number, y: number, texte: string, hex: string, u: number, ombre: string | null = null): void => {
  ecrire(t, police, Math.round(cx - largeurDuTexte(police, texte, u) / 2), y, texte, hex, u, ombre);
};

/** Un texte raccourci pour tenir dans `max` pixels : ses derniers signes cèdent la place. */
function raccourci(police: Readonly<Record<string, readonly string[]>>, texte: string, u: number, max: number): string {
  let court = texte.trim();
  while (court.length > 1 && largeurDuTexte(police, court, u) > max) court = court.slice(0, -1).trimEnd();
  return court;
}

/* ---------- Les couleurs ---------- */

const NUIT = "#070D24";
const OR = "#FFC857";
const OR_CLAIR = "#FFE9A8";
const OR_SOMBRE = "#B8862C";
const BLANC = "#E8ECF5";
const GRIS = "#AEB7CF";
const CASE = "#16224F";
const CASE_BORD = "#2A3B7A";
const CONTOUR = "#1A0F08";

/* ---------- Le coffre, en cases ---------- */

/** Le coffre, fermé ou ouvert sur son or : 38 cases de large, sa base sur la dernière rangée. */
export function casesDuCoffre(ouvert: boolean): { cases: (string | null)[]; largeur: number; hauteur: number } {
  const l = 38;
  const h = ouvert ? 40 : 28;
  const c: (string | null)[] = new Array<string | null>(l * h).fill(null);
  const p = (x: number, y: number, hex: string): void => {
    if (x >= 0 && y >= 0 && x < l && y < h) c[y * l + x] = hex;
  };
  const r = (x: number, y: number, w: number, hh: number, hex: string): void => {
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) p(x + i, y + j, hex);
  };
  const BOIS = { clair: "#B5763A", fond: "#96592A", sombre: "#6E3F1C", creux: "#4A2A10" };
  const FER = { clair: "#C3C9D6", fond: "#8D95A6", sombre: "#5C6474" };
  const bas = h - 17;
  // La caisse : planches, veines, ferrures et rivets.
  r(1, bas, 36, 17, CONTOUR);
  r(2, bas + 1, 34, 15, BOIS.fond);
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 34; x++) {
      if (y % 5 === 4) p(2 + x, bas + 1 + y, BOIS.sombre);
      else if ((x * 7 + y * 13) % 23 === 0) p(2 + x, bas + 1 + y, BOIS.sombre);
      else if (y % 5 === 0) p(2 + x, bas + 1 + y, BOIS.clair);
    }
  }
  for (const x of [5, 30]) {
    r(x, bas, 4, 17, CONTOUR);
    r(x + 1, bas + 1, 2, 15, FER.fond);
    r(x + 1, bas + 1, 1, 15, FER.clair);
    for (const y of [3, 8, 13]) p(x + 2, bas + y, FER.sombre);
  }
  r(2, bas + 15, 34, 1, BOIS.creux);
  if (ouvert) {
    // Le couvercle relevé, vu de l'intérieur, et l'or qui déborde.
    r(1, 0, 36, 15, CONTOUR);
    r(2, 1, 34, 13, BOIS.creux);
    r(3, 2, 32, 11, "#5A3416");
    for (let x = 0; x < 32; x++) if (x % 6 === 5) r(3 + x, 2, 1, 11, BOIS.creux);
    for (const x of [5, 30]) {
      r(x, 0, 4, 15, CONTOUR);
      r(x + 1, 1, 2, 13, FER.sombre);
    }
    r(2, 15, 34, bas - 15, "#2A1608");
    for (let x = 0; x < 34; x++) {
      const haut = 3 + Math.round(3 * Math.abs(Math.sin(x * 0.9)) + 2 * Math.abs(Math.sin(x * 0.37)));
      for (let y = 0; y < haut; y++) p(2 + x, bas - y, y === haut - 1 ? OR_CLAIR : (x + y) % 3 === 0 ? OR_SOMBRE : OR);
    }
    for (const [x, y] of [[9, bas - 9], [20, bas - 11], [28, bas - 8]] as const) {
      p(x, y, BLANC);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) p(x + dx, y + dy, OR_CLAIR);
    }
  } else {
    // Le couvercle bombé.
    r(1, bas - 9, 36, 10, CONTOUR);
    r(3, bas - 11, 32, 3, CONTOUR);
    r(2, bas - 8, 34, 8, BOIS.fond);
    r(4, bas - 10, 30, 2, BOIS.clair);
    r(2, bas - 8, 34, 1, BOIS.clair);
    r(2, bas - 4, 34, 1, BOIS.sombre);
    for (const x of [5, 30]) {
      r(x, bas - 10, 4, 11, CONTOUR);
      r(x + 1, bas - 9, 2, 9, FER.fond);
      r(x + 1, bas - 9, 1, 9, FER.clair);
    }
    r(2, bas - 1, 34, 1, BOIS.creux);
  }
  // La serrure.
  const sy = bas - (ouvert ? 0 : 2);
  r(15, sy, 8, 9, CONTOUR);
  r(16, sy + 1, 6, 7, OR);
  r(16, sy + 1, 6, 1, OR_CLAIR);
  r(21, sy + 1, 1, 7, OR_SOMBRE);
  r(18, sy + 3, 2, 2, CONTOUR);
  r(18, sy + 5, 1, 2, CONTOUR);
  return { cases: c, largeur: l, hauteur: h };
}

/* ---------- La scène ---------- */

/** L'image d'un essai, d'une victoire ou du podium : 620 sur 400, plus de 1,55 fois plus large que haute. */
export const IMAGE_DU_COFFRE = { largeur: 620, hauteur: 400, echelle: 5, bandeau: 65 } as const;
const E = IMAGE_DU_COFFRE.echelle;
const DECOR_L = 124;
/** Les rangées du décor gardées : de la tête des Gaulois à l'ombre sous leurs pieds. */
const HAUT = 10;
const BAS = 77;
const PIEDS = 72;
const H_SCENE = (BAS - HAUT) * E;
const L = IMAGE_DU_COFFRE.largeur;

const NUIT_DE_LUNE: Moment = { phase: "nuit", astre: { sorte: "lune", course: 0.78, hauteur: 0.82 } };
const CREPUSCULE: Moment = { phase: "crepuscule", astre: { sorte: "soleil", course: 0.9, hauteur: 0.15 } };
const PLEIN_JOUR: Moment = { phase: "jour", astre: { sorte: "soleil", course: 0.5, hauteur: 0.8 } };

function ombreAuSol(t: Toile, cx: number, rayon: number, hex: string): void {
  for (let y = PIEDS - 3; y <= PIEDS + 3; y++) {
    for (let x = 0; x < DECOR_L; x++) {
      if (((x + 0.5 - cx) / rayon) ** 2 + ((y + 0.5 - PIEDS - 0.5) / 2.9) ** 2 <= 1) t.r(x * E, (y - HAUT) * E, E, E, hex);
    }
  }
}

/** La bulle de l'humeur, au-dessus de l'épaule du gardien, et les gouttes de sueur de la panique. */
function bulle(t: Toile, humeur: Humeur, gx: number): void {
  const x = Math.max(1, gx - 5) * E;
  const y = 3 * E;
  const cote = 13 * E;
  t.r(x - E, y, cote + 2 * E, cote, CONTOUR);
  t.r(x, y - E, cote, cote + 2 * E, CONTOUR);
  t.r(x, y, cote, cote, BLANC);
  // La pointe, vers la tête.
  t.r(x + 9 * E, y + cote + E, 4 * E, E, CONTOUR);
  t.r(x + 10 * E, y + cote, 2 * E, E, BLANC);
  t.r(x + 11 * E, y + cote + 2 * E, 2 * E, E, CONTOUR);
  t.motif(SIGNES_DES_HUMEURS[humeur], x + 2 * E + 1, y + 2 * E + 1, E, CONTOUR);
  t.motif(SIGNES_DES_HUMEURS[humeur], x + 2 * E, y + 2 * E, E, humeur === "confiant" ? OR_SOMBRE : FICHES_DES_HUMEURS[humeur].couleur === "#AEB7CF" ? "#5B8FD9" : assombrir(FICHES_DES_HUMEURS[humeur].couleur));
  if (humeur === "panique") {
    for (const [dx, dy, haut] of [[39, 9, 4], [42, 17, 3], [37, 2, 3]] as const) {
      t.r((gx + dx) * E - 1, dy * E - 1, 2 * E + 2, E * haut + 2, CONTOUR);
      t.r((gx + dx) * E, dy * E, 2 * E, E * haut, "#8FD3FF");
      t.r((gx + dx) * E, dy * E, E, E, BLANC);
    }
  }
}

/** Une couleur d'humeur, plus soutenue, pour se lire sur le blanc de la bulle. */
function assombrir(hex: string): string {
  const [r, g, b] = hexa(hex);
  return `#${[r, g, b].map((v) => Math.round(v * 0.72).toString(16).padStart(2, "0")).join("")}`;
}

/** Une plaque de texte posée sur la scène. */
function plaque(t: Toile, x: number, y: number, morceaux: readonly { texte: string; couleur: string }[], fond = NUIT): void {
  const u = 2;
  const largeur = morceaux.reduce((n, m) => n + largeurDuTexte(PETITE, m.texte, u) + 2 * u, 0) + 14;
  t.r(x, y, largeur, 22, fond, 0.9);
  t.r(x, y, 4, 22, OR);
  let cx = x + 11;
  for (const m of morceaux) cx = ecrire(t, PETITE, cx, y + 8, m.texte, m.couleur, u) + 2 * u;
}

export interface Tableau {
  /** Le mot secret : seules ses lettres données s'écrivent. */
  mot: string;
  longueurDite: boolean;
  /** Les places des lettres données, la première valant 1. */
  lettres: readonly number[];
  indices: readonly string[];
}

/**
 * Les cases du mot, telles que le salon les voit : une lettre donnée, « _ » pour une case vide. Sans longueur dite, un seul
 * « ? » finit la liste : ce n'est pas une case, le dessin y écrit « longueur inconnue ». Jusqu'au 17 novembre 2026, trois
 * cases « ? » se lisaient comme un mot de trois lettres (le mot était « montagne »).
 */
export function casesDuMot(tableau: Tableau): string[] {
  const lettres = new Set(tableau.lettres.filter((n) => Number.isInteger(n) && n >= 1 && n <= tableau.mot.length));
  if (tableau.longueurDite) return [...tableau.mot].map((lettre, i) => (lettres.has(i + 1) ? lettre : "_"));
  // La longueur n'est pas dite : les cases s'arrêtent à la dernière lettre donnée, et le « ? » dit qu'on ne sait pas la suite.
  const derniere = Math.max(0, ...lettres);
  const cases = Array.from({ length: derniere }, (_, i) => (lettres.has(i + 1) ? (tableau.mot[i] ?? "_") : "_"));
  return [...cases, "?"];
}

/** Les indices écrits sous le mot : le nombre de lettres s'il est dit, puis ceux du gardien. */
export function indicesDuTableau(tableau: Tableau): string[] {
  return [...(tableau.longueurDite ? [`${tableau.mot.length} lettres`] : []), ...tableau.indices];
}

export interface DessinDeLEssai {
  gardien: Gardien;
  humeur: Humeur;
  /** La tenue du Gaulois du membre, ou `null` : un Gaulois de départ le remplace. */
  tenue: Tenue | null;
  tableau: Tableau;
  manche: number;
  essai: number;
  /** La vigilance du gardien : de 1 à 4 boucliers. */
  garde: number;
  cagnotte: number;
  soir: Soir | null;
}

const TITRES_DES_SOIRS: Readonly<Record<Soir, string>> = { cervoise: "Soir de cervoise", veillee: "Veillée : essais doublés" };

function poserLaScene(t: Toile, gardien: Gardien, humeur: Humeur, tenue: Tenue | null, moment: Moment, ouvert: boolean): void {
  const decor = decorDe(FICHES_DES_GARDIENS[gardien].lieu, moment);
  t.cases(decor.cases.slice(HAUT * DECOR_L, BAS * DECOR_L), DECOR_L, 0, 0, E);
  const gx = ouvert ? 3 : 8;
  const mx = ouvert ? 73 : 68;
  ombreAuSol(t, gx + 24, 19, decor.ombre);
  ombreAuSol(t, mx + 24, 19, decor.ombre);
  ombreAuSol(t, 62, 22, decor.ombre);
  t.cases(casesDuGaulois(tenueDuGardien(gardien, humeur)), GAULOIS_LARGEUR, gx * E, 0, E);
  t.cases(casesDuGaulois(tenue ?? TENUE_DE_DEPART), GAULOIS_LARGEUR, mx * E, 0, E, true);
  const coffre = casesDuCoffre(ouvert);
  // La lueur de l'or.
  if (ouvert) for (let d = 0; d < 9; d++) t.r((62 - 30 + d * 2) * E, (PIEDS - 46 + d * 2 - HAUT) * E, (60 - d * 4) * E, (40 - d * 3) * E, OR, 0.035);
  t.cases(coffre.cases, coffre.largeur, (62 - coffre.largeur / 2) * E, (PIEDS + 3 - coffre.hauteur - HAUT) * E, E);
  bulle(t, humeur, gx);
  plaque(t, 8 + 15 * E, 8, [
    { texte: FICHES_DES_GARDIENS[gardien].nom, couleur: OR_CLAIR },
    { texte: "·", couleur: GRIS },
    { texte: FICHES_DES_HUMEURS[humeur].mot, couleur: FICHES_DES_HUMEURS[humeur].couleur },
  ]);
}

function fondDuBandeau(t: Toile): number {
  const y = H_SCENE;
  t.r(0, y, L, IMAGE_DU_COFFRE.bandeau, NUIT);
  t.r(0, y, L, 3, OR);
  t.r(0, y + 3, L, 2, OR_SOMBRE);
  return y;
}

/** La cagnotte, calée à droite : la pièce et la somme. */
function cagnotte(t: Toile, droite: number, y: number, texte: string): void {
  const l = largeurDuTexte(PETITE, texte, 2);
  t.cases(casesDuStatere(12), 12, droite - l - 28, y - 7, 2);
  ecrire(t, PETITE, droite - l, y, texte, OR, 2);
}

/** L'image d'un essai : la scène, puis le tableau des indices. */
export function imageDeLEssai(d: DessinDeLEssai): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  poserLaScene(t, d.gardien, d.humeur, d.tenue, d.soir === "cervoise" ? CREPUSCULE : NUIT_DE_LUNE, false);
  if (d.soir) {
    const titre = TITRES_DES_SOIRS[d.soir];
    const l = largeurDuTexte(PETITE, titre, 2) + 22;
    t.r(L - l - 8, 8, l, 22, "#3D1F52", 0.92);
    t.r(L - l - 8, 28, l, 2, OR);
    ecrire(t, PETITE, L - l + 3, 16, titre, OR_CLAIR, 2);
  }
  const y = fondDuBandeau(t);
  // Le mot, en cases.
  let x = 14;
  for (const lettre of casesDuMot(d.tableau)) {
    // La suite inconnue n'a pas de case : des cases se compteraient.
    if (lettre === "?") {
      ecrire(t, PETITE, x + (x > 14 ? 4 : 0), y + 19, x > 14 ? "... longueur inconnue" : "Longueur inconnue", "#8E9BC9", 2);
      break;
    }
    t.r(x, y + 10, 22, 28, CASE);
    t.r(x, y + 10, 22, 2, CASE_BORD);
    t.r(x, y + 36, 22, 2, lettre === "_" ? "#3A4A86" : OR);
    if (lettre !== "_") ecrire(t, GRANDE, x + 6, y + 17, lettre, BLANC, 2);
    x += 25;
  }
  // Les indices, en pastilles : ceux qui ne tiennent plus ne s'écrivent pas.
  let ix = 14;
  for (const indice of indicesDuTableau(d.tableau)) {
    const texte = raccourci(PETITE, indice, 2, 230);
    const l = largeurDuTexte(PETITE, texte, 2) + 16;
    if (ix + l > L - 150) break;
    t.r(ix, y + 43, l, 17, "#1B2A5C");
    t.r(ix, y + 43, 4, 17, OR);
    ecrire(t, PETITE, ix + 10, y + 47, texte, OR_CLAIR, 2);
    ix += l + 6;
  }
  // À droite : la manche et l'essai, la garde, la cagnotte.
  const droite = L - 14;
  const ligne = `Manche ${d.manche} · essai ${d.essai}`;
  ecrire(t, PETITE, droite - largeurDuTexte(PETITE, ligne, 2), y + 11, ligne, GRIS, 2);
  const garde = Math.max(1, Math.min(4, Math.round(d.garde)));
  const gl = largeurDuTexte(PETITE, "Garde", 2) + 8 + 4 * 15;
  ecrire(t, PETITE, droite - gl, y + 29, "Garde", GRIS, 2);
  for (let i = 0; i < 4; i++) {
    const px = droite - 4 * 15 + i * 15 + 3;
    t.r(px, y + 25, 12, 14, i < garde ? OR : "#1B2A5C");
    t.r(px, y + 25, 12, 2, i < garde ? OR_CLAIR : CASE_BORD);
    t.r(px, y + 37, 2, 2, NUIT);
    t.r(px + 10, y + 37, 2, 2, NUIT);
  }
  // La cagnotte, et par combien le gagnant la verra multipliée : la garde plus un (FOIS_PAR_GARDE de coffre.ts), en mots.
  cagnotte(t, droite, y + 49, `${Math.max(0, Math.round(d.cagnotte))} fois ${garde + 1}`);
  return t.image();
}

export interface DessinDeLaVictoire {
  gardien: Gardien;
  tenue: Tenue | null;
  mot: string;
  manche: number;
  essai: number;
  /** Les statères gagnés : 0 si la cagnotte était vide, ou n'a pas été versée. */
  gain: number;
}

/** L'image d'une victoire : le coffre ouvert sur son or, le gardien vaincu, le mot en lettres d'or. */
export function imageDeLaVictoire(d: DessinDeLaVictoire): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  poserLaScene(t, d.gardien, "vaincu", d.tenue, NUIT_DE_LUNE, true);
  const y = fondDuBandeau(t);
  let x = 14;
  for (const lettre of d.mot.slice(0, 10)) {
    t.r(x, y + 12, 30, 42, OR);
    t.r(x, y + 12, 30, 3, OR_CLAIR);
    t.r(x, y + 51, 30, 3, OR_SOMBRE);
    ecrire(t, GRANDE, x + 8, y + 22, lettre, "#2A1608", 3);
    x += 33;
  }
  const droite = L - 14;
  const titre = "Le coffre a cédé";
  ecrire(t, GRANDE, droite - largeurDuTexte(GRANDE, titre, 2), y + 11, titre, OR, 2, OR_SOMBRE);
  const ligne = `Manche ${d.manche} · essai ${d.essai}`;
  ecrire(t, PETITE, droite - largeurDuTexte(PETITE, ligne, 2), y + 32, ligne, GRIS, 2);
  if (d.gain > 0) cagnotte(t, droite, y + 50, `+ ${Math.round(d.gain)}`);
  return t.image();
}

export interface Perceur {
  nom: string;
  coffres: number;
  tenue: Tenue | null;
  /** La bannière que ce membre montre derrière son Gaulois (son identifiant), ou rien : le décor de la place reste alors. */
  banniere?: string | null;
  /** Les statères gagnés au coffre dans la semaine (cagnottes et primes), ou rien si le serveur ne les dit pas. */
  stateres?: number | null;
}

/** Un nombre de statères, les milliers séparés d'une espace : « 12 400 ». */
export const enMilliers = (n: number): string => {
  const chiffres = String(Math.max(0, Math.round(n)));
  let dit = "";
  for (let i = 0; i < chiffres.length; i++) dit += (i > 0 && (chiffres.length - i) % 3 === 0 ? " " : "") + chiffres[i];
  return dit;
};

/** L'échelle des Gaulois du podium, et leurs marches : le milieu de chacune et le haut de son Gaulois, en pixels. */
export const ECHELLE_DU_PODIUM = 4;
export const MARCHES_DU_PODIUM = [
  { cx: 310, haut: 6, mot: "1er" },
  { cx: 112, haut: 22, mot: "2e" },
  { cx: 508, haut: 31, mot: "3e" },
] as const;

/**
 * Le fond du podium se partage en trois (demande du pilote, 16 novembre 2026) : chaque tiers montre la bannière du membre
 * posé devant. Ses bords, en pixels, dans l'ordre des marches : le premier au milieu, le deuxième à gauche, le troisième à
 * droite.
 */
export const TIERS_DU_PODIUM = [
  { gauche: 207, droite: 413 },
  { gauche: 0, droite: 207 },
  { gauche: 413, droite: 620 },
] as const;

/**
 * Le tiers d'une bannière posé derrière une marche : le milieu de la bannière, là où elle est faite pour encadrer un
 * Gaulois, sur toute la hauteur de la scène. Une bannière inconnue ne pose rien.
 */
function poserLeTiers(t: Toile, banniere: string | null | undefined, rang: number): void {
  const dessin = dessinDeLaBanniere(banniere);
  const tiers = TIERS_DU_PODIUM[rang];
  if (!dessin || !tiers) return;
  const colonnes = Math.ceil((tiers.droite - tiers.gauche) / E);
  const depart = Math.floor((DECOR_L - colonnes) / 2);
  for (let rangee = HAUT; rangee < BAS; rangee++) {
    for (let i = 0; i < colonnes; i++) {
      const couleur = dessin.cases[rangee * DECOR_L + depart + i];
      const x = tiers.gauche + i * E;
      if (couleur) t.r(x, (rangee - HAUT) * E, Math.min(E, tiers.droite - x), E, couleur);
    }
  }
}

/** L'or, l'argent et le bronze des trois marches, et leur pierre. */
export const METAUX_DU_PODIUM = [
  { fond: "#FFC857", clair: "#FFE9A8", sombre: "#B8862C" },
  { fond: "#C3C9D6", clair: "#EEF1F7", sombre: "#8D95A6" },
  { fond: "#D08A4A", clair: "#F3BD86", sombre: "#96592A" },
] as const;
const PIERRE = { fond: "#4B5468", sombre: "#363D4E", claire: "#7C869C", vive: "#A5AEC2" } as const;

/**
 * L'image du podium de la semaine : trois membres au plus, le premier au milieu, chacun sur sa marche de pierre, avec le
 * médaillon de sa place, son nom et ses coffres. `semaine` : « semaine du 16 novembre », si le serveur l'a dite.
 */
export function imageDuPalmares(perceurs: readonly Perceur[], semaine: string | null = null): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  const decor = decorDe("place", PLEIN_JOUR);
  t.cases(decor.cases.slice(HAUT * DECOR_L, BAS * DECOR_L), DECOR_L, 0, 0, E);
  // Les bannières d'abord, chacune dans son tiers, puis un filet d'or entre deux tiers dont l'un au moins en porte une.
  const portees = perceurs.slice(0, 3).map((perceur, rang) => {
    poserLeTiers(t, perceur.banniere, rang);
    return dessinDeLaBanniere(perceur.banniere) !== null;
  });
  if (portees[0] || portees[1]) {
    t.r(TIERS_DU_PODIUM[0].gauche - 2, 0, 4, H_SCENE, CONTOUR);
    t.r(TIERS_DU_PODIUM[0].gauche - 1, 0, 2, H_SCENE, OR);
  }
  if (portees[0] || portees[2]) {
    t.r(TIERS_DU_PODIUM[0].droite - 2, 0, 4, H_SCENE, CONTOUR);
    t.r(TIERS_DU_PODIUM[0].droite - 1, 0, 2, H_SCENE, OR);
  }
  // Les Gaulois du podium sont dessinés un peu plus petits que ceux d'une scène (échelle 4) : sur sa marche, le premier
  // tient tout entier dans l'image, même coiffé d'un grand chapeau ou en Gaulois unique. Le 16 novembre 2026, à l'échelle
  // de la scène, la tête du premier sortait de l'image.
  perceurs.slice(0, 3).forEach((perceur, rang) => {
    const { cx, haut } = MARCHES_DU_PODIUM[rang] ?? MARCHES_DU_PODIUM[0];
    const metal = METAUX_DU_PODIUM[rang] ?? METAUX_DU_PODIUM[0];
    const y = haut + (GAULOIS_HAUTEUR - 1) * ECHELLE_DU_PODIUM;
    // La marche : de la pierre taillée, coiffée d'une dalle claire et d'un filet du métal de la place.
    t.r(cx - 82 - 3, y - 3, 164 + 6, H_SCENE - y + 3, CONTOUR);
    t.r(cx - 82, y, 164, H_SCENE - y, PIERRE.fond);
    for (let j = y + 14; j < H_SCENE; j += 14) {
      t.r(cx - 82, j, 164, 2, PIERRE.sombre);
      const decale = ((j - y) / 14) % 2 === 0 ? 0 : 27;
      for (let i = cx - 82 + 27 + decale; i < cx + 82; i += 54) t.r(i, j - 12, 2, 12, PIERRE.sombre);
    }
    t.r(cx - 82, y, 164, 6, PIERRE.claire);
    t.r(cx - 82, y, 164, 2, PIERRE.vive);
    t.r(cx - 82, y + 6, 164, 3, metal.fond);
    t.r(cx - 82, y + 9, 164, 1, metal.sombre);
    t.cases(casesDuGaulois(perceur.tenue ?? TENUE_DE_DEPART), GAULOIS_LARGEUR, cx - (GAULOIS_LARGEUR * ECHELLE_DU_PODIUM) / 2, haut, ECHELLE_DU_PODIUM);
    // Le médaillon de la place, puis le nom, les coffres ouverts et, s'ils sont connus, les statères gagnés (la pièce et
    // la somme, demande du pilote, 17 novembre 2026) sur une plaque sombre.
    const gagnes = typeof perceur.stateres === "number" && perceur.stateres > 0 ? perceur.stateres : 0;
    const mx = cx - 76;
    const my = y + 12;
    t.r(mx + 3, my - 1, 20, 28, CONTOUR);
    t.r(mx - 1, my + 3, 28, 20, CONTOUR);
    t.r(mx + 3, my, 20, 26, metal.fond);
    t.r(mx, my + 3, 26, 20, metal.fond);
    t.r(mx + 3, my + 3, 20, 20, NUIT);
    t.r(mx + 3, my, 20, 1, metal.clair);
    ecrire(t, GRANDE, mx + 8, my + 6, String(rang + 1), metal.clair, 2);
    t.r(cx - 44, y + 12, 122, gagnes > 0 ? 39 : 26, NUIT, 0.82);
    ecrire(t, PETITE, cx - 38, y + 15, raccourci(PETITE, perceur.nom, 2, 110), BLANC, 2);
    ecrire(t, PETITE, cx - 38, y + 27, `${perceur.coffres} coffre${perceur.coffres > 1 ? "s" : ""}`, metal.clair, 2);
    if (gagnes > 0) {
      t.cases(casesDuStatere(12), 12, cx - 38, y + 38, 1);
      ecrire(t, PETITE, cx - 22, y + 39, `+ ${enMilliers(gagnes)}`, OR, 2);
    }
  });
  // Trois éclats d'or autour du premier.
  if (perceurs.length > 0) {
    const { cx, haut } = MARCHES_DU_PODIUM[0];
    for (const [dx, dy] of [[-92, 34], [88, 62], [80, 14]] as const) {
      t.r(cx + dx - 1, haut + dy - 7, 6, 18, CONTOUR);
      t.r(cx + dx - 7, haut + dy - 1, 18, 6, CONTOUR);
      t.r(cx + dx, haut + dy - 6, 4, 16, OR_CLAIR);
      t.r(cx + dx - 6, haut + dy, 16, 4, OR_CLAIR);
      t.r(cx + dx, haut + dy, 4, 4, BLANC);
    }
  }
  const y = fondDuBandeau(t);
  centrer(t, GRANDE, L / 2, y + 13, "Les perceurs de coffres", OR, 3, OR_SOMBRE);
  centrer(t, PETITE, L / 2, y + 45, semaine ? `Les plus rusés du village · ${semaine}` : "Les plus rusés du village, cette semaine", BLANC, 2);
  return t.image();
}

export const pngDeLEssai = (d: DessinDeLEssai): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDeLEssai(d));
export const pngDeLaVictoire = (d: DessinDeLaVictoire): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDeLaVictoire(d));
export const pngDuPalmares = (perceurs: readonly Perceur[], semaine: string | null = null): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDuPalmares(perceurs, semaine));

/* ---------- Les images dites en mots, pour qui ne les voit pas ---------- */

const motEnMots = (tableau: Tableau): string => {
  const cases = casesDuMot(tableau);
  const connues = cases.filter((c) => c !== "_" && c !== "?").length;
  if (!tableau.longueurDite && connues === 0) return "Rien n'est encore connu du mot.";
  const dit = cases.map((c) => (c === "_" || c === "?" ? "…" : c.toUpperCase())).join(" ");
  return `Le mot : ${dit}.${tableau.longueurDite ? "" : " Sa longueur n'est pas connue."}`;
};

/** La description d'une image d'essai, lue par les lecteurs d'écran. */
export function decrireLEssai(d: DessinDeLEssai): string {
  const indices = indicesDuTableau(d.tableau);
  return [
    `${FICHES_DES_GARDIENS[d.gardien].nom}, ${FICHES_DES_HUMEURS[d.humeur].mot}, derrière son coffre fermé, face au Gaulois du membre.`,
    motEnMots(d.tableau),
    indices.length > 0 ? `Indices : ${indices.join(", ")}.` : "",
    `Manche ${d.manche}, essai ${d.essai}. Garde du gardien : ${Math.max(1, Math.min(4, Math.round(d.garde)))} sur 4. Cagnotte : ${Math.max(0, Math.round(d.cagnotte))} statères, multipliée par ${Math.max(1, Math.min(4, Math.round(d.garde))) + 1} pour qui ouvre le coffre.`,
    d.soir ? `${TITRES_DES_SOIRS[d.soir]}.` : "",
  ]
    .filter((phrase) => phrase !== "")
    .join(" ")
    .slice(0, 1024);
}

/** La description d'une image de victoire. */
export const decrireLaVictoire = (d: DessinDeLaVictoire): string =>
  `Le coffre est ouvert, plein d'or. ${FICHES_DES_GARDIENS[d.gardien].nom} est vaincu. Le mot était « ${d.mot} », trouvé à l'essai ${d.essai} de la manche ${d.manche}.${d.gain > 0 ? ` La cagnotte de ${Math.round(d.gain)} statères est gagnée.` : ""}`;

/** La description du podium. */
export const decrireLePalmares = (perceurs: readonly Perceur[]): string =>
  `Les perceurs de coffres de la semaine : ${perceurs
    .slice(0, 3)
    .map((p, i) => {
      const banniere = banniereParId(p.banniere);
      const gagnes = typeof p.stateres === "number" && p.stateres > 0 ? `, ${enMilliers(p.stateres)} statère${p.stateres > 1 ? "s" : ""} gagné${p.stateres > 1 ? "s" : ""}` : "";
      return `${i + 1}. ${p.nom}, ${p.coffres} coffre${p.coffres > 1 ? "s" : ""}${gagnes}${banniere ? `, devant sa bannière « ${banniere.nom} »` : ""}`;
    })
    .join(" ; ")}.`.slice(0, 1024);

/* ---------- Les panneaux : le tableau entier, l'aide, l'alerte de cagnotte, le bilan d'une manche ---------- */

/** Les boucliers de la garde, calés à droite : de 1 à 4 pleins. */
function boucliers(t: Toile, droite: number, y: number, garde: number): void {
  const pleins = Math.max(1, Math.min(4, Math.round(garde)));
  const gl = largeurDuTexte(PETITE, "Garde", 2) + 8 + 4 * 15;
  ecrire(t, PETITE, droite - gl, y + 4, "Garde", GRIS, 2);
  for (let i = 0; i < 4; i++) {
    const px = droite - 4 * 15 + i * 15 + 3;
    t.r(px, y, 12, 14, i < pleins ? OR : "#1B2A5C");
    t.r(px, y, 12, 2, i < pleins ? OR_CLAIR : CASE_BORD);
    t.r(px, y + 12, 2, 2, NUIT);
    t.r(px + 10, y + 12, 2, 2, NUIT);
  }
}

/** Le fond d'un panneau : la nuit, un filet d'or sous l'en-tête et un autre au-dessus du pied. */
function fondDuPanneau(t: Toile, enTete: number, pied: number): void {
  t.r(0, 0, L, IMAGE_DU_COFFRE.hauteur, NUIT);
  t.r(0, 0, L, enTete, "#0D1740");
  t.r(0, enTete, L, 3, OR);
  t.r(0, enTete + 3, L, 2, OR_SOMBRE);
  t.r(0, pied, L, 2, OR_SOMBRE);
}

/** Combien d'indices du gardien une manche garde, et le tableau entier montre : le serveur s'arrête au même nombre. */
export const INDICES_GARDES = 12;

export interface DessinDuTableau {
  gardien: Gardien;
  tableau: Tableau;
  manche: number;
  /** Les essais déjà répondus dans la manche. */
  essais: number;
  garde: number;
  cagnotte: number;
  /** Le prix de la prochaine lettre à vendre, ou `null` : il n'y en a plus dans cette manche. */
  prixLettre: number | null;
  /** La lettre qu'un membre vient d'acheter : son nom, la place de la lettre, son prix. */
  achat?: { nom: string; place: number; prix: number } | null;
}

/**
 * Le tableau entier de la manche (demande du pilote, 17 novembre 2026 : l'image d'un essai ne montre que les indices qui
 * tiennent sur une ligne) : le mot en grandes cases, puis tous les indices gardés, sur deux colonnes.
 */
export function imageDuTableau(d: DessinDuTableau): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  fondDuPanneau(t, 132, 340);
  t.cases(casesDuGaulois(tenueDuGardien(d.gardien, d.achat ? "flatte" : "mefiant")), GAULOIS_LARGEUR, 8, 6, 2);
  ecrire(t, GRANDE, 118, 12, "Le tableau", OR, 3, OR_SOMBRE);
  ecrire(t, PETITE, 118, 44, `${FICHES_DES_GARDIENS[d.gardien].nom} · manche ${d.manche} · ${d.essais} essai${d.essais > 1 ? "s" : ""}`, GRIS, 2);
  const droite = L - 14;
  const garde = Math.max(1, Math.min(4, Math.round(d.garde)));
  cagnotte(t, droite, 20, `${enMilliers(d.cagnotte)} fois ${garde + 1}`);
  boucliers(t, droite, 40, garde);
  // Le nom seul cède la place : la lettre et son prix se lisent toujours.
  if (d.achat) ecrire(t, PETITE, 118, 62, `${raccourci(PETITE, d.achat.nom, 2, 170)} achète la lettre ${d.achat.place} : ${enMilliers(d.achat.prix)} statères`, OR_CLAIR, 2);
  // Le mot, en grandes cases : une lettre donnée sur de l'or, une case vide sinon.
  let x = 118;
  for (const lettre of casesDuMot(d.tableau)) {
    if (lettre === "?") {
      ecrire(t, PETITE, x + (x > 118 ? 6 : 0), 102, x > 118 ? "... longueur inconnue" : "Longueur inconnue", "#8E9BC9", 2);
      break;
    }
    const connue = lettre !== "_";
    t.r(x, 84, 30, 42, connue ? OR : CASE);
    t.r(x, 84, 30, 3, connue ? OR_CLAIR : CASE_BORD);
    t.r(x, 123, 30, 3, connue ? OR_SOMBRE : "#3A4A86");
    if (connue) ecrire(t, GRANDE, x + 8, 94, lettre, "#2A1608", 3);
    x += 33;
  }
  // Tous les indices, en pastilles qui se suivent : en grand si tout tient, sinon en plus petit. Aucun n'est raccourci.
  const indices = indicesDuTableau(d.tableau).slice(0, INDICES_GARDES + 1);
  if (indices.length === 0) ecrire(t, PETITE, 14, 152, "Le gardien n'a encore rien dit.", GRIS, 3);
  const poser = (u: number): { x: number; y: number; l: number; texte: string }[] | null => {
    const places: { x: number; y: number; l: number; texte: string }[] = [];
    let px = 14;
    let py = 144;
    for (const texte of indices) {
      const l = largeurDuTexte(PETITE, texte, u) + 8 * u;
      if (px > 14 && px + l > L - 14) {
        px = 14;
        py += 8 * u + 3;
      }
      places.push({ x: px, y: py, l, texte });
      px += l + 3 * u;
    }
    return py + 8 * u + 1 <= 336 ? places : u > 2 ? null : places.filter((p) => p.y + 8 * u + 1 <= 336);
  };
  // À la petite taille, ce qui ne tiendrait toujours pas reste dans la description en mots.
  const u = poser(3) ? 3 : 2;
  for (const p of poser(u) ?? []) {
    t.r(p.x, p.y, p.l, 8 * u + 1, "#1B2A5C");
    t.r(p.x, p.y, 2 * u, 8 * u + 1, OR);
    ecrire(t, PETITE, p.x + 5 * u, p.y + 2 * u, p.texte, OR_CLAIR, u);
  }
  ecrire(t, PETITE, 14, 356, d.prixLettre !== null ? `/indice : une lettre, ${enMilliers(d.prixLettre)} statères` : "Plus de lettre à vendre dans cette manche", d.prixLettre !== null ? OR_CLAIR : GRIS, 3);
  return t.image();
}

/** Le tableau entier, dit en mots. */
export function decrireLeTableau(d: DessinDuTableau): string {
  const indices = indicesDuTableau(d.tableau);
  return [
    d.achat ? `${d.achat.nom} achète la lettre ${d.achat.place} du mot pour ${enMilliers(d.achat.prix)} statères, versés dans la cagnotte.` : "",
    `Le tableau de la manche ${d.manche}, gardée par ${FICHES_DES_GARDIENS[d.gardien].nom.toLowerCase()}, après ${d.essais} essai${d.essais > 1 ? "s" : ""}.`,
    motEnMots(d.tableau),
    indices.length > 0 ? `Indices : ${indices.join(", ")}.` : "Aucun indice pour l'instant.",
    `Cagnotte : ${enMilliers(d.cagnotte)} statères.`,
    d.prixLettre !== null ? `La prochaine lettre coûte ${enMilliers(d.prixLettre)} statères, avec /indice.` : "Plus de lettre à vendre dans cette manche.",
  ]
    .filter((phrase) => phrase !== "")
    .join(" ")
    .slice(0, 1024);
}

export interface DessinDeLAide {
  /** La mise d'un essai, et les prix des lettres à vendre, en statères. */
  mise: number;
  prixDesLettres: readonly number[];
  /** Les essais par membre et par jour, si le serveur les a dits. */
  essais: number | null;
}

/** Ce que l'aide écrit : les règles, puis chaque commande et ce qu'elle fait. Les mêmes lignes servent à l'image et à sa description. */
export function lignesDeLAide(d: DessinDeLAide): { regles: string[]; commandes: { nom: string; role: string }[] } {
  return {
    regles: [
      "Un gardien cache un mot secret.",
      "Faites-le-lui dire, ou devinez-le.",
      `Chaque essai : ${d.mise} statères dans la cagnotte.`,
      "Le coffre ouvert, elle est à vous :",
      "fois 2 à fois 5, selon la garde du gardien.",
      ...(d.essais !== null ? [`${d.essais} essais par jour pour chacun.`] : []),
      "Vendredi soir : le gardien se méfie moins.",
      "Dimanche soir : essais doublés.",
    ],
    commandes: [
      { nom: "/coffre", role: "Parler au gardien" },
      { nom: "/indices", role: "Tout le tableau de la manche" },
      { nom: "/indice", role: `Une lettre : ${d.prixDesLettres.map(enMilliers).join(", ")} statères` },
      { nom: "/perceurs", role: "Le podium de la semaine" },
      { nom: "/help coffre", role: "Cette aide" },
    ],
  };
}

/** L'aide du jeu, en image (demande du pilote, 17 novembre 2026) : comment on joue, puis les commandes. */
export function imageDeLAide(d: DessinDeLAide): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  fondDuPanneau(t, 46, 400);
  const coffre = casesDuCoffre(false);
  t.cases(coffre.cases, coffre.largeur, 14, 9, 1);
  ecrire(t, GRANDE, 64, 12, "Le coffre du druide", OR, 3, OR_SOMBRE);
  const { regles, commandes } = lignesDeLAide(d);
  regles.forEach((ligne, i) => ecrire(t, PETITE, 14, 68 + i * 24, raccourci(PETITE, ligne, 3, L - 28), BLANC, 3));
  const y = 68 + regles.length * 24 + 12;
  t.r(14, y - 9, L - 28, 2, OR_SOMBRE);
  commandes.forEach((commande, i) => {
    const cy = y + 4 + i * 25;
    t.r(14, cy - 4, 156, 23, "#1B2A5C");
    t.r(14, cy - 4, 4, 23, OR);
    ecrire(t, PETITE, 24, cy, commande.nom, OR_CLAIR, 3);
    ecrire(t, PETITE, 180, cy, raccourci(PETITE, commande.role, 3, L - 194), BLANC, 3);
  });
  return t.image();
}

/** L'aide, dite en mots. */
export function decrireLAide(d: DessinDeLAide): string {
  const { regles, commandes } = lignesDeLAide(d);
  return `Le coffre du druide, comment jouer. ${regles.join(" ")} Les commandes : ${commandes.map((c) => `${c.nom}, ${c.role.toLowerCase()}`).join(" ; ")}. Les statères viennent des points rapportés au clan.`.slice(0, 1024);
}

export interface DessinDeLAlerte {
  gardien: Gardien;
  /** La tenue du membre dont la mise ou l'achat vient de faire passer le seuil, ou `null`. */
  tenue: Tenue | null;
  /** Le seuil passé, et la cagnotte du moment, en statères. */
  seuil: number;
  cagnotte: number;
  garde: number;
}

/** L'alerte de cagnotte : la scène du coffre, et la somme qu'elle vient de passer. */
export function imageDeLAlerte(d: DessinDeLAlerte): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  poserLaScene(t, d.gardien, "confiant", d.tenue, NUIT_DE_LUNE, false);
  const y = fondDuBandeau(t);
  const titre = `La cagnotte passe ${enMilliers(d.seuil)} statères`;
  const l = largeurDuTexte(PETITE, titre, 3);
  t.cases(casesDuStatere(12), 12, Math.round(L / 2 - l / 2) - 32, y + 7, 2);
  ecrire(t, PETITE, Math.round(L / 2 - l / 2), y + 12, titre, OR, 3);
  const garde = Math.max(1, Math.min(4, Math.round(d.garde)));
  centrer(t, PETITE, L / 2, y + 40, `Fois ${garde + 1} pour qui ouvre le coffre`, BLANC, 3);
  return t.image();
}

/** L'alerte, dite en mots. */
export const decrireLAlerte = (d: DessinDeLAlerte): string =>
  `La cagnotte du coffre passe ${enMilliers(d.seuil)} statères : elle est de ${enMilliers(d.cagnotte)} statères, multipliée par ${Math.max(1, Math.min(4, Math.round(d.garde))) + 1} pour qui ouvre le coffre.`;

export interface DessinDuBilan {
  gardien: Gardien;
  mot: string;
  manche: number;
  /** Le nom sous lequel le gagnant a ouvert le coffre. */
  gagnant: string;
  essais: number;
  joueurs: number;
  /** Le membre qui a fait le plus d'essais répondus, s'il est connu. */
  acharne: { nom: string; essais: number } | null;
  lettresAchetees: number;
  /** La durée de la manche, en minutes. */
  minutes: number;
}

/** Une durée en mots : « 12 minutes », « 3 heures 05 », « 2 jours 4 heures ». */
export function dureeEnMots(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "moins d'une minute";
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} heure${h > 1 ? "s" : ""}${m % 60 > 0 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`;
  const j = Math.floor(h / 24);
  return `${j} jour${j > 1 ? "s" : ""}${h % 24 > 0 ? ` ${h % 24} heure${h % 24 > 1 ? "s" : ""}` : ""}`;
}

/** Le bilan d'une manche, posté quand son coffre s'ouvre : trois chiffres, puis qui a ouvert et qui a le plus essayé. */
export function imageDuBilan(d: DessinDuBilan): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  fondDuPanneau(t, 138, 340);
  t.cases(casesDuGaulois(tenueDuGardien(d.gardien, "vaincu")), GAULOIS_LARGEUR, 8, 6, 2);
  ecrire(t, GRANDE, 118, 12, "Le bilan", OR, 3, OR_SOMBRE);
  ecrire(t, PETITE, 118, 44, `Manche ${d.manche} · ${FICHES_DES_GARDIENS[d.gardien].nom} est vaincu`, GRIS, 2);
  let x = 118;
  for (const lettre of d.mot.slice(0, 10)) {
    t.r(x, 70, 30, 42, OR);
    t.r(x, 70, 30, 3, OR_CLAIR);
    t.r(x, 109, 30, 3, OR_SOMBRE);
    ecrire(t, GRANDE, x + 8, 80, lettre, "#2A1608", 3);
    x += 33;
  }
  const cases = [
    { chiffre: enMilliers(d.essais), mot: d.essais > 1 ? "essais" : "essai" },
    { chiffre: enMilliers(d.joueurs), mot: "villageois" },
    { chiffre: enMilliers(d.lettresAchetees), mot: d.lettresAchetees > 1 ? "lettres vendues" : "lettre vendue" },
  ];
  cases.forEach((c, i) => {
    const cx = 14 + i * 200;
    t.r(cx, 156, 192, 84, CASE);
    t.r(cx, 156, 192, 3, CASE_BORD);
    t.r(cx, 237, 192, 3, OR);
    centrer(t, PETITE, cx + 96, 170, c.chiffre, OR, 6);
    centrer(t, PETITE, cx + 96, 214, c.mot, GRIS, 3);
  });
  ecrire(t, PETITE, 14, 262, `Ouvert par ${raccourci(PETITE, d.gagnant, 3, 200)} en ${dureeEnMots(d.minutes)}`, OR_CLAIR, 3);
  if (d.acharne) ecrire(t, PETITE, 14, 296, `Le plus acharné : ${raccourci(PETITE, d.acharne.nom, 3, 200)}, ${d.acharne.essais} essai${d.acharne.essais > 1 ? "s" : ""}`, BLANC, 3);
  ecrire(t, PETITE, 14, 362, "Un nouveau mot est sous clé : /coffre", GRIS, 3);
  return t.image();
}

/** Le bilan, dit en mots. */
export const decrireLeBilan = (d: DessinDuBilan): string =>
  `Bilan de la manche ${d.manche} : le mot « ${d.mot} », gardé par ${FICHES_DES_GARDIENS[d.gardien].nom.toLowerCase()}, a été trouvé par ${d.gagnant} en ${dureeEnMots(d.minutes)}. ${enMilliers(d.essais)} essai${d.essais > 1 ? "s" : ""}, ${enMilliers(d.joueurs)} villageois, ${enMilliers(d.lettresAchetees)} lettre${d.lettresAchetees > 1 ? "s" : ""} achetée${d.lettresAchetees > 1 ? "s" : ""}.${d.acharne ? ` Le plus acharné : ${d.acharne.nom}, ${d.acharne.essais} essai${d.acharne.essais > 1 ? "s" : ""}.` : ""}`.slice(0, 1024);

export const pngDuTableau = (d: DessinDuTableau): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDuTableau(d));
export const pngDeLAide = (d: DessinDeLAide): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDeLAide(d));
export const pngDeLAlerte = (d: DessinDeLAlerte): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDeLAlerte(d));
export const pngDuBilan = (d: DessinDuBilan): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDuBilan(d));
