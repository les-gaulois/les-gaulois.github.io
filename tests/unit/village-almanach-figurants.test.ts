import { describe, expect, it } from "vitest";
import { FIGURANTS } from "../../src/lib/village/monde/almanach/figurants";
import { NUIT_PLEINE, PLEIN_JOUR } from "../../src/lib/village/lumiere";

const COULEUR = /^#[0-9a-f]{6}$/;
const MILIEUX = ["sol", "eau", "ciel", "toit", "nappe"];
const ALLURES = ["posee", "lente", "pas", "vol"];
const PHASES = ["nuit", "aube", "jour", "crepuscule"];

describe("les figurants de l'almanach", () => {
  it("sont entre 40 et 50, aux identifiants uniques, en minuscules et tirets", () => {
    expect(FIGURANTS.length).toBeGreaterThanOrEqual(40);
    expect(FIGURANTS.length).toBeLessThanOrEqual(50);
    const ids = FIGURANTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("ne refont pas les bêtes du village et couvrent tous les milieux", () => {
    for (const f of FIGURANTS) expect(f.id).not.toMatch(/poule|chien|chevre|vache|charrette|sanglier/);
    for (const milieu of MILIEUX) expect(FIGURANTS.some((f) => f.milieu === milieu)).toBe(true);
  });

  it.each(FIGURANTS.map((f) => [f.id, f] as const))("%s : fiche et dessins valides", (_id, f) => {
    expect(f.nom.length).toBeGreaterThan(3);
    expect(f.description.length).toBeGreaterThan(40);
    expect(MILIEUX).toContain(f.milieu);
    expect(ALLURES).toContain(f.allure);
    if (f.quand) {
      expect(f.quand.length).toBeGreaterThan(0);
      for (const phase of f.quand) expect(PHASES).toContain(phase);
    }
    expect(f.largeur).toBeGreaterThanOrEqual(8);
    expect(f.largeur).toBeLessThanOrEqual(480);
    expect(f.hauteur).toBeGreaterThanOrEqual(8);
    expect(f.hauteur).toBeLessThanOrEqual(200);
    expect(Number.isInteger(f.images)).toBe(true);
    expect(f.images).toBeGreaterThanOrEqual(1);
    expect(f.images).toBeLessThanOrEqual(4);
    const deJour: string[] = [];
    for (const lumiere of [PLEIN_JOUR, NUIT_PLEINE]) {
      for (let image = 0; image < f.images; image++) {
        const d = f.dessiner(lumiere, image);
        expect(d.largeur).toBe(f.largeur);
        expect(d.hauteur).toBe(f.hauteur);
        expect(d.cases.length).toBe(f.largeur * f.hauteur);
        expect(d.cases.every((c) => c === null || COULEUR.test(c))).toBe(true);
        expect(d.cases.some((c) => c !== null)).toBe(true);
        // Rien n'est tiré au hasard : la même lumière et la même image redonnent le même dessin.
        expect(f.dessiner(lumiere, image).cases).toEqual(d.cases);
        if (lumiere === PLEIN_JOUR) deJour.push(d.cases.join(","));
      }
    }
    // Chaque image du mouvement diffère des autres.
    expect(new Set(deJour).size).toBe(f.images);
  });
});
