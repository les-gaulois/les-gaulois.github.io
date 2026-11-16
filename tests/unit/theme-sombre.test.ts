import { describe, expect, it } from "vitest";
import { feuilleEntiere } from "./feuilles-graphe";

// Le thème sombre « Nuit Marine » (16 novembre 2026), que le visiteur choisit par le bouton de l'en-tête : ce que la
// feuille de style doit tenir pour rester lisible. Voir docs/DESIGN.md, « Le thème sombre ».
const CSS = feuilleEntiere();
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
function jetons(bloc: string): Record<string, string> {
  return Object.fromEntries([...bloc.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6});/g)].map((m) => [m[1], m[2]!.toLowerCase()]));
}
/** Le sélecteur et le premier bloc `{ … }` qui suivent `debut`. */
function regle(debut: string): { selecteur: string; bloc: string } {
  const i = CODE.indexOf(debut);
  if (i < 0) throw new Error(`bloc introuvable : ${debut}`);
  const ouvre = CODE.indexOf("{", i);
  return { selecteur: CODE.slice(i, ouvre), bloc: CODE.slice(ouvre, CODE.indexOf("}", ouvre)) };
}

const clair = { ...jetons(regle("@theme {").bloc), ...jetons(regle("\n:root {").bloc) };
const regleSombre = regle('\n:root[data-mode="sombre"],');
const regleRouge = regle('\n:root[data-mode="sombre"][data-theme="rouge"],');
const ilot = jetons(regle("\n.btn-primary,\n.stage-blue,").bloc);
const sombre = { ...clair, ...jetons(regleSombre.bloc) };
// Le vert du terminal n'est posé qu'au QG, à la Direction, au guide et sur la Carte, comme en clair.
const regleVert = regle('\n:root[data-mode="sombre"][data-ambiance="console"][data-console="terminal"] {');
// Le QG : le Terminal garde son bleu de bouton, que le thème sombre ne repose pas.
const terminal: Record<string, string> = { ...sombre, ...jetons(regleVert.bloc), "--color-blue": "#0a4fd6", "--color-blue-hover": "#083fae" };
const rouge: Record<string, string> = { ...sombre, ...jetons(regleVert.bloc), ...jetons(regleRouge.bloc) };

