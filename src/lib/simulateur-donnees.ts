/**
 * Les données du simulateur de classement (`/simulateur.json`), préparées au build à partir des données publiques du dépôt :
 * les parties de GAL encore dans la fenêtre du classement, son rythme par taille de groupe, le score et le rythme de chaque
 * clan du classement officiel, et la fiabilité de la méthode, mesurée sur l'archive de GAL. Aucun joueur, aucun tag hors du
 * classement officiel. Les calculs sont dans `simulateur.ts`.
 */
import type { RivalsSnapshot, StoredLeaderboard, StoredSession } from "./schemas";
import { DAY_MS, WINDOW_DAYS, groupOf, projectScore, rateBetween, scoreAt, steadyGain, type GroupSize } from "./simulateur";
import { parisParts } from "./time";

/** Les deux rythmes proposés au simulateur : la semaine passée, ou le mois. */
export const PACE_WINDOWS = [7, 30] as const;
/** Les horizons de la mesure de fiabilité. */
export const BACKTEST_HORIZONS = [7, 14, 30, 60, 90] as const;
/** Le rythme d'un autre clan se lit entre deux relevés distants d'un à sept jours et demi. */
const RIVAL_SPAN_MIN_DAYS = 0.9;
const RIVAL_SPAN_MAX_DAYS = 7.5;
/** Le rythme des autres clans se lit entre deux relevés à 7 jours d'écart, comme dans le simulateur. */
const BACKTEST_RIVAL_DAYS = 7;

export interface SizeTotals {
  games: number;
  wins: number;
  /** Points bruts des victoires, `max(score, 0)`. */
  points: number;
}

export interface PaceWindow {
  days: number;
  from: string;
  to: string;
  sizes: Record<GroupSize, SizeTotals>;
}

export interface SimClan {
  tag: string;
  score: number;
  /** Points bruts par jour, lus entre deux relevés du classement. `null` : pas de relevé assez ancien. */
  rate: number | null;
  /** L'écart entre ces deux relevés, en jours. */
  rateDays: number | null;
}

export interface ErrStats {
  /** Écart relatif moyen, en valeur absolue (0,01 = 1 %). */
  mean: number;
  /** Écart relatif que 9 projections sur 10 n'ont pas dépassé. */
  p90: number;
  samples: number;
}

export interface BacktestRow {
  horizon: number;
  /** Le rythme de départ : celui des 7 ou des 30 jours qui précèdent chaque départ. */
  pace: number;
  /** La méthode de GAL : ses parties exactes, puis le rythme de départ. */
  gal: ErrStats | null;
  /** La méthode des autres clans : deux relevés de score à 7 jours d'écart, sans les parties. Mesurée au rythme de 7 jours seulement. */
  clans: ErrStats | null;
  /** Le premier départ mesuré, AAAA-MM-JJ à Paris. `null` : aucun. */
  since: string | null;
}

export interface SimData {
  /** La fin de la période du classement d'OpenFront : l'instant des scores. */
  asOf: string;
  tag: string;
  /** Le score officiel de GAL et son rang. `null` : GAL n'est pas au classement. */
  official: number | null;
  rank: number | null;
  /** Le même score, refait à partir des parties au même instant : le contrôle de la méthode. */
  model: number | null;
  /** Les parties gagnées de GAL encore dans la fenêtre, jusqu'à la dernière collecte : [instant en secondes, points bruts]. */
  points: [number, number][];
  /** La dernière collecte des parties. */
  coveredUntil: string | null;
  pace: PaceWindow[];
  /** Tout le classement officiel, dans son ordre. */
  clans: SimClan[];
  backtest: BacktestRow[];
  /** La justesse du rythme lu sans les parties (méthode des autres clans), comparé au vrai rythme de GAL sur la même semaine. */
  rateCheck: ErrStats | null;
  /** La meilleure journée de GAL dans l'archive, en points bruts, à Paris : un repère de ce qui est faisable. */
  bestDay: { date: string; points: number; games: number } | null;
}

