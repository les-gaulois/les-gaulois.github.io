/**
 * La lumière du village (onglet « La place » de `/village`) : le décor suit l'heure de Paris, le fuseau du clan (comme
 * `src/lib/time.ts`). Aube, jour, crépuscule, nuit, avec des passages doux. Calcul pur : aucune lecture du réseau, aucune
 * position de l'appareil. Les heures du lever et du coucher du soleil viennent d'un petit tableau pour Paris, au 15 de
 * chaque mois, à quelques minutes près ; entre deux lignes, elles glissent de jour en jour.
 */

const FUSEAU = "Europe/Paris";

const lecteur = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSEAU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Un instant lu à Paris. `minutes` : minutes écoulées depuis minuit, secondes comprises. `ete` : l'heure d'été y a cours. */
export interface InstantDeParis {
  mois: number;
  jour: number;
  heure: number;
  minute: number;
  minutes: number;
  ete: boolean;
}

export function instantDeParis(date: Date): InstantDeParis {
  const p: Record<string, number> = {};
  for (const { type, value } of lecteur.formatToParts(date)) if (type !== "literal") p[type] = Number(value);
  const annee = p["year"] ?? 1970;
  const mois = p["month"] ?? 1;
  const jour = p["day"] ?? 1;
  const heure = p["hour"] ?? 0;
  const minute = p["minute"] ?? 0;
  const seconde = p["second"] ?? 0;
  // L'écart à l'heure universelle : l'heure lue à Paris, relue comme une heure universelle, moins l'instant lui-même.
  const ecart = Math.round((Date.UTC(annee, mois - 1, jour, heure, minute, seconde) - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  return { mois, jour, heure, minute, minutes: heure * 60 + minute + seconde / 60, ete: ecart >= 120 };
}

const hm = (heure: number, minute: number): number => heure * 60 + minute;

/**
 * Le lever et le coucher du soleil à Paris au 15 de chaque mois, de janvier à décembre, en minutes après minuit, à l'heure
 * d'hiver (une heure de plus en heure d'été). Valeurs arrondies d'un éphéméride courant : elles servent à un décor, pas à
 * un calendrier.
 */
export const SOLEIL_PAR_MOIS: readonly (readonly [lever: number, coucher: number])[] = [
  [hm(8, 38), hm(17, 21)],
  [hm(7, 57), hm(18, 10)],
  [hm(7, 3), hm(18, 55)],
  [hm(6, 0), hm(19, 42)],
  [hm(5, 9), hm(20, 26)],
  [hm(4, 47), hm(20, 55)],
  [hm(5, 3), hm(20, 49)],
  [hm(5, 44), hm(20, 5)],
  [hm(6, 27), hm(19, 3)],
  [hm(7, 11), hm(18, 1)],
  [hm(7, 59), hm(17, 10)],
  [hm(8, 37), hm(16, 54)],
];

/** Le lever et le coucher du soleil ce jour-là, à l'heure de Paris, en minutes après minuit. */
export function soleilDuJour(instant: Pick<InstantDeParis, "mois" | "jour" | "ete">): { lever: number; coucher: number } {
  // La place du jour entre deux 15 du mois : le 15 janvier vaut 0, le 15 février 1, et ainsi de suite.
  const rang = instant.mois - 1 + (instant.jour - 15) / 30.44;
  const avant = ((Math.floor(rang) % 12) + 12) % 12;
  const apres = (avant + 1) % 12;
  const part = rang - Math.floor(rang);
  const ete = instant.ete ? 60 : 0;
  const entre = (i: 0 | 1) => SOLEIL_PAR_MOIS[avant]![i] + (SOLEIL_PAR_MOIS[apres]![i] - SOLEIL_PAR_MOIS[avant]![i]) * part + ete;
  return { lever: entre(0), coucher: entre(1) };
}

export type Phase = "nuit" | "aube" | "jour" | "crepuscule";

/** Les minutes que dure le passage de la nuit au jour, avant et après le lever ; l'inverse au coucher. */
export const AUBE_AVANT = 45;
export const AUBE_APRES = 30;

/** Un astre dans le ciel : `course` de 0 (il se lève, à gauche) à 1 (il se couche, à droite), `hauteur` de 0 (horizon) à 1. */
export interface Astre {
  sorte: "soleil" | "lune";
  course: number;
  hauteur: number;
}

/**
 * La lumière d'un instant. `jour` : de 0 (nuit noire) à 1 (plein jour). `rougeur` : de 0 à 1, la part des couleurs chaudes
 * du lever et du coucher. Les deux glissent sans marche d'une minute à l'autre (un test le garde).
 */
export interface Lumiere {
  phase: Phase;
  jour: number;
  rougeur: number;
  astre: Astre | null;
  lever: number;
  coucher: number;
}

const borner = (v: number): number => Math.min(1, Math.max(0, v));
/** Une montée douce de 0 à 1 entre `a` et `b`. */
const monter = (a: number, b: number, v: number): number => {
  const t = borner((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function lumiereDuVillage(date: Date): Lumiere {
  const instant = instantDeParis(date);
  const { lever, coucher } = soleilDuJour(instant);
  const t = instant.minutes;
  const jour = monter(lever - AUBE_AVANT, lever + AUBE_APRES, t) * (1 - monter(coucher - AUBE_APRES, coucher + AUBE_AVANT, t));
  const cloche = (centre: number): number => {
    const d = borner(1 - Math.abs(t - centre) / 55);
    return d * d * (3 - 2 * d);
  };
  const rougeur = Math.max(cloche(lever - 8), cloche(coucher + 8));
  let phase: Phase = "nuit";
  if (t >= lever - AUBE_AVANT && t < lever + AUBE_APRES) phase = "aube";
  else if (t >= lever + AUBE_APRES && t < coucher - AUBE_APRES) phase = "jour";
  else if (t >= coucher - AUBE_APRES && t < coucher + AUBE_AVANT) phase = "crepuscule";

  let astre: Astre | null = null;
  const duree = coucher - lever;
  const courseDuSoleil = (t - lever) / duree;
  if (courseDuSoleil > -0.04 && courseDuSoleil < 1.04) {
    astre = { sorte: "soleil", course: courseDuSoleil, hauteur: Math.sin(Math.PI * courseDuSoleil) };
  } else {
    // La lune traverse la nuit, du coucher du soleil à son lever, avec un peu de marge aux deux bouts.
    const debut = coucher + 40;
    const nuit = 1440 - debut + (lever - 40);
    const depuis = t >= debut ? t - debut : t + 1440 - debut;
    const course = depuis / nuit;
    if (course >= 0 && course <= 1) astre = { sorte: "lune", course, hauteur: Math.sin(Math.PI * course) };
  }
  return { phase, jour, rougeur, astre, lever, coucher };
}

/** La nuit pleine et le plein jour, pour un dessin hors de toute heure (essais, planches). */
export const NUIT_PLEINE: Lumiere = { phase: "nuit", jour: 0, rougeur: 0, astre: { sorte: "lune", course: 0.82, hauteur: 0.55 }, lever: hm(7, 0), coucher: hm(19, 0) };
export const PLEIN_JOUR: Lumiere = { phase: "jour", jour: 1, rougeur: 0, astre: { sorte: "soleil", course: 0.3, hauteur: 0.8 }, lever: hm(7, 0), coucher: hm(19, 0) };

/**
 * La clé d'une lumière : deux lumières de même clé donnent le même décor. Le décor ne se redessine que quand elle change,
 * par pas trop petits pour se voir (un centième de lumière, une case d'astre).
 */
export function cleDeLumiere(l: Lumiere, largeur: number): string {
  const astre = l.astre ? `${l.astre.sorte}${Math.round(l.astre.course * largeur)}` : "-";
  return `${Math.round(l.jour * 100)}:${Math.round(l.rougeur * 100)}:${astre}`;
}

/* ---------- Les couleurs ---------- */

type Rvb = readonly [number, number, number];
const lire = (couleur: string): Rvb => [parseInt(couleur.slice(1, 3), 16), parseInt(couleur.slice(3, 5), 16), parseInt(couleur.slice(5, 7), 16)];
const ecrire = (r: number, v: number, b: number): string => "#" + [r, v, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");

/** Le mélange de deux couleurs « #rrggbb » : `part` 0 donne la première, 1 la seconde. */
export function melanger(a: string, b: string, part: number): string {
  const p = borner(part);
  if (p === 0) return a;
  if (p === 1) return b;
  const [ar, av, ab] = lire(a);
  const [br, bv, bb] = lire(b);
  return ecrire(ar + (br - ar) * p, av + (bv - av) * p, ab + (bb - ab) * p);
}

/** Une couleur réchauffée par le soleil bas : plus de rouge, moins de bleu. `force` de 0 à 1. */
export function rechauffer(couleur: string, force: number): string {
  const f = borner(force);
  if (f === 0) return couleur;
  const [r, v, b] = lire(couleur);
  return ecrire(r + (255 - r) * 0.16 * f, v * (1 - 0.03 * f), b * (1 - 0.24 * f));
}

/** Une couleur du dehors à cette lumière : sa teinte de jour, sa teinte de nuit, et la chaleur du lever ou du coucher. */
export function couleurDuDehors(deJour: string, deNuit: string, l: Lumiere): string {
  return rechauffer(melanger(deNuit, deJour, l.jour), l.rougeur);
}

/** Une couleur du dedans : la pièce est éclairée par son feu, à peine plus sombre et plus chaude la nuit. */
export function couleurDuDedans(couleur: string, l: Lumiere): string {
  const [r, v, b] = lire(couleur);
  const ombre = 0.8 + 0.2 * l.jour;
  const nuit = 1 - l.jour;
  return ecrire(r * (ombre + 0.04 * nuit), v * ombre, b * (ombre - 0.06 * nuit));
}

const CIEL_DE_NUIT = ["#0a1230", "#0c1638", "#0f1b42", "#12214c", "#162857"] as const;
const CIEL_DE_JOUR = ["#3b8ad4", "#4f9bdd", "#68ade6", "#84c0ee", "#a6d4f4"] as const;
const CIEL_ROUGI = ["#28285c", "#4b3b7a", "#8c5282", "#d87a62", "#f4b262"] as const;

/** Les cinq bandes du ciel, du haut vers l'horizon, à cette lumière. */
export function cielDuVillage(l: Lumiere): string[] {
  return CIEL_DE_NUIT.map((nuit, i) => melanger(melanger(nuit, CIEL_DE_JOUR[i]!, l.jour), CIEL_ROUGI[i]!, l.rougeur * 0.92));
}
