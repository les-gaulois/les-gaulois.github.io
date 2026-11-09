/**
 * Sauvegarde chiffrée des données du serveur de connexion, faite chaque semaine par l'Action « Sauvegarde chiffrée »,
 * que le robot horaire lance (voir src/lib/sauvegarde-relance.ts).
 *   npm run sauvegarde
 * Avec SUPABASE_URL, SUPABASE_SECRET_KEY et SAUVEGARDE_CLE, la phrase de passe de la direction. Sans eux, ne fait rien.
 * Le fichier chiffré va dans .cache/sauvegarde/, que l'Action garde 90 jours. Rien n'est écrit en clair sur le disque.
 * Dans une Action, le nom du fichier est donné à l'étape suivante (GITHUB_OUTPUT) : sans fichier, rien n'est envoyé.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { backupName, backupSummary, passphraseProblem, seal } from "../src/lib/sauvegarde";

// Dans une Action, un réglage manquant s'affiche en avertissement sur la page de l'exécution, et pas seulement dans son journal.
const warn = (text: string) => console.log(process.env["GITHUB_ACTIONS"] ? `::warning::Sauvegarde : ${text}` : text);

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
const passphrase = process.env["SAUVEGARDE_CLE"] ?? "";
if (!passphrase.trim()) {
  warn("pas de SAUVEGARDE_CLE, aucune sauvegarde faite. Voir docs/DIRECTION.md, « La sauvegarde chiffrée ».");
  process.exit(0);
}
if (!url || !key) {
  warn("pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, rien à sauvegarder.");
  process.exit(0);
}
const problem = passphraseProblem(passphrase);
if (problem) {
  warn(`${problem} Rien n'est sauvegardé.`);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const { data, error } = await sb.rpc("export_site");
  if (error) throw new Error(`export_site : ${error.message}`);
  const content = data as Record<string, unknown>;
  // Les nombres de lignes, pour vérifier dans le journal de l'Action : aucun nom, aucune donnée.
  const sizes = backupSummary(content);
  const dir = ".cache/sauvegarde";
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${backupName(new Date())}`;
  writeFileSync(file, seal(Buffer.from(JSON.stringify(content)), passphrase));
  const output = process.env["GITHUB_OUTPUT"];
  if (output) appendFileSync(output, `file=${file}\n`);
  console.log(`Sauvegarde chiffrée écrite : ${file}. Lignes : ${sizes}.`);
} catch (e) {
  warn(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
