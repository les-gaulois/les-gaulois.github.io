/**
 * Écrit `.cache/a-coller-mises-lundi.sql` (hors de Git) : la migration qui ferme les pronostics le lundi à 0 h, seule, dans
 * une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « Les pronostics avec mise »). La migration d'avant, 20261115000400_pronostics_avec_mise, a été collée par le pilote le
 * 15 novembre 2026 : elle ne se recolle pas. À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-mises-lundi.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261115000500_mises_fermees_le_lundi";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "mises fermées le lundi : installé";

const entete = `-- LES PRONOSTICS FERMENT LE LUNDI À 0 H (15 novembre 2026), à coller en un seul fichier.
-- Au QG, on pronostique toujours la semaine suivante, jusqu'au dimanche à minuit : plus personne ne mise en connaissant
-- déjà des victoires de la semaine.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace deux petites fonctions par les mêmes, avec la nouvelle heure. Il n'efface rien et ne
-- touche aucun pronostic ni aucune mise. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261115000500', 'mises_fermees_le_lundi', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la semaine pronostiquée est la suivante, elle ferme à son lundi 0 h, et les fonctions restent fermées.
select 'mises fermées le lundi : '
  || case when internal.prediction_week() = internal.paris_monday() + 7
       and internal.prediction_closes(internal.paris_monday() + 7) = (internal.paris_monday() + 7)::timestamp at time zone 'Europe/Paris'
       and internal.prediction_closes(internal.paris_monday()) <= now()
       and not has_function_privilege('authenticated', 'internal.prediction_week()', 'execute')
       and not has_function_privilege('authenticated', 'internal.prediction_closes(date)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261115000500')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-mises-lundi.sql", texte);
console.log(`.cache/a-coller-mises-lundi.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
