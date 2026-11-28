/**
 * Écrit `.cache/a-coller-casino-roue.sql` (hors de Git) : la migration des paris entre les cases de la roue du charron
 * (maquette validée le 28 novembre 2026), seule, dans une transaction, notée dans supabase_migrations.schema_migrations,
 * avec une dernière ligne de contrôle (docs/direction/43-le-casino-des-gaulois.md).
 * À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-casino-roue.ts`. N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL
 * (piège du dollar double). `tests/unit/casino-serveur.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const VERSION = "20261128000800";
export const NOM = `${VERSION}_roue_paris_entre_les_cases`;
export const ATTENDU = "roue entre les cases : installée";
export const FICHIER = ".cache/a-coller-casino-roue.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  const entete = `-- LA ROUE DU CHARRON : LES PARIS ENTRE LES CASES (28 novembre 2026), à coller en un seul fichier.
-- À cheval sur deux numéros (18 fois), le carré de quatre (9 fois), le trio d'une colonne du tapis (12 fois) et le six de
-- deux colonnes (6 fois). Chaque pari rend exactement la mise en moyenne, comme ceux d'avant.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il remplace trois fonctions de la roue, rien d'autre. Il n'efface rien, ne touche aucune ligne,
-- ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose le casino déjà installé : sinon, il s'arrête
-- sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('internal.casino_roue_paris()') is null
     or to_regprocedure('internal.casino_roue_fois(text)') is null
     or to_regprocedure('internal.casino_roue_gagne(text, integer)') is null
     or to_regprocedure('internal.casino_roue_rendu(jsonb, integer)') is null
     or to_regprocedure('public.jouer_roue(jsonb)') is null then
    raise exception 'Le casino des Gaulois n''est pas installé. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'roue_paris_entre_les_cases', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : 150 paris, un carré gagnant rend 9 fois, un six 6 fois, un pari d'avant n'a pas changé, le tour reste ouvert
-- aux membres et fermé aux visiteurs, les règles fermées à tous, et la migration notée.
select 'roue entre les cases : '
  || case when cardinality(internal.casino_roue_paris()) = 150
       and (internal.casino_roue_rendu('{"q17": 10, "s6": 20, "rouge": 10}'::jsonb, 21) ->> 'total')::integer = 210
       and (internal.casino_roue_rendu('{"n7": 10, "c1": 20}'::jsonb, 7) ->> 'total')::integer = 420
       and has_function_privilege('authenticated', 'public.jouer_roue(jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.jouer_roue(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'internal.casino_roue_gagne(text, integer)', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version = '${VERSION}') = 1
     then 'installée'
     else 'PAS INSTALLÉE' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1] && /a-coller-casino-roue\.ts$/.test(process.argv[1].split("\\").join("/"))) {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(FICHIER, texteAColler());
  console.log(`Écrit : ${FICHIER} (dernière ligne attendue : « ${ATTENDU} »)`);
}
