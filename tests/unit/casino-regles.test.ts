/**
 * Les règles des six jeux du casino (src/lib/village/casino/) : chaque table de chances rend exactement la mise en moyenne,
 * calcul exact sur toutes les issues, et le vingt-et-un 99,43 % joué au mieux. Puis les règles elles-mêmes : la roue, la
 * machine qui ne fabrique jamais un « presque gagné », la course écrite pour son gagnant, la machine du vingt-et-un qui
 * cache sa carte. Le serveur est comparé à ces règles dans casino-serveur.test.ts.
 */
import { describe, expect, it } from "vitest";
import { COMPLEMENTS_AU_PLUS, JETONS_DU_CASINO, MISE_DE_DEPART_AU_PLUS, PARIS_DE_LA_ROUE, PARIS_DES_DES, PAS_DES_MISES, PLAFOND_DU_JOUR_DU_CASINO, REFUS_DU_CASINO } from "../../src/lib/village/contrat-casino";
import { ERROR_MESSAGES, errorMessage } from "../../src/lib/compte/errors";
import { foisEcrit, miseDeDepartValide, montantValide, parDixiemes, verifierLesParis } from "../../src/lib/village/casino/commun";
import { ORDRE_DE_LA_ROUE, PARIS_ROUE, ROUGES, payerLaRoue } from "../../src/lib/village/casino/roue";
import { DIXIEMES_DE_LA_SOMME, PARIS_DES, payerLesDes } from "../../src/lib/village/casino/des";
import { CHANCES_DES_COUPES, DIXIEMES_DES_COUPES, RANGEES, coupeDe, renduDeLaCoupe } from "../../src/lib/village/casino/palissade";
import { FOIS_DE_LA_MACHINE, SUR_MILLE_DE_LA_MACHINE, casesDuResultat, lireLaLigne, renduDeLaMachine, resultatDuTirage } from "../../src/lib/village/casino/machine";
import { COULOIRS, TOTAL_DES_PARTS, avancee, couloirPour, ecrireLaCourse, heureDArrivee, renduDeLaCourse } from "../../src/lib/village/casino/course";
import {
  carteDuNombre, complement, conseil, coupsPermis, distribuer, faitsMontres, jouerUnCoup, miseeDeLaMain, nombreDeLaCarte, rendementAuMieux, renduDeLaMain, tavernierMontre, total,
  type EtatDuVingtEtUn,
} from "../../src/lib/village/casino/vingt-et-un";
import type { CoupDuVingtEtUn, FaitDuVingtEtUn, ResultatDeLaMachine } from "../../src/lib/village/contrat-casino";
import { graine } from "./casino-essai";

const MISES = Array.from({ length: MISE_DE_DEPART_AU_PLUS / PAS_DES_MISES }, (_, i) => (i + 1) * PAS_DES_MISES);

describe("les chiffres du casino", () => {
  it("sont ceux que le pilote a fixés", () => {
    expect(JETONS_DU_CASINO).toEqual([10, 20, 50, 100, 200]);
    expect(MISE_DE_DEPART_AU_PLUS).toBe(200);
    expect(PAS_DES_MISES).toBe(10);
    expect(COMPLEMENTS_AU_PLUS).toBe(3);
    expect(PLAFOND_DU_JOUR_DU_CASINO).toBe(2000);
  });

  it("ont chaque refus écrit en mots, sans signe", () => {
    for (const code of REFUS_DU_CASINO) {
      expect(ERROR_MESSAGES, code).toHaveProperty(code);
      expect(errorMessage(code), code).not.toMatch(/[<>=÷%]/);
    }
  });

  it("vérifient une table de paris comme le serveur", () => {
    const roue: readonly string[] = PARIS_DE_LA_ROUE;
    expect(verifierLesParis({}, roue)).toEqual({ ok: false, refus: "pari_invalide" });
    expect(verifierLesParis({ rouge: 15 }, roue)).toEqual({ ok: false, refus: "pari_invalide" });
    expect(verifierLesParis({ rouge: 0 }, roue)).toEqual({ ok: false, refus: "pari_invalide" });
    expect(verifierLesParis({ rouge: -10 }, roue)).toEqual({ ok: false, refus: "pari_invalide" });
    expect(verifierLesParis({ rouge: "10" }, roue)).toEqual({ ok: false, refus: "pari_invalide" });
    expect(verifierLesParis({ n37: 10 }, roue)).toEqual({ ok: false, refus: "pari_invalide" });
    expect(verifierLesParis({ rouge: 100, n7: 100 }, roue)).toEqual({ ok: true, total: 200 });
    expect(verifierLesParis({ rouge: 100, n7: 110 }, roue)).toEqual({ ok: false, refus: "mise_trop_haute" });
    expect(verifierLesParis({ s7: 10 }, PARIS_DES_DES)).toEqual({ ok: true, total: 10 });
    expect(MISES.every(miseDeDepartValide)).toBe(true);
    expect([0, 5, 15, 210, -10, 10.5, Number.NaN].some(miseDeDepartValide)).toBe(false);
    expect(montantValide(1000)).toBe(true);
  });

  it("écrivent un multiple avec une virgule et rendent toujours des statères entiers", () => {
    expect(foisEcrit(24)).toBe("2,4");
    expect(foisEcrit(360)).toBe("36");
    for (const m of MISES) for (const d of [2, 5, 15, 24, 40, 60, 72, 90, 190, 360]) expect(Number.isInteger(parDixiemes(m, d))).toBe(true);
  });
});

