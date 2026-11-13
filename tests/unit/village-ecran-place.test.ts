import { describe, expect, it } from "vitest";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { DECOR_HAUTEUR, DECOR_LARGEUR_MIN, TUILE_DU_SOL, composerDecor, feuDuDecor, placesDuDecor, tuileDuSol } from "../../src/lib/village/decor";
import {
  CASE_ORDINATEUR,
  CASE_TELEPHONE,
  FOULE_EN_GRAND,
  caseDuDecor,
  compteDeLaPlace,
  largeurDuDecor,
  lireVillage,
  messageDeLaPlace,
  ordreDeLaPlace,
  sonGauloisManque,
  tailleDesGaulois,
} from "../../src/lib/village/ecran-place";

const gaulois = (nom: string, moi = false) => ({ nom, tenue: TENUE_DE_DEPART, moi });

describe("le décor de la place", () => {
  it("se compose pour toute largeur, sans case vide ni couleur mal écrite", () => {
    for (const largeur of [DECOR_LARGEUR_MIN, 164, 251, 586, 640]) {
      const decor = composerDecor(largeur);
      expect(decor.largeur).toBe(largeur);
      expect(decor.hauteur).toBe(DECOR_HAUTEUR);
      expect(decor.cases).toHaveLength(largeur * DECOR_HAUTEUR);
      expect(decor.cases.every((couleur) => typeof couleur === "string" && /^#[0-9a-f]{6}$/.test(couleur))).toBe(true);
    }
  });

  it("ne descend pas sous sa plus petite largeur", () => {
    expect(composerDecor(10).largeur).toBe(DECOR_LARGEUR_MIN);
    expect(composerDecor(163.6).largeur).toBe(163);
  });

  it("donne toujours le même dessin pour la même largeur", () => {
    expect(composerDecor(300).cases).toEqual(composerDecor(300).cases);
  });

  it("garde le feu au milieu, et ses flammes dans le décor", () => {
    for (const largeur of [164, 586]) {
      const feu = feuDuDecor(largeur);
      expect(feu.x).toBe(Math.floor(largeur / 2));
      expect(feu.y).toBeGreaterThan(30);
      expect(feu.y).toBeLessThan(DECOR_HAUTEUR);
      // Le cœur de la flamme, clair, est bien dessiné là où l'écran pose la fumée.
      const decor = composerDecor(largeur);
      expect(decor.cases[(feu.y + 9) * decor.largeur + feu.x]).toBe("#fff1a8");
    }
  });

  it("range des huttes des deux côtés du feu dès la largeur d'un téléphone, sans rien couper au bord", () => {
    const telephone = placesDuDecor(164);
    expect(telephone.filter((p) => p.type === "hutte")).toHaveLength(2);
    for (const largeur of [164, 400, 586]) {
      const places = placesDuDecor(largeur);
      expect(places.length % 2).toBe(0);
      for (const place of places) {
        expect(place.x - 25).toBeGreaterThanOrEqual(0);
        expect(place.x + 25).toBeLessThanOrEqual(largeur);
      }
    }
    expect(placesDuDecor(586).some((p) => p.type === "arbre")).toBe(true);
  });

  it("prolonge l'herbe du décor par une tuile qui se répète sans raccord", () => {
    const tuile = tuileDuSol();
    expect(tuile.largeur).toBe(TUILE_DU_SOL);
    expect(tuile.cases).toHaveLength(TUILE_DU_SOL * TUILE_DU_SOL);
    // Loin du feu, la dernière rangée du décor et la première de la tuile se suivent : mêmes touffes, une rangée plus bas.
    const decor = composerDecor(DECOR_LARGEUR_MIN);
    const avantDerniere = DECOR_HAUTEUR - 1;
    const rangeeDuDecor = Array.from({ length: TUILE_DU_SOL }, (_, x) => decor.cases[avantDerniere * decor.largeur + x]);
    const dernierDeLaTuile = Array.from({ length: TUILE_DU_SOL }, (_, x) => tuile.cases[(TUILE_DU_SOL - 1) * TUILE_DU_SOL + x]);
    expect(rangeeDuDecor).toEqual(dernierDeLaTuile);
  });
});

describe("l'écran de la place", () => {
  it("dessine le décor en cases de 2 pixels sur téléphone, 3 au-delà", () => {
    expect(caseDuDecor(360)).toBe(CASE_TELEPHONE);
    expect(caseDuDecor(767)).toBe(CASE_TELEPHONE);
    expect(caseDuDecor(768)).toBe(CASE_ORDINATEUR);
    expect(caseDuDecor(1920)).toBe(CASE_ORDINATEUR);
  });

  it("remplit la scène, sans jamais demander un décor trop étroit", () => {
    expect(largeurDuDecor(326, 2)).toBe(163);
    expect(largeurDuDecor(327, 2)).toBe(164);
    expect(largeurDuDecor(1758, 3)).toBe(586);
    expect(largeurDuDecor(0, 2)).toBe(DECOR_LARGEUR_MIN);
    expect(largeurDuDecor(Number.NaN, 2)).toBe(DECOR_LARGEUR_MIN);
  });

  it("montre les Gaulois en grand tant qu'ils sont peu nombreux", () => {
    expect(tailleDesGaulois(1)).toBe("grand");
    expect(tailleDesGaulois(FOULE_EN_GRAND)).toBe("grand");
    expect(tailleDesGaulois(FOULE_EN_GRAND + 1)).toBe("petit");
    expect(tailleDesGaulois(80)).toBe("petit");
  });

  it("lit la réponse du serveur et laisse de côté un Gaulois illisible", () => {
    const village = lireVillage({
      ok: true,
      gaulois: [gaulois("Brennos", true), { nom: "", tenue: TENUE_DE_DEPART, moi: false }, { nom: "Sans tenue", tenue: { peau: "verte" }, moi: false }, null, gaulois("  Epona  ")],
    });
    expect(village?.gaulois.map((g) => [g.nom, g.moi])).toEqual([
      ["Brennos", true],
      ["Epona", false],
    ]);
    expect(lireVillage({ ok: true, gaulois: [] })).toEqual({ ok: true, gaulois: [] });
    expect(lireVillage(null)).toBeNull();
    expect(lireVillage({ ok: true })).toBeNull();
  });

  it("place le sien d'abord, les autres dans l'ordre du serveur", () => {
    expect(ordreDeLaPlace([gaulois("A"), gaulois("B"), gaulois("Moi", true), gaulois("C")]).map((g) => g.nom)).toEqual(["Moi", "A", "B", "C"]);
    expect(ordreDeLaPlace([])).toEqual([]);
  });

  it("dit quand le membre n'a pas encore de Gaulois sur la place", () => {
    expect(sonGauloisManque({ ok: true, gaulois: [gaulois("A")] })).toBe(true);
    expect(sonGauloisManque({ ok: true, gaulois: [gaulois("A", true)] })).toBe(false);
  });

  it("compte les Gaulois, et ne compte pas une place vide", () => {
    expect(compteDeLaPlace(1)).toBe("1 Gaulois sur la place");
    expect(compteDeLaPlace(80)).toBe("80 Gaulois sur la place");
    expect(compteDeLaPlace(0)).toBeNull();
  });

  it("dit en peu de mots que la place s'ouvre après la validation", () => {
    expect(messageDeLaPlace("not_validated")).toBe("La place s'ouvre une fois votre compte validé.");
    expect(messageDeLaPlace("network")).toBeNull();
  });
});
