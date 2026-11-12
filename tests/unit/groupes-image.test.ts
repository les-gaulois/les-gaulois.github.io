import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GazetteFonts, renderGazetteCard } from "../../src/lib/gazette-image";
import type { WeekGroups } from "../../src/lib/groupes-discord";
import { groupsCard, groupsImageAlt, shareTiles } from "../../src/lib/groupes-image";
import { approx, expectClean, plain, words } from "./card-checks";

const SITE = "https://les-gaulois.github.io";
const duo = (a: string, b: string, wins: number, games: number) => ({ a: { id: a, name: a }, b: { id: b, name: b }, wins, games });
const WEEK: WeekGroups = {
  monday: "2026-11-02",
  games: 412,
  groupGames: 251,
  points: 200,
  groupPoints: 194,
  perGame: { "1": 0.04, "2": 0.31, "3": 0.72, "4": 1.86 },
  duos: [duo("Alpha", "Bravo", 12, 15), duo("Alpha", "Charlie", 9, 14), duo("Bravo", "Delta", 9, 10)],
};

describe("groupsCard", () => {
  it("écrit les deux parts, les points par partie selon le nombre de Gaulois, et chaque duo avec ses victoires et ses parties", () => {
    const card = groupsCard(WEEK, "GAL", SITE, approx);
    const text = words(card);
    for (const expected of [
      "Parties du clan sous le tag [GAL]",
      "Jouer ensemble",
      "Semaine du 2 nov. au 8 nov.",
      "61 %",
      "des 412 parties se sont jouées à plusieurs",
      "97 %",
      "des points gagnés viennent de ces parties",
      "Points par partie, selon le nombre de Gaulois",
      "0,04",
      "seul",
      "0,31",
      "à 2",
      "0,72",
      "à 3",
      "1,86",
      "à 4 et plus",
      "Les duos qui ont le plus gagné ensemble",
      "12 victoires",
      "Alpha et Bravo",
      "sur 15 parties",
      "Alpha et Charlie",
      "sur 14 parties",
      "Bravo et Delta",
      "sur 10 parties",
      "les-gaulois.github.io/membres",
      "Les duos comptent d'abord le temps passé à jouer à deux, pas un niveau.",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text.filter((t) => t === "9 victoires")).toHaveLength(2);
    expectClean(card);
  });
  it("les deux grands chiffres sont ceux du bilan, arrondis comme dans le texte de secours", () => {
    expect(shareTiles(WEEK).map((t) => plain(t.value))).toEqual(["61 %", "97 %"]);
    expect(shareTiles({ ...WEEK, games: 1, groupGames: 0, points: 0, groupPoints: 0 }).map((t) => plain(t.value))).toEqual(["0 %", "—"]);
  });
  it("sans duo, ni titre ni note des duos ; sans partie d'une taille, pas de case pour elle", () => {
    const card = groupsCard({ ...WEEK, duos: [], perGame: { "1": 0.04, "2": null, "3": 0.72, "4": null } }, "GAL", SITE, approx);
    const text = words(card);
    expect(text.join(" ")).not.toMatch(/duos/i);
    expect(text).toContain("seul");
    expect(text).toContain("à 3");
    expect(text).not.toContain("à 2");
    expect(text).not.toContain("à 4 et plus");
    expect(card.height).toBeLessThan(groupsCard(WEEK, "GAL", SITE, approx).height);
    expectClean(card);
  });
  it("le premier rang des duos est en bleu, égalités comprises", () => {
    const tied = groupsCard({ ...WEEK, duos: [duo("Alpha", "Bravo", 9, 15), duo("Alpha", "Charlie", 9, 14), duo("Bravo", "Delta", 7, 10)] }, "GAL", SITE, approx);
    const badges = tied.rects.filter((r) => r.width === 230);
    expect(badges).toHaveLength(3);
    expect(new Set(badges.slice(0, 2).map((r) => r.color)).size).toBe(1);
    expect(badges[2]!.color).not.toBe(badges[0]!.color);
  });
  it("dit tout à un lecteur d'écran", () => {
    expect(plain(groupsImageAlt(WEEK, "GAL"))).toBe(
      "Jouer ensemble, semaine du 2 nov. au 8 nov., parties du clan sous le tag [GAL]. 61 % des 412 parties se sont jouées à plusieurs. 97 % des points gagnés viennent de ces parties. Points par partie, selon le nombre de Gaulois : seul, 0,04 ; à 2, 0,31 ; à 3, 0,72 ; à 4 et plus, 1,86. Les duos qui ont le plus gagné ensemble : Alpha et Bravo, 12 victoires ensemble, sur 15 parties ; Alpha et Charlie, 9 victoires ensemble, sur 14 parties ; Bravo et Delta, 9 victoires ensemble, sur 10 parties. Les duos comptent d'abord le temps passé à jouer à deux, pas un niveau.",
    );
    const crowd = { ...WEEK, duos: Array.from({ length: 5 }, (_, i) => duo("x".repeat(120) + i, "y".repeat(120) + i, 3, 4)) };
    expect(groupsImageAlt(crowd, "GAL").length).toBeLessThanOrEqual(1024);
  });
});

describe("renderGazetteCard, pour « Jouer ensemble »", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  /** Des pseudos inventés, aussi longs que les plus longs de la liste. */
  const LONG = { ...WEEK, games: 12_345, duos: [duo("Capitaine Barbe GOAT.7362", "ROYAUME DES MOUETTES.9917", 123, 456), duo("ProfesseurTrébuchet", "lechevalier2fer.6301", 99, 100), duo("WWWWWWWWWWWWWWWW", "Иван Петрович", 1, 1)] };

  it("ne déborde pas et ne chevauche rien avec la vraie police, avec de longs pseudos comme sans duo", () => {
    expectClean(groupsCard(WEEK, "GAL", SITE, fonts.width), fonts.width);
    expectClean(groupsCard(LONG, "GAL", SITE, fonts.width), fonts.width);
    expectClean(groupsCard({ ...WEEK, duos: [] }, "GAL", SITE, fonts.width), fonts.width);
  });
  it("dessine une vraie image PNG, avec le logo", async () => {
    const card = groupsCard(LONG, "GAL", SITE, fonts.width);
    const png = await renderGazetteCard(card, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 1200, height: card.height });
    const { x, y, size } = card.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });
});
