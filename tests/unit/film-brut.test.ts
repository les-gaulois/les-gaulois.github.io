import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Bobine, CLASSE, imagesDuFilm, lireFilm, RETOMBEES } from "../../src/lib/rejeu/film";
import { equipeDesGaulois, filmDeLaPartie, type PartieAFilmer } from "../../src/lib/rejeu/film-brut";

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

/**
 * Ce que le moteur laisserait pour une carte de 8 × 4 cases, réduite d'un facteur 1 (grille de 8 × 4), sur 21 étapes : une
 * image toutes les 10 étapes, trois en tout. `images` : pour chaque image, les cases changées et leur valeur brute.
 */
function sortieDuMoteur(images: [number, number][][], autre: Record<string, unknown> = {}, film: Record<string, unknown> = {}) {
  const { pas, images: n } = imagesDuFilm(20);
  const meta = { format: 1, partie: "abc123", commit: "a".repeat(40), largeur: 8, hauteur: 4, tours: 21, toursFiche: 21, empreintes: 2, joueurs: JOUEURS, film: { facteur: 1, largeur: 8, hauteur: 4, pas, images: n, ...film }, ...autre };
  const octets: number[] = [...new Uint8Array(32).fill(TERRE)];
  for (const changees of images) {
    varint(octets, changees.length);
    let avant = -1;
    for (const [i, v] of changees) {
      varint(octets, i - avant - 1);
      varint(octets, v);
      avant = i;
    }
  }
  return { meta: JSON.stringify(meta), film: gzipSync(Uint8Array.from(octets)) };
}

const PARTIE: PartieAFilmer = { partie: "abc123", carte: "World", debut: "2026-11-15T09:31:11.450Z", victoire: false, equipes: "Trios", gaulois: 2, joueurs: 20, clients: new Set(["gaulois1", "gaulois2"]) };

describe("le film du site, tiré de ce que laisse le moteur", () => {
  it("ne garde que le camp de chaque case, et les retombées", () => {
    const { meta, film } = sortieDuMoteur([
      [[0, 1 * 2], [1, 2 * 2], [2, 3 * 2]],
      [[3, 4 * 2], [4, 5 * 2], [5, 1 * 2 + 1]],
      [[0, 0], [31, 4 * 2]],
    ]);
    const { octets, entete } = filmDeLaPartie(meta, film, PARTIE);
    expect(entete).toMatchObject({ partie: "abc123", carte: "World", victoire: false, equipes: "Trios", largeur: 8, hauteur: 4, images: 3, tours: 21, equipe: true, adverses: 1 });
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
