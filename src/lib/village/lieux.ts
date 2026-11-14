/**
 * Les cinq lieux du village (onglet « La place » de `/village`), en pixels, dessinés case par case pour ce site : la place
 * autour du feu, la taverne, la salle de réunion, le champ de bataille hors de la palissade, et les maisons où l'on dort.
 * Chaque lieu a un haut (le ciel et le village, ou le mur du fond) puis autant de rangs qu'il faut pour ceux qui s'y
 * trouvent : le décor s'allonge vers le bas, jamais de côté. Il rend aussi les postes où se tiennent les Gaulois.
 *
 * Rien n'est tiré au hasard à l'écran : la même largeur, le même nombre et la même lumière donnent le même dessin. Les
 * guerriers d'en face, au champ de bataille, sont d'un clan inventé pour ce site. Design : Claude Fable 5.2.
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../gaulois";
import {
  DECOR_LARGEUR_MIN,
  type Decor,
  FEU_HAUTEUR,
  PIED,
  Planche,
  SOL,
  TETE_DU_DEHORS,
  alea,
  feuDuDecor,
  paletteDuDehors,
  placesDuDecor,
  poserArbre,
  poserCielEtForet,
  poserFeu,
  poserHerbe,
  poserHutte,
  poserPalissade,
  poserSolDuFeu,
} from "./decor";
import { type Lumiere, cielDuVillage, couleurDuDedans, melanger } from "./lumiere";
import { ATTABLE_HAUTEUR, LIT_HAUTEUR, LIT_LARGEUR } from "./poses";
import type { Lieu } from "./vie";

/** La boîte d'un Gaulois dans chaque lieu, en cases, et la rangée où s'écrit son nom, comptée du haut de la boîte. */
export const BOITES: Readonly<Record<Lieu, { largeur: number; hauteur: number; nom: number }>> = {
  place: { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, nom: GAULOIS_HAUTEUR + 1 },
  bataille: { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, nom: GAULOIS_HAUTEUR + 1 },
  taverne: { largeur: GAULOIS_LARGEUR, hauteur: ATTABLE_HAUTEUR, nom: 68 },
  reunion: { largeur: GAULOIS_LARGEUR, hauteur: ATTABLE_HAUTEUR, nom: 68 },
  maisons: { largeur: LIT_LARGEUR, hauteur: LIT_HAUTEUR, nom: LIT_HAUTEUR + 1 },
};

/** Un poste : le coin haut gauche de la boîte d'un Gaulois, en cases, et sa place dans la grille du lieu. */
export interface Poste {
  x: number;
  y: number;
  col: number;
  rang: number;
}

/** Un lieu composé : son dessin, les postes des Gaulois, ceux des guerriers d'en face, et son feu s'il en a un. */
export interface Scene {
  lieu: Lieu;
  decor: Decor;
  /** Sur la place, il y a plus de postes que de Gaulois : ils vont de l'un à l'autre. Ailleurs, un poste par Gaulois. */
  postes: Poste[];
  adversaires: Poste[];
  /** La colonne du milieu du feu et la rangée du haut de sa flamme. */
  feu: { x: number; y: number } | null;
  /** La fumée monte du feu : seulement dehors. */
  fumee: boolean;
}

const largeurDe = (largeur: number): number => Math.max(Math.floor(largeur), DECOR_LARGEUR_MIN);

/* ---------- La place ---------- */

const PLACE_CASE_L = 50;
const PLACE_CASE_H = 78;
const PLACE_HAUT = 66;

