/**
 * Les sons du duel « Coup pour coup » (22 novembre 2026), repris de la maquette validée par le pilote : la guerre au loin,
 * de la même famille que l'ouverture des boosters (tambour sourd, timbales, cor grave, juste un peu d'aigu). Tout est fait
 * dans la page par Web Audio, sans fichier. Ne pas les changer sans la demande du pilote.
 *
 * Ils passent par le contexte audio du jeu (`preparerLeSon` de `src/lib/jeu/sons.ts`) et suivent son seul réglage : coupés
 * quand le visiteur a coupé le son. Comme les autres sons du jeu, la pause des animations ne les coupe pas. Un son ne part
 * que si la page a déjà reçu un geste.
 */
import { preparerLeSon, sonVoulu } from "../../../lib/jeu/sons";

interface Chaine {
  ac: AudioContext;
  bus: GainNode;
  bruit: AudioBuffer;
}
let chaine: Chaine | null = null;

/** La chaîne : un bus adouci, une grande salle sourde, un compresseur (les réglages de la maquette). */
function preparer(): Chaine | null {
  const ac = preparerLeSon();
  if (!ac || ac.state === "closed") return null;
  if (chaine && chaine.ac === ac) return chaine;
  const comp = ac.createDynamicsCompressor();
  const doux = ac.createBiquadFilter();
  const salle = ac.createConvolver();
  const mouille = ac.createGain();
  const sortie = ac.createGain();
  const n = ac.sampleRate;
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  sortie.gain.value = 1.15;
  comp.connect(sortie).connect(ac.destination);
  const bus = ac.createGain();
  bus.gain.value = 0.7;
  doux.type = "lowpass";
  doux.frequency.value = 8000;
  bus.connect(doux).connect(comp);
  const ir = ac.createBuffer(2, n * 2, n);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let m = 0;
    for (let i = 0; i < d.length; i++) {
      m += (Math.random() * 2 - 1 - m) * 0.22;
      d[i] = m * Math.pow(1 - i / d.length, 3);
    }
  }
  salle.buffer = ir;
  mouille.gain.value = 0.26;
  bus.connect(salle).connect(mouille).connect(comp);
  const bruit = ac.createBuffer(1, n, n);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  chaine = { ac, bus, bruit };
  return chaine;
}

/** Réveille le son du duel : à chaque geste du visiteur (appui, touche). */
export function reveillerLeSon(): void {
  if (!sonVoulu()) return;
  const c = preparer();
  if (c && c.ac.state !== "running") c.ac.resume().catch(() => undefined);
}

const pret = (): Chaine | null => (sonVoulu() && chaine && chaine.ac.state !== "closed" ? chaine : null);

function ton(f0: number, f1: number, quand: number, duree: number, vol: number, type: OscillatorType = "sine", att = 0.005): void {
  const c = pret();
  if (!c) return;
  const t = c.ac.currentTime + quand;
  const o = c.ac.createOscillator();
  const g = c.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(c.bus);
  o.start(t);
  o.stop(t + duree + 0.05);
}

function bruitF(quand: number, duree: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, att = 0.004): void {
  const c = pret();
  if (!c) return;
  const t = c.ac.currentTime + quand;
  const s = c.ac.createBufferSource();
  const fl = c.ac.createBiquadFilter();
  const g = c.ac.createGain();
  s.buffer = c.bruit;
  s.loop = true;
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t);
  fl.frequency.exponentialRampToValueAtTime(f1, t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  s.connect(fl).connect(g).connect(c.bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + duree + 0.05);
}

function peau(quand: number, f: number, vol: number, dec: number, chute: number): void {
  const c = pret();
  if (!c) return;
  const t = c.ac.currentTime + quand;
  const o = c.ac.createOscillator();
  const g = c.ac.createGain();
  o.frequency.setValueAtTime(f * chute, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  o.connect(g).connect(c.bus);
  o.start(t);
  o.stop(t + dec + 0.05);
}

function tambour(quand = 0, vol = 0.15, f = 58): void {
  peau(quand, f, vol, 0.4, 2.3);
  bruitF(quand, 0.08, "lowpass", 500, 120, 0.7, vol * 0.5);
}
function timbale(quand: number, f: number, vol: number, dec = 1.1): void {
  peau(quand, f, vol, dec, 1.25);
  ton(f * 1.5, f * 1.5, quand, dec * 0.5, vol * 0.25, "triangle", 0.004);
  bruitF(quand, 0.06, "lowpass", 700, 200, 0.7, vol * 0.4);
}
function cor(notes: readonly number[], quand: number, duree: number, vol: number): void {
  const c = pret();
  if (!c) return;
  const t = c.ac.currentTime + quand;
  for (const f of notes) {
    const fl = c.ac.createBiquadFilter();
    const g = c.ac.createGain();
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
      const o = c.ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * d * 0.93, t);
      o.frequency.exponentialRampToValueAtTime(f * d, t + 0.09);
      o.connect(fl);
      o.start(t);
      o.stop(t + duree + 0.05);
    }
    fl.connect(g).connect(c.bus);
    ton(f * 4, f * 4, quand + 0.05, Math.max(0.2, duree * 0.8), vol * 0.1, "sine", 0.08);
  }
}
const NOTES_CLAIRES = [1174.7, 1480, 1760, 2217.5] as const;
const eclatsClairs = (t0: number, n: number): void => {
  for (let i = 0; i < n; i++) {
    const f = NOTES_CLAIRES[i % 4]!;
    ton(f, f * 0.985, t0 + i * 0.21, 0.32, 0.014, "triangle", 0.006);
  }
};
const D2 = 73.42;
const A2 = 110;
const D3 = 146.83;
const F3 = 174.61;
const Fd3 = 185;
const A3 = 220;
const SOIN = [294, 370, 440, 494, 587, 659] as const;

