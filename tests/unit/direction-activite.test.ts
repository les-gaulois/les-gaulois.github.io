import { describe, expect, it } from "vitest";
import type { SiteActivity } from "../../src/lib/activite-site";
import { visitShares, weekTicks, weekTrend } from "../../src/lib/compte/direction-activite";

const TODAY = "2026-11-30";
const shift = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const row = (day: string, visitors: number): SiteActivity["days"][number] => ({ day, visitors, views: visitors * 3, newcomers: 0, touch: 0, signed_in: 0 });
/** Les sept jours d'avant à `previous` visites par jour, les sept derniers jours finis à `current`, aujourd'hui à 999. */
const weeks = (previous: number, current: number, since = shift(-20)) => ({
  today: TODAY,
  since,
  // Le serveur n'a aucune ligne avant le début du compteur.
  days: [...Array.from({ length: 7 }, (_, i) => row(shift(-14 + i), previous)), ...Array.from({ length: 7 }, (_, i) => row(shift(-7 + i), current)), row(TODAY, 999)].filter((d) => d.day >= since),
});

describe("weekTrend", () => {
  it("ne compte pas aujourd'hui, en cours", () => {
    expect(weekTrend(weeks(10, 12))).toEqual({ ready: true, current: 84, previous: 70, way: "hausse", percent: 20 });
  });

  it("dit une baisse sans signe", () => {
    expect(weekTrend(weeks(10, 8))).toMatchObject({ way: "baisse", percent: 20 });
  });

  it("dit stable sous 5 % d'écart", () => {
    expect(weekTrend(weeks(100, 104))).toMatchObject({ way: "stable", percent: 4 });
    expect(weekTrend(weeks(100, 105))).toMatchObject({ way: "hausse", percent: 5 });
    expect(weekTrend(weeks(100, 96))).toMatchObject({ way: "stable", percent: 4 });
  });

  it("n'invente pas de pour cent quand les sept jours d'avant sont à zéro", () => {
    expect(weekTrend(weeks(0, 3))).toMatchObject({ way: "hausse", percent: null });
    expect(weekTrend(weeks(0, 0))).toMatchObject({ way: "stable", percent: null });
  });

  it("compte pour zéro un jour sans ligne après le début du compteur", () => {
    const activity = weeks(10, 10);
    activity.days = activity.days.filter((d) => d.day !== shift(-3));
    expect(weekTrend(activity)).toMatchObject({ current: 60, previous: 70, way: "baisse", percent: 14 });
  });

  it("attend quatorze jours finis, et dit depuis quand", () => {
    expect(weekTrend(weeks(10, 10, shift(-13)))).toEqual({ ready: false, from: shift(1) });
    expect(weekTrend(weeks(10, 10, shift(-14)))).toMatchObject({ ready: true });
    expect(weekTrend({ today: TODAY, since: TODAY, days: [row(TODAY, 4)] })).toEqual({ ready: false, from: shift(14) });
  });

  it("ne rend rien sans aucune visite comptée", () => {
    expect(weekTrend({ today: TODAY, since: null, days: [] })).toBeNull();
  });
});

describe("weekTicks", () => {
  it("rend la place de chaque lundi", () => {
    // Le 30 novembre 2026 est un lundi.
    expect(weekTicks([shift(-8), shift(-7), shift(-6), shift(-1), TODAY])).toEqual([1, 4]);
  });

  it("rend le premier jour faute de lundi, et rien sans jour", () => {
    expect(weekTicks([shift(-3), shift(-2)])).toEqual([0]);
    expect(weekTicks([])).toEqual([]);
  });
});

describe("visitShares", () => {
  it("additionne la période et arrondit les parts", () => {
    const days = [
      { day: shift(-1), visitors: 30, views: 90, newcomers: 3, touch: 20, signed_in: 0 },
      { day: TODAY, visitors: 10, views: 20, newcomers: 2, touch: 4, signed_in: 1 },
    ];
    const { visits, shares } = visitShares(days);
    expect(visits).toBe(40);
    expect(shares.map((s) => [s.key, s.count, s.percent])).toEqual([
      ["touch", 24, 60],
      ["signed_in", 1, 3],
      ["newcomers", 5, 13],
    ]);
  });

  it("n'a pas de part sans visite", () => {
    expect(visitShares([]).shares.every((s) => s.percent === null)).toBe(true);
  });
});
