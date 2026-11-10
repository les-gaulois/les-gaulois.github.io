import type { StoredSession } from "./schemas";
import { addDays, parisParts } from "./time";

/** Même fenêtre que le classement officiel, pour décrire le clan tel qu'il joue aujourd'hui. */
export const RESULTS_DAYS = 90;

/** Le nom d'un format : « 2 » signifie deux équipes, « Duos » reste « Duos ». */
export const formatLabel = (key: string) => (/^\d+$/.test(key) ? `${key} équipes` : key);

/** Les `RESULTS_DAYS` derniers jours couverts, en jours de Paris, et le test d'appartenance d'une partie. */
export function resultsWindow(coveredUntil: string) {
  const to = parisParts(coveredUntil).date;
  const from = addDays(to, -(RESULTS_DAYS - 1));
  const includes = (gameStart: string) => {
    const day = parisParts(gameStart).date;
    return day >= from && day <= to;
  };
  return { from, to, includes };
}

export interface ClanRecords {
  streak: { wins: number; endedAt: string };
  bestDay: { date: string; wins: number; games: number };
  biggestGroup: { players: number; at: string };
  mostTeams: { teams: number; players: number; at: string };
}

/**
 * Records du clan sur l'archive. Une partie jouée seul contre des robots ne compte pas : elle fausserait
 * les records. Aucun record de score : ces parties y arrivaient en tête.
 * Le jeu place tout un clan dans une seule équipe : `clanPlayerCount` compte donc des coéquipiers, y compris ceux partis avant la fin.
 * `null` sans victoire : pas de records à montrer.
 */
export function clanRecords(sessions: readonly StoredSession[]): ClanRecords | null {
  const played = sessions.filter((s) => s.totalPlayerCount >= 2).sort((a, b) => a.gameStart.localeCompare(b.gameStart));
  const wins = played.filter((s) => s.hasWon);
  const first = wins[0];
  if (!first) return null;

  let current = 0;
  let streak = { wins: 0, endedAt: first.gameStart };
  const days = new Map<string, { wins: number; games: number }>();
  for (const s of played) {
    current = s.hasWon ? current + 1 : 0;
    if (current > streak.wins) streak = { wins: current, endedAt: s.gameStart };
    const date = parisParts(s.gameStart).date;
    const day = days.get(date) ?? { wins: 0, games: 0 };
    day.games++;
    if (s.hasWon) day.wins++;
    days.set(date, day);
  }

  let bestDay = { date: parisParts(first.gameStart).date, wins: 0, games: 0 };
  for (const [date, day] of days) {
    if (day.wins > bestDay.wins) bestDay = { date, ...day };
  }

  let group = first;
  let teams = first;
  for (const s of wins) {
    if (s.clanPlayerCount > group.clanPlayerCount) group = s;
    if (s.numTeams > teams.numTeams) teams = s;
  }
  return {
    streak,
    bestDay,
    biggestGroup: { players: group.clanPlayerCount, at: group.gameStart },
    mostTeams: { teams: teams.numTeams, players: teams.totalPlayerCount, at: teams.gameStart },
  };
}
