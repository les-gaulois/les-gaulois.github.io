import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { ficheIndex } from "../../src/lib/fiches-discord";
import { profileUrl } from "../../src/lib/paliers-franchis-discord";
import { CHOOSE_NAME_URL as SITE_CHOOSE_NAME_URL } from "../../src/lib/pseudo-openfront";
import type { StoredMembers } from "../../src/lib/schemas";
import {
  APP_PUBLIC_KEY,
  CHOOSE_NAME_URL,
  CODE_ALPHABET,
  COMMANDES_URL,
  COMMAND_MESSAGES,
  FICHES_FRESH_MS,
  FICHES_RETRY_MS,
  FICHES_STALE_MS,
  FICHES_URL,
  FICHE_MESSAGES,
  GAL_GUILD_ID,
  MAX_CHOICES,
  MESSAGES,
  SITE_URL,
  codeAccountEmail,
  ed25519Spki,
  ficheImageUrl,
  ficheUrl,
  formatCode,
  handle,
  liveDeps,
  newCode,
  normalizeCode,
  parseCommandes,
  parseFiches,
  sha256Hex,
  signatureWorks,
  verifyDiscordSignature,
  type CommandEntry,
  type CommandIndex,
  type Deps,
  type Fiche,
  type FicheList,
} from "../../supabase/functions/code-discord/index";

const NOW = 1_794_000_000;
const GUILD = "987654321098765432";
const PLAYER = "123456789012345678";
const EXPIRES = "2026-11-12T10:05:00.123456+00:00";
const EXPIRES_UNIX = Math.floor(Date.parse(EXPIRES) / 1000);
const BASE = "https://projet.supabase.co/functions/v1/code-discord";

const hex = (bytes: ArrayBuffer | Uint8Array): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
let keys: CryptoKeyPair;
let otherKeys: CryptoKeyPair;
let publicKey = "";

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  otherKeys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
});

const sign = async (timestamp: string, body: string, pair: CryptoKeyPair = keys): Promise<string> =>
  hex(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(timestamp + body)));

type Answers = Record<string, (args: Record<string, unknown>) => Record<string, unknown> | null>;

// Des fiches inventées, comme celles que le site publie : des pseudos, dont deux portent le nombre que le jeu ajoute.
const LISTED_AT = "2026-11-12T10:53:37.089Z";
const fiche = (id: string, pseudo: string, alt: string | null = `${pseudo}, membre de [GAL] : 3e sur 300 membres aux victoires sous le tag.`): Fiche => ({ id, pseudo, alt });
const FICHES: FicheList = {
  listedAt: LISTED_AT,
  fiches: [
    fiche("Ab12Cd34", "Brennos"),
    fiche("Ef56Gh78", "Brennos.4821"),
    fiche("Ij90Kl12", "Épona.1234", null),
    fiche("Mn34Op56", "Ambiorix.0042"),
    fiche("Qr78St90", "Ambiorix.7313"),
    fiche("Uv12Wx34", "Taranis_Sky"),
  ],
};

// L'index des commandes, comme le site le publie : des chemins du site, des descriptions, deux chapitres et trois clans.
const entry = (image: string, page: string, alt = `Description de ${image}`): CommandEntry => ({ image, alt, page });
const COMMANDES: CommandIndex = {
  clan: entry("/generated/accueil.png?v=aaaaaaaaaaaa", "/classement"),
  records: entry("/commandes/records.png?v=bbbbbbbbbbbb", "/records"),
  carte: entry("/commandes/carte.png?v=cccccccccccc", "/carte"),
  guide: [
    { id: "01-bases", court: "Les bases", ...entry("/commandes/guide-01-bases.png?v=dddddddddddd", "/debuter#chapitre-01-bases") },
    { id: "03-attaque", court: "L'attaque", ...entry("/commandes/guide-03-attaque.png?v=eeeeeeeeeeee", "/debuter#chapitre-03-attaque") },
    { id: "07-bateaux", court: "Bateaux", ...entry("/commandes/guide-07-bateaux.png?v=ffffffffffff", "/debuter#chapitre-07-bateaux") },
  ],
  rivaux: [
    { tag: "UN", rank: 1, ...entry("/commandes/rival-UN.png?v=111111111111", "/rivaux") },
    { tag: "LUX", rank: 3, ...entry("/commandes/rival-LUX.png?v=222222222222", "/rivaux") },
    { tag: "ULT", rank: 9, ...entry("/commandes/rival-ULT.png?v=333333333333", "/rivaux") },
  ],
};

function world(answers: Answers = {}, over: Partial<Deps> = {}) {
  const calls = {
    rpc: [] as { name: string; args: Record<string, unknown> }[],
    created: [] as { email: string; discordId: string }[],
    deleted: [] as string[],
    links: [] as string[],
    logs: [] as string[],
    fiches: 0,
    commandes: 0,
  };
  // Les comptes de Supabase, par adresse : le lien magique ouvre celui de l'adresse donnée.
  const accounts = new Map([
    ["joueur@example.com", "compte-existant"],
    ["premier@example.com", "compte-premier"],
  ]);
  let byte = 0;
  const deps: Deps = {
    publicKey,
    guildId: GUILD,
    serviceReady: true,
    nowSeconds: () => NOW,
    randomBytes: (n) => {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (byte++ * 37) % 248;
      return bytes;
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return answers[name]?.(args) ?? null;
    },
    createUser: async (email, discordId) => {
      calls.created.push({ email, discordId });
      accounts.set(email, "compte-neuf");
      return "compte-neuf";
    },
    deleteUser: async (id) => {
      calls.deleted.push(id);
    },
    magicLink: async (email) => {
      calls.links.push(email);
      return { tokenHash: "empreinte-du-lien", userId: accounts.get(email) ?? "compte-inconnu" };
    },
    fiches: async () => {
      calls.fiches++;
      return FICHES;
    },
    commandes: async () => {
      calls.commandes++;
      return COMMANDES;
    },
    log: (message) => calls.logs.push(message),
    ...over,
  };
  return { deps, calls };
}

async function fromDiscord(interaction: unknown, options: { timestamp?: number; pair?: CryptoKeyPair; signature?: string } = {}) {
  const body = JSON.stringify(interaction);
  const timestamp = String(options.timestamp ?? NOW);
  const signature = options.signature ?? (await sign(timestamp, body, options.pair));
  return new Request(`${BASE}/discord`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature-ed25519": signature, "x-signature-timestamp": timestamp },
    body,
  });
}

const command = (over: Record<string, unknown> = {}) => ({
  id: "111122223333444455",
  type: 2,
  guild_id: GUILD,
  data: { name: "code" },
  member: { user: { id: PLAYER, username: "asterion", global_name: "Astérion" } },
  ...over,
});

const fromSite = (body: unknown, method = "POST", path = "/session") =>
  new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });

const reply = async (res: Response) => (await res.json()) as Record<string, unknown>;
const content = async (res: Response) => {
  const body = (await res.json()) as { type: number; data: { content: string; flags: number; allowed_mentions: unknown } };
  return body;
};

