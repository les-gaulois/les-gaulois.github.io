/**
 * La machine du forgeron (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée
 * telle quelle : dessin, mouvement et sons) : les cinq symboles peints point par point, la machine de laque et d'or à deux
 * tailles, son levier, le socle du forgeron, les statères du bac, la course des rouleaux et leurs sons. Le pourpre de la
 * maquette est devenu le bordeaux du palais (rampe `BORDEAUX`), rien d'autre n'a changé.
 *
 * Rien ici ne décide d'un résultat : le serveur tire le résultat et les neuf cases (`jouer_machine`), les rouleaux ne font
 * que les montrer, et finissent toujours sur elles (`bandeDuRouleau`, `posDuRouleau`, testés). Sans navigateur : ce module se
 * teste dans Node (les sons ne font rien sans contexte audio).
 */
import { FOIS_DE_LA_MACHINE, SUR_MILLE_DE_LA_MACHINE, casesDuResultat, lireLaLigne } from "../village/casino/machine";
import type { ResultatDeLaMachine } from "../village/contrat-casino";
import { statere } from "./casino-dessins";
import * as Son from "./casino-sons";
import { SONS } from "./casino-sons";
import { BORDEAUX, EMERAUDE, ENCRE, IVOIRE, NOIR, OR, RUBIS, SAPHIR, Toile, borne, cadreOr, disque, ecrisSur, grain, hex, largeurDuTexte, lueur, orDeCadre, rampe, ton, type Rampe, type Rvb } from "./casino-toile";

/* ---------- Les matières de la machine : le bronze de l'enseigne, la terre cuite de l'amphore, le brun des mots ---------- */

const BRONZE = rampe(["#241003", "#4a2c0c", "#7a4a12", "#a86a1e", "#c98a34", "#e6b45c", "#f8dc9c"]);
const TERRE = rampe(["#3a1206", "#74290f", "#a8431c", "#cf6a36", "#e8915c", "#f8bd92", "#ffe0c6"]);
const BRUN: Rvb = [58, 38, 6];

/* ---------- Les cinq symboles ---------- */

/** Les noms des symboles 0 à 4 (statère d'or, torque d'or, enseigne au sanglier, amphore, gui), pour les lecteurs d'écran. */
export const NOMS_DES_SYMBOLES: readonly string[] = ["statères d'or", "torques d'or", "enseignes au sanglier", "amphores", "gui"];
/** Ce que dit le croupier de chaque résultat payant. */
export const TITRES_DE_LA_MACHINE: readonly string[] = ["Trois statères", "Trois torques", "Trois enseignes", "Trois amphores", "Brin de gui"];
/** Les chances de chaque résultat payant, en mots (celles des règles du serveur, `SUR_MILLE_DE_LA_MACHINE`). */
export const CHANCES_DE_LA_MACHINE: readonly string[] = ["2 sur 1 000", "1 sur 100", "4 sur 100", "1 sur 10", "1 sur 5"];
/** La pierre de la plaque et des derniers tirages, par résultat payant. */
export type TonDeLaMachine = "or" | "rouge" | "bleue" | "verte";
export const TONS_DE_LA_MACHINE: readonly TonDeLaMachine[] = ["or", "or", "rouge", "bleue", "verte"];

const ell = (u: number, v: number, cx: number, cy: number, rx: number, ry = rx): number => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2;
const ellT = (u: number, v: number, cx: number, cy: number, rx: number, ry: number, ang: number): number => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const dx = u - cx;
  const dy = v - cy;
  return ((dx * c + dy * s) / rx) ** 2 + ((dy * c - dx * s) / ry) ** 2;
};
const seg = (u: number, v: number, x0: number, y0: number, x1: number, y1: number): number => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = borne(((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy));
  return Math.hypot(u - x0 - t * dx, v - y0 - t * dy);
};
const poly = (u: number, v: number, p: readonly (readonly [number, number])[]): boolean => {
  let d = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i]!;
    const [xj, yj] = p[j]!;
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
};
const FEUILLES: readonly (readonly [number, number, number, number, number])[] = [
  [5.4, 5.6, 2.3, 5, -0.6],
  [9.5, 4.6, 1.8, 4.2, -0.14],
  [5.6, 16.4, 2.1, 4.6, -1.36],
];
const BAIES: readonly (readonly [number, number])[] = [
  [12, 11.4],
  [9.7, 13.7],
  [14.3, 13.7],
];
const ANSE: readonly (readonly [number, number])[] = [
  [10.6, 3.2],
  [7.4, 3.2],
  [5.4, 5.2],
  [5.6, 8.4],
  [7.2, 10],
  [9.4, 7.8],
  [10.6, 7.8],
];
const CREUX: readonly (readonly [number, number])[] = [
  [10.6, 4.6],
  [8.2, 4.7],
  [7.2, 6],
  [7.5, 7.9],
  [10.6, 6.6],
];
/** Les petits dessins de la table des gains, sur 12 points : faits à la main (le statère est celui du site, le torque se peint tout seul). */
const PETITS: Readonly<Record<number, readonly string[]>> = {
  2: ["............", "..d.d.d.d...", ".BBBBBBBd.B.", "BbbbbbbbBBBB", "bbbbbbbbbkbb", ".bbbbbbbbbwb", ".b.b..b.b...", ".oOOOOOOOOo.", ".....Oo.....", ".....OoRRRRR", ".....OoRRRr.", ".....Oo....."],
  3: ["...TTTTTT...", "....tTTt....", ".tt.tTTt.tt.", ".t.TTTTTT.t.", ".tTTLTTTTTt.", ".TTLTTTTTTt.", ".dddddddddd.", ".TTLTTTTTtt.", "..TLTTTTtt..", "..TTLTTTt...", "...TTTTt....", "....TTt....."],
  4: [".GG......GG.", "GgGG....GGgG", "GGgG....GgGG", ".GGgG..GgGG.", "..GGGddGGG..", "....wwdww...", ".GGGwwdwwGG.", "GgggGddGgggG", ".GGG.dd.GGG.", ".....dd.....", ".....dd.....", ".....dd....."],
};
const PAL_PETITS: Readonly<Record<string, string>> = { B: "#e6b45c", b: "#a86a1e", d: "#4a2c0c", k: "#05040c", w: "#fffbe6", O: "#ffd84a", o: "#b9820f", R: "#d21f33", r: "#a8101f", T: "#cf6a36", L: "#f8bd92", t: "#a8431c", G: "#3fce6a", g: "#8beda4" };

