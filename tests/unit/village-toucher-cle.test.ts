import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLE_DU_CARNET } from "../../src/lib/village/toucher";

/**
 * Le carnet des touchers de la place est effacé à la déconnexion (`forgetDrafts` de `src/lib/compte/api.ts`). Ce fichier-là
 * part sur toutes les pages : il recopie la clé au lieu d'importer `toucher.ts`, qui amènerait les phrases des Gaulois. Les
 * deux écritures doivent rester la même, sinon le carnet d'un membre resterait dans un navigateur partagé.
 */
const api = readFileSync("src/lib/compte/api.ts", "utf8");

describe("le carnet des touchers, effacé à la déconnexion", () => {
  it("porte la même clé dans la règle du toucher et dans l'effacement", () => {
    const cle = /export const VILLAGE_TOUCHER_KEY = "([^"]+)";/.exec(api)?.[1];
    expect(cle).toBe(CLE_DU_CARNET);
  });

  it("est retiré avec le brouillon de la Direction, sans que le fichier de toutes les pages importe les phrases", () => {
    expect(api).toMatch(/function forgetDrafts\(\): void \{[\s\S]*?localStorage\.removeItem\(VILLAGE_TOUCHER_KEY\);[\s\S]*?\}/);
    expect(api).not.toMatch(/from "[^"]*village\/(toucher|repliques-toucher)"/);
  });
});
