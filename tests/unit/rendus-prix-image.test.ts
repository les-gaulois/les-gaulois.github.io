import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import type { CardText, GazetteCard, Measure } from "../../src/lib/gazette-image";
import { COMPTES_POUR_LE_TOTAL, PRIX_BAISSES, type GenreRendu, type LigneRendue, type RenduDUnJoueur, type RendusDesPrix } from "../../src/lib/rendus-prix";
import {
  COULEUR_DES_RENDUS,
  LARGEUR_SUR_HAUTEUR_MIN,
  LIGNES_MONTREES,
  autresEnMots,
  cartePrivee,
  cartePublique,
  dessinerLePrive,
  dessinerLePublic,
  detailDuJoueur,
  enLignes,
  texteDuPrive,
  texteDuPublic,
  totalEnMots,
} from "../../src/lib/rendus-prix-image";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);
const SITE = "https://les-gaulois.github.io";
const ROOT = process.cwd();
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const words = (card: GazetteCard) => card.texts.map((t) => plain(t.text));
const SIGNES = /[→÷>=<]/;
/** Un identifiant Discord : de 17 à 20 chiffres à la suite. */
const ID_DISCORD = /\d{17,20}/;

/** Des joueurs d'exemple, pour les tests seulement. */
const ligne = (genre: GenreRendu, objet: string | null, rarete: LigneRendue["rarete"], paye: number, nouveau: number, dejaRendu = 0): LigneRendue => ({ genre, objet, rarete, paye, nouveau, dejaRendu, rendu: dejaRendu > 0 ? Math.round(((paye - nouveau) * (paye - dejaRendu)) / paye) : paye - nouveau });
const joueur = (n: number, nom: string, gaulois: RenduDUnJoueur["gaulois"], lignes: LigneRendue[], discord: string | null = "123456789012345678"): RenduDUnJoueur => ({ n, discord, nom, total: lignes.reduce((s, l) => s + l.rendu, 0), gaulois, lignes });

const COURT = joueur(1, "Vercingétotest", { tenue: { ...TENUE_DE_DEPART, tete: "casque" }, familier: "souris-des-greniers", banniere: "aube-de-la-bombe-h" }, [
  ligne("banniere", "aube-de-la-bombe-h", "legendaire", 7500, 5000),
  ligne("pochette_familiers", "souris-des-greniers", null, 2000, 1000),
]);
const LONG = joueur(2, "@Bidule des essais", { tenue: TENUE_DE_DEPART, familier: null, banniere: null }, [
  ligne("modele", "dragon", "legendaire", 28000, 15000),
  ligne("banniere", "port-au-couchant", "peu-commun", 750, 500),
  ligne("pochette_modeles", null, null, 3000, 1600, 900),
  ligne("pochette_modeles", "lezard", null, 3000, 1600),
  ligne("carte", "champignon-atomique", "legendaire", 7500, 5000),
  ligne("cadre", "rubis", "epique", 1500, 1000),
  ligne("pochette_bannieres", null, null, 1500, 1000, 300),
  ligne("pochette_familiers", "poussin-jaune", null, 2000, 1000),
  ligne("banniere", "foret-doree", "commun", 300, 200),
  ligne("cadre", "soleil", "legendaire", 7500, 5000),
]);
/** La somme de tous, choisie pour ne ressembler à aucun autre nombre de l'image. */
const BEAUCOUP: RendusDesPrix = { comptes: 12, total: 48_317, le: "2026-11-21T20:00:00Z", jusquA: null, rendus: [COURT, LONG] };
const PEU: RendusDesPrix = { comptes: COMPTES_POUR_LE_TOTAL - 1, total: 9_317, le: "2026-11-21T20:00:00Z", jusquA: null, rendus: [COURT] };

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. */
function expectClean(card: GazetteCard): void {
  const rightOf = (t: CardText) => (t.anchor === "end" ? t.x : t.x + measure(t.text, t.font, t.size));
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - measure(t.text, t.font, t.size) : t.x);
  for (const t of card.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(card.width);
    expect(t.y, t.text).toBeLessThanOrEqual(card.height);
    expect(t.text, t.text).not.toMatch(SIGNES);
  }
  for (const r of card.rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(card.width);
    expect(r.y + r.height).toBeLessThanOrEqual(card.height);
  }
  for (const d of card.dessins ?? []) {
    expect(Number.isInteger(d.echelle) && d.echelle >= 1).toBe(true);
    expect(d.x).toBeGreaterThanOrEqual(0);
    expect(d.y).toBeGreaterThanOrEqual(0);
    expect(d.x + d.decor.largeur * d.echelle).toBeLessThanOrEqual(card.width);
    expect(d.y + d.decor.hauteur * d.echelle).toBeLessThanOrEqual(card.height);
  }
  expect(card.width / card.height).toBeGreaterThanOrEqual(LARGEUR_SUR_HAUTEUR_MIN);
}

