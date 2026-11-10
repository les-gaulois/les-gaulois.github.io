import { describe, expect, it } from "vitest";
import { fmtCount, fmtMinutes } from "../../src/lib/format";
import { digestGame, FACE_OFF_MAX_ROWS, faceOffs, placeClans } from "../../src/lib/games";
import { mapLabel } from "../../src/lib/map-names";
import { ApiGame, type StoredGame, type StoredSession } from "../../src/lib/schemas";

const covered = "2026-11-07T10:00:00.000Z";
const old = "2026-01-01T10:00:00.000Z";

function session(over: Partial<StoredSession> & { gameId: string }): StoredSession {
  return { clanPlayerCount: 2, hasWon: true, numTeams: 2, playerTeams: "2", totalPlayerCount: 20, gameStart: "2026-11-01T10:00:00.000Z", score: 1, ...over };
}
function stored(over: Partial<StoredGame> & { id: string }): StoredGame {
  return { map: "World", seconds: 600, win: 0, clans: [], ...over };
}

/** Une réponse de l'API : un tag par joueur, et les indices des joueurs listés comme vainqueurs. */
function apiGame(tags: (string | null)[], team: string, winners: number[], over: { noStats?: number[]; kind?: string; teams?: (string | undefined)[] } = {}) {
  return ApiGame.parse({
    info: {
      config: { gameMap: "World" },
      duration: 600.4,
      winner: [over.kind ?? "team", team, ...winners.map((i) => `c${i}`)],
      players: tags.map((clanTag, i) => ({
        clientID: `c${i}`,
        clanTag,
        team: over.teams?.[i],
        username: "NomSecret",
        publicID: "IdSecret",
        persistentID: "IdPersistant",
        ...(over.noStats?.includes(i) ? {} : { stats: { gold: [1] } }),
      })),
    },
  });
}

describe("placeClans", () => {
  it("place le plus gros clan d'abord, chaque clan dans l'équipe la moins remplie", () => {
    const placed = placeClans(["B", "A", "A", "A", "B", "C", null, null], 2);
    expect(Object.fromEntries(placed)).toEqual({ A: 0, B: 1, C: 1 });
  });
  it("à taille égale, le premier clan arrivé passe d'abord", () => {
    expect(Object.fromEntries(placeClans(["B", "A", "C"], 3))).toEqual({ B: 0, A: 1, C: 2 });
  });
  it("garde le même choix quand un clan ne rentre pas dans une équipe", () => {
    // Le jeu donne 3 places par équipe ici : 3 joueurs de A restent dehors, et l'équipe de A reste la plus remplie.
    expect(Object.fromEntries(placeClans(["A", "A", "A", "A", "A", "A", "B", "B", "C"], 3))).toEqual({ A: 0, B: 1, C: 2 });
  });
  it("ne place personne s'il n'y a pas au moins 2 équipes", () => {
    expect(placeClans(["A"], 0).size).toBe(0);
    expect(placeClans(["A"], 1).size).toBe(0);
  });
});

