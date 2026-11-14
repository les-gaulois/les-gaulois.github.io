import { describe, expect, it } from "vitest";
import {
  ARRIVEE,
  ATTENTE_MS,
  CASES_H,
  CASES_L,
  DEPART,
  DORT_MS,
  IMAGES,
  NOMBRE_D_IMAGES,
  PAS_MS,
  SOMNOLE_MS,
  SOUFFLE_MS,
  VITESSE,
  avancer,
  depuisPart,
  ecarterDuChamp,
  echelleDuCompagnon,
  enPart,
  imageDeMarche,
  marcheurA,
  margeDuBord,
  placeDeDepart,
  placeDeLaBulle,
  reposApres,
  souffleA,
  type Marcheur,
} from "../../src/lib/compagnon/mouvement";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../src/lib/gaulois";

/** Rejoue la marche image par image, à soixante images par seconde. */
function rejouer(depart: Marcheur, cible: number | null, secondes: number, min = 0, max = 2_000, precis = false): { fin: Marcheur; etapes: Marcheur[] } {
  const etapes: Marcheur[] = [];
  let m = depart;
  for (let i = 0; i < secondes * 60; i++) {
    m = avancer(m, cible, 1000 / 60, min, max, precis);
    etapes.push(m);
  }
  return { fin: m, etapes };
}

describe("la taille du Gaulois compagnon", () => {
  it("a les mesures du dessin du village", () => {
    expect(CASES_L).toBe(GAULOIS_LARGEUR);
    expect(CASES_H).toBe(GAULOIS_HAUTEUR);
  });

  it("donne à chaque case un nombre entier de pixels de l'écran", () => {
    for (const largeur of [360, 390, 639, 640, 1024, 1440, 1920]) {
      for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
        const { parCase, cote } = echelleDuCompagnon(largeur, dpr);
        expect(Number.isInteger(parCase)).toBe(true);
        expect(parCase).toBeGreaterThanOrEqual(1);
        expect(cote * dpr).toBeCloseTo(parCase, 10);
        // Petit : jamais plus du quart d'un téléphone, ni de 130 pixels de large sur ordinateur.
        expect(cote * CASES_L).toBeLessThanOrEqual(largeur < 640 ? Math.max(96, largeur / 4) : 130);
        expect(cote * CASES_L).toBeGreaterThanOrEqual(56);
      }
    }
    expect(echelleDuCompagnon(1440, 1)).toEqual({ parCase: 2, cote: 2 });
    expect(echelleDuCompagnon(390, 2)).toEqual({ parCase: 3, cote: 1.5 });
    // Une mesure absurde ne casse rien.
    expect(echelleDuCompagnon(1440, 0).cote).toBe(2);
    expect(echelleDuCompagnon(1440, Number.NaN).cote).toBe(2);
  });

  it("garde la place de son lit au bord de la fenêtre", () => {
    expect(margeDuBord(2)).toBe(24);
    expect(margeDuBord(1.5)).toBe(19);
  });
});

