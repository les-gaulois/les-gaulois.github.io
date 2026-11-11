import { describe, expect, it, vi } from "vitest";
import { checkWebhookLink, LinkCheckState, webhookCreatedAt, type LinkCheckDeps } from "../../src/lib/discord-check";

// L'identifiant d'exemple de la documentation de Discord : créé le 30 avril 2016 à 11:18:25.796 UTC.
const LINK = "https://discord.com/api/webhooks/175928847299117063/abc-DEF_123";
const CREATED = "2016-04-30T11:18:25.796Z";
const NOW = new Date("2026-11-08T13:53:00.000Z");

describe("webhookCreatedAt", () => {
  it("lit la date de création dans l'identifiant du webhook", () => {
    expect(webhookCreatedAt(LINK)?.toISOString()).toBe(CREATED);
    expect(webhookCreatedAt("https://discord.com/api/webhooks/x/abc")).toBeNull();
  });
});

describe("checkWebhookLink", () => {
  const setup = (over: Partial<LinkCheckDeps> = {}, answer: () => Promise<Response> = async () => Response.json({ name: "Le Gaulois", token: "abc-DEF_123", channel_id: "1" })) => {
    const logs: string[] = [];
    const get = vi.fn(answer);
    const deps: LinkCheckDeps = { link: LINK, stored: null, now: NOW, fetch: get as unknown as typeof fetch, log: (line) => logs.push(line), ...over };
    return { deps, logs, get };
  };
  const noSecret = (logs: string[]) => {
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  };

  it("demande à Discord si le lien marche, par une simple lecture, et dit le nom et la date de création du webhook", async () => {
    const { deps, logs, get } = setup();
    const result = await checkWebhookLink(deps);
    expect(result).toEqual({ state: { webhookCreatedAt: CREATED, checkedAt: NOW.toISOString() }, ok: true });
    expect(LinkCheckState.safeParse(result.state).success).toBe(true);
    const [url, init] = get.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(LINK);
    expect(init).toEqual({ method: "GET", redirect: "error" });
    expect(logs).toEqual(["::notice::Lien Discord vérifié sans rien envoyer : webhook « Le Gaulois », créé le 30 avr., 13:18, heure de Paris."]);
    noSecret(logs);
  });
  it("ne vérifie qu'une fois le même webhook, et vérifie un nouveau lien", async () => {
    const same = setup({ stored: { webhookCreatedAt: CREATED, checkedAt: "2026-11-08T12:53:00.000Z" } });
    expect(await checkWebhookLink(same.deps)).toEqual({ state: null, ok: true });
    expect(same.get).not.toHaveBeenCalled();
    const other = setup({ stored: { webhookCreatedAt: "2026-11-07T19:00:00.000Z", checkedAt: "2026-11-07T20:00:00.000Z" } });
    expect((await checkWebhookLink(other.deps)).state?.webhookCreatedAt).toBe(CREATED);
    expect(other.get).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 404])("un lien que Discord ne reconnaît pas (%i) laisse un avertissement et sera revérifié", async (status) => {
    const { deps, logs } = setup({}, async () => new Response("non", { status }));
    expect(await checkWebhookLink(deps)).toEqual({ state: null, ok: false });
    expect(logs).toEqual([`::warning::Lien Discord : Discord ne reconnaît pas ce lien (HTTP ${status}). Vérifiez le lien du salon des nouvelles dans Direction > Discord, ou le secret DISCORD_WEBHOOK_GAZETTE.`]);
    noSecret(logs);
  });
  it.each([429, 503])("une limite ou une panne de Discord (%i) ne met pas le lien en cause", async (status) => {
    const { deps, logs } = setup({}, async () => new Response("non", { status }));
    expect(await checkWebhookLink(deps)).toEqual({ state: null, ok: false });
    expect(logs).toEqual([`::warning::Lien Discord : Discord a répondu ${status}. Nouvel essai au prochain passage.`]);
  });
  it("si Discord ne répond pas, rien n'est noté, et le lien n'est écrit nulle part", async () => {
    const { deps, logs } = setup({}, async () => {
      throw new Error(`Échec sur ${LINK}`);
    });
    expect(await checkWebhookLink(deps)).toEqual({ state: null, ok: false });
    noSecret(logs);
  });
  it("le nom du webhook ne peut rien glisser dans le journal de l'Action", async () => {
    const { deps, logs } = setup({}, async () => Response.json({ name: "Le Gaulois\r\n::error::piège%0A##[set-output name=x]" }));
    await checkWebhookLink(deps);
    expect(logs).toEqual(["::notice::Lien Discord vérifié sans rien envoyer : webhook « Le Gauloiserrorpiège0Aset-output namex », créé le 30 avr., 13:18, heure de Paris."]);
  });
});
