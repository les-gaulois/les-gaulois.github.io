import { describe, expect, it } from "vitest";
import {
  ATTENTE_MS,
  CASES_H,
  CASES_L,
  DEPART,
  DORT_MS,
  ECART_DU_CURSEUR,
  IMAGES,
  JEU,
  NOMBRE_D_IMAGES,
  PAS_MS,
  SOMNOLE_MS,
  SOUFFLE_MS,
  VITESSE,
  avancer,
  bornerLaPlace,
  cadreA,
  coinDuCote,
  corpsA,
  depuisPart,
  echelleDeLaPrison,
  echelleDuCompagnon,
  enPart,
  fenetreGenee,
  horsDesZones,
  imageDeMarche,
  marcheurA,
  margeDuBord,
  nullePart,
  placeAcoteDuCurseur,
  placeDeDepart,
  placeDeLaBulle,
  reposApres,
  souffleA,
  touche,
  type Allure,
  type Bornes,
  type Cadre,
  type Marcheur,
  type Point,
} from "../../src/lib/compagnon/mouvement";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../src/lib/gaulois";

/** Une grande fenêtre d'ordinateur, 1 440 × 900, l'en-tête collé en haut : ses places possibles, pour un Gaulois de 96 × 128. */
const GRANDE: Bornes = { gauche: 24, droite: 1_440 - 96 - 24, haut: 76, bas: 900 - 128 };
const L = 96;
const H = 128;

/** Rejoue la marche image par image, à soixante images par seconde. */
function rejouer(depart: Marcheur, cible: Point | null, secondes: number, b: Bornes = GRANDE, allure: Allure = "suivre"): { fin: Marcheur; etapes: Marcheur[] } {
  const etapes: Marcheur[] = [];
  let m = depart;
  for (let i = 0; i < secondes * 60; i++) {
    m = avancer(m, cible, 1000 / 60, b, allure);
    etapes.push(m);
  }
  return { fin: m, etapes };
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

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
        expect(cote * CASES_L).toBeGreaterThanOrEqual(48);
      }
    }
    expect(echelleDuCompagnon(1440, 1)).toEqual({ parCase: 2, cote: 2 });
    expect(echelleDuCompagnon(390, 2)).toEqual({ parCase: 3, cote: 1.5 });
    // Une mesure absurde ne casse rien.
    expect(echelleDuCompagnon(1440, 0).cote).toBe(2);
    expect(echelleDuCompagnon(1440, Number.NaN).cote).toBe(2);
  });

  it("met sa prison à environ un pixel de la page par case, sans flou", () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
      const { parCase, cote } = echelleDeLaPrison(dpr);
      expect(Number.isInteger(parCase)).toBe(true);
      expect(cote * dpr).toBeCloseTo(parCase, 10);
      expect(cote).toBeGreaterThanOrEqual(0.75);
      expect(cote).toBeLessThanOrEqual(1.34);
      // Toujours plus petite que lui.
      expect(cote).toBeLessThan(echelleDuCompagnon(1440, dpr).cote);
    }
    expect(echelleDeLaPrison(1)).toEqual({ parCase: 1, cote: 1 });
    expect(echelleDeLaPrison(Number.NaN)).toEqual({ parCase: 1, cote: 1 });
  });

  it("garde la place de son lit au bord de la fenêtre", () => {
    expect(margeDuBord(2)).toBe(24);
    expect(margeDuBord(1.5)).toBe(19);
  });
});

