/**
 * La toile du casino de « Mon Gaulois » (22 novembre 2026, direction « Le Palais d'or » validée par le pilote, maquette de
 * Claude Fable 5.2 portée telle quelle) : une image en points, peinte case par case, posée à 2 pixels par point (`--jeu-p`).
 * Les matières précieuses (or, bordeaux, laque, rubis, saphir, émeraude, ivoire, ambre, jour, rose) sont des rampes, du plus
 * sombre au plus clair, tramées entre deux tons par une matrice de Bayer : rien de flou, rien de dégradé CSS.
 *
 * Ce module ne dépend d'aucun navigateur, sauf `versLaToile` : il se teste dans Node. Les objets peints (jetons, piles, cartes,
 * dés, bille, cadres, lueurs) et les pièces en neuf parts des tables (pierres, feutre, jonc, cadre, halo, reflet) sont ici ;
 * les vrais dessins du site (Gaulois, familiers, statère) dans `casino-dessins.ts`. Voir « Le casino du jeu » dans
 * docs/DESIGN.md.
 */
import { ecrire, enCapitales, largeurDuTexte as largeurDuKit } from "./ecriture";

/** Une couleur : rouge, vert, bleu, de 0 à 255. */
export type Rvb = readonly [number, number, number];

/** Un point vaut 2 pixels, comme partout dans le kit du jeu. */
export const P = 2;

