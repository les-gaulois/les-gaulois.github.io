/**
 * Écrit `.cache/a-coller-casino-poker-discord.sql` (hors de Git) : la migration qui envoie sur Discord les gros gains du poker
 * du barde à partir du carré (le pilote, 28 novembre 2026 : « Oui, dès le carré »), seule, dans une transaction, notée dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/direction/43-le-casino-des-gaulois.md).
 * À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-casino-poker-discord.ts`. N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL
 * (piège du dollar double). `tests/unit/casino-poker-serveur.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const VERSION = "20261128000600";
export const NOM = `${VERSION}_casino_poker_sur_discord`;
export const ATTENDU = "poker sur Discord : dès le carré";
export const FICHIER = ".cache/a-coller-casino-poker-discord.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  const entete = `-- LES GROS GAINS DU POKER SUR DISCORD, DÈS LE CARRÉ (28 novembre 2026), à coller en un seul fichier.
-- Un coup du poker du barde part sur Discord, comme les autres jeux du casino, s'il gagne 1 000 statères ou plus ET si la
-- main est un carré ou mieux (choix du pilote : « Oui, dès le carré »).
--
-- À coller APRÈS la mise en ligne du site du même jour (le robot qui sait lire le poker), jamais avant : un ancien robot
-- noterait sans les poster les carrés que la file lui rendrait.
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il remplace une seule fonction, celle de la file des annonces du casino. Il n'efface rien, ne
-- touche aucune ligne, ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose le poker déjà installé :
-- sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.casino_poker_mains') is null or to_regclass('internal.casino_annonces') is null
     or to_regprocedure('public.casino_annonces_a_envoyer()') is null then
    raise exception 'Le poker du barde n''est pas installé. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'casino_poker_sur_discord', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la file connaît le poker et sa donne, reste fermée aux membres et aux visiteurs, et la migration est notée.
select 'poker sur Discord : '
  || case when position('casino_poker_mains' in pg_get_functiondef('public.casino_annonces_a_envoyer()'::regprocedure)) > 0
       and not has_function_privilege('authenticated', 'public.casino_annonces_a_envoyer()', 'execute')
       and not has_function_privilege('anon', 'public.casino_annonces_a_envoyer()', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version = '${VERSION}') = 1
     then 'dès le carré'
     else 'PAS INSTALLÉ' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-casino-poker-discord.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