function composerPlace(largeurDemandee: number, nombre: number, l: Lumiere): Scene {
  const largeur = largeurDe(largeurDemandee);
  const p = paletteDuDehors(l);
  const feu = feuDuDecor(largeur);
  // Les postes : une grille sur l'herbe, un peu dérangée, plus grande que la foule pour laisser de quoi marcher.
  const colonnes = Math.max(2, Math.floor((largeur - 6) / PLACE_CASE_L));
  const marge = Math.floor((largeur - colonnes * PLACE_CASE_L) / 2) + 1;
  const voulus = Math.max(nombre + 2, Math.ceil(nombre * 1.4), 3);
  const postes: Poste[] = [];
  let rangs = 0;
  while (postes.length < voulus) {
    for (let col = 0; col < colonnes; col++) {
      const x = marge + col * PLACE_CASE_L;
      // Devant le feu, au premier rang, personne : on le verrait mal.
      if (rangs === 0 && colonnes > 2 && Math.abs(x + GAULOIS_LARGEUR / 2 - feu.x) < 24) continue;
      const dx = Math.round(alea(col + 31, rangs + 7) * 6) - 3;
      const dy = Math.round(alea(col + 5, rangs + 77) * 6) - 3;
      postes.push({ x: Math.min(largeur - GAULOIS_LARGEUR, Math.max(0, x + dx)), y: PLACE_HAUT + rangs * PLACE_CASE_H + dy + 3, col, rang: rangs });
    }
    rangs++;
  }
  const hauteur = PLACE_HAUT + rangs * PLACE_CASE_H + 6;
  const planche = new Planche(largeur, hauteur, p.herbe.fond);
  poserCielEtForet(planche, l, p);
  poserPalissade(planche, p);
  poserHerbe(planche, p);
  poserSolDuFeu(planche, p, feu.x, feu.y + FEU_HAUTEUR - 1);
  for (const batisse of placesDuDecor(largeur).reverse()) {
    if (batisse.type === "arbre") poserArbre(planche, p, batisse.x);
    else poserHutte(planche, p, batisse.x, batisse.grande, batisse.eclairee);
  }
  poserFeu(planche, feu.x, feu.y, false);
  return { lieu: "place", decor: planche.decor(), postes, adversaires: [], feu, fumee: true };
}

/* ---------- Le champ de bataille ---------- */

const BATAILLE_RANG = 80;
const BATAILLE_HAUT = 64;
const BATAILLE_PAS = 40;

function composerBataille(largeurDemandee: number, nombre: number, l: Lumiere): Scene {
  const largeur = largeurDe(largeurDemandee);
  const p = paletteDuDehors(l);
  // Les Gaulois à gauche, tournés vers la droite ; le premier de chaque rang au contact.
  const parRang = Math.max(1, Math.floor((largeur * 0.56 - 2) / BATAILLE_PAS));
  const rangs = Math.max(1, Math.ceil(nombre / parRang));
  const front = Math.floor(largeur * 0.56) - GAULOIS_LARGEUR;
  const face = front + 51;
  const hauteur = BATAILLE_HAUT + rangs * BATAILLE_RANG + 6;
  const planche = new Planche(largeur, hauteur, p.herbe.fond);
  poserCielEtForet(planche, l, p);
  poserHerbe(planche, p);

  // À gauche, le village derrière sa palissade : un toit dépasse, puis la porte.
  const finDuVillage = Math.floor(largeur * 0.34);
  if (finDuVillage > 44) poserHutte(planche, p, Math.floor(finDuVillage / 2) - 4, true, true, PIED - 5);
  poserPalissade(planche, p, 0, finDuVillage);
  for (const x of [finDuVillage, finDuVillage + 5]) {
    planche.rect(x, 38, 5, SOL - 37, (i, j) => (i === x ? p.bois.clair : i === x + 4 ? p.bois.creux : j % 7 === 3 ? p.bois.sombre : p.bois.fond));
    planche.rect(x + 1, 37, 3, 1, p.bois.fond);
  }
  // À droite, au loin, le camp de l'autre clan : des tentes de toile prune, un fanion à la pointe.
  for (let k = 0; ; k++) {
    const cx = largeur - 20 - k * 38;
    if (cx - 16 < largeur * 0.6) break;
    const haut = k % 2 === 0 ? 22 : 18;
    for (let r = 0; r < haut; r++) {
      const demi = Math.round(((r + 1) * 14) / haut);
      for (let dx = -demi; dx <= demi; dx++) {
        let couleur: string = dx < -demi / 3 ? p.prune.clair : dx > demi / 3 ? p.prune.sombre : p.prune.fond;
        if (Math.abs(dx) === demi) couleur = p.prune.trait;
        // L'entrée : une fente sombre qui s'ouvre vers le bas.
        if (r > haut * 0.45 && Math.abs(dx) <= (r - haut * 0.45) / 3) couleur = p.prune.trait;
        planche.poser(cx + dx, PIED - 1 - haut + r + 1, couleur);
      }
    }
    planche.rect(cx, PIED - haut - 7, 1, 7, p.prune.trait);
    planche.rect(cx + 1, PIED - haut - 7, 5, 3, (i, j) => (i - cx > 3 && j === PIED - haut - 5 ? null : p.prune.clair));
  }
  // Le pré piétiné : à chaque rang, la terre à nu là où les deux lignes se touchent, et quelques mottes.
  const postes: Poste[] = [];
  const adversaires: Poste[] = [];
  for (let rang = 0; rang < rangs; rang++) {
    const y = BATAILLE_HAUT + rang * BATAILLE_RANG;
    const ici = Math.min(parRang, nombre - rang * parRang);
    const milieu = front + 48;
    for (let j = y + 50; j <= y + 68; j++) {
      for (let i = milieu - 46; i <= milieu + 46; i++) {
        if (j <= SOL) continue;
        const d = ((i - milieu) / 44) ** 2 + ((j - (y + 60)) / 7) ** 2;
        const a = alea(i + 13, j + 900);
        if (d <= 0.55) planche.poser(i, j, a < 0.14 ? p.terre.claire : a < 0.3 ? p.terre.sombre : p.terre.fond);
        else if (d <= 1 && (i + j) % 2 === 0) planche.poser(i, j, a < 0.5 ? p.terre.fond : p.terre.sombre);
      }
    }
    for (let k = 0; k < ici; k++) postes.push({ x: front - k * BATAILLE_PAS, y, col: k, rang });
    // En face, autant de guerriers que de Gaulois dans le rang, serrés si la place manque.
    const place = largeur - face - 40;
    const pas = ici > 1 ? Math.min(BATAILLE_PAS, Math.max(16, Math.floor(place / (ici - 1)))) : 0;
    for (let k = 0; k < ici; k++) {
      const x = face + k * pas;
      if (x + 40 <= largeur) adversaires.push({ x, y, col: k, rang });
    }
  }
  return { lieu: "bataille", decor: planche.decor(), postes, adversaires, feu: null, fumee: false };
}

