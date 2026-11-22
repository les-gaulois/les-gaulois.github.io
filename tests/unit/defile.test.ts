import { describe, expect, it } from "vitest";
import { SEUIL_DU_GESTE, ancreDe, ancresDuDefile, arretDuGlissement, echelleDansLeDefile, pasDuRessort, placeDansLeDefile, posDuGlissement, sensDuGeste, toucheDuDefile, trierParRarete } from "../../src/lib/village/defile";

// Le défilé des cartes (22 novembre 2026), à la place du livre des bannières : les places, le ressort, le geste, le clavier.

describe("le défilé des cartes", () => {
  it("trie par rareté, de la plus courante à la plus rare, en gardant l'ordre reçu à rareté égale", () => {
    const ordre = ["commun", "epique", "legendaire"];
    const choses = [
      { id: "a", rarete: "legendaire" },
      { id: "b", rarete: "commun" },
      { id: "c", rarete: "inconnue" },
      { id: "d", rarete: "commun" },
      { id: "e", rarete: "epique" },
    ];
    expect(trierParRarete(choses, ordre).map((c) => c.id)).toEqual(["b", "d", "e", "a", "c"]);
    expect(choses[0]!.id).toBe("a");
  });

  it("la carte du milieu en grand, ses voisines aux trois quarts, les suivantes à la moitié", () => {
    expect([0, 0.5, 1, 1.5, 2, 3, 7].map(echelleDansLeDefile)).toEqual([1, 0.875, 0.75, 0.625, 0.5, 0.5, 0.5]);
    expect(echelleDansLeDefile(-1)).toBe(0.75);
  });

  it("les ancres s'écartent de la moitié de deux cartes voisines et de l'écart", () => {
    const ancres = ancresDuDefile(200, 16, 4);
    expect(ancres.slice(0, 4)).toEqual([0, 100 + 16 + 75, 191 + 75 + 16 + 50, 332 + 50 + 16 + 50]);
    expect(ancres).toHaveLength(6);
    expect(ancreDe(ancres, 0.5)).toBeCloseTo(95.5);
    expect(ancreDe(ancres, 1)).toBe(191);
  });

  it("au repos, la carte du milieu est centrée sur un pixel entier ; loin, elle pâlit, hors de la bande, elle se cache", () => {
    const m = { largeur: 200, hauteur: 300, marge: 30, bande: 801, ancres: ancresDuDefile(200, 16, 10) };
    const milieu = placeDansLeDefile(3, 3, m, true);
    expect(milieu).toEqual({ x: 301, y: 30, echelle: 1, z: 200, opacite: 1, cachee: false });
    const voisine = placeDansLeDefile(4, 3, m, true);
    expect(voisine.echelle).toBe(0.75);
    expect(voisine.x).toBe(Math.round(400.5 + 191 - 75));
    expect(voisine.z).toBeLessThan(milieu.z);
    expect(placeDansLeDefile(6, 3, m, true).opacite).toBeLessThan(1);
    expect(placeDansLeDefile(9, 3, m, true).cachee).toBe(true);
    // En mouvement, la place n'est pas arrondie.
    expect(Number.isInteger(placeDansLeDefile(3, 2.7, m, false).x)).toBe(false);
  });

  it("le ressort amène la bande sur sa carte sans la dépasser, puis la pose", () => {
    let etat = { pos: 0, vitesse: 0, posee: false };
    let plusLoin = 0;
    for (let k = 0; k < 200 && !etat.posee; k++) {
      etat = pasDuRessort(etat.pos, etat.vitesse, 2, 1 / 60);
      plusLoin = Math.max(plusLoin, etat.pos);
    }
    expect(etat).toEqual({ pos: 2, vitesse: 0, posee: true });
    expect(plusLoin).toBeLessThanOrEqual(2.0015);
  });

  it("le clavier : flèches d'une carte, pages de trois, Début et Fin, toujours dans la liste", () => {
    expect(toucheDuDefile("ArrowRight", 2, 5)).toBe(3);
    expect(toucheDuDefile("ArrowLeft", 0, 5)).toBe(0);
    expect(toucheDuDefile("PageDown", 3, 5)).toBe(4);
    expect(toucheDuDefile("PageUp", 4, 5)).toBe(1);
    expect(toucheDuDefile("Home", 3, 5)).toBe(0);
    expect(toucheDuDefile("End", 0, 5)).toBe(4);
    expect(toucheDuDefile("Enter", 0, 5)).toBeNull();
    expect(toucheDuDefile("ArrowRight", 0, 0)).toBeNull();
  });

  it("le geste : assez loin pour changer de carte, la bande qui résiste aux bouts, l'élan de trois cartes au plus", () => {
    expect(sensDuGeste(-SEUIL_DU_GESTE - 1)).toBe(1);
    expect(sensDuGeste(SEUIL_DU_GESTE + 1)).toBe(-1);
    expect(sensDuGeste(SEUIL_DU_GESTE)).toBe(0);
    expect(sensDuGeste(Number.NaN)).toBe(0);
    expect(posDuGlissement(2, -100, 200, 5)).toBe(2.5);
    expect(posDuGlissement(0, 300, 200, 5)).toBe(-0.5);
    expect(posDuGlissement(4, -600, 200, 5)).toBe(5);
    expect(arretDuGlissement(2.2, 0, 200, 5)).toBe(2);
    expect(arretDuGlissement(2.2, -5, 200, 10)).toBe(5);
    expect(arretDuGlissement(2.2, -50, 200, 10)).toBe(5);
    expect(arretDuGlissement(3, 50, 200, 10)).toBe(0);
    expect(arretDuGlissement(8, -50, 200, 10)).toBe(9);
  });
});
