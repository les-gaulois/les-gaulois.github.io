/**
 * Lot A des bâtiments du village : la palissade et sa porte, le puits, le four à pain, le potager, la tour de guet.
 * Dessinés case par case pour ce site, à l'échelle des Gaulois (48 × 64 cases), sans emprunt à une œuvre existante, avec
 * les matières du village (`decor.ts`) : bois, chaume, torchis, pierre. La lumière vient d'en haut à gauche. Rien n'est
 * tiré au hasard : la même lumière et la même image donnent toujours le même dessin. Ce qui éclaire (torches de la porte,
 * gueule du four, lanterne de la tour) garde sa couleur et ne s'allume qu'à la tombée du jour, sans jamais clignoter.
 * Design : Claude Fable 5.2 (14 novembre 2026).
 */
import type { BatimentId } from "../chantier-liste";
import { type Decor, type Palette, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import type { DessinDeBatiment } from "./type";

/* ---------- Les couleurs et les pièces communes ---------- */

type Couleurs = Palette & {
  pierre: { clair: string; fond: string; sombre: string; joint: string };
  /** Une couleur de jour, assombrie et bleuie d'elle-même pour la nuit. */
  c(deJour: string): string;
  /** De 0 en plein jour à 1 à la nuit : la force de ce qui éclaire. */
  eclat: number;
};

const NUIT = "#101a3a";

function couleurs(l: Lumiere): Couleurs {
  const p = paletteDuDehors(l);
  const c = (deJour: string): string => couleurDuDehors(deJour, melanger(deJour, NUIT, 0.52), l);
  return {
    ...p,
    pierre: {
      clair: couleurDuDehors("#a9aebb", "#5d6680", l),
      fond: couleurDuDehors("#8d95a6", "#4a536c", l),
      sombre: couleurDuDehors("#6a7284", "#353d55", l),
      joint: couleurDuDehors("#4e5564", "#262c40", l),
    },
    c,
    eclat: Math.min(1, Math.max(0, (0.8 - l.jour) / 0.5)),
  };
}

/** Un poteau debout : clair à gauche, sombre à droite, quelques veines qui ne bougent pas. */
function poteau(pl: Planche, p: Couleurs, x: number, y: number, l: number, h: number): void {
  pl.rect(x, y, l, h, (i, j) => {
    if (i === x) return p.bois.clair;
    if (i === x + l - 1) return p.bois.sombre;
    return alea(i, j >> 2) < 0.14 ? p.bois.autre : p.bois.fond;
  });
}

/** Une poutre couchée : claire dessus, sombre dessous. */
function poutre(pl: Planche, p: Couleurs, x: number, y: number, l: number, h: number): void {
  pl.rect(x, y, l, h, (i, j) => {
    if (j === y) return p.bois.clair;
    if (j === y + h - 1) return p.bois.sombre;
    return alea(i >> 2, j) < 0.14 ? p.bois.autre : p.bois.fond;
  });
}

/** Un trait d'une case d'épaisseur (ou plus), d'un point à l'autre. */
function trait(pl: Planche, x0: number, y0: number, x1: number, y1: number, couleur: string, epais = 1): void {
  const pas = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= pas; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / pas);
    const y = Math.round(y0 + ((y1 - y0) * k) / pas);
    for (let e = 0; e < epais; e++) pl.poser(x + e, y, couleur);
  }
}

/** Une ligature de corde autour d'un poteau ou d'une poutre. */
function ligature(pl: Planche, p: Couleurs, x: number, y: number, l: number, h = 2): void {
  pl.rect(x, y, l, h, (i, j) => ((i + j) % 3 === 0 ? p.bois.cordeSombre : j === y ? p.bois.corde : p.bois.cordeSombre));
}

/** Un toit de chaume en pointe, comme celui des huttes : en rangs, éclairé à gauche, un bord sombre. */
function toitDeChaume(pl: Planche, p: Couleurs, cx: number, sommet: number, hauteur: number, demiBase: number): void {
  for (let r = 0; r < hauteur; r++) {
    const demi = Math.max(1, Math.round(((r + 1) * demiBase) / hauteur));
    for (let dx = -demi; dx <= demi; dx++) {
      let couleur: string = dx < -demi / 3 ? p.chaume.clair : dx > demi / 3 ? p.chaume.sombre : p.chaume.fond;
      if (r % 6 === 5) couleur = p.chaume.rang;
      else if (alea(cx + dx, r + 77) < 0.16) couleur = p.chaume.brin;
      if (Math.abs(dx) === demi || r === hauteur - 1) couleur = p.chaume.bord;
      pl.poser(cx + dx, sommet + r, couleur);
    }
  }
  // La frange du bas : des brins inégaux.
  for (let dx = -demiBase; dx <= demiBase; dx++) if (alea(cx + dx, 41) < 0.45) pl.poser(cx + dx, sommet + hauteur, p.chaume.bord);
  // Le faîte : un bouquet de paille liée.
  pl.rect(cx - 1, sommet - 2, 3, 2, p.chaume.rang);
  pl.poser(cx, sommet - 2, p.chaume.bord);
  pl.poser(cx, sommet - 1, p.chaume.clair);
}

