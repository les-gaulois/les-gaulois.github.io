/**
 * La toile de « La loterie » de « Mon Gaulois » (`Loterie.tsx`) : le dessin de la scène, sortie de l'écran le 21 novembre
 * 2026 pour que son dessin se retouche à part. Les trois marches des lots, où chaque gagnant paraît devant sa bannière
 * (« le podium d'abord », choix du pilote), puis la ligne des parts en ruban, sans or pour les billets. Rien n'y est décidé :
 * le billet tiré est celui que le serveur a noté.
 *
 * Le podium est en pixels depuis le même jour (dessin de Claude Fable 5.2, pièces dans `src/lib/jeu/loterie-pieces.ts`) :
 * trois socles qui se touchent, l'or le plus haut ; sur chacun le tableau du gagnant, sa médaille au coin, son nom sur la
 * plaque, et le lot dessous, la pièce du village devant le gain et un petit booster par booster gagné.
 */
import { GAULOIS as PLACE_DU_GAULOIS, HAUTEUR as DECOR_HAUTEUR, LARGEUR as DECOR_LARGEUR } from "../../../supabase/functions/code-discord/decors/commun";
import { casesDuStatere } from "../../../supabase/functions/code-discord/statere";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, lireTenue } from "../../lib/gaulois";
import { POCHETTES_GAGNEES, type LotDeLoterie, type PartDeLoterie, type PochetteGagnee } from "../../lib/village/contrat";
import { ecrire as ecrireEnPixels, nombreEcrit } from "../../lib/jeu/ecriture";
import { MINI_BOOSTER_HAUTEUR, MINI_BOOSTER_LARGEUR } from "../../lib/jeu/loterie-dessins";
import { MEDAILLE_HAUTEUR, MEDAILLE_LARGEUR, METAUX, SOCLE, SOCLE_DALLE, SOCLE_PIED, SOCLE_PLAQUE, medaille, petitBooster, socle } from "../../lib/jeu/loterie-pieces";
import { PAL } from "../../lib/jeu/palette";
import type { Planche } from "../../lib/jeu/planche";
import { NOMS_DES_RANGS, abscisseDuBillet, dispositionDeLaJauge, etatDuTirage, gagnants, lisse, pointeDeLaJauge, type CadreDeJauge, type Rang } from "../../lib/village/loterie";

/* ---------- Les dessins ---------- */

/** Les couleurs des lots : celles des médailles. L'écriture y reste le marine de la page claire : les faces sont claires. */
const MEDAILLES = METAUX;
const MARINE = "#0a1230";

/** Une grille de cases (« #rrggbb » ou vide) peinte une fois, à une case par pixel. */
export function toileDe(cases: readonly (string | null)[], largeur: number, hauteur: number): HTMLCanvasElement | null {
  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext("2d");
  if (!contexte) return null;
  const image = contexte.createImageData(largeur, hauteur);
  cases.forEach((couleur, i) => {
    if (!couleur || !/^#[0-9a-f]{6}$/i.test(couleur)) return;
    const n = parseInt(couleur.slice(1), 16);
    image.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4);
  });
  contexte.putImageData(image, 0, 0);
  return toile;
}

export interface Dessin {
  toile: HTMLCanvasElement;
  /** La dernière rangée dessinée : les pieds. */
  bas: number;
}

/** Le Gaulois d'une part ; `null` si sa tenue est illisible. */
export function dessinDuGaulois(tenue: unknown): Dessin | null {
  let cases: (string | null)[] | null = null;
  try {
    const lue = lireTenue(tenue);
    cases = lue ? casesDuGaulois(lue) : null;
  } catch {
    return null;
  }
  if (!cases) return null;
  let bas = -1;
  cases.forEach((couleur, i) => {
    if (couleur) bas = Math.max(bas, Math.floor(i / GAULOIS_LARGEUR));
  });
  const toile = bas < 0 ? null : toileDe(cases, GAULOIS_LARGEUR, GAULOIS_HAUTEUR);
  return toile ? { toile, bas } : null;
}

