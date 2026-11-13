/**
 * Se connecter sans lier son compte Discord (docs/DIRECTION.md, « Se connecter avec un code ») : dans le serveur Discord du
 * clan, le joueur tape /code ; ce robot lui montre un code, à lui seul ; il le tape sur le site, qui ouvre sa session.
 * Une fonction serveur de Supabase (Deno), à trois portes :
 *
 * - `POST …/code-discord/discord` : l'adresse des interactions de l'application Discord. Discord y envoie chaque commande,
 *   signée de sa clé. La fonction vérifie la signature et l'heure, que la commande vient du serveur du clan, garde
 *   l'empreinte d'un nouveau code (`discord_code_issue`), et répond au seul joueur qui l'a tapée.
 * - `POST …/code-discord/session` : le site y envoie le code tapé. S'il est bon (`discord_code_redeem`), la fonction
 *   retrouve le compte de ce Discord par son seul identifiant, ou le crée, marqué de cet identifiant dans ses métadonnées
 *   d'application, avec une adresse tirée au sort, puis lui donne son identifiant (`discord_code_attach`). Elle demande
 *   ensuite à Supabase de quoi ouvrir sa session : un lien magique qui n'est envoyé nulle part, dont elle vérifie qu'il
 *   ouvre bien ce compte, et dont le navigateur échange l'empreinte contre sa session (`verifyOtp`).
 * - `GET …/code-discord/etat` : dit si les réglages sont posés, sans en montrer aucun, si le moteur sait vérifier une
 *   signature (essayé sur l'exemple de la RFC 8032), si les fiches et l'index des commandes du site se lisent, si la
 *   fonction SQL de /moi est installée, et si Discord accepte le jeton du robot (`robot`).
 *
 * La porte de Discord répond aussi à /fiche (docs/DIRECTION.md, « La commande /fiche ») : pendant que le joueur tape un
 * pseudo, la fonction propose ceux des membres qui ont une fiche, lus dans `/fiches.json`, que le site publie avec ses pages
 * (`src/lib/fiches-discord.ts`) ; à l'envoi, elle montre à tout le salon l'image de la fiche, en grand, et un bouton vers sa
 * page. Elle ne lit rien d'autre, n'écrit rien, et ne connaît aucun membre sans pseudo : le site ne publie pas leur
 * identifiant.
 *
 * Et aux commandes du robot (« Les commandes du robot ») : /clan, /records, /carte, /guide et /rival montrent une image que
 * le site dessine à chaque construction, lue dans `/commandes.json` (`src/lib/commandes-discord.ts`) ; /moi demande au
 * serveur le pseudo du membre validé lié au Discord de qui la tape (`discord_moi`, clé de service), puis montre sa fiche.
 *
 * Et au panneau des rôles (« Les rôles sur Discord ») : /roles, réservée à qui peut gérer les rôles, poste dans le salon
 * l'image du panneau et ses boutons ; chaque bouton donne son rôle au membre qui clique, ou le lui retire, et le lui dit à lui
 * seul. Seuls les rôles écrits ici (`PANEL_ROLES`) se donnent. Il y faut le jeton du robot (`BOT_TOKEN_SECRET`).
 *
 * Et aux tickets d'assistance (« Les tickets d'assistance », `tickets.ts`) : /tickets pose le guichet, ses boutons et ses
 * formulaires ouvrent un salon privé par demande, puis le ferment, avec le même jeton (`deps.discord`).
 *
 * Et aux concours (« Les concours sur Discord », `concours.ts`) : /concours, ses boutons et son formulaire. Une autre
 * porte, `POST …/code-discord/concours/tic`, sert à la base, qui la réveille chaque minute quand un concours a besoin du
 * robot. Et `GET …/code-discord/concours/billet/17.png` (ou `gagnant`) donne à Discord l'image d'un billet de la tombola,
 * sans secret ni donnée : un numéro posé sur le fond que publie le site (`billets.ts`).
 *
 * Réglages : le jeton du robot « Le Gaulois », dans le secret `LE_GAULOIS_BOT_TOKEN` (`BOT_TOKEN_SECRET`), pour les rôles,
 * les tickets et les concours ; sans lui, tout le reste marche. Le serveur du clan, l'application et sa clé publique sont écrits plus bas,
 * publics tous trois ; les secrets `DISCORD_GUILD_ID`, `DISCORD_APPLICATION_ID` et `DISCORD_PUBLIC_KEY` les remplacent
 * s'ils sont posés. Supabase donne lui-même `SUPABASE_URL` et la clé de service. Déployée sans vérification de jeton
 * (`verify_jwt = false`, `supabase/config.toml`) : Discord n'en envoie pas, et la fonction vérifie elle-même chaque appel.
 * Elle ne note jamais un code, une adresse ni un jeton dans ses journaux.
 *
 * Cinq fichiers, `index.ts`, `tickets.ts`, `concours.ts`, `billets.ts` et `emojis.ts`, que la commande
 * `supabase functions deploy` envoie ensemble ; les tests du dépôt les lisent avec Node (`tests/unit/code-discord.test.ts`,
 * `tests/unit/tickets-discord.test.ts`, `tests/unit/concours-discord.test.ts`, `tests/unit/billets-tombola.test.ts`,
 * `tests/unit/emojis-discord.test.ts`).
 */
import { TICKET_PREFIX, TICKETS_COMMAND_NAME, ticketInteraction, ticketsCommand } from "./tickets.ts";
import { CONCOURS_COMMAND_NAME, CONCOURS_PREFIX, concoursCommand, concoursImage, concoursInteraction, concoursTic } from "./concours.ts";
import { buttonEmoji, ensureEmojis, vignetteUrl, type EmojiIds } from "./emojis.ts";

/** Le nom de la commande, tel que le joueur la tape. `scripts/discord-commande.ts` la crée sur le serveur du clan. */
export const COMMAND_NAME = "code";
/** Sans les signes qui se confondent (0 et O, 1, I et L) : 31 signes, et plus de 850 milliards de codes de huit signes. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
/** Le site, où l'on tape le code. */
export const SITE_URL = "https://les-gaulois.github.io";
/**
 * Le serveur Discord du clan et la clé publique de l'application de la connexion, « Le Gaulois » : publics tous deux, lus le
 * 12 novembre 2026, le premier dans l'invitation du clan (`config/clan.ts`), la seconde dans les informations publiques de
 * l'application (`/applications/1473059048546107434/rpc`). Les secrets DISCORD_GUILD_ID et DISCORD_PUBLIC_KEY de la fonction
 * les remplacent s'ils sont posés, pour une autre application ou un autre serveur.
 */
export const GAL_GUILD_ID = "1350905494600024094";
export const APP_PUBLIC_KEY = "d9d55bd88a96ebd72728cfd0a87b494065dd9b094f1a9254e24640ee02441855";
/**
 * Le numéro de l'application « Le Gaulois », public lui aussi (celui de `src/lib/discord-commande.ts`) : c'est aussi celui de
 * son robot. Le jeton gardé pour les tickets doit être le sien, sinon `/etat` dit `"robot":false`. Le secret
 * DISCORD_APPLICATION_ID le remplace.
 */
export const GAL_APPLICATION_ID = "1473059048546107434";
/** Discord date chaque commande qu'il signe : au-delà de cinq minutes d'écart, elle ne vaut plus. */
const MAX_SKEW_SECONDS = 300;
/** Une réponse que seul le joueur voit. */
const EPHEMERAL = 64;

/* ---------- Le robot : ses appels à l'API de Discord ---------- */

/** L'API de Discord, version 10. */
export const DISCORD_API = "https://discord.com/api/v10";
/** Ce que les règles de Discord demandent qu'un robot dise de lui à chaque appel. */
const DISCORD_USER_AGENT = `DiscordBot (${SITE_URL}, 1.0)`;
/**
 * Le secret de la fonction qui garde le jeton du robot « Le Gaulois » : les tickets s'en servent pour ouvrir et fermer des
 * salons. À ne pas confondre avec le secret GitHub DISCORD_BOT_TOKEN, qui est celui d'une autre application, « Bienvenue
 * Gaulois », le robot des images de bienvenue.
 */
export const BOT_TOKEN_SECRET = "LE_GAULOIS_BOT_TOKEN";
/** Le délai d'un appel à Discord, faute d'autre : dans une tâche de fond, rien ne presse. */
const DISCORD_TIMEOUT_MS = 8000;
/** Au plus une fois toutes les dix minutes, `/etat` demande à Discord s'il accepte le jeton : la page est publique. */
const BOT_CHECK_MS = 10 * 60_000;

/** Une réponse de l'API de Discord : son statut, et son corps lu en JSON (`null` s'il est vide ou illisible). */
export interface DiscordReply {
  status: number;
  body: unknown;
}

