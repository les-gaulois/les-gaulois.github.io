/**
 * Le robot des arrivées parle à Discord : un passage lit les derniers messages du salon des arrivées du serveur du clan, et
 * remplace chaque message d'arrivée par une image de bienvenue (`arrivees.ts` pour les règles, `arrivees-image.ts` pour le
 * dessin).
 *
 * Il lui faut un robot, pas un simple lien d'envoi : seul un robot qui a le droit « Gérer les messages » peut retirer le
 * message de Discord. Ce robot est une application Discord à part, réservée aux arrivées : pas celle de la connexion, dont le
 * jeton permettrait aussi de détourner la commande /code. Son jeton est le secret DISCORD_BOT_TOKEN de GitHub : il n'est écrit
 * dans aucun message, même d'erreur. Les journaux de l'Action sont publics : ils ne nomment personne, et ne donnent le numéro
 * d'aucun joueur.
 *
 * L'ordre protège le salon : l'image d'abord, puis le retrait du message de Discord. Si le retrait échoue, le passage suivant
 * retrouve l'image à son nom de fichier et ne retire que le message : jamais deux images pour une arrivée. Et rien n'est posté
 * tant que les droits du robot dans le salon ne sont pas tous là, ou ne se lisent pas.
 */
import {
  arrivalPlan,
  arrivalStyle,
  avatarUrl,
  ChannelMessage,
  DiscordUser,
  drawnName,
  looksLikeLink,
  markerName,
  MAX_AVATAR_BYTES,
  PHRASES,
  stableHash,
  tidyName,
  type ArrivalStyle,
  type Decor,
  type Phrase,
} from "./arrivees";

export const DISCORD_API = "https://discord.com/api/v10";
/**
 * Le salon des arrivées du serveur du clan, « nouveaux », désigné par le pilote le 12 novembre 2026. Un numéro public, comme
 * celui du serveur (`src/lib/discord-commande.ts`). Le robot ne travaille que là : si le serveur écrit un jour ses messages
 * d'arrivée dans un autre salon, il s'arrête et le journal le dit, plutôt que de poster des images ailleurs sans qu'on le lui
 * ait demandé.
 */
export const ARRIVALS_CHANNEL_ID = "1353397915212841121";
/** Discord demande à chaque robot de se présenter ainsi. Rien du clan n'y est écrit. */
export const USER_AGENT = "DiscordBot (robot-arrivees, 1.0)";

/** Un message discret : ni notification ni son, comme le message d'arrivée de Discord. */
const SILENT = 1 << 12;
/** Le réglage du serveur « ne pas envoyer de message d'arrivée ». */
const SUPPRESS_JOIN = 1 << 0;
/** Le serveur exige la double authentification pour modérer (`mfa_level`). */
const MFA_REQUIRED = 1;
/** Le refus de Discord quand cette double authentification manque au compte qui possède le robot. */
const MFA_MISSING_CODE = 60003;

/**
 * Le secret a-t-il la forme d'un jeton de robot ? Trois morceaux séparés par des points, dont le premier est le numéro du
 * robot écrit en base64. Sert seulement à dire où chercher quand autre chose a été collé (le « Client Secret », la « Public
 * Key ») : Discord tranche de toute façon. Le jeton n'est jamais affiché.
 */
