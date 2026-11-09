import { describe, expect, it } from "vitest";
import type { StoredMember, StoredMembers, StoredMemberWeeks } from "../../src/lib/schemas";
import { isFirstOfMonday, parisStartOf } from "../../src/lib/time";
import {
  EMPTY_MEMBER_WEEKS,
  forgetInMemberWeeks,
  milestonesSinceMonday,
  namedGames,
  namedWeekActive,
  namedWeekMilestones,
  namedWeekPlayers,
  namedWins,
  nextMemberWeeks,
  weekActive,
  weekMilestones,
  weekWinners,
} from "../../src/lib/week-players";

const member = (id: string | null, username: string | null, wins: number | null): StoredMember => ({
  role: "member",
  joinedAt: "2026-05-03T21:26:21.579Z",
  publicId: id,
  username,
  team: wins === null ? null : { wins, losses: 1 },
});
const list = (fetchedAt: string, members: StoredMember[]): StoredMembers => ({ fetchedAt, total: members.length, members });
/** Un membre avec ses défaites : ses parties sont les deux réunies. */
const played = (id: string, username: string, wins: number, losses: number): StoredMember => ({ ...member(id, username, wins), team: { wins, losses } });
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

describe("namedGames", () => {
  it("compte les victoires et les défaites, jamais un anonyme ni un membre sans stats", () => {
    expect(namedGames(list(MONDAY_9, [played("a", "Alpha", 4, 6), member("SECRET", null, 9), member(null, null, 9), member("b", "Beta", null)]))).toEqual({ a: 10 });
  });
});

