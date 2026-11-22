/**
 * Les fonds d'objets, lot D (voir `socle.ts` et son `CATALOGUE_DES_SCENES`) : « le village en fête ». Sept scènes joyeuses,
 * derrière les objets drôles du vestiaire : la cuisine, le fournil, la taverne, la fête du village, le chantier, la chambre
 * douillette et la scène de théâtre.
 *
 * Elles forment une famille : le même décor de théâtre (un mur ou un ciel clair, un sol qui commence à la rangée du sol, le
 * décor rangé sur les deux flancs et sous la poutre du haut, le milieu laissé calme pour la chose), les mêmes bois blonds,
 * la même lumière chaude venue d'en haut à gauche. La graine de la chose choisit le côté de chaque meuble, ce qui pend,
 * ce qui est posé ; sa couleur teinte un linge, un fanion, une courtepointe ou un rideau.
 *
 * Dessin de Claude Fable 5.2, 22 novembre 2026.
 */
import { CATALOGUE_DES_SCENES, adoucir, alea, assombrir, degrade, eclaircir, entre, hasard, melanger, nuage, trame } from "./socle";
import type { ParametresDuFond, Planche, SceneDeFond } from "./socle";

// ---------------------------------------------------------------------------------------------------------------------
// Le cadre commun : les mesures d'une scène, tirées de la taille de la planche.
// ---------------------------------------------------------------------------------------------------------------------

type Cote = 0 | 1;

interface Cadre {
  L: number;
  H: number;
  /** La rangée où commence le sol. */
  sol: number;
  /** La largeur d'un flanc : le décor se range à gauche de `g` et à droite de `L - g`. */
  g: number;
  /** L'épaisseur d'une poutre. */
  e: number;
  /** Le côté du grand meuble de la scène, tiré de la graine, et l'autre. */
  cote: Cote;
  autre: Cote;
  /** La finesse du dessin : 0 sur une petite planche (les grandes formes seules), 1, puis 2 sur une grande. */
  fin: 0 | 1 | 2;
  h: () => number;
  /** Une mesure donnée pour la case du vestiaire (56 × 38), ramenée à la planche ; jamais moins d'une case. */
  k: (n: number) => number;
  /** La couleur de la chose, adoucie et éclaircie (un tissu), et un peu plus franche (un liseré). */
  doux: string;
  vif: string;
}

const borne = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

function cadrer(o: ParametresDuFond): Cadre {
  const L = o.largeur;
  const H = o.hauteur;
  const u = Math.min(L / 56, H / 38);
  const h = hasard(o.graine);
  const cote: Cote = h() < 0.5 ? 0 : 1;
  return {
    L,
    H,
    sol: borne(Math.round(o.sol), Math.round(H * 0.5), H - 2),
    g: Math.max(5, Math.round(L * 0.27)),
    e: Math.max(1, Math.round(1.7 * u)),
    cote,
    autre: cote === 0 ? 1 : 0,
    fin: L < 34 ? 0 : L < 90 ? 1 : 2,
    h,
    k: (n) => Math.max(1, Math.round(n * u)),
    doux: eclaircir(adoucir(o.accent, 0.2), 0.42),
    vif: eclaircir(adoucir(o.accent, 0.1), 0.18),
  };
}

/** La colonne de gauche d'un meuble de largeur `l` rangé sur un flanc, à `marge` cases du bord. */
const flanc = (c: Cadre, cote: Cote, l: number, marge = c.e): number => (cote === 0 ? marge : c.L - marge - l);

/** Vrai si la case est hors de la place de la chose, à `m` cases près. */
const horsZone = (o: ParametresDuFond, x: number, y: number, m = 1): boolean =>
  x < o.zone.x - m || x >= o.zone.x + o.zone.largeur + m || y < o.zone.y - m || y >= o.zone.y + o.zone.hauteur + m;

/** Une liste battue par la graine. */
function battre<T>(h: () => number, liste: readonly T[]): T[] {
  const t = [...liste];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(h() * (i + 1));
    [t[i], t[j]] = [t[j]!, t[i]!];
  }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------------
// Les matières communes : bois, sols, poutres.
// ---------------------------------------------------------------------------------------------------------------------

interface Bois {
  fond: string;
  clair: string;
  sombre: string;
}
const BOIS: Bois = { fond: "#c2946a", clair: "#d9b086", sombre: "#a37650" };
const BOIS_BLOND: Bois = { fond: "#d8b384", clair: "#e8c99c", sombre: "#bf9566" };
const FER = { fond: "#7b8192", clair: "#a3a9b8" };

/** Un ovale plein. */
function ovale(p: Planche, cx: number, cy: number, rx: number, ry: number, couleur: string | ((dx: number, dy: number) => string | null)): void {
  const a = Math.max(0.3, rx * rx + rx * 0.4);
  const b = Math.max(0.3, ry * ry + ry * 0.4);
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / a + (dy * dy) / b > 1) continue;
      const c = typeof couleur === "string" ? couleur : couleur(dx, dy);
      if (c !== null) p.poser(cx + dx, cy + dy, c);
    }
  }
}

/** Un pavé en relief : un filet clair en haut et à gauche, sombre en bas et à droite. */
function pave(p: Planche, x: number, y: number, l: number, h: number, couleur: string, relief = 0.2): void {
  p.rect(x, y, l, h, couleur);
  if (l < 3 || h < 3) return;
  p.rect(x, y, l, 1, eclaircir(couleur, relief));
  p.rect(x, y, 1, h, eclaircir(couleur, relief));
  p.rect(x, y + h - 1, l, 1, assombrir(couleur, relief * 0.6));
  p.rect(x + l - 1, y, 1, h, assombrir(couleur, relief * 0.6));
}

/** La poutre du haut et, si on veut, les deux poteaux des bords. */
function poutres(p: Planche, c: Cadre, bois: Bois, poteaux = true): void {
  const { L, e, sol } = c;
  if (poteaux) {
    p.rect(0, 0, e, sol, bois.fond);
    p.rect(L - e, 0, e, sol, bois.fond);
    if (e >= 2) {
      p.rect(0, 0, 1, sol, bois.clair);
      p.rect(L - 1, 0, 1, sol, bois.sombre);
    }
  }
  p.rect(0, 0, L, e, bois.fond);
  if (e >= 2) {
    p.rect(0, 0, L, 1, bois.clair);
    p.rect(0, e - 1, L, 1, bois.sombre);
  }
}

/** Un sol de lames ou de dalles : des rangs qui s'élargissent vers le bas, des joints décalés d'un rang à l'autre. */
function plancher(p: Planche, c: Cadre, clair: string, fonce: string, pas = 16): void {
  const { L, H, sol, k } = c;
  const joint = assombrir(fonce, 0.1);
  const periode = Math.max(8, k(pas));
  let y = sol;
  let rang = 0;
  let hr = Math.max(2, k(2));
  while (y < H) {
    const decalage = Math.floor(alea(rang, 7) * periode);
    for (let yy = y; yy < Math.min(H, y + hr); yy++) {
      for (let x = 0; x < L; x++) {
        const bout = c.fin > 0 && (x + decalage) % periode === 0;
        p.poser(x, yy, (yy === y && rang > 0) || bout ? joint : rang % 2 ? fonce : clair);
      }
    }
    y += hr;
    rang++;
    hr++;
  }
  p.rect(0, sol, L, 1, eclaircir(clair, 0.3));
}

