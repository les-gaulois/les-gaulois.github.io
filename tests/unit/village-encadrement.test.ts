import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as encadrement from "../../src/lib/village/vie-encadrement";
import * as releve from "../../src/lib/village/vie-releve";

/**
 * L'onglet « Village » de la Direction part au navigateur. Le robot des bulles (`vie-releve.ts`) importe le SDK d'Anthropic :
 * l'écran ne doit jamais en dépendre, même par un fichier intermédiaire. La relecture du 14 novembre 2026 l'avait relevé :
 * rien ne partait au navigateur, mais seulement grâce au tri de l'outil de construction.
 */
const lire = (chemin: string): string => readFileSync(chemin, "utf8");
const imports = (source: string): string[] => [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);

describe("la lecture de l'encadrement, à part du robot des bulles", () => {
  it("ne dépend de rien : ni du robot, ni du SDK d'Anthropic", () => {
    expect(imports(lire("src/lib/village/vie-encadrement.ts"))).toEqual([]);
  });

  // Depuis le retrait du monde du village (15 novembre 2026), l'onglet ne lit plus les bulles : il n'importe ni cette
  // lecture ni le robot. Il ne doit pas non plus s'en remettre à dépendre.
  it("n'est plus lue par l'écran de la Direction, qui n'importe jamais le fichier du robot", () => {
    for (const fichier of ["src/components/compte/DirectionVillage.tsx", "src/lib/village/direction.ts"]) {
      const lus = imports(lire(fichier));
      expect(lus.filter((i) => i.endsWith("/vie-encadrement") || i.endsWith("/vie-releve") || i.startsWith("@anthropic-ai/")), fichier).toEqual([]);
    }
  });

  it("reste la même chose vue du robot, qui la redonne", () => {
    expect(releve.lireVieDuVillage).toBe(encadrement.lireVieDuVillage);
    expect(releve.lirePlafond).toBe(encadrement.lirePlafond);
    expect(releve.PLAFOND_MAX).toBe(encadrement.PLAFOND_MAX);
  });
});
