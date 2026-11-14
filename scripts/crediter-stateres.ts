/**
 * Donne aux Gaulois les statères des points qu'ils ont rapportés au clan, 30 statères par point rapporté au clan, à chaque
 * Gaulois présent dans la partie (docs/DIRECTION.md, « Le village des Gaulois », lot 2). Lancé par le workflow
 * `.github/workflows/victoires.yml`, toutes les 5 minutes, après l'envoi des victoires sur Discord et à part de lui : son
 * échec ne retient jamais une image.
 *   npm run stateres:crediter
 * Avec SUPABASE_URL et SUPABASE_SECRET_KEY dans l'environnement. Sans eux, ne lit rien et n'envoie rien.
 * Les sessions du mois sont celles de la collecte (data/sessions/), avec celles des dernières heures : celles que l'étape des
 * victoires vient de lire sur l'API publique et de garder dans .cache/sessions-du-passage.json, si ce fichier vient de ce passage,
 * sinon une lecture de l'API, comme avant. Voir src/lib/sessions-du-passage.ts.
 * Aucun identifiant de joueur n'est écrit ni affiché : seule son empreinte part au serveur. Voir src/lib/stateres-releve.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { clan } from "../config/clan";
import type { RpcResult } from "../src/lib/compte/roster";
import { loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { ApiClient } from "../src/lib/pipeline";
import { SESSIONS_DU_PASSAGE, sessionsFraichesDesStateres } from "../src/lib/sessions-du-passage";
import { releveStateres } from "../src/lib/stateres-releve";
import { passSessions, readRecentSessions, readVictoryGame } from "../src/lib/victoires";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
if (!url || !key) {
  console.log("Pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY : aucun statère donné.");
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

try {
  const now = new Date();
  const api = new ApiClient({ fetch, sleep, delayMs: 300 });
  // Les sessions gardées par l'étape d'avant, si elles viennent de ce passage ; sinon une lecture de l'API, comme avant.
  const fresh = await sessionsFraichesDesStateres({
    lire: () => (existsSync(SESSIONS_DU_PASSAGE) ? readFileSync(SESSIONS_DU_PASSAGE, "utf8") : null),
    now,
    lireApi: () => readRecentSessions(api, clan.tag, now),
    log: console.log,
  });
  // Un mois illisible ferait passer ses parties pour absentes : seules celles des dernières heures servent alors.
  const collected = unreadableSessionFiles().length > 0 ? null : loadSessions();
  const { sessions, warning } = passSessions(collected, fresh);
  if (warning) console.log(`Statères : ${warning}.`);
  await releveStateres({
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
  console.log(`::warning::Statères : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
