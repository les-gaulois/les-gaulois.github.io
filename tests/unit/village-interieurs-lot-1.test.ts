import { describe, expect, it } from "vitest";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../src/lib/gaulois";
import { INTERIEURS_LOT_1 } from "../../src/lib/village/interieurs/lot-1";
import { INTERIEUR_HAUTEUR, INTERIEUR_IMAGES_MAX, INTERIEUR_LARGEUR } from "../../src/lib/village/interieurs/type";
import { NUIT_PLEINE, PLEIN_JOUR, lumiereDuVillage } from "../../src/lib/village/lumiere";

const IDS = ["four", "tour", "grenier", "moulin"] as const;
const COULEUR = /^#[0-9a-f]{6}$/;
// Le 14 novembre 2026 à Paris : l'aube et le crépuscule, entre le plein jour et la nuit pleine.
const LUMIERES = [PLEIN_JOUR, NUIT_PLEINE, lumiereDuVillage(new Date("2026-11-14T06:40:00Z")), lumiereDuVillage(new Date("2026-11-14T16:20:00Z"))];

describe("les intérieurs du lot 1", () => {
  it("dessine le four, la tour, le grenier et le moulin", () => {
    expect(Object.keys(INTERIEURS_LOT_1).sort()).toEqual([...IDS].sort());
  });

  for (const id of IDS) {
    const dessin = INTERIEURS_LOT_1[id]!;

    describe(id, () => {
      it("porte son identifiant et un titre, sans chiffre", () => {
        expect(dessin.id).toBe(id);
        expect(dessin.titre.trim().length).toBeGreaterThan(3);
        expect(dessin.titre).not.toMatch(/\d/);
      });

      it("tient dans les bornes de taille et d'images", () => {
        expect(dessin.largeur).toBeGreaterThanOrEqual(INTERIEUR_LARGEUR.min);
        expect(dessin.largeur).toBeLessThanOrEqual(INTERIEUR_LARGEUR.max);
        expect(dessin.hauteur).toBeGreaterThanOrEqual(INTERIEUR_HAUTEUR.min);
        expect(dessin.hauteur).toBeLessThanOrEqual(INTERIEUR_HAUTEUR.max);
        expect(Number.isInteger(dessin.images)).toBe(true);
        expect(dessin.images).toBeGreaterThanOrEqual(1);
        expect(dessin.images).toBeLessThanOrEqual(INTERIEUR_IMAGES_MAX);
      });

      it("garde la place du Gaulois tout entière dans le dessin", () => {
        const { x, pied } = dessin.place;
        expect(Number.isInteger(x) && Number.isInteger(pied)).toBe(true);
        expect(x - GAULOIS_LARGEUR / 2).toBeGreaterThanOrEqual(0);
        expect(x + GAULOIS_LARGEUR / 2).toBeLessThanOrEqual(dessin.largeur);
        expect(pied - GAULOIS_HAUTEUR + 1).toBeGreaterThanOrEqual(0);
        expect(pied).toBeLessThan(dessin.hauteur);
      });

      it("remplit toutes ses cases d'une couleur « #rrggbb », à chaque lumière et à chaque image", () => {
        for (const lumiere of LUMIERES) {
          for (let image = 0; image < dessin.images; image++) {
            const decor = dessin.dessiner(lumiere, image);
            expect(decor.largeur).toBe(dessin.largeur);
            expect(decor.hauteur).toBe(dessin.hauteur);
            expect(decor.cases).toHaveLength(dessin.largeur * dessin.hauteur);
            expect(decor.cases.filter((c) => typeof c !== "string" || !COULEUR.test(c))).toEqual([]);
          }
        }
      });

      it("donne le même dessin pour la même lumière et la même image", () => {
        for (const lumiere of [PLEIN_JOUR, NUIT_PLEINE]) {
          for (let image = 0; image < dessin.images; image++) expect(dessin.dessiner(lumiere, image).cases).toEqual(dessin.dessiner(lumiere, image).cases);
        }
      });

      it("change entre le jour et la nuit", () => {
        expect(dessin.dessiner(PLEIN_JOUR, 0).cases).not.toEqual(dessin.dessiner(NUIT_PLEINE, 0).cases);
      });

      it("boucle sur ses images, et chacune diffère de la suivante", () => {
        expect(dessin.dessiner(PLEIN_JOUR, dessin.images).cases).toEqual(dessin.dessiner(PLEIN_JOUR, 0).cases);
        for (let image = 1; image < dessin.images; image++) expect(dessin.dessiner(PLEIN_JOUR, image).cases).not.toEqual(dessin.dessiner(PLEIN_JOUR, image - 1).cases);
      });

      it("ne change que peu de cases d'une image à l'autre : un mouvement lent, rien qui clignote", () => {
        const total = dessin.largeur * dessin.hauteur;
        for (let image = 0; image < dessin.images; image++) {
          const avant = dessin.dessiner(PLEIN_JOUR, image).cases;
          const apres = dessin.dessiner(PLEIN_JOUR, (image + 1) % dessin.images).cases;
          let change = 0;
          for (let i = 0; i < total; i++) if (avant[i] !== apres[i]) change++;
          expect(change / total).toBeLessThan(0.04);
        }
      });

      it("n'allume rien de plus en plein jour : la nuit n'est jamais plus claire que le jour", () => {
        const clarte = (cases: (string | null)[]): number => cases.reduce((s, c) => s + parseInt(c!.slice(1, 3), 16) + parseInt(c!.slice(3, 5), 16) + parseInt(c!.slice(5, 7), 16), 0);
        expect(clarte(dessin.dessiner(NUIT_PLEINE, 0).cases)).toBeLessThan(clarte(dessin.dessiner(PLEIN_JOUR, 0).cases));
      });
    });
  }
});
