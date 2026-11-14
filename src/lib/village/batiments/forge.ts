/**
 * La forge du village, là où l'on grave une vraie partie sur un objet (idée « la forge aux souvenirs », 14 novembre 2026).
 * Elle est au village dès le départ : elle ne se bâtit pas. Et la plaque dorée d'un objet gravé, en petit et en grand.
 *
 * Un atelier ouvert sur le devant, sous un toit de chaume porté par deux poteaux : à gauche le foyer de pierre sous sa
 * hotte, dont la cheminée traverse le toit ; le soufflet sur son bâti, la buse dans le foyer ; au milieu l'enclume sur son
 * billot, une lame encore chaude posée dessus ; à droite le baquet d'eau ; au mur, les outils, deux épées et un bouclier.
 * Personne dans le dessin : les Gaulois y viennent d'eux-mêmes.
 *
 * Quatre images lentes : le soufflet descend et remonte d'une case à la fois, les braises passent d'un ton à l'autre, la
 * fumée serpente. La lueur du foyer garde sa couleur à toute heure ; elle porte plus loin la nuit. Dessiné case par case
 * pour ce site, sans emprunt à une œuvre existante. Design : Claude Fable 5.2.
 */
import { type Decor, type Palette, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import type { DessinDeBatiment } from "./type";

const L = 204;
/** La marge au-dessus de la cheminée, pour sa fumée. */
const CIEL = 20;
/** La hauteur de l'atelier, de la tête de la cheminée au seuil. */
const ATELIER = 150;
const H = ATELIER + CIEL;
const IMAGES = 4;

/** Les rangées de l'atelier, sans la marge de la fumée. */
const FAITE = 24;
const BAS_DU_TOIT = 67;
const LINTEAU = 68;
const HAUT_DU_DEDANS = 74;
const SOL_DU_DEDANS = 134;
const PIED_DU_DEDANS = 143;
const SEUIL = 145;
/** Les colonnes du dedans, entre les deux poteaux. */
const DEDANS_DE = 16;
const DEDANS_A = 188;
/** Le milieu du feu du foyer : de là part la lueur. */
const FEU = { x: 45, y: 100 };

const BRAISE = { sombre: "#b8301f", rouge: "#e2452a", vive: "#ee6a24", orange: "#f58a1f", jaune: "#ffd75a", coeur: "#fff1a8" };

interface Couleurs {
  p: Palette;
  /** Une couleur du dehors : sa teinte de jour, assombrie et bleuie la nuit. */
  dehors: (couleur: string) => string;
  /** Une couleur du dedans de l'atelier, à l'ombre du toit : la nuit et la lueur du foyer s'y posent ensuite, case par case. */
  dedans: (couleur: string) => string;
  /** La même couleur loin du foyer, à cette heure : presque noire la nuit. */
  loinDuFeu: (couleur: string) => string;
}

function couleursDe(l: Lumiere): Couleurs {
  return {
    p: paletteDuDehors(l),
    dehors: (couleur) => couleurDuDehors(couleur, melanger(couleur, "#0b1028", 0.55), l),
    dedans: (couleur) => melanger(couleur, "#20140c", 0.2),
    loinDuFeu: (couleur) => couleurDuDehors(couleur, melanger(couleur, "#080a18", 0.68), l),
  };
}

/** Un mur de pierres : des lits de 5 cases, des pierres de 9, décalées d'un lit à l'autre. */
function pierreDuMur(x: number, y: number): string {
  const lit = Math.floor(y / 5);
  const dans = (x + lit * 4) % 9;
  if (y % 5 === 4 || dans === 0) return "#4d4840";
  const a = alea(Math.floor((x + lit * 4) / 9), lit + 31);
  if (y % 5 === 0) return a < 0.5 ? "#958d80" : "#857e72";
  return a < 0.35 ? "#7d766a" : a < 0.7 ? "#6a645a" : "#746d62";
}

const FER = { clair: "#a3abba", fond: "#70798a", sombre: "#474e5c", noir: "#2c313c" };
const CUIR = { clair: "#a8683a", fond: "#844c28", sombre: "#5a3018", pli: "#3d2010" };

const PINCE = [".i.i.", ".i.i.", ".i.i.", ".i.i.", ".i.i.", ".i.i.", ".m.m.", "..m..", "..i..", ".m.m.", "m...m", "m...m", "m...m", ".m.m."] as const;
const MARTEAU = ["mmmmmmm", "iiiiiim", "mmmmmms", "sssssss", "..cb...", "..cb...", "..cb...", "..cb...", "..cb...", "..cb...", "..cb...", "..cb...", "..cb...", "..cb..."] as const;
const MASSE = ["iiiiiiiii", "mmmmmmmms", "mmmmmmmms", "mmmmmmmms", "sssssssss", "...cb....", "...cb....", "...cb....", "...cb....", "...cb....", "...cb....", "...cb....", "...cb....", "...cb....", "...cb....", "...cb....", "...cb...."] as const;
const LIME = [".c.", ".b.", ".b.", ".b.", "ooo", "ims", "ims", "ims", "ims", "ims", "ims", "ims", "ims", "ims", "ims", ".m."] as const;
const EPEE = ["..o..", ".ooo.", "..o..", "..b..", "..c..", "..b..", "..c..", "ooooo", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".ims.", ".im..", "..i.."] as const;
const ANNEAU = [".mmm.", "m...m", "m...m", "m...m", ".mmm."] as const;

/** Les rangées de l'enclume, de la table au pied : la première et la dernière colonne de chacune. La corne pointe à gauche. */
const ENCLUME: readonly (readonly [number, number])[] = [
  [8, 33],
  [0, 33],
  [2, 33],
  [5, 32],
  [9, 30],
  [13, 28],
  [15, 26],
  [15, 26],
  [15, 26],
  [14, 27],
  [12, 29],
  [10, 31],
  [9, 32],
  [9, 32],
];

/** Le dedans de l'atelier : le mur du fond, le sol, puis tout ce qui s'y trouve. Rend les cases qui éclairent. */
function poserDedans(pl: Planche, c: Couleurs, image: number): Set<number> {
  const { p, dedans, loinDuFeu } = c;
  const eclaire = new Set<number>();
  const feu = (x: number, y: number, couleur: string) => {
    pl.poser(x, y, couleur);
    eclaire.add(y * L + x);
  };
  const tour = (2 * Math.PI * image) / IMAGES;
  /** Le soufflet : 0 ouvert, 2 fermé, une case à la fois (0, 1, 2, 1). */
  const souffle = Math.round(1 - Math.cos(tour));

  // Le mur du fond : du torchis sur un soubassement de pierres, deux poteaux pris dans le mur.
  pl.rect(DEDANS_DE, HAUT_DU_DEDANS, DEDANS_A - DEDANS_DE, SOL_DU_DEDANS - HAUT_DU_DEDANS, (x, y) => {
    if (y >= SOL_DU_DEDANS - 13) return dedans(pierreDuMur(x + 3, y));
    if (y < HAUT_DU_DEDANS + 4) return dedans("#7a5c3c");
    if (y % 3 === 2) return dedans("#a88a5c");
    return dedans(alea(x, y) < 0.05 ? "#b0935f" : "#c2a46e");
  });
  for (const x of [98, 150]) pl.rect(x, HAUT_DU_DEDANS, 5, SOL_DU_DEDANS - 13 - HAUT_DU_DEDANS, (i) => dedans(i === x ? "#8a5a30" : i === x + 4 ? "#472d19" : "#6a4424"));
  // Le sol de terre battue.
  pl.rect(DEDANS_DE, SOL_DU_DEDANS, DEDANS_A - DEDANS_DE, SEUIL - SOL_DU_DEDANS, (x, y) => {
    if (y === SOL_DU_DEDANS) return dedans("#3d2616");
    const a = alea(x, y + 400);
    return dedans(a < 0.1 ? "#a07d52" : a < 0.22 ? "#735638" : "#8a6a45");
  });

  // La barre aux outils, sur ses chevilles, et ce qui y pend.
  pl.rect(120, 82, 64, 2, (_x, y) => dedans(y === 82 ? "#a07a48" : "#5d3d22"));
  const fer = { i: dedans(FER.clair), m: dedans(FER.fond), s: dedans(FER.sombre), b: dedans("#6a4424"), c: dedans("#9a6b3f"), o: dedans("#c9a23a") };
  pl.lettres(123, 84, PINCE, fer);
  pl.lettres(130, 84, MARTEAU, fer);
  pl.lettres(139, 84, MASSE, fer);
  pl.lettres(150, 84, LIME, fer);
  pl.lettres(156, 84, EPEE, fer);
  pl.lettres(163, 84, EPEE, fer);
  // Au-dessus du soufflet, un anneau de fer à une cheville.
  pl.rect(90, 80, 1, 3, dedans("#5d3d22"));
  pl.lettres(88, 83, ANNEAU, fer);
  // Un bouclier rond pendu au mur : du bois peint, un cercle et un umbo de fer.
  pl.disque(177, 104, 9, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > 70) return dedans(dx + dy > 0 ? FER.sombre : FER.fond);
    if (d <= 6) return dedans(dx + dy < 0 ? FER.clair : FER.fond);
    if (d <= 12) return dedans(FER.sombre);
    return dedans(dx * dy > 0 ? "#2f5fa8" : "#d9b04e");
  });

  // Le foyer : un massif de pierres, une dalle, le fond noirci, la hotte qui monte au toit.
  pl.rect(20, 106, 51, PIED_DU_DEDANS - 105, (x, y) => dedans(pierreDuMur(x, y)));
  pl.rect(24, 86, 43, 20, (x, y) => dedans(y % 5 === 4 || (x + Math.floor(y / 5) * 4) % 9 === 0 ? "#1f1c1a" : alea(x, y) < 0.3 ? "#34302c" : "#2a2623"));
  for (let y = HAUT_DU_DEDANS; y <= 87; y++) {
    const retrait = Math.round(((87 - y) / (87 - HAUT_DU_DEDANS)) * 8);
    for (let x = 20 + retrait; x <= 70 - retrait; x++) {
      const bord = x === 20 + retrait || x === 70 - retrait;
      pl.poser(x, y, dedans(y === 87 ? "#3a362f" : bord ? "#4d4840" : pierreDuMur(x + 2, y + 1)));
    }
  }
  pl.rect(18, 103, 55, 3, (x, y) => dedans(y === 103 ? "#a39a8c" : y === 105 ? "#4d4840" : x % 11 === 0 ? "#6a645a" : "#8a8275"));
  // La niche à charbon, dans le massif.
  pl.rect(34, 122, 22, PIED_DU_DEDANS - 121, (x, y) => {
    if (y === 122 || x === 34 || x === 55) return dedans("#3a362f");
    const haut = 128 + Math.round(Math.abs(x - 45) / 3);
    if (y < haut) return dedans("#1f1c1a");
    return dedans(alea(x, y) < 0.3 ? "#3a3a40" : alea(x, y) < 0.45 ? "#4a4a52" : "#26262b");
  });

  // Les braises et leur petite flamme : la lueur passe d'un ton à l'autre, plus vive quand le soufflet se ferme.
  for (let y = 95; y <= 102; y++) {
    for (let x = 27; x <= 63; x++) {
      const dx = (x - FEU.x) / 18;
      const dy = (y - 103) / 8;
      if (dx * dx + dy * dy > 1) continue;
      const a = alea(x, y + 211);
      const vif = 0.5 + 0.5 * Math.sin(tour + x / 5 + y / 3) + 0.12 * souffle;
      let couleur: string;
      if (a < 0.12) couleur = "#3d2616";
      else if (a < 0.26) couleur = BRAISE.sombre;
      else if (a > 0.88) couleur = vif > 0.6 ? BRAISE.jaune : BRAISE.orange;
      else if (a > 0.58) couleur = vif > 0.55 ? BRAISE.orange : BRAISE.vive;
      else couleur = vif > 0.65 ? BRAISE.vive : BRAISE.rouge;
      feu(x, y, couleur);
    }
  }
  for (const [bx, demi, haut, decalage] of [
    [-7, 3, 7, 2.1],
    [0, 4, 10, 0],
    [8, 3, 8, 4.2],
  ] as const) {
    for (let y = 96 - haut; y <= 96; y++) {
      const t = (96 - y) / haut;
      const forme = Math.pow(1 - t, 0.6) * (0.4 + 0.6 * Math.min(1, t / 0.2));
      const milieu = FEU.x + bx + 1.2 * t * Math.sin(tour + decalage - 3 * t);
      for (let x = FEU.x + bx - demi - 2; x <= FEU.x + bx + demi + 2; x++) {
        const d = Math.abs(x + 0.5 - milieu) / (demi * forme + 0.01);
        if (d >= 1) continue;
        const chaud = (1 - d * d) * (1 - 0.8 * t);
        feu(x, y, chaud > 0.6 ? BRAISE.coeur : chaud > 0.38 ? BRAISE.jaune : chaud > 0.15 ? BRAISE.orange : BRAISE.rouge);
      }
    }
  }

  // Le soufflet : deux planches et du cuir plissé, sur un bâti ; la buse de fer entre dans le foyer.
  const bois = { clair: dedans("#b07a44"), fond: dedans("#8a5a30"), sombre: dedans("#5d3d22"), creux: dedans("#3d2616") };
  for (const x of [88, 110]) pl.rect(x, 110, 3, PIED_DU_DEDANS - 109, (i) => (i === x ? bois.fond : i === x + 2 ? bois.creux : bois.sombre));
  pl.rect(86, 126, 29, 2, (_x, y) => (y === 126 ? bois.fond : bois.creux));
  pl.rect(66, 100, 14, 2, (_x, y) => dedans(y === 100 ? FER.fond : FER.noir));
  pl.rect(78, 98, 7, 9, (x, y) => (y === 98 ? bois.clair : x === 84 ? bois.creux : bois.fond));
  for (let x = 85; x <= 116; x++) {
    const t = (x - 85) / 31;
    const haut = Math.round(99 - t * (11 - 2 * souffle));
    const bas = 107;
    // Le bout arrondi du soufflet.
    const rogne = x > 113 ? x - 113 : 0;
    for (let y = haut + rogne; y <= bas + 1 - rogne; y++) {
      let couleur: string;
      if (y <= haut + 1) couleur = y === haut ? bois.clair : bois.fond;
      else if (y >= bas) couleur = y === bas ? bois.sombre : bois.creux;
      else if ((x - 85) % 5 === 4) couleur = dedans(CUIR.pli);
      else if ((x - 85) % 5 === 0) couleur = dedans(CUIR.clair);
      else couleur = dedans(y > (haut + bas) / 2 ? CUIR.sombre : CUIR.fond);
      pl.poser(x, y, couleur);
    }
  }
  // Le manche, au bout de la planche du haut.
  const bout = Math.round(99 - (11 - 2 * souffle));
  pl.rect(115, bout - 1, 9, 2, (_x, y) => (y === bout - 1 ? bois.clair : bois.sombre));

  // Le billot : un tronc cerclé de fer. Dessus, l'enclume, et une lame encore chaude.
  pl.rect(130, 122, 22, PIED_DU_DEDANS - 121, (x, y) => {
    if (y === 128 || y === 129) return dedans(y === 128 ? FER.fond : FER.sombre);
    if (x === 130 || x === 151) return dedans("#3d2616");
    if ((x - 130) % 4 === 3 && alea(x, y >> 2) < 0.6) return dedans("#523419");
    return dedans(x < 136 ? "#8a5a30" : x > 146 ? "#5d3d22" : "#70492c");
  });
  pl.rect(130, 120, 22, 2, (x, y) => dedans(y === 120 ? "#c79a62" : (x - 130) % 3 === 0 ? "#8a6238" : "#b98a52"));
  ENCLUME.forEach(([de, a], r) => {
    for (let i = de; i <= a; i++) {
      let couleur: string = r === 0 ? FER.clair : r >= 12 ? FER.sombre : FER.fond;
      if (r > 0 && i === de) couleur = FER.clair;
      if (r > 0 && i >= a - 1) couleur = FER.sombre;
      if (r === 1 && i > 8) couleur = FER.fond;
      if (r === 13) couleur = FER.noir;
      pl.poser(120 + i, 106 + r, dedans(couleur));
    }
  });
  pl.rect(134, 104, 20, 2, (_x, y) => dedans(y === 104 ? FER.clair : FER.fond));
  pl.rect(154, 103, 2, 4, dedans("#c9a23a"));
  pl.rect(156, 104, 5, 2, (x) => dedans(x % 2 === 0 ? "#6a4424" : "#9a6b3f"));
  for (let x = 124; x < 134; x++) {
    feu(x, 104, x < 128 ? BRAISE.jaune : x < 131 ? BRAISE.orange : BRAISE.vive);
    feu(x, 105, x < 127 ? BRAISE.orange : x < 131 ? BRAISE.vive : BRAISE.rouge);
  }
  pl.poser(123, 105, BRAISE.orange);
  eclaire.add(105 * L + 123);
  // Le baquet d'eau : des douves cerclées de fer.
  pl.rect(164, 124, 21, PIED_DU_DEDANS - 123, (x, y) => {
    if (y === 124) return dedans("#b07a44");
    if (y === 125) return dedans(alea(x, 3) < 0.3 ? "#8fc0e0" : "#4a86b8");
    if (y === 130 || y === 139) return dedans(FER.fond);
    if (y === 131 || y === 140) return dedans(FER.sombre);
    if ((x - 164) % 4 === 0) return dedans("#472d19");
    return dedans(x < 170 ? "#966437" : x > 179 ? "#5d3d22" : "#7a5230");
  });

  // La lueur du foyer sur tout le dedans : près du feu, les couleurs du jour, réchauffées ; loin, celles de l'heure.
  // Douze marches fines, mêlées en damier là où elles se touchent : pas de cerne.
  for (let y = HAUT_DU_DEDANS; y < SEUIL; y++) {
    for (let x = DEDANS_DE; x < DEDANS_A; x++) {
      if (eclaire.has(y * L + x)) continue;
      const fond = pl.lire(x, y);
      if (!fond) continue;
      const d = Math.hypot(x - FEU.x, (y - FEU.y) * 1.25);
      const pres = Math.max(0, 1 - d / 160) * 12;
      const marche = Math.floor(pres) + (pres % 1 > 0.5 && (x + y) % 2 === 0 ? 1 : 0);
      pl.poser(x, y, melanger(loinDuFeu(fond), melanger(fond, "#f5a83a", 0.2), (marche / 12) * (0.3 + 0.7 * p.nuit)));
    }
  }
  return eclaire;
}

