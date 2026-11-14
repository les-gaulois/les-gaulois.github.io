import { describe, expect, it } from "vitest";
import { hasardDe } from "../../src/lib/village/mouvement";
import { type Acteur, type Entree, type PlaceDuMonde, type Seuil, VITESSE_DU_CHEMIN, relireLesActeurs, toutArrive, unTemps } from "../../src/lib/village/monde/acteurs";
import { ROUTE_VUE, type Zone, avancer, changerLArrivee, enRoute, etapesVers, marcheurA, partir, poseDuMarcheur, promener } from "../../src/lib/village/monde/marche";
import type { Lieu } from "../../src/lib/village/vie";

/** Des portes quelconques : chaque lieu a la sienne, sur le chemin, à une colonne qui ne dépend que du lieu. */
const PORTES: Record<Lieu, number> = { maisons: 900, place: 2000, taverne: 2600, reunion: 3300, bataille: 5200 };
const seuil: Seuil = (lieu) => ({ x: PORTES[lieu], y: 270 });
const place = (x: number, y = 240): PlaceDuMonde => ({ x, y, serre: false });
const ZONE: Zone = { de: 700, a: 4800, haut: 262, bas: 308 };

/** Fait marcher un acteur jusqu'au bout ; rend le nombre de temps qu'il a fallu (au plus `max`). */
function marcherJusquAuBout(acteur: Acteur<string>, max = 20_000): number {
  const hasard = hasardDe(1);
  for (let t = 1; t <= max; t++) {
    unTemps(acteur, ZONE, 2000, hasard);
    if (acteur.etat !== "chemin") return t;
  }
  return Number.POSITIVE_INFINITY;
}

describe("la marche d'un point à un autre", () => {
  it("arrive toujours, sans jamais dépasser son but, d'une case entière à l'autre", { timeout: 30_000 }, () => {
    const hasard = hasardDe(7);
    for (let essai = 0; essai < 200; essai++) {
      const m = marcheurA(hasard() * 3000, 200 + hasard() * 120, hasard);
      const but = { x: hasard() * 3000, y: 200 + hasard() * 120 };
      partir(m, [but]);
      const cible = { x: Math.round(but.x), y: Math.round(but.y) };
      const dx = Math.abs(cible.x - m.x);
      const dy = Math.abs(cible.y - m.y);
      const [xMin, xMax] = [Math.min(m.x, cible.x), Math.max(m.x, cible.x)];
      const vitesse = 1 + (essai % 2);
      let temps = 0;
      let horsDuChemin = 0;
      while (enRoute(m) && temps <= dx + 2 * dy + 2) {
        avancer(m, vitesse);
        temps++;
        if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || m.x < xMin || m.x > xMax) horsDuChemin++;
      }
      expect(horsDuChemin).toBe(0);
      expect(temps).toBeLessThanOrEqual(dx + 2 * dy + 1);
      expect([m.x, m.y]).toEqual([cible.x, cible.y]);
      expect(m.but).toBeNull();
    }
  });

  it("suit ses étapes dans l'ordre, et fait les sauts d'un coup", () => {
    const m = marcheurA(0, 300, hasardDe(2));
    partir(m, [{ x: 10, y: 300 }, { x: 500, y: 250, saut: true }, { x: 520, y: 250 }]);
    const vus: number[] = [];
    while (!avancer(m, 2)) vus.push(m.x);
    expect([m.x, m.y]).toEqual([520, 250]);
    // Il marche jusqu'à la première étape, s'y trouve d'un coup à la deuxième, puis marche jusqu'à la dernière.
    expect(vus.slice(0, 4)).toEqual([2, 4, 6, 8]);
    expect(vus[4]).toBe(500);
    expect(vus.some((x) => x > 10 && x < 500)).toBe(false);
  });

  it("garde sa route quand la place qui l'attend bouge, et va à la nouvelle", () => {
    const m = marcheurA(0, 300, hasardDe(3));
    partir(m, [{ x: 100, y: 300 }, { x: 200, y: 280 }]);
    avancer(m, 2);
    changerLArrivee(m, { x: 260, y: 290 });
    while (!avancer(m, 2));
    expect([m.x, m.y]).toEqual([260, 290]);
  });

  it("coupe une longue route d'un saut au milieu : on le voit partir et arriver, jamais plus d'une minute en chemin", () => {
    const courte = etapesVers({ x: 100, y: 240 }, { x: 120, y: 270 }, { x: 700, y: 270 }, { x: 720, y: 240 });
    expect(courte.some((e) => e.saut)).toBe(false);
    expect(courte.at(-1)).toEqual({ x: 720, y: 240 });
    const longue = etapesVers({ x: 100, y: 240 }, { x: 120, y: 270 }, { x: 9000, y: 270 }, { x: 9020, y: 240 });
    expect(longue.filter((e) => e.saut)).toHaveLength(1);
    expect(longue[1]).toEqual({ x: 120 + ROUTE_VUE, y: 270 });
    expect(longue[2]).toEqual({ x: 9000 - ROUTE_VUE, y: 270, saut: true });
    // Vers la gauche aussi.
    const retour = etapesVers({ x: 9020, y: 240 }, null, { x: 120, y: 270 }, { x: 100, y: 240 });
    expect(retour[0]).toEqual({ x: 9020 - ROUTE_VUE, y: 240 });
    expect(retour[1]).toEqual({ x: 120 + ROUTE_VUE, y: 270, saut: true });
  });

  it("alterne les pieds en marche, et reste debout à l'arrêt", () => {
    expect(poseDuMarcheur({ but: null, pas: 3 })).toBe("debout");
    expect([0, 2, 4, 6].map((pas) => poseDuMarcheur({ but: { x: 1, y: 1 }, pas }))).toEqual(["gauche", "debout", "droite", "debout"]);
  });

  it("promène sans sortir de sa zone, et s'arrête un bon moment entre deux pas", () => {
    const hasard = hasardDe(11);
    const m = marcheurA(2400, 280, hasard);
    let arrets = 0;
    for (let t = 0; t < 8 * 60 * 10; t++) {
      const avant = m.but;
      promener(m, ZONE, 2000, hasard);
      if (avant && !m.but) arrets++;
      expect(m.x).toBeGreaterThanOrEqual(ZONE.de);
      expect(m.x).toBeLessThanOrEqual(ZONE.a);
      expect(m.y).toBeGreaterThanOrEqual(Math.min(ZONE.haut, 280));
      expect(m.y).toBeLessThanOrEqual(Math.max(ZONE.bas, 280));
    }
    // Dix minutes : des arrêts de 8 à 30 secondes, donc au plus une soixantaine de promenades.
    expect(arrets).toBeGreaterThan(5);
    expect(arrets).toBeLessThan(80);
  });
});

