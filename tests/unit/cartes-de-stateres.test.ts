import { describe, expect, it } from "vitest";
import {
  LOTS_DESSINES,
  SCENE_HAUTEUR,
  SCENE_LARGEUR,
  cadreDesStateres,
  ecrireEnChiffres,
  ecussonDesStateres,
  estEnCases,
  jaugeDuRendu,
  largeurDeLEcusson,
  largeurDesPions,
  motsDeLaCarteDeStateres,
  nombreEnCases,
  pionsDuLot,
  rangDeStateres,
  sceneDesStateres,
  type RangDeStateres,
} from "../../src/lib/jeu/cartes-de-stateres";
import type { Planche } from "../../src/lib/jeu/planche";

// Les cartes spéciales statères (22 novembre 2026) : les noms et l'or choisis pour le pilote, qui l'a laissé choisir, et
// des dessins qui ne disent aucun montant : la somme et la part viennent du serveur.

const RANGS: readonly RangDeStateres[] = [0, 1, 2, 3, 4, 5, 6];
const enHex = (c: readonly number[]): string => "#" + [c[0]!, c[1]!, c[2]!].map((v) => v.toString(16).padStart(2, "0")).join("");
const cases = (g: Planche): string[] => {
  const tout: string[] = [];
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const c = g.couleur(x, y);
      if (c && c[3] > 0) tout.push(enHex(c));
    }
  return tout;
};
const OR = new Set(["#fff1a8", "#ffdd80", "#f2b632", "#a86d0c", "#6e4406"]);

describe("les cartes des statères", () => {
  it("les noms des lots, du plus petit au trésor, et la carte des statères rendus", () => {
    expect(RANGS.map((r) => LOTS_DESSINES[r].nom)).toEqual(["Statères rendus", "Quelques pièces", "La petite pile", "La bourse", "Le coffret", "Le grand coffre", "Le trésor"]);
    // Les mêmes trois façons que les cartes des cosmétiques : lisse, entre-deux, en cases.
    expect(RANGS.map((r) => LOTS_DESSINES[r].carte)).toEqual(["lisse", "lisse", "lisse", "entre", "pixel", "pixel", "pixel"]);
    expect(RANGS.filter(estEnCases)).toEqual([4, 5, 6]);
  });

  it("un rang lu est ramené de 0 à 6", () => {
    expect(rangDeStateres(-3)).toBe(0);
    expect(rangDeStateres(3)).toBe(3);
    expect(rangDeStateres(9)).toBe(6);
  });

  it("chaque scène a sa taille, et l'or y monte avec le lot", () => {
    const ors = [1, 2, 3, 4, 5, 6].map((r) => {
      const s = sceneDesStateres(r as RangDeStateres);
      expect([s.width, s.height]).toEqual([SCENE_LARGEUR, SCENE_HAUTEUR]);
      return cases(s).filter((c) => OR.has(c)).length;
    });
    for (let i = 1; i < ors.length; i++) expect(ors[i]!).toBeGreaterThan(ors[i - 1]!);
  });

  it("les sommes s'écrivent groupées par milliers, en chiffres de cases, et leur matière est sous les chiffres", () => {
    expect(nombreEnCases(60)).toBe("60");
    expect(nombreEnCases(13100)).toBe("13 100");
    expect(nombreEnCases(1250000)).toBe("1 250 000");
    const { image, plein } = ecrireEnChiffres("+13 100", "orVif");
    expect([plein.width, plein.height]).toEqual([image.width, image.height]);
    for (let y = 0; y < plein.height; y++)
      for (let x = 0; x < plein.width; x++) if ((plein.couleur(x, y)?.[3] ?? 0) > 0) expect(image.couleur(x, y)?.[3] ?? 0).toBeGreaterThan(0);
    // Plus de chiffres, plus large.
    expect(ecrireEnChiffres("+60", "marine").image.width).toBeLessThan(image.width);
  });

  it("le cadre se pose en neuf parts, l'écusson a la largeur que la carte lui donne", () => {
    for (const r of [4, 5, 6] as const) {
      const c = cadreDesStateres(r);
      expect(c.width).toBe(c.height);
    }
    for (const r of [5, 6] as const) expect(ecussonDesStateres(r).width).toBe(largeurDeLEcusson(r));
  });

  it("la jauge d'un rendu a un cran par dizaine rendue ; les pions d'un lot, un par rang", () => {
    const pleinsDeLaJauge = (pourcent: number): number => {
      const j = jaugeDuRendu(pourcent);
      return Array.from({ length: 10 }, (_, i) => enHex(j.couleur(i * 5 + 1, 2)!)).filter((c) => c === "#f2b632").length;
    };
    expect(pleinsDeLaJauge(20)).toBe(2);
    expect(pleinsDeLaJauge(60)).toBe(6);
    expect(pleinsDeLaJauge(100)).toBe(10);
    const pionsPleins = (rang: number): number => {
      const p = pionsDuLot(rang, 6);
      return Array.from({ length: 6 }, (_, i) => p.couleur(i * 7 + 2, 2)).filter((c) => c && c[3] > 0 && enHex(c) === "#f2b632").length;
    };
    expect([1, 3, 6].map(pionsPleins)).toEqual([1, 3, 6]);
    // Autant de pions que de lots dans la liste du serveur.
    expect(pionsDuLot(2, 4).width).toBe(largeurDesPions(4));
    expect(largeurDesPions(6)).toBe(40);
  });

  it("la carte se lit d'un seul nom, avec la somme, la part et le nombre de lots du serveur", () => {
    expect(motsDeLaCarteDeStateres(0, 640, 40, 6)).toBe("640 statères rendus, 40 % du prix");
    expect(motsDeLaCarteDeStateres(0, 1, null, 6)).toBe("1 statère rendu");
    expect(motsDeLaCarteDeStateres(3, 400, null, 6)).toBe("La bourse : 400 statères, lot 3 sur 6");
    expect(motsDeLaCarteDeStateres(5, 3000, null, 5)).toBe(`Le grand coffre : 3${String.fromCharCode(0x202f)}000 statères, lot 5 sur 5`);
  });
});
