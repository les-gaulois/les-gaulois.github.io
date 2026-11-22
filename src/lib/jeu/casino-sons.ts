/**
 * Les sons du casino de « Mon Gaulois » (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre
 * 2026, portée telle quelle) : de la famille des boosters, feutrés et chauds, rien au-dessus de 7 400 Hz (un filtre doux
 * coupe tout le reste). Jeton de céramique posé, jetons ramassés, statère, refus, roue lancée, bille contre une cloison, bille
 * qui tombe, roulement, gain, grand gain (timbales et cor), rien cette fois, mise rendue, rendu partiel, entrée d'un salon.
 *
 * Un seul réglage pour toute la page : celui du jeu (`sons.ts`, le bouton de la barre). Le son ne s'ouvre qu'après un geste
 * du visiteur (`eveil`). Sans contexte audio (Node, navigateur qui refuse), chaque son ne fait rien.
 */
import { jouer, preparerLeSon, sonVoulu } from "./sons";

/** Le plafond des fréquences du casino : un filtre passe-bas, la brillance s'arrête là. */
export const COUPE_HAUTE = 7400;

let ac: AudioContext | null = null;
let bus: GainNode | null = null;
let bruit: AudioBuffer | null = null;

/** Ouvre le son du casino : seulement dans un geste du visiteur, et seulement s'il veut du son. */
export function eveil(): void {
  if (!sonVoulu()) return;
  try {
    if (!ac) {
      const ctx = preparerLeSon();
      if (!ctx) return;
      const comp = ctx.createDynamicsCompressor();
      const doux = ctx.createBiquadFilter();
      const salle = ctx.createConvolver();
      const mouille = ctx.createGain();
      const sortie = ctx.createGain();
      const n = ctx.sampleRate;
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      sortie.gain.value = 1.1;
      comp.connect(sortie).connect(ctx.destination);
      const b = ctx.createGain();
      b.gain.value = 0.7;
      doux.type = "lowpass";
      doux.frequency.value = COUPE_HAUTE;
      b.connect(doux).connect(comp);
      // La salle : une réverbération courte, faite d'un bruit qui s'éteint.
      const ir = ctx.createBuffer(2, Math.floor(n * 1.8), n);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let m = 0;
        for (let i = 0; i < d.length; i++) {
          m += (Math.random() * 2 - 1 - m) * 0.2;
          d[i] = m * Math.pow(1 - i / d.length, 3.2);
        }
      }
      salle.buffer = ir;
      mouille.gain.value = 0.3;
      b.connect(salle).connect(mouille).connect(comp);
      const br = ctx.createBuffer(1, n * 2, n);
      const d = br.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ac = ctx;
      bus = b;
      bruit = br;
    }
    if (ac.state === "suspended") void ac.resume().catch(() => undefined);
  } catch {
    // Le navigateur refuse le son : le casino reste muet.
  }
}

/** Le son est-il prêt et voulu ? */
const pret = (): boolean => sonVoulu() && ac !== null && bus !== null && ac.state === "running";

