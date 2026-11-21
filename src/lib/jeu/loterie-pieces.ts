/**
 * Les pièces dessinées de la page « La loterie » de « Mon Gaulois » (21 novembre 2026, demande du pilote : « améliorer la
 * page la loterie », dessins de Claude Fable 5.2) : la pile de billets, la part de chances en disque, les médailles d'or,
 * d'argent et de bronze, le sablier du compte à rebours, le petit booster de chaque sorte pour dire un lot, et le socle des
 * trois marches du podium. Des planches, sans navigateur ; l'écran les pose par `urlDeLaPlanche`
 * (`src/lib/jeu/dans-la-page.ts`), la toile du tirage par `LoterieToile.ts`.
 *
 * Tout est fixe : rien ne clignote. Chaque pièce se lit sur la page claire comme sur la sombre : un cerne d'encre, et une
 * face claire ou un métal dedans.
 */
import type { SorteDeBooster } from "./boosters-dessins";
import { BILLET_HAUTEUR, BILLET_LARGEUR, MINI_BOOSTER_HAUTEUR, MINI_BOOSTER_LARGEUR, billet, miniBooster } from "./loterie-dessins";
import { PAL } from "./palette";
import { Planche, R, grille, rr } from "./planche";

/* ---------- La pile de billets ---------- */

export const PILE_LARGEUR = 28;
export const PILE_HAUTEUR = 24;

/** Le nombre de billets dessinés pour `n` billets : 1, puis 2 (de 2 à 4), 3 (de 5 à 19), 4 (de 20 à 99), 6 (100 et plus). */
export const billetsDessines = (n: number): number => (n <= 0 ? 0 : n < 2 ? 1 : n < 5 ? 2 : n < 20 ? 3 : n < 100 ? 4 : 6);

/** Le glissement de chaque billet de la pile, du bas vers le haut : une pile posée à la main, pas au cordeau. */
const DE_TRAVERS = [0, 3, -2, 2, -3, 1] as const;

/**
 * La pile de billets : `n` billets en tout, dont on dessine au plus six, empilés un peu de travers, le billet du dessus
 * entier ; zéro, la place d'un billet en pointillés. 28 × 24 cases.
 */
export function pileDeBillets(n: number): Planche {
  const g = new Planche(PILE_LARGEUR, PILE_HAUTEUR);
  const x0 = (PILE_LARGEUR - BILLET_LARGEUR) / 2;
  const bas = PILE_HAUTEUR - 1 - BILLET_HAUTEUR;
  const vus = billetsDessines(Math.floor(n));
  if (vus === 0) {
    const coul = "#7783a8";
    for (let x = 1; x < BILLET_LARGEUR - 1; x++)
      if (x % 3 !== 0) {
        R(g, x0 + x, bas, 1, 1, coul);
        R(g, x0 + x, bas + BILLET_HAUTEUR - 1, 1, 1, coul);
      }
    for (let y = 1; y < BILLET_HAUTEUR - 1; y++)
      if (y % 3 !== 0) {
        R(g, x0, bas + y, 1, 1, coul);
        R(g, x0 + BILLET_LARGEUR - 1, bas + y, 1, 1, coul);
      }
    return g;
  }
  // L'ombre au sol, puis les billets du bas vers le haut : chacun cache presque tout celui d'en dessous.
  R(g, x0 + 1, PILE_HAUTEUR - 1, BILLET_LARGEUR - 2, 1, "rgba(7,11,31,.28)");
  const b = billet();
  for (let i = 0; i < vus; i++) {
    const x = x0 + DE_TRAVERS[i]!;
    const y = bas - i * 2;
    // Les encoches du billet laisseraient voir le dessous de la pile en clair : on les bouche d'encre.
    if (i > 0) R(g, x, y + 4, BILLET_LARGEUR, 2, PAL.k);
    g.drawImage(b, x, y);
  }
  return g;
}

/* ---------- La part de chances ---------- */

export const DISQUE_COTE = 26;

