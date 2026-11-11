import { describe, expect, it } from "vitest";
import { LOGO_GLYPHES, LOGO_PLUIE_MAX, aleatoire, glyphe, logoMatrice, teinte } from "../../src/lib/logo-matrice";

describe("le logo du guerrier en mode Matrix", () => {
  it("garde le blanc, le bleu et le rouge du logo, et laisse vides le fond marine et les contours", () => {
    expect(teinte(255, 255, 255)).toBe("w");
    expect(teinte(230, 232, 240)).toBe("w");
    expect(teinte(18, 92, 222)).toBe("b");
    expect(teinte(10, 69, 180)).toBe("b");
    expect(teinte(240, 30, 50)).toBe("r");
    // Le fond du logo envoyé (#091337) et un contour sombre.
    expect(teinte(9, 19, 55)).toBeNull();
    expect(teinte(60, 74, 102)).toBeNull();
  });

  it("ne tire que des 0, des 1 et les lettres du tag, même aux bornes du tirage", () => {
    for (const r of [0, 0.5, 0.999999, 1, -1, 2]) expect(LOGO_GLYPHES).toContain(glyphe(r));
    expect(new Set([...LOGO_GLYPHES])).toEqual(new Set(["0", "1", "G", "A", "L"]));
  });

  it("donne le même logo à chaque construction", () => {
    const a = aleatoire(7);
    const b = aleatoire(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const pixels = new Uint8Array([255, 255, 255, 255, 255, 255, 9, 19, 55, 240, 30, 50]);
    expect(logoMatrice(pixels, 4, 1, 3)).toEqual(logoMatrice(pixels, 4, 1, 3));
  });

  it("regroupe les cases voisines de même teinte, rangée par rangée, et laisse un trou pour le fond", () => {
    // Rangée 0 : blanc, blanc, fond, rouge. Rangée 1 : bleu, bleu, bleu, fond.
    const pixels = new Uint8Array([
      255, 255, 255, 255, 255, 255, 9, 19, 55, 240, 30, 50,
      18, 92, 222, 18, 92, 222, 18, 92, 222, 9, 19, 55,
    ]);
    const logo = logoMatrice(pixels, 4, 2, 3);
    expect(logo.colonnes).toBe(4);
    expect(logo.lignes).toBe(2);
    expect(logo.suites.map(({ x, y, teinte: t, texte }) => ({ x, y, t, n: texte.length }))).toEqual([
      { x: 0, y: 0, t: "w", n: 2 },
      { x: 3, y: 0, t: "r", n: 1 },
      { x: 0, y: 1, t: "b", n: 3 },
    ]);
    for (const suite of logo.suites) expect([...suite.texte].every((c) => LOGO_GLYPHES.includes(c))).toBe(true);
  });

  it("donne un retard de chute à chaque colonne, entre 0 et 900 ms", () => {
    const logo = logoMatrice(new Uint8Array(4 * 4 * 4), 4, 4, 4);
    expect(logo.delais).toHaveLength(4);
    for (const d of logo.delais) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(LOGO_PLUIE_MAX);
    }
    expect(logo.suites).toEqual([]);
  });
});
