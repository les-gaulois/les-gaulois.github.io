/**
 * Lot C des bâtiments du village : l'étable, la halle du marché, le grand chêne, le rempart de pierre, la grande tour du
 * clan. Dessinés case par case pour ce site, à l'échelle des Gaulois (48 × 64 cases), sans emprunt à une œuvre existante.
 * Les matières et les couleurs sont celles du village (`decor.ts`) : bois, chaume, torchis, pierre. La lumière vient d'en
 * haut à gauche. Les couleurs suivent l'heure ; seules les lanternes et les fenêtres gardent la leur, sans jamais bouger.
 * Deux mouvements lents : la bête de l'étable baisse la tête, le feuillage du chêne respire. Design : Claude Fable 5.2.
 */
import type { BatimentId } from "../chantier-liste";
import { Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import type { DessinDeBatiment } from "./type";

/** Les couleurs du clan, comme dans la salle de réunion : bleu, blanc, rouge, sur le bleu nuit du blason. */
const TRICOLORE = ["#2456b8", "#e8e6e0", "#c8283a"] as const;
const BLEU_NUIT = "#1c2a5e";
/** Ce vers quoi tire une couleur du dehors la nuit, quand elle n'a pas sa teinte de nuit dans `decor.ts`. */
const OMBRE_DE_NUIT = "#141c34";
const LUEUR = "#f5a83a";
const FLAMME = "#ffd75a";

/** Les matières à une lumière donnée : celles du village, plus la pierre sèche et les tuiles de bois. */
function matieres(l: Lumiere) {
  const p = paletteDuDehors(l);
  const t = (couleur: string): string => couleurDuDehors(couleur, melanger(couleur, OMBRE_DE_NUIT, 0.4), l);
  return {
    p,
    t,
    /** La force des lumières : nulle en plein jour, entière à la nuit (comme la porte des huttes). */
    lueur: Math.min(1, Math.max(0, (0.8 - l.jour) / 0.5)),
    pierre: { clair: t("#aaa392"), fond: t("#958e7f"), autre: t("#8b8576"), sombre: t("#787164"), joint: t("#5e584e"), mousse: t("#74894e") },
    tuile: { clair: t("#a98458"), fond: t("#8f6c48"), autre: t("#84623f"), sombre: t("#6c4e34"), joint: t("#553c28") },
    fer: t("#5c6474"),
  };
}
type Matieres = ReturnType<typeof matieres>;
type Pierre = Matieres["pierre"];
type Tuile = Matieres["tuile"];
type Etendue = (y: number) => readonly [number, number];
type Finir = (x: number, y: number, couleur: string) => string;

/** Mêle une couleur aux cases déjà posées d'un rectangle : une ombre portée, une patine. Les cases vides le restent. */
function voiler(P: Planche, x: number, y: number, l: number, h: number, couleur: string, part: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + l; i++) {
      const fond = P.lire(i, j);
      if (fond) P.poser(i, j, melanger(fond, couleur, part));
    }
  }
}

/** La lueur fixe d'une lanterne sur ce qui l'entoure : elle ne touche que les cases déjà posées. */
function halo(P: Planche, cx: number, cy: number, r: number, force: number): void {
  if (force <= 0) return;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      const fond = P.lire(cx + dx, cy + dy);
      if (d < 1 && fond) P.poser(cx + dx, cy + dy, melanger(fond, LUEUR, force * 0.45 * (1 - d)));
    }
  }
}

/** Une petite lanterne : un toit, une vitre de corne, un pied. Sa vitre s'allume quand le jour baisse. */
function lanterne(P: Planche, m: Matieres, x: number, y: number): void {
  halo(P, x + 2, y + 4, 13, m.lueur);
  const vitre = melanger(m.t("#b9a070"), FLAMME, m.lueur);
  const coeur = melanger(m.t("#c9b080"), "#fff1a8", m.lueur);
  P.rect(x + 2, y - 2, 1, 2, m.p.bois.creux);
  P.rect(x, y, 5, 1, m.p.bois.sombre);
  P.rect(x, y + 1, 5, 5, vitre);
  P.rect(x + 2, y + 2, 1, 3, coeur);
  P.rect(x, y + 1, 1, 5, m.p.bois.sombre);
  P.rect(x + 4, y + 1, 1, 5, m.p.bois.sombre);
  P.rect(x, y + 6, 5, 1, m.p.bois.sombre);
}

/** Des planches debout : un bord clair à gauche de chacune, un joint sombre à droite, un peu de fil. */
function planches(P: Planche, x: number, y: number, l: number, h: number, tons: { a: string; b: string; clair: string; joint: string }, pas = 5, dans?: (x: number, y: number) => boolean): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + l; i++) {
      if (dans && !dans(i, j)) continue;
      const rang = Math.floor((i - x) / pas);
      const col = (i - x) % pas;
      let couleur = rang % 2 === 0 ? tons.a : tons.b;
      if (col === pas - 1) couleur = tons.joint;
      else if (col === 0) couleur = tons.clair;
      else if (alea(i, (j >> 2) + rang * 7) < 0.07) couleur = tons.joint;
      P.poser(i, j, couleur);
    }
  }
}

/** Un poteau ou une poutre debout : clair à gauche, sombre à droite, quelques nœuds. */
function poteau(P: Planche, m: Matieres, x: number, y: number, l: number, h: number): void {
  const { bois } = m.p;
  P.rect(x, y, l, h, (i, j) => {
    if (i === x) return bois.clair;
    if (i === x + l - 1) return bois.sombre;
    if (alea(i, j >> 1) < 0.06) return bois.sombre;
    return i - x < l / 2 ? bois.autre : bois.fond;
  });
}

/** Une poutre couchée : claire dessus, sombre dessous. */
function poutre(P: Planche, m: Matieres, x: number, y: number, l: number, h: number): void {
  const { bois } = m.p;
  P.rect(x, y, l, h, (i, j) => {
    if (j === y) return bois.clair;
    if (j === y + h - 1) return bois.sombre;
    return alea(i >> 2, j) < 0.1 ? bois.fond : bois.autre;
  });
}

