/**
 * Les intérieurs du lot 1 : le four à pain, la tour de guet, le grenier sur pilotis et le moulin à eau. Chaque dedans est
 * une coupe, comme une maison de poupée : le toit tranché en haut, le ciel de l'heure autour, la terre tranchée en bas.
 * Mêmes matières et mêmes couleurs que les dehors (`batiments/lot-a.ts`, `lot-b.ts`) : chaume, torchis, bois, pierre.
 *
 * La lumière : le dehors (ciel, lointain, chaume du toit) suit `couleurDuDehors` ; le dedans suit `couleurDuDedans`, puis
 * une pénombre monte avec la nuit, loin des lanternes et des braises, qui ne s'allument que quand le jour baisse et ne
 * bougent pas. Le jour, la lumière entre par les ouvertures. Rien n'est tiré au hasard : `alea(x, y)` donne un grain fixe.
 * Ce qui bouge, lentement : la fumée du four et la buée des pains, le fanion de la tour, la queue du chat du grenier, la
 * roue, les engrenages et la meule du moulin. Aucun dessin ne rappelle une œuvre existante. Design : Claude Fable 5.2.
 */
import { type Decor, type Palette, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, PLEIN_JOUR, cielDuVillage, couleurDuDedans, couleurDuDehors, melanger } from "../lumiere";
import { TRICOLORE, poserEtagere, poserTonneau } from "../monde/pieces";
import type { DessinDInterieur, InterieurId } from "./type";

/* ---------- La toile et la lumière ---------- */

/** Une planche à dessin qui retient, case par case, ce qui garde sa couleur : le dehors déjà teinté, ce qui éclaire. */
class Toile extends Planche {
  readonly franc: Uint8Array;
  private mode = 0;
  constructor(largeur: number, hauteur: number) {
    super(largeur, hauteur, "#000000");
    this.franc = new Uint8Array(largeur * hauteur);
  }
  override poser(x: number, y: number, couleur: string | null): void {
    if (couleur === null || x < 0 || x >= this.largeur || y < 0 || y >= this.hauteur) return;
    this.cases[y * this.largeur + x] = couleur;
    this.franc[y * this.largeur + x] = this.mode;
  }
  /** Ce qui est dessiné ici garde sa couleur : la lumière du dedans n'y touche pas. */
  tel(dessin: () => void): void {
    const avant = this.mode;
    this.mode = 1;
    dessin();
    this.mode = avant;
  }
  /** Ce qui est dessiné ici est un sol : le jour qui entre s'y pose. */
  auSol(dessin: () => void): void {
    const avant = this.mode;
    this.mode = 2;
    dessin();
    this.mode = avant;
  }
  /** La couleur déjà posée, mêlée à une autre : une ombre, une buée, une poussière. */
  voiler(x: number, y: number, vers: string, part: number): void {
    if (x < 0 || x >= this.largeur || y < 0 || y >= this.hauteur) return;
    const i = y * this.largeur + x;
    this.cases[i] = melanger(this.cases[i] ?? "#000000", vers, part);
  }
  /** Un trait d'un point à l'autre, épais de `epais` cases. */
  trait(x0: number, y0: number, x1: number, y1: number, couleur: string, epais = 1): void {
    const pas = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const couche = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    for (let k = 0; k <= pas; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / pas);
      const y = Math.round(y0 + ((y1 - y0) * k) / pas);
      for (let e = 0; e < epais; e++) this.poser(couche ? x : x + e, couche ? y + e : y, couleur);
    }
  }
}

/** Ce qui éclaire quand le jour baisse : une lanterne, des braises. */
interface Foyer {
  x: number;
  y: number;
  rayon: number;
  force: number;
}
interface Eclairage {
  foyers: readonly Foyer[];
  /** La part de pénombre, la nuit, loin des foyers. */
  penombre: number;
  /** Le jour : la lumière qui entre par les ouvertures, de 0 à 1 selon la case ; `sol` dit si la case est un sol nu. */
  rayons?: (x: number, y: number, sol: boolean) => number;
  /** Une ombre qui ne dépend pas de l'heure : un recoin, un dessous. */
  ombre?: (x: number, y: number) => number;
}

const borner = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));
/** De 0 en plein jour à 1 à la nuit : la force de ce qui éclaire (comme les bâtiments du dehors). */
const eclatDe = (l: Lumiere): number => borner((0.8 - l.jour) / 0.5);
const NOIR = "#1a1410";
/** Le bleu nuit de la bannière du clan (comme celle de la grande tour). */
const BLEU_NUIT = "#1c2a5e";
const PENOMBRE = "#16122a";
const LUEUR = "#f5a83a";

/** Le dernier passage : teinte le dedans à la lumière de l'heure, pose les rayons du jour, la pénombre et les lueurs de la nuit. */
function finir(t: Toile, l: Lumiere, e: Eclairage): Decor {
  const eclat = eclatDe(l);
  const nuit = 1 - l.jour;
  const soleil = melanger("#fff0c0", "#ffc27a", l.rougeur);
  const dedans = new Map<string, string>();
  for (let y = 0; y < t.hauteur; y++) {
    for (let x = 0; x < t.largeur; x++) {
      const i = y * t.largeur + x;
      if (t.franc[i] === 1) continue;
      const brute = t.cases[i] ?? "#000000";
      let c = dedans.get(brute);
      if (c === undefined) {
        c = couleurDuDedans(brute, l);
        dedans.set(brute, c);
      }
      const o = e.ombre ? e.ombre(x, y) : 0;
      if (o > 0) c = melanger(c, NOIR, o);
      const r = e.rayons && l.jour > 0 ? e.rayons(x, y, t.franc[i] === 2) : 0;
      if (r > 0) c = melanger(c, soleil, r * l.jour);
      if (nuit > 0) {
        let lum = 0;
        for (const f of e.foyers) {
          const d = Math.hypot(x - f.x, (y - f.y) * 1.15) / f.rayon;
          if (d < 1) lum += f.force * (1 - d) * (1 - d);
        }
        lum = Math.min(1, lum);
        c = melanger(c, PENOMBRE, e.penombre * nuit * (1 - Math.min(1, lum * 1.7)));
        if (eclat > 0 && lum > 0) c = melanger(c, LUEUR, eclat * lum * 0.5);
      }
      t.cases[i] = c;
    }
  }
  return t.decor();
}

/* ---------- Les matières, à leurs couleurs de plein jour ---------- */

const J = paletteDuDehors(PLEIN_JOUR);
const B = J.bois;
/** La pierre bleutée du four et de la tour (`lot-a.ts`), la pierre chaude du grenier et du moulin (`lot-b.ts`). */
const PIERRE_BLEUE = {
  clair: "#a9aebb",
  fond: "#8d95a6",
  sombre: "#6a7284",
  joint: "#4e5564",
  trou: "#33394a",
} as const;
const PIERRE_CHAUDE = {
  clair: "#a69f90",
  fond: "#8c8577",
  sombre: "#736d61",
  joint: "#5a554c",
  trou: "#3b362f",
} as const;
type Pierre = {
  readonly clair: string;
  readonly fond: string;
  readonly sombre: string;
  readonly joint: string;
  readonly trou: string;
};
const TOILE = {
  fond: "#cbbb8c",
  clair: "#ddcfa2",
  sombre: "#a8996e",
  lien: "#a08c5c",
} as const;
const GRAIN = {
  fond: "#e0b84e",
  clair: "#f2d272",
  sombre: "#c0963a",
  creux: "#9c7a30",
} as const;
const FARINE = {
  fond: "#efe6cf",
  clair: "#fbf5e4",
  sombre: "#d6c9a8",
} as const;
const CROUTE = {
  clair: "#e6b468",
  fond: "#c98a3c",
  sombre: "#a06a2a",
  bord: "#7a4a1c",
  farine: "#f3e2b8",
} as const;
const FER = { clair: "#9aa2b4", fond: "#6c7486", sombre: "#474e5e" } as const;
/** Le dessous d'un toit de chaume, vu du dedans : la paille dans l'ombre. */
const DESSOUS = {
  fond: "#86682b",
  clair: "#9c7a30",
  sombre: "#6b5122",
  latte: "#4f3a1a",
} as const;

/** La pierre à la lumière du dehors. */
function pierreDehors(tons: Pierre, l: Lumiere): Pierre {
  const c = (deJour: string): string => couleurDuDehors(deJour, melanger(deJour, "#101a3a", 0.52), l);
  return {
    clair: c(tons.clair),
    fond: c(tons.fond),
    sombre: c(tons.sombre),
    joint: c(tons.joint),
    trou: c(tons.trou),
  };
}

/* ---------- Les pièces communes ---------- */

type Bois = {
  readonly clair: string;
  readonly fond: string;
  readonly autre: string;
  readonly sombre: string;
  readonly creux: string;
};

const TRONC: Bois = {
  clair: J.tronc.clair,
  fond: J.tronc.fond,
  autre: J.tronc.fond,
  sombre: J.tronc.sombre,
  creux: B.creux,
};

/** Un poteau debout : clair à gauche, sombre à droite, quelques veines. */
function poteau(t: Planche, x: number, y: number, l: number, h: number, b: Bois = B): void {
  t.rect(x, y, l, h, (i, j) => {
    if (i === x) return b.clair;
    if (i === x + l - 1) return b.sombre;
    if (l > 5 && i === x + l - 2) return alea(i, j >> 1) < 0.5 ? b.sombre : b.fond;
    return alea(i, j >> 2) < 0.16 ? b.autre : alea(i + 9, j >> 3) < 0.05 ? b.sombre : b.fond;
  });
}

/** Une poutre couchée : claire dessus, sombre dessous. */
function poutre(t: Planche, x: number, y: number, l: number, h: number, b: Bois = B): void {
  t.rect(x, y, l, h, (i, j) => {
    if (j === y) return b.clair;
    if (j === y + h - 1) return b.sombre;
    return alea(i >> 2, j) < 0.16 ? b.autre : (i - x) % 37 === 36 ? b.sombre : b.fond;
  });
}

/** Une pièce de bois en biais, épaisse de `epais` cases : claire dessus, sombre dessous. */
function biais(t: Toile, x0: number, y0: number, x1: number, y1: number, epais: number, b: Bois = B): void {
  const pas = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const couche = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  for (let k = 0; k <= pas; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / pas);
    const y = Math.round(y0 + ((y1 - y0) * k) / pas);
    for (let e = 0; e < epais; e++) t.poser(couche ? x : x + e, couche ? y + e : y, e === 0 ? b.clair : e === epais - 1 ? b.sombre : b.fond);
  }
}

/** Une ligature de corde autour d'un poteau ou d'une poutre. */
function ligature(t: Planche, x: number, y: number, l: number, h = 3): void {
  t.rect(x, y, l, h, (i, j) => ((i + j) % 3 === 0 ? B.cordeSombre : j === y ? B.corde : (i + j) % 3 === 1 ? B.corde : B.cordeSombre));
}

/** Un mur de planches debout, de deux tons, quelques nœuds. */
function planchesDebout(t: Planche, x: number, y: number, l: number, h: number, pas = 7, graine = 0): void {
  t.rect(x, y, l, h, (i, j) => {
    const k = (i - x) % pas;
    const lame = Math.floor((i - x) / pas);
    if (k === pas - 1) return B.creux;
    if (k === 0) return B.clair;
    const noeud = alea(lame + graine, 3) * h;
    if (Math.abs(j - y - noeud) < 2 && k > 1 && k < 5) return B.sombre;
    if (alea(i, (j >> 2) + graine) < 0.07) return B.sombre;
    return lame % 2 === 0 ? B.fond : B.autre;
  });
}

/** Un mur de pierres : des lits de moellons décalés, joints creusés. `ombre` : de −1 (éclairé) à 2 (dans le noir). */
function pierres(
  t: Planche,
  tons: Pierre,
  x: number,
  y: number,
  l: number,
  h: number,
  o: {
    lit?: number;
    moellon?: number;
    graine?: number;
    ombre?: (i: number, j: number) => number;
  } = {},
): void {
  const lit = o.lit ?? 6;
  const moellon = o.moellon ?? 11;
  const graine = o.graine ?? 0;
  const gamme = [tons.clair, tons.fond, tons.sombre, tons.joint, tons.trou] as const;
  t.rect(x, y, l, h, (i, j) => {
    const rang = Math.floor((j - y) / lit);
    const dans = (j - y) % lit;
    const decale = i - x + (rang % 2) * Math.floor(moellon / 2) + Math.floor(alea(rang + 3, graine + 11) * 4);
    const om = o.ombre ? o.ombre(i, j) : 0;
    if (dans === lit - 1 || decale % moellon === 0) return gamme[borner(3 + (om >= 2 ? 1 : 0), 0, 4)]!;
    const a = alea(Math.floor(decale / moellon) + graine * 31, rang + 17);
    let ton = a < 0.28 ? 0 : a < 0.8 ? 1 : 2;
    if (dans === 0 && ton > 0 && a < 0.6) ton -= 1;
    return gamme[borner(ton + om, 0, 3)]!;
  });
}

/** Un mur de torchis, comme celui des huttes : une trame toutes les trois rangées, clair à gauche, sombre à droite. */
function torchis(t: Planche, x: number, y: number, l: number, h: number): void {
  t.rect(x, y, l, h, (i, j) => {
    if ((j - y) % 3 === 2) return alea(i >> 2, j) < 0.2 ? J.mur.sombre : J.mur.trame;
    const a = alea(i, j + 70);
    const part = (i - x) / l;
    if (a < 0.05) return J.mur.clair;
    if (a > 0.96) return J.mur.sombre;
    return part < 0.12 && a < 0.5 ? J.mur.clair : part > 0.9 && a < 0.5 ? J.mur.sombre : J.mur.fond;
  });
}

/** Un clayonnage : des brins d'osier tressés entre des piquets. */
function clayon(x: number, y: number): string {
  const brin = Math.floor(y / 3);
  const k = (x + (brin % 2) * 6) % 12;
  if (y % 3 === 2) return "#5c4020";
  if (k < 2) return "#6f5129";
  const dessus = (Math.floor((x + (brin % 2) * 6) / 12) + brin) % 2 === 0;
  return dessus ? (k < 5 ? "#c49a5c" : "#a8824a") : alea(x, y) < 0.2 ? "#9a7440" : "#86602f";
}

/** Un sac debout, lié en haut, posé sur la rangée `bas`. */
function sac(t: Planche, x: number, bas: number, l = 14, h = 18, tons: { fond: string; clair: string; sombre: string; lien: string } = TOILE): void {
  const haut = bas - h + 1;
  for (let r = 0; r < h; r++) {
    const y = haut + r;
    const retrait = r < 2 ? Math.floor(l / 2) - 3 : r === 2 ? Math.floor(l / 2) - 2 : r === 3 ? 2 : r === 4 || r === h - 1 ? 1 : 0;
    for (let i = x + retrait; i < x + l - retrait; i++) {
      const u = (i - x) / (l - 1);
      let couleur: string = u < 0.28 ? tons.clair : u > 0.7 ? tons.sombre : tons.fond;
      if (r === 2) couleur = tons.lien;
      else if (r === h - 1 || i === x + l - retrait - 1) couleur = tons.sombre;
      else if (r > 4 && alea(i, y + 5) < 0.09) couleur = tons.sombre;
      else if (r > 5 && (r + i) % 9 === 0 && u > 0.2 && u < 0.6) couleur = tons.sombre;
      t.poser(i, y, couleur);
    }
  }
}

/** Un sac couché : un boudin de toile, lié à un bout. */
function sacCouche(t: Planche, x: number, bas: number, l = 20, h = 10, tons: { fond: string; clair: string; sombre: string; lien: string } = TOILE): void {
  for (let r = 0; r < h; r++) {
    const retrait = r === 0 || r === h - 1 ? 3 : r === 1 || r === h - 2 ? 1 : 0;
    for (let i = x + retrait; i < x + l - retrait; i++) {
      let couleur: string = r < 3 ? tons.clair : r > h - 3 ? tons.sombre : alea(i, bas - r) < 0.08 ? tons.sombre : tons.fond;
      if (i === x + l - 5) couleur = tons.lien;
      t.poser(i, bas - h + 1 + r, couleur);
    }
  }
}

/** Un panier d'osier tressé, évasé, avec son bourrelet. */
function panier(t: Planche, x: number, bas: number, l: number, h: number): void {
  for (let r = 0; r < h; r++) {
    const y = bas - h + 1 + r;
    const retrait = Math.round((r * 3) / h);
    for (let i = x + retrait; i < x + l - retrait; i++) {
      const u = (i - x) / l;
      let couleur: string = (i + r * 2) % 4 < 2 ? "#b88a4a" : "#96703a";
      if (r % 3 === 2) couleur = "#7a5a2c";
      if (u > 0.75) couleur = melanger(couleur, NOIR, 0.25);
      if (r === 0) couleur = "#d2a662";
      if (r === 1) couleur = "#8a6632";
      t.poser(i, y, couleur);
    }
  }
}

/** Un pain rond, posé sur la rangée `bas` : la croûte dorée, ses grignes farinées. */
function pain(t: Planche, cx: number, bas: number, demi: number, haut: number): void {
  for (let dy = 0; dy < haut; dy++) {
    const d = Math.max(1, Math.round(demi * Math.sqrt(1 - (dy * dy) / (haut * haut))));
    for (let dx = -d; dx <= d; dx++) {
      let couleur: string = dy >= haut - 2 || dx < -d * 0.45 ? CROUTE.clair : dx > d * 0.5 ? CROUTE.sombre : CROUTE.fond;
      if (dy === 0 || dx === d) couleur = CROUTE.bord;
      else if (dy > 1 && Math.abs(dx) < d - 1 && (dx + dy * 2 + 60) % 6 === 0) couleur = CROUTE.farine;
      t.poser(cx + dx, bas - dy, couleur);
    }
  }
}

/** Un pain long, couché. */
function painLong(t: Planche, x: number, bas: number, l: number): void {
  for (let r = 0; r < 5; r++) {
    const retrait = r === 0 || r === 4 ? 2 : r === 1 ? 1 : 0;
    for (let i = x + retrait; i < x + l - retrait; i++) {
      let couleur: string = r < 2 ? CROUTE.clair : r === 4 ? CROUTE.bord : CROUTE.fond;
      if (r > 0 && r < 4 && (i - x + r) % 5 === 0) couleur = CROUTE.farine;
      if (i === x + l - retrait - 1) couleur = CROUTE.sombre;
      t.poser(i, bas - 4 + r, couleur);
    }
  }
}

const CRUCHE = ["..aaaa...", "..abba...", "...ab....", "..abba.a.", ".abbbbaaa", "abbcbbba.", "abccbbba.", "abcbbbba.", "abbbbbda.", ".abbbda..", "..aaaa..."] as const;
/** Une cruche de terre cuite. */
function cruche(t: Planche, x: number, bas: number): void {
  t.lettres(x, bas - CRUCHE.length + 1, CRUCHE, {
    a: "#5a2f18",
    b: "#b0683c",
    c: "#d08a5a",
    d: "#8a4a28",
  });
}

