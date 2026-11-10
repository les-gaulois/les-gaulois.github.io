import { describe, expect, it } from "vitest";
import { clanRecords } from "../../src/lib/results";
import type { StoredSession } from "../../src/lib/schemas";

function game(over: Partial<StoredSession> & { gameId: string }): StoredSession {
  return {
    clanPlayerCount: 2,
    hasWon: true,
    numTeams: 2,
    playerTeams: "2",
    totalPlayerCount: 20,
    gameStart: "2026-11-01T10:00:00.000Z",
    score: 1,
    ...over,
  };
}
const many = (prefix: string, count: number, wins: number, over: Partial<StoredSession> = {}) =>
  Array.from({ length: count }, (_, i) => game({ gameId: `${prefix}${i}`, hasWon: i < wins, ...over }));

describe("clanRecords", () => {
  const at = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;

  it("trouve la plus longue série, en ordre de début de partie", () => {
    const rows = [
      game({ gameId: "d", gameStart: at(4), hasWon: true }),
      game({ gameId: "a", gameStart: at(1), hasWon: true }),
      game({ gameId: "b", gameStart: at(2), hasWon: false }),
      game({ gameId: "c", gameStart: at(3), hasWon: true }),
    ];
    expect(clanRecords(rows)?.streak).toEqual({ wins: 2, endedAt: at(4) });
  });
  it("trouve la journée de Paris la plus riche en victoires, la plus ancienne à égalité", () => {
    const rows = [
      game({ gameId: "a", gameStart: at(1) }),
      game({ gameId: "b", gameStart: at(2), hasWon: false }),
      game({ gameId: "c", gameStart: at(2) }),
      game({ gameId: "d", gameStart: at(3) }),
    ];
    expect(clanRecords(rows)?.bestDay).toEqual({ date: "2026-10-01", wins: 1, games: 1 });
    // 23 h 30 UTC : déjà le lendemain à Paris.
    const late = [game({ gameId: "e", gameStart: "2026-10-30T23:30:00.000Z" }), game({ gameId: "f", gameStart: "2026-10-31T10:00:00.000Z" })];
    expect(clanRecords(late)?.bestDay).toEqual({ date: "2026-10-31", wins: 2, games: 2 });
  });
  it("ne compte que les victoires pour le plus grand groupe et le plus d'équipes", () => {
    const rows = [
      game({ gameId: "a", gameStart: at(1), clanPlayerCount: 3, numTeams: 5, totalPlayerCount: 30 }),
      game({ gameId: "b", gameStart: at(2), clanPlayerCount: 9, numTeams: 40, totalPlayerCount: 99, hasWon: false }),
      game({ gameId: "c", gameStart: at(3), clanPlayerCount: 2, numTeams: 8, totalPlayerCount: 16 }),
    ];
    const out = clanRecords(rows);
    expect(out?.biggestGroup).toEqual({ players: 3, at: at(1) });
    expect(out?.mostTeams).toEqual({ teams: 8, players: 16, at: at(3) });
  });
  it("écarte une partie seule dans le salon, gagnée d'avance", () => {
    const rows = [game({ gameId: "solo", gameStart: at(1), totalPlayerCount: 1, numTeams: 60 }), game({ gameId: "a", gameStart: at(2), numTeams: 4 })];
    const out = clanRecords(rows);
    expect(out?.mostTeams.teams).toBe(4);
    expect(out?.streak.wins).toBe(1);
  });
  it("ne modifie pas la liste reçue", () => {
    const rows = [game({ gameId: "b", gameStart: at(2) }), game({ gameId: "a", gameStart: at(1) })];
    clanRecords(rows);
    expect(rows.map((r) => r.gameId)).toEqual(["b", "a"]);
  });
  it("ne renvoie rien sans victoire", () => {
    expect(clanRecords([])).toBeNull();
    expect(clanRecords(many("a", 3, 0))).toBeNull();
    expect(clanRecords([game({ gameId: "solo", totalPlayerCount: 1 })])).toBeNull();
  });
});
