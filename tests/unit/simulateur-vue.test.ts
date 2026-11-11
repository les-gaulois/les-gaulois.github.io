import { describe, expect, it } from "vitest";
import { DAY_MS, STEADY_SCORE, projectScore, steadyGain, type Scenario } from "../../src/lib/simulateur";
import type { PaceWindow, SimData } from "../../src/lib/simulateur-donnees";
import { backtestSince, clanRate, dayDate, defaultTarget, marginFor, objective, parseSimData, scenarioFrom, simulate, tableRows, victoryValue } from "../../src/lib/simulateur-vue";

const ASOF = "2026-11-11T17:45:31.198Z";
const T = Date.parse(ASOF);
const window = (days: number, sizes: Partial<Record<"1" | "2" | "3" | "4", [number, number, number]>>): PaceWindow => ({
  days,
  from: new Date(T - days * DAY_MS).toISOString(),
  to: ASOF,
  sizes: Object.fromEntries((["1", "2", "3", "4"] as const).map((s) => [s, { games: sizes[s]?.[0] ?? 0, wins: sizes[s]?.[1] ?? 0, points: sizes[s]?.[2] ?? 0 }])) as PaceWindow["sizes"],
});
const data = (over: Partial<SimData> = {}): SimData => ({
  asOf: ASOF,
  tag: "GAL",
  official: 2300,
  rank: 2,
  model: 2301,
  points: [],
  coveredUntil: ASOF,
  pace: [window(7, { "1": [70, 14, 3.5], "4": [140, 105, 210] }), window(30, { "1": [300, 60, 15], "4": [600, 450, 900] })],
  clans: [
    { tag: "UN", score: 10000, rate: 300, rateDays: 4 },
    { tag: "GAL", score: 2300, rate: 60, rateDays: 4 },
    { tag: "ITA", score: 2200, rate: 120, rateDays: 4 },
    { tag: "AST", score: 1900, rate: null, rateDays: null },
  ],
  backtest: [
    { horizon: 7, pace: 7, gal: { mean: 0.07, p90: 0.12, samples: 111 }, clans: null, since: "2026-07-17" },
    { horizon: 30, pace: 7, gal: { mean: 0.2, p90: 0.49, samples: 40 }, clans: null, since: "2026-07-18" },
    { horizon: 90, pace: 7, gal: { mean: 0.4, p90: 0.66, samples: 120 }, clans: null, since: "2026-07-20" },
    { horizon: 7, pace: 30, gal: { mean: 0.09, p90: 0.15, samples: 90 }, clans: null, since: "2026-08-09" },
  ],
  rateCheck: null,
  bestDay: { date: "2026-11-08", points: 140, games: 120 },
  ...over,
});

describe("le fichier du simulateur, relu", () => {
  it("accepte le fichier construit et refuse ce qui n'en a pas la forme", () => {
    expect(parseSimData(data())).not.toBeNull();
    expect(parseSimData(null)).toBeNull();
    expect(parseSimData({ ...data(), points: [[1, "x"]] })).toBeNull();
    expect(parseSimData({ ...data(), clans: [{ tag: "UN", score: "beaucoup", rate: null }] })).toBeNull();
    expect(parseSimData({ ...data(), asOf: "hier" })).toBeNull();
  });
});

describe("le scénario de départ", () => {
  it("prend le rythme de la fenêtre et les points par victoire sur 30 jours", () => {
    const s = scenarioFrom(data().pace[0]!, data().pace[1]!);
    expect(s["4"]).toEqual({ games: 20, winRate: 0.75, pointsPerWin: 2 });
    expect(s["1"].games).toBeCloseTo(10, 9);
    expect(s["1"].winRate).toBeCloseTo(0.2, 9);
    expect(s["1"].pointsPerWin).toBeCloseTo(0.25, 9);
    expect(s["2"]).toEqual({ games: 0, winRate: 0, pointsPerWin: 0 });
  });
});

