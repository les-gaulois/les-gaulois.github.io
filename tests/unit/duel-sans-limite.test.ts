/**
 * Le fichier à coller du duel sans limite de trois (migration 20261127000200_duel_sans_limite_de_trois, demande du pilote du
 * 27 novembre 2026), sur le banc PGlite de toutes les migrations du dépôt : collé après toutes les autres, il dit les limites
 * installées ; recollé, il ne change rien de plus ; sans le duel, il s'arrête sans rien changer. Les règles elles-mêmes
 * (duels comptés, matchs contre un même Gaulois) sont essayées dans `duel-serveur.test.ts` et `duel-salles.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { ATTENDU, NOM, VERSION, texteAColler } from "../../scripts/a-coller-duel-sans-limite";
import { baseDeTest, migrations } from "./banc-pglite";

const LONG = 300_000;
const MIGRATION = `${NOM}.sql`;

describe("le fichier à coller du duel sans limite de trois", () => {
  it("est la dernière migration du duel, et le fichier la contient telle quelle", () => {
    expect(migrations()).toContain(MIGRATION);
    expect(texteAColler()).toContain("create or replace function internal.duel_comptes_du_jour(p_uid uuid) returns integer");
  });

  it("collé après les autres migrations, dit les limites installées ; recollé, ne change rien de plus", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: migrations().filter((m) => m >= MIGRATION) });
    const avant = (await base.query<{ n: number }>("select internal.duel_comptes_du_jour('00000000-0000-0000-0000-000000000000'::uuid) as n")).rows[0]!.n;
    expect(avant).toBe(3);
    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(ATTENDU);
    expect(await controle()).toBe(ATTENDU);
    expect((await base.query<{ n: number }>("select count(*)::int as n from supabase_migrations.schema_migrations where version = $1", [VERSION])).rows[0]!.n).toBe(1);
    await base.close();
  });

  it("s'arrête sans rien changer quand le duel n'est pas installé", { timeout: LONG }, async () => {
    const sansDuel = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261122000100") });
    await expect(sansDuel.exec(texteAColler())).rejects.toThrow(/pas installés/);
    await sansDuel.exec("rollback");
    expect((await sansDuel.query<{ t: string | null }>("select to_regprocedure('internal.duel_comptes_du_jour(uuid)')::text as t")).rows[0]!.t).toBeNull();
    await sansDuel.close();
  });
});
