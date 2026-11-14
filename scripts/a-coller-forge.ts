/**
 * Écrit `.cache/a-coller-forge.sql` (hors de Git) : la migration de la forge aux souvenirs du village seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « Le village des Gaulois », la forge). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-forge.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261114001000_village_forge";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "forge : installée";

const entete = `-- LA FORGE AUX SOUVENIRS DU VILLAGE (14 novembre 2026), à coller en un seul fichier.
-- On paie 150 statères pour graver une de ses parties qui ont rapporté des points au clan sur un objet de son Gaulois :
-- « 12 novembre, à quatre, 2,33 points rapportés ».
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run », APRÈS le fichier du village
-- (.cache/a-coller-village.sql) et la garde-robe, déjà collés. Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une table et des fonctions, et remplace quatre fonctions (mettre_en_vente, get_mon_gaulois,
-- get_village, get_village_economie) par leur dernière version augmentée de la forge. Il n'efface rien et ne touche aucune
-- donnée existante. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261114001000', 'village_forge', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la table, les trois fonctions de la forge, et les quatre fonctions remplacées sont-elles là ?
select 'forge : '
  || case when to_regclass('internal.gaulois_gravures') is not null
       and (select count(distinct p.proname) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('get_ma_forge', 'graver_objet', 'effacer_gravure')) = 3
       and (select bool_and(case p.proname
              when 'mettre_en_vente' then p.prosrc like '%objet_grave%'
              when 'get_mon_gaulois' then p.prosrc like '%forge_mes_plaques%'
              when 'get_village' then p.prosrc like '%forge_plaques_portees%'
              when 'get_village_economie' then p.prosrc like '%graveurs%'
            end) and count(*) = 4
            from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('mettre_en_vente', 'get_mon_gaulois', 'get_village', 'get_village_economie'))
     then 'installée' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-forge.sql", texte);
console.log(`.cache/a-coller-forge.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
