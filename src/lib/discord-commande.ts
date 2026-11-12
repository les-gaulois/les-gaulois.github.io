/**
 * Les commandes du serveur Discord du clan : /code (docs/DIRECTION.md, « Se connecter avec un code »), /fiche (« La
 * commande /fiche »), les commandes du robot (« Les commandes du robot ») et /roles (« Les rôles sur Discord »). Le pilote les crée avec
 * `npm run discord:commande` (`scripts/discord-commande.ts`), qui envoie ces définitions à Discord. Leurs noms et leurs
 * options sont ceux qu'attend la fonction serveur (`supabase/functions/code-discord/index.ts`) : un test le vérifie.
 */

export const CODE_COMMAND = {
  name: "code",
  // 1 : une commande qui se tape avec « / ».
  type: 1,
  description: "Un code pour vous connecter au site du clan, sans lier votre compte Discord",
} as const;

/**
 * La commande /fiche (docs/DIRECTION.md, « La commande /fiche ») : la fiche d'un membre, montrée à tout le salon. Pendant la
 * saisie, Discord demande des propositions à la fonction serveur (`autocomplete`), qui les lit dans les fiches du site. Ses
 * noms sont ceux qu'attend la fonction (`FICHE_COMMAND_NAME`, `FICHE_OPTION`) : un test le vérifie.
 */
export const FICHE_COMMAND = {
  name: "fiche",
  type: 1,
  description: "Montrer à tous la fiche d'un membre du clan : ses parties sous le tag",
  options: [
    {
      // 3 : du texte.
      type: 3,
      name: "pseudo",
      description: "Son pseudo dans la liste du clan : tapez le début, puis choisissez",
      required: true,
      autocomplete: true,
      max_length: 40,
    },
  ],
} as const;

/**
 * Les commandes du robot (docs/DIRECTION.md, « Les commandes du robot ») : une image que le site dessine à chaque
 * construction, et /moi, la fiche de qui la tape. Leurs noms et options sont ceux qu'attend la fonction serveur.
 */
export const CLAN_COMMAND = { name: "clan", type: 1, description: "La place de GAL au classement officiel, et le podium de la dernière semaine complète" } as const;
export const RECORDS_COMMAND = { name: "records", type: 1, description: "Les records du clan : plus longue série de victoires, meilleure journée…" } as const;
export const CARTE_COMMAND = { name: "carte", type: 1, description: "Le territoire de GAL sur la carte des clans d'OpenFront" } as const;
export const GUIDE_COMMAND = {
  name: "guide",
  type: 1,
  description: "Un chapitre du guide du clan, l'essentiel en une image",
  options: [{ type: 3, name: "chapitre", description: "Le chapitre : tapez le début de son nom, puis choisissez", required: true, autocomplete: true, max_length: 60 }],
} as const;
export const RIVAL_COMMAND = {
  name: "rival",
  type: 1,
  description: "GAL face à un clan de la liste officielle : rang, score, parties, face-à-face",
  options: [{ type: 3, name: "clan", description: "Le tag du clan : tapez le début, puis choisissez", required: true, autocomplete: true, max_length: 10 }],
} as const;
export const MOI_COMMAND = { name: "moi", type: 1, description: "Votre fiche, si le site vous a reconnu comme membre du clan" } as const;

/** Le droit « Gérer les rôles » de Discord (1 << 28), en chiffres. */
export const MANAGE_ROLES = "268435456";

/**
 * /roles (docs/DIRECTION.md, « Les rôles sur Discord ») : poste le panneau des rôles dans le salon où on la tape. Discord ne
 * la propose qu'à qui a le droit « Gérer les rôles » (`default_member_permissions`), et la fonction serveur le vérifie aussi.
 */
export const ROLES_COMMAND = { name: "roles", type: 1, description: "Poster ici le panneau des rôles, un bouton par rôle (encadrement)", default_member_permissions: MANAGE_ROLES } as const;

/** Les commandes que le script crée ou remet à jour, chacune à part : une autre commande de l'application ne bouge pas. */
export const COMMANDS = [CODE_COMMAND, FICHE_COMMAND, CLAN_COMMAND, RECORDS_COMMAND, CARTE_COMMAND, GUIDE_COMMAND, RIVAL_COMMAND, MOI_COMMAND, ROLES_COMMAND] as const;

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
  if (status === 401) return "Discord ne reconnaît pas le jeton : dans le portail développeur, onglet « Bot », cliquez sur « Reset Token » et collez le nouveau.";
  if (code === 50001 || status === 403) {
    return `L'application n'est pas encore sur le serveur du clan. Ouvrez ce lien, choisissez le serveur, puis relancez la commande : ${installUrl(applicationId)}`;
  }
  if (status === 404) return "Discord ne connaît pas ce numéro d'application ou de serveur : vérifiez les deux numéros.";
  return `Discord a refusé (${status}).`;
}
