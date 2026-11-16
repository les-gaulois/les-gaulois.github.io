import { describe, expect, it } from "vitest";
import { CASES_PAR_PAGE, DECOR_GAUCHE, DECOR_LARGEUR, SEUIL_DU_GESTE, casesDuLivre, pageDeLaCase, pageVoisine, pagesDuLivre, sensDuGeste, volVersLeDecor } from "../../src/lib/village/livre-bannieres";

describe("le livre des bannières", () => {
  it("met le décor du lieu en première case, puis les bannières dans l'ordre reçu", () => {
    expect(casesDuLivre([])).toEqual([null]);
    expect(casesDuLivre(["b", "a"])).toEqual([null, "b", "a"]);
  });

  it("range les cases en pages de huit, avec toujours une page", () => {
    expect(CASES_PAR_PAGE).toBe(8);
    expect(pagesDuLivre([])).toEqual([[]]);
    const cases = casesDuLivre(Array.from({ length: 20 }, (_, i) => `b${i}`));
    const pages = pagesDuLivre(cases);
    expect(pages.map((p) => p.length)).toEqual([8, 8, 5]);
    expect(pages.flat()).toEqual(cases);
  });

  it("retrouve la page d'une case, et la première pour une case absente", () => {
    const cases = casesDuLivre(Array.from({ length: 20 }, (_, i) => `b${i}`));
    expect(pageDeLaCase(cases, null)).toBe(0);
    expect(pageDeLaCase(cases, "b6")).toBe(0);
    expect(pageDeLaCase(cases, "b7")).toBe(1);
    expect(pageDeLaCase(cases, "b19")).toBe(2);
    expect(pageDeLaCase(cases, "inconnue")).toBe(0);
  });

  it("tourne les pages en rond", () => {
    expect(pageVoisine(0, 1, 3)).toBe(1);
    expect(pageVoisine(2, 1, 3)).toBe(0);
    expect(pageVoisine(0, -1, 3)).toBe(2);
    expect(pageVoisine(0, 1, 1)).toBe(0);
    expect(pageVoisine(0, 1, 0)).toBe(0);
  });

  it("ne tourne la page que si elle est glissée assez loin", () => {
    expect(sensDuGeste(0)).toBe(0);
    expect(sensDuGeste(SEUIL_DU_GESTE)).toBe(0);
    expect(sensDuGeste(-SEUIL_DU_GESTE)).toBe(0);
    expect(sensDuGeste(-SEUIL_DU_GESTE - 1)).toBe(1);
    expect(sensDuGeste(SEUIL_DU_GESTE + 1)).toBe(-1);
    expect(sensDuGeste(Number.NaN)).toBe(0);
  });

  it("mène la vignette à la place du décor couché, le pied au pli", () => {
    const vol = volVersLeDecor({ largeur: 1000, hauteur: 800 }, { x: 100, y: 500, largeur: 165 });
    expect(vol).not.toBeNull();
    const largeur = 1000 * DECOR_LARGEUR;
    expect(vol?.echelle).toBeCloseTo(largeur / 165);
    expect(vol?.dx).toBeCloseTo(1000 * DECOR_GAUCHE - 100);
    // Le bas de la vignette arrivée touche le pli, au milieu de la hauteur.
    expect(500 + (vol?.dy ?? 0) + (largeur * 80) / 124).toBeCloseTo(400);
  });

  it("ne calcule aucun vol sans mesure", () => {
    expect(volVersLeDecor({ largeur: 0, hauteur: 800 }, { x: 0, y: 0, largeur: 100 })).toBeNull();
    expect(volVersLeDecor({ largeur: 1000, hauteur: 800 }, { x: 0, y: 0, largeur: 0 })).toBeNull();
  });
});
