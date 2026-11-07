import { describe, expect, it } from "vitest";
import { nextTier, tierOf, tierRows, WIN_TIERS } from "../../src/lib/paliers";
import type { StoredMember } from "../../src/lib/schemas";

const member = (username: string | null, wins: number | null): StoredMember => ({
  role: "member",
  joinedAt: "2026-05-03T20:17:40.935Z",
  publicId: username ? `id-${username}` : null,
  username,
  team: wins === null ? null : { wins, losses: 3 },
});

describe("tierOf", () => {
  it("donne le plus haut palier atteint, seuil compris", () => {
    expect(tierOf(10)).toBe(10);
    expect(tierOf(49)).toBe(10);
    expect(tierOf(50)).toBe(50);
    expect(tierOf(1807)).toBe(1000);
    expect(tierOf(99999)).toBe(5000);
  });
  it("ne donne aucun palier sous le premier seuil", () => {
    expect(tierOf(0)).toBeNull();
    expect(tierOf(9)).toBeNull();
  });
});

describe("nextTier", () => {
  it("dit ce qui manque pour le palier suivant, et d'où part le joueur", () => {
    expect(nextTier(479)).toEqual({ wins: 500, missing: 21, from: 250 });
    expect(nextTier(500)).toEqual({ wins: 1000, missing: 500, from: 500 });
  });
  it("part de zéro sans palier", () => {
    expect(nextTier(0)).toEqual({ wins: 10, missing: 10, from: 0 });
  });
  it("s'arrête au dernier palier", () => {
    expect(nextTier(5000)).toBeNull();
  });
});

describe("tierRows", () => {
  it("range chaque membre une seule fois, à son plus haut palier", () => {
    const rows = tierRows([member("A", 1807), member("B", 778), member("C", 738), member("D", 12)]);
    expect(rows.map((r) => [r.wins, r.count])).toEqual([
      [1000, 1],
      [500, 2],
      [10, 1],
    ]);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(4);
  });
  it("range les pseudos d'un palier par ordre alphabétique, pas par victoires", () => {
    const rows = tierRows([member("Zoé", 900), member("Ana", 600), member("Max", 700), member("Élie", 500)]);
    expect(rows[0]?.named.map((m) => m.username)).toEqual(["Ana", "Élie", "Max", "Zoé"]);
  });
  it("compte les anonymes sans les nommer", () => {
    const rows = tierRows([member(null, 479), member("A", 300)]);
    expect(rows[0]).toMatchObject({ wins: 250, count: 2, anonymous: 1 });
    expect(rows[0]?.named.map((m) => m.username)).toEqual(["A"]);
  });
  it("ne range pas un membre sans stats ni sous le premier palier : pas de données n'est pas zéro", () => {
    expect(tierRows([member("A", null), member("B", 0), member("C", 9)])).toEqual([]);
  });
  it("ne garde que les paliers occupés, du plus haut au plus bas", () => {
    const rows = tierRows(WIN_TIERS.map((t, i) => member(`J${i}`, t)));
    expect(rows.map((r) => r.wins)).toEqual([...WIN_TIERS].reverse());
    expect(tierRows([member("A", 12), member("B", 600)]).map((r) => r.wins)).toEqual([500, 10]);
  });
});
