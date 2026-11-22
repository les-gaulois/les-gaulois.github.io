/**
 * Envoie au serveur les flammes de série qui brûlent, pour les duels comptés du duel des Gaulois (un de plus par jour avec
 * la flamme ; docs/DIRECTION.md, « Le duel des Gaulois »). Lancé par `.github/workflows/site.yml` après la collecte, avant
 * la construction.
 *   npm run duel:flammes
 * Avec SUPABASE_URL et SUPABASE_SECRET_KEY dans l'environnement. Sans eux, ou quand la flamme ne se calcule pas (une
 * session illisible, la liste des membres illisible, ou les parties des membres absentes du cache), n'envoie rien : le
 * serveur garde son dernier relevé, et l'écran dit quand il date. « Pas de données » n'est jamais « pas de flamme ».
 * Aucun identifiant de joueur n'est écrit ni affiché : seule son empreinte part au serveur (`src/lib/village/flammes-duel.ts`).
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { MEMBER_RESULTS_FILE, loadMemberResults, loadMembers, loadSeriesEnCours, unreadableSessionFiles } from "../src/lib/data";
import { empreintesDesFlammes } from "../src/lib/village/flammes-duel";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
if (!url || !key) {
  console.log("Pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY : aucune flamme envoyée au duel.");
  process.exit(0);
}
if (unreadableSessionFiles().length > 0 || !loadMembers() || !existsSync(MEMBER_RESULTS_FILE) || Object.keys(loadMemberResults()).length === 0) {
  console.log("Des parties ou la liste des membres manquent : les flammes ne se calculent pas, rien n'est envoyé au duel.");
  process.exit(0);
}

const empreintes = empreintesDesFlammes(loadSeriesEnCours());
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await sb.rpc("noter_flammes_duel", { p_empreintes: empreintes });
if (error) {
  // Sans la migration du duel, la fonction n'existe pas encore : rien n'est cassé, le passage suivant réessaie.
  console.log(`::warning::Flammes du duel : ${error.message}`);
  process.exitCode = 1;
} else console.log(`Flammes du duel : ${empreintes.length} envoyées, le serveur en garde ${(data as { flammes?: number } | null)?.flammes ?? "?"}.`);
