/**
 * L'essai d'équilibre du duel, avec ses seuils. Mesure du 22 novembre 2026, 150 duels par paire (`scripts/essai-duel.ts`) :
 * 8,6 manches en moyenne, 13 au plus, 3 % d'égalités ; la garde-robe la plus faible (base) gagne 41 % de ses duels, la plus
 * forte 55 % ; une garde-robe modeste gagne 44 % contre une riche ou une divine. Le guerrier bat le hasard 80 fois sur 100,
 * l'apprenti 74, le druide 89 ; le guerrier bat l'apprenti 66 fois sur 100, le druide bat le guerrier 57 fois sur 100 (niveaux
 * provisoires de `machine.ts`). Les
 * seuils laissent la marge du petit nombre de duels joués ici ; le hasard suit une graine, l'essai rend toujours les mêmes
 * chiffres.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { essaiDEquilibre, joueurAuHasard, joueurMachine, partContre } from "../../src/lib/village/essai-duel";
import type { Releve } from "../../src/lib/village/essai-duel";

const LONG = 120_000;

describe("l'équilibre du duel", () => {
  let r: Releve;
  beforeAll(() => {
    r = essaiDEquilibre(16, "guerrier");
  }, LONG);
  const moyenneDeLaLigne = (a: string): number => Object.values(r.table[a]!).reduce((s, x) => s + x, 0) / Object.keys(r.table[a]!).length;

  it("un duel dure de six à onze manches en moyenne, jamais plus de seize, et finit rarement sur une égalité", () => {
    expect(r.manches / r.duels).toBeGreaterThanOrEqual(6);
    expect(r.manches / r.duels).toBeLessThanOrEqual(11);
    expect(r.pire).toBeLessThanOrEqual(16);
    expect(r.egalites / r.duels).toBeLessThanOrEqual(0.08);
  });

  it("aucune garde-robe ne gagne à coup sûr, ni ne perd à coup sûr", () => {
    for (const a of Object.keys(r.table)) {
      expect(moyenneDeLaLigne(a), a).toBeGreaterThanOrEqual(30);
      expect(moyenneDeLaLigne(a), a).toBeLessThanOrEqual(70);
    }
  });

  it("une garde-robe modeste peut battre une riche", () => {
    const t = r.table.modeste!;
    expect((t.riche! + t.divine!) / 2).toBeGreaterThanOrEqual(30);
  });
});

describe("les niveaux de la machine", () => {
  it("chacun bat le hasard", { timeout: LONG }, () => {
    expect(partContre(60, (h) => joueurMachine("apprenti", h), joueurAuHasard)).toBeGreaterThanOrEqual(60);
    expect(partContre(60, (h) => joueurMachine("guerrier", h), joueurAuHasard)).toBeGreaterThanOrEqual(68);
    expect(partContre(60, (h) => joueurMachine("druide", h), joueurAuHasard)).toBeGreaterThanOrEqual(75);
  });

  it("le guerrier bat l'apprenti, le druide bat le guerrier", { timeout: LONG }, () => {
    expect(partContre(60, (h) => joueurMachine("guerrier", h), (h) => joueurMachine("apprenti", h))).toBeGreaterThanOrEqual(55);
    expect(partContre(160, (h) => joueurMachine("druide", h), (h) => joueurMachine("guerrier", h))).toBeGreaterThanOrEqual(50);
  });
});
