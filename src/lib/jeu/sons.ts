/**
 * Les sons et la musique de « Mon Gaulois » (décision du pilote, 21 novembre 2026 : « sons actifs, musique coupée ») : faits
 * dans la page par Web Audio, rien à télécharger, ceux de la maquette validée (planche de Claude Fable 5.2).
 *
 * - Les sons courts (clic d'un bouton, carte lâchée, pièces, carillon) sont actifs au départ (demande du pilote, 21 novembre
 *   2026 : « je veux que le son soit activé par défaut »), sauf si le visiteur les a coupés : son choix est gardé. Les
 *   navigateurs ne jouent rien avant un geste : le contexte audio est créé, ou réveillé, à chaque appui et à chaque touche
 *   (src/scripts/jeu.ts), et le premier geste fait déjà son bruit. Un seul réglage pour tous les sons de la page, celui des
 *   boosters et du carillon (`gal-pochette-son`, `useSonDuJeu` de Carillon.tsx) : couper le son ici le coupe là, et l'inverse
 *   (annonce `gal:son`).
 * - La musique, une boucle douce composée note par note (ré, si mineur, sol, la), est coupée au départ ; le visiteur
 *   l'allume par le bouton de la barre du jeu, et ce choix est retenu sur son appareil (`gal-musique`). Elle ne démarre
 *   jamais seule : il faut un clic.
 * - Le bouton pause de la barre (`fx-off`) et « réduire les animations » ne coupent pas le son : ce sont des réglages à part.
 */

/** La clé du réglage du son, partagée avec les boosters et le carillon (Carillon.tsx) ; son nom date des pochettes. */
export const CLE_DU_SON = "gal-pochette-son";
/** L'annonce d'un son coupé ou remis : chaque bouton du son relit le réglage. */
export const SON_CHANGE = "gal:son";
const CLE_DE_LA_MUSIQUE = "gal-musique";
/** L'annonce d'une musique allumée ou coupée. */
export const MUSIQUE_CHANGE = "gal:musique";

const lire = (cle: string): string | null => {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
};
const ecrire = (cle: string, valeur: string | null): void => {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    // Sans stockage, le choix vaut pour cette page.
  }
};

/** Le son est-il voulu sur cet appareil ? Oui tant qu'on ne l'a pas coupé. */
export const sonVoulu = (): boolean => lire(CLE_DU_SON) !== "non";
/** La musique est-elle voulue ? Non tant qu'on ne l'a pas allumée. */
export const musiqueVoulue = (): boolean => lire(CLE_DE_LA_MUSIQUE) === "oui";

let ac: AudioContext | null = null;

/** Ouvre le son de la page : seulement dans un geste du visiteur (clic, touche). */
export function preparerLeSon(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Contexte = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexte) return null;
    ac ??= new Contexte();
    if (ac.state === "suspended") ac.resume().catch(() => undefined);
    return ac;
  } catch {
    return null;
  }
}

/** Coupe ou remet le son, pour toute la page. */
export function basculerLeSon(): boolean {
  const voulu = !sonVoulu();
  ecrire(CLE_DU_SON, voulu ? null : "non");
  if (voulu) preparerLeSon();
  window.dispatchEvent(new CustomEvent(SON_CHANGE));
  return voulu;
}

/** Les sons courts du jeu. */
export type NomDeSon = "clic" | "piece" | "flap" | "tic" | "carillon" | "enfile" | "enfile2";

/**
 * Joue un son court, si le son est voulu et que la page a déjà reçu un geste (le contexte existe alors). Un contexte encore
 * endormi est réveillé, et le son part dès qu'il l'est : le premier geste fait déjà son bruit (demande du pilote, 21
 * novembre 2026 : « je veux que le son soit activé par défaut »). `rang` : la hauteur du carillon (1 à 5).
 */
