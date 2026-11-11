/**
 * Vérifie le lien Discord sans rien envoyer, une seule fois par nouveau lien, lancé par la GitHub Action.
 *   npm run discord:verifier
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien. La date de création du webhook vérifié
 * est notée dans data/discord-lien.json : voir src/lib/discord-check.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checkWebhookLink, LinkCheckState } from "../src/lib/discord-check";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { salonLink } from "../src/lib/salon-lien";

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

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Lien Discord : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : rien à vérifier.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Lien Discord : il n'a pas la forme attendue. Vérifiez le lien du salon des nouvelles dans Direction > Discord, ou le secret DISCORD_WEBHOOK_GAZETTE.");
  process.exit(1);
}

const result = await checkWebhookLink({ link, stored: readState(), now: new Date(), fetch, log: console.log });
if (result.state) writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
if (!result.ok) process.exitCode = 1;
