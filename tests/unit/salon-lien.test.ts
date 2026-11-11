import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { checkSalons, chooseLink, DIRECTION_TIMEOUT_MS, probeWebhook, readDirectionLinks, safeWebhookName, salonLink, type DirectionCall, type NoteCall } from "../../src/lib/salon-lien";

const NEWS = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz";
const STAFF = "https://discord.com/api/webhooks/223456789012345678/zyxwvutsrqponmlkjihgfedcba";
const OLD = "https://discord.com/api/webhooks/323456789012345678/ancienancienancienancien";
const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_x", DISCORD_WEBHOOK_GAZETTE: ` ${OLD}\n`, DISCORD_WEBHOOK_ENCADREMENT: "" };
const answering = (data: unknown): DirectionCall => async () => data;
const failing = (message: string): DirectionCall => async () => {
  throw new Error(message);
};

describe("chooseLink", () => {
  it("prend le lien de la Direction d'abord, sinon le secret, sinon rien", () => {
    expect(chooseLink("nouvelles", { nouvelles: NEWS }, OLD)).toEqual({ link: NEWS, source: "direction" });
    expect(chooseLink("nouvelles", { nouvelles: null }, ` ${OLD} `)).toEqual({ link: OLD, source: "secret" });
    expect(chooseLink("nouvelles", null, OLD)).toEqual({ link: OLD, source: "secret" });
    expect(chooseLink("encadrement", { nouvelles: NEWS }, "  ")).toEqual({ link: null, source: "none" });
  });
});

