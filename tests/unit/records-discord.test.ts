import { describe, expect, it } from "vitest";
import { markRecordsSent, parseRecordAlertState, planRecordAlert, postRecordMessage, recordAlertPass, recordHeadline, recordLine, recordPayload, type RecordAlert } from "../../src/lib/records-discord";
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
  it("attend le matin la nuit, et n'envoie qu'une alerte de record par jour", () => {
    expect(planRecordAlert({ announced: records(), sent: [] }, better, NIGHT).reason).toContain("la nuit");
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
  it("part en texte, avec le lien de la page, la source datée et sans mention possible", () => {
    const payload = recordPayload(alert, "GAL", "https://les-gaulois.github.io/", "2026-04-10", "2026-11-07T13:53:00.000Z") as { content: string; allowed_mentions: unknown };
    expect(payload.content).toContain("**[GAL] bat 2 records du clan**");
    expect(payload.content).toContain("(<https://les-gaulois.github.io/records>)");
    expect(plain(payload.content)).toContain("Collecte du 7 nov. 2026, 14:53.");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });
});

describe("postRecordMessage", () => {
  const link = "https://discord.com/api/webhooks/1/secret";
  it("refuse les redirections et ne laisse jamais sortir le lien", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const lines: string[] = [];
    const ok = await postRecordMessage(link, { content: "x" }, (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch, (l) => lines.push(l));
    expect(ok).toBe(true);
    expect(calls[0]?.init.redirect).toBe("error");
    expect(calls[0]?.init.method).toBe("POST");
    expect(lines).toEqual([]);
  });
  it("dit un refus ou une panne sans le lien, et rend faux", async () => {
    const lines: string[] = [];
    expect(await postRecordMessage(link, {}, (async () => new Response("", { status: 429 })) as unknown as typeof fetch, (l) => lines.push(l))).toBe(false);
    expect(await postRecordMessage(link, {}, (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch, (l) => lines.push(l))).toBe(false);
    expect(lines).toHaveLength(2);
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
