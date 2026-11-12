import { describe, expect, it } from "vitest";
import { JOIN_MESSAGE_TYPE, markerName, MAX_AGE_MS, PHRASES, readMarker } from "../../src/lib/arrivees";
import { ARRIVALS_CHANNEL_ID, arrivalPayload, arrivalsPass, botInstallUrl, logName, looksLikeToken, channelPermissions, DISCORD_API, missingPermissions, NEEDED_PERMISSIONS, NEEDED_PERMISSIONS_VALUE, readAvatar, REMOVAL_REASON, USER_AGENT, type ArrivalDrawing, type ArrivalsDeps } from "../../src/lib/arrivees-discord";

const TOKEN = "jeton.tres.secret";
const GUILD = "135090549460002409";
const BOT = "147305904854610743";
const CHANNEL = "135090549460002500";
const BOT_ROLE = "135090549460002600";
const NOW = Date.parse("2026-11-12T20:00:00.000Z");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const HASH = "0123456789abcdef0123456789abcdef";

let counter = 0;
const snowflake = (ms: number): string => (((BigInt(ms) - 1_420_070_400_000n) << 22n) + BigInt(counter++ % 4096)).toString();
const minutesAgo = (minutes: number): string => snowflake(NOW - minutes * 60_000);

/** Tous les droits qu'il faut au robot, en un nombre. */
const ALL = NEEDED_PERMISSIONS_VALUE.toString();
const without = (label: string): string => (NEEDED_PERMISSIONS_VALUE & ~(NEEDED_PERMISSIONS.find((p) => p.label === label)?.bit ?? 0n)).toString();

interface Member {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  nick?: string | null;
  bot?: boolean;
  /** Parti du serveur : Discord répond 404. */
  gone?: boolean;
}

interface Call {
  method: string;
  path: string;
  auth: string | null;
  agent: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  filename: string | null;
  /** Le fichier joint, tel que le robot l'envoie. */
  file: File | null;
}

