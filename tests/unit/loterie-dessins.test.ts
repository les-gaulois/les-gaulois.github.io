import { describe, expect, it } from "vitest";
import { CARTE_HAUTEUR, CARTE_LARGEUR, LUMIERES, PAQUET_HAUTEUR, PAQUET_LARGEUR, TONS, morceauxDuPaquet, paquet } from "../../src/lib/jeu/boosters";
import { SORTES_DE_BOOSTER, SORTE_DE_LOTERIE } from "../../src/lib/jeu/boosters-dessins";
import { signesInconnus, enCapitales } from "../../src/lib/jeu/ecriture";
import { billet, carteDuBoosterDeLoterie, miniBooster, ticketDOr } from "../../src/lib/jeu/loterie-dessins";
import type { Planche } from "../../src/lib/jeu/planche";

// Les dessins du booster de loterie (21 novembre 2026) : le paquet, la carte qui en sort, le billet, le ticket d'or et les
// petits boosters de la semaine.
const peintes = (p: Planche): number => {
  let n = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i]! > 0) n++;
  return n;
};
const pareilles = (a: Planche, b: Planche): boolean => Buffer.from(a.data).equals(Buffer.from(b.data));

describe("le paquet du booster de loterie", () => {
  it("n'est pas à l'étal, qui garde ses cinq boosters", () => {
    expect(SORTE_DE_LOTERIE).toBe("loterie");
    expect(SORTES_DE_BOOSTER).toHaveLength(5);
    expect(SORTES_DE_BOOSTER as readonly string[]).not.toContain("loterie");
  });

  it("a l'anatomie dont l'animation dépend : 60 × 88 cases, une bande en quatre morceaux, un corps plein", () => {
    const p = paquet(SORTE_DE_LOTERIE);
    expect([p.width, p.height]).toEqual([PAQUET_LARGEUR, PAQUET_HAUTEUR]);
    const { corps, bande } = morceauxDuPaquet(p);
    expect([corps.width, corps.height]).toEqual([60, 78]);
    expect(bande).toHaveLength(4);
    for (const m of bande) {
      expect([m.width, m.height]).toEqual([15, 10]);
      expect(peintes(m), "un morceau de bande vide").toBeGreaterThan(60);
    }
    for (let y = 0; y < 68; y++) for (let x = 2; x < 58; x++) expect(corps.pleine(x, y), `(${x}, ${y + 10})`).toBe(true);
  });

  it("garde la bande de déchirure et le haut du corps des autres : seuls la robe et le médaillon changent", () => {
    const p = paquet(SORTE_DE_LOTERIE);
    const surprise = paquet("surprise");
    // Rangées 0 à 9 : la bande dentelée d'argent, la même pour tous les sachets.
    for (let y = 0; y < 10; y++) for (let x = 0; x < 60; x++) expect(p.couleur(x, y), `bande (${x}, ${y})`).toEqual(surprise.couleur(x, y));
    // Rangées 78 à 87 : le bas serti.
    for (let y = 78; y < 88; y++) for (let x = 0; x < 60; x++) expect(p.couleur(x, y), `bas (${x}, ${y})`).toEqual(surprise.couleur(x, y));
    // Rangées 14 à 27 : le haut du corps reste uni au milieu (le médaillon n'y monte pas), pour les fissures blanches.
    for (let y = 14; y < 28; y++) for (let x = 20; x < 44; x++) expect(p.couleur(x, y), `haut (${x}, ${y})`).toEqual(p.couleur(30, 20));
    // Et il se distingue du booster surprise.
    expect(p.couleur(30, 20)).not.toEqual(surprise.couleur(30, 20));
    expect(pareilles(p, surprise)).toBe(false);
  });
});

