import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import { dayCount, dayReport, dayTitle, hierContent, hierPass, hierPayload, hierTarget, longestStreak, sendHier, type DayReport, type HierPassDeps } from "../../src/lib/hier-discord";
import { hierCard, hierImageAlt } from "../../src/lib/hier-image";
import type { JournalRow } from "../../src/lib/journal";
import type { StoredSession } from "../../src/lib/schemas";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

const session = (gameId: string, gameStart: string, hasWon: boolean, totalPlayerCount = 10): StoredSession => ({
  gameId,
  clanPlayerCount: 2,
  hasWon,
  numTeams: 2,
  playerTeams: "Duos",
  totalPlayerCount,
  gameStart,
  score: 1,
});
// En novembre, Paris est à UTC+1 : le mardi 10 novembre à Paris va du 9 à 23 h UTC au 10 à 23 h UTC.
const SESSIONS: StoredSession[] = [
  session("y", "2026-11-09T10:00:00.000Z", true),
  session("z", "2026-11-09T11:00:00.000Z", false),
  session("a", "2026-11-09T23:30:00.000Z", true),
  session("b", "2026-11-10T09:00:00.000Z", true),
  session("c", "2026-11-10T10:00:00.000Z", false),
  session("d", "2026-11-10T11:00:00.000Z", true),
  session("e", "2026-11-10T12:00:00.000Z", true),
  // Seul contre des robots : comptée dans les parties du jour, pas dans la série.
  session("f", "2026-11-10T13:00:00.000Z", true, 1),
  session("g", "2026-11-10T14:00:00.000Z", true),
  session("h", "2026-11-10T23:30:00.000Z", true),
];
const row = (id: string, at: string, gaulois: number, seconds: number | null = 1500): JournalRow => ({ id, at, won: true, format: "Duos", gaulois, players: 40, map: "World", seconds, allies: [], rivals: [] });
const ROWS = [row("d", "2026-11-10T11:00:00.000Z", 5), row("b", "2026-11-10T09:00:00.000Z", 3)];
const REPORT = dayReport(SESSIONS, ROWS, "2026-11-10");

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. */
function expectClean(card: GazetteCard): void {
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - measure(t.text, t.font, t.size) : t.anchor === "middle" ? t.x - measure(t.text, t.font, t.size) / 2 : t.x);
  const rightOf = (t: CardText) => leftOf(t) + measure(t.text, t.font, t.size);
  for (const t of card.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(card.width);
    expect(t.y, t.text).toBeLessThanOrEqual(card.height);
  }
  for (const a of card.texts) {
    for (const b of card.texts) {
      if (a === b || a.y !== b.y) continue;
      expect(rightOf(a) <= leftOf(b) || rightOf(b) <= leftOf(a), `« ${a.text} » et « ${b.text} » se chevauchent`).toBe(true);
    }
  }
  for (const r of card.rects) {
    expect(r.x + r.width).toBeLessThanOrEqual(card.width + 0.01);
    expect(r.y + r.height).toBeLessThanOrEqual(card.height);
  }
}

describe("le bilan d'un jour", () => {
  it("compte les parties et les victoires du jour de Paris, comme la courbe des jours", () => {
    expect(dayCount(SESSIONS, "2026-11-10")).toEqual({ day: "2026-11-10", games: 7, wins: 6 });
    expect(dayCount(SESSIONS, "2026-11-09")).toEqual({ day: "2026-11-09", games: 2, wins: 1 });
  });
  it("prend la plus longue série de la journée sans les parties jouées seul contre des robots", () => {
    expect(longestStreak(SESSIONS, "2026-11-10")).toBe(3);
    expect(longestStreak([session("x", "2026-11-10T09:00:00.000Z", false)], "2026-11-10")).toBe(0);
  });
  it("donne l'écart avec la veille, la série et la belle partie de l'accueil", () => {
    expect(REPORT).toMatchObject({ day: "2026-11-10", games: 7, wins: 6, previous: { day: "2026-11-09", games: 2, wins: 1 }, streak: 3 });
    expect(REPORT.best?.id).toBe("d");
  });
  it("sans partie relevée la veille, pas d'écart : ce n'est pas un zéro", () => {
    expect(dayReport(SESSIONS, ROWS, "2026-11-09").previous).toBeNull();
  });
  it("écrit le jour en clair", () => {
    expect(dayTitle("2026-11-10")).toBe("Mardi 10 novembre");
    expect(dayTitle("2026-11-01")).toBe("Dimanche 1er novembre");
  });
});

