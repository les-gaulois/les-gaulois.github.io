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

/** Les cases du mot, telles que le salon les voit : une lettre donnée, un « ? » pour une case inconnue. */
export function casesDuMot(tableau: Tableau): string[] {
  const lettres = new Set(tableau.lettres.filter((n) => Number.isInteger(n) && n >= 1 && n <= tableau.mot.length));
  if (tableau.longueurDite) return [...tableau.mot].map((lettre, i) => (lettres.has(i + 1) ? lettre : "_"));
  // La longueur n'est pas dite : les cases s'arrêtent à la dernière lettre donnée, et un « ? » dit qu'il en reste.
  const derniere = Math.max(0, ...lettres);
  const cases = Array.from({ length: derniere }, (_, i) => (lettres.has(i + 1) ? (tableau.mot[i] ?? "_") : "_"));
  return derniere === 0 ? ["?", "?", "?"] : [...cases, "?"];
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
    t.r(x, y + 10, 22, 28, CASE);
    t.r(x, y + 10, 22, 2, CASE_BORD);
    t.r(x, y + 36, 22, 2, lettre === "_" || lettre === "?" ? "#3A4A86" : OR);
    if (lettre !== "_") ecrire(t, GRANDE, x + 6, y + 17, lettre, lettre === "?" ? "#6F7FB8" : BLANC, 2);
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
  cagnotte(t, droite, y + 49, String(Math.max(0, Math.round(d.cagnotte))));
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
  const titre = "Coffre ouvert";
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
}

/** L'échelle des Gaulois du podium, et leurs marches : le milieu de chacune et le haut de son Gaulois, en pixels. */
export const ECHELLE_DU_PODIUM = 4;
export const MARCHES_DU_PODIUM = [
  { cx: 310, haut: 6, mot: "1er" },
  { cx: 112, haut: 32, mot: "2e" },
  { cx: 508, haut: 44, mot: "3e" },
] as const;

/** L'image du podium de la semaine : trois membres au plus, le premier au milieu. */
export function imageDuPalmares(perceurs: readonly Perceur[]): Image {
  const t = new Toile(L, IMAGE_DU_COFFRE.hauteur);
  const decor = decorDe("place", PLEIN_JOUR);
  t.cases(decor.cases.slice(HAUT * DECOR_L, BAS * DECOR_L), DECOR_L, 0, 0, E);
  // Les Gaulois du podium sont dessinés un peu plus petits que ceux d'une scène (échelle 4) : sur sa marche, le premier
  // tient tout entier dans l'image, même coiffé d'un grand chapeau ou en Gaulois unique. Le 16 novembre 2026, à l'échelle
  // de la scène, la tête du premier sortait de l'image.
  perceurs.slice(0, 3).forEach((perceur, rang) => {
    const { cx, haut, mot } = MARCHES_DU_PODIUM[rang] ?? MARCHES_DU_PODIUM[0];
    const y = haut + (GAULOIS_HAUTEUR - 1) * ECHELLE_DU_PODIUM;
    t.r(cx - 78 - 3, y - 3, 156 + 6, H_SCENE - y + 3, CONTOUR);
    t.r(cx - 78, y, 156, H_SCENE - y, CASE);
    t.r(cx - 78, y, 156, 5, OR);
    t.r(cx - 78, y + 5, 156, 2, CASE_BORD);
    t.cases(casesDuGaulois(perceur.tenue ?? TENUE_DE_DEPART), GAULOIS_LARGEUR, cx - (GAULOIS_LARGEUR * ECHELLE_DU_PODIUM) / 2, haut, ECHELLE_DU_PODIUM);
    centrer(t, PETITE, cx, y + 12, `${mot} · ${perceur.coffres} coffre${perceur.coffres > 1 ? "s" : ""}`, rang === 0 ? OR : BLANC, 2);
    centrer(t, PETITE, cx, y + 27, raccourci(PETITE, perceur.nom, 2, 144), OR_CLAIR, 2);
  });
  const y = fondDuBandeau(t);
  centrer(t, GRANDE, L / 2, y + 13, "Les perceurs de coffres", OR, 3, OR_SOMBRE);
  centrer(t, PETITE, L / 2, y + 45, "Le podium de la semaine", BLANC, 2);
  return t.image();
}

export const pngDeLEssai = (d: DessinDeLEssai): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDeLEssai(d));
export const pngDeLaVictoire = (d: DessinDeLaVictoire): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDeLaVictoire(d));
export const pngDuPalmares = (perceurs: readonly Perceur[]): Promise<Uint8Array<ArrayBuffer>> => ecrirePng(imageDuPalmares(perceurs));

/* ---------- Les images dites en mots, pour qui ne les voit pas ---------- */

const motEnMots = (tableau: Tableau): string => {
  const cases = casesDuMot(tableau);
  const connues = cases.filter((c) => c !== "_" && c !== "?").length;
  if (!tableau.longueurDite && connues === 0) return "Rien n'est encore connu du mot.";
  const dit = cases.map((c) => (c === "_" || c === "?" ? "…" : c.toUpperCase())).join(" ");
  return `Le mot : ${dit}.`;
};

/** La description d'une image d'essai, lue par les lecteurs d'écran. */
export function decrireLEssai(d: DessinDeLEssai): string {
  const indices = indicesDuTableau(d.tableau);
  return [
    `${FICHES_DES_GARDIENS[d.gardien].nom}, ${FICHES_DES_HUMEURS[d.humeur].mot}, derrière son coffre fermé, face au Gaulois du membre.`,
    motEnMots(d.tableau),
    indices.length > 0 ? `Indices : ${indices.join(", ")}.` : "",
    `Manche ${d.manche}, essai ${d.essai}. Garde du gardien : ${Math.max(1, Math.min(4, Math.round(d.garde)))} sur 4. Cagnotte : ${Math.max(0, Math.round(d.cagnotte))} statères.`,
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
    .map((p, i) => `${i + 1}. ${p.nom}, ${p.coffres} coffre${p.coffres > 1 ? "s" : ""}`)
    .join(" ; ")}.`.slice(0, 1024);