describe("la marche du Gaulois compagnon", () => {
  it("ne bouge pas pour un visiteur proche, ni pour un curseur qui passe", () => {
    const pres = rejouer(marcheurA(500), 500 + DEPART - 1, 5);
    expect(pres.fin.x).toBe(500);
    expect(pres.etapes.every((m) => !m.enMarche)).toBe(true);
    // Loin, mais depuis moins de 0,7 seconde : il attend encore.
    const bref = rejouer(marcheurA(500), 1_500, (ATTENTE_MS - 100) / 1000);
    expect(bref.fin.x).toBe(500);
    expect(bref.fin.enMarche).toBe(false);
  });

  it("part vers le visiteur, sans jamais courir ni partir d'un coup, et s'arrête à côté", () => {
    const { fin, etapes } = rejouer(marcheurA(100), 1_200, 40);
    expect(fin.enMarche).toBe(false);
    expect(fin.vitesse).toBe(0);
    expect(fin.vers).toBe(1);
    expect(fin.x).toBeGreaterThan(1_200 - ARRIVEE - 1);
    expect(fin.x).toBeLessThanOrEqual(1_200 - ARRIVEE + 0.001);
    let avant = marcheurA(100);
    for (const m of etapes) {
      expect(m.vitesse).toBeLessThanOrEqual(VITESSE);
      // Jamais plus d'un pixel par image, jamais en arrière.
      expect(m.x - avant.x).toBeGreaterThanOrEqual(0);
      expect(m.x - avant.x).toBeLessThanOrEqual(1);
      // La vitesse change peu d'une image à l'autre : ni départ ni arrêt brusque.
      if (m.enMarche && avant.enMarche) expect(Math.abs(m.vitesse - avant.vitesse)).toBeLessThanOrEqual(6);
      avant = m;
    }
    // Vingt secondes au moins pour mille pixels : il marche.
    expect(etapes.findIndex((m) => m.x > 1_000)).toBeGreaterThan(15 * 60);
  });

  it("marche aussi vers la gauche, et se retourne", () => {
    const { fin } = rejouer(marcheurA(1_200), 200, 40);
    expect(fin.vers).toBe(-1);
    expect(fin.x).toBeCloseTo(200 + ARRIVEE, 0);
  });

  it("s'arrête quand le visiteur passe de l'autre côté, puis repart après son attente", () => {
    const enRoute = rejouer(marcheurA(100), 1_200, 5).fin;
    expect(enRoute.enMarche).toBe(true);
    const retourne = avancer(enRoute, 0, 16, 0, 2_000);
    expect(retourne.enMarche).toBe(false);
    expect(retourne.x).toBe(enRoute.x);
    const apres = rejouer(retourne, 0, 2).fin;
    expect(apres.enMarche).toBe(true);
    expect(apres.vers).toBe(-1);
  });

  it("ne sort jamais de la fenêtre et s'arrête au bord", () => {
    const { fin, etapes } = rejouer(marcheurA(300), 5_000, 40, 24, 900);
    expect(Math.max(...etapes.map((m) => m.x))).toBeLessThanOrEqual(900);
    expect(fin.enMarche).toBe(false);
    // Une fenêtre plus étroite que lui : il reste au bord gauche.
    expect(avancer(marcheurA(300), 500, 16, 24, 10).x).toBe(24);
  });

  it("s'arrête net sans cible : pause, bulle ouverte, posé à la main", () => {
    const enRoute = rejouer(marcheurA(100), 1_200, 5).fin;
    const arrete = avancer(enRoute, null, 16, 0, 2_000);
    expect(arrete).toMatchObject({ x: enRoute.x, enMarche: false, vitesse: 0, pasMs: 0 });
  });

  it("s'écarte d'un champ tout de suite et jusqu'au bout", () => {
    const { fin, etapes } = rejouer(marcheurA(400), 430, 5, 0, 2_000, true);
    expect(etapes[0]?.enMarche).toBe(true);
    expect(fin.enMarche).toBe(false);
    expect(fin.x).toBeCloseTo(430, 0);
  });

  it("tient une image très en retard pour un dixième de seconde au plus", () => {
    const enRoute = rejouer(marcheurA(100), 1_200, 5).fin;
    expect(avancer(enRoute, 1_200, 60_000, 0, 2_000).x - enRoute.x).toBeLessThanOrEqual(VITESSE / 10 + 0.001);
  });
});

