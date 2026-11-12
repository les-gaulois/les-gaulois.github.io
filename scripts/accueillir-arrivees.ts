/**
 * Remplace les messages d'arrivée du serveur Discord du clan par une image de bienvenue. Lancé par la GitHub Action
 * `.github/workflows/victoires.yml`, toutes les 5 minutes, avant l'envoi des victoires.
 *   npm run arrivees:accueillir
 * Avec le jeton du robot des arrivées, dans le secret DISCORD_BOT_TOKEN de GitHub. Sans lui, ne fait rien. Ce robot est une
 * application Discord à part, pas celle de la connexion : voir « Les arrivées sur le serveur Discord » dans le README. Le
 * serveur est celui de src/lib/discord-commande.ts, sauf DISCORD_GUILD_ID ; le salon, celui de src/lib/arrivees-discord.ts.
 * Rien n'est gardé ni noté : voir src/lib/arrivees.ts. Pour voir les images sans rien envoyer : npm run arrivees:apercu.
 */
import { clan } from "../config/clan";
import { ARRIVALS_CHANNEL_ID, arrivalsPass, looksLikeToken } from "../src/lib/arrivees-discord";
import { GUILD_ID, isSnowflake } from "../src/lib/discord-commande";

// Le jeton seul : s'il a été collé avec « Bot » devant, comme dans un en-tête, ce mot part.
const token = (process.env["DISCORD_BOT_TOKEN"] ?? "").trim().replace(/^Bot\s+/i, "");
if (token === "") {
  console.log("Pas de jeton du robot (secret DISCORD_BOT_TOKEN) : aucun message d'arrivée remplacé.");
  process.exit(0);
}
const guildId = (process.env["DISCORD_GUILD_ID"] ?? "").trim() || GUILD_ID;
if (!isSnowflake(guildId) || !isSnowflake(ARRIVALS_CHANNEL_ID)) {
  console.log("::warning::Arrivées : le numéro du serveur ou du salon Discord n'a pas la forme attendue, rien n'est fait.");
  process.exit(1);
}
// Un secret qui n'a pas la forme d'un jeton de robot : le passage essaie quand même, et Discord tranchera, mais le journal
// dit où chercher. Le secret lui-même n'est jamais écrit.
if (!looksLikeToken(token)) {
  console.log("::warning::Arrivées : le secret DISCORD_BOT_TOKEN n'a pas la forme d'un jeton de robot. Ce n'est ni le « Client Secret » ni la « Public Key » : portail développeur, application du robot des arrivées, onglet « Bot », « Reset Token », puis « Copy ».");
}

try {
  // Chargés seulement ici : sans jeton, le passage ne lit ni police ni logo.
  const { GazetteFonts } = await import("../src/lib/gazette-image");
  const { arrivalAlt, renderArrival, WarriorAssets } = await import("../src/lib/arrivees-image");
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const warrior = new WarriorAssets(root);
  const result = await arrivalsPass({
    token,
    guildId,
    channelId: ARRIVALS_CHANNEL_ID,
    fetch,
    now: Date.now(),
    // Le nom s'écrit dans la police des titres : seuls les caractères qu'elle dessine restent.
    draws: (char) => fonts.draws(char, "name"),
    render: (drawing, avatar) => renderArrival(drawing, clan.links.site, fonts, warrior, avatar),
    alt: (phrase, fullName) => arrivalAlt(phrase, fullName, clan.tag),
    log: console.log,
  });
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le jeton : seul l'appel à Discord le reçoit, et rien ne sort de cet appel.
  console.log(`::warning::Arrivées : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