/** Une planche du kit, peinte une fois sur une toile, à une case par pixel. */
function toileDeLaPlanche(p: Planche): HTMLCanvasElement | null {
  const toile = document.createElement("canvas");
  toile.width = p.width;
  toile.height = p.height;
  const contexte = toile.getContext("2d");
  if (!contexte) return null;
  const image = contexte.createImageData(p.width, p.height);
  image.data.set(p.data);
  contexte.putImageData(image, 0, 0);
  return toile;
}

/** Les pièces du podium, dessinées une fois par page avec les dessins du jeu. */
export interface Images {
  /** La pièce du village, à 16 cases. */
  piece: HTMLCanvasElement | null;
  /** Le petit booster de chaque sorte gagnée. */
  boosters: Readonly<Record<PochetteGagnee, HTMLCanvasElement | null>>;
  medailles: Readonly<Record<Rang, HTMLCanvasElement | null>>;
  /** Un Gaulois en tenue de départ : sa forme seule dit la place du gagnant, avant le tirage. */
  gaulois: HTMLCanvasElement | null;
  /** Ce qui dépend d'une mesure ou d'un chiffre : les socles, les gains écrits, la forme teintée. */
  autres: Map<string, HTMLCanvasElement | null>;
}
let IMAGES: Images | null = null;
export function images(): Images {
  if (IMAGES) return IMAGES;
  IMAGES = {
    piece: toileDe(casesDuStatere(16), 16, 16),
    boosters: Object.fromEntries(POCHETTES_GAGNEES.map((sorte) => [sorte, toileDeLaPlanche(petitBooster(sorte))])) as Record<PochetteGagnee, HTMLCanvasElement | null>,
    medailles: { 1: toileDeLaPlanche(medaille(1)), 2: toileDeLaPlanche(medaille(2)), 3: toileDeLaPlanche(medaille(3)) },
    gaulois: dessinDuGaulois(TENUE_DE_DEPART)?.toile ?? null,
    autres: new Map(),
  };
  return IMAGES;
}
function autre(img: Images, cle: string, fabriquer: () => HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!img.autres.has(cle)) img.autres.set(cle, fabriquer());
  return img.autres.get(cle) ?? null;
}
/** La forme du Gaulois, d'une seule couleur de la page. */
function formeDuGaulois(img: Images, couleur: string): HTMLCanvasElement | null {
  return autre(img, `forme:${couleur}`, () => {
    if (!img.gaulois) return null;
    const toile = document.createElement("canvas");
    toile.width = GAULOIS_LARGEUR;
    toile.height = GAULOIS_HAUTEUR;
    const contexte = toile.getContext("2d");
    if (!contexte) return null;
    contexte.drawImage(img.gaulois, 0, 0);
    contexte.globalCompositeOperation = "source-in";
    contexte.fillStyle = couleur;
    contexte.fillRect(0, 0, GAULOIS_LARGEUR, GAULOIS_HAUTEUR);
    return toile;
  });
}