/**
 * La part de chances, en disque : `part` de 0 à 1, remplie en bleu depuis midi dans le sens des aiguilles d'une montre, sur
 * une piste claire cernée d'encre. Le dessin ne ment pas sur les bords : une part au-dessus de zéro montre toujours un
 * quartier visible, une part en dessous de 1 laisse toujours un quartier de piste ; 0 est une piste vide, 1 un disque plein.
 * Le chiffre exact s'écrit à côté. 26 × 26 cases.
 */
export function disqueDeChance(part: number): Planche {
  const g = new Planche(DISQUE_COTE, DISQUE_COTE);
  const c = DISQUE_COTE / 2;
  const p = Number.isFinite(part) ? Math.max(0, Math.min(1, part)) : 0;
  const MIN = 0.06;
  const vue = p <= 0 ? 0 : p >= 1 ? 1 : Math.max(MIN, Math.min(1 - MIN, p));
  for (let y = 0; y < DISQUE_COTE; y++)
    for (let x = 0; x < DISQUE_COTE; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d > 12.45) continue;
      let coul: string;
      if (d > 11.3) coul = PAL.k;
      else if (d > 9.9) coul = dx + dy < 0 ? "#ffffff" : PAL.t;
      else if (d > 8.9) coul = PAL.k;
      else {
        const tour = ((Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
        if (tour < vue) coul = d > 7.4 && dx + dy < 0 ? PAL.c : d > 7.4 && dx + dy > 6 ? PAL.b : PAL.B;
        else coul = d > 7.4 && dx + dy > 6 ? "#c7d3ee" : "#eef2fb";
      }
      R(g, x, y, 1, 1, coul);
    }
  // L'aiguille de midi, le rayon de la fin de la part, et le moyeu.
  if (vue > 0 && vue < 1) {
    for (let r = 0; r < 9; r += 0.5) {
      R(g, Math.floor(c), Math.floor(c - 0.5 - r), 1, 1, PAL.k);
      const a = vue * 2 * Math.PI;
      R(g, Math.floor(c + Math.sin(a) * r), Math.floor(c - Math.cos(a) * r), 1, 1, PAL.k);
    }
  }
  R(g, c - 1, c - 1, 2, 2, PAL.k);
  return g;
}

/* ---------- Les médailles ---------- */

export const MEDAILLE_LARGEUR = 16;
export const MEDAILLE_HAUTEUR = 20;

/** Les teintes d'un métal du podium : l'éclat, la face, l'ombre, le creux de la gravure. */
export interface Metal {
  eclat: string;
  face: string;
  ombre: string;
  creux: string;
}
/** L'or, l'argent et le bronze du podium : les faces sont celles que la toile du tirage employait déjà. */
export const METAUX: Readonly<Record<1 | 2 | 3, Metal>> = {
  1: { eclat: "#fff1a8", face: "#f2b632", ombre: "#a86d0c", creux: "#6e4406" },
  2: { eclat: "#f6f8fd", face: "#c9d1e6", ombre: "#7a88b4", creux: "#3d4763" },
  3: { eclat: "#f8cfa6", face: "#d98a4e", ombre: "#8f4f1f", creux: "#5a2a0a" },
};

/** Les rubans : rouge pour l'or, bleu pour l'argent, vert pour le bronze ; le clair, le corps, l'ombre. */
const RUBANS: Readonly<Record<1 | 2 | 3, readonly [string, string, string]>> = {
  1: [PAL.p, PAL.R, PAL.r],
  2: [PAL.c, PAL.B, PAL.b],
  3: [PAL.h, PAL.G, PAL.g],
};

const CHIFFRES: Readonly<Record<1 | 2 | 3, readonly string[]>> = {
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["##.", "..#", ".#.", "#..", "###"],
  3: ["##.", "..#", ".#.", "..#", "##."],
};

/**
 * La médaille d'une marche du podium : 1 l'or, 2 l'argent, 3 le bronze. Le rang ne se lit pas qu'à la couleur : son chiffre
 * est gravé dans le disque, et le ruban change de forme (deux pans croisés pour l'or, deux pans droits pour l'argent, un seul
 * pour le bronze). 16 × 20 cases.
 */
export function medaille(rang: 1 | 2 | 3): Planche {
  const g = new Planche(MEDAILLE_LARGEUR, MEDAILLE_HAUTEUR);
  const m = METAUX[rang];
  const [clair, corps, sombre] = RUBANS[rang];
  // Le ruban : chaque pan est une bande de 4 cases cernée, qui descend vers le disque.
  const pan = (x0: number, pente: number): void => {
    for (let y = 0; y < 9; y++) {
      const x = x0 + Math.round(y * pente);
      R(g, x - 1, y, 6, 1, PAL.k);
      R(g, x, y, 4, 1, corps);
      R(g, x, y, 1, 1, clair);
      R(g, x + 3, y, 1, 1, sombre);
    }
  };
  if (rang === 1) {
    pan(10, -0.5);
    pan(2, 0.5);
  } else if (rang === 2) {
    pan(3, 0);
    pan(9, 0);
  } else pan(6, 0);
  // Le disque : cerne, tranche sombre, face, éclat en haut à gauche.
  const cx = 8;
  const cy = 13;
  for (let y = 5; y < MEDAILLE_HAUTEUR; y++)
    for (let x = 0; x < MEDAILLE_LARGEUR; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > 7.1) continue;
      R(g, x, y, 1, 1, d > 6 ? PAL.k : d > 4.9 ? (dx + dy < -1 ? m.eclat : dx + dy > 3 ? m.ombre : m.face) : d > 4 ? m.ombre : m.face);
    }
  // Le chiffre, gravé : son creux, et une lumière d'une case dessous.
  const gravure = (dx: number, dy: number, coul: string): void =>
    CHIFFRES[rang].forEach((ligne, y) => {
      for (let x = 0; x < ligne.length; x++) if (ligne[x] === "#") R(g, 7 + x + dx, 11 + y + dy, 1, 1, coul);
    });
  gravure(0, 1, m.eclat);
  gravure(0, 0, m.creux);
  return g;
}

