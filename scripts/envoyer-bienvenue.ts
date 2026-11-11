/**
 * Envoie la bienvenue aux nouveaux membres sur le salon de la gazette, lancé par la GitHub Action après la collecte.
 *   npm run bienvenue:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien, et ne note rien.
 * Le relevé de la liste jusqu'auquel les arrivées sont passées et le jour du dernier message sont notés dans
 * data/bienvenue-envoi.json : voir src/lib/bienvenue-discord.ts. Aucun identifiant de membre n'y est écrit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { sendWelcome, welcomePass, WelcomeState } from "../src/lib/bienvenue-discord";
import { loadMembers } from "../src/lib/data";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { parseNoted } from "../src/lib/salon-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/bienvenue-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Bienvenue : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucune bienvenue envoyée.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Bienvenue : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseNoted(WelcomeState, readText(STATE_FILE), "la liste du moment sert de nouveau départ");
  if (warning) console.log(`::warning::Bienvenue : ${warning}.`);
  const result = await welcomePass({
    stored,
    members: loadMembers(),
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    send: (arrivals) =>
      sendWelcome({
        link,
        arrivals,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (a, allNamed) => {
          const { GazetteFonts, renderGazetteCard } = await import("../src/lib/gazette-image");
          const { welcomeCard, welcomeImageAlt } = await import("../src/lib/bienvenue-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          return { png: await renderGazetteCard(welcomeCard(a, clan.tag, clan.links.site, fonts.width, allNamed), fonts, root), alt: welcomeImageAlt(a, clan.tag) };
        },
        tag: clan.tag,
        siteUrl: clan.links.site,
        fetch,
        log: console.log,
      }),
    log: console.log,
  });
  if (result.state) writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postWithImage` ne laisse rien sortir de cet appel.
  console.log(`::warning::Bienvenue : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
