import { describe, expect, it } from "vitest";
import { WAVE_MAX_REACH, coverWave, makeGrid, planWave, tileNoise } from "../../src/lib/fx/territory";

const grid = makeGrid(1280, 720, 28);

describe("makeGrid", () => {
  it("couvre toute la surface", () => {
    expect(grid).toEqual({ cols: 46, rows: 26, size: 28 });
  });
  it("garde au moins une case", () => {
    expect(makeGrid(0, 0, 28)).toEqual({ cols: 1, rows: 1, size: 28 });
  });
});

describe("tileNoise", () => {
  it("reste entre 0 et 1", () => {
    for (let i = 0; i < 500; i++) {
      const n = tileNoise(i, i * 3, i * 7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
  it("est déterministe et varie selon la case", () => {
    expect(tileNoise(3, 4, 5)).toBe(tileNoise(3, 4, 5));
    expect(tileNoise(3, 4, 5)).not.toBe(tileNoise(4, 4, 5));
  });
});

describe("planWave", () => {
  it("donne les cases de la plus proche à la plus lointaine dans le temps", () => {
    const wave = planWave(grid, 640, 360, 300, 700, 1);
    expect(wave.length).toBeGreaterThan(100);
    for (let i = 1; i < wave.length; i++) {
      expect(wave[i]!.at).toBeGreaterThanOrEqual(wave[i - 1]!.at);
    }
  });
  it("part du point cliqué", () => {
    const first = planWave(grid, 640, 360, 300, 700, 1)[0]!;
    expect(first.at).toBeLessThan(0.05);
    expect(first.index % grid.cols).toBe(Math.floor(640 / 28));
  });
  it("ne dépasse jamais sa portée maximale", () => {
    for (const a of planWave(grid, 640, 360, 200, 700, 3)) {
      const col = a.index % grid.cols;
      const row = Math.floor(a.index / grid.cols);
      const distance = Math.hypot((col + 0.5) * 28 - 640, (row + 0.5) * 28 - 360);
      expect(distance).toBeLessThanOrEqual(200 * WAVE_MAX_REACH);
    }
  });
  it("reste dans la grille près d'un bord", () => {
    const total = grid.cols * grid.rows;
    for (const a of planWave(grid, 0, 0, 300, 700, 2)) {
      expect(a.index).toBeGreaterThanOrEqual(0);
      expect(a.index).toBeLessThan(total);
    }
  });
  it("ne touche aucune case deux fois", () => {
    const wave = planWave(grid, 640, 360, 300, 700, 4);
    expect(new Set(wave.map((a) => a.index)).size).toBe(wave.length);
  });
  it("dessine une forme différente selon la graine", () => {
    const shape = (seed: number) => planWave(grid, 640, 360, 300, 700, seed).map((a) => a.index).sort();
    expect(shape(1)).not.toEqual(shape(2));
  });
  it("va plus vite si la vitesse augmente", () => {
    const slowest = (speed: number) => planWave(grid, 640, 360, 300, speed, 1).at(-1)!.at;
    expect(slowest(1400)).toBeCloseTo(slowest(700) / 2, 6);
  });
});

describe("coverWave", () => {
  // Un bloc entièrement révélé est la condition pour ne jamais masquer de contenu.
  it.each([
    ["depuis un coin", 0, 0],
    ["depuis le centre", 640, 360],
    ["depuis le bord opposé", 1280, 720],
    ["depuis l'extérieur", 1500, -200],
  ])("couvre toutes les cases une seule fois %s", (_label, x, y) => {
    for (let seed = 0; seed < 20; seed++) {
      const wave = coverWave(grid, x, y, 0.8, seed);
      expect(wave).toHaveLength(grid.cols * grid.rows);
      expect(new Set(wave.map((a) => a.index)).size).toBe(wave.length);
    }
  });
  it("tient dans la durée demandée", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(coverWave(grid, 0, 720, 0.8, seed).at(-1)!.at).toBeLessThanOrEqual(0.8);
    }
  });
  it("couvre aussi un très petit bloc", () => {
    const tiny = makeGrid(10, 10, 32);
    expect(coverWave(tiny, 5, 5, 0.5, 1)).toHaveLength(1);
  });
});
