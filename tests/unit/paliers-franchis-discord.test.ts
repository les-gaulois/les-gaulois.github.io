import { describe, expect, it, vi } from "vitest";
import { lastSentAnyFormat } from "../../src/lib/gazette-discord";
import type { MilestonePlayer, MilestoneState, PendingMilestones } from "../../src/lib/paliers-franchis";
import { MAX_CONTENT, MAX_NAMES, milestoneContent, milestonePass, milestonePayload, sendMilestones, type MilestonePassDeps, type MilestoneSendDeps } from "../../src/lib/paliers-franchis-discord";
import type { StoredMember, StoredMembers } from "../../src/lib/schemas";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const PENDING: PendingMilestones = { since: "2026-11-08T01:53:38.580Z", until: "2026-11-08T21:53:00.000Z", players: [{ id: "c/1", tier: 1000 }, { id: "a", tier: 100 }] };
const players: MilestonePlayer[] = [
  { id: "c/1", username: "Marc", tier: 1000 },
  { id: "a", username: "Alpha", tier: 100 },
];

describe("milestonePayload", () => {
  it("relie chaque pseudo à sa fiche, dit le palier et la période, et ne peut mentionner personne", () => {
    const payload = milestonePayload(players, PENDING, "GAL", SITE, null);
    expect(plain(String(payload["content"])).split("\n")).toEqual([
      "**Paliers franchis chez [GAL]**",
      "🏅 [**Marc**](<https://x.test/membres/c%2F1/>) passe le cap des 1 000 victoires",
      "🏅 [**Alpha**](<https://x.test/membres/a/>) passe le cap des 100 victoires",
      "[Voir les paliers du clan sur le site](<https://x.test/membres/#paliers>)",
      "-# Victoires en équipe sous le tag, entre les relevés de la liste des membres du 8 nov., 02:53 et du 8 nov., 22:53. Membres avec pseudo public seulement. Un palier compte d'abord les parties jouées, pas le niveau.",
    ]);
    expect(payload).toMatchObject({ allowed_mentions: { parse: [] }, avatar_url: "https://x.test/generated/icon-192.png" });
    expect(payload).not.toHaveProperty("components");
  });
  it("avec l'image : aucun texte ; un seul joueur, le bouton ouvre sa fiche ; plusieurs, la page des paliers", () => {
    const one = milestonePayload([players[0]!], PENDING, "GAL", SITE, { alt: "Description.", filename: "paliers-franchis.png" });
    expect(one).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "paliers-franchis.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir la fiche de Marc", url: "https://x.test/membres/c%2F1/" }] }],
    });
    const many = milestonePayload(players, PENDING, "GAL", SITE, { alt: "Description.", filename: "paliers-franchis.png" });
    expect(many).toMatchObject({ components: [{ type: 1, components: [{ label: "Voir les paliers du clan", url: "https://x.test/membres/#paliers" }] }] });
    expect(many).not.toHaveProperty("content");
  });
  it("le texte de secours accorde son titre : au singulier pour un seul joueur", () => {
    expect(String(milestonePayload([players[0]!], PENDING, "GAL", SITE, null)["content"])).toContain("**Palier franchi chez [GAL]**");
    expect(String(milestonePayload(players, PENDING, "GAL", SITE, null)["content"])).toContain("**Paliers franchis chez [GAL]**");
  });
  it("un pseudo ne peut ni mettre en forme le message, ni y glisser un lien ou une mention", () => {
    const odd: MilestonePlayer = { id: "o", username: "*x*](<https://y.test>) @everyone", tier: 250 };
    const content = String(milestonePayload([odd], PENDING, "GAL", SITE, null)["content"]);
    expect(content).toContain("[**\\*x\\*\\]\\(\\<https\\:\\/\\/y.test\\>\\) \\@everyone**](<https://x.test/membres/o/>)");
    expect(content).not.toContain("](<https://y.test>)");
  });
  it("au-delà de quinze pseudos, compte les autres au lieu de les écrire, et le texte d'un bouton reste dans la limite de Discord", () => {
    const crowd = Array.from({ length: MAX_NAMES + 3 }, (_, i) => ({ id: `p${i}`, username: `Joueur${i}`, tier: 100 }));
    const content = String(milestonePayload(crowd, PENDING, "GAL", SITE, null)["content"]);
    expect(content).toContain("Joueur14");
    expect(content).not.toContain("Joueur15");
    expect(content).toContain("Et 3 autres membres.");
    expect(content).not.toContain("page des membres");
    expect(content.length).toBeLessThan(2000);
    const long = milestonePayload([{ id: "l", username: "W".repeat(120), tier: 100 }], PENDING, "GAL", SITE, { alt: "", filename: "f.png" });
    const label = (long["components"] as { components: { label: string }[] }[])[0]!.components[0]!.label;
    expect(label.length).toBeLessThanOrEqual(80);
  });
  it("retire des pseudos, comptés à la place, plutôt que de dépasser la limite de Discord avec de longs pseudos à échapper", () => {
    // Seize pseudos de 25 caractères qui doublent tous à l'échappement, au palier le plus long à écrire.
    const crowd = Array.from({ length: 16 }, (_, i) => ({ id: `identifiant${i}`, username: "_".repeat(24) + String.fromCharCode(97 + i), tier: 1000 }));
    const { content, written } = milestoneContent(crowd, PENDING, "GAL", SITE);
    expect(content.length).toBeLessThanOrEqual(MAX_CONTENT);
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(MAX_NAMES);
    expect(content).toContain(`Et ${16 - written} autres membres.`);
    expect(String(milestonePayload(crowd, PENDING, "GAL", SITE, null)["content"])).toBe(content);
  });
});