/** Un mur de torchis, comme celui des huttes : une trame toutes les trois rangées. */
function torchis(P: Planche, m: Matieres, x: number, y: number, l: number, h: number, dans?: (x: number, y: number) => boolean): void {
  const { mur } = m.p;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + l; i++) {
      if (dans && !dans(i, j)) continue;
      const a = alea(i, j + 40);
      let couleur = a < 0.05 ? mur.clair : a > 0.95 ? mur.sombre : mur.fond;
      if ((j - y) % 3 === 2) couleur = alea(i >> 1, j) < 0.7 ? mur.trame : mur.fond;
      P.poser(i, j, couleur);
    }
  }
}

/** Du chaume en rangs, clair à gauche, sombre à droite, comme le toit des huttes. `etendue` : la première et la dernière case de chaque rangée. */
function chaume(P: Planche, m: Matieres, y0: number, y1: number, etendue: Etendue, graine: number): void {
  const c = m.p.chaume;
  for (let y = y0; y <= y1; y++) {
    const [g, d] = etendue(y);
    for (let x = g; x <= d; x++) {
      // Les deux passages de teinte se mêlent grain à grain, pour ne pas tracer de barre.
      const rel = (x - g) / Math.max(1, d - g) + (alea(x, y + graine * 13) - 0.5) * 0.2;
      let couleur = rel < 0.28 ? c.clair : rel > 0.72 ? c.sombre : c.fond;
      if ((y - y0) % 6 === 5) couleur = c.rang;
      else if (alea(x, (y >> 1) + graine) < 0.14) couleur = c.brin;
      if (x === g || x === d || y === y1) couleur = c.bord;
      P.poser(x, y, couleur);
    }
  }
}

/** Des tuiles de bois en écailles, par rangs de cinq cases qui se décalent d'un rang à l'autre. */
function tuiles(P: Planche, tu: Tuile, y0: number, y1: number, etendue: Etendue, graine: number, finir?: Finir): void {
  for (let y = y0; y <= y1; y++) {
    const [g, d] = etendue(y);
    const rang = Math.floor((y - y0) / 5);
    const dans = (y - y0) % 5;
    const decalage = rang % 2 === 0 ? 0 : 3;
    for (let x = g; x <= d; x++) {
      const col = (((x + decalage) % 6) + 6) % 6;
      const ton = alea(Math.floor((x + decalage) / 6), rang + graine);
      let couleur = ton < 0.22 ? tu.clair : ton < 0.62 ? tu.fond : ton < 0.9 ? tu.autre : tu.sombre;
      if (dans === 4 || (dans === 3 && (col === 0 || col === 4))) couleur = tu.joint;
      else if (col === 5) couleur = tu.sombre;
      else if (dans === 0 && ton < 0.62) couleur = tu.clair;
      P.poser(x, y, finir ? finir(x, y, couleur) : couleur);
    }
  }
}

/** Un mur de pierres sèches : des assises inégales, des pierres de toutes largeurs, aux coins arrondis, sans mortier. */
function pierres(P: Planche, pi: Pierre, x0: number, y0: number, l: number, h: number, graine: number, dans?: (x: number, y: number) => boolean, finir?: Finir): void {
  let y = y0;
  for (let rang = 0; y < y0 + h; rang++) {
    // Les assises du bas sont plus hautes : on pose les grosses pierres d'abord.
    const bas = y > y0 + h - 22 ? 2 : 0;
    const haut = Math.min(y0 + h - y, 5 + bas + Math.floor(alea(rang, graine) * 3));
    let x = x0 - Math.floor(alea(rang, graine + 1) * 8);
    for (let k = 0; x < x0 + l; k++) {
      const large = 7 + bas + Math.floor(alea(k + rang * 31, graine + 2) * 8);
      const ton = alea(k + rang * 17, graine + 3);
      for (let j = 0; j < haut; j++) {
        for (let i = 0; i < large; i++) {
          const px = x + i;
          const py = y + j;
          if (px < x0 || px >= x0 + l || (dans && !dans(px, py))) continue;
          const coin = (i === 0 || i === large - 2) && (j === 0 || j === haut - 2);
          let couleur: string;
          if (i === large - 1 || j === haut - 1 || coin) couleur = pi.joint;
          else if (j === 0) couleur = ton < 0.7 ? pi.clair : pi.fond;
          else if (alea(px, py + graine) < 0.05) couleur = pi.sombre;
          else couleur = ton < 0.3 ? pi.autre : ton < 0.78 ? pi.fond : pi.sombre;
          P.poser(px, py, finir ? finir(px, py, couleur) : couleur);
        }
      }
      x += large;
    }
    y += haut;
  }
}

/** Un bouclier rond aux couleurs du clan, écartelé, avec sa bosse de fer. */
function bouclier(P: Planche, m: Matieres, cx: number, cy: number, r: number, a: string, b: string): void {
  P.disque(cx, cy, r, (dx, dy) => {
    const d = dx * dx + dy * dy;
    if (d > (r - 1) * (r - 1)) return m.p.bois.sombre;
    if (d <= 2) return m.fer;
    return m.t(dx * dy >= 0 ? a : b);
  });
}

/** Une grosse branche, d'un point à un autre, qui s'affine : claire dessus, sombre dessous. */
function branche(P: Planche, m: Matieres, x1: number, y1: number, x2: number, y2: number, r1: number, r2: number): void {
  const { tronc } = m.p;
  const pas = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  for (let k = 0; k <= pas; k++) {
    const part = k / pas;
    const r = Math.max(1, Math.round(r1 + (r2 - r1) * part));
    P.disque(Math.round(x1 + (x2 - x1) * part), Math.round(y1 + (y2 - y1) * part), r, (_dx, dy) => (dy < -r * 0.35 ? tronc.clair : dy > r * 0.3 ? tronc.sombre : tronc.fond));
  }
}

/* ---------- L'étable ---------- */

/**
 * La tête de la bête, de face. h corne, e oreille, F poil clair, f poil, d poil sombre, w liste blanche, m mufle,
 * n naseau, o œil.
 */
