import { describe, expect, it } from "vitest";
import { lireEffets } from "../../src/components/village/duel/effets-des-cartes";
import { lignesDePoche } from "../../src/lib/village/carte-de-poche";

// La carte de poche (22 novembre 2026) : les lignes du duel écrites sur la carte, dans l'ordre du dessin de Claude Fable 5.2.

describe("les lignes écrites sur la carte de poche", () => {
  it("l'effet unique, puis les mots-clés, puis le rôle ; la panoplie à part ; rien d'autre", () => {
    const lignes = [
      { ton: null, icone: "role", cases: 15, gras: "Arme : frappe.", texte: "7 dégâts." },
      { ton: "unique", icone: null, cases: 11, gras: "Effet unique", texte: "« Lame du chef »" },
      { ton: null, icone: "perce", cases: 11, gras: "Perce 3.", texte: "…" },
      { ton: null, icone: "saigne", cases: 11, gras: "Saigne 2.", texte: "…" },
      { ton: "alerte", icone: null, cases: 11, gras: "Au repos", texte: "…" },
      { ton: "panoplie", icone: null, cases: 11, gras: "Panoplie « L'or du chef »", texte: "…" },
    ];
    const { ecrites, panoplie } = lignesDePoche(lignes);
    expect(ecrites.map((l) => l.gras)).toEqual(["Effet unique", "Perce 3.", "Saigne 2.", "Arme : frappe."]);
    expect(panoplie?.gras).toBe("Panoplie « L'or du chef »");
  });

  it("une vraie carte du moteur : toutes ses lignes, sauf la panoplie, sont écrites ; un familier n'a que son compagnon", () => {
    const epee = lireEffets("objet/arme/epee-or");
    expect(epee).not.toBeNull();
    const { ecrites, panoplie } = lignesDePoche(epee!.lignes);
    expect(ecrites.length + (panoplie ? 1 : 0)).toBe(epee!.lignes.filter((l) => l.ton !== "alerte").length);
    expect(ecrites.at(-1)?.cases).toBe(15);
  });
});
