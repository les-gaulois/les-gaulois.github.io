import { describe, expect, it } from "vitest";
import { parseQgTools, type Mentor, type QgTools, type WallMember } from "../../src/lib/compte/outils";
import type { Face } from "../../src/lib/compte/qg";
import { MUR_FILTRES, auMoins, dansFiltre, isStaff, murAnnonce, murFiltres, murFocusApres, murLignes, murNombres, murTrouve, murVisible, sansAccents } from "../../src/lib/compte/qg-mur";

const face = (name: string, role: Face["role"] = "member", avatar: string | null = null): Face => ({ name, role, avatar });
const member = (number: number, name: string, role: Face["role"] = "member", gg = 0, given = false, avatar: string | null = null): WallMember => ({ ...face(name, role, avatar), number, gg, given });
const mentor = (name: string, role: Face["role"] = "member", avatar: string | null = null): Mentor => ({ ...face(name, role, avatar), discord: null, mine: false });

const wall = [member(1, "Brennos", "founder", 5), member(2, "Épona", "member", 0, true), member(3, "Tarvos", "officer", 2), member(4, "Litavicos")];
const tools = (over: Partial<QgTools> = {}): QgTools => ({
  me: { number: 4, pseudo: null, mentor: false, gg: 0 },
  voice: null,
  plans: { mine: null, hours: [] },
  goal: null,
  wall,
  mentors: [mentor("Épona"), mentor("Absent du mur")],
  predictions: null,
  ...over,
});

describe("sansAccents", () => {
  it("ignore les accents, les majuscules et les espaces autour", () => {
    expect(sansAccents("  Épona ")).toBe("epona");
    expect(sansAccents("ÉLODIE la Gauloise")).toBe("elodie la gauloise");
  });
  it("sépare les lettres liées et resserre les espaces", () => {
    expect(sansAccents("Œdipe  et   Æthel")).toBe("oedipe et aethel");
    expect(sansAccents("Straße")).toBe("strasse");
  });
  it("garde les autres signes : « ^ » ou « _ » se cherchent comme ils s'écrivent", () => {
    expect(sansAccents("x^x_42")).toBe("x^x_42");
  });
  it("une chaîne vide, ou d'accents seuls, ne garde rien", () => {
    expect(sansAccents("")).toBe("");
    expect(sansAccents("́̀  ")).toBe("");
  });
});

describe("isStaff", () => {
  it("tout rôle au-dessus de membre", () => {
    expect(isStaff(face("a", "member"))).toBe(false);
    expect(["officer", "admin", "founder"].every((role) => isStaff(face("a", role as Face["role"])))).toBe(true);
  });
});

describe("murLignes", () => {
  it("sans les outils : le mur de get_qg, sans GG ni bouton ; « pas de données » n'est pas zéro", () => {
    const lignes = murLignes([face("Brennos", "founder"), face("Épona")], null);
    expect(lignes.map((l) => [l.key, l.staff, l.gg, l.member, l.mine])).toEqual([
      ["i0", true, null, null, false],
      ["i1", false, null, null, false],
    ]);
  });
  it("avec les outils : le mur des outils, dans l'ordre du serveur, avec GG et le membre connecté", () => {
    const lignes = murLignes([], tools());
    expect(lignes.map((l) => l.key)).toEqual(["n1", "n2", "n3", "n4"]);
    expect(lignes.map((l) => l.gg)).toEqual([5, 0, 2, 0]);
    expect(lignes.filter((l) => l.mine).map((l) => l.key)).toEqual(["n4"]);
    expect(lignes.every((l) => l.member !== null)).toBe(true);
  });
  it("aucun membre du mur n'est marqué parrain : le serveur ne dit pas lequel l'est", () => {
    const lignes = murLignes([], tools({ mentors: [mentor("Épona"), mentor("Tarvos", "officer")] }));
    expect(lignes.some((l) => "mentor" in l)).toBe(false);
  });
  it("sans numéro de Gaulois, aucune ligne n'est la mienne", () => {
    expect(murLignes([], tools({ me: { number: null, pseudo: null, mentor: false, gg: 0 } })).some((l) => l.mine)).toBe(false);
  });
  it("des outils sans mur (relu à un autre moment, ou illisible) laissent le mur de get_qg, comme avant", () => {
    const lignes = murLignes([face("Brennos", "founder")], tools({ wall: [] }));
    expect(lignes.map((l) => [l.key, l.gg, l.member])).toEqual([["i0", null, null]]);
  });
  it("deux membres du même nom restent deux lignes ; un numéro lu deux fois n'en fait qu'une", () => {
    const lignes = murLignes([], tools({ wall: [member(1, "Jumeau"), member(2, "Jumeau"), member(1, "Jumeau")] }));
    expect(lignes.map((l) => l.key)).toEqual(["n1", "n2"]);
  });
  it("les clés des deux murs ne se confondent pas : la place 1 n'est pas le Gaulois numéro 1", () => {
    const sans = murLignes([face("A"), face("B")], null).map((l) => l.key);
    const avec = murLignes([], tools({ wall: [member(1, "B")] })).map((l) => l.key);
    expect(sans.filter((key) => avec.includes(key))).toEqual([]);
  });
  it("les entrées illisibles du serveur sont écartées avant le mur, jamais devinées", () => {
    const read = parseQgTools({
      me: { number: 4 },
      plans: {},
      mentors: [],
      wall: [
        { name: "Brennos", role: "founder", number: 1, gg: 2 },
        { name: "Sans numéro", role: "member", gg: 1 },
        { name: "GG illisible", role: "member", number: 3, gg: -1 },
        { name: "", role: "member", number: 5, gg: 0 },
        { name: "Rôle inconnu", role: "king", number: 6, gg: 0 },
        "n'importe quoi",
      ],
    });
    expect(read).not.toBeNull();
    expect(murLignes([], read).map((l) => [l.key, l.gg])).toEqual([["n1", 2]]);
  });
  it("un mur vide ne donne aucune ligne", () => {
    expect(murLignes([], null)).toEqual([]);
    expect(murLignes([], tools({ wall: [] }))).toEqual([]);
  });
});

