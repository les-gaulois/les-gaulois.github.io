import { describe, expect, it } from "vitest";
import {
  changeWords,
  clanPoints,
  galScore,
  markCourseSent,
  MAX_LEADERBOARD_AGE_MS,
  parseCourseState,
  periodOf,
  periodWords,
  planCourse,
  pointsWords,
  raceChanges,
  raceGaps,
  raceParts,
  scoreLine,
  wearWords,
  type CourseInputs,
  type CourseState,
} from "../../src/lib/course-soir";
import { plainTag, rankReading } from "../../src/lib/alerts";
import type { StoredLeaderboard, StoredSession } from "../../src/lib/schemas";

const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");

/** Mercredi 11 novembre 2026, 21 h 53 à Paris (UTC+1). */
const NOW = new Date("2026-11-11T20:53:00.000Z");
const COVERED = "2026-11-11T20:53:40.000Z";

let id = 0;
const session = (gameStart: string, clanPlayerCount: number, score: number): StoredSession => ({
  gameId: `g${id++}`,
  clanPlayerCount,
  hasWon: score > 0,
  numTeams: 2,
  playerTeams: "Duos",
  totalPlayerCount: 40,
  gameStart,
  score,
});

const clan = (clanTag: string, weightedWins: number) => ({ clanTag, games: 100, wins: 50, losses: 50, playerSessions: 200, weightedWins, weightedLosses: 10, weightedWLRatio: 1 });
/** Les scores du classement relu le 11 novembre 2026. */
const LEADERBOARD: StoredLeaderboard = {
  start: "2026-08-13T20:39:16.298Z",
  end: "2026-11-11T20:39:16.298Z",
  fetchedAt: "2026-11-11T20:53:01.000Z",
  clans: [clan("UN", 10938.86), clan("GAL", 2308.51), clan("ITA", 2122.82), clan("AST", 1942.04), clan("EU", 1357.07), clan("NU", 1245.08)],
};
const READING = rankReading(LEADERBOARD, "GAL");
if (!READING) throw new Error("GAL doit être dans la liste");
const reading = READING;

describe("periodOf", () => {
  it("va de 20 h la veille à 20 h le jour du message, heure de Paris, en hiver comme en été", () => {
    expect(periodOf(NOW)).toEqual({ since: "2026-11-10T19:00:00.000Z", until: "2026-11-11T19:00:00.000Z" });
    expect(periodOf(new Date("2026-11-11T21:59:00.000Z"))).toEqual(periodOf(NOW));
    expect(periodOf(new Date("2026-07-15T19:53:00.000Z"))).toEqual({ since: "2026-07-14T18:00:00.000Z", until: "2026-07-15T18:00:00.000Z" });
  });
  it("au changement d'heure, garde 20 h à Paris : 25 heures en octobre, 23 en mars, sans trou ni doublon d'un soir à l'autre", () => {
    const autumn = periodOf(new Date("2026-10-25T20:53:00.000Z"));
    expect(autumn).toEqual({ since: "2026-10-24T18:00:00.000Z", until: "2026-10-25T19:00:00.000Z" });
    expect(periodWords(autumn)).toBe("du 24 oct., 20 h au 25 oct., 20 h");
    const spring = periodOf(new Date("2027-03-28T19:53:00.000Z"));
    expect(spring).toEqual({ since: "2027-03-27T19:00:00.000Z", until: "2027-03-28T18:00:00.000Z" });
    expect(periodWords(spring)).toBe("du 27 mars, 20 h au 28 mars, 20 h");
    // Deux soirs de suite : la fin de l'un est le début de l'autre.
    expect(periodOf(new Date("2026-10-26T20:53:00.000Z")).since).toBe(autumn.until);
    expect(periodOf(new Date("2026-10-24T19:53:00.000Z")).until).toBe(autumn.since);
  });
});

