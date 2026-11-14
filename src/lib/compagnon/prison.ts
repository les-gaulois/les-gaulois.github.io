/**
 * La prison du Gaulois compagnon, en cases : quand le visiteur le range, il n'est plus caché mais enfermé dans une petite
 * cage du village, dans le coin de la fenêtre. Une cage de bois sur deux pierres, coiffée de chaume, des barreaux de fer,
 * un gros cadenas doré sur le montant, la clé pendue au bord du toit, juste hors de portée, un peu d'herbe et une fleur.
 *
 * Deux images : le fond (le mur de planches et la paille du sol), derrière le Gaulois, et le devant (toit, montants,
 * barreaux, cadenas), posé sur lui. Les barreaux passent de part et d'autre de son nez et laissent voir ses deux yeux.
 * Tout est calculé, rien n'est tiré au hasard à l'écran. Dessiné pour ce site, sans emprunt à une œuvre existante.
 * Design : Claude Fable 5.2.
 */
import { Planche, alea } from "../village/decor";

/** Taille de la prison, en cases. */
export const PRISON_L = 68;
export const PRISON_H = 91;
/** Où se tient le prisonnier : le coin haut gauche de son dessin de 48 × 64 cases, dans la grille de la prison. */
export const PRISONNIER = { x: 10, y: 19 } as const;

/** Le dessin du Gaulois : 48 × 64 cases (`GAULOIS_LARGEUR`, `GAULOIS_HAUTEUR` de `gaulois.ts`). */
const GAULOIS_L = 48;
const GAULOIS_H = 64;

const TRAIT = "#1a1410";
const BOIS = { fond: "#8a5a30", autre: "#966437", clair: "#b07a44", sombre: "#6a4424", creux: "#3d2616", corde: "#c9b278", cordeSombre: "#a08c5c" } as const;
const CHAUME = { fond: "#d9b04e", clair: "#f0cc68", sombre: "#b48c3a", brin: "#9c7a30", rang: "#a8823a", bord: "#80622a" } as const;
const FER = { fond: "#aab2c6", clair: "#d5dbea", sombre: "#7d859a" } as const;
const MUR = { fond: "#4a301c", clair: "#553822", joint: "#38230f", ombre: "#2e1c10" } as const;
const PAILLE = { fond: "#cdb26a", claire: "#dcc480", sombre: "#b3964f", bord: "#9c8145" } as const;
const PIERRE = { fond: "#8d95a6", claire: "#b4bccd", sombre: "#5c6474" } as const;

/** Les rangées : le toit, le linteau, la cellule (celle du Gaulois), la poutre du plancher, les pierres. */
const TOIT_DE = 4;
const TOIT_A = 15;
const LINTEAU_DE = 16;
const LINTEAU_A = 17;
const CELLULE_DE = PRISONNIER.y;
const CELLULE_A = PRISONNIER.y + GAULOIS_H - 1;
const POUTRE_DE = CELLULE_A + 1;
const POUTRE_A = POUTRE_DE + 3;
const PIERRES_DE = POUTRE_A + 1;
const PIERRES_A = PIERRES_DE + 2;
/** Les colonnes : la cellule entre deux montants de quatre cases. */
const CELLULE_G = PRISONNIER.x;
const CELLULE_D = PRISONNIER.x + GAULOIS_L - 1;
const MONTANT = 4;
/** La paille du sol : ses rangées, derrière les pieds du Gaulois. */
const PAILLE_DE = CELLULE_A - 6;

/**
 * Les barreaux, en colonnes du dessin du Gaulois : un toutes les six cases, les mêmes de part et d'autre de son milieu.
 * Ses yeux sont aux colonnes 18-19 et 28-29, son nez aux colonnes 23-24 : les barreaux 21 et 26 encadrent le nez (une
 * case de moins entre eux), chaque œil reste au milieu de son intervalle.
 */
const BARREAUX = [3, 9, 15, 21, 26, 32, 38, 44] as const;

/** Le cadenas : x trait, a anse de fer, A son reflet, g laiton, G laiton clair, o laiton sombre, k trou de la serrure. */
const CADENAS = [
  "..xxxxx..",
  ".xAAAAax.",
  ".xA...ax.",
  ".xA...ax.",
  "xxAxxxaxx",
  "xGGGGGGgx",
  "xGggggggx",
  "xGggkkgox",
  "xGggkkgox",
  "xGgggkgox",
  "xGgggkgox",
  "xgoooooox",
  "xxxxxxxxx",
] as const;
const COULEURS_DU_CADENAS = { x: TRAIT, a: FER.sombre, A: FER.clair, g: "#f0b93a", G: "#ffe07a", o: "#b8862a", k: TRAIT } as const;