/** Un fichier joint à un message : son nom, son type et ses octets. */
export interface DiscordFile {
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Les options d'un appel à l'API de Discord. */
export interface DiscordCall {
  /** Envoyé en JSON ; avec des fichiers joints, dans la partie `payload_json`. */
  body?: unknown;
  /** Des fichiers joints : l'appel part alors en plusieurs parties, le n-ième fichier sous `files[n]`. */
  files?: DiscordFile[];
  /** La raison écrite au journal d'audit du serveur Discord, 512 signes au plus. */
  reason?: string;
  /** Le délai, en millisecondes : huit secondes sans autre précision. Avant une réponse due en trois secondes, bien moins. */
  timeoutMs?: number;
}

/** Le numéro du robot : le premier morceau de son jeton, écrit en base64. "" si le jeton n'a pas cette forme. */
export function botIdOf(token: string): string {
  const parts = token.split(".");
  const [first = ""] = parts;
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(first)) return "";
  try {
    const id = atob(first.replace(/-/g, "+").replace(/_/g, "/"));
    return /^[0-9]{17,20}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

/**
 * Un chemin de l'API tel que le journal l'écrit : sans le jeton d'une interaction, qui ouvre ses réponses pendant quinze
 * minutes, ni le numéro d'un joueur (un rôle donné ou retiré : « /guilds/…/members/<membre>/roles/… » ; un compte ; ses
 * droits dans un salon : « /channels/…/permissions/<joueur> »). Règle commune aux rôles, aux tickets et au concours.
 */
export const pathForLog = (path: string): string =>
  path
    .replace(/^(\/webhooks\/[0-9]+\/)[^/?]+/, "$1…")
    .replace(/\/(members|users|permissions)\/[0-9]{17,20}/g, "/$1/…")
    .split("?")[0] ?? "";

/** Ce dont la fonction a besoin du monde : remplacé dans les tests. */
export interface Deps {
  publicKey: string;
  guildId: string;
  serviceReady: boolean;
  nowSeconds(): number;
  randomBytes(n: number): Uint8Array<ArrayBuffer>;
  /** Une fonction SQL avec la clé de service : sa réponse, ou `null` si le serveur ne répond pas. */
  rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  /** Crée le compte d'un joueur au code, son identifiant Discord dans ses métadonnées d'application. Son numéro, ou `null`. */
  createUser(email: string, discordId: string): Promise<string | null>;
  deleteUser(id: string): Promise<void>;
  /** L'empreinte du lien magique du compte à cette adresse, et le numéro de ce compte, ou `null`. Rien n'est envoyé. */
  magicLink(email: string): Promise<{ tokenHash: string; userId: string } | null>;
  /** Les fiches que publie le site (`FICHES_URL`), ou `null` s'il ne répond pas et qu'il ne reste aucune lecture de moins de deux heures. */
  fiches(): Promise<FicheList | null>;
  /** L'index des commandes que publie le site (`COMMANDES_URL`), aux mêmes conditions que les fiches. */
  commandes(): Promise<CommandIndex | null>;
  /** Une image PNG du site, par son chemin : ses octets, ou `null` si le site ne la donne pas. */
  siteImage(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
  log(message: string): void;
  /** Le numéro du robot, lu dans son jeton (`BOT_TOKEN_SECRET`) ; "" sans jeton lisible. */
  botId: string;
  /**
   * Un appel à l'API de Discord avec le jeton du robot : `path` commence par « / », sans « /api/v10 » (« /guilds/… »).
   * `null` : pas de jeton, Discord injoignable ou délai dépassé. Si Discord demande d'attendre (429) cinq secondes au plus,
   * l'appel repart une fois. Le jeton ne s'écrit jamais dans les journaux.
   */
  discord(method: string, path: string, call?: DiscordCall): Promise<DiscordReply | null>;
  /**
   * Un appel au webhook d'une interaction, sans le jeton du robot : `path` commence par « /webhooks/<application>/<jeton de
   * l'interaction> ». Il modifie la réponse (`/messages/@original`) ou envoie une suite, dans les quinze minutes.
   */
  webhook(method: string, path: string, call?: DiscordCall): Promise<DiscordReply | null>;
  /**
   * Discord accepte-t-il le jeton du robot, et est-ce bien celui de « Le Gaulois » ? Demandé au plus une fois toutes les dix
   * minutes ; `false` sans jeton, ou avec celui d'un autre robot.
   */
  botAccepted(): Promise<boolean>;
  /** Fait durer une tâche après la réponse à Discord (`EdgeRuntime.waitUntil`). Ses erreurs vont au journal. */
  background(task: Promise<unknown>): void;
  sleep(ms: number): Promise<void>;
  /** L'adresse du projet Supabase (`SUPABASE_URL`) : les concours y trouvent les images de l'inventaire et l'adresse de leur réveil. */
  projectUrl?: string;
}

/* ---------- Le code ---------- */

export function newCode(randomBytes: (n: number) => Uint8Array): string {
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      // 248 = 8 × 31 : au-delà, le reste de la division favoriserait les premiers signes.
      if (byte < 248 && code.length < CODE_LENGTH) code += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
    }
  }
  return code;
}

/** Le code tel que le joueur l'a tapé : minuscules, espaces et tiret acceptés. `null` s'il ne peut pas être un code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const c of code) if (!CODE_ALPHABET.includes(c)) return null;
  return code;
}

export const formatCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * L'adresse e-mail d'un compte ouvert avec un code : Supabase en veut une, Discord n'en donne pas par ce chemin. Le domaine
 * .invalid n'existe nulle part (RFC 2606) : aucun message n'y part. Sa fin est tirée au sort : personne ne peut prendre
 * d'avance l'adresse d'un autre joueur.
 */
export function codeAccountEmail(discordId: string, randomBytes: (n: number) => Uint8Array): string {
  const tail = [...randomBytes(8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `discord-${discordId}-${tail}@code.gal.invalid`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- La signature de Discord ---------- */

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** La clé publique Ed25519 dans son enveloppe SPKI, pour un moteur qui n'importe pas la clé brute. */
export function ed25519Spki(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const prefix = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
  const spki = new Uint8Array(prefix.length + raw.length);
  spki.set(prefix);
  spki.set(raw, prefix.length);
  return spki;
}

async function verifyEd25519(key: Uint8Array<ArrayBuffer>, signature: Uint8Array<ArrayBuffer>, message: Uint8Array<ArrayBuffer>): Promise<boolean> {
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey("raw", key, { name: "Ed25519" }, false, ["verify"]);
  } catch {
    cryptoKey = await crypto.subtle.importKey("spki", ed25519Spki(key), { name: "Ed25519" }, false, ["verify"]);
  }
  return crypto.subtle.verify({ name: "Ed25519" }, cryptoKey, signature, message);
}

/** Discord signe l'heure suivie du corps de la requête, en Ed25519, avec la clé de l'application. */
export async function verifyDiscordSignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: string): Promise<boolean> {
  const key = hexToBytes(publicKeyHex);
  const signature = hexToBytes(signatureHex);
  if (!key || key.length !== 32 || !signature || signature.length !== 64 || timestamp === "") return false;
  try {
    return await verifyEd25519(key, signature, new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

/** Le premier exemple de la RFC 8032 (section 7.1) : une clé publique, et sa signature d'un message vide. */
const RFC8032_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const RFC8032_SIGNATURE = "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

/** Le moteur qui fait tourner la fonction sait-il vérifier une signature Ed25519 ? Essayé sur l'exemple de la RFC. */
export async function signatureWorks(): Promise<boolean> {
  try {
    return await verifyEd25519(hexToBytes(RFC8032_KEY) ?? new Uint8Array(0), hexToBytes(RFC8032_SIGNATURE) ?? new Uint8Array(0), new Uint8Array(0));
  } catch {
    return false;
  }
}

/* ---------- Les réponses ---------- */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

const ephemeral = (content: string): Response => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });

/** Le message du code, que Discord écrit à l'heure et dans la langue de chacun (`<t:…:t>`, `<t:…:R>`). */
export function codeMessage(code: string, expiresAt: number): string {
  return [
    `Votre code pour le site du clan : \`${formatCode(code)}\``,
    `Tapez-le sur ${SITE_URL}/compte#code avant <t:${expiresAt}:t> (<t:${expiresAt}:R>). Il ne sert qu'une fois.`,
    "Ne le donnez à personne : l'encadrement ne vous le demandera jamais.",
  ].join("\n");
}

export const MESSAGES = {
  wrongPlace: "Tapez /code dans le serveur Discord du clan.",
  tooMany: "Vous avez demandé cinq codes en dix minutes : attendez un peu avant le suivant.",
  down: "Le site ne répond pas pour l'instant. Réessayez dans un moment.",
  failed: "Le code n'a pas pu être créé. Réessayez dans un moment.",
  unknown: "Cette commande n'existe pas.",
};

/* ---------- Les portes ---------- */

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/* ---------- La fiche d'un membre : /fiche ---------- */

/** La commande qui montre la fiche d'un membre, et son option. `scripts/discord-commande.ts` les crée sur le serveur du clan. */
export const FICHE_COMMAND_NAME = "fiche";
export const FICHE_OPTION = "pseudo";
/** Les fiches que le site publie avec ses pages : une par membre avec pseudo (`src/lib/fiches-discord.ts`). */
export const FICHES_URL = `${SITE_URL}/fiches.json`;
/**
 * La fenêtre d'OpenFront où un joueur choisit son nom d'utilisateur, qui est son pseudo public dans la liste du clan
 * (`src/lib/pseudo-openfront.ts` : la même adresse, un test compare les deux).
 */
export const CHOOSE_NAME_URL = "https://openfront.io/#modal=change-username";
/** Discord montre 25 propositions au plus pendant la saisie. */
export const MAX_CHOICES = 25;
/** Un message « Components V2 » : l'image en grand, comme celle qu'enverrait un membre. */
const COMPONENTS_V2 = 32768;
/** Le temps laissé au site pour donner ses fiches : Discord attend une réponse en trois secondes, démarrage compris. */
const FICHES_TIMEOUT_MS = 1500;
/**
 * Des fiches lues servent cinq minutes. Si le site ne répond plus, celles d'avant servent encore deux heures, pas plus : un
 * membre parti, devenu anonyme ou dont le compte est supprimé ne doit pas rester proposé plus longtemps que sur le site. Après
 * un échec, la fonction ne réessaie pas avant trente secondes : chaque frappe n'attend pas le délai.
 */
export const FICHES_FRESH_MS = 5 * 60_000;
export const FICHES_STALE_MS = 2 * 60 * 60_000;
export const FICHES_RETRY_MS = 30_000;

export interface Fiche {
  /** L'identifiant public du membre, celui de l'adresse de sa fiche et de son image. */
  id: string;
  pseudo: string;
  /** La description de l'image, lue aux lecteurs d'écran ; `null` : pas d'image, le message part en texte. */
  alt: string | null;
  /** La version de l'image, tirée de son dessin par le site : `null` s'il ne la donne pas (voir `ficheImageUrl`). */
  v: string | null;
}

export interface FicheList {
  /** L'heure de la liste des membres, que l'image écrit. */
  listedAt: string;
  fiches: Fiche[];
}

/** L'identifiant public d'un membre : des lettres et des chiffres, huit au 12 novembre 2026. */
const FICHE_ID = /^[A-Za-z0-9]{1,32}$/;
/** La version d'une image, comme celles des images des commandes : des chiffres et des lettres minuscules. */
const FICHE_VERSION = /^[0-9a-z]{1,32}$/;

/** Le fichier du site, relu sans lui faire confiance : `null` s'il n'a pas la forme attendue. Une fiche mal formée est écartée. */
export function parseFiches(value: unknown): FicheList | null {
  const body = record(value);
  const listedAt = body?.["listedAt"];
  const list = body?.["fiches"];
  if (typeof listedAt !== "string" || !Number.isFinite(Date.parse(listedAt)) || !Array.isArray(list)) return null;
  const fiches: Fiche[] = [];
  for (const item of list) {
    const entry = record(item);
    const id = entry?.["id"];
    const pseudo = entry?.["pseudo"];
    const alt = entry?.["alt"];
    const v = entry?.["v"];
    if (typeof id !== "string" || !FICHE_ID.test(id) || typeof pseudo !== "string" || pseudo.trim() === "" || pseudo.length > 64) continue;
    fiches.push({ id, pseudo, alt: typeof alt === "string" && alt.trim() !== "" ? alt.slice(0, 1024) : null, v: typeof v === "string" && FICHE_VERSION.test(v) ? v : null });
  }
  return { listedAt, fiches };
}

/** Deux pseudos se comparent sans accents ni majuscules, espaces autour retirés. */
export const foldName = (text: string): string => text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * Un pseudo sans le nombre que le jeu ajoute à certains noms, comme dans « Brennos.1234 » : la forme numérotée d'un nom
 * gratuit, ou d'un nom déjà pris par un abonné (src/client/components/UsernamePanel.ts du jeu, commit aac56bb).
 */
const baseName = (pseudo: string): string => pseudo.replace(/\.\d+$/, "");

/** Les propositions pendant la saisie : les pseudos qui commencent par ce qui est tapé, puis ceux qui le contiennent. */
export function ficheChoices(list: FicheList, typed: string): { name: string; value: string }[] {
  const query = foldName(typed);
  const ranked = list.fiches.flatMap((fiche) => {
    const name = foldName(fiche.pseudo);
    const rank = name.startsWith(query) ? 0 : name.includes(query) ? 1 : -1;
    return rank < 0 ? [] : [{ fiche, rank }];
  });
  ranked.sort((a, b) => a.rank - b.rank || a.fiche.pseudo.localeCompare(b.fiche.pseudo, "fr"));
  return ranked.slice(0, MAX_CHOICES).map(({ fiche }) => ({ name: fiche.pseudo.slice(0, 100), value: fiche.id }));
}

export type FicheMatch = { kind: "one"; fiche: Fiche } | { kind: "many" } | { kind: "none" };

/**
 * Le membre demandé. Une proposition choisie porte son identifiant ; un pseudo tapé en entier se reconnaît sans accents ni
 * majuscules, ou sans le nombre que le jeu ajoute à certains noms. Si deux pseudos conviennent, la commande demande de choisir.
 */
export function findFiche(list: FicheList, typed: string): FicheMatch {
  const value = typed.trim();
  const byId = list.fiches.find((fiche) => fiche.id === value);
  if (byId) return { kind: "one", fiche: byId };
  const query = foldName(value);
  if (query === "") return { kind: "none" };
  for (const same of [(fiche: Fiche) => foldName(fiche.pseudo) === query, (fiche: Fiche) => foldName(baseName(fiche.pseudo)) === query]) {
    const [first, second] = list.fiches.filter(same);
    if (first && !second) return { kind: "one", fiche: first };
    if (second) return { kind: "many" };
  }
  return { kind: "none" };
}

/** Un texte tapé par un joueur, redit dans une réponse : sur une ligne, court, sans mise en forme ni lien possibles. */
export const escapeDiscord = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .replace(/[\\*_~`|>#\-[\]():/<@]/g, "\\$&");

/** La page de la fiche, comme dans les autres messages du robot (`profileUrl`, src/lib/paliers-franchis-discord.ts). */
export const ficheUrl = (id: string): string => `${SITE_URL}/membres/${encodeURIComponent(id)}/`;

/**
 * L'image de la fiche, dessinée à la construction du site. Sa version est celle que le site tire de son dessin (`v`) : quand
 * l'image change, chiffres ou style, l'adresse change, et Discord ne montre pas celle qu'il a gardée. Sans `v` (un site
 * d'avant le 12 novembre 2026), elle suit la liste des membres, relue une fois par jour.
 */
export const ficheImageUrl = (id: string, listedAt: string, v: string | null = null): string =>
  `${SITE_URL}/generated/fiches/${encodeURIComponent(id)}.png?v=${v ?? Date.parse(listedAt).toString(36)}`;

/** Ce que voit tout le salon : l'image de la fiche en grand et un bouton vers sa page. Sans image, une ligne de texte. */
export function ficheMessage(fiche: Fiche, listedAt: string): Record<string, unknown> {
  const button = { type: 1, components: [{ type: 2, style: 5, label: `Voir la fiche de ${fiche.pseudo}`.slice(0, 80), url: ficheUrl(fiche.id) }] };
  if (fiche.alt === null) return { content: `La fiche de ${escapeDiscord(fiche.pseudo)} :`, components: [button], allowed_mentions: { parse: [] } };
  return {
    flags: COMPONENTS_V2,
    components: [{ type: 12, items: [{ media: { url: ficheImageUrl(fiche.id, listedAt, fiche.v) }, description: fiche.alt }] }, button],
    allowed_mentions: { parse: [] },
  };
}

export const FICHE_MESSAGES = {
  wrongPlace: "Tapez /fiche dans le serveur Discord du clan.",
  down: "La liste des fiches ne répond pas pour l'instant. Réessayez dans un moment.",
  many: (typed: string): string => `Plusieurs pseudos s'écrivent « ${escapeDiscord(typed)} » : choisissez le bon dans la liste qui s'ouvre pendant que vous tapez.`,
  // Les adresses entre chevrons : Discord ne les déplie pas en cartes d'aperçu.
  none: (typed: string): string =>
    [
      `Aucune fiche à ce nom : « ${escapeDiscord(typed)} ».`,
      `Un membre sans pseudo public n'en a pas. Pour choisir le sien, avec le compte qui est dans le clan : <${CHOOSE_NAME_URL}>`,
      `Le site relit la liste des membres une fois par jour : <${SITE_URL}/liste/>`,
    ].join("\n"),
};

const choicesReply = (choices: { name: string; value: string }[]): Response => json({ type: 8, data: { choices } });

/** La valeur d'une option de la commande, telle que Discord l'envoie. */
function optionValue(data: Record<string, unknown>, name: string): string {
  const options = data["options"];
  if (!Array.isArray(options)) return "";
  for (const option of options) {
    const entry = record(option);
    const value = entry?.["value"];
    if (entry?.["name"] === name && typeof value === "string") return value.slice(0, 100);
  }
  return "";
}

/** /fiche : les propositions pendant la saisie (type 4), puis la fiche à l'envoi (type 2). Rien n'est écrit nulle part. */
async function ficheRoute(interaction: Record<string, unknown>, data: Record<string, unknown>, deps: Deps): Promise<Response> {
  const typing = interaction["type"] === 4;
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId) return typing ? choicesReply([]) : ephemeral(FICHE_MESSAGES.wrongPlace);
  const typed = optionValue(data, FICHE_OPTION);
  const list = await deps.fiches();
  if (typing) return choicesReply(list ? ficheChoices(list, typed) : []);
  if (!list) return ephemeral(FICHE_MESSAGES.down);
  const found = findFiche(list, typed);
  if (found.kind === "one") return json({ type: 4, data: ficheMessage(found.fiche, list.listedAt) });
  return ephemeral(found.kind === "many" ? FICHE_MESSAGES.many(typed) : FICHE_MESSAGES.none(typed));
}

/* ---------- Les commandes du robot : /clan, /records, /carte, /guide, /rival, /moi ---------- */

/** Leurs noms et leurs options, tels que `scripts/discord-commande.ts` les crée : un test le vérifie. */
export const CLAN_COMMAND = "clan";
export const RECORDS_COMMAND = "records";
export const CARTE_COMMAND = "carte";
export const GUIDE_COMMAND = "guide";
export const GUIDE_OPTION = "chapitre";
export const RIVAL_COMMAND = "rival";
export const RIVAL_OPTION = "clan";
export const MOI_COMMAND = "moi";
const ROBOT_COMMANDS: ReadonlySet<string> = new Set([FICHE_COMMAND_NAME, CLAN_COMMAND, RECORDS_COMMAND, CARTE_COMMAND, GUIDE_COMMAND, RIVAL_COMMAND, MOI_COMMAND]);
/** L'index des commandes que le site publie avec ses pages (`src/lib/commandes-discord.ts`). */
export const COMMANDES_URL = `${SITE_URL}/commandes.json`;

export interface CommandEntry {
  /** L'adresse de l'image depuis la racine du site, avec sa version. */
  image: string;
  /** Sa description, lue aux lecteurs d'écran. */
  alt: string;
  /** La page du site où mène le bouton. */
  page: string;
}

export interface CommandIndex {
  clan: CommandEntry | null;
  records: CommandEntry | null;
  carte: CommandEntry | null;
  /** L'image du guichet des tickets, que pose /tickets (`tickets.ts`). */
  guichet: CommandEntry | null;
  guide: (CommandEntry & { id: string; court: string })[];
  rivaux: (CommandEntry & { tag: string; rank: number })[];
  /** L'image du panneau des rôles (/roles), sans page : ses boutons donnent les rôles. */
  roles: PanelEntry | null;
  /** Les émojis du robot, que la fonction dépose chez Discord (`ensureEmojis`) : leur nom et l'adresse de leur PNG. */
  emojis: IconImage[];
  /** Les vignettes des rôles et des demandes de ticket : le nom de l'icône et l'adresse de son PNG. */
  vignettes: IconImage[];
}

export interface PanelEntry {
  image: string;
  alt: string;
}

/** Une image d'icône du site, par son nom : un émoji (« gal_cor ») ou une vignette (« epees »). */
export interface IconImage {
  name: string;
  image: string;
}

/** Les noms d'émojis et d'icônes que lit la fonction : des minuscules et des tirets bas, comme Discord les accepte. */
const ICON_NAME = /^[a-z_]{2,32}$/;

function parseIcons(value: unknown): IconImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const name = record(item)?.["name"];
    const image = sitePath(record(item)?.["image"]);
    return typeof name === "string" && ICON_NAME.test(name) && image ? [{ name, image }] : [];
  });
}

