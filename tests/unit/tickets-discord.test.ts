import { beforeAll, describe, expect, it } from "vitest";
import { clan } from "../../config/clan";
import { MESSAGES, SITE_URL, handle, type CommandEntry, type CommandIndex, type Deps, type DiscordCall, type DiscordReply } from "../../supabase/functions/code-discord/index";
import {
  CATEGORY_LIMIT,
  CATEGORY_NEEDS,
  CLOSE_DELAY_MS,
  JOIN_URL,
  JOURNAL_NEEDS,
  KINDS,
  OPENER_ALLOW,
  PERMISSIONS as P,
  TICKETS_COMMAND_NAME,
  TICKETS_OPTIONS,
  TICKETS_SITE_URL,
  TICKET_EMOJIS,
  TICKET_KINDS,
  TICKET_MESSAGES,
  answersOf,
  channelPermissions,
  claimedComponents,
  customIdsOf,
  everyoneCanView,
  openfrontLink,
  panelMessage,
  parseTicketId,
  quoteAnswer,
  rolesThatView,
  setupReport,
  snowflakeSeconds,
  ticketChannelName,
  ticketCustomId,
  welcomeMessage,
  type GuildChannel,
  type Role,
  type TicketAction,
} from "../../supabase/functions/code-discord/tickets";

/* ---------- Un serveur Discord inventé ---------- */

const GUILD = "987654321098765432";
const BOT = "246813579024681357";
const CATEGORY = "311111111111111111";
const JOURNAL = "322222222222222222";
const PANEL = "333333333333333333";
const STAFF = "344444444444444444";
const MEMBERS = "355555555555555555";
const PLAYER = "123456789012345678";
const OFFICER = "377777777777777777";
const STRANGER = "388888888888888888";
const NOW = 1_794_000_000;

/** Un numéro de Discord né à cette heure, en secondes. */
const snowflakeAt = (seconds: number, n = 0): string => (((BigInt(seconds) * 1000n - 1_420_070_400_000n) << 22n) + BigInt(n)).toString();

const MEMBER_BASE = P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS | P.ATTACH_FILES | P.READ_MESSAGE_HISTORY;
const BOT_IN_CATEGORY = CATEGORY_NEEDS.reduce((sum, n) => sum | n.bit, 0n) | P.MENTION_EVERYONE;
const BOT_IN_JOURNAL = JOURNAL_NEEDS.reduce((sum, n) => sum | n.bit, 0n);

interface RawOverwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}
interface RawChannel {
  id: string;
  type: number;
  name: string;
  parent_id: string | null;
  permission_overwrites: RawOverwrite[];
  topic?: string;
}
interface Sent {
  method: string;
  path: string;
  body: unknown;
  reason: string | undefined;
}

const overwrite = (id: string, type: number, allow: bigint, deny = 0n): RawOverwrite => ({ id, type, allow: allow.toString(), deny: deny.toString() });

function guild() {
  const roles = [
    { id: GUILD, name: "@everyone", permissions: MEMBER_BASE.toString(), managed: false, mentionable: false },
    { id: STAFF, name: "Staff", permissions: MEMBER_BASE.toString(), managed: false, mentionable: false },
    { id: MEMBERS, name: "[GAL]", permissions: MEMBER_BASE.toString(), managed: false, mentionable: false },
  ];
  const channels: RawChannel[] = [
    { id: CATEGORY, type: 4, name: "Tickets", parent_id: null, permission_overwrites: [overwrite(GUILD, 0, 0n, P.VIEW_CHANNEL), overwrite(STAFF, 0, P.VIEW_CHANNEL), overwrite(BOT, 1, BOT_IN_CATEGORY)] },
    { id: JOURNAL, type: 0, name: "logs-tickets", parent_id: null, permission_overwrites: [overwrite(GUILD, 0, 0n, P.VIEW_CHANNEL), overwrite(STAFF, 0, P.VIEW_CHANNEL), overwrite(BOT, 1, BOT_IN_JOURNAL)] },
    { id: PANEL, type: 0, name: "assistance", parent_id: null, permission_overwrites: [] },
  ];
  const messages = new Map<string, { id: string; channel_id?: string; author: { id: string }; components?: unknown; body?: unknown }[]>();
  const sent: Sent[] = [];
  const failures = new Map<string, number>();
  let next = 0;
  let botMember: { status: number; roles: string[] } = { status: 200, roles: [] };
  /** Discord copie les droits de la catégorie dans un salon créé sans droits : `false` imite un salon qui ne les aurait pas pris. */
  let syncsCategory = true;

  async function discord(method: string, path: string, call: DiscordCall = {}): Promise<DiscordReply | null> {
    sent.push({ method, path, body: call.body, reason: call.reason });
    const failed = failures.get(`${method} ${path.split("?")[0]}`);
    if (failed !== undefined) return failed === 0 ? null : { status: failed, body: { message: "refusé", code: 50013 } };
    const parts = path.split("?")[0]!.split("/").filter(Boolean);
    if (method === "GET" && path === `/guilds/${GUILD}/channels`) return { status: 200, body: structuredClone(channels) };
    if (method === "GET" && path === `/guilds/${GUILD}/roles`) return { status: 200, body: structuredClone(roles) };
    if (method === "GET" && path === `/guilds/${GUILD}/members/${BOT}`) return botMember.status === 200 ? { status: 200, body: { roles: botMember.roles, user: { id: BOT } } } : { status: botMember.status, body: { message: "Unknown Member", code: 10007 } };
    if (method === "POST" && path === `/guilds/${GUILD}/channels`) {
      const body = call.body as { name: string; parent_id: string };
      const parent = channels.find((c) => c.id === body.parent_id);
      const created: RawChannel = { id: snowflakeAt(NOW, ++next), type: 0, name: body.name, parent_id: body.parent_id, permission_overwrites: syncsCategory ? structuredClone(parent?.permission_overwrites ?? []) : [] };
      channels.push(created);
      return { status: 201, body: structuredClone(created) };
    }
    if (method === "PATCH" && parts[0] === "channels" && parts.length === 2) {
      const channel = channels.find((c) => c.id === parts[1]);
      if (!channel) return { status: 404, body: {} };
      Object.assign(channel, call.body as { name: string; topic: string });
      return { status: 200, body: structuredClone(channel) };
    }
    if (method === "PUT" && parts[0] === "channels" && parts[2] === "permissions") {
      const channel = channels.find((c) => c.id === parts[1]);
      if (!channel) return { status: 404, body: {} };
      const body = call.body as { type: number; allow: string; deny: string };
      channel.permission_overwrites = [...channel.permission_overwrites.filter((o) => o.id !== parts[3]), { id: parts[3]!, ...body }];
      return { status: 204, body: null };
    }
    if (method === "POST" && parts[0] === "channels" && parts[2] === "messages") {
      const id = snowflakeAt(NOW, ++next);
      const body = call.body as { components?: unknown };
      const list = messages.get(parts[1]!) ?? [];
      list.unshift({ id, channel_id: parts[1], author: { id: BOT }, components: body.components, body });
      messages.set(parts[1]!, list);
      return { status: 200, body: { id, channel_id: parts[1] } };
    }
    if (method === "GET" && parts[0] === "channels" && parts[2] === "messages") return { status: 200, body: structuredClone(messages.get(parts[1]!) ?? []) };
    if (method === "DELETE" && parts[0] === "channels" && parts[2] === "messages") {
      messages.set(parts[1]!, (messages.get(parts[1]!) ?? []).filter((m) => m.id !== parts[3]));
      return { status: 204, body: null };
    }
    if (method === "DELETE" && parts[0] === "channels" && parts.length === 2) {
      const at = channels.findIndex((c) => c.id === parts[1]);
      if (at < 0) return { status: 404, body: {} };
      channels.splice(at, 1);
      return { status: 200, body: {} };
    }
    return { status: 404, body: { message: `pas prévu : ${method} ${path}` } };
  }

  return {
    roles,
    channels,
    messages,
    sent,
    failures,
    discord,
    setBotMember: (value: { status: number; roles: string[] }) => void (botMember = value),
    setSync: (value: boolean) => void (syncsCategory = value),
  };
}

