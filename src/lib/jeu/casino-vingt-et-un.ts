/**
 * Le jeu de cartes gaulois du vingt-et-un, au Palais d'or (maquette de Claude Fable 5.2, validée par le pilote le 22 novembre
 * 2026, portée telle quelle, le pourpre devenu bordeaux) : quatre enseignes (torques, flammes, épées, feuilles de chêne), des
 * figures en vrais Gaulois du site (`casesDuGaulois`, tenues de la maquette), de l'ivoire, un filet d'or ; le dos, le sabot,
 * la caisse, le rond de la mise, la lueur d'un 21 d'entrée, le décor de la table, les petites icônes des gestes et le druide
 * du conseil. Tout est peint en points sur la toile du casino (`casino-toile.ts`).
 *
 * Rien ici ne décide d'un résultat : ce ne sont que des dessins et la mise en page de la table, d'après sa largeur. Le serveur
 * tire chaque carte (`contrat-casino.ts`). Sans navigateur : se teste dans Node.
 */
import type { CarteDuVingtEtUn } from "../village/contrat-casino";
import { RANGS } from "../village/casino/vingt-et-un";
import { GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, type Tenue } from "../gaulois";
import { BAYER, BORDEAUX, ENCRE, IVOIRE, NOIR, OR, RUBIS, SAPHIR, EMERAUDE, Toile, disque, ecrisSur, hex, largeurDuTexte, pair, type Rampe, type Rvb } from "./casino-toile";

/** Une carte : 45 points sur 64 (90 pixels sur 128 à l'écran). */
export const CL = 45;
export const CH = 64;
/** Une carte à l'écran, en pixels. */
export const LC = CL * 2;
export const HC = CH * 2;

const bayer = (x: number, y: number): number => BAYER[(y & 3) * 4 + (x & 3)]!;
const c = (r: Rampe, i: number): Rvb => r.c[i]!;

/** Clair, corps, sombre, encre du chiffre ; torques et flammes sont chaudes, épées et chênes sont froides. */
const TONS: readonly (readonly [Rvb, Rvb, Rvb, Rvb])[] = (
  [
    ["#ffe27a", "#dfa01c", "#9c6a0c", "#7a4e00"],
    ["#ffb0a8", "#e0263a", "#a8101f", "#a8101f"],
    ["#b9d4ff", "#3f7dff", "#0b3fc4", "#0b3fc4"],
    ["#b9f2c4", "#35b862", "#157a3c", "#0f6a30"],
  ] as const
).map((l) => [hex(l[0]), hex(l[1]), hex(l[2]), hex(l[3])] as const);

