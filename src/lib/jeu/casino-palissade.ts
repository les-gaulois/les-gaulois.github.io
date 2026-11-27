/**
 * La palissade du casino de « Mon Gaulois » (maquette « Le Palais d'or » de Claude Fable 5.2, `c2/jeux/palissade/`, validée
 * par le pilote le 22 novembre 2026, portée telle quelle ; le velours pourpre du panneau est passé au bordeaux) : un grand
 * panneau de laque et d'or, huit rangées de pieux à tête d'or au-dessus de neuf coupes, et le statère qui tombe de pieu en
 * pieu. Le serveur tire le chemin d'abord (`jouer_palissade`) ; la chute ne fait que le suivre, rebond après rebond, et finit
 * toujours dans la coupe tirée.
 *
 * Ici : les rangs des coupes (or, rubis, saphir, argent, bois), les mesures du panneau, ses peintures en points (pieux,
 * coupes, plaques gravées, décor), la chute écrite d'après le chemin du serveur, la scène qui anime tout cela, et les sons de
 * la palissade. Rien ne dépend d'un navigateur : la scène reçoit de quoi faire ses images (`FabriqueDImages`) et le pinceau
 * où dessiner. Les chances et les gains sont ceux des règles du serveur (`src/lib/village/casino/palissade.ts`).
 */
import { CHANCES_DES_COUPES, DIXIEMES_DES_COUPES, RANGEES } from "../village/casino/palissade";
import { gaulois, familier, statere, type Visage } from "./casino-dessins";
import { SONS, cor, peau, souffle, ton as note } from "./casino-sons";
import type { FabriqueDImages, ImageDeLaScene, Pinceau } from "./casino-scene";
import { BORDEAUX, ENCRE, IVOIRE, NOIR, OR, RUBIS, SAPHIR, Toile, borne, cadreOr, disque, ecrisSur, grain, hexDe, largeurDuTexte, lueur, petitsSur, rampe, ton, type Rampe } from "./casino-toile";

/* ---------- Les rangs des coupes : or, rubis, saphir, argent, bois ---------- */

/** L'argent des coupes de la moitié (la maquette). */
export const ARGENT = rampe(["#1c1b28", "#2f2e42", "#46455e", "#5f5e7c", "#8482a3", "#b3b1cf", "#e4e3f4"]);
/** Le bois des coupes du cinquième (la maquette). */
export const BOIS = rampe(["#1a0d05", "#3a2010", "#4f2d14", "#6b3f1c", "#8a5527", "#a8682f", "#d9a35c", "#f3d49a"]);

/** Ce qu'une coupe rend, en dixièmes de la mise : 190, 40, 15, 5 ou 2. */
export type DixiemesDUneCoupe = 190 | 40 | 15 | 5 | 2;
/** Un rang de coupe : la pierre de sa plaque (classe `cas-<cle>`), sa matière, son chiffre, ses mots. */
export interface RangDeCoupe {
  cle: "or" | "rouge" | "bleue" | "argent" | "bois";
  rp: Rampe;
  /** Le chiffre gravé : « 19 », « 1,5 ». */
  signe: string;
  /** Ce qu'il rend, en mots, pour les lecteurs d'écran. */
  mots: string;
  /** Son nom court, celui du croupier et de « Vos dernières parties ». */
  court: string;
}
export const RANGS_DES_COUPES: Readonly<Record<DixiemesDUneCoupe, RangDeCoupe>> = {
  190: { cle: "or", rp: OR, signe: "19", mots: "19 fois la mise", court: "19 fois la mise" },
  40: { cle: "rouge", rp: RUBIS, signe: "4", mots: "4 fois la mise", court: "4 fois la mise" },
  15: { cle: "bleue", rp: SAPHIR, signe: "1,5", mots: "une fois et demie la mise", court: "Une fois et demie" },
  5: { cle: "argent", rp: ARGENT, signe: "0,5", mots: "la moitié de la mise", court: "La moitié" },
  2: { cle: "bois", rp: BOIS, signe: "0,2", mots: "le cinquième de la mise", court: "Le cinquième" },
};
/** Les rangs, du plus beau au plus petit (le panneau « Les coupes »). */
export const ORDRE_DES_RANGS: readonly DixiemesDUneCoupe[] = [190, 40, 15, 5, 2];
/** Les dixièmes de la coupe `k` (0 à 8). */
export const dixiemesDe = (k: number): DixiemesDUneCoupe => (DIXIEMES_DES_COUPES[k] ?? 2) as DixiemesDUneCoupe;
/** Le rang de la coupe `k`. */
export const rangDeLaCoupe = (k: number): RangDeCoupe => RANGS_DES_COUPES[dixiemesDe(k)];
/** Les chances d'un rang sur 256 : la somme de ses coupes (une ou deux). */
export const chancesDuRang = (d: DixiemesDUneCoupe): number => DIXIEMES_DES_COUPES.reduce((a, x, k) => a + (x === d ? (CHANCES_DES_COUPES[k] ?? 0) : 0), 0);
/** Le mot d'un rang avec sa majuscule. */
export const enPhrase = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** L'étiquette qui monte au-dessus de la coupe touchée : « +n » et l'or pour un gain, le nombre seul et l'ivoire pour un rendu partiel. */
export function texteDuRendu(rendu: number, mise: number): { texte: string; fort: boolean } {
  const gain = rendu > mise;
  return { texte: gain ? `+${rendu}` : String(rendu), fort: gain };
}

/* ---------- Les mesures du panneau ---------- */

