import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tenueAuHasard, type Tenue } from "../../src/lib/gaulois";
import { AUCUN_GAULOIS } from "../../src/lib/gaulois-joueurs";
import { gauloisDesNoms, gauloisDuJournal, gauloisParPartie, pngDuGaulois, portraitDuGaulois } from "../../src/lib/gaulois-site";
import { CLASSE } from "../../src/lib/rejeu/film";
import { BUST_CUT } from "../../src/lib/gaulois-sprite";

// Des valeurs d'essai, qui ne désignent personne.
const A = "EssaiAaa1";
const B = "EssaiBbb2";
const C = "EssaiCcc3";
let graine = 5;
const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
const gaulois = new Map<string, Tenue>([
  [A, tenueAuHasard(hasard)],
  [B, tenueAuHasard(hasard)],
]);
const membre = (publicId: string | null, username: string | null) => ({ publicId, username });
const liste = (parties: [string, 0 | 1][]) => ({ seen: parties.length, readAt: "2026-11-16T10:00:00.000Z", older: null, games: parties.map(([id, gagne]) => [id, "2026-11-16T09:00:00.000Z", gagne] as [string, string, 0 | 1]) });

describe("le Gaulois d'un membre sur les pages du site", () => {
  it("ne montre rien pour un membre sans Gaulois, sans identifiant, ou sans relevé", () => {
    expect(portraitDuGaulois(C, gaulois)).toBeNull();
    expect(portraitDuGaulois(null, gaulois)).toBeNull();
    expect(portraitDuGaulois(A, AUCUN_GAULOIS)).toBeNull();
  });

  it("donne l'adresse de l'image, ses mesures et la hauteur du buste", () => {
    const portrait = portraitDuGaulois(A, gaulois)!;
    expect(portrait.image.startsWith(`/gaulois/${A}.png?v=`)).toBe(true);
    expect(portrait.image).toMatch(/=[0-9a-f]{8}$/);
    expect(portrait.largeur).toBeGreaterThan(0);
    expect(portrait.buste).toBeGreaterThan(0);
    expect(portrait.buste).toBeLessThan(portrait.hauteur);
    expect(portrait.buste).toBeLessThanOrEqual(BUST_CUT);
  });

  it("change d'adresse quand la tenue change", () => {
    const autre = new Map(gaulois).set(A, gaulois.get(B)!);
    expect(portraitDuGaulois(A, autre)!.image).not.toBe(portraitDuGaulois(A, gaulois)!.image);
  });

  it("dessine une image aux mesures annoncées, une case par pixel", async () => {
    const portrait = portraitDuGaulois(A, gaulois)!;
    const meta = await sharp((await pngDuGaulois(A, gaulois))!).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", portrait.largeur, portrait.hauteur]);
    expect(await pngDuGaulois(C, gaulois)).toBeNull();
  });
});

describe("les Gaulois d'une partie", () => {
  const membres = [membre(A, "Zoe"), membre(B, "Alba"), membre(C, "Brennos"), membre("EssaiDdd4", null)];
  const resultats = { [A]: liste([["partie1", 1], ["partie2", 0]]), [B]: liste([["partie1", 1]]), [C]: liste([["partie1", 1], ["partie3", 1]]), EssaiDdd4: liste([["partie1", 1]]) };

  it("ne nomme que les membres au pseudo public qui ont créé leur Gaulois, par ordre de pseudo", () => {
    const index = gauloisParPartie(resultats, membres, gaulois);
    expect(index.get("partie1")!.map((g) => g.username)).toEqual(["Alba", "Zoe"]);
    expect(index.get("partie2")!.map((g) => g.id)).toEqual([A]);
    // Brennos n'a pas de Gaulois : sa partie n'a personne à montrer.
    expect(index.has("partie3")).toBe(false);
  });

  it("reconnaît dans les noms d'un film les membres du camp du clan, jamais un homonyme ni un autre camp", () => {
    const noms = [
      { texte: "Zoe", classe: CLASSE.gaulois },
      { texte: "Alba", classe: CLASSE.equipe },
      { texte: "Brennos", classe: CLASSE.gaulois },
      { texte: "[UN]", classe: CLASSE.adverses },
    ];
    // Zoe a un Gaulois ; Alba n'est pas du camp du clan ; Brennos n'a pas de Gaulois.
    expect(gauloisDesNoms(noms, membres, gaulois).map((g) => g.id)).toEqual([A]);
    // Deux membres portent le même pseudo : le nom ne désigne personne.
    expect(gauloisDesNoms(noms, [...membres, membre(B, "Zoe")], gaulois)).toEqual([]);
    expect(gauloisDesNoms(noms, membres, AUCUN_GAULOIS)).toEqual([]);
  });

  it("range pour le journal chaque portrait une fois, et seulement les parties qui ont quelqu'un à montrer", () => {
    const index = gauloisParPartie(resultats, membres, gaulois);
    const journal = gauloisDuJournal(["partie1", "partie2", "partie3", "inconnue"], (partie) => index.get(partie) ?? []);
    expect(journal.parties).toEqual({ partie1: [B, A], partie2: [A] });
    expect(Object.keys(journal.portraits).sort()).toEqual([A, B].sort());
    expect(journal.portraits[A]).toEqual({ username: "Zoe", ...portraitDuGaulois(A, gaulois)! });
  });

  it("ne montre personne sans relevé des Gaulois", () => {
    expect(gauloisParPartie(resultats, membres, AUCUN_GAULOIS).size).toBe(0);
  });
});
