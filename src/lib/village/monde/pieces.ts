/**
 * Les pièces du monde du village dessinées pour le panorama, case par case, à la taille des Gaulois (48 × 64) : le
 * mobilier et le dedans des pièces ouvertes (tables, tonneaux, torches, lits vides), l'étal du marché, le camp d'en face,
 * la lisière, le sol de la grand-rue, le ruisseau et son gué, les piquets d'un emplacement pas encore bâti. Les maisons
 * sont dans `maisons.ts`, la taverne et la salle de réunion dans `salles.ts`, les arbres dans `arbres.ts`. Les matières et
 * les couleurs sont celles du village d'avant (`decor.ts`, `lieux.ts`) : chaume, torchis, bois, pierre.
 *
 * Tout se pose en colonnes du monde, sur une `Planche` ; rien n'est tiré au hasard : `alea(x, y)` donne un grain qui ne
 * bouge pas. Les couleurs du dehors suivent l'heure (`paletteDuDehors`), celles du dedans sont éclairées par leurs torches
 * (`couleurDuDedans`), ce qui éclaire garde sa couleur. Aucun dessin ne rappelle une œuvre existante.
 * Design : Claude Fable 5.2.
 */
import { type Palette, type Planche, alea } from "../decor";
import { type Lumiere, cielDuVillage, couleurDuDehors, melanger } from "../lumiere";
import { type Essence, poserArbre } from "./arbres";
import { LIT_HAUTEUR, LIT_LARGEUR } from "./poses-monde";
import { type Emplacement, LIGNE, RUE_HAUTEUR, PIED_DU_PONT, PLANCHER, type Plan } from "./plan";

type Teinte = (couleur: string) => string;

/** Les couleurs du clan : bleu, blanc, rouge. */
export const TRICOLORE = ["#2456b8", "#e8e6e0", "#c8283a"] as const;

/* ---------- Les mesures des intérieurs, que `postes.ts` relit pour y asseoir et y coucher les Gaulois ---------- */

/** Une salle (taverne, salle de réunion) : l'avant-toit, et la colonne du premier siège de chaque rang de table. */
export const SALLE_AVANT_TOIT = 128;
export const SALLE_SIEGE_DEVANT = 30;
export const SALLE_SIEGE_DERRIERE = 49;
/** Le rang du fond est assis 30 rangées plus haut : on le voit par-dessus celui de devant. */
export const SALLE_RECUL = 30;
/** L'écart entre deux convives à l'aise, et le nombre de sièges de chaque rang. */
export const SIEGE = 38;
export const SIEGES_DEVANT = 8;
export const SIEGES_DERRIERE = 7;

/* ---------- Le chaume ---------- */

/**
 * Un toit de chaume vu de face : de la rangée `haut` (le faîte, large de deux fois `demiFaite`) à la rangée `bas`
 * (l'avant-toit, de `x0` à `x1`). En rangs, éclairé à gauche, comme les huttes d'avant.
 */
export function poserChaume(planche: Planche, p: Palette, x0: number, x1: number, haut: number, bas: number, demiFaite: number): void {
  const cx = (x0 + x1) / 2;
  const demiBas = (x1 - x0) / 2;
  for (let y = haut; y <= bas; y++) {
    const part = (y - haut) / Math.max(1, bas - haut);
    const demi = Math.round(demiFaite + (demiBas - demiFaite) * part);
    for (let dx = -demi; dx <= demi; dx++) {
      const x = Math.round(cx) + dx;
      let couleur: string = dx < -demi / 3 ? p.chaume.clair : dx > demi / 3 ? p.chaume.sombre : p.chaume.fond;
      if ((y - haut) % 7 === 6) couleur = p.chaume.rang;
      else if (alea(x, y) < 0.14) couleur = p.chaume.brin;
      if (Math.abs(dx) >= demi - 1 || y === bas || y === bas - 1) couleur = p.chaume.bord;
      planche.poser(x, y, couleur);
    }
  }
  // Le faîte : des bottes de paille liées, le long de l'arête.
  for (let dx = -demiFaite - 2; dx <= demiFaite + 2; dx++) {
    const x = Math.round(cx) + dx;
    planche.poser(x, haut - 1, (x & 3) === 0 ? p.chaume.bord : p.chaume.rang);
    if ((x & 7) < 2) planche.poser(x, haut - 2, p.chaume.bord);
  }
}

