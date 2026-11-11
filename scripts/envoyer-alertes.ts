/**
 * Envoie une alerte de place sur le salon de la gazette, lancé par la GitHub Action après la collecte.
 *   npm run alertes:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien, et ne note rien.
 * Les places annoncées, celle en attente et les envois du jour sont notés dans data/alertes-envoi.json : voir src/lib/alerts.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { mapReading, parseAlertState, rankReading } from "../src/lib/alerts";
import { alertPass, sendPlaceAlert } from "../src/lib/alerts-discord";
import { loadClanMapFilm, loadLeaderboard } from "../src/lib/data";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/alertes-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Alertes : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucune alerte.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Alertes : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseAlertState(readText(STATE_FILE));
  if (warning) console.log(`::warning::Alertes : ${warning}.`);
  const result = await alertPass({
    stored,
    readings: { rank: rankReading(loadLeaderboard(), clan.tag), map: mapReading(loadClanMapFilm(), clan.tag) },
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    send: (alert) =>
      sendPlaceAlert({
        link,
        alert,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (a) => {
          const { GazetteFonts, renderGazetteCard } = await import("../src/lib/gazette-image");
          const { alertCard, alertImageAlt } = await import("../src/lib/alerts-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          return { png: await renderGazetteCard(alertCard(a, clan.tag, clan.links.site, fonts.width), fonts, root), alt: alertImageAlt(a, clan.tag) };
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
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `sendPlaceAlert` ne laisse rien sortir de cet appel.
  console.log(`::warning::Alertes : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
