/**
 * Le tableau des duellistes et la saison du duel (migration 20261122002000_duel_tableau_et_saison, règle :
 * src/lib/village/tableau-duel.ts, contrat : src/lib/village/contrat-tableau.ts) :
 * - la règle en TypeScript (duels retenus, attendu, note, partage) ;
 * - le serveur, sur le banc PGlite de toutes les migrations, comparé au TypeScript sur des relevés tirés au hasard ;
 * - l'insigne de la semaine, le partage de la cagnotte sans créer un statère (mode GOD compris), le réveil, les restes ;
 * - l'écran (lecture de la réponse, mots), les droits, le fichier à coller.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jourAParis } from "../../supabase/functions/code-discord/duel/contenu/rotation";
import { ATTENDU, NOM, texteAColler } from "../../scripts/a-coller-duel-saison";
import { hasardDEssai } from "../../src/lib/village/essai-duel";
import { lireLeTableau, lireMesInsignes } from "../../src/lib/village/contrat-tableau";
import { COTE_DE_L_INSIGNE_DU_DUEL, INSIGNE_DU_DUEL, casesDeLInsigneDuDuel } from "../../src/lib/village/insigne-du-duel";
import { compte, debutDeLaSemaine, jourEnLettres, jourEtHeure, rangCourt, rangEnMots, semaineDe } from "../../src/lib/village/ecran-tableau";
import { REGLES_DU_TABLEAU, attendus, classer, partageDeLaCagnotte, retenus, tableauDeLaSaison, tableauDeLaSemaine, type ResultatDuTableau } from "../../src/lib/village/tableau-duel";
import { baseDeTest, commeMembre, migrations, nouveauMembre } from "./banc-pglite";

const LONG = 120_000;

/* ---------- La règle en TypeScript ---------- */

const res = (o: Partial<ResultatDuTableau> & Pick<ResultatDuTableau, "joueur" | "adversaire" | "r" | "ordre">): ResultatDuTableau => ({ type: "defense", jour: 0, semaine: 0, ...o });

