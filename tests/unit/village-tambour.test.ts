import { describe, expect, it } from "vitest";
import { OBJETS, ORDRE_RARETES, type Rarete } from "../../src/lib/gaulois";
import { chancesEffectives, objetsDeLaPochette } from "../../src/lib/village/boutique";
import { CHANCES_POCHETTE, CHANCES_POCHETTE_FAMILIERS } from "../../src/lib/village/contrat";
import { FAMILIERS, chancesPourMoi } from "../../src/lib/village/familiers";
import {
  CIBLE_DU_TAMBOUR,
  COURSE_DU_TAMBOUR,
  DEPART_DU_TAMBOUR,
  DUREE_DU_TAMBOUR,
  bandeDeLaPochette,
  bandeDesFamiliers,
  bandeDuTambour,
  cheminDuTambour,
  positionDuTambour,
  rangeeAuHasard,
  rareteSelon,
} from "../../src/lib/village/tambour";

/** Un hasard rejouable, pour des tirages qui ne changent pas d'un essai à l'autre. */
function hasardFixe(graine: number): () => number {
  let a = graine;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const zero = (): Record<Rarete, number> => Object.fromEntries(ORDRE_RARETES.map((r) => [r, 0])) as Record<Rarete, number>;

describe("rareteSelon", () => {
  it("suit les raretés dans l'ordre, chacune sur la longueur de sa chance", () => {
    expect(rareteSelon(CHANCES_POCHETTE, 0)).toBe("commun");
    expect(rareteSelon(CHANCES_POCHETTE, 0.4999)).toBe("commun");
    expect(rareteSelon(CHANCES_POCHETTE, 0.5)).toBe("peu-commun");
    expect(rareteSelon(CHANCES_POCHETTE, 0.8)).toBe("epique");
    expect(rareteSelon(CHANCES_POCHETTE, 0.93)).toBe("mystique");
    expect(rareteSelon(CHANCES_POCHETTE, 0.98)).toBe("legendaire");
    expect(rareteSelon(CHANCES_POCHETTE, 1)).toBe("legendaire");
  });

  it("saute une rareté sans chance, et ne rend rien sans aucune chance", () => {
    const sansCommun = { ...CHANCES_POCHETTE, commun: 0 };
    expect(rareteSelon(sansCommun, 0)).toBe("peu-commun");
    expect(rareteSelon(zero(), 0.5)).toBeNull();
  });
});

describe("rangeeAuHasard", () => {
  it("ne tire jamais une rareté qui n'a rien à donner", () => {
    const hasard = hasardFixe(1);
    for (let i = 0; i < 500; i++) {
      const rangee = rangeeAuHasard(CHANCES_POCHETTE, (r) => (r === "commun" ? [] : [r]), hasard);
      expect(rangee?.rarete).not.toBe("commun");
      expect(rangee?.valeur).toBe(rangee?.rarete);
    }
  });

  it("ne rend rien quand aucune rareté n'a de quoi donner", () => {
    expect(rangeeAuHasard(CHANCES_POCHETTE, () => [], Math.random)).toBeNull();
  });
});

describe("bandeDuTambour", () => {
  it("pose le résultat à la rangée où le tambour s'arrête, avec trois rangées après lui", () => {
    let n = 0;
    const bande = bandeDuTambour({ valeur: "résultat", rarete: "legendaire" }, () => ({ valeur: `rangée ${n++}`, rarete: "commun" }));
    expect(bande.depart).toBe(DEPART_DU_TAMBOUR);
    expect(bande.cible).toBe(CIBLE_DU_TAMBOUR);
    expect(bande.cible - bande.depart).toBe(COURSE_DU_TAMBOUR);
    expect(bande.rangees).toHaveLength(CIBLE_DU_TAMBOUR + 4);
    expect(bande.rangees[bande.cible]).toEqual({
      valeur: "résultat",
      rarete: "legendaire",
    });
    expect(bande.rangees.filter((r) => r.valeur === "résultat")).toHaveLength(1);
  });
});

describe("bandeDeLaPochette", () => {
  const tire = {
    ...objetsDeLaPochette("legendaire")[0]!,
    rarete: "legendaire" as const,
  };

  it("finit sur l'objet tiré par le serveur, et ne montre que des objets que la pochette peut donner", () => {
    const bande = bandeDeLaPochette(tire, CHANCES_POCHETTE, hasardFixe(7));
    expect(bande.rangees[bande.cible]?.valeur).toEqual({
      emplacement: tire.emplacement,
      objet: tire.objet,
    });
    for (const rangee of bande.rangees) {
      const objet = OBJETS[rangee.valeur.emplacement][rangee.valeur.objet];
      expect(objet?.gratuit).toBe(false);
      expect(objet?.rarete).toBe(rangee.rarete);
    }
  });

  it("fait défiler les raretés à peu près aux chances de la pochette, sans favoriser les rares", () => {
    const hasard = hasardFixe(42);
    const vues = zero();
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const bande = bandeDeLaPochette(tire, CHANCES_POCHETTE, hasard);
      bande.rangees.forEach((rangee, j) => {
        if (j === bande.cible) return;
        vues[rangee.rarete]++;
        total++;
      });
    }
    const attendues = chancesEffectives(CHANCES_POCHETTE)!;
    for (const rarete of ORDRE_RARETES) expect(Math.abs((vues[rarete] * 100) / total - attendues[rarete])).toBeLessThan(1);
  });
});