describe("les relectures du village", () => {
  const entree = (cle: string, lieu: Lieu, p: PlaceDuMonde): Entree<string> => ({ cle, habitant: cle, lieu, place: p });

  it("fait paraître à sa place celui qui arrive, et oublie celui qui part", () => {
    const acteurs = new Map<string, Acteur<string>>();
    relireLesActeurs(acteurs, [entree("a", "taverne", place(2500)), entree("b", "place", place(1900, 270))], seuil, false, hasardDe(1));
    expect(acteurs.get("a")).toMatchObject({ etat: "poste", lieu: "taverne", marche: { x: 2500, y: 240 } });
    expect(acteurs.get("b")).toMatchObject({ etat: "promene", lieu: "place", marche: { x: 1900, y: 270 } });
    relireLesActeurs(acteurs, [entree("b", "place", place(1900, 270))], seuil, false, hasardDe(1));
    expect([...acteurs.keys()]).toEqual(["b"]);
  });

  it("fait sortir par la porte celui dont le lieu change, puis marcher jusqu'à sa nouvelle place", () => {
    const acteurs = new Map<string, Acteur<string>>();
    relireLesActeurs(acteurs, [entree("a", "taverne", place(2500))], seuil, false, hasardDe(1));
    relireLesActeurs(acteurs, [entree("a", "reunion", place(3400))], seuil, false, hasardDe(1));
    const a = acteurs.get("a")!;
    expect(a.etat).toBe("chemin");
    // Il part de sa table, pas d'ailleurs : rien n'a bougé à la relecture.
    expect([a.marche.x, a.marche.y]).toEqual([2500, 240]);
    const passages = new Set<number>();
    const hasard = hasardDe(2);
    let temps = 0;
    while (a.etat === "chemin" && temps < 10_000) {
      unTemps(a, ZONE, 2000, hasard);
      passages.add(a.marche.x);
      temps++;
    }
    expect(a.etat).toBe("poste");
    expect([a.marche.x, a.marche.y]).toEqual([3400, 240]);
    expect(passages.has(PORTES.taverne)).toBe(true);
    expect(passages.has(PORTES.reunion)).toBe(true);
    // Au pas : deux cases par temps au plus, huit temps par seconde.
    expect(temps).toBeGreaterThanOrEqual(Math.floor((3400 - 2500) / VITESSE_DU_CHEMIN));
  });

  it("repart de là où il est quand une relecture arrive pendant sa marche, et va au dernier lieu dit", () => {
    const acteurs = new Map<string, Acteur<string>>();
    relireLesActeurs(acteurs, [entree("a", "taverne", place(2500))], seuil, false, hasardDe(1));
    relireLesActeurs(acteurs, [entree("a", "bataille", place(5300))], seuil, false, hasardDe(1));
    const a = acteurs.get("a")!;
    const hasard = hasardDe(3);
    for (let t = 0; t < 200; t++) unTemps(a, ZONE, 2000, hasard);
    const ici = { x: a.marche.x, y: a.marche.y };
    expect(a.etat).toBe("chemin");
    relireLesActeurs(acteurs, [entree("a", "maisons", place(850, 230))], seuil, false, hasardDe(1));
    expect({ x: a.marche.x, y: a.marche.y }).toEqual(ici);
    expect(marcherJusquAuBout(a)).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(a).toMatchObject({ etat: "poste", lieu: "maisons", marche: { x: 850, y: 230 } });
  });

  it("entre dans son lit et en sort d'un coup, par la porte de la maison", () => {
    const acteurs = new Map<string, Acteur<string>>();
    relireLesActeurs(acteurs, [entree("a", "maisons", place(850, 230))], seuil, false, hasardDe(1));
    relireLesActeurs(acteurs, [entree("a", "place", place(1950, 280))], seuil, false, hasardDe(1));
    const a = acteurs.get("a")!;
    // Le saut hors du lit se fait tout de suite : il est sur le pas de la porte.
    expect([a.marche.x, a.marche.y]).toEqual([PORTES.maisons, 270]);
    expect(marcherJusquAuBout(a)).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(a).toMatchObject({ etat: "promene", marche: { x: 1950, y: 280 } });
    relireLesActeurs(acteurs, [entree("a", "maisons", place(850, 230))], seuil, false, hasardDe(1));
    expect(marcherJusquAuBout(a)).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(a).toMatchObject({ etat: "poste", marche: { x: 850, y: 230 } });
  });

  it("figé, saute sans marcher à sa nouvelle place, et ceux qui marchaient sont arrivés", () => {
    const acteurs = new Map<string, Acteur<string>>();
    relireLesActeurs(acteurs, [entree("a", "taverne", place(2500)), entree("b", "taverne", place(2540))], seuil, false, hasardDe(1));
    relireLesActeurs(acteurs, [entree("a", "bataille", place(5300)), entree("b", "reunion", place(3400))], seuil, false, hasardDe(1));
    toutArrive(acteurs.values(), hasardDe(1));
    expect(acteurs.get("a")).toMatchObject({ etat: "poste", marche: { x: 5300, y: 240 } });
    relireLesActeurs(acteurs, [entree("a", "place", place(2100, 290)), entree("b", "maisons", place(850, 230))], seuil, true, hasardDe(1));
    expect(acteurs.get("a")).toMatchObject({ etat: "promene", marche: { x: 2100, y: 290 } });
    expect(acteurs.get("b")).toMatchObject({ etat: "poste", marche: { x: 850, y: 230 } });
  });

  it("garde son lieu quand sa place y bouge : à son poste, il y est ; en route, il y va", () => {
    const acteurs = new Map<string, Acteur<string>>();
    relireLesActeurs(acteurs, [entree("a", "taverne", place(2500)), entree("b", "bataille", place(5300))], seuil, false, hasardDe(1));
    relireLesActeurs(acteurs, [entree("a", "taverne", place(2538)), entree("b", "taverne", place(2576))], seuil, false, hasardDe(1));
    expect(acteurs.get("a")).toMatchObject({ etat: "poste", marche: { x: 2538 } });
    const b = acteurs.get("b")!;
    relireLesActeurs(acteurs, [entree("a", "taverne", place(2538)), entree("b", "taverne", place(2500))], seuil, false, hasardDe(1));
    expect(marcherJusquAuBout(b)).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(b).toMatchObject({ etat: "poste", marche: { x: 2500, y: 240 } });
  });

  it("ne met jamais plus d'environ une minute à traverser le village, même de très loin", () => {
    const portesLoin: Seuil = (lieu) => ({ x: lieu === "bataille" ? 40_000 : PORTES[lieu], y: 270 });
    const acteurs = new Map<string, Acteur<string>>();
    relireLesActeurs(acteurs, [entree("a", "maisons", place(850, 230))], portesLoin, false, hasardDe(1));
    relireLesActeurs(acteurs, [entree("a", "bataille", place(40_100))], portesLoin, false, hasardDe(1));
    const temps = marcherJusquAuBout(acteurs.get("a")!);
    expect(acteurs.get("a")).toMatchObject({ etat: "poste", marche: { x: 40_100 } });
    // 2 × ROUTE_VUE cases à 2 cases par temps, plus les quelques pas jusqu'à la place : environ une minute à 8 temps par seconde.
    expect(temps).toBeLessThan((2 * ROUTE_VUE + 200) / VITESSE_DU_CHEMIN + 100);
  });
});
