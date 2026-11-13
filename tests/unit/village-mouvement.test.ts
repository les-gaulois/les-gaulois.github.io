import { describe, expect, it } from "vitest";
import { composerLieu } from "../../src/lib/village/lieux";
import { PLEIN_JOUR } from "../../src/lib/village/lumiere";
import {
  BULLES_MAX,
  TEMPS_PAR_SECONDE,
  avancerLaPlace,
  avancerLesBulles,
  bullesAuDepart,
  chopeLevee,
  departDeLaPlace,
  gesteDeCombat,
  hasardDe,
  imageDeLaFlamme,
  pasDuPromeneur,
  souffleDuDormeur,
  tourneEnReunion,
} from "../../src/lib/village/mouvement";

describe("la marche sur la place", () => {
  const place = (largeur: number, nombre: number) => {
    const scene = composerLieu("place", largeur, nombre, PLEIN_JOUR);
    const hasard = hasardDe(42);
    return { scene, hasard, promeneurs: departDeLaPlace(nombre, scene.postes, scene.feu!.x, hasard) };
  };

  it("pose chacun à un poste différent, le premier au plus près du feu", () => {
    for (const [largeur, nombre] of [
      [164, 1],
      [392, 12],
      [164, 80],
      [640, 80],
    ] as const) {
      const { scene, promeneurs } = place(largeur, nombre);
      expect(promeneurs).toHaveLength(nombre);
      expect(new Set(promeneurs.map((p) => p.poste)).size).toBe(nombre);
      for (const p of promeneurs) expect([p.x, p.y]).toEqual([scene.postes[p.poste]!.x, scene.postes[p.poste]!.y]);
      const ecart = (rang: number) => scene.postes[rang]!.rang * 1000 + Math.abs(scene.postes[rang]!.x + 24 - scene.feu!.x);
      expect(ecart(promeneurs[0]!.poste)).toBe(Math.min(...promeneurs.map((p) => ecart(p.poste))));
    }
  });

  it("avance d'une case au plus par temps, sans sortir de la scène, sans deux Gaulois arrêtés au même poste", () => {
    for (const [largeur, nombre] of [
      [164, 1],
      [392, 12],
      [164, 80],
    ] as const) {
      const { scene, hasard, promeneurs } = place(largeur, nombre);
      const depart = promeneurs.map((p) => p.poste);
      const duree = nombre > 20 ? 1500 : 4000;
      let marches = 0;
      let saut = 0;
      let doubles = 0;
      for (let temps = 0; temps < duree; temps++) {
        const avant = promeneurs.map((p) => [p.x, p.y]);
        avancerLaPlace(promeneurs, scene.postes, hasard);
        promeneurs.forEach((p, i) => {
          saut = Math.max(saut, Math.abs(p.x - avant[i]![0]!), Math.abs(p.y - avant[i]![1]!));
          if (p.cible !== null) marches++;
        });
        const tenus = promeneurs.flatMap((p) => (p.cible === null ? [p.poste] : [p.poste, p.cible]));
        if (new Set(tenus).size !== tenus.length) doubles++;
      }
      expect(saut).toBe(1);
      expect(doubles).toBe(0);
      for (const p of promeneurs) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + 48).toBeLessThanOrEqual(largeur);
        expect(p.y + 64).toBeLessThanOrEqual(scene.decor.hauteur);
      }
      // Ils ont bougé, mais passent le plus clair du temps à l'arrêt : des mouvements espacés.
      expect(marches).toBeGreaterThan(100);
      if (nombre > 1) expect(promeneurs.some((p, i) => p.poste !== depart[i])).toBe(true);
      expect(marches / (duree * nombre)).toBeLessThan(0.4);
    }
  });

  it("rejoue la même promenade avec la même graine", () => {
    const a = place(392, 12);
    const b = place(392, 12);
    for (let temps = 0; temps < 600; temps++) {
      avancerLaPlace(a.promeneurs, a.scene.postes, a.hasard);
      avancerLaPlace(b.promeneurs, b.scene.postes, b.hasard);
    }
    expect(a.promeneurs).toEqual(b.promeneurs);
  });

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

  it("en réunion, au lit et au feu : des gestes lents, qui reviennent", () => {
    expect(tour(30).filter((t) => tourneEnReunion(t, 2) === -1)).toHaveLength(9 * TEMPS_PAR_SECONDE);
    expect(tour(4).filter((t) => souffleDuDormeur(t, 0) === 1)).toHaveLength(2 * TEMPS_PAR_SECONDE);
    const flammes = tour(2).map(imageDeLaFlamme);
    expect(new Set(flammes)).toEqual(new Set([0, 1, 2]));
    // La flamme tient chaque image une demi-seconde : rien ne clignote.
    for (let t = 0; t + 3 < flammes.length; t += 4) expect(new Set(flammes.slice(t, t + 4)).size).toBe(1);
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
