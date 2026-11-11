import { describe, expect, it } from "vitest";
import { groupsContent, groupsPass, groupsPayload, weekGroups, weekReady, weekToSend, type GroupsState, type WeekGroups } from "../../src/lib/groupes-discord";
import type { StoredMemberResults, StoredMembers, StoredSession } from "../../src/lib/schemas";

const SITE = "https://les-gaulois.github.io";
const plain = (s: string) => s.replace(/ | /g, " ");
const session = (gameId: string, gameStart: string, clanPlayerCount: number, score: number): StoredSession => ({ gameId, clanPlayerCount, hasWon: score > 0, numTeams: 2, playerTeams: "Trios", totalPlayerCount: 30, gameStart, score });
const members: StoredMembers = {
  fetchedAt: "2026-11-10T12:00:00.000Z",
  total: 4,
  members: [
    { role: "member", joinedAt: "2026-05-01T00:00:00.000Z", publicId: "aaa", username: "Alpha", team: { wins: 10, losses: 5 } },
    { role: "member", joinedAt: "2026-05-01T00:00:00.000Z", publicId: "bbb", username: "Bra*vo", team: { wins: 10, losses: 5 } },
    { role: "member", joinedAt: "2026-05-01T00:00:00.000Z", publicId: "ccc", username: "Charlie", team: { wins: 10, losses: 5 } },
    { role: "member", joinedAt: "2026-05-01T00:00:00.000Z", publicId: null, username: null, team: { wins: 1, losses: 1 } },
  ],
};
// La semaine du lundi 2 au dimanche 8 novembre 2026, à Paris.
const sessions = [
  session("g1", "2026-11-02T19:00:00.000Z", 3, 2.5),
  session("g2", "2026-11-03T19:00:00.000Z", 2, 1.5),
  session("g3", "2026-11-04T19:00:00.000Z", 1, 0.2),
  session("g4", "2026-11-05T19:00:00.000Z", 1, -0.1),
  session("g5", "2026-11-08T22:59:00.000Z", 2, -0.3), // dimanche 23 h 59 à Paris : dans la semaine
  session("g6", "2026-11-08T23:00:00.000Z", 4, 3), // lundi 0 h à Paris : semaine suivante
];
const results: StoredMemberResults = {
  aaa: { seen: 3, readAt: "2026-11-10T08:00:00.000Z", older: null, games: [["g1", "2026-11-02T19:00:00.000Z", 1], ["g2", "2026-11-03T19:00:00.000Z", 1], ["g5", "2026-11-08T22:59:00.000Z", 0], ["g6", "2026-11-08T23:00:00.000Z", 1]] },
  bbb: { seen: 3, readAt: "2026-11-10T08:00:00.000Z", older: null, games: [["g1", "2026-11-02T19:00:00.000Z", 1], ["g2", "2026-11-03T19:00:00.000Z", 1], ["g5", "2026-11-08T22:59:00.000Z", 0]] },
  ccc: { seen: 1, readAt: "2026-11-10T08:00:00.000Z", older: null, games: [["g1", "2026-11-02T19:00:00.000Z", 1]] },
  // Un membre parti : il n'est plus dans la liste, il n'est pas cité.
  zzz: { seen: 1, readAt: "2026-11-10T08:00:00.000Z", older: null, games: [["g1", "2026-11-02T19:00:00.000Z", 1]] },
};