/** Un toit de bardeaux de bois, plus sombre : celui de la salle de réunion. */
export function poserBardeaux(planche: Planche, p: Palette, x0: number, x1: number, haut: number, bas: number, demiFaite: number): void {
  const cx = Math.round((x0 + x1) / 2);
  const demiBas = (x1 - x0) / 2;
  for (let y = haut; y <= bas; y++) {
    const part = (y - haut) / Math.max(1, bas - haut);
    const demi = Math.round(demiFaite + (demiBas - demiFaite) * part);
    const rang = Math.floor((y - haut) / 6);
    for (let dx = -demi; dx <= demi; dx++) {
      const x = cx + dx;
      let couleur: string = dx < -demi / 3 ? p.bois.clair : dx > demi / 3 ? p.bois.sombre : p.bois.fond;
      if ((y - haut) % 6 === 5) couleur = p.bois.creux;
      else if ((x + rang * 4) % 8 === 0) couleur = p.bois.sombre;
      else if (alea(x >> 1, rang) < 0.1) couleur = p.bois.autre;
      if (Math.abs(dx) >= demi - 1 || y >= bas - 1) couleur = p.bois.creux;
      planche.poser(x, y, couleur);
    }
  }
  planche.rect(cx - demiFaite - 3, haut - 2, demiFaite * 2 + 7, 2, (x) => ((x & 1) === 0 ? p.bois.clair : p.bois.fond));
}

/* ---------- Le mobilier des intérieurs (mêmes dessins que les lieux d'avant, `lieux.ts`) ---------- */

/** Une torche sur un poteau : sa flamme éclaire, et le mur rougit autour, plus fort la nuit. */
export function poserTorche(planche: Planche, x: number, y: number, l: Lumiere): void {
  const force = 0.22 + 0.22 * (1 - l.jour);
  planche.disque(x + 1, y - 2, 11, (dx, dy) => {
    const fond = planche.lire(x + 1 + dx, y - 2 + dy);
    const d = dx * dx + dy * dy;
    if (!fond || (d > 56 && (dx + dy) % 2 !== 0)) return null;
    return melanger(fond, "#f5a83a", force * (d > 56 ? 0.6 : 1));
  });
  planche.rect(x, y, 3, 7, "#3d2616");
  planche.rect(x + 1, y, 1, 7, "#5d3d22");
  planche.lettres(x - 1, y - 6, [".r...", ".ro..", "royo.", "royor", ".oyo."], { r: "#e2452a", o: "#f58a1f", y: "#ffd75a" });
}

/** Une fenêtre : le ciel de l'heure entre deux volets ouverts. */
export function poserFenetre(planche: Planche, x: number, y: number, l: Lumiere, t: Teinte): void {
  const ciel = cielDuVillage(l);
  planche.rect(x - 5, y, 5, 16, (i, j) => ((j - y) % 5 === 4 ? t("#523419") : i === x - 5 ? t("#8a5a30") : t("#70492c")));
  planche.rect(x + 20, y, 5, 16, (i, j) => ((j - y) % 5 === 4 ? t("#523419") : i === x + 24 ? t("#523419") : t("#70492c")));
  planche.rect(x, y, 20, 16, t("#3d2616"));
  planche.rect(x + 2, y + 2, 16, 12, (_i, j) => (j < y + 7 ? ciel[2]! : j < y + 11 ? ciel[3]! : ciel[4]!));
  if (l.jour < 0.4) {
    planche.poser(x + 5, y + 4, melanger(ciel[2]!, "#c0c9e2", 1 - l.jour * 2.5));
    planche.poser(x + 13, y + 3, melanger(ciel[2]!, "#c0c9e2", 1 - l.jour * 2.5));
  }
  planche.rect(x + 9, y + 2, 2, 12, t("#3d2616"));
  planche.rect(x - 1, y + 16, 22, 2, t("#8a5a30"));
}