describe("clanPoints", () => {
  const since = "2026-11-10T19:00:00.000Z";
  const until = "2026-11-11T19:00:00.000Z";
  it("additionne les scores positifs de la période, à plusieurs et seul sous le tag, sans les défaites", () => {
    const sessions = [
      session("2026-11-10T18:59:59.999Z", 4, 5), // juste avant la période
      session("2026-11-10T19:00:00.000Z", 3, 1.53), // première milliseconde de la période
      session("2026-11-11T08:00:00.000Z", 2, 1.37),
      session("2026-11-11T09:00:00.000Z", 2, -0.31), // défaite à plusieurs : comptée comme partie, sans point
      session("2026-11-11T10:00:00.000Z", 1, 0.07),
      session("2026-11-11T11:00:00.000Z", 1, -0.04),
      session("2026-11-11T18:59:59.999Z", 1, 0.1), // dernière milliseconde de la période
      session("2026-11-11T19:00:00.000Z", 5, 2.2), // la période suivante
    ];
    expect(clanPoints(sessions, since, until)).toEqual({
      since,
      until,
      total: { games: 6, points: 3.07 },
      group: { games: 3, points: 2.9 },
      solo: { games: 3, points: 0.17 },
    });
  });
  it("compte en centièmes : pas d'erreur d'arrondi sur une longue somme", () => {
    const sessions = Array.from({ length: 1000 }, (_, i) => session(new Date(Date.parse(until) - (i + 1) * 60_000).toISOString(), 2, 0.1));
    expect(clanPoints(sessions, since, until).total).toEqual({ games: 1000, points: 100 });
  });
  it("ignore une session sans joueur du clan, et rend des zéros sans partie", () => {
    expect(clanPoints([session("2026-11-11T08:00:00.000Z", 0, 3)], since, until).total).toEqual({ games: 0, points: 0 });
  });
});

describe("raceGaps et raceChanges", () => {
  const yesterday: CourseState = { sentOn: "2026-11-10", score: 2306.26, gaps: { UN: -8655.45, ITA: 173.39 } };

  it("note le score de GAL et l'écart signé avec chaque voisin : négatif derrière, positif devant", () => {
    expect(galScore(reading)).toBe(2308.51);
    const gaps = raceGaps(reading);
    expect(Object.keys(gaps)).toEqual(["UN", "ITA"]);
    expect(gaps["UN"]).toBeCloseTo(-8630.35, 2);
    expect(gaps["ITA"]).toBeCloseTo(185.69, 2);
  });
  it("compare à la veille : le score a monté, le retard a fondu, l'avance a grandi", () => {
    const changes = raceChanges(yesterday, reading, NOW);
    expect(changes.score).toBeCloseTo(2.25, 2);
    expect(changes.above).toBeCloseTo(-25.1, 2);
    expect(changes.below).toBeCloseTo(12.3, 2);
  });
  it("ne compare qu'au message de la veille", () => {
    expect(raceChanges({ ...yesterday, sentOn: "2026-11-09" }, reading, NOW)).toEqual({ score: null, above: null, below: null });
    expect(raceChanges(null, reading, NOW)).toEqual({ score: null, above: null, below: null });
  });
  it("sans score noté la veille, ne compare pas le score, et ne note jamais un zéro de remplacement", () => {
    const changes = raceChanges({ ...yesterday, score: null }, reading, NOW);
    expect(changes.score).toBeNull();
    expect(changes.below).toBeCloseTo(12.3, 2);
    const withoutGal = { ...reading, rows: reading.rows.filter((row) => !row.gal) };
    const race = { reading: withoutGal, points: clanPoints([], "2026-11-10T19:00:00.000Z", "2026-11-11T19:00:00.000Z"), changes };
    expect(markCourseSent(race, NOW).score).toBeNull();
    expect(plain(scoreLine(withoutGal, null))).toBe("Score : —");
  });
  it("ne compare pas un voisin absent la veille, ni un voisin passé de l'autre côté", () => {
    const absent = raceChanges({ sentOn: "2026-11-10", score: 2300, gaps: { AST: 50 } }, reading, NOW);
    expect(absent).toMatchObject({ above: null, below: null });
    expect(absent.score).toBeCloseTo(8.51, 2);
    // La veille, GAL était devant UN et derrière ITA.
    expect(raceChanges({ sentOn: "2026-11-10", score: 2300, gaps: { UN: 12, ITA: -3 } }, reading, NOW)).toMatchObject({ above: null, below: null });
  });
  it("part d'une égalité la veille, d'un côté comme de l'autre", () => {
    const changes = raceChanges({ sentOn: "2026-11-10", score: 2300, gaps: { UN: 0, ITA: 0 } }, reading, NOW);
    expect(changes.above).toBeCloseTo(8630.35, 2);
    expect(changes.below).toBeCloseTo(185.69, 2);
  });
});

