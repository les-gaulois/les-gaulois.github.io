import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { casesDuStatere } from "../../supabase/functions/code-discord/statere";
import { CARD_COLORS, GazetteFonts, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import { ApiClient } from "../../src/lib/pipeline";
import { ApiVictoryGame, type StoredGame, type StoredMembers, type StoredSession } from "../../src/lib/schemas";
import { crewName, FORGET_MS, isClanMember, isVictory, MAX_PER_PASS, MAX_RESEND, mergeStates, parseResend, passSessions, PAUSE_MS, readRecentSessions, readVictoryGame, rivalsOf, usableOfficialTags, toVerify, victoryOf, victoryPass, VictoryState, WINDOW_MS, type Victory, type VictoryPassDeps } from "../../src/lib/victoires";
import { frenchList, gameLength, rivalsWords, sendVictory, victoryContent, victoryPayload } from "../../src/lib/victoires-discord";
import { CHIP_GAP, CHIP_STEPS, chipLayout } from "../../src/lib/salon-image";
import { coinRects, creditAddresses, MAP_NOTE, NAME_NOTE, openAround, readThumbnail, renderVictoryCard, SEA, staterWords, STATERES_SUR_LES_VICTOIRES, thumbnailUrl, tileLength, victoryCard, victoryImageAlt } from "../../src/lib/victoires-image";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

const session = (gameId: string, gameStart: string, over: Partial<StoredSession> = {}): StoredSession => ({
  gameId,
  clanPlayerCount: 6,
  hasWon: true,
  numTeams: 4,
  playerTeams: "4",
  totalPlayerCount: 23,
  gameStart,
  score: 1.81,
  ...over,
});

/** Des membres inventés : trois avec pseudo, un sans. */
const MEMBERS: StoredMembers = {
  fetchedAt: "2026-11-11T13:54:00.000Z",
  total: 4,
  members: [
    { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: "id-zoe", username: "Zoé", team: { wins: 10, losses: 2 } },
    { role: "officer", joinedAt: "2026-05-03T20:17:40.935Z", publicId: "id-alpha", username: "alpha", team: { wins: 3, losses: 1 } },
    { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: "id-marc", username: "Marc", team: null },
    { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: null, username: null, team: { wins: 1, losses: 0 } },
  ],
};

/** Un détail de partie comme l'API le donne, avec ce que le schéma ne doit pas garder. Noms inventés. */
const rawGame = () => ({
  info: {
    gameID: "dVEWLLQHx1",
    config: { gameMap: "Four Islands", gameMode: "Team" },
    duration: 943.4,
    winner: ["team", "Red", "c1"],
    players: [
      // Un membre avec pseudo, sous un autre nom dans la partie : ce nom-là, relié à sa fiche.
      { clientID: "c1", clanTag: "GAL", publicID: "id-zoe", username: "Zoé en jeu", stats: { attacks: [1] }, persistentID: null },
      { clientID: "c2", clanTag: "GAL", publicID: "id-alpha", username: "  [GAL]   alpha ", stats: {} },
      // Un membre sans pseudo public, vérifié sur sa fiche d'OpenFront : nommé comme dans la partie, sans fiche du site.
      { clientID: "c3", clanTag: "GAL", publicID: "id-anonyme", username: "Caché", stats: {} },
      // Un porteur du tag sans compte : impossible à vérifier, seulement compté.
      { clientID: "c4", clanTag: "GAL", publicID: null, username: "Sans compte", stats: {} },
      // Un membre vérifié sans nom lisible : seulement compté.
      { clientID: "c7", clanTag: "GAL", publicID: "id-vide", username: "   ", stats: {} },
      // Un Gaulois jamais apparu sur la carte : pas de stats, pas cité.
      { clientID: "c5", clanTag: "GAL", publicID: "id-marc", username: "Marc" },
      // Un joueur d'un autre clan.
      { clientID: "c9", clanTag: "UN", publicID: "id-autre", username: "Autre", stats: {} },
    ],
  },
});
const GAME = ApiVictoryGame.parse(rawGame());
/** Les porteurs du tag hors de la liste relue que leur fiche d'OpenFront donne membres. */
const CONFIRMED = new Set(["id-anonyme", "id-vide"]);
const VICTORY = victoryOf(session("dVEWLLQHx1", "2026-11-11T17:04:58.000Z"), GAME, MEMBERS, "GAL", CONFIRMED);

describe("victoryOf", () => {
  it("cite tous les membres de la partie sous leur nom en partie, par ordre alphabétique, avec la fiche de ceux qui en ont une", () => {
    expect(VICTORY).toEqual({
      id: "dVEWLLQHx1",
      start: "2026-11-11T17:04:58.000Z",
      map: "Four Islands",
      seconds: 943,
      format: "4",
      gaulois: 6,
      players: 23,
      points: 1.81,
      crew: [
        { name: "alpha", id: "id-alpha" },
        { name: "Caché", id: null },
        { name: "Zoé en jeu", id: "id-zoe" },
      ],
      unnamed: 1,
      outsiders: 1,
      rivals: [],
    });
  });
  it("ne nomme jamais un porteur du tag que rien ne donne membre du clan", () => {
    const v = victoryOf(session("x", "2026-11-11T17:00:00.000Z"), GAME, MEMBERS, "GAL");
    expect(v.crew.map((p) => p.name)).toEqual(["alpha", "Zoé en jeu"]);
    expect([v.unnamed, v.outsiders]).toEqual([0, 3]);
  });
  it("demande une vérification pour chaque porteur du tag avec des stats que la liste ne reconnaît pas, une fois chacun", () => {
    expect(toVerify(GAME, MEMBERS, "GAL")).toEqual(["id-anonyme", "id-vide"]);
    expect(toVerify(GAME, null, "GAL")).toEqual(["id-zoe", "id-alpha", "id-anonyme", "id-vide"]);
  });
  it("ne garde d'un joueur que son identifiant de partie, son tag, son nom, son identifiant, son équipe et le fait d'avoir des stats", () => {
    expect(Object.keys(GAME.info.players[0]!)).toEqual(["clientID", "clanTag", "username", "publicID", "team", "hasStats"]);
    expect(JSON.stringify(GAME)).not.toMatch(/attacks|persistentID|gameMode|gameID/);
  });
  it("sans nom lisible dans la partie, prend le pseudo du membre ; un même compte n'a qu'une fiche", () => {
    const game = ApiVictoryGame.parse({
      info: {
        config: { gameMap: "World" },
        duration: 60,
        players: [
          { clanTag: "GAL", publicID: "id-zoe", username: "", stats: {} },
          { clanTag: "GAL", publicID: "id-alpha", username: "A", stats: {} },
          { clanTag: "GAL", publicID: "id-alpha", username: "B", stats: {} },
        ],
      },
    });
    expect(victoryOf(session("x", "2026-11-11T17:00:00.000Z"), game, MEMBERS, "GAL").crew).toEqual([
      { name: "A", id: "id-alpha" },
      { name: "B", id: null },
      { name: "Zoé", id: "id-zoe" },
    ]);
  });
  it("sans liste des membres, nomme ceux que leur fiche d'OpenFront donne membres, sans lien vers le site", () => {
    const v = victoryOf(session("x", "2026-11-11T17:00:00.000Z"), GAME, null, "GAL", new Set(["id-zoe", "id-alpha", "id-anonyme"]));
    expect(v.crew).toEqual([
      { name: "alpha", id: null },
      { name: "Caché", id: null },
      { name: "Zoé en jeu", id: null },
    ]);
    expect(v.outsiders).toBe(2);
  });
  it("nettoie un nom : sans tag devant, sur une ligne, sans caractère invisible, coupé s'il est trop long", () => {
    expect(crewName("[GAL] [FR]  Judom   FR ")).toBe("Judom FR");
    expect(crewName(`Zo${String.fromCodePoint(0x200b)}é\nX`)).toBe("Zoé X");
    expect(crewName(null)).toBe("");
    expect(crewName("W".repeat(60))).toBe(`${"W".repeat(39)}…`);
  });
  it("pas de points sans score positif : jamais un zéro de remplacement", () => {
    expect(victoryOf(session("x", "2026-11-11T17:00:00.000Z", { score: 0 }), GAME, MEMBERS, "GAL").points).toBeNull();
  });
  it("une partie seul contre des robots n'est pas une victoire à annoncer, ni une défaite", () => {
    expect(isVictory(session("a", "2026-11-11T17:00:00.000Z"))).toBe(true);
    expect(isVictory(session("b", "2026-11-11T17:00:00.000Z", { totalPlayerCount: 1 }))).toBe(false);
    expect(isVictory(session("c", "2026-11-11T17:00:00.000Z", { hasWon: false }))).toBe(false);
  });
});

describe("les clans en face", () => {
  /**
   * Une partie à 4 équipes, noms inventés : GAL gagne avec l'équipe rouge. UN, ITA et ZZZ (hors de la liste officielle) ont deux
   * joueurs chacun dans d'autres équipes ; EU deux joueurs dans l'équipe rouge ; AST deux joueurs jamais apparus ; FR un seul
   * joueur, dans une autre équipe ; NU un seul, dans l'équipe rouge.
   */
  const player = (clientID: string, clanTag: string, stats = true, team?: string) => ({ clientID, clanTag, username: clientID, publicID: null, ...(stats ? { stats: {} } : {}), ...(team ? { team } : {}) });
  const rivalGame = (winner: string[] | null = ["team", "Red", "g1"]) =>
    ApiVictoryGame.parse({
      info: {
        config: { gameMap: "World" },
        duration: 600,
        winner,
        players: [player("g1", "GAL"), player("g2", "GAL"), player("g3", "GAL"), player("u1", "UN"), player("u2", "UN"), player("i1", "ITA"), player("i2", "ITA"), player("e1", "EU", true, "Red"), player("e2", "EU", true, "Red"), player("x1", "ZZZ"), player("x2", "ZZZ"), player("a1", "AST", false), player("a2", "AST", false), player("f1", "FR"), player("n1", "NU", true, "Red")],
      },
    });
  const OFFICIAL = ["ITA", "GAL", "EU", "UN", "FR", "AST", "NU"];
  const won = session("r", "2026-11-13T18:08:00.000Z", { clanPlayerCount: 3, totalPlayerCount: 12 });

  it("écrit les clans de la liste officielle d'au moins un joueur dans une autre équipe, joueur seul compris, dans l'ordre du classement", () => {
    expect(rivalsOf(won, rivalGame(), "GAL", OFFICIAL)).toEqual(["ITA", "UN", "FR"]);
    expect(victoryOf(won, rivalGame(), MEMBERS, "GAL", new Set(), OFFICIAL).rivals).toEqual(["ITA", "UN", "FR"]);
  });
  it("jamais un tag hors de la liste officielle, un clan de la même équipe, même d'un seul joueur, ni des joueurs jamais apparus", () => {
    const rivals = rivalsOf(won, rivalGame(), "GAL", [...OFFICIAL, "ZZZ"].filter((t) => t !== "UN"));
    expect(rivals).toEqual(["ITA", "FR", "ZZZ"]);
    expect(rivalsOf(won, rivalGame(), "GAL", ["ITA"])).toEqual(["ITA"]);
    for (const absent of ["EU", "NU", "AST", "GAL"]) expect(rivalsOf(won, rivalGame(), "GAL", OFFICIAL)).not.toContain(absent);
  });
  it("rien de deviné : sans liste officielle, sans vainqueur ou si les équipes ne concordent pas, aucun clan", () => {
    expect(rivalsOf(won, rivalGame(), "GAL", [])).toEqual([]);
    expect(victoryOf(won, rivalGame(), MEMBERS, "GAL").rivals).toEqual([]);
    expect(rivalsOf(won, rivalGame(null), "GAL", OFFICIAL)).toEqual([]);
    // Un joueur d'UN parmi les vainqueurs : UN n'est pas dans l'équipe calculée, rien ne concorde.
    expect(rivalsOf(won, rivalGame(["team", "Red", "g1", "u1"]), "GAL", OFFICIAL)).toEqual([]);
    expect(rivalsOf(won, rivalGame(["team", "Blue", "u1"]), "GAL", OFFICIAL)).toEqual([]);
  });
  it("un format inattendu des vainqueurs ou des identifiants de partie ne retire que les clans en face, pas la victoire", () => {
    const raw = rawGame();
    const odd = ApiVictoryGame.parse({ ...raw, info: { ...raw.info, winner: { team: "Red" }, players: raw.info.players.map((p) => ({ ...p, clientID: 7 })) } });
    expect(odd.info.winner).toBeNull();
    expect(odd.info.players.every((p) => p.clientID === null)).toBe(true);
    const v = victoryOf(won, odd, MEMBERS, "GAL", CONFIRMED, OFFICIAL);
    expect(v.rivals).toEqual([]);
    expect(v.crew.map((p) => p.name)).toEqual(VICTORY.crew.map((p) => p.name));
  });
  it("la liste officielle ne sert que si le calcul des équipes concorde avec les résultats récents, comme dans le journal", () => {
    const at = (i: number) => new Date(Date.parse("2026-11-13T10:00:00.000Z") - i * 60_000).toISOString();
    const sessions = Array.from({ length: 60 }, (_, i) => session(`s${i}`, at(i), { clanPlayerCount: 3 }));
    const games = (win: number | null): StoredGame[] => sessions.map((s) => ({ id: s.gameId, map: "World", seconds: 600, win, clans: win === null ? [] : [["GAL", 3, 0]] }));
    expect(usableOfficialTags(sessions, games(0), "GAL", OFFICIAL, "2026-11-13T12:00:00.000Z")).toEqual(OFFICIAL);
    expect(usableOfficialTags(sessions, games(null), "GAL", OFFICIAL, "2026-11-13T12:00:00.000Z")).toEqual([]);
    expect(usableOfficialTags(sessions, games(0), "GAL", OFFICIAL, null)).toEqual([]);
  });
  it("le passage donne la liste officielle au message", async () => {
    const victories: Victory[] = [];
    await victoryPass({
      stored: { done: [] },
      sessions: [session("r", new Date(Date.now() - 3_600_000).toISOString(), { clanPlayerCount: 3, totalPlayerCount: 12 })],
      members: MEMBERS,
      tag: "GAL",
      official: OFFICIAL,
      now: new Date(),
      readGame: async () => rivalGame(),
      isMember: async () => false,
      send: async (v) => {
        victories.push(v);
        return true;
      },
      pause: async () => {},
      log: () => {},
    });
    expect(victories.map((v) => v.rivals)).toEqual([["ITA", "UN", "FR"]]);
  });
  it("le dit en mots : « contre le clan [UN] », « contre les clans [ITA] et [UN] »", () => {
    expect([rivalsWords([]), rivalsWords(["UN"]), rivalsWords(["ITA", "UN"]), rivalsWords(["ITA", "UN", "EU"])]).toEqual([null, "contre le clan [UN]", "contre les clans [ITA] et [UN]", "contre les clans [ITA], [UN] et [EU]"]);
  });
});

describe("readVictoryGame", () => {
  const ok = () => new Response(JSON.stringify(rawGame()), { status: 200 });
  it("lit le détail de la partie sur l'API publique, et le passe au schéma", async () => {
    const get = vi.fn(async () => ok());
    expect(await readVictoryGame("dVEWLLQHx1", get as unknown as typeof fetch, async () => {})).toEqual(GAME);
    expect(get).toHaveBeenCalledWith("https://api.openfront.io/public/game/dVEWLLQHx1?turns=false", expect.objectContaining({ headers: { "User-Agent": "GAL-clan-site/1.0" } }));
  });
  it("réessaie une fois une panne de l'API, jamais une partie inconnue", async () => {
    const busy = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(ok());
    expect(await readVictoryGame("a", busy as unknown as typeof fetch, async () => {})).toEqual(GAME);
    const missing = vi.fn(async () => new Response("", { status: 404 }));
    await expect(readVictoryGame("a", missing as unknown as typeof fetch, async () => {})).rejects.toThrow("HTTP 404");
    expect(missing).toHaveBeenCalledTimes(1);
    const odd = vi.fn(async () => new Response(JSON.stringify({ info: {} }), { status: 200 }));
    await expect(readVictoryGame("a", odd as unknown as typeof fetch, async () => {})).rejects.toThrow("réponse au mauvais format");
  });
});

describe("readRecentSessions", () => {
  it("lit sur l'API les sessions des six dernières heures, plus fraîches que la collecte", async () => {
    const row = { gameId: "dNEW", clanTag: "GAL", clanPlayerCount: 3, hasWon: true, numTeams: 6, playerTeams: "Trios", totalPlayerCount: 18, gameStart: "2026-11-11T20:40:00.000Z", score: 2.24 };
    const get = vi.fn(async () => new Response(JSON.stringify({ results: [row], total: 1, page: 1, limit: 50 }), { status: 200 }));
    const api = new ApiClient({ fetch: get as unknown as typeof fetch, sleep: async () => {}, delayMs: 0 });
    const sessions = await readRecentSessions(api, "GAL", new Date("2026-11-11T20:53:00.000Z"));
    expect(sessions).toEqual([{ gameId: "dNEW", clanPlayerCount: 3, hasWon: true, numTeams: 6, playerTeams: "Trios", totalPlayerCount: 18, gameStart: "2026-11-11T20:40:00.000Z", score: 2.24 }]);
    expect(get).toHaveBeenCalledWith("https://api.openfront.io/public/clan/GAL/sessions?start=2026-11-11T14:53:00.000Z&end=2026-11-11T20:53:00.000Z&limit=50&page=1", expect.anything());
  });
});

describe("isClanMember", () => {
  const api = (status: number, body: unknown) => new ApiClient({ fetch: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch, sleep: async () => {}, delayMs: 0 });
  it("lit les clans de la fiche publique du joueur", async () => {
    expect(await isClanMember(api(200, { publicId: "x", username: "Caché", stats: {}, clans: [{ tag: "gal", role: "member" }] }), "x", "GAL")).toBe(true);
    expect(await isClanMember(api(200, { clans: [{ tag: "UN" }] }), "x", "GAL")).toBe(false);
    expect(await isClanMember(api(200, { clans: null }), "x", "GAL")).toBe(false);
  });
  it("une fiche sans champ « clans » est illisible, pas « aucun clan » : la victoire attendra", async () => {
    await expect(isClanMember(api(200, { publicId: "x", username: "Caché" }), "x", "GAL")).rejects.toThrow("fiche du joueur illisible");
  });
  it("un compte inconnu n'est pas membre ; une panne lève une erreur sans l'identifiant", async () => {
    expect(await isClanMember(api(404, {}), "id-secret", "GAL")).toBe(false);
    await expect(isClanMember(api(403, {}), "id-secret", "GAL")).rejects.toThrow("fiche du joueur illisible");
    await isClanMember(api(403, {}), "id-secret", "GAL").catch((e: Error) => expect(e.message).not.toContain("id-secret"));
  });
});

describe("passSessions et mergeStates", () => {
  const a = session("a", "2026-11-11T17:00:00.000Z");
  const b = session("b", "2026-11-11T18:00:00.000Z");
  it("réunit la collecte et l'API, chaque partie une fois, la lecture la plus fraîche l'emportant", () => {
    const fresher = { ...a, score: 2 };
    expect(passSessions([a, b], [fresher])).toEqual({ sessions: [fresher, b], warning: null });
  });
  it("l'une sans l'autre suffit, avec un avertissement ; sans aucune, rien", () => {
    expect(passSessions(null, [a])).toEqual({ sessions: [a], warning: "un mois de sessions de la collecte est illisible, seules celles des dernières heures servent" });
    expect(passSessions([b], null)).toEqual({ sessions: [b], warning: "les sessions des dernières heures ne se lisent pas sur l'API, seules celles de la dernière collecte servent" });
    expect(passSessions(null, null).sessions).toBeNull();
  });
  it("réunit l'état de main et celui du cache : une victoire notée dans l'un ne repart pas", () => {
    expect(mergeStates({ done: [["b", b.gameStart]] }, { done: [["a", a.gameStart], ["b", b.gameStart]] })).toEqual({
      done: [
        ["a", a.gameStart],
        ["b", b.gameStart],
      ],
    });
    expect(mergeStates(null, { done: [] })).toEqual({ done: [] });
    expect(mergeStates(null, null)).toBeNull();
  });
  it("réunit aussi les renvois des deux copies ; sans renvoi, l'état garde sa forme d'avant", () => {
    expect(mergeStates({ done: [["a", a.gameStart]], resent: [["a", a.gameStart]] }, { done: [["b", b.gameStart]] })).toStrictEqual({
      done: [
        ["a", a.gameStart],
        ["b", b.gameStart],
      ],
      resent: [["a", a.gameStart]],
    });
    expect(mergeStates({ done: [["a", a.gameStart]] }, null)).toStrictEqual({ done: [["a", a.gameStart]] });
  });
  it("un état noté avant les renvois se lit toujours, un état avec renvois aussi", () => {
    expect(VictoryState.parse({ done: [["a", a.gameStart]] })).toStrictEqual({ done: [["a", a.gameStart]] });
    expect(VictoryState.parse({ done: [["a", a.gameStart]], resent: [["a", a.gameStart]] }).resent).toEqual([["a", a.gameStart]]);
  });
});

describe("parseResend", () => {
  it("lit les parties à renvoyer ; sans fichier, aucune", () => {
    expect(parseResend(JSON.stringify({ pourquoi: "essai", parties: ["cFEn6wJydj", "cY2FwBXwUA"] }))).toEqual({ games: new Set(["cFEn6wJydj", "cY2FwBXwUA"]), warning: null });
    expect(parseResend(null)).toEqual({ games: new Set(), warning: null });
  });
  it("un fichier illisible, sans raison, avec une partie mal écrite ou écrite deux fois n'en donne aucune, avec un avertissement", () => {
    const bad = [
      "{",
      JSON.stringify({ parties: ["cFEn6wJydj"] }),
      JSON.stringify({ pourquoi: "essai", parties: ["cFEn 6wJydj"] }),
      JSON.stringify({ pourquoi: "essai", parties: ["cFEn6wJydj", "cFEn6wJydj"] }),
      JSON.stringify({ pourquoi: "essai", parties: Array.from({ length: MAX_RESEND + 1 }, (_, i) => `game${i}`) }),
    ];
    for (const raw of bad) {
      const { games, warning } = parseResend(raw);
      expect(games.size).toBe(0);
      expect(warning).toBe("config/victoires-rattrapage.json est illisible, aucune victoire n'est renvoyée");
    }
  });
  it("le fichier du dépôt se lit, s'il existe encore", () => {
    const path = "config/victoires-rattrapage.json";
    expect(parseResend(existsSync(path) ? readFileSync(path, "utf8") : null).warning).toBeNull();
  });
});

describe("victoryPass", () => {
  const NOW = new Date("2026-11-11T20:53:00.000Z");
  const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
  const setup = (sessions: StoredSession[], over: Partial<VictoryPassDeps> = {}) => {
    const logs: string[] = [];
    const sent: string[] = [];
    const pauses: number[] = [];
    const deps: VictoryPassDeps = {
      stored: { done: [] },
      sessions,
      members: MEMBERS,
      tag: "GAL",
      now: NOW,
      readGame: async () => GAME,
      isMember: async (id) => CONFIRMED.has(id),
      send: async (v) => {
        sent.push(v.id);
        return true;
      },
      pause: async (ms) => {
        pauses.push(ms);
      },
      log: (l) => logs.push(l),
      ...over,
    };
    return { deps, logs, sent, pauses };
  };

  it("au premier passage, les victoires du moment servent de départ : rien n'est envoyé", async () => {
    const { deps, sent, logs } = setup([session("a", ago(1)), session("b", ago(30)), session("c", ago(2), { hasWon: false })], { stored: null });
    expect(await victoryPass(deps)).toEqual({ state: { done: [["a", ago(1)]] }, failed: false });
    expect(sent).toEqual([]);
    expect(logs[0]).toContain("premier passage");
  });
  it("annonce les nouvelles victoires dans l'ordre des débuts, avec une pause entre deux messages, puis les note", async () => {
    const { deps, sent, pauses } = setup([session("c", ago(0.5)), session("a", ago(2)), session("b", ago(1)), session("d", ago(1.5), { hasWon: false }), session("e", ago(1), { totalPlayerCount: 1 })], {
      stored: { done: [["z", ago(3)]] },
    });
    const result = await victoryPass(deps);
    expect(sent).toEqual(["a", "b", "c"]);
    expect(pauses).toEqual([PAUSE_MS, PAUSE_MS]);
    expect(result).toEqual({ state: { done: [["z", ago(3)], ["a", ago(2)], ["b", ago(1)], ["c", ago(0.5)]] }, failed: false });
  });
  it("une partie répétée dans les sessions ne part qu'une fois", async () => {
    const { deps, sent } = setup([session("a", ago(2)), session("a", ago(2))]);
    expect(await victoryPass(deps)).toEqual({ state: { done: [["a", ago(2)]] }, failed: false });
    expect(sent).toEqual(["a"]);
  });
  it("une victoire déjà annoncée ne repart pas", async () => {
    const { deps, sent, logs } = setup([session("a", ago(2))], { stored: { done: [["a", ago(2)]] } });
    expect(await victoryPass(deps)).toEqual({ state: null, failed: false });
    expect(sent).toEqual([]);
    expect(logs).toEqual(["Victoires : aucune nouvelle victoire."]);
  });
  it("une partie dont le détail ne se lit pas attend le passage suivant, sans bloquer les autres", async () => {
    const { deps, sent, logs } = setup([session("a", ago(2)), session("b", ago(1))], { readGame: async (id) => (id === "a" ? Promise.reject(new Error("HTTP 503")) : GAME) });
    expect(await victoryPass(deps)).toEqual({ state: { done: [["b", ago(1)]] }, failed: false });
    expect(sent).toEqual(["b"]);
    expect(logs[0]).toBe("::warning::Victoires : le détail de la partie a ne se lit pas (HTTP 503). Nouvel essai au prochain passage.");
  });
  it("après un refus de Discord, s'arrête et garde ce qui est parti : le reste repart au passage suivant", async () => {
    let calls = 0;
    const { deps } = setup([session("a", ago(2)), session("b", ago(1)), session("c", ago(0.5))], { send: async () => ++calls < 2 });
    expect(await victoryPass(deps)).toEqual({ state: { done: [["a", ago(2)]] }, failed: true });
  });
  it("donne l'état à écrire après chaque message accepté : une étape coupée en route ne renvoie rien", async () => {
    const saved: unknown[] = [];
    let calls = 0;
    const { deps } = setup([session("a", ago(2)), session("b", ago(1))], { send: async () => ++calls < 2, progress: (state) => void saved.push(state) });
    await victoryPass(deps);
    expect(saved).toEqual([{ done: [["a", ago(2)]] }]);
  });
  it("une victoire trop ancienne n'est plus annoncée, et ne le dit qu'une fois", async () => {
    const old = session("a", ago(WINDOW_MS / 3_600_000 + 0.5));
    const { deps, sent, logs } = setup([old]);
    const first = await victoryPass(deps);
    expect(sent).toEqual([]);
    expect(first.state).toEqual({ done: [["a", old.gameStart]] });
    expect(logs[0]).toBe("::warning::Victoires : 1 victoire trop ancienne ne sera pas annoncée.");
    const again = setup([old], { stored: first.state });
    expect(await victoryPass(again.deps)).toEqual({ state: null, failed: false });
    expect(again.logs.join(" ")).not.toContain("::warning::");
  });
  it(`au plus ${MAX_PER_PASS} messages par passage, les plus anciens d'abord`, async () => {
    const many = Array.from({ length: MAX_PER_PASS + 3 }, (_, i) => session(`v${String(i).padStart(2, "0")}`, ago(3 - i * 0.1)));
    const { deps, sent, logs } = setup(many);
    await victoryPass(deps);
    expect(sent).toEqual(many.slice(0, MAX_PER_PASS).map((s) => s.gameId));
    expect(logs).toContain("Victoires : 3 de plus attendent le passage suivant.");
  });
  it("oublie les victoires notées depuis plus d'un jour", async () => {
    const { deps } = setup([session("b", ago(1))], { stored: { done: [["a", new Date(NOW.getTime() - FORGET_MS - 60_000).toISOString()]] } });
    expect((await victoryPass(deps)).state).toEqual({ done: [["b", ago(1)]] });
  });
  it("sans aucune session lisible : rien ne part, avec un avertissement", async () => {
    const { deps, sent, logs } = setup([], { sessions: null });
    expect(await victoryPass(deps)).toEqual({ state: null, failed: false });
    expect(sent).toEqual([]);
    expect(logs[0]).toContain("::warning::Victoires");
  });
  it("vérifie chaque porteur du tag hors de la liste une fois par passage, et nomme ceux que leur fiche donne membres", async () => {
    const asked: string[] = [];
    const victories: Victory[] = [];
    const { deps } = setup([session("a", ago(2)), session("b", ago(1))], {
      isMember: async (id) => {
        asked.push(id);
        return CONFIRMED.has(id);
      },
      send: async (v) => {
        victories.push(v);
        return true;
      },
    });
    await victoryPass(deps);
    expect(asked).toEqual(["id-anonyme", "id-vide"]);
    expect(victories.map((v) => v.crew.map((p) => p.name))).toEqual([
      ["alpha", "Caché", "Zoé en jeu"],
      ["alpha", "Caché", "Zoé en jeu"],
    ]);
  });
  it("une fiche de joueur illisible fait attendre la victoire, sans écrire d'identifiant", async () => {
    const { deps, sent, logs } = setup([session("a", ago(2))], { isMember: async () => Promise.reject(new Error("fiche du joueur illisible")) });
    expect(await victoryPass(deps)).toEqual({ state: null, failed: false });
    expect(sent).toEqual([]);
    expect(logs[0]).toBe("::warning::Victoires : un Gaulois de la partie a n'a pas pu être vérifié sur l'API. Nouvel essai au prochain passage.");
    expect(logs.join(" ")).not.toMatch(/id-anonyme|id-vide/);
  });

  describe("les renvois de config/victoires-rattrapage.json", () => {
    it("renvoie une victoire demandée, déjà notée et plus vieille que six heures, dans l'ordre des débuts, puis la note renvoyée", async () => {
      const night = session("a", ago(11));
      const fresh = session("b", ago(1));
      const saved: unknown[] = [];
      const { deps, sent, logs } = setup([fresh, night], { stored: { done: [["a", night.gameStart]] }, resend: new Set(["a"]), progress: (state) => void saved.push(state) });
      const result = await victoryPass(deps);
      expect(sent).toEqual(["a", "b"]);
      expect(result).toStrictEqual({
        state: {
          done: [
            ["a", night.gameStart],
            ["b", fresh.gameStart],
          ],
          resent: [["a", night.gameStart]],
        },
        failed: false,
      });
      expect(saved[0]).toStrictEqual({ done: [["a", night.gameStart]], resent: [["a", night.gameStart]] });
      expect(logs).toContain("Victoires : 1 victoire à renvoyer (config/victoires-rattrapage.json).");
      expect(logs.join(" ")).not.toContain("trop ancienne");
    });
    it("une victoire renvoyée ne repart plus", async () => {
      const night = session("a", ago(11));
      const { deps, sent } = setup([night], { stored: { done: [["a", night.gameStart]], resent: [["a", night.gameStart]] }, resend: new Set(["a"]) });
      expect(await victoryPass(deps)).toEqual({ state: null, failed: false });
      expect(sent).toEqual([]);
    });
    it("une victoire demandée jamais partie part une seule fois, notée envoyée et renvoyée", async () => {
      const first = setup([session("a", ago(1))], { resend: new Set(["a"]) });
      const result = await victoryPass(first.deps);
      expect(result.state).toStrictEqual({ done: [["a", ago(1)]], resent: [["a", ago(1)]] });
      const second = setup([session("a", ago(1))], { stored: result.state, resend: new Set(["a"]) });
      expect(await victoryPass(second.deps)).toEqual({ state: null, failed: false });
      expect([...first.sent, ...second.sent]).toEqual(["a"]);
    });
    it("une victoire demandée, jamais partie et plus vieille que six heures, n'est pas dite trop ancienne : elle part", async () => {
      const old = session("a", ago(WINDOW_MS / 3_600_000 + 2));
      const { deps, sent, logs } = setup([old], { resend: new Set(["a"]) });
      expect((await victoryPass(deps)).state).toStrictEqual({ done: [["a", old.gameStart]], resent: [["a", old.gameStart]] });
      expect(sent).toEqual(["a"]);
      expect(logs.join(" ")).not.toContain("trop ancienne");
    });
    it("après un refus de Discord, la victoire demandée attend le passage suivant", async () => {
      const night = session("a", ago(11));
      const { deps } = setup([night], { stored: { done: [["a", night.gameStart]] }, resend: new Set(["a"]), send: async () => false });
      expect(await victoryPass(deps)).toEqual({ state: null, failed: true });
    });
    it("une victoire demandée qui a commencé il y a plus d'un jour ne repart pas", async () => {
      const old = session("a", new Date(NOW.getTime() - FORGET_MS - 60_000).toISOString());
      const { deps, sent } = setup([old], { resend: new Set(["a"]) });
      expect(await victoryPass(deps)).toEqual({ state: null, failed: false });
      expect(sent).toEqual([]);
    });
    it("oublie les renvois notés depuis plus d'un jour", async () => {
      const gone = new Date(NOW.getTime() - FORGET_MS - 60_000).toISOString();
      const { deps } = setup([session("b", ago(1))], { stored: { done: [["a", gone]], resent: [["a", gone]] } });
      expect((await victoryPass(deps)).state).toStrictEqual({ done: [["b", ago(1)]] });
    });
    it("au premier passage, une victoire demandée sert de départ comme les autres : rien ne part, ni ensuite", async () => {
      const first = setup([session("a", ago(11)), session("b", ago(1))], { stored: null, resend: new Set(["a"]) });
      const result = await victoryPass(first.deps);
      expect(result.state).toStrictEqual({
        done: [
          ["a", ago(11)],
          ["b", ago(1)],
        ],
        resent: [["a", ago(11)]],
      });
      const second = setup([session("a", ago(11)), session("b", ago(1))], { stored: result.state, resend: new Set(["a"]) });
      await victoryPass(second.deps);
      expect([...first.sent, ...second.sent]).toEqual([]);
    });
  });
});

describe("le texte de secours", () => {
  it("dit la carte, le format, tous les Gaulois de la partie, la durée et les points, avec le crédit de la carte", () => {
    expect(plain(victoryContent(VICTORY, "GAL", SITE).content).split("\n")).toEqual([
      "**Victoire de [GAL]** · Quatre Îles",
      "⚔️ 4 équipes · 6 Gaulois sur 23 joueurs",
      "👥 [**alpha**](<https://x.test/membres/id-alpha/>), **Caché**, [**Zoé en jeu**](<https://x.test/membres/id-zoe/>), 1 Gaulois sans nom et 1 joueur sous le tag, hors du clan",
      "⏱️ 15 min 43 s, commencée à <t:1794416698:t> · +1,81 point gagné",
      "[Revoir la partie](<https://openfront.io/game/dVEWLLQHx1>) · [Dernières parties](<https://x.test/parties>)",
      "-# Noms portés dans la partie. Carte : [© OpenFront and Contributors](<https://github.com/openfrontio/OpenFrontIO/tree/main/resources/maps/fourislands>), [CC BY-SA 4.0](<https://creativecommons.org/licenses/by-sa/4.0/deed.fr>).",
    ]);
  });
  it("les clans en face, sur leur ligne après les Gaulois ; aucun : pas de ligne", () => {
    const lines = plain(victoryContent({ ...VICTORY, rivals: ["ITA", "UN"] }, "GAL", SITE).content).split("\n");
    expect(lines[3]).toBe("🆚 Contre les clans [ITA] et [UN]");
    expect(plain(victoryContent({ ...VICTORY, rivals: ["UN"] }, "GAL", SITE).content).split("\n")[3]).toBe("🆚 Contre le clan [UN]");
    expect(victoryContent(VICTORY, "GAL", SITE).content).not.toContain("🆚");
  });
  it("sans « autres » : une liste en français ; sans image, donc sans vignette à créditer ; personne : pas de ligne des noms", () => {
    const all: Victory = { ...VICTORY, format: "Trios", crew: VICTORY.crew.slice(0, 2), unnamed: 0, outsiders: 0, points: 2.24 };
    const lines = plain(victoryContent(all, "GAL", SITE).content).split("\n");
    expect(lines[1]).toBe("⚔️ Trios · 6 Gaulois sur 23 joueurs");
    expect(lines[2]).toBe("👥 [**alpha**](<https://x.test/membres/id-alpha/>) et **Caché**");
    expect(lines[3]).toContain("· +2,24 points gagnés");
    expect(lines.at(-1)).toBe("-# Noms portés dans la partie. Carte : [© OpenFront and Contributors](<https://github.com/openfrontio/OpenFrontIO/tree/main/resources/maps/fourislands>), [CC BY-SA 4.0](<https://creativecommons.org/licenses/by-sa/4.0/deed.fr>).");
    expect(victoryContent({ ...all, map: "???" }, "GAL", SITE).content).toContain("(<https://github.com/openfrontio/OpenFrontIO/tree/main/resources/maps>)");
    const nobody = plain(victoryContent({ ...VICTORY, crew: [], unnamed: 0, outsiders: 0, format: null, points: null }, "GAL", SITE).content);
    expect(nobody).not.toContain("👥");
    expect(nobody).toContain("⚔️ 6 Gaulois sur 23 joueurs");
    expect(nobody).not.toContain("point");
  });
  it("un nom ne met rien en forme et ne glisse ni lien ni mention", () => {
    const sly: Victory = { ...VICTORY, crew: [{ id: null, name: "**gras** [lien](https://pirate.test) @everyone" }], unnamed: 0, outsiders: 0 };
    const content = victoryContent(sly, "GAL", SITE).content;
    expect(content).toContain("\\*\\*gras\\*\\* \\[lien\\]\\(https\\:\\/\\/pirate.test\\) \\@everyone");
    expect(victoryPayload(sly, "GAL", SITE, null)).toMatchObject({ allowed_mentions: { parse: [] }, avatar_url: "https://x.test/generated/icon-192.png" });
  });
  it("beaucoup de longs noms : tous écrits, sans lien s'il le faut pour tenir dans la limite de Discord", () => {
    const crowd: Victory = { ...VICTORY, crew: Array.from({ length: 20 }, (_, i) => ({ id: `id-${"x".repeat(40)}-${i}`, name: `${"Ω".repeat(30)}${i}` })), unnamed: 0, outsiders: 0 };
    const { content, written } = victoryContent(crowd, "GAL", SITE);
    expect(content.length).toBeLessThanOrEqual(1900);
    expect(written).toBe(20);
    expect(content).not.toContain("/membres/");
    expect(content).not.toContain("autres Gaulois");
    for (let i = 0; i < 20; i++) expect(content).toContain(`${"Ω".repeat(30)}${i}`);
  });
  it("au-delà de ce que Discord accepte, et seulement là, compte ceux qu'il ne peut plus écrire", () => {
    const huge: Victory = { ...VICTORY, crew: Array.from({ length: 80 }, (_, i) => ({ id: null, name: `${"Ω".repeat(38)}${i}` })), unnamed: 0, outsiders: 0 };
    const { content, written } = victoryContent(huge, "GAL", SITE);
    expect(content.length).toBeLessThanOrEqual(1900);
    expect(content).toContain(`et ${80 - written} autres Gaulois`);
  });
  it("compte au singulier comme au pluriel ceux qui ne sont pas nommés", () => {
    const counted = (unnamed: number, outsiders: number) => plain(victoryContent({ ...VICTORY, crew: [], unnamed, outsiders }, "GAL", SITE).content).split("\n")[2];
    expect(counted(2, 0)).toBe("👥 2 Gaulois sans nom");
    expect(counted(0, 2)).toBe("👥 2 joueurs sous le tag, hors du clan");
    expect(counted(1, 1)).toBe("👥 1 Gaulois sans nom et 1 joueur sous le tag, hors du clan");
  });
  it("avec l'image : le fichier joint et deux boutons, la partie sur OpenFront et les dernières parties, sans aucun texte", () => {
    expect(victoryPayload(VICTORY, "GAL", SITE, { alt: "Description.", filename: "victoire.png" })).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "victoire.png", description: "Description." }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "Revoir la partie", url: "https://openfront.io/game/dVEWLLQHx1" },
            { type: 2, style: 5, label: "Dernières parties", url: "https://x.test/parties" },
          ],
        },
      ],
    });
    expect(victoryPayload(VICTORY, "GAL", SITE, null)).not.toHaveProperty("components");
  });
  it("part en texte si l'image ne se dessine pas, et n'écrit jamais le lien", async () => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const ok = await sendVictory({ link: WEBHOOK, victory: VICTORY, renderImage: () => Promise.reject(new Error("police")), tag: "GAL", siteUrl: SITE, fetch: post as unknown as typeof fetch, log: (l) => logs.push(l) });
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    // Le secours garde le crédit de la carte, avec ses deux liens.
    const [, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(JSON.parse(String(init.body)).content)).toContain("[CC BY-SA 4.0](<https://creativecommons.org/licenses/by-sa/4.0/deed.fr>)");
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
  it("avec l'image, l'envoie seule, jointe sous le nom de la partie", async () => {
    const post = vi.fn(async (_url: string, init: RequestInit) => new Response(null, { status: init.body instanceof FormData ? 200 : 500 }));
    const ok = await sendVictory({ link: WEBHOOK, victory: VICTORY, renderImage: async () => ({ png: new Uint8Array([1]), alt: "Image." }), tag: "GAL", siteUrl: SITE, fetch: post as unknown as typeof fetch, log: () => {} });
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0]!;
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    const sent = JSON.parse((init.body as FormData).get("payload_json") as string);
    expect(sent.attachments[0].filename).toBe("victoire-dVEWLLQHx1.png");
    // Le message est l'image seule : aucun texte ne l'accompagne.
    expect(sent).not.toHaveProperty("content");
  });
  it("écrit la durée comme on la dit", () => {
    expect([gameLength(943.4), gameLength(420), gameLength(45), gameLength(3_877), gameLength(7_477)]).toEqual(["15 min 43 s", "7 min", "45 s", "1 h 04 min", "2 h 04 min"]);
    expect([frenchList([]), frenchList(["A"]), frenchList(["A", "B"]), frenchList(["A", "B", "C"])]).toEqual(["", "A", "A et B", "A, B et C"]);
  });
});

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. */
function expectClean(card: GazetteCard): void {
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - measure(t.text, t.font, t.size) : t.anchor === "middle" ? t.x - measure(t.text, t.font, t.size) / 2 : t.x);
  const rightOf = (t: CardText) => leftOf(t) + measure(t.text, t.font, t.size);
  for (const t of card.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(card.width);
    expect(t.y, t.text).toBeLessThanOrEqual(card.height);
  }
  for (const a of card.texts) {
    for (const b of card.texts) {
      if (a === b || a.y !== b.y) continue;
      expect(rightOf(a) <= leftOf(b) || rightOf(b) <= leftOf(a), `« ${a.text} » et « ${b.text} » se chevauchent`).toBe(true);
    }
  }
  for (const r of card.rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(card.width + 0.01);
    expect(r.y + r.height).toBeLessThanOrEqual(card.height);
  }
}

