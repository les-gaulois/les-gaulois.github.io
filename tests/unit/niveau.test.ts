import { describe, expect, it } from "vitest";
import { sortMembers, toStoredMember } from "../../src/lib/members";
import {
  accountLabel,
  accountRank,
  accountShort,
  LEGEND_COLOR,
  PRESTIGE_COLORS,
  prestigeColor,
  prestigeKey,
  prestigeLit,
  PRISM_COLORS,
  segmentColors,
} from "../../src/lib/niveau";
import { ApiMembersPage, StoredMember } from "../../src/lib/schemas";

const joinedAt = "2026-05-03T20:17:40.935Z";
const wl = { wins: 69, losses: 43 };

describe("niveau du compte : lecture de l'API", () => {
  it("lit le niveau, le prestige et la Légende, et toujours rien d'autre que stats.team", () => {
    const page = ApiMembersPage.parse({
      results: [{ role: "leader", joinedAt, publicId: "a", username: "Flooo", stats: { team: wl, total: wl, ffa: wl }, eloContributed: 3, level: 62, prestige: 1, legend: false }],
      total: 1,
      page: 1,
      limit: 50,
    });
    const m = page.results[0];
    expect(m?.level).toBe(62);
    expect(m?.prestige).toBe(1);
    expect(m?.legend).toBe(false);
    expect(Object.keys(m?.stats ?? {})).toEqual(["team"]);
    expect(m).not.toHaveProperty("eloContributed");
  });

  it("compte une valeur abîmée comme absente, sans faire échouer la liste", () => {
    const page = ApiMembersPage.safeParse({
      results: [{ role: "member", joinedAt, publicId: "a", username: "X", level: "62", prestige: -1, legend: "non" }],
      total: 1,
      page: 1,
      limit: 50,
    });
    expect(page.success).toBe(true);
    const m = page.data?.results[0];
    expect(m?.level).toBeUndefined();
    expect(m?.prestige).toBeUndefined();
    expect(m?.legend).toBeUndefined();
  });
});

describe("niveau du compte : fichier public", () => {
  it("garde le niveau d'un membre qui le montre", () => {
    const m = toStoredMember({ role: "leader", joinedAt, publicId: "a", username: "Flooo", stats: { team: wl }, level: 62, prestige: 1, legend: false });
    expect(m.account).toEqual({ level: 62, prestige: 1, legend: false });
    expect(m.team).toEqual(wl);
  });

  it("n'écrit rien quand le joueur cache son niveau, ni un niveau sans son prestige", () => {
    expect(toStoredMember({ role: "member", joinedAt, publicId: "a", username: "X" }).account).toBeNull();
    expect(toStoredMember({ role: "member", joinedAt, publicId: "a", username: "X", level: 12 }).account).toBeNull();
  });

  it("n'écrit toujours pas le publicId d'un anonyme, même avec son niveau", () => {
    const anon = toStoredMember({ role: "member", joinedAt, publicId: "SECRET", username: null, level: 5, prestige: 0, legend: false });
    expect(anon.account).toEqual({ level: 5, prestige: 0, legend: false });
    expect(JSON.stringify(anon)).not.toContain("SECRET");
  });

  it("accepte une liste relevée avant le niveau", () => {
    expect(StoredMember.safeParse({ role: "member", joinedAt, publicId: null, username: null, team: null }).success).toBe(true);
  });
});

describe("niveau du compte : affichage et tri", () => {
  it("écrit le niveau en mots, le prestige toujours, même à zéro", () => {
    expect(accountLabel({ level: 62, prestige: 1, legend: false })).toBe("Prestige 1 · Niveau 62");
    expect(accountLabel({ level: 94, prestige: 0, legend: false })).toBe("Sans prestige · Niveau 94");
    expect(accountLabel({ level: 100, prestige: 10, legend: true })).toBe("Légende");
    expect(accountShort({ level: 62, prestige: 1, legend: false })).toEqual({ level: "62", prestige: "prestige 1" });
    expect(accountShort({ level: 94, prestige: 0, legend: false })).toEqual({ level: "94", prestige: "sans prestige" });
    expect(accountShort({ level: 100, prestige: 10, legend: true })).toEqual({ level: "Légende", prestige: null });
  });

  it("allume un cran par prestige, tous pour une Légende, jamais plus de dix", () => {
    expect(prestigeLit({ level: 62, prestige: 0, legend: false })).toBe(0);
    expect(prestigeLit({ level: 62, prestige: 3, legend: false })).toBe(3);
    expect(prestigeLit({ level: 62, prestige: 14, legend: false })).toBe(10);
    expect(prestigeLit({ level: 100, prestige: 10, legend: true })).toBe(10);
  });

  it("donne à chaque prestige la couleur du jeu, l'or à la Légende et le prisme au prestige 10", () => {
    const at = (prestige: number, legend = false) => ({ level: 50, prestige, legend });
    expect(prestigeColor(at(0))).toBe("#64748b");
    expect(prestigeColor(at(1))).toBe("#6b7280");
    expect(prestigeColor(at(4))).toBe("#f2c230");
    expect(prestigeColor(at(10))).toBe("#f472b6");
    expect(prestigeColor(at(14))).toBe("#f472b6");
    expect(prestigeColor(at(10, true))).toBe(LEGEND_COLOR);
    expect(new Set(PRESTIGE_COLORS).size).toBe(PRESTIGE_COLORS.length);
    expect(segmentColors(at(0))).toEqual([]);
    expect(segmentColors(at(3))).toEqual(["#c3cbd6", "#c3cbd6", "#c3cbd6"]);
    const prism = segmentColors(at(10));
    expect(prism).toHaveLength(10);
    expect(prism[0]).toBe(PRISM_COLORS[0]);
    expect(prism[9]).toBe(PRISM_COLORS[5]);
    expect(new Set(prism).size).toBe(PRISM_COLORS.length);
    expect(segmentColors(at(10, true))).toEqual(Array(10).fill(LEGEND_COLOR));
  });

  it("explique chaque couleur, de « Sans prestige » à « Légende »", () => {
    const key = prestigeKey();
    expect(key.map((k) => k.label)).toEqual(["Sans prestige", ...Array.from({ length: 10 }, (_, i) => `Prestige ${i + 1}`), "Légende"]);
    expect(new Set(key.map((k) => prestigeColor(k.account))).size).toBe(key.length);
  });

  it("range le prestige avant le niveau, une Légende en tête, les niveaux cachés en fin de liste", () => {
    expect(accountRank({ level: 1, prestige: 2, legend: false })).toBeGreaterThan(accountRank({ level: 100, prestige: 1, legend: false }));
    expect(accountRank({ level: 100, prestige: 10, legend: true })).toBeGreaterThan(accountRank({ level: 100, prestige: 10, legend: false }));
    const at = (username: string, level?: number, prestige?: number) => toStoredMember({ role: "member", joinedAt, publicId: username, username, level, prestige });
    const list = [at("cache"), at("p0n96", 96, 0), at("p1n27", 27, 1), at("p3n4", 4, 3)];
    expect(sortMembers(list, "level", "desc").map((m) => m.username)).toEqual(["p3n4", "p1n27", "p0n96", "cache"]);
    expect(sortMembers(list, "level", "asc").map((m) => m.username)).toEqual(["p0n96", "p1n27", "p3n4", "cache"]);
  });
});
