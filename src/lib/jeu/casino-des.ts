/**
 * Les dés (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée telle quelle :
 * dessin, mouvement et sons) : deux dés d'ivoire à points de rubis, versés d'un cornet de cuir et d'or sur une piste de
 * velours, vus de trois quarts d'en haut. Le pourpre de la maquette (les tentures du salon) est devenu le bordeaux du palais.
 *
 * Rien ici ne décide d'un résultat : le serveur tire les deux faces (`jouer_des`) avant que le cornet bouge ; chaque dé est
 * tourné dès le départ pour finir sur la face tirée (`unDe`, `etatDuDe`, testés). Où il tombe et comment il roule n'est que
 * du décor. Sans navigateur : ce module se teste dans Node (les sons ne font rien sans contexte audio).
 */
import { statere } from "./casino-dessins";
import * as Son from "./casino-sons";
import { AMBRE, BORDEAUX, ENCRE, IVOIRE, JOUR, NOIR, OR, RUBIS, Toile, borne, cadreOr, ecrisSur, grain, largeurDuTexte, lueur, mel, mur, pair, pile, rampe, ton, type Rvb } from "./casino-toile";

/* ===== La vue : de trois quarts, d'en haut. Un point du sol (x, y) à la hauteur z se peint en (x, y0 + y·KY − z·KZ). ===== */

