import { describe, expect, it, vi } from "vitest";
import { rankReading } from "../../src/lib/alerts";
import type { CourseInputs, EveningRace } from "../../src/lib/course-soir";
import { coursePass, coursePayload, sendCourse, type CourseSendDeps } from "../../src/lib/course-soir-discord";
import type { StoredLeaderboard, StoredSession } from "../../src/lib/schemas";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");

const NOW = new Date("2026-11-11T20:53:00.000Z");
const clan = (clanTag: string, weightedWins: number) => ({ clanTag, games: 100, wins: 50, losses: 50, playerSessions: 200, weightedWins, weightedLosses: 10, weightedWLRatio: 1 });
const LEADERBOARD: StoredLeaderboard = {
  start: "2026-08-13T20:39:16.298Z",
  end: "2026-11-11T20:39:16.298Z",
  fetchedAt: "2026-11-11T20:53:01.000Z",
  clans: [clan("UN", 10938.86), clan("GAL", 2308.51), clan("ITA", 2122.82), clan("AST", 1942.04), clan("EU", 1357.07)],
};
const reading = rankReading(LEADERBOARD, "GAL");
if (!reading) throw new Error("GAL doit être dans la liste");
const RACE: EveningRace = {
  reading,
  points: { since: "2026-11-10T19:00:00.000Z", until: "2026-11-11T19:00:00.000Z", total: { games: 66, points: 71.58 }, group: { games: 48, points: 69.41 }, solo: { games: 18, points: 2.17 } },
  changes: { score: 2.25, above: -25.1, below: 12.3 },
};

describe("coursePayload", () => {
  it("dit la place, les écarts, les points et d'où viennent les chiffres, et ne peut mentionner personne", () => {
    const payload = coursePayload(RACE, "GAL", "https://x.test/", null);
    expect(plain(String(payload["content"])).split("\n")).toEqual([
      "**La course du soir : [GAL] 2e du classement des clans**",
      "Score : 2 308,51 (+2,25 depuis hier). 8 630,35 de retard sur [UN], 1er (retard en baisse de 25,10 depuis hier). 185,69 d'avance sur [ITA], 3e (avance en hausse de 12,30 depuis hier).",
      "Points gagnés du 10 nov., 20 h au 11 nov., 20 h : **+71,58**. À plusieurs : +69,41 en 48 parties. Seul sous le tag : +2,17 en 18 parties.",
      "[Voir le classement sur le site](<https://x.test/classement>)",
      "-# Liste officielle d'OpenFront, arrêtée au 11 nov., 21:39. Score : victoires pondérées, demi-vie de 30 jours. Points gagnés : ce que les parties ont ajouté au score. Le score perd aussi chaque jour une part de sa valeur : il monte moins que ces points, et peut baisser.",
    ]);
    expect(payload).toMatchObject({ allowed_mentions: { parse: [] }, avatar_url: "https://x.test/generated/icon-192.png" });
    expect(payload).not.toHaveProperty("attachments");
    expect(payload).not.toHaveProperty("components");
    expect(String(payload["content"]).length).toBeLessThan(2000);
  });
  it("avec l'image, joint le fichier, sa description et un bouton vers le classement, sans aucun texte", () => {
    expect(coursePayload(RACE, "GAL", "https://x.test", { alt: "Description.", filename: "course-du-soir.png" })).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "course-du-soir.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir le classement", url: "https://x.test/classement" }] }],
    });
  });
  it("le tag d'un autre clan ne peut ni mettre en forme le message, ni y glisser un lien ou une mention", () => {
    const odd: EveningRace = { ...RACE, reading: { ...reading, below: { tag: "*_[x](<https://y.test>)@here", rank: 3, gap: 1 } } };
    const content = String(coursePayload(odd, "GAL", "https://x.test", null)["content"]);
    expect(content).toContain("[\\*\\_\\[x\\]\\(\\<https\\:\\/\\/y.test\\>\\)\\@here]");
    expect(content).not.toContain("](<https://y.test>)");
  });
  it("sans message la veille, les écarts partent sans comparaison", () => {
    const content = plain(String(coursePayload({ ...RACE, changes: { score: null, above: null, below: null } }, "GAL", "https://x.test", null)["content"]));
    expect(content).toContain("Score : 2 308,51. 8 630,35 de retard sur [UN], 1er. 185,69 d'avance sur [ITA], 3e.");
    expect(content).not.toContain("depuis hier");
  });
});