/** Un chemin du site, sans hôte, sans « .. » et sans rien d'autre qu'une version et une ancre : un bouton ne mène que sur le site. */
const SITE_PATH = /^\/(?!\/)[A-Za-z0-9/_.-]*(\?v=[0-9a-z]{1,32})?(#[A-Za-z0-9_-]{1,80})?$/;
const sitePath = (value: unknown): string | null => (typeof value === "string" && SITE_PATH.test(value) && !value.includes("..") ? value : null);

function parseEntry(value: unknown): CommandEntry | null {
  const entry = record(value);
  const image = sitePath(entry?.["image"]);
  const page = sitePath(entry?.["page"]);
  const alt = entry?.["alt"];
  if (!image || !page || typeof alt !== "string" || alt.trim() === "") return null;
  return { image, page, alt: alt.slice(0, 1024) };
}

/** L'index du site, relu sans lui faire confiance : `null` s'il n'a pas la forme attendue ; une entrée mal formée est écartée. */
export function parseCommandes(value: unknown): CommandIndex | null {
  const body = record(value);
  const guideList = body?.["guide"];
  const rivalList = body?.["rivaux"];
  if (!body || !Array.isArray(guideList) || !Array.isArray(rivalList)) return null;
  const guide = guideList.flatMap((item) => {
    const entry = parseEntry(item);
    const id = record(item)?.["id"];
    const court = record(item)?.["court"];
    return entry && typeof id === "string" && /^[0-9]{2}-[a-z0-9-]{1,60}$/.test(id) && typeof court === "string" && court.trim() !== "" && court.length <= 60 ? [{ ...entry, id, court }] : [];
  });
  const rivaux = rivalList.flatMap((item) => {
    const entry = parseEntry(item);
    const tag = record(item)?.["tag"];
    const rank = record(item)?.["rank"];
    return entry && typeof tag === "string" && /^[A-Z0-9]{1,10}$/.test(tag) && typeof rank === "number" && Number.isInteger(rank) && rank >= 1 ? [{ ...entry, tag, rank }] : [];
  });
  return {
    clan: parseEntry(body["clan"]),
    records: parseEntry(body["records"]),
    carte: parseEntry(body["carte"]),
    guichet: parseEntry(body["guichet"]),
    guide,
    rivaux,
    roles: parsePanel(body["roles"]),
    emojis: parseIcons(body["emojis"]),
    vignettes: parseIcons(body["vignettes"]),
  };
}

function parsePanel(value: unknown): PanelEntry | null {
  const entry = record(value);
  const image = sitePath(entry?.["image"]);
  const alt = entry?.["alt"];
  if (!image || typeof alt !== "string" || alt.trim() === "") return null;
  return { image, alt: alt.slice(0, 1024) };
}

/** Ce que voit tout le salon : l'image du site en grand et un bouton vers sa page. */
export function commandImageMessage(entry: CommandEntry, label: string): Record<string, unknown> {
  return {
    flags: COMPONENTS_V2,
    components: [
      { type: 12, items: [{ media: { url: `${SITE_URL}${entry.image}` }, description: entry.alt }] },
      { type: 1, components: [{ type: 2, style: 5, label: label.slice(0, 80), url: `${SITE_URL}${entry.page}` }] },
    ],
    allowed_mentions: { parse: [] },
  };
}

const rankWords = (rank: number): string => `${rank}${rank === 1 ? "er" : "e"}`;

/** Les chapitres proposés pendant la saisie : ceux dont le nom contient ce qui est tapé, dans l'ordre du guide. */
export function guideChoices(index: CommandIndex, typed: string): { name: string; value: string }[] {
  const query = foldName(typed);
  return index.guide
    .filter((c) => foldName(c.court).includes(query) || c.id.includes(query))
    .slice(0, MAX_CHOICES)
    .map((c) => ({ name: c.court.slice(0, 100), value: c.id }));
}

/** Le chapitre demandé : la proposition choisie porte son identifiant ; un nom tapé se reconnaît s'il ne désigne qu'un chapitre. */
export function findChapter(index: CommandIndex, typed: string): CommandIndex["guide"][number] | null {
  const value = typed.trim();
  const query = foldName(value);
  const exact = index.guide.find((c) => c.id === value) ?? index.guide.find((c) => foldName(c.court) === query);
  if (exact) return exact;
  if (query === "") return null;
  const [first, second] = index.guide.filter((c) => foldName(c.court).includes(query) || c.id.includes(query));
  return first && !second ? first : null;
}

/** Un tag tapé, avec ou sans crochets. */
const tagOf = (typed: string): string => typed.trim().replace(/^\[|\]$/g, "").trim().toUpperCase();

/** Les clans proposés pendant la saisie : les tags qui commencent par ce qui est tapé, puis ceux qui le contiennent, par rang. */
export function rivalChoices(index: CommandIndex, typed: string): { name: string; value: string }[] {
  const query = tagOf(typed);
  const ranked = index.rivaux.flatMap((r) => {
    const order = r.tag.startsWith(query) ? 0 : r.tag.includes(query) ? 1 : -1;
    return order < 0 ? [] : [{ r, order }];
  });
  ranked.sort((a, b) => a.order - b.order || a.r.rank - b.r.rank);
  return ranked.slice(0, MAX_CHOICES).map(({ r }) => ({ name: `[${r.tag}], ${rankWords(r.rank)} au classement`, value: r.tag }));
}

export const findRival = (index: CommandIndex, typed: string): CommandIndex["rivaux"][number] | null => index.rivaux.find((r) => r.tag === tagOf(typed)) ?? null;

export const COMMAND_MESSAGES = {
  wrongPlace: "Tapez cette commande dans le serveur Discord du clan.",
  down: "Le site ne répond pas pour l'instant. Réessayez dans un moment.",
  missing: "Pas de données pour l'instant : le site n'a pas encore cette image.",
  guideNone: (typed: string): string => `Aucun chapitre du guide à ce nom : « ${escapeDiscord(typed)} ». Choisissez dans la liste qui s'ouvre pendant que vous tapez, ou lisez le guide : <${SITE_URL}/debuter>`,
  rivalNone: (typed: string): string => `Aucun clan de la liste officielle, en dehors du nôtre, n'a ce tag : « ${escapeDiscord(typed)} ». Le classement : <${SITE_URL}/classement>`,
  notMember: `Le site ne sait pas encore qui vous êtes dans le clan. Connectez-vous sur <${SITE_URL}/compte> et faites-vous reconnaître : un officier confirme ensuite que c'est bien vous. En attendant, /fiche montre la fiche de n'importe quel membre.`,
  noPseudo: `Votre compte OpenFront n'a pas de pseudo public, donc pas de fiche. Pour en choisir un, avec le compte qui est dans le clan : <${CHOOSE_NAME_URL}>`,
  sharedPseudo: "Deux membres du clan portent votre pseudo : le site ne sait pas laquelle des deux fiches est la vôtre. Utilisez /fiche et choisissez-la dans la liste.",
  noFiche: "Votre fiche n'est pas encore sur le site : il relit la liste des membres une fois par jour.",
};

const entryReply = (entry: CommandEntry | null, label: string): Response => (entry ? json({ type: 4, data: commandImageMessage(entry, label) }) : ephemeral(COMMAND_MESSAGES.missing));

/**
 * /moi : le serveur donne le pseudo du membre validé lié à ce Discord, d'après la liste du clan qu'il relit (`discord_moi`,
 * clé de service seulement) ; la fiche vient ensuite du site, comme pour /fiche. L'identifiant Discord vient de la commande
 * signée par Discord, jamais d'autre chose.
 */
async function moiRoute(discordId: string, deps: Deps): Promise<Response> {
  const found = await deps.rpc("discord_moi", { p_discord_id: discordId });
  if (!found) return ephemeral(COMMAND_MESSAGES.down);
  if (found["ok"] !== true) {
    const error = found["error"];
    return ephemeral(error === "no_pseudo" ? COMMAND_MESSAGES.noPseudo : error === "shared_pseudo" ? COMMAND_MESSAGES.sharedPseudo : COMMAND_MESSAGES.notMember);
  }
  const pseudo = found["pseudo"];
  if (typeof pseudo !== "string") return ephemeral(COMMAND_MESSAGES.down);
  const list = await deps.fiches();
  if (!list) return ephemeral(COMMAND_MESSAGES.down);
  // Une seule fiche à ce pseudo, sinon celle d'un autre membre pourrait partir dans le salon.
  const [fiche, other] = list.fiches.filter((f) => foldName(f.pseudo) === foldName(pseudo));
  if (other) return ephemeral(COMMAND_MESSAGES.sharedPseudo);
  return fiche && fiche.pseudo === pseudo ? json({ type: 4, data: ficheMessage(fiche, list.listedAt) }) : ephemeral(COMMAND_MESSAGES.noFiche);
}

/** Les commandes du robot : les propositions pendant la saisie (type 4), puis la réponse à l'envoi (type 2). */
async function robotRoute(name: string, interaction: Record<string, unknown>, data: Record<string, unknown>, deps: Deps): Promise<Response> {
  if (name === FICHE_COMMAND_NAME) return ficheRoute(interaction, data, deps);
  const typing = interaction["type"] === 4;
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId) return typing ? choicesReply([]) : ephemeral(COMMAND_MESSAGES.wrongPlace);
  if (name === MOI_COMMAND) {
    const user = record(record(interaction["member"])?.["user"]);
    const id = user?.["id"];
    if (typing || user?.["bot"] === true || typeof id !== "string" || !/^[0-9]{17,20}$/.test(id)) return typing ? choicesReply([]) : ephemeral(COMMAND_MESSAGES.wrongPlace);
    return moiRoute(id, deps);
  }
  const index = await deps.commandes();
  if (typing) {
    if (!index) return choicesReply([]);
    if (name === GUIDE_COMMAND) return choicesReply(guideChoices(index, optionValue(data, GUIDE_OPTION)));
    if (name === RIVAL_COMMAND) return choicesReply(rivalChoices(index, optionValue(data, RIVAL_OPTION)));
    return choicesReply([]);
  }
  if (!index) return ephemeral(COMMAND_MESSAGES.down);
  switch (name) {
    case CLAN_COMMAND:
      return entryReply(index.clan, "Voir le classement");
    case RECORDS_COMMAND:
      return entryReply(index.records, "Voir les records");
    case CARTE_COMMAND:
      return entryReply(index.carte, "Voir la carte");
    case GUIDE_COMMAND: {
      const typed = optionValue(data, GUIDE_OPTION);
      const chapter = findChapter(index, typed);
      return chapter ? entryReply(chapter, `Lire « ${chapter.court} »`) : ephemeral(COMMAND_MESSAGES.guideNone(typed));
    }
    case RIVAL_COMMAND: {
      const typed = optionValue(data, RIVAL_OPTION);
      const rival = findRival(index, typed);
      return rival ? entryReply(rival, "Comparer sur le site") : ephemeral(COMMAND_MESSAGES.rivalNone(typed));
    }
    default:
      return ephemeral(MESSAGES.unknown);
  }
}

