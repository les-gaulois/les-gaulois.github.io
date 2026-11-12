import { describe, expect, it, vi } from "vitest";
import type { AlertState, PlaceAlert, PlaceReading } from "../../src/lib/alerts";
import { alertPass, alertPayload, sendPlaceAlert, type AlertPassDeps, type AlertSendDeps } from "../../src/lib/alerts-discord";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");

const official: PlaceReading = {
  kind: "rank",
  rank: 2,
  fetchedAt: "2026-11-08T07:31:52.241Z",
  computedAt: "2026-11-08T07:27:13.816Z",
  rows: [],
  above: { tag: "UN", rank: 1, gap: 8519.57 },
  below: { tag: "ITA", rank: 3, gap: 131.1 },
};
const gain: PlaceAlert = { kind: "rank", from: 3, reading: official };
const mapLoss: PlaceAlert = {
  kind: "map",
  from: 4,
  reading: { ...official, kind: "map", rank: 5, fetchedAt: "2026-11-07T17:00:01.344Z", computedAt: "2026-11-07T17:00:01.344Z", above: { tag: "AST", rank: 4, gap: 1200 }, below: null },
};

describe("alertPayload", () => {
  it("dit la nouvelle place, les écarts, d'où vient le chiffre, et ne peut mentionner personne", () => {
    const payload = alertPayload(gain, "GAL", "https://x.test/", null);
    expect(plain(String(payload["content"])).split("\n")).toEqual([
      "**[GAL] monte à la 2e place du classement des clans**",
      "131,10 d'avance sur [ITA], 3e. 8 519,57 de retard sur [UN], 1er.",
      "[Voir le classement sur le site](<https://x.test/classement>)",
      "-# Liste officielle d'OpenFront, arrêtée au 8 nov., 08:27. Score : victoires pondérées, demi-vie de 30 jours.",
    ]);
    expect(payload).toMatchObject({ allowed_mentions: { parse: [] }, avatar_url: "https://x.test/generated/icon-192.png" });
    // Sans image, ni fichier joint ni bouton : le lien du texte suffit.
    expect(payload).not.toHaveProperty("attachments");
    expect(payload).not.toHaveProperty("components");
  });
  it("avec l'image, joint le fichier, sa description et un bouton vers la page, sans aucun texte", () => {
    const payload = alertPayload(mapLoss, "GAL", "https://x.test", { alt: "Description.", filename: "alerte-carte.png" });
    expect(payload).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "alerte-carte.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir la carte", url: "https://x.test/carte" }] }],
    });
    expect(payload).not.toHaveProperty("content");
  });
  it("le texte de secours dit la même alerte, avec un lien à la place du bouton", () => {
    const content = String(alertPayload(mapLoss, "GAL", "https://x.test", null)["content"]);
    expect(plain(content)).toContain("**[GAL] recule à la 5e place sur la carte des clans**\n1 200 pixels de retard sur [AST], 4e.");
    expect(content).toContain("-# Carte au relevé du 7 nov., 18:00. Territoire en pixels, ce n'est pas le classement des clans.");
  });
  it("le tag d'un autre clan ne peut ni mettre en forme le message, ni y glisser un lien ou une mention", () => {
    const odd: PlaceAlert = { ...gain, reading: { ...official, below: { tag: "*_[x](<https://y.test>)@here", rank: 3, gap: 1 } } };
    const content = String(alertPayload(odd, "GAL", "https://x.test", null)["content"]);
    expect(content).toContain("[\\*\\_\\[x\\]\\(\\<https\\:\\/\\/y.test\\>\\)\\@here]");
    expect(content).not.toContain("](<https://y.test>)");
  });
});