describe("le thème sombre", () => {
  it("la page est bleu marine et l'écriture blanche", () => {
    expect(sombre["--color-navy"]).toBe("#0a1230");
    expect(sombre["--ecriture"]).toBe("#fff");
    expect(regleSombre.bloc).toMatch(/color-scheme: dark;/);
  });

  it("reprend les valeurs des îlots sombres : un seul bleu, celui d'avant le 14 novembre", () => {
    for (const [jeton, valeur] of Object.entries(ilot)) {
      // Le texte secondaire d'une scène colorée est plus pâle que celui de la page.
      // Et --color-white suit déjà --ecriture sur la racine (@theme) : il n'a pas à y être reposé.
      if (jeton === "--stage-muted" || jeton === "--color-white") continue;
      expect(sombre[jeton], jeton).toBe(valeur);
    }
  });

  it("passe devant la palette claire du Terminal, au QG, au guide, à la Carte et à la Direction", () => {
    // Le QG pose ses jetons clairs avec trois sélecteurs d'attribut, la Carte et le guide avec quatre (07-calme.css), la
    // Direction avec quatre : le thème sombre doit en compter un de plus à chaque fois.
    expect(regleSombre.selecteur).toContain(':root[data-mode="sombre"][data-ambiance="console"][data-console="terminal"],');
    expect(regleSombre.selecteur).toContain(':root[data-mode="sombre"][data-lettres="onciale"][data-ambiance="console"][data-console="terminal"]');
    expect(regleRouge.selecteur).toContain(':root[data-mode="sombre"][data-ambiance="console"][data-console="terminal"][data-theme="rouge"],');
    expect(regleRouge.selecteur).toContain(':root[data-mode="sombre"][data-ambiance="console"][data-console="terminal"] [data-theme="rouge"]');
    // Tout jeton de couleur qu'une palette claire pose est reposé en sombre.
    const poses = (debut: string) => Object.keys(jetons(regle(debut).bloc));
    for (const jeton of poses('\n:root[data-ambiance="console"][data-console="terminal"] {')) {
      if (jeton === "--color-blue" || jeton === "--color-blue-hover") continue;
      expect({ ...jetons(regleSombre.bloc), ...jetons(regleVert.bloc) }, jeton).toHaveProperty(jeton);
    }
    for (const debut of ['\n[data-theme="rouge"] {', '\n:root[data-ambiance="console"][data-console="terminal"][data-theme="rouge"],']) {
      for (const jeton of poses(debut)) expect(jetons(regleRouge.bloc), jeton).toHaveProperty(jeton);
    }
  });

  it.each([
    ["la page", sombre as Record<string, string>],
    ["le QG, en Terminal", terminal],
    ["la Direction, en rouge", rouge],
  ])("%s : textes à 4,5:1 au moins, contours à 3:1", (_nom, t) => {
    for (const fond of [t["--color-navy"]!, t["--color-surface"]!, t["--color-night"]!]) {
      expect(contraste(t["--ecriture"]!, fond), `écriture sur ${fond}`).toBeGreaterThanOrEqual(7);
      expect(contraste(t["--texte-courant"]!, fond), `texte courant sur ${fond}`).toBeGreaterThanOrEqual(7);
      for (const jeton of ["--color-muted", "--color-blue-text", "--color-warn", "--color-ok", "--color-danger", "--color-ally", "--console-vert"]) {
        // Le vert du terminal n'existe pas sur une page sans console.
        if (jeton === "--console-vert" && !t[jeton]) continue;
        expect(contraste(t[jeton]!, fond), `${jeton} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contraste(t["--color-line-strong"]!, fond), `contour sur ${fond}`).toBeGreaterThanOrEqual(3);
    }
    expect(contraste("#ffffff", t["--color-blue"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#ffffff", t["--color-blue-hover"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("le vert du terminal n'est pas posé sur les pages sans console", () => {
    expect(jetons(regleSombre.bloc)).not.toHaveProperty("--console-vert");
    expect(terminal["--console-vert"]).toBe("#4ade80");
  });

  it("les pastilles des icônes ont onze teintes claires, lisibles sur le marine et le bordeaux, sans vert", () => {
    const teintes = Object.entries(jetons(regle('\n:root[data-mode="sombre"] {').bloc)).filter(([jeton]) => jeton.startsWith("--teinte-sombre-"));
    expect(teintes.map(([jeton]) => jeton)).toEqual(Array.from({ length: 11 }, (_, i) => `--teinte-sombre-${i + 1}`));
    const rvb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));
    const hexDe = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    for (const [jeton, hex] of teintes) {
      for (const carte of [sombre["--color-surface"]!, sombre["--color-navy"]!, rouge["--color-surface"]!]) {
        expect(contraste(hex, carte), `${jeton} sur ${carte}`).toBeGreaterThanOrEqual(4.5);
        // La case : color-mix(in srgb, teinte 14%, carte).
        const pastille = hexDe(rvb(hex).map((v, i) => v * 0.14 + rvb(carte)[i]! * 0.86));
        expect(contraste(hex, pastille), `${jeton} sur sa pastille`).toBeGreaterThanOrEqual(3);
      }
      const [r, g, b] = rvb(hex) as [number, number, number];
      expect(g > r + 40 && g > b + 40, `${jeton} n'est pas un vert`).toBe(false);
      // Chaque teinte du thème clair a sa règle en sombre.
      const n = jeton.replace("--teinte-sombre-", "");
      expect(CODE).toContain(`--teinte: var(--teinte-sombre-${n});`);
    }
  });

  it.each([
    ["en clair", regle("\n:root {").bloc],
    ["en sombre", regleSombre.bloc],
  ])("la grille « Quand jouer » %s : chaque chiffre se lit sur sa case", (_nom, bloc) => {
    // Le chiffre est marine, ou blanc par var(--sur-couleur).
    const valeur = (jeton: string) => new RegExp(`${jeton}: (#[0-9a-f]{6}|var\\(--sur-couleur\\));`).exec(bloc)?.[1]?.replace("var(--sur-couleur)", "#ffffff");
    for (let pas = 1; pas <= 6; pas++) {
      const [fond, texte] = [valeur(`--chaleur-${pas}`), valeur(`--chaleur-${pas}-texte`)];
      expect(fond, `pas ${pas}`).toBeDefined();
      expect(texte, `pas ${pas}`).toBeDefined();
      expect(contraste(texte!, fond!), `pas ${pas}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
