import { describe, expect, it } from "vitest";
import { OBJETS, RARETES_DES_OBJETS, aUnPrix } from "../../src/lib/gaulois";
import { faireLePointDesRayons, jusquAuChangement, noterLeRayonOuvert, objetsADemander, resteAvantLeChangement } from "../../src/lib/village/boutique-jeu";

// Mardi 24 novembre 2026, 21 h 30 à Paris (UTC+1) : le prochain changement de la sélection.
const CHANGE = "2026-11-24T20:30:00Z";

describe("le compte à rebours de la sélection de la semaine", () => {
  it("compte les jours et les heures, arrondis au-dessous", () => {
    expect(resteAvantLeChangement(CHANGE, new Date("2026-11-21T12:00:00Z"))).toEqual({ court: "Encore 3 j 8 h", dit: "Encore 3 jours et 8 heures" });
    expect(resteAvantLeChangement(CHANGE, new Date("2026-11-23T20:00:00Z"))).toEqual({ court: "Encore 1 j 0 h", dit: "Encore 1 jour" });
  });
  it("passe aux heures et aux minutes le dernier jour, puis aux minutes", () => {
    expect(resteAvantLeChangement(CHANGE, new Date("2026-11-24T15:10:00Z"))).toEqual({ court: "Encore 5 h 20 min", dit: "Encore 5 heures et 20 minutes" });
    expect(resteAvantLeChangement(CHANGE, new Date("2026-11-24T19:30:00Z"))).toEqual({ court: "Encore 1 h 0 min", dit: "Encore 1 heure" });
    expect(resteAvantLeChangement(CHANGE, new Date("2026-11-24T20:18:30Z"))).toEqual({ court: "Encore 11 min", dit: "Encore 11 minutes" });
  });
  it("dit « Change maintenant » sous la minute, passé l'heure ou sur une date illisible", () => {
    expect(resteAvantLeChangement(CHANGE, new Date("2026-11-24T20:29:30Z")).court).toBe("Change maintenant");
    expect(resteAvantLeChangement(CHANGE, new Date("2026-11-25T08:00:00Z")).court).toBe("Change maintenant");
    expect(resteAvantLeChangement("pas une date", new Date()).court).toBe("Change maintenant");
  });
});

describe("l'heure du changement", () => {
  it("se dit à l'heure de Paris", () => {
    expect(jusquAuChangement(CHANGE)).toBe("Jusqu'à mardi 21 h 30");
    // En été, Paris est à UTC+2.
    expect(jusquAuChangement("2026-06-02T19:30:00Z")).toBe("Jusqu'à mardi 21 h 30");
  });
  it("ne dit rien d'une date illisible", () => {
    expect(jusquAuChangement("demain")).toBe("");
  });
});

describe("la pastille « Nouveau » des rayons", () => {
  const RAYONS = ["tete", "haut", "bas", "pieds", "arme"];

  it("ne marque rien à la première visite sur l'appareil, et tient tout pour vu", () => {
    const point = faireLePointDesRayons(null, CHANGE, RAYONS);
    expect(point.nouveaux.size).toBe(0);
    expect(JSON.parse(point.aGarder)).toEqual({ semaine: CHANGE, rayons: RAYONS });
  });

  it("marque tous les rayons quand la sélection a changé depuis la dernière visite", () => {
    const avant = JSON.stringify({ semaine: "2026-11-17T20:30:00Z", rayons: RAYONS });
    const point = faireLePointDesRayons(avant, CHANGE, RAYONS);
    expect([...point.nouveaux]).toEqual(RAYONS);
    expect(JSON.parse(point.aGarder)).toEqual({ semaine: CHANGE, rayons: [] });
  });

  it("garde les rayons déjà ouverts dans la même semaine", () => {
    const garde = JSON.stringify({ semaine: CHANGE, rayons: ["haut", "arme", "cartes"] });
    const point = faireLePointDesRayons(garde, CHANGE, RAYONS);
    expect([...point.nouveaux]).toEqual(["tete", "bas", "pieds"]);
    expect(JSON.parse(point.aGarder)).toEqual({ semaine: CHANGE, rayons: ["haut", "arme"] });
  });

  it("tient un stockage illisible pour une première visite", () => {
    for (const brut of ["{", "[]", JSON.stringify({ semaine: 3, rayons: [] }), JSON.stringify({ semaine: CHANGE, rayons: [1] })]) {
      expect(faireLePointDesRayons(brut, CHANGE, RAYONS).nouveaux.size).toBe(0);
    }
  });

  it("note un rayon ouvert une seule fois, et repart de zéro une nouvelle semaine", () => {
    const une = noterLeRayonOuvert(JSON.stringify({ semaine: CHANGE, rayons: ["tete"] }), CHANGE, "bas");
    expect(JSON.parse(une)).toEqual({ semaine: CHANGE, rayons: ["tete", "bas"] });
    expect(JSON.parse(noterLeRayonOuvert(une, CHANGE, "bas"))).toEqual({ semaine: CHANGE, rayons: ["tete", "bas"] });
    expect(JSON.parse(noterLeRayonOuvert(une, "2026-12-01T20:30:00Z", "arme"))).toEqual({ semaine: "2026-12-01T20:30:00Z", rayons: ["arme"] });
    expect(JSON.parse(noterLeRayonOuvert(null, CHANGE, "tete"))).toEqual({ semaine: CHANGE, rayons: ["tete"] });
  });
});

describe("les objets qu'on peut demander au marché", () => {
  const payants = (emplacement: "tete" | "haut"): string[] =>
    Object.entries(OBJETS[emplacement])
      .filter(([, o]) => !o.gratuit && o.rarete && aUnPrix(o.rarete))
      .map(([id]) => id);

  it("ne garde que des objets du marché, du plus rare au plus courant", () => {
    const liste = objetsADemander("tete", [], [], []);
    expect(liste.length).toBe(payants("tete").length);
    expect(liste.every((o) => !OBJETS.tete[o.objet]!.gratuit && aUnPrix(OBJETS.tete[o.objet]!.rarete!))).toBe(true);
    const rangs = liste.map((o) => RARETES_DES_OBJETS[o.rarete].rang);
    expect(rangs).toEqual([...rangs].sort((a, b) => b - a));
  });

  it("écarte ce qu'on a, ce qu'on vend et ce qu'on demande déjà", () => {
    const [a, b, c] = payants("tete");
    const ref = (objet: string) => ({ emplacement: "tete" as const, objet });
    const liste = objetsADemander("tete", [ref(a!)], [ref(b!)], [ref(c!)]).map((o) => o.objet);
    expect(liste).not.toContain(a);
    expect(liste).not.toContain(b);
    expect(liste).not.toContain(c);
    expect(liste.length).toBe(payants("tete").length - 3);
  });
});
