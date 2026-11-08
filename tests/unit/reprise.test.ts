import { describe, expect, it } from "vitest";
import { filmResume, framesSeen } from "../../src/lib/clanmap/reprise";

const frames = [
  { at: 100, gal: 0 },
  { at: 200, gal: 1_000 },
  { at: 300, gal: 4_000 },
  { at: 400, gal: 3_500 },
];
const since = "2026-11-07T18:30:00.000Z";

describe("framesSeen", () => {
  it("compte les images dont la date ne dépasse pas la dernière vue", () => {
    expect(framesSeen(frames, 200)).toBe(2);
    expect(framesSeen(frames, 250)).toBe(2);
    expect(framesSeen(frames, 50)).toBe(0);
    expect(framesSeen(frames, 400)).toBe(4);
  });
  it("ne sait rien d'un film sans dates", () => {
    expect(framesSeen([{ at: 100 }, {}], 200)).toBeNull();
    expect(framesSeen([], 200)).toBeNull();
  });
});

describe("filmResume", () => {
  it("reprend après la dernière image vue et dit ce que GAL a gagné depuis", () => {
    expect(filmResume(frames, 200, since)).toEqual({ start: 2, change: 2_500, caption: "Depuis votre dernière visite, le 7 nov. 2026 : +2\u00a0500 pixels." });
  });
  it("dit aussi un recul, et le singulier", () => {
    expect(filmResume(frames, 300, since)?.caption).toBe("Depuis votre dernière visite, le 7 nov. 2026 : −500 pixels.");
    expect(filmResume([{ at: 1, gal: 10 }, { at: 2, gal: 11 }], 1, since)?.caption).toBe("Depuis votre dernière visite, le 7 nov. 2026 : +1 pixel.");
    expect(filmResume([{ at: 1, gal: 10 }, { at: 2, gal: 10 }], 1, since)?.caption).toBe("Depuis votre dernière visite, le 7 nov. 2026 : même nombre de pixels.");
  });
  it("compte depuis les pixels vus : la dernière image d'un film se complète au passage suivant", () => {
    // À la visite précédente, la dernière image s'arrêtait à la date 300 avec 4 000 pixels. Depuis, elle a été
    // complétée (date 350, 4 200 pixels) et une image a suivi : compter depuis les images donnerait +2 500.
    const grown = [{ at: 100, gal: 0 }, { at: 200, gal: 1_000 }, { at: 350, gal: 4_200 }, { at: 400, gal: 3_500 }];
    expect(filmResume(grown, 300, since, 4_000)).toEqual({ start: 2, change: -500, caption: "Depuis votre dernière visite, le 7 nov. 2026 : −500 pixels." });
    expect(filmResume(grown, 300, since)?.change).toBe(2_500);
  });
  it("repart du début quand tout est nouveau", () => {
    expect(filmResume(frames, 50, since)).toEqual({ start: 0, change: 3_500, caption: "Depuis votre dernière visite, le 7 nov. 2026 : +3\u00a0500 pixels." });
  });
  it("le dit quand rien n'a changé", () => {
    expect(filmResume(frames, 400, since)).toEqual({ start: 4, change: 0, caption: "Rien de nouveau sur la carte depuis votre dernière visite, le 7 nov. 2026." });
  });
  it("ne reprend rien sans dernière visite connue, ni sur un film sans dates", () => {
    expect(filmResume(frames, null, since)).toBeNull();
    expect(filmResume(frames, undefined, since)).toBeNull();
    expect(filmResume([{ gal: 1 }, { at: 2, gal: 3 }], 1, since)).toBeNull();
  });
});
