/**
 * La file des gros gains du casino (migration 20261126000100, choix du pilote du 26 novembre 2026 : « 1 000 statères ou
 * plus »), sur le banc PGlite de toutes les migrations : des coups joués par les vraies fonctions des membres, avec un hasard
 * d'essai, puis lus comme le robot les lit (`lireReponseDuCasino`). Seuls les coups qui gagnent au moins 1 000 statères,
 * après le point de départ, hors mode GOD, d'un compte validé ; un coup noté ne repart pas ; seule la clé de service lit et
 * note ; le salon « casino » est connu du robot ; le fichier que colle le pilote se recolle sans rien changer.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTENDU, NOMS, texteAColler } from "../../scripts/a-coller-casino-discord";
import { SEUIL_DU_CASINO, chanceDuCoup, lireReponseDuCasino } from "../../src/lib/casino-discord";
import { ROBOT_SALONS } from "../../src/lib/salon-lien";
import { baseDeTest, commeMembre, discordDe, migrations, nouveauMembre, texteDeMigration } from "./banc-pglite";

const LONG = 300_000;
const MIGRATION = `${NOMS[0]}.sql`;
let db: PGlite;

beforeAll(async () => {
  db = await baseDeTest();
  await db.exec(`
    -- Le hasard d'essai : les valeurs de public.t_hasard, dans l'ordre, puis le vrai hasard du serveur quand elles manquent.
    create table public.t_hasard (i bigserial primary key, v integer not null);
    alter function internal.casino_entier(integer) rename to casino_entier_vrai;
    create function internal.casino_entier(p_n integer) returns integer language plpgsql volatile as $$
    declare v_i bigint; v_v integer;
    begin
      select h.i, h.v into v_i, v_v from public.t_hasard h order by h.i limit 1;
      if v_i is null then return internal.casino_entier_vrai(p_n); end if;
      delete from public.t_hasard where i = v_i;
      return v_v;
    end $$;
  `);
}, LONG);
afterAll(async () => db?.close());

const pousser = async (valeurs: readonly number[]): Promise<void> => {
  await db.query("delete from public.t_hasard where true");
  for (const v of valeurs) await db.query("insert into public.t_hasard (v) values ($1)", [v]);
};
/** Un membre validé, avec son Gaulois, 20 000 statères et un nom Discord. */
async function joueur(discord: string | null = null): Promise<string> {
  const uid = await nouveauMembre(db);
  await db.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'don', 20000, 'essai')", [uid]);
  if (discord) await db.query("update public.private_links set discord_name = $2 where user_id = $1", [uid, discord]);
  return uid;
}
const jouer = async (uid: string, appel: string, hasard: readonly number[]): Promise<{ ok: boolean; partie: number; rendu: number; mise: number }> => {
  await pousser(hasard);
  const r = await commeMembre<{ ok: boolean; partie: number; rendu: number; mise: number }>(db, uid, `select ${appel} as r`);
  expect(r.ok, appel).toBe(true);
  return r;
};
const file = async (): Promise<{ ok: boolean; seuil: number; annonces: { partie: number; jeu: string; mise: number; rendu: number; nom: string; discord: string | null }[] }> =>
  (await db.query<{ r: never }>("select public.casino_annonces_a_envoyer() as r")).rows[0]!.r;
const numeros = async (): Promise<number[]> => (await file()).annonces.map((a) => a.partie);
const noter = async (parties: number[]): Promise<{ ok: boolean; notees?: number; error?: string }> =>
  (await db.query<{ r: never }>("select public.noter_annonces_casino($1::bigint[]) as r", [parties])).rows[0]!.r;

