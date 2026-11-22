import { describe, expect, it } from "vitest";
import { bourseDExemple, echelleDesRaretes, gauloisEnVedette, nombresDuJeu, rangDeRarete, STATERES_PAR_POINT, type GauloisDeLAccueil } from "../../src/lib/accueil-jeu";

const g = (id: string, rarete: string | null, victoires: number | null): GauloisDeLAccueil => ({ id, pseudo: id.toUpperCase(), rarete, victoires });

describe("l'échelle « Du commun au divin »", () => {
  it("prend, pour chaque rareté portée, le Gaulois qui a le plus de victoires, du commun au divin", () => {
    const echelle = echelleDesRaretes([g("a", "commun", 10), g("b", "divin", 3), g("c", "commun", 40), g("d", "epique", null), g("e", "legendaire", 7)]);
    expect(echelle.map((m) => [m.rarete, m.gaulois.id])).toEqual([
      ["commun", "c"],
      ["epique", "d"],
      ["legendaire", "e"],
      ["divin", "b"],
    ]);
    expect(echelle.map((m) => m.nom)).toEqual(["Commun", "Épique", "Légendaire", "Divin"]);
  });

  it("n'invente aucune marche : rien porté, rien montré", () => {
    expect(echelleDesRaretes([])).toEqual([]);
    expect(echelleDesRaretes([g("a", null, 12), g("b", "saison", 3)])).toEqual([]);
  });

  it("garde l'ordre reçu à égalité de victoires", () => {
    expect(echelleDesRaretes([g("x", "mystique", 5), g("y", "mystique", 5)])[0]?.gaulois.id).toBe("x");
  });
});

describe("les Gaulois à côté du booster", () => {
  it("montre les plus hautes raretés, puis le plus de victoires, sans doublon", () => {
    const vedettes = gauloisEnVedette([g("a", "legendaire", 100), g("b", "divin", 2), g("c", "legendaire", 300), g("d", "commun", 900)]);
    expect(vedettes.map((v) => v.id)).toEqual(["b", "c"]);
  });

  it("écarte les Gaulois sans rareté, et rend moins s'il en manque", () => {
    expect(gauloisEnVedette([g("a", null, 50), g("b", "commun", 1)]).map((v) => v.id)).toEqual(["b"]);
    expect(gauloisEnVedette([])).toEqual([]);
  });

  it("connaît le rang des raretés", () => {
    expect(rangDeRarete("commun")).toBe(0);
    expect(rangDeRarete("divin")).toBe(5);
    expect(rangDeRarete(null)).toBe(-1);
    expect(rangDeRarete("inconnue")).toBe(-1);
  });
});

describe("les nombres du jeu", () => {
  it("compte les objets à rareté qui ne sont pas donnés à tous", () => {
    const n = nombresDuJeu({
      objets: [{ rarete: "commun" }, { rarete: "commun", gratuit: true }, { rarete: null, gratuit: true }, { rarete: "divin" }, { rarete: null }],
      familiers: 100,
      uniques: 11,
      bannieres: 60,
      cadres: 1,
    });
    expect(n).toEqual([
      { cle: "objets", n: 2, mot: "objets" },
      { cle: "familiers", n: 100, mot: "familiers" },
      { cle: "uniques", n: 11, mot: "Gaulois uniques" },
      { cle: "bannieres", n: 60, mot: "bannières" },
      { cle: "cadres", n: 1, mot: "cadre" },
    ]);
  });

  it("n'écrit pas un nombre nul", () => {
    expect(nombresDuJeu({ objets: [], familiers: 0, uniques: 1, bannieres: 0, cadres: 0 })).toEqual([{ cle: "uniques", n: 1, mot: "Gaulois unique" }]);
  });
});

describe("la bourse d'exemple", () => {
  it("suit la règle de 30 statères par point", () => {
    expect(STATERES_PAR_POINT).toBe(30);
    expect(bourseDExemple(0)).toEqual({ points: 0, stateres: 0 });
    expect(bourseDExemple(0.5)).toEqual({ points: 50, stateres: 1500 });
    expect(bourseDExemple(1)).toEqual({ points: 100, stateres: 3000 });
  });

  it("reste dans ses bornes", () => {
    expect(bourseDExemple(-2)).toEqual({ points: 0, stateres: 0 });
    expect(bourseDExemple(7)).toEqual({ points: 100, stateres: 3000 });
    expect(bourseDExemple(Number.NaN)).toEqual({ points: 0, stateres: 0 });
  });
});