/** Les mesures du panneau, en points, pour la largeur de la table. Tout part de l'écart entre deux pieux (`DX`). */
export interface MesuresDeLaPalissade {
  large: boolean;
  /** L'épaisseur du cadre d'or. */
  e: number;
  M: number;
  DX: number;
  DY: number;
  BW: number;
  H: number;
  CX: number;
  Y0: number;
  /** L'échelle des mouvements, en hauteur et en largeur. */
  s: number;
  sx: number;
  cw: number;
  ry: number;
  bh: number;
  st: number;
  pf: number;
  ch: number;
  yBouche: number;
  yPlaque: number;
  /** Le rayon d'une tête de pieu. */
  rp: number;
  /** La taille du statère (12 ou 16). */
  piece: 12 | 16;
  /** La hauteur où le statère touche une tête de pieu, au-dessus de son centre. */
  appui: number;
  /** Les consoles du croupier et de la pie. */
  pieds: number;
  gx: number;
  fx: number;
  ySocle: number;
}
export function mesurerLaPalissade(W: number): MesuresDeLaPalissade {
  const large = W >= 760;
  const e = large ? 5 : 3;
  const M = large ? 12 : 3;
  const dispo = Math.floor((large ? Math.min(W * 0.525, 684) : W - 8) / 2);
  const DX = Math.floor(borne((dispo - 2 * M) / 9, 14, 34) / 2) * 2;
  const DY = Math.round(DX * 0.9);
  const BW = 9 * DX + 2 * M;
  const Y0 = large ? 46 : 36;
  const cw = DX - 4;
  const ry = Math.max(2, Math.round(cw * 0.15));
  const bh = Math.round(cw * 0.5);
  const st = cw >= 22 ? 3 : 2;
  const pf = cw >= 22 ? 4 : 3;
  const ch = ry + bh + st + pf;
  const yBouche = Y0 + 7 * DY + Math.round(DY * 0.95) + 2;
  const yPlaque = yBouche - ry + ch + 3;
  const H0 = yPlaque + 11 + 3 + 7 + 3 + e;
  const rp = DX >= 26 ? 4 : 3;
  const piece = DX >= 32 ? 16 : 12;
  return {
    large,
    e,
    M,
    DX,
    DY,
    BW,
    H: H0 + (H0 & 1),
    CX: BW / 2,
    Y0,
    s: DY / 16,
    sx: DX / 18,
    cw,
    ry,
    bh,
    st,
    pf,
    ch,
    yBouche,
    yPlaque,
    rp,
    piece,
    appui: rp + piece / 2 - 1,
    pieds: Math.max(Y0 + 2 * DY, 68),
    gx: e + (large ? 22 : 17),
    fx: BW - e - (large ? 26 : 23),
    ySocle: Y0 + 7 * DY + Math.round(DY * 0.5),
  };
}
/** Le pieu `j` de la rangée `r` (0 à 7), et le milieu de la coupe `k`. */
export const xDuPieu = (G: MesuresDeLaPalissade, r: number, j: number): number => Math.round(G.CX + (j - r / 2) * G.DX);
export const yDuPieu = (G: MesuresDeLaPalissade, r: number): number => G.Y0 + r * G.DY;
export const xDeLaCoupe = (G: MesuresDeLaPalissade, k: number): number => G.CX + (k - 4) * G.DX;
/** Le nombre de lâchers que montre « Vos lâchers » à côté du panneau (sa largeur `lp`, en pixels). */
export const placesDesLachers = (largeur: number, lp: number): number => Math.max(4, Math.min(10, Math.floor((largeur < 760 ? lp - 8 : lp - 150) / 44)));

/* ---------- Les peintures ---------- */

/** Un pieu vu de face : une tête d'or bombée, la lumière en haut à gauche. `vif` : il vient d'être frappé. */
export function peindrePieu(G: MesuresDeLaPalissade, vif: boolean): Toile {
  const r = G.rp;
  const T = new Toile(2 * r + 3, 2 * r + 3);
  const c = r + 1;
  disque(T, c, c, r, (d, a, x, y) => {
    const l = -(Math.cos(a) + Math.sin(a)) * d * 0.5;
    return OR.t((vif ? 0.82 : 0.62) + l * 0.42 + (d > 0.8 ? -0.14 : 0), x, y, 0.5);
  });
  T.p(c - 1, c - 1, ton(OR, 8));
  if (r > 3) T.p(c - 2, c - 1, ton(OR, 7));
  return T.cerne();
}

/** Une coupe : la bouche (derrière le statère) et le calice (devant), à la matière de son rang ; lèvre, pied et tige d'or. */
export function peindreCoupe(G: MesuresDeLaPalissade, rp: Rampe): { dos: Toile; dev: Toile } {
  const { cw, ry, bh, st, pf, ch } = G;
  const rx = cw / 2;
  const cx = rx + 1;
  const dos = new Toile(cw + 2, ch + 2);
  const dev = new Toile(cw + 2, ch + 2);
  const tout = new Toile(cw + 2, ch + 2);
  const dansBouche = (x: number, y: number): boolean => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - 1 - ry) / ry) ** 2 <= 1;
  const creux = (x: number, y: number): boolean => ((x + 0.5 - cx) / (rx - 1.4)) ** 2 + ((y + 0.5 - 1 - ry - 0.2) / Math.max(0.9, ry - 1)) ** 2 <= 1;
  dos.tout((x, y) => (!dansBouche(x, y) ? null : creux(x, y) ? rp.t(0.05 + 0.1 * (y / (2 * ry)), x, y, 0.5) : OR.t(0.86 - 0.4 * (x / cw), x, y)));
  dev.tout((x, y) => {
    const v = y - 1 - ry;
    const dx = x + 0.5 - cx;
    if (v < 0) return null;
    if (v < bh) {
      const t = v / bh;
      const hw = rx * Math.sqrt(1 - t * t * 0.86);
      if (Math.abs(dx) > hw || creux(x, y)) return null;
      if (dansBouche(x, y)) return OR.t(0.9 - 0.45 * (x / cw), x, y);
      const u = (dx + hw) / (2 * hw);
      return rp.t(0.8 - 0.5 * u - 0.16 * t + (u > 0.16 && u < 0.3 ? 0.14 : 0), x, y, 0.8);
    }
    if (v < bh + st) return Math.abs(dx) <= st / 2 + 0.6 ? OR.t(dx < 0 ? 0.7 : 0.42, x, y) : null;
    const fy = v - bh - st;
    const fw = Math.min(rx * 0.86, rx * 0.5 + fy * 1.6);
    return Math.abs(dx) <= fw ? OR.t(0.82 - 0.45 * ((dx + fw) / (2 * fw)) - (fy === pf - 1 ? 0.2 : 0), x, y) : null;
  });
  tout.pose(dos, 0, 0);
  tout.pose(dev, 0, 0);
  tout.cerne();
  for (let y = 0; y < tout.h; y++) for (let x = 0; x < tout.w; x++) if (tout.a(x, y) && !dos.a(x, y) && !dev.a(x, y)) (y <= ry ? dos : dev).p(x, y, ENCRE);
  return { dos, dev };
}