const KY = 0.8;
const KZ = 0.6;
const PI = Math.PI;
const Q = PI / 2;
const R2 = Math.SQRT2;
const LUM: readonly number[] = (() => {
  const v = [-0.45, 0.38, 0.81];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();
const CUIR = rampe(["#170a03", "#2b1407", "#46220e", "#683416", "#8a4a20", "#aa652e", "#c98646", "#e6ad6e"]);
const BRUN: Rvb = [42, 26, 5];

/* --- Les rotations d'un dé (matrices 3 × 3, en ligne) --- */
export type Matrice = number[];
const mul = (A: Matrice, B: Matrice): Matrice => {
  const C = new Array<number>(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3]! * B[j]! + A[i * 3 + 1]! * B[3 + j]! + A[i * 3 + 2]! * B[6 + j]!;
  return C;
};
const rx = (t: number): Matrice => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const ry = (t: number): Matrice => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rz = (t: number): Matrice => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
/** Les faces d'un vrai dé : les faces opposées font 7. [axe][0 : côté plus, 1 : côté moins]. */
const FACES: readonly (readonly [number, number])[] = [
  [2, 5],
  [3, 4],
  [1, 6],
];
/** La rotation qui met la face voulue au-dessus. */
const DESSUS: Readonly<Record<number, Matrice>> = { 1: rx(0), 6: rx(PI), 2: ry(-Q), 5: ry(Q), 3: rx(Q), 4: rx(-Q) };
/** La face tournée vers le haut. */
export function faceDuDessus(M: Matrice): number {
  let m = -2;
  let f = 0;
  for (let k = 0; k < 3; k++)
    for (const s of [1, -1])
      if (M[6 + k]! * s > m) {
        m = M[6 + k]! * s;
        f = FACES[k]![s > 0 ? 0 : 1];
      }
  return f;
}
const POINTS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/** Peint un dé d'ivoire d'arête `a`, tourné par `M` : chaque point est le premier que le regard rencontre sur le cube. */
export function peindreDe(a: number, M: Matrice): Toile {
  const h = a / 2;
  const ext = Math.ceil(a * 0.92) + 2;
  const S = 2 * ext + 1;
  const T = new Toile(S, S);
  const dl = [0, 1, 2].map((k) => -M[3 + k]! * KZ - M[6 + k]! * KY);
  const ol = [0, 0, 0];
  const hit = [0, 0, 0];
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = i - ext;
      const dy = j - ext;
      const o1 = dy * KY + 100 * KZ;
      const o2 = -dy * KZ + 100 * KY;
      let tn = -1e9;
      let tf = 1e9;
      let axe = -1;
      let rate = false;
      for (let k = 0; k < 3; k++) {
        ol[k] = M[k]! * dx + M[3 + k]! * o1 + M[6 + k]! * o2;
        const dk = dl[k]!;
        if (Math.abs(dk) < 1e-9) {
          if (Math.abs(ol[k]!) > h) {
            rate = true;
            break;
          }
          continue;
        }
        let t1 = (-h - ol[k]!) / dk;
        let t2 = (h - ol[k]!) / dk;
        if (t1 > t2) {
          const t = t1;
          t1 = t2;
          t2 = t;
        }
        if (t1 > tn) {
          tn = t1;
          axe = k;
        }
        if (t2 < tf) tf = t2;
      }
      if (rate || axe < 0 || tn > tf) continue;
      for (let k = 0; k < 3; k++) hit[k] = ol[k]! + tn * dl[k]!;
      const s = dl[axe]! > 0 ? -1 : 1;
      const u = hit[(axe + 1) % 3]! / h;
      const v = hit[(axe + 2) % 3]! / h;
      const au = Math.abs(u);
      const av = Math.abs(v);
      const lum = Math.max(0, s * (M[axe]! * LUM[0]! + M[3 + axe]! * LUM[1]! + M[6 + axe]! * LUM[2]!));
      const face = s * (M[3 + axe]! * KZ + M[6 + axe]! * KY);
      let coul: Rvb | null = null;
      if (face > 0.3)
        for (const [pi, pj] of POINTS[FACES[axe]![s > 0 ? 0 : 1]]!) {
          const d = Math.hypot(u - (pi - 1) * 0.54, v - (pj - 1) * 0.54);
          if (d < 0.235) {
            coul = RUBIS.t(0.3 + lum * 0.34 + (d < 0.1 ? 0.16 : d > 0.165 ? -0.14 : 0), i, j, 0.4);
            break;
          }
        }
      if (!coul) {
        const coin = au > 0.84 && av > 0.84;
        const bord = Math.max(au, av) > 0.9;
        coul = IVOIRE.t(0.3 + 0.7 * Math.pow(lum, 1.1) - (coin ? 0.16 : bord ? 0.08 : 0), i, j, 0.5);
      }
      T.p(i, j, coul);
    }
  return T.cerne();
}

/* ===== Le décor : le salon, le croupier derrière la table, la piste de velours dans son cadre d'or ===== */

/** Les mesures de la scène, en points, pour une piste de `W` sur `H`. */
export interface Geometrie {
  W: number;
  H: number;
  /** L'arête d'un dé. */
  a: number;
  yT: number;
  e: number;
  tx0: number;
  ty0: number;
  tw: number;
  th: number;
  fx0: number;
  fx1: number;
  fy0: number;
  fy1: number;
  /** La profondeur de la piste, au sol. */
  D: number;
  cx: number;
  /** Où le cornet attend, debout près du croupier. */
  repos: { x: number; y: number };
  wc: number;
  hc: number;
  /** Où le cornet verse les dés (au sol, et à quelle hauteur). */
  B: { x: number; y: number; h: number };
  xFam: number;
}
export function geometrie(W: number, H: number): Geometrie {
  const a = pair(borne(W * 0.1, 16, 30));
  const yT = 50;
  const e = 4;
  const tx0 = 5;
  const ty0 = yT + 11;
  const tw = W - 10;
  const th = H - ty0 - 5;
  const murDuFond = Math.max(5, Math.round(a * 0.3));
  const fx0 = tx0 + e;
  const fx1 = tx0 + tw - e;
  const fy0 = ty0 + e + murDuFond;
  const fy1 = ty0 + th - e;
  const D = (fy1 - fy0) / KY;
  const cx = W >> 1;
  const repos = { x: cx + Math.max(44, Math.round(W * 0.2)), y: yT + 9 };
  const wc = Math.round(a * 1.45) + 2;
  const hc = Math.round(a * 1.9);
  return { W, H, a, yT, e, tx0, ty0, tw, th, fx0, fx1, fy0, fy1, D, cx, repos, wc, hc, B: { x: fx1 - 1.9 * a, y: 0.95 * a, h: 1.25 * a }, xFam: cx - Math.max(52, Math.round(W * 0.24)) };
}
/** La hauteur à l'écran d'un point de la piste. */
export const ecranY = (G: Geometrie, y: number, z = 0): number => G.fy0 + y * KY - z * KZ;

/** Le mur du salon : papier à losanges, tentures de velours bordeaux à frange d'or, deux appliques. */
export function peindreMur(G: Geometrie, jour: boolean): Toile {
  const { W, yT } = G;
  const T = new Toile(W, yT + 2);
  mur(T, jour, 0.5, 0.62);
  const pas = 46;
  T.f(0, 0, W, 22, (x, y) => {
    const f = ((x + 23 - ((W >> 1) % pas) + pas * 9) % pas) / pas;
    const bord = 6 + Math.pow(Math.abs(Math.sin(f * PI)), 0.8) * 9;
    if (y > bord + 1) return null;
    if (y > bord) return OR.t(0.62 + 0.3 * Math.sin(x * 1.3), x, y);
    if (y > bord - 1) return ton(OR, 2);
    const pli = 0.5 + 0.5 * Math.sin(x * 0.42 + Math.sin(y * 0.2) * 0.8);
    return BORDEAUX.t((jour ? 0.52 : 0.4) + pli * 0.22 - y / 60, x, y, 1);
  });
  if (W >= 220)
    for (const x of [Math.round(W * 0.1), Math.round(W * 0.9)]) {
      lueur(T, x, 27, 22, jour ? 0.3 : 0.5, ton(AMBRE, 5));
      T.r(x - 1, 31, 2, 9, ton(OR, 4));
      T.r(x - 4, 39, 8, 2, ton(OR, 5));
      T.r(x - 3, 41, 6, 1, ton(OR, 2));
      T.r(x - 1, 27, 2, 4, ton(IVOIRE, 5));
      for (const [dx, dy, c] of [
        [0, -4, ton(AMBRE, 4)],
        [-1, -3, ton(AMBRE, 4)],
        [0, -3, ton(AMBRE, 6)],
        [-1, -2, ton(AMBRE, 5)],
        [0, -2, ton(IVOIRE, 6)],
        [-1, -1, ton(AMBRE, 6)],
        [0, -1, ton(AMBRE, 5)],
      ] as const)
        T.p(x + dx, 27 + dy, c);
    }
  return T;
}

/** La table de laque et la piste : cadre d'or, bande du fond, velours rubis, un filet d'or brodé. */
export function peindreTable(G: Geometrie, jour: boolean): Toile {
  const { W, H, yT, e, tx0, ty0, tw, th, fx0, fx1, fy0, fy1 } = G;
  const T = new Toile(W, H);
  T.f(0, yT, W, H, (x, y) => {
    const p = y - yT;
    if (p === 0) return ton(OR, 6);
    if (p === 1) return ton(OR, 4);
    if (p === 2) return ton(OR, 2);
    const refl = Math.pow(0.5 + 0.5 * Math.cos((x - W * 0.3) * 0.03 + p * 0.05), 3);
    return jour ? JOUR.t(0.86 - (p / (H - yT)) * 0.3 + refl * 0.14, x, y, 1) : NOIR.t(0.26 + refl * 0.3 - (p / (H - yT)) * 0.12, x, y, 1);
  });
  // l'ombre portée du cadre sur la laque
  T.f(tx0 - 1, ty0 + 2, tx0 + tw + 3, ty0 + th + 3, (x, y) => ((x + y) & 1 ? (jour ? ton(JOUR, 1) : ton(NOIR, 0)) : null));
  cadreOr(T, tx0, ty0, tw, th, e);
  // la bande du fond, capitonnée, dans l'ombre
  T.f(fx0, ty0 + e, fx1, fy0, (x, y) => {
    const p = y - ty0 - e;
    const n = fy0 - ty0 - e;
    if (p === 0) return ENCRE;
    if (p === n - 1) return ton(RUBIS, 0);
    const clou = (x - fx0) % 12 === 6 && p === n >> 1;
    return clou ? ton(OR, 5) : RUBIS.t(0.2 + (p / n) * 0.1 + 0.03 * grain(x, y), x, y, 0.8);
  });
  // le velours : un projecteur doux au milieu, l'ombre des bords
  const cxm = (fx0 + fx1) / 2;
  const cym = (fy0 + fy1) / 2;
  const wf = fx1 - fx0;
  const hf = fy1 - fy0;
  T.f(fx0, fy0, fx1, fy1, (x, y) => {
    const d = Math.hypot((x - cxm) / (wf / 2), ((y - cym) / (hf / 2)) * 0.85);
    let v = 0.43 - d * d * 0.17 + 0.05 * grain(x >> 1, y >> 1) + 0.02 * grain(x, y);
    const haut = y - fy0;
    if (haut < 4) v -= 0.14 - haut * 0.035;
    if (x - fx0 < 2 || fx1 - 1 - x < 2) v -= 0.05;
    if (fy1 - 1 - y < 1) v += 0.04;
    return RUBIS.t(v, x, y, 1);
  });
  // le filet d'or brodé, un losange à chaque coin
  const m = Math.max(5, Math.round(G.a * 0.3));
  const x0 = fx0 + m;
  const x1 = fx1 - 1 - m;
  const y0 = fy0 + m;
  const y1 = fy1 - 1 - m;
  for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if ((x - x0) % 4 !== 3) T.p(x, y, ton(OR, y === y0 ? 3 : 4));
  for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) if ((y - y0) % 4 !== 3) T.p(x, y, ton(OR, 3));
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ] as const)
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j) <= 2) T.p(x + i, y + j, ton(OR, Math.abs(i) + Math.abs(j) === 0 ? 7 : i + j < 0 ? 6 : 4));
  // sur la laque, au fond : des piles de jetons et quelques statères
  if (W >= 250) {
    pile(T, 24, yT + 10, 4, jour ? RUBIS : NOIR, 7);
    pile(T, 42, yT + 10, 2, IVOIRE, 7);
    pile(T, W - 26, yT + 10, 3, RUBIS, 7);
    T.poseOmbre(statere(12), W - 50, yT - 3, 1, 1);
  }
  return T;
}