/** Les quatre enseignes en 7 points sur 7 : a le clair, b le corps, c le sombre, y le cœur jaune de la flamme. */
const ENSEIGNE: readonly (readonly string[])[] = [
  ["..bbb..", ".ab.bb.", "ab...bc", "ab...bc", ".b...c.", "abb.bcc", ".b...c."], // le torque : un anneau ouvert, deux boules
  ["...b...", "..ab...", "..bb.b.", ".abbbb.", "abbybbc", "abyyybc", ".cbbbc."], // la flamme
  ["...a...", "..abc..", "..abc..", "..abc..", "cbbbbbc", "...b...", "..cbc.."], // l'épée, pointe en haut
  ["...b...", "..bab..", "bbbabbb", ".bbabc.", "bbbabcc", ".bbacc.", "...c..."], // la feuille de chêne
];
const PAPIER = hex("#fbf6e6");
const PAPIER_BAS = hex("#e3d8ba");
const BLANC = hex("#ffffff");
const JAUNE = hex("#ffd84a");
const mele = (a: Rvb, b: Rvb, t: number): Rvb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const grille = (lignes: readonly string[], pal: Readonly<Record<string, Rvb>>): Toile => {
  const T = new Toile(lignes[0]!.length, lignes.length);
  lignes.forEach((l, y) => {
    for (let x = 0; x < l.length; x++) {
      const v = pal[l[x]!];
      if (v) T.p(x, y, v);
    }
  });
  return T;
};
const pip = (e: number): Toile => grille(ENSEIGNE[e]!, { a: TONS[e]![0], b: TONS[e]![1], c: TONS[e]![2], y: JAUNE });
const pipClair = (e: number): Toile => grille(ENSEIGNE[e]!, { a: BLANC, b: PAPIER, c: PAPIER_BAS, y: PAPIER });
const pipOr = (): Toile => grille(ENSEIGNE[0]!, { a: c(OR, 7), b: c(OR, 6), c: c(OR, 4) });
const lit = (T: Toile, x: number, y: number): Rvb => {
  const i = (y * T.w + x) * 4;
  return [T.d[i]!, T.d[i + 1]!, T.d[i + 2]!];
};
/** La même toile, `k` fois plus grande. */
const agrandi = (T: Toile, k: number): Toile => {
  const o = new Toile(T.w * k, T.h * k);
  for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (T.a(x, y)) o.r(x * k, y * k, k, k, lit(T, x, y));
  return o;
};
/** La même toile, la tête en bas. */
const renverse = (T: Toile): Toile => {
  const o = new Toile(T.w, T.h);
  for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (T.a(x, y)) o.p(T.w - 1 - x, T.h - 1 - y, lit(T, x, y));
  return o;
};
/** Rogne ce qui est vide autour du dessin. */
const rogne = (T: Toile): Toile => {
  let x0 = T.w;
  let x1 = -1;
  let y0 = T.h;
  let y1 = -1;
  for (let y = 0; y < T.h; y++)
    for (let x = 0; x < T.w; x++)
      if (T.a(x, y)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const o = new Toile(x1 - x0 + 1, y1 - y0 + 1);
  o.pose(T, -x0, -y0);
  return o;
};
/** Le V du valet, plus droit que celui de l'écriture. */
const V_DU_VALET = ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."];
/** La valeur, en gras, dans l'écriture du kit. */
const gras = (t: string, coul: Rvb): Toile => {
  if (t === "V") {
    const T = new Toile(6, 7);
    V_DU_VALET.forEach((l, y) => {
      for (let x = 0; x < 5; x++)
        if (l[x] === "#") {
          T.p(x, y, coul);
          T.p(x + 1, y, coul);
        }
    });
    return T;
  }
  const T = new Toile(largeurDuTexte(t) + 4, 14);
  ecrisSur(T, t, 0, 3, coul);
  ecrisSur(T, t, 1, 3, coul);
  return rogne(T);
};

/* ---------- Les vrais Gaulois des figures et du druide ---------- */

/**
 * Les figures : valet, dame, roi de chaque enseigne, habillés d'objets de la garde-robe (tenues de la maquette de Claude
 * Fable 5.2, sans arme). Le dessin est celui du site, `casesDuGaulois`, non rogné.
 */
export const TENUES_DES_FIGURES: readonly (readonly [Tenue, Tenue, Tenue])[] = [
  [
    { cheveux: "courts", teinte_cheveux: "blond", barbe: "aucune", yeux: "vifs", tete: "casque-cuir", haut: "gilet-cuir-cloute" },
    { cheveux: "tresses", teinte_cheveux: "blond", barbe: "aucune", yeux: "amande", tete: "couronne-fleurs", haut: "tunique-brodee" },
    { cheveux: "longs", teinte_cheveux: "blond", barbe: "fleuve", yeux: "severe", tete: "couronne", haut: "manteau-hermine" },
  ],
  [
    { cheveux: "bol", teinte_cheveux: "roux", barbe: "aucune", yeux: "vifs", tete: "bandeau", haut: "plastron-cuir" },
    { cheveux: "chignon", teinte_cheveux: "cuivre", barbe: "aucune", yeux: "amande", tete: "couronne-moissons", haut: "tunique-fete" },
    { cheveux: "longs", teinte_cheveux: "roux", barbe: "tressee", yeux: "severe", tete: "casque-or", haut: "cape-chef" },
  ],
  [
    { cheveux: "herisses", teinte_cheveux: "noir", barbe: "trois-jours", yeux: "vifs", tete: "casque-nasal", haut: "cotte-mailles" },
    { cheveux: "queue-de-cheval", teinte_cheveux: "noir", barbe: "aucune", yeux: "amande", tete: "couronne-givre", haut: "manteau-plumes" },
    { cheveux: "longs", teinte_cheveux: "gris", barbe: "deux-tresses", yeux: "severe", tete: "couronne", haut: "cuirasse-bronze" },
  ],
  [
    { cheveux: "meches", teinte_cheveux: "chatain", barbe: "aucune", yeux: "vifs", tete: "capuche", haut: "tunique-verte" },
    { cheveux: "longs", teinte_cheveux: "chatain", barbe: "aucune", yeux: "amande", tete: "bois-cerf", haut: "tunique-verte" },
    { cheveux: "longs", teinte_cheveux: "chatain", barbe: "fleuve", yeux: "severe", tete: "couronne-moissons", haut: "torque-or" },
  ],
];
/** Le druide du conseil. */
export const TENUE_DU_DRUIDE: Tenue = { cheveux: "longs", teinte_cheveux: "blanc", barbe: "fleuve", yeux: "vifs", tete: "capuche", haut: "cape-capuche" };

/** Les `h` premières rangées d'un vrai Gaulois, sans rognage (48 points de large). */
function gauloisEntier(t: Tenue, h: number): Toile {
  const cases = casesDuGaulois({ ...TENUE_DE_DEPART, arme: "aucune", ...t });
  const T = new Toile(GAULOIS_LARGEUR, h);
  const memo = new Map<string, Rvb>();
  for (let k = 0; k < GAULOIS_LARGEUR * h && k < cases.length; k++) {
    const v = cases[k];
    if (!v) continue;
    let rvb = memo.get(v);
    if (!rvb) memo.set(v, (rvb = hex(v)));
    T.p(k % GAULOIS_LARGEUR, (k / GAULOIS_LARGEUR) | 0, rvb);
  }
  return T;
}
const BUSTES = new Map<number, Toile>();
/** Le buste d'une figure : `e` l'enseigne, `f` 0 valet, 1 dame, 2 roi. */
export function busteDeFigure(e: number, f: number): Toile {
  const cle = e * 3 + f;
  let b = BUSTES.get(cle);
  if (!b) BUSTES.set(cle, (b = gauloisEntier(TENUES_DES_FIGURES[e]![f]!, 46)));
  return b;
}

/* ---------- Les cartes ---------- */

/** Le coin : la valeur en gras, l'enseigne dessous. Il se lit seul, même quand les cartes se chevauchent. */
function coin(r: number, e: number): Toile {
  const g = gras(RANGS[r]!, TONS[e]![3]);
  const w = Math.max(8, g.w + 1);
  const T = new Toile(w, 16);
  T.pose(g, RANGS[r] === "10" ? 0 : Math.floor((w - g.w) / 2), 0);
  T.pose(pip(e), Math.floor((w - 7) / 2), 9);
  return T;
}
/** Le carton : un cerne d'encre aux coins arrondis, un filet d'or, l'ivoire. `champ(x, y, m)` peint l'intérieur. */
function carton(champ: (x: number, y: number, m: number) => Rvb | null): Toile {
  const T = new Toile(CL, CH);
  T.tout((x, y) => {
    const dx = Math.min(x, CL - 1 - x);
    const dy = Math.min(y, CH - 1 - y);
    const m = Math.min(dx, dy);
    if (dx + dy < 2) return null;
    if (m === 0 || dx + dy === 2) return ENCRE;
    if (m === 1) return c(OR, x + y < (CL + CH) / 2 ? 6 : 4);
    return champ(x, y, m);
  });
  return T;
}
const ivoire = (x: number, y: number, m: number): Rvb => (m === 2 && (x === CL - 3 || y === CH - 3) ? c(IVOIRE, 4) : IVOIRE.t(1 - ((x + y) / (CL + CH)) * 0.2, x, y, 0.5));
/** Où tombent les enseignes des cartes de 2 à 10 : colonne (0 gauche, 1 milieu, 2 droite), hauteur de 0 à 1. */
const DISPOSITIONS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  2: [[1, 0], [1, 1]],
  3: [[1, 0], [1, 0.5], [1, 1]],
  4: [[0, 0], [2, 0], [0, 1], [2, 1]],
  5: [[0, 0], [2, 0], [1, 0.5], [0, 1], [2, 1]],
  6: [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  7: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  8: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [1, 0.75], [0, 1], [2, 1]],
  9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, 0.5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
  10: [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]],
};
const FACES = new Map<number, Toile>();
/** La face d'une carte (`r` le rang de 0 à 12, `e` l'enseigne de 0 à 3). */
export function face(carte: CarteDuVingtEtUn): Toile {
  const cle = carte.e * 13 + carte.r;
  const deja = FACES.get(cle);
  if (deja) return deja;
  const { r, e } = carte;
  const [clair, corps, sombre] = TONS[e]!;
  const T = carton(ivoire);
  const co = coin(r, e);
  const p = pip(e);
  if (r === 0) {
    // l'as : l'enseigne en grand, dans un collier de grains d'or
    const cx = 22;
    const cy = 32;
    const libre = (x: number, y: number): boolean => !((x < 13 && y < 22) || (x > CL - 14 && y > CH - 23));
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * 18);
      const y = Math.round(cy + Math.sin(a) * 18);
      if (libre(x, y)) T.p(x, y, i % 2 ? c(OR, 5) : c(OR, 3));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.round(cx + Math.cos(a) * 18);
      const y = Math.round(cy + Math.sin(a) * 18);
      if (!libre(x, y)) continue;
      T.r(x - 1, y - 1, 3, 3, c(OR, 3));
      T.p(x, y, c(OR, 7));
      T.p(x - 1, y - 1, c(OR, 6));
    }
    const grand = new Toile(23, 23);
    grand.pose(agrandi(p, 3), 1, 1);
    grand.cerne(sombre);
    T.pose(grand, cx - 11, cy - 11);
  } else if (r >= 10) {
    // valet, dame, roi : le buste d'un vrai Gaulois dans sa fenêtre dorée, et une, deux ou trois enseignes dessous
    const fond = mele(PAPIER, clair, 0.55);
    const semis = mele(PAPIER, clair, 0.95);
    T.f(4, 4, CL - 4, CH - 4, (x, y) => (x === 4 || y === 4 ? c(OR, 5) : x === CL - 5 || y === CH - 5 ? c(OR, 3) : (x + y) % 4 === 0 && (x - y + 64) % 4 === 0 ? semis : fond));
    const b = busteDeFigure(e, r - 10);
    for (let y = 5; y < CH - 16; y++) for (let x = 5; x < CL - 5; x++) if (b.a(x + 2, y - 6)) T.p(x, y, lit(b, x + 2, y - 6));
    const yb = CH - 16;
    T.r(5, yb - 1, CL - 10, 1, sombre);
    T.r(5, yb, CL - 10, 11, corps);
    T.r(5, yb, CL - 10, 1, c(OR, 6));
    T.r(5, yb + 10, CL - 10, 1, sombre);
    const n = r - 9;
    const x0 = (r === 12 ? 16 : 22) - Math.floor((n * 8 + 1) / 2);
    for (let i = 0; i < n; i++) {
      const m = new Toile(9, 9);
      m.pose(pipClair(e), 1, 1);
      m.cerne(sombre);
      T.pose(m, x0 + i * 8, yb + 1);
    }
    // les deux coins sur leur languette d'ivoire
    const w = co.w + 2;
    const lang = new Toile(w + 3, 23);
    lang.f(2, 2, w + 2, 22, (x, y) => IVOIRE.t(0.96, x, y, 0.5));
    lang.r(w + 2, 3, 1, 19, c(OR, 3));
    lang.r(3, 22, w, 1, c(OR, 3));
    lang.pose(co, 3, 4);
    T.pose(lang, 0, 0);
    T.pose(renverse(lang), CL - lang.w, CH - lang.h);
    FACES.set(cle, T);
    return T;
  } else {
    // toutes les enseignes restent debout : une flamme ne brûle pas la tête en bas
    const xs = [12, 19, 26];
    const y0 = 9;
    const y1 = CH - 16;
    for (const [col, h] of DISPOSITIONS[r + 1]!) T.pose(p, xs[col]!, Math.round(y0 + h * (y1 - y0)));
  }
  T.pose(co, 3, 4);
  T.pose(renverse(co), CL - 3 - co.w, CH - 4 - co.h);
  FACES.set(cle, T);
  return T;
}