/** La plaque gravée sous une coupe : une pierre taillée à sa matière, le nombre de fois dessus. */
export function peindrePlaque(Tl: Toile, x0: number, y0: number, w: number, d: DixiemesDUneCoupe): void {
  const { rp, signe } = RANGS_DES_COUPES[d];
  const h = 11;
  const or = d === 190;
  Tl.f(x0, y0, x0 + w, y0 + h, (x, y) => {
    const m = Math.min(x - x0, y - y0, x0 + w - 1 - x, y0 + h - 1 - y);
    const hl = x - x0 + (y - y0) < (w + h) / 2 - 1;
    return m === 0 ? (or ? ton(OR, 1) : ENCRE) : m === 1 ? rp.t(hl ? 0.8 : 0.18, x, y, 0) : ton(rp, d === 5 || d === 2 ? 2 : 3);
  });
  const c = or ? ton(OR, 7) : ton(IVOIRE, 6);
  const lt = largeurDuTexte(signe);
  const [ent = "", dec] = signe.split(",");
  const lv = dec ? largeurDuTexte(ent) + largeurDuTexte(dec) + 4 : lt;
  if (dec && lv <= w - 2) {
    const x = x0 + Math.round((w - lv) / 2);
    const xv = x + largeurDuTexte(ent) + 1;
    ecrisSur(Tl, ent, x, y0 + 2, c, ENCRE);
    for (const [dy, cc] of [
      [1, ENCRE],
      [0, c],
    ] as const) {
      Tl.p(xv + 1, y0 + 7 + dy, cc);
      Tl.p(xv + 1, y0 + 8 + dy, cc);
      Tl.p(xv, y0 + 9 + dy, cc);
    }
    ecrisSur(Tl, dec, xv + 3, y0 + 2, c, ENCRE);
  } else if (lt <= w - 4) ecrisSur(Tl, signe, x0 + Math.round((w - lt) / 2), y0 + 2, c, ENCRE);
  else {
    const l2 = dec ? 9 : ent.length * 4 - 1;
    const x = x0 + Math.round((w - l2) / 2);
    for (const [dy, cc] of [
      [1, ENCRE],
      [0, c],
    ] as const) {
      petitsSur(Tl, ent, x, y0 + 3 + dy, cc);
      if (dec) {
        Tl.p(x + 4, y0 + 7 + dy, cc);
        Tl.p(x + 4, y0 + 8 + dy, cc);
        petitsSur(Tl, dec, x + 6, y0 + 3 + dy, cc);
      }
    }
  }
}

/** L'étiquette qui monte au-dessus d'une coupe : laque et filet d'or, l'or vif pour un gain, l'ivoire sinon. */
export function etiquetteDeGain(texte: string, fort: boolean): Toile {
  const w = largeurDuTexte(texte) + 6;
  const T = new Toile(w, 13);
  T.tout((x, y) => {
    if ((x === 0 || x === w - 1) && (y === 0 || y === 12)) return null;
    return x === 0 || y === 0 || x === w - 1 || y === 12 ? ton(OR, fort ? 6 : 3) : ton(NOIR, 2);
  });
  ecrisSur(T, texte, 3, 3, fort ? ton(OR, 7) : ton(IVOIRE, 4));
  return T;
}

/** Le velours du panneau : un grand triangle de bordeaux sous les pieux, posé sur un socle où se tiennent les coupes. */
export function dansVelours(G: MesuresDeLaPalissade, x: number, y: number): boolean {
  const { CX, DX, DY, Y0, BW, e, ySocle } = G;
  const yHaut = Y0 - Math.round(DY * 0.8);
  if (x < e + 2 || x >= BW - e - 2 || y < yHaut || y >= G.H - e - 2) return false;
  return y >= ySocle || Math.abs(x + 0.5 - CX) <= DX * 0.8 + ((y - Y0) * (DX / 2)) / DY;
}

/**
 * Le décor fixe : cadre d'or, laque (noire la nuit, ivoire le jour), velours bordeaux, consoles, ombres des pieux, dos des
 * coupes et plaques gravées. Rend aussi le devant de chaque coupe, posé par-dessus le statère.
 */
