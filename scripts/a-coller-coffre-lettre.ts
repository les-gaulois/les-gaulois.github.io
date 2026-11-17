/**
 * Écrit `.cache/a-coller-coffre-lettre.sql` (hors de Git) : la migration de la lettre à acheter, du tableau entier et du
 * bilan du coffre, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de
 * contrôle (docs/DIRECTION.md, « Le coffre du druide »). Depuis la racine du dépôt : `npx tsx scripts/a-coller-coffre-lettre.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117000700_coffre_lettre_tableau_bilan";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "lettre, tableau et bilan du coffre : installé";

const entete = `-- LA LETTRE, LE TABLEAU ET LE BILAN DU COFFRE (17 novembre 2026), à coller en un seul fichier.
-- /indice vend une lettre du mot (50, 100 puis 200 statères, versés dans la cagnotte), /indices montre tout le tableau,
-- et le robot poste le bilan de chaque manche. Une manche garde 12 indices au lieu de 6.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une table et quatre fonctions, et refait la clôture d'un essai à l'identique, au nombre
-- d'indices près. Il n'efface rien : la manche en cours, les essais, la cagnotte et la dépense comptée restent tels quels,
-- et le robot déjà en ligne continue de marcher. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

-- La clôture refaite s'appuie sur la mise de 10 statères : sans elle, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000100') then
    raise exception 'Il faut d''abord coller .cache/a-coller-coffre-garde.sql (migration 20261117000100).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117000700', 'coffre_lettre_tableau_bilan', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la table et les fonctions sont-elles là, fermées à tous sauf au robot, la migration notée ?
select 'lettre, tableau et bilan du coffre : '
  || case when to_regclass('internal.coffre_lettres_achetees') is not null
       and (public.coffre_tableau() ->> 'ok') = 'true'
       and (public.coffre_indice('etat', 'etat') ->> 'error') = 'invalid_request'
       and not has_function_privilege('anon', 'public.coffre_tableau()', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_tableau()', 'execute')
       and not has_function_privilege('anon', 'public.coffre_indice(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_indice(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_bilan(bigint)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_tableau()', 'execute')
       and has_function_privilege('service_role', 'public.coffre_indice(text, text)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_bilan(bigint)', 'execute')
       and (select p.prosrc like '%cardinality(indices) < 12%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_clore')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000700')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre-lettre.sql", texte);
console.log(`.cache/a-coller-coffre-lettre.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
