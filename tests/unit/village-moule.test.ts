import { describe, expect, it } from "vitest";
import { DUREE_DE_LA_LUEUR, DUREE_DU_MOULE, TEMPS_DU_MOULE, caseDuMoule, couleEncore, doux, ouverture, rangeePleine, rangeesPleines, refroidi, remplissage } from "../../src/lib/village/moule";

// Le moule de la forge (16 novembre 2026) : les temps de l'animation. Elle ne décide de rien, elle montre l'objet reçu.

const instants = Array.from({ length: 201 }, (_, i) => i / 200);

describe("le moule de la forge", () => {
  it("dure quelques secondes, puis s'arrête : la lueur finit avant cinq secondes", () => {
    expect(DUREE_DU_MOULE).toBeGreaterThanOrEqual(4000);
    expect(DUREE_DU_MOULE).toBeLessThanOrEqual(8000);
    expect(DUREE_DE_LA_LUEUR).toBeLessThan(5000);
  });

  it("enchaîne la coulée, le refroidissement puis l'ouverture, sans qu'ils se chevauchent", () => {
    const { coulee, refroidissement, ouverture: ouvre } = TEMPS_DU_MOULE;
    expect(coulee[0]).toBeGreaterThan(0);
    expect(coulee[1]).toBeLessThanOrEqual(refroidissement[0]);
    expect(refroidissement[1]).toBeLessThanOrEqual(ouvre[0]);
    expect(ouvre[1]).toBe(1);
  });

  it("monte en douceur, sans jamais reculer", () => {
    expect(doux(2, 4, 1)).toBe(0);
    expect(doux(2, 4, 3)).toBe(0.5);
    expect(doux(2, 4, 9)).toBe(1);
    for (const f of [remplissage, ouverture]) {
      const valeurs = instants.map(f);
      expect(valeurs[0]).toBe(0);
      expect(valeurs.at(-1)).toBe(1);
      for (let i = 1; i < valeurs.length; i++) expect(valeurs[i]!).toBeGreaterThanOrEqual(valeurs[i - 1]!);
    }
  });

  it("remplit le creux du bas vers le haut, rangée par rangée", () => {
    const hauteur = 36;
    expect(rangeesPleines(0, hauteur)).toBe(0);
    expect(rangeesPleines(1, hauteur)).toBe(hauteur);
    const milieu = (TEMPS_DU_MOULE.coulee[0] + TEMPS_DU_MOULE.coulee[1]) / 2;
    expect(rangeesPleines(milieu, hauteur)).toBe(hauteur / 2);
    // À mi-coulée, la moitié du bas est pleine, celle du haut encore vide.
    expect(rangeePleine(milieu, hauteur - 1, hauteur)).toBe(true);
    expect(rangeePleine(milieu, hauteur / 2, hauteur)).toBe(true);
    expect(rangeePleine(milieu, hauteur / 2 - 1, hauteur)).toBe(false);
    expect(rangeePleine(milieu, 0, hauteur)).toBe(false);
    // Une rangée pleine le reste.
    for (let j = 0; j < hauteur; j++) {
      let vue = false;
      for (const u of instants) {
        const pleine = rangeePleine(u, j, hauteur);
        if (vue) expect(pleine, `rangée ${j} à ${u}`).toBe(true);
        vue ||= pleine;
      }
      expect(vue).toBe(true);
    }
  });

  it("ne refroidit qu'un creux plein, du haut vers le bas, et finit avant l'ouverture", () => {
    const hauteur = 20;
    for (let j = 0; j < hauteur; j++) {
      expect(refroidi(TEMPS_DU_MOULE.coulee[1], j, hauteur)).toBe(0);
      expect(refroidi(TEMPS_DU_MOULE.refroidissement[1], j, hauteur)).toBe(1);
      expect(refroidi(TEMPS_DU_MOULE.ouverture[0], j, hauteur)).toBe(1);
    }
    const milieu = (TEMPS_DU_MOULE.refroidissement[0] + TEMPS_DU_MOULE.refroidissement[1]) / 2;
    expect(refroidi(milieu, 0, hauteur)).toBeGreaterThan(refroidi(milieu, hauteur - 1, hauteur));
    // Un dessin d'une seule rangée ne divise pas par zéro.
    expect(refroidi(TEMPS_DU_MOULE.refroidissement[1], 0, 1)).toBe(1);
  });

  it("ne laisse couler le métal que pendant la coulée", () => {
    expect(couleEncore(0)).toBe(false);
    expect(couleEncore((TEMPS_DU_MOULE.coulee[0] + TEMPS_DU_MOULE.coulee[1]) / 2)).toBe(true);
    expect(couleEncore(TEMPS_DU_MOULE.coulee[1])).toBe(false);
    expect(couleEncore(1)).toBe(false);
  });

  it("garde l'objet entier dans la toile, en cases entières", () => {
    for (const [W, H] of [[320, 267], [560, 467], [1400, 1167]] as const) {
      for (const dessin of [{ largeur: 10, hauteur: 36 }, { largeur: 34, hauteur: 12 }, { largeur: 48, hauteur: 64 }, { largeur: 1, hauteur: 1 }]) {
        const k = caseDuMoule(W, H, dessin);
        expect(Number.isInteger(k)).toBe(true);
        expect(k).toBeGreaterThanOrEqual(1);
        expect(dessin.largeur * k).toBeLessThanOrEqual(Math.max(dessin.largeur, W * 0.5));
        expect(dessin.hauteur * k).toBeLessThanOrEqual(Math.max(dessin.hauteur, H * 0.66));
      }
    }
    expect(caseDuMoule(300, 200, { largeur: 0, hauteur: 0 })).toBe(1);
  });
});
