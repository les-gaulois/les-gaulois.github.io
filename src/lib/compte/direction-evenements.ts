/**
 * Les règles de l'onglet Événements de la Direction : comment une date s'écrit dans la liste, le mot en couleur de ce qui
 * est proche, et ce que la ligne dit des réponses « Je viens ». Rien n'est inventé : tout vient de la date de début donnée
 * par le serveur (`starts_at`), des noms de `list_event_attendance` et de l'heure de la lecture. Les jours se comptent à
 * Paris, comme partout sur le site.
 */
import { fmtInt } from "../format";
import { parisParts } from "../time";

const TZ = "Europe/Paris";
const jourCourt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const jourAvecAnnee = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const heureCourte = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const JOUR_MS = 86_400_000;

/**
 * Le nombre de jours du calendrier de Paris entre la lecture et l'événement : 0 aujourd'hui, 1 demain, négatif s'il est
 * d'hier. Les deux jours sont lus à Paris, puis comparés comme des dates sans heure : un changement d'heure entre les deux
 * (journée de 23 ou de 25 heures) ne décale rien.
 */
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
 * gris « Dans N jours » pour le reste de la semaine. `null` : plus loin, la date seule.
 *
 * Un événement dont l'heure de début est passée dit « Commencé », en gris : le serveur ne donne que les événements à
 * venir, mais une page laissée ouverte garde ceux qui ont commencé depuis, jusqu'à la prochaine lecture. Le serveur ne
 * donne pas d'heure de fin : « Commencé » est le seul mot sûr, même pour un événement d'hier.
 */
export function proximite(startsAt: string, now: Date): Proximite | null {
  if (Date.parse(startsAt) <= now.getTime()) return { ton: "muted", mot: "Commencé" };
  const jours = joursAvant(startsAt, now);
  if (jours === 0) return { ton: "warn", mot: "Aujourd'hui" };
  if (jours === 1) return { ton: "ally", mot: "Demain" };
  if (jours >= 2 && jours <= JOURS_PROCHES) return { ton: "muted", mot: `Dans ${fmtInt(jours)} jours` };
  return null;
}

/** « sam. 21 nov. » et « 21:00 », à Paris. L'année ne s'écrit que si ce n'est pas celle de la lecture, à Paris. */
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

/**
 * Ce que la ligne d'un événement peut dire des réponses « Je viens ».
 * - `attente` : pas encore lu (`undefined`) : la ligne n'en dit rien, et surtout pas « Personne ».
 * - `panne` : la lecture a échoué (`null`) : la ligne n'en dit rien non plus ; le titre de la liste le signale une fois.
 * - `lu` : les noms. `list_event_attendance` ne donne une ligne qu'aux événements où au moins un membre validé vient : un
 *   événement absent d'une réponse lue n'a personne, et c'est une réponse, pas un manque.
 */
export type Presence = { etat: "attente" } | { etat: "panne" } | { etat: "lu"; noms: readonly string[] };

export function presence(attendance: ReadonlyMap<number, readonly string[]> | null | undefined, id: number): Presence {
  if (attendance === undefined) return { etat: "attente" };
  if (attendance === null) return { etat: "panne" };
  return { etat: "lu", noms: attendance.get(id) ?? [] };
}

/** Déplier ou replier les noms d'un événement : un nouvel ensemble, l'ancien n'est pas touché. */
export function basculer(ouverts: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(ouverts);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Les événements dépliés qui sont encore dans la liste : un événement supprimé, ou qui n'est plus donné par le serveur, en
 * sort. Le même ensemble s'il n'y a rien à retirer, pour ne pas redessiner la liste pour rien.
 */
export function garderPresents(ouverts: ReadonlySet<number>, ids: readonly number[]): ReadonlySet<number> {
  if (ouverts.size === 0) return ouverts;
  const presents = new Set(ids);
  const gardes = [...ouverts].filter((id) => presents.has(id));
  return gardes.length === ouverts.size ? ouverts : new Set(gardes);
}
