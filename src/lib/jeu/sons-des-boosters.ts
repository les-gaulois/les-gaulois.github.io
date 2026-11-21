/**
 * Les sons de l'ouverture des boosters (21 novembre 2026), validés par le pilote dans l'animation de démonstration (« plus
 * épique, un chouille moins aigu, en thème avec OpenFront », puis « un tout petit peu d'aigu ») : la guerre au loin. Tambour
 * sourd, cuir qui craque, détonation, cor grave, timbales, chœur, tout fabriqué dans la page par Web Audio, sans fichier.
 * Repris tels quels de la démonstration ; ne pas les changer sans la demande du pilote.
 *
 * Ils passent par le contexte audio du jeu (`preparerLeSon` de `sons.ts`) et suivent son seul réglage : coupés quand le
 * visiteur a coupé le son (`sonVoulu`). Un son ne part que si la page a déjà reçu un geste (le contexte existe alors).
 */
import { preparerLeSon, sonVoulu } from "./sons";

interface Chaine {
  ac: AudioContext;
  bus: GainNode;
  bruit: AudioBuffer;
}

let chaine: Chaine | null = null;
let nappe: { g: GainNode; lp: BiquadFilterNode; o1: OscillatorNode; o2: OscillatorNode } | null = null;
let battement = 0;

/** La chaîne des sons : un bus adouci (rien de strident ne passe), une grande salle sourde pour l'ampleur, un compresseur. */
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
  mouille.gain.value = 0.32;
  bus.connect(salle).connect(mouille).connect(comp);
  const bruit = ac.createBuffer(1, n, n);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  chaine = { ac, bus, bruit };
  return chaine;
}

/** Réveille le son de la scène : à chaque geste du visiteur (appui, touche). */
export function reveillerLeSon(): void {
  if (!sonVoulu()) return;
  const c = preparer();
  if (c && c.ac.state !== "running") c.ac.resume().catch(() => undefined);
}

/** La chaîne, si un son peut partir maintenant. */
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

const glisse = (f0: number, f1: number, quand: number, duree: number, vol: number, type: OscillatorType = "sine"): void => ton(f0, f1, quand, duree, vol, type, duree * 0.3);

/** Une peau frappée : la note tombe vite, le corps reste. */
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

/** Le cor de guerre : des dents de scie graves, un filtre qui s'ouvre comme un souffle dans le cuivre, la note prise par en dessous. */
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
    ton(f * 4, f * 4, quand + 0.05, Math.max(0.2, duree * 0.8), vol * 0.1, "sine", 0.08); // une harmonique claire, discrète
  }
}

/** Le chœur grave : des voix désaccordées derrière deux formants, qui montent lentement. */
function choeur(notes: readonly number[], quand: number, duree: number, vol: number): void {
  const c = pret();
  if (!c) return;
  const t = c.ac.currentTime + quand;
  const g = c.ac.createGain();
  const f1 = c.ac.createBiquadFilter();
  const f2 = c.ac.createBiquadFilter();
  f1.type = f2.type = "bandpass";
  f1.frequency.value = 430;
  f1.Q.value = 3;
  f2.frequency.value = 780;
  f2.Q.value = 4;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * 6, t + 0.8);
  g.gain.setValueAtTime(vol * 6, t + duree - 1.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  for (const f of notes)
    for (const d of [0.996, 1, 1.004]) {
      const o = c.ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * d;
      o.connect(f1);
      o.connect(f2);
      o.start(t);
      o.stop(t + duree + 0.05);
    }
  f1.connect(g);
  f2.connect(g);
  g.connect(c.bus);
}

/** Le grondement qui monte sous l'effort. */
export function nappeSur(): void {
  const c = pret();
  if (!c || nappe) return;
  const g = c.ac.createGain();
  const lp = c.ac.createBiquadFilter();
  const o1 = c.ac.createOscillator();
  const o2 = c.ac.createOscillator();
  g.gain.value = 0;
  lp.type = "lowpass";
  lp.frequency.value = 140;
  o1.type = o2.type = "sawtooth";
  o1.frequency.value = 49;
  o2.frequency.value = 49.4;
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g).connect(c.bus);
  o1.start();
  o2.start();
  nappe = { g, lp, o1, o2 };
}

export function nappeMaj(effort: number): void {
  if (!nappe || !chaine) return;
  const t = chaine.ac.currentTime;
  const f = 49 * Math.pow(2, effort * 0.6);
  nappe.o1.frequency.setTargetAtTime(f, t, 0.05);
  nappe.o2.frequency.setTargetAtTime(f * 1.008, t, 0.05);
  nappe.lp.frequency.setTargetAtTime(140 + effort * 280, t, 0.05);
  nappe.g.gain.setTargetAtTime(0.04 + 0.11 * effort, t, 0.06);
}

export function nappeFin(d = 0.15): void {
  if (!nappe || !chaine) {
    nappe = null;
    return;
  }
  const n = nappe;
  const t = chaine.ac.currentTime;
  nappe = null;
  n.g.gain.setTargetAtTime(0, t, d / 3);
  n.o1.stop(t + d + 0.4);
  n.o2.stop(t + d + 0.4);
}

/** Le tambour de guerre qui bat comme un cœur : lent et sourd dans l'attente, de plus en plus pressé sous l'effort. */
export function coeur(effort: number): void {
  const c = pret();
  if (!c) return;
  const t = c.ac.currentTime;
  if (t < battement) return;
  const pas = effort > 0 ? 0.58 - 0.34 * effort : 1.5;
  const v = effort > 0 ? 0.13 + 0.1 * effort : 0.045;
  tambour(0, v);
  tambour(Math.min(0.16, pas * 0.3), v * 0.55, 50);
  battement = t + pas;
}

