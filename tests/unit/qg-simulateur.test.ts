import { describe, expect, it } from "vitest";
import { canScore, gapWords, goalVerdict, isTie, neighbours, placeVerdict, rowVerdict } from "../../src/lib/compte/qg-simulateur";
import { fmtInt } from "../../src/lib/format";
import { DAY_MS } from "../../src/lib/simulateur";
import type { PaceWindow, SimData } from "../../src/lib/simulateur-donnees";
import { scenarioFrom, simulate, type ProjectedClan, type Simulation } from "../../src/lib/simulateur-vue";

const clan = (tag: string, rankNow: number, rankThen: number, then: number, isUs = false): ProjectedClan => ({ tag, now: then, rankNow, curve: [then], then, rankThen, isUs });
const simOf = (clans: ProjectedClan[]): Simulation => ({ horizon: 30, knownDays: 0, dates: [], rate: 0, gal: [], galWithoutGames: [], clans, us: clans.find((c) => c.isUs) ?? null, changes: [] });

// Un vrai fichier du simulateur, pour faire tourner `simulate` : GAL sans partie relevée, donc un score qui ne bouge pas.
const ASOF = "2026-11-11T17:45:31.198Z";
const T = Date.parse(ASOF);
const window = (days: number, four: [number, number, number] = [0, 0, 0]): PaceWindow => ({
  days,
  from: new Date(T - days * DAY_MS).toISOString(),
  to: ASOF,
  sizes: { "1": { games: 0, wins: 0, points: 0 }, "2": { games: 0, wins: 0, points: 0 }, "3": { games: 0, wins: 0, points: 0 }, "4": { games: four[0], wins: four[1], points: four[2] } },
});
const data = (over: Partial<SimData> = {}): SimData => ({
  asOf: ASOF,
  tag: "GAL",
  official: 2000,
  rank: 2,
  model: 2000,
  points: [],
  coveredUntil: ASOF,
  pace: [window(7), window(30)],
  clans: [
    { tag: "UN", score: 9000, rate: 300, rateDays: 4 },
    { tag: "GAL", score: 2000, rate: 0, rateDays: 4 },
    // Sans rythme mesuré, un clan est supposé régulier : au bout de 30 jours, il reste à 2 000 points, à un millionième près.
    { tag: "AST", score: 2000, rate: null, rateDays: null },
    // Deux clans exactement à égalité, aujourd'hui et au bout.
    { tag: "EU", score: 1500, rate: 10, rateDays: 4 },
    { tag: "FR", score: 1500, rate: 10, rateDays: 4 },
  ],
  backtest: [],
  rateCheck: null,
  bestDay: null,
  ...over,
});

describe("placeVerdict", () => {
  it("dit les places gagnées en vert, accordées", () => {
    expect(placeVerdict(4, 3)).toEqual({ ton: "ok", label: "1 place gagnée", gained: 1 });
    expect(placeVerdict(5, 2)).toEqual({ ton: "ok", label: "3 places gagnées", gained: 3 });
  });
  it("dit les places perdues en rouge, accordées", () => {
    expect(placeVerdict(2, 3)).toEqual({ ton: "danger", label: "1 place perdue", gained: -1 });
    expect(placeVerdict(2, 6)).toEqual({ ton: "danger", label: "4 places perdues", gained: -4 });
  });
  it("dit « Même place » en gris quand le rang ne bouge pas", () => {
    expect(placeVerdict(2, 2)).toEqual({ ton: "muted", label: "Même place", gained: 0 });
  });
  it("va du premier au dernier rang et retour", () => {
    expect(placeVerdict(1, 1)).toEqual({ ton: "muted", label: "Même place", gained: 0 });
    expect(placeVerdict(40, 1)).toEqual({ ton: "ok", label: "39 places gagnées", gained: 39 });
    expect(placeVerdict(1, 40)).toEqual({ ton: "danger", label: "39 places perdues", gained: -39 });
  });
});

