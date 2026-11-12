import { existsSync } from "node:fs";
import { join } from "node:path";
import { clan } from "../../config/clan";
import { loadMembers } from "../lib/data";
import { ficheIndex } from "../lib/fiches-discord";

/**
 * Les fiches que la commande /fiche de Discord peut montrer, lues par la fonction `code-discord` (src/lib/fiches-discord.ts).
 * Rien de plus que les pages des membres : un pseudo, l'identifiant de sa fiche, la description de son image. Sans liste,
 * `listedAt` vaut `null`, et la commande dit que les fiches ne répondent pas.
 */
export function GET() {
  const list = loadMembers();
  const index = list ? ficheIndex(list, clan.tag, (id) => existsSync(join("public", "generated", "fiches", `${id}.png`))) : { listedAt: null, fiches: [] };
  return new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json" } });
}
