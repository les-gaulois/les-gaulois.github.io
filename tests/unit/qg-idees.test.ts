import { describe, expect, it } from "vitest";
import { IDEA_MAX, IDEA_OPEN_MAX, ideaProblem, type QgIdea } from "../../src/lib/compte/qg";
import {
  IDEA_DECISION_VERBS,
  IDEA_FILTERS,
  IDEA_LONG_FROM,
  IDEA_STATUS_ORDER,
  IDEA_TONES,
  defaultIdeaFilter,
  filterAfterSend,
  filterIdeas,
  ideaCounts,
  ideaDecision,
  ideaFocusAfter,
  isLongIdea,
  searchIdeas,
} from "../../src/lib/compte/qg-idees";

const idea = (id: number, over: Partial<QgIdea> = {}): QgIdea => ({
  id,
  body: `Idée numéro ${id} pour le clan`,
  status: "open",
  staff_note: null,
  created_at: "2026-11-10T10:00:00Z",
  decided_at: null,
  author: "Epona",
  mine: false,
  supports: 0,
  supported: false,
  ...over,
});

const ideas = [
  idea(1),
  idea(2, { mine: true, author: "Tarvos" }),
  idea(3, { status: "kept", body: "Un événement chaque mois" }),
  idea(4, { status: "done", mine: true, author: "Tarvos" }),
  idea(5, { status: "declined" }),
  idea(6, { status: "declined", author: "Sucellos" }),
];

describe("ideaCounts", () => {
  it("compte chaque statut, et les idées du membre à part", () => {
    expect(ideaCounts(ideas)).toEqual({ open: 2, kept: 1, done: 1, declined: 2, mine: 2 });
  });

  it("rend des zéros sans idée", () => {
    expect(ideaCounts([])).toEqual({ open: 0, kept: 0, done: 0, declined: 0, mine: 0 });
  });

  it("chaque idée compte une fois dans un seul statut : les statuts font le total", () => {
    const counts = ideaCounts(ideas);
    expect(IDEA_STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0)).toBe(ideas.length);
  });

  it("une idée supprimée quitte son statut et « Mes idées »", () => {
    const left = ideas.filter((i) => i.id !== 2);
    expect(ideaCounts(left)).toEqual({ open: 1, kept: 1, done: 1, declined: 2, mine: 1 });
    expect(ideaCounts(ideas.filter((i) => i.id !== 5))).toEqual({ open: 2, kept: 1, done: 1, declined: 1, mine: 2 });
  });

  it("compte les idées que la recherche laisse, comme la liste affichée", () => {
    const found = searchIdeas(ideas, "tarvos");
    expect(ideaCounts(found)).toEqual({ open: 1, kept: 0, done: 1, declined: 0, mine: 2 });
    for (const f of IDEA_FILTERS) expect(filterIdeas(ideas, f.id, "tarvos")).toHaveLength(ideaCounts(found)[f.id]);
  });
});

describe("la limite des idées à l'étude", () => {
  it("se compte sur ses idées à l'étude seulement, comme avant", () => {
    const mine = [idea(1, { mine: true }), idea(2, { mine: true }), idea(3, { mine: true, status: "kept" }), idea(4)];
    const openMine = filterIdeas(mine, "open").filter((i) => i.mine).length;
    expect(openMine).toBe(2);
    expect(ideaProblem("Une idée assez longue", openMine)).toBeNull();
    expect(ideaProblem("Une idée assez longue", IDEA_OPEN_MAX)).toContain(`${IDEA_OPEN_MAX} idées à l'étude`);
  });
});

describe("defaultIdeaFilter", () => {
  it("ouvre « À l'étude » quand il y en a", () => {
    expect(defaultIdeaFilter(ideaCounts(ideas))).toBe("open");
  });

  it("ouvre « À l'étude » quand tout est vide, jamais « Mes idées »", () => {
    expect(defaultIdeaFilter(ideaCounts([]))).toBe("open");
    expect(defaultIdeaFilter({ open: 0, kept: 0, done: 0, declined: 0, mine: 0 })).toBe("open");
  });

  it("ouvre le premier statut qui a des idées quand rien n'est à l'étude", () => {
    expect(defaultIdeaFilter(ideaCounts([idea(1, { status: "declined" }), idea(2, { status: "done" })]))).toBe("done");
    expect(defaultIdeaFilter(ideaCounts([idea(1, { status: "kept", mine: true })]))).toBe("kept");
    expect(defaultIdeaFilter(ideaCounts([idea(1, { status: "declined", mine: true })]))).toBe("declined");
  });
});