/* ---------- Les dedans : pièces communes ---------- */

/** La rangée du sol dans une pièce, sous le mur du fond. */
const SOL_DU_DEDANS = 48;
/** L'écart entre deux convives, en cases. */
const SIEGE = 38;
/** La hauteur d'un rang de table : le convive, la table, son nom. */
const RANG_DE_TABLE = 82;
/** La rangée du haut du premier rang : les têtes passent devant le bas du mur. */
const HAUT_DES_TABLES = 52;

type Teinte = (couleur: string) => string;

/** Les poteaux d'une pièce : leurs colonnes, et les travées entre eux. */
function poteaux(largeur: number): number[] {
  const nombre = Math.max(3, Math.round(largeur / 72) + 1);
  return Array.from({ length: nombre }, (_, k) => Math.round((k * (largeur - 5)) / (nombre - 1)));
}

/** Une torche sur un poteau : sa flamme éclaire, et le mur rougit autour, plus fort la nuit. */
function poserTorche(planche: Planche, x: number, y: number, l: Lumiere): void {
  const force = 0.22 + 0.2 * (1 - l.jour);
  planche.disque(x + 1, y - 2, 8, (dx, dy) => {
    const fond = planche.lire(x + 1 + dx, y - 2 + dy);
    const d = dx * dx + dy * dy;
    if (!fond || (d > 30 && (dx + dy) % 2 !== 0)) return null;
    return melanger(fond, "#f5a83a", force * (d > 30 ? 0.6 : 1));
  });
  planche.rect(x, y, 3, 6, "#3d2616");
  planche.rect(x + 1, y, 1, 6, "#5d3d22");
  planche.lettres(x - 1, y - 6, [".r...", ".ro..", "royo.", "royor", ".oyo."], { r: "#e2452a", o: "#f58a1f", y: "#ffd75a" });
}

