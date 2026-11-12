import { describe, expect, it } from "vitest";
import { HOLO, OEIL, decalageTranche, distanceAuBord, eclat, eclatTranche, flanc, flaner, nuageDe, oeilLibre, orienter, placer, projectionDe, projeter, projeterPoint, reculTranche, regard, reliefDe, tourComplet, viser } from "../../src/lib/fx/holo";
import { logoMatriceDepuisImage } from "../../src/lib/logo-matrice-image";

/** Un logo d'essai : un anneau, et un disque plein en son centre. */
const COTE = 41;
const MILIEU = COTE / 2;
const essai = new Uint8Array(COTE * COTE);
for (let y = 0; y < COTE; y++) {
  for (let x = 0; x < COTE; x++) {
    const d = Math.hypot(x + 0.5 - MILIEU, y + 0.5 - MILIEU);
    if ((d >= 18 && d <= 20) || d <= 10) essai[y * COTE + x] = 1;
  }
}
const caseDe = (x: number, y: number): number => y * COTE + x;
const pleines = [...essai.keys()].filter((i) => essai[i]);
const relief = reliefDe(essai, COTE, COTE);
const nuage = nuageDe(pleines, relief, COTE);
/** Le rang, dans le nuage, de la case (x, y). */
const rang = (x: number, y: number): number => pleines.indexOf(caseDe(x, y));
const vue = (pose: { lacet?: number; tangage?: number; roulis?: number }) => {
  const sortie = projectionDe(nuage.n);
  projeter(nuage, orienter({ lacet: 0, tangage: 0, roulis: 0, ...pose }), sortie);
  return sortie;
};

