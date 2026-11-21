import { describe, expect, it } from "vitest";
import { paquetDuBooster } from "../../src/lib/jeu/boosters-dessins";
import {
  BORDS_DE_LA_PLACE,
  RARETES_DU_PASS,
  boosterDuPass,
  cocheDeMission,
  dalleDuPalier,
  etendardDuDefi,
  jourDuCalendrier,
  paveDeLaRoute,
  placeDuCreuset,
  plusDuCreuset,
  sceauDuPalier,
} from "../../src/lib/jeu/pass-forge";
import type { Planche } from "../../src/lib/jeu/planche";

const taille = (p: Planche): [number, number] => [p.width, p.height];
const pareil = (a: Planche, b: Planche): boolean => a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i]);
const hex = (p: Planche, x: number, y: number): string | null => {
  const c = p.couleur(x, y);
  return c ? `#${[c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}` : null;
};
/** Les couleurs d'un rectangle de la planche. */
const couleurs = (p: Planche, x0: number, y0: number, x1: number, y1: number): Set<string | null> => {
  const vues = new Set<string | null>();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) vues.add(hex(p, x, y));
  return vues;
};

describe("le booster d'un palier du pass", () => {
  const surprise = paquetDuBooster("surprise");

  it("fait 60 cases sur 88 pour les six raretés, et garde la silhouette du booster surprise", () => {
    expect(RARETES_DU_PASS).toHaveLength(6);
    for (const rarete of RARETES_DU_PASS) {
      const b = boosterDuPass(rarete);
      expect(taille(b)).toEqual([60, 88]);
      for (let y = 0; y < 88; y++) for (let x = 0; x < 60; x++) expect(b.pleine(x, y), `${rarete} ${x},${y}`).toBe(surprise.pleine(x, y));
    }
  });

  it("garde les deux sertis et le bord d'encre du corps", () => {
    for (const rarete of RARETES_DU_PASS) {
      const b = boosterDuPass(rarete);
      for (let x = 0; x < 60; x++) for (const y of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87]) expect(hex(b, x, y)).toBe(hex(surprise, x, y));
      for (let y = 10; y < 78; y++) {
        expect(hex(b, 2, y)).toBe("#070b1f");
        expect(hex(b, 57, y)).toBe("#070b1f");
      }
    }
  });

  it("laisse le haut du corps aussi uni que celui du booster surprise", () => {
    for (const rarete of RARETES_DU_PASS) {
      const b = boosterDuPass(rarete);
      // Deux cases de même teinte dans le surprise restent de même teinte : rien n'est dessiné là où viennent les fissures.
      const vers = new Map<string | null, string | null>();
      for (let y = 10; y <= 27; y++)
        for (let x = 0; x < 60; x++) {
          const de = hex(surprise, x, y);
          const a = hex(b, x, y);
          if (!vers.has(de)) vers.set(de, a);
          expect(a, `${rarete} ${x},${y}`).toBe(vers.get(de));
        }
      expect(couleurs(b, 22, 14, 40, 27).size).toBe(1);
    }
  });

  it("change de robe à chaque rareté, sans toucher au booster surprise", () => {
    const robes = RARETES_DU_PASS.map((r) => hex(boosterDuPass(r), 30, 20));
    expect(new Set(robes).size).toBe(6);
    expect(robes).not.toContain(hex(surprise, 30, 20));
    expect(hex(paquetDuBooster("surprise"), 30, 20)).toBe("#3f7dff");
  });
});

