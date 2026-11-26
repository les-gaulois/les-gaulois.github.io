import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CLAUDE.md est relu à chaque action de chaque session et de chaque sous-agent : il reste court.
// Mesure du 26 novembre 2026 : il était passé de 5 000 à 53 000 caractères en trois semaines.
// Le détail d'une fonction va dans docs/CARTE-DU-PROJET.md ou docs/, et CLAUDE.md n'en garde qu'une ligne.
const LIMITE_CLAUDE_MD = 25_000;

const lire = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

describe("CLAUDE.md", () => {
  const texte = lire("CLAUDE.md");

  it(`tient en ${LIMITE_CLAUDE_MD} caractères au plus`, () => {
    expect(texte.length).toBeLessThanOrEqual(LIMITE_CLAUDE_MD);
  });

  it("ne renvoie qu'à des documents qui existent", () => {
    const renvois = [...new Set(texte.match(/docs\/[\w./-]+\.md/g) ?? [])];
    expect(renvois.length).toBeGreaterThan(0);
    for (const r of renvois) expect(existsSync(r), r).toBe(true);
  });
});

describe.each([
  ["docs/DIRECTION.md", "docs/direction"],
  ["docs/DESIGN.md", "docs/design"],
])("le sommaire de %s", (sommaire, dossier) => {
  const liens = [...lire(sommaire).matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => `docs/${m[1]}`).filter((l) => l.startsWith(`${dossier}/`));
  const parties = readdirSync(dossier).filter((f) => f.endsWith(".md")).map((f) => `${dossier}/${f}`);

  it("mène à des parties qui existent", () => {
    expect(liens.length).toBeGreaterThan(0);
    for (const l of liens) expect(existsSync(l), l).toBe(true);
  });

  it("donne chaque partie du dossier, une fois", () => {
    expect([...liens].sort()).toEqual([...parties].sort());
  });

  it("donne les parties dans l'ordre de leurs numéros", () => {
    const ordre = (f: string) => f.replace(/^.*\//, "").replace(/-[a-z].*$/, "").split("-").map(Number);
    const tri = [...liens].sort((a, b) => {
      const [x, y] = [ordre(a), ordre(b)];
      return (x[0] ?? 0) - (y[0] ?? 0) || (x[1] ?? 0) - (y[1] ?? 0);
    });
    expect(liens).toEqual(tri);
  });
});
