/**
 * Les cadres animés de la carte d'un membre (demande du pilote, 17 novembre 2026 : « cadres animés », six choisis sur
 * maquette, puis « crée-en 20 de plus », « détaillé selon la rareté »). Chaque cadre est dessiné case par case, comme les
 * finitions (`finitions-carte.ts`), sur une toile un peu plus grande que la carte : la carte y fait 96 × 160, et une marge
 * de 24 cases tout autour reçoit ce qui déborde (flammes, stalactites, rayons, blason du sommet).
 *
 * Deux niveaux de dessin, selon la rareté : les cadres communs et peu communs font sept cases d'épaisseur ; les épiques,
 * mystiques et légendaires en font dix, avec un blason au sommet, des coins sculptés, plusieurs couches de particules et
 * leur lumière sur l'image de la carte.
 *
 * Rien ici ne touche au navigateur : `peindreLeCadre` écrit des couleurs dans un tableau, que `cartes-mouvement.ts` pose
 * sur la toile. Aucun hasard qui change d'un appel à l'autre : le même instant redonne la même image.
 */

export const CARTE_L = 96;
export const CARTE_H = 160;
/** La marge de la toile du cadre autour de la carte, en cases de toile. */
export const MARGE_DU_CADRE = 24;
export const LARGEUR_DU_CADRE = CARTE_L + 2 * MARGE_DU_CADRE;
export const HAUTEUR_DU_CADRE = CARTE_H + 2 * MARGE_DU_CADRE;

export const CADRES_ANIMES = [
  "corde", "bois", "pierre", "fer",
  "lierre", "vagues", "damier", "tartan", "sablier", "tricolore", "braise", "givre",
  "or-liquide", "runes", "lave", "circuit", "rubis",
  "aurore", "toxique", "neon", "galaxie",
  "foudre", "arc-en-ciel", "glitch", "plasma", "soleil",
] as const;
export type CadreDeCarte = (typeof CADRES_ANIMES)[number];

type Rvb = [number, number, number];
type Pose = (x: number, y: number, c: Rvb, a?: number) => void;
interface Dessin {
  /** L'épaisseur du cadre, en cases : 7, ou 10 pour les cadres très détaillés. */
  epais: 7 | 10;
  /** La couleur d'une case du cadre : `d` sa profondeur depuis le bord, `p` sa place sur le tour, `cote` son côté. */
  px: (x: number, y: number, d: number, p: number, cote: number, t: number) => Rvb;
  /** Ce qui s'ajoute par-dessus : coins, blason, particules, lumière sur l'image. */
  plus?: (pose: Pose, t: number) => void;
}

const W = CARTE_L;
const H = CARTE_H;
const P = 2 * W + 2 * H;
const BLANC: Rvb = [255, 255, 255];
const h = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const mod = (a: number, n: number): number => ((a % n) + n) % n;
const mix = (a: Rvb, b: Rvb, k: number): Rvb => {
  const u = Math.max(0, Math.min(1, k));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};
const mul = (c: Rvb, k: number): Rvb => [c[0] * k, c[1] * k, c[2] * k];
const onde = (t: number, v = 1, ph = 0): number => 0.5 + 0.5 * Math.sin(t * v + ph);
const de = <T>(liste: readonly T[], i: number): T => liste[mod(Math.floor(i), liste.length)]!;
function tsl(teinte: number, s: number, l: number): Rvb {
  const hh = mod(teinte, 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (v: number): number => {
    const u = mod(v, 1);
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 0.5 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
}
/** Le Glitch change d'image trois fois par seconde : au-delà, il clignoterait (WCAG 2.3.1, « animations calmes »). */
const PAS_DU_GLITCH = 3;
const RELIEF_7 = [0.38, 1.22, 1.05, 0.95, 0.84, 0.66, 0.34];
const RELIEF_10 = [0.3, 1.25, 1.1, 1, 0.96, 0.9, 0.82, 0.7, 0.5, 0.28];
const r7 = (c: Rvb, d: number): Rvb => mul(c, de(RELIEF_7, d));
const r10 = (c: Rvb, d: number): Rvb => mul(c, de(RELIEF_10, d));
const eclatQuiPasse = (c: Rvb, p: number, t: number, v = 60, l = 12): Rvb => {
  const k = mod(p - t * v, P);
  return k < l ? mix(c, BLANC, 0.55 * (1 - k / l)) : c;
};
/** Le point du tour du cadre à la place `p`, et sa normale vers l'extérieur. */
const tour = (place: number): [number, number, number, number] => {
  const p = mod(place, P);
  return p < W ? [p, 0, 0, -1] : p < W + H ? [W - 1, p - W, 1, 0] : p < 2 * W + H ? [2 * W + H - p, H - 1, 0, 1] : [0, P - p, -1, 0];
};
const COINS: readonly [number, number][] = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];
const CROIX: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DIAGONALES: readonly [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
function disque(pose: Pose, cx: number, cy: number, r: number, f: (x: number, y: number, e: number) => Rvb | null, a = 1): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const e = Math.hypot(x, y);
      if (e > r + 0.3) continue;
      const c = f(x, y, e);
      if (c) pose(cx + x, cy + y, c, a);
    }
  }
}
function dessin(pose: Pose, lignes: readonly string[], couleur: Rvb, ox: number, oy: number, a = 1): void {
  lignes.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) if (ligne[x] === "#") pose(ox + x, oy + y, couleur, a);
  });
}
/** La lumière du cadre sur l'image : les sept cases qui bordent l'intérieur d'un cadre de dix cases. */
function lueur(pose: Pose, c: Rvb, force: number, f: (x: number, y: number) => number = () => 1): void {
  for (let y = 10; y < H - 10; y++) {
    for (let x = 10; x < W - 10; x++) {
      const k = Math.min(x, y, W - 1 - x, H - 1 - y) - 10;
      if (k < 7) pose(x, y, c, (1 - k / 7) * force * f(x, y));
    }
  }
}
/** Un coin ouvragé des cadres de sept cases : une plaque, son liseré, sa pierre qui scintille. */
function coins(pose: Pose, fond: Rvb, bord: Rvb, pierre: Rvb, t: number): void {
  for (const [ox, oy] of [[-2, -2], [W - 9, -2], [-2, H - 9], [W - 9, H - 9]] as const) {
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        if ((x === 0 || x === 10) && (y === 0 || y === 10)) continue;
        const b = x === 0 || y === 0 || x === 10 || y === 10;
        pose(ox + x, oy + y, b ? bord : mul(fond, x === 1 || y === 1 ? 1.25 : x === 9 || y === 9 ? 0.7 : 1));
      }
    }
    const k = onde(t, 2.2, ox + oy);
    for (let y = 3; y < 8; y++) for (let x = 3; x < 8; x++) if (Math.abs(x - 5) + Math.abs(y - 5) <= 2) pose(ox + x, oy + y, mix(pierre, BLANC, (x === 4 && y === 4 ? 0.7 : 0.1) + 0.3 * k));
  }
}
/** Des particules qui montent tout autour du cadre, dehors. */
function poussieres(pose: Pose, t: number, n: number, c: Rvb, vitesse = 0.2): void {
  for (let i = 0; i < n; i++) {
    const vie = mod(t * (vitesse + h(i) * vitesse) + h(i + 9), 1);
    const x = -16 + h(i + 3) * (W + 32) + Math.sin(t + i) * 3;
    const y = H + 14 - vie * (H + 30);
    if (x > 2 && x < W - 3 && y > 2 && y < H - 3) continue;
    pose(x, y, c, Math.sin(vie * Math.PI) * onde(t, 5, i));
  }
}
/** Des coulures qui pendent d'un bord et gouttent. */
function coulures(pose: Pose, t: number, y0: number, n: number, a: Rvb, b: Rvb, x0 = 6, pas = 7.6): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pas + h(i + y0) * 3;
    const l = 3 + 4 * onde(t, 1.2, i * 1.7) + h(i) * 3;
    for (let k = 0; k < l; k++) pose(x, y0 + k, mix(a, b, k / l), 0.95);
    pose(x - 1, y0, a);
    pose(x + 1, y0, a);
    const v = mod(t * 0.6 + h(i + y0), 1);
    if (v < 0.4) pose(x, y0 + l + v * 26, b, 1 - v * 2.5);
  }
}
const GLYPHES_7 = ["00100010101000111111100011000110001", "11111000010011100100001001111100000", "10001100010101000100010101000110001", "01110100011000001110000011000101110", "10101101011010101110001000010000100", "00100011101010100100001001010101110"];
const SPIRALE = ["..###....", ".#...#...", "#..##.#..", "#.#..#.#.", "#.#.#..#.", "#..##..#.", ".#....#..", "..####...", "........."];
const ECLAIR = ["..##.", ".##..", "####.", "..##.", ".##..", ".#..."];