/** Les mesures de la scène : les trois marches du podium en haut, la ligne des parts dessous. */
export interface Mesures {
  largeur: number;
  hauteur: number;
  carte: {
    /** La largeur d'une marche, et le bord gauche de chacune : elles se touchent. */
    l: number;
    x: Readonly<Record<Rang, number>>;
    /** Le bas des trois socles. */
    base: number;
    /** Les pixels d'une case des pièces (socle, médaille, boosters, gain) : un nombre entier. */
    p: number;
    /** La hauteur de chaque socle, en cases : l'or le plus haut. */
    socle: Readonly<Record<Rang, number>>;
    /** Le lot sur une rangée (la pièce, le gain, les boosters) ou sur deux. */
    rangees: 1 | 2;
    /** Le tableau du gagnant : sa bannière à `echelle` pixels par case, rognée de `rogne` cases de chaque côté, lui devant. */
    echelle: number;
    rogne: number;
    /** La taille du nom, sur la plaque du socle. */
    nom: number;
  };
  ligne: { cadre: CadreDeJauge; y: number; h: number; bas: number };
}
/** L'épaisseur du cadre du tableau, en cases des pièces : un cerne, le métal, un cerne. */
const CADRE = 3;
/** La taille de la scène selon la place : 0 le téléphone, 1 l'ordinateur, 2 le grand écran. */
export type Taille = 0 | 1 | 2;
export const tailleDe = (largeur: number): Taille => (largeur >= 1100 ? 2 : largeur >= 620 ? 1 : 0);
export const MESURES: Readonly<Record<Taille, Mesures>> = {
  2: {
    largeur: 1200,
    hauteur: 624,
    carte: { l: 392, x: { 2: 12, 1: 404, 3: 796 }, base: 388, p: 2, socle: { 1: 61, 2: 53, 3: 45 }, rangees: 1, echelle: 3, rogne: 4, nom: 15 },
    ligne: { cadre: { x: 40, largeur: 1120, joint: 5, buste: 70 }, y: 522, h: 34, bas: 512 },
  },
  1: {
    largeur: 800,
    hauteur: 566,
    carte: { l: 262, x: { 2: 7, 1: 269, 3: 531 }, base: 336, p: 2, socle: { 1: 76, 2: 70, 3: 64 }, rangees: 2, echelle: 2, rogne: 4, nom: 13 },
    ligne: { cadre: { x: 30, largeur: 740, joint: 4, buste: 66 }, y: 468, h: 32, bas: 458 },
  },
  // Au téléphone, la bannière est rognée autour du gagnant pour qu'il paraisse à deux pixels par case, comme sur la ligne :
  // le podium y est plus haut qu'avant, et la ligne des parts descend d'autant.
  0: {
    largeur: 420,
    hauteur: 554,
    carte: { l: 138, x: { 2: 3, 1: 141, 3: 279 }, base: 326, p: 2, socle: { 1: 74, 2: 69, 3: 64 }, rangees: 2, echelle: 2, rogne: 31, nom: 11 },
    ligne: { cadre: { x: 16, largeur: 388, joint: 3, buste: 66 }, y: 458, h: 28, bas: 448 },
  },
};

/** Les couleurs et les polices de la page, lues dans ses jetons au moment de peindre : le clair, le sombre, le thème rouge. */
export interface Encres {
  ecriture: string;
  discret: string;
  filet: string;
  leger: string;
  bleu: string;
  /** Le second bleu du ruban : le bleu de la page, éclairci. */
  clair: string;
  page: string;
  surface: string;
  surface2: string;
  /** La police des titres (le nom des lots). */
  police: string;
  /** La police du texte courant : un nom ne s'écrit jamais en onciale. */
  sans: string;
}
/** Un bleu éclairci d'un tiers vers le blanc ; la couleur d'origine si elle ne s'écrit pas « #rrggbb ». */
function eclaircir(couleur: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(couleur);
  if (!m) return couleur;
  const n = parseInt(m[1]!, 16);
  const vers = (v: number) => Math.round(v + (255 - v) * 0.36);
  return `rgb(${vers((n >> 16) & 255)} ${vers((n >> 8) & 255)} ${vers(n & 255)})`;
}
export function encresDe(element: Element): Encres {
  const style = getComputedStyle(element);
  const jeton = (nom: string, secours: string) => style.getPropertyValue(nom).trim() || secours;
  const bleu = jeton("--color-blue", "#0b5fff");
  return {
    ecriture: jeton("--ecriture", MARINE),
    discret: jeton("--color-muted", "#4a5677"),
    filet: jeton("--color-line-strong", "#7a88b4"),
    leger: jeton("--color-line", "#d5dcee"),
    bleu,
    clair: eclaircir(bleu),
    page: jeton("--color-navy", "#ffffff"),
    surface: jeton("--color-surface", "#f5f7fc"),
    surface2: jeton("--color-surface-2", "#e6ecf9"),
    police: jeton("--font-display", "system-ui, sans-serif"),
    sans: jeton("--font-sans", "system-ui, sans-serif"),
  };
}

