import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COULEUR_GAULOIS } from "../../src/lib/carte-dessin";
import { assombrir, avecIcone, coteDeConstruction, couleurDeSprite, couleursDeConstruction, sommetsDeForme, tailleDuNom } from "../../src/lib/rejeu/details";

const proche = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);

describe("les constructions, dessinées comme le jeu", () => {
  it("assombrit la couleur du camp en gardant sa teinte, et grise un chantier", () => {
    expect(assombrir([200, 100, 50], 0.5)).toEqual([100, 50, 25]);
    const { fond, bord } = couleursDeConstruction(COULEUR_GAULOIS, false);
    expect(fond).toEqual(assombrir(COULEUR_GAULOIS, 0.65));
    expect(bord).toEqual(assombrir(COULEUR_GAULOIS, 0.1));
    expect(couleursDeConstruction(COULEUR_GAULOIS, true)).toEqual({ fond: [198, 198, 198], bord: [127, 127, 127] });
  });
  it("donne à chaque construction la forme du jeu : cercle, pentagone et triangle pointe en haut, carré droit", () => {
    expect(sommetsDeForme(0, 0, 0, 10)).toEqual([]);
    const pentagone = sommetsDeForme(1, 0, 0, 10);
    expect(pentagone).toHaveLength(5);
    // Un sommet tout en haut (y vers le bas sur l'écran).
    expect(pentagone.some(([x, y]) => proche([x, y], [0, -10]))).toBe(true);
    expect(sommetsDeForme(2, 0, 0, 10)).toHaveLength(6);
    expect(sommetsDeForme(3, 0, 0, 10)).toHaveLength(8);
    // Le carré a ses côtés droits : ses sommets sur les diagonales.
    for (const [x, y] of sommetsDeForme(4, 0, 0, 10)) expect(Math.abs(Math.abs(x) - Math.abs(y))).toBeLessThan(1e-9);
    const triangle = sommetsDeForme(5, 0, 0, 10);
    expect(triangle.some(([x, y]) => proche([x, y], [0, -10]))).toBe(true);
    expect(sommetsDeForme(6, 0, 0, 10)).toEqual([]);
  });
});

describe("les unités, colorées comme le jeu", () => {
  it("colore chaque pixel du sprite selon son gris : centre au camp, bord au bord, entre-deux mêlé", () => {
    const territoire = [0, 100, 200] as const;
    const bord = [0, 0, 0] as const;
    expect(couleurDeSprite(255, territoire, bord)).toEqual(territoire);
    expect(couleurDeSprite(130, territoire, bord)).toEqual([0, 50, 100]);
    expect(couleurDeSprite(100, territoire, bord)).toEqual(territoire);
    expect(couleurDeSprite(40, territoire, bord)).toEqual(bord);
  });
  it("prend les planches telles que le jeu les publie, avec leur notice de licence", () => {
    const largeur = (f: string) => readFileSync(f).readUInt32BE(16);
    const hauteur = (f: string) => readFileSync(f).readUInt32BE(20);
    // Six constructions en cases de 64 pixels, douze unités en cases de 13 (StructurePass.ts, UnitPass.ts).
    expect([largeur("public/openfront/icon-atlas.png"), hauteur("public/openfront/icon-atlas.png")]).toEqual([384, 64]);
    expect([largeur("public/openfront/unit-atlas.png"), hauteur("public/openfront/unit-atlas.png")]).toEqual([156, 13]);
    const notice = readFileSync("public/openfront/LISEZ-MOI.txt", "utf8");
    expect(notice).toContain("© OpenFront and Contributors");
    expect(notice).toContain("CC BY-SA 4.0");
    expect(notice).toContain("resources/atlases/icon-atlas.png");
  });
});

describe("les tailles sur une carte vue en entier", () => {
  it("garde les constructions petites sur un téléphone et leur donne leur icône sur un écran d'ordinateur", () => {
    // Une carte du monde de 2 000 cases : 310 px sur un téléphone, 985 px à 1 280, 1 510 px à 1 920.
    expect(coteDeConstruction(310 / 2000)).toBe(5);
    expect(avecIcone(coteDeConstruction(310 / 2000))).toBe(false);
    expect(avecIcone(coteDeConstruction(985 / 2000))).toBe(true);
    expect(coteDeConstruction(1510 / 2000)).toBeCloseTo(21.14, 2);
    expect(coteDeConstruction(10)).toBe(22);
  });
  it("écrit un nom entre 10,5 et 28 pixels, et pas du tout sans la place", () => {
    expect(tailleDuNom(7)).toBeNull();
    expect(tailleDuNom(8)).toBe(10.5);
    expect(tailleDuNom(18)).toBe(18);
    expect(tailleDuNom(60)).toBe(28);
  });
});
