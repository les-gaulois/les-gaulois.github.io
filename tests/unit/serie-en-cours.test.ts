import { describe, expect, it } from "vitest";
import { playerPodiums } from "../../src/lib/podiums";
import type { StoredMemberResult, StoredMembers, StoredSession } from "../../src/lib/schemas";
import { compagnonsDeFlamme, datesDeLaSerie, partiesDeLaSerie, phraseDesCompagnons, datesDuRecord, FLAMME_DES, nommesParPartie, flammeAllumee, recordPersonnel, serieEnCours, serieEnMots } from "../../src/lib/serie-en-cours";

const LU = "2026-11-15T09:00:00.000Z";
const COUVERT = "2026-11-15T08:00:00.000Z";
const heure = (n: number) => new Date(Date.UTC(2026, 10, 10, 12) + n * 3_600_000).toISOString();

/** Une partie : son numéro, son heure (en heures après le 10 novembre à midi), gagnée ou perdue. */
type Ligne = [number, number, 0 | 1];
const resultat = (lignes: Ligne[], older: string | null = null): StoredMemberResult => ({
  seen: lignes.length,
  readAt: LU,
  older,
  // Comme dans le fichier : des plus récentes aux plus anciennes.
  games: lignes.map(([id, h, won]): [string, string, 0 | 1] => [`g${id}`, heure(h), won]).reverse(),
});
/** Les sessions du clan : une par partie, à plusieurs joueurs, sauf celles qu'on dit seul ou absentes. */
const sessions = (lignes: Ligne[], { seul = [] as number[], sans = [] as number[] } = {}) =>
  new Map(lignes.filter(([id]) => !sans.includes(id)).map(([id]) => [`g${id}`, { totalPlayerCount: seul.includes(id) ? 1 : 40 }]));