describe("weekActive", () => {
  it("range ceux qui ont le plus joué, avec les mêmes règles que le podium des victoires", () => {
    expect(weekActive({ a: 100, b: 50, c: 10, d: 0 }, { a: 110, b: 90, c: 30, d: 5 })).toEqual([
      { id: "b", games: 40 },
      { id: "c", games: 20 },
      { id: "a", games: 10 },
    ]);
    // Ni un membre sans relevé de départ, ni une absence de partie, ni une baisse.
    expect(weekActive({ a: 10, b: 10, c: 10 }, { a: 10, b: 8, c: 12, nouveau: 500 })).toEqual([{ id: "c", games: 2 }]);
    // Une égalité sur la dernière marche garde tout le monde, sauf si elle ferait trop de lignes.
    expect(weekActive({ a: 0, b: 0, c: 0, d: 0 }, { a: 9, b: 7, c: 5, d: 5 }).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(weekActive({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, { a: 9, b: 2, c: 2, d: 2, e: 2, f: 2 }).map((r) => r.id)).toEqual(["a"]);
    expect(weekActive({}, {})).toEqual([]);
  });
});

describe("weekMilestones", () => {
  it("note le plus haut palier franchi entre deux relevés, du plus haut au plus bas", () => {
    expect(weekMilestones({ a: 95, b: 240, c: 480, d: 99 }, { a: 101, b: 260, c: 1004, d: 99 })).toEqual([
      { id: "c", tier: 1000 },
      { id: "b", tier: 250 },
      { id: "a", tier: 100 },
    ]);
  });

  it("ne cite ni un palier sous 100, ni un membre sans relevé de départ, ni un recul", () => {
    // 10 et 50 sont des paliers du site, pas des paliers annoncés : ils tombent presque chaque jour.
    expect(weekMilestones({ a: 8, b: 45 }, { a: 12, b: 60 })).toEqual([]);
    expect(weekMilestones({}, { nouveau: 700 })).toEqual([]);
    expect(weekMilestones({ a: 510 }, { a: 495 })).toEqual([]);
    expect(weekMilestones({ a: 510 }, { a: 520 })).toEqual([]);
  });
});

describe("nextMemberWeeks", () => {
  const first = nextMemberWeeks(EMPTY_MEMBER_WEEKS, list(MONDAY_9, [member("a", "Alpha", 10), member("b", "Beta", 20)]));

  it("prend le premier relevé d'un lundi à Paris comme repère", () => {
    // Les parties jouées sont gardées avec les victoires : ici, une défaite chacun.
    expect(first).toEqual({ reading: { on: "2026-11-09", at: MONDAY_9, wins: { a: 10, b: 20 }, games: { a: 11, b: 21 } }, tops: {} });
  });

  it("ne fait rien un autre jour, et le rend sans le recopier", () => {
    expect(nextMemberWeeks(first, list("2026-11-10T10:00:00.000Z", [member("a", "Alpha", 99)]))).toBe(first);
    // Dimanche 23 h à Paris, ce n'est pas encore lundi.
    expect(nextMemberWeeks(EMPTY_MEMBER_WEEKS, list("2026-11-08T22:00:00.000Z", [member("a", "Alpha", 1)]))).toBe(EMPTY_MEMBER_WEEKS);
  });

  it("ne remplace pas le repère par une relecture du même lundi", () => {
    expect(nextMemberWeeks(first, list("2026-11-09T20:00:00.000Z", [member("a", "Alpha", 99)]))).toBe(first);
  });

  it("arrête les joueurs de la semaine sous son lundi, avec l'heure du départ, et prend le nouveau repère", () => {
    const next = nextMemberWeeks(first, list(MONDAY_16, [member("a", "Alpha", 25), member("b", "Beta", 22)]));
    expect(next.tops).toEqual({
      "2026-11-09": {
        since: MONDAY_9,
        players: [
          { id: "a", wins: 15 },
          { id: "b", wins: 2 },
        ],
        active: [
          { id: "a", games: 15 },
          { id: "b", games: 2 },
        ],
        milestones: [],
      },
    });
    expect(next.reading).toEqual({ on: "2026-11-16", at: MONDAY_16, wins: { a: 25, b: 22 }, games: { a: 26, b: 23 } });
  });

  it("note ceux qui ont le plus joué et les paliers franchis, sur la même période que le podium", () => {
    const start = nextMemberWeeks(EMPTY_MEMBER_WEEKS, list(MONDAY_9, [played("a", "Alpha", 95, 100), played("b", "Beta", 20, 5), played("c", "Gamma", 498, 300)]));
    const next = nextMemberWeeks(start, list(MONDAY_16, [played("a", "Alpha", 102, 140), played("b", "Beta", 30, 6), played("c", "Gamma", 503, 301)]));
    // Alpha a peu gagné mais beaucoup joué : les deux listes ne disent pas la même chose.
    expect(next.tops["2026-11-09"]).toEqual({
      since: MONDAY_9,
      players: [
        { id: "b", wins: 10 },
        { id: "a", wins: 7 },
        { id: "c", wins: 5 },
      ],
      active: [
        { id: "a", games: 47 },
        { id: "b", games: 11 },
        { id: "c", games: 6 },
      ],
      milestones: [
        { id: "c", tier: 500 },
        { id: "a", tier: 100 },
      ],
    });
  });

  it("sans les parties au départ, n'invente pas ceux qui ont le plus joué", () => {
    // Un repère gardé avant le 9 novembre 2026 : des victoires, pas de parties.
    const old = { reading: { on: "2026-11-09", at: MONDAY_9, wins: { a: 10, b: 20 } }, tops: {} };
    const monday = list(MONDAY_16, [played("a", "Alpha", 25, 9), played("b", "Beta", 22, 3)]);
    const top = nextMemberWeeks(old, monday).tops["2026-11-09"];
    expect(top?.players).toEqual([{ id: "a", wins: 15 }, { id: "b", wins: 2 }]);
    expect(top && "active" in top).toBe(false);
    expect(top?.milestones).toEqual([]);
    // Le même relevé retrouvé dans l'historique, à la même heure, donne les parties : la période reste la même.
    const same = list(MONDAY_9, [played("a", "Alpha", 10, 4), played("b", "Beta", 20, 3)]);
    expect(nextMemberWeeks(old, monday, same).tops["2026-11-09"]?.active).toEqual([{ id: "a", games: 20 }, { id: "b", games: 2 }]);
    // L'historique n'a pas connu les oublis faits depuis : un membre retiré du repère en cours de semaine n'y revient pas par les parties.
    const withForgotten = list(MONDAY_9, [played("a", "Alpha", 10, 4), played("b", "Beta", 20, 3), played("oublie", "Oublié", 5, 5)]);
    const back = list(MONDAY_16, [played("a", "Alpha", 25, 9), played("b", "Beta", 22, 3), played("oublie", "Oublié", 90, 90)]);
    const afterForget = nextMemberWeeks(old, back, withForgotten).tops["2026-11-09"];
    expect(JSON.stringify(afterForget)).not.toContain("oublie");
    expect(afterForget?.active).toEqual([{ id: "a", games: 20 }, { id: "b", games: 2 }]);
    // Un autre relevé de la semaine ne couvre pas la même période : il ne sert pas.
    const other = list("2026-11-10T23:53:00.000Z", [played("a", "Alpha", 12, 4), played("b", "Beta", 20, 3)]);
    const mixed = nextMemberWeeks(old, monday, other).tops["2026-11-09"];
    expect(mixed && "active" in mixed).toBe(false);
  });

  it("n'annonce pas une semaine trop longue : le relevé d'arrivée fait tard le lundi ne vaut pas une semaine", () => {
    const late = nextMemberWeeks(first, list("2026-11-16T20:00:00.000Z", [member("a", "Alpha", 40)]));
    expect(late.tops).toEqual({});
    expect(late.reading?.on).toBe("2026-11-16");
  });

  it("ne rattrape pas une semaine trop longue par l'historique, qui garde aussi le repère du lundi d'avant", () => {
    // Le repère du 9 existe, sans les parties : l'historique est relu et rend ce même relevé. Arrivé à 10 h le lundi 16, il ferait 7 jours et 9 heures.
    const old = { reading: { on: "2026-11-09", at: MONDAY_9, wins: { a: 10 } }, tops: {} };
    const sameReading = list(MONDAY_9, [played("a", "Alpha", 10, 4)]);
    const late = nextMemberWeeks(old, list("2026-11-16T09:00:00.000Z", [member("a", "Alpha", 40)]), sameReading);
    expect(late.tops).toEqual({});
    expect(late.reading?.on).toBe("2026-11-16");
  });

  it("tolère un passage retardé de quelques heures", () => {
    const delayed = nextMemberWeeks(first, list("2026-11-16T03:53:00.000Z", [member("a", "Alpha", 40), member("b", "Beta", 20)]));
    expect(delayed.tops["2026-11-09"]?.players).toEqual([{ id: "a", wins: 30 }]);
  });

  it("tolère le changement d'heure, qui donne à la semaine une heure de plus ou de moins", () => {
    // Le 26 octobre 2026 à 0 h 53 à Paris, puis la semaine d'avant, où Paris était à l'heure d'été.
    const summer = nextMemberWeeks(EMPTY_MEMBER_WEEKS, list("2026-10-18T22:53:00.000Z", [member("a", "Alpha", 1)]));
    expect(summer.reading?.on).toBe("2026-10-19");
    const winter = nextMemberWeeks(summer, list("2026-10-25T23:53:00.000Z", [member("a", "Alpha", 6)]));
    expect(winter.tops["2026-10-19"]?.players).toEqual([{ id: "a", wins: 5 }]);
  });

  it("n'annonce aucune semaine si un lundi a manqué : deux semaines ne valent pas une", () => {
    const next = nextMemberWeeks(first, list(MONDAY_23, [member("a", "Alpha", 99)]));
    expect(next.tops).toEqual({});
    expect(next.reading?.on).toBe("2026-11-23");
  });
});

describe("nextMemberWeeks, sans relevé du lundi d'avant", () => {
  const monday = list(MONDAY_9, [member("a", "Alpha", 40), member("b", "Beta", 30), member("nouveau", "Neuf", 99)]);
  // Jeudi 5 novembre, 11 h 39 à Paris : le premier relevé gardé dans l'historique cette semaine-là.
  const thursday = list("2026-11-05T10:39:31.574Z", [member("a", "Alpha", 10), member("b", "Beta", 25)]);

  it("part du plus ancien relevé de la semaine, et garde son heure pour écrire la période", () => {
    expect(nextMemberWeeks(EMPTY_MEMBER_WEEKS, monday, thursday).tops).toEqual({
      "2026-11-02": {
        since: "2026-11-05T10:39:31.574Z",
        players: [
          { id: "a", wins: 30 },
          { id: "b", wins: 5 },
        ],
        active: [
          { id: "a", games: 30 },
          { id: "b", games: 5 },
        ],
        milestones: [],
      },
    });
  });

  it("préfère le relevé du lundi d'avant quand il existe", () => {
    const weeks = nextMemberWeeks(EMPTY_MEMBER_WEEKS, list("2026-11-01T23:53:00.000Z", [member("a", "Alpha", 1)]));
    expect(nextMemberWeeks(weeks, monday, thursday).tops["2026-11-02"]?.since).toBe("2026-11-01T23:53:00.000Z");
  });

  it("refuse un départ trop proche : moins de deux jours ne disent presque rien de la semaine", () => {
    const sunday = list("2026-11-08T01:53:00.000Z", [member("a", "Alpha", 39)]);
    expect(nextMemberWeeks(EMPTY_MEMBER_WEEKS, monday, sunday).tops).toEqual({});
  });

  it("refuse un départ pris hors de cette semaine-là", () => {
    const before = list("2026-10-31T10:00:00.000Z", [member("a", "Alpha", 1)]);
    expect(nextMemberWeeks(EMPTY_MEMBER_WEEKS, monday, before).tops).toEqual({});
  });

  it("après une panne, un départ arrivé plus tard le même lundi sert encore, avec le premier relevé du lundi", () => {
    const afterFailure = nextMemberWeeks(EMPTY_MEMBER_WEEKS, monday, null);
    const relisted = list("2026-11-09T19:53:00.000Z", [member("a", "Alpha", 99), member("b", "Beta", 99)]);
    const retried = nextMemberWeeks(afterFailure, relisted, thursday);
    expect(retried.tops["2026-11-02"]?.players).toEqual([{ id: "a", wins: 30 }, { id: "b", wins: 5 }]);
    expect(retried.reading).toBe(afterFailure.reading);
    // Une fois le podium arrêté, rien ne le refait.
    expect(nextMemberWeeks(retried, relisted, thursday)).toBe(retried);
  });

  it("garde quand même le nouveau repère du lundi", () => {
    expect(nextMemberWeeks(EMPTY_MEMBER_WEEKS, monday, null).reading?.on).toBe("2026-11-09");
  });
});

describe("forgetInMemberWeeks", () => {
  const weeks: StoredMemberWeeks = {
    reading: { on: "2026-11-16", at: MONDAY_16, wins: { a: 1, parti: 2 } },
    tops: { "2026-11-09": { since: MONDAY_9, players: [{ id: "parti", wins: 9 }, { id: "a", wins: 3 }] } },
  };
  const full: StoredMemberWeeks = {
    reading: { on: "2026-11-16", at: MONDAY_16, wins: { a: 1 }, games: { a: 4, parti: 9 } },
    tops: { "2026-11-09": { since: MONDAY_9, players: [{ id: "a", wins: 3 }], active: [{ id: "parti", games: 40 }, { id: "a", games: 8 }], milestones: [{ id: "parti", tier: 500 }, { id: "a", tier: 100 }] } },
  };

  it("retire aussi un membre parti des parties jouées et des paliers franchis", () => {
    const kept = forgetInMemberWeeks(full, new Set(["a"]));
    expect(JSON.stringify(kept)).not.toContain("parti");
    expect(kept.reading?.games).toEqual({ a: 4 });
    expect(kept.tops["2026-11-09"]).toEqual({ since: MONDAY_9, players: [{ id: "a", wins: 3 }], active: [{ id: "a", games: 8 }], milestones: [{ id: "a", tier: 100 }] });
    expect(forgetInMemberWeeks(full, new Set(["a", "parti"]))).toBe(full);
  });

  it("retire un membre parti partout", () => {
    const kept = forgetInMemberWeeks(weeks, new Set(["a"]));
    expect(JSON.stringify(kept)).not.toContain("parti");
    expect(kept.tops["2026-11-09"]).toEqual({ since: MONDAY_9, players: [{ id: "a", wins: 3 }] });
    expect(kept.reading?.wins).toEqual({ a: 1 });
  });

  it("rend le même objet s'il n'y a rien à oublier", () => {
    expect(forgetInMemberWeeks(weeks, new Set(["a", "parti"]))).toBe(weeks);
    expect(forgetInMemberWeeks(EMPTY_MEMBER_WEEKS, new Set())).toBe(EMPTY_MEMBER_WEEKS);
  });
});

describe("namedWeekPlayers", () => {
  const members = list(MONDAY_16, [member("a", "Alpha", 1), member("b", "Beta", 1), member("c", "Gamma", 1)]);
  const top = (players: { id: string; wins: number }[]) => ({ since: MONDAY_9, players });

  it("donne le pseudo et la place, deux joueurs à égalité partageant la même", () => {
    const players = namedWeekPlayers(top([{ id: "a", wins: 9 }, { id: "b", wins: 9 }, { id: "c", wins: 4 }]), members);
    expect(players?.map((p) => [p.username, p.wins, p.place])).toEqual([["Alpha", 9, 1], ["Beta", 9, 1], ["Gamma", 4, 3]]);
  });

  it("ne cite plus celui qui a quitté le clan ou retiré son pseudo", () => {
    const players = namedWeekPlayers(top([{ id: "parti", wins: 30 }, { id: "a", wins: 9 }]), members);
    expect(players?.map((p) => [p.username, p.place])).toEqual([["Alpha", 1]]);
  });

  it("n'écrit pas un zéro sans relevé : c'est `null`", () => {
    expect(namedWeekPlayers(undefined, members)).toBeNull();
    expect(namedWeekPlayers(top([{ id: "a", wins: 9 }]), null)).toBeNull();
    expect(namedWeekPlayers(top([]), members)).toBeNull();
    expect(namedWeekPlayers(top([{ id: "parti", wins: 9 }]), members)).toBeNull();
  });
});

describe("namedWeekActive et namedWeekMilestones", () => {
  const members = list(MONDAY_16, [member("a", "Alpha", 1), member("b", "Beta", 1), member("c", "Zoé", 1), member("sans", null, 1)]);
  const top = { since: MONDAY_9, players: [], active: [{ id: "a", games: 40 }, { id: "b", games: 12 }, { id: "c", games: 12 }, { id: "parti", games: 9 }], milestones: [{ id: "c", tier: 500 }, { id: "b", tier: 500 }, { id: "a", tier: 100 }, { id: "parti", tier: 250 }] };

  it("donnent le pseudo du moment, et ne citent plus celui qui a quitté le clan", () => {
    expect(namedWeekActive(top, members)).toEqual([
      { id: "a", games: 40, username: "Alpha", place: 1 },
      { id: "b", games: 12, username: "Beta", place: 2 },
      { id: "c", games: 12, username: "Zoé", place: 2 },
    ]);
    // À l'intérieur d'un palier, l'ordre alphabétique : personne n'est devant personne.
    expect(namedWeekMilestones(top, members)).toEqual([
      { id: "b", tier: 500, username: "Beta" },
      { id: "c", tier: 500, username: "Zoé" },
      { id: "a", tier: 100, username: "Alpha" },
    ]);
  });

  it("distinguent « pas relevé » de « aucun »", () => {
    const old = { since: MONDAY_9, players: [{ id: "a", wins: 3 }] };
    expect(namedWeekActive(old, members)).toBeNull();
    expect(namedWeekMilestones(old, members)).toBeNull();
    expect(namedWeekMilestones({ ...old, milestones: [] }, members)).toEqual([]);
    expect(namedWeekActive({ ...old, active: [] }, members)).toBeNull();
    expect(namedWeekActive(top, null)).toBeNull();
    expect(namedWeekMilestones(undefined, members)).toBeNull();
  });
});

describe("milestonesSinceMonday", () => {
  const reading = { on: "2026-11-09", at: MONDAY_9, wins: { a: 95, b: 240, c: 30 } };

  it("donne les paliers franchis depuis le relevé du lundi, avec la période", () => {
    const now = list("2026-11-11T23:53:00.000Z", [member("a", "Alpha", 104), member("b", "Beta", 249), member("c", "Gamma", 60), member("nouveau", "Neuf", 900)]);
    expect(milestonesSinceMonday(reading, now)).toEqual({ since: MONDAY_9, until: "2026-11-11T23:53:00.000Z", players: [{ id: "a", tier: 100, username: "Alpha" }] });
  });

  it("dit « aucun pour l'instant » par une liste vide, le lundi même", () => {
    expect(milestonesSinceMonday(reading, list(MONDAY_9, [member("a", "Alpha", 95)]))).toEqual({ since: MONDAY_9, until: MONDAY_9, players: [] });
  });

  it("ne dit rien si le relevé n'est pas celui du lundi de cette semaine", () => {
    // La liste date de la semaine suivante : le relevé du lundi 16 a manqué.
    expect(milestonesSinceMonday(reading, list("2026-11-17T10:00:00.000Z", [member("a", "Alpha", 300)]))).toBeNull();
    // Une liste plus ancienne que le relevé.
    expect(milestonesSinceMonday(reading, list("2026-11-08T10:00:00.000Z", [member("a", "Alpha", 300)]))).toBeNull();
    expect(milestonesSinceMonday(null, list(MONDAY_9, []))).toBeNull();
    expect(milestonesSinceMonday(reading, null)).toBeNull();
  });
});

describe("parisStartOf", () => {
  it("donne minuit à Paris en temps universel, en hiver comme en été", () => {
    expect(parisStartOf("2026-11-09")).toBe("2026-11-08T23:00:00.000Z");
    expect(parisStartOf("2026-07-14")).toBe("2026-07-13T22:00:00.000Z");
  });

  it("garde minuit les jours de changement d'heure, qui a lieu la nuit", () => {
    expect(parisStartOf("2026-10-25")).toBe("2026-10-24T22:00:00.000Z");
    expect(parisStartOf("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
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
