import { describe, expect, it } from "vitest";
import { POLL_MAX_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX, cleanOptions, fmtVotes, pollProblem, pollRows, validPollTotals } from "../../src/lib/compte/polls";

describe("les totaux d'un sondage", () => {
  it("donnent les voix et la part de chaque choix, dans l'ordre du sondage", () => {
    const { rows, total } = pollRows({ options: ["Vendredi", "Samedi", "Dimanche"], counts: [3, 1, 0] });
    expect(total).toBe(4);
    expect(rows).toEqual([
      { label: "Vendredi", count: 3, share: 75 },
      { label: "Samedi", count: 1, share: 25 },
      { label: "Dimanche", count: 0, share: 0 },
    ]);
  });

  it("n'inventent pas de part tant que personne n'a voté", () => {
    const { rows, total } = pollRows({ options: ["Oui", "Non"], counts: [0, 0] });
    expect(total).toBe(0);
    expect(rows.map((r) => r.share)).toEqual([null, null]);
  });

  it("ne sont lisibles qu'avec un total entier par choix : un total absent n'est pas zéro", () => {
    expect(validPollTotals({ options: ["A", "B"], counts: [2, 0] })).toBe(true);
    expect(validPollTotals({ options: ["A", "B", "C"], counts: [2, 1] })).toBe(false);
    expect(validPollTotals({ options: ["A", "B"], counts: [2, Number.NaN] })).toBe(false);
    expect(validPollTotals({ options: ["A", "B"], counts: [2, -1] })).toBe(false);
    expect(validPollTotals({ options: ["A", "B"], counts: [2, 1.5] })).toBe(false);
    expect(validPollTotals({ options: ["A", 2], counts: [2, 1] })).toBe(false);
    expect(validPollTotals({ options: ["A", "B"] })).toBe(false);
  });

  it("s'écrivent sans s au pluriel", () => {
    expect(fmtVotes(1)).toBe("1 voix");
    expect(fmtVotes(12)).toBe("12 voix");
  });
});

describe("un sondage avant l'envoi", () => {
  it("part sans espace autour ni case vide", () => {
    expect(cleanOptions([" Vendredi ", "", "  ", "Samedi"])).toEqual(["Vendredi", "Samedi"]);
  });

  it("est accepté avec une question et de 2 à 6 choix différents", () => {
    expect(pollProblem("Quel soir ?", ["Vendredi", "Samedi"])).toBeNull();
    expect(pollProblem("Quel soir ?", ["Vendredi", "Samedi", "", "  "])).toBeNull();
  });

  it("dit ce qui manque, avec les bornes du serveur", () => {
    expect(pollProblem("  ", ["A", "B"])).toBe(`Posez une question, en ${POLL_QUESTION_MAX} caractères au plus.`);
    expect(pollProblem("x".repeat(POLL_QUESTION_MAX + 1), ["A", "B"])).toMatch(/^Posez une question/);
    expect(pollProblem("Quel soir ?", ["Vendredi"])).toBe(`Donnez de 2 à ${POLL_MAX_OPTIONS} choix.`);
    expect(pollProblem("Quel soir ?", ["1", "2", "3", "4", "5", "6", "7"])).toBe(`Donnez de 2 à ${POLL_MAX_OPTIONS} choix.`);
    expect(pollProblem("Quel soir ?", ["A", "x".repeat(POLL_OPTION_MAX + 1)])).toBe(`Un choix dépasse ${POLL_OPTION_MAX} caractères.`);
    expect(pollProblem("Quel soir ?", ["Vendredi", "vendredi "])).toBe("Deux choix sont identiques.");
  });
});
