import { describe, expect, it } from "vitest";
import { clanJournal, filterJournal, isFiltered, JOURNAL_DAYS, journalChoices, journalCount, journalUnread, NO_FILTER, replayUrl, type JournalRow, type JournalSources } from "../../src/lib/journal";
import type { StoredGame, StoredSession } from "../../src/lib/schemas";

const session = (gameId: string, gameStart: string, over: Partial<StoredSession> = {}): StoredSession => ({
  gameId,
  clanPlayerCount: 3,
  hasWon: false,
  numTeams: 2,
  playerTeams: "2",
  totalPlayerCount: 20,
  gameStart,
  score: 0,
  ...over,
});
const game = (id: string, clans: StoredGame["clans"], over: Partial<StoredGame> = {}): StoredGame => ({ id, map: "Africa", seconds: 600, win: 0, clans, ...over });
const COVERED = "2026-11-07T15:00:00.000Z";
const sources = (over: Partial<JournalSources> = {}): JournalSources => ({ sessions: [], games: [], coveredUntil: COVERED, tag: "GAL", officialTags: ["GAL", "UN", "ITA", "SIS"], ...over });
const AT = "2026-11-05T10:00:00.000Z";

describe("clanJournal", () => {
  it("va de la plus récente à la plus ancienne", () => {
    const { rows } = clanJournal(sources({ sessions: [session("a", AT), session("b", "2026-11-07T10:00:00.000Z"), session("c", "2026-11-06T10:00:00.000Z")] }));
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
  it("garde les jours de Paris de la fenêtre, le premier jour entier", () => {
    // 30 jours en comptant le 7 novembre : du 9 octobre au 7 novembre. À Paris, le 9 octobre commence à 22 h UTC le 8.
    expect(JOURNAL_DAYS).toBe(30);
    const { rows } = clanJournal(sources({ sessions: [session("avant", "2026-10-08T21:59:00.000Z"), session("premier", "2026-10-08T22:01:00.000Z")] }));
    expect(rows.map((r) => r.id)).toEqual(["premier"]);
  });
  it("sans date de couverture, n'écrit rien", () => {
    expect(clanJournal(sources({ sessions: [session("a", AT)], coveredUntil: null }))).toEqual({ rows: [], sides: false, coverage: { total: 0, read: 0 } });
  });
  it("reprend les chiffres de la session et le détail de la partie", () => {
    const { rows } = clanJournal(
      sources({
        sessions: [session("a", AT, { hasWon: true, clanPlayerCount: 5, totalPlayerCount: 24, playerTeams: "Quads" })],
        games: [game("a", [["GAL", 5, 0]], { map: "Asia", seconds: 812 })],
      }),
    );
    expect(rows[0]).toEqual({ id: "a", at: AT, won: true, format: "Quads", gaulois: 5, players: 24, map: "Asia", seconds: 812, allies: [], rivals: [] });
  });
  it("laisse la carte vide tant que le détail n'est pas lu, et le compte", () => {
    const { rows, coverage } = clanJournal(sources({ sessions: [session("a", AT), session("b", AT)], games: [game("b", [["GAL", 3, 0]])] }));
    expect(rows.find((r) => r.id === "a")).toMatchObject({ map: null, seconds: null, allies: [], rivals: [] });
    expect(coverage).toEqual({ total: 2, read: 1 });
  });
  it("sépare les clans de l'équipe du clan et ceux des autres équipes", () => {
    const { rows, sides } = clanJournal(
      sources({
        sessions: [session("a", AT)],
        games: [
          game("a", [
            ["GAL", 2, 1],
            ["UN", 4, 0],
            ["SIS", 2, 1],
            ["ITA", 3, 2],
          ]),
        ],
      }),
    );
    expect(sides).toBe(true);
    expect(rows[0]?.allies).toEqual([["SIS", 2]]);
    expect(rows[0]?.rivals).toEqual([
      ["UN", 4],
      ["ITA", 3],
    ]);
  });
  it("ne cite jamais un tag hors de la liste officielle : il peut être une injure ou un prénom", () => {
    const { rows } = clanJournal(
      sources({
        sessions: [session("a", AT)],
        games: [
          game("a", [
            ["GAL", 2, 1],
            ["HH88", 3, 0],
            ["KERIM", 2, 1],
            ["UN", 4, 0],
          ]),
        ],
      }),
    );
    expect(rows[0]?.rivals).toEqual([["UN", 4]]);
    expect(rows[0]?.allies).toEqual([]);
    expect(JSON.stringify(rows)).not.toContain("HH88");
    expect(JSON.stringify(rows)).not.toContain("KERIM");
  });
  it("sans liste officielle, ne cite aucun clan", () => {
    const { rows } = clanJournal(sources({ officialTags: [], sessions: [session("a", AT)], games: [game("a", [["GAL", 2, 1], ["UN", 4, 0]])] }));
    expect(rows[0]).toMatchObject({ allies: [], rivals: [] });
  });
  it("ne dit rien des clans si le clan n'a pas d'équipe établie", () => {
    const first = clanJournal(sources({ sessions: [session("a", AT)], games: [game("a", [], { win: null })] }));
    expect(first.rows[0]).toMatchObject({ map: "Africa", allies: [], rivals: [] });
    const other = clanJournal(sources({ sessions: [session("b", AT)], games: [game("b", [["UN", 4, 0]])] }));
    expect(other.rows[0]).toMatchObject({ allies: [], rivals: [] });
  });
  it("comme les face-à-face, ne dit plus qui jouait contre qui quand le calcul ne concorde plus", () => {
    const list = Array.from({ length: 100 }, (_, i) => `g${i}`);
    const { rows, sides } = clanJournal(
      sources({
        sessions: list.map((id) => session(id, AT)),
        games: list.map((id, i) =>
          i < 10
            ? game(id, [], { win: null })
            : game(id, [
                ["GAL", 3, 0],
                ["UN", 3, 1],
              ]),
        ),
      }),
    );
    expect(sides).toBe(false);
    expect(rows.every((r) => r.rivals.length === 0 && r.allies.length === 0)).toBe(true);
    expect(rows.filter((r) => r.map !== null)).toHaveLength(100);
  });
  it("n'écrit ni joueur ni identifiant autre que celui de la partie", () => {
    const { rows } = clanJournal(sources({ sessions: [session("a", AT)], games: [game("a", [["GAL", 2, 1]])] }));
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["allies", "at", "format", "gaulois", "id", "map", "players", "rivals", "seconds", "won"]);
  });
});

const row = (over: Partial<JournalRow>): JournalRow => ({ id: "x", at: AT, won: false, format: "2", gaulois: 2, players: 10, map: "Asia", seconds: 60, allies: [], rivals: [], ...over });

describe("filterJournal", () => {
  const rows = [
    row({ id: "a", won: true, format: "Quads", map: "Asia", rivals: [["UN", 3]] }),
    row({ id: "b", won: false, format: "2", map: "Africa", rivals: [["ITA", 2]], allies: [["UN", 2]] }),
    row({ id: "c", won: true, format: "2", map: null }),
  ];
  const ids = (out: JournalRow[]) => out.map((r) => r.id);
  it("sans filtre, garde tout", () => {
    expect(ids(filterJournal(rows, NO_FILTER))).toEqual(["a", "b", "c"]);
  });
  it("filtre le résultat", () => {
    expect(ids(filterJournal(rows, { ...NO_FILTER, result: "won" }))).toEqual(["a", "c"]);
    expect(ids(filterJournal(rows, { ...NO_FILTER, result: "lost" }))).toEqual(["b"]);
  });
  it("filtre le format et la carte", () => {
    expect(ids(filterJournal(rows, { ...NO_FILTER, format: "2" }))).toEqual(["b", "c"]);
    expect(ids(filterJournal(rows, { ...NO_FILTER, map: "Africa" }))).toEqual(["b"]);
  });
  it("ne garde que les parties contre ce clan, pas celles à ses côtés", () => {
    expect(ids(filterJournal(rows, { ...NO_FILTER, rival: "UN" }))).toEqual(["a"]);
  });
  it("cumule les filtres", () => {
    expect(ids(filterJournal(rows, { ...NO_FILTER, result: "won", format: "2" }))).toEqual(["c"]);
  });
});

describe("isFiltered", () => {
  it("regarde les valeurs : revenir à « tous » retire le filtre", () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER })).toBe(false);
    expect(isFiltered({ ...NO_FILTER, result: "won" })).toBe(true);
    expect(isFiltered({ ...NO_FILTER, format: "2" })).toBe(true);
    expect(isFiltered({ ...NO_FILTER, map: "Asia" })).toBe(true);
    expect(isFiltered({ ...NO_FILTER, rival: "UN" })).toBe(true);
  });
});

