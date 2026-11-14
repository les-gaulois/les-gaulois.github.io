import { describe, expect, expectTypeOf, it } from "vitest";
import type { DirTon } from "../../src/components/compte/direction-kit";
import { MEMBER_FILTERS } from "../../src/lib/compte/admin-members";
import { ETAT_PASTILLE, ensembleCases, etatResume, type EnsembleCase, type EnsembleTon } from "../../src/lib/compte/direction-ensemble";
import { SOURCES, siteHealth } from "../../src/lib/etat-site";
import { emptyMeta, type Meta } from "../../src/lib/schemas";

const nombres = (over: Partial<Parameters<typeof ensembleCases>[0]> = {}) => ({ pending_requests: 0, members: 0, officers: 0, suspended: 0, ...over });
const caseOf = (id: EnsembleCase["id"], over: Parameters<typeof nombres>[0] = {}) => {
  const found = ensembleCases(nombres(over)).find((c) => c.id === id);
  if (!found) throw new Error(`case ${id} absente`);
  return found;
};
/** Le champ de `get_direction_overview` que montre chaque case. */
const CHAMP = { demandes: "pending_requests", membres: "members", encadrement: "officers", suspendus: "suspended" } as const;

describe("ensembleCases", () => {
  it("donne les quatre cases dans l'ordre de l'écran, avec les nombres du serveur tels quels", () => {
    const cases = ensembleCases({ pending_requests: 12, members: 1284, officers: 14, suspended: 3 });
    expect(cases.map((c) => [c.id, c.label, c.value])).toEqual([
      ["demandes", "Demandes", 12],
      ["membres", "Membres", 1284],
      ["encadrement", "Encadrement", 14],
      ["suspendus", "Comptes", 3],
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

  it("n'ouvre que des filtres qui existent dans l'onglet Comptes", () => {
    const filtres = new Set(MEMBER_FILTERS.map((f) => f.id));
    for (const c of ensembleCases(nombres())) if (c.filter) expect(filtres.has(c.filter)).toBe(true);
  });

  it("met les demandes en jaune dès qu'il y en a une, en gris sinon", () => {
    expect(caseOf("demandes")).toMatchObject({ ton: "muted", mot: "Rien à faire" });
    expect(caseOf("demandes", { pending_requests: 1 })).toMatchObject({ ton: "warn", mot: "À traiter" });
    expect(caseOf("demandes", { pending_requests: 12 })).toMatchObject({ ton: "warn", mot: "À traiter" });
  });

  it("accorde les validés : aucun, un, plusieurs", () => {
    expect(caseOf("membres")).toMatchObject({ ton: "muted", mot: "Aucun validé" });
    expect(caseOf("membres", { members: 1 })).toMatchObject({ ton: "ok", mot: "Validé" });
    expect(caseOf("membres", { members: 2 })).toMatchObject({ ton: "ok", mot: "Validés" });
    expect(caseOf("membres", { members: 1284 })).toMatchObject({ ton: "ok", mot: "Validés" });
  });

  it("met les suspendus en rouge, accordés, et en gris quand il n'y en a pas", () => {
    expect(caseOf("suspendus")).toMatchObject({ ton: "muted", mot: "Aucun suspendu" });
    expect(caseOf("suspendus", { suspended: 1 })).toMatchObject({ ton: "danger", mot: "Suspendu" });
    expect(caseOf("suspendus", { suspended: 2 })).toMatchObject({ ton: "danger", mot: "Suspendus" });
  });

  it("met l'encadrement en bleu, avec un mot qui vaut pour tout nombre", () => {
    expect(caseOf("encadrement")).toMatchObject({ ton: "muted", mot: "Avec un rôle" });
    expect(caseOf("encadrement", { officers: 1 })).toMatchObject({ ton: "ally", mot: "Avec un rôle" });
    expect(caseOf("encadrement", { officers: 14 })).toMatchObject({ ton: "ally", mot: "Avec un rôle" });
  });

  it("reprend la couleur des filtres de Comptes pour les validés et les suspendus", () => {
    const tone = (id: string) => MEMBER_FILTERS.find((f) => f.id === id)?.tone;
    expect(caseOf("membres", { members: 5 }).ton).toBe(tone("validated"));
    expect(caseOf("suspendus", { suspended: 5 }).ton).toBe(tone("suspended"));
  });

  it("grise une case à zéro, et seulement à zéro : rien n'y attend", () => {
    for (const c of ensembleCases(nombres())) expect(c.ton).toBe("muted");
    for (const c of ensembleCases(nombres({ pending_requests: 1, members: 1, officers: 1, suspended: 1 }))) expect(c.ton).not.toBe("muted");
  });

  it("ne dit « Aucun » ou « Rien » qu'à zéro, quel que soit le nombre", () => {
    for (const n of [0, 1, 2, 9, 1000]) {
      for (const c of ensembleCases(nombres({ pending_requests: n, members: n, officers: n, suspended: n }))) {
        expect(c.value).toBe(n);
        expect(c.mot.trim()).not.toBe("");
        // Le mot ne contredit jamais le nombre : « Aucun suspendu » sous un 3 serait faux.
        if (c.id !== "encadrement") expect(/^(Aucun|Rien)\b/.test(c.mot), `${c.id} à ${n} : « ${c.mot} »`).toBe(n === 0);
        // Un mot au pluriel seulement au-delà de un.
        if (c.id === "membres" || c.id === "suspendus") expect(c.mot.endsWith("s"), `${c.id} à ${n} : « ${c.mot} »`).toBe(n > 1);
      }
    }
  });

  it("garde chaque nombre dans sa case, sans les mélanger", () => {
    const data = { pending_requests: 4, members: 30, officers: 5, suspended: 2 };
    for (const c of ensembleCases(data)) expect(c.value).toBe(data[CHAMP[c.id]]);
  });
});

describe("les couleurs", () => {
  it("sont exactement celles des pièces communes de la Direction", () => {
    // Contrôlé par `npm run typecheck` (tsc lit `tests/`) : une couleur en plus ou en moins d'un côté ne compile plus.
    expectTypeOf<EnsembleTon>().toEqualTypeOf<DirTon>();
  });
});

describe("l'état du site", () => {
  it("a une pastille par niveau, la gazette en bleu et sans jugement", () => {
    expect(ETAT_PASTILLE.ok).toEqual({ ton: "ok", mot: "OK" });
    expect(ETAT_PASTILLE.warn).toEqual({ ton: "warn", mot: "À voir" });
    expect(ETAT_PASTILLE.info).toEqual({ ton: "ally", mot: "Info" });
  });

  it("résume le nombre de points à surveiller, en mots", () => {
    expect(etatResume([])).toEqual({ ton: "ok", mot: "Rien à signaler" });
    expect(etatResume([{ level: "ok" }, { level: "ok" }])).toEqual({ ton: "ok", mot: "Rien à signaler" });
    expect(etatResume([{ level: "warn" }, { level: "ok" }])).toEqual({ ton: "warn", mot: "1 point à surveiller" });
    expect(etatResume([{ level: "warn" }, { level: "warn" }, { level: "ok" }, { level: "warn" }])).toEqual({ ton: "warn", mot: "3 points à surveiller" });
  });

  it("ne compte jamais une information comme un point à surveiller", () => {
    expect(etatResume([{ level: "info" }, { level: "ok" }])).toEqual({ ton: "ok", mot: "Rien à signaler" });
    expect(etatResume([{ level: "info" }, { level: "warn" }])).toEqual({ ton: "warn", mot: "1 point à surveiller" });
  });

  it("compte les lignes de l'état, pas chacune des sources en retard", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    const before = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
    const meta: Meta = emptyMeta();
    meta.lastRunAt = before(20);
    for (const { key } of SOURCES) Object.assign(meta[key], { lastSuccessAt: before(20), lastErrorAt: null, lastError: null });
    // Deux sources en échec : la seule ligne « API d'OpenFront » est à voir.
    Object.assign(meta.sessions, { lastErrorAt: before(10), lastError: "HTTP 503" });
    Object.assign(meta.games, { lastErrorAt: before(10), lastError: "HTTP 503" });
    const health = siteHealth({ meta, gazette: null, roster: { total: 31, read_at: before(90) } }, now);
    expect(health.sources.filter((s) => s.level === "warn")).toHaveLength(2);
    expect(etatResume(health.lines)).toEqual({ ton: "warn", mot: "1 point à surveiller" });
  });
});
