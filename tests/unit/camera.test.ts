import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMoments } from "../../src/lib/clanmap/moments";
import { CAMERA_SMOOTH_MS, FILM_MS, SHOT_SPACING_MS, damp, moveCamera, pickShots, placeCamera, type Camera } from "../../src/lib/fx/camera";

/** Suit une valeur de 0 à 100 pendant `ms` millisecondes, par pas de 16 ms. */
const run = (ms: number, smoothMs = CAMERA_SMOOTH_MS) => {
  let value = 0;
  let velocity = 0;
  for (let t = 0; t < ms; t += 16) [value, velocity] = damp(value, 100, velocity, smoothMs, 16);
  return value;
};

describe("damp", () => {
  it("démarre en douceur : presque rien au premier dixième de seconde", () => {
    expect(run(100)).toBeLessThan(5);
  });
  it("arrive en deux secondes environ, sans à-coup ni dépassement", () => {
    expect(run(1000)).toBeLessThan(75);
    expect(run(2000)).toBeGreaterThan(85);
    let value = 0;
    let velocity = 0;
    let previous = 0;
    for (let t = 0; t < 6000; t += 16) {
      [value, velocity] = damp(value, 100, velocity, CAMERA_SMOOTH_MS, 16);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(100);
      previous = value;
    }
    expect(value).toBeGreaterThan(99.9);
  });
  it("ne bouge pas sans temps écoulé", () => {
    expect(damp(3, 10, 0.5, CAMERA_SMOOTH_MS, 0)).toEqual([3, 0.5]);
  });
  it("ne repasse jamais la cible quand elle change en route", () => {
    let value = 0;
    let velocity = 0;
    for (let t = 0; t < 600; t += 16) [value, velocity] = damp(value, 100, velocity, CAMERA_SMOOTH_MS, 16);
    for (let t = 0; t < 3000; t += 16) {
      [value, velocity] = damp(value, 20, velocity, CAMERA_SMOOTH_MS, 16);
      expect(value).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("moveCamera", () => {
  const camera = (): Camera => ({ x: 500, y: 300, s: 1, vx: 0, vy: 0, vz: 0 });

  it("zoome sur le logarithme : à mi-chemin de × 1 à × 4, la caméra est près de × 2", () => {
    const cam = camera();
    const target = { x: 500, y: 300, s: 4 };
    let halfway = 0;
    for (let t = 0; t < 5000; t += 16) {
      moveCamera(cam, target, 16, CAMERA_SMOOTH_MS);
      if (!halfway && cam.x === 500 && Math.log(cam.s) >= Math.log(4) / 2) halfway = cam.s;
    }
    expect(halfway).toBeGreaterThan(1.95);
    expect(halfway).toBeLessThan(2.1);
  });

  it("se pose exactement sur la cible, puis ne bouge plus", () => {
    const cam = camera();
    const target = { x: 800, y: 200, s: 2 };
    let moving = true;
    let steps = 0;
    while (moving && steps < 2000) {
      moving = moveCamera(cam, target, 16, CAMERA_SMOOTH_MS);
      steps++;
    }
    expect(moving).toBe(false);
    expect([cam.x, cam.y, cam.s]).toEqual([800, 200, 2]);
    expect(moveCamera(cam, target, 16, CAMERA_SMOOTH_MS)).toBe(false);
    // Deux secondes ne suffisent pas à tout finir, mais aucun mouvement ne dure plus de dix secondes.
    expect(steps * 16).toBeGreaterThan(2000);
    expect(steps * 16).toBeLessThan(10_000);
  });

  it("placeCamera pose la caméra sans vitesse", () => {
    const cam = { ...camera(), vx: 3, vy: 2, vz: 1 };
    placeCamera(cam, { x: 1, y: 2, s: 3 });
    expect(cam).toEqual({ x: 1, y: 2, s: 3, vx: 0, vy: 0, vz: 0 });
  });
});

describe("pickShots", () => {
  const frameMs = 100;
  it("garde les moments importants, jamais deux plans à moins de l'écart minimal", () => {
    const moments = [
      { frame: 10, kind: "first" as const },
      { frame: 40, kind: "threshold" as const },
      { frame: 90, kind: "push" as const },
      { frame: 120, kind: "rank" as const },
      { frame: 400, kind: "threshold" as const },
      { frame: 405, kind: "now" as const },
    ];
    const shots = [...pickShots(moments, frameMs, 5_000)].sort((a, b) => a - b);
    // Le palier de l'image 40 tombe trop près du premier pixel, et la poussée trop près de la meilleure place, plus importante.
    expect(shots).toEqual([10, 120, 400]);
  });
  it("ne filme jamais de près le dernier relevé", () => {
    expect(pickShots([{ frame: 5, kind: "now" }], frameMs).size).toBe(0);
  });
  it("sur le vrai film, au plus un plan rapproché toutes les quatorze secondes", () => {
    const film = JSON.parse(readFileSync("data/clanmap/film.json", "utf8"));
    const frameMs = FILM_MS / film.frames.length;
    const shots = [...pickShots(findMoments(film.frames), frameMs)].sort((a, b) => a - b);
    expect(shots.length).toBeLessThanOrEqual(Math.floor(FILM_MS / SHOT_SPACING_MS) + 1);
    for (let i = 1; i < shots.length; i++) expect((shots[i]! - shots[i - 1]!) * frameMs).toBeGreaterThanOrEqual(SHOT_SPACING_MS);
  });
});
