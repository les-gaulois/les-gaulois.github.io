/**
 * Annonce les gros gains du casino (1 000 statères ou plus d'un coup) sur Discord, en image, toutes les 5 minutes, après les
 * duels (workflow victoires.yml, lancé par la tâche « Victoires GAL » de cron-job.org).
 *   npm run casino:envoyer
 * Le salon du casino, réglé dans Direction > Discord ; sans lui, celui des achats, puis celui des nouvelles (lien de la
 * Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE). Les coups se lisent au serveur avec SUPABASE_URL et
 * SUPABASE_SECRET_KEY (fonction casino_annonces_a_envoyer), qui note chaque envoi (noter_annonces_casino). Le robot garde
 * aussi chaque envoi accepté dans .cache/casino-envoi.json, gardé par le cache du workflow et jamais dans data/ : un coup
 * que le serveur n'a pas noté ne repart pas. Sans lien ou sans serveur, ne fait rien. Voir src/lib/casino-discord.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clan } from "../config/clan";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { casinoImageAlt, casinoPass, parseCasinoState, sendCasino, serveurDuCasino, type CasinoSendState } from "../src/lib/casino-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = ".cache/casino-envoi.json";

// Sans lecture de la Direction, rien ne part dans un autre salon que celui choisi : le passage suivant réessaie.
const { link, warning: linkWarning } = await salonLink("casino");
if (linkWarning) {
  console.log(`::notice::Casino : ${linkWarning} ; le salon choisi n'est pas connu, rien n'est envoyé ce passage-ci.`);
  process.exit(0);
}
if (!link) {
  console.log("Pas de lien pour le salon du casino, ni pour ceux des achats et des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : rien n'est annoncé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Casino : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const gardee = parseCasinoState(existsSync(STATE_FILE) ? readFileSync(STATE_FILE, "utf8") : null);
  if (gardee.warning) console.log(`::warning::Casino : ${gardee.warning}.`);
  const result = await casinoPass({
    serveur: serveurDuCasino(),
    stored: gardee.state,
    now: new Date(),
    note: (state: CasinoSendState) => {
      mkdirSync(dirname(STATE_FILE), { recursive: true });
      writeFileSync(STATE_FILE, `${JSON.stringify(state)}\n`);
    },
    send: (gain) =>
      sendCasino({
        link,
        gain,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (g) => {
          const { GazetteFonts } = await import("../src/lib/gazette-image");
          const { casinoCard, renderCasinoCard } = await import("../src/lib/casino-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          const card = casinoCard(g, clan.links.site, fonts.width, (char) => fonts.draws(char, "strong"));
          return { png: await renderCasinoCard(card, fonts, root), alt: casinoImageAlt(g) };
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
  console.log(`::warning::Casino : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