/** Une fenêtre : le ciel de l'heure entre deux volets ouverts. */
function poserFenetre(planche: Planche, x: number, y: number, l: Lumiere, t: Teinte): void {
  const ciel = cielDuVillage(l);
  planche.rect(x - 5, y, 5, 14, (i, j) => ((j - y) % 5 === 4 ? t("#523419") : i === x - 5 ? t("#8a5a30") : t("#70492c")));
  planche.rect(x + 18, y, 5, 14, (i, j) => ((j - y) % 5 === 4 ? t("#523419") : i === x + 22 ? t("#523419") : t("#70492c")));
  planche.rect(x, y, 18, 14, t("#3d2616"));
  planche.rect(x + 2, y + 2, 14, 10, (_i, j) => (j < y + 6 ? ciel[2]! : j < y + 9 ? ciel[3]! : ciel[4]!));
  if (l.jour < 0.4) {
    planche.poser(x + 5, y + 4, melanger(ciel[2]!, "#c0c9e2", 1 - l.jour * 2.5));
    planche.poser(x + 12, y + 3, melanger(ciel[2]!, "#c0c9e2", 1 - l.jour * 2.5));
  }
  planche.rect(x + 8, y + 2, 2, 10, t("#3d2616"));
  planche.rect(x - 1, y + 14, 20, 2, t("#8a5a30"));
}

/** Un tonneau debout, posé sur la rangée `bas`. */
function poserTonneau(planche: Planche, x: number, bas: number, t: Teinte): void {
  const haut = bas - 19;
  for (let y = haut; y <= bas; y++) {
    const r = y - haut;
    const retrait = r < 2 || r > 17 ? 1 : 0;
    for (let i = retrait; i < 16 - retrait; i++) {
      let couleur = i % 4 === 3 ? "#6a4424" : i < 4 ? "#b07a44" : i > 11 ? "#7a5230" : "#9a6b3f";
      if (r === 3 || r === 4 || r === 15 || r === 16) couleur = i < 4 ? "#8d95a6" : "#5c6474";
      if (r === 0) couleur = "#c79a62";
      if (i === retrait || i === 15 - retrait || r === 19) couleur = "#3d2616";
      planche.poser(x + i, y, t(couleur));
    }
  }
}

/** Un grand fût couché sur son chevalet, vu de face, avec son robinet. */
function poserFut(planche: Planche, cx: number, bas: number, t: Teinte): void {
  const cy = bas - 15;
  planche.disque(cx, cy, 12, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > 130) return t("#3d2616");
    if (d > 100) return t(dx + dy < 0 ? "#8d95a6" : "#5c6474");
    if ((dy + 12) % 5 === 4) return t("#6a4424");
    return t(dx + dy < -6 ? "#b07a44" : dx + dy > 8 ? "#7a5230" : "#9a6b3f");
  });
  planche.rect(cx - 1, cy + 5, 3, 3, t("#3d2616"));
  planche.rect(cx, cy + 8, 1, 2, t("#5c6474"));
  for (const dx of [-10, 8]) {
    planche.rect(cx + dx, bas - 4, 3, 5, t("#5d3d22"));
    planche.rect(cx + dx, bas - 4, 1, 5, t("#7d5631"));
  }
  planche.rect(cx - 12, bas - 5, 25, 2, t("#684627"));
}

const CRUCHE = [".aaa.", ".aba.", "aabaa", "abcba", "abcba", "abbba", ".aaa."] as const;
const GODET = ["aaaa.", "abbaa", "abbaa", "aaaa."] as const;

/** Une étagère et ce qu'elle porte : cruches et godets, de la colonne `de` à la colonne `a`. */
function poserEtagere(planche: Planche, de: number, a: number, y: number, t: Teinte): void {
  planche.rect(de, y, a - de, 2, (_i, j) => t(j === y ? "#7d5631" : "#472d19"));
  planche.rect(de + 2, y + 2, 2, 3, t("#472d19"));
  planche.rect(a - 4, y + 2, 2, 3, t("#472d19"));
  for (let x = de + 3; x + 6 < a; x += 9) {
    const sorte = alea(x, y);
    if (sorte < 0.55) planche.lettres(x, y - 7, CRUCHE, { a: t("#5a2f18"), b: t("#b0683c"), c: t("#d08a5a") });
    else if (sorte < 0.85) planche.lettres(x, y - 4, GODET, { a: t("#3d2616"), b: t("#9a6b3f") });
  }
}

