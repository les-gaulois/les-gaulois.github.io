/**
 * Écrit `.cache/a-coller-don-stateres.sql` (hors de Git) : la migration du don de statères, seule, dans une transaction,
 * notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le don de
 * statères »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-don-stateres.ts`. N'envoie rien et ne lit que le dépôt.
 * Le titulaire ne s'y écrit pas : son identifiant Discord se tape dans l'éditeur SQL, jamais dans le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117000200_don_de_stateres";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "don de statères : installé";

const entete = `-- LE DON DE STATÈRES (17 novembre 2026), à coller en un seul fichier.
-- Un panneau de la Direction, onglet Village, pour un seul compte : donner de 1 à 100 000 statères à un membre.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute deux tables vides et quatre fonctions, et remplace le déclencheur du mode GOD par le
-- même avec le don parmi les vrais gains. Il n'efface rien et ne touche aucun Gaulois, aucun objet ni aucun statère.
-- Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».
--
-- ENSUITE, à part, une seule ligne à taper pour dire qui a droit au panneau (l'identifiant Discord, en chiffres) :
--   insert into internal.stateres_don_titulaire (discord_id) values ('…');
-- Tant que cette ligne n'est pas faite, personne ne voit le panneau et personne ne peut donner.

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117000200', 'don_de_stateres', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le plafond, les tables fermées, les deux fonctions ouvertes aux seuls comptes connectés.
select 'don de statères : '
  || case when internal.stateres_don_plafond() = 100000
       and has_function_privilege('authenticated', 'public.get_stateres_don()', 'execute')
       and has_function_privilege('authenticated', 'public.donner_stateres(uuid, integer, text, uuid)', 'execute')
       and not has_function_privilege('anon', 'public.get_stateres_don()', 'execute')
       and not has_function_privilege('anon', 'public.donner_stateres(uuid, integer, text, uuid)', 'execute')
       and not has_function_privilege('authenticated', 'internal.stateres_don_permis()', 'execute')
       and not has_table_privilege('authenticated', 'internal.stateres_don_titulaire', 'select, insert, update, delete')
       and not has_table_privilege('authenticated', 'internal.stateres_dons', 'select, insert, update, delete')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000200')
     then 'installé' else 'PAS INSTALLÉ' end
  || ', ' || (select count(*) from internal.stateres_don_titulaire) || ' titulaire(s)' as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-don-stateres.sql", texte);
console.log(`.cache/a-coller-don-stateres.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
