/**
 * Écrit `.cache/a-coller-duel-des-gaulois.sql` (hors de Git) : les deux migrations du duel des Gaulois, « Coup pour coup »
 * (20261122000100 et 20261122000200), à coller en un seul fichier, dans une transaction, notées dans
 * supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le duel des Gaulois »). À relancer depuis la racine du dépôt après
 * tout changement de la migration : `npx tsx scripts/a-coller-duel.ts`. N'envoie rien et ne lit que le dépôt. Pas de
 * String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double). `tests/unit/duel-serveur.test.ts` colle
 * ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const NOMS = ["20261122000100_duel_des_gaulois", "20261122000200_duel_boss_salon_corrections"] as const;
export const ATTENDU = "duel des Gaulois : installé, fermé";
export const FICHIER = ".cache/a-coller-duel-des-gaulois.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = NOMS.map((nom) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split("\r\n").join("\n").trimEnd()).join("\n\n");
  const entete = `-- LE DUEL DES GAULOIS, « Coup pour coup » (22 novembre 2026), à coller en un seul fichier.
-- Le cœur du duel de cartes de « Mon Gaulois » : les règles en SQL, la main de défense, les duels contre un membre et
-- contre le boss du jour (onze boss), les duels comptés et leurs pas du pass, la file des victoires et le salon des duels
-- pour Discord (Direction > Discord). Il reste FERMÉ :
-- seul le titulaire du don de statères (le pilote) le voit et le joue, jusqu'à ce qu'on l'ouvre.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient deux migrations, notées
-- comme appliquées : ${NOMS.join(".sql et ")}.sql. Il ajoute les tables et les fonctions du duel, et remplace sept
-- fonctions des salons du robot pour en permettre un de plus (« duels »). Il n'efface rien, ne retire ni ne change aucune
-- ligne, ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose le village,
-- ses familiers, ses bannières, le sentier, le don de statères et les salons du robot déjà installés : sinon, il s'arrête
-- sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.gaulois_inventaire') is null or to_regclass('internal.familiers') is null
     or to_regclass('internal.bannieres') is null or to_regclass('internal.sentier_gains') is null
     or to_regclass('internal.stateres_don_titulaire') is null or to_regclass('internal.village_god') is null
     or to_regclass('internal.discord_salons') is null or to_regprocedure('public.robot_discord_salons()') is null
     or to_regprocedure('internal.gaulois_montre(uuid)') is null or to_regprocedure('internal.sentier_saison_du(date)') is null
     or to_regprocedure('internal.member_pseudo(uuid)') is null then
    raise exception 'Le village, ses familiers, ses bannières, le sentier, le don de statères ou les salons du robot ne sont pas installés. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261122000100', 'duel_des_gaulois', array[]::text[]), ('20261122000200', 'duel_boss_salon_corrections', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les 273 cartes, les 11 boss, le salon des duels et les fonctions du duel sont là, et les deux migrations
-- sont notées ; puis l'interrupteur.
select 'duel des Gaulois : '
  || case when (select count(*) from internal.duel_cartes) = 273
       and to_regprocedure('public.jouer_manche_duel(bigint, integer, integer)') is not null
       and to_regprocedure('internal.duel_manche(integer[], integer[], integer[], integer[], integer[], integer[], integer, integer, integer)') is not null
       and (select count(*) from internal.duel_boss) = 11
       and public.robot_discord_salons() ? 'duels'
       and (select count(*) from supabase_migrations.schema_migrations where version in ('20261122000100', '20261122000200')) = 2
     then 'installé, ' || case when (select o.ouvert from internal.duel_ouvert o where o.id) then 'ouvert' else 'fermé' end
     else 'PAS INSTALLÉ' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-duel.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