/** Une longue table sur ses tréteaux : le dessus, la ceinture, les pieds, et son ombre au sol. */
function poserTable(planche: Planche, x: number, y: number, largeur: number, t: Teinte): void {
  planche.rect(x + 2, y + 19, largeur - 4, 2, (i, j) => ((i + j) % 2 === 0 ? t("#3d2616") : null));
  for (const px of [x + 4, x + largeur - 8]) {
    planche.rect(px, y + 9, 4, 10, (i) => t(i === px ? "#8a5a30" : i === px + 3 ? "#472d19" : "#6a4424"));
  }
  planche.rect(x + 8, y + 13, largeur - 16, 2, t("#5d3d22"));
  planche.rect(x + 1, y + 6, largeur - 2, 3, (_i, j) => t(j === y + 8 ? "#523419" : "#7a5230"));
  planche.rect(x, y, largeur, 6, (i, j) => {
    if (j === y) return t("#d0a468");
    if (j === y + 5) return t("#8a6238");
    return t((i - x) % 13 === 12 ? "#a07a48" : alea(i, j) < 0.04 ? "#a07a48" : "#b98a52");
  });
}

/** Les rangs de tables d'une pièce : leurs convives au milieu de chaque table, la dernière peut être moins garnie. */
function rangsDeTables(largeur: number, nombre: number): { sieges: number; rangs: number; gauche: number; longueur: number; postes: Poste[] } {
  const sieges = Math.max(2, Math.floor((largeur - 16) / SIEGE));
  const rangs = Math.max(1, Math.ceil(nombre / sieges));
  const longueur = sieges * SIEGE + 8;
  const gauche = Math.floor((largeur - longueur) / 2);
  const postes: Poste[] = [];
  for (let rang = 0; rang < rangs; rang++) {
    const ici = Math.min(sieges, nombre - rang * sieges);
    const retrait = Math.floor((sieges - ici) / 2);
    for (let k = 0; k < ici; k++) postes.push({ x: gauche + 4 + (retrait + k) * SIEGE - 5, y: HAUT_DES_TABLES + rang * RANG_DE_TABLE, col: retrait + k, rang });
  }
  return { sieges, rangs, gauche, longueur, postes };
}

/* ---------- La taverne ---------- */

function composerTaverne(largeurDemandee: number, nombre: number, l: Lumiere): Scene {
  const largeur = largeurDe(largeurDemandee);
  const t: Teinte = (couleur) => couleurDuDedans(couleur, l);
  const tables = rangsDeTables(largeur, nombre);
  const hauteur = HAUT_DES_TABLES + tables.rangs * RANG_DE_TABLE + 2;
  const planche = new Planche(largeur, hauteur, t("#7a5c3c"));

  // Le mur du fond : des planches couchées, leurs joints, quelques nœuds.
  planche.rect(0, 0, largeur, SOL_DU_DEDANS, (x, y) => {
    const bande = Math.floor(y / 7);
    if (y % 7 === 6 || (x + bande * 17) % 41 === 0) return t("#4a2f1a");
    if (alea(x >> 1, bande + 60) < 0.012) return t("#523419");
    return t(bande % 2 === 0 ? "#7a5232" : "#70492c");
  });
  // Le sol : un plancher clair, ses lames décalées.
  planche.rect(0, SOL_DU_DEDANS, largeur, hauteur - SOL_DU_DEDANS, (x, y) => {
    const lame = Math.floor((y - SOL_DU_DEDANS) / 6);
    if (y === SOL_DU_DEDANS) return t("#3d2616");
    if ((y - SOL_DU_DEDANS) % 6 === 0) return t("#7a5c3a");
    if ((x + lame * 41) % 83 === 0) return t("#6a4f32");
    return t(alea(x, y) < 0.04 ? "#94744a" : lame % 2 === 0 ? "#a07e50" : "#9a784c");
  });
  // Les travées : étagère et tonneaux, fenêtre, étagère et grand fût.
  const colonnes = poteaux(largeur);
  for (let k = 0; k + 1 < colonnes.length; k++) {
    const de = colonnes[k]! + 5;
    const a = colonnes[k + 1]!;
    const milieu = Math.floor((de + a) / 2);
    if (k % 3 === 1) poserFenetre(planche, milieu - 9, 12, l, t);
    else {
      poserEtagere(planche, de + 5, a - 5, 20, t);
      if (k % 3 === 0) {
        poserTonneau(planche, milieu - 17, SOL_DU_DEDANS + 2, t);
        poserTonneau(planche, milieu + 1, SOL_DU_DEDANS + 2, t);
        poserTonneau(planche, milieu - 8, SOL_DU_DEDANS - 18, t);
      } else poserFut(planche, milieu, SOL_DU_DEDANS + 2, t);
    }
  }
  // La poutre du haut et les poteaux, une torche sur chacun.
  planche.rect(0, 0, largeur, 5, (_x, y) => t(y === 4 ? "#2a1a10" : y === 0 ? "#523419" : "#3d2616"));
  for (const x of colonnes) {
    planche.rect(x, 5, 5, SOL_DU_DEDANS - 4, (i) => t(i === x ? "#684627" : i === x + 4 ? "#2a1a10" : "#472d19"));
    poserTorche(planche, x + 1, 22, l);
  }
  for (let rang = 0; rang < tables.rangs; rang++) poserTable(planche, tables.gauche, HAUT_DES_TABLES + rang * RANG_DE_TABLE + 47, tables.longueur, t);
  return { lieu: "taverne", decor: planche.decor(), postes: tables.postes, adversaires: [], feu: null, fumee: false };
}

