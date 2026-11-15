import { describe, expect, it } from "vitest";
import { IMAGE_GAULOIS, TENUE_DE_DEPART, imageDeLaScene } from "../../supabase/functions/code-discord/gaulois";
import { ligneSousLImage, niveauEnMots, phrasesDesInsignes } from "../../supabase/functions/code-discord/index";
import {
  COULEURS_DES_PRESTIGES,
  COULEURS_DU_PRISME,
  COULEUR_DE_LA_LEGENDE,
  FLAMME_LIGNES,
  couleursDeLaFlamme,
  couleursDesCrans,
  insignesDeLaScene,
  niveauAEcrire,
  texteDeLaSerie,
} from "../../supabase/functions/code-discord/insignes";
import { LIEUX, PHASES, type Scene } from "../../supabase/functions/code-discord/scene";
import { FLAMME, FLAMME_DOREE } from "../../src/lib/flamme-serie";
import { LEGEND_COLOR, PRESTIGE_COLORS, PRISM_COLORS, accountLabel, segmentColors } from "../../src/lib/niveau";
import type { AccountLevel } from "../../src/lib/schemas";

/**
 * Les insignes de /gaulois (15 novembre 2026, dessins de Claude Fable 5.2, `supabase/functions/code-discord/insignes.ts`) :
 * la fonction ne peut pas importer `src/`, ses copies doivent rester celles du site.
 */

/** Les cases d'une grille de lettres et d'une palette, comme `Planche.lettres` du site les poserait. */
const cases = (lignes: readonly string[], palette: Readonly<Record<string, string | undefined>>) =>
  lignes.flatMap((ligne) => Array.from(ligne, (lettre) => (lettre === "." ? null : (palette[lettre] ?? null))));

const NIVEAUX: AccountLevel[] = [
  ...Array.from({ length: 11 }, (_, prestige) => ({ level: 62, prestige, legend: false })),
  { level: 100, prestige: 10, legend: false },
  { level: 100, prestige: 10, legend: true },
  { level: 1, prestige: 0, legend: false },
];

describe("les copies du site dans la fonction", () => {
  it("dessinent la même flamme, normale et dorée, case pour case", () => {
    for (const [doree, site] of [
      [false, FLAMME],
      [true, FLAMME_DOREE],
    ] as const) {
      expect(FLAMME_LIGNES[0]!.length).toBe(site.largeur);
      expect(FLAMME_LIGNES.length).toBe(site.hauteur);
      expect(cases(FLAMME_LIGNES, couleursDeLaFlamme(doree))).toEqual(site.cases);
    }
  });

  it("gardent les couleurs des prestiges et la règle des crans du site", () => {
    expect(COULEURS_DES_PRESTIGES).toEqual(PRESTIGE_COLORS);
    expect(COULEUR_DE_LA_LEGENDE).toBe(LEGEND_COLOR);
    expect(COULEURS_DU_PRISME).toEqual(PRISM_COLORS);
    for (const n of NIVEAUX) expect(couleursDesCrans(n), JSON.stringify(n)).toEqual(segmentColors(n));
  });

  it("disent le niveau avec les mots du site", () => {
    for (const n of NIVEAUX) expect(niveauEnMots(n)).toBe(accountLabel(n));
  });
});

