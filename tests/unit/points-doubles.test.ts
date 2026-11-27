import { describe, expect, it } from "vitest";
import { STATERES_PAR_POINT } from "../../src/lib/stateres";
import { ANCIEN_PAR_POINT, lirePointsDoubles, motsDesPointsDoubles } from "../../src/lib/village/points-doubles";

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
/** Les espaces insécables ramenées à des espaces, pour lire les phrases. */
const plain = (s: string) => s.split(NBSP).join(" ").split(NNBSP).join(" ");

describe("novembre doublé", () => {
  it("lit la réponse du serveur, et rien d'autre", () => {
    expect(lirePointsDoubles({ montant: 6000, parties: 41, vu: false })).toEqual({ montant: 6000, parties: 41, vu: false });
    expect(lirePointsDoubles({ montant: 52, parties: 2, vu: true })).toEqual({ montant: 52, parties: 2, vu: true });
    for (const x of [null, undefined, 3, "6000", {}, { montant: 0, parties: 1, vu: false }, { montant: 6000, parties: 0, vu: false }, { montant: 1.5, parties: 1, vu: false }, { montant: 6000, parties: 3, vu: "non" }, { montant: -1, parties: 1, vu: false }]) {
      expect(lirePointsDoubles(x)).toBeNull();
    }
  });

  it("met le montant d'abord, puis dit pourquoi : 6 000 reçus, +6 000", () => {
    // Le pilote, 27 novembre 2026 : « si ils ont gagné 6000 ils auront +6000 ».
    expect(ANCIEN_PAR_POINT).toBe(30);
    expect(STATERES_PAR_POINT).toBe(60);
    const m = motsDesPointsDoubles({ montant: 6000, parties: 41 });
    expect(plain(m.titre)).toBe("+6 000 statères");
    expect(m.lignes.map(plain)).toEqual([
      "Un point rapporté au clan vaut maintenant 60 statères, au lieu de 30.",
      "Vos 41 parties de novembre vous avaient rapporté 6 000 statères : vous les recevez une seconde fois.",
      "Ils sont déjà dans votre bourse.",
    ]);
  });

  it("écrit au singulier une seule partie et un seul statère, et accorde « les » au montant", () => {
    expect(plain(motsDesPointsDoubles({ montant: 30, parties: 1 }).lignes[1])).toBe("Votre partie de novembre vous avait rapporté 30 statères : vous les recevez une seconde fois.");
    const m = motsDesPointsDoubles({ montant: 1, parties: 1 });
    expect(plain(m.titre)).toBe("+1 statère");
    expect(m.lignes.map(plain).slice(1)).toEqual(["Votre partie de novembre vous avait rapporté 1 statère : vous le recevez une seconde fois.", "Il est déjà dans votre bourse."]);
  });

  it("dit « points rapportés au clan », jamais des statères gagnés par les victoires", () => {
    const texte = [motsDesPointsDoubles({ montant: 6000, parties: 41 }).titre, ...motsDesPointsDoubles({ montant: 6000, parties: 41 }).lignes].join(" ");
    expect(texte).not.toMatch(/victoire|partie gagnée|gagnés par/i);
  });
});