/** Un faux Discord : un serveur, un salon, ses messages, et ce que le robot y fait. */
function fakeDiscord(options: {
  members?: Member[];
  messages?: Record<string, unknown>[];
  botPermissions?: string;
  overwrites?: Record<string, unknown>[];
  systemChannel?: string | null;
  flags?: number;
  /** 1 : le serveur exige la double authentification pour modérer. */
  mfaLevel?: number;
  /** Le compte qui possède le robot a-t-il la double authentification ? Sans réponse, Discord ne le dit pas. */
  ownerMfa?: boolean;
  /** Une réponse forcée pour un appel : « POST /channels/…/messages » → 500. */
  force?: (method: string, path: string, attempt: number) => { status: number; body?: unknown } | "panne" | null;
}) {
  const calls: Call[] = [];
  const attempts = new Map<string, number>();
  const messages = [...(options.messages ?? [])];
  const members = options.members ?? [];
  const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    if (url.startsWith("https://cdn.discordapp.com/")) {
      calls.push({ method, path: url, auth: headers.get("authorization"), agent: headers.get("user-agent"), reason: null, payload: null, filename: null, file: null });
      const forced = options.force?.(method, url, 0);
      if (forced === "panne") throw new Error("réseau coupé");
      if (forced) return new Response(null, { status: forced.status });
      return new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
    }
    if (!url.startsWith(DISCORD_API)) throw new Error(`appel inattendu : ${url}`);
    const path = url.slice(DISCORD_API.length);
    const form = init.body instanceof FormData ? init.body : null;
    const file = form?.get("files[0]");
    calls.push({
      method,
      path,
      auth: headers.get("authorization"),
      agent: headers.get("user-agent"),
      reason: headers.get("x-audit-log-reason"),
      payload: form ? (JSON.parse(String(form.get("payload_json"))) as Record<string, unknown>) : null,
      filename: file instanceof File ? file.name : null,
      file: file instanceof File ? file : null,
    });
    const key = `${method} ${path}`;
    const attempt = attempts.get(key) ?? 0;
    attempts.set(key, attempt + 1);
    const forced = options.force?.(method, path, attempt);
    if (forced === "panne") throw new Error("réseau coupé");
    if (forced) return json(forced.status, forced.body ?? {});

    if (headers.get("authorization") !== `Bot ${TOKEN}`) return json(401, { message: "401: Unauthorized" });
    if (method === "GET" && path === "/users/@me") return json(200, { id: BOT, username: "Le Guetteur", bot: true, ...(options.ownerMfa === undefined ? {} : { mfa_enabled: options.ownerMfa }) });
    if (method === "GET" && path === `/guilds/${GUILD}`) {
      return json(200, {
        id: GUILD,
        system_channel_id: options.systemChannel === undefined ? CHANNEL : options.systemChannel,
        system_channel_flags: options.flags ?? 0,
        mfa_level: options.mfaLevel ?? 0,
        roles: [
          { id: GUILD, permissions: "0" },
          { id: BOT_ROLE, permissions: options.botPermissions ?? ALL },
        ],
      });
    }
    if (method === "GET" && path === `/channels/${CHANNEL}/messages?limit=100`) return json(200, messages);
    if (method === "GET" && path === `/channels/${CHANNEL}`) return json(200, { id: CHANNEL, permission_overwrites: options.overwrites ?? [] });
    if (method === "GET" && path === `/guilds/${GUILD}/members/${BOT}`) return json(200, { roles: [BOT_ROLE], user: { id: BOT } });
    const memberPath = /^\/guilds\/[0-9]+\/members\/([0-9]+)$/.exec(path);
    if (method === "GET" && memberPath) {
      const member = members.find((m) => m.id === memberPath[1]);
      return !member || member.gone ? json(404, { code: 10007, message: "Unknown Member" }) : json(200, { nick: member.nick ?? null, avatar: null, roles: [], user: member });
    }
    if (method === "POST" && path === `/channels/${CHANNEL}/messages`) {
      const id = snowflake(NOW);
      messages.unshift({ id, type: 0, author: { id: BOT, username: "Le Gaulois", bot: true }, content: "", attachments: [{ filename: file instanceof File ? file.name : "" }] });
      return json(200, { id });
    }
    const removal = new RegExp(`^/channels/${CHANNEL}/messages/([0-9]+)$`).exec(path);
    if (method === "DELETE" && removal) {
      const index = messages.findIndex((m) => m["id"] === removal[1]);
      if (index < 0) return json(404, { code: 10008, message: "Unknown Message" });
      messages.splice(index, 1);
      return json(204, null);
    }
    return json(404, { message: "404: Not Found" });
  }) as typeof globalThis.fetch;

  return { fetch, calls, messages, ops: () => calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`) };
}

const joinMessage = (id: string, member: Member): Record<string, unknown> => ({
  id,
  type: JOIN_MESSAGE_TYPE,
  content: "",
  attachments: [],
  author: { id: member.id, username: member.username, global_name: member.global_name ?? null, avatar: member.avatar ?? null, ...(member.bot ? { bot: true } : {}) },
});

const BRENNOS: Member = { id: "222222222222222201", username: "brennos_44", global_name: "Brennos", avatar: HASH };
const EPONA: Member = { id: "222222222222222202", username: "epona", global_name: null, avatar: null };

function deps(discord: ReturnType<typeof fakeDiscord>, extra: Partial<ArrivalsDeps> = {}) {
  const logs: string[] = [];
  const drawings: { drawing: ArrivalDrawing; avatar: boolean }[] = [];
  const waits: number[] = [];
  const all: ArrivalsDeps = {
    token: TOKEN,
    guildId: GUILD,
    channelId: CHANNEL,
    fetch: discord.fetch,
    now: NOW,
    draws: (char) => /^[\p{Script=Latin}\p{N}_. \[\]]$/u.test(char),
    render: async (drawing, avatar) => {
      drawings.push({ drawing, avatar: avatar !== null });
      return PNG;
    },
    alt: (phrase, fullName) => `ALT ${phrase.texte.replace("{nom}", () => fullName)}`,
    log: (line) => logs.push(line),
    wait: async (ms) => {
      waits.push(ms);
    },
    ...extra,
  };
  return { all, logs, drawings, waits };
}

describe("les droits du robot", () => {
  const roles = [
    { id: GUILD, permissions: "1024" },
    { id: BOT_ROLE, permissions: ALL },
  ];
  it("additionne les droits de ses rôles, et il ne lui manque rien", () => {
    expect(missingPermissions(channelPermissions(GUILD, roles, [BOT_ROLE], BOT, []))).toEqual([]);
  });
  it("sans son rôle, il ne lui reste que ce que tout le monde a", () => {
    expect(missingPermissions(channelPermissions(GUILD, roles, [], BOT, []))).toEqual(["Voir les anciens messages", "Envoyer des messages", "Joindre des fichiers", "Gérer les messages"]);
  });
  it("suit les réglages du salon : pour tout le monde, pour ses rôles, puis pour lui", () => {
    const manage = (1n << 13n).toString();
    const view = (1n << 10n).toString();
    // Le salon est fermé à tout le monde, et rouvert au rôle du robot.
    const closed = [
      { id: GUILD, type: 0, allow: "0", deny: view },
      { id: BOT_ROLE, type: 0, allow: view, deny: "0" },
    ];
    expect(missingPermissions(channelPermissions(GUILD, roles, [BOT_ROLE], BOT, closed))).toEqual([]);
    // Le salon retire « Gérer les messages » au rôle du robot.
    expect(missingPermissions(channelPermissions(GUILD, roles, [BOT_ROLE], BOT, [{ id: BOT_ROLE, type: 0, allow: "0", deny: manage }]))).toEqual(["Gérer les messages"]);
    // Puis le lui rend, à lui seul.
    const own = [
      { id: BOT_ROLE, type: 0, allow: "0", deny: manage },
      { id: BOT, type: 1, allow: manage, deny: "0" },
    ];
    expect(missingPermissions(channelPermissions(GUILD, roles, [BOT_ROLE], BOT, own))).toEqual([]);
    // Le réglage d'un autre membre ne compte pas.
    expect(missingPermissions(channelPermissions(GUILD, roles, [BOT_ROLE], BOT, [{ id: "999999999999999999", type: 1, allow: "0", deny: manage }]))).toEqual([]);
  });
  it("un administrateur a tout, quel que soit le salon", () => {
    const admin = [{ id: BOT_ROLE, permissions: "8" }];
    expect(missingPermissions(channelPermissions(GUILD, admin, [BOT_ROLE], BOT, [{ id: GUILD, type: 0, allow: "0", deny: ALL }]))).toEqual([]);
  });
  it("lit un droit mal écrit comme aucun droit", () => {
    expect(missingPermissions(channelPermissions(GUILD, [{ id: BOT_ROLE, permissions: "beaucoup" }], [BOT_ROLE], BOT, []))).toHaveLength(NEEDED_PERMISSIONS.length);
  });
  it("demande cinq droits dans le salon, pas un de plus, et aucun sur le serveur dans le lien qui ajoute le robot", () => {
    expect(NEEDED_PERMISSIONS.map((p) => p.label)).toEqual(["Voir le salon", "Voir les anciens messages", "Envoyer des messages", "Joindre des fichiers", "Gérer les messages"]);
    expect(NEEDED_PERMISSIONS_VALUE).toBe(109568n);
    expect(botInstallUrl(BOT, GUILD)).toBe(`https://discord.com/oauth2/authorize?client_id=${BOT}&scope=bot&permissions=0&guild_id=${GUILD}&disable_guild_select=true`);
  });
});

