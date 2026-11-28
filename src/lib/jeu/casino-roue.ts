/**
 * La roue du charron du casino de « Mon Gaulois » (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le
 * 22 novembre 2026, portée telle quelle) : sa peinture point par point, où la lumière reste fixe pendant que les cases tournent
 * dessous, et le mouvement de la roue et de la bille vers le numéro que le serveur a déjà tiré.
 *
 * Rien ici ne décide d'un résultat : `mouvementDeLaRoue` reçoit la case où la bille doit finir et l'y amène, toujours. Les
 * règles et les chances sont celles du serveur (`src/lib/village/casino/roue.ts`, contrat `contrat-casino.ts`) : les
 * numéros rouges et l'ordre des cases autour de la roue en viennent.
 */
import { ORDRE_DE_LA_ROUE, ROUGES } from "../village/casino/roue";
import { BAYER, ENCRE, IVOIRE, NOIR, OR, BORDEAUX, RUBIS, SAPHIR, Toile, borne, ecrisSur, largeurDuTexte, lisse, mel, petitsSur, ton, type Rampe, type Rvb } from "./casino-toile";

export { ORDRE_DE_LA_ROUE, ROUGES };
/** Le nombre de cases. */
export const CASES = 36;
const K = CASES / (Math.PI * 2);

/** La place d'un numéro autour de la roue (0 à 35), -1 s'il n'y est pas. */
export const caseDuNumero = (n: number): number => ORDRE_DE_LA_ROUE.indexOf(n);

/** L'angle (en radians) où la bille se pose, par rapport à la roue, au milieu de la case `k`. */
export const angleDeLaCase = (k: number): number => (k + 0.5) / K;

/**
 * Le mouvement d'un tour : la roue prend son élan et ralentit, la bille court sur la piste en sens contraire, quitte la
 * piste et descend vers sa case, tinte contre les cloisons, tombe, puis la roue s'arrête doucement. Tout est écrit d'avance
 * pour finir sur la case `k`, celle du numéro tiré.
 *
 * `rot0` : l'angle de la roue au départ. Rend la durée des phases et la position à chaque instant `t` (en secondes).
 */
export interface PositionDeLaRoue {
  /** L'angle de la roue. */
  rot: number;
  /** L'angle de la bille (absolu) et sa distance au centre (1 le bord de la roue). */
  billeA: number;
  billeR: number;
  /** Où en est la bille : sur la piste, qui descend, qui saute de case en case, posée. */
  phase: "piste" | "descente" | "saut" | "posee";
  /** Pendant la descente, de 0 à 1. */
  u: number;
  /** Le rebond en cours (0, 1, 2…), -1 avant le premier, le nombre de rebonds une fois posée. */
  saut: number;
}
export interface MouvementDeLaRoue {
  /** La bille quitte la piste. */
  TA: number;
  /** La bille est posée dans sa case. */
  pose: number;
  /** La roue a fini de ralentir (la bille est posée depuis longtemps). */
  fin: number;
  /** La vitesse de la bille sur la piste à l'instant `t` (pour le roulement). */
  vitesseDeLaBille(t: number): number;
  /** L'angle de la bille par rapport à la roue pendant la descente (pour les cloisons). */
  position(t: number): PositionDeLaRoue;
}

/**
 * Un lancer du croupier (maquette du 28 novembre 2026 : « moins répétitif ») : l'élan de la roue et de la bille, le temps sur
 * la piste, la descente, les rebonds de case en case, et la fin. Tout est tiré au hasard avant le tour, sans jamais regarder
 * les jetons posés : la bille finit toujours dans la case du numéro déjà tiré par le serveur, et ses rebonds sont comptés à
 * rebours depuis cette case.
 */