const TETE_DE_BETE = [
  "..h..................h..",
  ".hh..................hh.",
  ".hhh................hhh.",
  "..hhh.ffffffffffff.hhh..",
  "...hhFFfffwwwwfffffhh...",
  "eee.FFffffwwwwffffdd.eee",
  "eeeeFfffffwwwwfffffdeeee",
  ".eeeFfoofffwwfffoofdeee.",
  "....Ffoofffwwfffoofd....",
  "....FfffffwwwwfffffD....",
  "....FffffwwwwwwffffD....",
  ".....FfffwwwwwwfffD.....",
  ".....FffmmmmmmmmffD.....",
  ".....mmmmmmmmmmmmmm.....",
  ".....mmnnmmmmmmnnmm.....",
  ".....mmnnmmmmmmnnmm.....",
  "......mmmmmmmmmmmm......",
  ".......mmmmmmmmmm.......",
] as const;

const ETABLE: DessinDeBatiment = {
  largeur: 164,
  hauteur: 120,
  images: 2,
  dessiner(lumiere, image) {
    const m = matieres(lumiere);
    const { p, t } = m;
    const P = new Planche(this.largeur, this.hauteur);
    const pied = this.hauteur - 1;
    const murs = { a: p.bois.fond, b: p.bois.autre, clair: p.bois.clair, joint: p.bois.sombre };
    const vantail = { a: p.tronc.clair, b: melanger(p.tronc.clair, p.tronc.fond, 0.5), clair: p.bois.fond, joint: p.tronc.sombre };

    // Les murs : du torchis en haut, des planches en bas, une sablière entre les deux, des poteaux aux angles.
    torchis(P, m, 10, 44, 144, 42);
    planches(P, 10, 88, 144, pied - 87, murs);
    poutre(P, m, 10, 85, 144, 3);
    for (const x of [10, 149]) poteau(P, m, x, 44, 5, pied - 43);

    // La porte à deux vantaux : planches, deux traverses et une écharpe par vantail, entre deux poteaux.
    const porte = { x: 24, y: 48, l: 44 };
    planches(P, porte.x, porte.y, porte.l, pied - porte.y + 1, vantail, 4);
    for (const cote of [0, 1]) {
      const gx = porte.x + cote * 22;
      for (const ty of [porte.y + 8, pied - 14]) P.rect(gx + 1, ty, 20, 3, (_i, j) => (j === ty ? p.bois.clair : j === ty + 2 ? p.tronc.sombre : p.bois.fond));
      // L'écharpe : de la traverse du bas, côté gonds, à celle du haut, côté milieu.
      for (let k = 0; k < 44; k++) {
        const ex = cote === 0 ? gx + 2 + Math.round((k * 17) / 43) : gx + 19 - Math.round((k * 17) / 43);
        P.rect(ex, pied - 15 - k, 2, 1, p.bois.fond);
      }
    }
    P.rect(porte.x + 21, porte.y, 2, pied - porte.y + 1, p.tronc.sombre);
    P.rect(porte.x + 18, porte.y + 34, 2, 5, m.fer);
    P.rect(porte.x + 24, porte.y + 34, 2, 5, m.fer);
    for (const x of [porte.x - 4, porte.x + porte.l]) poteau(P, m, x, 44, 4, pied - 43);
    poutre(P, m, porte.x - 4, 44, porte.l + 8, 4);

    // La baie de la bête : le dedans sombre, la bête qui regarde dehors, un appui de bois.
    const baie = { x: 92, y: 58, l: 40, h: 34 };
    P.rect(baie.x, baie.y, baie.l, baie.h, (i, j) => (alea(i >> 1, j >> 1) < 0.12 ? p.tronc.sombre : p.bois.creux));
    // Le râtelier au fond : quelques brins de foin qui dépassent.
    P.rect(baie.x + 28, baie.y + 6, 12, 2, p.tronc.sombre);
    P.rect(baie.x + 29, baie.y + 2, 11, 4, (i, j) => (alea(i, j) < 0.55 ? p.chaume.sombre : alea(i, j) < 0.75 ? p.chaume.brin : null));
    const tx = baie.x + 4 + (image === 1 ? 1 : 0);
    const ty = baie.y + 4 + (image === 1 ? 4 : 0);
    const robe = { f: t("#b47a48"), F: t("#c68d58"), d: t("#99653d"), D: t("#99653d"), w: t("#eadcc2"), m: t("#d7b5a2"), n: t("#8a5a4a"), o: t("#3a261a"), h: t("#e2d8be"), e: t("#8f5c3a") };
    // L'encolure, puis la tête par-dessus.
    P.rect(tx + 5, ty + 12, 15, baie.y + baie.h - ty - 12, (i) => (i < tx + 8 ? robe.f : i > tx + 16 ? t("#85563a") : robe.d));
    P.lettres(tx, ty, TETE_DE_BETE, robe);
    for (const x of [baie.x - 3, baie.x + baie.l]) poteau(P, m, x, baie.y - 3, 3, baie.h + 3);
    poutre(P, m, baie.x - 3, baie.y - 3, baie.l + 6, 3);
    poutre(P, m, baie.x - 5, baie.y + baie.h, baie.l + 10, 3);

    // L'ombre du toit sur le haut du mur.
    voiler(P, 10, 44, 144, 4, p.bois.creux, 0.38);
    voiler(P, 10, 48, 144, 3, p.bois.creux, 0.18);

    // Le toit de chaume : un long pan, un faîte de paille liée, une frange inégale au bord.
    const debord = (y: number): number => Math.round(26 * (1 - (y - 6) / 40));
    chaume(P, m, 6, 46, (y) => [debord(y), this.largeur - 1 - debord(y)], 3);
    for (let x = 0; x < this.largeur; x++) {
      const brin = alea(x, 77);
      if (brin < 0.55) P.poser(x, 47, p.chaume.bord);
      if (brin < 0.2) P.poser(x, 48, p.chaume.brin);
    }
    P.rect(24, 3, this.largeur - 48, 4, (i, j) => (j === 3 ? p.chaume.clair : j === 6 ? p.chaume.bord : (i - 24) % 14 < 2 ? p.bois.cordeSombre : p.chaume.rang));
    P.rect(25, 2, this.largeur - 50, 1, (i) => ((i - 24) % 14 < 2 ? p.bois.corde : alea(i, 5) < 0.5 ? p.chaume.clair : null));

    // La fourche, posée contre le mur entre la porte et la baie.
    for (let y = 70; y <= pied; y++) P.poser(78 + Math.round(((pied - y) * 4) / 49), y, p.bois.clair);
    P.rect(80, 69, 5, 1, m.fer);
    for (const x of [80, 82, 84]) P.rect(x, 62, 1, 7, m.fer);

    // La lanterne de la porte.
    lanterne(P, m, 72, 58);

    // L'abreuvoir sous la baie : un tronc creusé posé sur deux pieds, de l'eau à ras bord.
    const eau = t("#5c9bc4");
    P.rect(86, 104, 50, 11, (i, j) => (j === 104 ? p.bois.clair : j === 114 ? p.bois.sombre : j === 109 ? p.bois.fond : i < 89 ? p.bois.clair : i > 132 ? p.bois.sombre : p.bois.autre));
    P.rect(89, 104, 44, 2, (i, j) => (j === 104 && alea(i >> 1, 9) < 0.3 ? t("#8cc0de") : eau));
    for (const x of [90, 128]) P.rect(x, 115, 4, 5, (i) => (i === x ? p.bois.fond : p.bois.sombre));

    // Le foin : une meule contre le pignon.
    const meule = { x: 147, r: 16, h: 30 };
    for (let y = pied - meule.h; y <= pied; y++) {
      const demi = Math.round(meule.r * Math.sqrt(1 - ((pied - y) / (meule.h + 1)) ** 2));
      for (let x = meule.x - demi; x <= meule.x + demi; x++) {
        const rel = (x - meule.x) / (demi + 1);
        let couleur = rel < -0.3 ? p.chaume.clair : rel > 0.45 ? p.chaume.sombre : p.chaume.fond;
        if (alea(x, y >> 1) < 0.2) couleur = p.chaume.brin;
        if (Math.abs(x - meule.x) === demi || y === pied - meule.h) couleur = p.chaume.bord;
        P.poser(x, y, couleur);
      }
    }
    for (const [dx, dy] of [[-6, -32], [3, -33], [9, -31], [-15, -18], [16, -20]] as const) P.rect(meule.x + dx, pied + dy, 1, 2, p.chaume.brin);
    return P.decor();
  },
};