/** Un seau de bois cerclé, son anse de corde. `plein` : la couleur de ce qu'il contient. */
function seau(t: Planche, x: number, bas: number, plein: string | null = null): void {
  for (let r = 0; r < 11; r++) {
    const retrait = r > 7 ? 1 : 0;
    for (let i = x + retrait; i < x + 12 - retrait; i++) {
      let couleur: string = (i - x) % 3 === 2 ? B.sombre : i < x + 4 ? B.clair : i > x + 8 ? B.sombre : B.fond;
      if (r === 2 || r === 8) couleur = i < x + 4 ? FER.clair : FER.fond;
      if (r === 0) couleur = plein ?? B.creux;
      if (r === 0 && (i === x || i === x + 11)) couleur = B.clair;
      t.poser(i, bas - 10 + r, couleur);
    }
  }
  for (let i = 0; i < 12; i++) t.poser(x + i, bas - 11 - Math.round(3 * Math.sin((Math.PI * i) / 11)), B.cordeSombre);
}

/** Un coffre de planches cerclé de fer, sa serrure. */
function coffre(t: Planche, x: number, bas: number, l: number, h: number): void {
  const haut = bas - h + 1;
  t.rect(x, haut, l, h, (i, j) => {
    const r = j - haut;
    if (i === x || i === x + l - 1 || j === bas) return B.creux;
    if (r === 0) return B.clair;
    if (r < 6) return r === 5 ? B.creux : (i - x) % 9 === 8 ? B.sombre : r < 3 ? B.autre : B.fond;
    if ((i - x) % 9 === 8) return B.sombre;
    return (r - 6) % 7 === 6 ? B.sombre : alea(i >> 1, j) < 0.1 ? B.autre : B.fond;
  });
  for (const fx of [x + 4, x + l - 7]) t.rect(fx, haut, 3, h - 1, (i, j) => (i === fx ? FER.clair : (j - haut) % 5 === 2 ? FER.sombre : FER.fond));
  t.rect(x + Math.floor(l / 2) - 2, haut + 4, 4, 5, (i, j) => (j === haut + 4 ? FER.clair : i === x + Math.floor(l / 2) - 1 && j === haut + 7 ? NOIR : FER.fond));
}

/** Une lanterne pendue : éteinte le jour, allumée à la nuit, sans bouger. `y` : le haut de sa chaîne. */
function lanterne(t: Toile, x: number, y: number, chaine: number, eclat: number): void {
  t.rect(x, y, 1, chaine, (_i, j) => ((j - y) % 2 === 0 ? FER.sombre : FER.fond));
  const h = y + chaine;
  t.rect(x - 2, h, 5, 1, FER.sombre);
  t.rect(x - 3, h + 1, 7, 2, (i) => (i < x ? FER.fond : FER.sombre));
  t.tel(() => {
    t.rect(x - 3, h + 3, 7, 8, (i, j) => {
      if (i === x - 3 || i === x + 3) return couleurDuDedansFer(eclat);
      const coeur = Math.abs(i - x) <= 1 && j > h + 4 && j < h + 9;
      return melanger(coeur ? "#b9a66e" : "#8f8256", coeur ? "#fff1a8" : "#ffd75a", eclat);
    });
  });
  t.rect(x - 3, h + 11, 7, 2, (i, j) => (j === h + 12 ? FER.sombre : i < x ? FER.fond : FER.sombre));
}
const couleurDuDedansFer = (eclat: number): string => melanger(FER.sombre, "#7a5a30", eclat * 0.6);

/** Le ciel de l'heure sur toute la toile (bandes jusqu'à la rangée `horizon`), et ses étoiles à la nuit. */
function peindreCiel(t: Toile, l: Lumiere, horizon: number): string[] {
  const ciel = cielDuVillage(l);
  const etoile = l.jour < 0.4 ? 1 - l.jour * 2.5 : 0;
  for (let y = 0; y < t.hauteur; y++) {
    const bande = ciel[Math.min(4, Math.floor((y / horizon) * 5))]!;
    for (let x = 0; x < t.largeur; x++) {
      const a = alea(x + 500, y + 300);
      t.poser(x, y, etoile > 0 && y < horizon - 8 && a < 0.006 ? melanger(bande, a < 0.002 ? "#e8ecf8" : "#c0c9e2", etoile) : bande);
    }
  }
  return ciel;
}

/** Une bande de chaume vue en coupe, au-dessus de la rangée `hautDe(x)` : la tranche du toit, à la lumière du dehors. */
function chaumeEnCoupe(t: Toile, p: Palette, x0: number, x1: number, hautDe: (x: number) => number, epais: number): void {
  for (let x = x0; x <= x1; x++) {
    const haut = hautDe(x);
    const u = (x - x0) / (x1 - x0);
    for (let j = 0; j < epais; j++) {
      const meles = (x + j) % 2 === 0;
      let couleur: string = u < 0.26 || (u < 0.34 && meles) ? p.chaume.clair : u > 0.76 || (u > 0.68 && meles) ? p.chaume.sombre : p.chaume.fond;
      if (j % 5 === 4) couleur = p.chaume.rang;
      else if (alea(x, haut + j + 200) < 0.16) couleur = p.chaume.brin;
      if (j === 0 || j === epais - 1 || x === x0 || x === x1) couleur = p.chaume.bord;
      t.poser(x, haut + j, couleur);
    }
    if (alea(x, 19) < 0.5) t.poser(x, haut + epais, p.chaume.bord);
    if (alea(x, 23) < 0.18) t.poser(x, haut + epais + 1, p.chaume.bord);
  }
}

/** La terre tranchée sous le bâtiment : des cailloux, des racines, plus sombre vers le bas. */
function terreEnCoupe(t: Toile, p: Palette, pierre: Pierre, y: number, herbeDe: (x: number) => boolean): void {
  for (let j = y; j < t.hauteur; j++) {
    for (let x = 0; x < t.largeur; x++) {
      const r = j - y;
      const a = alea(x, j + 900);
      let couleur: string = r > 9 ? p.terre.sombre : r > 3 ? p.terre.fond : p.terre.claire;
      if (a < 0.1) couleur = p.terre.sombre;
      else if (a > 0.93) couleur = p.terre.claire;
      if (r === 0) couleur = herbeDe(x) ? p.herbe.claire : p.terre.claire;
      if (r === 1 && herbeDe(x)) couleur = alea(x, 5) < 0.6 ? p.herbe.fond : p.herbe.sombre;
      if (r === 2 && herbeDe(x) && alea(x, 6) < 0.4) couleur = p.herbe.sombre;
      t.poser(x, j, couleur);
    }
  }
  // Des cailloux pris dans la terre.
  for (let k = 0; k < Math.floor(t.largeur / 14); k++) {
    const cx = Math.floor(alea(k, 71) * t.largeur);
    const cy = y + 5 + Math.floor(alea(k, 72) * Math.max(1, t.hauteur - y - 8));
    const rx = 2 + Math.floor(alea(k, 73) * 3);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -rx; dx <= rx; dx++) if (Math.abs(dx) < rx || dy === 0) t.poser(cx + dx, cy + dy, dy < 0 ? pierre.clair : dy > 0 ? pierre.sombre : pierre.fond);
  }
}

/** Le lointain : deux rangs de forêt, et quelques toits du village, posés sur la rangée `horizon`. */
function lointain(t: Toile, p: Palette, horizon: number, huttes: readonly (readonly [x: number, demi: number])[]): void {
  for (let x = 0; x < t.largeur; x++) {
    const loin = horizon - 17 + Math.round(3 * Math.sin(x / 23) + 2 * Math.sin(x / 9 + 1) + alea(x >> 1, 4));
    for (let y = loin; y < horizon; y++) t.poser(x, y, p.foret.loin);
  }
  for (const [hx, demi] of huttes) {
    const haut = Math.round(demi * 1.25);
    for (let r = 0; r < haut; r++) {
      const d = Math.max(1, Math.round(((r + 1) * demi) / haut));
      for (let dx = -d; dx <= d; dx++) {
        let couleur: string = dx < -d / 3 ? p.chaume.clair : dx > d / 3 ? p.chaume.sombre : p.chaume.fond;
        if (r % 5 === 4) couleur = p.chaume.rang;
        if (Math.abs(dx) === d) couleur = p.chaume.bord;
        t.poser(hx + dx, horizon - 4 - haut + r, couleur);
      }
    }
    t.rect(hx - demi + 3, horizon - 4, demi * 2 - 5, 4, (i) => (i < hx ? p.mur.fond : p.mur.sombre));
  }
  for (let x = 0; x < t.largeur; x++) {
    const pres = horizon - 7 + Math.round(2.5 * Math.sin(x / 13 + 2) + 1.5 * Math.sin(x / 5) + alea(x, 8));
    for (let y = pres; y < horizon; y++) t.poser(x, y, alea(x, y) < 0.3 ? p.foret.presClaire : p.foret.pres);
  }
}

/** De l'herbe du dehors, de la rangée `y` au bas de la toile. */
function herbeDehors(t: Toile, p: Palette, y: number): void {
  for (let j = y; j < t.hauteur; j++) {
    for (let x = 0; x < t.largeur; x++) {
      const a = alea(x, j + 40);
      t.poser(x, j, a < 0.1 ? p.herbe.claire : a > 0.88 ? p.herbe.sombre : (j - y) % 9 === 0 && a < 0.6 ? p.herbe.bord : p.herbe.fond);
    }
  }
}

const tour3 = (image: number, images: number): number => ((Math.floor(image) % images) + images) % images;

/* ---------- Le four à pain : dans le fournil ---------- */

const FOUR_L = 400;
const FOUR_H = 236;
const FOUR_IMAGES = 3;