export interface LancerDeLaRoue {
  /** Son nom, que le croupier dit (« Lancer fort »). Vide : le lancer de toujours. */
  nom: string;
  /** Le temps sur la piste, en secondes. */
  TA: number;
  /** L'élan de la roue et celui de la bille. */
  W0: number;
  B0: number;
  /**
   * Ce que la bille parcourt en descendant, par rapport à la roue (en radians), et la forme de son ralenti. Avec `descente`
   * (en secondes), ce chemin se règle pour que la descente dure ce temps-là, sans à-coup à la sortie de la piste.
   */
  DELTA: number;
  descente?: number;
  KP: number;
  /** Les rebonds : combien de cases (1 à 3), en avant (1) ou en arrière (-1), leur durée et leur hauteur. */
  sauts: readonly { cases: number; sens: 1 | -1; d: number; h: number }[];
  /** Le temps que la roue garde son élan, bille posée, puis le temps qu'elle met à s'arrêter. */
  apres: number;
  D: number;
}
/** Le lancer d'avant le 28 novembre 2026 : le même à chaque tour. */
export const LANCER_DE_TOUJOURS: LancerDeLaRoue = { nom: "", TA: 3.2, W0: 2.4, B0: 10, DELTA: 3.2, KP: 2.4, sauts: [], apres: 0.9, D: 2.4 };

/** Les cinq façons de lancer, en fourchettes : [plus petit, plus grand]. */
const FACONS: readonly { nom: string; TA: [number, number]; W0: [number, number]; B0: [number, number]; descente: [number, number]; KP: [number, number]; sauts: [number, number] }[] = [
  { nom: "Lancer doux", TA: [2.2, 2.6], W0: [1.8, 2.2], B0: [8, 9], descente: [1.2, 1.5], KP: [2.0, 2.3], sauts: [0, 1] },
  { nom: "Lancer fort", TA: [3.4, 3.9], W0: [2.8, 3.2], B0: [12, 13], descente: [1.6, 2.0], KP: [2.6, 2.9], sauts: [2, 3] },
  { nom: "Longue piste", TA: [4.0, 4.6], W0: [2.2, 2.6], B0: [10, 11], descente: [1.4, 1.7], KP: [2.2, 2.5], sauts: [0, 1] },
  { nom: "Bille sauteuse", TA: [2.8, 3.2], W0: [2.4, 2.8], B0: [10, 11], descente: [1.3, 1.6], KP: [2.4, 2.6], sauts: [3, 4] },
  { nom: "Coup de poignet", TA: [2.6, 3.0], W0: [2.6, 3.0], B0: [11, 12], descente: [1.3, 1.6], KP: [2.2, 2.5], sauts: [1, 2] },
];
/** Le nombre de façons de lancer. */
export const FACONS_DE_LANCER = FACONS.length;

/**
 * Tire un lancer : une des cinq façons (jamais `avant`, celle du tour d'avant), ou le tour rapide (deux secondes environ).
 * `hasard` rend un nombre de 0 à 1 (Math.random par défaut). Rend le lancer et le rang de sa façon (-1 pour le tour rapide).
 */
export function tirerUnLancer(rapide: boolean, avant = -1, hasard: () => number = Math.random): { lancer: LancerDeLaRoue; rang: number } {
  const entre = ([a, b]: [number, number]): number => a + hasard() * (b - a);
  const entier = ([a, b]: [number, number]): number => a + Math.min(b - a, Math.floor(hasard() * (b - a + 1)));
  const sauts = (n: number): LancerDeLaRoue["sauts"] =>
    Array.from({ length: n }, () => {
      const cases = entier([1, 3]);
      return { cases, sens: hasard() < 0.25 ? -1 : 1, d: 0.22 + 0.05 * cases + hasard() * 0.08, h: 0.035 + 0.012 * cases + hasard() * 0.01 } as const;
    });
  if (rapide) return { lancer: { nom: "Tour rapide", TA: 0.75, W0: 2.2, B0: 9, DELTA: 1.6, descente: 0.4, KP: 2, sauts: [], apres: 0.15, D: 0.9 }, rang: -1 };
  let rang = Math.min(FACONS.length - 1, Math.floor(hasard() * FACONS.length));
  if (rang === avant) rang = (rang + 1 + Math.min(FACONS.length - 2, Math.floor(hasard() * (FACONS.length - 1)))) % FACONS.length;
  const f = FACONS[rang]!;
  return { lancer: { nom: f.nom, TA: entre(f.TA), W0: entre(f.W0), B0: entre(f.B0), DELTA: 0, descente: entre(f.descente), KP: entre(f.KP), sauts: sauts(entier(f.sauts)), apres: 0.5 + hasard() * 0.5, D: 1.8 + hasard() * 0.6 }, rang };
}

