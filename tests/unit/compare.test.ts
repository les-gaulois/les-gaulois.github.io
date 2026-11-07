import { describe, expect, it } from "vitest";
import { clanFigures, COMPARE_DAYS, firstRival, gapPoints, scoreHistory } from "../../src/lib/compare";
import type { RivalsSnapshot } from "../../src/lib/schemas";
import { withOfficialRanks } from "../../src/lib/stats";

const entry = (clanTag: string, over: Partial<Parameters<typeof withOfficialRanks>[0][number]> = {}) => ({
  clanTag,
  games: 100,
  wins: 40,
  losses: 60,
  playerSessions: 250,
  weightedWins: 50,
  weightedLosses: 10,
  weightedWLRatio: 5,
  ...over,
});
const snapshot = (date: string, clans: [string, number][]): RivalsSnapshot => ({
  date,
  capturedAt: `${date}T10:00:00.000Z`,
  leaderboardEnd: `${date}T09:00:00.000Z`,
  clans: clans.map(([clanTag, weightedWins]) => ({ clanTag, weightedWins })),
});

describe("clanFigures", () => {
  it("reprend les chiffres officiels et le rang de la liste", () => {
    const [, second] = withOfficialRanks([entry("UN"), entry("GAL", { weightedWins: 2157.48, weightedWLRatio: 6.96 })]);
    if (!second) throw new Error("clan attendu");
    expect(clanFigures(second)).toEqual({ tag: "GAL", rank: 2, score: 2157.48, games: 100, wins: 40, losses: 60, rate: 40, wlRatio: 6.96, playersPerGame: 2.5 });
  });
  it("ne donne ni taux ni joueurs par partie sans partie : ce n'est pas zéro", () => {
    const [clan] = withOfficialRanks([entry("X", { games: 0, wins: 0, losses: 0, playerSessions: 0 })]);
    if (!clan) throw new Error("clan attendu");
    expect(clanFigures(clan)).toMatchObject({ rate: null, playersPerGame: null });
  });

});

describe("firstRival", () => {
  const clans = withOfficialRanks([entry("UN"), entry("GAL"), entry("ITA")]);
  it("prend le clan juste au-dessus", () => {
    expect(firstRival(clans, "GAL")?.clanTag).toBe("UN");
    expect(firstRival(clans, "gal")?.clanTag).toBe("UN");
  });
  it("prend le clan juste en dessous pour le premier de la liste", () => {
    expect(firstRival(clans, "UN")?.clanTag).toBe("GAL");
  });
  it("ne propose rien si le clan est hors de la liste, ou seul", () => {
    expect(firstRival(clans, "ZZZ")).toBeNull();
    expect(firstRival(withOfficialRanks([entry("GAL")]), "GAL")).toBeNull();
  });
});

describe("scoreHistory et gapPoints", () => {
  it("donne l'écart jour après jour, dans l'ordre des dates", () => {
    const history = scoreHistory([snapshot("2026-11-08", [["GAL", 12], ["UN", 15]]), snapshot("2026-11-07", [["GAL", 10], ["UN", 15]])]);
    expect(history.dates).toEqual(["2026-11-07", "2026-11-08"]);
    expect(gapPoints(history, "GAL", "UN")).toEqual([
      { date: "2026-11-07", value: -5 },
      { date: "2026-11-08", value: -3 },
    ]);
  });
  it("laisse un trou quand un clan manque à un relevé, pas un zéro", () => {
    const history = scoreHistory([snapshot("2026-11-07", [["GAL", 10]]), snapshot("2026-11-08", [["GAL", 12], ["UN", 15]])]);
    expect(history.scores["UN"]).toEqual([null, 15]);
    expect(gapPoints(history, "GAL", "UN")[0]?.value).toBeNull();
  });
  it("laisse des trous pour un clan jamais relevé", () => {
    const history = scoreHistory([snapshot("2026-11-07", [["GAL", 10]])]);
    expect(gapPoints(history, "GAL", "ABSENT")).toEqual([{ date: "2026-11-07", value: null }]);
  });
  it("ne garde que les derniers jours", () => {
    const list = Array.from({ length: COMPARE_DAYS + 5 }, (_, i) => snapshot(new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), [["GAL", i]]));
    const history = scoreHistory(list);
    expect(history.dates).toHaveLength(COMPARE_DAYS);
    expect(history.scores["GAL"]?.[0]).toBe(5);
  });
  it("traite les tags sans tenir compte de la casse", () => {
    const history = scoreHistory([snapshot("2026-11-07", [["gal", 10], ["Un", 4]])]);
    expect(gapPoints(history, "GAL", "UN")[0]?.value).toBe(6);
  });
  it("sans relevé, ne donne aucun point", () => {
    expect(gapPoints(scoreHistory([]), "GAL", "UN")).toEqual([]);
  });
});