/* ---------- La salle de réunion ---------- */

/** Les couleurs du clan : bleu, blanc, rouge. */
const TRICOLORE = ["#2456b8", "#e8e6e0", "#c8283a"] as const;

function composerReunion(largeurDemandee: number, nombre: number, l: Lumiere): Scene {
  const largeur = largeurDe(largeurDemandee);
  const t: Teinte = (couleur) => couleurDuDedans(couleur, l);
  const tables = rangsDeTables(largeur, nombre);
  const hauteur = HAUT_DES_TABLES + tables.rangs * RANG_DE_TABLE + 2;
  const planche = new Planche(largeur, hauteur, t("#6e685d"));

  // Le mur du fond : du torchis sur un soubassement de pierres.
  planche.rect(0, 0, largeur, SOL_DU_DEDANS, (x, y) => {
    if (y >= 38) {
      const lit = Math.floor((y - 38) / 5);
      if ((y - 38) % 5 === 4 || (x + lit * 7) % 14 === 0) return t("#4d4840");
      return t(alea(Math.floor((x + lit * 7) / 14), lit + 3) < 0.4 ? "#7d766a" : "#6a645a");
    }
    if (y % 9 === 8) return t("#a88a5c");
    return t(alea(x, y) < 0.05 ? "#b0935f" : "#bfa16c");
  });
  // Le sol : de larges dalles.
  planche.rect(0, SOL_DU_DEDANS, largeur, hauteur - SOL_DU_DEDANS, (x, y) => {
    const lit = Math.floor((y - SOL_DU_DEDANS) / 12);
    if (y === SOL_DU_DEDANS) return t("#3a362f");
    if ((y - SOL_DU_DEDANS) % 12 === 0 || (x + lit * 19) % 38 === 0) return t("#94846a");
    return t(alea(Math.floor((x + lit * 19) / 38), lit + 40) < 0.35 ? "#a89878" : "#9e8e70");
  });
  // Les travées : la bannière du clan, une fenêtre, deux boucliers accrochés.
  const colonnes = poteaux(largeur);
  for (let k = 0; k + 1 < colonnes.length; k++) {
    const milieu = Math.floor((colonnes[k]! + 5 + colonnes[k + 1]!) / 2);
    if (k % 3 === 0) {
      // La bannière : trois bandes sous une hampe, le bas en pointes.
      planche.rect(milieu - 13, 8, 27, 2, (_i, j) => t(j === 8 ? "#8a5a30" : "#472d19"));
      for (let i = 0; i < 21; i++) {
        const bande = Math.floor(i / 7);
        const pointe = 24 + (3 - Math.abs((i % 7) - 3));
        for (let j = 10; j <= pointe; j++) planche.poser(milieu - 10 + i, j, t(i % 7 === 6 && bande < 2 ? "#9a968c" : TRICOLORE[bande]!));
      }
    } else if (k % 3 === 1) poserFenetre(planche, milieu - 9, 11, l, t);
    else {
      for (const [dx, a, b] of [
        [-10, TRICOLORE[0], TRICOLORE[1]],
        [10, TRICOLORE[2], TRICOLORE[1]],
      ] as const) {
        planche.disque(milieu + dx, 20, 7, (i, j) => {
          const d = i * i + j * j;
          if (d > 44) return t("#3d2616");
          if (d <= 3) return t("#8d95a6");
          return t(i * j >= 0 ? a : b);
        });
      }
    }
  }
  // Un banc le long du mur, dans chaque travée.
  for (let k = 0; k + 1 < colonnes.length; k++) {
    const de = colonnes[k]! + 9;
    const a = colonnes[k + 1]! - 4;
    planche.rect(de, SOL_DU_DEDANS - 6, a - de, 3, (_i, j) => t(j === SOL_DU_DEDANS - 6 ? "#b07a44" : j === SOL_DU_DEDANS - 4 ? "#523419" : "#8a5a30"));
    for (const px of [de + 3, a - 6]) planche.rect(px, SOL_DU_DEDANS - 3, 3, 5, (i) => t(i === px ? "#6a4424" : "#472d19"));
  }
  // Les poutres, les poteaux et leurs torches.
  planche.rect(0, 0, largeur, 5, (_x, y) => t(y === 4 ? "#2a1a10" : y === 0 ? "#523419" : "#3d2616"));
  for (const x of colonnes) {
    planche.rect(x, 5, 5, SOL_DU_DEDANS - 4, (i) => t(i === x ? "#684627" : i === x + 4 ? "#2a1a10" : "#472d19"));
    poserTorche(planche, x + 1, 22, l);
  }
  // La grande table : une carte déroulée au milieu, des bougies entre les sièges.
  for (let rang = 0; rang < tables.rangs; rang++) {
    const y = HAUT_DES_TABLES + rang * RANG_DE_TABLE + 47;
    poserTable(planche, tables.gauche, y, tables.longueur, t);
    const milieu = tables.gauche + Math.floor(tables.longueur / 2);
    planche.rect(milieu - 9, y + 1, 18, 3, (i, j) => (i === milieu - 9 || i === milieu + 8 ? t("#b89c6a") : j === y + 2 && (i - milieu) % 5 === 0 ? t("#8a6238") : t("#e9dcb8")));
    for (let k = 1; k < tables.sieges; k += 2) {
      const x = tables.gauche + 4 + k * SIEGE - 1;
      if (Math.abs(x - milieu) < 12) continue;
      planche.rect(x, y - 4, 2, 5, t("#e9e2cf"));
      planche.rect(x, y - 6, 2, 2, "#ffd75a");
      planche.poser(x, y - 7, "#f58a1f");
    }
  }
  return { lieu: "reunion", decor: planche.decor(), postes: tables.postes, adversaires: [], feu: null, fumee: false };
}

