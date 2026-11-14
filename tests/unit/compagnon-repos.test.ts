import { describe, expect, it } from "vitest";
import { CASES_H, CASES_L, touche, type Bornes, type Cadre, type Point } from "../../src/lib/compagnon/mouvement";
import {
  AIR,
  EMPREINTE,
  EMPREINTE_ENDORMI,
  PAS,
  TETE,
  bulleAuMieux,
  cadreDeLaBulle,
  carteDesZones,
  casesOccupees,
  empreinteA,
  estLibre,
  etatDeLaPlace,
  fondDeLaFenetre,
  formeA,
  placeAprendre,
  placeDeRepos,
  placePourSaluer,
  plusVisible,
  type Fenetre,
} from "../../src/lib/compagnon/repos";

/** Une fenêtre d'ordinateur, 1 440 × 900, l'en-tête collé en haut, un Gaulois de 96 × 128 (deux pixels par case). */
const LARGEUR = 1_440;
const HAUTEUR = 900;
const COTE = 2;
const BORNES: Bornes = { gauche: 24, droite: LARGEUR - 96 - 24, haut: 76, bas: HAUTEUR - 128 };
/** Un téléphone, 390 × 844, un Gaulois de 72 × 96 (une case et demie). */
const TEL = { largeur: 390, hauteur: 844, cote: 1.5, bornes: { gauche: 19, droite: 390 - 72 - 19, haut: 68, bas: 844 - 96 } satisfies Bornes };

/** Ce qu'il montre de sa boîte dans la fenêtre touche-t-il un des rectangles, à `AIR` près ? */
function couvre(p: Point, zones: readonly Cadre[], cote = COTE, hauteur = HAUTEUR, e: Cadre = EMPREINTE): boolean {
  const boite = empreinteA(p, cote, e);
  const visible = { ...boite, bas: Math.min(boite.bas, hauteur) };
  if (visible.bas <= visible.haut) return false;
  return zones.some((z) => touche(visible, z, AIR));
}

/** Des lignes de texte de `haut` à `bas`, de 24 pixels, de `gauche` à `droite`. */
function lignes(gauche: number, droite: number, haut: number, bas: number, pas = 24): Cadre[] {
  const out: Cadre[] = [];
  for (let y = haut; y + 18 <= bas; y += pas) out.push({ gauche, droite, haut: y, bas: y + 18 });
  return out;
}

describe("la carte de ce qu'il ne couvre pas", () => {
  it("marque les cases touchées par un rectangle, avec de l'air autour", () => {
    const carte = carteDesZones([{ gauche: 100, droite: 200, haut: 100, bas: 120 }], LARGEUR, HAUTEUR);
    expect(estLibre(carte, { gauche: 100, droite: 110, haut: 100, bas: 110 })).toBe(false);
    // À moins de six pixels : touché ; assez loin : libre.
    expect(estLibre(carte, { gauche: 204, droite: 260, haut: 100, bas: 120 })).toBe(false);
    expect(estLibre(carte, { gauche: 100, droite: 200, haut: 126, bas: 200 })).toBe(false);
    expect(estLibre(carte, { gauche: 100 + 100 + AIR + PAS, droite: 300, haut: 100, bas: 120 })).toBe(true);
    expect(estLibre(carte, { gauche: 100, droite: 200, haut: 120 + AIR + PAS, bas: 200 })).toBe(true);
    // Une carte vide, un cadre hors de la fenêtre : libres.
    expect(estLibre(carteDesZones([], LARGEUR, HAUTEUR), { gauche: 0, droite: LARGEUR, haut: 0, bas: HAUTEUR })).toBe(true);
    expect(estLibre(carte, { gauche: 0, droite: 50, haut: HAUTEUR + 10, bas: HAUTEUR + 80 })).toBe(true);
  });

  it("ne compte pas ce qui sort de la fenêtre, et ignore les rectangles vides", () => {
    const carte = carteDesZones(
      [
        { gauche: -500, droite: -100, haut: 0, bas: 900 },
        { gauche: 300, droite: 300, haut: 300, bas: 400 },
        { gauche: 0, droite: LARGEUR, haut: HAUTEUR + 50, bas: HAUTEUR + 400 },
      ],
      LARGEUR,
      HAUTEUR,
    );
    expect(estLibre(carte, { gauche: 0, droite: LARGEUR, haut: 0, bas: HAUTEUR })).toBe(true);
  });
});

