/**
 * Écrit `.cache/a-coller-coffre.sql` (hors de Git) : la migration du coffre du druide seule, dans une transaction, notée dans
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