describe("bandeDesFamiliers", () => {
  const possedes = new Set(FAMILIERS.filter((f) => f.rarete === "commun" || f.id.length % 2 === 0).map((f) => f.id));
  const recu = FAMILIERS.find((f) => !possedes.has(f.id))!;

  it("ne fait défiler que des familiers que ce compte n'avait pas, et finit sur celui qu'il reçoit", () => {
    const bande = bandeDesFamiliers(recu, CHANCES_POCHETTE_FAMILIERS, possedes, hasardFixe(3));
    expect(bande.rangees[bande.cible]?.valeur.id).toBe(recu.id);
    for (const rangee of bande.rangees) {
      expect(possedes.has(rangee.valeur.id)).toBe(false);
      expect(rangee.valeur.rarete).toBe(rangee.rarete);
    }
  });

  it("suit les chances que la pochette a pour ce compte, une rareté épuisée sautée", () => {
    const hasard = hasardFixe(11);
    const vues = zero();
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const bande = bandeDesFamiliers(recu, CHANCES_POCHETTE_FAMILIERS, possedes, hasard);
      bande.rangees.forEach((rangee, j) => {
        if (j === bande.cible) return;
        vues[rangee.rarete]++;
        total++;
      });
    }
    const attendues = chancesPourMoi(CHANCES_POCHETTE_FAMILIERS, possedes)!;
    expect(attendues.commun).toBe(0);
    for (const rarete of ORDRE_RARETES) expect(Math.abs((vues[rarete] * 100) / total - attendues[rarete])).toBeLessThan(1);
  });
});

describe("le mouvement du tambour", () => {
  it("part de zéro, arrive à un, et ne recule jamais", () => {
    expect(cheminDuTambour(0)).toBe(0);
    expect(cheminDuTambour(-1)).toBe(0);
    expect(cheminDuTambour(1)).toBe(1);
    expect(cheminDuTambour(2)).toBe(1);
    let avant = 0;
    for (let i = 1; i <= 1000; i++) {
      const ici = cheminDuTambour(i / 1000);
      expect(ici).toBeGreaterThanOrEqual(avant);
      avant = ici;
    }
  });

  it("démarre en douceur et finit lentement, sans à-coup", () => {
    // Le premier centième du temps fait moins d'un demi-centième du chemin : pas de départ brutal.
    expect(cheminDuTambour(0.01)).toBeLessThan(0.005);
    // À mi-temps, l'essentiel du chemin est fait ; la dernière seconde fait moins d'une demi-rangée.
    expect(cheminDuTambour(0.5)).toBeGreaterThan(0.85);
    const bande = { depart: DEPART_DU_TAMBOUR, cible: CIBLE_DU_TAMBOUR };
    expect(positionDuTambour(bande, DUREE_DU_TAMBOUR) - positionDuTambour(bande, DUREE_DU_TAMBOUR - 1000)).toBeLessThan(0.5);
    expect(positionDuTambour(bande, DUREE_DU_TAMBOUR)).toBe(CIBLE_DU_TAMBOUR);
    expect(positionDuTambour(bande, 0)).toBe(DEPART_DU_TAMBOUR);
  });

  it("arrive tout de suite quand la durée est nulle (animations coupées)", () => {
    expect(positionDuTambour({ depart: 3, cible: 37 }, 0, 0)).toBe(37);
  });
});