describe("la série en cours", () => {
  it("compte les victoires depuis la dernière défaite, la plus récente en dernier", () => {
    const lignes: Ligne[] = [[1, 0, 1], [2, 1, 0], [3, 2, 1], [4, 3, 1], [5, 4, 1], [6, 5, 1], [7, 6, 1]];
    expect(serieEnCours(resultat(lignes), sessions(lignes), COUVERT)).toEqual({ victoires: 5, auMoins: false, depuis: heure(2), jusqua: heure(6), releve: LU });
  });

  it("s'éteint à la première défaite", () => {
    const lignes: Ligne[] = [[1, 0, 1], [2, 1, 1], [3, 2, 1], [4, 3, 1], [5, 4, 1], [6, 5, 0]];
    expect(serieEnCours(resultat(lignes), sessions(lignes), COUVERT)).toEqual({ victoires: 0, auMoins: false, depuis: null, jusqua: null, releve: LU });
  });

  it("une défaite sans session du clan coupe quand même ; une victoire sans session ni seul contre des robots ne compte pas et ne coupe rien", () => {
    const lignes: Ligne[] = [[1, 0, 1], [2, 1, 0], [3, 2, 1], [4, 3, 1], [5, 4, 1]];
    expect(serieEnCours(resultat(lignes), sessions(lignes, { sans: [2] }), COUVERT)?.victoires).toBe(3);
    expect(serieEnCours(resultat(lignes), sessions(lignes, { sans: [4] }), COUVERT)).toMatchObject({ victoires: 2, depuis: heure(2) });
    expect(serieEnCours(resultat(lignes), sessions(lignes, { seul: [3] }), COUVERT)).toMatchObject({ victoires: 2, depuis: heure(3) });
  });

  it("une victoire plus récente que les sessions relevées attend : le chiffre devient un minimum", () => {
    const couvert = heure(3);
    const lignes: Ligne[] = [[1, 0, 0], [2, 1, 1], [3, 2, 1], [4, 3, 1], [5, 4, 1]];
    expect(serieEnCours(resultat(lignes), sessions(lignes), couvert)).toMatchObject({ victoires: 3, auMoins: true });
    // Une défaite plus récente que les sessions coupe quand même : elle n'a pas besoin de session.
    const perdue: Ligne[] = [...lignes, [6, 5, 0]];
    expect(serieEnCours(resultat(perdue), sessions(perdue), couvert)).toMatchObject({ victoires: 0, auMoins: false });
  });

  it("sans défaite lue, un historique pas lu jusqu'au bout donne un minimum ; lu jusqu'au bout, le chiffre exact", () => {
    const lignes: Ligne[] = [[1, 0, 1], [2, 1, 1], [3, 2, 1], [4, 3, 1], [5, 4, 1], [6, 5, 1]];
    expect(serieEnCours(resultat(lignes, "curseur"), sessions(lignes), COUVERT)).toMatchObject({ victoires: 6, auMoins: true });
    expect(serieEnCours(resultat(lignes, null), sessions(lignes), COUVERT)).toMatchObject({ victoires: 6, auMoins: false });
    // Une défaite lue suffit : ce qui est plus ancien ne compte plus.
    const avecDefaite: Ligne[] = [[0, -1, 0], ...lignes];
    expect(serieEnCours(resultat(avecDefaite, "curseur"), sessions(avecDefaite), COUVERT)).toMatchObject({ victoires: 6, auMoins: false });
  });

  it("ne compte qu'une fois une partie lue deux fois, et range les parties par leur heure", () => {
    const lignes: Ligne[] = [[1, 0, 0], [2, 1, 1], [3, 2, 1]];
    const doublee = resultat(lignes);
    doublee.games.push(doublee.games[0]!);
    expect(serieEnCours(doublee, sessions(lignes), COUVERT)?.victoires).toBe(2);
    const melangee = resultat(lignes);
    melangee.games.reverse();
    expect(serieEnCours(melangee, sessions(lignes), COUVERT)?.victoires).toBe(2);
  });

  it("à jour avec la liste officielle : datée de la liste ; des parties pas encore lues : pas de série, donc pas de flamme", () => {
    const lignes: Ligne[] = [[1, 0, 0], [2, 1, 1], [3, 2, 1], [4, 3, 1], [5, 4, 1], [6, 5, 1]];
    const liste = "2026-11-15T09:53:00.000Z";
    expect(serieEnCours(resultat(lignes), sessions(lignes), COUVERT, { parties: lignes.length, le: liste })).toMatchObject({ victoires: 5, releve: liste });
    // La liste compte une partie de plus que celles lues : elle peut être une défaite, la série n'est pas connue.
    expect(serieEnCours(resultat(lignes), sessions(lignes), COUVERT, { parties: lignes.length + 1, le: liste })).toBeNull();
  });

  it("sans ses parties lues ou sans sessions relevées : pas de données, jamais une série de zéro", () => {
    expect(serieEnCours(undefined, new Map(), COUVERT)).toBeNull();
    expect(serieEnCours(resultat([[1, 0, 1]]), sessions([[1, 0, 1]]), null)).toBeNull();
    expect(serieEnCours(resultat([]), new Map(), COUVERT)).toEqual({ victoires: 0, auMoins: false, depuis: null, jusqua: null, releve: LU });
  });

  it("allume la flamme à 5 victoires d'affilée, et le dit en mots", () => {
    expect(FLAMME_DES).toBe(5);
    const serie = (victoires: number, auMoins = false) => ({ victoires, auMoins, depuis: heure(0), jusqua: heure(5), releve: LU });
    expect(flammeAllumee(null)).toBe(false);
    expect(flammeAllumee(serie(4))).toBe(false);
    expect(flammeAllumee(serie(5))).toBe(true);
    expect(serieEnMots(serie(7))).toBe("7 victoires d'affilée");
    expect(serieEnMots(serie(7, true))).toBe("au moins 7 victoires d'affilée");
    expect(serieEnMots(serie(1234)).replace(/\s/g, " ")).toBe("1 234 victoires d'affilée");
  });

  it("date toujours la série par ses victoires, jours de Paris, pour qu'une vieille série ne se lise pas comme d'aujourd'hui", () => {
    const s = (depuis: string, jusqua: string) => ({ victoires: 7, auMoins: false, depuis, jusqua, releve: LU });
    expect(datesDeLaSerie(s("2026-09-18T19:00:00.000Z", "2026-09-21T20:00:00.000Z"))).toBe("du 18 au 21 sept. 2026");
    expect(datesDeLaSerie(s("2026-11-02T10:00:00.000Z", "2026-11-02T21:00:00.000Z"))).toBe("le 2 nov. 2026");
    // 23 h 30 à Paris le 31 octobre, en heure d'hiver : déjà le 1er novembre en UTC+1, pas avant.
    expect(datesDeLaSerie(s("2026-10-31T22:30:00.000Z", "2026-11-03T12:00:00.000Z"))).toBe("du 31 oct. au 3 nov. 2026");
    expect(datesDeLaSerie({ victoires: 0, auMoins: false, depuis: null, jusqua: null, releve: LU })).toBe("");
  });

  it("prend l'heure la plus récente entre la liste officielle et la lecture de ses parties", () => {
    const lignes: Ligne[] = [[1, 0, 1]];
    expect(serieEnCours(resultat(lignes), sessions(lignes), COUVERT, { parties: 1, le: "2026-11-15T08:00:00.000Z" })?.releve).toBe(LU);
    expect(serieEnCours(resultat(lignes), sessions(lignes), COUVERT, { parties: 1, le: "2026-11-15T10:00:00.000Z" })?.releve).toBe("2026-11-15T10:00:00.000Z");
  });

  it("ne dépasse jamais la plus longue série du même membre aux podiums, qui suivent les mêmes règles", () => {
    const lignes: Ligne[] = [[1, 0, 1], [2, 1, 1], [3, 2, 0], [4, 3, 1], [5, 4, 1], [6, 5, 1], [7, 6, 1], [8, 7, 1], [9, 8, 1]];
    const resultats = { joueur: resultat(lignes, null) };
    const index = sessions(lignes, { sans: [5] });
    const liste: StoredSession[] = lignes.filter(([id]) => id !== 5).map(([id, h, won]) => ({ gameId: `g${id}`, clanPlayerCount: 3, hasWon: won === 1, numTeams: 2, playerTeams: null, totalPlayerCount: 40, gameStart: heure(h), score: 1 }));
    const membres = { members: [{ publicId: "joueur", username: "Brennos", team: { wins: 8, losses: 1 } }] } as unknown as StoredMembers;
    const longue = playerPodiums(resultats, liste, membres, COUVERT).streaks[0]?.value ?? 0;
    const enCours = serieEnCours(resultats.joueur, index, COUVERT)?.victoires ?? 0;
    expect(enCours).toBe(5);
    expect(enCours).toBeLessThanOrEqual(longue);
    expect(longue).toBe(5);
  });
});

