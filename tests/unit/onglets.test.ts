import { describe, expect, it } from "vitest";
import { slideFrom, tabKeyTarget, tabOfHash, tabsFor } from "../../src/lib/onglets";

const QG = [{ id: "salons" }, { id: "decisions" }, { id: "demandes", rank: 2 }, { id: "comptes", rank: 2 }, { id: "journal", rank: 3 }];

describe("les onglets d'un espace de travail", () => {
  it("chaque rang voit ses onglets, dans l'ordre donné", () => {
    // Un membre validé (rang 1), et l'encadrement en vue joueur, qui y a le rang d'un membre sans grade.
    expect(tabsFor(QG, 1).map((t) => t.id)).toEqual(["salons", "decisions"]);
    expect(tabsFor(QG, 2).map((t) => t.id)).toEqual(["salons", "decisions", "demandes", "comptes"]);
    expect(tabsFor(QG, 4).map((t) => t.id)).toEqual(["salons", "decisions", "demandes", "comptes", "journal"]);
  });

  it("l'adresse ouvre un onglet seulement s'il existe pour ce compte", () => {
    const ids = ["salons", "decisions", "evenements"];
    expect(tabOfHash("#decisions", ids)).toBe("decisions");
    expect(tabOfHash("decisions", ids)).toBe("decisions");
    expect(tabOfHash("#%C3%A9v%C3%A9nements", ["événements"])).toBe("événements");
    // Un membre qui suit un lien vers les demandes reste sur le premier onglet ; le lien d'évitement ne change rien.
    expect(tabOfHash("#demandes", ids)).toBeNull();
    expect(tabOfHash("#contenu", ids)).toBeNull();
    expect(tabOfHash("", ids)).toBeNull();
    expect(tabOfHash("#%E0%A4%A", ids)).toBeNull();
  });

  it("au clavier, les flèches font le tour, Début et Fin vont aux bouts", () => {
    expect(tabKeyTarget("ArrowRight", 0, 3)).toBe(1);
    expect(tabKeyTarget("ArrowRight", 2, 3)).toBe(0);
    expect(tabKeyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(tabKeyTarget("ArrowLeft", 2, 3)).toBe(1);
    expect(tabKeyTarget("Home", 2, 3)).toBe(0);
    expect(tabKeyTarget("End", 0, 3)).toBe(2);
    expect(tabKeyTarget("Enter", 1, 3)).toBeNull();
    expect(tabKeyTarget("ArrowDown", 1, 3)).toBeNull();
    expect(tabKeyTarget("ArrowRight", 0, 0)).toBeNull();
  });

  it("la partie choisie glisse du côté de son onglet, et rien ne bouge au premier affichage", () => {
    expect(slideFrom(0, 2)).toBe("droite");
    expect(slideFrom(3, 1)).toBe("gauche");
    expect(slideFrom(1, 1)).toBeNull();
    expect(slideFrom(-1, 1)).toBeNull();
  });
});