let DOS: Toile | null = null;
/** Le dos : un jonc d'or torsadé, un velours bordeaux à losanges, un torque d'or sur un rubis. */
export function dos(): Toile {
  if (DOS) return DOS;
  const T = carton((x, y, m) => {
    if (m === 2 || m === 5) return ENCRE;
    if (m < 5) {
      const long = Math.min(y, CH - 1 - y) === m ? x : y;
      const j = m - 3;
      return (long + j) % 4 < 2 ? c(OR, j ? 4 : 6) : c(OR, j ? 3 : 4);
    }
    return (x + y) % 6 === 0 || (x - y + 60) % 6 === 0 ? c(BORDEAUX, 5) : BORDEAUX.t(0.26 - (y / CH) * 0.08, x, y, 0.4);
  });
  const mx = 22;
  const my = 32;
  T.f(mx - 14, my - 17, mx + 15, my + 18, (x, y) => {
    const d = Math.abs(x - mx) / 13 + Math.abs(y - my) / 16;
    if (d > 1.02) return null;
    if (d > 0.93) return ENCRE;
    if (d > 0.8) return c(OR, x + y < mx + my ? 6 : 4);
    if (d > 0.74) return c(OR, 2);
    return RUBIS.t(y < my ? 0.56 - d * 0.14 : 0.34 - d * 0.1, x, y, 0.5);
  });
  const t = new Toile(16, 16);
  t.pose(agrandi(pipOr(), 2), 1, 1);
  t.cerne(c(RUBIS, 0));
  T.pose(t, mx - 8, my - 8);
  for (const [x, y] of [
    [9, 9],
    [CL - 11, 9],
    [9, CH - 11],
    [CL - 11, CH - 11],
  ] as const) {
    T.r(x, y, 2, 2, c(OR, 7));
    T.p(x + 1, y + 1, c(OR, 4));
  }
  return (DOS = T);
}