/**
 * `lancer` : la façon de lancer (le lancer de toujours par défaut) ; `sens` : 1, la roue tourne dans le sens des aiguilles
 * d'une montre et la bille à l'inverse, -1 tout à l'envers (le croupier change de sens à chaque tour).
 */
export function mouvementDeLaRoue(k: number, rot0: number, lancer: LancerDeLaRoue = LANCER_DE_TOUJOURS, sens: 1 | -1 = 1): MouvementDeLaRoue {
  const { TA, W0, B0, KP, apres, D } = lancer;
  const TW = 2.6;
  const DERIVE = 0.32;
  const TB = 1.4;
  const B1 = 1.1;
  const rotA = (t: number): number => rot0 + sens * (W0 * TW * (1 - Math.exp(-t / TW)) + DERIVE * t);
  const vW = (t: number): number => W0 * Math.exp(-t / TW) + DERIVE;
  const intB = (t: number): number => -sens * (B0 * TB * (1 - Math.exp(-t / TB)) + B1 * t);
  const vB = (t: number): number => -(B0 * Math.exp(-t / TB) + B1);
  const v0 = Math.abs(vB(TA) - vW(TA));
  const DELTA = lancer.descente ? (lancer.descente * v0) / KP : lancer.DELTA;
  const dur = (KP * DELTA) / v0;
  const phiFin = angleDeLaCase(k);
  // Les rebonds, à rebours depuis la case du numéro : la bille touche d'abord la case `phiPose`, puis saute jusqu'à la sienne.
  const PAS = (Math.PI * 2) / CASES;
  const sauts: { de: number; a: number; t0: number; d: number; h: number }[] = [];
  let a = phiFin;
  for (let i = lancer.sauts.length - 1; i >= 0; i--) {
    const s = lancer.sauts[i]!;
    const de = a + sens * s.sens * s.cases * PAS;
    sauts.unshift({ de, a, t0: 0, d: s.d, h: s.h });
    a = de;
  }
  const phiPose = a;
  let t = TA + dur;
  for (const s of sauts) {
    s.t0 = t;
    t += s.d;
  }
  const pose = t;
  const b0 = rotA(TA) + phiPose + sens * DELTA - intB(TA);
  const T1 = pose + apres;
  const rotDe = (t: number): number => {
    if (t <= T1) return rotA(t);
    const e = borne((t - T1) / D);
    return rotA(T1) + (sens * vW(T1) * D * (1 - Math.pow(1 - e, 3))) / 3;
  };
  return {
    TA,
    pose,
    fin: T1 + D,
    vitesseDeLaBille: (t) => -vB(t),
    position(t) {
      const rot = rotDe(t);
      if (t < TA) return { rot, billeA: b0 + intB(t), billeR: 0.865 - 0.004 * Math.sin(t * 9), phase: "piste", u: 0, saut: -1 };
      if (t < TA + dur) {
        const u = (t - TA) / dur;
        const phi = phiPose + sens * DELTA * Math.pow(1 - u, KP);
        const billeR = mel(0.865, 0.515, lisse(0.02, 0.5, u)) + (u > 0.42 ? 0.04 * Math.abs(Math.sin((u - 0.42) * Math.PI * 4.2)) * (1 - u) : 0);
        return { rot, billeA: rot + phi, billeR, phase: "descente", u, saut: -1 };
      }
      for (let i = 0; i < sauts.length; i++) {
        const s = sauts[i]!;
        if (t < s.t0 + s.d) {
          const q = (t - s.t0) / s.d;
          return { rot, billeA: rot + mel(s.de, s.a, lisse(0, 1, q)), billeR: 0.515 + s.h * Math.sin(Math.PI * q), phase: "saut", u: 1, saut: i };
        }
      }
      const q = t - pose;
      return { rot, billeA: rot + phiFin + 0.012 * Math.sin(q * 18) * Math.exp(-q * 7), billeR: 0.515, phase: "posee", u: 1, saut: sauts.length };
    },
  };
}
/** La case qu'occupe la bille quand elle est à l'angle `billeA` et la roue à `rot` (0 à 35). */
export function caseSousLaBille(billeA: number, rot: number): number {
  let s = (billeA - rot) * K;
  s -= Math.floor(s / CASES) * CASES;
  return Math.floor(s);
}
/** La pose sans mouvement (pause, mouvement réduit) : la case `k` en haut, la bille dedans. */
export function poseImmobile(k: number): { rot: number; billeA: number; billeR: number } {
  return { rot: -Math.PI / 2 - angleDeLaCase(k), billeA: -Math.PI / 2, billeR: 0.515 };
}

