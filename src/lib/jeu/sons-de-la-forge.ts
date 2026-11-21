/**
 * Les sons de la forge de « Mon Gaulois » (Claude Fable 5.2, 21 novembre 2026) : la fusion garde son animation (le moule qui
 * se remplit, `src/components/village/Moule.tsx`) et gagne les sons du jeu. Un objet posé dans le creuset, le métal qui
 * coule, le moule qui s'ouvre sur un coup d'enclume, les coups de ciseau d'une gravure : tout est fabriqué dans la page par
 * Web Audio, sans fichier, dans l'esprit des sons des boosters (`sons-des-boosters.ts`) : grave, un peu de brillance, rien
 * au-dessus de 8 000 Hz.
 *
 * Ils passent par le contexte audio du jeu (`preparerLeSon` de `sons.ts`) et suivent son seul réglage : rien ne part quand
 * le visiteur a coupé le son (`sonVoulu`). Chaque son répond à un geste (une carte posée, « Fondre », « Graver ») ou le
 * suit : le contexte existe alors.
 */
import { preparerLeSon, sonVoulu } from "./sons";

interface Chaine {
  ac: AudioContext;
  bus: GainNode;
  bruit: AudioBuffer;
}

let chaine: Chaine | null = null;

/** La chaîne des sons de la forge : un bus adouci (rien de strident ne passe) et un compresseur. */
function pret(): Chaine | null {
  if (!sonVoulu()) return null;
  const ac = preparerLeSon();
  if (!ac || ac.state === "closed") return null;
  if (chaine && chaine.ac === ac) return chaine;
  const comp = ac.createDynamicsCompressor();
  const doux = ac.createBiquadFilter();
  const bus = ac.createGain();
  comp.threshold.value = -18;
  comp.ratio.value = 5;
  doux.type = "lowpass";
  doux.frequency.value = 7500;
  bus.gain.value = 0.7;
  bus.connect(doux).connect(comp).connect(ac.destination);
  const n = ac.sampleRate;
  const bruit = ac.createBuffer(1, n, n);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  chaine = { ac, bus, bruit };
  return chaine;
}

/** Une note : d'une hauteur à l'autre, une attaque courte, puis elle s'éteint. */
function ton(c: Chaine, vers: AudioNode, f0: number, f1: number, quand: number, duree: number, vol: number, type: OscillatorType = "sine", att = 0.004): OscillatorNode {
  const t = c.ac.currentTime + quand;
  const o = c.ac.createOscillator();
  const g = c.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(vers);
  o.start(t);
  o.stop(t + duree + 0.05);
  return o;
}

/** Un souffle : du bruit passé dans un filtre qui glisse. */
function souffle(c: Chaine, vers: AudioNode, quand: number, duree: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, att = 0.004): AudioBufferSourceNode {
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
  s.connect(fl).connect(g).connect(vers);
  s.start(t, Math.random() * 0.5);
  s.stop(t + duree + 0.05);
  return s;
}

/** Un coup sur le fer : un choc sourd, puis les partiels du métal, qui ne sont pas ceux d'une cloche juste. */
function fer(c: Chaine, quand: number, f: number, vol: number, tenue: number): void {
  ton(c, c.bus, f * 0.42, f * 0.2, quand, 0.16, vol * 1.4);
  souffle(c, c.bus, quand, 0.05, "bandpass", 2600, 1200, 0.8, vol * 0.9, 0.002);
  for (const [k, v, d] of [[1, 1, 1], [2.32, 0.55, 0.7], [3.87, 0.3, 0.45], [5.41, 0.14, 0.28]] as const) {
    if (f * k > 7000) continue;
    ton(c, c.bus, f * k, f * k * 0.996, quand, tenue * d, vol * v, "triangle", 0.002);
  }
}

