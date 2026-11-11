import { describe, expect, it } from "vitest";
import type { StoredLeaderboard, StoredMembers, StoredMemberWeeks, StoredSession } from "../../src/lib/schemas";
import { clanScores, clanWeeks, memberGainsThisWeek } from "../../src/lib/semaine-du-clan";

const session = (gameStart: string, hasWon = false): StoredSession => ({ gameId: gameStart, clanPlayerCount: 2, hasWon, numTeams: 2, playerTeams: "2", totalPlayerCount: 20, gameStart, score: 0 });

// Mercredi 11 novembre 2026, 17 h 53 à Paris : la semaine en cours va du lundi 9 au dimanche 15.
const COVERED = "2026-11-11T16:53:50.002Z";

describe("clanWeeks", () => {
  const sessions = [
    session("2026-11-08T22:59:00.000Z", true), // dimanche 8, 23 h 59 à Paris : semaine du 2
    session("2026-11-08T23:00:00.000Z", true), // lundi 9, 0 h 00 à Paris : semaine du 9
    session("2026-11-10T20:00:00.000Z"),
    session("2026-11-11T12:00:00.000Z", true),
    session("2026-11-02T10:00:00.000Z"),
    session("2026-10-27T10:00:00.000Z", true), // semaine du 26 octobre
  ];

  it("compte les victoires de chaque semaine, du lundi au dimanche à Paris, la plus récente d'abord", () => {
    expect(clanWeeks(sessions, COVERED, "2026-11-10", "2026-04-10")).toEqual([
      { from: "2026-11-09", games: 3, wins: 2, complete: false },
      { from: "2026-11-02", games: 2, wins: 1, complete: true },
      { from: "2026-10-26", games: 1, wins: 1, complete: true },
    ]);
  });

  it("ne dit une semaine complète qu'une fois son dimanche entièrement relevé", () => {
    const weeks = clanWeeks(sessions, COVERED, "2026-11-07", "2026-04-10");
    expect(weeks.map((w) => w.complete)).toEqual([false, false, true]);
  });

  it("ne donne aucune semaine sans collecte, ni une semaine d'avant l'archive", () => {
    expect(clanWeeks(sessions, null, "2026-11-10", "2026-04-10")).toEqual([]);
    expect(clanWeeks(sessions, COVERED, "2026-11-10", "2026-11-01").map((w) => w.from)).toEqual(["2026-11-09", "2026-11-02"]);
  });
});

describe("memberGainsThisWeek", () => {
  const members = (fetchedAt: string, rows: [string | null, string | null, number][]): StoredMembers => ({
    fetchedAt,
    total: rows.length,
    members: rows.map(([publicId, username, wins]) => ({ role: "member", joinedAt: "2026-05-01T00:00:00.000Z", publicId, username, team: { wins, losses: 0 } })),
  });
  const reading: StoredMemberWeeks["reading"] = { on: "2026-11-09", at: "2026-11-08T23:53:28.983Z", wins: { aaa: 10, bbb: 50, ccc: 7 } };

  it("compte les victoires de chaque membre avec pseudo depuis le relevé du lundi", () => {
    const now = members("2026-11-11T13:54:00.785Z", [
      ["aaa", "Alpha", 14],
      ["bbb", "Bravo", 50],
      ["ddd", "Nouveau", 3], // arrivé dans la semaine : pas de point de départ
      [null, null, 99], // anonyme : jamais
    ]);
    expect(memberGainsThisWeek(reading, now)).toEqual({ since: reading!.at, until: now.fetchedAt, wins: { aaa: 4, bbb: 0 } });
  });

  it("ne publie pas une baisse", () => {
    expect(memberGainsThisWeek(reading, members("2026-11-11T13:54:00.785Z", [["ccc", "Charlie", 6]]))?.wins).toEqual({});
  });

  it("ne mélange pas deux semaines : sans relevé du lundi de la liste, rien", () => {
    expect(memberGainsThisWeek(reading, members("2026-11-16T09:00:00.000Z", [["aaa", "Alpha", 20]]))).toBeNull();
    expect(memberGainsThisWeek(reading, members("2026-11-08T22:00:00.000Z", [["aaa", "Alpha", 20]]))).toBeNull();
    expect(memberGainsThisWeek(null, members("2026-11-11T13:54:00.785Z", []))).toBeNull();
    expect(memberGainsThisWeek(reading, null)).toBeNull();
  });
});

describe("clanScores", () => {
  it("garde le score de chaque clan du classement et la fin de sa période", () => {
    const leaderboard = {
      start: "2026-08-13T16:43:11.548Z",
      end: "2026-11-11T16:43:11.548Z",
      fetchedAt: "2026-11-11T16:53:48.980Z",
      clans: [
        { clanTag: "UN", games: 10, wins: 5, losses: 5, playerSessions: 30, weightedWins: 10945.93, weightedLosses: 1, weightedWLRatio: 1 },
        { clanTag: "GAL", games: 10, wins: 5, losses: 5, playerSessions: 30, weightedWins: 2308.7, weightedLosses: 1, weightedWLRatio: 1 },
      ],
    } as StoredLeaderboard;
    expect(clanScores(leaderboard)).toEqual({ end: "2026-11-11T16:43:11.548Z", scores: [{ tag: "UN", score: 10945.93 }, { tag: "GAL", score: 2308.7 }] });
    expect(clanScores(null)).toBeNull();
  });
});
