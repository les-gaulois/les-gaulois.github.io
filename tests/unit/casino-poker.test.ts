/**
 * Les règles du poker du barde (src/lib/village/casino/poker.ts) : chaque sorte de main sur les 2 598 960 donnes, le
 * rendement exact joué au mieux (jamais plus que la mise), le conseil du barde, la donne et le tirage.
 */
import { describe, expect, it } from "vitest";
import { RENDEMENT_DU_POKER, SORTES_DU_POKER, carte, conseilDuBarde, donneDuPoker, nombre, rendementAuMieux, renduDuPoker, sorteDuPoker, tirageDuPoker, type CarteDuPoker } from "../../src/lib/village/casino/poker";

const LONG = 120_000;
const c = (r: number, e: number): CarteDuPoker => ({ r, e });
/** Un hasard d'essai : les valeurs données, dans l'ordre. */
const suite = (valeurs: number[]) => (n: number): number => {
  const v = valeurs.shift();
  if (v === undefined || v < 0 || v >= n) throw new Error(`hasard d'essai ${v} hors de 0 à ${n - 1}`);
  return v;
};

describe("les sortes de main", () => {
  it("comptent sur toutes les donnes le nombre connu de chaque sorte", { timeout: LONG }, () => {
    const n = new Array<number>(SORTES_DU_POKER.length).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let x = b + 1; x < 52; x++)
          for (let d = x + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) n[sorteDuPoker([carte(a), carte(b), carte(x), carte(d), carte(e)])]!++;
    // valets ou mieux : les paires de valets, dames, rois et as, 4 rangs sur 13 des 1 098 240 paires
    expect(n).toEqual([2_062_860, 337_920, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 36, 4]);
  });

  it("reconnaissent les cas limites : as en bas et en haut, paire basse, couleur sans suite", () => {
    expect(sorteDuPoker([c(0, 1), c(12, 1), c(11, 1), c(10, 1), c(9, 1)])).toBe(9);
    expect(sorteDuPoker([c(0, 2), c(1, 2), c(2, 2), c(3, 2), c(4, 2)])).toBe(8);
    expect(sorteDuPoker([c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(4, 0)])).toBe(4);
    expect(sorteDuPoker([c(0, 0), c(12, 1), c(11, 2), c(10, 3), c(9, 0)])).toBe(4);
    // pas de suite qui tourne : roi, as, 2, 3, 4
    expect(sorteDuPoker([c(12, 0), c(0, 1), c(1, 2), c(2, 3), c(3, 0)])).toBe(0);
    expect(sorteDuPoker([c(9, 0), c(9, 1), c(2, 2), c(5, 3), c(7, 0)])).toBe(0);
    expect(sorteDuPoker([c(10, 0), c(10, 1), c(2, 2), c(5, 3), c(7, 0)])).toBe(1);
    expect(sorteDuPoker([c(0, 3), c(0, 1), c(2, 2), c(5, 3), c(7, 0)])).toBe(1);
    expect(sorteDuPoker([c(1, 3), c(5, 3), c(7, 3), c(9, 3), c(12, 3)])).toBe(5);
    expect(renduDuPoker([c(0, 1), c(12, 1), c(11, 1), c(10, 1), c(9, 1)], 200)).toBe(50_000);
  });

  it("paient des fois entiers, de la plus faible à la plus forte, et un gain toujours entier à toute mise", () => {
    expect(SORTES_DU_POKER.map((s) => s.fois)).toEqual([0, 1, 2, 3, 4, 6, 10, 25, 50, 250]);
    for (const s of SORTES_DU_POKER) expect(Number.isInteger(s.fois)).toBe(true);
  });
});

