import type { RivalsSnapshot } from "./schemas";
import { winRate, type RankedClan } from "./stats";

/** Les relevés gardés pour la courbe d'écart : la durée de la fenêtre du classement. Au-delà, le fichier grossirait pour une courbe illisible. */
export const COMPARE_DAYS = 90;

/** Les chiffres d'un clan dans la liste officielle, sur ses 90 jours glissants. Aucun n'est recalculé, sauf les deux quotients notés. */
export interface ClanFigures {
  tag: string;
  rank: number;
  score: number;
  games: number;
  wins: number;
  losses: number;
  /** `wins ÷ games`, en %. `null` sans partie. */
  rate: number | null;
  /** Victoires ÷ défaites pondérées, telles que l'API les donne. */
  wlRatio: number;
  /** `playerSessions ÷ games` : joueurs du clan par partie. Égal à la moyenne de `clanPlayerCount` sur les sessions de GAL. `null` sans partie. */
  playersPerGame: number | null;
}

export function clanFigures(clan: RankedClan): ClanFigures {
  return {
    tag: clan.clanTag,
    rank: clan.rank,
    score: clan.weightedWins,
    games: clan.games,
    wins: clan.wins,
    losses: clan.losses,
    rate: winRate(clan.wins, clan.games),
    wlRatio: clan.weightedWLRatio,
    playersPerGame: clan.games > 0 ? clan.playerSessions / clan.games : null,
  };
}

/** Le clan montré d'abord : celui juste au-dessus, sinon celui juste en dessous. `null` : le clan est hors de la liste, ou seul. */
export function firstRival(clans: readonly RankedClan[], tag: string): RankedClan | null {
  const index = clans.findIndex((c) => c.clanTag.toUpperCase() === tag.toUpperCase());
  if (index < 0) return null;
  return clans[index - 1] ?? clans[index + 1] ?? null;
}

export interface ScoreHistory {
  dates: string[];
  /** Le score de chaque clan à chaque date, tags en majuscules. `null` : hors de la liste ce jour-là. */
  scores: Record<string, (number | null)[]>;
}

/** Les scores relevés chaque jour, pour tracer l'écart avec n'importe quel clan de la liste. */
export function scoreHistory(snapshots: readonly RivalsSnapshot[], days = COMPARE_DAYS): ScoreHistory {
  const kept = [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
  const scores: ScoreHistory["scores"] = {};
  kept.forEach((snapshot, i) => {
    for (const { clanTag, weightedWins } of snapshot.clans) {
      const key = clanTag.toUpperCase();
      const line = (scores[key] ??= new Array<number | null>(kept.length).fill(null));
      line[i] = weightedWins;
    }
  });
  return { dates: kept.map((s) => s.date), scores };
}

/** Le score de `mine` moins celui de `theirs`, jour après jour. Un clan absent d'un relevé laisse un trou, pas un zéro. */
export function gapPoints(history: ScoreHistory, mine: string, theirs: string): { date: string; value: number | null }[] {
  const a = history.scores[mine.toUpperCase()];
  const b = history.scores[theirs.toUpperCase()];
  return history.dates.map((date, i) => {
    const x = a?.[i] ?? null;
    const y = b?.[i] ?? null;
    return { date, value: x === null || y === null ? null : x - y };
  });
}
