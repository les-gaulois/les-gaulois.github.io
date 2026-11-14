import { describe, expect, it } from "vitest";
import {
  ACCUEIL,
  REPLIQUES,
  REPLIQUES_DES_GESTES,
  REPLIQUES_DES_RUBRIQUES,
  REPLIQUE_MAX,
  TOUTES_LES_REPLIQUES,
  dureeDeLaBulle,
  ponctuer,
  repliqueDuClic,
  rubriqueDe,
} from "../../src/lib/compagnon/repliques";
import { tirage } from "../../src/lib/fx/repliques";
import { aleatoire } from "../../src/lib/logo-matrice";
import { SECTIONS } from "../../src/lib/nav";

describe("les répliques du Gaulois compagnon", () => {
  it("sont dix à seize, courtes, sans doublon", () => {
    expect(TOUTES_LES_REPLIQUES.length).toBeGreaterThanOrEqual(10);
    expect(TOUTES_LES_REPLIQUES.length).toBeLessThanOrEqual(16);
    expect(new Set(TOUTES_LES_REPLIQUES).size).toBe(TOUTES_LES_REPLIQUES.length);
    for (const replique of TOUTES_LES_REPLIQUES) {
      expect(replique.length, replique).toBeGreaterThan(0);
      expect(replique.length, replique).toBeLessThanOrEqual(REPLIQUE_MAX);
      expect(replique, replique).toBe(replique.trim());
      expect(replique, replique).not.toContain("\n");
    }
  });

  it("n'annoncent aucun chiffre, ne citent pas Astérix, n'ont pas d'emoji et ne parlent pas d'argent", () => {
    for (const replique of TOUTES_LES_REPLIQUES) {
      // Ni rang, ni score, ni résultat : une réplique n'est pas une donnée.
      expect(replique, replique).not.toMatch(/\d/);
      expect(replique, replique).not.toMatch(/\b(un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|cent|mille)\s+(points?|parties?|victoires?|places?|membres?|joueurs?)/i);
      expect(replique, replique).not.toMatch(/\b(premiers?|derniers?|classement|rang|score|record)\b/i);
      expect(replique, replique).not.toMatch(/ast[ée]rix|ob[ée]lix|id[ée]fix|panoramix|toutatis|b[ée]l[ée]nos|potion|sanglier|menhir|irr[ée]ductible|romain|barde/i);
      expect(replique, replique).not.toMatch(/\p{Extended_Pictographic}/u);
      // Ni argent, ni monnaie, celle du village comprise.
      expect(replique, replique).not.toMatch(/plutonium|capsule|stat[èe]re|euro|pi[èe]ces?|\bsous?\b|\bor\b|payer|acheter|vendre|prix|boutique|march[ée]/i);
    }
  });

  it("parlent français, en mots de tous les jours : ni signe d'informaticien, ni anglais", () => {
    for (const replique of TOUTES_LES_REPLIQUES) {
      expect(replique, replique).not.toMatch(/[$#|&\\/{}[\]<>=*~`_@÷×%+]/);
      expect(replique, replique).not.toMatch(/\b(the|you|is|are|hello|hi|ok|let's|go|follow|click|loading|game over)\b/i);
    }
  });

  it("ont une phrase par rubrique du menu, sauf la Carte, où il ne vient pas", () => {
    const rubriques = SECTIONS.map((s) => s.label);
    for (const nom of Object.keys(REPLIQUES_DES_RUBRIQUES)) {
      if (nom !== ACCUEIL) expect(rubriques, nom).toContain(nom);
    }
    expect(Object.keys(REPLIQUES_DES_RUBRIQUES)).not.toContain("Carte");
    expect(Object.keys(REPLIQUES_DES_RUBRIQUES).sort()).toEqual([ACCUEIL, ...rubriques.filter((nom) => nom !== "Carte")].sort());
  });

  it("reconnaissent la rubrique d'une adresse", () => {
    expect(rubriqueDe("/")).toBe(ACCUEIL);
    expect(rubriqueDe("")).toBe(ACCUEIL);
    expect(rubriqueDe("/classement")).toBe("Résultats");
    expect(rubriqueDe("/classement/")).toBe("Résultats");
    expect(rubriqueDe("/membres/abc")).toBe("Membres");
    expect(rubriqueDe("/village")).toBe("Membres");
    expect(rubriqueDe("/debuter")).toBe("Guides");
    expect(rubriqueDe("/compte")).toBeNull();
    expect(rubriqueDe("/mentions-legales")).toBeNull();
  });

  it("disent d'abord la phrase de la rubrique, puis les autres sans se répéter", () => {
    const suivante = tirage(REPLIQUES.length, aleatoire(7));
    const dites = Array.from({ length: 12 }, (_, clics) => repliqueDuClic("Résultats", clics, suivante));
    expect(dites[0]).toBe(REPLIQUES_DES_RUBRIQUES["Résultats"]);
    // Ensuite le salut, puis toutes les autres avant qu'une ne revienne.
    expect(dites[1]).toBe(REPLIQUES[0]);
    expect(new Set(dites.slice(1, 1 + REPLIQUES.length)).size).toBe(REPLIQUES.length);
    dites.forEach((replique, i) => {
      expect(replique.length).toBeGreaterThan(0);
      if (i > 0) expect(replique).not.toBe(dites[i - 1]);
    });
    // Hors du plan du site : le salut d'abord.
    expect(repliqueDuClic(null, 0, tirage(REPLIQUES.length, aleatoire(7)))).toBe(REPLIQUES[0]);
    // Un tirage hors de la liste ne laisse jamais la bulle vide.
    expect(repliqueDuClic(null, 3, () => -1)).toBe(REPLIQUES[0]);
  });

  it("gardent le salut en tête et une réponse à chaque geste", () => {
    expect(REPLIQUES[0]).toMatch(/^Salut/);
    expect(Object.keys(REPLIQUES_DES_GESTES).sort()).toEqual(["invitation", "pose", "reveil", "suivre"]);
    expect(REPLIQUES_DES_GESTES.invitation).toMatch(/village/);
  });

  it("collent la ponctuation double à son mot et restent le temps d'être lues", () => {
    const insecable = String.fromCharCode(160);
    expect(ponctuer("Salut ! On y va ?")).toBe(`Salut${insecable}! On y va${insecable}?`);
    for (const replique of TOUTES_LES_REPLIQUES) {
      expect(dureeDeLaBulle(replique)).toBeGreaterThanOrEqual(6_000);
      expect(dureeDeLaBulle(replique)).toBeLessThanOrEqual(9_000);
    }
    expect(dureeDeLaBulle("x".repeat(400))).toBe(9_000);
  });
});
