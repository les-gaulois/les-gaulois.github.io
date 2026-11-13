import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, HOME_ANNOUNCEMENTS, announcementCount, announcementExcerpt, announcementLink, announcementState, announcementsCapped, fieldCount } from "../../src/lib/compte/direction-annonces";

describe("l'état d'une annonce de la Direction", () => {
  it("met en vert les 10 plus récentes, celles de l'accueil", () => {
    expect(announcementState(0, 5, null)).toEqual({ ton: "ok", label: "Sur l'accueil", editing: false });
    expect(announcementState(HOME_ANNOUNCEMENTS - 1, 5, null).ton).toBe("ok");
  });
  it("met en gris celles que l'accueil ne montre plus", () => {
    expect(announcementState(HOME_ANNOUNCEMENTS, 5, null)).toEqual({ ton: "muted", label: "Hors de l'accueil", editing: false });
  });
  it("met en jaune celle du formulaire, quel que soit son rang", () => {
    expect(announcementState(0, 5, 5)).toEqual({ ton: "warn", label: "En modification", editing: true });
    expect(announcementState(30, 5, 5).ton).toBe("warn");
    expect(announcementState(0, 5, 6).editing).toBe(false);
  });
});

describe("le compteur d'un champ", () => {
  it("s'écrit en mots", () => {
    expect(fieldCount("", ANNOUNCEMENT_TITLE_MAX)).toEqual({ text: "0 sur 120", near: false });
    expect(fieldCount("abc", ANNOUNCEMENT_BODY_MAX).text.replace(/\s/g, " ")).toBe("3 sur 2 000");
  });
  it("prévient à neuf dixièmes de la limite", () => {
    expect(fieldCount("a".repeat(107), 120).near).toBe(false);
    expect(fieldCount("a".repeat(108), 120).near).toBe(true);
    expect(fieldCount("a".repeat(120), 120).near).toBe(true);
  });
});

describe("le texte et le lien d'une annonce", () => {
  it("tient l'extrait sur une ligne", () => {
    expect(announcementExcerpt("  Rendez-vous à 21 h.\n\nSur le vocal.  ")).toBe("Rendez-vous à 21 h. Sur le vocal.");
  });
  it("donne le nom du site d'un lien en https", () => {
    expect(announcementLink("https://www.example.org/tournoi?x=1")).toEqual({ href: "https://www.example.org/tournoi?x=1", host: "example.org" });
  });
  it("refuse un lien absent ou qui n'est pas en https", () => {
    expect(announcementLink(null)).toBeNull();
    expect(announcementLink("http://example.org")).toBeNull();
    expect(announcementLink("javascript:alert(1)")).toBeNull();
  });
});

describe("le nombre d'annonces", () => {
  it("s'accorde", () => {
    expect(announcementCount(1)).toBe("1 annonce");
    expect(announcementCount(8)).toBe("8 annonces");
  });
  it("signale une liste peut-être coupée à 50", () => {
    expect(announcementsCapped(49)).toBe(false);
    expect(announcementsCapped(50)).toBe(true);
  });
});