/* ---------- Ce qui est posé sur la table ---------- */

const laque = (x: number, y: number, v: number): Rvb => NOIR.t(v, x, y, 0.5);
/** Le sabot : la boîte de laque d'où sortent les cartes. 36 points sur 34. */
export function sabot(): Toile {
  const T = new Toile(36, 34);
  T.f(0, 0, 36, 34, (x, y) => {
    const dx = Math.min(x, 35 - x);
    const dy = Math.min(y, 33 - y);
    const m = Math.min(dx, dy);
    if (dx + dy < 1) return null;
    if (m === 0) return ENCRE;
    if (m === 1) return c(OR, x + y < 34 ? 6 : 3);
    if (m === 2) return ENCRE;
    return laque(x, y, 0.55 - (y / 34) * 0.34 + (x + y < 20 ? 0.12 : 0));
  });
  T.r(5, 5, 26, 15, ENCRE);
  T.f(6, 6, 30, 19, (x, y) => ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0 ? c(BORDEAUX, 5) : c(BORDEAUX, 2)));
  for (let k = 0; k < 6; k++) T.r(6, 6 + k, 24, 1, k % 2 ? c(IVOIRE, k === 5 ? 3 : 5) : c(OR, k ? 4 : 6)); // la tranche des cartes
  T.r(6, 12, 24, 1, ENCRE);
  T.r(5, 20, 26, 1, c(OR, 3));
  T.pose(pipOr(), 14, 23);
  T.p(8, 26, c(OR, 5));
  T.p(27, 26, c(OR, 5));
  return T;
}
/** La caisse du croupier : ses jetons rangés par valeur. 44 points sur 20. */
export function caisse(): Toile {
  const T = new Toile(44, 20);
  T.f(0, 0, 43, 18, (x, y) => {
    const dx = Math.min(x, 42 - x);
    const dy = Math.min(y, 17 - y);
    const m = Math.min(dx, dy);
    if (dx + dy < 1) return null;
    if (m === 0) return ENCRE;
    if (m === 1) return c(OR, x + y < 30 ? 6 : 3);
    return laque(x, y, 0.4 - (y / 20) * 0.2);
  });
  [IVOIRE, RUBIS, SAPHIR, EMERAUDE, BORDEAUX].forEach((rp, i) => {
    const x = 4 + i * 7;
    const base = rp === IVOIRE ? 0.84 : rp === BORDEAUX ? 0.56 : 0.58;
    T.r(x - 1, 3, 7, 12, ENCRE);
    T.f(x, 4, x + 5, 14, (px, py) => ((py - 4) % 2 ? rp.t(base - 0.24, px, py, 0) : rp.t(base + (px === x ? 0.2 : 0), px, py, 0)));
    T.r(x + 2, 4, 1, 10, rp === IVOIRE ? c(OR, 5) : c(IVOIRE, 5));
  });
  return T;
}
/** Le rond de la mise : un collier de grains d'or frappé dans le feutre. 32 points sur 32. */
export function rond(): Toile {
  const T = new Toile(32, 32);
  disque(T, 15.5, 15.5, 15, (r, a, x, y) => {
    if (r > 0.9) return Math.round((a + Math.PI) * 9) % 2 ? c(OR, 5) : c(OR, 3);
    if (r > 0.8) return null;
    if (r > 0.74) return c(OR, 2);
    return (x + y) % 2 ? c(BORDEAUX, 2) : null;
  });
  return T;
}
/**
 * La place de « Trois cartes » : un cadre de grains d'or comme le rond de la mise, une carte du croupier en haut, les deux
 * du joueur en bas, reliées d'un fil d'or. `vif` : allumée, quand la mise à côté gagne. 42 points sur 36 (maquette « Trois
 * cartes », 28 novembre 2026).
 */
