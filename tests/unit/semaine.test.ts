import { describe, expect, it } from "vitest";
import type { StoredSession } from "../../src/lib/schemas";
import { currentWeek, currentWeekComparison, currentWeekLead } from "../../src/lib/semaine";

const session = (gameStart: string, hasWon = false): StoredSession => ({ gameId: gameStart, clanPlayerCount: 2, hasWon, numTeams: 2, playerTeams: "2", totalPlayerCount: 20, gameStart, score: 0 });
const plain = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;

// Dimanche 8 novembre 2026, 9 h 53 à Paris : la semaine va du lundi 2 au dimanche 8.
const COVERED = "2026-11-08T08:53:32.009Z";

describe("currentWeek", () => {
  it("compte les parties depuis le lundi à Paris jusqu'à la collecte", () => {
    const week = currentWeek(
      [
        session("2026-11-01T22:59:00.000Z"), // dimanche 1er, 23 h 59 à Paris : semaine d'avant
        session("2026-11-01T23:00:00.000Z", true), // lundi 2, 0 h 00 à Paris
        session("2026-11-08T08:00:00.000Z"),
        session("2026-11-08T09:00:00.000Z", true), // après la collecte : pas encore connue
      ],
      COVERED,
      "2026-04-10",
    )!;
    expect(week).toMatchObject({ from: "2026-11-02", to: "2026-11-08", until: COVERED, totals: { games: 2, wins: 1, winRate: 50 } });
  });
  it("arrête la semaine d'avant au même moment de la semaine", () => {
    const week = currentWeek(
      [
        session("2026-10-26T08:00:00.000Z", true), // lundi 26, 9 h : compte
        session("2026-11-01T08:53:00.000Z"), // dimanche 1er, 9 h 53 : compte, juste avant la limite
        session("2026-11-01T08:54:00.000Z", true), // dimanche 1er, 9 h 54 : après la limite
        session("2026-11-05T10:00:00.000Z"),
      ],
      COVERED,
      "2026-04-10",
    )!;
    expect(week.previous).toEqual({ games: 2, wins: 1, winRate: 50 });
  });
  it("garde la même heure de Paris autour du changement d'heure", () => {
    // Dimanche 1er novembre, 9 h 53 à Paris (heure d'hiver). La semaine d'avant a changé d'heure le 25 octobre : même heure, 9 h 53, soit 8 h 53 UTC.
    const week = currentWeek([session("2026-10-25T08:52:00.000Z", true), session("2026-10-25T08:54:00.000Z")], "2026-11-01T08:53:32.009Z", "2026-04-10")!;
    expect(week.previous).toEqual({ games: 1, wins: 1, winRate: 100 });
  });
  it("ne compare pas à une semaine d'avant l'archive", () => {
    expect(currentWeek([], COVERED, "2026-10-27")?.previous).toBeNull();
    expect(currentWeek([], COVERED, "2026-10-26")?.previous).toEqual({ games: 0, wins: 0, winRate: null });
  });
  it("n'existe pas sans collecte", () => {
    expect(currentWeek([session("2026-11-05T10:00:00.000Z")], null, "2026-04-10")).toBeNull();
  });
});

describe("les phrases de la semaine en cours", () => {
  const week = currentWeek([session("2026-11-05T10:00:00.000Z", true), session("2026-11-06T10:00:00.000Z"), session("2026-10-29T10:00:00.000Z"), session("2026-10-30T10:00:00.000Z")], COVERED, "2026-04-10")!;
  it("date les chiffres au lieu de les donner pour la semaine entière", () => {
    expect(plain(currentWeekLead(week))).toBe("Jusqu'au 8 nov., 09:53 : 2 parties et 1 victoire, soit 50,0 %.");
    expect(plain(currentWeekLead({ ...week, totals: { games: 0, wins: 0, winRate: null } }))).toBe("Jusqu'au 8 nov., 09:53 : aucune partie enregistrée pour l'instant.");
  });
  it("compare à la semaine d'avant à la même heure, en points de taux", () => {
    expect(plain(currentWeekComparison(week))).toBe("La semaine d'avant à la même heure : 2 parties, 0,0 %. Taux de victoire : +50,0 points.");
    expect(currentWeekComparison({ ...week, previous: null })).toBeNull();
    expect(currentWeekComparison({ ...week, previous: { games: 0, wins: 0, winRate: null } })).toBe("Aucune partie à la même heure la semaine d'avant.");
  });
});
