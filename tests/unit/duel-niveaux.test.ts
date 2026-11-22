/**
 * L'essai d'équilibre des trois niveaux de l'ordinateur du duel (`src/lib/village/essai-duel-contenu.ts`) : un joueur de bon
 * sens doit battre l'apprenti environ 8 fois sur 10, le guerrier 1 fois sur 2 et le druide 3 fois sur 10. La mesure complète
 * (`scripts/essai-duel-contenu.ts`, 600 paires, deux graines) a donné 80, 50 et 33 sur 100 ; ici 150 paires, d'où la marge.
 */
import { describe, expect, it } from "vitest";
import { BON_SENS, CIBLES_DES_NIVEAUX, NIVEAUX, NIVEAUX_DE_LA_MACHINE, NIVEAU_DES_BOSS } from "../../supabase/functions/code-discord/duel/contenu/niveaux";
import { bonSensContreLaMachine } from "../../src/lib/village/essai-duel-contenu";

const PAIRES = 150;
const MARGE = 7;

describe("les niveaux de la machine", () => {
  it("sont trois, de plus en plus forts, et le boss joue en guerrier", () => {
    expect(NIVEAUX_DE_LA_MACHINE).toEqual(["apprenti", "guerrier", "druide"]);
    const [a, g, d] = NIVEAUX_DE_LA_MACHINE.map((n) => NIVEAUX[n]);
    expect(a!.loin <= g!.loin && g!.loin <= d!.loin).toBe(true);
    expect(a!.fantaisie > g!.fantaisie && g!.fantaisie > d!.fantaisie).toBe(true);
    for (const n of NIVEAUX_DE_LA_MACHINE) {
      // deux manches devant au plus : le serveur refait ce calcul à chaque manche d'un duel qui compte
      expect(Number.isSafeInteger(NIVEAUX[n].loin) && NIVEAUX[n].loin >= 1 && NIVEAUX[n].loin <= 2).toBe(true);
      expect(NIVEAUX[n].fantaisie).toBeGreaterThan(0);
    }
    expect(NIVEAU_DES_BOSS).toBe("guerrier");
    expect(BON_SENS).toEqual({ fantaisie: 0.5, loin: 1 });
  });

  it.each(NIVEAUX_DE_LA_MACHINE.map((n) => [n] as const))("%s tient sa cible contre un joueur de bon sens", (niveau) => {
    const part = bonSensContreLaMachine(NIVEAUX[niveau], PAIRES);
    expect(Math.abs(part - CIBLES_DES_NIVEAUX[niveau]), `le joueur gagne ${part.toFixed(1)} sur 100`).toBeLessThanOrEqual(MARGE);
  }, 120_000);
});
