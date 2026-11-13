import { describe, expect, it } from "vitest";
import { ETAT_MER, ETAT_NEUTRE, auLittoral } from "../../src/lib/clanmap/etat";
import {
  DARK_SEA,
  FAR_TILES,
  INLAND_SEA,
  LAND,
  NEAR_TILES,
  OCEAN,
  OCEAN_SHORE,
  OPEN_SEA,
  OPEN_SEA_CSS,
  SHORE,
  distanceToLand,
  enMer,
  largeur,
  merDuJeu,
  seaColor,
} from "../../src/lib/clanmap/terrain";
import { FORCE_MIN, decalage, respiration, traitsVisibles, vaguelettes, type Trait } from "../../src/lib/fx/vagues";

const hex = (rgb: readonly number[]) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

describe("la mer de la carte", () => {
  it("reprend l'océan et le littoral du jeu", () => {
    expect(hex(OCEAN)).toBe("#4785b5");
    // Le littoral du jeu : 70 % de l'océan et 30 % de blanc.
    expect(OCEAN_SHORE).toEqual(OCEAN.map((c) => Math.round(0.7 * c + 0.3 * 255)));
  });

  it("éclaircit un peu les mers et assombrit le large, autour de l'océan du jeu", () => {
    for (let k = 0; k < 3; k++) {
      expect(INLAND_SEA[k]).toBeGreaterThan(OCEAN[k]!);
      expect(OPEN_SEA[k]).toBeLessThan(OCEAN[k]!);
      // Un contraste mesuré : les mers à moins de 15 % de l'océan du jeu ; le large, plus foncé à la demande du pilote,
      // à moins de 30 %. Toujours bleus : le bleu reste le plus fort, le rouge le plus faible.
      expect(Math.abs(INLAND_SEA[k]! - OCEAN[k]!) / OCEAN[k]!).toBeLessThan(0.15);
      expect(Math.abs(OPEN_SEA[k]! - OCEAN[k]!) / OCEAN[k]!).toBeLessThan(0.3);
    }
    for (const c of [INLAND_SEA, OPEN_SEA]) expect(c[2]! > c[1]! && c[1]! > c[0]!).toBe(true);
    expect(OPEN_SEA_CSS).toBe(hex(OPEN_SEA));
  });

  it("mesure la distance à la terre, à 6 % près de la ligne droite", () => {
    // Une ligne de terre à gauche, de l'eau à droite.
    const width = 40;
    const height = 3;
    const terrain = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) terrain[y * width] = LAND;
    const d = distanceToLand(terrain, width, height);
    expect(d[0]).toBe(0);
    expect(d[width + 1]).toBe(1);
    expect(d[width + 30]).toBe(30);
    // En diagonale, une case de terre seule.
    const seul = new Uint8Array(30 * 30);
    seul[0] = LAND;
    const diag = distanceToLand(seul, 30, 30)[20 * 30 + 20]!;
    expect(Math.abs(diag - 20 * Math.SQRT2) / (20 * Math.SQRT2)).toBeLessThan(0.06);
    // Sans terre, tout est au large.
    expect(distanceToLand(new Uint8Array(4), 2, 2)[0]).toBe(Infinity);
  });

  it("donne aux vagues leur force, de la côte au large, et à chaque case d'eau sa couleur", () => {
    expect(largeur(0)).toBe(0);
    expect(largeur(NEAR_TILES)).toBe(0);
    expect(largeur(FAR_TILES)).toBe(1);
    expect(largeur(Infinity)).toBe(1);
    const milieu = largeur((NEAR_TILES + FAR_TILES) / 2);
    expect(milieu).toBeCloseTo(0.5, 5);
    expect(seaColor(0, 0)).toEqual(OPEN_SEA);
    expect(seaColor(0, 1)).toEqual(INLAND_SEA);
    expect(seaColor(0, 0.5)).toEqual([0, 1, 2].map((k) => (OPEN_SEA[k]! + INLAND_SEA[k]!) / 2));
    expect(seaColor(SHORE, 0)).toEqual(OCEAN_SHORE);
  });

  it("sépare les mers du grand océan par leurs détroits, sans halo le long des côtes ouvertes", () => {
    // Un grand océan de 600 × 300 cases ; à l'est, un bloc de terre qui enferme une mer de 60 × 60, reliée à l'océan par un
    // détroit de 4 cases, et un lac sans issue.
    const width = 600;
    const height = 300;
    const terrain = new Uint8Array(width * height);
    const poser = (x0: number, x1: number, y0: number, y1: number, v: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) terrain[y * width + x] = v;
    };
    poser(300, 399, 100, 199, LAND);
    poser(320, 379, 120, 179, 0);
    poser(300, 319, 148, 151, 0);
    poser(305, 308, 105, 108, 0);
    const mer = enMer(terrain, distanceToLand(terrain, width, height), width, height);
    const a = (x: number, y: number) => mer[y * width + x]!;
    expect(a(50, 50)).toBe(0);
    // Le long d'une côte ouverte, à deux cases de la terre : encore le large.
    expect(a(298, 115)).toBe(0);
    expect(a(401, 150)).toBe(0);
    expect(a(350, 201)).toBe(0);
    // Dans le détroit, en s'éloignant de l'océan, la limite se fond : du large à la mer, sans retour en arrière.
    const sortie = Array.from({ length: 17 }, (_, i) => a(296 + i, 150));
    expect(sortie[0]).toBe(0);
    expect(sortie.at(-1)).toBe(1);
    expect(sortie.some((v) => v > 0 && v < 1)).toBe(true);
    for (let i = 1; i < sortie.length; i++) expect(sortie[i]!).toBeGreaterThanOrEqual(sortie[i - 1]!);
    // La mer enfermée, jusqu'à ses côtes, et le lac.
    expect(a(350, 150)).toBe(1);
    expect(a(322, 122)).toBe(1);
    expect(a(306, 106)).toBe(1);
  });

  it("recolore la mer du fond case par case, sans toucher la terre", () => {
    // Un fond de 2 × 1 pixels, donc un terrain de 4 × 2 cases. Pixel de gauche : quatre cases de terre.
    // Pixel de droite : deux cases de terre, une de littoral, une d'eau. Si petite, la carte n'a pas de grand océan :
    // l'eau y est une mer (seaColor(0, 1)).
    const terre = [50, 55, 54];
    const background = Uint8Array.from([...terre, ...DARK_SEA]);
    const terrain = Uint8Array.from([LAND, LAND, LAND, SHORE, LAND, LAND, LAND, 0]);
    const mer = merDuJeu(background, 2, 1, terrain)!;
    expect([...mer.image.slice(0, 3)]).toEqual(terre);
    const attendu = [0, 1, 2].map((k) => Math.round(DARK_SEA[k]! + (OCEAN_SHORE[k]! - DARK_SEA[k]!) / 4 + (seaColor(0, 1)[k]! - DARK_SEA[k]!) / 4));
    expect([...mer.image.slice(3, 6)]).toEqual(attendu);
    // Pas de vagues sur la terre ; sur une demi-case d'eau près de la côte, des vagues faibles.
    expect(mer.vagues[0]).toBe(0);
    expect(mer.vagues[1]).toBe(Math.round(((0.35 + 0.35) / 4) * 255));
    // Des tailles qui ne vont pas ensemble : rien.
    expect(merDuJeu(background, 2, 1, new Uint8Array(4))).toBeNull();
  });

  it("au large, la mer prend toute la couleur du large et les vagues toute leur force", () => {
    const width = 100;
    const terrain = new Uint8Array(width * 2 * 2 * 2);
    const background = new Uint8Array(width * 2 * 3);
    for (let p = 0; p < width * 2; p++) background.set(DARK_SEA, p * 3);
    const mer = merDuJeu(background, width, 2, terrain)!;
    expect([...mer.image.slice(0, 3)]).toEqual([...OPEN_SEA]);
    expect(mer.vagues[0]).toBe(255);
  });

  it("trouve le littoral sur l'état de la carte", () => {
    // 3 × 2 : de la terre neutre en haut à gauche.
    const valeurs = Uint16Array.from([ETAT_NEUTRE, ETAT_MER, ETAT_MER, ETAT_MER, ETAT_MER, ETAT_MER]);
    expect(auLittoral(valeurs, 3, 0)).toBe(false);
    expect(auLittoral(valeurs, 3, 1)).toBe(true);
    expect(auLittoral(valeurs, 3, 3)).toBe(true);
    // En diagonale seulement, et au bord de la carte : pas de littoral.
    expect(auLittoral(valeurs, 3, 4)).toBe(false);
    expect(auLittoral(valeurs, 3, 2)).toBe(false);
    expect(auLittoral(valeurs, 3, 5)).toBe(false);
  });
});