const emptySizes = (): Record<GroupSize, SizeTotals> => ({ "1": { games: 0, wins: 0, points: 0 }, "2": { games: 0, wins: 0, points: 0 }, "3": { games: 0, wins: 0, points: 0 }, "4": { games: 0, wins: 0, points: 0 } });
const round = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Les parties gagnées encore dans la fenêtre à `asOf`, et celles relevées après : [instant en secondes, points bruts]. */
export function galPoints(sessions: readonly StoredSession[], asOf: number): [number, number][] {
  return sessions
    .flatMap((s) => {
      const t = Date.parse(s.gameStart);
      return s.score > 0 && t > asOf - WINDOW_DAYS * DAY_MS ? [[Math.round(t / 1000), round(s.score)] as [number, number]] : [];
    })
    .sort((a, b) => a[0] - b[0]);
}

/** Le rythme de GAL par taille de groupe sur les `days` jours qui finissent à `until`. */
export function paceWindow(sessions: readonly StoredSession[], until: number, days: number): PaceWindow {
  const from = until - days * DAY_MS;
  const sizes = emptySizes();
  for (const s of sessions) {
    const t = Date.parse(s.gameStart);
    if (t <= from || t > until) continue;
    const row = sizes[groupOf(s.clanPlayerCount)];
    row.games++;
    if (s.hasWon) row.wins++;
    row.points = round(row.points + Math.max(s.score, 0));
  }
  return { days, from: new Date(from).toISOString(), to: new Date(until).toISOString(), sizes };
}

/**
 * Le score et le rythme de chaque clan du classement officiel. Le rythme se lit entre le classement d'aujourd'hui et le plus
 * ancien relevé quotidien des sept derniers jours et demi (au moins un jour d'écart).
 */
export function simClans(leaderboard: StoredLeaderboard, snapshots: readonly RivalsSnapshot[]): SimClan[] {
  const asOf = Date.parse(leaderboard.end);
  const older = snapshots
    .filter((s) => {
      const age = (asOf - Date.parse(s.leaderboardEnd)) / DAY_MS;
      return age >= RIVAL_SPAN_MIN_DAYS && age <= RIVAL_SPAN_MAX_DAYS;
    })
    .sort((a, b) => Date.parse(a.leaderboardEnd) - Date.parse(b.leaderboardEnd))[0];
  const span = older ? (asOf - Date.parse(older.leaderboardEnd)) / DAY_MS : null;
  return leaderboard.clans.map((c) => {
    const before = older?.clans.find((o) => o.clanTag === c.clanTag);
    const rate = before && span !== null ? rateBetween(before.weightedWins, c.weightedWins, span) : null;
    return { tag: c.clanTag, score: c.weightedWins, rate: rate === null ? null : round(rate), rateDays: rate === null || span === null ? null : round(span, 2) };
  });
}

function stats(errors: number[]): ErrStats | null {
  if (errors.length === 0) return null;
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const p90 = abs[Math.min(abs.length - 1, Math.ceil(abs.length * 0.9) - 1)] ?? 0;
  return { mean: round(abs.reduce((a, b) => a + b, 0) / abs.length), p90: round(p90), samples: abs.length };
}

/**
 * La fiabilité des deux méthodes, mesurée sur l'archive de GAL : pour chaque jour où sa fenêtre de 90 jours et le rythme de
 * départ sont entièrement archivés, à l'heure de `asOf`, on projette son score à chaque horizon au rythme des 7 ou des 30 jours
 * précédents, puis on le compare au score refait à partir des parties de ce jour-là. La méthode refait le score officiel à
 * 0,03 % près. La marge ne vaut que pour ce scénario-là : le rythme mesuré, sans rien changer.
 */
