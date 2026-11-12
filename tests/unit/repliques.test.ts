import { describe, expect, it } from "vitest";
import { FRAPPE_MS, REACTIONS, REPLIQUES, REPLIQUES_SOURIS, REPLIQUE_LIGNE_MAX, decouper, dureeReplique, lettres, pauseAvant, repliquesPour, tirage } from "../../src/lib/fx/repliques";
import { aleatoire } from "../../src/lib/logo-matrice";

const TOUTES = [...REPLIQUES, ...Object.values(REACTIONS)];

describe("les répliques du guerrier", () => {
  it("sont courtes : deux lignes au plus, qui tiennent dans la bulle", () => {
    expect(REPLIQUES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(TOUTES).size).toBe(TOUTES.length);
    for (const replique of TOUTES) {
      const lignes = replique.split("\n");
      expect(lignes.length, replique).toBeLessThanOrEqual(2);
      for (const ligne of lignes) {
        expect(ligne.length, replique).toBeGreaterThan(0);
        expect(ligne.length, replique).toBeLessThanOrEqual(REPLIQUE_LIGNE_MAX);
        expect(ligne, replique).toBe(ligne.trim());
      }
    }
  });

  it("n'annoncent aucun chiffre, ne citent pas Astérix et n'ont pas d'emoji", () => {
    for (const replique of TOUTES) {
      // Ni rang, ni score, ni résultat : une réplique n'est pas une donnée.
      expect(replique, replique).not.toMatch(/\d/);
      expect(replique, replique).not.toMatch(/ast[ée]rix|ob[ée]lix|id[ée]fix|panoramix|toutatis|b[ée]l[ée]nos|potion|sanglier|menhir|irr[ée]ductible|romain|barde/i);
      expect(replique, replique).not.toMatch(/\p{Extended_Pictographic}/u);
      // Ni argent, ni monnaie du jeu.
      expect(replique, replique).not.toMatch(/plutonium|capsule|euro|payer|acheter/i);
    }
  });

  it("commencent par le regard : le guerrier fixe le curseur", () => {
    expect(REPLIQUES[0]).toBe("Je te vois.");
  });

  it("ne parlent du curseur qu'à ceux qui en ont un", () => {
    // Avec une souris : toutes. Au toucher : sans celles qui disent suivre le curseur, et la première reste la même.
    expect(repliquesPour(true)).toEqual(REPLIQUES);
    const auToucher = repliquesPour(false);
    expect(auToucher[0]).toBe(REPLIQUES[0]);
    expect(auToucher.length).toBe(REPLIQUES.length - REPLIQUES_SOURIS.length);
    for (const replique of REPLIQUES_SOURIS) {
      expect(REPLIQUES).toContain(replique);
      expect(auToucher).not.toContain(replique);
    }
    expect(auToucher.length).toBeGreaterThanOrEqual(8);
  });

  it("séparent la commande tapée de la réponse, et collent la ponctuation double à son mot", () => {
    expect(decouper("$ whoami\nGaulois.")).toEqual({ commande: "$ whoami", parole: "Gaulois." });
    expect(decouper("Je te vois.")).toEqual({ commande: null, parole: "Je te vois." });
    const insecable = String.fromCharCode(160);
    expect(decouper("Encore une partie ?").parole).toBe(`Encore une partie${insecable}?`);
    expect(decouper("Tous au front !").parole).toBe(`Tous au front${insecable}!`);
    // Chaque réplique à commande a bien sa réponse.
    for (const replique of TOUTES) {
      const { commande, parole } = decouper(replique);
      expect(parole.length, replique).toBeGreaterThan(0);
      if (commande) expect(commande.startsWith("$ "), replique).toBe(true);
      expect(lettres(replique)).toBe((commande?.length ?? 0) + parole.length);
    }
  });

  it("restent à l'écran le temps de les lire, entre 3,2 et 7 secondes", () => {
    for (const replique of TOUTES) {
      const duree = dureeReplique(replique);
      expect(duree).toBeGreaterThanOrEqual(3_200);
      expect(duree).toBeLessThanOrEqual(7_000);
      // Une fois écrite, il reste au moins une seconde et demie pour la lire.
      expect(duree - lettres(replique) * FRAPPE_MS).toBeGreaterThanOrEqual(1_500);
    }
    expect(dureeReplique("$ sudo tenir la ligne\nAccordé.")).toBeGreaterThan(dureeReplique("Je te vois."));
    expect(dureeReplique("x".repeat(500))).toBe(7_000);
  });

  it("s'espacent de plus en plus : jamais moins de onze secondes de silence", () => {
    const pauses = [0, 1, 2, 3, 4, 5, 6, 7, 50].map(pauseAvant);
    expect(pauses).toEqual([...pauses].sort((a, b) => a - b));
    expect(Math.min(...pauses)).toBeGreaterThanOrEqual(11_000);
    expect(Math.max(...pauses)).toBe(24_000);
  });
});

describe("l'ordre des répliques", () => {
  it("dit la première d'abord, puis toutes les autres avant d'en redire une", () => {
    for (const graine of [1, 7, 42, 2026]) {
      const suivante = tirage(REPLIQUES.length, aleatoire(graine));
      const premierTour = Array.from({ length: REPLIQUES.length }, () => suivante());
      expect(premierTour[0]).toBe(0);
      expect([...premierTour].sort((a, b) => a - b)).toEqual(REPLIQUES.map((_, i) => i));
      const secondTour = Array.from({ length: REPLIQUES.length }, () => suivante());
      expect([...secondTour].sort((a, b) => a - b)).toEqual(REPLIQUES.map((_, i) => i));
    }
  });

  it("ne dit jamais deux fois la même à la suite, même d'un tour au suivant et aux bornes du tirage", () => {
    for (const hasard of [aleatoire(3), aleatoire(99), () => 0, () => 0.999999, () => 1]) {
      for (const n of [2, 3, 5, REPLIQUES.length]) {
        const suivante = tirage(n, hasard);
        let avant = -1;
        for (let i = 0; i < 300; i++) {
          const index = suivante();
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(n);
          expect(index).not.toBe(avant);
          avant = index;
        }
      }
    }
  });

  it("donne le même ordre pour le même tirage, et tient avec une seule réplique ou aucune", () => {
    const a = tirage(8, aleatoire(5));
    const b = tirage(8, aleatoire(5));
    expect(Array.from({ length: 30 }, () => a())).toEqual(Array.from({ length: 30 }, () => b()));
    const seule = tirage(1, aleatoire(5));
    expect([seule(), seule(), seule()]).toEqual([0, 0, 0]);
    expect(tirage(0, aleatoire(5))()).toBe(-1);
  });
});
