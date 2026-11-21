import { describe, expect, it } from "vitest";
import { Planche, lireCouleur } from "../../src/lib/jeu/planche";
import {
  BORDS_DE_CARTE,
  BORDS_DU_PLATEAU,
  BORDS_DU_SOCLE,
  BORD_DE_LA_LUEUR,
  HAUTEUR_DE_TRAME,
  RARETES_DU_VESTIAIRE,
  VARIABLES_DU_VESTIAIRE,
  cadreDeBanniere,
  cadreDeCarte,
  coche,
  eclatDEssai,
  losangeDuSocle,
  lueur,
  plateau,
  socle,
  tonsDeCarte,
  trameDeCarte,
  viseur,
} from "../../src/lib/jeu/vestiaire";

// Les pièces en pixels du vestiaire du jeu « Mon Gaulois » (src/lib/jeu/vestiaire.ts, 21 novembre 2026) : leurs tailles, que
// la feuille 18-jeu-vestiaire.css tient pour acquises, et la lecture des cartes dans les deux thèmes.

const THEMES = ["clair", "sombre"] as const;

/** Le contraste WCAG entre deux couleurs pleines. */
function contraste(a: string, b: string): number {
  const lum = (c: string): number => {
    const [r, v, bl] = lireCouleur(c);
    const canal = (x: number): number => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * canal(r) + 0.7152 * canal(v) + 0.0722 * canal(bl);
  };
  const [haut, bas] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (haut + 0.05) / (bas + 0.05);
}

/** Les couleurs d'écriture des cartes : `--ecriture` et les jetons `--rarete-…-texte` de 01-socle.css, recopiés. */
const ECRITURES = {
  clair: { nom: "#0a1230", aucune: "#4a5677", commun: "#0b5cad", "peu-commun": "#2a3bc4", epique: "#6a1fd0", mystique: "#a50f24", legendaire: "#7d5900", divin: "#00706a" },
  sombre: { nom: "#ffffff", aucune: "#c0c9e2", commun: "#b5d8ff", "peu-commun": "#bcc5ff", epique: "#dcbcff", mystique: "#ffb5bd", legendaire: "#ffdd80", divin: "#c4fff7" },
} as const;

const pleines = (p: Planche): number => {
  let n = 0;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.pleine(x, y)) n++;
  return n;
};

describe("les cartes et les emplacements du vestiaire", () => {
  it("dessine un cadre plus grand que ses bords, au centre vide, pour chaque rareté et chaque thème", () => {
    const [haut, droite, bas, gauche] = BORDS_DE_CARTE;
    for (const rarete of RARETES_DU_VESTIAIRE)
      for (const theme of THEMES) {
        const p = cadreDeCarte(tonsDeCarte(rarete, theme));
        expect(p.width, rarete).toBeGreaterThan(gauche + droite);
        expect(p.height, rarete).toBeGreaterThan(haut + bas);
        // Le centre est vide : la feuille y pose le fond et la trame, qui ne s'étirent pas.
        for (let y = haut; y < p.height - bas; y++) for (let x = gauche; x < p.width - droite; x++) expect(p.pleine(x, y), `${rarete} ${x},${y}`).toBe(false);
        // Les coins sont taillés, la tranche est sous la carte.
        expect(p.pleine(0, 0)).toBe(false);
        expect(p.pleine(p.width - 1, p.height - 1)).toBe(false);
        expect(p.pleine(Math.floor(p.width / 2), p.height - 1)).toBe(true);
      }
  });

  it("pose une trame de quatre cases de large, qui se répète sans couture et fonce vers le bas", () => {
    expect(HAUTEUR_DE_TRAME % 4).toBe(0);
    for (const rarete of RARETES_DU_VESTIAIRE) {
      const p = trameDeCarte(tonsDeCarte(rarete, "clair"));
      expect([p.width, p.height]).toEqual([4, HAUTEUR_DE_TRAME]);
      const rangee = (y: number): number => [0, 1, 2, 3].filter((x) => p.pleine(x, y)).length;
      const haut = rangee(0) + rangee(1) + rangee(2) + rangee(3);
      const bas = rangee(p.height - 1) + rangee(p.height - 2) + rangee(p.height - 3) + rangee(p.height - 4);
      expect(haut).toBeLessThan(4);
      expect(bas).toBeGreaterThan(12);
    }
  });

  it("laisse lire le nom et la rareté d'une carte sur son fond, du haut au plus foncé du bas, dans les deux thèmes", () => {
    for (const theme of THEMES)
      for (const rarete of RARETES_DU_VESTIAIRE) {
        const t = tonsDeCarte(rarete, theme);
        for (const fond of [t.haut, t.bas]) {
          expect(contraste(ECRITURES[theme].nom, fond), `nom, ${rarete}, ${theme}`).toBeGreaterThanOrEqual(4.5);
          expect(contraste(ECRITURES[theme][rarete], fond), `rareté, ${rarete}, ${theme}`).toBeGreaterThanOrEqual(4.5);
        }
      }
  });

  it("garde au légendaire et au divin un bord à deux tons, et un seul aux autres", () => {
    for (const rarete of RARETES_DU_VESTIAIRE) {
      const t = tonsDeCarte(rarete, "clair");
      expect(t.bord !== t.bordOmbre, rarete).toBe(rarete === "legendaire" || rarete === "divin");
    }
  });
});