describe("la file des gros gains", () => {
  it("garde le même seuil que le robot", async () => {
    expect((await db.query<{ s: number }>("select internal.casino_annonce_seuil() as s")).rows[0]!.s).toBe(SEUIL_DU_CASINO);
    expect((await file()).seuil).toBe(SEUIL_DU_CASINO);
    // l'index de la file reprend le seuil en chiffre
    const index = (await db.query<{ d: string }>("select indexdef as d from pg_indexes where indexname = 'casino_parties_gros_gains'")).rows[0]?.d;
    expect(index).toContain(`>= ${SEUIL_DU_CASINO})`);
  });

  it("rend chaque coup qui gagne 1 000 statères ou plus, avec son tirage, que le robot relit et recompte", { timeout: LONG }, async () => {
    const uid = await joueur("druide.des.bois");
    const machine = await jouer(uid, "public.jouer_machine(20)", [0]); // 100 fois : 2 000 rendus, 1 980 gagnés
    const petite = await jouer(uid, "public.jouer_machine(10)", [0]); // 100 fois : 990 gagnés, sous le seuil
    const palissade = await jouer(uid, "public.jouer_palissade(200)", [1, 1, 1, 1, 1, 1, 1, 1]); // 19 fois
    const course = await jouer(uid, "public.jouer_course(5, 100)", [23]); // le couloir de 24 fois
    const roue = await jouer(uid, `public.jouer_roue('{"n17":40,"bleu":160}'::jsonb)`, [16]); // le 17, bleu
    const des = await jouer(uid, `public.jouer_des('{"s2":50}'::jsonb)`, [0, 0]); // deux as : 36 fois
    const perdu = await jouer(uid, "public.jouer_course(5, 200)", [0]); // perdu
    const vingtEtUn = await jouer(uid, "public.distribuer_vingt_et_un(200)", []);
    expect(petite.rendu - petite.mise).toBe(990);

    const lus = await numeros();
    expect(lus).toEqual([machine.partie, palissade.partie, course.partie, roue.partie, des.partie]);
    expect(lus).not.toContain(petite.partie);
    expect(lus).not.toContain(perdu.partie);
    expect(lus).not.toContain(vingtEtUn.partie);

    const lecture = lireReponseDuCasino(await file());
    expect(lecture?.illisibles).toEqual([]);
    expect(lecture?.gains.map((g) => [g.tirage.jeu, g.mise, g.rendu, g.discord])).toEqual([
      ["machine", 20, 2000, "druide.des.bois"],
      ["palissade", 200, 3800, "druide.des.bois"],
      ["course", 100, 2400, "druide.des.bois"],
      ["roue", 200, 1760, "druide.des.bois"],
      ["des", 50, 1800, "druide.des.bois"],
    ]);
    expect(lecture?.gains.map((g) => chanceDuCoup(g))).toEqual([
      { sur: 1, parmi: 500 },
      { sur: 1, parmi: 128 },
      { sur: 1, parmi: 24 },
      { sur: 1, parmi: 36 },
      { sur: 1, parmi: 36 },
    ]);
    await noter(lus);
  });

  it("ne rend ni un essai du mode GOD, ni un compte qui n'est plus validé, ni un coup d'avant le point de départ, ni un coup de plus de 48 heures", { timeout: LONG }, async () => {
    const titulaire = await joueur();
    await db.query("insert into internal.village_god_titulaire (discord_id) values ($1)", [await discordDe(db, titulaire)]);
    expect(await commeMembre(db, titulaire, "select public.activer_village_god() as r")).toMatchObject({ ok: true, actif: true });
    const essai = await jouer(titulaire, "public.jouer_machine(200)", [0]);
    expect(essai).toMatchObject({ god: true, rendu: 20000 });

    const parti = await joueur();
    const duParti = await jouer(parti, "public.jouer_machine(200)", [0]);
    await db.query("update public.profiles set status = 'pending' where user_id = $1", [parti]);

    const vieux = await joueur();
    const ancien = await jouer(vieux, "public.jouer_machine(200)", [0]);
    await db.query("update internal.casino_parties set fini_le = now() - interval '49 hours', cree_le = now() - interval '49 hours' where id = $1", [ancien.partie]);

    const lus = await numeros();
    expect(lus).not.toContain(essai.partie);
    expect(lus).not.toContain(duParti.partie);
    expect(lus).not.toContain(ancien.partie);

    const recent = await joueur();
    const avant = await jouer(recent, "public.jouer_machine(200)", [0]);
    const depart = (await db.query<{ p: string }>("select partie as p from internal.casino_annonces_depart")).rows[0]!.p;
    await db.query("update internal.casino_annonces_depart set partie = $1 where id", [avant.partie]);
    const apres = await jouer(recent, "public.jouer_machine(200)", [0]);
    expect(await numeros()).toEqual([apres.partie]);
    await db.query("update internal.casino_annonces_depart set partie = $1 where id", [depart]);
    await noter(await numeros());
  });

  it("ne rend plus un coup noté ; la note ignore un numéro inconnu et refuse plus de 100 numéros", { timeout: LONG }, async () => {
    const uid = await joueur();
    const a = await jouer(uid, "public.jouer_machine(200)", [0]);
    const b = await jouer(uid, "public.jouer_machine(200)", [0]);
    expect(await numeros()).toEqual([a.partie, b.partie]);
    expect(await noter([a.partie, 999_999])).toEqual({ ok: true, notees: 1 });
    expect(await noter([a.partie])).toEqual({ ok: true, notees: 0 });
    expect(await numeros()).toEqual([b.partie]);
    expect(await noter(Array.from({ length: 101 }, (_, i) => i + 1))).toMatchObject({ ok: false, error: "invalid_request" });
    expect(await noter([b.partie])).toEqual({ ok: true, notees: 1 });
    expect(await numeros()).toEqual([]);
  });

  it("rend 20 coups au plus, les plus anciens d'abord, avec le nom de secours sans nom Discord", { timeout: LONG }, async () => {
    const uid = await joueur();
    const joues: number[] = [];
    for (let i = 0; i < 22; i++) joues.push((await jouer(uid, "public.jouer_machine(200)", [0])).partie);
    const f = await file();
    expect(f.annonces.map((a) => a.partie)).toEqual(joues.slice(0, 20));
    expect(f.annonces[0]).toMatchObject({ discord: null });
    expect(f.annonces[0]!.nom).toMatch(/^Gaulois n° \d+$/);
    await noter(joues);
  });
});

