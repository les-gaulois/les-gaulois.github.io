/**
 * Écrit `.cache/a-coller-duel-salles.sql` (hors de Git) : la migration des salles en direct du duel des Gaulois
 * (20261122001000), à coller en un seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec
 * une dernière ligne de contrôle qui dit quelle version est installée (docs/DIRECTION.md, « Les salles du duel »). À
 * relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-duel-salles.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar
 * double). `tests/unit/duel-salles.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const NOM = "20261122001000_duel_salles_en_direct";
/** La version de ce fichier, écrite dans la ligne de contrôle : le pilote voit laquelle il a collée. */
export const VERSION = "1";
export const ATTENDU = `salles du duel : installées (version ${VERSION}), duel fermé`;
export const FICHIER = ".cache/a-coller-duel-salles.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  const entete = `-- LES SALLES DU DUEL DES GAULOIS, en direct, avec mise (22 novembre 2026), version ${VERSION}, à coller en un seul fichier.
-- Six salles (25, 50, 100, 250, 500 et 1 000 statères) où deux membres jouent l'un contre l'autre, 30 secondes par
-- manche ; le gagnant reçoit les deux mises moins 10 %, qui vont à la cagnotte de la saison ; égalité : chacun reprend sa
-- mise. Aucun statère n'est créé. Le duel reste FERMÉ : tant qu'il l'est, seul le titulaire (le pilote) voit les salles,
-- et la machine joue en face de lui, sans mise.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il ajoute les tables et les fonctions des salles et une tâche pg_cron d'une minute ; il
-- remplace la file des victoires du duel (pour y ajouter celles des salles), le déclencheur du mode GOD sur le journal des
-- statères et la sauvegarde (version 13). Il n'efface rien, ne retire ni ne change aucune ligne, ne crée aucun statère.
-- Collé une seconde fois, il ne change rien. Il suppose le duel des Gaulois déjà installé (« duel des Gaulois : installé,
-- fermé ») : sinon, il s'arrête sans rien changer ; de même si une migration plus récente l'a déjà dépassé.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.duel_parties') is null or to_regclass('internal.duel_parties_id_seq') is null
     or to_regclass('internal.duel_annonces') is null or to_regclass('internal.duel_ouvert') is null
     or to_regprocedure('internal.duel_manche(integer[], integer[], integer[], integer[], integer[], integer[], integer, integer, integer)') is null
     or to_regprocedure('internal.duel_choisir(integer[], integer[], integer[], integer[], integer[], integer[], integer, double precision, double precision, integer)') is null
     or to_regprocedure('internal.duel_preparer(text[], jsonb)') is null or to_regprocedure('internal.duel_joueur()') is null
     or to_regclass('internal.marche_demandes') is null or to_regclass('internal.village_god') is null
     or to_regprocedure('internal.village_debiter(uuid, text, integer, text)') is null
     or to_regprocedure('internal.sentier_saison_du(date)') is null
     or to_regclass('internal.duel_niveaux') is null then
    raise exception 'Le duel des Gaulois (ou le village, son marché, le mode GOD, le sentier) n''est pas installé. Rien n''a changé.';
  end if;
  -- La seconde migration du duel (les boss et les niveaux : la machine de l'essai joue au niveau du guerrier).
  if not exists (select 1 from internal.duel_niveaux n where n.niveau = 'guerrier') or not exists (select 1 from internal.duel_boss) then
    raise exception 'La seconde partie du duel des Gaulois (boss et niveaux) n''est pas installée. Rien n''a changé.';
  end if;
  -- Une migration plus récente a déjà remplacé la sauvegarde : recoller ce fichier la ferait revenir en arrière.
  if to_regprocedure('public.export_site()') is not null and coalesce((public.export_site() ->> 'version')::integer, 0) > 13 then
    raise exception 'Une migration plus récente est déjà installée : ce fichier ne se recolle plus. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261122001000', 'duel_salles_en_direct', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les fonctions des salles, la file des victoires qui les lit, la sauvegarde en version 13 et la migration
-- notée ; puis l'interrupteur du duel.
select 'salles du duel : '
  || case when to_regprocedure('public.poser_carte_salle(bigint, integer, integer)') is not null
       and to_regprocedure('public.entrer_salle_duel(integer, jsonb)') is not null
       and to_regprocedure('public.get_salles_duel()') is not null
       and to_regclass('internal.duel_cagnotte_mouvements') is not null
       and position('duel_salle_annonces' in pg_get_functiondef('public.duel_annonces_a_envoyer()'::regprocedure)) > 0
       and position('duel_mise' in pg_get_functiondef('internal.village_god_mouvement()'::regprocedure)) > 0
       and (public.export_site() ->> 'version')::integer = 13
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261122001000')
     then 'installées (version ${VERSION}), duel ' || case when (select o.ouvert from internal.duel_ouvert o where o.id) then 'ouvert' else 'fermé' end
     else 'PAS INSTALLÉES' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-duel-salles.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