export const hex = (h: string): Rvb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const hexDe = (c: Rvb): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** La matrice de Bayer 4 sur 4, centrée sur zéro : la trame entre deux tons. */
export const BAYER: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const bayer = (x: number, y: number): number => BAYER[(y & 3) * 4 + (x & 3)]!;
export const borne = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lisse = (a: number, b: number, v: number): number => {
  const t = borne((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mel = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Un bruit fixe, le même à chaque peinture. */
export const grain = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Un nombre pair, au moins 2 : les tailles des toiles, pour des points entiers. */
export const pair = (v: number): number => Math.max(2, Math.floor(v / 2) * 2);

/** Une rampe de matière : `c` ses tons du plus sombre au plus clair ; `t(v, x, y, trame)` la couleur de la valeur 0..1, tramée. */
export interface Rampe {
  readonly c: readonly Rvb[];
  readonly n: number;
  t(v: number, x: number, y: number, trame?: number): Rvb;
}
export function rampe(liste: readonly string[]): Rampe {
  const c = liste.map(hex);
  const n = c.length;
  return {
    c,
    n,
    t(v, x, y, trame = 0.7) {
      const i = Math.round(borne(v) * (n - 1) + bayer(x, y) * trame);
      return c[i < 0 ? 0 : i >= n ? n - 1 : i]!;
    },
  };
}
export const OR = rampe(["#140b02", "#2e1c04", "#553608", "#8a5a0a", "#b9820f", "#e0ac22", "#ffd84a", "#fff1a8", "#fffbe6"]);
/**
 * Le bordeaux, velours de théâtre (choix du pilote, soir du 22 novembre 2026 : « Rouge bordeaux et or : le velours de
 * théâtre, plus chaud »), à la place du pourpre de la maquette ; tons posés par Claude Opus 5.5 en l'absence de Claude Fable
 * 5.2 (« Opus maintenant »), à faire relire à Fable. Le feutre du tapis (tons 2 à 4) reste sombre et vineux, loin du rubis
 * vif des numéros rouges.
 */
export const BORDEAUX = rampe(["#0b0306", "#18060b", "#260912", "#350c19", "#481022", "#61172e", "#7f213b", "#a1324d", "#c96478", "#efbcc6"]);
export const NOIR = rampe(["#030308", "#07070f", "#0c0c18", "#131424", "#1c1d33", "#282a45", "#3a3d5e", "#565a80"]);
export const RUBIS = rampe(["#1c0206", "#3d0610", "#6e0b18", "#a8101f", "#d21f33", "#f04a58", "#ff8a8f", "#ffd0d0"]);
export const SAPHIR = rampe(["#020a2a", "#051a5c", "#0b2f9c", "#0b3fc4", "#2f6bff", "#6a98ff", "#9cc2ff", "#dbe8ff"]);
export const EMERAUDE = rampe(["#021a0e", "#06361c", "#0d5a2e", "#1f8a47", "#3fce6a", "#8beda4", "#c4f9cb"]);
export const IVOIRE = rampe(["#3a3426", "#6b6249", "#a0977a", "#cfc9b8", "#e6dfca", "#f6f1e3", "#fffbe6"]);
export const AMBRE = rampe(["#1f0803", "#4a1206", "#8a2a08", "#d9520f", "#f5760f", "#ffa53a", "#ffd27a"]);
/** Le jour : un ivoire rosé, plus de violet (les murs et le sol du palais dans le thème clair). */
export const JOUR = rampe(["#a48780", "#c2a69e", "#d7c0b8", "#e7d6ce", "#f2e7df", "#f9f3ec", "#fffdf6"]);
/** Le rose du fond des médaillons et du portrait des croupiers, le jour. */
export const ROSE = rampe(["#5a2633", "#82404f", "#a8626f", "#c98b96", "#e4b9c0", "#f5dfe2"]);
/** L'encre du cerne, celle du kit. */
export const ENCRE: Rvb = [5, 4, 12];
/** Un ton exact d'une rampe (`OR.c[6]`), sans `undefined` : l'indice est borné. */
export const ton = (r: Rampe, i: number): Rvb => r.c[Math.max(0, Math.min(r.n - 1, i))]!;

/** Une image en points : chaque point est une couleur pleine ou rien. */
export class Toile {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    this.d = new Uint8ClampedArray(this.w * this.h * 4);
  }
  /** Pose une couleur (`a` : son opacité, pleine par défaut). */
  p(x: number, y: number, c: Rvb, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = a;
  }
  /** Mêle une couleur au point (0..1). */
  m(x: number, y: number, c: Rvb, f: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || f <= 0) return;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    if (!d[i + 3]) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255 * f;
      return;
    }
    d[i] = d[i]! + (c[0] - d[i]!) * f;
    d[i + 1] = d[i + 1]! + (c[1] - d[i + 1]!) * f;
    d[i + 2] = d[i + 2]! + (c[2] - d[i + 2]!) * f;
  }
  /** L'opacité d'un point (0 dehors). */
  a(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]!;
  }
  r(x: number, y: number, w: number, h: number, c: Rvb): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.p(i, j, c);
  }
  /** Peint chaque point du rectangle par une fonction (x, y) → couleur ou rien. */
  f(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => Rvb | null | undefined): void {
    x0 = Math.max(0, x0 | 0);
    y0 = Math.max(0, y0 | 0);
    x1 = Math.min(this.w, Math.ceil(x1));
    y1 = Math.min(this.h, Math.ceil(y1));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const c = fn(x, y);
        if (c) this.p(x, y, c);
      }
  }
  tout(fn: (x: number, y: number) => Rvb | null | undefined): void {
    this.f(0, 0, this.w, this.h, fn);
  }
  /** Pose une autre toile (ses points pleins), retournée de gauche à droite si `miroir`. */
  pose(t: Toile, x0: number, y0: number, miroir = false): void {
    x0 |= 0;
    y0 |= 0;
    for (let y = 0; y < t.h; y++)
      for (let x = 0; x < t.w; x++) {
        const i = (y * t.w + (miroir ? t.w - 1 - x : x)) * 4;
        if (t.d[i + 3]! > 127) this.p(x0 + x, y0 + y, [t.d[i]!, t.d[i + 1]!, t.d[i + 2]!]);
      }
  }
  /** Le cerne : un trait d'encre autour de tout ce qui est peint. */
  cerne(c: Rvb = ENCRE): this {
    const s = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (!this.a(x, y) && (this.a(x - 1, y) || this.a(x + 1, y) || this.a(x, y - 1) || this.a(x, y + 1))) s[y * this.w + x] = 1;
    for (let k = 0; k < s.length; k++) if (s[k]) this.p(k % this.w, (k / this.w) | 0, c);
    return this;
  }
  /** Pose un calque avec son ombre portée tramée. */
  poseOmbre(t: Toile, x0: number, y0: number, dx = 2, dy = 3, force = 0.55): void {
    x0 |= 0;
    y0 |= 0;
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.a(x, y)) this.m(x0 + x + dx, y0 + y + dy, ENCRE, force);
    this.pose(t, x0, y0);
  }
  /** Tourne le calque (au plus proche) autour de son centre. */
  tourne(ang: number): Toile {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const W = Math.ceil(Math.abs(this.w * c) + Math.abs(this.h * s)) + 2;
    const H = Math.ceil(Math.abs(this.w * s) + Math.abs(this.h * c)) + 2;
    const o = new Toile(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - W / 2 + 0.5;
        const dy = y - H / 2 + 0.5;
        const sx = Math.floor(dx * c + dy * s + this.w / 2);
        const sy = Math.floor(-dx * s + dy * c + this.h / 2);
        if (sx >= 0 && sy >= 0 && sx < this.w && sy < this.h) {
          const i = (sy * this.w + sx) * 4;
          if (this.d[i + 3]) o.p(x, y, [this.d[i]!, this.d[i + 1]!, this.d[i + 2]!]);
        }
      }
    return o;
  }
}

