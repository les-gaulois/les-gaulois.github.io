import { describe, expect, it } from "vitest";
import { RARETES_DE_CARTE, carteDUnLot, carteDUnRendu, carteDeRarete } from "../../src/lib/jeu/boosters";
import { COTE_DES_ICONES_DE_RARETE, COULEURS_DES_RARETES, RARETES_ILLUSTREES, iconeDeRarete, rareteDuRang, type RareteIllustree } from "../../src/lib/jeu/icones-de-rarete";
import { ENCRE } from "../../src/lib/jeu/palette";
import { type Planche, lireCouleur } from "../../src/lib/jeu/planche";

// Les icônes des raretés (src/lib/jeu/icones-de-rarete.ts, dessin de Claude Fable 5.2, 21 novembre 2026) : elles remplacent
// les losanges qui comptaient la rareté. La couleur n'est jamais le seul repère : chaque rareté a sa forme, qui s'enrichit.

const encre = lireCouleur(ENCRE).slice(0, 3).join(",");
const cle = (p: Planche): string => Array.from(p.data).join(",");
/** Les cases peintes d'une icône, sans son cerne d'encre. */
function casesColorees(p: Planche): number {
  let n = 0;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const c = p.couleur(x, y);
      if (c && c.slice(0, 3).join(",") !== encre) n++;
    }
  return n;
}
/** La forme d'une icône : ses cases peintes, cerne compris, sans leur couleur. */
const forme = (p: Planche): string => Array.from({ length: p.width * p.height }, (_, i) => (p.pleine(i % p.width, Math.floor(i / p.width)) ? "#" : ".")).join("");

describe("les icônes des raretés", () => {
  it("dessine les sept raretés, du commun au divin, sur un petit carré", () => {
    expect([...RARETES_ILLUSTREES]).toEqual(["commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin"]);
    expect(COTE_DES_ICONES_DE_RARETE).toBeGreaterThanOrEqual(9);
    expect(COTE_DES_ICONES_DE_RARETE).toBeLessThanOrEqual(11);
    for (const r of RARETES_ILLUSTREES) {
      const p = iconeDeRarete(r);
      expect([p.width, p.height], r).toEqual([COTE_DES_ICONES_DE_RARETE, COTE_DES_ICONES_DE_RARETE]);
    }
  });

  it("donne à chaque rareté une forme à elle : la couleur n'est jamais le seul repère", () => {
    const formes = RARETES_ILLUSTREES.map((r) => forme(iconeDeRarete(r)));
    expect(new Set(formes).size).toBe(RARETES_ILLUSTREES.length);
    expect(new Set(RARETES_ILLUSTREES.map((r) => cle(iconeDeRarete(r)))).size).toBe(RARETES_ILLUSTREES.length);
  });

  it("porte la couleur de sa rareté, celle des cases du site", () => {
    for (const r of RARETES_ILLUSTREES) {
      const voulue = lireCouleur(COULEURS_DES_RARETES[r]).slice(0, 3).join(",");
      const p = iconeDeRarete(r);
      let vue = false;
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.couleur(x, y)?.slice(0, 3).join(",") === voulue) vue = true;
      expect(vue, r).toBe(true);
    }
    // Les couleurs des faces des cartes de booster sont les mêmes.
    for (const r of RARETES_DE_CARTE) expect(lireCouleur(carteDeRarete("Objet", r, null).tons[2]).slice(0, 3)).toEqual(lireCouleur(COULEURS_DES_RARETES[r]).slice(0, 3));
  });

  it("monte en prestige : jamais moins de cases colorées qu'à la rareté d'avant, et bien plus au divin qu'au commun", () => {
    const comptes = RARETES_ILLUSTREES.map((r) => casesColorees(iconeDeRarete(r)));
    for (let i = 1; i < comptes.length; i++) expect(comptes[i]!, RARETES_ILLUSTREES[i]).toBeGreaterThanOrEqual(comptes[i - 1]!);
    expect(comptes.at(-1)!).toBeGreaterThanOrEqual(comptes[0]! * 2);
  });

  it("se détache d'un fond clair comme d'un fond sombre : un cerne d'encre entier, sans trou, et sa marge autour du dessin", () => {
    for (const r of RARETES_ILLUSTREES) {
      const p = iconeDeRarete(r);
      for (let y = 0; y < p.height; y++)
        for (let x = 0; x < p.width; x++) {
          const c = p.couleur(x, y);
          if (!c) continue;
          // Aucune case à demi transparente : le dessin est net sur tout fond.
          expect(c[3], `${r} (${x}, ${y})`).toBe(1);
          if (c.slice(0, 3).join(",") === encre) continue;
          // Une case colorée n'est jamais au bord de l'image ni à côté du vide : le cerne l'entoure.
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) expect(p.pleine(x + dx, y + dy), `${r} (${x}, ${y})`).toBe(true);
        }
    }
  });

  it("rend la même planche à chaque appel, sans la redessiner", () => {
    for (const r of RARETES_ILLUSTREES) expect(iconeDeRarete(r)).toBe(iconeDeRarete(r));
  });
});

describe("l'icône de rareté sur la face des cartes de booster", () => {
  /** L'icône est-elle posée sur la face, centrée ? On la cherche case pour case sous le nom. */
  function porte(face: Planche, rarete: RareteIllustree): boolean {
    const icone = iconeDeRarete(rarete);
    const x0 = Math.round((face.width - icone.width) / 2);
    for (let y0 = 40; y0 + icone.height <= face.height; y0++) {
      let pareil = true;
      for (let y = 0; y < icone.height && pareil; y++)
        for (let x = 0; x < icone.width && pareil; x++) {
          const c = icone.couleur(x, y);
          if (c && c.join(",") !== face.couleur(x0 + x, y0 + y)?.join(",")) pareil = false;
        }
      if (pareil) return true;
    }
    return false;
  }

  it("montre l'icône de la vraie rareté de la carte, et d'aucune autre", () => {
    for (const r of RARETES_DE_CARTE) {
      const face = carteDeRarete("Casque de fer", r, null).face;
      for (const autre of RARETES_DE_CARTE) expect(porte(face, autre), `${r} / ${autre}`).toBe(autre === r);
    }
    // Un nom de trois lignes laisse encore sa place à l'icône.
    expect(porte(carteDeRarete("Grande cape rouge du chef de clan", "mystique", null).face, "mystique")).toBe(true);
  });

  it("donne à un lot de statères l'icône de la rareté de même rang, et aucune à des statères rendus", () => {
    RARETES_DE_CARTE.forEach((r, i) => expect(porte(carteDUnLot(i + 1, 100).face, r), r).toBe(true));
    for (const r of RARETES_DE_CARTE) expect(porte(carteDUnRendu(600, 40).face, r), r).toBe(false);
  });
});

describe("rareteDuRang", () => {
  it("donne la rareté de chaque rang, du commun (1) au divin (6), comme les lots de statères et les cartes", () => {
    expect([1, 2, 3, 4, 5, 6].map(rareteDuRang)).toEqual([...RARETES_DE_CARTE]);
  });
  it("prend la plus proche hors des bornes, sans jamais rendre de rareté qui n'existe pas", () => {
    expect(rareteDuRang(0)).toBe("commun");
    expect(rareteDuRang(-3)).toBe("commun");
    expect(rareteDuRang(9)).toBe("divin");
    expect(rareteDuRang(2.4)).toBe("peu-commun");
  });
});
