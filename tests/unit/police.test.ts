import { describe, expect, it } from "vitest";
import { aire, casesPleines, contours, type Case } from "../../src/lib/police/cases";
import {
  APPROCHE,
  APPROCHE_CHIFFRES,
  CASE,
  CHIFFRES,
  CORPS,
  ESPACE,
  ESPACE_INSECABLE,
  LETTRES,
  MARQUES,
  caracteresDe,
  chasse,
  composer,
  dessin,
  glyphesOnciale,
  largeur,
} from "../../src/lib/police/onciale";
import { largeurTexte, motLePlusLong } from "../../src/lib/police/largeur";

const glyphes = glyphesOnciale();
/** Tous les caractères qu'écrit la police, minuscules comprises. */
const ecrits = new Set([...glyphes.keys()].flatMap(caracteresDe));
const bas = (d: { haut: number; rangees: readonly string[] }) => d.haut - d.rangees.length + 1;

describe("l'onciale de cases : les dessins", () => {
  it("chaque dessin est une grille régulière de cases, sans rangée vide au bord", () => {
    for (const [ch, d] of glyphes) {
      expect(d.rangees.length, ch).toBeGreaterThan(0);
      for (const r of d.rangees) {
        expect(r, ch).toMatch(/^[#.]+$/);
        expect(r.length, `${ch} : ${r}`).toBe(largeur(d));
      }
      expect(d.rangees[0], ch).toContain("#");
      expect(d.rangees.at(-1), ch).toContain("#");
      // Des hampes à y = 12 au plus, des jambages à y = -3 au moins : la ligne de texte garde sa hauteur.
      expect(d.haut, ch).toBeLessThanOrEqual(12);
      expect(bas(d), ch).toBeGreaterThanOrEqual(-3);
    }
  });

  it("chaque lettre remplit le corps, posée sur la ligne de base", () => {
    for (const [ch, d] of Object.entries(LETTRES)) {
      expect(d.haut, ch).toBeGreaterThanOrEqual(CORPS - 1);
      expect(bas(d), ch).toBeLessThanOrEqual(0);
      const rangee0 = d.rangees[d.haut];
      expect(rangee0, `${ch} : la rangée de la ligne de base`).toContain("#");
    }
  });

  it("les chiffres ont tous la même chasse et la hauteur du corps : les colonnes de nombres restent droites", () => {
    const chiffres = Object.values(CHIFFRES);
    expect(Object.keys(CHIFFRES).sort()).toEqual([..."0123456789"]);
    for (const d of chiffres) {
      expect(d.haut).toBe(CORPS - 1);
      expect(d.rangees).toHaveLength(CORPS);
    }
    expect(new Set([...glyphes].filter(([ch]) => /\d/.test(ch)).map(([, d]) => chasse(d))).size).toBe(1);
    expect(chasse(glyphes.get("0")!)).toBe(largeur(CHIFFRES["0"]!) + 2 * APPROCHE_CHIFFRES);
  });

  it("écrit tout le français des titres, majuscules et minuscules, et les signes des chiffres", () => {
    const attendus = "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒ0123456789.,;:!?'«»()[]-+/%#&_·…";
    const extra = [0x2019, 0x2013, 0x2212, 0x2014].map((c) => String.fromCharCode(c));
    for (const c of [...attendus, ...attendus.toLowerCase(), ...extra]) expect(ecrits.has(c), JSON.stringify(c)).toBe(true);
  });

  it("une minuscule s'écrit comme sa majuscule, et les mots ont la même largeur dans les deux cas", () => {
    expect(caracteresDe("E")).toEqual(["E", "e"]);
    expect(caracteresDe("É")).toEqual(["É", "é"]);
    expect(caracteresDe("7")).toEqual(["7"]);
    expect(largeurTexte("Classement")).toBe(largeurTexte("CLASSEMENT"));
  });
});

describe("l'onciale de cases : les accents", () => {
  it("l'accent se pose au-dessus du corps, avec une rangée d'air", () => {
    const e = glyphes.get("É")!;
    expect(e.haut).toBe(MARQUES.aigu.haut);
    const air = e.rangees[e.haut - CORPS];
    expect(air, "la rangée y = 10").toMatch(/^\.+$/);
    // Le corps de la lettre n'a pas bougé : mêmes cases que le E.
    const corps = e.rangees.slice(e.haut - (CORPS - 1));
    expect(corps.join("\n").replace(/\./g, "")).toBe(LETTRES.E!.rangees.join("\n").replace(/\./g, ""));
  });

  it("la cédille se pose sous la ligne de base", () => {
    const c = glyphes.get("Ç")!;
    expect(bas(c)).toBe(bas(MARQUES.cedille));
    expect(c.haut).toBe(LETTRES.C!.haut);
  });

  it("une marque plus large que la lettre élargit le dessin au lieu de déborder", () => {
    const i = composer(dessin(1, "#\n#"), dessin(3, "###"));
    expect(largeur(i)).toBe(3);
    expect(i.rangees).toEqual(["###", "...", ".#.", ".#."]);
  });
});

describe("des cases aux contours", () => {
  const somme = (cases: Case[]) => contours(cases).reduce((s, b) => s + aire(b), 0);

  it("une case est un carré, parcouru dans le sens inverse des aiguilles d'une montre", () => {
    const [boucle, ...autres] = contours([[0, 0]]);
    expect(autres).toEqual([]);
    expect(boucle).toHaveLength(4);
    expect(aire(boucle!)).toBe(1);
  });

  it("une suite de cases ne garde que ses quatre coins", () => {
    const [boucle] = contours([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(boucle).toHaveLength(4);
    expect(aire(boucle!)).toBe(3);
  });

  it("un anneau a un trou, parcouru dans l'autre sens", () => {
    const anneau: Case[] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1) anneau.push([x, y]);
    const boucles = contours(anneau);
    expect(boucles).toHaveLength(2);
    expect(boucles.map(aire).sort((a, b) => a - b)).toEqual([-1, 9]);
  });

  it("deux cases qui ne se touchent que par un coin restent deux régions", () => {
    const boucles = contours([
      [0, 0],
      [1, 1],
    ]);
    expect(boucles).toHaveLength(2);
    expect(boucles.every((b) => aire(b) === 1)).toBe(true);
  });

  it("le contour de chaque signe couvre exactement ses cases", () => {
    for (const [ch, d] of glyphes) {
      const cases = casesPleines(d);
      expect(somme(cases), ch).toBe(cases.length);
    }
  });
});

describe("la largeur des titres", () => {
  it("compte les cases de chaque signe et de ses approches, en em", () => {
    const i = glyphes.get("I")!;
    expect(largeurTexte("I")).toBeCloseTo(((largeur(i) + 2 * APPROCHE) * CASE) / 1000);
    expect(largeurTexte("II")).toBeCloseTo(2 * largeurTexte("I"));
    expect(largeurTexte(" ")).toBeCloseTo((ESPACE * CASE) / 1000);
    expect(largeurTexte(" ")).toBeCloseTo((ESPACE_INSECABLE * CASE) / 1000);
  });

  it("donne une largeur aux caractères qu'elle n'a pas, sans s'arrêter", () => {
    expect(largeurTexte("Ж")).toBeGreaterThan(0);
    expect(largeurTexte("AЖ")).toBeGreaterThan(largeurTexte("A"));
  });

  it("le plus long mot d'un titre décide de sa taille ; l'espace insécable lie ses voisins", () => {
    expect(motLePlusLong("Calculateur et outils")).toBe(largeurTexte("Calculateur"));
    expect(motLePlusLong("Confidentialité")).toBeGreaterThan(motLePlusLong("Classement"));
    expect(motLePlusLong("21 h")).toBe(largeurTexte("21 h"));
    expect(motLePlusLong("")).toBe(0);
  });
});
