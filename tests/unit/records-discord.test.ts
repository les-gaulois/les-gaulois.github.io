import { describe, expect, it, vi } from "vitest";
import { markRecordsSent, parseRecordAlertState, planRecordAlert, recordAlertPass, recordHeadline, recordLine, recordPayload, sendRecords, type RecordAlert, type RecordSendDeps } from "../../src/lib/records-discord";
import type { ClanRecords } from "../../src/lib/results";

const records = (over: Partial<ClanRecords> = {}): ClanRecords => ({
  streak: { wins: 5, endedAt: "2026-11-01T20:00:00.000Z" },
  bestDay: { date: "2026-10-31", wins: 40, games: 90 },
  biggestGroup: { players: 6, at: "2026-10-20T20:00:00.000Z" },
  mostTeams: { teams: 8, players: 64, at: "2026-09-12T18:00:00.000Z" },
  ...over,
});
// Un samedi à 15 h à Paris.
const DAY = new Date("2026-11-07T14:00:00.000Z");
const NIGHT = new Date("2026-11-07T22:30:00.000Z");
const plain = (s: string) => s.replace(/\u00a0/g, " ");
const better = records({ streak: { wins: 7, endedAt: "2026-11-07T10:00:00.000Z" } });

describe("planRecordAlert", () => {
  it("au premier passage, prend les records du moment pour départ et n'envoie rien", () => {
    const plan = planRecordAlert(null, records(), DAY);
    expect(plan.alert).toBeNull();
    expect(plan.state?.announced).toEqual(records());
    expect(plan.reason).toContain("premier passage");
  });
  it("sans record calculable, ne note rien : un zéro de départ serait « battu » au passage suivant", () => {
    expect(planRecordAlert(null, null, DAY)).toEqual({ state: null, alert: null, reason: "aucun record calculable" });
    const stored = { announced: records(), sent: [] };
    expect(planRecordAlert(stored, null, DAY)).toEqual({ state: stored, alert: null, reason: "aucun record calculable" });
  });
  it("envoie quand une marque dépasse celle annoncée, jamais quand elle l'égale", () => {
    const stored = { announced: records(), sent: [] };
    const same = planRecordAlert(stored, records({ streak: { wins: 5, endedAt: "2026-11-07T10:00:00.000Z" } }), DAY);
    expect(same.alert).toBeNull();
    const beaten = planRecordAlert(stored, records({ streak: { wins: 7, endedAt: "2026-11-07T10:00:00.000Z" }, bestDay: { date: "2026-11-07", wins: 41, games: 80 } }), DAY);
    expect(beaten.alert?.beaten).toEqual([
      { key: "streak", before: 5, after: 7 },
      { key: "bestDay", before: 40, after: 41 },
    ]);
    // Les records annoncés ne changent qu'après l'envoi.
    expect(beaten.state?.announced.streak.wins).toBe(5);
  });
  it("part la nuit aussi, et n'envoie qu'une alerte de record par jour", () => {
    expect(planRecordAlert({ announced: records(), sent: [] }, better, NIGHT).alert).not.toBeNull();
    expect(planRecordAlert({ announced: records(), sent: ["2026-11-07T09:00:00.000Z"] }, better, NIGHT).reason).toContain("déjà une alerte");
    expect(planRecordAlert({ announced: records(), sent: ["2026-11-07T09:00:00.000Z"] }, better, DAY).reason).toContain("déjà une alerte");
    expect(planRecordAlert({ announced: records(), sent: ["2026-11-06T09:00:00.000Z"] }, better, DAY).alert).not.toBeNull();
  });
});

describe("markRecordsSent et l'état gardé", () => {
  it("annonce les records battus seulement, compte l'envoi, puis se relit", () => {
    // Pendant ce passage, le record du plus grand groupe est lu plus bas qu'annoncé : il ne doit pas redescendre.
    const seen = records({ streak: { wins: 7, endedAt: "2026-11-07T10:00:00.000Z" }, biggestGroup: { players: 4, at: "2026-10-02T20:00:00.000Z" } });
    const alert: RecordAlert = { beaten: [{ key: "streak", before: 5, after: 7 }], records: seen };
    const state = markRecordsSent({ announced: records(), sent: ["2026-11-01T09:00:00.000Z"] }, alert, DAY);
    expect(state.announced).toEqual(records({ streak: { wins: 7, endedAt: "2026-11-07T10:00:00.000Z" } }));
    expect(state.sent).toEqual([DAY.toISOString()]);
    expect(parseRecordAlertState(JSON.stringify(state))).toEqual({ state, warning: null });
  });
  it("signale un état illisible au lieu de se taire", () => {
    expect(parseRecordAlertState("{")).toMatchObject({ state: null });
    expect(parseRecordAlertState(JSON.stringify({ announced: {}, sent: [] })).warning).toContain("illisible");
    expect(parseRecordAlertState(null)).toEqual({ state: null, warning: null });
  });
});

