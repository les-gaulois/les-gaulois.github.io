import { describe, expect, it } from "vitest";
import { ICONES_PARTIES, ICONE_COTE, ICONE_DEMI, ICONE_PLEIN, ICONE_VIDE, traceIcone, tracePixels, type IconePartieNom } from "../../src/lib/icones-parties";

const noms = Object.keys(ICONES_PARTIES) as IconePartieNom[];

/** Le nombre de cases d'une teinte dans une grille. */
const cases = (lignes: readonly string[], teinte: string) => lignes.join("").split(teinte).length - 1;

/** La surface d'un tracé, en cases : chaque rectangle fait une case de haut, sa largeur suit le « h » de son départ. */
const surface = (trace: string) => [...trace.matchAll(/M\d+ \d+h(\d+)v1h-\d+z/g)].reduce((somme, [, largeur]) => somme + Number(largeur), 0);

describe("les icônes des parties", () => {
  it("chaque icône tient dans la grille, avec les trois seules teintes", () => {
    expect(noms.length).toBeGreaterThan(0);
    for (const nom of noms) {
      const lignes = ICONES_PARTIES[nom];
      expect(lignes, nom).toHaveLength(ICONE_COTE);
      for (const ligne of lignes) {
        expect(ligne, nom).toHaveLength(ICONE_COTE);
        expect([...ligne].every((c) => c === ICONE_PLEIN || c === ICONE_DEMI || c === ICONE_VIDE), `${nom} : ${ligne}`).toBe(true);
      }
    }
  });

  it("chaque icône est un vrai dessin, et aucune ne ressemble trait pour trait à une autre", () => {
    for (const nom of noms) {
      // Un dessin se lit à ses cases pleines : la demi-teinte ne fait que le détail.
      expect(cases(ICONES_PARTIES[nom], ICONE_PLEIN), nom).toBeGreaterThanOrEqual(20);
    }
    const dessins = noms.map((nom) => ICONES_PARTIES[nom].join("\n"));
    expect(new Set(dessins).size).toBe(noms.length);
  });

  it("une suite de cases voisines fait un seul rectangle", () => {
    expect(tracePixels(["#"], "#")).toBe("M0 0h1v1h-1z");
    expect(tracePixels([".###."], "#")).toBe("M1 0h3v1h-3z");
    // Deux suites sur la même ligne, puis une ligne plus bas.
    expect(tracePixels(["##.#", "...#"], "#")).toBe("M0 0h2v1h-2zM3 0h1v1h-1zM3 1h1v1h-1z");
  });

  it("le tracé d'une teinte ignore les autres, et reste vide sans case de cette teinte", () => {
    expect(tracePixels(["#+#", "+.+"], "+")).toBe("M1 0h1v1h-1zM0 1h1v1h-1zM2 1h1v1h-1z");
    expect(tracePixels(["#.#"], "+")).toBe("");
    expect(tracePixels([], "#")).toBe("");
  });

  it("le tracé de chaque icône couvre exactement ses cases, pleines et en demi-teinte", () => {
    for (const nom of noms) {
      const lignes = ICONES_PARTIES[nom];
      const { plein, demi } = traceIcone(nom);
      expect(surface(plein), nom).toBe(cases(lignes, ICONE_PLEIN));
      expect(surface(demi), nom).toBe(cases(lignes, ICONE_DEMI));
      // Rien ne sort de la grille.
      for (const [, x, y, largeur] of `${plein}${demi}`.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
        expect(Number(x) + Number(largeur), nom).toBeLessThanOrEqual(ICONE_COTE);
        expect(Number(y), nom).toBeLessThan(ICONE_COTE);
      }
    }
  });
});
