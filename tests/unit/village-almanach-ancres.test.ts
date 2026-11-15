import { describe, expect, it } from "vitest";
import { BATIMENT_IDS } from "../../src/lib/village/chantier-liste";
import { ANCRES, ancreDe, piedDansUneZone } from "../../src/lib/village/monde/almanach/ancres";
import { taillesDesDessins } from "../../src/lib/village/monde/composition";
import { MODELES } from "../../src/lib/village/monde/maisons";
import { litDuRuisseau } from "../../src/lib/village/monde/pieces";
import { BANDE_BAS, PIED, RUE_HAUTEUR, emplacementDuBatiment, emplacementsDe, hautDansLeMonde, planDuMonde } from "../../src/lib/village/monde/plan";

const tailles = taillesDesDessins();
const VILLAGES = [0, 1, 50, 300, 1000];

describe("les lieux de l'almanach", () => {
  it("ont des identifiants uniques en minuscules et tirets, une description, des bâtiments du chantier", () => {
    const ids = ANCRES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ANCRES) {
      expect(a.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(a.description.length).toBeGreaterThan(20);
      for (const b of a.batiments) expect(BATIMENT_IDS).toContain(b);
      expect(ancreDe(a.id)).toBe(a);
    }
    expect(ancreDe("nulle-part")).toBeNull();
  });

  it("ont une zone de leur propre milieu, et chaque zone tient dans leur place", () => {
    for (const a of ANCRES) {
      expect(a.zones.some((z) => z.milieu === a.milieu), a.id).toBe(true);
      for (const z of a.zones) {
        expect(z.de, a.id).toBeLessThanOrEqual(z.a);
        expect(z.haut, a.id).toBeLessThanOrEqual(z.bas);
        expect(z.de, a.id).toBeGreaterThanOrEqual(-a.place.gauche);
        expect(z.a, a.id).toBeLessThanOrEqual(a.place.droite);
        expect(z.bas, a.id).toBeLessThanOrEqual(a.place.dessous);
      }
    }
  });

  for (const habitants of VILLAGES) {
    it(`se posent dans le monde de ${habitants} Gaulois, place comprise, au premier plan, dans le bas ou dans le ciel`, () => {
      const plan = planDuMonde(tailles, habitants);
      for (const a of ANCRES) {
        const p = a.point(plan);
        expect(Number.isInteger(p.x) && Number.isInteger(p.y), a.id).toBe(true);
        expect(p.x - a.place.gauche, a.id).toBeGreaterThanOrEqual(0);
        expect(p.x + a.place.droite, a.id).toBeLessThan(plan.largeur);
        expect(p.y - a.place.dessus, a.id).toBeGreaterThanOrEqual(0);
        expect(p.y + a.place.dessous, a.id).toBeLessThan(plan.hauteur);
        // Jamais sur une terrasse du fond : le sol et l'eau sont dans la grand-rue ou dans le bas.
        for (const z of a.zones.filter((zone) => zone.milieu === "sol" || zone.milieu === "eau")) {
          const y = p.y + z.haut;
          const dansLaRue = y >= plan.dy0 + 300 && p.y + z.bas <= plan.dy0 + RUE_HAUTEUR;
          const dansLeBas = y >= plan.dyBas + 262 && p.y + z.bas < plan.hauteur;
          expect(dansLaRue || dansLeBas, `${a.id} ${z.milieu}`).toBe(true);
        }
        // Les bâtiments demandés sont dans ce monde.
        for (const b of a.batiments) expect(emplacementDuBatiment(plan, b), a.id).toBeDefined();
      }
    });
  }

  it("gardent la même place autour de leur point, quel que soit le nombre de Gaulois", () => {
    const reference = planDuMonde(tailles, 0);
    for (const habitants of VILLAGES) {
      const plan = planDuMonde(tailles, habitants);
      // Le ruisseau, la mer, les maisons de la grand-rue : ce qui entoure un point ne bouge pas avec lui.
      expect(plan.ruisseau.largeur).toBe(reference.ruisseau.largeur);
      expect(plan.mer.a - plan.mer.de).toBeGreaterThanOrEqual(1500);
      for (const rang of [0, 2]) {
        const e = emplacementsDe(plan, "maison")[rang]!;
        const r = emplacementsDe(reference, "maison")[rang]!;
        expect(e.piece).toEqual(r.piece);
        expect(hautDansLeMonde(e) - plan.dy0).toBe(hautDansLeMonde(r) - reference.dy0);
      }
    }
  });

  it("au gué, mettent l'eau dans le lit du ruisseau et les rives hors de l'eau, rangée par rangée", () => {
    const plan = planDuMonde(tailles, 300);
    const gue = ancreDe("gue-du-ruisseau")!;
    const p = gue.point(plan);
    for (const z of gue.zones.filter((zone) => zone.milieu === "eau" || zone.milieu === "sol")) {
      for (let y = z.haut; y <= z.bas; y++) {
        const lit = litDuRuisseau(plan, p.y - plan.dy0 + y);
        const eau = { de: lit.x - lit.demi - p.x, a: lit.x + lit.demi - p.x };
        if (z.milieu === "eau") {
          expect(z.de, `eau rangée ${y}`).toBeGreaterThanOrEqual(eau.de);
          expect(z.a, `eau rangée ${y}`).toBeLessThanOrEqual(eau.a);
          // La ligne d'eau d'un figurant, jusqu'à quatre rangées au-dessus de son pied, est encore dans l'eau.
          const haut = litDuRuisseau(plan, p.y - plan.dy0 + y - 4);
          expect(z.de).toBeGreaterThanOrEqual(haut.x - haut.demi - p.x);
          expect(z.a).toBeLessThanOrEqual(haut.x + haut.demi - p.x);
        } else expect(z.a < eau.de || z.de > eau.a, `rive rangée ${y}`).toBe(true);
      }
    }
    // Les rives s'arrêtent à la bande où marchent les Gaulois.
    for (const z of gue.zones.filter((zone) => zone.milieu === "sol")) expect(p.y + z.bas).toBeLessThanOrEqual(plan.dy0 + BANDE_BAS);
  });

  it("sur un toit, posent le pied sur le faîte, loin de la cheminée, juste devant la maison", () => {
    for (const habitants of VILLAGES) {
      const plan = planDuMonde(tailles, habitants);
      for (const [id, rang] of [
        ["toit-de-la-chaumiere", 0],
        ["toit-des-colombages", 2],
      ] as const) {
        const a = ancreDe(id)!;
        const e = emplacementsDe(plan, "maison")[rang]!;
        const p = a.point(plan);
        const zone = a.zones.find((z) => z.milieu === "toit")!;
        expect(p.x + zone.de).toBeGreaterThanOrEqual(e.x);
        expect(p.x + zone.a).toBeLessThan(e.x + e.largeur);
        // Le pied, quelques rangées sous le haut de la maison : sur sa coiffe.
        expect(p.y - hautDansLeMonde(e)).toBeGreaterThanOrEqual(5);
        expect(p.y - hautDansLeMonde(e)).toBeLessThanOrEqual(8);
        // Derrière les Gaulois de la rue (pieds de 326 à 372), devant la maison (pied à 301).
        expect(p.y + a.profondeur! - plan.dy0).toBeGreaterThan(PIED);
        expect(p.y + a.profondeur! - plan.dy0).toBeLessThan(326);
        expect(e.piece.sorte === "maison" && MODELES[e.piece.modele].hauteur).toBe(e.hauteur);
      }
    }
  });

  it("disent si un pied tient dans une zone, toute sa largeur comprise", () => {
    const a = ancreDe("rue-des-maisons")!;
    expect(piedDansUneZone(a, "sol", -20, 19, 0)).toBe(true);
    expect(piedDansUneZone(a, "sol", 380, 419, 0)).toBe(false);
    expect(piedDansUneZone(a, "eau", -20, 19, 0)).toBe(false);
  });
});
