import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ETAPES_ARRIVEE, etapeAFaire, gauloisASavoir, numeroDeLEtape } from "../../src/lib/compte/arrivee";
import type { Me, MyRequest } from "../../src/lib/compte/types";

const demande = (status: MyRequest["status"]): MyRequest => ({
  id: 1,
  status,
  reason: null,
  in_roster: false,
  roster_username: null,
  created_at: "2026-11-15T10:00:00Z",
  decided_at: null,
});

const nouveau: Me = { signed_in: true, number: 12, status: "pending", request: null };
const enAttente: Me = { ...nouveau, request: demande("pending") };
const valide: Me = { signed_in: true, number: 3, status: "validated", rank: 1, request: null };

describe("l'inscription d'un compte", () => {
  it("a trois étapes, dans l'ordre : connexion, lien OpenFront, Gaulois", () => {
    expect(ETAPES_ARRIVEE.map((e) => e.id)).toEqual(["connexion", "lien", "gaulois"]);
    expect(numeroDeLEtape("connexion")).toBe(1);
    expect(numeroDeLEtape("lien")).toBe(2);
    expect(numeroDeLEtape("gaulois")).toBe(3);
  });

  it("demande d'abord de se connecter", () => {
    expect(etapeAFaire({ signed_in: false }, undefined, undefined)).toBe("connexion");
  });

  it("attend tant que le compte, l'alliance ou le Gaulois ne sont pas lus", () => {
    expect(etapeAFaire(null, undefined, undefined)).toBeUndefined();
    expect(etapeAFaire(nouveau, undefined, undefined)).toBeUndefined();
    expect(etapeAFaire(valide, false, undefined)).toBeUndefined();
  });

  it("demande le lien OpenFront avant le Gaulois, à un compte qui n'a rien envoyé", () => {
    expect(etapeAFaire(nouveau, false, undefined)).toBe("lien");
    // Même si le Gaulois existe déjà : le lien reste obligatoire.
    expect(etapeAFaire(nouveau, false, true)).toBe("lien");
  });

  it("demande ensuite le Gaulois, au compte en attente comme au membre validé", () => {
    expect(etapeAFaire(enAttente, false, false)).toBe("gaulois");
    expect(etapeAFaire(valide, false, false)).toBe("gaulois");
    expect(etapeAFaire({ ...valide, rank: 4, role: "founder" }, false, false)).toBe("gaulois");
  });

  it("ne demande plus rien une fois le Gaulois créé", () => {
    expect(etapeAFaire(enAttente, false, true)).toBeNull();
    expect(etapeAFaire(valide, false, true)).toBeNull();
  });

  it("une demande refusée, annulée ou à refaire compte comme un lien donné : elle se refait dans « Mon compte »", () => {
    for (const status of ["refused", "cancelled", "approved"] as const) {
      expect(etapeAFaire({ ...nouveau, request: demande(status) }, false, false)).toBe("gaulois");
    }
  });

  it("ne ferme rien quand le serveur n'a pas pu dire si le Gaulois existe", () => {
    expect(etapeAFaire(valide, false, null)).toBeNull();
  });

  it("ne demande rien à un joueur allié invité, ni à un compte suspendu", () => {
    expect(etapeAFaire(nouveau, true, undefined)).toBeNull();
    expect(etapeAFaire({ ...valide, status: "suspended" }, undefined, undefined)).toBeNull();
  });

  it("ne demande le Gaulois au serveur que quand c'est la dernière chose à savoir", () => {
    expect(gauloisASavoir(null, undefined)).toBe(false);
    expect(gauloisASavoir({ signed_in: false }, undefined)).toBe(false);
    expect(gauloisASavoir(nouveau, false)).toBe(false);
    expect(gauloisASavoir(enAttente, undefined)).toBe(false);
    expect(gauloisASavoir(enAttente, true)).toBe(false);
    expect(gauloisASavoir(enAttente, false)).toBe(true);
    expect(gauloisASavoir(valide, false)).toBe(true);
    expect(gauloisASavoir({ ...valide, status: "suspended" }, false)).toBe(false);
  });
});

describe("les écrans de l'inscription", () => {
  const lire = (f: string) => readFileSync(f, "utf8");

  it("le QG, le village, la carte de l'alliance et l'en-tête suivent l'inscription ; la Direction, non", () => {
    expect(lire("src/components/compte/QgApp.tsx")).toMatch(/useArrivee\(me\)/);
    expect(lire("src/components/village/VillageApp.tsx")).toMatch(/useArrivee\(me\)/);
    expect(lire("src/components/carte/alliance/AllianceApp.tsx")).toMatch(/useGauloisCree\(/);
    expect(lire("src/components/AuthMenu.tsx")).toMatch(/useArrivee\(me\)/);
    expect(lire("src/components/compte/DirectionApp.tsx")).not.toMatch(/useArrivee|useGauloisCree/);
  });

  it("l'en-tête n'emporte pas le vestiaire : le fichier des portes reste léger", () => {
    const leger = lire("src/components/compte/arrivee.tsx");
    expect(leger).not.toMatch(/from "\.\/Vestiaire"|from "\.\.\/\.\.\/lib\/gaulois"|ParcoursArrivee/);
    // « Mon compte » ne charge le vestiaire qu'à son étape.
    expect(lire("src/components/compte/ParcoursArrivee.tsx")).toMatch(/import\("\.\/Vestiaire"\)/);
    expect(lire("src/components/compte/ParcoursArrivee.tsx")).not.toMatch(/from "\.\/Vestiaire"/);
  });
});
