import { clan } from "../../config/clan";
import { loadMembers } from "../lib/data";
import { ficheImageVersion, ficheIndex } from "../lib/fiches-discord";

/**
 * Les fiches que les commandes /fiche et /moi de Discord peuvent montrer, lues par la fonction `code-discord`
 * (src/lib/fiches-discord.ts). Rien de plus que les pages des membres : un pseudo, l'identifiant de sa fiche, la description
 * de son image et sa version. Sans liste, `listedAt` vaut `null`, et la commande dit que les fiches ne répondent pas.
 */
export function GET() {
  const list = loadMembers();
  const index = list ? ficheIndex(list, clan.tag, ficheImageVersion) : { listedAt: null, fiches: [] };
  return new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json" } });
}