describe("hierTarget", () => {
  it("vise la veille, dès 9 h à Paris, quand la collecte a fini la journée", () => {
    expect(hierTarget(null, "2026-11-10", new Date("2026-11-11T08:53:00.000Z"))).toEqual({ day: "2026-11-10", reason: "" });
  });
  it("attend 9 h, la fin de la collecte, et ne part pas la nuit", () => {
    expect(hierTarget(null, "2026-11-10", new Date("2026-11-11T07:53:00.000Z")).reason).toBe("le message part à partir de 9 h");
    expect(hierTarget(null, "2026-11-09", new Date("2026-11-11T08:53:00.000Z")).reason).toBe("la collecte n'a pas encore fini la journée d'hier");
    expect(hierTarget(null, null, new Date("2026-11-11T08:53:00.000Z")).day).toBeNull();
    expect(hierTarget(null, "2026-11-10", new Date("2026-11-11T22:10:00.000Z")).reason).toContain("la nuit");
  });
  it("une seule fois par jour", () => {
    expect(hierTarget({ lastDay: "2026-11-10" }, "2026-11-10", new Date("2026-11-11T12:53:00.000Z")).reason).toBe("le bilan d'hier est déjà parti");
  });
});

describe("le message", () => {
  it("dit les chiffres, la série et la belle partie, avec le lien des parties, et ne peut mentionner personne", () => {
    expect(plain(hierContent(REPORT, "GAL", SITE)).split("\n")).toEqual([
      "**Hier chez les Gaulois** · Mardi 10 novembre",
      "🎯 6 victoires sur 7 parties, soit 85,7 %.",
      "🔥 Plus longue série : 3 victoires d'affilée.",
      "⭐ Belle partie à 12:00 : 5 Gaulois ensemble, victoire en 25 min.",
      "[Voir les dernières parties](<https://x.test/parties>)",
      "-# Parties du clan sous le tag [GAL], heure de Paris. Belle partie : celle où le plus de Gaulois jouaient ensemble.",
    ]);
    const payload = hierPayload(REPORT, "GAL", SITE, null);
    expect(payload).toMatchObject({ allowed_mentions: { parse: [] }, avatar_url: "https://x.test/generated/icon-192.png" });
    expect(payload).not.toHaveProperty("components");
  });
  it("sans série d'au moins deux victoires ni belle partie, ne les écrit pas", () => {
    const bare: DayReport = { ...REPORT, streak: 1, best: null };
    expect(hierContent(bare, "GAL", SITE)).not.toMatch(/série|Belle partie/);
  });
  it("avec l'image : le fichier joint et un bouton vers les dernières parties, sans aucun texte", () => {
    expect(hierPayload(REPORT, "GAL", SITE, { alt: "Description.", filename: "hier.png" })).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "hier.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir les dernières parties", url: "https://x.test/parties" }] }],
    });
  });
  it("part en texte si l'image ne se dessine pas, et n'écrit jamais le lien", async () => {
    const logs: string[] = [];
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const ok = await sendHier({ link: WEBHOOK, report: REPORT, renderImage: () => Promise.reject(new Error("police")), tag: "GAL", siteUrl: SITE, fetch: fetch as unknown as typeof globalThis.fetch, log: (l) => logs.push(l) });
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
});