/** Une note : de `f0` à `f1` hertz, après `quand` secondes, pendant `duree`, au volume `vol`. */
export function ton(f0: number, f1: number, quand: number, duree: number, vol: number, type: OscillatorType = "sine", att = 0.005): void {
  if (!pret() || !ac || !bus) return;
  const t = ac.currentTime + quand;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + duree + 0.05);
}
/** Un souffle : un bruit filtré, de `f0` à `f1` hertz. */
export function souffle(quand: number, duree: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, att = 0.004): void {
  if (!pret() || !ac || !bus || !bruit) return;
  const t = ac.currentTime + quand;
  const s = ac.createBufferSource();
  const fl = ac.createBiquadFilter();
  const g = ac.createGain();
  s.buffer = bruit;
  s.loop = true;
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t);
  fl.frequency.exponentialRampToValueAtTime(f1, t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  s.connect(fl).connect(g).connect(bus);
  s.start(t, Math.random() * 1.5);
  s.stop(t + duree + 0.05);
}
/** Une peau frappée : une note qui tombe de `f * chute` à `f`. */
export function peau(quand: number, f: number, vol: number, dec: number, chute: number): void {
  if (!pret() || !ac || !bus) return;
  const t = ac.currentTime + quand;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.setValueAtTime(f * chute, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dec + 0.05);
}
/** Une timbale : la peau, sa quinte, son coup. */
export function timbale(quand: number, f: number, vol: number, dec = 1.1): void {
  peau(quand, f, vol, dec, 1.25);
  ton(f * 1.5, f * 1.5, quand, dec * 0.5, vol * 0.25, "triangle", 0.004);
  souffle(quand, 0.06, "lowpass", 700, 200, 0.7, vol * 0.4);
}
/** Le cor grave : dents de scie, un filtre qui s'ouvre comme un souffle dans le cuivre. */
export function cor(notes: readonly number[], quand: number, duree: number, vol: number): void {
  if (!pret() || !ac || !bus) return;
  const t = ac.currentTime + quand;
  for (const f of notes) {
    const fl = ac.createBiquadFilter();
    const g = ac.createGain();
    fl.type = "lowpass";
    fl.Q.value = 1.4;
    fl.frequency.setValueAtTime(240, t);
    fl.frequency.exponentialRampToValueAtTime(900 + f * 5, t + 0.13);
    fl.frequency.exponentialRampToValueAtTime(420 + f * 2.2, t + duree);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + Math.max(0.1, duree - 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    for (const d of [1, 1.005]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * d * 0.93, t);
      o.frequency.exponentialRampToValueAtTime(f * d, t + 0.09);
      o.connect(fl);
      o.start(t);
      o.stop(t + duree + 0.05);
    }
    fl.connect(g).connect(bus);
  }
}
/** Une nappe chaude : un accord tenu, l'attaque lente, sous un filtre doux. */
export function nappe(notes: readonly number[], quand: number, duree: number, vol: number, coupe = 1100): void {
  if (!pret() || !ac || !bus) return;
  const t = ac.currentTime + quand;
  const fl = ac.createBiquadFilter();
  const g = ac.createGain();
  fl.type = "lowpass";
  fl.Q.value = 0.7;
  fl.frequency.setValueAtTime(coupe * 0.4, t);
  fl.frequency.exponentialRampToValueAtTime(coupe, t + duree * 0.35);
  fl.frequency.exponentialRampToValueAtTime(coupe * 0.5, t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + duree * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  for (const f of notes)
    for (const d of [0.997, 1.003]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * d;
      o.connect(fl);
      o.start(t);
      o.stop(t + duree + 0.05);
      const s = ac.createOscillator();
      const gs = ac.createGain();
      s.type = "sine";
      s.frequency.value = f * d;
      gs.gain.value = 0.6;
      s.connect(gs).connect(g);
      s.start(t);
      s.stop(t + duree + 0.05);
    }
  fl.connect(g).connect(bus);
}
/** Un bruit qui dure (la bille qui roule) : on règle son volume et sa hauteur, on l'arrête. `null` sans son. */
export interface Roulement {
  regle(vol: number, hz: number): void;
  fin(): void;
}
export function roulement(f: number, q: number, vol: number): Roulement | null {
  if (!pret() || !ac || !bus || !bruit) return null;
  const ctx = ac;
  const s = ctx.createBufferSource();
  const fl = ctx.createBiquadFilter();
  const g = ctx.createGain();
  s.buffer = bruit;
  s.loop = true;
  fl.type = "bandpass";
  fl.frequency.value = f;
  fl.Q.value = q;
  g.gain.value = 0;
  s.connect(fl).connect(g).connect(bus);
  s.start(0, Math.random());
  g.gain.setTargetAtTime(vol, ctx.currentTime, 0.25);
  return {
    regle: (v, hz) => {
      g.gain.setTargetAtTime(v, ctx.currentTime, 0.12);
      fl.frequency.setTargetAtTime(hz, ctx.currentTime, 0.12);
    },
    fin: () => {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      try {
        s.stop(ctx.currentTime + 0.7);
      } catch {
        // Déjà arrêté.
      }
    },
  };
}

const D2 = 73.42;
const A2 = 110;
const D3 = 146.83;
const Fd3 = 185;
const A3 = 220;
const D4 = 293.66;
const Fd4 = 369.99;

/** Les sons communs du casino, ceux que tous les jeux partagent. */
export const SONS = {
  /** Le petit bruit des boutons du jeu. */
  clic: (): void => jouer("clic"),
  survol: (): void => ton(330, 290, 0, 0.05, 0.012, "triangle", 0.003),
  /** Un jeton de céramique posé : le claquement sec, le corps, un second contact plus léger. `rang` : 0 pour 10, 4 pour 200. */
  jeton: (rang = 0): void => {
    souffle(0, 0.014, "bandpass", 3300 + rang * 120, 2300, 3, 0.085, 0.001);
    ton(2050 + rang * 110, 1980 + rang * 110, 0, 0.07, 0.035, "sine", 0.001);
    peau(0, 300 + rang * 16, 0.07, 0.05, 1.5);
    souffle(0.045, 0.01, "bandpass", 3000, 2400, 3, 0.03, 0.001);
    ton(2500 + rang * 90, 2440 + rang * 90, 0.045, 0.04, 0.012, "sine", 0.001);
  },
  /** Les jetons qu'on ramasse : trois contacts qui glissent. */
  ramasse: (): void => {
    for (let i = 0; i < 3; i++) {
      souffle(i * 0.05, 0.012, "bandpass", 3000 - i * 200, 2200, 3, 0.05, 0.001);
      ton(1900 - i * 120, 1850 - i * 120, i * 0.05, 0.05, 0.02, "sine", 0.001);
    }
  },
  /** Un statère dans la bourse : mat, bref, un peu brillant. */
  piece: (quand = 0, i = 0): void => {
    const f = [1174.7, 1396.9, 1568, 1760][i % 4]!;
    ton(f, f * 0.99, quand, 0.2, 0.028, "triangle", 0.002);
    ton(f * 1.5, f * 1.49, quand + 0.01, 0.1, 0.009, "sine", 0.002);
    souffle(quand, 0.015, "bandpass", 2600, 2000, 3, 0.025, 0.001);
  },
  refus: (): void => {
    peau(0, 110, 0.09, 0.12, 1.3);
    peau(0.11, 92, 0.08, 0.14, 1.3);
  },
  /** La roue lancée : un souffle qui monte, le bois qui prend son élan. */
  lance: (): void => {
    souffle(0, 0.7, "bandpass", 260, 900, 1.2, 0.07, 0.2);
    peau(0, 96, 0.14, 0.3, 1.6);
  },
  /** La bille contre une cloison : ivoire sur laiton, très bref. */
  cloison: (vol = 0.03): void => {
    ton(1500, 1150, 0, 0.03, vol, "triangle", 0.001);
    souffle(0, 0.008, "bandpass", 2600, 2000, 4, vol * 0.9, 0.001);
  },
  /** La bille tombe dans sa case : deux rebonds, puis le repos. */
  chute: (): void => {
    peau(0, 260, 0.1, 0.07, 1.6);
    souffle(0, 0.012, "bandpass", 2400, 1700, 3, 0.07, 0.001);
    peau(0.13, 230, 0.06, 0.06, 1.5);
    peau(0.23, 215, 0.035, 0.05, 1.4);
  },
  roulement,
  /** Un gain : la nappe chaude, quelques statères. */
  gain: (pieces = 4): void => {
    nappe([D3, Fd3, A3], 0, 1.6, 0.05);
    nappe([D4], 0.25, 1.2, 0.018, 1600);
    for (let i = 0; i < pieces; i++) SONS.piece(0.2 + i * 0.11, i);
  },
  /** Un grand gain : timbales, cor grave, la nappe qui s'ouvre. */
  grandGain: (): void => {
    for (let i = 0; i < 5; i++) timbale(i * (0.13 - i * 0.008), D2, 0.06 + i * 0.014, 0.5);
    timbale(0.62, D2, 0.2, 1.5);
    cor([A2], 0, 0.55, 0.05);
    cor([D2, A2, D3, Fd3], 0.6, 2, 0.04);
    nappe([D3, Fd3, A3, D4], 0.6, 2.8, 0.05, 1500);
    nappe([Fd4], 1.1, 1.8, 0.014, 1800);
    for (let i = 0; i < 8; i++) SONS.piece(0.9 + i * 0.13, i);
  },
  /** Rien cette fois : un seul coup sourd, sans reproche. */
  perdu: (): void => {
    peau(0, 82, 0.12, 0.35, 1.3);
    nappe([D2 * 2, A2], 0.02, 0.9, 0.02, 500);
  },
  /** La mise rendue : deux statères qui reviennent, ni fête ni reproche. */
  egal: (): void => {
    SONS.piece(0, 0);
    SONS.piece(0.14, 0);
  },
  /** Un rendu partiel : un seul statère, et le coup sourd, plus léger. */
  partiel: (): void => {
    peau(0, 92, 0.07, 0.3, 1.3);
    SONS.piece(0.12, 0);
  },
  /** On entre dans un salon : la porte capitonnée, un accord qui s'ouvre. */
  entree: (): void => {
    souffle(0, 0.4, "lowpass", 300, 900, 0.7, 0.05, 0.15);
    nappe([D3, A3], 0.05, 1.3, 0.03, 900);
  },
};