/* ---------- La halle du marché ---------- */

const HALLE: DessinDeBatiment = {
  largeur: 240,
  hauteur: 150,
  images: 1,
  dessiner(lumiere) {
    const m = matieres(lumiere);
    const { p, t } = m;
    const L = this.largeur;
    const P = new Planche(L, this.hauteur);
    const sol = this.hauteur - 4;
    const poteaux = [10, 63, 116, 169, 222];

    // Le dessous du toit, puis les poteaux du fond, plus minces et dans l'ombre.
    P.rect(8, 62, L - 16, 3, (_i, j) => (j === 64 ? p.tronc.sombre : p.bois.creux));
    for (const x of poteaux.slice(0, -1)) {
      P.rect(x + 28, 65, 5, sol - 67, (i) => (i === x + 28 ? p.tronc.fond : p.tronc.sombre));
      P.rect(x + 27, sol - 3, 7, 2, m.pierre.sombre);
    }

    // Le sol de terre battue, bordé de galets.
    P.rect(2, sol, L - 4, 4, (i, j) => {
      const a = alea(i, j + 20);
      if (j === sol) return i % 9 < 6 ? m.pierre.fond : m.pierre.joint;
      return a < 0.1 ? p.terre.claire : a > 0.88 ? p.terre.sombre : p.terre.fond;
    });

    // Une corde de fanions aux couleurs du clan sous la poutre, d'un poteau à l'autre, derrière les aisseliers.
    for (let k = 0; k + 1 < poteaux.length; k++) {
      const de = poteaux[k]! + 11;
      const a = poteaux[k + 1]! - 2;
      P.rect(de - 3, 65, a - de + 5, 1, p.bois.cordeSombre);
      for (let x = de, n = k; x + 5 <= a; x += 8, n++) {
        const couleur = t(TRICOLORE[n % 3]!);
        P.rect(x, 66, 5, 2, couleur);
        P.rect(x + 1, 68, 3, 1, couleur);
        P.poser(x + 2, 69, couleur);
      }
    }

    // Les gros poteaux du devant, sur leur dé de pierre, et leurs aisseliers.
    for (const x of poteaux) {
      for (const cote of [-1, 1]) {
        for (let k = 0; k < 20; k++) {
          const bx = cote < 0 ? x - 1 - k : x + 8 + k;
          P.rect(bx, 81 - k, 1, 4, (_i, j) => (j === 81 - k ? p.bois.clair : j === 84 - k ? p.bois.sombre : p.bois.fond));
        }
      }
      poteau(P, m, x, 62, 8, sol - 64);
      P.rect(x - 2, sol - 3, 12, 4, (i, j) => (j === sol - 3 ? m.pierre.clair : i === x + 9 ? m.pierre.joint : m.pierre.fond));
    }
    // Ce qui pend aux aisseliers : des tresses d'oignons et des bouquets d'herbes à sécher.
    for (const [x, sorte] of [[poteaux[0]! + 21, 0], [poteaux[1]! - 14, 1], [poteaux[3]! + 21, 1], [poteaux[4]! - 14, 0]] as const) {
      P.rect(x, 72, 1, 3, p.bois.corde);
      if (sorte === 0) {
        for (let k = 0; k < 4; k++) P.rect(x - 1 + (k % 2), 75 + k * 3, 3, 3, (i, j) => (j === 75 + k * 3 && i === x - 1 + (k % 2) ? t("#e2b070") : k % 2 === 0 ? t("#c98a48") : t("#b0703a")));
      } else {
        P.rect(x - 2, 75, 5, 8, (i, j) => (alea(i, j) < 0.3 ? p.feuilles.sombre : alea(i, j) < 0.65 ? p.feuilles.fond : t("#8fa860")));
        P.rect(x - 1, 83, 3, 2, p.feuilles.sombre);
      }
    }
    for (const x of [poteaux[1]!, poteaux[3]!]) lanterne(P, m, x + 2, 90);

    // La sablière : la grosse poutre qui porte le toit.
    poutre(P, m, 6, 56, L - 12, 6);
    for (const x of poteaux) P.rect(x + 3, 58, 2, 2, p.bois.creux);

    // Le grand toit de tuiles de bois, à quatre pans.
    const retrait = (y: number): number => Math.round(44 * (1 - (y - 8) / 45));
    tuiles(P, m.tuile, 8, 53, (y) => [retrait(y), L - 1 - retrait(y)], 11, (x, y, couleur) => {
      const g = retrait(y);
      const rel = (x - g) / (L - 1 - 2 * g);
      if (x <= g + 1) return m.tuile.clair;
      if (x >= L - 2 - g) return m.tuile.joint;
      // Les deux croupes, à gauche dans la lumière, à droite dans l'ombre.
      if (x - g < (y - 8) * 0.5) return melanger(couleur, m.tuile.clair, 0.35);
      if (L - 1 - g - x < (y - 8) * 0.5) return melanger(couleur, m.tuile.joint, 0.35);
      return rel > 0.6 ? melanger(couleur, m.tuile.sombre, 0.25) : couleur;
    });
    P.rect(0, 54, L, 1, m.tuile.joint);
    P.rect(3, 55, L - 6, 1, p.bois.creux);
    // Le faîte et ses deux épis croisés.
    P.rect(42, 5, L - 84, 3, (_i, j) => (j === 5 ? p.bois.clair : j === 7 ? p.bois.sombre : p.bois.fond));
    for (const x of [43, L - 44]) {
      for (let k = 1; k <= 5; k++) {
        P.poser(x - k, 5 - k, p.bois.fond);
        P.poser(x + k, 5 - k, p.bois.fond);
      }
    }

    // Le fronton du milieu : un petit pignon de torchis, deux rives de bois, le bouclier du clan.
    const fx = 119;
    for (let y = 14; y <= 53; y++) {
      const demi = Math.round(((y - 14) * 28) / 39);
      for (let x = fx - demi; x <= fx + 1 + demi; x++) {
        const bord = Math.min(x - (fx - demi), fx + 1 + demi - x);
        let couleur: string;
        if (bord < 4) couleur = bord === 0 ? p.bois.clair : bord === 3 ? p.bois.creux : x < fx ? p.bois.autre : p.bois.fond;
        else if (bord < 6) couleur = p.mur.ombre;
        else couleur = (y - 14) % 3 === 2 ? p.mur.trame : alea(x, y) < 0.05 ? p.mur.clair : p.mur.fond;
        P.poser(x, y, couleur);
      }
    }
    P.rect(fx - 1, 9, 4, 6, (i) => (i === fx - 1 ? p.bois.clair : p.bois.fond));
    bouclier(P, m, fx - 9, 42, 7, TRICOLORE[0], TRICOLORE[1]);
    bouclier(P, m, fx + 10, 42, 7, TRICOLORE[2], TRICOLORE[1]);
    return P.decor();
  },
};