describe("la règle du tableau", () => {
  it("ne retient qu'un duel par jour contre un même adversaire, et deux par semaine", () => {
    const l = [
      res({ joueur: "a", adversaire: "membre:x", r: 1, ordre: 1, jour: 1 }),
      res({ joueur: "a", adversaire: "membre:x", r: 0, ordre: 2, jour: 1 }), // le même jour : pas retenu
      res({ joueur: "a", adversaire: "membre:x", r: 1, ordre: 3, jour: 2, type: "salle" }), // en salle, c'est le même adversaire
      res({ joueur: "a", adversaire: "membre:x", r: 1, ordre: 4, jour: 3 }), // le troisième de la semaine : pas retenu
      res({ joueur: "a", adversaire: "membre:x", r: 1, ordre: 5, jour: 8, semaine: 1 }), // une autre semaine
      res({ joueur: "b", adversaire: "membre:x", r: 0, ordre: 6, jour: 1 }),
    ];
    expect(retenus(l).map((x) => x.ordre)).toEqual([1, 3, 5, 6]);
    // l'ordre de fin décide, pas l'ordre de la liste
    expect(retenus([...l].reverse()).map((x) => x.ordre)).toEqual([1, 3, 5, 6]);
  });

  it("donne peu pour battre qui tout le monde bat, et beaucoup pour battre qui personne ne bat", () => {
    const tous: ResultatDuTableau[] = [];
    let o = 0;
    for (let i = 0; i < 30; i++) {
      tous.push(res({ joueur: `p${i}`, adversaire: "membre:faible", main: "base", r: 1, ordre: o++ }));
      tous.push(res({ joueur: `p${i}`, adversaire: "boss:dragon", type: "boss", r: i < 3 ? 1 : 0, ordre: o++ }));
    }
    const e = attendus(tous);
    const faible = e(res({ joueur: "z", adversaire: "membre:faible", main: "base", r: 1, ordre: 99 }));
    const dragon = e(res({ joueur: "z", adversaire: "boss:dragon", type: "boss", r: 1, ordre: 99 }));
    expect(faible).toBeGreaterThan(0.9);
    expect(dragon).toBeLessThan(0.2);
    // une main de défense changée est un autre adversaire pour l'attendu, tirée vers la moyenne des défenses
    expect(e(res({ joueur: "z", adversaire: "membre:faible", main: "autre", r: 1, ordre: 99 }))).toBeCloseTo(1, 5);
  });

  it("laisse à 50 qui fait toujours autant que prévu, quel que soit le nombre de ses duels", () => {
    // contre un adversaire qu'on bat une fois sur deux (une victoire, une défaite, des deux côtés), le joueur fait l'attendu
    for (const n of [5, 20, 60]) {
      const l: ResultatDuTableau[] = [];
      for (let i = 0; i < n; i++) l.push(res({ joueur: "a", adversaire: `boss:b${i}`, type: "boss", r: 0.5, ordre: i, jour: i }));
      const t = classer(l, l, { prudence: 10, minimum: 5 });
      expect(t[0]!.note).toBeCloseTo(50, 9);
    }
  });

  it("classe par note, puis par duels, puis par qui y est arrivé le premier, à partir du minimum", () => {
    const l: ResultatDuTableau[] = [];
    let o = 0;
    for (const [j, n] of [["a", 6], ["b", 6], ["c", 4]] as const) for (let i = 0; i < n; i++) l.push(res({ joueur: j, adversaire: `boss:${j}${i}`, type: "boss", r: 1, ordre: o++, jour: i }));
    const t = tableauDeLaSemaine(l, l);
    expect(t.map((x) => x.joueur)).toEqual(["a", "b"]);
    expect(t[0]!.note).toBe(t[1]!.note);
    expect(tableauDeLaSaison(l, l)).toEqual([]);
  });

  it("partage la cagnotte sans créer ni perdre un statère", () => {
    const alea = hasardDEssai(42);
    for (let k = 0; k < 2000; k++) {
      const cagnotte = Math.floor(alea() * 100_000), places = Math.floor(alea() * 4);
      const { parts, reste } = partageDeLaCagnotte(cagnotte, places);
      expect(parts.length).toBe(places);
      expect(parts.reduce((s, p) => s + p, 0) + reste).toBe(cagnotte);
      expect(reste).toBeGreaterThanOrEqual(0);
      if (places === 3) expect(reste).toBeLessThan(3);
    }
    expect(partageDeLaCagnotte(1001, 3)).toEqual({ parts: [500, 300, 200], reste: 1 });
    expect(partageDeLaCagnotte(1000, 1)).toEqual({ parts: [500], reste: 500 });
    expect(REGLES_DU_TABLEAU.parts.reduce((s, p) => s + p, 0)).toBe(100);
  });
});

/* ---------- Les mots de l'écran ---------- */