export function peindreLeDecor(G: MesuresDeLaPalissade, jour: boolean): { decor: Toile; devants: Toile[] } {
  const { BW, H, e, DX, DY, CX, Y0, cw, ry, ch, yBouche, yPlaque, pieds, gx, fx, rp } = G;
  const Tl = new Toile(BW, H);
  // la laque : de longs reflets en biais, des losanges à peine visibles, un clou d'or à chaque pointe
  Tl.tout((x, y) => {
    const los = Math.abs((x % 16) - 8) + Math.abs((y % 16) - 8) === 8;
    const clou = (x % 16 === 8 && y % 16 === 0) || (x % 16 === 0 && y % 16 === 8);
    const reflet = Math.pow(0.5 + 0.5 * Math.cos((x - y * 0.55) * 0.04 + 0.4), 8);
    if (clou) return ton(OR, jour ? 5 : 3);
    return jour ? IVOIRE.t(0.9 + reflet * 0.1 - (los ? 0.1 : 0) - (y / H) * 0.05, x, y, 0.8) : NOIR.t(0.26 + reflet * 0.34 + (los ? 0.07 : 0), x, y, 1);
  });
  // deux niches de lumière, où se tiennent le croupier et la pie
  lueur(Tl, gx, pieds - 26, 34, jour ? 0.3 : 0.5, ton(OR, jour ? 5 : 4));
  lueur(Tl, fx, pieds - 14, 30, jour ? 0.3 : 0.46, ton(OR, jour ? 5 : 4));
  // le velours et son filet d'or
  const v = (x: number, y: number): boolean => dansVelours(G, x, y);
  Tl.tout((x, y) => {
    if (!v(x, y)) return v(x - 1, y) || v(x + 1, y) || v(x, y - 1) || v(x, y + 1) ? (jour ? ton(OR, 2) : ENCRE) : null;
    if (!v(x - 1, y) || !v(x + 1, y) || !v(x, y - 1) || !v(x, y + 1)) return OR.t(0.52 + 0.3 * Math.sin((x + y) * 0.13), x, y);
    const loin = Math.hypot((x - CX) / BW, (y - (Y0 + 4 * DY)) / H);
    return BORDEAUX.t(0.4 - loin * 0.34 + 0.07 * grain(x, y), x, y, 0.6);
  });
  cadreOr(Tl, 0, 0, BW, H, e);
  // les deux consoles d'or
  for (const [x0, sens] of [
    [e, 1],
    [BW - e - 1, -1],
  ] as const) {
    const l = Math.min(46, Math.floor(CX - (DX * 0.8 + ((pieds - Y0) * (DX / 2)) / DY) - e) - 2);
    for (let i = 0; i < l; i++) {
      const x = x0 + i * sens;
      Tl.p(x, pieds, ton(OR, 7));
      Tl.p(x, pieds + 1, OR.t(0.7 - (i / l) * 0.2, x, pieds + 1));
      Tl.p(x, pieds + 2, OR.t(0.56 - (i / l) * 0.2, x, pieds + 2));
      Tl.p(x, pieds + 3, ton(OR, 2));
      Tl.m(x, pieds + 4, ENCRE, 0.5);
    }
    for (let k = 0; k < 8; k++)
      for (let i = 0; i < 16 - 2 * k; i++) {
        const x = x0 + i * sens;
        Tl.p(x, pieds + 4 + k, i >= 14 - 2 * k ? ton(OR, 2) : OR.t(0.5 - k * 0.04 + (i < 2 ? 0.2 : 0), x, pieds + 4 + k));
      }
  }
  // les cloisons d'or entre les coupes, une perle à leur tête
  const yCl = Y0 + 7 * DY + Math.round(DY * 0.55);
  for (let k = 1; k < 9; k++) {
    const x = CX + (k - 4.5) * DX;
    for (let y = yCl; y < yBouche + ry + 2; y++) {
      Tl.p(x, y, ton(OR, 6));
      Tl.p(x - 1, y, ton(OR, 4));
      Tl.m(x + 1, y, ENCRE, 0.45);
    }
    Tl.r(x - 2, yCl - 2, 3, 3, ton(OR, 5));
    Tl.p(x - 2, yCl - 2, ton(OR, 8));
    Tl.p(x, yCl, ton(OR, 3));
  }
  // l'ombre des pieux sur le velours
  for (let r = 0; r < RANGEES; r++)
    for (let j = 0; j <= r; j++) {
      const px0 = xDuPieu(G, r, j) + 1;
      const py0 = yDuPieu(G, r) + 2;
      for (let y = -rp; y <= rp; y++) for (let x = -rp; x <= rp; x++) if (x * x + y * y <= rp * rp + 1) Tl.m(px0 + x, py0 + y, ENCRE, 0.42);
    }
  // le dos des coupes et leurs plaques gravées
  const devants: Toile[] = [];
  for (let k = 0; k < 9; k++) {
    const c = peindreCoupe(G, rangDeLaCoupe(k).rp);
    const x0 = xDeLaCoupe(G, k) - cw / 2 - 1;
    for (let y = 2; y < 5; y++) for (let x = 2; x < cw; x++) Tl.m(x0 + x, yBouche - ry - 1 + ch + y - 2, ENCRE, 0.3);
    Tl.pose(c.dos, x0, yBouche - ry - 1);
    devants.push(c.dev);
    peindrePlaque(Tl, xDeLaCoupe(G, k) - (DX - 2) / 2, yPlaque, DX - 2, dixiemesDe(k));
  }
  const mot = "FOIS LA MISE";
  ecrisSur(Tl, mot, Math.round(CX - largeurDuTexte(mot) / 2), yPlaque + 14, ton(OR, 6), ENCRE);
  return { decor: Tl, devants };
}

/* ---------- La chute : le chemin est tiré d'abord, les rebonds le suivent ---------- */

/** Ce que fait le statère au bout d'un morceau de chute : frapper un pieu, entrer dans la bouche d'une coupe, arriver au fond. */
export interface EffetDeChute {
  pieu?: readonly [number, number];
  doux?: boolean;
  bouche?: boolean;
  arrivee?: boolean;
}
/** Un morceau de chute : un arc de parabole de (x0, y0) à (x1, y1) en `T` secondes, départ vers le haut à `vy`. */
export interface MorceauDeChute {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  vy: number;
  T: number;
  dedans?: boolean;
  effet?: EffetDeChute;
}
/** Un statère qui tombe, et ce qu'il porte (le coup du serveur, gardé tel quel). */
export interface Volee<C = unknown> {
  segs: MorceauDeChute[];
  i: number;
  t: number;
  x: number;
  y: number;
  /** La coupe d'arrivée, tirée par le serveur. */
  k: number;
  m: number;
  tour: number;
  sens: number;
  fini: boolean;
  dedans: boolean;
  coup: C;
}
/** La pesanteur de la chute, pour un panneau à l'échelle `s`. */
const pesanteur = (G: MesuresDeLaPalissade): number => 620 * G.s;

/**
 * La chute écrite pour le chemin du serveur (huit choix, 0 à gauche, 1 à droite) : du poing du croupier jusqu'au premier
 * pieu, puis de pieu en pieu, une petite hésitation de temps en temps, jusque dans la coupe `k`. `alea` ne dessine que les
 * rebonds : il ne change jamais le pieu touché ni la coupe.
 */