describe("la marche du Gaulois compagnon, sur toute la fenêtre", () => {
  it("ne bouge pas pour un visiteur proche, ni pour un curseur qui passe", () => {
    const pres = rejouer(marcheurA(500, 400), { x: 500 + DEPART - 1, y: 400 }, 5);
    expect(pres.fin).toMatchObject({ x: 500, y: 400 });
    expect(pres.etapes.every((m) => !m.enMarche)).toBe(true);
    // Loin, mais depuis moins de 0,7 seconde : il attend encore.
    const bref = rejouer(marcheurA(500, 400), { x: 1_200, y: 100 }, (ATTENTE_MS - 100) / 1000);
    expect(bref.fin).toMatchObject({ x: 500, y: 400, enMarche: false });
  });

  it("part vers sa cible en ligne droite, sans jamais courir ni partir d'un coup, et s'y arrête", () => {
    const depart = marcheurA(100, GRANDE.bas);
    const cible = { x: 1_000, y: 150 };
    const { fin, etapes } = rejouer(depart, cible, 40);
    expect(fin.enMarche).toBe(false);
    expect(fin.vitesse).toBe(0);
    expect(fin.vers).toBe(1);
    expect(distance(fin, cible)).toBeLessThan(0.01);
    let avant = depart;
    for (const m of etapes) {
      expect(m.vitesse).toBeLessThanOrEqual(VITESSE);
      // Jamais plus d'un pixel par image, toujours vers sa cible.
      expect(distance(m, avant)).toBeLessThanOrEqual(1);
      expect(distance(m, cible)).toBeLessThanOrEqual(distance(avant, cible) + 1e-9);
      // La vitesse change peu d'une image à l'autre : ni départ ni arrêt brusque.
      if (m.enMarche && avant.enMarche) expect(Math.abs(m.vitesse - avant.vitesse)).toBeLessThanOrEqual(6);
      avant = m;
    }
    // Il marche : vingt secondes au moins pour mille pixels.
    expect(etapes.findIndex((m) => distance(m, depart) > 1_000)).toBeGreaterThan(15 * 60);
  });

  it("monte et descend aussi, sans se retourner pour une marche droite vers le haut", () => {
    const monte = rejouer(marcheurA(600, GRANDE.bas, -1), { x: 610, y: 120 }, 30).fin;
    expect(monte.y).toBeCloseTo(120, 1);
    expect(monte.vers).toBe(-1);
    const descend = rejouer(marcheurA(600, 120), { x: 600, y: GRANDE.bas }, 30).fin;
    expect(descend.y).toBeCloseTo(GRANDE.bas, 1);
    // Vers la gauche, il se retourne.
    expect(rejouer(marcheurA(1_200, 400), { x: 200, y: 300 }, 40).fin.vers).toBe(-1);
  });

  it("s'arrête quand le visiteur passe derrière lui, puis repart après son attente", () => {
    const enRoute = rejouer(marcheurA(100, 400), { x: 1_200, y: 400 }, 5).fin;
    expect(enRoute.enMarche).toBe(true);
    const retourne = avancer(enRoute, { x: 30, y: 400 }, 16, GRANDE);
    expect(retourne.enMarche).toBe(false);
    expect(retourne.x).toBe(enRoute.x);
    const apres = rejouer(retourne, { x: 30, y: 400 }, 2).fin;
    expect(apres.enMarche).toBe(true);
    expect(apres.vers).toBe(-1);
  });

  it("ne sort jamais de la fenêtre, ne passe pas sous l'en-tête, et s'arrête au bord", () => {
    const { fin, etapes } = rejouer(marcheurA(300, 400), { x: 5_000, y: -500 }, 60);
    expect(Math.max(...etapes.map((m) => m.x))).toBeLessThanOrEqual(GRANDE.droite);
    expect(Math.min(...etapes.map((m) => m.y))).toBeGreaterThanOrEqual(GRANDE.haut);
    expect(fin.enMarche).toBe(false);
    expect(fin).toMatchObject({ x: GRANDE.droite, y: GRANDE.haut });
    // Une fenêtre plus petite que lui : il reste au coin haut gauche des places possibles.
    expect(avancer(marcheurA(300, 300), { x: 500, y: 500 }, 16, { gauche: 24, droite: 10, haut: 60, bas: 20 })).toMatchObject({ x: 24, y: 60 });
  });

  it("s'arrête net sans cible : pause, bulle ouverte, posé à la main", () => {
    const enRoute = rejouer(marcheurA(100, 400), { x: 1_200, y: 200 }, 5).fin;
    const arrete = avancer(enRoute, null, 16, GRANDE);
    expect(arrete).toMatchObject({ x: enRoute.x, y: enRoute.y, enMarche: false, vitesse: 0, pasMs: 0 });
  });

  it("s'écarte tout de suite et jusqu'au bout", () => {
    const { fin, etapes } = rejouer(marcheurA(400, 500), { x: 430, y: 470 }, 5, GRANDE, "ecarter");
    expect(etapes[0]?.enMarche).toBe(true);
    expect(fin.enMarche).toBe(false);
    expect(distance(fin, { x: 430, y: 470 })).toBeLessThan(0.01);
  });

  it("rejoint un coin bas de l'écran sur téléphone : du côté touché, après son attente, jusqu'au bout", () => {
    const telephone: Bornes = { gauche: 19, droite: 307, haut: 64, bas: 700 };
    expect(coinDuCote(80, 390, telephone)).toEqual({ x: 19, y: 700 });
    expect(coinDuCote(300, 390, telephone)).toEqual({ x: 307, y: 700 });
    expect(coinDuCote(300, 390, { ...telephone, droite: 5 })).toEqual({ x: 19, y: 700 });
    const { fin, etapes } = rejouer(marcheurA(19, 700), { x: 307, y: 700 }, 12, telephone, "rejoindre");
    expect(etapes[10]?.enMarche).toBe(false);
    expect(fin).toMatchObject({ x: 307, y: 700, enMarche: false });
    // Déjà dans son coin : il ne bouge pas.
    expect(rejouer(marcheurA(300, 700), { x: 307, y: 700 }, 3, telephone, "rejoindre").fin.x).toBe(300);
  });

  it("tient une image très en retard pour un dixième de seconde au plus", () => {
    const enRoute = rejouer(marcheurA(100, 400), { x: 1_200, y: 400 }, 5).fin;
    expect(distance(avancer(enRoute, { x: 1_200, y: 400 }, 60_000, GRANDE), enRoute)).toBeLessThanOrEqual(VITESSE / 10 + 0.001);
  });
});