describe("digestGame", () => {
  it("garde la carte, la durée arrondie et l'équipe du clan et des clans d'au moins 2 joueurs", () => {
    const game = apiGame(["GAL", "GAL", "UN", "UN", "UN", "SOLO"], "Blue", [0, 1, 5]);
    expect(digestGame(game, session({ gameId: "g" }), "GAL")).toEqual({
      id: "g",
      map: "World",
      seconds: 600,
      win: 1,
      clans: [
        ["GAL", 2, 1],
        ["UN", 3, 0],
      ],
    });
  });
  it("n'écrit ni pseudo ni identifiant de joueur", () => {
    const raw = JSON.stringify(digestGame(apiGame(["GAL", "GAL", "UN", "UN"], "Red", [0, 1]), session({ gameId: "g" }), "GAL"));
    for (const absent of ["NomSecret", "IdSecret", "IdPersistant", "c0"]) expect(raw).not.toContain(absent);
  });
  it("sait qu'un clan absent de la liste des vainqueurs peut être dans l'équipe gagnante", () => {
    // Bleu réunit UN et FR. FR a quitté la partie avant la fin : il n'est pas listé, il n'a pas perdu contre UN.
    const game = apiGame(["GAL", "GAL", "GAL", "UN", "UN", "FR", "FR"], "Blue", [3, 4]);
    const out = digestGame(game, session({ gameId: "g", hasWon: false }), "GAL");
    expect(out.win).toBe(1);
    expect(out.clans).toEqual([
      ["GAL", 3, 0],
      ["UN", 2, 1],
      ["FR", 2, 1],
    ]);
  });
  it("garde dans l'équipe un joueur du clan parti avant la fin", () => {
    const out = digestGame(apiGame(["GAL", "GAL", "GAL", "UN", "UN"], "Red", [0, 1]), session({ gameId: "g" }), "GAL");
    expect(out.win).toBe(0);
    expect(out.clans[0]).toEqual(["GAL", 3, 0]);
  });
  it("ne compte pas parmi les joueurs du clan ceux sans stats, mais les garde pour former les équipes", () => {
    const game = apiGame(["GAL", "GAL", "UN", "UN", "UN", "FR", "FR"], "Red", [2, 3], { noStats: [4, 5] });
    const out = digestGame(game, session({ gameId: "g", hasWon: false }), "GAL");
    expect(out.clans).toEqual([
      ["GAL", 2, 1],
      ["UN", 2, 0],
    ]);
  });
  it("lit les noms d'équipes à partir de 8 équipes", () => {
    const out = digestGame(apiGame(["GAL", "GAL", "UN"], "Team 1", [0, 1]), session({ gameId: "g", numTeams: 8 }), "GAL");
    expect(out.win).toBe(0);
  });
  it("compte les équipes d'un format par taille sur tous les joueurs, comme le jeu, pas sur ceux avec stats", () => {
    // 24 joueurs en Trios : le jeu fait 8 équipes, nommées « Team N ». La session, sur 20 joueurs avec stats, en annonce 7.
    const tags = ["GAL", "GAL", "GAL", ...new Array<null>(21).fill(null)];
    const out = digestGame(apiGame(tags, "Team 1", [0, 1, 2]), session({ gameId: "g", playerTeams: "Trios", numTeams: 7 }), "GAL");
    expect(out.win).toBe(0);
  });
  it("garde au moins 2 équipes dans un format par taille", () => {
    const out = digestGame(apiGame(["GAL", "GAL"], "Red", [0, 1]), session({ gameId: "g", playerTeams: "Quads", numTeams: 1 }), "GAL");
    expect(out.win).toBe(0);
  });
  it("préfère l'équipe écrite par le jeu au calcul, quand la fiche la donne", () => {
    // Le calcul mettrait GAL en rouge. La fiche dit bleu : elle a raison.
    const game = apiGame(["GAL", "GAL", "UN", "UN"], "Blue", [0, 1], { teams: ["Blue", "Blue", "Red", "Red"] });
    const out = digestGame(game, session({ gameId: "g" }), "GAL");
    expect(out.win).toBe(1);
    expect(out.clans).toEqual([
      ["GAL", 2, 1],
      ["UN", 2, 0],
    ]);
  });
  it("écarte une partie où la fiche coupe un clan en deux, quel que soit l'ordre des joueurs", () => {
    for (const teams of [
      ["Red", "Blue", "Red", "Red"],
      ["Blue", "Red", "Red", "Red"],
    ]) {
      const out = digestGame(apiGame(["GAL", "GAL", "UN", "UN"], "Red", [0, 1], { teams }), session({ gameId: "g" }), "GAL");
      expect(out).toMatchObject({ win: null, clans: [] });
    }
  });
  it("garde le calcul pour un clan sans équipe écrite ou avec un nom d'équipe inconnu", () => {
    const game = apiGame(["GAL", "GAL", "UN", "UN"], "Red", [0, 1], { teams: ["Inconnue", undefined, undefined, undefined] });
    const out = digestGame(game, session({ gameId: "g" }), "GAL");
    expect(out.win).toBe(0);
    expect(out.clans).toEqual([
      ["GAL", 2, 0],
      ["UN", 2, 1],
    ]);
  });
  it.each([
    ["un clan vainqueur placé dans une autre équipe", apiGame(["GAL", "GAL", "UN", "UN"], "Blue", [0, 1]), true, 2],
    ["un résultat qui contredit la session", apiGame(["GAL", "GAL", "UN", "UN"], "Red", []), false, 2],
    ["un nom d'équipe inconnu", apiGame(["GAL", "GAL", "UN", "UN"], "Team 1", [0, 1]), true, 2],
    ["un vainqueur qui n'est pas une équipe", apiGame(["GAL", "GAL", "UN", "UN"], "Red", [0, 1], { kind: "nation" }), true, 2],
    ["moins de 2 équipes", apiGame(["GAL", "GAL", "UN", "UN"], "Red", [0, 1]), true, 1],
  ])("ne dit pas qui jouait contre qui en cas de doute : %s", (_label, game, hasWon, numTeams) => {
    const out = digestGame(game, session({ gameId: "g", hasWon, numTeams }), "GAL");
    expect(out).toEqual({ id: "g", map: "World", seconds: 600, win: null, clans: [] });
  });
  it("ne dit rien non plus sur une partie sans vainqueur", () => {
    const game = ApiGame.parse({ info: { config: { gameMap: "World" }, duration: 10, players: [{ clientID: "a", clanTag: "GAL", stats: {} }] } });
    expect(digestGame(game, session({ gameId: "g", hasWon: false }), "GAL").win).toBeNull();
  });
});