export function placeDesTrois(vif: boolean): Toile {
  const W = 42;
  const H = 36;
  const R = 7;
  const T = new Toile(W, H);
  const t = { a: c(OR, vif ? 7 : 5), b: c(OR, vif ? 6 : 3), filet: c(OR, vif ? 5 : 2), carte: c(OR, vif ? 6 : 4), fond: c(BORDEAUX, vif ? 4 : 3) };
  // la distance au bord d'un rectangle aux coins ronds : négative dedans
  const bord = (x: number, y: number): number => {
    const qx = Math.abs(x + 0.5 - W / 2) - (W / 2 - R);
    const qy = Math.abs(y + 0.5 - H / 2) - (H / 2 - R);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
  };
  T.tout((x, y) => {
    const d = bord(x, y);
    if (d > 0) return null;
    if (d > -1.6) return Math.floor((x + y) / 2) % 2 ? t.a : t.b;
    if (d > -2.6) return null;
    if (d > -3.3) return t.filet;
    return (x + y) % 2 ? c(BORDEAUX, 2) : null;
  });
  for (const [x, y] of [
    [17, 6],
    [11, 19],
    [23, 19],
  ] as const) {
    T.r(x, y, 8, 11, t.carte);
    T.r(x + 1, y + 1, 6, 9, t.fond);
    T.r(x + 3, y + 4, 2, 3, t.carte);
  }
  for (let k = 0; k <= 6; k++) {
    T.p(19 - k, 17 + Math.round(k * 0.3), t.filet);
    T.p(24 + k, 17 + Math.round(k * 0.3), t.filet);
  }
  return T;
}
/** La lueur chaude d'un 21 d'entrée : des grains d'or tramés, plus serrés au cœur. Elle monte lentement (feuille de style). */
export function lueurDuVingtEtUn(w: number, h: number): Toile {
  const T = new Toile(w, h);
  T.tout((x, y) => {
    const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
    if (d >= 1) return null;
    const f = (1 - d) * (1 - d) * 1.5;
    return f > bayer(x, y) + 0.5 ? (f > 0.8 ? c(OR, 6) : c(OR, 5)) : null;
  });
  return T;
}