const DESSINS: Readonly<Record<CadreDeCarte, Dessin>> = {
  /* ---------- Communs ---------- */
  corde: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      const k = mod(p + d * 2 - t * 5, 8);
      return r7(k % 4 < 1 ? [84, 52, 20] : k < 4 ? [214, 164, 104] : [150, 100, 50], d);
    },
    plus: (pose, t) => coins(pose, [150, 100, 50], [70, 42, 16], [214, 164, 104], t),
  },
  bois: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      const pl = Math.floor(p / 20);
      let col = mix([112, 64, 26], [168, 110, 56], h(pl * 7 + d * 3));
      if (h(p * 3 + pl) > 0.8) col = mul(col, 0.8);
      if (p % 20 === 0) col = [40, 24, 10];
      if (p % 20 === 10 && d === 3) col = [30, 26, 24];
      return r7(eclatQuiPasse(col, p, t, 45, 16), d);
    },
    plus: (pose, t) => coins(pose, [96, 104, 116], [34, 38, 46], [200, 206, 216], t),
  },
  pierre: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      const dec = d < 3 ? 0 : 6;
      let col = mix([118, 124, 136], [166, 172, 184], h(Math.floor((p + dec) / 12) + dec * 9));
      if ((p + dec) % 12 === 0 || d === 3) col = [62, 66, 74];
      const m = h(p * 3 + d * 17);
      if (m > 0.86) col = mix([40, 120, 50], [130, 230, 110], onde(t, 2, m * 60));
      return r7(col, d);
    },
    plus: (pose, t) => coins(pose, [140, 146, 158], [54, 58, 66], [90, 200, 100], t),
  },
  fer: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      let col = mix([70, 76, 86], [124, 132, 146], h(Math.floor(p / 16)));
      const r = p % 16;
      if (r === 0) col = [26, 28, 34];
      if ((r === 7 || r === 8) && (d === 3 || d === 4)) col = r === 7 && d === 3 ? [236, 240, 246] : [150, 158, 170];
      if ((r === 9 && (d === 3 || d === 4)) || (d === 5 && (r === 7 || r === 8))) col = [30, 32, 38];
      return r7(eclatQuiPasse(col, p, t, 80, 10), d);
    },
    plus: (pose, t) => coins(pose, [110, 118, 130], [26, 28, 34], [236, 240, 246], t),
  },
  /* ---------- Peu communs ---------- */
  lierre: {
    epais: 7,
    px: (x, y, d, p) => {
      if (d === 0 || d === 6) return [30, 20, 12];
      let col = mix([64, 42, 24], [112, 78, 46], h(Math.floor(p / 3) * 3 + Math.floor(d / 2)));
      if (h(d * 11 + Math.floor(p / 14)) > 0.7) col = mul(col, 0.78);
      return r7(col, d);
    },
    plus: (pose, t) => {
      const tige = (p: number): [number, number, number, number] => {
        const [x, y, nx, ny] = tour(p);
        const o = 3 + 2.2 * Math.sin(p / 9 + Math.sin(t * 0.7) * 0.3);
        return [x - nx * o, y - ny * o, nx, ny];
      };
      for (let p = 0; p < P; p += 0.5) {
        const [x, y] = tige(p);
        pose(x, y, [36, 130, 58]);
      }
      for (let i = 0; i < P / 8; i++) {
        const [x, y, nx, ny] = tige(i * 8 + 3);
        const s = i % 2 ? 1 : -1;
        const bal = Math.sin(t * 1.5 + i) * 0.7;
        for (let k = 1; k <= 4; k++) {
          const w = k === 2 || k === 3 ? 1 : 0;
          for (let e = -w; e <= w; e++) pose(x + nx * s * k + ny * (e + (bal * k) / 4), y + ny * s * k + nx * (e + (bal * k) / 4), e === 0 ? [40, 132, 60] : k < 3 ? [88, 204, 108] : [132, 232, 140]);
        }
      }
      for (let i = 0; i < P / 52; i++) {
        const [x, y] = tige(i * 52 + 20);
        const o = onde(t, 0.8, i * 1.3);
        const col: Rvb = i % 2 ? [255, 244, 250] : [255, 130, 190];
        if (o > 0.3) for (const [ax, ay] of CROIX) pose(x + ax, y + ay, col);
        pose(x, y, [255, 200, 40]);
      }
    },
  },
  vagues: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 6) return [6, 40, 96];
      const cr = 3 + 2 * Math.sin((p - t * 10) / 5);
      if (Math.abs(d - cr) < 0.7) return [240, 252, 255];
      return d < cr ? mix([10, 70, 150], [30, 120, 200], d / 6) : mix([90, 190, 250], [170, 230, 255], h(p + d * 3));
    },
    plus: (pose, t) => coins(pose, [240, 214, 170], [120, 84, 50], [255, 170, 150], t),
  },
  damier: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 6) return [201, 143, 18];
      const k = (Math.floor((p + t * 6) / 3) + Math.floor((d - 1) / 1.67)) % 2;
      return r7(k ? [244, 244, 246] : [22, 24, 30], d === 1 ? 1 : d === 5 ? 4 : 3);
    },
    plus: (pose, t) => coins(pose, [226, 171, 44], [100, 66, 6], [22, 24, 30], t),
  },
  tartan: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      const k = mod(p + Math.floor(t * 4), 12);
      let col: Rvb = k < 2 ? [242, 194, 48] : k >= 5 && k < 9 ? [11, 61, 46] : [200, 16, 46];
      if (d === 2 || d === 4) col = mix(col, [11, 61, 46], 0.55);
      if (d === 3 && k % 3 === 0) col = [242, 194, 48];
      return r7(col, d);
    },
    plus: (pose, t) => coins(pose, [200, 16, 46], [60, 6, 14], [242, 194, 48], t),
  },
  sablier: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 6) return [92, 58, 14];
      const g = c === 1 || c === 3 ? h(x * 31 + mod(y - Math.floor(t * 26), 256) * 17) : h(x * 31 + y * 17 + Math.floor(t * 3));
      if (g > 0.8) return [255, 250, 220];
      if (g < 0.1) return [104, 64, 16];
      return mix([222, 168, 70], [164, 110, 38], d / 6);
    },
    plus: (pose, t) => {
      coins(pose, [120, 78, 30], [56, 34, 10], [150, 220, 255], t);
      // Un filet de sable tombe de chaque coin du haut vers le bas, le long du cadre.
      for (let i = 0; i < 40; i++) {
        const vie = mod(t * 0.5 + h(i), 1);
        pose(i % 2 ? -2 : W + 1, 6 + vie * (H - 12), [255, 244, 200], 0.8 * Math.sin(vie * Math.PI));
      }
    },
  },
  tricolore: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      const col: Rvb = d === 0 || d === 6 ? [14, 22, 60] : d < 3 ? [31, 79, 216] : d === 3 ? [240, 242, 250] : [224, 38, 58];
      return mul(col, 0.82 + 0.3 * Math.sin((p - t * 30) / 9));
    },
    plus: (pose, t) => coins(pose, [226, 171, 44], [100, 66, 6], [255, 243, 176], t),
  },
  braise: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      let col = mix([24, 16, 14], [64, 42, 34], h(p * 7 + d * 3));
      const e = h(Math.floor(p / 3) * 5 + Math.floor(d / 2));
      if (e > 0.5) col = mix([150, 26, 6], [255, 200, 70], onde(t, 3, e * 40));
      return r7(col, d);
    },
    plus: (pose, t) => {
      for (let i = 0; i < 70; i++) {
        const vie = mod(t * (0.6 + h(i) * 0.6) + h(i + 50), 1);
        const cote = i % 5;
        const x = cote < 3 ? h(i + 3) * W + Math.sin(t * 3 + i) * 1.5 : cote === 3 ? -1 - vie * 3 : W + vie * 3;
        const y = cote < 3 ? -1 - vie * 10 : H * h(i + 9) - vie * 16;
        const col = mix([255, 236, 150], [220, 40, 10], vie);
        pose(x, y, col, 1 - vie);
        if (vie < 0.5) pose(x, y + 1, col, 0.8);
      }
    },
  },
  givre: {
    epais: 7,
    px: (x, y, d, p, c, t) => {
      if (d === 0) return [60, 124, 200];
      if (d === 6) return [96, 160, 224];
      let col = mix([140, 200, 245], [236, 248, 255], h(p * 3 + d * 11));
      if ((p + d * 2) % 7 === 0) col = BLANC;
      const s = h(p * 9 + d * 5);
      if (s > 0.95) col = mix(col, BLANC, onde(t, 4, s * 90));
      return col;
    },
    plus: (pose, t) => {
      for (let i = 0; i < 11; i++) {
        const x = 9 + i * 7.5 + h(i) * 3;
        const l = 4 + h(i + 4) * 9;
        for (let k = 0; k < l; k++) {
          const w = k < l * 0.4 ? 1 : 0;
          for (let dx = -w; dx <= w; dx++) pose(x + dx, 7 + k, dx < 0 ? BLANC : mix([150, 210, 250], [220, 244, 255], k / l), 0.92);
        }
        const v = mod(t * 0.5 + h(i + 20), 1);
        if (v < 0.5) pose(x, 7 + l + v * 30, [220, 244, 255], 1 - v * 2);
      }
      for (let i = 0; i < 16; i++) {
        const vie = mod(t * 0.25 + h(i + 70), 1);
        pose(-6 + h(i) * (W + 12) + Math.sin(t + i) * 3, -8 + vie * (H + 16), BLANC, 0.9 * Math.sin(vie * Math.PI));
      }
    },
  },
  /* ---------- Épiques ---------- */
  "or-liquide": {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 9) return [84, 52, 4];
      const k = onde(t, -2.5, p / 7 + d * 0.9);
      const vague = 4.5 + 2.5 * Math.sin(p / 12 - t * 1.4);
      let col = mix([140, 90, 8], [255, 232, 140], k);
      if (Math.abs(d - vague) < 0.8) col = [255, 252, 230];
      if (k > 0.95) col = [255, 252, 230];
      return r10(col, d);
    },
    plus: (pose, t) => {
      lueur(pose, [255, 206, 90], 0.24, (x, y) => 0.75 + 0.25 * Math.sin(t * 1.6 + (x - y) * 0.1));
      // Le creuset du sommet : un bol sombre, l'or fondu qui déborde.
      for (let y = -9; y <= -1; y++) for (let x = -8; x <= 8; x++) if (Math.abs(x) <= 8 + (y + 1) * 0.45) pose(W / 2 + x, y, y === -9 ? mix([255, 214, 90], [255, 252, 230], onde(t, 3, x)) : Math.abs(x) >= 7 + (y + 1) * 0.45 ? [30, 26, 30] : [62, 56, 62]);
      for (let k = 0; k < 4 + 3 * onde(t, 1.5); k++) pose(W / 2 + 6, -9 + k, [255, 232, 140]);
      for (const [cx, cy] of COINS) disque(pose, cx, cy, 6, (x, y, e) => (e > 5.2 ? [84, 52, 4] : (x + y + 20) % 4 < 2 ? mix([226, 171, 44], [255, 252, 230], onde(t, 2, cx + x)) : [170, 116, 14]));
      coulures(pose, t, 10, 10, [226, 171, 44], [255, 244, 190], 14, 7.4);
      coulures(pose, t, H, 12, [226, 171, 44], [255, 244, 190]);
      poussieres(pose, t, 36, [255, 240, 170]);
    },
  },
  runes: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      const i = Math.floor(p / 16);
      const lp = p % 16;
      const tete = mod(t * 3.5, P / 16);
      const feu = Math.max(0, 1 - Math.min(mod(i - tete, P / 16), mod(tete - i, P / 16)) / 3);
      let col = mix([40, 48, 62], [70, 80, 98], h(p * 5 + d * 7) * 0.6 + h(i) * 0.4);
      if (lp === 0 || d === 0 || d === 9) col = [16, 20, 28];
      else if (lp === 1 || d === 1) col = mul(col, 1.3);
      else if (lp === 15 || d === 8) col = mul(col, 0.65);
      col = mix(col, [41, 224, 122], feu * 0.22);
      const gx = lp - 6;
      const gy = d - 2;
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && de(GLYPHES_7, i)[gy * 5 + gx] === "1") col = mix([20, 84, 52], [170, 255, 205], Math.max(0.12, feu));
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, [41, 224, 122], 0.22, () => 0.6 + 0.4 * Math.sin(t * 1.5));
      for (const [cx, cy] of COINS) {
        for (let y = -7; y <= 7; y++) {
          for (let x = -7; x <= 7; x++) {
            const b = Math.max(Math.abs(x), Math.abs(y));
            if (Math.abs(x) === 7 && Math.abs(y) === 7) continue;
            pose(cx + x, cy + y, b === 7 ? [16, 20, 28] : b === 6 ? (x < 0 || y < 0 ? [96, 108, 128] : [36, 42, 54]) : mix([52, 60, 76], [66, 76, 94], h(x * 7 + y * 3)));
          }
        }
        dessin(pose, SPIRALE, mix([24, 110, 66], [170, 255, 205], onde(t, 1.8, cx)), cx - 4, cy - 4);
      }
      const fx = W / 2;
      for (let y = -9; y <= -1; y++) for (let x = -9; x <= 9; x++) if (Math.abs(x) <= 13 + y * 0.5) pose(fx + x, y, y === -9 || Math.abs(x) >= 12 + y * 0.5 ? [16, 20, 28] : mix([52, 60, 76], [80, 92, 112], h(x * 3 + y * 11)));
      const k = onde(t, 2);
      for (let y = -17; y <= -4; y++) {
        const w = y < -12 ? Math.round((y + 18) / 2) : y < -7 ? 3 : Math.round((-3 - y) * 0.8);
        for (let x = -w; x <= w; x++) pose(fx + x, y, x < 0 ? mix([120, 255, 180], BLANC, k * 0.6) : mix([20, 150, 90], [90, 240, 160], k));
      }
      for (let y = -23; y < -17; y++) for (const x of [-1, 0, 1]) pose(fx + x, y, [150, 255, 200], (0.3 + 0.5 * k) * (1 - (-17 - y) / 9) * (x ? 0.5 : 1));
      for (let i = 0; i < 56; i++) {
        const [x, y, nx, ny] = tour((i * P) / 56 + t * 14);
        const o = 9 + Math.sin(i * 0.9) * 1.2;
        const a = 0.35 + 0.65 * onde(t, 2, i * 0.7);
        pose(x + nx * o, y + ny * o, [130, 255, 185], a);
        if (i % 7 === 0) for (const [ax, ay] of CROIX) pose(x + nx * o + ax, y + ny * o + ay, [41, 224, 122], a);
      }
      poussieres(pose, t, 40, [150, 255, 200], 0.25);
    },
  },
  lave: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0) return [12, 6, 4];
      if (d === 9) return mix([150, 30, 6], [255, 170, 50], onde(t, 3, p / 8));
      const f = Math.sin(p * 0.9) + Math.sin(p * 0.37 + d * 1.7) + Math.sin(d * 2.1 + p * 0.13);
      if (Math.abs(f) < 0.3) return mix([230, 60, 16], [255, 220, 90], onde(t, 2, -p / 18));
      return r10(mix([24, 12, 9], [58, 32, 22], h(p * 3 + d * 13)), d);
    },
    plus: (pose, t) => {
      lueur(pose, [255, 90, 30], 0.36, (x, y) => 0.7 + 0.3 * Math.sin(t * 2.4 + y * 0.2));
      // Le volcan du sommet : un cône de roche, sa gerbe de lave.
      for (let y = -11; y <= -1; y++) for (let x = -10; x <= 10; x++) if (Math.abs(x) <= 3 + (y + 11) * 0.7) pose(W / 2 + x, y, y < -9 ? mix([255, 120, 30], [255, 230, 110], onde(t, 5, x)) : h(x * 7 + y * 5) > 0.82 ? [230, 70, 16] : mix([30, 16, 12], [66, 38, 26], h(x * 3 + y)));
      for (let i = 0; i < 26; i++) {
        const vie = mod(t * (0.7 + h(i) * 0.5) + h(i + 4), 1);
        const vx = (h(i + 8) - 0.5) * 22;
        pose(W / 2 + vx * vie, -12 - 26 * vie + 30 * vie * vie, mix([255, 240, 150], [220, 50, 10], vie), 1 - vie * 0.8);
      }
      for (const [cx, cy] of COINS) disque(pose, cx, cy, 7, (x, y, e) => (e > 6 ? [12, 6, 4] : Math.abs(x) + Math.abs(y) < 3 + 2 * onde(t, 2, cx) ? mix([255, 120, 30], [255, 236, 130], onde(t, 3, cy)) : (x * 3 + y * 5 + 40) % 7 < 2 ? [84, 48, 34] : [34, 18, 13]));
      coulures(pose, t, H, 12, [240, 80, 16], [255, 214, 80]);
      for (let i = 0; i < 44; i++) {
        const vie = mod(t * (0.5 + h(i)) + h(i + 9), 1);
        const [x, y, nx, ny] = tour(h(i + 30) * P);
        pose(x + nx * 2 + Math.sin(i + t * 4) * 2, y + ny * 2 - vie * 12, mix([255, 230, 120], [200, 40, 10], vie), 1 - vie);
      }
    },
  },
  circuit: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 9) return [2, 10, 5];
      let col: Rvb = h(Math.floor(p / 4) + d * 3) > 0.9 ? [8, 40, 18] : [5, 28, 12];
      const piste = d === 2 || d === 5 || d === 7;
      if (piste) col = [20, 120, 60];
      if (p % 14 === 0 && d >= 2 && d <= 7) col = [60, 200, 110];
      if (p % 28 === 7 && (d === 3 || d === 4)) col = [206, 172, 60];
      if (p % 42 > 20 && p % 42 < 27 && d >= 3 && d <= 4) col = [18, 18, 22];
      for (let k = 0; k < 3; k++) {
        const a = mod(t * 70 + (k * P) / 3 - p, P);
        const b = mod(p - (P - mod(t * 50 + (k * P) / 3, P)), P);
        const e = mod(t * 95 + (k * P) / 3 + 40 - p, P);
        if (d === 2 && a < 12) col = mix([190, 255, 215], col, a / 12);
        if (d === 5 && b < 12) col = mix([190, 255, 215], col, b / 12);
        if (d === 7 && e < 8) col = mix([255, 240, 150], col, e / 8);
      }
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, [41, 224, 122], 0.16, (x, y) => (y + Math.floor(t * 30)) % 6 < 1 ? 1.6 : 0.8);
      const puce = (cx: number, cy: number, r: number, led: number): void => {
        for (let y = -r; y <= r; y++) {
          for (let x = -r - 2; x <= r + 2; x++) {
            const patte = Math.abs(x) > r;
            if (patte && y % 2 !== 0) continue;
            pose(cx + x, cy + y, patte ? [200, 206, 216] : Math.abs(x) === r || Math.abs(y) === r ? [10, 12, 16] : [28, 30, 38]);
          }
        }
        pose(cx - r + 2, cy - r + 2, [120, 126, 140]);
        pose(cx, cy, mix([40, 60, 40], [120, 255, 170], onde(t, 6, led) > 0.5 ? 1 : 0));
        pose(cx + 1, cy, mix([60, 30, 30], [255, 90, 80], onde(t, 3.7, led * 2) > 0.6 ? 1 : 0));
      };
      for (const [cx, cy] of COINS) puce(cx, cy, 5, cx + cy);
      puce(W / 2, -7, 6, 3);
      for (let i = 0; i < 30; i++) {
        const vie = mod(t * (0.16 + h(i) * 0.2) + h(i + 5), 1);
        const x = i % 2 ? -5 - h(i + 2) * 12 : W + 4 + h(i + 2) * 12;
        dessin(pose, i % 3 ? ["#", "#", "#", "#"] : ["###", "#.#", "#.#", "###"], [120, 255, 170], x, H + 6 - vie * (H + 20), Math.sin(vie * Math.PI) * 0.85);
      }
    },
  },
  rubis: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 9) return [84, 52, 4];
      let col = r10(mix([150, 100, 14], [236, 184, 60], h(p * 3 + d)), d);
      if ((d === 1 || d === 8) && p % 3 === 0) col = [255, 246, 200];
      const lp = (p % 16) - 8;
      const e = Math.abs(lp) + Math.abs(d - 4.5);
      if (e <= 4) {
        const k = Math.max(0, Math.sin(t * 2 + Math.floor(p / 16) * 0.8)) ** 4;
        col = e > 3.2 ? [70, 6, 18] : mix(lp < 0 ? [214, 26, 58] : [128, 8, 28], [255, 196, 206], k);
        if (lp === -1 && d === 3) col = [255, 220, 228];
      }
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, [232, 36, 63], 0.16, () => 0.6 + 0.4 * Math.sin(t * 1.3));
      const gemme = (cx: number, cy: number, r: number, ph: number): void => {
        disque(pose, cx, cy, r + 2, (x, y, e) => (e > r + 1.2 ? [84, 52, 4] : e > r ? [236, 184, 60] : null));
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.abs(x) + Math.abs(y) <= r) pose(cx + x, cy + y, x + y < -r / 2 ? mix([255, 150, 170], BLANC, onde(t, 2, ph)) : x < 0 ? [224, 30, 62] : y < 0 ? [176, 14, 40] : [116, 6, 24]);
        const g = Math.round(2 + 5 * onde(t, 2.4, ph) ** 3);
        for (let k = 0; k <= g; k++) for (const [ax, ay] of CROIX) pose(cx + ax * k - 2, cy + ay * k - 2, BLANC, 1 - k / (g + 1));
      };
      for (const [cx, cy] of COINS) gemme(cx, cy, 5, cx * 0.2 + cy * 0.1);
      gemme(W / 2, -9, 8, 1);
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) pose(W / 2 + s * (12 + k), -3 - k, [236, 184, 60]);
      poussieres(pose, t, 30, [255, 180, 196]);
    },
  },
  /* ---------- Mystiques ---------- */
  aurore: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 9) return [4, 8, 26];
      let col: Rvb = [8, 14, 40];
      col = mix(col, [41, 224, 122], Math.exp(-((d - 4.5 - 3.4 * Math.sin(p / 9 + t * 0.8)) ** 2) / 2.4));
      col = mix(col, [160, 110, 255], 0.9 * Math.exp(-((d - 4.5 - 3.4 * Math.sin(p / 13 - t * 0.6 + 2)) ** 2) / 2.4));
      col = mix(col, [60, 200, 255], 0.7 * Math.exp(-((d - 4.5 - 3 * Math.sin(p / 17 + t * 0.4 + 4)) ** 2) / 1.6));
      const s = h(p * 11 + d * 3);
      if (s > 0.955) col = mix(col, BLANC, onde(t, 3, s * 70));
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, mix([41, 224, 122], [160, 110, 255], onde(t, 0.5)), 0.24);
      // Les voiles au-dessus du cadre : des bandes de lumière qui ondulent.
      for (let x = -6; x < W + 6; x++) {
        const haut = 7 + 6 * Math.sin(x / 9 + t * 0.7) + 3 * Math.sin(x / 4 - t * 1.1);
        for (let k = 0; k < haut; k++) pose(x, -2 - k, mix([41, 224, 122], [170, 120, 255], k / 14 + 0.2 * Math.sin(x / 13 + t)), 0.6 * (1 - k / haut) * (0.6 + 0.4 * Math.sin(x / 3 + t * 2)));
      }
      disque(pose, W / 2, -12, 6, (x, y, e) => (Math.hypot(x - 3, y - 1) < 5.2 ? null : e > 5.2 ? [150, 160, 200] : mix([255, 252, 230], [200, 210, 240], (x + 6) / 12)));
      for (const [cx, cy] of COINS) {
        const k = onde(t, 2, cx + cy);
        for (let r = 0; r <= 8; r++) {
          for (const [ax, ay] of CROIX) pose(cx + ax * r, cy + ay * r, mix(BLANC, [120, 230, 190], r / 8), 1 - r / 10);
          if (r <= 3 + 2 * k) for (const [ax, ay] of DIAGONALES) pose(cx + ax * r, cy + ay * r, [190, 170, 255], 1 - r / 6);
        }
      }
      const f = mod(t * 0.35, 1);
      if (f < 0.4) for (let k = 0; k < 12; k++) pose(-14 + f * 2.5 * (W + 28) - k, -16 + f * 30 - k * 0.4, mix(BLANC, [140, 200, 255], k / 12), 1 - k / 12);
      poussieres(pose, t, 30, [200, 255, 230], 0.12);
    },
  },
  toxique: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0) return [12, 30, 4];
      if (d === 9) return [40, 96, 10];
      let col = mix([24, 62, 8], [118, 190, 26], onde(t, 1, p / 5 + d));
      const b = h(Math.floor(p / 3) * 9 + Math.floor(d / 2 + t * 2));
      if (b > 0.8) col = [214, 255, 80];
      if (b < 0.07) col = [150, 70, 230];
      const bulle = Math.hypot((p % 22) - 11, d - 4.5 - 2 * Math.sin(t * 1.5 + Math.floor(p / 22)));
      if (bulle < 2.6) col = bulle > 1.8 ? [214, 255, 80] : bulle < 1 ? BLANC : [150, 220, 40];
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, [182, 255, 42], 0.2, (x, y) => 0.7 + 0.3 * Math.sin(t * 2 + y * 0.15));
      coulures(pose, t, 10, 10, [150, 220, 30], [214, 255, 80], 14, 7.4);
      coulures(pose, t, H, 12, [150, 220, 30], [214, 255, 80]);
      // La fiole du sommet : son col, son ventre, le liquide qui bout, la vapeur violette.
      const fx = W / 2;
      for (let y = -19; y <= -13; y++) for (const x of [-2, -1, 0, 1, 2]) pose(fx + x, y, Math.abs(x) === 2 ? [150, 190, 200] : [40, 60, 50], Math.abs(x) === 2 ? 1 : 0.5);
      disque(pose, fx, -7, 7, (x, y, e) => (e > 6.2 ? [150, 190, 200] : y > -2 + Math.sin(x * 0.9 + t * 4) ? mix([118, 190, 26], [214, 255, 80], h(x * 5 + y * 3 + Math.floor(t * 6))) : [30, 50, 40]));
      pose(fx - 4, -10, BLANC);
      pose(fx - 3, -11, BLANC);
      for (let i = 0; i < 16; i++) {
        const vie = mod(t * 0.35 + h(i + 5), 1);
        disque(pose, fx + Math.sin(t * 1.4 + i * 2) * (1 + vie * 5), -20 - vie * 4, 1, () => [170, 90, 240], 0.4 * (1 - vie));
      }
      for (const [cx, cy] of COINS) {
        const r = 5 + Math.round(onde(t, 1.6, cx));
        disque(pose, cx, cy, r, (x, y, e) => (e > r - 0.8 ? [214, 255, 80] : x + y < -r * 0.6 ? BLANC : [96, 170, 22]), 0.95);
      }
      for (let i = 0; i < 34; i++) {
        const vie = mod(t * (0.14 + h(i) * 0.2) + h(i + 9), 1);
        const x = i % 2 ? -4 - h(i + 2) * 14 : W + 3 + h(i + 2) * 14;
        const y = H + 6 - vie * (H + 20);
        pose(x + Math.sin(t * 2 + i) * 2, y, [214, 255, 80], Math.sin(vie * Math.PI) * 0.9);
        if (i % 4 === 0) for (const [ax, ay] of CROIX) pose(x + Math.sin(t * 2 + i) * 2 + ax, y + ay, [150, 220, 40], Math.sin(vie * Math.PI) * 0.7);
      }
    },
  },
  neon: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      const gr = Math.floor(t * 12) % 37 === 0 ? 0.45 : 1;
      const a = (0.72 + 0.28 * Math.sin(t * 4)) * gr;
      const b = 0.72 + 0.28 * Math.sin(t * 4 + 2.1);
      const j = 0.72 + 0.28 * Math.sin(t * 4 + 4.2);
      let col: Rvb = d === 0 || d === 9 ? [6, 6, 16] : [14, 14, 32];
      if (d === 2) col = mix([0, 120, 140], [160, 252, 255], a);
      else if (d === 5) col = mix([140, 0, 110], [255, 160, 238], b);
      else if (d === 7) col = mix([130, 110, 0], [255, 244, 150], j);
      else {
        if (d === 1 || d === 3) col = mix(col, [0, 229, 255], 0.34 * a);
        if (d === 4 || d === 6) col = mix(col, [255, 43, 214], 0.34 * b);
        if (d === 8) col = mix(col, [255, 220, 60], 0.3 * j);
      }
      if (p % 32 === 0 && (d === 2 || d === 5 || d === 7)) col = [70, 70, 92];
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, mix([0, 229, 255], [255, 43, 214], onde(t, 1.2)), 0.26);
      // Les ampoules qui courent autour du cadre, une sur trois allumée.
      for (let i = 0; i < P / 8; i++) {
        const [x, y, nx, ny] = tour(i * 8 + 4);
        const allumee = (i + Math.floor(t * 6)) % 3 === 0;
        const col: Rvb = de([[0, 229, 255], [255, 43, 214], [255, 230, 80]] as Rvb[], i);
        pose(x + nx * 3, y + ny * 3, allumee ? mix(col, BLANC, 0.6) : mul(col, 0.3));
        if (allumee) for (const [ax, ay] of CROIX) pose(x + nx * 3 + ax, y + ny * 3 + ay, col, 0.55);
      }
      // L'étoile du sommet, en tube, qui change de couleur.
      const fx = W / 2;
      const fy = -13;
      const col: Rvb = de([[0, 229, 255], [255, 43, 214], [255, 230, 80]] as Rvb[], t * 1.5);
      for (let a = 0; a < 5; a++) {
        const a1 = -Math.PI / 2 + (a * 2 * Math.PI) / 5;
        const a2 = a1 + (2 * 2 * Math.PI) / 5;
        for (let k = 0; k <= 20; k++) {
          const u = k / 20;
          const px = fx + (Math.cos(a1) * (1 - u) + Math.cos(a2) * u) * 10;
          const py = fy + (Math.sin(a1) * (1 - u) + Math.sin(a2) * u) * 10;
          pose(px, py, mix(col, BLANC, 0.55));
          pose(px, py + 1, col, 0.45);
        }
      }
      for (const [cx, cy] of COINS) {
        for (const [r, cc] of [[6, [0, 229, 255]], [4, [255, 43, 214]], [2, [255, 230, 80]]] as [number, Rvb][]) disque(pose, cx, cy, r, (x, y, e) => (e > r - 0.9 ? mix(cc, BLANC, 0.4 * onde(t, 4, r)) : e > r - 1.8 ? [14, 14, 32] : null));
      }
    },
  },
  galaxie: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 9) return [8, 4, 30];
      let col = mix([16, 8, 54], [96, 40, 200], onde(t, 0.3, p / 40 + d / 3));
      col = mix(col, [230, 90, 200], 0.4 * onde(t, -0.2, p / 23 + d));
      col = mix(col, [60, 160, 255], 0.3 * onde(t, 0.25, p / 31 - d / 2));
      const s = h(p * 13 + d * 7);
      if (s > 0.92) col = mix(col, BLANC, 0.3 + 0.7 * Math.abs(Math.sin(t * 2.5 + s * 50)));
      const a = mod(t * 95 - p, P);
      if (Math.abs(d - 4.5) < 1 && a < 18) col = mix(BLANC, [170, 130, 255], a / 18);
      if (a < 2 && d >= 3 && d <= 6) col = BLANC;
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, [138, 75, 255], 0.22, (x, y) => 0.7 + 0.3 * Math.sin(t + (x + y) * 0.06));
      // La planète du sommet et son anneau.
      const fx = W / 2;
      const fy = -11;
      for (let a = 0; a < 60; a++) {
        const an = (a / 60) * Math.PI * 2;
        if (Math.sin(an) < 0) pose(fx + Math.cos(an) * 13, fy + Math.sin(an) * 3.2 + Math.cos(an) * 1.5, [214, 190, 255], 0.9);
      }
      disque(pose, fx, fy, 7, (x, y, e) => (e > 6.3 ? [50, 24, 110] : mix([255, 170, 220], [110, 60, 220], (x + y + 10) / 20 + 0.12 * Math.sin(y * 1.4 + t))));
      for (let a = 0; a < 60; a++) {
        const an = (a / 60) * Math.PI * 2;
        if (Math.sin(an) >= 0) pose(fx + Math.cos(an) * 13, fy + Math.sin(an) * 3.2 + Math.cos(an) * 1.5, a % 3 ? [236, 220, 255] : [170, 140, 240]);
      }
      // Une petite galaxie en spirale à chaque coin, qui tourne.
      for (const [cx, cy] of COINS) {
        for (let b = 0; b < 2; b++) for (let k = 0; k < 16; k++) {
          const an = k * 0.42 + b * Math.PI + t * 0.6;
          pose(cx + Math.cos(an) * k * 0.5, cy + Math.sin(an) * k * 0.5, mix(BLANC, [170, 110, 255], k / 16), 1 - k / 20);
        }
        disque(pose, cx, cy, 1, () => [255, 244, 220]);
      }
      // Deux comètes font le tour du cadre, dehors.
      for (let i = 0; i < 2; i++) for (let k = 0; k < 14; k++) {
        const [x, y, nx, ny] = tour(t * 26 + (i * P) / 2 - k * 1.6);
        pose(x + nx * (7 + 2 * Math.sin(t + i)), y + ny * (7 + 2 * Math.sin(t + i)), mix(BLANC, [120, 160, 255], k / 14), 1 - k / 14);
      }
      for (let i = 0; i < 46; i++) {
        const [x, y, nx, ny] = tour(h(i) * P);
        const o = 4 + h(i + 6) * 16;
        pose(x + nx * o, y + ny * o, i % 5 ? BLANC : [200, 170, 255], onde(t, 1.5 + h(i) * 3, i) ** 2);
      }
    },
  },
  /* ---------- Légendaires ---------- */
  foudre: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      let col = mix([24, 28, 74], [84, 94, 160], 0.5 + 0.5 * Math.sin(p / 9 + Math.sin(d * 0.9 + t * 0.5) * 1.2 + t * 0.4));
      if (Math.sin(p / 4 + t * 0.3) * Math.sin(d * 0.8) > 0.5) col = [128, 138, 200];
      if (d === 0 || d === 9) col = [10, 12, 40];
      for (let k = 0; k < 2; k++) {
        const a = mod(t * 230 + (k * P) / 2 - p, P);
        if (a >= 80) continue;
        const z = 4.5 + Math.round(3 * Math.sin(p * 1.3) + (h(p + k) > 0.5 ? 1 : -1));
        if (Math.abs(d - z) < 0.9) col = mix(BLANC, [120, 150, 255], a / 80);
        else if (Math.abs(d - z) < 2 && a < 36) col = mix(col, [180, 206, 255], 0.65);
      }
      if (mod(t, 2.6) < 0.09) col = mix(col, BLANC, 0.6);
      return col;
    },
    plus: (pose, t) => {
      const coup = mod(t, 2.6) < 0.09;
      lueur(pose, [170, 200, 255], coup ? 0.6 : 0.14);
      for (let i = 0; i < P / 5; i++) {
        const [x, y, nx, ny] = tour(i * 5);
        const r = (2 + 2.2 * onde(t, 0.4, i * 3.5)) * (ny === -1 ? 1.2 : 0.9);
        disque(pose, x + nx * (r - 0.5), y + ny * (r - 0.5), Math.round(r), (dx, dy) => (dy < 0 ? [120, 132, 196] : [52, 60, 120]), 0.95);
      }
      for (let i = 0; i < 60; i++) {
        const vie = mod(t * (0.9 + h(i) * 0.5) + h(i + 3), 1);
        const x = -16 + h(i + 7) * (W + 32);
        if (x > -1 && x < W) continue;
        for (let k = 0; k < 3; k++) pose(x - k * 0.5, -10 + vie * (H + 30) + k, [150, 184, 255], 0.55);
      }
      for (const [cx, cy] of COINS) disque(pose, cx, cy, 5, (x, y, e) => (e > 4.2 ? [30, 34, 60] : x + y < -3 ? BLANC : mix([120, 132, 160], [214, 222, 240], 0.5 - (x + y) / 10)));
      // Un arc saute d'une sphère à la suivante, le long d'un côté, dehors.
      const arc = Math.floor(t * 3) % 6;
      if (arc < 4) {
        const depart = [0, W, W + H, 2 * W + H][arc]!;
        const long = arc % 2 ? H : W;
        for (let k = 0; k <= long; k++) {
          const [x, y, nx, ny] = tour(depart + k);
          const z = 4 + 3 * Math.sin((k / long) * Math.PI) + Math.round(Math.sin(k * 1.9 + Math.floor(t * 20)) * 2);
          pose(x + nx * z, y + ny * z, BLANC);
          pose(x + nx * (z + 1), y + ny * (z + 1), [140, 170, 255], 0.6);
        }
      }
      const fx = W / 2;
      for (const [dx, dy, r] of [[-7, -9, 5], [0, -12, 7], [8, -9, 5], [-3, -7, 5], [4, -7, 5]] as const) disque(pose, fx + dx, dy, r, (x, y) => (y < -1 ? (coup ? BLANC : [150, 160, 214]) : [70, 78, 140]));
      dessin(pose, ECLAIR, coup ? BLANC : mix([255, 214, 60], [255, 250, 190], onde(t, 9)), fx - 2, -6);
      for (let k = 0; k < 2; k++) {
        const [x, y, nx, ny] = tour(t * 230 + (k * P) / 2);
        for (let i = 1; i < 11; i++) pose(x + nx * i + (ny ? Math.round(Math.sin(i * 2 + t * 30) * 2) : 0), y + ny * i + (nx ? Math.round(Math.sin(i * 2 + t * 30) * 2) : 0), mix(BLANC, [140, 170, 255], i / 11), 1 - i / 12);
      }
    },
  },
  "arc-en-ciel": {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 9) return [40, 20, 70];
      let col = tsl((d - 1) * 42 + Math.sin(p / 14 - t * 2) * 30 - t * 40, 0.95, 0.58 + 0.1 * Math.sin(p / 6 - t * 3));
      const s = h(p * 7 + d * 13);
      if (s > 0.95) col = mix(col, BLANC, Math.max(0, Math.sin(t * 3 + s * 80)));
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, tsl(t * 50, 0.9, 0.6), 0.22);
      const nuage = (cx: number, cy: number, s = 1): void => {
        for (const [dx, dy, r] of [[-4, 1, 3], [0, -1, 4], [4, 1, 3], [-1, 2, 3], [2, 2, 3]] as const) disque(pose, cx + dx * s, cy + dy * s, Math.round(r * s), (x, y) => (y < 0 ? BLANC : [214, 226, 246]));
      };
      // L'arche du sommet : sept bandes, un nuage à chaque pied.
      const fx = W / 2;
      for (let a = 0; a <= 40; a++) {
        const an = Math.PI + (a / 40) * Math.PI;
        for (let b = 0; b < 6; b++) pose(fx + Math.cos(an) * (8 + b), -3 + Math.sin(an) * (8 + b), tsl(b * 50 + t * 30, 0.95, 0.6));
      }
      nuage(fx - 11, -3, 0.8);
      nuage(fx + 11, -3, 0.8);
      for (const [cx, cy] of COINS) nuage(cx, cy + Math.round(Math.sin(t * 1.3 + cx)), 1);
      for (let i = 0; i < 44; i++) {
        const vie = mod(t * (0.14 + h(i) * 0.2) + h(i + 9), 1);
        const x = -14 + h(i + 3) * (W + 28) + Math.sin(t + i) * 3;
        const y = H + 12 - vie * (H + 28);
        if (x > 2 && x < W - 3 && y > 2 && y < H - 3) continue;
        const col = tsl(i * 47, 0.95, 0.66);
        const a = Math.sin(vie * Math.PI);
        pose(x, y, mix(col, BLANC, 0.5), a);
        if (i % 3 === 0) for (const [ax, ay] of CROIX) pose(x + ax, y + ay, col, a * 0.7);
      }
    },
  },
  glitch: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      const pas = Math.floor(t * PAS_DU_GLITCH);
      const g = h(Math.floor(p / 10) * 3 + pas);
      let col: Rvb = d < 3 ? [0, 229, 255] : d < 5 ? [240, 244, 255] : d < 8 ? [255, 0, 90] : [20, 20, 34];
      if (d === 0) col = [10, 10, 20];
      if (g > 0.78) col = d < 5 ? [255, 0, 90] : [0, 229, 255];
      if (g < 0.1) col = [10, 10, 20];
      if (g > 0.93) col = h(x * 3 + y * 7 + pas) > 0.5 ? BLANC : [10, 10, 20];
      if ((p + pas) % 4 === 0) col = mul(col, 0.62);
      return col;
    },
    plus: (pose, t) => {
      const pas = Math.floor(t * PAS_DU_GLITCH);
      // L'image de la carte se décale par bandes, en rouge et en cyan, et une ligne de balayage la traverse.
      for (let i = 0; i < 5; i++) {
        const g = h(i * 11 + pas);
        if (g < 0.55) continue;
        const y = 10 + Math.floor(h(i + pas * 3) * (H - 20));
        for (let x = 10; x < W - 10; x++) {
          pose(x, y, [255, 0, 90], 0.35);
          pose(x, y + 1, [0, 229, 255], 0.35);
        }
      }
      const ligne = 10 + mod(t * 40, H - 20);
      for (let x = 10; x < W - 10; x++) pose(x, ligne, BLANC, 0.22);
      for (let i = 0; i < 12; i++) {
        const g = h(i * 5 + pas);
        if (g < 0.5) continue;
        const y = Math.floor(h(i + pas * 3) * H);
        const l = 4 + Math.floor(g * 14);
        const dec = Math.round((g - 0.75) * 16);
        for (let k = 0; k < l; k++) {
          pose(-2 - k + dec, y, [255, 0, 90], 0.9);
          pose(W + 1 + k + dec, y + 1, [0, 229, 255], 0.9);
        }
      }
      // Le panneau du sommet : un triangle d'alerte qui saute, en trois couleurs décalées.
      const fx = W / 2;
      const saut = h(pas) > 0.7 ? Math.round((h(pas + 1) - 0.5) * 6) : 0;
      for (const [dx, col, a] of [[-1, [0, 229, 255], 0.8], [1, [255, 0, 90], 0.8], [0, [240, 244, 255], 1]] as [number, Rvb, number][]) {
        for (let y = 0; y < 14; y++) {
          const w = Math.round(y * 0.6);
          for (let x = -w; x <= w; x++) if (Math.abs(x) >= w - 1 || y >= 12) pose(fx + x + dx * 2 + saut, -17 + y, col, a);
        }
      }
      for (let y = 0; y < 5; y++) pose(fx + saut, -11 + y, [255, 230, 80]);
      pose(fx + saut, -5, [255, 230, 80]);
      for (const [cx, cy] of COINS) {
        const d = h(cx + pas) > 0.6 ? 2 : 1;
        for (const [dx, col] of [[-d, [0, 229, 255]], [d, [255, 0, 90]], [0, [240, 244, 255]]] as [number, Rvb][]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (Math.max(Math.abs(x), Math.abs(y)) === 4 || (x + y) % 3 === 0) pose(cx + x + dx, cy + y, col, dx ? 0.7 : 1);
      }
    },
  },
  plasma: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      const v = Math.sin(x / 8 + t * 2) + Math.sin(y / 11 - t * 1.6) + Math.sin((x + y) / 13 + t);
      if (d === 0 || d === 9) return mul(tsl(280 + 60 * v, 0.9, 0.3), 1);
      const filet = Math.abs(d - 4.5 - 3 * Math.sin(p / 7 + t * 3)) < 0.8;
      return filet ? mix(tsl(280 + 60 * v, 0.95, 0.6), BLANC, 0.75) : tsl(280 + 60 * v, 0.95, (d === 1 ? 0.7 : 0.52) + 0.1 * Math.sin(v * 3));
    },
    plus: (pose, t) => {
      lueur(pose, mix([255, 43, 214], [59, 139, 255], onde(t, 1.7)), 0.26, (x, y) => 0.7 + 0.3 * Math.sin(t * 3 + (x - y) * 0.12));
      const orbe = (cx: number, cy: number, r: number, ph: number): void => {
        disque(pose, cx, cy, r, (x, y, e) => {
          const v = Math.sin(x * 0.9 + t * 3 + ph) + Math.sin(y * 0.8 - t * 2.2);
          return e > r - 0.9 ? [255, 190, 250] : e < 1.6 ? BLANC : tsl(285 + 50 * v, 0.95, 0.55 - e / (r * 5));
        });
        for (let a = 0; a < 5; a++) {
          const an = a * 1.26 + Math.floor(t * 9 + ph) * 0.9;
          for (let k = 2; k < r - 1; k++) pose(cx + Math.cos(an) * k + Math.sin(k * 2 + t * 20) * 0.7, cy + Math.sin(an) * k, BLANC, 0.85);
        }
      };
      orbe(W / 2, -11, 9, 0);
      for (const [cx, cy] of COINS) orbe(cx, cy, 5, cx);
      // Des filaments ondulent tout autour du cadre.
      for (let b = 0; b < 2; b++) for (let p = 0; p < P; p += 1) {
        const [x, y, nx, ny] = tour(p);
        const o = 4 + 3 * Math.sin(p / 9 + t * (b ? 2.6 : -2) + b * 2);
        pose(x + nx * o, y + ny * o, b ? [255, 150, 240] : [130, 190, 255], 0.75);
      }
      for (let i = 0; i < 36; i++) {
        const [x, y, nx, ny] = tour(h(i) * P + t * 30 * (i % 2 ? 1 : -1));
        const o = 8 + 6 * onde(t, 3, i);
        pose(x + nx * o, y + ny * o, i % 2 ? [255, 190, 250] : [170, 214, 255], onde(t, 4, i * 2));
      }
    },
  },
  soleil: {
    epais: 10,
    px: (x, y, d, p, c, t) => {
      if (d === 0 || d === 9) return [84, 52, 4];
      let col = r10(mix([150, 96, 8], [255, 232, 140], onde(t, -1.2, p / 10 + d * 0.6)), d);
      const s = Math.sin(p / 4) * 3;
      if (Math.abs(d - 4.5 - s) < 0.8) col = [255, 250, 214];
      else if (Math.abs(d - 4.5 + s) < 0.8) col = [120, 74, 4];
      if ((d === 1 || d === 8) && p % 3 === 0) col = [255, 246, 200];
      const lp = (p % 32) - 16;
      const e = Math.hypot(lp, d - 4.5);
      if (e < 3.2) {
        const g: Rvb = de([[224, 36, 60], [40, 110, 255], [30, 200, 110]] as Rvb[], p / 32);
        col = e > 2.4 ? [84, 52, 4] : lp + d - 4.5 < -1.5 ? mix(g, BLANC, 0.6 + 0.4 * onde(t, 2, p)) : g;
      }
      return col;
    },
    plus: (pose, t) => {
      lueur(pose, [255, 214, 100], 0.26, (x, y) => 0.75 + 0.25 * Math.sin(t * 1.4 + (x + y) * 0.08));
      for (let i = 0; i < 64; i++) {
        const [x, y, nx, ny] = tour(i * 8 + 4);
        const l = (i % 2 ? 6 : 12) + 4 * onde(t, 2, i * 0.55);
        for (let k = 1; k <= l; k++) {
          const w = k < l * 0.3 ? 1 : 0;
          for (let e = -w; e <= w; e++) pose(x + nx * k + (ny ? e : 0), y + ny * k + (nx ? e : 0), mix([255, 250, 214], [255, 180, 40], k / l), 1 - k / (l + 3));
        }
      }
      for (const [cx, cy] of COINS) {
        for (let a = 0; a < 8; a++) {
          const an = (a * Math.PI) / 4;
          for (let k = 3; k <= 8; k++) for (const e of [-1, 0, 1]) if (Math.abs(e) < (k < 7 ? 2 : 1)) pose(cx + Math.cos(an) * k - Math.sin(an) * e, cy + Math.sin(an) * k + Math.cos(an) * e, e ? [200, 140, 20] : [255, 236, 150]);
        }
        disque(pose, cx, cy, 4, (x, y, e) => (e > 3.2 ? [84, 52, 4] : x + y < -2 ? [255, 252, 230] : [226, 171, 44]));
        const g = Math.round(2 + 4 * onde(t, 2.4, cx * 0.3 + cy * 0.1) ** 3);
        for (let k = 0; k <= g; k++) for (const [ax, ay] of CROIX) pose(cx + ax * k - 2, cy + ay * k - 2, BLANC, 1 - k / (g + 1));
      }
      const fx = W / 2;
      const fy = -11;
      for (let a = 0; a < 14; a++) {
        const an = (a * Math.PI) / 7 + t * 0.3;
        for (let k = 10; k <= (a % 2 ? 14 : 17); k++) for (const e of [-1, 0, 1]) if (Math.abs(e) < (k < 13 ? 2 : 1)) pose(fx + Math.cos(an) * k - Math.sin(an) * e, fy + Math.sin(an) * k + Math.cos(an) * e, mix([255, 236, 150], [255, 170, 30], (k - 10) / 7));
      }
      disque(pose, fx, fy, 9, (x, y, e) => (e > 8.2 ? [150, 96, 8] : mix([255, 254, 236], [255, 196, 50], e / 9 + 0.12 * Math.sin(t * 2 + x * 0.5))));
      disque(pose, fx, H + 9, 5, (x, y, e) => (Math.hypot(x - 2.5, y - 1) < 4.4 ? null : e > 4.2 ? [120, 130, 150] : mix([244, 248, 255], [170, 184, 210], (x + 5) / 10)));
      poussieres(pose, t, 50, [255, 240, 170], 0.14);
    },
  },
};

