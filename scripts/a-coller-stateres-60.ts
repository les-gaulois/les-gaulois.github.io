/**
 * Écrit `.cache/a-coller-stateres-60.sql` (hors de Git) : la migration des statères doublés (60 par point rapporté au clan au
 * lieu de 30, et novembre rattrapé, le pilote, 27 novembre 2026), seule, dans une transaction, notée dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle qui dit quelle règle est installée, combien de
 * comptes ont reçu le rattrapage de novembre et combien de statères en tout (docs/direction/26-2-lot-2-le-statere.md). À
 * relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-stateres-60.ts`.
 * N'envoie rien et ne lit que le dépôt. Le fichier est essayé sur le banc PGlite (`tests/unit/stateres-serveur.test.ts`).
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { REGLE_STATERES, STATERES_PAR_POINT, stateresDeVictoire } from "../src/lib/stateres";

export const VERSION = "20261127000100";
export const NOM = `${VERSION}_stateres_60_par_point`;
export const FICHIER = ".cache/a-coller-stateres-60.sql";
const EXEMPLE = stateresDeVictoire(1.67, 3);
/** Le début de la dernière ligne quand tout est installé ; la suite dit les comptes et les statères de novembre. */
export const ATTENDU = `statères : règle ${REGLE_STATERES} installée, ${STATERES_PAR_POINT} par point (1,67 point donne ${EXEMPLE}) ; novembre doublé : `;

const entete = `-- LES STATÈRES DOUBLÉS ET NOVEMBRE RATTRAPÉ (27 novembre 2026), à coller en un seul fichier.
-- Un point rapporté au clan donne désormais ${STATERES_PAR_POINT} statères au lieu de 30 à chaque Gaulois présent dans la partie. Et chaque
-- membre reçoit une fois, en plus, tout ce que ses points de novembre lui avaient donné à 30 : 6 000 reçus, 6 000 de plus.
-- Son message l'attend dans « Mon Gaulois ».
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace la règle du calcul et son nom (« ${REGLE_STATERES} »), ajoute « points_doubles » aux
-- vrais gains du mode GOD, puis verse le rattrapage de novembre, une ligne par compte au journal des statères.
-- Il n'efface rien et ne touche ni les crédits déjà reçus, ni les prix, ni les objets. Collé une seconde fois, il ne verse
-- rien de plus.
-- Il suppose les statères et le duel déjà installés (en ligne depuis novembre 2026) : sinon, il s'arrête sans rien changer.
-- Si l'éditeur répond « deadlock detected », rien n'a changé : le recoller.
-- La dernière ligne doit commencer par « ${ATTENDU} », puis dire le nombre de comptes et de statères rendus.

begin;

do $$
begin
  if to_regprocedure('internal.stateres_de_victoire(numeric, integer)') is null
    or to_regprocedure('internal.stateres_regle()') is null
    or to_regprocedure('internal.crediter_stateres(uuid)') is null
    or to_regprocedure('internal.village_god_mouvement()') is null
    or to_regprocedure('internal.duel_tableau_reveil()') is null then
    raise exception 'Les statères ou le duel ne sont pas installés : rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'stateres_60_par_point', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la règle installée et son calcul sur des exemples ; chaque compte qui avait des crédits de novembre à 30 a
-- reçu une fois exactement leur somme ; les fonctions de la règle fermées, celles du message ouvertes aux seuls membres.
with novembre as (
  select m.user_id, sum(m.montant)::integer as total
  from internal.stateres_mouvements m
  where m.nature = 'victoire' and m.regle = 'entier-30'
    and m.debut >= timestamptz '2026-11-01 00:00:00 Europe/Paris' and m.debut < timestamptz '2026-12-01 00:00:00 Europe/Paris'
  group by m.user_id
  having sum(m.montant) > 0
),
doubles as (
  select count(*)::integer as comptes, coalesce(sum(d.montant), 0)::bigint as total from internal.stateres_points_doubles d
)
select 'statères : '
  || case when internal.stateres_regle() = '${REGLE_STATERES}'
       and internal.stateres_de_victoire(1, 1) = ${stateresDeVictoire(1, 1)}
       and internal.stateres_de_victoire(1.67, 3) = ${EXEMPLE}
       and internal.stateres_de_victoire(1.025, 1) = ${stateresDeVictoire(1.025, 1)}
       and internal.stateres_de_victoire(0.001, 1) = 1
       and internal.stateres_de_victoire(-0.26, 3) = 0
       and internal.stateres_de_victoire(1.67, 0) = 0
       and not has_function_privilege('anon', 'internal.stateres_de_victoire(numeric, integer)', 'execute')
       and not has_function_privilege('authenticated', 'internal.stateres_de_victoire(numeric, integer)', 'execute')
       and not has_function_privilege('authenticated', 'internal.stateres_regle()', 'execute')
       and pg_get_functiondef('internal.village_god_mouvement()'::regprocedure) like '%''points_doubles''%'
       and not exists (
         select 1 from novembre n
         left join internal.stateres_points_doubles d on d.user_id = n.user_id
         left join internal.stateres_mouvements j on j.id = d.mouvement
         where d.user_id is null or d.montant <> n.total or j.nature is distinct from 'points_doubles' or j.montant is distinct from n.total
       )
       and (select count(*) from internal.stateres_points_doubles) = (select count(*) from novembre)
       and (select count(*) from internal.stateres_mouvements j where j.nature = 'points_doubles') = (select count(*) from internal.stateres_points_doubles)
       and has_function_privilege('authenticated', 'public.get_mes_points_doubles()', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_points_doubles()', 'execute')
       and has_function_privilege('authenticated', 'public.voir_points_doubles()', 'execute')
       and not has_function_privilege('anon', 'public.voir_points_doubles()', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
     then 'règle ' || internal.stateres_regle() || ' installée, ' || internal.stateres_de_victoire(1, 1) || ' par point (1,67 point donne '
       || internal.stateres_de_victoire(1.67, 3) || ') ; novembre doublé : '
       || (select comptes from doubles) || case when (select comptes from doubles) > 1 then ' comptes, ' else ' compte, ' end
       || (select total from doubles) || case when (select total from doubles) > 1 then ' statères' else ' statère' end
     else 'PAS INSTALLÉE (règle en place : ' || internal.stateres_regle() || ', ' || internal.stateres_de_victoire(1, 1) || ' par point)' end as controle;
`;

/** Le fichier à coller : la migration, dans une transaction, notée comme appliquée, puis la ligne de contrôle. */
export function texteAColler(): string {
  const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  return entete + migration + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-stateres-60.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ »`);
  console.log(`Dernière ligne attendue : « ${ATTENDU}… comptes, … statères »`);
}
