import { describe, expect, it } from "vitest";
import { paletteDuDehors } from "../../src/lib/village/decor";
import { SOLEIL_PAR_MOIS, cielDuVillage, cleDeLumiere, couleurDuDedans, couleurDuDehors, instantDeParis, lumiereDuVillage, melanger, rechauffer, soleilDuJour } from "../../src/lib/village/lumiere";

/** Une heure de Paris un jour d'hiver (UTC+1) ou d'été (UTC+2). */
const hiver = (jour: string, heure: string) => new Date(`${jour}T${heure}:00+01:00`);
const ete = (jour: string, heure: string) => new Date(`${jour}T${heure}:00+02:00`);
const canaux = (couleur: string) => [1, 3, 5].map((i) => parseInt(couleur.slice(i, i + 2), 16));

describe("l'heure de Paris", () => {
  it("lit le jour, l'heure et les minutes à Paris, heure d'été comprise", () => {
    expect(instantDeParis(new Date("2026-11-13T20:38:30Z"))).toMatchObject({ mois: 11, jour: 13, heure: 21, minute: 38, minutes: 21 * 60 + 38.5, ete: false });
    expect(instantDeParis(new Date("2026-07-01T22:30:00Z"))).toMatchObject({ mois: 7, jour: 2, heure: 0, minute: 30, ete: true });
  });
});

describe("le lever et le coucher du soleil", () => {
  it("a douze lignes, le jour le plus long en juin, le plus court en décembre", () => {
    expect(SOLEIL_PAR_MOIS).toHaveLength(12);
    const durees = SOLEIL_PAR_MOIS.map(([lever, coucher]) => coucher - lever);
    expect(durees.indexOf(Math.max(...durees))).toBe(5);
    expect(durees.indexOf(Math.min(...durees))).toBe(11);
    for (const [lever, coucher] of SOLEIL_PAR_MOIS) expect(lever).toBeLessThan(coucher);
  });

  it("donne les heures du tableau au 15 du mois, une heure de plus en heure d'été", () => {
    expect(soleilDuJour({ mois: 11, jour: 15, ete: false })).toEqual({ lever: 7 * 60 + 59, coucher: 17 * 60 + 10 });
    expect(soleilDuJour({ mois: 6, jour: 15, ete: true })).toEqual({ lever: 5 * 60 + 47, coucher: 21 * 60 + 55 });
  });

  it("glisse de jour en jour entre deux lignes, de décembre à janvier aussi", () => {
    const debut = soleilDuJour({ mois: 12, jour: 31, ete: false });
    expect(debut.lever).toBeGreaterThan(8 * 60 + 36);
    expect(debut.lever).toBeLessThan(8 * 60 + 39);
    const d1 = soleilDuJour({ mois: 3, jour: 1, ete: false });
    const d2 = soleilDuJour({ mois: 3, jour: 2, ete: false });
    expect(d1.lever - d2.lever).toBeGreaterThan(0);
    expect(d1.lever - d2.lever).toBeLessThan(3);
  });
});