/* ---------- Le sablier ---------- */

export const SABLIER_COTE = 16;

const SABLIER = [
  "................",
  "..kkkkkkkkkkkk..",
  "..kYyyyyyyyyOk..",
  "..kkkkkkkkkkkk..",
  "...kwccccccck...",
  "....kwsssssk....",
  ".....kssssk.....",
  "......kssk......",
  "......kcsk......",
  ".....kccsck.....",
  "....kwcsssck....",
  "...kwsssssssk...",
  "..kkkkkkkkkkkk..",
  "..kYyyyyyyyyOk..",
  "..kkkkkkkkkkkk..",
  "................",
];

/** L'icône du compte à rebours : un sablier aux deux montures d'or, le sable qui coule. 16 × 16 cases. */
export function sablier(): Planche {
  return grille(SABLIER, { k: PAL.k, Y: PAL.Y, y: PAL.y, O: PAL.O, w: "#ffffff", c: "#dbe7ff", s: PAL.j });
}

/* ---------- Les petits boosters des lots ---------- */

/** La robe d'un petit sachet, reprise du grand paquet de sa sorte (`ROBES` de `boosters-dessins.ts`). */
interface PetiteRobe {
  haut: string;
  corps: string;
  trame: string;
  fond: string;
  clair: string;
  bande: readonly [string, string];
  /** L'emblème, en 9 cases de large au plus, et ses couleurs en plus de la palette. */
  embleme: readonly string[];
  pal?: Readonly<Record<string, string>>;
}

