import { describe, expect, it } from "vitest";
import { formTitle, goalState, readGoalFile, winsLeft, winsLeftText, type GoalFile, type GoalState } from "../../src/lib/compte/direction-objectif";
import type { WeeklyGoal } from "../../src/lib/compte/outils";
import { fmtInt } from "../../src/lib/format";
import type { ClanWeekFile } from "../../src/lib/semaine-du-clan";

const week = "2026-11-09";
const file: ClanWeekFile = {
  until: "2026-11-13T21:53:32.706Z",
  weeks: [
    { from: week, games: 30, wins: 12, complete: false },
    { from: "2026-11-02", games: 41, wins: 19, complete: true },
  ],
  gains: null,
  clans: {
    end: "2026-11-13T22:38:11.385Z",
    scores: [
      { tag: "AAA", score: 300 },
      { tag: "GAL", score: 200 },
      { tag: "BBB", score: 200 },
      { tag: "CCC", score: 150.5 },
    ],
  },
};

const wins = (n: number, monday = week): WeeklyGoal => ({ week: monday, kind: "wins", wins: n });
const versus = (tag: string): WeeklyGoal => ({ week, kind: "clan", clan: tag });
/** Le même fichier, avec d'autres victoires pour la semaine en cours. */
const withWeek = (wins: number, complete = false): GoalFile => ({ ...file, weeks: [{ from: week, games: Math.max(wins, 30), wins, complete }] });
/** Le même fichier, avec d'autres scores au classement. */
const withScores = (scores: { tag: string; score: number }[]): GoalFile => ({ ...file, clans: { end: file.clans!.end, scores } });