/* ---------- La mise en page de la table : tout en pixels pairs, à partir de sa largeur ---------- */

/** La place de chaque chose sur la table, en pixels (la maquette : `mesurer`). */
export interface MiseEnPageDuVingtEtUn {
  W: number;
  H: number;
  /** Une table de moins de 440 pixels : une seule ligne de règles, pas de caisse, le médaillon du croupier sur la table. */
  etroit: boolean;
  lignes: 1 | 2;
  /** Le milieu de la table, et celui de la main du croupier (un peu à gauche sur une table étroite, à côté du médaillon). */
  cx: number;
  cxT: number;
  /** Le haut des cartes du croupier, la ligne des règles, le haut des cartes du joueur, le haut du rond de la mise. */
  yT: number;
  yL: number;
  yJ: number;
  yM: number;
  /** L'écart du milieu de chaque main après une séparation. */
  sep: number;
  sabot: { x: number; y: number };
  caisse: { x: number; y: number };
  /**
   * Le coin haut gauche de la place de « Trois cartes » (`LT` sur `HT`) : à gauche de la mise, sur la ligne du rond, à la
   * place des enseignes tissées ; son nom est gravé dessous. Elle ne touche ni le rond, ni les cartes du joueur.
   */
  trois: { x: number; y: number };
}
/** La place de « Trois cartes », en pixels (42 points sur 36). */
export const LT = 84;
export const HT = 72;
export function miseEnPage(largeur: number): MiseEnPageDuVingtEtUn {
  const W = pair(largeur);
  const etroit = W < 440;
  const lignes = etroit ? 1 : 2;
  const yT = 48;
  const yL = yT + HC + 18;
  const yJ = yL + lignes * 24 + 28;
  const yM = yJ + HC + 12;
  // sous le rond : la place de « Trois cartes » dépasse de 2 pixels, puis son nom gravé (16 pixels), puis le bord
  const H = yM + 64 + 44;
  const cx = pair(W / 2);
  const trois = { x: pair(Math.min(96, cx - 32 - 12 - LT / 2) - LT / 2), y: yM - 6 };
  return { W, H, etroit, lignes, cx, cxT: etroit ? cx - 4 : cx, yT, yL, yJ, yM, sep: pair(Math.min(W * 0.25, 150)), sabot: { x: W - 26 - 72, y: 26 }, caisse: { x: 26, y: 26 }, trois };
}

/**
 * Où tombent les `n` cartes d'une main centrée sur `cx` : elles se chevauchent pour tenir dans la largeur (deux mains après une
 * séparation se partagent la table).
 */
export function placesDesCartes(G: MiseEnPageDuVingtEtUn, n: number, cx: number, y: number, deuxMains: boolean): { x: number; y: number }[] {
  const large = deuxMains ? 2 * G.sep - 12 : Math.min(G.W - 44, 330);
  const dx = n > 1 ? pair(Math.min(G.etroit ? 36 : 52, (large - LC) / (n - 1))) : 0;
  const x0 = pair(cx - (LC + (n - 1) * dx) / 2);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * dx, y }));
}

