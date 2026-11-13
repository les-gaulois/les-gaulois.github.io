/**
 * En secours seulement : depuis le 13 novembre 2026, la fonction `code-discord` crée elle-même ses commandes après chaque
 * mise en ligne (`supabase/functions/code-discord/inscription.ts` ; docs/DIRECTION.md, « Les commandes Discord se créent
 * seules »), sans « Reset Token ». Ce script ne sert que si elle n'y arrive pas alors que Discord accepte son jeton.
 *
 * Crée les commandes du serveur Discord du clan, ou les remet à jour : /code, /fiche, les commandes du robot (/clan,
 * /records, /carte, /guide, /rival, /moi), /roles, /tickets et /concours ; voir docs/DIRECTION.md, « Se connecter avec un
 * code », « La commande /fiche », « Les commandes du robot », « Les rôles sur Discord », « Les tickets d'assistance » et
 * « Les concours sur Discord ». En secours, depuis le poste du pilote :
 *   npm run discord:commande
 * Chaque commande s'envoie à part : Discord crée celle qui manque et remplace celle qui existe, sans toucher aux autres.
 * L'application « Le Gaulois » et le serveur du clan sont ceux de src/lib/discord-commande.ts, sauf DISCORD_APPLICATION_ID
 * et DISCORD_GUILD_ID. Le jeton du robot vient de LE_GAULOIS_BOT_TOKEN, sinon du presse-papiers de Windows (copié par le
 * bouton « Copy » du portail développeur, puis remplacé), sinon de l'écran, où chaque signe tapé s'affiche en étoile. Il
 * ne s'affiche jamais. Depuis le panneau des rôles, la fonction garde ce jeton : le script le laisse donc dans le
 * presse-papiers et dit, à la fin, de le coller aussi dans le secret LE_GAULOIS_BOT_TOKEN de Supabase, pour les rôles, les tickets et les concours, puis de vider
 * l'historique du presse-papiers de Windows (Win+V), sans nouveau « Reset Token ». Les commandes, elles, restent.
 */
import { execFileSync } from "node:child_process";
import { APPLICATION_ID, COMMANDS, GUILD_ID, commandUrl, explainRefusal, looksLikeBotToken, retryAfterMs } from "../src/lib/discord-commande";

const applicationId = (process.env["DISCORD_APPLICATION_ID"] ?? "").trim() || APPLICATION_ID;
const guildId = (process.env["DISCORD_GUILD_ID"] ?? "").trim() || GUILD_ID;

let url: string;
try {
  url = commandUrl(applicationId, guildId);
} catch (e) {
  console.error(`${e instanceof Error ? e.message : String(e)} Mettez-le dans DISCORD_APPLICATION_ID et DISCORD_GUILD_ID.`);
  process.exit(2);
}

/** Le presse-papiers de Windows, s'il contient un jeton de robot. Rien n'est affiché. */
function tokenFromClipboard(): string {
  if (process.platform !== "win32") return "";
  try {
    const text = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return looksLikeBotToken(text, applicationId) ? text : "";
  } catch {
    return "";
  }
}

const RESET = [
  "Dernière étape, obligatoire : le jeton qui vient de servir reste valable, et la fonction en a besoin pour les boutons des rôles, pour les tickets et pour les concours.",
  "- Collez-le maintenant dans Supabase, dans le secret LE_GAULOIS_BOT_TOKEN de la fonction (Edge Functions, puis Secrets), et enregistrez. S'il n'est plus dans le presse-papiers, refaites « Reset Token » puis « Copy », et collez le nouveau : les commandes restent.",
  "- Puis videz l'historique du presse-papiers de Windows (Win+V, puis « Effacer tout »). Pas de nouveau « Reset Token » : il arrêterait les rôles, les tickets et les concours jusqu'à ce que le nouveau jeton soit recollé dans le secret.",
  "Les images de bienvenue ont leur propre robot : ce jeton ne les touche pas. Voir docs/DIRECTION.md, « Les rôles sur Discord », « Les tickets d'assistance » et « Les concours sur Discord ».",
].join("\n");

const ENTER = [String.fromCharCode(13), String.fromCharCode(10)];
const CTRL_C = String.fromCharCode(3);
const ERASE = [String.fromCharCode(8), String.fromCharCode(127)];