/* ---------- Le grand chêne ---------- */

/** Les boules du feuillage, du fond vers le devant. `fond` : dans l'ombre de la ramure. Centre du tronc en x = 0. */
const RAMURE: readonly { x: number; y: number; r: number; fond?: true }[] = [
  { x: -70, y: 78, r: 19, fond: true },
  { x: -42, y: 85, r: 19, fond: true },
  { x: -10, y: 84, r: 17, fond: true },
  { x: 22, y: 82, r: 16, fond: true },
  { x: 46, y: 72, r: 18, fond: true },
  { x: 74, y: 66, r: 18, fond: true },
  { x: 90, y: 58, r: 12, fond: true },
  { x: -86, y: 60, r: 16 },
  { x: -62, y: 52, r: 23 },
  { x: -28, y: 58, r: 24 },
  { x: 6, y: 58, r: 24 },
  { x: 36, y: 50, r: 23 },
  { x: 64, y: 46, r: 21 },
  { x: 86, y: 48, r: 15 },
  { x: -76, y: 42, r: 14 },
  { x: -50, y: 32, r: 20 },
  { x: -22, y: 27, r: 22 },
  { x: 8, y: 24, r: 22 },
  { x: 36, y: 29, r: 20 },
  { x: 60, y: 35, r: 16 },
  { x: -38, y: 47, r: 15 },
  { x: -6, y: 43, r: 17 },
  { x: 24, y: 45, r: 15 },
  { x: 52, y: 57, r: 13 },
  { x: -64, y: 69, r: 13 },
  { x: -20, y: 72, r: 14 },
  { x: 12, y: 73, r: 12 },
];

