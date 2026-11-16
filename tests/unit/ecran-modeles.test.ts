import { describe, expect, it } from "vitest";
import { CHANCES_POCHETTE_MODELES, REMBOURSEMENT_POCHETTE_MODELES, type MesModeles } from "../../src/lib/village/contrat";
import { actionDeLEssai, albumDesModeles, bandeDesModeles, essaiDuModeleValide, lignesDesChances, modelesDeLaPochette, modelesPossedes, rendusDeLaPochette, resteADecouvrir, surCombien, type SortieDeLaPochette } from "../../src/lib/village/ecran-modeles";
import { MODELES, chancesPourMoi, modeleParId } from "../../src/lib/village/modeles";
import { CIBLE_DU_TAMBOUR, DEPART_DU_TAMBOUR } from "../../src/lib/village/tambour";

const CHANCES = { commun: 45, "peu-commun": 28, epique: 15, mystique: 8, legendaire: 4 } as const;
/** Une pochette d'essai : 85 pochettes sur 100 rendent 20 à 60 % du prix ; et la même sans remboursement, comme avant. */
const POCHETTE = { prix: 3000, chances: { ...CHANCES }, remboursement: 85, paliers: [20, 30, 40, 50, 60] };
const SANS_RENDU = { prix: 2000, chances: { ...CHANCES }, remboursement: 0, paliers: [] as number[] };
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
    const lignes = lignesDesChances(SANS_RENDU, ids());
    expect(lignes?.map((ligne) => [ligne.rarete, ligne.chance, ligne.reste, ligne.total])).toEqual([
      ["commun", 45, 3, 3],
      ["peu-commun", 28, 3, 3],
      ["epique", 15, 2, 2],
      ["mystique", 8, 2, 2],
      ["legendaire", 4, 1, 1],
    ]);
    expect(lignes?.[0]).toMatchObject({ nom: "Commun", rang: 1 });
  });

  it("compte les remboursements : chaque rareté en pour cent de toutes les pochettes, cent avec leur part", () => {
    const lignes = lignesDesChances(POCHETTE, ids());
    expect(lignes?.map((ligne) => Math.round(ligne.chance * 100) / 100)).toEqual([6.75, 4.2, 2.25, 1.2, 0.6]);
    expect((lignes?.reduce((somme, ligne) => somme + ligne.chance, 0) ?? 0) + POCHETTE.remboursement).toBeCloseTo(100);
    // Les réglages du départ : 85 % de remboursements, puis 7,5, 4,5, 1,8, 0,9 et 0,3.
    const depart = lignesDesChances({ chances: CHANCES_POCHETTE_MODELES, remboursement: REMBOURSEMENT_POCHETTE_MODELES }, ids());
    expect(depart?.map((ligne) => Math.round(ligne.chance * 100) / 100)).toEqual([7.5, 4.5, 1.8, 0.9, 0.3]);
  });

  it("saute une rareté épuisée : les autres se partagent ses chances, cent en tout", () => {
    const lignes = lignesDesChances(SANS_RENDU, ids("lezard", "loup", "sanglier", "dragon"));
    expect(lignes?.find((ligne) => ligne.rarete === "commun")).toMatchObject({ chance: 0, reste: 0 });
    expect(lignes?.find((ligne) => ligne.rarete === "legendaire")).toMatchObject({ chance: 0, reste: 0 });
    expect(lignes?.find((ligne) => ligne.rarete === "peu-commun")?.chance).toBeCloseTo((28 * 100) / 51);
    expect(lignes?.reduce((somme, ligne) => somme + ligne.chance, 0)).toBeCloseTo(100);
    const avecRendus = lignesDesChances(POCHETTE, ids("lezard", "loup", "sanglier", "dragon"));
    expect(avecRendus?.find((ligne) => ligne.rarete === "peu-commun")?.chance).toBeCloseTo((28 * 15) / 51);
    expect(avecRendus?.reduce((somme, ligne) => somme + ligne.chance, 0)).toBeCloseTo(15);
  });

  it("ne rend rien quand le compte les a tous", () => {
    expect(lignesDesChances(POCHETTE, ids(...MODELES.map((modele) => modele.id)))).toBeNull();
  });

  it("dit ce que la pochette rend : sa part, et chaque palier en statères, du plus petit au plus grand", () => {
    expect(rendusDeLaPochette(POCHETTE)).toEqual({
      chance: 85,
      paliers: [
        { pourcent: 20, rendu: 600 },
        { pourcent: 30, rendu: 900 },
        { pourcent: 40, rendu: 1200 },
        { pourcent: 50, rendu: 1500 },
        { pourcent: 60, rendu: 1800 },
      ],
    });
    // Arrondi comme le serveur ; les paliers rangés même s'ils arrivent en désordre.
    expect(rendusDeLaPochette({ prix: 2505, remboursement: 50, paliers: [30, 10] })?.paliers).toEqual([
      { pourcent: 10, rendu: 251 },
      { pourcent: 30, rendu: 752 },
    ]);
    expect(rendusDeLaPochette(SANS_RENDU)).toBeNull();
    expect(rendusDeLaPochette({ prix: 3000, remboursement: 85, paliers: [] })).toBeNull();
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
  const recu: SortieDeLaPochette = { kind: "modele", modele: dragon };
  const idsDe = (rangees: readonly SortieDeLaPochette[]): string[] => rangees.flatMap((rangee) => (rangee.kind === "modele" ? [rangee.modele.id] : []));

  it("pose ce que le serveur a répondu à la rangée où il s'arrête : un modèle, ou un remboursement", () => {
    const bande = bandeDesModeles(recu, POCHETTE, ids(), hasardFixe(7));
    expect(bande.depart).toBe(DEPART_DU_TAMBOUR);
    expect(bande.cible).toBe(CIBLE_DU_TAMBOUR);
    expect(bande.rangees[bande.cible]).toEqual({ kind: "modele", modele: dragon });
    expect(bande.rangees).toHaveLength(CIBLE_DU_TAMBOUR + 4);
    const rendu: SortieDeLaPochette = { kind: "rendu", pourcent: 30, rendu: 900 };
    expect(bandeDesModeles(rendu, POCHETTE, ids(), hasardFixe(7)).rangees[CIBLE_DU_TAMBOUR]).toEqual(rendu);
  });

  it("tire les autres rangées sans regarder la réponse : les mêmes, quel que soit le résultat", () => {
    const a = bandeDesModeles(recu, POCHETTE, ids(), hasardFixe(11));
    const b = bandeDesModeles({ kind: "rendu", pourcent: 20, rendu: 600 }, POCHETTE, ids(), hasardFixe(11));
    expect(a.rangees.filter((_, i) => i !== a.cible)).toEqual(b.rangees.filter((_, i) => i !== b.cible));
  });

  it("ne fait défiler que des modèles que le compte n'avait pas, et des remboursements aux paliers de la pochette", () => {
    const possedes = ids("lezard", "loup", "sanglier", "givre");
    const bande = bandeDesModeles(recu, POCHETTE, possedes, hasardFixe(42));
    const paliers = rendusDeLaPochette(POCHETTE)?.paliers ?? [];
    for (const rangee of bande.rangees) {
      if (rangee.kind === "modele") expect(possedes.has(rangee.modele.id)).toBe(false);
      else expect(paliers).toContainEqual({ pourcent: rangee.pourcent, rendu: rangee.rendu });
    }
  });

  it("suit les chances réelles du compte : les remboursements à leur part, chaque palier et chaque rareté à sa fréquence", () => {
    const possedes = ids("lezard", "loup", "sanglier");
    const attendues = lignesDesChances(POCHETTE, possedes);
    const hasard = hasardFixe(2026);
    const sorties: Record<string, number> = {};
    let total = 0;
    for (let tour = 0; tour < 1200; tour++) {
      const bande = bandeDesModeles(recu, POCHETTE, possedes, hasard);
      bande.rangees.forEach((rangee, i) => {
        if (i === bande.cible) return;
        const cle = rangee.kind === "modele" ? rangee.modele.rarete : `rendu-${rangee.pourcent}`;
        sorties[cle] = (sorties[cle] ?? 0) + 1;
        total++;
      });
    }
    const part = (cle: string): number => ((sorties[cle] ?? 0) * 100) / total;
    expect(sorties["commun"]).toBeUndefined();
    // Quarante-huit mille rangées tirées : à un point près.
    for (const palier of POCHETTE.paliers) expect(Math.abs(part(`rendu-${palier}`) - 85 / 5)).toBeLessThan(1);
    for (const ligne of attendues ?? []) expect(Math.abs(part(ligne.rarete) - ligne.chance)).toBeLessThan(1);
  });

  it("sans remboursement, ne montre que des modèles ; et que le dernier quand il ne restait que lui", () => {
    const possedes = ids(...MODELES.filter((modele) => modele.id !== "dragon").map((modele) => modele.id));
    const bande = bandeDesModeles(recu, SANS_RENDU, possedes, hasardFixe(3));
    expect(bande.rangees.every((rangee) => rangee.kind === "modele")).toBe(true);
    expect(new Set(idsDe(bande.rangees))).toEqual(new Set(["dragon"]));
    expect(new Set(idsDe(bandeDesModeles(recu, POCHETTE, possedes, hasardFixe(3)).rangees))).toEqual(new Set(["dragon"]));
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

describe("l'album de la pochette des Gaulois uniques", () => {
  const pochette = { ...SANS_RENDU };

  it("montre les modèles famille par famille, en couleur, avec la chance du tirage : 100 en tout", () => {
    const album = albumDesModeles({ ...mes([]), pochette });
    expect(album.elements.map((e) => e.id)).toEqual(MODELES.map((m) => m.id));
    expect(album.elements.every((e) => !e.silhouette && e.dessin !== null)).toBe(true);
    expect(album.elements.reduce((n, e) => n + e.chance, 0)).toBeCloseTo(100, 8);
    expect(album.sous).toBe(`0 sur ${MODELES.length} à vous`);
    expect(album.libelleDesGroupes).toBe("Montrer une famille");
  });

  it("ne donne aucune chance à un modèle déjà reçu, et sa part revient aux autres de sa rareté", () => {
    const premier = MODELES[0]!;
    const album = albumDesModeles({ ...mes([premier.id]), pochette });
    const pourMoi = chancesPourMoi(CHANCES, ids(premier.id))!;
    const memes = MODELES.filter((m) => m.rarete === premier.rarete && m.id !== premier.id);
    expect(album.elements.find((e) => e.id === premier.id)).toMatchObject({ possede: true, chance: 0 });
    for (const m of memes) expect(album.elements.find((e) => e.id === m.id)!.chance).toBeCloseTo(pourMoi[premier.rarete] / memes.length, 10);
    expect(album.elements.reduce((n, e) => n + e.chance, 0)).toBeCloseTo(100, 8);
  });

  it("compte les remboursements : les chances des modèles font ce qu'ils laissent", () => {
    const album = albumDesModeles({ ...mes([]), pochette: POCHETTE });
    expect(album.elements.reduce((n, e) => n + e.chance, 0)).toBeCloseTo(15, 8);
    expect(album.elements.find((e) => e.id === "dragon")?.chance).toBeCloseTo(4 * 0.15, 10);
  });

  it("rogne chaque modèle à son dessin", () => {
    for (const e of albumDesModeles({ ...mes([]), pochette }).elements) {
      const { largeur, hauteur, cases } = e.dessin!;
      expect(cases).toHaveLength(largeur * hauteur);
      expect(cases.slice(0, largeur).some((c) => c !== null)).toBe(true);
      expect(Array.from({ length: hauteur }, (_, y) => cases[y * largeur]).some((c) => c !== null)).toBe(true);
      expect(Array.from({ length: hauteur }, (_, y) => cases[y * largeur + largeur - 1]).some((c) => c !== null)).toBe(true);
    }
  });
});