/** Le cuir qui se tend, quand on tient le paquet. */
export const sonFroisse = (effort: number): void => {
  const f = 380 + Math.random() * 700;
  bruitF(0, 0.04, "bandpass", f, f * 0.7, 3, 0.05 + 0.07 * effort, 0.002);
};
/** Une rareté de plus vue par la couture : une note de cor, plus haute à chaque palier. */
export const sonPalier = (v: number): void => cor([[98, 110, 123.47][Math.min(v, 3) - 1] ?? 98], 0, 0.3, 0.05);
export const sonCraque = (): void => {
  bruitF(0, 0.015, "bandpass", 2800, 1900, 2, 0.11, 0.001);
  bruitF(0, 0.1, "bandpass", 420, 240, 3, 0.3);
  for (let i = 0; i < 3; i++) bruitF(0.012 + i * 0.028, 0.02, "bandpass", 900 - i * 150, 700 - i * 150, 4, 0.16, 0.001);
  ton(95, 48, 0, 0.16, 0.16, "triangle");
};
export const sonDechire = (): void => bruitF(0, 0.26, "bandpass", 1100, 280, 1.2, 0.2);
/** La détonation lointaine : plus profonde et plus longue pour les hautes raretés. */
export function sonEclat(rang: number): void {
  const v = 0.2 + 0.035 * rang;
  ton(74, 30, 0, 0.75, v, "sine", 0.004);
  bruitF(0, 0.8, "lowpass", 900, 90, 0.7, v * 0.9);
  if (rang >= 4) {
    ton(52, 26, 0.13, 1.1, v * 0.8);
    bruitF(0.13, 1.2, "lowpass", 500, 60, 0.7, v * 0.6);
  }
}
export const sonJaillit = (): void => bruitF(0, 0.42, "bandpass", 260, 1300, 0.9, 0.12, 0.15);
export const sonChoc = (f: number): void => tambour(0, Math.min(0.3, 0.13 + 0.07 * f), 52);
export const sonFlap = (): void => {
  bruitF(0, 0.018, "highpass", 3200, 2600, 0.7, 0.09, 0.001);
  bruitF(0, 0.035, "bandpass", 1500, 1100, 0.8, 0.2, 0.001);
  ton(230, 150, 0, 0.05, 0.1, "triangle", 0.001);
};
export const sonLettre = (): void => {
  tambour(0, 0.07, 105);
  bruitF(0, 0.02, "bandpass", 1200, 900, 2, 0.06, 0.001);
};
export function sonTension(d: number): void {
  glisse(55, 98, 0, d, 0.07, "triangle");
  for (let t = 0, i = 0; t < d; t += Math.max(0.05, 0.13 - i * 0.012), i++) timbale(t, 73.42, 0.03 + 0.05 * (t / d), 0.25);
}
export const sonPrise = (): void => ton(150, 95, 0, 0.1, 0.1, "triangle", 0.003);
/** Le son remis : un coup de tambour et le cor, pour qu'on l'entende. */
export function sonRemis(): void {
  tambour(0, 0.12);
  cor([110, 146.83], 0.12, 0.5, 0.05);
}
/** Quelques éclats légers, mats et brefs : de la lumière sur le métal, pas des clochettes. */
function eclatsClairs(t0: number, n: number): void {
  const notes = [1174.7, 1480, 1760, 2217.5];
  for (let i = 0; i < n; i++) {
    const f = notes[i % 4]!;
    ton(f, f * 0.985, t0 + i * 0.21, 0.32, 0.014, "triangle", 0.006);
  }
}
/**
 * La carte révélée : un coup sourd pour le commun, le cor dès l'épique, les timbales du légendaire, le chœur du divin. Rang
 * 0 (des statères rendus, sans rareté) : le coup sourd du commun.
 */
export function sonRevele(rang: number): void {
  const D2 = 73.42;
  const A2 = 110;
  const D3 = 146.83;
  const F3 = 174.61;
  const Fd3 = 185;
  const A3 = 220;
  if (rang <= 1) return tambour(0, 0.16, 56);
  if (rang === 2) {
    tambour(0, 0.16, 56);
    tambour(0.16, 0.13, 74);
    return;
  }
  tambour(0, 0.2, 52);
  if (rang === 3) cor([D2, A2], 0.02, 0.9, 0.055);
  if (rang === 4) {
    cor([D2, A2, D3, F3], 0.02, 1.4, 0.05);
    tambour(0.3, 0.14, 52);
  }
  if (rang === 5) {
    for (let i = 0; i < 7; i++) timbale(i * (0.11 - i * 0.008), D2, 0.06 + i * 0.012, 0.5);
    timbale(0.62, D2, 0.24, 1.6);
    timbale(0.62, A2 / 2, 0.16, 1.6);
    cor([A2], 0, 0.55, 0.07);
    cor([D2, A2, D3, Fd3], 0.6, 2.2, 0.05);
    cor([A3], 1.3, 1.4, 0.03);
    timbale(1.5, D2, 0.16, 1.4);
    eclatsClairs(0.7, 5);
  }
  if (rang >= 6) {
    timbale(0, D2, 0.2, 2);
    choeur([D2, A2, D3, Fd3], 0.05, 4.4, 0.03);
    cor([A2], 0.9, 0.5, 0.06);
    cor([D3, A3], 1.4, 2.6, 0.04);
    cor([D2], 1.4, 2.6, 0.06);
    timbale(1.4, D2, 0.2, 1.8);
    timbale(2.6, D2, 0.12, 1.6);
    eclatsClairs(1.5, 7);
  }
}
