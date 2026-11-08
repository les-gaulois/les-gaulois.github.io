/**
 * Les chiffres du jour que le navigateur garde pour « Depuis votre dernière visite ».
 * L'accueil et la page Carte écrivent le même relevé : l'un ne doit jamais faire mentir l'autre.
 */
import { clan } from "../../config/clan";
import { loadClanMapFilm, loadHistory, loadLeaderboard, loadMembers, loadMemberWeeks, loadMeta, loadSessions, loadTerritoryReadings } from "./data";
import { gazetteEditions } from "./gazette";
import { findClan, withOfficialRanks } from "./stats";
import type { VisitSnapshot } from "./visite";

/** Le relevé du jour, ou `null` tant que la collecte n'a jamais tourné. */
export function loadVisitSnapshot(): VisitSnapshot | null {
  const meta = loadMeta();
  if (!meta.lastRunAt) return null;
  const leaderboard = loadLeaderboard();
  const me = findClan(leaderboard ? withOfficialRanks(leaderboard.clans) : [], clan.tag);
  const sessions = loadSessions();
  const members = loadMembers();
  const film = loadClanMapFilm();
  const onMap = film?.galSummary ?? null;
  const gazette =
    gazetteEditions({
      sessions,
      history: loadHistory(),
      territory: loadTerritoryReadings(),
      weekTops: loadMemberWeeks().tops,
      members,
      archiveStart: clan.archiveStart,
      completeThrough: meta.sessions.completeThrough,
    })[0] ?? null;
  return {
    at: meta.lastRunAt,
    rank: me?.rank ?? null,
    score: me?.weightedWins ?? null,
    games: sessions.length,
    wins: sessions.filter((s) => s.hasWon).length,
    pixels: onMap?.pixels ?? null,
    mapRank: onMap?.rank ?? null,
    mapAt: film?.frames.at(-1)?.at ?? null,
    members: members?.total ?? null,
    gazette: gazette?.from ?? null,
  };
}