describe("sendCourse", () => {
  const setup = (over: Partial<CourseSendDeps> = {}) => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps: CourseSendDeps = { link: WEBHOOK, race: RACE, renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description de l'image." }), tag: "GAL", siteUrl: "https://x.test", fetch: post as unknown as typeof fetch, log: (line) => logs.push(line), ...over };
    return { deps, logs, post };
  };
  const noSecret = (logs: string[]) => {
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  };

  it("envoie l'image et le bouton en un seul message, sans suivre de redirection", async () => {
    const { deps, post, logs } = setup();
    expect(await sendCourse(deps)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(init.redirect).toBe("error");
    const form = init.body as FormData;
    const sent = JSON.parse(String(form.get("payload_json")));
    expect(sent).toMatchObject({ attachments: [{ id: 0, filename: "course-du-soir.png", description: "Description de l'image." }] });
    // Le message est l'image seule : aucun texte ne l'accompagne.
    expect(sent).not.toHaveProperty("content");
    expect((form.get("files[0]") as File).type).toBe("image/png");
    noSecret(logs);
  });
  it("part en texte si l'image ne se dessine pas, ou si Discord la refuse", async () => {
    const broken = setup({ renderImage: async () => Promise.reject(new Error("police absente")) });
    expect(await sendCourse(broken.deps)).toBe(true);
    expect(broken.post).toHaveBeenCalledTimes(1);
    expect((broken.post.mock.calls[0] as unknown as [string])[0]).toBe(WEBHOOK);
    expect(broken.logs.join("\n")).toContain("Course : image impossible à dessiner");

    const refused = setup();
    refused.post.mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect(await sendCourse(refused.deps)).toBe(true);
    expect(refused.post).toHaveBeenCalledTimes(2);
    noSecret([...broken.logs, ...refused.logs]);
  });
  it("un lien mort ou une panne : échec, à retenter au passage suivant", async () => {
    const dead = setup();
    dead.post.mockResolvedValue(new Response(null, { status: 404 }));
    expect(await sendCourse(dead.deps)).toBe(false);
    const down = setup();
    down.post.mockRejectedValue(new Error(`fetch failed ${WEBHOOK}`));
    expect(await sendCourse(down.deps)).toBe(false);
    noSecret([...dead.logs, ...down.logs]);
  });
});

describe("coursePass", () => {
  const sessions: StoredSession[] = [{ gameId: "a", clanPlayerCount: 3, hasWon: true, numTeams: 3, playerTeams: "Trios", totalPlayerCount: 30, gameStart: "2026-11-11T08:00:00.000Z", score: 1.53 }];
  const deps = (send: (race: EveningRace) => Promise<boolean>, over: Partial<CourseInputs> = {}) => {
    const logs: string[] = [];
    return { logs, pass: { stored: null, leaderboard: LEADERBOARD, sessions, coveredUntil: "2026-11-11T20:53:40.000Z", unreadable: [], now: NOW, tag: "GAL", send, log: (line: string) => logs.push(line), ...over } };
  };

  it("envoie, puis note le jour et les écarts", async () => {
    const send = vi.fn(async () => true);
    const { pass, logs } = deps(send);
    const result = await coursePass(pass);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(false);
    expect(result.state?.sentOn).toBe("2026-11-11");
    expect(Object.keys(result.state?.gaps ?? {})).toEqual(["UN", "ITA"]);
    expect(plain(logs.join("\n"))).toContain("Course : 2e du classement, +1,53 points du 10 nov., 20 h au 11 nov., 20 h, envoyée.");
  });
  it("après un refus de Discord, ne note rien : le passage suivant réessaie", async () => {
    const result = await coursePass(deps(async () => false).pass);
    expect(result).toEqual({ state: null, failed: true });
  });
  it("hors de l'heure, n'envoie rien et le dit dans le journal", async () => {
    const send = vi.fn(async () => true);
    const { pass, logs } = deps(send, { now: new Date("2026-11-11T12:00:00.000Z") });
    expect(await coursePass(pass)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
    expect(logs).toEqual(["Course : rien à envoyer (le message part à partir de 21 h)."]);
  });
});
