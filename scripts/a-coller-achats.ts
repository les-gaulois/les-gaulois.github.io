/**
 * Écrit `.cache/a-coller-salon-achats.sql` (hors de Git) : la migration du salon Discord des achats du village seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (README, « Les achats du
 * village sur Discord »). Les migrations d'avant, 20261114001700_village_achats_sur_discord et 20261115000100_achats_nom_discord,
 * ont été collées par le pilote le 15 novembre 2026 : elles ne se recollent pas. À relancer depuis la racine du dépôt après
 * tout changement de la migration : `npx tsx scripts/a-coller-achats.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261115000200_salon_des_achats";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "salon des achats : installé";

const entete = `-- LE SALON DISCORD DES ACHATS DU VILLAGE (15 novembre 2026), à coller en un seul fichier.
-- Dans Direction > Discord, un salon de plus : celui où le robot poste les achats du village. Sans réglage, ils partent dans
-- le salon des nouvelles, comme avant.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il élargit la liste des salons permis et remplace les fonctions des salons par les mêmes, avec ce
-- salon en plus. Il n'efface rien et ne touche aucun réglage existant. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261115000200', 'salon_des_achats', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le salon est-il permis, rendu au robot, et les droits sont-ils les mêmes ?
select 'salon des achats : '
  || case when (select pg_get_constraintdef(c.oid) like '%achats%' from pg_constraint c where c.conname = 'discord_salons_salon_check')
       and (select pg_get_constraintdef(c.oid) like '%achats%' from pg_constraint c where c.conname = 'discord_salon_checks_salon_check')
       and (select bool_and(p.prosrc like '%achats%') and count(*) = 7 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where (s.nspname, p.proname) in (('internal', 'discord_salon_test'), ('public', 'get_discord_salons'), ('public', 'save_discord_salon'),
              ('public', 'test_discord_salon'), ('public', 'clear_discord_salon'), ('public', 'robot_discord_salons'), ('public', 'note_discord_salon')))
       and not has_function_privilege('anon', 'public.robot_discord_salons()', 'execute')
       and not has_function_privilege('authenticated', 'public.robot_discord_salons()', 'execute')
       and has_function_privilege('authenticated', 'public.save_discord_salon(text, text)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261115000200')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-salon-achats.sql", texte);
console.log(`.cache/a-coller-salon-achats.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