describe("le bilan de la semaine", () => {
  const week = weekGroups({ monday: "2026-11-02", sessions, results, members })!;

  it("compte les parties à plusieurs et leurs points, de lundi 0 h à dimanche minuit, à Paris", () => {
    expect(week).toMatchObject({ monday: "2026-11-02", games: 5, groupGames: 3 });
    expect(week.points).toBeCloseTo(4.2, 9);
    expect(week.groupPoints).toBeCloseTo(4, 9);
    expect(week.perGame["1"]).toBeCloseTo(0.1, 9);
    expect(week.perGame["2"]).toBeCloseTo(0.75, 9);
    expect(week.perGame["3"]).toBeCloseTo(2.5, 9);
    expect(week.perGame["4"]).toBeNull();
  });

  it("trouve les duos qui ont le plus gagné ensemble, sans les membres partis", () => {
    expect(week.duos.map((d) => [d.a.name, d.b.name, d.wins, d.games])).toEqual([
      ["Alpha", "Bra*vo", 2, 3],
      ["Alpha", "Charlie", 1, 1],
      ["Bra*vo", "Charlie", 1, 1],
    ]);
  });

  it("ne compte une victoire de duo que si les deux l'ont gagnée", () => {
    // Bravo a quitté g2 avant la fin : OpenFront lui compte une défaite, et le duo ne la compte pas comme une victoire.
    const left: StoredMemberResults = { ...results, bbb: { ...results["bbb"]!, games: [["g1", "2026-11-02T19:00:00.000Z", 1], ["g2", "2026-11-03T19:00:00.000Z", 0], ["g5", "2026-11-08T22:59:00.000Z", 0]] } };
    const duo = weekGroups({ monday: "2026-11-02", sessions, results: left, members })!.duos.find((d) => d.a.name === "Alpha" && d.b.name === "Bra*vo");
    expect(duo).toMatchObject({ games: 3, wins: 1 });
  });

  it("ne garde que les parties du clan", () => {
    const extra: StoredMemberResults = { ...results, ccc: { ...results["ccc"]!, games: [...results["ccc"]!.games, ["hn1", "2026-11-04T19:00:00.000Z", 1]] }, aaa: { ...results["aaa"]!, games: [...results["aaa"]!.games, ["hn1", "2026-11-04T19:00:00.000Z", 1]] } };
    const duo = weekGroups({ monday: "2026-11-02", sessions, results: extra, members })!.duos.find((d) => d.a.name === "Alpha" && d.b.name === "Charlie");
    expect(duo).toMatchObject({ games: 1, wins: 1 });
  });

  it("ne fait pas de bilan d'une semaine sans partie", () => {
    expect(weekGroups({ monday: "2026-10-05", sessions, results, members })).toBeNull();
  });

  it("écrit le message sans mention, pseudos échappés et reliés à leur fiche", () => {
    const text = plain(groupsContent(week, SITE));
    expect(text).toContain("**Jouer ensemble, la semaine du 2 nov. au 8 nov.**");
    expect(text).toContain("👥 À plusieurs : 60 % des 5 parties, pour 95 % des points gagnés.");
    expect(text).toContain("📈 Points par partie : seul : 0,10 ; à 2 : 0,75 ; à 3 : 2,50.");
    expect(text).toContain("1. [**Alpha**](<https://les-gaulois.github.io/membres/aaa>) et [**Bra\\*vo**](<https://les-gaulois.github.io/membres/bbb>) : 2 victoires ensemble, sur 3 parties");
    expect(text).toContain("pas un niveau");
    expect(groupsPayload(week, SITE)).toMatchObject({ allowed_mentions: { parse: [] } });
  });
});

