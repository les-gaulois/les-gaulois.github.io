/**
 * Écrit `.cache/a-coller-duel-sans-limite.sql` (hors de Git) : la migration qui retire les deux limites de trois du duel (le
 * pilote, 27 novembre 2026 : « tu peu enlevé la limite de 3 duel par personnes », puis « Les deux »), seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle qui dit les limites
 * installées (« Le duel des Gaulois » et « Les salles du duel » de docs/DIRECTION.md). À relancer depuis la racine du dépôt
 * après tout changement de la migration : `npx tsx scripts/a-coller-duel-sans-limite.ts`. N'envoie rien et ne lit que le
 * dépôt. Le fichier est essayé sur le banc PGlite (`tests/unit/duel-sans-limite.test.ts`).
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DUELS_COMPTES_PAR_JOUR, VICTOIRES_AVEC_PAS_PAR_JOUR } from "../src/lib/village/contrat-duel";
import { MATCHS_PAR_JOUR } from "../src/lib/village/contrat-salles";

export const VERSION = "20261127000200";
export const NOM = `${VERSION}_duel_sans_limite_de_trois`;
export const FICHIER = ".cache/a-coller-duel-sans-limite.sql";
/** La dernière ligne quand tout est installé. */
export const ATTENDU = `duel : installé, ${DUELS_COMPTES_PAR_JOUR} duels comptés par jour (un par adversaire), des pas du pass pour ${VICTOIRES_AVEC_PAS_PAR_JOUR} victoires par jour, ${MATCHS_PAR_JOUR} matchs avec mise par jour, sans limite contre un même Gaulois`;

const UN_COMPTE = "'00000000-0000-0000-0000-000000000000'::uuid";

const entete = `-- LE DUEL SANS LIMITE DE TROIS (27 novembre 2026), à coller en un seul fichier.
-- 1. Plus de limite de 3 duels comptés par jour (4 avec la flamme) : tout duel compte, un seul par jour contre un même membre
--    ou un même boss, dans le plafond de ${DUELS_COMPTES_PAR_JOUR} duels par jour qui reste.
-- 2. Plus de limite de 3 matchs avec mise par jour contre un même Gaulois : seule reste celle de ${MATCHS_PAR_JOUR} matchs par jour.
-- 3. Des pas du pass pour les ${VICTOIRES_AVEC_PAS_PAR_JOUR} premières victoires comptées du jour seulement, comme avant.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il remplace quatre fonctions du duel et en ajoute une ; il n'efface rien et ne touche ni les statères, ni les
-- parties déjà jouées, ni les mises. Collé une seconde fois, il ne change rien de plus.
-- Il suppose le duel et ses salles déjà installés (en ligne depuis le 22 novembre 2026) : sinon, il s'arrête sans rien changer.
-- Si l'éditeur répond « deadlock detected », rien n'a changé : le recoller.
-- La dernière ligne doit dire « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('internal.duel_comptes_du_jour(uuid)') is null
    or to_regprocedure('internal.duel_flamme(uuid)') is null
    or to_regprocedure('internal.duel_salle_meme_adversaire()') is null
    or to_regprocedure('internal.duel_salle_par_jour()') is null
    or to_regprocedure('internal.duel_finir(bigint, integer, boolean)') is null
    or to_regprocedure('internal.sentier_saison_du(date)') is null
    or to_regprocedure('public.get_mon_duel()') is null then
    raise exception 'Le duel ou ses salles ne sont pas installés : rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'duel_sans_limite_de_trois', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les deux limites, l'écran du duel qui les dit, les droits, la migration notée.
select case when internal.duel_comptes_du_jour(${UN_COMPTE}) = ${DUELS_COMPTES_PAR_JOUR}
       and internal.duel_salle_par_jour() = ${MATCHS_PAR_JOUR}
       and internal.duel_salle_meme_adversaire() = internal.duel_salle_par_jour()
       and internal.duel_victoires_avec_pas() = ${VICTOIRES_AVEC_PAS_PAR_JOUR}
       and pg_get_functiondef('internal.duel_finir(bigint, integer, boolean)'::regprocedure) like '%v_rang <= internal.duel_victoires_avec_pas()%'
       and pg_get_functiondef('public.get_mon_duel()'::regprocedure) like '%least(v_comptes - v_faits, 30 - v_joues)%'
       and has_function_privilege('authenticated', 'public.get_mon_duel()', 'execute')
       and not has_function_privilege('anon', 'public.get_mon_duel()', 'execute')
       and not has_function_privilege('authenticated', 'internal.duel_comptes_du_jour(uuid)', 'execute')
       and not has_function_privilege('authenticated', 'internal.duel_salle_meme_adversaire()', 'execute')
       and not has_function_privilege('authenticated', 'internal.duel_victoires_avec_pas()', 'execute')
       and not has_function_privilege('authenticated', 'internal.duel_finir(bigint, integer, boolean)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
     then 'duel : installé, ' || internal.duel_comptes_du_jour(${UN_COMPTE}) || ' duels comptés par jour (un par adversaire), des pas du pass pour '
       || internal.duel_victoires_avec_pas() || ' victoires par jour, '
       || internal.duel_salle_par_jour() || ' matchs avec mise par jour, sans limite contre un même Gaulois'
     else 'PAS INSTALLÉ (' || internal.duel_comptes_du_jour(${UN_COMPTE}) || ' duels comptés par jour, '
       || internal.duel_salle_meme_adversaire() || ' matchs avec mise contre un même Gaulois)' end as controle;
`;

/** Le fichier à coller : la migration, dans une transaction, notée comme appliquée, puis la ligne de contrôle. */
export function texteAColler(): string {
  const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  return entete + migration + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-duel-sans-limite.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ »`);
  console.log(`Dernière ligne attendue : « ${ATTENDU} »`);
}
