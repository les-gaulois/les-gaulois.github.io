import { describe, expect, it } from "vitest";
import { TAILLE_TEXTES, aire, casesPleines, contours, tailler, type Case, type Point } from "../../src/lib/police/cases";
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
  it("chaque dessin est une grille régulière de cases, sans rangée ni colonne vide au bord", () => {
    for (const [ch, d] of glyphes) {
      expect(d.rangees.length, ch).toBeGreaterThan(0);
      for (const r of d.rangees) {
        expect(r, ch).toMatch(/^[#.]+$/);
        expect(r.length, `${ch} : ${r}`).toBe(largeur(d));
      }
      expect(d.rangees[0], ch).toContain("#");
      expect(d.rangees.at(-1), ch).toContain("#");
      // Ni colonne vide au bord : la lettre aurait un blanc de trop d'un côté (le P en a eu un, « OP ENFRONT »).
      expect(d.rangees.some((r) => r[0] === "#"), `${ch} : colonne de gauche`).toBe(true);
      expect(d.rangees.some((r) => r.at(-1) === "#"), `${ch} : colonne de droite`).toBe(true);
      // Rien au-dessus de y = 12 (les accents) ni sous y = -3 (la cédille) : la ligne de texte garde sa hauteur.
      expect(d.haut, ch).toBeLessThanOrEqual(12);
      expect(bas(d), ch).toBeGreaterThanOrEqual(-3);
    }
  });

  it("toutes les capitales ont la même hauteur, celle du corps, posées sur la ligne de base", () => {
    // Le pilote trouvait le L « trop grand par rapport aux autres lettres » : plus de hampe ni de jambage. Seule la queue
    // du Q passe sous la ligne de base, d'une rangée.
    for (const [ch, d] of Object.entries(LETTRES)) {
      expect(d.haut, ch).toBe(CORPS - 1);
      expect(bas(d), ch).toBe(ch === "Q" ? -1 : 0);
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

describe("le contour taillé des petits textes", () => {
  // Le réglage avec lequel scripts/generate-police.ts fabrique la police.
  const taille = TAILLE_TEXTES;
  const pres = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const contient = (boucle: readonly Point[], p: Point) => boucle.some((q) => pres(q, p));
  /** Vrai si les deux points se suivent dans la boucle : un seul côté les relie. */
  const seSuivent = (boucle: readonly Point[], a: Point, b: Point) => boucle.some((p, i) => pres(p, a) && pres(boucle[(i + 1) % boucle.length]!, b));
  const cases = (dessin: string): Case[] =>
    dessin
      .trim()
      .split("\n")
      .reverse()
      .flatMap((ligne, y) => [...ligne.trim()].flatMap((c, x): Case[] => (c === "#" ? [[x, y]] : [])));

  it("un escalier régulier devient un seul pan coupé, bien droit", () => {
    // Un triangle en escalier : quatre rangées de 4, 3, 2 et 1 cases.
    const escalier: Case[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4 - y; x++) escalier.push([x, y]);
    const [brut] = contours(escalier);
    const boucle = tailler(brut!, taille);
    // Plus aucun coin de marche, et la pente va d'un milieu de marche à l'autre sans sommet entre les deux.
    for (const coin of [[3, 1], [3, 2], [2, 2], [2, 3], [1, 3]] as const) expect(contient(boucle, coin), `${coin}`).toBe(false);
    const debut = boucle.findIndex((p) => pres(p, [3.5, 1]));
    expect(debut).toBeGreaterThanOrEqual(0);
    expect(pres(boucle[(debut + 1) % boucle.length]!, [1, 3.5])).toBe(true);
  });

  it("un vrai coin ne garde qu'un petit biseau, et un long côté reste droit", () => {
    const fut: Case[] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 6; y++) fut.push([x, y]);
    const [brut] = contours(fut);
    const boucle = tailler(brut!, taille);
    expect(boucle).toHaveLength(8);
    for (const p of [[0.3, 0], [2.7, 0], [3, 0.3], [3, 5.7], [2.7, 6], [0.3, 6], [0, 5.7], [0, 0.3]] as const) expect(contient(boucle, p), `${p}`).toBe(true);
  });

  it("un long côté rejoint une marche par une pente, d'une case au plus", () => {
    // Deux longs côtés décalés d'une case : la marche du milieu et ses deux voisins deviennent une seule pente.
    const [brut] = contours(cases(`
      ###...
      ######`));
    const boucle = tailler(brut!, taille);
    expect(contient(boucle, [3, 1])).toBe(false);
    expect(contient(boucle, [3, 2])).toBe(false);
    expect(seSuivent(boucle, [4, 1], [2, 2])).toBe(true);
    // Sans pente, la marche reste une marche.
    const raide = tailler(brut!, { coin: taille.coin, rampe: 0 });
    expect(contient(raide, [3, 1])).toBe(true);
    expect(contient(raide, [3, 2])).toBe(true);
    // Une pente plus courte : le côté n'est coupé que de cette longueur.
    expect(seSuivent(tailler(brut!, { coin: taille.coin, rampe: 0.5 }), [3.5, 1], [2.5, 2])).toBe(true);
  });

  it("le bout d'un trait de deux cases reste droit : ce n'est pas un escalier", () => {
    // Un trait de deux cases de large qui dépasse de deux cases, comme les barres du « # » ou la jambe d'un P.
    const [brut] = contours(cases(`
      ..##..
      ..##..
      ######
      ######`));
    const boucle = tailler(brut!, taille);
    // Ses deux côtés restent verticaux, de bas en haut à droite et de haut en bas à gauche : seuls ses coins sont biseautés.
    expect(seSuivent(boucle, [4, 2 + taille.coin], [4, 4 - taille.coin])).toBe(true);
    expect(seSuivent(boucle, [2, 4 - taille.coin], [2, 2 + taille.coin])).toBe(true);
    // Dans la police, le « # » n'a que des côtés droits et des biseaux de coin : aucun pan coupé ne mange ses barres.
    for (const b of contours(casesPleines(glyphes.get("#")!)).map((brute) => tailler(brute, taille))) {
      b.forEach((p, i) => {
        const q = b[(i + 1) % b.length]!;
        const droit = Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9;
        expect(droit || Math.hypot(q[0] - p[0], q[1] - p[1]) <= taille.coin * Math.SQRT2 + 1e-9, `${p} → ${q}`).toBe(true);
      });
    }
  });

  it("sans biseau ni pente, un rectangle ne change pas", () => {
    const [brut] = contours([[0, 0], [1, 0]]);
    expect(tailler(brut!, { coin: 0, rampe: 0 })).toEqual(brut);
  });

  it("garde le sens de chaque boucle et, à peu près, la surface de chaque signe", () => {
    for (const [ch, d] of glyphes) {
      const cases = casesPleines(d);
      let surface = 0;
      for (const brut of contours(cases)) {
        const boucle = tailler(brut, taille);
        expect(boucle.length, ch).toBeGreaterThanOrEqual(3);
        expect(Math.sign(aire(boucle)), ch).toBe(Math.sign(aire(brut)));
        surface += aire(boucle);
      }
      // Un coin saillant perd ce qu'un coin rentrant gagne : la lettre ne maigrit ni ne grossit de plus d'un dixième.
      expect(Math.abs(surface - cases.length) / cases.length, ch).toBeLessThan(0.1);
    }
  });

  it("aucun contour taillé ne se croise ni n'en touche un autre", () => {
    const tourne = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const croisent = (a: Point, b: Point, c: Point, d: Point) => {
      const d1 = tourne(a, b, c);
      const d2 = tourne(a, b, d);
      const d3 = tourne(c, d, a);
      const d4 = tourne(c, d, b);
      // Un contact compte aussi : un point de l'un sur le côté de l'autre.
      return d1 * d2 <= 1e-9 && d3 * d4 <= 1e-9 && Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) + 1e-9 && Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) + 1e-9;
    };
    for (const [ch, d] of glyphes) {
      const cotes = contours(casesPleines(d))
        .map((b) => tailler(b, taille))
        .flatMap((b, boucle) => b.map((p, i) => ({ boucle, i, n: b.length, a: p, b: b[(i + 1) % b.length]! })));
      for (let x = 0; x < cotes.length; x++) {
        for (let y = x + 1; y < cotes.length; y++) {
          const s1 = cotes[x]!;
          const s2 = cotes[y]!;
          // Deux côtés qui se suivent partagent leur sommet.
          if (s1.boucle === s2.boucle && (s2.i - s1.i === 1 || s2.i - s1.i === s1.n - 1)) continue;
          expect(croisent(s1.a, s1.b, s2.a, s2.b), `${ch} : côtés ${s1.boucle}.${s1.i} et ${s2.boucle}.${s2.i}`).toBe(false);
        }
      }
    }
  });

  it("aucun signe ne se défait : deux cases ne se touchent jamais par un seul coin", () => {
    // Taillées, deux cases qui ne se touchent que par un coin deviennent deux morceaux. Seule exception : dans le « @ »,
    // l'anneau et la lettre, qui ne doivent pas se toucher, ont un coin en commun entre les cases (7,7) et (8,8).
    for (const [ch, d] of glyphes) {
      const pleines = new Set(casesPleines(d).map(([x, y]) => `${x},${y}`));
      const est = (x: number, y: number) => pleines.has(`${x},${y}`);
      for (const [x, y] of casesPleines(d)) {
        const versDroite = est(x + 1, y + 1) && !est(x + 1, y) && !est(x, y + 1);
        expect(versDroite, `${ch} en ${x},${y}`).toBe(ch === "@" && x === 7 && y === 7);
        expect(est(x - 1, y + 1) && !est(x - 1, y) && !est(x, y + 1), `${ch} en ${x},${y}`).toBe(false);
      }
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
