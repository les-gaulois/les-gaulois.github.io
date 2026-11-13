import { describe, expect, it } from "vitest";
import { bilanZone, declarationAncienne, suffisance, troupesDeZone, troupesEnCapsules } from "../../src/lib/alliance/bilan";
import { mouvementZone, mouvements, sortDuPixel } from "../../src/lib/alliance/evolution";
import { masqueDuCalque } from "../../src/lib/alliance/masque";
import { CASE, voisinsDe } from "../../src/lib/alliance/voisins";
import { ETAT_MER, ETAT_NEUTRE, type Veille } from "../../src/lib/clanmap/etat";

/** Les clans de l'état, par index : la valeur d'un pixel est l'index plus un. */
const CLANS = [{ tag: null }, { tag: "GAL" }, { tag: "LUX" }, { tag: "UN" }, { tag: "GAL" }];
const GAL = 2;
const LUX = 3;
const UN = 4;
const GAL_BIS = 5;
const NOTRES = new Set(["GAL", "LUX"]);
const W = 4;

/**
 * Une carte de 4 × 3 :
 *   GAL GAL UN  UN
 *   LUX N   UN  mer
 *   N   N   N   mer
 */
const valeurs = Uint16Array.from([GAL, GAL, UN, UN, LUX, ETAT_NEUTRE, UN, ETAT_MER, ETAT_NEUTRE, ETAT_NEUTRE, ETAT_NEUTRE, ETAT_MER]);

describe("ce qui a bougé en 24 heures", () => {
  // La veille : (1, 0) était neutre (pris par GAL), (2, 0) était à GAL (perdu au profit de UN), (0, 1) était à GAL
  // (passé à LUX : reste à nous), (1, 1) était à LUX (perdu, redevenu neutre).
  const veille: Veille = { seqEtat: 9, seq: 5, depuis: 0, index: Uint32Array.from([1, 2, 4, 5]), avant: Uint16Array.from([ETAT_NEUTRE, GAL, GAL, LUX]) };

  it("compte ce que l'alliance a pris et perdu, sans compter un pixel passé d'un de nos clans à l'autre", () => {
    const m = mouvements(veille, valeurs, CLANS, NOTRES);
    expect(m.alliance).toEqual({ pris: 1, perdus: 2 });
    expect(m.parClan.get("GAL")).toEqual({ pris: 1, perdus: 2 });
    expect(m.parClan.get("LUX")).toEqual({ pris: 1, perdus: 1 });
    expect(m.parClan.get("UN")).toEqual({ pris: 1, perdus: 0 });
  });

  it("ne compte rien entre deux clans du même tag", () => {
    const m = mouvements({ ...veille, index: Uint32Array.from([0]), avant: Uint16Array.from([GAL_BIS]) }, valeurs, CLANS, NOTRES);
    expect(m.alliance).toEqual({ pris: 0, perdus: 0 });
    expect(m.parClan.size).toBe(0);
  });

  it("compte une zone seulement sur ses pixels", () => {
    const calque = new Uint8Array(12);
    calque[1] = 1;
    calque[2] = 1;
    const masque = masqueDuCalque(calque, W)!;
    expect(mouvementZone(veille, valeurs, W, masque, CLANS, NOTRES)).toEqual({ pris: 1, perdus: 1 });
  });

  it("dit d'un pixel s'il est pris, perdu, ou ni l'un ni l'autre", () => {
    expect([0, 1, 2, 3].map((k) => sortDuPixel(veille, valeurs, k, CLANS, NOTRES))).toEqual(["pris", "perdu", null, "perdu"]);
  });
});