/** Pose une toile dans un `<canvas>` (sans changer sa taille à l'écran). Le seul geste de navigateur de ce module. */
export function versLaToile(c: HTMLCanvasElement, t: Toile): void {
  if (c.width !== t.w) c.width = t.w;
  if (c.height !== t.h) c.height = t.h;
  const g = c.getContext("2d");
  if (g) g.putImageData(new ImageData(new Uint8ClampedArray(t.d), t.w, t.h), 0, 0);
}

/** Pose une toile dans un `<canvas>`, à 2 pixels par point. */
export function poseToile(c: HTMLCanvasElement, t: Toile): HTMLCanvasElement {
  versLaToile(c, t);
  c.style.width = t.w * P + "px";
  c.style.height = t.h * P + "px";
  return c;
}

/** Une toile faite de cases de couleur (`"#rrggbb"` ou rien), recadrée au plus près : un Gaulois, un familier, un statère du site. */
export function toileDesCases(cases: readonly (string | null | undefined)[], w: number): Toile {
  const h = cases.length / w;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  cases.forEach((c, k) => {
    if (!c) return;
    const x = k % w;
    const y = (k / w) | 0;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  });
  if (x1 < 0) return new Toile(1, 1);
  const t = new Toile(x1 - x0 + 1, y1 - y0 + 1);
  const memo = new Map<string, Rvb>();
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = cases[y * w + x];
      if (!c) continue;
      let rvb = memo.get(c);
      if (!rvb) memo.set(c, (rvb = hex(c)));
      t.p(x - x0, y - y0, rvb);
    }
  return t;
}

/* ---------- L'écriture : celle du kit (capitales de 5 cases sur 7), et de petits chiffres de 3 sur 5 ---------- */

/** La largeur d'un texte en points, dans l'écriture du kit. */
export const largeurDuTexte = (t: string): number => largeurDuKit(enCapitales(String(t)));
/** Écrit sur une toile, en points, avec l'écriture du kit. `c` et `ombre` : des couleurs. */
export function ecrisSur(T: Toile, texte: string, x: number, y: number, c: Rvb, ombre?: Rvb): void {
  const p = ecrire(enCapitales(String(texte)), hexDe(c));
  for (const [dy, coul] of ombre ? ([[1, ombre], [0, c]] as const) : ([[0, c]] as const))
    for (let j = 0; j < p.height; j++) for (let i = 0; i < p.width; i++) if (p.data[(j * p.width + i) * 4 + 3]! > 127) T.p(x + i, y + j + dy, coul);
}
const PETITS: Readonly<Record<string, string>> = { 0: "###/#.#/#.#/#.#/###", 1: ".#./##./.#./.#./###", 2: "###/..#/###/#../###", 3: "###/..#/.##/..#/###", 4: "#.#/#.#/###/..#/..#", 5: "###/#../###/..#/###", 6: "###/#../###/#.#/###", 7: "###/..#/.#./.#./.#.", 8: "###/#.#/###/#.#/###", 9: "###/#.#/###/..#/###" };
/** De petits chiffres de 3 points sur 5 (les jetons d'un téléphone, les numéros d'une petite roue). */
export function petitsSur(T: Toile, texte: string, x: number, y: number, c: Rvb): void {
  for (const ch of String(texte)) {
    const g = (PETITS[ch] ?? "").split("/");
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j]?.[i] === "#") T.p(x + i, y + j, c);
    x += 4;
  }
}