describe("la carte du booster de loterie", () => {
  it("sans ticket d'or, prend les couleurs et la lumière du commun, au rang 1", () => {
    const c = carteDuBoosterDeLoterie({ billets: 12, ticketOr: false, billetsOr: 5 });
    expect([c.face.width, c.face.height]).toEqual([CARTE_LARGEUR, CARTE_HAUTEUR]);
    expect([c.rarete, c.rang]).toEqual(["commun", 1]);
    expect(c.tons).toEqual(TONS.commun);
    expect(c.lumiere).toEqual(LUMIERES.commun);
    expect([c.nom, c.mot]).toEqual(["12 billets", "Loterie"]);
    expect(c.face.couleur(34, 0)).toEqual([74, 163, 255, 1]);
  });

  it("avec le ticket d'or, prend celles du légendaire, au rang 5, et dit ce que vaut le ticket", () => {
    const c = carteDuBoosterDeLoterie({ billets: 12, ticketOr: true, billetsOr: 5 });
    expect([c.face.width, c.face.height]).toEqual([CARTE_LARGEUR, CARTE_HAUTEUR]);
    expect([c.rarete, c.rang]).toEqual(["legendaire", 5]);
    expect(c.tons).toEqual(TONS.legendaire);
    expect(c.lumiere).toEqual(LUMIERES.legendaire);
    expect([c.nom, c.mot]).toEqual(["12 billets et 5 de plus", "Ticket d'or"]);
    // Ce que vaut le ticket vient du serveur, jamais d'un 5 écrit en dur : la face et le mot changent avec lui.
    const autre = carteDuBoosterDeLoterie({ billets: 12, ticketOr: true, billetsOr: 8 });
    expect(autre.nom).toBe("12 billets et 8 de plus");
    expect(pareilles(autre.face, c.face)).toBe(false);
    expect(carteDuBoosterDeLoterie({ billets: 3, ticketOr: true, billetsOr: 1 }).nom).toBe("3 billets et 1 de plus");
  });

  it("accorde « billet » : zéro et un au singulier, les milliers séparés", () => {
    const nom = (billets: number, ticketOr = false): string => carteDuBoosterDeLoterie({ billets, ticketOr, billetsOr: 5 }).nom;
    expect(nom(0)).toBe("0 billet");
    expect(nom(1)).toBe("1 billet");
    expect(nom(2)).toBe("2 billets");
    expect(nom(1240)).toBe("1 240 billets");
    expect(nom(0, true)).toBe("0 billet et 5 de plus");
    expect(nom(1, true)).toBe("1 billet et 5 de plus");
  });

  it("montre ce que le serveur a tiré : la face change avec le nombre de billets, et sans ticket ne dépend pas de sa valeur", () => {
    const face = (billets: number, billetsOr = 5): Planche => carteDuBoosterDeLoterie({ billets, ticketOr: false, billetsOr }).face;
    expect(pareilles(face(0), face(1))).toBe(false);
    expect(pareilles(face(1), face(2))).toBe(false);
    expect(pareilles(face(12), face(13))).toBe(false);
    expect(pareilles(face(12, 5), face(12, 9))).toBe(true);
  });

  it("n'écrit que des signes que l'écriture en pixels sait tracer", () => {
    for (const ticketOr of [false, true]) {
      const c = carteDuBoosterDeLoterie({ billets: 1240, ticketOr, billetsOr: 5 });
      expect(signesInconnus(enCapitales(c.nom))).toEqual([]);
      expect(signesInconnus(enCapitales(c.mot))).toEqual([]);
    }
  });
});

describe("les petites pièces de la loterie", () => {
  it("ont la taille prévue : un billet de 18 × 10, un ticket d'or de 40 × 20", () => {
    const b = billet();
    expect([b.width, b.height]).toEqual([18, 10]);
    const t = ticketDOr();
    expect([t.width, t.height]).toEqual([40, 20]);
    // Les encoches du ticket et du billet laissent voir le fond.
    expect(t.pleine(0, 10)).toBe(false);
    expect(t.pleine(39, 10)).toBe(false);
    expect(b.pleine(0, 4)).toBe(false);
    expect(b.pleine(17, 5)).toBe(false);
  });

  it("donnent aux trois petits boosters la même taille, 20 cases de large au plus, et trois dessins différents", () => {
    const [ferme, ouvert, vide] = [miniBooster("ferme"), miniBooster("ouvert"), miniBooster("vide")];
    for (const p of [ferme, ouvert, vide]) {
      expect(p.width).toBeLessThanOrEqual(20);
      expect([p.width, p.height]).toEqual([ferme.width, ferme.height]);
    }
    expect(pareilles(ferme, ouvert)).toBe(false);
    // Le booster ouvert est déchiré en haut : sa première rangée est vide, pas celle du booster scellé.
    const rangee = (p: Planche, y: number): number => Array.from({ length: p.width }, (_, x) => p.pleine(x, y)).filter(Boolean).length;
    expect(rangee(ferme, 0)).toBeGreaterThan(0);
    expect(rangee(ouvert, 0)).toBe(0);
    // La place vide n'est qu'un contour en pointillés : rien dedans.
    expect(peintes(vide)).toBeGreaterThan(20);
    expect(peintes(vide)).toBeLessThan(peintes(ferme) / 3);
    for (let y = 2; y < vide.height - 2; y++) for (let x = 3; x < vide.width - 3; x++) expect(vide.pleine(x, y)).toBe(false);
  });
});
