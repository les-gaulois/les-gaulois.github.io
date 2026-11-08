import { describe, expect, it } from "vitest";
import { bestGameOf, bestGameSentence, MIN_TOGETHER, yesterdayOf } from "../../src/lib/belle-partie";
import type { JournalRow } from "../../src/lib/journal";

const row = (id: string, at: string, gaulois: number, won: boolean, over: Partial<JournalRow> = {}): JournalRow => ({ id, at, won, format: "2", gaulois, players: 20, map: "MOAN", seconds: 1380, allies: [], rivals: [], ...over });
const plain = (s: string) => s.replace(/\u00a0/g, " ");

describe("yesterdayOf", () => {
  it("prend la veille du jour de Paris de la collecte", () => {
    expect(yesterdayOf("2026-11-08T08:53:32.009Z")).toBe("2026-11-07");
    // 0 h 30 à Paris le 8 novembre, encore le 7 en temps universel.
    expect(yesterdayOf("2026-11-07T23:30:00.000Z")).toBe("2026-11-07");
  });
});

describe("bestGameOf", () => {
  const rows = [
    row("a", "2026-11-07T10:00:00.000Z", 4, false),
    row("b", "2026-11-07T20:00:00.000Z", 5, false),
    row("c", "2026-11-07T21:00:00.000Z", 5, true),
    row("d", "2026-11-07T22:00:00.000Z", 5, true),
    row("e", "2026-11-06T22:59:00.000Z", 9, true), // le 6 à Paris
    row("f", "2026-11-08T01:00:00.000Z", 9, true), // le 8
  ];
  it("prend le plus de Gaulois, puis une victoire, puis la plus récente", () => {
    expect(bestGameOf(rows, "2026-11-07")?.id).toBe("d");
    expect(bestGameOf(rows.filter((r) => r.id !== "d"), "2026-11-07")?.id).toBe("c");
    expect(bestGameOf(rows.filter((r) => r.id !== "d" && r.id !== "c"), "2026-11-07")?.id).toBe("b");
  });
  it("ne compte que les parties à plusieurs, et seulement ce jour-là", () => {
    expect(MIN_TOGETHER).toBe(2);
    expect(bestGameOf([row("solo", "2026-11-07T10:00:00.000Z", 1, true)], "2026-11-07")).toBeNull();
    expect(bestGameOf(rows, "2026-11-05")).toBeNull();
  });
});

describe("bestGameSentence", () => {
  it("dit l'heure, la carte, le nombre de Gaulois, le résultat et la durée", () => {
    expect(plain(bestGameSentence(row("a", "2026-11-07T20:49:00.000Z", 5, true)))).toBe("7 nov., 21:49 sur MOAN : 5 Gaulois ensemble, victoire en 23 min.");
  });
  it("n'invente ni carte ni durée quand le détail n'est pas lu", () => {
    expect(plain(bestGameSentence(row("a", "2026-11-07T20:49:00.000Z", 2, false, { map: null, seconds: null })))).toBe("7 nov., 21:49 : 2 Gaulois ensemble, défaite.");
  });
});