export function ecrireLaChute<C>(G: MesuresDeLaPalissade, chemin: readonly number[], k: number, m: number, coup: C, alea: () => number = Math.random): Volee<C> {
  const { s, sx } = G;
  const GR = pesanteur(G);
  const hasard = (a: number, b: number): number => a + alea() * (b - a);
  const segs: MorceauDeChute[] = [];
  const haut = (r: number): number => yDuPieu(G, r) - G.appui;
  const arc = (x0: number, y0: number, x1: number, y1: number, vy: number, effet: EffetDeChute): MorceauDeChute => {
    const T = (-vy + Math.sqrt(vy * vy + 2 * GR * (y1 - y0))) / GR;
    return { x0, y0, x1, y1, vy, T, effet };
  };
  // le lancer : du poing du croupier jusqu'au premier pieu
  const T0 = 0.5;
  const xa = G.gx + 13;
  const ya = G.pieds - 30;
  const xb = G.CX + hasard(-0.6, 0.6);
  const yb = haut(0);
  segs.push({ x0: xa, y0: ya, x1: xb, y1: yb, vy: (yb - ya - 0.5 * GR * T0 * T0) / T0, T: T0, effet: { pieu: [0, 0] } });
  let j = 0;
  let x = xb;
  let y = yb;
  for (let r = 0; r < RANGEES; r++) {
    const d = chemin[r] ? 1 : 0;
    // une petite hésitation sur la tête du pieu, du côté où il va tomber
    if (alea() < 0.2) segs.push(arc(x, y, x + (d ? 0.8 : -0.8) * sx, y, -hasard(26, 40) * s, { pieu: [r, j], doux: true }));
    j += d;
    const dernier = r === RANGEES - 1;
    const x1 = dernier ? xDeLaCoupe(G, k) + hasard(-1.5, 1.5) : xDuPieu(G, r + 1, j) + (chemin[r + 1] ? 1.6 : -1.6) * hasard(0.4, 1) * sx;
    const y1 = dernier ? G.yBouche - 1 : haut(r + 1);
    const avant = segs[segs.length - 1];
    if (avant?.effet?.doux) x = avant.x1;
    segs.push(arc(x, y, x1, y1, -hasard(48, 82) * s, dernier ? { bouche: true } : { pieu: [r + 1, j] }));
    x = x1;
    y = y1;
  }
  // il s'enfonce dans la coupe
  const fin = segs[segs.length - 1]!;
  const vFin = fin.vy + GR * fin.T;
  segs.push({ x0: x, y0: y, x1: x, y1: y + G.piece * 0.8, vy: Math.min(vFin, 120 * s), T: 0.1, dedans: true, effet: { arrivee: true } });
  return { segs, i: 0, t: 0, x: xa, y: ya, k, m, tour: hasard(0, 6), sens: 1, fini: false, dedans: false, coup };
}

/** Fait avancer une chute de `dt` secondes ; `surEffet` reçoit chaque effet atteint, dans l'ordre. */
export function avancerLaChute<C>(G: MesuresDeLaPalissade, v: Volee<C>, dt: number, surEffet: (e: EffetDeChute) => void): void {
  v.t += dt;
  while (!v.fini && v.t >= v.segs[v.i]!.T) {
    const sg = v.segs[v.i]!;
    v.t -= sg.T;
    v.x = sg.x1;
    v.y = sg.y1;
    if (sg.effet) surEffet(sg.effet);
    v.i++;
    if (v.i >= v.segs.length) v.fini = true;
  }
  if (v.fini) return;
  const sg = v.segs[v.i]!;
  const u = v.t / sg.T;
  v.x = sg.x0 + (sg.x1 - sg.x0) * u;
  v.y = sg.y0 + sg.vy * v.t + 0.5 * pesanteur(G) * v.t * v.t;
  v.sens = sg.x1 >= sg.x0 ? 1 : -1;
  v.tour += dt * (7 + ((Math.abs(sg.x1 - sg.x0) / sg.T) * 0.12) / G.sx) * v.sens;
  v.dedans = !!sg.dedans;
}

/* ---------- Les sons de la palissade (ceux de la maquette) ---------- */

export const SONS_DE_LA_PALISSADE = {
  /** Le pieu frappé : le bois laqué, plus grave à chaque rangée, et sa tête d'or qui tinte à peine. */
  pieu(r: number, doux = false): void {
    const f = 470 * Math.pow(0.905, r) * (doux ? 1.04 : 1);
    const v = doux ? 0.55 : 1;
    peau(0, f, 0.13 * v, 0.11, 1.5);
    note(f * 2.4, f * 2.1, 0, 0.035, 0.03 * v, "triangle", 0.001);
    souffle(0, 0.022, "bandpass", 2100, 1300, 1.6, 0.07 * v, 0.001);
    note(f * 5.02, f * 4.98, 0, 0.12, 0.007 * v, "sine", 0.001);
  },
  /** Le statère lancé : un souffle, la pièce qui part. */
  lancer(): void {
    souffle(0, 0.16, "bandpass", 500, 1400, 0.9, 0.05, 0.06);
    SONS.piece(0, 0);
  },
  /** La chute dans la coupe : un coup mat, le métal de la coupe qui sonne un instant. */
  coupe(): void {
    peau(0, 84, 0.13, 0.4, 2.3);
    souffle(0, 0.1, "lowpass", 600, 140, 0.8, 0.09);
    note(980, 970, 0.02, 0.3, 0.022, "triangle", 0.002);
    note(1470, 1460, 0.02, 0.16, 0.008, "sine", 0.002);
  },
  /** Les 4 fois la mise : le cor grave et quatre statères. */
  cor(): void {
    peau(0, 56, 0.16, 0.4, 2.3);
    souffle(0, 0.08, "lowpass", 500, 120, 0.7, 0.08);
    cor([73.42, 110], 0.02, 0.9, 0.055);
    for (let i = 0; i < 4; i++) SONS.piece(0.12 + i * 0.09, i);
  },
  /** Une fois et demie : trois statères. */
  troisPieces(): void {
    for (let i = 0; i < 3; i++) SONS.piece(0.05 + i * 0.09, i);
  },
};

/* ---------- La scène : le grand panneau de laque et d'or, et tout ce qui y bouge ---------- */

/** Ce que la scène demande au jeu quand un statère arrive dans sa coupe : ce qui revient (pour l'étiquette). */
export type SurArrivee<C> = (v: Volee<C>, pose: boolean) => number;

interface Fete {
  k: number;
  t: number;
  duree: number;
  grande: boolean;
  sauts: number;
}
interface Eclat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  d: number;
  c: string;
}
interface GainAffiche {
  im: ImageDeLaScene;
  x: number;
  y: number;
  t: number;
  fixe: boolean;
}

/**
 * La scène de la palissade : ses mesures, ses images, les pieux qui s'enfoncent, les statères qui tombent, les coupes qui
 * sautent, les étiquettes, le croupier et la pie. `pas(dt)` fait tout avancer et rend vrai tant que quelque chose bouge ;
 * `dessiner(g)` peint l'image. Sans mouvement, `poserTout()` pose chaque statère dans sa coupe.
 */
