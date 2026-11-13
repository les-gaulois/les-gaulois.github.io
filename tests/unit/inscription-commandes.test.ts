import { describe, expect, it } from "vitest";
import { COMMANDS as SITE_COMMANDS } from "../../src/lib/discord-commande";
import { CLAN_COMMAND, COMMANDS, CONCOURS_COMMAND, FICHE_COMMAND } from "../../supabase/functions/code-discord/definitions";
import { BOT_TOKEN_SECRET, DISCORD_API, liveDeps } from "../../supabase/functions/code-discord/index";
import {
  commandShape,
  COMPARED_COMMAND_KEYS,
  COMPARED_OPTION_KEYS,
  newSyncState,
  RECHECK_MS,
  registerCommands,
  RETRY_MS,
  syncCommands,
  type InscriptionDeps,
} from "../../supabase/functions/code-discord/inscription";

// Des numéros inventés : ni l'application ni le serveur du clan.
const APP = "246813579024681357";
const GUILD = "135790246813579024";
const PATH = `/applications/${APP}/guilds/${GUILD}/commands`;

type Loose = Record<string, unknown>;

/** Le numéro, inventé, que Discord donne à la n-ième commande. */
const idOf = (n: number): string => String(100000000000000000n + BigInt(n));

/** Une option telle que Discord la rend : des champs de plus, et pas de `required` quand il est faux. */
function echoOption(option: Loose): Loose {
  const { required, options, ...rest } = option;
  return {
    ...rest,
    ...(required === true ? { required: true } : {}),
    ...(Array.isArray(options) ? { options: options.map((o) => echoOption(o as Loose)) } : {}),
  };
}

/** Une commande telle que Discord la rend après l'avoir enregistrée (documentation de Discord, « Application Command Object »). */
function echo(command: unknown, id = idOf(1)): Loose {
  const c = command as Loose;
  return {
    id,
    application_id: APP,
    version: "1",
    guild_id: GUILD,
    nsfw: false,
    contexts: null,
    integration_types: [0],
    type: c["type"] ?? 1,
    name: c["name"],
    description: c["description"],
    default_member_permissions: c["default_member_permissions"] ?? null,
    ...(Array.isArray(c["options"]) && c["options"].length > 0 ? { options: (c["options"] as Loose[]).map(echoOption) } : {}),
  };
}

/** Ce que Discord connaît : chaque commande du code, chacune avec son numéro. */
const allKnown = (): Loose[] => COMMANDS.map((c, i) => echo(c, idOf(i + 1)));

interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Reply = { status: number; body: unknown } | null;

/** Un faux Discord : la liste des commandes qu'il connaît ; par défaut, il garde ce qu'on lui envoie et le rend. */
function fakeDiscord(listed: unknown, answer: (method: string, body: unknown) => Reply = (_method, body) => ({ status: 200, body: echo(body) })) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const deps: InscriptionDeps = {
    applicationId: APP,
    guildId: GUILD,
    async discord(method, path, call) {
      calls.push({ method, path, body: call?.body ?? null });
      if (method === "GET") return typeof listed === "function" ? (listed as () => Reply)() : { status: 200, body: listed };
      return answer(method, call?.body);
    },
    log: (message) => logs.push(message),
  };
  return { deps, calls, logs };
}