describe("sendMilestones", () => {
  const setup = (over: Partial<MilestoneSendDeps> = {}) => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps: MilestoneSendDeps = { link: WEBHOOK, players, pending: PENDING, renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description." }), tag: "GAL", siteUrl: SITE, fetch: post as unknown as typeof fetch, log: (line) => logs.push(line), ...over };
    return { deps, logs, post };
  };

  it("envoie l'image et le bouton en un seul message, sans suivre de redirection", async () => {
    const { deps, post } = setup();
    expect(await sendMilestones(deps)).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(init.redirect).toBe("error");
    const form = init.body as FormData;
    const sent = JSON.parse(String(form.get("payload_json")));
    expect(sent).toMatchObject({ attachments: [{ filename: "paliers-franchis.png" }] });
    // Le message est l'image seule : aucun texte ne l'accompagne.
    expect(sent).not.toHaveProperty("content");
    expect((form.get("files[0]") as File).type).toBe("image/png");
  });
  it("si l'image ne se dessine pas, ou si Discord refuse son format, le message part en texte", async () => {
    const broken = setup({ renderImage: async () => { throw new Error("un caractère ne peut pas être dessiné"); } });
    expect(await sendMilestones(broken.deps)).toBe(true);
    const [url, init] = broken.post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    expect(String(JSON.parse(String(init.body)).content)).toContain("**Paliers franchis chez [GAL]**");
    expect(broken.logs.join(" ")).toContain("Paliers : image impossible à dessiner");
    const answers = [new Response("non", { status: 413 }), new Response(null, { status: 204 })];
    const refused = setup({ fetch: vi.fn(async () => answers.shift()!) as unknown as typeof fetch });
    expect(await sendMilestones(refused.deps)).toBe(true);
  });
  it("une panne n'envoie rien de plus dans ce passage, et le lien n'est écrit nulle part", async () => {
    const down = vi.fn(async () => new Response("panne", { status: 503 }));
    const { deps, logs } = setup({ fetch: down as unknown as typeof fetch });
    expect(await sendMilestones(deps)).toBe(false);
    expect(down).toHaveBeenCalledTimes(1);
    expect(logs.join(" ")).toContain("503");
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
});

describe("milestonePass", () => {
  const member = (publicId: string, username: string | null, wins: number): StoredMember => ({ role: "member", joinedAt: "2026-10-01T00:00:00.000Z", publicId, username, team: { wins, losses: 1 } });
  const members = (fetchedAt: string, rows: StoredMember[]): StoredMembers => ({ fetchedAt, total: rows.length, members: rows });
  const START: MilestoneState = { reading: { at: "2026-11-08T01:53:38.580Z", tiers: { a: 0, b: 100 } }, pending: null, lastSentOn: null };
  const later = members("2026-11-09T00:53:00.000Z", [member("a", "Alpha", 104), member("b", "Beta", 130)]);
  // 10 h 53 à Paris, après la gazette du 9 novembre.
  const NOW = new Date("2026-11-09T09:53:00.000Z");
  const setup = (over: Partial<MilestonePassDeps> = {}) => {
    const logs: string[] = [];
    const send = vi.fn(async () => true);
    const deps: MilestonePassDeps = { stored: START, members: later, gazetteLastSent: "2026-11-02", now: NOW, send, log: (line) => logs.push(line), ...over };
    return { deps, logs, send };
  };

  it("avant la gazette du lundi 9 novembre, rien ne part et rien n'est noté", async () => {
    const { deps, send, logs } = setup({ gazetteLastSent: "2026-10-26" });
    expect(await milestonePass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("gazette");
  });
  it("au premier passage, note les paliers du moment sans rien envoyer", async () => {
    const { deps, send } = setup({ stored: null });
    expect(await milestonePass(deps)).toEqual({ state: { reading: { at: later.fetchedAt, tiers: { a: 100, b: 100 } }, tiersFrom: 50, pending: null, lastSentOn: null }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("envoie les paliers franchis avec le pseudo du moment, puis note le jour", async () => {
    const { deps, send } = setup();
    expect(await milestonePass(deps)).toEqual({ state: { reading: { at: later.fetchedAt, tiers: { a: 100, b: 100 } }, tiersFrom: 50, pending: null, lastSentOn: "2026-11-09" }, failed: false });
    expect(send).toHaveBeenCalledWith([{ id: "a", username: "Alpha", tier: 100 }], { since: START.reading.at, until: later.fetchedAt, players: [{ id: "a", tier: 100 }] });
  });
  it("après un refus de Discord, garde les paliers en attente : le passage suivant réessaie", async () => {
    const { deps } = setup({ send: async () => false });
    const result = await milestonePass(deps);
    expect(result.failed).toBe(true);
    expect(result.state?.pending?.players).toEqual([{ id: "a", tier: 100 }]);
    expect(result.state?.lastSentOn).toBeNull();
  });
  it("la nuit aussi, envoie sans attendre le matin", async () => {
    // 6 h 53 à Paris : plus d'heures de silence depuis le 14 novembre 2026.
    const { deps, send } = setup({ now: new Date("2026-11-09T05:53:00.000Z") });
    const result = await milestonePass(deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.state).toMatchObject({ pending: null, lastSentOn: "2026-11-09" });
  });
  it("sans liste des membres lisible, ne fait rien", async () => {
    const { deps, send } = setup({ members: null });
    expect(await milestonePass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("sans rien de nouveau, il n'y a rien à écrire", async () => {
    const { deps } = setup({ stored: { ...START, reading: { at: later.fetchedAt, tiers: { a: 100, b: 100 } }, tiersFrom: 50 } });
    expect(await milestonePass(deps)).toEqual({ state: null, failed: false });
  });
  it("un état noté à partir de 100 passe une fois à 50, sans rien annoncer de plus", async () => {
    const { deps, send } = setup({ stored: { ...START, reading: { at: later.fetchedAt, tiers: { a: 100, b: 100 } } } });
    expect(await milestonePass(deps)).toEqual({ state: { ...START, reading: { at: later.fetchedAt, tiers: { a: 100, b: 100 } }, tiersFrom: 50 }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("après le message du jour, une nouvelle relecture est notée et attend le lendemain", async () => {
    const { deps, send } = setup({ stored: { ...START, lastSentOn: "2026-11-09" } });
    const result = await milestonePass(deps);
    expect(send).not.toHaveBeenCalled();
    expect(result.failed).toBe(false);
    expect(result.state?.pending?.players).toEqual([{ id: "a", tier: 100 }]);
    expect(result.state?.lastSentOn).toBe("2026-11-09");
  });
});

describe("lastSentAnyFormat", () => {
  it("lit la dernière édition envoyée, quel que soit son format, et rien d'un fichier absent ou illisible", () => {
    expect(lastSentAnyFormat(JSON.stringify({ lastSent: "2026-11-02", sentAt: "2026-11-09T08:53:00.000Z", format: 1 }))).toBe("2026-11-02");
    expect(lastSentAnyFormat(JSON.stringify({ lastSent: "2026-10-26", sentAt: "2026-11-07T21:58:37.455Z" }))).toBe("2026-10-26");
    expect(lastSentAnyFormat(null)).toBeNull();
    expect(lastSentAnyFormat("{")).toBeNull();
    expect(lastSentAnyFormat("{}")).toBeNull();
  });
});
