import { describe, expect, it } from "vitest";
import { JOURS_PROCHES, jourEtHeure, joursAvant, proximite, viennentLabel } from "../../src/lib/compte/direction-evenements";

// Samedi 14 novembre 2026, 00 h 30 à Paris (UTC+1) : encore le 13 en temps universel.
const NOW = new Date("2026-11-13T23:30:00Z");
// Les espaces insécables des dates et des nombres français deviennent des espaces ordinaires, pour comparer les textes.
const INSECABLES = [String.fromCharCode(0xa0), String.fromCharCode(0x202f)];
const texte = (s: string) => INSECABLES.reduce((t, c) => t.split(c).join(" "), s);

describe("joursAvant", () => {
  it("compte les jours du calendrier de Paris, pas des tranches de 24 heures", () => {
    expect(joursAvant("2026-11-13T23:45:00Z", NOW)).toBe(0);
    expect(joursAvant("2026-11-14T22:59:00Z", NOW)).toBe(0);
    expect(joursAvant("2026-11-14T23:00:00Z", NOW)).toBe(1);
    expect(joursAvant("2026-11-24T18:00:00Z", NOW)).toBe(10);
    expect(joursAvant("2026-11-13T12:00:00Z", NOW)).toBe(-1);
  });
  it("reste juste à travers le changement d'heure", () => {
    // Dimanche 28 mars 2027 : passage à l'heure d'été.
    expect(joursAvant("2027-03-29T08:00:00Z", new Date("2027-03-27T10:00:00Z"))).toBe(2);
  });
});

describe("proximite", () => {
  it("dit « Aujourd'hui » en jaune, « Demain » en bleu, « Dans N jours » en gris", () => {
    expect(proximite("2026-11-14T20:00:00Z", NOW)).toEqual({ ton: "warn", mot: "Aujourd'hui" });
    expect(proximite("2026-11-15T20:00:00Z", NOW)).toEqual({ ton: "ally", mot: "Demain" });
    expect(proximite("2026-11-16T20:00:00Z", NOW)).toEqual({ ton: "muted", mot: "Dans 2 jours" });
    expect(proximite("2026-11-20T20:00:00Z", NOW)).toEqual({ ton: "muted", mot: `Dans ${JOURS_PROCHES} jours` });
  });
  it("ne dit rien au-delà de la semaine, ni pour un événement d'hier", () => {
    expect(proximite("2026-11-21T20:00:00Z", NOW)).toBeNull();
    expect(proximite("2026-11-13T12:00:00Z", NOW)).toBeNull();
  });
});

describe("jourEtHeure", () => {
  it("écrit le jour et l'heure de Paris, sans l'année quand c'est celle de la lecture", () => {
    const { jour, heure } = jourEtHeure("2026-11-21T20:00:00Z", NOW);
    expect(texte(jour)).toBe("sam. 21 nov.");
    expect(heure).toBe("21:00");
  });
  it("écrit l'année d'un événement de l'an prochain", () => {
    expect(texte(jourEtHeure("2027-01-02T20:00:00Z", NOW).jour)).toBe("sam. 2 janv. 2027");
  });
});

describe("viennentLabel", () => {
  it("accorde le verbe, et dit « Personne » pour zéro", () => {
    expect(viennentLabel(0)).toBe("Personne");
    expect(viennentLabel(1)).toBe("1 vient");
    expect(texte(viennentLabel(23))).toBe("23 viennent");
    expect(texte(viennentLabel(1200))).toBe("1 200 viennent");
  });
});