type Forme = (u: number, v: number, x: number, y: number) => Rvb | null;
const FORMES: readonly (Forme | null)[] = [
  null, // le statère : la vraie pièce du site, posée telle quelle
  // le torque : une tige d'or torsadée, fine, presque refermée, deux boules à l'ouverture
  (u, v, x, y) => {
    for (const s of [-1, 1]) {
      const bx = 12 + s * 4;
      const by = 19.1;
      if (Math.hypot(u - bx, v - by) <= 3.15) {
        const h = Math.hypot(u - bx + 1.1, v - by + 1.2) / 3.15;
        return h < 0.3 ? ton(OR, 8) : OR.t(0.92 - h * 0.42, x, y, 0.7);
      }
    }
    const dx = (u - 12) / 9.4;
    const dy = (v - 10.6) / 9;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    if (Math.abs(r - 1) > 0.145 || Math.abs(a - Math.PI / 2) < 0.34) return null;
    const brin = Math.floor(a * 5.4 + (r - 1) * 9 + 60) & 1;
    const lum = 0.5 + 0.5 * Math.cos(a + 2.3);
    return OR.t(0.44 + lum * 0.22 + (brin ? 0.24 : -0.1) + (r < 0.95 ? -0.12 : 0), x, y, 0.5);
  },
  // l'enseigne au sanglier : la bête de bronze sur son socle d'or, la hampe, une flamme de rubis
  (u, v, x, y) => {
    if (ell(u, v, 19.2, 6.5, 0.8) <= 1) return ENCRE;
    if (
      poly(u, v, [
        [20, 9.6],
        [21.1, 7.4],
        [21.9, 9.7],
      ])
    )
      return ton(IVOIRE, 6);
    const dos = ell(u, v, 11.2, 7.3, 7.7, 3.5) <= 1;
    const tete = ell(u, v, 18.7, 7.5, 3.8, 3) <= 1 || ell(u, v, 21.4, 8.7, 1.6, 1.4) <= 1;
    if (
      dos ||
      tete ||
      poly(u, v, [
        [16.2, 5],
        [17.6, 2.3],
        [18.9, 4.9],
      ])
    )
      return BRONZE.t(0.74 - ((v - 4) / 7) * 0.36 - (dos && u < 8 ? 0.1 : 0), x, y, 0.8);
    if (u > 4.6 && u < 17.4 && v < 5.4) {
      const y0 = 7.3 - 3.5 * Math.sqrt(Math.max(0, 1 - ((u - 11.2) / 7.7) ** 2));
      const dent = 1 - Math.abs(((u / 2.2) % 1) * 2 - 1);
      if (v > y0 - 0.4 - dent * 1.9) return ton(BRONZE, 1);
    }
    if (v >= 9.4 && v < 12.6) {
      if ((u > 5 && u < 7.4) || (u > 14.6 && u < 17)) return BRONZE.t(0.5 - (v - 9.4) * 0.05, x, y, 0.5);
      if ((u > 8 && u < 9.8) || (u > 12 && u < 13.8)) return ton(BRONZE, 1);
    }
    if (seg(u, v, 4.2, 6, 2.6, 4.2) < 0.6) return ton(BRONZE, 2);
    if (u > 3.6 && u < 20.4 && v >= 12.6 && v < 14.8) return OR.t(0.86 - (v - 12.6) * 0.2 + 0.1 * Math.sin(u), x, y, 0.5);
    if (
      poly(u, v, [
        [13, 15.6],
        [22.4, 15.6],
        [20, 18.3],
        [22.4, 21],
        [13, 21],
      ])
    )
      return RUBIS.t(0.66 - ((v - 15.6) / 5.4) * 0.3 + 0.08 * Math.sin(u * 1.3), x, y, 0.8);
    if (u > 11 && u < 13 && v >= 14.8 && v < 23) return OR.t(u < 12 ? 0.62 : 0.36, x, y, 0.3);
    return null;
  },
  // l'amphore de terre cuite : la lèvre, le col entre ses deux anses, la panse en pointe, sa frise d'ivoire
  (u, v, x, y) => {
    const panse = poly(u, v, [
      [9.2, 7.8],
      [14.8, 7.8],
      [17.8, 10.6],
      [18, 13.8],
      [15.6, 19],
      [13.2, 23.6],
      [10.8, 23.6],
      [8.4, 19],
      [6, 13.8],
      [6.2, 10.6],
    ]);
    const col = u > 10.6 && u < 13.4 && v >= 2.6 && v < 8;
    const levre = u > 9.2 && u < 14.8 && v >= 1.2 && v < 3;
    if (panse && v >= 12.8 && v < 15.6) return v > 13.7 && v < 14.7 ? ton(IVOIRE, 4) : ton(TERRE, 1);
    if (panse && v >= 8.6 && v < 9.3) return ton(TERRE, 2);
    if (panse || col || levre) return TERRE.t(0.4 + 0.34 * Math.cos(((u - 9.8) / 9.5) * 1.5) + (levre ? 0.1 : 0) - (u > 15 ? 0.1 : 0), x, y, 0.8);
    for (const m of [0, 1]) {
      const uu = m ? 24 - u : u;
      if (poly(uu, v, ANSE)) return poly(uu, v, CREUX) ? ton(TERRE, m ? 1 : 2) : TERRE.t(m ? 0.42 : 0.62, x, y, 0.6);
    }
    return null;
  },
  // le brin de gui : six feuilles d'émeraude, trois baies de nacre
  (u, v, x, y) => {
    for (const [bx, by] of BAIES)
      if (Math.hypot(u - bx, v - by) <= 1.65) {
        const h = Math.hypot(u - bx + 0.5, v - by + 0.6) / 1.65;
        return IVOIRE.t(1 - h * 0.4, x, y, 0.5);
      }
    for (const m of [0, 1]) {
      const uu = m ? 24 - u : u;
      for (const [cx, cy, rx, ry, a] of FEUILLES) {
        const e = ellT(uu, v, cx, cy, rx, ry, a);
        if (e <= 1) {
          const c = Math.cos(a);
          const s = Math.sin(a);
          const tr = (uu - cx) * c + (v - cy) * s;
          return Math.abs(tr) < 0.34 ? ton(EMERAUDE, m ? 2 : 5) : EMERAUDE.t(0.62 + (m ? -0.14 : 0.06) - (tr / rx) * 0.16, x, y, 0.7);
        }
      }
    }
    if (seg(u, v, 12, 22.6, 12, 13) < 0.7 || seg(u, v, 12, 14, 7.4, 9.2) < 0.6 || seg(u, v, 12, 14, 16.6, 9.2) < 0.6 || seg(u, v, 12, 16.6, 8.4, 16.2) < 0.6 || seg(u, v, 12, 16.6, 15.6, 16.2) < 0.6) return ton(EMERAUDE, 1);
    return null;
  },
];

