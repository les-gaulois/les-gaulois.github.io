import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  STEADY_SCORE,
  crossings,
  dailyPoints,
  groupOf,
  keptScore,
  pointsPerGame,
  projectGal,
  projectScore,
  rateBetween,
  ranked,
  requiredRate,
  scoreAt,
  steadyGain,
  weightAt,
  type Scenario,
} from "../../src/lib/simulateur";
import { galPoints } from "../../src/lib/simulateur-donnees";
import { StoredLeaderboard, StoredSessionFile } from "../../src/lib/schemas";

const T = Date.parse("2026-11-11T18:00:00.000Z");
const at = (daysAgo: number) => Math.round((T - daysAgo * DAY_MS) / 1000);

/** Un clan régulier : `perHour` points bruts chaque heure depuis 200 jours. */
const steadyHistory = (perHour: number) => Array.from({ length: 200 * 24 }, (_, i) => [at(i / 24), perHour] as [number, number]);

describe("la règle du score", () => {
  it("divise la valeur d'un point par deux tous les 30 jours, et l'oublie à 90 jours", () => {
    expect(weightAt(0)).toBe(1);
    expect(weightAt(30)).toBeCloseTo(0.5, 12);
    expect(weightAt(60)).toBeCloseTo(0.25, 12);
    expect(weightAt(89.999)).toBeCloseTo(0.125, 4);
    expect(weightAt(90)).toBe(0);
    expect(weightAt(-0.01)).toBe(0);
  });

  it("donne la valeur d'un point par jour gardé depuis d jours", () => {
    expect(steadyGain(0)).toBe(0);
    expect(steadyGain(30)).toBeCloseTo(30 / Math.LN2 / 2, 9);
    expect(STEADY_SCORE).toBeCloseTo((30 / Math.LN2) * (7 / 8), 9);
    expect(steadyGain(120)).toBe(STEADY_SCORE);
  });

  it("refait un score à partir de points datés", () => {
    expect(scoreAt([[at(0), 10], [at(30), 10], [at(95), 10]], T)).toBeCloseTo(15, 9);
    // Un point gagné après l'instant ne compte pas encore.
    expect(scoreAt([[at(-1), 10]], T)).toBe(0);
  });

  it("reproduit le score officiel de GAL à partir de ses parties, sur les données du dépôt", () => {
    const leaderboard = StoredLeaderboard.parse(JSON.parse(readFileSync("data/leaderboard.json", "utf8")));
    const official = leaderboard.clans.find((c) => c.clanTag === "GAL")?.weightedWins;
    const sessions = readdirSync("data/sessions").flatMap((f) => StoredSessionFile.parse(JSON.parse(readFileSync(`data/sessions/${f}`, "utf8"))).sessions);
    expect(official).toBeGreaterThan(0);
    const asOf = Date.parse(leaderboard.end);
    const model = scoreAt(galPoints(sessions, asOf), asOf);
    // Mesuré sur 130 classements : 0,03 % en moyenne. Une grosse victoire pas encore comptée par OpenFront peut l'écarter d'un point ou deux.
    expect(Math.abs(model - official!) / official!).toBeLessThan(0.01);
  });
});

describe("la projection d'un clan dont on ne connaît que le score", () => {
  it("garde tout le jour même, rien au bout de 90 jours, et décroît entre les deux", () => {
    expect(keptScore(1000, 0)).toBe(1000);
    expect(keptScore(1000, 90)).toBeCloseTo(0, 9);
    expect(keptScore(1000, 120)).toBe(0);
    expect(keptScore(1000, 10)).toBeGreaterThan(keptScore(1000, 20));
  });

  it("est exacte pour un clan au rythme régulier", () => {
    const history = steadyHistory(2);
    const now = scoreAt(history, T);
    // Une heure de points d'un coup plutôt qu'au fil de l'eau : 0,05 % d'écart avec le calcul continu.
    expect(now / (48 * STEADY_SCORE)).toBeCloseTo(1, 2);
    for (const days of [1, 7, 30, 60, 89]) {
      const exact = scoreAt(history.filter(([t]) => t * 1000 <= T), T + days * DAY_MS);
      expect(keptScore(now, days) / exact).toBeCloseTo(1, 2);
      // Au même rythme, le score ne bouge pas.
      expect(projectScore(now, 48, days) / now).toBeCloseTo(1, 2);
    }
  });

  it("retrouve le rythme d'un clan à partir de deux scores", () => {
    expect(rateBetween(1000, projectScore(1000, 80, 7), 7)).toBeCloseTo(80, 9);
    expect(rateBetween(1000, 1000, 0)).toBeNull();
    // Un score qui fond plus vite que la demi-vie ne donne pas un rythme négatif.
    expect(rateBetween(1000, 100, 7)).toBe(0);
    const history = steadyHistory(3);
    expect(rateBetween(scoreAt(history, T - 7 * DAY_MS), scoreAt(history, T), 7)).toBeCloseTo(72, 0);
  });
});

describe("le scénario de GAL", () => {
  const scenario: Scenario = {
    "1": { games: 10, winRate: 0.2, pointsPerWin: 0.25 },
    "2": { games: 4, winRate: 0.5, pointsPerWin: 2 },
    "3": { games: 0, winRate: 0.5, pointsPerWin: 3 },
    "4": { games: 20, winRate: 0.75, pointsPerWin: 2 },
  };

  it("compte les points bruts par jour et par partie", () => {
    expect(dailyPoints(scenario)).toBeCloseTo(0.5 + 4 + 0 + 30, 9);
    expect(pointsPerGame(scenario["4"])).toBeCloseTo(1.5, 9);
  });

  it("range les parties par taille de groupe", () => {
    expect([1, 2, 3, 4, 9].map(groupOf)).toEqual(["1", "2", "3", "4", "4"]);
  });

  it("part du score officiel et suit exactement les parties déjà jouées", () => {
    const points: [number, number][] = [[at(80), 100], [at(1), 10], [at(-0.5), 4]];
    const model = scoreAt(points, T);
    expect(projectGal(2000, points, T, 0, 0)).toBe(2000);
    // Dans 15 jours : la partie d'il y a 80 jours est sortie, celle d'hier a vieilli, celle relevée après le classement compte.
    const expected = 2000 + (scoreAt(points, T + 15 * DAY_MS) - model);
    expect(projectGal(2000, points, T, 0, 15)).toBeCloseTo(expected, 9);
    expect(projectGal(2000, points, T, 30, 15)).toBeCloseTo(expected + 30 * steadyGain(15), 9);
  });
});

describe("ce qu'on en tire", () => {
  it("trouve les jours où deux clans échangent leur place", () => {
    expect(crossings([10, 11, 12, 13], [12, 12, 11, 15])).toEqual([
      { day: 2, ahead: true },
      { day: 3, ahead: false },
    ]);
    expect(crossings([5, 6], [1, 2])).toEqual([]);
  });

  it("calcule le rythme qu'il faudrait pour finir devant", () => {
    expect(requiredRate(1500, 1400, 30)).toBeCloseTo(100 / steadyGain(30), 9);
    expect(requiredRate(1300, 1400, 30)).toBe(0);
    expect(requiredRate(1500, 1400, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("classe du plus haut score au plus bas", () => {
    expect(ranked([{ tag: "A", score: 1 }, { tag: "B", score: 3 }, { tag: "C", score: 2 }]).map((c) => c.tag)).toEqual(["B", "C", "A"]);
  });
});
