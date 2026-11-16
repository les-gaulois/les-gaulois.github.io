import { describe, expect, it } from "vitest";
import type { MesModeles } from "../../src/lib/village/contrat";
import { actionDeLEssai, bandeDesModeles, essaiDuModeleValide, lignesDesChances, modelesDeLaPochette, modelesPossedes, resteADecouvrir, surCombien } from "../../src/lib/village/ecran-modeles";
import { MODELES, chancesPourMoi, modeleParId } from "../../src/lib/village/modeles";
import { CIBLE_DU_TAMBOUR, DEPART_DU_TAMBOUR } from "../../src/lib/village/tambour";

const CHANCES = { commun: 45, "peu-commun": 28, epique: 15, mystique: 8, legendaire: 4 } as const;
const ids = (...liste: string[]): ReadonlySet<string> => new Set(liste);
const mes = (modeles: string[], porte: string | null = null): Pick<MesModeles, "modeles" | "porte"> => ({ modeles: modeles.map((modele) => ({ modele, acquis_le: "2026-11-15T10:00:00Z" })), porte });
/** Un hasard qui se répète, pour des tirages toujours les mêmes. */
function hasardFixe(graine: number): () => number {
  let etat = graine;
  return () => {
    etat = (etat * 1103515245 + 12345) % 2147483648;
    return etat / 2147483648;
  };
}

describe("les chances de la pochette des Gaulois uniques, ligne par ligne", () => {
  it("donne celles du serveur à un compte sans modèle, avec ce qu'il reste par rareté", () => {
    const lignes = lignesDesChances(CHANCES, ids());
    expect(lignes?.map((ligne) => [ligne.rarete, ligne.chance, ligne.reste, ligne.total])).toEqual([
      ["commun", 45, 3, 3],
      ["peu-commun", 28, 3, 3],
      ["epique", 15, 2, 2],
      ["mystique", 8, 2, 2],
      ["legendaire", 4, 1, 1],
    ]);
    expect(lignes?.[0]).toMatchObject({ nom: "Commun", rang: 1 });
  });

  it("saute une rareté épuisée : les autres se partagent ses chances, cent en tout", () => {
    const lignes = lignesDesChances(CHANCES, ids("lezard", "loup", "sanglier", "dragon"));
    expect(lignes?.find((ligne) => ligne.rarete === "commun")).toMatchObject({ chance: 0, reste: 0 });
    expect(lignes?.find((ligne) => ligne.rarete === "legendaire")).toMatchObject({ chance: 0, reste: 0 });
    expect(lignes?.find((ligne) => ligne.rarete === "peu-commun")?.chance).toBeCloseTo((28 * 100) / 51);
    expect(lignes?.reduce((somme, ligne) => somme + ligne.chance, 0)).toBeCloseTo(100);
  });

  it("ne rend rien quand le compte les a tous", () => {
    expect(lignesDesChances(CHANCES, ids(...MODELES.map((modele) => modele.id)))).toBeNull();
  });
});

describe("ce qu'un compte a et ce qu'il lui reste", () => {
  it("compte les modèles à découvrir", () => {
    expect(resteADecouvrir(ids())).toBe(MODELES.length);
    expect(resteADecouvrir(ids("lezard", "dragon", "inconnu"))).toBe(MODELES.length - 2);
    expect(surCombien(3, 11)).toBe("3 sur 11");
  });

  it("range les modèles du compte dans l'ordre de la galerie, sans les inconnus", () => {
    const possedes = modelesPossedes(mes(["dragon", "nimporte", "lezard"]));
    expect(possedes.map((modele) => modele.id).sort()).toEqual(["dragon", "lezard"]);
    expect(possedes.map((modele) => modele.id)).toEqual(MODELES.filter((modele) => ["dragon", "lezard"].includes(modele.id)).map((modele) => modele.id));
    expect(modelesPossedes(null)).toEqual([]);
  });

  it("montre en silhouette trois modèles qu'il n'a pas, ou les trois premiers s'il les a tous", () => {
    const premiers = MODELES.slice(0, 2).map((modele) => modele.id);
    const ombres = modelesDeLaPochette(ids(...premiers));
    expect(ombres).toHaveLength(3);
    expect(ombres.some((modele) => premiers.includes(modele.id))).toBe(false);
    expect(modelesDeLaPochette(ids(...MODELES.slice(1).map((modele) => modele.id))).map((modele) => modele.id)).toEqual([MODELES[0]?.id]);
    expect(modelesDeLaPochette(ids(...MODELES.map((modele) => modele.id)))).toHaveLength(3);
  });
});

