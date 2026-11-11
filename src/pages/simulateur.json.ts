import { clan } from "../../config/clan";
import { loadLeaderboard, loadMeta, loadRivals, loadSessions } from "../lib/data";
import { simData } from "../lib/simulateur-donnees";

/**
 * Les données du simulateur de classement du QG : les parties gagnées de GAL encore dans la fenêtre du classement, son rythme
 * par taille de groupe, le score et le rythme de chaque clan du classement officiel, et la fiabilité mesurée de la méthode.
 * Aucun appel à l'API OpenFront, aucun joueur. Voir `src/lib/simulateur.ts`.
 */
export function GET() {
  const data = simData({
    leaderboard: loadLeaderboard(),
    sessions: loadSessions(),
    snapshots: loadRivals(),
    coveredUntil: loadMeta().sessions.coveredUntil,
    archiveStart: clan.archiveStart,
    tag: clan.tag,
  });
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}
