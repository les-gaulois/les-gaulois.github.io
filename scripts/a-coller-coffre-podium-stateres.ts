/**
 * Écrit `.cache/a-coller-coffre-podium-stateres.sql` (hors de Git) : la migration des statères gagnés du podium de
 * /perceurs, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle
 * (docs/DIRECTION.md, « Le coffre du druide »). Depuis la racine du dépôt : `npx tsx scripts/a-coller-coffre-podium-stateres.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117000600_coffre_stateres_du_podium";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "statères du podium : installé";

const entete = `-- LES STATÈRES DU PODIUM (17 novembre 2026), à coller en un seul fichier.
-- Le podium de /perceurs dit, sous les coffres de chaque membre, les statères que ces coffres lui ont rapportés dans la semaine.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace une fonction de lecture par la même avec un champ de plus. Il n'efface rien et ne
-- touche à aucune donnée. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

-- La fonction refaite s'appuie sur les bannières du podium : sans elles, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261116001500') then
    raise exception 'Il faut d''abord coller .cache/a-coller-coffre-podium.sql (migration 20261116001500).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117000600', 'coffre_stateres_du_podium', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction rend-elle les statères, reste-t-elle fermée à tous sauf au robot, la migration est-elle notée ?
select 'statères du podium : '
  || case when (select p.prosrc like '%coffre_prime%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_palmares')
       and not has_function_privilege('anon', 'public.coffre_palmares()', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_palmares()', 'execute')
       and has_function_privilege('service_role', 'public.coffre_palmares()', 'execute')
       and (public.coffre_palmares() ->> 'ok') = 'true'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000600')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre-podium-stateres.sql", texte);
console.log(`.cache/a-coller-coffre-podium-stateres.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
