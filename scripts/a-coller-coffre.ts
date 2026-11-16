/**
 * Écrit `.cache/a-coller-coffre.sql` et `.cache/a-coller-coffre-images.sql` (hors de Git) : chacune des deux migrations du coffre seule, dans une transaction, notée dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le coffre du druide »).
 * À relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-coffre.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261116001000_coffre_du_druide";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "coffre du druide : installé";

const entete = `-- LE COFFRE DU DRUIDE (16 novembre 2026), à coller en un seul fichier.
-- Le jeu /coffre du serveur Discord : ses réglages, ses manches et ses essais, et les fonctions que le robot appelle.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute trois tables et six fonctions. Il n'efface rien et ne touche à rien d'existant. Collé une
-- seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116001000', 'coffre_du_druide', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les tables et les réglages sont-ils là, les fonctions fermées à tous sauf au robot, la migration notée ?
select 'coffre du druide : '
  || case when (select count(*) = 1 from internal.coffre_reglages)
       and to_regclass('internal.coffre_manches') is not null
       and to_regclass('internal.coffre_essais') is not null
       and not has_function_privilege('anon', 'public.coffre_ouvrir(text, text, text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_ouvrir(text, text, text, text)', 'execute')
       and not has_function_privilege('anon', 'public.coffre_manche(text, bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_annuler(bigint, bigint)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_ouvrir(text, text, text, text)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint)', 'execute')
       and (public.coffre_ouvrir('etat', 'etat', 'etat', 'etat') ->> 'error') = 'invalid_request'
       and exists (select 1 from cron.job where jobname = 'gal-coffre')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001000')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre.sql", texte);
console.log(`.cache/a-coller-coffre.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);

/* ---------- Le coffre en images : la seconde migration, à coller après la première ---------- */

const NOM_2 = "20261116001300_coffre_en_images";
const migration2 = readFileSync(`supabase/migrations/${NOM_2}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU_2 = "coffre en images : installé";

const entete2 = `-- LE COFFRE EN IMAGES (16 novembre 2026), à coller en un seul fichier, APRÈS le coffre du druide.
-- Les gardiens à tour de rôle, le tableau des indices, la cagnotte en statères, le podium de la semaine, les soirs spéciaux.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM_2}.sql,
-- notée comme appliquée. Il ajoute des colonnes et des fonctions. Il n'efface rien : la manche en cours, les essais et la
-- dépense comptée restent tels quels, et le robot déjà en ligne continue de marcher. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU_2} ».

begin;

`;

const fin2 = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116001300', 'coffre_en_images', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les colonnes sont-elles là, les fonctions fermées à tous sauf au robot, la migration notée ?
select 'coffre en images : '
  || case when exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'coffre_manches' and column_name = 'gardien')
       and exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'coffre_reglages' and column_name = 'cagnotte')
       and exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'coffre_essais' and column_name = 'mise')
       and not has_function_privilege('anon', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and not has_function_privilege('anon', 'public.coffre_palmares()', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_palmares()', 'execute')
       and has_function_privilege('service_role', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_palmares()', 'execute')
       and (public.coffre_ouvrir('etat', 'etat', 'etat', 'etat', 0) ->> 'error') = 'invalid_request'
       and (public.coffre_palmares() ->> 'ok') = 'true'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001300')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

const texte2 = entete2 + migration2 + fin2;
writeFileSync(".cache/a-coller-coffre-images.sql", texte2);

/* ---------- Les bannières du podium : la troisième migration, à coller après les deux autres ---------- */

const NOM_3 = "20261116001500_coffre_bannieres_du_podium";
const migration3 = readFileSync(`supabase/migrations/${NOM_3}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU_3 = "bannières du podium : installé";

const entete3 = `-- LES BANNIÈRES DU PODIUM (16 novembre 2026), à coller en un seul fichier, APRÈS le coffre en images.
-- Le podium de /perceurs montre, derrière chaque membre, la bannière qu'il a choisie pour son Gaulois.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM_3}.sql,
-- notée comme appliquée. Il remplace une fonction de lecture par la même avec un champ de plus. Il n'efface rien et ne
-- touche à aucune donnée. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU_3} ».

begin;

`;

