import { describe, expect, it } from "vitest";
import { dessinDuCompagnon, tenueDuCompagnon } from "../../src/lib/compagnon/dessin";
import { CASES_H, CASES_L, IMAGES, LIT_H, LIT_L, NOMBRE_D_IMAGES } from "../../src/lib/compagnon/mouvement";
import { tenueBruteDuCompagnon } from "../../src/lib/compagnon/tenue";
import { TENUE_DE_DEPART, casesDuGaulois, tenueAuHasard } from "../../src/lib/gaulois";
import { aleatoire } from "../../src/lib/logo-matrice";

describe("le dessin du Gaulois compagnon", () => {
  it("montre le Gaulois de départ à qui n'a pas le sien, et ne plante jamais sur une tenue illisible", () => {
    expect(tenueDuCompagnon(tenueBruteDuCompagnon())).toEqual({ tenue: TENUE_DE_DEPART, deDepart: true });
    for (const brute of [null, undefined, "tunique", 12, [], {}, { ...TENUE_DE_DEPART, haut: "objet-inconnu" }, { ...TENUE_DE_DEPART, en_trop: "x" }]) {
      expect(tenueDuCompagnon(brute).deDepart, JSON.stringify(brute)).toBe(true);
      expect(dessinDuCompagnon(brute).gaulois.images[IMAGES.debout]).toEqual(casesDuGaulois(TENUE_DE_DEPART));
    }
  });

  it("dessine la tenue qu'on lui donne quand elle est complète", () => {
    const tenue = tenueAuHasard(aleatoire(2026));
    const dessin = dessinDuCompagnon(JSON.parse(JSON.stringify(tenue)));
    expect(dessin.deDepart).toBe(false);
    expect(dessin.gaulois.images[IMAGES.debout]).toEqual(casesDuGaulois(tenue));
  });

  it("donne quatre images de 48 × 64 cases et deux images de son lit, aux mesures que le script attend", () => {
    for (const graine of [1, 2, 3, 4, 5]) {
      const { gaulois, lit } = dessinDuCompagnon(tenueAuHasard(aleatoire(graine)));
      expect([gaulois.largeur, gaulois.hauteur]).toEqual([CASES_L, CASES_H]);
      expect(gaulois.images.length).toBe(NOMBRE_D_IMAGES);
      for (const image of gaulois.images) expect(image.length).toBe(CASES_L * CASES_H);
      expect([lit.largeur, lit.hauteur]).toEqual([LIT_L, LIT_H]);
      expect(lit.images.length).toBe(2);
      for (const image of lit.images) expect(image.length).toBe(LIT_L * LIT_H);
      for (const image of [...gaulois.images, ...lit.images]) for (const couleur of image) if (couleur !== null) expect(couleur).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("ne change que les jambes pour marcher, que les yeux pour somnoler, et que la couverture pour respirer", () => {
    const { gaulois, lit } = dessinDuCompagnon(null);
    const [debout, gauche, droite, ferme] = gaulois.images as [(string | null)[], (string | null)[], (string | null)[], (string | null)[]];
    const rangees = (a: readonly (string | null)[], b: readonly (string | null)[], largeur: number): number[] => [...new Set(a.flatMap((c, i) => (c === b[i] ? [] : [Math.floor(i / largeur)])))];
    // Les deux pieds levés ne sont pas la même image, et rien ne bouge au-dessus des jambes.
    expect(gauche).not.toEqual(droite);
    for (const pose of [gauche, droite]) {
      const touchees = rangees(debout, pose, CASES_L);
      expect(touchees.length).toBeGreaterThan(0);
      expect(Math.min(...touchees)).toBeGreaterThanOrEqual(48);
    }
    const yeux = rangees(debout, ferme, CASES_L);
    expect(yeux.length).toBeGreaterThan(0);
    expect(Math.min(...yeux)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...yeux)).toBeLessThanOrEqual(24);
    const souffle = lit.images[0]!.filter((c, i) => c !== lit.images[1]![i]).length;
    expect(souffle).toBeGreaterThan(0);
    expect(souffle).toBeLessThan(LIT_L * LIT_H * 0.15);
  });
});
