import { describe, expect, it } from "vitest";
import { MODULE_DE_LA_GRAINE, NIVEAUX, camp, cartesDeLaMain, choisir, choisirAuNiveau, estUneGraine, expDuDuel, hasardDeLaGraine, libres, manche, valeurDuCoup } from "../../supabase/functions/code-discord/duel/index";

const MAIN = cartesDeLaMain({ arme: "epee", tete: "casque", haut: "cotte-mailles", pieds: "sandales", bas: "braies" });
const AUTRE = cartesDeLaMain({ arme: "gourdin", tete: "bonnet", haut: "tunique", pieds: "bottes", bas: "braies-carreaux" });

describe("l'exponentielle du duel", () => {
  it("suit Math.exp à un millionième de millionième près, et vaut 0 sous le plancher", () => {
    for (let x = 0; x > -40; x -= 0.37) expect(Math.abs(expDuDuel(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(1e-11);
    expect(expDuDuel(0)).toBe(1);
    expect(expDuDuel(-40)).toBe(0);
    expect(expDuDuel(-1000)).toBe(0);
  });
});

describe("le hasard à graine", () => {
  it("rend toujours la même suite pour la même graine, entre 0 et 1", () => {
    const h1 = hasardDeLaGraine(123456), h2 = hasardDeLaGraine(123456);
    const a = Array.from({ length: 50 }, h1), b = Array.from({ length: 50 }, h2);
    expect(a).toEqual(b);
    for (const x of a) expect(x > 0 && x < 1).toBe(true);
    expect(h1.etat()).toBe(h2.etat());
    expect(estUneGraine(h1.etat())).toBe(true);
  });

  it("refuse une graine hors de 1 à 2 147 483 646", () => {
    expect(() => hasardDeLaGraine(0)).toThrow();
    expect(() => hasardDeLaGraine(MODULE_DE_LA_GRAINE)).toThrow();
    expect(() => hasardDeLaGraine(1.5)).toThrow();
  });
});

describe("la machine", () => {
  it("choisit une carte libre, la même pour la même graine", () => {
    let a = camp(MAIN), b = camp(AUTRE);
    for (let m = 1; m <= 6; m++) {
      const i = choisirAuNiveau(b, a, m, "guerrier", hasardDeLaGraine(1000 + m)), j = choisirAuNiveau(b, a, m, "guerrier", hasardDeLaGraine(1000 + m));
      expect(i).toBe(j);
      expect(libres(b)).toContain(i);
      const r = manche(a, b, libres(a)[0]!, i, m);
      if (r.fini) break;
      a = r.a;
      b = r.b;
    }
  });

  it("sans fantaisie, prend la carte qui vaut le plus", () => {
    const a = camp(MAIN), b = camp(AUTRE), notes = libres(a).map((i) => [i, valeurDuCoup(a, b, i, 1, 2)] as const);
    const meilleure = notes.reduce((x, y) => (y[1] > x[1] ? y : x));
    expect(choisir(a, b, 1, () => 0.000001, 0.001, 2)).toBe(meilleure[0]);
  });

  it("a trois niveaux, du moins au plus réfléchi", () => {
    expect(Object.keys(NIVEAUX)).toEqual(["apprenti", "guerrier", "druide"]);
    expect(NIVEAUX.apprenti.fantaisie).toBeGreaterThan(NIVEAUX.guerrier.fantaisie);
    expect(NIVEAUX.guerrier.fantaisie).toBeGreaterThan(NIVEAUX.druide.fantaisie);
    expect(NIVEAUX.apprenti.loin).toBeLessThanOrEqual(NIVEAUX.guerrier.loin);
  });
});