describe("les pièces du pass", () => {
  it("donne une page de calendrier de la même taille dans ses cinq états", () => {
    for (const etat of ["fait", "vide", "aujourdhui", "cadeau", "cadeau-fait"] as const) for (const n of [1, 7, 12]) expect(taille(jourDuCalendrier(n, etat))).toEqual([18, 21]);
    expect(pareil(jourDuCalendrier(3, "vide"), jourDuCalendrier(4, "vide"))).toBe(false);
    expect(pareil(jourDuCalendrier(3, "vide"), jourDuCalendrier(3, "aujourdhui"))).toBe(false);
    expect(pareil(jourDuCalendrier(7, "cadeau"), jourDuCalendrier(7, "cadeau-fait"))).toBe(false);
  });

  it("remplit l'étendard d'or de bas en haut", () => {
    const or = (p: Planche): number => {
      let n = 0;
      for (let y = 14; y < 48; y++) for (let x = 9; x < 35; x++) if (hex(p, x, y) === "#ffc61a") n++;
      return n;
    };
    const parts = [0, 0.25, 0.5, 0.75, 1].map((part) => etendardDuDefi(part, false));
    for (const p of parts) expect(taille(p)).toEqual([40, 56]);
    expect(or(parts[0]!)).toBe(0);
    for (let i = 1; i < parts.length; i++) expect(or(parts[i]!)).toBeGreaterThan(or(parts[i - 1]!));
    // Une part hors de 0 à 1 ne déborde pas ; « rempli » vaut tout l'or, avec ses éclats.
    expect(pareil(etendardDuDefi(3, false), parts[4]!)).toBe(true);
    expect(pareil(etendardDuDefi(-1, false), parts[0]!)).toBe(true);
    expect(pareil(etendardDuDefi(Number.NaN, false), parts[0]!)).toBe(true);
    expect(pareil(etendardDuDefi(0.2, true), etendardDuDefi(1, true))).toBe(true);
    expect(pareil(etendardDuDefi(1, true), parts[4]!)).toBe(false);
  });

  it("donne un sceau, une coche et une route à leur taille", () => {
    expect(taille(sceauDuPalier())).toEqual([15, 15]);
    expect(taille(cocheDeMission(true))).toEqual([9, 9]);
    expect(taille(cocheDeMission(false))).toEqual([9, 9]);
    expect(pareil(cocheDeMission(true), cocheDeMission(false))).toBe(false);
    for (const dore of [true, false]) {
      const p = paveDeLaRoute(dore);
      expect(taille(p)).toEqual([24, 13]);
      // Pleine partout, l'encre en haut, au milieu et en bas : la tuile se répète sans trou.
      for (let x = 0; x < 24; x++) {
        for (let y = 0; y < 13; y++) expect(p.pleine(x, y)).toBe(true);
        for (const y of [0, 6, 12]) expect(hex(p, x, y)).toBe("#070b1f");
      }
      // Sans couture : les pavés reviennent tous les six, la rangée du bas décalée de trois.
      for (let x = 0; x < 24; x++) expect(hex(p, x, 1)).toBe(hex(p, (x + 6) % 24, 1));
      expect(hex(p, 5, 3)).toBe("#070b1f");
      expect(hex(p, 2, 9)).toBe("#070b1f");
    }
    expect(pareil(paveDeLaRoute(true), paveDeLaRoute(false))).toBe(false);
  });

  it("écrit « 30 » dans la dalle sans toucher son bord", () => {
    for (const etat of ["dore", "gris", "a-prendre"] as const)
      for (const jalon of [false, true]) {
        const vide = dalleDuPalier(1, etat, jalon);
        const trente = dalleDuPalier(30, etat, jalon);
        expect(taille(trente)).toEqual([17, 13]);
        expect(taille(vide)).toEqual([17, 13]);
        expect(pareil(vide, trente)).toBe(false);
        // Le numéro tient dans les colonnes 3 à 13 et les rangées 3 à 10 : le tour de la dalle ne change pas.
        for (let y = 0; y < 13; y++) for (let x = 0; x < 17; x++) if (x < 3 || x > 13 || y < 3 || y > 10) expect(hex(trente, x, y), `${etat} ${x},${y}`).toBe(hex(vide, x, y));
      }
    expect(pareil(dalleDuPalier(10, "gris", true), dalleDuPalier(10, "gris", false))).toBe(false);
    expect(pareil(dalleDuPalier(250, "dore", false), dalleDuPalier(99, "dore", false))).toBe(true);
  });
});

describe("le creuset de la fusion", () => {
  it("donne une place en neuf parts, au centre uni, dans les deux thèmes", () => {
    expect(BORDS_DE_LA_PLACE).toEqual([4, 4, 4, 4]);
    for (const theme of ["clair", "sombre"] as const) {
      const p = placeDuCreuset(theme);
      expect(taille(p)).toEqual([16, 16]);
      expect(couleurs(p, 4, 4, 11, 11).size).toBe(1);
      expect(taille(plusDuCreuset(theme))).toEqual([7, 7]);
    }
    expect(pareil(placeDuCreuset("clair"), placeDuCreuset("sombre"))).toBe(false);
    expect(pareil(plusDuCreuset("clair"), plusDuCreuset("sombre"))).toBe(false);
  });
});

describe("les dessins du pass et de la forge", () => {
  it("sont les mêmes d'un appel à l'autre", () => {
    const tous = (): Planche[] => [
      ...RARETES_DU_PASS.map((r) => boosterDuPass(r)),
      jourDuCalendrier(5, "aujourdhui"),
      jourDuCalendrier(7, "cadeau"),
      etendardDuDefi(0.72, false),
      etendardDuDefi(1, true),
      sceauDuPalier(),
      paveDeLaRoute(true),
      dalleDuPalier(30, "a-prendre", true),
      cocheDeMission(true),
      placeDuCreuset("sombre"),
      plusDuCreuset("clair"),
    ];
    const a = tous();
    const b = tous();
    a.forEach((p, i) => expect(pareil(p, b[i]!)).toBe(true));
    // Chaque appel rend sa propre planche : en changer une ne change pas la suivante.
    a[0]!.data.fill(0);
    expect(pareil(boosterDuPass("commun"), b[0]!)).toBe(true);
  });
});
