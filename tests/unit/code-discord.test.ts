import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { ficheImageVersion, ficheIndex } from "../../src/lib/fiches-discord";
import { profileUrl } from "../../src/lib/paliers-franchis-discord";
import { CHOOSE_NAME_URL as SITE_CHOOSE_NAME_URL } from "../../src/lib/pseudo-openfront";
import { PANEL_ROLES as SITE_PANEL_ROLES } from "../../src/lib/roles-discord";
import type { StoredMembers } from "../../src/lib/schemas";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import { IMAGE_GAULOIS, TENUE_DE_DEPART, decrireGaulois } from "../../supabase/functions/code-discord/gaulois";
import {
  APP_PUBLIC_KEY,
  BOT_TOKEN_SECRET,
  CHOOSE_NAME_URL,
  CODE_ALPHABET,
  COMMANDES_URL,
  COMMAND_MESSAGES,
  DISCORD_API,
  FICHES_FRESH_MS,
  FICHES_RETRY_MS,
  FICHES_STALE_MS,
  FICHES_URL,
  FICHE_MESSAGES,
  GAL_GUILD_ID,
  GAULOIS_FILE,
  GAULOIS_MESSAGES,
  MAX_CHOICES,
  MESSAGES,
  PANEL_EMOJIS,
  PANEL_FILE,
  PANEL_RIGHTS,
  PANEL_ROLES,
  ROLE_AUDIT_REASON,
  ROLE_MESSAGES,
  SITE_URL,
  botIdOf,
  codeAccountEmail,
  ed25519Spki,
  ficheImageUrl,
  ficheMessage,
  ficheUrl,
  formatCode,
  handle,
  liveDeps,
  newCode,
  normalizeCode,
  panelMessage,
  parseCommandes,
  parseFiches,
  pathForLog,
  permissionBits,
  roleSetup,
  setupLines,
  sha256Hex,
  signatureWorks,
  verifyDiscordSignature,
  type CommandEntry,
  type CommandIndex,
  type Deps,
  type DiscordCall,
  type DiscordReply,
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
const fiche = (id: string, pseudo: string, alt: string | null = `${pseudo}, membre de [GAL] : 3e sur 300 membres aux victoires sous le tag.`): Fiche => ({ id, pseudo, alt, v: null });
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
  guichet: entry("/commandes/guichet.png?v=999999999999", "/rejoindre"),
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
  roles: { image: "/commandes/roles.png?v=444444444444", alt: "Choisissez vos rôles, sur le serveur Discord du clan." },
  // Les émojis du robot et les vignettes, comme le site les publie (`src/lib/emojis-discord.ts`).
  emojis: ["gal_cor", "gal_cadeau", "gal_epees", "gal_bouclier", "gal_casque", "gal_porte", "gal_corbeau", "gal_poignard", "gal_tour", "gal_cle"].map((name) => ({ name, image: `/commandes/emojis/${name}.png?v=555555555555` })),
  vignettes: ["cor", "cadeau", "epees", "bouclier", "porte", "corbeau", "poignard"].map((name) => ({ name, image: `/commandes/vignettes/${name}.png?v=666666666666` })),
};
/** Le numéro de l'application et de son robot dans les tests, que la fonction lit dans le jeton. */
const APP = "222233334444555566";
/** Les octets d'une image : leur contenu ne compte pas ici. */
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function world(answers: Answers = {}, over: Partial<Deps> = {}) {
  const calls = {
    rpc: [] as { name: string; args: Record<string, unknown> }[],
    created: [] as { email: string; discordId: string }[],
    deleted: [] as string[],
    links: [] as string[],
    logs: [] as string[],
    fiches: 0,
    commandes: 0,
    images: [] as string[],
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
    siteImage: async (path) => {
      calls.images.push(path);
      return PNG;
    },
    log: (message) => calls.logs.push(message),
    // Sans jeton du robot : aucune commande ci-dessous n'appelle l'API de Discord.
    botId: "",
    discord: async () => null,
    webhook: async () => null,
    botAccepted: async () => false,
    background: () => undefined,
    sleep: async () => undefined,
    ...over,
  };
  return { deps, calls };
}

/**
 * Un faux Discord pour le robot, avec son jeton : il note chaque requête et répond par `answer`, 204 sans corps par défaut.
 * `over` se passe à `world`.
 */