/** L'instant du cadre figé (en pause, au repos, sur une image fixe) : flammes, gouttes et rayons y sont en place. */
export const INSTANT_DU_CADRE_FIGE = 2.4;

const CONNUS: ReadonlySet<string> = new Set(CADRES_ANIMES);

/** Le cadre de ce nom, ou `null` : un nom inconnu est ignoré. */
export const cadreAnime = (id: string | null | undefined): CadreDeCarte | null => (id && CONNUS.has(id) ? (id as CadreDeCarte) : null);

/** L'épaisseur du cadre, en cases de toile : 7, ou 10 pour un cadre très détaillé. */
export const epaisseurDuCadre = (id: CadreDeCarte): 7 | 10 => DESSINS[id].epais;

/**
 * Peint le cadre à l'instant `t` (en secondes) dans `tampon`, une image de `LARGEUR_DU_CADRE` × `HAUTEUR_DU_CADRE` en
 * rouge, vert, bleu, opacité. Le tampon est vidé d'abord : l'intérieur de la carte reste transparent, sauf la lumière du
 * cadre sur ses bords.
 */
export function peindreLeCadre(id: CadreDeCarte, t: number, tampon: Uint8ClampedArray): void {
  const { epais, px, plus } = DESSINS[id];
  const M = MARGE_DU_CADRE;
  tampon.fill(0);
  const pose: Pose = (fx, fy, c, a = 1) => {
    const x = Math.round(fx) + M;
    const y = Math.round(fy) + M;
    if (x < 0 || y < 0 || x >= LARGEUR_DU_CADRE || y >= HAUTEUR_DU_CADRE || !(a > 0)) return;
    const i = (y * LARGEUR_DU_CADRE + x) * 4;
    const k = Math.min(1, a);
    const b = tampon[i + 3]! / 255;
    if (!b) {
      tampon[i] = c[0];
      tampon[i + 1] = c[1];
      tampon[i + 2] = c[2];
      tampon[i + 3] = 255 * k;
      return;
    }
    const s = k + b * (1 - k);
    tampon[i] = (c[0] * k + tampon[i]! * b * (1 - k)) / s;
    tampon[i + 1] = (c[1] * k + tampon[i + 1]! * b * (1 - k)) / s;
    tampon[i + 2] = (c[2] * k + tampon[i + 2]! * b * (1 - k)) / s;
    tampon[i + 3] = 255 * s;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.min(x, W - 1 - x);
      const dy = Math.min(y, H - 1 - y);
      const d = Math.min(dx, dy);
      if (d >= epais || dx + dy < 3) continue;
      const cote = d === y ? 0 : d === W - 1 - x ? 1 : d === H - 1 - y ? 2 : 3;
      const p = cote === 0 ? x : cote === 1 ? W + y : cote === 2 ? W + H + (W - 1 - x) : 2 * W + H + (H - 1 - y);
      pose(x, y, px(x, y, d, p, cote, t));
    }
  }
  plus?.(pose, t);
}