/** Un objet posé dans le creuset (ou repris : `repris`). Court, métallique et sourd. */
export function sonDuCreuset(repris = false): void {
  const c = pret();
  if (!c) return;
  if (repris) {
    // Repris : le fer quitte la pierre, la note remonte.
    ton(c, c.bus, 95, 150, 0, 0.1, 0.12, "sine", 0.01);
    ton(c, c.bus, 620, 700, 0.01, 0.07, 0.03, "triangle", 0.003);
    souffle(c, c.bus, 0, 0.07, "bandpass", 700, 1500, 0.9, 0.05, 0.02);
    return;
  }
  ton(c, c.bus, 150, 62, 0, 0.16, 0.22);
  souffle(c, c.bus, 0, 0.06, "lowpass", 900, 220, 0.7, 0.12, 0.002);
  ton(c, c.bus, 740, 720, 0.005, 0.12, 0.045, "triangle", 0.002);
  ton(c, c.bus, 1720, 1690, 0.005, 0.07, 0.016, "triangle", 0.002);
}

let coulee: { c: Chaine; g: GainNode; sources: AudioScheduledSourceNode[] } | null = null;

/** Arrête la coulée tout de suite (« Passer », fenêtre fermée). */
export function arreterLaCoulee(): void {
  const en = coulee;
  coulee = null;
  if (!en) return;
  const { ac } = en.c;
  if (ac.state === "closed") return;
  const t = ac.currentTime;
  try {
    en.g.gain.cancelScheduledValues(t);
    en.g.gain.setValueAtTime(Math.max(0.0001, en.g.gain.value), t);
    en.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    for (const s of en.sources) s.stop(t + 0.12);
  } catch {
    // Une source déjà arrêtée : rien à couper.
  }
  window.setTimeout(() => en.g.disconnect(), 400);
}

/** Le métal qui coule dans le moule, pendant `duree` millisecondes : grondement, crépitement, montée. */
export function sonDeLaCoulee(duree: number): void {
  arreterLaCoulee();
  const c = pret();
  if (!c) return;
  const d = Math.min(20, Math.max(0.4, (Number.isFinite(duree) ? duree : 0) / 1000));
  const { ac } = c;
  const t = ac.currentTime;
  const g = ac.createGain();
  g.gain.setValueAtTime(1, t);
  g.gain.setValueAtTime(1, t + d - 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  g.connect(c.bus);
  const sources: AudioScheduledSourceNode[] = [];

  // Le grondement : le feu sous le creuset, un souffle très grave qui s'ouvre lentement.
  const feu = ac.createBufferSource();
  const feuF = ac.createBiquadFilter();
  const feuG = ac.createGain();
  feu.buffer = c.bruit;
  feu.loop = true;
  feuF.type = "lowpass";
  feuF.Q.value = 0.8;
  feuF.frequency.setValueAtTime(90, t);
  feuF.frequency.exponentialRampToValueAtTime(320, t + d);
  feuG.gain.setValueAtTime(0.0001, t);
  feuG.gain.exponentialRampToValueAtTime(0.3, t + Math.min(0.5, d * 0.3));
  feuG.gain.linearRampToValueAtTime(0.42, t + d);
  feu.connect(feuF).connect(feuG).connect(g);
  feu.start(t, Math.random() * 0.5);
  feu.stop(t + d + 0.1);
  sources.push(feu);

  // Le coulis : le métal qui file, un souffle étroit qui monte comme le moule se remplit.
  const coulis = ac.createBufferSource();
  const coulisF = ac.createBiquadFilter();
  const coulisG = ac.createGain();
  coulis.buffer = c.bruit;
  coulis.loop = true;
  coulisF.type = "bandpass";
  coulisF.Q.value = 2.2;
  coulisF.frequency.setValueAtTime(380, t);
  coulisF.frequency.exponentialRampToValueAtTime(1500, t + d);
  coulisG.gain.setValueAtTime(0.0001, t);
  coulisG.gain.exponentialRampToValueAtTime(0.05, t + Math.min(0.4, d * 0.3));
  coulisG.gain.linearRampToValueAtTime(0.085, t + d);
  coulis.connect(coulisF).connect(coulisG).connect(g);
  coulis.start(t, Math.random() * 0.5);
  coulis.stop(t + d + 0.1);
  sources.push(coulis);

  // La montée : deux notes graves en quinte, qui grimpent d'un ton et s'éclaircissent vers la fin.
  const monteeF = ac.createBiquadFilter();
  const monteeG = ac.createGain();
  monteeF.type = "lowpass";
  monteeF.Q.value = 1;
  monteeF.frequency.setValueAtTime(180, t);
  monteeF.frequency.exponentialRampToValueAtTime(1100, t + d);
  monteeG.gain.setValueAtTime(0.0001, t);
  monteeG.gain.exponentialRampToValueAtTime(0.03, t + d * 0.35);
  monteeG.gain.exponentialRampToValueAtTime(0.085, t + d);
  monteeF.connect(monteeG).connect(g);
  for (const [f, type] of [[55, "sawtooth"], [82.4, "sawtooth"], [55.4, "triangle"]] as const) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.26, t + d);
    o.connect(monteeF);
    o.start(t);
    o.stop(t + d + 0.1);
    sources.push(o);
  }

  // Le crépitement : des braises qui claquent, de plus en plus serrées.
  for (let x = 0.15; x < d - 0.1; x += 0.05 + Math.random() * (0.34 - 0.2 * (x / d))) {
    const f = 1800 + Math.random() * 3200;
    sources.push(souffle(c, g, x, 0.018 + Math.random() * 0.03, "bandpass", f, f * 0.7, 3, 0.03 + 0.05 * Math.random() * (0.5 + x / d), 0.001));
  }
  coulee = { c, g, sources };
  // À la fin de la coulée, il n'y a plus rien à arrêter.
  const moi = coulee;
  window.setTimeout(() => {
    if (coulee === moi) coulee = null;
    g.disconnect();
  }, d * 1000 + 300);
}