describe("les images du Gaulois compagnon", () => {
  it("lève un pied, puis l'autre, debout entre les deux, un quart de seconde chacun", () => {
    const suite = [0, 1, 2, 3, 4].map((temps) => imageDeMarche(temps * PAS_MS + 1));
    expect(suite.map((p) => p.image)).toEqual([IMAGES.piedGauche, IMAGES.debout, IMAGES.piedDroit, IMAGES.debout, IMAGES.piedGauche]);
    expect(suite.map((p) => p.leve)).toEqual([true, false, true, false, true]);
    expect(imageDeMarche(-5).image).toBe(IMAGES.piedGauche);
    expect(Object.keys(IMAGES).length).toBe(NOMBRE_D_IMAGES);
    // Huit temps par seconde, comme au village : un pas dure deux temps.
    expect(PAS_MS).toBe(250);
  });

  it("somnole puis se couche quand on ne bouge plus, et respire lentement", () => {
    expect(reposApres(0)).toBe("debout");
    expect(reposApres(SOMNOLE_MS - 1)).toBe("debout");
    expect(reposApres(SOMNOLE_MS)).toBe("somnole");
    expect(reposApres(DORT_MS)).toBe("dort");
    expect(SOMNOLE_MS).toBeGreaterThanOrEqual(15_000);
    expect([0, SOUFFLE_MS - 1, SOUFFLE_MS, 2 * SOUFFLE_MS, -10].map(souffleA)).toEqual([0, 0, 1, 0, 0]);
    // Rien qui clignote : une image de souffle dure plus de deux secondes.
    expect(SOUFFLE_MS).toBeGreaterThanOrEqual(2_000);
  });
});

describe("la place du Gaulois compagnon", () => {
  it("commence en bas à gauche et se retrouve d'une page et d'une fenêtre à l'autre", () => {
    expect(placeDeDepart(24, 1_320)).toBeLessThan(120);
    expect(placeDeDepart(24, 10)).toBe(24);
    const part = enPart(700, 24, 1_320);
    expect(depuisPart(part, 24, 1_320)).toBeCloseTo(700, 6);
    // Sur un téléphone, la même part de la largeur.
    expect(depuisPart(part, 19, 299)).toBeCloseTo(19 + part * 280, 6);
    expect(depuisPart(Number.NaN, 24, 1_320)).toBe(24);
    expect(depuisPart(7, 24, 1_320)).toBe(1_320);
    expect(enPart(50, 24, 24)).toBe(0);
  });

  it("ne couvre pas un champ en cours de saisie", () => {
    // Loin du champ : rien à faire.
    expect(ecarterDuChamp(100, 96, { gauche: 400, droite: 800 }, 24, 1_320)).toBeNull();
    // Sur le champ : le côté le plus proche où il tient.
    expect(ecarterDuChamp(380, 96, { gauche: 400, droite: 800 }, 24, 1_320)).toBe(400 - 8 - 96);
    expect(ecarterDuChamp(760, 96, { gauche: 400, droite: 800 }, 24, 1_320)).toBe(808);
    // Un champ collé au bord gauche : à droite.
    expect(ecarterDuChamp(30, 96, { gauche: 16, droite: 300 }, 24, 1_320)).toBe(308);
    // Un champ de toute la largeur d'un téléphone : le bord le plus loin de son milieu.
    expect([19, 269]).toContain(ecarterDuChamp(100, 72, { gauche: 16, droite: 344 }, 19, 269));
  });

  it("garde sa bulle dans la fenêtre, la queue vers lui", () => {
    for (const [centre, fenetre] of [
      [60, 360],
      [300, 360],
      [700, 1_440],
      [1_400, 1_440],
    ] as const) {
      const { gauche, queue } = placeDeLaBulle(centre, 240, fenetre);
      expect(gauche).toBeGreaterThanOrEqual(8);
      expect(gauche + 240).toBeLessThanOrEqual(fenetre - 8);
      expect(queue).toBeGreaterThanOrEqual(18);
      expect(queue).toBeLessThanOrEqual(240 - 26);
    }
    // Au milieu d'un grand écran, la queue tombe juste sur lui.
    const { gauche, queue } = placeDeLaBulle(700, 240, 1_440);
    expect(gauche + queue).toBeCloseTo(700, 6);
  });
});
