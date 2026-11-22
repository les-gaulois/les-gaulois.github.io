/**
 * Les défis d'entraînement du duel : chacun a une solution trouvée par le solveur, au moins un premier coup ne mène à rien,
 * et le hasard ne les réussit pas plus d'une fois sur deux. Le solveur joue par le moteur, sans rien refaire des règles.
 */
import { describe, expect, it } from "vitest";
import { DEFIS, REGLES_DE_BASE, type Defi } from "../../supabase/functions/code-discord/duel/contenu/defis";
import { coupAnnonce, departDuDefi, issueDuDefi } from "../../supabase/functions/code-discord/duel/contenu/partie";
import { CATALOGUE_DU_DUEL } from "../../supabase/functions/code-discord/duel/catalogue";
import { LIEUX, MOTS, PANOPLIES, type IdDePanoplie, type MotCle } from "../../supabase/functions/code-discord/duel/effets";
import { carte, panopliesDe } from "../../supabase/functions/code-discord/duel/regles";
import { resoudre } from "./duel-solveur";

const SIGNES_INTERDITS = /[÷×>=<+]/;
const motsDe = (texte: string): number => texte.trim().split(/\s+/).length;

/** La leçon se voit-elle dans le défi ? Un mot-clé sur une carte, une panoplie réunie par le joueur ; une règle de base, toujours. */
function leconPresente(d: Defi): boolean {
  if ((REGLES_DE_BASE as readonly string[]).includes(d.lecon)) return true;
  if (d.lecon.startsWith("panoplie:")) return panopliesDe(d.toi.main.map(carte)).includes(d.lecon.slice("panoplie:".length) as IdDePanoplie);
  const mot = d.lecon as MotCle;
  return [...d.toi.main, ...d.lui.main].some((id) => carte(id).mots[mot] !== undefined);
}