type Guild = ReturnType<typeof guild>;

/* ---------- La fonction, avec ce faux serveur ---------- */

const hex = (bytes: ArrayBuffer | Uint8Array): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
let keys: CryptoKeyPair;
let publicKey = "";

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
});

const GUICHET: CommandEntry = { image: "/commandes/guichet.png?v=abcdef123456", alt: "Besoin d'aide ? Trois boutons sous l'image.", page: "/rejoindre" };
const INDEX: CommandIndex = { clan: null, records: null, carte: null, guichet: GUICHET, guide: [], rivaux: [], roles: null, emojis: [], vignettes: [] };

function world(g: Guild = guild(), over: Partial<Deps> = {}) {
  const hooks: Sent[] = [];
  /** Les statuts que rendra le webhook, l'un après l'autre ; ensuite 200. */
  const hookStatuses: number[] = [];
  const tasks: Promise<unknown>[] = [];
  const slept: number[] = [];
  const deps: Deps = {
    publicKey,
    guildId: GUILD,
    serviceReady: true,
    nowSeconds: () => NOW,
    randomBytes: (n) => new Uint8Array(n),
    rpc: async () => null,
    createUser: async () => null,
    deleteUser: async () => undefined,
    magicLink: async () => null,
    fiches: async () => null,
    commandes: async () => INDEX,
    siteImage: async () => null,
    log: () => undefined,
    botId: BOT,
    discord: g.discord,
    webhook: async (method, path, call = {}) => {
      hooks.push({ method, path, body: call.body, reason: call.reason });
      return { status: hookStatuses.shift() ?? 200, body: { id: "1" } };
    },
    botAccepted: async () => true,
    background: (task) => void tasks.push(task),
    sleep: async (ms) => void slept.push(ms),
    ...over,
  };
  /** Attend les tâches de fond lancées par la dernière réponse. */
  const settle = async () => {
    while (tasks.length > 0) await tasks.shift();
  };
  return { deps, g, hooks, hookStatuses, slept, settle };
}

async function send(deps: Deps, interaction: Record<string, unknown>) {
  const body = JSON.stringify({ application_id: BOT, token: "jeton-de-l-interaction", guild_id: GUILD, ...interaction });
  const timestamp = String(NOW);
  const signature = hex(await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, new TextEncoder().encode(timestamp + body)));
  const res = await handle(new Request("https://p.supabase.co/functions/v1/code-discord/discord", { method: "POST", headers: { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp }, body }), deps);
  return (await res.json()) as { type: number; data?: Record<string, unknown> };
}

const member = (id: string, roles: string[] = [], permissions = MEMBER_BASE) => ({ user: { id, username: id === PLAYER ? "Brennos_42" : id === OFFICER ? "ambiorix" : "inconnu" }, roles, permissions: permissions.toString() });
const desk = { category: CATEGORY, journal: JOURNAL, staff: STAFF };

const ticketsCommand = (over: Record<string, unknown> = {}) => ({
  type: 2,
  channel_id: PANEL,
  app_permissions: (P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS | P.READ_MESSAGE_HISTORY).toString(),
  member: member(OFFICER, [STAFF], MEMBER_BASE | P.MANAGE_GUILD),
  data: {
    name: TICKETS_COMMAND_NAME,
    options: [
      { name: TICKETS_OPTIONS.category, type: 7, value: CATEGORY },
      { name: TICKETS_OPTIONS.journal, type: 7, value: JOURNAL },
      { name: TICKETS_OPTIONS.staff, type: 8, value: STAFF },
    ],
    resolved: { roles: { [STAFF]: { id: STAFF, name: "Staff", managed: false } } },
  },
  ...over,
});

/** Un clic sur un bouton d'un message du robot. */
const click = (customId: string, from: string, components: unknown, over: Record<string, unknown> = {}) => ({
  type: 3,
  channel_id: PANEL,
  member: member(from, from === OFFICER ? [STAFF] : []),
  message: { id: "399999999999999999", channel_id: typeof over["channel_id"] === "string" ? over["channel_id"] : PANEL, author: { id: BOT }, components },
  data: { custom_id: customId, component_type: 2 },
  ...over,
});

/** L'envoi d'un formulaire, ouvert depuis un bouton de ce message. */
const submit = (customId: string, from: string, values: Record<string, string>, components: unknown, over: Record<string, unknown> = {}) => ({
  type: 5,
  channel_id: PANEL,
  member: member(from, from === OFFICER ? [STAFF] : []),
  message: { id: "399999999999999999", channel_id: typeof over["channel_id"] === "string" ? over["channel_id"] : PANEL, author: { id: BOT }, components },
  data: { custom_id: customId, components: Object.entries(values).map(([id, value]) => ({ type: 1, components: [{ type: 4, custom_id: id, value }] })) },
  ...over,
});

const panelComponents = () => [{ type: 1, components: TICKET_KINDS.map((kind) => ({ type: 2, style: 1, label: KINDS[kind].button, custom_id: ticketCustomId({ action: "ouvrir", kind, ...desk }) })) }];

const hookContents = (hooks: Sent[]) => hooks.map((h) => (h.body as { content?: string }).content ?? "");

/** Ouvre un ticket de question pour le joueur, comme il le ferait : le bouton, puis le formulaire. */
async function openQuestion(w: ReturnType<typeof world>, question = "Comment rejoindre un salon vocal ?") {
  await send(w.deps, submit(ticketCustomId({ action: "form", kind: "question", ...desk }), PLAYER, { question }, panelComponents()));
  await w.settle();
  const channel = w.g.channels.find((c) => c.parent_id === CATEGORY);
  const welcome = channel ? w.g.messages.get(channel.id)?.at(-1) : undefined;
  return { channel, welcome };
}

/* ---------- Les tests ---------- */

describe("les identifiants des boutons", () => {
  const big = "18446744073709551615";
  const actions: TicketAction[] = [
    { action: "ouvrir", kind: "recrutement", category: big, journal: big, staff: big },
    { action: "form", kind: "signalement", category: big, journal: big, staff: big },
    { action: "prendre", staff: big, opener: big },
    { action: "fermer", staff: big, journal: big, logMessage: big, opener: big },
    { action: "clore", staff: big, journal: big, logMessage: null, opener: big },
  ];

  it("se relisent tels quels et tiennent dans les 100 signes de Discord, même avec des numéros de 20 chiffres", () => {
    for (const action of actions) {
      const id = ticketCustomId(action);
      expect(id.length, id).toBeLessThanOrEqual(100);
      expect(parseTicketId(id)).toEqual(action);
    }
  });

  it("refusent ce qui n'a pas leur forme", () => {
    for (const bad of ["", "ticket:", "ticket:ouvrir:triche:1:2:3", `ticket:ouvrir:question:${CATEGORY}:${JOURNAL}`, `ticket:prendre:${STAFF}:x`, `ticket:fermer:${STAFF}:${JOURNAL}:abc:${PLAYER}`, `concours:ouvrir:question:${CATEGORY}:${JOURNAL}:${STAFF}`, `ticket:ouvrir:question:${CATEGORY}:${JOURNAL}:${STAFF}:${"1".repeat(30)}`]) {
      expect(parseTicketId(bad), bad).toBeNull();
    }
  });
});

