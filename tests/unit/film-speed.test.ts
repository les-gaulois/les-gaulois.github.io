import { describe, expect, it } from "vitest";
import { filmSpeed, SPEED_MAX, SPEED_MIN, SPEED_STEP, speedLabel, speedText } from "../../src/lib/fx/speed";

describe("vitesse du film de la carte", () => {
  it("va de × 0,1 à × 1, par pas de 0,1 : jamais plus vite que × 1", () => {
    expect([SPEED_MIN, SPEED_MAX, SPEED_STEP]).toEqual([0.1, 1, 0.1]);
    expect(filmSpeed(2)).toBe(1);
    expect(filmSpeed(4)).toBe(1);
    expect(filmSpeed(0)).toBe(0.1);
    expect(filmSpeed(-3)).toBe(0.1);
  });

  it("garde les valeurs du curseur sur sa graduation", () => {
    expect(filmSpeed(0.30000000000000004)).toBe(0.3);
    expect(filmSpeed(0.7000000000000001)).toBe(0.7);
    expect(filmSpeed(0.54)).toBe(0.5);
    for (let tenths = 1; tenths <= 10; tenths++) expect(filmSpeed(tenths / 10)).toBe(tenths / 10);
  });

  it("revient à la vitesse normale si la valeur n'est pas un nombre", () => {
    expect(filmSpeed(Number.NaN)).toBe(1);
    expect(filmSpeed(Number("abc"))).toBe(1);
    expect(filmSpeed(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("écrit la vitesse à la française, pour les yeux et pour les lecteurs d'écran", () => {
    expect(speedLabel(1)).toBe("× 1,0");
    expect(speedLabel(0.1)).toBe("× 0,1");
    expect(speedText(1)).toBe("vitesse normale");
    expect(speedText(0.5)).toBe("0,5 fois la vitesse normale");
  });
});