/**
 * Le décor de la table, peint par-dessus le feutre : une flaque de lumière, un filet, les deux règles du croupier frappées à
 * l'or, la place des cartes, le sabot et la caisse. Une toile de la moitié de la table (2 pixels par point).
 */
export function decor(G: MiseEnPageDuVingtEtUn): Toile {
  const w = G.W >> 1;
  const h = G.H >> 1;
  const T = new Toile(w, h);
  const cx = G.cx >> 1;
  T.f(8, 8, w - 8, h - 8, (x, y) => {
    const d = Math.hypot((x - cx) / (w * 0.62), (y - h * 0.5) / (h * 0.6));
    return (1 - d) * 0.55 > bayer(x, y) + 0.5 ? c(BORDEAUX, 4) : null;
  });
  const m = 11; // le filet cousu d'or, un clou à chaque coin
  for (let x = m + 2; x < w - m - 2; x += 3) {
    T.r(x, m, 2, 1, c(OR, 3));
    T.r(x, h - 1 - m, 2, 1, c(OR, 3));
  }
  for (let y = m + 2; y < h - m - 2; y += 3) {
    T.r(m, y, 1, 2, c(OR, 3));
    T.r(w - 1 - m, y, 1, 2, c(OR, 3));
  }
  for (const [x, y] of [
    [m, m],
    [w - 1 - m, m],
    [m, h - 1 - m],
    [w - 1 - m, h - 1 - m],
  ] as const) {
    T.r(x - 1, y - 1, 3, 3, c(OR, 4));
    T.p(x, y, c(OR, 7));
  }
  const frappe = (t: string, y: number): void => ecrisSur(T, t, cx - (largeurDuTexte(t) >> 1), y, c(OR, 4), c(BORDEAUX, 0));
  const yl = G.yL >> 1;
  if (G.lignes === 2) {
    frappe("21 d'entrée paie 3 pour 2", yl);
    frappe("Le croupier s'arrête à 17", yl + 12);
  } else frappe("Le croupier s'arrête à 17", yl + 1);
  const demi = (largeurDuTexte("Le croupier s'arrête à 17") >> 1) + 8;
  const ym = yl + (G.lignes === 2 ? 10 : 5);
  if (cx - demi - (m + 6) >= 14)
    for (const s of [-1, 1]) {
      // la frise : un filet d'or et son losange, de chaque côté
      const x0 = cx + s * demi;
      const x1 = s < 0 ? m + 6 : w - 1 - m - 6;
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        T.p(x, ym, c(OR, 3));
        T.p(x, ym + 1, c(BORDEAUX, 0));
      }
      for (let k = 0; k <= 3; k++) {
        T.r(x0 - k, ym - 3 + k, 2 * k + 1, 1, c(OR, k === 0 ? 6 : 4));
        T.r(x0 - k, ym + 3 - k, 2 * k + 1, 1, c(OR, 3));
      }
      T.p(x0, ym, c(OR, 7));
    }
  // le nom de la place de « Trois cartes », gravé sous elle (jamais sur le filet du bord)
  const nom = "Trois cartes";
  ecrisSur(T, nom, Math.max(m + 4, ((G.trois.x + LT / 2) >> 1) - (largeurDuTexte(nom) >> 1)), (G.trois.y + HT + 2) >> 1, c(OR, 4), c(BORDEAUX, 0));
  if (G.W >= 660)
    [0, 1, 2, 3].forEach((e) => {
      // les quatre enseignes tissées ton sur ton, à droite de la mise (à gauche, la place de « Trois cartes »)
      const g = agrandi(grille(ENSEIGNE[e]!, { a: c(BORDEAUX, 5), b: c(BORDEAUX, 4), c: c(BORDEAUX, 3), y: c(BORDEAUX, 5) }), 4);
      const x = w - m - 6 - 124 + 32 * e;
      const y = (G.yM >> 1) + 2;
      for (let j = 0; j < g.h; j++)
        for (let i = 0; i < g.w; i++)
          if (g.a(i, j)) {
            T.p(x + i + 1, y + j + 1, c(BORDEAUX, 1));
          }
      T.pose(g, x, y);
    });
  const cadre = (x: number, y: number): void => {
    for (let i = 0; i < CL + 2; i += 3) {
      T.r(x - 1 + i, y - 2, 2, 1, c(OR, 2));
      T.r(x - 1 + i, y + CH + 1, 2, 1, c(OR, 2));
    }
    for (let i = 0; i < CH + 2; i += 3) {
      T.r(x - 2, y - 1 + i, 1, 2, c(OR, 2));
      T.r(x + CL + 1, y - 1 + i, 1, 2, c(OR, 2));
    }
  };
  const ec = G.etroit ? 18 : 26;
  for (const [x, y] of [
    [G.cxT >> 1, G.yT >> 1],
    [cx, G.yJ >> 1],
  ] as const) {
    const xc = x - ((CL + ec) >> 1);
    cadre(xc, y);
    cadre(xc + ec, y);
  }
  T.poseOmbre(sabot(), G.sabot.x >> 1, G.sabot.y >> 1, 1, 2, 0.5);
  if (!G.etroit) T.poseOmbre(caisse(), G.caisse.x >> 1, G.caisse.y >> 1, 1, 2, 0.5);
  return T;
}