describe("le rendement", () => {
  const exact = rendementAuMieux();

  it("joué au mieux, rend 99,5238 % de la mise, jamais plus", { timeout: LONG }, () => {
    expect(exact.rendu).toBeCloseTo(0.9952377, 6);
    expect(exact.rendu).toBeLessThan(1);
    expect(RENDEMENT_DU_POKER).toBeCloseTo(exact.rendu, 5);
    expect(exact.parts.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("annonce à l'écran les chances de chaque sorte joué au mieux, arrondies", () => {
    exact.parts.forEach((p, s) => expect(SORTES_DU_POKER[s]!.uneSur, SORTES_DU_POKER[s]!.nom).toBe(Math.round(1 / p)));
  });

  it("retrouve la table classique 9/6 à 800 : 99,5439 %, le chiffre connu", { timeout: LONG }, () => {
    expect(rendementAuMieux([0, 1, 2, 3, 4, 6, 9, 25, 50, 800]).rendu).toBeCloseTo(0.995439, 5);
  });
});

describe("le conseil du barde", () => {
  it("garde une quinte flush royale servie, et la tient pour 250 fois la mise", () => {
    const r = conseilDuBarde([c(0, 1), c(12, 1), c(11, 1), c(10, 1), c(9, 1)]);
    expect(r).toEqual({ gardes: [true, true, true, true, true], esperance: 250 });
  });

  it("garde quatre cartes de la quinte royale plutôt qu'une paire de valets", () => {
    const r = conseilDuBarde([c(0, 1), c(12, 1), c(11, 1), c(10, 1), c(10, 2)]);
    expect(r.gardes).toEqual([true, true, true, true, false]);
  });

  it("garde une paire basse, et ne garde qu'un valet seul sur une main sans rien", () => {
    expect(conseilDuBarde([c(3, 0), c(3, 1), c(7, 2), c(9, 3), c(11, 0)]).gardes).toEqual([true, true, false, false, false]);
    expect(conseilDuBarde([c(1, 0), c(4, 1), c(6, 2), c(8, 3), c(10, 0)]).gardes).toEqual([false, false, false, false, true]);
  });

  it("n'annonce jamais plus que le jeu ne rend : l'espérance de son choix suit les mains qu'on peut finir", () => {
    const main = [c(1, 0), c(4, 1), c(6, 2), c(8, 3), c(10, 0)];
    const { gardes, esperance } = conseilDuBarde(main);
    // à la main : garder le valet, tirer quatre cartes parmi 47, compter ce que rend chaque main finie
    const vues = new Set(main.map(nombre));
    const reste = Array.from({ length: 52 }, (_, i) => i).filter((n) => !vues.has(n));
    let somme = 0;
    let compte = 0;
    for (let a = 0; a < 47; a++)
      for (let b = a + 1; b < 47; b++)
        for (let x = b + 1; x < 47; x++)
          for (let d = x + 1; d < 47; d++) {
            somme += renduDuPoker([main[4]!, carte(reste[a]!), carte(reste[b]!), carte(reste[x]!), carte(reste[d]!)], 1);
            compte++;
          }
    expect(gardes[4]).toBe(true);
    expect(esperance).toBeCloseTo(somme / compte, 12);
  });
});

describe("la donne et le tirage", () => {
  it("donnent cinq cartes différentes, prises dans l'ordre du paquet rangé", () => {
    expect(donneDuPoker(suite([0, 0, 0, 0, 0]))).toEqual([0, 1, 2, 3, 4].map(carte));
    expect(donneDuPoker(suite([51, 50, 49, 48, 47]))).toEqual([51, 50, 49, 48, 47].map(carte));
    for (let k = 0; k < 200; k++) {
      const main = donneDuPoker((n) => Math.floor(Math.random() * n));
      expect(new Set(main.map(nombre)).size).toBe(5);
    }
  });

  it("remplacent les cartes jetées par des cartes qui n'étaient pas dans la donne, et gardent les autres à leur place", () => {
    const donne = [0, 1, 2, 3, 4].map(carte);
    expect(tirageDuPoker(donne, [true, false, true, false, true], suite([0, 0]))).toEqual([0, 5, 2, 6, 4].map(carte));
    expect(tirageDuPoker(donne, [false, false, false, false, false], suite([46, 45, 44, 43, 42]))).toEqual([51, 50, 49, 48, 47].map(carte));
    for (let k = 0; k < 200; k++) {
      const d = donneDuPoker((n) => Math.floor(Math.random() * n));
      const g = d.map(() => Math.random() < 0.5);
      const f = tirageDuPoker(d, g, (n) => Math.floor(Math.random() * n));
      expect(new Set(f.map(nombre)).size).toBe(5);
      f.forEach((x, i) => (g[i] ? expect(x).toEqual(d[i]) : expect(d.map(nombre)).not.toContain(nombre(x))));
    }
  });
});