const CHENE: DessinDeBatiment = {
  largeur: 212,
  hauteur: 170,
  images: 3,
  dessiner(lumiere, image) {
    const m = matieres(lumiere);
    const { p } = m;
    const P = new Planche(this.largeur, this.hauteur);
    const pied = this.hauteur - 1;
    const cx = 105;
    const verts = [melanger(p.feuilles.sombre, p.bois.creux, 0.3), p.feuilles.sombre, p.feuilles.fond, p.feuilles.claire, melanger(p.feuilles.claire, p.chaume.clair, 0.3)] as const;

    // Le souffle : à chaque image, une boule sur trois s'écarte d'une case du cœur de la ramure, puis revient.
    const boules = RAMURE.map((b, i) => {
      const bouge = image > 0 && i % 3 === image;
      const dx = bouge ? Math.sign(b.x) * (Math.abs(b.x) > 20 ? 1 : 0) : 0;
      const dy = bouge && b.y < 50 ? -1 : 0;
      return { ...b, x: cx + b.x + dx, y: b.y + dy };
    });
    const feuillage = (liste: typeof boules): void => {
      for (let y = 0; y < 108; y++) {
        for (let x = 0; x < this.largeur; x++) {
          let boule: (typeof boules)[number] | undefined;
          for (let k = liste.length - 1; k >= 0 && !boule; k--) {
            const b = liste[k]!;
            if ((x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) <= b.r * b.r) boule = b;
          }
          if (!boule) continue;
          // La lumière vient d'en haut à gauche ; les feuilles vont par touffes de deux cases.
          const ombre = Math.hypot((x - boule.x) / boule.r + 0.35, (y - boule.y) / boule.r + 0.35) + (alea(x, y + 7) - 0.5) * 0.16;
          const base = boule.fond ? 0 : 1;
          let ton = ombre < 0.62 ? base + 2 : ombre > 1.1 ? base : base + 1;
          const touffe = alea((x + (y >> 1)) >> 1, y >> 1);
          if (touffe < 0.1) ton = Math.max(0, ton - 1);
          else if (touffe > 0.9) ton = Math.min(4, ton + 1);
          if (boule.fond && ton > 2) ton = 2;
          P.poser(x, y, verts[ton]!);
        }
      }
    };

    feuillage(boules.filter((b) => b.fond));

    // Les maîtresses branches : deux qui partent à gauche, une qui monte, et la longue branche de la balançoire.
    branche(P, m, cx - 4, 98, cx - 48, 76, 9, 5);
    branche(P, m, cx - 48, 76, cx - 84, 66, 5, 2);
    branche(P, m, cx + 1, 96, cx + 3, 60, 11, 6);
    branche(P, m, cx + 6, 102, cx + 34, 92, 8, 6);
    branche(P, m, cx + 34, 92, cx + 62, 89, 6, 4);
    branche(P, m, cx + 62, 89, cx + 93, 80, 4, 2);
    // Un chicot : une branche morte, cassée il y a longtemps.
    branche(P, m, cx - 18, 114, cx - 32, 105, 3, 2);
    P.rect(cx - 34, 103, 2, 2, p.tronc.clair);

    // Le tronc : large, évasé en racines, bosselé de nœuds, creusé de sillons qui ondulent.
    const demi = (y: number, cote: -1 | 1): number => {
      const h = pied - y;
      let d = h < 14 ? 21 + (14 - h) * 1.2 : 21 - Math.min(3, (h - 14) / 14);
      if (y < 108) d += (108 - y) * 0.3;
      d += 3.5 * Math.exp(-(((y - (cote < 0 ? 138 : 116)) / 6) ** 2));
      return Math.round(d);
    };
    const creux = melanger(p.tronc.sombre, p.bois.creux, 0.55);
    for (let y = 84; y <= pied; y++) {
      const g = cx - demi(y, -1);
      const d = cx + demi(y, 1);
      for (let x = g; x <= d; x++) {
        const rel = (x - cx) / (x < cx ? cx - g : d - cx);
        let couleur = rel < -0.4 ? p.tronc.clair : rel > 0.3 ? p.tronc.sombre : p.tronc.fond;
        const sillon = (((x + Math.round(2.2 * Math.sin(y / 9 + x / 6))) % 6) + 6) % 6 === 0;
        if (sillon) couleur = rel > 0.3 ? creux : rel < -0.4 ? p.tronc.fond : p.tronc.sombre;
        else if (alea(x, y >> 2) < 0.06) couleur = rel < -0.4 ? p.tronc.fond : p.tronc.sombre;
        if (x === d && y > 106) couleur = creux;
        // La mousse du pied, du côté de l'ombre des maisons.
        if (y > 138 && rel < -0.25 && alea(x >> 1, y >> 1) < 0.3 + (y - 138) * 0.012) couleur = m.pierre.mousse;
        P.poser(x, y, couleur);
      }
    }
    // Les racines qui courent sur le sol.
    for (const [de, a, cote] of [[cx - 39, cx - 56, -1], [cx + 39, cx + 53, 1]] as const) {
      for (let x = Math.min(de, a); x <= Math.max(de, a); x++) {
        const haut = Math.max(1, Math.round(6 * (1 - Math.abs(x - de) / Math.abs(a - de))));
        P.rect(x, pied - haut + 1, 1, haut, (_i, j) => (j === pied - haut + 1 ? (cote < 0 ? p.tronc.clair : p.tronc.fond) : cote < 0 ? p.tronc.fond : p.tronc.sombre));
      }
    }
    // Le creux du tronc et deux vieux nœuds.
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const d = (dx / 5) ** 2 + (dy / 8) ** 2;
        if (d <= 1) P.poser(cx + 3 + dx, 127 + dy, d > 0.62 ? (dx + dy < 0 ? p.tronc.sombre : p.tronc.clair) : p.bois.creux);
      }
    }
    for (const [nx, ny] of [[cx - 9, 152], [cx + 9, 104]] as const) P.disque(nx, ny, 3, (dx, dy) => (dx * dx + dy * dy > 5 ? p.tronc.sombre : dx * dx + dy * dy < 2 ? creux : p.tronc.clair));

    feuillage(boules.filter((b) => !b.fond));

    // La balançoire : deux cordes nouées à la branche, une planche.
    for (const x of [cx + 54, cx + 70]) {
      P.rect(x - 1, 83, 3, 1, p.bois.corde);
      P.rect(x - 1, 84, 1, 10, p.bois.cordeSombre);
      P.rect(x + 1, 84, 1, 10, p.bois.cordeSombre);
      for (let y = 94; y < 147; y++) P.poser(x, y, y % 4 === 0 ? p.bois.cordeSombre : p.bois.corde);
    }
    P.rect(cx + 50, 147, 25, 3, (_i, j) => (j === 147 ? p.bois.clair : j === 149 ? p.bois.sombre : p.bois.autre));

    // Le banc, à l'ombre, de l'autre côté : une demi-bille de bois sur deux billots.
    P.rect(cx - 92, 155, 40, 4, (i, j) => (j === 155 ? p.bois.clair : j === 158 ? p.bois.sombre : alea(i >> 2, j) < 0.15 ? p.bois.fond : p.bois.autre));
    for (const x of [cx - 88, cx - 62]) P.rect(x, 159, 6, 11, (i, j) => (i === x ? p.tronc.clair : i === x + 5 ? p.tronc.sombre : j === 159 ? p.bois.creux : p.tronc.fond));
    return P.decor();
  },
};

/* ---------- Le rempart de pierre ---------- */

