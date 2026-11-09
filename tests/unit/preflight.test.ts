import { describe, expect, it } from "vitest";
import { runPreflight } from "../../src/lib/compte/preflight";

type Route = { status: number; body?: unknown };

/** Un projet Supabase bien réglé. Chaque test en dérègle une partie. */
const HEALTHY: Record<string, Route> = {
  "/auth/v1/settings": { status: 200, body: { external: { discord: true, email: false } } },
  "/rest/v1/rpc/get_site_news": { status: 200, body: { ok: true, weekly_pick: null } },
  "/rest/v1/rpc/save_weekly_pick": { status: 401, body: {} },
  "/rest/v1/rpc/get_member_faces": { status: 401, body: {} },
  "/rest/v1/rpc/bootstrap_founder": { status: 401, body: {} },
  "/rest/v1/rpc/export_site": { status: 401, body: {} },
  "/rest/v1/rpc/get_qg": { status: 401, body: {} },
  "/rest/v1/rpc/get_lobby_calls": { status: 401, body: {} },
  "/rest/v1/rpc/save_lobby_call": { status: 401, body: {} },
  "/rest/v1/rpc/reset_member_link": { status: 401, body: {} },
  "/rest/v1/profiles": { status: 401, body: {} },
  "/rest/v1/private_links": { status: 401, body: {} },
  "/rest/v1/admin_log": { status: 401, body: {} },
  "/rest/v1/clan_roster": { status: 401, body: {} },
  "/rest/v1/site_announcements": { status: 401, body: {} },
  "/rest/v1/polls": { status: 401, body: {} },
  "/rest/v1/app_state": { status: 200, body: [{ value: {} }] },
};

const SITE = "https://exemple.supabase.co";
const seen: { url: string; apikey: string | null }[] = [];

const fakeFetch = (routes: Record<string, Route>) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    seen.push({ url: url.href, apikey: headers.get("apikey") });
    // Avec la clé secrète, la table des profils s'ouvre.
    const route = url.pathname === "/rest/v1/profiles" && headers.get("apikey") === "sb_secret_x" ? { status: 200, body: [{ gaul_number: 1 }] } : routes[url.pathname];
    return new Response(JSON.stringify(route?.body ?? {}), { status: route?.status ?? 404 });
  }) as typeof fetch;

const run = (routes: Record<string, Route> = HEALTHY, secretKey?: string) => runPreflight({ url: `${SITE}/`, publishableKey: "sb_publishable_x", secretKey, fetcher: fakeFetch(routes) });
const statusOf = async (routes: Record<string, Route>, label: string) => (await run(routes)).find((c) => c.label.includes(label))?.status;