function four(l: Lumiere, image: number): Decor {
  const t = new Toile(FOUR_L, FOUR_H);
  const p = paletteDuDehors(l);
  const pierre = pierreDehors(PIERRE_BLEUE, l);
  const eclat = eclatDe(l);
  const n = tour3(image, FOUR_IMAGES);
  const SABLIERE = 70;
  const MUR = 104;
  const FOND = 184;
  const DEVANT = 220;
  /** Le dessus du chaume : il bombe au milieu et retombe aux deux bouts. */
  const toit = (x: number): number => 33 - Math.round(7 * Math.sin(Math.PI * borner((x - 3) / 393))) + (x < 12 ? Math.round((12 - x) * 0.7) : x > 387 ? Math.round((x - 387) * 0.7) : 0);
  const EPAIS = 15;

  // Le dehors : le ciel de l'heure, la forêt et deux toits du village derrière le fournil, l'herbe.
  t.tel(() => {
    peindreCiel(t, l, MUR);
    lointain(t, p, MUR, [
      [66, 15],
      [146, 11],
      [246, 13],
    ]);
    herbeDehors(t, p, MUR);
  });

  // Le dessous du toit : la paille dans l'ombre, ses lattes, et les perches qui filent vers le fond.
  for (let x = 6; x <= 393; x++) {
    for (let y = toit(x) + EPAIS; y < SABLIERE; y++) {
      const prof = (y - 46) / (SABLIERE - 46);
      if (x < 8 + prof * 14 || x > 391 - prof * 14) continue;
      const a = alea(x, y + 300);
      const couleur = (y + (x >> 5)) % 5 === 0 ? DESSOUS.latte : a < 0.14 ? DESSOUS.clair : a > 0.84 ? DESSOUS.sombre : DESSOUS.fond;
      t.poser(x, y, melanger(couleur, NOIR, 0.1 + 0.3 * borner(prof)));
    }
  }
  for (let k = 0; k <= 10; k++) {
    const devant = 20 + k * 36;
    for (let y = toit(devant) + EPAIS; y < SABLIERE; y++) {
      const prof = borner((y - 46) / (SABLIERE - 46));
      const x = Math.round(200 + (devant - 200) * (1 - 0.07 * prof));
      t.poser(x, y, B.clair);
      t.poser(x + 1, y, B.fond);
      t.poser(x + 2, y, B.sombre);
      t.poser(x + 3, y, B.creux);
    }
  }

  // Le conduit de pierres : il monte du dôme, traverse le chaume et dépasse le toit.
  pierres(t, PIERRE_BLEUE, 318, 44, 17, 60, {
    lit: 5,
    moellon: 7,
    graine: 3,
    ombre: (i) => (i > 329 ? 1 : 0),
  });

  // Le mur du fond : des poteaux, une sablière, un clayonnage enduit de torchis ; au-dessus, le jour entre.
  torchis(t, 24, MUR + 12, 353, FOND - MUR - 12);
  t.rect(24, MUR, 353, 12, (i, j) => clayon(i, j));
  for (let x = 27; x < 376; x += 12) t.rect(x, MUR - 2 - Math.floor(alea(x, 2) * 3), 2, 5, "#6f5129");
  // Là où l'enduit est tombé, on revoit l'osier.
  for (const [cx, cy, rx, ry] of [
    [72, 150, 15, 11],
    [352, 128, 12, 9],
  ] as const) {
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const d = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) + (alea(x >> 1, y >> 1) - 0.5) * 0.5;
        if (d < 0.8) t.poser(x, y, clayon(x, y));
        else if (d < 1.05) t.poser(x, y, J.mur.ombre);
      }
    }
  }
  // Le bas du mur, sali par la terre ; deux fissures.
  for (let y = FOND - 8; y < FOND; y++) for (let x = 24; x <= 376; x++) t.voiler(x, y, J.terre.sombre, 0.12 + 0.05 * (y - FOND + 8));
  t.trait(238, MUR + 14, 232, MUR + 30, J.mur.ombre);
  t.trait(232, MUR + 30, 236, MUR + 44, J.mur.ombre);
  t.trait(154, FOND - 30, 149, FOND - 12, J.mur.trame);
  for (const x of [24, 118, 212, 373]) poteau(t, x, SABLIERE + 3, 4, FOND - SABLIERE - 3);
  poutre(t, 22, SABLIERE, 357, 5);
  for (const x of [24, 118, 212, 373]) ligature(t, x - 1, SABLIERE + 1, 6, 3);

  // Le sol de terre battue, qui vient vers nous ; des dalles devant le four.
  t.auSol(() => {
    for (let y = FOND; y <= DEVANT; y++) {
      const part = (y - FOND) / (DEVANT - FOND);
      const retrait = Math.round(10 * (1 - part));
      for (let x = 14 + retrait; x <= 386 - retrait; x++) {
        const a = alea(x, y + 600);
        let couleur: string = a < 0.07 ? J.terre.claire : a > 0.93 ? J.terre.sombre : y % 7 === 3 && alea(x >> 3, y) < 0.5 ? J.terre.sombre : J.terre.fond;
        if (part > 0.55 && a > 0.4 && a < 0.5) couleur = J.terre.claire;
        const dalle = Math.floor((y - FOND - 6) / 10);
        if (x > 204 + dalle * 3 && y >= FOND + 6) {
          const k = x + dalle * 15;
          const ton = alea(Math.floor(k / 30), dalle + 50);
          couleur = (y - FOND - 6) % 10 === 0 || k % 30 === 0 ? "#5d5a58" : melanger(ton < 0.4 ? PIERRE_BLEUE.clair : ton < 0.8 ? PIERRE_BLEUE.fond : PIERRE_BLEUE.sombre, J.terre.fond, 0.3);
        }
        if (y === FOND) couleur = melanger(couleur, NOIR, 0.45);
        t.poser(x, y, couleur);
      }
    }
  });
  // La farine tombée autour du pétrin et des sacs.
  for (let y = FOND + 4; y <= DEVANT; y++) for (let x = 30; x < 168; x++) if (alea(x, y + 77) < 0.1 + 0.12 * Math.sin((Math.PI * (x - 30)) / 138)) t.voiler(x, y, FARINE.fond, 0.5);

  /* --- À gauche : les sacs de farine, le tamis, le balai --- */
  // Des gerbes de blé pendues à la sablière.
  for (const gx of [40, 58, 96]) {
    t.rect(gx + 2, SABLIERE + 5, 1, 4, B.cordeSombre);
    for (let k = 0; k < 7; k++) {
      for (let y = SABLIERE + 9; y < SABLIERE + 26; y++) t.poser(gx + Math.round(2 + ((k - 3) * (y - SABLIERE - 9)) / 12), y, k % 2 === 0 ? J.chaume.clair : J.chaume.fond);
      t.rect(gx + k - 1 + Math.round((k - 3) * 0.4), SABLIERE + 24 + (k % 3), 2, 5, (i, j) => ((i + j) % 2 === 0 ? GRAIN.clair : GRAIN.sombre));
    }
    t.rect(gx, SABLIERE + 11, 6, 2, B.corde);
  }
  // Le tamis, pendu au mur.
  t.disque(48, 138, 10, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > 78) return dx + dy < 0 ? B.clair : B.sombre;
    if (d > 60) return B.fond;
    return (dx + dy) % 2 === 0 ? "#cdbb8e" : "#a8946a";
  });
  t.rect(48, 124, 1, 4, B.cordeSombre);
  // Le balai, appuyé au mur.
  biais(t, 99, 124, 104, 196, 2);
  for (let k = 0; k < 9; k++) t.trait(101 + Math.round(k / 2), 192, 97 + k, 204, k % 2 === 0 ? J.chaume.fond : J.chaume.brin);
  t.rect(101, 190, 6, 2, B.corde);
  // Les sacs : trois debout contre le mur, un couché, un ouvert où l'on puise.
  sac(t, 30, FOND + 4, 16, 22);
  sac(t, 45, FOND + 5, 15, 20);
  sac(t, 60, FOND + 4, 17, 23);
  sacCouche(t, 28, FOND + 20, 26, 12);
  sacCouche(t, 33, FOND + 9, 22, 10);
  // Le chat du fournil, qui dort sur le sac.
  t.lettres(36, FOND - 6, ["...........a..a.", "....aaaaaa.bbbb.", "..aabbcbbbabcbcb", ".abbcbbbcbbbbbb.", "abbbbbbbbbbbbb.."], { a: "#8a5424", b: "#d0914a", c: "#a86a2c" });
  // Le sac ouvert : la farine en dôme, la pelle à farine plantée dedans.
  for (let r = 0; r < 19; r++) {
    const y = FOND + 12 + r;
    const retrait = r < 2 ? 1 : r === 18 ? 1 : 0;
    for (let i = 58 + retrait; i < 76 - retrait; i++) {
      const u = (i - 58) / 17;
      t.poser(i, y, r === 0 ? TOILE.clair : r === 18 || i === 75 - retrait ? TOILE.sombre : u < 0.28 ? TOILE.clair : u > 0.7 ? TOILE.sombre : alea(i, y) < 0.08 ? TOILE.sombre : TOILE.fond);
    }
  }
  for (let dx = -7; dx <= 7; dx++) for (let dy = 0; dy <= Math.round(4 * Math.sqrt(1 - (dx * dx) / 56)); dy++) t.poser(67 + dx, FOND + 12 - dy, dy > 2 || dx < -3 ? FARINE.clair : dx > 3 ? FARINE.sombre : FARINE.fond);
  biais(t, 70, FOND + 9, 78, FOND - 2, 2);

  /* --- Le pétrin : son couvercle levé contre le mur, la pâte qui lève --- */
  const PX = 108;
  const PL = 58;
  const rive = FOND - 8;
  for (let y = rive - 30; y < rive; y++) {
    const penche = Math.round((rive - y) / 9);
    t.rect(PX + 3 + penche, y, PL - 6, 1, (i) => {
      const k = (i - PX - 3 - penche) % 13;
      if (y === rive - 30) return B.clair;
      if (k === 12) return B.creux;
      if ((y - rive + 30) % 14 === 6 || (y - rive + 30) % 14 === 7) return (y - rive + 30) % 14 === 6 ? B.clair : B.sombre;
      return alea(i, y >> 2) < 0.12 ? B.autre : k < 2 ? B.clair : B.fond;
    });
  }
  for (let dx = -23; dx <= 23; dx++) {
    const h = Math.round(8 * Math.sqrt(1 - (dx * dx) / 540)) + (Math.abs(dx + 6) < 7 ? 1 : 0);
    for (let dy = 0; dy <= h; dy++) t.poser(PX + PL / 2 + dx, rive - dy, dy >= h - 1 || dx < -12 ? "#f6ecd0" : dx > 12 || dy < 2 ? "#d4c08e" : alea(dx + 90, dy) < 0.06 ? "#f6ecd0" : "#ecdcb4");
  }
  for (let y = rive; y <= rive + 24; y++) {
    const retrait = Math.round(((y - rive) * 7) / 24);
    for (let i = PX + retrait; i < PX + PL - retrait; i++) {
      const u = (i - PX) / PL;
      let couleur: string = (y - rive) % 8 === 7 ? B.sombre : u < 0.08 ? B.clair : u > 0.88 ? B.sombre : alea(i >> 1, y) < 0.14 ? B.autre : B.fond;
      if (y === rive + 24 || i === PX + PL - retrait - 1) couleur = B.creux;
      if (i === PX + retrait) couleur = B.clair;
      t.poser(i, y, couleur);
    }
  }
  t.rect(PX - 2, rive - 1, PL + 4, 2, (i, j) => (j === rive - 1 ? B.clair : i > PX + PL - 6 ? B.sombre : B.autre));
  for (const fx of [PX + 4, PX + 20, PX + 43]) t.rect(fx, rive - 2, 5 + (fx % 3), 1, FARINE.clair);
  // Ses pieds écartés, sa traverse, et le coupe-pâte posé sur le bord.
  for (const [hx, bx, loin] of [
    [PX + 14, PX + 11, true],
    [PX + PL - 17, PX + PL - 14, true],
    [PX + 8, PX + 3, false],
    [PX + PL - 12, PX + PL - 7, false],
  ] as const) {
    const bas = loin ? rive + 30 : rive + 36;
    for (let y = rive + 25; y <= bas; y++) {
      const x = Math.round(hx + ((bx - hx) * (y - rive - 25)) / (bas - rive - 25));
      t.rect(x, y, 4, 1, (i) => (loin ? B.creux : i === x ? B.clair : i === x + 3 ? B.sombre : B.fond));
    }
  }
  t.rect(PX + 8, rive + 31, PL - 16, 2, (_i, j) => (j === rive + 31 ? B.autre : B.sombre));
  t.rect(PX + 30, rive - 5, 8, 4, (i, j) => (j === rive - 5 ? B.clair : i === PX + 37 ? B.sombre : "#c79a62"));
  // La cruche d'eau et le seau, au pied du pétrin.
  cruche(t, 84, DEVANT - 6);
  seau(t, 92, DEVANT - 1, "#6f9fbe");

  /* --- Au mur : les planches où les pains refroidissent --- */
  for (const [sy, de, a] of [
    [122, 126, 206],
    [146, 172, 208],
  ] as const) {
    t.rect(de, sy, a - de, 3, (i, j) => (j === sy ? B.clair : j === sy + 2 ? B.creux : (i - de) % 23 === 22 ? B.sombre : B.autre));
    for (const ex of [de + 5, a - 8]) for (let k = 0; k < 6; k++) t.rect(ex, sy + 3 + k, 6 - k, 1, k === 0 ? B.fond : B.sombre);
    t.rect(de, sy + 3, a - de, 2, (i, j) => (j === sy + 3 && (i + j) % 2 === 0 ? J.mur.ombre : null));
  }
  pain(t, 137, 121, 8, 7);
  pain(t, 155, 121, 7, 6);
  painLong(t, 165, 121, 22);
  pain(t, 196, 121, 6, 6);
  painLong(t, 166, 116, 20);
  pain(t, 182, 145, 7, 6);
  painLong(t, 190, 145, 16);
  // Un linge sur le bout de la planche du haut.
  t.rect(127, 121, 4, 12, (i, j) => (j === 132 ? "#b9ad8e" : i === 130 ? "#cfc5aa" : (j - 121) % 4 === 3 ? "#cfc5aa" : "#e9e2cf"));
  // La corbeille des pains sortis du four, et leur buée qui monte, lente.
  panier(t, 140, DEVANT - 3, 26, 13);
  pain(t, 147, DEVANT - 16, 6, 6);
  pain(t, 158, DEVANT - 16, 6, 5);
  pain(t, 152, DEVANT - 20, 6, 5);
  for (const [bx, by] of [
    [146, DEVANT - 27],
    [154, DEVANT - 29],
    [160, DEVANT - 25],
  ] as const) {
    for (let k = 0; k < 18; k++) {
      if ((k + 3 - n) % 3 === 0) continue;
      const wx = bx + Math.round(2 * Math.sin((k + bx) / 2.2));
      t.voiler(wx, by - k, "#ffffff", 0.72 * (1 - k / 19));
      t.voiler(wx + 1, by - k, "#ffffff", 0.4 * (1 - k / 19));
    }
  }

  /* --- Le four : son socle de pierres, sa réserve de bûches, son dôme de terre --- */
  const cx = 289;
  const base = 152;
  // Le socle, et sa niche où sèchent les bûches.
  pierres(t, PIERRE_BLEUE, 216, base + 4, 148, 44, {
    lit: 7,
    moellon: 13,
    graine: 2,
    ombre: (i, j) => (i > 344 ? 1 : i < 232 && j < base + 30 ? -1 : 0),
  });
  t.rect(214, base, 152, 2, (i) => (i < 300 ? PIERRE_BLEUE.clair : PIERRE_BLEUE.fond));
  t.rect(214, base + 2, 152, 2, (i, j) => (j === base + 3 || (i - 214) % 19 === 18 ? PIERRE_BLEUE.joint : i > 330 ? PIERRE_BLEUE.sombre : PIERRE_BLEUE.fond));
  t.rect(216, base + 48, 148, 1, PIERRE_BLEUE.trou);
  const nx = 322;
  for (let dx = -22; dx <= 22; dx++) {
    const arc = Math.round(Math.sqrt(Math.max(0, 22 * 22 - dx * dx)) * 0.62);
    for (let y = base + 30 - arc; y <= base + 47; y++) {
      const bord = y < base + 33 - arc || Math.abs(dx) > 19;
      t.poser(nx + dx, y, bord ? ((dx + 44) % 7 === 0 ? PIERRE_BLEUE.joint : dx < 0 ? PIERRE_BLEUE.clair : PIERRE_BLEUE.sombre) : "#2a1a12");
    }
  }
  for (let rang = 0; rang < 3; rang++) {
    for (let k = 0; k < 5 - rang; k++) {
      const bx = nx - 16 + k * 7 + rang * 3;
      const by = base + 44 - rang * 6;
      if (rang === 2 && (k === 0 || k === 2)) continue;
      t.disque(bx + 3, by, 3, (dx, dy) => {
        const d = dx * dx + dy * dy;
        return d > 8 ? B.sombre : d <= 1 ? B.fond : dx + dy < 0 ? "#d9b98a" : "#c79a62";
      });
    }
  }
  // Le dôme de terre : clair à gauche, sombre à droite, des cailloux pris dedans, une ceinture de pierres.
  const DEMI = 68;
  const HAUT = 78;
  for (let dy = 0; dy <= HAUT; dy++) {
    const demi = Math.round(DEMI * Math.sqrt(1 - (dy * dy) / ((HAUT + 0.5) * (HAUT + 0.5))));
    for (let dx = -demi; dx <= demi; dx++) {
      const x = cx + dx;
      const y = base - 1 - dy;
      const pente = dx / DEMI - dy / (HAUT * 2);
      const a = alea(x, y + 200);
      let couleur: string = pente < -0.5 ? J.mur.clair : pente > 0.36 ? J.mur.sombre : J.mur.fond;
      if (pente > 0.3 && pente <= 0.36 && (x + y) % 2 === 0) couleur = J.mur.sombre;
      if (pente < -0.44 && pente >= -0.5 && (x + y) % 2 === 0) couleur = J.mur.clair;
      if (pente > 0.72) couleur = J.mur.ombre;
      if (a < 0.05) couleur = J.mur.trame;
      else if (a > 0.992) couleur = PIERRE_BLEUE.fond;
      else if (alea(x >> 2, (y >> 1) + 9) < 0.05) couleur = melanger(couleur, J.mur.ombre, 0.4);
      if (Math.abs(dx) >= demi - 1 || dy >= HAUT - 1) couleur = J.mur.ombre;
      if (dy < 9) {
        const lit = Math.floor(dy / 5);
        couleur = (x + lit * 6) % 12 === 0 || dy % 5 === 4 ? PIERRE_BLEUE.joint : pente > 0.3 ? PIERRE_BLEUE.sombre : pente < -0.4 ? PIERRE_BLEUE.clair : PIERRE_BLEUE.fond;
      }
      t.poser(x, y, couleur);
    }
  }
  // Des fissures fines dans la terre cuite.
  t.trait(cx + 30, base - 72, cx + 37, base - 58, J.mur.ombre);
  t.trait(cx + 37, base - 58, cx + 35, base - 48, J.mur.ombre);
  t.trait(cx - 44, base - 54, cx - 50, base - 38, J.mur.trame);
  t.trait(cx + 52, base - 30, cx + 56, base - 14, J.mur.ombre);
  // La gueule : un arc de pierres. La suie a noirci la terre au-dessus.
  const gx = cx - 8;
  const gy = base - 2;
  for (let dy = 40; dy <= 62; dy++) {
    for (let dx = -20; dx <= 20; dx++) {
      const d = (dx * dx) / 400 + ((dy - 40) * (dy - 40)) / 484;
      if (d < 1 && alea(gx + dx, dy) < 1.1 - d) t.voiler(gx + dx, gy - dy, "#3a2a22", 0.5 * (1 - d));
    }
  }
  const braise = 0.5 + 0.5 * eclat;
  for (let dy = 0; dy <= 44; dy++) {
    for (let dx = -30; dx <= 30; dx++) {
      const haut = dy <= 14 ? 0 : dy - 14;
      const d = dx * dx + haut * haut;
      if (d > 30 * 30 + 6) continue;
      const x = gx + dx;
      const y = gy - dy;
      if (d > 22 * 22 + 4) {
        const angle = Math.atan2(haut, dx);
        const tranche = (angle / Math.PI) * 11;
        const joint = dy <= 14 ? dy % 7 === 6 : Math.floor(tranche + 0.1) !== Math.floor(tranche);
        const claveau = dy <= 14 ? Math.floor(dy / 7) : 2 + Math.floor(tranche);
        const bord = d > 29 * 29;
        t.poser(x, y, joint ? PIERRE_BLEUE.joint : bord && dx > 0 ? PIERRE_BLEUE.sombre : dx < -8 ? PIERRE_BLEUE.clair : (claveau + (dx > 0 ? 1 : 0)) % 2 === 0 ? PIERRE_BLEUE.fond : PIERRE_BLEUE.sombre);
        continue;
      }
      // Le dedans : la voûte noire, la braise au fond, deux pains qui cuisent sur la sole.
      const loin = Math.sqrt(dx * dx * 0.8 + (dy - 3) * (dy - 3) * 2.4) / 22;
      const feu = loin < 0.3 ? "#ffd75a" : loin < 0.55 ? "#f5a83a" : loin < 0.85 ? "#c9722a" : loin < 1.2 ? "#8a3a1c" : "#4a2416";
      const part = loin < 0.55 ? braise : loin < 0.85 ? braise * 0.9 : loin < 1.2 ? braise * 0.7 : braise * 0.45;
      const grain = alea(x, y + 31) < 0.18 ? 0.82 : 1;
      t.tel(() => t.poser(x, y, melanger("#2a1a12", feu, dy < 2 ? part * 0.55 : part * grain)));
    }
  }
  t.tel(() => {
    for (const [bx, demi] of [
      [gx - 11, 6],
      [gx + 10, 5],
    ] as const) {
      for (let dy = 0; dy < 5; dy++) {
        const d = Math.round(demi * Math.sqrt(1 - (dy * dy) / 25));
        for (let dx = -d; dx <= d; dx++) t.poser(bx + dx, gy - 1 - dy, melanger(dy >= 3 ? "#7a4a1c" : "#4a2a14", "#c9722a", 0.3 * braise));
      }
    }
  });
  // La sole, qui avance devant la gueule ; le bouchoir de bois posé contre le socle.
  t.rect(gx - 32, gy + 1, 65, 3, (i, j) => (j === gy + 1 ? PIERRE_BLEUE.clair : j === gy + 3 ? PIERRE_BLEUE.joint : (i - gx) % 16 === 0 ? PIERRE_BLEUE.joint : PIERRE_BLEUE.fond));
  for (let dx = -13; dx <= 13; dx++) {
    const arc = Math.round(Math.sqrt(Math.max(0, 13 * 13 - dx * dx)) * 0.9);
    for (let y = base + 30 - arc; y <= base + 49; y++) {
      const x = 240 + dx + Math.round((base + 49 - y) / 9);
      t.poser(x, y, Math.abs(dx) === 13 || y === base + 30 - arc ? B.clair : (dx + 13) % 7 === 6 ? B.creux : y === base + 49 ? B.creux : alea(x, y >> 2) < 0.14 ? B.autre : B.fond);
    }
  }
  t.rect(241, base + 30, 6, 2, FER.fond);
  t.rect(240, base + 50, 30, 1, NOIR);

  // La pelle à enfourner et le fourgon de fer, contre le poteau de droite.
  biais(t, 352, 98, 362, DEVANT - 3, 2);
  for (let r = 0; r < 22; r++) {
    const retrait = r < 3 ? 3 - r : 0;
    const px = 344 - Math.round(r / 7);
    t.rect(px + retrait, 78 + r, 14 - retrait * 2, 1, (i) => (i === px + retrait || r === 0 ? "#e3c69a" : i === px + 13 - retrait || r === 21 ? B.fond : (i + r) % 9 === 0 ? "#b88a54" : "#c79a62"));
  }
  t.trait(371, 108, 369, DEVANT - 5, FER.sombre);
  t.rect(367, 106, 6, 2, FER.fond);

  // La lanterne du fournil, pendue à la sablière.
  lanterne(t, 150, SABLIERE + 5, 5, eclat);

  // Le chaume du toit, vu par sa tranche, à la lumière du dehors ; le conduit qui le traverse ; la fumée, lente.
  t.tel(() => {
    chaumeEnCoupe(t, p, 3, 396, toit, EPAIS);
    for (let x = 8; x <= 391; x++) if (x < 316 || x > 336) t.poser(x, toit(x) - 1, p.bois.sombre);
    const c = (deJour: string): string => couleurDuDehors(deJour, melanger(deJour, "#101a3a", 0.52), l);
    for (let y = 14; y < 46; y++) {
      for (let x = 318; x < 335; x++) {
        const lit = Math.floor((y - 14) / 5);
        const joint = (y - 14) % 5 === 4 || (x - 318 + (lit % 2) * 3) % 7 === 0;
        t.poser(x, y, joint ? pierre.joint : x < 322 ? pierre.clair : x > 329 ? pierre.sombre : alea(x >> 2, lit) < 0.3 ? pierre.sombre : pierre.fond);
      }
    }
    t.rect(316, 11, 21, 2, (i) => (i < 324 ? pierre.clair : pierre.fond));
    t.rect(316, 13, 21, 1, pierre.joint);
    t.rect(320, 11, 13, 1, c("#3d2616"));
    t.rect(315, toit(326) - 2, 23, 3, (i, j) => (j === toit(326) - 2 ? p.mur.fond : i > 330 ? p.mur.ombre : p.mur.sombre));
    const fumee = c("#dcdcd6");
    const fumeeOmbre = c("#b4b6b8");
    for (let k = -1; k < 5; k++) {
      const monte = 6 * k + 2 * n;
      const y = 8 - Math.round(monte * 0.3);
      if (monte < 0) continue;
      const r = 2 + Math.floor(monte / 7);
      const fx = 327 + Math.round(monte * 1.5);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r - 2; dx <= r + 2; dx++) {
          const d = (dx * dx) / ((r + 2) * (r + 2)) + (dy * dy) / (r * r + 0.5);
          if (d > 1) continue;
          if (monte > 12 && d > 0.55 && (fx + dx + y + dy) % 2 === 0) continue;
          if (monte > 22 && (d > 0.6 || (fx + dx + y + dy) % 2 === 0)) continue;
          t.poser(fx + dx, y + dy, dy > 0 || dx > r ? fumeeOmbre : fumee);
        }
      }
    }
  });

  // Les deux poteaux de l'auvent, devant, sur leur dé de pierre ; leurs jambes de force.
  for (const x of [11, 381]) {
    poteau(t, x, toit(x + 4) + EPAIS, 8, DEVANT - toit(x + 4) - EPAIS - 2);
    ligature(t, x - 1, toit(x + 4) + EPAIS + 3, 10, 4);
    ligature(t, x - 1, SABLIERE + 12, 10, 3);
    pierres(t, PIERRE_BLEUE, x - 3, DEVANT - 4, 14, 7, {
      lit: 4,
      moellon: 8,
      graine: x,
    });
    t.rect(x - 3, DEVANT - 4, 14, 1, PIERRE_BLEUE.clair);
  }
  biais(t, 19, SABLIERE + 10, 34, toit(34) + EPAIS, 3);
  biais(t, 380, SABLIERE + 10, 365, toit(365) + EPAIS, 3);

  // La terre tranchée, et les fondations du four.
  t.tel(() => {
    terreEnCoupe(t, p, pierre, DEVANT + 3, (x) => x < 8 || x > 392);
    for (let y = DEVANT + 3; y < FOUR_H; y++) {
      for (let x = 222; x < 360; x++) {
        const lit = Math.floor((y - DEVANT - 3) / 6);
        const k = x + (lit % 2) * 7;
        if (alea(x >> 2, lit + 80) < 0.12 && y > DEVANT + 8) continue;
        t.poser(x, y, (y - DEVANT - 3) % 6 === 5 || k % 14 === 0 ? pierre.joint : alea(Math.floor(k / 14), lit) < 0.4 ? pierre.sombre : pierre.fond);
      }
    }
    t.rect(8, DEVANT + 1, 385, 2, (_i, j) => (j === DEVANT + 1 ? p.terre.claire : p.terre.sombre));
  });

  return finir(t, l, {
    foyers: [
      { x: 150, y: SABLIERE + 18, rayon: 120, force: 0.85 },
      { x: gx, y: gy - 8, rayon: 125, force: 1 },
    ],
    penombre: 0.5,
    // Le jour passe au-dessus du clayonnage et tombe en larges pans sur le sol, entre les ombres des poteaux.
    rayons: (x, y, sol) => {
      if (!sol || y < FOND + 2) return 0;
      const u = (((x - (y - FOND) * 1.3 - 34) % 94) + 94) % 94;
      return u > 10 && u < 78 ? 0.16 * Math.min(1, (u - 10) / 6, (78 - u) / 6) : 0;
    },
    ombre: (x, y) => (y >= FOND && y <= FOND + 5 && x > 24 && x < 376 ? 0.12 * (1 - (y - FOND) / 6) : 0),
  });
}