describe("gapWords et isTie", () => {
  it("dit l'avance et le retard arrondis au point, comme avant", () => {
    expect(gapWords(774.4)).toBe("774 d'avance");
    expect(gapWords(-8935.2)).toBe(`${fmtInt(8935)} de retard`);
    expect(gapWords(0.5)).toBe("1 d'avance");
    expect(gapWords(-0.5)).toBe("1 de retard");
  });
  it("dit « À égalité » sous un demi-point, jamais « 0 d'avance » ni « 0 de retard »", () => {
    for (const gap of [0, -0, 0.3, -0.3, 0.49, -0.49]) {
      expect(isTie(gap)).toBe(true);
      expect(gapWords(gap)).toBe("À égalité");
    }
    expect(isTie(0.5)).toBe(false);
    expect(isTie(-0.5)).toBe(false);
  });
});

describe("neighbours", () => {
  const sim = simOf([clan("UN", 1, 1, 12000), clan("GAL", 2, 2, 3100, true), clan("ITA", 3, 3, 2300), clan("EU", 5, 4, 2100)]);
  it("donne le clan juste devant et le clan juste derrière, avec l'écart", () => {
    expect(neighbours(sim)).toEqual({ ahead: { tag: "UN", gap: 8900 }, behind: { tag: "ITA", gap: 800 } });
  });
  it("n'invente personne devant le premier ni derrière le dernier", () => {
    expect(neighbours(simOf([clan("GAL", 1, 1, 500, true), clan("ITA", 2, 2, 400)]))).toEqual({ ahead: null, behind: { tag: "ITA", gap: 100 } });
    expect(neighbours(simOf([clan("UN", 1, 1, 900), clan("GAL", 2, 2, 500, true)]))).toEqual({ ahead: { tag: "UN", gap: 400 }, behind: null });
    expect(neighbours(simOf([clan("GAL", 1, 1, 500, true)]))).toEqual({ ahead: null, behind: null });
  });
  it("ne dit rien sans GAL dans la projection, ni sans clan du tout", () => {
    expect(neighbours(simOf([clan("UN", 1, 1, 900)]))).toEqual({ ahead: null, behind: null });
    expect(neighbours(simOf([]))).toEqual({ ahead: null, behind: null });
  });
  it("à score égal, trouve un seul clan par rang : la projection garde l'ordre d'aujourd'hui", () => {
    const real = simulate(data(), scenarioFrom(window(7), window(30)), 30)!;
    // Chaque rang n'est donné qu'une fois, même à égalité exacte.
    expect(real.clans.map((c) => c.rankThen).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    const eu = real.clans.find((c) => c.tag === "EU")!;
    const fr = real.clans.find((c) => c.tag === "FR")!;
    expect(eu.then).toBe(fr.then);
    expect(fr.rankThen).toBe(eu.rankThen + 1);
    // GAL et AST finissent à 2 000 points à un millionième près : le voisin est AST, d'un côté ou de l'autre, « À égalité ».
    const near = neighbours(real);
    const ast = near.ahead?.tag === "AST" ? near.ahead : near.behind;
    expect(ast?.tag).toBe("AST");
    expect(gapWords(ast!.gap)).toBe("À égalité");
  });
  it("à égalité exacte, dit l'écart « À égalité »", () => {
    const tie = neighbours(simOf([clan("ITA", 1, 1, 3000), clan("GAL", 2, 2, 3000, true)]));
    expect(tie.ahead).toEqual({ tag: "ITA", gap: 0 });
    expect(gapWords(-tie.ahead!.gap)).toBe("À égalité");
  });
});

describe("rowVerdict", () => {
  const us = clan("GAL", 3, 2, 3000, true);
  it("marque le clan dépassé et celui qui passe devant", () => {
    expect(rowVerdict(clan("ITA", 2, 3, 2900), us)).toEqual({ ton: "ok", label: "Dépassé" });
    expect(rowVerdict(clan("EU", 5, 1, 4000), us)).toEqual({ ton: "danger", label: "Passe devant" });
  });
  it("ne marque ni GAL, ni un clan qui reste du même côté", () => {
    expect(rowVerdict(us, us)).toBeNull();
    expect(rowVerdict(clan("UN", 1, 1, 12000), us)).toBeNull();
    expect(rowVerdict(clan("CYN", 6, 4, 2000), us)).toBeNull();
  });
  it("à égalité, ne dit ni « Dépassé » ni « Passe devant », même quand les rangs s'échangent", () => {
    // GAL passe ITA de 0,3 point : l'écart affiché serait « 0 d'avance ».
    expect(rowVerdict(clan("ITA", 2, 3, 2999.7), us)).toBeNull();
    expect(gapWords(us.then - 2999.7)).toBe("À égalité");
    // AST passe GAL de 0,4 point.
    expect(rowVerdict(clan("AST", 4, 1, 3000.4), us)).toBeNull();
    // Égalité exacte : l'ordre d'aujourd'hui est gardé, rien ne change.
    expect(rowVerdict(clan("FR", 2, 1, 3000), us)).toBeNull();
    // Un demi-point d'écart s'écrit « 1 d'avance » : le mot revient.
    expect(rowVerdict(clan("ITA", 2, 3, 2999.5), us)).toEqual({ ton: "ok", label: "Dépassé" });
  });
  it("dans une vraie projection, ne marque pas le clan à égalité avec GAL", () => {
    const real = simulate(data(), scenarioFrom(window(7), window(30)), 30)!;
    const ast = real.clans.find((c) => c.tag === "AST")!;
    expect(rowVerdict(ast, real.us!)).toBeNull();
    expect(rowVerdict(real.clans.find((c) => c.tag === "UN")!, real.us!)).toBeNull();
  });
});

describe("canScore", () => {
  it("dit si une victoire rapporte des points dans au moins une taille de groupe", () => {
    expect(canScore(scenarioFrom(window(7), window(30)))).toBe(false);
    expect(canScore(scenarioFrom(window(7), window(30, [40, 20, 30])))).toBe(true);
    // Des victoires à zéro point ne rapportent rien non plus.
    expect(canScore(scenarioFrom(window(7), window(30, [40, 20, 0])))).toBe(false);
  });
});

describe("goalVerdict", () => {
  it("est vert quand le scénario suffit, même sans pouvoir marquer", () => {
    expect(goalVerdict({ aheadThen: true, required: 50 }, 120, true)).toEqual({ ton: "ok", label: "Devant" });
    expect(goalVerdict({ aheadThen: true, required: 0 }, null, false)).toEqual({ ton: "ok", label: "Devant" });
  });
  it("est jaune quand il reste un écart à la portée de GAL", () => {
    expect(goalVerdict({ aheadThen: false, required: 110 }, 120, true)).toEqual({ ton: "warn", label: "À rattraper" });
    expect(goalVerdict({ aheadThen: false, required: 120 }, 120, true)).toEqual({ ton: "warn", label: "À rattraper" });
  });
  it("est rouge au-delà de la meilleure journée de GAL, comme le texte « Hors de portée d'ici là »", () => {
    expect(goalVerdict({ aheadThen: false, required: 121 }, 120, true)).toEqual({ ton: "danger", label: "Hors de portée" });
    expect(goalVerdict({ aheadThen: false, required: 0.01 }, 0, true)).toEqual({ ton: "danger", label: "Hors de portée" });
  });
  it("sans meilleure journée connue, n'est jaune que si le scénario peut rapporter des points", () => {
    expect(goalVerdict({ aheadThen: false, required: 5000 }, null, true)).toEqual({ ton: "warn", label: "À rattraper" });
    expect(goalVerdict({ aheadThen: false, required: 40 }, null, false)).toEqual({ ton: "danger", label: "Hors de portée" });
    expect(goalVerdict({ aheadThen: false, required: 40 }, 120, false)).toEqual({ ton: "danger", label: "Hors de portée" });
  });
});
