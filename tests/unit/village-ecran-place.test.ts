import { describe, expect, it } from "vitest";
import { OBJETS, TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { lireVillage, messageDeLaPlace, plaquesEnMots, sonGauloisManque } from "../../src/lib/village/ecran-place";

const gaulois = (nom: string, moi = false) => ({ nom, tenue: TENUE_DE_DEPART, moi });

/** Un objet à rareté du catalogue, pour un emplacement d'objet : ceux-là seuls se gravent. */
const graveDe = (emplacement: "tete" | "arme") => Object.entries(OBJETS[emplacement]).find(([, fiche]) => fiche.rarete !== null)!;

describe("les plaques de la forge sur la place", () => {
  const [arme, ficheArme] = graveDe("arme");
  const [tete, ficheTete] = graveDe("tete");

  it("lit les plaques de chaque Gaulois et écarte celles qui ne se lisent pas", () => {
    const village = lireVillage({
      ok: true,
      gaulois: [
        {
          ...gaulois("A"),
          gravures: [
            { emplacement: "arme", objet: arme, texte: " 12 novembre, à quatre, 2,33 points rapportés " },
            { emplacement: "arme", objet: "inconnu", texte: "faux" },
            { emplacement: "peau", objet: "claire", texte: "le corps ne se grave pas" },
            { emplacement: "tete", objet: tete, texte: "" },
            null,
          ],
        },
        { ...gaulois("B"), gravures: "non" },
        gaulois("C"),
      ],
    });
    expect(village?.gaulois[0]?.gravures).toEqual([{ emplacement: "arme", objet: arme, texte: "12 novembre, à quatre, 2,33 points rapportés" }]);
    expect(village?.gaulois[1]?.gravures).toEqual([]);
    expect(village?.gaulois[2]?.gravures).toEqual([]);
  });

  it("dit chaque plaque avec le nom de son objet, de la tête à l'arme", () => {
    const plaques = plaquesEnMots({
      gravures: [
        { emplacement: "arme", objet: arme, texte: "12 novembre, à quatre, 2,33 points rapportés" },
        { emplacement: "tete", objet: tete, texte: "3 novembre, seul, 1,5 point rapporté" },
      ],
    });
    expect(plaques.map((p) => [p.objet, p.texte])).toEqual([
      [ficheTete.nom, "3 novembre, seul, 1,5 point rapporté"],
      [ficheArme.nom, "12 novembre, à quatre, 2,33 points rapportés"],
    ]);
    expect(new Set(plaques.map((p) => p.cle)).size).toBe(2);
    expect(plaquesEnMots({})).toEqual([]);
    expect(plaquesEnMots({ gravures: [{ emplacement: "arme", objet: "inconnu", texte: "faux" }] })).toEqual([]);
  });
});

describe("la réponse du serveur", () => {
  it("relit les Gaulois et écarte ceux qui ne se dessinent pas", () => {
    const village = lireVillage({ ok: true, gaulois: [gaulois(" Essai ", true), { nom: "", tenue: TENUE_DE_DEPART, moi: false }, { nom: "Sans tenue", tenue: { peau: "verte" }, moi: false }, null, gaulois("Autre")] });
    expect(village?.gaulois.map((g) => [g.nom, g.moi])).toEqual([
      ["Essai", true],
      ["Autre", false],
    ]);
  });

  it("lit les faits de la vie du village, et compte pour rien ce qui manque ou se lit mal", () => {
    const village = lireVillage({
      ok: true,
      releve: "2026-11-13T20:53:00Z",
      gaulois: [
        { ...gaulois("A"), partie_le: "2026-11-13T20:38:00Z", vocal: true, replique: "  Bonjour   à tous  " },
        { ...gaulois("B"), partie_le: "hier soir", vocal: "oui", replique: 12 },
        gaulois("C"),
      ],
    });
    expect(village?.releve).toBe("2026-11-13T20:53:00Z");
    expect(village?.gaulois[0]).toMatchObject({ partie_le: "2026-11-13T20:38:00Z", vocal: true, replique: "Bonjour à tous" });
    expect(village?.gaulois[1]).toMatchObject({ partie_le: null, vocal: null, replique: null });
    expect(village?.gaulois[2]).toMatchObject({ partie_le: null, vocal: null, replique: null });
    expect(lireVillage({ ok: true, gaulois: [], releve: 3 })?.releve).toBeNull();
    expect(lireVillage({ ok: true, gaulois: [] })?.releve).toBeNull();
  });

  it("refuse une réponse qui n'a pas la forme du contrat", () => {
    expect(lireVillage(null)).toBeNull();
    expect(lireVillage("non")).toBeNull();
    expect(lireVillage({ ok: true })).toBeNull();
  });

  it("sait si le membre n'a pas encore son Gaulois", () => {
    expect(sonGauloisManque({ ok: true, gaulois: [gaulois("A")] })).toBe(true);
    expect(sonGauloisManque({ ok: true, gaulois: [gaulois("A"), gaulois("Moi", true)] })).toBe(false);
  });

  // Deux comptes peuvent porter le même nom au QG : plusieurs Gaulois du même nom sont tous gardés, chacun à son rang.
  it("garde les Gaulois nommés pareil, et le sien sous son nom", () => {
    const v = lireVillage({ ok: true, gaulois: [gaulois("Homonyme"), gaulois("Homonyme"), gaulois("Moi", true), gaulois("Homonyme")] });
    expect(v?.gaulois.map((g) => g.nom)).toEqual(["Homonyme", "Homonyme", "Moi", "Homonyme"]);
    expect(sonGauloisManque(v!)).toBe(false);
  });

  it("dit en mots qu'un compte pas encore validé n'entre pas", () => {
    expect(messageDeLaPlace("not_validated")).toBe("La place s'ouvre une fois votre compte validé.");
    expect(messageDeLaPlace("network")).toBeNull();
  });
});
