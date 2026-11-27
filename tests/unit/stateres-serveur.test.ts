/**
 * Les statères doublés côté serveur (migration 20261127000100, le pilote, 27 novembre 2026 : « double la somme apportée lors
 * des points sur OpenFront », puis « rembourser ceux du mois de novembre avec un message », « si ils ont gagné 6000 ils
 * auront +6000 »), sur le banc PGlite de toutes les migrations :
 * - `internal.stateres_de_victoire` calcule comme `stateresDeVictoire` (src/lib/stateres.ts), `internal.stateres_regle`
 *   porte le même nom de règle ;
 * - le fichier que colle le pilote n'est pas rétroactif pour la règle (un crédit donné à 30 le reste, une partie payée ne
 *   l'est jamais deux fois, la suivante l'est à 60) et verse une seule fois à chaque compte la somme exacte de ses crédits
 *   de novembre à 30, rien d'autre ; le message se lit par son seul titulaire et ne revient pas une fois vu ; recollé, il ne
 *   verse rien de plus.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTENDU, NOM, texteAColler } from "../../scripts/a-coller-stateres-60";
import { REGLE_STATERES, STATERES_PAR_POINT, stateresDeVictoire } from "../../src/lib/stateres";
import { baseDeTest, commeMembre, migrations, nouveauMembre } from "./banc-pglite";

const LONG = 300_000;
const MIGRATION = `${NOM}.sql`;
let db: PGlite;

beforeAll(async () => {
  db = await baseDeTest();
}, LONG);

afterAll(async () => {
  await db?.close();
});

/** Des points tels que le script les envoie (l'écriture de JSON.stringify), avec le nombre de Gaulois. */
const essais = (): [number, number][] => {
  const xs: [number, number][] = [];
  for (let k = 1; k <= 2000; k++) xs.push([k / 100, 1 + (k % 13)]);
  for (const x of [1.025, 4.225, 8.075, 8.325, 2.05, 16.65, 1.005, 0.001, 0.008, 0.0083, 0.0084, 0.025, 1e-7, 0.3333333333333333, 0.6666666666666666, 6.71, 99.94, 999.99]) {
    xs.push([x, 3]);
  }
  xs.push([1.67, 0], [0, 3], [-0.26, 3]);
  return xs;
};

describe("la règle du serveur", () => {
  it("calcule comme le site, au statère près, y compris là où la virgule flottante se trompe", async () => {
    const xs = essais();
    const r = await db.query<{ i: number; s: number }>(
      "select t.i::int as i, internal.stateres_de_victoire(t.p::numeric, t.g) as s from unnest($1::text[], $2::int[]) with ordinality as t(p, g, i) order by t.i",
      [xs.map(([p]) => JSON.stringify(p)), xs.map(([, g]) => g)],
    );
    expect(r.rows).toHaveLength(xs.length);
    const ecarts = r.rows.filter((row) => row.s !== stateresDeVictoire(xs[row.i - 1]![0], xs[row.i - 1]![1]));
    expect(ecarts).toEqual([]);
    expect((await db.query<{ s: number }>("select internal.stateres_de_victoire(null, 3) as s")).rows[0]!.s).toBe(0);
    expect((await db.query<{ s: number }>("select internal.stateres_de_victoire(1, 1) as s")).rows[0]!.s).toBe(STATERES_PAR_POINT);
  });

  it("porte le nom de la règle du site, et reste fermée aux visiteurs et aux membres", async () => {
    const r = await db.query<{ regle: string; anon: boolean; membre: boolean; nom_anon: boolean; nom_membre: boolean }>(`
      select internal.stateres_regle() as regle,
        has_function_privilege('anon', 'internal.stateres_de_victoire(numeric, integer)', 'execute') as anon,
        has_function_privilege('authenticated', 'internal.stateres_de_victoire(numeric, integer)', 'execute') as membre,
        has_function_privilege('anon', 'internal.stateres_regle()', 'execute') as nom_anon,
        has_function_privilege('authenticated', 'internal.stateres_regle()', 'execute') as nom_membre`);
    expect(r.rows[0]).toEqual({ regle: REGLE_STATERES, anon: false, membre: false, nom_anon: false, nom_membre: false });
  });

  it("ouvre le message aux seuls membres connectés, et ne rend jamais celui d'un autre", async () => {
    const r = await db.query<{ lire_anon: boolean; lire: boolean; voir_anon: boolean; voir: boolean }>(`
      select has_function_privilege('anon', 'public.get_mes_points_doubles()', 'execute') as lire_anon,
        has_function_privilege('authenticated', 'public.get_mes_points_doubles()', 'execute') as lire,
        has_function_privilege('anon', 'public.voir_points_doubles()', 'execute') as voir_anon,
        has_function_privilege('authenticated', 'public.voir_points_doubles()', 'execute') as voir`);
    expect(r.rows[0]).toEqual({ lire_anon: false, lire: true, voir_anon: false, voir: true });
    expect((await db.query<{ r: unknown }>("select public.get_mes_points_doubles() as r")).rows[0]!.r).toEqual({ ok: false, error: "not_signed_in" });
    const sans = await nouveauMembre(db);
    expect(await commeMembre(db, sans, "select public.get_mes_points_doubles() as r")).toEqual({ ok: true, doubles: null });
    expect(await commeMembre(db, sans, "select public.voir_points_doubles() as r")).toEqual({ ok: true });
  });

  it("garde vrai le rattrapage pendant un essai du mode GOD", async () => {
    const def = (await db.query<{ d: string }>("select pg_get_functiondef('internal.village_god_mouvement()'::regprocedure) as d")).rows[0]!.d;
    for (const n of ["points_doubles", "duel_saison", "duel_gain", "duel_rendu", "loterie_lot", "prix_baisse_rendu", "victoire"]) expect(def).toContain(`'${n}'`);
  });
});

