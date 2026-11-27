/**
 * Écrit `.cache/a-coller-dons-a-soi.sql` (hors de Git) : la migration qui cache les dons à soi-même de la liste « Derniers
 * dons » (le pilote, 28 novembre 2026 : « fait en sorte que tout les don concernant jod a l'avenir ne s'affiche plus »),
 * seule, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle
 * (« Le don de statères » de docs/DIRECTION.md). À relancer depuis la racine du dépôt après tout changement de la
 * migration : `npx tsx scripts/a-coller-dons-a-soi.ts`. N'envoie rien et ne lit que le dépôt. Le fichier est essayé sur
 * le banc PGlite (`tests/unit/dons-a-soi.test.ts`).
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const VERSION = "20261128000100";
export const NOM = `${VERSION}_dons_a_soi_caches`;
export const FICHIER = ".cache/a-coller-dons-a-soi.sql";
/** La dernière ligne quand tout est installé. */
export const ATTENDU = "dons : installé, les dons à soi-même sont cachés de la liste";

const entete = `-- LES DONS À SOI-MÊME CACHÉS (28 novembre 2026), à coller en un seul fichier.
-- La liste « Derniers dons » (Direction, onglet Village) ne montre plus les dons faits à Jod, d'avant comme d'après.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace une seule fonction, celle qui lit la liste ; il n'efface rien : les dons, les statères
-- et le journal de l'équipe restent tels quels. Collé une seconde fois, il ne change rien de plus.
-- Il suppose le don de statères déjà installé (en ligne depuis le 17 novembre 2026) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.get_stateres_don()') is null
    or to_regclass('internal.stateres_dons') is null then
    raise exception 'Le don de statères n''est pas installé : rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'dons_a_soi_caches', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la lecture qui écarte les dons à soi-même, ses droits, la migration notée.
select case when pg_get_functiondef('public.get_stateres_don()'::regprocedure) like '%d.user_id <> v_uid%'
       and has_function_privilege('authenticated', 'public.get_stateres_don()', 'execute')
       and not has_function_privilege('anon', 'public.get_stateres_don()', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
     then '${ATTENDU}'
     else 'PAS INSTALLÉ' end as controle;
`;

/** Le fichier à coller : la migration, dans une transaction, notée comme appliquée, puis la ligne de contrôle. */
export function texteAColler(): string {
  const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  return entete + migration + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-dons-a-soi.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ »`);
  console.log(`Dernière ligne attendue : « ${ATTENDU} »`);
}