/* ---------- Les matières et les objets peints ---------- */

/** L'or d'un cadre : la lumière vient d'en haut à gauche, un reflet court en biais. `d` : la place dans l'épaisseur, 0 dehors, 1 dedans. */
export function orDeCadre(x: number, y: number, cote: number, d: number): Rvb {
  let v = [0.86, 0.7, 0.42, 0.3][cote]!;
  v += (d < 0.34 ? 0.12 : d > 0.7 ? -0.16 : 0) + 0.1 * Math.sin((x + y) * 0.11) + 0.06 * Math.sin((x - y) * 0.31);
  return OR.t(v, x, y, 0.9);
}
/** Un cadre d'or en relief, d'épaisseur `e`, autour du rectangle. */
export function cadreOr(Tl: Toile, x0: number, y0: number, w: number, h: number, e = 3, coins = true): void {
  Tl.f(x0, y0, x0 + w, y0 + h, (x, y) => {
    const g = x - x0;
    const d = x0 + w - 1 - x;
    const ht = y - y0;
    const b = y0 + h - 1 - y;
    const m = Math.min(g, d, ht, b);
    if (m >= e) return null;
    if (m === 0 || (m === e - 1 && e > 2)) return m === 0 ? ton(OR, 1) : ton(OR, 2);
    const cote = m === ht ? 0 : m === g ? 1 : m === d ? 2 : 3;
    return orDeCadre(x, y, cote, m / (e - 1));
  });
  if (coins && e >= 3)
    for (const [cx, cy] of [
      [x0 + 1, y0 + 1],
      [x0 + w - 2 - (e - 2), y0 + 1],
      [x0 + 1, y0 + h - 2 - (e - 2)],
      [x0 + w - 2 - (e - 2), y0 + h - 2 - (e - 2)],
    ] as const) {
      Tl.r(cx, cy, e - 1, e - 1, ton(OR, 7));
      Tl.p(cx + e - 2, cy + e - 2, ton(OR, 3));
      Tl.p(cx, cy, ton(OR, 8));
    }
}
/** Un disque : `fn(r, ang, x, y)` rend la couleur de chaque point (r de 0 à 1). */
export function disque(Tl: Toile, cx: number, cy: number, R: number, fn: (r: number, a: number, x: number, y: number) => Rvb | null, ry = R): void {
  Tl.f(cx - R - 1, cy - ry - 1, cx + R + 2, cy + ry + 2, (x, y) => {
    const dx = (x - cx) / R;
    const dy = (y - cy) / ry;
    const r = Math.hypot(dx, dy);
    return r <= 1 ? fn(r, Math.atan2(dy, dx), x, y) : null;
  });
}