/** Le cornet : un gobelet de cuir cousu, cerclé d'or, vu d'en haut comme la piste. La bouche est en haut. */
export function peindreCornet(G: Geometrie): Toile {
  const { wc, hc } = G;
  const rxm = wc / 2;
  const rym = Math.max(3, rxm * 0.36);
  const T = new Toile(wc + 2, hc + 2);
  const cx = (wc + 2) / 2;
  const ym = rym + 1;
  const yb = hc - rym * 0.62;
  const serre = 0.3;
  const demi = (y: number): number => rxm * (1 - serre * borne((y - ym) / (yb - ym)));
  T.tout((x, y) => {
    const px = x + 0.5 - cx;
    const py = y + 0.5;
    // la bouche : un anneau d'or, le dedans sombre
    const rm = Math.hypot(px / rxm, (py - ym) / rym);
    if (rm <= 1) {
      if (rm > 0.8) return OR.t(0.52 + 0.4 * Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(py - ym, px) + 2.2), 2), x, y);
      return py < ym - rym * 0.1 ? CUIR.t(0.3 - ((ym - py) / rym) * 0.12 + (px / rxm) * -0.08, x, y) : CUIR.t(0.06, x, y, 0.4);
    }
    if (py < ym) return null;
    const hw = demi(py);
    const u = px / hw;
    if (Math.abs(u) > 1) return null;
    const creux = Math.sqrt(Math.max(0, 1 - u * u));
    const bas = yb + rym * 0.62 * creux;
    if (py > bas) return null;
    const v = (py - ym - rym * creux) / (yb - ym); // la place sur la hauteur, en suivant le galbe
    const ombre = 0.66 - 0.5 * (u + 0.32) * (u + 0.32) + 0.05 * grain(x, y);
    if (v < 0.06) return CUIR.t(ombre - 0.3, x, y); // l'ombre sous le cercle de la bouche
    if ((v > 0.2 && v < 0.29) || v > 0.9) {
      const clou = v < 0.5 && Math.abs((((u + 1) * 3.5) % 1) - 0.5) < 0.16 && v > 0.225 && v < 0.265;
      return clou ? ton(OR, 8) : OR.t(ombre + 0.1 + (v > 0.9 ? -0.1 : 0), x, y);
    }
    if ((v > 0.18 && v <= 0.2) || (v >= 0.29 && v < 0.31) || (v > 0.88 && v <= 0.9)) return ton(CUIR, 0);
    // le losange d'or repoussé, la couture d'ivoire
    const lz = Math.abs(u) * 2.4 + Math.abs(v - 0.6) * 5.2;
    if (lz < 0.7) return OR.t(lz < 0.3 ? 0.9 : ombre + 0.05, x, y);
    if (Math.abs(u - 0.56) < 0.07 && v > 0.33 && v < 0.87 && Math.floor(v * 16) % 2 === 0) return ton(IVOIRE, 4);
    return CUIR.t(ombre, x, y, 0.9);
  });
  return T.cerne();
}