interface Options {
  align?: CanvasTextAlign;
  graisse?: number;
  /** La largeur au-delà de laquelle le texte est coupé, avec des points de suspension. */
  max?: number;
  /** Un texte centré près d'un bord glisse vers l'intérieur plutôt que d'être rogné. */
  bords?: readonly [number, number];
}
function ecrire(c: CanvasRenderingContext2D, police: string, texte: string, x: number, y: number, taille: number, couleur: string, o: Options = {}) {
  c.font = `${o.graisse ?? 600} ${taille}px ${police}`;
  c.fillStyle = couleur;
  c.textAlign = o.align ?? "center";
  c.textBaseline = "middle";
  let ecrit = texte;
  if (o.max !== undefined && c.measureText(ecrit).width > o.max) {
    while (ecrit.length > 1 && c.measureText(`${ecrit}…`).width > o.max) ecrit = ecrit.slice(0, -1);
    ecrit = `${ecrit.trimEnd()}…`;
  }
  let ou = x;
  if (o.bords && (o.align ?? "center") === "center") {
    const demi = c.measureText(ecrit).width / 2;
    ou = Math.min(Math.max(x, o.bords[0] + demi), o.bords[1] - demi);
  }
  c.fillText(ecrit, ou, y);
}

/** Un cadre de couleur cerné d'écriture, pour se lire sur la page. */
function cerne(c: CanvasRenderingContext2D, encres: Encres, x: number, y: number, largeur: number, hauteur: number, couleur: string, rayon: number) {
  c.beginPath();
  c.roundRect(x, y, largeur, hauteur, rayon);
  c.strokeStyle = encres.ecriture;
  c.lineWidth = 7;
  c.stroke();
  c.strokeStyle = couleur;
  c.lineWidth = 4;
  c.stroke();
}

/**
 * Les boosters d'un lot à la suite, en cases : ceux d'une même sorte se chevauchent, pour se compter sans chiffre ; d'une
 * sorte à l'autre, un pas plus grand, qui se resserre si la marche est étroite.
 */
const MEME_SORTE = 5;
function largeurDesBoosters(lot: LotDeLoterie, pas: number): number {
  let largeur = 0;
  let sortes = 0;
  for (const sorte of POCHETTES_GAGNEES) {
    const n = Math.max(0, Math.floor(lot.pochettes[sorte]));
    if (n === 0) continue;
    largeur += (n - 1) * MEME_SORTE + (sortes++ > 0 ? pas : MINI_BOOSTER_LARGEUR);
  }
  return largeur;
}
function pasDesBoosters(lot: LotDeLoterie, place: number): number {
  let pas = MINI_BOOSTER_LARGEUR + 2;
  while (pas > MEME_SORTE + 3 && largeurDesBoosters(lot, pas) > place) pas--;
  return pas;
}
function peindreLesPoches(c: CanvasRenderingContext2D, img: Images, lot: LotDeLoterie, x: number, y: number, p: number, pas: number) {
  let px = x;
  let sortes = 0;
  for (const sorte of POCHETTES_GAGNEES) {
    const n = Math.max(0, Math.floor(lot.pochettes[sorte]));
    if (n === 0) continue;
    if (sortes++ > 0) px += (pas - MINI_BOOSTER_LARGEUR) * p;
    const dessin = img.boosters[sorte];
    for (let i = 0; i < n; i++) {
      if (dessin) c.drawImage(dessin, px, y, MINI_BOOSTER_LARGEUR * p, MINI_BOOSTER_HAUTEUR * p);
      px += (i < n - 1 ? MEME_SORTE : MINI_BOOSTER_LARGEUR) * p;
    }
  }
}

