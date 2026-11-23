import { describe, expect, it } from "vitest";
import {
  CHANCES_DE_LA_MACHINE,
  NOMS_DES_SYMBOLES,
  REBOND,
  SONS_DE_LA_MACHINE,
  TITRES_DE_LA_MACHINE,
  TONS_DE_LA_MACHINE,
  bandeDuRouleau,
  casesAMontrer,
  casesDEssai,
  casesVues,
  courbe,
  crantDuLevier,
  departDuRouleau,
  dureeDuRouleau,
  emplacementsDuBac,
  foisDuResultat,
  metriques,
  mini,
  peindreLevier,
  peindreLevre,
  peindreMachine,
  peindreSocle,
  piecesDesRouleaux,
  piecesQuiTombent,
  posDuRouleau,
  stateresDuBac,
  surMilleDuResultat,
  symbole,
} from "../../src/lib/jeu/casino-machine";
import type { Toile } from "../../src/lib/jeu/casino-toile";
import { FOIS_DE_LA_MACHINE, SUR_MILLE_DE_LA_MACHINE, lireLaLigne } from "../../src/lib/village/casino/machine";
import { resumeDeLaPartie } from "../../src/lib/village/ecran-casino";
import type { ResultatDeLaMachine } from "../../src/lib/village/contrat-casino";

// La machine du forgeron (maquette « Le Palais d'or » validée par le pilote le 22 novembre 2026) : ses dessins, et surtout que
// les rouleaux finissent toujours sur les neuf cases que le serveur a tirées. Les chances et les gains sont ceux du serveur,
// testés avec ses règles (`src/lib/village/casino/machine.ts`).

