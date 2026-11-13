import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { ApiVictoryGame, type StoredSession } from "../../src/lib/schemas";
import { debutDuMoisParis, debutDuMoisPrecedentParis, departDuGaulois, fenetreDesVictoires, REGLE_STATERES, STATERES_PAR_POINT, stateresDeVictoire } from "../../src/lib/stateres";
import { empreintesDesGaulois, MAX_ECHECS, MAX_LECTURE_MS, MAX_PARTIES, PAR_ENVOI, partieNotee, releveStateres, victoiresARelire } from "../../src/lib/stateres-releve";

const sha = (id: string) => createHash("sha256").update(id, "utf8").digest("hex");

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
        // Le même compte deux fois : une seule empreinte.
        { clientID: "c3", clanTag: "GAL", publicID: "id-zoe", username: "Zoé bis", stats: {} },
        // Sans stats : jamais apparu, pas présent.
        { clientID: "c4", clanTag: "GAL", publicID: "id-parti", username: "Parti", stats: undefined },
        // Sans compte : rien à reconnaître.
        { clientID: "c5", clanTag: "GAL", publicID: null, username: "Sans compte", stats: {} },
        // Un autre tag : pas sous le tag du clan.
        { clientID: "c6", clanTag: "UN", publicID: "id-autre", username: "Autre", stats: {} },
        { clientID: "c7", clanTag: null, publicID: "id-sans-tag", username: "Sans tag", stats: {} },
      ],
    },
  });

describe("la règle des statères", () => {
  it("donne à chaque Gaulois présent tous les points rapportés au clan, 30 statères par point, sans partage", () => {
    // Le pilote, 13 novembre 2026 au soir : « 30 par point » (d'abord 10).
    expect(STATERES_PAR_POINT).toBe(30);
    expect(REGLE_STATERES).toBe("entier-30");
    expect(stateresDeVictoire(1.67, 5)).toBe(50);
    expect(stateresDeVictoire(1.67, 1)).toBe(50);
    expect(stateresDeVictoire(6.26, 7)).toBe(188);
    expect(stateresDeVictoire(2, 3)).toBe(60);
    expect(stateresDeVictoire(1, 13)).toBe(30);
  });

  it("arrondit sur l'écriture décimale, une demie vers le haut, comme Postgres", () => {
    // 2,05 × 30 = 61,5 : 62, là où Math.round(2.05 * 30) donne 61 (le calcul en virgule flottante fait 61,49999…).
    expect(Math.round(2.05 * 30)).toBe(61);
    expect(stateresDeVictoire(2.05, 1)).toBe(62);
    expect(stateresDeVictoire(16.65, 1)).toBe(500);
    expect(stateresDeVictoire(1.65, 1)).toBe(50);
    expect(stateresDeVictoire(0.15, 1)).toBe(5);
    expect(stateresDeVictoire(2.25, 1)).toBe(68);
    expect(stateresDeVictoire(1.005, 1)).toBe(30);
    expect(stateresDeVictoire(0.3333333333333333, 1)).toBe(10);
    expect(stateresDeVictoire(0.6666666666666666, 1)).toBe(20);
    expect(stateresDeVictoire(99.94, 1)).toBe(2998);
    expect(stateresDeVictoire(6.71, 13)).toBe(201);
  });

  it("donne au moins 1 statère à une partie qui rapporte des points", () => {
    expect(stateresDeVictoire(0.04, 2)).toBe(1);
    expect(stateresDeVictoire(0.01, 1)).toBe(1);
    expect(stateresDeVictoire(0.0166, 1)).toBe(1);
    expect(stateresDeVictoire(0.0167, 1)).toBe(1);
    expect(stateresDeVictoire(0.05, 1)).toBe(2);
    expect(stateresDeVictoire(1e-7, 1)).toBe(1);
  });

  it("reste dans les bornes du serveur : moins de 1 000 points, moins de 30 001 statères", () => {
    expect(stateresDeVictoire(999.99, 200)).toBe(30000);
    expect(Number.isSafeInteger(stateresDeVictoire(999.99, 1))).toBe(true);
  });

  it("ne donne rien sans points ou sans Gaulois : une partie qui fait perdre des points ne retire rien", () => {
    expect(stateresDeVictoire(null, 3)).toBe(0);
    expect(stateresDeVictoire(0, 3)).toBe(0);
    expect(stateresDeVictoire(-0.26, 3)).toBe(0);
    expect(stateresDeVictoire(Number.NaN, 3)).toBe(0);
    expect(stateresDeVictoire(Number.POSITIVE_INFINITY, 3)).toBe(0);
    expect(stateresDeVictoire(1.67, 0)).toBe(0);
    expect(stateresDeVictoire(1.67, 1.5)).toBe(0);
  });
});

