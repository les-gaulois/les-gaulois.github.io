import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GazetteEdition } from "../../src/lib/gazette";
import { editionToSend, escapeDiscord, gazettePayload, GazetteSendState, imagePayload, isWebhookUrl, lastSentEdition, MESSAGE_FORMAT, SEND_FROM_HOUR, sendLatestGazette, type SendDeps, WAIT_UNTIL_HOUR } from "../../src/lib/gazette-discord";
import type { WeekPlayer } from "../../src/lib/week-players";

const WEBHOOK = "https://discord.com/api/webhooks/123456789/abc-DEF_123";
const edition = (over: Partial<GazetteEdition> = {}): GazetteEdition => ({
  from: "2026-11-02",
  to: "2026-11-08",
  totals: { games: 671, wins: 269, winRate: 40.09 },
  previous: { games: 616, wins: 217, winRate: 35.2 },
  highlights: null,
  standing: null,
  territory: null,
  arrivals: null,
  players: null,
  // Un podium part par défaut du relevé du lundi 2 novembre, à 0 h 53 à Paris.
  playersSince: over.players ? "2026-11-01T23:53:00.000Z" : null,
  active: null,
  milestones: null,
  ...over,
});
// Le lundi suivant, à Paris : 9 h y font 8 h UTC en novembre.
const MONDAY_EARLY = new Date("2026-11-09T07:59:00.000Z");
const MONDAY_LATE = new Date("2026-11-09T08:00:00.000Z");
const ARRIVALS = { count: 92, named: [], anonymous: 92 };
/** La fin du dimanche, d'après l'historique de la carte. */
const SUNDAY_END = { date: "2026-11-08", pixels: 121976, rank: 4, final: true };
const ready = (over: Partial<GazetteEdition> = {}) => edition({ arrivals: ARRIVALS, territory: { start: null, end: SUNDAY_END }, ...over });

