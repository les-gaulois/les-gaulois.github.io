import { describe, expect, it } from "vitest";
import { soldeDeLaReponse } from "../../src/lib/compte/api";

// Le solde que le bandeau de « Mon Gaulois » suit : celui que porte une réponse du serveur, et rien d'autre.

describe("le solde d'une réponse du serveur", () => {
  it("lit le solde écrit dans la réponse", () => {
    expect(soldeDeLaReponse({ ok: true, solde: 3200, inventaire: [] })).toBe(3200);
    expect(soldeDeLaReponse({ ok: true, solde: 0 })).toBe(0);
  });

  it("lit le solde d'un bloc de premier niveau, comme celui de la forge", () => {
    expect(soldeDeLaReponse({ ok: true, plaque: { texte: "x" }, forge: { ok: true, prix: 150, solde: 2850 } })).toBe(2850);
  });

  it("préfère le solde de la réponse à celui d'un bloc", () => {
    expect(soldeDeLaReponse({ solde: 10, forge: { solde: 99 } })).toBe(10);
  });

  it("ne lit rien dans une liste : une ligne n'est pas la bourse du compte", () => {
    expect(soldeDeLaReponse([{ solde: 500 }])).toBeNull();
    expect(soldeDeLaReponse({ ok: true, comptes: [{ solde: 500 }, { solde: 20 }] })).toBeNull();
  });

  it("ne lit rien plus profond que le premier niveau", () => {
    expect(soldeDeLaReponse({ a: { b: { solde: 7 } } })).toBeNull();
  });

  it("écarte ce qui n'est pas un entier positif ou nul", () => {
    for (const solde of [-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY, "3200", null, undefined, true]) {
      expect(soldeDeLaReponse({ solde }), String(solde)).toBeNull();
    }
  });

  it("rend null pour une réponse vide ou qui n'est pas un objet", () => {
    for (const reponse of [null, undefined, 3200, "3200", true, {}]) expect(soldeDeLaReponse(reponse)).toBeNull();
  });
});
