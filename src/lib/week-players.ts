/**
 * Les joueurs de la semaine : les membres avec pseudo qui ont le plus gagné sous le tag.
 *
 * La mesure est la différence entre deux relevés de `stats.team`, faits chaque lundi au premier passage du robot.
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

const WEEK_MS = 7 * 86_400_000;
/** Un passage retardé est toléré, et le changement d'heure aussi. Au-delà, ce ne serait plus une semaine. */
const WEEK_TOLERANCE_MS = 6 * 3_600_000;
const isOneWeekApart = (from: string, to: string) => Math.abs(Date.parse(to) - Date.parse(from) - WEEK_MS) <= WEEK_TOLERANCE_MS;

export interface WeekWinner {
  id: string;
  wins: number;
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
 * Tient compte d'une relecture de la liste : seul le premier relevé d'un lundi, à Paris, sert de repère.
 * S'il a un repère du lundi d'avant, à quelques heures près, il arrête aussi les joueurs de la semaine écoulée.
 * Renvoie le même objet s'il n'y a rien à changer.
 */
export function nextMemberWeeks(stored: StoredMemberWeeks, members: StoredMembers): StoredMemberWeeks {
  const { date, weekday } = parisParts(members.fetchedAt);
  if (weekday !== 0 || stored.reading?.on === date) return stored;
  const wins = namedWins(members);
  const reading = { on: date, at: members.fetchedAt, wins };
  const previous = stored.reading;
  if (previous?.on !== addDays(date, -7) || !isOneWeekApart(previous.at, members.fetchedAt)) return { ...stored, reading };
  return { reading, tops: { ...stored.tops, [previous.on]: weekWinners(previous.wins, wins) } };
}

/** Oublie un membre parti, ou qui a retiré son pseudo. Renvoie le même objet s'il n'y a rien à changer. */
export function forgetInMemberWeeks(stored: StoredMemberWeeks, current: ReadonlySet<string>): StoredMemberWeeks {
  const isFormer = (id: string) => !current.has(id);
  const inReading = stored.reading ? Object.keys(stored.reading.wins).some(isFormer) : false;
  const inTops = Object.values(stored.tops).some((rows) => rows.some((row) => isFormer(row.id)));
  if (!inReading && !inTops) return stored;
  return {
    reading: stored.reading && { ...stored.reading, wins: Object.fromEntries(Object.entries(stored.reading.wins).filter(([id]) => current.has(id))) },
    tops: Object.fromEntries(Object.entries(stored.tops).map(([week, rows]) => [week, rows.filter((row) => current.has(row.id))])),
  };
}

function withPlaces(rows: readonly (WeekWinner & { username: string })[]): WeekPlayer[] {
  return rows.map((row) => ({ ...row, place: 1 + rows.filter((other) => other.wins > row.wins).length }));
}

/**
 * Donne un nom aux joueurs d'une semaine, d'après la liste actuelle : celui qui a quitté le clan ou retiré son pseudo n'y est plus.
 * `null` : pas de relevé pour cette semaine-là, ou plus personne à citer. Ce n'est pas un zéro.
 */
export function namedWeekPlayers(rows: readonly WeekWinner[] | undefined, members: StoredMembers | null): WeekPlayer[] | null {
  if (!rows || !members) return null;
  const names = new Map(members.members.flatMap((m) => (m.username && m.publicId ? [[m.publicId, m.username] as const] : [])));
  const named = rows.flatMap((row) => {
    const username = names.get(row.id);
    return username ? [{ ...row, username }] : [];
  });
  return named.length > 0 ? withPlaces(named) : null;
}

/** Les membres avec pseudo qui ont le plus de victoires depuis le début, comme sur la page de la carte. */
export function allTimePlayers(members: StoredMembers | null): WeekPlayer[] {
  const rows = (members?.members ?? []).flatMap((m) => (m.username && m.publicId && m.team && m.team.wins > 0 ? [{ id: m.publicId, username: m.username, wins: m.team.wins }] : []));
  return withPlaces(podium(rows.sort((a, b) => b.wins - a.wins || a.id.localeCompare(b.id))));
}