/** Les valeurs des jetons et leur matière : ivoire, rubis, saphir, émeraude, bordeaux. */
export const JETONS = [10, 20, 50, 100, 200] as const;
export type ValeurDeJeton = (typeof JETONS)[number];
const TONS_DES_JETONS: Readonly<Record<ValeurDeJeton, Rampe>> = { 10: IVOIRE, 20: RUBIS, 50: SAPHIR, 100: EMERAUDE, 200: BORDEAUX };
/** Un jeton de céramique vu de dessus : huit incrustations d'ivoire sur la tranche, un filet, la valeur au centre. */
export function jeton(valeur: ValeurDeJeton, R = 13, ecrit = true, texte: string | number = valeur): Toile {
  const Tl = new Toile(2 * R + 3, 2 * R + 4);
  const rp = TONS_DES_JETONS[valeur];
  const clair = valeur === 10;
  const cx = R + 1;
  const cy = R + 1;
  const base = clair ? 0.82 : valeur === 200 ? 0.42 : 0.52;
  // la tranche, une rangée plus bas : l'épaisseur du jeton
  disque(Tl, cx, cy + 2, R, (_r, _a, x, y) => rp.t(base - 0.36, x, y, 0));
  disque(Tl, cx, cy, R, (r, a, x, y) => {
    const lum = -0.1 * Math.cos(a + 0.8) * r;
    const sec = ((a + Math.PI) / (Math.PI / 4) + 0.5) % 1;
    if (r > 0.74) {
      if (sec > 0.32 && sec < 0.68 && r < 0.95) return clair ? OR.t(0.62 + lum, x, y) : IVOIRE.t(0.86 + lum, x, y);
      return rp.t(base + lum, x, y, 0.6);
    }
    if (r > 0.64) return valeur === 200 || clair ? OR.t(0.66 + lum * 2, x, y) : rp.t(base + 0.26, x, y, 0.5);
    return rp.t(base + 0.08 + lum * 0.6 + (y < cy - R * 0.2 ? 0.05 : 0), x, y, 0.6);
  });
  Tl.cerne();
  if (ecrit) {
    const s = String(texte);
    const c = clair ? hex("#3a2606") : valeur === 200 ? ton(OR, 6) : ton(IVOIRE, 6);
    if (R >= 13) ecrisSur(Tl, s, cx - Math.floor(largeurDuTexte(s) / 2), cy - 3, c);
    else petitsSur(Tl, s, cx - Math.floor((s.length * 4 - 1) / 2), cy - 2, c);
  }
  return Tl;
}
/** Le jeton qui montre une mise posée : à la couleur du plus gros jeton qu'elle contient, le montant écrit dessus. */
export function jetonDeMise(v: number, R = 8): Toile {
  const valeur = [...JETONS].reverse().find((j) => j <= v) ?? 10;
  return jeton(valeur, R, true, v);
}
/** Une pile de jetons vue de trois quarts. */
export function pile(Tl: Toile, cx: number, bas: number, n: number, rp: Rampe, R = 9, ombre = true): void {
  const ry = Math.max(2, Math.round(R * 0.42));
  const clair = rp === IVOIRE;
  const base = clair ? 0.8 : rp === NOIR ? 0.4 : 0.5;
  const c = new Toile(2 * R + 3, n * 3 + 2 * ry + 4);
  const ox = R + 1;
  for (let k = 0; k < n; k++) {
    const y0 = c.h - ry - 3 - k * 3;
    c.f(0, y0, c.w, y0 + 4 + ry, (x, y) => {
      const dx = (x - ox) / R;
      if (Math.abs(dx) > 1) return null;
      const e = Math.sqrt(1 - dx * dx) * ry;
      if (y < y0 || y > y0 + 3 + e) return null;
      if (y <= y0 + e - 0.01 && y < y0 + 1) return null;
      const bande = Math.floor((dx + 1) * 3.5 + k * 0.5) % 2;
      return bande ? (clair ? OR.t(0.6, x, y) : IVOIRE.t(0.78 - Math.abs(dx) * 0.3, x, y)) : rp.t(base - 0.12 - Math.abs(dx + 0.3) * 0.22, x, y, 0.5);
    });
    disque(
      c,
      ox,
      y0,
      R,
      (r, a, x, y) => (r > 0.7 ? (((a + Math.PI) / (Math.PI / 4) + 0.5) % 1 > 0.5 ? (clair ? OR.t(0.62, x, y) : IVOIRE.t(0.86, x, y)) : rp.t(base + 0.06, x, y, 0.5)) : rp.t(base + 0.14 - r * 0.1, x, y, 0.5)),
      ry,
    );
  }
  c.cerne();
  if (ombre) Tl.poseOmbre(c, cx - ox, bas - c.h, 2, 2, 0.5);
  else Tl.pose(c, cx - ox, bas - c.h);
}