describe("les insignes sur l'image de /gaulois", () => {
  const scene = (lieu: Scene["lieu"], phase: Scene["moment"]["phase"]): Scene => ({ lieu, moment: { phase } as Scene["moment"] });

  it("sans insigne, l'image d'avant au pixel près", () => {
    expect(insignesDeLaScene({})).toEqual([]);
    expect(insignesDeLaScene({ niveau: null, serie: null })).toEqual([]);
    const s = scene("place", "jour");
    expect(imageDeLaScene(TENUE_DE_DEPART, s, []).rgba).toEqual(imageDeLaScene(TENUE_DE_DEPART, s).rgba);
  });

  it("restent dans leur bande, à droite du logo, dans les quatre cas et pour les nombres les plus longs", () => {
    const series = [null, { victoires: 5, doree: false }, { victoires: 19, doree: true }, { victoires: 999, doree: true }];
    for (const niveau of [null, ...NIVEAUX]) {
      for (const serie of series) {
        for (const r of insignesDeLaScene({ niveau, serie })) {
          expect(r.x, JSON.stringify({ niveau, serie })).toBeGreaterThanOrEqual(74);
          expect(r.x + r.largeur).toBeLessThanOrEqual(178);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.y + r.hauteur).toBeLessThanOrEqual(81);
          expect(r.couleur).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("changent l'image seulement dans leur bande, et laissent le Gaulois devant, dans les vingt décors", () => {
    const niveau = { level: 62, prestige: 3, legend: false };
    const serie = { victoires: 12, doree: true };
    for (const lieu of LIEUX) {
      for (const phase of PHASES) {
        const s = scene(lieu, phase);
        const avant = imageDeLaScene(TENUE_DE_DEPART, s).rgba;
        const apres = imageDeLaScene(TENUE_DE_DEPART, s, insignesDeLaScene({ niveau, serie })).rgba;
        let change = 0;
        for (let i = 0; i < avant.length; i += 4) {
          if (avant[i] === apres[i] && avant[i + 1] === apres[i + 1] && avant[i + 2] === apres[i + 2]) continue;
          change++;
          const x = (i / 4) % IMAGE_GAULOIS.largeur;
          const y = Math.floor(i / 4 / IMAGE_GAULOIS.largeur);
          expect(x >= 74 && x < 178 && y < 81, `${lieu} ${phase} : (${x}, ${y})`).toBe(true);
        }
        expect(change, `${lieu} ${phase}`).toBeGreaterThan(0);
      }
    }
  });

  it("n'écrivent un niveau que s'il est entier, de 1 à 100 ; la couronne suit le nombre d'une flamme dorée", () => {
    expect(niveauAEcrire({ level: 62, prestige: 0, legend: false })).toBe("62");
    for (const level of [0, 101, 62.5, Number.NaN]) expect(niveauAEcrire({ level, prestige: 0, legend: false })).toBeNull();
    expect(texteDeLaSerie({ victoires: 7, doree: false })).toBe("7");
    expect(texteDeLaSerie({ victoires: 7, doree: true })).toBe("7^");
  });
});

describe("la description de /gaulois", () => {
  it("écrit sous l'image l'heure du relevé de la flamme et, avec l'emblème, la mention d'OpenFront ; rien sans insigne", () => {
    const flamme = { victoires: 7, auMoins: false, dates: "le 14 nov. 2026", doree: false, releve: "2026-11-15T05:53:45.391Z" };
    const niveau = { level: 62, prestige: 1, legend: false };
    expect(ligneSousLImage({ niveau, flamme })).toBe("-# Série au relevé du 15 novembre à 6 h 53. Niveau du compte OpenFront : tout le jeu. Couleurs © OpenFront and Contributors");
    expect(ligneSousLImage({ niveau: null, flamme })).toBe("-# Série au relevé du 15 novembre à 6 h 53.");
    expect(ligneSousLImage({ niveau, flamme: null })).toBe("-# Niveau du compte OpenFront : tout le jeu. Couleurs © OpenFront and Contributors");
    expect(ligneSousLImage({ niveau: null, flamme: null })).toBeNull();
    expect(ligneSousLImage(null)).toBeNull();
  });

  it("dit le niveau, puis la série et ses dates, et le record d'une flamme dorée ; rien sans insigne", () => {
    const flamme = { victoires: 7, auMoins: true, dates: "du 12 au 14 nov. 2026", doree: false, releve: "2026-11-01T09:05:00.000Z" };
    expect(phrasesDesInsignes({ niveau: { level: 94, prestige: 0, legend: false }, flamme })).toBe(
      "Son compte OpenFront, tout le jeu : Sans prestige · Niveau 94. Série en cours au relevé du 1er novembre à 10 h 05 : au moins 7 victoires d'affilée sous le tag, du 12 au 14 nov. 2026, sans défaite depuis.",
    );
    expect(phrasesDesInsignes({ niveau: null, flamme: { ...flamme, auMoins: false, doree: true } })).toBe(
      "Série en cours au relevé du 1er novembre à 10 h 05 : 7 victoires d'affilée sous le tag, du 12 au 14 nov. 2026, sans défaite depuis. C'est son record.",
    );
    expect(phrasesDesInsignes({ niveau: null, flamme: null })).toBe("");
    expect(phrasesDesInsignes(null)).toBe("");
  });
});
