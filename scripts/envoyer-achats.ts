/**
 * Annonce les objets reçus au village des Gaulois (boutique, pochette surprise, marché) sur le salon des nouvelles, en image,
 * lancé par la GitHub Action après l'annonce des bâtiments finis.
 *   npm run achats:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord, sinon le secret DISCORD_WEBHOOK_GAZETTE ; les achats se
 * lisent au serveur avec SUPABASE_URL et SUPABASE_SECRET_KEY (fonction achats_du_village). Sans lien ou sans serveur, ne fait
 * rien, et ne note rien.
 * Le dernier numéro traité et les achats déjà annoncés sont notés dans data/achats-envoi.json : voir src/lib/achats-discord.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { achatsPass, lireAchats, parseAchatsState, sendAchats } from "../src/lib/achats-discord";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/achats-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Achats du village : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucun achat annoncé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Achats du village : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseAchatsState(readText(STATE_FILE));
  if (warning) console.log(`::warning::Achats du village : ${warning}.`);
  const now = new Date();
  const result = await achatsPass({
    stored,
    lire: (apres) => lireAchats(apres),
    now,
    send: (annonce) =>
      sendAchats({
        link,
        annonce,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (a) => {
          const { GazetteFonts } = await import("../src/lib/gazette-image");
          const { achatsCard, achatsImageAlt, renderAchatsCard } = await import("../src/lib/achats-image");
          const { vignetteDeLObjet } = await import("../src/lib/gaulois");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          const card = achatsCard(a, a.achats.map((achat) => vignetteDeLObjet(achat.emplacement, achat.objet)), clan.links.site, fonts.width, (char) => fonts.draws(char, "strong"));
          return { png: await renderAchatsCard(card, fonts, root), alt: achatsImageAlt(a) };
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
  console.log(`::warning::Achats du village : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