/* ---------- Les rôles du serveur : /roles et les boutons du panneau ---------- */

/** La commande qui poste le panneau des rôles dans le salon où on la tape. `scripts/discord-commande.ts` la crée. */
export const ROLES_COMMAND = "roles";
/** Le début du numéro de chaque bouton du panneau, suivi du rôle (« roles:tournois ») ou de `ROLE_SHOW`. */
export const ROLE_BUTTON = "roles:";
/** Le bouton « Mes rôles » : il montre ses rôles du panneau au seul membre qui clique. */
export const ROLE_SHOW = "voir";
/** L'image du panneau, jointe au message : Discord la garde, et le panneau ne dépend plus du site. */
export const PANEL_FILE = "roles.png";
/** Ce que le journal des actions du serveur écrit à côté de chaque rôle donné ou retiré. */
export const ROLE_AUDIT_REASON = "Panneau des rôles : clic du membre";

/**
 * Les rôles que donnent et retirent les boutons du panneau, et eux seuls : leur numéro est écrit ici, côté serveur, jamais lu
 * dans le bouton ni dans un fichier du site. Numéros donnés par le pilote le 12 novembre 2026. Le nom est celui du bouton ;
 * `pixel`, l'émoji du robot sur ce bouton (`emojis.ts`), et `icone`, sa vignette ; `emoji`, l'émoji ordinaire qui le
 * remplace tant que celui du robot n'est pas déposé. L'image du panneau (`src/lib/roles-discord.ts`) écrit les mêmes noms
 * dans le même ordre, avec les mêmes icônes : un test le vérifie.
 */
export const PANEL_ROLES: readonly { key: string; id: string; label: string; emoji: string; pixel: string; icone: string }[] = [
  { key: "rassemblement", id: "1353811132766224414", label: "Rassemblement", emoji: String.fromCodePoint(0x1f4ef), pixel: "gal_cor", icone: "cor" },
  { key: "giveaway", id: "1358882521986629793", label: "Giveaway", emoji: String.fromCodePoint(0x1f381), pixel: "gal_cadeau", icone: "cadeau" },
  { key: "tournois", id: "1516822966845968507", label: "Tournois", emoji: String.fromCodePoint(0x2694, 0xfe0f), pixel: "gal_epees", icone: "epees" },
  { key: "membre", id: "1350921119871402166", label: "Membre GAL", emoji: String.fromCodePoint(0x1f6e1, 0xfe0f), pixel: "gal_bouclier", icone: "bouclier" },
];
/** L'émoji du robot sur « Mes rôles » : le casque du guerrier, comme « Moi » dans le QG du site. */
export const ROLE_SHOW_PIXEL = "gal_casque";
/** Tous les émojis du panneau, déposés avant qu'il parte. */
export const PANEL_EMOJIS: readonly string[] = [...PANEL_ROLES.map((role) => role.pixel), ROLE_SHOW_PIXEL];
/** Le bord des cartes que voit le membre qui clique : le bleu du site, comme les tickets. */
const CARD_ACCENT = 0x0b5fff;

