import { describe, expect, it } from "vitest";
import { WELCOME_MAX, WELCOME_NEAR, WELCOME_TALL_CHARS, WELCOME_TALL_LINES, welcomeCount, welcomeIsTall, welcomeState, welcomeText } from "../../src/lib/compte/direction-accueil";

describe("l'aperçu d'un mot long", () => {
  it("ne défile que pour un mot long ou de beaucoup de lignes", () => {
    expect(welcomeIsTall("Bonjour.\nÀ ce soir.")).toBe(false);
    expect(welcomeIsTall("a".repeat(WELCOME_TALL_CHARS))).toBe(false);
    expect(welcomeIsTall("a".repeat(WELCOME_TALL_CHARS + 1))).toBe(true);
    expect(welcomeIsTall(Array.from({ length: WELCOME_TALL_LINES }, () => "a").join("\n"))).toBe(false);
    expect(welcomeIsTall(Array.from({ length: WELCOME_TALL_LINES + 1 }, () => "a").join("\n"))).toBe(true);
  });
});

describe("l'état du mot d'accueil", () => {
  it("dit « Pas lu » tant que le mot enregistré n'est pas connu", () => {
    expect(welcomeState(null, null)).toMatchObject({ kind: "unread", tone: "danger", label: "Pas lu" });
    expect(welcomeState(null, "un brouillon gardé")).toMatchObject({ kind: "unread" });
  });

  it("dit « En ligne » pour un mot enregistré et « Pas de mot » sans mot", () => {
    expect(welcomeState("Bonjour", "Bonjour")).toMatchObject({ kind: "online", tone: "ok", label: "En ligne" });
    expect(welcomeState("Bonjour", null)).toMatchObject({ kind: "online" });
    expect(welcomeState("", "")).toMatchObject({ kind: "none", tone: "muted", label: "Pas de mot" });
  });

  it("dit « Modifié, pas enregistré » dès que le champ diffère du mot enregistré", () => {
    expect(welcomeState("Bonjour", "Bonjour à tous")).toMatchObject({ kind: "changed", tone: "warn", label: "Modifié, pas enregistré" });
    expect(welcomeState("Bonjour", "")).toMatchObject({ kind: "changed" });
    expect(welcomeState("", "Bonjour")).toMatchObject({ kind: "changed" });
  });

  it("ignore les blancs autour, que le serveur retire", () => {
    expect(welcomeState("Bonjour", "  Bonjour\n")).toMatchObject({ kind: "online" });
    expect(welcomeState("", "  \n ")).toMatchObject({ kind: "none" });
    expect(welcomeText("  a b \n")).toBe("a b");
    expect(welcomeText(null)).toBe("");
  });
});

describe("le compteur du mot d'accueil", () => {
  it("compte ce qui est écrit et ce qui reste", () => {
    expect(welcomeCount("")).toEqual({ used: 0, left: WELCOME_MAX, near: false });
    expect(welcomeCount("abc")).toEqual({ used: 3, left: WELCOME_MAX - 3, near: false });
  });

  it("prévient près de la limite", () => {
    expect(welcomeCount("a".repeat(WELCOME_MAX - WELCOME_NEAR - 1)).near).toBe(false);
    expect(welcomeCount("a".repeat(WELCOME_MAX - WELCOME_NEAR)).near).toBe(true);
    expect(welcomeCount("a".repeat(WELCOME_MAX))).toEqual({ used: WELCOME_MAX, left: 0, near: true });
  });
});
