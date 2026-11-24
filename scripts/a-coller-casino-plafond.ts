/**
 * Écrit `.cache/a-coller-casino-plafond.sql` (hors de Git) : la migration qui porte le plafond du jour du casino à 12 500
 * statères (20261124000100), à coller en un seul fichier, dans une transaction, notée dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le casino des
 * Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-casino-plafond.ts`. N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL
 * (piège du dollar double). `tests/unit/casino-serveur.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const NOMS = ["20261124000100_casino_plafond_12500"] as const;
export const ATTENDU = "plafond du casino : 12 500";
export const FICHIER = ".cache/a-coller-casino-plafond.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = NOMS.map((nom) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split("\r\n").join("\n").trimEnd()).join("\n\n");
  const entete = `-- LE PLAFOND DU CASINO À 12 500 (24 novembre 2026), à coller en un seul fichier.
-- Le casino des Gaulois laisse miser 12 500 statères par jour et par compte au lieu de 2 000 (décision du pilote). Rien
-- d'autre ne change : ni les jeux, ni les chances, ni la mise de départ (200 au plus).
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOMS.join(".sql, ")}.sql. Il remplace une seule fonction, internal.casino_plafond. Il n'efface rien, ne
-- touche aucune ligne, ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose le casino déjà
-- installé : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.casino_parties') is null or to_regprocedure('internal.casino_plafond()') is null
     or to_regprocedure('public.get_casino()') is null then
    raise exception 'Le casino des Gaulois n''est pas installé. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261124000100', 'casino_plafond_12500', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le plafond que lit le casino, et la migration notée.
select 'plafond du casino : '
  || case when internal.casino_plafond() = 12500
       and (select count(*) from supabase_migrations.schema_migrations where version = '20261124000100') = 1
     then '12 500'
     else 'PAS CHANGÉ (' || internal.casino_plafond()::text || ')' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-casino-plafond.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