export class SceneDeLaPalissade<C> {
  G: MesuresDeLaPalissade;
  private readonly fabrique: FabriqueDImages;
  private readonly surArrivee: SurArrivee<C>;
  private decor: ImageDeLaScene | null = null;
  private devants: ImageDeLaScene[] = [];
  private corps: Partial<Record<Visage, ImageDeLaScene>> = {};
  private pie: ImageDeLaScene | null = null;
  private pieu: ImageDeLaScene | null = null;
  private pieuVif: ImageDeLaScene | null = null;
  private piece: ImageDeLaScene | null = null;
  private halo: ImageDeLaScene | null = null;
  private banniere: ImageDeLaScene | null = null;
  private vis: Visage = "";
  readonly pieux: { x: number; y: number; coup: number }[] = [];
  readonly volees: Volee<C>[] = [];
  private readonly eclats: Eclat[] = [];
  private readonly gains: GainAffiche[] = [];
  private readonly coupes = Array.from({ length: 9 }, () => ({ saut: 0, lum: -1 }));
  private poses: number[] = [];
  private fete: Fete | null = null;
  private readonly perso = { sy: 1, v: 0, y: 0, vy: 0 };
  private readonly oiseau = { y: 0, vy: 0 };
  private alea: () => number;
  private sansMouvement: () => boolean;

  constructor(W: number, fabrique: FabriqueDImages, surArrivee: SurArrivee<C>, options: { alea?: () => number; sansMouvement?: () => boolean } = {}) {
    this.G = mesurerLaPalissade(W);
    this.fabrique = fabrique;
    this.surArrivee = surArrivee;
    this.alea = options.alea ?? Math.random;
    this.sansMouvement = options.sansMouvement ?? (() => false);
  }

  /** Repeint les images (après un changement de taille ou de thème). Une chute en route à une autre taille est posée d'un coup. */
  preparer(W: number, jour: boolean): boolean {
    const g = mesurerLaPalissade(W);
    const change = g.BW !== this.G.BW || g.H !== this.G.H;
    if (change) for (const v of this.volees.splice(0)) this.arrivee(v, true);
    this.G = g;
    const f = this.fabrique;
    this.corps = {};
    for (const v of ["", "Lance", "Joie", "Bee", "Clin"] as const) this.corps[v] = f.image(gaulois("palissade", v));
    this.pie = f.image(familier("pie-bavarde"));
    this.pieu = f.image(peindrePieu(g, false));
    this.pieuVif = f.image(peindrePieu(g, true));
    this.piece = f.image(statere(g.piece));
    const R = Math.round(g.DX * 1.5);
    const h = new Toile(2 * R, 2 * R);
    lueur(h, R, R, R, 0.9, ton(OR, 6));
    this.halo = f.image(h);
    this.banniere = f.image(etiquetteDeGain("19 FOIS LA MISE", true));
    this.pieux.length = 0;
    for (let r = 0; r < RANGEES; r++) for (let j = 0; j <= r; j++) this.pieux.push({ x: xDuPieu(g, r, j), y: yDuPieu(g, r), coup: 0 });
    const d = peindreLeDecor(g, jour);
    this.decor = f.image(d.decor);
    this.devants = d.devants.map((t) => f.image(t));
    this.eclats.length = 0;
    if (change) this.gains.length = 0;
    for (const x of this.gains) x.y = g.yBouche - g.ry - 9;
    return change;
  }

  /** Le visage du croupier dans la scène. */
  visage(v: Visage): void {
    this.vis = v;
  }

  /** Un statère lâché : sa chute suit le chemin du serveur jusque dans la coupe `k`. */
  lancer(chemin: readonly number[], k: number, m: number, coup: C): void {
    this.poses = [];
    for (let i = this.gains.length - 1; i >= 0; i--) if (this.gains[i]!.fixe) this.gains.splice(i, 1);
    this.volees.push(ecrireLaChute(this.G, chemin, k, m, coup, this.alea));
    this.perso.v = -3.2;
  }

  /** Le statère est dans sa coupe : la coupe réagit, ce qui revient s'affiche, le croupier et la pie fêtent les beaux gains. */
  arrivee(v: Volee<C>, pose: boolean): void {
    const d = dixiemesDe(v.k);
    const rendu = this.surArrivee(v, pose);
    const c = this.coupes[v.k]!;
    if (pose) {
      this.gains.length = 0;
      this.poses = [v.k];
      this.fete = null;
      for (const x of this.coupes) x.lum = -1;
    }
    c.saut = pose ? 0 : 1;
    c.lum = 0;
    const { texte, fort } = texteDuRendu(rendu, v.m);
    this.gains.push({ im: this.fabrique.image(etiquetteDeGain(texte, fort)), x: xDeLaCoupe(this.G, v.k), y: this.G.yBouche - this.G.ry - 9, t: 0, fixe: pose });
    if (d >= 40) this.fete = { k: v.k, t: 0, duree: d === 190 ? 6.5 : 3.4, grande: d === 190, sauts: d === 190 ? 3 : 1 };
    if (!pose && d >= 15) {
      this.perso.vy = d >= 40 ? -46 : -24;
      this.oiseau.vy = d >= 40 ? -30 : 0;
    }
  }

  /** Sans mouvement (pause, mouvement réduit) : le statère est posé tout de suite dans la coupe tirée. */
  poserUnStatere(chemin: readonly number[], k: number, m: number, coup: C): void {
    this.arrivee(ecrireLaChute(this.G, chemin, k, m, coup, this.alea), true);
  }

  /** Sans mouvement : chaque statère en route est posé dans sa coupe, tout s'arrête. */
  poserTout(): void {
    for (const v of this.volees.splice(0)) this.arrivee(v, true);
    this.perso.sy = 1;
    this.perso.v = this.perso.y = this.perso.vy = this.oiseau.y = this.oiseau.vy = 0;
    this.eclats.length = 0;
    for (const p of this.pieux) p.coup = 0;
    for (const c of this.coupes) c.saut = 0;
  }

