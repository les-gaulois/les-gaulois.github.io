/**
 * Envoie sur Discord une alerte quand le clan bat un de ses records, sur le même salon que la gazette.
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien. Les records annoncés sont notés dans data/records-envoi.json.
 * Le lien vaut un mot de passe pour ce salon : il n'est écrit dans aucun message, même d'erreur.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { loadMeta, loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { parseRecordAlertState, postRecordMessage, recordAlertPass, recordPayload } from "../src/lib/records-discord";
import { clanRecords } from "../src/lib/results";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/records-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Records : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucune alerte de record.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Records : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}
const webhook = link;

try {
  const coveredUntil = loadMeta().sessions.coveredUntil;
  const { state: stored, warning } = parseRecordAlertState(readText(STATE_FILE));
  if (warning) console.log(`::warning::Records : ${warning}.`);
  const result = await recordAlertPass({
    stored,
    // Sans collecte réussie, pas de records : rien n'est comparé ni noté.
    records: coveredUntil ? clanRecords(loadSessions()) : null,
    unreadable: unreadableSessionFiles(),
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    send: (alert) => postRecordMessage(webhook, recordPayload(alert, clan.tag, clan.links.site, clan.archiveStart, coveredUntil ?? new Date().toISOString()), fetch, console.log),
    log: console.log,
  });
  if (result.state) writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postRecordMessage` ne laisse rien sortir de cet appel.
  console.log(`::warning::Records : ${e instanceof Error ? e.message : "erreur inconnue"}.`);
  process.exitCode = 1;
}
