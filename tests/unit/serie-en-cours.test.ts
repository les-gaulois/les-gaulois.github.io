import { describe, expect, it } from "vitest";
import { playerPodiums } from "../../src/lib/podiums";
import type { StoredMemberResult, StoredMembers, StoredSession } from "../../src/lib/schemas";
import { datesDeLaSerie, FLAMME_DES, flammeAllumee, serieEnCours, serieEnMots } from "../../src/lib/serie-en-cours";

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