describe("readDirectionLinks", () => {
  it("sans Supabase, ne lit rien et ne prévient pas", async () => {
    expect(await readDirectionLinks(undefined, "k", answering({}))).toEqual({ links: null, warning: null });
  });
  it("garde un lien de webhook, et rien d'autre", async () => {
    expect(await readDirectionLinks("u", "k", answering({ nouvelles: NEWS, encadrement: "https://pirate.test/x" }))).toEqual({ links: { nouvelles: NEWS, encadrement: null }, warning: null });
  });
  it("un Supabase muet laisse le secret servir au bout de dix secondes, sans faire attendre l'étape jusqu'à son délai", async () => {
    vi.useFakeTimers();
    try {
      const pending = readDirectionLinks("u", "k", () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(DIRECTION_TIMEOUT_MS);
      expect(await pending).toEqual({ links: null, warning: "liens de la Direction illisibles (pas de réponse en 10 s) : le secret GitHub sert de lien" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("une panne ou une fonction absente laisse le secret servir, avec un avertissement sans aucun lien", async () => {
    const down = await readDirectionLinks("u", "k", failing(`Could not find the function robot_discord_salons ${NEWS}`));
    expect(down.links).toBeNull();
    expect(down.warning).toContain("le secret GitHub sert de lien");
    expect(down.warning).not.toContain("webhooks");
    expect((await readDirectionLinks("u", "k", answering([NEWS]))).warning).toContain("illisible");
  });
});

describe("salonLink", () => {
  it("lit la Direction avec la clé de service, puis choisit", async () => {
    const call = vi.fn(answering({ nouvelles: NEWS, encadrement: null }));
    expect(await salonLink("nouvelles", ENV, call)).toEqual({ link: NEWS, source: "direction", warning: null });
    expect(call).toHaveBeenCalledWith("https://x.supabase.co", "sb_secret_x");
    expect(await salonLink("encadrement", ENV, call)).toEqual({ link: null, source: "none", warning: null });
  });
  it("sans réglage dans la Direction, garde le secret, nettoyé de ses espaces", async () => {
    expect(await salonLink("nouvelles", ENV, answering({ nouvelles: null, encadrement: null }))).toEqual({ link: OLD, source: "secret", warning: null });
    expect((await salonLink("nouvelles", ENV, failing("panne"))).link).toBe(OLD);
  });
});

describe("probeWebhook", () => {
  const response = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
  const probe = async (status: number | "panne", source: "direction" | "secret" = "direction", link = NEWS) => {
    const logs: string[] = [];
    const get = vi.fn(async () => (status === "panne" ? Promise.reject(new Error(link)) : response(status, { name: "Le Gaulois <@everyone>", token: "secret" })));
    const result = await probeWebhook("nouvelles", { link, source, warning: null }, get as unknown as typeof fetch, (l) => logs.push(l));
    return { result, logs, get };
  };
  it("lit le webhook sans rien poster, sans suivre de redirection, et dit son nom", async () => {
    const { result, logs, get } = await probe(200);
    expect(result).toEqual({ status: 200, name: "Le Gaulois everyone" });
    expect(get).toHaveBeenCalledWith(NEWS, { method: "GET", redirect: "error" });
    expect(logs).toEqual(["Salon des nouvelles : le webhook « Le Gaulois everyone » répond (lien réglé dans la Direction)."]);
  });
  it("un webhook supprimé laisse un avertissement qui dit quoi faire, sans jamais écrire le lien", async () => {
    const { result, logs } = await probe(404, "secret");
    expect(result).toEqual({ status: 404, name: null });
    expect(logs[0]).toContain("::warning::Salon des nouvelles : Discord ne connaît pas ce lien (HTTP 404)");
    expect(logs[0]).toContain("Direction > Discord, ou remplacez le secret DISCORD_WEBHOOK_GAZETTE");
    for (const status of [404, 500, "panne"] as const) for (const line of (await probe(status)).logs) expect(line).not.toContain("abcdefghij");
    expect((await probe("panne")).result).toEqual({ status: 0, name: null });
  });
  it("un lien mal formé n'est pas demandé à Discord", async () => {
    const { result, get, logs } = await probe(200, "secret", "https://pirate.test/api/webhooks/1/2");
    expect(result).toEqual({ status: null, name: null });
    expect(get).not.toHaveBeenCalled();
    expect(logs[0]).toContain("n'a pas la forme d'un webhook");
  });
  it("garde du nom les lettres, les chiffres et la ponctuation simple", () => {
    expect(safeWebhookName("**Le** [Gaulois] ✓")).toBe("Le Gaulois");
    expect(safeWebhookName(42)).toBe("");
  });
});

describe("checkSalons", () => {
  const setup = (statuses: Record<string, number>, call: DirectionCall = answering({ nouvelles: NEWS, encadrement: null })) => {
    const logs: string[] = [];
    const noted: Parameters<NoteCall>[2][] = [];
    const note: NoteCall = async (_url, _key, args) => {
      noted.push(args);
    };
    const get = vi.fn(async (url: string) => new Response(JSON.stringify({ name: "Le Gaulois" }), { status: statuses[url] ?? 404 }));
    return { logs, noted, run: (env: Record<string, string | undefined> = { ...ENV, DISCORD_WEBHOOK_ENCADREMENT: STAFF }) => checkSalons({ env, fetch: get as unknown as typeof fetch, log: (l) => logs.push(l), call, note }) };
  };
  it("contrôle les deux salons et note pour la Direction d'où venait le lien et ce qu'a répondu Discord", async () => {
    const { run, noted } = setup({ [NEWS]: 200, [STAFF]: 200 });
    expect(await run()).toBe(true);
    expect(noted).toEqual([
      { p_salon: "nouvelles", p_source: "direction", p_status: 200, p_name: "Le Gaulois" },
      { p_salon: "encadrement", p_source: "secret", p_status: 200, p_name: "Le Gaulois" },
    ]);
  });
  it("un webhook supprimé fait échouer l'étape, et se note quand même", async () => {
    const { run, noted } = setup({ [STAFF]: 200 });
    expect(await run()).toBe(false);
    expect(noted[0]).toEqual({ p_salon: "nouvelles", p_source: "direction", p_status: 404, p_name: null });
  });
  it("un salon sans aucun lien se note sans rien demander à Discord", async () => {
    const { run, noted } = setup({ [NEWS]: 200 });
    expect(await run(ENV)).toBe(true);
    expect(noted[1]).toEqual({ p_salon: "encadrement", p_source: "none", p_status: null, p_name: null });
  });
  it("sans lecture de la Direction, contrôle avec les secrets mais ne note rien : la source serait peut-être fausse", async () => {
    const { run, noted, logs } = setup({ [OLD]: 200, [STAFF]: 200 }, failing("panne"));
    expect(await run()).toBe(true);
    expect(noted).toEqual([]);
    expect(logs[0]).toContain("::warning::Salons Discord : liens de la Direction illisibles");
  });
});

describe("la migration des salons", () => {
  const SQL = readFileSync("supabase/migrations/20261111000300_salons_discord.sql", "utf8");
  const CALLS = readFileSync("supabase/migrations/20261111000100_appels_sur_discord.sql", "utf8");
  it("range les liens sous la même forme que celui des appels", () => {
    const pattern = /webhook_url text not null check \(webhook_url ~ '([^']+)'\)/;
    expect(SQL.match(pattern)?.[1]).toBe(CALLS.match(pattern)?.[1]);
  });
  it("ne retire rien, et réserve les liens du robot à la clé de service", () => {
    expect(SQL).not.toMatch(/\b(drop|truncate)\b/i);
    expect(SQL).toContain("grant execute on function public.robot_discord_salons() to service_role;");
    expect(SQL).toContain("grant execute on function public.note_discord_salon(text, text, integer, text) to service_role;");
    expect(SQL).not.toMatch(/grant execute on function public\.(robot_discord_salons|note_discord_salon)\([^)]*\) to (authenticated|anon)/);
    expect(SQL).not.toMatch(/to anon\b/);
  });
  it("retire à tout le monde chaque fonction qu'elle crée, avant de rouvrir les seules prévues", () => {
    const created = [...SQL.matchAll(/create or replace function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!);
    expect(created).toHaveLength(7);
    for (const name of created) expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
  });
  it("ne laisse régler les salons qu'aux admins et au fondateur, et ne rend jamais le lien à la page", () => {
    const body = (name: string) => SQL.slice(SQL.indexOf(`create or replace function public.${name}(`), SQL.indexOf("end $$;", SQL.indexOf(`create or replace function public.${name}(`)));
    for (const name of ["get_discord_salons", "save_discord_salon", "test_discord_salon", "clear_discord_salon"]) expect(body(name), name).toContain("internal.require_rank(3)");
    const read = body("get_discord_salons");
    expect(read).not.toMatch(/'webhook_url'|'link'|'url'/);
    // Le jeton est retiré du détail d'une erreur.
    expect(read).toContain("split_part(v_hook.webhook_url, '/', 7)");
  });
  it("ferme les deux tables, comme celle des appels", () => {
    for (const table of ["internal.discord_salons", "internal.discord_salon_checks"]) {
      expect(SQL).toContain(`alter table ${table} enable row level security;`);
      expect(SQL).toContain(`revoke all on ${table} from public, anon, authenticated;`);
    }
  });
});

describe("le salon des victoires", () => {
  const WINS = "https://discord.com/api/webhooks/423456789012345678/victoiresvictoiresvictoires";
  const SECRET = "https://discord.com/api/webhooks/523456789012345678/secretsecretsecretsecretse";
  it("un serveur sans sa migration ne le connaît pas : le robot prend le secret DISCORD_WEBHOOK_VICTOIRES", async () => {
    const before = answering({ nouvelles: NEWS, encadrement: null });
    expect((await readDirectionLinks("u", "k", before)).links).toEqual({ nouvelles: NEWS, encadrement: null });
    expect(await salonLink("victoires", { ...ENV, DISCORD_WEBHOOK_VICTOIRES: SECRET }, before)).toEqual({ link: SECRET, source: "secret", warning: null });
    expect(await salonLink("victoires", ENV, before)).toEqual({ link: null, source: "none", warning: null });
  });
  it("réglé dans la Direction, son lien passe avant le secret", async () => {
    const after = answering({ nouvelles: NEWS, encadrement: null, victoires: WINS });
    expect(await salonLink("victoires", { ...ENV, DISCORD_WEBHOOK_VICTOIRES: SECRET }, after)).toEqual({ link: WINS, source: "direction", warning: null });
  });
  it("le contrôle du passage ne le note pour la Direction que si le serveur le connaît", async () => {
    const run = async (call: DirectionCall) => {
      const logs: string[] = [];
      const noted: Parameters<NoteCall>[2][] = [];
      const get = vi.fn(async () => new Response(JSON.stringify({ name: "Victoires" }), { status: 200 }));
      const fine = await checkSalons({ env: { ...ENV, DISCORD_WEBHOOK_VICTOIRES: SECRET }, fetch: get as unknown as typeof fetch, log: (l) => logs.push(l), call, note: async (_u, _k, args) => void noted.push(args) });
      return { fine, logs, noted, get };
    };
    const before = await run(answering({ nouvelles: NEWS, encadrement: null }));
    expect(before.fine).toBe(true);
    expect(before.get).toHaveBeenCalledWith(SECRET, { method: "GET", redirect: "error" });
    expect(before.noted.map((n) => n.p_salon)).toEqual(["nouvelles", "encadrement"]);
    expect(before.logs.join("\n")).toContain("Salon des victoires : le serveur du site ne connaît pas encore ce salon");
    expect(before.logs.join("\n")).not.toContain("::warning::Salon des victoires");
    const after = await run(answering({ nouvelles: NEWS, encadrement: null, victoires: WINS }));
    expect(after.noted.at(-1)).toEqual({ p_salon: "victoires", p_source: "direction", p_status: 200, p_name: "Victoires" });
  });
});

describe("la migration du salon des victoires", () => {
  const SQL = readFileSync("supabase/migrations/20261111000500_salon_des_victoires.sql", "utf8");
  const FIRST = readFileSync("supabase/migrations/20261111000300_salons_discord.sql", "utf8");
  /** Le texte hors des corps de fonction : ce qui s'exécute au moment de coller la migration. */
  const outside = SQL.split("$$").filter((_, i) => i % 2 === 0).join(" ");
  it("n'efface aucune ligne : ses seuls « drop » retirent les deux anciens contrôles des salons, aussitôt remplacés", () => {
    expect(SQL).not.toMatch(/\b(truncate|drop\s+(table|column|function|schema|policy))\b/i);
    expect(outside).not.toMatch(/\b(delete|update)\b/i);
    expect(outside.match(/\bdrop\b/gi)).toHaveLength(2);
    expect(outside).toContain("alter table internal.discord_salons drop constraint if exists discord_salons_salon_check;");
    expect(outside).toContain("alter table internal.discord_salon_checks drop constraint if exists discord_salon_checks_salon_check;");
  });
  it("permet les trois salons partout où la première migration en listait deux", () => {
    expect(SQL).not.toContain("'nouvelles', 'encadrement')");
    expect(SQL.match(/'nouvelles', 'encadrement', 'victoires'/g)).toHaveLength(FIRST.match(/'nouvelles', 'encadrement'/g)!.length);
    expect(SQL).toContain("'victoires', (select webhook_url from internal.discord_salons where salon = 'victoires')");
  });
  it("remplace les sept fonctions, et repose leurs droits : le robot seul reçoit les liens", () => {
    const created = [...SQL.matchAll(/create or replace function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!);
    expect(created).toEqual([...FIRST.matchAll(/create or replace function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!));
    for (const name of created) expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
    expect(SQL).toContain("grant execute on function public.robot_discord_salons() to service_role;");
    expect(SQL).not.toMatch(/to anon\b/);
    expect(SQL).not.toMatch(/grant execute on function public\.(robot_discord_salons|note_discord_salon)\([^)]*\) to (authenticated|anon)/);
  });
  it("garde le reste des fonctions de la première migration à l'identique", () => {
    const bodies = (sql: string) => sql.split("$$").filter((_, i) => i % 2 === 1).map((b) => b.split("'nouvelles', 'encadrement', 'victoires'").join("'nouvelles', 'encadrement'").replace(/\s*when 'victoires' then [^\n]*\n/, "\n").replace(/\r\n/g, "\n"));
    const before = bodies(FIRST);
    const after = bodies(SQL);
    expect(after).toHaveLength(before.length);
    after.forEach((body, i) => {
      if (body.includes("jsonb_build_object(\n    'nouvelles'")) return;
      expect(body, `fonction ${i + 1}`).toBe(before[i]);
    });
  });
});