describe("les mots du tableau", () => {
  it("écrivent les rangs, les accords et les dates de Paris", () => {
    expect([rangCourt(1), rangCourt(2), rangCourt(27)]).toEqual(["1er", "2e", "27e"]);
    expect([rangEnMots(1), rangEnMots(5), rangEnMots(15), rangEnMots(25)]).toEqual(["premier", "cinquième", "quinzième", "25e"]);
    expect([compte(1, "duel", "duels"), compte(3, "duel", "duels")]).toEqual(["1 duel", "3 duels"]);
    expect(jourEtHeure("2026-11-24T20:30:00Z")).toBe("mardi 24 novembre, 21 h 30");
    expect(jourEtHeure("2026-12-01T20:30:00Z")).toBe("mardi 1er décembre, 21 h 30");
    expect(jourEnLettres("2026-12-28")).toBe("28 décembre");
    expect(debutDeLaSemaine("2026-11-24")).toBe("17 novembre");
  });

  it("dessinent l'insigne sur 24 cases de côté, chaque lettre avec sa couleur", () => {
    expect(INSIGNE_DU_DUEL.lignes).toHaveLength(COTE_DE_L_INSIGNE_DU_DUEL);
    for (const l of INSIGNE_DU_DUEL.lignes) {
      expect(l).toHaveLength(COTE_DE_L_INSIGNE_DU_DUEL);
      for (const c of l) if (c !== ".") expect(INSIGNE_DU_DUEL.couleurs[c], c).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(casesDeLInsigneDuDuel()).toHaveLength(COTE_DE_L_INSIGNE_DU_DUEL ** 2);
  });

  it("lisent une réponse mal formée comme rien, sans rien inventer", () => {
    expect(lireLeTableau(null)).toBeNull();
    expect(lireLeTableau({ ok: true })).toBeNull();
    expect(lireLeTableau({ ok: false, error: "duel_ferme" })).toBeNull();
    expect(lireMesInsignes({ ok: true, insignes: [{ semaine: "2026-11-24", note: 63 }, { semaine: "x" }] })).toEqual([{ semaine: "2026-11-24", note: 63 }]);
  });
});

/* ---------- Le serveur ---------- */

let db: PGlite;
const membres: string[] = [];
let horsDeLaListe: string;

/** Ce que le banc a reçu, du côté de chaque joueur, pour le TypeScript. */
const releve: (ResultatDuTableau & { t: number })[] = [];
let ordre = 0;

const BOSS = ["loup", "axolotl", "automate", "magma"];
const MAINS = [
  ["epee", "casque", "cotte-mailles", "sandales", "braies"],
  ["baton", "bonnet", "tunique", "sabots", "braies-rapiecees"],
];

/** Une partie comptée (ou non) finie à `t` (en millisecondes), commencée un peu avant. */
async function partie(joueur: string, contre: "boss" | "membre", adv: string, verdict: -1 | 0 | 1, t: number, o: { compte?: boolean; main?: string[]; fini?: boolean } = {}): Promise<void> {
  const debut = t - 30 * 60_000;
  const main = o.main ?? MAINS[0]!;
  await db.query(
    `insert into internal.duel_parties (user_id, contre, adversaire, boss, niveau, compte, jour, main_a, main_b, options_a, options_b,
       cartes_a, cartes_b, atouts_a, atouts_b, etat_a, etat_b, graine, fini, verdict, commence_le, fini_le)
     values ($1, $2, $3, $4, 'guerrier', $5, internal.duel_jour($6::timestamptz), $7, $8, '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 7, $9, $10, $6::timestamptz, $11::timestamptz)`,
    [joueur, contre, contre === "membre" ? adv : null, contre === "boss" ? adv : null, o.compte ?? true, new Date(debut).toISOString(), MAINS[0], main, o.fini ?? true, (o.fini ?? true) ? verdict : null, (o.fini ?? true) ? new Date(t).toISOString() : null],
  );
  if ((o.compte ?? true) && (o.fini ?? true) && (contre === "boss" || adv !== joueur)) {
    releve.push({ joueur, type: contre === "boss" ? "boss" : "defense", adversaire: contre === "boss" ? `boss:${adv}` : `membre:${adv}`, main: main.join(","), r: verdict === 1 ? 1 : verdict === 0 ? 0.5 : 0, jour: jourAParis(new Date(debut)), semaine: semaineDe(new Date(t)), ordre: ordre++, t });
  } else ordre++;
}

/** Un match des salles fini à `t`. */
async function match(a: string, b: string, verdict: -1 | 0 | 1, t: number, o: { essai?: boolean; fin?: string } = {}): Promise<void> {
  const debut = t - 10 * 60_000;
  await db.query(
    `insert into internal.duel_matchs (mise, essai, jour, joueur_a, joueur_b, main_a, main_b, options_a, options_b, cartes_a, cartes_b, atouts_a, atouts_b,
       etat_a, etat_b, ouverte_le, limite, graine, fini, verdict, fin, commence_le, fini_le)
     values (25, $1, internal.duel_jour($2::timestamptz), $3, $4, $5, $5, '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', $2::timestamptz, $2::timestamptz + interval '30 seconds', $6, true, $7, $8, $2::timestamptz, $9::timestamptz)`,
    [o.essai ?? false, new Date(debut).toISOString(), a, o.essai ? null : b, MAINS[0], o.essai ? 9 : null, verdict, o.fin ?? "combat", new Date(t).toISOString()],
  );
  const fin = o.fin ?? "combat";
  if (!(o.essai ?? false) && fin !== "ferme") {
    const jour = jourAParis(new Date(debut)), semaine = semaineDe(new Date(t));
    const ra: 0 | 0.5 | 1 = verdict === 1 ? 1 : verdict === 0 ? 0.5 : 0, rb: 0 | 0.5 | 1 = verdict === -1 ? 1 : verdict === 0 ? 0.5 : 0;
    // un forfait (le temps, un départ) : une défaite pour qui l'a laissé faire, rien pour l'autre ; une égalité, au combat seulement
    if (fin === "combat" || ra === 0) releve.push({ joueur: a, type: "salle", adversaire: `membre:${b}`, r: ra, jour, semaine, ordre, t });
    if (fin === "combat" || rb === 0) releve.push({ joueur: b, type: "salle", adversaire: `membre:${a}`, r: rb, jour, semaine, ordre, t });
  }
  ordre++;
}

/** Le classement du serveur pour une fenêtre, comme le TypeScript le lit. */
async function classementDuServeur(depuis: number, jusqua: number, prudence: number) {
  const r = await db.query<{ joueur: string; note: string; duels: number; victoires: number; egalites: number }>(
    "select joueur, note::text as note, duels, victoires, egalites from internal.duel_tableau_classement($1::timestamptz, $2::timestamptz, $3::numeric)",
    [new Date(depuis).toISOString(), new Date(jusqua).toISOString(), prudence],
  );
  return new Map(r.rows.map((x) => [x.joueur, { note: Number(x.note), duels: x.duels, victoires: x.victoires, egalites: x.egalites }]));
}

/** Le classement du TypeScript pour la même fenêtre : les duels retenus de tout ce qui a fini avant, puis la fenêtre. */
function classementDuTypeScript(depuis: number, jusqua: number, prudence: number) {
  const tous = releve.filter((x) => x.t < jusqua);
  const fen = retenus(tous).filter((x) => (x as (typeof releve)[number]).t >= depuis);
  return classer(fen, tous, { prudence, minimum: 0 });
}

const somme = async (): Promise<number> =>
  Number((await db.query<{ n: string }>("select ((select coalesce(sum(solde), 0) from internal.stateres_soldes) + (select coalesce(sum(montant), 0) from internal.duel_cagnottes))::text as n")).rows[0]!.n);

const PARIS_24_NOV = Date.parse("2026-11-17T20:30:00Z");

beforeAll(async () => {
  db = await baseDeTest();
  await db.query("update internal.duel_ouvert set ouvert = true, maj_le = now() where id");
  for (let i = 0; i < 9; i++) membres.push(await nouveauMembre(db));
  horsDeLaListe = await nouveauMembre(db, { valide: false });
  // trois semaines de duels tirés au hasard, de la semaine qui finit le 24 novembre à celle qui finit le 8 décembre
  const alea = hasardDEssai(2026);
  const unDe = <T,>(l: readonly T[]): T => l[Math.floor(alea() * l.length)]!;
  const verdict = (): -1 | 0 | 1 => (alea() < 0.45 ? 1 : alea() < 0.1 ? 0 : -1);
  let t = PARIS_24_NOV + 60_000;
  const tous = [...membres, horsDeLaListe];
  const enCours = new Set<string>();
  while (t < Date.parse("2026-12-08T20:00:00Z")) {
    t += Math.floor(5 + alea() * 70) * 60_000;
    const joueur = unDe(tous), x = alea();
    if (x < 0.3) await partie(joueur, "boss", unDe(BOSS), verdict(), t);
    else if (x < 0.65) await partie(joueur, "membre", unDe(tous.filter((m) => m !== joueur)), verdict(), t, { main: unDe(MAINS) });
    else if (x < 0.9) await match(joueur, unDe(tous.filter((m) => m !== joueur)), verdict(), t);
    // des forfaits : le temps ou un départ, et deux absents (égalité au temps)
    else if (x < 0.95) await match(joueur, unDe(tous.filter((m) => m !== joueur)), alea() < 0.2 ? 0 : verdict() || 1, t, { fin: alea() < 0.5 ? "temps" : "quitte" });
    // ce qui ne compte jamais : une partie pas comptée, pas finie, contre sa propre main ; un essai ; un match fermé
    else if (x < 0.96) await partie(joueur, "boss", unDe(BOSS), 1, t, { compte: false });
    else if (x < 0.97) await partie(joueur, "membre", joueur, 1, t);
    else if (x < 0.98) await match(joueur, joueur, 1, t, { essai: true });
    else if (x < 0.99) await match(joueur, unDe(tous.filter((m) => m !== joueur)), 0, t, { fin: "ferme" });
    else if (!enCours.has(joueur)) {
      // une partie pas finie (une seule à la fois par compte)
      enCours.add(joueur);
      await partie(joueur, "boss", unDe(BOSS), 1, t, { fini: false });
    }
  }
}, LONG);

afterAll(async () => {
  await db?.close();
});

describe("le tableau, au serveur", () => {
  it("a les réglages du TypeScript", async () => {
    const r = await db.query<{ poids: string; ps: string; pa: string; ms: number; ma: number; plafond: number; parts: number[] }>(
      "select internal.duel_tableau_poids()::text as poids, internal.duel_tableau_prudence(false)::text as ps, internal.duel_tableau_prudence(true)::text as pa, internal.duel_tableau_minimum(false) as ms, internal.duel_tableau_minimum(true) as ma, internal.duel_tableau_plafond() as plafond, internal.duel_tableau_parts() as parts",
    );
    const x = r.rows[0]!;
    expect([Number(x.poids), Number(x.ps), Number(x.pa), x.ms, x.ma, x.plafond, x.parts]).toEqual([
      REGLES_DU_TABLEAU.poids, REGLES_DU_TABLEAU.prudenceSemaine, REGLES_DU_TABLEAU.prudenceSaison, REGLES_DU_TABLEAU.minimumSemaine,
      REGLES_DU_TABLEAU.minimumSaison, REGLES_DU_TABLEAU.parAdversaireEtParSemaine, [...REGLES_DU_TABLEAU.parts],
    ]);
  });

  it("ne lit que les duels qui comptent, chacun du côté de chaque joueur", async () => {
    const r = await db.query<{ n: number }>("select count(*)::integer as n from internal.duel_tableau_resultats(now() + interval '1 year')");
    expect(r.rows[0]!.n).toBe(releve.length);
    expect(releve.length).toBeGreaterThan(300);
  });

  it("classe chaque semaine et la saison exactement comme le TypeScript", { timeout: LONG }, async () => {
    const fenetres: [number, number, number][] = [
      [PARIS_24_NOV, Date.parse("2026-11-24T20:30:00Z"), REGLES_DU_TABLEAU.prudenceSemaine],
      [Date.parse("2026-11-24T20:30:00Z"), Date.parse("2026-12-01T20:30:00Z"), REGLES_DU_TABLEAU.prudenceSemaine],
      [Date.parse("2026-12-01T20:30:00Z"), Date.parse("2026-12-08T20:30:00Z"), REGLES_DU_TABLEAU.prudenceSemaine],
      [Date.parse("2026-11-16T23:00:00Z"), Date.parse("2026-12-28T23:00:00Z"), REGLES_DU_TABLEAU.prudenceSaison],
      // une fenêtre qui ne suit pas les semaines : les duels retenus sont ceux de tout ce qui a fini avant
      [Date.parse("2026-11-27T11:00:00Z"), Date.parse("2026-12-03T05:00:00Z"), 7],
    ];
    for (const [depuis, jusqua, prudence] of fenetres) {
      const s = await classementDuServeur(depuis, jusqua, prudence), ts = classementDuTypeScript(depuis, jusqua, prudence);
      expect(s.size).toBe(ts.length);
      expect(s.size).toBeGreaterThan(5);
      for (const l of ts) {
        const x = s.get(l.joueur)!;
        expect(x).toBeDefined();
        expect(Math.abs(x.note - l.note)).toBeLessThan(1e-9);
        expect([x.duels, x.victoires, x.egalites]).toEqual([l.duels, l.victoires, l.egalites]);
      }
    }
  });

  it("range les lignes dans l'ordre du TypeScript, sans les comptes qui ne sont pas validés", async () => {
    const depuis = Date.parse("2026-11-24T20:30:00Z"), jusqua = Date.parse("2026-12-01T20:30:00Z");
    const r = await db.query<{ joueur: string; rang: number | null }>("select joueur, rang from internal.duel_tableau_lignes($1::timestamptz, $2::timestamptz, false) order by rang nulls last", [new Date(depuis).toISOString(), new Date(jusqua).toISOString()]);
    const tous = releve.filter((x) => x.t < jusqua);
    const ts = tableauDeLaSemaine(retenus(tous).filter((x) => (x as (typeof releve)[number]).t >= depuis), tous).filter((l) => l.joueur !== horsDeLaListe);
    expect(r.rows.filter((x) => x.rang !== null).map((x) => x.joueur)).toEqual(ts.map((l) => l.joueur));
    expect(r.rows.some((x) => x.joueur === horsDeLaListe)).toBe(false);
  });

  it("compte les semaines comme le TypeScript, de part et d'autre des changements d'heure", async () => {
    const alea = hasardDEssai(7);
    const instants = ["2026-10-25T00:59:00Z", "2026-10-27T20:29:59Z", "2026-10-27T20:30:00Z", "2027-03-30T19:29:00Z", "2027-03-30T19:31:00Z", "2026-11-24T20:30:00Z"];
    for (let i = 0; i < 200; i++) instants.push(new Date(Date.parse("2026-09-01T00:00:00Z") + Math.floor(alea() * 400 * 86_400_000)).toISOString());
    for (const x of instants) {
      const r = await db.query<{ s: string }>("select internal.duel_semaine_de($1::timestamptz)::text as s", [x]);
      expect(r.rows[0]!.s, x).toBe(semaineDe(new Date(x)));
    }
  });
});

describe("l'insigne de la semaine", () => {
  it("va au premier du tableau de la semaine finie, une seule fois", async () => {
    const depuis = PARIS_24_NOV, jusqua = Date.parse("2026-11-24T20:30:00Z");
    const tous = releve.filter((x) => x.t < jusqua);
    const ts = tableauDeLaSemaine(retenus(tous).filter((x) => (x as (typeof releve)[number]).t >= depuis), tous).filter((l) => l.joueur !== horsDeLaListe);
    await db.query("select internal.duel_couronner(date '2026-11-24')");
    await db.query("select internal.duel_couronner(date '2026-11-24')");
    const r = await db.query<{ premier: string; duels: number; classes: number; n: number }>("select premier, duels, classes, (select count(*)::integer from internal.duel_semaines) as n from internal.duel_semaines where semaine = date '2026-11-24'");
    expect(r.rows[0]).toMatchObject({ premier: ts[0]!.joueur, duels: ts[0]!.duels, classes: ts.length, n: 1 });
    const moi = await commeMembre<{ ok: boolean; insignes: { semaine: string }[] }>(db, ts[0]!.joueur, "select public.get_mes_insignes_duel() as r");
    expect(moi.insignes.map((i) => i.semaine)).toEqual(["2026-11-24"]);
  });

  it("ne va à personne quand personne n'est classé", async () => {
    await db.query("select internal.duel_couronner(date '2026-11-10')");
    const r = await db.query<{ premier: string | null; classes: number }>("select premier, classes from internal.duel_semaines where semaine = date '2026-11-10'");
    expect(r.rows[0]).toEqual({ premier: null, classes: 0 });
  });
});

describe("le partage de la saison", () => {
  it("partage la cagnotte entre les trois premiers, 50, 30 et 20 pour cent, sans créer un statère, même pour un gagnant en essai du mode GOD", { timeout: LONG }, async () => {
    // une cagnotte de 1 001 statères, venue des pots (comme les salles l'écrivent)
    await db.query("insert into internal.duel_cagnotte_mouvements (saison, nature, montant, ref) values ('saison-1', 'part_du_pot', 1001, 'essai')");
    const depuis = Date.parse("2026-11-16T23:00:00Z"), jusqua = Date.parse("2026-12-28T23:00:00Z");
    const tous = releve.filter((x) => x.t < jusqua);
    const ts = tableauDeLaSaison(retenus(tous).filter((x) => (x as (typeof releve)[number]).t >= depuis), tous).filter((l) => l.joueur !== horsDeLaListe);
    expect(ts.length).toBeGreaterThanOrEqual(3);
    const premiers = ts.slice(0, 3).map((l) => l.joueur);
    // le premier est en essai du mode GOD au moment du partage : sa part reste vraie
    await db.query("insert into internal.village_god (user_id, sauvegarde) values ($1, '{\"gaulois\": {\"tenue\": {}}}'::jsonb)", [premiers[0]]);
    const solde = async (u: string) => Number((await db.query<{ s: string }>("select coalesce((select solde from internal.stateres_soldes where user_id = $1), 0)::text as s", [u])).rows[0]!.s);
    const avant = await Promise.all(premiers.map(solde));
    const total = await somme();
    await db.query("select internal.duel_partager('saison-1')");
    await db.query("select internal.duel_partager('saison-1')");
    expect(await somme()).toBe(total);
    expect((await Promise.all(premiers.map(solde))).map((s, i) => s - avant[i]!)).toEqual([500, 300, 200]);
    const p = await db.query<{ cagnotte: string; verse: string; reste: string; vers: string }>("select cagnotte::text, verse::text, reste::text, vers from internal.duel_saisons_partagees where saison = 'saison-1'");
    expect(p.rows[0]).toEqual({ cagnotte: "1001", verse: "1000", reste: "1", vers: "a-venir" });
    const c = await db.query<{ saison: string; montant: string }>("select saison, montant::text from internal.duel_cagnottes order by saison");
    expect(c.rows).toEqual([{ saison: "a-venir", montant: "1" }, { saison: "saison-1", montant: "0" }]);
    const natures = await db.query<{ nature: string; n: number }>("select nature, count(*)::integer as n from internal.stateres_mouvements where ref like 'duel/saison/%' group by nature");
    expect(natures.rows).toEqual([{ nature: "duel_saison", n: 3 }]);
    const places = await db.query<{ place: number; user_id: string; stateres: number }>("select place, user_id, stateres from internal.duel_saison_places where saison = 'saison-1' order by place");
    expect(places.rows).toEqual(premiers.map((u, i) => ({ place: i + 1, user_id: u, stateres: [500, 300, 200][i] })));
    await db.query("delete from internal.village_god where user_id = $1", [premiers[0]]);
  });

  it("partage au bon moment, au réveil, une saison finie, puis envoie les restes à la saison qui reçoit les parts", { timeout: LONG }, async () => {
    // une saison passée (septembre et octobre 2026, partagée début novembre), sans duel du banc, et une saison en cours, qui
    // reçoit les parts (du 20 novembre 2026 à la fin du siècle : le test ne dépend pas du jour où il tourne)
    await db.query(`insert into internal.sentier_saisons (saison, nom, debut, fin, paliers, pas_par_palier) values
      ('essai-passee', 'Saison passée', date '2026-09-01', date '2026-10-31', 30, 30),
      ('essai-en-cours', 'Saison en cours', date '2026-11-20', date '2099-12-31', 30, 30)`);
    await db.query("insert into internal.duel_cagnotte_mouvements (saison, nature, montant, ref) values ('essai-passee', 'part_du_pot', 77, 'essai')");
    const total = await somme();
    await db.query("select internal.duel_tableau_reveil()");
    expect(await somme()).toBe(total);
    const p = await db.query<{ saison: string; verse: string; reste: string; vers: string }>("select saison, verse::text, reste::text, vers from internal.duel_saisons_partagees where saison like 'essai-%'");
    // personne n'a joué dans la saison passée : tout va à la saison qui reçoit les parts le lendemain de sa fin, la saison 1
    expect(p.rows).toEqual([{ saison: "essai-passee", verse: "0", reste: "77", vers: "saison-1" }]);
    const c = await db.query<{ saison: string; montant: string }>("select saison, montant::text from internal.duel_cagnottes where montant > 0 order by saison");
    // le reste allé à la saison 1, déjà partagée, et la cagnotte « a-venir » (le reste de la saison 1) sont allés à la saison en cours
    expect(c.rows).toEqual([{ saison: "essai-en-cours", montant: "78" }]);
    // rejouer le réveil ne change rien
    const lignes = async () => (await db.query<{ n: number }>("select count(*)::integer as n from internal.duel_cagnotte_mouvements")).rows[0]!.n;
    const n = await lignes();
    await db.query("select internal.duel_tableau_reveil()");
    expect(await lignes()).toBe(n);
    const journal = await db.query<{ nature: string; s: string }>("select nature, sum(montant)::text as s from internal.duel_cagnotte_mouvements where nature = 'report' group by nature");
    expect(journal.rows).toEqual([{ nature: "report", s: "0" }]);
  });

  it("garde vraie la part d'une saison pendant un essai du mode GOD", async () => {
    const def = (await db.query<{ d: string }>("select pg_get_functiondef('internal.village_god_mouvement()'::regprocedure) as d")).rows[0]!.d;
    for (const n of ["duel_saison", "duel_gain", "duel_rendu", "loterie_lot", "prix_baisse_rendu"]) expect(def).toContain(`'${n}'`);
  });
});

describe("l'écran du tableau", () => {
  it("rend au membre les deux tableaux, ses insignes, la cagnotte, avec les noms du village et jamais un solde", async () => {
    const r = await commeMembre<unknown>(db, membres[0]!, "select public.get_tableau_duel() as r");
    const e = lireLeTableau(r);
    expect(e).not.toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/solde/);
    expect(e!.semaine.minimum).toBe(5);
    expect(e!.regles).toEqual({ minimumSemaine: 5, minimumSaison: 15, parAdversaire: 2, parts: [50, 30, 20] });
    // la dernière semaine couronnée (le réveil couronne les semaines finies, selon le jour où le test tourne)
    const derniere = (await db.query<{ s: string }>("select max(semaine)::text as s from internal.duel_semaines")).rows[0]!.s;
    expect(e!.precedente?.semaine).toBe(derniere);
    expect(e!.semaine.moi?.gaulois?.nom).toMatch(/\S/);
    // la saison en jeu : la saison en cours de l'essai (la saison 1 est partagée), sa cagnotte, ses parts arrondies vers le bas
    expect(e!.saison).toMatchObject({ saison: "essai-en-cours", cagnotte: 78, parts: [{ place: 1, pourCent: 50, montant: 39 }, { place: 2, pourCent: 30, montant: 23 }, { place: 3, pourCent: 20, montant: 15 }] });
    expect(e!.partagePrecedent).toMatchObject({ saison: "saison-1", cagnotte: 1001, reste: 1 });
    expect(e!.partagePrecedent!.places.map((p) => p.stateres)).toEqual([500, 300, 200]);
    for (const l of [...e!.semaine.lignes, ...(e!.saison?.lignes ?? [])]) expect(l.nom).toMatch(/\S/);
  });

  it("reste fermé aux autres membres tant que le duel est fermé, et aux visiteurs", async () => {
    await db.query("update internal.duel_ouvert set ouvert = false where id");
    expect(await commeMembre(db, membres[1]!, "select public.get_tableau_duel() as r")).toMatchObject({ ok: false, error: "duel_ferme" });
    await db.query("update internal.duel_ouvert set ouvert = true where id");
    await expect(db.exec("set role anon; select public.get_tableau_duel();")).rejects.toThrow();
    await db.query("reset role");
  });
});