/** Un symbole de `S` points de côté, cerné (la toile fait S + 2). `i` : 0 à 4, ou -1 pour « n'importe lequel ». */
export function symbole(i: number, S: number): Toile {
  const T = new Toile(S + 2, S + 2);
  const e = 24 / S;
  if (i < 0) {
    for (let n = 0; n < 8; n++) {
      const a = (n * Math.PI) / 4;
      const r = S * 0.26;
      const d = Math.max(1, Math.round(S / 14));
      T.r(Math.round(S / 2 + 1 + Math.cos(a) * r - d / 2), Math.round(S / 2 + 1 + Math.sin(a) * r - d / 2), d, d, ton(OR, n % 2 ? 4 : 5));
    }
    return T;
  }
  const petit = PETITS[i];
  if (S === 12 && petit) {
    petit.forEach((l, y) => {
      for (let x = 0; x < 12; x++) if (l[x] !== ".") T.p(x + 1, y + 1, hex(PAL_PETITS[l[x]!] ?? "#000000"));
    });
    if (i === 4)
      for (const [x, y] of [
        [6, 5],
        [7, 8],
        [7, 9],
      ] as const)
        T.p(x + 1, y + 1, hex("#0d5a2e"));
    return T.cerne();
  }
  if (i === 0) {
    if (S === 12) T.pose(statere(12), 1, 1);
    else {
      if (S > 24)
        disque(T, S / 2 + 0.5, S / 2 + 0.5, S / 2, (r, a, x, y) =>
          r > 0.9 ? OR.t(0.56 + 0.3 * Math.cos(a + 2.3), x, y) : r > 0.84 ? ton(OR, 3) : r > 0.7 && Math.floor(((a + Math.PI) * 13) / Math.PI) & 1 ? ton(OR, 7) : OR.t(0.6 + 0.16 * Math.cos(a + 2.3), x, y, 0.5),
        );
      T.pose(statere(24), (S - 24) / 2 + 1, (S - 24) / 2 + 1);
    }
    return T.cerne();
  }
  const f = FORMES[i];
  if (f) T.f(1, 1, S + 1, S + 1, (x, y) => f((x - 0.5) * e, (y - 0.5) * e, x, y));
  return T.cerne();
}

const memoMini = new Map<number, Toile>();
/** Le petit symbole de 12 points (la table des gains peinte, les derniers tirages) ; -1 : « n'importe lequel ». */
export function mini(i: number): Toile {
  let t = memoMini.get(i);
  if (!t) memoMini.set(i, (t = symbole(i, 12)));
  return t;
}

/* ---------- La machine : laque noire, or, rubis, ivoire. Deux tailles (téléphone, grand écran), toujours 2 pixels par point. ---------- */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Les mesures de la machine, en points, pour une taille `k` (1 sur un téléphone, 1,5 au-delà de 760 pixels de table). */
export interface Metriques {
  k: number;
  U: (v: number) => number;
  S: number;
  CW: number;
  CH: number;
  SEP: number;
  FR: number;
  MRG: number;
  PX: number;
  LP: number;
  LK: number;
  INW: number;
  BW: number;
  yB: number;
  tab: Rect;
  cad: Rect;
  rx: number;
  ry: number;
  plq: Rect;
  bac: Rect;
  /** Le fond du bac, où se posent les pièces. */
  sol: number;
  bas: number;
  MH: number;
  L: number;
  R: number;
  pivot: [number, number];
  lev: Rect;
}
/** Une ligne de la table des gains peinte sur la machine. */
const RH = 15;
export function metriques(k: number): Metriques {
  const U = (v: number): number => Math.round(v * k);
  const b = k === 1 ? { S: 24, CW: 30, CH: 28, SEP: 4, FR: 4, MRG: 6, PX: 26, LP: 6, LK: 7 } : { S: 36, CW: 50, CH: 42, SEP: 6, FR: 8, MRG: 14, PX: 45, LP: 12, LK: 14 };
  const INW = 3 * b.CW + 2 * b.SEP;
  const BW = INW + 2 * (b.FR + b.MRG);
  const yB = U(11);
  const tab = { x: U(5), y: yB + U(5), w: BW - 2 * U(5), h: 5 * RH + 5 };
  const cad = { x: b.MRG, y: tab.y + tab.h + U(4), w: INW + 2 * b.FR, h: 3 * b.CH + 2 * b.FR };
  const rx = b.MRG + b.FR;
  const ry = cad.y + b.FR;
  const plq = { x: b.PX, y: cad.y + cad.h + U(4), w: BW - 2 * b.PX, h: Math.max(13, U(11)) };
  const bac = { x: U(8), y: plq.y + plq.h + U(4), w: BW - 2 * U(8), h: U(6) + Math.max(23, U(22)) };
  const sol = bac.y + bac.h - 3;
  const bas = bac.y + bac.h + U(4);
  const MH = bas + U(5);
  const L = U(38);
  const R = U(6) + 1;
  const pivot: [number, number] = [BW + b.LP, cad.y + Math.round(cad.h * 0.6)];
  const lev = { x: BW - 1, y: pivot[1] - L - R - 3, w: b.LP + b.LK + Math.round(3 * k) + R + 5, h: 2 * L + 2 * R + 6 };
  return { k, U, ...b, INW, BW, yB, tab, cad, rx, ry, plq, bac, sol, bas, MH, L, R, pivot, lev };
}