/* ---------- La tour de guet : en haut, sur la plateforme ---------- */

const TOUR_L = 360;
const TOUR_H = 264;
const TOUR_IMAGES = 4;

/** Le soleil ou la lune, dans le ciel vu de la tour : bas sur l'horizon au lever et au coucher, caché par le toit à midi. */
function poserAstre(t: Toile, l: Lumiere, horizon: number): void {
  if (!l.astre) return;
  const ax = Math.round(22 + l.astre.course * (t.largeur - 44));
  const ay = Math.round(horizon - 8 - l.astre.hauteur * 120);
  const soleil = l.astre.sorte === "soleil";
  const r = soleil ? 8 : 7;
  t.disque(ax, ay, r + 3, (dx, dy) => {
    const d = dx * dx + dy * dy;
    const fond = t.lire(ax + dx, ay + dy) ?? "#000000";
    if (d > r * r + 2) return (dx + dy) % 2 === 0 ? melanger(fond, soleil ? "#ffe9a0" : "#c0c9e2", 0.3) : null;
    if (soleil) return d < r * r * 0.45 ? "#fff6d0" : "#ffe27a";
    // La lune : un croissant, sa part d'ombre du côté droit.
    return (dx - 4) * (dx - 4) + (dy + 1) * (dy + 1) < r * r * 0.8 ? melanger(fond, "#c0c9e2", 0.22) : dx + dy < -2 ? "#f4f6fc" : "#d6dcec";
  });
}

/** Le pays vu de là-haut : des collines, la forêt, les champs, la rivière, le chemin, et les toits du village tout en bas. */
function paysVuDeHaut(t: Toile, p: Palette, l: Lumiere, ciel: readonly string[], horizon: number): void {
  /** La rangée où commence la terre, colonne par colonne : au-dessus, c'est le ciel. */
  const cretes: number[] = [];
  const c = (deJour: string, deNuit: string): string => couleurDuDehors(deJour, deNuit, l);
  const eclat = eclatDe(l);
  const eau = { fond: c("#4f8fb5", "#1e3d63"), clair: c("#86bcd6", "#335f88") };
  const nuage = c("#f4f6fa", "#39446a");
  const nuageOmbre = c("#cfd8e6", "#2c3558");
  // Des nuages plats, immobiles.
  for (const [nx, ny, nl] of [
    [58, horizon - 34, 34],
    [218, horizon - 27, 46],
    [306, horizon - 40, 26],
    [128, horizon - 44, 22],
  ] as const) {
    for (let r = 0; r < 5; r++) {
      const retrait = [7, 3, 0, 2, 6][r]!;
      for (let x = nx + retrait + Math.round(3 * Math.sin(r + nx)); x < nx + nl - retrait; x++) t.poser(x, ny + r, r >= 3 ? nuageOmbre : nuage);
    }
    t.rect(nx + 8, ny - 1, Math.floor(nl / 3), 1, nuage);
  }
  // Trois rangs de collines, du plus pâle au plus net.
  const loin1 = melanger(p.foret.loin, ciel[4]!, 0.55);
  const loin2 = melanger(p.foret.loin, ciel[4]!, 0.25);
  for (let x = 0; x < t.largeur; x++) {
    const a = horizon - 20 - Math.round(7 * Math.sin(x / 47 + 1) + 4 * Math.sin(x / 19));
    cretes[x] = a;
    const b = horizon - 11 - Math.round(5 * Math.sin(x / 31 + 3) + 2 * Math.sin(x / 11 + 2));
    const d = horizon - 5 - Math.round(3 * Math.sin(x / 17 + 5) + 1.5 * Math.sin(x / 6) + alea(x, 2));
    for (let y = a; y < horizon; y++) t.poser(x, y, y >= d ? (alea(x, y) < 0.3 ? p.foret.presClaire : p.foret.pres) : y >= b ? loin2 : loin1);
  }
  // La plaine : des parcelles de blé, de labour et de pré, bordées de haies ; elles grandissent en venant vers nous.
  for (let y = horizon; y < t.hauteur; y++) {
    const k = y - horizon;
    // Les rangs de parcelles : de plus en plus hauts vers le bas.
    const rang = Math.floor(Math.sqrt(k * 2.2));
    const debut = Math.ceil((rang * rang) / 2.2);
    const prof = k / (t.hauteur - horizon);
    const large = 30 + rang * 9;
    for (let x = 0; x < t.largeur; x++) {
      const u = x + k * 0.8 + rang * 53 + 2000;
      const col = Math.floor(u / large);
      const dansX = u % large;
      const sorte = alea(col + 40, rang + 7);
      const a = alea(x, y + 50);
      let couleur: string;
      if (sorte < 0.22) couleur = a < 0.2 ? melanger(p.chaume.clair, p.herbe.claire, 0.25) : melanger(p.chaume.fond, p.herbe.fond, 0.25);
      else if (sorte < 0.36) couleur = (Math.floor(dansX) + k) % 4 === 0 ? p.terre.sombre : a < 0.1 ? p.terre.claire : p.terre.fond;
      else if (sorte < 0.7) couleur = a < 0.1 ? p.herbe.claire : a > 0.94 ? p.herbe.sombre : p.herbe.fond;
      else couleur = a < 0.12 ? p.herbe.bord : a > 0.95 ? p.herbe.fond : p.herbe.claire;
      if (dansX < 1 + prof || (k === debut && alea(x >> 1, rang) < 0.8)) couleur = a < 0.5 ? p.feuilles.sombre : p.feuilles.fond;
      t.poser(x, y, prof < 0.1 ? melanger(couleur, p.foret.pres, 0.5 - prof * 5) : couleur);
    }
  }
  // La rivière et le chemin, qui serpentent jusqu'à l'horizon.
  for (let y = horizon - 1; y < t.hauteur; y++) {
    const k = y - horizon;
    const prof = Math.max(0, k) / (t.hauteur - horizon);
    const rx = Math.round(246 - k * 1.9 + 16 * Math.sin(k / 11));
    const demi = Math.round(1 + prof * 16);
    for (let x = rx - demi; x <= rx + demi; x++) t.poser(x, y, x === rx - demi || alea(x >> 2, y) < 0.12 ? eau.clair : eau.fond);
    if (prof > 0.1) {
      t.poser(rx - demi - 1, y, p.herbe.sombre);
      t.poser(rx + demi + 1, y, p.herbe.sombre);
    }
    const cx = Math.round(118 - k * 1.1 + 9 * Math.sin(k / 8 + 2));
    const cd = Math.round(prof * 5);
    for (let x = cx - cd; x <= cx + cd; x++) t.poser(x, y, alea(x, y) < 0.2 ? p.terre.fond : p.terre.claire);
  }
  // Des bosquets : de petites boules de feuillage, plus grosses en bas.
  for (let k = 0; k < 70; k++) {
    const by = horizon + 3 + Math.floor(alea(k, 31) * alea(k, 35) * (t.hauteur - horizon));
    const prof = (by - horizon) / (t.hauteur - horizon);
    const bx = Math.floor(alea(k, 32) * t.largeur);
    const r = Math.round(1 + prof * 9 + alea(k, 33) * 2);
    t.disque(bx, by, r, (dx, dy) => {
      const clair = (dx + r * 0.35) * (dx + r * 0.35) + (dy + r * 0.4) * (dy + r * 0.4) < r * r * 0.3;
      if (clair) return alea(bx + dx, by + dy) < 0.25 ? p.feuilles.fond : p.feuilles.claire;
      return dy > r * 0.45 || dx > r * 0.7 || alea(bx + dx, by + dy) < 0.18 ? p.feuilles.sombre : p.feuilles.fond;
    });
    if (r > 3) t.rect(bx - r + 1, by + r, r * 2 - 1, 1, melanger(p.herbe.sombre, "#0a1230", 0.2));
  }
  // Le village, au loin : des toits de chaume derrière leur palissade ; à la nuit, une porte éclairée.
  const vx = 150;
  const vy = horizon + 16;
  for (let x = vx - 30; x <= vx + 30; x++) {
    const bas = vy + 5 - Math.round(4 * Math.sqrt(Math.max(0, 1 - ((x - vx) * (x - vx)) / 900)));
    t.rect(x, bas - 2, 1, 3, x % 3 === 0 ? p.bois.sombre : p.bois.fond);
  }
  const PORTES = [
    [vx - 18, vy - 2, 5],
    [vx - 6, vy - 5, 6],
    [vx + 8, vy - 3, 5],
    [vx + 19, vy - 1, 4],
    [vx + 1, vy + 3, 5],
  ] as const;
  for (const [hx, hy, demi] of PORTES) {
    for (let r = 0; r <= demi; r++) for (let dx = -r; dx <= r; dx++) t.poser(hx + dx, hy - demi + r, Math.abs(dx) === r ? p.chaume.bord : dx < 0 ? p.chaume.clair : p.chaume.sombre);
    t.rect(hx - demi + 2, hy + 1, demi * 2 - 3, 2, (i) => (i === hx ? p.bois.creux : i < hx ? p.mur.fond : p.mur.sombre));
  }
  // Tout le pays suit l'heure, comme les lointains du monde : sombre et bleuté la nuit, rougi au lever et au coucher.
  const nuit = 1 - l.jour;
  if (nuit > 0 || l.rougeur > 0) {
    for (let x = 0; x < t.largeur; x++) {
      for (let y = cretes[x] ?? horizon; y < t.hauteur; y++) {
        const loin = 1 - Math.min(1, Math.max(0, y - horizon) / 60);
        if (nuit > 0) t.voiler(x, y, "#0a1230", (0.5 + 0.14 * loin) * nuit);
        if (l.rougeur > 0) t.voiler(x, y, ciel[4]!, (0.14 + 0.2 * loin) * l.rougeur);
      }
    }
  }
  // Les portes du village, elles, éclairent : elles gardent leur couleur.
  if (eclat > 0) for (const [hx, hy] of PORTES) t.rect(hx, hy + 1, 1, 2, melanger(t.lire(hx, hy + 1) ?? "#000000", "#ffd75a", eclat));
}