describe("les droits", () => {
  it("seule la clé de service lit et note la file ; les tables restent privées", async () => {
    for (const f of ["public.casino_annonces_a_envoyer()", "public.noter_annonces_casino(bigint[])", "internal.casino_annonce_seuil()"]) {
      for (const role of ["anon", "authenticated"]) {
        expect((await db.query<{ x: boolean }>(`select has_function_privilege('${role}', '${f}', 'execute') as x`)).rows[0]!.x, `${role} ${f}`).toBe(false);
      }
    }
    for (const f of ["public.casino_annonces_a_envoyer()", "public.noter_annonces_casino(bigint[])"]) {
      expect((await db.query<{ x: boolean }>(`select has_function_privilege('service_role', '${f}', 'execute') as x`)).rows[0]!.x, f).toBe(true);
    }
    for (const t of ["internal.casino_annonces", "internal.casino_annonces_depart"]) {
      for (const role of ["anon", "authenticated"]) expect((await db.query<{ x: boolean }>(`select has_table_privilege('${role}', '${t}', 'select') as x`)).rows[0]!.x, `${role} ${t}`).toBe(false);
    }
  });

  it("ne remplace aucune fonction du jeu et ne touche à aucune partie", () => {
    const sql = texteDeMigration(MIGRATION);
    const remplacees = [...sql.matchAll(/create or replace function ([a-z_]+\.[a-z0-9_]+)\(/g)].map((m) => m[1]!);
    expect(remplacees.filter((f) => /jouer|casino_(finir|miser|rendre|coup|nouvelle_partie|entier)|distribuer|get_casino/.test(f))).toEqual([]);
    expect(sql).not.toMatch(/\b(update|delete from|truncate|drop table|drop column)\b[^;]*casino_parties/i);
    expect(sql).not.toMatch(/create trigger/i);
  });
});

describe("le salon du casino", () => {
  it("est connu du robot et des contrôles, comme chaque salon du robot", async () => {
    const liens = (await db.query<{ r: Record<string, unknown> }>("select public.robot_discord_salons() as r")).rows[0]!.r;
    expect(Object.keys(liens).sort()).toEqual([...ROBOT_SALONS].sort());
    expect(liens["casino"]).toBeNull();
    expect((await db.query<{ r: unknown }>("select public.note_discord_salon('casino', 'none', null, null) as r")).rows[0]!.r).toEqual({ ok: true });
    await db.query("insert into internal.discord_salons (salon, webhook_url) values ('casino', 'https://discord.com/api/webhooks/723456789012345678/casinocasinocasinocasino') on conflict (salon) do nothing");
    expect((await db.query<{ r: Record<string, unknown> }>("select public.robot_discord_salons() as r")).rows[0]!.r["casino"]).toBe("https://discord.com/api/webhooks/723456789012345678/casinocasinocasinocasino");
    await db.query("delete from internal.discord_salons where salon = 'casino'");
    await expect(db.query("insert into internal.discord_salons (salon, webhook_url) values ('roulette', 'https://discord.com/api/webhooks/723456789012345678/roulettedurouletteduroul')")).rejects.toThrow();
  });
});

/* ---------- Le fichier que colle le pilote ---------- */

describe("le fichier à coller", () => {
  it("s'installe après les migrations qui le précèdent, se recolle sans rien changer, et le dit", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: migrations().filter((m) => m >= MIGRATION) });
    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(ATTENDU);
    expect(await controle()).toBe(ATTENDU);
    expect((await base.query<{ n: number }>("select count(*)::int as n from internal.casino_annonces_depart")).rows[0]!.n).toBe(1);
    await base.close();
  });

  it("s'arrête sans rien changer quand le casino n'est pas installé", { timeout: LONG }, async () => {
    const sansCasino = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261123000100") });
    await expect(sansCasino.exec(texteAColler())).rejects.toThrow(/pas installés/);
    await sansCasino.exec("rollback");
    expect((await sansCasino.query<{ t: string | null }>("select to_regclass('internal.casino_annonces')::text as t")).rows[0]!.t).toBeNull();
    await sansCasino.close();
  });
});