const REMPART: DessinDeBatiment = {
  largeur: 240,
  hauteur: 126,
  images: 1,
  dessiner(lumiere) {
    const m = matieres(lumiere);
    const { p } = m;
    const L = this.largeur;
    const P = new Planche(L, this.hauteur);
    const pied = this.hauteur - 1;
    const hourd = { a: p.bois.fond, b: p.bois.autre, clair: p.bois.clair, joint: p.bois.sombre };
    const ronde = 22;

    // Le parapet de bois et ses créneaux : un merlon de planches, un vide, un merlon.
    planches(P, 2, 11, L - 4, ronde - 11, hourd);
    P.rect(2, 10, L - 4, 1, p.bois.clair);
    for (let x = 6, k = 0; x + 16 <= L - 2; x += 29, k++) {
      planches(P, x, 1, 16, 10, hourd, 4);
      P.rect(x - 1, 0, 18, 1, p.bois.clair);
      P.rect(x - 1, 1, 18, 1, p.bois.sombre);
      if (k % 2 === 1) bouclier(P, m, x + 8, 12, 6, TRICOLORE[k % 4 === 1 ? 0 : 2], TRICOLORE[1]);
    }

    // Le mur de pierres sèches, un peu plus sombre vers le bas, verdi de mousse au pied.
    pierres(P, m.pierre, 4, ronde + 4, L - 8, pied - ronde - 3, 7, undefined, (x, y, couleur) => {
      if (y > pied - 26 && alea(x >> 1, (y >> 1) + 9) < (y - pied + 26) * 0.012) return m.pierre.mousse;
      return y < ronde + 9 ? melanger(couleur, m.pierre.joint, 0.4) : couleur;
    });
    // Les poutres prises dans le mur : on voit leurs bouts, en quinconce, comme des clous de bois.
    for (let rang = 0; rang < 3; rang++) {
      for (let x = 22 + (rang % 2) * 16; x < L - 24; x += 32) {
        const y = ronde + 22 + rang * 25;
        P.rect(x, y, 6, 6, (i, j) => {
          const bord = i === x || j === y;
          if (i === x + 5 || j === y + 5) return p.bois.creux;
          if (bord) return p.bois.clair;
          return (i - x === 2 || i - x === 3) && (j - y === 2 || j - y === 3) ? p.bois.sombre : p.bois.autre;
        });
      }
    }
    // Les deux gros poteaux des bouts.
    for (const x of [0, L - 7]) poteau(P, m, x, ronde, 7, pied - ronde + 1);

    // Le chemin de ronde : un plancher épais, porté par des corbeaux et leurs jambes de force.
    for (let x = 16; x < L - 16; x += 29) {
      P.rect(x, ronde + 4, 5, 5, (i, j) => (i === x ? p.bois.clair : i === x + 4 || j === ronde + 8 ? p.bois.sombre : p.bois.fond));
      for (let k = 0; k < 9; k++) P.rect(x + 1, ronde + 9 + k, 3, 1, k === 8 ? p.bois.sombre : p.bois.fond);
    }
    P.rect(0, ronde, L, 4, (i, j) => (j === ronde ? p.bois.clair : j === ronde + 3 ? p.bois.creux : i % 12 === 11 ? p.bois.sombre : p.bois.autre));

    // L'échelle qui monte au chemin de ronde.
    for (let y = 6; y <= pied; y++) {
      const x = 189 + Math.round(((pied - y) * 7) / (pied - 6));
      if ((pied - y) % 8 === 4) P.rect(x + 2, y, 9, 1, p.bois.autre);
      if ((pied - y) % 8 === 5) P.rect(x + 2, y, 9, 1, p.bois.sombre);
      P.rect(x, y, 2, 1, p.bois.clair);
      P.rect(x + 11, y, 2, 1, p.bois.fond);
    }
    // Deux lanternes, posées sur le chemin de ronde.
    for (const x of [58, 174]) lanterne(P, m, x, ronde - 7);
    // Quelques touffes d'herbe au pied.
    for (let x = 7; x < L - 7; x++) {
      const a = alea(x, 123);
      if (a < 0.3) P.poser(x, pied, p.herbe.claire);
      if (a < 0.1) P.poser(x, pied - 1, p.herbe.fond);
    }
    return P.decor();
  },
};

/* ---------- La grande tour du clan ---------- */

/** « GAL » en lettres de cinq cases sur sept. */
const LETTRES_DU_CLAN = [
  ".###...###..#....",
  "#...#.#...#.#....",
  "#.....#...#.#....",
  "#.###.#####.#....",
  "#...#.#...#.#....",
  "#...#.#...#.#....",
  ".###..#...#.#####",
] as const;

