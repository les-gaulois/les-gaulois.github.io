/**
 * Écrit `.cache/a-coller-pochette-stateres.sql` (hors de Git) : la migration de la pochette de statères, seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « La pochette de statères »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-pochette-stateres.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261116000800_pochette_de_stateres";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "pochette de statères : installée";

const entete = `-- LA POCHETTE DE STATÈRES (16 novembre 2026), à coller en un seul fichier.
-- Une pochette à 200 statères qui rend des statères : six lots, 200 en moyenne, dix ouvertures par jour au plus.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute six fonctions, aucune table. Il n'efface rien et ne touche aucun Gaulois, aucun objet
-- ni aucun statère. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116000800', 'pochette_de_stateres', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le prix, le plafond, des chances qui font 100, un gain moyen égal au prix, et les fonctions ouvertes aux
-- seuls comptes connectés.
select 'pochette de statères : '
  || case when internal.stateres_pochette_prix() = 200
       and internal.stateres_pochette_plafond() = 10
       and (select count(*) = 6 and sum(chance) = 100 and sum(chance * gain) / 100 = internal.stateres_pochette_prix() from internal.stateres_pochette_lots())
       and has_function_privilege('authenticated', 'public.get_pochette_stateres()', 'execute')
       and has_function_privilege('authenticated', 'public.ouvrir_pochette_stateres(integer)', 'execute')
       and not has_function_privilege('anon', 'public.get_pochette_stateres()', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_pochette_stateres(integer)', 'execute')
       and not has_function_privilege('authenticated', 'internal.stateres_pochette_ouvertes(uuid)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116000800')
     then 'installée' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-pochette-stateres.sql", texte);
console.log(`.cache/a-coller-pochette-stateres.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
