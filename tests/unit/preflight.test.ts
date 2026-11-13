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
  "/rest/v1/rpc/get_site_activity": { status: 401, body: {} },
  "/rest/v1/rpc/get_mon_gaulois": { status: 401, body: {} },
  "/rest/v1/rpc/get_mes_stateres": { status: 401, body: {} },
  "/rest/v1/rpc/get_ma_boutique": { status: 401, body: {} },
  "/rest/v1/rpc/get_marche": { status: 401, body: {} },
  "/rest/v1/rpc/get_village_economie": { status: 401, body: {} },
  "/rest/v1/profiles": { status: 401, body: {} },
  "/rest/v1/private_links": { status: 401, body: {} },
  "/rest/v1/admin_log": { status: 401, body: {} },
  "/rest/v1/clan_roster": { status: 401, body: {} },
  "/rest/v1/site_announcements": { status: 401, body: {} },
  "/rest/v1/polls": { status: 401, body: {} },
  "/rest/v1/app_state": { status: 200, body: [{ value: {} }] },
  "/storage/v1/bucket/discord-images": { status: 200, body: { id: "discord-images", public: true, file_size_limit: 8388608 } },
  "/functions/v1/code-discord/etat": { status: 200, body: { ok: true, discord: true, service: true, signature: true, robot: true, concours: true, inscription: true } },
};

/** Ce qui s'ouvre avec la clé secrète, et à elle seule : la table des profils, la lecture des parties notées pour les statères. */
const SECRET: Record<string, Route> = {
  "/rest/v1/profiles": { status: 200, body: [{ gaul_number: 1 }] },
  "/rest/v1/rpc/stateres_parties_notees": { status: 200, body: { ok: true, parties: [] } },
};

const SITE = "https://exemple.supabase.co";
const seen: { url: string; apikey: string | null; body: string | null }[] = [];

const fakeFetch = (routes: Record<string, Route>, secret: Record<string, Route> = SECRET) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    seen.push({ url: url.href, apikey: headers.get("apikey"), body: typeof init?.body === "string" ? init.body : null });
    const route = headers.get("apikey") === "sb_secret_x" && Object.hasOwn(secret, url.pathname) ? secret[url.pathname] : routes[url.pathname];
    return new Response(JSON.stringify(route?.body ?? {}), { status: route?.status ?? 404 });
  }) as typeof fetch;

