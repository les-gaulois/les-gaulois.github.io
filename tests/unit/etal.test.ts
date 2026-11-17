import { describe, expect, it } from "vitest";
import { POCHETTES_GAGNEES } from "../../src/lib/village/contrat";
import { NOMS_ENTIERS, NOMS_SUR_L_ETAL, POCHETTES_DE_L_ETAL, motsDesGagnees, pochetteDOuverture } from "../../src/lib/village/etal";

// L'étal des pochettes : ce qu'il range, ce qu'il ouvre à l'arrivée, ce qu'il écrit sur une étiquette.

describe("l'étal des pochettes", () => {
  it("porte toutes les pochettes que la loterie peut faire gagner, chacune une fois, avec ses deux noms", () => {
    expect([...POCHETTES_DE_L_ETAL].sort()).toEqual([...POCHETTES_GAGNEES].sort());
    expect(new Set(POCHETTES_DE_L_ETAL).size).toBe(POCHETTES_DE_L_ETAL.length);
    for (const id of POCHETTES_DE_L_ETAL) {
      expect(NOMS_SUR_L_ETAL[id].length).toBeGreaterThan(0);
      // L'étiquette tient sous une pochette sur un téléphone de 360 px.
      expect(NOMS_SUR_L_ETAL[id].length).toBeLessThanOrEqual(9);
      expect(NOMS_ENTIERS[id]).toMatch(/^La pochette /);
    }
  });

  it("ouvre la pochette surprise, ou la première gagnée à la loterie qui reste à ouvrir", () => {
    expect(pochetteDOuverture({})).toBe("surprise");
    expect(pochetteDOuverture({ familiers: 0 })).toBe("surprise");
    expect(pochetteDOuverture({ bannieres: 1 })).toBe("bannieres");
    expect(pochetteDOuverture({ modeles: 1, familiers: 2 })).toBe("familiers");
  });

  it("écrit les pochettes gagnées en mots, et rien sans aucune", () => {
    expect(motsDesGagnees(undefined)).toBeNull();
    expect(motsDesGagnees(0)).toBeNull();
    expect(motsDesGagnees(1)).toBe("1 gagnée");
    expect(motsDesGagnees(3)).toBe("3 gagnées");
  });
});
