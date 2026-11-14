/**
 * Où et quand est le Gaulois au moment de /gaulois (demande du pilote, 14 novembre 2026 : « plus de 12 fonds différents en
 * fonction de la journée et où se trouve la personne au moment de /gaulois »). Les règles sont celles de la place du
 * village, recopiées ici parce que la fonction code-discord ne lit que son dossier :
 * - le lieu : `lieuDuGaulois` de `src/lib/village/vie.ts` ;
 * - le moment de la journée et l'astre du ciel : `lumiereDuVillage` de `src/lib/village/lumiere.ts`, à l'heure de Paris.
 * Un test (tests/unit/gaulois-scene.test.ts) garde ces copies identiques aux originaux : une règle changée là-bas doit
 * l'être ici aussi. Calculs purs : aucune lecture du réseau.
 */

export type Lieu = "place" | "taverne" | "reunion" | "bataille" | "maisons";
export type Phase = "nuit" | "aube" | "jour" | "crepuscule";

/** Les cinq lieux de la place, et les quatre moments de la journée : 20 fonds pour /gaulois. */
export const LIEUX: readonly Lieu[] = ["place", "taverne", "reunion", "bataille", "maisons"];
export const PHASES: readonly Phase[] = ["aube", "jour", "crepuscule", "nuit"];

/** Où il est, en mots, pour qui ne voit pas l'image. */
/** Où il est et ce qui l'y met, en mots : rien n'est du temps réel (une partie finie, le vocal du dernier relevé). */
export const LIEUX_EN_MOTS: Readonly<Record<Lieu, string>> = {
  place: "sur la place du village",
  taverne: "à la taverne, après sa dernière partie",
  reunion: "dans la salle de réunion, en vocal au dernier relevé",
  bataille: "au champ de bataille, pour sa dernière partie",
  maisons: "dans sa maison",
};
export const PHASES_EN_MOTS: Readonly<Record<Phase, string>> = { aube: "à l'aube", jour: "en plein jour", crepuscule: "au crépuscule", nuit: "la nuit" };

/** Un astre dans le ciel : `course` de 0 (il se lève, à gauche) à 1 (il se couche, à droite), `hauteur` de 0 (horizon) à 1. */
export interface Astre {
  sorte: "soleil" | "lune";
  course: number;
  hauteur: number;
}

/** Le moment de la journée à Paris et l'astre du ciel. */
export interface Moment {
  phase: Phase;
  astre: Astre | null;
}

/** La scène de l'image : le lieu du Gaulois et le moment de la journée. */
export interface Scene {
  lieu: Lieu;
  moment: Moment;
}

/* ---------- La lumière, copie de src/lib/village/lumiere.ts ---------- */

const lecteur = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface InstantDeParis {
  mois: number;
  jour: number;
  heure: number;
  minutes: number;
  ete: boolean;
}

