/**
 * Écrit `.cache/a-coller-loterie-bannieres.sql` (hors de Git) : la migration qui donne la bannière de chaque participant de
 * la loterie du lundi, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de
 * contrôle (docs/DIRECTION.md, « La loterie du lundi »).
 * À relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-loterie-bannieres.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261116001600_loterie_bannieres";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "bannières de la loterie : installées";

const entete = `-- LES BANNIÈRES DE LA LOTERIE (16 novembre 2026), à coller en un seul fichier.
-- Dans l'onglet « La loterie », chaque gagnant paraît devant sa bannière, dans la case de son lot.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace une fonction (internal.loterie_parts_json) par la même, avec la bannière en plus. Il
-- n'ajoute aucune table, n'efface rien. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116001600', 'loterie_bannieres', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction donne-t-elle la bannière, reste-t-elle fermée, la migration est-elle notée ?
select 'bannières de la loterie : '
  || case when position('''banniere'', m.banniere' in pg_get_functiondef('internal.loterie_parts_json(uuid, date, boolean)'::regprocedure)) > 0
       and not has_function_privilege('anon', 'internal.loterie_parts_json(uuid, date, boolean)', 'execute')
       and not has_function_privilege('authenticated', 'internal.loterie_parts_json(uuid, date, boolean)', 'execute')
       and (public.get_loterie() ->> 'error') = 'not_signed_in'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001600')
     then 'installées' else 'PAS INSTALLÉES' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-loterie-bannieres.sql", texte);
console.log(`.cache/a-coller-loterie-bannieres.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
