import { describe, expect, it } from "vitest";
import { hasNewGazette, nextVisitState, readVisitState, VISIT_GAP_MS, visitLines, type VisitSnapshot } from "../../src/lib/visite";

const snap = (over: Partial<VisitSnapshot> = {}): VisitSnapshot => ({
  at: "2026-11-05T10:00:00.000Z",
  rank: 2,
  score: 2100,
  games: 13000,
  wins: 5000,
  pixels: 96176,
  mapRank: 5,
  members: 760,
  gazette: "2026-10-26",
  ...over,
});
const later = (over: Partial<VisitSnapshot> = {}) => snap({ at: "2026-11-07T18:00:00.000Z", ...over });
const plain = (lines: string[]) => lines.map((l) => l.replace(/[  ]/g, " "));

describe("readVisitState", () => {
  it("relit ce qui a été gardé", () => {
    const state = { baseline: snap(), latest: later(), since: "2026-11-05T10:05:00.000Z", seenAt: "2026-11-07T18:05:00.000Z" };
    expect(readVisitState(JSON.stringify(state))).toEqual(state);
  });
  it("traite un contenu illisible comme une première visite", () => {
    for (const raw of [null, "", "pas du json", "{}", "[]", "null", JSON.stringify({ baseline: { at: "hier" }, latest: snap(), since: "2026-11-05T10:05:00.000Z", seenAt: "2026-11-07T18:05:00.000Z" }), JSON.stringify({ baseline: snap(), latest: snap(), since: "2026-11-05T10:05:00.000Z", seenAt: "jamais" }), JSON.stringify({ baseline: snap(), latest: snap(), seenAt: "2026-11-07T18:05:00.000Z" })]) {
      expect(readVisitState(raw)).toBeNull();
    }
  });
  it("refuse un chiffre d'un mauvais type", () => {
    expect(readVisitState(JSON.stringify({ baseline: snap({ rank: "2" as unknown as number }), latest: snap(), since: "2026-11-05T10:05:00.000Z", seenAt: "2026-11-07T18:05:00.000Z" }))).toBeNull();
  });
});

describe("nextVisitState", () => {
  const start = new Date("2026-11-05T10:05:00.000Z");
  it("à la première visite, prend les chiffres du jour pour référence : il n'y a rien à comparer", () => {
    const state = nextVisitState(null, snap(), start);
    expect(state).toEqual({ baseline: snap(), latest: snap(), since: start.toISOString(), seenAt: start.toISOString() });
    expect(visitLines(state.baseline, snap())).toEqual([]);
  });
  it("à une nouvelle visite, compare aux derniers chiffres vus", () => {
    const first = nextVisitState(null, snap(), start);
    const second = nextVisitState(first, later(), new Date(start.getTime() + VISIT_GAP_MS));
    expect(second.baseline).toEqual(snap());
    expect(second.latest).toEqual(later());
  });
  it("annonce la date de la visite, pas celle de la collecte, qui peut être plus ancienne", () => {
    const first = nextVisitState(null, snap({ at: "2026-11-01T10:00:00.000Z" }), start);
    const second = nextVisitState(first, later(), new Date(start.getTime() + VISIT_GAP_MS));
    expect(second.since).toBe(start.toISOString());
    const reload = nextVisitState(second, later(), new Date(start.getTime() + VISIT_GAP_MS + 60_000));
    expect(reload.since).toBe(start.toISOString());
  });
  it("recharger la page dans la même visite garde le résumé", () => {
    const first = nextVisitState(null, snap(), start);
    const second = nextVisitState(first, later(), new Date(start.getTime() + VISIT_GAP_MS));
    const reload = nextVisitState(second, later(), new Date(start.getTime() + VISIT_GAP_MS + 60_000));
    expect(reload.baseline).toEqual(snap());
  });
  it("la visite suivante part de ce qui a été vu la dernière fois, pas de la toute première", () => {
    const first = nextVisitState(null, snap(), start);
    const second = nextVisitState(first, later(), new Date(start.getTime() + VISIT_GAP_MS));
    const third = nextVisitState(second, later({ at: "2026-11-09T18:00:00.000Z" }), new Date("2026-11-09T18:05:00.000Z"));
    expect(third.baseline).toEqual(later());
  });
  it("une page plus ancienne, servie par un cache, ne fait pas reculer la référence", () => {
    const state = { baseline: snap(), latest: later(), since: "2026-11-05T10:05:00.000Z", seenAt: "2026-11-07T18:05:00.000Z" };
    expect(nextVisitState(state, snap(), new Date("2026-11-07T18:06:00.000Z")).latest).toEqual(later());
  });
});

