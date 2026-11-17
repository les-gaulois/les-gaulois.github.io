import { describe, expect, it } from "vitest";
import { bilanALEcran, bilanDeLaPartie, bilanPublie, classementGeneral, lireBilan, rangsDesScores, scoresDuBilan, statsDuJoueur, type GauloisDuBilan } from "../../src/lib/rejeu/bilan";
import { indexVide, nomDuBilan, noterFilm, partiesARefilmer } from "../../src/lib/rejeu/films-index";

const PARTIE = "abc12345";
const joueurs = [
  { n: 1, client: "g1", equipe: "Red", type: "HUMAN" },
  { n: 2, client: "g2", equipe: "Red", type: "HUMAN" },
  { n: 3, client: "g3", equipe: "Red", type: "HUMAN" },
  { n: 4, client: "e4", equipe: "Red", type: "HUMAN" },
  { n: 5, client: "a5", equipe: "Blue", type: "HUMAN" },
];
const meta = (faits?: unknown) => JSON.stringify({ format: 1, partie: PARTIE, commit: "a".repeat(40), largeur: 10, hauteur: 10, tours: 1000, toursFiche: 1000, empreintes: 5, joueurs, ...(faits === undefined ? {} : { faits }) });
// La fiche du jeu, telle qu'il l'écrit : des nombres en texte. `gold` : travail, guerre, commerce, prises, trains (2), dons reçus.
const stats = new Map<string, unknown>([
  ["g1", { gold: ["100", "900", "200", "50", "30", "20", "7000"], attacks: ["5000", "10", "0", "9"], units: { city: ["3", "2", "1", "0"], port: ["1", "0", "1"] }, conquests: ["1", "0", "4"] }],
  ["g2", { gold: ["300"], attacks: ["1000"], units: { city: ["2"] }, conquests: [] }],
  ["g3", {}],
  ["g9", null],
  ["a5", { gold: ["999999"], attacks: ["999999"], units: { city: ["0", "99"] } }],
]);
const partie = { partie: PARTIE, clients: new Set(["g1", "g2", "g3"]), noms: new Map([["g1", "Judom FR"], ["g2", "[GAL]"], ["a5", "[UN]"]]), pseudos: new Map([["g1", "Autre nom"], ["g2", "[GAL] Chilimou FR"], ["a5", "Adversaire"]]), stats };
const gaulois = (g: Partial<GauloisDuBilan>): GauloisDuBilan => ({ nom: null, enPartie: false, or: 0, attaque: 0, prises: 0, eliminations: 0, troupesDonnees: 0, orDonne: 0, ...g });

