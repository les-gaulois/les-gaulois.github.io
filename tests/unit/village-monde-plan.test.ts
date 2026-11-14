import { describe, expect, it } from "vitest";
import { taillesDesDessins } from "../../src/lib/village/monde/composition";
import { CYCLE, lutinsDesEvenements } from "../../src/lib/village/monde/evenements";
import { CIEL, HABITANTS_MAX, LIGNE, LITS_PAR_MAISON, dyDeLaTerrasse, emplacementsDe, maisonsPour, planDuMonde } from "../../src/lib/village/monde/plan";
import { placesDuLieu, zoneDuPromeneur } from "../../src/lib/village/monde/postes";
import { DESSINS_OPENFRONT } from "../../src/lib/village/openfront";

const tailles = taillesDesDessins();
const rangs = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe("le plan du monde du village, de 0 à 1 000 Gaulois", () => {
  it("bâtit une maison de 4 lits par tranche de 4 Gaulois, trois au moins", () => {
    expect(maisonsPour(0)).toBe(3);
    expect(maisonsPour(12)).toBe(3);
    expect(maisonsPour(13)).toBe(4);
    expect(maisonsPour(100)).toBe(25);
    expect(maisonsPour(1000)).toBe(250);
    expect(maisonsPour(5000)).toBe(250);
    for (const n of [0, 15, 100, 1000]) expect(emplacementsDe(planDuMonde(tailles, n), "maison")).toHaveLength(maisonsPour(n));
  });

  it("donne le même monde pour le même nombre, et ne le fait bouger que quand le nombre change de tranche", () => {
    expect(planDuMonde(tailles, 100)).toEqual(planDuMonde(tailles, 100));
    const a = planDuMonde(tailles, 13);
    const b = planDuMonde(tailles, 16);
    expect(emplacementsDe(a, "maison").map((e) => [e.x, e.dy])).toEqual(emplacementsDe(b, "maison").map((e) => [e.x, e.dy]));
  });

  it("étage les maisons en terrasses sans qu'elles se chevauchent, la plus haute ligne toujours sous le ciel", () => {
    for (const n of [0, 15, 100, 400, 1000]) {
      const plan = planDuMonde(tailles, n);
      expect(dyDeLaTerrasse(plan, plan.terrasses) + LIGNE).toBe(CIEL);
      const maisons = emplacementsDe(plan, "maison");
      const parEtage = new Map<number, typeof maisons>();
      for (const m of maisons) parEtage.set(m.dy, [...(parEtage.get(m.dy) ?? []), m]);
      for (const etage of parEtage.values()) {
        const tri = [...etage].sort((p, q) => p.x - q.x);
        for (let k = 1; k < tri.length; k++) expect(tri[k]!.x).toBeGreaterThanOrEqual(tri[k - 1]!.x + tri[k - 1]!.largeur);
      }
      // Aucune maison de terrasse sur le passage d'un escalier.
      for (const m of maisons) {
        if (m.dy === plan.dy0) continue;
        for (const escalier of plan.escaliers) expect(escalier.x < m.x - 14 || escalier.x > m.x + m.largeur + 14 || escalier.de === 0).toBe(true);
      }
      expect(plan.hauteur).toBeGreaterThan(plan.dyBas);
      expect(plan.largeur).toBeGreaterThan(plan.mer.de);
    }
  });

  it("donne à chacun des 1 000 Gaulois son lit, dans la maison de son rang", () => {
    const plan = planDuMonde(tailles, HABITANTS_MAX);
    const lits = placesDuLieu(plan, "maisons", rangs(HABITANTS_MAX));
    expect(new Set(lits.map((p) => `${p.x},${p.y}`)).size).toBe(HABITANTS_MAX);
    const maisons = emplacementsDe(plan, "maison");
    lits.forEach((lit, rang) => {
      const maison = maisons[Math.floor(rang / LITS_PAR_MAISON)]!;
      expect(lit.x).toBeGreaterThanOrEqual(maison.x);
      expect(lit.x).toBeLessThan(maison.x + maison.largeur);
    });
  });

  it("assoit à l'aise un quart des Gaulois à la taverne et un cinquième à la réunion, et range les combattants sur le pré", () => {
    for (const n of [15, 100, 1000]) {
      const plan = planDuMonde(tailles, n);
      for (const [lieu, part] of [
        ["taverne", 4],
        ["reunion", 5],
      ] as const) {
        const nombre = Math.ceil(n / part);
        const places = placesDuLieu(plan, lieu, rangs(nombre));
        expect(places).toHaveLength(nombre);
        expect(new Set(places.map((p) => `${p.x},${p.y}`)).size).toBe(nombre);
      }
      const combat = placesDuLieu(plan, "bataille", rangs(Math.ceil(n / 5)));
      for (const p of combat) {
        expect(p.x).toBeGreaterThanOrEqual(plan.pre.x - 60);
        expect(p.x).toBeLessThan(plan.pre.front);
      }
    }
  });

  it("promène chacun dans le monde : sa zone tient dans le monde, sa place de départ dans sa zone", () => {
    const plan = planDuMonde(tailles, 1000);
    const places = placesDuLieu(plan, "place", rangs(1000));
    places.forEach((place, rang) => {
      const zone = zoneDuPromeneur(plan, rang);
      expect(zone.de).toBeLessThan(zone.a);
      expect(zone.haut).toBeLessThanOrEqual(zone.bas);
      expect(zone.bas).toBeLessThan(plan.hauteur);
      expect(place.x).toBeGreaterThanOrEqual(zone.de);
      expect(place.x).toBeLessThanOrEqual(zone.a);
      expect(place.y).toBeGreaterThanOrEqual(zone.haut);
      expect(place.y).toBeLessThanOrEqual(zone.bas);
    });
  });
});

