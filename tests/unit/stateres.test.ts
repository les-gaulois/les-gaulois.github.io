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
  it("donne à chaque Gaulois présent tous les points rapportés au clan, 60 statères par point, sans partage", () => {
    // Le pilote, 13 novembre 2026 au soir : « 30 par point » (d'abord 10) ; le 27 novembre 2026 : « double la somme
    // apportée lors des points sur OpenFront », 60 par point, sous un nouveau nom de règle.
    expect(STATERES_PAR_POINT).toBe(60);
    expect(REGLE_STATERES).toBe("entier-60");
    expect(stateresDeVictoire(1.67, 5)).toBe(100);
    expect(stateresDeVictoire(1.67, 1)).toBe(100);
    expect(stateresDeVictoire(6.26, 7)).toBe(376);
    expect(stateresDeVictoire(2, 3)).toBe(120);
    expect(stateresDeVictoire(1, 13)).toBe(60);
  });

  it("arrondit sur l'écriture décimale, une demie vers le haut, comme Postgres", () => {
    // 1,025 × 60 = 61,5 : 62, là où Math.round(1.025 * 60) donne 61 (le calcul en virgule flottante fait 61,49999…).
    expect(Math.round(1.025 * 60)).toBe(61);
    expect(stateresDeVictoire(1.025, 1)).toBe(62);
    expect(Math.round(4.225 * 60)).toBe(253);
    expect(stateresDeVictoire(4.225, 1)).toBe(254);
    expect(Math.round(8.325 * 60)).toBe(499);
    expect(stateresDeVictoire(8.325, 1)).toBe(500);
    expect(stateresDeVictoire(2.05, 1)).toBe(123);
    expect(stateresDeVictoire(16.65, 1)).toBe(999);
    expect(stateresDeVictoire(1.65, 1)).toBe(99);
    expect(stateresDeVictoire(0.15, 1)).toBe(9);
    expect(stateresDeVictoire(0.025, 1)).toBe(2);
    expect(stateresDeVictoire(2.25, 1)).toBe(135);
    expect(stateresDeVictoire(1.005, 1)).toBe(60);
    expect(stateresDeVictoire(0.3333333333333333, 1)).toBe(20);
    expect(stateresDeVictoire(0.6666666666666666, 1)).toBe(40);
    expect(stateresDeVictoire(99.94, 1)).toBe(5996);
    expect(stateresDeVictoire(6.71, 13)).toBe(403);
  });

  it("donne au moins 1 statère à une partie qui rapporte des points", () => {
    expect(stateresDeVictoire(0.008, 2)).toBe(1);
    expect(stateresDeVictoire(0.0083, 1)).toBe(1);
    expect(stateresDeVictoire(0.0084, 1)).toBe(1);
    expect(stateresDeVictoire(0.01, 1)).toBe(1);
    expect(stateresDeVictoire(0.04, 2)).toBe(2);
    expect(stateresDeVictoire(0.05, 1)).toBe(3);
    expect(stateresDeVictoire(1e-7, 1)).toBe(1);
  });

  it("reste dans les bornes du serveur : moins de 1 000 points, moins de 60 001 statères, bien sous le million du journal", () => {
    expect(stateresDeVictoire(999.99, 200)).toBe(59999);
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
    "supabase/migrations/20261127000100_stateres_60_par_point.sql",
    ".github/workflows/victoires.yml",
    "src/pages/confidentialite.astro",
  ];
  it("disent « points rapportés au clan », jamais des statères gagnés par les victoires", () => {
    for (const f of fichiers) {
      const texte = readFileSync(f, "utf8");
      expect(texte, f).not.toMatch(/gagn\w* (par|pour|avec) (les|des|une|chaque) (victoires?|parties? gagnée)|pour chaque victoire|monnaie des victoires|statères des victoires|par partie gagnée/i);
    }
    expect(readFileSync("supabase/migrations/20261113001800_village_stateres.sql", "utf8")).toContain("points rapportés au clan");
    // « 60 par point » (le pilote, 27 novembre 2026) : le chiffre est le même partout, et les anciens 10 et 30 ont disparu
    // de ce qui décrit la règle en vigueur. La migration du 13 novembre, figée, garde son 30 : la nouvelle la remplace.
    for (const f of ["src/lib/stateres.ts", "scripts/crediter-stateres.ts", "supabase/migrations/20261127000100_stateres_60_par_point.sql", ".github/workflows/victoires.yml"]) {
      const texte = readFileSync(f, "utf8");
      expect(texte, f).toContain("60 statères par point rapporté au clan");
      expect(texte, f).not.toMatch(/\b(10|30) statères par point rapporté au clan|vaut (10|30) statères/);
    }
    const ancienne = readFileSync("supabase/migrations/20261113001800_village_stateres.sql", "utf8");
    expect(ancienne).toContain("round(p_points * 30)");
    expect(ancienne).toContain("'entier-30'::text");
    const nouvelle = readFileSync("supabase/migrations/20261127000100_stateres_60_par_point.sql", "utf8");
    expect(nouvelle).toContain("round(p_points * 60)");
    expect(nouvelle).toContain("'entier-60'::text");
    // Rien n'est effacé ni recalculé : elle n'écrit qu'une ligne de journal et une ligne de rattrapage par compte, et ne
    // change ensuite que l'heure où le message a été vu.
    const code = nouvelle.replace(/\r\n/g, "\n").split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(code.replace(/on delete cascade/g, "")).not.toMatch(/\b(drop|delete|truncate)\b/i);
    expect(code.match(/\binsert into [\w.]+/g)).toEqual(["insert into internal.stateres_mouvements", "insert into internal.stateres_points_doubles"]);
    expect(code.match(/\bupdate [\w.]+ set \w+/g)).toEqual(["update internal.stateres_points_doubles set vu_le"]);
    expect(code).toContain("values (u.user_id, 'points_doubles', u.total, 'novembre-2026')");
    expect(code).toContain("m.nature = 'victoire'\n      and m.regle = 'entier-30'");
    // Le déclencheur du mode GOD : celui de 20261122002000, mot pour mot, avec la seule nature 'points_doubles' en plus.
    const declencheur = (t: string) => {
      const x = t.replace(/\r\n/g, "\n");
      const debut = x.indexOf("create or replace function internal.village_god_mouvement()");
      return x.slice(debut, x.indexOf("end $$;", debut));
    };
    const avant = declencheur(readFileSync("supabase/migrations/20261122002000_duel_tableau_et_saison.sql", "utf8"));
    expect(avant).toContain("'duel_saison') then return new;");
    expect(declencheur(nouvelle)).toBe(avant.replace("'duel_saison') then return new;", "'duel_saison', 'points_doubles') then return new;"));
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
    // 1,67 point puis 0,04 point : 100 et 2 statères.
    expect(lines.join("\n")).toContain("102 statères");
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
