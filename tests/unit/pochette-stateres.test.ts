import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { errorMessage } from "../../src/lib/compte/errors";
import { LOTS_POCHETTE_STATERES, PLAFOND_POCHETTE_STATERES, PRIX_POCHETTE_STATERES, type MaPochetteStateres } from "../../src/lib/village/contrat";
import {
  apresLOuverture,
  bandeDesStateres,
  chanceDeGagner,
  dessinDuLot,
  lireLots,
  lireMaPochetteStateres,
  lireOuvertureDeStateres,
  lotSelon,
  messageDuRefusDesStateres,
  raisonPochetteStateresFermee,
  rareteDuLot,
  resteAujourdhui,
  retourMoyen,
} from "../../src/lib/village/pochette-stateres";
import { CIBLE_DU_TAMBOUR } from "../../src/lib/village/tambour";

const MIGRATION = readFileSync("supabase/migrations/20261116000800_pochette_de_stateres.sql", "utf8");
const lots = LOTS_POCHETTE_STATERES.map((lot) => ({ ...lot }));
const ma = (plus: Partial<MaPochetteStateres> = {}): MaPochetteStateres => ({ ok: true, solde: 1000, peut_ouvrir: true, prix: 200, plafond: 10, ouvertes: 0, lots, ...plus });

/** Un générateur à graine (mulberry32) : le même tirage à chaque passage des tests. */
function graine(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("les lots de la pochette de statères", () => {
  it("font 100 pour cent et rendent en moyenne exactement le prix", () => {
    expect(LOTS_POCHETTE_STATERES.reduce((somme, lot) => somme + Math.round(lot.chance * 10), 0)).toBe(1000);
    expect(retourMoyen(LOTS_POCHETTE_STATERES)).toBe(PRIX_POCHETTE_STATERES);
  });

  it("donnent plus que le prix 17 fois sur 100", () => {
    expect(chanceDeGagner(LOTS_POCHETTE_STATERES, PRIX_POCHETTE_STATERES)).toBe(17);
  });

  it("vont du plus courant au plus rare, le gain montant avec la rareté", () => {
    for (let i = 1; i < LOTS_POCHETTE_STATERES.length; i++) {
      const avant = LOTS_POCHETTE_STATERES[i - 1];
      const lot = LOTS_POCHETTE_STATERES[i];
      expect(lot && avant && lot.chance < avant.chance && lot.gain > avant.gain && lot.rang === avant.rang + 1).toBe(true);
    }
  });

  it("sont les mêmes dans la migration du serveur, avec le prix et le plafond", () => {
    for (const lot of LOTS_POCHETTE_STATERES) expect(MIGRATION).toContain(`(${lot.rang}, ${lot.chance}::numeric, ${lot.gain})`);
    expect(MIGRATION).toMatch(new RegExp(`stateres_pochette_prix\\(\\) returns integer[^$]*\\$\\$\\s*select ${PRIX_POCHETTE_STATERES}\\s*\\$\\$`));
    expect(MIGRATION).toMatch(new RegExp(`stateres_pochette_plafond\\(\\) returns integer[^$]*\\$\\$\\s*select ${PLAFOND_POCHETTE_STATERES}\\s*\\$\\$`));
  });

  it("résistent à un tirage au sort : 200 000 pochettes rendent leur prix à 2 pour cent près", () => {
    const hasard = graine(2026);
    const sorties = new Map<number, number>();
    let rendu = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const lot = lotSelon(LOTS_POCHETTE_STATERES, hasard());
      rendu += lot?.gain ?? 0;
      if (lot) sorties.set(lot.rang, (sorties.get(lot.rang) ?? 0) + 1);
    }
    expect(Math.abs(rendu / n - PRIX_POCHETTE_STATERES)).toBeLessThan(PRIX_POCHETTE_STATERES * 0.02);
    for (const lot of LOTS_POCHETTE_STATERES) expect(Math.abs(((sorties.get(lot.rang) ?? 0) / n) * 100 - lot.chance)).toBeLessThan(0.25);
  });
});

describe("le tirage d'un lot", () => {
  it("suit les chances, bornes comprises", () => {
    expect(lotSelon(lots, 0)?.rang).toBe(1);
    expect(lotSelon(lots, 0.5499)?.rang).toBe(1);
    expect(lotSelon(lots, 0.55)?.rang).toBe(2);
    expect(lotSelon(lots, 0.9979)?.rang).toBe(5);
    expect(lotSelon(lots, 0.9981)?.rang).toBe(6);
    expect(lotSelon(lots, 1)?.rang).toBe(6);
    expect(lotSelon([], 0.5)).toBeNull();
  });
});

