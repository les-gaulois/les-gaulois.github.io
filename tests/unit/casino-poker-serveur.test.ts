/**
 * Le serveur du poker du barde et de « Mon bilan » (migration 20261128000500_casino_poker_et_bilan) fait foi. Sur le banc
 * PGlite (toutes les migrations du dépôt) : la sorte de chaque main, la donne et le tirage comparés au TypeScript
 * (src/lib/village/casino/poker.ts) ; des mains entières jouées par les fonctions des membres avec un hasard d'essai ; le
 * journal des statères, la main reprise, les refus, le mode GOD, l'interrupteur, le bilan, les annonces, les droits, et le
 * fichier que colle le pilote.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ATTENDU, NOM, texteAColler } from "../../scripts/a-coller-casino-poker";
import { ATTENDU as ATTENDU_DISCORD, NOM as NOM_DISCORD, texteAColler as texteACollerDiscord } from "../../scripts/a-coller-casino-poker-discord";
import { SORTES_DU_POKER, carte, donneDuPoker, nombre, sorteDuPoker, tirageDuPoker, type CarteDuPoker } from "../../src/lib/village/casino/poker";
import type { CoupDuPoker, DonneDuPoker, EtatDuCasino } from "../../src/lib/village/contrat-casino";
import { lireEtatDuCasino } from "../../src/lib/village/ecran-casino";
import { baseDeTest, commeMembre, discordDe, migrations, nouveauMembre, texteDeMigration } from "./banc-pglite";

const LONG = 300_000;
const MIGRATION = `${NOM}.sql`;
const MIGRATION_DISCORD = `${NOM_DISCORD}.sql`;
let db: PGlite;

const lignes = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query<T>(sql, params)).rows;
const une = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await lignes<{ r: T }>(sql, params))[0]!.r;
const json = (v: unknown): string => JSON.stringify(v);

beforeAll(async () => {
  db = await baseDeTest();
  await db.exec(`
    create function public.t_ents(j jsonb) returns integer[] language sql immutable as $$
      select coalesce(array_agg(v::integer order by n), '{}') from jsonb_array_elements_text(j) with ordinality t(v, n) $$;
    -- Le hasard d'essai : les valeurs de public.t_hasard, dans l'ordre, puis le vrai hasard du serveur quand elles manquent.
    create table public.t_hasard (i bigserial primary key, v integer not null);
    alter function internal.casino_entier(integer) rename to casino_entier_vrai;
    create function internal.casino_entier(p_n integer) returns integer language plpgsql volatile as $$
    declare v_i bigint; v_v integer;
    begin
      select h.i, h.v into v_i, v_v from public.t_hasard h order by h.i limit 1;
      if v_i is null then return internal.casino_entier_vrai(p_n); end if;
      delete from public.t_hasard where i = v_i;
      if v_v < 0 or v_v >= p_n then raise exception 'hasard d''essai % hors de 0 à %', v_v, p_n - 1; end if;
      return v_v;
    end $$;
  `);
}, LONG);

const pousser = async (valeurs: readonly number[]): Promise<void> => {
  await db.query("insert into public.t_hasard (v) select unnest(public.t_ents($1::jsonb))", [json(valeurs)]);
};
const viderLeHasard = async (): Promise<void> => {
  await db.query("delete from public.t_hasard where true");
};
const resteDuHasard = async (): Promise<number> => (await lignes<{ n: number }>("select count(*)::int as n from public.t_hasard"))[0]!.n;

async function joueur(stateres = 10_000, o: { valide?: boolean; gaulois?: boolean } = {}): Promise<string> {
  await viderLeHasard();
  const uid = await nouveauMembre(db, o);
  if (stateres > 0) await db.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'don', $2, 'essai')", [uid, stateres]);
  return uid;
}
const comme = <T>(uid: string, requete: string, params: unknown[] = []): Promise<T> => commeMembre<T>(db, uid, requete, params);
const solde = async (uid: string): Promise<number> => (await lignes<{ s: number }>("select coalesce((select solde from internal.stateres_soldes where user_id = $1), 0)::int as s", [uid]))[0]!.s;
const journal = (uid: string) =>
  lignes<{ nature: string; montant: number; ref: string }>("select nature, montant, ref from internal.stateres_mouvements where user_id = $1 and nature ~ 'casino' order by id", [uid]);

/** Le hasard d'essai qui donne exactement `main` (cartes prises dans le paquet rangé, comme donneDuPoker). */
function valeursPour(main: readonly CarteDuPoker[]): number[] {
  const paquet = Array.from({ length: 52 }, (_, i) => i);
  return main.map((c) => {
    const i = paquet.indexOf(nombre(c));
    paquet.splice(i, 1);
    return i;
  });
}
/** Le hasard d'essai qui remplace les cartes jetées de `donne` par `venues`, dans l'ordre (comme tirageDuPoker). */
function valeursDuTirage(donne: readonly CarteDuPoker[], venues: readonly CarteDuPoker[]): number[] {
  const vues = new Set(donne.map(nombre));
  const paquet = Array.from({ length: 52 }, (_, i) => i).filter((n) => !vues.has(n));
  return venues.map((c) => {
    const i = paquet.indexOf(nombre(c));
    paquet.splice(i, 1);
    return i;
  });
}
const c = (r: number, e: number): CarteDuPoker => ({ r, e });