describe("les mots des statères", () => {
  // Le pilote, 13 novembre 2026 : « j'ai pas dit que statere s'obtient en partie gagner mais en point apporter au clan ! ».
  const fichiers = [
    "src/lib/stateres.ts",
    "src/lib/stateres-releve.ts",
    "scripts/crediter-stateres.ts",
    "supabase/migrations/20261113001800_village_stateres.sql",
    ".github/workflows/victoires.yml",
    "src/pages/confidentialite.astro",
  ];
  it("disent « points rapportés au clan », jamais des statères gagnés par les victoires", () => {
    for (const f of fichiers) {
      const texte = readFileSync(f, "utf8");
      expect(texte, f).not.toMatch(/gagn\w* (par|pour|avec) (les|des|une|chaque) (victoires?|parties? gagnée)|pour chaque victoire|monnaie des victoires|statères des victoires|par partie gagnée/i);
    }
    expect(readFileSync("supabase/migrations/20261113001800_village_stateres.sql", "utf8")).toContain("points rapportés au clan");
    // « 30 par point » (le pilote, 13 novembre 2026 au soir) : le chiffre est le même partout, et l'ancien 10 a disparu.
    for (const f of ["src/lib/stateres.ts", "scripts/crediter-stateres.ts", "supabase/migrations/20261113001800_village_stateres.sql", ".github/workflows/victoires.yml"]) {
      const texte = readFileSync(f, "utf8");
      expect(texte, f).toContain("30 statères par point rapporté au clan");
      expect(texte, f).not.toMatch(/\b10 (statères )?par point|vaut 10 statères/);
    }
    expect(readFileSync("supabase/migrations/20261113001800_village_stateres.sql", "utf8")).toContain("round(p_points * 30)");
    expect(readFileSync("supabase/migrations/20261113001800_village_stateres.sql", "utf8")).toContain("'entier-30'::text");
    expect(readFileSync("src/pages/confidentialite.astro", "utf8")).toContain("pour chaque partie qui a rapporté des points au clan");
    expect(readFileSync(".github/workflows/victoires.yml", "utf8")).toContain("name: Donner les statères des points rapportés au clan");
    expect(ERROR_MESSAGES["invalid_parties"]).not.toMatch(/victoire/i);
  });
});

describe("les mois à l'heure de Paris", () => {
  it("commencent à minuit à Paris, heure d'hiver et heure d'été", () => {
    expect(debutDuMoisParis("2026-11-13T21:00:00Z")).toBe("2026-10-31T23:00:00.000Z");
    expect(debutDuMoisParis("2026-07-15T12:00:00Z")).toBe("2026-06-30T22:00:00.000Z");
    // 23 h 30 à Paris le 31 octobre : encore octobre ; 0 h 30 le 1er novembre : novembre.
    expect(debutDuMoisParis("2026-10-31T22:30:00Z")).toBe("2026-09-30T22:00:00.000Z");
    expect(debutDuMoisParis("2026-10-31T23:30:00Z")).toBe("2026-10-31T23:00:00.000Z");
    expect(debutDuMoisParis("2027-01-01T00:00:00Z")).toBe("2026-12-31T23:00:00.000Z");
  });

  it("donnent le mois précédent, changement d'année compris", () => {
    expect(debutDuMoisPrecedentParis("2026-11-13T21:00:00Z")).toBe("2026-09-30T22:00:00.000Z");
    expect(debutDuMoisPrecedentParis("2027-01-05T10:00:00Z")).toBe("2026-11-30T23:00:00.000Z");
    expect(debutDuMoisPrecedentParis("2026-04-01T08:00:00Z")).toBe("2026-02-28T23:00:00.000Z");
  });

  it("font partir un Gaulois du 1er du mois de sa création", () => {
    expect(departDuGaulois("2026-11-13T21:41:24Z")).toBe("2026-10-31T23:00:00.000Z");
  });

  it("relisent tout le mois en cours, et la fin du mois d'avant pendant deux jours", () => {
    expect(fenetreDesVictoires(new Date("2026-11-13T21:00:00Z"))).toBe("2026-10-31T23:00:00.000Z");
    expect(fenetreDesVictoires(new Date("2026-11-01T00:10:00Z"))).toBe("2026-09-30T22:00:00.000Z");
    expect(fenetreDesVictoires(new Date("2026-11-03T12:00:00Z"))).toBe("2026-10-31T23:00:00.000Z");
  });
});

