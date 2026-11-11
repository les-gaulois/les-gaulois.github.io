import { describe, expect, it } from "vitest";
import { fmtPct } from "../../src/lib/format";
import type { StoredMemberResult, StoredSession } from "../../src/lib/schemas";
import { groupSentence, groupStats, sessionsById, winRateOf } from "../../src/lib/seul-groupe";

const session = (gameId: string, clanPlayerCount: number, playerTeams: string | null): StoredSession => ({
  gameId,
  clanPlayerCount,
  hasWon: false,
  numTeams: 2,
  playerTeams,
  totalPlayerCount: 30,
  gameStart: "2026-11-10T20:00:00.000Z",
  score: 0,
});
const plain = (s: string | null) => s?.replace(/ | /g, " ") ?? null;

describe("seul ou en groupe", () => {
  const byId = sessionsById([session("a", 1, "2"), session("b", 1, "Trios"), session("c", 3, "Trios"), session("d", 4, "Quads"), session("e", 7, "Quads"), session("f", 2, null)]);
  const result: StoredMemberResult = {
    seen: 7,
    readAt: "2026-11-11T12:00:00.000Z",
    older: null,
    games: [
      ["a", "2026-11-01T10:00:00.000Z", 0],
      ["b", "2026-11-02T10:00:00.000Z", 1],
      ["c", "2026-11-03T10:00:00.000Z", 1],
      ["d", "2026-11-04T10:00:00.000Z", 1],
      ["e", "2026-11-05T10:00:00.000Z", 0],
      ["f", "2026-11-06T10:00:00.000Z", 1],
      // Une partie absente des sessions du clan (Humains contre Nations, par exemple) n'est pas rangée.
      ["z", "2026-11-07T10:00:00.000Z", 1],
    ],
  };

  it("range ses parties selon le nombre de Gaulois et le format", () => {
    const stats = groupStats(result, byId)!;
    expect(stats.bySize).toEqual({ "1": { games: 2, wins: 1 }, "2": { games: 1, wins: 1 }, "3": { games: 1, wins: 1 }, "4": { games: 2, wins: 1 } });
    expect(stats.byFormat).toEqual([
      { format: "Quads", games: 2, wins: 1 },
      { format: "Trios", games: 2, wins: 2 },
      { format: "2 équipes", games: 1, wins: 0 },
    ]);
    expect(stats).toMatchObject({ matched: 6, total: 7, from: "2026-11-01T10:00:00.000Z", to: "2026-11-06T10:00:00.000Z", complete: true });
  });

  it("ne dit rien sans liste, ou sans partie retrouvée", () => {
    expect(groupStats(undefined, byId)).toBeNull();
    expect(groupStats({ ...result, games: [["z", "2026-11-07T10:00:00.000Z", 1]] }, byId)).toBeNull();
    expect(groupStats({ ...result, older: "curseur" }, byId)?.complete).toBe(false);
  });

  it("écrit « — » plutôt qu'un taux sans partie", () => {
    expect(winRateOf({ games: 0, wins: 0 })).toBeNull();
    expect(winRateOf({ games: 4, wins: 1 })).toBe(25);
  });

  it("ne met en phrase que ce qui repose sur assez de parties", () => {
    expect(groupSentence(groupStats(result, byId)!, "Alpha", fmtPct)).toBeNull();
    const many: StoredMemberResult = {
      ...result,
      games: Array.from({ length: 60 }, (_, i) => [i < 30 ? "a" : "d", "2026-11-01T10:00:00.000Z", (i < 30 ? i % 5 === 0 : i % 5 !== 0) ? 1 : 0] as [string, string, 0 | 1]),
    };
    expect(plain(groupSentence(groupStats(many, byId)!, "Alpha", fmtPct))).toBe("Avec d'autres Gaulois, Alpha gagne 80,0 % de ses parties ; seul, 20,0 %.");
  });
});
