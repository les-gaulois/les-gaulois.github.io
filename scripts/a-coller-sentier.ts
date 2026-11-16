/**
 * Écrit `.cache/a-coller-sentier.sql` (hors de Git) : la migration du sentier des Gaulois, seule, dans une transaction,
 * notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le sentier
 * des Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-sentier.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261116001100_sentier_des_gaulois";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "sentier des Gaulois : installé";

const entete = `-- LE SENTIER DES GAULOIS (16 novembre 2026), à coller en un seul fichier.
-- Une saison de 30 paliers, trois missions par jour, un calendrier de présence, un étal du jour et un défi du clan.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute neuf tables, un déclencheur et vingt-six fonctions. Il n'efface rien et ne change
-- aucune table, aucune fonction, aucun Gaulois, aucun objet ni aucun statère déjà là. Collé une seconde fois, il ne change
-- rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116001100', 'sentier_des_gaulois', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la saison et ses trente paliers, les sept missions, les nombres de la règle, le déclencheur du vocal, et
-- les fonctions ouvertes aux seuls comptes connectés ou à la seule clé de service.
select 'sentier des Gaulois : '
  || case when (select count(*) = 1 from internal.sentier_saisons where saison = 'saison-1' and paliers = 30 and pas_par_palier = 30)
       and (select count(*) = 30 from internal.sentier_paliers where saison = 'saison-1')
       and (select count(*) = 7 and count(*) filter (where facile) = 3 from internal.sentier_missions())
       and internal.sentier_pas_mission() = 10 and internal.sentier_pas_visite() = 5
       and internal.sentier_pas_semaine() = 30 and internal.sentier_pas_defi() = 30 and internal.sentier_remise() = 30
       and exists (select 1 from pg_trigger where tgname = 'sentier_vocal' and tgrelid = 'internal.village_vie'::regclass)
       and has_function_privilege('authenticated', 'public.get_mon_sentier()', 'execute')
       and has_function_privilege('authenticated', 'public.prendre_palier(integer)', 'execute')
       and has_function_privilege('authenticated', 'public.acheter_a_l_etal(text, text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.get_mon_sentier()', 'execute')
       and not has_function_privilege('anon', 'public.prendre_palier(integer)', 'execute')
       and not has_function_privilege('anon', 'public.acheter_a_l_etal(text, text, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.noter_parties_sentier(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.sentier_parties_notees(timestamptz)', 'execute')
       and has_function_privilege('service_role', 'public.noter_parties_sentier(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'internal.sentier_regler(uuid)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001100')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-sentier.sql", texte);
console.log(`.cache/a-coller-sentier.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
