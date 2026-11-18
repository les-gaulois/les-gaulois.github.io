import { describe, expect, it } from "vitest";
import { vitrinePublique } from "../../src/lib/village/vitrine-publique";

describe("vitrinePublique", () => {
  const membres = [
    { publicId: "aaa", username: "Bruno", team: { wins: 12 } },
    { publicId: "bbb", username: "Alix", team: { wins: 40 } },
    { publicId: null, username: null, team: { wins: 99 } },
    { publicId: "ccc", username: "Sans Gaulois", team: { wins: 80 } },
    { publicId: "ddd", username: "Zoé", team: null },
    { publicId: "eee", username: "Ana", team: { wins: 12 } },
  ];
  const avecGaulois = new Set(["aaa", "bbb", "ddd", "eee"]);

  it("ne montre que les membres au pseudo public qui ont créé leur Gaulois", () => {
    const vus = vitrinePublique(membres, (id) => avecGaulois.has(id)).map((g) => g.id);
    expect(vus).not.toContain("ccc");
    expect(vus).toHaveLength(4);
  });

  it("range le plus de victoires d'abord, puis le pseudo, et garde « pas de données » en dernier", () => {
    expect(vitrinePublique(membres, (id) => avecGaulois.has(id)).map((g) => g.pseudo)).toEqual(["Alix", "Ana", "Bruno", "Zoé"]);
    expect(vitrinePublique(membres, (id) => avecGaulois.has(id)).at(-1)?.victoires).toBeNull();
  });

  it("ne montre rien sans Gaulois relevé", () => {
    expect(vitrinePublique(membres, () => false)).toEqual([]);
  });
});