describe("le message", () => {
  it("n'est que l'image et sa description : aucun texte, aucune mention possible, en message discret", () => {
    const payload = arrivalPayload("arrivee.png", "La description");
    expect("content" in payload).toBe(false);
    expect(payload).toEqual({
      allowed_mentions: { parse: [] },
      flags: 4096,
      attachments: [{ id: 0, filename: "arrivee.png", description: "La description" }],
    });
  });
});

describe("readAvatar", () => {
  it("rend la photo, ou rien si elle ne se lit pas", async () => {
    const ok = (async () => new Response(Uint8Array.from([1, 2, 3]), { status: 200 })) as typeof fetch;
    expect(await readAvatar("https://cdn.discordapp.com/avatars/1/a.png", ok)).toEqual(Buffer.from([1, 2, 3]));
    expect(await readAvatar(null, ok)).toBeNull();
    expect(await readAvatar("https://cdn.discordapp.com/x", (async () => new Response(null, { status: 404 })) as typeof fetch)).toBeNull();
    expect(await readAvatar("https://cdn.discordapp.com/x", (async () => new Response(new Uint8Array(0), { status: 200 })) as typeof fetch)).toBeNull();
    expect(await readAvatar("https://cdn.discordapp.com/x", (async () => new Response("x", { status: 200, headers: { "content-length": "99999999" } })) as typeof fetch)).toBeNull();
    expect(
      await readAvatar("https://cdn.discordapp.com/x", (async () => {
        throw new Error("réseau coupé");
      }) as typeof fetch),
    ).toBeNull();
  });
});

