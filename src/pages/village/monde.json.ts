import { etatDuMondeDuSite } from "../../lib/village/monde-site";

/**
 * L'état du monde du village (`src/lib/village/monde-etat.ts`) : le chantier et le grand feu, au dernier relevé des
 * sessions du clan, calculés à la construction du site. La commande /feu du robot le lit (`supabase/functions/code-discord/feu.ts`).
 * Des totaux du clan, aucun joueur. La page `/village` ne les montre plus depuis le retrait du monde du village (15 novembre
 * 2026) : ce fichier ne reste que pour /feu.
 */
export function GET() {
  return new Response(JSON.stringify(etatDuMondeDuSite()), { headers: { "Content-Type": "application/json" } });
}
