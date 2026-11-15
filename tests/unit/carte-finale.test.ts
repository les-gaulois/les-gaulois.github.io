import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  casesEnOctets,
  COULEUR_EQUIPE,
  COULEUR_GAULOIS,
  COULEUR_RETOMBEES,
  COULEUR_ROBOTS,
  couleurBord,
  COULEURS_ADVERSES,
  couleursDesJoueurs,
  couleurTerrain,
  dessinerCarteFinale,
  ECART_FIN_MAX,
  HORS_CARTE,
  lireEtatFinal,
  LITTORAL_FINAL,
  MER_FINALE,
  ouverteSurLaMer,
  partsDesCouleurs,
  EtatFinalMeta,
  MAX_COTE,
  type JoueurFinal,
  type Rgb,
} from "../../src/lib/carte-finale";

const TERRE = 0x80;
const LITTORAL = 0x40;

/** Une carte inventée de 4 × 3 cases : une colonne d'eau à gauche, de la terre ailleurs. */
const META: EtatFinalMeta = {
  format: 1,
  partie: "cAbc123XyZ",
  commit: "8b5d071eed95f07c701b32e4c64e95b03f8577c1",
  largeur: 4,
  hauteur: 3,
  tours: 1000,
  toursFiche: 1009,
  empreintes: 100,
  joueurs: [
    { n: 1, client: "g1", equipe: "Red", type: "HUMAN" },
    { n: 2, client: "e1", equipe: "Red", type: "HUMAN" },
    { n: 3, client: "a1", equipe: "Blue", type: "HUMAN" },
    { n: 4, client: null, equipe: "Bot", type: "BOT" },
  ],
};
const PROPRIO = Uint16Array.from([0, 1, 1, 3, 0, 1, 2, 3, 0, 4, 0, 3]);
const TERRAIN = Uint8Array.from([0x05, TERRE | 3, TERRE | 3, TERRE | 3, LITTORAL, TERRE | 3, TERRE | 12, TERRE | 3, 0x05, TERRE | LITTORAL | 2, TERRE | 31, TERRE | 3]);
const RETOMBEES = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
const fichier = (meta: object = META, proprio = PROPRIO, terrain = TERRAIN, retombees = RETOMBEES) => ({ texte: JSON.stringify(meta), cases: gzipSync(casesEnOctets(proprio, terrain, retombees)) });

describe("lireEtatFinal", () => {
  it("relit ce que le rejeu écrit, case par case", () => {
    const { texte, cases } = fichier();
    const etat = lireEtatFinal(texte, cases, META.partie);
    expect(etat.largeur).toBe(4);
    expect([...etat.proprio]).toEqual([...PROPRIO]);
    expect([...etat.terrain]).toEqual([...TERRAIN]);
    expect([...etat.retombees]).toEqual([...RETOMBEES]);
    expect(etat.joueurs).toEqual(META.joueurs);
  });
  it("écarte le fichier d'une autre partie, un fichier abîmé ou d'une autre taille", () => {
    const { texte, cases } = fichier();
    expect(() => lireEtatFinal(texte, cases, "autrePartie")).toThrow("autre partie");
    expect(() => lireEtatFinal("{", cases, META.partie)).toThrow("illisible");
    expect(() => lireEtatFinal(texte, Buffer.from("pas du gzip"), META.partie)).toThrow("illisibles");
    expect(() => lireEtatFinal(JSON.stringify({ ...META, largeur: 5 }), cases, META.partie)).toThrow("nombre de cases");
    // Plus de cases que la carte n'en a : coupé avant d'être lu en entier.
    expect(() => lireEtatFinal(texte, gzipSync(new Uint8Array(4 * 12 * 50)), META.partie)).toThrow();
  });
  it("écarte une case tenue par un joueur que la description ne connaît pas", () => {
    const proprio = PROPRIO.slice();
    proprio[1] = 9;
    const { texte, cases } = fichier(META, proprio);
    expect(() => lireEtatFinal(texte, cases, META.partie)).toThrow("joueur inconnu");
  });
  it("écarte une fin de partie que les empreintes du jeu n'ont pas contrôlée", () => {
    const { cases } = fichier();
    expect(() => lireEtatFinal(JSON.stringify({ ...META, toursFiche: META.tours + ECART_FIN_MAX + 1 }), cases, META.partie)).toThrow("non contrôlée");
    expect(() => lireEtatFinal(JSON.stringify({ ...META, tours: META.toursFiche + 1 }), cases, META.partie)).toThrow("non contrôlée");
    expect(() => lireEtatFinal(JSON.stringify({ ...META, empreintes: 0 }), cases, META.partie)).toThrow();
  });
  it("écarte une description au mauvais format : joueur en double, identifiant étrange, carte démesurée, autre version", () => {
    const { cases } = fichier();
    const essais: object[] = [
      { ...META, joueurs: [...META.joueurs, META.joueurs[0]] },
      { ...META, joueurs: [{ ...META.joueurs[0]!, client: "../x" }] },
      { ...META, commit: "main" },
      { ...META, format: 2 },
      { ...META, partie: "../../etc" },
    ];
    for (const meta of essais) expect(() => lireEtatFinal(JSON.stringify(meta), cases, META.partie)).toThrow("mauvais format");
    // Une carte démesurée est refusée par la description elle-même, avant toute lecture des cases.
    for (const [largeur, hauteur] of [[MAX_COTE + 1, 10], [10, MAX_COTE + 1], [10_000, 10_000]]) {
      expect(EtatFinalMeta.safeParse({ ...META, largeur, hauteur }).success).toBe(false);
    }
  });
  it("accepte toutes les cartes du jeu, même très longues : la carte de fin du Fleuve Amazone a été écartée le 15 novembre 2026", () => {
    // Relevé le 15 novembre 2026 sur les 146 cartes du jeu (commit 8b5d071) : les plus larges, la plus haute, la plus grande.
    for (const [largeur, hauteur] of [[10_000, 5_000], [6_000, 400], [5_536, 276], [400, 4_200], [4_108, 1_948]]) {
      expect(EtatFinalMeta.safeParse({ ...META, largeur, hauteur }).success).toBe(true);
    }
    // Une carte de 5 536 cases de large se relit en entier.
    const largeur = 5_536;
    const n = largeur * 2;
    const proprio = new Uint16Array(n).fill(1);
    const terrain = new Uint8Array(n).fill(TERRE | 3);
    const { texte, cases } = fichier({ ...META, largeur, hauteur: 2 }, proprio, terrain, new Uint8Array(n));
    expect(lireEtatFinal(texte, cases, META.partie).largeur).toBe(largeur);
  });
});