export function looksLikeToken(text: string): boolean {
  const parts = text.split(".");
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    return /^[0-9]{17,20}$/.test(atob((parts[0] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return false;
  }
}

/* ---------- Les droits du robot dans le salon ---------- */

const ADMINISTRATOR = 1n << 3n;
/** Ce qu'il faut au robot dans le salon, et le nom de chaque droit dans Discord en français. */
export const NEEDED_PERMISSIONS: readonly { bit: bigint; label: string }[] = [
  { bit: 1n << 10n, label: "Voir le salon" },
  { bit: 1n << 16n, label: "Voir les anciens messages" },
  { bit: 1n << 11n, label: "Envoyer des messages" },
  { bit: 1n << 15n, label: "Joindre des fichiers" },
  { bit: 1n << 13n, label: "Gérer les messages" },
];
/** Les mêmes, en un nombre. */
export const NEEDED_PERMISSIONS_VALUE = NEEDED_PERMISSIONS.reduce((sum, p) => sum | p.bit, 0n);

/**
 * Le lien qui ajoute le robot au serveur du clan, sans aucun droit sur le serveur : ses cinq droits se donnent ensuite dans le
 * seul salon des arrivées. Hors de ce salon, le robot, et qui tiendrait son jeton, ne peut que ce que peut un nouveau membre du
 * serveur : lire et écrire dans les salons ouverts à tous, et n'y rien retirer. À ouvrir par
 * qui gère le serveur. `botId` : le numéro du robot, celui de son application.
 */
export function botInstallUrl(botId: string, guildId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${botId}&scope=bot&permissions=0&guild_id=${guildId}&disable_guild_select=true`;
}

interface Overwrite {
  id: string;
  /** 0 : un rôle ; 1 : un membre. */
  type: number;
  allow: string;
  deny: string;
}

const bits = (value: unknown): bigint => {
  try {
    return typeof value === "string" && /^[0-9]+$/.test(value) ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
};

/**
 * Les droits d'un membre dans un salon, calculés comme Discord le fait : ceux de ses rôles, puis les réglages du salon pour
 * tout le monde, pour ses rôles, puis pour lui. Un administrateur a tout.
 */
export function channelPermissions(guildId: string, roles: readonly { id: string; permissions: string }[], memberRoles: readonly string[], memberId: string, overwrites: readonly Overwrite[]): bigint {
  const mine = new Set([guildId, ...memberRoles]);
  let base = 0n;
  for (const role of roles) if (mine.has(role.id)) base |= bits(role.permissions);
  if (base & ADMINISTRATOR) return ~0n;
  const everyone = overwrites.find((o) => o.id === guildId);
  if (everyone) base = (base & ~bits(everyone.deny)) | bits(everyone.allow);
  let allow = 0n;
  let deny = 0n;
  for (const o of overwrites) {
    if (o.type === 0 && o.id !== guildId && mine.has(o.id)) {
      allow |= bits(o.allow);
      deny |= bits(o.deny);
    }
  }
  base = (base & ~deny) | allow;
  const own = overwrites.find((o) => o.type === 1 && o.id === memberId);
  if (own) base = (base & ~bits(own.deny)) | bits(own.allow);
  return base;
}

/** Les droits qui manquent, par leur nom dans Discord. */
export const missingPermissions = (granted: bigint): string[] => NEEDED_PERMISSIONS.filter((p) => (granted & p.bit) === 0n).map((p) => p.label);

const quoted = (labels: readonly string[]): string => labels.map((label) => `« ${label} »`).join(", ");

/* ---------- Le message ---------- */

/** Ce que le passage demande au dessin : voir `ArrivalImage` dans `arrivees-image.ts`. */
export interface ArrivalDrawing {
  decor: Decor;
  seed: number;
  phrase: Phrase;
  name: string;
}

/**
 * Le message du robot : l'image seule, sans texte, comme les autres messages du robot (demande du pilote, 12 novembre 2026 :
 * « je veux que des images »). Sa description dit la phrase entière aux lecteurs d'écran. Le message est discret, comme celui
 * qu'il remplace : ni notification ni son, et il ne peut mentionner personne.
 */
export function arrivalPayload(filename: string, alt: string): Record<string, unknown> {
  return {
    // Pas de `content` : le message n'est que l'image.
    allowed_mentions: { parse: [] },
    flags: SILENT,
    attachments: [{ id: 0, filename, description: alt }],
  };
}

/* ---------- Les appels ---------- */

export interface ArrivalsDeps {
  /** Le jeton du robot. Jamais écrit dans un journal. */
  token: string;
  guildId: string;
  /** Le salon confié au robot : voir `ARRIVALS_CHANNEL_ID`. */
  channelId: string;
  fetch: typeof fetch;
  now: number;
  /** Les polices de l'image savent-elles dessiner ce caractère ? */
  draws: (char: string) => boolean;
  /** Dessine l'image en PNG. `avatar` : la photo de profil telle que Discord la donne, ou `null`. */
  render: (drawing: ArrivalDrawing, avatar: Buffer | null) => Promise<Uint8Array>;
  /** La description de l'image, pour les lecteurs d'écran. `fullName` : le nom entier du joueur. */
  alt: (phrase: Phrase, fullName: string) => string;
  log: (line: string) => void;
  /** Attendre avant un nouvel essai, quand Discord demande de ralentir : remplacé dans les tests. */
  wait?: (ms: number) => Promise<void>;
}

export interface ArrivalsResult {
  /** Les messages d'arrivée remplacés par une image. */
  replaced: number;
  /** Les messages de Discord retirés dont l'image était déjà là. */
  cleaned: number;
  /** Les messages d'arrivée laissés tels quels. */
  left: number;
  /** Un appel a échoué : le passage suivant réessaie. */
  failed: boolean;
}

interface Reply {
  status: number;
  body: unknown;
}

const record = (value: unknown): Record<string, unknown> | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** Discord demande de ralentir : on attend ce qu'il dit, cinq secondes au plus, et on réessaie une fois. */
const MAX_WAIT_MS = 5_000;

function client({ token, fetch: send, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: Pick<ArrivalsDeps, "token" | "fetch" | "wait">) {
  const headers = { authorization: `Bot ${token}`, "user-agent": USER_AGENT };
  async function call(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}): Promise<Reply | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        // Une redirection changerait un envoi en simple lecture : elle est refusée.
        response = await send(`${DISCORD_API}${path}`, { method, redirect: "error", signal: AbortSignal.timeout(20_000), headers: { ...headers, ...init.headers }, ...(init.body === undefined ? {} : { body: init.body }) });
      } catch {
        return null;
      }
      let body: unknown = null;
      try {
        const text = await response.text();
        body = text === "" ? null : JSON.parse(text);
      } catch {
        body = null;
      }
      if (response.status === 429 && attempt === 0) {
        const seconds = Number(record(body)?.["retry_after"]);
        await wait(Math.min(MAX_WAIT_MS, Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 100 : 1000));
        continue;
      }
      return { status: response.status, body };
    }
    return null;
  }
  return {
    get: (path: string) => call("GET", path),
    remove: (path: string, reason: string) => call("DELETE", path, { headers: { "x-audit-log-reason": encodeURIComponent(reason) } }),
    postImage(path: string, payload: Record<string, unknown>, png: Uint8Array, filename: string) {
      const form = new FormData();
      form.append("payload_json", JSON.stringify(payload));
      form.append("files[0]", new Blob([Buffer.from(png)], { type: "image/png" }), filename);
      return call("POST", path, { body: form });
    },
  };
}

/** La photo de profil, ou `null` si elle ne se lit pas : l'initiale du nom la remplace alors sur l'image. */
export async function readAvatar(url: string | null, get: typeof fetch): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await get(url, { redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "user-agent": USER_AGENT } });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > MAX_AVATAR_BYTES) return null;
    const data = Buffer.from(await response.arrayBuffer());
    return data.length > 0 && data.length <= MAX_AVATAR_BYTES ? data : null;
  } catch {
    return null;
  }
}

/** La raison du retrait, que le journal d'audit du serveur Discord garde à côté de la suppression. */
export const REMOVAL_REASON = "Message d'arrivée remplacé par l'image de bienvenue";

const plural = (count: number, one: string, many: string) => (count > 1 ? `${count} ${many}` : `1 ${one}`);

const RETRY = "Nouvel essai au prochain passage.";
const MFA_HELP =
  "le serveur exige la double authentification pour modérer, et le compte Discord qui possède le robot ne l'a pas : Discord refuse de retirer les messages. À activer sur ce compte : Paramètres utilisateur, Mon compte, « Activer l'authentification à deux facteurs ».";

/**
 * Un passage du robot. Sans rien garder d'une fois sur l'autre : le salon dit ce qui reste à faire.
 * Rien n'est lancé d'ici : c'est `scripts/accueillir-arrivees.ts` qui fournit le jeton, les polices et le dessin.
 */
export async function arrivalsPass(deps: ArrivalsDeps): Promise<ArrivalsResult> {
  const { guildId, channelId, log } = deps;
  const api = client(deps);
  const result: ArrivalsResult = { replaced: 0, cleaned: 0, left: 0, failed: false };
  const stop = (line: string): ArrivalsResult => {
    log(`::warning::Arrivées : ${line}`);
    return { ...result, failed: true };
  };

  // Qui est le robot : son numéro reconnaît ses propres images dans le salon.
  const me = await api.get("/users/@me");
  if (!me) return stop(`Discord n'a pas répondu. ${RETRY}`);
  if (me.status === 401) return stop("Discord ne reconnaît pas le jeton du robot : le secret DISCORD_BOT_TOKEN est à remplacer (portail développeur, onglet « Bot », « Reset Token »).");
  const bot = DiscordUser.safeParse(me.body);
  if (me.status !== 200 || !bot.success) return stop(`Discord a répondu ${me.status} à la lecture du robot. ${RETRY}`);
  const botId = bot.data.id;

  // Le serveur : le robot y est-il, et le serveur écrit-il toujours ses arrivées dans le salon confié au robot ?
  const guild = await api.get(`/guilds/${guildId}`);
  if (!guild) return stop(`Discord n'a pas répondu. ${RETRY}`);
  if (guild.status === 403 || guild.status === 404) {
    // Le lien porte le numéro du robot et celui du serveur : publics tous deux, et aucun n'est celui d'un joueur.
    return stop(`le robot n'est pas sur le serveur du clan. Qui gère le serveur l'y ajoute par ce lien : ${botInstallUrl(botId, guildId)}`);
  }
  const server = record(guild.body);
  if (guild.status !== 200 || !server) return stop(`Discord a répondu ${guild.status} à la lecture du serveur. ${RETRY}`);
  // Discord n'écrit les arrivées que dans le salon des messages système du serveur.
  const systemChannel = server["system_channel_id"];
  if (typeof systemChannel !== "string") {
    log("Arrivées : le serveur n'a pas de salon des messages système (Paramètres du serveur, Vue d'ensemble) : rien à remplacer.");
    return result;
  }
  if (systemChannel !== channelId) {
    return stop("le serveur écrit maintenant ses messages d'arrivée dans un autre salon que celui confié au robot (Paramètres du serveur, Vue d'ensemble) : rien n'est remplacé. Pour suivre ce changement : ARRIVALS_CHANNEL_ID, dans src/lib/arrivees-discord.ts.");
  }
  if (typeof server["system_channel_flags"] === "number" && (server["system_channel_flags"] & SUPPRESS_JOIN) !== 0) {
    log("Arrivées : le serveur n'envoie pas de message d'arrivée (Paramètres du serveur, Vue d'ensemble) : rien à remplacer.");
  }

  // Les droits du robot dans ce salon, à chaque passage, avant de lire ou de poster quoi que ce soit. Sans « Voir les anciens
  // messages », Discord ne refuse rien : il rend une liste vide, et le robot croirait que personne n'arrive. Sans « Gérer les
  // messages », l'image s'ajouterait au message de Discord au lieu de le remplacer.
  const [member, channel] = await Promise.all([api.get(`/guilds/${guildId}/members/${botId}`), api.get(`/channels/${channelId}`)]);
  if (!member || !channel) return stop(`Discord n'a pas répondu. ${RETRY}`);
  if (channel.status === 403 || channel.status === 404) {
    return stop(`le robot ne voit pas le salon des arrivées. Dans ce salon (Modifier le salon, Permissions), il lui faut : ${quoted(NEEDED_PERMISSIONS.map((p) => p.label))}.`);
  }
  const roles = server["roles"];
  const memberRoles = record(member.body)?.["roles"];
  const overwrites = record(channel.body)?.["permission_overwrites"];
  if (member.status !== 200 || channel.status !== 200 || !Array.isArray(roles) || !Array.isArray(memberRoles)) {
    return stop(`les droits du robot n'ont pas pu être lus (Discord a répondu ${member.status} et ${channel.status}) : rien n'est remplacé. ${RETRY}`);
  }
  const granted = channelPermissions(
    guildId,
    roles.flatMap((r) => {
      const role = record(r);
      return role && typeof role["id"] === "string" && typeof role["permissions"] === "string" ? [{ id: role["id"], permissions: role["permissions"] }] : [];
    }),
    memberRoles.filter((r): r is string => typeof r === "string"),
    botId,
    (Array.isArray(overwrites) ? overwrites : []).flatMap((o) => {
      const entry = record(o);
      return entry && typeof entry["id"] === "string" && typeof entry["type"] === "number" ? [{ id: entry["id"], type: entry["type"], allow: String(entry["allow"] ?? "0"), deny: String(entry["deny"] ?? "0") }] : [];
    }),
  );
  const missing = missingPermissions(granted);
  if (missing.length > 0) return stop(`dans le salon des arrivées, il manque au robot : ${quoted(missing)} (Modifier le salon, Permissions). Rien n'est remplacé tant que ces droits manquent.`);
  // Le droit ne suffit pas partout : un serveur qui exige la double authentification pour modérer la demande aussi au compte
  // qui possède le robot. Discord le dit dans la fiche du robot ; s'il ne le dit pas, le retrait le dira.
  if (server["mfa_level"] === MFA_REQUIRED && bot.data.mfa_enabled === false) return stop(`${MFA_HELP} Rien n'est remplacé d'ici là.`);

  const listed = await api.get(`/channels/${channelId}/messages?limit=100`);
  if (!listed) return stop(`Discord n'a pas répondu. ${RETRY}`);
  if (listed.status === 403) return stop(`le robot ne peut pas lire le salon des arrivées : il lui faut ${quoted(["Voir le salon", "Voir les anciens messages"])}.`);
  if (listed.status !== 200 || !Array.isArray(listed.body)) return stop(`Discord a répondu ${listed.status} à la lecture du salon. ${RETRY}`);
  // Le texte d'aucun message n'est lu : le robot n'en garde pas le champ. Des messages des membres, il ne retient que le type
  // et l'auteur ; leurs fichiers ne sont pas gardés, même le temps du passage. Discord ne les lui donne d'ailleurs pas, tant
  // que « Message Content Intent » reste coupé dans le portail développeur : le robot n'en a pas besoin.
  const messages = listed.body.flatMap((raw) => {
    const parsed = ChannelMessage.safeParse(raw);
    if (!parsed.success) return [];
    const { id, type, author } = parsed.data;
    return [author.id === botId ? parsed.data : { id, type, author }];
  });

  const plan = arrivalPlan(messages, botId, deps.now);
  result.left = plan.left.length;
  if (plan.tasks.length === 0) {
    log(`Arrivées : aucun message d'arrivée à remplacer${plan.left.length > 0 ? ` (${plural(plan.left.length, "laissé tel quel", "laissés tels quels")} : ${[...new Set(plan.left.map((l) => l.reason))].join(", ")})` : ""}.`);
    return result;
  }

  const recent: ArrivalStyle[] = [...plan.recent];
  for (const task of plan.tasks) {
    const { message } = task;

    if (!task.posted) {
      // Un joueur déjà reparti n'a pas d'image : le message de Discord reste, comme sans le robot.
      const joined = await api.get(`/guilds/${guildId}/members/${message.author.id}`);
      if (joined?.status === 404) {
        result.left++;
        continue;
      }
      const profile = joined?.status === 200 ? record(joined.body) : null;
      const nick = typeof profile?.["nick"] === "string" ? profile["nick"] : null;
      const memberAvatar = typeof profile?.["avatar"] === "string" ? profile["avatar"] : null;
      const fullName = tidyName(nick ?? message.author.global_name ?? message.author.username);
      // Un nom qui est une adresse ou une invitation est une publicité : l'image l'écrirait en grand aux couleurs du clan.
      // Le message de Discord reste, et la modération s'en charge comme d'habitude.
      // Seuls les noms qui s'écriraient sur l'image comptent : le nom affiché, et le nom d'utilisateur s'il devait le remplacer.
      const names = [...new Set([drawnName(fullName, message.author.username, deps.draws), drawnName(message.author.username, message.author.username, deps.draws)])].filter((name) => !looksLikeLink(name));
      if (looksLikeLink(fullName) || names.length === 0) {
        result.left++;
        continue;
      }
      const style = arrivalStyle(message.id, recent);
      const phrase = PHRASES[style.phrase];
      if (!phrase) continue;

      // Le nom affiché d'abord ; si l'image ne se dessine pas avec lui, le nom d'utilisateur, que Discord limite aux lettres simples.
      const avatar = await readAvatar(avatarUrl(guildId, message.author.id, memberAvatar, message.author.avatar), deps.fetch);
      let png: Uint8Array | null = null;
      let problem = "erreur inconnue";
      for (const name of names) {
        try {
          png = await deps.render({ decor: style.decor, seed: stableHash(`graine:${message.id}`), phrase, name }, avatar);
          break;
        } catch (e) {
          if (e instanceof Error) problem = e.message;
        }
      }
      if (!png) {
        // Sans image, le message de Discord reste : c'est mieux que rien.
        log(`::warning::Arrivées : image impossible à dessiner (${problem}), le message de Discord reste.`);
        result.failed = true;
        continue;
      }

      const filename = markerName(message.id, message.author.id, style);
      const posted = await api.postImage(`/channels/${channelId}/messages`, arrivalPayload(filename, deps.alt(phrase, fullName)), png, filename);
      if (!posted || posted.status < 200 || posted.status >= 300) {
        log(`::warning::Arrivées : ${posted ? `Discord a répondu ${posted.status} à l'envoi de l'image` : "Discord n'a pas répondu à l'envoi de l'image"}. ${RETRY}`);
        result.failed = true;
        // Un refus de droit vaudrait pour les suivantes : inutile d'insister.
        if (!posted || posted.status === 403) break;
        continue;
      }
      recent.unshift(style);
    }

    const removed = await api.remove(`/channels/${channelId}/messages/${message.id}`, REMOVAL_REASON);
    // 404 : quelqu'un l'a déjà retiré.
    if (removed && (removed.status === 204 || removed.status === 404)) {
      if (task.posted) result.cleaned++;
      else result.replaced++;
      continue;
    }
    result.failed = true;
    const after = "L'image est postée ; le message de Discord sera retiré à un prochain passage, une fois cela réglé.";
    if (removed?.status === 403 && record(removed.body)?.["code"] === MFA_MISSING_CODE) log(`::warning::Arrivées : ${MFA_HELP} ${after}`);
    else if (removed?.status === 403) log(`::warning::Arrivées : le robot n'a pas pu retirer le message de Discord : il lui faut « Gérer les messages » dans ce salon. ${after}`);
    else log(`::warning::Arrivées : ${removed ? `Discord a répondu ${removed.status} au retrait du message d'arrivée` : "Discord n'a pas répondu au retrait du message d'arrivée"}. L'image est postée ; nouvel essai au prochain passage.`);
    // Sans retrait, chaque image de plus doublerait un message : on s'arrête là.
    break;
  }

  const parts = [plural(result.replaced, "message d'arrivée remplacé par une image", "messages d'arrivée remplacés par une image")];
  if (result.replaced === 0) parts[0] = "aucun message d'arrivée remplacé";
  if (result.cleaned > 0) parts.push(plural(result.cleaned, "message de Discord retiré après coup", "messages de Discord retirés après coup"));
  if (result.left > 0) parts.push(plural(result.left, "laissé tel quel", "laissés tels quels"));
  if (plan.later > 0) parts.push(plural(plan.later, "remis au passage suivant", "remis au passage suivant"));
  log(`Arrivées : ${parts.join(", ")}.`);
  return result;
}
