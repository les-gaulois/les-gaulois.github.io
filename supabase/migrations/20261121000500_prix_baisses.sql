-- Les prix baissés du 21 novembre 2026. Le pilote, devant une comparaison des prix avec ce que gagnent vraiment les membres
-- (« est-ce que c'est pas trop cher ? », puis, pour les familiers, « il y a beaucoup de familiers, alors impossible pour
-- quelqu'un de les collectionner ? ») : « baisse tout ». La comparaison (docs/DIRECTION.md, « Les prix baissés du 21
-- novembre ») : sur deux semaines, la moitié des membres actifs gagnait moins de 600 statères par semaine, le quart du haut
-- plus de 1 650, un sur dix plus de 3 400 ; un Gaulois unique demandait de 4 mois à près d'un an au joueur moyen, une
-- bannière légendaire 3 mois, et les 100 familiers plus de 6 ans.
--
-- Ce qui baisse, et seulement cela : ce que la comparaison montrait hors de portée. Les objets de la boutique (100 à 2 500),
-- la pochette surprise et la pochette de statères (200) ne changent pas.
-- 1. Les Gaulois uniques, à la boutique : 6 000, 8 000, 10 000, 12 500 et 15 000 statères au lieu de 11 500, 15 500, 20 000,
--    25 000 et 28 000 (internal.modeles_prix). Leur pochette : 1 600 au lieu de 3 000, mêmes chances et mêmes
--    remboursements (85 fois sur 100, 20 à 60 % du prix). À ces prix, elle reste un pari juste en moyenne : elle vaut 1 692
--    statères pour 1 600 (`valeurMoyenneDeLaPochette` de src/lib/village/modeles.ts, testé), comme elle en valait 3 249 pour
--    3 000.
-- 2. Les bannières de la boutique, et avec elles les finitions et les cadres de carte (qui coûtent le prix d'une bannière de
--    leur rareté) : le double du prix d'un objet de leur rareté au lieu du triple, soit 200, 500, 1 000, 2 000 et 5 000
--    statères aux prix d'aujourd'hui (internal.banniere_prix, remplacée, depuis la 20261115000900 : la même, avec 2 au lieu
--    de 3 ; elle suit toujours le réglage des prix de la Direction).
-- 3. La pochette des bannières : 1 000 statères au lieu de 1 500, le prix d'une bannière épique comme avant
--    (internal.bannieres_pochette_prix, remplacée, depuis la 20261116000700). Mêmes chances et mêmes remboursements : elle
--    vaut en moyenne 1 180 statères pour 1 000, comme elle en valait 1 770 pour 1 500.
-- 4. La pochette des familiers : 1 000 statères au lieu de 2 000. Le plus bas permis passe de 2 000 (règle du pilote du 15
--    novembre 2026, levée par lui ce jour) à 500, comme la pochette des Gaulois uniques : la contrainte du prix de
--    internal.familiers_pochette est remplacée par la même, avec 500.
--
-- Aucun statère n'est créé : seuls des prix baissent. Rien d'autre ne change : ni les chances, ni la règle « jamais deux fois
-- le même », ni les objets, ni la revente (bannières, cartes, cadres, Gaulois uniques et familiers ne se revendent pas). Un
-- membre qui avait la page ouverte voit l'ancien prix : son achat est refusé (`prix_change`) sans rien débiter, et la page
-- relue montre le nouveau. Une pochette gagnée à la loterie s'ouvre au prix du jour, crédité puis débité.
--
-- Deux fonctions remplacées, les cinq prix des Gaulois uniques et les prix de deux pochettes changés, une contrainte
-- remplacée. Aucune donnée effacée. Rejouée, elle ne change plus rien.

/* ---------- 1. Les Gaulois uniques ---------- */

-- PRIX_MODELE_PAR_RARETE de src/lib/village/contrat.ts (un test compare).
update internal.modeles_prix p
set prix = v.prix, maj_le = now()
from (values ('commun', 6000), ('peu-commun', 8000), ('epique', 10000), ('mystique', 12500), ('legendaire', 15000)) as v (rarete, prix)
where p.rarete = v.rarete and p.prix <> v.prix;

update internal.modeles_pochette p set prix = 1600, maj_le = now() where p.id and p.prix <> 1600;

/* ---------- 2. Les bannières, les finitions et les cadres de carte ---------- */

-- Le prix d'une bannière de la boutique, d'une finition ou d'un cadre de carte : le double du prix d'un objet de sa rareté
-- (le triple jusqu'au 21 novembre 2026). Suit le réglage des prix de la Direction.
create or replace function internal.banniere_prix(p_rarete text) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select 2 * p.prix from internal.village_prix p where p.rarete = p_rarete
$$;

revoke all on function internal.banniere_prix(text) from public, anon, authenticated;

/* ---------- 3. La pochette des bannières ---------- */

-- Le prix de la pochette des bannières : 1 000 statères, le prix d'une bannière épique de la boutique (1 500 jusqu'au 21
-- novembre 2026).
create or replace function internal.bannieres_pochette_prix() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 1000
$$;

revoke all on function internal.bannieres_pochette_prix() from public, anon, authenticated;

/* ---------- 4. La pochette des familiers ---------- */

-- La contrainte du prix : 500 statères au moins (2 000 jusqu'au 21 novembre 2026), comme la pochette des Gaulois uniques.
alter table internal.familiers_pochette drop constraint if exists familiers_pochette_prix_check;
alter table internal.familiers_pochette add constraint familiers_pochette_prix_check check (prix between 500 and 1000000);

update internal.familiers_pochette p set prix = 1000, maj_le = now() where p.id and p.prix <> 1000;
