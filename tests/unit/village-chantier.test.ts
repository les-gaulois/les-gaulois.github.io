import { describe, expect, it } from "vitest";
import {
  avancementDuBatiment,
  batimentEnCours,
  etatDuChantier,
  etatDuFeu,
  etatDuMonde,
  FENETRE_DU_FEU_MS,
  niveauDuFeu,
  pointsAffiches,
  pointsQuiRestent,
  RELEVE_DU_FEU_MAX_MS,
  type SessionDuChantier,
} from "../../src/lib/village/chantier";
import { BATIMENTS, DEBUT_DU_CHANTIER, FEU_JOURS, SEUILS_DU_FEU } from "../../src/lib/village/chantier-liste";

const DEBUT = Date.parse(DEBUT_DU_CHANTIER);
const HEURE = 3_600_000;
/** Une partie commencée `heures` après le début du chantier. */
const partie = (id: string, heures: number, score: number): SessionDuChantier => ({ gameId: id, gameStart: new Date(DEBUT + heures * HEURE).toISOString(), score });
const RELEVE = new Date(DEBUT + 14 * 24 * HEURE).toISOString();
const MAINTENANT = new Date(Date.parse(RELEVE) + HEURE);

describe("le chantier du village", () => {
  it("compte les points rapportés au clan en décimal exact : une défaite ne retire rien, une partie ne compte qu'une fois", () => {
    const sessions = [partie("a", 1, 1.1), partie("b", 2, 2.2), partie("c", 3, -4.5), partie("a", 1, 1.1), partie("d", 4, 0.07)];
    const chantier = etatDuChantier(sessions, RELEVE, [])!;
    // 1,1 + 2,2 + 0,07 en nombres à virgule donnerait 3.3700000000000006.
    expect(chantier.points).toBe(3.37);
    expect(chantier.depuis).toBe(DEBUT_DU_CHANTIER);
    expect(chantier.batiments[0]).toMatchObject({ id: "palissade", poses: 3.37, fini_le: null });
    expect(chantier.en_cours).toBe("palissade");
  });

  it("ne compte que les parties commencées depuis le début du chantier et jusqu'au relevé", () => {
    const sessions = [partie("avant", -0.01, 50), partie("pile", 0, 1), partie("apres-releve", 14 * 24 + 0.5, 50), partie("pendant", 10, 2)];
    expect(etatDuChantier(sessions, RELEVE, [])?.points).toBe(3);
  });

  it("remplit les bâtiments dans l'ordre ; fini le jour de la partie qui fait passer le seuil, le seuil atteint juste compris", () => {
    const sessions = [partie("p1", 1, 60), partie("p2", 2, 40), partie("p3", 3, 149.99), partie("p4", 4, 0.01), partie("p5", 5, 30.5)];
    const chantier = etatDuChantier(sessions, RELEVE, [])!;
    const [palissade, puits, four, potager] = chantier.batiments;
    expect(palissade).toMatchObject({ poses: 100, fini_le: sessions[1]!.gameStart });
    expect(puits).toMatchObject({ poses: 150, fini_le: sessions[3]!.gameStart });
    expect(four).toMatchObject({ poses: 30.5, fini_le: null });
    expect(potager).toMatchObject({ poses: 0, fini_le: null });
    expect(chantier.en_cours).toBe("four");
    expect(batimentEnCours(chantier)?.id).toBe("four");
    expect(chantier.points).toBe(280.5);
  });

  it("range les parties par début, quel que soit l'ordre des fichiers", () => {
    const sessions = [partie("z", 0.5, 10), partie("y", 3, 95.5), partie("x", 2, 50), partie("w", 30, 120)];
    const chantier = etatDuChantier(sessions, RELEVE, [])!;
    // 10, puis 50 (deux heures), puis 95,5 (trois heures) : le seuil de 100 tombe sur la partie de trois heures.
    expect(chantier.batiments[0]?.fini_le).toBe(sessions[1]!.gameStart);
    expect(etatDuChantier([...sessions].reverse(), RELEVE, [])).toEqual(chantier);
  });

  it("une partie lue deux fois ne compte qu'une fois, la première lue", () => {
    const chantier = etatDuChantier([partie("x", 1, 99), partie("x", 2, 99)], RELEVE, [])!;
    expect(chantier.points).toBe(99);
    expect(chantier.batiments[0]?.fini_le).toBeNull();
  });

  it("tout bâti : plus de bâtiment en cours", () => {
    const total = BATIMENTS.reduce((s, b) => s + b.cout, 0);
    const chantier = etatDuChantier([partie("tout", 1, total + 5)], RELEVE, [])!;
    expect(chantier.batiments.every((b) => b.fini_le !== null && b.poses === b.cout)).toBe(true);
    expect(chantier.en_cours).toBeNull();
    expect(batimentEnCours(chantier)).toBeNull();
    expect(chantier.points).toBe(total + 5);
  });

  it("« pas de données » n'est pas zéro : sans relevé, avant le début ou avec un mois illisible dans la période, pas de chantier", () => {
    const sessions = [partie("a", 1, 10)];
    expect(etatDuChantier(sessions, null, [])).toBeNull();
    expect(etatDuChantier(sessions, "pas une date", [])).toBeNull();
    expect(etatDuChantier(sessions, new Date(DEBUT - HEURE).toISOString(), [])).toBeNull();
    // Le début du chantier, minuit à Paris, est encore le 31 octobre en temps universel : le fichier d'octobre compte.
    expect(etatDuChantier(sessions, RELEVE, ["2026-10"])).toBeNull();
    expect(etatDuChantier(sessions, RELEVE, ["2026-11"])).toBeNull();
    expect(etatDuChantier(sessions, RELEVE, ["2026-09"])?.points).toBe(10);
  });

  it("aucune partie depuis le début : zéro posé, c'est une donnée", () => {
    const chantier = etatDuChantier([], RELEVE, [])!;
    expect(chantier.points).toBe(0);
    expect(chantier.batiments.every((b) => b.poses === 0 && b.fini_le === null)).toBe(true);
    expect(chantier.en_cours).toBe(BATIMENTS[0]!.id);
  });

  it("garde la liste et les coûts du chantier", () => {
    const chantier = etatDuChantier([], RELEVE, [])!;
    expect(chantier.batiments.map(({ id, nom, titre, cout }) => ({ id, nom, titre, cout }))).toEqual(BATIMENTS);
  });
});