/* ---------- Les petites icônes des gestes : blanches, sur 16 cases, comme celles du kit ---------- */

type Rect = (x: number, y: number, w: number, h: number, v?: number) => void;
type Rond = (cx: number, cy: number, R: number, v?: number) => void;
const CREME = hex("#f6f1e3");
function icone(f: (r: Rect, d: Rond) => void): Toile {
  const T = new Toile(16, 16);
  const g = new Uint8Array(256);
  const r: Rect = (x, y, w, h, v = 1) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < 16 && j < 16) g[j * 16 + i] = v;
  };
  const d: Rond = (cx, cy, R, v = 1) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) <= R) g[y * 16 + x] = v;
  };
  f(r, d);
  for (let k = 0; k < 256; k++) if (g[k]) T.p(k % 16, k >> 4, CREME);
  return T;
}
const petiteCarte = (r: Rect, x: number, y: number, w = 7): void => {
  r(x + 1, y, w - 2, 11);
  r(x, y + 1, w, 9);
  r(x + 1, y + 1, w - 2, 9, 0);
  r(x + ((w - 2) >> 1), y + 4, 2, 3);
};
/** Les gestes du joueur, dans l'ordre des boutons. */
export const GESTES_DU_VINGT_ET_UN = ["tirer", "rester", "doubler", "separer"] as const;
export type GesteDuVingtEtUn = (typeof GESTES_DU_VINGT_ET_UN)[number];
/** Les icônes des quatre gestes (`--cas-pic-vu-<geste>`). */
export function iconesDesGestes(): Record<GesteDuVingtEtUn, Toile> {
  return {
    tirer: icone((r) => {
      petiteCarte(r, 1, 2, 8);
      r(10, 7, 6, 2);
      r(12, 5, 2, 6);
    }),
    rester: icone((r) => {
      r(4, 4, 2, 6);
      r(7, 2, 2, 8);
      r(10, 3, 2, 7);
      r(13, 5, 1, 5);
      r(4, 8, 10, 5);
      r(2, 9, 2, 3);
      r(5, 13, 8, 1);
    }),
    doubler: icone((_r, d) => {
      d(5, 10.5, 4.7);
      d(5, 10.5, 3.1, 0);
      d(5, 10.5, 1.3);
      d(10.5, 5, 5.9, 0);
      d(10.5, 5, 4.7);
      d(10.5, 5, 3.1, 0);
      d(10.5, 5, 1.3);
    }),
    separer: icone((r) => {
      petiteCarte(r, 0, 2);
      petiteCarte(r, 9, 2);
    }),
  };
}

let DRUIDE: Toile | null = null;
/** Le druide du conseil : le vrai Gaulois en druide, réduit de moitié (16 points sur 16), chaque point le ton le plus présent. */
export function druide(): Toile {
  if (DRUIDE) return DRUIDE;
  const b = gauloisEntier(TENUE_DU_DRUIDE, 40);
  const T = new Toile(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const compte = new Map<string, { n: number; c: Rvb }>();
      let mieux: string | null = null;
      let somme = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const sx = 8 + x * 2 + dx;
        const sy = 5 + y * 2 + dy;
        if (!b.a(sx, sy)) continue;
        const coul = lit(b, sx, sy);
        const k = coul.join();
        const poids = coul[0] + coul[1] + coul[2] < 120 ? 0.6 : 1;
        const n = (compte.get(k)?.n ?? 0) + poids;
        compte.set(k, { n, c: coul });
        somme += poids;
        if (!mieux || n > compte.get(mieux)!.n) mieux = k;
      }
      if (mieux && somme >= 1.5) T.p(x, y, compte.get(mieux)!.c);
    }
  return (DRUIDE = T);
}
