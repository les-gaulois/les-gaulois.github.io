/**
 * Lance l'Action « Sauvegarde chiffrée » si la semaine n'a pas encore sa sauvegarde. Lancé à chaque passage du robot horaire.
 *   npm run sauvegarde:relancer
 * Avec GITHUB_TOKEN (droit actions: write), GITHUB_REPOSITORY et SAUVEGARDE_CLE_POSEE (« true » si le secret existe :
 * la phrase elle-même ne passe pas par ici). Hors d'une Action, ne fait rien. Règles : src/lib/sauvegarde-relance.ts.
 */
import { relaunchBackupIfDue } from "../src/lib/sauvegarde-relance";

const token = process.env["GITHUB_TOKEN"];
const repo = process.env["GITHUB_REPOSITORY"];
if (!token || !repo) {
  console.log("Pas de GITHUB_TOKEN ou de GITHUB_REPOSITORY : hors d'une Action GitHub, rien à lancer.");
  process.exit(0);
}

const api = (path: string, init?: { method: "POST"; body: string }) =>
  fetch(`https://api.github.com/repos/${repo}${path}`, {
    method: init?.method ?? "GET",
    body: init?.body,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "gal-site-robot",
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
  });

try {
  const result = await relaunchBackupIfDue({
    api,
    now: new Date(),
    passphraseSet: process.env["SAUVEGARDE_CLE_POSEE"] === "true",
    ref: process.env["GITHUB_REF_NAME"] || "main",
    log: console.log,
  });
  if (result === "failed") process.exitCode = 1;
} catch (e) {
  console.log(`::warning::Sauvegarde : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
