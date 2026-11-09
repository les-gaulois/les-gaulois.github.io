import { describe, expect, it } from "vitest";
import { capsToTroops, neutralPixelsFor, objectiveFor, type Standing } from "../../src/lib/clanmap/economy";
import { findMoments, nextThreshold, THRESHOLDS, type MomentFrame } from "../../src/lib/clanmap/moments";
import { fmtInt } from "../../src/lib/format";
import { Meta } from "../../src/lib/schemas";

const n = (value: number) => fmtInt(value);
const clan = (tag: string, pixels: number): Standing => ({ tag, color: null, pixels });
const standings = [clan("LUX", 380000), clan("UN", 330000), clan("AST", 98000), clan("GAL", 91000), clan("ITA", 67000)];

describe("fichiers du clan et de la collecte", () => {
  it("lit un meta.json d'avant la carte sans perdre son état", () => {
    const empty = { lastSuccessAt: null, lastErrorAt: null, lastError: null };
    const old = { lastRunAt: null, leaderboard: empty, members: empty, sessions: { ...empty, completeThrough: "2026-11-03", coveredUntil: null } };
    const parsed = Meta.parse(old);
    expect(parsed.sessions.completeThrough).toBe("2026-11-03");
    expect(parsed.clanmap).toEqual(empty);
  });
});

describe("coûts de la carte", () => {
  it("applique les règles relevées dans le code de la carte", () => {
    expect(capsToTroops(10)).toBe(1000);
    expect(neutralPixelsFor(1000)).toBe(1);
    expect(neutralPixelsFor(1999)).toBe(1);
  });

  it("ne donne jamais un résultat négatif", () => {
    expect(capsToTroops(-5)).toBe(0);
    expect(neutralPixelsFor(-1)).toBe(0);
  });
});

describe("objectif du clan", () => {
  it("indique le clan à dépasser et ce qu'il manque", () => {
    expect(objectiveFor(standings, "GAL")).toMatchObject({ rank: 4, gap: 7001, lead: 24000 });
    expect(objectiveFor(standings, "GAL")?.above?.tag).toBe("AST");
    expect(objectiveFor(standings, "GAL")?.below?.tag).toBe("ITA");
  });

  it("gère le premier, le dernier et un clan absent", () => {
    expect(objectiveFor(standings, "LUX")).toMatchObject({ rank: 1, above: null, gap: null });
    expect(objectiveFor(standings, "ITA")).toMatchObject({ rank: 5, below: null, lead: null });
    expect(objectiveFor(standings, "ZZZ")).toBeNull();
  });
});

describe("grands moments", () => {
  /** Une image par ligne : [pixels de GAL, rang]. */
  const frames = (rows: [number, number | null][]): MomentFrame[] => rows.map(([gal, rank], i) => ({ ev: (i + 1) * 5000, gal, rank }));

  it("raconte le sommet, la chute et la remontée sans rien inventer", () => {
    const rows: [number, number | null][] = [];
    for (let i = 0; i < 100; i++) {
      let rank = 2;
      if (i < 5) rank = 5;
      if (i >= 30) rank = 8;
      if (i >= 70) rank = 5;
      rows.push([100 + i * 120, rank]);
    }
    const titles = findMoments(frames(rows)).map((m) => m.title);
    expect(titles[0]).toBe("Premier pixel de GAL");
    expect(titles).toContain("GAL atteint la 2e place");
    expect(titles).toContain("GAL recule à la 8e place");
    expect(titles).toContain("GAL remonte à la 5e place");
    expect(titles).toContain(`GAL franchit ${n(10000)} pixels`);
    expect(titles.at(-1)).toBe(`Dernier relevé\u00a0: ${n(11980)} pixels, 5e place`);
  });

  it("trouve la plus grande poussée et le plus dur recul", () => {
    const rows: [number, number | null][] = [];
    for (let i = 0; i < 200; i++) rows.push([100 + i, 3]);
    rows[80] = [5000, 3];
    for (let i = 81; i < 150; i++) rows[i] = [5000, 3];
    for (let i = 150; i < 200; i++) rows[i] = [1000, 3];
    const moments = findMoments(frames(rows));
    expect(moments.find((m) => m.kind === "push")).toMatchObject({ frame: 81, title: `La plus grande poussée\u00a0: +${n(4821)} pixels` });
    expect(moments.find((m) => m.kind === "loss")?.frame).toBe(151);
  });

  it("garde un écart entre deux moments et priorise le plus important", () => {
    const moments = findMoments(frames([[20000, 1], [26000, 1], [27000, 1], [28000, 1], [29000, 1], [30000, 1], [31000, 1], [32000, 1]]));
    for (let i = 1; i < moments.length; i++) {
      expect(moments[i]!.frame - moments[i - 1]!.frame).toBeGreaterThanOrEqual(3);
    }
    expect(moments[0]?.kind).toBe("first");
    expect(moments.at(-1)?.kind).toBe("now");
  });

  it("ne raconte rien si GAL n'a jamais eu de pixel", () => {
    expect(findMoments(frames([[0, null], [0, null]]))).toEqual([]);
  });

  it("ne donne pas de dernier relevé si GAL a tout perdu", () => {
    const moments = findMoments(frames([[10, 1], [10, 1], [10, 1], [10, 1], [0, null]]));
    expect(moments.some((m) => m.kind === "now")).toBe(false);
  });

  it("date chaque moment si le film a des dates, sans en inventer sinon", () => {
    const dated = findMoments([{ ev: 5000, gal: 0, rank: null, at: 100 }, { ev: 10000, gal: 50, rank: 1, at: 200 }]);
    expect(dated[0]).toMatchObject({ frame: 2, at: 200 });
    expect(findMoments(frames([[0, null], [50, 1]]))[0]?.at).toBeNull();
  });

  it("note le numéro d'événement de chaque moment", () => {
    const moments = findMoments(frames([[0, null], [50, 1]]));
    expect(moments[0]).toMatchObject({ frame: 2, event: 10000 });
  });
});

describe("nextThreshold", () => {
  it("donne le prochain palier et ce qu'il manque", () => {
    expect(nextThreshold(121_976)).toEqual({ threshold: 150_000, remaining: 28_024 });
    expect(nextThreshold(0)).toEqual({ threshold: 10_000, remaining: 10_000 });
  });
  it("un palier atteint n'est plus le prochain", () => {
    expect(nextThreshold(150_000)).toEqual({ threshold: 200_000, remaining: 50_000 });
  });
  it("ne dit rien au-delà du dernier palier", () => {
    expect(nextThreshold(THRESHOLDS.at(-1)!)).toBeNull();
    expect(nextThreshold(2_000_000)).toBeNull();
  });
});
