/**
 * Écrit `.cache/a-coller-loterie-mardi.sql` (hors de Git) : la migration qui passe la loterie du lundi au mardi, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « La loterie du mardi »).
 * À relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-loterie-mardi.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117001300_loterie_du_mardi";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "loterie du mardi : installée";

const entete = `-- LA LOTERIE PASSE AU MARDI (17 novembre 2026), à coller en un seul fichier.
-- Le tirage a lieu chaque mardi à 21 h 30, heure de Paris, et le premier est celui de ce soir, mardi 17 novembre 2026.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run », AVANT 21 h 30 pour que le tirage parte
-- à l'heure (collé plus tard, le tirage part dans l'heure qui suit). Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace trois fonctions du calendrier et une tâche planifiée, et porte les billets déjà
-- achetés au tirage de ce soir ou du mardi 24. Il n'efface rien. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117001300', 'loterie_du_mardi', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le calendrier est-il celui du mardi, la tâche planifiée le mardi, plus aucun billet noté pour le lundi 23,
-- les fonctions fermées, la migration notée ?
select 'loterie du mardi : '
  || case when internal.loterie_premier_tirage() = date '2026-11-17'
       and internal.loterie_tirage_a_venir(timestamptz '2026-11-17 12:00:00+01') = date '2026-11-17'
       and internal.loterie_tirage_a_venir(timestamptz '2026-11-17 21:30:00+01') = date '2026-11-24'
       and internal.loterie_tirage_a_venir(timestamptz '2026-11-23 12:00:00+01') = date '2026-11-24'
       and internal.loterie_tirage_a_venir(timestamptz '2027-07-06 21:29:00+02') = date '2027-07-06'
       and (select count(*) = 1 from cron.job where jobname = 'gal-loterie' and schedule = '* * * * 2')
       and (select count(*) = 1 from cron.job where jobname = 'gal-loterie-rattrapage')
       and not exists (select 1 from internal.loterie_achats where tirage = date '2026-11-23')
       and not has_function_privilege('authenticated', 'internal.loterie_reveil()', 'execute')
       and not has_function_privilege('anon', 'internal.loterie_tirage_a_venir(timestamptz)', 'execute')
       and (public.get_loterie() ->> 'error') = 'not_signed_in'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117001300')
     then 'installée' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-loterie-mardi.sql", texte);
console.log(`.cache/a-coller-loterie-mardi.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
