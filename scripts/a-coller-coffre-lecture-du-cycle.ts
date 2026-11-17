/**
 * Écrit `.cache/a-coller-coffre-lecture-du-cycle.sql` (hors de Git) : la migration de la lecture du cycle du coffre, dans
 * une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle
 * (docs/DIRECTION.md, « Le coffre du druide »). Depuis la racine du dépôt :
 * `npx tsx scripts/a-coller-coffre-lecture-du-cycle.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117001000_coffre_lecture_du_cycle";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "lecture du cycle du coffre : installée";

const entete = `-- LA LECTURE DU CYCLE DU COFFRE (17 novembre 2026), à coller en un seul fichier, APRÈS le cycle des quinze manches.
-- Elle sert aux mots à la hauteur du niveau, à la mémoire du gardien et au tableau d'honneur de fin de cycle.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une fonction de lecture. Il n'efface rien et ne touche à aucune donnée. Collé une
-- seconde fois, il ne change rien. Le robot, en ligne avant ou après, marche dans les deux cas.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

-- La lecture s'appuie sur le cycle des quinze manches : sans lui, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000800') then
    raise exception 'Il faut d''abord coller .cache/a-coller-coffre-cycle.sql (migration 20261117000800).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117001000', 'coffre_lecture_du_cycle', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction répond-elle, est-elle fermée à tous sauf au robot, la migration est-elle notée ?
select 'lecture du cycle du coffre : '
  || case when (public.coffre_cycle(null) ->> 'ok') = 'true'
       and jsonb_typeof(public.coffre_cycle(null) -> 'manches') = 'array'
       and not has_function_privilege('anon', 'public.coffre_cycle(bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_cycle(bigint)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_cycle(bigint)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117001000')
     then 'installée' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre-lecture-du-cycle.sql", texte);
console.log(`.cache/a-coller-coffre-lecture-du-cycle.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