describe("la roue du charron", () => {
  it("a 36 cases sans zéro, 18 rouges et 18 bleues, autant de chaque dans chaque tiers, colonne, moitié et parité", () => {
    expect([...ORDRE_DE_LA_ROUE].sort((a, b) => a - b)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(ROUGES.size).toBe(18);
    for (const groupe of ["t1", "t2", "t3", "c1", "c2", "c3", "bas", "haut", "pair", "impair"]) {
      const nums = PARIS_ROUE[groupe]!.nums;
      expect(nums.filter((n) => ROUGES.has(n)).length * 2, groupe).toBe(nums.length);
    }
    // rouge, bleu, rouge, bleu… autour de la roue
    ORDRE_DE_LA_ROUE.forEach((n, i) => expect(ROUGES.has(n), String(n)).toBe(i % 2 === 0));
  });

  it("a les 48 paris du contrat, et chacun rend exactement sa mise en moyenne", () => {
    expect(Object.keys(PARIS_ROUE).sort()).toEqual([...PARIS_DE_LA_ROUE].sort());
    for (const id of PARIS_DE_LA_ROUE) {
      const rendu = Array.from({ length: 36 }, (_, i) => payerLaRoue({ [id]: 10 }, i + 1).total).reduce((a, b) => a + b, 0);
      expect(rendu, id).toBe(36 * 10);
    }
    expect(PARIS_ROUE["n7"]!.fois).toBe(36);
    expect(PARIS_ROUE["rouge"]!.fois).toBe(2);
    expect(PARIS_ROUE["c3"]!.fois).toBe(3);
  });

  it("paie chaque pari d'une table, mise comprise", () => {
    expect(payerLaRoue({ rouge: 100, n7: 10, t1: 20 }, 7)).toEqual({ total: 10 * 36 + 20 * 3, parPari: { rouge: 0, n7: 360, t1: 60 } });
    expect(payerLaRoue({ rouge: 100 }, 3)).toEqual({ total: 200, parPari: { rouge: 200 } });
  });
});

describe("les dés", () => {
  const faces: [number, number][] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) faces.push([a, b]);

  it("ont quatorze paris, et chacun rend exactement sa mise en moyenne", () => {
    expect(PARIS_DES.map((p) => p.id)).toEqual([...PARIS_DES_DES]);
    for (const p of PARIS_DES) {
      const rendu = faces.reduce((s, f) => s + payerLesDes({ [p.id]: 10 }, f).total, 0);
      expect(rendu, p.id).toBe(36 * 10);
    }
    expect(DIXIEMES_DE_LA_SOMME[7]).toBe(60);
    expect(PARIS_DES.find((p) => p.id === "moins")!.dixiemes).toBe(24);
  });

  it("paient en statères entiers, avec le meilleur multiple gagnant", () => {
    expect(payerLesDes({ double: 10, s6: 20, moins: 10 }, [3, 3])).toEqual({ total: 60 + 144 + 24, parPari: { double: 60, s6: 144, moins: 24 }, meilleur: 72 });
    expect(payerLesDes({ plus: 10 }, [3, 4])).toEqual({ total: 0, parPari: { plus: 0 }, meilleur: 0 });
  });
});