describe("arrivalsPass", () => {
  it("remplace un message d'arrivée : l'image d'abord, puis le retrait du message de Discord", async () => {
    const arrival = minutesAgo(3);
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(arrival, BRENNOS)] });
    const { all, logs, drawings } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 1, cleaned: 0, left: 0, failed: false });

    expect(discord.ops()).toEqual([`POST /channels/${CHANNEL}/messages`, `DELETE /channels/${CHANNEL}/messages/${arrival}`]);
    const post = discord.calls.find((c) => c.method === "POST")!;
    const marker = readMarker(post.filename ?? "");
    expect(marker?.messageId).toBe(arrival);
    expect(marker?.userId).toBe(BRENNOS.id);
    const phrase = PHRASES[marker!.style.phrase]!;
    // Aucun texte : le message n'est que l'image.
    expect(post.payload).toEqual({
      allowed_mentions: { parse: [] },
      flags: 4096,
      attachments: [{ id: 0, filename: post.filename, description: `ALT ${phrase.texte.replace("{nom}", "Brennos")}` }],
    });
    // Le dessin reçoit le nom affiché, la phrase et le décor du fichier, et la photo de profil.
    expect(drawings).toHaveLength(1);
    expect(drawings[0]).toMatchObject({ drawing: { name: "Brennos", phrase, decor: marker!.style.decor }, avatar: true });
    expect(discord.calls.find((c) => c.method === "DELETE")?.reason).toBe(encodeURIComponent(REMOVAL_REASON));
    // Le salon ne garde que l'image.
    expect(discord.messages.map((m) => m["type"])).toEqual([0]);
    expect(logs).toEqual(["::notice::Arrivées : 1 message d'arrivée remplacé par une image."]);
  });

  it("ne donne le jeton qu'à Discord, jamais au serveur des photos, et se présente comme un robot", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)] });
    await arrivalsPass(deps(discord).all);
    const photo = discord.calls.filter((c) => c.path.startsWith("https://cdn.discordapp.com/"));
    expect(photo.map((c) => c.path)).toEqual([`https://cdn.discordapp.com/avatars/${BRENNOS.id}/${HASH}.png?size=256`]);
    expect(photo[0]?.auth).toBeNull();
    for (const call of discord.calls) {
      expect(call.agent).toBe(USER_AGENT);
      if (!call.path.startsWith("https://cdn.discordapp.com/")) expect(call.auth).toBe(`Bot ${TOKEN}`);
    }
  });

  it("n'écrit dans le journal ni nom, ni identifiant, ni jeton", async () => {
    const gone: Member = { id: "222222222222222209", username: "parti_trop_vite", gone: true };
    const discord = fakeDiscord({ members: [BRENNOS, EPONA, gone], messages: [joinMessage(minutesAgo(1), gone), joinMessage(minutesAgo(2), EPONA), joinMessage(minutesAgo(3), BRENNOS)] });
    const { all, logs } = deps(discord);
    await arrivalsPass(all);
    const journal = logs.join("\n");
    for (const secret of [TOKEN, BRENNOS.id, BRENNOS.username, "Brennos", EPONA.id, EPONA.username, gone.username, CHANNEL, GUILD]) expect(journal).not.toContain(secret);
    expect(logs).toEqual(["::notice::Arrivées : 2 messages d'arrivée remplacés par une image, 1 laissé tel quel."]);
  });

  it("quand personne n'est arrivé, ne fait que lire : le robot, le serveur, ses droits, le salon", async () => {
    const discord = fakeDiscord({ messages: [{ id: minutesAgo(4), type: 0, content: "bonjour", author: { id: EPONA.id, username: EPONA.username } }] });
    const { all, logs } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: false });
    expect(discord.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /users/@me", `GET /guilds/${GUILD}`, `GET /guilds/${GUILD}/members/${BOT}`, `GET /channels/${CHANNEL}`, `GET /channels/${CHANNEL}/messages?limit=100`]);
    expect(logs).toEqual(["Arrivées : aucun message d'arrivée à remplacer."]);
  });

  it("écrit le surnom du serveur s'il y en a un, sinon le nom affiché, sinon le nom d'utilisateur", async () => {
    const nicked: Member = { ...BRENNOS, id: "222222222222222203", nick: "Pseudo du serveur" };
    const discord = fakeDiscord({ members: [nicked, EPONA], messages: [joinMessage(minutesAgo(2), EPONA), joinMessage(minutesAgo(3), nicked)] });
    const { all, drawings } = deps(discord);
    await arrivalsPass(all);
    expect(drawings.map((d) => d.drawing.name)).toEqual(["Pseudo du serveur", "epona"]);
    // Sans photo, le dessin n'en reçoit pas, et rien n'est demandé au serveur des photos pour ce joueur.
    expect(drawings.map((d) => d.avatar)).toEqual([true, false]);
  });

  it("ne donne pas deux fois de suite la même phrase ni le même décor", async () => {
    const members = Array.from({ length: 5 }, (_, i): Member => ({ id: `22222222222222221${i}`, username: `joueur${i}` }));
    const discord = fakeDiscord({ members, messages: members.map((m, i) => joinMessage(minutesAgo(10 - i), m)) });
    const { all, drawings } = deps(discord);
    expect((await arrivalsPass(all)).replaced).toBe(5);
    const phrases = drawings.map((d) => d.drawing.phrase.texte);
    expect(new Set(phrases).size).toBe(5);
    drawings.forEach((d, i) => {
      if (i > 0) expect(d.drawing.decor).not.toBe(drawings[i - 1]!.drawing.decor);
    });
  });

  it("laisse le message de Discord d'un joueur déjà reparti, d'un robot, et d'une arrivée de plus de deux heures", async () => {
    const gone: Member = { id: "222222222222222204", username: "reparti", gone: true };
    const robot: Member = { id: "222222222222222205", username: "un_robot", bot: true };
    const old = snowflake(NOW - MAX_AGE_MS - 60_000);
    const discord = fakeDiscord({ members: [gone, robot, EPONA], messages: [joinMessage(minutesAgo(2), robot), joinMessage(minutesAgo(3), gone), joinMessage(old, EPONA)] });
    const { all, logs } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 2, failed: false });
    expect(discord.ops()).toEqual([]);
    expect(discord.messages).toHaveLength(3);
    expect(logs).toEqual(["Arrivées : aucun message d'arrivée remplacé, 2 laissés tels quels."]);
  });

  it("ne refait pas une image déjà dans le salon : il retire seulement le message de Discord", async () => {
    const arrival = minutesAgo(8);
    const image = { id: minutesAgo(7), type: 0, content: "", author: { id: BOT, username: "Le Gaulois", bot: true }, attachments: [{ filename: markerName(arrival, BRENNOS.id, { phrase: 2, decor: "nuit" }) }] };
    const discord = fakeDiscord({ members: [BRENNOS], messages: [image, joinMessage(arrival, BRENNOS)] });
    const { all, logs, drawings } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 1, left: 0, failed: false });
    expect(discord.ops()).toEqual([`DELETE /channels/${CHANNEL}/messages/${arrival}`]);
    expect(drawings).toEqual([]);
    expect(logs).toEqual(["::notice::Arrivées : aucun message d'arrivée remplacé, 1 message de Discord retiré après coup."]);
  });

  it("au passage suivant, ne trouve plus rien à faire", async () => {
    const discord = fakeDiscord({ members: [BRENNOS, EPONA], messages: [joinMessage(minutesAgo(2), EPONA), joinMessage(minutesAgo(3), BRENNOS)] });
    expect((await arrivalsPass(deps(discord).all)).replaced).toBe(2);
    const second = deps(discord);
    expect(await arrivalsPass(second.all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: false });
    expect(second.drawings).toEqual([]);
    expect(discord.ops()).toHaveLength(4);
  });

  it("ne poste rien s'il manque un droit au robot dans le salon, et dit lequel", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], botPermissions: without("Gérer les messages") });
    const { all, logs, drawings } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(discord.ops()).toEqual([]);
    expect(drawings).toEqual([]);
    expect(logs).toEqual(["::warning::Arrivées : dans le salon des arrivées, il manque au robot : « Gérer les messages » (Modifier le salon, Permissions). Rien n'est remplacé tant que ces droits manquent. Le robot qui porte ce jeton s'appelle « Le Guetteur ». Il a 1 rôle sur le serveur, sans le droit « Administrateur »."]);
  });

  it("tient compte des réglages du salon lui-même", async () => {
    const closed = [{ id: BOT_ROLE, type: 0, allow: "0", deny: (1n << 15n).toString() }];
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], overwrites: closed });
    const { all, logs } = deps(discord);
    expect((await arrivalsPass(all)).failed).toBe(true);
    expect(discord.ops()).toEqual([]);
    expect(logs[0]).toContain("« Joindre des fichiers »");
  });

  it("dit que le jeton est à remplacer quand Discord ne le reconnaît pas", async () => {
    const discord = fakeDiscord({ messages: [joinMessage(minutesAgo(3), BRENNOS)] });
    const { all, logs } = deps(discord, { token: "mauvais" });
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("DISCORD_BOT_TOKEN");
    expect(logs[0]).not.toContain("mauvais");
    expect(discord.calls).toHaveLength(1);
  });

  it("donne le lien qui ajoute le robot quand il n'est pas sur le serveur", async () => {
    const discord = fakeDiscord({ force: (method, path) => (path === `/guilds/${GUILD}` ? { status: 403, body: { code: 50001, message: "Missing Access" } } : null) });
    const { all, logs } = deps(discord);
    expect((await arrivalsPass(all)).failed).toBe(true);
    expect(logs).toEqual([`::warning::Arrivées : le robot n'est pas sur le serveur du clan. Le robot qui porte ce jeton s'appelle « Le Guetteur ». Qui gère le serveur l'y ajoute par ce lien : ${botInstallUrl(BOT, GUILD)}`]);
  });

  it("ne fait rien, sans erreur, quand le serveur n'a pas de salon des messages système", async () => {
    const discord = fakeDiscord({ systemChannel: null });
    const { all, logs } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: false });
    expect(logs[0]).toContain("pas de salon des messages système");
    expect(discord.calls).toHaveLength(2);
  });

  it("s'arrête, sans rien lire ni poster, si le serveur écrit ses arrivées dans un autre salon que le sien", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], systemChannel: "135090549460002999" });
    const { all, logs } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(discord.calls.map((c) => c.method + " " + c.path)).toEqual(["GET /users/@me", "GET /guilds/" + GUILD]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("un autre salon que celui confié au robot");
  });

  it("travaille dans le salon que le pilote a désigné", () => {
    // Un numéro de Discord, et pas celui du faux salon des tests : le script le donne tel quel au passage.
    expect(ARRIVALS_CHANNEL_ID).toMatch(/^[0-9]{17,20}$/);
    expect(ARRIVALS_CHANNEL_ID).not.toBe(CHANNEL);
  });

  it("signale que le serveur n'envoie pas de message d'arrivée, et continue", async () => {
    const discord = fakeDiscord({ flags: 1 });
    const { all, logs } = deps(discord);
    expect((await arrivalsPass(all)).failed).toBe(false);
    expect(logs).toEqual(["Arrivées : le serveur n'envoie pas de message d'arrivée (Paramètres du serveur, Vue d'ensemble) : rien à remplacer.", "Arrivées : aucun message d'arrivée à remplacer."]);
  });

  it("dit quels droits manquent quand il ne peut pas lire le salon", async () => {
    const discord = fakeDiscord({ force: (method, path) => (path.endsWith("/messages?limit=100") ? { status: 403, body: { code: 50001 } } : null) });
    const { all, logs } = deps(discord);
    expect((await arrivalsPass(all)).failed).toBe(true);
    expect(logs[0]).toContain("« Voir le salon », « Voir les anciens messages »");
  });

  it("garde le message de Discord quand l'image n'est pas acceptée, et réessaie au passage suivant", async () => {
    const arrival = minutesAgo(3);
    let down = true;
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(arrival, BRENNOS)], force: (method) => (method === "POST" && down ? { status: 500 } : null) });
    const first = deps(discord);
    expect(await arrivalsPass(first.all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(discord.ops()).toEqual([`POST /channels/${CHANNEL}/messages`]);
    expect(discord.messages.map((m) => m["id"])).toEqual([arrival]);
    expect(first.logs[0]).toBe("::warning::Arrivées : Discord a répondu 500 à l'envoi de l'image. Nouvel essai au prochain passage.");
    down = false;
    expect((await arrivalsPass(deps(discord).all)).replaced).toBe(1);
    expect(discord.messages.map((m) => m["type"])).toEqual([0]);
  });

  it("s'arrête au premier refus d'envoi : inutile d'insister pour les suivantes", async () => {
    const discord = fakeDiscord({ members: [BRENNOS, EPONA], messages: [joinMessage(minutesAgo(2), EPONA), joinMessage(minutesAgo(3), BRENNOS)], force: (method) => (method === "POST" ? { status: 403 } : null) });
    const { all } = deps(discord);
    expect((await arrivalsPass(all)).failed).toBe(true);
    expect(discord.ops()).toEqual([`POST /channels/${CHANNEL}/messages`]);
  });

  it("si le retrait échoue, s'arrête là, puis ne retire que le message au passage suivant : jamais deux images", async () => {
    const arrival = minutesAgo(3);
    let refused = true;
    const discord = fakeDiscord({
      members: [BRENNOS, EPONA],
      messages: [joinMessage(minutesAgo(2), EPONA), joinMessage(arrival, BRENNOS)],
      force: (method) => (method === "DELETE" && refused ? { status: 403, body: { code: 50013 } } : null),
    });
    const first = deps(discord);
    expect(await arrivalsPass(first.all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    // Une image, un retrait refusé, et rien pour l'arrivée suivante.
    expect(discord.ops()).toEqual([`POST /channels/${CHANNEL}/messages`, `DELETE /channels/${CHANNEL}/messages/${arrival}`]);
    expect(first.logs[0]).toContain("« Gérer les messages »");
    expect(first.drawings).toHaveLength(1);

    refused = false;
    const second = deps(discord);
    expect(await arrivalsPass(second.all)).toEqual({ replaced: 1, cleaned: 1, left: 0, failed: false });
    // Une seule image de plus : celle de la seconde arrivée.
    expect(second.drawings.map((d) => d.drawing.name)).toEqual(["epona"]);
    expect(discord.messages.filter((m) => m["type"] === JOIN_MESSAGE_TYPE)).toEqual([]);
    expect(discord.messages.filter((m) => m["type"] === 0)).toHaveLength(2);
  });

  it("compte comme retiré un message que quelqu'un a déjà enlevé", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], force: (method) => (method === "DELETE" ? { status: 404, body: { code: 10008 } } : null) });
    expect(await arrivalsPass(deps(discord).all)).toEqual({ replaced: 1, cleaned: 0, left: 0, failed: false });
  });

  it("attend quand Discord demande de ralentir, puis réessaie une fois", async () => {
    const discord = fakeDiscord({
      members: [BRENNOS],
      messages: [joinMessage(minutesAgo(3), BRENNOS)],
      force: (method, path, attempt) => (method === "POST" && attempt === 0 ? { status: 429, body: { retry_after: 0.4 } } : null),
    });
    const { all, waits } = deps(discord);
    expect((await arrivalsPass(all)).replaced).toBe(1);
    expect(waits).toEqual([500]);
    expect(discord.ops().filter((op) => op.startsWith("POST"))).toHaveLength(2);
  });

  it("n'attend jamais plus de cinq secondes", async () => {
    const discord = fakeDiscord({ messages: [], force: (method, path, attempt) => (path === "/users/@me" && attempt === 0 ? { status: 429, body: { retry_after: 3600 } } : null) });
    const { all, waits } = deps(discord);
    await arrivalsPass(all);
    expect(waits).toEqual([5000]);
  });

  it("garde le message de Discord quand l'image ne se dessine pas", async () => {
    const arrival = minutesAgo(3);
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(arrival, BRENNOS)] });
    const { all, logs } = deps(discord, {
      render: async () => {
        throw new Error("un caractère ne peut pas être dessiné");
      },
    });
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(discord.ops()).toEqual([]);
    expect(logs[0]).toBe("::warning::Arrivées : image impossible à dessiner (un caractère ne peut pas être dessiné), le message de Discord reste.");
  });

  it("si le nom affiché ne se dessine pas, essaie avec le nom d'utilisateur", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)] });
    const tried: string[] = [];
    const { all } = deps(discord, {
      render: async (drawing) => {
        tried.push(drawing.name);
        if (drawing.name === "Brennos") throw new Error("un caractère ne peut pas être dessiné");
        return PNG;
      },
    });
    expect((await arrivalsPass(all)).replaced).toBe(1);
    expect(tried).toEqual(["Brennos", "brennos_44"]);
  });

  it("dessine l'initiale quand la photo ne se lit pas", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], force: (method, path) => (path.startsWith("https://cdn.discordapp.com/") ? "panne" : null) });
    const { all, drawings } = deps(discord);
    expect((await arrivalsPass(all)).replaced).toBe(1);
    expect(drawings[0]?.avatar).toBe(false);
  });

  it("continue avec le nom du message si la fiche du joueur ne se lit pas", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], force: (method, path) => (path === `/guilds/${GUILD}/members/${BRENNOS.id}` ? { status: 500 } : null) });
    const { all, drawings } = deps(discord);
    expect((await arrivalsPass(all)).replaced).toBe(1);
    expect(drawings[0]?.drawing.name).toBe("Brennos");
  });

  it("réessaie au prochain passage quand Discord ne répond pas", async () => {
    const discord = fakeDiscord({ force: () => "panne" });
    const { all, logs } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(logs).toEqual(["::warning::Arrivées : Discord n'a pas répondu. Nouvel essai au prochain passage."]);
  });

  it("ignore un message que Discord donnerait sous une forme inattendue", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [{ id: "pas-un-numero", type: JOIN_MESSAGE_TYPE, author: { id: "x" } }, { type: JOIN_MESSAGE_TYPE }, joinMessage(minutesAgo(3), BRENNOS)] });
    expect((await arrivalsPass(deps(discord).all)).replaced).toBe(1);
  });
});

