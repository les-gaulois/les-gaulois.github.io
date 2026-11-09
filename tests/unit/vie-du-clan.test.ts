import { describe, expect, it } from "vitest";
import { fmtInt } from "../../src/lib/format";
import type { ClanRecords } from "../../src/lib/results";
import { currentMilestonesPeriod, endSentence, homeMilestones, milestoneGroups, NAMES_SHOWN, recentRecordLines, recentTerritoryRecord, restAfter } from "../../src/lib/vie-du-clan";

const crossed = [
  { id: "c", tier: 500, username: "Zoé" },
  { id: "b", tier: 500, username: "Beta" },
  { id: "a", tier: 100, username: "Alpha" },
  { id: "d", tier: 1000, username: "Delta" },
];

describe("les paliers franchis du fil du clan", () => {
  it("se regroupent par palier, du plus haut au plus bas, sans mettre personne devant dans un palier", () => {
    expect(milestoneGroups(crossed)).toEqual([
      { tier: 1000, players: [{ id: "d", username: "Delta" }] },
      { tier: 500, players: [{ id: "b", username: "Beta" }, { id: "c", username: "Zoé" }] },
      { tier: 100, players: [{ id: "a", username: "Alpha" }] },
    ]);
    expect(milestoneGroups([])).toEqual([]);
  });

  // Lundi 9 novembre 2026, 0 h 53 à Paris, puis la liste relue dans la nuit du 11.
  const since = "2026-11-08T23:53:00.000Z";
  const until = "2026-11-11T23:53:00.000Z";
  const now = (players: typeof crossed) => ({ since, until, players });

  it("montrent la semaine en cours dès qu'un palier y est franchi, avec ses deux relevés, sinon la dernière gazette", () => {
    const edition = [{ id: "a", tier: 100, username: "Alpha" }];
    expect(homeMilestones(now(crossed), edition)).toMatchObject({ when: "current", since, until });
    expect(homeMilestones(now([]), edition)).toEqual({ when: "edition", groups: [{ tier: 100, players: [{ id: "a", username: "Alpha" }] }] });
    expect(homeMilestones(null, edition)?.when).toBe("edition");
  });

  it("ne disent rien sans palier franchi : la ligne n'existe pas, et aucun zéro n'est écrit", () => {
    expect(homeMilestones(now([]), [])).toBeNull();
    expect(homeMilestones(null, null)).toBeNull();
    expect(homeMilestones(now([]), null)).toBeNull();
  });

  it("datent la semaine en cours par ses deux relevés : une liste qui vieillit se voit", () => {
    // La liste est relue vers 0 h 53 à Paris : le relevé de la nuit du 11 porte la date du 12.
    expect(currentMilestonesPeriod(since, until)).toBe("depuis le lundi 9 nov., d'après la liste du 12 nov.");
    expect(currentMilestonesPeriod(since, since)).toBe("depuis le lundi 9 nov., d'après la liste du 9 nov.");
  });
});

describe("« et N autres »", () => {
  it("compte tous ceux qui ne sont pas cités, sans pseudo public compris", () => {
    expect(restAfter(24, NAMES_SHOWN)).toBe("et 19 autres");
    expect(restAfter(6, 5)).toBe("et 1 autre");
    expect(restAfter(5, 5)).toBeNull();
    expect(restAfter(3, 5)).toBeNull();
    // Le séparateur des milliers est celui du site : une espace insécable, écrite par fmtInt.
    expect(restAfter(1234, 5)).toBe(`et ${fmtInt(1229)} autres`);
  });
});

describe("la fin d'une phrase", () => {
  it("ne double pas le point d'un mois abrégé", () => {
    expect(endSentence("le 8 nov.")).toBe("le 8 nov.");
    expect(endSentence("le 8 nov. 2026")).toBe("le 8 nov. 2026.");
  });
});

describe("les records récents", () => {
  const records: ClanRecords = {
    streak: { wins: 12, endedAt: "2026-07-27T04:40:48.413Z" },
    bestDay: { date: "2026-11-07", wins: 78, games: 196 },
    biggestGroup: { players: 14, at: "2026-05-30T21:31:26.264Z" },
    mostTeams: { teams: 78, players: 156, at: "2026-11-03T18:14:43.121Z" },
  };

  it("ne citent que les records des sept derniers jours couverts, dans l'ordre de la page Records", () => {
    expect(recentRecordLines(records, "2026-11-09T08:09:04.861Z")).toEqual([
      "meilleure journée, 78 victoires sur 196 parties, le 7 nov. 2026",
      "victoire avec le plus d'équipes en jeu, 78 équipes, le 3 nov. 2026",
    ]);
    // Le 3 novembre sort de la fenêtre : il n'est plus cité.
    expect(recentRecordLines(records, "2026-11-10T08:00:00.000Z")).toEqual(["meilleure journée, 78 victoires sur 196 parties, le 7 nov. 2026"]);
  });

  it("ne citent rien sans record, sans collecte ou sans record récent", () => {
    expect(recentRecordLines(null, "2026-11-09T08:00:00.000Z")).toEqual([]);
    expect(recentRecordLines(records, null)).toEqual([]);
    expect(recentRecordLines(records, "2026-12-25T08:00:00.000Z")).toEqual([]);
  });
});

describe("le plus grand territoire", () => {
  // Le 8 novembre 2026 à 15 h, heure de Paris.
  const at = Date.parse("2026-11-08T14:00:00.000Z") / 1000;

  it("se signale pendant sept jours, avec sa date", () => {
    expect(recentTerritoryRecord({ pixels: 129729, at }, "2026-11-09T00:10:00.000Z")).toBe(`${fmtInt(129729)} pixels, le 8 nov.`);
    expect(recentTerritoryRecord({ pixels: 129729, at }, "2026-11-14T20:00:00.000Z")).not.toBeNull();
    expect(recentTerritoryRecord({ pixels: 129729, at }, "2026-11-15T20:00:00.000Z")).toBeNull();
  });

  it("compte sept jours du calendrier de Paris, même la semaine du changement d'heure", () => {
    // Le 29 mars 2026, Paris passe à l'heure d'été. Un maximum du lundi 23, relu le lundi 30 : huit jours, il n'est plus cité.
    const march = Date.parse("2026-03-23T12:00:00.000Z") / 1000;
    expect(recentTerritoryRecord({ pixels: 5000, at: march }, "2026-03-29T20:00:00.000Z")).not.toBeNull();
    expect(recentTerritoryRecord({ pixels: 5000, at: march }, "2026-03-30T00:30:00.000Z")).toBeNull();
  });

  it("ne se signale ni sans date, ni sans relevé, ni sans territoire", () => {
    expect(recentTerritoryRecord({ pixels: 129729 }, "2026-11-09T00:10:00.000Z")).toBeNull();
    expect(recentTerritoryRecord({ pixels: 129729, at }, null)).toBeNull();
    expect(recentTerritoryRecord({ pixels: 0, at }, "2026-11-09T00:10:00.000Z")).toBeNull();
    expect(recentTerritoryRecord(null, "2026-11-09T00:10:00.000Z")).toBeNull();
    // Un record daté d'après le relevé serait une erreur de données : il n'est pas montré.
    expect(recentTerritoryRecord({ pixels: 129729, at: at + 3 * 86_400 }, "2026-11-09T00:10:00.000Z")).toBeNull();
  });
});
