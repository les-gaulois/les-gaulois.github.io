import { describe, expect, it } from "vitest";
import { BANNIERES, vignetteDeLaBanniere } from "../../src/lib/village/bannieres";
import { CADRE_DE_BANNIERE, sansCadre } from "../../src/lib/village/decor-banniere";
import { apercuAvecFamilier } from "../../src/lib/village/familiers";
import { TENUE_DE_DEPART, casesDuGaulois } from "../../src/lib/gaulois";

// Le décor derrière le Gaulois de « Mon Gaulois » et du sentier : la toile d'une bannière, sans son cadre.

describe("la bannière sans son cadre", () => {
  const scene = { largeur: 8, hauteur: 7, cases: Array.from({ length: 56 }, (_, i) => `#${String(i).padStart(6, "0")}`) };

  it("retire trois cases de chaque bord et garde la toile dans l'ordre", () => {
    const decor = sansCadre(scene);
    expect(decor).not.toBeNull();
    expect(decor?.largeur).toBe(8 - 2 * CADRE_DE_BANNIERE);
    expect(decor?.hauteur).toBe(7 - 2 * CADRE_DE_BANNIERE);
    // Rangée 3, colonnes 3 et 4 de la scène : les cases 27 et 28.
    expect(decor?.cases).toEqual(["#000027", "#000028"]);
  });

  it("ne rend rien pour un dessin trop petit ou incomplet", () => {
    expect(sansCadre({ largeur: 6, hauteur: 7, cases: scene.cases })).toBeNull();
    expect(sansCadre({ largeur: 8, hauteur: 6, cases: scene.cases })).toBeNull();
    expect(sansCadre({ largeur: 8, hauteur: 7, cases: scene.cases.slice(0, 20) })).toBeNull();
  });

  it("donne un décor plein à chaque bannière du catalogue", () => {
    for (const banniere of BANNIERES) {
      const vignette = vignetteDeLaBanniere(banniere.id);
      expect(vignette, banniere.id).not.toBeNull();
      const decor = vignette ? sansCadre(vignette) : null;
      expect(decor, banniere.id).not.toBeNull();
      expect(decor?.cases.length, banniere.id).toBe((decor?.largeur ?? 0) * (decor?.hauteur ?? 0));
      expect(decor?.cases.every((couleur) => /^#[0-9a-f]{6}$/i.test(couleur)), banniere.id).toBe(true);
    }
  });
});

describe("le clignement du Gaulois", () => {
  it("garde la même grille et ne change que des cases du visage", () => {
    const ouverts = apercuAvecFamilier(TENUE_DE_DEPART, null);
    const clos = apercuAvecFamilier(TENUE_DE_DEPART, null, { yeuxFermes: true });
    expect(clos.largeur).toBe(ouverts.largeur);
    expect(clos.hauteur).toBe(ouverts.hauteur);
    const changees = ouverts.cases.flatMap((couleur, i) => (couleur === clos.cases[i] ? [] : [i]));
    expect(changees.length).toBeGreaterThan(0);
    // Les yeux tiennent dans le haut du dessin : rien ne bouge sous la tête.
    expect(Math.max(...changees.map((i) => Math.floor(i / ouverts.largeur)))).toBeLessThan(ouverts.hauteur / 2);
    expect(clos.cases).toEqual(casesDuGaulois(TENUE_DE_DEPART, { yeuxFermes: true }));
  });
});
