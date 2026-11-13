import { describe, expect, it } from "vitest";
import { countLabel, findChoice, pickChoices, searchChoices, shownOnHome, typedState, weekShort, weekState } from "../../src/lib/compte/direction-semaine";

const members = [{ username: "Zoé" }, { username: "alba" }, { username: null }, { username: "Brennos" }, { username: "brennos" }, { username: " Élan " }, {}, { username: "alba" }];

describe("Gaulois de la semaine : la liste à choisir", () => {
  const choices = pickChoices(members);

  it("donne chaque pseudo une fois, dans l'ordre alphabétique, sans les membres sans pseudo", () => {
    expect(choices.map((c) => c.name)).toEqual(["alba", "brennos", "Brennos", "Élan", "Zoé"].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("marque un pseudo porté par plusieurs membres, à la casse près, comme le serveur le compte", () => {
    expect(Object.fromEntries(choices.map((c) => [c.name, c.twin]))).toEqual({ alba: true, brennos: true, Brennos: true, Élan: false, Zoé: false });
  });

  it("cherche sans accent ni majuscule, les débuts de pseudo d'abord", () => {
    expect(searchChoices(choices, "")).toEqual(choices);
    expect(searchChoices(choices, "ELA").map((c) => c.name)).toEqual(["Élan"]);
    expect(searchChoices(choices, "a").map((c) => c.name)).toEqual(["alba", "Élan"]);
    expect(searchChoices(choices, "xyz")).toEqual([]);
  });

  it("retrouve le pseudo tapé, l'orthographe exacte d'abord, puis à la casse près", () => {
    expect(findChoice(choices, " Brennos ")?.name).toBe("Brennos");
    expect(findChoice(choices, "ZOÉ")?.name).toBe("Zoé");
    expect(findChoice(choices, "Zo")).toBeNull();
    expect(findChoice(choices, "  ")).toBeNull();
  });

  it("dit ce que vaut le texte tapé", () => {
    expect(typedState(choices, "")).toBe("empty");
    expect(typedState(null, "Zoé")).toBe("free");
    expect(typedState(choices, "zoé")).toBe("listed");
    expect(typedState(choices, "alba")).toBe("twin");
    expect(typedState(choices, "Zo")).toBe("unlisted");
  });

  it("sait si l'accueil montre encore le joueur : à l'orthographe exacte, ou inconnu sans liste", () => {
    expect(shownOnHome(choices, "Zoé")).toBe(true);
    expect(shownOnHome(choices, "zoé")).toBe(false);
    expect(shownOnHome(null, "Zoé")).toBeNull();
  });

  it("écrit le nombre de membres", () => {
    expect(countLabel(5, 5, false)).toBe("5 membres");
    expect(countLabel(1, 1, false)).toBe("1 membre");
    expect(countLabel(2, 5, true)).toBe("2 sur 5");
  });
});

describe("Gaulois de la semaine : l'état de la semaine", () => {
  const pick = (week: string) => ({ week, player: "Zoé", note: null });

  it("distingue choisi, semaine passée, rien et illisible", () => {
    expect(weekState(pick("2026-11-09"), "2026-11-09", false)).toBe("chosen");
    expect(weekState(pick("2026-11-02"), "2026-11-09", false)).toBe("previous");
    expect(weekState(null, "2026-11-09", false)).toBe("none");
    expect(weekState(null, "2026-11-09", true)).toBe("unread");
  });

  it("écrit la semaine sans article", () => {
    expect(weekShort("2026-11-09")).toBe("semaine du 9 nov. au 15 nov.");
  });
});