describe("visitLines", () => {
  it("compte les parties et les victoires gagnées depuis", () => {
    expect(plain(visitLines(snap(), later({ games: 13042, wins: 5018 })))).toEqual(["42 parties de plus, dont 18 victoires."]);
  });
  it("accorde au singulier, et n'écrit jamais de victoires négatives", () => {
    expect(visitLines(snap(), later({ games: 13001, wins: 5000 }))).toEqual(["1 partie de plus, dont 0 victoire."]);
    expect(visitLines(snap(), later({ games: 13002, wins: 4999 }))).toEqual(["2 parties de plus, dont 0 victoire."]);
  });
  it("dit le rang des deux visites, sans dire ce qui s'est passé entre elles", () => {
    expect(plain(visitLines(snap({ rank: 3 }), later({ score: 2118.23 })))).toEqual(["Classement : 3e à votre dernière visite, 2e au dernier relevé. Score : +18,23."]);
    expect(plain(visitLines(snap(), later({ score: 2118.23 })))).toEqual(["Classement : 2e, comme à votre dernière visite. Score : +18,23."]);
    expect(plain(visitLines(snap(), later({ score: 2090 })))).toEqual(["Classement : 2e, comme à votre dernière visite. Score : −10,00."]);
  });
  it("n'écrit rien du classement si un relevé manque : pas de données n'est pas un changement", () => {
    expect(visitLines(snap({ rank: null }), later())).toEqual([]);
    expect(visitLines(snap(), later({ rank: null }))).toEqual([]);
  });
  it("écrit le territoire et sa place", () => {
    expect(plain(visitLines(snap(), later({ pixels: 121976, mapRank: 4 })))).toEqual(["Carte des clans : +25 800 pixels. Place : 5e à votre dernière visite, 4e au dernier relevé."]);
    expect(plain(visitLines(snap(), later({ pixels: 90000 })))).toEqual(["Carte des clans : −6 176 pixels. Place : 5e, comme à votre dernière visite."]);
    expect(plain(visitLines(snap({ mapRank: null }), later({ pixels: 96177 })))).toEqual(["Carte des clans : +1 pixel."]);
  });
  it("écrit le nombre de membres", () => {
    expect(visitLines(snap(), later({ members: 765 }))).toEqual(["Membres dans la liste officielle : +5, 765 en tout."]);
    expect(visitLines(snap(), later({ members: 758 }))).toEqual(["Membres dans la liste officielle : −2, 758 en tout."]);
  });
  it("ne dit rien quand rien n'a changé, ni face à une page plus ancienne", () => {
    expect(visitLines(snap(), later())).toEqual([]);
    expect(visitLines(later(), snap({ games: 12000 }))).toEqual([]);
  });
});

describe("mapAt", () => {
  it("garde la dernière image du film, et relit encore un ancien relevé qui ne l'a pas", () => {
    const now = new Date("2026-11-05T10:00:00.000Z");
    const kept = readVisitState(JSON.stringify(nextVisitState(null, snap({ mapAt: 1_762_540_000 }), now)));
    expect(kept?.latest.mapAt).toBe(1_762_540_000);
    const older = readVisitState(JSON.stringify(nextVisitState(null, snap(), now)));
    expect(older).not.toBeNull();
    expect(older?.latest.mapAt).toBeUndefined();
  });
  it("refuse une date d'image qui n'est pas un nombre", () => {
    const state = nextVisitState(null, snap(), new Date("2026-11-05T10:00:00.000Z"));
    expect(readVisitState(JSON.stringify({ ...state, latest: { ...state.latest, mapAt: "hier" } }))).toBeNull();
  });
});

describe("hasNewGazette", () => {
  it("repère une nouvelle édition", () => {
    expect(hasNewGazette(snap(), later({ gazette: "2026-11-02" }))).toBe(true);
    expect(hasNewGazette(snap(), later())).toBe(false);
    expect(hasNewGazette(snap(), later({ gazette: null }))).toBe(false);
    expect(hasNewGazette(snap({ gazette: null }), later())).toBe(true);
  });
  it("ne prend pas pour nouvelle une édition plus ancienne, ni celle d'une page plus ancienne", () => {
    expect(hasNewGazette(snap({ gazette: "2026-11-02" }), later({ gazette: "2026-10-26" }))).toBe(false);
    expect(hasNewGazette(later(), snap({ gazette: "2026-11-02" }))).toBe(false);
  });
});
