import { clanEntry, commandImagesForBuild, commandIndex, extraOfBuild } from "../lib/commandes-discord";
import { guideChapters } from "../lib/guide-collection";

/**
 * L'index des commandes du robot sur Discord, lu par la fonction `code-discord` (src/lib/commandes-discord.ts) : pour
 * chaque commande, l'adresse de son image, sa description et la page où mène son bouton. Rien de plus que ce que le site
 * montre déjà.
 */
export async function GET() {
  const { images } = await commandImagesForBuild(await guideChapters());
  const index = commandIndex(images, clanEntry(), new Date().toISOString(), extraOfBuild);
  return new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json" } });
}