describe("les définitions des commandes", () => {
  it("sont les mêmes pour le site et pour la fonction", () => {
    expect(SITE_COMMANDS).toBe(COMMANDS);
  });

  it("portent chacune un nom à elle, dans les limites de Discord", () => {
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const command of COMMANDS) {
      expect(command.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(command.type).toBe(1);
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(100);
    }
  });

  it("ont des options dans les limites de Discord : nom, description, au plus 25, les obligatoires d'abord", () => {
    const check = (options: readonly Loose[], where: string): void => {
      expect(options.length, where).toBeLessThanOrEqual(25);
      const required = options.map((o) => o["required"] === true);
      expect(required.indexOf(false) === -1 || required.lastIndexOf(true) < required.indexOf(false), `${where} : obligatoires d'abord`).toBe(true);
      for (const option of options) {
        const name = String(option["name"]);
        expect(name, where).toMatch(/^[a-z0-9_-]{1,32}$/);
        const description = String(option["description"]);
        expect(description.length, `${where} ${name}`).toBeGreaterThan(0);
        expect(description.length, `${where} ${name}`).toBeLessThanOrEqual(100);
        if (Array.isArray(option["options"])) check(option["options"] as Loose[], `${where} ${name}`);
      }
    };
    for (const command of COMMANDS) check(("options" in command ? command.options : []) as readonly Loose[], `/${command.name}`);
  });

  it("n'emploient que des champs que la comparaison regarde : un champ ignoré ne serait jamais mis à jour", () => {
    const checkOptions = (options: readonly Loose[]): void => {
      for (const option of options) {
        for (const key of Object.keys(option)) expect(COMPARED_OPTION_KEYS as readonly string[], `option ${String(option["name"])}`).toContain(key);
        if (Array.isArray(option["options"])) checkOptions(option["options"] as Loose[]);
      }
    };
    for (const command of COMMANDS) {
      for (const key of Object.keys(command)) expect(COMPARED_COMMAND_KEYS as readonly string[], `/${command.name}`).toContain(key);
      checkOptions(("options" in command ? command.options : []) as readonly Loose[]);
    }
  });
});

describe("la forme d'une commande", () => {
  it("est la même dans le code et telle que Discord la rend", () => {
    for (const command of COMMANDS) expect(commandShape(echo(command)), command.name).toBe(commandShape(command));
  });

  it("ne tient pas compte d'un « required » faux écrit ou omis, ni d'un droit absent ou nul", () => {
    const written = { type: 1, name: "essai", description: "Un essai", options: [{ type: 3, name: "mot", description: "Un mot", required: false }] };
    const returned = { type: 1, name: "essai", description: "Un essai", default_member_permissions: null, options: [{ type: 3, name: "mot", description: "Un mot" }] };
    expect(commandShape(returned)).toBe(commandShape(written));
  });

  it("change avec une description, une option ou un droit", () => {
    const base = commandShape(FICHE_COMMAND);
    expect(commandShape({ ...FICHE_COMMAND, description: "Autre chose" })).not.toBe(base);
    expect(commandShape({ ...FICHE_COMMAND, options: [{ ...FICHE_COMMAND.options[0], max_length: 41 }] })).not.toBe(base);
    expect(commandShape({ ...FICHE_COMMAND, options: [{ ...FICHE_COMMAND.options[0], required: false }] })).not.toBe(base);
    expect(commandShape({ ...FICHE_COMMAND, default_member_permissions: "32" })).not.toBe(base);
    expect(commandShape({ ...FICHE_COMMAND, options: [] })).not.toBe(base);
  });
});

