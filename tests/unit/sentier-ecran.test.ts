import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OBJETS, RARETES_DES_OBJETS } from "../../src/lib/gaulois";
import { DESSINS_DES_MISSIONS, casesDuChaudron, pochetteDeRarete } from "../../src/components/village/SentierDessins";
import { POCHETTE_COTE, casesDeLaPochette } from "../../src/components/village/PochetteDessin";
import { albumDuPalier } from "../../src/lib/village/album-pochette";
import { objetsDeLaPochette } from "../../src/lib/village/boutique";
import { MISSIONS_DU_SENTIER, PALIERS_DE_LA_SAISON_1, SAISON_1, type ObjetPossede, type PalierDuSentier, type RareteDePalier } from "../../src/lib/village/contrat";
import { PALIERS_PAR_RANGEE, avantLeCadeau, joursDeLaSaison, partDuDefi, rangeeMontree, remplissageDuRail } from "../../src/lib/village/sentier";

// Ce que l'écran du sentier (Sentier.tsx) déduit pour son dessin : le rail, la rangée montrée, l'album d'un palier.

const MIGRATION = readFileSync("supabase/migrations/20261116001100_sentier_des_gaulois.sql", "utf8");
const possede = (emplacement: ObjetPossede["emplacement"], objet: string): ObjetPossede => ({ emplacement, objet, quantite: 1, origine: "pochette", acquis_le: "2026-11-17T10:00:00Z" });
const paliers = (pris: readonly number[] = []): PalierDuSentier[] => PALIERS_DE_LA_SAISON_1.map((rarete, i) => ({ palier: i + 1, rarete, pris: pris.includes(i + 1) ? { emplacement: "tete", objet: "x" } : null }));

describe("l'album d'un palier", () => {
  const RARETES: readonly RareteDePalier[] = ["commun", "peu-commun", "epique", "mystique", "legendaire"];

  it("montre tous les objets payants de la rareté, et seulement eux", () => {
    for (const rarete of RARETES) {
      const album = albumDuPalier(4, rarete, []);
      expect(album.elements.map((e) => e.id).sort()).toEqual(
        objetsDeLaPochette(rarete)
          .map((ref) => `${ref.emplacement}/${ref.objet}`)
          .sort(),
      );
      expect(album.elements.every((e) => e.rarete === rarete)).toBe(true);
      expect(album.titre).toBe("Palier 4");
      expect(album.motDeLaChance).toBe("à ce palier");
    }
  });

  it("le serveur tire d'abord un objet que le compte n'a pas, puis au hasard : la migration le dit encore", () => {
    expect(MIGRATION).toMatch(/where o\.rarete = v_rarete and not o\.gratuit\s+order by exists \(select 1 from internal\.gaulois_inventaire i[^)]*\),\s+internal\.village_hasard\(\)\s+limit 1/);
  });

  it("partage la chance entre les objets que le compte n'a pas encore", () => {
    const refs = objetsDeLaPochette("epique");
    const eus = refs.slice(0, 5).map((ref) => possede(ref.emplacement, ref.objet));
    const album = albumDuPalier(10, "epique", eus);
    const manque = refs.length - 5;
    for (const element of album.elements) {
      expect(element.possede).toBe(eus.some((o) => `${o.emplacement}/${o.objet}` === element.id));
      expect(element.chance).toBeCloseTo(element.possede ? 0 : 100 / manque, 10);
    }
    expect(album.elements.reduce((somme, e) => somme + e.chance, 0)).toBeCloseTo(100, 8);
    expect(album.sous).toBe(`Un objet ${RARETES_DES_OBJETS.epique.nom.toLowerCase()} de la boutique, parmi les ${manque} que vous n'avez pas encore`);
  });

  it("un compte qui a tout reçoit un double, au hasard entre tous", () => {
    const refs = objetsDeLaPochette("legendaire");
    const album = albumDuPalier(30, "legendaire", refs.map((ref) => possede(ref.emplacement, ref.objet)));
    expect(album.elements.every((e) => e.possede && Math.abs(e.chance - 100 / refs.length) < 1e-9)).toBe(true);
    expect(album.sous).toMatch(/ce sera un double$/);
  });

  it("ne dit aucune chance ni rien de possédé tant que l'inventaire n'est pas lu", () => {
    const album = albumDuPalier(2, "commun", null);
    expect(album.elements.every((e) => e.chance === 0 && !e.possede)).toBe(true);
    expect(album.sous).toBe(`Un objet commun de la boutique, parmi ${objetsDeLaPochette("commun").length} objets`);
  });

  it("un objet d'une autre rareté dans l'inventaire ne compte pas", () => {
    const autre = objetsDeLaPochette("commun")[0]!;
    const album = albumDuPalier(10, "epique", [possede(autre.emplacement, autre.objet)]);
    expect(album.elements.some((e) => e.possede)).toBe(false);
    expect(OBJETS[autre.emplacement][autre.objet]?.rarete).toBe("commun");
  });
});