describe("le grand feu", () => {
  it("prend son niveau aux seuils écrits, le seuil atteint compris", () => {
    expect(niveauDuFeu(0)).toBe(0);
    expect(niveauDuFeu(SEUILS_DU_FEU[0] - 0.01)).toBe(0);
    expect(niveauDuFeu(SEUILS_DU_FEU[0])).toBe(1);
    expect(niveauDuFeu(SEUILS_DU_FEU[1])).toBe(2);
    expect(niveauDuFeu(SEUILS_DU_FEU[2])).toBe(3);
    expect(niveauDuFeu(SEUILS_DU_FEU[3] - 0.01)).toBe(3);
    expect(niveauDuFeu(SEUILS_DU_FEU[3])).toBe(4);
    expect(niveauDuFeu(100_000)).toBe(4);
  });

  it("compte les 7 × 24 heures qui finissent au relevé, sans saut à minuit", () => {
    const fin = Date.parse(RELEVE);
    const a = (id: string, avant: number, score: number): SessionDuChantier => ({ gameId: id, gameStart: new Date(fin - avant).toISOString(), score });
    const sessions = [a("trop-vieille", FENETRE_DU_FEU_MS + 1, 500), a("au-bord", FENETRE_DU_FEU_MS, 60), a("hier", 24 * HEURE, 41.5), a("defaite", HEURE, -30), a("apres", -1000, 900)];
    const feu = etatDuFeu(sessions, RELEVE, [], MAINTENANT)!;
    expect(feu).toEqual({ niveau: 1, points: 101.5, jours: FEU_JOURS });
    expect(FENETRE_DU_FEU_MS).toBe(7 * 24 * HEURE);
  });

  it("ne se montre pas sur un relevé de plus de 48 heures, ni sans relevé, ni avec un mois illisible dans ses 7 jours", () => {
    const sessions = [partie("a", 14 * 24 - 2, 200)];
    const fin = Date.parse(RELEVE);
    expect(etatDuFeu(sessions, RELEVE, [], new Date(fin + RELEVE_DU_FEU_MAX_MS))?.niveau).toBe(2);
    expect(etatDuFeu(sessions, RELEVE, [], new Date(fin + RELEVE_DU_FEU_MAX_MS + 1))).toBeNull();
    expect(etatDuFeu(sessions, null, [], MAINTENANT)).toBeNull();
    expect(etatDuFeu(sessions, RELEVE, ["2026-11"], MAINTENANT)).toBeNull();
    // Le relevé du 14 novembre : ses 7 jours commencent le 7 novembre, octobre ne compte pas.
    expect(etatDuFeu(sessions, RELEVE, ["2026-10"], MAINTENANT)?.points).toBe(200);
  });

  it("aucune partie sur 7 jours : des braises, à zéro point, c'est une donnée", () => {
    expect(etatDuFeu([], RELEVE, [], MAINTENANT)).toEqual({ niveau: 0, points: 0, jours: FEU_JOURS });
  });
});

