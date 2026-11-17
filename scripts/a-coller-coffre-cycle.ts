/**
 * Écrit `.cache/a-coller-coffre-cycle.sql` (hors de Git) : la migration du cycle des quinze manches à thème du coffre,
 * dans une transaction, notée dans supabase_migrations.schema_migrations, puis le lancement du cycle, et une dernière
 * ligne de contrôle (docs/DIRECTION.md, « Le coffre du druide »). Depuis la racine du dépôt :
 * `npx tsx scripts/a-coller-coffre-cycle.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117000800_coffre_cycle_des_manches";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "cycle des manches du coffre : lancé";

const entete = `-- LES QUINZE MANCHES À THÈME DU COFFRE (17 novembre 2026), à coller en un seul fichier, APRÈS la lettre et le tableau.
-- Chaque manche a son gardien, son décor et son niveau : fois 2 pour les manches 1 à 5, fois 3 pour 6 à 10, fois 4 pour
-- 11 à 15 ; après la quinzième, on repart de la première.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée, puis le lancement du cycle : la prochaine manche sera la manche 1. La manche en cours, s'il y
-- en a une, finit comme elle a commencé : même gardien, même garde, même multiplicateur. Il n'efface rien : la cagnotte
-- et la dépense comptée restent telles quelles. Collé une seconde fois, il ne change rien : le cycle ne repart pas.
-- À coller APRÈS avoir remis le robot en ligne : l'ancien robot ne connaît ni les quinze gardiens ni leur multiplicateur.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

-- La clôture refaite s'appuie sur la lettre à acheter : sans elle, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000700') then
    raise exception 'Il faut d''abord coller .cache/a-coller-coffre-lettre.sql (migration 20261117000700).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117000800', 'coffre_cycle_des_manches', array[]::text[])
on conflict (version) do nothing;

-- Le lancement, une seule fois : le cycle commence à la prochaine manche, après toutes celles qui existent.
update internal.coffre_reglages
set cycle_base = (select coalesce(max(m.id), 0) from internal.coffre_manches m)
where id and cycle_base is null;

commit;

-- Le contrôle : le cycle est-il lancé, la manche ouverte a-t-elle son rang, les fonctions sont-elles fermées, la migration notée ?
select 'cycle des manches du coffre : '
  || case when (select cycle_base is not null from internal.coffre_reglages)
       and (internal.coffre_manche_ouverte() ->> 'rang') is null
       and internal.coffre_fois_du_rang(1) = 2 and internal.coffre_fois_du_rang(6) = 3 and internal.coffre_fois_du_rang(15) = 4
       and not has_function_privilege('anon', 'internal.coffre_rang(bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text)', 'execute')
       and (select p.prosrc like '%coffre_fois_du_rang%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'coffre_clore' and p.pronargs = 10)
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000800')
     then 'lancé' else 'PAS LANCÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre-cycle.sql", texte);
console.log(`.cache/a-coller-coffre-cycle.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
