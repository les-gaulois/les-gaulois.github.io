/**
 * Règle la cagnotte des pronostics de chaque semaine entièrement relevée (src/lib/pronostics-reglement.ts). Lancé chaque
 * heure par `.github/workflows/site.yml`, après la collecte :
 *   npm run pronostics:regler
 * Avec SUPABASE_URL et SUPABASE_SECRET_KEY dans l'environnement. Sans eux, ne lit rien et n'envoie rien.
 * Les victoires sont celles du QG, lues dans data/ comme `/semaine-du-clan.json`. Un mois de parties illisible ferait
 * compter trop peu de victoires : rien ne part alors, et le passage suivant réessaie.
 */
import { createClient } from "@supabase/supabase-js";
import { clan } from "../config/clan";
import type { RpcResult } from "../src/lib/compte/roster";
import { loadMeta, loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { settlePass } from "../src/lib/pronostics-reglement";
import { clanWeeks } from "../src/lib/semaine-du-clan";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
if (!url || !key) {
  console.log("Pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY : aucun pronostic réglé.");
  process.exit(0);
}

const unreadable = unreadableSessionFiles();
if (unreadable.length > 0) {
  console.log(`::warning::Pronostics : ${unreadable.length} fichier(s) de parties illisible(s), aucun règlement à ce passage.`);
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const meta = loadMeta();
try {
  const { settled, failed } = await settlePass({
    rpc: async (fn, args) => {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(`${fn} : ${error.message}`);
      return data as RpcResult;
    },
    weeks: clanWeeks(loadSessions(), meta.sessions.coveredUntil, meta.sessions.completeThrough, clan.archiveStart),
    log: console.log,
  });
  console.log(`Pronostics : ${settled} semaine(s) réglée(s) à ce passage.`);
  if (failed > 0) process.exitCode = 1;
} catch (e) {
  console.log(`::warning::Pronostics : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