  private effet(v: Volee<C>, e: EffetDeChute): void {
    if (e.pieu) {
      const [r, j] = e.pieu;
      const p = this.pieux[(r * (r + 1)) / 2 + j];
      if (p) p.coup = 1;
      SONS_DE_LA_PALISSADE.pieu(r, e.doux);
      const hasard = (a: number, b: number): number => a + this.alea() * (b - a);
      for (let n = 0; n < 3; n++)
        this.eclats.push({ x: v.x + hasard(-2, 2), y: v.y + this.G.piece / 2 - 1, vx: hasard(-22, 22) * this.G.s, vy: hasard(-34, -12) * this.G.s, t: 0, d: hasard(0.25, 0.45), c: hexDe(ton(OR, n ? 6 : 8)) });
    }
    if (e.bouche) SONS_DE_LA_PALISSADE.coupe();
    if (e.arrivee) this.arrivee(v, false);
  }

  /** Tout ce qui bouge avance de `dt` secondes. Rend vrai tant que quelque chose bouge encore (rien ne tourne au repos). */
  pas(dt: number): boolean {
    if (this.sansMouvement()) {
      this.poserTout();
      return false;
    }
    let encore = false;
    const G = this.G;
    for (const v of this.volees) {
      avancerLaChute(G, v, dt, (e) => this.effet(v, e));
      encore = true;
    }
    for (let i = this.volees.length - 1; i >= 0; i--) if (this.volees[i]!.fini) this.volees.splice(i, 1);
    for (const p of this.pieux)
      if (p.coup > 0) {
        p.coup = Math.max(0, p.coup - dt * 6);
        encore = true;
      }
    for (const c of this.coupes) {
      if (c.saut > 0) {
        c.saut = Math.max(0, c.saut - dt * 2.6);
        encore = true;
      }
      if (c.lum >= 0) {
        c.lum += dt;
        if (c.lum > 3.2) c.lum = -1;
        encore = true;
      }
    }
    for (let i = this.eclats.length - 1; i >= 0; i--) {
      const e = this.eclats[i]!;
      e.t += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += 160 * G.s * dt;
      if (e.t > e.d) this.eclats.splice(i, 1);
      encore = true;
    }
    for (let i = this.gains.length - 1; i >= 0; i--) {
      const g = this.gains[i]!;
      if (g.fixe) continue;
      g.t += dt;
      if (g.t > 1.9) this.gains.splice(i, 1);
      encore = true;
    }
    const perso = this.perso;
    if (this.fete) {
      this.fete.t += dt;
      if (this.fete.sauts > 1 && perso.y === 0 && perso.vy === 0) {
        this.fete.sauts--;
        perso.vy = -40;
      }
      if (this.fete.t >= this.fete.duree) this.fete = null;
      encore = true;
    }
    // le croupier : un ressort quand il lance, un saut quand ça paie ; la pie sautille aux beaux gains
    perso.v += ((1 - perso.sy) * 260 - perso.v * 16) * dt;
    perso.sy += perso.v * dt;
    if (Math.abs(perso.sy - 1) + Math.abs(perso.v) > 0.002) encore = true;
    else {
      perso.sy = 1;
      perso.v = 0;
    }
    for (const o of [perso, this.oiseau])
      if (o.y < 0 || o.vy < 0) {
        o.vy += 300 * dt;
        o.y += o.vy * dt;
        if (o.y >= 0) {
          o.y = 0;
          o.vy = 0;
        }
        encore = true;
      }
    return encore;
  }

  /** Peint l'image entière. `calme` : sans mouvement (les lueurs sont posées, pas de bannière). */
  dessiner(g: Pinceau, calme = this.sansMouvement()): void {
    const G = this.G;
    if (!this.decor || !this.piece || !this.pieu || !this.pieuVif) return;
    const { BW, H, yBouche, ry, ch, cw, pieds } = G;
    const bas = yBouche - ry - 1 + ch + 2;
    const pied = (im: ImageDeLaScene, cx: number, b: number, fx = 1, fy = 1): void => {
      const w = Math.max(1, Math.round(im.width * fx));
      const h = Math.max(1, Math.round(im.height * fy));
      g.drawImage(im, Math.round(cx - w / 2), Math.round(b - h), w, h);
    };
    const pieceImg = this.piece;
    const piece = (x: number, y: number, tour: number): void => {
      const S = G.piece;
      const l = Math.abs(Math.cos(tour));
      if (l < 0.18) {
        g.fillStyle = hexDe(ton(OR, 4));
        g.fillRect(Math.round(x) - 1, Math.round(y - S / 2), 2, S);
        g.fillStyle = hexDe(ton(OR, 6));
        g.fillRect(Math.round(x) - 1, Math.round(y - S / 2) + 1, 1, S - 2);
      } else {
        const w = Math.max(2, Math.round(S * l));
        g.drawImage(pieceImg, Math.round(x - w / 2), Math.round(y - S / 2), w, S);
      }
    };
    const dansLaCoupe = (f: () => void): void => {
      g.save();
      g.beginPath();
      g.rect(0, 0, BW, yBouche + ry - 1);
      g.clip();
      f();
      g.restore();
    };
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, BW, H);
    g.drawImage(this.decor, 0, 0);
    // la lueur chaude derrière la coupe d'un beau gain : elle monte lentement, puis s'éteint
    const fete = this.fete;
    if (fete && this.halo) {
      const u = fete.t / fete.duree;
      const a = calme ? 0.7 : Math.min(1, fete.t / 1.1) * Math.min(1, (1 - u) * 3) * 0.8;
      g.globalAlpha = Math.max(0, a);
      g.drawImage(this.halo, Math.round(xDeLaCoupe(G, fete.k) - this.halo.width / 2), Math.round(yBouche + 4 - this.halo.height / 2));
      g.globalAlpha = 1;
    }
    if (this.pie) pied(this.pie, G.fx, pieds + this.oiseau.y);
    const corps = this.corps[this.vis] ?? this.corps[""];
    if (corps) pied(corps, G.gx, pieds + this.perso.y, 1, this.perso.sy);
    // les pieux : frappés, ils s'éclairent et s'enfoncent d'un point
    for (const p of this.pieux) g.drawImage(p.coup > 0.45 ? this.pieuVif : this.pieu, p.x - G.rp - 1, p.y - G.rp - 1 + (p.coup > 0.1 ? 1 : 0));
    for (const v of this.volees)
      if (!v.fini) {
        if (v.dedans) dansLaCoupe(() => piece(v.x, v.y, 0));
        else piece(v.x, v.y, v.tour);
      }
    for (const k of this.poses) dansLaCoupe(() => piece(xDeLaCoupe(G, k), yBouche - 2, 0));
    for (let k = 0; k < 9; k++) {
      const c = this.coupes[k]!;
      const dev = this.devants[k];
      const e = c.saut;
      if (dev) {
        if (e > 0) pied(dev, xDeLaCoupe(G, k), bas, 1 + 0.08 * Math.sin(e * Math.PI) * e, 1 - 0.12 * Math.sin(e * Math.PI) * e);
        else g.drawImage(dev, xDeLaCoupe(G, k) - cw / 2 - 1, yBouche - ry - 1);
      }
      // la plaque de la coupe touchée s'entoure d'or, lentement
      if (c.lum >= 0) {
        const a = calme ? 1 : Math.min(1, c.lum / 0.6) * Math.min(1, (3.2 - c.lum) / 1);
        if (a > 0) {
          g.globalAlpha = a;
          g.fillStyle = hexDe(ton(OR, 7));
          const x0 = xDeLaCoupe(G, k) - (G.DX - 2) / 2 - 1;
          const y0 = G.yPlaque - 1;
          const w = G.DX;
          const h = 13;
          g.fillRect(x0 + 1, y0, w - 2, 1);
          g.fillRect(x0 + 1, y0 + h - 1, w - 2, 1);
          g.fillRect(x0, y0 + 1, 1, h - 2);
          g.fillRect(x0 + w - 1, y0 + 1, 1, h - 2);
          g.globalAlpha = 1;
        }
      }
    }
    for (const e of this.eclats) {
      g.fillStyle = e.c;
      g.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
    }
    for (const x of this.gains) {
      const u = x.fixe ? 0.4 : x.t / 1.9;
      const y = x.y - (x.fixe ? 4 : 12 * G.s * (1 - Math.pow(1 - Math.min(1, u * 1.6), 3)));
      g.globalAlpha = x.fixe ? 1 : Math.min(1, u * 8) * Math.min(1, (1 - u) * 4);
      g.drawImage(x.im, Math.round(borne(x.x - x.im.width / 2, G.e + 1, BW - G.e - 1 - x.im.width)), Math.round(y - x.im.height / 2));
      g.globalAlpha = 1;
    }
    if (fete?.grande && !calme && this.banniere) {
      const a = Math.min(1, fete.t / 1) * Math.min(1, (fete.duree - fete.t) / 1.2);
      g.globalAlpha = Math.max(0, a);
      g.drawImage(this.banniere, Math.round(G.CX - this.banniere.width / 2), G.e + 3);
      g.globalAlpha = 1;
    }
  }
}