function gemme(T: Toile, cx: number, cy: number, r: number, rp: Rampe = RUBIS): void {
  disque(T, cx, cy, r + 2, () => ENCRE);
  disque(T, cx, cy, r + 1.2, (_d, a, x, y) => OR.t(0.52 + 0.36 * Math.cos(a + 2.3), x, y, 0.5));
  disque(T, cx, cy, r, (_d, _a, x, y) => {
    const h = Math.hypot(x - cx + r * 0.36, y - cy + r * 0.4) / r;
    return h < 0.24 ? ton(rp, rp.n - 1) : rp.t(0.8 - h * 0.5, x, y, 0.7);
  });
}
function globe(T: Toile, cx: number, cy: number, r: number, allume: boolean): void {
  disque(T, cx, cy, r + 1, () => ENCRE);
  disque(T, cx, cy, r, (_d, _a, x, y) => {
    const h = Math.hypot(x - cx + r * 0.3, y - cy + r * 0.35) / r;
    return allume ? (h < 0.5 ? ton(IVOIRE, 6) : OR.t(1 - h * 0.22, x, y, 0.6)) : h < 0.22 ? ton(OR, 7) : OR.t(0.66 - h * 0.3, x, y, 0.7);
  });
}

/** La machine entière, immobile : fronton, coffre, globes éteints, table des gains, rouleaux vides, plaque, bac, platine. */
export function peindreMachine(g: Metriques): Toile {
  const { U, BW, MH, k, tab, cad, plq, bac } = g;
  const T = new Toile(BW + U(7) + 1, MH);
  const yB = g.yB;
  const bas = g.bas;
  const r = U(4);
  // les pieds d'or
  for (const x0 of [U(10), BW - U(10) - U(18)])
    T.f(x0, bas - 2, x0 + U(18), MH, (x, y) => {
      const dx = Math.min(x - x0, x0 + U(18) - 1 - x);
      const v = y - bas + 2;
      if (dx + v < 2) return null;
      return dx === 0 || y === MH - 1 || dx + v === 2 ? ENCRE : OR.t(0.8 - (v / U(7)) * 0.5 - ((x - x0) / U(18)) * 0.2, x, y, 0.6);
    });
  // le fronton : un arc d'or sur velours bordeaux, son cabochon de rubis
  const fcx = BW / 2;
  const frx = BW * 0.37;
  const fry = U(13);
  const fy = yB + U(3);
  T.f(0, 0, BW, fy, (x, y) => {
    const e = ell(x + 0.5, y + 0.5, fcx, fy + 0.5, frx, fry);
    if (e > 1) return null;
    const d = (1 - Math.sqrt(e)) * fry;
    if (d < 1) return ENCRE;
    if (d < U(3) + 1) return OR.t(0.9 - (d / U(3)) * 0.4 + 0.12 * Math.sin((x + y) * 0.2), x, y, 0.8);
    if (d < U(3) + 2) return ton(OR, 2);
    return BORDEAUX.t(0.34 + 0.08 * grain(x >> 1, y >> 1) - ((fy - y) / fry) * 0.1, x, y, 1);
  });
  // le coffre : laque noire, un reflet en biais, cadre d'or aux coins ronds
  T.f(0, yB, BW, bas, (x, y) => {
    const dx = Math.min(x, BW - 1 - x);
    const dy = Math.min(y - yB, bas - 1 - y);
    const m = dx < r && dy < r ? r - Math.hypot(r - dx - 0.5, r - dy - 0.5) : Math.min(dx, dy) + 0.5;
    if (m < 0) return null;
    if (m < 1) return ENCRE;
    if (m < 4) {
      const cote = dy <= dx ? (y - yB < bas - 1 - y ? 0 : 3) : x < BW / 2 ? 1 : 2;
      return orDeCadre(x, y, cote, (m - 1) / 3);
    }
    if (m < 5) return ton(OR, 1);
    const s = (x + (y - yB) * 0.42) / BW;
    const v =
      0.26 +
      0.5 * Math.exp(-(((s - 0.34) / 0.07) ** 2)) +
      0.3 * Math.exp(-(((s - 0.52) / 0.024) ** 2)) +
      0.42 * Math.exp(-(((s - 1.22) / 0.1) ** 2)) +
      0.3 * Math.exp(-(((s - 1.5) / 0.03) ** 2)) +
      0.1 * (1 - (y - yB) / (bas - yB));
    return NOIR.t(v, x, y, 1);
  });
  gemme(T, Math.round(fcx), U(7), U(3) + 0.5);
  for (const s of [-1, 1]) gemme(T, Math.round(fcx + s * frx * 0.52), U(9), U(1) + 0.5, SAPHIR);
  // les deux globes, sur leur douille d'or
  for (const cx of [U(12), BW - 1 - U(12)]) {
    T.f(cx - U(3) - 1, yB - U(2) - 1, cx + U(3) + 2, yB + 1, (x, y) => (x === cx - U(3) - 1 || x === cx + U(3) + 1 || y === yB - U(2) - 1 ? ENCRE : OR.t(0.8 - (Math.abs(x - cx + 1) / U(4)) * 0.4, x, y, 0.4)));
    globe(T, cx, yB - U(5), U(4), false);
  }
  // la table des gains : un panneau d'ivoire dans son cadre d'or
  cadreOr(T, tab.x, tab.y, tab.w, tab.h, 3, false);
  T.f(tab.x + 3, tab.y + 3, tab.x + tab.w - 3, tab.y + tab.h - 3, (x, y) => (x === tab.x + 3 || y === tab.y + 3 ? ton(IVOIRE, 2) : IVOIRE.t(0.9 - ((x - tab.x + (y - tab.y)) / (tab.w + tab.h)) * 0.16, x, y, 0.6)));
  (
    [
      [0, 0, 0, "100"],
      [1, 1, 1, "20"],
      [2, 2, 2, "5"],
      [3, 3, 3, "2"],
      [4, -1, -1, ""],
    ] as const
  ).forEach((l, i) => {
    const y = tab.y + 3 + i * RH;
    const mot = l[3] ? (k > 1 ? " fois la mise" : " fois") : k > 1 ? "Mise rendue" : "Rendue";
    const xm = tab.x + tab.w - 5 - U(2) - largeurDuTexte(mot);
    if (i) for (let x = tab.x + 6; x < tab.x + tab.w - 5; x += 3) T.p(x, y, ton(IVOIRE, 2));
    for (const [j, sy] of [l[0], l[1], l[2]].entries()) T.pose(mini(sy), tab.x + 4 + U(2) + j * (k > 1 ? 16 : 14), y + 1);
    ecrisSur(T, mot, xm, y + 5, BRUN);
    if (l[3]) ecrisSur(T, l[3], xm - largeurDuTexte(l[3]), y + 5, ton(RUBIS, 3));
  });
  // les rouleaux : le cadre d'or, le creux, les cloisons, un rubis à chaque coin
  cadreOr(T, cad.x, cad.y, cad.w, cad.h, g.FR, false);
  T.f(g.rx - 1, g.ry - 1, g.rx + g.INW + 1, g.ry + 3 * g.CH + 1, () => ENCRE);
  for (const x0 of [g.rx + g.CW, g.rx + 2 * g.CW + g.SEP])
    T.f(x0, g.ry, x0 + g.SEP, g.ry + 3 * g.CH, (x, y) => {
      const d = x - x0;
      return d === 0 || d === g.SEP - 1 ? ENCRE : d === g.SEP >> 1 ? OR.t(0.4 + 0.3 * Math.sin(y * 0.09), x, y, 0.5) : ton(NOIR, d < g.SEP / 2 ? 4 : 2);
    });
  for (const [cx, cy] of [
    [cad.x + 2, cad.y + 2],
    [cad.x + cad.w - 3, cad.y + 2],
    [cad.x + 2, cad.y + cad.h - 3],
    [cad.x + cad.w - 3, cad.y + cad.h - 3],
  ] as const)
    gemme(T, cx + (k > 1 ? (cx < BW / 2 ? 1 : -1) : 0), cy + (k > 1 ? (cy < cad.y + 9 ? 1 : -1) : 0), U(1) + 0.5);
  // les deux repères de la ligne qui paie : des pointes de rubis serties d'or
  const cyR = cad.y + (cad.h >> 1);
  const lr = U(6);
  const hr = U(5);
  for (const s of [1, -1]) {
    const R2 = new Toile(lr + 4, 2 * hr + 5);
    R2.f(2, 2, lr + 2, 2 * hr + 3, (x, y) => {
      const d = s > 0 ? x - 2 : lr + 1 - x;
      const e = Math.abs(y - 2 - hr);
      if (e > ((lr - d) * hr) / lr) return null;
      return d < 2 ? OR.t(0.8 - (e / hr) * 0.3, x, y, 0.4) : RUBIS.t(0.74 - (e / hr) * 0.3 - (y > 2 + hr ? 0.14 : 0), x, y, 0.6);
    });
    R2.cerne();
    T.pose(R2, s > 0 ? cad.x - lr - 3 : cad.x + cad.w - 1, cyR - hr - 2);
  }
  // la plaque de la mise, la fente des jetons
  cadreOr(T, plq.x, plq.y, plq.w, plq.h, 2, false);
  T.f(plq.x + 2, plq.y + 2, plq.x + plq.w - 2, plq.y + plq.h - 2, (_x, y) => ton(NOIR, y === plq.y + 2 ? 0 : 1));
  T.pose(mini(0), U(9), plq.y + ((plq.h - 14) >> 1));
  const fx = plq.x + plq.w + U(5);
  const fw = U(13);
  cadreOr(T, fx, plq.y, fw, plq.h, 2, false);
  T.f(fx + 2, plq.y + 2, fx + fw - 2, plq.y + plq.h - 2, (x, y) => (Math.abs(x - fx - (fw >> 1)) < Math.max(1, U(1)) && y > plq.y + 2 && y < plq.y + plq.h - 3 ? ENCRE : OR.t(0.56 - ((y - plq.y) / plq.h) * 0.2, x, y, 0.5)));
  // la goulotte et le bac de velours
  const gw = U(60);
  const gx = Math.round(BW / 2 - gw / 2);
  const gh = U(6);
  T.f(gx, bac.y, gx + gw, bac.y + gh, (x, y) => (x === gx || x === gx + gw - 1 || y === bac.y ? ton(OR, 3) : y === bac.y + 1 ? ton(OR, 5) : ton(NOIR, 0)));
  cadreOr(T, bac.x, bac.y + gh - 1, bac.w, bac.h - gh + 1, 2, false);
  T.f(bac.x + 2, bac.y + gh + 1, bac.x + bac.w - 2, bac.y + bac.h - 2, (x, y) => BORDEAUX.t(0.16 + ((y - bac.y - gh) / bac.h) * 0.22 + 0.05 * grain(x >> 1, y >> 1), x, y, 1));
  // la platine du levier, sur le flanc
  const py = g.pivot[1];
  const ph = U(17);
  T.f(BW - 1, py - ph, BW + U(7) + 1, py + ph + 1, (x, y) => {
    const d = x - BW + 1;
    const e = Math.abs(y - py);
    if (d === U(7) && e === ph) return null;
    return d === U(7) || e === ph ? ENCRE : OR.t(0.78 - (d / U(8)) * 0.4 - ((y - py + ph) / (2 * ph)) * 0.14, x, y, 0.6);
  });
  return T;
}