/** Un mur de pierres : des lits de moellons décalés, clairs à gauche, sombres à droite, joints creusés. */
function pierres(pl: Planche, p: Couleurs, x: number, y: number, l: number, h: number, lit = 6, moellon = 9): void {
  pl.rect(x, y, l, h, (i, j) => {
    const rang = Math.floor((j - y) / lit);
    const dans = (j - y) % lit;
    const decale = i - x + (rang % 2) * Math.floor(moellon / 2) + Math.floor(alea(rang, 5) * 3);
    if (dans === lit - 1 || decale % moellon === 0) return p.pierre.joint;
    const part = (i - x) / l;
    const grain = alea(Math.floor(decale / moellon) + x, rang + y);
    if (part < 0.22) return grain < 0.3 ? p.pierre.fond : p.pierre.clair;
    if (part > 0.74) return grain < 0.3 ? p.pierre.fond : p.pierre.sombre;
    if (dans === 0 && grain < 0.6) return p.pierre.clair;
    return grain < 0.22 ? p.pierre.sombre : grain > 0.84 ? p.pierre.clair : p.pierre.fond;
  });
}

/* ---------- La palissade et la porte du village ---------- */

const PAL_L = 240;
const PAL_H = 112;
/** La porte : deux gros poteaux, un linteau, deux battants ouverts vers le dedans. */
const PORTE = { poteauG: 74, poteauD: 156, poteauL: 10, de: 84, a: 155 };

function palissade(l: Lumiere): Decor {
  const p = couleurs(l);
  const pl = new Planche(PAL_L, PAL_H);
  const sol = PAL_H - 1;

  // Les pieux : sept cases de bois, une de creux, taillés en pointe, de hauteurs un peu inégales.
  const pieux = (de: number, a: number, decalage: number, rang: number): void => {
    for (let x = de; x < a; x++) {
      const local = x - de + decalage;
      const pieu = Math.floor(local / 8) + rang;
      const dans = local % 8;
      const haut = sol - (81 + Math.floor(alea(pieu, 7) * 7));
      if (dans === 7) {
        for (let y = haut + 7; y <= sol; y++) pl.poser(x, y, p.bois.creux);
        continue;
      }
      const fond = pieu % 2 === 0 ? p.bois.fond : p.bois.autre;
      for (let y = haut; y <= sol; y++) {
        const t = y - haut;
        if (t < 6 && Math.abs(dans - 3) > Math.floor((t + 1) / 2)) continue;
        let couleur: string = dans === 0 ? p.bois.clair : dans >= 5 ? (dans === 6 ? p.bois.sombre : fond === p.bois.fond ? p.bois.sombre : p.bois.fond) : fond;
        if (t < 6 && dans < 3) couleur = p.bois.clair;
        else if (alea(x, y >> 2) < 0.07) couleur = p.bois.sombre;
        // Deux liens de corde, un nœud devant chaque pieu.
        for (const lien of [sol - 60, sol - 24]) {
          if (y === lien) couleur = dans === 3 ? p.bois.cordeSombre : p.bois.corde;
          else if (y === lien + 1) couleur = p.bois.cordeSombre;
          else if (y === lien + 2 && dans === 3) couleur = p.bois.corde;
        }
        // Le pied, sali par la terre.
        if (y > sol - 3 && alea(x, y) < 0.5) couleur = p.bois.creux;
        pl.poser(x, y, couleur);
      }
    }
  };
  pieux(0, PORTE.poteauG, 0, 0);
  pieux(PORTE.poteauD + PORTE.poteauL, PAL_L, 6, 20);

  // Les battants, ouverts vers le dedans : vus de biais, plus petits au loin, dans l'ombre.
  const battant = (charniere: number, sens: 1 | -1): void => {
    for (let k = 0; k < 17; k++) {
      const x = charniere + sens * k;
      const haut = sol - 83 + Math.round(k * 0.45);
      const bas = sol - Math.round(k * 0.3);
      for (let y = haut; y <= bas; y++) {
        const dy = y - haut;
        const tout = bas - haut;
        let couleur: string = k % 5 === 4 ? p.bois.creux : k % 10 < 5 ? p.bois.sombre : p.tronc.fond;
        // Deux traverses et une écharpe.
        if (Math.abs(dy - 12) < 2 || Math.abs(dy - (tout - 12)) < 2) couleur = p.bois.fond;
        else if (Math.abs(dy - 14 - Math.round(((tout - 28) * k) / 16)) < 2) couleur = p.bois.fond;
        if (y === haut) couleur = p.bois.fond;
        // Les pentures de fer, côté charnière.
        if (k < 5 && (Math.abs(dy - 12) < 1 || Math.abs(dy - (tout - 12)) < 1)) couleur = p.pierre.sombre;
        pl.poser(x, y, couleur);
      }
    }
  };
  battant(PORTE.de, 1);
  battant(PORTE.a, -1);

  // Les deux poteaux de la porte, plus hauts et plus gros que les pieux, taillés en pointe.
  for (const x of [PORTE.poteauG, PORTE.poteauD]) {
    const haut = sol - 107;
    poteau(pl, p, x, haut + 5, PORTE.poteauL, 103);
    pl.rect(x + 1, haut + 5, 1, 103, p.bois.clair);
    pl.rect(x + PORTE.poteauL - 2, haut + 5, 1, 103, p.bois.sombre);
    for (let t = 0; t < 5; t++) {
      for (let i = 4 - t; i < PORTE.poteauL - 4 + t; i++) pl.poser(x + i, haut + t, i < PORTE.poteauL / 2 ? p.bois.clair : p.bois.fond);
    }
    for (let y = sol - 2; y <= sol; y++) for (let i = 0; i < PORTE.poteauL; i++) if (alea(x + i, y) < 0.5) pl.poser(x + i, y, p.bois.creux);
  }

  // Le linteau, posé devant les poteaux et lié de corde.
  const linteau = sol - 97;
  poutre(pl, p, PORTE.poteauG - 5, linteau, PORTE.poteauD + PORTE.poteauL + 5 - (PORTE.poteauG - 5), 8);
  pl.rect(PORTE.poteauG - 5, linteau + 8, PORTE.poteauD + PORTE.poteauL + 10 - PORTE.poteauG, 1, p.bois.creux);
  for (const x of [PORTE.poteauG - 5, PORTE.poteauD + PORTE.poteauL + 3]) {
    // Le bout de la poutre : le bois de fil.
    pl.rect(x, linteau + 1, 2, 6, p.bois.clair);
    pl.rect(x, linteau + 3, 2, 2, p.bois.autre);
  }
  for (const x of [PORTE.poteauG, PORTE.poteauD]) {
    for (let k = 0; k < PORTE.poteauL; k++) {
      pl.poser(x + k, linteau + Math.round((k * 7) / (PORTE.poteauL - 1)), p.bois.corde);
      pl.poser(x + k, linteau + 7 - Math.round((k * 7) / (PORTE.poteauL - 1)), p.bois.cordeSombre);
    }
  }

  // Une torche sur chaque poteau : éteinte le jour, allumée à la tombée du jour, d'une flamme qui ne bouge pas.
  for (const x of [PORTE.poteauG, PORTE.poteauD]) {
    const cx = x + 4;
    const y = sol - 66;
    if (p.eclat > 0) {
      for (let dy = -12; dy <= 12; dy++) {
        for (let dx = -PORTE.poteauL; dx <= PORTE.poteauL; dx++) {
          const d = dx * dx + dy * dy;
          const fond = pl.lire(cx + dx, y - 6 + dy);
          if (fond && d < 120 && cx + dx >= x && cx + dx < x + PORTE.poteauL) pl.poser(cx + dx, y - 6 + dy, melanger(fond, "#f5a83a", p.eclat * (d < 40 ? 0.42 : 0.2)));
        }
      }
    }
    pl.rect(cx - 2, y + 4, 6, 2, p.pierre.sombre);
    pl.rect(cx, y - 2, 2, 10, p.tronc.sombre);
    pl.rect(cx - 1, y - 4, 4, 3, melanger(p.bois.creux, "#c9722a", p.eclat));
    if (p.eclat > 0.05) {
      pl.lettres(cx - 2, y - 11, [".. r..", "..rr..", ".rorr.", ".royr.", "rroyor", ".oyyo.", "..oo.."].map((ligne) => ligne.replace(" ", ".")), {
        r: melanger(p.bois.creux, "#e2452a", p.eclat),
        o: melanger(p.bois.creux, "#f58a1f", p.eclat),
        y: melanger(p.bois.creux, "#ffd75a", p.eclat),
      });
    } else {
      // De jour : pas de flamme, seulement la tête d'étoupe noircie.
      pl.rect(cx, y - 5, 2, 1, p.tronc.sombre);
    }
  }
  return pl.decor();
}