/** Le bouquet du faîte : des brins de paille, liés d'un ruban rouge. */
const FAITE = ["c.cf.c.f", ".cfccfc.", "..rrRr..", ".cfccff."] as const;
const COULEURS_DU_FAITE = { c: CHAUME.clair, f: CHAUME.fond, r: "#d2452f", R: "#f07a5a" } as const;

/** Une touffe d'herbe au pied de la cage : h herbe, H herbe claire, t tige, p pétale, j cœur de la fleur. */
const HERBE = ["..h..H.", "h.hH.h.", "hHhhHhh"] as const;
const FLEUR = [".p.", "pjp", ".p.", ".t.", ".t."] as const;
const COULEURS_DE_L_HERBE = { h: "#3f8a3c", H: "#5aa84a", t: "#3f8a3c", p: "#f4f1e6", j: "#ffd75a" } as const;

/** La clé, pendue à sa ficelle : l'anneau en haut, le panneton en bas. */
const CLE = [".c.", ".c.", ".c.", "ggg", "g.g", "ggg", ".g.", ".g.", ".g.", ".gg", ".g.", ".gg"] as const;
const COULEURS_DE_LA_CLE = { c: BOIS.corde, g: "#f0b93a" } as const;

/** Le fond : le mur de planches, plus sombre sous le toit, et la paille du sol. */
function fondDeLaPrison(): (string | null)[] {
  const planche = new Planche(PRISON_L, PRISON_H);
  planche.rect(CELLULE_G, CELLULE_DE, GAULOIS_L, GAULOIS_H, (x, y) => {
    const dx = x - CELLULE_G;
    if (y >= PAILLE_DE) {
      if (y === PAILLE_DE) return PAILLE.bord;
      const a = alea(x + 40, y + 7);
      return a < 0.14 ? PAILLE.sombre : a > 0.88 ? PAILLE.claire : PAILLE.fond;
    }
    if (y < CELLULE_DE + 3) return MUR.ombre;
    if (dx % 8 === 7) return MUR.joint;
    const lame = Math.floor(dx / 8);
    if (alea(lame, Math.floor(y / 9) + 31) < 0.3 && y % 9 === 4 && dx % 8 > 1 && dx % 8 < 6) return MUR.joint;
    return lame % 2 === 0 ? MUR.fond : MUR.clair;
  });
  return planche.cases;
}

/** La demi-largeur du toit à sa rangée `r` (0 en haut) : un bonnet de chaume, rond en haut, large en bas. */
const demiToit = (r: number): number => Math.round(9 + 24 * Math.pow(r / (TOIT_A - TOIT_DE), 0.6));

