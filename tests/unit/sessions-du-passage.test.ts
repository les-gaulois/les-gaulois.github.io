import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../src/lib/pipeline";
import { ApiVictoryGame, StoredSession } from "../../src/lib/schemas";
import { garderSessionsDuPassage, lireSessionsDuPassage, SESSIONS_DU_PASSAGE, sessionsFraichesDesStateres, texteDuPassage, VALIDITE_MS } from "../../src/lib/sessions-du-passage";
import { stateresDeVictoire } from "../../src/lib/stateres";
import { releveStateres, type PartieNotee } from "../../src/lib/stateres-releve";
import { passSessions, readRecentSessions } from "../../src/lib/victoires";

const session = (gameId: string, gameStart: string, over: Partial<StoredSession> = {}): StoredSession => ({
  gameId,
  clanPlayerCount: 3,
  hasWon: true,
  numTeams: 4,
  playerTeams: "4",
  totalPlayerCount: 23,
  gameStart,
  score: 1.67,
  ...over,
});

/** Une partie comme l'API la donne. Identifiants inventés. */
const game = () =>
  ApiVictoryGame.parse({
    info: {
      config: { gameMap: "Four Islands" },
      duration: 900,
      winner: ["team", "Red", "c1"],
      players: [
        { clientID: "c1", clanTag: "GAL", publicID: "id-zoe", username: "Zoé", stats: {} },
        { clientID: "c2", clanTag: "GAL", publicID: "id-anonyme", username: "Caché", stats: {} },
        { clientID: "c3", clanTag: "UN", publicID: "id-autre", username: "Autre", stats: {} },
      ],
    },
  });

const lecture = new Date("2026-11-13T21:00:00.000Z");
const plusTard = (ms: number) => new Date(lecture.getTime() + ms);
const deux = [session("dNEW0001", "2026-11-13T20:40:00.000Z", { score: 2.24, playerTeams: "Trios" }), session("dNEW0002", "2026-11-13T19:00:00.000Z", { hasWon: false, score: -0.3, playerTeams: null })];