describe("l'état du monde", () => {
  it("donne le relevé, le chantier et le feu ensemble", () => {
    const monde = etatDuMonde({ sessions: [partie("a", 14 * 24 - 1, 120)], releve: RELEVE, moisIllisibles: [], maintenant: MAINTENANT });
    expect(monde.releve).toBe(RELEVE);
    expect(monde.chantier?.points).toBe(120);
    expect(monde.feu).toEqual({ niveau: 1, points: 120, jours: 7 });
  });

  it("sans relevé, rien : ni chantier ni feu", () => {
    expect(etatDuMonde({ sessions: [partie("a", 1, 120)], releve: null, moisIllisibles: [], maintenant: MAINTENANT })).toEqual({ releve: null, chantier: null, feu: null });
  });

  it("des sessions trop vieilles : le chantier reste, daté, le feu disparaît", () => {
    const monde = etatDuMonde({ sessions: [partie("a", 1, 120)], releve: RELEVE, moisIllisibles: [], maintenant: new Date(Date.parse(RELEVE) + 3 * 24 * HEURE) });
    expect(monde.releve).toBe(RELEVE);
    expect(monde.chantier?.points).toBe(120);
    expect(monde.feu).toBeNull();
  });

  it("se publie en JSON sans rien perdre", () => {
    const monde = etatDuMonde({ sessions: [partie("a", 1, 120.37)], releve: RELEVE, moisIllisibles: [], maintenant: MAINTENANT });
    expect(JSON.parse(JSON.stringify(monde))).toEqual(monde);
  });
});

describe("l'arrondi pour l'affichage", () => {
  it("des points rapportés s'écrivent arrondis vers le bas : jamais plus que rapporté", () => {
    expect(pointsAffiches(1063.91)).toBe(1063);
    expect(pointsAffiches(474.99)).toBe(474);
    expect(pointsAffiches(0)).toBe(0);
  });

  it("« encore N points » arrondi vers le haut, jamais 0 avant la fin ; posés et restants écrits font le coût", () => {
    const b = { cout: 450, fini_le: null };
    expect(pointsQuiRestent({ ...b, poses: 13.91 })).toBe(437);
    expect(pointsQuiRestent({ ...b, poses: 449.99 })).toBe(1);
    expect(pointsQuiRestent({ ...b, poses: 0 })).toBe(450);
    expect(pointsQuiRestent({ cout: 450, poses: 450, fini_le: "2026-11-14T10:00:00.000Z" })).toBe(0);
    for (const poses of [0, 0.01, 13.91, 224.5, 449.99]) expect(pointsAffiches(poses) + pointsQuiRestent({ ...b, poses })).toBe(450);
  });

  it("l'avancement d'un bâtiment n'atteint 1 que fini", () => {
    expect(avancementDuBatiment({ cout: 100, poses: 50, fini_le: null })).toBe(0.5);
    expect(avancementDuBatiment({ cout: 100, poses: 99.999, fini_le: null })).toBeLessThan(1);
    expect(avancementDuBatiment({ cout: 100, poses: 100, fini_le: "2026-11-02T19:10:15.224Z" })).toBe(1);
  });
});