/** Les sons du duel, ceux de la maquette. */
export const SON = {
  clic: (): void => ton(190, 120, 0, 0.06, 0.08, "triangle", 0.002),
  survol: (): void => ton(300, 240, 0, 0.05, 0.025, "triangle", 0.002),
  prise: (): void => ton(150, 95, 0, 0.1, 0.1, "triangle", 0.003),
  pose: (q = 0): void => {
    tambour(q, 0.1, 88);
    bruitF(q, 0.03, "bandpass", 1400, 900, 1, 0.07, 0.001);
  },
  retour: (): void => ton(170, 110, 0, 0.07, 0.08, "triangle", 0.002),
  enfile: (): void => {
    ton(170, 110, 0, 0.07, 0.12, "triangle", 0.002);
    ton(125, 80, 0.09, 0.1, 0.12, "triangle", 0.002);
  },
  revele: (): void => {
    bruitF(0, 0.018, "highpass", 3200, 2600, 0.7, 0.07, 0.001);
    bruitF(0, 0.035, "bandpass", 1500, 1100, 0.8, 0.18, 0.001);
    tambour(0.02, 0.14, 62);
  },
  energie: (q = 0): void => ton(260, 330, q, 0.07, 0.035, "triangle", 0.004),
  paye: (q = 0): void => ton(240, 150, q, 0.06, 0.04, "triangle", 0.002),
  elance: (): void => bruitF(0, 0.2, "bandpass", 300, 1100, 0.9, 0.09, 0.09),
  /** Le coup qui porte : plus sourd et plus long quand il est fort, avec un rien de métal. */
  coup: (n: number, role: string): void => {
    const v = Math.min(0.34, 0.16 + 0.022 * n);
    const tete = role === "tete";
    ton(tete ? 96 : 78, 34, 0, 0.5, v, "sine", 0.003);
    bruitF(0, 0.3, "lowpass", 1100, 110, 0.7, v * 0.8);
    bruitF(0, 0.02, "bandpass", tete ? 900 : 2300, tete ? 700 : 1700, 2, tete ? 0.16 : 0.08, 0.001);
    if (tete) ton(210, 150, 0, 0.09, 0.12, "triangle", 0.002);
    if (n >= 6) {
      ton(52, 26, 0.09, 0.9, v * 0.7);
      bruitF(0.09, 0.9, "lowpass", 500, 60, 0.7, v * 0.5);
    }
  },
  /** La garde : le bois et le fer du bouclier, sans tinter haut. */
  pare: (): void => {
    tambour(0, 0.2, 96);
    ton(392, 380, 0, 0.32, 0.045, "triangle", 0.002);
    ton(587, 575, 0, 0.2, 0.022, "triangle", 0.002);
    bruitF(0, 0.05, "bandpass", 2100, 1500, 3, 0.1, 0.001);
  },
  vide: (): void => bruitF(0, 0.22, "bandpass", 700, 260, 1, 0.05, 0.05),
  /** Les dégâts se comptent un par un : le son monte. */
  coeur: (q = 0, rang = 0): void => {
    const f = 300 * Math.pow(1.045, Math.min(rang, 16));
    ton(f, f * 0.66, q, 0.05, 0.032, "triangle", 0.002);
  },
  mot: (m: string, rang = 0): void => {
    const h = Math.pow(1.06, rang);
    if (m === "assomme") {
      tambour(0, 0.16, 110);
      ton(180 * h, 90, 0, 0.18, 0.07, "triangle", 0.002);
    } else if (m === "saigne" || m === "epines" || m === "perce") {
      bruitF(0, 0.08, "bandpass", 2200, 900, 2, 0.1, 0.002);
      ton(240 * h, 160, 0, 0.1, 0.05, "triangle", 0.002);
    } else if (m === "brule") {
      bruitF(0, 0.3, "bandpass", 500, 1600, 0.8, 0.09, 0.08);
      ton(110, 82, 0, 0.25, 0.06, "triangle", 0.02);
    } else if (m === "rempart" || m === "muraille") {
      tambour(0, 0.14, 92);
      ton(330, 320, 0, 0.2, 0.03, "triangle", 0.002);
    } else if (m === "gel") {
      ton(660 * h, 520, 0, 0.3, 0.03, "triangle", 0.01);
      ton(880, 700, 0.06, 0.25, 0.018, "sine", 0.01);
    } else if (m === "regal" || m === "vampire" || m === "purge") {
      ton(294 * h, 294 * h, 0, 0.2, 0.04, "triangle", 0.01);
      ton(440 * h, 440 * h, 0.08, 0.25, 0.035, "triangle", 0.01);
    } else if (m === "ardeur" || m === "plein") {
      ton(220 * h, 330 * h, 0, 0.14, 0.05, "triangle", 0.01);
      ton(330 * h, 440 * h, 0.09, 0.14, 0.04, "triangle", 0.01);
    } else {
      cor([D3 * h], 0, 0.4, 0.035);
      tambour(0, 0.08, 98);
    }
  },
  arret: (): void => bruitF(0, 0.05, "lowpass", 300, 80, 0.7, 0.1, 0.002),
  soin: (n: number): void => {
    cor([D3], 0, 0.5, 0.04);
    for (let i = 0; i < Math.min(n, 6); i++) ton(SOIN[i]!, SOIN[i]!, 0.05 + i * 0.07, 0.3, 0.035, "triangle", 0.01);
  },
  elan: (): void => {
    ton(62, 124, 0, 0.36, 0.1, "triangle", 0.1);
    bruitF(0, 0.36, "bandpass", 240, 1300, 0.9, 0.08, 0.14);
    tambour(0.3, 0.12, 74);
  },
  coupe: (): void => {
    bruitF(0, 0.12, "bandpass", 1800, 500, 1.4, 0.12, 0.002);
    ton(196, 98, 0, 0.22, 0.08, "triangle", 0.003);
  },
  manche: (): void => {
    tambour(0, 0.13, 56);
    tambour(0.17, 0.09, 74);
  },
  fatigue: (n: number): void => {
    timbale(0, 55, 0.16 + Math.min(0.1, n * 0.02), 1.2);
    bruitF(0, 0.5, "lowpass", 400, 90, 0.7, 0.12, 0.1);
    ton(98, 82, 0.05, 0.6, 0.05, "triangle", 0.1);
  },
  /** Chaque coup de suite monte d'un cran. */
  enchaine: (rang = 1): void => {
    const h = Math.pow(1.122, Math.min(rang - 1, 6));
    ton(196 * h, 262 * h, 0, 0.12, 0.05, "triangle", 0.01);
    ton(392 * h, 392 * h, 0.08, 0.16, 0.022, "triangle", 0.01);
    tambour(0.02, 0.07 + 0.01 * rang, 98);
  },
  entree: (): void => {
    for (let i = 0; i < 5; i++) timbale(i * 0.12, D2, 0.07 + i * 0.02, 0.4);
    timbale(0.66, D2, 0.2, 1.4);
    cor([D2, A2], 0.64, 1.2, 0.055);
  },
  terre: (): void => {
    ton(60, 24, 0, 1, 0.3, "sine", 0.004);
    bruitF(0, 0.9, "lowpass", 700, 70, 0.7, 0.24);
    tambour(0.22, 0.14, 46);
  },
  victoire: (): void => {
    for (let i = 0; i < 6; i++) timbale(i * (0.11 - i * 0.008), D2, 0.06 + i * 0.012, 0.5);
    timbale(0.6, D2, 0.22, 1.6);
    cor([A2], 0, 0.5, 0.06);
    cor([D2, A2, D3, Fd3], 0.58, 2, 0.05);
    cor([A3], 1.2, 1.2, 0.028);
    eclatsClairs(0.7, 4);
  },
  defaite: (): void => {
    timbale(0, D2, 0.18, 1.6);
    cor([D2, F3 / 2], 0.05, 1.5, 0.05);
    cor([D2 * 0.89], 1.1, 1.4, 0.045);
    tambour(1.1, 0.1, 46);
  },
  egalite: (): void => {
    tambour(0, 0.14, 56);
    cor([D2, A2], 0.05, 1, 0.045);
  },
};