describe("journalChoices", () => {
  it("range les formats, sans doublon, les nombres dans l'ordre", () => {
    const out = journalChoices([row({ format: "10" }), row({ format: "Trios" }), row({ format: "2" }), row({ format: "Duos" }), row({ format: "2" }), row({ format: null })]);
    expect(out.formats).toEqual(["2", "10", "Duos", "Trios"]);
  });
  it("liste les cartes lues", () => {
    expect(journalChoices([row({ map: "Asia" }), row({ map: null }), row({ map: "Asia" })]).maps).toEqual(["Asia"]);
  });
  it("liste les clans rencontrés par ordre alphabétique, sans ceux seulement à nos côtés", () => {
    const out = journalChoices([
      row({
        rivals: [
          ["UN", 2],
          ["ITA", 2],
        ],
      }),
      row({ rivals: [["UN", 3]], allies: [["FR", 2]] }),
      row({ rivals: [["AST", 2]] }),
    ]);
    expect(out.rivals).toEqual(["AST", "ITA", "UN"]);
  });
});

describe("journalCount", () => {
  const list = [row({ won: true }), row({ won: false }), row({ won: false }), row({ won: true })];
  it("sans filtre, donne le taux", () => {
    expect(journalCount(list, NO_FILTER).replace(/[  ]/g, " ")).toBe("4 parties, 2 victoires, soit 50,0 %.");
  });
  it("avec un filtre, n'écrit jamais de taux", () => {
    for (const filter of [{ format: "2" }, { map: "Asia" }, { rival: "UN" }]) {
      const text = journalCount(list, { ...NO_FILTER, ...filter });
      expect(text).toBe("4 parties, 2 victoires.");
      expect(text).not.toContain("%");
    }
  });
  it("sur un filtre de résultat, ne répète pas un décompte évident", () => {
    expect(journalCount(list, { ...NO_FILTER, result: "won" })).toBe("4 parties.");
    expect(journalCount(list, { ...NO_FILTER, result: "lost", rival: "UN" })).toBe("4 parties.");
  });
  it("accorde au singulier, et sans partie n'écrit aucun taux", () => {
    expect(journalCount([row({ won: true })], { ...NO_FILTER, format: "2" })).toBe("1 partie, 1 victoire.");
    expect(journalCount([], { ...NO_FILTER, format: "2" })).toBe("0 partie, 0 victoire.");
    expect(journalCount([], NO_FILTER)).toContain("—");
  });
});

