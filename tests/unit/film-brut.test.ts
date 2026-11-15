import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Bobine, CLASSE, etiquettesDe, imagesDuFilm, lireFilm, RETOMBEES, UNITES } from "../../src/lib/rejeu/film";
import { equipeDesGaulois, filmDeLaPartie, nomsPubliables, placesDesNoms, UNITES_DU_FILM, type PartieAFilmer } from "../../src/lib/rejeu/film-brut";

const TERRE = 0x80;

function varint(sortie: number[], v: number) {
  while (v >= 0x80) {
    sortie.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  sortie.push(v);
}

/** Les joueurs : deux Gaulois et un coéquipier en rouge, un adversaire en bleu, un robot. */
const JOUEURS = [
  { n: 1, client: "gaulois1", equipe: "Red", type: "HUMAN" },
  { n: 2, client: "gaulois2", equipe: "Red", type: "HUMAN" },
  { n: 3, client: "copain", equipe: "Red", type: "HUMAN" },
  { n: 4, client: "rival9", equipe: "Blue", type: "HUMAN" },
  { n: 5, client: null, equipe: "Bot", type: "BOT" },
];

/** Une unité brute, comme le moteur l'écrit : numéro, puis, si elle est là, type, x, y, propriétaire, niveau, chantier. */
type UniteBrute = [id: number, valeurs?: [number, number, number, number, number, number]];

/**
 * Ce que le moteur laisserait pour une carte de 8 × 4 cases, réduite d'un facteur 1 (grille de 8 × 4), sur 21 étapes : une
 * image toutes les 10 étapes, trois en tout. `images` : pour chaque image, les cases changées et leur valeur brute ; `unites` :
 * pour chaque image, les unités changées.
 */
function sortieDuMoteur(images: [number, number][][], autre: Record<string, unknown> = {}, film: Record<string, unknown> = {}, unites: UniteBrute[][] = []) {
  const { pas, images: n } = imagesDuFilm(20);
  const meta = { format: 1, partie: "abc123", commit: "a".repeat(40), largeur: 8, hauteur: 4, tours: 21, toursFiche: 21, empreintes: 2, joueurs: JOUEURS, film: { facteur: 1, largeur: 8, hauteur: 4, pas, images: n, unites: [...UNITES_DU_FILM], ...film }, ...autre };
  const octets: number[] = [...new Uint8Array(32).fill(TERRE)];
  images.forEach((changees, k) => {
    varint(octets, changees.length);
    let avant = -1;
    for (const [i, v] of changees) {
      varint(octets, i - avant - 1);
      varint(octets, v);
      avant = i;
    }
    const u = unites[k] ?? [];
    varint(octets, u.length);
    for (const [id, valeurs] of u) {
      varint(octets, id * 2 + (valeurs ? 1 : 0));
      for (const v of valeurs ?? []) varint(octets, v);
    }
  });
  return { meta: JSON.stringify(meta), film: gzipSync(Uint8Array.from(octets)) };
}

const PARTIE: PartieAFilmer = { partie: "abc123", carte: "World", debut: "2026-11-15T09:31:11.450Z", victoire: false, equipes: "Trios", gaulois: 2, joueurs: 20, clients: new Set(["gaulois1", "gaulois2"]), noms: new Map() };

describe("le film du site, tiré de ce que laisse le moteur", () => {
  it("ne garde que le camp de chaque case, et les retombées", () => {
    const { meta, film } = sortieDuMoteur([
      [[0, 1 * 2], [1, 2 * 2], [2, 3 * 2]],
      [[3, 4 * 2], [4, 5 * 2], [5, 1 * 2 + 1]],
      [[0, 0], [31, 4 * 2]],
    ]);
    const { octets, entete } = filmDeLaPartie(meta, film, PARTIE);
    expect(entete).toMatchObject({ partie: "abc123", carte: "World", victoire: false, equipes: "Trios", largeur: 8, hauteur: 4, images: 3, tours: 21, equipe: true, adverses: 1, noms: [] });
    const lu = lireFilm(gunzipSync(octets));
    const b = new Bobine(lu);
    b.aller(1);
    expect([...b.grille.subarray(0, 6)]).toEqual([CLASSE.gaulois, CLASSE.gaulois, CLASSE.equipe, CLASSE.adverses, CLASSE.robots, CLASSE.gaulois | RETOMBEES]);
    b.aller(2);
    expect(b.grille[0]).toBe(CLASSE.personne);
    expect(b.grille[31]).toBe(CLASSE.adverses);
    // Aucun identifiant de joueur dans le film.
    expect(new TextDecoder().decode(gunzipSync(octets))).not.toMatch(/gaulois1|rival9|copain/);
  });
  it("garde les unités, au camp de leur propriétaire, sous de petits numéros, et les retire quand elles partent", () => {
    const ville = UNITES_DU_FILM.indexOf("City");
    const navire = UNITES_DU_FILM.indexOf("Warship");
    const { meta, film } = sortieDuMoteur([[], [], []], {}, {}, [
      [[9001, [ville, 2, 3, 1, 1, 1]], [9005, [navire, 7, 0, 4, 1, 0]]],
      [[9001, [ville, 2, 3, 1, 2, 0]], [9005, [navire, 6, 1, 4, 1, 0]]],
      [[9005]],
    ]);
    const b = new Bobine(lireFilm(gunzipSync(filmDeLaPartie(meta, film, PARTIE).octets)));
    b.aller(0);
    expect([...b.unites.values()]).toEqual([
      { code: ville, x: 2, y: 3, classe: CLASSE.gaulois, niveau: 1, chantier: true },
      { code: navire, x: 7, y: 0, classe: CLASSE.adverses, niveau: 1, chantier: false },
    ]);
    expect([...b.unites.keys()]).toEqual([0, 1]);
    b.aller(2);
    expect([...b.unites.values()]).toEqual([{ code: ville, x: 2, y: 3, classe: CLASSE.gaulois, niveau: 2, chantier: false }]);
    // En arrière, les unités reviennent comme les cases.
    b.aller(1);
    expect(b.unites.get(1)).toEqual({ code: navire, x: 6, y: 1, classe: CLASSE.adverses, niveau: 1, chantier: false });
    expect(UNITES[ville]).toBe("Ville");
  });
  it("refuse une unité d'un joueur inconnu, hors de la carte, retirée sans être venue, ou une autre liste d'unités", () => {
    let s = sortieDuMoteur([[], [], []], {}, {}, [[[1, [0, 1, 1, 9, 1, 0]]]]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("joueur inconnu");
    s = sortieDuMoteur([[], [], []], {}, {}, [[[1, [0, 8, 1, 1, 1, 0]]]]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("hors de la carte");
    s = sortieDuMoteur([[], [], []], {}, {}, [[[1, [99, 1, 1, 1, 1, 0]]]]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("hors de la carte");
    s = sortieDuMoteur([[], [], []], {}, {}, [[[1]]]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("retirée");
    s = sortieDuMoteur([[], [], []], {}, { unites: ["City"] });
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("unités du film");
  });
  it("pose les noms donnés par le site, au cœur de chaque territoire, et rien d'autre", () => {
    // Le Gaulois 1 tient les deux premières colonnes, l'adversaire tout le reste.
    const cases: [number, number][] = [];
    for (let i = 0; i < 32; i++) cases.push([i, (i % 8 < 2 ? 1 : 4) * 2]);
    const { meta, film } = sortieDuMoteur([cases, [], []]);
    const noms = new Map([["gaulois1", "Vercingé"], ["rival9", "[UN]"]]);
    const { octets, entete } = filmDeLaPartie(meta, film, { ...PARTIE, noms });
    expect(entete.noms).toEqual([{ texte: "Vercingé", classe: CLASSE.gaulois }, { texte: "[UN]", classe: CLASSE.adverses }]);
    const lu = lireFilm(gunzipSync(octets));
    const [gaulois, rival] = etiquettesDe(lu, 0);
    expect(gaulois).toMatchObject({ nom: 0, taille: 1 });
    expect(gaulois!.x).toBeLessThan(2);
    expect(rival).toMatchObject({ nom: 1, x: 3, y: 1, taille: 2 });
    // Le copain et le robot n'ont pas de nom : ils n'en ont reçu aucun.
    expect(new TextDecoder().decode(gunzipSync(octets))).not.toMatch(/copain/);
  });
  it("reconnaît l'équipe des Gaulois au plus grand nombre d'entre eux", () => {
    expect(equipeDesGaulois(JOUEURS, new Set(["gaulois1", "gaulois2"]))).toBe("Red");
    expect(equipeDesGaulois(JOUEURS, new Set(["gaulois1", "rival9", "gaulois2"]))).toBe("Red");
    expect(equipeDesGaulois(JOUEURS, new Set())).toBeNull();
  });
  it("refuse le film d'une autre partie, d'une autre grille ou d'un autre nombre d'images", () => {
    const vide = [[], [], []] as [number, number][][];
    let s = sortieDuMoteur(vide, { partie: "autre" });
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("autre partie");
    s = sortieDuMoteur(vide, {}, { largeur: 9 });
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("grille");
    s = sortieDuMoteur(vide, {}, { images: 4 });
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("images");
    s = sortieDuMoteur(vide);
    expect(() => filmDeLaPartie(s.meta.replace('"film"', '"filme"'), s.film, PARTIE)).toThrow("film");
  });
  it("refuse une case d'un joueur inconnu, hors de la grille, ou des octets en trop", () => {
    let s = sortieDuMoteur([[[0, 9 * 2]], [], []]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("joueur inconnu");
    s = sortieDuMoteur([[[32, 2]], [], []]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("hors de la grille");
    s = sortieDuMoteur([[], [], [], []]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("octets en trop");
    s = sortieDuMoteur([[], []]);
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("coupé");
  });
  it("refuse une description dont la fin n'a pas été contrôlée", () => {
    const s = sortieDuMoteur([[], [], []], { toursFiche: 500 });
    expect(() => filmDeLaPartie(s.meta, s.film, PARTIE)).toThrow("mauvais format");
  });
});

describe("les noms publiables", () => {
  const pseudos = new Map([["PUB1", "Vercingé"], ["PUB3", "  Ambiorix   le  Grand "]]);
  it("donne le pseudo de la liste du clan aux membres, le tag officiel aux autres, et rien aux inconnus", () => {
    const noms = nomsPubliables(
      [
        { clientID: "a", publicID: "PUB1", clanTag: "GAL" },
        { clientID: "b", publicID: "PUB2", clanTag: "UN" },
        { clientID: "c", publicID: null, clanTag: "1488" },
        { clientID: "d", publicID: null, clanTag: null },
        { clientID: "e", publicID: "PUB3", clanTag: "GAL" },
        { clientID: null, publicID: "PUB1", clanTag: "GAL" },
      ],
      pseudos,
      ["GAL", "UN"],
    );
    expect([...noms]).toEqual([
      ["a", "Vercingé"],
      ["b", "[UN]"],
      ["e", "Ambiorix le Grand"],
    ]);
  });
  it("n'écrit jamais le pseudo choisi dans la partie", () => {
    const noms = nomsPubliables([{ clientID: "a", publicID: "INCONNU", clanTag: "XX", username: "pseudo libre" } as never], pseudos, ["GAL"]);
    expect(noms.size).toBe(0);
  });
});

describe("la place des noms", () => {
  it("met le nom au cœur du territoire, avec la distance au bord comme taille", () => {
    // Une grille de 7 × 5 : le joueur 2 tient un carré de 5 × 5 à droite, le joueur 1 deux colonnes à gauche.
    const largeur = 7;
    const hauteur = 5;
    const proprio = new Int32Array(largeur * hauteur);
    for (let i = 0; i < proprio.length; i++) proprio[i] = i % largeur < 2 ? 1 : 2;
    const nomDe = Int32Array.from([-1, 0, 1]);
    const places = placesDesNoms(proprio, largeur, hauteur, nomDe);
    expect(places).toEqual([
      { nom: 0, x: 0, y: 0, taille: 1 },
      { nom: 1, x: 4, y: 2, taille: 3 },
    ]);
    // Un joueur sans nom n'a pas de place.
    expect(placesDesNoms(proprio, largeur, hauteur, Int32Array.from([-1, -1, 1]))).toEqual([{ nom: 1, x: 4, y: 2, taille: 3 }]);
  });
});
