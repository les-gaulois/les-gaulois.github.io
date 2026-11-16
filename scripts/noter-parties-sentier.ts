/**
 * Note au serveur les parties du clan qui n'ont pas rapporté de points, pour les missions du sentier des Gaulois
 * (docs/DIRECTION.md, « Le sentier des Gaulois »). Lancé par le workflow `.github/workflows/victoires.yml`, toutes les 5
 * minutes, après les statères et à part d'eux : son échec ne retient ni une image ni un statère.
 *   npm run sentier:parties
 * Avec SUPABASE_URL et SUPABASE_SECRET_KEY dans l'environnement. Sans eux, ne lit rien et n'envoie rien.
 * Les sessions sont celles de la collecte (data/sessions/) et celles des dernières heures, gardées par l'étape des victoires
 * dans .cache/sessions-du-passage.json, sinon lues sur l'API : comme pour les statères (src/lib/sessions-du-passage.ts).
 * Aucun identifiant de joueur n'est écrit ni affiché : seule son empreinte part au serveur. Voir src/lib/sentier-releve.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { clan } from "../config/clan";
import type { RpcResult } from "../src/lib/compte/roster";
import { loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { ApiClient } from "../src/lib/pipeline";
import { releveDuSentier } from "../src/lib/sentier-releve";
import { SESSIONS_DU_PASSAGE, sessionsFraichesDesStateres } from "../src/lib/sessions-du-passage";
import { passSessions, readRecentSessions, readVictoryGame } from "../src/lib/victoires";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
if (!url || !key) {
  console.log("Pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY : aucune partie notée pour le sentier.");
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

try {
  const now = new Date();
  const api = new ApiClient({ fetch, sleep, delayMs: 300 });
  const fresh = await sessionsFraichesDesStateres({
    lire: () => (existsSync(SESSIONS_DU_PASSAGE) ? readFileSync(SESSIONS_DU_PASSAGE, "utf8") : null),
    now,
    lireApi: () => readRecentSessions(api, clan.tag, now),
    log: console.log,
  });
  const collected = unreadableSessionFiles().length > 0 ? null : loadSessions();
  const { sessions, warning } = passSessions(collected, fresh);
  if (warning) console.log(`Sentier : ${warning}.`);
  await releveDuSentier({
    rpc: async (fn, args) => {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(`${fn} : ${error.message}`);
      return data as RpcResult;
    },
    sessions,
    // La pause entre deux détails, comme la collecte : l'API n'a pas de limite écrite.
    readGame: async (gameId) => {
      await sleep(300);
      return readVictoryGame(gameId, fetch, sleep);
    },
    now,
    tag: clan.tag,
    log: console.log,
  });
} catch (e) {
  console.log(`::warning::Sentier : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