/** Le mur d'une vignette : un projecteur tramé sur un papier à losanges, de laque bordeaux la nuit, d'ivoire rosé le jour. */
export function mur(Tl: Toile, jour: boolean, cx = 0.5, cy = 0.42): void {
  const w = Tl.w;
  const h = Tl.h;
  Tl.tout((x, y) => {
    const d = Math.hypot((x - w * cx) / w, ((y - h * cy) / h) * 1.25);
    const los = Math.abs(((x + 400) % 16) - 8) + Math.abs(((y + 400) % 16) - 8) === 8 ? 1 : 0;
    const clou = (x % 16 === 8 && y % 16 === 0) || (x % 16 === 0 && y % 16 === 8) ? 1 : 0;
    if (jour) {
      const v = 0.98 - d * 0.75 - los * 0.09;
      return clou ? ton(OR, 5) : JOUR.t(v, x, y, 0.8);
    }
    const v = 0.56 - d * 0.9;
    if (clou && v > 0.1) return ton(OR, v > 0.3 ? 3 : 2);
    return BORDEAUX.t(Math.max(0, v) * 0.5 + los * 0.04, x, y, 1);
  });
}
/** Un plateau de velours vu de trois quarts, au bas de l'image, bordé d'un jonc d'or. */
export function plateau(Tl: Toile, haut: number, teinte: Rampe, courbe = 0.06): void {
  const w = Tl.w;
  const h = Tl.h;
  Tl.f(0, haut - 4, w, h, (x, y) => {
    const dx = (x - w / 2) / (w / 2);
    const bord = haut + dx * dx * w * courbe;
    if (y < bord) return null;
    const p = y - bord;
    if (p < 1) return ton(OR, 1);
    if (p < 4) return OR.t(0.85 - p * 0.16 + 0.12 * Math.sin(x * 0.21), x, y);
    if (p < 5) return ton(OR, 2);
    return teinte.t(0.5 - (p / (h - haut)) * 0.24 - Math.abs(dx) * 0.16 + 0.05 * grain(x >> 1, y >> 1), x, y, 1);
  });
}
/** Une lueur d'or tramée, qui s'ajoute à ce qui est peint. */
export function lueur(Tl: Toile, cx: number, cy: number, R: number, force = 0.5, c: Rvb = ton(OR, 6)): void {
  Tl.f(cx - R, cy - R, cx + R, cy + R, (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / R;
    if (d < 1) {
      const f = (1 - d) * (1 - d) * force;
      if (f + bayer(x, y) * 0.14 > 0.05) Tl.m(x, y, c, borne(f));
    }
    return null;
  });
}