/* ---------- Les règles du serveur sont celles du TypeScript ---------- */

describe("les règles du poker en SQL", () => {
  it("classent chaque main comme le TypeScript : 20 000 mains au hasard et les cas limites", { timeout: LONG }, async () => {
    const mains: number[][] = [
      [0, 12, 11, 10, 9],
      [13, 14, 15, 16, 17],
      [0, 14, 28, 42, 4],
      [0, 25, 37, 49, 9],
      [12, 13, 27, 41, 3],
      [9, 22, 2, 18, 33],
      [10, 23, 2, 18, 33],
      [0, 13, 26, 39, 5],
      [0, 13, 26, 1, 14],
    ];
    for (let k = 0; k < 20_000; k++) mains.push(donneDuPoker((n) => Math.floor(Math.random() * n)).map(nombre));
    const sql = await une<number[]>("select coalesce(jsonb_agg(internal.casino_poker_sorte(public.t_ents(x)) order by n), '[]') as r from jsonb_array_elements($1::jsonb) with ordinality t (x, n)", [json(mains)]);
    expect(sql).toEqual(mains.map((m) => sorteDuPoker(m.map(carte))));
    expect(new Set(sql).size).toBe(SORTES_DU_POKER.length);
    expect(await une<number[]>("select to_jsonb(internal.casino_poker_fois()) as r")).toEqual(SORTES_DU_POKER.map((s) => s.fois));
  });

  it("donnent et tirent comme le TypeScript avec le même hasard", async () => {
    for (let k = 0; k < 40; k++) {
      const v = [52, 51, 50, 49, 48].map((n) => Math.floor(Math.random() * n));
      await viderLeHasard();
      await pousser(v);
      const donne = (await une<number[]>("select to_jsonb(internal.casino_poker_donne()) as r")).map(carte);
      expect(donne).toEqual(donneDuPoker(((w) => () => w.shift()!)([...v])));
      const gardes = donne.map(() => Math.random() < 0.5);
      const t = gardes.filter((g) => !g).map((_, j) => Math.floor(Math.random() * (47 - j)));
      await pousser(t);
      const finale = (await une<number[]>("select to_jsonb(internal.casino_poker_tirage(public.t_ents($1::jsonb), (select array_agg(g::boolean order by n) from jsonb_array_elements_text($2::jsonb) with ordinality x (g, n)))) as r", [json(donne.map(nombre)), json(gardes)])).map(carte);
      expect(finale).toEqual(tirageDuPoker(donne, gardes, ((w) => () => w.shift()!)([...t])));
    }
    expect(await resteDuHasard()).toBe(0);
  });
});

/* ---------- Le poker des membres ---------- */