/** La plaque d'or qui dit la somme, au-dessus des dés. */
export function peindrePlaque(texte: string): Toile {
  const w = largeurDuTexte(texte) + 9;
  const T = new Toile(w + 2, 15);
  T.f(1, 1, w + 1, 14, (x, y) => {
    const m = Math.min(x - 1, y - 1, w - x, 13 - y);
    const coin = (x === 1 || x === w) && (y === 1 || y === 13);
    if (coin) return null;
    if (m === 0) return ton(OR, 2);
    return y === 2 ? ton(OR, 8) : OR.t(0.8 - (y / 14) * 0.22, x, y, 0.6);
  });
  ecrisSur(T, texte, 6, 4, BRUN);
  return T.cerne();
}

/** L'icône du pari « double » : deux petits dés pareils. */
export function peindreDouble(): Toile {
  const T = new Toile(23, 10);
  for (const x0 of [0, 13]) {
    T.f(x0, 0, x0 + 10, 10, (x, y) => {
      const i = x - x0;
      const coin = (i === 0 || i === 9) && (y === 0 || y === 9);
      if (coin) return null;
      return ton(IVOIRE, y === 0 || i === 0 ? 6 : y === 9 || i === 9 ? 3 : 5);
    });
    for (const [i, j] of [
      [2, 2],
      [6, 6],
    ] as const) {
      T.r(x0 + i, j, 2, 2, ton(RUBIS, 3));
      T.p(x0 + i, j, ton(RUBIS, 5));
    }
  }
  return T.cerne();
}

