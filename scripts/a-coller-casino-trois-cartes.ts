/**
 * Écrit `.cache/a-coller-casino-trois-cartes.sql` (hors de Git) : la migration de « Trois cartes », la mise à côté du
 * vingt-et-un (maquette choisie le 28 novembre 2026), seule, dans une transaction, notée dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/direction/43-le-casino-des-gaulois.md).
 * À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-casino-trois-cartes.ts`. N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL
 * (piège du dollar double). `tests/unit/casino-serveur.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const VERSION = "20261128000700";
export const NOM = `${VERSION}_vingt_et_un_trois_cartes`;
export const ATTENDU = "trois cartes : installée";
export const FICHIER = ".cache/a-coller-casino-trois-cartes.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  const entete = `-- « TROIS CARTES », LA MISE À CÔTÉ DU VINGT-ET-UN (28 novembre 2026), à coller en un seul fichier.
-- Avant la donne, on peut poser des jetons sur une seconde place de la table ; les deux premières cartes du joueur et la
-- carte visible du croupier font une main de trois cartes (brelan, suite, même enseigne). Les gains rendent exactement la
-- mise en moyenne. La mise et la mise à côté : 200 statères au plus ensemble.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il remplace quatre fonctions du vingt-et-un et en ajoute cinq. Il n'efface rien, ne touche aucune
-- ligne, ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose le casino déjà installé : sinon, il
-- s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.casino_mains') is null
     or to_regprocedure('internal.casino_v21_distribuer(integer, integer[])') is null
     or to_regprocedure('internal.casino_v21_table(bigint, jsonb)') is null
     or to_regprocedure('internal.casino_v21_reponse(uuid, bigint, jsonb)') is null
     or to_regprocedure('public.distribuer_vingt_et_un(integer)') is null then
    raise exception 'Le casino des Gaulois n''est pas installé. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'vingt_et_un_trois_cartes', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la règle (une suite de même enseigne rend 39 fois), le nouvel appel ouvert aux membres et fermé aux
-- visiteurs, et la migration notée.
select 'trois cartes : '
  || case when internal.casino_v21_trois_fois(internal.casino_v21_trois(47, 48, 49)) = 39
       and has_function_privilege('authenticated', 'public.distribuer_vingt_et_un(integer, integer)', 'execute')
       and not has_function_privilege('anon', 'public.distribuer_vingt_et_un(integer, integer)', 'execute')
       and not has_function_privilege('authenticated', 'internal.casino_v21_commencer(integer, integer)', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version = '${VERSION}') = 1
     then 'installée'
     else 'PAS INSTALLÉE' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1] && /a-coller-casino-trois-cartes\.ts$/.test(process.argv[1].split("\\").join("/"))) {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(FICHIER, texteAColler());
  console.log(`Écrit : ${FICHIER} (dernière ligne attendue : « ${ATTENDU} »)`);
}