function tour(l: Lumiere, image: number): Decor {
  const t = new Toile(TOUR_L, TOUR_H);
  const p = paletteDuDehors(l);
  const eclat = eclatDe(l);
  const n = tour3(image, TOUR_IMAGES);
  const cx = 180;
  const POINTE = 18;
  const EGOUT = 108;
  const DEMI = 166;
  const EPAIS = 14;
  const SABLIERE = 112;
  const HORIZON = 152;
  const RAMBARDE = 184;
  const FOND = 216;
  const DEVANT = 238;
  /** Le dessus du toit : deux pentes depuis la pointe, un peu creusées. */
  const toit = (x: number): number => {
    const u = Math.min(1, Math.abs(x - cx) / DEMI);
    return POINTE + Math.round(u * (EGOUT - POINTE) + 5 * Math.sin(Math.PI * u));
  };

  // Le dehors : le ciel, l'astre, le pays vu de là-haut.
  t.tel(() => {
    const ciel = peindreCiel(t, l, HORIZON);
    poserAstre(t, l, HORIZON);
    paysVuDeHaut(t, p, l, ciel, HORIZON);
  });

  // Le dessous du toit pointu : la paille dans l'ombre, ses lattes en rond, les perches qui montent à la pointe.
  for (let x = cx - DEMI + 6; x <= cx + DEMI - 6; x++) {
    for (let y = toit(x) + EPAIS; y < SABLIERE; y++) {
      const a = alea(x, y + 300);
      const creux = 1 - (y - POINTE) / (SABLIERE - POINTE);
      const arc = y + Math.round(((x - cx) * (x - cx)) / 2600);
      const couleur = arc % 7 === 0 ? DESSOUS.latte : a < 0.14 ? DESSOUS.clair : a > 0.84 ? DESSOUS.sombre : DESSOUS.fond;
      t.poser(x, y, melanger(couleur, NOIR, 0.12 + 0.38 * creux + (x > cx ? 0.06 : 0)));
    }
  }
  for (let k = -5; k <= 5; k++) {
    const bx = cx + k * 31;
    for (let y = POINTE + EPAIS + 4; y < SABLIERE; y++) {
      const x = Math.round(cx + ((bx - cx) * (y - POINTE - EPAIS - 2)) / (SABLIERE - POINTE - EPAIS - 2));
      if (y < toit(x) + EPAIS) continue;
      t.poser(x - 1, y, B.clair);
      t.poser(x, y, B.fond);
      t.poser(x + 1, y, B.sombre);
    }
  }
  // Le poinçon et son moyeu, là où les perches se rejoignent.
  poteau(t, cx - 2, POINTE + EPAIS, 5, 20);
  t.rect(cx - 5, POINTE + EPAIS + 18, 11, 4, (i, j) => (j === POINTE + EPAIS + 18 ? B.clair : i > cx + 2 ? B.creux : B.sombre));

  // La sablière du fond et les deux poteaux du fond, plus minces.
  poutre(t, 60, SABLIERE, 241, 5);
  for (const x of [64, 292]) {
    poteau(t, x, SABLIERE + 5, 5, FOND - SABLIERE - 5, TRONC);
    ligature(t, x - 1, SABLIERE + 1, 7, 3);
  }
  for (const [x0, x1] of [
    [69, 86],
    [291, 274],
  ] as const)
    biais(t, x0, SABLIERE + 22, x1, SABLIERE + 5, 2);

  // Le plancher de la plateforme : des planches qui viennent vers nous.
  t.auSol(() => {
    for (let y = FOND; y <= DEVANT; y++) {
      const part = (y - FOND) / (DEVANT - FOND);
      const de = Math.round(66 - 38 * part);
      const a = Math.round(294 + 38 * part);
      for (let x = de; x <= a; x++) {
        const u = (x - de) / (a - de);
        const lame = Math.floor(u * 15);
        const dans = u * 15 - lame;
        let couleur: string = lame % 2 === 0 ? B.autre : B.fond;
        if (dans < 0.07) couleur = B.creux;
        else if (alea(lame * 7 + (x >> 2), y) < 0.1) couleur = B.sombre;
        else if (part > 0.5 && alea(x, y) < 0.12) couleur = B.clair;
        if ((y - FOND + lame * 9) % 31 === 0) couleur = B.sombre;
        if (y === FOND) couleur = B.creux;
        t.poser(x, y, couleur);
      }
    }
  });

  // Le garde-corps : celui du fond en planches debout sous sa lisse, ceux des côtés qui viennent vers nous.
  const lames = (i: number, j: number, x0: number, bas: number, ombre: number): string => {
    const k = (((i - x0) % 7) + 7) % 7;
    let couleur: string = k === 6 ? B.creux : k === 0 ? B.clair : alea(i, j >> 2) < 0.14 ? B.fond : B.autre;
    if (j === bas) couleur = B.sombre;
    return ombre > 0 ? melanger(couleur, NOIR, ombre) : couleur;
  };
  t.rect(69, RAMBARDE + 3, 223, FOND - RAMBARDE - 3, (i, j) => lames(i, j, 69, FOND - 1, 0.08));
  t.rect(69, RAMBARDE + 12, 223, 2, (_i, j) => (j === RAMBARDE + 12 ? B.sombre : B.creux));
  poutre(t, 62, RAMBARDE, 237, 4);
  for (const sens of [-1, 1] as const) {
    for (let k = 0; k <= 38; k++) {
      const x = sens === -1 ? 66 - k : 294 + k;
      const haut = RAMBARDE + Math.round((k * 22) / 38);
      const bas = FOND + Math.round((k * 22) / 38);
      for (let y = haut + 3; y < bas; y++) t.poser(x, y, lames(x, y, 0, bas - 1, sens === -1 ? 0.3 : 0.02));
      t.poser(x, haut, B.clair);
      t.poser(x, haut + 1, sens === -1 ? B.sombre : B.fond);
      t.poser(x, haut + 2, B.sombre);
    }
  }

  /* --- Le coin du guetteur, à gauche : son banc, sa couverture, son repas, sa corne --- */
  const banc = FOND - 14;
  t.rect(82, banc + 3, 64, 12, (i, j) => ((i + j) % 2 === 0 ? melanger(B.creux, NOIR, 0.3) : null));
  for (const bx of [86, 138]) {
    t.rect(bx, banc + 3, 4, 13, (i) => (i === bx ? B.clair : i === bx + 3 ? B.creux : B.sombre));
    biais(t, bx + (bx < 100 ? 4 : -1), banc + 10, bx + (bx < 100 ? 10 : -7), banc + 4, 2);
  }
  t.rect(80, banc, 68, 4, (i, j) => (j === banc ? "#d0a468" : j === banc + 3 ? B.creux : (i - 80) % 17 === 16 ? B.sombre : "#b98a52"));
  // La couverture de laine pliée, et l'écuelle avec son pain.
  for (let r = 0; r < 9; r++) {
    t.rect(84 + (r === 0 ? 1 : 0), banc - 9 + r, 26 - (r === 0 ? 2 : 0), 1, (i) => {
      const raie = (i - 84) % 8;
      const laine = raie < 2 ? "#e6dcc0" : raie === 4 ? "#3f5f9a" : "#a8483a";
      return r === 4 || r === 8 ? melanger(laine, NOIR, 0.35) : i > 106 ? melanger(laine, NOIR, 0.2) : r === 0 || r === 5 ? melanger(laine, "#ffffff", 0.14) : laine;
    });
  }
  t.lettres(116, banc - 4, ["a.........a", "abbbbbbbbba", ".abbbbbbba.", "..aaaaaaa.."], { a: "#5a2f18", b: "#b0683c" });
  pain(t, 121, banc - 4, 4, 4);
  cruche(t, 132, banc - 1);
  // Le panier de pommes, sous le banc.
  panier(t, 96, FOND + 6, 20, 10);
  for (const [ax, ay, rouge] of [
    [99, FOND - 5, true],
    [104, FOND - 6, false],
    [109, FOND - 5, true],
    [102, FOND - 8, true],
    [107, FOND - 9, false],
  ] as const)
    t.disque(ax, ay, 2, (dx, dy) => (dx + dy < -1 ? (rouge ? "#e8705a" : "#c9d46a") : rouge ? "#c8283a" : "#9aae3a"));
  // La corne d'appel, pendue à la sablière par sa courroie.
  t.trait(104, SABLIERE + 5, 98, SABLIERE + 16, "#6a4424");
  t.trait(104, SABLIERE + 5, 122, SABLIERE + 22, "#6a4424");
  for (let k = 0; k <= 30; k++) {
    const u = k / 30;
    const hx = 96 + k;
    const hy = SABLIERE + 17 + Math.round(12 * Math.sin(Math.PI * u * 0.62));
    const ep = 2 + Math.round(u * u * 7);
    for (let e = 0; e < ep; e++) {
      let couleur: string = e === 0 ? "#f4eedc" : e >= ep - 1 ? "#b9ad8e" : "#e0d6ba";
      if (k === 6 || k === 7 || k === 24 || k === 25) couleur = e === 0 ? "#e8c46a" : "#b98a3a";
      if (k < 3) couleur = "#8a6238";
      if (k === 30) couleur = "#7a6a52";
      t.poser(hx, hy - e + Math.round(ep / 3), couleur);
    }
  }
  // Le bouclier du clan, accroché au garde-corps.
  t.disque(154, FOND - 15, 9, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > 74) return B.creux;
    if (d <= 4) return dx + dy < 0 ? FER.clair : FER.fond;
    if (d > 52) return TRICOLORE[1];
    return dx * dy >= 0 ? BLEU_NUIT : "#2c3f80";
  });

  /* --- Au milieu et à droite : la trappe et l'échelle, la cloche, le tonneau, la corde --- */
  // La trappe ouverte : son battant relevé contre le garde-corps, le trou, les montants de l'échelle qui dépassent.
  const tx = 222;
  t.rect(tx - 2, RAMBARDE + 6, 46, FOND - RAMBARDE - 2, (i, j) => {
    const k = (i - tx + 2) % 9;
    if (i === tx - 2 || j === RAMBARDE + 6) return B.clair;
    if (i === tx + 43) return B.creux;
    if (j === RAMBARDE + 11 || j === RAMBARDE + 12 || j === FOND - 5 || j === FOND - 4) return j === RAMBARDE + 11 || j === FOND - 5 ? "#b98a52" : B.sombre;
    return k === 8 ? B.sombre : alea(i, j >> 2) < 0.12 ? B.fond : "#a8743e";
  });
  t.disque(tx + 21, RAMBARDE + 19, 3, (dx, dy) => (dx * dx + dy * dy > 4 ? FER.fond : null));
  for (let y = FOND + 4; y <= FOND + 17; y++) {
    const part = (y - FOND - 4) / 13;
    const de = Math.round(tx - 4 - 4 * part);
    const a = Math.round(tx + 46 + 4 * part);
    t.rect(de, y, a - de + 1, 1, (i) => (y === FOND + 4 || i === de ? B.creux : i === a || y === FOND + 17 ? B.clair : melanger("#2a1a10", p.feuilles.sombre, 0.25 + 0.2 * part)));
  }
  for (const ex of [tx + 6, tx + 32]) {
    t.rect(ex, FOND - 30, 3, 44, (i) => (i === ex ? B.clair : i === ex + 2 ? B.sombre : B.fond));
    t.rect(ex, FOND - 31, 3, 1, B.clair);
  }
  for (const ey of [FOND - 23, FOND - 13, FOND - 3, FOND + 7]) t.rect(tx + 9, ey, 23, 2, (_i, j) => (j === ey ? B.clair : B.sombre));
  // La cloche d'alerte et sa corde.
  t.rect(262, SABLIERE + 5, 1, 5, FER.sombre);
  t.lettres(257, SABLIERE + 10, ["...aaaaa...", "..abbcccd..", "..abbcccd..", ".abbbccccd.", ".abbbccccd.", ".abbbccccd.", "abbbbcccccd", "aaaaaaddddd", ".....e....."], { a: "#f0cc68", b: "#e2b23c", c: "#b98a2c", d: "#86621e", e: "#3d2616" });
  for (let y = SABLIERE + 19; y < SABLIERE + 46; y++) t.poser(262 + (y % 9 < 4 ? 0 : 1), y, y % 2 === 0 ? B.corde : B.cordeSombre);
  t.rect(261, SABLIERE + 46, 3, 3, B.cordeSombre);
  // Le tonneau d'eau, son gobelet, le seau ; la corde lovée au poteau.
  poserTonneau(t, 272, FOND + 9, (couleur) => couleur);
  t.rect(277, FOND - 14, 6, 4, (i, j) => (j === FOND - 14 ? "#d0a468" : i === 282 ? B.sombre : B.fond));
  seau(t, 291, FOND + 15, "#6f9fbe");
  t.disque(296, SABLIERE + 38, 8, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d < 12) return null;
    return d > 56 ? B.cordeSombre : (Math.round(Math.atan2(dy, dx) * 5) + (d > 30 ? 1 : 0)) % 2 === 0 ? B.corde : B.cordeSombre;
  });
  t.rect(295, SABLIERE + 26, 3, 5, FER.fond);
  // Un rouge-gorge, posé sur la lisse.
  t.lettres(237, RAMBARDE - 6, ["..aaa..", ".abbba.", "abbcdd.", "abbccc.", ".abcc..", "..e.e.."], { a: "#6a4f32", b: "#8a6a45", c: "#e8853a", d: "#3d2616", e: "#5a4630" });

  // La lanterne du guetteur, pendue au moyeu : éteinte le jour, allumée à la nuit.
  lanterne(t, cx, POINTE + EPAIS + 22, 54, eclat);

  // Le toit de chaume, tranché, à la lumière du dehors ; son bouquet de paille, sa hampe et le fanion du clan.
  t.tel(() => {
    for (let x = cx - DEMI; x <= cx + DEMI; x++) {
      const haut = toit(x);
      const gauche = x < cx;
      for (let j = 0; j < EPAIS; j++) {
        const meles = (x + j) % 2 === 0;
        const u = Math.abs(x - cx) / DEMI;
        let couleur: string = gauche ? (u > 0.3 || meles ? p.chaume.clair : p.chaume.fond) : u > 0.45 || (u > 0.3 && meles) ? p.chaume.sombre : p.chaume.fond;
        if (j % 5 === 4) couleur = p.chaume.rang;
        else if (alea(x, haut + j + 200) < 0.16) couleur = p.chaume.brin;
        if (j === 0 || j === EPAIS - 1) couleur = p.chaume.bord;
        t.poser(x, haut + j, couleur);
      }
      if (alea(x, 19) < 0.5) t.poser(x, haut + EPAIS, p.chaume.bord);
      if (Math.abs(x - cx) > DEMI - 5) for (let j = EPAIS; j < EPAIS + 4 - (DEMI - Math.abs(x - cx)); j++) t.poser(x, haut + j, alea(x, j) < 0.5 ? p.chaume.bord : p.chaume.rang);
    }
    t.rect(cx - 4, POINTE - 4, 9, 7, (i, j) => (j === POINTE - 1 ? p.bois.corde : (i + j) % 2 === 0 ? p.chaume.rang : p.chaume.clair));
    t.rect(cx - 5, POINTE - 6, 11, 2, (i) => (i % 2 === 0 ? p.chaume.bord : p.chaume.fond));
    t.rect(cx, 1, 1, POINTE - 6, p.bois.sombre);
    const drapeau = (couleur: string): string => couleurDuDehors(couleur, melanger(couleur, "#0a1230", 0.55), l);
    // Le fanion du clan : bleu nuit, les trois couleurs en bande à la hampe, deux pointes ; il ondule, lent.
    for (let i = 0; i < 32; i++) {
      const vague = Math.round(2.2 * Math.sin((i * 2 * Math.PI) / 22 - (n * Math.PI) / 2) * Math.min(1, i / 10));
      for (let j = 0; j < 9; j++) {
        if (i > 27 && Math.abs(j - 4) < i - 27) continue;
        const couleur = i < 6 ? TRICOLORE[i >> 1]! : j === 0 || j === 8 ? TRICOLORE[1] : (i >> 2) % 2 === 0 ? BLEU_NUIT : "#182450";
        t.poser(cx + 1 + i, 3 + vague + j, drapeau(couleur));
      }
    }
  });

  // Les deux poteaux de devant, leurs aisseliers.
  for (const x of [24, 328]) {
    poteau(t, x, toit(x + 4) + EPAIS, 8, DEVANT - toit(x + 4) - EPAIS + 2);
    ligature(t, x - 1, SABLIERE + 2, 10, 4);
    ligature(t, x - 1, RAMBARDE + 22, 10, 3);
  }
  biais(t, 32, SABLIERE + 26, 54, toit(54) + EPAIS, 3);
  biais(t, 327, SABLIERE + 26, 305, toit(305) + EPAIS, 3);

  // La tranche du plancher : la forte poutre, le bout des planches ; dessous, les pieux, les croix et l'échelle.
  t.tel(() => {
    const pieu = (hautX: number, basX: number, large: number, loin: boolean): void => {
      for (let y = DEVANT + 8; y < TOUR_H; y++) {
        const x = Math.round(hautX + ((basX - hautX) * (y - DEVANT - 8)) / (TOUR_H - DEVANT - 8));
        for (let i = 0; i < large; i++) t.poser(x + i, y, loin ? (i === 0 ? p.tronc.fond : p.tronc.sombre) : i === 0 ? p.bois.clair : i === large - 1 ? p.bois.sombre : alea(i, y >> 2) < 0.15 ? p.bois.autre : p.bois.fond);
      }
    };
    pieu(74, 71, 5, true);
    pieu(282, 285, 5, true);
    for (const [x0, x1] of [
      [36, 150],
      [324, 210],
    ] as const)
      for (let k = 0; k < 4; k++) t.trait(x0, DEVANT + 9 + k, x1, TOUR_H + 22 + k, k === 0 ? p.bois.fond : p.bois.sombre);
    pieu(26, 22, 9, false);
    pieu(326, 330, 9, false);
    for (const ex of [tx + 6, tx + 32]) t.rect(ex, DEVANT + 8, 3, TOUR_H - DEVANT - 8, (i) => (i === ex ? p.bois.clair : p.bois.sombre));
    for (let y = DEVANT + 12; y < TOUR_H; y += 9) t.rect(tx + 9, y, 23, 2, (_i, j) => (j === y ? p.bois.clair : p.bois.sombre));
    t.rect(14, DEVANT + 1, 333, 6, (i, j) => (j === DEVANT + 1 ? p.bois.clair : j === DEVANT + 6 ? p.bois.creux : (i - 14) % 9 === 8 && j < DEVANT + 4 ? p.bois.sombre : j >= DEVANT + 4 ? p.bois.sombre : p.bois.fond));
    t.rect(14, DEVANT + 7, 333, 1, p.bois.creux);
    for (const x of [24, 328]) t.rect(x - 1, DEVANT + 1, 10, 6, (i, j) => ((i + j) % 3 === 0 ? p.bois.cordeSombre : p.bois.corde));
  });

  return finir(t, l, {
    foyers: [{ x: cx, y: POINTE + EPAIS + 84, rayon: 150, force: 1 }],
    penombre: 0.46,
    ombre: (x, y) => (y > FOND && y < FOND + 6 && x > 60 && x < 300 ? 0.1 : 0),
  });
}

/* ---------- Le grenier sur pilotis : sous le chaume, au sec ---------- */

const GRENIER_L = 400;
const GRENIER_H = 232;
const GRENIER_IMAGES = 4;
/** Les fentes du mur du fond, par où le jour entre : une tous les quatre joints de planches. */
const FENTES = [57, 85, 113, 169, 197, 225] as const;

