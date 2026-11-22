import { describe, expect, it } from "vitest";
import { SALLES_DU_DUEL, gainDuGagnant, partDeLaCagnotte, type MatchDeSalle } from "../../src/lib/village/contrat-salles";
import {
  coupsDeMonCote, ecartDHorloge, ecranDesSalles, issueEnMots, lireLesSalles, luiDe, mainEnListe, potDeLaSalle, saCarteALaManche, stateresEnMots, tempsDeLaManche,
} from "../../src/lib/village/ecran-salles";

const NB = String.fromCharCode(160);
const MAIN = { arme: "gourdin", tete: "bonnet", haut: "tunique", pieds: "bottes", bas: "braies" };
const LIEU = { lieu: null, compagnon: null, passifs: [] };

function match(o: Partial<MatchDeSalle> = {}): MatchDeSalle {
  return {
    match: 12, mise: 100, essai: false, moi: "b", adversaire: { nom: "Gaulois 3", tenue: {} as never, banniere: null, familier: null }, banniere: null,
    mains: { a: { ...MAIN, arme: "epee" }, b: MAIN }, options: { a: LIEU, b: LIEU }, coups: [[0, 3], [2, 1]], manche: 3, vies: { a: 20, b: 14 },
    pose: null, adverse_pose: true, ouverte_le: "2026-11-22T15:00:04.000Z", limite: "2026-11-22T15:00:34.000Z", fini: false, verdict: null, fin: null,
    gain: null, cagnotte: null, commence_le: "2026-11-22T14:59:00.000Z", fini_le: null, ...o,
  };
}
const etat = (o: Record<string, unknown> = {}) => ({
  ok: true, ouvert: true, maintenant: "2026-11-22T15:00:10.000Z",
  salles: SALLES_DU_DUEL.map((mise) => ({ mise, attente: mise === 100, permise: mise <= 250 })),
  regles: { secondes: 30, revelation: 4, part_cagnotte: 10, par_jour: 10, meme_adversaire: 3 },
  jour: { jour: "2026-11-22", joues: 2, au_plus: 10 }, cagnotte: { saison: "saison-1", nom: "Saison 1", montant: 340 },
  attente: null, match: null, dernier: null, ...o,
});

describe("la lecture de l'état des salles", () => {
  it("lit une réponse du serveur, ses salles, son match et son dernier match", () => {
    const e = lireLesSalles(etat({ match: match(), dernier: match({ match: 9, fini: true, verdict: 1, fin: "combat", gain: 180, cagnotte: 20 }) }))!;
    expect(e.salles).toHaveLength(6);
    expect(e.salles[2]).toEqual({ mise: 100, attente: true, permise: true });
    expect(e.match).toMatchObject({ match: 12, moi: "b", coups: [[0, 3], [2, 1]], adverse_pose: true });
    expect(e.dernier).toMatchObject({ verdict: 1, gain: 180 });
    expect(e.cagnotte).toEqual({ saison: "saison-1", nom: "Saison 1", montant: 340 });
  });

  it("refuse une réponse qui ne se lit pas, et ignore un match mal formé", () => {
    expect(lireLesSalles(null)).toBeNull();
    expect(lireLesSalles({ ok: false, error: "duel_ferme" })).toBeNull();
    expect(lireLesSalles(etat({ salles: [] }))).toBeNull();
    expect(lireLesSalles(etat({ maintenant: "hier" }))).toBeNull();
    expect(lireLesSalles(etat({ match: { ...match(), coups: [[0, 9]] } }))!.match).toBeNull();
    expect(lireLesSalles(etat({ match: { ...match(), mise: 30 } }))!.match).toBeNull();
    expect(lireLesSalles(etat({ match: { ...match(), mains: { a: MAIN } } }))!.match).toBeNull();
  });
});

describe("l'écran à montrer", () => {
  it("montre le match d'abord, puis l'attente, puis la fin pas encore refermée, sinon le hall", () => {
    const e = lireLesSalles(etat())!;
    expect(ecranDesSalles(e, new Set())).toEqual({ kind: "hall" });
    expect(ecranDesSalles({ ...e, attente: { mise: 50, depuis: e.maintenant, main: MAIN } }, new Set())).toEqual({ kind: "attente", mise: 50 });
    const fini = match({ match: 9, fini: true, verdict: -1, fin: "temps", gain: 0 });
    expect(ecranDesSalles({ ...e, dernier: fini }, new Set()).kind).toBe("fin");
    expect(ecranDesSalles({ ...e, dernier: fini }, new Set([9])).kind).toBe("hall");
    expect(ecranDesSalles({ ...e, dernier: fini, match: match() }, new Set()).kind).toBe("match");
  });
});