const run = (routes: Record<string, Route> = HEALTHY, secretKey?: string, secret: Record<string, Route> = SECRET) => runPreflight({ url: `${SITE}/`, publishableKey: "sb_publishable_x", secretKey, fetcher: fakeFetch(routes, secret) });
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

  it("bloque si un visiteur peut retrouver le pseudo d'un compte Discord, la fonction de /moi", async () => {
    expect(await statusOf(HEALTHY, "pseudo d'un compte Discord")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/discord_moi": { status: 200, body: { ok: false, error: "not_member" } } }, "pseudo d'un compte Discord")).toBe("fail");
  });

  it("bloque si un visiteur peut retrouver le Gaulois d'un compte Discord, la fonction de /gaulois", async () => {
    expect(await statusOf(HEALTHY, "Gaulois d'un compte Discord")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/discord_gaulois": { status: 200, body: { ok: false, error: "no_account" } } }, "Gaulois d'un compte Discord")).toBe("fail");
  });

  it("bloque si un visiteur lit un Gaulois, et signale le vestiaire pas encore installé", async () => {
    expect(await statusOf(HEALTHY, "ne lit pas de Gaulois")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_mon_gaulois": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "ne lit pas de Gaulois")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_mon_gaulois": { status: 200, body: { ok: true, tenue: null } } }, "ne lit pas de Gaulois")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_mon_gaulois": { status: 404, body: {} } }, "vestiaire du village")).toBe("warn");
  });

  it("bloque si un visiteur lit un solde de statères, et signale les statères pas encore installés", async () => {
    expect(await statusOf(HEALTHY, "ne lit pas de solde de statères")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_mes_stateres": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "ne lit pas de solde de statères")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_mes_stateres": { status: 200, body: { ok: true, solde: 0 } } }, "ne lit pas de solde de statères")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_mes_stateres": { status: 404, body: {} } }, "statères du village sont installés")).toBe("warn");
  });

  it("bloque si un visiteur peut appeler les fonctions des statères réservées à la clé de service", async () => {
    expect(await statusOf(HEALTHY, "ne donne pas de statères")).toBe("ok");
    expect(await statusOf(HEALTHY, "parties notées pour les statères")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/noter_victoires_stateres": { status: 401, body: {} }, "/rest/v1/rpc/stateres_parties_notees": { status: 403, body: {} } }, "ne donne pas de statères")).toBe("ok");
    // Un refus de la fonction elle-même ne suffit pas : le droit d'appel doit être fermé.
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/noter_victoires_stateres": { status: 200, body: { ok: false, error: "invalid_parties" } } }, "ne donne pas de statères")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/noter_victoires_stateres": { status: 200, body: { ok: true, notees: 0 } } }, "ne donne pas de statères")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/stateres_parties_notees": { status: 200, body: { ok: true, parties: [] } } }, "parties notées pour les statères")).toBe("fail");
  });

  it("appelle les fonctions des statères sans rien pouvoir noter, et les trois à chaque contrôle", async () => {
    seen.length = 0;
    await run();
    const appels = seen.filter((s) => /stateres/.test(s.url));
    expect(appels.map((s) => new URL(s.url).pathname).sort()).toEqual(["/rest/v1/rpc/get_mes_stateres", "/rest/v1/rpc/noter_victoires_stateres", "/rest/v1/rpc/stateres_parties_notees"]);
    // Une partie sans début ni points : le serveur refuserait l'envoi entier, même si le droit était mal posé.
    const noter = appels.find((s) => s.url.endsWith("noter_victoires_stateres"));
    expect(JSON.parse(noter?.body ?? "null")).toEqual({ p_parties: [{ partie: "verification" }] });
    // Aucune partie ne commence en 2100 : rien à lire.
    expect(JSON.parse(appels.find((s) => s.url.endsWith("stateres_parties_notees"))?.body ?? "null")).toEqual({ p_depuis: "2100-01-01T00:00:00Z" });
    expect(appels.every((s) => s.apikey === "sb_publishable_x")).toBe(true);
  });

  it("dit, avec la clé secrète, si le workflow peut noter les parties pour les statères, sans jamais bloquer", async () => {
    const label = "workflow peut noter les parties pour les statères";
    const avecCle = async (secret: Record<string, Route>) => (await run(HEALTHY, "sb_secret_x", secret)).find((c) => c.label.includes(label));
    expect((await avecCle(SECRET))?.status).toBe("ok");
    expect(await avecCle({ ...SECRET, "/rest/v1/rpc/stateres_parties_notees": { status: 404, body: {} } })).toMatchObject({ status: "warn", detail: expect.stringContaining("20261113001800") });
    expect(await avecCle({ ...SECRET, "/rest/v1/rpc/stateres_parties_notees": { status: 403, body: {} } })).toMatchObject({ status: "warn", detail: expect.stringContaining("Réponse 403") });
    expect((await avecCle({ ...SECRET, "/rest/v1/rpc/stateres_parties_notees": { status: 200, body: { ok: false, error: "invalid_request" } } }))?.status).toBe("warn");
    // Avec la clé secrète, seule la lecture des parties notées est appelée : jamais noter_victoires_stateres.
    seen.length = 0;
    await run(HEALTHY, "sb_secret_x");
    expect(seen.filter((s) => s.apikey === "sb_secret_x" && /stateres/.test(s.url)).map((s) => new URL(s.url).pathname)).toEqual(["/rest/v1/rpc/stateres_parties_notees"]);
    // Sans la clé secrète, ce contrôle n'est pas fait.
    expect((await run()).some((c) => c.label.includes(label))).toBe(false);
  });

  it("bloque si un visiteur lit une boutique, et signale la boutique pas encore installée", async () => {
    expect(await statusOf(HEALTHY, "ne lit pas de boutique")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_ma_boutique": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "ne lit pas de boutique")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_ma_boutique": { status: 200, body: { ok: true, solde: 0, inventaire: [] } } }, "ne lit pas de boutique")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_ma_boutique": { status: 404, body: {} } }, "boutique du village est installée")).toBe("warn");
  });

  it("bloque si un visiteur achète un objet ou ouvre une pochette surprise", async () => {
    expect(await statusOf(HEALTHY, "n'achète pas d'objet")).toBe("ok");
    expect(await statusOf(HEALTHY, "n'ouvre pas de pochette")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/acheter_objet": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "n'achète pas d'objet")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/acheter_objet": { status: 200, body: { ok: true, solde: 0 } } }, "n'achète pas d'objet")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/ouvrir_pochette": { status: 200, body: { ok: true, solde: 0 } } }, "n'ouvre pas de pochette")).toBe("fail");
    // Le visiteur ne demande jamais un objet qui existe : rien ne serait débité même si le droit était mal posé.
    seen.length = 0;
    await run();
    expect(JSON.parse(seen.find((s) => s.url.endsWith("/rpc/acheter_objet"))?.body ?? "null")).toEqual({ p_emplacement: "tete", p_objet: "verification" });
  });

  it("bloque si un visiteur lit le marché ou la place du village, et signale le marché pas encore installé", async () => {
    expect(await statusOf(HEALTHY, "ne lit pas le marché du village")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_marche": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "ne lit pas le marché du village")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_marche": { status: 200, body: { ok: true, solde: 0, offres: [], offres_max: 5 } } }, "ne lit pas le marché du village")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_marche": { status: 404, body: {} } }, "marché du village est installé")).toBe("warn");
    expect(await statusOf(HEALTHY, "ne voit pas la place du village")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_village": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "ne voit pas la place du village")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_village": { status: 200, body: { ok: true, gaulois: [] } } }, "ne voit pas la place du village")).toBe("fail");
  });

  it("bloque si un visiteur vend, retire ou achète au marché, sans jamais désigner un objet ou une offre qui existe", async () => {
    for (const label of ["ne met rien en vente", "ne retire pas d'offre du marché", "n'achète pas au marché"]) expect(await statusOf(HEALTHY, label)).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/mettre_en_vente": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "ne met rien en vente")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/mettre_en_vente": { status: 200, body: { ok: true, solde: 0, offres: [], offres_max: 5 } } }, "ne met rien en vente")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/retirer_offre": { status: 200, body: { ok: true } } }, "ne retire pas d'offre du marché")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/acheter_offre": { status: 200, body: { ok: true } } }, "n'achète pas au marché")).toBe("fail");
    seen.length = 0;
    await run();
    const corps = (fn: string) => JSON.parse(seen.find((s) => s.url.endsWith(`/rpc/${fn}`))?.body ?? "null");
    expect(corps("mettre_en_vente")).toEqual({ p_emplacement: "tete", p_objet: "verification", p_prix: 1 });
    expect(corps("retirer_offre")).toEqual({ p_id: 0 });
    expect(corps("acheter_offre")).toEqual({ p_id: 0 });
  });

  it("bloque si un visiteur lit l'économie du village ou en règle les prix, et signale l'onglet Village pas encore installé", async () => {
    expect(await statusOf(HEALTHY, "ne lit pas l'économie du village")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_village_economie": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "ne lit pas l'économie du village")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_village_economie": { status: 200, body: { ok: true, seuil: 5 } } }, "ne lit pas l'économie du village")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_village_economie": { status: 404, body: {} } }, "onglet Village de la Direction est installé")).toBe("warn");
    expect(await statusOf(HEALTHY, "ne règle pas les prix du village")).toBe("ok");
    expect(await statusOf(HEALTHY, "ne règle pas la pochette surprise")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/regler_village_prix": { status: 200, body: { ok: true, change: true } } }, "ne règle pas les prix du village")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/regler_village_pochette": { status: 200, body: { ok: true, change: true } } }, "ne règle pas la pochette surprise")).toBe("fail");
    // Les valeurs envoyées seraient refusées par la fonction elle-même : un prix de 0, des chances vides.
    seen.length = 0;
    await run();
    expect(JSON.parse(seen.find((s) => s.url.endsWith("/rpc/regler_village_prix"))?.body ?? "null")).toEqual({ p_prix: { commun: 0 } });
    expect(JSON.parse(seen.find((s) => s.url.endsWith("/rpc/regler_village_pochette"))?.body ?? "null")).toEqual({ p_prix: 0, p_chances: {} });
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

  it("dit si le robot a son jeton, pour les rôles, les tickets et les concours, sans jamais bloquer", async () => {
    expect(await statusOf(HEALTHY, "robot a son jeton")).toBe("ok");
    const noToken = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": { status: 200, body: { ok: true, discord: true, service: true, signature: true, robot: false } } });
    expect(noToken.find((c) => c.label.includes("robot a son jeton"))).toMatchObject({ status: "warn", detail: expect.stringContaining("LE_GAULOIS_BOT_TOKEN") });
    // La fonction absente : la ligne de la connexion par code le dit déjà.
    const absent = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": { status: 404 } });
    expect(absent.some((c) => c.label.includes("robot a son jeton"))).toBe(false);
  });

  it("dit si les commandes du serveur Discord sont celles du code, sans jamais bloquer", async () => {
    expect(await statusOf(HEALTHY, "commandes du serveur Discord")).toBe("ok");
    const etat = (inscription?: boolean) => ({ status: 200, body: { ok: true, discord: true, service: true, signature: true, robot: true, concours: true, ...(inscription === undefined ? {} : { inscription }) } });
    const stale = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": etat(false) });
    expect(stale.find((c) => c.label.includes("commandes du serveur Discord"))).toMatchObject({ status: "warn", detail: expect.stringContaining("cinq minutes") });
    // Une fonction en ligne d'avant le 13 novembre 2026 ne compare pas ses commandes : il faut la remettre en ligne.
    const old = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": etat() });
    expect(old.find((c) => c.label.includes("commandes du serveur Discord"))).toMatchObject({ status: "warn", detail: expect.stringContaining("remettre en ligne") });
    expect(old.some((c) => c.status === "fail")).toBe(false);
  });

  it("dit si les concours ont leur base, sans jamais bloquer, et bloque si un visiteur peut les appeler", async () => {
    expect(await statusOf(HEALTHY, "concours ont leur base")).toBe("ok");
    const sansMigration = await run({ ...HEALTHY, "/functions/v1/code-discord/etat": { status: 200, body: { ok: true, discord: true, service: true, signature: true, robot: true, concours: false } } });
    expect(sansMigration.find((c) => c.label.includes("concours ont leur base"))).toMatchObject({ status: "warn", detail: expect.stringContaining("20261112000800") });
    expect(await statusOf(HEALTHY, "ne participe pas à un concours")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/concours_participer": { status: 200, body: { ok: false, error: "inconnu" } } }, "ne participe pas à un concours")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/concours_travail": { status: 200, body: { ok: true, taches: [] } } }, "ne commande pas le robot des concours")).toBe("fail");
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

  it("bloque si un visiteur lit l'activité du site, sans jamais compter de visite", async () => {
    expect(await statusOf(HEALTHY, "l'activité du site")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_site_activity": { status: 200, body: { ok: false, error: "not_signed_in" } } }, "l'activité du site")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_site_activity": { status: 200, body: { ok: true, days: [] } } }, "l'activité du site")).toBe("fail");
    // Absente : la migration n'est pas collée. À regarder avant la mise en ligne, sans rien bloquer.
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_site_activity": { status: 404, body: {} } }, "compte des visites")).toBe("warn");
    seen.length = 0;
    await run();
    expect(seen.some((s) => s.url.includes("note_site_visit"))).toBe(false);
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

  it("bloque si un visiteur lit la carte de l'alliance, accepte une invitation ou dessine une zone", async () => {
    const labels = ["lit pas la carte de l'alliance", "accepte pas d'invitation", "dessine pas de zone de l'alliance"];
    for (const label of labels) expect(await statusOf(HEALTHY, label)).toBe("ok");
    // Un droit d'appel mal posé, mais la fonction qui refuse elle-même : rien n'est lu ni écrit.
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_alliance_map": { status: 200, body: { ok: false, error: "not_signed_in" } } }, labels[0]!)).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/get_alliance_map": { status: 200, body: { ok: true, access: null } } }, labels[0]!)).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/accept_alliance_invite": { status: 200, body: { ok: true } } }, labels[1]!)).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/save_alliance_zone": { status: 200, body: { ok: true, id: 1 } } }, labels[2]!)).toBe("fail");
  });

  it("bloque si un visiteur supprime une zone de l'alliance", async () => {
    expect(await statusOf(HEALTHY, "supprime pas de zone de l'alliance")).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/delete_alliance_zone": { status: 200, body: { ok: true } } }, "supprime pas de zone de l'alliance")).toBe("fail");
  });

  it("bloque si un visiteur accepte un joueur allié ou en lit la liste", async () => {
    for (const label of ["accepte pas de joueur allié", "lit pas la liste des joueurs alliés"]) expect(await statusOf(HEALTHY, label)).toBe("ok");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/approve_alliance_ally": { status: 200, body: { ok: true } } }, "accepte pas de joueur allié")).toBe("fail");
    expect(await statusOf({ ...HEALTHY, "/rest/v1/rpc/list_alliance_allies": { status: 200, body: { ok: true, allies: [] } } }, "lit pas la liste des joueurs alliés")).toBe("fail");
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