/** Un tonneau debout, posé sur la rangée `bas`. */
export function poserTonneau(planche: Planche, x: number, bas: number, t: Teinte): void {
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
export function poserFut(planche: Planche, cx: number, bas: number, t: Teinte): void {
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
export function poserEtagere(planche: Planche, de: number, a: number, y: number, t: Teinte): void {
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
export function poserTable(planche: Planche, x: number, y: number, largeur: number, t: Teinte): void {
  planche.rect(x + 2, y + 19, largeur - 4, 2, (i, j) => ((i + j) % 2 === 0 ? t("#3d2616") : null));
  for (const px of [x + 4, x + Math.floor(largeur / 2) - 2, x + largeur - 8]) {
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

/* ---------- Les intérieurs ouverts : une boîte vue de face, dont on a ôté le mur de devant ---------- */

/** Ce qu'il faut pour dessiner une pièce ouverte : son mur du fond, son sol qui vient vers nous, ses deux murs de côté. */
export interface Piece {
  /** Les colonnes de l'ouverture, sur le devant. */
  de: number;
  a: number;
  /** Les rangées du haut du mur, du pied du mur du fond, et du bord du sol sur le devant. */
  haut: number;
  fond: number;
  devant: number;
  /** De combien de cases le mur du fond est plus étroit que l'ouverture, de chaque côté. */
  fuite: number;
  mur: (x: number, y: number) => string;
  sol: (x: number, y: number, part: number) => string;
  cote: (x: number, y: number) => string;
}

/** Dessine la pièce : le fond, le sol en trapèze, les deux murs de côté dans l'ombre, l'ombre du plafond en haut du mur. */
export function poserPiece(planche: Planche, piece: Piece, t: Teinte): void {
  const { de, a, haut, fond, devant, fuite } = piece;
  for (let y = haut; y <= devant; y++) {
    // Le retrait des murs de côté à cette rangée : entier au fond, nul sur le devant.
    const part = y <= fond ? 0 : (y - fond) / Math.max(1, devant - fond);
    const retrait = Math.round(fuite * (1 - part));
    for (let x = de; x <= a; x++) {
      const dansLeCote = x < de + retrait || x > a - retrait;
      let couleur: string;
      if (y > fond && !dansLeCote) couleur = piece.sol(x, y, part);
      else if (dansLeCote || x < de + fuite || x > a - fuite) couleur = melanger(piece.cote(x, y), "#1a1410", x < de + fuite ? 0.22 : 0.34);
      else {
        couleur = piece.mur(x, y);
        if (y < haut + 5) couleur = melanger(couleur, "#1a1410", 0.3 - (y - haut) * 0.05);
      }
      planche.poser(x, y, t(couleur));
    }
  }
  // L'arête entre le mur du fond et le sol, et celles des deux coins.
  planche.rect(de + fuite, fond, a - de - 2 * fuite + 1, 1, t("#2a1a10"));
  planche.rect(de + fuite, haut, 1, fond - haut, t("#2a1a10"));
  planche.rect(a - fuite, haut, 1, fond - haut, t("#2a1a10"));
}

/** Une cheminée de pierre sur un toit : `x` sa colonne de gauche, `haut` sa première rangée, `bas` la dernière. */
export function poserCheminee(planche: Planche, l: Lumiere, x: number, haut: number, bas: number): void {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  planche.rect(x, haut + 3, 14, bas - haut - 2, (i, j) => {
    const lit = Math.floor((j - haut) / 5);
    if ((j - haut) % 5 === 4 || (i - x + lit * 4) % 8 === 0) return c("#5c564c", "#2c2a30");
    return i < x + 3 ? c("#a39a8a", "#56545e") : i > x + 10 ? c("#6f685c", "#3a3840") : c("#8a8274", "#474550");
  });
  planche.rect(x - 2, haut, 18, 3, (_i, j) => (j === haut ? c("#b3aa9a", "#5e5c66") : c("#6f685c", "#3a3840")));
}

/* ---------- Les maisons ---------- */

/** Un lit vide, vu de côté : la tête de lit, le matelas de paille, l'oreiller, une couverture pliée au pied. */
export function poserLitVide(planche: Planche, x: number, y: number, rang: number, t: Teinte): void {
  const laine = (["#a8483a", "#3f5f9a", "#4f7d3a", "#b98a3a"] as const)[rang % 4]!;
  planche.rect(x, y + 12, 3, LIT_HAUTEUR - 12, (i) => t(i === x ? "#8a5a30" : "#4a301c"));
  planche.rect(x + LIT_LARGEUR - 3, y + 20, 3, LIT_HAUTEUR - 20, (i) => t(i === x + LIT_LARGEUR - 3 ? "#8a5a30" : "#4a301c"));
  planche.rect(x + 3, y + 27, LIT_LARGEUR - 6, 7, (i, j) => {
    const a = alea(i + 40, j + 7);
    return t(j === y + 27 ? "#dcc480" : a < 0.14 ? "#b3964f" : "#cdb26a");
  });
  planche.rect(x + 2, y + 34, LIT_LARGEUR - 4, 3, (_i, j) => t(j === y + 34 ? "#8a5a30" : "#4a301c"));
  planche.rect(x + 4, y + 22, 17, 6, (i, j) => ((i === x + 4 || i === x + 20) && j === y + 22 ? null : t(j === y + 27 ? "#cfc5aa" : "#e9e2cf")));
  planche.rect(x + 50, y + 21, 17, 7, (i, j) => t(j === y + 21 || i === x + 50 || i === x + 66 ? melanger(laine, "#1a1410", 0.3) : (i - x) % 4 === 0 ? melanger(laine, "#1a1410", 0.16) : laine));
}


/* ---------- La taverne et la salle de réunion ---------- */

/** Les deux rangs de tables d'une salle, que les convives viennent garnir. */
export function poserTables(planche: Planche, e: Emplacement, t: Teinte): void {
  const devant = PLANCHER - 68 + 47;
  poserTable(planche, e.x + SALLE_SIEGE_DERRIERE - 8, devant - SALLE_RECUL, (SIEGES_DERRIERE - 1) * SIEGE + 64, t);
  poserTable(planche, e.x + SALLE_SIEGE_DEVANT - 8, devant, (SIEGES_DEVANT - 1) * SIEGE + 64, t);
}


/** Une lanterne pendue à la sablière : elle éclaire, sa couleur ne change pas. */
export function poserLanterne(planche: Planche, p: Palette, x: number, y: number): void {
  planche.rect(x, y, 1, 6, p.bois.creux);
  planche.rect(x - 2, y + 6, 5, 1, p.bois.creux);
  planche.rect(x - 2, y + 7, 5, 6, (i, j) => (i === x - 2 || i === x + 2 ? p.bois.creux : j === y + 9 || j === y + 10 ? "#fff1a8" : "#ffd75a"));
  planche.rect(x - 2, y + 13, 5, 1, p.bois.creux);
}



/* ---------- L'étal du marché ---------- */

/** L'étal : un comptoir de planches sous un auvent rayé d'ocre et d'écru, des objets à vendre. Un clic ouvre « Le marché ». */
export function poserEtal(planche: Planche, p: Palette, l: Lumiere, e: Emplacement): void {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const x = e.x;
  const auvent = e.pied - e.hauteur + 1;
  const comptoir = e.pied - 36;
  // Le fond de l'étal, dans l'ombre de l'auvent, et ce qui y pend : une tunique, un casque rond, une besace.
  planche.rect(x + 8, auvent + 22, e.largeur - 16, comptoir - auvent - 22, (i, j) => ((i + j) % 9 === 0 ? p.bois.sombre : p.bois.creux));
  planche.rect(x + 8, auvent + 26, e.largeur - 16, 1, p.bois.corde);
  planche.lettres(x + 22, auvent + 27, [".b..b.", "bbbbbb", "bbbbbb", ".bccb.", ".bccb.", ".bbbb.", ".bbbb.", ".bbbb."], { b: c("#4f7d3a", "#2c4a26"), c: c("#6f9d56", "#3c5f34") });
  planche.lettres(x + 54, auvent + 27, ["..ss..", ".sSSs.", "sSSSSs", "sSSSSs", "ssssss", ".a..a."], { s: c("#8d95a6", "#4f5666"), S: c("#c0c9e2", "#6f7890"), a: p.bois.sombre });
  planche.lettres(x + 86, auvent + 27, ["..cc..", ".c..c.", "bbbbbb", "bBBBBb", "bBBBBb", "bBBBBb", ".bbbb."], { c: p.bois.corde, b: c("#8a5a30", "#5d3d22"), B: c("#b07a44", "#7d5631") });
  // Le comptoir : un plateau, des planches debout, deux caisses devant.
  planche.rect(x + 4, comptoir, e.largeur - 8, 5, (_i, j) => (j === comptoir ? p.bois.clair : j === comptoir + 4 ? p.bois.creux : p.bois.autre));
  planche.rect(x + 8, comptoir + 5, e.largeur - 16, e.pied - comptoir - 4, (i, j) => ((i - x) % 9 === 0 ? p.bois.creux : j === e.pied ? p.bois.creux : alea(i, j) < 0.05 ? p.bois.sombre : p.bois.fond));
  // Sur le plateau : un bouclier rond, une cruche, des statères en pile, une épée couchée.
  planche.disque(x + 24, comptoir - 9, 8, (i, j) => {
    const d = i * i + j * j;
    if (d > 56) return p.bois.creux;
    if (d <= 3) return c("#c0c9e2", "#6f7890");
    return i * j >= 0 ? c(TRICOLORE[0], "#16306a") : c(TRICOLORE[1], "#84827e");
  });
  planche.lettres(x + 44, comptoir - 9, [".aaa.", ".aba.", "aabaa", "abcba", "abcba", "abcba", "abbba", "abbba", ".aaa."], { a: c("#5a2f18", "#2f190d"), b: c("#b0683c", "#5e3820"), c: c("#d08a5a", "#754c30") });
  for (let k = 0; k < 3; k++) planche.rect(x + 62 + k * 7, comptoir - 2 - k * 2, 6, 2 + k * 2, (i, j) => ((j - comptoir) % 2 === 0 ? "#b8860b" : i % 3 === 0 ? "#ffe9a0" : "#e2b23c"));
  planche.rect(x + 86, comptoir - 3, 26, 2, c("#c0c9e2", "#6f7890"));
  planche.rect(x + 86, comptoir - 5, 3, 6, c("#8a5a30", "#5d3d22"));
  planche.rect(x + 82, comptoir - 3, 4, 2, c("#e2b23c", "#8a6c24"));
  // Les deux poteaux et l'auvent : des bandes d'ocre et d'écru, le bas découpé en festons.
  for (const px of [x + 4, x + e.largeur - 8]) planche.rect(px, auvent + 16, 4, e.pied - auvent - 15, (i) => (i === px ? p.bois.clair : i === px + 3 ? p.bois.creux : p.bois.fond));
  const ocre = c("#c9722a", "#6e3f1c");
  const ocreSombre = c("#a2561c", "#573014");
  const ecru = c("#efe6d0", "#8a8576");
  const ecruSombre = c("#cfc5aa", "#726d5f");
  for (let i = 0; i < e.largeur; i++) {
    const bande = Math.floor(i / 12) % 2 === 0;
    const feston = 21 + (3 - Math.abs((i % 12) - 5) / 2);
    for (let j = 0; j < feston; j++) {
      // L'auvent penche vers l'avant : sa lisière haute est plus sombre.
      const sombre = j < 3 || j > 16;
      planche.poser(x + i, auvent + j, bande ? (sombre ? ocreSombre : ocre) : sombre ? ecruSombre : ecru);
    }
  }
  planche.rect(x, auvent, e.largeur, 1, p.bois.creux);
}

/* ---------- Le camp d'en face ---------- */

/** Le camp de l'autre clan, inventé pour ce site : trois tentes de toile prune, un fanion à la pointe. */
export function poserCamp(planche: Planche, p: Palette, e: Emplacement): void {
  const tentes = [
    { cx: e.x + 62, haut: 78, demi: 46 },
    { cx: e.x + 236, haut: 70, demi: 42 },
    { cx: e.x + 150, haut: 98, demi: 56 },
  ];
  for (const tente of tentes) {
    const sommet = e.pied - tente.haut;
    for (let r = 0; r <= tente.haut; r++) {
      const demi = Math.round((r * tente.demi) / tente.haut) + 1;
      for (let dx = -demi; dx <= demi; dx++) {
        let couleur: string = dx < -demi / 3 ? p.prune.clair : dx > demi / 3 ? p.prune.sombre : p.prune.fond;
        if (r % 13 === 12) couleur = p.prune.sombre;
        if (Math.abs(dx) >= demi - 1) couleur = p.prune.trait;
        // L'entrée : une fente sombre qui s'ouvre vers le bas.
        if (r > tente.haut * 0.42 && Math.abs(dx) <= (r - tente.haut * 0.42) / 3.2) couleur = p.prune.trait;
        planche.poser(tente.cx + dx, sommet + r, couleur);
      }
    }
    planche.rect(tente.cx, sommet - 20, 2, 20, p.prune.trait);
    planche.rect(tente.cx + 2, sommet - 20, 16, 9, (i, j) => (i - tente.cx > 11 && j - (sommet - 20) > 2 && j - (sommet - 20) < 6 ? null : (j - sommet) % 3 === 0 ? p.prune.fond : p.prune.clair));
  }
  // Un râtelier de lances, planté entre les tentes.
  const rx = e.x + 104;
  planche.rect(rx, e.pied - 22, 28, 2, p.prune.trait);
  for (const dx of [2, 9, 16, 23]) {
    planche.rect(rx + dx, e.pied - 44, 1, 45, p.prune.sombre);
    planche.rect(rx + dx - 1, e.pied - 48, 3, 4, p.prune.clair);
  }
}

/* ---------- La lisière ---------- */

/** La lisière de la forêt, à un bout du monde : des arbres serrés sur deux rangs, des buissons devant. */
export function poserLisiere(planche: Planche, p: Palette, l: Lumiere, de: number, a: number): void {
  const essences: readonly Essence[] = ["sapin", "hetre", "chene", "sapin", "bouleau", "hetre", "sapin"];
  for (let x = de - 20, n = 0; x <= a + 20; x += 50, n++) poserArbre(planche, p, l, essences[n % essences.length]!, x + Math.round(alea(x, 3) * 14), LIGNE - 8 - Math.round(alea(x, 9) * 8), 900 + n, 0.96 + alea(x, 5) * 0.16);
  for (let x = de - 4, n = 0; x <= a + 10; x += 72, n++) poserArbre(planche, p, l, essences[(n * 3 + 2) % essences.length]!, x + Math.round(alea(x, 13) * 16), LIGNE + 3 + Math.round(alea(x, 19) * 6), 950 + n, 0.8 + alea(x, 15) * 0.2);
  for (let x = de, n = 0; x <= a; x += 44, n++) poserArbre(planche, p, l, "buisson", x + Math.round(alea(x, 23) * 10), LIGNE + 14 + Math.round(alea(x, 29) * 8), 980 + n, 1.1);
}

/* ---------- Un emplacement pas encore bâti ---------- */

/** Avant le tour d'un bâtiment : son emplacement tracé sur l'herbe, des piquets, un cordeau, un écriteau de planches. */
export function poserPiquets(planche: Planche, p: Palette, e: Emplacement, ecriteau = true): void {
  const piquets: number[] = [];
  const nombre = Math.max(2, Math.round(e.largeur / 56) + 1);
  for (let k = 0; k < nombre; k++) piquets.push(e.x + 3 + Math.round((k * (e.largeur - 9)) / (nombre - 1)));
  // Le cordeau pend un peu entre deux piquets.
  for (let k = 0; k + 1 < piquets.length; k++) {
    const de = piquets[k]! + 1;
    const a = piquets[k + 1]! + 1;
    for (let x = de; x <= a; x++) {
      const part = (x - de) / (a - de);
      planche.poser(x, e.pied - 11 + Math.round(4 * 4 * part * (1 - part)), (x & 3) === 0 ? p.bois.cordeSombre : p.bois.corde);
    }
  }
  for (const x of piquets) {
    planche.rect(x, e.pied - 15, 3, 16, (i, j) => (j === e.pied - 15 ? p.bois.clair : i === x ? p.bois.clair : i === x + 2 ? p.bois.sombre : p.bois.fond));
    planche.poser(x + 1, e.pied - 16, p.bois.clair);
  }
  if (!ecriteau) return;
  // L'écriteau, au milieu : deux planches clouées sur un pieu.
  const cx = e.x + Math.floor(e.largeur / 2);
  planche.rect(cx - 1, e.pied - 22, 3, 23, (i) => (i === cx - 1 ? p.bois.clair : i === cx + 1 ? p.bois.sombre : p.bois.fond));
  planche.rect(cx - 11, e.pied - 30, 23, 11, (i, j) => (i === cx - 11 || i === cx + 11 || j === e.pied - 30 || j === e.pied - 20 ? p.bois.creux : j === e.pied - 25 ? p.bois.sombre : p.bois.clair));
  planche.poser(cx - 8, e.pied - 28, p.bois.creux);
  planche.poser(cx + 8, e.pied - 28, p.bois.creux);
}

/* ---------- Le sol : l'herbe, le chemin, le ruisseau ---------- */

const monter = (v: number): number => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};

/** La rangée du milieu du chemin à cette colonne : il serpente, et remonte vers le pont à l'approche du ruisseau. */
export function rangeeDuChemin(plan: Plan, x: number): number {
  const libre = 353 + Math.round(6 * Math.sin(x / 97) + 3 * Math.sin(x / 41 + 1));
  const pres = monter(1 - Math.abs(x - plan.ruisseau.x) / 170);
  return Math.round(libre + (PIED_DU_PONT - 5 - libre) * pres);
}

/** La demi-largeur du chemin : il s'étrécit là où il sort de la forêt et là où il se perd dans le pré. */
function demiChemin(plan: Plan, x: number): number {
  if (x < plan.chemin.de || x > plan.chemin.a) return 0;
  const bout = Math.min(1, (x - plan.chemin.de) / 70, (plan.chemin.a - x) / 110);
  return Math.round((16 + 2 * Math.sin(x / 23)) * (0.25 + 0.75 * bout));
}

/** Le ruisseau à cette rangée : la colonne de son milieu et sa demi-largeur. Il vient du fond et s'élargit vers l'avant. */
export function litDuRuisseau(plan: Plan, y: number): { x: number; demi: number } {
  const part = (y - LIGNE) / (PIED_DU_PONT - LIGNE);
  const demi = (plan.ruisseau.largeur / 2) * Math.min(1.5, Math.max(0.12, 0.42 + 0.58 * part));
  return { x: plan.ruisseau.x + Math.round(5 * Math.sin((y - LIGNE) / 19)), demi: Math.round(demi) };
}

/** Les couleurs de l'eau, à cette heure. */
export function couleursDeLEau(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  return { fond: c("#3f86c4", "#16305c"), claire: c("#8cc4ee", "#3c5f96"), sombre: c("#2c6aa6", "#0f2244"), ecume: c("#dff1fb", "#7f96bd"), pierre: c("#8d95a6", "#4f5666"), pierreClaire: c("#c0c9e2", "#6f7890"), pierreSombre: c("#5c6474", "#343a47") };
}

/**
 * Le sol du monde, de la colonne `de` à la colonne `a` : l'herbe sous la ligne du fond, le chemin de terre battue, la terre
 * à nu autour du grand feu et devant les portes, le ruisseau et ses rives.
 */
export function poserSol(planche: Planche, p: Palette, l: Lumiere, plan: Plan, de: number, a: number, seuils: readonly { x: number; demi: number }[]): void {
  const eau = couleursDeLEau(l);
  const lointaine = melanger(p.herbe.fond, p.herbe.sombre, 0.55);
  const feu = plan.feu;
  for (let y = LIGNE; y < RUE_HAUTEUR; y++) {
    const lit = litDuRuisseau(plan, y);
    for (let x = de; x < a; x++) {
      // L'herbe : plus sombre au loin, son bord clair sur la ligne du fond, des brins clairs et sombres.
      const al = alea(x + 3, y + 1009);
      let couleur: string = al < 0.045 ? p.herbe.claire : al < 0.08 ? p.herbe.sombre : p.herbe.fond;
      if (y === LIGNE) couleur = al < 0.5 ? p.herbe.bord : p.herbe.fond;
      else if (y < LIGNE + 12 && (x + y) % 2 === 0 && al > 0.08 + (y - LIGNE) / 14) couleur = lointaine;

      // Le chemin : la terre battue, ses bords mêlés à l'herbe, quelques cailloux.
      const demi = demiChemin(plan, x);
      if (demi > 0) {
        const ecart = Math.abs(y - rangeeDuChemin(plan, x));
        const t = alea(x, y + 300);
        if (ecart <= demi - 3) couleur = t < 0.1 ? p.terre.claire : t < 0.2 ? p.terre.sombre : p.terre.fond;
        else if (ecart <= demi && (x + y) % 2 === 0) couleur = t < 0.5 ? p.terre.fond : p.terre.sombre;
      }
      // Devant les portes : l'herbe usée par les pas.
      for (const seuil of seuils) {
        const dx = (x - seuil.x) / seuil.demi;
        const dy = (y - (LIGNE + 9)) / 9;
        const d = dx * dx + dy * dy;
        if (d <= 1 && (d <= 0.45 || (x + y) % 2 === 0)) couleur = alea(x, y + 300) < 0.2 ? p.terre.sombre : p.terre.fond;
      }
      // Autour du grand feu : la terre battue, et l'herbe éclairée, mêlée en damier, plus loin la nuit.
      {
        const dx = (x - feu.x) / 66;
        const dy = (y - (feu.pied - 2)) / 15;
        const d = dx * dx + dy * dy;
        if (d <= 1) {
          const t = alea(x, y + 300);
          couleur = t < 0.12 ? p.terre.claire : t < 0.22 ? p.terre.sombre : p.terre.fond;
        } else if (d <= 2.1 && (x + y) % 2 === 0) couleur = p.lueur;
        else if (d <= 2.1 + 3.2 * p.nuit && (x + y) % 4 === 0) couleur = p.lueur;
      }
      // Le pré du champ de bataille : l'herbe piétinée là où les deux lignes se touchent.
      {
        const dx = (x - (plan.pre.front + 48)) / Math.max(120, plan.pre.parRang * plan.pre.pas * 0.9);
        const dy = (y - 352) / 26;
        const d = dx * dx + dy * dy;
        const t = alea(x + 13, y + 900);
        if (d <= 0.5) couleur = t < 0.14 ? p.terre.claire : t < 0.3 ? p.terre.sombre : p.terre.fond;
        else if (d <= 1 && (x + y) % 2 === 0) couleur = t < 0.5 ? p.terre.fond : p.terre.sombre;
      }
      // Le ruisseau : sa rive de terre sombre, l'eau, ses reflets, l'écume au pied du gué.
      const rive = Math.abs(x - lit.x) - lit.demi;
      if (rive <= 0) {
        const t = alea(x >> 2, y);
        couleur = rive > -2 ? eau.sombre : t < 0.09 ? eau.claire : t > 0.93 ? eau.sombre : eau.fond;
      } else if (rive <= 2) couleur = p.terre.sombre;
      else if (rive <= 5 && (x + y) % 2 === 0) couleur = p.herbe.sombre;
      planche.poser(x, y, couleur);
    }
  }
  // Les touffes d'herbe et les fleurs, par-dessus : jamais sur le chemin, la terre ou l'eau.
  for (let y = LIGNE + 4; y < RUE_HAUTEUR - 1; y++) {
    for (let x = de - 2; x < a + 2; x++) {
      const al = alea(x + 71, y + 13);
      if (al > 0.006) continue;
      const fond = planche.lire(x, y);
      if (fond !== p.herbe.fond && fond !== p.herbe.claire && fond !== p.herbe.sombre) continue;
      if (al < 0.0016) {
        const fleur = alea(x, y + 5) < 0.5 ? couleurDuDehors("#f4ecc8", "#7f8aa6", l) : couleurDuDehors("#ffd75a", "#8a7a55", l);
        planche.poser(x, y, fleur);
        planche.poser(x, y + 1, p.herbe.sombre);
      } else {
        planche.poser(x, y, p.herbe.claire);
        planche.poser(x - 1, y - 1, p.herbe.claire);
        planche.poser(x + 1, y - 1, p.herbe.claire);
        planche.poser(x, y + 1, p.herbe.sombre);
      }
    }
  }
}

/** Les roseaux des deux rives et, tant que le pont n'est pas bâti, les pierres du gué. */
export function poserRives(planche: Planche, p: Palette, l: Lumiere, plan: Plan, pontBati: boolean): void {
  const eau = couleursDeLEau(l);
  // La source se perd dans les buissons, au fond.
  const fond = litDuRuisseau(plan, LIGNE);
  poserArbre(planche, p, l, "buisson", fond.x - 9, LIGNE + 3, 61, 1.1);
  poserArbre(planche, p, l, "buisson", fond.x + 10, LIGNE + 2, 62, 1.3);
  for (let y = LIGNE + 14; y < RUE_HAUTEUR - 4; y += 9) {
    const lit = litDuRuisseau(plan, y);
    const cote = ((y / 9) | 0) % 2 === 0 ? -1 : 1;
    if (Math.abs(y - PIED_DU_PONT) < 16) continue;
    const x = lit.x + cote * (lit.demi + 3);
    for (const [dx, haut] of [
      [0, 9],
      [2, 7],
      [-2, 6],
      [4, 5],
    ] as const) {
      planche.rect(x + dx * cote, y - haut, 1, haut, p.feuilles.fond);
      planche.poser(x + dx * cote, y - haut - 1, (dx & 2) === 0 ? p.tronc.fond : p.feuilles.claire);
    }
  }
  if (pontBati) return;
  // Le gué : des pierres plates d'une rive à l'autre, là où passera le pont, et un peu d'écume en aval.
  const lit = litDuRuisseau(plan, PIED_DU_PONT - 4);
  const pierres = Math.max(3, Math.round((lit.demi * 2) / 15));
  for (let k = 0; k < pierres; k++) {
    const cx = lit.x - lit.demi + Math.round(((k + 0.5) * lit.demi * 2) / pierres);
    const cy = PIED_DU_PONT - 4 + (k % 2 === 0 ? 0 : 2);
    for (let dy = -2; dy <= 2; dy++) {
      const demi = dy === -2 || dy === 2 ? 3 : 5;
      for (let dx = -demi; dx <= demi; dx++) planche.poser(cx + dx, cy + dy, dy === -2 ? eau.pierreClaire : dy === 2 ? eau.pierreSombre : dx < -2 ? eau.pierreClaire : eau.pierre);
    }
    for (const dx of [-4, -1, 3]) planche.poser(cx + dx, cy + 4, eau.ecume);
  }
}

/* ---------- Les cheminées qui fument ---------- */

