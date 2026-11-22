/**
 * Écrit `.cache/a-coller-duel-saison.sql` (hors de Git) : la migration du tableau des duellistes et de la saison du duel
 * (20261122002000), à coller en un seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec
 * une dernière ligne de contrôle qui dit quelle version est installée (docs/DIRECTION.md, « Le tableau des duellistes »). À
 * relancer depuis la racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-duel-saison.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar
 * double). `tests/unit/duel-tableau.test.ts` colle ce fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const NOM = "20261122002000_duel_tableau_et_saison";
/** La version de ce fichier, écrite dans la ligne de contrôle : le pilote voit laquelle il a collée. */
export const VERSION = "2";
export const ATTENDU = `tableau des duellistes : installé (version ${VERSION})`;
export const FICHIER = ".cache/a-coller-duel-saison.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
  const entete = `-- LE TABLEAU DES DUELLISTES ET LA SAISON DU DUEL (22 novembre 2026), version ${VERSION}, à coller en un seul fichier.
-- Le tableau de la semaine (du mardi 21 h 30 au mardi 21 h 30) et celui de la saison du pass, faits des duels qui comptent ;
-- l'insigne du premier de chaque semaine, donné le mardi à 21 h 30 ; à la fin de la saison (le mardi 29 décembre 2026 à
-- 21 h 30 pour la saison 1), la cagnotte des salles partagée entre les trois premiers, 50, 30 et 20 pour cent. Aucun
-- statère n'est créé : chaque part sort de la cagnotte et entre au journal des statères, dans la même transaction.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il ajoute trois tables, les fonctions du tableau et une tâche pg_cron de 5 minutes ; il remplace
-- le déclencheur du mode GOD sur le journal des statères (pour que la part d'une saison reste un vrai gain). Il n'efface
-- rien, ne retire ni ne change aucune ligne, ne crée aucun statère. Collé une seconde fois, il ne change rien. Il suppose
-- les salles du duel déjà installées (« salles du duel : installées (version 1) ») : sinon, il s'arrête sans rien changer ;
-- de même si une migration plus récente a déjà remplacé le déclencheur du mode GOD.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
declare
  v_def text;
begin
  if to_regclass('internal.duel_parties') is null or to_regclass('internal.duel_matchs') is null
     or to_regclass('internal.duel_cagnottes') is null or to_regclass('internal.duel_cagnotte_mouvements') is null
     or to_regprocedure('internal.duel_saison_de_la_cagnotte(date)') is null or to_regprocedure('internal.duel_joueur()') is null
     or to_regprocedure('internal.duel_gaulois_json(uuid)') is null or to_regprocedure('internal.duel_jour(timestamptz)') is null
     or to_regclass('internal.sentier_saisons') is null or to_regclass('internal.village_god') is null
     or to_regprocedure('internal.village_god_mouvement()') is null then
    raise exception 'Les salles du duel (ou le duel, le pass, le mode GOD) ne sont pas installées. Rien n''a changé.';
  end if;
  v_def := pg_get_functiondef('internal.village_god_mouvement()'::regprocedure);
  -- Le déclencheur du mode GOD doit être celui des salles (avec 'duel_gain') ou celui-ci ; une version plus récente, qui
  -- connaît plus de natures, ne doit pas être remplacée par celle-ci (20 mots entre apostrophes dans la sienne, réglages compris).
  if position('duel_gain' in v_def) = 0 or (select count(*) from regexp_matches(v_def, '''[a-z_]+''', 'g')) > 20 then
    raise exception 'Le déclencheur du mode GOD n''est pas celui que ce fichier attend (une migration plus récente ?). Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261122002000', 'duel_tableau_et_saison', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les fonctions du tableau, le partage, le réveil, le mode GOD qui laisse passer la part d'une saison et la
-- migration notée.
select 'tableau des duellistes : '
  || case when to_regprocedure('public.get_tableau_duel()') is not null
       and to_regprocedure('public.get_mes_insignes_duel()') is not null
       and to_regprocedure('internal.duel_partager(text)') is not null
       and to_regprocedure('internal.duel_tableau_reveil()') is not null
       and to_regclass('internal.duel_semaines') is not null
       and to_regclass('internal.duel_saison_places') is not null
       and position('duel_saison' in pg_get_functiondef('internal.village_god_mouvement()'::regprocedure)) > 0
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261122002000')
     then 'installé (version ${VERSION})'
     else 'PAS INSTALLÉ' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1] && /a-coller-duel-saison\.ts$/.test(process.argv[1].split("\\").join("/"))) {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(FICHIER, texteAColler());
  console.log(`Écrit : ${FICHIER} (dernière ligne attendue : « ${ATTENDU} »)`);
}
