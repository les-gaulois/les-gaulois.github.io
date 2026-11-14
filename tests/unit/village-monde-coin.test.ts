import { describe, expect, it } from "vitest";
import { hasardDe } from "../../src/lib/village/mouvement";
import { type Zone, marcheurA, marcheurDansSonCoin, promener } from "../../src/lib/village/monde/marche";

/**
 * Quand le plan du monde change (bâti d'abord sans Gaulois, puis pour tous ; une terrasse de plus), le coin d'une bête
 * bouge : une bête qui n'y est plus est reposée au lieu de traverser la colline (relecture du 14 novembre 2026).
 */
const coin: Zone = { de: 100, a: 300, haut: 400, bas: 440 };

describe("une bête dans son coin", () => {
  it("y reste, à l'arrêt comme en marche, tant qu'elle s'y promène", () => {
    const hasard = hasardDe(7);
    const m = marcheurA(150, 420, hasard);
    for (let t = 0; t < 2000; t++) {
      promener(m, coin, -9999, hasard);
      expect(marcheurDansSonCoin(m, coin)).toBe(true);
    }
  });

  it("n'y est plus quand le coin a bougé : elle, ou ce qu'elle vise, est ailleurs", () => {
    const hasard = hasardDe(11);
    const m = marcheurA(150, 420, hasard);
    expect(marcheurDansSonCoin(m, { ...coin, haut: 506, bas: 546 })).toBe(false);
    expect(marcheurDansSonCoin({ ...m, but: { x: 900, y: 420 } }, coin)).toBe(false);
    expect(marcheurDansSonCoin({ ...m, but: null, suite: [{ x: 120, y: 700 }] }, coin)).toBe(false);
  });
});
