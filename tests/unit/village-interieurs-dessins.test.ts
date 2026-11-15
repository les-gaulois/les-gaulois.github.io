import { describe, expect, it } from "vitest";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../src/lib/gaulois";
import { boiteDuGaulois } from "../../src/lib/village/ecran-interieur";
import { BATIMENTS_A_INTERIEUR, INTERIEUR_HAUTEUR, INTERIEUR_IMAGES_MAX, INTERIEUR_LARGEUR, INTERIEURS, interieurDe } from "../../src/lib/village/interieurs";
import { NUIT_PLEINE, PLEIN_JOUR, lumiereDuVillage } from "../../src/lib/village/lumiere";

/*
 * Les dessins des intérieurs (`src/lib/village/interieurs/lot-*.ts`, design Claude Fable 5.2), tels que la fenêtre les
 * attend (`type.ts`) : leur taille, leurs images, la place du Gaulois, des cases toutes pleines, le même dessin pour la
 * même lumière et la même image. Tant qu'aucun n'est dessiné, il n'y a rien à contrôler.
 */

const DESSINES = Object.entries(INTERIEURS);
/** La nuit, le plein jour, et le crépuscule du 14 novembre 2026 à Paris (16 h 55, heure d'hiver). */
const LUMIERES = [NUIT_PLEINE, PLEIN_JOUR, lumiereDuVillage(new Date("2026-11-14T15:55:00.000Z"))];

describe("les dessins des intérieurs", () => {
  it("chacun est rangé sous son bâtiment, qui a un dedans", () => {
    for (const [cle, dessin] of DESSINES) {
      expect(dessin!.id).toBe(cle);
      expect(BATIMENTS_A_INTERIEUR).toContain(cle);
      expect(interieurDe(cle)).toBe(dessin);
    }
    expect(interieurDe("puits")).toBeNull();
  });

  it("un titre en mots (« Dans le moulin »), une taille dans les bornes, de une à quatre images", () => {
    for (const [cle, dessin] of DESSINES) {
      const d = dessin!;
      expect(d.titre, cle).toMatch(/^Dans /);
      expect(d.titre, cle).not.toMatch(/\d/);
      expect(Number.isInteger(d.largeur) && d.largeur >= INTERIEUR_LARGEUR.min && d.largeur <= INTERIEUR_LARGEUR.max, `${cle} : largeur ${d.largeur}`).toBe(true);
      expect(Number.isInteger(d.hauteur) && d.hauteur >= INTERIEUR_HAUTEUR.min && d.hauteur <= INTERIEUR_HAUTEUR.max, `${cle} : hauteur ${d.hauteur}`).toBe(true);
      expect(Number.isInteger(d.images) && d.images >= 1 && d.images <= INTERIEUR_IMAGES_MAX, `${cle} : ${d.images} images`).toBe(true);
    }
  });

  it("le Gaulois du visiteur tient tout entier à sa place, dans le dessin", () => {
    for (const [cle, dessin] of DESSINES) {
      const d = dessin!;
      const coin = boiteDuGaulois(d.place, { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR });
      expect(Number.isInteger(d.place.x) && Number.isInteger(d.place.pied), cle).toBe(true);
      expect(coin.x >= 0 && coin.y >= 0 && coin.x + GAULOIS_LARGEUR <= d.largeur && coin.y + GAULOIS_HAUTEUR <= d.hauteur, `${cle} : Gaulois en ${coin.x}, ${coin.y}`).toBe(true);
    }
  });

  it("à chaque lumière et à chaque image : sa taille, toutes les cases pleines, le même dessin à chaque fois", () => {
    for (const [cle, dessin] of DESSINES) {
      const d = dessin!;
      for (const lumiere of LUMIERES) {
        for (let image = 0; image < d.images; image++) {
          const decor = d.dessiner(lumiere, image);
          expect(decor.largeur, cle).toBe(d.largeur);
          expect(decor.hauteur, cle).toBe(d.hauteur);
          expect(decor.cases, cle).toHaveLength(d.largeur * d.hauteur);
          const illisible = decor.cases.findIndex((c) => typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c));
          expect(illisible, `${cle}, image ${image} : case ${illisible} (${String(decor.cases[illisible])})`).toBe(-1);
          expect(d.dessiner(lumiere, image).cases, cle).toEqual(decor.cases);
        }
      }
    }
  });
});