/** Ce qui porte le toit : deux poteaux, leurs goussets, le linteau, et le seuil de pierres. */
function poserCharpente(pl: Planche, c: Couleurs): void {
  const { p, dehors } = c;
  for (const x of [10, 188]) {
    pl.rect(x, LINTEAU, 6, SEUIL - LINTEAU, (i, j) => {
      if (i === x) return p.bois.clair;
      if (i === x + 5) return p.bois.creux;
      if (alea(i, j >> 1) < 0.06) return p.bois.sombre;
      return i < x + 3 ? p.bois.fond : p.bois.sombre;
    });
  }
  // Les goussets, en biais sous le linteau.
  for (let k = 0; k < 12; k++) {
    for (let e = 0; e < 3; e++) {
      pl.poser(16 + k, 86 - k + e, e === 0 ? p.bois.clair : e === 1 ? p.bois.fond : p.bois.creux);
      pl.poser(187 - k, 86 - k + e, e === 0 ? p.bois.fond : e === 1 ? p.bois.sombre : p.bois.creux);
    }
  }
  pl.rect(8, LINTEAU, L - 16, 6, (i, j) => {
    if (j === LINTEAU + 5) return p.bois.creux;
    if (j === LINTEAU + 4) return p.bois.sombre;
    if (j < LINTEAU + 2) return p.bois.creux;
    return alea(i >> 2, j) < 0.2 ? p.bois.fond : p.bois.autre;
  });
  pl.rect(6, SEUIL, L - 12, ATELIER - SEUIL, (x, y) => {
    if (y === SEUIL) return dehors((x + 2) % 9 === 0 ? "#6a645a" : "#a39a8c");
    return dehors(pierreDuMur(x + 2, y + 1));
  });
}

