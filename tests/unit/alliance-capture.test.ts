import { describe, expect, it } from "vitest";
import {
  CAPTURE,
  ECHELLE_MAX,
  blocsQuiTiennent,
  cadreDeLaVue,
  cadreVisible,
  SOURCES_CAPTURE,
  TEXTES_CAPTURE,
  LEGENDE_MAX,
  contenuDeLaCapture,
  dateDeCapture,
  legendeDeCapture,
  couperEnLignes,
  nomDeFichier,
  pointDansLeCadre,
  raccourcir,
  versLImage,
  vueDeCapture,
  zonesDansLeCadre,
} from "../../src/lib/alliance/capture";
import { bilanZone } from "../../src/lib/alliance/bilan";
import { masqueDuCalque, type Masque } from "../../src/lib/alliance/masque";
import { MAP_SOURCES } from "../../src/lib/commandes-image";
import { frNumber } from "../../src/lib/nombre";

const MONDE = { width: 4108, height: 1948 };
const SORTIE = { width: CAPTURE.carte.w, height: CAPTURE.carte.h };
/** Une lettre fait 10 de large : de quoi compter les coupures à la main. */
const mesure = (t: string) => [...t].length * 10;

/** Un masque d'après un dessin : « # » dans la zone, sur une carte de `width` pixels de large posée en (0, 0). */
function masque(lignes: string[], width = lignes[0]!.length): Masque {
  const calque = new Uint8Array(width * lignes.length);
  lignes.forEach((ligne, y) => [...ligne].forEach((c, x) => (calque[y * width + x] = c === "#" ? 1 : 0)));
  return masqueDuCalque(calque, width)!;
}

describe("la disposition de la capture", () => {
  it("tient dans l'image, sans chevauchement, et reste plus large que haute pour Discord", () => {
    const { largeur, hauteur, marge, entete, carte, panneau, pied } = CAPTURE;
    expect(largeur / hauteur).toBeGreaterThanOrEqual(1.55);
    expect(carte.x).toBe(marge);
    expect(carte.y).toBeGreaterThanOrEqual(entete.h);
    expect(carte.x + carte.w).toBeLessThan(panneau.x);
    expect(panneau.x + panneau.w).toBe(largeur - marge);
    expect(carte.y + carte.h).toBeLessThanOrEqual(pied.y);
    expect(panneau.y + panneau.h).toBeLessThanOrEqual(pied.y);
    expect(pied.y + pied.h).toBe(hauteur);
  });
});

describe("le morceau de carte que voit le joueur", () => {
  it("retire la bande couverte par la fenêtre, et ce qui sort de la carte", () => {
    // Une vue au milieu, 2 pixels du dessin par pixel de la carte, sur un dessin de 1 000 × 600 dont 400 sont couverts.
    const cadre = cadreVisible({ x: 2000, y: 1000, s: 2 }, { width: 1000, height: 600 }, 400, MONDE);
    expect(cadre).toEqual({ x: 1750, y: 850, w: 300, h: 300 });
    // Collée au bord ouest : rien à gauche de la carte.
    expect(cadreVisible({ x: 100, y: 1000, s: 2 }, { width: 1000, height: 600 }, 0, MONDE)).toEqual({ x: 0, y: 850, w: 350, h: 300 });
  });

  it("rend toute la carte quand rien de la carte ne se voit", () => {
    expect(cadreVisible({ x: 2000, y: 1000, s: 2 }, { width: 1000, height: 600 }, 1000, MONDE)).toEqual({ x: 0, y: 0, w: MONDE.width, h: MONDE.height });
  });
});