describe("filterIdeas", () => {
  it("garde les idées du statut, dans l'ordre reçu", () => {
    expect(filterIdeas(ideas, "open").map((i) => i.id)).toEqual([1, 2]);
    expect(filterIdeas([...ideas].reverse(), "declined").map((i) => i.id)).toEqual([6, 5]);
  });

  it("« Mes idées » traverse les statuts", () => {
    expect(filterIdeas(ideas, "mine").map((i) => i.id)).toEqual([2, 4]);
    expect(filterIdeas(ideas, "mine", "numéro 4").map((i) => i.id)).toEqual([4]);
    expect(filterIdeas(ideas.filter((i) => !i.mine), "mine")).toEqual([]);
  });

  it("cherche dans le texte et dans l'auteur, sans accents ni majuscules", () => {
    expect(filterIdeas(ideas, "kept", "EVENEMENT").map((i) => i.id)).toEqual([3]);
    expect(filterIdeas(ideas, "kept", "ÉVÉNEMENT").map((i) => i.id)).toEqual([3]);
    expect(filterIdeas(ideas, "declined", "sucel").map((i) => i.id)).toEqual([6]);
    expect(filterIdeas(ideas, "declined", "SUCELLOS").map((i) => i.id)).toEqual([6]);
    expect(filterIdeas(ideas, "open", "tarvos numéro").map((i) => i.id)).toEqual([2]);
    expect(filterIdeas(ideas, "open", "introuvable")).toEqual([]);
  });

  it("trouve un mot accentué tapé sans accent, et l'inverse", () => {
    const list = [idea(1, { body: "Une soirée à thème", author: "Érèbe" }), idea(2, { body: "Une soiree sans accent" })];
    expect(searchIdeas(list, "soiree").map((i) => i.id)).toEqual([1, 2]);
    expect(searchIdeas(list, "soirée").map((i) => i.id)).toEqual([1, 2]);
    expect(searchIdeas(list, "erebe").map((i) => i.id)).toEqual([1]);
    expect(searchIdeas(list, "a theme").map((i) => i.id)).toEqual([1]);
  });

  it("lit les ligatures du français", () => {
    const list = [idea(1, { body: "Un vœu pour le cœur du clan" }), idea(2, { body: "Un coeur écrit sans ligature" })];
    expect(searchIdeas(list, "coeur").map((i) => i.id)).toEqual([1, 2]);
    expect(searchIdeas(list, "CŒUR").map((i) => i.id)).toEqual([1, 2]);
    expect(searchIdeas(list, "voeu").map((i) => i.id)).toEqual([1]);
  });

  it("une recherche vide ou faite d'espaces ne retire rien", () => {
    expect(filterIdeas(ideas, "open", "   ")).toHaveLength(2);
    expect(searchIdeas(ideas, "")).toEqual(ideas);
    expect(searchIdeas(ideas, " \t ")).toEqual(ideas);
  });
});

describe("isLongIdea", () => {
  it("replie au-delà de la limite, ou de trois lignes écrites", () => {
    expect(isLongIdea("x".repeat(IDEA_LONG_FROM))).toBe(false);
    expect(isLongIdea("x".repeat(IDEA_LONG_FROM + 1))).toBe(true);
    expect(isLongIdea("a\nb\nc")).toBe(false);
    expect(isLongIdea("a\nb\nc\nd")).toBe(true);
  });

  it("une idée de 240 caractères pile reste entière, sauf sur plus de trois lignes", () => {
    const words = "Une soirée par semaine en duo. ".repeat(10).slice(0, IDEA_LONG_FROM);
    expect(words).toHaveLength(240);
    expect(isLongIdea(words)).toBe(false);
    expect(isLongIdea(`${words.slice(0, 236)}\n\n\nx`)).toBe(true);
    expect(isLongIdea(`${words} `)).toBe(true);
  });

  it("la plus longue idée permise se replie", () => {
    expect(isLongIdea("x".repeat(IDEA_MAX))).toBe(true);
  });
});

