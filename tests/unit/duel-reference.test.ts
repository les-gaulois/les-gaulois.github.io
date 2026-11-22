/**
 * Le moteur du duel rend exactement les manches de la maquette validée par le pilote. `duel-reference.json` a été écrit le
 * 22 novembre 2026 par les règles de la maquette elles-mêmes (`regles.js`, version 5) : 160 duels tirés au hasard, dont une
 * panoplie montée pour chacune des seize, avec lieux et compagnons, et pour chaque manche les cartes posées, les deux camps
 * après la manche, ce que chaque carte a fait, la fatigue et les effets qui ont joué. Ce fichier ne se refait pas : il est
 * la mémoire des règles d'origine.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTS_CLES, ORDRE_DES_PANOPLIES, camp, carte, manche, panopliesDe, verdict } from "../../supabase/functions/code-discord/duel/index";
import type { Coup, Evenement, IdDeCompagnon, IdDeLieu } from "../../supabase/functions/code-discord/duel/index";
import { campEnEntiers } from "../../supabase/functions/code-discord/duel/entiers";

interface MancheDeReference {
  c: [number, number];
  a: number[];
  b: number[];
  fa: number[];
  fb: number[];
  f: [number, number];
  e: [string[], string[]];
}
interface DuelDeReference {
  a: string[];
  b: string[];
  lieu: IdDeLieu | null;
  compagnons: [IdDeCompagnon | null, IdDeCompagnon | null];
  depart: [number[], number[]];
  manches: MancheDeReference[];
  verdict: number;
}

const REFERENCE: { duels: DuelDeReference[] } = JSON.parse(readFileSync(new URL("./duel-reference.json", import.meta.url), "utf8"));
const coup = (f: Coup): number[] => [f.force, f.paye, f.degats, f.pare, f.renvoi, f.subis, f.recul, f.soin, f.elan, f.coupe ? 1 : 0, f.enchaine, f.saignement, f.gele];
const evt = (e: Evenement): string => [e.mot, e.n ?? "", e.vie ?? "", e.energie ?? "", e.sur ?? "", e.panoplie ? 1 : ""].join("|");

describe("les duels de référence de la maquette", () => {
  it("couvrent les seize panoplies et les vingt-trois mots-clés", () => {
    const panoplies = new Set(REFERENCE.duels.flatMap((d) => [...panopliesDe(d.a.map(carte)), ...panopliesDe(d.b.map(carte))]));
    expect([...panoplies].sort()).toEqual([...ORDRE_DES_PANOPLIES].sort());
    const mots = new Set(REFERENCE.duels.flatMap((d) => [...d.a, ...d.b].flatMap((id) => Object.keys(carte(id).mots))));
    expect([...mots].sort()).toEqual([...MOTS_CLES].sort());
    expect(REFERENCE.duels.length).toBe(160);
  });

  it("se rejouent manche pour manche à l'identique", () => {
    let manches = 0;
    for (const [n, d] of REFERENCE.duels.entries()) {
      let a = camp(d.a.map(carte), { lieu: d.lieu, compagnon: d.compagnons[0] }), b = camp(d.b.map(carte), { lieu: d.lieu, compagnon: d.compagnons[1] });
      expect([campEnEntiers(a), campEnEntiers(b)], `duel ${n}, départ`).toEqual(d.depart);
      for (const [m, x] of d.manches.entries()) {
        const r = manche(a, b, x.c[0], x.c[1], m + 1);
        expect({ a: campEnEntiers(r.a), b: campEnEntiers(r.b), fa: coup(r.fa), fb: coup(r.fb), f: [r.fatigue.a, r.fatigue.b], e: [r.fa.evts.map(evt), r.fb.evts.map(evt)] }, `duel ${n}, manche ${m + 1}`).toEqual({
          a: x.a, b: x.b, fa: x.fa, fb: x.fb, f: x.f, e: x.e,
        });
        a = r.a;
        b = r.b;
        manches++;
      }
      expect(verdict(a, b), `duel ${n}, verdict`).toBe(d.verdict);
    }
    expect(manches).toBeGreaterThan(1000);
  });
});