describe("le contrôle de la mise en ligne", () => {
  it("passe sur un projet bien réglé", async () => {
    const checks = await run(HEALTHY, "sb_secret_x");
    expect(checks.filter((c) => c.status !== "ok")).toEqual([]);
    expect(checks.length).toBeGreaterThan(8);
  });

  it("n'utilise la clé secrète que si on la donne", async () => {
    const checks = await run();
    expect(checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(checks.at(-1)).toMatchObject({ status: "warn" });
  });

  it("repère une connexion Discord coupée", async () => {
    expect(await statusOf({ ...HEALTHY, "/auth/v1/settings": { status: 200, body: { external: { discord: false } } } }, "Discord")).toBe("fail");
  });

  it("signale l'inscription par e-mail restée active", async () => {
    expect(await statusOf({ ...HEALTHY, "/auth/v1/settings": { status: 200, body: { external: { discord: true, email: true } } } }, "e-mail")).toBe("warn");
  });

  it("repère un schéma absent", async () => {
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_site_news": { status: 404 } }, "schéma")).toBe("fail");
  });

  it("bloque si un visiteur peut se désigner fondateur", async () => {
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/bootstrap_founder": { status: 200, body: { ok: false } } }, "fondateur")).toBe("fail");
  });

  it("bloque si un visiteur peut exporter les données du site", async () => {
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/export_site": { status: 200, body: { ok: true, profiles: [] } } }, "exporter")).toBe("fail");
    expect(await statusOf(HEALTHY, "exporter")).toBe("ok");
  });

  it("repère un serveur sans le Gaulois de la semaine, et bloque si un visiteur peut le choisir", async () => {
    expect(await statusOf(HEALTHY, "Gaulois de la semaine est installé")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_site_news": { status: 200, body: { ok: true } } }, "Gaulois de la semaine est installé")).toBe("fail");
    expect(await statusOf(HEALTHY, "choisit pas")).toBe("ok");
    // Le serveur répond 200 avec un refus : rien n'est choisi.
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_weekly_pick": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "choisit pas")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_weekly_pick": { status: 200, body: { ok: true } } }, "choisit pas")).toBe("fail");
  });

  it("bloque si les photos des membres sortent pour un visiteur", async () => {
    expect(await statusOf(HEALTHY, "photos des membres")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_member_faces": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "photos des membres")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_member_faces": { status: 200, body: { ok: true, faces: [] } } }, "photos des membres")).toBe("fail");
  });

  it("bloque si le QG s'ouvre à un visiteur", async () => {
    expect(await statusOf(HEALTHY, "QG")).toBe("ok");
    // Le serveur répond 200 avec un refus : le QG reste fermé.
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_qg": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "QG")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_qg": { status: 200, body: { ok: true, polls: [], ideas: [], wall: [] } } }, "QG")).toBe("fail");
  });

  it("bloque si un visiteur peut remettre un compte en attente", async () => {
    expect(await statusOf(HEALTHY, "remet pas un compte en attente")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/reset_member_link": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "remet pas un compte en attente")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/reset_member_link": { status: 200, body: { ok: true } } }, "remet pas un compte en attente")).toBe("fail");
  });

  it("bloque si un visiteur voit les appels aux salons ou en lance un", async () => {
    expect(await statusOf(HEALTHY, "voit pas les appels")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_lobby_calls": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "voit pas les appels")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_lobby_calls": { status: 200, body: { ok: true, now: "2026-11-09T20:00:00Z", calls: [] } } }, "voit pas les appels")).toBe("fail");
    expect(await statusOf(HEALTHY, "lance pas d'appel")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_lobby_call": { status: 200, body: { ok: true } } }, "lance pas d'appel")).toBe("fail");
  });

  it("bloque si un visiteur lit une table privée, mais pas si elle est vide", async () => {
    expect(await statusOf({ ...HEALTHY, "/rest/v1/private_links": { status: 200, body: [{ discord_id: "1" }] } }, "private_links")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/private_links": { status: 200, body: [] } }, "private_links")).toBe("ok");
    // Les sondages ne se lisent que par les fonctions : la table elle-même reste fermée.
    expect(await statusOf({ ...HEALTHY, "/rest/v1/polls": { status: 200, body: [{ question: "Quel soir ?" }] } }, "table polls")).toBe("fail");
  });

  it("s'arrête net si la clé publique est une clé secrète, sans rien envoyer", async () => {
    seen.length = 0;
    const checks = await runPreflight({ url: SITE, publishableKey: "sb_secret_oups", fetcher: fakeFetch(HEALTHY) });
    expect(checks).toHaveLength(1);
    expect(checks[0]?.status).toBe("fail");
    expect(seen).toEqual([]);
  });

  it("dit clairement quand le projet ne répond pas", async () => {
    const down = (async () => {
      throw new Error("réseau");
    }) as unknown as typeof fetch;
    const checks = await runPreflight({ url: SITE, publishableKey: "sb_publishable_x", fetcher: down });
    expect(checks).toEqual([expect.objectContaining({ status: "fail" })]);
  });

  it("n'écrit jamais une clé dans ses messages", async () => {
    const checks = await run({ ...HEALTHY, "/rest/v1/profiles": { status: 500 } }, "sb_secret_x");
    expect(JSON.stringify(checks)).not.toContain("sb_secret_x");
    expect(JSON.stringify(checks)).not.toContain("sb_publishable_x");
  });
});
