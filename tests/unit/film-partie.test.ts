import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ALPHA_TERRITOIRE, COULEUR_GAULOIS, couleurBord, couleurDeFond, MER_FINALE, sature } from "../../src/lib/carte-dessin";
import {
  Bobine,
  CASES_FILM_MAX,
  CLASSE,
  CONSTRUCTIONS,
  contientRetombees,
  decompresser,
  dureeDite,
  EcrivainFilm,
  enteteDuFilm,
  etapeDeLImage,
  etiquettesDe,
  FORMAT_FILM,
  grilleDuFilm,
  horloge,
  IMAGES_FILM_MAX,
  imagesDuFilm,
  PAS_FILM_MIN,
  lireFilm,
  PeintreFilm,
  RETOMBEES,
  secondesDeLImage,
  UNITES,
  unitesDuFilm,
  type EnteteFilm,
  type Unite,
} from "../../src/lib/rejeu/film";
import { UNITES_DU_FILM } from "../../src/lib/rejeu/film-brut";

const TERRE = 0x80;

function entete(largeur: number, hauteur: number, images: number, autre: Partial<EnteteFilm> = {}): EnteteFilm {
  return { format: FORMAT_FILM, partie: "abc123", carte: "World", debut: "2026-11-15T09:31:11.450Z", victoire: true, equipes: "Duos", gaulois: 2, joueurs: 20, largeur, hauteur, facteur: 4, pas: 10, images, tours: (images - 1) * 10 + 1, adverses: 1, equipe: false, noms: [], ...autre };
}

/** Un petit film : 4 × 3 cases de terre, trois images. */
function petitFilm() {
  const grilles = [new Uint8Array(12), Uint8Array.from([1, 1, 0, 0, 1, 1, 0, 4, 0, 0, 4, 4]), Uint8Array.from([1, 1, 1, 0, 1 | RETOMBEES, 1, 3, 4, 0, 0, 0, 4])];
  const e = new EcrivainFilm(4, 3);
  for (const g of grilles) e.ajouter(g);
  const terrain = new Uint8Array(12).fill(TERRE);
  terrain[3] = 0x20;
  return { grilles, octets: e.octetsDuFilm(entete(4, 3, 3), terrain) };
}

describe("la grille et les images d'un film", () => {
  it("réduit la carte comme le moteur l'a fait sur deux vraies parties", () => {
    expect(grilleDuFilm(4000, 1400)).toEqual({ facteur: 6, largeur: 667, hauteur: 234 });
    expect(grilleDuFilm(2000, 1700)).toEqual({ facteur: 5, largeur: 400, hauteur: 340 });
    expect(imagesDuFilm(4790)).toEqual({ pas: 14, images: 344 });
    expect(imagesDuFilm(6290)).toEqual({ pas: 18, images: 351 });
  });
  it("ne dépasse jamais la taille ni le nombre d'images permis", () => {
    for (const [l, h] of [[4108, 1948], [1000, 1000], [50, 50], [5000, 5000], [799, 801]] as const) {
      const g = grilleDuFilm(l, h);
      expect(g.largeur * g.hauteur).toBeLessThanOrEqual(CASES_FILM_MAX);
    }
    // L'arrondi de chaque côté peut ajouter une rangée : le facteur monte alors d'un cran.
    expect(grilleDuFilm(799, 801)).toEqual({ facteur: 3, largeur: 267, hauteur: 267 });
    for (let l = 300; l < 5000; l += 37) for (let h = 300; h < 2500; h += 41) expect(grilleDuFilm(l, h).largeur * grilleDuFilm(l, h).hauteur).toBeLessThanOrEqual(CASES_FILM_MAX);
    for (let d = 1; d < 200_000; d += 997) {
      const { pas, images } = imagesDuFilm(d);
      expect(images).toBeLessThanOrEqual(IMAGES_FILM_MAX);
      expect(etapeDeLImage({ pas, tours: d + 1, images }, images - 2)).toBeLessThan(d);
    }
  });
  it("dit la même chose que le programme du moteur, construit sans le code du site", () => {
    const entree = readFileSync("scripts/rejeu-openfront/entree.ts", "utf8");
    const constante = (nom: string) => Number(new RegExp(`const ${nom} = ([\\d_]+);`).exec(entree)?.[1]?.replace(/_/g, ""));
    expect(constante("CASES_FILM_MAX")).toBe(CASES_FILM_MAX);
    expect(constante("IMAGES_FILM_MAX")).toBe(IMAGES_FILM_MAX);
    expect(constante("PAS_FILM_MIN")).toBe(PAS_FILM_MIN);
    // Les deux règles, écrites de la même façon : le facteur qui fait tenir la grille, le pas entre deux images.
    expect(entree).toContain("let facteur = Math.max(1, Math.ceil(Math.sqrt((l * h) / CASES_FILM_MAX)));");
    expect(entree).toContain("while (Math.ceil(l / facteur) * Math.ceil(h / facteur) > CASES_FILM_MAX) facteur++;");
    expect(entree).toContain("Math.max(PAS_FILM_MIN, Math.ceil(derniere / (IMAGES_FILM_MAX - 2)))");
    // Les mêmes unités suivies, dans le même ordre, que la conversion du site.
    const unites = /const UNITES_FILMEES = (\[[^\]]*\]);/.exec(entree)?.[1];
    expect(unites && JSON.parse(unites)).toEqual([...UNITES_DU_FILM]);
    expect(UNITES).toHaveLength(UNITES_DU_FILM.length);
    const site = readFileSync("src/lib/rejeu/film.ts", "utf8");
    expect(site).toContain("while (Math.ceil(largeur / facteur) * Math.ceil(hauteur / facteur) > CASES_FILM_MAX) facteur++;");
    expect(site).toContain("Math.max(PAS_FILM_MIN, Math.ceil(derniere / (IMAGES_FILM_MAX - 2)))");
  });
  it("donne le moment de chaque image, la dernière à la fin rejouée", () => {
    const e = { pas: 14, tours: 4791, images: 344 };
    expect(etapeDeLImage(e, 0)).toBe(0);
    expect(etapeDeLImage(e, 10)).toBe(140);
    expect(etapeDeLImage(e, 343)).toBe(4790);
    expect(secondesDeLImage(e, 343)).toBe(479);
    expect(horloge(479)).toBe("7:59");
    expect(horloge(3725)).toBe("1:02:05");
    expect(dureeDite(479)).toBe("7 min 59 s");
    expect(dureeDite(3725)).toBe("1 h 2 min 5 s");
    expect(dureeDite(9)).toBe("9 s");
  });
});

