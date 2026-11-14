import { describe, expect, it } from "vitest";
import { BULLES_MAX, TEMPS_PAR_SECONDE, avancerLesBulles, bullesAuDepart, chopeLevee, gesteDeCombat, pasDuPromeneur, souffleDuDormeur, tourneEnReunion } from "../../src/lib/village/mouvement";

describe("la marche", () => {
  it("alterne les pieds en marche, et reste debout à l'arrêt", () => {
    expect(pasDuPromeneur({ cible: null, pas: 5 })).toBe("debout");
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((pas) => pasDuPromeneur({ cible: 3, pas }))).toEqual(["gauche", "gauche", "debout", "debout", "droite", "droite", "debout", "debout", "gauche"]);
  });
});

describe("la vie sur place", () => {
  const tour = (duree: number) => Array.from({ length: duree * TEMPS_PAR_SECONDE }, (_, t) => t);

  it("au combat : un coup lent de trois cases au plus, puis le coup d'en face, chacun à son tour", () => {
    const gestes = tour(7).map((t) => gesteDeCombat(t, 0, "gaulois"));
    expect(Math.max(...gestes.map((g) => g.x))).toBe(3);
    expect(Math.min(...gestes.map((g) => g.x))).toBeGreaterThanOrEqual(-2);
    expect(gestes.filter((g) => g.x === 0 && g.y === 0).length).toBeGreaterThan(gestes.length * 0.6);
    for (let t = 1; t < gestes.length; t++) expect(Math.abs(gestes[t]!.x - gestes[t - 1]!.x)).toBeLessThanOrEqual(1);
    const enFace = tour(7).map((t) => gesteDeCombat(t, 0, "adverse"));
    expect(Math.min(...enFace.map((g) => g.x))).toBe(-3);
    // Le guerrier d'en face recule quand le Gaulois frappe, et frappe quand le Gaulois a fini.
    expect(enFace[4]!.x).toBeGreaterThan(0);
    expect(gestes[TEMPS_PAR_SECONDE * 3.5 + 2]!.x).toBe(0);
    expect(tour(7).map((t) => gesteDeCombat(t, 1, "gaulois"))).not.toEqual(gestes);
    expect(gesteDeCombat(7 * TEMPS_PAR_SECONDE, 0, "gaulois")).toEqual(gestes[0]);
  });

  it("à la taverne : la chope se lève une seconde et demie toutes les quinze secondes", () => {
    const levees = tour(15).filter((t) => chopeLevee(t, 4));
    expect(levees).toHaveLength(12);
    expect(tour(15).filter((t) => chopeLevee(t, 5))).not.toEqual(levees);
  });

  it("en réunion et au lit : des gestes lents, qui reviennent", () => {
    expect(tour(30).filter((t) => tourneEnReunion(t, 2) === -1)).toHaveLength(9 * TEMPS_PAR_SECONDE);
    expect(tour(4).filter((t) => souffleDuDormeur(t, 0) === 1)).toHaveLength(2 * TEMPS_PAR_SECONDE);
  });
});

describe("les bulles", () => {
  it("n'en ouvre jamais plus de deux, laisse du temps entre deux, et fait parler chacun à son tour", () => {
    const bulles = bullesAuDepart();
    const parleurs = [3, 5, 8, 9];
    const paroles = new Map<number, number>();
    let avant: number[] = [];
    let ouvertures = 0;
    for (let temps = 0; temps < 120 * TEMPS_PAR_SECONDE; temps++) {
      const ouverts = avancerLesBulles(bulles, temps, parleurs);
      expect(ouverts.length).toBeLessThanOrEqual(BULLES_MAX);
      for (const qui of ouverts) {
        expect(parleurs).toContain(qui);
        if (!avant.includes(qui)) {
          ouvertures++;
          paroles.set(qui, (paroles.get(qui) ?? 0) + 1);
        }
      }
      avant = ouverts;
    }
    expect(avancerLesBulles(bullesAuDepart(), 0, parleurs)).toEqual([]);
    expect(ouvertures).toBeGreaterThan(10);
    expect(ouvertures).toBeLessThanOrEqual(120 / 5 + 1);
    expect([...paroles.keys()].sort()).toEqual([3, 5, 8, 9]);
  });

  it("laisse se taire vingt secondes celui qui est seul à parler, et ne dit rien sans réplique", () => {
    const bulles = bullesAuDepart();
    let parle = 0;
    for (let temps = 0; temps < 60 * TEMPS_PAR_SECONDE; temps++) if (avancerLesBulles(bulles, temps, [1]).length > 0) parle++;
    expect(parle).toBeLessThanOrEqual(3 * 7 * TEMPS_PAR_SECONDE);
    expect(parle).toBeGreaterThanOrEqual(2 * 7 * TEMPS_PAR_SECONDE);
    const muet = bullesAuDepart();
    for (let temps = 0; temps < 400; temps++) expect(avancerLesBulles(muet, temps, [])).toEqual([]);
  });

  it("ferme la bulle de qui a quitté le lieu", () => {
    const bulles = bullesAuDepart();
    let ouverts: number[] = [];
    for (let temps = 0; temps < 40 && ouverts.length === 0; temps++) ouverts = avancerLesBulles(bulles, temps, [0, 1]);
    expect(ouverts).toEqual([0]);
    expect(avancerLesBulles(bulles, 41, [1])).not.toContain(0);
  });
});