describe("le record personnel", () => {
  /** Des victoires (1) et des défaites (0) d'affilée, une partie par heure, à partir de l'heure 0. */
  const suite = (resultats: (0 | 1)[]): Ligne[] => resultats.map((won, i) => [i + 1, i, won]);
  const record = (lignes: Ligne[], options: Parameters<typeof sessions>[1] = {}, { couvert = COUVERT, older = null as string | null, liste = undefined as { parties: number; le: string } | undefined } = {}) => {
    const r = resultat(lignes, older);
    const idx = sessions(lignes, options);
    return recordPersonnel(r, idx, couvert, serieEnCours(r, idx, couvert, liste));
  };

  it("est sa plus longue série, avec ses dates et le jour de sa première partie lue", () => {
    const lignes = suite([0, 1, 1, 1, 0, 1, 1]);
    const r = record(lignes)!;
    expect(r).toEqual({ victoires: 3, auMoins: false, debut: heure(1), fin: heure(3), luesDepuis: heure(0), doree: false, courante: false, ancien: null });
    expect(datesDuRecord(r)).toBe("le 10 nov. 2026");
  });

  it("passe à l'or quand la série en cours bat une ancienne flamme, même de 5 tout juste, et dit l'ancien record", () => {
    expect(record(suite([1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1]))).toMatchObject({ victoires: 7, debut: heure(7), fin: heure(13), doree: true, courante: true, ancien: 6 });
    expect(record(suite([1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1]))).toMatchObject({ victoires: 6, doree: true, courante: true, ancien: 5 });
  });

  it("reste normale à égalité, contre une ancienne série sans flamme, ou pour une première série", () => {
    expect(record(suite([1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1]))).toMatchObject({ victoires: 6, fin: heure(5), doree: false, courante: false, ancien: null });
    expect(record(suite([1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1]))).toMatchObject({ victoires: 9, doree: false, courante: true, ancien: null });
    expect(record(suite([1, 1, 1, 1, 1, 1, 1]))).toMatchObject({ victoires: 7, doree: false, courante: true, ancien: null });
  });

  it("ne dore rien quand la série en cours est coupée, même si l'ancien record était une flamme", () => {
    expect(record(suite([1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0]))).toMatchObject({ victoires: 7, doree: false, courante: false });
  });

  it("ne dore rien quand le début de son historique n'est pas lu : une série plus ancienne pourrait être plus longue", () => {
    expect(record(suite([1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1]), {}, { older: "curseur" })).toMatchObject({ victoires: 7, doree: false, courante: true, auMoins: false });
  });

  it("une défaite plus récente que les sessions coupe la série en cours : le record finit sur sa dernière victoire, sans être en cours", () => {
    const lignes = suite([0, 1, 1, 1, 0]);
    expect(record(lignes, {}, { couvert: heure(3) })).toMatchObject({ victoires: 3, fin: heure(3), courante: false });
  });

  it("une victoire plus récente que les sessions attend : le record en cours devient un minimum", () => {
    const lignes = suite([0, 1, 1, 1, 1]);
    expect(record(lignes, {}, { couvert: heure(3) })).toMatchObject({ victoires: 3, fin: heure(3), courante: true, auMoins: true });
  });

  it("suit les règles des podiums : une victoire sans session ne compte pas et ne coupe rien", () => {
    const lignes = suite([1, 1, 1, 1]);
    expect(record(lignes, { sans: [2] })).toMatchObject({ victoires: 3 });
    expect(record(lignes, { seul: [1, 2, 3] })).toBeNull();
  });

  it("reste donné quand des parties récentes ne sont pas lues, comme aux podiums, mais n'est alors ni en cours ni doré", () => {
    const lignes = suite([1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1]);
    expect(record(lignes, {}, { liste: { parties: lignes.length + 1, le: LU } })).toMatchObject({ victoires: 7, courante: false, doree: false });
    expect(record(lignes, {}, { liste: { parties: lignes.length, le: LU } })).toMatchObject({ victoires: 7, courante: true, doree: true });
  });

  it("rien sous 2 victoires d'affilée ni sans données", () => {
    expect(record(suite([1, 0, 1, 0]))).toBeNull();
    expect(recordPersonnel(undefined, new Map(), COUVERT, null)).toBeNull();
    const lignes = suite([1, 1, 1]);
    expect(recordPersonnel(resultat(lignes), sessions(lignes), null, null)).toBeNull();
  });
});

