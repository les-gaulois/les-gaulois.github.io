import { describe, expect, it } from "vitest";
import { borner, cadreDuClan, decaler, echelleDuMonde, estVueDEnsemble, indexDesClans, ligneDuClan, pointDeCarte, positionSurLaCarte, zoomer } from "../../src/lib/clanmap/vue";
import { fmtInt } from "../../src/lib/format";

/** La carte du film et un dessin de 1 280 × 600 : la carte y est limitée par la hauteur. */
const monde = { width: 2054, height: 974 };
const ecran = { width: 1280, height: 600 };

describe("la vue de la carte", () => {
  it("la vue d'ensemble montre toute la carte, limitée par le côté le plus court", () => {
    expect(echelleDuMonde(monde, ecran)).toBeCloseTo(600 / 974, 6);
    expect(echelleDuMonde(monde, { width: 375, height: 300 })).toBeCloseTo(375 / 2054, 6);
  });

  it("le point de la carte sous le milieu du dessin est le centre de la vue", () => {
    const vue = { x: 900, y: 300, s: 2 };
    expect(pointDeCarte(vue, 640, 300, ecran)).toEqual([900, 300]);
    // 100 pixels à droite du milieu, à l'échelle 2 : 50 cases plus à l'est.
    expect(pointDeCarte(vue, 740, 300, ecran)).toEqual([950, 300]);
  });

  it("zoomer garde sous le curseur le point de la carte qui s'y trouvait", () => {
    const vue = { x: 1000, y: 400, s: 0.7 };
    for (const [px, py] of [
      [200, 120],
      [640, 300],
      [1200, 580],
    ] as const) {
      const avant = pointDeCarte(vue, px, py, ecran);
      const apres = pointDeCarte(zoomer(vue, 2.4, px, py, ecran), px, py, ecran);
      expect(apres[0]).toBeCloseTo(avant[0], 6);
      expect(apres[1]).toBeCloseTo(avant[1], 6);
    }
    expect(zoomer(vue, 2.4, 200, 120, ecran).s).toBe(2.4);
  });

  it("une vue ne va ni plus loin que la vue d'ensemble, ni plus près que la limite", () => {
    const loin = borner({ x: 500, y: 500, s: 0.01 }, monde, ecran, 8);
    expect(loin.s).toBeCloseTo(echelleDuMonde(monde, ecran), 6);
    // À la vue d'ensemble, la carte reste centrée.
    expect(loin.x).toBe(monde.width / 2);
    expect(loin.y).toBe(monde.height / 2);
    expect(borner({ x: 500, y: 500, s: 50 }, monde, ecran, 8).s).toBe(8);
    // Une limite plus basse que la vue d'ensemble ne la fait pas reculer davantage.
    expect(borner({ x: 500, y: 500, s: 0.2 }, monde, ecran, 0.1).s).toBeCloseTo(echelleDuMonde(monde, ecran), 6);
  });

  it("de près, la carte ne sort jamais du dessin", () => {
    const s = 4;
    const ouest = borner({ x: -9999, y: -9999, s }, monde, ecran, 8);
    expect(ouest.x).toBe(ecran.width / (2 * s));
    expect(ouest.y).toBe(ecran.height / (2 * s));
    const est = borner({ x: 9999, y: 9999, s }, monde, ecran, 8);
    expect(est.x).toBe(monde.width - ecran.width / (2 * s));
    expect(est.y).toBe(monde.height - ecran.height / (2 * s));
    // Une vue déjà dans ses limites ne bouge pas.
    expect(borner({ x: 1000, y: 400, s }, monde, ecran, 8)).toEqual({ x: 1000, y: 400, s });
  });

  it("une fenêtre posée à droite laisse le bord est venir jusqu'à elle, et la cible se centre dans la partie libre", () => {
    const s = 4;
    const sans = borner({ x: 9999, y: 400, s }, monde, ecran, 8);
    const avec = borner({ x: 9999, y: 400, s }, monde, ecran, 8, 400);
    expect(avec.x - sans.x).toBe(400 / s);
    // La cible paraît au milieu des 880 pixels libres : 200 pixels à gauche du milieu du dessin.
    const vue = decaler({ x: 1000, y: 400, s }, 400);
    expect(pointDeCarte(vue, 440, 300, ecran)[0]).toBeCloseTo(1000, 6);
    expect(decaler({ x: 1000, y: 400, s }, 0)).toEqual({ x: 1000, y: 400, s });
  });

  it("reconnaît la vue d'ensemble, à très peu près", () => {
    const s = echelleDuMonde(monde, ecran);
    expect(estVueDEnsemble({ x: monde.width / 2, y: monde.height / 2, s }, monde, ecran)).toBe(true);
    expect(estVueDEnsemble({ x: monde.width / 2, y: monde.height / 2, s: s * 1.001 }, monde, ecran)).toBe(true);
    expect(estVueDEnsemble({ x: monde.width / 2, y: monde.height / 2, s: s * 1.2 }, monde, ecran)).toBe(false);
    expect(estVueDEnsemble({ x: monde.width / 2 + 40, y: monde.height / 2, s }, monde, ecran)).toBe(false);
  });
});