/* ---------- La bourse pendant que des statères tombent ---------- */

/** Ce que la barre peut montrer d'un coup du serveur. */
export interface CoupALaBourse {
  rendu: number;
  god: boolean;
  solde_apres: number;
}
/**
 * La bourse que montre la barre pendant que des statères tombent : le solde du dernier coup du serveur (les mises de tous
 * les lâchers déjà prises, leurs gains déjà comptés), moins ce que rendent les vrais statères pas encore arrivés dans leur
 * coupe. Ainsi la barre ne montre jamais un gain avant sa coupe. Un essai GOD ne prend ni ne rend rien : il ne compte pas,
 * même mêlé à de vrais lâchers (le mode allumé ou éteint pendant que des statères tombent).
 */
export function bourseDesLachers(dernier: Pick<CoupALaBourse, "solde_apres">, enRoute: readonly Pick<CoupALaBourse, "rendu" | "god">[]): number {
  return dernier.solde_apres - enRoute.reduce((a, c) => a + (c.god ? 0 : c.rendu), 0);
}

/**
 * Ce qui reste à miser aujourd'hui pendant que des statères tombent : le plus petit de ce que dit l'état du casino et de ce
 * que dit le dernier coup du serveur, qui compte déjà les lâchers en route. `null` : pas de plafond du jour (depuis le
 * 27 novembre 2026) ; un `null` n'est jamais lu comme 0.
 */
export function resteDesLachers(reste: number | null, dernier: { reste_du_jour: number | null } | null, enRoute: number): number | null {
  const vu = dernier && enRoute > 0 ? dernier.reste_du_jour : null;
  if (vu === null) return reste;
  return reste === null ? vu : Math.min(reste, vu);
}

/* ---------- La cadence des lâchers ---------- */

/**
 * Les lâchers permis par minute. Le serveur compte toutes les actions d'un compte sur le site, 30 par minute au plus
 * (`internal.limit_exceeded`) : la palissade en garde 5 pour le reste (la boutique, le marché…). Une chute dure environ
 * 3,5 secondes ; sans cette limite, des jetons lâchés à la suite épuiseraient la minute de tout le site.
 */
export const LACHERS_PAR_MINUTE = 25;
/** Un lâcher est-il permis à l'instant `maintenant` (ms), d'après les heures des lâchers déjà envoyés ? */
export function lacherPermis(heures: readonly number[], maintenant: number): boolean {
  return heures.filter((h) => maintenant - h < 60_000).length < LACHERS_PAR_MINUTE;
}

/* ---------- Les règles en mots, d'après celles du serveur ---------- */

const FOIS_EN_MOTS: Readonly<Record<DixiemesDUneCoupe, string>> = { 190: "19 fois", 40: "4 fois", 15: "une fois et demie", 5: "la moitié", 2: "le cinquième" };
/** Ce que paient les neuf coupes, de gauche à droite : « 19 fois la mise, 4 fois, une fois et demie, … ». */
export function coupesEnMots(): string {
  return DIXIEMES_DES_COUPES.map((d, k) => FOIS_EN_MOTS[d as DixiemesDUneCoupe] + (k === 0 ? " la mise" : "")).join(", ");
}
/** Combien de fois le statère tombe dans chaque coupe sur 256 lâchers : « 1 fois, 8 fois, … et 1 fois ». */
export function chancesEnMots(): string {
  const m = CHANCES_DES_COUPES.map((c) => `${c} fois`);
  return `${m.slice(0, -1).join(", ")} et ${m[m.length - 1]}`;
}
