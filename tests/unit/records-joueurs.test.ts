import { describe, expect, it } from "vitest";
import { playerRecords } from "../../src/lib/records-joueurs";
import type { StoredMember, StoredMembers, StoredMemberWeeks } from "../../src/lib/schemas";

const member = (publicId: string | null, username: string | null, wins: number | null): StoredMember => ({
  role: "member",
  joinedAt: "2026-05-01T10:00:00.000Z",
  publicId,
  username,
  team: wins === null ? null : { wins, losses: 3 },
});
const list = (...members: StoredMember[]): StoredMembers => ({ fetchedAt: "2026-11-16T23:53:00.000Z", total: members.length, members });

// Semaine du lundi 2 novembre 2026, relevée à partir du jeudi 5 ; puis la semaine pleine du lundi 9, avec ses parties.
const weeks: StoredMemberWeeks = {
  reading: null,
  tops: {
    "2026-11-09": {
      since: "2026-11-08T23:53:00.000Z",
      players: [
        { id: "b", wins: 40 },
        { id: "c", wins: 30 },
      ],
      active: [{ id: "c", games: 90 }],
    },
    "2026-11-02": {
      since: "2026-11-05T10:39:31.574Z",
      players: [
        { id: "a", wins: 65 },
        { id: "b", wins: 49 },
      ],
    },
  },
};

describe("les records des joueurs", () => {
  it("donnent la meilleure semaine avec sa vraie période, même relevée en cours de route", () => {
    const records = playerRecords(weeks, list(member("a", "Alpha", 900), member("b", "Beta", 300), member("c", "Gamma", 200)));
    expect(records.bestWeek).toEqual({ value: 65, holders: [{ id: "a", username: "Alpha" }], week: "2026-11-02", from: "2026-11-05", to: "2026-11-08" });
    expect(records.firstDay).toBe("2026-11-05");
  });

  it("ne donnent la semaine la plus active que pour les semaines qui ont relevé les parties, et disent depuis quand", () => {
    const records = playerRecords(weeks, list(member("a", "Alpha", 900), member("c", "Gamma", 200)));
    expect(records.busiestWeek).toEqual({ value: 90, holders: [{ id: "c", username: "Gamma" }], week: "2026-11-09", from: "2026-11-09", to: "2026-11-15" });
    expect(records.gamesFirstDay).toBe("2026-11-09");
    const sansParties = playerRecords({ reading: null, tops: { "2026-11-02": weeks.tops["2026-11-02"]! } }, list(member("a", "Alpha", 900)));
    expect(sansParties.busiestWeek).toBeNull();
    expect(sansParties.gamesFirstDay).toBeNull();
  });

  it("citent tous les joueurs à égalité dans une semaine, et laissent le record à la première semaine qui l'a atteint", () => {
    const egalite: StoredMemberWeeks = {
      reading: null,
      tops: {
        "2026-11-09": { since: "2026-11-08T23:53:00.000Z", players: [{ id: "c", wins: 50 }] },
        "2026-11-02": {
          since: "2026-11-01T23:53:00.000Z",
          players: [
            { id: "a", wins: 50 },
            { id: "b", wins: 50 },
          ],
        },
      },
    };
    const records = playerRecords(egalite, list(member("a", "Alpha", 1), member("b", "Beta", 1), member("c", "Gamma", 1)));
    expect(records.bestWeek?.week).toBe("2026-11-02");
    expect(records.bestWeek?.from).toBe("2026-11-02");
    expect(records.bestWeek?.holders.map((h) => h.username)).toEqual(["Alpha", "Beta"]);
  });

  it("comptent, comme la gazette, les seuls joueurs qu'on peut nommer : un ancien membre ou un pseudo retiré ne garde pas le record", () => {
    // « a » n'est plus dans la liste avec un pseudo : le record de la semaine passe au meilleur joueur qu'on peut nommer.
    const records = playerRecords(weeks, list(member("b", "Beta", 300), member("c", "Gamma", 200)));
    expect(records.bestWeek).toMatchObject({ value: 49, holders: [{ id: "b", username: "Beta" }], week: "2026-11-02" });
    expect(playerRecords(weeks, list(member(null, null, 10))).bestWeek).toBeNull();
  });

  it("donnent le plus de victoires au total, égalités comprises, sans jamais nommer un anonyme, et rien sans victoire", () => {
    expect(playerRecords(weeks, list(member("a", "Alpha", 900), member("b", "Beta", 900), member("c", "Gamma", 200))).mostWins).toEqual({
      value: 900,
      holders: [
        { id: "a", username: "Alpha" },
        { id: "b", username: "Beta" },
      ],
    });
    expect(playerRecords(weeks, list(member("b", "Beta", 300), member(null, null, 2000))).mostWins).toEqual({ value: 2000, holders: [{ id: "", username: null }] });
    expect(playerRecords(weeks, list(member("a", "Alpha", 0), member("b", "Beta", null))).mostWins).toBeNull();
    expect(playerRecords(weeks, null).mostWins).toBeNull();
  });

  it("ne disent rien sans semaine gardée : ce n'est pas un zéro", () => {
    const records = playerRecords({ reading: null, tops: {} }, list(member("a", "Alpha", 10)));
    expect(records).toMatchObject({ bestWeek: null, busiestWeek: null, firstDay: null, gamesFirstDay: null });
  });
});
