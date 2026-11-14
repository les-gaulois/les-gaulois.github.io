/**
 * La vie du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois ») : relève l'état vocal des membres sur le
 * Discord du clan et fait écrire par Claude les bulles des Gaulois de la place. Lancé par le workflow
 * `.github/workflows/victoires.yml`, toutes les 5 minutes, en dernière étape, après les statères et à part d'eux : son échec
 * ne retient jamais une image de victoire ni les statères.
 *   npm run village:vie
 * Avec, dans l'environnement :
 * - SUPABASE_URL et SUPABASE_SECRET_KEY : sans eux, ne fait rien ;
 * - DISCORD_BOT_TOKEN, le jeton du robot des arrivées (« Bienvenue Gaulois ») : sans lui, pas de relevé vocal. Le serveur
 *   est celui de src/lib/discord-commande.ts, sauf DISCORD_GUILD_ID ;
 * - ANTHROPIC_API_KEY, la clé de l'API Claude, donnée au seul client du SDK officiel (`@anthropic-ai/sdk`), qui ne l'envoie
 *   qu'à api.anthropic.com : sans elle, pas de bulles.
 * Chaque partie marche sans l'autre. Aucun identifiant ni aucune clé n'est écrit au journal : des nombres, et, pour chaque
 * phrase de Claude écartée par le contrôle, la règle en cause et le fragment qui l'a fait écarter (un signe, un nombre, un mot
 * à majuscule), jamais la phrase entière ni un mot de la liste interdite. Voir src/lib/village/vie-releve.ts.
 */
import { createClient } from "@supabase/supabase-js";
import type { RpcResult } from "../src/lib/compte/roster";
import { GUILD_ID, isSnowflake } from "../src/lib/discord-commande";
import { vieDuVillage } from "../src/lib/village/vie-releve";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
if (!url || !key) {
  console.log("Pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY : la vie du village attend.");
  process.exit(0);
}

// Le jeton seul : s'il a été collé avec « Bot » devant, comme dans un en-tête, ce mot part.
const token = (process.env["DISCORD_BOT_TOKEN"] ?? "").trim().replace(/^Bot\s+/i, "");
const guildId = (process.env["DISCORD_GUILD_ID"] ?? "").trim() || GUILD_ID;
const cleClaude = (process.env["ANTHROPIC_API_KEY"] ?? "").trim();
if (token !== "" && !isSnowflake(guildId)) console.log("::warning::Vie du village : le numéro du serveur Discord n'a pas la forme attendue, aucun état vocal relevé.");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

try {
  const bilan = await vieDuVillage({
    rpc: async (fn, args) => {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(`${fn} : ${error.message}`);
      return data as RpcResult;
    },
    fetch,
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    discord: token !== "" && isSnowflake(guildId) ? { token, guildId } : null,
    cleClaude: cleClaude === "" ? null : cleClaude,
    log: console.log,
  });
  if (bilan.erreurs > 0) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient ni jeton ni clé : seuls les appels à Discord et à Claude les reçoivent.
  console.log(`::warning::Vie du village : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
