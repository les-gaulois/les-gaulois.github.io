/**
 * Écrit `.cache/a-coller-achats-discord.sql` (hors de Git) : la migration du nom Discord des achats du village seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (README, « Les achats du
 * village sur Discord »). La migration d'avant, 20261114001700_village_achats_sur_discord, a été collée par le pilote le
 * 15 novembre 2026 : elle ne se recolle pas. À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-achats.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261115000100_achats_nom_discord";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "achats du village : nom Discord installé";

const entete = `-- LE NOM DISCORD SUR LES ACHATS DU VILLAGE (15 novembre 2026), à coller en un seul fichier.
-- Le robot écrit « @ » et le nom Discord de l'acheteur sur l'image des objets reçus au village.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run », APRÈS le fichier des achats du village
-- (.cache/a-coller-achats.sql), déjà collé. Il contient la seule migration ${NOM}.sql, notée comme appliquée. Il remplace
-- la fonction de lecture du robot par la même, qui rend en plus le nom Discord. Il n'efface rien et ne touche aucune donnée.
-- Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261115000100', 'achats_nom_discord', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction rend-elle le nom Discord, toujours fermée aux visiteurs et aux comptes, ouverte au robot ?
select 'achats du village : '
  || case when (select p.prosrc like '%pl.discord_name%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                where s.nspname = 'public' and p.proname = 'achats_du_village')
       and not has_function_privilege('anon', 'public.achats_du_village(bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.achats_du_village(bigint)', 'execute')
       and has_function_privilege('service_role', 'public.achats_du_village(bigint)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261115000100')
     then 'nom Discord installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-achats-discord.sql", texte);
console.log(`.cache/a-coller-achats-discord.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
