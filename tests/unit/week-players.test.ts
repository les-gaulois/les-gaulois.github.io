import { describe, expect, it } from "vitest";
import type { StoredMember, StoredMembers, StoredMemberWeeks } from "../../src/lib/schemas";
import { isFirstOfMonday } from "../../src/lib/time";
import { allTimePlayers, EMPTY_MEMBER_WEEKS, forgetInMemberWeeks, namedWeekPlayers, namedWins, nextMemberWeeks, weekWinners } from "../../src/lib/week-players";

const member = (id: string | null, username: string | null, wins: number | null): StoredMember => ({
  role: "member",
  joinedAt: "2026-05-03T21:26:21.579Z",
  publicId: id,
  username,
  team: wins === null ? null : { wins, losses: 1 },
});
const list = (fetchedAt: string, members: StoredMember[]): StoredMembers => ({ fetchedAt, total: members.length, members });
// Le 9 novembre 2026 est un lundi : 0 h 53 à Paris, c'est encore dimanche en temps universel.
const MONDAY_9 = "2026-11-08T23:53:00.000Z";
const MONDAY_16 = "2026-11-15T23:53:00.000Z";
const MONDAY_23 = "2026-11-22T23:53:00.000Z";

describe("weekWinners", () => {
  it("range les plus grandes différences de victoires et garde le podium", () => {
    expect(weekWinners({ a: 100, b: 50, c: 10, d: 0 }, { a: 110, b: 80, c: 30, d: 5 })).toEqual([
      { id: "b", wins: 30 },
      { id: "c", wins: 20 },
      { id: "a", wins: 10 },
    ]);
  });

  it("ne compte ni un membre sans relevé de départ, ni une absence de victoire, ni une baisse", () => {
    expect(weekWinners({ a: 10, b: 10, c: 10 }, { a: 10, b: 8, c: 12, nouveau: 500 })).toEqual([{ id: "c", wins: 2 }]);
  });

  it("garde tout le monde à égalité sur la dernière marche", () => {
    expect(weekWinners({ a: 0, b: 0, c: 0, d: 0 }, { a: 9, b: 7, c: 5, d: 5 }).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ne cite personne de la dernière marche si l'égalité ferait trop de lignes", () => {
    const before = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    expect(weekWinners(before, { a: 9, b: 2, c: 2, d: 2, e: 2, f: 2 }).map((r) => r.id)).toEqual(["a"]);
  });

  it("ne donne rien sans victoire", () => {
    expect(weekWinners({ a: 3 }, { a: 3 })).toEqual([]);
    expect(weekWinners({}, {})).toEqual([]);
  });
});

describe("namedWins", () => {
  it("ne retient jamais un anonyme ni un membre sans stats", () => {
    expect(namedWins(list(MONDAY_9, [member("a", "Alpha", 4), member("SECRET", null, 9), member(null, null, 9), member("b", "Beta", null)]))).toEqual({ a: 4 });
  });
});

describe("nextMemberWeeks", () => {
  const first = nextMemberWeeks(EMPTY_MEMBER_WEEKS, list(MONDAY_9, [member("a", "Alpha", 10), member("b", "Beta", 20)]));

  it("prend le premier relevé d'un lundi à Paris comme repère", () => {
    expect(first).toEqual({ reading: { on: "2026-11-09", at: MONDAY_9, wins: { a: 10, b: 20 } }, tops: {} });
  });

  it("ne fait rien un autre jour, et le rend sans le recopier", () => {
    expect(nextMemberWeeks(first, list("2026-11-10T10:00:00.000Z", [member("a", "Alpha", 99)]))).toBe(first);
    // Dimanche 23 h à Paris, ce n'est pas encore lundi.
    expect(nextMemberWeeks(EMPTY_MEMBER_WEEKS, list("2026-11-08T22:00:00.000Z", [member("a", "Alpha", 1)]))).toBe(EMPTY_MEMBER_WEEKS);
  });

  it("ne remplace pas le repère par une relecture du même lundi", () => {
    expect(nextMemberWeeks(first, list("2026-11-09T20:00:00.000Z", [member("a", "Alpha", 99)]))).toBe(first);
  });

  it("arrête les joueurs de la semaine sous son lundi, et prend le nouveau repère", () => {
    const next = nextMemberWeeks(first, list(MONDAY_16, [member("a", "Alpha", 25), member("b", "Beta", 22)]));
    expect(next.tops).toEqual({
      "2026-11-09": [
        { id: "a", wins: 15 },
        { id: "b", wins: 2 },
      ],
    });
    expect(next.reading).toEqual({ on: "2026-11-16", at: MONDAY_16, wins: { a: 25, b: 22 } });
  });

  it("n'annonce pas une semaine trop longue : le relevé d'arrivée fait tard le lundi ne vaut pas une semaine", () => {
    const late = nextMemberWeeks(first, list("2026-11-16T20:00:00.000Z", [member("a", "Alpha", 40)]));
    expect(late.tops).toEqual({});
    expect(late.reading?.on).toBe("2026-11-16");
  });

  it("tolère un passage retardé de quelques heures", () => {
    const delayed = nextMemberWeeks(first, list("2026-11-16T03:53:00.000Z", [member("a", "Alpha", 40), member("b", "Beta", 20)]));
    expect(delayed.tops["2026-11-09"]).toEqual([{ id: "a", wins: 30 }]);
  });

  it("tolère le changement d'heure, qui donne à la semaine une heure de plus ou de moins", () => {
    // Le 26 octobre 2026 à 0 h 53 à Paris, puis la semaine d'avant, où Paris était à l'heure d'été.
    const summer = nextMemberWeeks(EMPTY_MEMBER_WEEKS, list("2026-10-18T22:53:00.000Z", [member("a", "Alpha", 1)]));
    expect(summer.reading?.on).toBe("2026-10-19");
    const winter = nextMemberWeeks(summer, list("2026-10-25T23:53:00.000Z", [member("a", "Alpha", 6)]));
    expect(winter.tops["2026-10-19"]).toEqual([{ id: "a", wins: 5 }]);
  });

  it("n'annonce aucune semaine si un lundi a manqué : deux semaines ne valent pas une", () => {
    const next = nextMemberWeeks(first, list(MONDAY_23, [member("a", "Alpha", 99)]));
    expect(next.tops).toEqual({});
    expect(next.reading?.on).toBe("2026-11-23");
  });
});

describe("forgetInMemberWeeks", () => {
  const weeks: StoredMemberWeeks = {
    reading: { on: "2026-11-16", at: MONDAY_16, wins: { a: 1, parti: 2 } },
    tops: { "2026-11-09": [{ id: "parti", wins: 9 }, { id: "a", wins: 3 }] },
  };

  it("retire un membre parti partout", () => {
    const kept = forgetInMemberWeeks(weeks, new Set(["a"]));
    expect(JSON.stringify(kept)).not.toContain("parti");
    expect(kept.tops["2026-11-09"]).toEqual([{ id: "a", wins: 3 }]);
    expect(kept.reading?.wins).toEqual({ a: 1 });
  });

  it("rend le même objet s'il n'y a rien à oublier", () => {
    expect(forgetInMemberWeeks(weeks, new Set(["a", "parti"]))).toBe(weeks);
    expect(forgetInMemberWeeks(EMPTY_MEMBER_WEEKS, new Set())).toBe(EMPTY_MEMBER_WEEKS);
  });
});

describe("namedWeekPlayers", () => {
  const members = list(MONDAY_16, [member("a", "Alpha", 1), member("b", "Beta", 1), member("c", "Gamma", 1)]);

  it("donne le pseudo et la place, deux joueurs à égalité partageant la même", () => {
    const players = namedWeekPlayers([{ id: "a", wins: 9 }, { id: "b", wins: 9 }, { id: "c", wins: 4 }], members);
    expect(players?.map((p) => [p.username, p.wins, p.place])).toEqual([["Alpha", 9, 1], ["Beta", 9, 1], ["Gamma", 4, 3]]);
  });

  it("ne cite plus celui qui a quitté le clan ou retiré son pseudo", () => {
    const players = namedWeekPlayers([{ id: "parti", wins: 30 }, { id: "a", wins: 9 }], members);
    expect(players?.map((p) => [p.username, p.place])).toEqual([["Alpha", 1]]);
  });

  it("n'écrit pas un zéro sans relevé : c'est `null`", () => {
    expect(namedWeekPlayers(undefined, members)).toBeNull();
    expect(namedWeekPlayers([{ id: "a", wins: 9 }], null)).toBeNull();
    expect(namedWeekPlayers([], members)).toBeNull();
    expect(namedWeekPlayers([{ id: "parti", wins: 9 }], members)).toBeNull();
  });
});

describe("allTimePlayers", () => {
  it("donne les membres avec pseudo qui ont le plus de victoires depuis le début", () => {
    const members = list(MONDAY_9, [member("a", "Alpha", 5), member("b", "Beta", 50), member("SECRET", null, 500), member("c", "Gamma", 20), member("d", "Delta", 1), member("e", "Epsilon", 0)]);
    expect(allTimePlayers(members).map((p) => [p.username, p.wins, p.place])).toEqual([["Beta", 50, 1], ["Gamma", 20, 2], ["Alpha", 5, 3]]);
  });

  it("reste vide sans liste", () => {
    expect(allTimePlayers(null)).toEqual([]);
  });
});

describe("isFirstOfMonday", () => {
  const monday = new Date(MONDAY_9);

  it("vaut pour le premier passage d'un lundi à Paris", () => {
    expect(isFirstOfMonday("2026-11-08T15:00:00.000Z", monday)).toBe(true);
    expect(isFirstOfMonday(null, monday)).toBe(true);
  });

  it("ne vaut plus une fois le relevé fait ce lundi", () => {
    expect(isFirstOfMonday(MONDAY_9, new Date("2026-11-09T00:53:00.000Z"))).toBe(false);
  });

  it("ne vaut pas un autre jour, même sans aucun relevé", () => {
    expect(isFirstOfMonday(null, new Date("2026-11-10T10:00:00.000Z"))).toBe(false);
    // Dimanche 23 h 30 à Paris : ce n'est pas encore lundi.
    expect(isFirstOfMonday(null, new Date("2026-11-08T22:30:00.000Z"))).toBe(false);
  });
});