describe("les mots de la course", () => {
  it("écrit le retard puis l'avance, dans l'ordre du classement, et leur changement en toutes lettres", () => {
    expect(raceParts({ reading, changes: { score: null, above: -25.1, below: 12.3 } }, plainTag).map(plain)).toEqual([
      "8 630,35 de retard sur [UN], 1er (retard en baisse de 25,10 depuis hier)",
      "185,69 d'avance sur [ITA], 3e (avance en hausse de 12,30 depuis hier)",
    ]);
    expect(raceParts({ reading, changes: { score: null, above: 21.06, below: -3.5 } }, plainTag).map(plain)).toEqual([
      "8 630,35 de retard sur [UN], 1er (retard en hausse de 21,06 depuis hier)",
      "185,69 d'avance sur [ITA], 3e (avance en baisse de 3,50 depuis hier)",
    ]);
    expect(raceParts({ reading, changes: { score: null, above: null, below: null } }, plainTag).map(plain)).toEqual(["8 630,35 de retard sur [UN], 1er", "185,69 d'avance sur [ITA], 3e"]);
  });
  it("dit l'égalité et l'écart qui n'a pas bougé", () => {
    const tied = { ...reading, below: { tag: "ITA", rank: 3, gap: 0 } };
    expect(raceParts({ reading: tied, changes: { score: null, above: null, below: 0.001 } }, plainTag)[1]).toBe("à égalité avec [ITA], 3e (comme hier)");
    expect(changeWords("avance", null)).toBe("");
  });
  it("en tête du classement, seulement l'avance", () => {
    const first = rankReading({ ...LEADERBOARD, clans: [clan("GAL", 12000), ...LEADERBOARD.clans.filter((c) => c.clanTag !== "GAL")] }, "GAL");
    if (!first) throw new Error("GAL doit être dans la liste");
    expect(raceParts({ reading: first, changes: { score: null, above: null, below: null } }, plainTag).map(plain)).toEqual(["1 061,14 d'avance sur [UN], 2e"]);
  });
  it("écrit le score et sa variation, et ce que le score fait des points", () => {
    expect(plain(scoreLine(reading, 2.25))).toBe("Score : 2 308,51 (+2,25 depuis hier)");
    expect(plain(scoreLine(reading, -8.67))).toBe("Score : 2 308,51 (−8,67 depuis hier)");
    expect(plain(scoreLine(reading, 0.004))).toBe("Score : 2 308,51 (comme hier)");
    expect(plain(scoreLine(reading, null))).toBe("Score : 2 308,51");
    expect(wearWords(2.25)).toBe("Le score, qui perd chaque jour une part de sa valeur, a pris 2,25 depuis hier.");
    expect(wearWords(-8.67)).toBe("Le score, qui perd chaque jour une part de sa valeur, a perdu 8,67 depuis hier.");
    expect(wearWords(0)).toBe("Le score, qui perd chaque jour une part de sa valeur, n'a pas bougé depuis hier.");
    expect(wearWords(null)).toBe("Le score perd chaque jour une part de sa valeur : il monte moins que ces points.");
  });
  it("écrit la période à l'heure de Paris, et les points avec le nombre de parties", () => {
    expect(periodWords({ since: "2026-11-10T19:00:00.000Z", until: "2026-11-11T19:00:00.000Z" })).toBe("du 10 nov., 20 h au 11 nov., 20 h");
    expect(plain(pointsWords({ games: 48, points: 1069.41 }))).toBe("+1 069,41 en 48 parties");
    expect(pointsWords({ games: 1, points: 0.07 })).toBe("+0,07 en 1 partie");
  });
});

describe("parseCourseState", () => {
  it("lit l'état noté, et repart sans comparaison s'il est illisible", () => {
    expect(parseCourseState(null)).toEqual({ state: null, warning: null });
    expect(parseCourseState('{"sentOn":"2026-11-10","score":2300.5,"gaps":{"UN":-1}}')).toEqual({ state: { sentOn: "2026-11-10", score: 2300.5, gaps: { UN: -1 } }, warning: null });
    for (const raw of ["{", '{"sentOn":"10/11"}', '{"sentOn":"2026-11-10","gaps":{}}', "[]"]) expect(parseCourseState(raw).state).toBeNull();
    expect(parseCourseState("{").warning).toContain("sans comparaison");
  });
});

