/**
 * Les joueurs de la semaine : les membres avec pseudo qui ont le plus gagné sous le tag.
 *
 * La mesure est la différence entre deux relevés de `stats.team`, faits chaque lundi au premier passage du robot.
 * Sans relevé du lundi d'avant, le départ est le plus ancien relevé de la semaine gardé dans l'historique Git :
 * la période est alors plus courte, et elle est écrite avec ses dates.
 * Elle compte des victoires, donc d'abord du temps de jeu : ce n'est pas un classement de niveau.
 * Un membre sans relevé de départ (arrivé dans la semaine, pseudo récent) n'est pas compté, faute de point de départ.
 * Un anonyme n'a pas d'identifiant dans les fichiers du site : il ne peut pas être suivi d'une semaine à l'autre.
 */
import type { StoredMembers, StoredMemberWeeks } from "./schemas";
import { addDays, parisParts } from "./time";

/** Le podium, et au plus tant de lignes si des joueurs sont à égalité. */
export const WEEK_TOP_SIZE = 3;
export const WEEK_TOP_MAX = 5;

export const EMPTY_MEMBER_WEEKS: StoredMemberWeeks = { reading: null, tops: {} };

const HOUR_MS = 3_600_000;
const WEEK_MS = 168 * HOUR_MS;
/** Un passage retardé est toléré, et le changement d'heure aussi. Au-delà, ce ne serait plus une semaine. */
const WEEK_TOLERANCE_MS = 6 * HOUR_MS;
/** Une période plus courte que deux jours ne dirait presque rien de la semaine : pas de podium. */
const PARTIAL_MIN_MS = 48 * HOUR_MS;
const isOneWeekApart = (from: string, to: string) => Math.abs(Date.parse(to) - Date.parse(from) - WEEK_MS) <= WEEK_TOLERANCE_MS;

export interface WeekWinner {
  id: string;
  wins: number;
}

/** Les joueurs d'une semaine, et l'heure du relevé de départ : le lundi, ou plus tard si la période est plus courte. */
export interface WeekTop {
  since: string;
  players: WeekWinner[];
}

export interface WeekPlayer extends WeekWinner {
  username: string;
  /** 1 pour le premier : deux joueurs à égalité partagent la même place. */
  place: number;
}

/** Garde le podium. Une égalité à la dernière place garde tout le monde, ou personne s'il y aurait trop de lignes. */
function podium<T extends { wins: number }>(sorted: readonly T[]): T[] {
  const last = sorted[WEEK_TOP_SIZE - 1]?.wins;
  if (last === undefined) return [...sorted];
  const kept = sorted.filter((row) => row.wins >= last);
  return kept.length <= WEEK_TOP_MAX ? kept : sorted.filter((row) => row.wins > last);
}

/** Les plus grandes différences de victoires entre deux relevés. Une baisse ou une absence de différence ne compte pas. */
export function weekWinners(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): WeekWinner[] {
  const rows = Object.entries(after).flatMap(([id, now]) => {
    const then = before[id];
    if (then === undefined) return [];
    const wins = now - then;
    return wins > 0 ? [{ id, wins }] : [];
  });
  return podium(rows.sort((a, b) => b.wins - a.wins || a.id.localeCompare(b.id)));
}

/** Les victoires de chaque membre avec pseudo dans ce relevé. Jamais un anonyme. */
export function namedWins(members: StoredMembers): Record<string, number> {
  return Object.fromEntries(members.members.flatMap((m) => (m.username && m.publicId && m.team ? [[m.publicId, m.team.wins]] : [])));
}

/**
 * Tient compte d'une relecture de la liste : seul le premier relevé d'un lundi, à Paris, sert de repère, et d'arrivée.
 * S'il a un repère du lundi d'avant, à quelques heures près, il arrête les joueurs de la semaine écoulée.
 * Sinon, `fallback` peut servir de départ : un relevé fait pendant cette semaine, au moins deux jours avant.
 * Un départ arrivé plus tard le même lundi, après une panne, sert encore, toujours avec le premier relevé du lundi.
 * Renvoie le même objet s'il n'y a rien à changer.
 */
export function nextMemberWeeks(stored: StoredMemberWeeks, members: StoredMembers, fallback: StoredMembers | null = null): StoredMemberWeeks {
  const { date, weekday } = parisParts(members.fetchedAt);
  if (weekday !== 0) return stored;
  const week = addDays(date, -7);
  const kept = stored.reading?.on === date ? stored.reading : null;
  const arrival = kept ?? { on: date, at: members.fetchedAt, wins: namedWins(members) };
  const unchanged = kept ? stored : { ...stored, reading: arrival };
  if (stored.tops[week]) return unchanged;
  const previous = stored.reading?.on === week ? stored.reading : null;
  if (previous && isOneWeekApart(previous.at, arrival.at)) {
    return { reading: arrival, tops: { ...stored.tops, [week]: { since: previous.at, players: weekWinners(previous.wins, arrival.wins) } } };
  }
  if (fallback && duringWeek(fallback.fetchedAt, week, arrival.at)) {
    return { reading: arrival, tops: { ...stored.tops, [week]: { since: fallback.fetchedAt, players: weekWinners(namedWins(fallback), arrival.wins) } } };
  }
  return unchanged;
}

/** Un relevé fait pendant la semaine qui commence le lundi `week`, au moins deux jours avant `end`. */
function duringWeek(at: string, week: string, end: string): boolean {
  const day = parisParts(at).date;
  return day >= week && day < addDays(week, 7) && Date.parse(end) - Date.parse(at) >= PARTIAL_MIN_MS;
}

/** Oublie un membre parti, ou qui a retiré son pseudo. Renvoie le même objet s'il n'y a rien à changer. */
export function forgetInMemberWeeks(stored: StoredMemberWeeks, current: ReadonlySet<string>): StoredMemberWeeks {
  const isFormer = (id: string) => !current.has(id);
  const inReading = stored.reading ? Object.keys(stored.reading.wins).some(isFormer) : false;
  const inTops = Object.values(stored.tops).some((top) => top.players.some((row) => isFormer(row.id)));
  if (!inReading && !inTops) return stored;
  return {
    reading: stored.reading && { ...stored.reading, wins: Object.fromEntries(Object.entries(stored.reading.wins).filter(([id]) => current.has(id))) },
    tops: Object.fromEntries(Object.entries(stored.tops).map(([week, top]) => [week, { ...top, players: top.players.filter((row) => current.has(row.id)) }])),
  };
}

function withPlaces(rows: readonly (WeekWinner & { username: string })[]): WeekPlayer[] {
  return rows.map((row) => ({ ...row, place: 1 + rows.filter((other) => other.wins > row.wins).length }));
}

/**
 * Donne un nom aux joueurs d'une semaine, d'après la liste actuelle : celui qui a quitté le clan ou retiré son pseudo n'y est plus.
 * `null` : pas de relevé pour cette semaine-là, ou plus personne à citer. Ce n'est pas un zéro.
 */
export function namedWeekPlayers(top: WeekTop | undefined, members: StoredMembers | null): WeekPlayer[] | null {
  if (!top || !members) return null;
  const names = new Map(members.members.flatMap((m) => (m.username && m.publicId ? [[m.publicId, m.username] as const] : [])));
  const named = top.players.flatMap((row) => {
    const username = names.get(row.id);
    return username ? [{ ...row, username }] : [];
  });
  return named.length > 0 ? withPlaces(named) : null;
}
