/**
 * Écrit `.cache/a-coller-achats.sql` (hors de Git) : la migration des achats du village annoncés sur Discord seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (README, « Les achats du
 * village sur Discord »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-achats.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261114001700_village_achats_sur_discord";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "achats du village : installés";

const entete = `-- LES ACHATS DU VILLAGE SUR DISCORD (14 novembre 2026), à coller en un seul fichier.
-- Le robot poste, sur le salon des nouvelles, l'image des objets que chaque Gaulois a reçus (boutique, pochette surprise,
-- marché), à côté des bâtiments finis.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une fonction de lecture, réservée au robot. Il n'efface rien et ne touche aucune donnée.
-- Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261114001700', 'village_achats_sur_discord', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction est-elle là, fermée aux visiteurs et aux comptes, ouverte au robot ?
select 'achats du village : '
  || case when to_regprocedure('public.achats_du_village(bigint)') is not null
       and not has_function_privilege('anon', 'public.achats_du_village(bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.achats_du_village(bigint)', 'execute')
       and has_function_privilege('service_role', 'public.achats_du_village(bigint)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261114001700')
     then 'installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-achats.sql", texte);
console.log(`.cache/a-coller-achats.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