describe("la palissade", () => {
  it("a neuf coupes dont les chances sur 256 rendent exactement la mise", () => {
    expect(RANGEES).toBe(8);
    expect(CHANCES_DES_COUPES.reduce((a, b) => a + b, 0)).toBe(2 ** RANGEES);
    // les chances sont celles de huit choix à une chance sur deux
    let binome = 1;
    CHANCES_DES_COUPES.forEach((c, k) => {
      expect(c).toBe(binome);
      binome = (binome * (RANGEES - k)) / (k + 1);
    });
    expect(CHANCES_DES_COUPES.reduce((s, c, k) => s + c * DIXIEMES_DES_COUPES[k]!, 0)).toBe(256 * 10);
    expect(DIXIEMES_DES_COUPES.map((d) => d / 10)).toEqual([19, 4, 1.5, 0.5, 0.2, 0.5, 1.5, 4, 19]);
  });

  it("rend toujours un nombre entier de statères, et la coupe est le nombre de pas à droite", () => {
    for (const m of MISES) for (let k = 0; k <= 8; k++) expect(Number.isInteger(renduDeLaCoupe(m, k))).toBe(true);
    expect(renduDeLaCoupe(10, 4)).toBe(2);
    expect(renduDeLaCoupe(200, 0)).toBe(3800);
    expect(coupeDe([1, 0, 0, 1, 1, 0, 1, 1])).toBe(5);
  });
});

describe("la machine du forgeron", () => {
  it("tire sur 1 000 et rend exactement la mise en moyenne", () => {
    const comptes = new Map<number, number>();
    let rendu = 0;
    for (let r = 0; r < 1000; r++) {
      const res = resultatDuTirage(r);
      comptes.set(res, (comptes.get(res) ?? 0) + 1);
      rendu += renduDeLaMachine(10, res);
    }
    expect(rendu).toBe(1000 * 10);
    expect([0, 1, 2, 3, 4, -1].map((res) => comptes.get(res) ?? 0)).toEqual([2, 10, 40, 100, 200, 648]);
    expect(SUR_MILLE_DE_LA_MACHINE.reduce((s, n, i) => s + n * FOIS_DE_LA_MACHINE[i]!, 0)).toBe(1000);
  });

  it("montre toujours le résultat tiré, et jamais trois gui", () => {
    const alea = graine(7);
    const entier = (n: number) => Math.floor(alea() * n);
    for (const res of [0, 1, 2, 3, 4, -1] as ResultatDeLaMachine[]) {
      for (let i = 0; i < 2000; i++) {
        const c = casesDuResultat(res, entier);
        expect(lireLaLigne(c)).toBe(res);
        expect(c.every((rouleau) => rouleau.length === 3 && rouleau.every((s) => s >= 0 && s < 5))).toBe(true);
        expect(c.every((rouleau) => rouleau[1] === 4)).toBe(false);
      }
    }
  });

  it("ne fabrique pas de « presque gagné » : sans gain, chaque ligne permise sort aussi souvent", () => {
    // Les lignes du milieu sans gain : le premier rouleau de 0 à 3, sans trois fois le même symbole (4 × 25 − 4 = 96).
    const alea = graine(11);
    const vues = new Map<string, number>();
    const n = 96 * 400;
    for (let i = 0; i < n; i++) {
      const c = casesDuResultat(-1, (k) => Math.floor(alea() * k));
      const cle = c.map((r) => r[1]).join("");
      vues.set(cle, (vues.get(cle) ?? 0) + 1);
    }
    expect(vues.size).toBe(96);
    for (const [cle, v] of vues) expect(Math.abs(v - 400), cle).toBeLessThan(110);
  });
});

