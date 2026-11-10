/**
 * Les podiums des joueurs, sur la page Records : les plus longues séries de victoires et le plus de victoires en une journée,
 * parmi les membres avec pseudo encore dans le clan.
 *
 * D'où viennent les parties. La liste officielle des parties de chaque membre, `/public/player/:id/sessions`, 100 par page :
 * celles qui sont publiques, en équipe, hors classé et jouées avec le tag, avec leur résultat. Mesuré le 10 novembre 2026 sur
 * 3 membres et leurs 181 parties sous le tag du 7 au 10 novembre : ce sont exactement les lignes de `/public/player/:id/games`,
 * le détail de `stats.team`, avec le même résultat. Elle compte aussi les parties où le joueur n'est jamais apparu sur la carte :
 * des défaites dont le clan n'a pas de session, que le détail des parties ne montre pas. Elles coupent une série, comme dans le
 * bilan officiel. Mesures : docs/API_AUDIT.md.
 *
 * Des précautions, qui ne peuvent que raccourcir un chiffre. Cette liste range « Humains contre Nations » avec les parties en
 * équipe, sans dire le format, alors que `stats.team` ne la compte pas : une victoire n'est comptée que si le clan a une session
 * pour cette partie, ce qui est toujours le cas quand un Gaulois y gagne. Une victoire seul contre des robots ne compte pas non
 * plus, comme pour les records du clan. Une défaite coupe la série dans tous les cas. Une partie plus récente que les sessions
 * relevées attend le passage suivant.
 *
 * Une journée va de minuit à minuit, à Paris, d'après l'heure de début de la partie. À égalité, le premier à atteindre le chiffre
 * passe devant ; deux joueurs qui l'atteignent dans la même partie partagent la place. Le podium s'arrête à la 5e place, et cite
 * tous ceux qui la partagent. Une série se gagne en équipe, et une grosse journée demande d'abord beaucoup de parties : ce n'est
 * pas un classement de niveau. Mesuré contre le hasard le 10 novembre 2026 : docs/API_AUDIT.md.
 */
import { fmtDate, fmtDay } from "./format";
import type { ApiPlayerSession, StoredMembers, StoredMemberResults, StoredSession } from "./schemas";
import { parisParts } from "./time";

export const PODIUM_SIZE = 5;
/** Une série commence à 2 victoires d'affilée. */
export const MIN_STREAK = 2;

/** Les lignes qui comptent dans `stats.team` : publiques, en équipe, hors classé, avec le tag, gagnées ou perdues, depuis le début de l'archive. */
export function teamRowsOf(rows: readonly ApiPlayerSession[], tag: string, archiveStart: string): [string, string, 0 | 1][] {
  return rows.flatMap((r): [string, string, 0 | 1][] => {
    const counted = r.gameType === "Public" && r.gameMode === "Team" && (r.gameRankedType ?? "unranked") === "unranked" && r.clanTag === tag;
    return counted && typeof r.hasWon === "boolean" && r.gameStart >= archiveStart ? [[r.gameId, r.gameStart, r.hasWon ? 1 : 0]] : [];
  });
}

/** Oublie un membre parti, ou qui a retiré son pseudo : son identifiant ne doit rester nulle part. */
export function forgetInMemberResults(state: StoredMemberResults, current: ReadonlySet<string>): StoredMemberResults {
  const kept = Object.entries(state).filter(([id]) => current.has(id));
  return kept.length === Object.keys(state).length ? state : Object.fromEntries(kept);
}

export interface PodiumPlace {
  /** À égalité parfaite, la même place pour chacun. */
  place: number;
  id: string;
  username: string;
  value: number;
  /** Premier et dernier jour de Paris de la série ; pour une journée, deux fois le même jour. */
  from: string;
  to: string;
}

