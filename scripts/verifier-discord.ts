/**
 * Vérifie le lien Discord sans rien envoyer, une seule fois par nouveau lien, lancé par la GitHub Action.
 *   npm run discord:verifier
 * Avec DISCORD_WEBHOOK_GAZETTE dans l'environnement. Sans lui, ne fait rien. La date de création du webhook vérifié
 * est notée dans data/discord-lien.json : voir src/lib/discord-check.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checkWebhookLink, LinkCheckState } from "../src/lib/discord-check";
import { isWebhookUrl } from "../src/lib/gazette-discord";

const STATE_FILE = "data/discord-lien.json";

function readState(): LinkCheckState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const parsed = LinkCheckState.safeParse(JSON.parse(readFileSync(STATE_FILE, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    // Illisible : le lien est simplement vérifié de nouveau.
    return null;
  }
}

// Un copier-coller peut laisser une espace ou un retour à la ligne autour du lien.
const link = process.env["DISCORD_WEBHOOK_GAZETTE"]?.trim();
if (!link) {
  console.log("Pas de DISCORD_WEBHOOK_GAZETTE : rien à vérifier.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Lien Discord : il n'a pas la forme attendue. Vérifiez le secret DISCORD_WEBHOOK_GAZETTE.");
  process.exit(1);
}

const result = await checkWebhookLink({ link, stored: readState(), now: new Date(), fetch, log: console.log });
if (result.state) writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
if (!result.ok) process.exitCode = 1;
