import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GazetteEdition } from "../../src/lib/gazette";
import { editionToSend, gazetteMessage, GazetteSendState, isWebhookUrl, SEND_FROM_HOUR, sendLatestGazette, type SendDeps, WAIT_UNTIL_HOUR } from "../../src/lib/gazette-discord";

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
  ...over,
});
// Le lundi suivant, à Paris : 9 h y font 8 h UTC en novembre.
const MONDAY_EARLY = new Date("2026-11-09T07:59:00.000Z");
const MONDAY_LATE = new Date("2026-11-09T08:00:00.000Z");
const ARRIVALS = { count: 92, named: [], anonymous: 92 };
/** La fin du dimanche, d'après l'historique de la carte. */
const SUNDAY_END = { date: "2026-11-08", pixels: 121976, rank: 4, final: true };
const ready = (over: Partial<GazetteEdition> = {}) => edition({ arrivals: ARRIVALS, territory: { start: null, end: SUNDAY_END }, ...over });

describe("gazetteMessage", () => {
  it("donne la semaine, les chiffres et le lien de la page", () => {
    const text = gazetteMessage(edition(), "GAL", "https://les-gaulois.github.io/");
    expect(text).toContain("**La gazette de [GAL] : semaine du 2 nov. au 8 nov. 2026**");
    expect(text).toContain("671 parties et 269 victoires, soit 40,1 %.");
    expect(text).toContain("La semaine d'avant : 616 parties, 35,2 %.");
    expect(text.endsWith("https://les-gaulois.github.io/gazette")).toBe(true);
  });
  it("n'écrit ni territoire ni arrivées sans relevé : pas de données n'est pas zéro", () => {
    const text = gazetteMessage(edition(), "GAL", "https://x.test");
    expect(text).not.toContain("Carte des clans");
    expect(text).not.toContain("Arrivées");
  });
  it("écrit le territoire et son évolution, datés", () => {
    const reading = (date: string, pixels: number) => ({ date, pixels, rank: 4, final: true });
    const text = gazetteMessage(edition({ territory: { start: reading("2026-11-01", 53077), end: reading("2026-11-08", 121976) } }), "GAL", "https://x.test");
    // Les nombres sont écrits avec une espace insécable.
    expect(text.replace(/[\u00a0\u202f]/g, " ")).toContain("Carte des clans : 121 976 pixels le 8 nov., 4e sur la carte. 53 077 pixels le 1 nov., soit +68 899.");
  });
  it("n'écrit pas un relevé fait dans la journée : la page le démentirait, et un message ne se corrige pas", () => {
    const text = gazetteMessage(edition({ territory: { start: null, end: { date: "2026-11-08", pixels: 103121, rank: 5 } } }), "GAL", "https://x.test");
    expect(text).not.toContain("Carte des clans");
    expect(text).not.toContain("103");
  });
  it("donne le nombre d'arrivées sans aucun pseudo", () => {
    const text = gazetteMessage(edition({ arrivals: { count: 92, named: ["Secret.1234"], anonymous: 91 } }), "GAL", "https://x.test");
    expect(text).toContain("Arrivées encore dans le clan : 92.");
    expect(text).not.toContain("Secret.1234");
  });
  it("tient dans la limite de Discord", () => {
    const reading = SUNDAY_END;
    const text = gazetteMessage(edition({ territory: { start: reading, end: reading }, arrivals: { count: 92, named: [], anonymous: 92 } }), "GAL", "https://les-gaulois.github.io");
    expect(text.length).toBeLessThan(2000);
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
    const deps: SendDeps = { webhook: WEBHOOK, editions: [ready()], unreadable: [], lastSent: null, tag: "GAL", siteUrl: "https://x.test", now: MONDAY_LATE, fetch: post as unknown as typeof fetch, log: (line) => logs.push(line), ...over };
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
    expect((post.mock.calls[0] as unknown as [string])[0]).toBe(WEBHOOK);
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
    expect(result).toEqual({ status: "sent", state: { lastSent: "2026-11-02", sentAt: MONDAY_LATE.toISOString() } });
    expect(result.status === "sent" && GazetteSendState.safeParse(result.state).success).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    expect(JSON.parse(String(init.body))).toMatchObject({ allowed_mentions: { parse: [] } });
    expect(init.redirect).toBe("error");
    noSecret(logs);
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
