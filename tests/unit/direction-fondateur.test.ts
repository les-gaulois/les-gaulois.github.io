import { describe, expect, it } from "vitest";
import {
  currentFounder,
  heirCountLabel,
  heirCounts,
  heirs,
  HEIR_FILTERS,
  homonymTags,
  inHeirFilter,
  ROLE_AFTER_TRANSFER,
  transferDoneMessage,
  typedState,
} from "../../src/lib/compte/direction-fondateur";
import type { MemberRow } from "../../src/lib/compte/types";

type Row = Pick<MemberRow, "user_id" | "name" | "role" | "status">;
const row = (name: string, role: Row["role"], status: Row["status"] = "validated"): Row => ({ user_id: `id-${name}-${role}`, name, role, status });

const rows: Row[] = [
  row("Zoé", "member"),
  row("Chef", "founder"),
  row("épona", "officer"),
  row("Gaulois n° 12", "member", "pending"),
  row("Banni", "officer", "suspended"),
  row("Acco", "member"),
  row("Brennos", "admin"),
  row("Bituitos", "officer"),
];

// Les caractères écrits par leur code : un « É » d'une seule lettre, et le même fait d'un « E » et d'un accent aigu.
const E_COMPOSE = String.fromCharCode(0xc9);
const E_DECOMPOSE = String.fromCharCode(0x45, 0x301);
const NBSP = String.fromCharCode(0xa0);

describe("heirs : à qui le rôle peut être transmis", () => {
  it("ne garde que les comptes validés, sans le fondateur, comme le serveur", () => {
    const names = heirs(rows).map((m) => m.name);
    expect(names).not.toContain("Chef");
    expect(names).not.toContain("Gaulois n° 12");
    expect(names).not.toContain("Banni");
    expect(names).toHaveLength(5);
  });

  it("range l'encadrement d'abord, puis par nom sans tenir compte des accents ni des majuscules", () => {
    expect(heirs(rows).map((m) => m.name)).toEqual(["Brennos", "Bituitos", "épona", "Acco", "Zoé"]);
  });

  it("ne change pas la liste reçue", () => {
    const before = rows.map((m) => m.name);
    heirs(rows);
    expect(rows.map((m) => m.name)).toEqual(before);
  });

  it("rend une liste vide sans personne d'autre que le fondateur, et un seul membre quand il est seul", () => {
    expect(heirs([])).toEqual([]);
    expect(heirs([row("Chef", "founder")])).toEqual([]);
    expect(heirs([row("Chef", "founder"), row("Acco", "member")]).map((m) => m.name)).toEqual(["Acco"]);
  });
});

describe("currentFounder", () => {
  it("lit le fondateur dans la liste, ou rien s'il n'y est pas", () => {
    expect(currentFounder(rows)?.name).toBe("Chef");
    expect(currentFounder(rows.filter((m) => m.role !== "founder"))).toBeNull();
  });
});

describe("filtres par rôle", () => {
  it("compte chaque rôle, et « Tous » les compte tous", () => {
    expect(heirCounts(heirs(rows))).toEqual({
      all: 5,
      admin: 1,
      officer: 2,
      member: 2,
    });
  });

  it("compte zéro partout dans une liste vide", () => {
    expect(heirCounts([])).toEqual({ all: 0, admin: 0, officer: 0, member: 0 });
  });

  it("chaque filtre ne laisse passer que son rôle", () => {
    const list = heirs(rows);
    for (const f of HEIR_FILTERS) {
      expect(list.filter((m) => inHeirFilter(m, f.id))).toHaveLength(heirCounts(list)[f.id]);
    }
  });
});

describe("heirCountLabel : la ligne sous la liste", () => {
  it("dit le total quand tout est montré, au singulier comme au pluriel", () => {
    expect(heirCountLabel(26, 26)).toBe("26 autres membres validés");
    expect(heirCountLabel(2, 2)).toBe("2 autres membres validés");
    expect(heirCountLabel(1, 1)).toBe("1 autre membre validé");
  });

  it("dit combien sont montrés sur le total quand la recherche ou un filtre en cache", () => {
    expect(heirCountLabel(3, 26)).toBe("3 sur 26 autres membres validés");
    expect(heirCountLabel(1, 26)).toBe("1 sur 26 autres membres validés");
    expect(heirCountLabel(0, 26)).toBe("0 sur 26 autres membres validés");
    expect(heirCountLabel(0, 1)).toBe("0 sur 1 autre membre validé");
  });
});