/** Le toit de chaume, sa frange et son faîte ; puis la cheminée de pierre, qui le traverse. */
function poserToit(pl: Planche, c: Couleurs): void {
  const { p, dehors } = c;
  const haut = BAS_DU_TOIT - FAITE;
  for (let y = FAITE; y <= BAS_DU_TOIT + 2; y++) {
    const r = y - FAITE;
    const retrait = Math.max(0, Math.round(42 * (1 - r / haut)));
    for (let x = retrait; x < L - retrait; x++) {
      // Éclairé à gauche, à l'ombre à droite : les trois tons se mêlent brin à brin là où ils se touchent.
      const cote = x + (alea(x, r + 50) - 0.5) * 36;
      let couleur: string = cote < L * 0.36 ? p.chaume.clair : cote > L * 0.66 ? p.chaume.sombre : p.chaume.fond;
      if (r % 7 === 6) couleur = p.chaume.rang;
      else if (r % 7 === 0 && r > 0 && alea(x, r) < 0.5) couleur = p.chaume.clair;
      else if (alea(x, r) < 0.15) couleur = p.chaume.brin;
      if (x === retrait || x === L - 1 - retrait) couleur = p.chaume.bord;
      // La frange : des brins inégaux qui pendent sous le bord.
      if (y > BAS_DU_TOIT) {
        const brin = alea(x >> 1, 9);
        if (y === BAS_DU_TOIT + 2 && brin < 0.55) continue;
        couleur = brin < 0.3 ? p.chaume.bord : p.chaume.rang;
      } else if (y === BAS_DU_TOIT) couleur = p.chaume.bord;
      pl.poser(x, y, couleur);
    }
  }
  // Le faîte : un boudin de paille lié, tenu par des chevilles croisées.
  pl.rect(40, FAITE - 3, L - 80, 4, (x, y) => (y === FAITE - 3 ? p.chaume.clair : y === FAITE ? p.chaume.bord : x % 6 === 0 ? p.chaume.bord : p.chaume.rang));
  for (let x = 70; x < L - 50; x += 24) {
    for (let k = 0; k < 5; k++) {
      pl.poser(x - 2 + k, FAITE - 5 + k, p.bois.sombre);
      pl.poser(x + 2 - k, FAITE - 5 + k, p.bois.fond);
    }
  }

  // La cheminée : son fût, sa dalle, sa bouche noire ; un bourrelet de chaume à son pied.
  pl.rect(34, 6, 23, 42, (x, y) => {
    const couleur = pierreDuMur(x + 1, y + 2);
    return dehors(x === 34 ? "#a39a8c" : x >= 55 ? melanger(couleur, "#2a2622", 0.45) : couleur);
  });
  pl.rect(32, 3, 27, 4, (x, y) => dehors(y === 3 ? "#a39a8c" : y === 6 ? "#4d4840" : x % 9 === 4 ? "#6a645a" : "#857e72"));
  pl.rect(37, 1, 17, 2, (_x, y) => dehors(y === 1 ? "#1f1c1a" : "#34302c"));
  pl.rect(32, 46, 27, 3, (x, y) => (y === 48 ? p.chaume.bord : alea(x, y) < 0.3 ? p.chaume.brin : p.chaume.rang));
}