describe("le poker des membres", () => {
  it("joue une main entière : la mise au journal, la donne gardée au serveur, le tirage, le gain", async () => {
    const uid = await joueur(1000);
    const donne = [c(10, 0), c(10, 2), c(3, 1), c(7, 3), c(12, 0)];
    await pousser(valeursPour(donne));
    const d = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(50) as r");
    expect(d).toMatchObject({ ok: true, god: false, mise: 50, main: donne, solde_apres: 950, mise_du_jour: 50, reste_du_jour: null });
    expect(await journal(uid)).toEqual([{ nature: "casino_mise", montant: -50, ref: `casino/${d.partie}` }]);
    // la main ouverte attend son joueur
    const e = await comme<EtatDuCasino>(uid, "select public.get_casino() as r");
    expect(e.poker).toEqual({ partie: d.partie, mise: 50, god: false, main: donne });
    expect(lireEtatDuCasino(e)?.poker).toEqual({ partie: d.partie, mise: 50, god: false, main: donne });
    expect(await comme(uid, "select public.distribuer_poker(10) as r")).toMatchObject({ ok: false, error: "main_en_cours" });
    // les deux valets gardés, un troisième vient : brelan, 3 fois la mise
    const venues = [c(10, 1), c(5, 2), c(6, 2)];
    await pousser(valeursDuTirage(donne, venues));
    const coup = await comme<CoupDuPoker>(uid, "select public.jouer_poker($1, '[true, true, false, false, false]'::jsonb) as r", [d.partie]);
    const finale = [c(10, 0), c(10, 2), ...venues];
    expect(coup).toMatchObject({ ok: true, jeu: "poker", partie: d.partie, mise: 50, rendu: 150, god: false, sorte: 3, main: finale, gardes: [true, true, false, false, false], solde_apres: 1100 });
    expect(sorteDuPoker(finale)).toBe(3);
    expect(await journal(uid)).toEqual([
      { nature: "casino_mise", montant: -50, ref: `casino/${d.partie}` },
      { nature: "casino_gain", montant: 150, ref: `casino/${d.partie}` },
    ]);
    const apres = await comme<EtatDuCasino>(uid, "select public.get_casino() as r");
    expect(apres.poker).toBeNull();
    expect(apres.parties[0]).toMatchObject({ partie: d.partie, jeu: "poker", mise: 50, rendu: 150, resume: { sorte: 3 } });
    expect(Object.keys(apres.parties[0]!.resume).sort()).toEqual(["jeu", "sorte"]);
    expect(await comme(uid, "select public.jouer_poker($1, '[true, true, true, true, true]'::jsonb) as r", [d.partie])).toMatchObject({ ok: false, error: "pas_de_main" });
  });

  it("paie une quinte flush royale 250 fois une mise de 200, et une main sans rien ne rend rien", async () => {
    const uid = await joueur(1000);
    const royale = [c(0, 3), c(12, 3), c(11, 3), c(10, 3), c(9, 3)];
    await pousser(valeursPour(royale));
    const d = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(200) as r");
    expect(await comme(uid, "select public.jouer_poker($1, '[true, true, true, true, true]'::jsonb) as r", [d.partie])).toMatchObject({ ok: true, sorte: 9, rendu: 50_000, solde_apres: 50_800 });
    const rien = [c(1, 0), c(4, 1), c(6, 2), c(8, 3), c(11, 0)];
    await pousser(valeursPour(rien));
    const d2 = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(100) as r");
    expect(await comme(uid, "select public.jouer_poker($1, '[true, true, true, true, true]'::jsonb) as r", [d2.partie])).toMatchObject({ ok: true, sorte: 0, rendu: 0, solde_apres: 50_700 });
  });

  it("refuse ce qui n'est pas valable, sans rien prendre ni rien tirer", async () => {
    const uid = await joueur(100);
    for (const [mise, code] of [[0, "pari_invalide"], [15, "pari_invalide"], [-10, "pari_invalide"], [210, "mise_trop_haute"], [200, "solde_insuffisant"]] as const)
      expect(await comme(uid, "select public.distribuer_poker($1) as r", [mise]), String(mise)).toMatchObject({ ok: false, error: code });
    expect(await solde(uid)).toBe(100);
    const d = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(10) as r");
    await viderLeHasard();
    await pousser([0, 0, 0, 0, 0]);
    for (const g of ["[true, false]", "[1, 0, 1, 0, 1]", "null", '{"a": true}', '[true, true, true, true, "faux"]'])
      expect(await comme(uid, `select public.jouer_poker($1, '${g}'::jsonb) as r`, [d.partie]), g).toMatchObject({ ok: false, error: "coup_refuse" });
    expect(await resteDuHasard()).toBe(5);
    await viderLeHasard();
    const autre = await joueur(100);
    expect(await comme(autre, "select public.jouer_poker($1, '[true, true, true, true, true]'::jsonb) as r", [d.partie])).toMatchObject({ ok: false, error: "pas_de_main" });
    expect(await comme(uid, "select get_casino() -> 'poker' ->> 'partie' as r")).toBe(String(d.partie));
    expect(await comme(await joueur(500, { gaulois: false }), "select public.distribuer_poker(10) as r")).toMatchObject({ ok: false, error: "no_gaulois" });
  });

  it("se ferme par son interrupteur, sans jamais perdre une main ouverte", async () => {
    const uid = await joueur(1000);
    const d = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(20) as r");
    await db.query("update internal.casino_ouvert set ouvert = false, maj_le = now() where id");
    try {
      expect(await comme(uid, "select public.distribuer_poker(10) as r")).toMatchObject({ ok: false, error: "casino_ferme" });
      expect(await comme(uid, "select public.get_casino() -> 'poker' ->> 'partie' as r")).toBe(String(d.partie));
      expect(await comme(uid, "select public.jouer_poker($1, '[false, false, false, false, false]'::jsonb) as r", [d.partie])).toMatchObject({ ok: true, jeu: "poker" });
    } finally {
      await db.query("update internal.casino_ouvert set ouvert = true, maj_le = now() where id");
    }
  });

  it("joue sans mise ni gain en essai du mode GOD, et une vraie main attend la fin de l'essai", async () => {
    const uid = await joueur(500);
    const vraie = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(100) as r");
    await db.query("insert into internal.village_god_titulaire (discord_id) values ($1)", [await discordDe(db, uid)]);
    expect(await comme(uid, "select public.activer_village_god() as r")).toMatchObject({ ok: true, actif: true });
    expect(await comme(uid, "select public.jouer_poker($1, '[true, true, true, true, true]'::jsonb) as r", [vraie.partie])).toMatchObject({ ok: false, error: "mode_god" });
    expect(await comme(uid, "select public.desactiver_village_god() as r")).toMatchObject({ ok: true, actif: false });
    const fin = await comme<CoupDuPoker>(uid, "select public.jouer_poker($1, '[true, true, true, true, true]'::jsonb) as r", [vraie.partie]);
    expect(fin).toMatchObject({ ok: true, god: false });
    expect(await comme(uid, "select public.activer_village_god() as r")).toMatchObject({ ok: true, actif: true });
    const avant = await solde(uid);
    const essai = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(200) as r");
    expect(essai).toMatchObject({ ok: true, god: true, solde_apres: avant });
    expect(await comme(uid, "select public.jouer_poker($1, '[false, false, false, false, false]'::jsonb) as r", [essai.partie])).toMatchObject({ ok: true, god: true, solde_apres: avant });
    expect(await comme(uid, "select public.desactiver_village_god() as r")).toMatchObject({ ok: true, actif: false });
    expect((await journal(uid)).filter((m) => m.ref === `casino/${essai.partie}`)).toEqual([]);
    // le bilan ne compte pas l'essai
    const bilan = (await comme<EtatDuCasino>(uid, "select public.get_casino() as r")).bilan!;
    expect(bilan).toMatchObject({ parties: 1, mise: 100, rendu: fin.rendu, jeux: [{ jeu: "poker", parties: 1, mise: 100, rendu: fin.rendu }] });
  });
});