describe("la vue de la capture", () => {
  it("montre tout le cadre choisi, centré, et ce qui l'entoure", () => {
    const cadre = { x: 1000, y: 500, w: 300, h: 300 };
    const vue = vueDeCapture(cadre, SORTIE, MONDE);
    expect(vue.x).toBeCloseTo(1150);
    expect(vue.y).toBeCloseTo(650);
    const montre = cadreDeLaVue(vue, SORTIE, MONDE);
    expect(montre.x).toBeLessThanOrEqual(cadre.x);
    expect(montre.y).toBeLessThanOrEqual(cadre.y + 1e-9);
    expect(montre.x + montre.w).toBeGreaterThanOrEqual(cadre.x + cadre.w);
    expect(montre.y + montre.h).toBeGreaterThanOrEqual(cadre.y + cadre.h - 1e-9);
  });

  it("ne va jamais plus loin que la carte entière, ni plus près que l'échelle la plus forte", () => {
    const toute = vueDeCapture({ x: 0, y: 0, w: MONDE.width, h: MONDE.height }, SORTIE, MONDE);
    expect(toute.s).toBeCloseTo(Math.min(SORTIE.width / MONDE.width, SORTIE.height / MONDE.height));
    expect(toute.x).toBeCloseTo(MONDE.width / 2);
    expect(toute.y).toBeCloseTo(MONDE.height / 2);
    expect(vueDeCapture({ x: 10, y: 10, w: 2, h: 2 }, SORTIE, MONDE).s).toBe(ECHELLE_MAX);
  });

  it("ne sort pas de la carte quand le cadre en touche un bord", () => {
    const vue = vueDeCapture({ x: 0, y: 0, w: 200, h: 200 }, SORTIE, MONDE);
    const montre = cadreDeLaVue(vue, SORTIE, MONDE);
    expect(montre.x).toBeCloseTo(0);
    expect(montre.y).toBeCloseTo(0);
    expect(montre.w).toBeCloseTo(SORTIE.width / vue.s);
    expect(versLImage(vue, SORTIE, 0, 0)[0]).toBeCloseTo(0);
  });
});

describe("les zones dans l'image", () => {
  const enL = masque(["#....", "#....", "#....", "#####"]);

  it("posent leur numéro sur un de leurs pixels visibles, près du milieu de leur partie visible", () => {
    // Le milieu du cadre de la zone en L est vide : le numéro va sur le pixel de la zone le plus proche.
    const point = pointDansLeCadre(enL, { x: 0, y: 0, w: 10, h: 10 });
    expect(point).not.toBeNull();
    expect(enL.bits.length).toBeGreaterThan(0);
    const [x, y] = point!;
    expect(x === 0 || y === 3).toBe(true);
    // Seul le bas du L se voit : le numéro y reste.
    expect(pointDansLeCadre(enL, { x: 2, y: 2, w: 10, h: 10 })).toEqual([3, 3]);
  });

  it("ne comptent pas une zone dont le cadre touche l'image sans qu'aucun de ses pixels n'y soit", () => {
    // Le coin vide du L (en haut à droite) seul dans l'image.
    expect(pointDansLeCadre(enL, { x: 2, y: 0, w: 3, h: 2 })).toBeNull();
    const zones = [
      { id: 7, masque: enL },
      { id: 9, masque: masque(["..........##"], 12) },
    ];
    expect(zonesDansLeCadre(zones, { x: 2, y: 0, w: 3, h: 2 })).toEqual([]);
    const dedans = zonesDansLeCadre(zones, { x: 0, y: 0, w: 20, h: 20 });
    expect(dedans.map((d) => [d.zone.id, d.numero])).toEqual([
      [7, 1],
      [9, 2],
    ]);
    // Les numéros suivent les zones de l'image, sans trou.
    expect(zonesDansLeCadre(zones, { x: 9, y: 0, w: 5, h: 1 }).map((d) => [d.zone.id, d.numero])).toEqual([[9, 1]]);
  });
});