describe("hierPass", () => {
  const NOW = new Date("2026-11-11T08:53:00.000Z");
  const setup = (over: Partial<HierPassDeps> = {}) => {
    const logs: string[] = [];
    const send = vi.fn(async () => true);
    const deps: HierPassDeps = { stored: { lastDay: "2026-11-09" }, sessions: SESSIONS, rows: ROWS, completeThrough: "2026-11-10", gazetteLastSent: "2026-11-02", now: NOW, send, log: (l) => logs.push(l), ...over };
    return { deps, logs, send };
  };
  it("envoie le bilan de la veille, puis note le jour", async () => {
    const { deps, send } = setup();
    expect(await hierPass(deps)).toEqual({ state: { lastDay: "2026-11-10" }, failed: false });
    expect(send).toHaveBeenCalledWith(REPORT);
  });
  it("au premier passage aussi : il n'y a pas de point de départ à attendre", async () => {
    const { deps, send } = setup({ stored: null });
    expect((await hierPass(deps)).state).toEqual({ lastDay: "2026-11-10" });
    expect(send).toHaveBeenCalled();
  });
  it("après un refus de Discord, ne note rien : le passage suivant réessaie", async () => {
    const { deps } = setup({ send: async () => false });
    expect(await hierPass(deps)).toEqual({ state: null, failed: true });
  });
  it("avant la gazette du lundi 9 novembre, rien ne part", async () => {
    const { deps, send } = setup({ gazetteLastSent: "2026-10-26" });
    expect(await hierPass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("un mois de sessions illisible : rien ne part, avec un avertissement", async () => {
    const { deps, send, logs } = setup({ sessions: null });
    expect(await hierPass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("::warning::Hier");
  });
  it("une journée sans partie relevée n'envoie rien, et n'est pas reprise", async () => {
    const { deps, send } = setup({ sessions: SESSIONS.filter((s) => s.gameStart < "2026-11-09T23:00:00.000Z") });
    expect(await hierPass(deps)).toEqual({ state: { lastDay: "2026-11-10" }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("hierCard", () => {
  it("dessine les trois chiffres avec leur écart, la série, la belle partie et l'adresse, sans rien faire déborder", () => {
    const card = hierCard(REPORT, "GAL", SITE, measure);
    const texts = card.texts.map((t) => plain(t.text));
    // Sans texte dans le message, l'image dit elle-même que ses jours et ses heures sont ceux de Paris.
    for (const expected of ["Parties du clan sous le tag [GAL]", "Hier chez les Gaulois", "Mardi 10 novembre, heure de Paris", "6", "VICTOIRES", "+5", "7", "PARTIES", "85,7 %", "TAUX DE VICTOIRE", "+35,7 pts", "Écarts par rapport à la veille, lundi 9 novembre", "Plus longue série", "3 victoires d'affilée", "Belle partie", "5 Gaulois ensemble, victoire", "à 12:00, en 25 min", "x.test/parties"]) {
      expect(texts).toContain(expected);
    }
    expectClean(card);
  });
  it("sans veille, sans série ni belle partie : ni écart, ni ligne, et l'image est plus courte", () => {
    const bare = hierCard({ ...REPORT, previous: null, streak: 0, best: null }, "GAL", SITE, measure);
    const texts = bare.texts.map((t) => t.text);
    expect(texts.join(" ")).not.toMatch(/Écarts|série|Belle partie/);
    expect(bare.height).toBeLessThan(hierCard(REPORT, "GAL", SITE, measure).height);
    expectClean(bare);
  });
  it("dit l'essentiel à un lecteur d'écran", () => {
    expect(plain(hierImageAlt(REPORT, "GAL"))).toBe(
      "Hier chez les Gaulois, mardi 10 novembre, heure de Paris, parties du clan sous le tag [GAL]. 6 victoires sur 7 parties, soit 85,7 %. La veille : 1 victoire sur 2 parties, soit 50,0 %. Plus longue série : 3 victoires d'affilée. Belle partie à 12:00 : 5 Gaulois ensemble, victoire en 25 min. Belle partie : celle où le plus de Gaulois jouaient ensemble.",
    );
  });
  it("se dessine avec les polices du site", async () => {
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const card = hierCard(REPORT, "GAL", SITE, fonts.width);
    const png = await renderGazetteCard(card, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ width: card.width, height: card.height, format: "png" });
  });
});
