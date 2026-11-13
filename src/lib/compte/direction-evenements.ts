/**
 * Les règles de l'onglet Événements de la Direction : comment une date s'écrit dans la liste, et le mot en couleur de ce
 * qui est proche. Rien n'est inventé : tout vient de la date de début donnée par le serveur (`starts_at`) et de l'heure
 * de la lecture. Les jours se comptent à Paris, comme partout sur le site.
 */
import { fmtInt } from "../format";
import { parisParts } from "../time";

const TZ = "Europe/Paris";
const jourCourt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const jourAvecAnnee = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const heureCourte = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const JOUR_MS = 86_400_000;

/** Le nombre de jours du calendrier de Paris entre la lecture et l'événement : 0 aujourd'hui, 1 demain, négatif s'il est d'hier. */
export function joursAvant(startsAt: string, now: Date): number {
  const jour = Date.parse(`${parisParts(startsAt).date}T00:00:00.000Z`);
  const aujourdhui = Date.parse(`${parisParts(now).date}T00:00:00.000Z`);
  return Math.round((jour - aujourdhui) / JOUR_MS);
}

/** Les couleurs de l'onglet, celles des pièces communes de la Direction (`DirTon`). */
export type TonEvenement = "warn" | "ally" | "muted";
export interface Proximite {
  ton: TonEvenement;
  mot: string;
}

/** Jusqu'à ce nombre de jours, la ligne dit « Dans N jours ». Au-delà, la date suffit. */
export const JOURS_PROCHES = 6;

/**
 * Le mot de ce qui est proche, avec sa couleur : jaune « Aujourd'hui » (à regarder), bleu « Demain » (une information),
 * gris « Dans N jours » pour le reste de la semaine. `null` : plus loin, ou déjà d'hier : la date seule.
 */
export function proximite(startsAt: string, now: Date): Proximite | null {
  const jours = joursAvant(startsAt, now);
  if (jours === 0) return { ton: "warn", mot: "Aujourd'hui" };
  if (jours === 1) return { ton: "ally", mot: "Demain" };
  if (jours >= 2 && jours <= JOURS_PROCHES) return { ton: "muted", mot: `Dans ${jours} jours` };
  return null;
}

/** « sam. 21 nov. » et « 21:00 », à Paris. L'année ne s'écrit que si ce n'est pas celle de la lecture. */
export function jourEtHeure(startsAt: string, now: Date): { jour: string; heure: string } {
  const date = new Date(startsAt);
  const memeAnnee = parisParts(startsAt).date.slice(0, 4) === parisParts(now).date.slice(0, 4);
  return { jour: (memeAnnee ? jourCourt : jourAvecAnnee).format(date), heure: heureCourte.format(date) };
}

/** « 1 vient », « 12 viennent ». Zéro : « Personne », qui est une réponse lue, pas une absence de données. */
export function viennentLabel(n: number): string {
  if (n < 1) return "Personne";
  return n === 1 ? "1 vient" : `${fmtInt(n)} viennent`;
}
