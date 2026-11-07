import { clan } from "../../config/clan";
import { loadGames, loadLeaderboard, loadMeta, loadSessions } from "../lib/data";
import { clanJournal } from "../lib/journal";

/** Le journal entier, lu par la page Dernières parties pour ses filtres. Aucun appel à l'API OpenFront, aucun joueur. */
export function GET() {
  const { rows } = clanJournal({
    sessions: loadSessions(),
    games: loadGames(),
    coveredUntil: loadMeta().sessions.coveredUntil,
    tag: clan.tag,
    officialTags: loadLeaderboard()?.clans.map((c) => c.clanTag) ?? [],
  });
  return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
}
