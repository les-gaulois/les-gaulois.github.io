import { describe, expect, it } from "vitest";
import { cartesDuPodium, echelleDuGaulois, legendeDuPodium } from "../../src/lib/cartes-podium";
import type { PortraitDeGaulois } from "../../src/lib/gaulois-site";

const portrait = (largeur = 40, hauteur = 60): PortraitDeGaulois => ({ image: "/gaulois/a.png?v=1", largeur, hauteur, buste: 30 });
const podium = [
  { id: "a", username: "Un", place: 1, wins: 30 },
  { id: "b", username: "Deux", place: 2, wins: 20 },
  { id: "c", username: "Trois", place: 3, wins: 10 },
];

describe("les cartes du podium de l'accueil", () => {
  it("garde l'ordre, les places et les victoires du podium, sans rien recalculer", () => {
    const cartes = cartesDuPodium(podium, () => portrait(), (id) => (id === "b" ? "/bannieres/x.png" : null));
    expect(cartes?.map((c) => [c.id, c.username, c.place, c.wins, c.metal])).toEqual([
      ["a", "Un", 1, 30, "or"],
      ["b", "Deux", 2, 20, "argent"],
      ["c", "Trois", 3, 10, "bronze"],
    ]);
    expect(cartes?.map((c) => c.banniere)).toEqual([null, "/bannieres/x.png", null]);
  });

  it("laisse le guerrier sans podium, sans aucun Gaulois, ou quand une égalité garde plus de trois joueurs", () => {
    expect(cartesDuPodium(null, () => portrait(), () => null)).toBeNull();
    expect(cartesDuPodium([], () => portrait(), () => null)).toBeNull();
    expect(cartesDuPodium(podium, () => null, () => null)).toBeNull();
    expect(cartesDuPodium([...podium, { id: "d", username: "Quatre", place: 3, wins: 10 }], () => portrait(), () => null)).toBeNull();
  });

  it("garde la carte d'un joueur sans Gaulois, sans personnage", () => {
    const cartes = cartesDuPodium(podium, (id) => (id === "a" ? portrait() : null), () => null);
    expect(cartes?.map((c) => c.portrait !== null)).toEqual([true, false, false]);
    expect(cartes?.[1]?.echelle).toBe(0);
  });

  it("donne l'or à deux premiers à égalité", () => {
    const cartes = cartesDuPodium([{ ...podium[0]! }, { ...podium[1]!, place: 1 }], () => portrait(), () => null);
    expect(cartes?.map((c) => c.metal)).toEqual(["or", "or"]);
  });

  it("fait tenir le Gaulois dans sa carte : 42 cases de large, 58 de haut, jamais plus de 0,78", () => {
    expect(echelleDuGaulois(portrait(40, 60))).toBe(0.78);
    expect(echelleDuGaulois(portrait(40, 100)) * 100).toBeCloseTo(58);
    expect(echelleDuGaulois(portrait(70, 60)) * 70).toBeCloseTo(42);
  });

  it("écrit toujours la période des chiffres : la semaine, ou les dates du relevé s'il est plus court", () => {
    expect(legendeDuPodium("de la semaine", "du 9 nov. au 15 nov. 2026")).toBe("Le plus de victoires de la semaine du 9 nov. au 15 nov. 2026");
    expect(legendeDuPodium("du 12 nov. au 15 nov.", "du 9 nov. au 15 nov. 2026")).toBe("Le plus de victoires du 12 nov. au 15 nov.");
    expect(legendeDuPodium(null, "du 9 nov. au 15 nov. 2026")).toBe("Le plus de victoires de la semaine du 9 nov. au 15 nov. 2026");
  });
});
