/**
 * Annonce chaque bâtiment fini du village des Gaulois sur le salon des nouvelles, en image, lancé par la GitHub Action après
 * la collecte des sessions.
 *   npm run chantier:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien, et ne note rien.
 * Les bâtiments connus (annoncés, ou déjà finis au premier passage) sont notés dans data/chantier-envoi.json : voir
 * src/lib/chantier-discord.ts. Le chantier vient des sessions du clan, au dernier relevé : src/lib/village/chantier.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { chantierPass, parseChantierState, sendChantier } from "../src/lib/chantier-discord";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { salonLink } from "../src/lib/salon-lien";
import { etatDuMondeDuSite } from "../src/lib/village/monde-site";

const STATE_FILE = "data/chantier-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Chantier : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucun bâtiment annoncé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Chantier : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseChantierState(readText(STATE_FILE));
  if (warning) console.log(`::warning::Chantier : ${warning}.`);
  const now = new Date();
  const result = await chantierPass({
    stored,
    monde: etatDuMondeDuSite(now),
    now,
    send: (annonce) =>
      sendChantier({
        link,
        annonce,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (a) => {
          const { GazetteFonts } = await import("../src/lib/gazette-image");
          const { chantierCard, chantierImageAlt, renderChantierCard } = await import("../src/lib/chantier-image");
          const { dessinDuBatiment } = await import("../src/lib/village/batiments/index");
          const { PLEIN_JOUR } = await import("../src/lib/village/lumiere");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          const card = chantierCard(a, dessinDuBatiment(a.batiment.id, PLEIN_JOUR, 1), clan.links.site, fonts.width);
          return { png: await renderChantierCard(card, fonts, root), alt: chantierImageAlt(a) };
        },
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
  console.log(`::warning::Chantier : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
