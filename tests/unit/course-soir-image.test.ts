import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { rankReading } from "../../src/lib/alerts";
import type { EveningRace } from "../../src/lib/course-soir";
import { courseCard, courseImageAlt } from "../../src/lib/course-soir-image";
import { CARD_COLORS, GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import type { StoredLeaderboard } from "../../src/lib/schemas";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);
const SITE = "https://les-gaulois.github.io";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const words = (card: GazetteCard) => card.texts.map((t) => plain(t.text));

const clan = (clanTag: string, weightedWins: number) => ({ clanTag, games: 100, wins: 50, losses: 50, playerSessions: 200, weightedWins, weightedLosses: 10, weightedWLRatio: 1 });
const board = (clans: ReturnType<typeof clan>[]): StoredLeaderboard => ({ start: "2026-08-13T20:39:16.298Z", end: "2026-11-11T20:39:16.298Z", fetchedAt: "2026-11-11T20:53:01.000Z", clans });
const raceOf = (leaderboard: StoredLeaderboard, over: Partial<EveningRace> = {}): EveningRace => {
  const reading = rankReading(leaderboard, "GAL");
  if (!reading) throw new Error("GAL doit être dans la liste");
  return {
    reading,
    points: { since: "2026-11-10T19:00:00.000Z", until: "2026-11-11T19:00:00.000Z", total: { games: 66, points: 71.58 }, group: { games: 48, points: 69.41 }, solo: { games: 18, points: 2.17 } },
    changes: { score: 2.25, above: -25.1, below: 12.3 },
    ...over,
  };
};
const RACE = raceOf(board([clan("UN", 10938.86), clan("GAL", 2308.51), clan("ITA", 2122.82), clan("AST", 1942.04), clan("EU", 1357.07)]));
/** Des tags aussi longs que la liste officielle en permet, et des scores à cinq chiffres. */
const WIDE = raceOf(board([clan("WWWWWWW", 99999.99), clan("GAL", 88888.88), clan("MMMMMMM", 77777.77), clan("QQQQQQQ", 66666.66), clan("ÉÉÉÉÉÉÉ", 55555.55)]), {
  points: { since: "2026-11-10T19:00:00.000Z", until: "2026-11-11T19:00:00.000Z", total: { games: 1999, points: 99999.99 }, group: { games: 1000, points: 88888.88 }, solo: { games: 999, points: 11111.11 } },
  changes: { score: -98765.43, above: -12345.67, below: 23456.78 },
});

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. `width` : la mesure de contrôle. */
function expectClean(card: GazetteCard, width: Measure = measure): void {
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - width(t.text, t.font, t.size) : t.anchor === "middle" ? t.x - width(t.text, t.font, t.size) / 2 : t.x);
  const rightOf = (t: CardText) => leftOf(t) + width(t.text, t.font, t.size);
  for (const t of card.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(card.width);
    expect(t.y, t.text).toBeLessThanOrEqual(card.height);
  }
  for (const a of card.texts) {
    for (const b of card.texts) {
      if (a === b || a.y !== b.y) continue;
      const apart = rightOf(a) <= leftOf(b) || rightOf(b) <= leftOf(a);
      expect(apart, `« ${a.text} » et « ${b.text} » se chevauchent`).toBe(true);
    }
  }
  for (const r of card.rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(card.width + 0.01);
    expect(r.y + r.height).toBeLessThanOrEqual(card.height);
  }
}

describe("courseCard", () => {
  it("écrit la place, les clans autour, les écarts, les points et d'où ils viennent", () => {
    const card = courseCard(RACE, "GAL", SITE, measure);
    const text = words(card);
    for (const expected of [
      "Classement des clans",
      "La course du soir",
      "Liste officielle d'OpenFront, arrêtée au 11 nov., 21:39",
      "2e",
      "[UN]",
      "10 938,86",
      "[EU]",
      "8 630,35 de retard sur [UN], 1er (retard en baisse de 25,10 depuis hier)",
      "185,69 d'avance sur [ITA], 3e (avance en hausse de 12,30 depuis hier)",
      "Points gagnés du 10 nov., 20 h au 11 nov., 20 h",
      "+71,58",
      "À plusieurs : +69,41 en 48 parties",
      "Seul sous le tag : +2,17 en 18 parties",
      "Le score, qui perd chaque jour une part de sa valeur, a pris 2,25 depuis hier.",
      "les-gaulois.github.io/classement",
      "Score : victoires pondérées, demi-vie de 30 jours",
    ])
      expect(text).toContain(expected);
    expectClean(card);
  });
  it("met GAL en avant dans sa ligne, et seulement lui", () => {
    const card = courseCard(RACE, "GAL", SITE, measure);
    const marks = card.rects.filter((r) => r.width === 6 && r.color === CARD_COLORS.RED);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.y).toBe(200 + 82 + 12);
  });
  it("ne déborde pas et ne chevauche rien, avec de longs tags et de très grands chiffres", () => {
    expectClean(courseCard(WIDE, "GAL", SITE, measure));
  });
});

describe("courseImageAlt", () => {
  it("dit tout ce que l'image montre, et tient dans la limite de Discord", () => {
    expect(plain(courseImageAlt(RACE, "GAL"))).toBe(
      "La course du soir : [GAL] 2e du classement des clans. Liste officielle d'OpenFront, arrêtée au 11 nov., 21:39. Score : victoires pondérées, demi-vie de 30 jours. " +
        "1er [UN], 10 938,86 ; 2e [GAL], 2 308,51 ; 3e [ITA], 2 122,82 ; 4e [AST], 1 942,04 ; 5e [EU], 1 357,07. " +
        "Score : 2 308,51 (+2,25 depuis hier). " +
        "8 630,35 de retard sur [UN], 1er (retard en baisse de 25,10 depuis hier). 185,69 d'avance sur [ITA], 3e (avance en hausse de 12,30 depuis hier). " +
        "Points gagnés du 10 nov., 20 h au 11 nov., 20 h : +71,58. À plusieurs : +69,41 en 48 parties. Seul sous le tag : +2,17 en 18 parties. " +
        "Points gagnés : ce que les parties ont ajouté au score. Le score perd aussi chaque jour une part de sa valeur : il monte moins que ces points, et peut baisser.",
    );
    expect(courseImageAlt(WIDE, "GAL").length).toBeLessThanOrEqual(1024);
  });
});

describe("renderGazetteCard, pour la course du soir", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("ne déborde pas et ne chevauche rien avec la vraie police", () => {
    expectClean(courseCard(RACE, "GAL", SITE, fonts.width), fonts.width);
    expectClean(courseCard(WIDE, "GAL", SITE, fonts.width), fonts.width);
  });
  it("dessine une vraie image PNG, avec le logo", async () => {
    const card = courseCard(RACE, "GAL", SITE, fonts.width);
    const png = await renderGazetteCard(card, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 1200, height: card.height });
    const { x, y, size } = card.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });
});
