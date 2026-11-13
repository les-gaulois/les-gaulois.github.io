import { describe, expect, it } from "vitest";
import { goalState, winsLeft } from "../../src/lib/compte/direction-objectif";
import type { ClanWeekFile } from "../../src/lib/semaine-du-clan";

const week = "2026-11-09";
const file: ClanWeekFile = {
  until: "2026-11-13T21:53:32.706Z",
  weeks: [{ from: week, games: 30, wins: 12, complete: false }],
  gains: null,
  clans: {
    end: "2026-11-13T22:38:11.385Z",
    scores: [
      { tag: "AAA", score: 300 },
      { tag: "GAL", score: 200 },
      { tag: "BBB", score: 200 },
      { tag: "CCC", score: 150.5 },
    ],
  },
};

describe("goalState", () => {
  it("dit qu'aucun objectif n'est fixé", () => {
    expect(goalState(null, file, "GAL")).toEqual({ key: "none", tone: "muted", word: "Pas fixé" });
  });

  it("suit un nombre de victoires, sans rien recalculer", () => {
    const running = goalState({ week, kind: "wins", wins: 30 }, file, "GAL");
    expect(running).toMatchObject({ key: "running", tone: "ally", word: "En cours", progress: { done: 12, target: 30, reached: false } });
    const reached = goalState({ week, kind: "wins", wins: 12 }, file, "GAL");
    expect(reached).toMatchObject({ key: "reached", tone: "ok", word: "Atteint" });
  });

  it("ne confond pas « pas de données » et zéro", () => {
    expect(goalState({ week, kind: "wins", wins: 30 }, null, "GAL").key).toBe("no-data");
    expect(goalState({ week, kind: "wins", wins: 30 }, { ...file, until: null }, "GAL").key).toBe("no-data");
    expect(goalState({ week: "2026-11-16", kind: "wins", wins: 30 }, file, "GAL").key).toBe("no-data");
    expect(goalState({ week, kind: "clan", clan: "ZZZ" }, file, "GAL").key).toBe("no-data");
    expect(goalState({ week, kind: "clan", clan: "AAA" }, { ...file, clans: null }, "GAL").key).toBe("no-data");
  });

  it("place le clan devant, derrière ou à égalité", () => {
    expect(goalState({ week, kind: "clan", clan: "CCC" }, file, "GAL")).toEqual({ key: "ahead", tone: "ok", word: "Devant", gap: 49.5 });
    expect(goalState({ week, kind: "clan", clan: "AAA" }, file, "GAL")).toEqual({ key: "behind", tone: "warn", word: "Derrière", gap: -100 });
    expect(goalState({ week, kind: "clan", clan: "BBB" }, file, "GAL")).toEqual({ key: "level", tone: "ally", word: "À égalité", gap: 0 });
  });
});

describe("winsLeft", () => {
  it("compte ce qui manque, jamais en négatif", () => {
    expect(winsLeft({ done: 12, target: 30, reached: false, share: 0.4 })).toBe(18);
    expect(winsLeft({ done: 40, target: 30, reached: true, share: 1 })).toBe(0);
  });
});