describe("la projection", () => {
  const scenario = scenarioFrom(data().pace[0]!, data().pace[1]!);

  it("part du classement officiel et projette chaque clan à son rythme", () => {
    const sim = simulate(data(), scenario, 30)!;
    expect(sim.dates[0]).toBe("2026-11-11");
    expect(sim.dates).toHaveLength(31);
    expect(sim.gal[0]).toBe(2300);
    expect(sim.rate).toBeCloseTo(10 * 0.2 * 0.25 + 20 * 0.75 * 2, 9);
    expect(sim.gal[30]).toBeCloseTo(projectScore(2300, 0, 0) + sim.rate * steadyGain(30), 6);
    const ita = sim.clans.find((c) => c.tag === "ITA")!;
    expect(ita.then).toBeCloseTo(projectScore(2200, 120, 30), 9);
    // Sans rythme mesuré, un clan est supposé régulier : son score ne bouge pas.
    const ast = sim.clans.find((c) => c.tag === "AST")!;
    expect(clanRate(data().clans[3]!)).toBeCloseTo(1900 / STEADY_SCORE, 9);
    expect(ast.then).toBeCloseTo(1900, 6);
  });

  it("dit quand un clan passe devant ou derrière, et le classement au bout", () => {
    const slow: Scenario = { ...scenario, "4": { games: 0, winRate: 0.75, pointsPerWin: 2 } };
    const sim = simulate(data(), slow, 30)!;
    const change = sim.changes.find((c) => c.tag === "ITA");
    expect(change?.ahead).toBe(false);
    expect(sim.us?.rankThen).toBeGreaterThan(2);
    expect(simulate(data({ official: null, rank: null }), scenario, 30)).toBeNull();
  });

  it("montre GAL et ses voisins, dans l'ordre projeté", () => {
    // ITA gagne bien plus de points par jour que ce scénario de GAL : il passe devant en une semaine.
    const sim = simulate(data(), scenario, 7)!;
    expect(tableRows(sim, null).map((c) => c.tag)).toEqual(["UN", "ITA", "GAL", "AST"]);
    expect(sim.us?.rankThen).toBe(3);
  });

  it("vise le plus proche au score, entre le clan juste devant et celui juste derrière", () => {
    // UN est à 7 700 points, ITA à 100 : ITA.
    expect(defaultTarget(data())).toBe("ITA");
    expect(defaultTarget(data({ official: 9000 }))).toBe("UN");
    expect(defaultTarget(data({ rank: null }))).toBeNull();
  });
});

describe("l'objectif", () => {
  const scenario = scenarioFrom(data().pace[0]!, data().pace[1]!);

  it("calcule ce qu'il faut pour finir devant, et les parties en plus", () => {
    const sim = simulate(data(), scenario, 30)!;
    const goal = objective(sim, scenario, "UN")!;
    expect(goal.aheadNow).toBe(false);
    expect(goal.aheadThen).toBe(false);
    expect(goal.required).toBeCloseTo((sim.clans[0]!.then - sim.galWithoutGames[30]!) / steadyGain(30), 6);
    const extra4 = goal.extraGames.find((g) => g.size === "4")!;
    expect(extra4.games).toBeCloseTo((goal.required - goal.rate) / 1.5, 6);
    // Une taille de groupe sans victoire mesurée ne donne pas de nombre de parties.
    expect(goal.extraGames.some((g) => g.size === "2")).toBe(false);
  });

  it("ne demande rien de plus quand c'est déjà acquis", () => {
    const sim = simulate(data(), scenario, 7)!;
    const goal = objective(sim, scenario, "AST")!;
    expect(goal.aheadNow).toBe(true);
    expect(goal.extraGames).toEqual([]);
    expect(objective(sim, scenario, "GAL")).toBeNull();
    expect(objective(sim, scenario, "XYZ")).toBeNull();
  });
});

describe("ce qui accompagne", () => {
  it("donne la marge mesurée pour ce rythme, seulement avec assez de recul", () => {
    expect(marginFor(data().backtest, 7, 7)).toBe(0.12);
    expect(marginFor(data().backtest, 7, 30)).toBe(0.15);
    // 40 départs à 30 jours, ou 120 à 90 jours : moins de deux fois l'horizon, ils se recouvrent trop.
    expect(marginFor(data().backtest, 30, 7)).toBeNull();
    expect(marginFor(data().backtest, 90, 7)).toBeNull();
    expect(marginFor(data().backtest, 14, 7)).toBeNull();
  });

  it("tire des données la date du premier départ mesuré, rythme par rythme", () => {
    expect(backtestSince(data().backtest, 7)).toBe("2026-07-17");
    expect(backtestSince(data().backtest, 30)).toBe("2026-08-09");
    expect(backtestSince([], 7)).toBeNull();
  });

  it("ne calcule pas d'objectif quand le classement est plus ancien que l'horizon", () => {
    const stale = data({ coveredUntil: new Date(T + 9 * DAY_MS).toISOString() });
    const sc = scenarioFrom(stale.pace[0]!, stale.pace[1]!);
    expect(objective(simulate(stale, sc, 7)!, sc, "ITA")).toBeNull();
  });

  it("dit ce que vaut une victoire avec le temps", () => {
    expect(victoryValue(2)).toEqual([2, 1, 0.5, 0]);
  });

  it("date les jours à Paris, en jours de calendrier", () => {
    expect(dayDate(Date.parse("2026-11-11T23:30:00.000Z"), 0)).toBe("2026-11-12");
    // Relevé à 0 h 30, heure d'été : trente jours plus tard, après le passage à l'heure d'hiver, c'est bien le 30e jour.
    expect(dayDate(Date.parse("2026-10-01T22:30:00.000Z"), 30)).toBe("2026-11-01");
  });

  it("ne compte pas deux fois les jours déjà relevés après le classement", () => {
    const late = data({ coveredUntil: new Date(T + 2 * DAY_MS).toISOString() });
    const scenario = scenarioFrom(late.pace[0]!, late.pace[1]!);
    const sim = simulate(late, scenario, 30)!;
    expect(sim.knownDays).toBeCloseTo(2, 9);
    expect(sim.gal[30]).toBeCloseTo(2300 + sim.rate * steadyGain(28), 6);
  });
});