/** Le moule qui s'ouvre : la pierre qui glisse, un coup d'enclume ; `rang` 1 à 5 : la rareté reçue (plus ample si plus rare). */
export function sonDuDemoulage(rang: number): void {
  const c = pret();
  if (!c) return;
  const r = Math.min(5, Math.max(1, Math.round(Number.isFinite(rang) ? rang : 1)));
  // La pierre qui glisse : un frottement grave, râpeux.
  souffle(c, c.bus, 0, 0.34, "bandpass", 420, 170, 1.4, 0.2, 0.06);
  souffle(c, c.bus, 0.02, 0.3, "lowpass", 160, 90, 0.7, 0.18, 0.08);
  // La vapeur du métal qui refroidit.
  souffle(c, c.bus, 0.3, 0.5 + r * 0.08, "bandpass", 3600, 1400, 0.7, 0.035 + r * 0.006, 0.03);
  // Le coup d'enclume, plus long et plus plein quand l'objet est rare.
  const quand = 0.32;
  fer(c, quand, 392, 0.1 + r * 0.012, 0.7 + r * 0.22);
  ton(c, c.bus, 110, 46, quand, 0.3 + r * 0.05, 0.2 + r * 0.02);
  if (r >= 3) {
    // Une quinte grave tenue dessous : la pièce a du poids.
    ton(c, c.bus, 98, 98, quand, 0.9 + r * 0.2, 0.07, "triangle", 0.02);
    ton(c, c.bus, 147, 147, quand, 0.8 + r * 0.2, 0.045, "triangle", 0.02);
  }
  if (r >= 4) fer(c, quand + 0.2, 523, 0.07, 1.1);
  if (r >= 5) {
    fer(c, quand + 0.4, 659, 0.06, 1.5);
    ton(c, c.bus, 49, 49, quand, 1.8, 0.12, "sine", 0.03);
  }
}

/** Une plaque gravée : trois petits coups de ciseau. */
export function sonDeLaGravure(): void {
  const c = pret();
  if (!c) return;
  [0, 0.13, 0.27].forEach((quand, i) => {
    const f = [1480, 1660, 1400][i]!;
    souffle(c, c.bus, quand, 0.035, "bandpass", 3000, 1900, 1.2, 0.1, 0.001);
    ton(c, c.bus, f, f * 0.97, quand, 0.07 + i * 0.02, 0.05, "triangle", 0.001);
    ton(c, c.bus, 210, 120, quand, 0.06, 0.1, "sine", 0.002);
  });
}