/* ---------- Le puits ---------- */

const PUITS_L = 66;
const PUITS_H = 88;

function puits(l: Lumiere): Decor {
  const p = couleurs(l);
  const pl = new Planche(PUITS_L, PUITS_H);
  const sol = PUITS_H - 1;

  // Le treuil, derrière les poteaux : un rondin, la corde enroulée au milieu.
  pl.rect(15, 37, 37, 6, (i, j) => (j === 37 ? p.bois.clair : j === 42 ? p.bois.sombre : alea(i >> 2, j) < 0.2 ? p.bois.autre : p.bois.fond));
  pl.rect(26, 36, 14, 8, (i, j) => (j === 36 || j === 43 ? p.bois.cordeSombre : (i - 26) % 3 === 2 ? p.bois.cordeSombre : p.bois.corde));

  // La corde et le seau, pendu au-dessus de la margelle.
  pl.rect(33, 44, 1, 9, p.bois.corde);
  pl.rect(32, 44, 1, 9, p.bois.cordeSombre);
  pl.lettres(27, 52, ["...aaaaaa...", "..a......a..", ".a........a.", "cbbbbbbbbbbd", "cffffffffffd", "cbbbbbbbbbbd", "cbbbbbbbbbbd", ".cffffffffd.", ".cbbbbbbbbd.", "..dddddddd.."], {
    a: p.bois.cordeSombre,
    b: p.bois.autre,
    c: p.bois.clair,
    d: p.bois.sombre,
    f: p.pierre.sombre,
  });

  // La margelle : un rond de pierres, une dalle claire dessus.
  pierres(pl, p, 11, 66, 44, 22, 6, 9);
  pl.rect(9, 62, 48, 4, (i, j) => (j === 62 ? p.pierre.clair : j === 65 ? p.pierre.joint : (i - 9) % 12 === 11 ? p.pierre.joint : i > 44 ? p.pierre.sombre : j === 63 && i < 24 ? p.pierre.clair : p.pierre.fond));
  // Un peu de mousse au pied.
  for (let x = 11; x < 55; x++) if (alea(x, 3) < 0.4) pl.poser(x, sol - (alea(x, 4) < 0.3 ? 1 : 0), p.feuilles.sombre);

  // Les deux poteaux qui portent le toit, liés au treuil.
  for (const x of [13, 49]) {
    poteau(pl, p, x, 26, 4, 36);
    ligature(pl, p, x - 1, 38, 6, 3);
  }

  // La manivelle, à droite.
  pl.rect(53, 39, 5, 2, p.pierre.sombre);
  pl.rect(57, 39, 2, 10, p.pierre.sombre);
  pl.rect(57, 48, 6, 2, p.bois.clair);
  pl.rect(57, 50, 6, 1, p.bois.sombre);

  // Le petit toit de bois : deux pentes de bardeaux, claires à gauche.
  const sommet = 6;
  for (let r = 0; r < 21; r++) {
    const demi = 2 + Math.round(r * 1.45);
    for (let dx = -demi; dx <= demi; dx++) {
      const x = 33 + dx;
      let couleur: string = dx < -1 ? p.bois.clair : dx > 1 ? p.bois.fond : p.bois.autre;
      if (r % 4 === 3) couleur = dx < 0 ? p.bois.fond : p.bois.sombre;
      else if ((dx + Math.floor(r / 4) * 3) % 6 === 0) couleur = dx < 0 ? p.bois.autre : p.bois.sombre;
      if (Math.abs(dx) >= demi - 1 || r === 20) couleur = p.bois.creux;
      if (r === 0) couleur = p.bois.sombre;
      pl.poser(x, sommet + r, couleur);
    }
  }
  pl.rect(31, 4, 5, 2, p.bois.sombre);
  pl.rect(32, 4, 2, 1, p.bois.clair);
  return pl.decor();
}