describe("les compagnons de flamme", () => {
  /** Le joueur « moi » : une défaite puis six victoires, parties g1 à g7 ; ses compagnons gagnent certaines de ces parties. */
  const moi: Ligne[] = [[1, 0, 0], [2, 1, 1], [3, 2, 1], [4, 3, 1], [5, 4, 1], [6, 5, 1], [7, 6, 1]];
  const avec = (lignes: [number, 0 | 1][]): StoredMemberResult => ({ seen: lignes.length, readAt: LU, older: null, games: lignes.map(([id, won]): [string, string, 0 | 1] => [`g${id}`, heure(id - 1), won]) });
  const results = {
    moi: resultat(moi, null),
    brennos: avec([[2, 1], [3, 1], [4, 1]]),
    alix: avec([[5, 1]]),
    // Dans la partie g1, perdue par tous : avant la série, il n'en est pas.
    cotta: avec([[1, 0]]),
    // Une partie de la série qu'il aurait perdue : pas un compagnon.
    dumno: avec([[6, 0]]),
    // Un anonyme : jamais nommé, même gagnant.
    anonyme: avec([[7, 1]]),
  };
  const nommes = new Map([["moi", "Moi"], ["brennos", "Brennos"], ["alix", "Alix"], ["cotta", "Cotta"], ["dumno", "Dumno"]]);
  const clan = (n: (id: number) => number) => new Map(moi.map(([id]) => [`g${id}`, { totalPlayerCount: 40, clanPlayerCount: n(id) }]));
  const calcul = (byId: ReturnType<typeof clan>) => {
    const serie = serieEnCours(results.moi, byId, COUVERT);
    return compagnonsDeFlamme("moi", serie, results.moi, byId, COUVERT, nommesParPartie(results, nommes), nommes);
  };

  it("nomme ceux qui ont gagné une partie de la série avec lui, du plus présent au moins présent", () => {
    // Juste assez de Gaulois dans chaque partie pour lui et ceux nommés : personne d'autre.
    const juste = clan((id) => (id <= 4 ? 2 : id === 5 ? 2 : 1));
    expect(calcul(juste)).toEqual({ noms: [{ id: "brennos", username: "Brennos" }, { id: "alix", username: "Alix" }], autres: false });
  });

  it("dit « d'autres Gaulois » quand une partie comptait plus de Gaulois du clan que ceux nommés : un anonyme n'est jamais nommé", () => {
    const c = calcul(clan((id) => (id === 7 ? 2 : id <= 4 ? 2 : id === 5 ? 2 : 1)))!;
    expect(c.noms.map((n) => n.id)).toEqual(["brennos", "alix"]);
    expect(c.autres).toBe(true);
    expect(c.noms.some((n) => n.id === "anonyme" || n.id === "dumno" || n.id === "cotta")).toBe(false);
  });

  it("ne compte pas parmi « d'autres Gaulois » un membre nommé qui a perdu la partie selon OpenFront", () => {
    // g6 : lui, et Dumno qui l'a perdue (parti avant la fin) ; personne d'autre.
    const c = calcul(clan((id) => (id <= 4 ? 2 : id === 5 ? 2 : id === 6 ? 2 : 1)))!;
    expect(c.noms.map((n) => n.id)).toEqual(["brennos", "alix"]);
    expect(c.autres).toBe(false);
    // Un Gaulois de plus dans g6 : quelqu'un d'autre était là.
    expect(calcul(clan((id) => (id <= 4 ? 2 : id === 5 ? 2 : id === 6 ? 3 : 1)))!.autres).toBe(true);
  });

  it("ne retient que les parties de la série : ni avant la dernière défaite, ni sans session, ni seul, ni après les sessions relevées", () => {
    // Lui : g10 gagnée avec Brennos avant la défaite g11, puis g12 à g19 gagnées. g13 sans session, g14 seul contre des robots,
    // g18 après les sessions relevées : aucune ne compte, Brennos les a pourtant gagnées avec lui.
    const lignes: Ligne[] = [[10, 0, 1], [11, 1, 0], [12, 2, 1], [13, 3, 1], [14, 4, 1], [15, 5, 1], [16, 6, 1], [17, 7, 1], [19, 8, 1], [18, 9, 1]];
    const lui = resultat(lignes, null);
    const brennos: StoredMemberResult = { seen: 4, readAt: LU, older: null, games: [10, 13, 14, 18].map((id): [string, string, 0 | 1] => [`g${id}`, heure(id - 10), 1]) };
    const byId = new Map(lignes.filter(([id]) => id !== 13).map(([id]) => [`g${id}`, { totalPlayerCount: id === 14 ? 1 : 40, clanPlayerCount: 1 }]));
    const couvert = heure(8);
    const serie = serieEnCours(lui, byId, couvert)!;
    expect(serie.victoires).toBe(5);
    expect(partiesDeLaSerie(lui, byId, couvert)).toEqual(["g12", "g15", "g16", "g17", "g19"]);
    const res = { lui, brennos };
    const noms = new Map([["lui", "Lui"], ["brennos", "Brennos"]]);
    expect(compagnonsDeFlamme("lui", serie, lui, byId, couvert, nommesParPartie(res, noms), noms)).toBeNull();
  });

  it("range à égalité par ordre alphabétique", () => {
    const egal = { ...results, alix: avec([[5, 1], [6, 1], [7, 1]]) };
    const byId = clan(() => 3);
    const serie = serieEnCours(egal.moi, byId, COUVERT);
    const c = compagnonsDeFlamme("moi", serie, egal.moi, byId, COUVERT, nommesParPartie(egal, nommes), nommes)!;
    expect(c.noms.map((n) => n.username)).toEqual(["Alix", "Brennos"]);
  });

  it("rien sans flamme, ou quand personne du clan n'était avec lui", () => {
    const byId = clan(() => 1);
    const seul = { moi: results.moi };
    expect(compagnonsDeFlamme("moi", serieEnCours(seul.moi, byId, COUVERT), seul.moi, byId, COUVERT, nommesParPartie(seul, nommes), nommes)).toBeNull();
    const courte = resultat(moi.slice(0, 4), null);
    expect(compagnonsDeFlamme("moi", serieEnCours(courte, byId, COUVERT), courte, byId, COUVERT, nommesParPartie(results, nommes), nommes)).toBeNull();
  });
});

