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
  /** Où en est la bille : sur la piste, qui descend, posée. */
  phase: "piste" | "descente" | "posee";
  /** Pendant la descente, de 0 à 1. */
  u: number;
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
export function mouvementDeLaRoue(k: number, rot0: number): MouvementDeLaRoue {
  const TA = 3.2;
  const W0 = 2.4;
  const TW = 2.6;
  const DERIVE = 0.32;
  const B0 = 10;
  const TB = 1.4;
  const B1 = 1.1;
  const DELTA = -3.2;
  const KP = 2.4;
  const rotA = (t: number): number => rot0 + W0 * TW * (1 - Math.exp(-t / TW)) + DERIVE * t;
  const vW = (t: number): number => W0 * Math.exp(-t / TW) + DERIVE;
  const intB = (t: number): number => -(B0 * TB * (1 - Math.exp(-t / TB)) + B1 * t);
  const vB = (t: number): number => -(B0 * Math.exp(-t / TB) + B1);
  const v0 = vB(TA) - vW(TA);
  const dur = (KP * DELTA) / v0;
  const phiFin = angleDeLaCase(k);
  const b0 = rotA(TA) + phiFin - DELTA - intB(TA);
  const T1 = TA + dur + 0.9;
  const D = 2.4;
  const rotDe = (t: number): number => {
    if (t <= T1) return rotA(t);
    const e = borne((t - T1) / D);
    return rotA(T1) + (vW(T1) * D * (1 - Math.pow(1 - e, 3))) / 3;
  };
  return {
    TA,
    pose: TA + dur,
    fin: T1 + D,
    vitesseDeLaBille: (t) => -vB(t),
    position(t) {
      const rot = rotDe(t);
      if (t < TA) return { rot, billeA: b0 + intB(t), billeR: 0.865 - 0.004 * Math.sin(t * 9), phase: "piste", u: 0 };
      if (t < TA + dur) {
        const u = (t - TA) / dur;
        const phi = phiFin - DELTA * Math.pow(1 - u, KP);
        const billeR = mel(0.865, 0.515, lisse(0.02, 0.5, u)) + (u > 0.42 ? 0.04 * Math.abs(Math.sin((u - 0.42) * Math.PI * 4.2)) * (1 - u) : 0);
        return { rot, billeA: rot + phi, billeR, phase: "descente", u };
      }
      return { rot, billeA: rot + phiFin, billeR: 0.515, phase: "posee", u: 1 };
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

  /** Repeint les cases qui tournent pour la roue à l'angle `rot` ; la case `gagnant` (ou -1) s'éclaire de `eclat` tons (0 à 2). */
  peindre(rot: number, gagnant = -1, eclat = 0): void {
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
