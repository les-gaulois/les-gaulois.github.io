/**
 * Écrit `.cache/a-coller-coffre-ferme.sql` (hors de Git) : la migration qui arrête le coffre du druide et rend la cagnotte à
 * ceux qui l'ont payée (20261121000400), dans une transaction, notée dans supabase_migrations.schema_migrations, avec une
 * dernière ligne qui dit ce qui a été rendu, et à combien de joueurs (docs/DIRECTION.md, « Le coffre du druide »). Depuis la
 * racine du dépôt : `npx tsx scripts/a-coller-coffre-ferme.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261121000400_coffre_ferme_mises_rendues";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();

const entete = `-- LE COFFRE DU DRUIDE S'ARRÊTE (19 novembre 2026), à coller en un seul fichier, AVANT de remettre le robot en ligne.
-- Le coffre se ferme : plus aucun essai, aucune lettre ni aucune mise. Chaque joueur récupère ce qu'il a payé dans la
-- manche en cours (mises et lettres achetées). Aucune prime n'est versée, aucun statère n'est créé.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il n'efface rien : manches, essais, lettres vendues et journal des statères restent.
-- Collé une seconde fois, il ne rend rien de plus.
-- La dernière ligne dit ce qui a été fait : « coffre du druide fermé : … statères rendus à … joueurs ».

begin;

-- La migration reprend la règle du mode GOD du marché qui vit : sans lui, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261119000100') then
    raise exception 'Il faut d''abord coller .cache/a-coller-marche-vivant.sql (migration 20261119000100).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261121000400', 'coffre_ferme_mises_rendues', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le coffre refuse-t-il une lettre, reste-t-il un essai en attente, la règle du mode GOD est-elle à jour, la
-- migration est-elle notée ? Puis ce qui a été rendu, et à combien de joueurs.
select case
  when (select not r.ouvert from internal.coffre_reglages r where r.id)
   and (public.coffre_indice('00000000000000000', 'controle') ->> 'error') = 'closed'
   and not exists (select 1 from internal.coffre_essais e where e.reponse is null and not e.annule)
   and (select p.prosrc like '%coffre_rendu%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'internal' and p.proname = 'village_god_mouvement')
   and exists (select 1 from supabase_migrations.schema_migrations where version = '20261121000400')
  then 'coffre du druide fermé : '
    || case when t.joueurs = 0 then 'rien à rendre'
            else t.stateres || ' statères rendus à ' || t.joueurs || case when t.joueurs = 1 then ' joueur' else ' joueurs' end end
    || case when t.reste > 0 then ' ; ' || t.reste || ' statères restent dans la cagnotte sans payeur retrouvé' else '' end
  else 'coffre du druide : PAS FERMÉ' end as controle
from (
  select coalesce(sum(v.montant), 0) as stateres, count(distinct v.user_id) as joueurs,
         (select r.cagnotte from internal.coffre_reglages r where r.id) as reste
  from internal.stateres_mouvements v
  where v.nature = 'coffre_rendu'
) t;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre-ferme.sql", texte);
console.log(`.cache/a-coller-coffre-ferme.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