describe("le passage entier, avec le vrai dessin", () => {
  it("poste un PNG de 1 200 × 480, décrit pour les lecteurs d'écran, même quand la photo de profil n'est pas une image", async () => {
    const { GazetteFonts } = await import("../../src/lib/gazette-image");
    const { arrivalAlt, renderArrival, WarriorAssets } = await import("../../src/lib/arrivees-image");
    const sharp = (await import("sharp")).default;
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const warrior = new WarriorAssets(root);
    // Un nom affiché avec un dragon : l'image l'écrit sans lui, la description le garde.
    const luern: Member = { id: "222222222222222230", username: "luern_44", global_name: `[GAL] Luern${String.fromCodePoint(0x1f409)}`, avatar: HASH };
    const arrival = minutesAgo(3);
    const discord = fakeDiscord({ members: [luern], messages: [joinMessage(arrival, luern)] });
    const { all } = deps(discord, {
      draws: (char) => fonts.draws(char, "name"),
      render: (drawing, avatar) => renderArrival(drawing, "https://les-gaulois.github.io", fonts, warrior, avatar),
      alt: (phrase, fullName) => arrivalAlt(phrase, fullName, "GAL"),
    });
    expect(await arrivalsPass(all)).toEqual({ replaced: 1, cleaned: 0, left: 0, failed: false });

    const post = discord.calls.find((c) => c.method === "POST")!;
    expect(readMarker(post.file?.name ?? "")?.messageId).toBe(arrival);
    expect(post.file?.type).toBe("image/png");
    const meta = await sharp(Buffer.from(await post.file!.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 1200, 480]);
    const description = (post.payload?.["attachments"] as { description: string }[])[0]!.description;
    expect(description.startsWith("Image de bienvenue du clan [GAL]. ")).toBe(true);
    expect(description).toContain(`[GAL] Luern${String.fromCodePoint(0x1f409)}`);
    expect(description.endsWith("Bienvenue chez les Gaulois.")).toBe(true);
  }, 60_000);
});