/** Le devant du bac, par-dessus les pièces : un jonc d'or bombé. */
export function peindreLevre(g: Metriques): Toile {
  const w = g.bac.w + 2;
  const h = g.U(6);
  const T = new Toile(w, h + 2);
  T.f(0, 0, w, h + 1, (x, y) => {
    const dx = Math.min(x, w - 1 - x);
    if (dx + Math.min(y, h - y) < 1) return null;
    if (dx === 0 || y === 0 || y === h) return ENCRE;
    const v = (y - 1) / (h - 1);
    return OR.t(0.94 - Math.abs(v - 0.3) * 1.1 + 0.07 * Math.sin(x * 0.17) - (dx < 3 ? 0.14 : 0), x, y, 0.8);
  });
  return T;
}

/** Les positions du levier : de -4 (il cogne en remontant) à 64 (tout en bas). */
export const crantDuLevier = (t: number): number => Math.round(borne(t, -0.06, 1) * 64);
/** Le levier à la position `q` (`crantDuLevier`) : la tige d'or, le pivot, la bague, le pommeau de rubis. */
export function peindreLevier(g: Metriques, q: number): Toile {
  const tt = q / 64;
  const { U, k, L, R } = g;
  const T = new Toile(g.lev.w, g.lev.h);
  const px0 = g.pivot[0] - g.lev.x;
  const py0 = g.pivot[1] - g.lev.y;
  const kx = px0 + g.LK + Math.round(3 * k * Math.sin(Math.PI * Math.max(0, tt)));
  const ky = py0 - L + Math.round(tt * 2 * L);
  const ep = U(3) / 2;
  const n = Math.hypot(kx - px0, ky - py0);
  T.tout((x, y) => {
    const d = seg(x + 0.5, y + 0.5, px0, py0, kx, ky);
    if (d > ep + 1) return null;
    if (d > ep) return ENCRE;
    const c2 = (((x + 0.5 - px0) * (ky - py0) - (y + 0.5 - py0) * (kx - px0)) / n) * (ky < py0 ? 1 : -1);
    return OR.t(0.6 + (c2 / ep) * 0.3, x, y, 0.4);
  });
  disque(T, px0, py0, U(5) + 1, () => ENCRE);
  disque(T, px0, py0, U(5), (r, a, x, y) => (r < 0.36 ? ton(OR, 2) : OR.t(0.56 + 0.32 * Math.cos(a + 2.3), x, y, 0.5)));
  const cx = Math.round(px0 + (kx - px0) * (1 - (R + 1) / n));
  const cy = Math.round(py0 + (ky - py0) * (1 - (R + 1) / n));
  disque(T, cx, cy, ep + 2, () => ENCRE);
  disque(T, cx, cy, ep + 1, (_r, a, x, y) => OR.t(0.6 + 0.3 * Math.cos(a + 2.3), x, y, 0.4));
  disque(T, kx, ky, R + 1, () => ENCRE);
  disque(T, kx, ky, R, (_r, _a, x, y) => {
    const h = Math.hypot(x - kx + R * 0.36, y - ky + R * 0.4) / R;
    return h < 0.2 ? ton(RUBIS, 7) : RUBIS.t(0.82 - h * 0.5, x, y, 0.8);
  });
  return T;
}

