import { describe, expect, it } from "vitest";
import { POLLS_LIMIT, inPollFilter, openPollCount, pollEnd, pollFilterCounts, pollResult } from "../../src/lib/compte/direction-sondages";

const open = { is_open: true };
const closed = { is_open: false };

describe("le résultat d'un sondage, à la Direction", () => {
  it("marque le choix qui a le plus de voix", () => {
    const result = pollResult({ options: ["Mercredi", "Vendredi", "Samedi"], counts: [4, 11, 7] });
    expect(result?.total).toBe(22);
    expect(result?.tie).toBe(false);
    expect(result?.rows.map((r) => r.lead)).toEqual([false, true, false]);
  });

  it("ne désigne personne à égalité : tous ceux du haut sont marqués", () => {
    const result = pollResult({ options: ["Bleu", "Rouge", "Blanc"], counts: [9, 9, 2] });
    expect(result?.tie).toBe(true);
    expect(result?.rows.map((r) => r.lead)).toEqual([true, true, false]);
  });

  it("ne marque rien tant que personne n'a voté", () => {
    const result = pollResult({ options: ["Oui", "Non"], counts: [0, 0] });
    expect(result).toMatchObject({ total: 0, tie: false });
    expect(result?.rows.some((r) => r.lead)).toBe(false);
  });

  it("ne donne aucun résultat si les totaux ne sont pas lisibles", () => {
    expect(pollResult({ options: ["A", "B"], counts: [3] })).toBeNull();
    expect(pollResult({ options: ["A", "B"] })).toBeNull();
  });
});

describe("les filtres et le nombre de sondages ouverts", () => {
  it("comptent les sondages ouverts et fermés", () => {
    expect(pollFilterCounts([open, closed, closed])).toEqual({ all: 3, open: 1, closed: 2 });
    expect(inPollFilter(open, "all")).toBe(true);
    expect(inPollFilter(open, "open")).toBe(true);
    expect(inPollFilter(open, "closed")).toBe(false);
    expect(inPollFilter(closed, "closed")).toBe(true);
  });

  it("ne donnent pas le nombre d'ouverts quand la liste a pu être coupée", () => {
    expect(openPollCount([open, open, closed])).toBe(2);
    expect(openPollCount([])).toBe(0);
    expect(openPollCount(Array.from({ length: POLLS_LIMIT }, () => closed))).toBeNull();
  });
});

describe("la date d'un sondage", () => {
  it("est la fin prévue d'un sondage ouvert, la fermeture d'un sondage fermé", () => {
    expect(pollEnd({ is_open: true, closes_at: "2026-11-20T20:00:00Z", closed_at: null })).toBe("2026-11-20T20:00:00Z");
    expect(pollEnd({ is_open: true, closes_at: null, closed_at: null })).toBeNull();
    expect(pollEnd({ is_open: false, closes_at: "2026-11-20T20:00:00Z", closed_at: "2026-11-18T10:00:00Z" })).toBe("2026-11-18T10:00:00Z");
    expect(pollEnd({ is_open: false, closes_at: "2026-11-20T20:00:00Z", closed_at: null })).toBe("2026-11-20T20:00:00Z");
  });
});