describe("les pièces de la scène", () => {
  it("dessine le cadre de la bannière, le socle, le viseur et le plateau plus grands que leurs bords", () => {
    const cadre = cadreDeBanniere();
    expect([cadre.width, cadre.height]).toEqual([9, 9]);
    expect(cadre.pleine(4, 4)).toBe(false);
    const s = socle();
    expect(s.width).toBeGreaterThan(BORDS_DU_SOCLE[1] + BORDS_DU_SOCLE[3]);
    expect(s.height).toBe(10);
    const v = viseur();
    expect([v.width, v.height]).toEqual([13, 13]);
    // Quatre équerres, rien entre elles : la case du milieu de chaque côté est vide.
    for (const [x, y] of [[6, 0], [6, 12], [0, 6], [12, 6], [6, 6]] as const) expect(v.pleine(x, y), `${x},${y}`).toBe(false);
    expect(v.pleine(1, 1)).toBe(true);
    for (const theme of THEMES) {
      const p = plateau(theme);
      const [haut, droite, bas, gauche] = BORDS_DU_PLATEAU;
      expect(p.width).toBeGreaterThan(gauche + droite);
      expect(p.height).toBeGreaterThan(haut + bas);
      // Sa face laisse passer un peu du fond du jeu, sans jamais descendre sous neuf dixièmes.
      const face = p.couleur(Math.floor(p.width / 2), haut + 1);
      expect(face?.[3]).toBeGreaterThanOrEqual(0.89);
      expect(face?.[3]).toBeLessThan(1);
    }
  });

  it("dessine une lueur pleine au centre, éteinte aux coins, dont les bords se répètent par huit cases", () => {
    for (const theme of THEMES) {
      const p = lueur(theme);
      expect([p.width, p.height]).toEqual([2 * BORD_DE_LA_LUEUR + 8, 2 * BORD_DE_LA_LUEUR + 8]);
      expect(p.pleine(0, 0)).toBe(false);
      let centre = 0;
      for (let y = BORD_DE_LA_LUEUR; y < BORD_DE_LA_LUEUR + 8; y++) for (let x = BORD_DE_LA_LUEUR; x < BORD_DE_LA_LUEUR + 8; x++) if (p.pleine(x, y)) centre++;
      expect(centre).toBeGreaterThan(48);
      expect(pleines(p)).toBeLessThan(p.width * p.height * 0.7);
    }
  });

  it("dessine la coche, l'éclat d'un essai et le losange du socle à leur taille", () => {
    expect([coche().width, coche().height]).toEqual([9, 9]);
    expect([eclatDEssai().width, eclatDEssai().height]).toEqual([7, 7]);
    expect([losangeDuSocle().width, losangeDuSocle().height]).toEqual([5, 5]);
  });
});

describe("les variables du vestiaire dans /village/kit.css", () => {
  it("ont chacune un nom unique, et une valeur dans les deux thèmes", () => {
    const noms = VARIABLES_DU_VESTIAIRE.map((v) => v.nom);
    expect(new Set(noms).size).toBe(noms.length);
    for (const rarete of RARETES_DU_VESTIAIRE) for (const piece of ["tuile", "trame", "fond"]) expect(noms).toContain(`${piece}-${rarete}`);
    for (const n of ["cadre", "socle", "losange", "lueur", "viseur", "coche", "eclat", "plateau"]) expect(noms).toContain(n);
    for (const variable of VARIABLES_DU_VESTIAIRE)
      for (const theme of THEMES) {
        const valeur = variable.valeur(theme);
        if (typeof valeur === "string") expect(valeur, variable.nom).toMatch(/^#[0-9a-f]{6}$/);
        else expect(pleines(valeur), variable.nom).toBeGreaterThan(0);
      }
  });

  it("ne disent « change avec le thème » que pour les pièces qui changent vraiment", () => {
    const empreinte = (v: Planche | string): string => (typeof v === "string" ? v : `${v.width}x${v.height}:${Array.from(v.data).join(",")}`);
    for (const variable of VARIABLES_DU_VESTIAIRE) expect(empreinte(variable.valeur("clair")) !== empreinte(variable.valeur("sombre")), variable.nom).toBe(variable.theme);
  });
});
