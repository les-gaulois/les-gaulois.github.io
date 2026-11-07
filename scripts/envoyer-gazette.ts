/**
 * Envoie la dernière gazette sur un salon Discord, lancé par la GitHub Action après la collecte.
 *   npm run gazette:envoyer
 * Avec DISCORD_WEBHOOK_GAZETTE dans l'environnement. Sans lui, ne fait rien. La dernière édition envoyée est notée dans data/gazette-envoi.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { loadHistory, loadMembers, loadMeta, loadSessions, loadTerritoryReadings } from "../src/lib/data";
import { gazetteEditions } from "../src/lib/gazette";
import { GazetteSendState, sendLatestGazette } from "../src/lib/gazette-discord";

const STATE_FILE = "data/gazette-envoi.json";

function readLastSent(): string | null {
  if (!existsSync(STATE_FILE)) return null;
  const parsed = GazetteSendState.safeParse(JSON.parse(readFileSync(STATE_FILE, "utf8")));
  // Un fichier illisible pourrait faire renvoyer une édition : mieux vaut ne rien envoyer et le signaler.
  if (!parsed.success) throw new Error(`${STATE_FILE} est invalide.`);
  return parsed.data.lastSent;
}

const webhook = process.env["DISCORD_WEBHOOK_GAZETTE"];
if (!webhook) {
  console.log("Pas de DISCORD_WEBHOOK_GAZETTE : rien à envoyer.");
  process.exit(0);
}

try {
  const editions = gazetteEditions({
    sessions: loadSessions(),
    history: loadHistory(),
    territory: loadTerritoryReadings(),
    members: loadMembers(),
    archiveStart: clan.archiveStart,
    completeThrough: loadMeta().sessions.completeThrough,
  });
  const result = await sendLatestGazette({
    webhook,
    editions,
    lastSent: readLastSent(),
    tag: clan.tag,
    siteUrl: clan.links.site,
    now: new Date(),
    fetch,
    log: console.log,
  });
  if (result.status === "sent") writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
  if (result.status === "failed" || result.status === "invalid") process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `sendLatestGazette` ne laisse rien sortir de cet appel.
  console.log(`::warning::Gazette : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