/** Un sol de carreaux en damier doux, en éventail depuis le milieu. */
function carrelage(p: Planche, c: Cadre, a: string, b: string): void {
  const { L, H, sol, k } = c;
  const lt = Math.max(3, k(5));
  let y = sol;
  let rang = 0;
  let hr = Math.max(2, k(2));
  while (y < H) {
    const l = lt * (1 + rang * 0.22);
    for (let yy = y; yy < Math.min(H, y + hr); yy++) {
      for (let x = 0; x < L; x++) {
        const col = Math.floor((x - L / 2 + 0.5) / l);
        p.poser(x, yy, (((col + rang) % 2) + 2) % 2 ? a : b);
      }
    }
    y += hr;
    rang++;
    hr++;
  }
  p.rect(0, sol, L, 1, eclaircir(a, 0.35));
}

/** Une plinthe : un filet de bois au pied du mur. */
function plinthe(p: Planche, c: Cadre, bois: Bois): void {
  p.rect(0, c.sol - 1, c.L, 1, bois.fond);
}

/** Un pot de terre : son corps, son bord clair, son ombre à droite. */
function pot(p: Planche, x: number, y: number, l: number, h: number, couleur: string): void {
  p.rect(x, y - h, l, h, couleur);
  p.rect(x, y - h, l, 1, eclaircir(couleur, 0.35));
  if (l >= 3) p.rect(x + l - 1, y - h + 1, 1, h - 1, assombrir(couleur, 0.12));
}

/** Une chope de bois couronnée de mousse, l'anse à droite. */
function chope(p: Planche, x: number, y: number, l: number, h: number): void {
  p.rect(x, y - h, l, h, BOIS.fond);
  p.rect(x, y - h, 1, h, BOIS.clair);
  if (h >= 3) p.rect(x, y - Math.ceil(h / 2), l, 1, BOIS.sombre);
  p.rect(x, y - h - 1, l, 1, "#fff8e6");
  if (l >= 3) p.poser(x + 1, y - h - 2, "#fff8e6");
  if (h >= 3) p.rect(x + l, y - h + 1, 1, h - 2, BOIS.sombre);
}

/** Un tonneau vu de face : son fond rond, son cercle sombre, sa bonde. */
function tonneau(p: Planche, cx: number, cy: number, r: number): void {
  const cercle = r >= 5 ? BOIS.sombre : BOIS.fond;
  p.disque(cx, cy, r, (dx, dy) => (dx + dy > r * 0.9 ? assombrir(cercle, 0.1) : cercle));
  if (r < 2) return;
  p.disque(cx, cy, r - 1, (dx, dy) => (r >= 4 && Math.abs(dy) % 3 === 2 ? BOIS.fond : dx + dy < -r * 0.5 ? BOIS_BLOND.clair : BOIS_BLOND.fond));
  if (r >= 4) p.poser(cx, cy, BOIS.sombre);
  if (r >= 5) p.rect(cx - 1, cy, 3, 1, BOIS.sombre);
}

/** Une miche ronde et dorée, fendue d'un trait clair. */
function miche(p: Planche, cx: number, y: number, rx: number, ry: number): void {
  ovale(p, cx, y - ry, rx, ry, (dx, dy) => (dy > 0 ? null : dx + dy * 2 < -rx * 0.7 ? "#f3d59a" : dx > rx * 0.5 ? "#d2a05a" : "#e4b872"));
  if (rx >= 2) p.rect(cx - Math.floor(rx / 2), y - ry - Math.max(1, Math.floor(ry / 2)), rx, 1, "#f7e2b4");
  p.rect(cx - rx, y - ry, rx * 2 + 1, 1, "#d2a05a");
}

/** Une lanterne pendue : son fil, son chapeau, sa lueur. */
function lanterne(p: Planche, x: number, y: number, fil: number, l: number): void {
  p.rect(x, y, 1, fil, FER.fond);
  const x0 = x - Math.floor(l / 2);
  p.rect(x0, y + fil, l, 1, FER.fond);
  p.rect(x0, y + fil + 1, l, l, "#fbe08a");
  if (l >= 3) p.rect(x0 + 1, y + fil + 1, l - 2, l, "#fff3c0");
  p.rect(x0, y + fil + 1 + l, l, 1, FER.fond);
}

// ---------------------------------------------------------------------------------------------------------------------
// La cuisine : l'âtre et son chaudron d'un côté, les étagères de pots de l'autre, jambons et saucissons sous la poutre.
// ---------------------------------------------------------------------------------------------------------------------