describe("écrire et relire un film", () => {
  it("rend chaque image telle qu'elle a été écrite, en avant comme en arrière", () => {
    const { grilles, octets } = petitFilm();
    const film = lireFilm(octets);
    expect(film.entete.partie).toBe("abc123");
    const b = new Bobine(film, 1);
    for (const k of [2, 0, 1, 2, 1, 0]) {
      b.aller(k);
      expect([...b.grille]).toEqual([...grilles[k]!]);
    }
  });
  it("garde peu de grilles et revient quand même en arrière (écart de 24 images)", () => {
    const e = new EcrivainFilm(3, 1);
    const grilles: Uint8Array[] = [];
    for (let k = 0; k < 60; k++) {
      const g = Uint8Array.from([k % 2, (k >> 1) % 3, k % 5 === 0 ? 4 : 0]);
      grilles.push(g);
      e.ajouter(g);
    }
    const film = lireFilm(e.octetsDuFilm(entete(3, 1, 60), new Uint8Array(3).fill(TERRE)));
    const b = new Bobine(film);
    for (const k of [59, 3, 30, 29, 0, 48, 25]) {
      b.aller(k);
      expect([...b.grille]).toEqual([...grilles[k]!]);
    }
  });
  it("n'écrit que les plages changées : une image sans changement tient en trois octets", () => {
    const e = new EcrivainFilm(100, 100);
    const g = new Uint8Array(10_000).fill(1);
    e.ajouter(g);
    const avant = lireFilm(e.octetsDuFilm(entete(100, 100, 1), new Uint8Array(10_000))).donnees.length;
    e.ajouter(g);
    expect(lireFilm(e.octetsDuFilm(entete(100, 100, 2), new Uint8Array(10_000))).donnees.length).toBe(avant + 3);
    // La première image : une seule plage de 10 000 cases, aucun nom, aucune unité ; une image sans changement : trois zéros.
    expect(avant).toBe(1 + 1 + 2 + 1 + 1 + 1);
  });
  it("refuse un fichier qui n'est pas un film du site, coupé, ou avec des octets en trop", () => {
    const { octets } = petitFilm();
    expect(() => lireFilm(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow("pas un film");
    expect(() => lireFilm(octets.subarray(0, octets.length - 2))).toThrow();
    expect(() => lireFilm(Uint8Array.from([...octets, 0]))).toThrow("octets en trop");
    const autreVersion = octets.slice();
    autreVersion[4] = FORMAT_FILM + 1;
    expect(() => lireFilm(autreVersion)).toThrow("version");
  });
  it("refuse une classe inconnue ou une plage hors de la grille", () => {
    const e = new EcrivainFilm(2, 1);
    e.ajouter(Uint8Array.from([0x0f, 0]));
    expect(() => lireFilm(e.octetsDuFilm(entete(2, 1, 1), new Uint8Array(2)))).toThrow("classe inconnue");
    // Une plage de trois cases sur une grille de deux, écrite à la main : « GALF », version, en-tête, terrain, une image.
    const texte = new TextEncoder().encode(JSON.stringify(entete(2, 1, 1)));
    const brut = Uint8Array.from([0x47, 0x41, 0x4c, 0x46, FORMAT_FILM, texte.length & 0xff, texte.length >> 8, ...texte, 0, 0, 1, 0, 2, 1]);
    expect(() => lireFilm(brut)).toThrow("hors de la grille");
  });
  it("refuse un en-tête au mauvais format : carte avec du HTML, grille trop grande, identifiant étrange", () => {
    const essayer = (autre: Partial<EnteteFilm>) => {
      const e = new EcrivainFilm(2, 1);
      e.ajouter(new Uint8Array(2));
      return () => lireFilm(e.octetsDuFilm({ ...entete(2, 1, 1), ...autre }, new Uint8Array(2)));
    };
    expect(essayer({ carte: "<img src=x>" })).toThrow("en-tête");
    expect(essayer({ partie: "../x" })).toThrow("en-tête");
    expect(essayer({ largeur: 5_000, hauteur: 5_000 })).toThrow();
  });
  it("se décompresse comme le navigateur le fera", async () => {
    const { octets } = petitFilm();
    expect([...(await decompresser(gzipSync(octets)))]).toEqual([...octets]);
  });
  it("sait si des retombées paraissent", () => {
    expect(contientRetombees(lireFilm(petitFilm().octets))).toBe(true);
    const e = new EcrivainFilm(2, 1);
    e.ajouter(Uint8Array.from([1, 4]));
    expect(contientRetombees(lireFilm(e.octetsDuFilm(entete(2, 1, 1), new Uint8Array(2).fill(TERRE))))).toBe(false);
  });
});

describe("dessiner une image", () => {
  it("pose les territoires sur le terrain comme la carte de fin : plein au milieu, bord plus sombre, mer intacte", () => {
    const e = new EcrivainFilm(3, 3);
    e.ajouter(new Uint8Array(9).fill(CLASSE.gaulois));
    const terrain = new Uint8Array(9).fill(TERRE);
    terrain[0] = 0x20;
    const film = lireFilm(e.octetsDuFilm(entete(3, 3, 1), terrain));
    const b = new Bobine(film);
    b.aller(0);
    const rgba = new Uint8ClampedArray(9 * 4);
    new PeintreFilm(film).peindre(b.grille, rgba);
    const pixel = (i: number) => [...rgba.subarray(i * 4, i * 4 + 3)];
    // La mer ne prend pas la couleur du territoire.
    expect(pixel(0)).toEqual([...MER_FINALE]);
    // Le bord de la grille est un bord du territoire ; la case du milieu est pleine.
    expect(pixel(1)).toEqual([...couleurBord(COULEUR_GAULOIS)]);
    const fond = couleurDeFond(TERRE);
    const plein = sature(COULEUR_GAULOIS);
    expect(pixel(4)).toEqual([0, 1, 2].map((j) => Math.round(fond[j]! + (plein[j]! - fond[j]!) * ALPHA_TERRITOIRE)));
    expect(rgba[4 * 4 + 3]).toBe(255);
  });
});

describe("les noms et les unités d'un film", () => {
  const ville: Unite = { code: 0, x: 5, y: 2, classe: CLASSE.gaulois, niveau: 3, chantier: false };
  const navire: Unite = { code: 6, x: 11, y: 7, classe: CLASSE.adverses, niveau: 1, chantier: false };
  function filmAvecDetails(autre: Partial<EnteteFilm> = {}) {
    const e = new EcrivainFilm(3, 2);
    e.ajouter(new Uint8Array(6).fill(1), [{ nom: 0, x: 1, y: 1, taille: 1 }], [{ id: 0, unite: ville }, { id: 1, unite: navire }]);
    e.ajouter(new Uint8Array(6).fill(1), [{ nom: 0, x: 2, y: 0, taille: 1 }, { nom: 1, x: 0, y: 0, taille: 1 }], [{ id: 1, unite: null }]);
    return e.octetsDuFilm(entete(3, 2, 2, { noms: [{ texte: "Vercingé", classe: CLASSE.gaulois }, { texte: "[UN]", classe: CLASSE.adverses }], ...autre }), new Uint8Array(6).fill(TERRE));
  }
  it("rend les noms de chaque image et les unités, en avant comme en arrière", () => {
    const film = lireFilm(filmAvecDetails());
    expect(film.entete.noms).toEqual([{ texte: "Vercingé", classe: CLASSE.gaulois }, { texte: "[UN]", classe: CLASSE.adverses }]);
    expect(etiquettesDe(film, 0)).toEqual([{ nom: 0, x: 1, y: 1, taille: 1 }]);
    expect(etiquettesDe(film, 1)).toHaveLength(2);
    const b = new Bobine(film);
    b.aller(1);
    expect([...b.unites.values()]).toEqual([ville]);
    b.aller(0);
    expect([...b.unites.values()]).toEqual([ville, navire]);
    expect([...unitesDuFilm(film)].sort()).toEqual([0, 6]);
    expect(UNITES.slice(0, CONSTRUCTIONS)).toContain("Ville");
  });
  it("refuse un nom inconnu, hors de la grille, ou écrit avec des chevrons", () => {
    const e = new EcrivainFilm(3, 2);
    e.ajouter(new Uint8Array(6), [{ nom: 1, x: 0, y: 0, taille: 1 }]);
    expect(() => lireFilm(e.octetsDuFilm(entete(3, 2, 1, { noms: [{ texte: "A", classe: 1 }] }), new Uint8Array(6)))).toThrow("nom inconnu");
    const f = new EcrivainFilm(3, 2);
    f.ajouter(new Uint8Array(6), [{ nom: 0, x: 3, y: 0, taille: 1 }]);
    expect(() => lireFilm(f.octetsDuFilm(entete(3, 2, 1, { noms: [{ texte: "A", classe: 1 }] }), new Uint8Array(6)))).toThrow("hors de la grille");
    expect(() => lireFilm(filmAvecDetails({ noms: [{ texte: "<b>x</b>", classe: 1 }, { texte: "B", classe: 1 }] }))).toThrow("en-tête");
    expect(() => lireFilm(filmAvecDetails({ noms: [{ texte: "A\u0007", classe: 1 }, { texte: "B", classe: 1 }] }))).toThrow("en-tête");
  });
  it("refuse une unité inconnue ou hors de la carte", () => {
    const e = new EcrivainFilm(3, 2);
    e.ajouter(new Uint8Array(6), [], [{ id: 0, unite: { ...ville, code: UNITES.length } }]);
    expect(() => lireFilm(e.octetsDuFilm(entete(3, 2, 1), new Uint8Array(6)))).toThrow("unité inconnue");
    // La carte entière fait 3 × 4 = 12 cases de large.
    const f = new EcrivainFilm(3, 2);
    f.ajouter(new Uint8Array(6), [], [{ id: 0, unite: { ...ville, x: 12 } }]);
    expect(() => lireFilm(f.octetsDuFilm(entete(3, 2, 1), new Uint8Array(6)))).toThrow("hors de la carte");
  });
});

describe("l'en-tête seul d'un film", () => {
  const octets = () => {
    const e = entete(2, 1, 1, { noms: [{ texte: "Alba", classe: CLASSE.gaulois }] });
    const ecrivain = new EcrivainFilm(2, 1);
    ecrivain.ajouter(new Uint8Array([CLASSE.gaulois, CLASSE.personne]));
    return ecrivain.octetsDuFilm(e, new Uint8Array([TERRE, TERRE]));
  };

  it("rend les faits et les noms sans relire les images, comme lireFilm", () => {
    const film = octets();
    expect(enteteDuFilm(film)).toEqual(lireFilm(film).entete);
    expect(enteteDuFilm(film).noms).toEqual([{ texte: "Alba", classe: CLASSE.gaulois }]);
    // Les images peuvent manquer : l'en-tête se lit quand même.
    const longueur = film[5]! | (film[6]! << 8);
    expect(enteteDuFilm(film.subarray(0, 7 + longueur)).partie).toBe("abc123");
  });

  it("refuse ce qui n'est pas un film, un film d'une autre version, coupé ou à l'en-tête illisible", () => {
    const film = octets();
    expect(() => enteteDuFilm(new Uint8Array(3))).toThrow("ce n'est pas un film du site");
    expect(() => enteteDuFilm(new TextEncoder().encode("pas un film du tout"))).toThrow("ce n'est pas un film du site");
    const autre = film.slice();
    autre[4] = FORMAT_FILM + 1;
    expect(() => enteteDuFilm(autre)).toThrow("version du film inconnue");
    expect(() => enteteDuFilm(film.subarray(0, 12))).toThrow("film coupé");
    const abime = film.slice();
    abime[7] = 0x21;
    expect(() => enteteDuFilm(abime)).toThrow("en-tête illisible");
  });
});