describe("les défis d'entraînement du duel", () => {
  it("sont une vingtaine, d'identifiants uniques", () => {
    expect(DEFIS.length).toBeGreaterThanOrEqual(18);
    expect(DEFIS.length).toBeLessThanOrEqual(24);
    expect(new Set(DEFIS.map((d) => d.id)).size).toBe(DEFIS.length);
  });

  it("n'emploient que des cartes, des lieux et des leçons que le moteur connaît", () => {
    for (const d of DEFIS) {
      for (const id of [...d.toi.main, ...d.lui.main]) expect(Object.hasOwn(CATALOGUE_DU_DUEL, id), `${d.id} : ${id}`).toBe(true);
      if (d.lieu) expect(Object.hasOwn(LIEUX, d.lieu), d.id).toBe(true);
      const connue = (REGLES_DE_BASE as readonly string[]).includes(d.lecon) || Object.hasOwn(MOTS, d.lecon) || (d.lecon.startsWith("panoplie:") && Object.hasOwn(PANOPLIES, d.lecon.slice(9)));
      expect(connue, `${d.id} : leçon ${d.lecon}`).toBe(true);
      expect(leconPresente(d), `${d.id} : la leçon ${d.lecon} ne se voit pas`).toBe(true);
    }
  });

  it("posent des camps lisibles", () => {
    for (const d of DEFIS) {
      for (const c of [d.toi, d.lui]) {
        expect(c.main.length, d.id).toBeGreaterThanOrEqual(2);
        expect(c.main.length, d.id).toBeLessThanOrEqual(5);
        expect(Number.isSafeInteger(c.vie) && c.vie >= 1, d.id).toBe(true);
        expect(Number.isSafeInteger(c.energie) && c.energie >= 0 && c.energie <= 6, d.id).toBe(true);
        if (c.repos) expect(c.repos.length, d.id).toBe(c.main.length);
      }
      expect(d.manche >= 1 && d.but.manches >= 1 && d.but.manches <= 4, d.id).toBe(true);
      if (d.adversaire !== "libre") expect(d.adversaire.annonce.length, d.id).toBe(d.but.manches);
    }
  });

  it("disent tout en mots, sans signes, et en peu de mots", () => {
    for (const d of DEFIS) {
      for (const texte of [d.titre, d.consigne, d.indice]) expect(SIGNES_INTERDITS.test(texte), `${d.id} : « ${texte} »`).toBe(false);
      expect(motsDe(d.titre), d.id).toBeLessThanOrEqual(5);
      expect(motsDe(d.consigne), d.id).toBeLessThanOrEqual(14);
      expect(motsDe(d.indice), d.id).toBeLessThanOrEqual(20);
    }
  });

  describe.each(DEFIS.map((d) => [d.id, d] as const))("%s", (_id, d) => {
    const bilan = resoudre(d);
    it("a une solution", () => {
      expect(bilan.solution, "aucune suite de cartes ne réussit").not.toBeNull();
    });
    it("n'est pas réussi par n'importe quel premier coup", () => {
      expect(bilan.premiers.some((p) => !p.bon), bilan.premiers.map((p) => p.carte).join(", ")).toBe(true);
    });
    it("ne se réussit pas au hasard plus d'une fois sur deux", () => {
      expect(bilan.hasard).toBeLessThanOrEqual(50);
    });
  });

  it("se jouent par la partie d'un défi : départ posé, coup annoncé, issue", () => {
    const d = DEFIS.find((x) => x.adversaire !== "libre" && x.lui.main.length >= 2)!;
    const { a, b, m } = departDuDefi(d);
    expect(a.vie).toBe(d.toi.vie);
    expect(b.energie).toBe(d.lui.energie);
    expect(m).toBe(d.manche);
    const annonce = (d.adversaire as { annonce: readonly string[] }).annonce;
    const i = d.lui.main.indexOf(annonce[0]!);
    expect(coupAnnonce(d, b, 0)).toBe(i);
    // la carte annoncée se repose : il joue sa première carte prête
    const repos = d.lui.main.map((_, j) => (j === i ? 2 : 0));
    expect(coupAnnonce(d, { repos }, 0)).toBe(repos.findIndex((r) => r === 0));
    const libre = DEFIS.find((x) => x.adversaire === "libre")!;
    expect(() => coupAnnonce(libre, b, 0)).toThrow();
    // l'issue : l'autre à terre, soi à terre, encore debout à la fin
    expect(issueDuDefi(d, { vie: 3 }, { vie: 0 }, true, 1)).toBe("reussi");
    expect(issueDuDefi(d, { vie: 0 }, { vie: 3 }, true, 1)).toBe("rate");
    expect(issueDuDefi({ ...d, but: { type: "gagner", manches: 2 } }, { vie: 3 }, { vie: 3 }, false, 1)).toBe("en-cours");
    expect(issueDuDefi({ ...d, but: { type: "gagner", manches: 2 } }, { vie: 3 }, { vie: 3 }, false, 2)).toBe("rate");
    expect(issueDuDefi({ ...d, but: { type: "survivre", manches: 2 } }, { vie: 3 }, { vie: 3 }, false, 2)).toBe("reussi");
  });

  it("vont des plus simples aux plus rusés : les règles de base d'abord, les adversaires libres à la fin", () => {
    const base = (d: Defi): boolean => (REGLES_DE_BASE as readonly string[]).includes(d.lecon);
    const dernierDeBase = DEFIS.map(base).lastIndexOf(true);
    const premierAutre = DEFIS.findIndex((d) => !base(d));
    expect(dernierDeBase).toBeLessThan(premierAutre);
    const libres = DEFIS.map((d, i) => (d.adversaire === "libre" ? i : -1)).filter((i) => i >= 0);
    expect(libres.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...libres)).toBeGreaterThanOrEqual(DEFIS.length - 5);
    const longueur = DEFIS.map((d) => d.but.manches);
    expect(longueur.slice(-5).reduce((s, n) => s + n, 0)).toBeGreaterThan(longueur.slice(0, 5).reduce((s, n) => s + n, 0));
  });
});