function instantDeParis(date: Date): InstantDeParis {
  const p: Record<string, number> = {};
  for (const { type, value } of lecteur.formatToParts(date)) if (type !== "literal") p[type] = Number(value);
  const annee = p["year"] ?? 1970;
  const mois = p["month"] ?? 1;
  const jour = p["day"] ?? 1;
  const heure = p["hour"] ?? 0;
  const minute = p["minute"] ?? 0;
  const seconde = p["second"] ?? 0;
  const ecart = Math.round((Date.UTC(annee, mois - 1, jour, heure, minute, seconde) - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  return { mois, jour, heure, minutes: heure * 60 + minute + seconde / 60, ete: ecart >= 120 };
}

const hm = (heure: number, minute: number): number => heure * 60 + minute;

/** Le lever et le coucher du soleil à Paris au 15 de chaque mois, à l'heure d'hiver (la table de lumiere.ts). */
const SOLEIL_PAR_MOIS: readonly (readonly [number, number])[] = [
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

function soleilDuJour(instant: InstantDeParis): { lever: number; coucher: number } {
  const rang = instant.mois - 1 + (instant.jour - 15) / 30.44;
  const avant = ((Math.floor(rang) % 12) + 12) % 12;
  const apres = (avant + 1) % 12;
  const part = rang - Math.floor(rang);
  const ete = instant.ete ? 60 : 0;
  const entre = (i: 0 | 1) => SOLEIL_PAR_MOIS[avant]![i] + (SOLEIL_PAR_MOIS[apres]![i] - SOLEIL_PAR_MOIS[avant]![i]) * part + ete;
  return { lever: entre(0), coucher: entre(1) };
}

const AUBE_AVANT = 45;
const AUBE_APRES = 30;

/** Le moment de la journée et l'astre du ciel, à Paris, comme le décor de la place. */
export function momentDeParis(date: Date): Moment {
  const instant = instantDeParis(date);
  const { lever, coucher } = soleilDuJour(instant);
  const t = instant.minutes;
  let phase: Phase = "nuit";
  if (t >= lever - AUBE_AVANT && t < lever + AUBE_APRES) phase = "aube";
  else if (t >= lever + AUBE_APRES && t < coucher - AUBE_APRES) phase = "jour";
  else if (t >= coucher - AUBE_APRES && t < coucher + AUBE_AVANT) phase = "crepuscule";
  let astre: Astre | null = null;
  const courseDuSoleil = (t - lever) / (coucher - lever);
  if (courseDuSoleil > -0.04 && courseDuSoleil < 1.04) {
    astre = { sorte: "soleil", course: courseDuSoleil, hauteur: Math.sin(Math.PI * courseDuSoleil) };
  } else {
    const debut = coucher + 40;
    const nuit = 1440 - debut + (lever - 40);
    const depuis = t >= debut ? t - debut : t + 1440 - debut;
    const course = depuis / nuit;
    if (course >= 0 && course <= 1) astre = { sorte: "lune", course, hauteur: Math.sin(Math.PI * course) };
  }
  return { phase, astre };
}

/* ---------- Le lieu, copie de lieuDuGaulois (src/lib/village/vie.ts) ---------- */

const BATAILLE_MINUTES = 45;
const TAVERNE_MINUTES = 180;
const RELEVE_VALABLE_MINUTES = 180;
const NUIT_DE = 23;
const NUIT_A = 7;

const instant = (texte: unknown): Date | null => {
  if (typeof texte !== "string" || texte === "") return null;
  const date = new Date(texte);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Le lieu du Gaulois, d'après les faits du serveur (`discord_gaulois`) : sa dernière partie qui a rapporté des points au
 * clan (`partie_le`, seulement pour un pseudo public), son état vocal (`vocal`) et l'heure du relevé (`releve`). La
 * première règle qui convient l'emporte : bataille (partie de moins de 45 minutes), taverne (de 45 minutes à 3 heures),
 * salle de réunion (en vocal), maisons (de 23 heures à 7 heures à Paris), sinon la place.
 */
export function lieuDuGaulois(faits: { partie_le?: unknown; vocal?: unknown }, maintenant: Date, releve?: unknown): Lieu {
  const partie = instant(faits.partie_le);
  if (partie) {
    const minutes = (maintenant.getTime() - partie.getTime()) / 60_000;
    if (minutes >= 0 && minutes < BATAILLE_MINUTES) return "bataille";
    if (minutes >= BATAILLE_MINUTES && minutes < TAVERNE_MINUTES) return "taverne";
  }
  if (faits.vocal === true) {
    const date = instant(releve);
    const age = date ? (maintenant.getTime() - date.getTime()) / 60_000 : 0;
    if (age < RELEVE_VALABLE_MINUTES) return "reunion";
  }
  const { heure } = instantDeParis(maintenant);
  if (heure >= NUIT_DE || heure < NUIT_A) return "maisons";
  return "place";
}

/** La scène de /gaulois à cet instant, d'après la réponse du serveur. */
export const sceneDuGaulois = (faits: { partie_le?: unknown; vocal?: unknown; releve?: unknown }, maintenant: Date): Scene => ({
  lieu: lieuDuGaulois(faits, maintenant, faits.releve),
  moment: momentDeParis(maintenant),
});