describe("le tambour de la pochette des Gaulois uniques", () => {
  const dragon = modeleParId("dragon");
  if (!dragon) throw new Error("le dragon manque à la liste");

  it("pose le modèle reçu à la rangée où il s'arrête", () => {
    const bande = bandeDesModeles(dragon, CHANCES, ids(), hasardFixe(7));
    expect(bande.depart).toBe(DEPART_DU_TAMBOUR);
    expect(bande.cible).toBe(CIBLE_DU_TAMBOUR);
    expect(bande.rangees[bande.cible]).toEqual({ valeur: dragon, rarete: "legendaire" });
    expect(bande.rangees).toHaveLength(CIBLE_DU_TAMBOUR + 4);
  });

  it("ne fait défiler que des modèles que le compte n'avait pas, chacun avec sa rareté", () => {
    const possedes = ids("lezard", "loup", "sanglier", "givre");
    const bande = bandeDesModeles(dragon, CHANCES, possedes, hasardFixe(42));
    for (const rangee of bande.rangees) {
      expect(possedes.has(rangee.valeur.id)).toBe(false);
      expect(rangee.rarete).toBe(rangee.valeur.rarete);
    }
  });

  it("suit les chances réelles du compte : sur beaucoup de rangées, chaque rareté sort à sa fréquence", () => {
    const possedes = ids("lezard", "loup", "sanglier");
    const pourMoi = chancesPourMoi(CHANCES, possedes);
    const hasard = hasardFixe(2026);
    const sorties: Record<string, number> = {};
    let total = 0;
    for (let tour = 0; tour < 400; tour++) {
      const bande = bandeDesModeles(dragon, CHANCES, possedes, hasard);
      bande.rangees.forEach((rangee, i) => {
        if (i === bande.cible) return;
        sorties[rangee.rarete] = (sorties[rangee.rarete] ?? 0) + 1;
        total++;
      });
    }
    expect(sorties["commun"]).toBeUndefined();
    for (const rarete of ["peu-commun", "epique", "mystique", "legendaire"] as const) {
      // À un point et demi près : quinze mille rangées tirées.
      expect(Math.abs(((sorties[rarete] ?? 0) * 100) / total - (pourMoi?.[rarete] ?? 0))).toBeLessThan(1.5);
    }
  });

  it("ne montre que le dernier modèle quand il ne restait que lui", () => {
    const possedes = ids(...MODELES.filter((modele) => modele.id !== "dragon").map((modele) => modele.id));
    const bande = bandeDesModeles(dragon, CHANCES, possedes, hasardFixe(3));
    expect(new Set(bande.rangees.map((rangee) => rangee.valeur.id))).toEqual(new Set(["dragon"]));
  });
});

describe("l'essayage d'un Gaulois unique", () => {
  it("propose d'acheter celui qu'on n'a pas, de porter celui qu'on a, d'enlever celui qu'on porte", () => {
    expect(actionDeLEssai("lezard", mes([]))).toBe("acheter");
    expect(actionDeLEssai("lezard", null)).toBe("acheter");
    expect(actionDeLEssai("lezard", mes(["lezard"]))).toBe("porter");
    expect(actionDeLEssai("lezard", mes(["lezard"], "lezard"))).toBe("enlever");
  });

  it("s'arrête quand le modèle essayé est porté", () => {
    expect(essaiDuModeleValide("lezard", mes(["lezard"]))).toBe("lezard");
    expect(essaiDuModeleValide("lezard", mes(["lezard"], "lezard"))).toBeNull();
    expect(essaiDuModeleValide("dragon", mes(["lezard"], "lezard"))).toBe("dragon");
    expect(essaiDuModeleValide(null, mes([]))).toBeNull();
  });
});
