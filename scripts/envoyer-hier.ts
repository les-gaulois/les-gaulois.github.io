/**
 * Envoie « Hier chez les Gaulois » sur le salon de la gazette, lancé par la GitHub Action après la collecte.
 *   npm run hier:envoyer
 * Avec DISCORD_WEBHOOK_GAZETTE dans l'environnement. Sans lui, ne fait rien, et ne note rien.
 * Le dernier jour envoyé est noté dans data/hier-envoi.json : voir src/lib/hier-discord.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { loadGames, loadMeta, loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { HierState, hierPass, sendHier } from "../src/lib/hier-discord";
import { clanJournal } from "../src/lib/journal";
import { parseNoted } from "../src/lib/salon-discord";

const STATE_FILE = "data/hier-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Un copier-coller peut laisser une espace ou un retour à la ligne autour du lien.
const link = process.env["DISCORD_WEBHOOK_GAZETTE"]?.trim();
if (!link) {
  console.log("Pas de DISCORD_WEBHOOK_GAZETTE : aucun bilan d'hier envoyé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Hier : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseNoted(HierState, readText(STATE_FILE), "le bilan d'hier peut repartir une fois");
  if (warning) console.log(`::warning::Hier : ${warning}.`);
  const meta = loadMeta();
  const sessions = unreadableSessionFiles().length > 0 ? null : loadSessions();
  // La belle partie ne lit que le nombre de Gaulois, le résultat et l'heure : aucun autre clan n'est cité.
  const { rows } = clanJournal({ sessions: sessions ?? [], games: loadGames(), coveredUntil: meta.sessions.coveredUntil, tag: clan.tag, officialTags: [] });
  const result = await hierPass({
    stored,
    sessions,
    rows,
    completeThrough: meta.sessions.completeThrough,
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    send: (report) =>
      sendHier({
        link,
        report,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (r) => {
          const { GazetteFonts, renderGazetteCard } = await import("../src/lib/gazette-image");
          const { hierCard, hierImageAlt } = await import("../src/lib/hier-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          return { png: await renderGazetteCard(hierCard(r, clan.tag, clan.links.site, fonts.width), fonts, root), alt: hierImageAlt(r, clan.tag) };
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
  console.log(`::warning::Hier : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