/* ---------- Le four à pain ---------- */

const FOUR_L = 124;
const FOUR_H = 132;
const FOUR_IMAGES = 3;

function four(l: Lumiere, image: number): Decor {
  const p = couleurs(l);
  const pl = new Planche(FOUR_L, FOUR_H);
  const sol = FOUR_H - 1;
  const toit = 36;
  const sousToit = 64;

  // Le conduit de pierres, au fond : il part du dôme et traverse l'auvent.
  pierres(pl, p, 78, toit - 10, 10, 60, 5, 6);
  pl.rect(77, toit - 11, 12, 2, (i) => (i < 82 ? p.pierre.clair : p.pierre.fond));
  pl.rect(77, toit - 9, 12, 1, p.pierre.joint);
  pl.rect(80, toit - 11, 6, 1, p.bois.creux);

  // La fumée : des bouffées lentes qui montent et s'effacent, penchées par le vent. Trois images qui se suivent sans saut.
  const fumee = p.c("#dcdcd6");
  const fumeeOmbre = p.c("#b4b6b8");
  for (let k = -1; k < 5; k++) {
    const monte = 6 * k + 2 * (((image % FOUR_IMAGES) + FOUR_IMAGES) % FOUR_IMAGES);
    const y = toit - 15 - monte;
    if (monte < 0 || y < 3) continue;
    const r = 2 + Math.floor(monte / 9);
    const fx = 83 + Math.round(monte / 3);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r - 2; dx <= r + 2; dx++) {
        const d = (dx * dx) / ((r + 2) * (r + 2)) + (dy * dy) / (r * r + 0.5);
        if (d > 1) continue;
        // Plus la bouffée est haute, plus elle se défait : son bord d'abord, puis tout.
        if (monte > 6 && d > 0.55 && (fx + dx + y + dy) % 2 === 0) continue;
        if (monte > 13 && (d > 0.6 || (fx + dx + y + dy) % 2 === 0)) continue;
        pl.poser(fx + dx, y + dy, dy > 0 || dx > r ? fumeeOmbre : fumee);
      }
    }
  }

  // Le dôme de terre, sur son socle de pierres : clair à gauche, sombre à droite, des cailloux pris dans la terre.
  const cx = 64;
  const baseDuDome = sol - 15;
  for (let dy = 0; dy <= 40; dy++) {
    const demi = Math.round(31 * Math.sqrt(1 - (dy * dy) / (40.5 * 40.5)));
    for (let dx = -demi; dx <= demi; dx++) {
      const x = cx + dx;
      const y = baseDuDome - dy;
      const pente = dx / 31 - dy / 80;
      const a = alea(x, y + 200);
      let couleur: string = pente < -0.45 ? p.mur.clair : pente > 0.38 ? p.mur.sombre : p.mur.fond;
      if (a < 0.05) couleur = p.mur.trame;
      else if (a > 0.975) couleur = p.pierre.fond;
      if (Math.abs(dx) === demi || dy === 40) couleur = p.mur.ombre;
      // Une ceinture de pierres au bas du dôme.
      if (dy < 5) couleur = (x + (dy > 2 ? 3 : 0)) % 7 === 0 || dy === 2 ? p.pierre.joint : pente > 0.3 ? p.pierre.sombre : pente < -0.4 ? p.pierre.clair : p.pierre.fond;
      pl.poser(x, y, couleur);
    }
  }
  // Deux fissures fines dans la terre cuite.
  trait(pl, cx + 14, baseDuDome - 36, cx + 19, baseDuDome - 27, p.mur.ombre);
  trait(pl, cx - 20, baseDuDome - 28, cx - 23, baseDuDome - 20, p.mur.trame);

  // La gueule : un arc de pierres ; noire le jour avec un fond de braise, rouge et dorée à la nuit.
  const gx = cx - 4;
  const gy = baseDuDome - 2;
  const braise = 0.3 + 0.7 * p.eclat;
  for (let dy = 0; dy <= 22; dy++) {
    for (let dx = -14; dx <= 14; dx++) {
      const haut = dy <= 8 ? 0 : dy - 8;
      const d = dx * dx + haut * haut * 1.0;
      if (d > 14 * 14 + 4) continue;
      const x = gx + dx;
      const y = gy - dy;
      if (d > 10 * 10 + 3) {
        // Les claveaux.
        const angle = Math.atan2(haut, dx);
        const claveau = dy <= 8 ? Math.floor(dy / 4) : 2 + Math.floor((angle / Math.PI) * 9);
        const joint = dy <= 8 ? dy % 4 === 3 : Math.floor((angle / Math.PI) * 9 + 0.12) !== Math.floor((angle / Math.PI) * 9);
        pl.poser(x, y, joint ? p.pierre.joint : dx < -4 ? p.pierre.clair : (claveau + (dx > 0 ? 1 : 0)) % 2 === 0 ? p.pierre.fond : p.pierre.sombre);
        continue;
      }
      // Le dedans : la braise au fond, en bas.
      const loin = Math.sqrt(dx * dx * 1.2 + (dy - 2) * (dy - 2)) / 12;
      const feu = loin < 0.34 ? "#ffd75a" : loin < 0.62 ? "#f5a83a" : loin < 0.95 ? "#c9722a" : "#8a3a1c";
      const part = loin < 0.62 ? braise : loin < 0.95 ? braise * 0.85 : braise * 0.6;
      pl.poser(x, y, melanger(p.bois.creux, feu, dy < 2 ? braise * 0.5 : part));
    }
  }

  // Le socle de pierres, et la lueur de la gueule posée dessus à la nuit.
  pierres(pl, p, 30, sol - 14, 70, 15, 5, 10);
  pl.rect(28, sol - 16, 74, 2, (i, j) => (j === sol - 16 ? p.pierre.clair : (i - 28) % 11 === 10 ? p.pierre.joint : i > 80 ? p.pierre.sombre : p.pierre.fond));
  if (p.eclat > 0) {
    for (let y = sol - 16; y <= sol; y++) {
      for (let x = gx - 18; x <= gx + 18; x++) {
        const fond = pl.lire(x, y);
        const d = Math.abs(x - gx) / 18 + (y - (sol - 16)) / 20;
        if (fond && d < 1) pl.poser(x, y, melanger(fond, "#f5a83a", p.eclat * 0.4 * (1 - d)));
      }
    }
  }

  // Le tas de bûches, à gauche : des bouts de rondins rangés.
  const buche = (x: number, y: number): void => {
    pl.lettres(x, y, [".aaaa.", "abbbbc", "abddbc", "abddbc", "abbbbc", ".cccc."], { a: p.bois.clair, b: p.c("#c79a62"), c: p.bois.sombre, d: p.bois.fond });
  };
  for (let rang = 0; rang < 3; rang++) for (let k = 0; k < 3 - rang; k++) buche(11 + k * 6 + rang * 3, sol - 5 - rang * 5);

  // La pelle à enfourner, appuyée contre le poteau de droite.
  pl.rect(106, sol - 42, 2, 43, (i) => (i === 106 ? p.bois.clair : p.bois.fond));
  pl.rect(103, sol - 55, 9, 14, (i, j) => (i === 103 || j === sol - 55 ? p.c("#d9b98a") : i === 111 || j === sol - 42 ? p.bois.fond : p.c("#c79a62")));

  // L'auvent : deux poteaux, une sablière, un toit de chaume en pente douce.
  for (const x of [6, 113]) {
    poteau(pl, p, x, sousToit, 5, sol - sousToit + 1);
    for (let y = sol - 2; y <= sol; y++) for (let i = 0; i < 5; i++) if (alea(x + i, y) < 0.45) pl.poser(x + i, y, p.bois.creux);
  }
  // Deux jambes de force.
  trait(pl, 11, sousToit + 16, 22, sousToit + 4, p.bois.sombre, 2);
  trait(pl, 111, sousToit + 16, 100, sousToit + 4, p.bois.sombre, 2);
  poutre(pl, p, 3, sousToit, 118, 4);
  for (const x of [6, 113]) ligature(pl, p, x - 1, sousToit, 7, 4);
  for (let r = 0; r < sousToit - toit; r++) {
    const y = toit + r;
    const de = 6 - Math.round(r / 5);
    const a = FOUR_L - 7 + Math.round(r / 5);
    for (let x = de; x <= a; x++) {
      // Le conduit passe au travers : un collier de terre autour.
      if (x >= 77 && x <= 88 && r < 3) continue;
      const part = (x - de) / (a - de);
      let couleur: string = part < 0.3 ? p.chaume.clair : part > 0.72 ? p.chaume.sombre : p.chaume.fond;
      if (r % 6 === 5) couleur = p.chaume.rang;
      else if (alea(x, y) < 0.16) couleur = p.chaume.brin;
      if (x === de || x === a || r === sousToit - toit - 1 || r === 0) couleur = p.chaume.bord;
      pl.poser(x, y, couleur);
    }
  }
  for (let x = 2; x < FOUR_L - 2; x++) if (alea(x, 19) < 0.45) pl.poser(x, sousToit, p.chaume.bord);
  pl.rect(76, toit + 3, 14, 2, p.mur.ombre);
  // Le faîte : une perche qui tient le chaume.
  pl.rect(5, toit - 1, 72, 1, p.bois.sombre);
  pl.rect(89, toit - 1, FOUR_L - 6 - 89, 1, p.bois.sombre);
  return pl.decor();
}