const paquet = (c: Rvb): number => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
const rang = (rp: Rampe, v: number, x: number, y: number, tr = 0.8): number => {
  const i = Math.round(borne(v) * (rp.n - 1) + BAYER[(y & 3) * 4 + (x & 3)]! * tr);
  return i < 0 ? 0 : i >= rp.n ? rp.n - 1 : i;
};
const P_OR = OR.c.map(paquet);
const P_RUB = RUBIS.c.map(paquet);
const P_SAP = SAPHIR.c.map(paquet);
const P_BOR = BORDEAUX.c.map(paquet);
/** La couleur de chaque case autour de la roue : vrai pour un rouge. */
const ROUGE_DE_LA_CASE: readonly boolean[] = ORDRE_DE_LA_ROUE.map((n) => ROUGES.has(n));

/**
 * La roue peinte en points, de rayon `R` : un tableau de points (`pts`, quatre octets par point, à poser tel quel dans une
 * image de la toile), les numéros droits à l'ivoire (`chiffres`) et la bille. `peindre` ne refait que les points qui tournent.
 */
export class RoueEnPoints {
  readonly R: number;
  /** Le côté de l'image, en points. */
  readonly S: number;
  readonly pts: Uint32Array;
  /** Les numéros, dans l'ordre de la roue : l'écriture du kit sur une grande roue, de petits chiffres sur un téléphone. */
  readonly chiffres: Toile[];
  readonly bille: Toile;
  private readonly zone: Uint8Array;
  private readonly angQ: Float32Array;
  private readonly niv: Uint8Array;
  private readonly nivOr: Uint8Array;
  private readonly epais: Float32Array;
  private readonly tournants: Uint32Array;

