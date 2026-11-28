/**
 * Écrit `.cache/a-coller-casino-poker.sql` (hors de Git) : la migration du poker du barde et de « Mon bilan » du casino (le
 * pilote, 28 novembre 2026 : « Oui, construis »), seule, dans une transaction, notée dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/direction/43-le-casino-des-gaulois.md).
 * À relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-casino-poker.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL (piège du dollar double).
 * `tests/unit/casino-poker-serveur.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const VERSION = "20261128000500";
export const NOM = `${VERSION}_casino_poker_et_bilan`;
export const ATTENDU = "poker et bilan du casino : installés";
export const FICHIER = ".cache/a-coller-casino-poker.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  const entete = `-- LE POKER DU BARDE ET « MON BILAN » DU CASINO (28 novembre 2026), à coller en un seul fichier.
-- Un septième jeu au casino des Gaulois, le poker du barde (99,5 % rendu en moyenne joué au mieux, jamais plus), et le
-- bilan de chaque joueur dans le hall (ce qu'il a misé et reçu, à lui seul).
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. L'éditeur peut prévenir d'une « opération destructive » : ce sont deux règles de la table des
-- parties remplacées (le jeu « poker » accepté, un gain jusqu'à 50 000) ; aucune ligne n'est effacée ni changée. Il ajoute une
-- table et des fonctions, ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose le casino déjà
-- installé, sans plafond et avec ses annonces sur Discord : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.casino_parties') is null or to_regclass('internal.casino_annonces') is null
     or to_regprocedure('internal.casino_reste_du_jour(uuid)') is null
     or to_regprocedure('internal.casino_annonce_seuil()') is null
     or to_regprocedure('internal.casino_finir(uuid, bigint, integer, jsonb)') is null
     or to_regprocedure('public.get_casino()') is null then
    raise exception 'Le casino des Gaulois n''est pas installé en entier (casino, sans plafond, annonces). Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'casino_poker_et_bilan', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les deux appels du poker ouverts aux membres et fermés aux visiteurs, la table des mains, et la migration notée.
select 'poker et bilan du casino : '
  || case when to_regclass('internal.casino_poker_mains') is not null
       and has_function_privilege('authenticated', 'public.distribuer_poker(integer)', 'execute')
       and has_function_privilege('authenticated', 'public.jouer_poker(bigint, jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.jouer_poker(bigint, jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'internal.casino_bilan(uuid)', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version = '${VERSION}') = 1
     then 'installés'
     else 'PAS INSTALLÉS' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-casino-poker.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