describe("nos voisins", () => {
  it("donne les clans qui touchent l'alliance, leurs pixels au contact et un cadre autour du contact", () => {
    // UN touche GAL par (2, 0) seulement : (3, 0) et (2, 1) ne touchent ni GAL ni LUX.
    // Le cadre est agrandi à 48 pixels de côté au moins, sans sortir de la carte : ici, toute la carte.
    expect(voisinsDe(valeurs, W, CLANS, NOTRES)).toEqual([{ tag: "UN", contact: 1, cadre: { x: 0, y: 0, w: 4, h: 3 } }]);
  });

  it("n'en donne aucun sans territoire à nous, et regroupe deux clans au même tag", () => {
    expect(voisinsDe(valeurs, W, CLANS, new Set(["XYZ"]))).toEqual([]);
    const v = Uint16Array.from([UN, LUX, GAL_BIS, ETAT_NEUTRE]);
    expect(voisinsDe(v, 4, CLANS, new Set(["LUX"]))).toEqual([
      { tag: "GAL", contact: 1, cadre: { x: 0, y: 0, w: 4, h: 1 } },
      { tag: "UN", contact: 1, cadre: { x: 0, y: 0, w: 4, h: 1 } },
    ]);
  });

  it("centre sur le principal point de contact, pas sur tout le contact", () => {
    // Une carte de 4 cases de large : LUX touche UN par 1 pixel à gauche et par 3 pixels dans la dernière case.
    const largeur = CASE * 4;
    const v = new Uint16Array(largeur * CASE).fill(ETAT_NEUTRE);
    v[0] = LUX;
    v[1] = UN;
    for (const y of [10, 11, 12]) {
      v[y * largeur + largeur - 2] = LUX;
      v[y * largeur + largeur - 1] = UN;
    }
    const [un] = voisinsDe(v, largeur, CLANS, new Set(["LUX"]));
    expect(un?.contact).toBe(4);
    // Le cadre de 48 de côté, centré sur ces trois pixels, collé au bord droit.
    expect(un?.cadre).toEqual({ x: largeur - 48, y: 0, w: 48, h: 48 });
  });

  it("ne passe pas d'un bord de la carte à l'autre", () => {
    // UN au bout de la première ligne, LUX au début de la seconde : côte à côte en mémoire, pas sur la carte.
    const v = Uint16Array.from([ETAT_NEUTRE, UN, LUX, ETAT_NEUTRE]);
    expect(voisinsDe(v, 2, CLANS, new Set(["LUX"]))).toEqual([]);
  });
});

describe("les troupes d'une zone", () => {
  const troupes = [
    { tag: "GAL", troops: 2_000_000, by: "[GAL] Kraken", at: "2026-11-13T10:00:00.000Z" },
    { tag: "LUX", troops: 500_000, by: "[LUX] Ami", at: "2026-11-09T10:00:00.000Z" },
  ];

  it("prend les troupes du clan de la zone, ou de toute l'alliance pour une zone commune", () => {
    expect(troupesDeZone("LUX", ["GAL", "LUX", "UN"], troupes)).toEqual({ troupes: 500_000, declares: 1, clans: 1, plusAncienne: "2026-11-09T10:00:00.000Z" });
    expect(troupesDeZone(null, ["GAL", "LUX", "UN"], troupes)).toEqual({ troupes: 2_500_000, declares: 2, clans: 3, plusAncienne: "2026-11-09T10:00:00.000Z" });
    expect(troupesDeZone("UN", ["GAL", "LUX", "UN"], troupes)).toBeNull();
    expect(troupesDeZone(null, ["UN"], troupes)).toBeNull();
  });

  it("dit ce qui manque, au moins quand la zone contient d'autres clans", () => {
    const calque = new Uint8Array(12);
    for (const p of [1, 2, 5, 6]) calque[p] = 1;
    const bilan = bilanZone(masqueDuCalque(calque, W)!, valeurs, W, CLANS, NOTRES);
    // Un pixel neutre (1 000) et deux pixels de UN (au moins 2 000 chacun).
    expect(suffisance(bilan, 3_000)).toEqual({ besoin: 5_000, manque: 2_000, exact: false });
    expect(suffisance(bilan, 9_000)).toEqual({ besoin: 5_000, manque: 0, exact: false });
    calque.fill(0);
    calque[5] = 1;
    const neutre = bilanZone(masqueDuCalque(calque, W)!, valeurs, W, CLANS, NOTRES);
    expect(suffisance(neutre, 400)).toEqual({ besoin: 1_000, manque: 600, exact: true });
  });

  it("compte les troupes en capsules, à la capsule au-dessus", () => {
    expect(troupesEnCapsules(5_000)).toBe(50);
    expect(troupesEnCapsules(5_001)).toBe(51);
    expect(troupesEnCapsules(0)).toBe(0);
  });

  it("tient une déclaration pour ancienne au-delà de trois jours", () => {
    const maintenant = new Date("2026-11-13T12:00:00.000Z");
    expect(declarationAncienne("2026-11-10T12:00:00.000Z", maintenant)).toBe(false);
    expect(declarationAncienne("2026-11-10T11:59:00.000Z", maintenant)).toBe(true);
  });
});