export function backtest(sessions: readonly StoredSession[], archiveStart: string, asOf: number): { rows: BacktestRow[]; rateCheck: ErrStats | null } {
  const all = sessions.flatMap((s) => (s.score > 0 ? [[Math.round(Date.parse(s.gameStart) / 1000), s.score] as [number, number]] : []));
  const upTo = (t: number) => all.filter(([at]) => at * 1000 <= t);
  const archived = Date.parse(`${archiveStart}T00:00:00.000Z`);
  const truth = new Map<number, number>();
  const truthAt = (t: number) => {
    let value = truth.get(t);
    if (value === undefined) {
      value = scoreAt(upTo(t), t);
      truth.set(t, value);
    }
    return value;
  };
  const rateErrors: number[] = [];
  const rows = PACE_WINDOWS.flatMap((pace) => {
    const first = archived + (WINDOW_DAYS + Math.max(pace, BACKTEST_RIVAL_DAYS) + 1) * DAY_MS;
    return BACKTEST_HORIZONS.map((horizon) => {
      const galErrors: number[] = [];
      const clanErrors: number[] = [];
      let earliest: number | null = null;
      for (let start = asOf - horizon * DAY_MS; start >= first; start -= DAY_MS) {
        const known = upTo(start);
        const now = truthAt(start);
        const later = truthAt(start + horizon * DAY_MS);
        if (later <= 0 || now <= 0) continue;
        const measured = known.filter(([at]) => at * 1000 > start - pace * DAY_MS).reduce((sum, [, p]) => sum + p, 0) / pace;
        const galProjection = scoreAt(known, start + horizon * DAY_MS) + measured * steadyGain(horizon);
        galErrors.push((galProjection - later) / later);
        earliest = start;
        if (pace !== BACKTEST_RIVAL_DAYS) continue;
        const rate = rateBetween(truthAt(start - BACKTEST_RIVAL_DAYS * DAY_MS), now, BACKTEST_RIVAL_DAYS);
        if (rate !== null) clanErrors.push((projectScore(now, rate, horizon) - later) / later);
        if (rate !== null && horizon === BACKTEST_HORIZONS[0] && measured > 0) rateErrors.push((rate - measured) / measured);
      }
      return { horizon, pace, gal: stats(galErrors), clans: stats(clanErrors), since: earliest === null ? null : parisParts(new Date(earliest)).date };
    });
  });
  return { rows, rateCheck: stats(rateErrors) };
}

/** La journée de Paris où GAL a gagné le plus de points bruts, et ses parties ce jour-là. */
export function bestDay(sessions: readonly StoredSession[]): SimData["bestDay"] {
  const days = new Map<string, { points: number; games: number }>();
  for (const s of sessions) {
    const date = parisParts(s.gameStart).date;
    const day = days.get(date) ?? { points: 0, games: 0 };
    day.points += Math.max(s.score, 0);
    day.games++;
    days.set(date, day);
  }
  let best: SimData["bestDay"] = null;
  for (const [date, day] of days) if (!best || day.points > best.points) best = { date, points: round(day.points, 2), games: day.games };
  return best;
}

/** Tout le fichier du simulateur. `null` sans classement relevé. */
export function simData({
  leaderboard,
  sessions,
  snapshots,
  coveredUntil,
  archiveStart,
  tag,
}: {
  leaderboard: StoredLeaderboard | null;
  sessions: readonly StoredSession[];
  snapshots: readonly RivalsSnapshot[];
  coveredUntil: string | null;
  archiveStart: string;
  tag: string;
}): SimData | null {
  if (!leaderboard) return null;
  const asOf = Date.parse(leaderboard.end);
  const index = leaderboard.clans.findIndex((c) => c.clanTag === tag);
  const points = galPoints(sessions, asOf);
  const until = coveredUntil ? Date.parse(coveredUntil) : asOf;
  const measured = backtest(sessions, archiveStart, asOf);
  return {
    asOf: leaderboard.end,
    tag,
    official: index === -1 ? null : (leaderboard.clans[index]?.weightedWins ?? null),
    rank: index === -1 ? null : index + 1,
    model: round(scoreAt(points, asOf), 2),
    points,
    coveredUntil,
    pace: PACE_WINDOWS.map((days) => paceWindow(sessions, until, days)),
    clans: simClans(leaderboard, snapshots),
    backtest: measured.rows,
    rateCheck: measured.rateCheck,
    bestDay: bestDay(sessions),
  };
}

