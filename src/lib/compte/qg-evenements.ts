/**
 * L'agenda de l'onglet Événements du QG : la date d'un événement en colonne, « quand c'est » en un mot, la série, et les
 * filtres « Tous » et « Je viens ». Tout se compte au jour de Paris, comme le reste du site : un événement à 00:30 demain
 * est « Demain », même s'il est dans une heure.
 */
import { parisParts } from "../time";
import { seriesNote, type EventSeries } from "./news";

const TZ = "Europe/Paris";
const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const MINUTE = 60_000;
const DAY = 86_400_000;

/** La couleur d'un état, celle des pastilles (`DirTon` de `direction-kit.tsx`). */
export type AgendaTon = "ok" | "warn" | "danger" | "ally" | "muted";

export interface AgendaDate {
  /** « sam. 14 nov. », avec l'année si ce n'est pas celle d'aujourd'hui à Paris. */
  day: string;
  /** « 21:00 », à Paris. */
  time: string;
}

/** Le jour et l'heure d'un événement, à Paris, pour la colonne de l'agenda. `null` : date illisible. */
export function agendaDate(startsAt: string, now: number): AgendaDate | null {
  const at = Date.parse(startsAt);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null;
  const date = new Date(at);
  const sameYear = parisParts(date).date.slice(0, 4) === parisParts(new Date(now)).date.slice(0, 4);
  return { day: (sameYear ? dayFmt : dayYearFmt).format(date), time: timeFmt.format(date) };
}

/**
 * Le nombre de jours du calendrier de Paris entre maintenant et un instant : 0 aujourd'hui, 1 demain, négatif hier.
 * `NaN` si l'un des deux instants est illisible.
 */
export function parisDaysUntil(at: number, now: number): number {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return Number.NaN;
  const day = (ms: number) => Date.parse(`${parisParts(new Date(ms)).date}T00:00:00.000Z`);
  return Math.round((day(at) - day(now)) / DAY);
}

export interface AgendaWhen {
  ton: AgendaTon;
  label: string;
}

/**
 * Quand c'est, en un mot et une couleur : « Commencé » (gris) une fois l'heure de début passée, « Dans 5 min » (jaune) à
 * moins d'une heure, « Aujourd'hui » (jaune), « Demain » (bleu), « Dans 3 jours » (gris). `null` : date illisible.
 * « Commencé » ne dit que l'heure de début passée : le serveur ne donne pas de durée, rien ne dit « en cours » ni « fini ».
 */
export function agendaWhen(startsAt: string, now: number): AgendaWhen | null {
  const at = Date.parse(startsAt);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null;
  if (at <= now) return { ton: "muted", label: "Commencé" };
  const minutes = Math.ceil((at - now) / MINUTE);
  if (minutes < 60) return { ton: "warn", label: `Dans ${minutes} min` };
  const days = parisDaysUntil(at, now);
  if (days <= 0) return { ton: "warn", label: "Aujourd'hui" };
  if (days === 1) return { ton: "ally", label: "Demain" };
  return { ton: "muted", label: `Dans ${days} jours` };
}

/**
 * La phrase d'une série, « Encore 4 rendez-vous, jusqu'au 5 déc. 2026 », et le repère « Se répète » qui va avec. `null` :
 * pas de série, plus qu'un rendez-vous, ou date du dernier illisible (`seriesNote` la formaterait, et tout le QG tomberait).
 */
export function agendaSeries(series: EventSeries | null | undefined): string | null {
  if (!series || !Number.isFinite(Date.parse(series.until))) return null;
  return seriesNote(series);
}

/** À partir de ce nombre d'événements, la barre des filtres paraît. Le serveur en donne dix au plus (`get_qg`). */
export const AGENDA_FILTERS_FROM = 6;

/** « Tous » les événements, ou seulement ceux où « Je viens ». */
export type AgendaFilter = "all" | "mine";

type Answered = { id: number; mine: boolean };

/** Les événements où je viens, d'après le serveur : le nombre du filtre « Je viens ». */
export const agendaMine = (events: readonly Answered[]): number => events.filter((event) => event.mine).length;

/**
 * Les lignes montrées. Sous « Je viens » : celles où je viens, et celles gardées (`held`), dont la présence vient d'être
 * retirée sous ce filtre, pour que le bouton qu'on vient d'actionner ne disparaisse pas sous le doigt ni sous le focus.
 */
export function agendaShown<E extends Answered>(events: readonly E[], filter: AgendaFilter, held: readonly number[]): readonly E[] {
  if (filter !== "mine") return events;
  return events.filter((event) => event.mine || held.includes(event.id));
}

/**
 * Les lignes à garder après un clic sur « Je viens » : sous le filtre « Je viens », retirer sa présence garde la ligne.
 * Rend le même tableau quand rien ne change.
 */
export function agendaHold(held: readonly number[], event: Answered, filter: AgendaFilter): readonly number[] {
  if (filter !== "mine" || !event.mine || held.includes(event.id)) return held;
  return [...held, event.id];
}
