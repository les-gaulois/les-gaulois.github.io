import { describe, expect, it } from "vitest";
import { FINITIONS, type Toile } from "../../src/lib/fx/finitions-carte";
import { axeDeLaCouronne, cartesDuPodium, echelleDuGaulois, legendeDuPodium } from "../../src/lib/cartes-podium";
import { premiersDuPodium } from "../../src/lib/champion-semaine";
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
    expect(cartes?.map((c) => c.champion)).toEqual([true, true]);
  });

  it("prête la couronne du champion au seul premier, et jamais sans Gaulois", () => {
    expect(cartesDuPodium(podium, () => portrait(), () => null)?.map((c) => c.champion)).toEqual([true, false, false]);
    expect(cartesDuPodium(podium, (id) => (id === "b" ? portrait() : null), () => null)?.map((c) => c.champion)).toEqual([false, false, false]);
    expect([...premiersDuPodium(podium)]).toEqual(["a"]);
    expect([...premiersDuPodium([{ id: "a", place: 1 }, { id: "b", place: 1 }, { id: "c", place: 3 }])]).toEqual(["a", "b"]);
    expect(premiersDuPodium(null).size).toBe(0);
  });

  it("pose la couronne sur l'axe du corps, sinon au milieu de l'image", () => {
    expect(axeDeLaCouronne({ largeur: 40, axe: 17 })).toBe(17);
    expect(axeDeLaCouronne({ largeur: 40 })).toBe(20);
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

  it("donne à chaque place son animation, et chaque animation se dessine à toute heure sans erreur", () => {
    const cartes = cartesDuPodium(podium, () => portrait(), () => null);
    expect(cartes?.map((c) => c.finition)).toEqual(["champignon-atomique", "piratage", "feu-d-artifice"]);
    expect(cartes?.every((c) => c.animee)).toBe(true);
    let gestes = 0;
    const toile = new Proxy({}, { get: () => () => gestes++, set: () => true }) as unknown as Toile;
    for (const dessiner of Object.values(FINITIONS)) for (let t = 0; t < 20; t += 0.13) dessiner(toile, toile, t, 0.3, -0.2);
    expect(gestes).toBeGreaterThan(1000);
  });

  it("montre la finition que le joueur a choisie, et celle de sa place pour un nom inconnu ou sans choix", () => {
    const choix: Record<string, string> = { a: "arc-en-ciel", b: "inconnue" };
    const cartes = cartesDuPodium(podium, () => portrait(), () => null, (id) => choix[id] ?? null);
    expect(cartes?.map((c) => [c.finition, c.animee])).toEqual([
      ["arc-en-ciel", false],
      ["piratage", true],
      ["feu-d-artifice", true],
    ]);
  });
});