const RESULTATS: ResultatDeLaMachine[] = [-1, 0, 1, 2, 3, 4];
const pleins = (t: Toile): number => {
  let n = 0;
  for (let i = 3; i < t.d.length; i += 4) if (t.d[i]) n++;
  return n;
};
/** Un hasard fixé, pour des essais qui se rejouent. */
function graine(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entierDe = (h: () => number) => (n: number) => Math.floor(h() * n);

describe("les dessins de la machine", () => {
  it("peint les cinq symboles et « n'importe lequel » à chaque taille", () => {
    for (const S of [12, 24, 36])
      for (const i of [-1, 0, 1, 2, 3, 4]) {
        const t = symbole(i, S);
        expect([t.w, t.h]).toEqual([S + 2, S + 2]);
        expect(pleins(t)).toBeGreaterThan(i < 0 ? 4 : S * 2);
      }
    expect(mini(2)).toBe(mini(2));
  });

  it("peint la machine à ses deux tailles, son levier à chaque cran, son socle et son bac", () => {
    for (const k of [1, 1.5]) {
      const g = metriques(k);
      const m = peindreMachine(g);
      expect(m.w).toBe(g.BW + g.U(7) + 1);
      expect(m.h).toBe(g.MH);
      expect(pleins(m)).toBeGreaterThan(m.w * m.h * 0.6);
      // les rouleaux tiennent dans leur cadre, le bac sous la plaque, la plaque sous les rouleaux
      expect(g.rx + g.INW).toBeLessThanOrEqual(g.cad.x + g.cad.w);
      expect(g.plq.y).toBeGreaterThan(g.cad.y + g.cad.h);
      expect(g.bac.y).toBeGreaterThan(g.plq.y + g.plq.h);
      expect(g.MH).toBeGreaterThan(g.bac.y + g.bac.h);
      for (const q of [crantDuLevier(-1), 0, 32, crantDuLevier(2)]) {
        const l = peindreLevier(g, q);
        expect([l.w, l.h]).toEqual([g.lev.w, g.lev.h]);
        expect(pleins(l)).toBeGreaterThan(40);
      }
      expect(peindreLevre(g).w).toBe(g.bac.w + 2);
      const p = piecesDesRouleaux(g);
      expect([p.case.w, p.case.h]).toEqual([g.CW, g.CH]);
      expect(p.ombre.h).toBe(3 * g.CH);
      // les statères du bac se posent dans le bac
      for (const e of emplacementsDuBac(g, graine(3))) {
        expect(e.x).toBeGreaterThanOrEqual(g.bac.x);
        expect(e.x + 14).toBeLessThanOrEqual(g.bac.x + g.bac.w);
        expect(e.y + 14).toBeLessThanOrEqual(g.sol + 1);
      }
    }
    expect(pleins(peindreSocle(96))).toBeGreaterThan(2000);
    expect(piecesQuiTombent().map((t) => t.w)).toEqual([14, 10, 6]);
  });

  it("borne le levier de -4 (il cogne en remontant) à 64 (tout en bas)", () => {
    expect(crantDuLevier(-1)).toBe(-4);
    expect(crantDuLevier(0)).toBe(0);
    expect(crantDuLevier(1)).toBe(64);
    expect(crantDuLevier(3)).toBe(64);
  });
});

describe("ce que la machine écrit", () => {
  it("dit les chances et les gains des règles du serveur", () => {
    for (let r = 0; r < 5; r++) {
      const [a, b] = CHANCES_DE_LA_MACHINE[r]!.replace(/\s/g, "").split("sur").map(Number);
      expect((a! / b!) * 1000).toBe(SUR_MILLE_DE_LA_MACHINE[r]);
      expect(foisDuResultat(r as ResultatDeLaMachine)).toBe(FOIS_DE_LA_MACHINE[r]);
      expect(surMilleDuResultat(r as ResultatDeLaMachine)).toBe(SUR_MILLE_DE_LA_MACHINE[r]);
    }
    expect(surMilleDuResultat(-1)).toBe(648);
    expect(foisDuResultat(-1)).toBe(0);
    // le jeu rend en moyenne exactement la mise
    expect(RESULTATS.reduce<number>((s, r) => s + surMilleDuResultat(r) * foisDuResultat(r), 0)).toBe(1000);
    expect(NOMS_DES_SYMBOLES).toHaveLength(5);
    expect(TONS_DE_LA_MACHINE).toHaveLength(5);
  });

  it("écrit les mêmes titres que « Vos dernières parties » du hall", () => {
    for (let r = 0; r < 4; r++) expect(resumeDeLaPartie({ jeu: "machine", resultat: r as ResultatDeLaMachine })).toBe(`${TITRES_DE_LA_MACHINE[r]} : ${FOIS_DE_LA_MACHINE[r]} fois`);
  });

  it("met un statère par dizaine gagnée dans le bac, jamais plus que sa place", () => {
    expect(stateresDuBac(10, 30)).toBe(1);
    expect(stateresDuBac(200, 30)).toBe(20);
    expect(stateresDuBac(20000, 30)).toBe(38);
    expect(stateresDuBac(0, 30)).toBe(1);
  });
});

describe("les rouleaux montrent ce que le serveur a tiré", () => {
  it("finissent toujours sur les trois cases tirées, après un rebond, de gauche à droite", () => {
    const h = graine(7);
    for (let essai = 0; essai < 200; essai++) {
      const res = RESULTATS[essai % 6]!;
      const cases = casesDEssai(res, entierDe(h));
      const arrets: number[] = [];
      for (let i = 0; i < 3; i++) {
        const vus = [0, 1, 2].map(() => entierDe(h)(5));
        const { bande, n } = bandeDuRouleau(i, cases[i]!, vus, () => entierDe(h)(5));
        expect(casesVues(bande, n)).toEqual(vus); // il part de ce qu'il montrait
        let fin = -1;
        let plusBas = 0;
        for (let t = 0; t <= dureeDuRouleau(i) + 0.4; t += 1 / 60) {
          const p = posDuRouleau(n, dureeDuRouleau(i), t);
          plusBas = Math.min(plusBas, p.pos);
          if (p.arrete && fin < 0) fin = t;
        }
        expect(plusBas).toBeGreaterThanOrEqual(-REBOND);
        expect(posDuRouleau(n, dureeDuRouleau(i), 99)).toEqual({ pos: 0, cogne: true, arrete: true });
        expect(casesVues(bande, 0)).toEqual(cases[i]); // il s'arrête sur les cases du serveur
        arrets.push(departDuRouleau(i) + fin);
      }
      expect(arrets[0]).toBeLessThan(arrets[1]!);
      expect(arrets[1]).toBeLessThan(arrets[2]!);
      expect(lireLaLigne(cases)).toBe(res);
    }
  });

  it("avance sans retour en arrière jusqu'au cran", () => {
    expect(courbe(0)).toBe(0);
    expect(courbe(1)).toBe(1);
    let avant = 0;
    for (let u = 0; u <= 1; u += 0.01) {
      expect(courbe(u)).toBeGreaterThanOrEqual(avant);
      avant = courbe(u);
    }
  });

  it("montre les cases du serveur telles quelles, et jamais une image contraire à son résultat", () => {
    const serveur: [number, number, number][] = [
      [3, 1, 4],
      [0, 1, 2],
      [2, 1, 0],
    ];
    expect(casesAMontrer(1, serveur)).toEqual(serveur);
    // des cases qui ne disent pas le résultat payé, ou mal formées : d'autres qui le disent
    for (const mauvaises of [serveur, null, [[1, 2]], [[9, 9, 9], [0, 0, 0], [0, 0, 0]], "x"])
      for (const r of RESULTATS) expect(lireLaLigne(casesAMontrer(r, mauvaises, entierDe(graine(r + 9))))).toBe(r);
  });

  it("tire les coups d'essai parmi les cases du résultat voulu, sans « presque gagné » arrangé", () => {
    const h = entierDe(graine(11));
    for (const r of RESULTATS)
      for (let i = 0; i < 300; i++) {
        const c = casesDEssai(r, h);
        expect(lireLaLigne(c)).toBe(r);
        expect(c.flat().every((s) => s >= 0 && s <= 4)).toBe(true);
      }
  });
});

describe("les sons de la machine", () => {
  it("se taisent sans contexte audio, sans erreur", () => {
    expect(() => {
      SONS_DE_LA_MACHINE.cliquet(3);
      SONS_DE_LA_MACHINE.declic();
      SONS_DE_LA_MACHINE.retour();
      SONS_DE_LA_MACHINE.lache();
      SONS_DE_LA_MACHINE.prise();
      for (let i = 0; i < 3; i++) SONS_DE_LA_MACHINE.clonc(i);
      for (const r of RESULTATS) SONS_DE_LA_MACHINE.fin(r);
    }).not.toThrow();
  });
});