const fin3 = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116001500', 'coffre_bannieres_du_podium', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction rend-elle la bannière, reste-t-elle fermée à tous sauf au robot, la migration est-elle notée ?
select 'bannières du podium : '
  || case when (select p.prosrc like '%banniere%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_palmares')
       and not has_function_privilege('anon', 'public.coffre_palmares()', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_palmares()', 'execute')
       and has_function_privilege('service_role', 'public.coffre_palmares()', 'execute')
       and (public.coffre_palmares() ->> 'ok') = 'true'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001500')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

const texte3 = entete3 + migration3 + fin3;
writeFileSync(".cache/a-coller-coffre-podium.sql", texte3);
console.log(`.cache/a-coller-coffre-podium.sql : ${texte3.split("\n").length} lignes`);
console.log(`.cache/a-coller-coffre-images.sql : ${texte2.split("\n").length} lignes, ${(texte2.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration2.match(/\$\$/g) ?? []).length})`);

/* ---------- La mise obligatoire : la quatrième migration, à coller après les trois autres ---------- */

const NOM_4 = "20261116001700_coffre_mise_obligatoire";
const migration4 = readFileSync(`supabase/migrations/${NOM_4}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU_4 = "mise obligatoire : installé";

const entete4 = `-- LA MISE OBLIGATOIRE DU COFFRE (16 novembre 2026), à coller en un seul fichier, APRÈS le coffre en images.
-- Chaque essai coûte au moins 20 statères, et la cagnotte est multipliée pour le gagnant selon sa mise (2, 3 ou 4 fois).
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM_4}.sql,
-- notée comme appliquée. Il remplace deux fonctions par les mêmes, avec la nouvelle règle. Il n'efface rien et ne touche à
-- aucune donnée : la manche en cours et sa cagnotte restent. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU_4} ».

begin;

`;

const fin4 = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116001700', 'coffre_mise_obligatoire', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les deux fonctions portent-elles la nouvelle règle, restent-elles fermées à tous sauf au robot, la migration est-elle notée ?
select 'mise obligatoire : '
  || case when (select p.prosrc like '%coffre_prime%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_clore' and p.pronargs = 10)
       and (select p.prosrc like '%then 20 else p_mise%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_ouvrir' and p.pronargs = 5)
       and not has_function_privilege('anon', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and (public.coffre_ouvrir('etat', 'etat', 'etat', 'etat', 0) ->> 'error') = 'invalid_request'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001700')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

const texte4 = entete4 + migration4 + fin4;
writeFileSync(".cache/a-coller-coffre-mise.sql", texte4);
console.log(`.cache/a-coller-coffre-mise.sql : ${texte4.split("\n").length} lignes, ${(texte4.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration4.match(/\$\$/g) ?? []).length})`);

/* ---------- La mise de 10 statères et la garde : la cinquième migration, à coller après la mise obligatoire ---------- */

const NOM_5 = "20261117000100_coffre_mise_dix_et_garde";
const migration5 = readFileSync(`supabase/migrations/${NOM_5}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU_5 = "mise de 10 et garde : installé";

const entete5 = `-- LA MISE DE 10 STATÈRES ET LA GARDE (17 novembre 2026), à coller en un seul fichier, APRÈS la mise obligatoire.
-- Chaque essai coûte 10 statères, et la cagnotte du gagnant est multipliée selon la garde du gardien (2 à 5 fois).
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM_5}.sql,
-- notée comme appliquée. Il remplace deux fonctions par les mêmes, avec la nouvelle règle, et refait la règle qui dit quelles
-- mises un essai peut porter. Il n'efface rien et ne touche à aucune donnée : la manche en cours et sa cagnotte restent.
-- Collé une seconde fois, il ne change rien. La dernière ligne doit dire : « ${ATTENDU_5} ».

begin;

`;

const fin5 = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117000100', 'coffre_mise_dix_et_garde', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les deux fonctions portent-elles la nouvelle règle, une mise de 10 est-elle acceptée, les droits et la note sont-ils là ?
select 'mise de 10 et garde : '
  || case when (select p.prosrc like '%v_garde + 1%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_clore' and p.pronargs = 10)
       and (select p.prosrc like '%internal.coffre_garde(p_manche, p_essai)%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_clore' and p.pronargs = 10)
       and internal.coffre_garde(coalesce((select max(id) from internal.coffre_manches), 0), 0) between 1 and 4
       and not has_function_privilege('anon', 'internal.coffre_garde(bigint, bigint)', 'execute')
       and not has_function_privilege('authenticated', 'internal.coffre_garde(bigint, bigint)', 'execute')
       and (select p.prosrc like '%v_mise integer := 10;%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_ouvrir' and p.pronargs = 5)
       and (select count(*) = 1 and bool_and(pg_get_constraintdef(c.oid) like '%0, 10, 20%') from pg_constraint c where c.conrelid = 'internal.coffre_essais'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%mise%')
       and not has_function_privilege('anon', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and (public.coffre_ouvrir('etat', 'etat', 'etat', 'etat', 0) ->> 'error') = 'invalid_request'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000100')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

const texte5 = entete5 + migration5 + fin5;
writeFileSync(".cache/a-coller-coffre-garde.sql", texte5);
console.log(`.cache/a-coller-coffre-garde.sql : ${texte5.split("\n").length} lignes, ${(texte5.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration5.match(/\$\$/g) ?? []).length})`);