const SNOWFLAKE = /^[0-9]{17,20}$/;

/** Les droits de Discord dont le panneau a besoin. */
const RIGHTS = {
  administrator: 1n << 3n,
  viewChannel: 1n << 10n,
  sendMessages: 1n << 11n,
  attachFiles: 1n << 15n,
  manageRoles: 1n << 28n,
} as const;

/** Ce qu'il faut au robot dans le salon pour y poster le panneau, et le nom de chaque droit dans Discord en français. */
export const PANEL_RIGHTS: readonly { bit: bigint; label: string }[] = [
  { bit: RIGHTS.viewChannel, label: "Voir le salon" },
  { bit: RIGHTS.sendMessages, label: "Envoyer des messages" },
  { bit: RIGHTS.attachFiles, label: "Joindre des fichiers" },
];

/** Un champ de droits de Discord, écrit en chiffres ; aucun droit s'il ne l'est pas. */
export const permissionBits = (value: unknown): bigint => (typeof value === "string" && /^[0-9]{1,30}$/.test(value) ? BigInt(value) : 0n);

/** Un administrateur a tous les droits. */
const allows = (granted: bigint, bit: bigint): boolean => (granted & RIGHTS.administrator) !== 0n || (granted & bit) !== 0n;

const mention = (id: string): string => `<@&${id}>`;
const quoted = (labels: readonly string[]): string => labels.map((label) => `« ${label} »`).join(", ");

export const ROLE_MESSAGES = {
  wrongPlace: "Ces boutons ne servent que sur le serveur Discord du clan.",
  commandWrongPlace: "Tapez /roles dans un salon du serveur Discord du clan.",
  oldButton: "Ce bouton ne sert plus : l'encadrement peut reposter le panneau avec /roles.",
  notReady: "Les boutons des rôles ne sont pas encore branchés : l'encadrement finit leur installation.",
  added: (id: string): string => `Rôle ajouté : ${mention(id)}. Un second clic sur le même bouton le retire.`,
  removed: (id: string): string => `Rôle retiré : ${mention(id)}. Un clic sur le même bouton le redonne.`,
  held: (ids: readonly string[]): string => (ids.length === 0 ? "Vous n'avez aucun rôle du panneau." : `Vos rôles du panneau : ${ids.map(mention).join(", ")}.`),
  noRight: (id: string): string => `Le robot n'a pas le droit de donner ${mention(id)}. Prévenez l'encadrement : il lui faut le droit « Gérer les rôles », et un rôle placé plus haut que celui-ci dans la liste des rôles.`,
  badToken: "Le robot ne peut plus donner de rôles : son jeton a changé. Prévenez l'encadrement.",
  unknownRole: "Ce rôle n'existe plus sur le serveur. Prévenez l'encadrement.",
  busy: "Discord demande d'attendre un peu : réessayez dans quelques secondes.",
  down: "Discord ne répond pas pour l'instant : réessayez dans un moment.",
  /** Discord n'a pas répondu à temps : le rôle a pu changer quand même. Recliquer tout de suite pourrait le défaire. */
  unsure: "Discord n'a pas répondu à temps : le rôle a peut-être changé. Vérifiez avec « Mes rôles » avant de recliquer.",
  /** Le clic est arrivé après les trois secondes de Discord, qui a déjà affiché un échec : rien n'est changé. */
  late: "Le clic est arrivé trop tard : rien n'a changé. Recliquez.",
  wrongBot: "Les boutons des rôles sont mal branchés : prévenez l'encadrement.",
  notStaff: "Seul l'encadrement, avec le droit « Gérer les rôles », peut poster le panneau des rôles.",
  noToken: `Le robot n'a pas encore son jeton dans Supabase (secret ${BOT_TOKEN_SECRET}) : le panneau ne peut pas partir.`,
  otherBotToken: `Le jeton du secret ${BOT_TOKEN_SECRET} n'est pas celui de « Le Gaulois » : recollez celui de « Le Gaulois » (portail développeur, onglet Bot), puis relancez /roles.`,
  postForbidden: (code: string): string => `Discord refuse au robot de poster dans ce salon${code}, alors qu'il en a les droits : regardez si le salon n'est pas un fil fermé, ou si une permission du robot n'y est pas refusée ailleurs, puis relancez /roles.`,
  channelRights: (labels: readonly string[]): string =>
    `Il manque au robot, dans ce salon : ${quoted(labels)}. ${labels.length > 1 ? "Donnez-les-lui" : "Donnez-le-lui"} (Modifier le salon, puis Permissions), puis relancez /roles.`,
  noImage: "L'image du panneau ne se lit pas sur le site pour l'instant : relancez /roles dans un moment.",
  postToken: `Discord ne reconnaît pas le jeton du robot : recollez-le dans Supabase (secret ${BOT_TOKEN_SECRET}), puis relancez /roles.`,
  postBusy: "Discord demande d'attendre : relancez /roles dans une minute.",
  postRefused: (status: number): string => `Discord a refusé le panneau, avec le code d'erreur ${status} : rien n'est parti. Relancez /roles dans un moment ; si le refus revient, notez ce code pour le signaler.`,
  posted: "Panneau posté dans ce salon.",
  ready: "Les rôles du panneau sont prêts : essayez un bouton.",
  setupUnknown: "Le contrôle des droits du robot n'a pas pu se faire : essayez un bouton.",
  setupManage: "Attention : le robot n'a pas le droit « Gérer les rôles » sur le serveur. Donnez-lui un rôle qui l'a (Paramètres du serveur, puis Rôles) : les boutons ne donnent rien avant.",
  setupMissing: (labels: readonly string[]): string =>
    labels.length > 1
      ? `Attention : ${quoted(labels)} n'existent pas sur ce serveur, ou ne peuvent pas se donner : ces boutons ne donnent rien.`
      : `Attention : ${quoted(labels)} n'existe pas sur ce serveur, ou ne peut pas se donner : ce bouton ne donne rien.`,
  setupTooHigh: (ids: readonly string[]): string => `Attention : le plus haut rôle du robot doit passer au-dessus de ${ids.map(mention).join(", ")} dans la liste des rôles (Paramètres du serveur, puis Rôles, en le faisant glisser) : sinon ces boutons ne donnent rien.`,
};

/** Ses rôles du panneau, dans l'ordre des boutons. */
const heldIds = (held: ReadonlySet<string>): string[] => PANEL_ROLES.filter((role) => held.has(role.id)).map((role) => role.id);
const heldText = (held: ReadonlySet<string>): string => ROLE_MESSAGES.held(heldIds(held));

/** Une réponse au membre qui clique : la carte (Components V2), et le même texte en secours si Discord la refuse. */
export interface RoleReply {
  card: Record<string, unknown> | null;
  text: string;
}

/**
 * La carte d'un rôle donné ou retiré : à gauche ce qui a changé, à droite la vignette du rôle si le site la donne, puis,
 * sous un filet, ses rôles du panneau. Le bord est le bleu du site. Personne n'est mentionné.
 */
export function roleCard(title: string, detail: string, held: ReadonlySet<string>, thumbnail: { url: string; description: string } | null): Record<string, unknown> {
  const head = { type: 10, content: `**${title}**\n-# ${detail}` };
  const top = thumbnail ? { type: 9, components: [head], accessory: { type: 11, media: { url: thumbnail.url }, description: thumbnail.description } } : head;
  return {
    flags: COMPONENTS_V2,
    components: [{ type: 17, accent_color: CARD_ACCENT, components: [top, { type: 14, divider: true, spacing: 1 }, { type: 10, content: heldText(held) }] }],
    allowed_mentions: { parse: [] },
  };
}

/** La carte de « Mes rôles », que seul le membre voit : ses rôles du panneau, ou aucun. */
export function heldCard(held: ReadonlySet<string>): Record<string, unknown> {
  const ids = heldIds(held);
  const content = ids.length === 0 ? ROLE_MESSAGES.held(ids) : `**Vos rôles du panneau**\n${ids.map(mention).join(" ")}`;
  return { flags: COMPONENTS_V2 | EPHEMERAL, components: [{ type: 17, accent_color: CARD_ACCENT, components: [{ type: 10, content }] }], allowed_mentions: { parse: [] } };
}

/**
 * Le message du panneau : l'image en grand, jointe, puis un bouton par rôle et « Mes rôles », chacun avec l'émoji du robot
 * s'il est déposé (`emojis`), sinon un émoji ordinaire. `alt` : la description de l'image.
 */
export function panelMessage(alt: string, emojis: EmojiIds = new Map()): Record<string, unknown> {
  return {
    flags: COMPONENTS_V2,
    components: [
      { type: 12, items: [{ media: { url: `attachment://${PANEL_FILE}` }, description: alt }] },
      {
        type: 1,
        components: [
          ...PANEL_ROLES.map((role) => ({ type: 2, style: 1, label: role.label, ...buttonEmoji(role.pixel, emojis, role.emoji), custom_id: `${ROLE_BUTTON}${role.key}` })),
          { type: 2, style: 2, label: "Mes rôles", ...buttonEmoji(ROLE_SHOW_PIXEL, emojis), custom_id: `${ROLE_BUTTON}${ROLE_SHOW}` },
        ],
      },
    ],
    attachments: [{ id: 0, filename: PANEL_FILE, description: alt }],
    allowed_mentions: { parse: [] },
  };
}

export interface RoleSetup {
  /** Le robot a « Gérer les rôles » sur le serveur. */
  manageRoles: boolean;
  /** Les rôles du panneau placés à la hauteur du plus haut rôle du robot, ou au-dessus : il ne peut pas les donner. */
  tooHigh: string[];
  /** Les rôles du panneau absents du serveur, ou tenus par une intégration : personne ne peut les donner. */
  missing: string[];
}

/**
 * Ce que Discord laisse faire au robot avec les rôles du panneau, d'après les rôles du serveur et les siens : il lui faut
 * « Gérer les rôles », et un rôle placé plus haut que chacun d'eux. `null` : une liste illisible.
 */