describe("la phrase des compagnons", () => {
  const n = (...noms: string[]) => noms.map((username) => ({ id: username.toLowerCase(), username }));
  const texte = (noms: { id: string; username: string }[], autres: boolean) => {
    const p = phraseDesCompagnons({ noms, autres });
    return p ? p.intro + p.noms.map((x) => x.avant + x.username).join("") + p.fin : null;
  };

  it("dit les sept cas de la conception, sans virgule avant « et », sans point final", () => {
    expect(texte(n("Alba"), false)).toBe("Série gagnée avec : Alba");
    expect(texte(n("Alba", "Brennos"), false)).toBe("Série gagnée avec : Alba et Brennos");
    expect(texte(n("Alba", "Brennos", "Катя"), false)).toBe("Série gagnée avec : Alba, Brennos et Катя");
    expect(texte(n("Alba"), true)).toBe("Série gagnée avec : Alba et d'autres Gaulois");
    expect(texte(n("Alba", "Brennos", "Катя"), true)).toBe("Série gagnée avec : Alba, Brennos, Катя et d'autres Gaulois");
    expect(texte([], true)).toBe("Série gagnée avec d'autres Gaulois");
    expect(texte([], false)).toBeNull();
    expect(phraseDesCompagnons(null)).toBeNull();
  });

  it("nomme cinq Gaulois au plus, le reste dans « d'autres Gaulois », sans nombre", () => {
    const six = n("A", "B", "C", "D", "E", "F");
    expect(texte(six, false)).toBe("Série gagnée avec : A, B, C, D, E et d'autres Gaulois");
    expect(texte(six.slice(0, 5), false)).toBe("Série gagnée avec : A, B, C, D et E");
    expect(phraseDesCompagnons({ noms: six, autres: false })!.noms.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
