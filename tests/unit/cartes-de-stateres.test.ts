import { describe, expect, it } from "vitest";
import { LOTS_DESSINES, motsDeLaCarteDeStateres, nombreEnCases, rangDeStateres, type RangDeStateres } from "../../src/lib/jeu/cartes-de-stateres";

// Les cartes de statères : les noms choisis pour le pilote, qui l'a laissé choisir ; la somme et la part viennent du serveur.

const RANGS: readonly RangDeStateres[] = [0, 1, 2, 3, 4, 5, 6];

describe("les cartes des statères", () => {
  it("les noms des lots, du plus petit au trésor, et la carte des statères rendus", () => {
    expect(RANGS.map((r) => LOTS_DESSINES[r].nom)).toEqual(["Statères rendus", "Quelques pièces", "La petite pile", "La bourse", "Le coffret", "Le grand coffre", "Le trésor"]);
  });

  it("un rang lu est ramené de 0 à 6", () => {
    expect(rangDeStateres(-3)).toBe(0);
    expect(rangDeStateres(3)).toBe(3);
    expect(rangDeStateres(9)).toBe(6);
  });

  it("les sommes s'écrivent groupées par milliers", () => {
    expect(nombreEnCases(60)).toBe("60");
    expect(nombreEnCases(13100)).toBe("13 100");
  });

  it("la carte se lit d'un seul nom, avec la somme, la part et le nombre de lots du serveur", () => {
    expect(motsDeLaCarteDeStateres(0, 640, 40, 6)).toBe("640 statères rendus, 40 % du prix");
    expect(motsDeLaCarteDeStateres(0, 1, null, 6)).toBe("1 statère rendu");
    expect(motsDeLaCarteDeStateres(3, 400, null, 6)).toBe("La bourse : 400 statères, lot 3 sur 6");
    expect(motsDeLaCarteDeStateres(5, 3000, null, 5)).toBe(`Le grand coffre : 3${String.fromCharCode(0x202f)}000 statères, lot 5 sur 5`);
  });
});
