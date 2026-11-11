/**
 * Ce que les outils du QG lisent des données publiques du site, en un fichier (`/semaine-du-clan.json`) :
 *  - les victoires du clan, semaine par semaine, du lundi au dimanche à Paris : l'objectif et le pronostic de la semaine ;
 *  - les victoires de chaque membre avec pseudo depuis le relevé du lundi : l'onglet « Moi » ;
 *  - le score de chaque clan au classement : l'objectif « un clan à dépasser ».
 * Tout y est déjà public sur le site : rien de privé, aucun anonyme. Le serveur du QG ne garde que les buts et les
 * pronostics ; les chiffres viennent d'ici, avec leur heure.
 */
import type { StoredLeaderboard, StoredMembers, StoredMemberWeeks, StoredSession } from "./schemas";
import { addDays, mondayOf, parisParts, parisStartOf } from "./time";
import { namedWins } from "./week-players";

/** La semaine en cours et les deux d'avant : assez pour le pronostic de la semaine passée. */
export const CLAN_WEEKS_KEPT = 3;

export interface ClanWeek {
  /** Le lundi, AAAA-MM-JJ, à Paris. */
  from: string;
  games: number;
  wins: number;
  /** Toutes ses parties sont relevées, dimanche compris : son total ne bougera plus. */
  complete: boolean;
}

export interface ClanWeekGains {
  /** Le relevé du lundi, point de départ. */
  since: string;
  /** La liste des membres lue en dernier, point d'arrivée. */
  until: string;
  /** Les victoires sous le tag gagnées entre les deux, par identifiant public. Jamais un anonyme. */
  wins: Record<string, number>;
}

export interface ClanScores {
  /** La fin de la période du classement d'OpenFront. */
  end: string;
  scores: { tag: string; score: number }[];
}

export interface ClanWeekFile {
  /** La dernière collecte des parties : la semaine en cours s'arrête là. `null` : aucune collecte réussie. */
  until: string | null;
  weeks: ClanWeek[];
  /** `null` : pas de relevé du lundi pour la semaine de la liste des membres. */
  gains: ClanWeekGains | null;
  /** `null` : aucun classement relevé. */
  clans: ClanScores | null;
}

/**
 * Les victoires du clan par semaine, la plus récente d'abord. Une partie compte pour la semaine où elle a commencé, comme
 * dans la gazette. Une semaine commencée avant le début de l'archive n'est pas donnée : son total serait faux.
 */
export function clanWeeks(sessions: readonly StoredSession[], coveredUntil: string | null, completeThrough: string | null, archiveStart: string, kept = CLAN_WEEKS_KEPT): ClanWeek[] {
  if (!coveredUntil) return [];
  const current = mondayOf(parisParts(coveredUntil).date);
  const weeks: ClanWeek[] = [];
  for (let i = 0; i < kept; i++) {
    const from = addDays(current, -7 * i);
    if (from < archiveStart) break;
    const start = Date.parse(parisStartOf(from));
    const end = Date.parse(parisStartOf(addDays(from, 7)));
    const list = sessions.filter((s) => {
      const at = Date.parse(s.gameStart);
      return at >= start && at < end;
    });
    weeks.push({ from, games: list.length, wins: list.filter((s) => s.hasWon).length, complete: completeThrough !== null && completeThrough >= addDays(from, 6) });
  }
  return weeks;
}

/**
 * Les victoires de chaque membre avec pseudo depuis le relevé du lundi, d'après la liste du moment. Même règle que les
 * paliers de la semaine (`milestonesSinceMonday`) : le relevé doit être celui du lundi de la semaine de la liste. Un membre
 * arrivé dans la semaine n'a pas de point de départ : il n'est pas compté. Une baisse ne se publie pas.
 */
export function memberGainsThisWeek(reading: StoredMemberWeeks["reading"], members: StoredMembers | null): ClanWeekGains | null {
  if (!reading || !members) return null;
  const { date } = parisParts(members.fetchedAt);
  if (date < reading.on || date >= addDays(reading.on, 7) || Date.parse(members.fetchedAt) < Date.parse(reading.at)) return null;
  const wins: Record<string, number> = {};
  for (const [id, now] of Object.entries(namedWins(members))) {
    const then = reading.wins[id];
    if (then !== undefined && now >= then) wins[id] = now - then;
  }
  return { since: reading.at, until: members.fetchedAt, wins };
}

/** Le score de chaque clan du classement relevé, tel qu'OpenFront le calcule. */
export function clanScores(leaderboard: StoredLeaderboard | null): ClanScores | null {
  if (!leaderboard) return null;
  return { end: leaderboard.end, scores: leaderboard.clans.map((c) => ({ tag: c.clanTag, score: c.weightedWins })) };
}
