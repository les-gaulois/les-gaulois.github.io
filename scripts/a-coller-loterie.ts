/**
 * Écrit `.cache/a-coller-loterie.sql` (hors de Git) : la migration de la loterie du lundi seule, dans une transaction, notée
 * dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « La loterie du lundi »).
 * À relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-loterie.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261116001200_loterie_du_lundi";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "loterie du lundi : installée";

const entete = `-- LA LOTERIE DU LUNDI (16 novembre 2026), à coller en un seul fichier.
-- Le tirage du lundi à 21 h 30 dans « Mon Gaulois » : les billets, les achats, le tirage, les lots et les pochettes gagnées.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute quatre tables, un index et quinze fonctions, et remplace deux fonctions par les mêmes
-- avec un ajout : internal.village_debiter (les pochettes gagnées) et internal.village_god_mouvement (un lot gagné pendant
-- un essai du mode GOD reste un vrai gain). Il n'efface rien. Collé une seconde fois, il ne change rien.
-- Le premier tirage aura lieu le lundi 23 novembre 2026 à 21 h 30.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116001200', 'loterie_du_lundi', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les tables sont-elles là, les fonctions fermées aux visiteurs et ouvertes aux comptes connectés, les deux
-- tâches planifiées, les lots ceux du pilote, la migration notée ?
select 'loterie du lundi : '
  || case when to_regclass('internal.loterie_achats') is not null
       and to_regclass('internal.loterie_tirages') is not null
       and to_regclass('internal.loterie_parts') is not null
       and to_regclass('internal.loterie_bons') is not null
       and not has_function_privilege('anon', 'public.get_loterie()', 'execute')
       and not has_function_privilege('anon', 'public.acheter_billets_loterie(integer, integer)', 'execute')
       and not has_function_privilege('anon', 'public.get_pochettes_gagnees()', 'execute')
       and has_function_privilege('authenticated', 'public.get_loterie()', 'execute')
       and has_function_privilege('authenticated', 'public.acheter_billets_loterie(integer, integer)', 'execute')
       and has_function_privilege('authenticated', 'public.get_pochettes_gagnees()', 'execute')
       and not has_function_privilege('authenticated', 'internal.loterie_tirer(date)', 'execute')
       and not has_function_privilege('authenticated', 'internal.village_debiter(uuid, text, integer, text)', 'execute')
       and (public.get_loterie() ->> 'error') = 'not_signed_in'
       and (select sum(gain) = 5250 and count(*) = 3 from internal.loterie_lots())
       and internal.loterie_tirage_a_venir(timestamptz '2026-11-17 12:00:00+01') = date '2026-11-23'
       and internal.loterie_pochette_de('pochette', 'familier/x') = 'familiers'
       and internal.loterie_pochette_de('pochette', 'autre/x') is null
       and position('loterie_lot' in pg_get_functiondef('internal.village_god_mouvement()'::regprocedure)) > 0
       and (select count(*) = 2 from cron.job where jobname in ('gal-loterie', 'gal-loterie-rattrapage'))
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001200')
     then 'installée' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-loterie.sql", texte);
console.log(`.cache/a-coller-loterie.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