const PETITES_ROBES: Readonly<Record<Exclude<SorteDeBooster, "loterie">, PetiteRobe>> = {
  // Le torque d'or.
  surprise: {
    haut: "#3f7dff", corps: "#2f6bff", trame: "#1f55e0", fond: "#07257a", clair: "#cfe2ff", bande: ["#ff5a6a", "#e0263a"],
    embleme: [".kk...kk.", "kYyk.kyOk", "kyOk.kyOk", "kyOk.kyOk", "kyOkkkyOk", ".kyyyyOk.", "..kOOOk..", "...kkk..."],
  },
  // La pièce frappée.
  stateres: {
    haut: "#23a352", corps: "#1a8f45", trame: "#137538", fond: "#063a19", clair: "#c9fbcf", bande: ["#fffbe6", "#f6f1e3"],
    embleme: ["..kkkkk..", ".kYYyyOk.", "kYyyynyOk", "kYyynnyOk", "kynnnnyOk", "kyynynyOk", "kyOyyyOOk", ".kOOOOOk.", "..kkkkk.."],
  },
  // L'empreinte, dans sa fenêtre.
  familiers: {
    haut: "#1298a6", corps: "#0e8795", trame: "#0a6f7d", fond: "#043842", clair: "#d2f9f8", bande: ["#ffb866", "#f5760f"],
    embleme: [".kkkkkkk.", "kyyyyyyOk", "kyfwfwfOk", "kywfffwOk", "kyffwffOk", "kyfwwwfOk", "kyffwffOk", "kOOOOOOOk", ".kkkkkkk."],
    pal: { f: "#06323a", w: "#fff4dc" },
  },
  // L'étendard à queue d'aronde, pendu à sa hampe.
  bannieres: {
    haut: "#7f52f2", corps: "#6c41e2", trame: "#5631c8", fond: "#2a1278", clair: "#e2d6ff", bande: ["#ff9ac6", "#e8408f"],
    embleme: ["kkkkkkkkk", "kYyyyyyOk", "kkkkkkkkk", ".kyfffOk.", ".kyfpfOk.", ".kyfffOk.", ".kyOkyOk.", ".kkk.kkk."],
    pal: { f: "#1d0f55", p: "#ff9ac6" },
  },
  // La bête devant la lune.
  modeles: {
    haut: "#343e68", corps: "#283158", trame: "#1d2546", fond: "#080c1c", clair: "#aab4d2", bande: ["#eef2fc", "#aab3cf"],
    embleme: [".kkkkkkk.", "ktttttttk", "ktkwwwktk", "ktkkwkktk", "ktkkkkktk", "ktkjkjktk", "kttkkkttk", "kSSSSSSSk", ".kkkkkkk."],
    pal: { w: "#f2f5fc", t: "#aab3cf" },
  },
};

/**
 * Le petit booster d'une sorte, pour dire un lot (« un booster surprise ») : le sachet du petit booster de loterie, à la robe,
 * à la bande et à l'emblème du grand paquet de sa sorte. La taille de `miniBooster`, 15 × 22 cases.
 */
export function petitBooster(sorte: SorteDeBooster): Planche {
  if (sorte === "loterie") return miniBooster("ferme");
  const t = PETITES_ROBES[sorte];
  const g = new Planche(MINI_BOOSTER_LARGEUR, MINI_BOOSTER_HAUTEUR);
  // Les deux sertis d'argent, dentelés.
  for (let x = 1; x < 14; x++) {
    const d = x % 2;
    R(g, x, d, 1, 3 - d, PAL.k);
    R(g, x, 19, 1, 3 - d, PAL.k);
    if (x > 1 && x < 13) {
      R(g, x, d + 1, 1, 2 - d, "#eef2fc");
      R(g, x, 19, 1, 2 - d, "#9aa6c8");
    }
  }
  R(g, 1, 3, 13, 16, PAL.k);
  for (let y = 4; y < 18; y++)
    for (let x = 2; x < 13; x++) {
      const d = x + (y - 4) * 0.7;
      let coul = y > 14 && (x + y) % 2 ? t.trame : y < 7 ? t.haut : t.corps;
      if (d >= 15 && d < 18) coul = d < 16 ? t.bande[0] : t.bande[1];
      if (x === 2) coul = t.clair;
      if (x === 12) coul = t.fond;
      R(g, x, y, 1, 1, coul);
    }
  const e = grille(t.embleme, { ...PAL, ...t.pal });
  g.drawImage(e, 3, 5 + Math.floor((10 - e.height) / 2));
  return g;
}