describe("les parties à relire", () => {
  const depuis = "2026-10-31T23:00:00.000Z";
  it("gardent les parties du mois qui ont rapporté des points, pas encore notées, des plus récentes aux plus anciennes", () => {
    const sessions = [
      session("ancienne", "2026-10-31T22:59:59.000Z"),
      session("premiere", "2026-11-01T08:00:00.000Z"),
      session("defaite", "2026-11-02T08:00:00.000Z", { hasWon: false, score: -0.3 }),
      session("robots", "2026-11-03T08:00:00.000Z", { totalPlayerCount: 1 }),
      session("sanspoint", "2026-11-04T08:00:00.000Z", { score: 0 }),
      session("notee", "2026-11-05T08:00:00.000Z"),
      session("derniere", "2026-11-06T08:00:00.000Z"),
      session("premiere", "2026-11-01T08:00:00.000Z"),
      // Des points sans partie gagnée : le relevé de novembre 2026 n'en a aucun ; si l'API en donnait un jour, il n'est pas
      // compté sans décision du pilote, pas plus qu'une partie sans Gaulois.
      session("perduepoints", "2026-11-07T08:00:00.000Z", { hasWon: false, score: 0.4 }),
      session("sansgaulois", "2026-11-08T08:00:00.000Z", { clanPlayerCount: 0 }),
    ];
    expect(victoiresARelire(sessions, depuis, new Set(["notee"])).map((s) => s.gameId)).toEqual(["derniere", "premiere"]);
  });

  it("ne gardent de la partie que les empreintes des Gaulois présents, jamais un identifiant", () => {
    const empreintes = empreintesDesGaulois(game(), "GAL");
    expect(empreintes).toEqual([sha("id-anonyme"), sha("id-zoe")].sort());
    const notee = partieNotee(session("abcd1234", "2026-11-05T08:00:00Z"), game(), "GAL");
    expect(notee).toEqual({ partie: "abcd1234", debut: "2026-11-05T08:00:00.000Z", points: 1.67, gaulois: 3, empreintes });
    expect(JSON.stringify(notee)).not.toMatch(/id-|Zoé|Caché/);
  });
});

