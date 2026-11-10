import { describe, expect, it } from "vitest";
import { forgetInMemberResults, playerPodiums, podiumDates, teamRowsOf } from "../../src/lib/podiums";
import type { ApiPlayerSession, StoredMember, StoredMemberResults, StoredMembers, StoredSession } from "../../src/lib/schemas";

const member = (publicId: string | null, username: string | null, games = 15): StoredMember => ({ role: "member", joinedAt: "2026-05-01T10:00:00.000Z", publicId, username, team: { wins: games, losses: 0 } });
const list = (...members: StoredMember[]): StoredMembers => ({ fetchedAt: "2026-11-09T10:00:00.000Z", total: members.length, members });
const roster = list(member("a", "Alpha"), member("b", "Beta"), member("c", "Gamma"), member("d", "Delta"), member("e", "Epsilon"), member("f", "Zeta"), member(null, null));
const covered = "2026-11-30T00:00:00.000Z";

const at = (day: number, hour: number, minute = 0) => `2026-11-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
/** Une partie du clan, avec sa session. */
const session = (gameId: string, gameStart: string, over: Partial<StoredSession> = {}): StoredSession => ({
  gameId,
  clanPlayerCount: 2,
  hasWon: true,
  numTeams: 2,
  playerTeams: "2",
  totalPlayerCount: 20,
  gameStart,
  score: 1,
  ...over,
});
/** Les parties g0, g1, … du 2 novembre, une par heure à partir de 8 h UTC. */
const day2 = (count: number) => Array.from({ length: count }, (_, i) => session(`g${i}`, at(2, 8 + i)));
/** `pattern` : une lettre par partie, V victoire, D défaite, « . » pas jouée. */
const played = (pattern: string, sessions: readonly StoredSession[] = day2(pattern.length)): StoredMemberResults[string]["games"] =>
  [...pattern].flatMap((c, i): [string, string, 0 | 1][] => (c === "." ? [] : [[sessions[i]!.gameId, sessions[i]!.gameStart, c === "V" ? 1 : 0]])).reverse();
const entry = (games: StoredMemberResults[string]["games"], older: string | null = null) => ({ seen: 15, readAt: covered, older, games });

describe("teamRowsOf", () => {
  const row = (over: Partial<ApiPlayerSession> = {}): ApiPlayerSession => ({ gameId: "g", gameStart: "2026-11-02T10:00:00.000Z", gameType: "Public", gameMode: "Team", gameRankedType: "unranked", clanTag: "GAL", hasWon: true, ...over });

  it("ne garde que les parties publiques en équipe, hors classé, avec le tag, et leur résultat", () => {
    const rows = [
      row({ gameId: "ok" }),
      row({ gameId: "perdue", hasWon: false }),
      row({ gameId: "ffa", gameMode: "Free For All" }),
      row({ gameId: "privee", gameType: "Private" }),
      row({ gameId: "seul", gameType: "Singleplayer" }),
      row({ gameId: "classee", gameRankedType: "2v2" }),
      row({ gameId: "autre-tag", clanTag: "BSS" }),
      row({ gameId: "sans-tag", clanTag: null }),
      row({ gameId: "sans-resultat", hasWon: null }),
      row({ gameId: "rang-absent", gameRankedType: undefined }),
      row({ gameId: "avant", gameStart: "2026-04-09T23:00:00.000Z" }),
    ];
    expect(teamRowsOf(rows, "GAL", "2026-04-10")).toEqual([
      ["ok", "2026-11-02T10:00:00.000Z", 1],
      ["perdue", "2026-11-02T10:00:00.000Z", 0],
      ["rang-absent", "2026-11-02T10:00:00.000Z", 1],
    ]);
  });
});

describe("forgetInMemberResults", () => {
  it("oublie un membre parti, et ne change rien quand tous sont encore là", () => {
    const state: StoredMemberResults = { a: entry([]), b: entry([]) };
    expect(forgetInMemberResults(state, new Set(["b"]))).toEqual({ b: entry([]) });
    expect(forgetInMemberResults(state, new Set(["a", "b"]))).toBe(state);
  });
});

describe("playerPodiums", () => {
  it("trouve la plus longue série de chaque joueur, avec ses jours, une défaite la coupant", () => {
    const sessions = day2(7);
    const out = playerPodiums({ a: entry(played("VVDVVVD")) }, sessions, roster, covered);
    expect(out.streaks).toEqual([{ place: 1, id: "a", username: "Alpha", value: 3, from: "2026-11-02", to: "2026-11-02" }]);
    expect(out.days).toEqual([{ place: 1, id: "a", username: "Alpha", value: 5, from: "2026-11-02", to: "2026-11-02" }]);
    expect(out.since).toBe("2026-11-02");
    expect(playerPodiums({ a: entry(played("VVDVVVD")) }, sessions, list(member("a", "Alpha")), covered).pending).toBe(0);
  });

  it("ne coupe pas une série pour une partie du clan où le joueur n'a pas joué", () => {
    const sessions = day2(5);
    expect(playerPodiums({ a: entry(played("VV.VV")) }, sessions, roster, covered).streaks[0]?.value).toBe(4);
  });

  it("coupe une série à une défaite sans session du clan, comme une partie quittée avant d'apparaître sur la carte", () => {
    const sessions = day2(4);
    const games: StoredMemberResults[string]["games"] = [[sessions[3]!.gameId, sessions[3]!.gameStart, 1], ["cachee", at(2, 10, 30), 0], ...played("VV..", sessions)];
    const out = playerPodiums({ a: entry(games) }, sessions, roster, covered);
    expect(out.streaks[0]?.value).toBe(2);
    expect(out.days[0]?.value).toBe(3);
  });

  it("ne compte pas une victoire sans session du clan : ce n'est pas une partie de stats.team", () => {
    const sessions = day2(2);
    const games: StoredMemberResults[string]["games"] = [[sessions[1]!.gameId, sessions[1]!.gameStart, 1], ["nations", at(2, 8, 30), 1], [sessions[0]!.gameId, sessions[0]!.gameStart, 1]];
    const out = playerPodiums({ a: entry(games) }, sessions, roster, covered);
    expect(out.streaks[0]?.value).toBe(2);
    expect(out.days[0]?.value).toBe(2);
  });

  it("ne compte pas une victoire seul contre des robots, sans couper la série, mais une défaite y coupe la série", () => {
    const sessions = [...day2(2), session("solo", at(2, 10), { totalPlayerCount: 1 }), session("g3", at(2, 11))];
    const won = playerPodiums({ a: entry(played("VVVV", sessions)) }, sessions, roster, covered);
    expect(won.streaks[0]?.value).toBe(3);
    expect(won.days[0]?.value).toBe(3);
    // Un Gaulois jamais apparu sur la carte, dans une partie qu'un autre Gaulois a jouée seul : la défaite compte dans stats.team.
    expect(playerPodiums({ a: entry(played("VVDV", sessions)) }, sessions, roster, covered).streaks[0]?.value).toBe(2);
  });

  it("attend, pour une partie plus récente que les sessions relevées, le passage suivant", () => {
    const sessions = day2(4);
    const out = playerPodiums({ a: entry(played("VVDV")) }, sessions, roster, at(2, 9, 30));
    expect(out.streaks[0]?.value).toBe(2);
    expect(out.days[0]?.value).toBe(2);
  });

  it("compte la journée de Paris d'après l'heure de début : 23 h 30 UTC, c'est déjà le lendemain", () => {
    const sessions = [session("g0", at(2, 22)), session("g1", at(2, 23, 30)), session("g2", at(3, 9))];
    const out = playerPodiums({ a: entry(played("VVV", sessions)) }, sessions, roster, covered);
    expect(out.days[0]).toMatchObject({ value: 2, from: "2026-11-03" });
    expect(out.streaks[0]).toMatchObject({ value: 3, from: "2026-11-02", to: "2026-11-03" });
  });

  it("garde de chaque joueur sa meilleure journée, la première en cas d'égalité", () => {
    const sessions = [session("g0", at(2, 8)), session("g1", at(2, 9)), session("g2", at(4, 8)), session("g3", at(4, 9))];
    expect(playerPodiums({ a: entry(played("VVVV", sessions)) }, sessions, roster, covered).days[0]).toMatchObject({ value: 2, from: "2026-11-02" });
  });

  it("classe du plus grand au plus petit, le premier à atteindre le chiffre devant, et partage la place d'une même partie", () => {
    const sessions = day2(6);
    const out = playerPodiums({ a: entry(played("VVV...")), b: entry(played("...VVV")), c: entry(played("VVV...")), d: entry(played("VVVVV.")) }, sessions, roster, covered);
    expect(out.streaks.map((p) => [p.place, p.username, p.value])).toEqual([
      [1, "Delta", 5],
      [2, "Alpha", 3],
      [2, "Gamma", 3],
      [4, "Beta", 3],
    ]);
  });

  it("s'arrête à la dernière place et cite tous ceux qui la partagent", () => {
    const sessions = day2(6);
    const results = { a: entry(played("VVVVVV")), b: entry(played("VVVVV.")), c: entry(played("VVVV..")), d: entry(played("VVV...")), e: entry(played("VV....")), f: entry(played("VV....")) };
    expect(playerPodiums(results, sessions, roster, covered, 4).streaks.map((p) => p.username)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(playerPodiums({ e: results.e, f: results.f }, sessions, roster, covered, 1).streaks).toHaveLength(2);
  });

  it("ne fait pas une série d'une victoire isolée, mais la compte dans la journée", () => {
    const out = playerPodiums({ a: entry(played("VDV")) }, day2(3), roster, covered);
    expect(out.streaks).toEqual([]);
    expect(out.days[0]?.value).toBe(2);
  });

  it("ne nomme que les membres avec pseudo encore dans la liste, avec leur pseudo du moment", () => {
    const sessions = day2(2);
    const results = { a: entry(played("VV")), parti: entry(played("VV")) };
    expect(playerPodiums(results, sessions, list(member("a", "Nouveau nom"), member("parti", null)), covered).streaks.map((p) => p.username)).toEqual(["Nouveau nom"]);
    expect(playerPodiums(results, sessions, null, covered).streaks).toEqual([]);
  });

  it("ne compte une partie qu'une fois, même écrite deux fois", () => {
    const sessions = day2(2);
    const out = playerPodiums({ a: entry([...played("VV"), [sessions[1]!.gameId, sessions[1]!.gameStart, 1]]) }, sessions, roster, covered);
    expect(out.streaks[0]?.value).toBe(2);
    expect(out.days[0]?.value).toBe(2);
  });

  it("compte les joueurs dont l'historique se lit encore, jamais lus compris", () => {
    const sessions = day2(2);
    const out = playerPodiums({ a: entry(played("VV"), "curseur"), b: entry(played("VV")) }, sessions, roster, covered);
    // a remonte encore le temps ; c, d, e et f n'ont pas encore été lus ; b est complet.
    expect(out.pending).toBe(5);
    expect(out.streaks).toHaveLength(2);
  });

  it("écrit les jours d'une série ou d'une journée, l'année une seule fois quand elle ne change pas", () => {
    expect(podiumDates({ from: "2026-11-02", to: "2026-11-02" })).toBe("le 2 nov. 2026");
    expect(podiumDates({ from: "2026-10-03", to: "2026-10-04" })).toBe("du 3 au 4 oct. 2026");
    expect(podiumDates({ from: "2026-10-30", to: "2026-11-02" })).toBe("du 30 oct. au 2 nov. 2026");
    expect(podiumDates({ from: "2026-12-31", to: "2027-01-01" })).toBe("du 31 déc. 2026 au 1 janv. 2027");
  });

  it("ne renvoie rien tant qu'aucun joueur n'est lu, ou sans sessions : pas de données n'est pas zéro", () => {
    expect(playerPodiums({}, day2(2), roster, covered)).toEqual({ streaks: [], days: [], since: null, pending: 6 });
    expect(playerPodiums({ a: entry(played("VV")) }, [], roster, covered).since).toBeNull();
    expect(playerPodiums({ a: entry(played("VV")) }, day2(2), roster, null).since).toBeNull();
  });
});
