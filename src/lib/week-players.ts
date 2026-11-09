/**
 * Les joueurs de la semaine : les membres avec pseudo qui ont le plus gagné sous le tag.
 *
 * La mesure est la différence entre deux relevés de `stats.team`, faits chaque lundi au premier passage du robot.
 * Sans relevé du lundi d'avant, le départ est le plus ancien relevé de la semaine gardé dans l'historique Git :
 * la période est alors plus courte, et elle est écrite avec ses dates.
 * Elle compte des victoires, donc d'abord du temps de jeu : ce n'est pas un classement de niveau.
 * Un membre sans relevé de départ (arrivé dans la semaine, pseudo récent) n'est pas compté, faute de point de départ.
 * Un anonyme n'a pas d'identifiant dans les fichiers du site : il ne peut pas être suivi d'une semaine à l'autre.
 *
 * Depuis le 9 novembre 2026, le relevé du lundi garde aussi les parties jouées, et chaque semaine arrêtée note, sur la
 * même période et avec les mêmes règles : ceux qui ont le plus joué, et les paliers de victoires franchis.
 * Une semaine arrêtée avant n'a ni l'un ni l'autre : ce n'est pas zéro.
 */
import { announcedTier } from "./paliers-franchis";
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

/** Un membre et ses parties jouées sur la période, victoires et défaites. */
export interface WeekActive {
  id: string;
  games: number;
}

/** Un palier de victoires franchi sur la période : le plus haut atteint. */
export interface WeekMilestone {
  id: string;
  tier: number;
}

