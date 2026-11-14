import { etatDuMondeDuSite } from "../../lib/village/monde-site";

/**
 * L'état du monde du village (`src/lib/village/monde-etat.ts`) : le chantier et le grand feu, au dernier relevé des
 * sessions du clan, calculés à la construction du site. La commande /feu du robot le lit (`supabase/functions/code-discord/feu.ts`).
 * Rien de plus que ce que la page `/village` montre : des totaux du clan, aucun joueur.
 */
export function GET() {
  return new Response(JSON.stringify(etatDuMondeDuSite()), { headers: { "Content-Type": "application/json" } });
}
