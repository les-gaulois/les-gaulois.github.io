/**
 * Écrit `.cache/a-coller-casino-sans-plafond.sql` (hors de Git) : la migration qui retire le plafond du jour du casino (le
 * pilote, 27 novembre 2026 : « enleve la limite de statere au casino »), seule, dans une transaction, notée dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/direction/43-le-casino-des-gaulois.md).
 * À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-casino-sans-plafond.ts`. N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL
 * (piège du dollar double). `tests/unit/casino-serveur.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const VERSION = "20261127000300";
export const NOM = `${VERSION}_casino_sans_plafond`;
export const ATTENDU = "plafond du casino : aucun";
export const FICHIER = ".cache/a-coller-casino-sans-plafond.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  const entete = `-- LE CASINO SANS PLAFOND DU JOUR (27 novembre 2026), à coller en un seul fichier.
-- Le casino des Gaulois ne limite plus les statères misés par jour (50 000 jusqu'ici ; décision du pilote : « enleve la
-- limite de statere au casino »). Rien d'autre ne change : ni les jeux, ni les chances, ni la mise de départ (200 au plus),
-- ni la bourse, qui doit toujours suffire.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il remplace cinq fonctions du casino et en ajoute une. Il n'efface rien, ne touche aucune ligne,
-- ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose le casino déjà installé : sinon, il s'arrête
-- sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.casino_parties') is null or to_regprocedure('internal.casino_plafond()') is null
     or to_regprocedure('internal.casino_miser(uuid, bigint, integer, boolean)') is null
     or to_regprocedure('internal.casino_v21_table(bigint, jsonb)') is null
     or to_regprocedure('public.get_casino()') is null then
    raise exception 'Le casino des Gaulois n''est pas installé. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'casino_sans_plafond', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le plafond que lit le casino, la nouvelle fonction fermée aux visiteurs, et la migration notée.
select 'plafond du casino : '
  || case when internal.casino_plafond() is null
       and not has_function_privilege('authenticated', 'internal.casino_reste_du_jour(uuid)', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version = '${VERSION}') = 1
     then 'aucun'
     else 'PAS INSTALLÉ (plafond : ' || coalesce(internal.casino_plafond()::text, 'aucun') || ')' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-casino-sans-plafond.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