describe("planCourse", () => {
  const sessions = [session("2026-11-11T08:00:00.000Z", 3, 1.53), session("2026-11-11T09:00:00.000Z", 1, 0.07)];
  const inputs = (over: Partial<CourseInputs> = {}): CourseInputs => ({ stored: null, leaderboard: LEADERBOARD, sessions, coveredUntil: COVERED, unreadable: [], now: NOW, tag: "GAL", ...over });

  it("envoie de 21 h à 23 h à Paris, une fois par jour", () => {
    const plan = planCourse(inputs());
    expect(plan.reason).toBe("");
    expect(plan.race?.reading.rank).toBe(2);
    expect(plan.race?.points).toMatchObject({ since: "2026-11-10T19:00:00.000Z", until: "2026-11-11T19:00:00.000Z", total: { games: 2, points: 1.6 } });
    expect(planCourse(inputs({ now: new Date("2026-11-11T19:59:59.000Z") })).race).toBeNull();
    expect(planCourse(inputs({ now: new Date("2026-11-11T19:59:59.000Z") })).reason).toBe("le message part à partir de 21 h");
    expect(planCourse(inputs({ now: new Date("2026-11-11T22:00:00.000Z") })).reason).toBe("la nuit : le message attend 21 h");
    expect(planCourse(inputs({ stored: { sentOn: "2026-11-11", score: 2300, gaps: {} } })).reason).toBe("déjà un message aujourd'hui : la suite attend demain");
  });
  it("à 22 h 59, après un passage raté, garde la même période : 20 h la veille à 20 h", () => {
    const late = planCourse(inputs({ now: new Date("2026-11-11T21:59:00.000Z"), coveredUntil: "2026-11-11T21:58:00.000Z", leaderboard: { ...LEADERBOARD, fetchedAt: "2026-11-11T21:58:00.000Z" } }));
    expect(late.race?.points).toMatchObject({ since: "2026-11-10T19:00:00.000Z", until: "2026-11-11T19:00:00.000Z" });
  });
  it("attend des sessions relevées une heure après 20 h, pour que les parties de la période soient finies", () => {
    // Un passage arrivé à 20 h 58 et dont l'étape tourne après 21 h : ses sessions datent d'avant 21 h.
    const early = planCourse(inputs({ now: new Date("2026-11-11T20:01:00.000Z"), coveredUntil: "2026-11-11T19:58:00.000Z" }));
    expect(early.reason).toBe("sessions pas encore relevées après 21 h : les dernières parties de la période ne sont peut-être pas finies");
    expect(planCourse(inputs({ coveredUntil: "2026-11-11T20:00:00.000Z" })).race).not.toBeNull();
    expect(planCourse(inputs({ coveredUntil: null })).race).toBeNull();
  });
  it("compare à la veille quand le message de la veille est noté", () => {
    const plan = planCourse(inputs({ stored: { sentOn: "2026-11-10", score: 2306.26, gaps: { UN: -8655.45, ITA: 173.39 } } }));
    expect(plan.race?.changes.score).toBeCloseTo(2.25, 2);
    expect(plan.race?.changes.below).toBeCloseTo(12.3, 2);
  });
  it("n'envoie rien sur un classement trop vieux, des sessions illisibles ou une période vide", () => {
    const old = new Date(NOW.getTime() - MAX_LEADERBOARD_AGE_MS - 1000).toISOString();
    expect(planCourse(inputs({ leaderboard: { ...LEADERBOARD, fetchedAt: old } })).reason).toBe("classement pas relevé depuis plus de deux heures");
    expect(planCourse(inputs({ leaderboard: null })).race).toBeNull();
    expect(planCourse(inputs({ unreadable: ["2026-11.json"] })).reason).toContain("2026-11.json illisible");
    expect(planCourse(inputs({ sessions: [] })).reason).toContain("aucune partie sur la période");
    expect(planCourse(inputs({ leaderboard: { ...LEADERBOARD, clans: LEADERBOARD.clans.filter((c) => c.clanTag !== "GAL") } })).reason).toBe("[GAL] n'est pas dans la liste officielle");
  });
});

describe("markCourseSent", () => {
  it("note le jour à Paris, le score et les écarts du message", () => {
    const plan = planCourse({ stored: null, leaderboard: LEADERBOARD, sessions: [session("2026-11-11T08:00:00.000Z", 3, 1.53)], coveredUntil: COVERED, unreadable: [], now: NOW, tag: "GAL" });
    if (!plan.race) throw new Error("le message doit partir");
    const state = markCourseSent(plan.race, new Date("2026-11-11T21:53:00.000Z"));
    expect(state.sentOn).toBe("2026-11-11");
    expect(state.score).toBe(2308.51);
    expect(state.gaps["ITA"]).toBeCloseTo(185.69, 2);
    expect(roundTrip(state)).toEqual(state);
  });
});

/** L'état écrit se relit tel quel. */
function roundTrip(state: CourseState): CourseState | null {
  return parseCourseState(`${JSON.stringify(state)}\n`).state;
}
