/**
 * Envoie les plus actifs sur le salon de la gazette, lancé par la GitHub Action après la collecte.
 *   npm run actifs:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien, et ne note rien.
 * Le relevé de départ (parties et victoires de chaque membre avec pseudo) et le jour du dernier message sont notés dans
 * data/actifs-envoi.json : voir src/lib/actifs.ts. La collecte en retire les membres partis, même sans lien.
 * Le Gaulois du village de ceux qui sont cités, après leur nom : lus au serveur au moment de dessiner l'image, une fois.
 * Sans lecture, l'image part comme avant. Voir src/lib/gaulois-envois.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { ActiveState } from "../src/lib/actifs";
import { activePass, sendActive } from "../src/lib/actifs-discord";
import { loadMembers } from "../src/lib/data";
import { avecOuSansGaulois, gauloisDuPassage } from "../src/lib/gaulois-envois";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { parseNoted } from "../src/lib/salon-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/actifs-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Plus actifs : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucun message des plus actifs envoyé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Plus actifs : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseNoted(ActiveState, readText(STATE_FILE), "la liste du moment sert de nouveau départ");
  if (warning) console.log(`::warning::Plus actifs : ${warning}.`);
  const gauloisDe = gauloisDuPassage();
  const result = await activePass({
    stored,
    members: loadMembers(),
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    send: (players, period) =>
      sendActive({
        link,
        players,
        period,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (p, range) => {
          const { GazetteFonts, renderGazetteCard } = await import("../src/lib/gazette-image");
          const { activeCard, activeImageAlt } = await import("../src/lib/actifs-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          // Un caractère qu'aucune police ne sait dessiner devient « ? » sur l'image ; sa description garde le pseudo entier.
          const drawn = p.map((player) => ({ ...player, username: fonts.drawable(player.username, "strong") }));
          const gaulois = await gauloisDe(p.map((player) => player.id));
          const png = await avecOuSansGaulois(gaulois, (g) => renderGazetteCard(activeCard(drawn, range, clan.tag, clan.links.site, fonts.width, g), fonts, root));
          return { png, alt: activeImageAlt(p, range, clan.tag) };
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
  console.log(`::warning::Plus actifs : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