describe("gazettePayload", () => {
  const player = (username: string, wins: number, place: number): WeekPlayer => ({ id: username, username, wins, place });
  const embedOf = (e: GazetteEdition) => gazettePayload(e, "GAL", "https://les-gaulois.github.io/").embeds[0]!;
  /** Les nombres sont écrits avec une espace insécable. */
  const plain = (text: string | undefined) => text?.replace(/[\u00a0\u202f]/g, " ");
  const field = (e: GazetteEdition, name: string) => plain(embedOf(e).fields.find((f) => f.name === name)?.value);

  it("donne le titre, la semaine et le lien de la page, sans texte à côté qui ferait un second aperçu", () => {
    const payload = gazettePayload(edition(), "GAL", "https://les-gaulois.github.io/");
    expect(payload).not.toHaveProperty("content");
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]).toMatchObject({ title: "La gazette de [GAL]", url: "https://les-gaulois.github.io/gazette" });
    expect(plain(payload.embeds[0]?.description)).toBe("Semaine du 2 nov. au 8 nov. 2026");
    expect(payload.avatar_url).toBe("https://les-gaulois.github.io/generated/icon-192.png");
  });

  it("met les trois chiffres de la semaine en blocs côte à côte", () => {
    const blocks = embedOf(edition()).fields.slice(0, 3);
    expect(blocks.map((f) => [f.name, plain(f.value), f.inline])).toEqual([
      ["Victoires", "**269**", true],
      ["Parties", "**671**", true],
      ["Taux de victoire", "**40,1 %**", true],
    ]);
  });

  it("compare à la semaine d'avant avec la phrase de la page", () => {
    expect(field(edition(), "Évolution")).toBe("55 parties de plus que la semaine d'avant. Taux de victoire : +4,9 points.");
    expect(field(edition({ previous: null }), "Évolution")).toBeUndefined();
  });

  it("n'écrit ni classement, ni territoire, ni arrivées, ni joueurs sans relevé : pas de données n'est pas zéro", () => {
    expect(embedOf(edition()).fields.map((f) => f.name)).toEqual(["Victoires", "Parties", "Taux de victoire", "Évolution"]);
  });

  it("donne le rang daté, et dit qu'il porte sur 90 jours", () => {
    const snap = (date: string, rank: number | null) => ({ date, capturedAt: `${date}T10:00:00.000Z`, leaderboardEnd: `${date}T09:00:00.000Z`, clansListed: 100, rank, score: 100, games: 10, wins: 5, losses: 5, membersTotal: 700 });
    expect(field(edition({ standing: { start: snap("2026-11-01", 3), end: snap("2026-11-08", 2) } }), "Classement officiel")).toBe("**2e** le 8 nov. (3e le 1 nov.), sur 90 jours glissants.");
    expect(field(edition({ standing: { start: null, end: snap("2026-11-08", null) } }), "Classement officiel")).toBe("**hors de la liste** le 8 nov., sur 90 jours glissants.");
  });

  it("ne calcule pas d'écart depuis un relevé fait dans la journée", () => {
    const end = { date: "2026-11-08", pixels: 400, rank: 4, final: true };
    expect(field(edition({ territory: { start: { date: "2026-11-01", pixels: 300, rank: 5 }, end } }), "Carte des clans")).toBe("**4e** avec 400 pixels le 8 nov.");
  });

  it("écrit la place, le territoire et son évolution, datée", () => {
    const reading = (date: string, pixels: number, rank: number | null = 4) => ({ date, pixels, rank, final: true });
    expect(field(edition({ territory: { start: reading("2026-11-01", 53077), end: reading("2026-11-08", 121976) } }), "Carte des clans")).toBe("**4e** avec 121 976 pixels le 8 nov., +68 899 depuis le 1 nov.");
    expect(field(edition({ territory: { start: reading("2026-11-01", 500), end: reading("2026-11-08", 400) } }), "Carte des clans")).toBe("**4e** avec 400 pixels le 8 nov., −100 depuis le 1 nov.");
    expect(field(edition({ territory: { start: null, end: reading("2026-11-08", 400, null) } }), "Carte des clans")).toBe("**400** pixels le 8 nov.");
  });

  it("n'écrit pas un relevé fait dans la journée : la page le démentirait, et un message ne se corrige pas", () => {
    expect(field(edition({ territory: { start: null, end: { date: "2026-11-08", pixels: 103121, rank: 5 } } }), "Carte des clans")).toBeUndefined();
  });

  it("donne le nombre d'arrivées sans citer les arrivants", () => {
    const e = edition({ arrivals: { count: 92, named: [{ username: "Secret.1234", id: "IdSecret" }], anonymous: 91 } });
    expect(field(e, "Arrivées")).toBe("**92** encore dans le clan");
    expect(JSON.stringify(gazettePayload(e, "GAL", "https://x.test"))).not.toContain("Secret.1234");
    expect(JSON.stringify(gazettePayload(e, "GAL", "https://x.test"))).not.toContain("IdSecret");
  });

  it("met en valeur les joueurs de la semaine, une même médaille pour une même place", () => {
    const e = edition({ players: [player("Alpha", 33, 1), player("Beta", 33, 1), player("Gamma", 1, 3)] });
    expect(field(e, "Le plus de victoires de la semaine")).toBe("🥇 **Alpha** : 33 victoires\n🥇 **Beta** : 33 victoires\n🥉 **Gamma** : 1 victoire\n*Cela compte d'abord le temps de jeu, pas le niveau.*");
    expect(embedOf(e).footer.text).toContain("membres avec pseudo présents aux deux");
  });

  it("écrit les dates d'un podium parti plus tard que le lundi, car la période est plus courte", () => {
    const e = edition({ players: [player("Alpha", 33, 1)], playersSince: "2026-11-05T10:39:31.574Z" });
    expect(field(e, "Le plus de victoires du 5 nov. au 8 nov.")).toBe("🥇 **Alpha** : 33 victoires\n*Cela compte d'abord le temps de jeu, pas le niveau.*");
    expect(field(e, "Le plus de victoires de la semaine")).toBeUndefined();
  });

  it("sans podium pour cette semaine, rien ne le remplace", () => {
    expect(embedOf(edition()).fields.some((f) => f.name.startsWith("Le plus de victoires"))).toBe(false);
  });

  it("n'écrit rien sur les joueurs s'il n'y a personne à citer", () => {
    expect(embedOf(edition()).footer.text).toBe("Données publiques d'OpenFront.");
  });

  it("ne laisse aucun pseudo mettre le message en forme, y glisser un lien ou une mention", () => {
    expect(escapeDiscord("**gras**")).toBe("\\*\\*gras\\*\\*");
    expect(escapeDiscord("[clic](https://x.test)")).toBe("\\[clic\\]\\(https\\:\\/\\/x.test\\)");
    expect(escapeDiscord("@everyone")).toBe("\\@everyone");
    expect(escapeDiscord("<@123>")).toBe("\\<\\@123\\>");
    expect(escapeDiscord("a\n# b")).toBe("a \\# b");
    expect(escapeDiscord("Judom FR")).toBe("Judom FR");
    expect(escapeDiscord("lesang2tmort.6392")).toBe("lesang2tmort.6392");
  });

  it("interdit toute mention, même si une valeur en contenait une", () => {
    expect(gazettePayload(edition(), "GAL", "https://x.test")).toMatchObject({ allowed_mentions: { parse: [] } });
  });

  it("tient dans les limites de Discord, même avec le message le plus long", () => {
    const reading = SUNDAY_END;
    const long = "x".repeat(32);
    const snap = { date: "2026-11-08", capturedAt: "2026-11-08T10:00:00.000Z", leaderboardEnd: "2026-11-08T09:00:00.000Z", clansListed: 100, rank: 2, score: 100, games: 10, wins: 5, losses: 5, membersTotal: 700 };
    const embed = embedOf(edition({ standing: { start: snap, end: snap }, territory: { start: reading, end: reading }, arrivals: ARRIVALS, players: [1, 2, 3, 4, 5].map((n) => player(`${long}${n}`, 123456, 1)) }));
    expect(embed.fields.length).toBeLessThanOrEqual(25);
    for (const f of embed.fields) {
      expect(f.name.length).toBeLessThanOrEqual(256);
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
    expect(JSON.stringify(embed).length).toBeLessThan(6000);
  });
});

