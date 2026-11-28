/**
 * Écrit `.cache/a-coller-boosters-de-depart.sql` (hors de Git) : la migration des boosters de départ (le pilote,
 * 28 novembre 2026 : « à la création de son Gaulois, 10 pochettes à cosmétiques sont offertes au démarrage, pareil pour
 * ceux qui ne les ont pas eues »), seule, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une
 * dernière ligne de contrôle (« Les boosters de départ » de docs/DIRECTION.md). À relancer depuis la racine du dépôt après
 * tout changement de la migration : `npx tsx scripts/a-coller-boosters-de-depart.ts`. N'envoie rien et ne lit que le
 * dépôt. Le fichier est essayé sur le banc PGlite (`tests/unit/boosters-de-depart.test.ts`).
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const VERSION = "20261128001100";
export const NOM = `${VERSION}_boosters_de_depart`;
export const FICHIER = ".cache/a-coller-boosters-de-depart.sql";
/** Le début de la dernière ligne quand tout est installé ; suit le nombre de Gaulois servis. */
export const ATTENDU = "boosters de départ : installé, chaque Gaulois a reçu les siens";

const entete = `-- LES BOOSTERS DE DÉPART (28 novembre 2026), à coller en un seul fichier.
-- Dix boosters surprise offerts une fois à la création de chaque Gaulois, et dès maintenant à chaque Gaulois déjà créé.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une table, trois fonctions et un déclencheur, et des boosters à ouvrir ; il n'efface
-- rien et ne change aucun solde. Collé une seconde fois, il ne redonne rien.
-- Il suppose le village et ses boosters offerts déjà installés (en ligne depuis le 21 novembre 2026) : sinon, il s'arrête
-- sans rien changer.
-- La dernière ligne doit commencer par « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.gaulois') is null
    or to_regclass('internal.loterie_bons') is null
    or to_regprocedure('internal.village_verrou(uuid)') is null
    or to_regprocedure('public.get_pochettes_gagnees()') is null then
    raise exception 'Le village et ses boosters offerts ne sont pas installés : rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'boosters_de_depart', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le déclencheur, chaque Gaulois servi une fois, la fonction fermée au site, la migration notée.
select case when exists (select 1 from pg_trigger t where t.tgname = 'gaulois_boosters_de_depart' and t.tgrelid = 'internal.gaulois'::regclass)
       and not exists (select 1 from internal.gaulois g where not exists (select 1 from internal.boosters_de_depart b where b.user_id = g.user_id))
       and not has_function_privilege('authenticated', 'internal.offrir_boosters_de_depart(uuid)', 'execute')
       and not has_function_privilege('anon', 'internal.offrir_boosters_de_depart(uuid)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
     then '${ATTENDU} (' || (select count(*) from internal.boosters_de_depart) || ' Gaulois servis)'
     else 'PAS INSTALLÉ' end as controle;
`;

/** Le fichier à coller : la migration, dans une transaction, notée comme appliquée, puis la ligne de contrôle. */
export function texteAColler(): string {
  const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  return entete + migration + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-boosters-de-depart.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ »`);
  console.log(`Dernière ligne attendue : « ${ATTENDU} (… Gaulois servis) »`);
}