describe("les réponses des joueurs", () => {
  it("se redisent sans mise en forme, mention, lien ni émoji possibles, lignes gardées", () => {
    const quoted = quoteAnswer("**Salut** @everyone <@123456789012345678>\n> citation :smile: [lien](https://x.y)\n# titre", 500);
    expect(quoted).toBe("\\*\\*Salut\\*\\* \\@everyone \\<\\@123456789012345678\\>\n\\> citation \\:smile\\: \\[lien\\]\\(https\\:\\/\\/x.y\\)\n\\# titre");
    expect(quoteAnswer("a\u0000b\u0007c\r\nd", 50)).toBe("abc\nd");
  });

  it("disent quand elles sont coupées, et ne gardent pas plus de douze lignes", () => {
    expect(quoteAnswer("x".repeat(20), 10)).toBe(`${"x".repeat(10)}…`);
    expect(quoteAnswer(Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n"), 500).split("\n")).toHaveLength(12);
    expect(quoteAnswer("a\n\n\n\n\nb", 50)).toBe("a\n\nb");
  });

  it("n'écrivent en lien que les adresses d'OpenFront, sans carte d'aperçu", () => {
    expect(openfrontLink(" https://openfront.io/player/Abcd1234 ")).toBe("<https://openfront.io/player/Abcd1234>");
    expect(openfrontLink("https://openfront.io/#join=AbCd1234")).toBe("<https://openfront.io/#join=AbCd1234>");
    for (const other of ["https://openfront.io.ailleurs.example/x", "http://openfront.io/player/x", "javascript:alert(1)", "https://openfront.io/a b", "https://openfront.io/<@1>"]) {
      expect(openfrontLink(other), other).toBeNull();
    }
  });

  it("gardent l'ordre du formulaire, sautent une réponse vide et écrivent en texte un lien d'ailleurs", () => {
    const values = new Map([
      ["pseudo", "Brennos"],
      ["profil", "https://ailleurs.example/moi"],
      ["mot", "   "],
    ]);
    expect(answersOf("recrutement", values)).toEqual([
      { label: "Pseudo dans OpenFront", value: "Brennos" },
      { label: "Lien du profil OpenFront", value: "https\\:\\/\\/ailleurs.example\\/moi" },
    ]);
  });

  it("donnent un nom de salon en minuscules, sans accents ni espaces", () => {
    expect(ticketChannelName("recrutement", "Brennos_42")).toBe("recrutement-brennos_42");
    expect(ticketChannelName("signalement", "Éponà.du.Bois")).toBe("signalement-epona-du-bois");
    expect(ticketChannelName("question", "...")).toBe("question-joueur");
    expect(ticketChannelName("question", "a".repeat(80))).toHaveLength("question-".length + 32);
  });

  it("lisent l'heure d'un numéro de Discord", () => {
    expect(snowflakeSeconds(snowflakeAt(NOW, 7))).toBe(NOW);
    expect(snowflakeSeconds("pas un numéro")).toBe(0);
  });

  it("formulaires et boutons respectent les limites de Discord", () => {
    for (const kind of TICKET_KINDS) {
      const spec = KINDS[kind];
      expect(spec.button.length).toBeLessThanOrEqual(45);
      expect(spec.fields.length).toBeLessThanOrEqual(5);
      for (const field of spec.fields) {
        expect(field.label.length, field.label).toBeLessThanOrEqual(45);
        expect(field.placeholder.length).toBeLessThanOrEqual(100);
        expect(field.max).toBeLessThanOrEqual(4000);
      }
    }
  });
});

describe("les droits", () => {
  const roles: Role[] = [
    { id: GUILD, name: "@everyone", permissions: MEMBER_BASE, managed: false, mentionable: false },
    { id: STAFF, name: "Staff", permissions: MEMBER_BASE, managed: false, mentionable: false },
    { id: MEMBERS, name: "[GAL]", permissions: MEMBER_BASE, managed: false, mentionable: false },
    { id: "366666666666666666", name: "Admin", permissions: P.ADMINISTRATOR, managed: false, mentionable: false },
  ];
  const channel = (overwrites: GuildChannel["overwrites"]): GuildChannel => ({ id: CATEGORY, type: 4, name: "Tickets", parentId: null, overwrites });

  it("se calculent comme chez Discord : rôles, puis réglages pour tous, pour les rôles, puis pour le membre", () => {
    const c = channel([
      { id: GUILD, type: 0, allow: 0n, deny: P.VIEW_CHANNEL },
      { id: STAFF, type: 0, allow: P.VIEW_CHANNEL, deny: 0n },
      { id: PLAYER, type: 1, allow: P.VIEW_CHANNEL, deny: P.SEND_MESSAGES },
    ]);
    expect(channelPermissions(GUILD, roles, [], STRANGER, c.overwrites) & P.VIEW_CHANNEL).toBe(0n);
    expect(channelPermissions(GUILD, roles, [STAFF], OFFICER, c.overwrites) & P.VIEW_CHANNEL).toBe(P.VIEW_CHANNEL);
    const player = channelPermissions(GUILD, roles, [], PLAYER, c.overwrites);
    expect([player & P.VIEW_CHANNEL, player & P.SEND_MESSAGES]).toEqual([P.VIEW_CHANNEL, 0n]);
    expect(channelPermissions(GUILD, roles, ["366666666666666666"], STRANGER, c.overwrites)).toBe(~0n);
  });

  it("disent si un nouveau venu voit un salon, et quels rôles le voient, administrateurs à part", () => {
    const closed = channel([
      { id: GUILD, type: 0, allow: 0n, deny: P.VIEW_CHANNEL },
      { id: STAFF, type: 0, allow: P.VIEW_CHANNEL, deny: 0n },
    ]);
    expect(everyoneCanView(GUILD, roles, closed)).toBe(false);
    expect(rolesThatView(GUILD, roles, closed).map((r) => r.name)).toEqual(["Staff"]);
    const open = channel([]);
    expect(everyoneCanView(GUILD, roles, open)).toBe(true);
    expect(rolesThatView(GUILD, roles, open).map((r) => r.name)).toEqual(["Staff", "[GAL]"]);
  });
});

describe("la vérification de /tickets", () => {
  const roles: Role[] = [
    { id: GUILD, name: "@everyone", permissions: MEMBER_BASE, managed: false, mentionable: false },
    { id: STAFF, name: "Staff", permissions: MEMBER_BASE, managed: false, mentionable: false },
  ];
  const category = (overwrites: GuildChannel["overwrites"]): GuildChannel => ({ id: CATEGORY, type: 4, name: "Tickets", parentId: null, overwrites });
  const journal = (overwrites: GuildChannel["overwrites"]): GuildChannel => ({ id: JOURNAL, type: 0, name: "logs", parentId: null, overwrites });
  const closed = { id: GUILD, type: 0, allow: 0n, deny: P.VIEW_CHANNEL };
  const staffSees = { id: STAFF, type: 0, allow: P.VIEW_CHANNEL, deny: 0n };
  const base = {
    guildId: GUILD,
    botId: BOT,
    botRoles: [],
    roles,
    staff: STAFF,
    panelPermissions: P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS,
  };

  it("passe quand tout est en place, et nomme qui voit les tickets", () => {
    const report = setupReport({ ...base, category: category([closed, staffSees, { id: BOT, type: 1, allow: BOT_IN_CATEGORY, deny: 0n }]), journal: journal([closed, { id: BOT, type: 1, allow: BOT_IN_JOURNAL, deny: 0n }]) });
    // Le journal, lui, ne voit que le robot dans ce faux serveur : aucun rôle.
    expect(report).toEqual({ problems: [], notes: [], viewers: [roles[1]], journalViewers: [] });
  });

  it("nomme chaque droit qui manque au robot, et chaque salon visible par tout le serveur", () => {
    const report = setupReport({ ...base, panelPermissions: P.VIEW_CHANNEL, category: category([staffSees, { id: BOT, type: 1, allow: P.VIEW_CHANNEL | P.SEND_MESSAGES, deny: 0n }]), journal: journal([]) });
    expect(report.problems).toEqual([
      "Dans la catégorie « Tickets », il manque au robot : « Gérer les salons », « Gérer les permissions ».",
      "La catégorie « Tickets » est visible par tout le serveur : dans ses permissions, retirez « Voir les salons » à @everyone.",
      `Le journal <#${JOURNAL}> est visible par tout le serveur, et les réponses des joueurs y sont notées : choisissez un salon privé.`,
      "Dans ce salon, il manque au robot : « Envoyer des messages », « Intégrer des liens ».",
    ]);
  });

  it("refuse un rôle de l'encadrement qui ne voit pas la catégorie, et dit quand il ne sera pas prévenu", () => {
    const bot = { id: BOT, type: 1, allow: BOT_IN_CATEGORY & ~P.MENTION_EVERYONE, deny: 0n };
    const report = setupReport({ ...base, category: category([closed, bot]), journal: journal([closed, { id: BOT, type: 1, allow: BOT_IN_JOURNAL, deny: 0n }]) });
    expect(report.problems).toEqual([`Le rôle <@&${STAFF}> ne voit pas la catégorie « Tickets » : il serait prévenu sans pouvoir lire les tickets.`]);
    expect(report.notes).toEqual([
      `Le rôle <@&${STAFF}> sera nommé sans être prévenu : pour le prévenir, cochez « Mentionner @everyone, @here et tous les rôles » pour le robot dans la catégorie, ou rendez le rôle mentionnable.`,
    ]);
  });

  it("signale un robot encore administrateur du serveur, sans l'empêcher de poser le guichet", () => {
    const admin: Role = { id: "366666666666666666", name: "Admin", permissions: P.ADMINISTRATOR, managed: false, mentionable: false };
    const report = setupReport({
      ...base,
      roles: [...roles, admin],
      botRoles: [admin.id],
      category: category([closed, staffSees]),
      journal: journal([closed]),
    });
    expect(report.problems).toEqual([]);
    expect(report.notes).toEqual([expect.stringContaining("Le robot est administrateur du serveur")]);
  });

  it("refuse ce qui n'est pas une catégorie, un journal qui n'est pas un salon écrit, un rôle disparu", () => {
    const report = setupReport({ ...base, staff: "399999999999999990", category: { ...category([closed]), type: 0 }, journal: { ...journal([closed]), type: 2 } });
    expect(report.problems.slice(0, 3)).toEqual(["La catégorie choisie n'existe pas, ou n'est pas une catégorie.", "Le journal doit être un salon écrit.", "Le rôle de l'encadrement n'existe pas."]);
  });
});

describe("/tickets, tapée sur Discord", () => {
  it("pose le guichet : l'image du site et trois boutons qui portent la catégorie, le journal et le rôle", async () => {
    const w = world();
    // L'ancien guichet du robot dans ce salon, et un message d'un membre qui ne doit pas bouger.
    w.g.messages.set(PANEL, [
      { id: "391111111111111111", author: { id: BOT }, components: panelComponents() },
      { id: "392222222222222222", author: { id: PLAYER }, components: [] },
    ]);
    expect(await send(w.deps, ticketsCommand())).toEqual({ type: 5, data: { flags: 64 } });
    await w.settle();
    const posted = w.g.sent.find((s) => s.method === "POST" && s.path === `/channels/${PANEL}/messages`);
    const body = posted?.body as { flags: number; components: { type: number; items?: { media: { url: string } }[]; components?: { custom_id: string; label: string }[] }[]; allowed_mentions: unknown };
    expect(body.flags).toBe(32768);
    expect(body.components[0]?.items?.[0]?.media.url).toBe(`${SITE_URL}${GUICHET.image}`);
    expect(body.components[1]?.components?.map((b) => [b.label, parseTicketId(b.custom_id)])).toEqual(TICKET_KINDS.map((kind) => [KINDS[kind].button, { action: "ouvrir", kind, ...desk }]));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(w.g.messages.get(PANEL)?.map((m) => m.id)).not.toContain("391111111111111111");
    expect(w.g.messages.get(PANEL)?.map((m) => m.id)).toContain("392222222222222222");
    const reply = hookContents(w.hooks)[0] ?? "";
    expect(w.hooks[0]?.path).toBe(`/webhooks/${BOT}/jeton-de-l-interaction/messages/@original`);
    expect(reply).toContain("Le guichet est posé dans ce salon.");
    expect(reply).toContain(`Les voient : <@&${STAFF}>, et les administrateurs du serveur, plus le joueur de chaque ticket.`);
    expect(reply).toContain(`Le journal : <#${JOURNAL}>. Le voient : <@&${STAFF}>, et les administrateurs du serveur.`);
    expect(reply).toContain("L'ancien guichet du robot dans ce salon est retiré.");
    expect((w.hooks[0]?.body as { allowed_mentions: unknown }).allowed_mentions).toEqual({ parse: [] });
  });

  it("sans image du site, pose un titre et une phrase à la place", async () => {
    const w = world(guild(), { commandes: async () => null });
    await send(w.deps, ticketsCommand());
    await w.settle();
    const body = w.g.sent.find((s) => s.path === `/channels/${PANEL}/messages`)?.body as { components: { type: number; content?: string }[] };
    expect(body.components[0]).toEqual({ type: 10, content: expect.stringContaining("Besoin d'aide ?") });
  });

  it("ne pose rien et dit pourquoi, s'il manque un droit ou si la catégorie est visible par tous", async () => {
    const w = world();
    w.g.channels[0]!.permission_overwrites = [overwrite(STAFF, 0, P.VIEW_CHANNEL), overwrite(BOT, 1, P.VIEW_CHANNEL)];
    await send(w.deps, ticketsCommand());
    await w.settle();
    expect(w.g.sent.filter((s) => s.method !== "GET")).toEqual([]);
    const reply = hookContents(w.hooks)[0] ?? "";
    expect(reply.split("\n")[0]).toBe("Rien n'est posé :");
    expect(reply).toContain("Dans la catégorie « Tickets », il manque au robot : « Gérer les salons », « Gérer les permissions ».");
    expect(reply).toContain("est visible par tout le serveur");
    expect(reply).toContain("Corrigez, puis retapez /tickets.");
  });

  it("donne le lien qui ajoute le robot au serveur quand il n'en est pas membre", async () => {
    const w = world();
    w.g.setBotMember({ status: 404, roles: [] });
    await send(w.deps, ticketsCommand());
    await w.settle();
    expect(hookContents(w.hooks)[0]).toContain(`https://discord.com/oauth2/authorize?client_id=${BOT}&scope=bot%20applications.commands&permissions=0&guild_id=${GUILD}&disable_guild_select=true`);
  });

  it("n'est permise qu'à qui gère le serveur, dans le serveur du clan, avec le jeton du robot", async () => {
    const w = world();
    expect((await send(w.deps, ticketsCommand({ member: member(OFFICER, [STAFF]) }))).data?.["content"]).toBe(TICKET_MESSAGES.setupForbidden);
    expect((await send(w.deps, ticketsCommand({ guild_id: "999999999999999999" }))).data?.["content"]).toBe(TICKET_MESSAGES.wrongPlace);
    expect((await send({ ...w.deps, botId: "" }, ticketsCommand())).data?.["content"]).toBe(TICKET_MESSAGES.notReady);
    // Le jeton d'un autre robot, comme celui des images de bienvenue : refusé avant toute chose.
    expect((await send({ ...w.deps, botId: "312345678901234567" }, ticketsCommand())).data?.["content"]).toBe(TICKET_MESSAGES.wrongToken);
    const admin = member(STRANGER, [], P.ADMINISTRATOR);
    expect((await send(w.deps, ticketsCommand({ member: admin }))).type).toBe(5);
    await w.settle();
    // Le rôle d'une application, ou @everyone : refusés.
    const managed = ticketsCommand();
    (managed.data as { resolved: { roles: Record<string, { managed: boolean }> } }).resolved.roles[STAFF]!.managed = true;
    expect((await send(w.deps, managed)).data?.["content"]).toBe(TICKET_MESSAGES.setupRoleManaged);
    const everyone = ticketsCommand();
    (everyone.data as { options: { value: string }[] }).options[2]!.value = GUILD;
    expect((await send(w.deps, everyone)).data?.["content"]).toBe(TICKET_MESSAGES.setupBadOptions);
  });
});

describe("un ticket, du guichet à la fermeture", () => {
  it("le bouton du guichet ouvre le formulaire de sa demande", async () => {
    const w = world();
    for (const kind of TICKET_KINDS) {
      const res = await send(w.deps, click(ticketCustomId({ action: "ouvrir", kind, ...desk }), PLAYER, panelComponents()));
      expect(res.type).toBe(9);
      const data = res.data as { custom_id: string; title: string; components: { components: { custom_id: string; label: string; required: boolean }[] }[] };
      expect(parseTicketId(data.custom_id)).toEqual({ action: "form", kind, ...desk });
      expect(data.title).toBe(KINDS[kind].button);
      expect(data.components.map((row) => row.components[0]?.custom_id)).toEqual(KINDS[kind].fields.map((f) => f.id));
    }
  });

  it("ouvre un salon privé dans la catégorie, donne ses droits au joueur, écrit ses réponses et le note au journal", async () => {
    const w = world();
    const res = await send(
      w.deps,
      submit(ticketCustomId({ action: "form", kind: "recrutement", ...desk }), PLAYER, { pseudo: "Brennos", profil: "https://openfront.io/player/Abcd1234", mot: "Salut @everyone" }, panelComponents()),
    );
    expect(res).toEqual({ type: 5, data: { flags: 64 } });
    await w.settle();
    const channel = w.g.channels.find((c) => c.parent_id === CATEGORY);
    expect(channel?.name).toBe("recrutement-brennos_42");
    const create = w.g.sent.find((s) => s.method === "POST" && s.path === `/guilds/${GUILD}/channels`);
    // Créé sans réglage de droits, il prend ceux de la catégorie, privée ; et un nom neutre, sans sujet, tant que rien n'est vérifié.
    expect(create?.body).toEqual({ name: "ticket", type: 0, parent_id: CATEGORY });
    expect(create?.reason).toBe("Ticket « Rejoindre le clan » ouvert par Brennos_42");
    const named = w.g.sent.find((s) => s.method === "PATCH");
    expect(named?.body).toEqual({ name: "recrutement-brennos_42", topic: `Ticket de <@${PLAYER}> : Rejoindre le clan. Ouvert le <t:${NOW}:f>.` });
    // Le nom vient après les droits du joueur.
    expect(w.g.sent.findIndex((s) => s.method === "PATCH")).toBeGreaterThan(w.g.sent.findIndex((s) => s.method === "PUT"));
    expect(channel?.topic).toContain(`<@${PLAYER}>`);
    expect(channel?.permission_overwrites).toContainEqual({ id: PLAYER, type: 1, allow: OPENER_ALLOW.toString(), deny: "0" });
    expect(channel?.permission_overwrites).toContainEqual(overwrite(GUILD, 0, 0n, P.VIEW_CHANNEL));

    const log = w.g.messages.get(JOURNAL)?.[0];
    const logText = JSON.stringify(log?.body);
    expect(logText).toContain("**Ticket ouvert** : Rejoindre le clan");
    expect(logText).toContain(`Par <@${PLAYER}> (\`Brennos_42\`)`);
    expect(logText).toContain("(`recrutement-brennos_42`)");
    expect((log?.body as { allowed_mentions: unknown }).allowed_mentions).toEqual({ parse: [] });

    const welcome = w.g.messages.get(channel!.id)?.[0];
    const welcomeBody = welcome?.body as { flags: number; allowed_mentions: unknown };
    const welcomeText = JSON.stringify(welcome?.body);
    expect(welcomeBody.flags).toBe(32768);
    expect(welcomeBody.allowed_mentions).toEqual({ users: [PLAYER], roles: [STAFF] });
    expect(welcomeText).toContain(`<@${PLAYER}>, votre ticket est ouvert. L'encadrement (<@&${STAFF}>) vous répond ici.`);
    expect(welcomeText).toContain("<https://openfront.io/player/Abcd1234>");
    expect(welcomeText).toContain("Salut \\\\@everyone");
    expect(welcomeText).toContain(JOIN_URL);
    const ids = customIdsOf((welcome?.body as { components: unknown }).components).map(parseTicketId);
    expect(ids).toEqual([
      { action: "prendre", staff: STAFF, opener: PLAYER },
      { action: "fermer", staff: STAFF, journal: JOURNAL, logMessage: log?.id, opener: PLAYER },
    ]);
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.opened(channel!.id)]);
  });

  it("dit au joueur qu'il a déjà un ticket, avant le formulaire comme à l'envoi, y compris un ticket de DraftBot", async () => {
    const w = world();
    w.g.channels.push({ id: "319999999999999999", type: 0, name: "brennos", parent_id: CATEGORY, permission_overwrites: [overwrite(PLAYER, 1, P.VIEW_CHANNEL | P.SEND_MESSAGES)] });
    const res = await send(w.deps, click(ticketCustomId({ action: "ouvrir", kind: "question", ...desk }), PLAYER, panelComponents()));
    expect(res.data?.["content"]).toBe(TICKET_MESSAGES.already("319999999999999999"));
    await openQuestion(w);
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.already("319999999999999999")]);
    expect(w.g.sent.filter((s) => s.method === "POST")).toEqual([]);
  });

  it("ne prend pas pour l'auteur d'un ticket un membre ajouté par son nom à la catégorie", async () => {
    const w = world();
    // Un officier ajouté à la catégorie par son nom : Discord recopie ce réglage dans chaque ticket.
    w.g.channels[0]!.permission_overwrites.push(overwrite(OFFICER, 1, P.VIEW_CHANNEL | P.SEND_MESSAGES));
    const { channel } = await openQuestion(w);
    expect(channel?.permission_overwrites).toContainEqual(overwrite(OFFICER, 1, P.VIEW_CHANNEL | P.SEND_MESSAGES));
    // Il peut ouvrir son propre ticket : celui du joueur n'est pas le sien.
    const res = await send(w.deps, click(ticketCustomId({ action: "ouvrir", kind: "question", ...desk }), OFFICER, panelComponents()));
    expect(res.type).toBe(9);
  });

  it("si Discord ne connaît pas encore la réponse d'attente, la réponse repart une fois, une seconde après", async () => {
    const w = world();
    w.hookStatuses.push(404);
    const { channel } = await openQuestion(w);
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.opened(channel!.id), TICKET_MESSAGES.opened(channel!.id)]);
    expect(w.slept).toEqual([1000]);
  });

  it("si Discord tarde avant le formulaire, le montre quand même : l'envoi vérifiera", async () => {
    const w = world();
    w.g.failures.set(`GET /guilds/${GUILD}/channels`, 0);
    expect((await send(w.deps, click(ticketCustomId({ action: "ouvrir", kind: "question", ...desk }), PLAYER, panelComponents()))).type).toBe(9);
  });

  it("n'ouvre rien si la catégorie est devenue visible par tous, a disparu ou est pleine", async () => {
    const open = world();
    open.g.channels[0]!.permission_overwrites = [];
    await openQuestion(open);
    expect(hookContents(open.hooks)).toEqual([TICKET_MESSAGES.categoryPublic]);
    const gone = world();
    gone.g.channels.splice(0, 1);
    await openQuestion(gone);
    expect(hookContents(gone.hooks)).toEqual([TICKET_MESSAGES.categoryGone]);
    const full = world();
    for (let i = 0; i < CATEGORY_LIMIT; i++) full.g.channels.push({ id: snowflakeAt(NOW - 100, i), type: 0, name: `t-${i}`, parent_id: CATEGORY, permission_overwrites: [] });
    await openQuestion(full);
    expect(hookContents(full.hooks)).toEqual([TICKET_MESSAGES.full]);
    for (const w of [open, gone, full]) expect(w.g.sent.filter((s) => s.method === "POST")).toEqual([]);
  });

  it("retire aussitôt un salon qui n'aurait pas pris exactement les droits de la catégorie", async () => {
    const w = world();
    w.g.setSync(false);
    const { channel } = await openQuestion(w);
    expect(channel).toBeUndefined();
    expect(w.g.sent.filter((s) => s.method === "DELETE")).toHaveLength(1);
    expect(w.g.sent.some((s) => s.method === "PUT" || s.method === "PATCH")).toBe(false);
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.notPrivate]);
    expect(w.g.messages.get(JOURNAL) ?? []).toEqual([]);

    // Un rôle de plus que dans la catégorie suffit à le retirer.
    const other = world();
    other.g.channels[0]!.permission_overwrites.push(overwrite(MEMBERS, 0, 0n, P.SEND_MESSAGES));
    const realDiscord = other.g.discord;
    other.deps.discord = async (method, path, call) => {
      const reply = await realDiscord(method, path, call);
      if (method === "POST" && path === `/guilds/${GUILD}/channels`) {
        const body = reply?.body as RawChannel;
        body.permission_overwrites = body.permission_overwrites.map((o) => (o.id === MEMBERS ? { ...o, deny: "0", allow: P.VIEW_CHANNEL.toString() } : o));
      }
      return reply;
    };
    await openQuestion(other);
    expect(hookContents(other.hooks)).toEqual([TICKET_MESSAGES.notPrivate]);
  });

  it("si un salon raté ne peut pas être retiré, le journal le dit à l'encadrement", async () => {
    const w = world();
    w.g.setSync(false);
    w.g.failures.set(`DELETE /channels/${snowflakeAt(NOW, 1)}`, 403);
    await openQuestion(w);
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.notPrivateLeft]);
    const note = w.g.messages.get(JOURNAL)?.[0]?.body as { content: string; allowed_mentions: unknown };
    expect(note).toEqual({ content: TICKET_MESSAGES.leftover(snowflakeAt(NOW, 1)), allowed_mentions: { parse: [] } });
    // Le salon resté ne dit ni qui, ni pourquoi.
    expect(w.g.channels.find((c) => c.id === snowflakeAt(NOW, 1))).toMatchObject({ name: "ticket" });
    expect(w.g.channels.find((c) => c.id === snowflakeAt(NOW, 1))?.topic).toBeUndefined();
  });

  it("garde le nom neutre si Discord refuse de renommer le salon : le ticket marche quand même", async () => {
    const w = world();
    w.g.failures.set(`PATCH /channels/${snowflakeAt(NOW, 1)}`, 429);
    const { channel, welcome } = await openQuestion(w);
    expect(channel?.name).toBe("ticket");
    expect(welcome).toBeDefined();
    expect(JSON.stringify(w.g.messages.get(JOURNAL)?.[0]?.body)).toContain("(`ticket`)");
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.opened(channel!.id)]);
  });

  it("n'ouvre rien pour un joueur à qui l'encadrement a retiré la catégorie", async () => {
    const w = world();
    w.g.channels[0]!.permission_overwrites.push(overwrite(PLAYER, 1, 0n, P.VIEW_CHANNEL));
    const res = await send(w.deps, click(ticketCustomId({ action: "ouvrir", kind: "question", ...desk }), PLAYER, panelComponents()));
    expect(res.data?.["content"]).toBe(TICKET_MESSAGES.barred);
    await openQuestion(w);
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.barred]);
    expect(w.g.sent.filter((s) => s.method !== "GET")).toEqual([]);
  });

  it(`freine les ouvertures en boucle : ${3} tickets en 24 heures, lus dans le journal du robot`, async () => {
    const opened = (n: number, at: number, who = PLAYER, author = BOT) => ({
      id: snowflakeAt(at, n),
      author: { id: author },
      components: [{ type: 17, components: [{ type: 10, content: `**Ticket ouvert** : Une question, <#1> (\`question\`)\nPar <@${who}> (\`x\`), <t:${at}:f>` }] }],
    });
    const w = world();
    w.g.messages.set(JOURNAL, [opened(1, NOW - 600), opened(2, NOW - 3600), opened(3, NOW - 7200)]);
    // Dit dès le bouton, avant le formulaire, quand Discord répond assez vite.
    const res = await send(w.deps, click(ticketCustomId({ action: "ouvrir", kind: "question", ...desk }), PLAYER, panelComponents()));
    expect(res.data?.["content"]).toBe(TICKET_MESSAGES.tooMany);
    await openQuestion(w);
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.tooMany]);
    expect(w.g.sent.filter((s) => s.method !== "GET")).toEqual([]);
    // Un ticket de plus de 24 heures, celui d'un autre joueur ou une entrée d'un autre robot ne comptent pas.
    const ok = world();
    ok.g.messages.set(JOURNAL, [opened(1, NOW - 600), opened(2, NOW - 90_000), opened(3, NOW - 60, OFFICER), opened(4, NOW - 60, PLAYER, STRANGER)]);
    expect((await openQuestion(ok)).channel).toBeDefined();
  });

  it("retire le salon si le joueur ne peut pas y être ajouté, ou si l'accueil ne peut pas y être posté", async () => {
    const noGrant = world();
    noGrant.g.failures.set("PUT /channels/" + snowflakeAt(NOW, 1) + "/permissions/" + PLAYER, 403);
    expect((await openQuestion(noGrant)).channel).toBeUndefined();
    expect(hookContents(noGrant.hooks)).toEqual([TICKET_MESSAGES.cannotCreate]);

    const noWelcome = world();
    noWelcome.g.failures.set(`POST /channels/${snowflakeAt(NOW, 1)}/messages`, 403);
    expect((await openQuestion(noWelcome)).channel).toBeUndefined();
    // Le journal dit que ce ticket n'a pas vécu.
    const notes = noWelcome.g.messages.get(JOURNAL) ?? [];
    expect(JSON.stringify(notes[0]?.body)).toContain("Ticket annulé aussitôt");
    expect(hookContents(noWelcome.hooks)).toEqual([TICKET_MESSAGES.cannotCreate]);
  });

  it("s'ouvre même si le journal refuse : le bouton de fermeture n'a alors pas d'entrée à laquelle répondre", async () => {
    const w = world();
    w.g.failures.set(`POST /channels/${JOURNAL}/messages`, 403);
    const { channel, welcome } = await openQuestion(w);
    expect(channel).toBeDefined();
    expect(customIdsOf((welcome?.body as { components: unknown }).components).map(parseTicketId)[1]).toMatchObject({ action: "fermer", logMessage: null });
  });

  it("refuse une réponse obligatoire vide, sans rien ouvrir", async () => {
    const w = world();
    const res = await send(w.deps, submit(ticketCustomId({ action: "form", kind: "signalement", ...desk }), PLAYER, { joueur: "  ", faits: "Il triche" }, panelComponents()));
    expect(res.data?.["content"]).toBe(TICKET_MESSAGES.emptyAnswer(["Joueur signalé"]));
    expect(w.g.sent).toEqual([]);
  });

  it("refuse un bouton ou un formulaire qui ne vient pas d'un message du robot, ou dont le bouton n'est pas sur le message", async () => {
    const w = world();
    const id = ticketCustomId({ action: "ouvrir", kind: "question", ...desk });
    const other = { message: { id: "1", author: { id: STRANGER }, components: panelComponents() } };
    expect((await send(w.deps, click(id, PLAYER, panelComponents(), other))).data?.["content"]).toBe(TICKET_MESSAGES.stale);
    // Le même bouton, avec un autre salon caché dans son identifiant : il n'est pas sur le message.
    const forged = ticketCustomId({ action: "ouvrir", kind: "question", ...desk, category: "300000000000000000" });
    expect((await send(w.deps, click(forged, PLAYER, panelComponents()))).data?.["content"]).toBe(TICKET_MESSAGES.stale);
    const form = ticketCustomId({ action: "form", kind: "question", category: "300000000000000000", journal: JOURNAL, staff: STAFF });
    expect((await send(w.deps, submit(form, PLAYER, { question: "?" }, panelComponents()))).data?.["content"]).toBe(TICKET_MESSAGES.stale);
    expect((await send(w.deps, click("ticket:inconnu", PLAYER, []))).data?.["content"]).toBe(TICKET_MESSAGES.stale);
    // Un autre préfixe n'arrive pas aux tickets.
    expect((await send(w.deps, click("autre:chose", PLAYER, []))).data?.["content"]).toBe(MESSAGES.unknown);
    expect(w.g.sent).toEqual([]);
  });

  it("« Je m'en occupe » : seul l'encadrement prend le ticket ; le bouton laisse place à son nom, et le joueur est prévenu", async () => {
    const w = world();
    const { channel, welcome } = await openQuestion(w);
    const components = (welcome?.body as { components: unknown }).components;
    const take = ticketCustomId({ action: "prendre", staff: STAFF, opener: PLAYER });
    for (const who of [PLAYER, STRANGER]) {
      expect((await send(w.deps, click(take, who, components, { channel_id: channel!.id }))).data?.["content"]).toBe(TICKET_MESSAGES.staffOnly);
    }
    w.hooks.length = 0;
    const res = await send(w.deps, click(take, OFFICER, components, { channel_id: channel!.id }));
    await w.settle();
    expect(res.type).toBe(7);
    const updated = JSON.stringify(res.data);
    expect(updated).toContain(`**Pris en charge par <@${OFFICER}>**, <t:${NOW}:R>.`);
    expect(customIdsOf((res.data as { components: unknown }).components).map((id) => parseTicketId(id)?.action)).toEqual(["fermer"]);
    expect((res.data as { allowed_mentions: unknown }).allowed_mentions).toEqual({ parse: [] });
    expect(w.hooks).toEqual([{ method: "POST", path: `/webhooks/${BOT}/jeton-de-l-interaction`, body: { content: TICKET_MESSAGES.claimed(PLAYER, OFFICER), allowed_mentions: { users: [PLAYER] } }, reason: undefined }]);
    expect(w.slept).toEqual([1000]);
    // Refusée une fois : elle repart deux secondes plus tard, une seule fois.
    w.hooks.length = 0;
    w.slept.length = 0;
    w.hookStatuses.push(404);
    await send(w.deps, click(take, OFFICER, components, { channel_id: channel!.id }));
    await w.settle();
    expect(w.hooks).toHaveLength(2);
    expect(w.slept).toEqual([1000, 2000]);
    // Un administrateur sans le rôle peut aussi le prendre.
    const admin = await send(w.deps, click(take, STRANGER, components, { channel_id: channel!.id, member: member(STRANGER, [], P.ADMINISTRATOR) }));
    expect(admin.type).toBe(7);
    // Le bouton d'un autre salon que celui de l'interaction ne sert pas.
    const elsewhere = click(take, OFFICER, components, { channel_id: channel!.id });
    (elsewhere.message as { channel_id: string }).channel_id = PANEL;
    expect((await send(w.deps, elsewhere)).data?.["content"]).toBe(TICKET_MESSAGES.stale);
  });

  it("« Fermer le ticket » : le joueur ou l'encadrement confirment, la fermeture va au journal, puis le salon disparaît", async () => {
    const w = world();
    const { channel, welcome } = await openQuestion(w);
    const components = (welcome?.body as { components: unknown }).components;
    const log = w.g.messages.get(JOURNAL)?.[0];
    const close: TicketAction = { action: "fermer", staff: STAFF, journal: JOURNAL, logMessage: log!.id, opener: PLAYER };
    const at = { channel_id: channel!.id, channel: { id: channel!.id, name: channel!.name } };
    expect((await send(w.deps, click(ticketCustomId(close), STRANGER, components, at))).data?.["content"]).toBe(TICKET_MESSAGES.closeRefused);
    const modal = await send(w.deps, click(ticketCustomId(close), PLAYER, components, at));
    expect(modal.type).toBe(9);
    expect(parseTicketId((modal.data as { custom_id: string }).custom_id)).toEqual({ ...close, action: "clore" });

    w.hooks.length = 0;
    const res = await send(w.deps, submit(ticketCustomId({ ...close, action: "clore" }), OFFICER, { raison: "Réglé : **merci**" }, components, at));
    // Visible de tout le salon : chacun voit qu'il se ferme.
    expect(res).toEqual({ type: 5, data: {} });
    await w.settle();
    const reply = w.g.messages.get(JOURNAL)?.[0];
    const body = reply?.body as { message_reference: unknown; allowed_mentions: unknown };
    expect(body.message_reference).toEqual({ message_id: log!.id, channel_id: JOURNAL, fail_if_not_exists: false });
    expect(body.allowed_mentions).toEqual({ parse: [] });
    const text = JSON.stringify(reply?.body);
    expect(text).toContain(`**Ticket fermé** : \`question-brennos_42\`, par <@${OFFICER}>`);
    expect(text).toContain(`Ouvert <t:${NOW}:R> par <@${PLAYER}>.`);
    expect(text).toContain("Raison : Réglé \\\\:");
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.closing(OFFICER)]);
    expect(w.slept).toEqual([CLOSE_DELAY_MS]);
    expect(w.g.channels.find((c) => c.id === channel!.id)).toBeUndefined();
    expect(w.g.sent.at(-1)).toMatchObject({ method: "DELETE", path: `/channels/${channel!.id}`, reason: `Ticket fermé par ${OFFICER}` });
  });

  it("ne supprime rien si le journal refuse la fermeture, et dit si le salon n'a pas pu être supprimé", async () => {
    const w = world();
    const { channel, welcome } = await openQuestion(w);
    const components = (welcome?.body as { components: unknown }).components;
    const close: TicketAction = { action: "clore", staff: STAFF, journal: JOURNAL, logMessage: w.g.messages.get(JOURNAL)?.[0]?.id ?? null, opener: PLAYER };
    const at = { channel_id: channel!.id };
    w.hooks.length = 0;
    w.g.failures.set(`POST /channels/${JOURNAL}/messages`, 403);
    await send(w.deps, submit(ticketCustomId(close), PLAYER, { raison: "" }, components, at));
    await w.settle();
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.logFailed(JOURNAL)]);
    expect(w.g.channels.some((c) => c.id === channel!.id)).toBe(true);

    w.hooks.length = 0;
    w.g.failures.delete(`POST /channels/${JOURNAL}/messages`);
    w.g.failures.set(`DELETE /channels/${channel!.id}`, 403);
    await send(w.deps, submit(ticketCustomId(close), PLAYER, { raison: "" }, components, at));
    await w.settle();
    expect(hookContents(w.hooks)).toEqual([TICKET_MESSAGES.closing(PLAYER), TICKET_MESSAGES.deleteFailed]);
    expect(JSON.stringify(w.g.messages.get(JOURNAL)?.[0]?.body)).toContain("Sans raison donnée.");
  });

  it("ne répond que dans le serveur du clan, et sans jeton du robot ne fait rien", async () => {
    const w = world();
    const id = ticketCustomId({ action: "ouvrir", kind: "question", ...desk });
    expect((await send(w.deps, click(id, PLAYER, panelComponents(), { guild_id: "999999999999999999" }))).data?.["content"]).toBe(TICKET_MESSAGES.wrongPlace);
    expect((await send({ ...w.deps, botId: "" }, click(id, PLAYER, panelComponents(), { message: { id: "1", author: { id: BOT }, components: panelComponents() } }))).data?.["content"]).toBe(TICKET_MESSAGES.notReady);
    expect(w.g.sent).toEqual([]);
  });
});