/** La hauteur du socle du forgeron, sur un grand écran. */
export const SOCLE = 96;
/** Le socle du forgeron : une colonne de laque et de velours entre deux joncs d'or, un losange d'or au milieu. */
export function peindreSocle(h: number): Toile {
  const w = 46;
  const T = new Toile(w + 2, h + 2);
  T.f(1, 1, w + 1, h + 1, (x, y) => {
    const v = y - 1;
    const dx = Math.min(x - 1, w - x);
    const bas = h - 1 - v;
    if (v < 5) return OR.t(0.94 - v * 0.14 + 0.1 * Math.sin(x * 0.3), x, y, 0.7);
    if (bas < 6) return bas >= 3 && dx < 2 ? null : OR.t(0.7 - (5 - bas) * 0.08 + 0.08 * Math.sin(x * 0.3), x, y, 0.7);
    if (dx < 4) return null;
    if (v < 8 || bas < 8) return ton(OR, bas < 8 ? 3 : 4);
    if (dx === 4) return ton(NOIR, 3);
    if (dx < 7) return NOIR.t(0.3 + (x < w / 2 ? 0.2 : 0), x, y, 0.5);
    if (dx === 7) return ton(OR, 4);
    const los = Math.abs(x - 0.5 - w / 2) / 9 + Math.abs(v - h / 2) / 13;
    if (los < 1) return los > 0.72 ? OR.t(0.8 - (v / h) * 0.4, x, y, 0.5) : RUBIS.t(0.6 - los * 0.3 - (v > h / 2 ? 0.14 : 0), x, y, 0.6);
    return BORDEAUX.t(0.44 - (v / h) * 0.2 + 0.06 * Math.sin(x * 0.9), x, y, 1);
  });
  return T.cerne();
}

/** Les trois vues d'un statère qui tombe en tournant : de face, de trois quarts, de profil (12, 8 et 4 points de large). */
export function piecesQuiTombent(): Toile[] {
  const s = statere(12);
  return [12, 8, 4].map((w) => {
    const T = new Toile(w + 2, s.h + 2);
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * s.w + Math.floor(((x + 0.5) * s.w) / w)) * 4;
        if (s.d[i + 3]) T.p(x + 1, y + 1, [s.d[i]!, s.d[i + 1]!, s.d[i + 2]!]);
      }
    return T.cerne();
  });
}