export function roleSetup(guildRoles: unknown, botRoles: unknown, guildId: string): RoleSetup | null {
  if (!Array.isArray(guildRoles) || !Array.isArray(botRoles)) return null;
  const roles = new Map<string, { position: number; permissions: bigint; managed: boolean }>();
  for (const item of guildRoles) {
    const role = record(item);
    const id = role?.["id"];
    const position = role?.["position"];
    if (typeof id === "string" && typeof position === "number") roles.set(id, { position, permissions: permissionBits(role?.["permissions"]), managed: role?.["managed"] === true });
  }
  let granted = roles.get(guildId)?.permissions ?? 0n;
  let top = 0;
  for (const id of botRoles) {
    const role = typeof id === "string" ? roles.get(id) : undefined;
    if (!role) continue;
    granted |= role.permissions;
    top = Math.max(top, role.position);
  }
  const tooHigh: string[] = [];
  const missing: string[] = [];
  for (const wanted of PANEL_ROLES) {
    const role = roles.get(wanted.id);
    if (!role || role.managed) missing.push(wanted.id);
    else if (role.position >= top) tooHigh.push(wanted.id);
  }
  return { manageRoles: allows(granted, RIGHTS.manageRoles), tooHigh, missing };
}

/** Ce que la réponse à /roles ajoute sous « Panneau posté » : ce qui empêcherait encore les boutons de marcher. */
export function setupLines(setup: RoleSetup | null): string[] {
  if (!setup) return [ROLE_MESSAGES.setupUnknown];
  const lines: string[] = [];
  if (!setup.manageRoles) lines.push(ROLE_MESSAGES.setupManage);
  const missing = PANEL_ROLES.filter((role) => setup.missing.includes(role.id)).map((role) => role.label);
  if (missing.length > 0) lines.push(ROLE_MESSAGES.setupMissing(missing));
  if (setup.tooHigh.length > 0) lines.push(ROLE_MESSAGES.setupTooHigh(setup.tooHigh));
  return lines.length > 0 ? lines : [ROLE_MESSAGES.ready];
}

const discordCode = (reply: DiscordReply): unknown => record(reply.body)?.["code"];

/**
 * Ce que dit au membre un clic que Discord a refusé. 50013 : droit manquant, ou rôle plus haut que celui du robot. Sans
 * réponse à temps, Discord a pu changer le rôle quand même : la phrase le dit, pour qu'un nouveau clic ne le défasse pas.
 */
function clickRefusal(reply: DiscordReply | null, roleId: string): string {
  if (!reply) return ROLE_MESSAGES.unsure;
  if (reply.status === 401) return ROLE_MESSAGES.badToken;
  if (reply.status === 403) return ROLE_MESSAGES.noRight(roleId);
  if (reply.status === 404 && discordCode(reply) === 10011) return ROLE_MESSAGES.unknownRole;
  if (reply.status === 429) return ROLE_MESSAGES.busy;
  return ROLE_MESSAGES.down;
}

/**
 * Ce que dit à l'encadrement un panneau que Discord a refusé. `rightsShown` : Discord a joint à la commande les droits du
 * robot dans le salon, et les trois y étaient ; un refus vient alors d'ailleurs, et la réponse ne les redemande pas.
 */
function postRefusal(reply: DiscordReply | null, rightsShown: boolean): string {
  if (!reply) return ROLE_MESSAGES.down;
  if (reply.status === 401) return ROLE_MESSAGES.postToken;
  if (reply.status === 403) {
    const code = discordCode(reply);
    return rightsShown ? ROLE_MESSAGES.postForbidden(typeof code === "number" ? ` (code d'erreur ${code})` : "") : ROLE_MESSAGES.channelRights(PANEL_RIGHTS.map((right) => right.label));
  }
  if (reply.status === 429) return ROLE_MESSAGES.postBusy;
  return ROLE_MESSAGES.postRefused(reply.status);
}

/** Une seconde avant de réessayer de remplacer la réponse d'attente : le temps que Discord ait noté cette réponse. */
const REPLACE_RETRY_MS = 1000;

/**
 * Remplace la réponse d'attente d'une interaction par `text`, que seule la personne qui a cliqué ou tapé la commande voit.
 * Le jeton de l'interaction suffit, pas celui du robot. La tâche part avant que Discord ait reçu la réponse d'attente :
 * s'il ne la connaît pas encore (404), ne répond pas, ou tombe en panne, une seconde tentative part une seconde plus tard.
 * `label` commence la ligne du journal si Discord refuse encore.
 */
async function replaceWaiting(applicationId: string, token: string, reply: RoleReply, label: string, deps: Deps): Promise<void> {
  const path = `/webhooks/${applicationId}/${encodeURIComponent(token)}/messages/@original`;
  const plain = { body: { content: reply.text, allowed_mentions: { parse: [] } } };
  const call = reply.card ? { body: reply.card } : plain;
  let edited = await deps.webhook("PATCH", path, call);
  if (!edited || edited.status === 404 || edited.status >= 500) {
    await deps.sleep(REPLACE_RETRY_MS);
    edited = await deps.webhook("PATCH", path, call);
  }
  // Une carte refusée (si Discord ne laisse pas une réponse d'attente devenir une carte) : le même texte, en clair.
  if (reply.card && edited?.status === 400) edited = await deps.webhook("PATCH", path, plain);
  if (!edited || edited.status >= 300) deps.log(`${label} : la réponse d'attente n'a pas pu être remplacée`);
}

/**
 * Discord donne trois secondes pour répondre, envoi compris ; l'heure signée de l'interaction, à la seconde, dit quand il l'a
 * envoyée. À quatre secondes ou plus, il a déjà affiché un échec : mieux vaut ne rien changer qu'un rôle changé en silence.
 */
const LATE_SECONDS = 4;
const tooLate = (sentAt: number, deps: Deps): boolean => deps.nowSeconds() - sentAt >= LATE_SECONDS;

/**
 * Le rôle donné ou retiré, et la phrase qui le dit. Il l'a : le robot le retire ; il ne l'a pas : le robot le donne. Deux
 * clics trop rapprochés voient les mêmes rôles et demandent la même chose : rien ne se croise. Si Discord demande d'attendre
 * quelques secondes, l'appel repart une fois (`deps.discord`).
 */
async function toggleRole(role: (typeof PANEL_ROLES)[number], userId: string, held: Set<string>, deps: Deps): Promise<RoleReply> {
  const had = held.has(role.id);
  const reply = await deps.discord(had ? "DELETE" : "PUT", `/guilds/${deps.guildId}/members/${userId}/roles/${role.id}`, { reason: ROLE_AUDIT_REASON });
  if (reply && reply.status >= 200 && reply.status < 300) {
    if (had) held.delete(role.id);
    else held.add(role.id);
    const text = `${had ? ROLE_MESSAGES.removed(role.id) : ROLE_MESSAGES.added(role.id)}\n${heldText(held)}`;
    // La vignette du rôle, si l'index du site la donne : sinon, la carte part sans elle.
    const url = vignetteUrl(await deps.commandes(), role.icone, SITE_URL);
    const title = `${had ? "Rôle retiré" : "Rôle ajouté"} : ${mention(role.id)}`;
    const detail = had ? "Un clic sur le même bouton le redonne." : "Un second clic sur le même bouton le retire.";
    return { card: roleCard(title, detail, held, url ? { url, description: `L'icône de ${role.label}` } : null), text };
  }
  const code = reply ? discordCode(reply) : null;
  deps.log(`bouton ${role.key} : ${reply ? `${reply.status}${typeof code === "number" ? ` (code ${code})` : ""}` : "Discord ne répond pas"}`);
  return { card: null, text: clickRefusal(reply, role.id) };
}

/**
 * Un clic sur un bouton du panneau. Le membre et ses rôles viennent de l'interaction signée par Discord ; le rôle, de la
 * liste écrite ici. « Mes rôles » répond tout de suite. Un rôle à changer demande Discord, qui peut tarder au-delà des trois
 * secondes qu'il laisse, démarrage de la fonction compris : la fonction répond d'abord « en cours », à lui seul, puis
 * remplace cette réponse par le résultat. Sans cela, un rôle pourrait changer pendant que Discord affiche un échec. Le jeton
 * gardé dans Supabase doit être celui de l'application qui a posté le panneau : le numéro de son robot est celui de
 * l'application. `sentAt` : l'heure signée de l'interaction.
 */
async function roleButton(interaction: Record<string, unknown>, customId: string, sentAt: number, deps: Deps): Promise<Response> {
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId) return ephemeral(ROLE_MESSAGES.wrongPlace);
  const member = record(interaction["member"]);
  const user = record(member?.["user"]);
  const userId = user?.["id"];
  if (!member || user?.["bot"] === true || typeof userId !== "string" || !SNOWFLAKE.test(userId)) return ephemeral(ROLE_MESSAGES.wrongPlace);
  const list = member["roles"];
  const held = new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []);
  const key = customId.slice(ROLE_BUTTON.length);
  if (key === ROLE_SHOW) return json({ type: 4, data: heldCard(held) });
  const role = PANEL_ROLES.find((r) => r.key === key);
  if (!role) return ephemeral(ROLE_MESSAGES.oldButton);
  if (deps.botId === "") return ephemeral(ROLE_MESSAGES.notReady);
  const applicationId = interaction["application_id"];
  const token = interaction["token"];
  if (typeof applicationId !== "string" || !SNOWFLAKE.test(applicationId) || typeof token !== "string" || token === "") return ephemeral(ROLE_MESSAGES.wrongPlace);
  if (deps.botId !== applicationId) {
    deps.log("bouton : le jeton du secret n'est pas celui de cette application");
    return ephemeral(ROLE_MESSAGES.wrongBot);
  }
  if (tooLate(sentAt, deps)) return ephemeral(ROLE_MESSAGES.late);
  deps.background(toggleRole(role, userId, held, deps).then((reply) => replaceWaiting(applicationId, token, reply, `bouton ${role.key}`, deps)));
  return json({ type: 5, data: { flags: EPHEMERAL } });
}

/**
 * Le panneau posté par le robot dans le salon, l'image jointe ; en même temps, le contrôle de ses droits sur les rôles. La
 * réponse pour l'encadrement : posté ou non, et ce qui manque encore. Ne lève jamais d'erreur.
 */
async function postPanel(guildId: string, channelId: string, rightsShown: boolean, deps: Deps): Promise<string> {
  try {
    const index = await deps.commandes();
    const panel = index?.roles ?? null;
    const image = panel ? await deps.siteImage(panel.image) : null;
    if (!panel || !image) return ROLE_MESSAGES.noImage;
    // Les émojis du robot, déposés chez Discord la première fois : sans eux, les boutons gardent leurs émojis ordinaires.
    const emojis = await ensureEmojis(PANEL_EMOJIS, index, deps);
    const [roles, me, posted] = await Promise.all([
      deps.discord("GET", `/guilds/${guildId}/roles`),
      deps.discord("GET", `/guilds/${guildId}/members/${deps.botId}`),
      deps.discord("POST", `/channels/${channelId}/messages`, { body: panelMessage(panel.alt, emojis), files: [{ name: PANEL_FILE, type: "image/png", bytes: image }] }),
    ]);
    if (!posted || posted.status < 200 || posted.status >= 300) {
      const code = posted ? discordCode(posted) : null;
      deps.log(`panneau des rôles : ${posted ? `${posted.status}${typeof code === "number" ? ` (code ${code})` : ""}` : "Discord ne répond pas"}`);
      return postRefusal(posted, rightsShown);
    }
    const setup = roles?.status === 200 && me?.status === 200 ? roleSetup(roles.body, record(me.body)?.["roles"], guildId) : null;
    return [ROLE_MESSAGES.posted, ...setupLines(setup)].join("\n");
  } catch (e) {
    deps.log(`panneau des rôles : ${e instanceof Error ? e.message : String(e)}`);
    return ROLE_MESSAGES.down;
  }
}