/** Le devant : le toit, le linteau, les montants, les barreaux, la poutre du plancher, les pierres, le cadenas et la clé. */
function devantDeLaPrison(): (string | null)[] {
  const planche = new Planche(PRISON_L, PRISON_H);
  const milieu = PRISON_L / 2;

  // Les barreaux de fer : un reflet en haut, plus sombres en bas.
  for (const colonne of BARREAUX) {
    for (let y = CELLULE_DE - 1; y <= CELLULE_A; y++) planche.poser(CELLULE_G + colonne, y, y < CELLULE_DE + 10 ? FER.clair : y > CELLULE_A - 14 ? FER.sombre : FER.fond);
  }

  // Les deux montants : clairs à gauche, sombres à droite, liés de corde en haut et en bas.
  for (const gauche of [CELLULE_G - MONTANT, CELLULE_D + 1]) {
    for (let y = LINTEAU_DE; y <= POUTRE_A; y++) {
      for (let i = 0; i < MONTANT; i++) {
        let couleur: string = i === 0 ? BOIS.clair : i === MONTANT - 1 ? BOIS.sombre : alea(gauche + i, y) < 0.07 ? BOIS.sombre : BOIS.fond;
        const lien = y - CELLULE_DE;
        const lienBas = CELLULE_A - y;
        if (lien === 2 || lien === 4 || lienBas === 3 || lienBas === 5) couleur = BOIS.corde;
        else if (lien === 3 || lien === 5 || lienBas === 2 || lienBas === 4) couleur = BOIS.cordeSombre;
        planche.poser(gauche + i, y, couleur);
      }
    }
  }
  // Le linteau, d'un montant à l'autre, une case de plus de chaque côté ; son dessous dans l'ombre.
  planche.rect(CELLULE_G - MONTANT - 1, LINTEAU_DE, GAULOIS_L + 2 * MONTANT + 2, LINTEAU_A - LINTEAU_DE + 1, (x, y) => {
    if (y === LINTEAU_A) return BOIS.sombre;
    return alea(x, y + 60) < 0.08 ? BOIS.sombre : y === LINTEAU_DE ? BOIS.autre : BOIS.fond;
  });
  planche.rect(CELLULE_G, CELLULE_DE - 1, GAULOIS_L, 1, BOIS.creux);

  // La poutre du plancher : elle dépasse de deux cases, son dessus éclairé, deux têtes de cheville.
  planche.rect(CELLULE_G - MONTANT - 2, POUTRE_DE, GAULOIS_L + 2 * MONTANT + 4, POUTRE_A - POUTRE_DE + 1, (x, y) => {
    if (y === POUTRE_DE) return BOIS.clair;
    if (y === POUTRE_A) return BOIS.sombre;
    return alea(x + 9, y) < 0.1 ? BOIS.sombre : (x + Math.floor(y / 2)) % 17 === 0 ? BOIS.sombre : BOIS.autre;
  });
  for (const x of [CELLULE_G - 2, CELLULE_D + 2]) planche.rect(x - 1, POUTRE_DE + 1, 2, 2, BOIS.creux);

  // Les deux pierres qui portent la cage.
  for (const gauche of [CELLULE_G - 3, CELLULE_D - 8]) {
    planche.rect(gauche, PIERRES_DE, 12, PIERRES_A - PIERRES_DE + 1, (x, y) => {
      const i = x - gauche;
      if (y === PIERRES_DE) return i < 7 ? PIERRE.claire : PIERRE.fond;
      if (y === PIERRES_A && (i === 0 || i === 11)) return null;
      return i > 8 || y === PIERRES_A || alea(x, y) < 0.12 ? PIERRE.sombre : PIERRE.fond;
    });
  }

  // Le toit de chaume : en rangs, éclairé à gauche, sa frange inégale qui retombe sur le linteau.
  for (let y = TOIT_DE; y <= TOIT_A; y++) {
    const r = y - TOIT_DE;
    const demi = demiToit(r);
    for (let dx = -demi; dx < demi; dx++) {
      const x = milieu + dx;
      let couleur: string = dx < -demi / 3 ? CHAUME.clair : dx >= demi / 3 ? CHAUME.sombre : CHAUME.fond;
      if (r % 4 === 3) couleur = CHAUME.rang;
      else if (alea(x, r + 5) < 0.16) couleur = CHAUME.brin;
      if (y === TOIT_A) couleur = alea(x, 77) < 0.5 ? CHAUME.bord : CHAUME.rang;
      planche.poser(x, y, couleur);
    }
  }
  for (let dx = -demiToit(TOIT_A - TOIT_DE) + 1; dx < demiToit(TOIT_A - TOIT_DE) - 1; dx++) {
    if (alea(milieu + dx, 78) < 0.4) planche.poser(milieu + dx, TOIT_A + 1, CHAUME.bord);
  }
  // Le faîte : un bouquet de paille liée.
  planche.lettres(milieu - 4, TOIT_DE - 3, FAITE, COULEURS_DU_FAITE);

  // La clé, pendue au bord du toit, du côté où le prisonnier ne l'atteint pas.
  planche.lettres(PRISON_L - 5, TOIT_A + 1, CLE, COULEURS_DE_LA_CLE);

  // Le cadenas, sur le montant de gauche.
  planche.lettres(CELLULE_G - MONTANT - 2, CELLULE_DE + 30, CADENAS, COULEURS_DU_CADENAS);

  // Le trait du tour : toute case vide qui touche le dessin.
  const fond = fondDeLaPrison();
  const plein = (x: number, y: number): boolean => x >= 0 && x < PRISON_L && y >= 0 && y < PRISON_H && (planche.cases[y * PRISON_L + x] !== null || fond[y * PRISON_L + x] !== null);
  const tour: number[] = [];
  for (let y = 0; y < PRISON_H; y++) {
    for (let x = 0; x < PRISON_L; x++) {
      if (!plein(x, y) && (plein(x - 1, y) || plein(x + 1, y) || plein(x, y - 1) || plein(x, y + 1))) tour.push(y * PRISON_L + x);
    }
  }
  for (const i of tour) planche.cases[i] = TRAIT;

  // L'herbe au pied des pierres, et une fleur : posées après le trait, sans tour.
  planche.lettres(1, PIERRES_A - 2, HERBE, COULEURS_DE_L_HERBE);
  planche.lettres(PRISON_L - 8, PIERRES_A - 2, HERBE, COULEURS_DE_L_HERBE);
  planche.lettres(PRISON_L - 4, PIERRES_A - 6, FLEUR, COULEURS_DE_L_HERBE);
  return planche.cases;
}

/**
 * Deux images de PRISON_L × PRISON_H cases, couleurs « #rrggbb » ou null (vide), rangée par rangée :
 * images[0] = le fond, derrière le Gaulois ; images[1] = le devant, posé sur lui, vide partout ailleurs.
 */
export function dessinDeLaPrison(): { largeur: number; hauteur: number; images: [(string | null)[], (string | null)[]] } {
  return { largeur: PRISON_L, hauteur: PRISON_H, images: [fondDeLaPrison(), devantDeLaPrison()] };
}