describe("le moment du message", () => {
  it("parle de la semaine finie, du mardi au dimanche qui suivent, jamais le lundi", () => {
    expect(weekToSend(new Date("2026-11-09T13:00:00.000Z"))).toBeNull(); // lundi 9
    expect(weekToSend(new Date("2026-11-10T13:00:00.000Z"))).toBe("2026-11-02"); // mardi 10
    expect(weekToSend(new Date("2026-11-15T20:00:00.000Z"))).toBe("2026-11-02"); // dimanche 15
  });

  const week = weekGroups({ monday: "2026-11-02", sessions, results, members })!;
  const pass = async (now: string, stored: GroupsState | null, ok = true, summary: WeekGroups | null = week) => {
    const sent: string[] = [];
    const out = await groupsPass({ stored, gazetteLastSent: "2026-11-09", now: new Date(now), ready: () => null, summary: () => summary, send: async (w) => (sent.push(w.monday), ok), log: () => {} });
    return { ...out, sent };
  };

  it("part le mardi à partir de 14 h, une seule fois par semaine", async () => {
    expect((await pass("2026-11-10T12:00:00.000Z", null)).sent).toEqual([]); // 13 h à Paris
    const first = await pass("2026-11-10T13:10:00.000Z", null);
    expect(first.sent).toEqual(["2026-11-02"]);
    expect(first.state).toEqual({ lastWeek: "2026-11-02", lastSentOn: "2026-11-10" });
    expect((await pass("2026-11-11T13:10:00.000Z", first.state)).sent).toEqual([]);
  });

  it("rattrape un mardi manqué, jamais la nuit", async () => {
    expect((await pass("2026-11-12T22:30:00.000Z", null)).sent).toEqual([]); // 23 h 30 à Paris
    expect((await pass("2026-11-13T09:00:00.000Z", null)).sent).toEqual([]); // vendredi 10 h : avant 14 h
    expect((await pass("2026-11-13T13:30:00.000Z", null)).sent).toEqual(["2026-11-02"]);
  });

  it("réessaie après un échec, et note une semaine sans partie sans rien envoyer", async () => {
    const failed = await pass("2026-11-10T13:10:00.000Z", null, false);
    expect(failed).toMatchObject({ failed: true, state: null });
    const empty = await pass("2026-11-10T13:10:00.000Z", null, true, null);
    expect(empty.sent).toEqual([]);
    expect(empty.state).toEqual({ lastWeek: "2026-11-02", lastSentOn: null });
  });

  it("attend la première gazette du salon", async () => {
    const out = await groupsPass({ stored: null, gazetteLastSent: null, now: new Date("2026-11-10T13:10:00.000Z"), ready: () => null, summary: () => week, send: async () => true, log: () => {} });
    expect(out.state).toBeNull();
  });

  it("prévient dans l'Action quand la semaine attend encore le week-end", async () => {
    const lines: string[] = [];
    await groupsPass({ stored: null, gazetteLastSent: "2026-11-09", now: new Date("2026-11-14T13:10:00.000Z"), ready: () => "1 liste de parties pas encore relue", summary: () => week, send: async () => true, log: (l) => lines.push(l) });
    expect(lines[0]).toMatch(/^::warning::Jouer ensemble/);
    const weekday: string[] = [];
    await groupsPass({ stored: null, gazetteLastSent: "2026-11-09", now: new Date("2026-11-10T13:10:00.000Z"), ready: () => "1 liste de parties pas encore relue", summary: () => week, send: async () => true, log: (l) => weekday.push(l) });
    expect(weekday[0]).not.toMatch(/::warning::/);
  });

  it("attend des données complètes, sans rien noter", async () => {
    const sent: string[] = [];
    const out = await groupsPass({ stored: null, gazetteLastSent: "2026-11-09", now: new Date("2026-11-10T13:10:00.000Z"), ready: () => "2 listes de parties pas encore relues", summary: () => week, send: async (w) => (sent.push(w.monday), true), log: () => {} });
    expect(sent).toEqual([]);
    expect(out.state).toBeNull();
  });
});

describe("des données complètes", () => {
  const upToDate: StoredMemberResults = {
    aaa: { ...results["aaa"]!, seen: 15 },
    bbb: { ...results["bbb"]!, seen: 15 },
    ccc: { ...results["ccc"]!, seen: 15 },
  };
  const read = { ...members, fetchedAt: "2026-11-09T06:00:00.000Z" };

  it("demande la collecte finie le dimanche, la liste relue depuis, et chaque liste de parties à jour", () => {
    expect(weekReady({ monday: "2026-11-02", completeThrough: "2026-11-08", members: read, results: upToDate })).toBeNull();
    expect(weekReady({ monday: "2026-11-02", completeThrough: "2026-11-07", members: read, results: upToDate })).toContain("dimanche");
    expect(weekReady({ monday: "2026-11-02", completeThrough: null, members: read, results: upToDate })).toContain("dimanche");
    // Relue le dimanche 8 à 23 h à Paris : avant la fin de la semaine.
    expect(weekReady({ monday: "2026-11-02", completeThrough: "2026-11-08", members: { ...read, fetchedAt: "2026-11-08T22:00:00.000Z" }, results: upToDate })).toContain("liste des membres");
    expect(weekReady({ monday: "2026-11-02", completeThrough: "2026-11-08", members: read, results: { ...upToDate, bbb: { ...upToDate["bbb"]!, seen: 14 } } })).toBe("1 liste de parties pas encore relue");
  });

  it("ne part jamais sans les listes de parties", () => {
    expect(weekReady({ monday: "2026-11-02", completeThrough: "2026-11-08", members: read, results: {} })).toBe("3 listes de parties pas encore relues");
  });
});