describe("ideaDecision", () => {
  const open = idea(1);
  const kept = idea(2, { status: "kept", staff_note: "On la prépare.", decided_at: "2026-11-12T10:00:00Z" });

  it("tranche une idée à l'étude, avec le mot sans ses espaces autour", () => {
    expect(ideaDecision(open, "kept", "  Bien vu.  ")).toEqual({ status: "kept", note: "Bien vu." });
    expect(ideaDecision(open, "declined", "")).toEqual({ status: "declined", note: null });
    expect(ideaDecision(open, "done", "   ")).toEqual({ status: "done", note: null });
  });

  it("n'envoie rien quand ni le statut ni le mot ne changent", () => {
    expect(ideaDecision(kept, "kept", "On la prépare.")).toBeNull();
    expect(ideaDecision(kept, "kept", " On la prépare. ")).toBeNull();
    expect(ideaDecision(idea(3, { status: "done" }), "done", "  ")).toBeNull();
    expect(ideaDecision(open, "open", "")).toBeNull();
  });

  it("envoie un mot changé ou effacé sous le même statut", () => {
    expect(ideaDecision(kept, "kept", "Prévue pour décembre.")).toEqual({ status: "kept", note: "Prévue pour décembre." });
    expect(ideaDecision(kept, "kept", "")).toEqual({ status: "kept", note: null });
  });

  it("garde le mot quand seul le statut change", () => {
    expect(ideaDecision(kept, "done", "On la prépare.")).toEqual({ status: "done", note: "On la prépare." });
  });

  it("remet à l'étude sans aucun mot, même s'il en reste un dans le champ caché", () => {
    expect(ideaDecision(kept, "open", "On la prépare.")).toEqual({ status: "open", note: null });
    expect(ideaDecision(idea(3, { status: "declined", staff_note: null }), "open", "Un mot tapé puis caché")).toEqual({ status: "open", note: null });
  });
});

describe("ideaFocusAfter", () => {
  it("reste sur l'idée si elle est encore affichée", () => {
    expect(ideaFocusAfter([1, 2, 3], 2, 1)).toBe(2);
    expect(ideaFocusAfter([2, 1, 3], 2, 0)).toBe(2);
  });

  it("passe à l'idée qui a pris sa place, ou à la dernière", () => {
    expect(ideaFocusAfter([1, 3], 2, 1)).toBe(3);
    expect(ideaFocusAfter([1, 2], 3, 2)).toBe(2);
    expect(ideaFocusAfter([1, 2], 9, 7)).toBe(2);
    expect(ideaFocusAfter([2, 3], 1, 0)).toBe(2);
    expect(ideaFocusAfter([2, 3], 1, -1)).toBe(2);
  });

  it("ne rend rien quand la liste est vide", () => {
    expect(ideaFocusAfter([], 1, 0)).toBeNull();
  });
});

describe("filterAfterSend", () => {
  it("montre la nouvelle idée : « À l'étude », ou « Mes idées » si c'était le filtre", () => {
    expect(filterAfterSend("mine")).toBe("mine");
    for (const status of IDEA_STATUS_ORDER) expect(filterAfterSend(status)).toBe("open");
  });
});

describe("couleurs et filtres", () => {
  it("chaque filtre de statut porte la couleur de son statut, « Mes idées » aucune", () => {
    for (const f of IDEA_FILTERS) expect(f.tone).toBe(f.id === "mine" ? undefined : IDEA_TONES[f.id]);
  });

  it("les filtres de statut suivent l'ordre des statuts, sans en oublier", () => {
    expect(IDEA_FILTERS.filter((f) => f.id !== "mine").map((f) => f.id)).toEqual([...IDEA_STATUS_ORDER]);
    expect([...IDEA_STATUS_ORDER].sort()).toEqual(Object.keys(IDEA_TONES).sort());
  });

  it("les décisions de la ligne couvrent chaque statut sauf « À l'étude », dans l'ordre", () => {
    expect(Object.keys(IDEA_DECISION_VERBS)).toEqual(IDEA_STATUS_ORDER.filter((s) => s !== "open"));
  });

  it("aucune idée n'est en rouge", () => {
    expect(Object.values(IDEA_TONES)).not.toContain("danger");
  });
});