describe("sendPlaceAlert", () => {
  const setup = (over: Partial<AlertSendDeps> = {}) => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps: AlertSendDeps = { link: WEBHOOK, alert: gain, renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description de l'image." }), tag: "GAL", siteUrl: "https://x.test", fetch: post as unknown as typeof fetch, log: (line) => logs.push(line), ...over };
    return { deps, logs, post };
  };
  const noSecret = (logs: string[]) => {
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  };

  it("envoie l'image et le bouton en un seul message, sans suivre de redirection", async () => {
    const { deps, post, logs } = setup();
    expect(await sendPlaceAlert(deps)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(init.redirect).toBe("error");
    // L'en-tête et sa frontière viennent de `fetch` : en poser un casserait l'envoi.
    expect(init.headers).toBeUndefined();
    const form = init.body as FormData;
    const sent = JSON.parse(String(form.get("payload_json")));
    expect(sent).toMatchObject({ attachments: [{ id: 0, filename: "alerte-classement.png", description: "Description de l'image." }] });
    // Le message est l'image seule : aucun texte ne l'accompagne.
    expect(sent).not.toHaveProperty("content");
    const file = form.get("files[0]") as File;
    expect(file.type).toBe("image/png");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    noSecret(logs);
  });
  it("si l'image ne se dessine pas, l'alerte part quand même, en texte", async () => {
    const { deps, post, logs } = setup({ renderImage: async () => { throw new Error("un caractère ne peut pas être dessiné"); } });
    expect(await sendPlaceAlert(deps)).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ allowed_mentions: { parse: [] } });
    expect(String(sent.content)).toContain("monte à la 2e place du classement des clans");
    expect(logs.join(" ")).toContain("part en texte");
  });
  it.each([400, 403, 413])("si Discord refuse le format du message (%i), il le renvoie aussitôt en texte", async (status) => {
    const answers = [new Response("non", { status }), new Response(null, { status: 204 })];
    const post = vi.fn(async () => answers.shift()!);
    const { deps, logs } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendPlaceAlert(deps)).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    expect((post.mock.calls[1] as unknown as [string])[0]).toBe(WEBHOOK);
    noSecret(logs);
  });
  it.each([401, 404, 429, 503])("un lien mort, une limite ou une panne (%i) n'envoie rien de plus dans ce passage", async (status) => {
    const post = vi.fn(async () => new Response("non", { status }));
    const { deps, logs } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendPlaceAlert(deps)).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
    expect(logs.join(" ")).toContain(String(status));
    noSecret(logs);
  });
  it("si le texte est refusé aussi, l'alerte n'est pas comptée envoyée", async () => {
    const post = vi.fn(async () => new Response("non", { status: 400 }));
    const { deps } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendPlaceAlert(deps)).toBe(false);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it("si Discord ne répond pas, rien n'est compté, et le lien n'est écrit nulle part", async () => {
    const post = vi.fn(async () => {
      throw new Error(`Échec sur ${WEBHOOK}`);
    });
    const { deps, logs } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendPlaceAlert(deps)).toBe(false);
    noSecret(logs);
  });
});

describe("alertPass", () => {
  // GAL annoncé 3e ; un calcul de 7 h 26 l'a donné 2e, celui de 8 h 27 aussi. Il est 8 h 53 à Paris.
  const waiting: AlertState = { rank: { announced: 3, pending: { rank: 2, since: "2026-11-08T06:26:06.408Z" } }, map: null, sent: [] };
  const NOW = new Date("2026-11-08T07:53:00.000Z");
  const setup = (over: Partial<AlertPassDeps> = {}) => {
    const logs: string[] = [];
    const send = vi.fn(async () => true);
    const deps: AlertPassDeps = { stored: waiting, readings: { rank: official, map: null }, gazetteLastSent: "2026-11-02", now: NOW, send, log: (line) => logs.push(line), ...over };
    return { deps, logs, send };
  };

  it("avant la gazette du lundi 9 novembre, rien ne part et rien n'est noté", async () => {
    const { deps, logs, send } = setup({ gazetteLastSent: "2026-10-26" });
    expect(await alertPass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("gazette");
    expect((await alertPass({ ...deps, gazetteLastSent: null })).state).toBeNull();
  });
  it("au premier passage, note les places du moment sans rien envoyer", async () => {
    const { deps, send } = setup({ stored: null });
    expect(await alertPass(deps)).toEqual({ state: { rank: { announced: 2, pending: null }, map: null, sent: [] }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("une alerte acceptée devient la place annoncée et compte pour la journée", async () => {
    const { deps, logs, send } = setup();
    expect(await alertPass(deps)).toEqual({ state: { rank: { announced: 2, pending: null }, map: null, sent: [NOW.toISOString()] }, failed: false });
    expect(send).toHaveBeenCalledWith({ kind: "rank", from: 3, reading: official });
    expect(logs.join(" ")).toContain("3e puis 2e, envoyée");
  });
  it("une alerte refusée garde la place en attente, sans rien compter : le passage suivant réessaie", async () => {
    const { deps } = setup({ send: async () => false });
    expect(await alertPass(deps)).toEqual({ state: waiting, failed: true });
  });
  it("sans rien de nouveau, il n'y a rien à écrire", async () => {
    const { deps, send } = setup({ stored: { rank: { announced: 2, pending: null }, map: null, sent: [] } });
    expect(await alertPass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
});