function grenier(l: Lumiere, image: number): Decor {
  const t = new Toile(GRENIER_L, GRENIER_H);
  const p = paletteDuDehors(l);
  const pierre = pierreDehors(PIERRE_CHAUDE, l);
  const eclat = eclatDe(l);
  const n = tour3(image, GRENIER_IMAGES);
  const FAITE = 15;
  const EGOUT = 80;
  const EPAIS = 13;
  const ENTRAIT = 88;
  const HAUT = ENTRAIT + 7;
  const FOND = 184;
  const DEVANT = 208;
  const HORIZON = 168;
  /** Le dessus du chaume : un faîte long, deux croupes qui descendent bas. */
  const toit = (x: number): number => {
    const hors = x < 122 ? (122 - x) / 116 : x > 278 ? (x - 278) / 116 : 0;
    return FAITE + Math.round(hors * (EGOUT - FAITE) + 3 * Math.sin(Math.PI * Math.min(1, hors))) + (hors === 0 ? Math.round(1.5 * Math.sin((Math.PI * (x - 122)) / 156)) : 0);
  };

  // Le dehors : le ciel de l'heure, la forêt, l'herbe ; on le voit par la porte, par les fentes et sous le plancher.
  let ciel: string[] = [];
  t.tel(() => {
    ciel = peindreCiel(t, l, HORIZON);
    lointain(t, p, HORIZON, []);
    herbeDehors(t, p, HORIZON);
  });
  const jourDehors = melanger(ciel[3]!, "#fff8e0", 0.45 * l.jour);

  // Le dessous du toit : la paille dans l'ombre, les lattes, les chevrons.
  for (let x = 8; x <= 392; x++) {
    for (let y = toit(x) + EPAIS; y < ENTRAIT; y++) {
      const a = alea(x, y + 300);
      const couleur = y % 6 === 0 ? DESSOUS.latte : a < 0.14 ? DESSOUS.clair : a > 0.84 ? DESSOUS.sombre : DESSOUS.fond;
      t.poser(x, y, melanger(couleur, NOIR, 0.16 + 0.34 * (1 - (y - FAITE) / (ENTRAIT - FAITE))));
    }
  }
  for (let cxh = 28; cxh <= 372; cxh += 24) {
    for (let y = FAITE + EPAIS; y < ENTRAIT; y++) {
      const x = Math.round(cxh + (cxh - 200) * 0.06 * (1 - (y - FAITE - EPAIS) / (ENTRAIT - FAITE - EPAIS)));
      if (y < toit(x) + EPAIS) continue;
      t.poser(x, y, B.fond);
      t.poser(x + 1, y, B.sombre);
      t.poser(x + 2, y, B.creux);
    }
  }
  // La panne faîtière, ses deux poinçons et leurs liens.
  poutre(t, 126, FAITE + EPAIS, 149, 4);
  for (const px of [152, 244]) {
    poteau(t, px, FAITE + EPAIS + 4, 5, ENTRAIT - FAITE - EPAIS - 4);
    biais(t, px - 16, FAITE + EPAIS + 4, px - 1, FAITE + EPAIS + 20, 3);
    biais(t, px + 21, FAITE + EPAIS + 4, px + 5, FAITE + EPAIS + 20, 3);
  }

  // Le mur du fond : des planches debout, une lisse à mi-hauteur ; le jour passe par les fentes.
  planchesDebout(t, 30, HAUT, 341, FOND - HAUT, 7, 4);
  for (let y = HAUT; y < HAUT + 9; y++) for (let x = 30; x <= 370; x++) if (y < HAUT + 5 || (x + y) % 2 === 0) t.voiler(x, y, NOIR, 0.32);
  t.rect(30, 138, 341, 3, (_i, j) => (j === 138 ? B.clair : j === 140 ? B.creux : B.sombre));
  t.tel(() => {
    for (const fx of FENTES) t.rect(fx, HAUT + 6, 1, FOND - HAUT - 8, (_i, j) => (j >= 138 && j <= 140 ? null : jourDehors));
    // Cinq courtes fentes d'aération, au-dessus du grain.
    for (let k = 0; k < 5; k++) t.rect(262 + k * 20, HAUT + 10, 2, 12, jourDehors);
  });
  // La petite fenêtre, entre ses deux volets ouverts.
  const fx0 = 132;
  const fy0 = 106;
  for (const vx of [fx0 - 9, fx0 + 22]) t.rect(vx, fy0 - 1, 9, 20, (i, j) => ((j - fy0) % 6 === 5 ? B.creux : i === vx ? B.clair : i === vx + 8 ? B.creux : j === fy0 + 3 || j === fy0 + 14 ? FER.sombre : B.autre));
  t.rect(fx0 - 1, fy0 - 2, 24, 22, (i, j) => (j === fy0 - 2 ? B.clair : i === fx0 - 1 ? B.clair : B.creux));
  t.tel(() => {
    t.rect(fx0 + 1, fy0, 20, 18, (i, j) => {
      const r = j - fy0;
      if (r > 13) return alea(i, 4) * 4 + 13 < r ? p.foret.pres : p.foret.loin;
      return melanger(r < 6 ? ciel[2]! : r < 10 ? ciel[3]! : ciel[4]!, "#fff8e0", 0.2 * l.jour);
    });
  });
  t.rect(fx0 + 10, fy0, 2, 18, B.creux);
  t.rect(fx0 + 1, fy0 + 8, 20, 1, B.creux);
  t.rect(fx0 - 2, fy0 + 19, 26, 2, (_i, j) => (j === fy0 + 19 ? B.clair : B.sombre));

  // Les deux murs de côté, vus par leur tranche qui vient vers nous ; à gauche, la porte ouverte sur le dehors.
  for (let y = HAUT; y <= DEVANT; y++) {
    const part = y <= FOND ? 0 : (y - FOND) / (DEVANT - FOND);
    const retrait = Math.round(16 * (1 - part));
    for (let k = 0; k < retrait; k++) {
      for (const [x, ombre] of [
        [14 + k, 0.22],
        [386 - k, 0.36],
      ] as const) {
        const lame = Math.floor(k / 4);
        const porte = x < 200 && k >= 2 && k <= 12 && y >= 116 + k;
        if (porte) continue;
        t.poser(x, y, melanger(k % 4 === 3 ? B.creux : (lame + 1) % 2 === 0 ? B.fond : B.autre, NOIR, ombre));
      }
    }
  }
  // Le cadre de la porte, et son battant ouvert vers le dehors.
  for (let k = 2; k <= 12; k++) t.poser(14 + k, 115 + k, B.clair);
  t.rect(15, 116, 1, FOND - 100, B.sombre);
  t.rect(27, 128, 1, FOND - 128, B.clair);
  t.tel(() => {
    for (let y = 124; y < DEVANT + 2; y++) t.rect(4, y, 9, 1, (i) => (i === 4 ? p.bois.clair : (y - 124) % 22 < 2 ? p.bois.creux : i === 8 ? p.bois.sombre : p.bois.fond));
  });

  // Le plancher : des lames couchées, plus claires devant.
  t.auSol(() => {
    for (let y = FOND; y <= DEVANT; y++) {
      const part = (y - FOND) / (DEVANT - FOND);
      const retrait = Math.round(16 * (1 - part));
      const lame = Math.floor((y - FOND) / 5);
      for (let x = 14 + retrait; x <= 386 - retrait; x++) {
        let couleur: string = (y - FOND) % 5 === 0 ? B.sombre : (x + lame * 47) % 71 === 0 ? B.sombre : alea(x >> 1, y) < 0.08 ? B.fond : part > 0.5 ? "#a8743e" : B.autre;
        if (alea(x, y + 12) < 0.02) couleur = GRAIN.fond;
        if (y === FOND) couleur = B.creux;
        t.poser(x, y, couleur);
      }
    }
  });

  /* --- Sous le toit : les gerbes rangées sur l'entrait, les paniers, ce qui sèche --- */
  const gerbe = (gx: number, bas: number): void => {
    for (let r = 0; r < 9; r++) {
      const retrait = r === 0 || r === 8 ? 3 : r === 1 || r === 7 ? 1 : 0;
      for (let i = gx + retrait; i < gx + 30 - retrait; i++) {
        let couleur: string = (i + r) % 3 === 0 ? J.chaume.brin : r < 3 ? J.chaume.clair : r > 6 ? J.chaume.sombre : J.chaume.fond;
        if (i > gx + 22) couleur = (i + r) % 2 === 0 ? GRAIN.clair : GRAIN.sombre;
        if (i === gx + 12 || i === gx + 13) couleur = B.cordeSombre;
        t.poser(i, bas - 8 + r, couleur);
      }
    }
  };
  for (const [gx, bas] of [
    [58, ENTRAIT - 1],
    [89, ENTRAIT - 1],
    [120, ENTRAIT - 1],
    [76, ENTRAIT - 10],
    [107, ENTRAIT - 10],
    [96, ENTRAIT - 19],
  ] as const)
    gerbe(gx, bas);
  panier(t, 262, ENTRAIT - 1, 20, 13);
  panier(t, 284, ENTRAIT - 1, 18, 10);
  panier(t, 268, ENTRAIT - 14, 16, 9);
  sacCouche(t, 306, ENTRAIT - 1, 24, 8);
  sacCouche(t, 310, ENTRAIT - 9, 20, 7);
  cruche(t, 198, ENTRAIT - 1);
  cruche(t, 210, ENTRAIT - 1);

  // L'entrait, d'un mur à l'autre.
  poutre(t, 14, ENTRAIT, 373, 7);
  for (const px of [152, 244]) ligature(t, px - 1, ENTRAIT + 1, 7, 5);
  // Ce qui pend à l'entrait : des tresses d'ail et d'oignons, des bouquets d'herbes, des épis.
  for (const [hx, sorte] of [
    [44, 0],
    [62, 1],
    [78, 2],
    [296, 1],
    [316, 0],
    [336, 2],
    [352, 1],
  ] as const) {
    t.rect(hx, HAUT, 1, 4, B.cordeSombre);
    if (sorte === 0) {
      for (let k = 0; k < 6; k++) t.disque(hx + (k % 2 === 0 ? -1 : 2), HAUT + 6 + k * 4, 2, (dx, dy) => (dx + dy < 0 ? "#f4eedc" : "#d6c9a8"));
    } else if (sorte === 1) {
      for (let k = -3; k <= 3; k++) for (let y = HAUT + 4; y < HAUT + 20 - Math.abs(k); y++) t.poser(hx + Math.round((k * (y - HAUT - 2)) / 14), y, (k + y) % 3 === 0 ? "#5f7a3a" : k < 0 ? "#86a04c" : "#6d8a40");
      t.rect(hx - 1, HAUT + 5, 3, 2, B.corde);
    } else {
      for (let k = 0; k < 5; k++) t.disque(hx + (k % 2 === 0 ? -2 : 2), HAUT + 6 + k * 4, 2, (dx, dy) => (dx + dy < 0 ? "#d9a05a" : "#a8642c"));
    }
  }

  /* --- À gauche : les sacs empilés, la fourche, le petit coffre --- */
  const pile = FOND + 16;
  for (const [sx, bas] of [
    [36, pile],
    [60, pile + 1],
    [84, pile],
    [47, pile - 10],
    [72, pile - 10],
    [59, pile - 20],
  ] as const)
    sacCouche(t, sx, bas, 26, 11);
  sac(t, 34, FOND + 2, 15, 20);
  sac(t, 96, FOND + 3, 15, 21);
  // La fourche de bois, contre le mur.
  biais(t, 116, 118, 112, FOND + 4, 2);
  for (const dx of [-5, 0, 5]) t.trait(116 + dx, 100, 116 + Math.round(dx / 3), 118, B.clair);
  t.rect(111, 117, 11, 2, B.sombre);
  coffre(t, 104, FOND + 22, 26, 15);

  /* --- Au milieu : le grand coffre et le chat, la balance, le boisseau --- */
  const cy = FOND + 12;
  coffre(t, 182, cy, 46, 26);
  const chat = {
    a: "#5a4a40",
    b: "#e6dcc8",
    c: "#5f8a3a",
    d: "#e89aa0",
    e: "#f8f2e4",
  };
  t.lettres(196, cy - 39, ["..a....a....", "..aa..aa....", "..abaaba....", "..aebbba....", "..aecbca....", "..aebdba....", "...abba.....", "..aebbba....", ".aebbbbba...", ".aebbbbba...", ".aebbbbba...", ".aebbbbba...", ".aabbbbaa...", "..aaaaaa...."], chat);
  // Sa queue pend le long du coffre et se balance, lente.
  const balance = [-3, 0, 3, 0][n]!;
  for (let k = 0; k < 19; k++) {
    const qx = k < 5 ? 205 + k : 210 + Math.round((balance * Math.max(0, k - 6)) / 12);
    const qy = k < 5 ? cy - 27 : cy - 27 + (k - 4);
    t.rect(qx, qy, 2, 2, k > 15 ? "#8a6a4a" : chat.b);
  }
  // La balance, pendue à l'entrait : le grain d'un côté, les poids de l'autre.
  const bx = 232;
  t.rect(bx, HAUT, 1, 9, FER.sombre);
  t.trait(bx - 17, HAUT + 11, bx + 17, HAUT + 8, FER.fond);
  t.trait(bx - 17, HAUT + 12, bx + 17, HAUT + 9, FER.sombre);
  t.rect(bx - 1, HAUT + 7, 3, 5, FER.clair);
  for (const [px, py, grain] of [
    [bx - 17, HAUT + 12, true],
    [bx + 17, HAUT + 9, false],
  ] as const) {
    t.trait(px, py, px - 6, py + 15, FER.sombre);
    t.trait(px, py, px + 6, py + 15, FER.sombre);
    t.lettres(px - 7, py + 15, ["abbbbbbbbbbbbbc", ".abbbbbbbbbbbc.", "..accccccccca.."], { a: "#e2b23c", b: "#b98a2c", c: "#86621e" });
    if (grain) for (let dx = -5; dx <= 5; dx++) for (let dy = 0; dy <= 3 - Math.round(Math.abs(dx) / 2); dy++) t.poser(px + dx, py + 14 - dy, dx < 0 ? GRAIN.clair : GRAIN.fond);
    else {
      t.rect(px - 5, py + 11, 4, 4, (i, j) => (j === py + 11 ? FER.clair : i === px - 2 ? FER.sombre : FER.fond));
      t.rect(px, py + 9, 5, 6, (i, j) => (j === py + 9 ? FER.clair : i === px + 4 ? FER.sombre : FER.fond));
    }
  }
  // Le boisseau plein, et la pelle à grain couchée devant.
  seau(t, 234, FOND + 20, GRAIN.clair);

  /* --- À droite : la réserve de grain derrière sa cloison, la pelle plantée dedans --- */
  const cloison = FOND - 14;
  const tas = (x: number): number => cloison - 2 - Math.round(58 * Math.pow(Math.sin((Math.PI / 2) * borner((x - 252) / 122)), 0.9) + 1.2 * Math.sin(x / 9));
  for (let x = 252; x <= 372; x++) {
    for (let y = tas(x); y < cloison + 4; y++) {
      const a = alea(x, y + 400);
      const pente = alea(x >> 3, 5) < 0.75 ? -1 : 1;
      let couleur: string = a < (pente < 0 ? 0.3 : 0.08) ? GRAIN.clair : a > (pente < 0 ? 0.9 : 0.6) ? GRAIN.sombre : GRAIN.fond;
      if (y === tas(x)) couleur = GRAIN.clair;
      if ((x * 2 + y * 3) % 23 === 0 && y > tas(x) + 3) couleur = GRAIN.creux;
      if (x > 368) couleur = melanger(couleur, NOIR, 0.3);
      t.poser(x, y, couleur);
    }
  }
  biais(t, 292, 92, 286, 133, 2);
  t.rect(288, 90, 9, 3, (_i, j) => (j === 90 ? B.clair : B.sombre));
  t.rect(281, 131, 12, 6, (i, j) => (j === 139 ? "#d9b98a" : i === 296 ? B.fond : "#c79a62"));
  for (let y = cloison; y <= FOND + 17; y++) {
    t.rect(248, y, 124, 1, (i) => {
      const r = y - cloison;
      if (r === 0) return B.clair;
      if (r % 8 === 7) return B.creux;
      if ((i - 248 + Math.floor(r / 8) * 31) % 62 === 0) return B.sombre;
      return alea(i >> 2, y) < 0.14 ? B.fond : i > 356 ? B.sombre : B.autre;
    });
  }
  for (const px of [246, 306, 366]) poteau(t, px, cloison - 5, 5, FOND + 23 - cloison);
  // Le grain qui a débordé, au pied de la cloison.
  for (let dx = -13; dx <= 13; dx++) for (let dy = 0; dy <= Math.round(5 * Math.sqrt(1 - (dx * dx) / 170)); dy++) t.poser(266 + dx, FOND + 20 - dy, dy > 2 || alea(dx, dy) < 0.2 ? GRAIN.clair : dx > 6 ? GRAIN.sombre : GRAIN.fond);
  // Le van d'osier, accroché au mur.
  t.disque(68, 162, 9, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > 64) return "#7a5a2c";
    return (dx + dy * 2 + 40) % 4 < 2 ? "#c49a5c" : "#a8824a";
  });

  // La lanterne du grenier, pendue à l'entrait.
  lanterne(t, 170, HAUT, 6, eclat);

  // Le chaume du toit, vu par sa tranche ; ses bouquets de faîte.
  t.tel(() => {
    chaumeEnCoupe(t, p, 5, 395, toit, EPAIS);
    for (let x = 124; x <= 276; x++) {
      t.poser(x, toit(x) - 1, (x - 124) % 6 < 2 ? p.chaume.bord : p.chaume.rang);
      if ((x - 124) % 6 < 2) t.poser(x, toit(x) - 2, p.chaume.rang);
      if ((x - 124) % 12 === 0) t.poser(x, toit(x) - 3, p.chaume.clair);
    }
  });

  // La tranche du plancher et le dessous : la forte poutre, le bout des solives, les pilotis coiffés de pierres plates.
  t.tel(() => {
    for (let y = DEVANT + 9; y < GRENIER_H - 4; y++) for (let x = 12; x < 388; x++) t.voiler(x, y, "#0c1020", 0.42 - 0.012 * (y - DEVANT));
    const b = p.bois;
    for (const x of [58, 138, 218, 298]) t.rect(x, DEVANT + 9, 3, GRENIER_H - DEVANT - 13, (i) => (i === x + 2 ? b.creux : b.sombre));
    // Les sacs rangés dessous, au sec, et la souris que les pierres plates arrêtent.
    const toile = {
      fond: couleurDuDehors(TOILE.fond, "#7c7660", l),
      clair: couleurDuDehors(TOILE.clair, "#8e8870", l),
      sombre: couleurDuDehors(TOILE.sombre, "#625d4b", l),
      lien: p.bois.cordeSombre,
    };
    sac(t, 232, GRENIER_H - 4, 12, 14, toile);
    sac(t, 243, GRENIER_H - 3, 12, 13, toile);
    sacCouche(t, 256, GRENIER_H - 3, 18, 7, toile);
    sacCouche(t, 150, GRENIER_H - 3, 18, 7, toile);
    const gris = couleurDuDehors("#8a8690", "#4a4a5c", l);
    t.lettres(86, GRENIER_H - 8, ["..aa....", ".aaaaa..", "aaaaaaab", ".a..a..."], { a: gris, b: couleurDuDehors("#d9a0a0", "#6a5060", l) });
    for (const x of [24, 104, 184, 264, 344, 370]) {
      t.rect(x, DEVANT + 13, 6, GRENIER_H - DEVANT - 13, (i, j) => (i === x ? b.clair : i === x + 5 ? b.sombre : alea(i, j + 9) < 0.08 ? b.sombre : b.fond));
      t.rect(x - 2, DEVANT + 9, 10, 1, pierre.clair);
      t.rect(x - 3, DEVANT + 10, 12, 2, (i) => (i > x + 5 ? pierre.sombre : pierre.fond));
      t.rect(x - 2, DEVANT + 12, 10, 1, pierre.joint);
    }
    t.rect(8, DEVANT + 1, 385, 8, (i, j) => (j === DEVANT + 1 ? b.clair : j === DEVANT + 8 ? b.creux : j === DEVANT + 7 ? b.sombre : (i - 8) % 14 === 13 ? b.sombre : b.fond));
    for (let x = 14; x < 388; x += 11) t.rect(x, DEVANT + 3, 4, 3, (i, j) => (i === x && j === DEVANT + 3 ? b.clair : j === DEVANT + 5 || i === x + 3 ? b.creux : b.sombre));
    // L'échelle, appuyée au seuil de la porte.
    for (let y = DEVANT - 2; y < GRENIER_H; y++) {
      const x = 8 - Math.round(((y - DEVANT + 2) * 7) / (GRENIER_H - DEVANT + 2));
      t.poser(x, y, b.clair);
      t.poser(x + 1, y, b.sombre);
    }
    for (let y = FOND + 2; y < GRENIER_H; y += 7) t.rect(0, y, 9, 2, (_i, j) => (j === y ? b.clair : b.sombre));
  });

  return finir(t, l, {
    foyers: [{ x: 170, y: HAUT + 14, rayon: 150, force: 1 }],
    penombre: 0.56,
    // Le jour entre par chaque fente en une lame de lumière qui se pose sur le plancher ; par la porte, en un grand pan.
    rayons: (x, y, sol) => {
      let r = 0;
      if (y < HAUT || y > DEVANT || x < 30 || x > 372) return 0;
      for (const fx of FENTES) {
        const k = x - fx;
        if (k < 0 || k > 30) continue;
        const haut = HAUT + 6 + (k / 30) * (DEVANT - HAUT - 6);
        const bas = FOND + (k / 30) * (DEVANT - FOND);
        if (y >= haut && y <= bas + 1) r += sol && y >= bas - 1 ? 0.34 : 0.07;
      }
      if (sol && x < 120) {
        const k = x - 30 - (y - FOND) * 0.5;
        if (k > -14 && k < 70) r += 0.26 * (1 - Math.max(0, k) / 70);
      }
      return Math.min(0.4, r);
    },
    ombre: (x, y) => (y >= HAUT && y <= DEVANT && x >= 14 && x <= 386 ? 0.05 + 0.1 * ((x - 14) / 372) : 0),
  });
}

/* ---------- Le moulin à eau : la roue, les engrenages, la meule ---------- */

const MOULIN_L = 440;
const MOULIN_H = 264;
const MOULIN_IMAGES = 4;
/** Les aubes de la roue et les dents du rouet : douze, comme les bras de la roue du dehors. La lanterne a six fuseaux. */
const AUBES = 12;
const FUSEAUX = 6;