/** « le 2 nov. 2026 », « du 3 au 4 oct. 2026 », « du 30 oct. au 2 nov. 2026 », et les deux années quand la série passe le 1er janvier. */
export function podiumDates({ from, to }: Pick<PodiumPlace, "from" | "to">): string {
  const date = (day: string) => fmtDate(`${day}T12:00:00Z`);
  if (from === to) return `le ${date(to)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `du ${Number(from.slice(8))} au ${date(to)}`;
  return from.slice(0, 4) === to.slice(0, 4) ? `du ${fmtDay(from)} au ${date(to)}` : `du ${date(from)} au ${date(to)}`;
}

export interface PlayerPodiums {
  streaks: PodiumPlace[];
  days: PodiumPlace[];
  /** Le premier jour de Paris compté, celui de la première partie de l'archive. `null` : rien de lu. */
  since: string | null;
  /** Les membres avec des parties sous le tag dont l'historique n'est pas encore lu jusqu'au bout : les podiums vont encore changer. */
  pending: number;
}

interface Candidate {
  id: string;
  username: string;
  value: number;
  from: string;
  to: string;
  /** L'heure de la partie qui a porté le chiffre à sa valeur : à égalité, le premier à l'atteindre passe devant. */
  reachedAt: string;
}

/** Les heures ISO et les jours se comparent comme du texte, sans les règles d'une langue. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const dayOf = (iso: string) => parisParts(iso).date;

function podium(candidates: readonly Candidate[], size: number): PodiumPlace[] {
  const ahead = (a: Candidate, b: Candidate) => a.value > b.value || (a.value === b.value && a.reachedAt < b.reachedAt);
  return [...candidates]
    .sort((a, b) => b.value - a.value || compare(a.reachedAt, b.reachedAt) || a.username.localeCompare(b.username, "fr"))
    .flatMap((c) => {
      const place = 1 + candidates.filter((o) => ahead(o, c)).length;
      return place <= size ? [{ place, id: c.id, username: c.username, value: c.value, from: c.from, to: c.to }] : [];
    });
}

/**
 * `coveredUntil` : jusqu'où les sessions du clan sont relevées sans trou. Une partie plus récente n'est pas encore comptée :
 * sans sa session, une victoire ne pourrait pas être reconnue.
 */
export function playerPodiums(results: StoredMemberResults, sessions: readonly StoredSession[], members: StoredMembers | null, coveredUntil: string | null, size = PODIUM_SIZE): PlayerPodiums {
  // Seuls les membres encore dans la liste, avec leur pseudo du moment : un anonyme n'a jamais de ligne.
  const named = (members?.members ?? []).flatMap((m) => (m.username && m.publicId ? [{ id: m.publicId, username: m.username, games: m.team ? m.team.wins + m.team.losses : 0 }] : []));
  const pending = named.filter((m) => m.games > 0 && (results[m.id] === undefined || results[m.id]!.older !== null)).length;
  const first = sessions.reduce<string | null>((min, s) => (min === null || s.gameStart < min ? s.gameStart : min), null);
  if (first === null || coveredUntil === null || !named.some((m) => results[m.id])) return { streaks: [], days: [], since: null, pending };
  const byId = new Map(sessions.map((s) => [s.gameId, s]));

  const streaks: Candidate[] = [];
  const days: Candidate[] = [];
  for (const { id, username } of named) {
    const entry = results[id];
    if (!entry) continue;
    const seen = new Set<string>();
    const rows = entry.games
      .filter(([gameId, start]) => {
        if (seen.has(gameId) || start > coveredUntil) return false;
        seen.add(gameId);
        return true;
      })
      .sort(([a, startA], [b, startB]) => compare(startA, startB) || compare(a, b));

    let run = 0;
    let runFrom = "";
    let streak: Candidate | null = null;
    const wins = new Map<string, { value: number; last: string }>();
    for (const [gameId, start, won] of rows) {
      // Une défaite coupe toujours la série : elle compte dans `stats.team`, même sans session du clan ou seul contre des robots.
      if (won === 0) {
        run = 0;
        continue;
      }
      // Une victoire n'est pas comptée sans session du clan (Humains contre Nations), ni seul contre des robots : elle ne coupe rien.
      const session = byId.get(gameId);
      if (!session || session.totalPlayerCount < 2) continue;
      run++;
      if (run === 1) runFrom = start;
      if (!streak || run > streak.value) streak = { id, username, value: run, from: dayOf(runFrom), to: dayOf(start), reachedAt: start };
      const day = dayOf(start);
      const tally = wins.get(day) ?? { value: 0, last: start };
      tally.value++;
      tally.last = start;
      wins.set(day, tally);
    }
    if (streak && streak.value >= MIN_STREAK) streaks.push(streak);

    let best: Candidate | null = null;
    for (const [day, tally] of [...wins].sort(([a], [b]) => compare(a, b))) {
      if (!best || tally.value > best.value) best = { id, username, value: tally.value, from: day, to: day, reachedAt: tally.last };
    }
    if (best) days.push(best);
  }

  return { streaks: podium(streaks, size), days: podium(days, size), since: dayOf(first), pending };
}