describe("imagePayload", () => {
  it("n'est que l'image, sa description et un bouton vers la page : aucun texte, aucune mention possible", () => {
    const payload = imagePayload("https://les-gaulois.github.io/", "Description.", "gazette.png");
    expect(payload).toEqual({
      avatar_url: "https://les-gaulois.github.io/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "gazette.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir toute la semaine", url: "https://les-gaulois.github.io/gazette" }] }],
    });
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("embeds");
  });
});

describe("format du message", () => {
  const state = (format?: number) => GazetteSendState.parse({ lastSent: "2026-10-26", sentAt: "2026-11-07T19:59:07.866Z", ...(format === undefined ? {} : { format }) });

  it("relit une trace écrite avant les formats comme le tout premier", () => {
    expect(state().format).toBe(1);
  });

  it("ne renvoie pas une édition déjà partie dans le format actuel", () => {
    expect(lastSentEdition(state(MESSAGE_FORMAT))).toBe("2026-10-26");
  });

  it("renvoie une fois la dernière édition quand le format change, pour voir le résultat", () => {
    expect(lastSentEdition(state())).toBeNull();
    expect(lastSentEdition(null)).toBeNull();
  });
});

describe("editionToSend", () => {
  it("ne fait rien sans édition", () => {
    expect(editionToSend([], null, MONDAY_LATE)).toMatchObject({ send: false });
  });
  it("attend la matinée du lundi", () => {
    expect(editionToSend([ready()], null, MONDAY_EARLY)).toMatchObject({ send: false, reason: `avant ${SEND_FROM_HOUR} h` });
    expect(editionToSend([ready()], null, MONDAY_LATE)).toMatchObject({ send: true });
  });
  it("le lundi, attend la liste des membres pour donner les arrivées, puis part sans elles", () => {
    expect(editionToSend([edition()], null, MONDAY_LATE)).toMatchObject({ send: false, reason: "en attente de la liste des membres" });
    // En novembre, Paris a une heure d'avance sur UTC.
    expect(WAIT_UNTIL_HOUR).toBe(21);
    expect(editionToSend([edition()], null, new Date("2026-11-09T19:59:00.000Z"))).toMatchObject({ send: false });
    expect(editionToSend([edition()], null, new Date("2026-11-09T20:00:00.000Z"))).toMatchObject({ send: true });
  });
  it("le lundi, attend aussi le film qui couvre le dimanche, puis part sans territoire", () => {
    const saturday = { start: null, end: { ...SUNDAY_END, date: "2026-11-07" } };
    const midday = { start: null, end: { date: "2026-11-08", pixels: 103121, rank: 5 } };
    for (const territory of [null, saturday, midday]) {
      expect(editionToSend([ready({ territory })], null, MONDAY_LATE)).toMatchObject({ send: false, reason: "en attente du film de la carte" });
      expect(editionToSend([ready({ territory })], null, new Date("2026-11-09T19:59:00.000Z"))).toMatchObject({ send: false });
      expect(editionToSend([ready({ territory })], null, new Date("2026-11-09T20:00:00.000Z"))).toMatchObject({ send: true });
    }
  });
  it("en heure d'été, attend 9 h et 21 h à Paris, pas en temps universel", () => {
    const summer = ready({ from: "2026-07-06", to: "2026-07-12", territory: { start: null, end: { ...SUNDAY_END, date: "2026-07-12" } } });
    expect(editionToSend([summer], null, new Date("2026-07-13T06:59:00.000Z"))).toMatchObject({ send: false, reason: `avant ${SEND_FROM_HOUR} h` });
    expect(editionToSend([summer], null, new Date("2026-07-13T07:00:00.000Z"))).toMatchObject({ send: true });
    const waiting = edition({ from: "2026-07-06", to: "2026-07-12" });
    expect(editionToSend([waiting], null, new Date("2026-07-13T18:59:00.000Z"))).toMatchObject({ send: false });
    expect(editionToSend([waiting], null, new Date("2026-07-13T19:00:00.000Z"))).toMatchObject({ send: true });
  });
  it("ne poste pas une semaine sans aucune partie : ce serait un faux zéro bien avant une vraie semaine vide", () => {
    const empty = { games: 0, wins: 0, winRate: null };
    expect(editionToSend([ready({ totals: empty })], null, new Date("2026-11-10T10:00:00.000Z"))).toMatchObject({ send: false, reason: "aucune partie dans cette édition" });
  });
  it("envoie plus tard si le lundi a été manqué, quelle que soit l'heure", () => {
    expect(editionToSend([edition()], null, new Date("2026-11-10T02:00:00.000Z"))).toMatchObject({ send: true });
  });
  it("n'envoie jamais deux fois la même édition", () => {
    expect(editionToSend([ready()], "2026-11-02", MONDAY_LATE)).toMatchObject({ send: false });
  });
  it("envoie la nouvelle édition après la précédente", () => {
    expect(editionToSend([ready()], "2026-10-26", MONDAY_LATE)).toMatchObject({ send: true });
  });
  it("ne rattrape pas les semaines passées : seule la dernière part", () => {
    const decision = editionToSend([ready(), ready({ from: "2026-10-26", to: "2026-11-01" })], "2026-10-12", MONDAY_LATE);
    expect(decision.send && decision.edition.from).toBe("2026-11-02");
  });
});

