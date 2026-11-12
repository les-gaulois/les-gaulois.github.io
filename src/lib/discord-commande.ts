/**
 * La commande /code du serveur Discord du clan (docs/DIRECTION.md, « Se connecter avec un code »). Le pilote la crée une
 * fois avec `npm run discord:commande` (`scripts/discord-commande.ts`), qui envoie cette définition à Discord. Son nom est
 * celui qu'attend la fonction serveur (`COMMAND_NAME` de `supabase/functions/code-discord/index.ts`) : un test le vérifie.
 */

export const CODE_COMMAND = {
  name: "code",
  // 1 : une commande qui se tape avec « / ».
  type: 1,
  description: "Un code pour vous connecter au site du clan, sans lier votre compte Discord",
} as const;

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
 * Un jeton de robot Discord a trois morceaux séparés par des points. Sert à reconnaître celui que le pilote a copié dans le
 * presse-papiers, sans jamais l'afficher, plutôt que de lui faire taper.
 */
export const looksLikeBotToken = (text: string): boolean => /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$/.test(text.trim());

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
  if (status === 401) return "Discord ne reconnaît pas le jeton : dans le portail développeur, onglet « Bot », cliquez sur « Reset Token » et collez le nouveau.";
  if (code === 50001 || status === 403) {
    return `L'application n'est pas encore sur le serveur du clan. Ouvrez ce lien, choisissez le serveur, puis relancez la commande : ${installUrl(applicationId)}`;
  }
  if (status === 404) return "Discord ne connaît pas ce numéro d'application ou de serveur : vérifiez les deux numéros.";
  return `Discord a refusé (${status}).`;
}
