import { clan } from "../../config/clan";
import { loadLeaderboard, loadMembers, loadMemberWeeks, loadMeta, loadSessions } from "../lib/data";
import { clanScores, clanWeeks, memberGainsThisWeek, type ClanWeekFile } from "../lib/semaine-du-clan";

/**
 * Les chiffres publics que lisent les outils du QG : victoires du clan par semaine, victoires des membres depuis le relevé
 * du lundi, scores du classement des clans. Aucun appel à l'API OpenFront, aucun anonyme. Voir `src/lib/semaine-du-clan.ts`.
 */
export function GET() {
  const meta = loadMeta();
  const file: ClanWeekFile = {
    until: meta.sessions.coveredUntil,
    weeks: clanWeeks(loadSessions(), meta.sessions.coveredUntil, meta.sessions.completeThrough, clan.archiveStart),
    gains: memberGainsThisWeek(loadMemberWeeks().reading, loadMembers()),
    clans: clanScores(loadLeaderboard()),
  };
  return new Response(JSON.stringify(file), { headers: { "Content-Type": "application/json" } });
}