/**
 * /roles : le panneau, dans le salon où la commande est tapée, par qui peut gérer les rôles (Discord la cache aux autres, et la
 * fonction le vérifie). Rien ne part s'il manque au robot un droit dans le salon : Discord les joint à la commande. Le
 * panneau et le contrôle prennent plus que les trois secondes de Discord : la fonction répond d'abord « en cours », puis
 * remplace cette réponse. Le jeton gardé dans Supabase doit être celui de cette application : sinon le panneau serait
 * posté par un autre robot, et ses clics iraient à cet autre robot. `sentAt` : l'heure signée de l'interaction.
 */
async function rolesCommand(interaction: Record<string, unknown>, sentAt: number, deps: Deps): Promise<Response> {
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId) return ephemeral(ROLE_MESSAGES.commandWrongPlace);
  const member = record(interaction["member"]);
  if (!member || !allows(permissionBits(member["permissions"]), RIGHTS.manageRoles)) return ephemeral(ROLE_MESSAGES.notStaff);
  const channelId = interaction["channel_id"] ?? record(interaction["channel"])?.["id"];
  const applicationId = interaction["application_id"];
  const token = interaction["token"];
  if (typeof channelId !== "string" || !SNOWFLAKE.test(channelId) || typeof applicationId !== "string" || !SNOWFLAKE.test(applicationId) || typeof token !== "string" || token === "") {
    return ephemeral(ROLE_MESSAGES.commandWrongPlace);
  }
  if (deps.botId === "") return ephemeral(ROLE_MESSAGES.noToken);
  if (deps.botId !== applicationId) return ephemeral(ROLE_MESSAGES.otherBotToken);
  const rightsShown = typeof interaction["app_permissions"] === "string";
  if (rightsShown) {
    const granted = permissionBits(interaction["app_permissions"]);
    const missing = PANEL_RIGHTS.filter((right) => !allows(granted, right.bit)).map((right) => right.label);
    if (missing.length > 0) return ephemeral(ROLE_MESSAGES.channelRights(missing));
  }
  // Discord a déjà affiché un échec : un panneau posté maintenant serait relancé, et posté deux fois.
  if (tooLate(sentAt, deps)) return ephemeral(ROLE_MESSAGES.late);
  deps.background(postPanel(deps.guildId, channelId, rightsShown, deps).then((text) => replaceWaiting(applicationId, token, { card: null, text }, "panneau des rôles", deps)));
  return json({ type: 5, data: { flags: EPHEMERAL } });
}

async function discordRoute(req: Request, deps: Deps): Promise<Response> {
  const body = await req.text();
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  if (deps.publicKey === "" || !(await verifyDiscordSignature(deps.publicKey, signature, timestamp, body))) {
    return new Response("Signature invalide.", { status: 401 });
  }
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(deps.nowSeconds() - sentAt) > MAX_SKEW_SECONDS) {
    return new Response("Signature trop ancienne.", { status: 401 });
  }
  let interaction: Record<string, unknown> | null;
  try {
    interaction = record(JSON.parse(body));
  } catch {
    interaction = null;
  }
  if (!interaction) return new Response("Requête illisible.", { status: 400 });
  // Discord vérifie l'adresse avant de l'accepter : il attend la même réponse à son « ping ».
  if (interaction["type"] === 1) return json({ type: 1 });
  const data = record(interaction["data"]);
  const name = data?.["name"];
  // Un clic sur un bouton (3) ou l'envoi d'une fenêtre (5) d'un message de l'application, reconnu au début de son numéro.
  if (interaction["type"] === 3 || interaction["type"] === 5) {
    const customId = data?.["custom_id"];
    if (interaction["type"] === 3 && typeof customId === "string" && customId.startsWith(ROLE_BUTTON)) return roleButton(interaction, customId, sentAt, deps);
    if (typeof customId === "string" && customId.startsWith(TICKET_PREFIX)) return ticketInteraction(interaction, deps);
    if (typeof customId === "string" && customId.startsWith(CONCOURS_PREFIX)) return concoursInteraction(interaction, deps);
    return ephemeral(MESSAGES.unknown);
  }
  if (interaction["type"] === 2 && name === ROLES_COMMAND) return rolesCommand(interaction, sentAt, deps);
  if (interaction["type"] === 2 && name === TICKETS_COMMAND_NAME) return ticketsCommand(interaction, deps);
  if ((interaction["type"] === 2 || interaction["type"] === 4) && name === CONCOURS_COMMAND_NAME) return concoursCommand(interaction, deps);
  if (data && typeof name === "string" && ROBOT_COMMANDS.has(name) && (interaction["type"] === 2 || interaction["type"] === 4)) return robotRoute(name, interaction, data, deps);
  if (interaction["type"] !== 2 || name !== COMMAND_NAME) return ephemeral(MESSAGES.unknown);

  const user = record(record(interaction["member"])?.["user"]);
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId || !user) return ephemeral(MESSAGES.wrongPlace);
  const id = user["id"];
  const username = user["username"];
  const interactionId = interaction["id"];
  if (user["bot"] === true || typeof id !== "string" || typeof username !== "string" || typeof interactionId !== "string") {
    return ephemeral(MESSAGES.failed);
  }

  const code = newCode(deps.randomBytes);
  const result = await deps.rpc("discord_code_issue", {
    p_code_hash: await sha256Hex(code),
    p_discord_id: id,
    p_discord_name: username,
    p_interaction_id: interactionId,
  });
  if (!result) return ephemeral(MESSAGES.down);
  if (result["ok"] !== true) {
    deps.log(`code refusé : ${String(result["error"])}`);
    return ephemeral(result["error"] === "too_many_codes" ? MESSAGES.tooMany : MESSAGES.failed);
  }
  const parsed = Date.parse(String(result["expires_at"]));
  const expiresAt = Number.isFinite(parsed) ? Math.floor(parsed / 1000) : deps.nowSeconds() + 300;
  return ephemeral(codeMessage(code, expiresAt));
}

const refuse = (status: number, error: string): Response => json({ ok: false, error }, status, CORS);

async function sessionRoute(req: Request, deps: Deps): Promise<Response> {
  let payload: Record<string, unknown> | null;
  try {
    payload = record(await req.json());
  } catch {
    payload = null;
  }
  const typed = payload?.["code"];
  const code = typeof typed === "string" && typed.length <= 32 ? normalizeCode(typed) : null;
  if (!code) return refuse(400, "code_format");

  const redeemed = await deps.rpc("discord_code_redeem", { p_code_hash: await sha256Hex(code) });
  if (!redeemed) return refuse(503, "code_unavailable");
  if (redeemed["ok"] !== true) {
    return redeemed["error"] === "code_busy" ? refuse(429, "code_busy") : refuse(400, "code_invalid");
  }
  const discordId = redeemed["discord_id"];
  const discordName = redeemed["discord_name"];
  const foundId = redeemed["user_id"];
  const foundEmail = redeemed["email"];
  if (typeof discordId !== "string" || typeof discordName !== "string") return refuse(503, "code_unavailable");

  let userId: string;
  let email: string;
  if (typeof foundId === "string" && typeof foundEmail === "string") {
    // Ce Discord a déjà son compte, ouvert avec Discord ou avec un code.
    userId = foundId;
    email = foundEmail;
  } else if (foundId === null) {
    // Un nouveau joueur : son compte, marqué de son identifiant Discord, puis cet identifiant dans ses liens.
    email = codeAccountEmail(discordId, deps.randomBytes);
    const created = await deps.createUser(email, discordId);
    if (created === null) return refuse(503, "code_unavailable");
    userId = created;
    const attached = await deps.rpc("discord_code_attach", { p_user: created, p_discord_id: discordId, p_discord_name: discordName });
    if (attached?.["ok"] !== true) {
      await deps.deleteUser(created);
      // Ce Discord a eu un compte entre-temps, par un autre code : celui tout juste créé s'efface, la session ouvre l'autre.
      const otherId = attached?.["user_id"];
      const otherEmail = attached?.["email"];
      if (attached?.["error"] !== "discord_taken" || typeof otherId !== "string" || typeof otherEmail !== "string") return refuse(503, "code_unavailable");
      userId = otherId;
      email = otherEmail;
    }
  } else {
    return refuse(503, "code_unavailable");
  }

  // Le lien ouvre le compte attendu, et aucun autre : Supabase le retrouve par son adresse, la fonction vérifie son numéro.
  const link = await deps.magicLink(email);
  if (link === null) return refuse(503, "code_unavailable");
  if (link.userId !== userId) {
    deps.log("le lien de session vise un autre compte : refusé");
    return refuse(503, "code_unavailable");
  }
  return json({ ok: true, token_hash: link.tokenHash }, 200, CORS);
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (path.endsWith("/etat") && req.method === "GET") {
    const discord = deps.publicKey !== "" && deps.guildId !== "";
    // Une empreinte mal formée : la fonction SQL la refuse avant d'écrire quoi que ce soit. Sa réponse prouve à la fois la
    // clé de service et la migration installée.
    const probe = deps.serviceReady ? await deps.rpc("discord_code_redeem", { p_code_hash: "etat" }) : null;
    const service = probe?.["error"] === "invalid_request";
    const fiches = (await deps.fiches()) !== null;
    const commandes = (await deps.commandes()) !== null;
    // De même pour /moi : un identifiant mal formé, refusé sans rien lire, prouve que discord_moi est installée.
    const moi = deps.serviceReady ? (await deps.rpc("discord_moi", { p_discord_id: "etat" }))?.["error"] === "invalid_request" : false;
    // Le jeton du robot, posé et accepté par Discord : les tickets en ont besoin.
    const robot = await deps.botAccepted();
    // Les concours : un serveur mal formé, refusé sans rien lire, prouve que leur migration est installée.
    const concours = deps.serviceReady ? (await deps.rpc("concours_liste", { p_guild: "etat", p_filtre: null }))?.["error"] === "invalid_request" : false;
    return json({ ok: true, discord, service, signature: await signatureWorks(), fiches, commandes, moi, robot, concours }, 200, CORS);
  }
  if (req.method === "GET" || req.method === "HEAD") {
    const billet = await concoursImage(path, req.method === "HEAD", deps);
    if (billet) return billet;
  }
  if (req.method !== "POST") return new Response("Méthode refusée.", { status: 405 });
  if (path.endsWith("/concours/tic")) return concoursTic(deps);
  if (path.endsWith("/discord")) return discordRoute(req, deps);
  if (path.endsWith("/session")) return sessionRoute(req, deps);
  return new Response("Adresse inconnue.", { status: 404 });
}

/* ---------- Le vrai monde ---------- */

type Env = { get(name: string): string | undefined };