/** Les pièces fixes d'une case de rouleau : l'ivoire de la case, l'ombre du creux, le cadre d'or d'une case gagnante. */
export function piecesDesRouleaux(g: Metriques): { case: Toile; ombre: Toile; cadre: Toile; halo: Toile; globe: Toile } {
  const { CW, CH, U } = g;
  const c = new Toile(CW, CH);
  c.tout((x, y) => (y === 0 ? ton(IVOIRE, 2) : y === 1 ? ton(IVOIRE, 6) : y === CH - 1 ? ton(IVOIRE, 3) : IVOIRE.t(0.86 + 0.08 * grain(x >> 1, y >> 2), x, y, 0.5)));
  // l'ombre du creux en haut et en bas des rouleaux (bordeaux : le violet de la maquette est devenu le velours du palais)
  const HO = 3 * CH;
  const o = new Toile(CW, HO);
  const teinte = ton(BORDEAUX, 1);
  for (let y = 0; y < HO; y++)
    for (let x = 0; x < CW; x++) {
      const d = Math.min(y, HO - 1 - y) / HO;
      const a = d < 0.2 ? Math.pow(1 - d / 0.2, 1.4) * 200 : 0;
      const b = x === 0 || x === CW - 1 ? 90 : 0;
      if (a + b > 4) o.p(x, y, teinte, Math.min(230, a + b));
    }
  const f = new Toile(CW, CH);
  f.tout((x, y) => {
    const m = Math.min(x, y, CW - 1 - x, CH - 1 - y);
    return m === 0 ? ton(OR, 4) : m === 1 ? ton(OR, 7) : m === 2 ? ton(OR, 5) : null;
  });
  const rh = U(22);
  const h = new Toile(2 * rh, 2 * rh);
  lueur(h, rh, rh, rh, 0.95, ton(OR, 7));
  const gl = new Toile(2 * U(4) + 4, 2 * U(4) + 4);
  globe(gl, U(4) + 2, U(4) + 2, U(4), true);
  return { case: c, ombre: o, cadre: f, halo: h, globe: gl };
}

/** Un mot de la plaque de la machine, en or. */
export function motDeLaPlaque(t: string, c: Rvb): Toile {
  const T = new Toile(largeurDuTexte(t), 9);
  ecrisSur(T, t, 0, 0, c);
  return T;
}

/** L'éclat d'une case gagnante, posé à demi sur l'ivoire. */
export const ECLAT_DE_LA_CASE = "#fff6cf";

/* ---------- Les rouleaux : ce qu'ils montrent, et leur course ---------- */

/**
 * La course d'un rouleau : il s'élance, file, puis freine (une table de 400 pas). `courbe(u)` va de 0 à 1 ; le cran l'arrête
 * net, avec un rebond.
 */
const COURBE: readonly number[] = (() => {
  const n = 400;
  const v = (u: number): number => (u < 0.14 ? 0.08 + 0.92 * Math.sin(((u / 0.14) * Math.PI) / 2) : u < 0.62 ? 1 : 0.2 + 0.8 * Math.pow(1 - (u - 0.62) / 0.38, 1.7));
  const c = [0];
  for (let i = 0; i < n; i++) c.push(c[i]! + v((i + 0.5) / n));
  return c.map((x) => x / c[n]!);
})();
export const courbe = (u: number): number => {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const x = u * 400;
  const i = Math.floor(x);
  return COURBE[i]! + (COURBE[i + 1]! - COURBE[i]!) * (x - i);
};
/** Le rebond du cran, en cases. */
export const REBOND = 0.3;
/** La durée du rebond, en secondes. */
export const DUREE_DU_REBOND = 0.28;

/**
 * La bande d'un rouleau pour un tour : elle commence sur ce que le rouleau montrait (`vus`, haut, milieu, bas) et finit sur
 * les trois cases tirées par le serveur. `n` : le nombre de cases qui passent. À la position 0, les cases 1 à 3 de la bande
 * sont celles du serveur ; à la position `n`, celles d'avant.
 */
export function bandeDuRouleau(i: number, cases: readonly number[], vus: readonly number[], hasard: () => number): { bande: number[]; n: number } {
  const n = 14 + i * 11;
  const milieu = Array.from({ length: n - 3 }, hasard);
  return { bande: [hasard(), ...cases.slice(0, 3), ...milieu, ...vus.slice(0, 3), hasard()], n };
}
/** Quand part et combien file chaque rouleau (en secondes après le départ) : de gauche à droite, le dernier plus long. */
export const departDuRouleau = (i: number): number => 0.06 + i * 0.09;
export const dureeDuRouleau = (i: number): number => 1.0 + i * 0.5 - i * 0.09;

/**
 * La position d'un rouleau (en cases au-dessus de l'arrivée) `t` secondes après son départ. `cogne` : le cran est passé
 * (le « clonc ») ; `arrete` : le rebond est fini, la position vaut 0 tout juste.
 */
export function posDuRouleau(n: number, duree: number, t: number): { pos: number; cogne: boolean; arrete: boolean } {
  if (t < 0) return { pos: n, cogne: false, arrete: false };
  if (t < duree) {
    const elan = t < 0.1 ? 0.16 * Math.sin((t / 0.1) * Math.PI) : 0;
    return { pos: n * (1 - courbe(t / duree)) + elan, cogne: false, arrete: false };
  }
  const v = (t - duree) / DUREE_DU_REBOND;
  if (v >= 1) return { pos: 0, cogne: true, arrete: true };
  return { pos: -REBOND * Math.sin(Math.PI * v) * (1 - v), cogne: true, arrete: false };
}

/** Les cases visibles d'une bande à la position `pos` arrondie : haut, milieu, bas. */
export const casesVues = (bande: readonly number[], pos: number): number[] => {
  const p = Math.round(pos);
  return [bande[p + 1]!, bande[p + 2]!, bande[p + 3]!];
};

/** Un entier sans biais de 0 à n - 1, du hasard du navigateur (le décor des rouleaux et les coups d'essai, jamais un vrai tour). */
export function entierDuDecor(n: number): number {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) return Math.floor(Math.random() * n);
  const borneHaute = Math.floor(0x100000000 / n) * n;
  const t = new Uint32Array(1);
  for (;;) {
    c.getRandomValues(t);
    if (t[0]! < borneHaute) return t[0]! % n;
  }
}