/** La lueur d'or sous un dé gagnant. */
export function peindreLueur(R: number): Toile {
  const T = new Toile(2 * R, Math.round(R * 1.3));
  lueur(T, R, T.h >> 1, R, 0.62, ton(OR, 6));
  return T;
}

/* ===== Le lancer ===== */

/** Un dé lancé : où il tombe (en parts de la piste), vers où il roule, combien de fois il bascule, et sa face finale. */
export interface DeLance {
  final: number;
  mx: number;
  my: number;
  dir: number;
  ng: number;
  retard: number;
  ecart: number;
  tA: number;
  airY: number;
  airX: number;
  spin: number;
  R0: Matrice;
  bascules: [number, number][];
  /** La durée de sa course, après qu'il a quitté le cornet. */
  T: number;
}
/** L'état d'un dé à un instant : place sur le sol, hauteur, bascules finies, rotation. */
export interface EtatDuDe {
  x: number;
  y: number;
  h: number;
  n: number;
  M: Matrice;
}

const facile = (q: number): number => 0.45 * q + 0.55 * q * q * (3 - 2 * q);

/** Le hasard du décor (où tombent les dés, comment ils roulent) : jamais celui d'un résultat. */
export interface HasardDuDecor {
  entre(a: number, b: number): number;
  auSort(n: number): number;
}
export const DECOR: HasardDuDecor = { entre: (a, b) => a + Math.random() * (b - a), auSort: (n) => Math.floor(Math.random() * n) };

/** Prépare un dé. La face finale est déjà tirée par le serveur : la rotation de départ est choisie pour qu'il finisse dessus. */
export function unDe(final: number, mx: number, my: number, dir: number, ng: number, retard: number, h: HasardDuDecor = DECOR): DeLance {
  const d: DeLance = {
    final,
    mx,
    my,
    dir,
    ng,
    retard,
    ecart: retard ? 1 : -1,
    tA: 0.42,
    airY: h.entre(1.3, 2.3) * Q,
    airX: (h.auSort(2) ? 1 : -1) * h.entre(0.9, 1.9) * Q,
    spin: h.entre(-1.3, 1.3),
    R0: mul(rz(h.auSort(4) * Q), DESSUS[final] ?? DESSUS[1]!),
    bascules: [],
    T: 0,
  };
  let t0 = 0;
  const k = Math.pow(4 / ng, 0.6);
  for (let i = 0; i < ng; i++) {
    const dur = 0.15 * Math.pow(1.36, i) * k;
    d.bascules.push([t0, dur]);
    t0 += dur + 0.014 * i;
  }
  d.T = d.tA + t0;
  return d;
}

