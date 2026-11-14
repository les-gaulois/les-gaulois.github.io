import { describe, expect, it } from "vitest";
import { CASES_H, CASES_L } from "../../src/lib/compagnon/mouvement";
import { PRISONNIER, PRISON_H, PRISON_L, dessinDeLaPrison } from "../../src/lib/compagnon/prison";
import { casesDuGaulois, tenueAuHasard, TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { aleatoire } from "../../src/lib/logo-matrice";

// La petite prison du Gaulois compagnon rangé (dessin de Claude Fable 5.2) : ce que le script et le CSS attendent d'elle.
describe("la prison du Gaulois compagnon", () => {
  const { largeur, hauteur, images } = dessinDeLaPrison();
  const [fond, devant] = images;

  it("a deux images, le fond et le devant, aux mesures annoncées, en couleurs « #rrggbb »", () => {
    expect([largeur, hauteur]).toEqual([PRISON_L, PRISON_H]);
    expect(images.length).toBe(2);
    for (const image of images) {
      expect(image.length).toBe(PRISON_L * PRISON_H);
      for (const couleur of image) if (couleur !== null) expect(couleur).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Petite : moins grande que lui en marche (96 × 128 sur ordinateur) à un pixel par case.
    expect(PRISON_L).toBeLessThanOrEqual(72);
    expect(PRISON_H).toBeLessThanOrEqual(96);
    // Toujours le même dessin.
    expect(dessinDeLaPrison()).toEqual(dessinDeLaPrison());
  });

  it("tient le Gaulois entier, quelle que soit sa tenue, sur le fond de la cellule", () => {
    expect(PRISONNIER.x).toBeGreaterThanOrEqual(0);
    expect(PRISONNIER.y).toBeGreaterThanOrEqual(0);
    expect(PRISONNIER.x + CASES_L).toBeLessThanOrEqual(PRISON_L);
    expect(PRISONNIER.y + CASES_H).toBeLessThanOrEqual(PRISON_H);
    for (const tenue of [TENUE_DE_DEPART, ...[1, 2, 3, 4, 5, 6, 7, 8].map((graine) => tenueAuHasard(aleatoire(graine)))]) {
      casesDuGaulois(tenue).forEach((couleur, i) => {
        if (!couleur) return;
        const x = PRISONNIER.x + (i % CASES_L);
        const y = PRISONNIER.y + Math.floor(i / CASES_L);
        // Derrière chaque case du Gaulois, le fond de la cellule : il ne flotte pas sur la page.
        expect(fond[y * PRISON_L + x], `${x},${y}`).not.toBeNull();
      });
    }
  });

  it("laisse voir le Gaulois entre les barreaux : le devant couvre moins d'un tiers de la place où il se tient", () => {
    let couvertes = 0;
    for (let y = PRISONNIER.y; y < PRISONNIER.y + CASES_H; y++) {
      for (let x = PRISONNIER.x; x < PRISONNIER.x + CASES_L; x++) if (devant[y * PRISON_L + x] !== null) couvertes++;
    }
    expect(couvertes / (CASES_L * CASES_H)).toBeLessThan(1 / 3);
  });
});
