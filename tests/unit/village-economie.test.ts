import { describe, expect, it } from "vitest";
import { OBJETS, ORDRE_RARETES } from "../../src/lib/gaulois";
import { stateresDeVictoire } from "../../src/lib/stateres";
import { CHANCES_POCHETTE, PRIX_PAR_RARETE, PRIX_POCHETTE } from "../../src/lib/village/contrat";
import {
  type Catalogue,
  cleObjet,
  collectionMixte,
  controlerReglages,
  coutDuCatalogue,
  hasardAGraine,
  moisDeLaPeriode,
  moisParis,
  moisPourSOffrir,
  objetsParRarete,
  objetsPayants,
  ouvrirJusqua,
  type ParRarete,
  pochettesMoyennesPourObjet,
  pochettesMoyennesPourRarete,
  profilsDeJoueurs,
  resume,
  revenusDuClan,
  revenusParJoueur,
  simulerCollectionMixte,
  simulerPochettes,
  tailleDePartie,
  tirerPochette,
  valeurMoyennePochette,
  valeurNeuvePochette,
  type VictoireDuClan,
} from "../../src/lib/village/economie";

/** Un petit catalogue inventé pour les essais : deux emplacements, des gratuits, un objet sans rareté. */
const PETIT: Catalogue = {
  tete: {
    aucun: { rarete: null, gratuit: true },
    bonnet: { rarete: "commun", gratuit: true },
    a: { rarete: "commun", gratuit: false },
    b: { rarete: "peu-commun", gratuit: false },
    c: { rarete: "legendaire", gratuit: false },
  },
  arme: {
    gourdin: { rarete: "commun", gratuit: true },
    d: { rarete: "commun", gratuit: false },
    e: { rarete: "epique", gratuit: false },
    f: { rarete: "mystique", gratuit: false },
  },
};
const PRIX: ParRarete = { commun: 100, "peu-commun": 250, epique: 500, mystique: 1000, legendaire: 2500 };
const CHANCES: ParRarete = { commun: 50, "peu-commun": 28, epique: 15, mystique: 6, legendaire: 1 };
const CONTRAT = { prix: PRIX_PAR_RARETE, prixPochette: PRIX_POCHETTE, chances: CHANCES_POCHETTE, catalogue: OBJETS };