describe("sa place de repos", () => {
  it("reste où il voudrait être si rien n'y est", () => {
    const voulue = { x: 76, y: BORNES.bas };
    expect(placeDeRepos(voulue, carteDesZones([], LARGEUR, HAUTEUR), BORNES, COTE, HAUTEUR)).toEqual({ place: voulue, forme: "entier" });
    // Hors des bornes : ramenée dedans.
    expect(placeDeRepos({ x: -50, y: 20 }, carteDesZones([], LARGEUR, HAUTEUR), BORNES, COTE, HAUTEUR).place).toEqual({ x: BORNES.gauche, y: BORNES.haut });
  });

  it("ne couvre pas la ligne de [GAL] du classement : il va à la place libre la plus proche", () => {
    // Le tableau du classement au bas d'un écran d'ordinateur, des lignes de 46 pixels sur toute la largeur.
    const tableau: Cadre[] = [];
    for (let y = 715; y < HAUTEUR; y += 46) tableau.push({ gauche: 58, droite: 1_382, haut: y, bas: y + 44 });
    const titre: Cadre = { gauche: 58, droite: 200, haut: 600, bas: 622 };
    const zones = [...tableau, titre];
    const voulue = { x: 76, y: BORNES.bas };
    const { place, forme } = placeDeRepos(voulue, carteDesZones(zones, LARGEUR, HAUTEUR), BORNES, COTE, HAUTEUR);
    expect(couvre(voulue, zones)).toBe(true);
    expect(couvre(place, zones)).toBe(false);
    expect(forme).toBe("entier");
    // Juste au-dessus du tableau, à droite du titre ou au-dessus : pas au bout de l'écran.
    expect(Math.hypot(place.x - voulue.x, place.y - voulue.y)).toBeLessThan(260);
  });

  it("garde une place libre et entière : il ne court pas d'une place libre à une autre", () => {
    const zones = lignes(58, 700, 100, 880);
    const carte = carteDesZones(zones, LARGEUR, HAUTEUR);
    const ici = { x: 900, y: 400 };
    expect(placeAprendre(ici, { x: 76, y: BORNES.bas }, carte, BORNES, COTE, HAUTEUR)).toBeNull();
    expect(etatDeLaPlace(ici, carte, BORNES, COTE, HAUTEUR)).toEqual({ libre: true, forme: "entier" });
    // Couvert, il part vers la place libre la plus proche de celle qu'il voudrait.
    const couvert = { x: 300, y: 400 };
    const repos = placeAprendre(couvert, couvert, carte, BORNES, COTE, HAUTEUR);
    expect(repos).not.toBeNull();
    expect(couvre(repos!.place, zones)).toBe(false);
    expect(repos!.place.x).toBeGreaterThanOrEqual(700 + AIR);
  });

  it("s'enfonce sous le bord bas, la tête dehors, quand il n'a pas la place d'être entier", () => {
    // Un téléphone couvert de texte, sauf une bande de 60 pixels au bas de l'écran, à droite.
    const zones = [...lignes(16, 374, 70, 784), ...lignes(16, 250, 784, 844)];
    const carte = carteDesZones(zones, TEL.largeur, TEL.hauteur);
    const voulue = { x: TEL.bornes.gauche, y: TEL.bornes.bas };
    const { place, forme } = placeDeRepos(voulue, carte, TEL.bornes, TEL.cote, TEL.hauteur);
    expect(forme).toBe("tete");
    expect(couvre(place, zones, TEL.cote, TEL.hauteur)).toBe(false);
    // Sa coiffe et ses yeux dépassent : au moins `TETE` rangées de son dessin dans la fenêtre.
    expect(TEL.hauteur - place.y).toBeGreaterThanOrEqual(TETE * TEL.cote - 0.001);
    expect(place.y).toBeGreaterThan(TEL.bornes.bas);
    expect(place.x).toBeGreaterThan(250);
  });

  it("se cache sous le bord bas quand même sa tête couvrirait quelque chose, et revient dès qu'une place se libère", () => {
    const pleine = lignes(0, TEL.largeur, 0, TEL.hauteur, 20);
    const carte = carteDesZones(pleine, TEL.largeur, TEL.hauteur);
    const voulue = { x: 100, y: TEL.bornes.bas };
    const cache = placeDeRepos(voulue, carte, TEL.bornes, TEL.cote, TEL.hauteur);
    expect(cache).toEqual({ place: { x: 100, y: TEL.hauteur }, forme: "cache" });
    expect(couvre(cache.place, pleine, TEL.cote, TEL.hauteur)).toBe(false);
    // Caché, il reste caché tant que rien ne se libère…
    expect(placeAprendre(cache.place, voulue, carte, TEL.bornes, TEL.cote, TEL.hauteur)).toBeNull();
    // … et ressort la tête dès qu'une bande se libère au bas de l'écran.
    const bande = carteDesZones([...lignes(0, TEL.largeur, 0, 760, 20)], TEL.largeur, TEL.hauteur);
    const tete = placeAprendre(cache.place, voulue, bande, TEL.bornes, TEL.cote, TEL.hauteur);
    expect(tete?.forme).toBe("tete");
    // Enfoncé, il se remontre en entier dès qu'il en a la place.
    const vide = carteDesZones([], TEL.largeur, TEL.hauteur);
    expect(placeAprendre(tete!.place, voulue, vide, TEL.bornes, TEL.cote, TEL.hauteur)).toEqual({ place: voulue, forme: "entier" });
  });

  it("préfère se montrer en entier un peu plus loin que s'enfoncer juste là", () => {
    // Le bas de l'écran couvert sur 140 pixels, sauf une bande de 40 pixels sous son coin ; libre au-dessus.
    const zones = [...lignes(0, LARGEUR, HAUTEUR - 140, HAUTEUR - 40), { gauche: 300, droite: LARGEUR, haut: HAUTEUR - 40, bas: HAUTEUR }];
    const carte = carteDesZones(zones, LARGEUR, HAUTEUR);
    const { place, forme } = placeDeRepos({ x: 76, y: BORNES.bas }, carte, BORNES, COTE, HAUTEUR);
    expect(forme).toBe("entier");
    expect(place.y + CASES_H * COTE).toBeLessThanOrEqual(HAUTEUR - 140 - AIR);
    // Mais tout l'écran couvert, sauf une bande juste assez haute pour sa tête : il s'y enfonce plutôt que de se cacher.
    const presquePleine = [...lignes(0, LARGEUR, 0, HAUTEUR - 70), { gauche: 300, droite: LARGEUR, haut: HAUTEUR - 70, bas: HAUTEUR }];
    const enfonce = placeDeRepos({ x: 76, y: BORNES.bas }, carteDesZones(presquePleine, LARGEUR, HAUTEUR), BORNES, COTE, HAUTEUR);
    expect(enfonce.forme).toBe("tete");
    expect(couvre(enfonce.place, presquePleine)).toBe(false);
  });

  it("ne s'arrête pas sous le curseur", () => {
    const curseur: Cadre = { gauche: 492, droite: 508, haut: 392, bas: 408 };
    const voulue = { x: 450, y: 330 };
    const { place } = placeDeRepos(voulue, carteDesZones([], LARGEUR, HAUTEUR), BORNES, COTE, HAUTEUR, [curseur]);
    expect(touche(empreinteA(place, COTE), curseur, AIR)).toBe(false);
  });

  it("ne se couche que là où son lit a sa place, jamais sous le bord", () => {
    const zones = [{ gauche: 0, droite: 70, haut: 0, bas: HAUTEUR }];
    const carte = carteDesZones(zones, LARGEUR, HAUTEUR);
    const ici = { x: 90, y: 400 };
    expect(etatDeLaPlace(ici, carte, BORNES, COTE, HAUTEUR).libre).toBe(true);
    expect(etatDeLaPlace(ici, carte, BORNES, COTE, HAUTEUR, [], true).libre).toBe(false);
    const lit = placeDeRepos(ici, carte, BORNES, COTE, HAUTEUR, [], true);
    expect(couvre(lit.place, zones, COTE, HAUTEUR, EMPREINTE_ENDORMI)).toBe(false);
    expect(lit.forme).toBe("entier");
    const pleine = carteDesZones(lignes(0, LARGEUR, 0, HAUTEUR - 30), LARGEUR, HAUTEUR);
    expect(placeDeRepos(ici, pleine, BORNES, COTE, HAUTEUR, [], true).forme).toBe("cache");
  });

  it("ne couvre jamais rien, quelle que soit la page : mille pages tirées au hasard", () => {
    let graine = 7;
    const hasard = (): number => {
      graine = (graine * 1_103_515_245 + 12_345) % 2_147_483_648;
      return graine / 2_147_483_648;
    };
    const formes = { entier: 0, tete: 0, cache: 0 };
    for (let essai = 0; essai < 1_000; essai++) {
      const tel = hasard() < 0.5;
      const largeur = tel ? TEL.largeur : LARGEUR;
      const hauteur = tel ? TEL.hauteur : HAUTEUR;
      const cote = tel ? TEL.cote : COTE;
      const bornes = tel ? TEL.bornes : BORNES;
      const zones: Cadre[] = [];
      const nombre = Math.floor(hasard() * 60);
      for (let i = 0; i < nombre; i++) {
        const gauche = hasard() * largeur;
        const haut = hasard() * hauteur;
        zones.push({ gauche, droite: gauche + 10 + hasard() * largeur * 0.6, haut, bas: haut + 12 + hasard() * 60 });
      }
      const voulue = { x: hasard() * largeur, y: hasard() * hauteur };
      const { place, forme } = placeDeRepos(voulue, carteDesZones(zones, largeur, hauteur), bornes, cote, hauteur);
      formes[forme]++;
      expect(couvre(place, zones, cote, hauteur)).toBe(false);
      expect(formeA(place, bornes, cote, hauteur)).toBe(forme);
      expect(place.x).toBeGreaterThanOrEqual(bornes.gauche);
      expect(place.x).toBeLessThanOrEqual(bornes.droite);
      expect(place.y).toBeGreaterThanOrEqual(bornes.haut);
      if (forme !== "cache") expect(place.y).toBeLessThanOrEqual(fondDeLaFenetre(bornes, cote, hauteur));
    }
    // Les trois formes servent, et le plus souvent il se montre en entier.
    expect(formes.entier).toBeGreaterThan(formes.tete);
    expect(formes.tete).toBeGreaterThan(0);
    expect(formes.cache).toBeGreaterThan(0);
  });

  it("compte les cases occupées que touche un cadre", () => {
    const carte = carteDesZones([{ gauche: 100, droite: 200, haut: 100, bas: 120 }], LARGEUR, HAUTEUR);
    expect(casesOccupees(carte, { gauche: 0, droite: 50, haut: 0, bas: 50 })).toBe(0);
    // Une case de 8 pixels, alignée sur la carte.
    expect(casesOccupees(carte, { gauche: 104, droite: 112, haut: 104, bas: 112 })).toBe(1);
    expect(casesOccupees(carte, { gauche: 0, droite: LARGEUR, haut: 0, bas: HAUTEUR })).toBeGreaterThan(10);
  });

  it("range les formes de la plus visible à la moins visible", () => {
    expect(plusVisible("entier", "tete")).toBe(true);
    expect(plusVisible("tete", "cache")).toBe(true);
    expect(plusVisible("cache", "entier")).toBe(false);
    expect(plusVisible("tete", "tete")).toBe(false);
    expect(formeA({ x: 0, y: BORNES.bas }, BORNES, COTE, HAUTEUR)).toBe("entier");
    expect(formeA({ x: 0, y: HAUTEUR - TETE * COTE }, BORNES, COTE, HAUTEUR)).toBe("tete");
    expect(formeA({ x: 0, y: HAUTEUR }, BORNES, COTE, HAUTEUR)).toBe("cache");
    expect(EMPREINTE).toEqual({ gauche: 0, droite: CASES_L, haut: 0, bas: CASES_H });
  });
});

