/**
 * Écrit `.cache/a-coller-vitrine.sql` (hors de Git) : la migration de la vitrine des Gaulois, seule, dans une transaction,
 * notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le village des
 * Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-vitrine.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261116000200_vitrine_des_gaulois";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "vitrine : installée";

const entete = `-- LA VITRINE DES GAULOIS (16 novembre 2026), à coller en un seul fichier.
-- Dans « Mon Gaulois », l'onglet « La vitrine » montre tous les Gaulois du clan : il lui faut, en plus de leur tenue, le
-- familier et la bannière que chacun a choisis.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace une fonction de lecture par la même, avec ces deux choix en plus. Il n'efface rien et
-- ne touche aucun Gaulois, aucun objet, aucun familier, aucune bannière ni aucun statère. Collé une seconde fois, il ne
-- change rien.
-- Il suppose les familiers et les bannières déjà collés (ils sont en ligne depuis le 15 novembre 2026) : sinon, il s'arrête
-- sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'gaulois' and column_name = 'familier')
    or not exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'gaulois' and column_name = 'banniere') then
    raise exception 'Les familiers ou les bannières ne sont pas installés : collez-les d''abord. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116000200', 'vitrine_des_gaulois', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la place rend le familier et la bannière, et reste fermée aux visiteurs.
select 'vitrine : '
  || case when pg_get_functiondef('public.get_village()'::regprocedure) like '%''familier'', g.familier%'
       and pg_get_functiondef('public.get_village()'::regprocedure) like '%''banniere'', g.banniere%'
       and has_function_privilege('authenticated', 'public.get_village()', 'execute')
       and not has_function_privilege('anon', 'public.get_village()', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116000200')
     then 'installée' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-vitrine.sql", texte);
console.log(`.cache/a-coller-vitrine.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