function fakeDiscord(answer: (method: string, path: string, call: DiscordCall | undefined) => DiscordReply | null = () => ({ status: 204, body: null })) {
  const sent: { method: string; path: string; call: DiscordCall | undefined }[] = [];
  const discord: Deps["discord"] = async (method, path, call) => {
    sent.push({ method, path, call });
    return answer(method, path, call);
  };
  return { over: { botId: APP, discord } satisfies Partial<Deps>, sent };
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
    // Avec la version que le site tire du dessin, l'adresse change aussi quand seul le dessin change, la liste restant la même.
    expect(ficheImageUrl("Ab12Cd34", LISTED_AT, "0123456789ab")).toBe(`${SITE_URL}/generated/fiches/Ab12Cd34.png?v=0123456789ab`);
    expect(ficheImageUrl("Ab12Cd34", LISTED_AT, "ba9876543210")).not.toBe(ficheImageUrl("Ab12Cd34", LISTED_AT, "0123456789ab"));
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

  it("/gaulois montre à tout le salon le Gaulois de qui la tape, en image jointe, avec un bouton vers le village", async () => {
    const { deps, calls } = world({ discord_gaulois: () => ({ ok: true, tenue: { ...TENUE_DE_DEPART } }) });
    const res = await handle(await fromDiscord(run("gaulois")), deps);
    expect(calls.rpc).toEqual([{ name: "discord_gaulois", args: { p_discord_id: PLAYER } }]);
    expect(res.headers.get("content-type")).toMatch(/^multipart\/form-data; ?boundary=/);
    const form = await res.formData();
    const payload = JSON.parse(String(form.get("payload_json"))) as Shown & { data: { attachments: unknown[] } };
    const alt = decrireGaulois(TENUE_DE_DEPART);
    expect(payload.type).toBe(4);
    expect(payload.data.flags).toBe(32768);
    expect(payload.data.components[0]?.items?.[0]).toEqual({ media: { url: `attachment://${GAULOIS_FILE}` }, description: alt });
    expect(payload.data.components[1]?.components?.[0]).toMatchObject({ style: 5, label: "Habiller mon Gaulois", url: `${SITE_URL}/village` });
    expect(payload.data.attachments).toEqual([{ id: 0, filename: GAULOIS_FILE, description: alt }]);
    expect(payload.data.allowed_mentions).toEqual({ parse: [] });
    const file = form.get("files[0]") as File;
    expect(file.name).toBe(GAULOIS_FILE);
    expect(file.type).toBe("image/png");
    expect(await lirePng(new Uint8Array(await file.arrayBuffer()))).toMatchObject({ largeur: IMAGE_GAULOIS.largeur, hauteur: IMAGE_GAULOIS.hauteur });
  });

  it("/gaulois dit au seul joueur où habiller son Gaulois quand il n'en a pas, et ne dessine pas une tenue inconnue", async () => {
    for (const [answer, message] of [
      [{ ok: false, error: "no_account" }, GAULOIS_MESSAGES.none],
      [{ ok: false, error: "no_gaulois" }, GAULOIS_MESSAGES.none],
      [{ ok: false, error: "invalid_request" }, COMMAND_MESSAGES.down],
      [{ ok: true, tenue: { ...TENUE_DE_DEPART, pieds: "patins" } }, GAULOIS_MESSAGES.unreadable],
    ] as const) {
      const { deps } = world({ discord_gaulois: () => answer });
      const body = await content(await handle(await fromDiscord(run("gaulois")), deps));
      expect(body.data.content).toBe(message);
      expect(body.data.flags).toBe(64);
    }
    expect(GAULOIS_MESSAGES.none).toContain(`<${SITE_URL}/village>`);
    // Le serveur ne répond pas : la fonction SQL rend null.
    expect((await content(await handle(await fromDiscord(run("gaulois")), world().deps))).data.content).toBe(COMMAND_MESSAGES.down);
  });

  it("/gaulois ne prend l'identifiant que de la commande signée, ni hors du serveur du clan ni pour un robot", async () => {
    const { deps, calls } = world({ discord_gaulois: () => ({ ok: true, tenue: { ...TENUE_DE_DEPART } }) });
    for (const interaction of [run("gaulois", [], { guild_id: "111111111111111111" }), run("gaulois", [], { member: { user: { id: PLAYER, username: "robot", bot: true } } })]) {
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
        guichet: { ...ok, page: "https://ailleurs.example/" },
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
      guichet: null,
      guide: [{ ...ok, id: "03-attaque", court: "L'attaque" }],
      rivaux: [{ ...ok, tag: "LUX", rank: 3 }],
      roles: null,
      emojis: [],
      vignettes: [],
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

  it("donnent à chaque image la version de son fichier : un nouveau dessin change l'adresse que montrent /fiche et /moi", () => {
    const root = mkdtempSync(join(tmpdir(), "fiches-"));
    try {
      const dir = join(root, "public", "generated", "fiches");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "Ab12Cd34.png"), "ancien dessin");
      const before = ficheImageVersion("Ab12Cd34", root);
      expect(before).toBe(createHash("sha256").update("ancien dessin").digest("hex").slice(0, 12));
      writeFileSync(join(dir, "Ab12Cd34.png"), "nouveau dessin");
      const after = ficheImageVersion("Ab12Cd34", root);
      expect(after).not.toBe(before);
      expect(ficheImageVersion("Ef56Gh78", root)).toBeNull();
      // La fonction met cette version dans l'adresse de l'image, et la liste des membres n'a pas à changer.
      const shown = (v: string | null) => JSON.stringify(ficheMessage({ id: "Ab12Cd34", pseudo: "Brennos", alt: "a", v }, LISTED_AT));
      expect(shown(after)).toContain(`/generated/fiches/Ab12Cd34.png?v=${after}`);
      expect(shown(after)).not.toBe(shown(before));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("se relisent telles que le site les écrit : une par membre avec pseudo, jamais un anonyme", () => {
    const index = ficheIndex(members, "GAL", (id) => (id !== "Ef56Gh78" ? "0123456789ab" : null));
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
    // La version de l'image, seulement avec une image.
    expect(index.fiches.map((f) => [f.id, f.v])).toEqual([
      ["Ij90Kl12", null],
      ["Ef56Gh78", null],
      ["Ab12Cd34", "0123456789ab"],
    ]);
    expect(parseFiches(JSON.parse(JSON.stringify(index)))).toEqual(index);
  });

  it("écartent une fiche mal formée, et un fichier qui n'a pas la forme attendue ne vaut rien", () => {
    for (const bad of [null, [], { listedAt: null, fiches: [] }, { listedAt: "hier", fiches: [] }, { listedAt: LISTED_AT }]) expect(parseFiches(bad)).toBeNull();
    expect(
      parseFiches({
        listedAt: LISTED_AT,
        fiches: [{ id: "Ab12Cd34", pseudo: "Brennos", alt: "a", v: "0123456789ab" }, { id: "../x", pseudo: "Faux", alt: null }, { id: "Ef56Gh78", pseudo: "  ", alt: null }, { id: "Ij90Kl12", pseudo: "Sans image", alt: 4, v: "../x" }, { id: "Mn34Op56", pseudo: "Version bizarre", alt: "b", v: 42 }, { id: "Qr78St90", pseudo: "Ancien site", alt: "c" }, "rien"],
      }),
    ).toEqual({
      listedAt: LISTED_AT,
      fiches: [
        { id: "Ab12Cd34", pseudo: "Brennos", alt: "a", v: "0123456789ab" },
        { id: "Ij90Kl12", pseudo: "Sans image", alt: null, v: null },
        { id: "Mn34Op56", pseudo: "Version bizarre", alt: "b", v: null },
        // Une fiche d'un site d'avant la version : l'adresse suit alors l'heure de la liste, comme avant.
        { id: "Qr78St90", pseudo: "Ancien site", alt: "c", v: null },
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
    const ready = world(
      {
        discord_code_redeem: () => ({ ok: false, error: "invalid_request" }),
        discord_moi: () => ({ ok: false, error: "invalid_request" }),
        discord_gaulois: () => ({ ok: false, error: "invalid_request" }),
        concours_liste: () => ({ ok: false, error: "invalid_request" }),
      },
      // Un délai qui ne finit jamais : la comparaison des commandes répond la première, quel que soit son nombre d'étapes.
      { botAccepted: async () => true, commandSync: async () => true, sleep: () => new Promise<void>(() => undefined) },
    );
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), ready.deps))).toEqual({ ok: true, discord: true, service: true, signature: true, fiches: true, commandes: true, moi: true, gaulois: true, robot: true, concours: true, inscription: true });
    // Une empreinte et des identifiants mal formés : les fonctions SQL les refusent sans rien lire ni écrire.
    expect(ready.calls.rpc).toEqual([
      { name: "discord_code_redeem", args: { p_code_hash: "etat" } },
      { name: "discord_moi", args: { p_discord_id: "etat" } },
      { name: "discord_gaulois", args: { p_discord_id: "etat" } },
      { name: "concours_liste", args: { p_guild: "etat", p_filtre: null } },
    ]);
    const noBase = world();
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), noBase.deps))).toMatchObject({ service: false, moi: false });
    const unset = world({ discord_code_redeem: () => ({ ok: false, error: "invalid_request" }) });
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), { ...unset.deps, guildId: "", serviceReady: false }))).toEqual({ ok: true, discord: false, service: false, signature: true, fiches: true, commandes: true, moi: false, gaulois: false, robot: false, concours: false, inscription: false });
    expect(unset.calls.rpc).toEqual([]);
    const noSite = world({}, { fiches: async () => null, commandes: async () => null });
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), noSite.deps))).toMatchObject({ fiches: false, commandes: false });
  });

  it("n'attend pas sans fin la comparaison des commandes de Discord : au-delà du délai, elle dit non, et elle continue", async () => {
    const naps: number[] = [];
    const slow = world({}, { commandSync: () => new Promise<boolean>(() => undefined), sleep: async (ms) => void naps.push(ms) });
    expect(await reply(await handle(fromSite(null, "GET", "/etat"), slow.deps))).toMatchObject({ inscription: false });
    expect(naps).toEqual([15_000]);
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

/* ---------- Les rôles du serveur ---------- */

// Les numéros des rôles, par leur nom dans les boutons.
const ROLE = Object.fromEntries(PANEL_ROLES.map((role) => [role.key, role.id])) as Record<"rassemblement" | "giveaway" | "tournois" | "membre", string>;
const CHANNEL = "555566667777888899";
const OTHER_ROLE = "444455556666777788";
const bit = (n: number) => 1n << BigInt(n);
const rights = (...bits: number[]) => String(bits.reduce((sum, n) => sum | bit(n), 0n));
// Voir le salon, envoyer des messages, joindre des fichiers ; gérer les rôles.
const CHANNEL_RIGHTS = rights(10, 11, 15);
const MANAGE_ROLES = rights(28);

const click = (customId: string, roles: string[] = [], over: Record<string, unknown> = {}) => ({
  id: "999900001111222233",
  type: 3,
  guild_id: GUILD,
  channel_id: CHANNEL,
  application_id: APP,
  token: "jeton-de-l-interaction",
  data: { custom_id: customId, component_type: 2 },
  member: { user: { id: PLAYER, username: "asterion" }, roles, permissions: "0" },
  ...over,
});

const rolesCommand = (over: Record<string, unknown> = {}) => ({
  id: "999900001111222244",
  type: 2,
  guild_id: GUILD,
  channel_id: CHANNEL,
  application_id: APP,
  token: "jeton-de-l-interaction",
  app_permissions: CHANNEL_RIGHTS,
  data: { name: "roles" },
  member: { user: { id: PLAYER, username: "chef" }, roles: [], permissions: MANAGE_ROLES },
  ...over,
});

/** Les rôles du serveur : celui du robot tout en haut avec « Gérer les rôles », ceux du panneau dessous. */
const BOT_ROLE = "333344445555666677";
const guildRoles = (over: Record<string, Record<string, unknown>> = {}) =>
  [
    { id: GUILD, position: 0, permissions: "0", managed: false },
    { id: ROLE.membre, position: 1, permissions: "0", managed: false },
    { id: ROLE.rassemblement, position: 2, permissions: "0", managed: false },
    { id: ROLE.giveaway, position: 3, permissions: "0", managed: false },
    { id: ROLE.tournois, position: 4, permissions: "0", managed: false },
    { id: BOT_ROLE, position: 5, permissions: MANAGE_ROLES, managed: true },
  ].map((role) => ({ ...role, ...over[role.id] }));

/** Un Discord où tout va bien pour /roles : la liste des rôles, le robot, puis le panneau accepté. */
const panelDiscord = (post: DiscordReply | null = { status: 200, body: { id: "1" } }, roles: unknown = guildRoles()) =>
  fakeDiscord((method, path) => {
    if (method === "GET" && path === `/guilds/${GUILD}/roles`) return { status: 200, body: roles };
    if (method === "GET" && path === `/guilds/${GUILD}/members/${APP}`) return { status: 200, body: { roles: [BOT_ROLE] } };
    if (method === "POST" && path === `/channels/${CHANNEL}/messages`) return post;
    return { status: 404, body: { code: 0 } };
  });

/**
 * Une interaction jusqu'au bout : la réponse à Discord, puis la tâche de fond, et ce qui a remplacé la réponse d'attente. `text` :
 * ce que lit la personne qui a cliqué ou tapé la commande, la réponse d'attente remplacée ou la réponse tout de suite.
 */
/** Ce qu'écrit un message : son texte, ou, pour une carte (Components V2), ses blocs de texte l'un après l'autre. */
function textOf(message: unknown): string {
  const m = message as { content?: unknown; components?: unknown } | undefined;
  if (typeof m?.content === "string") return m.content;
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { type?: unknown; content?: unknown; components?: unknown } | null;
    if (!n || typeof n !== "object") return;
    if (n.type === 10 && typeof n.content === "string") parts.push(n.content);
    walk(n.components);
  };
  walk(m?.components);
  return parts.join("\n");
}

async function answered(interaction: unknown, over: Partial<Deps> = {}, signed: { timestamp?: number } = {}) {
  const tasks: Promise<unknown>[] = [];
  const hooks: { method: string; path: string; call: DiscordCall | undefined }[] = [];
  const { deps, calls } = world(
    {},
    {
      background: (task) => void tasks.push(task),
      webhook: async (method, path, call) => {
        hooks.push({ method, path, call });
        return { status: 200, body: {} };
      },
      ...over,
    },
  );
  const body = (await (await handle(await fromDiscord(interaction, signed), deps)).json()) as { type: number; data: { content?: string; flags: number } };
  await Promise.all(tasks);
  const edited = hooks.at(-1)?.call?.body;
  return { body, hooks, calls, tasks, text: body.type === 5 ? textOf(edited) : textOf(body.data) };
}

describe("les rôles du panneau", () => {
  it("sont ceux que le pilote a donnés, et l'image du site écrit les mêmes, dans le même ordre", () => {
    expect(PANEL_ROLES.map((role) => [role.key, role.id, role.label])).toEqual([
      ["rassemblement", "1353811132766224414", "Rassemblement"],
      ["giveaway", "1358882521986629793", "Giveaway"],
      ["tournois", "1516822966845968507", "Tournois"],
      ["membre", "1350921119871402166", "Membre GAL"],
    ]);
    expect(SITE_PANEL_ROLES.map((role) => [role.key, role.label])).toEqual(PANEL_ROLES.map((role) => [role.key, role.label]));
  });

  it("partent en image jointe, un bouton par rôle et « Mes rôles », sans mention possible", () => {
    const message = panelMessage("La description");
    expect(message["flags"]).toBe(32768);
    expect(message["allowed_mentions"]).toEqual({ parse: [] });
    expect(message["attachments"]).toEqual([{ id: 0, filename: PANEL_FILE, description: "La description" }]);
    const [gallery, row] = message["components"] as [Record<string, unknown>, { type: number; components: Record<string, unknown>[] }];
    expect(gallery).toEqual({ type: 12, items: [{ media: { url: `attachment://${PANEL_FILE}` }, description: "La description" }] });
    expect(row.type).toBe(1);
    // Cinq boutons au plus dans une rangée, des numéros de 100 signes au plus, des noms de 80.
    expect(row.components).toHaveLength(5);
    expect(row.components.map((b) => b["custom_id"])).toEqual(["roles:rassemblement", "roles:giveaway", "roles:tournois", "roles:membre", "roles:voir"]);
    expect(row.components.map((b) => b["label"])).toEqual(["Rassemblement", "Giveaway", "Tournois", "Membre GAL", "Mes rôles"]);
    for (const button of row.components) {
      expect(button["type"]).toBe(2);
      expect(String(button["custom_id"]).length).toBeLessThanOrEqual(100);
      expect(String(button["label"]).length).toBeLessThanOrEqual(80);
    }
    expect(row.components.slice(0, 4).every((b) => b["style"] === 1 && typeof (b["emoji"] as { name?: unknown }).name === "string")).toBe(true);
    expect(row.components[4]).toMatchObject({ style: 2 });
  });

  it("accordent leurs phrases au nombre de droits ou de rôles qui manquent", () => {
    expect(ROLE_MESSAGES.channelRights(["Joindre des fichiers"])).toContain("« Joindre des fichiers ». Donnez-le-lui");
    expect(ROLE_MESSAGES.channelRights(["Voir le salon", "Joindre des fichiers"])).toContain("« Voir le salon », « Joindre des fichiers ». Donnez-les-lui");
    expect(ROLE_MESSAGES.setupMissing(["Giveaway"])).toBe("Attention : « Giveaway » n'existe pas sur ce serveur, ou ne peut pas se donner : ce bouton ne donne rien.");
    expect(ROLE_MESSAGES.setupMissing(["Giveaway", "Membre GAL"])).toBe("Attention : « Giveaway », « Membre GAL » n'existent pas sur ce serveur, ou ne peuvent pas se donner : ces boutons ne donnent rien.");
    // Un code d'erreur se dit en mots, avec ce qu'il faut faire.
    expect(ROLE_MESSAGES.postRefused(400)).toContain("avec le code d'erreur 400 : rien n'est parti. Relancez /roles");
  });

  it("lit les droits de Discord écrits en chiffres, rien d'autre", () => {
    expect(permissionBits("268435456")).toBe(bit(28));
    expect(permissionBits(CHANNEL_RIGHTS)).toBe(bit(10) | bit(11) | bit(15));
    for (const bad of [undefined, null, 8, "", "-1", "8n", "1".repeat(31)]) expect(permissionBits(bad), String(bad)).toBe(0n);
    expect(PANEL_RIGHTS.map((right) => right.label)).toEqual(["Voir le salon", "Envoyer des messages", "Joindre des fichiers"]);
  });
});

describe("un clic sur un bouton du panneau", () => {
  it("répond « en cours » à lui seul, donne le rôle à qui ne l'a pas, puis le lui dit dans une carte", async () => {
    const { over, sent } = fakeDiscord();
    const { body, hooks, text } = await answered(click("roles:tournois", [OTHER_ROLE]), over);
    // Discord attend une réponse en trois secondes, démarrage compris : d'abord « en cours », éphémère.
    expect(body).toEqual({ type: 5, data: { flags: 64 } });
    expect(sent).toEqual([{ method: "PUT", path: `/guilds/${GUILD}/members/${PLAYER}/roles/${ROLE.tournois}`, call: { reason: ROLE_AUDIT_REASON } }]);
    // Une carte au bord bleu : ce qui a changé, la vignette du rôle lue dans l'index du site, puis ses rôles.
    expect(hooks).toEqual([
      {
        method: "PATCH",
        path: `/webhooks/${APP}/jeton-de-l-interaction/messages/@original`,
        call: {
          body: {
            flags: 32768,
            components: [
              {
                type: 17,
                accent_color: 0x0b5fff,
                components: [
                  {
                    type: 9,
                    components: [{ type: 10, content: `**Rôle ajouté : <@&${ROLE.tournois}>**\n-# Un second clic sur le même bouton le retire.` }],
                    accessory: { type: 11, media: { url: `${SITE_URL}/commandes/vignettes/epees.png?v=666666666666` }, description: "L'icône de Tournois" },
                  },
                  { type: 14, divider: true, spacing: 1 },
                  { type: 10, content: `Vos rôles du panneau : <@&${ROLE.tournois}>.` },
                ],
              },
            ],
            allowed_mentions: { parse: [] },
          },
        },
      },
    ]);
    expect(text).toContain(`Rôle ajouté : <@&${ROLE.tournois}>`);
  });

  it("retire le rôle à qui l'a, et redit ceux qui lui restent, dans l'ordre des boutons", async () => {
    const { over, sent } = fakeDiscord();
    const first = await answered(click("roles:tournois", [ROLE.membre, ROLE.tournois, OTHER_ROLE, ROLE.rassemblement]), over);
    expect(sent.map((s) => [s.method, s.path])).toEqual([["DELETE", `/guilds/${GUILD}/members/${PLAYER}/roles/${ROLE.tournois}`]]);
    expect(first.text).toBe(`**Rôle retiré : <@&${ROLE.tournois}>**\n-# Un clic sur le même bouton le redonne.\nVos rôles du panneau : <@&${ROLE.rassemblement}>, <@&${ROLE.membre}>.`);
    const last = await answered(click("roles:membre", [ROLE.membre]), over);
    expect(last.text).toBe(`**Rôle retiré : <@&${ROLE.membre}>**\n-# Un clic sur le même bouton le redonne.\nVous n'avez aucun rôle du panneau.`);
  });

  it("sans index du site, la carte part sans vignette ; refusée par Discord, le même texte part en clair", async () => {
    const { over } = fakeDiscord();
    const plainCard = await answered(click("roles:giveaway"), { ...over, commandes: async () => null });
    const card = plainCard.hooks[0]?.call?.body as { components: { components: { type: number }[] }[] };
    expect(card.components[0]?.components[0]?.type).toBe(10);
    // Discord refuse la carte (400) : une seconde demande remplace l'attente par le texte de secours.
    let first = true;
    const refused = await answered(click("roles:giveaway"), {
      ...over,
      webhook: async () => {
        const answer = first ? { status: 400, body: { code: 50035 } } : { status: 200, body: {} };
        first = false;
        return answer;
      },
    });
    expect(refused.calls.logs).toEqual([]);
    const fallback = { ...over };
    const sentBodies: unknown[] = [];
    await answered(click("roles:giveaway"), {
      ...fallback,
      webhook: async (_method, _path, call) => {
        sentBodies.push(call?.body);
        return sentBodies.length === 1 ? { status: 400, body: {} } : { status: 200, body: {} };
      },
    });
    expect(sentBodies).toHaveLength(2);
    expect(sentBodies[1]).toEqual({ content: `${ROLE_MESSAGES.added(ROLE.giveaway)}\nVos rôles du panneau : <@&${ROLE.giveaway}>.`, allowed_mentions: { parse: [] } });
  });

  it("« Mes rôles » montre tout de suite ses rôles du panneau dans une carte, sans rien changer, même sans jeton", async () => {
    const shown = await answered(click("roles:voir", [ROLE.membre, OTHER_ROLE, ROLE.giveaway]));
    expect(shown.body).toMatchObject({ type: 4, data: { flags: 64 | 32768 } });
    expect(shown.text).toBe(`**Vos rôles du panneau**\n<@&${ROLE.giveaway}> <@&${ROLE.membre}>`);
    expect(shown.tasks).toEqual([]);
    expect((await answered(click("roles:voir"))).text).toBe("Vous n'avez aucun rôle du panneau.");
  });

  it("ne donne que les rôles de sa liste : un autre numéro de bouton ne fait rien", async () => {
    const { over, sent } = fakeDiscord();
    const { deps } = world({}, over);
    for (const customId of ["roles:admin", `roles:${ROLE.membre}`, "roles:", "roles:Tournois"]) {
      expect((await content(await handle(await fromDiscord(click(customId)), deps))).data.content, customId).toBe(ROLE_MESSAGES.oldButton);
    }
    expect((await content(await handle(await fromDiscord(click("autre:tournois")), deps))).data.content).toBe(MESSAGES.unknown);
    // Une fenêtre envoyée (5) n'est jamais un clic du panneau.
    expect((await content(await handle(await fromDiscord({ ...click("roles:tournois"), type: 5 }), deps))).data.content).toBe(MESSAGES.unknown);
    expect(sent).toEqual([]);
  });

  it("ne sert que sur le serveur du clan, à un membre qui n'est pas un robot", async () => {
    const { over, sent } = fakeDiscord();
    const cases = [
      click("roles:tournois", [], { guild_id: "111111111111111111" }),
      click("roles:tournois", [], { guild_id: undefined }),
      click("roles:tournois", [], { member: undefined, user: { id: PLAYER } }),
      click("roles:tournois", [], { member: { user: { id: PLAYER, bot: true }, roles: [] } }),
      click("roles:tournois", [], { member: { user: { id: "pas-un-numero" }, roles: [] } }),
      // Sans de quoi remplacer la réponse d'attente, rien ne commence.
      click("roles:tournois", [], { token: "" }),
      click("roles:tournois", [], { application_id: "x" }),
    ];
    for (const interaction of cases) {
      const { text, tasks } = await answered(interaction, over);
      expect(text).toBe(ROLE_MESSAGES.wrongPlace);
      expect(tasks).toEqual([]);
    }
    expect(sent).toEqual([]);
  });

  it("refuse un clic que Discord n'a pas signé", async () => {
    const { over, sent } = fakeDiscord();
    const { deps } = world({}, over);
    expect((await handle(await fromDiscord(click("roles:tournois"), { pair: otherKeys }), deps)).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("dit tout de suite que les boutons ne sont pas branchés tant que le jeton manque", async () => {
    const { body, text, tasks } = await answered(click("roles:giveaway"));
    expect(body.type).toBe(4);
    expect(text).toBe(ROLE_MESSAGES.notReady);
    expect(tasks).toEqual([]);
  });

  it("dit pourquoi Discord refuse, et le note au journal sans le numéro du membre", async () => {
    const cases: [DiscordReply | null, string][] = [
      [{ status: 403, body: { code: 50013, message: "Missing Permissions" } }, ROLE_MESSAGES.noRight(ROLE.tournois)],
      [{ status: 401, body: { code: 0 } }, ROLE_MESSAGES.badToken],
      [{ status: 404, body: { code: 10011, message: "Unknown Role" } }, ROLE_MESSAGES.unknownRole],
      [{ status: 404, body: { code: 10007, message: "Unknown Member" } }, ROLE_MESSAGES.down],
      [{ status: 429, body: { retry_after: 1.2 } }, ROLE_MESSAGES.busy],
      [{ status: 500, body: null }, ROLE_MESSAGES.down],
      // Sans réponse à temps, le rôle a pu changer : la phrase le dit, pour qu'un nouveau clic ne le défasse pas.
      [null, ROLE_MESSAGES.unsure],
    ];
    for (const [reply, expected] of cases) {
      const { over } = fakeDiscord(() => reply);
      const { text, calls } = await answered(click("roles:tournois"), over);
      expect(text).toBe(expected);
      expect(calls.logs).toHaveLength(1);
      expect(calls.logs[0]).toMatch(/^bouton tournois : /);
      expect(calls.logs[0]).not.toContain(PLAYER);
    }
    const { over } = fakeDiscord(() => ({ status: 403, body: { code: 50013 } }));
    expect((await answered(click("roles:tournois"), over)).calls.logs).toEqual(["bouton tournois : 403 (code 50013)"]);
  });

  it("réessaie une fois, une seconde plus tard, de remplacer la réponse d'attente, puis le note au journal", async () => {
    const { over } = fakeDiscord();
    const tries: string[] = [];
    const naps: number[] = [];
    const failing = await answered(click("roles:tournois"), {
      ...over,
      sleep: async (ms) => void naps.push(ms),
      webhook: async (method) => {
        tries.push(method);
        return null;
      },
    });
    expect(tries).toEqual(["PATCH", "PATCH"]);
    expect(naps).toEqual([1000]);
    expect(failing.calls.logs).toEqual(["bouton tournois : la réponse d'attente n'a pas pu être remplacée"]);
    // Discord ne connaissait pas encore la réponse d'attente : la seconde tentative passe, rien au journal.
    let first = true;
    const again = await answered(click("roles:tournois"), {
      ...over,
      webhook: async () => {
        const reply = first ? { status: 404, body: { code: 10015 } } : { status: 200, body: {} };
        first = false;
        return reply;
      },
    });
    expect(again.calls.logs).toEqual([]);
    // Un refus net ne se réessaie pas une seconde plus tard : la carte refusée laisse seulement place au texte de secours.
    let refused = 0;
    const naps2: number[] = [];
    const net = await answered(click("roles:tournois"), {
      ...over,
      sleep: async (ms) => void naps2.push(ms),
      webhook: async () => {
        refused += 1;
        return { status: 400, body: { code: 50035 } };
      },
    });
    expect(refused).toBe(2);
    expect(naps2).toEqual([]);
    expect(net.calls.logs).toEqual(["bouton tournois : la réponse d'attente n'a pas pu être remplacée"]);
  });

  it("refuse un jeton qui n'est pas celui de l'application du panneau", async () => {
    const { over, sent } = fakeDiscord();
    const { text, calls, tasks } = await answered(click("roles:tournois"), { ...over, botId: "135792468013579246" });
    expect(text).toBe(ROLE_MESSAGES.wrongBot);
    expect(tasks).toEqual([]);
    expect(sent).toEqual([]);
    expect(calls.logs).toEqual(["bouton : le jeton du secret n'est pas celui de cette application"]);
  });

  it("ne change rien pour un clic arrivé après le délai de Discord", async () => {
    const { over, sent } = fakeDiscord();
    const late = await answered(click("roles:tournois"), over, { timestamp: NOW - 4 });
    expect(late.text).toBe(ROLE_MESSAGES.late);
    expect(late.tasks).toEqual([]);
    expect(sent).toEqual([]);
    // Trois secondes au compteur, qui compte à la seconde : peut-être deux et un peu, encore à temps.
    expect((await answered(click("roles:tournois"), over, { timestamp: NOW - 3 })).body.type).toBe(5);
  });
});

describe("la commande /roles", () => {
  it("répond « en cours », poste le panneau dans le salon, l'image jointe, puis remplace l'attente par le résultat", async () => {
    const { over, sent } = panelDiscord();
    const { body, hooks, calls, text } = await answered(rolesCommand(), over);
    // D'abord « en cours », que l'encadrement est seul à voir.
    expect(body).toEqual({ type: 5, data: { flags: 64 } });
    expect(calls.images).toEqual([COMMANDES.roles!.image]);
    const post = sent.find((s) => s.method === "POST");
    expect(post?.path).toBe(`/channels/${CHANNEL}/messages`);
    expect(post?.call?.body).toEqual(panelMessage(COMMANDES.roles!.alt));
    expect(post?.call?.files).toEqual([{ name: PANEL_FILE, type: "image/png", bytes: PNG }]);
    // D'abord la liste des émojis de l'application (illisible ici : les boutons gardent leurs émojis ordinaires, rien n'est
    // déposé), puis le contrôle lit les rôles du serveur et ceux du robot, numéro tiré de son jeton.
    expect(sent.filter((s) => s.method === "GET").map((s) => s.path)).toEqual([`/applications/${APP}/emojis`, `/guilds/${GUILD}/roles`, `/guilds/${GUILD}/members/${APP}`]);
    expect(hooks).toEqual([
      {
        method: "PATCH",
        path: `/webhooks/${APP}/jeton-de-l-interaction/messages/@original`,
        call: { body: { content: `${ROLE_MESSAGES.posted}\n${ROLE_MESSAGES.ready}`, allowed_mentions: { parse: [] } } },
      },
    ]);
    expect(text).toBe(`${ROLE_MESSAGES.posted}\n${ROLE_MESSAGES.ready}`);
  });

  it("dépose les émojis du robot qui manquent, puis les pose sur les boutons du panneau", async () => {
    // Discord connaît déjà le cor ; les quatre autres émojis du panneau sont déposés, d'après leur PNG du site.
    let next = 700000000000000001n;
    const uploaded: string[] = [];
    const base = panelDiscord();
    const { over, sent } = fakeDiscord((method, path, call) => {
      if (path === `/applications/${APP}/emojis` && method === "GET") return { status: 200, body: { items: [{ id: "700000000000000000", name: "gal_cor" }] } };
      if (path === `/applications/${APP}/emojis` && method === "POST") {
        const name = String((call?.body as { name: string }).name);
        uploaded.push(name);
        return { status: 201, body: { id: String(next++), name } };
      }
      return base.over.discord(method, path, call) as unknown as DiscordReply | null;
    });
    const { calls } = await answered(rolesCommand(), over);
    expect(uploaded).toEqual(["gal_cadeau", "gal_epees", "gal_bouclier", "gal_casque"]);
    expect(calls.images).toEqual([COMMANDES.roles!.image, ...uploaded.map((name) => `/commandes/emojis/${name}.png?v=555555555555`)]);
    const post = sent.find((s) => s.method === "POST" && s.path === `/channels/${CHANNEL}/messages`);
    const row = (post?.call?.body as { components: { components?: { emoji?: unknown; label?: unknown }[] }[] }).components[1]!.components!;
    expect(row.map((b) => b.emoji)).toEqual([
      { id: "700000000000000000", name: "gal_cor" },
      { id: "700000000000000001", name: "gal_cadeau" },
      { id: "700000000000000002", name: "gal_epees" },
      { id: "700000000000000003", name: "gal_bouclier" },
      { id: "700000000000000004", name: "gal_casque" },
    ]);
  });

  it("si Discord refuse le panneau avec les émojis du robot, le panneau repart avec les émojis ordinaires", async () => {
    const known = PANEL_EMOJIS.map((name, i) => ({ id: String(700000000000000000n + BigInt(i)), name }));
    const tried: unknown[] = [];
    const base = panelDiscord();
    const { over } = fakeDiscord((method, path, call) => {
      if (path === `/applications/${APP}/emojis` && method === "GET") return { status: 200, body: { items: known } };
      if (path === `/channels/${CHANNEL}/messages` && method === "POST") {
        tried.push(call?.body);
        if (JSON.stringify(call?.body).includes('"id":"700000000000000000"')) return { status: 400, body: { code: 50035 } };
      }
      return base.over.discord(method, path, call) as unknown as DiscordReply | null;
    });
    const { text, calls } = await answered(rolesCommand(), over);
    expect(tried).toEqual([panelMessage(COMMANDES.roles!.alt, new Map(known.map((e) => [e.name, e.id]))), panelMessage(COMMANDES.roles!.alt)]);
    expect(text).toBe(`${ROLE_MESSAGES.posted}\n${ROLE_MESSAGES.ready}`);
    expect(calls.logs).toEqual(["panneau des rôles : refusé avec les émojis du robot (400), reposté sans"]);
    // Sans émoji du robot sur le panneau, un refus n'est pas réessayé : il est dit à l'encadrement.
    const plain = panelDiscord({ status: 400, body: { code: 50035 } });
    expect((await answered(rolesCommand(), plain.over)).text).toBe(ROLE_MESSAGES.postRefused(400));
    expect(plain.sent.filter((s) => s.method === "POST")).toHaveLength(1);
  });

  it("note au journal une réponse d'attente que Discord n'a pas laissé remplacer", async () => {
    const { over } = panelDiscord();
    const tasks: Promise<unknown>[] = [];
    const { deps, calls } = world({}, { ...over, background: (task) => void tasks.push(task), webhook: async () => null });
    await handle(await fromDiscord(rolesCommand()), deps);
    await Promise.all(tasks);
    expect(calls.logs).toEqual(["panneau des rôles : la réponse d'attente n'a pas pu être remplacée"]);
  });

  it("est réservée à qui peut gérer les rôles, ou à un administrateur", async () => {
    const { over, sent } = panelDiscord();
    for (const permissions of ["0", rights(13), rights(5), undefined]) {
      const { text, tasks } = await answered(rolesCommand({ member: { user: { id: PLAYER }, roles: [], permissions } }), over);
      expect(text, String(permissions)).toBe(ROLE_MESSAGES.notStaff);
      expect(tasks).toEqual([]);
    }
    expect(sent).toEqual([]);
    const admin = await answered(rolesCommand({ member: { user: { id: PLAYER }, roles: [], permissions: rights(3) } }), over);
    expect(admin.text).toContain(ROLE_MESSAGES.posted);
  });

  it("ne part pas s'il manque au robot un droit dans le salon, et nomme ceux qui manquent", async () => {
    const { over, sent } = panelDiscord();
    expect((await answered(rolesCommand({ app_permissions: rights(10, 11) }), over)).text).toBe(ROLE_MESSAGES.channelRights(["Joindre des fichiers"]));
    expect((await answered(rolesCommand({ app_permissions: "0" }), over)).text).toBe(ROLE_MESSAGES.channelRights(["Voir le salon", "Envoyer des messages", "Joindre des fichiers"]));
    expect(sent).toEqual([]);
    // Un robot administrateur a tout ; sans le champ, Discord dira lui-même s'il refuse.
    for (const app_permissions of [rights(3), undefined]) {
      expect((await answered(rolesCommand({ app_permissions }), over)).text).toContain(ROLE_MESSAGES.posted);
    }
  });

  it("refuse le jeton d'un autre robot, et une commande arrivée après le délai de Discord", async () => {
    const { over, sent } = panelDiscord();
    // Le jeton de « Bienvenue Gaulois », par exemple : le panneau serait posté par lui, et ses clics iraient à lui.
    const other = await answered(rolesCommand(), { ...over, botId: "135792468013579246" });
    expect(other.text).toBe(ROLE_MESSAGES.otherBotToken);
    expect(ROLE_MESSAGES.otherBotToken).toContain(BOT_TOKEN_SECRET);
    const late = await answered(rolesCommand(), over, { timestamp: NOW - 5 });
    expect(late.text).toBe(ROLE_MESSAGES.late);
    expect([...other.tasks, ...late.tasks]).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("redemande les trois droits du salon si Discord refuse sans les avoir joints à la commande", async () => {
    const { over } = panelDiscord({ status: 403, body: { code: 50001 } });
    expect((await answered(rolesCommand({ app_permissions: undefined }), over)).text).toBe(ROLE_MESSAGES.channelRights(["Voir le salon", "Envoyer des messages", "Joindre des fichiers"]));
  });

  it("ne sert que sur le serveur du clan, et dit quand le jeton manque", async () => {
    expect((await answered(rolesCommand())).text).toBe(ROLE_MESSAGES.noToken);
    expect(ROLE_MESSAGES.noToken).toContain(BOT_TOKEN_SECRET);
    const { over, sent } = panelDiscord();
    for (const wrong of [{ guild_id: "111111111111111111" }, { channel_id: undefined }, { token: "" }, { application_id: "x" }]) {
      expect((await answered(rolesCommand(wrong), over)).text).toBe(ROLE_MESSAGES.commandWrongPlace);
    }
    expect(sent).toEqual([]);
  });

  it("ne poste rien sans l'image du site", async () => {
    const { over, sent } = panelDiscord();
    expect((await answered(rolesCommand(), { ...over, commandes: async () => null })).text).toBe(ROLE_MESSAGES.noImage);
    expect((await answered(rolesCommand(), { ...over, commandes: async () => ({ ...COMMANDES, roles: null }) })).text).toBe(ROLE_MESSAGES.noImage);
    expect((await answered(rolesCommand(), { ...over, siteImage: async () => null })).text).toBe(ROLE_MESSAGES.noImage);
    expect(sent).toEqual([]);
  });

  it("dit ce que Discord refuse : droit, jeton, attente", async () => {
    const cases: [DiscordReply | null, string][] = [
      // Les trois droits étaient dans la commande : le refus vient d'ailleurs, et la réponse ne les redemande pas.
      [{ status: 403, body: { code: 50001, message: "Missing Access" } }, ROLE_MESSAGES.postForbidden(" (code d'erreur 50001)")],
      [{ status: 401, body: { code: 0 } }, ROLE_MESSAGES.postToken],
      [{ status: 429, body: { retry_after: 3 } }, ROLE_MESSAGES.postBusy],
      [{ status: 400, body: { code: 50035 } }, ROLE_MESSAGES.postRefused(400)],
      [null, ROLE_MESSAGES.down],
    ];
    for (const [answer, expected] of cases) {
      const { over } = panelDiscord(answer);
      const { text, calls } = await answered(rolesCommand(), over);
      expect(text).toBe(expected);
      expect(calls.logs[0]).toMatch(/^panneau des rôles : /);
    }
  });

  it("dit ce qui empêcherait encore les boutons de marcher", async () => {
    const tooHigh = guildRoles({ [ROLE.tournois]: { position: 6 }, [ROLE.giveaway]: { position: 5 } });
    const { over } = panelDiscord(undefined, tooHigh);
    expect((await answered(rolesCommand(), over)).text.split("\n")).toEqual([ROLE_MESSAGES.posted, ROLE_MESSAGES.setupTooHigh([ROLE.giveaway, ROLE.tournois])]);
    // La liste des rôles illisible : le panneau est posté, le contrôle ne se fait pas.
    const unreadable = fakeDiscord((method) => (method === "POST" ? { status: 200, body: {} } : { status: 500, body: null }));
    expect((await answered(rolesCommand(), unreadable.over)).text).toBe(`${ROLE_MESSAGES.posted}\n${ROLE_MESSAGES.setupUnknown}`);
  });
});

describe("le contrôle des droits du robot sur les rôles", () => {
  it("tout est prêt : « Gérer les rôles », et un rôle plus haut que ceux du panneau", () => {
    expect(roleSetup(guildRoles(), [BOT_ROLE], GUILD)).toEqual({ manageRoles: true, tooHigh: [], missing: [] });
    expect(setupLines({ manageRoles: true, tooHigh: [], missing: [] })).toEqual([ROLE_MESSAGES.ready]);
  });

  it("sans « Gérer les rôles » le robot ne peut rien ; le droit vient aussi du rôle de tout le monde, ou de l'administration", () => {
    const setup = roleSetup(guildRoles({ [BOT_ROLE]: { permissions: rights(10, 11) } }), [BOT_ROLE], GUILD);
    expect(setup?.manageRoles).toBe(false);
    expect(setupLines(setup)).toEqual([ROLE_MESSAGES.setupManage]);
    expect(roleSetup(guildRoles({ [GUILD]: { permissions: MANAGE_ROLES }, [BOT_ROLE]: { permissions: "0" } }), [BOT_ROLE], GUILD)?.manageRoles).toBe(true);
    expect(roleSetup(guildRoles({ [BOT_ROLE]: { permissions: rights(3) } }), [BOT_ROLE], GUILD)?.manageRoles).toBe(true);
  });

  it("un rôle du panneau à la hauteur du robot ou au-dessus ne se donne pas, même par un administrateur", () => {
    const roles = guildRoles({ [BOT_ROLE]: { permissions: rights(3), position: 3 } });
    expect(roleSetup(roles, [BOT_ROLE], GUILD)?.tooHigh).toEqual([ROLE.giveaway, ROLE.tournois]);
    // Un robot sans rôle à lui est tout en bas.
    expect(roleSetup(guildRoles(), [], GUILD)?.tooHigh).toEqual([ROLE.rassemblement, ROLE.giveaway, ROLE.tournois, ROLE.membre]);
  });

  it("un rôle absent du serveur ou tenu par une intégration est nommé", () => {
    const roles = guildRoles({ [ROLE.giveaway]: { managed: true } }).filter((role) => role.id !== ROLE.membre);
    const setup = roleSetup(roles, [BOT_ROLE], GUILD);
    expect(setup?.missing).toEqual([ROLE.giveaway, ROLE.membre]);
    expect(setupLines(setup)).toEqual([ROLE_MESSAGES.setupMissing(["Giveaway", "Membre GAL"])]);
  });

  it("une liste illisible ne se contrôle pas", () => {
    expect(roleSetup(null, [BOT_ROLE], GUILD)).toBeNull();
    expect(roleSetup(guildRoles(), "pas une liste", GUILD)).toBeNull();
    expect(setupLines(null)).toEqual([ROLE_MESSAGES.setupUnknown]);
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

  describe("le robot et l'API de Discord", () => {
    // Un faux jeton, fabriqué ici pour n'avoir dans le fichier aucun texte qui ressemble à un vrai.
    const BOT = "246813579024681357";
    const token = (id = BOT) => [btoa(id).replace(/=+$/, ""), "Fabcde", "s".repeat(30)].join(".");
    // Le numéro de l'application est celui du robot de ce faux jeton : sans lui, `/etat` refuserait un autre robot.
    const withBot = (fetcher: typeof fetch, value = token()) => liveDeps(env({ [BOT_TOKEN_SECRET]: ` ${value} `, DISCORD_APPLICATION_ID: BOT }), fetcher);

    it("lit le numéro du robot dans son jeton, et rien dans ce qui n'en est pas un", () => {
      expect(botIdOf(token())).toBe(BOT);
      for (const other of ["", "abc", token().replace(/\./g, "-"), [btoa("pas un nombre"), "a", "b"].join("."), [btoa("12"), "a", "b"].join(".")]) {
        expect(botIdOf(other), other).toBe("");
      }
    });

    it("appelle l'API avec le jeton du robot, se présente, et écrit la raison au journal d'audit", async () => {
      const { sent, fetcher } = server(() => json({ id: "1" }, 201));
      const deps = withBot(fetcher);
      expect(deps.botId).toBe(BOT);
      expect(await deps.discord("POST", `/guilds/${GUILD}/channels`, { body: { name: "question-brennos" }, reason: "Ticket ouvert : « Question »" })).toEqual({ status: 201, body: { id: "1" } });
      expect(sent[0]).toMatchObject({ url: `${DISCORD_API}/guilds/${GUILD}/channels`, method: "POST", body: { name: "question-brennos" } });
      expect(sent[0]?.headers["authorization"]).toBe(`Bot ${token()}`);
      expect(sent[0]?.headers["user-agent"]).toMatch(/^DiscordBot \(https:\/\/les-gaulois\.github\.io, /);
      expect(sent[0]?.headers["content-type"]).toBe("application/json");
      expect(decodeURIComponent(sent[0]?.headers["x-audit-log-reason"] ?? "")).toBe("Ticket ouvert : « Question »");
      // Sans corps, ni type de contenu ni corps.
      await deps.discord("DELETE", "/channels/1");
      expect(sent[1]?.headers["content-type"]).toBeUndefined();
      expect(sent[1]?.body).toBeNull();
    });

    it("n'appelle rien sans jeton lisible, et le webhook d'une interaction part sans le jeton du robot", async () => {
      const { sent, fetcher } = server(() => json({}));
      for (const deps of [liveDeps(env({}), fetcher), withBot(fetcher, "pas-un-jeton")]) {
        expect(deps.botId).toBe("");
        expect(await deps.discord("GET", "/users/@me")).toBeNull();
        expect(await deps.botAccepted()).toBe(false);
      }
      expect(sent).toEqual([]);
      const deps = withBot(fetcher);
      expect(await deps.webhook("PATCH", `/webhooks/${BOT}/jeton-de-l-interaction/messages/@original`, { body: { content: "ok" } })).toEqual({ status: 200, body: {} });
      expect(sent[0]?.url).toBe(`${DISCORD_API}/webhooks/${BOT}/jeton-de-l-interaction/messages/@original`);
      expect(sent[0]?.headers["authorization"]).toBeUndefined();
      // Le webhook n'appelle que des webhooks.
      expect(await deps.webhook("GET", "/users/@me")).toBeNull();
      expect(sent).toHaveLength(1);
    });

    it("repart une fois si Discord demande d'attendre un peu, sauf pour un appel pressé", async () => {
      vi.useFakeTimers();
      const quiet = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        let answers = [json({ retry_after: 0.25 }, 429), json({ id: "1" })];
        const { sent, fetcher } = server(() => answers.shift() ?? json({}, 500));
        const deps = withBot(fetcher);
        const call = deps.discord("GET", "/channels/1");
        await vi.advanceTimersByTimeAsync(250);
        expect(await call).toEqual({ status: 200, body: { id: "1" } });
        expect(sent).toHaveLength(2);
        // Pressé, ou une attente trop longue : la réponse 429 revient telle quelle.
        answers = [json({ retry_after: 0.25 }, 429)];
        expect((await deps.discord("GET", "/channels/1", { timeoutMs: 1200 }))?.status).toBe(429);
        answers = [json({ retry_after: 30 }, 429)];
        expect((await deps.discord("GET", "/channels/1"))?.status).toBe(429);
        expect(sent).toHaveLength(4);
      } finally {
        quiet.mockRestore();
        vi.useRealTimers();
      }
    });

    it("demande à Discord s'il accepte le jeton au plus une fois toutes les dix minutes", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const start = Date.parse("2026-11-12T22:00:00Z");
        vi.setSystemTime(start);
        const { sent, fetcher } = server(() => json({ id: BOT, bot: true }));
        expect(await withBot(fetcher).botAccepted()).toBe(true);
        // Une fonction neuve sert chaque requête : la réponse est gardée hors d'elle.
        expect(await withBot(fetcher).botAccepted()).toBe(true);
        expect(sent.map((s) => s.url)).toEqual([`${DISCORD_API}/users/@me`]);
        vi.setSystemTime(start + 10 * 60_000);
        expect(await withBot(fetcher).botAccepted()).toBe(true);
        expect(sent).toHaveLength(2);
        // Le jeton d'une autre application, comme celle des images de bienvenue : refusé sans rien demander.
        const before = sent.length;
        expect(await liveDeps(env({ [BOT_TOKEN_SECRET]: token("135792468013579246") }), fetcher).botAccepted()).toBe(false);
        expect(sent).toHaveLength(before);
        // Un jeton refusé, ou celui d'un autre robot.
        expect(await withBot(server(() => json({ message: "401: Unauthorized" }, 401)).fetcher).botAccepted()).toBe(false);
        expect(await withBot(server(() => json({ id: "135792468013579246" })).fetcher).botAccepted()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("fait durer une tâche après la réponse, et note son erreur", async () => {
      const logs: string[] = [];
      const quiet = vi.spyOn(console, "log").mockImplementation((message: string) => void logs.push(message));
      const kept: Promise<unknown>[] = [];
      const global = globalThis as unknown as { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } };
      global.EdgeRuntime = { waitUntil: (promise) => void kept.push(promise) };
      try {
        const deps = liveDeps(env({}), server(() => json({})).fetcher);
        deps.background(Promise.reject(new Error("salon introuvable")));
        expect(kept).toHaveLength(1);
        await kept[0];
        expect(logs).toEqual(["code-discord : tâche de fond : salon introuvable"]);
      } finally {
        delete global.EdgeRuntime;
        quiet.mockRestore();
      }
    });

    it("ne note jamais le jeton du robot ni celui d'une interaction dans ses journaux", async () => {
      const logs: string[] = [];
      const quiet = vi.spyOn(console, "log").mockImplementation((message: string) => void logs.push(message));
      try {
        const deps = withBot(server(() => json({ message: "Missing Permissions", code: 50013 }, 403)).fetcher);
        await deps.discord("POST", "/channels/1/messages", { body: { content: "x" } });
        await deps.webhook("PATCH", `/webhooks/${BOT}/jeton-tres-secret/messages/@original?with_components=true`, { body: {} });
        await withBot(server(() => new Error("réseau")).fetcher).webhook("POST", `/webhooks/${BOT}/jeton-tres-secret`);
      } finally {
        quiet.mockRestore();
      }
      expect(logs).toEqual([
        "code-discord : Discord POST /channels/1/messages : 403",
        `code-discord : Discord PATCH /webhooks/${BOT}/…/messages/@original : 403`,
        `code-discord : Discord POST /webhooks/${BOT}/… injoignable : Error`,
      ]);
      for (const line of logs) {
        expect(line).not.toContain(token());
        expect(line).not.toContain("jeton-tres-secret");
      }
      expect(pathForLog(`/webhooks/${BOT}/a.b-c_d/messages/1`)).toBe(`/webhooks/${BOT}/…/messages/1`);
      // Ni le joueur d'un ticket, ni un compte : leurs numéros ne vont pas au journal.
      expect(pathForLog(`/channels/1/permissions/${PLAYER}`)).toBe("/channels/1/permissions/…");
      expect(pathForLog(`/users/${PLAYER}`)).toBe("/users/…");
    });

    it("ne note pas non plus le numéro du membre dont un rôle change", async () => {
      const logs: string[] = [];
      const quiet = vi.spyOn(console, "log").mockImplementation((message: string) => void logs.push(message));
      try {
        await withBot(server(() => json({ code: 50013 }, 403)).fetcher).discord("PUT", `/guilds/${GUILD}/members/${PLAYER}/roles/${OTHER_ROLE}`, { reason: ROLE_AUDIT_REASON });
      } finally {
        quiet.mockRestore();
      }
      expect(logs).toEqual([`code-discord : Discord PUT /guilds/${GUILD}/members/…/roles/${OTHER_ROLE} : 403`]);
      expect(pathForLog(`/guilds/${GUILD}/members/${PLAYER}`)).toBe(`/guilds/${GUILD}/members/…`);
      // Ni un compte, ni ses droits dans un salon ; « @me » et les autres numéros restent.
      expect(pathForLog(`/users/${PLAYER}`)).toBe("/users/…");
      expect(pathForLog(`/channels/${CHANNEL}/permissions/${PLAYER}`)).toBe(`/channels/${CHANNEL}/permissions/…`);
      expect(pathForLog("/users/@me")).toBe("/users/@me");
    });

    it("joint un fichier en plusieurs parties, son JSON à part, sans écrire le type de contenu à la main", async () => {
      const sent: { headers: Record<string, string>; body: unknown }[] = [];
      const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
        sent.push({ headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body });
        return json({ id: "1" });
      }) as typeof fetch;
      const deps = withBot(fetcher);
      const reply = await deps.discord("POST", `/channels/${CHANNEL}/messages`, { body: panelMessage("d"), files: [{ name: PANEL_FILE, type: "image/png", bytes: PNG }] });
      expect(reply).toEqual({ status: 200, body: { id: "1" } });
      expect(sent[0]?.headers["content-type"]).toBeUndefined();
      expect(sent[0]?.headers["authorization"]).toBe(`Bot ${token()}`);
      const form = sent[0]?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(JSON.parse(String(form.get("payload_json")))).toEqual(panelMessage("d"));
      const file = form.get("files[0]") as File;
      expect(file.name).toBe(PANEL_FILE);
      expect(file.type).toBe("image/png");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
      // Sans fichier, rien ne change : du JSON.
      await deps.discord("POST", `/channels/${CHANNEL}/messages`, { body: { content: "x" }, files: [] });
      expect(sent[1]?.headers["content-type"]).toBe("application/json");
      expect(sent[1]?.body).toBe('{"content":"x"}');
    });
  });

  describe("l'image du panneau des rôles, lue sur le site", () => {
    it("lit un PNG du site, et seulement un PNG du site", async () => {
      const png = (status = 200, type = "image/png") => new Response(PNG, { status, headers: { "content-type": type } });
      const quiet = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        const ok = server(() => png());
        expect(await liveDeps(env({}), ok.fetcher).siteImage("/commandes/roles.png?v=abc")).toEqual(PNG);
        expect(ok.sent[0]?.url).toBe(`${SITE_URL}/commandes/roles.png?v=abc`);
        for (const path of ["https://ailleurs.example/x.png", "//ailleurs.example/x.png", "/commandes/../x.png"]) {
          const outside = server(() => png());
          expect(await liveDeps(env({}), outside.fetcher).siteImage(path), path).toBeNull();
          expect(outside.sent).toEqual([]);
        }
        expect(await liveDeps(env({}), server(() => png(404)).fetcher).siteImage("/commandes/roles.png")).toBeNull();
        expect(await liveDeps(env({}), server(() => png(200, "text/html")).fetcher).siteImage("/commandes/roles.png")).toBeNull();
        expect(await liveDeps(env({}), server(() => new Error("réseau")).fetcher).siteImage("/commandes/roles.png")).toBeNull();
      } finally {
        quiet.mockRestore();
      }
    });
  });
});