describe("l'inscription des commandes", () => {
  it("ne renvoie rien quand Discord a déjà toutes les commandes du code", async () => {
    const { deps, calls, logs } = fakeDiscord(allKnown());
    expect(await registerCommands(deps)).toEqual({ ok: true, sent: [], same: COMMANDS.length });
    expect(calls).toEqual([{ method: "GET", path: PATH, body: null }]);
    expect(logs).toEqual([]);
  });

  it("modifie celle qui a changé (pas une création) et crée celle qui manque, sans en retirer aucune", async () => {
    const fiche = COMMANDS.findIndex((c) => c.name === "fiche");
    const listed = [
      ...allKnown().filter((c) => c["name"] !== "concours" && c["name"] !== "fiche"),
      echo({ ...FICHE_COMMAND, description: "Une ancienne description" }, idOf(fiche + 1)),
      // Une commande que le code ne connaît plus : elle reste.
      echo({ type: 1, name: "ancienne", description: "Une commande d'avant" }, idOf(99)),
    ];
    const { deps, calls, logs } = fakeDiscord(listed, (method, body) => ({ status: 200, body: echo(method === "PATCH" ? { type: 1, ...(body as Loose) } : body) }));
    expect(await registerCommands(deps)).toEqual({ ok: true, sent: ["fiche", "concours"], same: COMMANDS.length - 2 });
    // Tout ce que décrit le code, sauf le type, que Discord ne laisse pas changer.
    const ficheBody = { name: FICHE_COMMAND.name, description: FICHE_COMMAND.description, options: FICHE_COMMAND.options, default_member_permissions: null };
    expect(calls).toEqual([
      { method: "GET", path: PATH, body: null },
      { method: "PATCH", path: `${PATH}/${idOf(fiche + 1)}`, body: ficheBody },
      { method: "POST", path: PATH, body: CONCOURS_COMMAND },
    ]);
    expect(calls.some((c) => c.method === "DELETE" || c.method === "PUT")).toBe(false);
    expect(logs).toEqual(["commandes mises à jour sur Discord : /fiche, /concours"]);
  });

  it("remet à vide, en la modifiant, ce qu'une commande avait de plus que le code", async () => {
    const clan = COMMANDS.findIndex((c) => c.name === "clan");
    const listed = allKnown().map((c) => (c["name"] === "clan" ? echo({ ...CLAN_COMMAND, default_member_permissions: "32", options: [{ type: 3, name: "mot", description: "Un mot" }] }, idOf(clan + 1)) : c));
    const { deps, calls } = fakeDiscord(listed, (_method, body) => ({ status: 200, body: echo({ type: 1, ...(body as Loose) }) }));
    expect((await registerCommands(deps)).ok).toBe(true);
    expect(calls[1]).toEqual({ method: "PATCH", path: `${PATH}/${idOf(clan + 1)}`, body: { name: "clan", description: CLAN_COMMAND.description, options: [], default_member_permissions: null } });
  });

  it("reconnaît une commande à son type et à son nom : un menu du même nom ne la remplace pas", async () => {
    const listed = [...allKnown(), echo({ type: 2, name: "fiche", description: "" }, idOf(50))];
    const { deps, calls } = fakeDiscord(listed);
    expect(await registerCommands(deps)).toEqual({ ok: true, sent: [], same: COMMANDS.length });
    expect(calls).toHaveLength(1);
  });

  it("crée tout sur un serveur qui n'a encore aucune commande", async () => {
    const { deps, calls } = fakeDiscord([]);
    const result = await registerCommands(deps);
    expect(result.ok).toBe(true);
    expect(result.sent).toEqual(COMMANDS.map((c) => c.name));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([...COMMANDS]);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("dit non quand Discord garde une commande autrement que le code : chaque instance la renverrait", async () => {
    const listed = allKnown().filter((c) => c["name"] !== "moi");
    const { deps, logs } = fakeDiscord(listed, (_method, body) => ({ status: 201, body: echo({ ...(body as Loose), description: "Raccourcie par Discord" }) }));
    expect(await registerCommands(deps)).toEqual({ ok: false, sent: ["moi"], same: COMMANDS.length - 1 });
    expect(logs).toEqual(["commande /moi gardée par Discord autrement que dans le code : la comparaison est à revoir (inscription.ts)", "commandes mises à jour sur Discord : /moi"]);
  });

  it("ne crée rien si la liste de Discord ne se lit pas", async () => {
    for (const listed of [() => ({ status: 401, body: { message: "401: Unauthorized" } }), () => null, () => ({ status: 200, body: { pas: "une liste" } })]) {
      const { deps, calls, logs } = fakeDiscord(listed);
      expect(await registerCommands(deps)).toEqual({ ok: false, sent: [], same: 0 });
      expect(calls).toHaveLength(1);
      expect(logs[0]).toMatch(/^commandes de Discord illisibles \((401|injoignable|200)\) : nouvel essai plus tard$/);
    }
  });

  it("s'arrête au premier refus : la fois suivante reprendra", async () => {
    const { deps, calls, logs } = fakeDiscord([], () => ({ status: 400, body: { code: 50035 } }));
    expect(await registerCommands(deps)).toEqual({ ok: false, sent: [], same: 0 });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(logs).toEqual([`commande /${COMMANDS[0].name} refusée par Discord (400) : nouvel essai plus tard`]);
  });

  it("crée plutôt que de modifier une commande dont Discord ne donne pas un numéro lisible", async () => {
    const listed = allKnown().map((c) => (c["name"] === "carte" ? { ...echo({ ...(c as Loose), description: "Ancienne" }), id: "../../autre" } : c));
    const { deps, calls } = fakeDiscord(listed);
    expect((await registerCommands(deps)).ok).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET ${PATH}`, `POST ${PATH}`]);
  });
});

describe("le rythme des comparaisons, dans une même instance", () => {
  const T0 = Date.parse("2026-11-13T10:00:00Z");

  it("compare une fois, puis attend six heures après une réussite", async () => {
    const { deps, calls } = fakeDiscord(allKnown());
    const state = newSyncState();
    expect(await syncCommands(state, T0, deps)).toBe(true);
    expect(await syncCommands(state, T0 + RECHECK_MS - 1, deps)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(await syncCommands(state, T0 + RECHECK_MS, deps)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("réessaie cinq minutes après un échec", async () => {
    let up = false;
    const { deps, calls } = fakeDiscord(() => (up ? { status: 200, body: allKnown() } : null));
    const state = newSyncState();
    expect(await syncCommands(state, T0, deps)).toBe(false);
    up = true;
    expect(await syncCommands(state, T0 + RETRY_MS - 1, deps)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(await syncCommands(state, T0 + RETRY_MS, deps)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("deux appels en même temps attendent la même comparaison", async () => {
    const { deps, calls } = fakeDiscord(allKnown());
    const state = newSyncState();
    const [a, b] = await Promise.all([syncCommands(state, T0, deps), syncCommands(state, T0, deps)]);
    expect([a, b]).toEqual([true, true]);
    expect(calls).toHaveLength(1);
  });

  it("une erreur imprévue se dit au journal, sans rien casser", async () => {
    const logs: string[] = [];
    const deps: InscriptionDeps = {
      applicationId: APP,
      guildId: GUILD,
      discord: async () => {
        throw new Error("panne");
      },
      log: (message) => logs.push(message),
    };
    expect(await syncCommands(newSyncState(), T0, deps)).toBe(false);
    expect(logs).toEqual(["inscription des commandes : panne"]);
  });
});

describe("dans la fonction", () => {
  // Un faux jeton, fabriqué ici pour n'avoir dans le fichier aucun texte qui ressemble à un vrai.
  const token = (id: string) => [btoa(id).replace(/=+$/, ""), "Fabcde", "s".repeat(30)].join(".");
  const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });

  /** Un faux Discord derrière `fetch` : la liste connue ; il garde ce qu'on lui envoie et le rend. */
  function server(listed: unknown[]) {
    const sent: { url: string; method: string; auth: string | null; body: unknown }[] = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      sent.push({ url: String(input), method, auth: headers["authorization"] ?? null, body });
      return new Response(JSON.stringify(method === "GET" ? listed : echo(body)), { status: method === "GET" ? 200 : 201 });
    }) as typeof fetch;
    return { sent, fetcher };
  }

  it("inscrit les commandes avec le jeton de « Le Gaulois », sur le serveur du clan, puis attend", async () => {
    const { sent, fetcher } = server(allKnown().filter((c) => c["name"] !== "concours"));
    const values = { [BOT_TOKEN_SECRET]: token(APP), DISCORD_APPLICATION_ID: APP, DISCORD_GUILD_ID: GUILD };
    expect(await liveDeps(env(values), fetcher).commandSync?.()).toBe(true);
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${DISCORD_API}${PATH}`, `POST ${DISCORD_API}${PATH}`]);
    expect(sent[1]?.body).toEqual(CONCOURS_COMMAND);
    expect(sent.every((s) => s.auth === `Bot ${token(APP)}`)).toBe(true);
    // La même instance ne redemande rien avant six heures, même par une autre requête.
    expect(await liveDeps(env(values), fetcher).commandSync?.()).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("n'inscrit rien sans jeton, ni avec celui d'un autre robot", async () => {
    const { sent, fetcher } = server([]);
    const cases: Record<string, string>[] = [{}, { [BOT_TOKEN_SECRET]: "pas-un-jeton", DISCORD_APPLICATION_ID: APP }, { [BOT_TOKEN_SECRET]: token("222222222222222299"), DISCORD_APPLICATION_ID: APP }];
    for (const values of cases) {
      expect(await liveDeps(env(values), fetcher).commandSync?.()).toBe(false);
    }
    expect(sent).toEqual([]);
  });
});