describe("l'image publique des prix baissés", () => {
  it("dit la baisse, le tableau avant et maintenant, et la règle, sans nom ni montant d'un joueur", () => {
    const card = cartePublique(BEAUCOUP, SITE, measure);
    expectClean(card);
    const mots = words(card);
    const tout = mots.join(" ");
    expect(mots).toContain("Prix baissés");
    expect(tout).toContain("21 novembre 2026");
    for (const p of PRIX_BAISSES) {
      expect(mots).toContain(p.quoi);
      expect(mots).toContain(plain(p.avant));
      expect(mots).toContain(plain(p.maintenant));
    }
    for (const j of BEAUCOUP.rendus) {
      expect(tout).not.toContain(j.nom);
      expect(tout).not.toContain(j.nom.replace("@", ""));
      expect(tout).not.toContain(plain(`${new Intl.NumberFormat("fr-FR").format(j.total)} statères`));
    }
    expect(tout).not.toMatch(ID_DISCORD);
  });

  it("n'écrit la somme rendue à tous que si totalPublic la donne", () => {
    expect(plain(totalEnMots(BEAUCOUP) ?? "")).toBe("12 Gaulois remboursés, 48 317 statères rendus");
    expect(totalEnMots(PEU)).toBeNull();
    expect(words(cartePublique(BEAUCOUP, SITE, measure)).join(" ")).toContain("48 317");
    const peu = cartePublique(PEU, SITE, measure);
    expectClean(peu);
    expect(words(peu).join(" ")).not.toMatch(/9 317|remboursés,/);
    expect(plain(texteDuPublic(PEU))).not.toContain("9 317");
    expect(plain(texteDuPublic(BEAUCOUP))).toContain("48 317");
  });

  it("se dessine, assez large pour Discord, avec une description sans nom ni montant d'un joueur", async () => {
    for (const r of [BEAUCOUP, PEU]) {
      const { png, alt } = await dessinerLePublic(r, SITE, ROOT);
      const meta = await sharp(png).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width! / meta.height!).toBeGreaterThanOrEqual(LARGEUR_SUR_HAUTEUR_MIN);
      expect(alt.length).toBeGreaterThan(100);
      expect(alt.length).toBeLessThanOrEqual(1024);
      expect(alt).not.toMatch(SIGNES);
      for (const j of r.rendus) {
        expect(alt).not.toContain(j.nom.replace("@", ""));
        expect(plain(alt)).not.toContain(plain(new Intl.NumberFormat("fr-FR").format(j.total)));
      }
      expect(plain(alt).includes("9 317")).toBe(false);
      expect(plain(alt).includes("48 317")).toBe(r === BEAUCOUP);
    }
  });
});