/* ---------- Mon bilan ---------- */

describe("mon bilan", () => {
  it("compte ce que le compte a misé et reçu depuis sa première partie, jeu par jeu, et rien d'un autre compte", async () => {
    const uid = await joueur(10_000);
    const autre = await joueur(10_000);
    await viderLeHasard();
    await pousser([2]);
    const roue = await comme<{ partie: number; rendu: number }>(uid, "select public.jouer_roue('{\"n3\":50, \"rouge\":20}'::jsonb) as r");
    await pousser([0]);
    const machine = await comme<{ rendu: number }>(uid, "select public.jouer_machine(10) as r");
    expect(await comme(autre, "select public.jouer_machine(200) as r")).toMatchObject({ ok: true });
    const d = await comme<DonneDuPoker>(uid, "select public.distribuer_poker(30) as r");
    // une main encore ouverte ne compte pas
    let b = (await comme<EtatDuCasino>(uid, "select public.get_casino() as r")).bilan!;
    expect(b.parties).toBe(2);
    const fin = await comme<CoupDuPoker>(uid, "select public.jouer_poker($1, '[false, false, false, false, false]'::jsonb) as r", [d.partie]);
    b = (await comme<EtatDuCasino>(uid, "select public.get_casino() as r")).bilan!;
    expect(b).toMatchObject({ parties: 3, mise: 70 + 10 + 30, rendu: roue.rendu + machine.rendu + fin.rendu });
    expect(b.jeux).toEqual([
      { jeu: "machine", parties: 1, mise: 10, rendu: machine.rendu },
      { jeu: "poker", parties: 1, mise: 30, rendu: fin.rendu },
      { jeu: "roue", parties: 1, mise: 70, rendu: roue.rendu },
    ]);
    expect(new Date(b.depuis!).getTime()).toBeGreaterThan(Date.now() - 600_000);
    expect(lireEtatDuCasino(await comme(uid, "select public.get_casino() as r"))?.bilan).toEqual(b);
  });
});