describe("sa place à côté du curseur", () => {
  it("se tient à côté du curseur, du côté où il est, jamais dessous", () => {
    const curseur = { x: 800, y: 500 };
    const aGauche = placeAcoteDuCurseur(curseur, { x: 100, y: 700 }, L, H, GRANDE);
    expect(aGauche.x).toBe(800 - ECART_DU_CURSEUR - L);
    const aDroite = placeAcoteDuCurseur(curseur, { x: 1_200, y: 100 }, L, H, GRANDE);
    expect(aDroite.x).toBe(800 + ECART_DU_CURSEUR);
    for (const place of [aGauche, aDroite]) {
      // Le curseur à hauteur de main, à côté de son dessin, jamais dedans.
      expect(place.y).toBeLessThan(curseur.y);
      expect(place.y + H).toBeGreaterThan(curseur.y);
      expect(curseur.x < place.x || curseur.x > place.x + L).toBe(true);
    }
  });

  it("passe de l'autre côté au bord de la fenêtre, et reste sous l'en-tête", () => {
    expect(placeAcoteDuCurseur({ x: 40, y: 500 }, { x: 10, y: 500 }, L, H, GRANDE).x).toBe(40 + ECART_DU_CURSEUR);
    expect(placeAcoteDuCurseur({ x: 1_420, y: 500 }, { x: 1_400, y: 500 }, L, H, GRANDE).x).toBe(1_420 - ECART_DU_CURSEUR - L);
    // Le curseur sur l'en-tête : il reste dessous ; tout en bas : ses pieds au bas de la fenêtre.
    expect(placeAcoteDuCurseur({ x: 700, y: 10 }, { x: 100, y: 500 }, L, H, GRANDE).y).toBe(GRANDE.haut);
    expect(placeAcoteDuCurseur({ x: 700, y: 899 }, { x: 100, y: 500 }, L, H, GRANDE).y).toBe(GRANDE.bas);
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
    const depart = placeDeDepart(GRANDE);
    expect(depart.x).toBeLessThan(120);
    expect(depart.y).toBe(GRANDE.bas);
    expect(placeDeDepart({ gauche: 24, droite: 10, haut: 60, bas: 20 })).toEqual({ x: 24, y: 60 });
    const part = enPart(700, 24, 1_320);
    expect(depuisPart(part, 24, 1_320)).toBeCloseTo(700, 6);
    // Sur un téléphone, la même part de la largeur.
    expect(depuisPart(part, 19, 299)).toBeCloseTo(19 + part * 280, 6);
    expect(depuisPart(Number.NaN, 24, 1_320)).toBe(24);
    expect(depuisPart(7, 24, 1_320)).toBe(1_320);
    expect(enPart(50, 24, 24)).toBe(0);
    expect(bornerLaPlace({ x: -5, y: 5_000 }, GRANDE)).toEqual({ x: GRANDE.gauche, y: GRANDE.bas });
  });

  it("garde sa bulle dans la fenêtre, la queue vers lui, et la passe dessous en haut de la fenêtre", () => {
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
    // Assez de place au-dessus : au-dessus ; sinon, sous l'en-tête, elle passe dessous s'il y a plus de place sous lui.
    expect(placeDeLaBulle(700, 240, 1_440, { hauteur: 120, dessus: 300, dessous: 400 }).dessous).toBe(false);
    expect(placeDeLaBulle(700, 240, 1_440, { hauteur: 120, dessus: 40, dessous: 600 }).dessous).toBe(true);
    // Téléphone couché : ni au-dessus ni dessous en entier, elle reste du côté le plus grand.
    expect(placeDeLaBulle(700, 240, 851, { hauteur: 120, dessus: 110, dessous: 90 }).dessous).toBe(false);
    expect(placeDeLaBulle(700, 240, 1_440).dessous).toBe(false);
  });
});