describe("le temps de la manche", () => {
  const m = match();
  const ouverte = Date.parse(m.ouverte_le);

  it("se compte sur l'horloge du serveur : la révélation, les 30 secondes, puis l'échéance", () => {
    expect(tempsDeLaManche(m, ouverte - 2000, 0)).toEqual({ phase: "revelation", secondes: 30, part: 1 });
    expect(tempsDeLaManche(m, ouverte, 0)).toEqual({ phase: "pose", secondes: 30, part: 1 });
    expect(tempsDeLaManche(m, ouverte + 10_500, 0)).toMatchObject({ phase: "pose", secondes: 20 });
    expect(tempsDeLaManche(m, ouverte + 29_999, 0)).toMatchObject({ phase: "pose", secondes: 1 });
    expect(tempsDeLaManche(m, ouverte + 30_000, 0)).toEqual({ phase: "echu", secondes: 0, part: 0 });
  });

  it("corrige l'écart entre l'appareil et le serveur", () => {
    // l'appareil retarde de 5 secondes : à 15:00:05 chez lui, il est 15:00:10 au serveur
    const ecart = ecartDHorloge("2026-11-22T15:00:10.000Z", Date.parse("2026-11-22T15:00:05.000Z"));
    expect(ecart).toBe(5000);
    expect(tempsDeLaManche(m, Date.parse("2026-11-22T15:00:05.000Z"), ecart)).toMatchObject({ phase: "pose", secondes: 24 });
  });
});

describe("le match de mon côté", () => {
  it("me met à gauche, que j'aie attendu ou rejoint", () => {
    const b = match();
    expect(luiDe(b)).toBe("a");
    expect(coupsDeMonCote(b)).toEqual([[3, 0], [1, 2]]);
    expect(saCarteALaManche(b, 1)).toBe(0);
    expect(saCarteALaManche(b, 2)).toBe(2);
    expect(saCarteALaManche(b, 3)).toBeNull();
    const a = match({ moi: "a" });
    expect(coupsDeMonCote(a)).toEqual([[0, 3], [2, 1]]);
    expect(saCarteALaManche(a, 2)).toBe(1);
    expect(mainEnListe(MAIN)).toEqual(["gourdin", "bonnet", "tunique", "bottes", "braies"]);
  });
});

describe("les mots des salles", () => {
  it("disent les montants avec des espaces qui ne se coupent pas", () => {
    expect(stateresEnMots(1800)).toBe(`1${NB}800${NB}statères`);
    expect(stateresEnMots(45)).toBe(`45${NB}statères`);
    expect(stateresEnMots(1)).toBe(`1${NB}statère`);
    expect(potDeLaSalle(1000)).toEqual({ pot: 2000, gagnant: 1800, cagnotte: 200 });
    for (const mise of SALLES_DU_DUEL) expect(gainDuGagnant(mise) + partDeLaCagnotte(mise)).toBe(2 * mise);
  });

  it("disent l'issue sans signes : gagné, perdu, égalité, le temps, le départ, l'essai", () => {
    expect(issueEnMots(match({ verdict: 1, fin: "combat", gain: 180, cagnotte: 20 }))).toEqual({
      titre: "Gagné", argent: `Tu reçois 180${NB}statères.`, raison: null, cagnotte: `20${NB}statères vont à la cagnotte de la saison.`,
    });
    expect(issueEnMots(match({ verdict: -1, fin: "temps", gain: 0, cagnotte: 20 }))).toMatchObject({ titre: "Perdu", argent: `Ta mise de 100${NB}statères est perdue.`, raison: "Temps écoulé : ta carte n'était pas posée." });
    expect(issueEnMots(match({ verdict: 1, fin: "quitte", gain: 180 }))).toMatchObject({ raison: "L'autre Gaulois est parti." });
    expect(issueEnMots(match({ verdict: 0, fin: "temps", gain: 100 }))).toMatchObject({ titre: "Égalité", argent: `Ta mise de 100${NB}statères t'est rendue.`, raison: "Aucun des deux n'a posé à temps.", cagnotte: null });
    expect(issueEnMots(match({ essai: true, verdict: 1, fin: "combat" }))).toMatchObject({ argent: "Essai : rien n'était misé.", cagnotte: null });
    for (const v of [-1, 0, 1] as const)
      for (const fin of ["combat", "temps", "quitte"] as const) {
        const i = issueEnMots(match({ verdict: v, fin, gain: 100, cagnotte: 20 }));
        for (const t of [i.titre, i.argent, i.raison ?? "", i.cagnotte ?? ""]) expect(t).not.toMatch(/[<>=÷×%+]/);
      }
  });
});
