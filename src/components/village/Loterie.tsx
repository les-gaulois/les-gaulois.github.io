import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { GAULOIS as PLACE_DU_GAULOIS, HAUTEUR as DECOR_HAUTEUR, LARGEUR as DECOR_LARGEUR } from "../../../supabase/functions/code-discord/decors/commun";
import { casesDuStatere } from "../../../supabase/functions/code-discord/statere";
import { ServerError, call } from "../../lib/compte/api";
import { motionAllowed } from "../../lib/fx/motion";
import type { CarteDeScene } from "../../lib/jeu/boosters";
import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";
import { nombreEcrit } from "../../lib/jeu/ecriture";
import { carteDuBoosterDeLoterie, miniBooster } from "../../lib/jeu/loterie-dessins";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import { CLE_MODELE, GAULOIS_HAUTEUR, GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, lireTenue } from "../../lib/gaulois";
import { addDays } from "../../lib/time";
import { POCHETTES_GAGNEES, PREMIER_TIRAGE_LOTERIE, TICKET_D_OR, type BoosterOuvert, type LotDeLoterie, type MaLoterie, type PartDeLoterie, type PochetteGagnee } from "../../lib/village/contrat";
import { instant, nombre, pourcent, stateres } from "../../lib/village/ecran-boutique";
import { boostersGagnesEnMots } from "../../lib/village/etal";
import {
  NOMS_DES_RANGS,
  RANGS,
  abscisseDuBillet,
  apresLOuverture,
  billetsDe,
  billetsEnMots,
  boosterSuivant,
  bustesDeLaJauge,
  dispositionDeLaJauge,
  dureeDuTirage,
  etatDuTirage,
  gagnants,
  jourCourt,
  jourDeLaRangee,
  jourDeParis,
  jourEnMots,
  lireBoosterOuvert,
  lireLoterie,
  lisse,
  maPart,
  messageDuRefusDuBooster,
  ordreDeLaJauge,
  partEnPourcent,
  pochettesDuLot,
  pointeDeLaJauge,
  semaineDesBoosters,
  semaineDuTirage,
  totalDesBillets,
  type CadreDeJauge,
  type EtatDuJour,
  type Rang,
} from "../../lib/village/loterie";
import { MODELES } from "../../lib/village/modeles";
import { Loading, Problem, messageOf } from "../compte/common";
import { Etiquette, Px } from "../jeu/Pixels";
import { charger as chargerLesBannieres } from "./Bannieres";
import { casesDeLaPochetteBannieres } from "./PochetteBannieresDessin";
import { POCHETTE_COTE, casesDeLaPochette } from "./PochetteDessin";
import { casesDeLaPochetteFamiliers } from "./PochetteFamiliersDessin";
import { casesDeLaPochetteDeStateres } from "./PochetteStateres";
import { BoutonDesBoosters, FenetreDuBooster, PaquetEnImage, RefusDuBooster, ResultatDuBooster } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
/** Refus après lesquels réessayer ne sert à rien. */
const SANS_RETOUR = new Set(["not_signed_in", "suspended", "not_validated"]);
/** Le dernier tirage dont ce navigateur a vu l'animation : elle ne se joue seule qu'une fois. */
const CLE_VU = "gal-loterie-vu";

/* ---------- Les dessins ---------- */

/** Les couleurs des lots : la face et son ombre. L'écriture y reste le marine de la page claire : les faces sont claires. */
const MEDAILLES: Readonly<Record<Rang, { face: string; ombre: string }>> = {
  1: { face: "#f2b632", ombre: "#a86d0c" },
  2: { face: "#c9d1e6", ombre: "#7a88b4" },
  3: { face: "#d98a4e", ombre: "#8f4f1f" },
};
const MARINE = "#0a1230";