describe("sa bulle et son salut", () => {
  const BULLE = { largeur: 190, hauteur: 86 };
  const FENETRE: Fenetre = { largeur: LARGEUR, hauteur: HAUTEUR, haut: BORNES.haut - 4 };

  it("pose la bulle au-dessus de lui quand rien n'y est, la queue sur sa tête", () => {
    const corps = { x: 600, y: 400 };
    const place = bulleAuMieux(corps, COTE, BULLE, FENETRE, carteDesZones([], LARGEUR, HAUTEUR));
    expect(place.dessous).toBe(false);
    expect(place.libre).toBe(true);
    // Comme avant : son bord gauche à 36 % de sa largeur avant sa tête.
    expect(place.gauche + place.queue).toBeCloseTo(corps.x + (CASES_L / 2) * COTE, 6);
    expect(place.gauche).toBeCloseTo(corps.x + 48 - BULLE.largeur * 0.36, 6);
    expect(cadreDeLaBulle(corps, COTE, BULLE, place.gauche, false)).toEqual({ gauche: place.gauche, droite: place.gauche + 190, haut: 400 + 6 - 86, bas: 406 });
  });

  it("déplace la bulle de côté, ou sous ses pieds, plutôt que sur un titre", () => {
    const corps = { x: 600, y: 400 };
    const tete = corps.x + (CASES_L / 2) * COTE;
    // Un titre juste au-dessus de lui, jusqu'à 30 pixels avant sa tête : la bulle glisse à droite, la queue toujours sur
    // sa tête (à 18 pixels au moins du bord de la bulle).
    const aGauche: Cadre = { gauche: 300, droite: tete - 30, haut: 300, bas: 380 };
    const decalee = bulleAuMieux(corps, COTE, BULLE, FENETRE, carteDesZones([aGauche], LARGEUR, HAUTEUR));
    expect(decalee).toMatchObject({ dessous: false, libre: true });
    expect(touche(cadreDeLaBulle(corps, COTE, BULLE, decalee.gauche, false), aGauche, AIR)).toBe(false);
    expect(decalee.gauche + decalee.queue).toBeCloseTo(tete, 6);
    expect(decalee.queue).toBeGreaterThanOrEqual(18);
    // Toute la bande au-dessus de lui occupée : sous ses pieds.
    const bande: Cadre = { gauche: 0, droite: LARGEUR, haut: 300, bas: 400 };
    const dessous = bulleAuMieux(corps, COTE, BULLE, FENETRE, carteDesZones([bande], LARGEUR, HAUTEUR));
    expect(dessous).toMatchObject({ dessous: true, libre: true });
    // Rien de libre ni au-dessus ni dessous : la moins couvrante, et `libre` le dit.
    const partout = bulleAuMieux(corps, COTE, BULLE, FENETRE, carteDesZones([{ gauche: 0, droite: LARGEUR, haut: 0, bas: HAUTEUR }], LARGEUR, HAUTEUR));
    expect(partout.libre).toBe(false);
  });

  it("ne sort jamais de la fenêtre, au bord gauche comme sous l'en-tête", () => {
    const pres = bulleAuMieux({ x: BORNES.gauche, y: BORNES.haut }, COTE, BULLE, FENETRE, carteDesZones([], LARGEUR, HAUTEUR));
    expect(pres.gauche).toBeGreaterThanOrEqual(8);
    // Collé sous l'en-tête, elle passe sous ses pieds.
    expect(pres.dessous).toBe(true);
    const bord = bulleAuMieux({ x: BORNES.droite, y: 500 }, COTE, BULLE, FENETRE, null);
    expect(bord.gauche + BULLE.largeur).toBeLessThanOrEqual(LARGEUR - 8);
  });

  it("choisit pour saluer une place où ni lui ni sa bulle ne couvrent rien, ou aucune", () => {
    // Le bas de l'écran couvert de lignes, libre plus haut : il salue de plus haut, bulle comprise.
    const zones = lignes(0, LARGEUR, 500, HAUTEUR);
    const carte = carteDesZones(zones, LARGEUR, HAUTEUR);
    const place = placePourSaluer({ x: 76, y: BORNES.bas }, carte, BORNES, COTE, FENETRE, BULLE);
    expect(place).not.toBeNull();
    expect(couvre(place!, zones)).toBe(false);
    const bulle = bulleAuMieux(place!, COTE, BULLE, FENETRE, carte);
    expect(bulle.libre).toBe(true);
    expect(cadreDeLaBulle(place!, COTE, BULLE, bulle.gauche, bulle.dessous).haut).toBeGreaterThanOrEqual(FENETRE.haut);
    // Toute la fenêtre couverte : pas de place pour saluer.
    expect(placePourSaluer({ x: 76, y: BORNES.bas }, carteDesZones(lignes(0, LARGEUR, 0, HAUTEUR), LARGEUR, HAUTEUR), BORNES, COTE, FENETRE, BULLE)).toBeNull();
    // Sans rien sur la page : à sa place, s'il y a la place pour la bulle au-dessus de lui.
    expect(placePourSaluer({ x: 600, y: 600 }, carteDesZones([], LARGEUR, HAUTEUR), BORNES, COTE, FENETRE, BULLE)).toEqual({ x: 600, y: 600 });
  });
});