describe("les événements du monde d'OpenFront", () => {
  const plan = planDuMonde(tailles, 15);
  const taille = (id: keyof typeof DESSINS_OPENFRONT) => DESSINS_OPENFRONT[id];

  it("rejouent la même scène à la même heure du cycle", () => {
    expect(lutinsDesEvenements(plan, taille, 1234)).toEqual(lutinsDesEvenements(plan, taille, 1234 + CYCLE));
  });

  it("restent calmes : la plupart du temps rien d'autre que le train, jamais plus d'un combat à la fois", () => {
    let vides = 0;
    for (let t = 0; t < CYCLE; t += 8) {
      const lutins = lutinsDesEvenements(plan, taille, t).filter((l) => !l.cle.startsWith("train"));
      if (lutins.length === 0) vides++;
      const sortes = new Set(lutins.map((l) => (l.cle.startsWith("notre") || l.cle.startsWith("leur") ? "duel" : l.cle.startsWith("silo") || l.cle === "missile" || l.cle === "explosion" ? "missile" : "interception")));
      expect(sortes.size).toBeLessThanOrEqual(1);
    }
    // Plus des trois quarts du temps, ni tir ni missile.
    expect(vides / (CYCLE / 8)).toBeGreaterThan(0.75);
  });

  it("gardent chaque dessin dans le monde ou juste à son bord, et le train sur sa voie", () => {
    for (let t = 0; t < CYCLE; t += 4) {
      for (const lutin of lutinsDesEvenements(plan, taille, t)) {
        expect(lutin.x).toBeGreaterThan(-700);
        expect(lutin.x).toBeLessThan(plan.largeur + 100);
        expect(lutin.y).toBeGreaterThan(-200);
        expect(lutin.y).toBeLessThan(plan.hauteur);
        // Le train ne se voit jamais au-delà du dépôt du port, au bout de la voie.
        if (lutin.cle.startsWith("train")) expect(lutin.coupeADroite).toBeLessThanOrEqual(plan.voie.a);
      }
    }
  });
});