export function jouer(nom: NomDeSon, retard = 0, rang = 1): void {
  if (!ac || ac.state === "closed" || !sonVoulu()) return;
  if (ac.state === "suspended") ac.resume().catch(() => undefined);
  const t = ac.currentTime + retard;
  const sortie = ac.createGain();
  sortie.connect(ac.destination);
  const contexte = ac;
  const note = (type: OscillatorType, f0: number, f1: number, duree: number, vol: number, debut = t): void => {
    const o = contexte.createOscillator();
    const g = contexte.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, debut);
    o.frequency.exponentialRampToValueAtTime(f1, debut + duree);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setValueAtTime(vol, debut);
    g.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
    o.connect(g).connect(sortie);
    o.start(debut);
    o.stop(debut + duree + 0.02);
  };
  if (nom === "clic") note("square", 300, 170, 0.05, 0.05);
  else if (nom === "tic") note("square", 880, 640, 0.02, 0.02);
  else if (nom === "enfile") note("triangle", 660, 660, 0.1, 0.07);
  // La seconde note d'un objet enfilé au vestiaire, une quinte au-dessus (maquette validée) : `jouer("enfile2", 0.09)`.
  else if (nom === "enfile2") note("triangle", 990, 990, 0.18, 0.07);
  else if (nom === "piece") {
    note("triangle", 1568, 1568, 0.09, 0.1);
    note("triangle", 2093, 2093, 0.35, 0.1, t + 0.07);
  } else if (nom === "carillon") {
    const gamme = [523, 659, 784, 988, 1175, 1568];
    for (let i = 0; i < Math.min(6, rang + 1); i++) note("triangle", gamme[i]!, gamme[i]!, 0.5, 0.085, t + i * 0.09);
  } else if (nom === "flap") {
    const n = Math.floor(contexte.sampleRate * 0.11);
    const tampon = contexte.createBuffer(1, n, contexte.sampleRate);
    const d = tampon.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    const s = contexte.createBufferSource();
    const fl = contexte.createBiquadFilter();
    const g = contexte.createGain();
    s.buffer = tampon;
    fl.type = "bandpass";
    fl.frequency.value = 1500;
    fl.Q.value = 0.7;
    g.gain.value = 0.35;
    s.connect(fl).connect(g).connect(sortie);
    s.start(t);
    note("sine", 150, 70, 0.09, 0.16);
  }
}

// ---------- La musique ----------

const hauteur = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
const PAS_DE_MUSIQUE = 0.4;
// Seize mesures : un motif de harpe sur cinq notes, deux phrases qui se répondent, au-dessus de quatre basses tenues.
const AIR: readonly (number | null)[] = [
  74, null, 78, 81, null, 78, 74, null, 71, null, 74, 78, null, 74, 71, null, 67, null, 71, 74, null, 78, 74, null, 69, null, 73, 76, null, 73, 69, null, 78, null, 81, 86, null, 81, 78, null, 74, null, 78, 83, null, 78, 74, null, 71, null, 74, 79, null, 74, 71, null, 73, null,
  76, 81, null, 76, 74, null,
];
const BASSES = [50, 47, 43, 45] as const;
const musique = { marche: false, sortie: null as GainNode | null, minuterie: 0, prochain: 0, pas: 0 };

function planifierLaMusique(): void {
  const contexte = ac;
  const sortie = musique.sortie;
  if (!musique.marche || !contexte || !sortie) return;
  while (musique.prochain < contexte.currentTime + 0.35) {
    const i = musique.pas % AIR.length;
    const t = musique.prochain;
    const n = AIR[i];
    if (n) {
      const o = contexte.createOscillator();
      const f = contexte.createBiquadFilter();
      const g = contexte.createGain();
      o.type = "triangle";
      o.frequency.value = hauteur(n);
      f.type = "lowpass";
      f.frequency.value = 1500;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(f).connect(g).connect(sortie);
      o.start(t);
      o.stop(t + 1.2);
    }
    if (i % 8 === 0)
      for (const [d, vol] of [[0, 0.34], [7, 0.16], [12, 0.1]] as const) {
        const o = contexte.createOscillator();
        const g = contexte.createGain();
        const duree = PAS_DE_MUSIQUE * 8;
        o.type = "sine";
        o.frequency.value = hauteur(BASSES[(i / 8) % 4]! + d);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.6);
        g.gain.linearRampToValueAtTime(vol * 0.7, t + duree - 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + duree + 0.5);
        o.connect(g).connect(sortie);
        o.start(t);
        o.stop(t + duree + 0.6);
      }
    musique.prochain += PAS_DE_MUSIQUE;
    musique.pas++;
  }
}

/** La musique joue-t-elle en ce moment ? */
export const musiqueEnMarche = (): boolean => musique.marche;

/** Allume ou coupe la musique : seulement dans un geste du visiteur. Rend son nouvel état. */
export function basculerLaMusique(voulue = !musique.marche): boolean {
  if (voulue && !musique.marche) {
    const contexte = preparerLeSon();
    if (contexte) {
      musique.marche = true;
      musique.sortie = contexte.createGain();
      musique.sortie.gain.value = 0.0001;
      musique.sortie.gain.linearRampToValueAtTime(0.07, contexte.currentTime + 1.2);
      musique.sortie.connect(contexte.destination);
      musique.prochain = contexte.currentTime + 0.1;
      musique.pas = 0;
      planifierLaMusique();
      musique.minuterie = window.setInterval(planifierLaMusique, 120);
    }
  } else if (!voulue && musique.marche) {
    musique.marche = false;
    window.clearInterval(musique.minuterie);
    const s = musique.sortie;
    if (s && ac) {
      s.gain.cancelScheduledValues(ac.currentTime);
      s.gain.setValueAtTime(s.gain.value, ac.currentTime);
      s.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 0.5);
      window.setTimeout(() => s.disconnect(), 2600);
    }
    musique.sortie = null;
  }
  ecrire(CLE_DE_LA_MUSIQUE, musique.marche ? "oui" : null);
  window.dispatchEvent(new CustomEvent(MUSIQUE_CHANGE));
  return musique.marche;
}