describe("réglages du contrat", () => {
  it("les prix, les chances et le catalogue du contrat tiennent debout", () => {
    expect(controlerReglages(CONTRAT)).toEqual([]);
  });

  it("refuse des chances qui ne font pas 100, pas entières ou négatives", () => {
    expect(controlerReglages({ ...CONTRAT, chances: { ...CHANCES_POCHETTE, commun: CHANCES_POCHETTE.commun + 1 } }).join(" ")).toMatch(/font 101, pas 100/);
    expect(controlerReglages({ ...CONTRAT, chances: { ...CHANCES_POCHETTE, commun: 49.5, "peu-commun": 28.5 } }).join(" ")).toMatch(/pas un entier/);
    expect(controlerReglages({ ...CONTRAT, chances: { ...CHANCES_POCHETTE, commun: -1, "peu-commun": 79 } }).join(" ")).toMatch(/commun : -1/);
  });

  it("refuse une pochette plus chère que ce qu'elle vaut en moyenne", () => {
    const valeur = valeurMoyennePochette(CHANCES_POCHETTE, PRIX_PAR_RARETE);
    expect(controlerReglages({ ...CONTRAT, prixPochette: Math.ceil(valeur) + 1 }).join(" ")).toMatch(/coûte plus que ce qu'elle vaut/);
    expect(controlerReglages({ ...CONTRAT, prixPochette: 0 }).join(" ")).toMatch(/pas un entier positif/);
  });

  it("refuse un objet qui ne coûte pas plus qu'un objet de rareté inférieure", () => {
    const problemes = controlerReglages({ ...CONTRAT, prix: { ...PRIX_PAR_RARETE, epique: PRIX_PAR_RARETE["peu-commun"] } });
    expect(problemes.join(" ")).toMatch(/epique .* ne coûte pas plus qu'un objet peu-commun/);
    expect(controlerReglages({ ...CONTRAT, prix: { ...PRIX_PAR_RARETE, commun: 99.5 } }).join(" ")).toMatch(/commun : 99.5/);
  });

  it("refuse une rareté qui a une chance sans aucun objet payant", () => {
    const sansLegendaire: Catalogue = { tete: { a: { rarete: "commun", gratuit: false } } };
    expect(controlerReglages({ ...CONTRAT, catalogue: sansLegendaire }).join(" ")).toMatch(/legendaire a une chance mais aucun objet payant/);
  });
});

describe("le catalogue", () => {
  it("ne compte que les objets payants, par rareté et par emplacement", () => {
    expect(objetsPayants(PETIT).map((o) => o.cle)).toEqual(["tete/a", "tete/b", "tete/c", "arme/d", "arme/e", "arme/f"]);
    const cout = coutDuCatalogue(PETIT, PRIX);
    expect(cout.nombre).toBe(6);
    expect(cout.cout).toBe(100 + 250 + 2500 + 100 + 500 + 1000);
    expect(cout.parRarete.commun).toEqual({ nombre: 2, cout: 200 });
    expect(cout.parRarete.legendaire).toEqual({ nombre: 1, cout: 2500 });
    expect(cout.parEmplacement["tete"]).toEqual({ nombre: 3, cout: 2850, parRarete: { commun: 1, "peu-commun": 1, epique: 0, mystique: 0, legendaire: 1 } });
    expect(cout.parEmplacement["arme"]?.cout).toBe(1600);
  });

  it("additionne le vrai catalogue objet par objet", () => {
    const payants = Object.values(OBJETS).flatMap((objets) => Object.values(objets).filter((o) => !o.gratuit && o.rarete !== null));
    const cout = coutDuCatalogue(OBJETS, PRIX_PAR_RARETE);
    expect(cout.nombre).toBe(payants.length);
    expect(cout.cout).toBe(payants.reduce((n, o) => n + PRIX_PAR_RARETE[o.rarete ?? "commun"], 0));
    expect(ORDRE_RARETES.reduce((n, r) => n + cout.parRarete[r].cout, 0)).toBe(cout.cout);
    expect(Object.values(cout.parEmplacement).reduce((n, e) => n + e.nombre, 0)).toBe(cout.nombre);
  });

  it("dit en combien de mois un revenu paie un prix, et jamais sans revenu", () => {
    expect(moisPourSOffrir(2500, 500)).toBe(5);
    expect(moisPourSOffrir(100, 400)).toBe(0.25);
    expect(moisPourSOffrir(100, 0)).toBeNull();
    expect(moisPourSOffrir(100, -3)).toBeNull();
  });
});

describe("la pochette", () => {
  it("vaut en moyenne la somme des chances fois les prix", () => {
    expect(valeurMoyennePochette(CHANCES, PRIX)).toBe(50 + 70 + 75 + 60 + 25);
    expect(valeurMoyennePochette({ commun: 100, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 0 }, PRIX)).toBe(100);
  });

  it("ne compte que les objets neufs pour qui possède déjà quelque chose", () => {
    expect(valeurNeuvePochette(CHANCES, PRIX, PETIT, new Set())).toBeCloseTo(valeurMoyennePochette(CHANCES, PRIX));
    const tout = new Set(objetsPayants(PETIT).map((o) => o.cle));
    expect(valeurNeuvePochette(CHANCES, PRIX, PETIT, tout)).toBe(0);
    // La moitié des communs possédée : la part des communs est divisée par deux.
    expect(valeurNeuvePochette(CHANCES, PRIX, PETIT, new Set([cleObjet("tete", "a")]))).toBeCloseTo(280 - 25);
  });

  it("donne le nombre moyen de pochettes pour une rareté et pour un objet précis", () => {
    expect(pochettesMoyennesPourRarete(CHANCES, "legendaire")).toBe(100);
    expect(pochettesMoyennesPourObjet(CHANCES, PETIT, "commun")).toBe(4);
    expect(pochettesMoyennesPourObjet({ ...CHANCES, legendaire: 0 }, PETIT, "legendaire")).toBe(Infinity);
    expect(pochettesMoyennesPourRarete({ ...CHANCES, legendaire: 0 }, "legendaire")).toBe(Infinity);
  });

  it("tire au hasard à graine fixe : mêmes nombres pour une même graine, de 0 à 1", () => {
    const a = hasardAGraine(42);
    const b = hasardAGraine(42);
    const suite = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(suite);
    expect(suite.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(hasardAGraine(43)()).not.toBe(suite[0]);
  });

  it("tire les raretés selon les chances, et un objet de cette rareté", () => {
    const rangs = objetsParRarete(OBJETS);
    const hasard = hasardAGraine(7);
    const comptes = Object.fromEntries(ORDRE_RARETES.map((r) => [r, 0])) as Record<string, number>;
    const n = 40_000;
    for (let i = 0; i < n; i++) {
      const o = tirerPochette(CHANCES_POCHETTE, rangs, hasard);
      expect(OBJETS[o.emplacement as keyof typeof OBJETS][o.objet]?.rarete).toBe(o.rarete);
      comptes[o.rarete] = (comptes[o.rarete] ?? 0) + 1;
    }
    for (const r of ORDRE_RARETES) expect(Math.abs(((comptes[r] ?? 0) / n) * 100 - CHANCES_POCHETTE[r])).toBeLessThan(1);
    const seulLegendaire = { commun: 0, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 100 };
    expect(tirerPochette(seulLegendaire, rangs, hasard).rarete).toBe("legendaire");
  });

  it("simule des ouvertures reproductibles, proches des moyennes calculées", () => {
    const une = simulerPochettes({ but: { rarete: "legendaire" }, chances: CHANCES, catalogue: PETIT, essais: 3000, graine: 1 });
    expect(simulerPochettes({ but: { rarete: "legendaire" }, chances: CHANCES, catalogue: PETIT, essais: 3000, graine: 1 })).toEqual(une);
    expect(une.pochettes.moyenne / 100).toBeGreaterThan(0.9);
    expect(une.pochettes.moyenne / 100).toBeLessThan(1.1);
    const precis = simulerPochettes({ but: { objet: "arme/d" }, chances: CHANCES, catalogue: PETIT, essais: 3000, graine: 2 });
    expect(precis.pochettes.moyenne / pochettesMoyennesPourObjet(CHANCES, PETIT, "commun")).toBeGreaterThan(0.9);
    expect(precis.pochettes.moyenne / pochettesMoyennesPourObjet(CHANCES, PETIT, "commun")).toBeLessThan(1.1);
  });

  it("ouvre jusqu'à tout posséder, doubles comptés", () => {
    const o = ouvrirJusqua("tout", CHANCES, PETIT, hasardAGraine(3));
    expect(o.pochettes).toBeGreaterThanOrEqual(objetsPayants(PETIT).length);
    expect(o.pochettes - o.doubles).toBe(objetsPayants(PETIT).length);
  });

  it("le collectionneur avisé n'ouvre rien quand la pochette ne vaut pas son prix, et dépense alors le prix du catalogue", () => {
    const c = collectionMixte({ chances: CHANCES, prix: PRIX, prixPochette: 1000, catalogue: PETIT, hasard: hasardAGraine(4) });
    expect(c).toEqual({ pochettes: 0, doubles: 0, achats: 6, depense: coutDuCatalogue(PETIT, PRIX).cout });
  });

  it("le collectionneur avisé ouvre des pochettes tant qu'elles rapportent, puis achète le reste", () => {
    // Le légendaire ne sort jamais : la pochette rapporte tant qu'il manque autre chose, puis le légendaire s'achète.
    const sansLegendaire = { ...CHANCES, mystique: 7, legendaire: 0 };
    const c = collectionMixte({ chances: sansLegendaire, prix: PRIX, prixPochette: 1, catalogue: PETIT, hasard: hasardAGraine(5) });
    expect(c.pochettes).toBeGreaterThanOrEqual(5);
    expect(c.pochettes - c.doubles).toBe(5);
    expect(c.achats).toBe(1);
    expect(c.depense).toBe(c.pochettes + 2500);
    const s = simulerCollectionMixte({ chances: CHANCES_POCHETTE, prix: PRIX_PAR_RARETE, prixPochette: PRIX_POCHETTE, catalogue: OBJETS, essais: 50, graine: 6 });
    expect(s).toEqual(simulerCollectionMixte({ chances: CHANCES_POCHETTE, prix: PRIX_PAR_RARETE, prixPochette: PRIX_POCHETTE, catalogue: OBJETS, essais: 50, graine: 6 }));
  });
});

describe("quantiles", () => {
  it("résume une liste, et ne dit rien d'une liste vide", () => {
    expect(resume([5, 1, 4, 2, 3])).toEqual({ nombre: 5, moyenne: 3, p10: 1.4, p25: 2, mediane: 3, p75: 4, p90: 4.6, max: 5 });
    expect(resume([7])?.mediane).toBe(7);
    expect(resume([])).toBeNull();
  });
});

const victoire = (gameId: string, gameStart: string, score: number, clanPlayerCount: number): VictoireDuClan => ({ gameId, gameStart, score, clanPlayerCount });

describe("les revenus du clan", () => {
  it("découpe une période en mois, complets ou non", () => {
    expect(moisDeLaPeriode("2026-04-10", "2026-06-05")).toEqual([
      { mois: "2026-04", jours: 21, complet: false },
      { mois: "2026-05", jours: 31, complet: true },
      { mois: "2026-06", jours: 5, complet: false },
    ]);
    expect(moisDeLaPeriode("2026-12-01", "2027-01-31").map((m) => m.complet)).toEqual([true, true]);
  });

  it("range les parties par nombre de Gaulois et les mois à l'heure de Paris", () => {
    expect([1, 2, 3, 4, 9].map(tailleDePartie)).toEqual(["1", "2", "3", "4+", "4+"]);
    expect(moisParis("2026-10-31T23:30:00.000Z")).toBe("2026-11");
  });

  it("distribue à chaque Gaulois présent ce que donne la règle, par taille, par mois et en tout", () => {
    const victoires = [
      victoire("a", "2026-05-02T12:00:00.000Z", 1.67, 3),
      victoire("b", "2026-05-20T12:00:00.000Z", 0.04, 1),
      victoire("c", "2026-06-01T12:00:00.000Z", 2, 5),
      // Hors de la période lue : ignorée.
      victoire("d", "2026-07-01T12:00:00.000Z", 9, 2),
    ];
    const r = revenusDuClan(victoires, "2026-05-01", "2026-06-10");
    expect(stateresDeVictoire(1.67, 3)).toBe(17);
    expect(r.parTaille["3"]).toEqual({ victoires: 1, points: 1.67, parGaulois: 17, distribues: 51 });
    expect(r.parTaille["1"]).toEqual({ victoires: 1, points: 0.04, parGaulois: 1, distribues: 1 });
    expect(r.parTaille["4+"]).toEqual({ victoires: 1, points: 2, parGaulois: 20, distribues: 100 });
    expect(r.parTaille["2"].victoires).toBe(0);
    expect(r.parMois.map((m) => [m.mois, m.jours, m.complet, m.distribution.distribues])).toEqual([
      ["2026-05", 31, true, 52],
      ["2026-06", 10, false, 100],
    ]);
    expect(r.total).toMatchObject({ victoires: 3, parGaulois: 38, distribues: 152, jours: 41 });
  });
});

describe("les revenus par joueur", () => {
  const victoires = new Map([
    ["v1", victoire("v1", "2026-10-05T20:00:00.000Z", 2.33, 4)],
    ["v2", victoire("v2", "2026-10-31T23:30:00.000Z", 1, 2)],
  ]);
  const connues = new Set(["v1", "v2", "perdue"]);

  it("compte par joueur et par mois, sans identifiant, chaque partie une fois", () => {
    const lignes = revenusParJoueur(
      [
        [
          ["v1", "2026-10-05T20:00:00.000Z", 1],
          ["v1", "2026-10-05T20:00:00.000Z", 1],
          ["perdue", "2026-10-06T20:00:00.000Z", 0],
          // Victoire de sa liste absente des sessions : ses points ne se connaissent pas.
          ["absente", "2026-10-07T20:00:00.000Z", 1],
          // Le 1er novembre à Paris.
          ["v2", "2026-10-31T23:30:00.000Z", 1],
        ],
        // Une défaite dans sa liste, mais une victoire du clan : le serveur la crédite aussi.
        [["v1", "2026-10-05T20:00:00.000Z", 0]],
      ],
      victoires,
      connues,
    );
    expect(lignes).toEqual([
      { periode: "2026-10", parties: 3, victoires: 2, creditees: 1, introuvables: 1, stateres: 23 },
      { periode: "2026-11", parties: 1, victoires: 1, creditees: 1, introuvables: 0, stateres: 10 },
      { periode: "2026-10", parties: 1, victoires: 0, creditees: 1, introuvables: 0, stateres: 23 },
    ]);
  });

  it("mesure une autre période et laisse de côté ce qui en sort", () => {
    const lignes = revenusParJoueur(
      [[["v1", "2026-10-05T20:00:00.000Z", 1], ["v2", "2026-10-31T23:30:00.000Z", 1]]],
      victoires,
      connues,
      (d) => (d < "2026-10-20" ? "début" : null),
    );
    expect(lignes).toEqual([{ periode: "début", parties: 1, victoires: 1, creditees: 1, introuvables: 0, stateres: 23 }]);
  });

  it("donne les profils : tous, ceux qui ont reçu, et par nombre de parties", () => {
    const ligne = (parties: number, stateres: number) => ({ periode: "2026-10", parties, victoires: 0, creditees: 0, introuvables: 0, stateres });
    const profils = profilsDeJoueurs([ligne(1, 0), ligne(5, 100), ligne(12, 300), ligne(40, 900)], [10, 30]);
    expect(profils.map((p) => [p.nom, p.resume?.nombre ?? 0, p.resume?.mediane ?? null])).toEqual([
      ["a joué au moins une partie", 4, 200],
      ["a reçu des statères au moins une fois", 3, 300],
      ["au moins 10 parties", 2, 600],
      ["au moins 30 parties", 1, 900],
    ]);
    expect(profilsDeJoueurs([], [10])[1]?.resume).toBeNull();
  });
});
