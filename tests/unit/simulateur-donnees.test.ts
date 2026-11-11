import { describe, expect, it } from "vitest";
import type { RivalsSnapshot, StoredLeaderboard, StoredSession } from "../../src/lib/schemas";
import { DAY_MS, projectScore, scoreAt } from "../../src/lib/simulateur";
import { backtest, bestDay, galPoints, paceWindow, simClans, simData } from "../../src/lib/simulateur-donnees";

const T = Date.parse("2026-11-11T17:45:31.198Z");
const iso = (daysAgo: number) => new Date(T - daysAgo * DAY_MS).toISOString();
const session = (daysAgo: number, clanPlayerCount: number, hasWon: boolean, score: number): StoredSession => ({
  gameId: `g${daysAgo}-${clanPlayerCount}-${score}`,
  clanPlayerCount,
  hasWon,
  numTeams: 2,
  playerTeams: "2",
  totalPlayerCount: 20,
  gameStart: iso(daysAgo),
  score,
});
const leaderboard = (end: number, clans: [string, number][]): StoredLeaderboard =>
  ({
    start: new Date(end - 90 * DAY_MS).toISOString(),
    end: new Date(end).toISOString(),
    fetchedAt: new Date(end + 600_000).toISOString(),
    clans: clans.map(([clanTag, weightedWins]) => ({ clanTag, games: 1, wins: 1, losses: 0, playerSessions: 1, weightedWins, weightedLosses: 0, weightedWLRatio: 1 })),
  }) as StoredLeaderboard;
const snapshot = (end: number, clans: [string, number][]): RivalsSnapshot => ({
  date: new Date(end).toISOString().slice(0, 10),
  capturedAt: new Date(end).toISOString(),
  leaderboardEnd: new Date(end).toISOString(),
  clans: clans.map(([clanTag, weightedWins]) => ({ clanTag, weightedWins })),
});

describe("les parties de GAL pour le simulateur", () => {
  it("ne garde que les victoires encore dans la fenêtre, et celles relevées après le classement", () => {
    const rows = galPoints([session(91, 3, true, 2), session(89, 3, true, 2), session(1, 4, false, -0.4), session(-0.01, 2, true, 1.5)], T);
    expect(rows.map(([t, p]) => [Math.round((T - t * 1000) / DAY_MS), p])).toEqual([
      [89, 2],
      [-0, 1.5],
    ]);
  });

  it("mesure le rythme par taille de groupe, sur la période seulement", () => {
    const pace = paceWindow([session(1, 1, false, -0.1), session(2, 1, true, 0.3), session(3, 4, true, 2.5), session(6, 9, false, -0.5), session(8, 4, true, 9)], T, 7);
    expect(pace.days).toBe(7);
    expect(pace.sizes["1"]).toEqual({ games: 2, wins: 1, points: 0.3 });
    expect(pace.sizes["4"]).toEqual({ games: 2, wins: 1, points: 2.5 });
    expect(pace.sizes["2"]).toEqual({ games: 0, wins: 0, points: 0 });
  });

  it("trouve la meilleure journée, à l'heure de Paris", () => {
    // Le 10 novembre à 23 h 30 UTC, c'est déjà le 11 à Paris.
    const day = bestDay([
      { ...session(0, 4, true, 3), gameStart: "2026-11-10T23:30:00.000Z" },
      { ...session(0, 4, true, 2), gameStart: "2026-11-11T10:00:00.000Z" },
      { ...session(0, 4, true, 4), gameStart: "2026-11-10T12:00:00.000Z" },
    ]);
    expect(day).toEqual({ date: "2026-11-11", points: 5, games: 2 });
    expect(bestDay([])).toBeNull();
  });
});

describe("les autres clans", () => {
  it("lit leur rythme entre le classement et le plus ancien relevé des sept derniers jours", () => {
    const now = leaderboard(T, [
      ["UN", projectScore(10000, 300, 5)],
      ["GAL", 2300],
      ["NEW", 50],
    ]);
    const clans = simClans(now, [snapshot(T - 9 * DAY_MS, [["UN", 1]]), snapshot(T - 5 * DAY_MS, [["UN", 10000], ["GAL", 2200]]), snapshot(T - 2 * DAY_MS, [["UN", 10100]])]);
    expect(clans[0]).toMatchObject({ tag: "UN", rateDays: 5 });
    expect(clans[0]?.rate).toBeCloseTo(300, 3);
    expect(clans[2]).toEqual({ tag: "NEW", score: 50, rate: null, rateDays: null });
  });

  it("n'invente pas de rythme sans relevé assez ancien", () => {
    expect(simClans(leaderboard(T, [["UN", 1000]]), [snapshot(T - 0.5 * DAY_MS, [["UN", 990]])])[0]).toMatchObject({ rate: null, rateDays: null });
  });
});

describe("la fiabilité mesurée", () => {
  it("ne trouve aucun écart pour un clan au rythme parfaitement régulier", () => {
    // Une victoire de 1 point toutes les heures pendant 220 jours : le rythme ne change jamais.
    const sessions = Array.from({ length: 220 * 24 }, (_, i) => session(i / 24, 4, true, 1));
    const { rows, rateCheck } = backtest(sessions, iso(220).slice(0, 10), T);
    expect(new Set(rows.map((r) => r.pace))).toEqual(new Set([7, 30]));
    for (const row of rows.filter((r) => r.gal)) expect(row.gal!.mean).toBeLessThan(0.01);
    for (const row of rows.filter((r) => r.pace === 7 && r.clans)) expect(row.clans!.mean).toBeLessThan(0.01);
    // La méthode des autres clans ne se mesure qu'avec deux relevés à 7 jours d'écart.
    expect(rows.filter((r) => r.pace === 30).every((r) => r.clans === null)).toBe(true);
    expect(rateCheck!.mean).toBeLessThan(0.01);
  });

  it("n'a rien à mesurer sans 90 jours d'archive", () => {
    const { rows } = backtest([session(1, 4, true, 1)], iso(30).slice(0, 10), T);
    expect(rows.every((r) => r.gal === null && r.clans === null)).toBe(true);
  });
});

describe("le fichier du simulateur", () => {
  it("donne le score et le rang officiels, et le contrôle de la méthode", () => {
    const sessions = [session(10, 4, true, 3), session(40, 3, true, 2)];
    const data = simData({ leaderboard: leaderboard(T, [["UN", 9000], ["GAL", 3.9], ["ITA", 3]]), sessions, snapshots: [], coveredUntil: iso(0), archiveStart: "2026-04-10", tag: "GAL" })!;
    expect(data.official).toBe(3.9);
    expect(data.rank).toBe(2);
    expect(data.model).toBeCloseTo(scoreAt(galPoints(sessions, T), T), 2);
    expect(data.pace.map((p) => p.days)).toEqual([7, 30]);
    expect(data.clans.map((c) => c.tag)).toEqual(["UN", "GAL", "ITA"]);
  });

  it("dit GAL hors classement plutôt qu'un rang 0", () => {
    const data = simData({ leaderboard: leaderboard(T, [["UN", 9000]]), sessions: [], snapshots: [], coveredUntil: null, archiveStart: "2026-04-10", tag: "GAL" })!;
    expect(data.official).toBeNull();
    expect(data.rank).toBeNull();
    expect(simData({ leaderboard: null, sessions: [], snapshots: [], coveredUntil: null, archiveStart: "2026-04-10", tag: "GAL" })).toBeNull();
  });
});
