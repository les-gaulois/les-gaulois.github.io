import { describe, expect, it } from "vitest";
import { hasLeftList, rememberedMember } from "../../src/lib/moi";
import type { StoredMember } from "../../src/lib/schemas";

const member = (publicId: string | null, username: string | null): StoredMember => ({ role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId, username, team: { wins: 1, losses: 1 } });

describe("hasLeftList", () => {
  const list = [member("a", "Alpha"), member(null, null), member("b", null)];
  it("repère un membre parti, ou devenu anonyme", () => {
    expect(hasLeftList(list, "parti")).toBe(true);
    expect(hasLeftList(list, "b")).toBe(true);
  });
  it("ne dit rien d'un membre toujours là, ni sans choix", () => {
    expect(hasLeftList(list, "a")).toBe(false);
    expect(hasLeftList(list, null)).toBe(false);
  });
  it("ne prend pas un manque de données pour un départ", () => {
    expect(hasLeftList([], "a")).toBe(false);
    expect(hasLeftList([member(null, null), member(null, null)], "a")).toBe(false);
  });
});

describe("rememberedMember", () => {
  const list = [member("a", "Alpha"), member(null, null), member("b", null)];
  it("retrouve le membre retenu", () => {
    expect(rememberedMember(list, "a")?.username).toBe("Alpha");
  });
  it("ne retrouve rien sans choix, ni pour un membre parti du clan", () => {
    expect(rememberedMember(list, null)).toBeNull();
    expect(rememberedMember(list, "")).toBeNull();
    expect(rememberedMember(list, "parti")).toBeNull();
  });
  it("ne retrouve pas un membre devenu anonyme", () => {
    expect(rememberedMember(list, "b")).toBeNull();
  });
});