/* ---------- Le potager ---------- */

const POT_L = 180;
const POT_H = 64;

function potager(l: Lumiere): Decor {
  const p = couleurs(l);
  const pl = new Planche(POT_L, POT_H);
  const sol = POT_H - 1;

  // La clôture basse, au fond : des piquets et des gaules tressées.
  const hautDeCloture = sol - 17;
  for (let x = 3; x < POT_L - 3; x++) {
    for (let y = hautDeCloture; y <= sol; y++) {
      const gaule = Math.floor((y - hautDeCloture) / 3);
      const dans = (y - hautDeCloture) % 3;
      const devant = Math.floor((x - 3 + (gaule % 2) * 9) / 18) % 2 === 0 || (x - 3 + (gaule % 2) * 9) % 18 > 8;
      let couleur: string = dans === 0 ? (devant ? p.bois.autre : p.bois.fond) : dans === 1 ? (devant ? p.bois.fond : p.bois.sombre) : p.bois.creux;
      if (dans === 2 && alea(x, y) < 0.3) couleur = p.bois.sombre;
      pl.poser(x, y, couleur);
    }
  }
  for (let x = 3; x < POT_L - 3; x += 19) {
    pl.rect(x, hautDeCloture - 5, 3, 23, (i, j) => (j === hautDeCloture - 5 && i !== x + 1 ? null : i === x ? p.bois.clair : i === x + 2 ? p.bois.sombre : p.bois.fond));
  }

  // L'épouvantail, entre les deux planches : une croix de perches, une vieille tunique, une tête de toile, un chapeau de paille.
  const ex = 90;
  pl.rect(ex - 1, 9, 3, sol - 8, (i) => (i === ex - 1 ? p.bois.clair : i === ex + 1 ? p.bois.sombre : p.bois.fond));
  const toile = p.c("#a26a4c");
  const toileClaire = p.c("#b98060");
  const toileSombre = p.c("#7c4c38");
  // Les manches, sur la traverse, et la paille qui en sort.
  pl.rect(ex - 17, 20, 35, 5, (i, j) => (j === 20 ? toileClaire : j === 24 ? toileSombre : toile));
  pl.rect(ex - 21, 21, 4, 3, (i, j) => ((i + j) % 2 === 0 ? p.chaume.clair : p.chaume.sombre));
  pl.rect(ex + 18, 21, 4, 3, (i, j) => ((i + j) % 2 === 0 ? p.chaume.fond : p.chaume.sombre));
  pl.rect(ex - 23, 22, 2, 1, p.chaume.clair);
  pl.rect(ex + 22, 22, 2, 1, p.chaume.fond);
  // La tunique : elle s'évase vers le bas, un bord effiloché, une pièce cousue, une corde à la taille.
  for (let y = 25; y <= 45; y++) {
    const demi = 7 + Math.floor((y - 25) / 6);
    for (let dx = -demi; dx <= demi; dx++) {
      if (y === 45 && alea(ex + dx, 9) < 0.45) continue;
      let couleur: string = dx < -demi + 2 ? toileClaire : dx > demi - 3 ? toileSombre : toile;
      if ((dx === -2 || dx === 3) && y > 36) couleur = toileSombre;
      pl.poser(ex + dx, y, couleur);
    }
  }
  pl.rect(ex - 8, 33, 17, 1, p.bois.corde);
  pl.rect(ex - 8, 34, 17, 1, p.bois.cordeSombre);
  pl.rect(ex + 2, 35, 2, 4, p.bois.corde);
  pl.rect(ex - 5, 38, 4, 4, p.c("#8c8a5a"));
  pl.rect(ex - 5, 38, 4, 1, p.c("#a4a070"));
  // La paille au cou, la tête de toile sans visage, le chapeau.
  pl.rect(ex - 3, 18, 7, 2, (i, j) => ((i + j) % 2 === 0 ? p.chaume.clair : p.chaume.sombre));
  pl.disque(ex, 13, 5, (dx, dy) => (dx + dy < -3 ? p.c("#e2d2a4") : dx + dy > 4 ? p.c("#a8966a") : p.c("#cbb98a")));
  pl.rect(ex - 5, 17, 11, 1, p.bois.cordeSombre);
  pl.rect(ex - 10, 9, 21, 2, (i, j) => (j === 9 ? p.chaume.clair : p.chaume.sombre));
  pl.rect(ex - 5, 4, 11, 5, (i, j) => (j === 8 ? p.chaume.bord : i < ex - 2 ? p.chaume.clair : i > ex + 3 ? p.chaume.sombre : p.chaume.fond));
  pl.rect(ex - 3, 3, 7, 1, p.chaume.fond);

  // Les deux planches de légumes : un cadre de bois, la terre retournée.
  const planche = (x: number, large: number): void => {
    pl.rect(x + 1, sol - 12, large - 2, 3, (i, j) => {
      if (j === sol - 12 && (i === x + 1 || i === x + large - 2)) return null;
      const a = alea(i, j + 90);
      return a < 0.14 ? p.terre.claire : a < 0.4 ? p.terre.sombre : p.terre.fond;
    });
    pl.rect(x, sol - 9, large, 10, (i, j) => {
      const dy = j - (sol - 9);
      if (dy === 0) return p.bois.clair;
      if (dy === 5) return p.bois.creux;
      if (dy === 9) return p.bois.sombre;
      if ((i - x + (dy > 5 ? 11 : 0)) % 23 === 22) return p.bois.sombre;
      return alea(i >> 2, j) < 0.16 ? p.bois.fond : p.bois.autre;
    });
    for (const px of [x, x + Math.floor(large / 2) - 1, x + large - 3]) {
      pl.rect(px, sol - 11, 3, 12, (i) => (i === px ? p.bois.clair : i === px + 2 ? p.bois.creux : p.bois.sombre));
    }
  };
  planche(8, 68);
  planche(104, 68);

  const vert = { clair: p.c("#8ccf72"), fond: p.c("#5aa84a"), sombre: p.c("#2f7a3a"), bleu: p.c("#5f9a86"), bleuClair: p.c("#8fc4ac") };

  // Les choux : de grosses têtes rondes, le cœur clair.
  for (const [x, r] of [[18, 6], [32, 5], [45, 6]] as const) {
    const y = sol - 12 - r + 2;
    pl.disque(x, y, r, (dx, dy) => {
      const d = dx * dx + dy * dy;
      if (d <= 4) return vert.clair;
      if (d > r * r - r) return dx + dy > 2 ? vert.sombre : vert.fond;
      if ((Math.abs(dx) + dy + 20) % 3 === 0) return vert.clair;
      return dx + dy > 3 ? vert.sombre : vert.fond;
    });
    pl.rect(x - r - 1, y + r - 2, 3, 2, vert.sombre);
    pl.rect(x + r - 1, y + r - 2, 3, 2, vert.sombre);
  }
  // Les carottes : des fanes fines, le haut orangé de la racine au ras de la terre.
  for (let x = 55; x < 74; x += 5) {
    pl.lettres(x - 2, sol - 19, ["a...b", ".a.b.", "a.ab.", ".aab.", "..a.b", ".ab..", "..a..", ".oo.."], { a: vert.fond, b: vert.clair, o: p.c("#e07b2a") });
  }

  // Les haricots : trois perches liées en haut, les tiges qui grimpent.
  const hx = 118;
  const pied = sol - 11;
  for (const dx of [-9, 0, 9]) trait(pl, hx + dx, pied, hx + Math.round(dx / 9), pied - 36, dx > 0 ? p.bois.fond : p.bois.clair);
  pl.rect(hx - 1, pied - 39, 3, 3, p.bois.fond);
  pl.rect(hx - 2, pied - 34, 5, 2, p.bois.corde);
  for (let y = pied - 30; y <= pied; y++) {
    const part = (pied - y) / 36;
    for (const dx of [-9, 0, 9]) {
      const x = hx + Math.round(dx * (1 - part));
      for (let e = -2; e <= 2; e++) {
        const a = alea(x + e + dx, y);
        if (a < 0.4) pl.poser(x + e, y, a < 0.1 ? vert.clair : a < 0.3 ? vert.fond : vert.sombre);
      }
    }
  }
  // Les poireaux : des feuilles droites, bleutées, le pied blanc.
  for (let x = 134; x < 150; x += 4) {
    pl.lettres(x - 1, sol - 22, ["a.b", "a.b", ".ab", ".a.", ".ab", ".a.", ".a.", ".a.", ".w.", ".w."], { a: vert.bleu, b: vert.bleuClair, w: p.c("#e4e6d2") });
  }
  // Les courges : deux, rondes et côtelées, leurs feuilles au sol.
  for (const [x, r] of [[156, 5], [166, 4]] as const) {
    const y = sol - 12 - r + 2;
    pl.disque(x, y, r, (dx, dy) => {
      if (Math.abs(dy) > r - 1) return null;
      if (dx % 3 === 0 && dx !== 0) return p.c("#b85a1c");
      return dx + dy < -2 ? p.c("#f2a03c") : dx + dy > 3 ? p.c("#c2661e") : p.c("#e07b2a");
    });
    pl.rect(x, y - r, 1, 2, vert.sombre);
    pl.rect(x - r - 2, y + r - 2, 3, 2, vert.fond);
  }

  // Un panier d'osier posé près de l'épouvantail, avec la récolte du jour.
  pl.lettres(76, sol - 9, [".g.o.g.o..", "gogggogog.", "aaaaaaaaaa", "bcbcbcbcbd", "cbcbcbcbcd", "bcbcbcbcbd", "cbcbcbcbcd", ".bcbcbcbd.", ".dddddddd."], {
    a: p.bois.corde,
    b: p.bois.corde,
    c: p.bois.cordeSombre,
    d: p.bois.sombre,
    g: vert.fond,
    o: p.c("#e07b2a"),
  });
  return pl.decor();
}