describe("recherche et filtres", () => {
  const lignes = murLignes([], tools());
  it("cherche dans le nom, sans les accents", () => {
    expect(lignes.filter((l) => murTrouve(l, "EPO")).map((l) => l.key)).toEqual(["n2"]);
    expect(lignes.filter((l) => murTrouve(l, "épo")).map((l) => l.key)).toEqual(["n2"]);
    expect(lignes.filter((l) => murTrouve(l, "  ")).length).toBe(4);
  });
  it("trouve tous les membres du même nom", () => {
    const jumeaux = murLignes([], tools({ wall: [member(1, "Jumeau"), member(2, "Autre"), member(3, "jumeau")] }));
    expect(jumeaux.filter((l) => murTrouve(l, "JUM")).map((l) => l.key)).toEqual(["n1", "n3"]);
  });
  it("filtre l'encadrement et les GG de la semaine", () => {
    expect(lignes.filter((l) => dansFiltre(l, "encadrement")).map((l) => l.key)).toEqual(["n1", "n3"]);
    expect(lignes.filter((l) => dansFiltre(l, "gg")).map((l) => l.key)).toEqual(["n1", "n3"]);
    expect(lignes.filter((l) => dansFiltre(l, "tous")).length).toBe(4);
  });
  it("plus de filtre « Parrains »", () => {
    expect(MUR_FILTRES.map((f) => f.id)).toEqual(["tous", "encadrement", "gg"]);
  });
  it("compte chaque filtre", () => {
    expect(murNombres(lignes)).toEqual({ tous: 4, encadrement: 2, gg: 2 });
    expect(murNombres([])).toEqual({ tous: 0, encadrement: 0, gg: 0 });
  });
  it("sans les outils, aucun GG n'est compté : pas de données n'est pas zéro GG", () => {
    expect(murNombres(murLignes([face("Brennos", "founder")], null))).toEqual({ tous: 1, encadrement: 1, gg: 0 });
  });
  it("applique la recherche puis le filtre, en gardant l'ordre", () => {
    expect(murVisible(lignes, "s", "encadrement").map((l) => l.key)).toEqual(["n1", "n3"]);
    expect(murVisible(lignes, "zzz", "tous")).toEqual([]);
    expect(murVisible([], "", "tous")).toEqual([]);
  });
});

describe("murFiltres", () => {
  it("« Tous » toujours, les autres s'ils comptent quelqu'un", () => {
    expect(murFiltres({ tous: 4, encadrement: 2, gg: 2 }, "tous", true)).toEqual(["tous", "encadrement", "gg"]);
    expect(murFiltres({ tous: 4, encadrement: 0, gg: 0 }, "tous", true)).toEqual(["tous"]);
  });
  it("le filtre choisi reste, même tombé à zéro : on voit pourquoi le mur est vide", () => {
    expect(murFiltres({ tous: 4, encadrement: 2, gg: 0 }, "gg", true)).toEqual(["tous", "encadrement", "gg"]);
  });
  it("le filtre des GG ne paraît pas sans les outils", () => {
    expect(murFiltres({ tous: 4, encadrement: 2, gg: 3 }, "tous", false)).toEqual(["tous", "encadrement"]);
  });
  it("garde l'ordre de la barre", () => {
    expect(murFiltres({ tous: 1, encadrement: 1, gg: 1 }, "gg", true)).toEqual(["tous", "encadrement", "gg"]);
  });
});

describe("murAnnonce", () => {
  it("rien quand tout le mur est montré", () => {
    expect(murAnnonce(40, "", "tous")).toBe("");
    expect(murAnnonce(40, "   ", "tous")).toBe("");
  });
  it("le nombre restant, accordé, après une lettre tapée ou un filtre", () => {
    expect(murAnnonce(1, "epo", "tous")).toBe("1 membre pour ce choix.");
    expect(murAnnonce(0, "zzz", "tous")).toBe("0 membre pour ce choix.");
    expect(murAnnonce(12, "", "encadrement")).toBe("12 membres pour ce choix.");
  });
});

describe("auMoins", () => {
  it("un nombre sous la borne du serveur se dit tel quel ; à la borne, il peut y en avoir davantage", () => {
    expect(auMoins(0, 50)).toBe("0");
    expect(auMoins(49, 50)).toBe("49");
    expect(auMoins(50, 50)).toBe("50 ou plus");
    expect(auMoins(300, 300)).toBe("300 ou plus");
  });
});

describe("murFocusApres", () => {
  it("le bouton qui prend la place de celui qui part, sinon le dernier", () => {
    expect(murFocusApres(2, 5)).toBe(2);
    expect(murFocusApres(4, 4)).toBe(3);
    expect(murFocusApres(-1, 3)).toBe(0);
  });
  it("aucun bouton : -1", () => {
    expect(murFocusApres(0, 0)).toBe(-1);
  });
});