/** Le tas de rondins, à droite, à l'abri du débord du toit. */
function poserBois(pl: Planche, c: Couleurs): void {
  const { p } = c;
  const rangs = [
    [195, 198, 201],
    [196, 199],
    [197],
  ] as const;
  rangs.forEach((rang, k) => {
    for (const x of rang) {
      pl.disque(x + 1, 142 - k * 3, 2, (dx, dy) => (dx * dx + dy * dy >= 4 ? p.bois.creux : dx === 0 && dy === 0 ? p.bois.sombre : p.bois.clair));
    }
  });
}

/** La fumée de la cheminée : un filet gris qui serpente et s'efface, sur la marge du haut. */
function poserFumee(pl: Planche, c: Couleurs, image: number): void {
  const tour = (2 * Math.PI * image) / IMAGES;
  const claire = c.dehors("#b4b8c0");
  const fond = c.dehors("#8c919c");
  for (let k = 0; k < CIEL + 1; k++) {
    const y = CIEL + 1 - k;
    const t = k / (CIEL + 1);
    const x = Math.round(45 + (1 + 3 * t) * Math.sin(k / 3.2 - tour) + 4 * t);
    if (t > 0.6 && k % 3 === 0) continue;
    pl.poser(x, y, t < 0.5 ? claire : fond);
    if (t < 0.75 && k % 2 === 0) pl.poser(x + 1, y, fond);
    if (t < 0.4) pl.poser(x - 1, y, fond);
  }
}

