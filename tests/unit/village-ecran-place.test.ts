import { describe, expect, it } from "vitest";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { DECOR_LARGEUR_MIN } from "../../src/lib/village/decor";
import { CASE_DE_LOIN, CASE_ORDINATEUR, CASE_TELEPHONE, FOULE_AU_TELEPHONE, FOULE_EN_GRAND, caseDeLaScene, largeurDuDecor, lireVillage, messageDeLaPlace, sonGauloisManque } from "../../src/lib/village/ecran-place";

const gaulois = (nom: string, moi = false) => ({ nom, tenue: TENUE_DE_DEPART, moi });

describe("les tailles de la scène", () => {
  it("prend la petite case sur téléphone et dans la foule, la grande sur un écran large quand ils sont peu", () => {
    expect(caseDeLaScene(360, 1)).toBe(CASE_TELEPHONE);
    expect(caseDeLaScene(767, 1)).toBe(CASE_TELEPHONE);
    expect(caseDeLaScene(768, 0)).toBe(CASE_ORDINATEUR);
    expect(caseDeLaScene(1920, FOULE_EN_GRAND)).toBe(CASE_ORDINATEUR);
    expect(caseDeLaScene(1920, FOULE_EN_GRAND + 1)).toBe(CASE_TELEPHONE);
  });

  it("fait prendre du recul au téléphone quand le lieu est plein", () => {
    expect(caseDeLaScene(375, FOULE_AU_TELEPHONE)).toBe(CASE_TELEPHONE);
    expect(caseDeLaScene(375, FOULE_AU_TELEPHONE + 1)).toBe(CASE_DE_LOIN);
    expect(caseDeLaScene(360, 80)).toBe(CASE_DE_LOIN);
    // Un écran large ne descend jamais sous la case du téléphone.
    expect(caseDeLaScene(1280, 80)).toBe(CASE_TELEPHONE);
  });

  it("donne au décor assez de cases pour remplir la scène, jamais moins que le plus petit décor", () => {
    expect(largeurDuDecor(328, 2)).toBe(164);
    expect(largeurDuDecor(1175, 3)).toBe(392);
    expect(largeurDuDecor(100, 2)).toBe(DECOR_LARGEUR_MIN);
    expect(largeurDuDecor(0, 2)).toBe(DECOR_LARGEUR_MIN);
    expect(largeurDuDecor(Number.NaN, 3)).toBe(DECOR_LARGEUR_MIN);
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