describe("les couleurs des joueurs", () => {
  const gaulois = new Set(["g1"]);
  it("les Gaulois en bleu, leur équipe en bleu clair, les robots en gris, les autres équipes en couleurs chaudes", () => {
    const c = couleursDesJoueurs(META.joueurs, gaulois, "Red");
    expect(c.get(1)).toBe(COULEUR_GAULOIS);
    expect(c.get(2)).toBe(COULEUR_EQUIPE);
    expect(c.get(3)).toBe(COULEURS_ADVERSES[0]);
    expect(c.get(4)).toBe(COULEUR_ROBOTS);
  });
  it("chaque équipe adverse a sa couleur, dans l'ordre de leur nom : une partie se dessine toujours pareil", () => {
    const joueurs: JoueurFinal[] = [
      { n: 5, client: "y", equipe: "Yellow", type: "HUMAN" },
      { n: 6, client: "b", equipe: "Blue", type: "NATION" },
      { n: 7, client: "b2", equipe: "Blue", type: "HUMAN" },
      { n: 8, client: "g", equipe: "Red", type: "HUMAN" },
    ];
    const c = couleursDesJoueurs(joueurs, new Set(["g"]), "Red");
    expect([c.get(6), c.get(7), c.get(5)]).toEqual([COULEURS_ADVERSES[0], COULEURS_ADVERSES[0], COULEURS_ADVERSES[1]]);
    expect(couleursDesJoueurs([...joueurs].reverse(), new Set(["g"]), "Red")).toEqual(c);
  });
  it("sans équipes : chaque adversaire a sa couleur, et personne n'est « de leur équipe »", () => {
    const joueurs: JoueurFinal[] = [
      { n: 1, client: "g", equipe: null, type: "HUMAN" },
      { n: 2, client: "x", equipe: null, type: "HUMAN" },
      { n: 3, client: "y", equipe: null, type: "NATION" },
    ];
    const c = couleursDesJoueurs(joueurs, new Set(["g"]), null);
    expect([c.get(1), c.get(2), c.get(3)]).toEqual([COULEUR_GAULOIS, COULEURS_ADVERSES[0], COULEURS_ADVERSES[1]]);
    expect([...c.values()]).not.toContain(COULEUR_EQUIPE);
  });
  it("aucune couleur adverse ne ressemble aux bleus des Gaulois ni au vert des retombées", () => {
    const teinte = ([r, g, b]: Rgb) => {
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h * 60;
    };
    const ecart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    for (const c of COULEURS_ADVERSES) {
      for (const proche of [COULEUR_GAULOIS, COULEUR_EQUIPE, COULEUR_RETOMBEES]) expect(ecart(teinte(c), teinte(proche))).toBeGreaterThan(45);
    }
    expect(new Set(COULEURS_ADVERSES.map(String)).size).toBe(COULEURS_ADVERSES.length);
  });
});