export const FORGE: DessinDeBatiment = {
  largeur: L,
  hauteur: H,
  images: IMAGES,
  dessiner(lumiere: Lumiere, image: number): Decor {
    const pas = ((Math.round(image) % IMAGES) + IMAGES) % IMAGES;
    const c = couleursDe(lumiere);
    const atelier = new Planche(L, ATELIER);
    poserDedans(atelier, c, pas);
    poserCharpente(atelier, c);
    poserToit(atelier, c);
    poserBois(atelier, c);
    const planche = new Planche(L, H);
    for (let y = 0; y < ATELIER; y++) for (let x = 0; x < L; x++) planche.poser(x, y + CIEL, atelier.lire(x, y));
    poserFumee(planche, c, pas);
    return planche.decor();
  },
};

const OR = { eclat: "#fff1a8", clair: "#ffe08a", fond: "#e2b23c", grave: "#a87a1c", sombre: "#8a6414", ombre: "#5f4410" };

function plaque(lignes: readonly string[]): Decor {
  const planche = new Planche(lignes[0]!.length, lignes.length);
  planche.lettres(0, 0, lignes, { e: OR.eclat, c: OR.clair, f: OR.fond, g: OR.grave, s: OR.sombre, o: OR.ombre });
  return planche.decor();
}

