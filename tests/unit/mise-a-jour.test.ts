import { describe, expect, it } from "vitest";
import { fmtDateTime } from "../../src/lib/format";
import { joinLabels, SOURCE_LABELS, updateGroups, updateLine } from "../../src/lib/mise-a-jour";

const PARTIES = { label: SOURCE_LABELS.sessions, lastSuccessAt: "2026-11-14T15:53:40.997Z" };
const PODIUMS = { label: SOURCE_LABELS.memberResults, lastSuccessAt: "2026-11-14T15:53:12.000Z" };
const LISTE = { label: SOURCE_LABELS.members, lastSuccessAt: "2026-11-14T08:53:38.293Z" };

describe("la date de mise à jour d'une page", () => {
  it("n'écrit qu'une date quand toutes les sources ont la même", () => {
    expect(updateLine([PARTIES, PODIUMS], fmtDateTime)).toBe("Dernière mise à jour : 14 nov. 2026, 16:53, heure de Paris.");
    // Une seule source : la ligne de toujours.
    expect(updateLine([LISTE], fmtDateTime)).toBe("Dernière mise à jour : 14 nov. 2026, 09:53, heure de Paris.");
  });

  it("nomme chaque source quand les dates diffèrent, sans en perdre une", () => {
    const line = updateLine([PARTIES, PODIUMS, LISTE], fmtDateTime);
    expect(line).toBe("Dernière mise à jour des parties et des podiums : 14 nov. 2026, 16:53 · de la liste des membres : 14 nov. 2026, 09:53, heure de Paris.");
    expect(line?.match(/Dernière mise à jour/g)).toHaveLength(1);
  });

  it("range les sources par date écrite, dans l'ordre de la page", () => {
    const { groups } = updateGroups([LISTE, PARTIES, PODIUMS], fmtDateTime);
    expect(groups.map((g) => g.labels)).toEqual([["de la liste des membres"], ["des parties", "des podiums"]]);
  });

  it("dit la source jamais collectée, et ne date pas les autres à sa place", () => {
    const line = updateLine([PARTIES, { label: SOURCE_LABELS.ranked, lastSuccessAt: null }], fmtDateTime);
    expect(line).toBe("Dernière mise à jour des parties : 14 nov. 2026, 16:53, heure de Paris. Aucune donnée du classé collectée pour le moment.");
    expect(updateLine([{ label: SOURCE_LABELS.ranked, lastSuccessAt: null }], fmtDateTime)).toBeNull();
  });

  it("joint les noms en français", () => {
    expect(joinLabels([])).toBe("");
    expect(joinLabels(["a"])).toBe("a");
    expect(joinLabels(["a", "b"])).toBe("a et b");
    expect(joinLabels(["a", "b", "c"])).toBe("a, b et c");
  });
});