/* ---------- Le socle du podium ---------- */

/** Les teintes du corps d'un socle : un marine qui se lit sur la page claire comme sur la sombre. */
export const SOCLE = { face: "#18265e", lumiere: "#3550b0", ombre: "#0c1540", plaque: "#223683", lisere: "#2f4699", ecriture: "#f6f1e3" } as const;
/** Les cases prises en haut du socle par sa dalle de métal, puis par la plaque du nom, et en bas par son pied. */
export const SOCLE_DALLE = 5;
export const SOCLE_PLAQUE = 11;
export const SOCLE_PIED = 4;

/**
 * Le socle d'une marche du podium, de `largeur` cases sur `hauteur` (24 au moins) : une dalle du métal du rang qui déborde,
 * la plaque où s'écrit le nom du gagnant, le corps marine où se posent le gain et les boosters du lot, et un pied cerclé du
 * même métal. Plus le socle est haut, plus son corps l'est : l'or domine.
 */
export function socle(rang: 1 | 2 | 3, largeur: number, hauteur: number): Planche {
  const L = Math.max(16, Math.round(largeur));
  const H = Math.max(24, Math.round(hauteur));
  const g = new Planche(L, H);
  const m = METAUX[rang];
  // Le corps, en retrait de deux cases sous la dalle.
  R(g, 2, SOCLE_DALLE - 1, L - 4, H - SOCLE_DALLE + 1, PAL.k);
  R(g, 3, SOCLE_DALLE, L - 6, H - SOCLE_DALLE - 1, SOCLE.face);
  for (let y = SOCLE_DALLE + SOCLE_PLAQUE; y < H - SOCLE_PIED; y++)
    for (let x = 3; x < L - 3; x++) if (y > H - SOCLE_PIED - 7 && (x + y) % 2) R(g, x, y, 1, 1, SOCLE.ombre);
  R(g, 3, SOCLE_DALLE, 1, H - SOCLE_DALLE - 1, SOCLE.lumiere);
  R(g, L - 5, SOCLE_DALLE, 2, H - SOCLE_DALLE - 1, SOCLE.ombre);
  // Un liseré sur le bord de droite et au-dessus du pied : sur la page sombre, le corps marine ne se fond pas dans le fond.
  R(g, L - 4, SOCLE_DALLE, 1, H - SOCLE_DALLE - 1, SOCLE.lisere);
  R(g, 3, H - SOCLE_PIED - 1, L - 6, 1, SOCLE.lisere);
  // L'ombre que la dalle porte, puis la plaque du nom entre deux filets.
  R(g, 3, SOCLE_DALLE, L - 6, 1, SOCLE.ombre);
  R(g, 4, SOCLE_DALLE + 1, L - 9, SOCLE_PLAQUE - 2, SOCLE.plaque);
  R(g, 4, SOCLE_DALLE + SOCLE_PLAQUE - 1, L - 9, 1, SOCLE.ombre);
  for (const x of [6, L - 9]) {
    R(g, x, SOCLE_DALLE + 4, 2, 2, m.face);
    R(g, x, SOCLE_DALLE + 4, 1, 1, m.eclat);
  }
  // La dalle : toute la largeur, coins taillés, la lumière dessus, l'ombre dessous.
  rr(g, 0, 0, L, SOCLE_DALLE, 1, PAL.k);
  R(g, 1, 1, L - 2, SOCLE_DALLE - 2, m.face);
  R(g, 1, 1, L - 2, 1, m.eclat);
  R(g, 1, SOCLE_DALLE - 2, L - 2, 1, m.ombre);
  R(g, L - 2, 1, 1, SOCLE_DALLE - 2, m.ombre);
  // Le pied : un cercle de métal, sur toute la largeur.
  rr(g, 0, H - SOCLE_PIED, L, SOCLE_PIED, 1, PAL.k);
  R(g, 1, H - SOCLE_PIED + 1, L - 2, SOCLE_PIED - 2, m.ombre);
  R(g, 1, H - SOCLE_PIED + 1, L - 2, 1, m.face);
  return g;
}