/** Le lot posé sur le corps d'un socle : la pièce du village devant le gain écrit en pixels, puis les boosters. */
function peindreLeLot(c: CanvasRenderingContext2D, img: Images, lot: LotDeLoterie, k: Mesures["carte"], x: number, haut: number, bas: number) {
  const p = k.p;
  const place = k.l / p - 12;
  const gain = lot.gain > 0 ? autre(img, `gain:${lot.gain}`, () => toileDeLaPlanche(ecrireEnPixels(nombreEcrit(lot.gain), PAL.q, PAL.k))) : null;
  const largeurDuGain = gain ? 16 + 3 + gain.width : 0;
  const pas = pasDesBoosters(lot, k.rangees === 1 ? place - largeurDuGain - 8 : place);
  const largeurDesPoches = largeurDesBoosters(lot, pas);
  const peindreLeGain = (gx: number, gy: number) => {
    if (!gain) return;
    if (img.piece) c.drawImage(img.piece, gx, gy, 16 * p, 16 * p);
    c.drawImage(gain, gx + 19 * p, gy + 4 * p, gain.width * p, gain.height * p);
  };
  const milieu = x + k.l / 2;
  const entier = (v: number) => Math.round(v / p) * p;
  if (k.rangees === 1) {
    const ecart = gain && largeurDesPoches > 0 ? 8 : 0;
    const gx = entier(milieu - ((largeurDuGain + ecart + largeurDesPoches) * p) / 2);
    const cy = (haut + bas) / 2;
    peindreLeGain(gx, entier(cy - 8 * p));
    peindreLesPoches(c, img, lot, gx + (largeurDuGain + ecart) * p, entier(cy - (MINI_BOOSTER_HAUTEUR * p) / 2), p, pas);
    return;
  }
  const ecart = gain && largeurDesPoches > 0 ? 3 : 0;
  const hauteur = (gain ? 16 : 0) + ecart + (largeurDesPoches > 0 ? MINI_BOOSTER_HAUTEUR : 0);
  const y = entier((haut + bas) / 2 - (hauteur * p) / 2);
  peindreLeGain(entier(milieu - (largeurDuGain * p) / 2), y);
  peindreLesPoches(c, img, lot, entier(milieu - (largeurDesPoches * p) / 2), y + ((gain ? 16 : 0) + ecart) * p, p, pas);
}

/** Le cadre du tableau, en pixels : plein et du métal du rang quand le gagnant y est, en pointillés avant. */
function peindreLeCadre(c: CanvasRenderingContext2D, encres: Encres, tb: { x: number; y: number; l: number; h: number }, p: number, rang: Rang | null) {
  const anneau = (marge: number, epaisseur: number, couleur: string) => {
    c.fillStyle = couleur;
    c.fillRect(tb.x - marge, tb.y - marge, tb.l + 2 * marge, epaisseur);
    c.fillRect(tb.x - marge, tb.y + tb.h + marge - epaisseur, tb.l + 2 * marge, epaisseur);
    c.fillRect(tb.x - marge, tb.y - marge, epaisseur, tb.h + 2 * marge);
    c.fillRect(tb.x + tb.l + marge - epaisseur, tb.y - marge, epaisseur, tb.h + 2 * marge);
  };
  if (rang !== null) {
    const m = MEDAILLES[rang];
    anneau(CADRE * p, CADRE * p, PAL.k);
    anneau((CADRE - 1) * p, p, m.face);
    c.fillStyle = m.eclat;
    c.fillRect(tb.x - (CADRE - 1) * p, tb.y - (CADRE - 1) * p, tb.l + (2 * CADRE - 3) * p, p);
    c.fillRect(tb.x - (CADRE - 1) * p, tb.y - (CADRE - 1) * p, p, tb.h + (2 * CADRE - 3) * p);
    c.fillStyle = m.ombre;
    c.fillRect(tb.x - (CADRE - 2) * p, tb.y + tb.h + (CADRE - 2) * p, tb.l + (2 * CADRE - 3) * p, p);
    c.fillRect(tb.x + tb.l + (CADRE - 2) * p, tb.y - (CADRE - 2) * p, p, tb.h + (2 * CADRE - 3) * p);
    return;
  }
  // Les pointillés : des tirets de trois cases, une sur deux, au milieu de l'épaisseur du cadre.
  c.fillStyle = encres.filet;
  const m = (CADRE - 1) * p;
  const tiret = 3 * p;
  for (let x = tb.x - m; x < tb.x + tb.l + m - p; x += 2 * tiret) {
    const l = Math.min(tiret, tb.x + tb.l + m - x);
    c.fillRect(x, tb.y - m, l, p);
    c.fillRect(x, tb.y + tb.h + m - p, l, p);
  }
  for (let y = tb.y - m; y < tb.y + tb.h + m - p; y += 2 * tiret) {
    const h = Math.min(tiret, tb.y + tb.h + m - y);
    c.fillRect(tb.x - m, y, p, h);
    c.fillRect(tb.x + tb.l + m - p, y, p, h);
  }
}

