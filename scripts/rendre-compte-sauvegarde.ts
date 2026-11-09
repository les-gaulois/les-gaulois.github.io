/**
 * Prévient le salon privé de l'encadrement qu'une sauvegarde chiffrée est faite, ou qu'elle a échoué.
 * Lancé par la dernière étape de l'Action « Sauvegarde chiffrée ».
 *   npm run sauvegarde:compte-rendu
 * Avec DISCORD_WEBHOOK_ENCADREMENT et ISSUE_SAUVEGARDE : « faite » si le fichier est gardé, « reglage » si l'Action
 * a tourné sans rien garder (phrase ou réglage absent), sinon « ratee ».
 * Sans lien, ne fait rien. Message sans nom ni donnée personnelle : voir src/lib/sauvegarde-discord.ts.
 */
import { sendBackupReport } from "../src/lib/sauvegarde-discord";

const server = process.env["GITHUB_SERVER_URL"];
const repo = process.env["GITHUB_REPOSITORY"];
const run = process.env["GITHUB_RUN_ID"];
const issue = process.env["ISSUE_SAUVEGARDE"];

const result = await sendBackupReport({
  webhook: process.env["DISCORD_WEBHOOK_ENCADREMENT"],
  outcome: issue === "faite" || issue === "reglage" ? issue : "ratee",
  now: new Date(),
  runUrl: server && repo && run ? `${server}/${repo}/actions/runs/${run}` : "",
  fetch,
  log: console.log,
});
if (result === "failed" || result === "invalid") process.exitCode = 1;
