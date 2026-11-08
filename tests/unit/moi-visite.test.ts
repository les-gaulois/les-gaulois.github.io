import { describe, expect, it } from "vitest";
import { ME_VISIT_KEY, meVisitLines, nextMeVisitState, readMeVisitState, type MeSnapshot } from "../../src/lib/moi-visite";
import { VISIT_GAP_MS } from "../../src/lib/visite";

const snap = (over: Partial<MeSnapshot> = {}): MeSnapshot => ({ id: "abc", at: "2026-11-05T10:00:00.000Z", wins: 498, losses: 400, rank: 12, ranked: 760, ...over });
const later = (over: Partial<MeSnapshot> = {}) => snap({ at: "2026-11-08T10:00:00.000Z", ...over });
const plain = (lines: string[]) => lines.map((l) => l.replace(/\u00a0/g, " "));
const T0 = new Date("2026-11-05T12:00:00.000Z");
const T1 = new Date(T0.getTime() + VISIT_GAP_MS);

describe("nextMeVisitState", () => {
  it("à la première visite, prend les chiffres du jour pour référence", () => {
    const state = nextMeVisitState(null, snap(), T0);
    expect(state).toEqual({ baseline: snap(), latest: snap(), since: T0.toISOString(), seenAt: T0.toISOString() });
  });
  it("à une nouvelle visite, compare aux derniers chiffres vus et annonce la date de la visite", () => {
    const first = nextMeVisitState(null, snap(), T0);
    const state = nextMeVisitState(first, later({ wins: 501 }), T1);
    expect(state.baseline).toEqual(snap());
    expect(state.since).toBe(T0.toISOString());
  });
  it("recharger la page dans la même visite garde la référence", () => {
    const first = nextMeVisitState(null, snap(), T0);
    const soon = new Date(T0.getTime() + 60_000);
    expect(nextMeVisitState(first, later({ wins: 501 }), soon).baseline).toEqual(snap());
    expect(nextMeVisitState(first, later({ wins: 501 }), soon).since).toBe(T0.toISOString());
  });
  it("un autre pseudo retenu repart de zéro", () => {
    const first = nextMeVisitState(null, snap(), T0);
    const other = later({ id: "zzz", wins: 10 });
    expect(nextMeVisitState(first, other, T1).baseline).toEqual(other);
  });
  it("se relit, et refuse un chiffre d'un mauvais type", () => {
    const state = nextMeVisitState(null, snap(), T0);
    expect(readMeVisitState(JSON.stringify(state))).toEqual(state);
    expect(readMeVisitState(JSON.stringify({ ...state, latest: { ...state.latest, wins: "beaucoup" } }))).toBeNull();
    expect(readMeVisitState("{")).toBeNull();
    expect(ME_VISIT_KEY).toBe("gal-moi-visite");
  });
});

describe("meVisitLines", () => {
  it("compte les parties et les victoires, dit les deux places et le palier franchi", () => {
    expect(plain(meVisitLines(snap(), later({ wins: 503, losses: 404, rank: 11 })))).toEqual([
      "9 parties sous le tag de plus, dont 5 victoires.",
      "Place aux victoires : 12e à votre dernière visite, 11e au dernier relevé, sur 760 membres.",
      "Palier des 500 victoires franchi.",
    ]);
  });
  it("ne dit rien quand rien n'a changé, ni pour un autre membre, ni face à une liste plus ancienne", () => {
    expect(meVisitLines(snap(), later())).toEqual([]);
    expect(meVisitLines(snap(), later({ id: "zzz", wins: 600 }))).toEqual([]);
    expect(meVisitLines(later(), snap({ wins: 600 }))).toEqual([]);
  });
  it("n'annonce pas un palier déjà atteint, ni de victoires négatives", () => {
    expect(plain(meVisitLines(snap({ wins: 500 }), later({ wins: 500, losses: 403 })))).toEqual(["3 parties sous le tag de plus, dont 0 victoire."]);
    // Une place perdue se dit aussi, sans commentaire.
    expect(plain(meVisitLines(snap(), later({ rank: 14 })))).toEqual(["Place aux victoires : 12e à votre dernière visite, 14e au dernier relevé, sur 760 membres."]);
  });
});