describe("journalUnread", () => {
  it("prévient que les filtres Carte et Clan ne voient que les parties lues", () => {
    expect(journalUnread({ total: 2537, read: 2000 }, { ...NO_FILTER, map: "Asia" })?.replace(/[  ]/g, " ")).toBe("Ce filtre ne voit que les parties dont le détail est lu : 2 000 sur 2 537.");
    expect(journalUnread({ total: 10, read: 9 }, { ...NO_FILTER, rival: "UN" })).not.toBeNull();
  });
  it("ne dit rien pour les autres filtres, ni quand tout est lu", () => {
    expect(journalUnread({ total: 10, read: 9 }, NO_FILTER)).toBeNull();
    expect(journalUnread({ total: 10, read: 9 }, { ...NO_FILTER, format: "2", result: "won" })).toBeNull();
    expect(journalUnread({ total: 10, read: 10 }, { ...NO_FILTER, map: "Asia" })).toBeNull();
  });
});

describe("replayUrl", () => {
  it("mène à la page de la partie sur OpenFront", () => {
    expect(replayUrl("dm1nv5gDus")).toBe("https://openfront.io/game/dm1nv5gDus");
  });
  it("échappe un identifiant inattendu", () => {
    expect(replayUrl("a/b c")).toBe("https://openfront.io/game/a%2Fb%20c");
  });
});