const crowdOf = (count: number): Victory => ({ ...VICTORY, crew: Array.from({ length: count }, (_, i) => ({ id: null, name: `Capitaine Barbe GOAT.${7360 + i}` })), unnamed: 0, outsiders: 0 });

describe("victoryCard", () => {
  const SQUARE = { width: 375, height: 375, open: false };
  it("dessine l'en-tête, la carte sur la mer, les trois chiffres, tous les Gaulois et le crédit", () => {
    const card = victoryCard(VICTORY, "GAL", SITE, measure, SQUARE);
    const texts = card.texts.map((t) => plain(t.text));
    for (const expected of ["Victoire de [GAL] · 4 équipes", "Quatre Îles", "Mercredi 11 novembre à 18:04, heure de Paris", "GAULOIS", "6", "sur 23 joueurs", "POINT GAGNÉ", "+1,81", "DURÉE", "16 min", "de partie", "alpha", "Caché", "Zoé en jeu", "1 Gaulois sans nom", "1 joueur sous le tag, hors du clan", "x.test/parties", MAP_NOTE]) {
      expect(texts).toContain(expected);
    }
    // La vignette : agrandie dans son cadre, au centre, sur la mer.
    expect(card.map).toEqual({ x: 170, y: 244, width: 392, height: 392, radius: 6 });
    expect(card.rects).toContainEqual({ ...card.map, color: SEA });
    expectClean(card);
  });
  it("une partie de plus d'une heure se lit en heures, comme dans le texte", () => {
    expect([tileLength(943.4), tileLength(3_590), tileLength(10_253)]).toEqual(["16 min", "60 min", "2 h 50 min"]);
    expect(victoryCard({ ...VICTORY, seconds: 10_253 }, "GAL", SITE, measure, SQUARE).texts.map((t) => t.text)).toContain("2 h 50 min");
  });
  it("une carte entourée d'eau baigne dans la mer jusqu'au bord du cadre", () => {
    const card = victoryCard(VICTORY, "GAL", SITE, measure, { ...SQUARE, open: true });
    expect(card.rects).toContainEqual({ x: 36, y: 230, width: 660, height: 420, radius: 8, color: SEA });
    expect(card.rects.filter((r) => r.color === SEA)).toHaveLength(1);
  });
  it("une petite vignette ne grossit pas plus du double, une grande se réduit", () => {
    expect(victoryCard(VICTORY, "GAL", SITE, measure, { width: 100, height: 50, open: false }).map).toMatchObject({ width: 200, height: 100 });
    expect(victoryCard(VICTORY, "GAL", SITE, measure, { width: 2000, height: 1000, open: false }).map).toMatchObject({ width: 632, height: 316 });
  });
  it("sans vignette : les chiffres côte à côte, le crédit du seul nom, et l'image est plus courte", () => {
    const card = victoryCard(VICTORY, "GAL", SITE, measure, null);
    expect(card.map).toBeNull();
    expect(card.texts.map((t) => t.text)).toContain(NAME_NOTE);
    expect(card.height).toBeLessThan(victoryCard(VICTORY, "GAL", SITE, measure, SQUARE).height);
    expectClean(card);
  });
  it("sans points ni nom : deux chiffres, et pas de pastilles", () => {
    const card = victoryCard({ ...VICTORY, points: null, crew: [], unnamed: 0, outsiders: 0 }, "GAL", SITE, measure, SQUARE);
    const texts = card.texts.map((t) => t.text);
    expect(texts.join(" ")).not.toMatch(/point|Gaulois sans nom|hors du clan|alpha/);
    expect(card.height).toBeLessThan(victoryCard(VICTORY, "GAL", SITE, measure, SQUARE).height);
    expectClean(card);
  });
  it("beaucoup de Gaulois : tous en pastilles, plus petites au-delà de trois lignes, jamais « et autres »", () => {
    for (const count of [14, 30]) {
      const card = victoryCard(crowdOf(count), "GAL", SITE, measure, SQUARE);
      const names = card.texts.filter((t) => t.text.startsWith("Capitaine"));
      expect(names.map((t) => t.text)).toEqual(crowdOf(count).crew.map((p) => p.name));
      expect(card.texts.map((t) => t.text).join(" ")).not.toContain("autres");
      expect(names[0]!.size).toBeLessThan(CHIP_STEPS[0].font);
      expectClean(card);
    }
    // Peu de noms : la grande taille.
    expect(victoryCard(VICTORY, "GAL", SITE, measure, SQUARE).texts.find((t) => t.text === "alpha")?.size).toBe(CHIP_STEPS[0].font);
  });
  it("les clans en face : « contre », puis leur tag dans des cases rouges, après les Gaulois", () => {
    const card = victoryCard({ ...VICTORY, rivals: ["ITA", "UN"] }, "GAL", SITE, measure, SQUARE);
    const texts = card.texts.map((t) => t.text);
    expect(texts.slice(texts.indexOf("alpha"), texts.indexOf("[UN]") + 1)).toEqual(["alpha", "Caché", "Zoé en jeu", "1 Gaulois sans nom", "1 joueur sous le tag, hors du clan", "contre", "[ITA]", "[UN]"]);
    const red = card.rects.filter((r) => r.color === CARD_COLORS.RED_FILL);
    expect(red).toHaveLength(2);
    // Le texte de chaque case rouge est dedans, en blanc ; « contre » n'a pas de case.
    for (const tag of ["[ITA]", "[UN]"]) {
      const text = card.texts.find((t) => t.text === tag)!;
      expect(text.color).toBe(CARD_COLORS.WHITE);
      expect(red.some((r) => text.x > r.x && text.x + measure(tag, text.font, text.size) < r.x + r.width && text.y > r.y && text.y < r.y + r.height)).toBe(true);
    }
    const word = card.texts.find((t) => t.text === "contre")!;
    expect(word.color).toBe(CARD_COLORS.MUTED);
    expect(card.rects.some((r) => word.x >= r.x && word.x < r.x + r.width && word.y > r.y && word.y < r.y + r.height)).toBe(false);
    expectClean(card);
    // Sans clan en face, rien de rouge ni de « contre ».
    const none = victoryCard(VICTORY, "GAL", SITE, measure, SQUARE);
    expect(none.texts.map((t) => t.text)).not.toContain("contre");
    expect(none.rects.filter((r) => r.color === CARD_COLORS.RED_FILL)).toHaveLength(0);
  });
  it("« contre » ne finit jamais une ligne : il passe à la suivante avec le premier clan", () => {
    const items = (filler: number) => [{ text: "W".repeat(filler), named: true }, { text: "contre", named: false, word: true }, { text: "[ITA]", named: false, red: true }];
    // Assez de place pour « contre » seul au bout de la ligne, pas pour « contre » et la case qui suit.
    const width = 600;
    const padding = Math.round(CHIP_STEPS[0].font * 0.8);
    const fillerFor = (room: number) => Math.floor((room - 2 * padding) / (CHIP_STEPS[0].font * 0.58));
    const wordWidth = Math.ceil(measure("contre", "body", CHIP_STEPS[0].font)) + 2 * Math.round(padding / 4);
    const layout = chipLayout(items(fillerFor(width - CHIP_GAP - wordWidth - 10)), measure, width);
    expect(layout.rows.map((row) => row.map((c) => c.text))).toEqual([[expect.stringMatching(/^W+$/)], ["contre", "[ITA]"]]);
    // Avec la place pour les deux, tout tient sur une ligne.
    expect(chipLayout(items(3), measure, width).rows).toHaveLength(1);
  });
  it("sans la monnaie du village, l'image ne montre ni pièce ni statères : l'interrupteur est fermé jusqu'à la mise en ligne", () => {
    expect(STATERES_SUR_LES_VICTOIRES).toBe(false);
    const gold = new Set(casesDuStatere(16).filter(Boolean));
    for (const shape of [SQUARE, null]) {
      // Sans rien demander, et en le refusant : la même image qu'avant.
      for (const card of [victoryCard(VICTORY, "GAL", SITE, measure, shape), victoryCard(VICTORY, "GAL", SITE, measure, shape, false)]) {
        expect(card.texts.some((t) => t.text.includes("statère"))).toBe(false);
        expect(card.rects.some((r) => gold.has(r.color))).toBe(false);
      }
      expect(victoryCard(VICTORY, "GAL", SITE, measure, shape)).toEqual(victoryCard(VICTORY, "GAL", SITE, measure, shape, false));
    }
    expect(victoryImageAlt(VICTORY, "GAL", true)).not.toContain("statère");
    expect(victoryImageAlt(VICTORY, "GAL", true, false)).toBe(victoryImageAlt(VICTORY, "GAL", true));
  });
  it("avec la monnaie : la pièce et les statères de chaque Gaulois, sous les points rapportés au clan", () => {
    // 1,81 point, 30 statères par point rapporté au clan, arrondi : 54 à chacun des 6 Gaulois.
    expect(staterWords(VICTORY)).toBe("54 statères par villageois");
    for (const shape of [SQUARE, null]) {
      const before = victoryCard(VICTORY, "GAL", SITE, measure, shape, false);
      const card = victoryCard(VICTORY, "GAL", SITE, measure, shape, true);
      const words = card.texts.find((t) => t.text === "54 statères par villageois")!;
      const points = card.texts.find((t) => t.text === "+1,81")!;
      expect(words).toMatchObject({ font: "body", color: CARD_COLORS.MUTED });
      // Juste sous le chiffre des points, à la place d'une ligne d'explication ; la pièce devant, sans toucher le texte.
      expect(words.y - points.y).toBe(42);
      const coin = card.rects.filter((r) => !before.rects.some((b) => b.x === r.x && b.y === r.y && b.width === r.width && b.height === r.height && b.color === r.color));
      expect(coin).toEqual(coinRects(points.x, words.y - 9 - 16));
      expect(Math.min(...coin.map((r) => r.x))).toBe(points.x);
      expect(Math.max(...coin.map((r) => r.x + r.width))).toBeLessThan(words.x);
      expect(Math.min(...coin.map((r) => r.y))).toBeGreaterThan(points.y);
      // La pièce de 16 cases, à 2 pixels la case : chaque case pleine est couverte une fois, de sa couleur.
      const cells = casesDuStatere(16);
      expect(coin.reduce((sum, r) => sum + (r.width / 2) * (r.height / 2), 0)).toBe(cells.filter(Boolean).length);
      for (const r of coin) expect(cells[((r.y - (words.y - 25)) / 2) * 16 + (r.x - points.x) / 2]).toBe(r.color);
      // Rien d'autre ne bouge : la même hauteur, les mêmes textes, plus un.
      expect(card.height).toBe(before.height);
      expect(card.texts.filter((t) => t !== words)).toEqual(before.texts);
      expectClean(card);
    }
    expect(plain(victoryImageAlt(VICTORY, "GAL", true, true))).toContain("+1,81 point gagné, partie de 16 min. Chaque Gaulois du village présent dans la partie reçoit 54 statères, pour les points rapportés au clan. Gaulois de la partie");
  });
  it("avec la monnaie : rien si la partie ne rapporte pas de points ; un seul statère, un seul Gaulois s'écrivent au singulier", () => {
    for (const points of [null, 0, -0.4]) {
      const none = { ...VICTORY, points };
      expect(staterWords(none)).toBeNull();
      expect(victoryCard(none, "GAL", SITE, measure, SQUARE, true)).toEqual(victoryCard(none, "GAL", SITE, measure, SQUARE, false));
      expect(victoryImageAlt(none, "GAL", true, true)).not.toContain("statère");
    }
    // Une partie qui rapporte des points donne au moins un statère.
    expect(staterWords({ ...VICTORY, points: 0.04 })).toBe("1 statère par villageois");
    expect(staterWords({ ...VICTORY, points: 0.04, gaulois: 1 })).toBe("1 statère par villageois");
    expect(victoryImageAlt({ ...VICTORY, points: 0.04, gaulois: 1 }, "GAL", true, true)).toContain("Chaque Gaulois du village présent dans la partie reçoit 1 statère, pour les points rapportés au clan.");
    expect(plain(staterWords({ ...VICTORY, points: 120 }) ?? "")).toBe("3 600 statères par villageois");
    // Jamais les mots que le pilote a repris.
    for (const text of [staterWords(VICTORY) ?? "", victoryImageAlt(VICTORY, "GAL", true, true)]) expect(text).not.toMatch(/gagnés par|partie gagnée/);
    // Beaucoup de Gaulois, de longs noms : la ligne de la pièce ne déborde pas.
    expectClean(victoryCard(crowdOf(40), "GAL", SITE, measure, SQUARE, true));
    expectClean(victoryCard({ ...VICTORY, points: 123456.78 }, "GAL", SITE, measure, null, true));
  });
  it("un nom plus long que la ligne est coupé, pas débordé", () => {
    expectClean(victoryCard({ ...VICTORY, crew: [{ id: null, name: "W".repeat(90) }], unnamed: 0, outsiders: 0 }, "GAL", SITE, measure, SQUARE));
  });
  it("dit tout à un lecteur d'écran, crédit compris", () => {
    expect(plain(victoryImageAlt(VICTORY, "GAL", true))).toBe(
      "Victoire de [GAL] sur la carte Quatre Îles, 4 équipes, mercredi 11 novembre à 18:04, heure de Paris. 6 Gaulois sur 23 joueurs, +1,81 point gagné, partie de 16 min. Gaulois de la partie, sous leur nom en partie : alpha, Caché, Zoé en jeu, 1 Gaulois sans nom et 1 joueur sous le tag, hors du clan. Image et nom de la carte : © OpenFront and Contributors, CC BY-SA 4.0, image redimensionnée.",
    );
    expect(victoryImageAlt(VICTORY, "GAL", false)).toContain("Nom de la carte : © OpenFront and Contributors, CC BY-SA 4.0.");
    expect(victoryImageAlt({ ...VICTORY, seconds: 10_253 }, "GAL", true)).toContain("partie de 2 h 50 min.");
    expect(plain(victoryImageAlt({ ...VICTORY, rivals: ["ITA", "UN"] }, "GAL", true))).toContain("1 joueur sous le tag, hors du clan. Victoire contre les clans [ITA] et [UN]. Image et nom de la carte");
    expect(victoryImageAlt(VICTORY, "GAL", true)).not.toContain("contre");
  });
  it("beaucoup de longs noms : la description n'en coupe aucun, compte les autres, et garde le crédit de la carte en entier", () => {
    const huge: Victory = { ...VICTORY, crew: Array.from({ length: 80 }, (_, i) => ({ id: null, name: `Capitaine Barbe GOAT.${7000 + i}` })), unnamed: 1, outsiders: 0 };
    const alt = plain(victoryImageAlt(huge, "GAL", true));
    expect(alt.length).toBeLessThanOrEqual(1024);
    const written = huge.crew.filter((p) => alt.includes(p.name)).length;
    expect(written).toBeGreaterThan(10);
    expect(written).toBeLessThan(80);
    expect(alt.endsWith(`${huge.crew[written - 1]!.name}, ${80 - written} autres Gaulois et 1 Gaulois sans nom. Image et nom de la carte : © OpenFront and Contributors, CC BY-SA 4.0, image redimensionnée.`)).toBe(true);
  });
});

