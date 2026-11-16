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
console.log(`.cache/a-coller-coffre-images.sql : ${texte2.split("\n").length} lignes, ${(texte2.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration2.match(/\$\$/g) ?? []).length})`);