/** Ce que la scène dessine. */
export interface Scene {
  parts: readonly PartDeLoterie[];
  lots: readonly LotDeLoterie[];
  ordre: readonly number[];
  avecBuste: ReadonlySet<number>;
  dessins: ReadonlyMap<number, Dessin>;
  /** La bannière de chaque gagnant qui en montre une, par l'indice de sa part. */
  fonds: ReadonlyMap<number, HTMLCanvasElement>;
}

/**
 * Peint la scène à l'instant `t` du tirage (en secondes ; `Infinity` : le bilan), ou, sans tirage (`t` null), les lots et
 * les parts du tirage à venir. Rien n'est décidé ici : le billet tiré est celui que le serveur a noté.
 */
export function peindreLaScene(c: CanvasRenderingContext2D, m: Mesures, encres: Encres, img: Images, s: Scene, t: number | null) {
  const { parts } = s;
  const podium = t === null ? [] : gagnants(parts);
  const etat = t === null ? null : etatDuTirage(t, podium.length);
  const fermetures = parts.map(() => 0);
  if (etat) podium.forEach((g, k) => (fermetures[g.index] = etat.fermetures[k] ?? 0));
  const k = m.carte;
  // Le tableau du gagnant : sa bannière, rognée sur les côtés, posée sur son socle, le cadre entre les deux.
  const hautDuSocle = (rang: Rang) => k.base - k.socle[rang] * k.p;
  const tableau = (rang: Rang) => {
    const l = (DECOR_LARGEUR - 2 * k.rogne) * k.echelle;
    const h = DECOR_HAUTEUR * k.echelle;
    return { x: k.x[rang] + (k.l - l) / 2, y: hautDuSocle(rang) - CADRE * k.p - h, l, h };
  };
  const placeDuGaulois = (PLACE_DU_GAULOIS.x - k.rogne) * k.echelle;
  c.imageSmoothingEnabled = false;

  // Les trois marches : le socle et son lot, puis le tableau du gagnant, vide et en pointillés tant qu'il n'est pas tiré.
  for (const rang of [2, 1, 3] as const) {
    const lot = s.lots.find((l) => l.rang === rang);
    if (!lot) continue;
    const x = k.x[rang];
    const p = k.p;
    const n = podium.findIndex((g) => g.rang === rang);
    const g = n < 0 ? null : podium[n]!;
    const arrivee = g && etat ? (etat.montees[n] ?? 0) : 0;
    const tb = tableau(rang);
    const sy = hautDuSocle(rang);
    const dessinDuSocle = autre(img, `socle:${rang}:${k.l / p}:${k.socle[rang]}`, () => toileDeLaPlanche(socle(rang, k.l / p, k.socle[rang])));
    if (dessinDuSocle) c.drawImage(dessinDuSocle, x, sy, k.l, k.socle[rang] * p);
    peindreLeLot(c, img, lot, k, x, sy + (SOCLE_DALLE + SOCLE_PLAQUE) * p, k.base - SOCLE_PIED * p);
    c.save();
    c.beginPath();
    c.rect(tb.x, tb.y, tb.l, tb.h);
    c.clip();
    c.fillStyle = encres.surface;
    c.fillRect(tb.x, tb.y, tb.l, tb.h);
    if (g && arrivee > 0) {
      // Le gagnant paraît devant sa bannière, comme sur /gaulois ; sans bannière, devant un fond uni.
      c.globalAlpha = lisse((arrivee - 0.45) / 0.55);
      const fond = s.fonds.get(g.index);
      if (fond) {
        const cases = fond.width / DECOR_LARGEUR;
        c.drawImage(fond, k.rogne * cases, 0, fond.width - 2 * k.rogne * cases, fond.height, tb.x, tb.y, tb.l, tb.h);
      } else {
        c.fillStyle = encres.surface2;
        c.fillRect(tb.x, tb.y, tb.l, tb.h);
      }
      const dessin = s.dessins.get(g.index);
      if (dessin) c.drawImage(dessin.toile, tb.x + placeDuGaulois, tb.y + PLACE_DU_GAULOIS.y * k.echelle, GAULOIS_LARGEUR * k.echelle, GAULOIS_HAUTEUR * k.echelle);
      c.globalAlpha = 1;
    } else {
      // La place du gagnant : la forme d'un Gaulois, sans un mot.
      const forme = formeDuGaulois(img, encres.leger);
      if (forme) c.drawImage(forme, tb.x + placeDuGaulois, tb.y + PLACE_DU_GAULOIS.y * k.echelle, GAULOIS_LARGEUR * k.echelle, GAULOIS_HAUTEUR * k.echelle);
    }
    c.restore();
    const arrive = g !== null && arrivee >= 1;
    peindreLeCadre(c, encres, tb, p, arrive ? rang : null);
    // La médaille pend au coin du tableau : le rang se lit avant comme après le tirage.
    const dessinDeLaMedaille = img.medailles[rang];
    if (dessinDeLaMedaille) c.drawImage(dessinDeLaMedaille, tb.x - (CADRE - 1) * p, tb.y - (CADRE + 2) * p, MEDAILLE_LARGEUR * p, MEDAILLE_HAUTEUR * p);
    // Le nom, sur la plaque du socle : dans la police du texte, un pseudo peut porter des signes que les pixels ne tracent pas.
    if (g && arrive) ecrire(c, encres.sans, g.part.nom, x + k.l / 2, sy + (SOCLE_DALLE + SOCLE_PLAQUE / 2) * p, k.nom, SOCLE.ecriture, { graisse: 700, max: k.l - 16 * p });
  }

  // La ligne des parts : un seul ruban arrondi aux deux bouts, deux bleus en alternance, une lumière en haut.
  const { cadre, y: Y, h: H, bas: BAS } = m.ligne;
  const segments = dispositionDeLaJauge(parts, s.ordre, fermetures, cadre, s.avecBuste);
  const vus = segments.filter((seg) => seg.ouverture > 0.01 && seg.largeur > 0);
  const joint = vus.length > 1 ? vus[1]!.x - vus[0]!.x - vus[0]!.largeur : 0;
  c.save();
  c.beginPath();
  c.roundRect(cadre.x, Y + 2, cadre.largeur, H - 4, (H - 4) / 2);
  c.clip();
  vus.forEach((seg, n) => {
    c.globalAlpha = seg.ouverture;
    c.fillStyle = n % 2 ? encres.clair : encres.bleu;
    c.fillRect(seg.x - joint / 2, Y, seg.largeur + joint, H);
  });
  c.globalAlpha = 1;
  c.fillStyle = encres.page;
  for (const seg of vus.slice(1)) c.fillRect(seg.x - joint / 2 - 1, Y, 2, H);
  c.fillStyle = "rgb(255 255 255 / 0.22)";
  c.fillRect(cadre.x, Y + 2, cadre.largeur, 5);
  c.restore();

  // Les Gaulois au-dessus de leur part. Les noms sur deux rangées, une sur deux, d'après la place du Gaulois parmi tous
  // ceux de la ligne, ouverts ou non : un nom ne change pas de rangée quand la part d'un voisin se referme.
  let place = 0;
  const noms = new Map<number, { x: number; rangee: number }>();
  for (const seg of segments) {
    if (seg.buste === null) continue;
    const rangee = place++ % 2;
    if (seg.ouverture > 0.01 && seg.largeur > 0) noms.set(seg.index, { x: seg.buste, rangee });
  }
  const largeurDuNom = (index: number): number => {
    const nom = noms.get(index)!;
    let libre = 2 * cadre.buste;
    for (const [autre, voisin] of noms) if (autre !== index && voisin.rangee === nom.rangee) libre = Math.min(libre, Math.abs(voisin.x - nom.x));
    return Math.max(24, libre - 10);
  };
  const enVol = new Set<number>();
  if (etat) podium.forEach((g, n) => (etat.montees[n] ?? 0) > 0 && enVol.add(g.index));
  for (const seg of segments) {
    if (seg.ouverture <= 0.01 || seg.largeur <= 0 || seg.buste === null) continue;
    const part = parts[seg.index]!;
    c.globalAlpha = seg.ouverture;
    c.strokeStyle = encres.filet;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(seg.buste, BAS);
    c.lineTo(seg.x + seg.largeur / 2, Y - 2);
    c.stroke();
    const dessin = s.dessins.get(seg.index);
    if (dessin && !enVol.has(seg.index)) c.drawImage(dessin.toile, 8, 0, 32, 38, Math.round(seg.buste - 32), BAS - 76, 64, 76);
    ecrire(c, encres.sans, part.nom, seg.buste, BAS - 76 - (noms.get(seg.index)?.rangee === 1 ? 26 : 11), 13, part.moi ? encres.ecriture : encres.discret, { graisse: part.moi ? 700 : 500, max: largeurDuNom(seg.index), bords: [2, m.largeur - 2] });
    c.globalAlpha = 1;
  }

  if (!etat) return;
  podium.forEach((g, n) => {
    const seg = segments.find((x) => x.index === g.index);
    if (!seg) return;
    const medaille = MEDAILLES[g.rang];
    const arrivee = etat.montees[n] ?? 0;
    if (etat.arrives[n] && seg.ouverture > 0.01) {
      c.globalAlpha = seg.ouverture;
      cerne(c, encres, seg.x - 3, Y - 3, seg.largeur + 6, H + 6, medaille.face, H / 2);
      c.globalAlpha = 1;
    }
    // Le gagnant quitte la ligne et rejoint son tableau, où il se fond dans sa bannière.
    const dessin = s.dessins.get(g.index);
    if (dessin && seg.buste !== null && arrivee > 0 && arrivee < 1) {
      const tb = tableau(g.rang);
      const u = lisse(arrivee);
      const e = 2 + (k.echelle - 2) * u;
      const x = seg.buste + (tb.x + placeDuGaulois + (GAULOIS_LARGEUR / 2) * k.echelle - seg.buste) * u;
      const y = BAS + (tb.y + (PLACE_DU_GAULOIS.y + 38) * k.echelle - BAS) * u - Math.sin(Math.PI * arrivee) * 50;
      c.globalAlpha = 1 - lisse((arrivee - 0.45) / 0.55);
      c.drawImage(dessin.toile, 8, 0, 32, 38, x - 16 * e, y - 38 * e, 32 * e, 38 * e);
      c.globalAlpha = 1;
    }
    const avancee = etat.pointes[n];
    const visible = etat.visibles[n] ?? 0;
    if (avancee === null || avancee === undefined || visible <= 0) return;
    // L'épingle : une pastille à la couleur du lot, sa pointe vers la ligne.
    const px = pointeDeLaJauge(abscisseDuBillet(seg, g.part, g.billet), cadre, avancee);
    const py = Y + H + 30;
    c.globalAlpha = visible;
    c.beginPath();
    c.moveTo(px, Y + H + 4);
    c.lineTo(px + 9, py - 8);
    c.arc(px, py, 13, -0.7, Math.PI + 0.7);
    c.closePath();
    c.fillStyle = medaille.face;
    c.fill();
    c.strokeStyle = encres.ecriture;
    c.lineWidth = 2;
    c.lineJoin = "round";
    c.stroke();
    ecrire(c, encres.sans, String(g.rang), px, py + 1, 14, MARINE, { graisse: 700 });
    ecrire(c, encres.police, NOMS_DES_RANGS[g.rang], px, py + 27, 12, encres.ecriture, { graisse: 700 });
    c.globalAlpha = 1;
  });
}
