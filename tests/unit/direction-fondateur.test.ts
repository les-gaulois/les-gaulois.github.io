import { describe, expect, it } from "vitest";
import { currentFounder, heirCounts, heirs, HEIR_FILTERS, inHeirFilter, ROLE_AFTER_TRANSFER, typedState } from "../../src/lib/compte/direction-fondateur";
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

  it("chaque filtre ne laisse passer que son rôle", () => {
    const list = heirs(rows);
    for (const f of HEIR_FILTERS) {
      expect(list.filter((m) => inHeirFilter(m, f.id))).toHaveLength(heirCounts(list)[f.id]);
    }
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
    expect(typedState("Gaulois n°12", "Gaulois n° 12")).toBe("other");
  });

  it("dit vide, début ou autre nom", () => {
    expect(typedState("", "Épona")).toBe("empty");
    expect(typedState("   ", "Épona")).toBe("empty");
    expect(typedState("Épo", "Épona")).toBe("start");
    expect(typedState("Éponax", "Épona")).toBe("other");
  });
});

it("celui qui transmet devient admin, comme dans transfer_founder", () => {
  expect(ROLE_AFTER_TRANSFER).toBe("admin");
});
