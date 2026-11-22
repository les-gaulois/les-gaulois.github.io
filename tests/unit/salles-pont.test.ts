import { describe, expect, it } from "vitest";
import { FinSansCombat, PontDuMatch } from "../../src/components/village/duel-salles/pont";
import type { MatchDeSalle } from "../../src/lib/village/contrat-salles";

const MAIN = { arme: "gourdin", tete: "bonnet", haut: "tunique", pieds: "bottes", bas: "braies" };
const LIEU = { lieu: null, compagnon: null, passifs: [] };
const match = (o: Partial<MatchDeSalle> = {}): MatchDeSalle => ({
  match: 7, mise: 50, essai: false, moi: "b", adversaire: null, banniere: null, mains: { a: MAIN, b: MAIN }, options: { a: LIEU, b: LIEU },
  coups: [], manche: 1, vies: { a: 20, b: 20 }, pose: null, adverse_pose: false, ouverte_le: "2026-11-22T15:00:04.000Z",
  limite: "2026-11-22T15:00:34.000Z", fini: false, verdict: null, fin: null, gain: null, cagnotte: null, commence_le: "2026-11-22T15:00:00.000Z", fini_le: null, ...o,
});

describe("le pont entre la scène du duel et un match en direct", () => {
  it("rend la carte d'en face, de mon côté, dès que la manche est résolue au serveur", async () => {
    const p = new PontDuMatch(7, 0);
    const carte = p.attendre(1);
    p.relire(match({ pose: 2, adverse_pose: false }));
    expect(p.enAttente).toBe(true);
    expect(p.mancheAttendue).toBe(1);
    p.relire(match({ match: 8, coups: [[4, 2]] })); // un autre match : rien
    expect(p.enAttente).toBe(true);
    p.relire(match({ coups: [[4, 2]], manche: 2 })); // je suis b : sa carte est la première
    await expect(carte).resolves.toBe(4);
    expect(p.jouees).toBe(1);
    expect(p.enRetard(match({ coups: [[4, 2]] }))).toBe(false);
  });

  it("rejette la promesse quand le match finit sans la manche (le temps, un départ)", async () => {
    const p = new PontDuMatch(7, 1);
    const carte = p.attendre(2);
    const fini = match({ coups: [[4, 2]], fini: true, verdict: 1, fin: "temps" });
    p.relire(fini);
    await expect(carte).rejects.toBeInstanceOf(FinSansCombat);
    expect(p.enAttente).toBe(false);
  });

  it("dit quand la scène a des manches de retard sur le serveur", () => {
    const p = new PontDuMatch(7, 1);
    expect(p.enRetard(match({ coups: [[0, 1]] }))).toBe(false);
    expect(p.enRetard(match({ coups: [[0, 1], [2, 3]] }))).toBe(true);
    void p.attendre(2).catch(() => undefined);
    expect(p.enRetard(match({ coups: [[0, 1], [2, 3]] }))).toBe(false);
    p.echouer(new Error("refusé"));
    expect(p.enAttente).toBe(false);
  });
});