/* ---------- Les annonces, les droits, le fichier à coller ---------- */

describe("ce qui entoure le poker", () => {
  it("part sur Discord dès le carré, avec sa donne, et jamais en dessous ni sous les 1 000 statères gagnés", async () => {
    const uid = await joueur(5000);
    await db.query("insert into internal.casino_annonces_depart (id, partie) values (true, 0) on conflict (id) do update set partie = 0");
    const jouer = async (donne: CarteDuPoker[], mise: number, gardes: string, venues: CarteDuPoker[] = []): Promise<number> => {
      await viderLeHasard();
      await pousser(valeursPour(donne));
      const d = await comme<DonneDuPoker>(uid, "select public.distribuer_poker($1) as r", [mise]);
      await pousser(valeursDuTirage(donne, venues));
      await comme(uid, `select public.jouer_poker($1, '${gardes}'::jsonb) as r`, [d.partie]);
      return d.partie;
    };
    const royale = await jouer([c(0, 1), c(12, 1), c(11, 1), c(10, 1), c(9, 1)], 100, "[true, true, true, true, true]");
    // un carré de rois à 50 : 1 200 gagnés ; à 40 : 960 gagnés, sous le seuil
    const carre = await jouer([c(12, 0), c(12, 1), c(12, 2), c(3, 1), c(5, 2)], 50, "[true, true, true, false, false]", [c(12, 3), c(7, 0)]);
    const petitCarre = await jouer([c(12, 0), c(12, 1), c(12, 2), c(3, 1), c(5, 2)], 40, "[true, true, true, false, false]", [c(12, 3), c(7, 0)]);
    // une couleur à 200 : 1 000 gagnés, un full à 200 : 1 800 gagnés, mais aucun n'est un carré
    const couleur = await jouer([c(1, 2), c(4, 2), c(6, 2), c(8, 2), c(11, 2)], 200, "[true, true, true, true, true]");
    const full = await jouer([c(5, 0), c(5, 1), c(5, 2), c(9, 0), c(9, 3)], 200, "[true, true, true, true, true]");
    expect(full).toBeGreaterThan(0);
    const file = await une<{ annonces: { partie: number; jeu: string; donne: number[] | null; resultat: { sorte: number } }[] }>("select public.casino_annonces_a_envoyer() as r");
    const parties = file.annonces.map((a) => a.partie);
    expect(parties).toContain(royale);
    expect(parties).toContain(carre);
    expect(parties).not.toContain(petitCarre);
    expect(parties).not.toContain(couleur);
    expect(parties).not.toContain(full);
    expect(file.annonces.find((a) => a.partie === carre)).toMatchObject({ jeu: "poker", donne: [12, 25, 38, 16, 31], resultat: { sorte: 7 } });
    expect(file.annonces.filter((a) => a.jeu !== "poker").every((a) => a.donne === null)).toBe(true);
  });

  it("n'ouvre que les deux appels du poker aux membres, rien aux visiteurs", async () => {
    for (const f of ["public.distribuer_poker(integer)", "public.jouer_poker(bigint, jsonb)", "public.get_casino()"]) {
      expect(await une<boolean>(`select has_function_privilege('authenticated', '${f}', 'execute') as r`), f).toBe(true);
      expect(await une<boolean>(`select has_function_privilege('anon', '${f}', 'execute') as r`), f).toBe(false);
    }
    const internes = [...texteDeMigration(MIGRATION).matchAll(/create or replace function (internal\.[a-z0-9_]+\([^)]*\))/g)].map((m) => m[1]!);
    expect(internes.length).toBeGreaterThanOrEqual(8);
    for (const f of ["internal.casino_poker_fois()", "internal.casino_poker_sorte(integer[])", "internal.casino_poker_donne()", "internal.casino_poker_tirage(integer[], boolean[])", "internal.casino_poker_cartes(integer[])", "internal.casino_poker_gardes(jsonb)", "internal.casino_poker_ouverte(uuid)", "internal.casino_bilan(uuid)"])
      for (const role of ["anon", "authenticated"]) expect(await une<boolean>(`select has_function_privilege('${role}', '${f}', 'execute') as r`), `${role} ${f}`).toBe(false);
    expect(await une<boolean>("select has_table_privilege('authenticated', 'internal.casino_poker_mains', 'select') as r")).toBe(false);
  });

  it("a chaque refus de la migration écrit en mots", async () => {
    const { ERROR_MESSAGES } = await import("../../src/lib/compte/errors");
    const codes = new Set([...texteDeMigration(MIGRATION).matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    expect([...codes].sort()).toEqual(["coup_refuse", "main_en_cours", "mode_god", "pas_de_main", "rate_limited"]);
    for (const code of codes) expect(ERROR_MESSAGES, code).toHaveProperty(code);
  });

  it("le fichier à coller s'installe sur le casino déjà en ligne, se recolle sans rien changer, et le dit", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: [MIGRATION, MIGRATION_DISCORD] });
    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(ATTENDU);
    expect(await controle()).toBe(ATTENDU);
    expect((await base.query<{ n: number }>("select count(*)::int as n from internal.casino_poker_mains")).rows[0]!.n).toBe(0);
    await base.close();
  });

  it("le fichier des annonces du poker s'installe sur le poker déjà en ligne, se recolle sans rien changer, et le dit", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: [MIGRATION_DISCORD] });
    const controle = async (): Promise<string> => {
      const r = await base.exec(texteACollerDiscord());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(ATTENDU_DISCORD);
    expect(await controle()).toBe(ATTENDU_DISCORD);
    for (const role of ["anon", "authenticated"])
      expect((await base.query<{ x: boolean }>(`select has_function_privilege('${role}', 'public.casino_annonces_a_envoyer()', 'execute') as x`)).rows[0]!.x, role).toBe(false);
    const sql = texteDeMigration(MIGRATION_DISCORD);
    expect([...sql.matchAll(/create or replace function ([a-z_]+\.[a-z0-9_]+)\(/g)].map((m) => m[1])).toEqual(["public.casino_annonces_a_envoyer"]);
    expect(sql).not.toMatch(/\b(delete|update|insert|drop|truncate|alter)\b/i);
    await base.close();
    const sansPoker = await baseDeTest({ sauf: [MIGRATION, MIGRATION_DISCORD] });
    await expect(sansPoker.exec(texteACollerDiscord())).rejects.toThrow(/pas installé/);
    await sansPoker.close();
  });

  it("le fichier à coller s'arrête sans rien changer sans le casino", { timeout: LONG }, async () => {
    const sansCasino = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261123000100") });
    await expect(sansCasino.exec(texteAColler())).rejects.toThrow(/pas installé/);
    await sansCasino.exec("rollback");
    expect((await sansCasino.query<{ t: string | null }>("select to_regclass('internal.casino_poker_mains')::text as t")).rows[0]!.t).toBeNull();
    await sansCasino.close();
  });
});
