/**
 * Crée la commande /code sur le serveur Discord du clan, ou la remet à jour (docs/DIRECTION.md, « Se connecter avec un
 * code »). Une seule fois, après avoir ajouté l'application au serveur :
 *   npm run discord:commande
 * L'application « Le Gaulois » et le serveur du clan sont ceux de src/lib/discord-commande.ts, sauf DISCORD_APPLICATION_ID
 * et DISCORD_GUILD_ID. Le jeton du robot se colle quand le script le demande : il ne s'affiche pas et n'est gardé nulle
 * part. Il peut aussi venir de DISCORD_BOT_TOKEN.
 */
import { APPLICATION_ID, CODE_COMMAND, GUILD_ID, commandUrl, explainRefusal } from "../src/lib/discord-commande";

const applicationId = (process.env["DISCORD_APPLICATION_ID"] ?? "").trim() || APPLICATION_ID;
const guildId = (process.env["DISCORD_GUILD_ID"] ?? "").trim() || GUILD_ID;

let url: string;
try {
  url = commandUrl(applicationId, guildId);
} catch (e) {
  console.error(`${e instanceof Error ? e.message : String(e)} Mettez-le dans DISCORD_APPLICATION_ID et DISCORD_GUILD_ID.`);
  process.exit(2);
}

const ENTER = [String.fromCharCode(13), String.fromCharCode(10)];
const CTRL_C = String.fromCharCode(3);
const ERASE = [String.fromCharCode(8), String.fromCharCode(127)];

/** Lit le jeton sans l'afficher. Hors d'un vrai terminal, lit simplement la première ligne. */
function askToken(): Promise<string> {
  process.stdout.write("Jeton du robot (onglet « Bot » du portail développeur, rien ne s'affiche) : ");
  const stdin = process.stdin;
  return new Promise((resolve) => {
    let value = "";
    const done = () => {
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(value.trim());
    };
    const onData = (chunk: Buffer | string) => {
      for (const c of chunk.toString()) {
        if (ENTER.includes(c)) return done();
        if (c === CTRL_C) process.exit(130);
        value = ERASE.includes(c) ? value.slice(0, -1) : value + c;
      }
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

const token = (process.env["DISCORD_BOT_TOKEN"] ?? "").trim() || (await askToken());
if (token === "") {
  console.error("Aucun jeton : rien n'est envoyé.");
  process.exit(2);
}

let response: Response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(CODE_COMMAND),
  });
} catch (e) {
  console.error(`Discord ne répond pas : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

if (response.ok) {
  console.log(`La commande /${CODE_COMMAND.name} est en place sur le serveur du clan. Essayez-la : tapez /${CODE_COMMAND.name} dans un salon.`);
  process.exit(0);
}
console.error(explainRefusal(response.status, await response.text(), applicationId));
process.exit(1);
