import { describe, expect, it } from "vitest";
import { OBJETS, RARETES_DES_OBJETS } from "../../src/lib/gaulois";
import {
  BANDE_DU_CADRE,
  COIN_DU_CADRE,
  ECUSSON_HAUTEUR,
  ECUSSON_LARGEUR,
  PERIODE_DU_CADRE,
  RARETES_EN_PIXELS,
  TONS_DES_CARTES,
  cadreEnNeufParts,
  coinEpique,
  ecussonDeCarte,
  habillerUnePlanche,
  motifDeFeuille,
  styleDeCarte,
  tonsDeLaCarte,
} from "../../src/lib/jeu/cartes-d-objets";
import { lireEffets } from "../../src/components/village/duel/effets-des-cartes";
import { CATALOGUE_DU_DUEL, carte as carteDuMoteur } from "../../supabase/functions/code-discord/duel/index";
import { Planche, R } from "../../src/lib/jeu/planche";
import { FAMILIERS } from "../../src/lib/village/familiers";

// Les cartes des cosmétiques (22 novembre 2026) : la façon de chaque rareté choisie par le pilote, les cadres en cases et
// les effets écrits sur la carte, qui viennent du moteur du duel sans être recalculés.

const luminance = (hex: string): number => {
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * v! + 0.0722 * b!;
};
const contraste = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

describe("la façon de chaque rareté", () => {
  it("pixel art et holographique du mystique au divin, entre-deux pour l'épique, lisse pour le reste", () => {
    expect(styleDeCarte("mystique")).toBe("pixel");
    expect(styleDeCarte("legendaire")).toBe("pixel");
    expect(styleDeCarte("saison")).toBe("pixel");
    expect(styleDeCarte("divin")).toBe("pixel");
    expect(styleDeCarte("epique")).toBe("entre");
    expect(styleDeCarte("peu-commun")).toBe("lisse");
    expect(styleDeCarte("commun")).toBe("lisse");
    expect(styleDeCarte(undefined)).toBe("lisse");
    expect(styleDeCarte(null)).toBe("lisse");
  });

  it("chaque rareté d'objet a ses tons, clairs, et son encre se lit sur son papier (AA)", () => {
    for (const r of Object.keys(RARETES_DES_OBJETS)) {
      const t = tonsDeLaCarte(r);
      expect(TONS_DES_CARTES[r], r).toBeDefined();
      expect(luminance(t.haut), r).toBeGreaterThan(0.6);
      expect(contraste(t.encre, t.bas), r).toBeGreaterThanOrEqual(4.5);
    }
    expect(tonsDeLaCarte("inconnue")).toEqual(TONS_DES_CARTES["base"]);
  });
});

describe("les dessins des cartes en cases", () => {
  it("le cadre en neuf parts : deux coins et une période de la bande, l'angle vide, la bande pleine", () => {
    for (const r of RARETES_EN_PIXELS) {
      const c = cadreEnNeufParts(r);
      const cote = 2 * COIN_DU_CADRE + PERIODE_DU_CADRE[r];
      expect([c.width, c.height]).toEqual([cote, cote]);
      expect(c.pleine(0, 0), `${r} angle`).toBe(false);
      for (let d = 0; d < BANDE_DU_CADRE; d++) expect(c.pleine(COIN_DU_CADRE, d), `${r} bande ${d}`).toBe(true);
      // Le milieu reste vide : le papier de la carte s'y voit.
      expect(c.pleine(Math.floor(cote / 2), Math.floor(cote / 2))).toBe(false);
    }
  });

  it("les écussons, les motifs de feuille et le coin de l'épique ont leur taille", () => {
    for (const r of RARETES_EN_PIXELS) {
      const e = ecussonDeCarte(r);
      expect([e.width, e.height]).toEqual([ECUSSON_LARGEUR, ECUSSON_HAUTEUR]);
      const m = motifDeFeuille(r);
      expect(m.width).toBe(r === "mystique" ? 8 : 16);
      let pleines = 0;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.pleine(x, y)) pleines++;
      expect(pleines, r).toBeGreaterThan(0);
    }
    const coin = coinEpique();
    expect([coin.width, coin.height]).toEqual([11, 11]);
  });
});

describe("le cadre sur la face d'une carte de booster", () => {
  const face = (): Planche => {
    const g = new Planche(68, 88);
    R(g, 0, 0, 68, 88, "#eef6ff");
    return g;
  };
  it("une carte en pixels prend ses coins, sa bande et ses écussons ; le milieu ne change pas", () => {
    for (const r of RARETES_EN_PIXELS) {
      const avant = face();
      const g = face();
      habillerUnePlanche(g, r);
      // La bande : les quatre premières cases de chaque bord viennent du cadre.
      const n = cadreEnNeufParts(r);
      expect(g.couleur(30, 0), r).toEqual(n.couleur(COIN_DU_CADRE, 0));
      expect(g.couleur(0, 40), r).toEqual(n.couleur(0, COIN_DU_CADRE));
      // L'angle reste vide, comme celui du cadre.
      expect(g.pleine(0, 0), r).toBe(false);
      // Le milieu de la face, où vont l'image et les mots, ne bouge pas.
      for (let y = BANDE_DU_CADRE + 2; y < 88 - BANDE_DU_CADRE - 2; y += 3)
        for (let x = COIN_DU_CADRE; x < 68 - COIN_DU_CADRE; x += 3) expect(g.couleur(x, y), `${r} (${x}, ${y})`).toEqual(avant.couleur(x, y));
    }
  });
  it("l'épique prend ses quatre coins en cases ; une carte lisse ne change pas", () => {
    const g = face();
    habillerUnePlanche(g, "epique");
    expect(g.couleur(0, 2)).not.toEqual(face().couleur(0, 2));
    expect(g.couleur(67, 85)).not.toEqual(face().couleur(67, 85));
    for (const r of ["commun", "peu-commun", null]) {
      const l = face();
      habillerUnePlanche(l, r);
      expect(l.data).toEqual(face().data);
    }
  });
});

describe("les effets écrits sur la carte", () => {
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
