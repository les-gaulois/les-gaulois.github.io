/**
 * Écrit `.cache/a-coller-pronostics.sql` (hors de Git) : la migration des pronostics avec mise seule, dans une transaction,
 * notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le pronostic
 * de la semaine »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-pronostics.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261115000400_pronostics_avec_mise";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "pronostics avec mise : installés";

const entete = `-- LES PRONOSTICS AVEC MISE (15 novembre 2026), à coller en un seul fichier.
-- Au QG, onglet « La semaine » : un pronostic se pose une fois, avec une mise en statères, et ne change plus. La cagnotte
-- va aux plus proches du résultat ; aucun statère n'est créé. Chacun voit qui a misé quoi.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute deux colonnes et une table, remplace la fonction des pronostics et celle des outils du
-- QG. Il n'efface aucune donnée. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261115000400', 'pronostics_avec_mise', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les colonnes, la table, les fonctions et leurs droits.
select 'pronostics avec mise : '
  || case when (select count(*) = 2 from information_schema.columns where table_schema = 'internal' and table_name = 'predictions' and column_name in ('mise', 'gain'))
       and (select c.relrowsecurity from pg_class c where c.oid = to_regclass('internal.prediction_results'))
       and not has_table_privilege('authenticated', 'internal.prediction_results', 'select')
       and not has_function_privilege('authenticated', 'internal.prediction_refund_stale()', 'execute')
       and not has_function_privilege('authenticated', 'internal.prediction_forget_old()', 'execute')
       and not has_function_privilege('authenticated', 'internal.prediction_stake_max()', 'execute')
       and to_regprocedure('public.save_prediction(integer)') is null
       and has_function_privilege('authenticated', 'public.place_prediction(date, integer, integer)', 'execute')
       and not has_function_privilege('anon', 'public.place_prediction(date, integer, integer)', 'execute')
       and not has_function_privilege('anon', 'public.settle_predictions(date, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.settle_predictions(date, integer)', 'execute')
       and has_function_privilege('service_role', 'public.settle_predictions(date, integer)', 'execute')
       and (select p.prosrc like '%stake_max%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'get_qg_tools')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261115000400')
     then 'installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-pronostics.sql", texte);
console.log(`.cache/a-coller-pronostics.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