describe("le bilan des Gaulois d'une partie", () => {
  it("lit de la fiche l'or produit, les troupes à l'attaque, les prises et les éliminations ; rien d'un texte étrange", () => {
    expect(statsDuJoueur(stats.get("g1"))).toEqual({ or: 350, attaque: 500, prises: 4, eliminations: 5 });
    expect(statsDuJoueur(null)).toEqual({ or: 0, attaque: 0, prises: 0, eliminations: 0 });
    expect(statsDuJoueur({ gold: ["-5", "x", "12.6", "1e9"], attacks: "9", units: [1, 2], conquests: { a: 1 } })).toEqual({ or: 0, attaque: 0, prises: 0, eliminations: 0 });
  });
  it("ne garde que les joueurs au tag du clan, nommés comme dans le journal, avec leurs dons du rejeu", () => {
    // Dons : 1 donne 12 345 dixièmes de troupes à 2, puis 500 d'or à 4 (un coéquipier) ; 5, un adversaire, donne à 1 ; un don après la fin.
    const b = bilanDeLaPartie(meta([[10, 0, 1, 2, 12_345], [20, 1, 1, 4, 500], [30, 1, 5, 1, 999], [40, 2, 1, 5, 10], [2000, 0, 2, 1, 50]]), partie)!;
    expect(b).toEqual({
      format: 1,
      partie: PARTIE,
      gaulois: [
        { nom: "Judom FR", enPartie: false, or: 350, attaque: 500, prises: 4, eliminations: 5, troupesDonnees: 1234, orDonne: 500 },
        { nom: "Chilimou FR", enPartie: true, or: 300, attaque: 100, prises: 0, eliminations: 0, troupesDonnees: 0, orDonne: 0 },
        { nom: null, enPartie: false, or: 0, attaque: 0, prises: 0, eliminations: 0, troupesDonnees: 0, orDonne: 0 },
      ],
    });
    expect(JSON.stringify(b)).not.toMatch(/"g1"|"g2"|Autre nom|Adversaire|999999/);
    expect(lireBilan(JSON.stringify(b), PARTIE)).toEqual(b);
    expect(bilanALEcran(JSON.parse(JSON.stringify(b)), PARTIE)!.gaulois).toEqual(b.gaulois);
  });
  it("n'existe pas sans les faits du rejeu, ni sans Gaulois ; refuse ce qui ne convient pas", () => {
    expect(bilanDeLaPartie(meta(), partie)).toBeNull();
    expect(bilanDeLaPartie(meta([]), { ...partie, clients: new Set(["absent"]) })).toBeNull();
    // Un Gaulois sans stats dans la fiche n'y est pas : pas de données, ce n'est pas zéro.
    expect(bilanDeLaPartie(meta([]), { ...partie, stats: new Map([["g1", stats.get("g1")], ["g2", null]]) })!.gaulois.map((g) => g.nom)).toEqual(["Judom FR"]);
    expect(bilanDeLaPartie(meta([]), { ...partie, stats: new Map() })).toBeNull();
    expect(() => bilanDeLaPartie(meta([]), { ...partie, partie: "autre" })).toThrow("autre partie");
    expect(() => bilanDeLaPartie("{", partie)).toThrow("illisible");
    expect(() => bilanDeLaPartie(meta([[10, 0, 1, 2, -5]]), partie)).toThrow("faits au mauvais format");
    const b = bilanDeLaPartie(meta([]), partie)!;
    expect(() => lireBilan(JSON.stringify(b), "autre")).toThrow("autre partie");
    expect(() => lireBilan(JSON.stringify({ ...b, gaulois: [{ ...b.gaulois[0], client: "g1" }] }), PARTIE)).toThrow("mauvais format");
    expect(() => lireBilan(JSON.stringify({ ...b, gaulois: [{ ...b.gaulois[0], nom: null, enPartie: true }] }), PARTIE)).toThrow("mauvais format");
    expect(bilanALEcran({ ...b, gaulois: [{ ...b.gaulois[0], or: -1 }] }, PARTIE)).toBeNull();
    expect(bilanALEcran({ ...b, gaulois: [{ ...b.gaulois[0], nom: null, enPartie: true }] }, PARTIE)).toBeNull();
    expect(bilanALEcran(b, "autre")).toBeNull();
  });
  it("perd à la publication un pseudo public qui n'est plus sur la liste, pas un pseudo de partie ni les nombres", () => {
    const b = bilanDeLaPartie(meta([]), partie)!;
    expect(bilanPublie(b, () => false).gaulois.map((g) => g.nom)).toEqual([null, "Chilimou FR", null]);
    expect(bilanPublie(b, () => false).gaulois[0]!.or).toBe(350);
    expect(bilanPublie(b, () => true)).toEqual(b);
  });
});