describe("le rail de pavés", () => {
  it("est doré jusqu'au palier atteint, puis à la part faite vers le suivant", () => {
    // Palier 2 atteint, 5 XP sur 30 vers le troisième : la moitié de la case 2, plus un sixième de case.
    expect(remplissageDuRail(1, 2, 5, 30)).toBe(100);
    expect(remplissageDuRail(2, 2, 5, 30)).toBe(66.7);
    expect(remplissageDuRail(3, 2, 5, 30)).toBe(0);
    // 20 XP sur 30 : la case 2 est pleine, la case 3 dorée jusqu'à un sixième.
    expect(remplissageDuRail(2, 2, 20, 30)).toBe(100);
    expect(remplissageDuRail(3, 2, 20, 30)).toBe(16.7);
    expect(remplissageDuRail(4, 2, 20, 30)).toBe(0);
  });

  it("avant le premier palier, le chemin tient dans la moitié gauche de la première case", () => {
    expect(remplissageDuRail(1, 0, 0, 30)).toBe(0);
    expect(remplissageDuRail(1, 0, 15, 30)).toBe(25);
    expect(remplissageDuRail(2, 0, 15, 30)).toBe(0);
  });

  it("ne dépasse jamais la case, même pour des nombres hors norme", () => {
    for (const fait of [-5, 0, 10, 30, 400, Number.NaN]) {
      for (const palier of [1, 2, 3]) {
        const part = remplissageDuRail(palier, 1, fait, 30);
        expect(part).toBeGreaterThanOrEqual(0);
        expect(part).toBeLessThanOrEqual(100);
      }
    }
    expect(remplissageDuRail(1, 1, 10, 0)).toBe(50);
  });
});

describe("la rangée montrée quand la piste est repliée", () => {
  it("celle du palier suivant quand rien n'attend", () => {
    expect(rangeeMontree(paliers([1, 2]), 2)).toEqual({ debut: 1, fin: 10, ailleurs: 0 });
    expect(rangeeMontree(paliers(Array.from({ length: 10 }, (_, i) => i + 1)), 10)).toEqual({ debut: 11, fin: 20, ailleurs: 0 });
    expect(rangeeMontree(paliers(Array.from({ length: 30 }, (_, i) => i + 1)), 30)).toEqual({ debut: 21, fin: 30, ailleurs: 0 });
  });

  it("celle du premier objet à prendre, et compte ceux que le pli cacherait", () => {
    // Palier 12 atteint, les paliers 9 et 12 pas encore pris.
    const pris = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11];
    expect(rangeeMontree(paliers(pris), 12)).toEqual({ debut: 1, fin: 10, ailleurs: 1 });
    expect(rangeeMontree(paliers([...pris, 9]), 12)).toEqual({ debut: 11, fin: 20, ailleurs: 0 });
  });

  it("une piste vide ou courte ne plante pas", () => {
    expect(rangeeMontree([], 0)).toEqual({ debut: 1, fin: 0, ailleurs: 0 });
    expect(rangeeMontree(paliers().slice(0, 4), 0)).toEqual({ debut: 1, fin: 4, ailleurs: 0 });
    expect(PALIERS_PAR_RANGEE).toBe(10);
  });
});