  constructor(R: number) {
    this.R = R;
    const S = (this.S = 2 * R + 4);
    this.pts = new Uint32Array(S * S);
    this.zone = new Uint8Array(S * S);
    this.angQ = new Float32Array(S * S);
    this.niv = new Uint8Array(S * S);
    this.nivOr = new Uint8Array(S * S);
    this.epais = new Float32Array(S * S);
    const liste: number[] = [];
    const c = S / 2;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const r = Math.hypot(dx, dy) / R;
        const a = Math.atan2(dy, dx);
        const lum = 0.5 + 0.5 * Math.cos(a + 2.3);
        const mt = Math.pow(0.5 + 0.5 * Math.cos(2 * a + 1.3), 1.6);
        if (r > 1) continue;
        if (r > 0.992) this.pts[i] = paquet(ENCRE);
        else if (r > 0.93) this.pts[i] = P_OR[rang(OR, 0.3 + 0.56 * mt + (r > 0.975 ? -0.16 : r < 0.945 ? -0.2 : 0.08), x, y)]!;
        else if (r > 0.805) this.pts[i] = paquet(NOIR.t(0.34 + 0.5 * Math.pow(0.5 + 0.5 * Math.cos(a + 2.2), 5) + 0.16 * Math.pow(0.5 + 0.5 * Math.cos(a - 0.9), 8) - (r - 0.805) * 1.2, x, y, 1));
        else if (r > 0.785) this.pts[i] = P_OR[rang(OR, 0.46 + lum * 0.4, x, y)]!;
        else if (r > 0.44) {
          const z = r > 0.6 ? 1 : r > 0.585 ? 3 : 2;
          this.zone[i] = z;
          this.angQ[i] = a * K;
          this.niv[i] = rang(RUBIS, z === 2 ? 0.26 + lum * 0.16 + (r - 0.44) * 0.5 : 0.42 + lum * 0.2, x, y);
          this.nivOr[i] = rang(OR, 0.5 + lum * 0.38, x, y, 0.5);
          liste.push(i);
        } else if (r > 0.4) this.pts[i] = P_OR[rang(OR, 0.32 + 0.6 * Math.pow(0.5 + 0.5 * Math.cos(2 * a + 0.5), 2), x, y)]!;
        else if (r > 0.13) {
          this.zone[i] = 4;
          this.angQ[i] = a * K;
          this.niv[i] = rang(BORDEAUX, 0.22 + lum * 0.26 + (0.4 - r) * 0.3, x, y, 1);
          this.nivOr[i] = rang(OR, 0.44 + lum * 0.44, x, y, 0.6);
          this.epais[i] = 0.045 + 0.016 / r;
          liste.push(i);
        } else this.pts[i] = P_OR[rang(OR, 0.92 - r * 3.4 + lum * 0.24 - (dy > 0 ? 0.16 : 0), x, y)]!;
      }
    this.tournants = Uint32Array.from(liste);
    const grand = R >= 106;
    this.chiffres = ORDRE_DE_LA_ROUE.map((n) => {
      const s = String(n);
      const w = grand ? largeurDuTexte(s) : s.length * 4 - 1;
      const Tl = new Toile(w + 2, grand ? 9 : 7);
      if (grand) ecrisSur(Tl, s, 1, 1, ton(IVOIRE, 6), ENCRE);
      else {
        petitsSur(Tl, s, 1, 2, ENCRE);
        petitsSur(Tl, s, 1, 1, ton(IVOIRE, 6));
      }
      return Tl;
    });
    const br = Math.max(3, Math.round(R * 0.03));
    const b = new Toile(2 * br + 5, 2 * br + 5);
    const cx = br + 2;
    for (let y = -br - 1; y <= br + 1; y++)
      for (let x = -br - 1; x <= br + 1; x++) {
        const d = Math.hypot(x, y);
        if (d <= br + 0.3) b.p(cx + x, cx + y, IVOIRE.t(0.94 - ((x + y) / br) * 0.2, cx + x, cx + y, 0.5));
        else if (d <= br + 1.3) b.p(cx + x, cx + y, ENCRE);
      }
    for (const [x, y] of [
      [-1, -1],
      [-2, -1],
      [-1, -2],
    ] as const)
      b.p(cx + x, cx + y, ton(IVOIRE, 6));
    this.bille = b;
  }

  /**
   * Repeint les cases qui tournent pour la roue à l'angle `rot` ; la case `gagnant` (ou -1) s'éclaire de `eclat` tons (0 à 2),
   * et chaque case `k` de `lumieres[k]` tons de plus (les numéros d'un pari survolé, le tour de lumière d'un grand gain).
   */
  peindre(rot: number, gagnant = -1, eclat = 0, lumieres: ArrayLike<number> | null = null): void {
    const rq = rot * K;
    const { tournants, zone, angQ, niv, nivOr, epais, pts } = this;
    for (let j = 0; j < tournants.length; j++) {
      const i = tournants[j]!;
      const z = zone[i];
      let s = angQ[i]! - rq;
      s -= Math.floor(s / CASES) * CASES;
      const n = s | 0;
      const f = s - n;
      if (z === 4) {
        const t = (s / 4.5) % 1;
        pts[i] = Math.abs(t - 0.5) < epais[i]! ? P_OR[nivOr[i]!]! : P_BOR[niv[i]!]!;
        continue;
      }
      if (z === 3 || f < 0.07 || f > 0.93) {
        pts[i] = P_OR[nivOr[i]!]!;
        continue;
      }
      let l = niv[i]!;
      if (n === gagnant) l = Math.min(7, l + eclat);
      else if (lumieres && lumieres[n]) l = Math.min(7, l + Math.round(lumieres[n]!));
      pts[i] = (ROUGE_DE_LA_CASE[n] ? P_RUB : P_SAP)[l]!;
    }
  }

  /** Où poser le numéro de la case `k` (son coin haut gauche, en points), la roue étant à l'angle `rot`. */
  placeDuChiffre(k: number, rot: number): { x: number; y: number } {
    const c = this.S / 2;
    const rc = this.R * 0.69;
    const a = rot + angleDeLaCase(k);
    const t = this.chiffres[k]!;
    return { x: Math.round(c + Math.cos(a) * rc - t.w / 2), y: Math.round(c + Math.sin(a) * rc - t.h / 2) };
  }

  /** Où poser la bille (son coin haut gauche, en points). */
  placeDeLaBille(billeA: number, billeR: number): { x: number; y: number } {
    const c = this.S / 2;
    return { x: Math.round(c + Math.cos(billeA) * billeR * this.R - this.bille.w / 2), y: Math.round(c + Math.sin(billeA) * billeR * this.R - this.bille.h / 2) };
  }
}