describe("goalState", () => {
  it("dit qu'aucun objectif n'est fixé, données lues ou non", () => {
    expect(goalState(null, file, "GAL")).toEqual({ key: "none", tone: "muted", word: "Pas fixé" });
    expect(goalState(null, null, "GAL")).toEqual({ key: "none", tone: "muted", word: "Pas fixé" });
  });

  it("suit un nombre de victoires, sans rien recalculer", () => {
    expect(goalState(wins(30), file, "GAL")).toEqual({ key: "running", tone: "ally", word: "En cours", progress: { done: 12, target: 30, reached: false, share: 0.4 } });
  });

  it("compte zéro victoire comme zéro, pas comme « pas de données »", () => {
    expect(goalState(wins(30), withWeek(0), "GAL")).toEqual({ key: "running", tone: "ally", word: "En cours", progress: { done: 0, target: 30, reached: false, share: 0 } });
  });

  it("dit « Atteint » pile au nombre visé, et au-delà sans dépasser la jauge", () => {
    expect(goalState(wins(12), file, "GAL")).toEqual({ key: "reached", tone: "ok", word: "Atteint", progress: { done: 12, target: 12, reached: true, share: 1 } });
    expect(goalState(wins(5), file, "GAL")).toEqual({ key: "reached", tone: "ok", word: "Atteint", progress: { done: 12, target: 5, reached: true, share: 1 } });
    expect(goalState(wins(13), file, "GAL").key).toBe("running");
  });

  it("une semaine entièrement relevée n'est plus « en cours » : atteint, ou pas atteint", () => {
    expect(goalState(wins(30), withWeek(12, true), "GAL")).toEqual({ key: "missed", tone: "warn", word: "Pas atteint", progress: { done: 12, target: 30, reached: false, share: 0.4 } });
    expect(goalState(wins(12), withWeek(12, true), "GAL").key).toBe("reached");
    // La semaine d'avant, relevée en entier, sert si c'est la semaine de l'objectif.
    expect(goalState(wins(19, "2026-11-02"), file, "GAL").key).toBe("reached");
    expect(goalState(wins(20, "2026-11-02"), file, "GAL").key).toBe("missed");
  });

  it("ne confond pas « pas de données » et zéro", () => {
    expect(goalState(wins(30), null, "GAL")).toEqual({ key: "no-data", tone: "muted", word: "Pas de données" });
    // Aucune collecte réussie : la semaine n'a pas de compte, même si une ligne traîne.
    expect(goalState(wins(30), { ...file, until: null }, "GAL").key).toBe("no-data");
    // La semaine de l'objectif n'est pas encore relevée.
    expect(goalState(wins(30, "2026-11-16"), file, "GAL").key).toBe("no-data");
    expect(goalState(wins(30), { ...file, weeks: [] }, "GAL").key).toBe("no-data");
    // Un clan absent du classement officiel, ou pas de classement, ou le nôtre absent.
    expect(goalState(versus("ZZZ"), file, "GAL").key).toBe("no-data");
    expect(goalState(versus("AAA"), { ...file, clans: null }, "GAL").key).toBe("no-data");
    expect(goalState(versus("AAA"), null, "GAL").key).toBe("no-data");
    expect(goalState(versus("AAA"), withScores([{ tag: "AAA", score: 300 }]), "GAL").key).toBe("no-data");
  });

  it("ne montre jamais un compte ou un écart illisible", () => {
    const badWins = { ...file, weeks: [{ from: week, games: 30, wins: Number.NaN, complete: false }] };
    expect(goalState(wins(30), badWins, "GAL").key).toBe("no-data");
    const badScore = withScores([
      { tag: "GAL", score: Number.NaN },
      { tag: "AAA", score: 300 },
    ]);
    // Un écart « NaN » n'est ni positif ni négatif : sans garde, il passait pour « À égalité ».
    expect(goalState(versus("AAA"), badScore, "GAL").key).toBe("no-data");
  });

  it("place le clan devant, derrière ou à égalité, avec l'écart du classement", () => {
    expect(goalState(versus("CCC"), file, "GAL")).toEqual({ key: "ahead", tone: "ok", word: "Devant", gap: 49.5 });
    expect(goalState(versus("AAA"), file, "GAL")).toEqual({ key: "behind", tone: "warn", word: "Derrière", gap: -100 });
    expect(goalState(versus("BBB"), file, "GAL")).toEqual({ key: "level", tone: "ally", word: "À égalité", gap: 0 });
  });

  it("juge l'égalité au centième, comme le classement l'affiche, et l'écrit sans signe", () => {
    const close = withScores([
      { tag: "GAL", score: 200 },
      { tag: "BBB", score: 200.004 },
      { tag: "CCC", score: 200.01 },
      { tag: "DDD", score: 199.99 },
    ]);
    const level = goalState(versus("BBB"), close, "GAL");
    expect(level.key).toBe("level");
    // `toBe` distingue 0 de -0 : l'arrondi de -0,4 centième donnait « -0 ».
    expect("gap" in level && level.gap).toBe(0);
    expect(goalState(versus("CCC"), close, "GAL")).toEqual({ key: "behind", tone: "warn", word: "Derrière", gap: -0.01 });
    expect(goalState(versus("DDD"), close, "GAL")).toEqual({ key: "ahead", tone: "ok", word: "Devant", gap: 0.01 });
  });

  it("donne à chaque état sa couleur et son mot", () => {
    const cases: [GoalState, GoalState["key"], GoalState["tone"], string][] = [
      [goalState(null, file, "GAL"), "none", "muted", "Pas fixé"],
      [goalState(wins(30), null, "GAL"), "no-data", "muted", "Pas de données"],
      [goalState(wins(30), file, "GAL"), "running", "ally", "En cours"],
      [goalState(wins(12), file, "GAL"), "reached", "ok", "Atteint"],
      [goalState(wins(30), withWeek(12, true), "GAL"), "missed", "warn", "Pas atteint"],
      [goalState(versus("CCC"), file, "GAL"), "ahead", "ok", "Devant"],
      [goalState(versus("BBB"), file, "GAL"), "level", "ally", "À égalité"],
      [goalState(versus("AAA"), file, "GAL"), "behind", "warn", "Derrière"],
    ];
    for (const [state, key, tone, word] of cases) expect([state.key, state.tone, state.word]).toEqual([key, tone, word]);
    // Huit états, huit mots : aucun mot ne sert à deux états.
    expect(new Set(cases.map(([state]) => state.word)).size).toBe(cases.length);
  });
});

describe("winsLeft", () => {
  it("compte ce qui manque, jamais en négatif", () => {
    expect(winsLeft({ done: 12, target: 30, reached: false, share: 0.4 })).toBe(18);
    expect(winsLeft({ done: 29, target: 30, reached: false, share: 29 / 30 })).toBe(1);
    expect(winsLeft({ done: 0, target: 30, reached: false, share: 0 })).toBe(30);
    expect(winsLeft({ done: 30, target: 30, reached: true, share: 1 })).toBe(0);
    expect(winsLeft({ done: 40, target: 30, reached: true, share: 1 })).toBe(0);
  });
});

