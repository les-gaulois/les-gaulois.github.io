/**
 * Prévient le salon privé de l'encadrement qu'une sauvegarde chiffrée est faite, ou qu'elle a échoué.
 * Lancé par la dernière étape de l'Action « Sauvegarde chiffrée ».
 *   npm run sauvegarde:compte-rendu
 * Avec ISSUE_SAUVEGARDE : « faite » si le fichier est gardé, « reglage » si l'Action a tourné sans rien garder (phrase
 * ou réglage absent), sinon « ratee ». Le lien du salon de l'encadrement est celui réglé dans Direction > Discord (lu avec
 * SUPABASE_URL et SUPABASE_SECRET_KEY), sinon le secret DISCORD_WEBHOOK_ENCADREMENT.
 * Sans lien, ne fait rien. Message sans nom ni donnée personnelle : voir src/lib/sauvegarde-discord.ts.
 */
import { salonLink } from "../src/lib/salon-lien";
import { sendBackupReport } from "../src/lib/sauvegarde-discord";

const server = process.env["GITHUB_SERVER_URL"];
const repo = process.env["GITHUB_REPOSITORY"];
const run = process.env["GITHUB_RUN_ID"];
const issue = process.env["ISSUE_SAUVEGARDE"];
const { link, warning: linkWarning } = await salonLink("encadrement");
if (linkWarning) console.log(`Sauvegarde : ${linkWarning}.`);

const result = await sendBackupReport({
  webhook: link ?? undefined,
  outcome: issue === "faite" || issue === "reglage" ? issue : "ratee",
  now: new Date(),
  runUrl: server && repo && run ? `${server}/${repo}/actions/runs/${run}` : "",
  fetch,
  log: console.log,
});
if (result === "failed" || result === "invalid") process.exitCode = 1;