/** Une grille de cases (« #rrggbb » ou vide) peinte une fois, à une case par pixel. */
function toileDe(cases: readonly (string | null)[], largeur: number, hauteur: number): HTMLCanvasElement | null {
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

interface Dessin {
  toile: HTMLCanvasElement;
  /** La dernière rangée dessinée : les pieds. */
  bas: number;
}

/** Le Gaulois d'une part ; `null` si sa tenue est illisible. */
function dessinDuGaulois(tenue: unknown): Dessin | null {
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

/** La pièce et les pochettes des lots, dessinées une fois par page avec les dessins du site. */
interface Images {
  piece: HTMLCanvasElement | null;
  pochettes: Partial<Record<PochetteGagnee, HTMLCanvasElement | null>>;
  /** La pochette des Gaulois uniques n'a pas de sac sur le site : la tête d'un Gaulois unique la dit. */
  unique: HTMLCanvasElement | null;
}
let IMAGES: Images | null = null;
function images(): Images {
  if (IMAGES) return IMAGES;
  const unique = MODELES[0] ? dessinDuGaulois({ ...TENUE_DE_DEPART, [CLE_MODELE]: MODELES[0].id }) : null;
  IMAGES = {
    piece: toileDe(casesDuStatere(16), 16, 16),
    pochettes: {
      surprise: toileDe(casesDeLaPochette(), POCHETTE_COTE, POCHETTE_COTE),
      familiers: toileDe(casesDeLaPochetteFamiliers(), POCHETTE_COTE, POCHETTE_COTE),
      bannieres: toileDe(casesDeLaPochetteBannieres(), POCHETTE_COTE, POCHETTE_COTE),
      stateres: toileDe(casesDeLaPochetteDeStateres(), POCHETTE_COTE, POCHETTE_COTE),
    },
    unique: unique?.toile ?? null,
  };
  return IMAGES;
}

/** Les mesures de la scène : les trois cases des lots en haut, la ligne des parts dessous. */
interface Mesures {
  largeur: number;
  hauteur: number;
  carte: {
    l: number;
    h: number;
    x: Readonly<Record<Rang, number>>;
    haut: Readonly<Record<Rang, number>>;
    bande: number;
    titreY: number;
    rang: number;
    gain: number;
    /** Le tableau du gagnant : sa bannière, `echelle` pixels par case, et lui devant. */
    tableauY: number;
    echelle: number;
    nom: number;
    nomY: number;
    pochesY: number;
    poche: number;
    pas: number;
    attente: string;
  };
  ligne: { cadre: CadreDeJauge; y: number; h: number; bas: number };
}
/** La taille de la scène selon la place : 0 le téléphone, 1 l'ordinateur, 2 le grand écran. */
type Taille = 0 | 1 | 2;
const tailleDe = (largeur: number): Taille => (largeur >= 1100 ? 2 : largeur >= 620 ? 1 : 0);
const MESURES: Readonly<Record<Taille, Mesures>> = {
  2: {
    largeur: 1200,
    hauteur: 624,
    carte: { l: 340, h: 314, x: { 2: 60, 1: 430, 3: 800 }, haut: { 1: 8, 2: 30, 3: 50 }, bande: 12, titreY: 40, rang: 26, gain: 24, tableauY: 62, echelle: 2, nom: 15, nomY: 17, pochesY: 262, poche: 1.25, pas: 30, attente: "Le gagnant et sa bannière" },
    ligne: { cadre: { x: 40, largeur: 1120, joint: 5, buste: 70 }, y: 522, h: 34, bas: 512 },
  },
  1: {
    largeur: 800,
    hauteur: 566,
    carte: { l: 256, h: 276, x: { 2: 8, 1: 272, 3: 536 }, haut: { 1: 6, 2: 22, 3: 36 }, bande: 10, titreY: 32, rang: 20, gain: 18, tableauY: 50, echelle: 2, nom: 14, nomY: 15, pochesY: 238, poche: 1, pas: 30, attente: "Le gagnant et sa bannière" },
    ligne: { cadre: { x: 30, largeur: 740, joint: 4, buste: 66 }, y: 468, h: 32, bas: 458 },
  },
  0: {
    largeur: 420,
    hauteur: 452,
    carte: { l: 132, h: 172, x: { 2: 6, 1: 144, 3: 282 }, haut: { 1: 4, 2: 14, 3: 24 }, bande: 8, titreY: 22, rang: 13, gain: 12, tableauY: 34, echelle: 1, nom: 11, nomY: 13, pochesY: 142, poche: 0.75, pas: 22, attente: "Le gagnant" },
    ligne: { cadre: { x: 16, largeur: 388, joint: 3, buste: 66 }, y: 356, h: 28, bas: 346 },
  },
};

/** Les couleurs et les polices de la page, lues dans ses jetons au moment de peindre : le clair, le sombre, le thème rouge. */
interface Encres {
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
function encresDe(element: Element): Encres {
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

/** Les pochettes d'un lot à la suite ; plusieurs de la même sorte se chevauchent, pour se compter sans chiffre. */
function largeurDesPoches(lot: LotDeLoterie, e: number, pas: number): number {
  return POCHETTES_GAGNEES.reduce((somme, sorte) => somme + (lot.pochettes[sorte] > 0 ? ((lot.pochettes[sorte] - 1) * 10 + pas) * e : 0), 0) - (pas - 32) * e;
}
function peindreLesPoches(c: CanvasRenderingContext2D, img: Images, lot: LotDeLoterie, x: number, y: number, e: number, pas: number) {
  let px = x;
  for (const sorte of POCHETTES_GAGNEES) {
    for (let k = 0; k < lot.pochettes[sorte]; k++) {
      const dessin = sorte === "modeles" ? img.unique : img.pochettes[sorte];
      if (dessin && sorte === "modeles") c.drawImage(dessin, 6, 1, 34, 34, px, y, 32 * e, 32 * e);
      else if (dessin) c.drawImage(dessin, px, y, 32 * e, 32 * e);
      px += (k < lot.pochettes[sorte] - 1 ? 10 : pas) * e;
    }
  }
}

/** Ce que la scène dessine. */
interface Scene {
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
function peindreLaScene(c: CanvasRenderingContext2D, m: Mesures, encres: Encres, img: Images, s: Scene, t: number | null) {
  const { parts } = s;
  const podium = t === null ? [] : gagnants(parts);
  const etat = t === null ? null : etatDuTirage(t, podium.length);
  const fermetures = parts.map(() => 0);
  if (etat) podium.forEach((g, k) => (fermetures[g.index] = etat.fermetures[k] ?? 0));
  const k = m.carte;
  const tableau = (rang: Rang) => ({ x: k.x[rang] + (k.l - DECOR_LARGEUR * k.echelle) / 2, y: k.haut[rang] + k.tableauY, l: DECOR_LARGEUR * k.echelle, h: DECOR_HAUTEUR * k.echelle });
  c.imageSmoothingEnabled = false;

  // Les trois cases : le lot, et la place du gagnant, vide et en pointillé tant qu'il n'est pas tiré.
  for (const rang of [2, 1, 3] as const) {
    const lot = s.lots.find((l) => l.rang === rang);
    if (!lot) continue;
    const x = k.x[rang];
    const y = k.haut[rang];
    const rayon = Math.min(18, k.l / 8);
    const n = podium.findIndex((g) => g.rang === rang);
    const g = n < 0 ? null : podium[n]!;
    const arrivee = g && etat ? (etat.montees[n] ?? 0) : 0;
    const tb = tableau(rang);
    c.beginPath();
    c.roundRect(x, y, k.l, k.h, rayon);
    c.fillStyle = encres.surface;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = MEDAILLES[rang].face;
    c.fillRect(x, y, k.l, k.bande);
    c.restore();
    c.beginPath();
    c.roundRect(x, y, k.l, k.h, rayon);
    c.strokeStyle = arrivee >= 1 ? MEDAILLES[rang].face : encres.leger;
    c.lineWidth = arrivee >= 1 ? 4 : 1.5;
    c.stroke();
    // Le gain à droite, la pièce devant ; le nom du lot à gauche, dans la place qui reste.
    c.font = `700 ${k.gain}px ${encres.sans}`;
    const chiffres = nombre(lot.gain);
    const largeurDuGain = c.measureText(chiffres).width;
    const cote = Math.round(k.gain * 0.92);
    const marge = Math.max(8, Math.round(k.l * 0.07));
    if (img.piece) c.drawImage(img.piece, x + k.l - marge - largeurDuGain - cote - 5, y + k.titreY - cote / 2, cote, cote);
    ecrire(c, encres.sans, chiffres, x + k.l - marge, y + k.titreY + 1, k.gain, encres.ecriture, { align: "right", graisse: 700 });
    ecrire(c, encres.police, NOMS_DES_RANGS[rang], x + marge, y + k.titreY, k.rang, encres.ecriture, { align: "left", graisse: 700, max: k.l - 2 * marge - largeurDuGain - cote - 12 });
    c.save();
    c.beginPath();
    c.roundRect(tb.x, tb.y, tb.l, tb.h, 10);
    c.clip();
    c.fillStyle = encres.page;
    c.fillRect(tb.x, tb.y, tb.l, tb.h);
    if (g && arrivee > 0) {
      // Le gagnant paraît devant sa bannière, comme sur /gaulois ; sans bannière, devant un fond uni.
      c.globalAlpha = lisse((arrivee - 0.45) / 0.55);
      const fond = s.fonds.get(g.index);
      if (fond) c.drawImage(fond, tb.x, tb.y, tb.l, tb.h);
      else {
        c.fillStyle = encres.surface2;
        c.fillRect(tb.x, tb.y, tb.l, tb.h);
      }
      const dessin = s.dessins.get(g.index);
      if (dessin) c.drawImage(dessin.toile, tb.x + PLACE_DU_GAULOIS.x * k.echelle, tb.y + PLACE_DU_GAULOIS.y * k.echelle, GAULOIS_LARGEUR * k.echelle, GAULOIS_HAUTEUR * k.echelle);
      c.globalAlpha = 1;
    }
    c.restore();
    c.beginPath();
    c.roundRect(tb.x, tb.y, tb.l, tb.h, 10);
    if (g && arrivee >= 1) {
      c.strokeStyle = encres.ecriture;
      c.lineWidth = 2;
      c.stroke();
      ecrire(c, encres.sans, g.part.nom, x + k.l / 2, tb.y + tb.h + k.nomY, k.nom, encres.ecriture, { graisse: 700, max: k.l - 16 });
    } else {
      c.setLineDash([6, 6]);
      c.strokeStyle = encres.filet;
      c.lineWidth = 1.5;
      c.stroke();
      c.setLineDash([]);
      if (arrivee <= 0) ecrire(c, encres.sans, k.attente, tb.x + tb.l / 2, tb.y + tb.h / 2, Math.max(11, k.nom - 2), encres.discret, { graisse: 500, max: tb.l - 12 });
    }
    peindreLesPoches(c, img, lot, x + k.l / 2 - largeurDesPoches(lot, k.poche, k.pas) / 2, y + k.pochesY, k.poche, k.pas);
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
      const x = seg.buste + (tb.x + (PLACE_DU_GAULOIS.x + GAULOIS_LARGEUR / 2) * k.echelle - seg.buste) * u;
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

/**
 * La scène de la loterie, dessinée sur une toile sans fond : les trois cases des lots, puis la ligne des parts en ruban.
 * Sans `tirage` : le tirage à venir, immobile, les places des gagnants vides. Avec : le dernier tirage ; chaque
 * changement de `lecture` (au-dessus de zéro) rejoue l'animation, si les animations sont permises (bouton pause de
 * l'en-tête, réglage du système), sinon le bilan est posé tout de suite. Décorative : ce qu'elle montre est écrit à côté.
 */
function SceneDeLoterie({ parts, lots, tirage = false, lecture = 0, onFini }: { parts: readonly PartDeLoterie[]; lots: readonly LotDeLoterie[]; tirage?: boolean; lecture?: number; onFini?: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [taille, setTaille] = useState<Taille>(1);
  const m = MESURES[taille];
  // Sans tirage, pas d'épingle sous la ligne : la toile s'arrête juste dessous.
  const hauteur = tirage ? m.hauteur : m.ligne.y + m.ligne.h + 10;
  const ordre = useMemo(() => ordreDeLaJauge(parts), [parts]);
  const avecBuste = useMemo(() => bustesDeLaJauge(parts, Math.floor(m.ligne.cadre.largeur / m.ligne.cadre.buste)), [parts, m]);
  const dessins = useMemo(() => {
    const table = new Map<number, Dessin>();
    parts.forEach((part, i) => {
      if (!avecBuste.has(i) && part.rang === null) return;
      const dessin = dessinDuGaulois(part.tenue);
      if (dessin) table.set(i, dessin);
    });
    return table;
  }, [parts, avecBuste]);

  // Les bannières des gagnants : leur code, lourd, ne se charge que s'il y en a une à montrer.
  const [lib, setLib] = useState<Awaited<ReturnType<typeof chargerLesBannieres>> | null>(null);
  const aMontrer = tirage && parts.some((part) => part.rang !== null && part.banniere !== null);
  useEffect(() => {
    if (!aMontrer || lib) return;
    let vivant = true;
    void chargerLesBannieres().then(
      (charge) => vivant && setLib(charge),
      () => undefined,
    );
    return () => {
      vivant = false;
    };
  }, [aMontrer, lib]);
  const fonds = useMemo(() => {
    const table = new Map<number, HTMLCanvasElement>();
    if (!lib) return table;
    parts.forEach((part, i) => {
      if (part.rang === null || !part.banniere) return;
      const decor = lib.dessinDeLaBanniere(part.banniere);
      const fond = decor ? toileDe(decor.cases, DECOR_LARGEUR, DECOR_HAUTEUR) : null;
      if (fond) table.set(i, fond);
    });
    return table;
  }, [parts, lib]);

  const fini = useRef(onFini);
  fini.current = onFini;
  // La dernière lecture déjà jouée : une relecture du serveur ou un changement de largeur ne rejoue pas le tirage.
  const jouee = useRef(0);
  // Les bannières arrivent après le départ du tirage : le dessin les lit à chaque image, sans repartir ni s'arrêter.
  const fondsLus = useRef(fonds);
  fondsLus.current = fonds;
  const anime = useRef(false);
  const auRepos = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!anime.current) auRepos.current?.();
  }, [fonds]);

  // La largeur se mesure avant le premier dessin : sans cela, le premier passage de l'observateur changerait la toile
  // juste après le départ du tirage, et l'arrêterait.
  useLayoutEffect(() => {
    if (boite.current) setTaille(tailleDe(boite.current.clientWidth));
  }, []);
  useEffect(() => {
    const el = boite.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observateur = new ResizeObserver(() => setTaille(tailleDe(el.clientWidth)));
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  // Le thème change (clair ou sombre, bouton de l'en-tête ; thème rouge de l'équipe) : la toile lit ses couleurs dans
  // les jetons de la page au moment de peindre, elle se repeint donc avec les nouvelles.
  const [theme, setTheme] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observateur = new MutationObserver(() => setTheme((n) => n + 1));
    observateur.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-theme"] });
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    const el = toile.current;
    const c = el?.getContext("2d");
    if (!el || !c) {
      if (tirage && lecture > 0) fini.current?.();
      return;
    }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = m.largeur * dpr;
    el.height = hauteur * dpr;
    const encres = encresDe(el);
    // Faux si le navigateur ne sait pas dessiner la scène (un très vieux navigateur) : le tirage s'arrête là, et le
    // podium écrit dessous le dit quand même.
    const peindre = (t: number | null): boolean => {
      try {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, m.largeur, hauteur);
        c.globalAlpha = 1;
        peindreLaScene(c, m, encres, images(), { parts, lots, ordre, avecBuste, dessins, fonds: fondsLus.current }, t);
        return true;
      } catch {
        return false;
      }
    };
    auRepos.current = () => void peindre(tirage ? Infinity : null);
    if (!tirage) {
      peindre(null);
      return;
    }
    const duree = dureeDuTirage(gagnants(parts).length);
    if (lecture < 1 || lecture === jouee.current || duree === 0 || !motionAllowed()) {
      jouee.current = lecture;
      peindre(Infinity);
      if (lecture > 0) fini.current?.();
      return;
    }
    jouee.current = lecture;
    anime.current = true;
    let image = 0;
    const debut = performance.now();
    const boucle = (maintenant: number) => {
      const t = (maintenant - debut) / 1000;
      // Mises en pause en cours de route (bouton de l'en-tête) : le bilan, tout de suite.
      if (t >= duree || !motionAllowed() || !peindre(t)) {
        anime.current = false;
        peindre(Infinity);
        fini.current?.();
        return;
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => {
      anime.current = false;
      cancelAnimationFrame(image);
    };
  }, [m, hauteur, parts, lots, ordre, avecBuste, dessins, tirage, lecture, theme]);

  return (
    <div ref={boite} class="loterie-scene">
      <canvas ref={toile} class="loterie-toile" style={{ aspectRatio: `${m.largeur} / ${hauteur}` }} aria-hidden="true" />
    </div>
  );
}

/* ---------- L'écran ---------- */

type Etat = { kind: "attente" } | { kind: "lecture" } | { kind: "erreur"; message: string; reessayer: boolean } | { kind: "prete"; ma: MaLoterie };

/** Toutes les parts d'un tirage, en tableau : ce que la ligne dessine, en chiffres. */
function TableDesParts({ parts, fait, titre = "Toutes les parts" }: { parts: readonly PartDeLoterie[]; fait: boolean; titre?: string }) {
  // Les tickets d'or (depuis le tirage du 24 novembre 2026) et les billets achetés (avant) : leur colonne seulement s'il y en a.
  const avecOr = parts.some((part) => (part.tickets_or ?? 0) > 0);
  const avecAchat = parts.some((part) => part.achetes > 0);
  return (
    <details class="fold">
      <summary>{titre}</summary>
      <div class="mt-3 max-h-96 overflow-auto" tabIndex={0} aria-label="Tableau des parts, zone défilante">
        <table class="data-table tnum w-full text-sm">
          <caption class="sr-only">Les billets de chaque Gaulois dans ce tirage, et sa part de tous les billets.</caption>
          <thead>
            <tr>
              <th scope="col">Gaulois</th>
              <th scope="col">Billets gagnés</th>
              {avecOr && <th scope="col">Tickets d'or</th>}
              {avecAchat && <th scope="col">Billets achetés</th>}
              <th scope="col">Part</th>
              {fait && <th scope="col">Podium</th>}
            </tr>
          </thead>
          <tbody>
            {parts.map((part, i) => (
              <tr key={i} class={part.moi ? "loterie-moi" : undefined}>
                <th scope="row">
                  {part.nom}
                  {part.moi ? " (vous)" : ""}
                </th>
                <td>{nombre(part.gratuits)}</td>
                {avecOr && <td>{nombre(part.tickets_or ?? 0)}</td>}
                {avecAchat && <td>{nombre(part.achetes)}</td>}
                <td>{pourcent(partEnPourcent(part, parts))}</td>
                {fait && <td>{part.rang === null ? "" : NOMS_DES_RANGS[part.rang]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Le dessin d'un booster de la rangée de la semaine : scellé, ouvert, ou la place vide d'un jour sans booster ; décoratif. */
function MiniBooster({ etat }: { etat: "ferme" | "ouvert" | "vide" }) {
  const planche = useMemo(() => miniBooster(etat), [etat]);
  const url = urlDeLaPlanche(`loterie-mini|${etat}`, () => planche);
  return <i class="loterie-jeu-mini" aria-hidden="true" style={`--i:${url};--w:${planche.width};--h:${planche.height}`} />;
}

/** Ce qu'un jour de la rangée dit aux lecteurs d'écran, après son nom. */
function motDuJour(etat: EtatDuJour, billets: number | null, ticketOr: boolean | null): string {
  if (etat === "ferme") return "booster à ouvrir";
  if (etat === "ouvert") return `booster ouvert, ${billetsEnMots(billets ?? 0)}${ticketOr ? " et un ticket d'or" : ""}`;
  if (etat === "a-venir") return "pas encore de booster : il vient quand vous jouez avec le clan";
  return "pas de booster ce jour-là";
}

/**
 * L'ouverture d'un booster de loterie (21 novembre 2026) : la même animation que les autres boosters (`OuvertureDuBooster`,
 * validée par le pilote). Le serveur ouvre d'abord (`ouvrir_booster_loterie`, qui tire le ticket d'or), pendant que le paquet
 * se secoue ; puis le joueur ouvre le paquet et retourne la carte de ses billets, avec le ticket d'or s'il y en a un. Dessous :
 * ce que la carte montre, en lettres du site, et le booster suivant s'il en reste. `onOuvert` reçoit la réponse du serveur
 * dès qu'elle arrive, même si la fenêtre est déjà fermée : le booster est ouvert.
 */
function FenetreDuBoosterDeLoterie({ jour, aujourdhui, suivant, onOuvert, onSuivant, onFermer }: { jour: string; aujourdhui: string; suivant: string | null; onOuvert: (ouvert: BoosterOuvert) => void; onSuivant: (jour: string) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"envoi" | "ouvre" | "revele">("envoi");
  const [refus, setRefus] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<{ booster: BoosterOuvert; carte: CarteDeScene } | null>(null);
  const rappel = useRef(onOuvert);
  rappel.current = onOuvert;
  useEffect(() => {
    let vivante = true;
    void (async () => {
      try {
        const lu = lireBoosterOuvert(await call<unknown>("ouvrir_booster_loterie", { p_jour: jour }));
        if (!lu) {
          if (vivante) setRefus(ILLISIBLE);
          return;
        }
        rappel.current(lu);
        if (!vivante) return;
        setOuvert({ booster: lu, carte: carteDuBoosterDeLoterie({ billets: lu.billets, ticketOr: lu.ticket_or, billetsOr: lu.billets_or }) });
        setEtape("ouvre");
      } catch (e) {
        if (vivante) setRefus(messageDuRefusDuBooster(e instanceof ServerError ? e.code : "network"));
      }
    })();
    return () => {
      vivante = false;
    };
    // Une fenêtre par booster : le jour ne change pas pendant qu'elle est ouverte.
  }, []);
  const b = ouvert?.booster ?? null;
  const titre = refus ? "Le booster reste fermé" : etape === "revele" && b ? (b.ticket_or ? "Un ticket d'or" : "Vos billets") : "Booster de loterie";
  const enScene = etape !== "envoi" && ouvert !== null;
  return (
    <FenetreDuBooster titre={titre} etape={enScene ? "ouvre" : "confirmer"} occupe={(etape === "envoi" && refus === null) || etape === "ouvre"} scene={enScene} onFermer={onFermer} testid="loterie-fenetre">
      {enScene && ouvert && b ? (
        <OuvertureDuBooster sorte="loterie" carte={ouvert.carte} revelee={etape === "revele"} onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}>
          <ResultatDuBooster nom={billetsEnMots(b.billets)} detail={b.ticket_or ? <Etiquette t="Ticket d'or" ton="or" dit="et un ticket d'or" /> : null} testid="loterie-booster-ouvert">
            <p class="bst-mot">
              {b.ticket_or ? `Le ticket d'or vaut ${billetsEnMots(b.billets_or)} de plus : ` : ""}
              {billetsEnMots(b.total)} pour le tirage du {jourEnMots(b.tirage)}.
            </p>
            {b.jour === aujourdhui && <p class="bst-mot">Les points de vos parties de plus tard aujourd'hui s'y ajouteront.</p>}
          </ResultatDuBooster>
          <div class="bst-actions">
            {suivant && <BoutonDesBoosters t="Ouvrir le suivant" dit="Ouvrir le booster suivant" or onClick={() => onSuivant(suivant)} testid="loterie-suivant" />}
            <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="loterie-fermer" />
          </div>
        </OuvertureDuBooster>
      ) : (
        <div class="bst-confirmer">
          <div class="bst-attente" data-envoi={refus === null ? "" : undefined}>
            <PaquetEnImage sorte="loterie" classe="bst-attente-paquet" />
          </div>
          <div class="bst-confirmer-compte">
            <p class="bst-mot">Le booster du {jourEnMots(jour)}.</p>
            <RefusDuBooster message={refus} />
            {refus !== null && (
              <div class="bst-actions">
                <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="loterie-fermer" />
              </div>
            )}
          </div>
        </div>
      )}
    </FenetreDuBooster>
  );
}

/**
 * Vos boosters de loterie (décision du pilote, 20 novembre 2026, à la place du guichet : plus aucun billet ne s'achète), en
 * écran de jeu (21 novembre 2026) : vos billets, vos tickets d'or et votre part en trois chiffres, la barre de vos billets
 * parmi ceux du tirage, puis la rangée des sept jours de la semaine, un booster par jour joué avec le clan, à ouvrir d'un
 * clic par l'animation des boosters. Le serveur tire le ticket d'or ; l'écran montre ce qu'il répond, puis relit la loterie.
 */
function MesBoosters({ ma, onOuvert }: { ma: MaLoterie; onOuvert: (apres: MaLoterie) => void }) {
  const moi = maPart(ma.parts);
  const total = totalDesBillets(ma.parts);
  const mesBillets = moi ? billetsDe(moi) : 0;
  const or = ma.or ?? TICKET_D_OR;
  const [aujourdhui] = useState(() => jourDeParis(new Date()));
  const rangee = useMemo(() => semaineDesBoosters(ma.tirage, ma.boosters ?? [], aujourdhui), [ma.tirage, ma.boosters, aujourdhui]);
  const fermes = rangee.filter((j) => j.etat === "ferme").length;
  // Le booster en cours d'ouverture : son jour, et un compteur pour qu'un « suivant » ouvre une fenêtre neuve.
  const [enCours, setEnCours] = useState<{ jour: string; n: number } | null>(null);
  // La loterie la plus récente, pour qu'une réponse arrivée après une autre ne la remplace pas par une plus ancienne.
  const derniere = useRef(ma);
  derniere.current = ma;
  const part = moi ? Math.round(partEnPourcent(moi, ma.parts) * 10) / 10 : 0;
  const partEcrite = String(part).replace(".", ",");
  return (
    <section class="loterie-jeu-boosters jeu-panneau jeu-n9" aria-labelledby="loterie-boosters-titre" data-testid="loterie-boosters">
      <h3 id="loterie-boosters-titre" class="loterie-jeu-ruban">
        <span class="jeu-ruban jeu-ruban-bleu jeu-n9">
          <Px t="Vos boosters de la semaine" couleur="creme" relief="ombre" />
        </span>
      </h3>
      <ol class="loterie-jeu-semaine" aria-label="Vos boosters de loterie, un par jour joué avec le clan" data-testid="loterie-semaine">
        {rangee.map((j) => {
          const nom = jourDeLaRangee(j.jour);
          const dit = `${jourEnMots(j.jour)} : ${motDuJour(j.etat, j.booster?.billets ?? null, j.booster?.ticket_or ?? null)}`;
          return (
            <li key={j.jour} class="loterie-jeu-jour" data-etat={j.etat} data-aujourdhui={j.jour === aujourdhui ? "" : undefined} data-testid="loterie-booster">
              {j.etat === "ferme" ? (
                <button
                  type="button"
                  class="loterie-jeu-case"
                  disabled={enCours !== null}
                  onClick={() => {
                    // Dans le clic : sinon certains navigateurs gardent la scène muette.
                    reveillerLeSon();
                    setEnCours((e) => ({ jour: j.jour, n: (e?.n ?? 0) + 1 }));
                  }}
                  aria-label={`Ouvrir le booster du ${jourEnMots(j.jour)}`}
                  data-testid="loterie-ouvrir-booster"
                >
                  <MiniBooster etat="ferme" />
                </button>
              ) : (
                <span class="loterie-jeu-case" role="img" aria-label={dit}>
                  <MiniBooster etat={j.etat === "ouvert" ? "ouvert" : "vide"} />
                </span>
              )}
              <span class="loterie-jeu-nom" aria-hidden="true">
                <Px t={nom} couleur={j.jour === aujourdhui ? "or" : "doux"} muet />
              </span>
              {j.etat === "ouvert" && j.booster && (
                <span class="loterie-jeu-gain" aria-hidden="true">
                  <Px t={`+${nombreEcrit(j.booster.billets ?? 0)}`} muet />
                  {j.booster.ticket_or && <Etiquette t={`+${nombreEcrit(or.billets)}`} ton="or" />}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <dl class="loterie-jeu-chiffres" data-testid="loterie-mes-billets">
        <div>
          <dt>
            <Px t="Vos billets" couleur="doux" dit="Vos billets" />
          </dt>
          <dd>
            <Px t={nombreEcrit(mesBillets)} classe="loterie-jeu-grand" dit={nombre(mesBillets)} />
          </dd>
        </div>
        <div>
          <dt>
            <Px t="Tickets d'or" couleur="doux" dit="Tickets d'or" />
          </dt>
          <dd>
            <Px t={nombreEcrit(moi?.tickets_or ?? 0)} couleur="or" classe="loterie-jeu-grand" dit={nombre(moi?.tickets_or ?? 0)} />
          </dd>
        </div>
        <div>
          <dt>
            <Px t="Votre part" couleur="doux" dit="Votre part des billets comptés pour l'instant" />
          </dt>
          <dd>
            <Px t={`${partEcrite} %`} classe="loterie-jeu-grand" dit={`${partEcrite} %`} />
          </dd>
        </div>
      </dl>
      <div class="jeu-tube jeu-n9 loterie-jeu-barre" role="img" aria-label={`Vos billets : ${nombre(mesBillets)} sur ${nombre(total)} comptés pour l'instant`}>
        <div class="jeu-plein jeu-plein-bleu jeu-n9" style={`--part:${total > 0 && mesBillets > 0 ? Math.max(0.02, Math.min(1, mesBillets / total)) : 0}`} />
        <Px t={`Vos billets : ${nombreEcrit(mesBillets)} sur ${nombreEcrit(total)}`} couleur="creme" relief="cerne" muet />
      </div>
      <div class="loterie-jeu-notes" aria-live="polite">
        {(ma.boosters ?? []).length === 0 ? (
          <p data-testid="loterie-sans-booster">
            Un booster de loterie arrive chaque jour où vous jouez avec le clan : autant de billets que de points rapportés ce jour-là, et une fois sur {nombre(or.sur)} un ticket d'or qui vaut {billetsEnMots(or.billets)} de plus.
          </p>
        ) : (
          fermes > 0 && <p>Un booster pas ouvert compte quand même : le serveur l'ouvre juste avant le tirage.</p>
        )}
      </div>
      {enCours && (
        <FenetreDuBoosterDeLoterie
          key={enCours.n}
          jour={enCours.jour}
          aujourdhui={aujourdhui}
          suivant={boosterSuivant(rangee, enCours.jour)}
          onOuvert={(ouvert) => onOuvert(apresLOuverture(derniere.current, ouvert))}
          onSuivant={(jour) => {
            reveillerLeSon();
            setEnCours((e) => ({ jour, n: (e?.n ?? 0) + 1 }));
          }}
          onFermer={() => setEnCours(null)}
        />
      )}
    </section>
  );
}

/** Le dernier tirage : la scène animée, son podium en toutes lettres, et le bouton pour le revoir. */
function DernierTirage({ dernier, lots }: { dernier: NonNullable<MaLoterie["dernier"]>; lots: readonly LotDeLoterie[] }) {
  const [lecture, setLecture] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const podium = gagnants(dernier.parts);
  const semaine = semaineDuTirage(dernier.tirage);

  // La première fois que ce navigateur voit ce tirage, il se joue seul ; ensuite, le bilan attend.
  useEffect(() => {
    let vu: string | null = null;
    try {
      vu = localStorage.getItem(CLE_VU);
      localStorage.setItem(CLE_VU, dernier.tirage);
    } catch {
      // Sans stockage, le tirage se joue à chaque ouverture : rien de grave.
    }
    if (vu !== dernier.tirage && podium.length > 0 && motionAllowed()) {
      setEnCours(true);
      setLecture(1);
    }
  }, [dernier.tirage]);

  // Un garde-fou : quoi qu'il arrive au dessin, le podium écrit paraît au plus tard quatre secondes après la fin prévue.
  useEffect(() => {
    if (!enCours) return;
    const minuterie = setTimeout(() => setEnCours(false), (dureeDuTirage(podium.length) + 4) * 1000);
    return () => clearTimeout(minuterie);
  }, [enCours, lecture]);

  if (dernier.parts.length === 0) return null;
  return (
    <section class="loterie-bloc loterie-jeu-dernier jeu-ecran-cadre jeu-n9" aria-labelledby="loterie-dernier-titre" data-testid="loterie-dernier">
      <div class="loterie-jeu-ruban" aria-hidden="true">
        <span class="jeu-ruban jeu-ruban-bleu jeu-n9">
          <Px t="Dernier tirage" couleur="creme" relief="ombre" muet />
        </span>
      </div>
      <div class="loterie-bloc-tete">
        <div>
          <h3 id="loterie-dernier-titre" class="loterie-jeu-date">
            <span class="sr-only">Dernier tirage : </span>
            <Px t={majuscule(jourEnMots(dernier.tirage))} dit={majuscule(jourEnMots(dernier.tirage))} />
          </h3>
          <p class="pochette-note">
            Points du {jourCourt(semaine.debut)} au {jourCourt(semaine.fin)}, {nombre(totalDesBillets(dernier.parts))} billets.
          </p>
        </div>
        <BoutonDesBoosters
          t="Revoir le tirage"
          disabled={enCours}
          onClick={() => {
            setEnCours(true);
            setLecture((n) => n + 1);
          }}
          testid="loterie-revoir"
        />
      </div>
      <SceneDeLoterie parts={dernier.parts} lots={lots} tirage lecture={lecture} onFini={() => setEnCours(false)} />
      {/* Le podium en toutes lettres : caché pendant que la scène le dévoile, pour ne pas le dire avant elle, puis
          annoncé aux lecteurs d'écran quand il paraît. */}
      <div aria-live="polite">
        {!enCours && (
          <ol class="loterie-podium" aria-label="Le podium du tirage" data-testid="loterie-podium">
            {podium.map((g) => (
              <li key={g.rang} data-rang={g.rang}>
                <span class="loterie-rang">{NOMS_DES_RANGS[g.rang]}</span>
                <span>
                  {g.part.nom}
                  {g.part.moi ? " (vous)" : ""}
                </span>
                <span class="pochette-note">billet {g.billet < g.part.gratuits ? "gagné" : "acheté"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {!enCours && <TableDesParts parts={dernier.parts} fait titre="Toutes les parts du dernier tirage" />}
    </section>
  );
}

const majuscule = (texte: string): string => texte.charAt(0).toUpperCase() + texte.slice(1);

/**
 * L'onglet « La loterie » de « Mon Gaulois » (16 novembre 2026), dans la mise en page choisie par le pilote, « le podium
 * d'abord » : la date du tirage en grand, les trois cases des lots où chaque gagnant paraît devant sa bannière, la ligne
 * des parts en ruban, sans or, puis vos boosters de loterie de la semaine (écran de jeu du 21 novembre 2026 : plus aucun
 * billet ne s'achète). Chaque mardi à 21 h 30 (le lundi jusqu'au 17 novembre 2026), le serveur tire l'or, l'argent puis le
 * bronze parmi les billets des sept jours d'avant. Tout vient de `get_loterie` ; rien n'est du temps réel : la page se relit
 * à l'ouverture de l'onglet, après l'ouverture d'un booster, et autour de l'heure du tirage.
 */
export default function LoterieDuMardi({ actif }: { actif: boolean }) {
  const [etat, setEtat] = useState<Etat>({ kind: "attente" });

  const lire = useCallback(async (discret: boolean) => {
    if (!discret) setEtat({ kind: "lecture" });
    try {
      const ma = lireLoterie(await call<unknown>("get_loterie"));
      if (ma) setEtat({ kind: "prete", ma });
      else if (!discret) setEtat({ kind: "erreur", message: ILLISIBLE, reessayer: true });
    } catch (e) {
      if (!discret) setEtat({ kind: "erreur", message: messageOf(e), reessayer: !(e instanceof ServerError && SANS_RETOUR.has(e.code)) });
    }
  }, []);

  useEffect(() => {
    if (actif) void lire(etat.kind === "prete");
  }, [actif]);

  const ma = etat.kind === "prete" ? etat.ma : null;
  // Le tirage attendu n'est pas encore lu : l'heure vient de passer, le serveur le fait dans la minute. Au-delà de vingt
  // minutes, l'écran n'attend plus : il ne promet pas un tirage qui n'est pas venu.
  const attendu = ma ? addDays(ma.tirage, -7) : null;
  const depuis = ma ? Date.now() - (Date.parse(ma.heure) - 7 * 86_400_000) : 0;
  const enAttente = ma !== null && attendu !== null && attendu >= PREMIER_TIRAGE_LOTERIE && (ma.dernier?.tirage ?? "") < attendu && depuis >= 0 && depuis < 20 * 60_000;

  // Autour de l'heure : une relecture juste après le tirage, puis toutes les 40 secondes tant qu'il n'est pas lu.
  useEffect(() => {
    if (!actif || !ma) return;
    const avant = Date.parse(ma.heure) - Date.now();
    const delai = enAttente ? 40_000 : avant > 0 && avant < 6 * 3600_000 ? avant + 45_000 : null;
    if (delai === null) return;
    const minuterie = setTimeout(() => void lire(true), delai);
    return () => clearTimeout(minuterie);
  }, [actif, ma, enAttente, lire]);

  if (etat.kind === "attente" || etat.kind === "lecture") return <Loading label="Lecture de la loterie…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={etat.reessayer ? () => void lire(false) : undefined} />;

  const { ma: loterie } = etat;
  const semaine = semaineDuTirage(loterie.tirage);
  const gagnees = boostersGagnesEnMots(loterie.bons);
  const quand = majuscule(jourEnMots(loterie.tirage));
  return (
    <div class="loterie loterie-jeu" data-testid="loterie">
      <div class="loterie-jeu-titre" aria-hidden="true">
        <span class="jeu-ruban jeu-n9">
          <Px t="La loterie du mardi" couleur="creme" relief="ombre" muet />
        </span>
      </div>
      <div class="loterie-jeu-tete">
        <p class="loterie-jeu-surtitre">
          <Px t="Prochain tirage" couleur="doux" />
        </p>
        <p class="loterie-jeu-quand" data-testid="loterie-quand">
          <Px t={quand} classe="loterie-jeu-grand" dit={quand} />
        </p>
        <p class="loterie-jeu-heure">
          <Etiquette t="21 h 30" ton="bleu" dit="21 h 30" />
          <Px t="heure de Paris" couleur="doux" />
        </p>
        {loterie.releve && (
          <p class="info-discrete" data-testid="loterie-releve">
            Parties relues le {instant(loterie.releve)}
          </p>
        )}
      </div>

      {gagnees.length > 0 && (
        <p class="loterie-gagnees loterie-jeu-bulle jeu-bulle jeu-n9" data-testid="loterie-gagnees">
          Vos boosters gagnés ou offerts, à ouvrir sans rien payer : {gagnees.join(", ")}. <a href="#pochettes">Les ouvrir</a>
        </p>
      )}

      {enAttente && (
        <p class="pochette-raison loterie-jeu-bulle jeu-bulle jeu-n9" role="status" data-testid="loterie-attente">
          Le tirage du {jourEnMots(attendu ?? loterie.tirage)} arrive dans la minute.
        </p>
      )}

      <section aria-labelledby="loterie-parts-titre" class="loterie-prochain loterie-jeu-scene jeu-ecran-cadre jeu-n9">
        <h3 id="loterie-parts-titre" class="sr-only">
          Les lots et les parts du prochain tirage
        </h3>
        <SceneDeLoterie parts={loterie.parts} lots={loterie.lots} />
      </section>
      <MesBoosters
        ma={loterie}
        onOuvert={(apres) => {
          setEtat({ kind: "prete", ma: apres });
          // La part de chacun se relit au serveur, sans effacer l'écran.
          void lire(true);
        }}
      />

      <div class="loterie-jeu-plis jeu-ecran-cadre jeu-n9">
        {loterie.parts.length > 0 && <TableDesParts parts={loterie.parts} fait={false} titre="Toutes les parts du prochain tirage" />}
        {/* Les règles et les lots en toutes lettres : la scène les dessine, ce pli les écrit. */}
        <details class="fold" data-testid="loterie-regles">
          <summary>Les règles et les lots</summary>
          <div class="loterie-regles mt-3">
            <p>
              Un booster de loterie par jour joué avec le clan, du {jourCourt(semaine.debut)} au {jourCourt(semaine.fin)} : autant de billets que de points rapportés au clan ce jour-là (au moins un dès qu'une partie en rapporte), et une fois sur {nombre((loterie.or ?? TICKET_D_OR).sur)} un ticket d'or qui vaut {nombre((loterie.or ?? TICKET_D_OR).billets)} billets de plus. Un booster pas ouvert compte quand même : le serveur l'ouvre juste avant le tirage. Plus aucun billet ne s'achète. L'or est tiré d'abord, puis l'argent et le bronze ; un gagnant ne regagne pas.
            </p>
            <ol class="loterie-lots" aria-label="Les lots du podium" data-testid="loterie-lots">
              {RANGS.map((rang) => {
                const lot = loterie.lots.find((l) => l.rang === rang);
                return (
                  lot && (
                    <li key={rang} data-rang={rang}>
                      <span class="loterie-rang">{NOMS_DES_RANGS[rang]}</span>
                      <span>{[stateres(lot.gain), ...pochettesDuLot(lot)].join(", ")}</span>
                    </li>
                  )
                );
              })}
            </ol>
          </div>
        </details>
      </div>

      {loterie.dernier && <DernierTirage key={loterie.dernier.tirage} dernier={loterie.dernier} lots={loterie.lots} />}
    </div>
  );
}
