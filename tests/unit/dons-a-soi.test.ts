/**
 * Le fichier à coller des dons à soi-même cachés (migration 20261128000100_dons_a_soi_caches, demande du pilote du
 * 28 novembre 2026), sur le banc PGlite de toutes les migrations du dépôt : collé après toutes les autres, la liste
 * « Derniers dons » du titulaire ne montre plus les dons qu'il s'est faits, sans rien effacer ; recollé, il ne change rien
 * de plus ; sans le don de statères, il s'arrête sans rien changer.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ATTENDU, NOM, VERSION, texteAColler } from "../../scripts/a-coller-dons-a-soi";
import { baseDeTest, commeMembre, discordDe, migrations, nouveauMembre } from "./banc-pglite";

const LONG = 300_000;
const MIGRATION = `${NOM}.sql`;

type Panneau = { permis: boolean; dons: { nom: string; montant: number }[] };

describe("le fichier à coller des dons à soi-même cachés", () => {
  it("est la dernière migration du don, et le fichier la contient telle quelle", () => {
    expect(migrations()).toContain(MIGRATION);
    expect(texteAColler()).toContain("where d.user_id <> v_uid");
  });

  it("collé après les autres migrations, cache les dons du titulaire à lui-même sans rien effacer ; recollé, ne change rien de plus", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: migrations().filter((m) => m >= MIGRATION) });
    const titulaire = await nouveauMembre(base);
    const autre = await nouveauMembre(base);
    await base.query("insert into internal.stateres_don_titulaire (discord_id) values ($1)", [await discordDe(base, titulaire)]);
    const donner = (a: string, montant: number) =>
      commeMembre<{ ok: boolean }>(base, titulaire, "select public.donner_stateres($1, $2, null, $3) as r", [a, montant, randomUUID()]);
    expect((await donner(titulaire, 5000)).ok).toBe(true);
    expect((await donner(autre, 400)).ok).toBe(true);
    const liste = async () => (await commeMembre<Panneau>(base, titulaire, "select public.get_stateres_don() as r")).dons.map((d) => d.montant);
    expect(await liste()).toEqual([400, 5000]);

    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(ATTENDU);
    expect(await liste()).toEqual([400]);
    expect(await controle()).toBe(ATTENDU);
    expect(await liste()).toEqual([400]);

    // Rien n'est effacé : les deux dons, leurs statères et le journal de l'équipe restent.
    const compte = async (sql: string) => (await base.query<{ n: number }>(sql)).rows[0]!.n;
    expect(await compte("select count(*)::int as n from internal.stateres_dons")).toBe(2);
    expect(await compte("select count(*)::int as n from internal.stateres_mouvements where nature = 'don'")).toBe(2);
    expect(await compte("select count(*)::int as n from public.admin_log where action = 'stateres_don'")).toBe(2);
    // Un autre compte ne voit toujours rien.
    expect((await commeMembre<Panneau>(base, autre, "select public.get_stateres_don() as r")).permis).toBe(false);
    expect(await compte(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${VERSION}'`)).toBe(1);
    await base.close();
  });

  it("s'arrête sans rien changer quand le don de statères n'est pas installé", { timeout: LONG }, async () => {
    const sansDon = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261117000200") });
    await expect(sansDon.exec(texteAColler())).rejects.toThrow(/pas installé/);
    await sansDon.exec("rollback");
    expect((await sansDon.query<{ t: string | null }>("select to_regprocedure('public.get_stateres_don()')::text as t")).rows[0]!.t).toBeNull();
    await sansDon.close();
  });
});
