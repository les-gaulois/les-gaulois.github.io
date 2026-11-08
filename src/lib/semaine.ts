/**
 * La semaine en cours de la gazette : les parties depuis le lundi à Paris jusqu'à la dernière collecte,
 * et la semaine d'avant arrêtée à la même heure. Une semaine finie devient une édition (`gazette.ts`).
 */
import { fmtCount, fmtDayAndTime, fmtPct, fmtPoints } from "./format";
import type { WeekTotals } from "./gazette";
import type { StoredSession } from "./schemas";
import { winRate } from "./stats";
import { addDays, mondayOf, parisParts, parisStartOf } from "./time";

export interface CurrentWeek {
  /** Le lundi et le dimanche de la semaine, AAAA-MM-JJ. */
  from: string;
  to: string;
  /** La dernière collecte : les chiffres s'arrêtent là. */
  until: string;
  totals: WeekTotals;
  /** La semaine d'avant, arrêtée au même moment de la semaine. `null` : elle précède l'archive. */
  previous: WeekTotals | null;
}

const totalsBetween = (sessions: readonly StoredSession[], start: number, end: number): WeekTotals => {
  const list = sessions.filter((s) => {
    const at = Date.parse(s.gameStart);
    return at >= start && at <= end;
  });
  const wins = list.filter((s) => s.hasWon).length;
  return { games: list.length, wins, winRate: winRate(wins, list.length) };
};

const clock = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/**
 * Le même moment de la semaine d'avant, à l'heure de Paris : même jour de semaine, même heure au cadran, changement d'heure compris.
 * Une heure qui existe deux fois la nuit du changement prend la première.
 */
function sameTimeLastWeek(iso: string): number {
  const at = new Date(iso);
  const day = addDays(parisParts(at).date, -7);
  const parts: Record<string, string> = {};
  for (const { type, value } of clock.formatToParts(at)) parts[type] = value;
  const wall = Date.parse(`${day}T${parts["hour"]}:${parts["minute"]}:${parts["second"]}.000Z`);
  for (const hours of [1, 2, 0]) {
    const candidate = wall - hours * 3_600_000;
    const seen = parisParts(new Date(candidate));
    if (seen.date === day && seen.hour === Number(parts["hour"])) return candidate;
  }
  return wall - 3_600_000;
}

/** `null` tant qu'aucune collecte n'a réussi. */
export function currentWeek(sessions: readonly StoredSession[], coveredUntil: string | null, archiveStart: string): CurrentWeek | null {
  if (!coveredUntil) return null;
  const from = mondayOf(parisParts(coveredUntil).date);
  const start = Date.parse(parisStartOf(from));
  const until = Date.parse(coveredUntil);
  const previousFrom = addDays(from, -7);
  const previousStart = Date.parse(parisStartOf(previousFrom));
  return {
    from,
    to: addDays(from, 6),
    until: coveredUntil,
    totals: totalsBetween(sessions, start, until),
    previous: previousFrom >= archiveStart ? totalsBetween(sessions, previousStart, sameTimeLastWeek(coveredUntil)) : null,
  };
}

/** Le chapeau : des chiffres arrêtés à une heure dite, jamais présentés comme la semaine entière. */
export function currentWeekLead({ until, totals }: CurrentWeek): string {
  const when = `Jusqu'au ${fmtDayAndTime(until)}`;
  if (totals.games === 0) return `${when} : aucune partie enregistrée pour l'instant.`;
  return `${when} : ${fmtCount(totals.games, "partie")} et ${fmtCount(totals.wins, "victoire")}, soit ${fmtPct(totals.winRate)}.`;
}

/** La semaine d'avant, au même moment : la seule comparaison honnête d'une semaine qui n'est pas finie. `null` : rien à comparer. */
export function currentWeekComparison({ totals, previous }: CurrentWeek): string | null {
  if (!previous) return null;
  if (previous.games === 0) return totals.games === 0 ? null : "Aucune partie à la même heure la semaine d'avant.";
  const games = `La semaine d'avant à la même heure : ${fmtCount(previous.games, "partie")}, ${fmtPct(previous.winRate)}.`;
  if (totals.winRate === null || previous.winRate === null) return games;
  const shown = (rate: number) => Math.round(rate * 10) / 10;
  return `${games} Taux de victoire : ${fmtPoints(shown(totals.winRate) - shown(previous.winRate))}.`;
}