/** L'état d'un dé à l'instant `tt` de son vol : en l'air depuis le cornet, puis ses bascules sur la piste. */
export function etatDuDe(G: Geometrie, d: DeLance, tt: number): EtatDuDe {
  const a = G.a;
  const Mx = G.fx0 + d.mx * (G.fx1 - G.fx0);
  const My = d.my * G.D;
  const cs = Math.cos(d.dir);
  const sn = Math.sin(d.dir);
  if (tt < d.tA) {
    const u = borne(tt / d.tA);
    const v = 1 - u;
    return {
      x: mel(G.B.x + d.ecart * a * 0.2, Mx, u),
      y: mel(G.B.y + d.ecart * a * 0.45, My, u),
      h: G.B.h * v * v + 1.5 * a * u * v,
      n: -1,
      M: mul(mul(mul(rz(d.dir + d.spin * v * v), ry(-d.ng * Q - d.airY * v)), rx(d.airX * v)), d.R0),
    };
  }
  const t = tt - d.tA;
  let n = 0;
  let q = 0;
  for (const [t0, dur] of d.bascules) {
    if (t >= t0 + dur) n++;
    else {
      if (t > t0) q = (t - t0) / dur;
      break;
    }
  }
  const al = q > 0 ? Q * facile(q) : 0;
  const s = a * (n + (q > 0 ? 0.5 - Math.cos(al + PI / 4) / R2 : 0));
  const h = q > 0 ? (a / R2) * Math.sin(al + PI / 4) - a / 2 + ([0.34, 0.13, 0.04][n] ?? 0) * a * Math.sin(PI * q) || 0 : 0;
  return { x: Mx + s * cs, y: My + s * sn, h: Math.max(0, h), n, M: mul(mul(rz(d.dir), ry(-(d.ng - n) * Q + al)), d.R0) };
}

/** Choisit où tombent et où s'arrêtent les deux dés : ils tombent l'un contre l'autre, se cognent, puis s'écartent. */
export function preparer(G: Geometrie, a: number, b: number, h: HasardDuDecor = DECOR): [DeLance, DeLance] {
  const lf = G.fx1 - G.fx0;
  const dedans = (x: number, y: number): boolean => x >= G.fx0 + 0.8 * G.a && x <= G.fx1 - 0.8 * G.a && y >= 0.72 * G.a && y <= G.D - 0.74 * G.a;
  let p: [number, number, number, number][] = [];
  for (let essai = 0; essai < 500; essai++) {
    const sur = essai > 440;
    const cx = sur ? G.B.x - 1.2 * G.a : h.entre(G.fx0 + 3.2 * G.a, G.B.x - 0.5 * G.a);
    const cy = sur ? G.D / 2 : h.entre(1.3 * G.a, G.D - 1.3 * G.a);
    p = [
      [cx + h.entre(-0.2, 0.2) * G.a, cy - 0.6 * G.a, PI + ((sur ? 9 : h.entre(8, 30)) * PI) / 180, sur ? 3 : 3 + h.auSort(3)],
      [cx + h.entre(-0.2, 0.2) * G.a, cy + 0.6 * G.a, PI - ((sur ? 9 : h.entre(8, 30)) * PI) / 180, sur ? 2 : 3 + h.auSort(3)],
    ];
    const fin = p.map(([x, y, dir, ng]) => [x + ng * G.a * Math.cos(dir), y + ng * G.a * Math.sin(dir)] as const);
    if (!sur && (!fin.every(([x, y]) => dedans(x, y)) || !p.every(([x, y]) => dedans(x, y)) || Math.hypot(fin[0]![0] - fin[1]![0], fin[0]![1] - fin[1]![1]) < 1.8 * G.a)) continue;
    break;
  }
  const [p0, p1] = p as [[number, number, number, number], [number, number, number, number]];
  return [unDe(a, (p0[0] - G.fx0) / lf, p0[1] / G.D, p0[2], p0[3], 0, h), unDe(b, (p1[0] - G.fx0) / lf, p1[1] / G.D, p1[2], p1[3], 0.05, h)];
}

/** Les deux dés posés avant le premier lancer (ce n'est pas un résultat : la plaque ne dit rien). */
export function desDuDebut(h: HasardDuDecor = DECOR): [DeLance, DeLance] {
  return [unDe(5, 0.6, 0.42, PI + 0.3, 3, 0, h), unDe(2, 0.7, 0.72, PI - 0.22, 2, 0, h)];
}

