/**
 * Écrit `.cache/a-coller-familiers.sql` (hors de Git) : la migration des familiers du Gaulois, seule, dans une transaction,
 * notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le village des
 * Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-familiers.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FAMILIERS } from "../supabase/functions/code-discord/familiers/index";

const NOM = "20261115000800_familiers_du_gaulois";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = `familiers : ${FAMILIERS.length} installés`;

const entete = `-- LES FAMILIERS DU GAULOIS (15 novembre 2026), à coller en un seul fichier.
-- Les ${FAMILIERS.length} familiers, la pochette des familiers à 2 000 statères, le familier montré à côté du Gaulois et sur /gaulois.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute trois tables, une colonne et des fonctions ; il remplace la fonction de /gaulois et celle
-- de la sauvegarde par les mêmes, avec les familiers en plus. Il n'efface rien et ne touche aucun Gaulois, aucun objet ni
-- aucun statère. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261115000800', 'familiers_du_gaulois', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les familiers, la pochette à 2 000 statères au moins, les fonctions ouvertes aux seuls comptes connectés
-- (et /gaulois à la seule clé de service), la sauvegarde en version 7.
select 'familiers : '
  || case when (select count(*) from internal.familiers) = ${FAMILIERS.length}
       and (select prix from internal.familiers_pochette where id) >= 2000
       and exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'gaulois' and column_name = 'familier')
       and has_function_privilege('authenticated', 'public.get_mes_familiers()', 'execute')
       and has_function_privilege('authenticated', 'public.ouvrir_pochette_familiers(integer)', 'execute')
       and has_function_privilege('authenticated', 'public.choisir_familier(text)', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_familiers()', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_pochette_familiers(integer)', 'execute')
       and not has_function_privilege('anon', 'public.choisir_familier(text)', 'execute')
       and not has_function_privilege('authenticated', 'public.discord_gaulois(text)', 'execute')
       and (public.export_site() ->> 'version') = '7'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261115000800')
     then '${FAMILIERS.length} installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-familiers.sql", texte);
console.log(`.cache/a-coller-familiers.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
