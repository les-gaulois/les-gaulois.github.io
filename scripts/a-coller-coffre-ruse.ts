/**
 * Écrit `.cache/a-coller-coffre-ruse.sql` (hors de Git) : la migration de la ruse récompensée, du partage de la cagnotte et
 * de la pause entre deux essais, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière
 * ligne de contrôle (docs/DIRECTION.md, « Le coffre du druide »). Depuis la racine du dépôt :
 * `npx tsx scripts/a-coller-coffre-ruse.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117001100_coffre_ruse_partage_pause";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "ruse, partage et pause du coffre : installés";

const entete = `-- LA RUSE, LE PARTAGE ET LA PAUSE DU COFFRE (17 novembre 2026), à coller en un seul fichier, APRÈS le cycle des manches.
-- La cagnotte n'est multipliée que si le gardien lâche le mot (un mot deviné la gagne sans multiplicateur) ; un cinquième
-- de la cagnotte est partagé entre les autres villageois qui ont misé dans la manche ; 20 secondes de pause entre deux
-- essais d'un même membre.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il refait deux fonctions. Il n'efface rien : la manche en cours, les essais, la cagnotte et la
-- dépense comptée restent tels quels. Collé une seconde fois, il ne change rien.
-- À coller APRÈS avoir remis le robot en ligne : l'ancien robot ne sait pas dire la pause ni le partage.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

-- Les deux fonctions refaites s'appuient sur le cycle des manches : sans lui, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000800') then
    raise exception 'Il faut d''abord coller .cache/a-coller-coffre-cycle.sql (migration 20261117000800).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117001100', 'coffre_ruse_partage_pause', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les deux fonctions portent-elles les nouvelles règles, restent-elles fermées à tous sauf au robot, la migration est-elle notée ?
select 'ruse, partage et pause du coffre : '
  || case when (select p.prosrc like '%coffre_part%' and p.prosrc like '%not coalesce(p_devine, false)%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_clore' and p.pronargs = 10)
       and (select p.prosrc like '%cooldown%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_ouvrir' and p.pronargs = 5)
       and (public.coffre_ouvrir('etat', 'etat', 'etat', 'etat', 0) ->> 'error') = 'invalid_request'
       and not has_function_privilege('anon', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117001100')
     then 'installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre-ruse.sql", texte);
console.log(`.cache/a-coller-coffre-ruse.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
