import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext, runInThisContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { DUREE_D_UN_FOND_MS, FONDS_DU_JEU, type FondDuJeu, NOMS_DES_FONDS, VERSION_DES_FONDS, estUnFond, fondDuMoment, toileDuFond } from "../../src/lib/jeu/fonds-du-jeu";

describe("le fond du moment", () => {
  it("change toutes les 15 minutes et revient au premier après les huit", () => {
    expect(DUREE_D_UN_FOND_MS).toBe(15 * 60 * 1000);
    expect(fondDuMoment(0)).toEqual({ id: "p1-camp", indice: 0, finMs: DUREE_D_UN_FOND_MS });
    expect(fondDuMoment(DUREE_D_UN_FOND_MS - 1).id).toBe("p1-camp");
    expect(fondDuMoment(DUREE_D_UN_FOND_MS).id).toBe("p2-foret");
    expect(fondDuMoment(7 * DUREE_D_UN_FOND_MS).id).toBe("p8-lac");
    expect(fondDuMoment(8 * DUREE_D_UN_FOND_MS).id).toBe("p1-camp");
    const vus = new Set(Array.from({ length: 8 }, (_, i) => fondDuMoment(i * DUREE_D_UN_FOND_MS).id));
    expect(vus.size).toBe(FONDS_DU_JEU.length);
  });

  it("tourne au quart d'heure de l'horloge, le même pour tous au même instant", () => {
    const avant = Date.parse("2026-11-21T20:14:59.999Z");
    const apres = Date.parse("2026-11-21T20:15:00.000Z");
    expect(fondDuMoment(avant).id).not.toBe(fondDuMoment(apres).id);
    expect(fondDuMoment(avant).finMs).toBe(apres);
    expect(fondDuMoment(apres + 7 * 60 * 1000).id).toBe(fondDuMoment(apres).id);
  });

  it("reste dans la liste même avant 1970", () => {
    const f = fondDuMoment(-1);
    expect(FONDS_DU_JEU).toContain(f.id);
    expect(f.finMs).toBe(0);
  });
});

describe("la toile en cases", () => {
  it("fait environ 640 × 360 cases sur un écran d'ordinateur, à une échelle entière", () => {
    expect(toileDuFond(1920, 1080)).toEqual({ largeur: 640, hauteur: 360, echelle: 3 });
    expect(toileDuFond(2560, 1440)).toEqual({ largeur: 640, hauteur: 360, echelle: 4 });
    expect(toileDuFond(3440, 1440)).toEqual({ largeur: 860, hauteur: 360, echelle: 4 });
  });

  it("garde des cases de deux pixels au moins sur un téléphone", () => {
    expect(toileDuFond(390, 844)).toEqual({ largeur: 195, hauteur: 422, echelle: 2 });
    expect(toileDuFond(0, 0).echelle).toBe(2);
  });
});

describe("les huit paysages publiés", () => {
  it("ont chacun un nom", () => {
    expect(Object.keys(NOMS_DES_FONDS).sort()).toEqual([...FONDS_DU_JEU].sort());
    expect(VERSION_DES_FONDS).not.toBe("");
  });

  for (const id of FONDS_DU_JEU) {
    it(`${id} se déclare dans window.FONDS sans rien dessiner au chargement`, () => {
      const code = readFileSync(join(process.cwd(), "public", "paysages", `${id}.js`), "utf8");
      expect(code).toContain("AGPL-3.0-only");
      // Le même dessin à chaque ouverture : aucun hasard sans graine.
      expect(code).not.toContain("Math.random");
      // Aucun appel réseau, aucune mémoire du navigateur.
      expect(code).not.toMatch(/\bfetch\(|localStorage|XMLHttpRequest/);
      const window: { FONDS?: unknown[] } = {};
      runInNewContext(code, { window, Math });
      expect(window.FONDS).toHaveLength(1);
      const fond = window.FONDS![0];
      expect(estUnFond(fond)).toBe(true);
      expect((fond as { id: string }).id).toBe(id);
      expect((fond as { nom: string }).nom).toBe(NOMS_DES_FONDS[id]);
    });

    // Un paysage qui plante laisserait le fond vide un quart d'heure : chacun monte et dessine sur une fausse toile, de jour
    // et de nuit, sur un écran d'ordinateur et sur un téléphone.
    it(`${id} monte et dessine sans erreur dans les deux thèmes, au bureau et au téléphone`, () => {
      const code = readFileSync(join(process.cwd(), "public", "paysages", `${id}.js`), "utf8");
      const window: { FONDS?: FondDuJeu[] } = {};
      // Dans le même domaine que le test (runInThisContext) : un contexte séparé rendrait les calques des dizaines de fois plus lents.
      (runInThisContext(`(function (window, document) {${code}
})`) as (w: object, d: object) => void)(window, fausseDocument());
      const fond = window.FONDS![0]!;
      for (const [l, h] of [[1920, 1080], [390, 844]] as const) {
        const { largeur, hauteur, echelle } = toileDuFond(l, h);
        for (const sombre of [false, true]) {
          fond.monter({ largeur, hauteur, sombre, echelle });
          const ctx = fauxContexte() as unknown as CanvasRenderingContext2D;
          for (let i = 0; i < 4; i++) fond.dessiner(ctx, i * 40_000, { x: 0.4, y: -0.3 });
        }
      }
    });
  }
});

/** Un contexte 2D qui accepte tout appel et rend des images de la bonne taille. */
function fauxContexte(): object {
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(cible, cle) {
      if (cle === "createImageData") return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (cle === "getImageData") return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (cle === "measureText") return () => ({ width: 0 });
      if (cle in cible) return cible[cle];
      return () => undefined;
    },
    set(cible, cle, valeur) {
      cible[cle] = valeur;
      return true;
    },
  });
}

/** Le seul usage du document par les paysages : créer des toiles hors écran pour leurs calques. */
function fausseDocument(): object {
  return {
    createElement: () => {
      const contexte = fauxContexte();
      return { width: 300, height: 150, getContext: () => contexte };
    },
  };
}