describe("ce que la relecture a trouvé", () => {
  it("reconnaît la forme d'un jeton de robot, sans rien savoir de son application", () => {
    const first = Buffer.from("147305904854610743").toString("base64").replace(/=+$/, "");
    expect(looksLikeToken(`${first}.GabcDE.abcdefghijklmnopqrstuvwxyz_0123456789-AB`)).toBe(true);
    for (const other of ["", "pas un jeton", "abc.def", "d9d55bd88a96ebd72728cfd0a87b494065dd9b094f1a9254e24640ee02441855", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature", `${first}.Gabc DE.abc`]) {
      expect(looksLikeToken(other), other).toBe(false);
    }
  });

  it("sans « Voir les anciens messages », s'arrête et le dit, même quand personne n'est arrivé : Discord rendrait une liste vide", async () => {
    const discord = fakeDiscord({ messages: [], botPermissions: without("Voir les anciens messages") });
    const { all, logs } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(logs).toEqual(["::warning::Arrivées : dans le salon des arrivées, il manque au robot : « Voir les anciens messages » (Modifier le salon, Permissions). Rien n'est remplacé tant que ces droits manquent. Le robot qui porte ce jeton s'appelle « Le Guetteur ». Il a 1 rôle sur le serveur, sans le droit « Administrateur »."]);
    // Le salon n'est même pas lu.
    expect(discord.calls.some((c) => c.path.endsWith("/messages?limit=100"))).toBe(false);
  });

  it("ne poste rien si ses droits ne se lisent pas : ni sa fiche, ni le salon", async () => {
    for (const unreadable of [`/guilds/${GUILD}/members/${BOT}`, `/channels/${CHANNEL}`]) {
      const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], force: (method, path) => (path === unreadable ? { status: 500 } : null) });
      const { all, logs, drawings } = deps(discord);
      expect(await arrivalsPass(all), unreadable).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
      expect(discord.ops(), unreadable).toEqual([]);
      expect(drawings, unreadable).toEqual([]);
      expect(logs[0], unreadable).toContain("les droits du robot n'ont pas pu être lus");
    }
  });

  it("dit les cinq droits à donner quand il ne voit pas le salon", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], force: (method, path) => (path === `/channels/${CHANNEL}` ? { status: 403, body: { code: 50001 } } : null) });
    const { all, logs } = deps(discord);
    expect((await arrivalsPass(all)).failed).toBe(true);
    expect(discord.ops()).toEqual([]);
    expect(logs).toEqual(["::warning::Arrivées : le robot ne voit pas le salon des arrivées. Dans ce salon (Modifier le salon, Permissions), il lui faut : « Voir le salon », « Voir les anciens messages », « Envoyer des messages », « Joindre des fichiers », « Gérer les messages ». Le robot qui porte ce jeton s'appelle « Le Guetteur »."]);
  });

  it("ne poste rien si le serveur exige la double authentification et que le compte du robot ne l'a pas", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], mfaLevel: 1, ownerMfa: false });
    const { all, logs, drawings } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: true });
    expect(discord.ops()).toEqual([]);
    expect(drawings).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("double authentification");
    expect(logs[0]).toContain("Rien n'est remplacé d'ici là.");
  });

  it("travaille quand la double authentification est là, ou que le serveur ne l'exige pas, ou que Discord ne le dit pas", async () => {
    for (const options of [{ mfaLevel: 1, ownerMfa: true }, { mfaLevel: 0, ownerMfa: false }, { mfaLevel: 1 }]) {
      const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], ...options });
      expect((await arrivalsPass(deps(discord).all)).replaced, JSON.stringify(options)).toBe(1);
    }
  });

  it("dit la vraie raison quand Discord refuse le retrait faute de double authentification", async () => {
    const discord = fakeDiscord({
      members: [BRENNOS, EPONA],
      messages: [joinMessage(minutesAgo(2), EPONA), joinMessage(minutesAgo(3), BRENNOS)],
      force: (method) => (method === "DELETE" ? { status: 403, body: { code: 60003, message: "Two factor is required for this operation" } } : null),
    });
    const { all, logs } = deps(discord);
    expect((await arrivalsPass(all)).failed).toBe(true);
    // Une image, un retrait refusé, et rien de plus.
    expect(discord.ops().filter((op) => op.startsWith("POST"))).toHaveLength(1);
    expect(logs[0]).toContain("double authentification");
    expect(logs[0]).not.toContain("« Gérer les messages »");
  });

  it("ne dessine pas d'image pour un nom qui est une adresse ou une invitation : le message de Discord reste", async () => {
    const advert: Member = { id: "222222222222222240", username: "promo_44", global_name: "discord.gg/abcdef" };
    // Un nom affiché que les polices ne dessinent pas : c'est le nom d'utilisateur qui s'écrirait, et c'est une adresse.
    const hidden: Member = { id: "222222222222222242", username: "gagnez.exemple.com", global_name: String.fromCodePoint(0x1f409, 0x1f409) };
    // Le nom d'utilisateur ressemble à une adresse, mais il ne s'écrit pas : le nom affiché, sage, a son image.
    const quiet: Member = { id: "222222222222222241", username: "promo.exemple.com", global_name: "Un nom sage" };
    const discord = fakeDiscord({
      members: [advert, hidden, quiet, EPONA],
      messages: [joinMessage(minutesAgo(1), EPONA), joinMessage(minutesAgo(2), quiet), joinMessage(minutesAgo(3), hidden), joinMessage(minutesAgo(4), advert)],
    });
    const { all, logs, drawings } = deps(discord);
    expect(await arrivalsPass(all)).toEqual({ replaced: 2, cleaned: 0, left: 2, failed: false });
    expect(drawings.map((d) => d.drawing.name)).toEqual(["Un nom sage", "epona"]);
    expect(discord.messages.filter((m) => m["type"] === JOIN_MESSAGE_TYPE)).toHaveLength(2);
    expect(logs).toEqual(["::notice::Arrivées : 2 messages d'arrivée remplacés par une image, 2 laissés tels quels."]);
  });

  it("au-delà de cinq arrivées, remet les suivantes au passage d'après, et le dit", async () => {
    const members = Array.from({ length: 7 }, (_, i): Member => ({ id: `22222222222222226${i}`, username: `joueur${i}` }));
    const discord = fakeDiscord({ members, messages: members.map((m, i) => joinMessage(minutesAgo(20 - i), m)) });
    const first = deps(discord);
    expect((await arrivalsPass(first.all)).replaced).toBe(5);
    expect(first.logs).toEqual(["::notice::Arrivées : 5 messages d'arrivée remplacés par une image, 2 remis au passage suivant."]);
    const second = deps(discord);
    expect((await arrivalsPass(second.all)).replaced).toBe(2);
    expect(second.logs).toEqual(["::notice::Arrivées : 2 messages d'arrivée remplacés par une image."]);
    expect(discord.messages.filter((m) => m["type"] === JOIN_MESSAGE_TYPE)).toEqual([]);
  });

  it("retire, même après deux heures, le message de Discord resté à côté de son image, même d'un décor retiré depuis", async () => {
    const old = snowflake(NOW - MAX_AGE_MS - 5 * 60_000);
    // Une image du premier jour, dans le décor de la forêt, retiré depuis : son fichier est écrit tel quel.
    const image = { id: snowflake(NOW - MAX_AGE_MS - 4 * 60_000), type: 0, content: "", author: { id: BOT, username: "Le Guetteur", bot: true }, attachments: [{ filename: `arrivee-${old}-${BRENNOS.id}-2-foret.png` }] };
    const discord = fakeDiscord({ members: [BRENNOS], messages: [image, joinMessage(old, BRENNOS)] });
    expect(await arrivalsPass(deps(discord).all)).toEqual({ replaced: 0, cleaned: 1, left: 0, failed: false });
    expect(discord.ops()).toEqual([`DELETE /channels/${CHANNEL}/messages/${old}`]);
  });

  it("n'écrit le numéro d'aucun joueur dans le lien d'installation du journal : seulement ceux du robot et du serveur", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], force: (method, path) => (path === `/guilds/${GUILD}` ? { status: 404 } : null) });
    const { all, logs } = deps(discord);
    await arrivalsPass(all);
    expect(logs.join(" ")).toContain(`client_id=${BOT}`);
    expect(logs.join(" ")).not.toContain(BRENNOS.id);
    expect(logs.join(" ")).not.toContain(TOKEN);
  });
});

