import { describe, expect, it } from "vitest";
import { recentRecordKeys, recordDate, weekRecordKeys } from "../../src/lib/records-battus";
import type { ClanRecords } from "../../src/lib/results";

const records: ClanRecords = {
  streak: { wins: 7, endedAt: "2026-11-06T21:30:00.000Z" },
  bestDay: { date: "2026-10-31", wins: 40, games: 90 },
  biggestGroup: { players: 6, at: "2026-11-01T23:30:00.000Z" }, // le 2 novembre à Paris
  mostTeams: { teams: 8, players: 64, at: "2026-09-12T18:00:00.000Z" },
};

describe("recordDate", () => {
  it("donne le jour de Paris de chaque record", () => {
    expect(recordDate(records, "streak")).toBe("2026-11-06");
    expect(recordDate(records, "bestDay")).toBe("2026-10-31");
    expect(recordDate(records, "biggestGroup")).toBe("2026-11-02");
    expect(recordDate(records, "mostTeams")).toBe("2026-09-12");
  });
});

describe("recentRecordKeys", () => {
  it("garde les records des sept derniers jours couverts, ce jour compris", () => {
    expect([...recentRecordKeys(records, "2026-11-08T08:53:00.000Z")]).toEqual(["streak", "biggestGroup"]);
    expect([...recentRecordKeys(records, "2026-11-06T08:53:00.000Z")]).toEqual(["streak", "bestDay", "biggestGroup"]);
  });
  it("ne dit rien sans records ni collecte", () => {
    expect(recentRecordKeys(null, "2026-11-08T08:53:00.000Z").size).toBe(0);
    expect(recentRecordKeys(records, null).size).toBe(0);
  });
});

describe("weekRecordKeys", () => {
  it("reconnaît un record de la semaine qui est aussi celui de tout l'historique", () => {
    const week: ClanRecords = { ...records, bestDay: { date: "2026-11-05", wins: 12, games: 30 }, mostTeams: { teams: 8, players: 50, at: "2026-11-04T18:00:00.000Z" } };
    expect([...weekRecordKeys(week, records)]).toEqual(["streak", "biggestGroup"]);
  });
  it("n'en fait pas un record quand la semaine ne fait qu'égaler un ancien", () => {
    const week: ClanRecords = { ...records, streak: { wins: 7, endedAt: "2026-11-07T10:00:00.000Z" } };
    expect(weekRecordKeys(week, records).has("streak")).toBe(false);
    expect(weekRecordKeys(null, records).size).toBe(0);
  });
});