describe("le code", () => {
  it("a huit signes, sans ceux qui se confondent", () => {
    const code = newCode(world().deps.randomBytes);
    expect(code).toHaveLength(8);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    expect(CODE_ALPHABET).toHaveLength(31);
    for (const c of ["0", "O", "1", "I", "L"]) expect(CODE_ALPHABET.includes(c)).toBe(false);
  });

  it("écarte les octets qui favoriseraient les premiers signes", () => {
    const bytes = new Uint8Array([248, 249, 250, 251, 252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(newCode(() => bytes)).toBe("ABCDEFGH");
  });

  it("se tape en minuscules, avec ou sans tiret ni espaces", () => {
    expect(normalizeCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeCode(" AB CD EF GH ")).toBe("ABCDEFGH");
    expect(normalizeCode("K7QF3M9P")).toBe("K7QF3M9P");
  });

  it("refuse ce qui ne peut pas être un code", () => {
    for (const typed of ["ABCD-EFG", "ABCDEFGHJ", "ABCDEFG0", "ABCDEFGI", "ABCDEFGL", "ABCDÉFGH", "", "--------"]) {
      expect(normalizeCode(typed), typed).toBeNull();
    }
  });

  it("s'écrit en deux groupes de quatre", () => {
    expect(formatCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("n'est gardé que par son empreinte SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("la signature de Discord", () => {
  it("se vérifie avec la clé publique de l'application", async () => {
    const body = '{"type":1}';
    expect(await verifyDiscordSignature(publicKey, await sign("1794000000", body), "1794000000", body)).toBe(true);
  });

  it("refuse un corps changé, une autre heure, une autre clé ou une signature mal formée", async () => {
    const body = '{"type":1}';
    const signature = await sign("1794000000", body);
    expect(await verifyDiscordSignature(publicKey, signature, "1794000000", '{"type":2}')).toBe(false);
    expect(await verifyDiscordSignature(publicKey, signature, "1794000001", body)).toBe(false);
    expect(await verifyDiscordSignature(publicKey, await sign("1794000000", body, otherKeys), "1794000000", body)).toBe(false);
    expect(await verifyDiscordSignature(publicKey, "zz", "1794000000", body)).toBe(false);
    expect(await verifyDiscordSignature(publicKey, signature.slice(2), "1794000000", body)).toBe(false);
    expect(await verifyDiscordSignature(publicKey, signature, "", body)).toBe(false);
    expect(await verifyDiscordSignature(publicKey.slice(2), signature, "1794000000", body)).toBe(false);
    expect(await verifyDiscordSignature("", signature, "1794000000", body)).toBe(false);
  });

  it("se vérifie aussi par l'enveloppe SPKI, le recours d'un moteur qui n'importe pas la clé brute", async () => {
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    expect(hex(ed25519Spki(raw))).toBe(hex(await crypto.subtle.exportKey("spki", keys.publicKey)));
    const key = await crypto.subtle.importKey("spki", ed25519Spki(raw), { name: "Ed25519" }, false, ["verify"]);
    const message = new TextEncoder().encode("1794000000{}");
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, message);
    expect(await crypto.subtle.verify({ name: "Ed25519" }, key, signature, message)).toBe(true);
  });

  it("l'essai du moteur passe sur l'exemple de la RFC 8032", async () => {
    expect(await signatureWorks()).toBe(true);
  });
});

describe("la commande /code, envoyée par Discord", () => {
  it("répond au « ping » de Discord, qui vérifie l'adresse", async () => {
    const { deps } = world();
    const res = await handle(await fromDiscord({ type: 1 }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 1 });
  });

  it("refuse une requête mal signée, sans rien demander au serveur", async () => {
    const { deps, calls } = world();
    expect((await handle(await fromDiscord(command(), { pair: otherKeys }), deps)).status).toBe(401);
    expect((await handle(await fromDiscord(command(), { signature: "" }), deps)).status).toBe(401);
    expect((await handle(await fromDiscord({ type: 1 }), { ...deps, publicKey: "" })).status).toBe(401);
    expect(calls.rpc).toEqual([]);
  });

  it("refuse une commande signée il y a plus de cinq minutes", async () => {
    const { deps, calls } = world();
    expect((await handle(await fromDiscord(command(), { timestamp: NOW - 301 }), deps)).status).toBe(401);
    expect((await handle(await fromDiscord(command(), { timestamp: NOW + 301 }), deps)).status).toBe(401);
    expect((await handle(await fromDiscord({ type: 1 }, { timestamp: NOW - 300 }), deps)).status).toBe(200);
    expect(calls.rpc).toEqual([]);
  });

  it("ne donne un code que sur le serveur du clan", async () => {
    const { deps, calls } = world();
    for (const interaction of [
      command({ guild_id: "111111111111111111" }),
      command({ guild_id: undefined, member: undefined, user: { id: PLAYER, username: "asterion" } }),
    ]) {
      const body = await content(await handle(await fromDiscord(interaction), deps));
      expect(body.data.content).toBe(MESSAGES.wrongPlace);
      expect(body.data.flags).toBe(64);
    }
    const unset = await content(await handle(await fromDiscord(command()), { ...deps, guildId: "" }));
    expect(unset.data.content).toBe(MESSAGES.wrongPlace);
    expect(calls.rpc).toEqual([]);
  });

  it("ne répond pas à une autre commande", async () => {
    const { deps, calls } = world();
    const body = await content(await handle(await fromDiscord(command({ data: { name: "autre" } })), deps));
    expect(body.data.content).toBe(MESSAGES.unknown);
    expect(calls.rpc).toEqual([]);
  });

  it("garde l'empreinte d'un nouveau code et le montre au seul joueur", async () => {
    const { deps, calls } = world({ discord_code_issue: () => ({ ok: true, expires_at: EXPIRES }) });
    const res = await handle(await fromDiscord(command()), deps);
    expect(res.status).toBe(200);
    const body = await content(res);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
    const shown = /`([A-Z0-9]{4}-[A-Z0-9]{4})`/.exec(body.data.content)?.[1] ?? "";
    expect(normalizeCode(shown)).not.toBeNull();
    expect(calls.rpc).toEqual([
      {
        name: "discord_code_issue",
        args: { p_code_hash: await sha256Hex(normalizeCode(shown) ?? ""), p_discord_id: PLAYER, p_discord_name: "asterion", p_interaction_id: "111122223333444455" },
      },
    ]);
    // L'adresse où le champ existe, la connexion par code ouverte à tous ou non.
    expect(body.data.content).toContain(`${SITE_URL}/compte#code `);
    expect(body.data.content).toContain(`<t:${EXPIRES_UNIX}:t>`);
    expect(body.data.content).toContain(`<t:${EXPIRES_UNIX}:R>`);
    expect(body.data.content).toContain("Ne le donnez à personne");
  });

  it("dit pourquoi un code n'a pas pu être créé", async () => {
    const tooMany = world({ discord_code_issue: () => ({ ok: false, error: "too_many_codes" }) });
    expect((await content(await handle(await fromDiscord(command()), tooMany.deps))).data.content).toBe(MESSAGES.tooMany);
    const replayed = world({ discord_code_issue: () => ({ ok: false, error: "code_replayed" }) });
    expect((await content(await handle(await fromDiscord(command()), replayed.deps))).data.content).toBe(MESSAGES.failed);
    const down = world();
    expect((await content(await handle(await fromDiscord(command()), down.deps))).data.content).toBe(MESSAGES.down);
  });

  it("n'en donne jamais à un robot", async () => {
    const { deps, calls } = world({ discord_code_issue: () => ({ ok: true, expires_at: EXPIRES }) });
    const body = await content(await handle(await fromDiscord(command({ member: { user: { id: PLAYER, username: "robot", bot: true } } })), deps));
    expect(body.data.content).toBe(MESSAGES.failed);
    expect(calls.rpc).toEqual([]);
  });
});

describe("la commande /fiche, envoyée par Discord", () => {
  type Choices = { type: number; data: { choices: { name: string; value: string }[] } };
  type Button = { type: number; style: number; label: string; url: string };
  type Shown = {
    type: number;
    data: { flags?: number; content?: string; allowed_mentions: unknown; components: { type: number; items?: unknown[]; components?: Button[] }[] };
  };
  const options = (value: string, focused = false) => [{ name: "pseudo", type: 3, value, ...(focused ? { focused: true } : {}) }];
  /** Le joueur tape : Discord demande des propositions (type 4). */
  const typing = (value: string, over: Record<string, unknown> = {}) => command({ type: 4, data: { name: "fiche", options: options(value, true) }, ...over });
  /** Le joueur envoie la commande (type 2). */
  const sending = (value: string, over: Record<string, unknown> = {}) => command({ data: { name: "fiche", options: options(value) }, ...over });
  const choices = async (res: Response) => ((await res.json()) as Choices).data.choices;
  const shown = async (res: Response) => (await res.json()) as Shown;

  it("propose pendant la saisie les pseudos qui commencent par ce qui est tapé, puis ceux qui le contiennent", async () => {
    const { deps } = world();
    const res = await handle(await fromDiscord(typing("BREN")), deps);
    const body = (await res.clone().json()) as Choices;
    expect(body.type).toBe(8);
    expect(body.data.choices).toEqual([
      { name: "Brennos", value: "Ab12Cd34" },
      { name: "Brennos.4821", value: "Ef56Gh78" },
    ]);
    expect((await choices(await handle(await fromDiscord(typing("a")), deps))).map((c) => c.name)).toEqual(["Ambiorix.0042", "Ambiorix.7313", "Épona.1234", "Taranis_Sky"]);
    // Sans accents ni majuscules.
    expect((await choices(await handle(await fromDiscord(typing("ep")), deps))).map((c) => c.value)).toEqual(["Ij90Kl12"]);
    // Rien de tapé : tout, dans l'ordre alphabétique.
    expect((await choices(await handle(await fromDiscord(typing("")), deps))).map((c) => c.name)).toEqual(["Ambiorix.0042", "Ambiorix.7313", "Brennos", "Brennos.4821", "Épona.1234", "Taranis_Sky"]);
    expect(await choices(await handle(await fromDiscord(typing("zzz")), deps))).toEqual([]);
  });

  it("ne propose jamais plus de 25 pseudos", async () => {
    const many: FicheList = { listedAt: LISTED_AT, fiches: Array.from({ length: 40 }, (_, i) => fiche(`Id${String(i).padStart(6, "0")}`, `Gaulois${String(i).padStart(2, "0")}`)) };
    const { deps } = world({}, { fiches: async () => many });
    const list = await choices(await handle(await fromDiscord(typing("gau")), deps));
    expect(list).toHaveLength(MAX_CHOICES);
    expect(list[0]).toEqual({ name: "Gaulois00", value: "Id000000" });
  });

  it("ne propose rien hors du serveur du clan, ni quand le site ne répond pas", async () => {
    const { deps, calls } = world();
    expect(await choices(await handle(await fromDiscord(typing("bren", { guild_id: "111111111111111111" })), deps))).toEqual([]);
    expect(calls.fiches).toBe(0);
    const down = world({}, { fiches: async () => null });
    expect(await choices(await handle(await fromDiscord(typing("bren")), down.deps))).toEqual([]);
  });

  it("montre la fiche choisie à tout le salon : son image en grand, et un bouton vers sa page", async () => {
    const { deps } = world();
    const body = await shown(await handle(await fromDiscord(sending("Ab12Cd34")), deps));
    expect(body.type).toBe(4);
    // Pas de drapeau 64, que seul le joueur verrait : 32768, l'image en grand, comme celle qu'enverrait un membre.
    expect(body.data.flags).toBe(32768);
    expect(body.data.content).toBeUndefined();
    expect(body.data.components).toEqual([
      { type: 12, items: [{ media: { url: ficheImageUrl("Ab12Cd34", LISTED_AT) }, description: FICHES.fiches[0]?.alt }] },
      { type: 1, components: [{ type: 2, style: 5, label: "Voir la fiche de Brennos", url: `${SITE_URL}/membres/Ab12Cd34/` }] },
    ]);
    // L'adresse de l'image change avec la liste des membres : Discord ne montre pas l'image de la veille.
    expect(ficheImageUrl("Ab12Cd34", LISTED_AT)).toBe(`${SITE_URL}/generated/fiches/Ab12Cd34.png?v=${Date.parse(LISTED_AT).toString(36)}`);
    expect(ficheImageUrl("Ab12Cd34", "2026-11-13T10:53:37.089Z")).not.toBe(ficheImageUrl("Ab12Cd34", LISTED_AT));
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
  });

  it("reconnaît un pseudo tapé en entier, sans accents ni majuscules, ou sans le nombre que le jeu y ajoute", async () => {
    const { deps } = world();
    const page = async (typed: string) => (await shown(await handle(await fromDiscord(sending(typed)), deps))).data.components.at(-1)?.components?.[0]?.url;
    // Le pseudo exact passe avant celui qui porte un nombre.
    expect(await page("brennos")).toBe(ficheUrl("Ab12Cd34"));
    expect(await page(" Brennos.4821 ")).toBe(ficheUrl("Ef56Gh78"));
    expect(await page("EPONA")).toBe(ficheUrl("Ij90Kl12"));
    expect(await page("taranis_sky")).toBe(ficheUrl("Uv12Wx34"));
  });

  it("sans image, montre la fiche en une ligne de texte, avec le bouton", async () => {
    const { deps } = world();
    const body = await shown(await handle(await fromDiscord(sending("Ij90Kl12")), deps));
    expect(body.data.flags).toBeUndefined();
    expect(body.data.content).toBe("La fiche de Épona.1234 :");
    expect(body.data.components).toEqual([{ type: 1, components: [{ type: 2, style: 5, label: "Voir la fiche de Épona.1234", url: ficheUrl("Ij90Kl12") }] }]);
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
  });

  it("demande de choisir quand deux pseudos conviennent", async () => {
    const { deps } = world();
    const body = await content(await handle(await fromDiscord(sending("ambiorix")), deps));
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toBe(FICHE_MESSAGES.many("ambiorix"));
  });

  it("dit qu'aucune fiche n'a ce nom, et où un membre sans pseudo choisit le sien, sans rien mettre en forme de ce qui est tapé", async () => {
    const { deps } = world();
    const body = await content(await handle(await fromDiscord(sending("**Inconnu** @everyone https://x.y")), deps));
    expect(body.data.flags).toBe(64);
    // Entre chevrons : Discord n'en fait pas des cartes d'aperçu.
    expect(body.data.content).toContain(`<${CHOOSE_NAME_URL}>`);
    expect(body.data.content).toContain(`<${SITE_URL}/liste/>`);
    expect(body.data.content).toContain("« \\*\\*Inconnu\\*\\* \\@everyone https\\:\\/\\/x.y »");
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
  });

  it("dit quand les fiches ne répondent pas, et ne répond que dans le serveur du clan", async () => {
    const down = world({}, { fiches: async () => null });
    expect((await content(await handle(await fromDiscord(sending("Brennos")), down.deps))).data.content).toBe(FICHE_MESSAGES.down);
    const { deps, calls } = world();
    for (const interaction of [sending("Brennos", { guild_id: "111111111111111111" }), sending("Brennos", { guild_id: undefined, member: undefined, user: { id: PLAYER, username: "asterion" } })]) {
      const body = await content(await handle(await fromDiscord(interaction), deps));
      expect(body.data.content).toBe(FICHE_MESSAGES.wrongPlace);
      expect(body.data.flags).toBe(64);
    }
    expect(calls.fiches).toBe(0);
  });

  it("refuse une saisie ou une commande mal signée, ou trop ancienne, sans rien lire", async () => {
    const { deps, calls } = world();
    expect((await handle(await fromDiscord(typing("bren"), { pair: otherKeys }), deps)).status).toBe(401);
    expect((await handle(await fromDiscord(sending("Brennos"), { timestamp: NOW - 301 }), deps)).status).toBe(401);
    expect(calls.fiches).toBe(0);
  });

  it("ne demande rien à la base et n'écrit rien", async () => {
    const { deps, calls } = world();
    await handle(await fromDiscord(typing("bren")), deps);
    await handle(await fromDiscord(sending("Brennos")), deps);
    expect(calls.rpc).toEqual([]);
    expect(calls.created).toEqual([]);
    expect(calls.links).toEqual([]);
  });
});

describe("les commandes du robot, envoyées par Discord", () => {
  type Button = { type: number; style: number; label: string; url: string };
  type Shown = {
    type: number;
    data: { flags?: number; content?: string; allowed_mentions: unknown; components: { type: number; items?: { media: { url: string }; description: string }[]; components?: Button[] }[] };
  };
  const run = (name: string, options: unknown[] = [], over: Record<string, unknown> = {}) => command({ data: { name, options }, ...over });
  const typingFor = (name: string, option: string, value: string) => command({ type: 4, data: { name, options: [{ name: option, type: 3, value, focused: true }] } });
  const opt = (name: string, value: string) => [{ name, type: 3, value }];
  const shown = async (res: Response) => (await res.json()) as Shown;
  const choices = async (res: Response) => ((await res.json()) as { type: number; data: { choices: { name: string; value: string }[] } }).data.choices;

  it("montrent à tout le salon l'image du site en grand, avec un bouton vers sa page", async () => {
    const { deps } = world();
    for (const [name, shownEntry, label] of [
      ["clan", COMMANDES.clan, "Voir le classement"],
      ["records", COMMANDES.records, "Voir les records"],
      ["carte", COMMANDES.carte, "Voir la carte"],
    ] as const) {
      const body = await shown(await handle(await fromDiscord(run(name)), deps));
      expect(body.type).toBe(4);
      // Pas de drapeau 64 : tout le salon la voit. 32768 : l'image en grand.
      expect(body.data.flags).toBe(32768);
      expect(body.data.components).toEqual([
        { type: 12, items: [{ media: { url: `${SITE_URL}${shownEntry?.image}` }, description: shownEntry?.alt }] },
        { type: 1, components: [{ type: 2, style: 5, label, url: `${SITE_URL}${shownEntry?.page}` }] },
      ]);
      expect(body.data.allowed_mentions).toEqual({ parse: [] });
    }
  });

  it("disent quand le site n'a pas encore l'image, ou ne répond pas", async () => {
    const empty = world({}, { commandes: async () => ({ ...COMMANDES, records: null }) });
    const missing = await content(await handle(await fromDiscord(run("records")), empty.deps));
    expect(missing.data.content).toBe(COMMAND_MESSAGES.missing);
    expect(missing.data.flags).toBe(64);
    const down = world({}, { commandes: async () => null });
    expect((await content(await handle(await fromDiscord(run("clan")), down.deps))).data.content).toBe(COMMAND_MESSAGES.down);
    expect(await choices(await handle(await fromDiscord(typingFor("guide", "chapitre", "a")), down.deps))).toEqual([]);
  });

  it("/guide propose les chapitres pendant la saisie, et montre celui qui est choisi", async () => {
    const { deps } = world();
    expect(await choices(await handle(await fromDiscord(typingFor("guide", "chapitre", "")), deps))).toEqual([
      { name: "Les bases", value: "01-bases" },
      { name: "L'attaque", value: "03-attaque" },
      { name: "Bateaux", value: "07-bateaux" },
    ]);
    expect((await choices(await handle(await fromDiscord(typingFor("guide", "chapitre", "ATTA")), deps))).map((c) => c.value)).toEqual(["03-attaque"]);
    const body = await shown(await handle(await fromDiscord(run("guide", opt("chapitre", "03-attaque"))), deps));
    expect(body.data.components[0]?.items?.[0]?.media.url).toBe(`${SITE_URL}/commandes/guide-03-attaque.png?v=eeeeeeeeeeee`);
    expect(body.data.components[1]?.components?.[0]).toMatchObject({ label: "Lire « L'attaque »", url: `${SITE_URL}/debuter#chapitre-03-attaque` });
    // Un nom tapé en entier, ou un morceau qui ne désigne qu'un chapitre, marche aussi.
    expect((await shown(await handle(await fromDiscord(run("guide", opt("chapitre", "bateaux"))), deps))).data.components[1]?.components?.[0]?.url).toBe(`${SITE_URL}/debuter#chapitre-07-bateaux`);
    const none = await content(await handle(await fromDiscord(run("guide", opt("chapitre", "**rien**"))), deps));
    expect(none.data.flags).toBe(64);
    expect(none.data.content).toBe(COMMAND_MESSAGES.guideNone("**rien**"));
    expect(none.data.content).toContain("« \\*\\*rien\\*\\* »");
  });

  it("/rival propose les clans par tag puis par rang, et montre celui qui est choisi", async () => {
    const { deps } = world();
    expect((await choices(await handle(await fromDiscord(typingFor("rival", "clan", "u")), deps))).map((c) => c.value)).toEqual(["UN", "ULT", "LUX"]);
    expect((await choices(await handle(await fromDiscord(typingFor("rival", "clan", "")), deps)))[0]).toEqual({ name: "[UN], 1er au classement", value: "UN" });
    const body = await shown(await handle(await fromDiscord(run("rival", opt("clan", "[lux]"))), deps));
    expect(body.data.components[0]?.items?.[0]?.media.url).toBe(`${SITE_URL}/commandes/rival-LUX.png?v=222222222222`);
    expect(body.data.components[1]?.components?.[0]).toMatchObject({ label: "Comparer sur le site", url: `${SITE_URL}/rivaux` });
    expect((await content(await handle(await fromDiscord(run("rival", opt("clan", "GAL"))), deps))).data.content).toBe(COMMAND_MESSAGES.rivalNone("GAL"));
  });

  it("/moi montre la fiche du membre validé lié au Discord qui tape la commande", async () => {
    const { deps, calls } = world({ discord_moi: () => ({ ok: true, pseudo: "Brennos" }) });
    const body = await shown(await handle(await fromDiscord(run("moi")), deps));
    expect(calls.rpc).toEqual([{ name: "discord_moi", args: { p_discord_id: PLAYER } }]);
    expect(body.data.flags).toBe(32768);
    expect(body.data.components[1]?.components?.[0]?.url).toBe(ficheUrl("Ab12Cd34"));
  });

  it("/moi dit à qui n'est pas reconnu comment se faire reconnaître, et à qui n'a pas de pseudo comment en choisir un", async () => {
    for (const [answer, message] of [
      [{ ok: false, error: "not_member" }, COMMAND_MESSAGES.notMember],
      [{ ok: false, error: "no_pseudo" }, COMMAND_MESSAGES.noPseudo],
      [{ ok: false, error: "shared_pseudo" }, COMMAND_MESSAGES.sharedPseudo],
      [{ ok: true, pseudo: "Parti.0001" }, COMMAND_MESSAGES.noFiche],
    ] as const) {
      const { deps } = world({ discord_moi: () => answer });
      const body = await content(await handle(await fromDiscord(run("moi")), deps));
      expect(body.data.content).toBe(message);
      expect(body.data.flags).toBe(64);
    }
    expect(COMMAND_MESSAGES.noPseudo).toContain(`<${CHOOSE_NAME_URL}>`);
    // Le serveur ne répond pas : la fonction SQL rend null.
    expect((await content(await handle(await fromDiscord(run("moi")), world().deps))).data.content).toBe(COMMAND_MESSAGES.down);
  });

  it("/moi ne montre jamais une fiche dont le pseudo est aussi celui d'un autre membre", async () => {
    const twins: FicheList = { listedAt: LISTED_AT, fiches: [...FICHES.fiches, fiche("Zz99Yy88", "BRENNOS")] };
    const { deps } = world({ discord_moi: () => ({ ok: true, pseudo: "Brennos" }) }, { fiches: async () => twins });
    const body = await content(await handle(await fromDiscord(run("moi")), deps));
    expect(body.data.content).toBe(COMMAND_MESSAGES.sharedPseudo);
    expect(body.data.flags).toBe(64);
  });

  it("/moi ne prend l'identifiant que de la commande signée, ni hors du serveur du clan ni pour un robot", async () => {
    const { deps, calls } = world({ discord_moi: () => ({ ok: true, pseudo: "Brennos" }) });
    for (const interaction of [
      run("moi", [], { guild_id: "111111111111111111" }),
      run("moi", [], { member: { user: { id: PLAYER, username: "robot", bot: true } } }),
      run("moi", opt("pseudo", "Brennos"), { member: { user: { id: "pas-un-numero", username: "x" } } }),
    ]) {
      expect((await content(await handle(await fromDiscord(interaction), deps))).data.content).toBe(COMMAND_MESSAGES.wrongPlace);
    }
    expect(calls.rpc).toEqual([]);
  });

  it("ne répondent que dans le serveur du clan, et refusent une commande mal signée, sans rien lire", async () => {
    const { deps, calls } = world();
    for (const name of ["clan", "records", "carte", "guide", "rival"]) {
      expect((await content(await handle(await fromDiscord(run(name, [], { guild_id: "111111111111111111" })), deps))).data.content).toBe(COMMAND_MESSAGES.wrongPlace);
      expect((await handle(await fromDiscord(run(name), { pair: otherKeys }), deps)).status).toBe(401);
    }
    expect(calls.commandes).toBe(0);
    expect(calls.rpc).toEqual([]);
  });
});

describe("l'index des commandes publié par le site", () => {
  it("écarte une entrée qui mènerait hors du site, et refuse un fichier qui n'a pas la forme attendue", () => {
    const ok = { image: "/commandes/records.png?v=abc123", alt: "a", page: "/records" };
    expect(
      parseCommandes({
        clan: { ...ok, image: "https://ailleurs.example/x.png" },
        records: { ...ok, image: "//ailleurs.example/x.png" },
        carte: { ...ok, image: "/commandes/../secret.png" },
        guide: [
          { ...ok, id: "01-bases", court: "Les bases", page: "javascript:alert(1)" },
          { ...ok, id: "../x", court: "Faux" },
          { ...ok, id: "03-attaque", court: "L'attaque" },
        ],
        rivaux: [
          { ...ok, tag: "un", rank: 1 },
          { ...ok, tag: "UN", rank: 0 },
          { ...ok, tag: "LUX", rank: 3 },
        ],
      }),
    ).toEqual({
      clan: null,
      records: null,
      carte: null,
      guide: [{ ...ok, id: "03-attaque", court: "L'attaque" }],
      rivaux: [{ ...ok, tag: "LUX", rank: 3 }],
    });
    for (const bad of [null, [], { guide: [] }, { rivaux: [] }]) expect(parseCommandes(bad)).toBeNull();
  });

  it("se lit comme les fiches : gardé cinq minutes, avec son propre journal", async () => {
    const logs: string[] = [];
    const quiet = vi.spyOn(console, "log").mockImplementation((message: string) => void logs.push(message));
    try {
      const sent: string[] = [];
      const fetcher = (async (input: string | URL | Request) => {
        sent.push(String(input));
        return String(input) === COMMANDES_URL ? new Response(JSON.stringify(COMMANDES)) : new Response("{}", { status: 500 });
      }) as typeof fetch;
      const deps = liveDeps({ get: () => undefined }, fetcher);
      expect(await deps.commandes()).toEqual(COMMANDES);
      expect(await deps.commandes()).toEqual(COMMANDES);
      expect(await deps.fiches()).toBeNull();
      expect(sent).toEqual([COMMANDES_URL, FICHES_URL]);
    } finally {
      quiet.mockRestore();
    }
    expect(logs).toEqual(["code-discord : fiches : 500"]);
  });
});

describe("les fiches publiées par le site", () => {
  const members: StoredMembers = {
    fetchedAt: LISTED_AT,
    total: 4,
    members: [
      { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: "Ab12Cd34", username: "Taranis", team: { wins: 120, losses: 80 } },
      { role: "officer", joinedAt: "2026-06-01T10:00:00.000Z", publicId: "Ef56Gh78", username: "Épona.1234", team: { wins: 3, losses: 1 } },
      { role: "member", joinedAt: "2026-07-01T10:00:00.000Z", publicId: null, username: null, team: { wins: 10, losses: 2 } },
      { role: "member", joinedAt: "2026-08-01T10:00:00.000Z", publicId: "Ij90Kl12", username: "Brennos", team: null },
    ],
  };

  it("se relisent telles que le site les écrit : une par membre avec pseudo, jamais un anonyme", () => {
    const index = ficheIndex(members, "GAL", (id) => id !== "Ef56Gh78");
    expect(index.listedAt).toBe(LISTED_AT);
    expect(index.fiches.map((f) => [f.id, f.pseudo])).toEqual([
      ["Ij90Kl12", "Brennos"],
      ["Ef56Gh78", "Épona.1234"],
      ["Ab12Cd34", "Taranis"],
    ]);
    // Une description seulement avec une image : celle du site, ou rien.
    expect(index.fiches.find((f) => f.id === "Ab12Cd34")?.alt).toMatch(/^Taranis, membre de \[GAL\] : /);
    expect(index.fiches.find((f) => f.id === "Ef56Gh78")?.alt).toBeNull();
    expect(index.fiches.find((f) => f.id === "Ij90Kl12")?.alt).toBeNull();
    expect(parseFiches(JSON.parse(JSON.stringify(index)))).toEqual(index);
  });

  it("écartent une fiche mal formée, et un fichier qui n'a pas la forme attendue ne vaut rien", () => {
    for (const bad of [null, [], { listedAt: null, fiches: [] }, { listedAt: "hier", fiches: [] }, { listedAt: LISTED_AT }]) expect(parseFiches(bad)).toBeNull();
    expect(
      parseFiches({
        listedAt: LISTED_AT,
        fiches: [{ id: "Ab12Cd34", pseudo: "Brennos", alt: "a" }, { id: "../x", pseudo: "Faux", alt: null }, { id: "Ef56Gh78", pseudo: "  ", alt: null }, { id: "Ij90Kl12", pseudo: "Sans image", alt: 4 }, "rien"],
      }),
    ).toEqual({
      listedAt: LISTED_AT,
      fiches: [
        { id: "Ab12Cd34", pseudo: "Brennos", alt: "a" },
        { id: "Ij90Kl12", pseudo: "Sans image", alt: null },
      ],
    });
  });

  it("mènent aux mêmes adresses que le site et les autres messages du robot", () => {
    expect(CHOOSE_NAME_URL).toBe(SITE_CHOOSE_NAME_URL);
    expect(ficheUrl("Ab12Cd34")).toBe(profileUrl(SITE_URL, "Ab12Cd34"));
    expect(FICHES_URL).toBe(`${SITE_URL}/fiches.json`);
    expect(existsSync("src/pages/fiches.json.ts")).toBe(true);
  });
});

describe("le code tapé sur le site", () => {
  const redeemed = (over: Record<string, unknown> = {}) => () => ({
    ok: true,
    discord_id: PLAYER,
    discord_name: "asterion",
    user_id: "compte-existant",
    email: "joueur@example.com",
    ...over,
  });
  const newPlayer = redeemed({ user_id: null, email: null });

  it("répond à la question préalable du navigateur, et à lui seul en POST", async () => {
    const { deps } = world();
    const pre = await handle(new Request(`${BASE}/session`, { method: "OPTIONS" }), deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
    expect(pre.headers.get("access-control-allow-headers")).toContain("content-type");
    expect((await handle(fromSite(null, "GET"), deps)).status).toBe(405);
    expect((await handle(fromSite({ code: "ABCDEFGH" }, "POST", "/ailleurs"), deps)).status).toBe(404);
  });

  it("dit si tout est en place, sans rien montrer : la base répond-elle avec la clé de service, les fiches se lisent-elles ?", async () => {
    const ready = world({ discord_code_redeem: () => ({ ok: false, error: "invalid_request" }), discord_moi: () => ({ ok: false, error: "invalid_request" }) });
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), ready.deps))).toEqual({ ok: true, discord: true, service: true, signature: true, fiches: true, commandes: true, moi: true });
    // Une empreinte et un identifiant mal formés : les fonctions SQL les refusent sans rien lire ni écrire.
    expect(ready.calls.rpc).toEqual([
      { name: "discord_code_redeem", args: { p_code_hash: "etat" } },
      { name: "discord_moi", args: { p_discord_id: "etat" } },
    ]);
    const noBase = world();
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), noBase.deps))).toMatchObject({ service: false, moi: false });
    const unset = world({ discord_code_redeem: () => ({ ok: false, error: "invalid_request" }) });
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), { ...unset.deps, guildId: "", serviceReady: false }))).toEqual({ ok: true, discord: false, service: false, signature: true, fiches: true, commandes: true, moi: false });
    expect(unset.calls.rpc).toEqual([]);
    const noSite = world({}, { fiches: async () => null, commandes: async () => null });
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), noSite.deps))).toMatchObject({ fiches: false, commandes: false });
  });

  it("refuse ce qui ne peut pas être un code, sans rien demander au serveur", async () => {
    const { deps, calls } = world();
    for (const body of [{ code: "ABC" }, { code: "A".repeat(40) }, { code: 12345678 }, {}, "pas du JSON"]) {
      const res = await handle(fromSite(body), deps);
      expect(res.status).toBe(400);
      expect(await reply(res)).toEqual({ ok: false, error: "code_format" });
    }
    expect(calls.rpc).toEqual([]);
  });

  it("n'envoie au serveur que l'empreinte du code remis en forme", async () => {
    const { deps, calls } = world({ discord_code_redeem: redeemed() });
    await handle(fromSite({ code: "abcd efgh" }), deps);
    expect(calls.rpc[0]).toEqual({ name: "discord_code_redeem", args: { p_code_hash: await sha256Hex("ABCDEFGH") } });
  });

  it("dit pourquoi un code est refusé", async () => {
    const invalid = world({ discord_code_redeem: () => ({ ok: false, error: "code_invalid" }) });
    let res = await handle(fromSite({ code: "ABCDEFGH" }), invalid.deps);
    expect([res.status, await reply(res)]).toEqual([400, { ok: false, error: "code_invalid" }]);
    const busy = world({ discord_code_redeem: () => ({ ok: false, error: "code_busy" }) });
    res = await handle(fromSite({ code: "ABCDEFGH" }), busy.deps);
    expect([res.status, await reply(res)]).toEqual([429, { ok: false, error: "code_busy" }]);
    const down = world();
    res = await handle(fromSite({ code: "ABCDEFGH" }), down.deps);
    expect([res.status, await reply(res)]).toEqual([503, { ok: false, error: "code_unavailable" }]);
    expect(down.calls.links).toEqual([]);
  });

  it("ouvre la session du compte qu'a déjà ce Discord, sans rien créer ni effacer", async () => {
    const { deps, calls } = world({ discord_code_redeem: redeemed() });
    const res = await handle(fromSite({ code: "ABCD-EFGH" }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await reply(res)).toEqual({ ok: true, token_hash: "empreinte-du-lien" });
    expect(calls.created).toEqual([]);
    expect(calls.deleted).toEqual([]);
    expect(calls.rpc.map((c) => c.name)).toEqual(["discord_code_redeem"]);
    expect(calls.links).toEqual(["joueur@example.com"]);
  });

  it("crée le compte d'un nouveau joueur, marqué de son Discord, à une adresse imprévisible, puis ouvre sa session", async () => {
    const { deps, calls } = world({ discord_code_redeem: newPlayer, discord_code_attach: () => ({ ok: true }) });
    const res = await handle(fromSite({ code: "ABCDEFGH" }), deps);
    expect(await reply(res)).toEqual({ ok: true, token_hash: "empreinte-du-lien" });
    expect(calls.created).toHaveLength(1);
    const email = calls.created[0]?.email ?? "";
    expect(email).toMatch(new RegExp(`^discord-${PLAYER}-[0-9a-f]{16}@code\\.gal\\.invalid$`));
    expect(calls.created[0]?.discordId).toBe(PLAYER);
    expect(calls.rpc[1]).toEqual({ name: "discord_code_attach", args: { p_user: "compte-neuf", p_discord_id: PLAYER, p_discord_name: "asterion" } });
    expect(calls.links).toEqual([email]);
    expect(calls.deleted).toEqual([]);
  });

  it("tire au sort une adresse différente à chaque compte", () => {
    const { deps } = world();
    const first = codeAccountEmail(PLAYER, deps.randomBytes);
    const second = codeAccountEmail(PLAYER, deps.randomBytes);
    expect(first).not.toBe(second);
    expect(codeAccountEmail(PLAYER, (n) => new Uint8Array(n).fill(171))).toBe(`discord-${PLAYER}-abababababababab@code.gal.invalid`);
  });

  it("si ce Discord a eu un compte entre-temps, efface le nouveau et ouvre l'autre", async () => {
    const { deps, calls } = world({
      discord_code_redeem: newPlayer,
      discord_code_attach: () => ({ ok: false, error: "discord_taken", user_id: "compte-premier", email: "premier@example.com" }),
    });
    expect(await reply(await handle(fromSite({ code: "ABCDEFGH" }), deps))).toEqual({ ok: true, token_hash: "empreinte-du-lien" });
    expect(calls.deleted).toEqual(["compte-neuf"]);
    expect(calls.links).toEqual(["premier@example.com"]);
  });

  it("n'ouvre jamais un autre compte que celui attendu", async () => {
    const { deps, calls } = world({ discord_code_redeem: redeemed() }, { magicLink: async () => ({ tokenHash: "empreinte-du-lien", userId: "un-autre-compte" }) });
    const res = await handle(fromSite({ code: "ABCDEFGH" }), deps);
    expect([res.status, await reply(res)]).toEqual([503, { ok: false, error: "code_unavailable" }]);
    expect(calls.logs.join(" ")).toContain("autre compte");
  });

  it("efface le compte créé si son Discord ne peut pas lui être donné, et n'ouvre rien", async () => {
    for (const attach of [() => ({ ok: false, error: "invalid_request" }), () => null, () => ({ ok: false, error: "discord_taken" })]) {
      const { deps, calls } = world({ discord_code_redeem: newPlayer, discord_code_attach: attach });
      const res = await handle(fromSite({ code: "ABCDEFGH" }), deps);
      expect([res.status, await reply(res)]).toEqual([503, { ok: false, error: "code_unavailable" }]);
      expect(calls.deleted).toEqual(["compte-neuf"]);
      expect(calls.links).toEqual([]);
    }
  });

  it("n'ouvre rien si le compte ou la session ne peuvent pas être créés", async () => {
    const noUser = world({ discord_code_redeem: newPlayer }, { createUser: async () => null });
    let res = await handle(fromSite({ code: "ABCDEFGH" }), noUser.deps);
    expect([res.status, await reply(res)]).toEqual([503, { ok: false, error: "code_unavailable" }]);
    expect(noUser.calls.links).toEqual([]);
    expect(noUser.calls.rpc.map((c) => c.name)).toEqual(["discord_code_redeem"]);
    const noLink = world({ discord_code_redeem: redeemed() }, { magicLink: async () => null });
    res = await handle(fromSite({ code: "ABCDEFGH" }), noLink.deps);
    expect([res.status, await reply(res)]).toEqual([503, { ok: false, error: "code_unavailable" }]);
    // Un compte trouvé sans adresse : rien à ouvrir.
    const odd = world({ discord_code_redeem: redeemed({ email: null }) });
    res = await handle(fromSite({ code: "ABCDEFGH" }), odd.deps);
    expect(res.status).toBe(503);
    expect(odd.calls.links).toEqual([]);
    expect(odd.calls.created).toEqual([]);
  });

  it("chaque refus a son message en français sur le site", () => {
    for (const code of ["code_format", "code_invalid", "code_busy", "code_unavailable"]) expect(ERROR_MESSAGES[code], code).toBeTruthy();
  });
});