/** Lit le jeton à l'écran : chaque signe s'affiche en étoile. Hors d'un vrai terminal, lit simplement la première ligne. */
function askToken(): Promise<string> {
  console.log("Aucun jeton dans le presse-papiers. Copiez-le (portail développeur, onglet Bot, « Reset Token » puis « Copy »),");
  console.log("puis collez-le ici (clic droit) et appuyez sur Entrée. Ne copiez rien d'autre avant de l'avoir aussi collé dans Supabase.");
  process.stdout.write("Jeton du robot : ");
  const stdin = process.stdin;
  return new Promise((resolve) => {
    let value = "";
    const done = () => {
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdin.off("end", done);
      process.stdout.write("\n");
      resolve(value.trim());
    };
    const onData = (chunk: Buffer | string) => {
      for (const c of chunk.toString()) {
        if (ENTER.includes(c)) return done();
        if (c === CTRL_C) process.exit(130);
        if (ERASE.includes(c)) {
          if (value.length > 0 && stdin.isTTY) process.stdout.write("\b \b");
          value = value.slice(0, -1);
        } else {
          value += c;
          if (stdin.isTTY) process.stdout.write("*");
        }
      }
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    stdin.on("end", done);
  });
}

// Pas DISCORD_BOT_TOKEN : ce nom est celui du jeton d'un autre robot, « Bienvenue Gaulois », celui des images de bienvenue.
let token = (process.env["LE_GAULOIS_BOT_TOKEN"] ?? "").trim();
let fromClipboard = false;
if (token === "") {
  token = tokenFromClipboard();
  fromClipboard = token !== "";
  if (fromClipboard) console.log("Jeton du robot lu dans le presse-papiers (il ne s'affiche pas).");
}
if (token === "") token = await askToken();
if (token === "") {
  console.error("Aucun jeton : rien n'est envoyé.");
  process.exit(2);
}

/** Une commande, envoyée à Discord. S'il répond « trop de demandes » (429), elle repart après l'attente qu'il demande, trois fois au plus. */
async function send(command: (typeof COMMANDS)[number]): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    const wait = attempt < 3 ? retryAfterMs(response.status, await response.clone().text()) : null;
    if (wait === null) return response;
    console.log(`/${command.name} : Discord demande d'attendre ${Math.ceil(wait / 1000)} s, puis la commande repart.`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

// Une commande après l'autre ; au premier refus, les suivantes n'auraient pas plus de chance (jeton, application absente).
const answers: { name: string; response: Response | null; failure: string }[] = [];
for (const command of COMMANDS) {
  try {
    const response = await send(command);
    answers.push({ name: command.name, response, failure: "" });
    if (!response.ok) break;
  } catch (e) {
    answers.push({ name: command.name, response: null, failure: e instanceof Error ? e.message : String(e) });
    break;
  }
}
// Le jeton reste dans le presse-papiers : il va aussi dans le secret de la fonction, puis l'historique se vide à la main
// (RESET). Le vider ici obligerait à refaire un Reset Token pour le secret.

// Discord a accepté le jeton au moins une fois : la marche à suivre pour lui, même si une commande suivante est refusée.
const tokenUsed = answers.some(({ response }) => response?.ok === true);
for (const { name, response, failure } of answers) {
  if (response === null || !response.ok) {
    console.error(`/${name} : ${response === null ? `Discord ne répond pas : ${failure}` : explainRefusal(response.status, await response.text(), applicationId)}`);
    if (tokenUsed) console.log(RESET);
    process.exit(1);
  }
  console.log(`La commande /${name} est en place sur le serveur du clan.`);
}
console.log("Essayez-les : tapez /fiche dans un salon, puis le début d'un pseudo ; ou /clan, /records, /carte, /guide, /rival, /moi.");
console.log("Le panneau des rôles : /roles, tapé par l'encadrement dans le salon où il doit rester.");
console.log("/tickets, réservée à qui gère le serveur, pose le guichet des tickets dans le salon où elle est tapée.");
console.log("/concours, réservée à qui gère le serveur : /concours lancer dans le salon du concours, puis terminer, annuler, remplacer.");
console.log(RESET);
process.exit(0);