describe("faceOffs", () => {
  const face = (id: string, win: number | null, clans: StoredGame["clans"], over: Partial<StoredSession> = {}) => ({
    session: session({ gameId: id, ...over }),
    game: stored({ id, win, clans }),
  });
  const duel: StoredGame["clans"] = [
    ["GAL", 3, 0],
    ["UN", 2, 1],
  ];
  const run = (rows: ReturnType<typeof face>[], official = ["GAL", "UN", "FR"]) =>
    faceOffs(
      rows.map((r) => r.session),
      rows.map((r) => r.game),
      "GAL",
      official,
      covered,
      1,
    );

  it("sépare nos victoires, les leurs et celles d'une troisième équipe", () => {
    const out = run([face("a", 0, duel), face("b", 0, duel), face("c", 1, duel), face("d", 2, duel)]);
    expect(out?.rows).toEqual([{ tag: "UN", meetings: 4, ours: 2, theirs: 1, others: 1, share: expect.closeTo(66.67, 1), allTime: { meetings: 4, ours: 2, theirs: 1, others: 1 } }]);
  });
  it("ne compte pas un clan dans la même équipe que nous", () => {
    expect(
      run([
        face("a", 0, [
          ["GAL", 3, 0],
          ["UN", 2, 0],
        ]),
      ])?.rows,
    ).toEqual([]);
  });
  it("demande au moins 2 joueurs de chaque côté", () => {
    expect(
      run([
        face("a", 0, [
          ["GAL", 1, 0],
          ["UN", 3, 1],
        ]),
        face("b", 0, [
          ["GAL", 3, 0],
          ["UN", 1, 1],
        ]),
      ])?.rows,
    ).toEqual([]);
  });
  it("n'affiche que les clans de la liste officielle", () => {
    expect(
      run([
        face("a", 0, [
          ["GAL", 3, 0],
          ["XYZ", 3, 1],
        ]),
      ])?.rows,
    ).toEqual([]);
  });
  it("laisse la part vide si aucun des deux n'a gagné, sans inventer de zéro", () => {
    expect(run([face("a", 2, duel)])?.rows[0]).toMatchObject({ others: 1, share: null });
  });
  it("trie par nombre de rencontres, écarte les rares et limite la liste", () => {
    const tags = Array.from({ length: FACE_OFF_MAX_ROWS + 3 }, (_, i) => `T${i}`);
    const rows = tags.flatMap((tag, i) =>
      Array.from({ length: i + 1 }, (_, n) =>
        face(`${tag}-${n}`, 0, [
          ["GAL", 3, 0],
          [tag, 2, 1],
        ]),
      ),
    );
    const out = faceOffs(
      rows.map((r) => r.session),
      rows.map((r) => r.game),
      "GAL",
      tags,
      covered,
      4,
    );
    expect(out?.rows).toHaveLength(FACE_OFF_MAX_ROWS);
    expect(out?.rows[0]).toMatchObject({ tag: "T14", meetings: 15 });
    expect(out?.rows.at(-1)).toMatchObject({ tag: "T3", meetings: 4 });
  });
  it("ne compte pas les parties écartées, et les annonce", () => {
    const out = run([face("a", 0, duel), face("b", null, [])]);
    expect(out?.rows[0]?.meetings).toBe(1);
    expect(out).toMatchObject({ considered: 2, doubtful: 1 });
  });
  it("ne compte comme écartées que les parties du clan à 2 joueurs ou plus", () => {
    const out = run([face("a", 0, [["GAL", 3, 0]]), face("b", null, [], { clanPlayerCount: 1 })]);
    expect(out).toMatchObject({ considered: 1, doubtful: 0, reliable: true });
  });

  describe("contrôle de la méthode", () => {
    const fine = (count: number, gameStart = "2026-11-01T10:00:00.000Z") => Array.from({ length: count }, (_, i) => face(`ok${gameStart}${i}`, 0, duel, { gameStart }));
    const doubts = (count: number, gameStart = "2026-11-05T10:00:00.000Z") => Array.from({ length: count }, (_, i) => face(`x${i}`, null, [], { gameStart }));

    it("ne juge pas sur trop peu de parties", () => {
      expect(run([...fine(4), ...doubts(5)])?.reliable).toBe(true);
    });
    it("suspend les chiffres au-delà de 5 % de parties écartées, pas à 5 %", () => {
      expect(run([...fine(190), ...doubts(10)])).toMatchObject({ checked: 200, checkedDoubtful: 10, reliable: true });
      expect(run([...fine(189), ...doubts(11)])).toMatchObject({ checked: 200, checkedDoubtful: 11, reliable: false });
    });
    it("réagit aux parties les plus récentes, même si la période est longue et saine", () => {
      const out = run([...fine(2000), ...doubts(11)]);
      expect(out).toMatchObject({ considered: 2011, doubtful: 11, checked: 200, checkedDoubtful: 11, reliable: false });
    });
    it("oublie un ancien problème une fois sorti des parties les plus récentes", () => {
      const out = run([...doubts(50, "2026-10-01T10:00:00.000Z"), ...fine(200)]);
      expect(out).toMatchObject({ doubtful: 50, checkedDoubtful: 0, reliable: true });
    });
  });

  it("ne donne le total depuis le début qu'une fois l'archive lue", () => {
    const recent = face("a", 0, duel);
    const past = face("b", 1, duel, { gameStart: old });
    expect(run([recent, past])?.rows[0]).toMatchObject({ meetings: 1, allTime: { meetings: 2, ours: 1, theirs: 1 } });
    const unread = Array.from({ length: 21 }, (_, i) => session({ gameId: `c${i}`, gameStart: old }));
    const out = faceOffs([recent.session, ...unread], [recent.game], "GAL", ["UN"], covered, 1);
    expect(out?.rows[0]?.allTime).toBeNull();
    expect(out?.reading).toBe(true);
  });
  it("tolère quelques parties pas encore lues : elles ne changent plus rien", () => {
    const recent = face("a", 0, duel);
    const unread = (count: number) => Array.from({ length: count }, (_, i) => session({ gameId: `u${i}`, gameStart: old }));
    const few = faceOffs([recent.session, ...unread(20)], [recent.game], "GAL", ["UN"], covered, 1);
    expect(few?.reading).toBe(false);
    expect(few?.rows[0]?.allTime).toEqual({ meetings: 1, ours: 1, theirs: 0, others: 0 });
    expect(faceOffs([recent.session, ...unread(21)], [recent.game], "GAL", ["UN"], covered, 1)?.reading).toBe(true);
  });
  it("dit combien de parties sont lues, sur la période et depuis le début", () => {
    const read = [face("a", 0, duel), face("b", 1, duel)];
    const sessions = [...read.map((r) => r.session), session({ gameId: "attente" }), session({ gameId: "ancienne", gameStart: old })];
    const out = faceOffs(sessions, read.map((r) => r.game), "GAL", ["UN"], covered, 1);
    expect(out?.coverage).toEqual({ total: 3, read: 2 });
    expect(out?.archive).toEqual({ total: 4, read: 2 });
  });
  it("ne renvoie rien sans date de couverture", () => {
    expect(faceOffs([], [], "GAL", ["UN"], null)).toBeNull();
  });
});

describe("affichage", () => {
  it("donne le nom français d'une carte, ou son nom d'origine s'il n'y en a pas encore", () => {
    expect(mapLabel("Four Islands")).toBe("Quatre Îles");
    expect(mapLabel("World")).toBe("Monde");
    expect(mapLabel("MilkyWay")).toBe("Voie lactée");
    expect(mapLabel("Brain Rot")).toBe("Brain Rot");
  });
  it("accorde les décomptes et écrit les durées en minutes", () => {
    expect(fmtCount(0, "partie")).toBe("0 partie");
    expect(fmtCount(1, "partie")).toBe("1 partie");
    expect(fmtCount(2, "partie")).toBe("2 parties");
    expect(fmtMinutes(1117)).toBe("19 min");
  });
});
