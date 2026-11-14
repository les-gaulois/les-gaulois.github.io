import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEINTES, teinteDuRang } from "../../src/lib/teintes";

// Les icônes en pastilles (palette 5, choisie par le pilote le 14 novembre 2026) : le guide du clan, puis les menus des
// parties du QG et de la Direction. Une couleur par rang, du rouge au rose, sur une case pâle de la même couleur. Voir
// docs/DESIGN.md, « Le guide du clan » et « Les icônes des parties ».
const CSS = readFileSync("src/styles/global.css", "utf8").replace(/\r\n/g, "\n");
const TEINTES_CSS = new Map([...CSS.matchAll(/\[data-teinte="(\d+)"\] \{\n {2}--teinte: (#[0-9a-f]{6});\n\}/g)].map((m) => [Number(m[1]), m[2]!]));

const canal = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rvb = (hex: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16)) as [number, number, number];
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * canal(r / 255) + 0.7152 * canal(g / 255) + 0.0722 * canal(b / 255);
}
function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}
const BLANC: [number, number, number] = [255, 255, 255];
/** Le fond des cartes du thème clair (`--color-surface` du bloc `@theme`), un blanc à peine bleuté : celui du guide. */
const SURFACE = rvb(/@theme \{[\s\S]*?--color-surface: (#[0-9a-f]{6});/.exec(CSS)![1]!);
/** `color-mix(in srgb, teinte 14%, fond)`, la case de la pastille : le mélange se fait sur les valeurs sRGB. */
const pastille = (c: [number, number, number], fond: [number, number, number]) => c.map((v, i) => v * 0.14 + fond[i]! * 0.86) as [number, number, number];

describe("les pastilles des icônes", () => {
  it("la feuille de style donne une couleur à chacune des teintes, ni plus ni moins", () => {
    expect([...TEINTES_CSS.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: TEINTES }, (_, i) => i + 1));
  });

  it.each([...TEINTES_CSS])("la teinte %i se lit sur le fond (4,5:1) et sur sa pastille (3:1)", (_, hex) => {
    const c = rvb(hex);
    expect(contraste(c, BLANC)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c, SURFACE)).toBeGreaterThanOrEqual(4.5);
    // La case, sur le blanc des consoles comme sur le fond à peine bleuté des cartes.
    expect(contraste(c, pastille(c, BLANC))).toBeGreaterThanOrEqual(3);
    expect(contraste(c, pastille(c, SURFACE))).toBeGreaterThanOrEqual(3);
  });

  it.each([...TEINTES_CSS])("la teinte %i n'est pas un vert : le vert reste la voix de la machine", (_, hex) => {
    const [r, g, b] = rvb(hex);
    expect(g > r + 40 && g > b + 40).toBe(false);
  });

  it("les icônes prennent les teintes dans l'ordre de leur liste, puis recommencent", () => {
    expect(Array.from({ length: 11 }, (_, i) => teinteDuRang(i))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(teinteDuRang(TEINTES)).toBe(1);
    expect(teinteDuRang(TEINTES + 2)).toBe(3);
  });

  it("deux icônes qui se suivent n'ont jamais la même couleur", () => {
    const couleurs = Array.from({ length: 30 }, (_, i) => TEINTES_CSS.get(teinteDuRang(i)));
    for (let i = 1; i < couleurs.length; i++) expect(couleurs[i]).not.toBe(couleurs[i - 1]);
  });

  it("les menus des parties n'ont plus d'icône en vert de terminal ni de lueur", () => {
    const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(CODE).not.toMatch(/\.icone-partie \{[^}]*--console-vert/);
    expect(CODE).not.toMatch(/\.(guide-plan-icone|guide-icone)[^{]*\{[^}]*--console-vert/);
  });
});