function peindreCuisine(p: Planche, o: ParametresDuFond): void {
  const c = cadrer(o);
  const { L, sol, g, e, k, h } = c;
  degrade(p, 0, sol - 1, "#f8eed8", "#f3e2c6", 3);
  carrelage(p, c, "#efd2b4", "#e6c3a2");
  plinthe(p, c, BOIS);

  // L'âtre de pierre claire, son feu et son chaudron pendu.
  const la = Math.max(4, g - e);
  const xa = flanc(c, c.cote, la);
  const hb = Math.max(3, k(3));
  p.rect(xa, e, la, sol - e, (x, y) => {
    const rang = Math.floor((y - e) / hb);
    return c.fin > 0 && ((y - e) % hb === hb - 1 || (x - xa + (rang % 2) * hb) % (hb * 2) === 0) ? "#d3c9b6" : "#e6ded0";
  });
  const m = Math.max(1, Math.round(la * 0.16));
  const lo = la - 2 * m;
  const ho = Math.max(3, Math.round((sol - e) * 0.52));
  const xo = xa + m;
  const yo = sol - ho;
  for (let y = yo; y < sol; y++) {
    for (let x = xo; x < xo + lo; x++) {
      if (lo >= 4 && y === yo && (x === xo || x === xo + lo - 1)) continue;
      p.poser(x, y, melanger("#b9806a", "#eeb078", ((y - yo) / ho) ** 2));
    }
  }
  p.rect(xa, yo - Math.max(1, k(1)) , la, Math.max(1, k(1)), BOIS.fond);
  const cx = xo + Math.floor(lo / 2);
  const hf = Math.max(1, Math.round(ho * 0.34));
  for (let j = 0; j < hf; j++) {
    const demi = Math.round((lo / 2 - 1) * (1 - j / hf) * 0.85);
    for (let x = cx - demi; x <= cx + demi; x++) p.poser(x, sol - 1 - j, Math.abs(x - cx) * 2 <= demi && j * 2 < hf ? "#fde08a" : "#f6a04e");
  }
  const r = Math.max(1, Math.min(Math.floor(lo / 4), Math.floor((ho - hf - 2) / 2)));
  const cy = sol - 1 - hf - r;
  p.rect(cx, yo + 1, 1, Math.max(0, cy - r - yo - 1), FER.clair);
  p.disque(cx, cy, r, (dx, dy) => (dx + dy < -r * 0.6 ? FER.clair : FER.fond));
  p.rect(cx - r, cy - r, 2 * r + 1, 1, FER.clair);

  // Les étagères : deux planches et leurs pots, l'un à la couleur de la chose ; un torchon pend à la seconde.
  const le = Math.max(4, g - e - 1);
  const xe = flanc(c, c.autre, le, e + 1);
  const couleurs = battre(h, ["#e0a183", "#f4e6c6", "#a9c3da", "#b4cfa4", c.doux, "#ecc874"]);
  const niveaux = c.fin === 0 ? [0.5] : [0.3, 0.6];
  let n = 0;
  niveaux.forEach((part, i) => {
    const y = e + Math.round((sol - e) * part);
    p.rect(xe, y, le, 1, BOIS.fond);
    if (c.fin > 0) p.rect(xe, y + 1, le, 1, melanger("#f3e2c6", BOIS.sombre, 0.35));
    let x = xe + (i % 2);
    while (x < xe + le - 1) {
      const lp = Math.min(xe + le - x, entre(h, k(2), k(3)) + (c.fin === 2 ? 1 : 0));
      const hp = entre(h, k(2), k(4));
      pot(p, x, y, lp, hp, couleurs[n++ % couleurs.length]!);
      if (lp >= 3 && h() < 0.5) p.rect(x + 1, y - hp - 1, lp - 2, 1, BOIS.sombre);
      x += lp + 1;
    }
    if (i === niveaux.length - 1) {
      const lt = Math.max(2, k(3));
      const xt = xe + entre(h, 0, Math.max(0, le - lt));
      p.rect(xt, y + 1, lt, Math.max(2, k(4)), (tx, ty) => ((ty - y) % 2 === 0 && c.fin > 0 ? "#fbf3e2" : c.doux));
    }
  });

  poutres(p, c, BOIS, false);

  // Sous la poutre : jambons et saucissons, jamais devant la chose.
  const pendus = c.fin === 0 ? 2 : c.fin === 1 ? 5 : 8;
  for (let i = 0; i < pendus; i++) {
    const x = Math.round(((i + 0.5 + (h() - 0.5) * 0.5) / pendus) * (L - 2 * e)) + e;
    const fil = entre(h, 1, k(2));
    const jambon = h() < 0.55;
    const haut = jambon ? k(5) : k(4);
    if (!horsZone(o, x, e + fil + haut, k(2)) || (x >= xa - 1 && x <= xa + la)) continue;
    p.rect(x, e, 1, fil, "#c9b48a");
    if (jambon) {
      const rx = Math.max(1, k(1.4));
      const ry = Math.max(1, Math.floor(haut / 2));
      ovale(p, x, e + fil + ry, rx, ry, (dx, dy) => (dy >= ry - (ry > 1 ? 1 : 0) && ry > 1 ? "#c9806e" : dx + dy < -rx * 0.4 ? "#eeb3a0" : "#e09a88"));
      p.poser(x, e + fil, "#f6ecd8");
    } else {
      p.rect(x, e + fil, Math.max(1, k(0.8)), haut, (_x, y) => ((y - e - fil) % 3 === 2 ? "#e8b0a0" : "#c9776c"));
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le fournil : le four à pain voûté d'un côté, la claie de pains et les sacs de farine de l'autre.
// ---------------------------------------------------------------------------------------------------------------------

/** Un sac de farine, noué en haut, une bande à la couleur de la chose. */
function sac(p: Planche, x: number, y: number, l: number, h: number, bande: string): void {
  for (let j = 0; j < h; j++) {
    const retrait = j === 0 ? Math.max(1, Math.floor(l / 3)) : j === 1 || j === h - 1 ? (l >= 5 ? 1 : 0) : 0;
    p.rect(x + retrait, y - h + j, l - 2 * retrait, 1, (px) => (px >= x + l - 1 - retrait - (l >= 5 ? 1 : 0) || j === h - 1 ? "#d9c8a8" : px === x + retrait ? "#fffaf0" : "#f3e8d2"));
  }
  if (h >= 4) p.rect(x, y - Math.floor(h / 2) - (h >= 7 ? 1 : 0), l, h >= 7 ? 2 : 1, bande);
}

function peindreFournil(p: Planche, o: ParametresDuFond): void {
  const c = cadrer(o);
  const { L, H, sol, g, e, k, h } = c;
  degrade(p, 0, sol - 1, "#f9efdb", "#f4e3c8", 3);
  plancher(p, c, "#e9dcc6", "#e1d2b9", 12);
  plinthe(p, c, BOIS_BLOND);

  // Le four : un dôme de briques sur un socle de pierre, sa gueule rougeoyante, sa cheminée jusqu'à la poutre.
  const lf = Math.max(5, g);
  const xf = flanc(c, c.cote, lf, 0);
  const cxf = xf + Math.floor(lf / 2);
  const hs = Math.max(1, k(3));
  const base = Math.min(H - 1, sol + Math.max(0, k(1)));
  const rx = Math.floor((lf - 1) / 2);
  const ry = Math.max(3, Math.round((sol - e) * 0.6));
  const hbq = Math.max(2, k(2));
  const brique = (x: number, y: number): string => {
    const rang = Math.floor(y / hbq);
    return c.fin > 0 && (y % hbq === 0 || (x + (rang % 2) * hbq * 2) % (hbq * 4) === 0) ? "#f2d8bf" : "#e8bc9a";
  };
  const lc = Math.max(2, k(4));
  p.rect(cxf - Math.floor(lc / 2), e, lc, base - hs - ry - e + 2, brique);
  ovale(p, cxf, base - hs, rx, ry, (dx, dy) => (dy > 0 ? null : dx * dx * ry * ry + dy * dy * rx * rx > (rx - 1) * (rx - 1) * ry * ry && dx + dy > 0 ? "#d6a380" : brique(cxf + dx, base - hs + dy)));
  pave(p, xf, base - hs, lf, hs, "#e2dacb", 0.25);
  const rg = Math.max(1, Math.round(rx * 0.55));
  const hg = Math.max(2, Math.round(ry * 0.5));
  ovale(p, cxf, base - hs - 1, rg + 1, hg + 1, (_dx, dy) => (dy > 0 ? null : "#d99c78"));
  ovale(p, cxf, base - hs - 1, rg, hg, (dx, dy) => (dy > 0 ? null : melanger("#b56a50", "#f7b860", borne(1 + dy / hg, 0, 1) ** 1.5 * (1 - Math.abs(dx) / (rg + 1) / 2))));
  if (rg >= 2) p.rect(cxf - rg + 1, base - hs - 1, rg * 2 - 1, 1, "#fbd77a");
  if (c.fin > 0 && rg >= 3) miche(p, cxf, base - hs - 1, Math.max(1, rg - 2), Math.max(1, Math.floor(hg / 3)));

  // La claie : deux montants, des tablettes, des miches et des pains longs ; dessous, les sacs de farine.
  const lr = Math.max(4, g - e - 1);
  const xr = flanc(c, c.autre, lr, e);
  const hautClaie = e + Math.max(2, k(4));
  const hsac = Math.max(3, Math.min(k(8), Math.round((sol - e) * 0.3)));
  const basClaie = base - hsac - 1;
  p.rect(xr, hautClaie, 1, base - hautClaie, BOIS.fond);
  p.rect(xr + lr - 1, hautClaie, 1, base - hautClaie, BOIS.sombre);
  const tablettes = c.fin === 0 ? 2 : 3;
  for (let i = 0; i < tablettes; i++) {
    const y = Math.round(hautClaie + ((basClaie - hautClaie) * (i + 1)) / tablettes);
    p.rect(xr, y, lr, 1, BOIS.fond);
    const longs = h() < 0.4;
    if (longs) {
      const hp = Math.max(1, k(1.2));
      p.rect(xr + 1, y - hp, lr - 2, hp, (px, py) => (py === y - hp ? "#f3d59a" : (px - xr) % 4 === 2 ? "#f7e2b4" : "#e4b872"));
      if (hp > 1) p.rect(xr + 2, y - 2 * hp, Math.max(1, lr - 5), hp, (_px, py) => (py === y - 2 * hp ? "#f3d59a" : "#e4b872"));
    } else {
      const rxm = Math.max(1, k(2.2));
      const rym = Math.max(1, k(1.6));
      for (let cxm = xr + 1 + rxm; cxm + rxm < xr + lr - 1; cxm += rxm * 2 + 2) miche(p, cxm, y, rxm, rym);
    }
  }
  const ls = Math.max(3, Math.floor((lr - 1) / (c.fin === 0 ? 1 : 2)));
  sac(p, xr + (c.autre === 0 ? 0 : lr - ls), base + 1, ls, hsac, c.vif);
  if (c.fin > 0) sac(p, xr + (c.autre === 0 ? ls : lr - 2 * ls), base + 1, ls, Math.max(3, hsac - entre(h, 1, 2)), c.doux);

  poutres(p, c, BOIS_BLOND, false);

  // Sous la poutre, une tresse d'épis et un linge à la couleur de la chose, loin de la chose.
  const xl = Math.round(L / 2 + (h() - 0.5) * L * 0.3);
  const ll = Math.max(2, k(4));
  const hl = Math.max(1, k(3));
  if (horsZone(o, xl, e + hl, 1) && horsZone(o, xl + ll, e + hl, 1)) {
    p.rect(xl, e, ll, hl, (_px, py) => (py === e + hl - 1 ? c.vif : c.doux));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La taverne : colombages, tonneaux empilés, tablette de chopes sous une petite fenêtre, lanternes sous la poutre.
// ---------------------------------------------------------------------------------------------------------------------

function peindreTaverne(p: Planche, o: ParametresDuFond): void {
  const c = cadrer(o);
  const { L, H, sol, g, e, k, h } = c;
  degrade(p, 0, sol - 1, "#f8ecd0", "#f2deb9", 3);
  plancher(p, c, "#dfbe92", "#d6b285");
  plinthe(p, c, BOIS);

  // Les colombages : une écharpe en biais dans chaque coin du haut, une lisse à mi-hauteur sur les flancs.
  const biais = Math.max(3, Math.round(g * 0.8));
  for (let i = 0; i < biais; i++) {
    for (let t = 0; t < e; t++) {
      p.poser(e + i, e + biais - i + t - 1, t === 0 && e > 1 ? BOIS.clair : BOIS.fond);
      p.poser(L - 1 - e - i, e + biais - i + t - 1, t === e - 1 && e > 1 ? BOIS.sombre : BOIS.fond);
    }
  }

  // Les tonneaux : deux au sol, un troisième posé dessus.
  const r = Math.max(2, Math.round(g * 0.2));
  const xt = flanc(c, c.cote, 4 * r + 2);
  const base = Math.min(H - 1, sol + Math.max(1, k(2)));
  tonneau(p, xt + r, base - r, r);
  tonneau(p, xt + 3 * r + 1, base - r, r);
  tonneau(p, xt + 2 * r + (c.cote === 0 ? 0 : 1), base - 3 * r + (r > 2 ? 1 : 0), r);
  if (c.fin > 0) p.rect(xt, base + 1, 4 * r + 2, 1, melanger("#d6b285", BOIS.sombre, 0.4));

  // De l'autre côté : une petite fenêtre au soleil, une tablette de chopes, un linge à la couleur de la chose.
  const lw = Math.max(4, g - e - 2);
  const xw = flanc(c, c.autre, lw, e + 1);
  const yt = e + Math.round((sol - e) * 0.62);
  const lch = Math.max(2, k(2.4));
  const hch = Math.max(2, k(3));
  if (c.fin > 0) {
    const hw = Math.max(4, Math.min(lw, yt - hch - e - k(4)));
    const lf = Math.min(lw - 1, hw + 1);
    const xf = xw + Math.floor((lw - lf) / 2);
    const yf = e + Math.max(2, k(2));
    pave(p, xf, yf, lf, hw, BOIS.fond, 0.15);
    p.rect(xf + 1, yf + 1, lf - 2, hw - 2, (x, y) => (trame(x, y, (y - yf) / hw) ? "#fdf0c4" : "#e3effa"));
    p.rect(xf + Math.floor(lf / 2), yf + 1, 1, hw - 2, BOIS.fond);
    if (hw >= 6) p.rect(xf + 1, yf + Math.floor(hw / 2), lf - 2, 1, BOIS.fond);
  }
  p.rect(xw, yt, lw, 1, BOIS.fond);
  if (c.fin > 0) p.rect(xw, yt + 1, lw, 1, melanger("#f2deb9", BOIS.sombre, 0.35));
  for (let x = xw + 1; x + lch < xw + lw; x += lch + 2) chope(p, x, yt, lch, hch);
  const ll = Math.max(2, k(3));
  p.rect(xw + entre(h, 0, Math.max(0, lw - ll)), yt + 1, ll, Math.max(2, k(4)), (_x, y) => ((y - yt) % 3 === 0 && c.fin > 0 ? "#fbf3e2" : c.doux));

  poutres(p, c, BOIS);

  // Les lanternes, sous la poutre, là où elles ne gênent pas la chose.
  const ll2 = Math.max(1, k(2)) | 1;
  const lanternes = c.fin === 0 ? 1 : 2;
  for (let i = 0; i < lanternes; i++) {
    const x = Math.round(L * (lanternes === 1 ? 0.5 : i === 0 ? 0.36 : 0.64) + (h() - 0.5) * L * 0.08);
    const fil = entre(h, 1, k(2));
    if (horsZone(o, x - ll2, e + fil + ll2 + 2, 1) && horsZone(o, x + ll2, e + fil + ll2 + 2, 1)) lanterne(p, x, e, fil, ll2);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La fête du village : la place, une chaumière et un étal rayé, des guirlandes de fanions, des lampions, des confettis.
// ---------------------------------------------------------------------------------------------------------------------

/** Les couleurs de la fête, la couleur de la chose parmi elles. */
const couleursDeFete = (c: Cadre): string[] => battre(c.h, ["#f29a8a", "#f8d374", "#8fcbea", "#a9d890", c.vif, "#f4b4d0"]);

/** Une guirlande de fanions entre deux points, creusée de `creux` cases au milieu. */
function guirlande(p: Planche, c: Cadre, x0: number, y0: number, x1: number, y1: number, creux: number, couleurs: readonly string[]): void {
  const pas = Math.max(3, c.k(4));
  const hf = Math.max(2, c.k(3));
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / Math.max(1, x1 - x0);
    const y = Math.round(y0 + (y1 - y0) * t + creux * 4 * t * (1 - t));
    p.poser(x, y, "#b9a58a");
    const i = (x - x0) % pas;
    const demi = Math.floor((pas - 1) / 2);
    const couleur = couleurs[Math.floor((x - x0) / pas) % couleurs.length]!;
    if (i < pas - 1) {
      const longueur = Math.max(1, Math.round(hf * (1 - Math.abs(i - (pas - 2) / 2) / (demi + 0.5))));
      p.rect(x, y + 1, 1, longueur, i === 0 && pas > 3 ? eclaircir(couleur, 0.3) : couleur);
    }
  }
}

function peindreFete(p: Planche, o: ParametresDuFond): void {
  const c = cadrer(o);
  const { L, H, sol, g, k, h } = c;
  degrade(p, 0, sol - 1, "#cfe7fb", "#fdf4de", 4);
  const couleurs = couleursDeFete(c);

  // Au loin, deux nuages et la ligne des arbres ; devant, la place de terre blonde.
  const nuages = c.fin === 0 ? 1 : 2;
  for (let i = 0; i < nuages; i++) {
    const ln = entre(h, k(8), k(13));
    nuage(p, entre(h, 0, L - ln), Math.round(sol * (0.28 + h() * 0.3)), ln, "#ffffff", "#e9f1fb");
  }
  for (let x = 0; x < L; x++) {
    const hb = 1 + Math.round(k(2) * (0.5 + 0.5 * Math.sin(x * (2.2 / k(3)) + (o.graine % 7))));
    p.rect(x, sol - hb, 1, hb, "#cfe6bd");
  }
  degrade(p, sol, H - 1, "#f3e3bc", "#ead5a6", 3);
  p.rect(0, sol, L, 1, "#f9eed0");

  // La chaumière d'un côté.
  const lm = Math.max(5, g - 1);
  const xm = flanc(c, c.cote, lm, 0);
  const hm = Math.max(3, Math.round(sol * 0.24));
  const ht = Math.max(3, Math.round(sol * 0.26));
  const basM = Math.min(H - 1, sol + 1);
  p.rect(xm + 1, basM - hm, lm - 2, hm, (x) => (x >= xm + lm - 3 && lm > 6 ? "#ecdcbc" : "#f8ecd2"));
  const lp = Math.max(1, k(2.4));
  p.rect(xm + Math.floor(lm / 2) - Math.floor(lp / 2), basM - Math.max(2, hm - 2), lp, Math.max(2, hm - 2), BOIS.fond);
  for (let j = 0; j < ht; j++) {
    const demi = Math.round(((j + 1) / ht) * (lm / 2));
    const y = basM - hm - ht + j;
    p.rect(xm + Math.floor(lm / 2) - demi, y, demi * 2 + (lm % 2), 1, (x) => (c.fin > 0 && j % 3 === 2 ? "#dcbc70" : x > xm + lm / 2 + demi * 0.4 ? "#e3c67e" : "#f0d795"));
  }

  // L'étal de l'autre : un auvent rayé à la couleur de la chose, deux piquets, un comptoir.
  const le = Math.max(5, g - 1);
  const xe = flanc(c, c.autre, le, 0);
  const basE = Math.min(H - 1, sol + 1);
  const he = Math.max(5, Math.round(sol * 0.36));
  const ha = Math.max(2, k(3));
  p.rect(xe + 1, basE - he, 1, he, BOIS.fond);
  p.rect(xe + le - 2, basE - he, 1, he, BOIS.sombre);
  const lr = Math.max(2, k(2.5));
  p.rect(xe, basE - he, le, ha, (x, y) => {
    const blanc = Math.floor((x - xe) / lr) % 2 === 1;
    if (y === basE - he + ha - 1) return blanc ? "#f1e8d8" : assombrir(c.vif, 0.08);
    return blanc ? "#fffaf0" : c.vif;
  });
  const hc = Math.max(2, Math.round(he * 0.32));
  pave(p, xe, basE - hc, le, hc, BOIS_BLOND.fond);
  if (c.fin > 0) {
    for (let x = xe + 1; x < xe + le - 2; x += 3) p.rect(x, basE - hc - 1, 2, 1, couleurs[(x + 1) % couleurs.length]!);
  }

  // Les guirlandes : leur creux reste au-dessus de la chose.
  const hf = Math.max(2, k(3));
  const y0 = entre(h, 0, k(2));
  const y1 = entre(h, 0, k(2));
  const creux = borne(o.zone.y - hf - 2 - Math.max(y0, y1), 1, k(7));
  guirlande(p, c, 0, y0, L - 1, y1, creux, couleurs);
  if (c.fin > 0 && o.zone.y > hf * 2 + k(5)) {
    const milieu = Math.round(L * (0.4 + h() * 0.2));
    guirlande(p, c, 0, y0 + k(5), milieu, 0, Math.max(1, Math.round(creux * 0.4)), [...couleurs].reverse());
  }

  // Les lampions, pendus sur les flancs.
  const lampions = c.fin === 0 ? 2 : 4;
  for (let i = 0; i < lampions; i++) {
    const aGauche = i % 2 === 0;
    const part = i < 2 ? 0.72 : 0.3;
    const x = Math.round(aGauche ? g * part : L - 1 - g * part);
    const fil = Math.round(sol * (0.2 + h() * 0.12)) + (i < 2 ? 0 : k(3));
    const rl = Math.max(1, k(1.6));
    const couleur = couleurs[(i + 2) % couleurs.length]!;
    if (!horsZone(o, x, fil + rl, rl + 1)) continue;
    p.rect(x, 0, 1, fil, "#b9a58a");
    ovale(p, x, fil + rl, rl, rl + (rl > 1 ? 1 : 0), (dx) => (Math.abs(dx) === 0 && rl > 1 ? eclaircir(couleur, 0.45) : dx < 0 ? eclaircir(couleur, 0.2) : couleur));
    p.rect(x - (rl > 1 ? 1 : 0), fil, rl > 1 ? 3 : 1, 1, "#b9a58a");
  }

  // Les confettis : quelques-uns dans l'air et sur la place, aucun derrière la chose.
  const confettis = Math.round((L * H) / 70);
  for (let i = 0; i < confettis; i++) {
    const x = entre(h, 1, L - 2);
    const y = entre(h, 1, H - 2);
    const couleur = couleurs[i % couleurs.length]!;
    if (!horsZone(o, x, y, 2)) continue;
    const libre = p.lire(x, y);
    if (libre === null || !/^#(c|d|e|f)/.test(libre)) continue;
    p.poser(x, y, couleur);
    if (c.fin === 2 && i % 3 === 0) p.poser(x + 1, y, couleur);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le chantier : un mur qui monte sous son échafaudage, une grue de bois à roue, des pierres taillées et des cônes.
// ---------------------------------------------------------------------------------------------------------------------

/** Un cône de chantier, rayé de blanc. */
function cone(p: Planche, cx: number, y: number, h: number): void {
  for (let j = 0; j < h; j++) {
    const demi = Math.floor((j * 1.2) / Math.max(1, h - 1) + (j === h - 1 ? 1 : 0));
    const blanc = h >= 4 && (j === Math.floor(h / 2) - 1 || (h >= 7 && j === Math.floor(h / 2) + 1));
    p.rect(cx - demi, y - h + 1 + j, demi * 2 + 1, 1, blanc ? "#fffaf0" : j === h - 1 ? "#e08a45" : "#f4a35c");
  }
}

function peindreChantier(p: Planche, o: ParametresDuFond): void {
  const c = cadrer(o);
  const { L, H, sol, g, k, h } = c;
  degrade(p, 0, sol - 1, "#d3e8fb", "#f4f6ec", 4);
  const nuages = c.fin === 0 ? 1 : 2 + (c.fin === 2 ? 1 : 0);
  for (let i = 0; i < nuages; i++) {
    const ln = entre(h, k(8), k(14));
    nuage(p, entre(h, 0, L - ln), Math.round(sol * (0.12 + h() * 0.4)), ln, "#ffffff", "#e6eff9");
  }
  for (let x = 0; x < L; x++) {
    const hb = 1 + Math.round(k(2) * (0.5 + 0.5 * Math.sin(x * (1.3 / k(3)) + (o.graine % 11))));
    p.rect(x, sol - hb, 1, hb, "#d5e6c4");
  }
  degrade(p, sol, H - 1, "#f0e0bd", "#e6d2a8", 3);
  p.rect(0, sol, L, 1, "#f8edd0");
  const base = Math.min(H - 1, sol + 1);

  // Le mur en cours : des assises de pierre claire, en escalier, plus hautes vers le bord.
  const lm = Math.max(5, g);
  const xm = flanc(c, c.cote, lm, 0);
  const hb = Math.max(2, k(3));
  const assises = Math.max(2, Math.floor((sol * 0.62) / hb));
  for (let a = 0; a < assises; a++) {
    const retrait = Math.round((a / assises) ** 2 * lm * 0.55);
    const x = c.cote === 0 ? xm : xm + retrait;
    const y = base - (a + 1) * hb + 1;
    p.rect(x, y, lm - retrait, hb, (px, py) => {
      const joint = py === y + hb - 1 || (px - xm + (a % 2) * hb) % (hb * 2) === 0;
      return joint && c.fin > 0 ? "#d2c8b4" : py === y ? "#f1ebdf" : "#e5ddcd";
    });
  }
  // L'échafaudage devant lui : deux perches, deux planchers, une écharpe.
  const hautE = Math.max(1, base - Math.round(sol * 0.86));
  const xp0 = xm + (c.cote === 0 ? Math.max(1, k(2)) : 0);
  const xp1 = xm + lm - 1 - (c.cote === 0 ? 0 : Math.max(1, k(2)));
  p.rect(xp0, hautE, 1, base - hautE + 1, BOIS.fond);
  p.rect(xp1, hautE, 1, base - hautE + 1, BOIS.sombre);
  const etages = c.fin === 0 ? [0.5] : [0.34, 0.68];
  for (const part of etages) {
    const y = Math.round(hautE + (base - hautE) * part);
    p.rect(xp0 - 1, y, xp1 - xp0 + 3, 1, BOIS_BLOND.clair);
    if (c.fin > 0) p.rect(xp0 - 1, y + 1, xp1 - xp0 + 3, 1, BOIS.fond);
  }
  if (c.fin > 0) {
    const y0 = Math.round(hautE + (base - hautE) * 0.68) + 2;
    for (let i = 0; i <= xp1 - xp0; i++) p.poser(xp0 + i, Math.min(base, y0 + Math.round((i / Math.max(1, xp1 - xp0)) * (base - y0))), BOIS.fond);
  }

  // La grue de bois : un mât, une flèche vers le milieu, une corde et sa pierre, une roue au pied, un fanion.
  const dedans = c.autre === 0 ? 1 : -1;
  const xg = Math.round(c.autre === 0 ? g * 0.45 : L - 1 - g * 0.45);
  const em = c.fin === 2 ? 2 : 1;
  const hautG = Math.max(2, k(4));
  p.rect(xg, hautG, em, base - hautG + 1, BOIS.fond);
  if (em > 1) p.rect(xg, hautG, 1, base - hautG + 1, BOIS.clair);
  const portee = Math.max(3, Math.round(g * 0.75));
  for (let i = -Math.round(portee * 0.35); i <= portee; i++) {
    const y = hautG + Math.max(1, k(3)) - Math.round((i / portee) * Math.max(1, k(3)));
    p.rect(xg + dedans * i, y, 1, em, BOIS.sombre);
  }
  const xc = xg + dedans * portee;
  const corde = borne(o.zone.y - hautG - k(4), 1, Math.round(sol * 0.3));
  const lb = Math.max(2, k(3));
  if (horsZone(o, xc, hautG + corde + lb, 1) || corde <= 2) {
    p.rect(xc, hautG, 1, corde, "#b9a58a");
    pave(p, xc - Math.floor(lb / 2), hautG + corde, lb, Math.max(2, lb - 1), "#e5ddcd", 0.3);
  }
  for (let i = 1; i < base - hautG; i++) {
    const x = xg - dedans * Math.round((i / (base - hautG)) * g * 0.4);
    if (i % 2 === 0 || c.fin === 0) p.poser(x, hautG + i, "#b9a58a");
  }
  const rr = Math.max(2, k(3.4));
  p.disque(xg + dedans * (rr - 1), base - rr, rr, (dx, dy) => (dx * dx + dy * dy >= (rr - 1) * (rr - 1) || dx === 0 || dy === 0 ? (dx + dy > 0 ? BOIS.fond : BOIS_BLOND.clair) : null));
  const lfa = Math.max(2, k(3));
  p.rect(xg, Math.max(0, hautG - lfa), 1, lfa, BOIS.fond);
  for (let j = 0; j < Math.max(2, lfa - 1); j++) p.rect(dedans > 0 ? xg + 1 : xg - (lfa - j), Math.max(0, hautG - lfa) + j, lfa - j, 1, j === 0 ? eclaircir(c.vif, 0.2) : c.vif);

  // Au sol : un tas de pierres taillées et des cônes, sur les flancs.
  if (H - base >= 2) {
    const lp = Math.max(2, k(4));
    const hp = Math.max(2, k(2.4));
    const xs = c.cote === 0 ? xm + lm - lp : xm - lp - 1;
    const bas = Math.min(H - 1, base + Math.max(1, k(2)));
    pave(p, xs, bas - hp + 1, lp, hp, "#e5ddcd", 0.3);
    pave(p, xs + lp + 1, bas - hp + 1, lp, hp, "#ded5c3", 0.3);
    if (c.fin > 0) pave(p, xs + Math.floor(lp / 2) + 1, bas - 2 * hp + 1, lp, hp, "#ebe4d6", 0.3);
  }
  const cones = c.fin === 0 ? 1 : 2;
  for (let i = 0; i < cones; i++) {
    const hc = Math.max(3, k(5));
    const x = Math.round(i === 0 ? (c.autre === 0 ? g * (0.75 + h() * 0.2) : L - 1 - g * (0.75 + h() * 0.2)) : c.cote === 0 ? g * (0.2 + h() * 0.15) : L - 1 - g * (0.2 + h() * 0.15));
    cone(p, x, Math.min(H - 1, base + Math.max(1, k(2)) + i), hc);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La chambre douillette : le lit et sa courtepointe, la fenêtre sur la lune, la bougie sur son chevet, le tapis rond.
// ---------------------------------------------------------------------------------------------------------------------

function peindreChambre(p: Planche, o: ParametresDuFond): void {
  const c = cadrer(o);
  const { L, H, sol, g, e, k, h } = c;
  // Le papier peint, à larges bandes à peine marquées, baigné par la bougie.
  const lb = Math.max(3, k(5));
  degrade(p, 0, sol - 1, "#f9e9da", "#f6dfcd", 3);
  if (c.fin > 0) {
    for (let x = 0; x < L; x++) {
      if (Math.floor(x / lb) % 2 === 0) continue;
      for (let y = 0; y < sol; y++) if (trame(x, y, 0.5)) p.poser(x, y, "#f3d9c8");
    }
  }
  plancher(p, c, "#e3c8a2", "#dabd95");
  plinthe(p, c, BOIS_BLOND);
  const base = Math.min(H - 1, sol + Math.max(1, k(2)));

  // Le tapis rond, à la couleur de la chose, sous elle.
  if (H - sol >= 5) {
    const ry = Math.max(1, Math.floor((H - sol - 2) / 2) - (c.fin === 2 ? 2 : 0));
    const rx = Math.round(L * 0.24);
    const cy = Math.min(H - 2 - ry, sol + 1 + ry + Math.max(0, k(1)));
    ovale(p, Math.round(L / 2), cy, rx, ry, (dx, dy) => {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      return d > 0.72 ? eclaircir(c.doux, 0.45) : d > 0.4 && ry > 2 ? c.doux : eclaircir(c.doux, 0.25);
    });
  }

  // La fenêtre sur la lune : un bleu de nuit pâle, la lune, deux ou trois étoiles, des rideaux à la couleur de la chose.
  const lw = Math.max(5, g - e - 1);
  const xw = flanc(c, c.autre, lw, e);
  const yw = Math.max(1, k(3));
  const hw = Math.max(5, Math.round(sol * 0.5));
  pave(p, xw, yw, lw, hw, BOIS_BLOND.fond, 0.2);
  p.rect(xw + 1, yw + 1, lw - 2, hw - 2, (x, y) => (trame(x, y, (y - yw) / hw) ? "#cdd8f4" : "#b7c6ec"));
  const rl = Math.max(1, Math.round(Math.min(lw, hw) * 0.17));
  const xl = xw + 1 + rl + entre(h, 0, Math.max(0, lw - 4 - 2 * rl));
  const yl = yw + 1 + rl + entre(h, 0, Math.max(0, Math.floor(hw / 3) - rl));
  for (let i = 0; i < (c.fin === 0 ? 1 : 3 + c.fin); i++) p.poser(entre(h, xw + 1, xw + lw - 2), entre(h, yw + 1, yw + hw - 2), "#fffbe8");
  p.disque(xl, yl, rl, (dx, dy) => (rl > 1 && dx + dy > rl * 0.9 ? "#f3e7b4" : "#fff8d8"));
  if (c.fin > 0) {
    p.rect(xw + Math.floor(lw / 2), yw + 1, 1, hw - 2, BOIS_BLOND.fond);
    p.rect(xw + 1, yw + Math.floor(hw / 2), lw - 2, 1, BOIS_BLOND.fond);
  }
  const lr = Math.max(1, Math.round(lw * 0.18));
  p.rect(xw - 1, yw - 1, lr + 1, hw + 2, (x) => ((x - xw) % 2 === 0 && lr > 1 ? eclaircir(c.doux, 0.25) : c.doux));
  p.rect(xw + lw - lr, yw - 1, lr + 1, hw + 2, (x) => ((x - xw) % 2 === 0 && lr > 1 ? eclaircir(c.doux, 0.25) : c.doux));
  p.rect(xw - 1, yw - 1, lw + 2, 1, BOIS.fond);
  p.rect(xw - 1, yw + hw, lw + 2, 1, BOIS_BLOND.clair);

  // Le chevet et sa bougie, sous la fenêtre ; sa lueur, tramée sur le mur.
  const lt = Math.max(3, k(5));
  const ht = Math.max(3, Math.min(k(7), base - (yw + hw) - k(4)));
  const xt = xw + Math.floor((lw - lt) / 2);
  const xb = xt + Math.floor(lt / 2);
  const hbo = Math.max(1, k(2));
  const yb = base - ht - hbo;
  const rh = Math.max(2, k(5));
  p.disque(xb, yb - 1, rh, (dx, dy) => {
    const ici = p.lire(xb + dx, yb - 1 + dy);
    const d = Math.sqrt(dx * dx + dy * dy) / rh;
    return ici !== null && /^#f[0-9a-f]/.test(ici) && trame(xb + dx, yb - 1 + dy, 0.85 - d * 0.8) ? "#fdf0c0" : null;
  });
  pave(p, xt, base - ht + 1, lt, ht, BOIS.fond, 0.2);
  if (c.fin > 0 && ht >= 4) p.poser(xb, base - ht + 1 + Math.floor(ht / 2), BOIS_BLOND.clair);
  p.rect(xb, yb + 1, 1, hbo, "#fffaf0");
  p.poser(xb, yb, "#f9b94e");
  if (c.fin > 0) p.poser(xb, yb - 1, "#fde58a");

  // Le lit, de profil : la tête contre le bord, l'oreiller, la courtepointe en carrés, le pied vers le milieu.
  const ll = Math.max(5, g);
  const xlit = flanc(c, c.cote, ll, 0);
  const tete = c.cote === 0 ? xlit : xlit + ll - 1;
  const vers = c.cote === 0 ? 1 : -1;
  const hl = Math.max(4, Math.min(k(11), Math.round(sol * 0.36)));
  const et = Math.max(1, k(1.6));
  const hm = Math.max(2, Math.round(hl * 0.5));
  const xm0 = c.cote === 0 ? xlit + et : xlit + 1;
  const lm = ll - et - 1;
  const carre = Math.max(2, k(2.4));
  p.rect(xm0, base - hm, lm, hm, (x, y) => {
    if (y === base) return BOIS.fond;
    const i = Math.floor(Math.abs(x - tete) / carre) + Math.floor((y - (base - hm)) / carre);
    return i % 2 === 0 ? c.doux : eclaircir(c.doux, 0.45);
  });
  p.rect(xm0, base - hm, lm, 1, "#fffaf0");
  const lo = Math.max(2, Math.round(lm * 0.3));
  p.rect(c.cote === 0 ? xm0 : xm0 + lm - lo, base - hm - Math.max(1, k(1.4)), lo, Math.max(1, k(1.4)) + 1, (x, y) => (y === base - hm ? "#ebe2d2" : "#fffaf0"));
  p.rect(c.cote === 0 ? xlit : xlit + ll - et, base - hl, et, hl + 1, (x) => (x === tete && et > 1 ? (vers > 0 ? BOIS.clair : BOIS.sombre) : BOIS.fond));
  if (et > 1) p.rect(c.cote === 0 ? xlit : xlit + ll - et, base - hl, et, 1, BOIS_BLOND.clair);
  p.rect(c.cote === 0 ? xlit + ll - 1 : xlit, base - hm - 1, 1, hm + 2, BOIS.fond);

  // La corniche du haut.
  p.rect(0, 0, L, Math.max(1, e - 1), BOIS_BLOND.fond);
  if (e > 2) p.rect(0, e - 2, L, 1, BOIS_BLOND.sombre);
}

// ---------------------------------------------------------------------------------------------------------------------
// La scène de théâtre : les rideaux noués, le lambrequin frangé d'or, la toile peinte, les étoiles de papier, la rampe.
// ---------------------------------------------------------------------------------------------------------------------

/** Une étoile de papier, pendue à son fil. */
function etoile(p: Planche, x: number, y: number, fil: number, grande: boolean, couleur: string): void {
  p.rect(x, y, 1, fil, "#c9b99c");
  const cy = y + fil + (grande ? 2 : 1);
  if (grande) {
    p.rect(x - 2, cy, 5, 1, couleur);
    p.rect(x, cy - 2, 1, 5, couleur);
    p.rect(x - 1, cy - 1, 3, 3, couleur);
    p.poser(x, cy, eclaircir(couleur, 0.5));
  } else {
    p.rect(x - 1, cy, 3, 1, couleur);
    p.rect(x, cy - 1, 1, 3, couleur);
  }
}

function peindreTheatre(p: Planche, o: ParametresDuFond): void {
  const c = cadrer(o);
  const { L, H, sol, g, k, h } = c;
  const rouge = eclaircir(adoucir(melanger("#d8505c", o.accent, 0.3), 0.15), 0.18);
  const plis = [eclaircir(rouge, 0.22), rouge, assombrir(rouge, 0.12), rouge];
  const or = "#f4d27a";

  // La toile peinte : un ciel pâle, des collines plates, un soleil de carton.
  degrade(p, 0, sol - 1, "#e4effb", "#fdf3df", 4);
  for (let x = 0; x < L; x++) {
    const hc = Math.max(1, Math.round(sol * 0.1 * (1.2 + Math.sin((x / L) * Math.PI * 2 + (o.graine % 13)))));
    p.rect(x, sol - hc, 1, hc, "#d7e8c4");
  }

  // Les planches, un rond de lumière sous la chose, puis le bord de la scène et sa rampe.
  plancher(p, c, "#e6c79c", "#dcbb8e", 22);
  const bord = H - sol >= 6 ? Math.max(1, k(2)) : 0;
  if (H - sol - bord >= 3) {
    const ry = Math.max(1, Math.floor((H - sol - bord - 1) / 2));
    const rx = Math.round(L * 0.26);
    ovale(p, Math.round(L / 2), sol + 1 + ry, rx, ry, (dx, dy) => (trame(Math.round(L / 2) + dx, sol + 1 + ry + dy, 0.5) ? "#f1dcb4" : null));
  }
  if (bord > 0) {
    p.rect(0, H - bord, L, bord, BOIS.fond);
    p.rect(0, H - bord, L, 1, BOIS_BLOND.clair);
    const pas = Math.max(5, k(9));
    for (let x = Math.floor(pas / 2) + (o.graine % 3); x < L - 1; x += pas) {
      p.rect(x - 1, H - bord - 1, 3, 1, "#fbe9a6");
      p.poser(x, H - bord - 2, "#fff6cf");
    }
  }

  // Les étoiles de papier, pendues devant la toile, au-dessus de la chose.
  const hv = Math.max(2, k(4));
  const etoiles = c.fin === 0 ? 2 : c.fin === 1 ? 5 : 7;
  for (let i = 0; i < etoiles; i++) {
    const x = Math.round(g * 0.8 + ((i + 0.3 + h() * 0.4) / etoiles) * (L - g * 1.6));
    const grande = c.fin === 2 && h() < 0.7;
    const fil = entre(h, 1, Math.max(1, k(6)));
    const bas = hv + fil + (grande ? 5 : 3);
    if (!horsZone(o, x - 2, bas, 1) || !horsZone(o, x + 2, bas, 1)) continue;
    etoile(p, x, hv, fil, grande, i % 3 === 1 ? c.vif : or);
  }

  // Les rideaux noués : larges en haut, serrés par l'embrasse, évasés jusqu'aux planches.
  const lr = Math.max(4, Math.round(g * 0.82));
  const bas = Math.min(H - 1 - bord, sol + Math.max(1, k(2)));
  const noeud = Math.round(hv + (bas - hv) * 0.6);
  for (let y = 0; y <= bas; y++) {
    const t = Math.max(0, y - hv) / Math.max(1, bas - hv);
    const l = Math.max(2, Math.round(lr * (t < 0.6 ? 1 - 0.5 * (t / 0.6) ** 2 : 0.5 + 0.22 * ((t - 0.6) / 0.4))));
    for (let i = 0; i < l; i++) {
      const pli = plis[Math.floor((i / l) * Math.max(2, Math.round(lr / 2))) % plis.length]!;
      const couleur = y === noeud || (c.fin === 2 && y === noeud + 1) ? or : pli;
      p.poser(i, y, couleur);
      p.poser(L - 1 - i, y, couleur);
    }
  }

  // Le lambrequin : une frise du même rouge, festonnée, frangée d'or.
  const feston = Math.max(4, k(8));
  for (let x = 0; x < L; x++) {
    const creux = Math.round(Math.max(1, k(2)) * Math.abs(Math.sin(((x + 0.5) / feston) * Math.PI)));
    const bout = Math.max(1, hv - Math.max(1, k(2)) + creux);
    for (let y = 0; y < bout; y++) p.poser(x, y, y === bout - 1 ? or : Math.floor(x / Math.max(1, Math.round(feston / 4))) % 2 === 0 ? rouge : plis[0]!);
  }
  p.rect(0, 0, L, 1, assombrir(rouge, 0.15));

  // Les deux projecteurs, sous le lambrequin, tournés vers le milieu.
  if (c.fin === 2) {
    const lp = Math.max(2, k(2.4));
    for (const cote of [0, 1] as const) {
      const x = cote === 0 ? lr + 1 : L - lr - 1 - lp;
      const y = hv + 1;
      if (!horsZone(o, x, y + lp, 1) || !horsZone(o, x + lp, y + lp, 1)) continue;
      p.rect(x + Math.floor(lp / 2), hv - 1, 1, 2, FER.fond);
      p.rect(x, y, lp, lp, FER.fond);
      p.rect(x, y, lp, 1, FER.clair);
      p.rect(cote === 0 ? x + lp - 1 : x, y + lp - 1, 1, 1, "#fff6cf");
      p.rect(cote === 0 ? x + lp : x - 1, y + lp, 1, 1, "#fff6cf");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------

const scene = (id: SceneDeFond["id"], peindre: SceneDeFond["peindre"]): SceneDeFond => ({ id, nom: CATALOGUE_DES_SCENES[id].nom, peindre });

export const SCENES_D: readonly SceneDeFond[] = [
  scene("cuisine", peindreCuisine),
  scene("fournil", peindreFournil),
  scene("taverne", peindreTaverne),
  scene("fete-du-village", peindreFete),
  scene("chantier", peindreChantier),
  scene("chambre-douillette", peindreChambre),
  scene("scene-de-theatre", peindreTheatre),
];