describe("homonymTags : deux membres du même nom", () => {
  type H = Pick<MemberRow, "user_id" | "name" | "number" | "discord_name">;
  const h = (number: number, name: string, discord_name: string | null): H => ({ user_id: `u${number}`, name, number, discord_name });

  it("ne marque personne quand chaque nom est seul", () => {
    expect(homonymTags([h(1, "Luern", "luern"), h(2, "Acco", null), h(3, "Épona", "epona")]).size).toBe(0);
    expect(homonymTags([]).size).toBe(0);
  });

  it("distingue deux homonymes par leur nom Discord", () => {
    const tags = homonymTags([h(4, "Luern", "luern_4"), h(5, "Acco", "acco"), h(24, "Luern", "luern_24")]);
    expect(Object.fromEntries(tags)).toEqual({ u4: "luern_4", u24: "luern_24" });
  });

  it("tient pour homonymes deux noms qui ne diffèrent que par les accents, les majuscules ou les espaces", () => {
    const tags = homonymTags([h(1, "Épona", "a"), h(2, "epona", "b"), h(3, " EPONA ", "c"), h(4, "Gaulois  n° 31", "d"), h(5, "Gaulois n° 31", "e")]);
    expect(Object.fromEntries(tags)).toEqual({ u1: "a", u2: "b", u3: "c", u4: "d", u5: "e" });
  });

  it("prend le numéro de Gaulois quand le nom Discord manque, est vide ou ne suffit pas", () => {
    const tags = homonymTags([h(4, "Luern", "luern"), h(24, "Luern", null), h(7, "Acco", "acco"), h(8, "Acco", "ACCO"), h(9, "Divico", ""), h(10, "Divico", "divico")]);
    expect(tags.get("u4")).toBe("luern");
    expect(tags.get("u24")).toBe(`Gaulois n°${NBSP}24`);
    expect(tags.get("u7")).toBe(`Gaulois n°${NBSP}7`);
    expect(tags.get("u8")).toBe(`Gaulois n°${NBSP}8`);
    expect(tags.get("u9")).toBe(`Gaulois n°${NBSP}9`);
    expect(tags.get("u10")).toBe("divico");
  });

  it("donne à chacun de trois homonymes une marque différente", () => {
    const tags = homonymTags([h(1, "Luern", null), h(2, "Luern", null), h(3, "Luern", "luern")]);
    expect(new Set(tags.values()).size).toBe(3);
  });
});

describe("typedState : le nom retapé", () => {
  it("n'est exact qu'avec les mêmes lettres, majuscules et accents", () => {
    expect(typedState("Épona", "Épona")).toBe("exact");
    expect(typedState("épona", "Épona")).toBe("other");
    expect(typedState("Epona", "Épona")).toBe("other");
  });

  it("ignore les espaces du bord, pas celles du milieu", () => {
    expect(typedState("  Épona ", "Épona")).toBe("exact");
    expect(typedState(`Épona${NBSP}`, "Épona")).toBe("exact");
    expect(typedState("Épona", " Épona ")).toBe("exact");
    expect(typedState("Gaulois n°12", "Gaulois n° 12")).toBe("other");
  });

  it("garde les espaces du milieu d'un nom qui en a", () => {
    expect(typedState("Gaulois n° 12", "Gaulois n° 12")).toBe("exact");
    expect(typedState("Gaulois  n° 12", "Gaulois n° 12")).toBe("other");
    expect(typedState("Gaulois n°", "Gaulois n° 12")).toBe("start");
    expect(typedState("Ambiorix le Très Patient", "Ambiorix le Très Patient de la Forêt")).toBe("start");
  });

  it("tient pour la même lettre un « É » composé et un « É » fait d'un E et d'un accent", () => {
    // Les deux écritures diffèrent vraiment : sans la mise sous la même forme, le nom ne serait jamais exact.
    expect(E_COMPOSE).not.toBe(E_DECOMPOSE);
    expect(E_COMPOSE.length).toBe(1);
    expect(E_DECOMPOSE.length).toBe(2);
    expect(typedState(`${E_DECOMPOSE}pona`, `${E_COMPOSE}pona`)).toBe("exact");
    expect(typedState(`${E_COMPOSE}pona`, `${E_DECOMPOSE}pona`)).toBe("exact");
    expect(typedState(`${E_DECOMPOSE}po`, `${E_COMPOSE}pona`)).toBe("start");
    expect(typedState(` ${E_DECOMPOSE}pona `, `${E_COMPOSE}pona`)).toBe("exact");
  });

  it("garde les majuscules après la mise sous la même forme", () => {
    const eMinusculeDecompose = String.fromCharCode(0x65, 0x301);
    expect(typedState(`${eMinusculeDecompose}pona`, `${E_COMPOSE}pona`)).toBe("other");
    expect(typedState(`${E_DECOMPOSE}PONA`, `${E_COMPOSE}pona`)).toBe("other");
  });

  it("dit vide, début ou autre nom", () => {
    expect(typedState("", "Épona")).toBe("empty");
    expect(typedState("   ", "Épona")).toBe("empty");
    expect(typedState("Épo", "Épona")).toBe("start");
    expect(typedState("Éponax", "Épona")).toBe("other");
  });
});

describe("après la transmission", () => {
  it("celui qui transmet devient admin, comme dans transfer_founder", () => {
    expect(ROLE_AFTER_TRANSFER).toBe("admin");
  });

  it("dit à qui le rôle est transmis et ce que devient celui qui le transmet", () => {
    expect(transferDoneMessage("Épona", null)).toBe("Rôle transmis à Épona. Vous êtes maintenant admin.");
  });

  it("distingue le nouveau fondateur d'un homonyme", () => {
    expect(transferDoneMessage("Luern", "luern_4")).toBe("Rôle transmis à Luern (luern_4). Vous êtes maintenant admin.");
    expect(transferDoneMessage("Luern", `Gaulois n°${NBSP}24`)).toBe(`Rôle transmis à Luern (Gaulois n°${NBSP}24). Vous êtes maintenant admin.`);
  });
});