describe("les vagues", () => {
  it("sont toujours les mêmes pour une même graine, dans leur carreau", () => {
    const a = vaguelettes(18, 150, 11);
    expect(a).toEqual(vaguelettes(18, 150, 11));
    expect(a).not.toEqual(vaguelettes(18, 150, 29));
    for (const v of a) {
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThan(150);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThan(150);
      expect(v.longueur).toBeGreaterThanOrEqual(5);
      expect(v.longueur).toBeLessThanOrEqual(12);
    }
  });

  it("dérivent lentement et reviennent dans leur carreau", () => {
    expect(decalage(0, 3, 150)).toBe(0);
    expect(decalage(10_000, 3, 150)).toBe(30);
    expect(decalage(60_000, 3, 150)).toBe(30);
    expect(decalage(10_000, -2, 150)).toBe(130);
  });

  const TAILLE = 50;
  const nappe = vaguelettes(18, TAILLE, 11);
  const toutVoir = { x0: 0, y0: 0, x1: 200, y1: 120 };
  /** Un calque de 200 × 120 : la terre à gauche de `bord`, la mer de force `force` à droite. */
  const calque = (bord: number, force = 255) => {
    const poids = new Uint8Array(200 * 120);
    for (let y = 0; y < 120; y++) for (let x = bord; x < 200; x++) poids[y * 200 + x] = force;
    return poids;
  };
  /** Les cinq points que la courbe d'un trait doit avoir en mer. */
  const points = (t: Trait) => [
    [t.x - t.longueur / 2, t.y],
    [t.x + t.longueur / 2, t.y],
    [t.x, t.y - t.creux / 2],
    [t.x - t.longueur / 4, t.y - (3 * t.creux) / 8],
    [t.x + t.longueur / 4, t.y - (3 * t.creux) / 8],
  ];

  it("couvrent toute la mer, à pleine force au large", () => {
    const traits = traitsVisibles(calque(0), 200, 120, nappe, TAILLE, 0, 0, toutVoir);
    // Le carreau se répète : au moins ses traits, une fois par carreau entier du calque (4 × 2).
    expect(traits.length).toBeGreaterThanOrEqual(18 * 8);
    for (const t of traits) expect(t.force).toBe(1);
  });

  it("ne touchent jamais la terre ni une mer trop près du bord", () => {
    expect(traitsVisibles(calque(200), 200, 120, nappe, TAILLE, 0, 0, toutVoir)).toEqual([]);
    for (const [dx, dy] of [[0, 0], [17.3, 4.1], [33, 41]] as const) {
      const traits = traitsVisibles(calque(90), 200, 120, nappe, TAILLE, dx, dy, toutVoir);
      expect(traits.length).toBeGreaterThan(0);
      for (const t of traits) for (const [x] of points(t)) expect(Math.floor(x!)).toBeGreaterThanOrEqual(90);
    }
    // Une mer trop faible, comme un pixel qui mêle terre et eau : aucun trait.
    expect(traitsVisibles(calque(0, Math.floor(FORCE_MIN * 255) - 1), 200, 120, nappe, TAILLE, 0, 0, toutVoir)).toEqual([]);
  });

  it("ne cherchent que dans la partie visible", () => {
    const vue = { x0: 60, y0: 30, x1: 110, y1: 70 };
    const tous = traitsVisibles(calque(0), 200, 120, nappe, TAILLE, 5, 9, toutVoir);
    const vus = traitsVisibles(calque(0), 200, 120, nappe, TAILLE, 5, 9, vue);
    expect(vus.length).toBeGreaterThan(0);
    expect(vus.length).toBeLessThan(tous.length);
    for (const t of vus) {
      expect(t.x + t.longueur / 2).toBeGreaterThanOrEqual(vue.x0);
      expect(t.x - t.longueur / 2).toBeLessThanOrEqual(vue.x1);
      expect(t.y).toBeGreaterThanOrEqual(vue.y0);
      expect(t.y - t.creux).toBeLessThanOrEqual(vue.y1);
    }
    // Rien de ce qui est visible n'est oublié.
    const dedans = tous.filter((t) => t.x + t.longueur / 2 >= vue.x0 && t.x - t.longueur / 2 <= vue.x1 && t.y >= vue.y0 && t.y - t.creux <= vue.y1);
    expect(vus).toEqual(expect.arrayContaining(dedans));
  });

  it("dérivent avec leur nappe, sans sauter d'un carreau à l'autre", () => {
    // Décalées d'un pixel, les vagues sont celles d'avant, un pixel plus loin, au bord de la carte près.
    const avant = traitsVisibles(calque(0), 200, 120, nappe, TAILLE, 0, 0, toutVoir);
    const apres = traitsVisibles(calque(0), 200, 120, nappe, TAILLE, 1, 0, toutVoir);
    const cle = (t: Trait) => `${t.x.toFixed(3)},${t.y.toFixed(3)}`;
    const deplaces = new Set(avant.map((t) => cle({ ...t, x: t.x + 1 })));
    const retrouves = apres.filter((t) => deplaces.has(cle(t))).length;
    expect(retrouves / apres.length).toBeGreaterThan(0.9);
  });

  it("se forment et s'effacent en douceur, sans à-coup", () => {
    expect(respiration(0, 9000)).toBe(0);
    expect(respiration(4500, 9000)).toBeCloseTo(1, 10);
    expect(respiration(9000, 9000)).toBe(0);
    // D'une image à l'autre (66 ms), la force change de moins de 3 %.
    for (let ms = 0; ms < 9000; ms += 66) expect(Math.abs(respiration(ms + 66, 9000) - respiration(ms, 9000))).toBeLessThan(0.03);
  });
});