describe("le nom du robot dans le journal", () => {
  it("garde les lettres, les chiffres et quelques signes, et rien qui ferait une commande ou une ligne de plus", () => {
    expect(logName("Le Guetteur")).toBe("Le Guetteur");
    expect(logName("Robot d'accueil n° 2_bis.")).toBe("Robot d'accueil n 2_bis.");
    expect(logName(`Le${String.fromCodePoint(0x0a)}::error::Guetteur`)).toBe("Le errorGuetteur");
    expect(logName("::warning::")).toBe("warning");
    expect(logName(String.fromCodePoint(0x1f409))).toBe("sans nom");
    expect(logName("x".repeat(80))).toHaveLength(32);
  });

  it("dit à quel robot donner le droit qui manque, et qu'il n'est pas administrateur", async () => {
    const discord = fakeDiscord({ messages: [], botPermissions: without("Envoyer des messages") });
    const { all, logs } = deps(discord);
    await arrivalsPass(all);
    expect(logs).toEqual([
      "::warning::Arrivées : dans le salon des arrivées, il manque au robot : « Envoyer des messages » (Modifier le salon, Permissions). Rien n'est remplacé tant que ces droits manquent. Le robot qui porte ce jeton s'appelle « Le Guetteur ». Il a 1 rôle sur le serveur, sans le droit « Administrateur ».",
    ]);
  });

  it("travaille dès que le robot est administrateur, même si le salon lui retire un droit", async () => {
    const closed = [{ id: GUILD, type: 0, allow: "0", deny: NEEDED_PERMISSIONS_VALUE.toString() }];
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], botPermissions: "8", overwrites: closed });
    expect((await arrivalsPass(deps(discord).all)).replaced).toBe(1);
  });
});