/** Les enseignes des cartes. */
const ENSEIGNES = {
  pique: ["...#...", "..###..", ".#####.", "#######", "#######", ".##.##.", "...#...", "..###.."],
  coeur: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#...", "......."],
} as const;
export type Enseigne = keyof typeof ENSEIGNES;
export function enseigne(Tl: Toile, nom: Enseigne, x: number, y: number, c: Rvb, k = 1): void {
  const g = ENSEIGNES[nom];
  for (let j = 0; j < g.length; j++) for (let i = 0; i < 7; i++) if (g[j]![i] === "#") Tl.r(x + i * k, y + j * k, k, k, c);
}
/** Une carte à jouer d'ivoire, bordée d'or : son rang en haut à gauche, son enseigne en petit et en grand. */
export function carte(w: number, h: number, rang: string, nom: Enseigne): Toile {
  const Tl = new Toile(w, h);
  // Le pique : un noir à peine vineux (plus de violet depuis le bordeaux du palais).
  const c = nom === "coeur" ? ton(RUBIS, 3) : hex("#170a0e");
  Tl.f(0, 0, w, h, (x, y) => {
    const coin = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
    if (coin) return null;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return ton(OR, 5);
    return IVOIRE.t(0.98 - ((x + y) / (w + h)) * 0.22, x, y, 0.8);
  });
  ecrisSur(Tl, rang, 3, 3, c);
  enseigne(Tl, nom, 2, 12, c);
  enseigne(Tl, nom, (w >> 1) - 7, (h >> 1) - 5, c, 2);
  return Tl;
}
/** La bille d'ivoire, cernée d'encre, un éclat en haut à gauche. */
export function bille(Tl: Toile, cx: number, cy: number, r: number): void {
  for (let y = -r - 1; y <= r + 1; y++)
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d <= r + 0.3) Tl.p(cx + x, cy + y, IVOIRE.t(0.92 - (((x + y) * 0.09) / r) * 1.4, cx + x, cy + y, 0.5));
      else if (d <= r + 1.3) Tl.p(cx + x, cy + y, ENCRE);
    }
  Tl.p(cx - (r > 2 ? 1 : 0), cy - (r > 2 ? 1 : 0), [255, 255, 255]);
}
/** Les points d'une face de dé, sur une grille de 3 sur 3. */
const POINTS_DE_DE: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
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
/** Un dé d'ivoire (ou de la matière `rp`) vu de trois quarts, ses points de bordeaux. `faces` : dessus, gauche, droite. */
export function de(a: number, faces: readonly [number, number, number], rp: Rampe = IVOIRE): Toile {
  const h = Math.round(a * 1.08);
  const Tl = new Toile(2 * a + 3, a + h + 3);
  const cx = a + 1;
  const y0 = 1;
  const sombre = rp !== IVOIRE;
  const point = (u: number, v: number, n: number): boolean => (POINTS_DE_DE[n] ?? []).some(([i, j]) => Math.hypot(u - (0.22 + i * 0.28), v - (0.22 + j * 0.28)) < 0.105);
  const arrondi = (u: number, v: number): boolean => (u < 0.06 || u > 0.94) && (v < 0.06 || v > 0.94);
  Tl.tout((x, y) => {
    const px = x + 0.5 - cx;
    const py = y + 0.5 - y0;
    const u = (px / a + py / (a / 2)) / 2;
    const v = (py / (a / 2) - px / a) / 2;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      if (arrondi(u, v)) return null;
      return point(u, v, faces[0]) ? (sombre ? ton(IVOIRE, 6) : ton(BORDEAUX, 3)) : rp.t((sombre ? 0.62 : 0.98) - (u + v) * 0.05, x, y, 0.6);
    }
    if (px < 0) {
      const u2 = (px + a) / a;
      const t = (py - a / 2 - (u2 * a) / 2) / h;
      if (u2 >= 0 && t >= 0 && t <= 1) {
        if (arrondi(u2, t)) return null;
        return point(u2, t, faces[1]) ? (sombre ? ton(IVOIRE, 5) : ton(BORDEAUX, 2)) : rp.t((sombre ? 0.46 : 0.8) - t * 0.1, x, y, 0.6);
      }
    } else {
      const u2 = px / a;
      const t = (py - a + (u2 * a) / 2) / h;
      if (u2 <= 1 && t >= 0 && t <= 1) {
        if (arrondi(u2, t)) return null;
        return point(u2, t, faces[2]) ? (sombre ? ton(IVOIRE, 4) : ton(BORDEAUX, 1)) : rp.t((sombre ? 0.32 : 0.62) - t * 0.1, x, y, 0.6);
      }
    }
    return null;
  });
  return Tl.cerne();
}

/* ---------- Les pièces peintes des tables, en neuf parts (pierres, feutre, jonc, cadre, halo, reflet) ---------- */