describe("le fichier à coller du tableau", () => {
  // Le fichier se colle après les migrations qui le précèdent : une migration plus récente (20261127000100) remplace le
  // déclencheur du mode GOD, et il refuserait alors, à raison, de le remettre à son ancienne version.
  const luiEtApres = () => migrations().filter((m) => m >= `${NOM}.sql`);

  it("s'installe après les migrations qui le précèdent, se recolle sans rien changer, et le dit", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: luiEtApres() });
    for (let fois = 0; fois < 2; fois++) {
      const r = await base.exec(texteAColler().split("\r\n").join("\n"));
      expect(r.at(-1)!.rows[0]).toEqual({ controle: ATTENDU });
    }
    expect((await base.query<{ n: number }>("select count(*)::integer as n from cron.job where jobname = 'gal-duel-tableau'")).rows[0]!.n).toBe(1);
    await base.close();
  });

  it("s'arrête sans rien changer quand les salles ne sont pas installées", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: [...luiEtApres(), "20261122001000_duel_salles_en_direct.sql"] });
    await expect(base.exec(texteAColler())).rejects.toThrow(/salles du duel/);
    await base.exec("rollback");
    expect((await base.query<{ f: string | null }>("select to_regprocedure('public.get_tableau_duel()')::text as f")).rows[0]!.f).toBeNull();
    await base.close();
  });

  it("refuse de remplacer un déclencheur du mode GOD plus récent que le sien", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: luiEtApres() });
    const def = (await base.query<{ d: string }>("select pg_get_functiondef('internal.village_god_mouvement()'::regprocedure) as d")).rows[0]!.d;
    // une version suivante, qui connaîtrait une nature de plus que celle-ci
    await base.exec(def.split("'duel_gain', 'duel_rendu')").join("'duel_gain', 'duel_rendu', 'duel_saison', 'nature_future')"));
    await expect(base.exec(texteAColler())).rejects.toThrow(/mode GOD/);
    await base.exec("rollback");
    expect((await base.query<{ f: string | null }>("select to_regprocedure('public.get_tableau_duel()')::text as f")).rows[0]!.f).toBeNull();
    await base.close();
  });

  it("recopie la migration telle quelle", () => {
    expect(texteAColler()).toContain(readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd());
  });
});