describe("un robot administrateur", () => {
  it("travaille, mais le dit à chaque passage tant qu'il l'est", async () => {
    const discord = fakeDiscord({ members: [BRENNOS], messages: [joinMessage(minutesAgo(3), BRENNOS)], botPermissions: "8" });
    const { all, logs } = deps(discord);
    expect((await arrivalsPass(all)).replaced).toBe(1);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toBe(
      "::notice::Arrivées : le robot est administrateur du serveur, bien plus qu'il ne lui faut. Mieux vaut lui donner ses cinq droits dans le seul salon des arrivées (« Voir le salon », « Voir les anciens messages », « Envoyer des messages », « Joindre des fichiers », « Gérer les messages »), puis lui retirer ce rôle. Le robot qui porte ce jeton s'appelle « Le Guetteur ».",
    );
    expect(logs[1]).toBe("::notice::Arrivées : 1 message d'arrivée remplacé par une image.");
  });

  it("ne dit rien de tel quand il n'a que ses cinq droits, par ses rôles ou par le salon", async () => {
    const byRole = fakeDiscord({ messages: [] });
    const first = deps(byRole);
    await arrivalsPass(first.all);
    expect(first.logs).toEqual(["Arrivées : aucun message d'arrivée à remplacer."]);
    // Aucun droit sur le serveur, les cinq donnés au robot lui-même dans le salon : le réglage conseillé.
    const byChannel = fakeDiscord({ messages: [], botPermissions: "0", overwrites: [{ id: BOT, type: 1, allow: NEEDED_PERMISSIONS_VALUE.toString(), deny: "0" }] });
    const second = deps(byChannel);
    expect(await arrivalsPass(second.all)).toEqual({ replaced: 0, cleaned: 0, left: 0, failed: false });
    expect(second.logs).toEqual(["Arrivées : aucun message d'arrivée à remplacer."]);
  });
});
