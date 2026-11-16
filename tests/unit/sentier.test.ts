import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { ApiVictoryGame, type StoredSession } from "../../src/lib/schemas";
import { MAX_PARTIES, fenetreDuSentier, partiesARelire, releveDuSentier, type PartieDuSentier } from "../../src/lib/sentier-releve";
import { MISSIONS_DU_SENTIER, PALIERS_DE_LA_SAISON_1, PAS_DU_SENTIER, PRIX_PAR_RARETE, REMISE_DE_L_ETAL, SAISON_1, type MonSentier } from "../../src/lib/village/contrat";
import {
  NOMS_DES_MISSIONS,
  apresLEtal,
  apresLePalier,
  avancee,
  casesDuCalendrier,
  etatDuPalier,
  jourEnMots,
  joursRestants,
  lireMonSentier,
  lirePalierPris,
  messageDuRefusDuSentier,
  palierAtteint,
  paliersAPrendre,
  part,
  raisonEtalFerme,
  versLeSuivant,
} from "../../src/lib/village/sentier";
import { OBJETS } from "../../src/lib/gaulois";

const MIGRATION = readFileSync("supabase/migrations/20261116001100_sentier_des_gaulois.sql", "utf8");
const fonction = (nom: string, valeur: number) => new RegExp(`internal\\.${nom}\\(\\) returns integer[^$]*\\$\\$\\s*select ${valeur}\\s*\\$\\$`);

/** Un objet payant du catalogue, de cette rareté : le premier trouvé. */
function unObjet(rarete: string, saufId = ""): { emplacement: string; objet: string } {
  for (const emplacement of ["tete", "haut", "bas", "pieds", "arme"] as const) {
    for (const [id, fiche] of Object.entries(OBJETS[emplacement])) if (!fiche.gratuit && fiche.rarete === rarete && id !== saufId) return { emplacement, objet: id };
  }
  throw new Error(`aucun objet ${rarete}`);
}
const commun = unObjet("commun");
const peuCommun = unObjet("peu-commun");

const reponse = (plus: Record<string, unknown> = {}): Record<string, unknown> => ({
  ok: true,
  peut_avancer: true,
  solde: 400,
  jour: "2026-11-20",
  releve: "2026-11-20T13:05:00+00:00",
  regles: { mission: 10, visite: 5, semaine: 30, tous_les: 7, defi: 30, remise: 30 },
  saison: { ...SAISON_1 },
  pas: 65,
  paliers: PALIERS_DE_LA_SAISON_1.map((rarete, i) => ({ palier: i + 1, rarete, pris: i === 0 ? commun : null })),
  visites: 3,
  missions: [
    { code: "partie", fait: 1, cible: 1, gagnee: true },
    { code: "points_3", fait: 1.78, cible: 3, gagnee: false },
    { code: "equipe", fait: 0, cible: 1, gagnee: false },
  ],
  defi: { cible: 85, points: 42.7, joue: true, gagne: false },
  etal: { ...peuCommun, rarete: "peu-commun", prix: 175, prix_boutique: 250, possede: false },
  ...plus,
});
const lu = (plus: Record<string, unknown> = {}): MonSentier => {
  const sentier = lireMonSentier(reponse(plus));
  if (!sentier) throw new Error("réponse illisible");
  return sentier;
};

