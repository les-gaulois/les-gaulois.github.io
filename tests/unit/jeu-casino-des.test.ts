import { describe, expect, it } from "vitest";
import {
  SECOUE,
  SONS_DES_DES,
  desDuDebut,
  dureeDuLancer,
  ecranY,
  etatDuDe,
  faceDuDessus,
  geometrie,
  peindreCornet,
  peindreDe,
  peindreDouble,
  peindreLueur,
  peindreMur,
  peindrePlaque,
  peindreTable,
  placeDuCornet,
  preparer,
  unDe,
  type HasardDuDecor,
} from "../../src/lib/jeu/casino-des";
import type { Toile } from "../../src/lib/jeu/casino-toile";
import { PARIS_DES, payerLesDes } from "../../src/lib/village/casino/des";
import { foisEcrit } from "../../src/lib/village/casino/commun";

// Les dés (maquette « Le Palais d'or » validée par le pilote le 22 novembre 2026) : leurs dessins, et surtout que chaque dé
// finit sur la face que le serveur a tirée, quel que soit le décor de son lancer. Les chances et les gains sont ceux du
// serveur, testés avec ses règles (`src/lib/village/casino/des.ts`).

const pleins = (t: Toile): number => {
  let n = 0;
  for (let i = 3; i < t.d.length; i += 4) if (t.d[i]) n++;
  return n;
};
/** Un décor fixé, pour des lancers qui se rejouent. */
function decor(s: number): HasardDuDecor {
  let a = s >>> 0;
  const h = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { entre: (x, y) => x + h() * (y - x), auSort: (n) => Math.floor(h() * n) };
}
// Les tailles de la piste de la maquette : téléphone (155 à 240 points), tablette, grand écran (240 à 320).
const PISTES: [number, number][] = [
  [155, 149],
  [240, 230],
  [235, 188],
  [320, 243],
];

describe("chaque dé finit sur la face tirée par le serveur", () => {
  it("quels que soient l'endroit où il tombe et la façon dont il roule", () => {
    for (const [W, H] of PISTES) {
      const G = geometrie(W, H);
      for (let graine = 0; graine < 12; graine++)
        for (let a = 1; a <= 6; a++)
          for (let b = 1; b <= 6; b++) {
            const [d1, d2] = preparer(G, a, b, decor(graine * 100 + a * 7 + b));
            expect(faceDuDessus(etatDuDe(G, d1, 99).M)).toBe(a);
            expect(faceDuDessus(etatDuDe(G, d2, 99).M)).toBe(b);
            // posés à la fin, au sol, dans la piste
            for (const d of [d1, d2]) {
              const e = etatDuDe(G, d, d.T + 1);
              expect(e.h).toBe(0);
              expect(e.n).toBe(d.ng);
              expect(e.x).toBeGreaterThan(G.fx0);
              expect(e.x).toBeLessThan(G.fx1);
              expect(ecranY(G, e.y)).toBeGreaterThan(G.fy0);
              expect(ecranY(G, e.y)).toBeLessThan(G.fy1);
            }
          }
    }
  });

  it("garde sa face même tourné d'un quart de tour au départ, avec de deux à cinq bascules", () => {
    for (let f = 1; f <= 6; f++)
      for (let ng = 2; ng <= 5; ng++)
        for (let g = 0; g < 8; g++) {
          const d = unDe(f, 0.5, 0.5, Math.PI + g * 0.1, ng, 0, decor(g + f * 31 + ng));
          expect(faceDuDessus(etatDuDe(geometrie(240, 230), d, d.T + 0.5).M)).toBe(f);
        }
  });

  it("pose les deux dés du début sans rien promettre, et le lancer dure le temps du cornet et des bascules", () => {
    const G = geometrie(240, 230);
    const [a, b] = desDuDebut(decor(1));
    expect(faceDuDessus(etatDuDe(G, a, 99).M)).toBe(5);
    expect(faceDuDessus(etatDuDe(G, b, 99).M)).toBe(2);
    expect(dureeDuLancer([a, b])).toBeGreaterThan(SECOUE + 0.5);
    expect(dureeDuLancer([a, b])).toBeLessThan(4);
  });

  it("ramène le cornet à sa place une fois les dés versés", () => {
    const G = geometrie(240, 230);
    const repos = placeDuCornet(G, null);
    expect(repos).toEqual({ x: G.repos.x, y: G.repos.y - G.hc / 2, ang: 0, devant: false });
    expect(placeDuCornet(G, SECOUE + 0.3).devant).toBe(true);
    const apres = placeDuCornet(G, SECOUE + 2);
    expect(apres.x).toBeCloseTo(repos.x, 6);
    expect(apres.y).toBeCloseTo(repos.y, 6);
    expect(apres.ang).toBeCloseTo(0, 6);
  });
});

describe("les dessins des dés", () => {
  it("peint le dé, le cornet, la plaque, l'icône du double et la lueur", () => {
    const G = geometrie(240, 230);
    expect(pleins(peindreDe(G.a, etatDuDe(G, unDe(6, 0.5, 0.5, Math.PI, 3, 0, decor(2)), 99).M))).toBeGreaterThan(G.a * G.a);
    expect(pleins(peindreCornet(G))).toBeGreaterThan(G.wc * G.hc * 0.5);
    expect(peindrePlaque("12").h).toBe(15);
    expect([peindreDouble().w, peindreDouble().h]).toEqual([23, 10]);
    expect(pleins(peindreLueur(40))).toBeGreaterThan(0);
  });

  it("peint le salon et la table de jour comme de nuit, à chaque taille de piste", () => {
    for (const [W, H] of PISTES)
      for (const jour of [true, false]) {
        const G = geometrie(W, H);
        const m = peindreMur(G, jour);
        const t = peindreTable(G, jour);
        expect([m.w, m.h]).toEqual([W, G.yT + 2]);
        expect([t.w, t.h]).toEqual([W, H]);
        expect(pleins(m)).toBe(m.w * m.h);
        expect(G.fy1).toBeGreaterThan(G.fy0 + 2 * G.a);
      }
  });
});

describe("ce que le tapis écrit", () => {
  it("écrit les multiples des règles du serveur avec une virgule, et chaque pari rend en moyenne sa mise", () => {
    expect(PARIS_DES.map((p) => foisEcrit(p.dixiemes))).toEqual(["2,4", "6", "2,4", "36", "18", "12", "9", "7,2", "6", "7,2", "9", "12", "18", "36"]);
    for (const p of PARIS_DES) {
      let total = 0;
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) total += payerLesDes({ [p.id]: 10 }, [a, b]).total;
      expect(total).toBe(360);
    }
  });
});

describe("les sons des dés", () => {
  it("se taisent sans contexte audio, sans erreur", () => {
    expect(() => {
      SONS_DES_DES.secoue(SECOUE);
      SONS_DES_DES.verse();
      SONS_DES_DES.velours(300, 1);
      SONS_DES_DES.cogne();
      SONS_DES_DES.pose();
      SONS_DES_DES.beauGain();
    }).not.toThrow();
  });
});
