/**
 * Envoie une alerte de place sur le salon de la gazette, lancé par la GitHub Action après la collecte.
 *   npm run alertes:envoyer
 * Avec DISCORD_WEBHOOK_GAZETTE dans l'environnement. Sans lui, ne fait rien, et ne note rien.
 * Les places annoncées, celle en attente et les envois du jour sont notés dans data/alertes-envoi.json : voir src/lib/alerts.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { mapReading, parseAlertState, rankReading } from "../src/lib/alerts";
import { alertPass, sendPlaceAlert } from "../src/lib/alerts-discord";
import { loadClanMapFilm, loadLeaderboard } from "../src/lib/data";
import { GazetteSendState, isWebhookUrl } from "../src/lib/gazette-discord";

const STATE_FILE = "data/alertes-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/** La dernière édition de la gazette envoyée, quel que soit son format. Illisible : comme si aucune n'était partie. */
function gazetteLastSent(): string | null {
  const raw = readText(GAZETTE_FILE);
  if (raw === null) return null;
  try {
    const parsed = GazetteSendState.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.lastSent : null;
  } catch {
    return null;
  }
}

// Un copier-coller peut laisser une espace ou un retour à la ligne autour du lien.
const link = process.env["DISCORD_WEBHOOK_GAZETTE"]?.trim();
if (!link) {
  console.log("Pas de DISCORD_WEBHOOK_GAZETTE : aucune alerte.");
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
    gazetteLastSent: gazetteLastSent(),
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