describe("le cadre d'un clan", () => {
  /** Une carte de 20 × 10 cases, vide, que chaque test peint. */
  const carte = (peindre: (owner: Uint16Array) => void) => {
    const owner = new Uint16Array(200);
    peindre(owner);
    return owner;
  };

  it("entoure toutes les cases d'un territoire d'un seul tenant", () => {
    const owner = carte((o) => {
      for (let y = 2; y <= 5; y++) for (let x = 4; x <= 9; x++) o[y * 20 + x] = 3;
    });
    expect(cadreDuClan(owner, 20, 10, 3, 0)).toEqual({ x: 7, y: 4, halfWidth: 3, halfHeight: 2 });
  });

  it("laisse de côté une case perdue à l'autre bout de la carte", () => {
    const owner = carte((o) => {
      for (let y = 2; y <= 6; y++) for (let x = 2; x <= 11; x++) o[y * 20 + x] = 3;
      // Une seule case, tout à l'est : 2 % du territoire.
      o[9 * 20 + 19] = 3;
    });
    const cadre = cadreDuClan(owner, 20, 10, 3)!;
    expect(cadre.x + cadre.halfWidth).toBeLessThanOrEqual(12);
    expect(cadre.y + cadre.halfHeight).toBeLessThanOrEqual(7);
    // Sans rien écarter, le cadre irait jusqu'à elle.
    expect(cadreDuClan(owner, 20, 10, 3, 0)!.halfWidth).toBe(9);
  });

  it("ne confond pas deux clans, et ne cadre pas un clan absent", () => {
    const owner = carte((o) => {
      o[0] = 1;
      o[199] = 2;
    });
    expect(cadreDuClan(owner, 20, 10, 1)).toEqual({ x: 0.5, y: 0.5, halfWidth: 0.5, halfHeight: 0.5 });
    expect(cadreDuClan(owner, 20, 10, 2)).toEqual({ x: 19.5, y: 9.5, halfWidth: 0.5, halfHeight: 0.5 });
    expect(cadreDuClan(owner, 20, 10, 7)).toBeNull();
  });
});

describe("la phrase d'un clan choisi sur la carte", () => {
  const standings = [
    { tag: "UN", pixels: 511_337 },
    { tag: "LUX", pixels: 244_749 },
    { tag: "GAL", pixels: 144_646 },
  ];

  it("donne la place et le territoire de la liste officielle, et dit de quand ils sont", () => {
    expect(ligneDuClan("UN", standings)).toBe(`UN : 1er au dernier relevé, ${fmtInt(511_337)} pixels`);
    expect(ligneDuClan("GAL", standings)).toBe(`GAL : 3e au dernier relevé, ${fmtInt(144_646)} pixels`);
  });

  it("n'invente rien pour un clan qui n'est plus sur la carte, ni pour un clan supprimé", () => {
    expect(ligneDuClan("ESP", standings)).toBe("ESP : plus aucun pixel au dernier relevé");
    expect(ligneDuClan(null, standings)).toBe("Clan supprimé");
    expect(ligneDuClan("UN", [])).toBe("UN : plus aucun pixel au dernier relevé");
  });

  it("ne donne aucun chiffre quand deux clans portent le même tag : rien ne dit lequel est choisi", () => {
    expect(ligneDuClan("UN", [...standings, { tag: "UN", pixels: 12 }])).toBe("UN");
  });
});

describe("la position de la souris sur la carte complète", () => {
  // Le film affiche une carte deux fois plus petite que la carte complète : 2 054 × 974 cases pour 4 108 × 1 948 pixels.
  it("compte en pixels de la carte complète, sur quatre chiffres", () => {
    expect(positionSurLaCarte(0, 0, monde, 2)).toBe("x 0000 · y 0000");
    expect(positionSurLaCarte(641.5, 575.2, monde, 2)).toBe("x 1283 · y 1150");
    // Le dernier point de la carte : juste sous sa largeur et sa hauteur en pixels.
    expect(positionSurLaCarte(2053.9, 973.9, monde, 2)).toBe("x 4107 · y 1947");
    // Sans réduction, une case est un pixel.
    expect(positionSurLaCarte(12.7, 3.2, monde, 1)).toBe("x 0012 · y 0003");
  });

  it("ne dit rien hors de la carte", () => {
    expect(positionSurLaCarte(-0.1, 10, monde, 2)).toBeNull();
    expect(positionSurLaCarte(10, -0.1, monde, 2)).toBeNull();
    expect(positionSurLaCarte(2054, 10, monde, 2)).toBeNull();
    expect(positionSurLaCarte(10, 974, monde, 2)).toBeNull();
  });
});

describe("retrouver un clan du film par son tag", () => {
  it("donne l'index de chaque clan, sans la terre neutre ni les clans supprimés", () => {
    const index = indexDesClans([{ tag: null }, { tag: "OF" }, { tag: null }, { tag: "GAL" }]);
    expect([...index]).toEqual([
      ["OF", 1],
      ["GAL", 3],
    ]);
  });

  it("un tag porté par deux clans n'en désigne aucun", () => {
    const index = indexDesClans([{ tag: null }, { tag: "OF" }, { tag: "GAL" }, { tag: "OF" }]);
    expect(index.has("OF")).toBe(false);
    expect(index.get("GAL")).toBe(2);
    expect(indexDesClans([]).size).toBe(0);
  });
});