describe("la lecture des réponses du serveur", () => {
  it("lit la pochette et range ses lots", () => {
    const lue = lireMaPochetteStateres({ ok: true, solde: 450, peut_ouvrir: true, prix: 200, plafond: 10, ouvertes: 3, lots: [...lots].reverse() });
    expect(lue?.lots.map((lot) => lot.rang)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lue?.ouvertes).toBe(3);
  });

  it("refuse des lots qui ne font pas 100 pour cent, un rang manquant, un gain nul", () => {
    expect(lireLots(lots.slice(0, 5))).toBeNull();
    expect(lireLots(lots.map((lot) => (lot.rang === 6 ? { ...lot, rang: 7 } : lot)))).toBeNull();
    expect(lireLots(lots.map((lot) => (lot.rang === 1 ? { ...lot, gain: 0 } : lot)))).toBeNull();
    expect(lireLots("lots")).toBeNull();
    expect(lireMaPochetteStateres({ ok: true, solde: -1, peut_ouvrir: true, prix: 200, plafond: 10, ouvertes: 0, lots })).toBeNull();
    expect(lireMaPochetteStateres({ ok: false, error: "not_signed_in" })).toBeNull();
  });

  it("lit une ouverture", () => {
    expect(lireOuvertureDeStateres({ ok: true, solde: 1150, lot: { rang: 3, gain: 350 }, ouvertes: 1 })).toEqual({ ok: true, solde: 1150, lot: { rang: 3, gain: 350 }, ouvertes: 1 });
    expect(lireOuvertureDeStateres({ ok: true, solde: 1150, lot: { rang: 9, gain: 350 }, ouvertes: 1 })).toBeNull();
    expect(lireOuvertureDeStateres({ ok: true, solde: 1150, ouvertes: 1 })).toBeNull();
  });
});

describe("ce que l'écran en déduit", () => {
  it("dit pourquoi la pochette est fermée, dans l'ordre du serveur", () => {
    expect(raisonPochetteStateresFermee(ma(), 1000)).toBeNull();
    expect(raisonPochetteStateresFermee(ma({ peut_ouvrir: false, ouvertes: 10 }), 0)).toContain("officier");
    expect(raisonPochetteStateresFermee(ma({ ouvertes: 10 }), 0)).toBe(errorMessage("plafond_du_jour"));
    expect(raisonPochetteStateresFermee(ma(), 150)).toMatch(/^Il vous manque 50\s+statères\.$/);
  });

  it("compte ce qu'il reste à ouvrir et suit le serveur après une ouverture", () => {
    expect(resteAujourdhui(ma({ ouvertes: 4 }))).toBe(6);
    expect(resteAujourdhui(ma({ ouvertes: 12 }))).toBe(0);
    expect(apresLOuverture(ma(), { ok: true, solde: 860, lot: { rang: 1, gain: 60 }, ouvertes: 1 })).toMatchObject({ solde: 860, ouvertes: 1 });
  });

  it("a des mots pour chaque refus", () => {
    expect(messageDuRefusDesStateres("plafond_du_jour")).toContain("demain");
    expect(messageDuRefusDesStateres("solde_insuffisant", { manque: 40 })).toContain("40");
    expect(messageDuRefusDesStateres("prix_change")).toBe(errorMessage("prix_change"));
  });

  it("donne à chaque lot la couleur d'une rareté, du commun au divin", () => {
    expect([1, 2, 3, 4, 5, 6].map(rareteDuLot)).toEqual(["commun", "peu-commun", "epique", "mystique", "legendaire", "divin"]);
  });
});

describe("le tambour de la pochette de statères", () => {
  it("s'arrête sur le lot du serveur et ne fait défiler que de vrais lots", () => {
    const bande = bandeDesStateres(4, lots, graine(7));
    expect(bande?.rangees[CIBLE_DU_TAMBOUR]?.valeur.gain).toBe(700);
    expect(bande?.rangees.every((rangee) => lots.includes(rangee.valeur) && rangee.rarete === rareteDuLot(rangee.valeur.rang))).toBe(true);
    expect(bandeDesStateres(9, lots)).toBeNull();
  });
});

describe("le dessin d'un lot", () => {
  it("montre autant de pièces que son rang, dans une grille pleine", () => {
    let avant = 0;
    for (const lot of lots) {
      const dessin = dessinDuLot(lot.rang);
      expect(dessin.cases).toHaveLength(dessin.largeur * dessin.hauteur);
      const pleines = dessin.cases.filter(Boolean).length;
      expect(pleines).toBeGreaterThan(avant);
      avant = pleines;
    }
  });
});