function moulin(l: Lumiere, image: number): Decor {
  const t = new Toile(MOULIN_L, MOULIN_H);
  const p = paletteDuDehors(l);
  const pierre = pierreDehors(PIERRE_CHAUDE, l);
  const eclat = eclatDe(l);
  const n = tour3(image, MOULIN_IMAGES);
  const c = (deJour: string, deNuit: string): string => couleurDuDehors(deJour, deNuit, l);
  const eau = {
    fond: c("#4f8fb5", "#1e3d63"),
    clair: c("#86bcd6", "#335f88"),
    sombre: c("#3b7499", "#17304f"),
  };
  const FAITE = 12;
  const EGOUT = 70;
  const EPAIS = 13;
  const ENTRAIT = 78;
  const HAUT = ENTRAIT + 7;
  const FOND = 226;
  const DEVANT = 246;
  const HORIZON = 206;
  const SOUBASSEMENT = 190;
  /** L'arbre de la roue : sa rangée du milieu. Il traverse le mur et porte le rouet. */
  const ARBRE = 192;
  const PLATEAU = 142;
  const MEULE = 166;
  /** Un quarante-huitième de tour par image : la roue se retrouve pareille au bout des quatre. */
  const pas = (2 * Math.PI) / AUBES;
  const tourne = (n * pas) / MOULIN_IMAGES;
  const toit = (x: number): number => {
    const hors = x < 176 ? (176 - x) / 124 : x > 312 ? (x - 312) / 124 : 0;
    return FAITE + Math.round(hors * (EGOUT - FAITE) + 3 * Math.sin(Math.PI * Math.min(1, hors))) + (hors === 0 ? Math.round(1.5 * Math.sin((Math.PI * (x - 176)) / 136)) : 0);
  };

  // Le dehors : le ciel, la forêt, le pré, le ruisseau où trempe la roue.
  let ciel: string[] = [];
  t.tel(() => {
    ciel = peindreCiel(t, l, HORIZON);
    lointain(t, p, HORIZON, []);
    herbeDehors(t, p, HORIZON);
    // Les roseaux de l'autre rive.
    for (let x = 0; x < 64; x += 3) {
      const h = 5 + Math.floor(alea(x, 77) * 9);
      for (let k = 0; k < h; k++) t.poser(x + (k > h - 3 && alea(x, 3) < 0.5 ? 1 : 0), DEVANT - 1 - k, k > h - 3 && alea(x, 5) < 0.4 ? p.tronc.fond : alea(x, k) < 0.4 ? p.feuilles.claire : p.feuilles.fond);
    }
  });

  // Le dessous du toit : la paille dans l'ombre, les lattes, les chevrons ; la panne faîtière et ses poinçons.
  for (let x = 64; x <= 424; x++) {
    for (let y = toit(x) + EPAIS; y < ENTRAIT; y++) {
      const a = alea(x, y + 300);
      const couleur = y % 6 === 0 ? DESSOUS.latte : a < 0.14 ? DESSOUS.clair : a > 0.84 ? DESSOUS.sombre : DESSOUS.fond;
      t.poser(x, y, melanger(couleur, NOIR, 0.16 + 0.34 * (1 - (y - FAITE) / (ENTRAIT - FAITE))));
    }
  }
  for (let cxh = 76; cxh <= 412; cxh += 24) {
    for (let y = FAITE + EPAIS; y < ENTRAIT; y++) {
      const x = Math.round(cxh + (cxh - 244) * 0.06 * (1 - (y - FAITE - EPAIS) / (ENTRAIT - FAITE - EPAIS)));
      if (y < toit(x) + EPAIS) continue;
      t.poser(x, y, B.fond);
      t.poser(x + 1, y, B.sombre);
      t.poser(x + 2, y, B.creux);
    }
  }
  poutre(t, 180, FAITE + EPAIS, 129, 4);
  for (const px of [206, 282]) {
    poteau(t, px, FAITE + EPAIS + 4, 5, ENTRAIT - FAITE - EPAIS - 4);
    biais(t, px - 15, FAITE + EPAIS + 4, px - 1, FAITE + EPAIS + 19, 3);
    biais(t, px + 20, FAITE + EPAIS + 4, px + 5, FAITE + EPAIS + 19, 3);
  }
  // Dans le comble : un rouet de rechange, une corde lovée, deux sacs vides, la chouette du moulin.
  t.disque(132, ENTRAIT - 13, 12, (dx, dy) => {
    const d = dx * dx + dy * dy;
    const angle = (Math.atan2(dy, dx) / Math.PI) * 6;
    if (d > 110) return Math.abs(angle - Math.round(angle)) < 0.2 ? "#d9b98a" : null;
    if (d > 64) return dx + dy < 0 ? B.clair : B.fond;
    if (d < 8) return B.creux;
    return Math.abs(dx) < 2 || Math.abs(dy) < 2 ? B.autre : null;
  });
  sacCouche(t, 344, ENTRAIT - 1, 24, 8);
  sacCouche(t, 348, ENTRAIT - 9, 20, 7);
  t.disque(318, ENTRAIT - 6, 6, (dx, dy) => {
    const d = dx * dx + dy * dy;
    return d < 6 ? null : (Math.round(Math.atan2(dy, dx) * 5) + (d > 20 ? 1 : 0)) % 2 === 0 ? B.corde : B.cordeSombre;
  });
  t.lettres(244, ENTRAIT - 14, [".a.....a.", ".abbbbba.", "abcdbdcba", "abddbddba", "abbbebbba", ".abfbfba.", ".abbfbba.", ".abfbfba.", ".abbfbba.", "..abbba..", "..abbba..", "..aabaa..", "..e...e.."], {
    a: "#8a6238",
    b: "#e9dcb8",
    c: "#f6f0e2",
    d: "#2a1a10",
    e: "#c79a3a",
    f: "#c9b68a",
  });

  // Le mur du fond : du torchis entre des bois, sur un soubassement de pierre ; la porte, la fenêtre.
  torchis(t, 92, HAUT, 309, SOUBASSEMENT - HAUT);
  for (let y = HAUT; y < HAUT + 6; y++) for (let x = 92; x <= 400; x++) t.voiler(x, y, NOIR, 0.3 - (y - HAUT) * 0.045);
  pierres(t, PIERRE_CHAUDE, 92, SOUBASSEMENT, 309, FOND - SOUBASSEMENT, {
    lit: 6,
    moellon: 12,
    graine: 8,
  });
  poutre(t, 92, SOUBASSEMENT - 3, 309, 4);
  for (const px of [92, 236, 300, 352, 397]) poteau(t, px, HAUT, 4, SOUBASSEMENT - HAUT - 3);
  biais(t, 240, 150, 262, SOUBASSEMENT - 4, 3);
  biais(t, 299, 150, 277, SOUBASSEMENT - 4, 3);
  // La porte : des planches et deux pentures de fer, son seuil de pierre.
  t.rect(362, FOND - 74, 30, 74, (i, j) => {
    if (i < 364 || i > 389 || j < FOND - 72) return B.sombre;
    if (j === FOND - 58 || j === FOND - 57 || j === FOND - 18 || j === FOND - 17) return j === FOND - 58 || j === FOND - 18 ? FER.fond : FER.sombre;
    if ((i - 364) % 6 === 5) return B.creux;
    return alea(i, j >> 2) < 0.1 ? B.sombre : Math.floor((i - 364) / 6) % 2 === 0 ? B.autre : B.fond;
  });
  t.rect(384, FOND - 40, 3, 5, FER.sombre);
  t.rect(360, FOND - 3, 34, 3, (_i, j) => (j === FOND - 3 ? PIERRE_CHAUDE.clair : PIERRE_CHAUDE.fond));
  // La fenêtre, entre ses deux volets ouverts.
  const fx0 = 314;
  const fy0 = 112;
  for (const vx of [fx0 - 9, fx0 + 22]) t.rect(vx, fy0 - 1, 9, 20, (i, j) => ((j - fy0) % 6 === 5 ? B.creux : i === vx ? B.clair : i === vx + 8 ? B.creux : j === fy0 + 3 || j === fy0 + 14 ? FER.sombre : B.autre));
  t.rect(fx0 - 1, fy0 - 2, 24, 22, (i, j) => (j === fy0 - 2 || i === fx0 - 1 ? B.clair : B.creux));
  t.tel(() => {
    t.rect(fx0 + 1, fy0, 20, 18, (i, j) => {
      const r = j - fy0;
      if (r > 13) return alea(i, 4) * 4 + 13 < r ? p.foret.pres : p.foret.loin;
      return melanger(r < 6 ? ciel[2]! : r < 10 ? ciel[3]! : ciel[4]!, "#fff8e0", 0.2 * l.jour);
    });
  });
  t.rect(fx0 + 10, fy0, 2, 18, B.creux);
  t.rect(fx0 + 1, fy0 + 8, 20, 1, B.creux);
  t.rect(fx0 - 2, fy0 + 19, 26, 2, (_i, j) => (j === fy0 + 19 ? B.clair : B.sombre));
  // L'étagère des mesures, et le crible pendu.
  poserEtagere(t, 248, 296, 128, (couleur) => couleur);
  t.disque(378, 124, 10, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > 78) return dx + dy < 0 ? B.clair : B.sombre;
    if (d > 60) return B.fond;
    return (dx + dy) % 2 === 0 ? "#cdbb8e" : "#a8946a";
  });
  t.rect(378, 110, 1, 4, B.cordeSombre);

  // Les deux murs de côté, vus par leur tranche qui vient vers nous ; à gauche, le trou où passe l'arbre.
  for (let y = HAUT; y <= DEVANT; y++) {
    const part = y <= FOND ? 0 : (y - FOND) / (DEVANT - FOND);
    const retrait = Math.round(12 * (1 - part));
    for (let k = 0; k < retrait; k++) {
      for (const [x, ombre] of [
        [80 + k, 0.2],
        [412 - k, 0.36],
      ] as const) {
        let couleur: string;
        if (y >= SOUBASSEMENT) {
          const lit = Math.floor((y - SOUBASSEMENT) / 6);
          couleur = (y - SOUBASSEMENT) % 6 === 5 || (k + lit * 3) % 6 === 0 ? PIERRE_CHAUDE.joint : alea(Math.floor((k + lit * 3) / 6) + x, lit) < 0.4 ? PIERRE_CHAUDE.sombre : PIERRE_CHAUDE.fond;
        } else couleur = (y - HAUT) % 3 === 2 ? J.mur.trame : alea(x, y) < 0.06 ? J.mur.clair : J.mur.fond;
        t.poser(x, y, melanger(couleur, NOIR, ombre));
      }
    }
  }
  t.rect(80, ARBRE - 8, 12, 17, (i, j) => (Math.abs(j - ARBRE) > 6 || i === 80 ? melanger(PIERRE_CHAUDE.joint, NOIR, 0.3) : "#1a1410"));

  // Le sol : de larges dalles, blanchies de farine par endroits ; la fosse du rouet.
  t.auSol(() => {
    for (let y = FOND; y <= DEVANT; y++) {
      const part = (y - FOND) / (DEVANT - FOND);
      const retrait = Math.round(12 * (1 - part));
      const lit = Math.floor((y - FOND) / 7);
      for (let x = 80 + retrait; x <= 412 - retrait; x++) {
        const k = x + lit * 17;
        const ton = alea(Math.floor(k / 34), lit + 40);
        let couleur: string = (y - FOND) % 7 === 0 || k % 34 === 0 ? PIERRE_CHAUDE.joint : ton < 0.3 ? PIERRE_CHAUDE.clair : ton < 0.75 ? PIERRE_CHAUDE.fond : PIERRE_CHAUDE.sombre;
        if (alea(x, y + 31) < 0.05) couleur = PIERRE_CHAUDE.clair;
        if (y === FOND) couleur = PIERRE_CHAUDE.trou;
        t.poser(x, y, couleur);
      }
    }
  });
  for (let y = FOND + 2; y <= DEVANT; y++) for (let x = 170; x < 404; x++) if (alea(x, y + 77) < 0.08 + 0.14 * Math.exp(-((x - 206) * (x - 206)) / 2600) + 0.1 * Math.exp(-((x - 350) * (x - 350)) / 1200)) t.voiler(x, y, FARINE.fond, 0.55);
  t.rect(126, FOND + 2, 40, 14, (i, j) => (j === FOND + 2 || i === 126 ? PIERRE_CHAUDE.trou : i === 165 || j === FOND + 15 ? PIERRE_CHAUDE.clair : "#1e1814"));

  /* --- Sous le plateau : l'arbre, le rouet, la lanterne --- */
  // Les poteaux du fond du beffroi et sa traverse basse, dans l'ombre.
  for (const px of [112, 214]) t.rect(px, PLATEAU + 8, 5, FOND - PLATEAU - 6, (i) => (i === px + 4 ? B.creux : B.sombre));
  t.rect(100, 183, 126, 5, (_i, j) => (j === 183 ? B.fond : j === 187 ? B.creux : B.sombre));
  // Le dé de pierre et le palier où tourne le bout de l'arbre.
  pierres(t, PIERRE_CHAUDE, 156, ARBRE + 7, 16, FOND - ARBRE - 5, {
    lit: 6,
    moellon: 9,
    graine: 5,
  });
  t.rect(155, ARBRE + 5, 18, 2, (_i, j) => (j === ARBRE + 5 ? PIERRE_CHAUDE.clair : PIERRE_CHAUDE.joint));
  // L'arbre : un fort tronc équarri, cerclé de fer, qui vient de la roue à travers le mur.
  t.rect(84, ARBRE - 5, 82, 11, (i, j) => {
    const r = j - ARBRE;
    if (i === 100 || i === 101 || i === 160 || i === 161) return r < -2 ? FER.clair : r > 2 ? FER.sombre : FER.fond;
    if (r === -5) return B.clair;
    if (r === 5) return B.creux;
    // Les fentes du bois défilent : l'arbre tourne.
    if ((i * 3 + r * 7 + n * 5) % 20 === 0 && Math.abs(r) < 4) return B.sombre;
    return r < -2 ? B.autre : r > 2 ? B.sombre : B.fond;
  });
  t.rect(166, ARBRE - 2, 3, 5, FER.sombre);
  // Le rouet, vu de trois quarts : un disque de planches cerclé, épais, et ses douze dents qui tournent vers la lanterne.
  const RX = 10;
  const RY = 34;
  const rcx = 146;
  for (let dy = -RY; dy <= RY; dy++) {
    const demi = Math.round(RX * Math.sqrt(1 - (dy * dy) / ((RY + 0.5) * (RY + 0.5))));
    const y = ARBRE + dy;
    // Sa tranche, du côté du mur.
    for (let x = rcx - demi - 6; x < rcx - demi; x++) t.poser(x, y, dy < -RY * 0.5 ? B.autre : dy > RY * 0.6 ? B.creux : (y + n) % 6 === 0 ? B.creux : B.sombre);
    for (let x = rcx - demi; x <= rcx + demi; x++) {
      const u = (x - rcx) / RX;
      const v = dy / RY;
      const rr = Math.sqrt(u * u + v * v);
      let d = (((Math.atan2(v, u) - tourne) % pas) + pas) % pas;
      if (d > pas / 2) d -= pas;
      let couleur: string;
      if (rr > 0.78) couleur = Math.abs(d) < 0.07 ? B.creux : x === rcx + demi ? B.sombre : x === rcx - demi || dy < -RY * 0.7 ? B.clair : B.autre;
      else if (rr > 0.7) couleur = FER.fond;
      else if (rr < 0.2) couleur = FER.sombre;
      else couleur = Math.abs(Math.abs(d) - pas / 2) < 0.09 ? B.creux : u + v > 0.3 ? B.sombre : B.fond;
      t.poser(x, y, couleur);
    }
  }
  for (let k = 0; k < AUBES; k++) {
    const angle = k * pas + tourne;
    const dx = Math.round(rcx + RX * 0.86 * Math.cos(angle));
    const dy = Math.round(ARBRE + RY * 0.88 * Math.sin(angle));
    t.rect(dx, dy - 1, 8, 3, (i, j) => (i === dx + 7 ? "#a8824a" : j === dy - 1 ? "#f0dcb0" : j === dy + 1 ? "#a8824a" : "#d9bc86"));
  }
  // Le bout de l'arbre, qui sort du moyeu jusqu'à son palier.
  t.rect(rcx + 2, ARBRE - 4, 20, 9, (i, j) => {
    const r = j - ARBRE;
    if (i === rcx + 2 || i === rcx + 3) return FER.fond;
    if (i >= rcx + 17 && i <= rcx + 18) return r < -1 ? FER.clair : FER.sombre;
    if ((i * 3 + r * 7 + n * 5) % 20 === 0 && Math.abs(r) < 3) return B.sombre;
    return r === -4 ? B.clair : r === 4 ? B.creux : r < -1 ? B.autre : r > 1 ? B.sombre : B.fond;
  });
  // La lanterne : deux tourtes de bois, six fuseaux qui tournent deux fois plus vite que le rouet.
  const lant = PLATEAU + 12;
  const tourneLanterne = (n * ((2 * Math.PI) / FUSEAUX)) / MOULIN_IMAGES;
  t.rect(MEULE - 1, PLATEAU + 6, 3, 34, (i) => (i === MEULE - 1 ? FER.clair : i === MEULE + 1 ? FER.sombre : FER.fond));
  for (let k = 0; k < FUSEAUX; k++) {
    const angle = (k * 2 * Math.PI) / FUSEAUX + tourneLanterne;
    if (Math.cos(angle) >= 0) continue;
    const fx = Math.round(MEULE + 12 * Math.sin(angle));
    t.rect(fx - 1, lant + 4, 2, 13, B.creux);
  }
  for (let k = 0; k < FUSEAUX; k++) {
    const angle = (k * 2 * Math.PI) / FUSEAUX + tourneLanterne;
    if (Math.cos(angle) < 0) continue;
    const fx = Math.round(MEULE + 12 * Math.sin(angle));
    t.rect(fx - 1, lant + 4, 3, 13, (i) => (i === fx - 1 ? "#e8cfa0" : i === fx + 1 ? "#a8824a" : "#d2b07a"));
  }
  for (const ty of [lant, lant + 17]) t.rect(MEULE - 15, ty, 31, 4, (i, j) => (j === ty ? B.clair : j === ty + 3 ? B.creux : i < MEULE - 10 ? B.autre : i > MEULE + 9 ? B.sombre : (i + j) % 7 === 0 ? FER.fond : B.fond));
  // La braie, où pivote le fer de la meule.
  t.rect(MEULE - 6, lant + 22, 13, 9, (i, j) => {
    const dx = i - MEULE;
    const dyb = j - lant - 26;
    if (i === MEULE - 6 || j === lant + 22) return B.clair;
    if (i === MEULE + 6 || j === lant + 30) return B.creux;
    return dx * dx + dyb * dyb < 3 ? FER.sombre : (Math.abs(dx) + Math.abs(dyb)) % 3 === 0 ? B.sombre : B.autre;
  });
  // Le panier des dents de rechange, le pot de graisse.
  panier(t, 104, FOND + 16, 20, 11);
  for (let k = 0; k < 5; k++) t.rect(106 + k * 3, FOND + 2 - (k % 2) * 2, 2, 5, k % 2 === 0 ? "#e8cfa0" : "#d2b07a");
  t.lettres(127, DEVANT - 8, [".aaaaa.", "abbbbba", "abcccba", "abbbbba", ".abbba.", ".aaaaa."], { a: "#5a2f18", b: "#b0683c", c: "#3a3020" });

  // La conduite de bois où descend la farine, et le grand sac qui la reçoit.
  t.rect(193, PLATEAU + 8, 11, 50, (i, j) => (i === 193 ? "#e8cfa0" : i === 203 ? "#8a6238" : (j - PLATEAU) % 16 === 0 ? "#8a6238" : alea(i, j) < 0.12 ? FARINE.sombre : i < 197 ? "#d9b98a" : "#c79a62"));
  t.rect(191, PLATEAU + 56, 15, 3, (_i, j) => (j === PLATEAU + 56 ? "#e8cfa0" : "#8a6238"));
  for (let r = 0; r < 36; r++) {
    const y = FOND + 10 - 35 + r;
    const retrait = r < 2 ? 2 : r === 35 ? 1 : 0;
    for (let i = 184 + retrait; i < 212 - retrait; i++) {
      const u = (i - 184) / 27;
      t.poser(i, y, r === 0 ? TOILE.clair : r === 35 || i === 211 - retrait ? TOILE.sombre : u < 0.26 ? TOILE.clair : u > 0.72 ? TOILE.sombre : alea(i, y) < 0.08 || (r + i) % 11 === 0 ? TOILE.sombre : TOILE.fond);
    }
  }
  for (let dx = -10; dx <= 10; dx++) for (let dy = 0; dy <= Math.round(4 * Math.sqrt(1 - (dx * dx) / 110)); dy++) t.poser(198 + dx, FOND - 25 - dy, dy > 2 || dx < -4 ? FARINE.clair : dx > 4 ? FARINE.sombre : FARINE.fond);
  // La farine qui tombe, lente.
  for (let y = PLATEAU + 58; y < FOND - 28; y++) for (let x = 195; x <= 201; x++) if ((x * 2 + y - n + 400) % 4 < 2) t.poser(x, y, (x + y) % 3 === 0 ? FARINE.sombre : FARINE.clair);

  /* --- Sur le plateau : les deux meules, la trémie et son grain --- */
  // Le dessus du plateau, vu en fuite, et ses poteaux de devant.
  t.rect(98, PLATEAU - 6, 146, 6, (i, j) => (j === PLATEAU - 6 ? B.creux : (i - 98 + (j - PLATEAU) * 3) % 21 === 0 ? B.sombre : alea(i >> 1, j) < 0.1 ? B.fond : "#a8743e"));
  for (let y = PLATEAU - 4; y < PLATEAU; y++) for (let x = 120; x < 216; x++) if (alea(x, y + 9) < 0.3) t.voiler(x, y, FARINE.fond, 0.6);
  // La trémie sur ses quatre montants : une auge en entonnoir, pleine de grain.
  const tremie = 96;
  for (const mx of [126, 204]) t.rect(mx, tremie - 4, 3, PLATEAU - tremie - 2, (i) => (i === mx ? B.clair : i === mx + 2 ? B.creux : B.fond));
  for (let dx = -27; dx <= 27; dx++) for (let dy = 0; dy <= Math.round(6 * Math.sqrt(1 - (dx * dx) / 760)); dy++) t.poser(MEULE + dx, tremie - 1 - dy, alea(dx + 60, dy) < 0.25 || dy > 4 ? GRAIN.clair : dx > 12 ? GRAIN.sombre : GRAIN.fond);
  for (let r = 0; r < 17; r++) {
    const demi = Math.round(31 - (r * 24) / 16);
    t.rect(MEULE - demi, tremie + r, demi * 2 + 1, 1, (i) => {
      const u = (i - MEULE) / demi;
      if (r === 0) return B.clair;
      if (Math.abs(i - MEULE) === demi) return u < 0 ? B.clair : B.creux;
      if (r % 6 === 5 || Math.abs(Math.abs(u) - 0.5) < 0.03) return B.sombre;
      return u < -0.35 ? B.autre : u > 0.4 ? B.sombre : alea(i >> 1, r) < 0.12 ? B.autre : B.fond;
    });
  }
  t.rect(124, tremie - 2, 85, 2, (i, j) => (j === tremie - 2 && (i < MEULE - 28 || i > MEULE + 28) ? B.clair : i < MEULE - 28 || i > MEULE + 28 ? B.sombre : null));
  // L'auget, sous la trémie, et le filet de grain qui tombe dans l'œil de la meule.
  biais(t, MEULE - 9, tremie + 17, MEULE + 6, tremie + 20, 2);
  for (let y = tremie + 21; y < 120; y++) for (const gx of [MEULE + 5, MEULE + 6]) if ((y + gx - n + 400) % 4 < 2) t.poser(gx, y, (y + gx) % 3 === 0 ? GRAIN.clair : GRAIN.fond);
  // La meule courante, qui tourne, sur la meule gisante ; leurs cercles de fer.
  const DEMI = 40;
  for (let dx = -DEMI; dx <= DEMI; dx++) {
    const x = MEULE + dx;
    const angle = Math.asin(dx / DEMI);
    const u = dx / DEMI;
    const pasMeule = (2 * Math.PI) / FUSEAUX;
    let d = (((angle - tourneLanterne) % pasMeule) + pasMeule) % pasMeule;
    if (d > pasMeule / 2) d -= pasMeule;
    const sillon = Math.abs(d) * DEMI < 1.1;
    const eclisse = Math.abs((d + pasMeule / 2) % pasMeule) * DEMI < 2.2 || Math.abs(d - pasMeule / 2) * DEMI < 2.2;
    for (let y = 122; y < 135; y++) {
      const a = alea(x >> 1, y + 500);
      let couleur: string = u < -0.55 ? PIERRE_CHAUDE.clair : u > 0.5 ? PIERRE_CHAUDE.sombre : a < 0.14 ? PIERRE_CHAUDE.sombre : a > 0.9 ? PIERRE_CHAUDE.clair : PIERRE_CHAUDE.fond;
      if (sillon) couleur = PIERRE_CHAUDE.joint;
      else if (eclisse && y > 124 && y < 132 && Math.abs(u) < 0.9) couleur = y === 125 ? PIERRE_CHAUDE.clair : melanger(PIERRE_CHAUDE.clair, PIERRE_CHAUDE.fond, 0.5);
      if (y === 122) couleur = Math.abs(dx) < 5 ? PIERRE_CHAUDE.trou : PIERRE_CHAUDE.clair;
      if (y === 127 || y === 128) couleur = u < -0.4 ? FER.clair : u > 0.5 ? FER.sombre : FER.fond;
      if (y === 134) couleur = PIERRE_CHAUDE.trou;
      if (Math.abs(dx) === DEMI) couleur = dx < 0 ? PIERRE_CHAUDE.clair : PIERRE_CHAUDE.joint;
      t.poser(x, y, couleur);
    }
  }
  for (const [r, demi] of [
    [118, 31],
    [119, 36],
    [120, 39],
    [121, 40],
  ] as const)
    t.rect(MEULE - demi, r, demi * 2 + 1, 1, (i) => (Math.abs(i - MEULE) < 6 - (121 - r) && r > 118 ? PIERRE_CHAUDE.trou : (i + r * 3) % 13 === 0 ? PIERRE_CHAUDE.fond : r === 118 ? PIERRE_CHAUDE.fond : PIERRE_CHAUDE.clair));
  pierres(t, PIERRE_CHAUDE, MEULE - 43, 135, 87, 9, {
    lit: 9,
    moellon: 22,
    graine: 6,
    ombre: (i) => (i > MEULE + 24 ? 1 : i < MEULE - 28 ? -1 : 0),
  });
  t.rect(MEULE - 43, 138, 87, 2, (i) => (i < MEULE - 18 ? FER.clair : i > MEULE + 22 ? FER.sombre : FER.fond));
  t.rect(MEULE - 44, 143, 89, 1, B.creux);
  // La farine qui s'amasse au bord des meules.
  for (let x = MEULE - 46; x <= MEULE + 46; x++) if (alea(x, 88) < 0.6) t.poser(x, 143, FARINE.clair);
  // La tranche du plateau : sa forte poutre, le bout de ses solives ; ses deux poteaux de devant et leurs liens.
  t.rect(94, PLATEAU + 1, 154, 8, (i, j) => (j === PLATEAU + 1 ? B.clair : j === PLATEAU + 8 ? B.creux : j === PLATEAU + 7 ? B.sombre : (i - 94) % 14 === 13 ? B.sombre : B.fond));
  for (let x = 100; x < 244; x += 12) t.rect(x, PLATEAU + 3, 4, 3, (i, j) => (i === x && j === PLATEAU + 3 ? B.clair : j === PLATEAU + 5 || i === x + 3 ? B.creux : B.sombre));
  for (const px of [97, 222]) {
    poteau(t, px, PLATEAU + 9, 7, DEVANT - PLATEAU - 12);
    ligature(t, px - 1, PLATEAU + 12, 9, 3);
    pierres(t, PIERRE_CHAUDE, px - 2, DEVANT - 5, 11, 5, {
      lit: 5,
      moellon: 6,
      graine: px,
    });
  }
  biais(t, 104, PLATEAU + 26, 118, PLATEAU + 9, 3);
  biais(t, 221, PLATEAU + 26, 207, PLATEAU + 9, 3);

  // L'escalier de meunier, du sol au plateau.
  for (let k = 0; k <= 48; k++) {
    const x = 246 + k;
    const y = PLATEAU + 2 + Math.round((k * (DEVANT - 6 - PLATEAU)) / 48);
    t.rect(x, y, 1, 5, (_i, j) => (j === y ? B.clair : j === y + 4 ? B.creux : B.fond));
    if (k % 6 === 3) {
      t.rect(x - 2, y + 2, 14, 2, (_i, j) => (j === y + 2 ? "#d0a468" : B.sombre));
      t.rect(x + 10, y + 2, 2, 2, B.creux);
    }
  }
  for (let k = 0; k <= 48; k++) {
    const x = 258 + k;
    const y = PLATEAU + 2 + Math.round((k * (DEVANT - 6 - PLATEAU)) / 48);
    t.rect(x, y, 1, 5, (_i, j) => (j === y ? B.clair : j === y + 4 ? B.creux : B.autre));
  }

  /* --- À droite : les sacs de farine, la pelle, le balai --- */
  sac(t, 332, FOND + 5, 16, 23);
  sac(t, 346, FOND + 6, 17, 25);
  sacCouche(t, 328, FOND + 17, 27, 11);
  sacCouche(t, 338, FOND + 8, 22, 10);
  sac(t, 392, FOND + 12, 15, 21);
  biais(t, 404, 150, 400, FOND + 4, 2);
  t.rect(398, FOND + 2, 9, 10, (i, j) => (j === FOND + 2 ? "#d9b98a" : i === 406 ? B.fond : "#c79a62"));

  // La lanterne du moulin, pendue à l'entrait.
  lanterne(t, 272, HAUT, 7, eclat);
  // L'entrait, d'un mur à l'autre.
  poutre(t, 64, ENTRAIT, 361, 7);
  for (const px of [206, 282]) ligature(t, px - 1, ENTRAIT + 1, 7, 5);

  // Les murs tranchés : la pierre en bas, le torchis en haut.
  for (const mx of [64, 412]) {
    pierres(t, PIERRE_CHAUDE, mx, SOUBASSEMENT, 16, DEVANT - SOUBASSEMENT + 1, {
      lit: 6,
      moellon: 9,
      graine: mx,
      ombre: () => 1,
    });
    t.rect(mx, ENTRAIT + 7, 16, SOUBASSEMENT - ENTRAIT - 7, (i, j) => ((i + j) % 4 === 0 ? J.mur.ombre : (j - HAUT) % 3 === 2 ? J.mur.trame : J.mur.sombre));
    t.rect(mx, SOUBASSEMENT - 3, 16, 4, (_i, j) => (j === SOUBASSEMENT - 3 ? B.fond : B.creux));
  }
  t.rect(64, ARBRE - 8, 16, 17, (_i, j) => (Math.abs(j - ARBRE) > 6 ? PIERRE_CHAUDE.trou : "#1a1410"));
  t.rect(64, ARBRE - 5, 20, 11, (_i, j) => {
    const r = j - ARBRE;
    return r === -5 ? B.clair : r === 5 ? B.creux : r < -2 ? B.autre : r > 2 ? B.sombre : B.fond;
  });

  // Le chaume du toit, vu par sa tranche ; ses bouquets de faîte.
  t.tel(() => {
    chaumeEnCoupe(t, p, 52, 436, toit, EPAIS);
    for (let x = 178; x <= 310; x++) {
      t.poser(x, toit(x) - 1, (x - 178) % 6 < 2 ? p.chaume.bord : p.chaume.rang);
      if ((x - 178) % 6 < 2) t.poser(x, toit(x) - 2, p.chaume.rang);
      if ((x - 178) % 12 === 0) t.poser(x, toit(x) - 3, p.chaume.clair);
    }
  });

  /* --- Dehors, à gauche : l'amenée d'eau, la roue vue par la tranche, le ruisseau --- */
  t.tel(() => {
    const b = p.bois;
    // Le ruisseau, et le fond de pierres.
    for (let y = DEVANT; y < MOULIN_H; y++) {
      for (let x = 0; x < 64; x++) {
        const r = y - DEVANT;
        if (r > 11) t.poser(x, y, (y - DEVANT) % 5 === 1 || (x + (r > 14 ? 4 : 0)) % 9 === 0 ? pierre.joint : alea(x >> 3, y >> 2) < 0.4 ? pierre.sombre : pierre.fond);
        else t.poser(x, y, r === 0 ? eau.clair : (x + n * 3 + r * 5) % 12 < 3 && r % 3 === 1 ? eau.clair : r > 7 ? eau.sombre : eau.fond);
      }
    }
    // L'arbre, de la roue au mur.
    t.rect(50, ARBRE - 5, 14, 11, (_i, j) => {
      const r = j - ARBRE;
      return r === -5 ? b.clair : r === 5 ? b.creux : r < -2 ? b.autre : r > 2 ? b.sombre : b.fond;
    });
    // La roue, vue par la tranche : deux jantes, le fond de planches, douze aubes qui descendent une à une.
    const R = 56;
    for (let dy = -R; dy <= R; dy++) {
      const y = ARBRE + dy;
      if (y > DEVANT + 6) continue;
      const angle = Math.asin(dy / R);
      const face = Math.cos(angle);
      let d = (((angle - tourne) % pas) + pas) % pas;
      if (d > pas / 2) d -= pas;
      const aube = Math.abs(d) * R;
      const retrait = Math.abs(dy) > R - 2 ? 4 : Math.abs(dy) > R - 5 ? 2 : Math.abs(dy) > R - 9 ? 1 : 0;
      const ombre = (1 - face) * 0.55 + (dy > 0 ? 0.12 : 0);
      for (let x = 10 + retrait; x <= 54 - retrait; x++) {
        const jante = x < 16 || x > 48;
        let couleur: string;
        if (jante) {
          couleur = x === 10 + retrait || x === 49 ? b.clair : x === 15 || x === 54 - retrait ? b.creux : aube < 1 ? b.creux : (x === 12 || x === 51) && aube < 2.5 ? c("#8d95a6", "#4a536c") : b.fond;
          couleur = melanger(couleur, b.creux, ombre * 0.7);
        } else if (aube < 1.7) couleur = melanger(d < 0 ? b.clair : b.autre, b.creux, ombre * 0.5);
        else if (aube < 3.6 && d > 0) couleur = melanger(b.creux, "#0a0c14", 0.3);
        else couleur = melanger((x - 16) % 8 === 7 ? b.creux : (x - 16) % 16 < 8 ? b.sombre : melanger(b.sombre, b.fond, 0.4), b.creux, 0.25 + ombre * 0.8);
        // L'eau que portent les aubes du haut, et celle qui en ruisselle.
        if (!jante && dy < -R * 0.5 && aube >= 1.7 && d < 0 && aube < 5.5) couleur = (x + y) % 3 === 0 ? eau.clair : eau.fond;
        if (!jante && dy > -R * 0.5 && dy < R * 0.62 && (x === 22 || x === 31 || x === 42) && (y * 2 + x - n * 3 + 600) % 12 < 5) couleur = eau.clair;
        if (y > DEVANT) couleur = melanger(couleur, eau.fond, 0.6);
        t.poser(x, y, couleur);
      }
    }
    // L'écume, là où la roue entre dans l'eau.
    for (let x = 6; x <= 58; x++) if ((x + n * 2) % 5 < 3) t.poser(x, DEVANT - (x % 7 === 0 ? 1 : 0), c("#e8f2f6", "#5a7a9a"));
    // L'auge de bois sur son chevalet, d'où l'eau tombe sur la roue.
    t.rect(3, 132, 4, DEVANT - 132, (i) => (i === 3 ? b.clair : i === 6 ? b.sombre : b.fond));
    t.trait(7, 152, 20, 133, b.sombre, 2);
    t.rect(0, 122, 30, 2, (_i, j) => (j === 122 ? eau.clair : eau.fond));
    t.rect(0, 124, 30, 8, (i, j) => (j === 124 ? b.clair : j === 131 ? b.creux : i % 12 === 11 ? b.sombre : b.fond));
    for (let y = 122; y < ARBRE - 56 + 4; y++) for (let x = 30; x <= 36; x++) if (!(x === 36 && y < 125)) t.poser(x, y, (y * 2 + x - n * 2 + 800) % 8 < 3 ? eau.clair : eau.fond);
  });

  // Dehors, à droite : une meule usée, appuyée au mur.
  t.tel(() => {
    t.disque(434, DEVANT - 9, 9, (dx, dy) => {
      const d = dx * dx + dy * dy;
      if (d <= 3) return pierre.trou;
      if (d > 66) return dx + dy < 0 ? pierre.fond : pierre.joint;
      if (d < 30 && d > 20) return pierre.sombre;
      return dx + dy < -5 ? pierre.clair : alea(dx + 50, dy + 50) < 0.1 ? pierre.sombre : pierre.fond;
    });
  });

  // La terre tranchée sous le moulin, et ses fondations de pierre.
  t.tel(() => {
    for (let y = DEVANT + 1; y < MOULIN_H; y++) {
      for (let x = 64; x < MOULIN_L; x++) {
        const r = y - DEVANT - 1;
        const a = alea(x, y + 900);
        let couleur: string = r > 9 ? p.terre.sombre : r > 3 ? p.terre.fond : p.terre.claire;
        if (a < 0.1) couleur = p.terre.sombre;
        else if (a > 0.93) couleur = p.terre.claire;
        if (x >= 428 && r === 0) couleur = p.herbe.claire;
        if (x >= 428 && r === 1) couleur = p.herbe.fond;
        if (x < 82 || (x >= 410 && x < 430)) {
          const lit = Math.floor(r / 6);
          couleur = r % 6 === 5 || (x + (lit % 2) * 5) % 10 === 0 ? pierre.joint : alea(Math.floor((x + (lit % 2) * 5) / 10), lit + 3) < 0.4 ? pierre.sombre : pierre.fond;
        }
        t.poser(x, y, couleur);
      }
    }
    t.rect(82, DEVANT + 1, 328, 2, (_i, j) => (j === DEVANT + 1 ? pierre.clair : pierre.joint));
    for (let k = 0; k < 22; k++) {
      const cxp = 90 + Math.floor(alea(k, 71) * 316);
      const cyp = DEVANT + 6 + Math.floor(alea(k, 72) * 9);
      const rx = 2 + Math.floor(alea(k, 73) * 3);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -rx; dx <= rx; dx++) if (Math.abs(dx) < rx || dy === 0) t.poser(cxp + dx, cyp + dy, dy < 0 ? pierre.clair : dy > 0 ? pierre.sombre : pierre.fond);
    }
  });

  return finir(t, l, {
    foyers: [{ x: 272, y: HAUT + 16, rayon: 170, force: 1 }],
    penombre: 0.55,
    // Le jour entre par la fenêtre et pose un pan clair sur les dalles.
    rayons: (x, y, sol) => {
      if (!sol) return 0;
      const k = x - 318 - (y - FOND) * 1.4;
      return k > 0 && k < 30 ? 0.24 * Math.min(1, k / 4, (30 - k) / 4) : 0;
    },
    ombre: (x, y) => {
      // Sous le plateau, l'ombre ; plus claire vers le devant.
      if (x > 98 && x < 244 && y > PLATEAU + 8 && y <= DEVANT) return 0.26 - 0.1 * borner((y - FOND) / 20);
      return y >= HAUT && y <= DEVANT && x >= 80 && x <= 412 ? 0.04 + 0.08 * borner((x - 250) / 160) : 0;
    },
  });
}