describe("la lumière du village", () => {
  it("passe par la nuit, l'aube, le jour et le crépuscule", () => {
    expect(lumiereDuVillage(hiver("2026-11-13", "03:00"))).toMatchObject({ phase: "nuit", jour: 0, rougeur: 0 });
    expect(lumiereDuVillage(hiver("2026-11-13", "07:50")).phase).toBe("aube");
    expect(lumiereDuVillage(hiver("2026-11-13", "12:30"))).toMatchObject({ phase: "jour", jour: 1, rougeur: 0 });
    expect(lumiereDuVillage(hiver("2026-11-13", "17:14")).phase).toBe("crepuscule");
    expect(lumiereDuVillage(hiver("2026-11-13", "21:00")).phase).toBe("nuit");
    const aube = lumiereDuVillage(hiver("2026-11-13", "07:50"));
    expect(aube.jour).toBeGreaterThan(0.2);
    expect(aube.jour).toBeLessThan(0.9);
    expect(aube.rougeur).toBeGreaterThan(0.8);
  });

  it("suit la saison : à 21 heures il fait jour en juin, nuit en novembre", () => {
    expect(lumiereDuVillage(ete("2026-06-21", "21:00")).phase).toBe("jour");
    expect(lumiereDuVillage(hiver("2026-11-13", "21:00")).jour).toBe(0);
    expect(lumiereDuVillage(ete("2026-06-21", "05:30")).phase).toBe("aube");
  });

  it("montre le soleil le jour, la lune la nuit, bas près de l'horizon au lever et au coucher", () => {
    const midi = lumiereDuVillage(hiver("2026-11-13", "12:30")).astre;
    expect(midi?.sorte).toBe("soleil");
    expect(midi?.hauteur).toBeGreaterThan(0.95);
    const minuit = lumiereDuVillage(hiver("2026-11-13", "00:30")).astre;
    expect(minuit?.sorte).toBe("lune");
    expect(minuit?.hauteur).toBeGreaterThan(0.8);
    expect(lumiereDuVillage(hiver("2026-11-13", "08:05")).astre).toMatchObject({ sorte: "soleil" });
    expect(lumiereDuVillage(hiver("2026-11-13", "08:05")).astre?.hauteur).toBeLessThan(0.1);
  });

  it("ne fait jamais de saut : d'une minute à l'autre, aucune couleur ne bouge de plus de quelques crans", () => {
    for (const jour of ["2026-11-13", "2026-06-21", "2026-03-29"]) {
      let avant: string[] | null = null;
      let pire = 0;
      for (let minute = 0; minute < 1440; minute++) {
        const l = lumiereDuVillage(new Date(Date.parse(`${jour}T00:00:00Z`) + minute * 60_000));
        const p = paletteDuDehors(l);
        const couleurs = [...cielDuVillage(l), p.herbe.fond, p.chaume.fond, p.foret.loin, p.bois.fond, couleurDuDedans("#7a5232", l)];
        if (avant) couleurs.forEach((c, i) => canaux(c).forEach((v, k) => (pire = Math.max(pire, Math.abs(v - canaux(avant![i]!)[k]!)))));
        avant = couleurs;
      }
      expect(pire).toBeLessThanOrEqual(8);
    }
  });

  it("garde la même clé tant que rien ne change à l'œil", () => {
    const a = lumiereDuVillage(hiver("2026-11-13", "13:00"));
    const b = lumiereDuVillage(new Date(hiver("2026-11-13", "13:00").getTime() + 20_000));
    expect(cleDeLumiere(a, 200)).toBe(cleDeLumiere(b, 200));
    expect(cleDeLumiere(a, 200)).not.toBe(cleDeLumiere(lumiereDuVillage(hiver("2026-11-13", "17:14")), 200));
  });
});

describe("les couleurs", () => {
  it("mélange, réchauffe et teinte sans sortir de « #rrggbb »", () => {
    expect(melanger("#000000", "#ffffff", 0)).toBe("#000000");
    expect(melanger("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(melanger("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(rechauffer("#808080", 0)).toBe("#808080");
    const chaud = canaux(rechauffer("#808080", 1));
    expect(chaud[0]).toBeGreaterThan(128);
    expect(chaud[2]).toBeLessThan(128);
    const nuit = lumiereDuVillage(hiver("2026-11-13", "03:00"));
    const jour = lumiereDuVillage(hiver("2026-11-13", "12:30"));
    expect(couleurDuDehors("#3f8a3c", "#1f4a2c", nuit)).toBe("#1f4a2c");
    expect(couleurDuDehors("#3f8a3c", "#1f4a2c", jour)).toBe("#3f8a3c");
    expect(couleurDuDedans("#7a5232", jour)).toBe("#7a5232");
    expect(couleurDuDedans("#7a5232", nuit)).toMatch(/^#[0-9a-f]{6}$/);
    expect(cielDuVillage(nuit)).toEqual(["#0a1230", "#0c1638", "#0f1b42", "#12214c", "#162857"]);
  });
});