describe("isWebhookUrl", () => {
  it("accepte un lien de Discord", () => {
    expect(isWebhookUrl(WEBHOOK)).toBe(true);
    expect(isWebhookUrl("https://discordapp.com/api/webhooks/1/a")).toBe(true);
  });
  it("accepte le lien copié depuis les versions d'essai de Discord", () => {
    expect(isWebhookUrl("https://ptb.discord.com/api/webhooks/1/a")).toBe(true);
    expect(isWebhookUrl("https://canary.discord.com/api/webhooks/1/a")).toBe(true);
  });
  it("refuse tout le reste", () => {
    for (const url of ["http://discord.com/api/webhooks/1/a", "https://exemple.test/api/webhooks/1/a", "https://discord.com.exemple.test/api/webhooks/1/a", "https://ptb.discord.com.exemple.test/api/webhooks/1/a", "https://autre.discord.com/api/webhooks/1/a", "https://discord.com/api/webhooks/1/a/github", "https://discord.com/channels/1/2", ""]) {
      expect(isWebhookUrl(url)).toBe(false);
    }
  });
});

describe("sendLatestGazette", () => {
  const setup = (over: Partial<SendDeps> = {}) => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps: SendDeps = { webhook: WEBHOOK, editions: [ready()], unreadable: [], renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description de l'image." }), lastSent: null, tag: "GAL", siteUrl: "https://x.test", now: MONDAY_LATE, fetch: post as unknown as typeof fetch, log: (line) => logs.push(line), ...over };
    return { deps, logs, post };
  };
  const noSecret = (logs: string[]) => {
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  };

  it("sans lien, n'appelle personne", async () => {
    const { deps, post } = setup({ webhook: undefined });
    expect(await sendLatestGazette(deps)).toEqual({ status: "off" });
    expect(post).not.toHaveBeenCalled();
  });
  it("un lien vide vaut pas de lien", async () => {
    const { deps, post } = setup({ webhook: "" });
    expect(await sendLatestGazette(deps)).toEqual({ status: "off" });
    expect(post).not.toHaveBeenCalled();
  });
  it("un lien fait seulement d'espaces vaut pas de lien", async () => {
    const { deps, post } = setup({ webhook: " \n" });
    expect(await sendLatestGazette(deps)).toEqual({ status: "off" });
    expect(post).not.toHaveBeenCalled();
  });
  it("ignore une espace ou un retour à la ligne laissés autour du lien par un copier-coller", async () => {
    const { deps, post } = setup({ webhook: ` ${WEBHOOK}\n` });
    expect((await sendLatestGazette(deps)).status).toBe("sent");
    expect((post.mock.calls[0] as unknown as [string])[0]).toBe(`${WEBHOOK}?with_components=true`);
  });
  it("refuse un lien qui n'est pas celui de Discord, sans l'écrire", async () => {
    const { deps, post, logs } = setup({ webhook: "https://exemple.test/abc-DEF_123" });
    expect(await sendLatestGazette(deps)).toEqual({ status: "invalid" });
    expect(post).not.toHaveBeenCalled();
    noSecret(logs);
  });
  it("envoie la dernière édition sans permettre de mention, et retient son lundi", async () => {
    const { deps, post, logs } = setup();
    const result = await sendLatestGazette(deps);
    expect(result).toEqual({ status: "sent", state: { lastSent: "2026-11-02", sentAt: MONDAY_LATE.toISOString(), format: MESSAGE_FORMAT } });
    expect(result.status === "sent" && GazetteSendState.safeParse(result.state).success).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(init.redirect).toBe("error");
    // L'en-tête et sa frontière viennent de `fetch` : en poser un casserait l'envoi.
    expect(init.headers).toBeUndefined();
    const form = init.body as FormData;
    const payload = JSON.parse(String(form.get("payload_json")));
    expect(payload).toMatchObject({
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "gazette-2026-11-02.png", description: "Description de l'image." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, url: "https://x.test/gazette" }] }],
    });
    // Le message est l'image seule : ni texte ni bloc ne l'accompagne.
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("embeds");
    const file = form.get("files[0]") as File;
    expect(file.name).toBe("gazette-2026-11-02.png");
    expect(file.type).toBe("image/png");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(post).toHaveBeenCalledTimes(1);
    noSecret(logs);
  });
  it("si l'image ne se dessine pas, le message part quand même, en texte", async () => {
    const { deps, post, logs } = setup({ renderImage: async () => { throw new Error("un caractère ne peut pas être dessiné"); } });
    expect((await sendLatestGazette(deps)).status).toBe("sent");
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    expect(JSON.parse(String(init.body))).toMatchObject({ allowed_mentions: { parse: [] }, embeds: [{ title: "La gazette de [GAL]" }] });
    expect(init.redirect).toBe("error");
    expect(logs.join(" ")).toContain("part en texte");
    noSecret(logs);
  });
  it.each([400, 403, 413])("si Discord refuse le format du message (%i), il le renvoie aussitôt en texte", async (status) => {
    const answers = [new Response("non", { status }), new Response(null, { status: 204 })];
    const post = vi.fn(async () => answers.shift()!);
    const { deps, logs } = setup({ fetch: post as unknown as typeof fetch });
    expect((await sendLatestGazette(deps)).status).toBe("sent");
    expect(post).toHaveBeenCalledTimes(2);
    expect((post.mock.calls[1] as unknown as [string])[0]).toBe(WEBHOOK);
    noSecret(logs);
  });
  it.each([401, 404, 429])("un lien mort ou une limite (%i) n'envoie rien de plus dans ce passage", async (status) => {
    const post = vi.fn(async () => new Response("non", { status }));
    const { deps } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendLatestGazette(deps)).toEqual({ status: "failed" });
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("si le texte est refusé aussi, rien n'est noté et le passage suivant réessaie", async () => {
    const post = vi.fn(async () => new Response("non", { status: 400 }));
    const { deps } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendLatestGazette(deps)).toEqual({ status: "failed" });
    expect(post).toHaveBeenCalledTimes(2);
  });
  it("une panne de Discord ne fait pas de second envoi dans le même passage", async () => {
    const post = vi.fn(async () => new Response("panne", { status: 503 }));
    const { deps } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendLatestGazette(deps)).toEqual({ status: "failed" });
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("n'envoie rien si un mois de sessions est illisible : les totaux seraient faux", async () => {
    const { deps, post, logs } = setup({ unreadable: ["2026-11.json"] });
    expect(await sendLatestGazette(deps)).toEqual({ status: "invalid" });
    expect(post).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("2026-11.json");
    noSecret(logs);
  });
  it("n'envoie rien si l'édition est déjà partie", async () => {
    const { deps, post } = setup({ lastSent: "2026-11-02" });
    expect(await sendLatestGazette(deps)).toEqual({ status: "nothing" });
    expect(post).not.toHaveBeenCalled();
  });
  it("ne retient rien si Discord refuse : le passage suivant réessaie", async () => {
    const post = vi.fn(async () => new Response("non", { status: 404 }));
    const { deps, logs } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendLatestGazette(deps)).toEqual({ status: "failed" });
    expect(logs.join(" ")).toContain("404");
    noSecret(logs);
  });
  it("attend sans appeler Discord tant que l'édition n'est pas prête", async () => {
    const { deps, post } = setup({ editions: [edition()] });
    expect(await sendLatestGazette(deps)).toEqual({ status: "nothing" });
    expect(post).not.toHaveBeenCalled();
  });
  it("ne retient rien si Discord ne répond pas, et n'écrit pas le lien", async () => {
    const post = vi.fn(async () => {
      throw new Error(`Échec sur ${WEBHOOK}`);
    });
    const { deps, logs } = setup({ fetch: post as unknown as typeof fetch });
    expect(await sendLatestGazette(deps)).toEqual({ status: "failed" });
    noSecret(logs);
  });
});

describe("unreadableSessionFiles", () => {
  it("repère un mois illisible ou refusé par le schéma, et rien d'autre", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gal-sessions-"));
    const sessions = join(dir, "data", "sessions");
    mkdirSync(sessions, { recursive: true });
    writeFileSync(join(sessions, "2026-09.json"), JSON.stringify({ month: "2026-09", sessions: [] }));
    writeFileSync(join(sessions, "2026-10.json"), "{ cassé");
    writeFileSync(join(sessions, "2026-11.json"), JSON.stringify({ month: "2026-11", sessions: [{ gameId: "" }] }));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    try {
      const { unreadableSessionFiles } = await import("../../src/lib/data");
      expect(unreadableSessionFiles()).toEqual(["2026-10.json", "2026-11.json"]);
    } finally {
      cwd.mockRestore();
      warn.mockRestore();
      vi.resetModules();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