/* ---------- Le lot ---------- */

export const INTERIEURS_LOT_1: Readonly<Partial<Record<InterieurId, DessinDInterieur>>> = {
  four: {
    id: "four",
    titre: "Dans le fournil",
    largeur: FOUR_L,
    hauteur: FOUR_H,
    images: FOUR_IMAGES,
    place: { x: 186, pied: 213 },
    dessiner: (lumiere, image) => four(lumiere, image),
  },
  tour: {
    id: "tour",
    titre: "En haut de la tour de guet",
    largeur: TOUR_L,
    hauteur: TOUR_H,
    images: TOUR_IMAGES,
    place: { x: 190, pied: 232 },
    dessiner: (lumiere, image) => tour(lumiere, image),
  },
  grenier: {
    id: "grenier",
    titre: "Dans le grenier",
    largeur: GRENIER_L,
    hauteur: GRENIER_H,
    images: GRENIER_IMAGES,
    place: { x: 152, pied: 203 },
    dessiner: (lumiere, image) => grenier(lumiere, image),
  },
  moulin: {
    id: "moulin",
    titre: "Dans le moulin",
    largeur: MOULIN_L,
    hauteur: MOULIN_H,
    images: MOULIN_IMAGES,
    place: { x: 312, pied: 241 },
    dessiner: (lumiere, image) => moulin(lumiere, image),
  },
};