/** La clé de service : la nouvelle (`SUPABASE_SECRET_KEYS`, clé « default »), sinon l'ancienne. */
function serviceKey(env: Env): string {
  try {
    const keys = record(JSON.parse(env.get("SUPABASE_SECRET_KEYS") ?? "{}"));
    const key = keys?.["default"];
    if (typeof key === "string" && key !== "") return key;
  } catch {
    // Illisible : l'ancienne clé, plus bas.
  }
  return env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

/** Ce que la fonction retient d'un fichier du site : sa dernière lecture réussie et son dernier échec. */
interface Kept {
  value: unknown;
  /** L'heure de la dernière lecture réussie. */
  at: number;
  /** L'heure du dernier échec, ou `null`. */
  failedAt: number | null;
}
/** Par moyen de lecture (le `fetch` du moteur en vrai, un faux dans chaque test), puis par adresse. */
const keptFiles = new WeakMap<typeof fetch, Map<string, Kept>>();
/** La dernière réponse de Discord sur le jeton du robot, par moyen de lecture : une fonction neuve sert chaque requête. */
const botChecks = new WeakMap<typeof fetch, { at: number; ok: boolean }>();

/**
 * Un fichier du site, les fiches ou l'index des commandes : gardé cinq minutes ; si le site ne répond plus, la dernière
 * lecture de moins de deux heures. Après un échec, rien n'est redemandé pendant trente secondes. `label` commence les lignes
 * du journal.
 */
async function readSiteFile<T>(fetcher: typeof fetch, url: string, parse: (value: unknown) => T | null, label: string, log: (message: string) => void): Promise<T | null> {
  const now = Date.now();
  let byUrl = keptFiles.get(fetcher);
  if (!byUrl) {
    byUrl = new Map();
    keptFiles.set(fetcher, byUrl);
  }
  const kept = byUrl.get(url) ?? { value: null, at: 0, failedAt: null };
  if (kept.value !== null && now - kept.at < FICHES_FRESH_MS) return kept.value as T;
  const lastGood = kept.value !== null && now - kept.at < FICHES_STALE_MS ? (kept.value as T) : null;
  if (kept.failedAt !== null && now - kept.failedAt < FICHES_RETRY_MS) return lastGood;
  try {
    const res = await fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(FICHES_TIMEOUT_MS) });
    if (!res.ok) {
      log(`${label} : ${res.status}`);
    } else {
      // Le délai court aussi pendant la lecture du corps : dépassé, il tombe dans le `catch`, comme un site injoignable.
      const value = parse(await res.json());
      if (value !== null) {
        byUrl.set(url, { value, at: now, failedAt: null });
        return value;
      }
      log(`${label} : fichier illisible`);
    }
  } catch (e) {
    log(e instanceof SyntaxError ? `${label} : fichier illisible` : `${label} injoignables : ${e instanceof Error ? e.message : String(e)}`);
  }
  byUrl.set(url, { ...kept, failedAt: now });
  return lastGood;
}

/** L'image du panneau des rôles : quelques centaines de kilo-octets au plus, loin des limites de Discord. */
const MAX_PANEL_BYTES = 5_000_000;
/** Le temps laissé au site pour donner l'image : /roles a déjà répondu « en cours », rien ne presse. */
const SITE_IMAGE_TIMEOUT_MS = 8000;

/** Une image du site (le panneau des rôles, le fond d'un billet de la tombola) : un PNG, ou `null`, et la raison au journal. */
async function readSiteImage(fetcher: typeof fetch, path: string, log: (message: string) => void): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!sitePath(path)) return null;
  try {
    const res = await fetcher(`${SITE_URL}${path}`, { signal: AbortSignal.timeout(SITE_IMAGE_TIMEOUT_MS) });
    if (!res.ok) {
      log(`image ${path} : ${res.status}`);
      return null;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/png")) {
      log(`image ${path} : pas un PNG (${type.split(";")[0] || "type inconnu"})`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_PANEL_BYTES) {
      log(`image ${path} : ${bytes.length} octets, hors des limites`);
      return null;
    }
    return bytes;
  } catch (e) {
    log(`image ${path} injoignable : ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * La lecture des images du site, une par moyen de lecture : `liveDeps` sert chaque requête, et les concours gardent les fonds
 * des billets sous cette fonction (concours.ts, `fondDe`). Une fonction neuve à chaque requête ne les retrouverait jamais.
 */
const siteImages = new WeakMap<typeof fetch, Deps["siteImage"]>();
function siteImageDe(fetcher: typeof fetch, log: (message: string) => void): Deps["siteImage"] {
  let lire = siteImages.get(fetcher);
  if (!lire) {
    lire = (path) => readSiteImage(fetcher, path, log);
    siteImages.set(fetcher, lire);
  }
  return lire;
}

export function liveDeps(env: Env, fetcher: typeof fetch = fetch): Deps {
  const url = (env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = serviceKey(env);
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const log = (message: string): void => console.log(`code-discord : ${message}`);
  const botToken = (env.get(BOT_TOKEN_SECRET) ?? "").trim();
  const botId = botIdOf(botToken);
  const applicationId = (env.get("DISCORD_APPLICATION_ID") ?? "").trim() || GAL_APPLICATION_ID;
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  /** Un appel à l'API de Discord ; `auth` : l'en-tête du jeton du robot, ou `null` pour le webhook d'une interaction. */
  async function discordCall(method: string, path: string, call: DiscordCall, auth: string | null): Promise<DiscordReply | null> {
    const callHeaders: Record<string, string> = { "user-agent": DISCORD_USER_AGENT };
    const files = call.files ?? [];
    if (auth !== null) callHeaders["authorization"] = auth;
    // Avec des fichiers joints, `fetch` écrit lui-même le type de contenu, avec la frontière entre les parties.
    if (call.body !== undefined && files.length === 0) callHeaders["content-type"] = "application/json";
    if (call.reason) callHeaders["x-audit-log-reason"] = encodeURIComponent(call.reason.slice(0, 512));
    const payload = (): BodyInit | undefined => {
      if (files.length === 0) return call.body === undefined ? undefined : JSON.stringify(call.body);
      const form = new FormData();
      form.append("payload_json", JSON.stringify(call.body ?? {}));
      files.forEach((file, i) => form.append(`files[${i}]`, new Blob([file.bytes], { type: file.type }), file.name));
      return form;
    };
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetcher(`${DISCORD_API}${path}`, {
          method,
          headers: callHeaders,
          body: payload(),
          signal: AbortSignal.timeout(call.timeoutMs ?? DISCORD_TIMEOUT_MS),
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text === "" ? null : JSON.parse(text);
        } catch {
          body = null;
        }
        const retryAfter = record(body)?.["retry_after"];
        // Une seule reprise, et seulement pour un appel qui a le temps d'attendre.
        if (res.status === 429 && attempt === 0 && (call.timeoutMs ?? DISCORD_TIMEOUT_MS) >= 5000 && typeof retryAfter === "number" && retryAfter >= 0 && retryAfter <= 5) {
          await wait(Math.ceil(retryAfter * 1000));
          continue;
        }
        if (res.status >= 400) log(`Discord ${method} ${pathForLog(path)} : ${res.status}`);
        return { status: res.status, body };
      } catch (e) {
        log(`Discord ${method} ${pathForLog(path)} injoignable : ${e instanceof Error ? e.name : "erreur"}`);
        return null;
      }
    }
  }

  async function call(path: string, init: RequestInit): Promise<{ status: number; body: unknown } | null> {
    try {
      const res = await fetcher(`${url}${path}`, { ...init, headers });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text === "" ? null : JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch (e) {
      log(`${path.split("?")[0]} injoignable : ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  return {
    publicKey: (env.get("DISCORD_PUBLIC_KEY") ?? "").trim() || APP_PUBLIC_KEY,
    guildId: (env.get("DISCORD_GUILD_ID") ?? "").trim() || GAL_GUILD_ID,
    serviceReady: url !== "" && key !== "",
    nowSeconds: () => Math.floor(Date.now() / 1000),
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    log,
    async rpc(name, args) {
      const res = await call(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
      if (!res || res.status !== 200) {
        if (res) log(`${name} : ${res.status}`);
        return null;
      }
      return record(res.body);
    },
    async createUser(email, discordId) {
      // Les métadonnées d'application ne s'écrivent qu'avec la clé de service : discord_code_attach les exige.
      const res = await call("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, email_confirm: true, app_metadata: { connexion: "code-discord", discord_id: discordId } }),
      });
      const id = record(res?.body)?.["id"];
      if (!res || res.status >= 300 || typeof id !== "string") {
        log(`création du compte : ${res?.status ?? "injoignable"}`);
        return null;
      }
      return id;
    },
    async deleteUser(id) {
      const res = await call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res || res.status >= 300) log(`effacement du compte : ${res?.status ?? "injoignable"}`);
    },
    async magicLink(email) {
      // La réponse porte le lien et, à côté, le compte qu'il ouvre (`id`).
      const res = await call("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) });
      const body = record(res?.body);
      const tokenHash = body?.["hashed_token"];
      const userId = body?.["id"];
      if (!res || res.status >= 300 || typeof tokenHash !== "string" || typeof userId !== "string") {
        log(`ouverture de session : ${res?.status ?? "injoignable"}`);
        return null;
      }
      return { tokenHash, userId };
    },
    fiches: () => readSiteFile(fetcher, FICHES_URL, parseFiches, "fiches", log),
    commandes: () => readSiteFile(fetcher, COMMANDES_URL, parseCommandes, "commandes", log),
    botId,
    discord: (method, path, call = {}) => (botToken !== "" && botId !== "" ? discordCall(method, path, call, `Bot ${botToken}`) : Promise.resolve(null)),
    webhook: (method, path, call = {}) => (path.startsWith("/webhooks/") ? discordCall(method, path, call, null) : Promise.resolve(null)),
    async botAccepted() {
      if (botToken === "" || botId === "" || botId !== applicationId) return false;
      const kept = botChecks.get(fetcher);
      if (kept && Date.now() - kept.at < BOT_CHECK_MS) return kept.ok;
      const res = await discordCall("GET", "/users/@me", { timeoutMs: 2000 }, `Bot ${botToken}`);
      const ok = res?.status === 200 && record(res.body)?.["id"] === botId;
      botChecks.set(fetcher, { at: Date.now(), ok });
      return ok;
    },
    background(task) {
      const kept = task.catch((e: unknown) => log(`tâche de fond : ${e instanceof Error ? e.message : String(e)}`));
      const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?(promise: Promise<unknown>): void } }).EdgeRuntime;
      if (typeof runtime?.waitUntil === "function") runtime.waitUntil(kept);
    },
    sleep: wait,
    siteImage: siteImageDe(fetcher, log),
    projectUrl: url === "" ? undefined : url,
  };
}

const deno = (globalThis as unknown as { Deno?: { serve(handler: (req: Request) => Promise<Response>): unknown; env: Env } }).Deno;
if (deno) deno.serve((req) => handle(req, liveDeps(deno.env)));