/** Une case du tapis : une pierre taillée, lumière en haut à gauche. Coupe : 3. */
function caseGemme(rp: Rampe, etat: 0 | 1): Toile {
  const n = 12;
  const Tl = new Toile(n, n);
  Tl.tout((x, y) => {
    const m = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (m === 0) return etat ? ton(OR, 6) : ENCRE;
    if (m === 1) return rp.t(x + y < n - 1 ? 0.78 : 0.2, x, y, 0);
    if (m === 2) return rp.t(x + y < n - 1 ? (etat ? 0.62 : 0.5) : 0.3, x, y, 0);
    return ton(rp, etat ? 4 : 3);
  });
  return Tl;
}
/** Une case de feutre : le velours bordeaux, un filet d'or mat. Coupe : 3. */
function caseFeutre(etat: 0 | 1): Toile {
  const n = 12;
  const Tl = new Toile(n, n);
  Tl.tout((x, y) => {
    const m = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (m === 0) return etat ? ton(OR, 6) : ton(OR, 3);
    if (m === 1) return ton(BORDEAUX, etat ? 4 : 2);
    return ton(BORDEAUX, etat ? 4 : 3);
  });
  return Tl;
}
/** Le halo d'une case gagnante : deux filets d'or et une lueur tramée dehors. Coupe : 5. */
function halo(): Toile {
  const n = 16;
  const Tl = new Toile(n, n);
  Tl.tout((x, y) => {
    const m = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (m === 3) return ton(OR, 8);
    if (m === 4) return ton(OR, 6);
    if (m === 2) return ton(OR, 4);
    if (m < 2 && (x + y + m) % 2 === 0) return ton(OR, 5);
    return null;
  });
  return Tl;
}
/** Le feutre du tapis : un velours bordeaux au grain fin. */
function feutre(): Toile {
  const n = 32;
  const Tl = new Toile(n, n);
  Tl.tout((x, y) => BORDEAUX.t(0.33 + 0.07 * grain(x, y), x, y, 0.5));
  return Tl;
}
/** Le bord du tapis : un jonc d'or en relief. Coupe : 6. */
function jonc(): Toile {
  const n = 20;
  const Tl = new Toile(n, n);
  cadreOr(Tl, 0, 0, n, n, 5);
  for (let y = 5; y < n - 5; y++) for (let x = 5; x < n - 5; x++) Tl.p(x, y, [0, 0, 0], 0);
  return Tl;
}
/** Le cadre d'or d'une vignette. Coupe : 4. */
function cadre(vif: boolean): Toile {
  const n = 16;
  const Tl = new Toile(n, n);
  Tl.tout((x, y) => {
    const m = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (m > 3) return null;
    if (m === 0) return ENCRE;
    if (m === 3) return ton(OR, vif ? 3 : 1);
    const hl = x + y < n - 1;
    return ton(OR, m === 1 ? (hl ? (vif ? 8 : 6) : vif ? 5 : 3) : hl ? (vif ? 6 : 4) : vif ? 4 : 2);
  });
  return Tl;
}
/** Le reflet d'or qui passe : une bande en biais, tramée. */
function reflet(): Toile {
  const w = 56;
  const h = 8;
  const Tl = new Toile(w, h);
  Tl.tout((x, y) => {
    const u = (x - 6 + y) / 40;
    const f = u < 0 || u > 1 ? 0 : Math.sin(u * Math.PI);
    return f * 0.9 + bayer(x, y) > 0.52 ? ton(OR, 7) : null;
  });
  return Tl;
}

/**
 * Les pièces des tables, sans thème : `--cas-s-<nom>` de `/village/kit.css` (`kit-css.ts`), que la feuille du casino pose
 * (`27-jeu-casino.css`). Une case de pierre a deux états : au repos et survolée (`-s`).
 */
export const PIECES_DES_TABLES: Readonly<Record<string, () => Toile>> = {
  "case-rouge": () => caseGemme(RUBIS, 0),
  "case-rouge-s": () => caseGemme(RUBIS, 1),
  "case-bleue": () => caseGemme(SAPHIR, 0),
  "case-bleue-s": () => caseGemme(SAPHIR, 1),
  "case-verte": () => caseGemme(EMERAUDE, 0),
  "case-verte-s": () => caseGemme(EMERAUDE, 1),
  "case-or": () => caseGemme(OR, 0),
  "case-feutre": () => caseFeutre(0),
  "case-feutre-s": () => caseFeutre(1),
  halo,
  feutre,
  jonc,
  cadre: () => cadre(false),
  "cadre-vif": () => cadre(true),
  reflet,
};
