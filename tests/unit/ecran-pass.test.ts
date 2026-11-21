import { describe, expect, it } from "vitest";
import { datesDeLaSaison, estUnJalon, etatDeLaDalle, etatsDuCalendrier, joursEnMots, motDuJour, partDeLaBarre, rareteDuPalier, seuilEnMots } from "../../src/lib/village/ecran-pass";
import { SAISON_1 } from "../../src/lib/village/contrat";

// Ce que l'écran du pass habillé (Sentier.tsx, 21 novembre 2026) déduit pour ses dessins en cases.

describe("le calendrier de présence", () => {
  it("coche les jours de visite, et garde le cadeau au dernier jour", () => {
    expect(etatsDuCalendrier(0, 7)).toEqual(["vide", "vide", "vide", "vide", "vide", "vide", "cadeau"]);
    expect(etatsDuCalendrier(4, 7)).toEqual(["fait", "fait", "fait", "fait", "vide", "vide", "cadeau"]);
    expect(etatsDuCalendrier(7, 7)).toEqual(["fait", "fait", "fait", "fait", "fait", "fait", "cadeau-fait"]);
  });

  it("ne coche jamais plus de cases qu'il n'y en a, ni moins de zéro", () => {
    expect(etatsDuCalendrier(12, 7).filter((e) => e !== "vide")).toHaveLength(7);
    expect(etatsDuCalendrier(-3, 7)).toEqual(etatsDuCalendrier(0, 7));
    expect(etatsDuCalendrier(2, 0)).toEqual([]);
  });

  it("dit chaque case aux lecteurs d'écran", () => {
    expect(motDuJour(3, "fait", "30 XP")).toBe("Jour 3 : visite faite");
    expect(motDuJour(5, "vide", "30 XP")).toBe("Jour 5 : à venir");
    expect(motDuJour(7, "cadeau", "30 XP")).toBe("Jour 7 : le cadeau de 30 XP");
    expect(motDuJour(7, "cadeau-fait", "30 XP")).toBe("Jour 7 : visite faite, cadeau de 30 XP gagné");
  });
});

describe("la route des paliers", () => {
  it("dore la dalle d'un palier pris, appelle celle d'un palier à prendre, grise les autres", () => {
    expect(etatDeLaDalle("pris")).toBe("dore");
    expect(etatDeLaDalle("a-prendre")).toBe("a-prendre");
    expect(etatDeLaDalle("ferme")).toBe("gris");
  });

  it("marque un jalon tous les dix paliers", () => {
    expect([1, 9, 10, 11, 20, 30].map((p) => estUnJalon(p, 10))).toEqual([false, false, true, false, true, true]);
    expect(estUnJalon(10, 0)).toBe(false);
  });

  it("montre la rareté « saison » au palier de l'objet de la saison, la sienne ailleurs", () => {
    expect(rareteDuPalier("legendaire", true)).toBe("saison");
    expect(rareteDuPalier("epique", false)).toBe("epique");
  });

  it("écrit le seuil d'un palier en XP, jamais en « pas »", () => {
    expect(seuilEnMots(150)).toBe("150 XP");
  });
});

describe("les barres et les mots de la saison", () => {
  it("borne la part d'une barre entre 0 et 1", () => {
    expect(partDeLaBarre(12, 30)).toBeCloseTo(0.4);
    expect(partDeLaBarre(45, 30)).toBe(1);
    expect(partDeLaBarre(-2, 30)).toBe(0);
    expect(partDeLaBarre(3, 0)).toBe(0);
    expect(partDeLaBarre(Number.NaN, 30)).toBe(0);
  });

  it("dit les deux bouts de la saison 1, telle que le serveur la donne", () => {
    expect(datesDeLaSaison(SAISON_1)).toBe("du 17 novembre au 28 décembre");
  });

  it("compte les jours qui restent", () => {
    expect(joursEnMots(37)).toBe("encore 37 jours");
    expect(joursEnMots(1)).toBe("dernier jour");
  });
});
