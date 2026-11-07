import { worldTerritory } from "../../lib/carte-monde";
import { loadClanMapFilm } from "../../lib/data";

/** La part de GAL sur la carte officielle, lue par la page autonome /carte-monde/. `null` : pas de données. */
export function GET() {
  return new Response(JSON.stringify(worldTerritory(loadClanMapFilm())), { headers: { "Content-Type": "application/json" } });
}
