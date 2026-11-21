import { describe, expect, it } from "vitest";
import { POCHETTES_GAGNEES } from "../../src/lib/village/contrat";
import { MINI_BOOSTER_HAUTEUR, MINI_BOOSTER_LARGEUR } from "../../src/lib/jeu/loterie-dessins";
import { DISQUE_COTE, MEDAILLE_HAUTEUR, MEDAILLE_LARGEUR, PILE_HAUTEUR, PILE_LARGEUR, SABLIER_COTE, billetsDessines, disqueDeChance, medaille, petitBooster, pileDeBillets, sablier, socle } from "../../src/lib/jeu/loterie-pieces";
import type { Planche } from "../../src/lib/jeu/planche";

// Les pièces dessinées de la page « La loterie » (21 novembre 2026, dessins de Claude Fable 5.2) : leurs tailles, et ce
// qu'elles disent sans tricher (la pile suit le nombre de billets, le disque ne se vide ni ne se remplit à tort, la médaille
// dit son rang autrement que par la couleur).

/** Les cases d'une couleur exacte dans une planche. */
const compte = (p: Planche, rvb: readonly [number, number, number]): number => {
  let n = 0;
  for (let i = 0; i < p.width * p.height; i++) if (p.data[i * 4 + 3]! > 0 && p.data[i * 4] === rvb[0] && p.data[i * 4 + 1] === rvb[1] && p.data[i * 4 + 2] === rvb[2]) n++;
  return n;
};
const pareilles = (a: Planche, b: Planche): boolean => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
/** Le bleu de la part remplie du disque (PAL.B). */
const BLEU: readonly [number, number, number] = [0x2f, 0x6b, 0xff];

describe("les pièces dessinées de la loterie", () => {
  it("ont les tailles annoncées", () => {
    expect([pileDeBillets(7).width, pileDeBillets(7).height]).toEqual([PILE_LARGEUR, PILE_HAUTEUR]);
    expect([disqueDeChance(0.3).width, disqueDeChance(0.3).height]).toEqual([DISQUE_COTE, DISQUE_COTE]);
    for (const rang of [1, 2, 3] as const) expect([medaille(rang).width, medaille(rang).height]).toEqual([MEDAILLE_LARGEUR, MEDAILLE_HAUTEUR]);
    expect([sablier().width, sablier().height]).toEqual([SABLIER_COTE, SABLIER_COTE]);
    expect([socle(1, 90, 60).width, socle(1, 90, 60).height]).toEqual([90, 60]);
  });

  it("empilent plus de billets quand il y en a plus, et une place vide pour zéro", () => {
    expect([0, 1, 2, 4, 5, 19, 20, 99, 100, 5000].map(billetsDessines)).toEqual([0, 1, 2, 2, 3, 3, 4, 4, 6, 6]);
    expect(pareilles(pileDeBillets(0), pileDeBillets(1))).toBe(false);
    expect(pareilles(pileDeBillets(3), pileDeBillets(4))).toBe(true);
    expect(pareilles(pileDeBillets(4), pileDeBillets(5))).toBe(false);
  });

  it("ne vident ni ne remplissent le disque à tort : vide à 0, plein à 1, une part visible et une piste entre les deux", () => {
    expect(compte(disqueDeChance(0), BLEU)).toBe(0);
    const plein = compte(disqueDeChance(1), BLEU);
    const minuscule = compte(disqueDeChance(0.001), BLEU);
    const presque = compte(disqueDeChance(0.999), BLEU);
    expect(minuscule).toBeGreaterThan(0);
    expect(presque).toBeLessThan(plein);
    expect(compte(disqueDeChance(0.25), BLEU)).toBeLessThan(compte(disqueDeChance(0.5), BLEU));
  });

  it("donnent à chaque médaille un dessin à elle, pas seulement une couleur", () => {
    const [or, argent, bronze] = [medaille(1), medaille(2), medaille(3)];
    expect(pareilles(or, argent) || pareilles(or, bronze) || pareilles(argent, bronze)).toBe(false);
  });

  it("dessinent un petit booster pour chaque sorte qu'un lot peut donner", () => {
    for (const sorte of POCHETTES_GAGNEES) {
      const p = petitBooster(sorte);
      expect([p.width, p.height], sorte).toEqual([MINI_BOOSTER_LARGEUR, MINI_BOOSTER_HAUTEUR]);
    }
    const dessins = POCHETTES_GAGNEES.map(petitBooster);
    for (let i = 1; i < dessins.length; i++) expect(pareilles(dessins[0]!, dessins[i]!), POCHETTES_GAGNEES[i]).toBe(false);
  });
});
