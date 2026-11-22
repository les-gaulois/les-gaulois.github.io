import { beforeEach, describe, expect, it, vi } from "vitest";

// Le serveur, simulé : chaque essai dit ce que répondent get_mon_duel et get_village_god.
const reponses: Record<string, () => unknown> = {};
vi.mock("../../src/lib/compte/api", () => {
  class ServerError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    ServerError,
    call: vi.fn(async (fn: string) => {
      const r = reponses[fn];
      if (!r) throw new ServerError("network");
      return r();
    }),
  };
});
const { ServerError } = await import("../../src/lib/compte/api");
const { lireLAcces } = await import("../../src/components/village/duel/acces");

describe("qui voit « Le duel »", () => {
  beforeEach(() => {
    for (const k of Object.keys(reponses)) delete reponses[k];
  });

  it("tout membre, quand le serveur répond au duel", async () => {
    reponses["get_mon_duel"] = () => ({ ok: true, ouvert: true });
    expect(await lireLAcces()).toEqual({ kind: "ouvert", serveur: { ok: true, ouvert: true } });
  });

  it("personne d'autre que le titulaire tant que le serveur le dit fermé, même pas par le repli", async () => {
    reponses["get_mon_duel"] = () => {
      throw new ServerError("duel_ferme");
    };
    reponses["get_village_god"] = () => ({ ok: true, permis: true, actif: false, depuis: null, somme: 100 });
    expect(await lireLAcces()).toEqual({ kind: "ferme" });
  });

  it("le pilote seul, tant que le serveur n'a pas encore le duel", async () => {
    reponses["get_village_god"] = () => ({ ok: true, permis: true, actif: false, depuis: null, somme: 100 });
    expect(await lireLAcces()).toEqual({ kind: "ouvert", serveur: null });
    reponses["get_village_god"] = () => ({ ok: true, permis: false });
    expect(await lireLAcces()).toEqual({ kind: "ferme" });
  });

  it("fermé quand rien ne répond", async () => {
    expect(await lireLAcces()).toEqual({ kind: "ferme" });
  });
});