describe("le fichier des sessions du passage", () => {
  it("est hors de Git, sous .cache/, que .gitignore ignore", () => {
    expect(SESSIONS_DU_PASSAGE).toMatch(/^\.cache\/[\w-]+\.json$/);
    expect(readFileSync(".gitignore", "utf8").split(/\r?\n/)).toContain(".cache/");
  });

  it("ne garde que l'heure de la lecture et les sessions, sans aucun identifiant de joueur", () => {
    // La forme d'une session gardée : rien sur les joueurs. Un champ ajouté ici doit être relu avant de partir dans le fichier.
    expect(Object.keys(StoredSession.shape)).toEqual(["gameId", "clanPlayerCount", "hasWon", "numTeams", "playerTeams", "totalPlayerCount", "gameStart", "score"]);
    const avecDeTrop = { ...deux[0]!, publicID: "id-secret", username: "Zoé" } as StoredSession;
    const contenu = JSON.parse(texteDuPassage([avecDeTrop, deux[1]!], lecture)) as Record<string, unknown>;
    expect(Object.keys(contenu)).toEqual(["lecture", "sessions"]);
    expect(contenu["lecture"]).toBe("2026-11-13T21:00:00.000Z");
    expect(contenu["sessions"]).toEqual(deux);
    expect(JSON.stringify(contenu)).not.toMatch(/id-secret|Zoé/);
  });

  it("se relit à l'identique, au même passage", () => {
    expect(lireSessionsDuPassage(texteDuPassage(deux, lecture), plusTard(42_000))).toEqual({ sessions: deux, note: "sessions des dernières heures reprises de ce passage (lues il y a 42 s)" });
    expect(lireSessionsDuPassage(texteDuPassage([], lecture), lecture).sessions).toEqual([]);
  });

  it("ne sert pas s'il est absent, vide, abîmé ou d'une autre forme", () => {
    const bon = JSON.parse(texteDuPassage(deux, lecture)) as Record<string, unknown>;
    const cas: (string | null)[] = [
      null,
      "",
      "   ",
      "{",
      "null",
      "[]",
      texteDuPassage(deux, lecture).slice(0, 60),
      JSON.stringify({ sessions: bon["sessions"] }),
      JSON.stringify({ lecture: bon["lecture"] }),
      JSON.stringify({ ...bon, lecture: "hier soir" }),
      JSON.stringify({ ...bon, lecture: "2026-11-13 21:00" }),
      JSON.stringify({ ...bon, sessions: "aucune" }),
      JSON.stringify({ ...bon, sessions: [{ ...deux[0], score: "2,24" }] }),
      JSON.stringify({ ...bon, sessions: [{ gameId: "dNEW0001" }] }),
      JSON.stringify({ ...bon, autre: 1 }),
    ];
    for (const texte of cas) expect(lireSessionsDuPassage(texte, plusTard(1_000)).sessions, String(texte)).toBeNull();
    expect(lireSessionsDuPassage(null, lecture).note).toBe("pas de sessions gardées à ce passage");
    expect(lireSessionsDuPassage("{", lecture).note).toBe("sessions gardées illisibles");
  });

  it("ne sert que s'il a au plus 8 minutes, et jamais s'il est daté du futur", () => {
    expect(VALIDITE_MS).toBe(8 * 60_000);
    const texte = texteDuPassage(deux, lecture);
    expect(lireSessionsDuPassage(texte, plusTard(VALIDITE_MS)).sessions).toEqual(deux);
    expect(lireSessionsDuPassage(texte, plusTard(VALIDITE_MS + 1))).toEqual({ sessions: null, note: "sessions gardées trop vieilles (lues il y a 480 s)" });
    expect(lireSessionsDuPassage(texte, plusTard(3 * 3_600_000)).sessions).toBeNull();
    expect(lireSessionsDuPassage(texte, plusTard(-1))).toEqual({ sessions: null, note: "sessions gardées datées du futur" });
  });

  it("ne dit jamais que les statères viennent des victoires", () => {
    const texte = readFileSync("src/lib/sessions-du-passage.ts", "utf8");
    expect(texte).not.toMatch(/gagn\w* (par|pour|avec) (les|des|une|chaque) (victoires?|parties? gagnée)|pour chaque victoire|monnaie des victoires|statères des victoires|par partie gagnée/i);
  });
});

describe("garderSessionsDuPassage", () => {
  it("écrit le texte du fichier", () => {
    let ecrit = "";
    expect(garderSessionsDuPassage({ ecrire: (t) => (ecrit = t), sessions: deux, lecture, log: () => {} })).toBe(true);
    expect(ecrit).toBe(texteDuPassage(deux, lecture));
  });

  it("note une erreur d'écriture sans jamais la lever : l'envoi des images n'en dépend pas", () => {
    const lignes: string[] = [];
    const garde = () =>
      garderSessionsDuPassage({
        ecrire: () => {
          throw new Error("ENOSPC: no space left on device");
        },
        sessions: deux,
        lecture,
        log: (l) => lignes.push(l),
      });
    expect(garde).not.toThrow();
    expect(garde()).toBe(false);
    expect(lignes[0]).toBe("Victoires : sessions des dernières heures non gardées pour l'étape des statères (ENOSPC: no space left on device), elle relira l'API.");
  });
});