describe("le vrai monde", () => {
  type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
  function server(answer: (url: string) => Response | Error) {
    const sent: Sent[] = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      sent.push({
        url,
        method: init?.method ?? "GET",
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      const res = answer(url);
      if (res instanceof Error) throw res;
      return res;
    }) as typeof fetch;
    return { sent, fetcher };
  }
  const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("prend la nouvelle clé de service, sinon l'ancienne, et lit les réglages de Discord", async () => {
    const { sent, fetcher } = server(() => json({ ok: true }));
    const deps = liveDeps(
      env({
        SUPABASE_URL: "https://projet.supabase.co/",
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_nouvelle" }),
        SUPABASE_SERVICE_ROLE_KEY: "ancienne",
        DISCORD_PUBLIC_KEY: ` ${"ab".repeat(32)} `,
        DISCORD_GUILD_ID: GUILD,
      }),
      fetcher,
    );
    expect([deps.publicKey, deps.guildId, deps.serviceReady]).toEqual(["ab".repeat(32), GUILD, true]);
    await deps.rpc("discord_code_redeem", { p_code_hash: "x" });
    expect(sent[0]?.url).toBe("https://projet.supabase.co/rest/v1/rpc/discord_code_redeem");
    expect(sent[0]?.headers["apikey"]).toBe("sb_secret_nouvelle");
    expect(sent[0]?.headers["authorization"]).toBe("Bearer sb_secret_nouvelle");

    const old = server(() => json({ ok: true }));
    await liveDeps(env({ SUPABASE_URL: "https://projet.supabase.co", SUPABASE_SECRET_KEYS: "illisible", SUPABASE_SERVICE_ROLE_KEY: "ancienne" }), old.fetcher).rpc("f", {});
    expect(old.sent[0]?.headers["apikey"]).toBe("ancienne");

    expect(liveDeps(env({}), fetcher).serviceReady).toBe(false);
  });

  it("prend sans réglage le serveur du clan et la clé publique de « Le Gaulois »", async () => {
    const deps = liveDeps(env({ DISCORD_PUBLIC_KEY: "  ", DISCORD_GUILD_ID: "" }), fetch);
    expect([deps.publicKey, deps.guildId]).toEqual([APP_PUBLIC_KEY, GAL_GUILD_ID]);
    expect(APP_PUBLIC_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(GAL_GUILD_ID).toMatch(/^[0-9]{17,20}$/);
    const bytes = new Uint8Array(APP_PUBLIC_KEY.match(/../g)?.map((pair) => parseInt(pair, 16)) ?? []);
    await expect(crypto.subtle.importKey("raw", bytes, { name: "Ed25519" }, false, ["verify"])).resolves.toBeTruthy();
  });

  it("appelle les fonctions SQL, et rend null si le serveur refuse ou ne répond pas", async () => {
    const ok = server(() => json({ ok: true, expires_at: EXPIRES }));
    const deps = liveDeps(env({ SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), ok.fetcher);
    expect(await deps.rpc("discord_code_issue", { p_code_hash: "h" })).toEqual({ ok: true, expires_at: EXPIRES });
    expect(ok.sent[0]).toMatchObject({ method: "POST", body: { p_code_hash: "h" } });

    const refused = server(() => json({ message: "permission denied" }, 401));
    expect(await liveDeps(env({ SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), refused.fetcher).rpc("f", {})).toBeNull();
    const down = server(() => new Error("réseau"));
    expect(await liveDeps(env({ SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), down.fetcher).rpc("f", {})).toBeNull();
  });

  it("crée un compte marqué de son Discord, l'efface, et demande le lien de session sans rien envoyer", async () => {
    const { sent, fetcher } = server((url) =>
      url.endsWith("/admin/users")
        ? json({ id: "u-1", email: "e" })
        : url.endsWith("/generate_link")
          ? json({ id: "u-1", email: "e", hashed_token: "h-1", action_link: "https://…", verification_type: "magiclink" })
          : json({}),
    );
    const deps = liveDeps(env({ SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), fetcher);
    const email = `discord-${PLAYER}-abababababababab@code.gal.invalid`;
    expect(await deps.createUser(email, PLAYER)).toBe("u-1");
    expect(sent[0]).toMatchObject({
      url: "https://p.supabase.co/auth/v1/admin/users",
      method: "POST",
      body: { email, email_confirm: true, app_metadata: { connexion: "code-discord", discord_id: PLAYER } },
    });
    expect(await deps.magicLink(email)).toEqual({ tokenHash: "h-1", userId: "u-1" });
    expect(sent[1]).toMatchObject({ url: "https://p.supabase.co/auth/v1/admin/generate_link", body: { type: "magiclink", email } });
    await deps.deleteUser("u-1");
    expect(sent[2]).toMatchObject({ url: "https://p.supabase.co/auth/v1/admin/users/u-1", method: "DELETE" });
  });

  it("lit les fiches du site, les garde cinq minutes, puis sert la dernière lecture deux heures si le site ne répond plus", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const quiet = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const start = Date.parse("2026-11-12T20:00:00Z");
      vi.setSystemTime(start);
      let up = true;
      const { sent, fetcher } = server(() => (up ? json(FICHES) : new Error("réseau")));
      const deps = liveDeps(env({}), fetcher);
      expect(await deps.fiches()).toEqual(FICHES);
      expect(sent.map((s) => [s.url, s.method])).toEqual([[FICHES_URL, "GET"]]);
      expect(await deps.fiches()).toEqual(FICHES);
      expect(sent).toHaveLength(1);
      // Cinq minutes plus tard, la fonction relit ; le site ne répond pas : la lecture d'avant sert encore.
      vi.setSystemTime(start + FICHES_FRESH_MS);
      up = false;
      expect(await deps.fiches()).toEqual(FICHES);
      expect(sent).toHaveLength(2);
      // Juste après un échec, la frappe suivante n'attend pas le site : rien n'est redemandé pendant trente secondes.
      expect(await deps.fiches()).toEqual(FICHES);
      expect(sent).toHaveLength(2);
      vi.setSystemTime(start + FICHES_FRESH_MS + FICHES_RETRY_MS);
      expect(await deps.fiches()).toEqual(FICHES);
      expect(sent).toHaveLength(3);
      // Deux heures après la dernière lecture réussie : plus rien, un membre parti ne reste pas proposé.
      vi.setSystemTime(start + FICHES_STALE_MS);
      expect(await deps.fiches()).toBeNull();
      expect(sent).toHaveLength(4);
      // Le site revient : la fonction relit, une fois les trente secondes passées.
      up = true;
      vi.setSystemTime(start + FICHES_STALE_MS + FICHES_RETRY_MS);
      expect(await deps.fiches()).toEqual(FICHES);
      expect(sent).toHaveLength(5);
    } finally {
      quiet.mockRestore();
      vi.useRealTimers();
    }
  });

  it("ne garde ni un fichier illisible ni une erreur du site, et le note dans ses journaux", async () => {
    const logs: string[] = [];
    const quiet = vi.spyOn(console, "log").mockImplementation((message: string) => void logs.push(message));
    // Un délai dépassé pendant la lecture du corps : le site est lent, pas le fichier illisible.
    const slow = { ok: true, status: 200, json: async () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")) } as unknown as Response;
    try {
      expect(await liveDeps(env({}), server(() => json({ listedAt: null, fiches: [] })).fetcher).fiches()).toBeNull();
      expect(await liveDeps(env({}), server(() => new Response("pas du json")).fetcher).fiches()).toBeNull();
      expect(await liveDeps(env({}), server(() => json({}, 500)).fetcher).fiches()).toBeNull();
      expect(await liveDeps(env({}), server(() => new Error("réseau")).fetcher).fiches()).toBeNull();
      expect(await liveDeps(env({}), server(() => slow).fetcher).fiches()).toBeNull();
    } finally {
      quiet.mockRestore();
    }
    expect(logs).toEqual([
      "code-discord : fiches : fichier illisible",
      "code-discord : fiches : fichier illisible",
      "code-discord : fiches : 500",
      "code-discord : fiches injoignables : réseau",
      "code-discord : fiches injoignables : The operation timed out.",
    ]);
  });

  it("refuse un lien de session dont la réponse ne dit pas quel compte il ouvre", async () => {
    const { fetcher } = server(() => json({ hashed_token: "h-1", action_link: "https://…" }));
    const deps = liveDeps(env({ SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), fetcher);
    expect(await deps.magicLink("discord-1@code.gal.invalid")).toBeNull();
  });

  it("ne note jamais une adresse ni un jeton dans ses journaux", async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (message: string) => logs.push(message);
    try {
      const { fetcher } = server(() => json({ msg: "joueur@example.com déjà pris", hashed_token: 1 }, 422));
      const deps = liveDeps(env({ SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret-k" }), fetcher);
      expect(await deps.createUser("joueur@example.com", PLAYER)).toBeNull();
      expect(await deps.magicLink("joueur@example.com")).toBeNull();
      await deps.rpc("discord_code_redeem", { p_code_hash: "empreinte" });
    } finally {
      console.log = original;
    }
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain("joueur@example.com");
      expect(line).not.toContain("secret-k");
      expect(line).not.toContain("empreinte");
    }
  });
});
