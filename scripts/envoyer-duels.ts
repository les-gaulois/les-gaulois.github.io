/**
 * Annonce les victoires en duel de cartes sur Discord, en image, toutes les 5 minutes, après le marché (workflow
 * victoires.yml, lancé par la tâche « Victoires GAL » de cron-job.org).
 *   npm run duels:envoyer
 * Le salon des duels, réglé dans Direction > Discord ; sans lui, celui des achats, puis celui des nouvelles (lien de la
 * Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE). Les victoires se lisent au serveur avec SUPABASE_URL et
 * SUPABASE_SECRET_KEY (fonction duel_annonces_a_envoyer), qui note chaque envoi (noter_annonces_duel). Le robot garde aussi chaque envoi accepté dans
 * .cache/duels-envoi.json, gardé par le cache du workflow et jamais dans data/ : une victoire que le serveur n'a pas notée
 * ne repart pas. Sans lien ou sans serveur, ne fait rien. Voir src/lib/duels-discord.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clan } from "../config/clan";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { duelImageAlt, duelsPass, parseDuelsState, sendDuel, serveurDesDuels, type DuelsSendState } from "../src/lib/duels-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = ".cache/duels-envoi.json";

// Sans lecture de la Direction, rien ne part dans un autre salon que celui choisi : le passage suivant réessaie.
const { link, warning: linkWarning } = await salonLink("duels");
if (linkWarning) {
  console.log(`::notice::Duels : ${linkWarning} ; le salon choisi n'est pas connu, rien n'est envoyé ce passage-ci.`);
  process.exit(0);
}
if (!link) {
  console.log("Pas de lien pour le salon des duels, ni pour ceux des achats et des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : rien n'est annoncé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Duels : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const gardee = parseDuelsState(existsSync(STATE_FILE) ? readFileSync(STATE_FILE, "utf8") : null);
  if (gardee.warning) console.log(`::warning::Duels : ${gardee.warning}.`);
  const result = await duelsPass({
    serveur: serveurDesDuels(),
    stored: gardee.state,
    now: new Date(),
    note: (state: DuelsSendState) => {
      mkdirSync(dirname(STATE_FILE), { recursive: true });
      writeFileSync(STATE_FILE, `${JSON.stringify(state)}\n`);
    },
    send: (victoire) =>
      sendDuel({
        link,
        victoire,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (v) => {
          const { GazetteFonts } = await import("../src/lib/gazette-image");
          const { duelCard, renderDuelCard } = await import("../src/lib/duels-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          const card = duelCard(v, fonts.width, (char) => fonts.draws(char, "strong"));
          return { png: await renderDuelCard(card, fonts, root), alt: duelImageAlt(v) };
        },
        siteUrl: clan.links.site,
        fetch,
        log: console.log,
      }),
    log: console.log,
  });
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit.
  console.log(`::warning::Duels : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
