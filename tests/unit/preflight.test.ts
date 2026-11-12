import { describe, expect, it } from "vitest";
import { CODE_LOGIN_OPEN } from "../../src/lib/compte/connexion-code";
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
  "/rest/v1/rpc/get_discord_calls": { status: 401, body: {} },
  "/rest/v1/rpc/save_discord_calls": { status: 401, body: {} },
  "/rest/v1/rpc/ping_lobby_call": { status: 401, body: {} },
  "/rest/v1/rpc/reset_member_link": { status: 401, body: {} },
  "/rest/v1/profiles": { status: 401, body: {} },
  "/rest/v1/private_links": { status: 401, body: {} },
  "/rest/v1/admin_log": { status: 401, body: {} },
  "/rest/v1/clan_roster": { status: 401, body: {} },
  "/rest/v1/site_announcements": { status: 401, body: {} },
  "/rest/v1/polls": { status: 401, body: {} },
  "/rest/v1/app_state": { status: 200, body: [{ value: {} }] },
  "/storage/v1/bucket/discord-images": { status: 200, body: { id: "discord-images", public: true, file_size_limit: 8388608 } },
  "/functions/v1/code-discord/etat": { status: 200, body: { ok: true, discord: true, service: true, signature: true } },
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

  it("bloque si un visiteur peut lire ou régler les outils du QG", async () => {
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_qg_tools": { status: 200, body: { ok: true, wall: [] } } }, "outils du QG")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_qg_tools": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "outils du QG")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_weekly_goal": { status: 200, body: { ok: true } } }, "objectif")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_voice_channel": { status: 200, body: { ok: true } } }, "salon vocal")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_prediction": { status: 200, body: { ok: true } } }, "pronostic")).toBe("fail");
    expect(await statusOf(HEALTHY, "pronostic")).toBe("ok");
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

  it("bloque si un visiteur peut appeler la connexion par code", async () => {
    expect(await statusOf(HEALTHY, "crée pas de code de connexion")).toBe("ok");
    expect(await statusOf(HEALTHY, "essaie pas de code de connexion")).toBe("ok");
    expect(await statusOf(HEALTHY, "identifiant Discord à un compte")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/discord_code_issue": { status: 200, body: { ok: true } } }, "crée pas de code de connexion")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/discord_code_redeem": { status: 200, body: { ok: false, error: "code_invalid" } } }, "essaie pas de code de connexion")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/discord_code_attach": { status: 200, body: { ok: false } } }, "identifiant Discord à un compte")).toBe("fail");
  });

  it("dit si la fonction code-discord est déployée et réglée, et ne bloque qu'une fois la connexion par code ouverte", async () => {
    expect(await statusOf(HEALTHY, "connexion par code est en place")).toBe("ok");
    const notReady = CODE_LOGIN_OPEN ? "fail" : "warn";
    const absent = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": { status: 404 } });
    expect(absent.find((c) => c.label.includes("connexion par code est en place"))).toMatchObject({ status: notReady, detail: expect.stringContaining("pas encore déployée") });
    const unset = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": { status: 200, body: { ok: true, discord: false, service: true, signature: false } } });
    const check = unset.find((c) => c.label.includes("connexion par code est en place"));
    expect(check?.status).toBe(notReady);
    expect(check?.detail).toContain("clé publique");
    expect(check?.detail).toContain("signatures");
    expect(check?.detail).not.toContain("migration");
    const noBase = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": { status: 200, body: { ok: true, discord: true, service: false, signature: true } } });
    expect(noBase.find((c) => c.label.includes("connexion par code est en place"))?.detail).toContain("migration 20261112000500");
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

  it("bloque si un visiteur lit ou change le réglage des appels sur Discord", async () => {
    expect(await statusOf(HEALTHY, "lit pas le réglage Discord")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_discord_calls": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "lit pas le réglage Discord")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_discord_calls": { status: 200, body: { ok: true, set: true, role: null } } }, "lit pas le réglage Discord")).toBe("fail");
    expect(await statusOf(HEALTHY, "règle pas les appels sur Discord")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_discord_calls": { status: 200, body: { ok: true } } }, "règle pas les appels sur Discord")).toBe("fail");
    expect(await statusOf(HEALTHY, "fait pas de ping")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/ping_lobby_call": { status: 200, body: { ok: true, ping: "sent" } } }, "fait pas de ping")).toBe("fail");
  });

  it("bloque si un visiteur lit ou change le réglage des salons du robot, ou reçoit leurs liens", async () => {
    const salons = {
      ...HEALTHY,
      "/rest/v1/rpc/get_discord_salons": { status: 401, body: {} },
      "/rest/v1/rpc/save_discord_salon": { status: 401, body: {} },
      "/rest/v1/rpc/robot_discord_salons": { status: 401, body: {} },
      "/rest/v1/rpc/note_discord_salon": { status: 401, body: {} },
    };
    for (const label of ["lit pas le réglage des salons", "règle pas les salons", "reçoit pas les liens des salons", "note pas de contrôle des salons"]) expect(await statusOf(salons, label)).toBe("ok");
    expect(await statusOf({ ...salons, "/rest/v1/rpc/get_discord_salons": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "lit pas le réglage des salons")).toBe("ok");
    expect(await statusOf({ ...salons, "/rest/v1/rpc/get_discord_salons": { status: 200, body: { ok: true, salons: [] } } }, "lit pas le réglage des salons")).toBe("fail");
    expect(await statusOf({ ...salons, "/rest/v1/rpc/save_discord_salon": { status: 200, body: { ok: true } } }, "règle pas les salons")).toBe("fail");
    // Un refus de la fonction elle-même ne suffit pas : le droit d'appel doit être fermé.
    expect(await statusOf({ ...salons, "/rest/v1/rpc/robot_discord_salons": { status: 200, body: { nouvelles: null, encadrement: null } } }, "reçoit pas les liens des salons")).toBe("fail");
    expect(await statusOf({ ...salons, "/rest/v1/rpc/note_discord_salon": { status: 200, body: { ok: false } } }, "note pas de contrôle des salons")).toBe("fail");
  });

  it("bloque si un visiteur lit ou envoie un message Discord, ou ajoute un salon", async () => {
    for (const label of ["lit pas les messages Discord", "envoie pas de message Discord", "ajoute pas de salon pour les messages"]) expect(await statusOf(HEALTHY, label)).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_discord_messages": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "lit pas les messages Discord")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_discord_messages": { status: 200, body: { ok: true, salons: [], messages: [] } } }, "lit pas les messages Discord")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/send_discord_message": { status: 200, body: { ok: true, id: 1 } } }, "envoie pas de message Discord")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/add_discord_message_salon": { status: 200, body: { ok: true } } }, "ajoute pas de salon pour les messages")).toBe("fail");
  });

  it("bloque si un visiteur lit l'inventaire d'images ou y garde une image", async () => {
    for (const label of ["lit pas l'inventaire d'images", "garde pas d'image dans l'inventaire"]) expect(await statusOf(HEALTHY, label)).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_discord_images": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "lit pas l'inventaire d'images")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_discord_images": { status: 200, body: { ok: true, images: [] } } }, "lit pas l'inventaire d'images")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_discord_image": { status: 200, body: { ok: true, id: 1 } } }, "garde pas d'image dans l'inventaire")).toBe("fail");
  });

  it("bloque si un visiteur liste les images des messages, et contrôle leur espace avec la clé secrète", async () => {
    expect(await statusOf(HEALTHY, "liste pas les images")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/storage/v1/object/list/discord-images": { status: 200, body: [] } }, "liste pas les images")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/storage/v1/object/list/discord-images": { status: 200, body: [{ name: "0f1e2d3c-4b5a-4978-8796-a5b4c3d2e1f0.png" }] } }, "liste pas les images")).toBe("fail");
    const bucketOf = async (routes: Record<string, Route>) => (await run(routes, "sb_secret_x")).find((c) => c.label.includes("espace des images"))?.status;
    expect(await bucketOf(HEALTHY)).toBe("ok");
    expect(await bucketOf({ ...HEALTHY, "/storage/v1/bucket/discord-images": { status: 404, body: {} } })).toBe("warn");
    expect(await bucketOf({ ...HEALTHY, "/storage/v1/bucket/discord-images": { status: 200, body: { public: false, file_size_limit: 8388608 } } })).toBe("fail");
    // Sans la clé secrète, l'espace n'est pas lu.
    expect((await run()).some((c) => c.label.includes("espace des images"))).toBe(false);
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
