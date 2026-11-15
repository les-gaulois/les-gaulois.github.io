import { describe, expect, it } from "vitest";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../src/lib/gaulois";
import { INTERIEUR_HAUTEUR, INTERIEUR_IMAGES_MAX, INTERIEUR_LARGEUR, interieurDe } from "../../src/lib/village/interieurs";
import { INTERIEURS_LOT_2 } from "../../src/lib/village/interieurs/lot-2";
import { NUIT_PLEINE, PLEIN_JOUR, lumiereDuVillage } from "../../src/lib/village/lumiere";

const IDS = ["colombier", "etable", "grande-tour"] as const;
const COULEUR = /^#[0-9a-f]{6}$/;
// Le 14 novembre 2026, à l'heure de Paris : l'aube et le crépuscule.
const AUBE = lumiereDuVillage(new Date("2026-11-14T06:40:00Z"));
const CREPUSCULE = lumiereDuVillage(new Date("2026-11-14T16:20:00Z"));

describe("les intérieurs du lot 2 : colombier, étable, grande tour", () => {
  it("dessine les trois, et eux seuls", () => {
    expect(Object.keys(INTERIEURS_LOT_2).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(interieurDe(id)).toBe(INTERIEURS_LOT_2[id]);
  });

  for (const id of IDS) {
    const dessin = INTERIEURS_LOT_2[id]!;

    it(`${id} : reste dans les bornes, et son titre est en français`, () => {
      expect(dessin.id).toBe(id);
      expect(dessin.titre).toMatch(/^Dans /);
      expect(dessin.largeur).toBeGreaterThanOrEqual(INTERIEUR_LARGEUR.min);
      expect(dessin.largeur).toBeLessThanOrEqual(INTERIEUR_LARGEUR.max);
      expect(dessin.hauteur).toBeGreaterThanOrEqual(INTERIEUR_HAUTEUR.min);
      expect(dessin.hauteur).toBeLessThanOrEqual(INTERIEUR_HAUTEUR.max);
      expect(dessin.images).toBeGreaterThanOrEqual(1);
      expect(dessin.images).toBeLessThanOrEqual(INTERIEUR_IMAGES_MAX);
    });

    it(`${id} : le Gaulois du visiteur tient en entier dans le dessin`, () => {
      const gauche = dessin.place.x - Math.floor(GAULOIS_LARGEUR / 2);
      expect(gauche).toBeGreaterThanOrEqual(0);
      expect(gauche + GAULOIS_LARGEUR).toBeLessThanOrEqual(dessin.largeur);
      expect(dessin.place.pied - GAULOIS_HAUTEUR + 1).toBeGreaterThanOrEqual(0);
      expect(dessin.place.pied).toBeLessThan(dessin.hauteur);
    });

    it(`${id} : toutes les cases sont pleines, en « #rrggbb », à chaque lumière et à chaque image`, () => {
      for (const lumiere of [PLEIN_JOUR, NUIT_PLEINE, AUBE, CREPUSCULE]) {
        for (let image = 0; image < dessin.images; image++) {
          const decor = dessin.dessiner(lumiere, image);
          expect(decor.largeur).toBe(dessin.largeur);
          expect(decor.hauteur).toBe(dessin.hauteur);
          expect(decor.cases).toHaveLength(dessin.largeur * dessin.hauteur);
          expect(decor.cases.filter((c) => typeof c !== "string" || !COULEUR.test(c))).toEqual([]);
        }
      }
    });

    it(`${id} : même lumière et même image, même dessin`, () => {
      for (let image = 0; image < dessin.images; image++) {
        const premier = dessin.dessiner(CREPUSCULE, image);
        expect(dessin.dessiner({ ...CREPUSCULE }, image).cases).toEqual(premier.cases);
        // Un dessin rendu n'est pas celui qu'on garde : le changer ne change pas le suivant.
        premier.cases[0] = "#ff00ff";
        expect(dessin.dessiner(CREPUSCULE, image).cases[0]).not.toBe("#ff00ff");
      }
      // L'image se compte en rond, et l'image 0 est celle qui reste quand tout est figé.
      expect(dessin.dessiner(PLEIN_JOUR, dessin.images).cases).toEqual(dessin.dessiner(PLEIN_JOUR, 0).cases);
      expect(dessin.dessiner(PLEIN_JOUR, -1).cases).toEqual(dessin.dessiner(PLEIN_JOUR, dessin.images - 1).cases);
    });

    it(`${id} : la nuit n'est pas le jour, et le mouvement lent change peu de cases`, () => {
      const jour = dessin.dessiner(PLEIN_JOUR, 0).cases;
      const nuit = dessin.dessiner(NUIT_PLEINE, 0).cases;
      expect(nuit).not.toEqual(jour);
      for (let image = 1; image < dessin.images; image++) {
        const autre = dessin.dessiner(PLEIN_JOUR, image).cases;
        const changees = autre.filter((c, i) => c !== jour[i]).length;
        expect(changees).toBeGreaterThan(0);
        // Rien ne clignote : une image ne refait jamais plus d'un vingtième du dessin.
        expect(changees).toBeLessThan(jour.length / 20);
      }
    });
  }
});
