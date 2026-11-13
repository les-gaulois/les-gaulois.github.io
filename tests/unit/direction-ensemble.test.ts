import { describe, expect, it } from "vitest";
import { MEMBER_FILTERS } from "../../src/lib/compte/admin-members";
import { ETAT_PASTILLE, ensembleCases, etatResume } from "../../src/lib/compte/direction-ensemble";

const nombres = (over: Partial<Parameters<typeof ensembleCases>[0]> = {}) => ({ pending_requests: 0, members: 0, officers: 0, suspended: 0, ...over });
const caseOf = (id: string, over: Parameters<typeof nombres>[0] = {}) => {
  const found = ensembleCases(nombres(over)).find((c) => c.id === id);
  if (!found) throw new Error(`case ${id} absente`);
  return found;
};

describe("ensembleCases", () => {
  it("donne les quatre cases dans l'ordre de l'écran, avec les nombres du serveur tels quels", () => {
    const cases = ensembleCases({ pending_requests: 12, members: 1284, officers: 14, suspended: 3 });
    expect(cases.map((c) => [c.id, c.value])).toEqual([
      ["demandes", 12],
      ["membres", 1284],
      ["encadrement", 14],
      ["suspendus", 3],
    ]);
  });

  it("ouvre Demandes, puis Comptes avec le filtre de la case", () => {
    expect(ensembleCases(nombres()).map((c) => [c.part, c.filter])).toEqual([
      ["demandes", undefined],
      ["comptes", "validated"],
      ["comptes", "staff"],
      ["comptes", "suspended"],
    ]);
  });

  it("met les demandes en jaune dès qu'il y en a une, en gris sinon", () => {
    expect(caseOf("demandes", { pending_requests: 1 })).toMatchObject({ ton: "warn", mot: "À traiter" });
    expect(caseOf("demandes")).toMatchObject({ ton: "muted", mot: "Rien à faire" });
  });

  it("met les suspendus en rouge, accordés, et en gris quand il n'y en a pas", () => {
    expect(caseOf("suspendus", { suspended: 1 })).toMatchObject({ ton: "danger", mot: "Suspendu" });
    expect(caseOf("suspendus", { suspended: 2 })).toMatchObject({ ton: "danger", mot: "Suspendus" });
    expect(caseOf("suspendus")).toMatchObject({ ton: "muted", mot: "Aucun suspendu" });
  });

  it("reprend la couleur des filtres de Comptes pour les validés et les suspendus", () => {
    const tone = (id: string) => MEMBER_FILTERS.find((f) => f.id === id)?.tone;
    expect(caseOf("membres", { members: 5 }).ton).toBe(tone("validated"));
    expect(caseOf("suspendus", { suspended: 5 }).ton).toBe(tone("suspended"));
  });

  it("grise une case à zéro : rien n'y attend", () => {
    for (const c of ensembleCases(nombres())) expect(c.ton).toBe("muted");
    expect(caseOf("encadrement", { officers: 3 }).ton).toBe("ally");
  });

  it("donne un mot à chaque couleur", () => {
    for (const c of [...ensembleCases(nombres()), ...ensembleCases({ pending_requests: 2, members: 2, officers: 2, suspended: 2 })]) expect(c.mot.trim()).not.toBe("");
  });
});

describe("l'état du site", () => {
  it("a une pastille par niveau, la gazette en bleu et sans jugement", () => {
    expect(ETAT_PASTILLE.ok).toEqual({ ton: "ok", mot: "OK" });
    expect(ETAT_PASTILLE.warn).toEqual({ ton: "warn", mot: "À voir" });
    expect(ETAT_PASTILLE.info).toEqual({ ton: "ally", mot: "Info" });
  });

  it("résume le nombre de points à surveiller, en mots", () => {
    expect(etatResume(0)).toEqual({ ton: "ok", mot: "Rien à signaler" });
    expect(etatResume(1)).toEqual({ ton: "warn", mot: "1 point à surveiller" });
    expect(etatResume(3)).toEqual({ ton: "warn", mot: "3 points à surveiller" });
  });
});