/* ---------- La tour de guet ---------- */

const TOUR_L = 80;
const TOUR_H = 170;

function tour(l: Lumiere): Decor {
  const p = couleurs(l);
  const pl = new Planche(TOUR_L, TOUR_H);
  const sol = TOUR_H - 1;
  const cx = 40;
  const plancher = 98;

  // Les pieux, un peu écartés au pied : la paire du fond d'abord, plus sombre.
  const pieu = (hautX: number, basX: number, large: number, fond: boolean): void => {
    for (let y = plancher + 4; y <= sol; y++) {
      const x = Math.round(hautX + ((basX - hautX) * (y - plancher - 4)) / (sol - plancher - 4));
      for (let i = 0; i < large; i++) {
        let couleur: string = fond ? (i === 0 ? p.tronc.fond : p.tronc.sombre) : i === 0 ? p.bois.clair : i === large - 1 ? p.bois.sombre : alea(i, y >> 2) < 0.15 ? p.bois.autre : p.bois.fond;
        if (!fond && y > sol - 3 && alea(x + i, y) < 0.5) couleur = p.bois.creux;
        pl.poser(x + i, y, couleur);
      }
    }
  };
  pieu(26, 23, 3, true);
  pieu(51, 54, 3, true);

  // Les croix de contreventement, derrière, et les traverses.
  const bordG = (y: number): number => Math.round(16 + ((8 - 16) * (y - plancher - 4)) / (sol - plancher - 4));
  const bordD = (y: number): number => TOUR_L - 1 - bordG(y);
  const etages = [plancher + 5, 136, sol - 1];
  for (let e = 0; e < etages.length - 1; e++) {
    const haut = etages[e]! + 3;
    const bas = etages[e + 1]! - 1;
    trait(pl, bordG(haut) + 4, haut, bordD(bas) - 2, bas, p.tronc.sombre, 2);
    trait(pl, bordD(haut) - 2, haut, bordG(bas) + 4, bas, p.bois.sombre, 2);
  }
  poutre(pl, p, bordG(136) - 1, 136, bordD(136) - bordG(136) + 3, 3);

  // Les deux pieux de devant.
  pieu(16, 8, 5, false);
  pieu(59, 67, 5, false);
  for (const y of [136]) {
    ligature(pl, p, bordG(y) - 1, y, 7, 3);
    ligature(pl, p, bordD(y) - 5, y, 7, 3);
  }

  // L'échelle, devant, jusqu'à la trappe du plancher.
  for (let y = plancher + 4; y <= sol; y++) {
    pl.poser(34, y, p.bois.clair);
    pl.poser(35, y, p.bois.fond);
    pl.poser(44, y, p.bois.clair);
    pl.poser(45, y, p.bois.sombre);
    if ((sol - y) % 6 === 3) pl.rect(36, y, 8, 1, p.bois.clair);
    if ((sol - y) % 6 === 2) pl.rect(36, y, 8, 1, p.bois.sombre);
  }

  // Le plancher de la plateforme : des planches vues en bout sur une poutre.
  poutre(pl, p, 7, plancher, 66, 4);
  pl.rect(7, plancher + 4, 66, 1, p.bois.creux);
  for (let x = 9; x < 72; x += 7) pl.rect(x, plancher + 1, 1, 2, p.bois.sombre);

  // La cabane ouverte : quatre poteaux, un garde-corps de planches.
  const hautDeCabane = 43;
  for (const x of [29, 49]) pl.rect(x, hautDeCabane, 2, plancher - hautDeCabane, (i) => (i === x ? p.tronc.fond : p.tronc.sombre));
  const gardeCorps = 76;
  pl.rect(12, gardeCorps + 2, 56, plancher - gardeCorps - 2, (i, j) => {
    const lame = (i - 12) % 6;
    if (lame === 5) return p.bois.creux;
    if (j === plancher - 1) return p.bois.sombre;
    return lame === 0 ? p.bois.clair : alea(i, j >> 2) < 0.14 ? p.bois.fond : p.bois.autre;
  });
  poutre(pl, p, 10, gardeCorps, 60, 3);
  for (const x of [13, 63]) {
    poteau(pl, p, x, hautDeCabane, 4, plancher - hautDeCabane);
    ligature(pl, p, x - 1, gardeCorps, 6, 3);
  }

  // La lanterne du guetteur, pendue sous le toit : éteinte le jour, allumée à la nuit, sans bouger.
  pl.rect(cx, hautDeCabane, 1, 4, p.bois.cordeSombre);
  pl.rect(cx - 2, hautDeCabane + 4, 5, 1, p.pierre.sombre);
  pl.rect(cx - 2, hautDeCabane + 5, 5, 5, (i, j) => {
    if (i === cx - 2 || i === cx + 2) return p.pierre.sombre;
    return melanger(p.c("#c9b278"), i === cx && j < hautDeCabane + 9 ? "#fff1a8" : "#ffd75a", p.eclat);
  });
  pl.rect(cx - 2, hautDeCabane + 10, 5, 1, p.pierre.sombre);
  if (p.eclat > 0) {
    // Sa lueur sur le dessous du toit et le haut des poteaux.
    for (let y = hautDeCabane - 6; y <= hautDeCabane + 16; y++) {
      for (let x = cx - 28; x <= cx + 28; x++) {
        const d = ((x - cx) * (x - cx)) / 784 + ((y - hautDeCabane - 6) * (y - hautDeCabane - 6)) / 144;
        const fond = pl.lire(x, y);
        if (fond && d < 1 && !(Math.abs(x - cx) <= 2 && y >= hautDeCabane + 4 && y <= hautDeCabane + 10)) pl.poser(x, y, melanger(fond, "#f5a83a", p.eclat * 0.3 * (1 - d)));
      }
    }
  }

  // Le toit pointu de chaume.
  toitDeChaume(pl, p, cx, 3, 40, 36);
  if (p.eclat > 0) {
    for (let x = cx - 20; x <= cx + 20; x++) {
      const fond = pl.lire(x, 42);
      if (fond) pl.poser(x, 42, melanger(fond, "#f5a83a", p.eclat * 0.35 * (1 - Math.abs(x - cx) / 21)));
    }
  }
  return pl.decor();
}

/* ---------- Le lot ---------- */

export const LOT_A: Partial<Record<BatimentId, DessinDeBatiment>> = {
  palissade: { largeur: PAL_L, hauteur: PAL_H, images: 1, dessiner: (lumiere) => palissade(lumiere) },
  puits: { largeur: PUITS_L, hauteur: PUITS_H, images: 1, dessiner: (lumiere) => puits(lumiere) },
  four: { largeur: FOUR_L, hauteur: FOUR_H, images: FOUR_IMAGES, dessiner: (lumiere, image) => four(lumiere, image) },
  potager: { largeur: POT_L, hauteur: POT_H, images: 1, dessiner: (lumiere) => potager(lumiere) },
  tour: { largeur: TOUR_L, hauteur: TOUR_H, images: 1, dessiner: (lumiere) => tour(lumiere) },
};
