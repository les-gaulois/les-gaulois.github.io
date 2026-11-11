/**
 * Envoie les nouveautés du site sur le salon de la gazette, lancé par la GitHub Action après la collecte.
 *   npm run nouveautes:envoyer
 * Avec DISCORD_WEBHOOK_GAZETTE dans l'environnement. Sans lui, ne fait rien, et ne note rien.
 * Les entrées déjà passées et le jour du dernier message sont notés dans data/nouveautes-envoi.json :
 * voir src/lib/nouveautes-discord.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { loadNouveautes } from "../src/lib/data";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { NewsState, newsPass, sendNews } from "../src/lib/nouveautes-discord";
import { parseNoted } from "../src/lib/salon-discord";

const STATE_FILE = "data/nouveautes-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Un copier-coller peut laisser une espace ou un retour à la ligne autour du lien.
const link = process.env["DISCORD_WEBHOOK_GAZETTE"]?.trim();
if (!link) {
  console.log("Pas de DISCORD_WEBHOOK_GAZETTE : aucune nouveauté envoyée.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Nouveautés : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseNoted(NewsState, readText(STATE_FILE), "les entrées du moment servent de nouveau départ");
  if (warning) console.log(`::warning::Nouveautés : ${warning}.`);
  const result = await newsPass({
    stored,
    entries: loadNouveautes(),
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    send: (entries) => sendNews({ link, entries, siteUrl: clan.links.site, fetch, log: console.log }),
    log: console.log,
  });
  if (result.state) writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postText` ne laisse rien sortir de cet appel.
  console.log(`::warning::Nouveautés : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
