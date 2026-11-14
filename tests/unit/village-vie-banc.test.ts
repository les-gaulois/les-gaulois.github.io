import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, OBJETS } from "../../src/lib/gaulois";
import { MAX_SIGNES, MOTS_INTERDITS } from "../../src/lib/village/consigne-repliques";
import { SIGNES_PERMIS, controlerReplique, majusculeHorsPlace, normaliserPourLesMots, type FaitsDuGaulois } from "../../src/lib/village/vie-releve";
import { FAITS_DU_BANC, PHRASES_DU_BANC, type Famille } from "./village-vie-banc";

/**
 * Le banc d'essai des bulles (`village-vie-banc.ts`). Le 14 novembre 2026, à 9 h 47, le seul vrai appel à Claude a donné
 * deux phrases, toutes deux écartées par le contrôle du robot, sans que le journal dise pourquoi. Mesuré sur ce banc avec le
 * contrôle d'alors (commit dacce9a) : 33 phrases sur 83 passaient, aucune de celles qui n'ont qu'un défaut de typographie
 * (2 sur 16) ni un objet recopié avec sa majuscule (0 sur 10). Avec le nettoyage : 51 sur 83, et tout ce qui reste écarté
 * doit l'être.
 */
const resultats = PHRASES_DU_BANC.map((ph) => ({ ...ph, controle: controlerReplique(ph.texte, FAITS_DU_BANC[ph.faits]) }));
const parFamille = (famille: Famille) => resultats.filter((r) => r.famille === famille);
const passent = (famille: Famille) => parFamille(famille).filter((r) => r.controle.ok).length;

describe("le banc d'essai des bulles", () => {
  it("compte au moins 60 phrases, sur des faits du catalogue tels que le serveur les accepte", () => {
    expect(PHRASES_DU_BANC.length).toBeGreaterThanOrEqual(60);
    const noms = new Set(EMPLACEMENTS_OBJETS.flatMap((e) => Object.values(OBJETS[e]).filter((o) => o.dessin !== null).map((o) => o.nom)));
    for (const faits of Object.values(FAITS_DU_BANC) as FaitsDuGaulois[]) {
      for (const objet of faits.objets) expect(noms.has(objet), objet).toBe(true);
      expect(faits.heure).toMatch(/^([01]?[0-9]|2[0-3]) h [0-5][0-9]$/);
    }
  });

  it("laisse passer les phrases sages, et celles qui n'ont qu'un défaut de typographie ou de majuscule d'un mot des faits", () => {
    for (const famille of ["sage", "typographie", "majuscule"] as const) {
      for (const r of parFamille(famille)) expect(r.controle, `${famille} : ${r.texte}`).toMatchObject({ ok: true });
    }
    expect(passent("typographie")).toBe(16);
    expect(passent("majuscule")).toBe(10);
  });

  it("écarte toujours ce qui doit l'être : nombre inventé, longueur, mot interdit, signe, majuscule inventée", () => {
    const raison: Partial<Record<Famille, string>> = {
      "heure inventée": "chiffre absent des faits",
      "nombre inventé": "chiffre absent des faits",
      longueur: "trop longue",
      "mot interdit": "mot interdit",
      signe: "signe refusé",
    };
    for (const [famille, attendue] of Object.entries(raison) as [Famille, string][]) {
      for (const r of parFamille(famille)) expect(r.controle, `${famille} : ${r.texte}`).toMatchObject({ ok: false, raison: attendue });
    }
    for (const r of parFamille("majuscule inventée")) expect(r.controle.ok, r.texte).toBe(false);
  });

  // Claude ne reçoit plus l'heure : une bulle reste à l'écran des heures après, et l'heure y deviendrait fausse.
  it("écarte l'heure recopiée en chiffres, que Claude ne reçoit plus ; en lettres, elle ne se voit pas", () => {
    const heures = parFamille("heure exacte");
    expect(heures.filter((r) => r.controle.ok).map((r) => r.texte)).toEqual(["Neuf heures quarante-sept, et pas une ride sur ma tunique !"]);
  });

  it("passe à 51 phrases sur 83, contre 33 avec le contrôle d'avant", () => {
    expect(resultats.filter((r) => r.controle.ok)).toHaveLength(51);
    expect(PHRASES_DU_BANC).toHaveLength(83);
  });

  it("n'envoie que des phrases nettoyées qui passent toutes les règles du serveur", () => {
    for (const r of resultats) {
      if (!r.controle.ok) continue;
      const t = r.controle.texte;
      expect([...t].length, t).toBeLessThanOrEqual(MAX_SIGNES);
      expect(t, t).toMatch(SIGNES_PERMIS);
      expect(t).toBe(t.trim());
      expect(t).not.toContain("  ");
      expect(t).not.toMatch(/[A-Z]{2}/);
      expect(majusculeHorsPlace(t), t).toBe(false);
      expect(MOTS_INTERDITS.some((m) => normaliserPourLesMots(t).includes(m)), t).toBe(false);
    }
  });

  // Les deux Gaulois de 9 h 47 avaient chacun une phrase ; avec trois phrases et une reprise, une bulle n'est perdue que si
  // six phrases sont écartées. Sur le banc, la part des phrases écartées tombe de 60 % à 39 % (en comptant encore l'heure,
  // que Claude n'écrira plus) : à phrases indépendantes, 0,39 puissance 6, moins de 1 %. Les phrases d'un même modèle ne sont
  // pas indépendantes : ce chiffre n'est qu'un ordre de grandeur, qu'un vrai appel confirmera.
  it("donne l'ordre de grandeur d'une bulle perdue, avant et après", () => {
    const ecartees = resultats.filter((r) => !r.controle.ok).length / resultats.length;
    expect(ecartees).toBeCloseTo(32 / 83, 5);
    expect((50 / 83) ** 2).toBeGreaterThan(0.36);
    expect(ecartees ** 6).toBeLessThan(0.01);
  });
});
