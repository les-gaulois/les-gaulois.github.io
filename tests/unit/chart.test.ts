import { describe, expect, it } from "vitest";
import { countAxis } from "../../src/lib/chart";

describe("countAxis", () => {
  it("donne des graduations rondes et entières qui couvrent la plus grande valeur", () => {
    expect(countAxis(112)).toEqual({ max: 150, ticks: [150, 100, 50, 0] });
    expect(countAxis(90)).toEqual({ max: 100, ticks: [100, 50, 0] });
    expect(countAxis(37)).toEqual({ max: 40, ticks: [40, 20, 0] });
    expect(countAxis(5)).toEqual({ max: 6, ticks: [6, 4, 2, 0] });
    expect(countAxis(1)).toEqual({ max: 1, ticks: [1, 0] });
  });

  it("garde un pas d'au moins 1 : on ne compte pas des moitiés de partie", () => {
    for (const largest of [1, 2, 3, 4, 7, 13, 250, 999, 4321]) {
      const { max, ticks } = countAxis(largest);
      expect(max).toBeGreaterThanOrEqual(largest);
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(ticks.at(-1)).toBe(0);
      expect(ticks[0]).toBe(max);
      // Trois intervalles environ : ni un seul trait, ni une échelle surchargée.
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });

  it("sans valeur, l'axe va de 0 à 1 au lieu de diviser par zéro", () => {
    expect(countAxis(0)).toEqual({ max: 1, ticks: [1, 0] });
    expect(countAxis(Number.NaN)).toEqual({ max: 1, ticks: [1, 0] });
  });
});