/**
 * Les neuf cases que l'écran montre pour un coup du serveur : les siennes, si elles sont bien formées et disent son résultat ;
 * sinon (le serveur n'en envoie jamais de telles), d'autres prises au hasard parmi celles qui disent ce résultat, pour que
 * l'image ne contredise jamais ce que le serveur a payé.
 */
export function casesAMontrer(resultat: ResultatDeLaMachine, cases: unknown, hasard: (n: number) => number = entierDuDecor): [number, number, number][] {
  const bonnes =
    Array.isArray(cases) &&
    cases.length === 3 &&
    cases.every((r) => Array.isArray(r) && r.length === 3 && r.every((s) => Number.isInteger(s) && s >= 0 && s <= 4)) &&
    lireLaLigne(cases as number[][]) === resultat;
  return bonnes ? (cases as [number, number, number][]).map((r) => [r[0], r[1], r[2]]) : casesDuResultat(resultat, hasard);
}

/** Les cases d'un coup d'essai : tirées dans le navigateur, pour voir chaque gain ; rien n'est envoyé ni compté. */
export const casesDEssai = (resultat: ResultatDeLaMachine, hasard: (n: number) => number = entierDuDecor): [number, number, number][] => casesDuResultat(resultat, hasard);

/** Ce que rend un résultat, en fois la mise (0 pour rien). */
export const foisDuResultat = (r: ResultatDeLaMachine): number => (r < 0 ? 0 : FOIS_DE_LA_MACHINE[r]!);
/** Les chances d'un résultat sur 1 000 (648 pour rien). */
export const surMilleDuResultat = (r: ResultatDeLaMachine): number => (r < 0 ? 1000 - SUR_MILLE_DE_LA_MACHINE.reduce((a, b) => a + b, 0) : SUR_MILLE_DE_LA_MACHINE[r]!);

/* ---------- Le bac : où se posent les statères ---------- */

export interface Emplacement {
  x: number;
  y: number;
  c: number;
}
/** Les places des statères dans le bac, du milieu vers les bords, en deux ou trois rangs. `hasard` : le décor seulement. */
export function emplacementsDuBac(g: Metriques, hasard: () => number = Math.random): Emplacement[] {
  const e: Emplacement[] = [];
  const rangs = g.k > 1 ? 3 : 2;
  const n = Math.floor((g.bac.w - 12 - 14) / 8) + 1;
  const x0 = g.bac.x + Math.round((g.bac.w - (n - 1) * 8 - 14) / 2);
  for (let r = 0; r < rangs; r++) {
    const liste: Emplacement[] = [];
    for (let i = 0; i < n - r; i++) liste.push({ x: x0 + r * 4 + i * 8, y: g.sol - 13 - r * 5, c: Math.abs(i - (n - 1 - r) / 2) + hasard() * 3 });
    liste.sort((a, b) => a.c - b.c);
    e.push(...liste);
  }
  return e;
}
/** Combien de statères tombent dans le bac : un par dizaine gagnée, jamais plus que les places du bac et huit de plus. */
export const stateresDuBac = (gain: number, places: number): number => Math.max(1, Math.min(places + 8, Math.round(gain / 10)));

/* ---------- Les sons de la machine : le cliquet, le déclic, l'arrêt des tambours ; les gains sont ceux de la salle ---------- */

const D2 = 73.42;
const A2 = 110;
const D3 = 146.83;
const Fd3 = 185;
const A3 = 220;
const D4 = 293.66;

export const SONS_DE_LA_MACHINE = {
  cliquet: (i: number): void => {
    Son.souffle(0, 0.014, "bandpass", 1500, 1000, 3, 0.1, 0.001);
    Son.ton(190 + i * 9, 130, 0, 0.04, 0.07, "triangle", 0.001);
  },
  declic: (): void => {
    Son.peau(0, 62, 0.2, 0.4, 2.3);
    Son.souffle(0, 0.05, "bandpass", 1200, 700, 4, 0.12, 0.001);
    Son.ton(392, 384, 0, 0.14, 0.03, "triangle", 0.002);
    Son.ton(588, 574, 0, 0.1, 0.016, "triangle", 0.002);
  },
  retour: (): void => {
    Son.peau(0, 96, 0.09, 0.4, 2.3);
    Son.souffle(0, 0.02, "bandpass", 1100, 800, 3, 0.06, 0.001);
  },
  lache: (): void => Son.ton(140, 100, 0, 0.09, 0.06, "triangle", 0.003),
  prise: (): void => Son.ton(170, 110, 0, 0.07, 0.08, "triangle", 0.002),
  /** L'arrêt d'un tambour : trois « clonc » de plus en plus graves (la, fa dièse, ré). */
  clonc: (i: number): void => {
    const f = [A2, 92.5, D2][i] ?? D2;
    Son.peau(0, f, 0.24, 0.34, 2);
    Son.souffle(0, 0.07, "lowpass", 700, 160, 0.7, 0.15);
    Son.souffle(0, 0.018, "bandpass", 1400, 900, 3, 0.07, 0.001);
    Son.ton(f * 4, f * 3.92, 0, 0.1, 0.024, "triangle", 0.002);
  },
  /** La fin d'un coup : rien, la mise rendue, un gain, un grand gain, le plus grand. */
  fin: (res: ResultatDeLaMachine): void => {
    if (res < 0) return SONS.perdu();
    if (res === 4) return SONS.egal(); // la mise rendue : le son commun, ni fête ni reproche
    if (res === 3) return SONS.gain(2);
    if (res === 2) {
      SONS.gain(4);
      Son.cor([D2, A2], 0.05, 0.9, 0.03);
      return;
    }
    SONS.grandGain();
    if (res === 0) {
      Son.nappe([D3, Fd3, A3, D4], 2.6, 4.2, 0.05, 1500);
      Son.cor([A2], 2.7, 0.5, 0.045);
      Son.cor([D2, D3, A3], 3.2, 2.6, 0.04);
      Son.timbale(3.2, D2, 0.18, 1.8);
      Son.timbale(4.5, D2, 0.11, 1.6);
      for (let i = 0; i < 8; i++) SONS.piece(3.3 + i * 0.2, i);
    }
  },
};