describe("le score d'utilité", () => {
  it("est la part de chacun dans le total des Gaulois, axe par axe, et 100 pour la part moyenne", () => {
    const s = scoresDuBilan([gaulois({ or: 300, attaque: 100, prises: 1, troupesDonnees: 50 }), gaulois({ or: 100, attaque: 300, prises: 3, orDonne: 10 })]);
    expect(s[0]!.parts).toEqual({ economie: 0.75, combat: 0.25, soutien: 0.5 });
    expect(s[1]!.parts).toEqual({ economie: 0.25, combat: 0.75, soutien: 0.5 });
    // Chacun a la moitié de l'effort : 100, la part moyenne.
    expect(s.map((x) => x.utilite)).toEqual([100, 100]);
    expect(s[0]!.titres).toEqual(["economie"]);
    expect(s[1]!.titres).toEqual(["combat"]);
  });
  it("fait toujours 100 en moyenne, quel que soit le nombre de Gaulois", () => {
    const quatre = [gaulois({ or: 700, attaque: 10 }), gaulois({ or: 100, attaque: 20 }), gaulois({ or: 100, attaque: 30 }), gaulois({ or: 100, attaque: 40 })];
    const s = scoresDuBilan(quatre);
    expect(s.reduce((t, x) => t + x.utilite!, 0)).toBe(400);
    expect(s[0]!.utilite).toBe(160);
  });
  it("ne compte pas un axe où il n'y a rien à partager, et ne donne ni utilité à un Gaulois seul ni titre à égalité", () => {
    const s = scoresDuBilan([gaulois({ or: 50 }), gaulois({ or: 50 })]);
    expect(s[0]!.parts).toEqual({ economie: 0.5, combat: null, soutien: null });
    expect(s[0]!.utilite).toBe(100);
    expect(s[0]!.titres).toEqual([]);
    expect(scoresDuBilan([gaulois({ or: 50 })])[0]!.utilite).toBeNull();
    expect(scoresDuBilan([gaulois({}), gaulois({})])[0]!.utilite).toBeNull();
    // À utilité égale, le même rang ; sans utilité, pas de rang.
    expect(rangsDesScores(scoresDuBilan([gaulois({ or: 50 }), gaulois({ or: 50 }), gaulois({ or: 10 })]))).toEqual([1, 1, 3]);
    expect(rangsDesScores(scoresDuBilan([gaulois({ or: 50 })]))).toEqual([null]);
  });
});

describe("le classement général", () => {
  const bilan = (k: number, lignes: GauloisDuBilan[]) => ({ partie: `p${k}`, gaulois: lignes });
  const bilans = Array.from({ length: 5 }, (_, k) => bilan(k, [gaulois({ nom: "Fort", or: 300 }), gaulois({ nom: "Faible", or: 100 }), gaulois({ nom: "Passant", enPartie: true, or: 100 })]));
  it("fait la moyenne de l'utilité des membres au pseudo public qui ont assez de parties", () => {
    expect(classementGeneral(bilans)).toEqual([
      { nom: "Fort", parties: 5, utilite: 180, axes: { economie: 180, combat: null, soutien: null }, titres: { economie: 5, combat: 0, soutien: 0 } },
      { nom: "Faible", parties: 5, utilite: 60, axes: { economie: 60, combat: null, soutien: null }, titres: { economie: 0, combat: 0, soutien: 0 } },
    ]);
  });
  it("laisse de côté un pseudo de partie, un joueur sans nom, trop peu de parties et un pseudo écrit deux fois", () => {
    expect(classementGeneral(bilans.slice(0, 4))).toEqual([]);
    expect(classementGeneral(bilans, 5).map((l) => l.nom)).not.toContain("Passant");
    const double = Array.from({ length: 5 }, (_, k) => bilan(k, [gaulois({ nom: "Double", or: 300 }), gaulois({ nom: "Double", or: 100 }), gaulois({ or: 100 })]));
    expect(classementGeneral(double)).toEqual([]);
    // Un pseudo public porté par plusieurs membres ne désigne personne, d'une partie à l'autre non plus.
    expect(classementGeneral(bilans, 5, (nom) => nom !== "Fort").map((l) => l.nom)).toEqual(["Faible"]);
  });
});

describe("les parties à refaire pour leur bilan", () => {
  it("un journal gardé sans bilan se refait, une fois", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const s = [{ gameId: "avec", gameStart: "2026-11-16T11:00:00Z" }];
    const fait = noterFilm(indexVide(), "avec", "2026-11-16T11:00:00Z", 1000, "a".repeat(40), true);
    expect(fait.films[0]).toMatchObject({ pseudos: 2, bilan: true });
    expect(partiesARefilmer(s, fait, now)).toEqual([]);
    const avant = { ...fait, films: [{ partie: "avec", debut: "2026-11-16T11:00:00Z", octets: 1000, journal: true, pseudos: 2 as const }] };
    expect(partiesARefilmer(s, avant, now).map((p) => p.gameId)).toEqual(["avec"]);
    expect(nomDuBilan("abc")).toBe("abc.bilan.json");
    expect(nomDuBilan("../x")).toBeNull();
  });
});