/** Le temps du cornet : il est secoué `SECOUE` secondes, puis il verse ; les dés quittent sa bouche un souffle plus tard. */
export const SECOUE = 0.85;
export const AVANT_LE_JET = 0.14;

/** Où est le cornet à l'instant `t` du lancer (`null` : au repos), son angle, et s'il passe devant les dés. */
export function placeDuCornet(G: Geometrie, t: number | null): { x: number; y: number; ang: number; devant: boolean } {
  let x = G.repos.x;
  let y = G.repos.y - G.hc / 2;
  let ang = 0;
  let devant = false;
  if (t === null) return { x, y, ang, devant };
  const AV = -2.15;
  const bx = G.B.x;
  const by = ecranY(G, G.B.y, G.B.h + G.a * 0.3);
  const vx = bx - (G.hc / 2) * Math.sin(AV) * 0.8;
  const vy = by + (G.hc / 2) * Math.cos(AV) * 0.8;
  const hx = G.repos.x - 8;
  const hy = y - 15; // versé ; tenu en l'air
  if (t < SECOUE) {
    const u = Math.min(1, t / 0.16);
    const fin = borne((t - SECOUE + 0.12) / 0.12);
    const tr = Math.sin(t * 38) * u * (1 - fin);
    x = mel(x, hx, u) + tr * 2.6;
    y = mel(y, hy, u) + Math.cos(t * 31) * 1.8 * u * (1 - fin);
    ang = tr * 0.22;
  } else {
    const u = borne((t - SECOUE) / 0.2);
    const r = borne((t - SECOUE - 0.8) / 0.5);
    const v = u * u * (3 - 2 * u) * (1 - r * r * (3 - 2 * r));
    x = mel(mel(hx, x, r), vx, v);
    y = mel(mel(hy, y, r), vy, v);
    ang = AV * v;
    devant = v > 0.3;
  }
  return { x, y, ang, devant };
}

/** La durée d'un lancer entier, du cornet secoué au dernier dé posé. */
export const dureeDuLancer = (des: readonly DeLance[]): number => SECOUE + AVANT_LE_JET + Math.max(...des.map((d) => d.retard + d.T + 0.2));

/* --- Les sons : le cuir qu'on secoue, l'ivoire sur le velours (famille des boosters : feutré, bref, un peu de brillance) --- */

const D2 = 73.42;
const A2 = 110;
export const SONS_DES_DES = {
  secoue: (duree: number): void => {
    Son.souffle(0, 0.2, "lowpass", 300, 500, 0.8, 0.06, 0.08);
    for (let t = 0.08; t < duree - 0.08; t += DECOR.entre(0.055, 0.1)) {
      const f = DECOR.entre(700, 1300);
      Son.souffle(t, 0.035, "bandpass", f, f * 0.7, 3.5, 0.09, 0.002);
      Son.ton(DECOR.entre(1250, 1600), 1100, t, 0.03, 0.02, "triangle", 0.002);
      if (Math.random() < 0.5) Son.peau(t + 0.02, 150, 0.06, 0.08, 1.4);
    }
  },
  verse: (): void => Son.souffle(0, 0.24, "bandpass", 380, 1300, 0.9, 0.05, 0.09),
  /** Un dé sur le velours : un coup mat, une pointe d'ivoire. */
  velours: (f: number, vol: number): void => {
    Son.peau(0, f * 0.55, 0.12 * vol, 0.11, 1.5);
    Son.ton(f * 3.6, f * 3.1, 0, 0.03, 0.02 * vol, "triangle", 0.001);
    Son.souffle(0, 0.03, "lowpass", 1400, 500, 0.8, 0.06 * vol, 0.001);
  },
  /** Ivoire contre ivoire : sec et clair. */
  cogne: (): void => {
    Son.ton(1650, 1250, 0, 0.04, 0.05, "triangle", 0.001);
    Son.ton(2480, 2300, 0.004, 0.03, 0.016, "sine", 0.001);
    Son.souffle(0, 0.02, "bandpass", 2800, 1900, 2, 0.06, 0.001);
  },
  pose: (): void => Son.peau(0, 92, 0.07, 0.3, 1.9),
  beauGain: (): void => {
    Son.timbale(0, D2, 0.12, 0.9);
    Son.cor([D2, A2], 0.02, 0.9, 0.04);
  },
};
