import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GazetteFonts, renderGazetteCard } from "../../src/lib/gazette-image";
import type { RecordAlert } from "../../src/lib/records-discord";
import { recordCard, recordImageAlt } from "../../src/lib/records-image";
import type { ClanRecords } from "../../src/lib/results";
import { approx, expectClean, plain, words } from "./card-checks";

const SITE = "https://les-gaulois.github.io/";
const START = "2026-04-10";
const COLLECTED = "2026-11-12T11:53:00.000Z";
const RECORDS: ClanRecords = {
  streak: { wins: 13, endedAt: "2026-11-12T11:43:41.816Z" },
  bestDay: { date: "2026-10-25", wins: 78, games: 196 },
  biggestGroup: { players: 14, at: "2026-05-30T21:31:26.264Z" },
  mostTeams: { teams: 78, players: 156, at: "2026-09-22T18:14:43.121Z" },
};
const ONE: RecordAlert = { beaten: [{ key: "streak", before: 12, after: 13 }], records: RECORDS };
const ALL: RecordAlert = {
  beaten: [
    { key: "streak", before: 12, after: 13 },
    { key: "bestDay", before: 70, after: 78 },
    { key: "biggestGroup", before: 13, after: 14 },
    { key: "mostTeams", before: 62, after: 78 },
  ],
  records: RECORDS,
};

describe("recordCard", () => {
  it("dit le record battu, sa nouvelle marque, sa date, l'ancienne marque, ce qui est compté et la date de la collecte", () => {
    const card = recordCard(ONE, "GAL", SITE, START, COLLECTED, approx);
    const text = words(card);
    for (const expected of [
      "Parties publiques en équipe sous le tag",
      "[GAL] bat un record du clan",
      "Depuis le 10 avr. 2026, tous joueurs du clan confondus",
      "Plus longue série de victoires",
      "13 victoires d'affilée, la dernière le 12 nov. 2026",
      "Avant : 12",
      "les-gaulois.github.io/records",
      "Collecte du 12 nov. 2026, 12:53",
    ]) {
      expect(text).toContain(expected);
    }
    expectClean(card);
  });
  it("donne une case à chaque record battu au même passage, et l'image grandit avec eux", () => {
    const card = recordCard(ALL, "GAL", SITE, START, COLLECTED, approx);
    const text = words(card);
    expect(text).toContain("[GAL] bat 4 records du clan");
    for (const expected of [
      "Meilleure journée",
      "78 victoires sur 196 parties, le 25 oct. 2026",
      "Avant : 70",
      "Le plus de Gaulois dans une partie gagnée",
      "14 joueurs, le 30 mai 2026",
      "Avant : 13",
      "Victoire avec le plus d'équipes en jeu",
      "78 équipes, 156 joueurs dans la partie, le 22 sept. 2026",
      "Avant : 62",
    ]) {
      expect(text).toContain(expected);
    }
    expect(card.height).toBeGreaterThan(recordCard(ONE, "GAL", SITE, START, COLLECTED, approx).height);
    expectClean(card);
  });
  it("dit tout à un lecteur d'écran, avec les mêmes mots que le texte de secours", () => {
    expect(plain(recordImageAlt(ONE, "GAL", START, COLLECTED))).toBe(
      "[GAL] bat un record du clan. Plus longue série de victoires : 13 victoires d'affilée, la dernière le 12 nov. 2026. Avant : 12. Parties publiques en équipe sous le tag. Depuis le 10 avr. 2026, tous joueurs du clan confondus. Collecte du 12 nov. 2026, 12:53.",
    );
    expect(recordImageAlt(ALL, "GAL", START, COLLECTED).length).toBeLessThanOrEqual(1024);
  });
});

describe("renderGazetteCard, pour un record", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("ne déborde pas et ne chevauche rien avec la vraie police, pour un record comme pour les quatre", () => {
    expectClean(recordCard(ONE, "GAL", SITE, START, COLLECTED, fonts.width), fonts.width);
    expectClean(recordCard(ALL, "GAL", SITE, START, COLLECTED, fonts.width), fonts.width);
    // Des marques à six chiffres : la plus longue ligne possible reste entière.
    const huge: ClanRecords = { ...RECORDS, mostTeams: { teams: 123_456, players: 654_321, at: "2026-09-22T18:14:43.121Z" } };
    const card = recordCard({ beaten: [{ key: "mostTeams", before: 99_999, after: 123_456 }], records: huge }, "GAL", SITE, START, COLLECTED, fonts.width);
    expectClean(card, fonts.width);
    expect(words(card).join(" ")).not.toContain("…");
  });
  it("dessine une vraie image PNG, avec le logo", async () => {
    const card = recordCard(ALL, "GAL", SITE, START, COLLECTED, fonts.width);
    const png = await renderGazetteCard(card, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 1200, height: card.height });
    const { x, y, size } = card.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });
});