/** La plaque d'un objet gravé, en petit : à poser près de l'objet dans le vestiaire et sur la place. Deux lignes gravées, un bord sombre. */
export const PLAQUE: Decor = plaque([".sssss.", "scccccs", "sfggggs", "sfffffs", "sfgggfs", ".ooooo."]);

/**
 * La même plaque en grand, sans texte, pour la fenêtre de la forge : le texte s'écrit en HTML par-dessus, sur le champ
 * uni (les cases de 4 à 35 en largeur, de 3 à 12 en hauteur). Un bord sombre, un filet gravé, un rivet à chaque coin.
 */
export const PLAQUE_GRANDE: Decor = (() => {
  const largeur = 40;
  const hauteur = 16;
  const planche = new Planche(largeur, hauteur);
  planche.rect(0, 0, largeur, hauteur, (x, y) => {
    const bordX = Math.min(x, largeur - 1 - x);
    const bordY = Math.min(y, hauteur - 1 - y);
    if (bordX + bordY < 2) return null;
    if (bordX === 0 || bordY === 0) return y === hauteur - 1 || x === largeur - 1 ? OR.ombre : OR.sombre;
    if (bordX + bordY === 2) return OR.sombre;
    if (bordY === 1) return y === 1 ? OR.clair : OR.grave;
    if (bordX === 1) return x === 1 ? OR.clair : OR.grave;
    // Le filet gravé, à deux cases du bord.
    if ((bordY === 2 && bordX >= 5) || (bordX === 2 && bordY >= 5)) return OR.grave;
    // Un reflet en biais, discret, qui ne gêne pas le texte.
    if (bordX > 2 && bordY > 2 && (x + y * 2) % 23 < 2 && x < 16) return OR.clair;
    return OR.fond;
  });
  // Les rivets des coins.
  for (const [x, y] of [
    [3, 3],
    [largeur - 5, 3],
    [3, hauteur - 5],
    [largeur - 5, hauteur - 5],
  ] as const) {
    planche.poser(x, y, OR.eclat);
    planche.poser(x + 1, y, OR.grave);
    planche.poser(x, y + 1, OR.grave);
    planche.poser(x + 1, y + 1, OR.sombre);
  }
  return planche.decor();
})();