describe("sessionsFraichesDesStateres", () => {
  const depuisApi = [session("dAPI0001", "2026-11-13T20:50:00.000Z")];

  it("reprend les sessions du passage sans lire l'API", async () => {
    const lireApi = vi.fn(async () => depuisApi);
    const lignes: string[] = [];
    const sessions = await sessionsFraichesDesStateres({ lire: () => texteDuPassage(deux, lecture), now: plusTard(30_000), lireApi, log: (l) => lignes.push(l) });
    expect(sessions).toEqual(deux);
    expect(lireApi).not.toHaveBeenCalled();
    expect(lignes).toEqual(["Statères : sessions des dernières heures reprises de ce passage (lues il y a 30 s), sans nouvelle lecture de l'API."]);
  });

  it("relit l'API une seule fois dans tous les autres cas, sans jamais lever d'erreur", async () => {
    const texte = texteDuPassage(deux, lecture);
    const lectures: (() => string | null)[] = [
      () => null,
      () => "",
      () => texte.slice(0, 40),
      () => JSON.stringify({ lecture: lecture.toISOString(), sessions: [{}] }),
      // Un fichier qui ne se lit pas, ou un dossier à sa place.
      () => {
        throw new Error("EISDIR: illegal operation on a directory");
      },
    ];
    for (const [lire, now] of [...lectures.map((l) => [l, plusTard(1_000)] as const), [() => texte, plusTard(VALIDITE_MS + 1_000)] as const, [() => texte, plusTard(-60_000)] as const]) {
      const lireApi = vi.fn(async () => depuisApi);
      const lignes: string[] = [];
      await expect(sessionsFraichesDesStateres({ lire, now, lireApi, log: (l) => lignes.push(l) })).resolves.toEqual(depuisApi);
      expect(lireApi).toHaveBeenCalledTimes(1);
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toMatch(/^Statères : .*, les sessions des dernières heures sont lues sur l'API\.$/);
    }
  });

  it("garde la suite d'avant si l'API échoue : l'erreur notée telle quelle, rien de relu, un refus 403 pas contourné", async () => {
    // L'API refuse : une seule demande, comme avant le fichier (le client de l'API ne réessaie jamais un 403).
    const get = vi.fn(async () => new Response("{}", { status: 403 }));
    const api = new ApiClient({ fetch: get as unknown as typeof fetch, sleep: async () => {}, delayMs: 0 });
    const now = new Date("2026-11-13T21:05:00.000Z");
    const lignes: string[] = [];
    const sessions = await sessionsFraichesDesStateres({ lire: () => null, now, lireApi: () => readRecentSessions(api, "GAL", now), log: (l) => lignes.push(l) });
    expect(sessions).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
    expect(lignes[1]).toBe("Statères : sessions des dernières heures illisibles (HTTP 403 sur /clan/GAL/sessions?start=2026-11-13T15:05:00.000Z&end=2026-11-13T21:05:00.000Z&limit=50&page=1).");
    // Puis la relecture, comme avant : aucune session lisible des dernières heures, la collecte seule sert.
    expect(passSessions([session("dOLD0001", "2026-11-13T08:00:00.000Z")], sessions).warning).toContain("les sessions des dernières heures ne se lisent pas sur l'API");
  });

  it("ne parle que de sessions dans le journal, jamais de victoires ni d'un joueur", async () => {
    const lignes: string[] = [];
    const log = (l: string) => lignes.push(l);
    await sessionsFraichesDesStateres({ lire: () => texteDuPassage(deux, lecture), now: lecture, lireApi: async () => depuisApi, log });
    await sessionsFraichesDesStateres({ lire: () => "{", now: lecture, lireApi: async () => depuisApi, log });
    await sessionsFraichesDesStateres({ lire: () => texteDuPassage(deux, lecture), now: plusTard(VALIDITE_MS * 2), lireApi: async () => depuisApi, log });
    expect(lignes).toHaveLength(3);
    expect(lignes.join("\n")).not.toMatch(/victoire|id-/i);
  });
});

describe("les deux chemins des statères", () => {
  // Les sessions des dernières heures, comme l'API les donne : le format en nombre ou en texte, des parties à ne pas relire.
  const lignesApi = [
    { gameId: "fneuve01", clanTag: "GAL", clanPlayerCount: 4, hasWon: true, numTeams: 2, playerTeams: 2, totalPlayerCount: 40, gameStart: "2026-11-13T20:10:00.000Z", score: 6.26 },
    { gameId: "fneuve03", clanTag: "GAL", clanPlayerCount: 3, hasWon: true, numTeams: 6, playerTeams: null, totalPlayerCount: 18, gameStart: "2026-11-13T19:30:00.000Z", score: 1.67 },
    { gameId: "fneuve02", clanTag: "GAL", clanPlayerCount: 1, hasWon: true, numTeams: 6, playerTeams: "Trios", totalPlayerCount: 18, gameStart: "2026-11-13T19:30:00.000Z", score: 0.04 },
    { gameId: "fdefaite", clanTag: "GAL", clanPlayerCount: 2, hasWon: false, numTeams: 4, playerTeams: "4", totalPlayerCount: 23, gameStart: "2026-11-13T18:00:00.000Z", score: -0.26 },
    { gameId: "frobots1", clanTag: "GAL", clanPlayerCount: 1, hasWon: true, numTeams: 0, playerTeams: null, totalPlayerCount: 1, gameStart: "2026-11-13T17:40:00.000Z", score: 0.5 },
    { gameId: "fsanspts", clanTag: "GAL", clanPlayerCount: 2, hasWon: true, numTeams: 4, playerTeams: "4", totalPlayerCount: 23, gameStart: "2026-11-13T17:20:00.000Z", score: 0 },
    { gameId: "fnotee01", clanTag: "GAL", clanPlayerCount: 5, hasWon: true, numTeams: 4, playerTeams: "4", totalPlayerCount: 23, gameStart: "2026-11-13T17:00:00.000Z", score: 1.67 },
    { gameId: "fpartage", clanTag: "GAL", clanPlayerCount: 3, hasWon: true, numTeams: 4, playerTeams: "4", totalPlayerCount: 23, gameStart: "2026-11-13T16:00:00.000Z", score: 2.05 },
  ];
  // Les sessions de la collecte : une partie aussi lue sur l'API (la lecture la plus fraîche l'emporte), une du mois d'avant.
  const collectees = [session("fpartage", "2026-11-13T16:00:00.000Z", { score: 1 }), session("cancien1", "2026-11-12T08:00:00.000Z", { score: 1.81 }), session("cmoisavt", "2026-10-30T08:00:00.000Z")];

  const fausseApi = () => {
    const demandes: string[] = [];
    const get = async (url: string | URL | Request) => {
      demandes.push(String(url));
      return new Response(JSON.stringify({ results: lignesApi, total: lignesApi.length, page: 1, limit: 50 }), { status: 200 });
    };
    return { demandes, api: new ApiClient({ fetch: get as unknown as typeof fetch, sleep: async () => {}, delayMs: 0 }) };
  };

  /** La relecture et ce qui part au serveur, à partir des sessions des dernières heures. */
  const releve = async (fraiches: StoredSession[] | null, now: Date) => {
    const appels: { fn: string; args: Record<string, unknown> }[] = [];
    const lus: string[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      appels.push({ fn, args });
      if (fn === "stateres_parties_notees") return { ok: true, parties: ["fnotee01"] };
      const parties = args["p_parties"] as unknown[];
      return { ok: true, notees: parties.length, credits: parties.length * 2 };
    };
    const { sessions } = passSessions(collectees, fraiches);
    const resultat = await releveStateres({ rpc, sessions, readGame: async (id) => (lus.push(id), game()), now, tag: "GAL", log: () => {} });
    return { appels, lus, resultat };
  };

  it("donnent les mêmes parties, les mêmes montants, dans le même ordre, avec une lecture de l'API en moins", async () => {
    // L'étape des victoires lit à 21 h ; celle des statères démarre 1 min 35 plus tard, au même passage.
    const lectureVictoires = new Date("2026-11-13T21:00:00.000Z");
    const now = new Date("2026-11-13T21:01:35.000Z");

    // Avant : chaque étape lit l'API.
    const avant = fausseApi();
    await readRecentSessions(avant.api, "GAL", lectureVictoires);
    const parApi = await sessionsFraichesDesStateres({ lire: () => null, now, lireApi: () => readRecentSessions(avant.api, "GAL", now), log: () => {} });
    const cheminApi = await releve(parApi, now);

    // Maintenant : l'étape des victoires lit l'API et garde ce qu'elle a lu ; celle des statères le reprend.
    const maintenant = fausseApi();
    let disque: string | null = null;
    const lues = await readRecentSessions(maintenant.api, "GAL", lectureVictoires);
    expect(garderSessionsDuPassage({ ecrire: (t) => (disque = t), sessions: lues, lecture: lectureVictoires, log: () => {} })).toBe(true);
    const lireApi = vi.fn(() => readRecentSessions(maintenant.api, "GAL", now));
    const parFichier = await sessionsFraichesDesStateres({ lire: () => disque, now, lireApi, log: () => {} });
    const cheminFichier = await releve(parFichier, now);

    expect(lireApi).not.toHaveBeenCalled();
    expect(avant.demandes).toHaveLength(2);
    expect(maintenant.demandes).toHaveLength(1);
    expect(parFichier).toEqual(parApi);
    // Les mêmes demandes au serveur, dans le même ordre, et les mêmes détails relus.
    expect(cheminFichier).toEqual(cheminApi);

    // Et ce qui part n'est pas vide : les parties qui ont rapporté des points, pas encore notées, des plus récentes aux plus
    // anciennes, avec les points de la lecture la plus fraîche.
    expect(cheminApi.lus).toEqual(["fneuve01", "fneuve02", "fneuve03", "fpartage", "cancien1"]);
    expect(cheminApi.appels.map((a) => a.fn)).toEqual(["stateres_parties_notees", "noter_victoires_stateres"]);
    const envoyees = cheminApi.appels[1]!.args["p_parties"] as PartieNotee[];
    expect(envoyees.map((p) => [p.partie, p.debut, p.points, p.gaulois])).toEqual([
      ["fneuve01", "2026-11-13T20:10:00.000Z", 6.26, 4],
      ["fneuve02", "2026-11-13T19:30:00.000Z", 0.04, 1],
      ["fneuve03", "2026-11-13T19:30:00.000Z", 1.67, 3],
      ["fpartage", "2026-11-13T16:00:00.000Z", 2.05, 3],
      ["cancien1", "2026-11-12T08:00:00.000Z", 1.81, 3],
    ]);
    // 30 statères par point rapporté au clan, à chaque Gaulois présent.
    expect(envoyees.map((p) => stateresDeVictoire(p.points, p.gaulois))).toEqual([188, 1, 50, 62, 54]);
    expect(cheminApi.resultat).toEqual({ notees: 5, credits: 10, restantes: 0 });
    expect(JSON.stringify(cheminFichier.appels)).not.toMatch(/id-zoe|id-anonyme/);
  });
});

describe("le workflow des victoires", () => {
  const yml = readFileSync(".github/workflows/victoires.yml", "utf8");
  const jobs = yml.slice(yml.search(/^jobs:/m));

  it("lance les deux étapes dans le même job, les victoires d'abord : le fichier passe de l'une à l'autre", () => {
    expect([...jobs.matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1])).toEqual(["envoyer"]);
    const victoires = jobs.indexOf("run: npm run victoires:envoyer");
    expect(victoires).toBeGreaterThan(0);
    expect(jobs.indexOf("run: npm run stateres:crediter")).toBeGreaterThan(victoires);
  });

  it("ne garde pas le fichier dans son cache : il ne passe jamais d'un passage à l'autre", () => {
    expect(yml).not.toContain("sessions-du-passage");
    expect([...yml.matchAll(/^\s+path: (.+?)\s*$/gm)].map((m) => m[1])).toEqual([".cache/victoires-envoi.json", ".cache/victoires-envoi.json"]);
  });
});
