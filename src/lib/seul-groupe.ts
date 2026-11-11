/**
 * Seul ou en groupe : les parties d'un membre avec pseudo, sous le tag, rangées selon le nombre de Gaulois dans la partie et
 * selon le format. Ses parties et leur résultat viennent de sa liste officielle (`/public/player/:id/sessions`, les lignes de
 * `stats.team`, voir `podiums.ts`) ; le nombre de Gaulois et le format, de la session du clan pour la même partie. Ce nombre
 * compte tous les joueurs sous le tag présents, avec ou sans pseudo. Aucun point par joueur : l'API ne les donne pas.
 */
import { formatLabel } from "./results";
import type { StoredMemberResult, StoredSession } from "./schemas";
import { GROUP_SIZES, groupOf, type GroupSize } from "./simulateur";

/** En dessous, un taux n'est pas mis en phrase : trop peu de parties pour dire quelque chose. */
export const SENTENCE_MIN_GAMES = 20;
/** Les formats montrés, au plus, du plus joué au moins joué. */
export const FORMATS_SHOWN = 6;

export interface WinLoss {
  games: number;
  wins: number;
}

export interface GroupStats {
  bySize: Record<GroupSize, WinLoss>;
  /** Du plus joué au moins joué : « Trios », « 2 équipes »… */
  byFormat: (WinLoss & { format: string })[];
  /** Les parties de sa liste retrouvées dans les sessions du clan. */
  matched: number;
  /** Toutes les parties de sa liste. */
  total: number;
  /** La première et la dernière partie retrouvées. */
  from: string;
  to: string;
  /** Sa liste est lue jusqu'au début de l'archive. */
  complete: boolean;
}

/** Les sessions du clan, par partie. */
export const sessionsById = (sessions: readonly StoredSession[]): Map<string, StoredSession> => new Map(sessions.map((s) => [s.gameId, s]));

/** Le bilan d'un membre. `null` : pas de liste, ou aucune de ses parties dans les sessions du clan. */
export function groupStats(result: StoredMemberResult | undefined, byId: ReadonlyMap<string, StoredSession>): GroupStats | null {
  if (!result) return null;
  const bySize = Object.fromEntries(GROUP_SIZES.map((s) => [s, { games: 0, wins: 0 }])) as Record<GroupSize, WinLoss>;
  const formats = new Map<string, WinLoss>();
  let matched = 0;
  let from = "";
  let to = "";
  for (const [gameId, start, won] of result.games) {
    const session = byId.get(gameId);
    if (!session) continue;
    matched++;
    if (from === "" || start < from) from = start;
    if (to === "" || start > to) to = start;
    const size = bySize[groupOf(session.clanPlayerCount)];
    size.games++;
    size.wins += won;
    const label = session.playerTeams ? formatLabel(session.playerTeams) : null;
    if (label) {
      const row = formats.get(label) ?? { games: 0, wins: 0 };
      row.games++;
      row.wins += won;
      formats.set(label, row);
    }
  }
  if (matched === 0) return null;
  const byFormat = [...formats]
    .map(([format, row]) => ({ format, ...row }))
    .sort((a, b) => b.games - a.games || a.format.localeCompare(b.format, "fr"))
    .slice(0, FORMATS_SHOWN);
  return { bySize, byFormat, matched, total: result.games.length, from, to, complete: result.older === null };
}

/** Le taux de victoire, de 0 à 100. `null` sans partie : « — », jamais 0. */
export const winRateOf = (row: WinLoss): number | null => (row.games > 0 ? (100 * row.wins) / row.games : null);

/**
 * La phrase du bilan, quand seul et en groupe ont chacun assez de parties : « Avec d'autres Gaulois, X gagne 58 % de ses
 * parties ; seul, 21 %. » `null` sinon.
 */
export function groupSentence(stats: GroupStats, pseudo: string, fmtPct: (n: number) => string): string | null {
  const solo = stats.bySize["1"];
  const group = (["2", "3", "4"] as const).reduce((sum, s) => ({ games: sum.games + stats.bySize[s].games, wins: sum.wins + stats.bySize[s].wins }), { games: 0, wins: 0 });
  if (solo.games < SENTENCE_MIN_GAMES || group.games < SENTENCE_MIN_GAMES) return null;
  return `Avec d'autres Gaulois, ${pseudo} gagne ${fmtPct(winRateOf(group) ?? 0)} de ses parties ; seul, ${fmtPct(winRateOf(solo) ?? 0)}.`;
}