/** Les joueurs d'une semaine, et l'heure du relevé de départ : le lundi, ou plus tard si la période est plus courte. */
export interface WeekTop {
  since: string;
  players: WeekWinner[];
  /** Absent : pas de relevé des parties au départ. */
  active?: WeekActive[] | undefined;
  /** Absent : semaine arrêtée avant que les paliers soient relevés. Vide : aucun palier franchi. */
  milestones?: WeekMilestone[] | undefined;
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

/** Les parties jouées, victoires et défaites, de chaque membre avec pseudo dans ce relevé. Jamais un anonyme. */
export function namedGames(members: StoredMembers): Record<string, number> {
  return Object.fromEntries(members.members.flatMap((m) => (m.username && m.publicId && m.team ? [[m.publicId, m.team.wins + m.team.losses]] : [])));
}

/** Ceux qui ont le plus joué entre deux relevés : même podium, mêmes règles que pour les victoires. */
export function weekActive(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): WeekActive[] {
  const rows = Object.entries(after).flatMap(([id, now]) => {
    const then = before[id];
    if (then === undefined) return [];
    const games = now - then;
    return games > 0 ? [{ id, games }] : [];
  });
  const sorted = rows.sort((a, b) => b.games - a.games || a.id.localeCompare(b.id));
  const last = sorted[WEEK_TOP_SIZE - 1]?.games;
  if (last === undefined) return sorted;
  const kept = sorted.filter((row) => row.games >= last);
  return kept.length <= WEEK_TOP_MAX ? kept : sorted.filter((row) => row.games > last);
}

/**
 * Les paliers de victoires franchis entre deux relevés, ceux que le site annonce (`ANNOUNCED_TIERS`, à partir de 100).
 * Un membre sans relevé de départ n'est pas cité : arrivé dans la semaine, on ne sait pas d'où il part.
 * Du plus haut palier au plus bas : à l'intérieur d'un palier, personne n'est devant personne.
 */
export function weekMilestones(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): WeekMilestone[] {
  return Object.entries(after)
    .flatMap(([id, now]) => {
      const then = before[id];
      const tier = announcedTier(now);
      return then !== undefined && tier > announcedTier(then) ? [{ id, tier }] : [];
    })
    .sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
}

/** Une semaine arrêtée : victoires, paliers et, si les parties étaient relevées au départ comme à l'arrivée, ceux qui ont le plus joué. */
function weekTop(since: string, wins: Readonly<Record<string, number>>, games: Readonly<Record<string, number>> | null, arrival: NonNullable<StoredMemberWeeks["reading"]>): WeekTop {
  return {
    since,
    players: weekWinners(wins, arrival.wins),
    ...(games && arrival.games ? { active: weekActive(games, arrival.games) } : {}),
    milestones: weekMilestones(wins, arrival.wins),
  };
}

/**
 * Tient compte d'une relecture de la liste : seul le premier relevé d'un lundi, à Paris, sert de repère, et d'arrivée.
 * S'il a un repère du lundi d'avant, à quelques heures près, il arrête les joueurs de la semaine écoulée.
 * Sinon, `fallback` peut servir de départ : un relevé fait pendant cette semaine, au moins deux jours avant.
 * Un départ arrivé plus tard le même lundi, après une panne, sert encore, toujours avec le premier relevé du lundi.
 * Si le repère du lundi d'avant n'a pas les parties (relevé fait avant le 9 novembre 2026), `fallback` les donne
 * quand c'est le même relevé, à la même heure : la période reste la même pour les victoires et pour les parties.
 * Renvoie le même objet s'il n'y a rien à changer.
 */
export function nextMemberWeeks(stored: StoredMemberWeeks, members: StoredMembers, fallback: StoredMembers | null = null): StoredMemberWeeks {
  const { date, weekday } = parisParts(members.fetchedAt);
  if (weekday !== 0) return stored;
  const week = addDays(date, -7);
  const kept = stored.reading?.on === date ? stored.reading : null;
  const arrival = kept ?? { on: date, at: members.fetchedAt, wins: namedWins(members), games: namedGames(members) };
  const unchanged = kept ? stored : { ...stored, reading: arrival };
  if (stored.tops[week]) return unchanged;
  const previous = stored.reading?.on === week ? stored.reading : null;
  if (previous && isOneWeekApart(previous.at, arrival.at)) {
    // Les parties relues dans l'historique n'ont pas connu les oublis faits depuis : seuls les membres encore dans le repère comptent,
    // comme pour les victoires.
    const games = previous.games ?? (fallback && fallback.fetchedAt === previous.at ? keptIn(namedGames(fallback), previous.wins) : null);
    return { reading: arrival, tops: { ...stored.tops, [week]: weekTop(previous.at, previous.wins, games, arrival) } };
  }
  // Un repère du lundi d'avant qui ne vaut pas une semaine (passage trop tardif) ne se rattrape pas par l'historique :
  // il y est aussi, et donnerait une semaine trop longue.
  if (!previous && fallback && duringWeek(fallback.fetchedAt, week, arrival.at)) {
    return { reading: arrival, tops: { ...stored.tops, [week]: weekTop(fallback.fetchedAt, namedWins(fallback), namedGames(fallback), arrival) } };
  }
  return unchanged;
}

/** Ne garde d'un relevé que les membres présents dans `reference`. */
const keptIn = (record: Readonly<Record<string, number>>, reference: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(record).filter(([id]) => Object.hasOwn(reference, id)));

/** Un relevé fait pendant la semaine qui commence le lundi `week`, au moins deux jours avant `end`. */
function duringWeek(at: string, week: string, end: string): boolean {
  const day = parisParts(at).date;
  return day >= week && day < addDays(week, 7) && Date.parse(end) - Date.parse(at) >= PARTIAL_MIN_MS;
}

/** Oublie un membre parti, ou qui a retiré son pseudo. Renvoie le même objet s'il n'y a rien à changer. */
export function forgetInMemberWeeks(stored: StoredMemberWeeks, current: ReadonlySet<string>): StoredMemberWeeks {
  const isFormer = (id: string) => !current.has(id);
  const inReading = stored.reading ? [...Object.keys(stored.reading.wins), ...Object.keys(stored.reading.games ?? {})].some(isFormer) : false;
  const inTops = Object.values(stored.tops).some((top) => [...top.players, ...(top.active ?? []), ...(top.milestones ?? [])].some((row) => isFormer(row.id)));
  if (!inReading && !inTops) return stored;
  const keep = <T,>(record: Readonly<Record<string, T>>) => Object.fromEntries(Object.entries(record).filter(([id]) => current.has(id)));
  const present = <T extends { id: string }>(rows: readonly T[]) => rows.filter((row) => current.has(row.id));
  return {
    reading: stored.reading && { ...stored.reading, wins: keep(stored.reading.wins), ...(stored.reading.games ? { games: keep(stored.reading.games) } : {}) },
    tops: Object.fromEntries(
      Object.entries(stored.tops).map(([week, top]) => [
        week,
        { ...top, players: present(top.players), ...(top.active ? { active: present(top.active) } : {}), ...(top.milestones ? { milestones: present(top.milestones) } : {}) },
      ]),
    ),
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
  const names = namesOf(members);
  const named = top.players.flatMap((row) => {
    const username = names.get(row.id);
    return username ? [{ ...row, username }] : [];
  });
  return named.length > 0 ? withPlaces(named) : null;
}

const namesOf = (members: StoredMembers) => new Map(members.members.flatMap((m) => (m.username && m.publicId ? [[m.publicId, m.username] as const] : [])));

export interface WeekActivePlayer extends WeekActive {
  username: string;
  /** 1 pour le premier : deux joueurs à égalité partagent la même place. */
  place: number;
}

/**
 * Ceux qui ont le plus joué une semaine, avec leur pseudo du moment. `null` : pas de relevé des parties cette semaine-là,
 * ou plus personne à citer. Ce n'est pas un zéro.
 */
export function namedWeekActive(top: WeekTop | undefined, members: StoredMembers | null): WeekActivePlayer[] | null {
  if (!top?.active || !members) return null;
  const names = namesOf(members);
  const named = top.active.flatMap((row) => {
    const username = names.get(row.id);
    return username ? [{ ...row, username }] : [];
  });
  return named.length > 0 ? named.map((row) => ({ ...row, place: 1 + named.filter((other) => other.games > row.games).length })) : null;
}

export interface WeekMilestonePlayer extends WeekMilestone {
  username: string;
}

/**
 * Les paliers franchis une semaine, avec le pseudo du moment : du plus haut palier au plus bas, puis par ordre alphabétique.
 * `null` : semaine arrêtée avant que les paliers soient relevés. Une liste vide est un vrai « aucun ».
 */
export function namedWeekMilestones(top: WeekTop | undefined, members: StoredMembers | null): WeekMilestonePlayer[] | null {
  if (!top?.milestones || !members) return null;
  const names = namesOf(members);
  return top.milestones
    .flatMap((row) => {
      const username = names.get(row.id);
      return username ? [{ ...row, username }] : [];
    })
    .sort((a, b) => b.tier - a.tier || a.username.localeCompare(b.username, "fr"));
}

/**
 * Les paliers franchis depuis le relevé du lundi, d'après la liste du moment : la semaine en cours, pas encore arrêtée.
 * `null` : pas de relevé du lundi de cette semaine-là, ou liste absente. Une liste vide est un vrai « aucun pour l'instant ».
 * Deux limites, écrites ici pour qu'on ne les prenne pas pour des oublis : un membre arrivé dans la semaine n'a pas de point
 * de départ, il n'est donc pas cité ; et ce calcul n'a pas la mémoire de `observeMembers` (`paliers-franchis.ts`), si bien
 * qu'un membre repassé sous un palier au relevé du lundi serait cité de nouveau en le refranchissant. Sur les relevés
 * mesurés, `stats.team` n'a jamais baissé.
 */
export function milestonesSinceMonday(reading: StoredMemberWeeks["reading"], members: StoredMembers | null): { since: string; until: string; players: WeekMilestonePlayer[] } | null {
  if (!reading || !members) return null;
  const { date } = parisParts(members.fetchedAt);
  // Le relevé doit être celui du lundi de la semaine de la liste : sinon, la période ne serait pas « cette semaine ».
  if (date < reading.on || date >= addDays(reading.on, 7) || Date.parse(members.fetchedAt) < Date.parse(reading.at)) return null;
  const players = namedWeekMilestones({ since: reading.at, players: [], milestones: weekMilestones(reading.wins, namedWins(members)) }, members) ?? [];
  return { since: reading.at, until: members.fetchedAt, players };
}
