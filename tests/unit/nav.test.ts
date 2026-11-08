import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTIONS, sectionOf } from "../../src/lib/nav";

describe("sectionOf", () => {
  it("trouve la rubrique d'une page, avec ou sans barre finale", () => {
    expect(sectionOf("/rivaux")?.label).toBe("Résultats");
    expect(sectionOf("/rivaux/")?.label).toBe("Résultats");
    expect(sectionOf("/parties")?.label).toBe("Actu");
  });
  it("range une fiche de membre dans sa rubrique", () => {
    expect(sectionOf("/membres/abc123")?.label).toBe("Membres");
  });
  it("ne range ni l'accueil ni les pages personnelles", () => {
    expect(sectionOf("/")).toBeNull();
    expect(sectionOf("/compte")).toBeNull();
    expect(sectionOf("/direction")).toBeNull();
  });
  it("ne confond pas deux adresses qui commencent pareil", () => {
    expect(sectionOf("/cartes")).toBeNull();
    expect(sectionOf("/membres-du-clan")).toBeNull();
  });
});

describe("SECTIONS", () => {
  const pages = SECTIONS.flatMap((s) => s.pages);
  it("garde le menu assez court pour tenir sur une ligne", () => {
    // Avec le bouton « Nouveautés », l'en-tête de l'encadrement connecté n'a plus la place d'une septième rubrique : voir docs/DESIGN.md.
    expect(SECTIONS.length).toBeLessThanOrEqual(6);
  });
  it("ouvre chaque rubrique sur sa première page", () => {
    for (const s of SECTIONS) expect(s.href).toBe(s.pages[0]?.href);
  });
  it("ne cite une page qu'une fois", () => {
    expect(new Set(pages.map((p) => p.href)).size).toBe(pages.length);
  });
  it("ne cite que des pages qui existent", () => {
    const files = readdirSync("src/pages");
    for (const p of pages) expect(files, p.href).toContain(`${p.href.slice(1)}.astro`);
  });
});
