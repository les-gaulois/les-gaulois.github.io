import { describe, expect, it } from "vitest";
import { HAUTEUR_DE_LA_BANDE, LARGEUR_DE_LA_BANDE, casesDeLaBanniereDuClan } from "../../src/lib/banniere-clan";

// La bannière du clan : le fond de la ligne [GAL] du classement des clans.

describe("la bannière du clan", () => {
  const cases = casesDeLaBanniereDuClan();
  const lire = (x: number, y: number) => cases[y * LARGEUR_DE_LA_BANDE + x];

  it("remplit toute la bande de couleurs écrites « #rrggbb »", () => {
    expect(cases).toHaveLength(LARGEUR_DE_LA_BANDE * HAUTEUR_DE_LA_BANDE);
    expect(cases.every((couleur) => /^#[0-9a-f]{6}$/.test(couleur))).toBe(true);
  });

  it("est la même à chaque dessin", () => {
    expect(casesDeLaBanniereDuClan()).toEqual(cases);
  });

  it("montre la lune dans le ciel et les voiles bleues et rouges des navires", () => {
    expect(lire(60, 4)).toBe("#f6f3da");
    expect(cases).toContain("#0b5fff");
    expect(cases).toContain("#d91228");
  });

  it("garde un ciel et une mer sombres, pour l'écriture claire de la ligne", () => {
    const clair = (couleur: string) => parseInt(couleur.slice(1, 3), 16) + parseInt(couleur.slice(3, 5), 16) + parseInt(couleur.slice(5, 7), 16) > 600;
    expect(cases.filter(clair).length / cases.length).toBeLessThan(0.1);
  });
});
