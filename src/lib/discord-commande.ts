/**
 * Les commandes du serveur Discord du clan, vues du site : leurs définitions sont dans la fonction serveur
 * (`supabase/functions/code-discord/definitions.ts`), qui les crée elle-même sur le serveur du clan depuis le 13 novembre
 * 2026 (`inscription.ts`). Ce fichier les reprend pour les tests et pour le script de secours `npm run discord:commande`
 * (`scripts/discord-commande.ts`), et garde ce qui ne sert qu'au site : numéros publics, jeton reconnu, refus expliqués.
 */

export {
  CARTE_COMMAND,
  CLAN_COMMAND,
  CODE_COMMAND,
  COMMANDS,
  CONCOURS_COMMAND,
  FICHE_COMMAND,
  GUIDE_COMMAND,
  MANAGE_ROLES,
  MOI_COMMAND,
  RECORDS_COMMAND,
  RIVAL_COMMAND,
  ROLES_COMMAND,
  TICKETS_COMMAND,
} from "../../supabase/functions/code-discord/definitions";

/**
 * Le temps à attendre quand Discord répond « trop de demandes » (429) : son `retry_after`, en secondes, borné à 30 s. `null` :
 * pas une réponse 429 lisible, il ne faut pas réessayer.
 */
export function retryAfterMs(status: number, body: string): number | null {
  if (status !== 429) return null;
  try {
    const wait = (JSON.parse(body) as { retry_after?: unknown }).retry_after;
    return typeof wait === "number" && Number.isFinite(wait) && wait >= 0 ? Math.min(Math.ceil(wait * 1000), 30_000) : null;
  } catch {
    return null;
  }
}

/**
 * L'application de la connexion, « Le Gaulois », et le serveur Discord du clan : publics, lus le 12 novembre 2026 (le premier
 * dans l'adresse où Supabase envoie vers Discord, le second dans l'invitation de `config/clan.ts`). Les variables
 * DISCORD_APPLICATION_ID et DISCORD_GUILD_ID les remplacent.
 */
export const APPLICATION_ID = "1473059048546107434";
export const GUILD_ID = "1350905494600024094";

const SNOWFLAKE = /^[0-9]{17,20}$/;

/** Un numéro de Discord : application, serveur, salon ou membre. */
export const isSnowflake = (value: string): boolean => SNOWFLAKE.test(value);

/**
 * Le jeton du robot de cette application : trois morceaux séparés par des points, dont le premier est le numéro du robot
 * écrit en base64, celui de l'application pour une application récente. Sert à reconnaître celui que le pilote a copié dans
 * le presse-papiers, sans jamais l'afficher. Une clé d'un autre service (un JWT de Supabase, par exemple) n'est jamais prise
 * pour lui : elle ne commence pas par ce numéro.
 */
export function looksLikeBotToken(text: string, applicationId: string): boolean {
  const parts = text.trim().split(".");
  const [first = "", second = "", third = ""] = parts;
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || second.length < 4 || third.length < 20) return false;
  try {
    return atob(first.replace(/-/g, "+").replace(/_/g, "/")) === applicationId;
  } catch {
    return false;
  }
}

/** L'adresse qui crée la commande, ou la remplace si elle existe déjà, sur le seul serveur du clan. */
export function commandUrl(applicationId: string, guildId: string): string {
  if (!isSnowflake(applicationId)) throw new Error("Le numéro de l'application Discord est un nombre de 17 à 20 chiffres (Application ID).");
  if (!isSnowflake(guildId)) throw new Error("Le numéro du serveur Discord est un nombre de 17 à 20 chiffres (clic droit sur le serveur, « Copier l'identifiant du serveur »).");
  return `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;
}

/** Le lien qui ajoute l'application au serveur du clan avec ses seules commandes : ni robot dans la liste, ni droit. */
export function installUrl(applicationId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands&integration_type=0`;
}

/** Ce que veut dire un refus de Discord, en une phrase pour le pilote. Le jeton n'y est jamais. */
export function explainRefusal(status: number, body: string, applicationId: string): string {
  let code: unknown = null;
  try {
    code = (JSON.parse(body) as { code?: unknown }).code;
  } catch {
    code = null;
  }
  if (status === 401) return "Discord ne reconnaît pas le jeton : dans le portail développeur, onglet « Bot », cliquez sur « Reset Token », collez le nouveau dans le secret LE_GAULOIS_BOT_TOKEN de la fonction (Supabase), puis relancez la commande.";
  if (code === 50001 || status === 403) {
    return `L'application n'est pas encore sur le serveur du clan. Ouvrez ce lien, choisissez le serveur, puis relancez la commande : ${installUrl(applicationId)}`;
  }
  if (status === 404) return "Discord ne connaît pas ce numéro d'application ou de serveur : vérifiez les deux numéros.";
  return `Discord a refusé (${status}).`;
}