describe("la vignette de la carte", () => {
  it("se lit dans le dépôt d'OpenFront, jamais sur son CDN", () => {
    expect(thumbnailUrl("Four Islands")).toBe("https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/resources/maps/fourislands/thumbnail.webp");
    expect(thumbnailUrl("Baikal (Nuke Wars)")).toBe("https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/resources/maps/baikalnukewars/thumbnail.webp");
    expect(thumbnailUrl("../")).toBeNull();
    expect(thumbnailUrl("É")).toBeNull();
  });
  it("sait si son pourtour n'est que de l'eau", () => {
    expect(openAround(new Uint8Array([0, 0, 0, 0, 255, 0, 0, 0, 0]), 3, 3)).toBe(true);
    expect(openAround(new Uint8Array([0, 0, 0, 0, 255, 255, 0, 0, 0]), 3, 3)).toBe(false);
  });
  const webp = (width: number, height: number, alpha: number) => sharp({ create: { width, height, channels: 4, background: { r: 190, g: 220, b: 138, alpha } } }).webp().toBuffer();
  it("est lue sans suivre de redirection, avec sa taille et son pourtour", async () => {
    const data = await webp(40, 20, 0);
    const get = vi.fn(async () => new Response(new Uint8Array(data), { status: 200 }));
    const thumb = await readThumbnail("World", get as unknown as typeof fetch);
    expect([thumb.width, thumb.height, thumb.open]).toEqual([40, 20, true]);
    expect(get).toHaveBeenCalledWith("https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/resources/maps/world/thumbnail.webp", expect.objectContaining({ redirect: "error" }));
    expect((await readThumbnail("World", vi.fn(async () => new Response(new Uint8Array(await webp(4, 4, 1)), { status: 200 })) as unknown as typeof fetch)).open).toBe(false);
  });
  it("une réponse qui n'est pas une vignette est refusée : l'image se dessine sans elle", async () => {
    await expect(readThumbnail("World", vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch)).rejects.toThrow("HTTP 404");
    await expect(readThumbnail("World", vi.fn(async () => new Response("pas une image", { status: 200 })) as unknown as typeof fetch)).rejects.toThrow();
    await expect(readThumbnail("World", vi.fn(async () => new Response("x", { status: 200, headers: { "content-length": "9000000" } })) as unknown as typeof fetch)).rejects.toThrow("fichier trop lourd");
  });
  it("se dessine avec les polices du site, la vignette à sa place", async () => {
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const data = await webp(60, 30, 1);
    const card = victoryCard(VICTORY, "GAL", SITE, fonts.width, { width: 60, height: 30, open: false });
    const png = await renderVictoryCard(card, fonts, root, { data, width: 60, height: 30, open: false });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([card.width, card.height]);
    // Au centre de la vignette, la couleur de la terre, pas celle du fond de l'image.
    const map = card.map!;
    const { data: pixel } = await sharp(png)
      .extract({ left: Math.round(map.x + map.width / 2), top: Math.round(map.y + map.height / 2), width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Le format webp arrondit un peu les couleurs.
    for (const [i, channel] of [190, 220, 138].entries()) expect(Math.abs((pixel[i] ?? 0) - channel)).toBeLessThanOrEqual(3);
  });
  it("un caractère qu'aucune police ne sait dessiner devient « ? » sur l'image, au lieu de faire tomber l'image", () => {
    const fonts = new GazetteFonts(process.cwd());
    const odd = `Zoé ${String.fromCodePoint(0x1f525)} ${String.fromCodePoint(0x5f20)}`;
    expect(fonts.drawable(odd, "strong")).toBe("Zoé ? ?");
    expect(() => fonts.width(fonts.drawable(odd, "strong"), "strong", 28)).not.toThrow();
    expect(() => fonts.width(odd, "strong", 28)).toThrow();
  });
  it("avec les vraies polices et l'adresse du site, le crédit d'OpenFront tient en entier, assez grand pour se lire", () => {
    const fonts = new GazetteFonts(process.cwd());
    for (const [shape, note] of [[{ width: 60, height: 30, open: false }, MAP_NOTE], [null, NAME_NOTE]] as const) {
      const credit = victoryCard(VICTORY, "GAL", "https://les-gaulois.github.io", fonts.width, shape).texts.find((t) => t.text.includes("OpenFront"));
      expect(credit?.text).toBe(note);
      expect(credit?.size).toBeGreaterThanOrEqual(18);
    }
  });
  it("sans texte dans le message, l'image écrit elle-même l'adresse de la source et celle de la licence, en entier", () => {
    const fonts = new GazetteFonts(process.cwd());
    const expected = "github.com/openfrontio/OpenFrontIO/tree/main/resources/maps/fourislands · creativecommons.org/licenses/by-sa/4.0/deed.fr";
    for (const shape of [{ width: 60, height: 30, open: false }, null]) {
      const card = victoryCard(VICTORY, "GAL", "https://les-gaulois.github.io", fonts.width, shape);
      const addresses = card.texts.find((t) => t.text.includes("creativecommons.org"));
      expect(addresses?.text).toBe(expected);
      expect(addresses?.size).toBeGreaterThanOrEqual(14);
      // Sous le crédit, pas sur la même ligne que lui ni que l'adresse du site.
      expect(addresses?.y).toBeGreaterThan(card.texts.find((t) => t.text.includes("OpenFront and Contributors"))?.y ?? Infinity);
    }
  });
  it("une carte au nom trop long pour la ligne garde une adresse entière : celle du dossier de toutes les cartes", () => {
    const all = "github.com/openfrontio/OpenFrontIO/tree/main/resources/maps · creativecommons.org/licenses/by-sa/4.0/deed.fr";
    expect(creditAddresses("Four Islands", () => true)).toBe("github.com/openfrontio/OpenFrontIO/tree/main/resources/maps/fourislands · creativecommons.org/licenses/by-sa/4.0/deed.fr");
    expect(creditAddresses("Four Islands", () => false)).toBe(all);
    // Un nom qui ne donne pas de dossier possible : le dossier de toutes les cartes, déjà.
    expect(creditAddresses("???", () => true)).toBe(all);
    const long = victoryCard({ ...VICTORY, map: "a".repeat(60) }, "GAL", SITE, measure, null).texts.find((t) => t.text.includes("creativecommons.org"));
    expect(long?.text).toBe(all);
  });
});