/* ---------- Les maisons ---------- */

const SOL_DES_MAISONS = 40;
const HAUT_DES_LITS = 56;
const LIT_PAS = 74;
const RANG_DE_LIT = 58;

function composerMaisons(largeurDemandee: number, nombre: number, l: Lumiere): Scene {
  const largeur = largeurDe(largeurDemandee);
  const t: Teinte = (couleur) => couleurDuDedans(couleur, l);
  const parRang = Math.max(1, Math.floor((largeur - 4) / LIT_PAS));
  const rangs = Math.max(1, Math.ceil(nombre / parRang));
  const hauteur = HAUT_DES_LITS + rangs * RANG_DE_LIT + 2;
  const planche = new Planche(largeur, hauteur, t("#6b5439"));
  const milieu = Math.floor(largeur / 2);

  // Le mur du fond : un clayonnage sombre, sous les chevrons du toit.
  planche.rect(0, 0, largeur, SOL_DES_MAISONS, (x, y) => {
    if (y % 3 === 2) return t("#7c6040");
    return t(alea(x, y) < 0.06 ? "#8a6c47" : "#94744c");
  });
  // Le sol : la terre battue, des brins de paille.
  planche.rect(0, SOL_DES_MAISONS, largeur, hauteur - SOL_DES_MAISONS, (x, y) => {
    if (y === SOL_DES_MAISONS) return t("#3d2616");
    const a = alea(x, y + 200);
    return t(a < 0.02 ? "#b89c5f" : a < 0.06 ? "#5f4a32" : a > 0.96 ? "#775f41" : "#6b5439");
  });
  // Les travées : une petite fenêtre, des herbes à sécher pendues à la poutre.
  const colonnes = poteaux(largeur);
  for (let k = 0; k + 1 < colonnes.length; k++) {
    const centre = Math.floor((colonnes[k]! + 5 + colonnes[k + 1]!) / 2);
    if (Math.abs(centre - milieu) < 30) continue;
    if (k % 2 === 0) poserFenetre(planche, centre - 9, 12, l, t);
    else {
      for (const dx of [-12, -4, 5, 13]) {
        planche.rect(centre + dx, 5, 1, 4, t("#8a7a55"));
        planche.rect(centre + dx - 1, 9, 3, 6, (i, j) => t((i + j) % 2 === 0 ? (dx % 2 === 0 ? "#6f9d56" : "#c9a23a") : dx % 2 === 0 ? "#4f7d3a" : "#9c7a1f"));
      }
    }
  }
  planche.rect(0, 0, largeur, 5, (_x, y) => t(y === 4 ? "#2a1a10" : y === 0 ? "#523419" : "#3d2616"));
  for (const x of colonnes) planche.rect(x, 5, 5, SOL_DES_MAISONS - 4, (i) => t(i === x ? "#684627" : i === x + 4 ? "#2a1a10" : "#472d19"));
  // Le foyer, au milieu : sa lueur sur le mur et sur la terre, plus large la nuit.
  const feu = { x: milieu, y: SOL_DES_MAISONS + 9 - FEU_HAUTEUR };
  const force = 0.2 + 0.25 * (1 - l.jour);
  planche.disque(milieu, SOL_DES_MAISONS - 2, 26, (dx, dy) => {
    const fond = planche.lire(milieu + dx, SOL_DES_MAISONS - 2 + dy);
    const d = (dx * dx) / 2.2 + dy * dy;
    if (!fond || d > 300 || (d > 130 && (dx + dy) % 2 !== 0)) return null;
    return melanger(fond, "#f5a83a", force * (d > 130 ? 0.5 : 1));
  });
  poserFeu(planche, feu.x, feu.y, false);

  const depart = Math.floor((largeur - (parRang * LIT_PAS - (LIT_PAS - LIT_LARGEUR))) / 2);
  const postes: Poste[] = [];
  for (let rang = 0; rang < rangs; rang++) {
    const ici = Math.min(parRang, nombre - rang * parRang);
    const retrait = Math.floor(((parRang - ici) * LIT_PAS) / 2);
    for (let k = 0; k < ici; k++) postes.push({ x: depart + retrait + k * LIT_PAS, y: HAUT_DES_LITS + rang * RANG_DE_LIT, col: k, rang });
  }
  return { lieu: "maisons", decor: planche.decor(), postes, adversaires: [], feu, fumee: false };
}

/**
 * Un lieu composé pour une largeur en cases, le nombre de Gaulois qui s'y trouvent et la lumière de l'heure. La largeur ne
 * descend pas sous `DECOR_LARGEUR_MIN` ; la hauteur suit le nombre.
 */
export function composerLieu(lieu: Lieu, largeur: number, nombre: number, lumiere: Lumiere): Scene {
  const n = Math.max(0, Math.floor(nombre));
  if (lieu === "taverne") return composerTaverne(largeur, n, lumiere);
  if (lieu === "reunion") return composerReunion(largeur, n, lumiere);
  if (lieu === "bataille") return composerBataille(largeur, n, lumiere);
  if (lieu === "maisons") return composerMaisons(largeur, n, lumiere);
  return composerPlace(largeur, n, lumiere);
}

/** La hauteur du haut d'un lieu, en cases : ce qui se voit même quand personne ne s'y trouve. */
export const HAUT_DU_LIEU: Readonly<Record<Lieu, number>> = {
  place: TETE_DU_DEHORS,
  bataille: TETE_DU_DEHORS,
  taverne: SOL_DU_DEDANS,
  reunion: SOL_DU_DEDANS,
  maisons: SOL_DES_MAISONS,
};