describe("les jours de la saison et le calendrier", () => {
  it("la saison 1 compte 45 jours, du 17 novembre au 31 décembre", () => {
    expect(joursDeLaSaison(SAISON_1, "2026-11-17")).toEqual({ total: 45, rang: 1 });
    expect(joursDeLaSaison(SAISON_1, "2026-11-20")).toEqual({ total: 45, rang: 4 });
    expect(joursDeLaSaison(SAISON_1, "2026-12-31")).toEqual({ total: 45, rang: 45 });
  });

  it("rien hors de la saison ni pour une date illisible", () => {
    expect(joursDeLaSaison(SAISON_1, "2026-11-16")).toBeNull();
    expect(joursDeLaSaison(SAISON_1, "2027-01-01")).toBeNull();
    expect(joursDeLaSaison(SAISON_1, "demain")).toBeNull();
  });

  it("dit combien de jours de visite il reste avant le cadeau", () => {
    expect(avantLeCadeau(0, 7)).toBe(7);
    expect(avantLeCadeau(3, 7)).toBe(4);
    expect(avantLeCadeau(7, 7)).toBe(0);
    expect(avantLeCadeau(8, 7)).toBe(6);
  });
});

describe("la part écrite du défi du clan", () => {
  it("n'écrit 100 qu'une fois le défi rempli", () => {
    expect(partDuDefi(0, 85)).toBe(0);
    expect(partDuDefi(42.7, 85)).toBe(50);
    expect(partDuDefi(84.7, 85)).toBe(99);
    expect(partDuDefi(84.999, 85)).toBe(99);
    expect(partDuDefi(85, 85)).toBe(100);
    expect(partDuDefi(240, 85)).toBe(100);
  });

  it("vaut 0 pour des nombres hors norme", () => {
    expect(partDuDefi(-4, 85)).toBe(0);
    expect(partDuDefi(10, 0)).toBe(0);
    expect(partDuDefi(Number.NaN, 85)).toBe(0);
  });
});

describe("les dessins du sentier", () => {
  it("chaque mission a son image, aux bonnes dimensions", () => {
    for (const code of MISSIONS_DU_SENTIER) {
      const dessin = DESSINS_DES_MISSIONS[code];
      expect(dessin.cases).toHaveLength(dessin.largeur * dessin.hauteur);
      expect(dessin.cases.some((c) => c !== null)).toBe(true);
      expect(dessin.cases.every((c) => c === null || /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    }
  });

  it("le chaudron se remplit avec la part faite, sans jamais déborder", () => {
    const or = (part: number) => casesDuChaudron(part).cases.filter((c) => c === "#f2b632" || c === "#fff1a8").length;
    expect(or(0)).toBeLessThan(or(0.5));
    expect(or(0.5)).toBeLessThan(or(1));
    expect(or(7)).toBe(or(1));
    expect(or(-3)).toBe(or(0));
    expect(or(Number.NaN)).toBe(or(0));
    const { largeur, hauteur, cases } = casesDuChaudron(0.5);
    expect(cases).toHaveLength(largeur * hauteur);
  });

  it("la pochette d'un palier est celle de la boutique, reteinte : même silhouette, autre cuir", () => {
    const base = casesDeLaPochette();
    const vues = new Set<string>();
    for (const rarete of ["commun", "peu-commun", "epique", "mystique", "legendaire"] as const) {
      const pochette = pochetteDeRarete(rarete);
      expect(pochette.largeur).toBe(POCHETTE_COTE);
      expect(pochette.cases.map((c) => c !== null)).toEqual(base.map((c) => c !== null));
      expect(pochette.cases).not.toEqual(base);
      vues.add(pochette.cases.join(","));
      // Calculée une fois par rareté.
      expect(pochetteDeRarete(rarete)).toBe(pochette);
    }
    expect(vues.size).toBe(5);
  });
});