describe("la course des familiers", () => {
  it("a six couloirs dont chacun rend exactement sa mise en moyenne", () => {
    expect(COULOIRS.map((c) => c.fois)).toEqual([3, 4, 6, 8, 12, 24]);
    expect(COULOIRS.reduce((s, c) => s + c.parts, 0)).toBe(TOTAL_DES_PARTS);
    for (const [i, c] of COULOIRS.entries()) {
      expect(c.fois * c.parts, String(i)).toBe(TOTAL_DES_PARTS);
      const rendu = Array.from({ length: TOTAL_DES_PARTS }, (_, n) => renduDeLaCourse(10, i, couloirPour(n))).reduce((a, b) => a + b, 0);
      expect(rendu).toBe(TOTAL_DES_PARTS * 10);
    }
  });

  it("s'écrit pour que le gagnant tiré passe la ligne le premier, sans jamais reculer", () => {
    const alea = graine(3);
    for (let i = 0; i < 300; i++) {
      const gagnant = i % 6;
      const coureurs = ecrireLaCourse(gagnant, alea);
      const heures = coureurs.map(heureDArrivee);
      expect(heures.indexOf(Math.min(...heures))).toBe(gagnant);
      for (const c of coureurs) for (let t = 0; t <= 16; t += 0.25) expect(avancee(c, t).vitesse).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ---------- Le vingt-et-un ---------- */

/** Une source de cartes qui suit une liste, puis tire au hasard. */
const source = (cartes: number[], alea: () => number) => () => cartes.shift() ?? Math.floor(alea() * 52);
/** Les cartes d'un rang donné (0 l'as… 12 le roi), en torques. */
const C = (...rangs: number[]) => rangs.map((r) => r);

function jouerAuMieux(alea: () => number, mise: number): { etat: EtatDuVingtEtUn; faits: FaitDuVingtEtUn[] } {
  const tire = () => Math.floor(alea() * 52);
  const { etat, faits } = distribuer(mise, tire);
  while (etat.phase === "joueur") {
    const m = etat.mains[etat.courante]!;
    const { coup } = conseil(m.cartes, etat.tavernier[0]!, coupsPermis(etat));
    faits.push(...jouerUnCoup(etat, coup!, tire));
  }
  return { etat, faits };
}

describe("le vingt-et-un", () => {
  it("rend 99,43 % joué au mieux (calcul exact de la maquette)", () => {
    expect(rendementAuMieux()).toBeCloseTo(0.9942961198772635, 12);
    expect(Math.round(rendementAuMieux() * 10000) / 100).toBe(99.43);
  });

  it("résiste à un tirage au sort : 200 000 mains jouées au conseil du druide rendent 99,43 % à 1,2 point près", { timeout: 60_000 }, () => {
    const alea = graine(2026);
    let mise = 0;
    let rendu = 0;
    for (let i = 0; i < 200_000; i++) {
      const { etat } = jouerAuMieux(alea, 10);
      mise += miseeDeLaMain(etat);
      rendu += renduDeLaMain(etat);
    }
    // le rendement de la maquette : 1 plus le gain net moyen, compléments compris, rapporté à la mise de départ
    expect(Math.abs(1 + (rendu - mise) / (200_000 * 10) - 0.9943)).toBeLessThan(0.012);
    expect(mise).toBeGreaterThan(200_000 * 10);
  });

  it("paie 3 pour 2 un 21 d'entrée, rend la mise contre un 21 d'entrée du tavernier, et ne prend que la mise devant son 21", () => {
    const alea = graine(1);
    // joueur as et roi, tavernier 9 et 5 : payé 2,5 fois
    let r = distribuer(100, source(C(0, 8, 12, 4), alea));
    expect(r.etat.phase).toBe("fini");
    expect(r.etat.mains[0]!.recu).toBe(250);
    expect(r.faits.at(-1)).toEqual({ t: "bilan", main: 0, issue: "vingt-et-un", recu: 250 });
    // les deux ont 21 : égalité
    r = distribuer(100, source(C(0, 0, 12, 12), alea));
    expect(r.etat.mains[0]!.issue).toBe("egal");
    expect(r.etat.mains[0]!.recu).toBe(100);
    expect(r.faits.map((f) => f.t)).toEqual(["carte", "carte", "carte", "carte", "regarde", "retourne", "bilan"]);
    // le tavernier a 21 sous un 10 : il regarde et la main s'arrête, sans rien prendre de plus
    r = distribuer(100, source(C(9, 9, 6, 0), alea));
    expect(r.etat.mains[0]!.issue).toBe("perdu");
    expect(r.etat.mains[0]!.recu).toBe(0);
    expect(r.faits.at(-1)).toMatchObject({ t: "bilan", entree: true });
  });

  it("sépare une paire une fois, donne une seule carte aux as séparés, et permet de doubler après", () => {
    const alea = graine(2);
    // une paire de 8 contre un 6, carte cachée un 10
    let r = distribuer(50, source(C(7, 5, 7, 9), alea));
    expect(coupsPermis(r.etat)).toEqual({ tirer: true, rester: true, doubler: true, separer: true });
    expect(complement(r.etat)).toBe(50);
    jouerUnCoup(r.etat, "separer", source(C(2), alea));
    expect(r.etat.mains.map((m) => m.cartes.length)).toEqual([2, 1]);
    expect(coupsPermis(r.etat)).toEqual({ tirer: true, rester: true, doubler: true, separer: false });
    jouerUnCoup(r.etat, "doubler", source(C(9, 9), alea));
    expect(r.etat.mains[0]!.mise).toBe(100);
    expect(r.etat.courante).toBe(1);
    expect(r.etat.mains[1]!.cartes.length).toBe(2);
    expect(miseeDeLaMain(r.etat)).toBeLessThanOrEqual(50 * (1 + COMPLEMENTS_AU_PLUS));
    // des as séparés : une carte chacun, puis le tavernier
    r = distribuer(50, source(C(0, 5, 13, 9), alea));
    const faits = jouerUnCoup(r.etat, "separer", source(C(12, 3, 4), alea));
    expect(r.etat.mains.map((m) => m.cartes.length)).toEqual([2, 2]);
    expect(r.etat.phase).toBe("fini");
    expect(faits.filter((f) => f.t === "retourne")).toHaveLength(1);
    // un as séparé qui reçoit un roi n'est pas un 21 d'entrée : payé 1 pour 1
    expect(r.etat.mains[0]!.recu === 0 || r.etat.mains[0]!.recu === 50 || r.etat.mains[0]!.recu === 100).toBe(true);
  });

  it("refuse un coup non permis sans rien changer", () => {
    const alea = graine(4);
    const r = distribuer(10, source(C(4, 5, 6, 9), alea));
    const avant = JSON.stringify(r.etat);
    expect(() => jouerUnCoup(r.etat, "separer", source([], alea))).toThrow(/refusé/);
    expect(JSON.stringify(r.etat)).toBe(avant);
    jouerUnCoup(r.etat, "tirer", source(C(1), alea));
    expect(coupsPermis(r.etat).doubler).toBe(false);
  });

  it("cache la carte du tavernier tant que la main n'est pas finie, et la porte en la retournant", () => {
    const alea = graine(5);
    const r = distribuer(10, source(C(4, 5, 6, 9 + 13), alea));
    const montres = faitsMontres(r.faits);
    expect(montres[3]).toEqual({ t: "carte", a: "tavernier", carte: null, cachee: true });
    expect(tavernierMontre(r.etat)).toEqual([carteDuNombre(5)]);
    const suite = jouerUnCoup(r.etat, "rester", source([], alea));
    expect(suite.find((f) => f.t === "retourne")).toEqual({ t: "retourne", carte: carteDuNombre(22) });
    expect(faitsMontres([...r.faits, ...suite])[3]).toMatchObject({ carte: carteDuNombre(22) });
    expect(tavernierMontre(r.etat).length).toBeGreaterThanOrEqual(2);
  });

  it("finit toujours, avec des gains entiers, au plus quatre fois la mise de départ misée, et le tavernier à 17 ou plus", () => {
    const alea = graine(6);
    const coups: CoupDuVingtEtUn[] = ["tirer", "rester", "doubler", "separer"];
    for (let i = 0; i < 20_000; i++) {
      const tire = () => Math.floor(alea() * 52);
      const { etat } = distribuer(10, tire);
      for (let n = 0; etat.phase === "joueur"; n++) {
        expect(n).toBeLessThan(20);
        const permis = coupsPermis(etat);
        const choix = coups.filter((k) => permis[k]);
        jouerUnCoup(etat, choix[Math.floor(alea() * choix.length)]!, tire);
      }
      expect(miseeDeLaMain(etat)).toBeLessThanOrEqual(40);
      expect(etat.mains.every((m) => Number.isInteger(m.recu) && m.issue !== null)).toBe(true);
      if (etat.mains.some((m) => total(m.cartes).t <= 21) && etat.tavernier.length > 2) expect(total(etat.tavernier).t).toBeGreaterThanOrEqual(17);
    }
  });

  it("numérote les 52 cartes du rang et de l'enseigne", () => {
    for (let n = 0; n < 52; n++) expect(nombreDeLaCarte(carteDuNombre(n))).toBe(n);
    expect(carteDuNombre(51)).toEqual({ r: 12, e: 3 });
  });
});