describe("le terrain", () => {
  it("reprend les couleurs du jeu : sable, plaines, hauteurs, montagnes, littoral, océan", () => {
    expect(couleurTerrain(TERRE | LITTORAL | 2)).toEqual([204, 203, 158]);
    expect(couleurTerrain(TERRE | 5)).toEqual([190, 210, 138]);
    expect(couleurTerrain(TERRE | 12)).toEqual([224, 207, 162]);
    expect(couleurTerrain(TERRE | 24)).toEqual([242, 242, 242]);
    expect(couleurTerrain(LITTORAL)).toEqual([126, 170, 203]);
    expect(couleurTerrain(30)).toEqual([61, 123, 171]);
  });
  it("sait si la mer entoure la carte", () => {
    expect(ouverteSurLaMer(Uint8Array.from([0, 0, 0, 0, TERRE, 0, 0, 0, 0]), 3, 3)).toBe(true);
    expect(ouverteSurLaMer(TERRAIN, 4, 3)).toBe(false);
  });
  it("assombrit le bord d'un territoire comme le jeu : la clarté baisse de 12,5 points", () => {
    expect(couleurBord([0, 0, 255])).toEqual([0, 0, 191]);
    expect(couleurBord([255, 255, 255])).toEqual([223, 223, 223]);
  });
});

describe("dessinerCarteFinale", () => {
  const couleurs = couleursDesJoueurs(META.joueurs, new Set(["g1"]), "Red");
  const etat = { largeur: 4, hauteur: 3, proprio: PROPRIO, terrain: TERRAIN, retombees: RETOMBEES };
  const pixel = (img: Uint8Array, largeur: number, x: number, y: number): Rgb => [img[(y * largeur + x) * 3]!, img[(y * largeur + x) * 3 + 1]!, img[(y * largeur + x) * 3 + 2]!];
  it("dessine la mer de nuit, son littoral, et le bord infranchissable dans le fond du cadre", () => {
    const img = dessinerCarteFinale(etat, couleurs, 4, 3);
    expect(img).toHaveLength(4 * 3 * 3);
    expect(pixel(img, 4, 0, 0)).toEqual([...MER_FINALE]);
    expect(pixel(img, 4, 0, 1)).toEqual([...LITTORAL_FINAL]);
    expect(pixel(img, 4, 2, 2)).toEqual([...HORS_CARTE]);
  });
  it("une terre libre garde la couleur du terrain ; un territoire prend la couleur de son joueur, plus sombre sur son bord", () => {
    // Une carte où un joueur tient un carré de 3 × 3 cases au milieu de 5 × 5 : seule la case du centre n'est pas un bord.
    const proprio = new Uint16Array(25);
    for (const i of [6, 7, 8, 11, 12, 13, 16, 17, 18]) proprio[i] = 1;
    const terrain = new Uint8Array(25).fill(TERRE | 3);
    const img = dessinerCarteFinale({ largeur: 5, hauteur: 5, proprio, terrain, retombees: new Uint8Array(25) }, couleurs, 5, 5);
    expect(pixel(img, 5, 0, 0)).toEqual([...couleurTerrain(TERRE | 3)]);
    expect(pixel(img, 5, 1, 1)).toEqual(couleurBord(COULEUR_GAULOIS));
    const centre = pixel(img, 5, 2, 2);
    expect(centre).not.toEqual(pixel(img, 5, 1, 1));
    expect(centre[2]).toBeGreaterThan(centre[0] + 60);
  });
  it("les retombées se posent par-dessus, en vert, sur la terre seulement", () => {
    const img = dessinerCarteFinale(etat, couleurs, 4, 3);
    const touchee = pixel(img, 4, 3, 2);
    expect(touchee[1]).toBeGreaterThan(touchee[0] + 40);
    expect(touchee[1]).toBeGreaterThan(touchee[2] + 40);
    expect(COULEUR_RETOMBEES[1]).toBeGreaterThan(200);
  });
  it("se dessine à n'importe quelle taille : chaque pixel prend la case sous son centre", () => {
    const img = dessinerCarteFinale(etat, couleurs, 8, 6, 2);
    expect(img).toHaveLength(8 * 6 * 3);
    expect(pixel(img, 8, 0, 0)).toEqual([...MER_FINALE]);
    expect(pixel(img, 8, 1, 1)).toEqual([...MER_FINALE]);
  });
  it("un joueur sans couleur ne se dessine pas : sa case garde le terrain", () => {
    const img = dessinerCarteFinale(etat, new Map(), 4, 3);
    expect(pixel(img, 4, 1, 0)).toEqual([...couleurTerrain(TERRE | 3)]);
  });
  it("compte la terre tenue par chaque couleur, pour la description", () => {
    const parts = partsDesCouleurs(etat, couleurs);
    expect(parts.get(COULEUR_GAULOIS)).toBe(3);
    expect(parts.get(COULEUR_EQUIPE)).toBe(1);
    expect(parts.get(COULEURS_ADVERSES[0]!)).toBe(3);
    expect(parts.get(COULEUR_ROBOTS)).toBe(1);
  });
});
