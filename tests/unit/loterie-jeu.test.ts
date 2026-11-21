import { describe, expect, it } from "vitest";
import { OBJETS } from "../../src/lib/gaulois";
import { objetsDeLaPochette } from "../../src/lib/village/boutique";
import { CHANCES_DU_TIRAGE } from "../../src/lib/village/contrat";
import { tirageDEssai } from "../../src/lib/village/demo-booster";
import { billetsEnMots, boosterSuivant, jourDeLaRangee, jourDeParis, semaineDesBoosters } from "../../src/lib/village/loterie";

// « La loterie » de « Mon Gaulois » en écran de jeu (21 novembre 2026) : la rangée des sept jours de la semaine d'un tirage,
// un booster de loterie par jour joué avec le clan ; et le booster d'essai des visiteurs.

const ferme = (jour: string) => ({ jour, ouvert: false, billets: null, ticket_or: null });
const ouvert = (jour: string, billets: number, ticket_or = false) => ({ jour, ouvert: true, billets, ticket_or });

describe("la rangée des boosters de loterie de la semaine", () => {
  it("montre les sept jours du tirage, du mardi au lundi, chacun avec son booster ou sans", () => {
    // Tirage du mardi 24 novembre 2026 : la semaine du mardi 17 au lundi 23.
    const rangee = semaineDesBoosters("2026-11-24", [ouvert("2026-11-18", 12, true), ferme("2026-11-20")], "2026-11-21");
    expect(rangee.map((j) => j.jour)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
    expect(rangee.map((j) => j.etat)).toEqual(["sans-booster", "ouvert", "sans-booster", "ferme", "a-venir", "a-venir", "a-venir"]);
    expect(rangee[1]!.booster).toEqual(ouvert("2026-11-18", 12, true));
    expect(rangee[0]!.booster).toBeNull();
  });

  it("garde au bout un booster d'un autre jour, pour ne jamais le perdre", () => {
    const rangee = semaineDesBoosters("2026-11-24", [ferme("2026-11-25"), ferme("2026-11-17")], "2026-11-21");
    expect(rangee).toHaveLength(8);
    expect(rangee[0]!.etat).toBe("ferme");
    expect(rangee[7]).toEqual({ jour: "2026-11-25", etat: "ferme", booster: ferme("2026-11-25") });
  });

  it("trouve le booster fermé suivant, puis revient au début", () => {
    const rangee = semaineDesBoosters("2026-11-24", [ferme("2026-11-17"), ouvert("2026-11-18", 3), ferme("2026-11-20")], "2026-11-23");
    expect(boosterSuivant(rangee, "2026-11-17")).toBe("2026-11-20");
    expect(boosterSuivant(rangee, "2026-11-20")).toBe("2026-11-17");
    expect(boosterSuivant(rangee, null)).toBe("2026-11-17");
    expect(boosterSuivant(semaineDesBoosters("2026-11-24", [ferme("2026-11-19")], "2026-11-23"), "2026-11-19")).toBeNull();
  });

  it("écrit les jours et les billets en mots", () => {
    expect(jourDeLaRangee("2026-11-18")).toBe("mer. 18");
    expect(billetsEnMots(0)).toBe("0 billet");
    expect(billetsEnMots(1)).toBe("1 billet");
    expect(billetsEnMots(12)).toBe("12 billets");
    // Le jour de Paris, pas celui du temps universel : à 23 h 30 en temps universel, Paris est déjà le lendemain.
    expect(jourDeParis(new Date("2026-11-21T23:30:00Z"))).toBe("2026-11-22");
  });
});

describe("le booster d'essai des visiteurs", () => {
  it("tire une rareté selon les chances de départ, puis un objet payant de cette rareté", () => {
    const suite = (valeurs: number[]) => {
      let i = 0;
      return () => valeurs[i++ % valeurs.length]!;
    };
    // Le tout début des chances : le commun ; la toute fin : la dernière rareté qui a des objets (le divin).
    const commun = tirageDEssai(suite([0, 0]));
    expect(commun?.rarete).toBe("commun");
    const dernier = tirageDEssai(suite([0.9999999, 0.9999999]));
    expect(CHANCES_DU_TIRAGE[dernier!.rarete]).toBeGreaterThan(0);
    for (const t of [commun!, dernier!]) {
      const objet = OBJETS[t.emplacement][t.objet];
      expect(objet?.gratuit).toBe(false);
      expect(objetsDeLaPochette(t.rarete).some((r) => r.emplacement === t.emplacement && r.objet === t.objet)).toBe(true);
    }
  });

  it("ne tire jamais l'objet du pass ni un objet gratuit, sur beaucoup de tirages", () => {
    const vus = new Set<string>();
    for (let k = 0; k < 2000; k++) {
      const t = tirageDEssai();
      expect(t).not.toBeNull();
      expect(t!.rarete).not.toBe("saison");
      expect(OBJETS[t!.emplacement][t!.objet]?.gratuit).toBe(false);
      vus.add(t!.rarete);
    }
    expect(vus.has("commun")).toBe(true);
  });
});