describe("les textes du panneau", () => {
  it("se coupent aux espaces ordinaires, jamais à une espace insécable", () => {
    expect(couperEnLignes("Terre neutre : 1 000 pixels", 150, mesure)).toEqual(["Terre neutre :", "1 000 pixels"]);
    expect(couperEnLignes("court", 100, mesure)).toEqual(["court"]);
    expect(couperEnLignes("", 100, mesure)).toEqual([]);
    // Un mot plus long que la ligne reste entier.
    expect(couperEnLignes("anticonstitutionnellement", 50, mesure)).toEqual(["anticonstitutionnellement"]);
  });

  it("se raccourcissent d'un « … » pour tenir", () => {
    expect(raccourcir("Gaule du Nord", 200, mesure)).toBe("Gaule du Nord");
    const court = raccourcir("Gaule du Nord", 60, mesure);
    expect(court.endsWith("…")).toBe(true);
    expect(mesure(court)).toBeLessThanOrEqual(60);
    expect(court).toBe("Gaule…");
  });

  it("posent autant de zones que le panneau en tient, et gardent la place de la ligne du reste", () => {
    expect(blocsQuiTiennent([100, 100, 100], 300, 30)).toBe(3);
    expect(blocsQuiTiennent([100, 100, 100], 299, 30)).toBe(2);
    expect(blocsQuiTiennent([100, 100, 100], 229, 30)).toBe(1);
    expect(blocsQuiTiennent([], 10, 30)).toBe(0);
  });
});

describe("le nom du fichier", () => {
  it("donne le jour et l'heure de Paris", () => {
    expect(nomDeFichier(new Date("2026-11-13T13:05:00Z"))).toBe("gal-carte-alliance-2026-11-13-14h05.png");
    expect(nomDeFichier(new Date("2026-07-01T22:30:00Z"))).toBe("gal-carte-alliance-2026-07-02-00h30.png");
  });
});