describe("les règles du sentier, les mêmes que le serveur", () => {
  it("les pas de chaque source et la remise de l'étal", () => {
    expect(MIGRATION).toMatch(fonction("sentier_pas_mission", PAS_DU_SENTIER.mission));
    expect(MIGRATION).toMatch(fonction("sentier_pas_visite", PAS_DU_SENTIER.visite));
    expect(MIGRATION).toMatch(fonction("sentier_pas_semaine", PAS_DU_SENTIER.semaine));
    expect(MIGRATION).toMatch(fonction("sentier_pas_defi", PAS_DU_SENTIER.defi));
    expect(MIGRATION).toMatch(fonction("sentier_remise", REMISE_DE_L_ETAL));
    expect(MIGRATION).toContain(`'tous_les', ${PAS_DU_SENTIER.tous_les},`);
    expect(MIGRATION).toContain(`v_visites % ${PAS_DU_SENTIER.tous_les} = 0`);
  });

  it("les sept missions, dont trois faciles, chacune avec ses mots", () => {
    const codes = [...MIGRATION.matchAll(/^\s+\('([a-z_0-9]+)', (true|false)\),?$/gm)].map((m) => ({ code: m[1], facile: m[2] === "true" }));
    expect(codes.map((c) => c.code)).toEqual([...MISSIONS_DU_SENTIER]);
    expect(codes.filter((c) => c.facile).map((c) => c.code)).toEqual(["partie", "vocal", "pochette"]);
    for (const code of MISSIONS_DU_SENTIER) {
      expect(NOMS_DES_MISSIONS[code].length).toBeGreaterThan(10);
      // Chaque mission a son calcul au serveur.
      expect(MIGRATION).toContain(`when '${code}' then`);
    }
  });

  it("jamais « victoire » dans les mots d'une mission : des points rapportés au clan", () => {
    for (const nom of Object.values(NOMS_DES_MISSIONS)) expect(nom.toLowerCase()).not.toMatch(/victoire|gagn/);
  });

  it("la première saison et la rareté de chacun de ses trente paliers", () => {
    expect(MIGRATION).toContain(`('${SAISON_1.id}', '${SAISON_1.nom}', date '${SAISON_1.debut}', date '${SAISON_1.fin}', ${SAISON_1.paliers}, ${SAISON_1.pas_par_palier})`);
    const bloc = MIGRATION.slice(MIGRATION.indexOf("<paliers-saison-1>"), MIGRATION.indexOf("</paliers-saison-1>"));
    const paliers = [...bloc.matchAll(/\('saison-1', (\d+), '([a-z-]+)'\)/g)].map((m) => ({ palier: Number(m[1]), rarete: m[2] }));
    expect(paliers).toEqual(PALIERS_DE_LA_SAISON_1.map((rarete, i) => ({ palier: i + 1, rarete })));
    expect(PALIERS_DE_LA_SAISON_1).toHaveLength(SAISON_1.paliers);
    expect(PALIERS_DE_LA_SAISON_1.at(-1)).toBe("legendaire");
  });

  it("un palier ne donne qu'une rareté qui a un prix à la boutique : jamais le divin", () => {
    for (const rarete of PALIERS_DE_LA_SAISON_1) expect(PRIX_PAR_RARETE).toHaveProperty(rarete);
    expect(PALIERS_DE_LA_SAISON_1).not.toContain("divin");
  });

  it("ne donne aucun statère : le sentier n'écrit au journal que l'achat de l'étal", () => {
    const ecritures = [...MIGRATION.matchAll(/insert into internal\.stateres_mouvements/g)];
    expect(ecritures).toHaveLength(0);
    expect([...MIGRATION.matchAll(/internal\.village_debiter\(v_uid, '([a-z_]+)'/g)].map((m) => m[1])).toEqual(["achat"]);
  });

  it("chaque refus a son message en français", () => {
    const codes = new Set([...MIGRATION.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    expect(codes.size).toBeGreaterThan(8);
    expect([...codes].filter((code) => !(code in ERROR_MESSAGES))).toEqual([]);
  });

  it("chaque fonction ferme ses droits, et les trois des membres ne s'ouvrent qu'aux comptes connectés", () => {
    const creees = [...MIGRATION.matchAll(/create or replace function ((?:internal|public)\.[a-z_]+)\(/g)].map((m) => m[1]!);
    expect(creees).toHaveLength(26);
    for (const nom of creees) expect(MIGRATION, nom).toMatch(new RegExp(`revoke all on function ${nom.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
    const ouvertes = [...MIGRATION.matchAll(/grant execute on function (public\.[a-z_]+)\([^)]*\) to ([a-z_]+);/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(ouvertes.sort()).toEqual(["public.acheter_a_l_etal authenticated", "public.get_mon_sentier authenticated", "public.noter_parties_sentier service_role", "public.prendre_palier authenticated", "public.sentier_parties_notees service_role"]);
  });
});

describe("la lecture du sentier", () => {
  it("lit une réponse du contrat", () => {
    const s = lu();
    expect(s.saison?.id).toBe("saison-1");
    expect(s.paliers).toHaveLength(30);
    expect(s.paliers[0]?.pris).toEqual(commun);
    expect(s.missions.map((m) => m.code)).toEqual(["partie", "points_3", "equipe"]);
    expect(s.defi).toEqual({ cible: 85, points: 42.7, joue: true, gagne: false });
    expect(s.etal?.prix).toBe(175);
  });

  it("refuse une réponse mal formée, plutôt que de montrer des pas faux", () => {
    expect(lireMonSentier(null)).toBeNull();
    expect(lireMonSentier({ ok: false, error: "suspended" })).toBeNull();
    expect(lireMonSentier(reponse({ pas: -1 }))).toBeNull();
    expect(lireMonSentier(reponse({ pas: "65" }))).toBeNull();
    expect(lireMonSentier(reponse({ jour: "20 novembre" }))).toBeNull();
    expect(lireMonSentier(reponse({ regles: { mission: 10 } }))).toBeNull();
    expect(lireMonSentier(reponse({ paliers: [{ palier: 2, rarete: "commun", pris: null }] }))).toBeNull();
    expect(lireMonSentier(reponse({ paliers: [{ palier: 1, rarete: "divin", pris: null }] }))).toBeNull();
    expect(lireMonSentier(reponse({ saison: { id: "x" } }))).toBeNull();
  });

  it("lit une saison finie dont les paliers se prennent encore, et une saison d'un serveur d'avant ces champs", () => {
    const finie = lu({ jour: "2027-01-02", saison: { ...SAISON_1, finie: true, prendre_jusqu_au: "2027-01-07" }, missions: [], defi: null });
    expect(finie.saison?.finie).toBe(true);
    expect(finie.saison?.prendre_jusqu_au).toBe("2027-01-07");
    expect(paliersAPrendre(finie)).toBe(1);
    expect(lu().saison).toMatchObject({ finie: false, prendre_jusqu_au: null });
    expect(MIGRATION).toMatch(/sentier_delai\(\) returns integer[^$]*\$\$\s*select 7\s*\$\$/);
  });

  it("lit le sentier hors saison : rien que l'étal", () => {
    const s = lu({ saison: null, pas: 0, paliers: [], visites: 0, missions: [], defi: null });
    expect(s.saison).toBeNull();
    expect(paliersAPrendre(s)).toBe(0);
    expect(s.etal).not.toBeNull();
  });

  it("ignore une mission inconnue, cache un défi ou un étal illisible", () => {
    const s = lu({ missions: [{ code: "danser", fait: 0, cible: 1, gagnee: false }, { code: "vocal", fait: 1, cible: 1, gagnee: true }], defi: { cible: 0 }, etal: { emplacement: "tete", objet: "inconnu-au-catalogue", rarete: "commun", prix: 70, prix_boutique: 100, possede: false } });
    expect(s.missions.map((m) => m.code)).toEqual(["vocal"]);
    expect(s.defi).toBeNull();
    expect(s.etal).toBeNull();
  });

  it("refuse un étal plus cher qu'à la boutique", () => {
    expect(lu({ etal: { ...peuCommun, rarete: "peu-commun", prix: 300, prix_boutique: 250, possede: false } }).etal).toBeNull();
  });

  it("lit un palier pris, et refuse un objet hors du catalogue", () => {
    expect(lirePalierPris({ ok: true, palier: 2, objet: { ...commun, rarete: "commun", double: false } })).toEqual({ ok: true, palier: 2, objet: { ...commun, rarete: "commun", double: false } });
    expect(lirePalierPris({ ok: true, palier: 2, objet: { emplacement: "tete", objet: "inconnu", rarete: "commun", double: false } })).toBeNull();
    expect(lirePalierPris({ ok: false, error: "deja_pris" })).toBeNull();
  });
});

describe("les calculs de l'écran", () => {
  it("le palier atteint et ce qui reste avant le suivant", () => {
    expect(palierAtteint(0, SAISON_1)).toBe(0);
    expect(palierAtteint(29, SAISON_1)).toBe(0);
    expect(palierAtteint(30, SAISON_1)).toBe(1);
    expect(palierAtteint(65, SAISON_1)).toBe(2);
    expect(palierAtteint(5000, SAISON_1)).toBe(30);
    expect(versLeSuivant(65, SAISON_1)).toEqual({ palier: 3, fait: 5, cible: 30, reste: 25 });
    expect(versLeSuivant(900, SAISON_1)).toBeNull();
  });

  it("l'état de chaque palier et le nombre d'objets qui attendent", () => {
    const s = lu();
    expect(etatDuPalier(s.paliers[0]!, 2)).toBe("pris");
    expect(etatDuPalier(s.paliers[1]!, 2)).toBe("a-prendre");
    expect(etatDuPalier(s.paliers[2]!, 2)).toBe("ferme");
    expect(paliersAPrendre(s)).toBe(1);
    const apres = apresLePalier(s, { ok: true, palier: 2, objet: { emplacement: "tete", objet: "x", rarete: "commun", double: false } });
    expect(paliersAPrendre(apres)).toBe(0);
    expect(s.paliers[1]?.pris).toBeNull();
  });

  it("le calendrier : la rangée de sept, pleine au septième jour, neuve le lendemain", () => {
    expect(casesDuCalendrier(0, 7)).toEqual({ cochees: 0, cases: 7 });
    expect(casesDuCalendrier(3, 7)).toEqual({ cochees: 3, cases: 7 });
    expect(casesDuCalendrier(7, 7)).toEqual({ cochees: 7, cases: 7 });
    expect(casesDuCalendrier(8, 7)).toEqual({ cochees: 1, cases: 7 });
    expect(casesDuCalendrier(14, 7)).toEqual({ cochees: 7, cases: 7 });
  });

  it("les mots : avancée, jours, part", () => {
    expect(avancee({ fait: 1, cible: 3 })).toBe("1 sur 3");
    expect(avancee({ fait: 1.78, cible: 3 })).toBe("1,78 sur 3");
    expect(avancee({ fait: 0, cible: 1 })).toBeNull();
    expect(jourEnMots("2026-12-31")).toBe("31 décembre");
    expect(jourEnMots("2027-01-01")).toBe("1er janvier");
    expect(joursRestants("2026-12-31", "2026-12-31")).toBe(1);
    expect(joursRestants("2026-11-17", "2026-12-31")).toBe(45);
    expect(part(1, 3)).toBe(33);
    expect(part(9, 3)).toBe(100);
    expect(part(1, 0)).toBe(0);
  });

  it("l'étal : pourquoi il ne s'achète pas, et ce qu'il devient une fois acheté", () => {
    const s = lu();
    expect(raisonEtalFerme(s, s.etal!)).toBeNull();
    expect(raisonEtalFerme({ ...s, solde: 100 }, s.etal!)).toContain("75");
    expect(raisonEtalFerme({ ...s, peut_avancer: false }, s.etal!)).not.toBeNull();
    const apres = apresLEtal(s, 225);
    expect(apres.solde).toBe(225);
    expect(raisonEtalFerme(apres, apres.etal!)).toBe("Vous avez déjà cet objet.");
  });

  it("le prix de l'étal aux prix de départ : 30 pour cent de moins, au statère du dessus", () => {
    const etal = (prix: number) => Math.ceil((prix * (100 - REMISE_DE_L_ETAL)) / 100);
    expect(Object.values(PRIX_PAR_RARETE).map(etal)).toEqual([70, 175, 350, 700, 1750]);
  });

  it("les mots des refus", () => {
    for (const code of ["mode_god", "saison_fermee", "unknown_palier", "palier_pas_atteint", "deja_pris", "etal_change", "prix_change", "not_validated", "no_gaulois", "deja_possede"]) {
      expect(messageDuRefusDuSentier(code), code).not.toBe("Une erreur inattendue est survenue.");
    }
    expect(messageDuRefusDuSentier("solde_insuffisant", { manque: 75 })).toContain("75");
  });
});

describe("la relecture des parties sans point", () => {
  const session = (gameId: string, gameStart: string, over: Partial<StoredSession> = {}): StoredSession => ({ gameId, clanPlayerCount: 3, hasWon: false, numTeams: 4, playerTeams: "4", totalPlayerCount: 23, gameStart, score: -0.3, ...over });
  const game = () =>
    ApiVictoryGame.parse({
      info: {
        config: { gameMap: "Four Islands" },
        duration: 900,
        winner: ["team", "Red", "c3"],
        players: [
          { clientID: "c1", clanTag: "GAL", publicID: "id-zoe", username: "Zoé", stats: {} },
          { clientID: "c3", clanTag: "UN", publicID: "id-autre", username: "Autre", stats: {} },
        ],
      },
    });
  const now = new Date("2026-11-20T13:00:00.000Z");

  it("part d'hier à minuit, à Paris", () => {
    expect(fenetreDuSentier(now)).toBe("2026-11-18T23:00:00.000Z");
  });

  it("garde les parties perdues ou sans point contre des joueurs, pas celles qui rapportent des points ni celles d'avant", () => {
    const sessions = [
      session("perdue01", "2026-11-20T10:00:00.000Z"),
      session("gagnee01", "2026-11-20T11:00:00.000Z", { hasWon: true, score: 1.78 }),
      session("gagnee00", "2026-11-20T11:30:00.000Z", { hasWon: true, score: 0 }),
      session("robots01", "2026-11-20T12:00:00.000Z", { totalPlayerCount: 1 }),
      session("vieille1", "2026-11-18T10:00:00.000Z"),
      session("notee001", "2026-11-19T10:00:00.000Z"),
      session("perdue01", "2026-11-20T10:00:00.000Z"),
    ];
    expect(partiesARelire(sessions, fenetreDuSentier(now), new Set(["notee001"])).map((s) => s.gameId)).toEqual(["gagnee00", "perdue01"]);
  });

  it("envoie l'empreinte des Gaulois, jamais leur identifiant, et appelle le serveur même sans partie", async () => {
    const appels: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      appels.push({ fn, args });
      return fn === "sentier_parties_notees" ? { ok: true, parties: [] } : { ok: true, notees: (args["p_parties"] as unknown[]).length };
    };
    const lignes: string[] = [];
    const r = await releveDuSentier({ rpc, sessions: [session("perdue01", "2026-11-20T10:00:00.000Z")], readGame: async () => game(), now, tag: "GAL", log: (l) => lignes.push(l) });
    expect(r).toEqual({ notees: 1, restantes: 0 });
    const envoi = appels.find((a) => a.fn === "noter_parties_sentier")!.args["p_parties"] as PartieDuSentier[];
    expect(envoi).toHaveLength(1);
    expect(Object.keys(envoi[0]!).sort()).toEqual(["debut", "empreintes", "partie"]);
    expect(envoi[0]!.empreintes).toHaveLength(1);
    expect(envoi[0]!.empreintes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(appels) + lignes.join("")).not.toContain("id-zoe");

    appels.length = 0;
    await releveDuSentier({ rpc, sessions: [], readGame: async () => game(), now, tag: "GAL", log: () => {} });
    expect(appels.map((a) => a.fn)).toEqual(["sentier_parties_notees", "noter_parties_sentier"]);
  });

  it("s'arrête au premier refus de l'API, sans le contourner, et ne lit jamais plus que sa part", async () => {
    let lectures = 0;
    const rpc = async (fn: string) => (fn === "sentier_parties_notees" ? { ok: true, parties: [] } : { ok: true, notees: 0 });
    const sessions = Array.from({ length: MAX_PARTIES + 20 }, (_, i) => session(`perdue${String(i).padStart(3, "0")}`, `2026-11-20T10:${String(i % 60).padStart(2, "0")}:00.000Z`));
    const r = await releveDuSentier({
      rpc,
      sessions,
      readGame: async () => {
        lectures++;
        if (lectures === 3) throw new Error("HTTP 403 Forbidden");
        return game();
      },
      now,
      tag: "GAL",
      log: () => {},
    });
    expect(lectures).toBe(3);
    expect(r.restantes).toBe(sessions.length - 2);

    lectures = 0;
    await releveDuSentier({ rpc, sessions, readGame: async () => (lectures++, game()), now, tag: "GAL", log: () => {} });
    expect(lectures).toBe(MAX_PARTIES);
  });

  it("lève une erreur si le serveur refuse", async () => {
    await expect(releveDuSentier({ rpc: async () => ({ ok: false, error: "invalid_parties" }), sessions: [], readGame: async () => game(), now, tag: "GAL", log: () => {} })).rejects.toThrow("invalid_parties");
  });
});