describe("ce que le Gaulois compagnon ne couvre pas", () => {
  const coin: Cadre = { gauche: 0, droite: 420, haut: 900 - 180, bas: 900 };

  it("mesure son corps sans les marges vides du dessin, pour la mention de licence", () => {
    expect(corpsA({ x: 100, y: 200 }, 2)).toEqual({ gauche: 116, droite: 180, haut: 208, bas: 328 });
  });

  it("reconnaît deux cadres qui se touchent", () => {
    expect(touche(cadreA({ x: 0, y: 0 }, 10, 10), { gauche: 5, droite: 20, haut: 5, bas: 20 })).toBe(true);
    expect(touche(cadreA({ x: 0, y: 0 }, 10, 10), { gauche: 10, droite: 20, haut: 0, bas: 10 })).toBe(false);
    expect(touche(cadreA({ x: 0, y: 0 }, 10, 10), { gauche: 15, droite: 20, haut: 0, bas: 10 }, JEU)).toBe(true);
  });

  it("ne bouge pas si rien ne le gêne", () => {
    expect(horsDesZones({ x: 600, y: 300 }, L, H, [], GRANDE)).toBeNull();
    expect(horsDesZones({ x: 600, y: 300 }, L, H, [coin], GRANDE)).toBeNull();
  });

  it("va à la place libre la plus proche, à huit pixels au moins, dans la fenêtre", () => {
    // Au coin bas gauche, sur une fenêtre fixée là : au-dessus d'elle, plus près que sa droite.
    const place = horsDesZones({ x: 30, y: GRANDE.bas }, L, H, [coin], GRANDE);
    expect(place).not.toBeNull();
    expect(touche(cadreA(place!, L, H), coin, JEU)).toBe(false);
    expect(place).toEqual({ x: 30, y: coin.haut - JEU - H });
    // Un lien juste sous lui : à côté, sans le couvrir.
    const lien: Cadre = { gauche: 640, droite: 700, haut: 500, bas: 520 };
    const ecart = horsDesZones({ x: 620, y: 420 }, L, H, [lien], GRANDE)!;
    expect(touche(cadreA(ecart, L, H), lien, JEU)).toBe(false);
    expect(Math.hypot(ecart.x - 620, ecart.y - 420)).toBeLessThanOrEqual(130);
  });

  it("passe au-dessus d'une barre de toute la largeur, et ne s'efface que s'il ne tient nulle part", () => {
    const barre: Cadre = { gauche: 0, droite: 1_440, haut: 800, bas: 900 };
    const place = horsDesZones({ x: 200, y: GRANDE.bas }, L, H, [barre], GRANDE)!;
    expect(place.y).toBe(800 - JEU - H);
    expect(nullePart({ x: 200, y: GRANDE.bas }, L, H, [barre], GRANDE)).toBe(false);
    // Une fenêtre couverte de haut en bas : il ne tient nulle part.
    const tout: Cadre = { gauche: 0, droite: 1_440, haut: 0, bas: 900 };
    expect(nullePart({ x: 200, y: 300 }, L, H, [tout], GRANDE)).toBe(true);
    // Deux zones voisines : une place qui ne touche ni l'une ni l'autre.
    const deux: Cadre[] = [coin, { gauche: 420, droite: 1_440, haut: 900 - 180, bas: 900 }];
    const au = horsDesZones({ x: 400, y: GRANDE.bas }, L, H, deux, GRANDE)!;
    expect(deux.some((z) => touche(cadreA(au, L, H), z, JEU))).toBe(false);
  });

  it("s'efface quand le clavier d'un téléphone est ouvert ou la page agrandie, pas quand la barre d'adresse se replie", () => {
    expect(fenetreGenee(812, null)).toBe(false);
    expect(fenetreGenee(812, undefined)).toBe(false);
    expect(fenetreGenee(812, { height: 812, scale: 1 })).toBe(false);
    // La barre d'adresse : une centaine de pixels.
    expect(fenetreGenee(812, { height: 712, scale: 1 })).toBe(false);
    // Le clavier : la moitié de l'écran.
    expect(fenetreGenee(812, { height: 420, scale: 1 })).toBe(true);
    // La page agrandie du bout des doigts.
    expect(fenetreGenee(812, { height: 406, scale: 2 })).toBe(true);
    expect(fenetreGenee(812, { height: 812, scale: 1.5 })).toBe(true);
  });
});