/* ---------- Le fichier que colle le pilote ---------- */

describe("le fichier à coller", () => {
  it("double novembre une seule fois, à la somme exacte des crédits à 30, sans toucher à la règle d'avant ni au reste", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: migrations().filter((m) => m >= MIGRATION) });
    const empreinte = "a".repeat(64);
    const zoe = await nouveauMembre(base, { empreinte });
    const leo = await nouveauMembre(base);
    const god = await nouveauMembre(base);
    const rien = await nouveauMembre(base);

    // Une partie payée par la vraie relecture, avant le fichier : 30 par point, règle « entier-30 ». Le Gaulois de Zoé date
    // du 1er novembre : ses parties de novembre lui reviennent, quel que soit le jour où l'essai tourne.
    await base.query("update internal.gaulois set created_at = '2026-11-01T00:00:00Z' where user_id = $1", [zoe]);
    const noter = async (partie: string, points: number, debut: string): Promise<number> => {
      await base.query("insert into internal.stateres_victoires (partie, debut, points, gaulois) values ($1, $2, $3, 3)", [partie, debut, points]);
      await base.query("insert into internal.stateres_presences (partie, empreinte) values ($1, $2)", [partie, empreinte]);
      return (await base.query<{ n: number }>("select internal.crediter_stateres() as n")).rows[0]!.n;
    };
    expect(await noter("avant1", 1.67, "2026-11-26T20:00:00.000Z")).toBe(1);

    // D'autres crédits du journal, écrits tels quels : novembre à 30, octobre, et ce qui n'est pas des points.
    const credit = (uid: string, partie: string, debut: string, montant: number, regle = "entier-30") =>
      base.query("insert into internal.stateres_mouvements (user_id, nature, montant, partie, debut, points, gaulois, regle) values ($1, 'victoire', $2, $3, $4, 1, 2, $5)", [uid, montant, partie, debut, regle]);
    await credit(zoe, "nov00001", "2026-11-13T19:00:00.000Z", 2);
    // Le 1er novembre à 0 h 30 à Paris : novembre ; le 31 octobre à 23 h 30 à Paris : octobre, pas doublé.
    await credit(leo, "nov00002", "2026-10-31T23:30:00.000Z", 5998);
    await credit(leo, "oct00001", "2026-10-31T22:30:00.000Z", 700);
    await credit(god, "nov00003", "2026-11-20T20:00:00.000Z", 1);
    await base.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'loterie_lot', 3000, 'loterie/2026-11-24/or')", [leo]);
    await base.query("insert into internal.village_god (user_id, sauvegarde) values ($1, '{}'::jsonb)", [god]);
    const solde = async (uid: string) => Number((await base.query<{ s: string | null }>("select solde::text as s from internal.stateres_soldes where user_id = $1", [uid])).rows[0]?.s ?? 0);
    const avant = { zoe: await solde(zoe), leo: await solde(leo), god: await solde(god) };
    expect(avant).toEqual({ zoe: 52, leo: 9698, god: 1 });

    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    // Zoé 52, Léo 5 998 (pas octobre, pas la loterie), le compte en essai 1 : 3 comptes, 6 051 statères.
    expect(await controle()).toBe(`${ATTENDU}3 comptes, 6051 statères`);
    expect({ zoe: await solde(zoe), leo: await solde(leo), god: await solde(god) }).toEqual({ zoe: 104, leo: 15696, god: 2 });
    const versements = await base.query<{ user_id: string; nature: string; montant: number; ref: string }>("select user_id, nature, montant, ref from internal.stateres_mouvements where nature in ('points_doubles', 'test_points_doubles', 'god_retour') order by montant");
    expect(versements.rows).toEqual([
      { user_id: god, nature: "points_doubles", montant: 1, ref: "novembre-2026" },
      { user_id: zoe, nature: "points_doubles", montant: 52, ref: "novembre-2026" },
      { user_id: leo, nature: "points_doubles", montant: 5998, ref: "novembre-2026" },
    ]);

    // Le message : son seul titulaire le lit, avec ses chiffres ; vu, il ne revient pas.
    expect(await commeMembre(base, leo, "select public.get_mes_points_doubles() as r")).toEqual({ ok: true, doubles: { montant: 5998, parties: 1, vu: false } });
    expect(await commeMembre(base, zoe, "select public.get_mes_points_doubles() as r")).toEqual({ ok: true, doubles: { montant: 52, parties: 2, vu: false } });
    expect(await commeMembre(base, rien, "select public.get_mes_points_doubles() as r")).toEqual({ ok: true, doubles: null });
    expect(await commeMembre(base, leo, "select public.voir_points_doubles() as r")).toEqual({ ok: true });
    expect(await commeMembre(base, leo, "select public.get_mes_points_doubles() as r")).toEqual({ ok: true, doubles: { montant: 5998, parties: 1, vu: true } });
    expect(await commeMembre(base, zoe, "select public.get_mes_points_doubles() as r")).toEqual({ ok: true, doubles: { montant: 52, parties: 2, vu: false } });

    // La règle : la partie déjà payée ne se repaie pas ; la suivante l'est à 60 par point, sous « entier-60 », sans être
    // doublée une seconde fois.
    expect((await base.query<{ n: number }>("select internal.crediter_stateres() as n")).rows[0]!.n).toBe(0);
    expect(await noter("apres1", 1.67, "2026-11-28T20:00:00.000Z")).toBe(1);
    const credits = await base.query<{ partie: string; montant: number; regle: string }>("select partie, montant, regle from internal.stateres_mouvements where user_id = $1 and nature = 'victoire' order by partie", [zoe]);
    expect(credits.rows).toEqual([
      { partie: "apres1", montant: 100, regle: "entier-60" },
      { partie: "avant1", montant: 50, regle: "entier-30" },
      { partie: "nov00001", montant: 2, regle: "entier-30" },
    ]);
    expect(await solde(zoe)).toBe(204);

    // Recollé : même contrôle, rien de plus versé, le message vu reste vu.
    expect(await controle()).toBe(`${ATTENDU}3 comptes, 6051 statères`);
    expect((await base.query<{ n: number }>("select count(*)::int as n from internal.stateres_mouvements where nature = 'points_doubles'")).rows[0]!.n).toBe(3);
    expect({ zoe: await solde(zoe), leo: await solde(leo), god: await solde(god) }).toEqual({ zoe: 204, leo: 15696, god: 2 });
    expect(await commeMembre(base, leo, "select public.get_mes_points_doubles() as r")).toEqual({ ok: true, doubles: { montant: 5998, parties: 1, vu: true } });
    expect((await base.query<{ n: number }>("select count(*)::int as n from supabase_migrations.schema_migrations where version = '20261127000100'")).rows[0]!.n).toBe(1);
    await base.close();
  });

  it("dit « 0 compte, 0 statère » quand personne n'a de crédit de novembre", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: migrations().filter((m) => m >= MIGRATION) });
    const r = await base.exec(texteAColler());
    expect((r.at(-1)!.rows[0] as { controle: string }).controle).toBe(`${ATTENDU}0 compte, 0 statère`);
    await base.close();
  });

  it("s'arrête sans rien changer quand les statères ne sont pas installés", { timeout: LONG }, async () => {
    const sansStateres = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261113001800") });
    await expect(sansStateres.exec(texteAColler())).rejects.toThrow(/pas installés/);
    await sansStateres.exec("rollback");
    expect((await sansStateres.query<{ t: string | null }>("select to_regprocedure('internal.stateres_regle()')::text as t")).rows[0]!.t).toBeNull();
    await sansStateres.close();
  });
});