describe("un passage de la relecture", () => {
  const now = new Date("2026-11-13T21:00:00Z");
  const appels = () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "stateres_parties_notees") return { ok: true, parties: ["deja0001"] };
      const parties = args["p_parties"] as unknown[];
      return { ok: true, notees: parties.length, credits: parties.length * 2 };
    };
    return { calls, rpc };
  };

  it("relit les parties pas encore notées et envoie leurs empreintes au serveur", async () => {
    const { calls, rpc } = appels();
    const lines: string[] = [];
    const lus: string[] = [];
    const r = await releveStateres({
      rpc,
      sessions: [session("deja0001", "2026-11-10T08:00:00Z"), session("neuve001", "2026-11-12T08:00:00Z"), session("neuve002", "2026-11-11T08:00:00Z", { score: 0.04 })],
      readGame: async (id) => (lus.push(id), game()),
      now,
      tag: "GAL",
      log: (l) => lines.push(l),
    });
    expect(lus).toEqual(["neuve001", "neuve002"]);
    expect(calls[0]).toEqual({ fn: "stateres_parties_notees", args: { p_depuis: "2026-10-31T23:00:00.000Z" } });
    expect(calls).toHaveLength(2);
    const envoyees = calls[1]!.args["p_parties"] as { partie: string; empreintes: string[] }[];
    expect(envoyees.map((p) => p.partie)).toEqual(["neuve001", "neuve002"]);
    expect(r).toEqual({ notees: 2, credits: 4, restantes: 0 });
    // 1,67 point puis 0,04 point : 50 et 1 statères.
    expect(lines.join("\n")).toContain("51 statères");
    expect(JSON.stringify(calls) + lines.join("\n")).not.toMatch(/id-zoe|id-anonyme/);
  });

  it("appelle le serveur même sans nouvelle partie, pour la relève et les Gaulois créés entre-temps", async () => {
    const { calls, rpc } = appels();
    await releveStateres({ rpc, sessions: [], readGame: async () => game(), now, tag: "GAL", log: () => {} });
    expect(calls.map((c) => c.fn)).toEqual(["stateres_parties_notees", "noter_victoires_stateres"]);
    expect(calls[1]!.args).toEqual({ p_parties: [] });
    const sansSessions: string[] = [];
    await releveStateres({ rpc, sessions: null, readGame: async () => game(), now, tag: "GAL", log: (l) => sansSessions.push(l) });
    expect(sansSessions[0]).toContain("aucune session lisible");
  });

  it("relit au plus MAX_PARTIES détails par passage, envoyés par lots de PAR_ENVOI", async () => {
    const { calls, rpc } = appels();
    const sessions = Array.from({ length: MAX_PARTIES + 7 }, (_, i) => session(`p${String(i).padStart(7, "0")}`, new Date(Date.parse("2026-11-02T00:00:00Z") + i * 60_000).toISOString()));
    const r = await releveStateres({ rpc, sessions, readGame: async () => game(), now, tag: "GAL", log: () => {} });
    const lots = calls.filter((c) => c.fn === "noter_victoires_stateres").map((c) => (c.args["p_parties"] as unknown[]).length);
    expect(lots.every((n) => n <= PAR_ENVOI)).toBe(true);
    expect(lots.reduce((a, b) => a + b, 0)).toBe(MAX_PARTIES);
    expect(r.restantes).toBe(7);
    // Les plus récentes d'abord.
    expect((calls[1]!.args["p_parties"] as { partie: string }[])[0]!.partie).toBe(`p${String(MAX_PARTIES + 6).padStart(7, "0")}`);
  });

  it("laisse une partie illisible au passage suivant, et s'arrête après MAX_ECHECS échecs", async () => {
    const { calls, rpc } = appels();
    const sessions = Array.from({ length: MAX_ECHECS + 3 }, (_, i) => session(`x${String(i).padStart(7, "0")}`, new Date(Date.parse("2026-11-02T00:00:00Z") + i * 60_000).toISOString()));
    let essais = 0;
    const r = await releveStateres({ rpc, sessions, readGame: async () => { essais++; throw new Error("HTTP 503"); }, now, tag: "GAL", log: () => {} });
    expect(essais).toBe(MAX_ECHECS);
    expect(calls[1]!.args).toEqual({ p_parties: [] });
    expect(r.restantes).toBe(MAX_ECHECS + 3);
  });

  it("ne contourne pas un refus de l'API : au premier 403, plus aucune demande, et ce qui est lu part quand même", async () => {
    const { calls, rpc } = appels();
    const sessions = Array.from({ length: 6 }, (_, i) => session(`r${String(i).padStart(7, "0")}`, new Date(Date.parse("2026-11-02T00:00:00Z") + i * 60_000).toISOString()));
    const lus: string[] = [];
    const lines: string[] = [];
    const r = await releveStateres({
      rpc,
      sessions,
      // Les deux plus récentes se lisent, la troisième est refusée.
      readGame: async (id) => {
        lus.push(id);
        if (lus.length === 3) throw new Error("HTTP 403");
        return game();
      },
      now,
      tag: "GAL",
      log: (l) => lines.push(l),
    });
    expect(lus).toHaveLength(3);
    expect((calls[1]!.args["p_parties"] as unknown[]).length).toBe(2);
    expect(r.restantes).toBe(4);
    expect(lines.some((l) => l.startsWith("::warning::") && l.includes("403"))).toBe(true);
  });

  it("arrête de lire quand le temps du passage est écoulé, et envoie ce qui est lu", async () => {
    const { calls, rpc } = appels();
    const sessions = Array.from({ length: 10 }, (_, i) => session(`t${String(i).padStart(7, "0")}`, new Date(Date.parse("2026-11-02T00:00:00Z") + i * 60_000).toISOString()));
    // Chaque détail prend 30 s sur cette fausse horloge : 4 lectures commencent avant MAX_LECTURE_MS.
    let temps = 0;
    const lines: string[] = [];
    const r = await releveStateres({
      rpc,
      sessions,
      readGame: async () => {
        temps += 30_000;
        return game();
      },
      now,
      tag: "GAL",
      log: (l) => lines.push(l),
      horloge: () => temps,
    });
    const attendues = Math.ceil(MAX_LECTURE_MS / 30_000);
    expect((calls[1]!.args["p_parties"] as unknown[]).length).toBe(attendues);
    expect(r.restantes).toBe(10 - attendues);
    expect(lines.some((l) => l.includes("temps de lecture"))).toBe(true);
  });

  it("dit « points rapportés au clan » et « parties », jamais « victoires », dans son journal", async () => {
    const { rpc } = appels();
    const lines: string[] = [];
    await releveStateres({ rpc, sessions: [session("neuve001", "2026-11-12T08:00:00Z")], readGame: async () => game(), now, tag: "GAL", log: (l) => lines.push(l) });
    await releveStateres({ rpc, sessions: null, readGame: async () => game(), now, tag: "GAL", log: (l) => lines.push(l) });
    expect(lines.join("\n")).toContain("partie(s) qui ont rapporté des points notée(s)");
    expect(lines.join("\n")).not.toMatch(/victoire/i);
  });

  it("lève une erreur si le serveur refuse : le workflow la note, l’image de la partie est déjà sur Discord", async () => {
    await expect(releveStateres({ rpc: async () => ({ ok: false, error: "invalid_parties" }), sessions: [], readGame: async () => game(), now, tag: "GAL", log: () => {} })).rejects.toThrow("stateres_parties_notees : invalid_parties");
  });
});