describe("winsLeftText", () => {
  it("dit ce qui manque, au singulier comme au pluriel", () => {
    expect(winsLeftText(goalState(wins(30), file, "GAL"))).toBe("Il en manque 18.");
    expect(winsLeftText(goalState(wins(13), file, "GAL"))).toBe("Il en manque 1.");
    expect(winsLeftText(goalState(wins(10_000), withWeek(0), "GAL"))).toBe(`Il en manque ${fmtInt(10_000)}.`);
  });

  it("parle au passé une fois la semaine relevée", () => {
    expect(winsLeftText(goalState(wins(30), withWeek(12, true), "GAL"))).toBe("Il en a manqué 18.");
  });

  it("ne dit rien quand rien ne manque, ou quand rien n'est compté", () => {
    expect(winsLeftText(goalState(wins(12), file, "GAL"))).toBeNull();
    expect(winsLeftText(goalState(wins(5), file, "GAL"))).toBeNull();
    expect(winsLeftText(goalState(wins(30), null, "GAL"))).toBeNull();
    expect(winsLeftText(goalState(null, file, "GAL"))).toBeNull();
    expect(winsLeftText(goalState(versus("AAA"), file, "GAL"))).toBeNull();
  });
});

describe("formTitle", () => {
  it("ne dit « Fixer » ou « Changer » que si l'objectif en cours est connu", () => {
    expect(formTitle(undefined)).toBe("Enregistrer l'objectif");
    expect(formTitle(null)).toBe("Fixer l'objectif");
    expect(formTitle(wins(30))).toBe("Changer l'objectif");
    expect(formTitle(versus("AAA"))).toBe("Changer l'objectif");
  });
});

describe("readGoalFile", () => {
  it("garde le fichier public tel quel, sans les victoires des membres", () => {
    const raw: unknown = JSON.parse(JSON.stringify({ ...file, gains: { since: file.until, until: file.until, wins: { abc: 3 } } }));
    expect(readGoalFile(raw)).toEqual({ until: file.until, weeks: file.weeks, clans: file.clans });
  });

  it("refuse ce qui n'est pas le fichier attendu", () => {
    for (const raw of [null, undefined, 42, "texte", [], {}, { weeks: null }, { weeks: {} }]) expect(readGoalFile(raw)).toBeNull();
  });

  it("écarte une semaine illisible plutôt que de la deviner", () => {
    const read = readGoalFile({
      until: file.until,
      weeks: [
        { from: week, games: 30, wins: "12", complete: false },
        { from: "9 nov.", games: 30, wins: 12, complete: false },
        { from: "2026-11-02", games: 41, wins: -1, complete: true },
        { from: "2026-10-26", games: 41, wins: 2.5, complete: true },
        { from: "2026-10-19", games: 10, wins: 4, complete: "oui" },
        null,
      ],
      clans: null,
    });
    expect(read?.weeks).toEqual([{ from: "2026-10-19", games: 10, wins: 4, complete: false }]);
    expect(goalState(wins(30), read, "GAL").key).toBe("no-data");
  });

  it("une heure de collecte illisible vaut « pas de collecte »", () => {
    const read = readGoalFile({ ...file, until: "hier soir" });
    expect(read?.until).toBeNull();
    expect(goalState(wins(30), read, "GAL").key).toBe("no-data");
  });

  it("écarte un clan illisible, et un classement sans date", () => {
    const read = readGoalFile({
      ...file,
      clans: {
        end: file.clans!.end,
        scores: [{ tag: "GAL", score: 200 }, { tag: "AAA", score: "300" }, { tag: "", score: 10 }, { tag: "CCC" }, "BBB", { tag: "DDD", score: 150 }],
      },
    });
    expect(read?.clans?.scores).toEqual([
      { tag: "GAL", score: 200 },
      { tag: "DDD", score: 150 },
    ]);
    // Le clan illisible n'est plus au classement relevé : ni état, ni tag affiché.
    expect(goalState(versus("AAA"), read, "GAL").key).toBe("no-data");
    expect(goalState(versus("DDD"), read, "GAL")).toEqual({ key: "ahead", tone: "ok", word: "Devant", gap: 50 });
    expect(readGoalFile({ ...file, clans: { end: "bientôt", scores: [] } })?.clans).toBeNull();
    expect(readGoalFile({ ...file, clans: { end: file.clans!.end, scores: null } })?.clans).toBeNull();
  });
});
