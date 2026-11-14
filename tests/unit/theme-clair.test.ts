import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Le thème clair « Neige Marine » (14 novembre 2026) : ce que la feuille de style doit tenir pour rester lisible.
// Voir docs/DESIGN.md, « Le thème clair ».
const CSS = readFileSync("src/styles/global.css", "utf8").replace(/\r\n/g, "\n");
/** La feuille sans ses commentaires : un commentaire peut citer une couleur d'avant. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (commentaire) => commentaire.replace(/[^\n]/g, " "));

const canal = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => canal(parseInt(h.slice(i, i + 2), 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}

/** Les jetons d'un bloc : `{ "--color-navy": "#ffffff", … }`, pour les valeurs écrites en hexadécimal. */
function jetons(bloc: string): Record<string, string> {
  return Object.fromEntries([...bloc.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6});/g)].map((m) => [m[1], m[2]!.toLowerCase()]));
}
/** Le premier bloc `{ … }` qui suit `debut`. */
function bloc(debut: string): string {
  const i = CODE.indexOf(debut);
  if (i < 0) throw new Error(`bloc introuvable : ${debut}`);
  return CODE.slice(i, CODE.indexOf("}", i));
}

const page = { ...jetons(bloc("@theme {")), ...jetons(bloc("\n:root {")) };
const rouge = { ...page, ...jetons(bloc('\n[data-theme="rouge"] {')) };
const terminal = { ...page, ...jetons(bloc('\n:root[data-ambiance="console"][data-console="terminal"] {')) };
// La Direction telle qu'elle s'affiche : le thème rouge, puis la palette du Terminal rouge.
const terminalRouge = { ...rouge, ...jetons(bloc('\n:root[data-ambiance="console"][data-console="terminal"][data-theme="rouge"],')) };
const ilot = { ...page, ...jetons(bloc("\n.btn-primary,\n.stage-blue,")) };

describe("le thème clair", () => {
  it("n'écrit jamais un blanc en dur : l'écriture passe par var(--ecriture)", () => {
    // Un blanc n'est permis que comme valeur d'un jeton (--ecriture dans un îlot sombre, --color-navy, --sur-couleur…) ou
    // comme valeur initiale d'une @property. Partout ailleurs, `#fff` serait invisible sur la page blanche.
    const permis = /^\s*(--ecriture|--color-white|--sur-couleur|--color-navy|--color-night|--color-surface|initial-value):\s*#fff(fff)?;\s*$/i;
    const fautes = CODE.split("\n")
      .map((ligne, i) => ({ ligne, n: i + 1 }))
      .filter(({ ligne }) => /#fff(?![0-9a-f])|#ffffff(?![0-9a-f])|rgba?\(\s*255[ ,]+255[ ,]+255|[:\s,(]white[;,)\s]/i.test(ligne) && !permis.test(ligne))
      .map(({ ligne, n }) => `${n}: ${ligne.trim()}`);
    expect(fautes).toEqual([]);
  });

  it("la page est blanche et l'écriture marine", () => {
    expect(page["--color-navy"]).toBe("#ffffff");
    expect(page["--ecriture"]).toBe("#0a1230");
  });

  it.each([
    ["la page", page],
    ["le thème rouge", rouge],
    ["la Direction, en Terminal rouge", terminalRouge],
    ["le QG et le guide, en Terminal", terminal],
  ])("%s : textes à 4,5:1 au moins, contours à 3:1", (_nom, t) => {
    for (const fond of [t["--color-navy"]!, t["--color-surface"]!, t["--color-night"]!]) {
      expect(contraste(t["--ecriture"]!, fond), `écriture sur ${fond}`).toBeGreaterThanOrEqual(7);
      expect(contraste(t["--texte-courant"]!, fond), `texte courant sur ${fond}`).toBeGreaterThanOrEqual(7);
      for (const jeton of ["--color-muted", "--color-blue-text", "--color-warn", "--color-ok", "--color-danger", "--color-ally"]) {
        expect(contraste(t[jeton]!, fond), `${jeton} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contraste(t["--color-line-strong"]!, fond), `contour sur ${fond}`).toBeGreaterThanOrEqual(3);
    }
    // Le blanc sur le bouton principal, au repos et au survol.
    expect(contraste("#ffffff", t["--color-blue"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#ffffff", t["--color-blue-hover"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("un îlot sombre reprend l'écriture blanche et les jetons du thème bleu d'avant", () => {
    expect(ilot["--ecriture"]).toBe("#fff");
    expect(ilot["--color-white"]).toBe("#fff");
    for (const jeton of ["--color-muted", "--color-blue-text", "--color-warn", "--color-ok", "--color-danger", "--texte-courant", "--stage-muted"]) {
      expect(contraste(ilot[jeton]!, ilot["--color-surface"]!), `${jeton} sur une carte sombre`).toBeGreaterThanOrEqual(4.5);
    }
    // `color` y est reposée : la couleur héritée de `main` ne suivrait pas le jeton.
    expect(bloc("\n.btn-primary,\n.stage-blue,")).toMatch(/\n\s*color: var\(--texte-courant\);/);
  });

  it("l'anneau du focus ne se perd pas autour du bouton principal", () => {
    // `.btn-primary` repose --ecriture en blanc sur lui-même : un anneau en var(--ecriture), tracé hors du bouton, serait
    // blanc sur la page blanche. L'anneau prend --anneau, que seules les scènes colorées reposent.
    expect(bloc("\n:focus-visible {")).toMatch(/outline: 3px solid var\(--anneau\);/);
    expect(bloc("\n:root {")).toMatch(/--anneau: var\(--ecriture\);/);
    expect(bloc("\n.btn-primary,\n.stage-blue,")).not.toMatch(/--anneau/);
    expect(bloc("\n.stage-blue,\n.stage-indigo,\n.stage-wine,\n.card-accent {\n  --anneau")).toMatch(/--anneau: var\(--ecriture\);/);
  });

  it("le vert de la console se lit sur le blanc", () => {
    const vert = /--console-vert:\s*(#[0-9a-f]{6});/i.exec(bloc('\n:root[data-ambiance="console"][data-console="terminal"] {'))?.[1];
    expect(vert).toBeDefined();
    expect(contraste(vert!, terminal["--color-surface"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(vert!, terminal["--color-navy"]!)).toBeGreaterThanOrEqual(4.5);
  });
});