const GRANDE_TOUR: DessinDeBatiment = {
  largeur: 96,
  hauteur: 170,
  images: 1,
  dessiner(lumiere) {
    const m = matieres(lumiere);
    const { p, t } = m;
    const P = new Planche(this.largeur, this.hauteur);
    const pied = this.hauteur - 1;
    const cx = 46;
    const hourd = { a: p.bois.fond, b: p.bois.autre, clair: p.bois.clair, joint: p.bois.sombre };
    const fenetre = melanger(p.bois.creux, LUEUR, m.lueur);
    const coeur = melanger(p.bois.creux, FLAMME, m.lueur);

    // Le fût de pierre, un peu plus large au pied, rond : clair à gauche, dans l'ombre à droite.
    const haut = 90;
    const demi = (y: number): number => 29 + Math.round(((y - haut) * 4) / (pied - haut));
    pierres(P, m.pierre, cx - 34, haut, 69, pied - haut + 1, 23, (x, y) => Math.abs(x - cx) <= demi(y), (x, y, couleur) => {
      const rel = (x - cx) / demi(y);
      if (rel > 0.55) return melanger(couleur, m.pierre.joint, 0.45);
      if (rel > 0.2) return melanger(couleur, m.pierre.sombre, 0.35);
      if (rel < -0.6) return melanger(couleur, m.pierre.clair, 0.4);
      return couleur;
    });

    // La porte cintrée, dans son arc de pierres claires, avec ses pentures de fer.
    const seuil = 122;
    const dansLaPorte = (x: number, y: number, r: number): boolean => Math.abs(x - cx) <= r && y <= pied && (y >= seuil || (x - cx) * (x - cx) + (y - seuil) * (y - seuil) <= r * r + r * 0.4);
    for (let y = seuil - 18; y <= pied; y++) {
      for (let x = cx - 17; x <= cx + 17; x++) {
        if (dansLaPorte(x, y, 13)) continue;
        if (!dansLaPorte(x, y, 17)) continue;
        // Les claveaux de l'arc, puis les pierres des jambages.
        const tour = (Math.atan2(seuil - y, x - cx) / Math.PI) * 9;
        const joint = y >= seuil ? (y - seuil) % 7 === 6 : tour - Math.floor(tour) < 0.2;
        P.poser(x, y, joint ? m.pierre.joint : x > cx + 6 ? m.pierre.fond : m.pierre.clair);
      }
    }
    planches(P, cx - 13, seuil - 14, 27, pied - seuil + 15, { a: p.tronc.clair, b: melanger(p.tronc.clair, p.tronc.fond, 0.5), clair: p.bois.fond, joint: p.tronc.sombre }, 5, (x, y) => dansLaPorte(x, y, 13));
    for (const y of [seuil + 4, pied - 14]) P.rect(cx - 12, y, 25, 2, (_i, j) => (j === y ? m.fer : p.tronc.sombre));
    P.rect(cx + 7, seuil + 20, 2, 4, m.fer);

    // Deux meurtrières : une lueur y veille la nuit.
    for (const [x, y] of [[cx - 1, 98], [cx + 15, 106]] as const) {
      halo(P, x + 1, y + 4, 8, m.lueur * 0.7);
      P.rect(x, y, 3, 9, fenetre);
      P.rect(x + 1, y + 2, 1, 5, coeur);
      P.rect(x - 1, y + 9, 5, 1, m.pierre.clair);
    }
    // Le lierre qui monte au pied, du côté du soleil.
    for (let y = 118; y <= pied; y++) {
      const large = Math.round(((y - 118) / (pied - 118)) ** 1.4 * 15);
      for (let x = cx - demi(y); x <= cx - demi(y) + large; x++) {
        const a = alea(x, y + 31);
        if (alea(x >> 1, (y >> 1) + 31) < 0.7) P.poser(x, y, a < 0.1 ? p.feuilles.claire : a < 0.6 ? p.feuilles.fond : p.feuilles.sombre);
      }
    }

    // Le hourd : l'étage de bois en surplomb, sur ses corbeaux, avec trois baies et les boucliers du clan.
    for (let dx = -27; dx <= 27; dx += 9) {
      const x = cx + dx - 2;
      P.rect(x, haut, 4, 4, (i, j) => (i === x ? p.bois.clair : i === x + 3 || j === haut + 3 ? p.bois.sombre : p.bois.fond));
    }
    for (const cote of [-1, 1]) {
      for (let k = 0; k < 9; k++) P.rect(cx + cote * (30 + k) - (cote < 0 ? 2 : 0), haut + 8 - k, 3, 2, cote < 0 ? p.bois.autre : p.bois.sombre);
    }
    const etage = 62;
    planches(P, cx - 38, etage, 77, haut - etage - 2, hourd);
    voiler(P, cx + 20, etage, 19, haut - etage - 2, p.bois.creux, 0.22);
    poutre(P, m, cx - 40, haut - 3, 81, 3);
    for (const x of [cx - 40, cx + 38]) poteau(P, m, x, etage, 3, haut - etage - 2);
    for (const dx of [-22, 0, 22]) {
      const x = cx + dx - 4;
      halo(P, x + 4, etage + 12, 10, m.lueur * 0.8);
      P.rect(x - 1, etage + 6, 11, 13, (i, j) => (j === etage + 6 || i === x - 1 ? p.bois.clair : p.bois.sombre));
      P.rect(x, etage + 7, 9, 11, fenetre);
      P.rect(x + 2, etage + 10, 5, 8, coeur);
      P.rect(x + 4, etage + 7, 1, 11, p.bois.sombre);
    }
    bouclier(P, m, cx - 11, etage + 13, 5, TRICOLORE[0], TRICOLORE[1]);
    bouclier(P, m, cx + 11, etage + 13, 5, TRICOLORE[2], TRICOLORE[1]);
    voiler(P, cx - 40, etage, 81, 3, p.bois.creux, 0.4);

    // Le toit pointu de tuiles de bois, qui s'évase au bord.
    const sommet = 20;
    const demiToit = (y: number): number => 1 + Math.round(44 * ((y - sommet) / (etage + 1 - sommet)) ** 1.18);
    tuiles(P, m.tuile, sommet, etage + 1, (y) => [cx - demiToit(y), cx + demiToit(y)], 5, (x, y, couleur) => {
      const d = demiToit(y);
      const rel = (x - cx) / d;
      if (x === cx - d) return m.tuile.clair;
      if (x === cx + d || y === etage + 1) return m.tuile.joint;
      if (rel < -0.35) return melanger(couleur, m.tuile.clair, 0.35);
      if (rel > 0.3) return melanger(couleur, m.tuile.joint, rel > 0.65 ? 0.5 : 0.28);
      return couleur;
    });

    // La hampe et la bannière du clan : bleu nuit, les trois couleurs à la hampe, « GAL » en blanc.
    P.rect(cx, 0, 2, sommet + 3, (i) => (i === cx ? p.bois.clair : p.bois.sombre));
    P.rect(cx - 1, sommet - 1, 4, 2, p.bois.fond);
    const nuit = t(BLEU_NUIT);
    const blanc = t(TRICOLORE[1]);
    for (let i = 0; i < 37; i++) {
      // Le tissu ondule à peine, et finit en deux pointes.
      const vague = Math.round(1.3 * Math.sin(i / 5.5));
      for (let j = 0; j < 15; j++) {
        if (i > 31 && Math.abs(j - 7) < i - 31) continue;
        let couleur = (i >> 2) % 2 === 0 || i < 6 ? nuit : melanger(nuit, OMBRE_DE_NUIT, 0.25);
        if (i < 6) couleur = t(TRICOLORE[i >> 1]!);
        else if (j === 0 || j === 14) couleur = blanc;
        else if (i >= 9 && i < 26 && j >= 4 && j < 11 && LETTRES_DU_CLAN[j - 4]![i - 9] === "#") couleur = blanc;
        P.poser(cx + 2 + i, 1 + vague + j, couleur);
      }
    }
    return P.decor();
  },
};

export const LOT_C: Partial<Record<BatimentId, DessinDeBatiment>> = {
  etable: ETABLE,
  halle: HALLE,
  chene: CHENE,
  rempart: REMPART,
  "grande-tour": GRANDE_TOUR,
};