describe("le relief du guerrier", () => {
  it("mesure la distance de chaque case pleine au bord de sa forme", () => {
    const plein = new Uint8Array(81);
    for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) plein[y * 9 + x] = 1;
    const d = distanceAuBord(plein, 9, 9);
    expect(d[4 * 9 + 4]).toBe(3);
    expect(d[2 * 9 + 2]).toBe(1);
    expect(d[3 * 9 + 4]).toBe(2);
    expect(d[0]).toBe(0);
    // Le dehors de la grille compte comme vide.
    expect(distanceAuBord(new Uint8Array([1, 1, 1, 1]), 2, 2)).toEqual(new Float32Array([1, 1, 1, 1]));
  });

  it("laisse l'anneau au fond, fait sortir le centre, et ne donne aucune profondeur au vide", () => {
    const centre = relief[caseDe(20, 20)] ?? 0;
    expect(centre).toBeGreaterThan(HOLO.hauteur * 0.95);
    expect(centre).toBeLessThanOrEqual(HOLO.hauteur + HOLO.gonfle + 1e-6);
    // L'anneau n'a que son bombé : il reste à plat, au fond.
    for (const [x, y] of [[20, 0], [0, 20], [40, 20], [20, 40]] as const) {
      expect(relief[caseDe(x, y)]).toBeGreaterThan(0);
      expect(relief[caseDe(x, y)]).toBeLessThanOrEqual(HOLO.gonfle + 1e-6);
    }
    // Du centre vers le bord du disque, le relief ne remonte jamais.
    const rayon = [20, 22, 24, 26, 28, 30].map((x) => relief[caseDe(x, 20)] ?? 0);
    expect(rayon).toEqual([...rayon].sort((a, b) => b - a));
    expect(relief[caseDe(14, 0)]).toBe(0);
    expect(Math.max(...relief)).toBeLessThanOrEqual(HOLO.hauteur + HOLO.gonfle + 1e-6);
    expect(reliefDe(new Uint8Array(16), 4, 4)).toEqual(new Float32Array(16));
  });

  it("au repos, retombe exactement sur le dessin à plat : le logo n'est pas déformé de face", () => {
    const repos = vue({});
    pleines.forEach((c, i) => {
      expect(repos.x[i]).toBeCloseTo(((c % COTE) + 0.5) / COTE - 0.5, 5);
      expect(repos.y[i]).toBeCloseTo((Math.floor(c / COTE) + 0.5) / COTE - 0.5, 5);
      expect(repos.echelle[i]).toBeCloseTo(1, 5);
      expect(repos.avance[i]).toBeCloseTo(0, 5);
    });
    // Un point à la profondeur de l'axe ne bouge pas quand on le place.
    expect(placer(0.75, 0.25, HOLO.pivot)).toEqual([0.25, -0.25, 0]);
  });

  it("tourné vers la droite, le centre glisse à droite, le bord droit s'éloigne et le bord gauche approche", () => {
    const repos = vue({});
    const droite = vue({ lacet: 0.4 });
    const centre = rang(20, 20);
    const bordDroit = rang(40, 20);
    const bordGauche = rang(0, 20);
    expect(droite.x[centre]).toBeGreaterThan((repos.x[centre] ?? 0) + 0.03);
    expect(droite.avance[bordDroit]).toBeLessThan(-0.1);
    expect(droite.echelle[bordDroit]).toBeLessThan(1);
    expect(droite.avance[bordGauche]).toBeGreaterThan(0.1);
    expect(droite.echelle[bordGauche]).toBeGreaterThan(1);
    // Et l'inverse vers la gauche.
    expect(vue({ lacet: -0.4 }).x[centre]).toBeLessThan((repos.x[centre] ?? 0) - 0.03);
  });

  it("tourné vers le haut, le centre monte et le bord haut s'éloigne ; le roulis fait descendre le nez", () => {
    const repos = vue({});
    const haut = vue({ tangage: 0.3 });
    const centre = rang(20, 20);
    expect(haut.y[centre]).toBeLessThan((repos.y[centre] ?? 0) - 0.02);
    expect(haut.avance[rang(20, 0)]).toBeLessThan(-0.05);
    expect(haut.avance[rang(20, 40)]).toBeGreaterThan(0.05);
    // Le guerrier regarde vers la droite : un roulis positif baisse ce qui est à droite.
    const penche = vue({ roulis: 0.2 });
    expect(penche.y[rang(40, 20)]).toBeGreaterThan((repos.y[rang(40, 20)] ?? 0) + 0.05);
    expect(penche.avance[rang(40, 20)]).toBeCloseTo(0, 5);
  });

  it("garde les distances : la rotation ne déforme pas le nuage", () => {
    const m = orienter({ lacet: 0.5, tangage: -0.3, roulis: 0.2 });
    const lignes = [0, 3, 6].map((i) => [m[i] ?? 0, m[i + 1] ?? 0, m[i + 2] ?? 0] as const);
    for (const [a, b, c] of lignes) expect(Math.hypot(a, b, c)).toBeCloseTo(1, 5);
    const produit = (p: readonly number[], q: readonly number[]) => p.reduce((s, v, i) => s + v * (q[i] ?? 0), 0);
    expect(produit(lignes[0]!, lignes[1]!)).toBeCloseTo(0, 5);
    expect(produit(lignes[0]!, lignes[2]!)).toBeCloseTo(0, 5);
    expect(produit(lignes[1]!, lignes[2]!)).toBeCloseTo(0, 5);
    // Sans angle, rien ne tourne (« + 0 » : un zéro négatif reste un zéro).
    expect([...orienter({ lacet: 0, tangage: 0, roulis: 0 })].map((v) => v + 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // Un point seul se projette comme dans le nuage.
    const sortie = vue({ lacet: 0.5, tangage: -0.3, roulis: 0.2 });
    const [x, y, echelle, avance] = projeterPoint(nuage.x[7] ?? 0, nuage.y[7] ?? 0, nuage.z[7] ?? 0, m);
    expect(x).toBeCloseTo(sortie.x[7] ?? 0, 5);
    expect(y).toBeCloseTo(sortie.y[7] ?? 0, 5);
    expect(echelle).toBeCloseTo(sortie.echelle[7] ?? 0, 5);
    expect(avance).toBeCloseTo(sortie.avance[7] ?? 0, 5);
  });

  it("pâlit ce qui s'éloigne, jamais ce qui approche ni ce qui est au repos", () => {
    expect(eclat(0)).toBe(1);
    expect(eclat(0.2)).toBe(1);
    expect(eclat(-0.1)).toBeLessThan(1);
    expect(eclat(-0.1)).toBeGreaterThan(eclat(-0.2));
    expect(eclat(-5)).toBe(HOLO.pale);
  });

  it("donne une épaisseur aux caractères : des tranches derrière la face, cachées de face", () => {
    expect(reculTranche(HOLO.tranches)).toBeCloseTo(HOLO.epaisseur, 9);
    expect(reculTranche(1)).toBeCloseTo(HOLO.epaisseur / HOLO.tranches, 9);
    // De face, une tranche est exactement derrière son caractère : aucun décalage.
    const repos = orienter({ lacet: 0, tangage: 0, roulis: 0 });
    for (let k = 1; k <= HOLO.tranches; k++) for (const d of decalageTranche(repos, k)) expect(d).toBeCloseTo(0, 9);
    const fond = nuageDe(pleines, relief, COTE, HOLO.epaisseur);
    const aPlat = projectionDe(fond.n);
    projeter(fond, repos, aPlat);
    pleines.forEach((c, i) => expect(aPlat.x[i]).toBeCloseTo(((c % COTE) + 0.5) / COTE - 0.5, 5));
    // Tourné vers la droite, on voit le flanc à gauche de chaque caractère ; vers le haut, en dessous.
    expect(decalageTranche(orienter({ lacet: 0.4, tangage: 0, roulis: 0 }), HOLO.tranches)[0]).toBeLessThan(-HOLO.epaisseur * 0.3);
    expect(decalageTranche(orienter({ lacet: 0, tangage: 0.4, roulis: 0 }), HOLO.tranches)[1]).toBeGreaterThan(HOLO.epaisseur * 0.3);
  });

  it("recopie la face décalée au lieu de redessiner chaque tranche : l'écart reste sous les trois quarts de pixel", () => {
    // Sur un logo de 512 px, le plus grand de l'accueil. Toutes les poses extrêmes, et celles d'entre deux.
    const BORNE = 0.75 / 512;
    let pire = 0;
    for (const lacet of [-1, -0.5, 0, 0.5, 1]) {
      for (const tangage of [-1, 0, 1]) {
        for (const roulis of [-1, 0, 1]) {
          const m = orienter({ lacet: lacet * HOLO.lacetMax, tangage: tangage * HOLO.tangageMax, roulis: roulis * HOLO.roulisMax });
          const devant = projectionDe(nuage.n);
          projeter(nuage, m, devant);
          for (let k = 1; k <= HOLO.tranches; k++) {
            const tranche = nuageDe(pleines, relief, COTE, reculTranche(k));
            const derriere = projectionDe(tranche.n);
            projeter(tranche, m, derriere);
            const [dx, dy] = decalageTranche(m, k);
            for (let i = 0; i < nuage.n; i++) pire = Math.max(pire, Math.hypot((derriere.x[i] ?? 0) - (devant.x[i] ?? 0) - dx, (derriere.y[i] ?? 0) - (devant.y[i] ?? 0) - dy));
          }
        }
      }
    }
    expect(pire).toBeLessThan(BORNE);
    // Et la recopie n'est pas un décalage nul : la dernière tranche est bien à plus d'un pixel de la face.
    expect(Math.hypot(...decalageTranche(orienter({ lacet: HOLO.lacetMax, tangage: 0, roulis: 0 }), HOLO.tranches)) * 512).toBeGreaterThan(1);
  });

  it("ne dessine un flanc que s'il se voit : rien de face, ni sur un petit logo qui tourne peu", () => {
    const face = orienter({ lacet: 0, tangage: 0, roulis: 0 });
    expect(flanc(face, 450)).toBe(0);
    // La flânerie d'un téléphone, au plus fort (10° sur un logo de 224 px) : un demi-pixel de flanc, donc rien.
    expect(flanc(orienter(flaner(17 / 4)), 224)).toBe(0);
    expect(flanc(orienter({ lacet: (10 * Math.PI) / 180, tangage: 0, roulis: 0 }), 224)).toBe(0);
    expect(flanc(orienter({ lacet: (10 * Math.PI) / 180, tangage: 0, roulis: 0 }), 450)).toBeGreaterThan(0);
    expect(flanc(orienter({ lacet: (25 * Math.PI) / 180, tangage: 0, roulis: 0 }), 450)).toBe(1);
    // Le tangage compte autant que le lacet, et le roulis, qui tourne le logo dans son plan, ne montre aucun flanc.
    expect(flanc(orienter({ lacet: 0, tangage: 0.3, roulis: 0 }), 450)).toBeCloseTo(flanc(orienter({ lacet: 0.3, tangage: 0, roulis: 0 }), 450), 5);
    expect(flanc(orienter({ lacet: 0, tangage: 0, roulis: 0.3 }), 450)).toBe(0);
    // Les tranches s'assombrissent vers l'arrière, et restent plus sombres que la face.
    const eclats = Array.from({ length: HOLO.tranches }, (_, i) => eclatTranche(i + 1));
    expect(eclats).toEqual([...eclats].sort((a, b) => b - a));
    expect(Math.max(...eclats)).toBeLessThan(0.6);
    expect(Math.min(...eclats)).toBeGreaterThan(0);
  });
});

describe("la tête qui suit le curseur", () => {
  it("fait face au curseur : à droite, à gauche, en haut, en bas", () => {
    for (const angle of Object.values(viser(0, 0))) expect(angle).toBeCloseTo(0, 9);
    expect(viser(1, 0).lacet).toBeGreaterThan(0);
    expect(viser(-1, 0).lacet).toBeLessThan(0);
    expect(viser(0, -1).tangage).toBeGreaterThan(0);
    expect(viser(0, 1).tangage).toBeLessThan(0);
    // À la portée, la moitié du chemin.
    expect(viser(HOLO.portee, 0).lacet).toBeCloseTo(HOLO.lacetMax / 2, 6);
  });

  it("tourne de plus en plus, sans jamais dépasser ses limites", () => {
    const lacets = [0.1, 0.5, 1, 3, 10, 1e6].map((dx) => viser(dx, 0).lacet);
    expect(lacets).toEqual([...lacets].sort((a, b) => a - b));
    for (const [dx, dy] of [[1e6, 1e6], [-1e6, -1e6], [1e6, -1e6], [-1e6, 1e6]] as const) {
      const pose = viser(dx, dy);
      expect(Math.abs(pose.lacet)).toBeLessThanOrEqual(HOLO.lacetMax);
      expect(Math.abs(pose.tangage)).toBeLessThanOrEqual(HOLO.tangageMax);
      expect(Math.abs(pose.roulis)).toBeLessThanOrEqual(HOLO.roulisMax);
    }
  });

  it("lève ou baisse le menton vers un curseur devant lui, presque pas vers un curseur dans son dos", () => {
    expect(viser(2, -1).roulis).toBeLessThan(0);
    expect(viser(2, 1).roulis).toBeGreaterThan(0);
    expect(Math.abs(viser(-50, 1).roulis)).toBeLessThan(Math.abs(viser(2, 1).roulis) / 10);
  });

  it("garde la pupille dans la fente de l'œil, du côté du curseur", () => {
    expect(regard(0, 0)).toEqual([OEIL.x, OEIL.y]);
    const [ax, ay] = OEIL.axe;
    for (const angle of [0, 0.7, 1.6, 2.4, 3.1, 4, 5, 5.9]) {
      for (const distance of [0.05, 0.5, 5, 1e6]) {
        const [u, v] = regard(Math.cos(angle) * distance, Math.sin(angle) * distance);
        const long = (u - OEIL.x) * ax + (v - OEIL.y) * ay;
        const travers = -(u - OEIL.x) * ay + (v - OEIL.y) * ax;
        expect(Math.abs(long)).toBeLessThanOrEqual(OEIL.course + 1e-9);
        expect(Math.abs(travers)).toBeLessThanOrEqual(OEIL.travers + 1e-9);
      }
    }
    // Devant lui, vers le nez ; derrière lui, vers le coin arrière de l'œil.
    expect(regard(3, 0)[0]).toBeGreaterThan(OEIL.x + OEIL.course * 0.5);
    expect(regard(-3, 0)[0]).toBeLessThan(OEIL.x - OEIL.course * 0.5);
    // De près, le regard bouge moins que de loin.
    expect(regard(0.05, 0)[0]).toBeLessThan(regard(3, 0)[0]);
  });

  it("flâne lentement et de peu quand il n'y a pas de curseur", () => {
    expect(flaner(0).lacet).toBe(0);
    for (let t = 0; t < 120; t += 0.7) {
      const pose = flaner(t);
      expect(Math.abs(pose.lacet)).toBeLessThanOrEqual((10 * Math.PI) / 180 + 1e-9);
      expect(Math.abs(pose.tangage)).toBeLessThanOrEqual((4 * Math.PI) / 180 + 1e-9);
      expect(pose.roulis).toBe(0);
      // Entre deux images (un soixantième de seconde), la tête bouge de moins d'un dixième de degré.
      expect(Math.abs(flaner(t + 1 / 60).lacet - pose.lacet)).toBeLessThan((0.1 * Math.PI) / 180);
    }
  });

  it("fait un tour complet, qui part et s'arrête en douceur", () => {
    expect(tourComplet(0)).toBe(0);
    expect(tourComplet(0.5)).toBeCloseTo(Math.PI, 6);
    expect(tourComplet(1)).toBeCloseTo(2 * Math.PI, 6);
    expect(tourComplet(-1)).toBe(0);
    expect(tourComplet(2)).toBeCloseTo(2 * Math.PI, 6);
    const pas = Array.from({ length: 51 }, (_, i) => tourComplet(i / 50));
    expect(pas).toEqual([...pas].sort((a, b) => a - b));
    // Le départ et l'arrivée sont plus lents que le milieu.
    expect((pas[1] ?? 0) - (pas[0] ?? 0)).toBeLessThan(((pas[26] ?? 0) - (pas[25] ?? 0)) / 10);
    expect((pas[50] ?? 0) - (pas[49] ?? 0)).toBeLessThan(((pas[26] ?? 0) - (pas[25] ?? 0)) / 10);
  });
});

describe("l'œil du guerrier, sur le logo du clan", () => {
  it("refuse un regard là où il n'y a pas de fente", () => {
    expect(oeilLibre(new Uint8Array(72 * 72).fill(1), 72, 72)).toBe(false);
    expect(oeilLibre(new Uint8Array(72 * 72), 72, 72)).toBe(true);
    // Une grille trop courte : l'œil serait dehors.
    expect(oeilLibre(new Uint8Array(72 * 20), 72, 20)).toBe(false);
  });

  // Si ce test échoue, le logo a changé : mesurer de nouveau la fente de l'œil (OEIL, dans src/lib/fx/holo.ts).
  it("tombe dans la fente sombre de l'œil, à la taille de l'accueil", async () => {
    const logo = await logoMatriceDepuisImage(72);
    if (!logo) return;
    const plein = new Uint8Array(logo.colonnes * logo.lignes);
    for (const suite of logo.suites) for (let i = 0; i < suite.texte.length; i++) plein[suite.y * logo.colonnes + suite.x + i] = 1;
    expect(oeilLibre(plein, logo.colonnes, logo.lignes)).toBe(true);
    // Et le visage est bien autour : du blanc au-dessus (le sourcil) et au-dessous (la joue).
    const x = Math.floor(OEIL.x * logo.colonnes);
    const y = Math.floor(OEIL.y * logo.colonnes);
    expect(plein[(y - 2) * logo.colonnes + x]).toBe(1);
    expect(plein[(y + 4) * logo.colonnes + x]).toBe(1);
    // Le relief du vrai logo : le casque sort, l'anneau reste au fond, à gauche comme à droite.
    const vrai = reliefDe(plein, logo.colonnes, logo.lignes);
    expect(vrai[33 * logo.colonnes + 45]).toBeGreaterThan(HOLO.hauteur * 0.6);
    expect(vrai[30 * logo.colonnes + 7]).toBeLessThanOrEqual(HOLO.gonfle + 1e-6);
    expect(vrai[30 * logo.colonnes + 64]).toBeLessThanOrEqual(HOLO.gonfle + 1e-6);
  });
});
