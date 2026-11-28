import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, RARETES_DES_OBJETS } from "../../src/lib/gaulois";
import { TONS_DES_CARTES, caseQuiTient, motDeLaChose, prolongerLaScene, tonsDeLaCarte } from "../../src/lib/jeu/carte-du-cosmetique";
import { lireEffets } from "../../src/components/village/duel/effets-des-cartes";
import { accorder } from "../../src/components/village/duel/moteur";
import { CATALOGUE_DU_DUEL, carte as carteDuMoteur } from "../../supabase/functions/code-discord/duel/index";
import { FAMILIERS } from "../../src/lib/village/familiers";

// Les cartes des cosmétiques : les tons de chaque rareté, la scène prolongée, et les effets écrits sur la carte, qui viennent
// du moteur du duel sans être recalculés (le modèle unique du 28 novembre 2026 : carte-du-cosmetique.test.ts).

const luminance = (hex: string): number => {
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * v! + 0.0722 * b!;
};
const contraste = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

describe("les cartes des cosmétiques", () => {
  it("chaque rareté d'objet a ses tons, clairs, et son encre se lit sur son papier (AA)", () => {
    for (const r of Object.keys(RARETES_DES_OBJETS)) {
      const t = tonsDeLaCarte(r);
      expect(TONS_DES_CARTES[r], r).toBeDefined();
      expect(luminance(t.haut), r).toBeGreaterThan(0.6);
      expect(contraste(t.encre, t.bas), r).toBeGreaterThanOrEqual(4.5);
    }
    expect(tonsDeLaCarte("inconnue")).toEqual(TONS_DES_CARTES["base"]);
  });

  it("la scène prolongée garde chaque case de la scène et ne laisse aucune case vide autour", () => {
    const img = { largeur: 4, hauteur: 3, cases: ["#101010", "#202020", "#303030", "#404040", "#505050", "#606060", "#707070", "#808080", "#909090", "#a0a0a0", "#b0b0b0", "#c0c0c0"] };
    const grande = prolongerLaScene(img, 6, 30, 1, 10);
    expect([grande.largeur, grande.hauteur, grande.cases.length]).toEqual([6, 30, 180]);
    // La scène est posée telle quelle, décalée d'une case et de dix rangées.
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) expect(grande.cases[(y + 10) * 6 + x + 1]).toBe(img.cases[y * 4 + x]);
    expect(grande.cases.every((c) => typeof c === "string")).toBe(true);
  });

  it("le mot de la chose, d'après sa clé", () => {
    const e = EMPLACEMENTS_OBJETS[0]!;
    expect(motDeLaChose(`objet/${e}/x`)).toBe(NOMS_EMPLACEMENTS[e]);
    expect(motDeLaChose("familier/chat")).toBe("Familier");
    expect(motDeLaChose("modele/dragon")).toBe("Gaulois unique");
    expect(motDeLaChose("objet/nulle-part/x")).toBe("");
  });

  it("« 2 manche de plus » s'accorde, « 1 manche » non", () => {
    expect(accorder("La carte posée en face se repose 2 manche de plus.")).toBe("La carte posée en face se repose 2 manches de plus.");
    expect(accorder("La carte posée en face se repose 1 manche de plus.")).toBe("La carte posée en face se repose 1 manche de plus.");
    expect(accorder("Se repose 1 manche au lieu de 2.")).toBe("Se repose 1 manche au lieu de 2.");
  });

  it("l'Épée d'or : sa carte du duel, son effet unique, ses mots-clés, sa panoplie et son numéro", () => {
    const fiche = CATALOGUE_DU_DUEL["epee-or"]!;
    const effets = lireEffets(`objet/${fiche.e}/epee-or`);
    expect(effets?.duel).toMatchObject({ role: "frappe", roleNom: "FRAPPE", unique: "Lame du chef" });
    const gras = effets!.lignes.map((l) => l.gras);
    expect(gras[0]).toBe("Arme : frappe.");
    expect(gras).toContain("Perce 3.");
    expect(gras).toContain("Saigne 2.");
    expect(effets!.lignes.find((l) => l.ton === "panoplie")?.gras).toContain("L'or du chef");
    expect(effets!.lignes.find((l) => l.ton === "unique")?.texte).toBe("« Lame du chef »");
  });

  it("chaque objet du duel a ses effets, et sa force et son prix sont ceux du moteur", () => {
    for (const [id, fiche] of Object.entries(CATALOGUE_DU_DUEL)) {
      expect(OBJETS[fiche.e][id], id).toBeDefined();
      const effets = lireEffets(`objet/${fiche.e}/${id}`);
      expect(effets?.duel, id).not.toBeNull();
      const duMoteur = carteDuMoteur(id);
      expect([effets!.duel!.force, effets!.duel!.cout, effets!.duel!.repos, effets!.duel!.role], id).toEqual([duMoteur.f, duMoteur.c, duMoteur.repos, duMoteur.role]);
      expect(effets!.duel!.icones.length, id).toBeLessThanOrEqual(3);
    }
  });

  it("un familier n'a que son effet de compagnon ; le reste n'a pas d'effet", () => {
    const f = FAMILIERS[0]!;
    const effets = lireEffets(`familier/${f.id}`);
    expect(effets?.duel).toBeNull();
    expect(effets?.lignes[0]?.gras).toBe("Compagnon de duel");
    expect(lireEffets("objet/arme/inconnu")).toBeNull();
    expect(lireEffets("objet/tete/epee-or")).toBeNull();
    expect(lireEffets("modele/inconnu")).toBeNull();
    expect(lireEffets("n'importe quoi")).toBeNull();
  });
});

describe("le grand écran de la carte", () => {
  it("la grande carte tient dans l'écran : quatre pixels la case, moins sur un écran petit ou bas", () => {
    expect(caseQuiTient(1280, 900, 98)).toBe(4);
    expect(caseQuiTient(360, 900, 98)).toBe(3);
    expect(caseQuiTient(1280, 600, 98)).toBe(3);
    expect(caseQuiTient(1280, 520, 98)).toBe(2);
  });
});