describe("le contenu de l'image", () => {
  const int = frNumber({ maximumFractionDigits: 0 });
  const dec = frNumber({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nombre = (n: number) => int.format(n);
  const pct = (part: number) => `${dec.format(part * 100)} %`;
  // Une carte de 8 × 4 : 0 mer, 1 neutre, 2 le clan GAL (index 1), 3 le clan RU (index 2).
  const monde = { width: 8, height: 4 };
  const valeurs = Uint16Array.from([0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  const clans = [{ tag: null }, { tag: "GAL" }, { tag: "RU" }];
  const zone = masque(["....####", "....####"], 8);
  const bilan = bilanZone(zone, valeurs, 8, clans, new Set(["GAL"]));
  const base = {
    langue: "fr" as const,
    nombre,
    pct,
    vue: { x: 4, y: 2, s: 100 },
    monde,
    releve: "2026-11-13T07:53:38Z",
    maintenant: new Date("2026-11-13T14:05:00Z"),
    notreAlliance: "Les Irréductibles",
    legende: [{ couleur: 0x38bdf8, texte: "GAL", detail: "4 pixels" }],
    troupes: { total: 1_500_000, declares: 1, clans: 3, plusAncienne: "2026-11-13T12:00:00Z" },
    zones: [{ id: 5, title: "Plaine du Nord", tag: "GAL", masque: zone, couleur: 0x38bdf8 }],
    bilans: new Map([[5, bilan]]),
    adresse: "les-gaulois.github.io/carte",
  };

  it("donne les dates du relevé et de la capture, à l'heure de Paris, avec l'année", () => {
    const c = contenuDeLaCapture(base);
    expect(c.dates).toEqual([`Territoires au relevé du ${dateDeCapture(base.releve, "fr")}`, `Capture du ${dateDeCapture(base.maintenant, "fr")}`]);
    expect(dateDeCapture("2026-11-13T07:53:38Z", "fr")).toMatch(/^13 nov\. 2026, 08:53$/);
    expect(dateDeCapture("2026-11-13T07:53:38Z", "en")).toMatch(/^13 Nov 2026, 08:53$/);
    expect(c.sousTitre).toBe("Les Irréductibles");
  });

  it("écrit les chiffres de chaque zone de l'image d'après son bilan, sans rien ajouter", () => {
    const c = contenuDeLaCapture(base);
    expect(c.zones?.entrees).toHaveLength(1);
    const e = c.zones!.entrees[0]!;
    expect(e).toMatchObject({ numero: 1, couleur: 0x38bdf8, titre: "Plaine du Nord", droite: "prise à 50,0 %" });
    expect(e.lignes).toEqual(["Pour GAL · 8 pixels, dont 4 déjà à l'alliance", "Aux autres clans : 4 pixels (RU 4), soit au moins 8 000 troupes."]);
    expect(c.zones!.regles).toBe("1 000 troupes par pixel neutre, au moins 2 000 par pixel d'un autre clan, selon les règles du jeu lues le 5 nov. 2026.");
    expect(c.legendeNotes).toEqual([`Troupes déclarées par notre alliance : 1 500 000, par 1 clan sur 3. Déclarées le ${dateDeCapture("2026-11-13T12:00:00Z", "fr")}.`]);
    expect(c.cadre).toBe("Morceau de carte : x de 0 à 8, y de 0 à 4");
    expect(c.alt).toContain("1 zone dans l'image");
  });

  it("n'écrit ni zones ni règles quand le joueur les retire de la capture", () => {
    const c = contenuDeLaCapture({ ...base, zones: null });
    expect(c.zones).toBeNull();
    expect(c.alt).not.toContain("zone");
  });

  it("ne compte pas comme zéro des troupes que personne n'a déclarées", () => {
    expect(contenuDeLaCapture({ ...base, troupes: { total: 0, declares: 0, clans: 3, plusAncienne: null } }).legendeNotes).toEqual([]);
    expect(contenuDeLaCapture({ ...base, troupes: null }).legendeNotes).toEqual([]);
  });

  it("laisse hors de l'image une zone qui n'y est pas", () => {
    // Une vue serrée sur la mer, à l'ouest : la zone, à l'est, n'y est pas.
    const c = contenuDeLaCapture({ ...base, vue: { x: 1, y: 2, s: 600 } });
    expect(c.zones?.entrees).toEqual([]);
  });

  it("porte sur l'image le crédit du fond de carte, sa licence et les mêmes adresses que l'image /carte du robot", () => {
    for (const langue of ["fr", "en"] as const) {
      const c = contenuDeLaCapture({ ...base, langue });
      expect(c.credit).toContain("© OpenFront and Contributors");
      expect(c.credit).toContain("CC BY-SA 4.0");
      expect(c.sources).toBe(MAP_SOURCES);
    }
    expect(SOURCES_CAPTURE).toBe(MAP_SOURCES);
  });

  it("a les mêmes textes en français et en anglais", () => {
    expect(Object.keys(TEXTES_CAPTURE.en).sort()).toEqual(Object.keys(TEXTES_CAPTURE.fr).sort());
    const c = contenuDeLaCapture({ ...base, langue: "en" });
    expect(c.titre).toBe("Alliance map");
    expect(c.zones!.entrees[0]!.lignes[0]).toBe("For GAL · 8 pixels, 4 already ours");
  });
});

describe("la légende de l'image", () => {
  const pixels = (n: number) => `${n} pixels`;
  const standings = [
    { tag: "GAL", pixels: 100 },
    { tag: "FR", pixels: 40 },
    { tag: "FR", pixels: 2 },
    { tag: null, pixels: 9 },
  ];
  const base = {
    couleursClans: new Map([
      ["GAL", 0x38bdf8],
      ["FR", 0x4ade80],
      ["LUX", 0xfb923c],
    ]),
    totaux: [
      { name: "Les Irréductibles", color: 0x38bdf8, pixels: 142 },
      { name: "Pacte de l'Est", color: 0xfb923c, pixels: 80 },
    ],
    standings,
    touteLAlliance: "Toute l'alliance",
    pixels,
  };
  const fenetreClans = [
    { couleur: 0x38bdf8, nom: "GAL" },
    { couleur: 0x4ade80, nom: "FR" },
    { couleur: 0xfb923c, nom: "LUX" },
    { couleur: 0xf1f5f9, nom: "Toute l'alliance" },
    { couleur: 0x4b5570, nom: "Autres clans" },
  ];

  it("écrit les pixels de chaque clan au dernier relevé, et rien pour les couleurs qui ne sont pas un clan", () => {
    expect(legendeDeCapture({ ...base, legende: fenetreClans, mode: "clans", avecZones: true })).toEqual([
      { couleur: 0x38bdf8, texte: "GAL", detail: "100 pixels" },
      // Un tag porté par deux clans de la carte compte les deux, comme les totaux des alliances.
      { couleur: 0x4ade80, texte: "FR", detail: "42 pixels" },
      // Un clan de notre alliance absent de la carte au dernier relevé : 0, il est bien compté.
      { couleur: 0xfb923c, texte: "LUX", detail: "0 pixels" },
      { couleur: 0xf1f5f9, texte: "Toute l'alliance", detail: "" },
      { couleur: 0x4b5570, texte: "Autres clans", detail: "" },
    ]);
  });

  it("écrit le territoire de chaque alliance, et rien pour une ligne qu'elle ne sait pas attribuer", () => {
    const legende = [
      { couleur: 0x38bdf8, nom: "Les Irréductibles" },
      { couleur: 0xfb923c, nom: "Pacte de l'Est" },
      // Même nom, autre couleur : ce n'est pas l'alliance comptée.
      { couleur: 0xa78bfa, nom: "Les Irréductibles" },
      { couleur: 0x4b5570, nom: "Autres clans" },
    ];
    expect(legendeDeCapture({ ...base, legende, mode: "alliances", avecZones: true }).map((l) => l.detail)).toEqual(["142 pixels", "80 pixels", "", ""]);
    // Deux alliances du même nom et de la même couleur : pas de chiffre.
    const doubles = { ...base, totaux: [...base.totaux, { name: "Les Irréductibles", color: 0x38bdf8, pixels: 5 }] };
    expect(legendeDeCapture({ ...doubles, legende, mode: "alliances", avecZones: true })[0]!.detail).toBe("");
  });

  it("en « Tout », donne ses pixels à chaque clan nommé par son tag, quelle que soit sa couleur du jeu, et rien à la terre neutre", () => {
    const tout = [
      { couleur: 0x123456, nom: "GAL" },
      { couleur: 0x654321, nom: "LUX" },
      { couleur: 0x3f4441, nom: "Terre neutre" },
    ];
    const lignes = legendeDeCapture({ ...base, legende: tout, mode: "tout", avecZones: true });
    expect(lignes.map((l) => l.texte)).toEqual(["GAL", "LUX", "Terre neutre"]);
    expect(lignes[2]!.detail).toBe("");
    expect(lignes[0]!.detail).not.toBe("");
  });

  it("n'écrit pas « Toute l'alliance » sans les zones, et ne confond pas un clan nommé ainsi", () => {
    const sans = legendeDeCapture({ ...base, legende: fenetreClans, mode: "clans", avecZones: false });
    expect(sans.map((l) => l.texte)).toEqual(["GAL", "FR", "LUX", "Autres clans"]);
  });

  it("garde douze couleurs au plus dans l'image, toujours la dernière, et dit combien restent dans la fenêtre", () => {
    const longue = Array.from({ length: 15 }, (_, i) => ({ couleur: i, texte: `C${i}`, detail: "" }));
    const monde = { width: 8, height: 4 };
    const c = contenuDeLaCapture({
      langue: "fr",
      nombre: String,
      pct: String,
      vue: { x: 4, y: 2, s: 100 },
      monde,
      releve: "2026-11-13T07:53:38Z",
      maintenant: new Date("2026-11-13T14:05:00Z"),
      notreAlliance: null,
      legende: longue,
      troupes: { total: 10, declares: 2, clans: 3, plusAncienne: "2026-11-12T09:00:00Z" },
      zones: null,
      bilans: new Map(),
      adresse: "les-gaulois.github.io/carte",
    });
    expect(c.legende).toHaveLength(LEGENDE_MAX);
    expect(c.legende.at(-1)!.texte).toBe("C14");
    expect(c.legendeNotes[0]).toBe("Et 3 autres couleurs, écrites dans la fenêtre Alliance.");
    // Plusieurs clans ont déclaré : la date est celle de la plus ancienne déclaration.
    expect(c.legendeNotes[1]).toBe(`Troupes déclarées par notre alliance : 10, par 2 clans sur 3. La plus ancienne déclaration date du ${dateDeCapture("2026-11-12T09:00:00Z", "fr")}.`);
  });
});
