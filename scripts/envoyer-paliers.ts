/**
 * Envoie les paliers franchis sur le salon de la gazette, en image, lancé par la GitHub Action après la collecte.
 *   npm run paliers:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien, et ne note rien.
 * Le palier de chaque membre avec pseudo à la dernière relecture, les paliers en attente et le jour du dernier message
 * sont notés dans data/paliers-envoi.json : voir src/lib/paliers-franchis.ts.
 * Le Gaulois du village de ceux qui sont cités, après leur nom ou derrière leur pastille : lus au serveur au moment de
 * dessiner l'image, une fois. Sans lecture, l'image part comme avant. Voir src/lib/gaulois-envois.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { loadMembers } from "../src/lib/data";
import { avecOuSansGaulois, gauloisDuPassage } from "../src/lib/gaulois-envois";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { parseMilestoneState } from "../src/lib/paliers-franchis";
import { milestonePass, sendMilestones } from "../src/lib/paliers-franchis-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/paliers-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Paliers : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucun palier envoyé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Paliers : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseMilestoneState(readText(STATE_FILE));
  if (warning) console.log(`::warning::Paliers : ${warning}.`);
  const gauloisDe = gauloisDuPassage();
  const result = await milestonePass({
    stored,
    members: loadMembers(),
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    send: (players, pending) =>
      sendMilestones({
        link,
        players,
        pending,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (p, period) => {
          const { GazetteFonts, renderGazetteCard } = await import("../src/lib/gazette-image");
          const { milestoneCard, milestoneImageAlt } = await import("../src/lib/paliers-franchis-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          // Un caractère qu'aucune police ne sait dessiner devient « ? » sur l'image ; sa description garde le pseudo entier.
          const drawn = p.map((player) => ({ ...player, username: fonts.drawable(player.username, "strong") }));
          const gaulois = await gauloisDe(p.map((player) => player.id));
          const png = await avecOuSansGaulois(gaulois, (g) => renderGazetteCard(milestoneCard(drawn, period, clan.tag, clan.links.site, fonts.width, g), fonts, root));
          return { png, alt: milestoneImageAlt(p, period, clan.tag) };
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
  console.log(`::warning::Paliers : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
