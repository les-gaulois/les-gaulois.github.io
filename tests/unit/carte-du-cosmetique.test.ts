import { describe, expect, it } from "vitest";
import { OBJETS, vignetteDeLObjet } from "../../src/lib/gaulois";
import {
  CARTE,
  CARTE_COUCHEE,
  CONTOURS,
  REBORDS,
  contourDe,
  cosmos,
  devant,
  estLisse,
  finitionDe,
  flottantDe,
  graineDe,
  placerLaChose,
  rareteDeLaCarte,
  rouelle,
  sceneDeLaCarte,
  sceneQuiCouvre,
  spirales,
  type RareteDeLaCarte,
} from "../../src/lib/jeu/carte-du-cosmetique";
import { cleDeLObjet, accentDeLaChose } from "../../src/lib/village/fonds-objets";

/** Toutes les raretés de la carte, de base au divin. */
const RARETES: readonly RareteDeLaCarte[] = ["base", "commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin"];

/** Chaque objet du catalogue qui a un dessin, avec sa clé de fond et sa rareté de carte. */
const OBJETS_DESSINES = Object.entries(OBJETS as unknown as Record<string, Record<string, { rarete?: string | null }>>).flatMap(([e, liste]) =>
  Object.entries(liste).flatMap(([id, o]) => {
    const v = vignetteDeLObjet(e as never, id);
    return v ? [{ e, id, v, rarete: rareteDeLaCarte(o.rarete ?? null) }] : [];
  }),
);

describe("la carte des cosmétiques, modèle unique", () => {
  it("a la forme d'une carte à collectionner, 63 sur 88, et ses rangées se suivent sans trou", () => {
    expect(CARTE.largeur / CARTE.hauteur).toBeCloseTo(63 / 88, 2);
    expect(CARTE_COUCHEE.hauteur / CARTE_COUCHEE.largeur).toBeCloseTo(63 / 88, 1);
    for (const f of [CARTE, CARTE_COUCHEE]) {
      expect(f.haut[0]).toBe(0);
      expect(f.zone[0]).toBe(f.haut[1] + 1);
      expect(f.effets[0]).toBe(f.zone[1] + 1);
      expect(f.bas[0]).toBe(f.effets[1] + 1);
      expect(f.bas[1]).toBe(f.hauteur - 1);
    }
  });

  it("chaque rareté a son rebord, son contour, et le cran de son écriture choisi par le pilote", () => {
    for (const r of RARETES) {
      expect(REBORDS[r]).toMatch(/^#[0-9a-f]{6}$/);
      expect(CONTOURS[r]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(flottantDe("divin")).toBe("plein");
    expect(flottantDe("legendaire")).toBe("plein");
    expect(flottantDe("mystique")).toBe("voile");
    expect(flottantDe("epique")).toBe("verre");
    for (const r of ["base", "commun", "peu-commun"] as const) {
      expect(flottantDe(r)).toBeNull();
      expect(estLisse(r)).toBe(true);
      expect(finitionDe(r)).toEqual({ finition: null, devant: null });
    }
    expect(finitionDe("divin")).toEqual({ finition: "prisme", devant: "etoiles" });
    expect(finitionDe("legendaire")).toEqual({ finition: "dorure", devant: "feuilles" });
    expect(finitionDe("mystique")).toEqual({ finition: "rouelle", devant: "email" });
    expect(finitionDe("epique")).toEqual({ finition: "gravure", devant: "eclats" });
    expect(rareteDeLaCarte(null)).toBe("base");
    expect(rareteDeLaCarte("inconnue")).toBe("base");
  });

  it("chaque objet tient en grand dans l'image, agrandi d'un nombre entier de fois, au milieu", () => {
    expect(OBJETS_DESSINES.length).toBeGreaterThan(200);
    for (const { v } of OBJETS_DESSINES) {
      const p = placerLaChose(v.largeur, v.hauteur);
      expect(Number.isInteger(p.k) && p.k >= 1 && p.k <= 3).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(5);
      expect(p.x + p.l).toBeLessThanOrEqual(CARTE.largeur - 5);
      expect(p.y).toBeGreaterThanOrEqual(CARTE.zone[0]);
      expect(p.y + p.h - 1).toBeLessThanOrEqual(CARTE.zone[1]);
      expect(Math.abs(p.x + p.l / 2 - CARTE.largeur / 2)).toBeLessThanOrEqual(1);
    }
  });

  it("au sol ou contre le bas, la chose se pose sur la dernière rangée de l'image", () => {
    const p = placerLaChose(20, 18, "sol");
    expect(p.y + p.h).toBe(CARTE.zone[1]);
  });

  it("le contour cerne la chose sans jamais la couvrir, d'une case tout autour", () => {
    for (const { v } of OBJETS_DESSINES.slice(0, 60)) {
      const c = contourDe(v, "#ff2e4a");
      expect(c.width).toBe(v.largeur + 2);
      expect(c.height).toBe(v.hauteur + 2);
      let cases = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          if (c.data[(y * c.width + x) * 4 + 3] === 0) continue;
          cases++;
          const dx = x - 1;
          const dy = y - 1;
          expect(dx >= 0 && dy >= 0 && dx < v.largeur && dy < v.hauteur && v.cases[dy * v.largeur + dx]).toBeFalsy();
        }
      expect(cases).toBeGreaterThan(0);
    }
  });

  it("la scène remplit toute la carte, sans case vide", () => {
    for (const { e, id, v, rarete } of OBJETS_DESSINES.filter((_, i) => i % 25 === 0)) {
      const cle = cleDeLObjet(e, id);
      const s = sceneDeLaCarte(cle, rarete, accentDeLaChose(cle, v), placerLaChose(v.largeur, v.hauteur));
      expect(s.largeur).toBe(CARTE.largeur);
      expect(s.hauteur).toBe(CARTE.hauteur);
      expect(s.cases.every((c) => typeof c === "string")).toBe(true);
    }
  });

  it("une bannière (124 sur 80) se voit entière sur la carte couchée", () => {
    const cases = Array.from({ length: 124 * 80 }, (_, i) => (i % 7 === 0 ? "#123456" : "#abcdef"));
    const s = sceneQuiCouvre({ largeur: 124, hauteur: 80, cases }, CARTE_COUCHEE.largeur, CARTE_COUCHEE.hauteur);
    const oy = Math.round((CARTE_COUCHEE.hauteur - 80) / 2);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 124; x++) expect(s.cases[(y + oy) * 124 + x]).toBe(cases[y * 124 + x]);
  });

  it("les motifs ont leur taille, et ceux qui sont semés sont les mêmes pour la même chose", () => {
    const g = graineDe("objet/tete/couronne");
    expect(graineDe("objet/tete/couronne")).toBe(g);
    expect(graineDe("objet/tete/casque")).not.toBe(g);
    expect([cosmos(g).width, cosmos(g).height]).toEqual([CARTE.largeur, CARTE.hauteur]);
    for (const sorte of ["eclats", "feuilles", "email"] as const) {
      const d = devant(sorte, g);
      expect([d.width, d.height]).toEqual([CARTE.largeur + 8, CARTE.hauteur + 8]);
      expect(Array.from(d.data)).toEqual(Array.from(devant(sorte, g).data));
    }
    expect([spirales().width, spirales().height]).toEqual([24, 24]);
    expect(rouelle(false).width).toBe(51);
  });
});