describe("l'image privée d'un joueur remboursé", () => {
  it("montre son nom, son montant et ses achats", () => {
    const card = cartePrivee(COURT, SITE, measure);
    expectClean(card);
    const mots = words(card);
    expect(mots).toContain("Vercingétotest");
    expect(mots).toContain("3 500 statères");
    expect(mots).toContain("2 500 statères rendus");
    expect(mots).toContain("Booster des familiers");
    // Son Gaulois devant sa bannière : la scène de /gaulois, 124 cases sur 80.
    expect(card.dessins.some((d) => d.decor.largeur === 124 && d.decor.hauteur === 80 && d.echelle === 4)).toBe(true);
  });

  it("détaille six achats au plus, puis compte les autres en une ligne", () => {
    const { montrees, autres } = detailDuJoueur(LONG);
    expect(montrees).toHaveLength(LIGNES_MONTREES);
    // Restent le booster des familiers, une bannière et un cadre.
    expect(autres).toEqual({ achats: 3, rendu: 1000 + 100 + 2500 });
    expect(montrees.reduce((s, l) => s + l.rendu, 0) + autres!.rendu).toBe(LONG.total);
    expect(plain(autresEnMots(autres!))).toBe("et 3 autres achats : 3 600 statères");
    expect(plain(autresEnMots({ achats: 1, rendu: 1 }))).toBe("et 1 autre achat : 1 statère");
    expect(detailDuJoueur(COURT).autres).toBeNull();
    const card = cartePrivee(LONG, SITE, measure);
    expectClean(card);
    expect(words(card)).toContain("et 3 autres achats : 3 600 statères");
    // Sans bannière : la scène de nuit de /gaulois, posée en pixels.
    expect(card.scene).toMatchObject({ width: 496, height: 320 });
  });

  it("se dessine sans Gaulois lisible", () => {
    for (const gaulois of [null, { tenue: "illisible", familier: "inconnu", banniere: "inconnue" }]) {
      const card = cartePrivee({ ...COURT, gaulois }, SITE, measure);
      expectClean(card);
      expect(card.scene ?? null).toBeNull();
      expect(card.dessins.some((d) => d.decor.largeur === 124 && d.echelle === 4)).toBe(false);
    }
  });

  it("se dessine, assez large pour Discord, et sa description donne le montant", async () => {
    for (const j of [COURT, LONG, { ...COURT, gaulois: null }]) {
      const { png, alt } = await dessinerLePrive(j, SITE, ROOT);
      const meta = await sharp(png).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width! / meta.height!).toBeGreaterThanOrEqual(LARGEUR_SUR_HAUTEUR_MIN);
      expect(alt.length).toBeLessThanOrEqual(1024);
      expect(plain(alt)).toContain(plain(`${new Intl.NumberFormat("fr-FR").format(j.total)} statères`));
      expect(alt).not.toContain("@");
      expect(alt).not.toMatch(ID_DISCORD);
    }
  });
});

describe("les textes de secours", () => {
  /** Un joueur aux très nombreux achats : le texte reste sous la limite. */
  const ENORME = joueur(
    3,
    "@Énorme",
    null,
    Array.from({ length: 60 }, () => ligne("banniere", "aube-de-la-bombe-h", "legendaire", 7500, 5000)),
  );

  it("tiennent en 1 800 signes, sans arobase, sans lien ni identifiant Discord", () => {
    for (const texte of [texteDuPublic(BEAUCOUP), texteDuPublic(PEU), texteDuPrive(COURT), texteDuPrive(LONG), texteDuPrive(ENORME)]) {
      expect(texte.length).toBeGreaterThan(50);
      expect(texte.length).toBeLessThanOrEqual(1800);
      expect(texte).not.toContain("@");
      expect(texte).not.toMatch(/https?:|www\./);
      expect(texte).not.toMatch(ID_DISCORD);
      expect(texte).not.toMatch(SIGNES);
    }
    expect(plain(texteDuPrive(COURT))).toContain("3 500 statères rendus");
    expect(plain(texteDuPrive(ENORME))).toContain("et 50 autres achats : 125 000 statères");
  });

  it("la couleur du cadre est un entier de couleur", () => {
    expect(Number.isInteger(COULEUR_DES_RENDUS)).toBe(true);
    expect(COULEUR_DES_RENDUS).toBeGreaterThan(0);
    expect(COULEUR_DES_RENDUS).toBeLessThanOrEqual(0xffffff);
  });

  it("coupe un texte en lignes qui tiennent", () => {
    const lignes = enLignes("un deux trois quatre cinq six", "body", 20, 100, measure);
    expect(lignes.join(" ")).toBe("un deux trois quatre cinq six");
    for (const l of lignes) expect(measure(l, "body", 20)).toBeLessThanOrEqual(100);
  });
});
