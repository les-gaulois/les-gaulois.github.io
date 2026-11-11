/**
 * Envoie « Jouer ensemble » sur le salon de la gazette, une fois par semaine, lancé par la GitHub Action après la collecte.
 *   npm run groupes:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien, et ne note rien.
 * Qui jouait avec qui vient de .cache/member-games/results.json, restauré par l'Action avant la collecte.
 * La dernière semaine passée et le jour du dernier message sont notés dans data/groupes-envoi.json :
 * voir src/lib/groupes-discord.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { loadMemberResults, loadMembers, loadMeta, loadSessions } from "../src/lib/data";
import { isWebhookUrl, lastSentAnyFormat } from "../src/lib/gazette-discord";
import { GroupsState, groupsPass, sendGroups, weekGroups, weekReady } from "../src/lib/groupes-discord";
import { parseNoted } from "../src/lib/salon-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/groupes-envoi.json";
const GAZETTE_FILE = "data/gazette-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Jouer ensemble : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : rien n'est envoyé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Jouer ensemble : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const { state: stored, warning } = parseNoted(GroupsState, readText(STATE_FILE), "la semaine passée est reprise");
  if (warning) console.log(`::warning::Jouer ensemble : ${warning}.`);
  const sessions = loadSessions();
  const results = loadMemberResults();
  const members = loadMembers();
  const result = await groupsPass({
    stored,
    gazetteLastSent: lastSentAnyFormat(readText(GAZETTE_FILE)),
    now: new Date(),
    ready: (monday) => weekReady({ monday, completeThrough: loadMeta().sessions.completeThrough, members, results }),
    summary: (monday) => weekGroups({ monday, sessions, results, members }),
    send: (week) => sendGroups({ link, week, siteUrl: clan.links.site, fetch, log: console.log }),
    log: console.log,
  });
  if (result.state) writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postText` ne laisse rien sortir de cet appel.
  console.log(`::warning::Jouer ensemble : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