describe("le message d'accueil pris en charge", () => {
  it("ne change rien d'autre que le bouton, et refuse un message qui n'a pas la forme attendue", () => {
    const row = { type: 1, components: [{ type: 2, custom_id: ticketCustomId({ action: "prendre", staff: STAFF, opener: PLAYER }) }] };
    const container = { type: 17, accent_color: 1, components: [{ type: 10, content: "a" }, row, { type: 14 }] };
    expect(claimedComponents([container], OFFICER, NOW)).toEqual([{ ...container, components: [{ type: 10, content: "a" }, { type: 10, content: `**Pris en charge par <@${OFFICER}>**, <t:${NOW}:R>.` }, { type: 14 }] }]);
    expect(claimedComponents([{ ...container, components: [{ type: 10, content: "a" }] }], OFFICER, NOW)).toBeNull();
    expect(claimedComponents([container, container], OFFICER, NOW)).toBeNull();
    expect(claimedComponents("rien", OFFICER, NOW)).toBeNull();
  });
});

describe("les émojis du robot et la vignette de la demande", () => {
  const desk = { category: CATEGORY, journal: JOURNAL, staff: STAFF };
  const ids = new Map([
    ["gal_porte", "800000000000000001"],
    ["gal_corbeau", "800000000000000002"],
    ["gal_poignard", "800000000000000003"],
    ["gal_tour", "800000000000000004"],
    ["gal_cle", "800000000000000005"],
  ]);
  const emojisOf = (message: Record<string, unknown>): unknown[] => {
    const found: unknown[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      const n = node as { type?: unknown; emoji?: unknown; components?: unknown } | null;
      if (!n || typeof n !== "object") return;
      if (n.type === 2) found.push(n.emoji);
      walk(n.components);
    };
    walk(message["components"]);
    return found;
  };

  it("le guichet porte la porte, le corbeau et le poignard s'ils sont déposés, et aucun émoji sinon", () => {
    expect(emojisOf(panelMessage(desk, GUICHET, ids))).toEqual([
      { id: "800000000000000001", name: "gal_porte" },
      { id: "800000000000000002", name: "gal_corbeau" },
      { id: "800000000000000003", name: "gal_poignard" },
    ]);
    expect(emojisOf(panelMessage(desk, GUICHET))).toEqual([undefined, undefined, undefined]);
    expect(TICKET_EMOJIS).toEqual(["gal_porte", "gal_corbeau", "gal_poignard", "gal_tour", "gal_cle"]);
  });

  it("le message d'accueil met la vignette de la demande à côté de son titre, et les émojis sur ses deux boutons", () => {
    const info = { kind: "question" as const, opener: PLAYER, staff: STAFF, journal: JOURNAL, logMessage: null, answers: [], openedAt: NOW };
    const url = `${SITE_URL}/commandes/vignettes/corbeau.png?v=abcdefabcdef`;
    const message = welcomeMessage(info, { thumbnail: url, emojis: ids });
    const container = (message["components"] as { components: { type: number; accessory?: unknown; components?: { content?: string }[] }[] }[])[0]!;
    const top = container.components[0]!;
    expect(top.type).toBe(9);
    expect(top.accessory).toEqual({ type: 11, media: { url }, description: "L'icône de la demande : Poser une question" });
    expect(top.components?.[0]?.content).toContain("### Une question");
    expect(emojisOf(message)).toEqual([
      { id: "800000000000000004", name: "gal_tour" },
      { id: "800000000000000005", name: "gal_cle" },
    ]);
    // Sans vignette ni émoji, le message d'avant : le titre en texte, les boutons sans émoji. Pris en charge, il change pareil.
    const plain = welcomeMessage(info);
    expect((plain["components"] as { components: { type: number }[] }[])[0]!.components[0]!.type).toBe(10);
    expect(emojisOf(plain)).toEqual([undefined, undefined]);
    expect(claimedComponents(message["components"], OFFICER, NOW)).not.toBeNull();
  });

  it("chaque demande a son émoji et son icône, les mêmes que sur l'image du guichet", () => {
    for (const kind of TICKET_KINDS) {
      expect(KINDS[kind].pixel).toBe(`gal_${KINDS[kind].icone}`);
    }
  });
});

describe("ce que les tickets partagent avec le site", () => {
  it("le même site que la fonction, et l'aide du recrutement suit la page Rejoindre : le clan est sur invitation", () => {
    expect(TICKETS_SITE_URL).toBe(SITE_URL);
    expect(clan.join.inviteOnly).toBe(true);
    expect(KINDS.recrutement.help).toContain("« Demander une invitation »");
    expect(KINDS.recrutement.help).toContain(`[${clan.tag}]`);
  });
});