describe("le message", () => {
  const after = records({ streak: { wins: 7, endedAt: "2026-11-07T10:00:00.000Z" }, bestDay: { date: "2026-11-07", wins: 41, games: 80 } });
  const alert: RecordAlert = { beaten: [{ key: "streak", before: 5, after: 7 }, { key: "bestDay", before: 40, after: 41 }], records: after };
  it("dit chaque record avec sa date et l'ancienne marque", () => {
    expect(plain(recordHeadline(alert, "GAL"))).toBe("[GAL] bat 2 records du clan");
    expect(plain(recordHeadline({ ...alert, beaten: alert.beaten.slice(0, 1) }, "GAL"))).toBe("[GAL] bat un record du clan");
    expect(plain(recordLine(alert.beaten[0]!, after))).toBe("Plus longue série de victoires : 7 victoires d'affilée, la dernière le 7 nov. 2026. Avant : 5.");
    expect(plain(recordLine(alert.beaten[1]!, after))).toBe("Meilleure journée : 41 victoires sur 80 parties, le 7 nov. 2026. Avant : 40.");
  });
  it("avec l'image : le fichier joint et un bouton vers les records, sans aucun texte", () => {
    expect(recordPayload(alert, "GAL", "https://les-gaulois.github.io/", "2026-04-10", "2026-11-07T13:53:00.000Z", { alt: "Description.", filename: "record-du-clan.png" })).toEqual({
      avatar_url: "https://les-gaulois.github.io/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "record-du-clan.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir les records", url: "https://les-gaulois.github.io/records" }] }],
    });
  });
  it("le texte de secours donne le lien de la page, la source datée, et ne peut mentionner personne", () => {
    const payload = recordPayload(alert, "GAL", "https://les-gaulois.github.io/", "2026-04-10", "2026-11-07T13:53:00.000Z", null) as { content: string; allowed_mentions: unknown };
    expect(payload.content).toContain("**[GAL] bat 2 records du clan**");
    expect(payload.content).toContain("(<https://les-gaulois.github.io/records>)");
    expect(plain(payload.content)).toContain("-# Depuis le 10 avr. 2026, parties publiques en équipe sous le tag, tous joueurs du clan confondus. Collecte du 7 nov. 2026, 14:53.");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload).not.toHaveProperty("components");
  });
});

describe("sendRecords", () => {
  const link = "https://discord.com/api/webhooks/1/secret";
  const alert: RecordAlert = { beaten: [{ key: "streak", before: 5, after: 7 }], records: better };
  const setup = (over: Partial<RecordSendDeps> = {}) => {
    const lines: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps: RecordSendDeps = { link, alert, renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description de l'image." }), tag: "GAL", siteUrl: "https://x.test", archiveStart: "2026-04-10", coveredUntil: "2026-11-07T13:53:00.000Z", fetch: post as unknown as typeof fetch, log: (l) => lines.push(l), ...over };
    return { deps, lines, post };
  };
  it("envoie l'image seule et son bouton, refuse les redirections et ne laisse jamais sortir le lien", async () => {
    const { deps, post, lines } = setup();
    expect(await sendRecords(deps)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${link}?with_components=true`);
    expect(init.redirect).toBe("error");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    const sent = JSON.parse(String(form.get("payload_json")));
    expect(sent).toMatchObject({ attachments: [{ id: 0, filename: "record-du-clan.png", description: "Description de l'image." }] });
    expect(sent).not.toHaveProperty("content");
    expect((form.get("files[0]") as File).type).toBe("image/png");
    expect(lines).toEqual([]);
  });
  it("part en texte si l'image ne se dessine pas", async () => {
    const { deps, post, lines } = setup({ renderImage: () => Promise.reject(new Error("police")) });
    expect(await sendRecords(deps)).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(link);
    // Le secours aussi refuse les redirections : sinon, un record serait noté annoncé sans message posté.
    expect(init.redirect).toBe("error");
    expect(init.method).toBe("POST");
    expect(String(JSON.parse(String(init.body)).content)).toContain("**[GAL] bat un record du clan**");
    expect(lines.join(" ")).toContain("Records : image impossible à dessiner");
    expect(lines.join(" ")).not.toContain("secret");
  });
  it("dit un refus ou une panne sans le lien, et rend faux", async () => {
    const refused = setup({ fetch: (async () => new Response("", { status: 429 })) as unknown as typeof fetch });
    expect(await sendRecords(refused.deps)).toBe(false);
    const down = setup({ fetch: (async () => { throw new TypeError(`fetch failed ${link}`); }) as unknown as typeof fetch });
    expect(await sendRecords(down.deps)).toBe(false);
    const lines = [...refused.lines, ...down.lines];
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toContain("Records");
    expect(lines.join(" ")).not.toContain("secret");
  });
});

describe("recordAlertPass", () => {
  const deps = { unreadable: [] as string[], gazetteLastSent: "2026-11-02", now: DAY, log: () => {} };
  it("attend la première gazette du salon", async () => {
    expect(await recordAlertPass({ ...deps, stored: null, records: better, gazetteLastSent: "2026-10-26", send: async () => true })).toEqual({ state: null, failed: false });
  });
  it("ne compare ni ne note rien si un fichier de sessions est illisible", async () => {
    const lines: string[] = [];
    const result = await recordAlertPass({ ...deps, stored: { announced: records(), sent: [] }, records: better, unreadable: ["2026-10.json"], send: async () => true, log: (l) => lines.push(l) });
    expect(result).toEqual({ state: null, failed: false });
    expect(lines[0]).toContain("illisible");
  });
  it("note le départ sans envoyer, puis envoie et annonce, et garde l'attente après un refus", async () => {
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    const first = await recordAlertPass({ ...deps, stored: null, records: records(), send: async () => true, log });
    expect(first.state?.announced).toEqual(records());
    const refused = await recordAlertPass({ ...deps, stored: first.state, records: better, send: async () => false, log });
    expect(refused).toEqual({ state: null, failed: true });
    const sent = await recordAlertPass({ ...deps, stored: first.state, records: better, send: async () => true, log });
    expect(sent.state?.announced.streak.wins).toBe(7);
    expect(lines.some((l) => l.includes("envoyé"))).toBe(true);
  });
  it("sans record calculable au premier passage, n'écrit rien", async () => {
    expect(await recordAlertPass({ ...deps, stored: null, records: null, send: async () => true })).toEqual({ state: null, failed: false });
  });
});
