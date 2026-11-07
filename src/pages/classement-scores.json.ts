import { loadRivals } from "../lib/data";
import { scoreHistory } from "../lib/compare";

/** Les scores relevés chaque jour, lus par le comparateur de la page Nos rivaux. Aucun appel à l'API OpenFront, aucun joueur. */
export function GET() {
  return new Response(JSON.stringify(scoreHistory(loadRivals())), { headers: { "Content-Type": "application/json" } });
}
