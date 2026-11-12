import { describe, expect, it } from "vitest";
import { FRAPPE_MS, REACTIONS, REPLIQUES, REPLIQUES_SOURIS, REPLIQUE_LIGNE_MAX, decouper, dureeReplique, lettres, pauseAvant, repliquesPour, tirage } from "../../src/lib/fx/repliques";
import { aleatoire } from "../../src/lib/logo-matrice";

const TOUTES: string[] = [...REPLIQUES, ...Object.values(REACTIONS).flat()];

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

  it("répondent aux gestes sans se répéter : plusieurs réponses au clic et au tour complet", () => {
    // Le pilote a remarqué, le 12 novembre 2026, qu'il redisait la même à chaque clic.
    expect(REACTIONS.clic.length).toBeGreaterThanOrEqual(4);
    expect(REACTIONS.tour.length).toBeGreaterThanOrEqual(4);
    expect(REACTIONS.survol.length).toBeGreaterThanOrEqual(1);
    // Aucune réponse ne sert à deux gestes, ni ne redit une réplique.
    const reponses: string[] = Object.values(REACTIONS).flat();
    expect(new Set(reponses).size).toBe(reponses.length);
    for (const reponse of reponses) expect(REPLIQUES).not.toContain(reponse);
    // Une réponse tient sur une ligne : elle ne parle pas à la machine.
    for (const reponse of reponses) expect(decouper(reponse).machine, reponse).toBeNull();
    // Dix clics de suite, avec le tirage de chaque geste : jamais deux fois la même réponse à la suite.
    for (const liste of [REACTIONS.clic, REACTIONS.tour]) {
      const suivante = tirage(liste.length, aleatoire(11));
      const dites = Array.from({ length: 10 }, () => liste[suivante()]);
      expect(dites[0]).toBe(liste[0]);
      dites.forEach((reponse, i) => {
        expect(reponse).toBeDefined();
        if (i > 0) expect(reponse).not.toBe(dites[i - 1]);
      });
      // Et toutes y passent avant qu'une ne revienne.
      expect(new Set(dites.slice(0, liste.length)).size).toBe(liste.length);
    }
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

  it("séparent la ligne de la machine de la réponse du guerrier, et collent la ponctuation double à son mot", () => {
    const insecable = String.fromCharCode(160);
    expect(decouper("> identité ?\nGaulois.")).toEqual({ machine: `> identité${insecable}?`, parole: "Gaulois." });
    expect(decouper("> ordre : tenir la ligne\nReçu.")).toEqual({ machine: `> ordre${insecable}: tenir la ligne`, parole: "Reçu." });
    expect(decouper("Je te vois.")).toEqual({ machine: null, parole: "Je te vois." });
    expect(decouper("Encore une partie ?").parole).toBe(`Encore une partie${insecable}?`);
    expect(decouper("Tous au front !").parole).toBe(`Tous au front${insecable}!`);
    // Chaque échange avec la machine a bien sa réponse, et il y en a.
    for (const replique of TOUTES) {
      const { machine, parole } = decouper(replique);
      expect(parole.length, replique).toBeGreaterThan(0);
      if (machine) expect(machine.startsWith("> "), replique).toBe(true);
      expect(lettres(replique)).toBe((machine?.length ?? 0) + parole.length);
    }
    expect(REPLIQUES.filter((replique) => decouper(replique).machine !== null).length).toBeGreaterThanOrEqual(3);
  });

  it("parlent français, en mots que tout joueur comprend : ni commande d'informaticien, ni anglais", () => {
    for (const replique of TOUTES) {
      // Les commandes d'un terminal et leurs signes : le pilote et les visiteurs ne lisent pas ce jargon.
      expect(replique, replique).not.toMatch(/[$#|&\\/{}[\]<=*~`_@]/);
      expect(replique, replique).not.toMatch(/\b(sudo|whoami|rm|grep|ping|ssh|ls|cd|cat|echo|exit|root|admin|kill|git|npm)\b/i);
      expect(replique, replique).not.toMatch(/\b(the|you|is|are|access|granted|denied|error|loading|target|locked|hello|world|game over)\b/i);
      // Le seul signe permis est le chevron de la machine, en tête de sa ligne.
      expect(replique.replace(/^> /, ""), replique).not.toContain(">");
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
    expect(dureeReplique("> ordre : tenir la ligne\nReçu.")).toBeGreaterThan(dureeReplique("Je te vois."));
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
